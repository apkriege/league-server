import { prisma } from '../../prisma';
import { calculateStrokePops } from '../utils/tee-rating';
import { modelEventTeeForRound } from '../utils/event-route';
import { dateOnlyInTimeZone } from '../utils/time-zone';

export class Round {
  private eventId: number;
  private playerRound: any;
  private event: any;
  private tee: any;
  private player: any;
  private playerHandicap = 0;
  private isEdit = false;
  private round?: any;
  private db: any;

  constructor(eventId: number, playerRound: any, round?: any, db: any = prisma) {
    this.eventId = eventId;
    this.playerRound = playerRound;
    this.round = round;
    this.isEdit = Boolean(round);
    this.db = db;
  }

  async process() {
    try {
      await this.setPlayer();
      await this.setEventData();

      if (this.isEdit && this.round.id) {
        await this.updateRound(this.round.id, this.playerRound);
      } else {
        await this.createRound();
      }
    } catch (error) {
      console.error('Error processing rounds:', error);
      throw error;
    }
  }

  ////////////////////////////////////////////
  // ROUND PROCESSING
  // Calculate scores, handicaps,
  ////////////////////////////////////////////
  private async createRound() {
    const existingRound = await this.checkForExistingRound(this.playerRound.playerId, this.eventId);
    if (existingRound) {
      throw new Error('Round already exists for this player and event');
    }

    const pr = this.playerRound;
    const modeledScores = this.calculateScores(pr);
    const stats = this.calculateStats(modeledScores);

    // save the round to db
    const round = await this.db.round.create({
      data: {
        eventId: this.eventId,
        playerId: pr.playerId,
        opponentId: pr.opponentId,
        courseId: this.event.courseId,
        teeId: this.event.teeId,
        status: 'completed',
        gross: stats.totalGross,
        net: stats.totalNet,
        adjusted: stats.totalAdjusted,
        putts: 0,
        courseRating: this.tee.rating,
        courseSlope: this.tee.slope,
        playingHandicap: Math.round(this.playerHandicap),
        pointsEarned: this.playerRound.points || 0,
        matchPoints: this.playerRound.matchPoints || 0,
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
        date: dateOnlyInTimeZone(this.event.startsAt, this.event.timeZone),
        holesPlayed: this.event.holes,
      },
    });

    // save the scores to db
    await this.db.score.createMany({
      data: modeledScores.map((s: any) => ({
        roundId: round.id,
        hole: s.hole,
        par: s.par,
        gross: s.gross,
        adjusted: s.adjusted,
        net: s.net,
        points: 0,
        putts: 0,
      })),
    });

    return round;
  }

  private async updateRound(roundId: number, newRound: any) {
    const round = await this.db.round.findUnique({
      where: { id: roundId },
    });

    if (!round) {
      throw new Error('Round not found for update');
    }

    // For now, we will only allow updating scores and recalculating stats/handicap.
    const modeledScores = this.calculateScores(newRound);
    const stats = this.calculateStats(modeledScores);

    const r = await this.db.round.update({
      where: { id: roundId },
      data: {
        gross: stats.totalGross,
        net: stats.totalNet,
        adjusted: stats.totalAdjusted,
        courseRating: this.tee.rating,
        courseSlope: this.tee.slope,
        playingHandicap: Math.round(this.playerHandicap),
        pointsEarned: this.playerRound.points || 0,
        matchPoints: this.playerRound.matchPoints || 0,
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
      },
    });

    // Update scores
    for (const score of modeledScores) {
      await this.db.score.update({
        where: {
          roundId_hole: {
            roundId,
            hole: score.hole,
          },
        },
        data: {
          gross: score.gross as number,
          adjusted: score.adjusted,
          net: score.net,
        },
      });
    }

    return r;
  }

  private checkForExistingRound(playerId: number, eventId: number) {
    return this.db.round.findUnique({
      where: {
        eventId_playerId: {
          eventId,
          playerId,
        },
      },
    });
  }

  private calculateScores(playerRound: any) {
    const hcp = this.playerHandicap;
    const grossScores = playerRound.scores;
    if (!grossScores || Array.isArray(grossScores) || typeof grossScores !== 'object') {
      throw new Error('Scores must include a value for every hole.');
    }

    const expectedHoleNumbers = new Set(this.tee.holes.map((hole: any) => Number(hole.num)));
    const submittedEntries = Object.entries(grossScores);
    const hasInvalidScore = submittedEntries.some(([hole, score]) => {
      const numericScore = Number(score);
      return (
        !expectedHoleNumbers.has(Number(hole)) ||
        !Number.isInteger(numericScore) ||
        numericScore < 1 ||
        numericScore > 30
      );
    });
    if (hasInvalidScore || submittedEntries.length !== expectedHoleNumbers.size) {
      throw new Error('Scores must contain one valid stroke total for every hole.');
    }
    const netScores = this.getNetScores(hcp, grossScores);
    const ecsScores = this.calculateEquitableStrokeControl(hcp, grossScores);

    return Object.entries(grossScores).map(([holeNum, score]) => {
      const h = this.tee.holes.find((h: any) => h.num === Number(holeNum));

      if (!h) {
        throw new Error(`Hole ${holeNum} not found in tee data.`);
      }

      return {
        playerId: playerRound.playerId,
        hole: Number(holeNum),
        par: h.par,
        gross: Number(score),
        adjusted: ecsScores[Number(holeNum)],
        net: netScores[Number(holeNum)],
      };
    });
  }

  private getNetScores(playerHcp: number, scores: any) {
    const netScores: Record<number, number> = {};
    const pops = this.getPops(playerHcp);

    for (const [hole, score] of Object.entries(scores)) {
      const popAllowance = pops.get(Number(hole)) || 0;
      netScores[Number(hole)] = Math.max(0, (score as number) - popAllowance); // Ensure no negative scores
    }

    return netScores;
  }

  private calculateEquitableStrokeControl(playerHcp: number, scores: any) {
    const adjustedHoles: Record<number, number> = {};
    const pops = this.getPops(playerHcp);

    for (const [hole, score] of Object.entries(scores)) {
      const par = this.tee.holes.find((h: any) => Number(h.num) === Number(hole))?.par || 0;
      const maxAllowed = par + 2 + (pops.get(Number(hole)) || 0);

      adjustedHoles[Number(hole)] = Math.min(score as number, maxAllowed);
    }

    return adjustedHoles;
  }

  private getPops(playerHcp: number): Map<number, number> {
    return calculateStrokePops(playerHcp, this.tee.holes);
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

  // SET PLAYER
  private async setPlayer() {
    const player = await this.db.player.findFirst({
      where: { id: this.playerRound.playerId, deletedAt: null },
    });

    if (!player) {
      throw new Error(`Player with ID ${this.playerRound.playerId} not found`);
    }

    this.player = player;
  }

  // SET EVENT DATA
  private async setEventData() {
    const event = await this.db.event.findFirst({
      where: { id: this.eventId, deletedAt: null },
      include: {
        course: true,
        tee: true,
        routeSegments: {
          orderBy: { position: 'asc' },
          include: { course: true, tee: true },
        },
      },
    });

    if (!event) {
      throw new Error('Event not found');
    }

    this.event = event;
    this.tee = modelEventTeeForRound(event, this.player.gender);
    this.playerHandicap = Number(
      this.isEdit ? this.round?.preHandicap : this.player.handicap,
    );
    if (!Number.isFinite(this.playerHandicap)) {
      throw new Error('Player handicap must be numeric.');
    }
  }

}
