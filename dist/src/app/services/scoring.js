"use strict";
// import { PrismaClient } from '@prisma/client';
// export const prisma = new PrismaClient();
// // gameplan
// // first get event details - players, teams, format, scoring format
// //
// // process each players round
// export class Scoring {
//   private eventId: number;
//   private targetPlayerIds?: Set<number>;
//   private targetFlightIds?: Set<number>;
//   private event: any;
//   private players: any;
//   private teams: any;
//   private normalizeHalfPoint = (value: number) => Math.round(Number(value || 0) * 2) / 2;
//   constructor(eventId: number, targetPlayerIds?: number[], targetFlightIds?: number[]) {
//     this.eventId = eventId;
//     this.targetPlayerIds =
//       targetPlayerIds && targetPlayerIds.length > 0
//         ? new Set(
//             targetPlayerIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0),
//           )
//         : undefined;
//     this.targetFlightIds =
//       targetFlightIds && targetFlightIds.length > 0
//         ? new Set(
//             targetFlightIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0),
//           )
//         : undefined;
//   }
//   async run() {
//     try {
//       await this.setEventDetailsForTeams(this.eventId);
//       if (!this.event) {
//         console.error('Event not found');
//         return;
//       }
//       const format = this.event.format; // 'individual' | 'team'
//       const scoringFormat = this.event.scoringFormat; // 'stroke' | 'match'
//       if (format === 'individual' && scoringFormat === 'stroke') {
//         await this.processIndividualStrokeplay();
//       } else if (format === 'individual' && scoringFormat === 'match') {
//         await this.processIndividualMatchplay();
//       } else if (format === 'team' && scoringFormat === 'stroke') {
//         await this.processTeamStrokeplay();
//       } else if (format === 'team' && scoringFormat === 'match') {
//         await this.processTeamMatchplay();
//       } else {
//         console.error('Unknown event or scoring format');
//       }
//     } catch (error) {
//       console.error('Error during scoring process:', error);
//     }
//   }
//   private async processIndividualStrokeplay() {}
//   private async processIndividualMatchplay() {}
//   private async processTeamStrokeplay() {}
//   private async processTeamMatchplay() {
//     const flights = (this.event.flights || []).filter((flight: any) => {
//       if (this.targetFlightIds && !this.targetFlightIds.has(Number(flight.id))) {
//         return false;
//       }
//       if (!this.targetPlayerIds) return true;
//       return (flight.players || []).some((fp: any) =>
//         this.targetPlayerIds!.has(Number(fp.playerId)),
//       );
//     });
//     for (const flight of flights) {
//       const teams = flight.teams || [];
//       const team1 = teams[0];
//       const team2 = teams[1];
//       if (!team1 || !team2) {
//         console.warn(`Flight ${flight.id} does not have two teams.`);
//         continue;
//       }
//       // Match frontend behavior: use players assigned to this flight for each team and pair by handicap.
//       const t1Players = this.getFlightTeamPlayers(flight, team1.team.id);
//       const t2Players = this.getFlightTeamPlayers(flight, team2.team.id);
//       const matchups = this.buildMatchups(t1Players, t2Players);
//       const matchupCount = matchups.length;
//       if (matchupCount === 0) {
//         console.warn(`Flight ${flight.id} does not have any valid team matchups.`);
//         continue;
//       }
//       const teamPlayerResults = new Map<number, { points: number; matchPoints: number }>();
//       const opponentByPlayerId = new Map<number, number>();
//       const popsByPlayerId = new Map<number, Map<number, number>>();
//       // Match frontend behavior: players without a valid matchup should contribute 0 player points.
//       for (const p of [...t1Players, ...t2Players]) {
//         teamPlayerResults.set(Number(p.id), { points: 0, matchPoints: 0 });
//       }
//       for (const [leftPlayer, rightPlayer] of matchups) {
//         const leftRound = leftPlayer?.rounds?.[0];
//         const rightRound = rightPlayer?.rounds?.[0];
//         const leftPreHandicap = Math.round(
//           Number(leftRound?.preHandicap ?? leftPlayer?.handicap ?? 0),
//         );
//         const rightPreHandicap = Math.round(
//           Number(rightRound?.preHandicap ?? rightPlayer?.handicap ?? 0),
//         );
//         const [leftPops, rightPops] = this.calculatePops(leftPreHandicap, rightPreHandicap);
//         popsByPlayerId.set(Number(leftPlayer.id), leftPops);
//         popsByPlayerId.set(Number(rightPlayer.id), rightPops);
//         const [t1p, t2p] = this.processMatchup(leftPlayer, rightPlayer, leftPops, rightPops);
//         teamPlayerResults.set(Number(t1p.id), {
//           points: Number(t1p.points || 0),
//           matchPoints: Number(t1p.matchPoints || 0),
//         });
//         teamPlayerResults.set(Number(t2p.id), {
//           points: Number(t2p.points || 0),
//           matchPoints: Number(t2p.matchPoints || 0),
//         });
//         opponentByPlayerId.set(Number(t1p.id), Number(t2p.id));
//         opponentByPlayerId.set(Number(t2p.id), Number(t1p.id));
//       }
//       // Match frontend `getTeamNetTotal`: sum each player's own scored holes and subtract matchup pops.
//       const team1NetTotal = t1Players.reduce(
//         (sum: number, p: any) =>
//           sum + this.getPlayerNetTotalWithPops(p, popsByPlayerId.get(Number(p.id))),
//         0,
//       );
//       const team2NetTotal = t2Players.reduce(
//         (sum: number, p: any) =>
//           sum + this.getPlayerNetTotalWithPops(p, popsByPlayerId.get(Number(p.id))),
//         0,
//       );
//       let team1WinBonus = 0;
//       let team2WinBonus = 0;
//       const pointsPerTeamWin = Number(this.event.ptsPerTeamWin) || 0;
//       if (pointsPerTeamWin > 0) {
//         // Match frontend behavior: if no valid net totals were produced, no team-win bonus.
//         if (!(team1NetTotal === 0 && team2NetTotal === 0)) {
//           if (team1NetTotal < team2NetTotal) {
//             team1WinBonus = pointsPerTeamWin;
//           } else if (team2NetTotal < team1NetTotal) {
//             team2WinBonus = pointsPerTeamWin;
//           } else {
//             team1WinBonus = pointsPerTeamWin / 2;
//             team2WinBonus = pointsPerTeamWin / 2;
//           }
//         }
//       }
//       // Save points for all scoped flight players and keep season totals idempotent via round delta.
//       for (const [playerId, playerResult] of teamPlayerResults.entries()) {
//         const p = {
//           id: playerId,
//           points: this.normalizeHalfPoint(Number(playerResult.points || 0)),
//           matchPoints: this.normalizeHalfPoint(Number(playerResult.matchPoints || 0)),
//         };
//         const player = this.players.find((pl: any) => pl.id === p.id);
//         const round = player?.rounds?.[0];
//         if (!player || !round) continue;
//         const existingPoints = Number(round.pointsEarned || 0);
//         const delta = Number(p.points || 0) - existingPoints;
//         await prisma.$transaction([
//           prisma.round.update({
//             where: {
//               eventId_playerId: {
//                 eventId: this.eventId,
//                 playerId: p.id,
//               },
//             },
//             data: {
//               pointsEarned: Number(p.points || 0),
//               opponentId: opponentByPlayerId.get(Number(p.id)) || null,
//               ...({ matchPoints: Number(p.matchPoints || 0) } as any),
//             },
//           }),
//           prisma.player.update({
//             where: { id: p.id },
//             data: {
//               seasonPoints: {
//                 increment: delta,
//               },
//             },
//           }),
//         ]);
//       }
//       // have to save the team points
//       for (const team of [team1.team, team2.team]) {
//         // Team event points should only store the team win/tie bonus (ptsPerTeamWin), not player matchup totals.
//         const weeklyPoints = this.normalizeHalfPoint(
//           team.id === team1.team.id ? team1WinBonus : team2WinBonus,
//         );
//         const existingWeekly = await prisma.team_event_points.findUnique({
//           where: {
//             teamId_eventId: {
//               teamId: team.id,
//               eventId: this.eventId,
//             },
//           },
//         });
//         const delta = weeklyPoints - (existingWeekly?.points || 0);
//         await prisma.$transaction([
//           prisma.team_event_points.upsert({
//             where: {
//               teamId_eventId: {
//                 teamId: team.id,
//                 eventId: this.eventId,
//               },
//             },
//             create: {
//               leagueId: this.event.leagueId,
//               teamId: team.id,
//               eventId: this.eventId,
//               points: weeklyPoints,
//             },
//             update: {
//               points: weeklyPoints,
//             },
//           }),
//           prisma.team.update({
//             where: { id: team.id },
//             data: {
//               seasonPoints: {
//                 increment: delta,
//               },
//             },
//           }),
//         ]);
//       }
//     }
//   }
//   private getFlightTeamPlayers(flight: any, teamId: number) {
//     const players = (flight.players || [])
//       .filter((fp: any) => Number(fp.teamId) === Number(teamId))
//       .map((fp: any) => fp.player)
//       .filter((p: any) => Boolean(p));
//     // Match frontend `byHandicap` ordering in ScoresForm.
//     return players.sort(
//       (a: any, b: any) =>
//         Math.round(Number(a?.handicap ?? 999)) - Math.round(Number(b?.handicap ?? 999)),
//     );
//   }
//   private buildMatchups(t1Players: any[], t2Players: any[]) {
//     const remainingTeam2 = [...t2Players];
//     const pairs: Array<[any, any]> = [];
//     const pairedTeam1Ids = new Set<number>();
//     const pickOpponent = (p1: any) => {
//       const directOpponentId = Number(p1?.rounds?.[0]?.opponentId || 0);
//       if (directOpponentId > 0) {
//         const directIdx = remainingTeam2.findIndex((p2: any) => Number(p2.id) === directOpponentId);
//         if (directIdx !== -1) return remainingTeam2.splice(directIdx, 1)[0];
//       }
//       const reverseIdx = remainingTeam2.findIndex(
//         (p2: any) => Number(p2?.rounds?.[0]?.opponentId || 0) === Number(p1.id),
//       );
//       if (reverseIdx !== -1) return remainingTeam2.splice(reverseIdx, 1)[0];
//       if (remainingTeam2.length === 0) return null;
//       return remainingTeam2.shift();
//     };
//     for (const p1 of t1Players) {
//       const p2 = pickOpponent(p1);
//       if (!p2) break;
//       pairedTeam1Ids.add(Number(p1.id));
//       pairs.push([p1, p2]);
//     }
//     // If team sizes differ, only keep valid 1:1 pairings.
//     return pairs;
//   }
//   private processMatchup(
//     player1: any,
//     player2: any,
//     p1Pops?: Map<number, number>,
//     p2Pops?: Map<number, number>,
//   ): [
//     { id: number; points: number; matchPoints: number; net: number },
//     { id: number; points: number; matchPoints: number; net: number },
//   ] {
//     const round1 = player1.rounds[0];
//     const round2 = player2.rounds[0];
//     if (!round1 || !round2) {
//       console.warn(`One of the players does not have a round.`);
//       return [
//         { id: player1.id, points: 0, matchPoints: 0, net: 0 },
//         { id: player2.id, points: 0, matchPoints: 0, net: 0 },
//       ];
//     }
//     const scores1 = round1.scores;
//     const scores2 = round2.scores;
//     if (!p1Pops || !p2Pops) {
//       const p1Handicap = Math.round(round1.preHandicap);
//       const p2Handicap = Math.round(round2.preHandicap);
//       [p1Pops, p2Pops] = this.calculatePops(p1Handicap, p2Handicap);
//     }
//     const pointsPerHole = Number(this.event?.ptsPerHole) || 0;
//     const pointsPerMatch = Number(this.event?.ptsPerMatch) || 0;
//     let player1Points = 0;
//     let player2Points = 0;
//     let player1MatchPoints = 0;
//     let player2MatchPoints = 0;
//     let p1NetTotal = 0;
//     let p2NetTotal = 0;
//     let playedHoles = 0;
//     const p2ByHole = new Map<number, any>(scores2.map((s: any) => [Number(s.hole), s]));
//     for (const s1 of scores1) {
//       const holeNum = Number(s1.hole);
//       const s2 = p2ByHole.get(holeNum);
//       if (!s2) continue;
//       // Use gross values and apply matchup pops once, matching frontend calculation.
//       let p1Score = Number(s1.gross);
//       let p2Score = Number(s2.gross);
//       // Apply pops
//       if (p1Pops.has(holeNum)) {
//         p1Score -= p1Pops.get(holeNum)!;
//       }
//       if (p2Pops.has(holeNum)) {
//         p2Score -= p2Pops.get(holeNum)!;
//       }
//       p1NetTotal += p1Score;
//       p2NetTotal += p2Score;
//       playedHoles++;
//       if (pointsPerHole > 0) {
//         if (p1Score < p2Score) {
//           player1Points += pointsPerHole;
//         } else if (p1Score > p2Score) {
//           player2Points += pointsPerHole;
//         } else {
//           player1Points += pointsPerHole / 2;
//           player2Points += pointsPerHole / 2;
//         }
//       }
//     }
//     const p1Net = p1NetTotal;
//     const p2Net = p2NetTotal;
//     if (pointsPerMatch > 0 && playedHoles > 0) {
//       if (p1Net < p2Net) {
//         player1MatchPoints += pointsPerMatch;
//       } else if (p1Net > p2Net) {
//         player2MatchPoints += pointsPerMatch;
//       } else {
//         player1MatchPoints += pointsPerMatch / 2;
//         player2MatchPoints += pointsPerMatch / 2;
//       }
//     }
//     player1Points += player1MatchPoints;
//     player2Points += player2MatchPoints;
//     return [
//       { id: player1.id, points: player1Points, matchPoints: player1MatchPoints, net: p1Net },
//       { id: player2.id, points: player2Points, matchPoints: player2MatchPoints, net: p2Net },
//     ];
//   }
//   private getPlayerGrossTotal(player: any): number {
//     const scores = player?.rounds?.[0]?.scores || [];
//     return scores.reduce((sum: number, s: any) => sum + Number(s?.gross || 0), 0);
//   }
//   private getPlayerNetTotalWithPops(player: any, pops?: Map<number, number>): number {
//     const scores = player?.rounds?.[0]?.scores || [];
//     return scores.reduce((sum: number, s: any) => {
//       const gross = Number(s?.gross || 0);
//       if (!gross) return sum;
//       const popAllowance = pops?.get(Number(s?.hole)) || 0;
//       return sum + (gross - popAllowance);
//     }, 0);
//   }
//   private calculatePops = (p1hcp: any, p2hcp: any) => {
//     const hcpDiff = Math.abs(p1hcp - p2hcp);
//     const numHoles = this.event.holes;
//     const startingHole = this.event.startSide === 'front' ? 1 : 10;
//     const holes = this.event.tee.holes.slice(startingHole - 1, startingHole - 1 + numHoles);
//     const sortedHoles = [...holes].sort((a: any, b: any) => a.hcp - b.hcp);
//     // Map hole number to number of pops
//     const p1PopsMap = new Map<number, number>();
//     const p2PopsMap = new Map<number, number>();
//     let remainingPops = hcpDiff;
//     let holeIndex = 0;
//     while (remainingPops > 0) {
//       const hole = sortedHoles[holeIndex % sortedHoles.length];
//       const currentPops = (p1hcp > p2hcp ? p1PopsMap.get(hole.num) : p2PopsMap.get(hole.num)) || 0;
//       if (p1hcp > p2hcp) {
//         p1PopsMap.set(hole.num, currentPops + 1);
//       } else if (p2hcp > p1hcp) {
//         p2PopsMap.set(hole.num, currentPops + 1);
//       }
//       remainingPops--;
//       holeIndex++;
//     }
//     return [p1PopsMap, p2PopsMap];
//   };
//   private async setEventDetailsForTeams(eventId: number) {
//     const ev = await prisma.event.findUnique({
//       where: { id: eventId },
//       include: {
//         tee: true,
//         flights: {
//           include: {
//             players: {
//               include: {
//                 player: {
//                   select: {
//                     id: true,
//                     firstName: true,
//                     lastName: true,
//                     handicap: true,
//                     seasonPoints: true,
//                     rounds: {
//                       where: { eventId: eventId },
//                       select: {
//                         id: true,
//                         preHandicap: true,
//                         postHandicap: true,
//                         opponentId: true,
//                         net: true,
//                         gross: true,
//                         pointsEarned: true,
//                         scores: {
//                           select: {
//                             hole: true,
//                             par: true,
//                             gross: true,
//                             net: true,
//                           },
//                         },
//                       },
//                     },
//                   },
//                 },
//               },
//             },
//             teams: {
//               select: {
//                 id: true,
//                 flightId: true,
//                 team: {
//                   select: {
//                     id: true,
//                     name: true,
//                     seasonPoints: true,
//                     players: {
//                       select: {
//                         id: true,
//                       },
//                     },
//                   },
//                 },
//               },
//             },
//           },
//         },
//       },
//     });
//     this.event = ev;
//     this.players =
//       ev?.flights.flatMap((flight: any) => flight.players.map((p: any) => p.player)) || [];
//     this.teams = ev?.flights.flatMap((flight: any) => flight.teams.map((t: any) => t.team)) || [];
//   }
// }
