import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { Scoring } from '../services/scoring';
import { Round } from '../services/round';
export const prisma = new PrismaClient();

interface PlayerRound {
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

      const event = await prisma.event.findFirst({
        where: { id: parseInt(eventId), leagueId: parseInt(leagueId) },
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

      const rounds = new Round(Number(eventId), playerRounds);
      await rounds.process();

      const scoring = new Scoring(Number(eventId));
      await scoring.run();

      // set event as completed
      await prisma.event.update({
        where: { id: parseInt(eventId) },
        data: {
          isComplete: true,
          status: 'complete',
        },
      });

      res.status(201).json({ message: 'Scores saved and event compeleted' });
    } catch (error) {
      console.error('Score creation error:', error);
      res
        .status(500)
        .json({ message: error instanceof Error ? error.message : 'Internal server error' });
    }
  };
}
