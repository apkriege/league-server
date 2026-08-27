const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const email = 'super@leaguenightpro.com';
const password = String(process.env.SUPER_ADMIN_PASSWORD || '');
const firstName = 'Super';
const lastName = 'Admin';

const adminEmail = 'admin@leaguenightpro.com';
const adminPassword = String(process.env.SUPER_ADMIN_PASSWORD || '');
const adminFirstName = 'Test';
const adminLastName = 'Admin';

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

  if (password.length < 8) {
    throw new Error('SUPER_ADMIN_PASSWORD must be at least 8 characters');
  }

  await upsertUser({
    email,
    password,
    firstName,
    lastName,
    role: 'SUPER',
  });

  console.log(`Super admin ensured: ${email}`);

  await upsertUser({
    email: adminEmail,
    password: adminPassword,
    firstName: adminFirstName,
    lastName: adminLastName,
    role: 'ADMIN',
  });

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
