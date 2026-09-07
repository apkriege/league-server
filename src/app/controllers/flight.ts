import { lockScoringEvent } from '../services/scoringTransaction';
import { Request, Response } from 'express';
import { prisma } from '../../prisma';
import { writeAuditLog } from '../utils/audit';
import { modelEventTeeForRound } from '../utils/event-route';

export default class FlightController {
  static getFlight = async (req: Request, res: Response) => {
    try {
      const flightId = Number(req.params.flightId);
      const flight = await prisma.flight.findUnique({
        where: { id: flightId },
        include: {
          players: {
            include: {
              player: true,
            },
          },
          teams: {
            include: {
              team: true,
            },
          },
        },
      });

      if (!flight) {
        return res.status(404).json({ message: 'Flight not found' });
      }

      res.status(200).json(flight);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static updateFlightPlayers = async (req: Request, res: Response) => {
    try {
      const flightId = Number(req.params.flightId);
      const { players } = req.body;

      if (!Array.isArray(players)) {
        return res.status(400).json({ message: 'Invalid players payload' });
      }

      const flight = await prisma.flight.findUnique({
        where: { id: flightId },
        include: {
          teams: { where: { deletedAt: null }, select: { teamId: true } },
          event: {
            include: {
              course: true,
              tee: true,
              routeSegments: {
                orderBy: { position: 'asc' },
                include: { course: true, tee: true },
              },
            },
          },
        },
      });
      if (!flight) {
        return res.status(404).json({ message: 'Flight not found' });
      }
      if (flight.status === 'completed') {
        return res.status(409).json({ message: 'Completed flights cannot be changed' });
      }

      const existingFlightPlayers = await prisma.flight_player.findMany({
        where: { flightId },
        orderBy: { id: 'asc' },
      });

      if (existingFlightPlayers.length !== players.length) {
        return res.status(400).json({
          message: 'Player count mismatch for flight update',
          expected: existingFlightPlayers.length,
          received: players.length,
        });
      }

      const playerIds = players.map((player: any) => Number(player?.playerId));
      if (playerIds.some((id: number) => !Number.isInteger(id) || id <= 0) || new Set(playerIds).size !== playerIds.length) {
        return res.status(400).json({ message: 'Flight players must be unique valid player IDs' });
      }
      const validPlayers = await prisma.player.findMany({
        where: { id: { in: playerIds }, leagueId: flight.event.leagueId, deletedAt: null },
        select: { id: true, gender: true },
      });
      if (validPlayers.length !== playerIds.length) {
        return res.status(400).json({ message: 'All flight players must belong to the event league' });
      }
      const conflictingAssignment = await prisma.flight_player.findFirst({
        where: {
          playerId: { in: playerIds },
          deletedAt: null,
          flightId: { not: flightId },
          flight: { eventId: flight.eventId, deletedAt: null },
        },
        select: { playerId: true },
      });
      if (conflictingAssignment) {
        return res.status(409).json({
          message: 'A player cannot be assigned to more than one flight in the same event.',
        });
      }
      try {
        validPlayers.forEach((player) => modelEventTeeForRound(flight.event, player.gender));
      } catch (error) {
        return res.status(400).json({
          message: error instanceof Error ? error.message : 'The event tee is not valid for every player.',
        });
      }

      const teamIds = [...new Set(players.map((player: any) => Number(player?.teamId)).filter(Boolean))];
      if (
        String(flight.event.format).toLowerCase() === 'team' &&
        players.some((player: any) => !Number.isInteger(Number(player?.teamId)) || Number(player.teamId) <= 0)
      ) {
        return res.status(400).json({ message: 'Every player in a team event must have an assigned team' });
      }
      if (teamIds.length > 0) {
        const validTeams = await prisma.team.findMany({
          where: { id: { in: teamIds }, leagueId: flight.event.leagueId, deletedAt: null },
          select: { id: true },
        });
        if (validTeams.length !== teamIds.length) {
          return res.status(400).json({ message: 'All flight teams must belong to the event league' });
        }
        const assignedTeamIds = new Set(flight.teams.map((team) => Number(team.teamId)));
        if (teamIds.some((teamId) => !assignedTeamIds.has(teamId))) {
          return res.status(400).json({ message: 'Flight players must stay on a team assigned to this flight' });
        }
      }

      const opponentByPlayerId = new Map<number, number>();
      for (const player of players) {
        if (player?.opponentId == null || player.opponentId === '') continue;
        const playerId = Number(player.playerId);
        const opponentId = Number(player.opponentId);
        if (!Number.isInteger(opponentId) || opponentId <= 0 || opponentId === playerId) {
          return res.status(400).json({ message: 'Flight opponents must be different valid players' });
        }
        opponentByPlayerId.set(playerId, opponentId);
      }
      const opponentIds = [...opponentByPlayerId.values()];
      const flightPlayerIds = new Set(playerIds);
      if (opponentIds.some((id: number) => !flightPlayerIds.has(id))) {
        return res.status(400).json({
          message: 'Flight opponents must be players in the same flight',
        });
      }
      if (
        [...opponentByPlayerId].some(
          ([playerId, opponentId]) => opponentByPlayerId.get(opponentId) !== playerId,
        )
      ) {
        return res.status(400).json({ message: 'Flight opponents must be reciprocal pairs' });
      }

      await prisma.$transaction(async (tx) => {
        await lockScoringEvent(tx, flight.event.leagueId, flight.eventId, false);
        const current = await tx.flight.findUnique({ where: { id: flightId } });
        if (!current || current.deletedAt || current.status === 'completed') throw new Error('Flight cannot be edited after scoring');
        const conflict = await tx.flight_player.findFirst({
          where: {
            playerId: { in: playerIds }, flightId: { not: flightId }, deletedAt: null,
            flight: { eventId: flight.eventId, deletedAt: null },
          },
        });
        if (conflict) throw new Error('Player is already assigned to another flight');
        await Promise.all(
          existingFlightPlayers.map((existingRow, idx) => {
            const nextPlayer = players[idx] || {};
            return tx.flight_player.update({
            where: { id: existingRow.id },
            data: {
              playerId: Number(nextPlayer.playerId),
              teamId: nextPlayer.teamId != null ? Number(nextPlayer.teamId) : null,
              opponentId: nextPlayer.opponentId != null ? Number(nextPlayer.opponentId) : null,
            },
            });
          }),
        );
      });

      await writeAuditLog({
        userId: req.session.userId ?? null,
        leagueId: flight?.event?.leagueId ?? null,
        entity: 'flight',
        entityId: flightId,
        action: 'swap_players',
        summary: 'Updated flight player assignments.',
      });

      res.status(200).json({ message: 'Flights updated successfully' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
}
