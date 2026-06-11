import { prisma } from '../../prisma';

interface ProcessedRound {
  roundId: number;
  adjustedScore: number;
  differential: number;
  preHandicap: number;
  postHandicap: number;
  courseSlope: number;
  courseRating: number;
}

export class Handicap {
  private playerId: number;
  private player: any;
  private processedRounds: ProcessedRound[] = [];
  private minRounds = 5; // minimum rounds required to calculate handicap

  constructor(playerId: number) {
    this.playerId = playerId;
  }

  async runFullPlayerHandicap() {
    await this.setPlayerWithRounds();

    for (const round of this.player.rounds) {
      if (!this.processedRounds.includes(round.id)) {
        await this.processRound(round);
      }
    }

    // update the rounds with new handicap info
    for (const processed of this.processedRounds) {
      await prisma.round.update({
        where: { id: processed.roundId },
        data: {
          preHandicap: processed.preHandicap,
          postHandicap: processed.postHandicap,
          differential: processed.differential,
        },
      });
    }

    // update player with latest handicap
    const latestHandicap = this.processedRounds.length
      ? this.processedRounds[this.processedRounds.length - 1].postHandicap
      : this.player.startingHandicap;

    await prisma.player.update({
      where: { id: this.playerId },
      data: { handicap: latestHandicap },
    });
  }

  private async processRound(round: any) {
    const hcp =
      this.processedRounds.length === 0
        ? this.player.startingHandicap
        : this.processedRounds[this.processedRounds.length - 1].postHandicap;
    const diffs = this.processedRounds.map((r) => r.differential);
    const event = round.event;
    const tee = this.modelTee(event.tee, event.holes, event.startSide);

    const diff = Number((((round.adjusted - tee.rating) * 113) / tee.slope).toFixed(2));
    diffs.push(diff);

    const sortedDiffs = diffs.sort((a, b) => a - b);

    let newHandicap: number;

    // First time player
    if (!this.player.handicap) {
      newHandicap = Number((diff * 0.96).toFixed(2));
    }
    // Blend in player handicap when less than roundsToUse
    else if (sortedDiffs.length < this.minRounds) {
      const sum = sortedDiffs.reduce((a, b) => a + b, 0) + hcp;
      const avg = sum / (sortedDiffs.length + 1);
      newHandicap = Number((avg * 0.96).toFixed(2));
    }
    // 5+ rounds: use average of lowest 5
    else {
      const lowest5 = sortedDiffs.slice(0, this.minRounds);
      const avg = lowest5.reduce((a, b) => a + b, 0) / this.minRounds;
      newHandicap = Number((avg * 0.96).toFixed(2));
    }

    const par =
      event.holes === 9
        ? event.startSide === 'front'
          ? event.tee.frontPar
          : event.tee.backPar
        : event.tee.par;
    const teeAdjustment = event.tee.rating - par || 0;
    newHandicap = Number((newHandicap + teeAdjustment).toFixed(2));

    this.processedRounds.push({
      roundId: round.id,
      adjustedScore: round.adjusted,
      differential: diff,
      preHandicap: hcp,
      postHandicap: newHandicap,
      courseSlope: tee.slope,
      courseRating: tee.rating,
    });
  }

  // think about doing it potentially by date but not needed currently
  private async setPlayerWithRounds() {
    const player = await prisma.player.findUnique({
      where: { id: this.playerId },
      include: {
        rounds: {
          include: { event: { include: { tee: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!player) {
      throw new Error(`Player with ID ${this.playerId} not found`);
    }

    this.player = player;
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
}
