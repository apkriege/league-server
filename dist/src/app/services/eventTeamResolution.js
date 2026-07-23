"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveEventFlightTeams = exports.normalizeEventFlightTeamIds = void 0;
const flightGen_1 = require("./flightGen");
const rosterKey = (players = []) => players
    .map((player) => (0, flightGen_1.extractTeamId)(player))
    .filter((id) => id !== null)
    .sort((left, right) => left - right)
    .join(',');
const normalizeEventFlightTeamIds = (flights, existingFlightTeams, incomingTeams = []) => {
    const existingTeams = Array.from(new Map(existingFlightTeams
        .map((entry) => entry?.team)
        .filter(Boolean)
        .map((team) => [Number(team.id), team])).values());
    const currentTeamIds = new Set(existingFlightTeams
        .map((entry) => (0, flightGen_1.extractTeamId)(entry?.teamId ?? entry?.team))
        .filter((id) => id !== null));
    const flightTeamIdToTeamId = new Map();
    for (const entry of existingFlightTeams) {
        const relationId = (0, flightGen_1.extractTeamId)(entry?.id);
        const teamId = (0, flightGen_1.extractTeamId)(entry?.teamId ?? entry?.team);
        if (relationId !== null && teamId !== null) {
            flightTeamIdToTeamId.set(relationId, teamId);
        }
    }
    const incomingIdToTeamId = new Map();
    for (const incomingTeam of Array.isArray(incomingTeams) ? incomingTeams : []) {
        const incomingId = (0, flightGen_1.extractTeamId)(incomingTeam);
        if (incomingId === null)
            continue;
        const incomingRoster = rosterKey(incomingTeam?.players);
        const incomingName = String(incomingTeam?.name || '').trim().toLowerCase();
        const matchingTeam = existingTeams.find((team) => {
            if (incomingRoster && rosterKey(team.players) === incomingRoster)
                return true;
            return incomingName && String(team.name || '').trim().toLowerCase() === incomingName;
        });
        if (matchingTeam) {
            incomingIdToTeamId.set(incomingId, Number(matchingTeam.id));
        }
    }
    return (Array.isArray(flights) ? flights : []).map((flight) => (Array.isArray(flight) ? flight : []).map((entry) => {
        const id = (0, flightGen_1.extractTeamId)(entry);
        if (id === null || currentTeamIds.has(id)) {
            return entry;
        }
        return flightTeamIdToTeamId.get(id) ?? incomingIdToTeamId.get(id) ?? entry;
    }));
};
exports.normalizeEventFlightTeamIds = normalizeEventFlightTeamIds;
const resolveEventFlightTeams = async (tx, leagueId, eventId, flights) => {
    const requestedIds = Array.from(new Set((Array.isArray(flights) ? flights : [])
        .flatMap((flight) => (Array.isArray(flight) ? flight : []))
        .map(flightGen_1.extractTeamId)
        .filter((id) => id !== null)));
    if (requestedIds.length === 0) {
        return [];
    }
    return tx.team.findMany({
        where: {
            id: { in: requestedIds },
            deletedAt: null,
            OR: [{ leagueId }, { eventId }],
        },
        include: {
            players: {
                where: { deletedAt: null },
                select: { id: true },
            },
        },
    });
};
exports.resolveEventFlightTeams = resolveEventFlightTeams;
