import { PrismaClient } from '@prisma/client';
export const prisma = new PrismaClient();

// gameplan
// get all relevant event data (event, tee, players, teams)
// process each players round

interface PlayerScore {
  playerId: number;
  scores: Record<number, number>;
}

interface HoleScore {
  gross: number;
  net: number;
  par: number;
  strokesOnHole: number;
}

interface ScoreStats {
  gross: number;
  net: number;
  adjusted: number;
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

export class Scoring {
  // private event: any;
  // private tee: any;
  // private players: any;
  // private teams: any;
  // private rounds: any;

  private eventId: number;
  private rounds: PlayerScore[];
  private event: any;
  private tee: any;
  private players: any;
  private teams: any;

  constructor(eventId: number, rounds: any) {
    this.eventId = eventId;
    this.rounds = rounds;
  }

  async run() {
    try {
      await this.setEvent(this.eventId);
      // await this.processRounds();

      // based on the event format and scoring type
    } catch (error) {
      console.error('Error during scoring process:', error);
    }
  }

  // Set event, tee, players, and teams
  private async setEvent(eventId: number) {
    const event = await prisma.event.findFirst({
      where: { id: eventId },
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

    this.event = event;
    this.tee = event?.tee;
    this.players =
      event?.flights.flatMap((flight: any) => flight.players.map((p: any) => p.player)) || [];
    this.teams =
      event?.flights.flatMap((flight: any) => flight.teams.map((t: any) => t.team)) || [];
  }

  private async processRounds() {
    // Implementation for saving scores to the database
    const calculatedPlayerScores = this.rounds.map((pr: any) => {
      const playerData = this.getPlayer(pr.playerId, pr.scores);
      return playerData;
    });
  }

  // Helper to get player info
  private getPlayer(playerId: number, scores: Record<number, number>) {
    const player = this.players.find((p: any) => p.id === playerId);
    console.log(player);

    if (!player) {
      throw new Error(`Player with ID ${playerId} not found in event players.`);
    }

    return {
      id: playerId,
      teamId: player?.teamId,
      handicap: player?.handicap,
      seasonPoints: player?.seasonPoints,
      type: player?.type,
      scores: scores,
    };
  }

  // calculate the player score
  private calculatePlayerScore(player: any) {
    const scoreStats: ScoreStats = {
      gross: 0,
      net: 0,
      adjusted: 0,
      eagles: 0,
      birdies: 0,
      pars: 0,
      bogeys: 0,
      doubleBogeys: 0,
      netEagles: 0,
      netBirdies: 0,
      netPars: 0,
      netBogeys: 0,
      netDoubleBogeys: 0,
      pointsEarned: 0,
    };

    //

    return scoreStats;
  }

  private calcualteHandicap() {}

  private getPlayerDifferential() {}
}
