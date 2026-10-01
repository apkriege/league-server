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
});
