import { PrismaClient } from '@prisma/client';
export const prisma = new PrismaClient();

export class Round {
  private eventId: number;
  private playerRounds: any[];
  private event: any;
  private tee: any;
  private players: any;

  constructor(eventId: number, playerRounds: any[]) {
    this.eventId = eventId;
    this.playerRounds = playerRounds;
  }

  async process() {
    // Placeholder for round processing logic
    try {
      console.log('Processing rounds for event ID:', this.eventId);

      await this.setEventData();
      await this.processRounds();
    } catch (error) {
      console.error('Error processing rounds:', error);
    }

    return;
  }

  ////////////////////////////////////////////
  // ROUND PROCESSING
  // Calculate scores, handicaps,
  ////////////////////////////////////////////
  private async processRounds() {
    for (const pr of this.playerRounds) {
      // const pr = this.playerRounds[0]; // TEMPORARY - PROCESS ONLY FIRST ROUND
      const player = this.players.find((p: any) => p.id === pr.playerId);
      const modeledScores = this.calculateScores(pr);
      const stats = this.calculateStats(modeledScores);
      const handicapData = await this.calculateHandicapIndex(pr.playerId, stats.totalAdjusted);

      // save the round to db
      const round = await prisma.round.create({
        data: {
          eventId: this.eventId,
          playerId: pr.playerId,
          courseId: this.event.courseId,
          teeId: this.event.teeId,
          gross: stats.totalGross,
          net: stats.totalNet,
          adjusted: stats.totalAdjusted,
          putts: 0,
          courseRating: this.tee.rating,
          courseSlope: this.tee.slope,
          differential: handicapData.differential,
          preHandicap: player.handicap,
          postHandicap: handicapData.handicap,
          pointsEarned: 0,
          eagles: stats.eagles,
          birdies: stats.birdies,
          pars: stats.pars,
          bogeys: stats.bogeys,
          doubleBogeys: stats.doubleBogeys,
          tripleBogeys: stats.tripleBogeys,
          netEagles: stats.netEagles,
          netBirdies: stats.netBirdies,
          netPars: stats.netPars,
          netBogeys: stats.netBogeys,
          netDoubleBogeys: stats.netDoubleBogeys,
          netTripleBogeys: stats.netTripleBogeys,
          date: this.event.date,
          scoringFormat: this.event.scoringFormat,
          holesPlayed: this.event.holes,
        },
      });

      // save the scores to db
      await prisma.score.createMany({
        data: modeledScores.map((s: any) => ({
          eventId: this.eventId,
          playerId: pr.playerId,
          roundId: round.id,
          courseId: this.event.courseId,
          teeId: this.event.teeId,
          hole: s.hole,
          par: s.par,
          gross: s.gross,
          adjusted: s.adjusted,
          net: s.net,
          points: 0,
          putts: 0,
        })),
      });

      // update player's handicap
      await prisma.player.update({
        where: { id: player.id },
        data: { handicap: handicapData.handicap },
      });
    }
  }

  private calculateScores(playerRound: any) {
    const player = this.players.find((p: any) => p.id === playerRound.playerId);

    // Add logic to calculate scores, handicaps, etc.
    const grossScores = playerRound.scores;
    const netScores = this.calculateNet(player.handicap, grossScores);
    const ecsScores = this.calulateEquitableStrokeControl(player.handicap, grossScores);

    const modeledScores = Object.entries(grossScores).map(([holeNum, score]) => {
      const h = this.tee.holes.find((h: any) => h.num === Number(holeNum));

      if (!h) {
        throw new Error(`Hole ${holeNum} not found in tee data.`);
      }

      return {
        playerId: playerRound.playerId,
        hole: Number(holeNum),
        par: h.par,
        gross: score,
        adjusted: ecsScores[Number(holeNum)],
        net: netScores[Number(holeNum)],
      };
    });

    return modeledScores;
  }

  // TODO: ADJUST LATER IF NEEDED
  private calulateEquitableStrokeControl(playerHcp: number, scores: any) {
    const adjustedHoles: Record<number, number> = {};

    for (const [hole, score] of Object.entries(scores)) {
      const par = this.tee.holes.find((h: any) => Number(h.num) === Number(hole))?.par || 0;
      const maxAllowed =
        this.event.holes === 9 ? this.get9Ecs(playerHcp, par) : this.get18Ecs(playerHcp, par);

      adjustedHoles[Number(hole)] = Math.min(score as number, maxAllowed);
    }

    return adjustedHoles;
  }

  private get9Ecs(hcp: number, par: number) {
    hcp = Math.round(hcp);
    let maxAllowed = par + 2; // Default to Double Bogey

    if (hcp >= 5 && hcp <= 9) {
      maxAllowed = 7;
    } else if (hcp >= 10 && hcp <= 14) {
      maxAllowed = 8;
    } else if (hcp >= 15 && hcp <= 19) {
      maxAllowed = 9;
    } else if (hcp >= 20) {
      maxAllowed = 10;
    }

    return maxAllowed;
  }

  private get18Ecs(hcp: number, par: number) {
    hcp = Math.round(hcp);
    let maxAllowed = par + 2; // Default to Double Bogey

    if (hcp >= 10 && hcp <= 19) {
      maxAllowed = 7;
    } else if (hcp >= 20 && hcp <= 29) {
      maxAllowed = 8;
    } else if (hcp >= 30 && hcp <= 39) {
      maxAllowed = 9;
    } else if (hcp >= 40) {
      maxAllowed = 10;
    }

    return maxAllowed;
  }

  private calculateNet(playerHcp: number, scores: any) {
    const netScores: Record<number, number> = {};
    const pops = this.getPops(playerHcp);

    for (const [hole, score] of Object.entries(scores)) {
      const popAllowance = pops.get(Number(hole)) || 0;
      netScores[Number(hole)] = Math.max(0, (score as number) - popAllowance); // Ensure no negative scores
    }

    return netScores;
  }

  private getPops(playerHcp: number): Map<number, number> {
    const sortedHoles = [...this.tee.holes].sort((a: any, b: any) => a.hcp - b.hcp);

    const popsMap = new Map<number, number>();

    while (playerHcp > 0) {
      for (const hole of sortedHoles) {
        if (playerHcp <= 0) break;
        popsMap.set(hole.num, (popsMap.get(hole.num) || 0) + 1);
        playerHcp--;
      }
    }

    return popsMap;
  }

  private calculateStats(scores: any) {
    let stats = {
      totalGross: 0,
      totalNet: 0,
      totalAdjusted: 0,
      eagles: 0,
      birdies: 0,
      pars: 0,
      bogeys: 0,
      doubleBogeys: 0,
      tripleBogeys: 0,
      netEagles: 0,
      netBirdies: 0,
      netPars: 0,
      netBogeys: 0,
      netDoubleBogeys: 0,
      netTripleBogeys: 0,
    };

    for (const score of scores) {
      stats.totalGross += score.gross as number;
      stats.totalNet += score.net as number;
      stats.totalAdjusted += score.adjusted as number;

      // Gross stats
      const grossDiff = (score.gross as number) - score.par;
      if (grossDiff <= -2) stats.eagles++;
      else if (grossDiff === -1) stats.birdies++;
      else if (grossDiff === 0) stats.pars++;
      else if (grossDiff === 1) stats.bogeys++;
      else if (grossDiff === 2) stats.doubleBogeys++;
      else if (grossDiff >= 3) stats.tripleBogeys++;

      // Net stats
      const netDiff = score.net - score.par;
      if (netDiff <= -2) stats.netEagles++;
      else if (netDiff === -1) stats.netBirdies++;
      else if (netDiff === 0) stats.netPars++;
      else if (netDiff === 1) stats.netBogeys++;
      else if (netDiff === 2) stats.netDoubleBogeys++;
      else if (netDiff >= 3) stats.netTripleBogeys++;
    }

    return stats;
  }

  ////////////////////////////////////////////
  // EVENT DATA
  // Set event, tee, players, and teams
  ////////////////////////////////////////////
  private async setEventData() {
    const event = await prisma.event.findFirst({
      where: { id: this.eventId },
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
      throw new Error('Event not found');
    }

    this.event = event;
    this.tee = this.modelTee(event?.tee, event.holes, event.startSide);
    console.log('Modeled Tee:', this.tee);
    const players =
      event?.flights.flatMap((flight: any) => flight.players.map((p: any) => p.player)) || [];

    this.players = players;
  }

  private modelTee(tee: any, numHoles: number, startSide: string) {
    const slope =
      numHoles === 9
        ? startSide === 'front'
          ? tee.slopeFrontMen
          : tee.slopeBackMen
        : tee.slopeMen;
    const rating =
      numHoles === 9
        ? startSide === 'front'
          ? tee.ratingFrontMen
          : tee.ratingBackMen
        : tee.ratingMen;

    const holes =
      numHoles === 9
        ? startSide === 'front'
          ? tee.holes.slice(0, 9)
          : tee.holes.slice(9, 18)
        : tee.holes;

    return {
      slope,
      rating,
      holes,
    };
  }

  /////////////////////////////////////////
  // HANDICAP CALCULATIONS
  /////////////////////////////////////////
  private async calculateHandicapIndex(
    playerId: number,
    adjustedScore: number,
  ): Promise<{ handicap: number; differential: number }> {
    // last number of rounds to use
    const roundsToUse = 5;

    const player = await prisma.player.findUnique({
      where: { id: playerId },
      include: {
        rounds: {
          select: { gross: true, differential: true },
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!player) {
      throw new Error('Player not found');
    }

    // Get past differentials
    const differentials = player.rounds.map((r) => r.differential);

    // Add current differential
    const differential = Number(
      (((adjustedScore - this.tee.rating) * 113) / this.tee.slope).toFixed(2),
    );
    differentials.push(differential);

    // Sort to find lowest scores
    const sorted = differentials.sort((a, b) => a - b);

    let newHandicap: number;

    // First time player
    if (!player.handicap) {
      newHandicap = Number((differential * 0.96).toFixed(2));
    }
    // Blend in player handicap when less than roundsToUse
    else if (sorted.length < roundsToUse) {
      const sum = sorted.reduce((a, b) => a + b, 0) + player.handicap;
      const avg = sum / (sorted.length + 1); // Include handicap in count
      newHandicap = Number((avg * 0.96).toFixed(2));
    }
    // 5+ rounds: use average of lowest 5
    else {
      const lowest5 = sorted.slice(0, roundsToUse);
      const avg = lowest5.reduce((a, b) => a + b, 0) / roundsToUse;
      newHandicap = Number((avg * 0.96).toFixed(2));
    }

    const par =
      this.event.holes === 9
        ? this.event.startSide === 'front'
          ? this.tee.frontPar
          : this.tee.backPar
        : this.tee.par;
    const teeAdjustment = this.tee.rating - par || 0;
    newHandicap = Number((newHandicap + teeAdjustment).toFixed(2));

    return {
      handicap: newHandicap,
      differential,
    };
  }
}
