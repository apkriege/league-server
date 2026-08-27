import { Request, Response } from 'express';
import PlayerService from '../models/player';
import { prisma } from '../../prisma';
import { writeAuditLog } from '../utils/audit';
import { getHandicapHoleBasis } from '../utils/league-hole-format';
import { normalizeGender, type Gender } from '../utils/tee-rating';
import { lockLeagueCapacity } from '../services/billingLock';

const getMissingRequiredPlayerFields = (payload: any) => {
  const missing: string[] = [];
  const handicap =
    payload.handicap !== undefined && payload.handicap !== null && String(payload.handicap).trim() !== ''
      ? Number(payload.handicap)
      : NaN;

  if (!String(payload.firstName ?? '').trim()) missing.push('firstName');
  if (!String(payload.lastName ?? '').trim()) missing.push('lastName');
  try {
    normalizeGender(payload.gender);
  } catch {
    missing.push('gender');
  }
  if (!Number.isFinite(handicap)) missing.push('handicap');

  return missing;
};

type BatchPlayerData = {
  leagueId: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  gender: Gender;
  handicap: number;
  startingHandicap: number;
  seasonPoints: number;
  seasonRank: null;
  type: string;
  teamId: null;
};

type PlayerCapacityResult<T> =
  | { ok: true; value: T }
  | { ok: false; currentGolfers: number; maxGolfers: number };

const duplicatePlayerEmailMessage = 'A player with this email already exists in the league.';
const playerCapacityMessage = 'Payment is required before making this golfer a regular player.';

export default class PlayerController {
  static getPlayers = async (_req: Request, res: Response): Promise<any> => {
    try {
      const players = await prisma.player.findMany({
        where: { deletedAt: null },
        orderBy: [{ type: 'asc' }, { firstName: 'asc' }, { lastName: 'asc' }],
      });

      res.status(200).json(players);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static getPlayer = async (req: Request, res: Response): Promise<any> => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ message: 'Player ID is required' });
      }

      const player = await prisma.player.findFirst({
        where: { id: Number(id), deletedAt: null },
        include: {
          rounds: {
            include: {
              event: {
                select: {
                  id: true,
                  name: true,
                  startsAt: true,
                  timeZone: true,
                  startSide: true,
                },
              },
              scores: true,
              tee: true,
              course: true,
            },
          },
        },
      });

      if (!player) {
        return res.status(404).json({ message: 'Player not found' });
      }

      res.status(200).json(player);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static getLeaguePlayers = async (req: Request, res: Response): Promise<any> => {
    try {
      const { leagueId } = req.params;

      if (!leagueId) {
        return res.status(400).json({ message: 'leagueId is required' });
      }

      const players = await PlayerService.findByLeagueId(Number(leagueId));

      res.status(200).send(players);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static createPlayer = async (req: Request, res: Response): Promise<any> => {
    try {
      const { leagueId } = req.params;
      const payload = req.body || {};

      if (!leagueId) {
        return res.status(400).json({ message: 'leagueId is required' });
      }

      const missingRequiredFields = getMissingRequiredPlayerFields(payload);
      if (missingRequiredFields.length > 0) {
        return res.status(400).json({
          message: `Missing required fields: ${missingRequiredFields.join(', ')}`,
        });
      }

      const handicap = Number(payload.handicap);
      const gender = normalizeGender(payload.gender);
      if (handicap < -10 || handicap > 54) {
        return res.status(400).json({ message: 'Handicap must be between -10 and 54' });
      }
      const playerType = String(payload.type || 'player').trim().toLowerCase();
      if (!['player', 'substitute', 'captain'].includes(playerType)) {
        return res.status(400).json({ message: 'Player type is invalid' });
      }
      const teamId = payload.teamId != null ? Number(payload.teamId) : null;
      if (teamId != null && (!Number.isInteger(teamId) || teamId <= 0)) {
        return res.status(400).json({ message: 'Team id is invalid' });
      }
      const numericLeagueId = Number(leagueId);
      const normalizedEmail = String(payload.email || '').trim().toLowerCase() || null;
      const result = await prisma.$transaction(async (tx): Promise<PlayerCapacityResult<any>> => {
        await lockLeagueCapacity(tx, numericLeagueId);
        const league = await tx.league.findFirst({
          where: { id: numericLeagueId, deletedAt: null },
          select: { id: true, numPlayers: true, adminId: true },
        });
        if (!league) throw new Error('League not found');

        if (teamId) {
          const team = await tx.team.findFirst({
            where: { id: teamId, leagueId: numericLeagueId, deletedAt: null },
            select: { id: true },
          });
          if (!team) throw new Error('Selected team does not belong to this league');
        }

        if (normalizedEmail) {
          const duplicate = await tx.player.findFirst({
            where: { leagueId: numericLeagueId, email: normalizedEmail, deletedAt: null },
            select: { id: true },
          });
          if (duplicate) throw new Error(duplicatePlayerEmailMessage);
        }

        const activePlayers =
          playerType === 'player'
            ? await tx.player.count({
                where: { leagueId: numericLeagueId, type: 'player', deletedAt: null },
              })
            : 0;
        if (playerType === 'player' && activePlayers >= league.numPlayers) {
          return { ok: false, currentGolfers: activePlayers, maxGolfers: league.numPlayers };
        }

        const created = await tx.player.create({
          data: {
            leagueId: numericLeagueId,
            firstName: String(payload.firstName).trim(),
            lastName: String(payload.lastName).trim(),
            email: normalizedEmail,
            phone: payload.phone ? String(payload.phone).trim() : null,
            gender,
            handicap,
            startingHandicap: handicap,
            seasonPoints: 0,
            seasonRank: null,
            type: playerType,
            teamId,
          },
        });
        return { ok: true, value: created };
      });

      if (!result.ok) {
        return res.status(402).json({
          message: `This league is currently paid for ${result.maxGolfers} regular golfers. Increase its paid golfer count before adding another regular player.`,
          currentGolfers: result.currentGolfers,
          maxGolfers: result.maxGolfers,
        });
      }
      const created = result.value;

      await writeAuditLog({
        userId: req.session.userId ?? null,
        leagueId: Number(leagueId),
        entity: 'player',
        entityId: created.id,
        action: 'create',
        summary: `Added player ${created.firstName} ${created.lastName}.`,
      });

      return res.status(201).json(created);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      if (message === 'League not found') return res.status(404).json({ message });
      if (message === duplicatePlayerEmailMessage) return res.status(409).json({ message });
      if (message.includes('does not belong')) return res.status(400).json({ message });
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static createPlayers = async (req: Request, res: Response): Promise<any> => {
    try {
      const leagueId = Number(req.params.leagueId);
      const players = Array.isArray(req.body?.players) ? req.body.players : [];
      if (!Number.isInteger(leagueId) || leagueId <= 0) {
        return res.status(400).json({ message: 'leagueId is required' });
      }
      if (players.length < 1 || players.length > 250) {
        return res.status(400).json({ message: 'Add between 1 and 250 players at a time' });
      }

      const normalizedPlayers: BatchPlayerData[] = players.map((payload: any, index: number) => {
        const missing = getMissingRequiredPlayerFields(payload);
        if (missing.length > 0) {
          throw new Error(`Player ${index + 1} is missing required fields: ${missing.join(', ')}`);
        }
        const handicap = Number(payload.handicap);
        const gender = normalizeGender(payload.gender);
        if (handicap < -10 || handicap > 54) {
          throw new Error(`Player ${index + 1} handicap must be between -10 and 54`);
        }
        const rawType = String(payload.type || 'player').trim().toLowerCase();
        const type = rawType === 'sub' ? 'substitute' : rawType;
        if (!['player', 'substitute', 'captain'].includes(type)) {
          throw new Error(`Player ${index + 1} type is invalid`);
        }
        return {
          leagueId,
          firstName: String(payload.firstName).trim(),
          lastName: String(payload.lastName).trim(),
          email: String(payload.email || '').trim().toLowerCase() || null,
          phone: payload.phone ? String(payload.phone).trim() : null,
          gender,
          handicap,
          startingHandicap: handicap,
          seasonPoints: 0,
          seasonRank: null,
          type,
          teamId: null,
        };
      });

      const incomingEmails = normalizedPlayers
        .map((player) => player.email)
        .filter((email): email is string => Boolean(email));
      if (new Set(incomingEmails).size !== incomingEmails.length) {
        return res.status(409).json({ message: 'Every player email in the batch must be unique.' });
      }

      const result = await prisma.$transaction(async (tx): Promise<PlayerCapacityResult<any[]>> => {
        await lockLeagueCapacity(tx, leagueId);
        const league = await tx.league.findFirst({
          where: { id: leagueId, deletedAt: null },
          select: { id: true, numPlayers: true, adminId: true },
        });
        if (!league) throw new Error('League not found');

        if (incomingEmails.length > 0) {
          const duplicate = await tx.player.findFirst({
            where: { leagueId, email: { in: incomingEmails }, deletedAt: null },
            select: { id: true },
          });
          if (duplicate) throw new Error(duplicatePlayerEmailMessage);
        }

        const regularPlayerCount = await tx.player.count({
          where: { leagueId, type: 'player', deletedAt: null },
        });
        const incomingRegularPlayers = normalizedPlayers.filter(
          (player) => player.type === 'player',
        ).length;
        if (regularPlayerCount + incomingRegularPlayers > league.numPlayers) {
          return {
            ok: false,
            currentGolfers: regularPlayerCount,
            maxGolfers: league.numPlayers,
          };
        }

        const created = [];
        for (const player of normalizedPlayers) {
          created.push(await tx.player.create({ data: player }));
        }
        return { ok: true, value: created };
      });

      if (!result.ok) {
        const additionalGolfersRequired =
          normalizedPlayers.filter((player) => player.type === 'player').length -
          (result.maxGolfers - result.currentGolfers);
        return res.status(402).json({
          message: `Payment is required for ${additionalGolfersRequired} additional regular ${additionalGolfersRequired === 1 ? 'player' : 'players'}.`,
          currentGolfers: result.currentGolfers,
          maxGolfers: result.maxGolfers,
          additionalGolfersRequired,
        });
      }
      const created = result.value;
      await writeAuditLog({
        userId: req.session.userId ?? null,
        leagueId,
        entity: 'player',
        entityId: null,
        action: 'create_batch',
        summary: `Added ${created.length} players to the league.`,
      });
      return res.status(201).json(created);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      const status = message === 'League not found'
        ? 404
          : message === duplicatePlayerEmailMessage
          ? 409
          : message.startsWith('Player ')
            ? 400
            : 500;
      if (status === 500) console.error(error);
      return res.status(status).json({ message });
    }
  };

  static updatePlayer = async (req: Request, res: Response): Promise<any> => {
    try {
      const { id } = req.params;
      const payload = req.body || {};

      if (!id) {
        return res.status(400).json({ message: 'Player ID is required' });
      }

      const missingRequiredFields = getMissingRequiredPlayerFields(payload);
      if (missingRequiredFields.length > 0) {
        return res.status(400).json({
          message: `Missing required fields: ${missingRequiredFields.join(', ')}`,
        });
      }

      const existingPlayer = await prisma.player.findFirst({
        where: { id: Number(id), deletedAt: null },
        select: { id: true, leagueId: true, type: true },
      });
      if (!existingPlayer) {
        return res.status(404).json({ message: 'Player not found' });
      }

      const handicap = Number(payload.handicap);
      const gender = normalizeGender(payload.gender);
      if (handicap < -10 || handicap > 54) {
        return res.status(400).json({ message: 'Handicap must be between -10 and 54' });
      }
      const playerType = String(payload.type || 'player').trim().toLowerCase();
      if (!['player', 'substitute', 'captain'].includes(playerType)) {
        return res.status(400).json({ message: 'Player type is invalid' });
      }

      const teamId = payload.teamId === undefined || payload.teamId == null
        ? null
        : Number(payload.teamId);
      if (teamId != null && (!Number.isInteger(teamId) || teamId <= 0)) {
        return res.status(400).json({ message: 'Team id is invalid' });
      }
      const data: any = {
        ...(payload.firstName != null ? { firstName: String(payload.firstName).trim() } : {}),
        ...(payload.lastName != null ? { lastName: String(payload.lastName).trim() } : {}),
        ...(payload.email !== undefined
          ? { email: String(payload.email || '').trim().toLowerCase() || null }
          : {}),
        ...(payload.phone !== undefined
          ? { phone: payload.phone ? String(payload.phone).trim() : null }
          : {}),
        gender,
        ...(payload.type != null ? { type: playerType } : {}),
        ...(payload.handicap != null ? { handicap } : {}),
        ...(payload.teamId !== undefined
          ? { teamId }
          : {}),
      };

      const updated = await prisma.$transaction(async (tx) => {
        if (existingPlayer.leagueId) {
          await lockLeagueCapacity(tx, existingPlayer.leagueId);
        }

        if (payload.teamId !== undefined && teamId) {
          const team = await tx.team.findFirst({
            where: { id: teamId, leagueId: existingPlayer.leagueId, deletedAt: null },
            select: { id: true },
          });
          if (!team) throw new Error('Selected team does not belong to this league');
        }

        const normalizedEmail = data.email as string | null | undefined;
        if (normalizedEmail && existingPlayer.leagueId) {
          const duplicate = await tx.player.findFirst({
            where: {
              id: { not: existingPlayer.id },
              leagueId: existingPlayer.leagueId,
              email: normalizedEmail,
              deletedAt: null,
            },
            select: { id: true },
          });
          if (duplicate) throw new Error(duplicatePlayerEmailMessage);
        }

        if (
          playerType === 'player' &&
          existingPlayer.type !== 'player' &&
          existingPlayer.leagueId
        ) {
          const [league, regularPlayerCount] = await Promise.all([
            tx.league.findFirst({
              where: { id: existingPlayer.leagueId, deletedAt: null },
              select: { numPlayers: true, adminId: true },
            }),
            tx.player.count({
              where: {
                leagueId: existingPlayer.leagueId,
                type: 'player',
                deletedAt: null,
              },
            }),
          ]);
          if (league && regularPlayerCount >= league.numPlayers) {
            throw new Error(playerCapacityMessage);
          }
        }

        return tx.player.update({ where: { id: Number(id) }, data });
      });

      await writeAuditLog({
        userId: req.session.userId ?? null,
        leagueId: updated?.leagueId ?? null,
        entity: 'player',
        entityId: Number(id),
        action: 'update',
        summary: `Updated player ${updated.firstName} ${updated.lastName}.`,
      });

      return res.status(200).json(updated);
    } catch (error: any) {
      console.error(error);
      if (String(error?.message || '').includes('Player not found')) {
        return res.status(404).json({ message: 'Player not found' });
      }
      if (String(error?.message || '') === playerCapacityMessage) {
        return res.status(402).json({ message: playerCapacityMessage });
      }
      if (String(error?.message || '') === duplicatePlayerEmailMessage) {
        return res.status(409).json({ message: duplicatePlayerEmailMessage });
      }
      if (String(error?.message || '').includes('does not belong')) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static deletePlayer = async (req: Request, res: Response): Promise<any> => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ message: 'Player ID is required' });
      }

      const player = await prisma.player.findFirst({
        where: { id: Number(id), deletedAt: null },
      });
      if (!player) {
        return res.status(404).json({ message: 'Player not found' });
      }
      const scheduledAssignment = await prisma.flight_player.findFirst({
        where: {
          playerId: Number(id),
          deletedAt: null,
          flight: {
            deletedAt: null,
            event: {
              isDeleted: false,
              deletedAt: null,
              isComplete: false,
              status: { not: 'canceled' },
            },
          },
        },
        select: { id: true },
      });
      if (scheduledAssignment) {
        return res.status(409).json({
          message: 'Player is assigned to an upcoming event. Update that event before removing the player.',
        });
      }
      await PlayerService.delete(Number(id));
      await writeAuditLog({
        userId: req.session.userId ?? null,
        leagueId: player?.leagueId ?? null,
        entity: 'player',
        entityId: Number(id),
        action: 'delete',
        summary: `Removed player ${player ? `${player.firstName} ${player.lastName}` : id}.`,
      });
      return res.status(200).json({ message: 'Player removed' });
    } catch (error: any) {
      console.error(error);
      if (String(error?.message || '').includes('Player not found')) {
        return res.status(404).json({ message: 'Player not found' });
      }
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static getPlayerStats = async (req: Request, res: Response): Promise<any> => {
    try {
      const { leagueId, playerId } = req.params;

      const player = await prisma.player.findUnique({
        where: { id: Number(playerId) },
        include: {
          team: true,
          league: { select: { holeFormat: true } },
          rounds: {
            where: {
              event: { leagueId: Number(leagueId), isDeleted: false },
              status: 'completed',
            },
            include: {
              event: {
                select: { id: true, name: true, startsAt: true, timeZone: true, startSide: true },
              },
              course: {
                select: {
                  id: true,
                  name: true,
                },
              },
              tee: {
                select: {
                  id: true,
                  name: true,
                },
              },
              scores: {
                orderBy: { hole: 'asc' },
              },
            },
            orderBy: { date: 'asc' },
          },
        },
      });

      if (!player) {
        return res.status(404).json({ message: 'Player not found' });
      }

      const rounds = player.rounds;
      const handicapHoleBasis = getHandicapHoleBasis(player.league?.holeFormat);

      if (rounds.length === 0) {
        return res.status(200).json({
          player: {
            id: player.id,
            firstName: player.firstName,
            lastName: player.lastName,
            handicap: player.handicap,
            startingHandicap: player.startingHandicap,
            seasonPoints: player.seasonPoints,
            seasonRank: player.seasonRank,
            type: player.type,
            team: player.team,
          },
          stats: null,
          rounds: [],
          handicapHoleBasis,
        });
      }

      // Aggregate season stats
      let totalGross = 0;
      let totalNet = 0;
      let totalPoints = 0;
      let totalPutts = 0;
      let totalBirdies = 0;
      let totalEagles = 0;
      let totalPars = 0;
      let totalBogeys = 0;
      let totalDoubleBogeys = 0;
      let totalTripleBogeys = 0;
      let totalNetBirdies = 0;
      let totalNetEagles = 0;
      let lowGross = Infinity;
      let lowNet = Infinity;
      let highPoints = -Infinity;

      const roundSummaries: any[] = [];

      for (const r of rounds) {
        const roundPoints = Number(r.pointsEarned || 0) + Number(r.matchPoints || 0);
        totalGross += r.gross;
        totalNet += r.net;
        totalPoints += roundPoints;
        totalPutts += r.putts;
        totalBirdies += r.birdies;
        totalEagles += r.eagles;
        totalPars += r.pars;
        totalBogeys += r.bogeys;
        totalDoubleBogeys += r.doubleBogeys;
        totalTripleBogeys += r.tripleBogeys;
        totalNetBirdies += r.netBirdies ?? 0;
        totalNetEagles += r.netEagles ?? 0;
        if (r.gross < lowGross) lowGross = r.gross;
        if (r.net < lowNet) lowNet = r.net;
        if (roundPoints > highPoints) highPoints = roundPoints;

        roundSummaries.push({
          id: r.id,
          eventId: r.event.id,
          eventName: r.event.name,
          date: r.date.toISOString().slice(0, 10),
          startsAt: r.event.startsAt,
          timeZone: r.event.timeZone,
          event: r.event,
          course: r.course,
          tee: r.tee,
          holesPlayed: r.holesPlayed,
          gross: r.gross,
          net: r.net,
          adjusted: r.adjusted,
          courseRating: r.courseRating,
          courseSlope: r.courseSlope,
          points: roundPoints,
          putts: r.putts,
          birdies: r.birdies,
          eagles: r.eagles,
          pars: r.pars,
          bogeys: r.bogeys,
          doubleBogeys: r.doubleBogeys,
          preHandicap: r.preHandicap,
          postHandicap: r.postHandicap,
          differential: r.differential,
          scores: r.scores.map((score) => ({
            hole: score.hole,
            gross: score.gross,
            net: score.net,
            par: score.par,
          })),
        });
      }

      const count = rounds.length;
      const r = (v: number) => Math.round(v * 10) / 10;

      const stats = {
        rounds: count,
        totalPoints: r(totalPoints),
        avgPoints: r(totalPoints / count),
        bestPoints: r(highPoints),
        avgGross: r(totalGross / count),
        avgNet: r(totalNet / count),
        lowGross,
        lowNet,
        avgPutts: r(totalPutts / count),
        totalBirdies,
        totalEagles,
        totalNetBirdies,
        totalNetEagles,
        totalPars,
        totalBogeys,
        totalDoubleBogeys,
        totalTripleBogeys,
        startingHandicap: Number(player.startingHandicap),
        currentHandicap: Number(player.handicap),
        handicapChange: r(Number(player.handicap) - Number(player.startingHandicap)),
      };

      return res.status(200).json({
        player: {
          id: player.id,
          firstName: player.firstName,
          lastName: player.lastName,
          handicap: player.handicap,
          startingHandicap: player.startingHandicap,
          seasonPoints: player.seasonPoints,
          seasonRank: player.seasonRank,
          type: player.type,
          team: player.team,
        },
        stats,
        rounds: roundSummaries,
        handicapHoleBasis,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
}
