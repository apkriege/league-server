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
        update: vitest_1.vi.fn(),
    },
    round: {
        count: vitest_1.vi.fn(),
        findMany: vitest_1.vi.fn(),
        deleteMany: vitest_1.vi.fn(),
    },
    score: {
        deleteMany: vitest_1.vi.fn(),
    },
    flight: {
        update: vitest_1.vi.fn(),
        updateMany: vitest_1.vi.fn(),
    },
    team_event_points: {
        findMany: vitest_1.vi.fn(),
        deleteMany: vitest_1.vi.fn(),
    },
    team: {
        update: vitest_1.vi.fn(),
    },
    player: {
        update: vitest_1.vi.fn(),
    },
    $transaction: vitest_1.vi.fn(async (arg) => {
        if (typeof arg === 'function')
            return arg(mockPrisma);
        return [];
    }),
};
const processMock = vitest_1.vi.fn();
const editRoundsMock = vitest_1.vi.fn();
const scoringRunMock = vitest_1.vi.fn();
vitest_1.vi.mock('../../prisma', () => ({
    prisma: mockPrisma,
}));
vitest_1.vi.mock('../services/round', () => {
    function Round() {
        this.process = processMock;
        this.editRounds = editRoundsMock;
    }
    return { Round };
});
vitest_1.vi.mock('../services/scoring', () => {
    function Scoring() {
        this.run = scoringRunMock;
    }
    return { Scoring };
});
const buildReq = (method, existingBody) => ({
    method,
    params: { leagueId: '10', eventId: '99' },
    query: {},
    body: existingBody || [
        {
            flightId: 1,
            playerId: 101,
            scores: { 1: 4, 2: 5, 3: 3 },
        },
    ],
});
const buildRes = () => {
    const res = {};
    res.status = vitest_1.vi.fn().mockReturnValue(res);
    res.json = vitest_1.vi.fn().mockReturnValue(res);
    return res;
};
const eventFixture = {
    id: 99,
    leagueId: 10,
    holes: 9,
    flights: [
        {
            id: 1,
            players: [{ playerId: 101, player: { id: 101 } }],
            teams: [],
        },
    ],
};
(0, vitest_1.describe)('ScoreController create/update score endpoints', async () => {
    const ScoreController = (await Promise.resolve().then(() => __importStar(require('../controllers/round')))).default;
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        mockPrisma.event.findFirst.mockResolvedValue(eventFixture);
        mockPrisma.event.update.mockResolvedValue({});
        mockPrisma.round.findMany.mockResolvedValue([]);
        mockPrisma.flight.update.mockResolvedValue({});
        mockPrisma.flight.updateMany.mockResolvedValue({ count: 0 });
        processMock.mockResolvedValue(undefined);
        editRoundsMock.mockResolvedValue(undefined);
        scoringRunMock.mockResolvedValue(undefined);
    });
    (0, vitest_1.it)('POST rejects with 409 when submitted player rounds already exist', async () => {
        mockPrisma.round.count.mockResolvedValueOnce(1);
        const req = buildReq('post');
        const res = buildRes();
        await ScoreController.createLeagueEventScores(req, res);
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(409);
        (0, vitest_1.expect)(res.json).toHaveBeenCalledWith({
            message: 'Rounds already exist for submitted players. Use update endpoint to edit scores.',
        });
        (0, vitest_1.expect)(processMock).not.toHaveBeenCalled();
        (0, vitest_1.expect)(editRoundsMock).not.toHaveBeenCalled();
        (0, vitest_1.expect)(scoringRunMock).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('PUT rejects with 400 when submitted player rounds do not exist', async () => {
        mockPrisma.round.count.mockResolvedValueOnce(0);
        const req = buildReq('put');
        const res = buildRes();
        await ScoreController.updateLeagueEventScores(req, res);
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(400);
        (0, vitest_1.expect)(res.json).toHaveBeenCalledWith({
            message: 'No existing rounds found for submitted players. Use create endpoint first.',
        });
        (0, vitest_1.expect)(processMock).not.toHaveBeenCalled();
        (0, vitest_1.expect)(editRoundsMock).not.toHaveBeenCalled();
        (0, vitest_1.expect)(scoringRunMock).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('POST creates new rounds and scores event when no existing submitted rounds', async () => {
        mockPrisma.round.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
        const req = buildReq('post');
        const res = buildRes();
        await ScoreController.createLeagueEventScores(req, res);
        (0, vitest_1.expect)(processMock).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(editRoundsMock).not.toHaveBeenCalled();
        (0, vitest_1.expect)(scoringRunMock).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(201);
        (0, vitest_1.expect)(res.json).toHaveBeenCalledWith({
            message: 'Scores saved and event completed',
            isComplete: true,
        });
    });
    (0, vitest_1.it)('PUT updates existing rounds and scores event', async () => {
        mockPrisma.round.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
        const req = buildReq('put');
        const res = buildRes();
        await ScoreController.updateLeagueEventScores(req, res);
        (0, vitest_1.expect)(processMock).not.toHaveBeenCalled();
        (0, vitest_1.expect)(editRoundsMock).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(scoringRunMock).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(200);
        (0, vitest_1.expect)(res.json).toHaveBeenCalledWith({
            message: 'Scores saved and event completed',
            isComplete: true,
        });
    });
});
