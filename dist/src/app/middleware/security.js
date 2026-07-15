"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRateLimiter = exports.requireTrustedOrigin = void 0;
const origins_1 = require("../utils/origins");
const requireTrustedOrigin = (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) {
        return next();
    }
    const origin = req.headers.origin;
    if (!origin || (0, origins_1.isTrustedClientOrigin)(origin)) {
        return next();
    }
    return res.status(403).json({ message: 'Request origin is not allowed' });
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
