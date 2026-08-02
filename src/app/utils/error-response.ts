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
  const httpError = error as {
    status?: unknown;
    statusCode?: unknown;
    type?: unknown;
  };
  const status = Number(httpError?.status ?? httpError?.statusCode);

  if (httpError?.type === 'entity.parse.failed') {
    return { status: 400, message: 'Invalid JSON request body.' };
  }

  if (httpError?.type === 'entity.too.large') {
    return { status: 413, message: 'Request body is too large.' };
  }

  if (httpError?.type === 'encoding.unsupported' || httpError?.type === 'charset.unsupported') {
    return { status: 415, message: 'Unsupported request encoding.' };
  }

  if (httpError?.type === 'request.aborted') {
    return { status: 400, message: 'Request was aborted.' };
  }

  if (error instanceof URIError) {
    return { status: 400, message: 'Malformed request URL.' };
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return { status: 503, message: 'Database is temporarily unavailable.' };
  }

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

  const publicHttpMessages: Record<number, string> = {
    400: 'Bad request.',
    401: 'Not authenticated.',
    402: 'Payment required.',
    403: 'Forbidden.',
    404: 'Route not found.',
    405: 'Method not allowed.',
    406: 'Not acceptable.',
    408: 'Request timeout.',
    409: 'Conflict.',
    410: 'Resource no longer available.',
    412: 'Precondition failed.',
    413: 'Request body is too large.',
    415: 'Unsupported media type.',
    422: 'Request could not be processed.',
    423: 'Resource is locked.',
    429: 'Too many requests.',
    431: 'Request headers are too large.',
    502: 'Upstream service error.',
    503: 'Service temporarily unavailable.',
    504: 'Upstream service timeout.',
  };
  if (Number.isInteger(status) && publicHttpMessages[status]) {
    return { status, message: publicHttpMessages[status] };
  }

  if (Number.isInteger(status) && status >= 400 && status < 500) {
    return { status, message: 'Request failed.' };
  }

  if (Number.isInteger(status) && status >= 500 && status < 600) {
    return { status, message: 'Internal server error' };
  }

  return { status: 500, message: 'Internal server error' };
}
