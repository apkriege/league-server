import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { Scoring } from '../utils/scoring';
import { Round } from '../utils/round';
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

// class Scoring {
//   private event: any;
//   private tee: any;
//   private players: any;
//   private teams: any;
//   private scores: any;

//   constructor(event: any, scores: any) {
//     this.event = event;
//     this.tee = event.tee;
//     this.scores = scores;
//     this.players = event.flights.flatMap((flight: any) => flight.players.map((p: any) => p.player));
//     this.teams = event.flights.flatMap((flight: any) => flight.teams.map((t: any) => t.team));
//   }

//   async run() {
//     try {
//       await this.saveScores();
//     } catch (error) {
//       console.error('Error in scoring process:', error);
//       throw error;
//     }
//   }

//   private async saveScores() {
//     for (const score of this.scores) {
//       await this.modelPlayer(score.playerId, score.scores);
//     }
//   }

//   private async modelPlayer(playerId: number, playerScores: any) {
//     const player = this.players.find((p: any) => p.id === playerId);
//     const scores = this.modelScores(player, playerScores);
//     const stats = this.calculateStats(scores);
//     const rating =
//       this.event.holes === 9
//         ? this.event.startSide === 'front'
//           ? this.tee.ratingFrontMen
//           : this.tee.ratingBackMen
//         : this.tee.ratingMen;
//     const slope =
//       this.event.holes === 9
//         ? this.event.startSide === 'front'
//           ? this.tee.slopeFrontMen
//           : this.tee.slopeBackMen
//         : this.tee.slopeMen;

//     // will change this to adjusted gross score later
//     const { handicap, differential } = await this.calculateHandicapIndex(
//       playerId,
//       stats.totalAdjusted,
//       this.tee.ratingMen,
//       this.tee.slopeMen,
//     );

//     const newScore = await prisma.score.create({
//       data: {
//         eventId: this.event.id,
//         playerId: player.id,
//         courseId: this.event.courseId,
//         teeId: this.event.teeId,
//         score: stats.totalGross,
//         net: stats.totalNet,
//         adjusted: stats.totalAdjusted,
//         putts: 0, // TODO: implement putts tracking
//         courseRating: rating,
//         courseSlope: slope,
//         differential: Number(differential.toFixed(2)),
//         preHandicap: Number(player.handicap.toFixed(2)),
//         postHandicap: Number(handicap.toFixed(2)),
//         pointsEarned: 0,
//         eagles: stats.eagles,
//         birdies: stats.birdies,
//         pars: stats.pars,
//         bogeys: stats.bogeys,
//         doubleBogeys: stats.doubleBogeys,
//         netEagles: stats.netEagles,
//         netBirdies: stats.netBirdies,
//         netPars: stats.netPars,
//         netBogeys: stats.netBogeys,
//         netDoubleBogeys: stats.netDoubleBogeys,
//       },
//     });

//     await prisma.scores.createMany({
//       data: scores.map((s: any) => ({
//         eventId: this.event.id,
//         playerId: s.playerId,
//         scoreId: newScore.id,
//         courseId: this.event.courseId,
//         teeId: this.event.teeId,
//         hole: s.hole,
//         par: s.par,
//         score: s.score,
//         net: s.net,
//         adjusted: s.adjusted,
//         points: 0,
//       })),
//     });

//     // update player's handicap
//     await prisma.player.update({
//       where: { id: player.id },
//       data: { handicap: Number(handicap.toFixed(2)) },
//     });
//   }

//   private async calculateHandicapIndex(
//     playerId: number,
//     score: number,
//     rating: number,
//     slope: number,
//   ): Promise<{ handicap: number; differential: number }> {
//     // last number of rounds to use
//     const roundsToUse = 5;

//     const player = await prisma.player.findUnique({
//       where: { id: playerId },
//       include: {
//         scores: {
//           select: { score: true, differential: true },
//           take: 5,
//           orderBy: { createdAt: 'desc' },
//         },
//       },
//     });

//     if (!player) {
//       throw new Error('Player not found');
//     }

//     // Get past differentials
//     const differentials = player.scores.map((s) => s.differential);

//     // Add current differential
//     const differential = Number((((score - rating) * 113) / slope).toFixed(2));
//     differentials.push(differential);

//     // Sort to find lowest scores
//     const sorted = differentials.sort((a, b) => a - b);

//     let newHandicap: number;

//     // First time player
//     if (!player.handicap) {
//       newHandicap = Math.round(differential * 0.96);
//     }
//     // Blend in player handicap when less than roundsToUse
//     else if (sorted.length < roundsToUse) {
//       const sum = sorted.reduce((a, b) => a + b, 0) + player.handicap;
//       const avg = sum / (sorted.length + 1); // Include handicap in count
//       newHandicap = Math.round(avg * 0.96);
//     }
//     // 5+ rounds: use average of lowest 5
//     else {
//       const lowest5 = sorted.slice(0, roundsToUse);
//       const avg = lowest5.reduce((a, b) => a + b, 0) / roundsToUse;
//       newHandicap = Math.round(avg * 0.96);
//     }

//     return {
//       handicap: newHandicap,
//       differential,
//     };
//   }

//   private modelScores(player: any, scores: Record<number, number>) {
//     const netScores = this.calculateNetScores(player.handicap, scores);
//     const adjustedScores = this.calculateAdjustedScores(player.handicap, scores);
//     const modeledScores = Object.entries(scores).map(([hole, score]) => {
//       const h = this.tee.holes.find((ho: any) => ho.num === parseInt(hole));

//       return {
//         playerId: player.id,
//         hole: parseInt(hole),
//         par: h ? h.par : 4,
//         score: score,
//         net: netScores[parseInt(hole)],
//         adjusted: adjustedScores[parseInt(hole)],
//       };
//     });

//     return modeledScores;
//   }

//   private calculateNetScores(playerHcp: number, scores: Record<number, number>) {
//     const netScores = {} as Record<number, number>;
//     const popsMap = this.calculatePops(
//       playerHcp,
//       this.tee.holes,
//       this.event.startSide,
//       this.event.holes,
//     );

//     for (const [hole, score] of Object.entries(scores)) {
//       const holeNumber = Number(hole);
//       const strokesOnHole = popsMap.get(holeNumber) || 0;
//       netScores[holeNumber] = Math.max(0, (score as number) - strokesOnHole);
//     }

//     return netScores;
//   }

//   private calculateAdjustedScores(playerHcp: number, scores: Record<number, number>) {
//     const adjustedHoles = {} as Record<number, number>;

//     for (const [hole, score] of Object.entries(scores)) {
//       const par = this.tee.holes.find((h: any) => Number(h.num) === Number(hole))?.par || 0;
//       let maxAllowed = par + 2; // Default to Double Bogey;

//       if (playerHcp >= 36) {
//         maxAllowed = par + 3;
//       }

//       adjustedHoles[Number(hole)] = Math.min(score as number, maxAllowed);
//     }

//     return adjustedHoles;
//   }

//   // calculate number of pops (handicap strokes) per hole
//   private calculatePops(hcp: number, holes: any, side: 'front' | 'back', numHoles: number) {
//     const startingHole = side === 'front' ? 1 : 10;
//     const holesToUse = holes.filter(
//       (hole: any) => hole.num >= startingHole && hole.num < startingHole + numHoles,
//     );

//     const sortedHoles = [...holesToUse].sort((a, b) => a.hcp - b.hcp);
//     const popsMap = new Map<number, number>();

//     while (hcp > 0) {
//       for (const hole of sortedHoles) {
//         if (hcp <= 0) break;
//         popsMap.set(hole.num, (popsMap.get(hole.num) || 0) + 1);
//         hcp--;
//       }
//     }

//     return popsMap;
//   }

//   private calculateStats(scores: any) {
//     let stats = {
//       totalGross: 0,
//       totalNet: 0,
//       totalAdjusted: 0,
//       eagles: 0,
//       birdies: 0,
//       pars: 0,
//       bogeys: 0,
//       doubleBogeys: 0,
//       netEagles: 0,
//       netBirdies: 0,
//       netPars: 0,
//       netBogeys: 0,
//       netDoubleBogeys: 0,
//     };

//     for (const score of scores) {
//       stats.totalGross += score.score as number;
//       stats.totalNet += score.net as number;
//       stats.totalAdjusted += score.adjusted as number;

//       // Gross stats
//       const grossDiff = (score.score as number) - score.par;
//       if (grossDiff <= -2) stats.eagles++;
//       else if (grossDiff === -1) stats.birdies++;
//       else if (grossDiff === 0) stats.pars++;
//       else if (grossDiff === 1) stats.bogeys++;
//       else if (grossDiff >= 2) stats.doubleBogeys++;

//       // Net stats
//       const netDiff = score.net - score.par;
//       if (netDiff <= -2) stats.netEagles++;
//       else if (netDiff === -1) stats.netBirdies++;
//       else if (netDiff === 0) stats.netPars++;
//       else if (netDiff === 1) stats.netBogeys++;
//       else if (netDiff >= 2) stats.netDoubleBogeys++;
//     }

//     return stats;
//   }
// }

// const calculateHoleWinner = async (
//   p1ScoreId: number,
//   p2ScoreId: number,
//   p1Net: number,
//   p2Net: number,
//   hole: number,
//   ptsPerHole: number,
// ): Promise<[number, number]> => {
//   let p1Points = 0;
//   let p2Points = 0;

//   if (p1Net < p2Net) {
//     p1Points = ptsPerHole;
//   } else if (p2Net < p1Net) {
//     p2Points = ptsPerHole;
//   } else {
//     p1Points = ptsPerHole / 2;
//     p2Points = ptsPerHole / 2;
//   }

//   await updateHolePoints(p1ScoreId, hole, p1Points);
//   await updateHolePoints(p2ScoreId, hole, p2Points);
//   return [p1Points, p2Points];
// };

// const calculatePoints = async (eventId: number) => {
//   const event = await prisma.event.findUnique({
//     where: { id: eventId },
//     include: {
//       flights: {
//         include: {
//           teams: {
//             include: {
//               team: {
//                 include: {
//                   players: {
//                     include: {
//                       scores: {
//                         where: { eventId },
//                         include: {
//                           scores: true,
//                         },
//                       },
//                     },
//                   },
//                 },
//               },
//             },
//           },
//         },
//       },
//     },
//   });

//   if (!event) {
//     throw new Error('Event not found');
//   }

//   const flights = event.flights;

//   for (const flight of flights) {
//     const team1 = flight.teams[0].team;
//     const team2 = flight.teams[1].team;

//     if (!team1 || !team2) continue;

//     // this has to be based on the pre handicap
//     const t1Players = team1.players.sort(
//       (a, b) => a.scores[0].preHandicap - b.scores[0].preHandicap,
//     );
//     const t1A = t1Players[0];
//     const t1B = t1Players[1];

//     const t2Players = team2.players.sort(
//       (a, b) => a.scores[0].preHandicap - b.scores[0].preHandicap,
//     );
//     const t2A = t2Players[0];
//     const t2B = t2Players[1];

//     await updatePlayerOpponent(t1A.scores[0].id, t2A.id);
//     await updatePlayerOpponent(t1B.scores[0].id, t2A.id);
//     await updatePlayerOpponent(t2A.scores[0].id, t1A.id);
//     await updatePlayerOpponent(t2B.scores[0].id, t1B.id);

//     let t1Ascore = 0;
//     let t1Bscore = 0;
//     let t2Ascore = 0;
//     let t2Bscore = 0;

//     for (const score of t1A.scores[0].scores) {
//       const t1ANet = score.net;
//       const t2ANet = t2A.scores[0].scores.find((s: any) => s.hole === score.hole)?.net || 0;
//       const [p1Points, p2Points] = await calculateHoleWinner(
//         t1A.scores[0].id,
//         t2A.scores[0].id,
//         t1ANet,
//         t2ANet,
//         score.hole,
//         event.ptsPerHole,
//       );
//       t1Ascore += p1Points;
//       t2Ascore += p2Points;
//     }

//     if (t1Ascore > t2Ascore) {
//       t1Ascore += event.ptsPerMatch;
//     } else if (t1Ascore < t2Ascore) {
//       t2Ascore += event.ptsPerMatch;
//     } else {
//       t1Ascore += event.ptsPerMatch / 2;
//       t2Ascore += event.ptsPerMatch / 2;
//     }

//     for (const score of t1B.scores[0].scores) {
//       const t1BNet = score.net;
//       const t2BNet = t2B.scores[0].scores.find((s: any) => s.hole === score.hole)?.net || 0;
//       const [p1Points, p2Points] = await calculateHoleWinner(
//         t1B.scores[0].id,
//         t2B.scores[0].id,
//         t1BNet,
//         t2BNet,
//         score.hole,
//         event.ptsPerHole,
//       );
//       t1Bscore += p1Points;
//       t2Bscore += p2Points;
//     }

//     if (t1Bscore > t2Bscore) {
//       t1Bscore += event.ptsPerMatch;
//     } else if (t1Bscore < t2Bscore) {
//       t2Bscore += event.ptsPerMatch;
//     } else {
//       t1Bscore += event.ptsPerMatch / 2;
//       t2Bscore += event.ptsPerMatch / 2;
//     }

//     let t1Total = t1Ascore + t1Bscore;
//     let t2Total = t2Ascore + t2Bscore;

//     if (t1Total > t2Total) {
//       t1Total += event.ptsPerTeamWin;
//     } else if (t1Total < t2Total) {
//       t2Total += event.ptsPerTeamWin;
//     } else {
//       t1Total += event.ptsPerTeamWin / 2;
//       t2Total += event.ptsPerTeamWin / 2;
//     }

//     // Update player points
//     await updatePlayerPoints(t1A.scores[0].id, t1Ascore);
//     await updatePlayerPoints(t1B.scores[0].id, t1Bscore);
//     await updatePlayerPoints(t2A.scores[0].id, t2Ascore);
//     await updatePlayerPoints(t2B.scores[0].id, t2Bscore);

//     // Update team points
//     await updateTeamPoints(team1.id, t1Total);
//     await updateTeamPoints(team2.id, t2Total);
//   }
// };

// const updatePlayerOpponent = async (scoreId: number, opponentId: number) => {
//   await prisma.score.update({
//     where: { id: scoreId },
//     data: {
//       opponentId,
//     },
//   });
// };

// const updatePlayerPoints = async (scoreId: number, points: number) => {
//   await prisma.score.update({
//     where: { id: scoreId },
//     data: {
//       pointsEarned: points,
//     },
//   });
// };

// const updateHolePoints = async (scoreId: number, hole: number, points: number) => {
//   await prisma.scores.update({
//     where: {
//       scoreId_hole: {
//         scoreId,
//         hole,
//       },
//     },
//     data: {
//       points,
//     },
//   });
// };

// const updateTeamPoints = async (teamId: number, points: number) => {
//   await prisma.team.update({
//     where: { id: teamId },
//     data: {
//       seasonPoints: {
//         increment: points,
//       },
//     },
//   });
// };

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
      // console.log(rounds);

      // if (!event) {
      //   return res.status(404).json({ message: 'Event not found' });
      // }

      // // set up tee slope and rating
      // if (event.holes === 9) {
      //   event.tee.slopeMen =
      //     event.startSide === 'front' ? event.tee.slopeFrontMen : event.tee.slopeBackMen;
      //   event.tee.ratingMen =
      //     event.startSide === 'front' ? event.tee.ratingFrontMen : event.tee.ratingBackMen;
      // }

      // const scoring = new Scoring(Number(eventId), playerRounds);
      // await scoring.run();

      // calculate points for players and teams
      // await calculatePoints(event.id);

      // mark event as completed
      // await prisma.event.update({
      //   where: { id: event.id },
      //   data: { status: 'completed', completed: true },
      // });

      res.status(201).json({ message: 'Scores saved and event compeleted' });
    } catch (error) {
      console.error('Score creation error:', error);
      res
        .status(500)
        .json({ message: error instanceof Error ? error.message : 'Internal server error' });
    }
  };
}
