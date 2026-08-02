import { prisma } from '../../prisma';

type DistributionKey =
  | 'eagles'
  | 'birdies'
  | 'pars'
  | 'bogeys'
  | 'doubleBogeys'
  | 'tripleBogeys';

type DistributionTotals = Record<DistributionKey, number | null>;

type MetricRound = {
  playerId: number;
  preHandicap: number | null;
  postHandicap: number | null;
  gross: number;
  net: number;
  pointsEarned: number;
  matchPoints: number;
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  doubleBogeys: number;
  tripleBogeys: number;
  player: {
    firstName: string;
    lastName: string;
    handicap: number;
  };
  scores: Array<{
    hole: number;
    gross: number;
    net: number;
    par: number;
  }>;
};

const DISTRIBUTION_KEYS: DistributionKey[] = [
  'eagles',
  'birdies',
  'pars',
  'bogeys',
  'doubleBogeys',
  'tripleBogeys',
];

const playerName = (round: MetricRound) =>
  `${round.player.firstName} ${round.player.lastName}`.trim();

export class EventMetrics {
  constructor(
    private readonly eventId: number,
    private readonly leagueId: number,
  ) {}

  async processEvent() {
    const activeLeagueRounds = {
      deletedAt: null,
      event: {
        leagueId: this.leagueId,
        isDeleted: false,
        deletedAt: null,
      },
    } as const;

    const [rounds, seasonAggregate, eventIds] = await Promise.all([
      prisma.round.findMany({
        where: { eventId: this.eventId, deletedAt: null },
        select: {
          playerId: true,
          preHandicap: true,
          postHandicap: true,
          gross: true,
          net: true,
          pointsEarned: true,
          matchPoints: true,
          eagles: true,
          birdies: true,
          pars: true,
          bogeys: true,
          doubleBogeys: true,
          tripleBogeys: true,
          player: {
            select: {
              firstName: true,
              lastName: true,
              handicap: true,
            },
          },
          scores: {
            select: {
              hole: true,
              gross: true,
              net: true,
              par: true,
            },
            orderBy: { hole: 'asc' },
          },
        },
      }),
      prisma.round.aggregate({
        where: activeLeagueRounds,
        _sum: {
          eagles: true,
          birdies: true,
          pars: true,
          bogeys: true,
          doubleBogeys: true,
          tripleBogeys: true,
        },
      }),
      prisma.round.groupBy({
        by: ['eventId'],
        where: activeLeagueRounds,
      }),
    ]);

    return {
      scores: this.scores(rounds),
      leaderboards: this.createLeaderboards(rounds),
      skins: this.createSkins(rounds),
      scoreDistribution: this.scoreDistribution(
        rounds,
        seasonAggregate._sum,
        eventIds.length,
      ),
    };
  }

  private scores(rounds: MetricRound[]) {
    return rounds.map((round) => ({
      playerId: round.playerId,
      player: {
        firstName: round.player.firstName,
        lastName: round.player.lastName,
      },
      preHandicap: round.preHandicap,
      postHandicap: round.postHandicap,
      gross: round.gross,
      net: round.net,
      pointsEarned: round.pointsEarned,
      matchPoints: round.matchPoints,
      scores: round.scores,
    }));
  }

  private createLeaderboards(rounds: MetricRound[]) {
    const entries = rounds.map((round) => ({
      playerId: round.playerId,
      name: playerName(round),
      handicap: round.player.handicap,
      points: round.pointsEarned + round.matchPoints,
      gross: round.gross,
      net: round.net,
    }));

    return {
      playerPoints: [...entries]
        .sort((left, right) => right.points - left.points)
        .map((entry) => ({
          playerId: entry.playerId,
          name: entry.name,
          handicap: entry.handicap,
          value: entry.points,
        })),
      playerLowGross: [...entries]
        .sort((left, right) => left.gross - right.gross)
        .map((entry) => ({
          playerId: entry.playerId,
          name: entry.name,
          handicap: entry.handicap,
          value: entry.gross,
        })),
      playerLowNet: [...entries]
        .sort((left, right) => left.net - right.net)
        .map((entry) => ({
          playerId: entry.playerId,
          name: entry.name,
          handicap: entry.handicap,
          value: entry.net,
        })),
    };
  }

  private createSkins(rounds: MetricRound[]) {
    return {
      playerSkins: this.findSkins(rounds, 'gross'),
      playerNetSkins: this.findSkins(rounds, 'net'),
    };
  }

  private findSkins(rounds: MetricRound[], valueKey: 'gross' | 'net') {
    const scoresByHole = new Map<
      number,
      Array<{ playerId: number; name: string; value: number; par: number }>
    >();

    for (const round of rounds) {
      for (const score of round.scores) {
        const entries = scoresByHole.get(score.hole) ?? [];
        entries.push({
          playerId: round.playerId,
          name: playerName(round),
          value: Number(score[valueKey]),
          par: Number(score.par),
        });
        scoresByHole.set(score.hole, entries);
      }
    }

    const skins: Array<{
      playerId: number;
      name: string;
      hole: string;
      scoreLabel: string;
      gross?: number;
      net?: number;
    }> = [];

    for (const [hole, entries] of scoresByHole) {
      const lowestValue = Math.min(...entries.map((entry) => entry.value));
      const winners = entries.filter((entry) => entry.value === lowestValue);
      if (winners.length !== 1) continue;

      const winner = winners[0];
      skins.push({
        playerId: winner.playerId,
        name: winner.name,
        hole: String(hole),
        [valueKey]: winner.value,
        scoreLabel: this.scoreLabel(winner.value, winner.par),
      });
    }

    return skins.sort((left, right) => Number(left.hole) - Number(right.hole));
  }

  private scoreDistribution(
    rounds: MetricRound[],
    seasonTotals: DistributionTotals,
    eventCount: number,
  ) {
    const divisor = eventCount || 1;
    const eventTotals = Object.fromEntries(
      DISTRIBUTION_KEYS.map((key) => [
        key,
        rounds.reduce((total, round) => total + round[key], 0),
      ]),
    ) as Record<DistributionKey, number>;
    const seasonAverages = Object.fromEntries(
      DISTRIBUTION_KEYS.map((key) => [
        key,
        Math.round((((seasonTotals[key] ?? 0) / divisor) * 10)) / 10,
      ]),
    ) as Record<DistributionKey, number>;

    return {
      thisEvent: eventTotals,
      seasonAvg: seasonAverages,
    };
  }

  private scoreLabel(score: number, par: number) {
    const difference = score - par;
    if (difference <= -2) return 'Eagle';
    if (difference === -1) return 'Birdie';
    if (difference === 0) return 'Par';
    if (difference === 1) return 'Bogey';
    if (difference === 2) return 'Double Bogey';
    return `+${difference}`;
  }
}
