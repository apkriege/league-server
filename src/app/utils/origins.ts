const hasProtocol = (value: string) => /^[a-z][a-z\d+.-]*:\/\//i.test(value);

const getDefaultProtocol = (value: string) => {
  const hostname = value.split(/[/:]/, 1)[0]?.toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
    ? 'http'
    : 'https';
};

const normalizeOrigin = (value: string) => {
  try {
    const trimmed = String(value || '').trim();
    if (!trimmed) return null;

    const candidate = hasProtocol(trimmed)
      ? trimmed
      : `${getDefaultProtocol(trimmed)}://${trimmed}`;

    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
};

const splitEnvOrigins = (value: string | undefined) =>
  String(value || '')
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

export const getConfiguredClientOrigins = () => {
  const configured = [
    ...splitEnvOrigins(process.env.CLIENT_URL),
    ...splitEnvOrigins(process.env.CLIENT_URLS),
  ];

  const normalized = configured
    .map((origin) => normalizeOrigin(origin))
    .filter((origin): origin is string => Boolean(origin));

  return Array.from(new Set(normalized));
};

export const getPrimaryClientOrigin = () => getConfiguredClientOrigins()[0] || null;

export const isTrustedClientOrigin = (value: string) => {
  const origin = normalizeOrigin(value);
  if (!origin) return false;
  return getConfiguredClientOrigins().includes(origin);
};

export const isCorsOriginAllowed = (value: string | undefined) => {
  // Requests without an Origin header are not browser CORS requests. This keeps health checks,
  // server-to-server calls, CLI tools, and signed Stripe webhooks working.
  if (!value) return true;
  return isTrustedClientOrigin(value);
};

export { normalizeOrigin };
