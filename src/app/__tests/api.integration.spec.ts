import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import app from '../../app';
import { prisma } from '../../prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { localDateKey, localTimeKey } from '../utils/time-zone';
import { lockAdminBilling, lockLeagueCapacity } from '../services/billingLock';

const password = 'integration-test-password';

const login = async (agent: ReturnType<typeof request.agent>, email: string) => {
  const response = await agent.post('/api/auth/login').send({ email, password });
  expect(response.status).toBe(200);
  return response.body.user;
};

const verifyRegisteredUser = async (
  agent: ReturnType<typeof request.agent>,
  userId: number,
  expectedRedirect: string,
) => {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  await prisma.$transaction([
    prisma.email_verification_token.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: now },
    }),
    prisma.email_verification_token.create({
      data: {
        userId,
        tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
        redirectPath: expectedRedirect,
        expiresAt: new Date(now.getTime() + 60_000),
      },
    }),
  ]);

  const response = await agent.post('/api/auth/email-verification/verify').send({ token });
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({
    message: 'Email has been verified.',
    redirectTo: expectedRedirect,
    user: { id: userId, emailVerificationStatus: 'VERIFIED' },
  });
  const replay = await agent.post('/api/auth/email-verification/verify').send({ token });
  expect(replay.status).toBe(400);
  return response;
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
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('locks billing rows during capacity transactions', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await lockAdminBilling(tx, 1);
        await lockLeagueCapacity(tx, 1);
      }),
    ).resolves.toBeUndefined();
  });

  it('allows configured CORS preflights and rejects untrusted browser origins', async () => {
    const trustedOrigin = new URL(String(process.env.CLIENT_URL)).origin;
    const hostileOrigin = 'https://hostile.example.com';

    const [trustedPreflight, hostilePreflight, hostileRequest, serverRequest] = await Promise.all([
      request(app)
        .options('/api/auth/login')
        .set('Origin', trustedOrigin)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type'),
      request(app)
        .options('/api/auth/login')
        .set('Origin', hostileOrigin)
        .set('Access-Control-Request-Method', 'POST'),
      request(app).get('/api/courses').set('Origin', hostileOrigin),
      request(app).get('/api/courses'),
    ]);

    expect(trustedPreflight.status).toBe(204);
    expect(trustedPreflight.headers['access-control-allow-origin']).toBe(trustedOrigin);
    expect(trustedPreflight.headers['access-control-allow-credentials']).toBe('true');
    expect(trustedPreflight.headers.vary).toContain('Origin');

    expect(hostilePreflight.status).toBe(403);
    expect(hostilePreflight.headers['access-control-allow-origin']).toBeUndefined();
    expect(hostileRequest.status).toBe(403);
    expect(hostileRequest.body.message).toBe('Request origin is not allowed');

    expect(serverRequest.status).toBe(200);
  });

  it('serves public course data but protects account data', async () => {
    const [courses, profile, adminLeagues, removedTestRoute, missingCourse] = await Promise.all([
      request(app).get('/api/courses'),
      request(app).get('/api/auth/me'),
      request(app).get('/api/admin/leagues'),
      request(app).get('/api/test-handicap'),
      request(app).get('/api/courses/999999999'),
    ]);

    expect(courses.status).toBe(200);
    expect(courses.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Fortress' })]),
    );
    expect(profile.status).toBe(401);
    expect(adminLeagues.status).toBe(401);
    expect(adminLeagues.type).toBe('application/json');
    expect(adminLeagues.body).toMatchObject({ message: 'Not authenticated' });
    expect(missingCourse.status).toBe(404);
    expect(missingCourse.type).toBe('application/json');
    expect(missingCourse.body).toMatchObject({ status: 404 });
    expect(removedTestRoute.status).toBe(404);
    expect(removedTestRoute.type).toBe('application/json');
    expect(removedTestRoute.body).toMatchObject({
      status: 404,
      name: 'NotFound',
      message: 'Route not found',
      path: '/api/test-handicap',
    });
    expect(removedTestRoute.body.requestId).toEqual(expect.any(String));
  });

  it('returns JSON for unmatched routes and malformed request bodies', async () => {
    const [missingRoute, malformedJson] = await Promise.all([
      request(app).get('/does-not-exist').set('Accept', 'text/html'),
      request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"email":'),
    ]);

    expect(missingRoute.status).toBe(404);
    expect(missingRoute.type).toBe('application/json');
    expect(missingRoute.body).toMatchObject({
      status: 404,
      name: 'NotFound',
      message: 'Route not found',
      path: '/does-not-exist',
    });

    expect(malformedJson.status).toBe(400);
    expect(malformedJson.type).toBe('application/json');
    expect(malformedJson.body).toMatchObject({
      status: 400,
      name: 'SyntaxError',
      message: 'Invalid JSON request body.',
    });
  });

  it('stores schedules as UTC instants with the course timezone preserved', async () => {
    const course = await prisma.course.findFirstOrThrow({
      where: { name: 'Fortress' },
    });
    const event = await prisma.event.findFirstOrThrow({
      where: { name: 'Week 1 - Team Stroke' },
      include: { flights: { orderBy: { startsAt: 'asc' } } },
    });

    expect(course.timeZone).toBe('America/Detroit');
    expect(event.timeZone).toBe(course.timeZone);
    expect(event.startsAt.toISOString()).toBe('2026-05-07T21:30:00.000Z');
    expect(event.flights.map((flight) => flight.startsAt.toISOString())).toEqual([
      '2026-05-07T21:30:00.000Z',
      '2026-05-07T21:40:00.000Z',
    ]);
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
      include: {
        players: true,
        teams: true,
        events: { include: { flights: true } },
      },
    });
    const activeFlight = league.events
      .find((event) => event.status === 'active')
      ?.flights.at(0);
    expect(activeFlight).toBeTruthy();

    const [
      read,
      updateFlight,
      updateLeague,
      createPlayer,
      updatePlayer,
      createTeam,
      updateTeam,
      updateEvent,
      updateScores,
      createInvitation,
      createAnnouncement,
      rotateViewerCode,
      createCheckout,
      adminLeagues,
      adminBilling,
      superAdmin,
    ] = await Promise.all([
      member.get(`/api/leagues/${league.id}`),
      member.put(`/api/flights/${activeFlight!.id}/players`).send({ players: [] }),
      member.put(`/api/leagues/${league.id}`).send({ name: 'Unauthorized change' }),
      member.post(`/api/leagues/${league.id}/players`).send({}),
      member.put(`/api/players/${league.players[0].id}`).send({ handicap: 0 }),
      member.post(`/api/leagues/${league.id}/teams`).send({}),
      member.put(`/api/teams/${league.teams[0].id}`).send({ name: 'Unauthorized change' }),
      member
        .put(`/api/leagues/${league.id}/events/${league.events[0].id}`)
        .send({ name: 'Unauthorized change' }),
      member
        .put(`/api/leagues/${league.id}/events/${league.events[0].id}/scores`)
        .send({}),
      member.post(`/api/leagues/${league.id}/invitations`).send({ playerIds: [] }),
      member.post(`/api/leagues/${league.id}/announcements`).send({ title: 'No access' }),
      member.post(`/api/leagues/${league.id}/viewer-access-code/rotate`),
      member.post('/api/payments/checkout-session').send({ purpose: 'registration' }),
      member.get('/api/admin/leagues'),
      member.get('/api/admin/billing'),
      member.get('/api/users'),
    ]);

    expect(read.status).toBe(200);
    expect([
      updateFlight,
      updateLeague,
      createPlayer,
      updatePlayer,
      createTeam,
      updateTeam,
      updateEvent,
      updateScores,
      createInvitation,
      createAnnouncement,
      rotateViewerCode,
      createCheckout,
      adminBilling,
    ].map((response) => response.status)).toEqual(Array(13).fill(403));
    expect(adminLeagues.status).toBe(403);
    expect(superAdmin.status).toBe(403);
  });

  it('locks competitive league settings after scores have been recorded', async () => {
    const admin = request.agent(app);
    await login(admin, 'admin@test.com');
    const league = await prisma.league.findFirstOrThrow({
      where: { name: 'Seeded Thursday Night League' },
    });

    const read = await admin.get(`/api/leagues/${league.id}`);
    expect(read.status).toBe(200);
    expect(read.body.hasRecordedScores).toBe(true);

    const update = await admin.put(`/api/leagues/${league.id}`).send({
      name: league.name,
      description: league.description,
      type: league.type,
      format: league.format,
      holeFormat: league.holeFormat === '9' ? '18' : '9',
      numPlayers: league.numPlayers,
      startDate: league.startDate,
      endDate: league.endDate,
      contactFirstName: league.contactFirstName,
      contactLastName: league.contactLastName,
      contactEmail: league.contactEmail,
      contactPhone: league.contactPhone,
    });

    expect(update.status).toBe(409);
    expect(update.body.message).toMatch(/cannot change after scores have been recorded/i);

    const changedEndDate = new Date(league.endDate);
    changedEndDate.setUTCDate(changedEndDate.getUTCDate() - 1);
    const dateUpdate = await admin.put(`/api/leagues/${league.id}`).send({
      name: league.name,
      description: league.description,
      type: league.type,
      format: league.format,
      holeFormat: league.holeFormat,
      numPlayers: league.numPlayers,
      startDate: league.startDate,
      endDate: changedEndDate,
      contactFirstName: league.contactFirstName,
      contactLastName: league.contactLastName,
      contactEmail: league.contactEmail,
      contactPhone: league.contactPhone,
    });

    expect(dateUpdate.status).toBe(409);
    expect(dateUpdate.body.message).toMatch(/cannot change after the league has been created/i);
  });

  it('filters league statistics to a configured half', async () => {
    const admin = request.agent(app);
    await login(admin, 'admin@test.com');
    const league = await prisma.league.findFirstOrThrow({
      where: { name: 'Seeded Thursday Night League' },
    });
    const completedEvent = await prisma.event.findFirstOrThrow({
      where: {
        leagueId: league.id,
        rounds: { some: { status: 'completed' } },
      },
      orderBy: { startsAt: 'asc' },
    });
    const cutoff = localDateKey(completedEvent.startsAt, completedEvent.timeZone);
    const secondHalfStart = new Date(`${cutoff}T00:00:00.000Z`);
    secondHalfStart.setUTCDate(secondHalfStart.getUTCDate() + 1);

    await prisma.league_scoring_period.deleteMany({ where: { leagueId: league.id } });
    await prisma.league_scoring_period.createMany({
      data: [
        {
          leagueId: league.id,
          name: '1st Half',
          position: 1,
          startDate: league.startDate,
          endDate: new Date(`${cutoff}T00:00:00.000Z`),
        },
        {
          leagueId: league.id,
          name: '2nd Half',
          position: 2,
          startDate: secondHalfStart,
          endDate: league.endDate,
        },
      ],
    });

    try {
      const firstHalf = await prisma.league_scoring_period.findFirstOrThrow({
        where: { leagueId: league.id, position: 1 },
      });
      const [overall, filtered] = await Promise.all([
        admin.get(`/api/leagues/${league.id}/metrics`),
        admin.get(`/api/leagues/${league.id}/metrics`).query({ periodId: firstHalf.id }),
      ]);

      expect(overall.status).toBe(200);
      expect(filtered.status).toBe(200);
      expect(filtered.body.selectedPeriod).toMatchObject({ id: firstHalf.id, name: '1st Half' });
      expect(filtered.body.seasonSummary.totalRounds).toBeGreaterThan(0);
      expect(filtered.body.seasonSummary.totalRounds).toBeLessThanOrEqual(
        overall.body.seasonSummary.totalRounds,
      );
      expect(filtered.body.scoringPeriods).toHaveLength(2);
    } finally {
      await prisma.league_scoring_period.deleteMany({ where: { leagueId: league.id } });
    }
  });

  it('keeps a newly registered admin isolated from another admins league', async () => {
    const outsider = request.agent(app);
    const missingConsent = await outsider.post('/api/auth/register').send({
      firstName: 'Outside',
      lastName: 'Admin',
      email: 'outside-admin@test.com',
      password,
    });
    expect(missingConsent.status).toBe(400);
    expect(missingConsent.body.message).toContain('Terms of Service');

    const registration = await outsider.post('/api/auth/register').send({
      firstName: 'Outside',
      lastName: 'Admin',
      email: 'outside-admin@test.com',
      password,
      acceptedPolicies: true,
    });
    expect(registration.status).toBe(201);
    expect(registration.body.user.emailVerificationStatus).toBe('PENDING');
    await expect(
      prisma.user.findUniqueOrThrow({ where: { id: registration.body.user.id } }),
    ).resolves.toMatchObject({
      metadata: {
        legalConsent: {
          termsVersion: '2026-08-25',
          privacyVersion: '2026-08-25',
        },
      },
    });

    const pendingLogin = await outsider.post('/api/auth/login').send({
      email: 'outside-admin@test.com',
      password,
    });
    expect(pendingLogin.status).toBe(403);
    await verifyRegisteredUser(outsider, registration.body.user.id, '/leagues/create');

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

    const [leagues, users, billing] = await Promise.all([
      superAdmin.get('/api/admin/leagues'),
      superAdmin.get('/api/users'),
      superAdmin.get('/api/admin/billing'),
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
    expect(billing.status).toBe(200);
    expect(billing.body).toMatchObject({
      summary: {
        completedPayments: expect.any(Number),
        purchasedSeats: expect.any(Number),
        refundedSeats: expect.any(Number),
        netRevenueCents: expect.any(Number),
        currency: expect.any(String),
      },
      accounts: expect.arrayContaining([
        expect.objectContaining({
          email: 'admin@test.com',
          includedGolfers: expect.any(Number),
          allocatedGolfers: expect.any(Number),
        }),
      ]),
      transactions: expect.arrayContaining([
        expect.objectContaining({
          sessionId: 'cs_demo_registration',
          status: 'paid',
          quantity: 8,
          userEmail: 'admin@test.com',
        }),
      ]),
      transactionLimit: 250,
    });
  });

  it('updates an event while preserving reordered match flights and opponent pairs', async () => {
    const admin = request.agent(app);
    await login(admin, 'admin@test.com');
    const event = await prisma.event.findFirstOrThrow({
      where: {
        format: 'individual',
        scoringFormat: 'match',
        status: 'upcoming',
        isComplete: false,
        rounds: { none: {} },
      },
      include: {
        flights: {
          orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
          include: { players: { orderBy: { id: 'asc' } } },
        },
      },
    });
    expect(event.flights.length).toBeGreaterThan(1);

    const reorderedFlights = [...event.flights].reverse().map((flight) => {
      const playerIds = flight.players.map((entry) => entry.playerId);
      return Array.from(
        { length: playerIds.length / 2 },
        (_, matchupIndex) => playerIds.slice(matchupIndex * 2, matchupIndex * 2 + 2),
      );
    });

    const response = await admin
      .put(`/api/leagues/${event.leagueId}/events/${event.id}`)
      .send({
        name: `${event.name} Updated`,
        type: event.type,
        date: localDateKey(event.startsAt, event.timeZone),
        startTime: localTimeKey(event.startsAt, event.timeZone),
        interval: event.interval,
        courseId: event.courseId,
        teeId: event.teeId,
        startSide: event.startSide,
        holes: event.holes,
        format: event.format,
        scoringFormat: event.scoringFormat,
        pointsEnabled: event.pointsEnabled,
        ptsPerHole: event.ptsPerHole,
        ptsPerMatch: event.ptsPerMatch,
        ptsPerTeamWin: event.ptsPerTeamWin,
        strokePoints: event.strokePoints,
        teams: [],
        flights: reorderedFlights,
      });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe(`${event.name} Updated`);

    const updatedFlights = await prisma.flight.findMany({
      where: { eventId: event.id },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      include: { players: { orderBy: { id: 'asc' } } },
    });
    expect(updatedFlights.map((flight) => flight.players.map((entry) => entry.playerId))).toEqual(
      reorderedFlights.map((matchups) => matchups.flat()),
    );
    for (const flight of updatedFlights) {
      expect(flight.players.every((entry) => Number(entry.opponentId) > 0)).toBe(true);
      expect(
        flight.players.every((entry) =>
          flight.players.some(
            (opponent) =>
              opponent.playerId === entry.opponentId && opponent.opponentId === entry.playerId,
          ),
        ),
      ).toBe(true);
    }
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

  it('rotates a viewer code and immediately revokes the previous code', async () => {
    const admin = request.agent(app);
    await login(admin, 'admin@test.com');
    const league = await prisma.league.findFirstOrThrow({
      where: { name: 'Seeded Thursday Night League' },
    });
    const oldCode = league.viewerAccessCode;
    const existingViewer = request.agent(app);
    expect(
      (await existingViewer.post('/api/auth/league-code').send({ code: oldCode })).status,
    ).toBe(200);

    const rotation = await admin.post(
      `/api/leagues/${league.id}/viewer-access-code/rotate`,
    );
    expect(rotation.status).toBe(200);
    expect(rotation.body.viewerAccessCode).toEqual(expect.any(String));
    expect(rotation.body.viewerAccessCode).not.toBe(oldCode);

    const [oldLogin, newLogin, existingSession] = await Promise.all([
      request(app).post('/api/auth/league-code').send({ code: oldCode }),
      request(app)
        .post('/api/auth/league-code')
        .send({ code: rotation.body.viewerAccessCode }),
      existingViewer.get(`/api/leagues/${league.id}`),
    ]);
    expect(oldLogin.status).toBe(400);
    expect(newLogin.status).toBe(200);
    expect(existingSession.status).toBe(401);
  });

  it('emails roster invitations and connects the matching account to its player', async () => {
    const admin = request.agent(app);
    await login(admin, 'admin@test.com');
    const league = await prisma.league.findFirstOrThrow({
      where: { name: 'Seeded Thursday Night League' },
    });
    const email = 'invited-player@test.com';
    const player = await prisma.player.create({
      data: {
        firstName: 'Invited',
        lastName: 'Player',
        email,
        handicap: 12,
        startingHandicap: 12,
        seasonPoints: 0,
        type: 'substitute',
        leagueId: league.id,
      },
    });

    const invitationResponse = await admin
      .post(`/api/leagues/${league.id}/invitations`)
      .send({ playerIds: [player.id] });
    expect(invitationResponse.status).toBe(201);
    expect(invitationResponse.body.invitations).toHaveLength(1);
    expect(invitationResponse.body.delivery).toHaveLength(1);

    const member = request.agent(app);
    const registration = await member.post('/api/auth/register').send({
      firstName: 'Invited',
      lastName: 'Player',
      email,
      password,
      acceptedPolicies: true,
      invitationToken: invitationResponse.body.invitations[0].token,
    });
    expect(registration.status).toBe(201);
    expect(registration.body.user.role).toBe('USER');
    await verifyRegisteredUser(
      member,
      registration.body.user.id,
      `/invite/${invitationResponse.body.invitations[0].token}`,
    );

    const claim = await member.post(
      `/api/invitations/${invitationResponse.body.invitations[0].token}/claim`,
    );
    expect(claim.status).toBe(200);
    expect(claim.body).toMatchObject({ leagueId: league.id, playerId: player.id });
    await expect(prisma.player.findUniqueOrThrow({ where: { id: player.id } })).resolves.toMatchObject({
      userId: registration.body.user.id,
    });
  });

  it('accepts a valid password reset token exactly once', async () => {
    const email = 'password-reset@test.com';
    const user = await prisma.user.create({
      data: {
        firstName: 'Password',
        lastName: 'Reset',
        email,
        username: email,
        password: await bcrypt.hash(password, 10),
        role: 'USER',
      },
    });
    const token = crypto.randomBytes(32).toString('hex');
    await prisma.password_reset_token.create({
      data: {
        userId: user.id,
        tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const newPassword = 'new-integration-password';
    const reset = await request(app)
      .post('/api/auth/password-reset/complete')
      .send({ token, password: newPassword });
    expect(reset.status).toBe(200);

    const replay = await request(app)
      .post('/api/auth/password-reset/complete')
      .send({ token, password: newPassword });
    expect(replay.status).toBe(400);

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ email, password: newPassword });
    expect(loginResponse.status).toBe(200);
  });

  it('destroys the server session on logout', async () => {
    const agent = request.agent(app);
    await login(agent, 'admin@test.com');
    expect((await agent.post('/api/auth/logout')).status).toBe(200);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });
});
