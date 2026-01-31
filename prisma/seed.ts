import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
import { usersSeed } from './seeds/users';
import { clubSeed, courseSeed, teeSeed } from './seeds/courses';

async function main() {
  try {
    // users
    await prisma.user.createMany({
      data: usersSeed,
    });

    // club
    await prisma.club.createMany({
      data: clubSeed,
    });

    // course
    await prisma.course.createMany({
      data: courseSeed,
    });

    // tee
    await prisma.tee.createMany({
      data: teeSeed,
    });
  } catch (error) {
    console.error(error);
  }
}

main()
  .then(() => {
    console.log('Seeding complete.');
  })
  .catch((e) => {
    console.error('Seeding failed:', e);
  });
