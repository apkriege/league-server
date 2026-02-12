import { PrismaClient } from '@prisma/client';
export const prisma = new PrismaClient();

// gameplan
// first get event details - players, teams, format, scoring format
//
// process each players round

export class Scoring {
  private eventId: number;
  private event: any;
  private players: any;
  private teams: any;

  constructor(eventId: number) {
    this.eventId = eventId;
  }

  async run() {
    try {
      await this.setEventDetailsForTeams(this.eventId);

      if (!this.event) {
        console.error('Event not found');
        return;
      }

      const format = this.event.format; // 'individual' | 'team'
      const scoringFormat = this.event.scoringFormat; // 'stroke' | 'matchp'

      if (format === 'individual' && scoringFormat === 'stroke') {
        await this.processIndividualStrokeplay();
      } else if (format === 'individual' && scoringFormat === 'match') {
        await this.processIndividualMatchplay();
      } else if (format === 'team' && scoringFormat === 'stroke') {
        await this.processTeamStrokeplay();
      } else if (format === 'team' && scoringFormat === 'match') {
        await this.processTeamMatchplay();
      } else {
        console.error('Unknown event or scoring format');
      }
    } catch (error) {
      console.error('Error during scoring process:', error);
    }
  }

  private async processIndividualStrokeplay() {}

  private async processIndividualMatchplay() {}

  private async processTeamStrokeplay() {}

  private async processTeamMatchplay() {
    console.log('Processing team matchplay scoring...');

    const flights = this.event.flights || [];

    for (const flight of flights) {
      const teams = flight.teams || [];

      const team1 = teams[0];
      const team2 = teams[1];

      if (!team1 || !team2) {
        console.warn(`Flight ${flight.id} does not have two teams.`);
        continue;
      }

      let team1Points = 0;
      let team2Points = 0;
      let team1PlayerPoints = 0;
      let team2PlayerPoints = 0;

      const t1Players = this.getTeamPlayers(team1.team.players.map((p: any) => p.id));
      const t2Players = this.getTeamPlayers(team2.team.players.map((p: any) => p.id));

      const [t1p1, t2p1] = this.processMatchup(t1Players[0], t2Players[0]);
      const [t1p2, t2p2] = this.processMatchup(t1Players[1], t2Players[1]);

      console.log(`Team 1 Player 1 points: ${t1p1.points}, Team 1 Player 2 points: ${t1p2.points}`);
      console.log(`Team 2 Player 1 points: ${t2p1.points}, Team 2 Player 2 points: ${t2p2.points}`);

      team1PlayerPoints = t1p1.points + t1p2.points;
      team2PlayerPoints = t2p1.points + t2p2.points;

      /////
      /// NEED TO ADD OPPONENT IDS TO THE MATCHUPS TO MAKE THIS WORK
      /////

      if (team1PlayerPoints > team2PlayerPoints) {
        team1Points = this.event.ptsPerTeamWin || 2;
      } else if (team2PlayerPoints > team1PlayerPoints) {
        team2Points = this.event.ptsPerTeamWin || 2;
      } else {
        team1Points = (this.event.ptsPerTeamWin || 2) / 2;
        team2Points = (this.event.ptsPerTeamWin || 2) / 2;
      }

      // have to save each players points
      for (const p of [t1p1, t1p2, t2p1, t2p2]) {
        const player = this.players.find((pl: any) => pl.id === p.id);

        await prisma.player.update({
          where: { id: p.id },
          data: {
            seasonPoints: player.seasonPoints + p.points,
          },
        });
      }

      // have to save the team points
      for (const team of [team1.team, team2.team]) {
        const t = this.teams.find((t: any) => t.id === team.id);

        await prisma.team.update({
          where: { id: team.id },
          data: {
            seasonPoints: t.seasonPoints + (team.id === team1.team.id ? team1Points : team2Points),
          },
        });
      }
    }
  }

  private getTeamPlayers(playerIds: number[]) {
    const players = this.players.filter((p: any) => playerIds.includes(p.id));
    return players.sort((a: any, b: any) => a.rounds[0].preHandicap - b.rounds[0].preHandicap);
  }

  private processMatchup(
    player1: any,
    player2: any,
  ): [{ id: number; points: number }, { id: number; points: number }] {
    const round1 = player1.rounds[0];
    const round2 = player2.rounds[0];

    if (!round1 || !round2) {
      console.warn(`One of the players does not have a round.`);
      return [
        { id: player1.id, points: 0 },
        { id: player2.id, points: 0 },
      ];
    }

    const scores1 = round1.scores;
    const scores2 = round2.scores;
    const p1Handicap = Math.round(round1.preHandicap);
    const p2Handicap = Math.round(round2.preHandicap);
    const [p1Pops, p2Pops] = this.calculatePops(p1Handicap, p2Handicap);

    let player1Points = 0;
    let player2Points = 0;

    for (let i = 0; i < scores1.length; i++) {
      let p1Score = scores1[i].net;
      let p2Score = scores2[i].net;
      const holeNum = scores1[i].hole;

      // Apply pops
      if (p1Pops.has(holeNum)) {
        p1Score -= p1Pops.get(holeNum)!;
      }
      if (p2Pops.has(holeNum)) {
        p2Score -= p2Pops.get(holeNum)!;
      }

      if (p1Score > p2Score) {
        player1Points += this.event.ptsPerHole || 1;
      } else if (p1Score < p2Score) {
        player2Points += this.event.ptsPerHole || 1;
      } else {
        player1Points += this.event.ptsPerHole / 2;
        player2Points += this.event.ptsPerHole / 2;
      }
    }

    console.log(`Player 1 points: ${player1Points}, Player 2 points: ${player2Points}`);

    if (player1Points > player2Points) {
      player1Points += this.event.ptsPerMatch || 2;
    } else if (player2Points > player1Points) {
      player2Points += this.event.ptsPerMatch || 2;
    } else {
      player1Points += (this.event.ptsPerMatch || 2) / 2;
      player2Points += (this.event.ptsPerMatch || 2) / 2;
    }

    console.log(
      `After match points - Player 1 points: ${player1Points}, Player 2 points: ${player2Points}`,
    );

    return [
      { id: player1.id, points: player1Points },
      { id: player2.id, points: player2Points },
    ];
  }

  private calculatePops = (p1hcp: any, p2hcp: any) => {
    const hcpDiff = Math.abs(p1hcp - p2hcp);
    const numHoles = this.event.holes;
    const startingHole = this.event.startSide === 'front' ? 1 : 10;
    const holes = this.event.tee.holes.slice(startingHole - 1, startingHole - 1 + numHoles);
    const sortedHoles = [...holes].sort((a: any, b: any) => a.hcp - b.hcp);

    // Map hole number to number of pops
    const p1PopsMap = new Map<number, number>();
    const p2PopsMap = new Map<number, number>();

    let remainingPops = hcpDiff;
    let holeIndex = 0;

    while (remainingPops > 0) {
      const hole = sortedHoles[holeIndex % sortedHoles.length];
      const currentPops = (p1hcp > p2hcp ? p1PopsMap.get(hole.num) : p2PopsMap.get(hole.num)) || 0;

      if (p1hcp > p2hcp) {
        p1PopsMap.set(hole.num, currentPops + 1);
      } else if (p2hcp > p1hcp) {
        p2PopsMap.set(hole.num, currentPops + 1);
      }

      remainingPops--;
      holeIndex++;
    }

    return [p1PopsMap, p2PopsMap];
  };

  private async setEventDetailsForTeams(eventId: number) {
    const ev = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        tee: true,
        flights: {
          include: {
            players: {
              include: {
                player: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    handicap: true,
                    seasonPoints: true,
                    rounds: {
                      where: { eventId: eventId },
                      select: {
                        preHandicap: true,
                        postHandicap: true,
                        net: true,
                        gross: true,
                        scores: {
                          select: {
                            hole: true,
                            par: true,
                            gross: true,
                            net: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            teams: {
              select: {
                id: true,
                flightId: true,
                team: {
                  select: {
                    id: true,
                    name: true,
                    seasonPoints: true,
                    players: {
                      select: {
                        id: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    this.event = ev;
    this.players =
      ev?.flights.flatMap((flight: any) => flight.players.map((p: any) => p.player)) || [];
    this.teams = ev?.flights.flatMap((flight: any) => flight.teams.map((t: any) => t.team)) || [];
  }
}
