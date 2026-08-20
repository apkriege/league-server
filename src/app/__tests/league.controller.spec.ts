import { describe, expect, it } from 'vitest';
import LeagueController from '../controllers/league';

const validLeaguePayload = {
  name: 'Thursday League',
  description: 'Weekly league',
  type: 'season',
  format: 'individual',
  numPlayers: 8,
  contactFirstName: 'Adam',
  contactLastName: 'Admin',
  contactEmail: 'ADMIN@test.com',
  contactPhone: '555-0100',
  startDate: '2026-05-01',
  endDate: '2026-09-01',
};

describe('league payload normalization', () => {
  it('does not persist legacy public/private access values', () => {
    const normalized = LeagueController.normalizeLeaguePayload({
      ...validLeaguePayload,
      access: 'private',
    });

    expect(normalized).not.toHaveProperty('access');
    expect(normalized.contactEmail).toBe('admin@test.com');
    expect(normalized.holeFormat).toBe('18');
  });

  it('accepts a mixed league hole format', () => {
    const normalized = LeagueController.normalizeLeaguePayload({
      ...validLeaguePayload,
      holeFormat: 'mixed',
    });

    expect(normalized.holeFormat).toBe('mixed');
  });
});
