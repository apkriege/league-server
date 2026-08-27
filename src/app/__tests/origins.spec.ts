import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requireTrustedOrigin } from '../middleware/security';
import {
  getConfiguredClientOrigins,
  isCorsOriginAllowed,
  isTrustedClientOrigin,
  normalizeOrigin,
} from '../utils/origins';

const originalClientUrl = process.env.CLIENT_URL;
const originalClientUrls = process.env.CLIENT_URLS;

describe('client origin configuration', () => {
  beforeEach(() => {
    process.env.CLIENT_URL = 'https://league-night-client.up.railway.app/';
    process.env.CLIENT_URLS =
      'app.leaguenight.com, https://preview.leaguenight.com/some/path';
  });

  afterEach(() => {
    if (originalClientUrl === undefined) delete process.env.CLIENT_URL;
    else process.env.CLIENT_URL = originalClientUrl;

    if (originalClientUrls === undefined) delete process.env.CLIENT_URLS;
    else process.env.CLIENT_URLS = originalClientUrls;
  });

  it('normalizes full URLs and Railway host-only variables', () => {
    expect(normalizeOrigin('https://app.example.com/path')).toBe('https://app.example.com');
    expect(normalizeOrigin('league-night-client.up.railway.app')).toBe(
      'https://league-night-client.up.railway.app',
    );
    expect(normalizeOrigin('localhost:5173')).toBe('http://localhost:5173');
  });

  it('builds a unique exact-origin allowlist from both environment variables', () => {
    expect(getConfiguredClientOrigins()).toEqual([
      'https://league-night-client.up.railway.app',
      'https://app.leaguenight.com',
      'https://preview.leaguenight.com',
    ]);
  });

  it('allows exact configured origins and non-browser requests only', () => {
    expect(isTrustedClientOrigin('https://league-night-client.up.railway.app')).toBe(true);
    expect(isTrustedClientOrigin('https://app.leaguenight.com/anything')).toBe(true);
    expect(isTrustedClientOrigin('https://evil.example.com')).toBe(false);
    expect(isCorsOriginAllowed(undefined)).toBe(true);
    expect(isCorsOriginAllowed('null')).toBe(false);
  });

  it('rejects an untrusted browser origin in API middleware', () => {
    const req = {
      get: vi.fn().mockReturnValue('https://evil.example.com'),
      method: 'POST',
      originalUrl: '/api/auth/login',
      requestId: 'request-123',
    } as any;
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const next = vi.fn();

    requireTrustedOrigin(req, { status } as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      message: 'Request origin is not allowed',
      requestId: 'request-123',
    });
  });

  it('allows trusted browser origins and requests without Origin', () => {
    const next = vi.fn();
    const response = { status: vi.fn() } as any;

    requireTrustedOrigin(
      {
        get: vi.fn().mockReturnValue('https://app.leaguenight.com'),
        method: 'GET',
        originalUrl: '/api/courses',
      } as any,
      response,
      next,
    );
    requireTrustedOrigin(
      {
        get: vi.fn().mockReturnValue(undefined),
        method: 'GET',
        originalUrl: '/api/courses',
      } as any,
      response,
      next,
    );

    expect(next).toHaveBeenCalledTimes(2);
    expect(response.status).not.toHaveBeenCalled();
  });
});
