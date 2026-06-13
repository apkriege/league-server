"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAuthFailure = exports.logAuth = exports.requestLogger = exports.requestId = exports.logError = exports.logWarn = exports.logInfo = void 0;
const crypto_1 = __importDefault(require("crypto"));
const shouldLogDebug = () => process.env.LOG_LEVEL === 'debug' || process.env.SESSION_DEBUG === 'true';
const getCookieNames = (cookieHeader) => {
    if (!cookieHeader)
        return [];
    return cookieHeader
        .split(';')
        .map((cookie) => cookie.trim().split('=')[0])
        .filter(Boolean);
};
const baseLog = (req) => ({
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    origin: req.headers.origin || null,
    referer: req.headers.referer || null,
    userAgent: req.headers['user-agent'] || null,
    ip: req.ip,
    forwardedProto: req.headers['x-forwarded-proto'] || null,
    forwardedHost: req.headers['x-forwarded-host'] || null,
    hasCookieHeader: Boolean(req.headers.cookie),
    cookieNames: getCookieNames(req.headers.cookie),
    sessionId: req.sessionID || null,
    sessionUserId: req.session?.userId || null,
});
const logInfo = (event, payload) => {
    console.log(JSON.stringify({ level: 'info', event, ...payload }));
};
exports.logInfo = logInfo;
const logWarn = (event, payload) => {
    console.warn(JSON.stringify({ level: 'warn', event, ...payload }));
};
exports.logWarn = logWarn;
const logError = (event, payload) => {
    console.error(JSON.stringify({ level: 'error', event, ...payload }));
};
exports.logError = logError;
const requestId = (req, res, next) => {
    const incomingRequestId = req.headers['x-request-id'];
    const id = typeof incomingRequestId === 'string' && incomingRequestId.trim()
        ? incomingRequestId.trim()
        : crypto_1.default.randomUUID();
    req.requestId = id;
    res.setHeader('X-Request-Id', id);
    next();
};
exports.requestId = requestId;
const requestLogger = (req, res, next) => {
    const start = Date.now();
    if (shouldLogDebug()) {
        (0, exports.logInfo)('request:start', baseLog(req));
    }
    res.on('finish', () => {
        const statusCode = res.statusCode;
        const isError = statusCode >= 400;
        const payload = {
            ...baseLog(req),
            statusCode,
            durationMs: Date.now() - start,
            setCookie: Boolean(res.getHeader('set-cookie')),
        };
        if (isError) {
            (0, exports.logWarn)('request:finish', payload);
            return;
        }
        (0, exports.logInfo)('request:finish', payload);
    });
    next();
};
exports.requestLogger = requestLogger;
const logAuth = (req, event, payload = {}) => {
    (0, exports.logInfo)(event, {
        ...baseLog(req),
        ...payload,
    });
};
exports.logAuth = logAuth;
const logAuthFailure = (req, event, payload = {}) => {
    (0, exports.logWarn)(event, {
        ...baseLog(req),
        ...payload,
    });
};
exports.logAuthFailure = logAuthFailure;
