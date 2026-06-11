import { Request, Response } from 'express';
import { prisma } from '../../prisma';
import { Round } from '../services/round';
import { normalizeEventFormat, normalizeScoringFormat } from '../utils/event-mode';
import { getLeagueScoreOrder } from '../utils/score-order';

type TeamPointsRow = { teamId: number; points: number };

const toStrokePointsArray = (raw: unknown): number[] => {
  if (Array.isArray(raw)) {
    return raw.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v >= 0);
  }

  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((v) => Number.isFinite(v) && v >= 0);
  }

  return [];
};

const finalizeIndividualStrokeEventPoints = async (eventId: number) => {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      strokePoints: true,
      rounds: {
        where: { status: 'completed' },
        select: {
          id: true,
          playerId: true,
          net: true,
          gross: true,
          scores: {
            select: {
              net: true,
              par: true,
            },
          },
        },
      },
    },
  });

  if (!event || event.rounds.length === 0) return;

  const strokePoints = toStrokePointsArray(event.strokePoints);

  // If no strokePoints table is configured, fall back to Stableford-style points
  // from each round's hole net/par data so points still finalize once per event.
  if (strokePoints.length === 0) {
    const stablefordPoints = (net: number, par: number) => {
      const diff = net - par;
      if (diff <= -2) return 4;
      if (diff === -1) return 3;
      if (diff === 0) return 2;
      if (diff === 1) return 1;
      return 0;
    };

    await prisma.$transaction(
      event.rounds.map((round) => {
        const points = (round.scores || []).reduce((sum, score) => {
          const net = Number(score.net);
          const par = Number(score.par);
          if (!Number.isFinite(net) || !Number.isFinite(par)) return sum;
          return sum + stablefordPoints(net, par);
        }, 0);

        return prisma.round.update({
          where: { id: round.id },
          data: { pointsEarned: points },
        });
      }),
    );

    return;
  }

  const ranked = [...event.rounds].sort((a, b) => {
    if (Number(a.net) !== Number(b.net)) return Number(a.net) - Number(b.net);
    return Number(a.gross) - Number(b.gross);
  });

  const roundPoints = new Map<number, number>();
  let cursor = 0;

  while (cursor < ranked.length) {
    const current = ranked[cursor];
    let end = cursor;

    while (
      end + 1 < ranked.length &&
      Number(ranked[end + 1].net) === Number(current.net) &&
      Number(ranked[end + 1].gross) === Number(current.gross)
    ) {
      end += 1;
    }

    let pointsSum = 0;
    for (let idx = cursor; idx <= end; idx += 1) {
      pointsSum += Number(strokePoints[idx] ?? 0);
    }
    const tiePoints = (Math.round((pointsSum / (end - cursor + 1)) * 10) || 0) / 10;

    for (let idx = cursor; idx <= end; idx += 1) {
      roundPoints.set(Number(ranked[idx].id), tiePoints);
    }

    cursor = end + 1;
  }

  await prisma.$transaction(
    [...roundPoints.entries()].map(([roundId, points]) =>
      prisma.round.update({
        where: { id: roundId },
        data: { pointsEarned: points },
      }),
    ),
  );
};

const toNumber = (value: unknown, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const normalizeTeamPoints = (rows: any[]): TeamPointsRow[] => {
  const merged = new Map<number, number>();

  for (const row of rows) {
    const teamId = toNumber(row?.teamId, NaN);
    if (!Number.isFinite(teamId)) continue;

    const current = merged.get(teamId) || 0;
    merged.set(teamId, current + toNumber(row?.points, 0));
  }

  return [...merged.entries()].map(([teamId, points]) => ({ teamId, points }));
};

const syncTeamEventPoints = async (
  leagueId: number,
  eventId: number,
  teamPointsRows: TeamPointsRow[],
) => {
  const normalized = normalizeTeamPoints(teamPointsRows);
  if (normalized.length === 0) return;

  await prisma.$transaction(async (tx) => {
    for (const row of normalized) {
      const existing = await tx.team_event_points.findUnique({
        where: {
          teamId_eventId: {
            teamId: row.teamId,
            eventId,
          },
        },
      });

      const previousPoints = Number(existing?.points || 0);
      const delta = row.points - previousPoints;

      await tx.team_event_points.upsert({
        where: {
          teamId_eventId: {
            teamId: row.teamId,
            eventId,
          },
        },
        create: {
          leagueId,
          teamId: row.teamId,
          eventId,
          points: row.points,
        },
        update: {
          points: row.points,
        },
      });

      if (delta !== 0) {
        await tx.team.update({
          where: { id: row.teamId },
          data: {
            seasonPoints: {
              increment: delta,
            },
          },
        });
      }
    }
  });
};

const calculateTeamStrokeBestBallPoints = async (eventId: number, flightId: number) => {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      flights: {
        where: { id: flightId },
        include: {
          players: true,
          teams: true,
        },
      },
    },
  });

  if (!event || event.flights.length === 0) return [];

  const flight = event.flights[0];
  const teamIds = [
    ...new Set((flight.teams || []).map((t: any) => Number(t.teamId)).filter(Boolean)),
  ];

  if (teamIds.length < 2) return [];

  const playersByTeamId = new Map<number, number[]>();
  for (const teamId of teamIds) {
    const playerIds = (flight.players || [])
      .filter((p: any) => Number(p.teamId) === teamId)
      .map((p: any) => Number(p.playerId))
      .filter(Boolean);
    if (playerIds.length > 0) playersByTeamId.set(teamId, playerIds);
  }

  if (playersByTeamId.size < 2) return [];

  const allPlayerIds = [...playersByTeamId.values()].flat();

  const roundRows = await prisma.round.findMany({
    where: {
      eventId,
      playerId: { in: allPlayerIds },
    },
    include: {
      scores: {
        select: { hole: true, net: true, par: true },
        orderBy: { hole: 'asc' },
      },
    },
  });

  const scoreByPlayerId = new Map<number, Map<number, { net: number; par: number }>>();
  for (const row of roundRows) {
    scoreByPlayerId.set(
      Number(row.playerId),
      new Map(
        (row.scores || []).map((s: any) => [
          Number(s.hole),
          { net: Number(s.net), par: Number(s.par) },
        ]),
      ),
    );
  }

  const holeSet = new Set<number>();
  roundRows.forEach((row) => {
    (row.scores || []).forEach((score: any) => {
      if (Number.isFinite(Number(score.hole))) {
        holeSet.add(Number(score.hole));
      }
    });
  });
  const holeNumbers = [...holeSet.values()].sort((a, b) => a - b);

  const bestBallForHole = (playerIds: number[], hole: number) => {
    let bestNet = Number.POSITIVE_INFINITY;
    let parForHole = 0;

    for (const playerId of playerIds) {
      const score = scoreByPlayerId.get(playerId)?.get(hole);
      if (
        score &&
        Number.isFinite(score.net) &&
        score.net > 0 &&
        (!Number.isFinite(bestNet) || score.net < bestNet)
      ) {
        bestNet = score.net;
        parForHole = Number.isFinite(score.par) ? score.par : 0;
      }
    }

    if (!Number.isFinite(bestNet)) return null;
    return { net: bestNet, par: parForHole };
  };

  const perTeamTotals = new Map<number, { netTotal: number; stablefordTotal: number }>();
  for (const teamId of playersByTeamId.keys()) {
    perTeamTotals.set(teamId, { netTotal: 0, stablefordTotal: 0 });
  }

  for (const hole of holeNumbers) {
    for (const [teamId, playerIds] of playersByTeamId.entries()) {
      const best = bestBallForHole(playerIds, hole);
      if (!best) continue;

      const aggregate = perTeamTotals.get(teamId);
      if (!aggregate) continue;

      aggregate.netTotal += best.net;

      const diff = best.net - best.par;
      if (diff <= -2) aggregate.stablefordTotal += 4;
      else if (diff === -1) aggregate.stablefordTotal += 3;
      else if (diff === 0) aggregate.stablefordTotal += 2;
      else if (diff === 1) aggregate.stablefordTotal += 1;
    }
  }

  const strokePoints = toStrokePointsArray((event as any)?.strokePoints);
  if (strokePoints.length > 0) {
    const ranked = [...perTeamTotals.entries()].sort((a, b) => a[1].netTotal - b[1].netTotal);
    const assigned = new Map<number, number>();
    let cursor = 0;

    while (cursor < ranked.length) {
      const [_, current] = ranked[cursor];
      let end = cursor;
      while (end + 1 < ranked.length && ranked[end + 1][1].netTotal === current.netTotal) {
        end += 1;
      }

      let sum = 0;
      for (let idx = cursor; idx <= end; idx += 1) {
        sum += Number(strokePoints[idx] ?? 0);
      }
      const tiePoints = (Math.round((sum / (end - cursor + 1)) * 10) || 0) / 10;

      for (let idx = cursor; idx <= end; idx += 1) {
        assigned.set(Number(ranked[idx][0]), tiePoints);
      }

      cursor = end + 1;
    }

    return [...assigned.entries()].map(([teamId, points]) => ({ teamId, points }));
  }

  return [...perTeamTotals.entries()].map(([teamId, totals]) => ({
    teamId,
    points: totals.stablefordTotal,
  }));
};

// Score seed - overall scores for each player in an event
export default class ScoreController {
  static getLeagueEventScores = async (req: Request, res: Response) => {
    try {
      const { leagueId, eventId } = req.params;
      const numericLeagueId = Number(leagueId);
      const numericEventId = Number(eventId);

      const event = await prisma.event.findFirst({
        where: { id: numericEventId, leagueId: numericLeagueId, isDeleted: false },
        include: {
          course: true,
          tee: true,
          flights: {
            include: {
              players: {
                include: {
                  player: true,
                },
              },
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
          rounds: {
            include: {
              player: {
                include: {
                  team: true,
                },
              },
              scores: true,
            },
          },
        },
      });

      if (!event) {
        return res.status(404).json({ message: 'Event not found' });
      }

      return res.status(200).json(event);
    } catch (error) {
      console.error('Error fetching league event scores:', error);
      return res.status(500).json({ message: 'Failed to fetch league event scores' });
    }
  };

  static createLeagueEventScores = async (req: Request, res: Response) => {
    try {
      const leagueId = Number(req.params.leagueId);
      const { eventId, flightId, players, teams } = req.body;

      const numericEventId = Number(eventId);
      const numericFlightId = Number(flightId);

      const event = await prisma.event.findUnique({ where: { id: numericEventId } });
      if (!event) {
        return res.status(404).json({ message: 'Event not found' });
      }
      if (Number(event.leagueId) !== leagueId) {
        return res.status(400).json({ message: 'Event does not belong to this league' });
      }

      const scoreOrder = await getLeagueScoreOrder(leagueId);
      if (scoreOrder.nextScorableEventId !== numericEventId) {
        return res.status(409).json({
          message: 'Scores must be entered in event order. Complete earlier events first.',
        });
      }

      const eventFormat = normalizeEventFormat(event.format, 'individual');
      const scoringFormat = normalizeScoringFormat(event.scoringFormat, 'stroke');

      for (const player of players) {
        const normalizedPlayer =
          eventFormat === 'individual' && scoringFormat === 'stroke'
            ? { ...player, points: 0 }
            : player;
        const r = new Round(numericEventId, normalizedPlayer);
        await r.process();
      }

      const teamRows =
        eventFormat === 'team' && scoringFormat === 'stroke'
          ? await calculateTeamStrokeBestBallPoints(numericEventId, numericFlightId)
          : normalizeTeamPoints((teams ?? []).filter((t: any) => t.teamId != null));

      await syncTeamEventPoints(leagueId, numericEventId, teamRows);

      await prisma.flight.update({
        where: { id: numericFlightId },
        data: { status: 'completed' },
      });

      // Auto-complete the event once all flights are complete
      const allFlights = await prisma.flight.findMany({
        where: { eventId: numericEventId },
        select: { status: true },
      });
      if (allFlights.length > 0 && allFlights.every((f) => f.status === 'completed')) {
        if (eventFormat === 'individual' && scoringFormat === 'stroke') {
          await finalizeIndividualStrokeEventPoints(numericEventId);
        }

        await prisma.event.update({
          where: { id: numericEventId },
          data: { status: 'completed', isComplete: true },
        });
      }

      return res.status(201).json({ message: 'Scores created successfully' });
    } catch (error: any) {
      console.error('Error parsing request data:', error);
      return res.status(400).json({ message: error.message || 'Invalid request data' });
    }
  };

  static updateLeagueEventScores = async (req: Request, res: Response) => {
    try {
      const leagueId = Number(req.params.leagueId);
      const eventId = Number(req.params.eventId);
      const scoresData = req.body;

      const event = await prisma.event.findUnique({ where: { id: eventId } });
      if (!event) {
        return res.status(404).json({ message: 'Event not found' });
      }
      if (Number(event.leagueId) !== leagueId) {
        return res.status(400).json({ message: 'Event does not belong to this league' });
      }

      const scoreOrder = await getLeagueScoreOrder(leagueId);
      if (scoreOrder.latestScoredEventId !== eventId) {
        return res.status(409).json({
          message: 'Only the latest scored event can be updated.',
        });
      }

      const eventFormat = normalizeEventFormat(event.format, 'individual');
      const scoringFormat = normalizeScoringFormat(event.scoringFormat, 'stroke');

      for (const player of scoresData.players) {
        const existingRound = await prisma.round.findFirst({
          where: {
            eventId,
            playerId: player.playerId,
          },
        });

        if (!existingRound) {
          console.warn(
            `No existing round found for player ${player.playerId} in event ${eventId}. Skipping score update for this player.`,
          );
          continue;
        }

        const normalizedPlayer =
          eventFormat === 'individual' && scoringFormat === 'stroke'
            ? { ...player, points: 0 }
            : player;
        const r = new Round(eventId, normalizedPlayer, existingRound);
        await r.process();
      }

      const teamRows =
        eventFormat === 'team' && scoringFormat === 'stroke'
          ? await calculateTeamStrokeBestBallPoints(eventId, Number(scoresData.flightId))
          : normalizeTeamPoints((scoresData.teams ?? []).filter((t: any) => t.teamId != null));

      await syncTeamEventPoints(leagueId, eventId, teamRows);

      await prisma.flight.update({
        where: { id: scoresData.flightId },
        data: { status: 'completed' },
      });

      // Auto-complete the event once all flights are complete
      const allFlights = await prisma.flight.findMany({
        where: { eventId },
        select: { status: true },
      });
      if (allFlights.length > 0 && allFlights.every((f) => f.status === 'completed')) {
        if (eventFormat === 'individual' && scoringFormat === 'stroke') {
          await finalizeIndividualStrokeEventPoints(eventId);
        }

        await prisma.event.update({
          where: { id: eventId },
          data: { status: 'completed', isComplete: true },
        });
      }

      return res.status(200).json({ message: 'Scores updated successfully' });
    } catch (error) {
      console.error('Error parsing request data:', error);
      return res.status(400).json({ message: 'Invalid request data' });
    }
  };
}
