const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const email = 'adamkrieger87@gmail.com';
const password = String(process.env.SUPER_ADMIN_PASSWORD || '');
const firstName = 'Adam';
const lastName = 'Krieger';

const adminEmail = String(process.env.TEST_ADMIN_EMAIL || '')
  .trim()
  .toLowerCase();
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

  if (password.length < 8) {
    throw new Error('SUPER_ADMIN_PASSWORD must be at least 8 characters');
  }

  const testAdminValues = [adminEmail, adminPassword, adminFirstName, adminLastName];
  const hasAnyTestAdminValue = testAdminValues.some(Boolean);
  const hasEveryTestAdminValue = testAdminValues.every(Boolean);

  if (process.env.NODE_ENV === 'production' && hasAnyTestAdminValue) {
    throw new Error('TEST_ADMIN_* variables must not be configured in production');
  }

  if (hasAnyTestAdminValue && !hasEveryTestAdminValue) {
    throw new Error('Either set every TEST_ADMIN_* variable or leave all of them unset');
  }

  if (hasEveryTestAdminValue && adminPassword.length < 8) {
    throw new Error('TEST_ADMIN_PASSWORD must be at least 8 characters');
  }
  if (hasEveryTestAdminValue && adminEmail === email) {
    throw new Error('SUPER_ADMIN_EMAIL and TEST_ADMIN_EMAIL must be different');
  }

  await upsertUser({
    email,
    password,
    firstName,
    lastName,
    role: 'SUPER',
  });

  console.log(`Super admin ensured: ${email}`);

  if (hasEveryTestAdminValue) {
    await upsertUser({
      email: adminEmail,
      password: adminPassword,
      firstName: adminFirstName,
      lastName: adminLastName,
      role: 'ADMIN',
    });
    console.log(`Test admin ensured: ${adminEmail}`);
  }
}

main()
  .catch((error) => {
    console.error('Failed to ensure super admin:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
