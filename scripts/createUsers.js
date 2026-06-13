const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const email = (process.env.SUPER_ADMIN_EMAIL || 'adamkrieger87@gmail.com').trim().toLowerCase();
const password = process.env.SUPER_ADMIN_PASSWORD || 'testing';
const firstName = process.env.SUPER_ADMIN_FIRST_NAME || 'Adam';
const lastName = process.env.SUPER_ADMIN_LAST_NAME || 'Krieger';

const adminEmail = (process.env.TEST_ADMIN_EMAIL || 'admin@test.com').trim().toLowerCase();
const adminPassword = process.env.TEST_ADMIN_PASSWORD || 'testing';
const adminFirstName = process.env.TEST_ADMIN_FIRST_NAME || 'Test';
const adminLastName = process.env.TEST_ADMIN_LAST_NAME || 'Admin';

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
  if (!email || !password) {
    throw new Error('SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD are required');
  }

  if (!adminEmail || !adminPassword) {
    throw new Error('TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD are required');
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
