import { describe, expect, it } from 'vitest';
import { extractTeamId } from '../services/flightGen';

describe('extractTeamId', () => {
  it('uses the team ID instead of the flight-team relation ID', () => {
    expect(extractTeamId({ id: 900, teamId: 42 })).toBe(42);
    expect(extractTeamId({ id: 901, team: { id: 43 } })).toBe(43);
  });

  it('accepts plain team IDs and rejects empty values', () => {
    expect(extractTeamId(42)).toBe(42);
    expect(extractTeamId({ id: 42 })).toBe(42);
    expect(extractTeamId(null)).toBeNull();
    expect(extractTeamId('')).toBeNull();
  });
});
