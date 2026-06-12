"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventMetrics = void 0;
const prisma_1 = require("../../prisma");
class EventMetrics {
    eventId;
    constructor(eventId) {
        this.eventId = eventId;
    }
    async processEvent() {
        const scores = await this.scores();
        const leaderboards = await this.createLeaderboards();
        const skins = await this.createSkins();
        const scoreDistribution = await this.scoreDistribution();
        return {
            scores,
            leaderboards,
            skins,
            scoreDistribution,
        };
    }
    async scoreDistribution() {
        const event = await prisma_1.prisma.event.findUnique({
            where: { id: this.eventId },
            select: { leagueId: true },
        });
        if (!event)
            throw new Error('Event not found');
        const [eventAgg, seasonAgg, eventIds] = await Promise.all([
            prisma_1.prisma.round.aggregate({
                where: { eventId: this.eventId },
                _sum: {
                    eagles: true,
                    birdies: true,
                    pars: true,
                    bogeys: true,
                    doubleBogeys: true,
                    tripleBogeys: true,
                },
            }),
            prisma_1.prisma.round.aggregate({
                where: { event: { leagueId: event.leagueId } },
                _sum: {
                    eagles: true,
                    birdies: true,
                    pars: true,
                    bogeys: true,
                    doubleBogeys: true,
                    tripleBogeys: true,
                },
            }),
            prisma_1.prisma.round.groupBy({
                by: ['eventId'],
                where: { event: { leagueId: event.leagueId } },
            }),
        ]);
        const numEvents = eventIds.length || 1;
        const round1 = (n, divisor = 1) => Math.round(((n ?? 0) / divisor) * 10) / 10;
        return {
            thisEvent: {
                eagles: eventAgg._sum.eagles ?? 0,
                birdies: eventAgg._sum.birdies ?? 0,
                pars: eventAgg._sum.pars ?? 0,
                bogeys: eventAgg._sum.bogeys ?? 0,
                doubleBogeys: eventAgg._sum.doubleBogeys ?? 0,
                tripleBogeys: eventAgg._sum.tripleBogeys ?? 0,
            },
            seasonAvg: {
                eagles: round1(seasonAgg._sum.eagles, numEvents),
                birdies: round1(seasonAgg._sum.birdies, numEvents),
                pars: round1(seasonAgg._sum.pars, numEvents),
                bogeys: round1(seasonAgg._sum.bogeys, numEvents),
                doubleBogeys: round1(seasonAgg._sum.doubleBogeys, numEvents),
                tripleBogeys: round1(seasonAgg._sum.tripleBogeys, numEvents),
            },
        };
    }
    async scores() {
        const rounds = await prisma_1.prisma.round.findMany({
            where: { eventId: this.eventId },
            include: { player: true, scores: true },
        });
        return rounds.map((round) => ({
            playerId: round.playerId,
            player: {
                firstName: round.player.firstName,
                lastName: round.player.lastName,
            },
            preHandicap: round.preHandicap,
            postHandicap: round.postHandicap,
            gross: round.gross,
            net: round.net,
            pointsEarned: round.pointsEarned,
            matchPoints: round.matchPoints,
            scores: round.scores.map((score) => ({
                hole: score.hole,
                gross: score.gross,
                net: score.net,
                par: score.par,
            })),
        }));
    }
    // create leaderboards
    async createLeaderboards() {
        const rounds = await prisma_1.prisma.round.findMany({
            where: { eventId: this.eventId },
            include: { player: true },
        });
        return {
            playerPoints: await this.playerPoints(rounds),
            playerLowGross: await this.playerLowGross(rounds),
            playerLowNet: await this.playerLowNet(rounds),
        };
    }
    // event points leaderboard
    async playerPoints(rounds) {
        const x = [
            ...rounds.map((r) => ({
                playerId: r.playerId,
                name: `${r.player.firstName} ${r.player.lastName}`,
                handicap: r.player.handicap,
                value: r.pointsEarned + r.matchPoints,
            })),
        ];
        return x.sort((a, b) => b.value - a.value);
    }
    // low net score
    async playerLowNet(rounds) {
        const x = [
            ...rounds.map((r) => ({
                playerId: r.playerId,
                name: `${r.player.firstName} ${r.player.lastName}`,
                handicap: r.player.handicap,
                value: r.net,
            })),
        ];
        return x.sort((a, b) => a.value - b.value);
    }
    // low gross score
    async playerLowGross(rounds) {
        const x = [
            ...rounds.map((r) => ({
                playerId: r.playerId,
                name: `${r.player.firstName} ${r.player.lastName}`,
                handicap: r.player.handicap,
                value: r.gross,
            })),
        ];
        return x.sort((a, b) => a.value - b.value);
    }
    // create skins leaderboard
    async createSkins() {
        const rounds = await prisma_1.prisma.round.findMany({
            where: { eventId: this.eventId },
            include: { player: true, scores: true },
        });
        return {
            playerSkins: await this.playerSkins(rounds),
            playerNetSkins: await this.playerNetSkins(rounds),
        };
    }
    scoreLabel(gross, par) {
        const diff = gross - par;
        if (diff <= -2)
            return 'Eagle';
        if (diff === -1)
            return 'Birdie';
        if (diff === 0)
            return 'Par';
        if (diff === 1)
            return 'Bogey';
        if (diff === 2)
            return 'Double Bogey';
        return `+${diff}`;
    }
    async playerSkins(rounds) {
        const holeScores = {};
        for (const round of rounds) {
            for (const score of round.scores) {
                const { hole, gross } = score;
                if (!holeScores[hole])
                    holeScores[hole] = [];
                holeScores[hole].push({
                    playerId: round.playerId,
                    name: `${round.player.firstName} ${round.player.lastName}`,
                    gross: Number(gross),
                    par: Number(score.par),
                });
            }
        }
        const skins = [];
        for (const hole in holeScores) {
            const entries = holeScores[hole] ?? [];
            if (entries.length === 0)
                continue;
            const lowestGross = Math.min(...entries.map((entry) => entry.gross));
            const winners = entries.filter((entry) => entry.gross === lowestGross);
            if (winners.length !== 1)
                continue;
            const skinWinner = winners[0];
            skins.push({
                playerId: skinWinner.playerId,
                name: skinWinner.name,
                hole: String(hole),
                gross: skinWinner.gross,
                scoreLabel: this.scoreLabel(skinWinner.gross, skinWinner.par),
            });
        }
        return skins.sort((a, b) => Number(a.hole) - Number(b.hole));
    }
    async playerNetSkins(round) {
        const holeNetScores = {};
        for (const r of round) {
            for (const score of r.scores) {
                const { hole, net } = score;
                if (!holeNetScores[hole])
                    holeNetScores[hole] = [];
                holeNetScores[hole].push({
                    playerId: r.playerId,
                    name: `${r.player.firstName} ${r.player.lastName}`,
                    net: Number(net),
                    par: Number(score.par),
                });
            }
        }
        const skins = [];
        for (const hole in holeNetScores) {
            const entries = holeNetScores[hole] ?? [];
            if (entries.length === 0)
                continue;
            const lowestNet = Math.min(...entries.map((entry) => entry.net));
            const winners = entries.filter((entry) => entry.net === lowestNet);
            if (winners.length !== 1)
                continue;
            const skinWinner = winners[0];
            skins.push({
                playerId: skinWinner.playerId,
                name: skinWinner.name,
                hole: String(hole),
                net: skinWinner.net,
                scoreLabel: this.scoreLabel(skinWinner.net, skinWinner.par),
            });
        }
        const sortedNetSkins = skins.sort((a, b) => Number(a.hole) - Number(b.hole));
        return sortedNetSkins;
    }
}
exports.EventMetrics = EventMetrics;
