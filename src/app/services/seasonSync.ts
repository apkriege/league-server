import { lockLeagueCapacity } from './billingLock';
import { prisma } from '../../prisma';
import { dateOnlyInTimeZone } from '../utils/time-zone';
import { calculateRoundDifferential, calculateStrokePops } from '../utils/tee-rating';
import { modelEventTeeForRound, selectEventRouteHoles } from '../utils/event-route';
import { normalizeEventFormat } from '../utils/event-mode';
import { calculateHandicapIndexFromDifferentials } from '../utils/usga-handicap';
import { getHandicapHoleBasis, type HandicapHoleBasis } from '../utils/league-hole-format';
import {
  addTeamEventPoints,
  applyMaximumScore,
  assignBestBallPoints,
  assignFourBallMatchPoints,
  assignMatchPlayPoints,
  assignMaximumScorePoints,
  assignStablefordPoints,
  assignStrokePlayPoints,
  assignTeamAggregatePoints,
  assignTeamMatchPlayPoints,
  getScoringMode,
  normalizeScoringConfiguration,
  persistSharedTeamRounds,
  recalculateSharedTeamEventPoints,
  type ScoredHole,
  type ScoringHole,
  type ScoringRound,
  type TeamEventPointsAccumulator,
} from '../scoring';

type PrismaTx = import('@prisma/client').Prisma.TransactionClient;

type ScoreStats = {
  totalGross: number;
  totalNet: number;
  totalAdjusted: number;
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  doubleBogeys: number;
  tripleBogeys: number;
  netEagles: number;
  netBirdies: number;
  netPars: number;
  netBogeys: number;
  netDoubleBogeys: number;
  netTripleBogeys: number;
};

type PlayerSeasonState = {
  id: number;
  startingHandicap: number;
  currentHandicap: number;
  differentials: number[];
  seasonPoints: number;
  roundsUpdated: number;
};

type RoundCalculation = ScoringRound & {
  round: any;
  preHandicap: number;
  postHandicap: number;
  differential: number;
  adjusted: number;
  stats: ScoreStats;
  tee: ReturnType<typeof modelEventTeeForRound>;
};

export type SeasonSyncResult = {
  leagueId: number;
  eventsProcessed: number;
  roundsUpdated: number;
  scoresUpdated: number;
  playersUpdated: number;
  teamPointRowsUpdated: number;
  skippedEvents: Array<{ eventId: number; name: string; reason: string }>;
};

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const roundToOneDecimal = (value: number) => Math.round(value * 10) / 10;

const roundToTwoDecimals = (value: number) => Number(value.toFixed(2));

const getHoleNumber = (hole: any) => Number(hole?.num ?? hole?.hole ?? 0);

const normalizeHoles = (holes: any): ScoringHole[] => {
  if (!Array.isArray(holes)) return [];

  return holes
    .map((hole: any) => ({
      num: getHoleNumber(hole),
      par: toNumber(hole?.par, 0),
      hcp: toNumber(hole?.hcp ?? hole?.handicap, 999),
    }))
    .filter((hole) => hole.num > 0)
    .sort((a, b) => a.num - b.num);
};

const calculateStrokeplayPops = (handicap: number, holes: ScoringHole[]) => {
  return calculateStrokePops(handicap, holes);
};

const calculateStats = (scores: ScoredHole[]): ScoreStats => {
  const stats = {
    totalGross: 0,
    totalNet: 0,
    totalAdjusted: 0,
    eagles: 0,
    birdies: 0,
    pars: 0,
    bogeys: 0,
    doubleBogeys: 0,
    tripleBogeys: 0,
    netEagles: 0,
    netBirdies: 0,
    netPars: 0,
    netBogeys: 0,
    netDoubleBogeys: 0,
    netTripleBogeys: 0,
  };

  for (const score of scores) {
    stats.totalGross += score.gross;
    stats.totalNet += score.net;
    stats.totalAdjusted += score.adjusted;

    const grossDiff = score.gross - score.par;
    if (grossDiff <= -2) stats.eagles += 1;
    else if (grossDiff === -1) stats.birdies += 1;
    else if (grossDiff === 0) stats.pars += 1;
    else if (grossDiff === 1) stats.bogeys += 1;
    else if (grossDiff === 2) stats.doubleBogeys += 1;
    else if (grossDiff >= 3) stats.tripleBogeys += 1;

    const netDiff = score.net - score.par;
    if (netDiff <= -2) stats.netEagles += 1;
    else if (netDiff === -1) stats.netBirdies += 1;
    else if (netDiff === 0) stats.netPars += 1;
    else if (netDiff === 1) stats.netBogeys += 1;
    else if (netDiff === 2) stats.netDoubleBogeys += 1;
    else if (netDiff >= 3) stats.netTripleBogeys += 1;
  }

  return stats;
};

const calculateNextHandicap = ({
  state,
  adjustedScore,
  tee,
  handicapHoleBasis,
}: {
  state: PlayerSeasonState;
  adjustedScore: number;
  tee: any;
  handicapHoleBasis: HandicapHoleBasis;
}) => {
  const differential = calculateRoundDifferential(
    adjustedScore,
    tee,
    state.currentHandicap,
    handicapHoleBasis,
  );
  const previousDifferentials = state.differentials.slice(-19);
  const differentials = [...previousDifferentials, differential];
  const preHandicap = state.currentHandicap;
  const nextHandicap =
    calculateHandicapIndexFromDifferentials(
      differentials,
      preHandicap,
      state.startingHandicap,
    ) ?? preHandicap;

  return {
    differential,
    handicap: nextHandicap,
  };
};

const buildModeledScores = ({
  scoreRows,
  holes,
  handicap,
}: {
  scoreRows: any[];
  holes: ScoringHole[];
  handicap: number;
}) => {
  const holeByNumber = new Map(holes.map((hole) => [hole.num, hole]));
  const pops = calculateStrokeplayPops(handicap, holes);

  return scoreRows
    .map((score: any) => {
      const holeNumber = toNumber(score?.hole, 0);
      const hole = holeByNumber.get(holeNumber);
      if (!hole) return null;

      const gross = toNumber(score?.gross, 0);
      const popCount = pops.get(holeNumber) || 0;

      return {
        id: Number(score.id),
        hole: holeNumber,
        par: hole.par,
        gross,
        adjusted: Math.min(gross, hole.par + 2 + popCount),
        net: Math.max(0, gross - popCount),
        pops: popCount,
      } satisfies ScoredHole;
    })
    .filter((score): score is ScoredHole => Boolean(score))
    .sort((a, b) => a.hole - b.hole);
};

const initializePlayerState = (player: any): PlayerSeasonState => {
  const startingHandicap = toNumber(player?.startingHandicap, toNumber(player?.handicap, 0));

  return {
    id: Number(player.id),
    startingHandicap,
    currentHandicap: startingHandicap,
    differentials: [],
    seasonPoints: 0,
    roundsUpdated: 0,
  };
};

const getOrCreatePlayerState = (states: Map<number, PlayerSeasonState>, player: any) => {
  const playerId = Number(player?.id);
  const existing = states.get(playerId);
  if (existing) return existing;

  const state = initializePlayerState(player);
  states.set(playerId, state);
  return state;
};

const getFlightPlayerLookup = (event: any) => {
  const lookup = new Map<number, any>();

  for (const flight of event.flights || []) {
    for (const flightPlayer of flight.players || []) {
      lookup.set(Number(flightPlayer.playerId), flightPlayer);
    }
  }

  return lookup;
};

const recalculateEvent = async ({
  tx,
  event,
  playerStates,
  teamPoints,
  handicapHoleBasis,
}: {
  tx: PrismaTx;
  event: any;
  playerStates: Map<number, PlayerSeasonState>;
  teamPoints: TeamEventPointsAccumulator;
  handicapHoleBasis: HandicapHoleBasis;
}) => {
  const holes = normalizeHoles(selectEventRouteHoles(event, 'male').holes);
  const flightPlayerLookup = getFlightPlayerLookup(event);
  const calculations: RoundCalculation[] = [];
  const calculationsByPlayerId = new Map<number, RoundCalculation>();

  for (const round of event.rounds || []) {
    const scoreRows = Array.isArray(round.scores) ? round.scores : [];
    if (scoreRows.length === 0) continue;

    const playerState = getOrCreatePlayerState(playerStates, round.player);
    const preHandicap = playerState.currentHandicap;
    const tee = modelEventTeeForRound(event, round.player?.gender);
    const playerHoles = normalizeHoles(tee.holes);
    const scores = buildModeledScores({
      scoreRows,
      holes: playerHoles,
      handicap: preHandicap,
    });

    if (scores.length === 0) continue;

    const stats = calculateStats(scores);
    const handicapData = calculateNextHandicap({
      state: playerState,
      adjustedScore: stats.totalAdjusted,
      tee,
      handicapHoleBasis,
    });
    const flightPlayer = flightPlayerLookup.get(Number(round.playerId));
    const opponentId = toNumber(round.opponentId ?? flightPlayer?.opponentId, 0) || null;
    const teamId = toNumber(flightPlayer?.teamId ?? round.player?.teamId, 0) || null;

    const calculation: RoundCalculation = {
      round,
      playerId: Number(round.playerId),
      teamId,
      opponentId,
      preHandicap,
      playerHandicap: preHandicap,
      postHandicap: handicapData.handicap,
      differential: handicapData.differential,
      gross: stats.totalGross,
      net: stats.totalNet,
      adjusted: stats.totalAdjusted,
      stats,
      scores,
      holes: playerHoles,
      pointsEarned: 0,
      matchPoints: 0,
      tee,
    };

    calculations.push(calculation);
    calculationsByPlayerId.set(calculation.playerId, calculation);

    playerState.currentHandicap = handicapData.handicap;
    playerState.differentials.push(handicapData.differential);
    playerState.roundsUpdated += 1;
  }

  if (calculations.length === 0) {
    return {
      roundsUpdated: 0,
      scoresUpdated: 0,
    };
  }

  const eventFormat = normalizeEventFormat(event.format, 'individual');
  const scoringMode = getScoringMode(event.scoringMode).id;
  const pointsEnabled = event.pointsEnabled !== false;
  const scoredTeamIds = new Set(
    eventFormat === 'team'
      ? calculations
          .map((calculation) => calculation.teamId)
          .filter((teamId): teamId is number => teamId != null)
      : [],
  );

  if (eventFormat === 'team') {
    for (const teamId of scoredTeamIds) {
      addTeamEventPoints(teamPoints, Number(event.leagueId), Number(event.id), teamId, 0);
    }
  }

  if (eventFormat === 'individual' && scoringMode === 'stroke-play') {
    assignStrokePlayPoints(event, calculations, holes);
  } else if (eventFormat === 'individual' && scoringMode === 'stableford') {
    assignStablefordPoints(event, calculations, holes);
  } else if (eventFormat === 'individual' && scoringMode === 'maximum-score') {
    assignMaximumScorePoints(event, calculations, holes);
  } else if (eventFormat === 'individual' && scoringMode === 'match-play') {
    assignMatchPlayPoints({ event, holes, rounds: calculations });
  } else if (eventFormat === 'team' && scoringMode === 'match-play') {
    assignTeamMatchPlayPoints({
      event,
      holes,
      flights: event.flights || [],
      roundsByPlayerId: calculationsByPlayerId,
      teamPoints,
    });
  } else if (eventFormat === 'team' && scoringMode === 'best-ball') {
    assignBestBallPoints({
      event,
      holes,
      flights: event.flights || [],
      roundsByPlayerId: calculationsByPlayerId,
      teamPoints,
    });
  } else if (eventFormat === 'team' && scoringMode === 'four-ball-match') {
    assignFourBallMatchPoints({
      event,
      holes,
      flights: event.flights || [],
      roundsByPlayerId: calculationsByPlayerId,
      teamPoints,
    });
  } else if (
    eventFormat === 'team' &&
    (scoringMode === 'stroke-play' ||
      scoringMode === 'stableford' ||
      scoringMode === 'maximum-score')
  ) {
    assignTeamAggregatePoints({
      event,
      mode: scoringMode,
      flights: event.flights || [],
      roundsByPlayerId: calculationsByPlayerId,
      teamPoints,
      holes,
    });
  }

  if (!pointsEnabled) {
    for (const calculation of calculations) {
      calculation.pointsEarned = 0;
      calculation.matchPoints = 0;
    }
    for (const teamId of scoredTeamIds) {
      const key = `${teamId}:${Number(event.id)}`;
      const existing = teamPoints.get(key);
      if (existing) existing.points = 0;
    }
  }

  const maximumScoreRule =
    scoringMode === 'maximum-score'
      ? normalizeScoringConfiguration(event.scoringConfig, 'maximum-score').maximumScore
      : null;
  for (const calculation of calculations) {
    calculation.competitionGross = calculation.gross;
    if (!maximumScoreRule) continue;
    calculation.competitionGross = 0;
    calculation.competitionNet = 0;
    for (const score of calculation.scores) {
      const result = applyMaximumScore({
        gross: score.gross,
        par: score.par,
        pops: calculation.competitionPops?.get(score.hole) || 0,
        rule: maximumScoreRule,
      });
      calculation.competitionGross += result.gross;
      calculation.competitionNet += result.net;
    }
  }

  let scoresUpdated = 0;

  for (const calculation of calculations) {
    await tx.round.update({
      where: { id: Number(calculation.round.id) },
      data: {
        opponentId: calculation.opponentId,
        courseId: Number(event.courseId),
        teeId: Number(event.teeId),
        status: 'completed',
        holesPlayed: Number(event.holes),
        gross: calculation.gross,
        net: calculation.net,
        adjusted: calculation.adjusted,
        putts: toNumber(calculation.round.putts, 0),
        courseRating: toNumber(calculation.tee.rating, 0),
        courseSlope: toNumber(calculation.tee.slope, 0),
        playingHandicap: calculation.playingHandicap ?? Math.round(calculation.playerHandicap),
        competitionGross: calculation.competitionGross ?? calculation.gross,
        competitionNet: calculation.competitionNet ?? calculation.net,
        differential: calculation.differential,
        preHandicap: roundToTwoDecimals(calculation.preHandicap),
        postHandicap: calculation.postHandicap,
        pointsEarned: roundToOneDecimal(calculation.pointsEarned),
        matchPoints: roundToOneDecimal(calculation.matchPoints),
        eagles: calculation.stats.eagles,
        birdies: calculation.stats.birdies,
        pars: calculation.stats.pars,
        bogeys: calculation.stats.bogeys,
        doubleBogeys: calculation.stats.doubleBogeys,
        tripleBogeys: calculation.stats.tripleBogeys,
        netEagles: calculation.stats.netEagles,
        netBirdies: calculation.stats.netBirdies,
        netPars: calculation.stats.netPars,
        netBogeys: calculation.stats.netBogeys,
        netDoubleBogeys: calculation.stats.netDoubleBogeys,
        netTripleBogeys: calculation.stats.netTripleBogeys,
        date: dateOnlyInTimeZone(event.startsAt, event.timeZone),
      },
    });

    const playerState = playerStates.get(calculation.playerId);
    if (playerState) {
      playerState.seasonPoints += roundToOneDecimal(
        calculation.pointsEarned + calculation.matchPoints,
      );
    }

    for (const score of calculation.scores) {
      const competitionResult = maximumScoreRule
        ? applyMaximumScore({
            gross: score.gross,
            par: score.par,
            pops: calculation.competitionPops?.get(score.hole) || 0,
            rule: maximumScoreRule,
          })
        : {
            gross: score.gross,
            net: score.gross - (calculation.competitionPops?.get(score.hole) || 0),
          };
      await tx.score.update({
        where: {
          roundId_hole: {
            roundId: Number(calculation.round.id),
            hole: score.hole,
          },
        },
        data: {
          par: score.par,
          gross: score.gross,
          adjusted: score.adjusted,
          net: score.net,
          popsReceived: score.pops,
          competitionGross: competitionResult.gross,
          competitionNet: competitionResult.net,
          competitionPops: calculation.competitionPops?.get(score.hole) || 0,
        },
      });
      scoresUpdated += 1;
    }
  }

  return {
    roundsUpdated: calculations.length,
    scoresUpdated,
  };
};

const rankByPoints = (rows: Array<{ id: number; points: number }>) => {
  const ranked = [...rows].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return a.id - b.id;
  });
  const ranks = new Map<number, number>();
  let previousPoints: number | null = null;
  let previousRank = 0;

  ranked.forEach((row, index) => {
    const rank = previousPoints === row.points ? previousRank : index + 1;
    ranks.set(row.id, rank);
    previousPoints = row.points;
    previousRank = rank;
  });

  return ranks;
};

export class SeasonSync {
  static async recalculateLeague(
    leagueId: number,
    transactionClient?: PrismaTx,
  ): Promise<SeasonSyncResult> {
    if (!Number.isFinite(leagueId) || leagueId <= 0) {
      throw new Error('A valid league id is required.');
    }

    const recalculate = async (tx: PrismaTx) => {
        await lockLeagueCapacity(tx, leagueId);
        const league = await tx.league.findFirst({
          where: {
            id: leagueId,
            deletedAt: null,
          },
          include: {
            players: {
              where: { deletedAt: null },
              include: { handicapAdjustments: { orderBy: [{ effectiveAt: 'asc' }, { id: 'asc' }] } },
            },
            teams: {
              where: { deletedAt: null },
            },
            events: {
              where: {
                deletedAt: null,
                status: { not: 'canceled' },
              },
              orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
              include: {
                course: true,
                tee: true,
                routeSegments: {
                  orderBy: { position: 'asc' },
                  include: { course: true, tee: true },
                },
                flights: {
                  where: { deletedAt: null },
                  include: {
                    players: {
                      where: { deletedAt: null },
                      include: { player: true },
                      orderBy: { id: 'asc' },
                    },
                    teams: {
                      where: { deletedAt: null },
                      include: { team: true },
                      orderBy: { id: 'asc' },
                    },
                  },
                  orderBy: { id: 'asc' },
                },
                rounds: {
                  where: { deletedAt: null },
                  include: {
                    player: true,
                    scores: {
                      orderBy: { hole: 'asc' },
                    },
                  },
                  orderBy: [{ date: 'asc' }, { id: 'asc' }],
                },
                teamRounds: {
                  where: { deletedAt: null, status: 'completed' },
                  include: { scores: { orderBy: { hole: 'asc' } } },
                  orderBy: [{ date: 'asc' }, { id: 'asc' }],
                },
              },
            },
          },
        });

        if (!league) {
          throw new Error('League not found.');
        }

        const playerStates = new Map<number, PlayerSeasonState>();
        for (const player of league.players || []) {
          playerStates.set(Number(player.id), initializePlayerState(player));
        }

        const teamPoints: TeamEventPointsAccumulator = new Map();
        const handicapHoleBasis = getHandicapHoleBasis(league.holeFormat);
        const skippedEvents: SeasonSyncResult['skippedEvents'] = [];

        await tx.team_event_points.deleteMany({
          where: { leagueId },
        });

        await tx.team.updateMany({
          where: {
            leagueId,
            deletedAt: null,
          },
          data: {
            seasonPoints: 0,
            seasonRank: null,
          },
        });

        const adjustments = (league.players ?? []).flatMap((player) =>
          player.handicapAdjustments.map((adjustment) => ({ ...adjustment, playerId: player.id })),
        ).sort((a, b) => a.effectiveAt.getTime() - b.effectiveAt.getTime() || a.id - b.id);
        let adjustmentIndex = 0;
        const applyAdjustments = (through: number) => {
          while (adjustmentIndex < adjustments.length && adjustments[adjustmentIndex].effectiveAt.getTime() <= through) {
            const adjustment = adjustments[adjustmentIndex++];
            const state = playerStates.get(adjustment.playerId);
            if (state) state.currentHandicap = adjustment.handicap;
          }
        };

        let eventsProcessed = 0;
        let roundsUpdated = 0;
        let scoresUpdated = 0;

        for (const event of league.events || []) {
          applyAdjustments(new Date(event.startsAt).getTime());
          if ((event.teamRounds || []).length > 0) {
            for (const flight of event.flights || []) {
              const flightTeamRounds = (event.teamRounds || []).filter(
                (teamRound: any) => Number(teamRound.flightId) === Number(flight.id),
              );
              if (flightTeamRounds.length === 0) continue;

              for (const assignment of flight.players || []) {
                const state = playerStates.get(Number(assignment.playerId));
                if (!state) continue;
                await tx.player.update({
                  where: { id: state.id },
                  data: { handicap: roundToTwoDecimals(state.currentHandicap) },
                });
              }

              await persistSharedTeamRounds({
                db: tx,
                eventId: Number(event.id),
                flightId: Number(flight.id),
                isEdit: true,
                rawTeamScores: flightTeamRounds.map((teamRound: any) => ({
                  teamId: Number(teamRound.teamId),
                  scores: Object.fromEntries(
                    (teamRound.scores || []).map((score: any) => [
                      Number(score.hole),
                      Number(score.gross),
                    ]),
                  ),
                })),
              });
            }
            const recalculatedTeamPoints = await recalculateSharedTeamEventPoints({
              db: tx,
              eventId: Number(event.id),
            });
            for (const row of recalculatedTeamPoints) {
              addTeamEventPoints(
                teamPoints,
                Number(event.leagueId),
                Number(event.id),
                Number(row.teamId),
                Number(row.points),
              );
            }
          }

          if (!event.rounds || event.rounds.length === 0) {
            if ((event.teamRounds || []).length > 0) {
              eventsProcessed += 1;
            } else {
              skippedEvents.push({
                eventId: Number(event.id),
                name: String(event.name),
                reason: 'No existing rounds to recalculate.',
              });
            }
            continue;
          }

          const eventResult = await recalculateEvent({
            tx,
            event,
            playerStates,
            teamPoints,
            handicapHoleBasis,
          });

          if (eventResult.roundsUpdated === 0) {
            skippedEvents.push({
              eventId: Number(event.id),
              name: String(event.name),
              reason: 'No score rows matched the event tee holes.',
            });
            continue;
          }

          eventsProcessed += 1;
          roundsUpdated += eventResult.roundsUpdated;
          scoresUpdated += eventResult.scoresUpdated;
        }

        for (const row of teamPoints.values()) {
          await tx.team_event_points.create({
            data: {
              leagueId: row.leagueId,
              eventId: row.eventId,
              teamId: row.teamId,
              points: roundToOneDecimal(row.points),
            },
          });
        }

        const teamTotals = new Map<number, number>();
        for (const row of teamPoints.values()) {
          teamTotals.set(row.teamId, roundToOneDecimal((teamTotals.get(row.teamId) || 0) + row.points));
        }

        const teamRanks = rankByPoints(
          (league.teams || []).map((team: any) => ({
            id: Number(team.id),
            points: teamTotals.get(Number(team.id)) || 0,
          })),
        );

        for (const team of league.teams || []) {
          const teamId = Number(team.id);
          await tx.team.update({
            where: { id: teamId },
            data: {
              seasonPoints: teamTotals.get(teamId) || 0,
              seasonRank: teamRanks.get(teamId) ?? null,
            },
          });
        }

        const playerRanks = rankByPoints(
          [...playerStates.values()].map((state) => ({
            id: state.id,
            points: roundToOneDecimal(state.seasonPoints),
          })),
        );

        applyAdjustments(Infinity);
        for (const state of playerStates.values()) {
          await tx.player.update({
            where: { id: state.id },
            data: {
              handicap: roundToTwoDecimals(state.currentHandicap),
              seasonPoints: roundToOneDecimal(state.seasonPoints),
              seasonRank: playerRanks.get(state.id) ?? null,
            },
          });
        }

        return {
          leagueId,
          eventsProcessed,
          roundsUpdated,
          scoresUpdated,
          playersUpdated: playerStates.size,
          teamPointRowsUpdated: teamPoints.size,
          skippedEvents,
        };
    };

    if (transactionClient) {
      return recalculate(transactionClient);
    }

    return prisma.$transaction(
      recalculate,
      {
        maxWait: 10000,
        timeout: 120000,
      },
    );
  }
}
