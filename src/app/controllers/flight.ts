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

      console.log(players);

      await prisma.flight_player.deleteMany({
        where: { flightId },
      });

      // add new players to the flight
      const flightPlayers = players.map((player: any) => ({
        flightId,
        ...player,
      }));

      await prisma.flight_player.createMany({
        data: flightPlayers,
      });

      res.status(200).json({ message: 'Flights updated successfully' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
}
