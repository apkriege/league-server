import { Request, Response } from 'express';
import { prisma } from '../../prisma';
import { writeAuditLog } from '../utils/audit';

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
        include: { event: { select: { leagueId: true } } },
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
        select: { id: true },
      });
      if (validPlayers.length !== playerIds.length) {
        return res.status(400).json({ message: 'All flight players must belong to the event league' });
      }

      const teamIds = [...new Set(players.map((player: any) => Number(player?.teamId)).filter(Boolean))];
      if (teamIds.length > 0) {
        const validTeams = await prisma.team.findMany({
          where: { id: { in: teamIds }, leagueId: flight.event.leagueId, deletedAt: null },
          select: { id: true },
        });
        if (validTeams.length !== teamIds.length) {
          return res.status(400).json({ message: 'All flight teams must belong to the event league' });
        }
      }

      const opponentIds = players.map((player: any) => Number(player?.opponentId)).filter(Boolean);
      if (opponentIds.some((id: number) => !playerIds.includes(id))) {
        return res.status(400).json({ message: 'Flight opponents must be players in the same flight' });
      }

      await prisma.$transaction(
        existingFlightPlayers.map((existingRow, idx) => {
          const nextPlayer = players[idx] || {};
          return prisma.flight_player.update({
            where: { id: existingRow.id },
            data: {
              playerId: Number(nextPlayer.playerId),
              teamId: nextPlayer.teamId != null ? Number(nextPlayer.teamId) : null,
              opponentId: nextPlayer.opponentId != null ? Number(nextPlayer.opponentId) : null,
            },
          });
        }),
      );

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
