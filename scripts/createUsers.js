const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const email = String(process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
const password = String(process.env.SUPER_ADMIN_PASSWORD || '');
const firstName = String(process.env.SUPER_ADMIN_FIRST_NAME || '').trim();
const lastName = String(process.env.SUPER_ADMIN_LAST_NAME || '').trim();

const adminEmail = String(process.env.TEST_ADMIN_EMAIL || '').trim().toLowerCase();
const adminPassword = String(process.env.TEST_ADMIN_PASSWORD || '');
const adminFirstName = String(process.env.TEST_ADMIN_FIRST_NAME || '').trim();
const adminLastName = String(process.env.TEST_ADMIN_LAST_NAME || '').trim();

async function upsertUser({ email, password, firstName, lastName, role }) {
  const hashedPassword = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email },
    create: {
      firstName,
      lastName,
      email,
      username: email,
      password: hashedPassword,
      role,
    },
    update: {
      firstName,
      lastName,
      username: email,
      password: hashedPassword,
      role,
      deletedAt: null,
    },
  });
}

async function main() {
  if (!email || !password || !firstName || !lastName) {
    throw new Error('All SUPER_ADMIN_* environment variables are required');
  }

  if (!adminEmail || !adminPassword || !adminFirstName || !adminLastName) {
    throw new Error('All TEST_ADMIN_* environment variables are required');
  }

  await upsertUser({
    email,
    password,
    firstName,
    lastName,
    role: 'SUPER',
  });

  await upsertUser({
    email: adminEmail,
    password: adminPassword,
    firstName: adminFirstName,
    lastName: adminLastName,
    role: 'ADMIN',
  });

  console.log(`Super admin ensured: ${email}`);
  console.log(`Test admin ensured: ${adminEmail}`);
}

main()
  .catch((error) => {
    console.error('Failed to ensure super admin:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
