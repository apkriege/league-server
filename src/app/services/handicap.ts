import { prisma } from '../../prisma';
import {
  calculateCourseHandicap,
  calculateRoundDifferential,
  modelTeeForRound,
} from '../utils/tee-rating';
import { calculateHandicapIndexFromDifferentials } from '../utils/usga-handicap';
import { getHandicapHoleBasis } from '../utils/league-hole-format';

interface ProcessedRound {
  roundId: number;
  adjustedScore: number;
  differential: number;
  preHandicap: number;
  postHandicap: number;
  courseSlope: number;
  courseRating: number;
  courseHandicap: number;
}

export class Handicap {
  private playerId: number;
  private player: any;
  private processedRounds: ProcessedRound[] = [];

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
          courseRating: processed.courseRating,
          courseSlope: processed.courseSlope,
          courseHandicap: processed.courseHandicap,
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
    const handicapHoleBasis = getHandicapHoleBasis(this.player.league?.holeFormat);
    const tee = this.modelTee(
      event.tee,
      event.course?.numHoles,
      event.holes,
      event.startSide,
      this.player.gender,
    );
    const courseHandicap = calculateCourseHandicap(hcp, tee, handicapHoleBasis);

    const diff = calculateRoundDifferential(round.adjusted, tee, hcp, handicapHoleBasis);
    diffs.push(diff);

    const newHandicap = calculateHandicapIndexFromDifferentials(diffs, hcp) ?? hcp;

    this.processedRounds.push({
      roundId: round.id,
      adjustedScore: round.adjusted,
      differential: diff,
      preHandicap: hcp,
      postHandicap: newHandicap,
      courseSlope: tee.slope,
      courseRating: tee.rating,
      courseHandicap,
    });
  }

  // think about doing it potentially by date but not needed currently
  private async setPlayerWithRounds() {
    const player = await prisma.player.findUnique({
      where: { id: this.playerId },
      include: {
        league: { select: { holeFormat: true } },
        rounds: {
          include: { event: { include: { tee: true, course: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!player) {
      throw new Error(`Player with ID ${this.playerId} not found`);
    }

    this.player = player;
  }

  private modelTee(
    tee: any,
    courseHoles: number,
    numHoles: number,
    startSide: string,
    gender: string,
  ) {
    return modelTeeForRound(tee, numHoles, startSide, { courseHoles, gender });
  }
}
