const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const email = (process.env.SUPER_ADMIN_EMAIL || 'adamkrieger87@gmail.com').trim().toLowerCase();
const password = process.env.SUPER_ADMIN_PASSWORD || 'testing';
const firstName = process.env.SUPER_ADMIN_FIRST_NAME || 'Adam';
const lastName = process.env.SUPER_ADMIN_LAST_NAME || 'Krieger';

async function main() {
  if (!email || !password) {
    throw new Error('SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD are required');
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email },
    create: {
      firstName,
      lastName,
      email,
      username: email,
      password: hashedPassword,
      role: 'SUPER',
    },
    update: {
      firstName,
      lastName,
      username: email,
      password: hashedPassword,
      role: 'SUPER',
      deletedAt: null,
    },
  });

  console.log(`Super admin ensured: ${email}`);
}

main()
  .catch((error) => {
    console.error('Failed to ensure super admin:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
