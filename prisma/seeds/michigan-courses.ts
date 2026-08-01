import { PrismaClient } from '@prisma/client';

// Scorecard sources checked July 28, 2026:
// Fortress: https://www.zehnders.com/golf/
// County Line: https://18birdies.com/golf-courses/club/b38cbf00-86ac-11e4-8c28-020000005b00/county-line-golf-course
// Apple Mountain: https://www.applemountain.com/golf/the-course and
// https://www.golfify.io/courses/golf-club-at-apple-mountain

type Hole = {
  num: number;
  par: number;
  dis: number;
  hcp: number;
};

type TeeDefinition = {
  name: string;
  color: string;
  distances: number[];
  ratingMen: number;
  slopeMen: number;
  ratingFrontMen?: number;
  slopeFrontMen?: number;
  ratingBackMen?: number;
  slopeBackMen?: number;
  ratingWomen?: number;
  slopeWomen?: number;
  ratingFrontWomen?: number;
  slopeFrontWomen?: number;
  ratingBackWomen?: number;
  slopeBackWomen?: number;
};

type CourseDefinition = {
  club: {
    name: string;
    description: string;
    location: string;
    phone: string;
    link: string;
  };
  course: {
    name: string;
    description: string;
    location: string;
    phone: string;
  };
  pars: number[];
  handicaps: number[];
  tees: TeeDefinition[];
};

const fortressPars = [5, 3, 4, 3, 4, 5, 4, 4, 4, 4, 4, 3, 4, 5, 4, 4, 3, 5];
const fortressHandicaps = [6, 12, 2, 14, 18, 16, 8, 10, 4, 17, 15, 11, 1, 9, 13, 5, 7, 3];

const courseDefinitions: CourseDefinition[] = [
  {
    club: {
      name: 'The Fortress Golf Course',
      description: "Zehnder's public golf course in Frankenmuth, Michigan.",
      location: 'Frankenmuth, MI',
      phone: '989-652-0460',
      link: 'https://www.zehnders.com/golf/',
    },
    course: {
      name: 'Fortress',
      description: 'The Fortress 18-hole championship course.',
      location: 'Frankenmuth, MI',
      phone: '989-652-0460',
    },
    pars: fortressPars,
    handicaps: fortressHandicaps,
    tees: [
      {
        name: 'Black',
        color: 'black',
        distances: [522, 167, 456, 149, 353, 501, 437, 409, 453, 369, 391, 209, 443, 523, 350, 380, 172, 529],
        ratingMen: 74.2,
        slopeMen: 142,
        ratingFrontMen: 37.2,
        slopeFrontMen: 139,
        ratingBackMen: 37,
        slopeBackMen: 144,
        ratingWomen: 80.3,
        slopeWomen: 150,
        ratingFrontWomen: 40.3,
        slopeFrontWomen: 148,
        ratingBackWomen: 40,
        slopeBackWomen: 152,
      },
      {
        name: 'Maroon',
        color: 'maroon',
        distances: [494, 140, 431, 119, 324, 467, 390, 378, 437, 336, 363, 181, 410, 496, 309, 333, 153, 510],
        ratingMen: 71.4,
        slopeMen: 139,
        ratingFrontMen: 35.9,
        slopeFrontMen: 138,
        ratingBackMen: 35.5,
        slopeBackMen: 139,
        ratingWomen: 77.4,
        slopeWomen: 145,
        ratingFrontWomen: 38.9,
        slopeFrontWomen: 144,
        ratingBackWomen: 38.5,
        slopeBackWomen: 146,
      },
      {
        name: 'Combo',
        color: 'combo',
        distances: [415, 140, 342, 119, 324, 390, 288, 278, 325, 336, 363, 181, 315, 398, 309, 333, 153, 436],
        ratingMen: 67.1,
        slopeMen: 127,
        ratingFrontMen: 33,
        slopeFrontMen: 124,
        ratingBackMen: 34.1,
        slopeBackMen: 129,
        ratingWomen: 72.7,
        slopeWomen: 137,
        ratingFrontWomen: 35.7,
        slopeFrontWomen: 134,
        ratingBackWomen: 37,
        slopeBackWomen: 139,
      },
      {
        name: 'Gold',
        color: 'gold',
        distances: [415, 82, 342, 83, 275, 390, 288, 278, 325, 272, 254, 109, 315, 398, 239, 247, 89, 436],
        ratingMen: 64.3,
        slopeMen: 115,
        ratingFrontMen: 32.3,
        slopeFrontMen: 121,
        ratingBackMen: 32,
        slopeBackMen: 109,
        ratingWomen: 69.4,
        slopeWomen: 129,
        ratingFrontWomen: 35,
        slopeFrontWomen: 130,
        ratingBackWomen: 34.4,
        slopeBackWomen: 128,
      },
    ],
  },
  {
    club: {
      name: 'County Line Golf Course',
      description: 'Public 9-hole golf course and driving range in Reese, Michigan.',
      location: '2278 S Reese Rd, Reese, MI 48757',
      phone: '989-868-4991',
      link: 'http://www.countylinegolfcourse.com/',
    },
    course: {
      name: 'County Line',
      description: 'County Line Golf Course 9-hole layout.',
      location: 'Reese, MI',
      phone: '989-868-4991',
    },
    pars: [4, 3, 4, 5, 4, 3, 4, 4, 5],
    handicaps: [4, 6, 1, 7, 8, 5, 9, 3, 2],
    tees: [
      {
        name: 'Blue',
        color: 'blue',
        distances: [342, 130, 382, 455, 350, 232, 363, 341, 538],
        ratingMen: 34.5,
        slopeMen: 121,
        ratingWomen: 37.6,
        slopeWomen: 127,
      },
      {
        name: 'White',
        color: 'white',
        distances: [315, 110, 362, 435, 335, 213, 342, 329, 502],
        ratingMen: 33.5,
        slopeMen: 117,
        ratingWomen: 36.6,
        slopeWomen: 124,
      },
      {
        name: 'Red',
        color: 'red',
        distances: [300, 77, 320, 357, 305, 170, 310, 280, 340],
        ratingMen: 33.7,
        slopeMen: 108,
        ratingWomen: 33.5,
        slopeWomen: 109,
      },
    ],
  },
  {
    club: {
      name: 'Apple Mountain',
      description: 'Public championship golf course and resort in Freeland, Michigan.',
      location: '4519 N River Rd, Freeland, MI 48623',
      phone: '989-781-6789',
      link: 'https://www.applemountain.com/',
    },
    course: {
      name: 'Apple Mountain',
      description: 'Apple Mountain par-72 championship course designed by John Sanford.',
      location: 'Freeland, MI',
      phone: '989-781-6789',
    },
    pars: [4, 5, 4, 4, 3, 4, 3, 4, 4, 4, 3, 5, 4, 4, 5, 3, 4, 5],
    handicaps: [16, 2, 8, 10, 14, 6, 18, 4, 12, 11, 17, 3, 7, 13, 1, 15, 9, 5],
    tees: [
      {
        name: 'Black',
        color: 'black',
        distances: [381, 527, 360, 396, 175, 425, 170, 463, 393, 408, 165, 563, 466, 353, 583, 215, 413, 506],
        ratingMen: 74.2,
        slopeMen: 145,
      },
      {
        name: 'Blue',
        color: 'blue',
        distances: [356, 489, 343, 366, 156, 405, 140, 410, 348, 377, 139, 532, 419, 337, 524, 167, 363, 476],
        ratingMen: 71.7,
        slopeMen: 131,
      },
      {
        name: 'White',
        color: 'white',
        distances: [329, 460, 307, 295, 136, 383, 124, 371, 326, 348, 119, 509, 393, 314, 498, 151, 336, 438],
        ratingMen: 68,
        slopeMen: 128,
      },
      {
        name: 'Red',
        color: 'red',
        distances: [288, 405, 272, 276, 114, 262, 106, 315, 288, 303, 93, 434, 319, 269, 439, 113, 292, 390],
        ratingMen: 69.6,
        slopeMen: 127,
        ratingWomen: 69.6,
        slopeWomen: 127,
      },
    ],
  },
];

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

const splitRating = (rating: number, frontPar: number, totalPar: number) =>
  Number(((rating * frontPar) / totalPar).toFixed(1));

const buildHoles = (definition: CourseDefinition, tee: TeeDefinition): Hole[] =>
  tee.distances.map((dis, index) => ({
    num: index + 1,
    par: definition.pars[index],
    dis,
    hcp: definition.handicaps[index],
  }));

export const fortressMaroonHoles = buildHoles(
  courseDefinitions[0],
  courseDefinitions[0].tees[1],
);

export async function seedMichiganGolfCourses(prisma: PrismaClient) {
  let fortressCourse: Awaited<ReturnType<typeof prisma.course.create>> | null = null;
  let fortressTees: Awaited<ReturnType<typeof prisma.tee.create>>[] = [];

  for (const definition of courseDefinitions) {
    const club = await prisma.club.create({
      data: {
        ...definition.club,
        accessType: 'public',
      },
    });

    const par = sum(definition.pars);
    const frontPar = sum(definition.pars.slice(0, 9));
    const backPar = definition.pars.length === 9 ? frontPar : sum(definition.pars.slice(9));
    const course = await prisma.course.create({
      data: {
        clubId: club.id,
        ...definition.course,
        timeZone: 'America/Detroit',
        accessType: 'public',
        numHoles: definition.pars.length,
        par,
      },
    });

    const tees = await Promise.all(
      definition.tees.map((tee) => {
        const holes = buildHoles(definition, tee);
        const ratingFrontMen =
          tee.ratingFrontMen ??
          (definition.pars.length === 9
            ? tee.ratingMen
            : splitRating(tee.ratingMen, frontPar, par));
        const ratingBackMen =
          tee.ratingBackMen ??
          (definition.pars.length === 9
            ? tee.ratingMen
            : Number((tee.ratingMen - ratingFrontMen).toFixed(1)));
        const ratingFrontWomen = tee.ratingWomen
          ? tee.ratingFrontWomen ??
            (definition.pars.length === 9
              ? tee.ratingWomen
              : splitRating(tee.ratingWomen, frontPar, par))
          : null;
        const ratingBackWomen = tee.ratingWomen
          ? tee.ratingBackWomen ??
            (definition.pars.length === 9
              ? tee.ratingWomen
              : Number((tee.ratingWomen - Number(ratingFrontWomen)).toFixed(1)))
          : null;

        return prisma.tee.create({
          data: {
            courseId: course.id,
            name: tee.name,
            color: tee.color,
            distance: sum(tee.distances),
            par,
            frontPar,
            backPar,
            slopeMen: tee.slopeMen,
            slopeFrontMen: tee.slopeFrontMen ?? tee.slopeMen,
            slopeBackMen: tee.slopeBackMen ?? tee.slopeMen,
            slopeWomen: tee.slopeWomen,
            slopeFrontWomen: tee.slopeFrontWomen ?? tee.slopeWomen,
            slopeBackWomen: tee.slopeBackWomen ?? tee.slopeWomen,
            ratingMen: tee.ratingMen,
            ratingFrontMen,
            ratingBackMen,
            ratingWomen: tee.ratingWomen,
            ratingFrontWomen,
            ratingBackWomen,
            holes,
          },
        });
      }),
    );

    if (definition.course.name === 'Fortress') {
      fortressCourse = course;
      fortressTees = tees;
    }
  }

  if (!fortressCourse || fortressTees.length === 0) {
    throw new Error('The Fortress course seed was not created.');
  }

  return { fortressCourse, fortressTees };
}
