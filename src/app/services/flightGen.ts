import { prisma } from '../../prisma';
import dayjs from 'dayjs';

export const extractTeamId = (value: any): number | null => {
  if (Number.isFinite(Number(value))) {
    return Number(value);
  }

  if (value && typeof value === 'object') {
    const raw = value.id ?? value.teamId ?? value.team?.id ?? value.team?.teamId;
    if (Number.isFinite(Number(raw))) {
      return Number(raw);
    }
  }

  return null;
};

export class FlightGen {
  constructor(
    private league: any,
    private event: any,
    private eventId: number,
    private prismaClient: any = prisma,
  ) {
    this.league = league;
    this.event = event;
    this.eventId = eventId;
  }

  saveFlights() {
    if (this.event.format === 'individual' && this.event.scoringFormat === 'stroke') {
      return this.individualStroke();
    } else if (this.event.format === 'individual' && this.event.scoringFormat === 'match') {
      return this.individualMatch();
    } else if (this.event.format === 'team' && this.event.scoringFormat === 'stroke') {
      return this.teamStroke();
    } else if (this.event.format === 'team' && this.event.scoringFormat === 'match') {
      return this.teamMatch();
    } else {
      throw new Error('Unsupported league or event type for flight generation');
    }
  }

  // individual stroke play
  // [1, 2, 3, 4], [5, 6, 7, 8]
  async individualStroke() {
    const players = this.league.players;

    for (const i in this.event.flights) {
      const f = this.event.flights[i];
      const playerIds = f.map((p: any) => Number(p));

      const startTime = dayjs(this.event.startTime, 'H:mm')
        .add(Number(i) * Number(this.event.interval), 'minute')
        .format('H:mm');

      await this.prismaClient.flight.create({
        data: {
          eventId: this.eventId,
          startTime: startTime,
          players: {
            create: playerIds.map((playerId: number) => ({
              playerId,
            })),
          },
        },
      });
    }

    // implement flight generation logic for individual stroke play
  }

  // individual match play,
  // [[1, 2], [3, 4]], [[5, 6], [7, 8]], [[9, 10], [11, 12]]
  async individualMatch() {
    for (const i in this.event.flights) {
      const f = this.event.flights[i];
      const matchups = Array.isArray(f?.[0]) ? f : [f];
      const playerIds = matchups
        .flatMap((pair: any) => {
          if (!Array.isArray(pair) || pair.length < 2) return [];
          return [Number(pair[0]), Number(pair[1])];
        })
        .filter((id: number) => Number.isFinite(id));

      if (playerIds.length < 2) {
        throw new Error(`Invalid individual match flight at index ${i}.`);
      }

      const startTime = dayjs(this.event.startTime, 'H:mm')
        .add(Number(i) * Number(this.event.interval), 'minute')
        .format('H:mm');

      await this.prismaClient.flight.create({
        data: {
          eventId: this.eventId,
          startTime: startTime,
          players: {
            create: playerIds.map((playerId: number) => ({ playerId })),
          },
        },
      });
    }
  }

  // team stroke play (best-ball scoring at score-entry stage)
  // [1, 2], [3, 4]
  async teamStroke() {
    const teams = this.league.teams;

    for (const i in this.event.flights) {
      const f = this.event.flights[i];
      const t1Id = extractTeamId(f[0]);
      const t2Id = extractTeamId(f[1]);

      if (t1Id === null || t2Id === null) {
        throw new Error(`Invalid team matchup at flight index ${i}.`);
      }

      const team1 = teams.find((t: any) => Number(t.id) === t1Id);
      const team2 = teams.find((t: any) => Number(t.id) === t2Id);

      if (!team1 || !team2) {
        throw new Error(`Unable to resolve team IDs for flight index ${i}.`);
      }

      const team1Id = Number(team1.id);
      const team2Id = Number(team2.id);
      const team1PlayerIds = team1.players.map((p: any) => Number(p.id));
      const team2PlayerIds = team2.players.map((p: any) => Number(p.id));

      const startTime = dayjs(this.event.startTime, 'H:mm')
        .add(Number(i) * Number(this.event.interval), 'minute')
        .format('H:mm');

      await this.prismaClient.flight.create({
        data: {
          eventId: this.eventId,
          startTime: startTime,
          teams: {
            create: [
              {
                teamId: team1Id,
              },
              {
                teamId: team2Id,
              },
            ],
          },
          players: {
            create: [
              ...team1PlayerIds.map((playerId: number) => ({
                teamId: team1Id,
                playerId,
              })),
              ...team2PlayerIds.map((playerId: number) => ({
                teamId: team2Id,
                playerId,
              })),
            ],
          },
        },
      });
    }
  }

  // team match play
  // [1, 2],
  // [3, 4],
  // [5, 6],
  async teamMatch() {
    const teams = this.league.teams;

    for (const i in this.event.flights) {
      const f = this.event.flights[i];
      const t1Id = extractTeamId(f[0]);
      const t2Id = extractTeamId(f[1]);

      if (t1Id === null || t2Id === null) {
        throw new Error(`Invalid team matchup at flight index ${i}.`);
      }

      const team1 = teams.find((t: any) => Number(t.id) === t1Id);
      const team2 = teams.find((t: any) => Number(t.id) === t2Id);

      if (!team1 || !team2) {
        throw new Error(`Unable to resolve team IDs for flight index ${i}.`);
      }

      const team1Id = Number(team1.id);
      const team2Id = Number(team2.id);

      // for match play only take 2 players from each team, for stroke play take all players on the team
      const team1PlayerIds = team1.players.map((p: any) => p.id).slice(0, 2);
      const team2PlayerIds = team2.players.map((p: any) => p.id).slice(0, 2);

      const startTime = dayjs(this.event.startTime, 'H:mm')
        .add(Number(i) * Number(this.event.interval), 'minute')
        .format('H:mm');

      await this.prismaClient.flight.create({
        data: {
          eventId: this.eventId,
          startTime: startTime,
          teams: {
            create: [
              {
                teamId: team1Id,
              },
              {
                teamId: team2Id,
              },
            ],
          },
          players: {
            create: [
              ...team1PlayerIds.map((playerId: number) => ({
                teamId: team1Id,
                playerId,
              })),
              ...team2PlayerIds.map((playerId: number) => ({
                teamId: team2Id,
                playerId,
              })),
            ],
          },
        },
      });
    }
  }

  async teamWizard() {
    const teams = this.league.teams;

    for (const i in this.event.flights) {
      const f = this.event.flights[i];
      const t1Id = extractTeamId(f[0]);
      const t2Id = extractTeamId(f[1]);

      if (t1Id === null || t2Id === null) {
        throw new Error(`Invalid team matchup at flight index ${i}.`);
      }

      const team1 = teams.find((t: any) => Number(t.id) === t1Id);
      const team2 = teams.find((t: any) => Number(t.id) === t2Id);

      if (!team1 || !team2) {
        throw new Error(`Unable to resolve team IDs for flight index ${i}.`);
      }

      const team1Id = Number(team1.id);
      const team2Id = Number(team2.id);

      const team1PlayerIds = team1.players.map((p: any) => p.id).slice(0, 2);
      const team2PlayerIds = team2.players.map((p: any) => p.id).slice(0, 2);

      const startTime = dayjs(this.event.startTime, 'H:mm')
        .add(Number(i) * Number(this.event.interval), 'minute')
        .format('H:mm');

      await this.prismaClient.flight.create({
        data: {
          eventId: this.eventId,
          startTime: startTime,
          teams: {
            create: [
              {
                teamId: team1Id,
              },
              {
                teamId: team2Id,
              },
            ],
          },
          players: {
            create: [
              ...team1PlayerIds.map((playerId: number) => ({
                teamId: team1Id,
                playerId,
              })),
              ...team2PlayerIds.map((playerId: number) => ({
                teamId: team2Id,
                playerId,
              })),
            ],
          },
        },
      });
    }
  }
}
