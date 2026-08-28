export type IntelligenceScore = {
  hole: number;
  par: number;
  gross: number;
  net: number;
};

export type IntelligenceRound = {
  id: number;
  eventId: number;
  eventName: string;
  date: string;
  courseId: number;
  courseName: string;
  teeId: number;
  teeName: string;
  holesPlayed: number;
  gross: number;
  net: number;
  points: number;
  birdies: number;
  pars: number;
  handicap: number | null;
  opponentId: number | null;
  scores: IntelligenceScore[];
};

export type IntelligencePlayer = {
  id: number;
  name: string;
  rounds: IntelligenceRound[];
};

export type IntelligenceSeason = {
  leagueId: number;
  leagueName: string;
  year: number;
  handicap: number;
  rounds: IntelligenceRound[];
};

export type IntelligenceTeamEvent = {
  eventId: number;
  eventName: string;
  date: string;
  opponentId: number;
  opponentName: string;
  teamPoints: number | null;
  opponentPoints: number | null;
};

export type PlayerIntelligence = ReturnType<typeof buildPlayerIntelligence>;

const roundToOne = (value: number) => Math.round(value * 10) / 10;
const roundToTwo = (value: number) => Math.round(value * 100) / 100;

const mean = (values: number[]) =>
  values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

const standardDeviation = (values: number[]) => {
  const average = mean(values);
  if (average == null || values.length < 2) return null;
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length,
  );
};

const normalizedToPar = (round: IntelligenceRound) => {
  const validScores = round.scores.filter((score) => score.gross > 0 && score.par > 0);
  if (validScores.length === 0) return null;
  const toPar = validScores.reduce((sum, score) => sum + score.gross - score.par, 0);
  return (toPar / validScores.length) * 18;
};

const actualToPar = (round: IntelligenceRound) => {
  const validScores = round.scores.filter((score) => score.gross > 0 && score.par > 0);
  if (validScores.length === 0) return null;
  return validScores.reduce((sum, score) => sum + score.gross - score.par, 0);
};

const resultFromPoints = (left: number, right: number): 'win' | 'loss' | 'tie' => {
  if (Math.abs(left - right) < 0.001) return 'tie';
  return left > right ? 'win' : 'loss';
};

const buildRanking = (
  players: IntelligencePlayer[],
  playerId: number,
  definition: {
    key: string;
    label: string;
    description: string;
    direction: 'asc' | 'desc';
    calculate: (player: IntelligencePlayer) => number | null;
  },
) => {
  const ranked = players
    .map((player) => ({ playerId: player.id, value: definition.calculate(player) }))
    .filter(
      (row): row is { playerId: number; value: number } =>
        row.value != null && Number.isFinite(row.value),
    )
    .sort((left, right) =>
      definition.direction === 'asc' ? left.value - right.value : right.value - left.value,
    );
  const playerIndex = ranked.findIndex((row) => row.playerId === playerId);
  if (playerIndex < 0) return null;

  const playerValue = ranked[playerIndex].value;
  const rank = ranked.findIndex((row) => Math.abs(row.value - playerValue) < 0.001) + 1;
  return {
    key: definition.key,
    label: definition.label,
    description: definition.description,
    rank,
    total: ranked.length,
    value: roundToOne(playerValue),
    direction: definition.direction,
  };
};

const buildStreaks = (rounds: IntelligenceRound[]) => {
  const orderedScores = [...rounds]
    .sort((left, right) => left.date.localeCompare(right.date) || left.id - right.id)
    .flatMap((round) => [...round.scores].sort((left, right) => left.hole - right.hole));

  let bestParOrBetter = 0;
  let running = 0;
  for (const score of orderedScores) {
    if (score.gross > 0 && score.gross <= score.par) {
      running += 1;
      bestParOrBetter = Math.max(bestParOrBetter, running);
    } else if (score.gross > 0) {
      running = 0;
    }
  }

  let currentParOrBetter = 0;
  for (const score of [...orderedScores].reverse()) {
    if (score.gross > 0 && score.gross <= score.par) currentParOrBetter += 1;
    else if (score.gross > 0) break;
  }

  let currentRoundsWithBirdie = 0;
  for (const round of [...rounds].sort((left, right) => right.date.localeCompare(left.date))) {
    if (round.birdies > 0) currentRoundsWithBirdie += 1;
    else break;
  }

  return {
    currentParOrBetter,
    bestParOrBetter,
    currentRoundsWithBirdie,
  };
};

export const buildPlayerIntelligence = ({
  playerId,
  players,
  seasons,
  teamEvents,
}: {
  playerId: number;
  players: IntelligencePlayer[];
  seasons: IntelligenceSeason[];
  teamEvents: IntelligenceTeamEvent[];
}) => {
  const player = players.find((entry) => entry.id === playerId);
  const rounds = [...(player?.rounds ?? [])].sort(
    (left, right) => left.date.localeCompare(right.date) || left.id - right.id,
  );
  const allScores = rounds.flatMap((round) => round.scores);
  const normalizedRounds = rounds
    .map((round) => ({ round, value: normalizedToPar(round) }))
    .filter(
      (row): row is { round: IntelligenceRound; value: number } => row.value != null,
    );
  const normalizedValues = normalizedRounds.map((row) => row.value);
  const recentValues = normalizedValues.slice(-3);
  const priorValues = normalizedValues.slice(-6, -3);
  const recentAverage = mean(recentValues);
  const priorAverage = mean(priorValues);
  const formDelta =
    normalizedValues.length >= 6 && recentAverage != null && priorAverage != null
      ? recentAverage - priorAverage
      : null;
  const consistency = standardDeviation(normalizedValues);

  const leaguePeers = players.filter((entry) => entry.id !== playerId);
  const leagueScores = leaguePeers.flatMap((entry) =>
    entry.rounds.flatMap((round) => round.scores),
  );
  const parSplits = [3, 4, 5].map((par) => {
    const playerScores = allScores.filter((score) => score.par === par && score.gross > 0);
    const comparableScores = leagueScores.filter((score) => score.par === par && score.gross > 0);
    const averageToPar = mean(playerScores.map((score) => score.gross - score.par));
    const leagueAverageToPar = mean(comparableScores.map((score) => score.gross - score.par));
    return {
      par,
      holes: playerScores.length,
      averageToPar: averageToPar == null ? null : roundToTwo(averageToPar),
      leagueAverageToPar:
        leagueAverageToPar == null ? null : roundToTwo(leagueAverageToPar),
      versusLeague:
        averageToPar == null || leagueAverageToPar == null
          ? null
          : roundToTwo(averageToPar - leagueAverageToPar),
    };
  });

  const leagueHoleValues = new Map<string, number[]>();
  for (const leaguePlayer of leaguePeers) {
    for (const round of leaguePlayer.rounds) {
      for (const score of round.scores) {
        if (score.gross <= 0) continue;
        const key = `${round.courseId}:${round.teeId}:${score.hole}`;
        const values = leagueHoleValues.get(key) ?? [];
        values.push(score.gross - score.par);
        leagueHoleValues.set(key, values);
      }
    }
  }

  const playerHoleValues = new Map<
    string,
    { courseId: number; courseName: string; teeName: string; hole: number; par: number; values: number[] }
  >();
  for (const round of rounds) {
    for (const score of round.scores) {
      if (score.gross <= 0) continue;
      const key = `${round.courseId}:${round.teeId}:${score.hole}`;
      const row = playerHoleValues.get(key) ?? {
        courseId: round.courseId,
        courseName: round.courseName,
        teeName: round.teeName,
        hole: score.hole,
        par: score.par,
        values: [],
      };
      row.values.push(score.gross - score.par);
      playerHoleValues.set(key, row);
    }
  }

  const holeComparisons = [...playerHoleValues.entries()]
    .map(([key, row]) => {
      const playerAverage = mean(row.values);
      const leagueAverage = mean(leagueHoleValues.get(key) ?? []);
      if (playerAverage == null) return null;
      return {
        courseId: row.courseId,
        courseName: row.courseName,
        teeName: row.teeName,
        hole: row.hole,
        par: row.par,
        samples: row.values.length,
        averageToPar: roundToTwo(playerAverage),
        leagueAverageToPar: leagueAverage == null ? null : roundToTwo(leagueAverage),
        versusLeague:
          leagueAverage == null ? null : roundToTwo(playerAverage - leagueAverage),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);
  const comparableHoles = holeComparisons.filter((row) => row.versusLeague != null);
  const reliableHoles = comparableHoles.filter((row) => row.samples >= 2);
  const rankedHoles = reliableHoles.length > 0 ? reliableHoles : comparableHoles;
  const strengths = [...rankedHoles]
    .filter((row) => Number(row.versusLeague) < -0.05)
    .sort((left, right) => Number(left.versusLeague) - Number(right.versusLeague))
    .slice(0, 3);
  const opportunities = [...rankedHoles]
    .filter((row) => Number(row.versusLeague) > 0.05)
    .sort((left, right) => Number(right.versusLeague) - Number(left.versusLeague))
    .slice(0, 3);

  const courseGroups = new Map<string, IntelligenceRound[]>();
  for (const round of rounds) {
    const key = `${round.courseId}:${round.teeId}:${round.holesPlayed}`;
    const values = courseGroups.get(key) ?? [];
    values.push(round);
    courseGroups.set(key, values);
  }
  const courseSplits = [...courseGroups.values()]
    .map((courseRounds) => {
      const toParValues = courseRounds
        .map(actualToPar)
        .filter((value): value is number => value != null);
      return {
        courseId: courseRounds[0].courseId,
        courseName: courseRounds[0].courseName,
        teeName: courseRounds[0].teeName,
        holesPlayed: courseRounds[0].holesPlayed,
        rounds: courseRounds.length,
        averageGross: roundToOne(Number(mean(courseRounds.map((round) => round.gross)) ?? 0)),
        averageNet: roundToOne(Number(mean(courseRounds.map((round) => round.net)) ?? 0)),
        averageToPar: roundToOne(Number(mean(toParValues) ?? 0)),
        bestGross: Math.min(...courseRounds.map((round) => round.gross)),
      };
    })
    .sort((left, right) => right.rounds - left.rounds || left.courseName.localeCompare(right.courseName));

  const ringerGroups = new Map<string, IntelligenceRound[]>();
  for (const round of rounds) {
    const key = `${round.courseId}:${round.teeId}`;
    const values = ringerGroups.get(key) ?? [];
    values.push(round);
    ringerGroups.set(key, values);
  }
  const ringers = [...ringerGroups.values()]
    .map((courseRounds) => {
      const bestByHole = new Map<number, IntelligenceScore>();
      for (const round of courseRounds) {
        for (const score of round.scores) {
          if (score.gross <= 0) continue;
          const existing = bestByHole.get(score.hole);
          if (!existing || score.gross < existing.gross) bestByHole.set(score.hole, score);
        }
      }
      const bestScores = [...bestByHole.values()];
      return {
        courseId: courseRounds[0].courseId,
        courseName: courseRounds[0].courseName,
        teeName: courseRounds[0].teeName,
        rounds: courseRounds.length,
        holes: bestScores.length,
        score: bestScores.reduce((sum, score) => sum + score.gross, 0),
        toPar: bestScores.reduce((sum, score) => sum + score.gross - score.par, 0),
      };
    })
    .sort((left, right) => right.rounds - left.rounds || left.courseName.localeCompare(right.courseName));

  const personalRecords = [9, 18]
    .map((holes) => {
      const eligible = rounds.filter((round) => round.holesPlayed === holes);
      if (eligible.length === 0) return null;
      const bestToPar = [...eligible]
        .map((round) => ({ round, value: normalizedToPar(round) }))
        .filter((row): row is { round: IntelligenceRound; value: number } => row.value != null)
        .sort((left, right) => left.value - right.value)[0];
      return {
        holes,
        rounds: eligible.length,
        lowGross: Math.min(...eligible.map((round) => round.gross)),
        lowNet: Math.min(...eligible.map((round) => round.net)),
        bestPoints: roundToOne(Math.max(...eligible.map((round) => round.points))),
        mostBirdies: Math.max(...eligible.map((round) => round.birdies)),
        bestRound: bestToPar
          ? {
              eventName: bestToPar.round.eventName,
              date: bestToPar.round.date,
              gross: bestToPar.round.gross,
              toPar: roundToOne((bestToPar.value / 18) * holes),
            }
          : null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  const rankingDefinitions = [
    {
      key: 'points',
      label: 'Season points',
      description: 'Total points earned',
      direction: 'desc' as const,
      calculate: (entry: IntelligencePlayer) =>
        entry.rounds.length > 0
          ? entry.rounds.reduce((sum, round) => sum + round.points, 0)
          : null,
    },
    {
      key: 'scoring',
      label: 'Scoring vs par',
      description: '18-hole equivalent',
      direction: 'asc' as const,
      calculate: (entry: IntelligencePlayer) =>
        mean(
          entry.rounds
            .map(normalizedToPar)
            .filter((value): value is number => value != null),
        ),
    },
    {
      key: 'consistency',
      label: 'Consistency',
      description: 'Lower round-to-round spread',
      direction: 'asc' as const,
      calculate: (entry: IntelligencePlayer) =>
        standardDeviation(
          entry.rounds
            .map(normalizedToPar)
            .filter((value): value is number => value != null),
        ),
    },
    {
      key: 'birdies',
      label: 'Birdies per round',
      description: 'Adjusted per 18 holes',
      direction: 'desc' as const,
      calculate: (entry: IntelligencePlayer) => {
        const holes = entry.rounds.reduce((sum, round) => sum + round.scores.length, 0);
        if (holes === 0) return null;
        return (entry.rounds.reduce((sum, round) => sum + round.birdies, 0) / holes) * 18;
      },
    },
    {
      key: 'par-or-better',
      label: 'Par-or-better rate',
      description: 'Share of completed holes',
      direction: 'desc' as const,
      calculate: (entry: IntelligencePlayer) => {
        const scores = entry.rounds.flatMap((round) => round.scores).filter((score) => score.gross > 0);
        if (scores.length === 0) return null;
        return (scores.filter((score) => score.gross <= score.par).length / scores.length) * 100;
      },
    },
  ];
  const categoryRankings = rankingDefinitions
    .map((definition) => buildRanking(players, playerId, definition))
    .filter((row): row is NonNullable<typeof row> => row != null);

  const roundByEventAndPlayer = new Map<string, IntelligenceRound>();
  for (const leaguePlayer of players) {
    for (const round of leaguePlayer.rounds) {
      roundByEventAndPlayer.set(`${round.eventId}:${leaguePlayer.id}`, round);
    }
  }
  const headToHeadMap = new Map<
    number,
    { opponentId: number; opponentName: string; wins: number; losses: number; ties: number; pointsFor: number; pointsAgainst: number; netMargins: number[]; lastPlayed: string }
  >();
  for (const round of rounds) {
    if (!round.opponentId) continue;
    const opponent = players.find((entry) => entry.id === round.opponentId);
    const opponentRound = roundByEventAndPlayer.get(`${round.eventId}:${round.opponentId}`);
    if (!opponent || !opponentRound) continue;
    const row = headToHeadMap.get(opponent.id) ?? {
      opponentId: opponent.id,
      opponentName: opponent.name,
      wins: 0,
      losses: 0,
      ties: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      netMargins: [],
      lastPlayed: round.date,
    };
    const result = resultFromPoints(round.points, opponentRound.points);
    if (result === 'win') row.wins += 1;
    else if (result === 'loss') row.losses += 1;
    else row.ties += 1;
    row.pointsFor += round.points;
    row.pointsAgainst += opponentRound.points;
    row.netMargins.push(round.net - opponentRound.net);
    if (round.date > row.lastPlayed) row.lastPlayed = round.date;
    headToHeadMap.set(opponent.id, row);
  }
  const headToHeadOpponents = [...headToHeadMap.values()]
    .map((row) => ({
      ...row,
      pointsFor: roundToOne(row.pointsFor),
      pointsAgainst: roundToOne(row.pointsAgainst),
      averageNetMargin: roundToOne(Number(mean(row.netMargins) ?? 0)),
      matches: row.wins + row.losses + row.ties,
    }))
    .sort((left, right) => right.matches - left.matches || left.opponentName.localeCompare(right.opponentName));
  const headToHead = {
    wins: headToHeadOpponents.reduce((sum, row) => sum + row.wins, 0),
    losses: headToHeadOpponents.reduce((sum, row) => sum + row.losses, 0),
    ties: headToHeadOpponents.reduce((sum, row) => sum + row.ties, 0),
    opponents: headToHeadOpponents,
  };

  const rivalryMap = new Map<
    number,
    { opponentId: number; opponentName: string; wins: number; losses: number; ties: number; pointsFor: number; pointsAgainst: number; lastPlayed: string }
  >();
  for (const event of teamEvents) {
    if (event.teamPoints == null || event.opponentPoints == null) continue;
    const row = rivalryMap.get(event.opponentId) ?? {
      opponentId: event.opponentId,
      opponentName: event.opponentName,
      wins: 0,
      losses: 0,
      ties: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      lastPlayed: event.date,
    };
    const result = resultFromPoints(event.teamPoints, event.opponentPoints);
    if (result === 'win') row.wins += 1;
    else if (result === 'loss') row.losses += 1;
    else row.ties += 1;
    row.pointsFor += event.teamPoints;
    row.pointsAgainst += event.opponentPoints;
    if (event.date > row.lastPlayed) row.lastPlayed = event.date;
    rivalryMap.set(event.opponentId, row);
  }
  const teamRivalries = [...rivalryMap.values()]
    .map((row) => ({
      ...row,
      pointsFor: roundToOne(row.pointsFor),
      pointsAgainst: roundToOne(row.pointsAgainst),
      matches: row.wins + row.losses + row.ties,
    }))
    .sort((left, right) => right.matches - left.matches || left.opponentName.localeCompare(right.opponentName));

  const seasonHistory = seasons
    .map((season) => {
      const values = season.rounds
        .map(normalizedToPar)
        .filter((value): value is number => value != null);
      return {
        leagueId: season.leagueId,
        leagueName: season.leagueName,
        year: season.year,
        rounds: season.rounds.length,
        averageToPar: values.length > 0 ? roundToOne(Number(mean(values))) : null,
        averagePoints:
          season.rounds.length > 0
            ? roundToOne(
                season.rounds.reduce((sum, round) => sum + round.points, 0) /
                  season.rounds.length,
              )
            : null,
        handicap: roundToOne(season.handicap),
      };
    })
    .sort((left, right) => left.year - right.year || left.leagueId - right.leagueId);

  const latestOpportunity = opportunities.find((row) => Number(row.versusLeague) > 0);
  const latestStrength = strengths.find((row) => Number(row.versusLeague) < 0);
  const takeaways = [
    formDelta == null
      ? {
          tone: 'neutral' as const,
          title: 'Form baseline in progress',
          detail: 'Complete six rounds to compare recent form with the previous three.',
        }
      : formDelta < -0.25
        ? {
            tone: 'positive' as const,
            title: 'Recent form is trending better',
            detail: `${Math.abs(roundToOne(formDelta))} fewer strokes per 18 than the previous three rounds.`,
          }
        : formDelta > 0.25
          ? {
              tone: 'attention' as const,
              title: 'Recent scoring has cooled',
              detail: `${roundToOne(formDelta)} more strokes per 18 than the previous three rounds.`,
            }
          : {
              tone: 'neutral' as const,
              title: 'Recent form is holding steady',
              detail: 'The last three rounds are within a quarter stroke of the previous three.',
            },
    latestOpportunity
      ? {
          tone: 'attention' as const,
          title: `Best place to gain: ${latestOpportunity.courseName} #${latestOpportunity.hole}`,
          detail: `${roundToOne(Number(latestOpportunity.versusLeague))} strokes above the league average on this hole across ${latestOpportunity.samples} ${latestOpportunity.samples === 1 ? 'round' : 'rounds'}.`,
        }
      : null,
    latestStrength
      ? {
          tone: 'positive' as const,
          title: `${latestStrength.samples >= 2 ? 'Proven strength' : 'Early strength signal'}: ${latestStrength.courseName} #${latestStrength.hole}`,
          detail: `${Math.abs(roundToOne(Number(latestStrength.versusLeague)))} strokes better than the league average across ${latestStrength.samples} ${latestStrength.samples === 1 ? 'round' : 'rounds'}.`,
        }
      : null,
  ].filter((row): row is NonNullable<typeof row> => row != null);

  return {
    sample: {
      rounds: rounds.length,
      holes: allScores.filter((score) => score.gross > 0).length,
      comparableHoles: comparableHoles.length,
    },
    pulse: {
      averageToPar: normalizedValues.length > 0 ? roundToOne(Number(mean(normalizedValues))) : null,
      recentAverageToPar: recentAverage == null ? null : roundToOne(recentAverage),
      formDelta: formDelta == null ? null : roundToOne(formDelta),
      consistency: consistency == null ? null : roundToOne(consistency),
    },
    takeaways,
    trend: normalizedRounds.map(({ round, value }, index) => ({
      roundId: round.id,
      eventName: round.eventName,
      date: round.date,
      toPar: roundToOne(value),
      rollingAverage: roundToOne(
        Number(mean(normalizedValues.slice(Math.max(0, index - 2), index + 1))),
      ),
    })),
    parSplits,
    holeInsights: { strengths, opportunities },
    courseSplits,
    ringers,
    personalRecords,
    streaks: buildStreaks(rounds),
    categoryRankings,
    seasonHistory,
    headToHead,
    teamRivalries,
  };
};
