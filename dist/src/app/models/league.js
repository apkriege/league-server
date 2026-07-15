"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../../prisma");
class LeagueService {
    static query() {
        return prisma_1.prisma.league;
    }
    static async findAll() {
        return await prisma_1.prisma.league.findMany({ where: { deletedAt: null } });
    }
    static async findById(id) {
        return await prisma_1.prisma.league.findFirst({ where: { id, deletedAt: null } });
    }
    static async create(league) {
        return await prisma_1.prisma.league.create({ data: league });
    }
    static async update(id, league) {
        const existingLeague = await this.findById(id);
        if (!existingLeague) {
            throw new Error('League not found');
        }
        return await prisma_1.prisma.league.update({ where: { id }, data: league });
    }
    static async delete(id) {
        const existingLeague = await this.findById(id);
        if (!existingLeague) {
            throw new Error('League not found');
        }
        await prisma_1.prisma.league.update({ where: { id }, data: { deletedAt: new Date() } });
    }
    static async createPlayers(leagueId, players) {
        const leaguePlayers = players.map((player) => ({
            playerId: `player-${leagueId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            firstName: player.first,
            lastName: player.last,
            email: player.email,
            phone: player.phone || null,
            handicap: player.handicap || 0,
            startingHandicap: player.handicap || 0,
            seasonPoints: 0,
            leagueId,
        }));
        return await prisma_1.prisma.player.createMany({ data: leaguePlayers });
    }
    static async createTeams(leagueId, players, teams) {
        // First, create players for this league
        const createdPlayers = await this.createPlayers(leagueId, players);
        // Fetch all players for this league
        const leaguePlayers = await prisma_1.prisma.player.findMany({ where: { leagueId } });
        // Create all teams without players first
        const leagueTeams = teams.map((team) => ({
            teamId: `team-${leagueId}-${team.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
            name: team.name,
            seasonPoints: 0,
            leagueId,
        }));
        const createdTeams = await prisma_1.prisma.team.createMany({
            data: leagueTeams,
        });
        // Fetch all created teams with their IDs
        const allTeams = await prisma_1.prisma.team.findMany({
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
                            await prisma_1.prisma.player.update({
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
    static async createEvents(leagueId, events) { }
}
exports.default = LeagueService;
