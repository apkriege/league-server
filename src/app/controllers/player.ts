import { Request, Response } from 'express';
import PlayerService from '../models/player';
import { prisma } from '../../prisma';

export default class PlayerController {
  static getPlayers = async (_req: Request, res: Response): Promise<any> => {
    try {
      const players = await prisma.player.findMany({
        where: { deletedAt: null },
        orderBy: [{ type: 'asc' }, { firstName: 'asc' }, { lastName: 'asc' }],
      });

      res.status(200).json(players);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static getPlayer = async (req: Request, res: Response): Promise<any> => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ message: 'Player ID is required' });
      }

      const player = await prisma.player.findFirst({
        where: { id: Number(id), deletedAt: null },
        include: {
          rounds: {
            include: {
              event: {
                select: {
                  id: true,
                  name: true,
                  date: true,
                  startSide: true,
                },
              },
              scores: true,
              tee: true,
              course: true,
            },
          },
        },
      });

      if (!player) {
        return res.status(404).json({ message: 'Player not found' });
      }

      res.status(200).json(player);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static getLeaguePlayers = async (req: Request, res: Response): Promise<any> => {
    try {
      const { leagueId } = req.params;

      if (!leagueId) {
        return res.status(400).json({ message: 'leagueId is required' });
      }

      const players = await PlayerService.findByLeagueId(Number(leagueId));

      res.status(200).send(players);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static createPlayer = async (req: Request, res: Response): Promise<any> => {
    try {
      const { leagueId } = req.params;
      const payload = req.body || {};

      if (!leagueId) {
        return res.status(400).json({ message: 'leagueId is required' });
      }

      if (!payload.firstName || !payload.lastName || !payload.email) {
        return res.status(400).json({ message: 'firstName, lastName, and email are required' });
      }

      const handicap = Number(payload.handicap ?? 0);
      const teamId = payload.teamId != null ? Number(payload.teamId) : null;
      const league = await prisma.league.findUnique({
        where: { id: Number(leagueId) },
        select: { id: true, numPlayers: true },
      });

      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }

      const activePlayers = await prisma.player.count({
        where: { leagueId: Number(leagueId), deletedAt: null },
      });

      if (activePlayers >= Number(league.numPlayers || 0)) {
        return res.status(402).json({
          message: `This league is currently capped at ${league.numPlayers} golfers. Increase your paid golfer count before adding more players.`,
          currentGolfers: activePlayers,
          maxGolfers: league.numPlayers,
        });
      }

      const created = await PlayerService.create({
        leagueId: Number(leagueId),
        userId: payload.userId != null ? Number(payload.userId) : null,
        firstName: String(payload.firstName).trim(),
        lastName: String(payload.lastName).trim(),
        email: String(payload.email).trim().toLowerCase(),
        phone: payload.phone ? String(payload.phone).trim() : null,
        handicap,
        startingHandicap:
          payload.startingHandicap != null ? Number(payload.startingHandicap) : handicap,
        seasonPoints: payload.seasonPoints != null ? Number(payload.seasonPoints) : 0,
        seasonRank: payload.seasonRank != null ? Number(payload.seasonRank) : null,
        type: String(payload.type || 'player').toLowerCase(),
        teamId,
      });

      return res.status(201).json(created);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static updatePlayer = async (req: Request, res: Response): Promise<any> => {
    try {
      const { id } = req.params;
      const payload = req.body || {};

      if (!id) {
        return res.status(400).json({ message: 'Player ID is required' });
      }

      const data: any = {
        ...(payload.firstName != null ? { firstName: String(payload.firstName).trim() } : {}),
        ...(payload.lastName != null ? { lastName: String(payload.lastName).trim() } : {}),
        ...(payload.email != null ? { email: String(payload.email).trim().toLowerCase() } : {}),
        ...(payload.phone !== undefined
          ? { phone: payload.phone ? String(payload.phone).trim() : null }
          : {}),
        ...(payload.type != null ? { type: String(payload.type).toLowerCase() } : {}),
        ...(payload.handicap != null ? { handicap: Number(payload.handicap) } : {}),
        ...(payload.startingHandicap != null
          ? { startingHandicap: Number(payload.startingHandicap) }
          : {}),
        ...(payload.seasonPoints != null ? { seasonPoints: Number(payload.seasonPoints) } : {}),
        ...(payload.seasonRank !== undefined
          ? { seasonRank: payload.seasonRank == null ? null : Number(payload.seasonRank) }
          : {}),
        ...(payload.teamId !== undefined
          ? { teamId: payload.teamId == null ? null : Number(payload.teamId) }
          : {}),
      };

      const updated = await PlayerService.update(Number(id), data);

      return res.status(200).json(updated);
    } catch (error: any) {
      console.error(error);
      if (String(error?.message || '').includes('Player not found')) {
        return res.status(404).json({ message: 'Player not found' });
      }
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static deletePlayer = async (req: Request, res: Response): Promise<any> => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ message: 'Player ID is required' });
      }

      await PlayerService.delete(Number(id));
      return res.status(200).json({ message: 'Player removed' });
    } catch (error: any) {
      console.error(error);
      if (String(error?.message || '').includes('Player not found')) {
        return res.status(404).json({ message: 'Player not found' });
      }
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static getPlayerStats = async (req: Request, res: Response): Promise<any> => {
    try {
      const { leagueId, playerId } = req.params;

      const player = await prisma.player.findUnique({
        where: { id: Number(playerId) },
        include: {
          team: true,
          rounds: {
            where: {
              event: { leagueId: Number(leagueId), isDeleted: false },
              status: 'completed',
            },
            include: {
              event: { select: { id: true, name: true, date: true, startSide: true } },
              course: {
                select: {
                  id: true,
                  name: true,
                },
              },
              tee: {
                select: {
                  id: true,
                  name: true,
                },
              },
              scores: {
                orderBy: { hole: 'asc' },
              },
            },
            orderBy: { date: 'asc' },
          },
        },
      });

      if (!player) {
        return res.status(404).json({ message: 'Player not found' });
      }

      const rounds = player.rounds;

      if (rounds.length === 0) {
        return res.status(200).json({
          player: {
            id: player.id,
            firstName: player.firstName,
            lastName: player.lastName,
            handicap: player.handicap,
            startingHandicap: player.startingHandicap,
            seasonPoints: player.seasonPoints,
            seasonRank: player.seasonRank,
            type: player.type,
            team: player.team,
          },
          stats: null,
          rounds: [],
        });
      }

      // Aggregate season stats
      let totalGross = 0;
      let totalNet = 0;
      let totalPoints = 0;
      let totalPutts = 0;
      let totalBirdies = 0;
      let totalEagles = 0;
      let totalPars = 0;
      let totalBogeys = 0;
      let totalDoubleBogeys = 0;
      let totalTripleBogeys = 0;
      let totalNetBirdies = 0;
      let totalNetEagles = 0;
      let lowGross = Infinity;
      let lowNet = Infinity;
      let highPoints = -Infinity;

      const roundSummaries: any[] = [];

      for (const r of rounds) {
        totalGross += r.gross;
        totalNet += r.net;
        totalPoints += Number(r.pointsEarned);
        totalPutts += r.putts;
        totalBirdies += r.birdies;
        totalEagles += r.eagles;
        totalPars += r.pars;
        totalBogeys += r.bogeys;
        totalDoubleBogeys += r.doubleBogeys;
        totalTripleBogeys += r.tripleBogeys;
        totalNetBirdies += r.netBirdies ?? 0;
        totalNetEagles += r.netEagles ?? 0;
        if (r.gross < lowGross) lowGross = r.gross;
        if (r.net < lowNet) lowNet = r.net;
        if (Number(r.pointsEarned) > highPoints) highPoints = Number(r.pointsEarned);

        roundSummaries.push({
          id: r.id,
          eventId: r.event.id,
          eventName: r.event.name,
          date: r.event.date,
          event: r.event,
          course: r.course,
          tee: r.tee,
          gross: r.gross,
          net: r.net,
          adjusted: r.adjusted,
          courseRating: r.courseRating,
          courseSlope: r.courseSlope,
          points: Number(r.pointsEarned),
          putts: r.putts,
          birdies: r.birdies,
          eagles: r.eagles,
          pars: r.pars,
          bogeys: r.bogeys,
          doubleBogeys: r.doubleBogeys,
          preHandicap: r.preHandicap,
          postHandicap: r.postHandicap,
          differential: r.differential,
          scores: r.scores.map((score) => ({
            hole: score.hole,
            gross: score.gross,
            net: score.net,
            par: score.par,
          })),
        });
      }

      const count = rounds.length;
      const r = (v: number) => Math.round(v * 10) / 10;

      const stats = {
        rounds: count,
        totalPoints: r(totalPoints),
        avgPoints: r(totalPoints / count),
        bestPoints: r(highPoints),
        avgGross: r(totalGross / count),
        avgNet: r(totalNet / count),
        lowGross,
        lowNet,
        avgPutts: r(totalPutts / count),
        totalBirdies,
        totalEagles,
        totalNetBirdies,
        totalNetEagles,
        totalPars,
        totalBogeys,
        totalDoubleBogeys,
        totalTripleBogeys,
        startingHandicap: Number(player.startingHandicap),
        currentHandicap: Number(player.handicap),
        handicapChange: r(Number(player.handicap) - Number(player.startingHandicap)),
      };

      return res.status(200).json({
        player: {
          id: player.id,
          firstName: player.firstName,
          lastName: player.lastName,
          handicap: player.handicap,
          startingHandicap: player.startingHandicap,
          seasonPoints: player.seasonPoints,
          seasonRank: player.seasonRank,
          type: player.type,
          team: player.team,
        },
        stats,
        rounds: roundSummaries,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
}
