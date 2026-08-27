type SeedContext = {
  prisma: any;
  adminId: number;
  courseId: number;
  teeId: number;
};

type LeagueScenario = {
  key: string;
  name: string;
  type: 'season' | 'tournament';
  format: 'individual' | 'team' | null;
};

type EventMode = {
  format: 'individual' | 'team';
  scoringFormat: 'stroke' | 'match';
};

const leagueScenarios: LeagueScenario[] = [
  {
    key: 'season-individual-spring',
    name: '[TEST] Spring Individual Season',
    type: 'season',
    format: 'individual',
  },
  {
    key: 'season-individual-fall',
    name: '[TEST] Fall Individual Season',
    type: 'season',
    format: 'individual',
  },
  {
    key: 'season-team-spring',
    name: '[TEST] Spring Team Season',
    type: 'season',
    format: 'team',
  },
  {
    key: 'season-team-fall',
    name: '[TEST] Fall Team Season',
    type: 'season',
    format: 'team',
  },
  {
    key: 'tournament-classic',
    name: '[TEST] Classic Tournament',
    type: 'tournament',
    format: null,
  },
  {
    key: 'tournament-invitational',
    name: '[TEST] Invitational Tournament',
    type: 'tournament',
    format: null,
  },
];

const individualModes: EventMode[] = [
  { format: 'individual', scoringFormat: 'stroke' },
  { format: 'individual', scoringFormat: 'match' },
];

const teamModes: EventMode[] = [
  { format: 'team', scoringFormat: 'stroke' },
  { format: 'team', scoringFormat: 'match' },
];

const allModes = [...individualModes, ...teamModes];

const teamIdentities = [
  'Red Foxes',
  'Blue Herons',
  'Golden Eagles',
  'Black Bears',
  'Silver Wolves',
  'Green Gators',
  'Orange Tigers',
  'Purple Martins',
  'White Pines',
  'Copper Hawks',
  'Crimson Owls',
  'Navy Stags',
  'Teal Turtles',
  'Gray Falcons',
  'Maroon Moose',
  'Yellow Jackets',
];

const playerFirstNames = [
  'Alex',
  'Blake',
  'Casey',
  'Drew',
  'Emery',
  'Finley',
  'Gray',
  'Harper',
  'Indy',
  'Jordan',
  'Kai',
  'Logan',
  'Morgan',
  'Noel',
  'Oakley',
  'Parker',
  'Quinn',
  'Reese',
  'Sawyer',
  'Taylor',
  'Uma',
  'Val',
  'Wren',
  'Xander',
  'Yael',
  'Zion',
  'Avery',
  'Bailey',
  'Cameron',
  'Dakota',
  'Elliot',
  'Frankie',
];

const eventLabel = (mode: EventMode) =>
  `${mode.format === 'team' ? 'Team' : 'Individual'} ${
    mode.scoringFormat === 'stroke' ? 'Stroke' : 'Match'
  }`;

const createPlayers = async (prisma: any, leagueId: number, scenarioKey: string, count: number) => {
  const players = [];
  for (let index = 0; index < count; index += 1) {
    players.push(
      await prisma.player.create({
        data: {
          firstName: playerFirstNames[index] || `Player${index + 1}`,
          lastName: `Matrix ${String(index + 1).padStart(2, '0')}`,
          email: `${scenarioKey}.player${index + 1}@test.local`,
          phone: `555-${String(leagueId).padStart(3, '0')}-${String(index + 1).padStart(4, '0')}`,
          gender: index % 4 === 3 ? 'female' : 'male',
          handicap: 4 + (index % 16) * 2,
          startingHandicap: 4 + (index % 16) * 2,
          seasonPoints: 0,
          type: index === 0 ? 'captain' : index === count - 1 ? 'substitute' : 'player',
          leagueId,
        },
      }),
    );
  }
  return players;
};

const createTeams = async ({
  prisma,
  leagueId,
  players,
  namePrefix,
  eventId,
}: {
  prisma: any;
  leagueId: number;
  players: any[];
  namePrefix: string;
  eventId?: number;
}) => {
  const teams = [];
  for (let index = 0; index < players.length; index += 2) {
    const team = await prisma.team.create({
      data: {
        leagueId,
        eventId: eventId ?? null,
        name: `${namePrefix} — ${teamIdentities[index / 2] || `Squad ${index / 2 + 1}`}`,
        seasonPoints: 0,
      },
    });
    const roster = players.slice(index, index + 2);
    await prisma.player.updateMany({
      where: { id: { in: roster.map((player) => player.id) } },
      data: { teamId: team.id },
    });
    teams.push({ ...team, players: roster });
  }
  return teams;
};

const createIndividualFlights = async (
  prisma: any,
  eventId: number,
  eventStartsAt: Date,
  players: any[],
  scoringFormat: EventMode['scoringFormat'],
) => {
  const groups = Array.from({ length: Math.ceil(players.length / 4) }, (_, index) =>
    players.slice(index * 4, index * 4 + 4),
  );

  for (const [flightIndex, group] of groups.entries()) {
    const flight = await prisma.flight.create({
      data: {
        eventId,
        startsAt: new Date(eventStartsAt.getTime() + flightIndex * 10 * 60_000),
        status: 'not_started',
      },
    });
    await prisma.flight_player.createMany({
      data: group.map((player, playerIndex) => ({
        flightId: flight.id,
        playerId: player.id,
        opponentId:
          scoringFormat === 'match'
            ? group[playerIndex % 2 === 0 ? playerIndex + 1 : playerIndex - 1]?.id ?? null
            : null,
      })),
    });
  }
};

const createTeamFlights = async (
  prisma: any,
  eventId: number,
  eventStartsAt: Date,
  teams: any[],
) => {
  for (let index = 0; index < teams.length; index += 2) {
    const teamA = teams[index];
    const teamB = teams[index + 1];
    if (!teamA || !teamB) continue;

    const flight = await prisma.flight.create({
      data: {
        eventId,
        startsAt: new Date(eventStartsAt.getTime() + Math.floor(index / 2) * 10 * 60_000),
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
        ...teamA.players.map((player: any, playerIndex: number) => ({
          flightId: flight.id,
          teamId: teamA.id,
          playerId: player.id,
          opponentId: teamB.players[playerIndex]?.id ?? null,
        })),
        ...teamB.players.map((player: any, playerIndex: number) => ({
          flightId: flight.id,
          teamId: teamB.id,
          playerId: player.id,
          opponentId: teamA.players[playerIndex]?.id ?? null,
        })),
      ],
    });
  }
};

export async function seedLeagueScenarioMatrix({
  prisma,
  adminId,
  courseId,
  teeId,
}: SeedContext) {
  const summary: Array<{ league: string; events: string[] }> = [];

  for (const [scenarioIndex, scenario] of leagueScenarios.entries()) {
    const tournamentPlayerCount = scenario.type === 'tournament' ? 32 : 16;
    const entitlement = await prisma.league_season_entitlement.create({
      data: {
        billingOwnerId: adminId,
        draftKey: `scenario-matrix-${scenario.key}`,
        requiredGolfers: tournamentPlayerCount,
        status: 'bypassed',
      },
    });
    const league = await prisma.league.create({
      data: {
        name: scenario.name,
        description: `Comprehensive local test fixture for ${scenario.key}.`,
        type: scenario.type,
        holeFormat: 'mixed',
        format: scenario.format,
        viewerAccessCode: `MATRIX${scenarioIndex + 1}`,
        numPlayers: tournamentPlayerCount,
        adminId,
        entitlementId: entitlement.id,
        billingExempt: true,
        billingStatus: 'exempt',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        contactFirstName: 'Test',
        contactLastName: 'Administrator',
        contactEmail: 'admin@test.com',
        contactPhone: '555-0100',
      },
    });

    const players = await createPlayers(prisma, league.id, scenario.key, tournamentPlayerCount);
    const seasonTeams =
      scenario.type === 'season' && scenario.format === 'team'
        ? await createTeams({
            prisma,
            leagueId: league.id,
            players,
            namePrefix: 'Season Team',
          })
        : [];
    const baseModes =
      scenario.type === 'tournament'
        ? allModes
        : scenario.format === 'team'
          ? teamModes
          : individualModes;
    const modes = Array.from(
      { length: scenario.type === 'tournament' ? 2 : 3 },
      () => baseModes,
    ).flat();
    const createdEventNames: string[] = [];
    let tournamentTeamEventIndex = 0;

    for (const [modeIndex, mode] of modes.entries()) {
      const pointsEnabled = !(scenario.type === 'tournament' && mode.scoringFormat === 'stroke');
      const modeOccurrence =
        modes.slice(0, modeIndex + 1).filter(
          (candidate) =>
            candidate.format === mode.format &&
            candidate.scoringFormat === mode.scoringFormat,
        ).length;
      const eventDate = new Date('2026-07-15T13:00:00.000Z');
      eventDate.setUTCDate(eventDate.getUTCDate() + modeIndex * 14);
      const event = await prisma.event.create({
        data: {
          leagueId: league.id,
          courseId,
          teeId,
          name: `[TEST] ${eventLabel(mode)} #${modeOccurrence}`,
          format: mode.format,
          type:
            scenario.type === 'tournament'
              ? modeIndex === modes.length - 1
                ? 'tournament'
                : 'regular'
              : modeIndex === modes.length - 1
                ? 'playoff'
                : 'regular',
          holes: modeIndex % 2 === 0 ? 18 : 9,
          startSide: modeIndex % 2 === 0 ? 'front' : 'back',
          startsAt: eventDate,
          timeZone: 'America/Detroit',
          interval: 10,
          scoringFormat: mode.scoringFormat,
          pointsEnabled,
          ptsPerHole: mode.scoringFormat === 'match' ? 1 : 0,
          ptsPerMatch: mode.scoringFormat === 'match' ? 2 : 0,
          ptsPerTeamWin: mode.format === 'team' && mode.scoringFormat === 'match' ? 2 : 0,
          strokePoints:
            mode.scoringFormat === 'stroke' && pointsEnabled ? [10, 8, 6, 4, 2, 1] : [],
          status: modeIndex === 0 ? 'active' : 'upcoming',
          isComplete: false,
        },
      });

      if (mode.format === 'individual') {
        await createIndividualFlights(
          prisma,
          event.id,
          event.startsAt,
          players,
          mode.scoringFormat,
        );
      } else {
        let eventTeams = seasonTeams;
        if (scenario.type === 'tournament') {
          const rosterStart = tournamentTeamEventIndex * 8;
          eventTeams = await createTeams({
            prisma,
            leagueId: league.id,
            eventId: event.id,
            players: players.slice(rosterStart, rosterStart + 8),
            namePrefix: `${eventLabel(mode)} Team`,
          });
          tournamentTeamEventIndex += 1;
        }
        await createTeamFlights(prisma, event.id, event.startsAt, eventTeams);
      }
      createdEventNames.push(event.name);
    }

    await prisma.league_onboarding.create({
      data: {
        leagueId: league.id,
        playersReviewedAt: new Date(),
        teamsReviewedAt: scenario.format === 'team' ? new Date() : null,
        firstEventCreatedAt: new Date(),
      },
    });
    summary.push({ league: league.name, events: createdEventNames });
  }

  return summary;
}
