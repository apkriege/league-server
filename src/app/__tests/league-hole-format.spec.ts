import { describe, expect, it } from 'vitest';
import {
  getHandicapHoleBasis,
  normalizeLeagueHoleFormat,
  validateEventHolesForLeague,
} from '../utils/league-hole-format';

describe('league hole format', () => {
  it('uses a 9-hole handicap only for 9-hole leagues', () => {
    expect(getHandicapHoleBasis('9')).toBe(9);
    expect(getHandicapHoleBasis('18')).toBe(18);
    expect(getHandicapHoleBasis('mixed')).toBe(18);
  });

  it('restricts fixed-format leagues while allowing either mixed event length', () => {
    expect(validateEventHolesForLeague('9', 9)).toBe(9);
    expect(validateEventHolesForLeague('18', 18)).toBe(18);
    expect(validateEventHolesForLeague('mixed', 9)).toBe(9);
    expect(validateEventHolesForLeague('mixed', 18)).toBe(18);
    expect(() => validateEventHolesForLeague('9', 18)).toThrow('9-hole league');
  });

  it('rejects unsupported league values', () => {
    expect(() => normalizeLeagueHoleFormat('27')).toThrow('must be 9, 18, or mixed');
  });
});
