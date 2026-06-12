const normalizeOrigin = (value: string) => {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const splitEnvOrigins = (value: string | undefined) =>
  String(value || '')
    .split(',')
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

export { normalizeOrigin };
