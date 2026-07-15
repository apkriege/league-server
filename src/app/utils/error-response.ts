import { Prisma } from '@prisma/client';

const validationMessagePatterns = [
  /^Invalid /i,
  /^Missing /i,
  /^Unsupported /i,
  /^Unable /i,
  /^Team /i,
  /^Player /i,
  /^League /i,
  /^Event /i,
  /^Flight /i,
  /^Hole /i,
  /^Selected /i,
  /required/i,
  /not found/i,
  /already exists/i,
  /cannot be edited/i,
];

export function getErrorMessage(error: unknown, fallback = 'Internal server error') {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}

export function getPublicErrorResponse(error: unknown) {
  const message = getErrorMessage(error);

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return { status: 409, message: 'A record with this value already exists.' };
    }
    if (error.code === 'P2025') {
      return { status: 404, message: 'Record not found.' };
    }
  }

  if (/not found/i.test(message)) {
    return { status: 404, message };
  }

  if (/cannot be edited|already exists/i.test(message)) {
    return { status: 409, message };
  }

  if (validationMessagePatterns.some((pattern) => pattern.test(message))) {
    return { status: 400, message };
  }

  return { status: 500, message: 'Internal server error' };
}
