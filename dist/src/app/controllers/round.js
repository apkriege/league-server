"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../../prisma");
const round_1 = require("../services/round");
const event_mode_1 = require("../utils/event-mode");
const score_order_1 = require("../utils/score-order");
const audit_1 = require("../utils/audit");
const notifications_1 = require("../utils/notifications");
const error_response_1 = require("../utils/error-response");
const toStrokePointsArray = (raw) => {
    if (Array.isArray(raw)) {
        return raw.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v >= 0);
    }
    if (typeof raw === 'string') {
        return raw
            .split(',')
            .map((v) => Number(v.trim()))
            .filter((v) => Number.isFinite(v) && v >= 0);
    }
    return [];
};
const finalizeIndividualStrokeEventPoints = async (eventId, db = prisma_1.prisma) => {
    const event = await db.event.findUnique({
        where: { id: eventId },
        select: {
            pointsEnabled: true,
            strokePoints: true,
            rounds: {
                where: { status: 'completed' },
                select: {
                    id: true,
                    playerId: true,
                    net: true,
                    gross: true,
                    scores: {
                        select: {
                            net: true,
                            par: true,
                        },
                    },
                },
            },
        },
    });
    if (!event || event.rounds.length === 0)
        return;
    if (event.pointsEnabled === false) {
        await db.round.updateMany({
            where: { eventId, status: 'completed' },
            data: { pointsEarned: 0, matchPoints: 0 },
        });
        return;
    }
    const strokePoints = toStrokePointsArray(event.strokePoints);
    // If no strokePoints table is configured, fall back to Stableford-style points
    // from each round's hole net/par data so points still finalize once per event.
    if (strokePoints.length === 0) {
        const stablefordPoints = (net, par) => {
            const diff = net - par;
            if (diff <= -2)
                return 4;
            if (diff === -1)
                return 3;
            if (diff === 0)
                return 2;
            if (diff === 1)
                return 1;
            return 0;
        };
        await Promise.all(event.rounds.map((round) => {
            const points = (round.scores || []).reduce((sum, score) => {
                const net = Number(score.net);
                const par = Number(score.par);
                if (!Number.isFinite(net) || !Number.isFinite(par))
                    return sum;
                return sum + stablefordPoints(net, par);
            }, 0);
            return db.round.update({
                where: { id: round.id },
                data: { pointsEarned: points },
            });
        }));
        return;
    }
    const ranked = [...event.rounds].sort((a, b) => {
        if (Number(a.net) !== Number(b.net))
            return Number(a.net) - Number(b.net);
        return Number(a.gross) - Number(b.gross);
    });
    const roundPoints = new Map();
    let cursor = 0;
    while (cursor < ranked.length) {
        const current = ranked[cursor];
        let end = cursor;
        while (end + 1 < ranked.length &&
            Number(ranked[end + 1].net) === Number(current.net) &&
            Number(ranked[end + 1].gross) === Number(current.gross)) {
            end += 1;
        }
        let pointsSum = 0;
        for (let idx = cursor; idx <= end; idx += 1) {
            pointsSum += Number(strokePoints[idx] ?? 0);
        }
        const tiePoints = (Math.round((pointsSum / (end - cursor + 1)) * 10) || 0) / 10;
        for (let idx = cursor; idx <= end; idx += 1) {
            roundPoints.set(Number(ranked[idx].id), tiePoints);
        }
        cursor = end + 1;
    }
    await Promise.all([...roundPoints.entries()].map(([roundId, points]) => db.round.update({
        where: { id: roundId },
        data: { pointsEarned: points },
    })));
};
const toNumber = (value, fallback = 0) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
};
const normalizeTeamPoints = (rows) => {
    const merged = new Map();
    for (const row of rows) {
        const teamId = toNumber(row?.teamId, NaN);
        if (!Number.isFinite(teamId))
            continue;
        const current = merged.get(teamId) || 0;
        merged.set(teamId, current + toNumber(row?.points, 0));
    }
    return [...merged.entries()].map(([teamId, points]) => ({ teamId, points }));
};
const syncTeamEventPoints = async (leagueId, eventId, teamPointsRows, db = prisma_1.prisma) => {
    const normalized = normalizeTeamPoints(teamPointsRows);
    if (normalized.length === 0)
        return;
    for (const row of normalized) {
        const existing = await db.team_event_points.findUnique({
            where: {
                teamId_eventId: {
                    teamId: row.teamId,
                    eventId,
                },
            },
        });
        const previousPoints = Number(existing?.points || 0);
        const delta = row.points - previousPoints;
        await db.team_event_points.upsert({
            where: {
                teamId_eventId: {
                    teamId: row.teamId,
                    eventId,
                },
            },
            create: {
                leagueId,
                teamId: row.teamId,
                eventId,
                points: row.points,
            },
            update: {
                points: row.points,
            },
        });
        if (delta !== 0) {
            await db.team.update({
                where: { id: row.teamId },
                data: {
                    seasonPoints: {
                        increment: delta,
                    },
                },
            });
        }
    }
};
const calculateTeamStrokeBestBallPoints = async (eventId, flightId, db = prisma_1.prisma) => {
    const event = await db.event.findUnique({
        where: { id: eventId },
        include: {
            flights: {
                where: { id: flightId },
                include: {
                    players: true,
                    teams: true,
                },
            },
        },
    });
    if (!event || event.flights.length === 0)
        return [];
    if (event.pointsEnabled === false)
        return [];
    const flight = event.flights[0];
    const teamIds = [
        ...new Set((flight.teams || []).map((t) => Number(t.teamId)).filter(Boolean)),
    ];
    if (teamIds.length < 2)
        return [];
    const playersByTeamId = new Map();
    for (const teamId of teamIds) {
        const playerIds = (flight.players || [])
            .filter((p) => Number(p.teamId) === teamId)
            .map((p) => Number(p.playerId))
            .filter(Boolean);
        if (playerIds.length > 0)
            playersByTeamId.set(teamId, playerIds);
    }
    if (playersByTeamId.size < 2)
        return [];
    const allPlayerIds = [...playersByTeamId.values()].flat();
    const roundRows = await db.round.findMany({
        where: {
            eventId,
            playerId: { in: allPlayerIds },
        },
        include: {
            scores: {
                select: { hole: true, net: true, par: true },
                orderBy: { hole: 'asc' },
            },
        },
    });
    const scoreByPlayerId = new Map();
    for (const row of roundRows) {
        scoreByPlayerId.set(Number(row.playerId), new Map((row.scores || []).map((s) => [
            Number(s.hole),
            { net: Number(s.net), par: Number(s.par) },
        ])));
    }
    const holeSet = new Set();
    roundRows.forEach((row) => {
        (row.scores || []).forEach((score) => {
            if (Number.isFinite(Number(score.hole))) {
                holeSet.add(Number(score.hole));
            }
        });
    });
    const holeNumbers = [...holeSet.values()].sort((a, b) => a - b);
    const bestBallForHole = (playerIds, hole) => {
        let bestNet = Number.POSITIVE_INFINITY;
        let parForHole = 0;
        for (const playerId of playerIds) {
            const score = scoreByPlayerId.get(playerId)?.get(hole);
            if (score &&
                Number.isFinite(score.net) &&
                score.net > 0 &&
                (!Number.isFinite(bestNet) || score.net < bestNet)) {
                bestNet = score.net;
                parForHole = Number.isFinite(score.par) ? score.par : 0;
            }
        }
        if (!Number.isFinite(bestNet))
            return null;
        return { net: bestNet, par: parForHole };
    };
    const perTeamTotals = new Map();
    for (const teamId of playersByTeamId.keys()) {
        perTeamTotals.set(teamId, { netTotal: 0, stablefordTotal: 0 });
    }
    for (const hole of holeNumbers) {
        for (const [teamId, playerIds] of playersByTeamId.entries()) {
            const best = bestBallForHole(playerIds, hole);
            if (!best)
                continue;
            const aggregate = perTeamTotals.get(teamId);
            if (!aggregate)
                continue;
            aggregate.netTotal += best.net;
            const diff = best.net - best.par;
            if (diff <= -2)
                aggregate.stablefordTotal += 4;
            else if (diff === -1)
                aggregate.stablefordTotal += 3;
            else if (diff === 0)
                aggregate.stablefordTotal += 2;
            else if (diff === 1)
                aggregate.stablefordTotal += 1;
        }
    }
    const strokePoints = toStrokePointsArray(event?.strokePoints);
    if (strokePoints.length > 0) {
        const ranked = [...perTeamTotals.entries()].sort((a, b) => a[1].netTotal - b[1].netTotal);
        const assigned = new Map();
        let cursor = 0;
        while (cursor < ranked.length) {
            const [_, current] = ranked[cursor];
            let end = cursor;
            while (end + 1 < ranked.length && ranked[end + 1][1].netTotal === current.netTotal) {
                end += 1;
            }
            let sum = 0;
            for (let idx = cursor; idx <= end; idx += 1) {
                sum += Number(strokePoints[idx] ?? 0);
            }
            const tiePoints = (Math.round((sum / (end - cursor + 1)) * 10) || 0) / 10;
            for (let idx = cursor; idx <= end; idx += 1) {
                assigned.set(Number(ranked[idx][0]), tiePoints);
            }
            cursor = end + 1;
        }
        return [...assigned.entries()].map(([teamId, points]) => ({ teamId, points }));
    }
    return [...perTeamTotals.entries()].map(([teamId, totals]) => ({
        teamId,
        points: totals.stablefordTotal,
    }));
};
const validateScoreSubmission = async (db, event, flightId, rawPlayers, rawTeams, isEdit) => {
    if (!Number.isInteger(flightId) || flightId <= 0) {
        throw new Error('Flight id is invalid.');
    }
    if (!Array.isArray(rawPlayers) || rawPlayers.length === 0) {
        throw new Error('Players and scores are required.');
    }
    const flight = await db.flight.findFirst({
        where: { id: flightId, eventId: event.id, deletedAt: null },
        include: {
            players: { where: { deletedAt: null } },
            teams: { where: { deletedAt: null } },
        },
    });
    if (!flight) {
        throw new Error('Flight does not belong to this event.');
    }
    if (!isEdit && String(flight.status || '').toLowerCase() === 'completed') {
        throw new Error('Flight scores have already been entered.');
    }
    const submittedPlayerIds = rawPlayers.map((player) => Number(player?.playerId));
    if (submittedPlayerIds.some((id) => !Number.isInteger(id) || id <= 0) ||
        new Set(submittedPlayerIds).size !== submittedPlayerIds.length) {
        throw new Error('Player ids must be valid and unique.');
    }
    const assignmentByPlayerId = new Map(flight.players.map((assignment) => [Number(assignment.playerId), assignment]));
    if (submittedPlayerIds.length !== assignmentByPlayerId.size ||
        submittedPlayerIds.some((id) => !assignmentByPlayerId.has(id))) {
        throw new Error('Scores must include exactly the players assigned to this flight.');
    }
    const eventFormat = (0, event_mode_1.normalizeEventFormat)(event.format, 'individual');
    const scoringFormat = (0, event_mode_1.normalizeScoringFormat)(event.scoringFormat, 'stroke');
    const maxHolePoints = Math.max(0, Number(event.ptsPerHole || 0)) * Number(event.holes || 0);
    const maxMatchPoints = Math.max(0, Number(event.ptsPerMatch || 0));
    const players = rawPlayers.map((player) => {
        const points = Number(player?.points || 0);
        const matchPoints = Number(player?.matchPoints || 0);
        if (scoringFormat === 'match' && (!Number.isFinite(points) ||
            points < 0 ||
            points > maxHolePoints ||
            !Number.isFinite(matchPoints) ||
            matchPoints < 0 ||
            matchPoints > maxMatchPoints)) {
            throw new Error('Submitted player points are outside the event scoring rules.');
        }
        const assignment = assignmentByPlayerId.get(Number(player.playerId));
        const assignedOpponentId = assignment?.opponentId == null ? null : Number(assignment.opponentId);
        const submittedOpponentId = player?.opponentId == null ? null : Number(player.opponentId);
        if (submittedOpponentId !== assignedOpponentId) {
            throw new Error('Player opponents must match the flight assignments.');
        }
        return {
            ...player,
            playerId: Number(player.playerId),
            opponentId: assignedOpponentId,
            points,
            matchPoints,
        };
    });
    const teams = normalizeTeamPoints(Array.isArray(rawTeams) ? rawTeams : []);
    const assignedTeamIds = new Set(flight.teams.map((assignment) => Number(assignment.teamId)).filter(Boolean));
    if (teams.some((team) => !assignedTeamIds.has(team.teamId))) {
        throw new Error('Submitted teams must belong to this flight.');
    }
    if (eventFormat === 'team' && scoringFormat === 'match') {
        if (teams.length !== assignedTeamIds.size) {
            throw new Error('Team points must include every team assigned to this flight.');
        }
        const maxTeamPoints = Math.max(0, Number(event.ptsPerTeamWin || 0));
        if (teams.some((team) => team.points < 0 || team.points > maxTeamPoints)) {
            throw new Error('Submitted team points are outside the event scoring rules.');
        }
    }
    return { players, teams };
};
// Score seed - overall scores for each player in an event
class ScoreController {
    static getLeagueEventScores = async (req, res) => {
        try {
            const { leagueId, eventId } = req.params;
            const numericLeagueId = Number(leagueId);
            const numericEventId = Number(eventId);
            const event = await prisma_1.prisma.event.findFirst({
                where: {
                    id: numericEventId,
                    leagueId: numericLeagueId,
                    isDeleted: false,
                    deletedAt: null,
                },
                include: {
                    course: true,
                    tee: true,
                    flights: {
                        where: { deletedAt: null },
                        include: {
                            players: {
                                include: {
                                    player: true,
                                },
                            },
                            teams: {
                                include: {
                                    team: {
                                        include: {
                                            players: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                    rounds: {
                        where: { deletedAt: null },
                        include: {
                            player: {
                                include: {
                                    team: true,
                                },
                            },
                            scores: true,
                        },
                    },
                },
            });
            if (!event) {
                return res.status(404).json({ message: 'Event not found' });
            }
            return res.status(200).json(event);
        }
        catch (error) {
            console.error('Error fetching league event scores:', error);
            return res.status(500).json({ message: 'Failed to fetch league event scores' });
        }
    };
    static createLeagueEventScores = async (req, res) => {
        try {
            const leagueId = Number(req.params.leagueId);
            const eventId = Number(req.params.eventId);
            const flightId = Number(req.body?.flightId);
            if (req.body?.eventId != null && Number(req.body.eventId) !== eventId) {
                return res.status(400).json({ message: 'Request event id does not match the route.' });
            }
            const event = await prisma_1.prisma.event.findFirst({
                where: { id: eventId, leagueId, isDeleted: false, deletedAt: null },
            });
            if (!event) {
                return res.status(404).json({ message: 'Event not found' });
            }
            if (String(event.status || '').toLowerCase() === 'canceled') {
                return res.status(409).json({ message: 'Canceled events cannot be scored.' });
            }
            if (event.isComplete || String(event.status || '').toLowerCase() === 'completed') {
                return res.status(409).json({ message: 'Completed events cannot receive new scores.' });
            }
            const scoreOrder = await (0, score_order_1.getLeagueScoreOrder)(leagueId);
            if (scoreOrder.nextScorableEventId !== eventId) {
                return res.status(409).json({
                    message: 'Scores must be entered in event order. Complete earlier events first.',
                });
            }
            const eventFormat = (0, event_mode_1.normalizeEventFormat)(event.format, 'individual');
            const scoringFormat = (0, event_mode_1.normalizeScoringFormat)(event.scoringFormat, 'stroke');
            const pointsEnabled = event.pointsEnabled !== false;
            await prisma_1.prisma.$transaction(async (tx) => {
                const submission = await validateScoreSubmission(tx, event, flightId, req.body?.players, req.body?.teams, false);
                for (const player of submission.players) {
                    const normalizedPlayer = !pointsEnabled || scoringFormat === 'stroke'
                        ? { ...player, points: 0, matchPoints: 0 }
                        : player;
                    const round = new round_1.Round(eventId, normalizedPlayer, undefined, tx);
                    await round.process();
                }
                const teamRows = !pointsEnabled
                    ? []
                    : eventFormat === 'team' && scoringFormat === 'stroke'
                        ? await calculateTeamStrokeBestBallPoints(eventId, flightId, tx)
                        : submission.teams;
                await syncTeamEventPoints(leagueId, eventId, teamRows, tx);
                await tx.flight.update({
                    where: { id: flightId },
                    data: { status: 'completed' },
                });
                const allFlights = await tx.flight.findMany({
                    where: { eventId, deletedAt: null },
                    select: { status: true },
                });
                if (allFlights.length > 0 && allFlights.every((flight) => flight.status === 'completed')) {
                    if (eventFormat === 'individual' && scoringFormat === 'stroke') {
                        await finalizeIndividualStrokeEventPoints(eventId, tx);
                    }
                    await tx.event.update({
                        where: { id: eventId },
                        data: { status: 'completed', isComplete: true },
                    });
                }
                await tx.league_onboarding.upsert({
                    where: { leagueId },
                    create: { leagueId, firstScoresEnteredAt: new Date() },
                    update: { firstScoresEnteredAt: new Date() },
                });
            });
            await (0, audit_1.writeAuditLog)({
                userId: req.session.userId ?? null,
                leagueId,
                entity: 'event',
                entityId: eventId,
                action: 'create_scores',
                summary: `Entered scores for event ${event.name}.`,
            });
            await (0, notifications_1.notifyLeagueAdmins)(leagueId, {
                type: 'scores_entered',
                title: 'Scores entered',
                body: `Scores were entered for ${event.name}.`,
                metadata: { eventId, flightId },
            });
            return res.status(201).json({ message: 'Scores created successfully' });
        }
        catch (error) {
            console.error('Error parsing request data:', error);
            return res.status(400).json({ message: error.message || 'Invalid request data' });
        }
    };
    static updateLeagueEventScores = async (req, res) => {
        try {
            const leagueId = Number(req.params.leagueId);
            const eventId = Number(req.params.eventId);
            const scoresData = req.body;
            const flightId = Number(scoresData?.flightId);
            if (scoresData?.eventId != null && Number(scoresData.eventId) !== eventId) {
                return res.status(400).json({ message: 'Request event id does not match the route.' });
            }
            const event = await prisma_1.prisma.event.findFirst({
                where: { id: eventId, leagueId, isDeleted: false, deletedAt: null },
            });
            if (!event) {
                return res.status(404).json({ message: 'Event not found' });
            }
            if (String(event.status || '').toLowerCase() === 'canceled') {
                return res.status(409).json({ message: 'Canceled events cannot be updated.' });
            }
            const scoreOrder = await (0, score_order_1.getLeagueScoreOrder)(leagueId);
            if (scoreOrder.latestScoredEventId !== eventId) {
                return res.status(409).json({
                    message: 'Only the latest scored event can be updated.',
                });
            }
            const eventFormat = (0, event_mode_1.normalizeEventFormat)(event.format, 'individual');
            const scoringFormat = (0, event_mode_1.normalizeScoringFormat)(event.scoringFormat, 'stroke');
            const pointsEnabled = event.pointsEnabled !== false;
            await prisma_1.prisma.$transaction(async (tx) => {
                const submission = await validateScoreSubmission(tx, event, flightId, scoresData?.players, scoresData?.teams, true);
                for (const player of submission.players) {
                    const existingRound = await tx.round.findFirst({
                        where: { eventId, playerId: player.playerId, deletedAt: null },
                    });
                    if (!existingRound) {
                        throw new Error(`Round not found for player ${player.playerId} in this event.`);
                    }
                    const normalizedPlayer = !pointsEnabled || scoringFormat === 'stroke'
                        ? { ...player, points: 0, matchPoints: 0 }
                        : player;
                    const round = new round_1.Round(eventId, normalizedPlayer, existingRound, tx);
                    await round.process();
                }
                const teamRows = !pointsEnabled
                    ? []
                    : eventFormat === 'team' && scoringFormat === 'stroke'
                        ? await calculateTeamStrokeBestBallPoints(eventId, flightId, tx)
                        : submission.teams;
                await syncTeamEventPoints(leagueId, eventId, teamRows, tx);
                await tx.flight.update({
                    where: { id: flightId },
                    data: { status: 'completed' },
                });
                const allFlights = await tx.flight.findMany({
                    where: { eventId, deletedAt: null },
                    select: { status: true },
                });
                if (allFlights.length > 0 && allFlights.every((flight) => flight.status === 'completed')) {
                    if (eventFormat === 'individual' && scoringFormat === 'stroke') {
                        await finalizeIndividualStrokeEventPoints(eventId, tx);
                    }
                    await tx.event.update({
                        where: { id: eventId },
                        data: { status: 'completed', isComplete: true },
                    });
                }
            });
            await (0, audit_1.writeAuditLog)({
                userId: req.session.userId ?? null,
                leagueId,
                entity: 'event',
                entityId: eventId,
                action: 'update_scores',
                summary: `Updated scores for event ${event.name}.`,
            });
            return res.status(200).json({ message: 'Scores updated successfully' });
        }
        catch (error) {
            console.error('Error parsing request data:', error);
            const { status, message } = (0, error_response_1.getPublicErrorResponse)(error);
            return res.status(status === 500 ? 400 : status).json({ message });
        }
    };
}
exports.default = ScoreController;
