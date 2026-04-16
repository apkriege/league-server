import { Request, Response } from 'express';
import { prisma } from '../../prisma';
import { Scoring } from '../services/scoring';
import { Round } from '../services/round';

interface PlayerRound {
  flightId: number;
  playerId: number;
  scores: Record<number, number>;
}

interface HoleScore {
  gross: number;
  net: number;
  adjusted: number;
  par: number;
  strokesOnHole: number;
}

interface RoundStats {
  totalGross: number;
  totalNet: number;
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  doubleBogeys: number;
  netEagles: number;
  netBirdies: number;
  netPars: number;
  netBogeys: number;
  netDoubleBogeys: number;
  pointsEarned: number;
}

// Score seed - overall scores for each player in an event
export default class ScoreController {
  static calculateEventPoints = async (req: Request, res: Response) => {
    try {
      const { eventId } = req.params;
      // await calculatePoints(parseInt(eventId));
      res.status(200).json({ message: 'Points calculated' });
    } catch (error) {
      console.error('Error calculating points:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static createLeagueEventScores = async (req: Request, res: Response) => {
    try {
      const { leagueId, eventId } = req.params;
      const playerRounds: PlayerRound[] = req.body;

      if (!playerRounds || playerRounds.length === 0) {
        return res.status(400).json({ message: 'No player rounds provided' });
      }

      const submittedPlayerIds = Array.from(
        new Set(
          playerRounds
            .map((pr) => Number(pr?.playerId))
            .filter((id) => Number.isInteger(id) && id > 0),
        ),
      );

      const submittedFlightIds = Array.from(
        new Set(
          playerRounds
            .map((pr) => Number(pr?.flightId))
            .filter((id) => Number.isInteger(id) && id > 0),
        ),
      );

      if (submittedPlayerIds.length === 0) {
        return res.status(400).json({ message: 'No valid player IDs provided' });
      }

      if (submittedFlightIds.length === 0) {
        return res.status(400).json({ message: 'No valid flight IDs provided' });
      }

      const event = await prisma.event.findFirst({
        where: { id: Number(eventId), leagueId: Number(leagueId) },
        include: {
          course: true,
          tee: true,
          flights: {
            include: {
              players: { include: { player: true } },
              teams: { include: { team: { include: { players: true } } } },
            },
          },
        },
      });

      if (!event) {
        return res.status(404).json({ message: 'Event not found' });
      }

      const eventPlayerIds = new Set(
        event.flights.flatMap((flight: any) =>
          flight.players.map((fp: any) => Number(fp.playerId || fp.player?.id)),
        ),
      );

      const eventFlightIds = new Set(event.flights.map((flight: any) => Number(flight.id)));

      const invalidFlightIds = submittedFlightIds.filter((id) => !eventFlightIds.has(id));
      if (invalidFlightIds.length > 0) {
        return res.status(400).json({
          message: `Invalid flight IDs for event: ${invalidFlightIds.join(', ')}`,
        });
      }

      const invalidPlayerIds = submittedPlayerIds.filter((id) => !eventPlayerIds.has(id));
      if (invalidPlayerIds.length > 0) {
        return res.status(400).json({
          message: `Invalid player IDs for event: ${invalidPlayerIds.join(', ')}`,
        });
      }

      const invalidFlightPlayerPairs = playerRounds
        .filter(
          (pr) => Number.isInteger(Number(pr.flightId)) && Number.isInteger(Number(pr.playerId)),
        )
        .filter((pr) => {
          const flight = event.flights.find((f: any) => Number(f.id) === Number(pr.flightId));
          if (!flight) return true;

          const flightPlayerIds = new Set(
            flight.players.map((fp: any) => Number(fp.playerId || fp.player?.id)),
          );
          return !flightPlayerIds.has(Number(pr.playerId));
        })
        .map((pr) => ({ flightId: Number(pr.flightId), playerId: Number(pr.playerId) }));

      if (invalidFlightPlayerPairs.length > 0) {
        return res.status(400).json({
          message: 'Some submitted players do not belong to the submitted flight',
          invalidPairs: invalidFlightPlayerPairs,
        });
      }

      const rounds = new Round(Number(eventId), playerRounds);
      await rounds.process();

      const scoring = new Scoring(Number(eventId), submittedPlayerIds, submittedFlightIds);
      await scoring.run();

      const requiredPlayerIds = Array.from(eventPlayerIds).filter(
        (id) => Number.isInteger(id) && id > 0,
      );

      const completedRoundsCount =
        requiredPlayerIds.length > 0
          ? await prisma.round.count({
              where: {
                eventId: Number(eventId),
                playerId: { in: requiredPlayerIds },
              },
            })
          : 0;

      const allEventPlayersSubmitted =
        requiredPlayerIds.length > 0 && completedRoundsCount === requiredPlayerIds.length;

      await prisma.event.update({
        where: { id: Number(eventId) },
        data: {
          isComplete: allEventPlayersSubmitted,
          ...(allEventPlayersSubmitted ? { status: 'complete' } : {}),
        },
      });

      res.status(201).json({
        message: allEventPlayersSubmitted
          ? 'Scores saved and event completed'
          : 'Scores saved. Event remains incomplete until all flights submit.',
        isComplete: allEventPlayersSubmitted,
      });
    } catch (error) {
      console.error('Score creation error:', error);
      res
        .status(500)
        .json({ message: error instanceof Error ? error.message : 'Internal server error' });
    }
  };
}
