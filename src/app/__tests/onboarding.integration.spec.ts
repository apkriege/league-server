import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import app from '../../app';
import { prisma } from '../../prisma';

const password = 'onboarding-test-password';
const registration = {
  firstName: 'Onboarding', lastName: 'Golfer', email: 'onboarding-invite@test.com',
  password, acceptedPolicies: true,
};

describe('onboarding API contracts', () => {
  afterAll(async () => { await prisma.$disconnect(); });

  it('rejects short passwords and missing policy consent before creating an account', async () => {
    const short = await request(app).post('/api/auth/register').send({ ...registration, password: 'short' });
    expect(short.status).toBe(400);
    const noConsent = await request(app).post('/api/auth/register').send({ ...registration, acceptedPolicies: false });
    expect(noConsent.status).toBe(400);
    expect(await prisma.user.findUnique({ where: { email: registration.email } })).toBeNull();
  });

  it('validates invitation email ownership and preserves the player role and verification destination', async () => {
    const league = await prisma.league.findFirstOrThrow({ where: { name: 'Seeded Thursday Night League' } });
    const player = await prisma.player.create({ data: {
      firstName: 'Onboarding', lastName: 'Golfer', email: registration.email,
      handicap: 12.4, startingHandicap: 12.4, seasonPoints: 0, type: 'substitute', leagueId: league.id,
    } });
    const invitation = await prisma.league_invitation.create({ data: {
      leagueId: league.id, playerId: player.id, invitedById: league.adminId!,
      email: registration.email, token: 'onboarding-contract-invitation',
      expiresAt: new Date(Date.now() + 60_000),
    } });
    const mismatch = await request(app).post('/api/auth/register').send({
      ...registration, email: 'onboarding-wrong@test.com', invitationToken: invitation.token,
    });
    expect(mismatch.status).toBe(400);
    const created = await request(app).post('/api/auth/register').send({ ...registration, invitationToken: invitation.token });
    expect(created.status).toBe(201);
    expect(created.body.user.role).toBe('USER');
    const verification = await prisma.email_verification_token.findFirstOrThrow({ where: { userId: created.body.user.id } });
    expect(verification.redirectPath).toBe(`/invite/${invitation.token}`);
    const pendingLogin = await request(app).post('/api/auth/login').send({ email: registration.email, password });
    expect(pendingLogin.status).toBe(403);
    const stillUnclaimed = await prisma.player.findUniqueOrThrow({ where: { id: player.id } });
    expect(stillUnclaimed.userId).toBeNull();
  });
  it('creates a trial from a partial roster and preserves imported stored handicaps', async () => {
    const admin = request.agent(app);
    expect((await admin.post('/api/auth/login').send({ email: 'admin@test.com', password: 'integration-test-password' })).status).toBe(200);
    const payload = {
      name: 'Onboarding Partial Roster', description: '', type: 'season', format: 'individual', holeFormat: '18',
      startDate: '2026-01-01T00:00:00.000Z', endDate: '2027-01-01T00:00:00.000Z', numPlayers: 1,
      contactFirstName: 'Test', contactLastName: 'Admin', contactEmail: 'admin@test.com', contactPhone: '',
      startTrial: true, billingDraftKey: 'onboarding-partial-roster', teams: [],
      players: [{ id: 1, firstName: 'Imported', lastName: 'Golfer', gender: 'female', handicap: -1.4, type: 'player', email: '' }],
    };
    const invalid = await admin.post('/api/leagues').send({ ...payload, players: [{ ...payload.players[0], handicap: 55 }] });
    expect(invalid.status).toBe(400);
    const created = await admin.post('/api/leagues').send(payload);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const player = await prisma.player.findFirstOrThrow({ where: { leagueId: created.body.id } });
    expect(player.handicap).toBe(-1.4);
    expect(player.startingHandicap).toBe(-1.4);
    const entitlement = await prisma.league_season_entitlement.findFirstOrThrow({ where: { league: { id: created.body.id } } });
    expect(entitlement?.status).toBe('trialing');
  });

  it('resends valid invitations without invalidating links and replaces expired invitations', async () => {
    const admin = request.agent(app);
    expect((await admin.post('/api/auth/login').send({ email: 'admin@test.com', password: 'integration-test-password' })).status).toBe(200);
    const league = await prisma.league.findFirstOrThrow({ where: { name: 'Seeded Thursday Night League' } });
    const player = await prisma.player.create({ data: { firstName: 'Resend', lastName: 'Golfer', email: 'onboarding-resend@test.com', handicap: 12, startingHandicap: 12, seasonPoints: 0, type: 'substitute', leagueId: league.id } });
    const endpoint = `/api/leagues/${league.id}/invitations`;
    const initial = await admin.post(endpoint).send({ playerIds: [player.id] });
    expect(initial.status).toBe(201);
    const original = initial.body.invitations[0];
    const concurrent = await Promise.all([admin.post(endpoint).send({ playerIds: [player.id], resend: true }), admin.post(endpoint).send({ playerIds: [player.id], resend: true })]);
    expect(concurrent.map(response => response.status)).toEqual([201, 201]);
    const resend = concurrent[0];
    expect(resend.status).toBe(201);
    expect(resend.body.invitations[0].token).toBe(original.token);
    expect(await prisma.league_invitation.count({ where: { playerId: player.id, status: 'pending' } })).toBe(1);
    await prisma.league_invitation.update({ where: { id: original.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    const renewed = await admin.post(endpoint).send({ playerIds: [player.id], resend: true });
    expect(renewed.status).toBe(201);
    expect(renewed.body.invitations[0].token).not.toBe(original.token);
    expect((await prisma.league_invitation.findUniqueOrThrow({ where: { id: original.id } })).status).toBe('expired');
    expect((await request(app).get(`/api/invitations/${original.token}`)).status).toBe(404);
    expect((await request(app).get(`/api/invitations/${renewed.body.invitations[0].token}`)).status).toBe(200);
    const member = request.agent(app);
    expect((await member.post('/api/auth/login').send({ email: 'user@test.com', password: 'integration-test-password' })).status).toBe(200);
    expect((await member.post(endpoint).send({ playerIds: [player.id], resend: true })).status).toBe(403);
  });

});
