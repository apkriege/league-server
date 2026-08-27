import { describe, expect, it } from 'vitest';
import { getPublicErrorResponse } from '../utils/error-response';

describe('public error responses', () => {
  it('normalizes body-parser errors without exposing parser details', () => {
    const malformedJson = Object.assign(new SyntaxError('Unexpected token at position 4'), {
      status: 400,
      type: 'entity.parse.failed',
    });
    const oversizedBody = Object.assign(new Error('request entity too large'), {
      status: 413,
      type: 'entity.too.large',
    });

    expect(getPublicErrorResponse(malformedJson)).toEqual({
      status: 400,
      message: 'Invalid JSON request body.',
    });
    expect(getPublicErrorResponse(oversizedBody)).toEqual({
      status: 413,
      message: 'Request body is too large.',
    });
  });

  it('normalizes common HTTP errors and hides unknown server errors', () => {
    expect(getPublicErrorResponse(Object.assign(new Error('internal detail'), { status: 403 }))).toEqual({
      status: 403,
      message: 'Forbidden.',
    });
    expect(getPublicErrorResponse(new Error('database connection failed'))).toEqual({
      status: 500,
      message: 'Internal server error',
    });
  });

  it('covers uncommon client and upstream HTTP errors', () => {
    expect(getPublicErrorResponse(Object.assign(new Error('detail'), { status: 418 }))).toEqual({
      status: 418,
      message: 'Request failed.',
    });
    expect(getPublicErrorResponse(Object.assign(new Error('detail'), { status: 503 }))).toEqual({
      status: 503,
      message: 'Service temporarily unavailable.',
    });
    expect(
      getPublicErrorResponse(
        Object.assign(new Error('unsupported charset'), { type: 'charset.unsupported' }),
      ),
    ).toEqual({ status: 415, message: 'Unsupported request encoding.' });
  });
});
