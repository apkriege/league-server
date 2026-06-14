import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const password = 'testing';

const holes = [
  { num: 1, par: 4, distance: 395, hcp: 7 },
  { num: 2, par: 5, distance: 520, hcp: 3 },
  { num: 3, par: 3, distance: 168, hcp: 17 },
  { num: 4, par: 4, distance: 410, hcp: 1 },
  { num: 5, par: 4, distance: 360, hcp: 11 },
  { num: 6, par: 5, distance: 505, hcp: 5 },
  { num: 7, par: 3, distance: 155, hcp: 15 },
  { num: 8, par: 4, distance: 430, hcp: 9 },
  { num: 9, par: 4, distance: 385, hcp: 13 },
  { num: 10, par: 4, distance: 405, hcp: 8 },
  { num: 11, par: 5, distance: 535, hcp: 4 },
  { num: 12, par: 3, distance: 180, hcp: 18 },
  { num: 13, par: 4, distance: 420, hcp: 2 },
  { num: 14, par: 4, distance: 355, hcp: 12 },
  { num: 15, par: 5, distance: 515, hcp: 6 },
  { num: 16, par: 3, distance: 165, hcp: 16 },
  { num: 17, par: 4, distance: 440, hcp: 10 },
  { num: 18, par: 4, distance: 390, hcp: 14 },
];

const playerSeeds = [
  ['Adam', 'Admin', 'admin@test.com', 6],
  ['User', 'Player', 'user@test.com', 14],
  ['Ben', 'Baker', 'ben@test.com', 8],
  ['Chris', 'Carter', 'chris@test.com', 11],
  ['Drew', 'Dalton', 'drew@test.com', 17],
  ['Evan', 'Edwards', 'evan@test.com', 4],
  ['Frank', 'Foster', 'frank@test.com', 19],
  ['Grant', 'Gibson', 'grant@test.com', 9],
] as const;

async function hashPassword() {
  return bcrypt.hash(password, 10);
}

async function clearData() {
  await prisma.score.deleteMany();
  await prisma.round.deleteMany();
  await prisma.flight_player.deleteMany();
  await prisma.flight_team.deleteMany();
  await prisma.flight.deleteMany();
  await prisma.team_event_points.deleteMany();
  await prisma.league_invitation.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.audit_log.deleteMany();
  await prisma.league_onboarding.deleteMany();
  await prisma.player.deleteMany();
  await prisma.team.deleteMany();
  await prisma.event.deleteMany();
  await prisma.league.deleteMany();
  await prisma.tee.deleteMany();
  await prisma.course.deleteMany();
  await prisma.club.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}

function scoreFor(playerIndex: number, holeIndex: number) {
  const par = Number(holes[holeIndex].par);
  const pattern = (playerIndex + holeIndex) % 6;
  if (pattern === 0) return par - 1;
  if (pattern === 1 || pattern === 2) return par;
  if (pattern === 3 || pattern === 4) return par + 1;
  return par + 2;
}

async function createRound({
  eventId,
  player,
  courseId,
  teeId,
  eventDate,
  playerIndex,
  pointsEarned,
  matchPoints = 0,
}: {
  eventId: number;
  player: { id: number; handicap: number };
  courseId: number;
  teeId: number;
  eventDate: Date;
  playerIndex: number;
  pointsEarned: number;
  matchPoints?: number;
}) {
  const scoreRows = holes.map((hole, holeIndex) => {
    const gross = scoreFor(playerIndex, holeIndex);
    const popsReceived = Number(player.handicap) >= Number(hole.hcp) ? 1 : 0;
    const net = gross - popsReceived;
    return {
      hole: hole.num,
      par: hole.par,
      gross,
      net,
      adjusted: gross,
      putts: 2,
      popsReceived,
      points: Math.max(0, 3 - Math.max(0, net - hole.par)),
      courseId,
      teeId,
      playerId: player.id,
      eventId,
    };
  });

  const gross = scoreRows.reduce((sum, score) => sum + score.gross, 0);
  const net = scoreRows.reduce((sum, score) => sum + score.net, 0);
  const adjusted = gross;
  const differential = Number((((adjusted - 72.1) * 113) / 128).toFixed(2));

  return prisma.round.create({
    data: {
      eventId,
      playerId: player.id,
      courseId,
      teeId,
      scoringFormat: 'stroke',
      status: 'completed',
      holesPlayed: 18,
      gross,
      net,
      adjusted,
      putts: 36,
      courseRating: 72.1,
      courseSlope: 128,
      differential,
      preHandicap: player.handicap,
      postHandicap: Number((player.handicap + differential / 100).toFixed(2)),
      pointsEarned,
      matchPoints,
      eagles: 0,
      birdies: scoreRows.filter((score) => score.gross === score.par - 1).length,
      pars: scoreRows.filter((score) => score.gross === score.par).length,
      bogeys: scoreRows.filter((score) => score.gross === score.par + 1).length,
      doubleBogeys: scoreRows.filter((score) => score.gross >= score.par + 2).length,
      tripleBogeys: 0,
      date: eventDate,
      scores: {
        create: scoreRows.map(({ eventId: _eventId, playerId: _playerId, ...score }) => ({
          ...score,
          eventId,
          playerId: player.id,
        })),
      },
    },
  });
}

async function main() {
  await clearData();
  const hashedPassword = await hashPassword();

  const superUser = await prisma.user.create({
    data: {
      firstName: 'Super',
      lastName: 'Admin',
      email: 'super@test.com',
      username: 'super@test.com',
      password: hashedPassword,
      role: 'SUPER',
    },
  });

  const adminUser = await prisma.user.create({
    data: {
      firstName: 'Adam',
      lastName: 'Admin',
      email: 'admin@test.com',
      username: 'admin@test.com',
      password: hashedPassword,
      role: 'ADMIN',
      metadata: {
        billing: {
          includedGolfers: 8,
          minimumGolfers: 8,
          pricePerGolferCents: 1000,
          currency: 'usd',
          registrationCompletedAt: new Date().toISOString(),
        },
      },
    },
  });

  const regularUser = await prisma.user.create({
    data: {
      firstName: 'User',
      lastName: 'Player',
      email: 'user@test.com',
      username: 'user@test.com',
      password: hashedPassword,
      role: 'USER',
    },
  });

  const club = await prisma.club.create({
    data: {
      name: 'Test Valley Golf Club',
      description: 'Seeded club for local app testing.',
      location: 'Indianapolis, IN',
      phone: '555-0100',
      link: 'https://example.com',
    },
  });

  const course = await prisma.course.create({
    data: {
      clubId: club.id,
      name: 'Test Valley Championship Course',
      description: 'Full seeded course with tees and hole data.',
      location: 'Indianapolis, IN',
      phone: '555-0101',
      accessType: 'public',
      numHoles: 18,
      par: 72,
    },
  });

  const tee = await prisma.tee.create({
    data: {
      courseId: course.id,
      name: 'Blue',
      color: 'Blue',
      distance: holes.reduce((sum, hole) => sum + hole.distance, 0),
      par: 72,
      frontPar: 36,
      backPar: 36,
      slopeMen: 128,
      slopeFrontMen: 126,
      slopeBackMen: 130,
      slopeWomen: 124,
      slopeFrontWomen: 122,
      slopeBackWomen: 126,
      ratingMen: 72.1,
      ratingFrontMen: 36.0,
      ratingBackMen: 36.1,
      ratingWomen: 73.8,
      ratingFrontWomen: 36.8,
      ratingBackWomen: 37.0,
      holes,
    },
  });

  const league = await prisma.league.create({
    data: {
      name: 'Seeded Thursday Night League',
      description: 'Complete test league with players, teams, events, flights, and scores.',
      type: 'season',
      access: 'public',
      format: 'team',
      numPlayers: 8,
      adminId: adminUser.id,
      startDate: new Date('2026-05-01T00:00:00.000Z'),
      endDate: new Date('2026-09-01T00:00:00.000Z'),
      contactFirstName: 'Adam',
      contactLastName: 'Admin',
      contactEmail: 'admin@test.com',
      contactPhone: '555-0110',
    },
  });

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

  const players = [];
  for (const [index, [firstName, lastName, email, handicap]] of playerSeeds.entries()) {
    const player = await prisma.player.create({
      data: {
        firstName,
        lastName,
        email,
        phone: `555-02${String(index).padStart(2, '0')}`,
        handicap,
        startingHandicap: handicap,
        seasonPoints: 0,
        type: index === 0 ? 'captain' : 'player',
        leagueId: league.id,
        userId:
          email === adminUser.email ? adminUser.id : email === regularUser.email ? regularUser.id : null,
      },
    });
    players.push(player);
  }

  const teams = [];
  for (let teamIndex = 0; teamIndex < 4; teamIndex += 1) {
    const team = await prisma.team.create({
      data: {
        name: `Team ${teamIndex + 1}`,
        leagueId: league.id,
        seasonPoints: 0,
      },
    });
    teams.push(team);

    await prisma.player.updateMany({
      where: {
        id: {
          in: players
            .slice(teamIndex * 2, teamIndex * 2 + 2)
            .map((player) => player.id),
        },
      },
      data: { teamId: team.id },
    });
  }

  const refreshedTeams = await prisma.team.findMany({
    where: { leagueId: league.id },
    include: { players: true },
    orderBy: { id: 'asc' },
  });

  const eventOne = await prisma.event.create({
    data: {
      leagueId: league.id,
      courseId: course.id,
      teeId: tee.id,
      name: 'Week 1 - Team Stroke',
      format: 'team',
      type: 'regular',
      holes: 18,
      startSide: 'front',
      date: new Date('2026-05-07T22:00:00.000Z'),
      startTime: '17:30',
      interval: 10,
      scoringFormat: 'stroke',
      ptsPerHole: 1,
      ptsPerMatch: 0,
      ptsPerTeamWin: 2,
      strokePoints: [10, 8, 6, 4, 2, 1],
      status: 'completed',
      isComplete: true,
    },
  });

  const eventTwo = await prisma.event.create({
    data: {
      leagueId: league.id,
      courseId: course.id,
      teeId: tee.id,
      name: 'Week 2 - Team Match',
      format: 'team',
      type: 'regular',
      holes: 18,
      startSide: 'front',
      date: new Date('2026-05-14T22:00:00.000Z'),
      startTime: '17:30',
      interval: 10,
      scoringFormat: 'match',
      ptsPerHole: 1,
      ptsPerMatch: 2,
      ptsPerTeamWin: 2,
      status: 'active',
      isComplete: false,
    },
  });

  const eventThree = await prisma.event.create({
    data: {
      leagueId: league.id,
      courseId: course.id,
      teeId: tee.id,
      name: 'Week 3 - Individual Stroke',
      format: 'individual',
      type: 'regular',
      holes: 9,
      startSide: 'back',
      date: new Date('2026-05-21T22:00:00.000Z'),
      startTime: '17:30',
      interval: 10,
      scoringFormat: 'stroke',
      ptsPerHole: 0,
      ptsPerMatch: 0,
      ptsPerTeamWin: 0,
      strokePoints: [10, 8, 6, 4, 2, 1],
      status: 'upcoming',
      isComplete: false,
    },
  });

  const teamMatchups = [
    [refreshedTeams[0], refreshedTeams[1]],
    [refreshedTeams[2], refreshedTeams[3]],
  ];

  for (const [flightIndex, [teamA, teamB]] of teamMatchups.entries()) {
    const flight = await prisma.flight.create({
      data: {
        eventId: eventOne.id,
        startTime: flightIndex === 0 ? '17:30' : '17:40',
        status: 'completed',
      },
    });

    await prisma.flight_team.createMany({
      data: [
        { flightId: flight.id, teamId: teamA.id, opponentId: teamB.id },
        { flightId: flight.id, teamId: teamB.id, opponentId: teamA.id },
      ],
    });

    await prisma.flight_player.createMany({
      data: [
        ...teamA.players.map((player) => ({ flightId: flight.id, teamId: teamA.id, playerId: player.id })),
        ...teamB.players.map((player) => ({ flightId: flight.id, teamId: teamB.id, playerId: player.id })),
      ],
    });
  }

  for (const [flightIndex, [teamA, teamB]] of teamMatchups.entries()) {
    const flight = await prisma.flight.create({
      data: {
        eventId: eventTwo.id,
        startTime: flightIndex === 0 ? '17:30' : '17:40',
        status: 'not_started',
      },
    });

    await prisma.flight_team.createMany({
      data: [
        { flightId: flight.id, teamId: teamA.id, opponentId: teamB.id },
        { flightId: flight.id, teamId: teamB.id, opponentId: teamA.id },
      ],
    });

    await prisma.flight_player.createMany({
      data: [
        ...teamA.players.map((player, index) => ({
          flightId: flight.id,
          teamId: teamA.id,
          playerId: player.id,
          opponentId: teamB.players[index]?.id ?? null,
        })),
        ...teamB.players.map((player, index) => ({
          flightId: flight.id,
          teamId: teamB.id,
          playerId: player.id,
          opponentId: teamA.players[index]?.id ?? null,
        })),
      ],
    });
  }

  for (let flightIndex = 0; flightIndex < 3; flightIndex += 1) {
    const flight = await prisma.flight.create({
      data: {
        eventId: eventThree.id,
        startTime: `17:${30 + flightIndex * 10}`,
        status: 'not_started',
      },
    });

    await prisma.flight_player.createMany({
      data: players.slice(flightIndex * 3, flightIndex * 3 + 3).map((player) => ({
        flightId: flight.id,
        playerId: player.id,
        teamId: player.teamId,
      })),
    });
  }

  const pointsByPlayer = new Map<number, number>();
  for (const [index, player] of players.entries()) {
    const pointsEarned = Math.max(1, 12 - index);
    pointsByPlayer.set(player.id, pointsEarned);
    await createRound({
      eventId: eventOne.id,
      player,
      courseId: course.id,
      teeId: tee.id,
      eventDate: eventOne.date,
      playerIndex: index,
      pointsEarned,
    });
  }

  for (const team of refreshedTeams) {
    const points = team.players.reduce(
      (sum, player) => sum + Number(pointsByPlayer.get(player.id) || 0),
      0,
    );

    await prisma.team.update({
      where: { id: team.id },
      data: { seasonPoints: points },
    });

    await prisma.team_event_points.create({
      data: {
        leagueId: league.id,
        eventId: eventOne.id,
        teamId: team.id,
        points,
      },
    });
  }

  for (const player of players) {
    await prisma.player.update({
      where: { id: player.id },
      data: { seasonPoints: Number(pointsByPlayer.get(player.id) || 0) },
    });
  }

  await prisma.notification.create({
    data: {
      userId: adminUser.id,
      leagueId: league.id,
      type: 'seed',
      title: 'Seed league ready',
      body: 'Your seeded Thursday Night League is ready for testing.',
    },
  });

  await prisma.audit_log.create({
    data: {
      userId: adminUser.id,
      leagueId: league.id,
      entity: 'league',
      entityId: league.id,
      action: 'seed',
      summary: 'Created full seeded league test data.',
    },
  });

  console.log('Seed complete.');
  console.log('Users:');
  console.log(`  SUPER: super@test.com / ${password}`);
  console.log(`  ADMIN: admin@test.com / ${password}`);
  console.log(`  USER:  user@test.com / ${password}`);
  console.log(`League: ${league.name} (${league.id})`);
}

main()
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
