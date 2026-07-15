"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const router_1 = __importDefault(require("./app/router"));
const cors_1 = __importDefault(require("cors"));
const express_session_1 = __importDefault(require("express-session"));
const dotenv_1 = __importDefault(require("dotenv"));
const connect_pg_simple_1 = __importDefault(require("connect-pg-simple"));
const pg_1 = __importDefault(require("pg"));
dotenv_1.default.config();
const payment_1 = __importDefault(require("./app/controllers/payment"));
const health_1 = __importDefault(require("./app/controllers/health"));
const security_1 = require("./app/middleware/security");
const logging_1 = require("./app/middleware/logging");
const error_response_1 = require("./app/utils/error-response");
const origins_1 = require("./app/utils/origins");
const app = (0, express_1.default)();
const sessionSecret = process.env.SESSION_SECRET;
const isRailway = Boolean(process.env.RAILWAY_ENVIRONMENT) ||
    Boolean(process.env.RAILWAY_PROJECT_ID) ||
    Boolean(process.env.RAILWAY_SERVICE_ID);
const useSecureCookies = process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production' || isRailway;
const sessionCookieName = process.env.SESSION_COOKIE_NAME || 'connect.sid';
app.set('trust proxy', true);
if (!sessionSecret) {
    throw new Error('Missing SESSION_SECRET');
}
(0, logging_1.logInfo)('server:config', {
    nodeEnv: process.env.NODE_ENV ?? null,
    railwayEnvironment: process.env.RAILWAY_ENVIRONMENT ?? null,
    useSecureCookies,
    sessionCookieName,
    sessionSameSite: useSecureCookies ? 'none' : 'lax',
    trustProxy: true,
});
const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || (0, origins_1.isTrustedClientOrigin)(origin)) {
            callback(null, true);
            return;
        }
        callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Access-Control-Allow-Origin',
    ],
    optionsSuccessStatus: 200,
};
app.use(logging_1.requestId);
app.use(logging_1.requestLogger);
app.use((0, cors_1.default)(corsOptions));
app.options('*', (0, cors_1.default)(corsOptions));
// Stripe webhook must use the raw request body, so it is mounted before JSON parsing middleware.
app.post('/api/payments/webhook', express_1.default.raw({ type: 'application/json' }), payment_1.default.handleWebhook);
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
const pgSession = (0, connect_pg_simple_1.default)(express_session_1.default);
const pool = new pg_1.default.Pool({
    connectionString: process.env.DATABASE_URL,
});
app.use((0, express_session_1.default)({
    name: sessionCookieName,
    store: new pgSession({
        pool: pool,
        tableName: 'session',
    }),
    proxy: useSecureCookies,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: useSecureCookies,
        httpOnly: true,
        sameSite: useSecureCookies ? 'none' : 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 7,
    },
}));
app.get('/', (req, res) => {
    res.send('Hello, TypeScript with Express!');
});
// API routes
app.use('/api', security_1.requireTrustedOrigin, router_1.default);
app.get('/health', health_1.default.getHealth);
// High-level error handling
app.use((err, req, res, next) => {
    const errorResponse = (0, error_response_1.getPublicErrorResponse)(err);
    const name = err.name || 'Error';
    (0, logging_1.logError)('request:error', {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        name,
        message: err.message,
        stack: process.env.LOG_LEVEL === 'debug' ? err.stack : undefined,
    });
    res.status(errorResponse.status).json({
        name,
        message: errorResponse.message,
        requestId: req.requestId,
    });
});
exports.default = app;
