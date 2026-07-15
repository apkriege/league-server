import { afterEach, describe, expect, it, vi } from 'vitest';
import { requireTrustedOrigin } from '../middleware/security';

const originalClientUrl = process.env.CLIENT_URL;

afterEach(() => {
  if (originalClientUrl === undefined) delete process.env.CLIENT_URL;
  else process.env.CLIENT_URL = originalClientUrl;
});

const buildRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('trusted origin middleware', () => {
  it('allows read-only requests without an origin', () => {
    const next = vi.fn();
    requireTrustedOrigin({ method: 'GET', headers: {} } as any, buildRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('allows a mutation from the configured client origin', () => {
    process.env.CLIENT_URL = 'https://league.example';
    const next = vi.fn();
    requireTrustedOrigin(
      { method: 'POST', headers: { origin: 'https://league.example' } } as any,
      buildRes(),
      next,
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it('rejects a mutation from an untrusted origin', () => {
    process.env.CLIENT_URL = 'https://league.example';
    const res = buildRes();
    const next = vi.fn();
    requireTrustedOrigin(
      { method: 'POST', headers: { origin: 'https://attacker.example' } } as any,
      res,
      next,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: 'Request origin is not allowed' });
    expect(next).not.toHaveBeenCalled();
  });
});
