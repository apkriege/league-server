import { prisma } from '../../prisma';
import { modelTeeForRound } from '../utils/tee-rating';
import { normalizeEventFormat, normalizeScoringFormat } from '../utils/event-mode';

type PrismaTx = any;

type HoleDefinition = {
  num: number;
  par: number;
  hcp: number;
};

type ModeledScore = {
  id: number;
  hole: number;
  par: number;
  gross: number;
  adjusted: number;
  net: number;
  pops: number;
};

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

type RoundCalculation = {
  round: any;
  playerId: number;
  teamId: number | null;
  opponentId: number | null;
  preHandicap: number;
  postHandicap: number;
  differential: number;
  gross: number;
  net: number;
  adjusted: number;
  stats: ScoreStats;
  scores: ModeledScore[];
  pointsEarned: number;
  matchPoints: number;
};

type TeamEventPointsAccumulator = Map<string, { leagueId: number; eventId: number; teamId: number; points: number }>;

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

const normalizeHoles = (holes: any): HoleDefinition[] => {
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

const calculateStrokeplayPops = (handicap: number, holes: HoleDefinition[]) => {
  let remainingPops = Math.round(toNumber(handicap, 0));
  const sortedHoles = [...holes].sort((a, b) => a.hcp - b.hcp);
  const popsMap = new Map<number, number>();

  while (remainingPops > 0 && sortedHoles.length > 0) {
    for (const hole of sortedHoles) {
      if (remainingPops <= 0) break;
      popsMap.set(hole.num, (popsMap.get(hole.num) || 0) + 1);
      remainingPops -= 1;
    }
  }

  return popsMap;
};

const calculateMatchplayPops = (leftHandicap: number, rightHandicap: number, holes: HoleDefinition[]) => {
  const leftRounded = Math.round(toNumber(leftHandicap, 0));
  const rightRounded = Math.round(toNumber(rightHandicap, 0));
  let remainingPops = Math.abs(leftRounded - rightRounded);
  const sortedHoles = [...holes].sort((a, b) => a.hcp - b.hcp);
  const leftPops = new Map<number, number>();
  const rightPops = new Map<number, number>();
  let holeIndex = 0;

  while (remainingPops > 0 && sortedHoles.length > 0) {
    const hole = sortedHoles[holeIndex % sortedHoles.length];

    if (leftRounded > rightRounded) {
      leftPops.set(hole.num, (leftPops.get(hole.num) || 0) + 1);
    } else if (rightRounded > leftRounded) {
      rightPops.set(hole.num, (rightPops.get(hole.num) || 0) + 1);
    }

    remainingPops -= 1;
    holeIndex += 1;
  }

  return [leftPops, rightPops] as const;
};

const getEquitableStrokeControlMax = (handicap: number, par: number, holesPlayed: number) => {
  const roundedHandicap = Math.round(toNumber(handicap, 0));
  let maxAllowed = par + 2;

  if (Number(holesPlayed) === 9) {
    if (roundedHandicap >= 5 && roundedHandicap <= 9) maxAllowed = 7;
    else if (roundedHandicap >= 10 && roundedHandicap <= 14) maxAllowed = 8;
    else if (roundedHandicap >= 15 && roundedHandicap <= 19) maxAllowed = 9;
    else if (roundedHandicap >= 20) maxAllowed = 10;
    return maxAllowed;
  }

  if (roundedHandicap >= 10 && roundedHandicap <= 19) maxAllowed = 7;
  else if (roundedHandicap >= 20 && roundedHandicap <= 29) maxAllowed = 8;
  else if (roundedHandicap >= 30 && roundedHandicap <= 39) maxAllowed = 9;
  else if (roundedHandicap >= 40) maxAllowed = 10;

  return maxAllowed;
};

const stablefordPoints = (net: number, par: number) => {
  const diff = net - par;
  if (diff <= -2) return 4;
  if (diff === -1) return 3;
  if (diff === 0) return 2;
  if (diff === 1) return 1;
  return 0;
};

const calculateStats = (scores: ModeledScore[]): ScoreStats => {
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
}: {
  state: PlayerSeasonState;
  adjustedScore: number;
  tee: any;
}) => {
  const slope = toNumber(tee?.slope, 113);
  const rating = toNumber(tee?.rating, 0);
  const par = toNumber(tee?.par, 0);
  const differential = roundToTwoDecimals(((adjustedScore - rating) * 113) / slope);
  const previousDifferentials = state.differentials.slice(-5);
  const differentials = [...previousDifferentials, differential];
  const sorted = [...differentials].sort((a, b) => a - b);
  const roundsToUse = 5;
  const preHandicap = state.currentHandicap;

  let nextHandicap: number;
  if (!preHandicap) {
    nextHandicap = roundToTwoDecimals(differential * 0.96);
  } else if (sorted.length < roundsToUse) {
    const sum = sorted.reduce((total, value) => total + value, 0) + preHandicap;
    nextHandicap = roundToTwoDecimals((sum / (sorted.length + 1)) * 0.96);
  } else {
    const lowestFive = sorted.slice(0, roundsToUse);
    const avg = lowestFive.reduce((total, value) => total + value, 0) / roundsToUse;
    nextHandicap = roundToTwoDecimals(avg * 0.96);
  }

  nextHandicap = roundToTwoDecimals(nextHandicap + (rating - par || 0));

  return {
    differential,
    handicap: nextHandicap,
  };
};

const buildModeledScores = ({
  scoreRows,
  holes,
  handicap,
  holesPlayed,
}: {
  scoreRows: any[];
  holes: HoleDefinition[];
  handicap: number;
  holesPlayed: number;
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
        adjusted: Math.min(gross, getEquitableStrokeControlMax(handicap, hole.par, holesPlayed)),
        net: Math.max(0, gross - popCount),
        pops: popCount,
      } satisfies ModeledScore;
    })
    .filter((score): score is ModeledScore => Boolean(score))
    .sort((a, b) => a.hole - b.hole);
};

const getScoreByHole = (calculation: RoundCalculation | undefined, holeNumber: number) => {
  return calculation?.scores.find((score) => score.hole === holeNumber) ?? null;
};

const addTeamPoints = (
  accumulator: TeamEventPointsAccumulator,
  leagueId: number,
  eventId: number,
  teamId: number | null | undefined,
  points: number,
) => {
  const numericTeamId = Number(teamId);
  if (!Number.isFinite(numericTeamId) || numericTeamId <= 0) return;

  const key = `${numericTeamId}:${eventId}`;
  const existing = accumulator.get(key);
  const nextPoints = (existing?.points || 0) + points;

  accumulator.set(key, {
    leagueId,
    eventId,
    teamId: numericTeamId,
    points: roundToOneDecimal(nextPoints),
  });
};

const pairKey = (leftId: number, rightId: number) => {
  return [leftId, rightId].sort((a, b) => a - b).join(':');
};

const calculateMatchPointsForPair = ({
  event,
  holes,
  left,
  right,
}: {
  event: any;
  holes: HoleDefinition[];
  left: RoundCalculation;
  right: RoundCalculation;
}) => {
  const [leftPops, rightPops] = calculateMatchplayPops(left.preHandicap, right.preHandicap, holes);
  const pointsPerHole = toNumber(event?.ptsPerHole, 0);
  const pointsPerMatch = toNumber(event?.ptsPerMatch, 0);
  let leftHolePoints = 0;
  let rightHolePoints = 0;
  let leftNetTotal = 0;
  let rightNetTotal = 0;
  let playedHoles = 0;

  for (const hole of holes) {
    const leftScore = getScoreByHole(left, hole.num);
    const rightScore = getScoreByHole(right, hole.num);
    if (!leftScore?.gross || !rightScore?.gross) continue;

    const leftNet = leftScore.gross - (leftPops.get(hole.num) || 0);
    const rightNet = rightScore.gross - (rightPops.get(hole.num) || 0);
    leftNetTotal += leftNet;
    rightNetTotal += rightNet;
    playedHoles += 1;

    if (pointsPerHole > 0) {
      if (leftNet === rightNet) {
        leftHolePoints += pointsPerHole / 2;
        rightHolePoints += pointsPerHole / 2;
      } else if (leftNet < rightNet) {
        leftHolePoints += pointsPerHole;
      } else {
        rightHolePoints += pointsPerHole;
      }
    }
  }

  let leftMatchPoints = 0;
  let rightMatchPoints = 0;
  if (pointsPerMatch > 0 && playedHoles > 0) {
    if (leftNetTotal === rightNetTotal) {
      leftMatchPoints = pointsPerMatch / 2;
      rightMatchPoints = pointsPerMatch / 2;
    } else if (leftNetTotal < rightNetTotal) {
      leftMatchPoints = pointsPerMatch;
    } else {
      rightMatchPoints = pointsPerMatch;
    }
  }

  return {
    leftHolePoints,
    leftMatchPoints,
    rightHolePoints,
    rightMatchPoints,
    leftNetTotal,
    rightNetTotal,
    playedHoles,
  };
};

const assignIndividualStrokePoints = (calculations: RoundCalculation[]) => {
  for (const calculation of calculations) {
    calculation.pointsEarned = calculation.scores.reduce((sum, score) => {
      return sum + stablefordPoints(score.net, score.par);
    }, 0);
    calculation.matchPoints = 0;
  }
};

const assignMatchPoints = ({
  event,
  holes,
  calculations,
}: {
  event: any;
  holes: HoleDefinition[];
  calculations: RoundCalculation[];
}) => {
  const byPlayerId = new Map(calculations.map((calculation) => [calculation.playerId, calculation]));
  const processedPairs = new Set<string>();

  for (const calculation of calculations) {
    if (!calculation.opponentId) continue;

    const opponentCalculation = byPlayerId.get(calculation.opponentId);
    if (!opponentCalculation) continue;

    const key = pairKey(calculation.playerId, opponentCalculation.playerId);
    if (processedPairs.has(key)) continue;
    processedPairs.add(key);

    const points = calculateMatchPointsForPair({
      event,
      holes,
      left: calculation,
      right: opponentCalculation,
    });

    calculation.pointsEarned = roundToOneDecimal(points.leftHolePoints);
    calculation.matchPoints = roundToOneDecimal(points.leftMatchPoints);
    opponentCalculation.pointsEarned = roundToOneDecimal(points.rightHolePoints);
    opponentCalculation.matchPoints = roundToOneDecimal(points.rightMatchPoints);
  }
};

const getFlightTeamIds = (flight: any): number[] => {
  const explicitTeamIds = (flight?.teams || [])
    .map((team: any) => Number(team?.teamId))
    .filter((teamId: number) => Number.isFinite(teamId) && teamId > 0);

  if (explicitTeamIds.length >= 2) {
    return Array.from(new Set<number>(explicitTeamIds)).slice(0, 2);
  }

  const playerTeamIds = (flight?.players || [])
    .map((player: any) => Number(player?.teamId ?? player?.player?.teamId))
    .filter((teamId: number) => Number.isFinite(teamId) && teamId > 0);

  return Array.from(new Set<number>(playerTeamIds)).slice(0, 2);
};

const assignTeamMatchPoints = ({
  event,
  holes,
  flights,
  calculationsByPlayerId,
  teamPoints,
}: {
  event: any;
  holes: HoleDefinition[];
  flights: any[];
  calculationsByPlayerId: Map<number, RoundCalculation>;
  teamPoints: TeamEventPointsAccumulator;
}) => {
  assignMatchPoints({
    event,
    holes,
    calculations: [...calculationsByPlayerId.values()],
  });

  for (const flight of flights) {
    const teamIds = getFlightTeamIds(flight);
    if (teamIds.length < 2) continue;

    const [leftTeamId, rightTeamId] = teamIds;
    let leftNetTotal = 0;
    let rightNetTotal = 0;
    let playedMatchups = 0;
    const processedPairs = new Set<string>();

    for (const flightPlayer of flight.players || []) {
      const playerId = Number(flightPlayer?.playerId);
      const playerCalculation = calculationsByPlayerId.get(playerId);
      if (!playerCalculation?.opponentId) continue;

      const opponentCalculation = calculationsByPlayerId.get(playerCalculation.opponentId);
      if (!opponentCalculation) continue;

      const key = pairKey(playerCalculation.playerId, opponentCalculation.playerId);
      if (processedPairs.has(key)) continue;
      processedPairs.add(key);

      const points = calculateMatchPointsForPair({
        event,
        holes,
        left: playerCalculation,
        right: opponentCalculation,
      });

      const leftIsTeamOne = Number(playerCalculation.teamId) === leftTeamId;
      const rightIsTeamOne = Number(opponentCalculation.teamId) === leftTeamId;

      if (leftIsTeamOne && Number(opponentCalculation.teamId) === rightTeamId) {
        leftNetTotal += points.leftNetTotal;
        rightNetTotal += points.rightNetTotal;
        playedMatchups += points.playedHoles > 0 ? 1 : 0;
      } else if (rightIsTeamOne && Number(playerCalculation.teamId) === rightTeamId) {
        leftNetTotal += points.rightNetTotal;
        rightNetTotal += points.leftNetTotal;
        playedMatchups += points.playedHoles > 0 ? 1 : 0;
      }
    }

    const teamWinPoints = toNumber(event?.ptsPerTeamWin, 0);
    if (teamWinPoints <= 0 || playedMatchups === 0) continue;

    if (leftNetTotal === rightNetTotal) {
      addTeamPoints(teamPoints, Number(event.leagueId), Number(event.id), leftTeamId, teamWinPoints / 2);
      addTeamPoints(teamPoints, Number(event.leagueId), Number(event.id), rightTeamId, teamWinPoints / 2);
    } else if (leftNetTotal < rightNetTotal) {
      addTeamPoints(teamPoints, Number(event.leagueId), Number(event.id), leftTeamId, teamWinPoints);
    } else {
      addTeamPoints(teamPoints, Number(event.leagueId), Number(event.id), rightTeamId, teamWinPoints);
    }
  }
};

const assignTeamStrokePoints = ({
  event,
  holes,
  flights,
  calculationsByPlayerId,
  teamPoints,
}: {
  event: any;
  holes: HoleDefinition[];
  flights: any[];
  calculationsByPlayerId: Map<number, RoundCalculation>;
  teamPoints: TeamEventPointsAccumulator;
}) => {
  const pointsPerHole = toNumber(event?.ptsPerHole, 0);

  for (const calculation of calculationsByPlayerId.values()) {
    calculation.pointsEarned = 0;
    calculation.matchPoints = 0;
  }

  if (pointsPerHole <= 0) return;

  for (const flight of flights) {
    const teamIds = getFlightTeamIds(flight);
    if (teamIds.length < 2) continue;

    const [leftTeamId, rightTeamId] = teamIds;
    const leftPlayers = (flight.players || [])
      .filter((player: any) => Number(player?.teamId ?? player?.player?.teamId) === leftTeamId)
      .map((player: any) => calculationsByPlayerId.get(Number(player?.playerId)))
      .filter((calculation: RoundCalculation | undefined): calculation is RoundCalculation => Boolean(calculation));

    const rightPlayers = (flight.players || [])
      .filter((player: any) => Number(player?.teamId ?? player?.player?.teamId) === rightTeamId)
      .map((player: any) => calculationsByPlayerId.get(Number(player?.playerId)))
      .filter((calculation: RoundCalculation | undefined): calculation is RoundCalculation => Boolean(calculation));

    if (leftPlayers.length === 0 || rightPlayers.length === 0) continue;

    let leftPoints = 0;
    let rightPoints = 0;

    for (const hole of holes) {
      const bestLeft = getBestNetForHole(leftPlayers, hole.num);
      const bestRight = getBestNetForHole(rightPlayers, hole.num);

      if (bestLeft == null || bestRight == null) continue;

      if (bestLeft === bestRight) {
        leftPoints += pointsPerHole / 2;
        rightPoints += pointsPerHole / 2;
      } else if (bestLeft < bestRight) {
        leftPoints += pointsPerHole;
      } else {
        rightPoints += pointsPerHole;
      }
    }

    addTeamPoints(teamPoints, Number(event.leagueId), Number(event.id), leftTeamId, leftPoints);
    addTeamPoints(teamPoints, Number(event.leagueId), Number(event.id), rightTeamId, rightPoints);
  }
};

const getBestNetForHole = (players: RoundCalculation[], holeNumber: number) => {
  let best: number | null = null;

  for (const player of players) {
    const score = getScoreByHole(player, holeNumber);
    if (!score?.gross) continue;

    if (best == null || score.net < best) {
      best = score.net;
    }
  }

  return best;
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
}: {
  tx: PrismaTx;
  event: any;
  playerStates: Map<number, PlayerSeasonState>;
  teamPoints: TeamEventPointsAccumulator;
}) => {
  const tee = modelTeeForRound(event.tee, Number(event.holes), String(event.startSide || ''));
  const holes = normalizeHoles(tee.holes);
  const flightPlayerLookup = getFlightPlayerLookup(event);
  const calculations: RoundCalculation[] = [];
  const calculationsByPlayerId = new Map<number, RoundCalculation>();

  for (const round of event.rounds || []) {
    const scoreRows = Array.isArray(round.scores) ? round.scores : [];
    if (scoreRows.length === 0) continue;

    const playerState = getOrCreatePlayerState(playerStates, round.player);
    const preHandicap = playerState.currentHandicap;
    const scores = buildModeledScores({
      scoreRows,
      holes,
      handicap: preHandicap,
      holesPlayed: Number(event.holes),
    });

    if (scores.length === 0) continue;

    const stats = calculateStats(scores);
    const handicapData = calculateNextHandicap({
      state: playerState,
      adjustedScore: stats.totalAdjusted,
      tee,
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
      postHandicap: handicapData.handicap,
      differential: handicapData.differential,
      gross: stats.totalGross,
      net: stats.totalNet,
      adjusted: stats.totalAdjusted,
      stats,
      scores,
      pointsEarned: 0,
      matchPoints: 0,
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
  const scoringFormat = normalizeScoringFormat(event.scoringFormat, 'stroke');
  const pointsEnabled = event.pointsEnabled !== false;

  if (!pointsEnabled) {
    for (const calculation of calculations) {
      calculation.pointsEarned = 0;
      calculation.matchPoints = 0;
    }
  } else if (eventFormat === 'individual' && scoringFormat === 'stroke') {
    assignIndividualStrokePoints(calculations);
  } else if (eventFormat === 'individual' && scoringFormat === 'match') {
    assignMatchPoints({ event, holes, calculations });
  } else if (eventFormat === 'team' && scoringFormat === 'match') {
    assignTeamMatchPoints({
      event,
      holes,
      flights: event.flights || [],
      calculationsByPlayerId,
      teamPoints,
    });
  } else if (eventFormat === 'team' && scoringFormat === 'stroke') {
    assignTeamStrokePoints({
      event,
      holes,
      flights: event.flights || [],
      calculationsByPlayerId,
      teamPoints,
    });
  }

  let scoresUpdated = 0;

  for (const calculation of calculations) {
    await tx.round.update({
      where: { id: Number(calculation.round.id) },
      data: {
        opponentId: calculation.opponentId,
        courseId: Number(event.courseId),
        teeId: Number(event.teeId),
        scoringFormat: event.scoringFormat,
        status: 'completed',
        holesPlayed: Number(event.holes),
        gross: calculation.gross,
        net: calculation.net,
        adjusted: calculation.adjusted,
        putts: toNumber(calculation.round.putts, 0),
        courseRating: toNumber(tee.rating, 0),
        courseSlope: toNumber(tee.slope, 0),
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
        date: event.date,
      },
    });

    const playerState = playerStates.get(calculation.playerId);
    if (playerState) {
      playerState.seasonPoints += roundToOneDecimal(
        calculation.pointsEarned + calculation.matchPoints,
      );
    }

    for (const score of calculation.scores) {
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
  static async recalculateLeague(leagueId: number): Promise<SeasonSyncResult> {
    if (!Number.isFinite(leagueId) || leagueId <= 0) {
      throw new Error('A valid league id is required.');
    }

    return prisma.$transaction(
      async (tx) => {
        const league = await tx.league.findFirst({
          where: {
            id: leagueId,
            deletedAt: null,
          },
          include: {
            players: {
              where: { deletedAt: null },
            },
            teams: {
              where: { deletedAt: null },
            },
            events: {
              where: {
                isDeleted: false,
                deletedAt: null,
                status: { not: 'canceled' },
              },
              orderBy: [{ date: 'asc' }, { id: 'asc' }],
              include: {
                tee: true,
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

        let eventsProcessed = 0;
        let roundsUpdated = 0;
        let scoresUpdated = 0;

        for (const event of league.events || []) {
          if (!event.rounds || event.rounds.length === 0) {
            skippedEvents.push({
              eventId: Number(event.id),
              name: String(event.name),
              reason: 'No existing rounds to recalculate.',
            });
            continue;
          }

          const eventResult = await recalculateEvent({
            tx,
            event,
            playerStates,
            teamPoints,
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
      },
      {
        maxWait: 10000,
        timeout: 120000,
      },
    );
  }
}
