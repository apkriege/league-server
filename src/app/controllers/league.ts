import { Request, Response } from 'express';
import LeagueService from '../models/league';
import { prisma } from '../../prisma';
import { normalizeEventFormat, normalizeScoringFormat } from '../utils/event-mode';
import {
  BILLING_MIN_GOLFERS,
  getAllocatedGolfersForAdmin,
  getBillingState,
} from '../utils/billing';
import { writeAuditLog } from '../utils/audit';

class LeagueController {
  static normalizeLeaguePayload = (payload: any) => {
    const normalizedType = String(payload?.type || '').toLowerCase();
    const normalizedFormat = payload?.format ? String(payload.format).toLowerCase() : null;

    if (normalizedType === 'season' && !['individual', 'team'].includes(normalizedFormat || '')) {
      throw new Error('Season leagues require format to be either "individual" or "team".');
    }

    return {
      ...payload,
      type: normalizedType,
      format: normalizedType === 'season' ? normalizedFormat : null,
    };
  };

  static getLeagueInfo = async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.leagueId);
      const league = await LeagueService.findById(id);

      const lastEvent = await prisma.event.findFirst({
        where: { leagueId: id, isComplete: true },
        include: {
          rounds: {
            include: {
              player: true,
            },
          },
        },
        orderBy: { date: 'desc' },
      });

      const result = {
        league,
        lastEvent: {
          id: lastEvent?.id,
          name: lastEvent?.name,
          date: lastEvent?.date,
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

      const league = await prisma.league.findUnique({
        where: { id },
        include: {
          events: {
            where: { isDeleted: false },
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

  static getAllLeagues = async (req: Request, res: Response) => {
    try {
      const leagues = await LeagueService.findAll();
      res.status(200).send(leagues);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static getAdminLeagues = async (req: Request, res: Response) => {
    try {
      const leagues = await prisma.league.findMany({
        where: { adminId: req.session.userId },
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

      const league = await prisma.league.findUnique({
        where: { id },
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
            where: { isDeleted: false },
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
      const playerIds = await prisma.player.findMany({
        where: { userId },
        select: { id: true },
      });

      const leagues = await prisma.league.findMany({
        where: {
          deletedAt: null,
          OR: [
            { players: { some: { id: { in: playerIds.map((p: { id: number }) => p.id) } } } },
            {
              teams: {
                some: {
                  players: {
                    some: { id: { in: playerIds.map((p: { id: number }) => p.id) } },
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
        },
        orderBy: {
          updatedAt: 'desc',
        },
      });

      const upcomingSchedule = await prisma.flight.findMany({
        where: {
          players: {
            some: {
              playerId: { in: playerIds.map((p: { id: number }) => p.id) },
            },
          },
        },
        include: {
          event: true,
        },
        orderBy: {
          event: {
            date: 'asc',
          },
        },
        take: 5,
      });

      res.status(200).send({ leagues, upcomingSchedule });
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

      const requestedGolfers = Math.max(
        BILLING_MIN_GOLFERS,
        Array.isArray(players) ? players.length : 0,
        Number(leagueData?.numPlayers ?? 0)
      );
      const normalizedLeagueData = LeagueController.normalizeLeaguePayload({
        ...leagueData,
        numPlayers: requestedGolfers,
      });
      const allocatedGolfers = await getAllocatedGolfersForAdmin(adminId);
      const billingState = getBillingState(adminUser.metadata, allocatedGolfers);

      if (!billingState.hasCompletedRegistration) {
        return res.status(402).json({
          message: `Complete registration payment for at least ${billingState.minimumGolfers} golfers before creating a league.`,
          billing: billingState,
        });
      }

      if (billingState.includedGolfers < allocatedGolfers + requestedGolfers) {
        return res.status(402).json({
          message: `This league needs ${requestedGolfers} golfer slots, but your account only has ${billingState.availableGolfers} available.`,
          billing: billingState,
          requiredGolfers: requestedGolfers,
          additionalGolfersRequired:
            allocatedGolfers + requestedGolfers - billingState.includedGolfers,
        });
      }

      const newLeague = await prisma.league.create({
        data: {
          ...normalizedLeagueData,
          adminId,
        },
      });

      await prisma.league_onboarding.upsert({
        where: { leagueId: newLeague.id },
        create: { leagueId: newLeague.id },
        update: {},
      });

      if (players && players.length > 0) {
        const playerIdMap = new Map<number, number>();

        for (const player of players) {
          const createdPlayer = await prisma.player.create({
            data: {
              firstName: player.firstName,
              lastName: player.lastName,
              email: player.email,
              phone: player.phone,
              type: player.type,
              handicap: Number(player.handicap),
              startingHandicap: Number(player.handicap),
              seasonPoints: 0,
              leagueId: newLeague.id,
            },
          });

          if (player?.id !== undefined && player?.id !== null) {
            playerIdMap.set(Number(player.id), createdPlayer.id);
          }
        }

        if (normalizedLeagueData.type === 'season' && normalizedLeagueData.format === 'team') {
          for (const team of teams) {
            const createdTeam = await prisma.team.create({
              data: {
                name: team.name,
                leagueId: newLeague.id,
                seasonPoints: 0,
              },
            });

            const mappedPlayerIds = (team.players || [])
              .map((id: any) => playerIdMap.get(Number(id)))
              .filter(Boolean) as number[];

            if (mappedPlayerIds.length > 0) {
              await prisma.player.updateMany({
                where: {
                  leagueId: newLeague.id,
                  id: { in: mappedPlayerIds },
                },
                data: {
                  teamId: createdTeam.id,
                },
              });
            }
          }
        }
      }

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
      const status = message.includes('Season leagues require format') ? 400 : 500;
      res.status(status).json({ message });
    }
  };

  static updateLeague = async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const existingLeague = await prisma.league.findUnique({
        where: { id },
        select: { adminId: true, numPlayers: true },
      });

      if (!existingLeague) {
        res.status(404).send('League not found');
        return;
      }

      const nextNumPlayers = Math.max(
        BILLING_MIN_GOLFERS,
        Number(req.body?.numPlayers ?? existingLeague.numPlayers ?? 0)
      );
      const league = LeagueController.normalizeLeaguePayload({
        ...req.body,
        numPlayers: nextNumPlayers,
      });

      const adminUser = await prisma.user.findUnique({
        where: { id: existingLeague.adminId },
        select: { metadata: true },
      });
      const allocatedGolfers = await getAllocatedGolfersForAdmin(existingLeague.adminId, id);
      const billingState = getBillingState(adminUser?.metadata, allocatedGolfers);

      if (billingState.includedGolfers < allocatedGolfers + nextNumPlayers) {
        return res.status(402).json({
          message: `This change needs ${nextNumPlayers} golfer slots, but your account only has ${billingState.availableGolfers} available.`,
          billing: billingState,
          requiredGolfers: nextNumPlayers,
          additionalGolfersRequired:
            allocatedGolfers + nextNumPlayers - billingState.includedGolfers,
        });
      }

      const updatedLeague = await LeagueService.update(id, league);

      if (!updatedLeague) {
        res.status(404).send('League not found');
        return;
      }

      res.status(200).send(updatedLeague);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Internal server error';
      const status = message.includes('Season leagues require format') ? 400 : 500;
      res.status(status).json({ message });
    }
  };

  static deleteLeague = async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      await LeagueService.delete(id);
      res.status(204).json('League deleted');
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static getLeagueMetrics = async (req: Request, res: Response) => {
    try {
      const leagueId = Number(req.params.id);

      const leagueMeta = await prisma.league.findUnique({
        where: { id: leagueId },
        select: {
          type: true,
          format: true,
          teams: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!leagueMeta) {
        res.status(404).send('League not found');
        return;
      }

      const isTournamentTeamLeague =
        String(leagueMeta.type || '').toLowerCase() === 'tournament' &&
        (String(leagueMeta.format || '').toLowerCase() === 'team' ||
          (leagueMeta.teams?.length || 0) > 0);

      // All completed rounds for this league
      const rounds = await prisma.round.findMany({
        where: {
          event: { leagueId, isDeleted: false },
          status: 'completed',
        },
        include: {
          player: true,
          event: { select: { id: true, name: true, date: true } },
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
        const existing = playerMap.get(id);
        if (existing) {
          existing.points += Number(r.pointsEarned);
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
            points: Number(r.pointsEarned),
            totalGross: r.gross,
            totalNet: r.net,
            rounds: 1,
            birdies: r.birdies,
            eagles: r.eagles,
            startingHandicap: Number(r.player.startingHandicap ?? r.preHandicap ?? 0),
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

      let standingsMode: 'player' | 'team' = 'player';
      let teamStandings: Array<{
        teamId: number;
        name: string;
        points: number;
        eventsPlayed: number;
      }> = [];

      if (isTournamentTeamLeague) {
        standingsMode = 'team';

        const teamPointsRows = await prisma.team_event_points.findMany({
          where: { leagueId },
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
      const eventMap = new Map<number, { name: string; date: Date; grossScores: number[] }>();
      for (const r of rounds) {
        const eid = r.event.id;
        const existing = eventMap.get(eid);
        if (existing) {
          existing.grossScores.push(r.gross);
        } else {
          eventMap.set(eid, { name: r.event.name, date: r.event.date, grossScores: [r.gross] });
        }
      }

      const grossTrend = [...eventMap.values()]
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .map((e) => ({
          name: e.name,
          date: e.date,
          avgGross:
            Math.round((e.grossScores.reduce((s, v) => s + v, 0) / e.grossScores.length) * 10) / 10,
          lowGross: Math.min(...e.grossScores),
        }));

      // ── Weekly player trend (avg gross/net by event week) ─────────────
      const weeklyEvents = [
        ...new Map(rounds.map((r) => [Number(r.event.id), r.event])).values(),
      ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

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
          eventDate: round.event.date,
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
        (best: any, r) => (!best || Number(r.pointsEarned) > Number(best.pointsEarned) ? r : best),
        null,
      );

      const records = {
        lowGross: buildRecord(lowGrossRound, 'gross'),
        lowNet: buildRecord(lowNetRound, 'net'),
        mostBirdies: buildRecord(mostBirdiesRound, 'birdies'),
        mostPoints: buildRecord(mostPointsRound, 'pointsEarned'),
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
              leagueId,
              isDeleted: false,
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
                  date: true,
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
              leagueId,
              isDeleted: false,
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
          eventDate: (score.round.event?.date as Date) || new Date(0),
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
        };
      }

      if (lowNetTeam) {
        records.lowNet = {
          playerName: lowNetTeam.teamName,
          value: lowNetTeam.netTotal,
          eventName: lowNetTeam.eventName,
          eventDate: lowNetTeam.eventDate,
        };
      }

      // ── Season skins ─────────────────────────────────
      const allScores = await prisma.score.findMany({
        where: { round: { event: { leagueId, isDeleted: false }, status: 'completed' } },
        include: {
          round: {
            include: {
              player: true,
              event: { select: { id: true, name: true, format: true, scoringFormat: true } },
            },
          },
        },
      });

      let grossSkinsLeaderboard: any[] = [];
      let netSkinsLeaderboard: any[] = [];

      if (standingsMode === 'team') {
        const grossSkinCounts = new Map<number, { name: string; skins: number }>();
        const netSkinCounts = new Map<number, { name: string; skins: number }>();
        const grossTeamHoleMap = new Map<string, Map<number, number>>();
        const netTeamHoleMap = new Map<string, Map<number, number>>();

        for (const s of allScores) {
          const eventFormat = normalizeEventFormat(s.round.event?.format, 'individual');
          const scoringFormat = normalizeScoringFormat(s.round.event?.scoringFormat, 'stroke');
          if (eventFormat !== 'team' || scoringFormat !== 'stroke') continue;

          const eventId = Number(s.round.event.id);
          const playerId = Number(s.round.playerId);
          const teamId =
            Number(s.round.player?.teamId || 0) ||
            Number(eventPlayerTeamMap.get(`${eventId}-${playerId}`) || 0);
          if (!teamId) continue;

          const holeKey = `${eventId}-${s.hole}`;

          const grossByTeam = grossTeamHoleMap.get(holeKey) || new Map<number, number>();
          const gross = Number(s.gross);
          if (Number.isFinite(gross) && gross > 0) {
            const current = grossByTeam.get(teamId);
            if (current == null || gross < current) {
              grossByTeam.set(teamId, gross);
            }
            grossTeamHoleMap.set(holeKey, grossByTeam);
          }

          const netByTeam = netTeamHoleMap.get(holeKey) || new Map<number, number>();
          const net = Number(s.net);
          if (Number.isFinite(net) && net > 0) {
            const current = netByTeam.get(teamId);
            if (current == null || net < current) {
              netByTeam.set(teamId, net);
            }
            netTeamHoleMap.set(holeKey, netByTeam);
          }
        }

        for (const scoresByTeam of grossTeamHoleMap.values()) {
          if (scoresByTeam.size < 2) continue;
          const values = [...scoresByTeam.values()];
          const min = Math.min(...values);
          const winners = [...scoresByTeam.entries()].filter(([, score]) => score === min);
          if (winners.length !== 1) continue;

          const teamId = winners[0][0];
          const existing = grossSkinCounts.get(teamId);
          if (existing) existing.skins += 1;
          else
            grossSkinCounts.set(teamId, {
              name: teamNameMap.get(teamId) || `Team ${teamId}`,
              skins: 1,
            });
        }

        for (const scoresByTeam of netTeamHoleMap.values()) {
          if (scoresByTeam.size < 2) continue;
          const values = [...scoresByTeam.values()];
          const min = Math.min(...values);
          const winners = [...scoresByTeam.entries()].filter(([, score]) => score === min);
          if (winners.length !== 1) continue;

          const teamId = winners[0][0];
          const existing = netSkinCounts.get(teamId);
          if (existing) existing.skins += 1;
          else
            netSkinCounts.set(teamId, {
              name: teamNameMap.get(teamId) || `Team ${teamId}`,
              skins: 1,
            });
        }

        grossSkinsLeaderboard = [...grossSkinCounts.entries()]
          .map(([teamId, d]) => ({ playerId: teamId, teamId, name: d.name, skins: d.skins }))
          .sort((a, b) => b.skins - a.skins)
          .slice(0, 3);

        netSkinsLeaderboard = [...netSkinCounts.entries()]
          .map(([teamId, d]) => ({ playerId: teamId, teamId, name: d.name, skins: d.skins }))
          .sort((a, b) => b.skins - a.skins)
          .slice(0, 3);
      } else {
        // Aggregate gross skins: count holes won per player across all events
        const grossSkinCounts = new Map<number, { name: string; skins: number }>();
        const grossHoleMap = new Map<
          string,
          { playerId: number; name: string; gross: number } | null
        >();
        for (const s of allScores) {
          const key = `${s.round.event.id}-${s.hole}`;
          const entry = grossHoleMap.get(key);
          const playerName = `${s.round.player.firstName} ${s.round.player.lastName}`;
          if (!entry) {
            grossHoleMap.set(key, { playerId: s.round.playerId, name: playerName, gross: s.gross });
          } else if (s.gross < entry.gross) {
            grossHoleMap.set(key, { playerId: s.round.playerId, name: playerName, gross: s.gross });
          } else if (s.gross === entry.gross) {
            grossHoleMap.set(key, null);
          }
        }
        for (const winner of grossHoleMap.values()) {
          if (!winner) continue;
          const existing = grossSkinCounts.get(winner.playerId);
          if (existing) existing.skins++;
          else grossSkinCounts.set(winner.playerId, { name: winner.name, skins: 1 });
        }
        grossSkinsLeaderboard = [...grossSkinCounts.entries()]
          .map(([playerId, d]) => ({ playerId, name: d.name, skins: d.skins }))
          .sort((a, b) => b.skins - a.skins)
          .slice(0, 3);

        // Aggregate net skins
        const netSkinCounts = new Map<number, { name: string; skins: number }>();
        const netHoleMap = new Map<
          string,
          { playerId: number; name: string; net: number } | null
        >();
        for (const s of allScores) {
          const key = `${s.round.event.id}-${s.hole}`;
          const entry = netHoleMap.get(key);
          const playerName = `${s.round.player.firstName} ${s.round.player.lastName}`;
          if (!entry) {
            netHoleMap.set(key, { playerId: s.round.playerId, name: playerName, net: s.net });
          } else if (s.net < entry.net) {
            netHoleMap.set(key, { playerId: s.round.playerId, name: playerName, net: s.net });
          } else if (s.net === entry.net) {
            netHoleMap.set(key, null);
          }
        }
        for (const winner of netHoleMap.values()) {
          if (!winner) continue;
          const existing = netSkinCounts.get(winner.playerId);
          if (existing) existing.skins++;
          else netSkinCounts.set(winner.playerId, { name: winner.name, skins: 1 });
        }
        netSkinsLeaderboard = [...netSkinCounts.entries()]
          .map(([playerId, d]) => ({ playerId, name: d.name, skins: d.skins }))
          .sort((a, b) => b.skins - a.skins)
          .slice(0, 3);
      }

      const skins = { gross: grossSkinsLeaderboard, net: netSkinsLeaderboard };

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
        standingsMode,
        standings,
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
