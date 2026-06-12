"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeOrigin = exports.isTrustedClientOrigin = exports.getPrimaryClientOrigin = exports.getConfiguredClientOrigins = void 0;
const normalizeOrigin = (value) => {
    try {
        return new URL(value).origin;
    }
    catch {
        return null;
    }
};
exports.normalizeOrigin = normalizeOrigin;
const splitEnvOrigins = (value) => String(value || '')
    .split(',')
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
