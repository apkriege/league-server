"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRateLimiter = exports.requireTrustedOrigin = void 0;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const normalizeOrigin = (value) => {
    try {
        return new URL(value).origin;
    }
    catch {
        return null;
    }
};
const configuredClientOrigin = normalizeOrigin(process.env.CLIENT_URL || '');
const requireTrustedOrigin = (req, res, next) => {
    if (SAFE_METHODS.has(req.method.toUpperCase())) {
        return next();
    }
    if (!configuredClientOrigin) {
        return res.status(500).json({ message: 'Server origin configuration is invalid' });
    }
    const originHeader = typeof req.headers.origin === 'string' ? req.headers.origin : '';
    const refererHeader = typeof req.headers.referer === 'string' ? req.headers.referer : '';
    const requestOrigin = normalizeOrigin(originHeader) || normalizeOrigin(refererHeader);
    if (!requestOrigin) {
        if (process.env.NODE_ENV !== 'production') {
            return next();
        }
        return res.status(403).json({ message: 'Untrusted request origin' });
    }
    if (requestOrigin !== configuredClientOrigin) {
        return res.status(403).json({ message: 'Untrusted request origin' });
    }
    return next();
};
exports.requireTrustedOrigin = requireTrustedOrigin;
const createRateLimiter = ({ keyPrefix, windowMs, max }) => {
    const hits = new Map();
    return (req, res, next) => {
        const now = Date.now();
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        const sessionUserId = req.session?.userId ? `user:${req.session.userId}` : `ip:${ip}`;
        const key = `${keyPrefix}:${sessionUserId}`;
        const current = hits.get(key);
        if (!current || current.resetAt <= now) {
            hits.set(key, { count: 1, resetAt: now + windowMs });
            return next();
        }
        if (current.count >= max) {
            res.setHeader('Retry-After', String(Math.ceil((current.resetAt - now) / 1000)));
            return res.status(429).json({ message: 'Too many requests. Please try again later.' });
        }
        current.count += 1;
        hits.set(key, current);
        return next();
    };
};
exports.createRateLimiter = createRateLimiter;
