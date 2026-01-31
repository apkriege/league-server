import dayjs from 'dayjs';

const generateHoleScores = (numHoles: number = 18) => {
  const scores: Record<number, number> = {};
  for (let i = 1; i <= numHoles; i++) {
    scores[i] = Math.floor(Math.random() * 9) + 1; // Random score 1-9
  }
  return scores;
};

// Helper to create score detail records from hole scores
const createScoreDetails = (
  scoreId: number,
  playerId: number,
  courseId: number,
  teeId: number,
  holeScores: Record<number, number>,
  isNet: boolean = false
) => {
  return Object.entries(holeScores).map(([hole, score]) => ({
    scoreId,
    playerId,
    courseId,
    teeId,
    hole: parseInt(hole),
    par: 4, // Default par, customize as needed
    score: isNet ? Math.max(1, score - 1) : score, // Net scores are slightly lower
  }));
};

export const playerScoreSeed = [
  // {
  //   eventId: 1,
  //   playerId: 1,
  //   courseId: 1,
  //   teeId: 1,
  //   score: 72,
  //   net: 70,
  //   adjusted: 68,
  //   putts: 30,
  //   courseRating: 72.5,
  //   courseSlope: 130,
  //   differential: 2.5,
  //   preHandicap: 9,
  //   postHandicap: 7,
  //   pointsEarned: 2,
  //   eagles: 0,
  //   birdies: 3,
  //   pars: 9,
  //   bogeys: 4,
  //   doubleBogeys: 0,
  // },
  // {
  //   eventId: 1,
  //   playerId: 2,
  //   courseId: 1,
  //   teeId: 1,
  //   score: 78,
  //   net: 71,
  //   adjusted: 75,
  //   putts: 32,
  //   courseRating: 72.5,
  //   courseSlope: 130,
  //   differential: 4.5,
  //   preHandicap: 7,
  //   postHandicap: 8,
  //   pointsEarned: 0,
  //   eagles: 0,
  //   birdies: 1,
  //   pars: 10,
  //   bogeys: 6,
  //   doubleBogeys: 1,
  // },
  // {
  //   eventId: 1,
  //   playerId: 3,
  //   courseId: 1,
  //   teeId: 1,
  //   score: 72,
  //   net: 67,
  //   adjusted: 69,
  //   putts: 30,
  //   courseRating: 74,
  //   courseSlope: 140,
  //   differential: 2.5,
  //   preHandicap: 5,
  //   postHandicap: 4,
  //   pointsEarned: 1,
  //   eagles: 0,
  //   birdies: 4,
  //   pars: 8,
  //   bogeys: 5,
  //   doubleBogeys: 1,
  // },
  // {
  //   eventId: 1,
  //   playerId: 4,
  //   courseId: 1,
  //   teeId: 1,
  //   score: 78,
  //   net: 75,
  //   adjusted: 76,
  //   putts: 32,
  //   courseRating: 74,
  //   courseSlope: 140,
  //   differential: 4.5,
  //   preHandicap: 4,
  //   postHandicap: 3,
  //   pointsEarned: 1,
  //   eagles: 0,
  //   birdies: 2,
  //   pars: 9,
  //   bogeys: 6,
  //   doubleBogeys: 1,
  // },
  // {
  //   eventId: 1,
  //   playerId: 5,
  //   courseId: 1,
  //   teeId: 1,
  //   score: 72,
  //   net: 67,
  //   adjusted: 70,
  //   putts: 30,
  //   courseRating: 74,
  //   courseSlope: 140,
  //   differential: 2.5,
  //   preHandicap: 3,
  //   postHandicap: 5,
  //   pointsEarned: 1,
  //   eagles: 0,
  //   birdies: 3,
  //   pars: 9,
  //   bogeys: 5,
  //   doubleBogeys: 1,
  // },
  // {
  //   eventId: 1,
  //   playerId: 6,
  //   courseId: 1,
  //   teeId: 1,
  //   score: 72,
  //   net: 68,
  //   adjusted: 71,
  //   putts: 30,
  //   courseRating: 74,
  //   courseSlope: 140,
  //   differential: 2.5,
  //   preHandicap: 11,
  //   postHandicap: 10,
  //   pointsEarned: 1,
  //   eagles: 0,
  //   birdies: 2,
  //   pars: 10,
  //   bogeys: 5,
  //   doubleBogeys: 1,
  // },
  // {
  //   eventId: 1,
  //   playerId: 7,
  //   courseId: 1,
  //   teeId: 1,
  //   score: 72,
  //   net: 67,
  //   adjusted: 69,
  //   putts: 30,
  //   courseRating: 74,
  //   courseSlope: 140,
  //   differential: 2.5,
  //   preHandicap: 5,
  //   postHandicap: 6,
  //   pointsEarned: 0,
  //   eagles: 0,
  //   birdies: 1,
  //   pars: 11,
  //   bogeys: 5,
  //   doubleBogeys: 1,
  // },
  // {
  //   eventId: 1,
  //   playerId: 8,
  //   courseId: 1,
  //   teeId: 1,
  //   score: 72,
  //   net: 68,
  //   adjusted: 70,
  //   putts: 30,
  //   courseRating: 74,
  //   courseSlope: 140,
  //   differential: 2.5,
  //   preHandicap: 4,
  //   postHandicap: 4,
  //   pointsEarned: 2,
  //   eagles: 0,
  //   birdies: 3,
  //   pars: 9,
  //   bogeys: 5,
  //   doubleBogeys: 1,
  // },
];

// Score detail seed - individual hole scores for each player
export const scoreDetailsSeed: any[] = [];
// playerScoreSeed.forEach((score, idx) => {
// const holeScores = generateHoleScores();
// const scoreId = idx + 1;
// Object.entries(holeScores).forEach(([hole, holeScore]) => {
//   scoreDetailsSeed.push({
//     scoreId,
//     playerId: score.playerId,
//     courseId: score.courseId,
//     teeId: score.teeId,
//     hole: parseInt(hole),
//     par: 4, // Adjust based on actual tee data
//     score: holeScore,
//     net: Math.max(1, holeScore - 1),
//     adjusted: holeScore + 2,
//   });
// });
// });

export const teamPointSeed = [
  {
    eventId: 1,
    teamId: 1,
    points: 2,
  },
  {
    eventId: 1,
    teamId: 2,
    points: 0,
  },
  {
    eventId: 1,
    teamId: 3,
    points: 2,
  },
  {
    eventId: 1,
    teamId: 4,
    points: 0,
  },
];
