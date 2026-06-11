import { Request, Response } from 'express';
import { prisma } from '../../prisma';

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

      res.status(200).json({ message: 'Flights updated successfully' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
}
