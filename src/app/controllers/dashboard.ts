import { Request, Response } from 'express';
import { prisma } from '../../prisma';

export default class Dashboard {
  static async getPlayerEvents(req: Request, res: Response) {
    try {
      const playerId = parseInt(req.params.playerId);
      const leagueId = await prisma.player
        .findUnique({
          where: { id: playerId },
          select: { leagueId: true },
        })
        .then((player) => player?.leagueId);

      if (!leagueId) {
        return res.status(404).json({ message: 'Player or league not found' });
      }

      // event date, course name / side, opponent, tee time
      const flightIds = await prisma.flight_player.findMany({
        where: { playerId: playerId },
        select: { flightId: true },
      });

      const flights = await prisma.flight.findMany({
        where: { id: { in: flightIds.map((fp) => fp.flightId) } },
        include: {
          event: {
            select: {
              id: true,
              date: true,
              name: true,
              startSide: true,
              eventType: true,
              course: {
                select: { name: true },
              },
            },
          },
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
      });

      const fs = flights.slice(0, 3);

      return res.status(200).json({ flights: fs });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async getPlayerStats(req: Request, res: Response) {
    try {
      const playerId = parseInt(req.params.playerId);

      const player = await prisma.player.findUnique({
        where: { id: playerId },
      });

      const rounds = await prisma.round.findMany({
        where: { playerId },
      });

      const totalEvents = rounds.length;
      const averageScore = rounds.reduce((acc, round) => acc + round.gross, 0) / (totalEvents || 1);
      const averageNetScore =
        rounds.reduce((acc, round) => acc + round.net, 0) / (totalEvents || 1);

      const totals = rounds.reduce(
        (acc, round) => {
          acc.eagles += round.eagles || 0;
          acc.birdies += round.birdies || 0;
          acc.pars += round.pars || 0;
          acc.bogeys += round.bogeys || 0;
          acc.doubleBogeys += round.doubleBogeys || 0;
          return acc;
        },
        { eagles: 0, birdies: 0, pars: 0, bogeys: 0, doubleBogeys: 0 },
      );

      return res.status(200).json({
        player,
        stats: {
          totalEvents,
          averageScore,
          averageNetScore,
          totals,
        },
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async getLeagueStats(req: Request, res: Response) {
    const leagueId = parseInt(req.params.leagueId);
    const playerId = parseInt(req.query.playerId as string);

    const eventIds = await prisma.event
      .findMany({
        where: { leagueId },
        select: { id: true },
      })
      .then((events) => events.map((event) => event.id));

    // get all scores except for the specified player if provided
    const rounds = await prisma.round.findMany({
      where: {
        eventId: { in: eventIds },
        ...(playerId ? { playerId: { not: playerId } } : {}),
      },
    });

    console.log('Scores fetched for league stats:', rounds.length);

    const totalEvents = await prisma.event.count({
      where: { leagueId },
    });

    const averageScore = rounds.reduce((acc, round) => acc + round.gross, 0) / (rounds.length || 1);
    const averageNetScore =
      rounds.reduce((acc, round) => acc + round.net, 0) / (rounds.length || 1);

    let totals = rounds.reduce(
      (acc, round) => {
        acc.eagles += round.eagles || 0;
        acc.birdies += round.birdies || 0;
        acc.pars += round.pars || 0;
        acc.bogeys += round.bogeys || 0;
        acc.doubleBogeys += round.doubleBogeys || 0;
        return acc;
      },
      { eagles: 0, birdies: 0, pars: 0, bogeys: 0, doubleBogeys: 0 },
    );

    totals.eagles = totals.eagles / (rounds.length || 1);
    totals.birdies = totals.birdies / (rounds.length || 1);
    totals.pars = totals.pars / (rounds.length || 1);
    totals.bogeys = totals.bogeys / (rounds.length || 1);
    totals.doubleBogeys = totals.doubleBogeys / (rounds.length || 1);

    return res.status(200).json({
      stats: {
        totalEvents,
        averageScore,
        averageNetScore,
        totals,
      },
    });
  }

  static async getLeagueLeaderboards(req: Request, res: Response) {
    try {
      const leagueId = parseInt(req.params.leagueId);

      const players = await prisma.player.findMany({
        where: { leagueId },
      });

      const teams = await prisma.team.findMany({
        where: { leagueId },
      });

      const topPlayers = players
        .sort((a, b) => b.seasonPoints - a.seasonPoints)
        .map((player) => ({
          id: player.id,
          name: `${player.firstName} ${player.lastName}`,
          points: player.seasonPoints,
        }))
        .slice(0, 5);

      const topTeams = teams
        .sort((a, b) => b.seasonPoints - a.seasonPoints)
        .map((team) => ({
          id: team.id,
          name: team.name,
          points: team.seasonPoints,
        }))
        .slice(0, 5);

      const topHandicaps = players
        .filter((player) => player.handicap !== null)
        .sort((a, b) => a.handicap! - b.handicap!)
        .map((player) => ({
          id: player.id,
          name: `${player.firstName} ${player.lastName}`,
          handicap: player.handicap,
        }))
        .slice(0, 5);

      return res.status(200).json({
        topPlayers,
        topTeams,
        topHandicaps,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
}
