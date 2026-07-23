import { describe, expect, it, vi } from 'vitest';
import {
  normalizeEventFlightTeamIds,
  resolveEventFlightTeams,
} from '../services/eventTeamResolution';

describe('resolveEventFlightTeams', () => {
  it('converts flight-team relation IDs back to team IDs before a reorder is saved', () => {
    expect(
      normalizeEventFlightTeamIds(
        [
          [502, 503],
          [500, 501],
        ],
        [
          { id: 500, teamId: 11 },
          { id: 501, teamId: 12 },
          { id: 502, teamId: 13 },
          { id: 503, teamId: 14 },
        ],
      ),
    ).toEqual([
      [13, 14],
      [11, 12],
    ]);
  });

  it('leaves actual team IDs unchanged when IDs overlap relation IDs', () => {
    expect(
      normalizeEventFlightTeamIds([[11, 12]], [
        { id: 11, teamId: 91 },
        { id: 12, teamId: 92 },
        { id: 20, teamId: 11 },
        { id: 21, teamId: 12 },
      ]),
    ).toEqual([[11, 12]]);
  });

  it('maps temporary edit-form IDs to existing teams by roster', () => {
    expect(
      normalizeEventFlightTeamIds(
        [
          [9003, 9004],
          [9001, 9002],
        ],
        [
          { id: 500, teamId: 11, team: { id: 11, name: 'A', players: [{ id: 1 }, { id: 2 }] } },
          { id: 501, teamId: 12, team: { id: 12, name: 'B', players: [{ id: 3 }, { id: 4 }] } },
          { id: 502, teamId: 13, team: { id: 13, name: 'C', players: [{ id: 5 }, { id: 6 }] } },
          { id: 503, teamId: 14, team: { id: 14, name: 'D', players: [{ id: 7 }, { id: 8 }] } },
        ],
        [
          { id: 9001, name: 'A', players: [1, 2] },
          { id: 9002, name: 'B', players: [3, 4] },
          { id: 9003, name: 'C', players: [5, 6] },
          { id: 9004, name: 'D', players: [7, 8] },
        ],
      ),
    ).toEqual([
      [13, 14],
      [11, 12],
    ]);
  });

  it('loads reordered flight teams belonging directly to the event', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: 14, players: [{ id: 104 }] },
      { id: 11, players: [{ id: 101 }] },
      { id: 13, players: [{ id: 103 }] },
      { id: 12, players: [{ id: 102 }] },
    ]);

    const teams = await resolveEventFlightTeams(
      { team: { findMany } },
      7,
      42,
      [
        [13, 14],
        [11, 12],
      ],
    );

    expect(teams.map((team: any) => team.id)).toEqual([14, 11, 13, 12]);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        id: { in: [13, 14, 11, 12] },
        deletedAt: null,
        OR: [{ leagueId: 7 }, { eventId: 42 }],
      },
      include: {
        players: {
          where: { deletedAt: null },
          select: { id: true },
        },
      },
    });
  });

  it('accepts relational team entries and de-duplicates their IDs', async () => {
    const findMany = vi.fn().mockResolvedValue([]);

    await resolveEventFlightTeams(
      { team: { findMany } },
      7,
      42,
      [
        [{ teamId: 11 }, { team: { id: 12 } }],
        [12, { id: 13 }],
      ],
    );

    expect(findMany.mock.calls[0][0].where.id.in).toEqual([11, 12, 13]);
  });
});
