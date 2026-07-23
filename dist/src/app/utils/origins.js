"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeOrigin = exports.isCorsOriginAllowed = exports.isTrustedClientOrigin = exports.getPrimaryClientOrigin = exports.getConfiguredClientOrigins = void 0;
const hasProtocol = (value) => /^[a-z][a-z\d+.-]*:\/\//i.test(value);
const getDefaultProtocol = (value) => {
    const hostname = value.split(/[/:]/, 1)[0]?.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
        ? 'http'
        : 'https';
};
const normalizeOrigin = (value) => {
    try {
        const trimmed = String(value || '').trim();
        if (!trimmed)
            return null;
        const candidate = hasProtocol(trimmed)
            ? trimmed
            : `${getDefaultProtocol(trimmed)}://${trimmed}`;
        const url = new URL(candidate);
        if (url.protocol !== 'http:' && url.protocol !== 'https:')
            return null;
        return url.origin;
    }
    catch {
        return null;
    }
};
exports.normalizeOrigin = normalizeOrigin;
const splitEnvOrigins = (value) => String(value || '')
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
const getConfiguredClientOrigins = () => {
    const configured = [
        ...splitEnvOrigins(process.env.CLIENT_URL),
        ...splitEnvOrigins(process.env.CLIENT_URLS),
    ];
    const normalized = configured
        .map((origin) => normalizeOrigin(origin))
        .filter((origin) => Boolean(origin));
    return Array.from(new Set(normalized));
};
exports.getConfiguredClientOrigins = getConfiguredClientOrigins;
const getPrimaryClientOrigin = () => (0, exports.getConfiguredClientOrigins)()[0] || null;
exports.getPrimaryClientOrigin = getPrimaryClientOrigin;
const isTrustedClientOrigin = (value) => {
    const origin = normalizeOrigin(value);
    if (!origin)
        return false;
    return (0, exports.getConfiguredClientOrigins)().includes(origin);
};
exports.isTrustedClientOrigin = isTrustedClientOrigin;
const isCorsOriginAllowed = (value) => {
    // Requests without an Origin header are not browser CORS requests. This keeps health checks,
    // server-to-server calls, CLI tools, and signed Stripe webhooks working.
    if (!value)
        return true;
    return (0, exports.isTrustedClientOrigin)(value);
};
exports.isCorsOriginAllowed = isCorsOriginAllowed;
