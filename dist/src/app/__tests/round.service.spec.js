"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const mockPrisma = {
    event: {
        findFirst: vitest_1.vi.fn(),
    },
    round: {
        findUnique: vitest_1.vi.fn(),
        update: vitest_1.vi.fn(),
        create: vitest_1.vi.fn(),
    },
    score: {
        deleteMany: vitest_1.vi.fn(),
        createMany: vitest_1.vi.fn(),
    },
    player: {
        update: vitest_1.vi.fn(),
        findUnique: vitest_1.vi.fn(),
    },
};
vitest_1.vi.mock('@prisma/client', () => {
    function PrismaClient() {
        return mockPrisma;
    }
    return {
        PrismaClient,
    };
});
const buildTeeHoles = () => Array.from({ length: 9 }, (_, idx) => ({
    num: idx + 1,
    hcp: idx + 1,
    par: 4,
}));
const buildEvent = (playerHandicap) => ({
    id: 99,
    courseId: 1,
    teeId: 1,
    holes: 9,
    startSide: 'front',
    date: new Date('2026-04-16T00:00:00.000Z'),
    scoringFormat: 'match',
    tee: {
        slopeFrontMen: 120,
        slopeBackMen: 120,
        slopeMen: 120,
        ratingFrontMen: 36,
        ratingBackMen: 36,
        ratingMen: 72,
        holes: buildTeeHoles(),
    },
    flights: [
        {
            players: [
                {
                    player: {
                        id: 1,
                        firstName: 'Test',
                        lastName: 'Player',
                        handicap: playerHandicap,
                    },
                },
            ],
            teams: [],
        },
    ],
});
(0, vitest_1.describe)('Round service handicap behavior', async () => {
    const { Round } = await Promise.resolve().then(() => __importStar(require('../services/round')));
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        mockPrisma.event.findFirst.mockResolvedValue(buildEvent(10));
        mockPrisma.player.findUnique.mockResolvedValue({
            id: 1,
            handicap: 10,
            rounds: [],
        });
        mockPrisma.player.update.mockResolvedValue({});
        mockPrisma.score.deleteMany.mockResolvedValue({ count: 2 });
        mockPrisma.score.createMany.mockResolvedValue({ count: 2 });
        mockPrisma.round.create.mockResolvedValue({ id: 11 });
        mockPrisma.round.update.mockResolvedValue({ id: 10 });
    });
    (0, vitest_1.it)('uses existing round preHandicap when editing rounds', async () => {
        mockPrisma.round.findUnique.mockResolvedValue({
            id: 10,
            opponentId: 2,
            preHandicap: 0,
            pointsEarned: 6,
            matchPoints: 2,
            scores: [
                { hole: 1, gross: 5 },
                { hole: 2, gross: 5 },
            ],
        });
        const rounds = new Round(99, [
            {
                flightId: 1,
                playerId: 1,
                scores: { 1: 4, 2: 5 },
            },
        ]);
        await rounds.editRounds();
        (0, vitest_1.expect)(mockPrisma.round.update).toHaveBeenCalledTimes(1);
        const updateArg = mockPrisma.round.update.mock.calls[0][0];
        (0, vitest_1.expect)(updateArg.data.preHandicap).toBe(0);
        (0, vitest_1.expect)(updateArg.data.opponentId).toBe(2);
        (0, vitest_1.expect)(updateArg.data.pointsEarned).toBe(6);
        (0, vitest_1.expect)(updateArg.data.matchPoints).toBe(2);
        (0, vitest_1.expect)(mockPrisma.score.createMany).toHaveBeenCalledTimes(1);
        const createdScores = mockPrisma.score.createMany.mock.calls[0][0].data;
        const hole1 = createdScores.find((s) => s.hole === 1);
        // With preHandicap 0, no pops should be applied.
        (0, vitest_1.expect)(hole1.net).toBe(4);
    });
    (0, vitest_1.it)('uses current player handicap when creating rounds', async () => {
        mockPrisma.round.findUnique.mockResolvedValue(null);
        const rounds = new Round(99, [
            {
                flightId: 1,
                playerId: 1,
                scores: { 1: 4, 2: 5 },
            },
        ]);
        await rounds.process();
        (0, vitest_1.expect)(mockPrisma.round.create).toHaveBeenCalledTimes(1);
        const createArg = mockPrisma.round.create.mock.calls[0][0];
        (0, vitest_1.expect)(createArg.data.preHandicap).toBe(10);
        (0, vitest_1.expect)(mockPrisma.score.createMany).toHaveBeenCalledTimes(1);
        const createdScores = mockPrisma.score.createMany.mock.calls[0][0].data;
        const hole1 = createdScores.find((s) => s.hole === 1);
        // With handicap 10 over 9 holes, hole 1 gets 2 pops.
        (0, vitest_1.expect)(hole1.net).toBe(2);
    });
    (0, vitest_1.it)('skips edit updates when submitted scores are unchanged', async () => {
        mockPrisma.round.findUnique.mockResolvedValue({
            id: 10,
            opponentId: 2,
            preHandicap: 7,
            pointsEarned: 4,
            matchPoints: 1,
            scores: [
                { hole: 1, gross: 4 },
                { hole: 2, gross: 5 },
            ],
        });
        const rounds = new Round(99, [
            {
                flightId: 1,
                playerId: 1,
                scores: { 1: 4, 2: 5 },
            },
        ]);
        await rounds.editRounds();
        (0, vitest_1.expect)(mockPrisma.round.update).not.toHaveBeenCalled();
        (0, vitest_1.expect)(mockPrisma.score.deleteMany).not.toHaveBeenCalled();
        (0, vitest_1.expect)(mockPrisma.score.createMany).not.toHaveBeenCalled();
        (0, vitest_1.expect)(mockPrisma.player.update).not.toHaveBeenCalled();
    });
});
