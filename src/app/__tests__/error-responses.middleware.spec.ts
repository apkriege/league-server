import { describe, expect, it } from 'vitest';
import { normalizeErrorResponses } from '../middleware/error-responses';

const createResponse = () => {
  let body: unknown;
  const headers = new Map<string, unknown>();
  const response: any = {
    statusCode: 200,
    status(status: number) {
      this.statusCode = status;
      return this;
    },
    json(value: unknown) {
      headers.set('Content-Type', 'application/json');
      body = value;
      return this;
    },
    send(value: unknown) {
      body = value;
      return this;
    },
    sendStatus(status: number) {
      this.statusCode = status;
      body = String(status);
      return this;
    },
    getHeader(name: string) {
      return headers.get(name);
    },
  };
  normalizeErrorResponses(
    { requestId: 'test-request-id' } as any,
    response,
    () => undefined,
  );
  return { response, getBody: () => body };
};

describe('error response normalization middleware', () => {
  it('converts sendStatus and plain-text errors to JSON', async () => {
    const unauthorized = createResponse();
    unauthorized.response.sendStatus(401);
    const missing = createResponse();
    missing.response.status(404).send('Thing not found');
    const broken = createResponse();
    broken.response.status(500).send('private server detail');

    expect(unauthorized.getBody()).toEqual({
      status: 401,
      name: 'Unauthorized',
      message: 'Not authenticated.',
      requestId: 'test-request-id',
    });
    expect(missing.getBody()).toMatchObject({ status: 404, message: 'Thing not found' });
    expect(broken.getBody()).toMatchObject({ status: 500, message: 'Internal server error' });
    expect(JSON.stringify(broken.getBody())).not.toContain('private server detail');
  });
});
