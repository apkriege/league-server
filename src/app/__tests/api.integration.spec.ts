import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import app from '../../app';
import { prisma } from '../../prisma';

const password = 'integration-test-password';

const login = async (agent: ReturnType<typeof request.agent>, email: string) => {
  const response = await agent.post('/api/auth/login').send({ email, password });
  expect(response.status).toBe(200);
  return response.body.user;
};

describe('API integration', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('reports application and database health', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok', database: 'ok' });
    expect(Number.isNaN(Date.parse(response.body.timestamp))).toBe(false);
  });

  it('serves public course data but protects account data', async () => {
    const [courses, profile, adminLeagues] = await Promise.all([
      request(app).get('/api/courses'),
      request(app).get('/api/auth/me'),
      request(app).get('/api/admin/leagues'),
    ]);

    expect(courses.status).toBe(200);
    expect(courses.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Fortress' })]),
    );
    expect(profile.status).toBe(401);
    expect(adminLeagues.status).toBe(401);
  });

  it('validates credentials and persists an authenticated admin session', async () => {
    const agent = request.agent(app);
    const badLogin = await agent
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'incorrect-password' });
    expect(badLogin.status).toBe(400);
    expect(badLogin.body.message).toBe('Invalid credentials');

    const user = await login(agent, 'ADMIN@test.com');
    expect(user).toMatchObject({ email: 'admin@test.com', role: 'ADMIN' });

    const [profile, leagues] = await Promise.all([
      agent.get('/api/auth/me'),
      agent.get('/api/admin/leagues'),
    ]);
    expect(profile.status).toBe(200);
    expect(profile.body.user.email).toBe('admin@test.com');
    expect(leagues.status).toBe(200);
    expect(leagues.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Seeded Thursday Night League' }),
      ]),
    );
  });

  it('limits a league-code viewer to the selected league and hides its access code', async () => {
    const viewer = request.agent(app);
    const loginResponse = await viewer
      .post('/api/auth/league-code')
      .send({ code: ' test-code ' });

    expect(loginResponse.status).toBe(200);
    const leagueId = Number(loginResponse.body.leagueId);

    const [league, events, profile, update] = await Promise.all([
      viewer.get(`/api/leagues/${leagueId}`),
      viewer.get(`/api/leagues/${leagueId}/events`),
      viewer.get('/api/auth/me'),
      viewer.put('/api/flights/1/players').send({ players: [] }),
    ]);

    expect(league.status).toBe(200);
    expect(league.body.viewerAccessCode).toBeUndefined();
    expect(events.status).toBe(200);
    expect(events.body).toHaveLength(3);
    expect(profile.status).toBe(401);
    expect(update.status).toBe(401);
  });

  it('prevents a regular member from changing league operations', async () => {
    const member = request.agent(app);
    await login(member, 'user@test.com');

    const league = await prisma.league.findFirstOrThrow({
      where: { name: 'Seeded Thursday Night League' },
      include: { events: { include: { flights: true } } },
    });
    const activeFlight = league.events
      .find((event) => event.status === 'active')
      ?.flights.at(0);
    expect(activeFlight).toBeTruthy();

    const [read, update, adminLeagues, superAdmin] = await Promise.all([
      member.get(`/api/leagues/${league.id}`),
      member.put(`/api/flights/${activeFlight!.id}/players`).send({ players: [] }),
      member.get('/api/admin/leagues'),
      member.get('/api/users'),
    ]);

    expect(read.status).toBe(200);
    expect(update.status).toBe(403);
    expect(adminLeagues.status).toBe(403);
    expect(superAdmin.status).toBe(403);
  });

  it('keeps a newly registered admin isolated from another admins league', async () => {
    const outsider = request.agent(app);
    const registration = await outsider.post('/api/auth/register').send({
      firstName: 'Outside',
      lastName: 'Admin',
      email: 'outside-admin@test.com',
      password,
    });
    expect(registration.status).toBe(201);

    const league = await prisma.league.findFirstOrThrow({
      where: { name: 'Seeded Thursday Night League' },
      include: { events: true },
    });
    const [ownLeagues, foreignLeague, foreignUpdate] = await Promise.all([
      outsider.get('/api/admin/leagues'),
      outsider.get(`/api/leagues/${league.id}`),
      outsider
        .put(`/api/leagues/${league.id}/events/${league.events[0].id}`)
        .send({ name: 'Unauthorized change' }),
    ]);

    expect(ownLeagues.status).toBe(200);
    expect(ownLeagues.body).toEqual([]);
    expect(foreignLeague.status).toBe(403);
    expect(foreignUpdate.status).toBe(403);
  });

  it('allows super admins to inspect all leagues and users', async () => {
    const superAdmin = request.agent(app);
    await login(superAdmin, 'super@test.com');

    const [leagues, users] = await Promise.all([
      superAdmin.get('/api/admin/leagues'),
      superAdmin.get('/api/users'),
    ]);
    expect(leagues.status).toBe(200);
    expect(leagues.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Seeded Thursday Night League' }),
      ]),
    );
    expect(users.status).toBe(200);
    expect(users.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ email: 'admin@test.com' })]),
    );
  });

  it('creates and edits scores without changing other events or flights', async () => {
    const admin = request.agent(app);
    await login(admin, 'admin@test.com');
    const activeEvent = await prisma.event.findFirstOrThrow({
      where: { status: 'active' },
      include: {
        flights: {
          orderBy: { id: 'asc' },
          include: {
            players: { orderBy: { id: 'asc' } },
            teams: { orderBy: { id: 'asc' } },
          },
        },
      },
    });
    const targetFlight = activeEvent.flights[0];
    const untouchedFlight = activeEvent.flights[1];
    const completedEvent = await prisma.event.findFirstOrThrow({ where: { status: 'completed' } });
    const completedRoundCount = await prisma.round.count({
      where: { eventId: completedEvent.id },
    });
    const scores = Object.fromEntries(
      Array.from({ length: Number(activeEvent.holes) }, (_, index) => [index + 1, 5]),
    );
    const payload = {
      eventId: activeEvent.id,
      flightId: targetFlight.id,
      players: targetFlight.players.map((entry) => ({
        playerId: entry.playerId,
        opponentId: entry.opponentId,
        scores,
        putts: [],
        gross: Number(activeEvent.holes) * 5,
        net: Number(activeEvent.holes) * 5,
        points: 9,
        matchPoints: 1,
      })),
      teams: targetFlight.teams.map((entry) => ({ teamId: entry.teamId, points: 1 })),
    };

    const create = await admin
      .post(`/api/leagues/${activeEvent.leagueId}/events/${activeEvent.id}/scores`)
      .send(payload);
    expect(create.status).toBe(201);

    const [targetAfterCreate, untouchedAfterCreate, roundsAfterCreate, completedRoundsAfterCreate] =
      await Promise.all([
        prisma.flight.findUniqueOrThrow({ where: { id: targetFlight.id } }),
        prisma.flight.findUniqueOrThrow({ where: { id: untouchedFlight.id } }),
        prisma.round.findMany({ where: { eventId: activeEvent.id } }),
        prisma.round.count({ where: { eventId: completedEvent.id } }),
      ]);
    expect(targetAfterCreate.status).toBe('completed');
    expect(untouchedAfterCreate.status).toBe('not_started');
    expect(roundsAfterCreate).toHaveLength(targetFlight.players.length);
    expect(completedRoundsAfterCreate).toBe(completedRoundCount);

    const editedPayload = {
      ...payload,
      players: payload.players.map((player, index) => ({
        ...player,
        scores: index === 0 ? { ...scores, 1: 6 } : scores,
      })),
    };
    const update = await admin
      .put(`/api/leagues/${activeEvent.leagueId}/events/${activeEvent.id}/scores`)
      .send(editedPayload);
    expect(update.status).toBe(200);

    const [roundCount, editedScore, untouchedStatus, audit] = await Promise.all([
      prisma.round.count({ where: { eventId: activeEvent.id } }),
      prisma.score.findFirstOrThrow({
        where: {
          eventId: activeEvent.id,
          playerId: targetFlight.players[0].playerId,
          hole: 1,
        },
      }),
      prisma.flight.findUniqueOrThrow({ where: { id: untouchedFlight.id } }),
      prisma.audit_log.findFirst({
        where: { entity: 'event', entityId: activeEvent.id, action: 'update_scores' },
      }),
    ]);
    expect(roundCount).toBe(targetFlight.players.length);
    expect(editedScore.gross).toBe(6);
    expect(untouchedStatus.status).toBe('not_started');
    expect(audit).toBeTruthy();
  });

  it('rejects changes to completed flights', async () => {
    const admin = request.agent(app);
    await login(admin, 'admin@test.com');
    const completed = await prisma.flight.findFirstOrThrow({
      where: { status: 'completed' },
      include: { players: true },
    });

    const response = await admin
      .put(`/api/flights/${completed.id}/players`)
      .send({
        players: completed.players.map((entry) => ({
          playerId: entry.playerId,
          teamId: entry.teamId,
          opponentId: entry.opponentId,
        })),
      });

    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/completed flights cannot be changed/i);
  });

  it('updates only the selected flight and records the administrative change', async () => {
    const admin = request.agent(app);
    const user = await login(admin, 'admin@test.com');
    const league = await prisma.league.findFirstOrThrow({
      where: { adminId: user.id },
      include: {
        players: { orderBy: { id: 'asc' } },
        events: {
          where: { format: 'individual' },
          include: { flights: { include: { players: { orderBy: { id: 'asc' } } } } },
        },
      },
    });
    const targetFlight = league.events[0].flights[0];
    const untouchedFlight = league.events[0].flights[1];
    const originalTargetIds = targetFlight.players.map((entry) => entry.playerId);
    const untouchedIds = untouchedFlight.players.map((entry) => entry.playerId);
    const replacement = league.players.find((player) => !originalTargetIds.includes(player.id));
    expect(replacement).toBeTruthy();

    const payload = targetFlight.players.map((entry, index) => ({
      playerId: index === 0 ? replacement!.id : entry.playerId,
      teamId: entry.teamId,
      opponentId: entry.opponentId,
    }));
    const response = await admin
      .put(`/api/flights/${targetFlight.id}/players`)
      .send({ players: payload });

    expect(response.status).toBe(200);
    const [updatedTarget, updatedUntouched, audit] = await Promise.all([
      prisma.flight_player.findMany({
        where: { flightId: targetFlight.id },
        orderBy: { id: 'asc' },
      }),
      prisma.flight_player.findMany({
        where: { flightId: untouchedFlight.id },
        orderBy: { id: 'asc' },
      }),
      prisma.audit_log.findFirst({
        where: { entity: 'flight', entityId: targetFlight.id, action: 'swap_players' },
        orderBy: { id: 'desc' },
      }),
    ]);
    expect(updatedTarget.map((entry) => entry.playerId)).toEqual(
      payload.map((entry) => entry.playerId),
    );
    expect(updatedUntouched.map((entry) => entry.playerId)).toEqual(untouchedIds);
    expect(audit).toMatchObject({ userId: user.id, leagueId: league.id });
  });

  it('destroys the server session on logout', async () => {
    const agent = request.agent(app);
    await login(agent, 'admin@test.com');
    expect((await agent.post('/api/auth/logout')).status).toBe(200);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });
});
