import { prisma } from '../../prisma';

export default class LeagueService {
  static query(): any {
    return prisma.league;
  }

  static async findAll() {
    return await prisma.league.findMany();
  }

  static async findById(id: number) {
    return await prisma.league.findUnique({ where: { id } });
  }

  static async create(league: any) {
    return await prisma.league.create({ data: league });
  }

  static async update(id: number, league: any) {
    const existingLeague = await this.findById(id);

    if (!existingLeague) {
      throw new Error('League not found');
    }

    return await prisma.league.update({ where: { id }, data: league });
  }

  static async delete(id: number) {
    const existingLeague = await this.findById(id);

    if (!existingLeague) {
      throw new Error('League not found');
    }

    await prisma.league.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  static async createPlayers(leagueId: number, players: any[]) {
    const leaguePlayers = players.map((player) => ({
      playerId: `player-${leagueId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      firstName: player.first,
      lastName: player.last,
      email: player.email,
      phone: player.phone || null,
      handicap: player.handicap || 0,
      seasonPoints: 0,
      leagueId,
    }));

    return await prisma.player.createMany({ data: leaguePlayers });
  }

  static async createTeams(leagueId: number, players: any[], teams: any[]) {
    // First, create players for this league
    const createdPlayers = await this.createPlayers(leagueId, players);

    // Fetch all players for this league
    const leaguePlayers = await prisma.player.findMany({ where: { leagueId } });

    // Create all teams without players first
    const leagueTeams = teams.map((team) => ({
      teamId: `team-${leagueId}-${team.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
      name: team.name,
      seasonPoints: 0,
      leagueId,
    }));

    const createdTeams = await prisma.team.createMany({
      data: leagueTeams,
    });

    // Fetch all created teams with their IDs
    const allTeams = await prisma.team.findMany({
      where: { leagueId },
    });

    // Add players to teams based on the original team configuration
    for (let i = 0; i < teams.length; i++) {
      const team = teams[i];
      const createdTeam = allTeams[i];

      // Update each player in this team
      if (team.players && team.players.length > 0) {
        for (const playerIndex of team.players) {
          // Assuming playerIndex refers to the index in the players array
          const playerData = players[playerIndex];
          if (playerData) {
            // Find the created player by email
            const player = leaguePlayers.find((p) => p.email === playerData.email);
            if (player) {
              await prisma.player.update({
                where: { id: player.id },
                data: { teamId: createdTeam.id },
              });
            }
          }
        }
      }
    }

    return createdTeams;
  }

  static async createEvents(leagueId: number, events: any[]) {}
}
