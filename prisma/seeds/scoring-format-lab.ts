import type { Prisma, PrismaClient } from '@prisma/client';
import { Round } from '../../src/app/services/round';
import { SeasonSync } from '../../src/app/services/seasonSync';
import { persistSharedTeamRounds, type ScoringMode } from '../../src/app/scoring';

type SeedContext = {
  prisma: PrismaClient;
  adminId: number;
  courseId: number;
  teeId: number;
};

type LabPlayer = {
  id: number;
  firstName: string;
  lastName: string;
};

type LabTeam = {
  id: number;
  name: string;
  players: LabPlayer[];
};

type ModeFixture = {
  mode: ScoringMode;
  label: string;
  model: 'individual' | 'team';
  scoringFamily: 'stroke' | 'match';
  scoringConfig: Prisma.InputJsonValue;
};

const fixtures: ModeFixture[] = [
  {
    mode: 'stroke-play',
    label: 'Individual Stroke Play',
    model: 'individual',
    scoringFamily: 'stroke',
    scoringConfig: { handicapAllowance: 1 },
  },
  {
    mode: 'match-play',
    label: 'Individual Match Play',
    model: 'individual',
    scoringFamily: 'match',
    scoringConfig: { handicapAllowance: 1 },
  },
  {
    mode: 'stableford',
    label: 'Individual Stableford',
    model: 'individual',
    scoringFamily: 'stroke',
    scoringConfig: {
      handicapAllowance: 1,
      stablefordPointScale: {
        albatrossOrBetter: 5,
        eagle: 4,
        birdie: 3,
        par: 2,
        bogey: 1,
        doubleBogeyOrWorse: 0,
      },
    },
  },
  {
    mode: 'maximum-score',
    label: 'Individual Maximum Score',
    model: 'individual',
    scoringFamily: 'stroke',
    scoringConfig: {
      handicapAllowance: 1,
      maximumScore: { type: 'relative-to-par', strokesOverPar: 2 },
    },
  },
  {
    mode: 'stroke-play',
    label: 'Team Aggregate Stroke Play',
    model: 'team',
    scoringFamily: 'stroke',
    scoringConfig: { handicapAllowance: 1 },
  },
  {
    mode: 'match-play',
    label: 'Team Match Play',
    model: 'team',
    scoringFamily: 'match',
    scoringConfig: { handicapAllowance: 1 },
  },
  {
    mode: 'stableford',
    label: 'Team Stableford',
    model: 'team',
    scoringFamily: 'stroke',
    scoringConfig: {
      handicapAllowance: 1,
      stablefordPointScale: {
        albatrossOrBetter: 5,
        eagle: 4,
        birdie: 3,
        par: 2,
        bogey: 1,
        doubleBogeyOrWorse: 0,
      },
    },
  },
  {
    mode: 'maximum-score',
    label: 'Team Maximum Score',
    model: 'team',
    scoringFamily: 'stroke',
    scoringConfig: {
      handicapAllowance: 1,
      maximumScore: { type: 'net-double-bogey' },
    },
  },
  {
    mode: 'best-ball',
    label: 'Team Best Ball',
    model: 'team',
    scoringFamily: 'stroke',
    scoringConfig: { handicapAllowance: 1 },
  },
  {
    mode: 'four-ball-match',
    label: 'Four-Ball Match Play',
    model: 'team',
    scoringFamily: 'match',
    scoringConfig: { handicapAllowance: 0.9 },
  },
  {
    mode: 'scramble',
    label: 'Team Scramble',
    model: 'team',
    scoringFamily: 'stroke',
    scoringConfig: { handicapAllowance: 1 },
  },
  {
    mode: 'alternate-shot',
    label: 'Team Alternate Shot',
    model: 'team',
    scoringFamily: 'stroke',
    scoringConfig: { handicapAllowance: 1 },
  },
];

const playerNames = [
  ['Ace', 'Anderson'],
  ['Birdie', 'Bennett'],
  ['Chip', 'Carter'],
  ['Drive', 'Davis'],
  ['Eagle', 'Evans'],
  ['Fairway', 'Foster'],
  ['Green', 'Garcia'],
  ['Hazel', 'Hogan'],
] as const;

const teamNames = ['Pin Seekers', 'Fairway Finders', 'Up & Downs', 'Sunday Bags'];

const scoreFor = (playerIndex: number, holeIndex: number) => {
  const parPattern = [4, 4, 3, 5, 4, 4, 3, 5, 4];
  const par = parPattern[holeIndex] ?? 4;
  const variance = ((playerIndex * 2 + holeIndex) % 5) - 1;
  return Math.max(2, par + variance);
};

const createPlayers = async (prisma: PrismaClient, leagueId: number) => {
  const players: LabPlayer[] = [];
  for (const [index, [firstName, lastName]] of playerNames.entries()) {
    const player = await prisma.player.create({
      data: {
        firstName,
        lastName,
        email: `scoring.lab.player${index + 1}@test.local`,
        gender: index === 3 || index === 7 ? 'female' : 'male',
        handicap: 4 + index * 3,
        startingHandicap: 4 + index * 3,
        seasonPoints: 0,
        type: index % 2 === 0 ? 'captain' : 'player',
        leagueId,
      },
    });
    players.push(player);
  }
  return players;
};

const createTeams = async (prisma: PrismaClient, leagueId: number, players: LabPlayer[]) => {
  const teams: LabTeam[] = [];
  for (let index = 0; index < teamNames.length; index += 1) {
    const roster = players.slice(index * 2, index * 2 + 2);
    const team = await prisma.team.create({
      data: { leagueId, name: teamNames[index], seasonPoints: 0 },
    });
    await prisma.player.updateMany({
      where: { id: { in: roster.map((player) => player.id) } },
      data: { teamId: team.id },
    });
    teams.push({ ...team, players: roster });
  }
  return teams;
};

const createIndividualFlights = async ({
  prisma,
  eventId,
  startsAt,
  players,
  isMatch,
  completed,
}: {
  prisma: PrismaClient;
  eventId: number;
  startsAt: Date;
  players: LabPlayer[];
  isMatch: boolean;
  completed: boolean;
}) => {
  const flights = [];
  for (let index = 0; index < players.length; index += 4) {
    const group = players.slice(index, index + 4);
    const flight = await prisma.flight.create({
      data: {
        eventId,
        startsAt: new Date(startsAt.getTime() + Math.floor(index / 4) * 10 * 60_000),
        status: completed ? 'completed' : 'not_started',
      },
    });
    await prisma.flight_player.createMany({
      data: group.map((player, playerIndex) => ({
        flightId: flight.id,
        playerId: player.id,
        opponentId: isMatch
          ? group[playerIndex % 2 === 0 ? playerIndex + 1 : playerIndex - 1]?.id ?? null
          : null,
      })),
    });
    flights.push({ flight, players: group });
  }
  return flights;
};

const createTeamFlights = async ({
  prisma,
  eventId,
  startsAt,
  teams,
  completed,
}: {
  prisma: PrismaClient;
  eventId: number;
  startsAt: Date;
  teams: LabTeam[];
  completed: boolean;
}) => {
  const flights = [];
  for (let index = 0; index < teams.length; index += 2) {
    const left = teams[index];
    const right = teams[index + 1];
    if (!left || !right) continue;
    const flight = await prisma.flight.create({
      data: {
        eventId,
        startsAt: new Date(startsAt.getTime() + Math.floor(index / 2) * 10 * 60_000),
        status: completed ? 'completed' : 'not_started',
      },
    });
    await prisma.flight_team.createMany({
      data: [
        { flightId: flight.id, teamId: left.id, opponentId: right.id },
        { flightId: flight.id, teamId: right.id, opponentId: left.id },
      ],
    });
    await prisma.flight_player.createMany({
      data: [
        ...left.players.map((player, playerIndex) => ({
          flightId: flight.id,
          playerId: player.id,
          teamId: left.id,
          opponentId: right.players[playerIndex]?.id ?? null,
        })),
        ...right.players.map((player, playerIndex) => ({
          flightId: flight.id,
          playerId: player.id,
          teamId: right.id,
          opponentId: left.players[playerIndex]?.id ?? null,
        })),
      ],
    });
    flights.push({ flight, teams: [left, right] as const });
  }
  return flights;
};

const seedPlayerRounds = async ({
  eventId,
  players,
  isMatch,
  opponentByPlayerId,
}: {
  eventId: number;
  players: LabPlayer[];
  isMatch: boolean;
  opponentByPlayerId?: ReadonlyMap<number, number>;
}) => {
  for (const [playerIndex, player] of players.entries()) {
    const opponentIndex = playerIndex % 2 === 0 ? playerIndex + 1 : playerIndex - 1;
    await new Round(eventId, {
      playerId: player.id,
      opponentId: isMatch
        ? opponentByPlayerId?.get(player.id) ?? players[opponentIndex]?.id ?? null
        : null,
      scores: Object.fromEntries(
        Array.from({ length: 9 }, (_, holeIndex) => [
          holeIndex + 1,
          scoreFor(playerIndex, holeIndex),
        ]),
      ),
      points: 0,
      matchPoints: 0,
    }).process();
  }
};

const seedSharedTeamRounds = async ({
  prisma,
  eventId,
  flights,
}: {
  prisma: PrismaClient;
  eventId: number;
  flights: Array<{ flight: { id: number }; teams: readonly [LabTeam, LabTeam] }>;
}) => {
  for (const [flightIndex, { flight, teams }] of flights.entries()) {
    await prisma.$transaction(async (tx) => {
      await persistSharedTeamRounds({
        db: tx,
        eventId,
        flightId: flight.id,
        isEdit: false,
        rawTeamScores: teams.map((team, teamIndex) => ({
          teamId: team.id,
          scores: Object.fromEntries(
            Array.from({ length: 9 }, (_, holeIndex) => [
              holeIndex + 1,
              scoreFor(flightIndex * 2 + teamIndex, holeIndex),
            ]),
          ),
        })),
      });
    });
  }
};

export async function seedScoringFormatLab({
  prisma,
  adminId,
  courseId,
  teeId,
}: SeedContext) {
  const entitlement = await prisma.league_season_entitlement.create({
    data: {
      billingOwnerId: adminId,
      draftKey: 'scoring-format-lab',
      requiredGolfers: 8,
      status: 'bypassed',
    },
  });
  const league = await prisma.league.create({
    data: {
      name: '[SCORING LAB] All Formats',
      description: 'Ready-to-score and completed examples for every supported scoring format.',
      type: 'tournament',
      holeFormat: '9',
      format: null,
      viewerAccessCode: 'SCORELAB',
      adminId,
      entitlementId: entitlement.id,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T00:00:00.000Z'),
      contactFirstName: 'Scoring',
      contactLastName: 'Tester',
      contactEmail: 'admin@test.com',
    },
  });
  const players = await createPlayers(prisma, league.id);
  const teams = await createTeams(prisma, league.id, players);
  const eventNames: string[] = [];

  for (const [fixtureIndex, fixture] of fixtures.entries()) {
    for (const [stateIndex, state] of ['Ready to Score', 'Completed Results'].entries()) {
      const completed = stateIndex === 1;
      const startsAt = new Date('2026-03-01T14:00:00.000Z');
      startsAt.setUTCDate(startsAt.getUTCDate() + fixtureIndex * 20 + stateIndex * 7);
      const event = await prisma.event.create({
        data: {
          leagueId: league.id,
          courseId,
          teeId,
          name: `[SCORING LAB] ${fixture.label} — ${state}`,
          format: fixture.model,
          type: 'regular',
          holes: 9,
          startSide: 'front',
          startsAt,
          timeZone: 'America/Detroit',
          interval: 10,
          scoringMode: fixture.mode,
          scoringConfig: fixture.scoringConfig,
          pointsEnabled: true,
          ptsPerHole: fixture.scoringFamily === 'match' ? 1 : 0,
          ptsPerMatch: fixture.mode === 'match-play' ? 2 : 0,
          ptsPerTeamWin: fixture.model === 'team' && fixture.scoringFamily === 'match' ? 2 : 0,
          strokePoints: fixture.scoringFamily === 'stroke' ? [10, 8, 6, 4] : [],
          status: completed ? 'completed' : 'active',
        },
      });

      if (fixture.model === 'individual') {
        await createIndividualFlights({
          prisma,
          eventId: event.id,
          startsAt,
          players,
          isMatch: fixture.mode === 'match-play',
          completed,
        });
        if (completed) {
          await seedPlayerRounds({
            eventId: event.id,
            players,
            isMatch: fixture.mode === 'match-play',
          });
        }
      } else {
        const isSharedMode = fixture.mode === 'scramble' || fixture.mode === 'alternate-shot';
        const teamFlights = await createTeamFlights({
          prisma,
          eventId: event.id,
          startsAt,
          teams,
          completed: completed && !isSharedMode,
        });
        if (completed) {
          if (isSharedMode) {
            await seedSharedTeamRounds({ prisma, eventId: event.id, flights: teamFlights });
            await prisma.flight.updateMany({
              where: { eventId: event.id },
              data: { status: 'completed' },
            });
          } else {
            const opponentByPlayerId = new Map<number, number>();
            if (fixture.mode === 'match-play') {
              for (const { teams: [left, right] } of teamFlights) {
                left.players.forEach((player, playerIndex) => {
                  const opponent = right.players[playerIndex];
                  if (opponent) {
                    opponentByPlayerId.set(player.id, opponent.id);
                    opponentByPlayerId.set(opponent.id, player.id);
                  }
                });
              }
            }
            await seedPlayerRounds({
              eventId: event.id,
              players,
              isMatch: fixture.mode === 'match-play',
              opponentByPlayerId,
            });
          }
        }
      }
      eventNames.push(event.name);
    }
  }

  await prisma.league_onboarding.create({
    data: {
      leagueId: league.id,
      playersReviewedAt: new Date(),
      teamsReviewedAt: new Date(),
      firstEventCreatedAt: new Date(),
      scorecardsPrintedAt: new Date(),
      firstScoresEnteredAt: new Date(),
    },
  });
  await SeasonSync.recalculateLeague(league.id);

  const [eventCount, readyEventCount, completedEventCount, playerRoundCount, teamRoundCount] =
    await Promise.all([
      prisma.event.count({ where: { leagueId: league.id } }),
      prisma.event.count({ where: { leagueId: league.id, status: 'active' } }),
      prisma.event.count({ where: { leagueId: league.id, status: 'completed' } }),
      prisma.round.count({ where: { event: { leagueId: league.id } } }),
      prisma.team_round.count({ where: { event: { leagueId: league.id } } }),
    ]);

  const actualCounts = {
    events: eventCount,
    readyEvents: readyEventCount,
    completedEvents: completedEventCount,
    playerRounds: playerRoundCount,
    sharedTeamRounds: teamRoundCount,
  };
  const expectedCounts = {
    events: 24,
    readyEvents: 12,
    completedEvents: 12,
    playerRounds: 80,
    sharedTeamRounds: 8,
  };
  if (JSON.stringify(actualCounts) !== JSON.stringify(expectedCounts)) {
    throw new Error(
      `Scoring format lab seed is incomplete. Expected ${JSON.stringify(expectedCounts)}, received ${JSON.stringify(actualCounts)}.`,
    );
  }

  return { league: league.name, leagueId: league.id, events: eventNames };
}
