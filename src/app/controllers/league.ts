import { Request, Response } from 'express';
import LeagueService from '../models/league';
import { prisma } from '../../prisma';
import { normalizeEventFormat, normalizeScoringFormat } from '../utils/event-mode';
import {
  BILLING_MIN_GOLFERS,
  getAllocatedGolfersForAdmin,
  getBillingState,
  getLeagueBillableGolfers,
  getPendingLeagueBypassCodeId,
  isBillingCapacityCovered,
} from '../utils/billing';
import { writeAuditLog } from '../utils/audit';
import { generateLeagueAccessCode } from './auth';
import { localDateKey } from '../utils/time-zone';
import { normalizeGender } from '../utils/tee-rating';
import { lockAdminBilling } from '../services/billingLock';
import { attachPendingPaymentBypassToLeague } from '../services/paymentBypassCode';
import { normalizeLeagueHoleFormat } from '../utils/league-hole-format';
import { calculateSeasonSkinLeaderboards } from '../utils/season-skins';
import { calculatePlayerResults } from '../utils/player-results';
import { getLeagueRoundProgress } from '../utils/league-round-progress';

const getMissingRequiredPlayerFields = (player: any) => {
  const missing: string[] = [];
  const handicap =
    player?.handicap !== undefined && player?.handicap !== null && String(player.handicap).trim() !== ''
      ? Number(player.handicap)
      : NaN;

  if (!String(player?.firstName ?? '').trim()) missing.push('firstName');
  if (!String(player?.lastName ?? '').trim()) missing.push('lastName');
  try {
    normalizeGender(player?.gender);
  } catch {
    missing.push('gender');
  }
  const type = String(player?.type || 'player').trim().toLowerCase();
  if (!['player', 'sub', 'substitute', 'captain'].includes(type)) missing.push('type');
  if (!Number.isFinite(handicap) || handicap < -10 || handicap > 54) missing.push('handicap');

  return missing;
};

class LeagueController {
  static createUniqueViewerAccessCode = async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = generateLeagueAccessCode();
      const existing = await prisma.league.findUnique({ where: { viewerAccessCode: code } });
      if (!existing) return code;
    }

    throw new Error('Unable to generate league access code.');
  };

  static normalizeLeaguePayload = (payload: any) => {
    const normalizedType = String(payload?.type || '').toLowerCase();
    const normalizedFormat = payload?.format ? String(payload.format).toLowerCase() : null;
    const holeFormat = normalizeLeagueHoleFormat(payload?.holeFormat);

    if (!['season', 'tournament'].includes(normalizedType)) {
      throw new Error('League type must be either "season" or "tournament".');
    }

    if (normalizedType === 'season' && !['individual', 'team'].includes(normalizedFormat || '')) {
      throw new Error('Season leagues require format to be either "individual" or "team".');
    }

    const requiredTextFields = [
      ['name', payload?.name],
      ['contactFirstName', payload?.contactFirstName],
      ['contactLastName', payload?.contactLastName],
      ['contactEmail', payload?.contactEmail],
    ] as const;
    const missingField = requiredTextFields.find(([, value]) => !String(value || '').trim());
    if (missingField) {
      throw new Error(`${missingField[0]} is required.`);
    }

    const numPlayers = Number(payload?.numPlayers);
    if (!Number.isInteger(numPlayers) || numPlayers < 1) {
      throw new Error('League player capacity must be a positive whole number.');
    }

    return {
      name: String(payload.name).trim(),
      description: payload.description ? String(payload.description).trim() : null,
      type: normalizedType,
      holeFormat,
      format: normalizedType === 'season' ? normalizedFormat : null,
      numPlayers,
      startDate: new Date(payload.startDate),
      endDate: new Date(payload.endDate),
      contactFirstName: String(payload.contactFirstName).trim(),
      contactLastName: String(payload.contactLastName).trim(),
      contactEmail: String(payload.contactEmail).trim().toLowerCase(),
      contactPhone: payload.contactPhone ? String(payload.contactPhone).trim() : null,
    };
  };

  static validateLeagueDates = (payload: any) => {
    if (!payload?.startDate || !payload?.endDate) return;

    const startDate = new Date(payload.startDate);
    const endDate = new Date(payload.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new Error('League dates are invalid.');
    }
    if (endDate < startDate) {
      throw new Error('End date must be after the start date.');
    }

    const maxEndDate = new Date(startDate);
    maxEndDate.setFullYear(maxEndDate.getFullYear() + 1);
    if (endDate > maxEndDate) {
      throw new Error('End date cannot be more than one year after the start date.');
    }
  };

  static getLeagueInfo = async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.leagueId);
      const league = await LeagueService.findById(id);

      const lastEvent = await prisma.event.findFirst({
        where: { leagueId: id, isComplete: true, isDeleted: false, deletedAt: null },
        include: {
          rounds: {
            include: {
              player: true,
            },
          },
        },
        orderBy: { startsAt: 'desc' },
      });

      const result = {
        league,
        lastEvent: {
          id: lastEvent?.id,
          name: lastEvent?.name,
          startsAt: lastEvent?.startsAt,
          timeZone: lastEvent?.timeZone,
          course: lastEvent?.courseId,
          stats: calculateStats(lastEvent?.rounds || []),
          lowNet: calculateLowNet(lastEvent?.rounds || []),
          lowGross: calculateLowGross(lastEvent?.rounds || []),
        },
      };

      res.status(200).send(result);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static getLeague = async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);

      const league = await prisma.league.findFirst({
        where: { id, deletedAt: null },
        include: {
          events: {
            where: { isDeleted: false, deletedAt: null },
            include: {
              course: true,
              tee: true,
            },
          },
          players: {
            where: { deletedAt: null },
          },
          teams: {
            where: { deletedAt: null },
            include: {
              players: {
                where: { deletedAt: null },
              },
            },
          },
          scoringPeriods: {
            orderBy: { position: 'asc' },
          },
        },
      });

      if (!league) {
        res.status(404).send('League not found');
        return;
      }

      const recordedRoundCount = await prisma.round.count({
        where: {
          event: { leagueId: id, isDeleted: false, deletedAt: null },
          deletedAt: null,
          scores: { some: {} },
        },
      });
      const leagueWithScoreState = {
        ...league,
        hasRecordedScores: recordedRoundCount > 0,
      };

      const role = String((req as any).user?.role || '').toUpperCase();
      const canSeeAccessCode =
        role === 'SUPER' || Number(league.adminId) === Number(req.session.userId || 0);

      if (canSeeAccessCode) {
        res.status(200).send(leagueWithScoreState);
        return;
      }

      const { viewerAccessCode: _viewerAccessCode, ...safeLeague } = leagueWithScoreState;
      res.status(200).send(safeLeague);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static getAllLeagues = async (req: Request, res: Response) => {
    try {
      const leagues = await LeagueService.findAll();
      res.status(200).send(leagues);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static rotateViewerAccessCode = async (req: Request, res: Response) => {
    try {
      const leagueId = Number(req.params.leagueId);
      const viewerAccessCode = await LeagueController.createUniqueViewerAccessCode();
      const league = await prisma.league.update({
        where: { id: leagueId },
        data: { viewerAccessCode },
        select: { id: true, viewerAccessCode: true },
      });

      await writeAuditLog({
        userId: Number(req.session.userId),
        leagueId,
        entity: 'league',
        entityId: leagueId,
        action: 'rotate-viewer-access-code',
        summary: 'Rotated the view-only league access code.',
      });

      return res.status(200).json(league);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: 'Unable to rotate the league access code' });
    }
  };

  static getAdminLeagues = async (req: Request, res: Response) => {
    try {
      const leagues = await prisma.league.findMany({
        where: { adminId: req.session.userId, deletedAt: null },
        select: {
          id: true,
          name: true,
        },
      });
      res.status(200).send(leagues);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static getAdminLeague = async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);

      const league = await prisma.league.findFirst({
        where: { id, deletedAt: null },
        include: {
          players: {
            where: { deletedAt: null },
          },
          teams: {
            where: { deletedAt: null },
            include: {
              players: {
                where: { deletedAt: null },
              },
            },
          },
          events: {
            where: { isDeleted: false, deletedAt: null },
            include: {
              course: true,
              flights: {
                include: {
                  teams: {
                    include: {
                      team: {
                        include: {
                          players: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!league) {
        res.status(404).send('League not found');
        return;
      }

      res.status(200).send(league);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static getLeagues = async (req: Request, res: Response) => {
    try {
      const userId: any = req.session.userId;
      const leagueAccessIds = Array.isArray(req.session.leagueAccess?.leagueIds)
        ? req.session.leagueAccess.leagueIds.map(Number).filter(Boolean)
        : [];
      const leagueAccessCodes = req.session.leagueAccess?.accessCodes || {};
      const validLeagueAccess = leagueAccessIds
        .map((id) => ({ id, code: leagueAccessCodes[String(id)] }))
        .filter((entry): entry is { id: number; code: string } => Boolean(entry.code));

      if (!userId && validLeagueAccess.length === 0) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      const playerIds = userId
        ? await prisma.player.findMany({
            where: { userId, deletedAt: null },
            select: { id: true },
          })
        : [];

      const playerIdValues = playerIds.map((p: { id: number }) => p.id);

      const leagues = await prisma.league.findMany({
        where: {
          deletedAt: null,
          OR: [
            ...validLeagueAccess.map((entry) => ({
              id: entry.id,
              viewerAccessCode: entry.code,
            })),
            { players: { some: { id: { in: playerIdValues } } } },
            {
              teams: {
                some: {
                  players: {
                    some: { id: { in: playerIdValues } },
                  },
                },
              },
            },
          ],
        },
        include: {
          _count: {
            select: {
              players: { where: { deletedAt: null } },
              events: { where: { isDeleted: false, deletedAt: null } },
            },
          },
          events: {
            where: { isDeleted: false, deletedAt: null },
            select: { status: true, type: true, isComplete: true },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
      });

      const upcomingSchedule = await prisma.flight.findMany({
        where: {
          players: {
            some: {
              playerId: { in: playerIdValues },
            },
          },
        },
        include: {
          event: true,
        },
        orderBy: {
          event: {
            startsAt: 'asc',
          },
        },
        take: 5,
      });

      const safeLeagues = leagues.map(
        ({ viewerAccessCode: _viewerAccessCode, events, ...league }) => ({
          ...league,
          ...getLeagueRoundProgress(events),
        }),
      );

      res.status(200).send({ leagues: safeLeagues, upcomingSchedule });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static createLeague = async (req: Request, res: Response) => {
    try {
      const { players = [], teams = [], ...leagueData } = req.body;
      const adminId = req.session.userId;

      if (!adminId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      const adminUser = await prisma.user.findUnique({
        where: { id: adminId },
        select: { metadata: true },
      });

      if (!adminUser) {
        return res.status(404).json({ message: 'User not found' });
      }

      const billableGolfers = getLeagueBillableGolfers(players);
      const invalidPlayerIndex = Array.isArray(players)
        ? players.findIndex((player: any) => getMissingRequiredPlayerFields(player).length > 0)
        : -1;
      if (invalidPlayerIndex >= 0) {
        const missingFields = getMissingRequiredPlayerFields(players[invalidPlayerIndex]);
        return res.status(400).json({
          message: `Player ${invalidPlayerIndex + 1} is missing required fields: ${missingFields.join(', ')}`,
        });
      }
      const playerEmails = players
        .map((player: any) => String(player?.email || '').trim().toLowerCase())
        .filter(Boolean);
      if (new Set(playerEmails).size !== playerEmails.length) {
        return res.status(409).json({
          message: 'Every player email in a league must be unique.',
        });
      }

      const normalizedLeagueData = LeagueController.normalizeLeaguePayload({
        ...leagueData,
        // numPlayers is the paid regular-player capacity, not total roster size.
        numPlayers: billableGolfers,
      });
      LeagueController.validateLeagueDates(normalizedLeagueData);

      if (normalizedLeagueData.type === 'season' && normalizedLeagueData.format === 'team') {
        const playerIds = new Set(players.map((player: any) => Number(player.id)));
        const assignedPlayerIds = new Set<number>();
        for (const team of teams) {
          if (!String(team?.name || '').trim()) {
            return res.status(400).json({ message: 'Every team must have a name.' });
          }
          for (const rawPlayerId of team?.players || []) {
            const playerId = Number(rawPlayerId);
            if (!playerIds.has(playerId)) {
              return res.status(400).json({ message: 'A team contains an invalid player.' });
            }
            if (assignedPlayerIds.has(playerId)) {
              return res.status(400).json({ message: 'A player cannot belong to multiple teams.' });
            }
            assignedPlayerIds.add(playerId);
          }
        }
      }
      const allocatedGolfers = await getAllocatedGolfersForAdmin(adminId);
      const billingState = getBillingState(adminUser.metadata, allocatedGolfers);

      const hasPendingLeagueBypass = billingState.hasPendingLeagueBypass;
      if (!billingState.hasCompletedRegistration && !hasPendingLeagueBypass) {
        return res.status(402).json({
          message: `Complete registration payment for at least ${billingState.minimumGolfers} golfers before creating a league.`,
          billing: billingState,
        });
      }

      if (
        !hasPendingLeagueBypass &&
        !isBillingCapacityCovered(billingState, allocatedGolfers + billableGolfers)
      ) {
        return res.status(402).json({
          message: `This league requires payment for ${billableGolfers} golfers.`,
          billing: billingState,
          requiredGolfers: billableGolfers,
          additionalGolfersRequired:
            allocatedGolfers + billableGolfers - billingState.includedGolfers,
        });
      }

      const viewerAccessCode = await LeagueController.createUniqueViewerAccessCode();
      const newLeague = await prisma.$transaction(async (tx) => {
        await lockAdminBilling(tx, adminId);
        const lockedAdmin = await tx.user.findFirst({
          where: { id: adminId, deletedAt: null },
          select: { metadata: true },
        });
        if (!lockedAdmin) throw new Error('User not found');
        const lockedAllocatedGolfers = await getAllocatedGolfersForAdmin(adminId, undefined, tx);
        const lockedBillingState = getBillingState(
          lockedAdmin.metadata,
          lockedAllocatedGolfers,
        );
        const pendingLeagueBypassCodeId = getPendingLeagueBypassCodeId(lockedAdmin.metadata);
        const useLeagueBypass = pendingLeagueBypassCodeId !== null;
        if (!lockedBillingState.hasCompletedRegistration && !useLeagueBypass) {
          throw new Error('Registration payment is required.');
        }
        if (
          !useLeagueBypass &&
          !isBillingCapacityCovered(
            lockedBillingState,
            lockedAllocatedGolfers + billableGolfers,
          )
        ) {
          throw new Error(`Payment is required for ${billableGolfers} golfers.`);
        }

        const createdLeague = await tx.league.create({
          data: {
            ...normalizedLeagueData,
            adminId,
            viewerAccessCode,
            billingExempt: useLeagueBypass,
          },
        });

        if (pendingLeagueBypassCodeId) {
          const attached = await attachPendingPaymentBypassToLeague(tx, {
            userId: adminId,
            leagueId: createdLeague.id,
            userMetadata: lockedAdmin.metadata,
          });
          if (!attached) {
            throw new Error(
              'Payment is required because the one-time access code is no longer available.',
            );
          }
        }

        await tx.league_onboarding.create({ data: { leagueId: createdLeague.id } });

        if (players.length > 0) {
          const playerIdMap = new Map<number, number>();

          for (const player of players) {
            const createdPlayer = await tx.player.create({
              data: {
                firstName: String(player.firstName).trim(),
                lastName: String(player.lastName).trim(),
                email: String(player.email || '').trim().toLowerCase() || null,
                phone: player.phone ? String(player.phone).trim() : null,
                gender: normalizeGender(player.gender),
                type:
                  String(player.type || 'player').trim().toLowerCase() === 'sub'
                    ? 'substitute'
                    : String(player.type || 'player').trim().toLowerCase(),
                handicap: Number(player.handicap),
                startingHandicap: Number(player.handicap),
                seasonPoints: 0,
                seasonRank: null,
                leagueId: createdLeague.id,
              },
            });

            if (player?.id !== undefined && player?.id !== null) {
              playerIdMap.set(Number(player.id), createdPlayer.id);
            }
          }

          if (normalizedLeagueData.type === 'season' && normalizedLeagueData.format === 'team') {
            for (const team of teams) {
              const teamName = String(team?.name || '').trim();
              if (!teamName) throw new Error('Team name is required.');

              const createdTeam = await tx.team.create({
                data: {
                  name: teamName,
                  leagueId: createdLeague.id,
                  seasonPoints: 0,
                  seasonRank: null,
                },
              });

              const mappedPlayerIds = (team.players || [])
                .map((id: any) => playerIdMap.get(Number(id)))
                .filter(Boolean) as number[];

              if (mappedPlayerIds.length > 0) {
                await tx.player.updateMany({
                  where: {
                    leagueId: createdLeague.id,
                    id: { in: mappedPlayerIds },
                  },
                  data: { teamId: createdTeam.id },
                });
              }
            }
          }
        }

        return createdLeague;
      });

      await writeAuditLog({
        userId: adminId,
        leagueId: newLeague.id,
        entity: 'league',
        entityId: newLeague.id,
        action: 'create',
        summary: `Created league ${newLeague.name}.`,
      });

      res.status(201).send(newLeague);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Internal server error';
      const paymentRequired = message.toLowerCase().includes('payment is required');
      const status = paymentRequired
        ? 402
        : message.includes('League type') ||
        message.includes('League hole format') ||
        message.includes('Season leagues require format') ||
        message.includes('is required') ||
        message.includes('player capacity') ||
        message.includes('League dates are invalid') ||
        message.includes('End date')
          ? 400
          : 500;
      res.status(status).json({ message });
    }
  };

  static updateLeague = async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const existingLeague = await prisma.league.findFirst({
        where: { id, deletedAt: null },
      });

      if (!existingLeague) {
        res.status(404).send('League not found');
        return;
      }

      const nextNumPlayers = Number(req.body?.numPlayers ?? existingLeague.numPlayers);
      const league = LeagueController.normalizeLeaguePayload({
        ...existingLeague,
        ...req.body,
        numPlayers: nextNumPlayers,
      });
      LeagueController.validateLeagueDates(league);

      const [activePlayerCount, activeTeamCount, activeEvents, recordedRoundCount] = await Promise.all([
        prisma.player.count({ where: { leagueId: id, type: 'player', deletedAt: null } }),
        prisma.team.count({ where: { leagueId: id, deletedAt: null } }),
        prisma.event.findMany({
          where: { leagueId: id, isDeleted: false, deletedAt: null },
          select: { id: true, startsAt: true, timeZone: true },
        }),
        prisma.round.count({
          where: {
            event: { leagueId: id, isDeleted: false, deletedAt: null },
            deletedAt: null,
            scores: { some: {} },
          },
        }),
      ]);

      if (nextNumPlayers < activePlayerCount) {
        return res.status(409).json({
          message: `Player capacity cannot be below the ${activePlayerCount} active players in this league.`,
        });
      }

      const structureChanged =
        league.type !== existingLeague.type ||
        league.format !== existingLeague.format ||
        league.holeFormat !== existingLeague.holeFormat;
      const datesChanged =
        league.startDate.getTime() !== existingLeague.startDate.getTime() ||
        league.endDate.getTime() !== existingLeague.endDate.getTime();
      if (datesChanged) {
        return res.status(409).json({
          message: 'League start and end dates cannot change after the league has been created.',
        });
      }
      if (structureChanged && recordedRoundCount > 0) {
        return res.status(409).json({
          message: 'League type, season format, and holes and handicap settings cannot change after scores have been recorded.',
        });
      }
      if (structureChanged && activeTeamCount > 0 && league.format !== 'team') {
        return res.status(409).json({
          message: 'Remove active teams before changing away from a team league.',
        });
      }

      const leagueStartKey = league.startDate.toISOString().slice(0, 10);
      const leagueEndKey = league.endDate.toISOString().slice(0, 10);
      const outsideDateRange = activeEvents.some((event) => {
        const eventDateKey = localDateKey(event.startsAt, event.timeZone);
        return eventDateKey < leagueStartKey || eventDateKey > leagueEndKey;
      });
      if (outsideDateRange) {
        return res.status(409).json({
          message: 'League dates must continue to include every existing event.',
        });
      }

      const adminUser = await prisma.user.findUnique({
        where: { id: existingLeague.adminId },
        select: { metadata: true },
      });
      const allocatedGolfers = await getAllocatedGolfersForAdmin(existingLeague.adminId, id);
      const billingState = getBillingState(adminUser?.metadata, allocatedGolfers);

      const billableGolfers = Math.max(BILLING_MIN_GOLFERS, nextNumPlayers);
      if (
        !existingLeague.billingExempt &&
        !isBillingCapacityCovered(billingState, allocatedGolfers + billableGolfers)
      ) {
        return res.status(402).json({
          message: `This change requires payment for ${billableGolfers} golfers in this league.`,
          billing: billingState,
          requiredGolfers: billableGolfers,
          additionalGolfersRequired:
            allocatedGolfers + billableGolfers - billingState.includedGolfers,
        });
      }

      const updatedLeague = await prisma.$transaction(async (tx) => {
        await lockAdminBilling(tx, existingLeague.adminId);
        const [lockedAdmin, lockedAllocatedGolfers] = await Promise.all([
          tx.user.findFirst({
            where: { id: existingLeague.adminId, deletedAt: null },
            select: { metadata: true },
          }),
          getAllocatedGolfersForAdmin(existingLeague.adminId, id, tx),
        ]);
        const lockedBillingState = getBillingState(
          lockedAdmin?.metadata,
          lockedAllocatedGolfers,
        );
        if (
          !existingLeague.billingExempt &&
          !isBillingCapacityCovered(
            lockedBillingState,
            lockedAllocatedGolfers + billableGolfers,
          )
        ) {
          throw new Error('Payment is required for this capacity change.');
        }

        return tx.league.update({ where: { id }, data: league });
      });

      if (!updatedLeague) {
        res.status(404).send('League not found');
        return;
      }

      res.status(200).send(updatedLeague);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Internal server error';
      const status = message.toLowerCase().includes('payment is required')
        ? 402
        : message.includes('League type') ||
        message.includes('League hole format') ||
        message.includes('Season leagues require format') ||
        message.includes('is required') ||
        message.includes('player capacity') ||
        message.includes('League dates are invalid') ||
        message.includes('End date')
          ? 400
          : 500;
      res.status(status).json({ message });
    }
  };

  static deleteLeague = async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const completedEvent = await prisma.event.findFirst({
        where: {
          leagueId: id,
          isDeleted: false,
          deletedAt: null,
          OR: [{ isComplete: true }, { status: 'completed' }, { rounds: { some: {} } }],
        },
        select: { id: true },
      });
      if (completedEvent) {
        return res.status(409).json({
          message: 'A league with completed scoring cannot be deleted or reused.',
        });
      }
      await LeagueService.delete(id);
      res.status(204).json('League deleted');
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static transferLeagueOwnership = async (req: Request, res: Response) => {
    try {
      const leagueId = Number(req.params.leagueId);
      const newAdminEmail = String(req.body?.newAdminEmail || '').trim().toLowerCase();
      if (!newAdminEmail) {
        return res.status(400).json({ message: 'New admin email is required.' });
      }

      const result = await prisma.$transaction(async (tx) => {
        const league = await tx.league.findFirst({
          where: { id: leagueId, deletedAt: null },
          select: {
            id: true,
            name: true,
            adminId: true,
            numPlayers: true,
            billingExempt: true,
          },
        });
        if (!league) throw new Error('League not found');

        const nextAdmin = await tx.user.findFirst({
          where: { email: newAdminEmail, deletedAt: null },
          select: { id: true, email: true, role: true, metadata: true },
        });
        if (!nextAdmin || !['ADMIN', 'SUPER'].includes(String(nextAdmin.role).toUpperCase())) {
          throw new Error('The new owner must have an active admin account.');
        }
        if (nextAdmin.id === league.adminId) return { league, nextAdmin };

        for (const adminId of [league.adminId, nextAdmin.id].sort((a, b) => a - b)) {
          await lockAdminBilling(tx, adminId);
        }

        if (!league.billingExempt && String(nextAdmin.role).toUpperCase() !== 'SUPER') {
          const allocatedGolfers = await getAllocatedGolfersForAdmin(
            nextAdmin.id,
            undefined,
            tx,
          );
          const billingState = getBillingState(nextAdmin.metadata, allocatedGolfers);
          if (!isBillingCapacityCovered(billingState, allocatedGolfers + league.numPlayers)) {
            throw new Error(
              `The new owner needs paid capacity for ${league.numPlayers} golfers before this league can be transferred.`,
            );
          }
        }

        const updatedLeague = await tx.league.update({
          where: { id: league.id },
          data: { adminId: nextAdmin.id },
          select: { id: true, name: true, adminId: true, numPlayers: true },
        });
        return { league: updatedLeague, nextAdmin };
      });

      await writeAuditLog({
        userId: req.session.userId ?? null,
        leagueId,
        entity: 'league',
        entityId: leagueId,
        action: 'transfer_ownership',
        summary: `Transferred ${result.league.name} to ${result.nextAdmin.email}.`,
        metadata: { newAdminId: result.nextAdmin.id },
      });

      return res.status(200).json(result.league);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      if (message === 'League not found') return res.status(404).json({ message });
      if (message.includes('active admin account')) return res.status(400).json({ message });
      if (message.includes('paid capacity')) return res.status(402).json({ message });
      console.error(error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  static getLeagueMetrics = async (req: Request, res: Response) => {
    try {
      const leagueId = Number(req.params.id);

      const leagueMeta = await prisma.league.findFirst({
        where: { id: leagueId, deletedAt: null },
        select: {
          type: true,
          format: true,
          scoringPeriods: {
            orderBy: { position: 'asc' },
          },
          teams: {
            where: { deletedAt: null },
            select: {
              id: true,
              name: true,
            },
          },
          players: {
            where: { deletedAt: null },
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      if (!leagueMeta) {
        res.status(404).send('League not found');
        return;
      }

      const requestedPeriodId = Number(req.query.periodId || 0);
      const selectedPeriod = requestedPeriodId
        ? leagueMeta.scoringPeriods.find((period) => period.id === requestedPeriodId)
        : null;
      if (requestedPeriodId && !selectedPeriod) {
        res.status(400).json({ message: 'Scoring period does not belong to this league.' });
        return;
      }

      const leagueEvents = await prisma.event.findMany({
        where: { leagueId, isDeleted: false, deletedAt: null },
        select: { id: true, startsAt: true, timeZone: true },
      });
      const selectedEventIds = selectedPeriod
        ? leagueEvents
            .filter((event) => {
              const date = localDateKey(event.startsAt, event.timeZone);
              const startDate = selectedPeriod.startDate.toISOString().slice(0, 10);
              const endDate = selectedPeriod.endDate.toISOString().slice(0, 10);
              return date >= startDate && date <= endDate;
            })
            .map((event) => event.id)
        : leagueEvents.map((event) => event.id);
      const scopedEventWhere = {
        leagueId,
        isDeleted: false,
        deletedAt: null,
        ...(selectedPeriod ? { id: { in: selectedEventIds } } : {}),
      };

      const isTeamLeague =
        String(leagueMeta.format || '').toLowerCase() === 'team' ||
        (String(leagueMeta.type || '').toLowerCase() === 'tournament' &&
          (leagueMeta.teams?.length || 0) > 0);

      const getRoundTotalPoints = (round: {
        pointsEarned?: number | null;
        matchPoints?: number | null;
      }) => Number(round.pointsEarned || 0) + Number(round.matchPoints || 0);

      // All completed rounds for this league
      const rounds = await prisma.round.findMany({
        where: {
          deletedAt: null,
          event: scopedEventWhere,
          status: 'completed',
        },
        include: {
          player: true,
          event: { select: { id: true, name: true, startsAt: true, timeZone: true } },
        },
        orderBy: { date: 'asc' },
      });

      // ── Season standings ─────────────────────────────
      const playerMap = new Map<
        number,
        {
          name: string;
          points: number;
          totalGross: number;
          totalNet: number;
          rounds: number;
          birdies: number;
          eagles: number;
          startingHandicap: number;
          currentHandicap: number;
        }
      >();

      for (const r of rounds) {
        const id = r.playerId;
        const roundPoints = getRoundTotalPoints(r);
        const existing = playerMap.get(id);
        if (existing) {
          existing.points += roundPoints;
          existing.totalGross += r.gross;
          existing.totalNet += r.net;
          existing.rounds += 1;
          existing.birdies += r.birdies;
          existing.eagles += r.eagles;
          existing.currentHandicap = Number(
            r.postHandicap ?? r.preHandicap ?? existing.currentHandicap,
          );
        } else {
          playerMap.set(id, {
            name: `${r.player.firstName} ${r.player.lastName}`,
            points: roundPoints,
            totalGross: r.gross,
            totalNet: r.net,
            rounds: 1,
            birdies: r.birdies,
            eagles: r.eagles,
            startingHandicap: Number(
              selectedPeriod
                ? (r.preHandicap ?? r.player.handicap ?? 0)
                : (r.player.startingHandicap ?? r.preHandicap ?? 0),
            ),
            currentHandicap: Number(r.postHandicap ?? r.preHandicap ?? r.player.handicap ?? 0),
          });
        }
      }

      const standings = [...playerMap.entries()]
        .map(([playerId, p]) => ({
          playerId,
          name: p.name,
          points: Math.round(p.points * 10) / 10,
          avgGross: p.rounds > 0 ? Math.round((p.totalGross / p.rounds) * 10) / 10 : 0,
          avgNet: p.rounds > 0 ? Math.round((p.totalNet / p.rounds) * 10) / 10 : 0,
          rounds: p.rounds,
          birdies: p.birdies,
          eagles: p.eagles,
          startingHandicap: Math.round(p.startingHandicap * 10) / 10,
          currentHandicap: Math.round(p.currentHandicap * 10) / 10,
          handicapChange: Math.round((p.currentHandicap - p.startingHandicap) * 10) / 10,
        }))
        .sort((a, b) => b.points - a.points);

      const playerResults = calculatePlayerResults(leagueMeta.players, rounds);

      let standingsMode: 'player' | 'team' = 'player';
      let teamStandings: Array<{
        teamId: number;
        name: string;
        points: number;
        eventsPlayed: number;
      }> = [];

      if (isTeamLeague) {
        standingsMode = 'team';

        const teamPointsRows = await prisma.team_event_points.findMany({
          where: {
            leagueId,
            ...(selectedPeriod ? { eventId: { in: selectedEventIds } } : {}),
          },
          include: {
            team: {
              select: {
                id: true,
                name: true,
              },
            },
            event: {
              select: {
                id: true,
                isDeleted: true,
              },
            },
          },
        });

        const teamMap = new Map<
          number,
          { teamId: number; name: string; points: number; eventIds: Set<number> }
        >();

        for (const team of leagueMeta.teams || []) {
          teamMap.set(Number(team.id), {
            teamId: Number(team.id),
            name: String(team.name || `Team ${team.id}`),
            points: 0,
            eventIds: new Set<number>(),
          });
        }

        for (const row of teamPointsRows) {
          if (row.event?.isDeleted) continue;

          const teamId = Number(row.teamId);
          const existing = teamMap.get(teamId) || {
            teamId,
            name: String(row.team?.name || `Team ${teamId}`),
            points: 0,
            eventIds: new Set<number>(),
          };

          existing.points += Number(row.points || 0);
          existing.eventIds.add(Number(row.eventId));
          teamMap.set(teamId, existing);
        }

        teamStandings = [...teamMap.values()]
          .map((t) => ({
            teamId: t.teamId,
            name: t.name,
            points: Math.round(t.points * 10) / 10,
            eventsPlayed: t.eventIds.size,
          }))
          .sort((a, b) => b.points - a.points);
      }

      // ── Season score distribution ────────────────────
      const scoreDistribution = rounds.reduce(
        (acc, r) => {
          acc.eagles += r.eagles;
          acc.birdies += r.birdies;
          acc.pars += r.pars;
          acc.bogeys += r.bogeys;
          acc.doubleBogeys += r.doubleBogeys;
          acc.tripleBogeys += r.tripleBogeys;
          return acc;
        },
        { eagles: 0, birdies: 0, pars: 0, bogeys: 0, doubleBogeys: 0, tripleBogeys: 0 },
      );

      // ── Gross trend per event ────────────────────────
      const eventMap = new Map<
        number,
        { name: string; startsAt: Date; timeZone: string; grossScores: number[] }
      >();
      for (const r of rounds) {
        const eid = r.event.id;
        const existing = eventMap.get(eid);
        if (existing) {
          existing.grossScores.push(r.gross);
        } else {
          eventMap.set(eid, {
            name: r.event.name,
            startsAt: r.event.startsAt,
            timeZone: r.event.timeZone,
            grossScores: [r.gross],
          });
        }
      }

      const grossTrend = [...eventMap.values()]
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
        .map((e) => ({
          name: e.name,
          startsAt: e.startsAt,
          timeZone: e.timeZone,
          avgGross:
            Math.round((e.grossScores.reduce((s, v) => s + v, 0) / e.grossScores.length) * 10) / 10,
          lowGross: Math.min(...e.grossScores),
        }));

      // ── Weekly player trend (avg gross/net by event week) ─────────────
      const weeklyEvents = [
        ...new Map(rounds.map((r) => [Number(r.event.id), r.event])).values(),
      ].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

      const eventIdToIndex = new Map<number, number>();
      const weeklyLabels = weeklyEvents.map((e, idx) => {
        eventIdToIndex.set(Number(e.id), idx);
        return e.name;
      });

      const playerEventAverages = new Map<
        string,
        { grossTotal: number; netTotal: number; count: number }
      >();
      for (const r of rounds) {
        const key = `${Number(r.playerId)}-${Number(r.event.id)}`;
        const existing = playerEventAverages.get(key) || { grossTotal: 0, netTotal: 0, count: 0 };
        existing.grossTotal += Number(r.gross || 0);
        existing.netTotal += Number(r.net || 0);
        existing.count += 1;
        playerEventAverages.set(key, existing);
      }

      const playerWeeklyTrends = {
        labels: weeklyLabels,
        players: [...playerMap.entries()].map(([playerId, p]) => {
          const avgGross = Array(weeklyLabels.length).fill(null) as Array<number | null>;
          const avgNet = Array(weeklyLabels.length).fill(null) as Array<number | null>;

          for (const e of weeklyEvents) {
            const idx = eventIdToIndex.get(Number(e.id));
            if (idx == null) continue;

            const row = playerEventAverages.get(`${playerId}-${Number(e.id)}`);
            if (!row || row.count === 0) continue;

            avgGross[idx] = Math.round((row.grossTotal / row.count) * 10) / 10;
            avgNet[idx] = Math.round((row.netTotal / row.count) * 10) / 10;
          }

          return {
            playerId,
            name: p.name,
            avgGross,
            avgNet,
          };
        }),
      };

      // ── Season-wide summary ──────────────────────────
      const totalRounds = rounds.length;
      const totalBirdies = rounds.reduce((s, r) => s + r.birdies, 0);
      const totalEagles = rounds.reduce((s, r) => s + r.eagles, 0);
      const totalPutts = rounds.reduce((s, r) => s + r.putts, 0);
      const seasonAvgGross =
        totalRounds > 0
          ? Math.round((rounds.reduce((s, r) => s + r.gross, 0) / totalRounds) * 10) / 10
          : 0;
      const seasonAvgNet =
        totalRounds > 0
          ? Math.round((rounds.reduce((s, r) => s + r.net, 0) / totalRounds) * 10) / 10
          : 0;
      const seasonAvgPutts = totalRounds > 0 ? Math.round((totalPutts / totalRounds) * 10) / 10 : 0;

      const handicapDeltas = [...playerMap.values()].map(
        (p) => p.currentHandicap - p.startingHandicap,
      );
      const avgHandicapChange =
        handicapDeltas.length > 0
          ? Math.round((handicapDeltas.reduce((s, v) => s + v, 0) / handicapDeltas.length) * 10) /
            10
          : 0;

      const seasonSummary = {
        totalRounds,
        totalBirdies,
        totalEagles,
        avgGross: seasonAvgGross,
        avgNet: seasonAvgNet,
        avgPutts: seasonAvgPutts,
        avgHandicapChange,
      };

      // ── Season records ───────────────────────────────
      const buildRecord = (round: any | null, scoreKey: string) => {
        if (!round) return null;
        return {
          playerName: `${round.player.firstName} ${round.player.lastName}`,
          value: round[scoreKey],
          eventName: round.event.name,
          eventDate: round.event.startsAt,
          eventTimeZone: round.event.timeZone,
        };
      };

      const lowGrossRound = rounds.reduce(
        (best: any, r) => (!best || r.gross < best.gross ? r : best),
        null,
      );
      const lowNetRound = rounds.reduce(
        (best: any, r) => (!best || r.net < best.net ? r : best),
        null,
      );
      const mostBirdiesRound = rounds.reduce(
        (best: any, r) => (!best || r.birdies > best.birdies ? r : best),
        null,
      );
      const mostPointsRound = rounds.reduce(
        (best: any, r) => (!best || getRoundTotalPoints(r) > getRoundTotalPoints(best) ? r : best),
        null,
      );

      const records = {
        lowGross: buildRecord(lowGrossRound, 'gross'),
        lowNet: buildRecord(lowNetRound, 'net'),
        mostBirdies: buildRecord(mostBirdiesRound, 'birdies'),
        mostPoints: mostPointsRound
          ? {
              playerName: `${mostPointsRound.player.firstName} ${mostPointsRound.player.lastName}`,
              value: getRoundTotalPoints(mostPointsRound),
              eventName: mostPointsRound.event.name,
              eventDate: mostPointsRound.event.startsAt,
              eventTimeZone: mostPointsRound.event.timeZone,
            }
          : null,
      };

      const teamNameMap = new Map<number, string>();
      for (const team of leagueMeta.teams || []) {
        teamNameMap.set(Number(team.id), String(team.name || `Team ${team.id}`));
      }

      const teamScores = await prisma.score.findMany({
        where: {
          round: {
            status: 'completed',
            event: {
              ...scopedEventWhere,
            },
          },
        },
        select: {
          hole: true,
          gross: true,
          net: true,
          round: {
            select: {
              eventId: true,
              playerId: true,
              player: {
                select: {
                  teamId: true,
                },
              },
              event: {
                select: {
                  name: true,
                  startsAt: true,
                  timeZone: true,
                  format: true,
                  scoringFormat: true,
                },
              },
            },
          },
        },
      });

      const flightPlayerRows = await prisma.flight_player.findMany({
        where: {
          deletedAt: null,
          flight: {
            event: {
              ...scopedEventWhere,
            },
          },
        },
        select: {
          playerId: true,
          teamId: true,
          flight: {
            select: {
              eventId: true,
            },
          },
        },
      });

      const eventPlayerTeamMap = new Map<string, number>();
      for (const fp of flightPlayerRows) {
        const teamId = Number(fp.teamId || 0);
        const eventId = Number(fp.flight?.eventId || 0);
        const playerId = Number(fp.playerId || 0);
        if (!teamId || !eventId || !playerId) continue;
        eventPlayerTeamMap.set(`${eventId}-${playerId}`, teamId);
      }

      const teamEventHoleBest = new Map<
        string,
        {
          teamId: number;
          teamName: string;
          eventName: string;
          eventDate: Date;
          eventTimeZone: string;
          grossByHole: Map<number, number>;
          netByHole: Map<number, number>;
        }
      >();

      for (const score of teamScores) {
        const eventFormat = normalizeEventFormat(score.round.event?.format, 'individual');
        const scoringFormat = normalizeScoringFormat(score.round.event?.scoringFormat, 'stroke');
        if (eventFormat !== 'team' || scoringFormat !== 'stroke') continue;

        const eventId = Number(score.round.eventId);
        const teamId =
          Number(score.round.player?.teamId || 0) ||
          Number(eventPlayerTeamMap.get(`${eventId}-${Number(score.round.playerId)}`) || 0);
        if (!teamId) continue;

        const mapKey = `${eventId}-${teamId}`;
        const existing = teamEventHoleBest.get(mapKey) || {
          teamId,
          teamName: teamNameMap.get(teamId) || `Team ${teamId}`,
          eventName: String(score.round.event?.name || `Event ${eventId}`),
          eventDate: (score.round.event?.startsAt as Date) || new Date(0),
          eventTimeZone: String(score.round.event?.timeZone || 'UTC'),
          grossByHole: new Map<number, number>(),
          netByHole: new Map<number, number>(),
        };

        const hole = Number(score.hole);
        const gross = Number(score.gross);
        const net = Number(score.net);

        if (Number.isFinite(hole) && Number.isFinite(gross) && gross > 0) {
          const currentGross = existing.grossByHole.get(hole);
          if (currentGross == null || gross < currentGross) {
            existing.grossByHole.set(hole, gross);
          }
        }

        if (Number.isFinite(hole) && Number.isFinite(net) && net > 0) {
          const currentNet = existing.netByHole.get(hole);
          if (currentNet == null || net < currentNet) {
            existing.netByHole.set(hole, net);
          }
        }

        teamEventHoleBest.set(mapKey, existing);
      }

      const teamEventBestBallTotals = [...teamEventHoleBest.values()].map((entry) => ({
        teamId: entry.teamId,
        teamName: entry.teamName,
        eventName: entry.eventName,
        eventDate: entry.eventDate,
        eventTimeZone: entry.eventTimeZone,
        grossTotal: [...entry.grossByHole.values()].reduce((sum, val) => sum + val, 0),
        netTotal: [...entry.netByHole.values()].reduce((sum, val) => sum + val, 0),
      }));

      const lowGrossTeam = teamEventBestBallTotals.reduce(
        (best, row) => (!best || row.grossTotal < best.grossTotal ? row : best),
        null as (typeof teamEventBestBallTotals)[number] | null,
      );
      const lowNetTeam = teamEventBestBallTotals.reduce(
        (best, row) => (!best || row.netTotal < best.netTotal ? row : best),
        null as (typeof teamEventBestBallTotals)[number] | null,
      );

      if (lowGrossTeam) {
        records.lowGross = {
          playerName: lowGrossTeam.teamName,
          value: lowGrossTeam.grossTotal,
          eventName: lowGrossTeam.eventName,
          eventDate: lowGrossTeam.eventDate,
          eventTimeZone: lowGrossTeam.eventTimeZone,
        };
      }

      if (lowNetTeam) {
        records.lowNet = {
          playerName: lowNetTeam.teamName,
          value: lowNetTeam.netTotal,
          eventName: lowNetTeam.eventName,
          eventDate: lowNetTeam.eventDate,
          eventTimeZone: lowNetTeam.eventTimeZone,
        };
      }

      // ── Season skins ─────────────────────────────────
      const allScores = await prisma.score.findMany({
        where: { round: { event: scopedEventWhere, status: 'completed' } },
        include: {
          round: {
            include: {
              player: true,
              event: { select: { id: true, name: true, format: true, scoringFormat: true } },
            },
          },
        },
      });

      const skins = calculateSeasonSkinLeaderboards(
        allScores.map((score) => ({
          eventId: Number(score.round.event.id),
          hole: Number(score.hole),
          playerId: Number(score.round.playerId),
          playerName: `${score.round.player.firstName} ${score.round.player.lastName}`.trim(),
          gross: Number(score.gross),
          net: Number(score.net),
        })),
      );

      // ── Top-5 leaderboards ───────────────────────────
      const top5Points =
        standingsMode === 'team'
          ? [...teamStandings].slice(0, 5)
          : [...standings].sort((a, b) => b.points - a.points).slice(0, 5);

      const teamBestBallSeasonAverages = (() => {
        const byTeam = new Map<
          number,
          { teamId: number; name: string; grossTotal: number; netTotal: number; events: number }
        >();

        for (const row of teamEventBestBallTotals) {
          const existing = byTeam.get(row.teamId) || {
            teamId: row.teamId,
            name: row.teamName,
            grossTotal: 0,
            netTotal: 0,
            events: 0,
          };

          existing.grossTotal += Number(row.grossTotal || 0);
          existing.netTotal += Number(row.netTotal || 0);
          existing.events += 1;
          byTeam.set(row.teamId, existing);
        }

        return [...byTeam.values()].map((t) => ({
          teamId: t.teamId,
          name: t.name,
          avgGross: t.events > 0 ? Math.round((t.grossTotal / t.events) * 10) / 10 : 0,
          avgNet: t.events > 0 ? Math.round((t.netTotal / t.events) * 10) / 10 : 0,
          events: t.events,
        }));
      })();

      const top5LowGross =
        standingsMode === 'team'
          ? [...teamBestBallSeasonAverages].sort((a, b) => a.avgGross - b.avgGross).slice(0, 5)
          : [...standings].sort((a, b) => a.avgGross - b.avgGross).slice(0, 5);
      const top5LowNet =
        standingsMode === 'team'
          ? [...teamBestBallSeasonAverages].sort((a, b) => a.avgNet - b.avgNet).slice(0, 5)
          : [...standings].sort((a, b) => a.avgNet - b.avgNet).slice(0, 5);
      const leaderboards = {
        points: top5Points,
        lowGross: top5LowGross,
        lowNet: top5LowNet,
      };

      res.status(200).json({
        scoringPeriods: leagueMeta.scoringPeriods.map((period) => ({
          id: period.id,
          name: period.name,
          position: period.position,
          startDate: period.startDate,
          endDate: period.endDate,
          eventCount: leagueEvents.filter((event) => {
            const date = localDateKey(event.startsAt, event.timeZone);
            return (
              date >= period.startDate.toISOString().slice(0, 10) &&
              date <= period.endDate.toISOString().slice(0, 10)
            );
          }).length,
        })),
        selectedPeriod: selectedPeriod
          ? { id: selectedPeriod.id, name: selectedPeriod.name }
          : null,
        standingsMode,
        standings,
        playerResults,
        teamStandings,
        scoreDistribution,
        grossTrend,
        playerWeeklyTrends,
        seasonSummary,
        records,
        skins,
        leaderboards,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
}

export default LeagueController;

const calculateLowNet = (scores: any[]) => {
  if (!scores || scores.length === 0) return null;

  const minScore = Math.min(...scores.map((score) => score.net));
  const playersWithMinScore = scores.filter((score) => score.net === minScore);

  return playersWithMinScore.map((score) => ({
    player: `${score.player.firstName} ${score.player.lastName}`,
    net: score.net,
  }));
};

const calculateLowGross = (scores: any[]) => {
  if (!scores || scores.length === 0) return null;

  const minGross = Math.min(...scores.map((score) => score.score));
  const playersWithMinGross = scores.filter((score) => score.score === minGross);

  return playersWithMinGross.map((score) => ({
    player: `${score.player.firstName} ${score.player.lastName}`,
    gross: score.score,
  }));
};

const calculateStats = (scores: any[]) => {
  const statNames = ['pointsEarned', 'eagles', 'birdies', 'pars', 'bogeys'];
  const test = {
    pointsEarned: { players: [], value: 0 },
    eagles: { players: [], value: 0 },
    birdies: { players: [], value: 0 },
    pars: { players: [], value: 0 },
    bogeys: { players: [], value: 0 },
  } as any;

  scores.forEach((score) => {
    const playerName = `${score.player.firstName} ${score.player.lastName}`;

    statNames.forEach((stat) => {
      const currentValue = score[stat];

      if (currentValue <= 0) return;

      const statRecord = test[stat];

      if (currentValue > statRecord.value) {
        statRecord.value = currentValue;
        statRecord.players = [playerName];
      } else if (currentValue === statRecord.value) {
        statRecord.players.push(playerName);
      }
    });
  });

  return test;
};
