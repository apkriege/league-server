"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateLeagueAccessCode = void 0;
require("express-session");
const prisma_1 = require("../../prisma");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = __importDefault(require("crypto"));
const user_1 = __importDefault(require("../models/user"));
const billing_1 = require("../utils/billing");
const logging_1 = require("../middleware/logging");
const serializeUser = (user, extra = {}) => ({
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    phone: user.phone ?? null,
    metadata: user.metadata ?? null,
    ...extra,
});
const serializeLeagueViewer = (league) => ({
    id: `league-viewer-${league.id}`,
    firstName: 'League',
    lastName: 'Viewer',
    email: '',
    role: 'VIEWER',
    phone: null,
    metadata: { accessType: 'league-code' },
    leagues: [{ id: league.id, playerId: null, access: 'viewer' }],
    leagueAccess: { leagueId: league.id, leagueName: league.name },
});
const normalizeAccessCode = (code) => String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
class AuthController {
    static async register(req, res) {
        try {
            const { firstName, lastName, email, password } = req.body || {};
            (0, logging_1.logAuth)(req, 'auth:register:start', { emailProvided: Boolean(email) });
            if (!firstName || !lastName || !email || !password) {
                (0, logging_1.logAuthFailure)(req, 'auth:register:invalid', { reason: 'missing-fields' });
                return res
                    .status(400)
                    .json({ message: 'First name, last name, email, and password are required' });
            }
            if (String(password).length < 10) {
                return res.status(400).json({ message: 'Password must be at least 10 characters' });
            }
            const normalizedEmail = String(email).trim().toLowerCase();
            const existingUser = await user_1.default.findByEmail(normalizedEmail);
            if (existingUser) {
                (0, logging_1.logAuthFailure)(req, 'auth:register:invalid', {
                    reason: 'user-exists',
                    email: normalizedEmail,
                });
                return res.status(400).json({ message: 'User already exists' });
            }
            const hashedPassword = await bcryptjs_1.default.hash(String(password), 10);
            const user = await user_1.default.create({
                firstName: String(firstName).trim(),
                lastName: String(lastName).trim(),
                email: normalizedEmail,
                username: normalizedEmail,
                password: hashedPassword,
                role: 'ADMIN',
                metadata: {
                    billing: {
                        includedGolfers: 0,
                        minimumGolfers: billing_1.BILLING_MIN_GOLFERS,
                        pricePerGolferCents: billing_1.BILLING_PRICE_PER_GOLFER_CENTS,
                        currency: billing_1.BILLING_CURRENCY,
                    },
                },
            });
            req.session.regenerate((err) => {
                if (err) {
                    (0, logging_1.logAuthFailure)(req, 'auth:session:regenerate-failed', {
                        flow: 'register',
                        error: err.message,
                    });
                    return res.status(500).json({ message: 'Server error' });
                }
                req.session.userId = user.id;
                req.session.save((saveErr) => {
                    if (saveErr) {
                        (0, logging_1.logAuthFailure)(req, 'auth:session:save-failed', {
                            flow: 'register',
                            userId: user.id,
                            error: saveErr.message,
                        });
                        return res.status(500).json({ message: 'Server error' });
                    }
                    (0, logging_1.logAuth)(req, 'auth:register:success', { userId: user.id, sessionId: req.sessionID });
                    return res.status(201).json({
                        message: 'User created',
                        user: serializeUser(user, { leagues: [] }),
                    });
                });
            });
        }
        catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Server error' });
        }
    }
    static async login(req, res) {
        try {
            const { email, password } = req.body || {};
            const normalizedEmail = String(email || '')
                .trim()
                .toLowerCase();
            (0, logging_1.logAuth)(req, 'auth:login:start', { email: normalizedEmail || null });
            if (!normalizedEmail || !password) {
                (0, logging_1.logAuthFailure)(req, 'auth:login:invalid', { reason: 'missing-email-or-password' });
                return res.status(400).json({ message: 'Email and password are required' });
            }
            const user = await user_1.default.findByEmail(normalizedEmail);
            if (!user || user.deletedAt) {
                (0, logging_1.logAuthFailure)(req, 'auth:login:invalid', { reason: 'user-not-found-or-deleted' });
                return res.status(400).json({ message: 'Invalid credentials' });
            }
            const isPasswordValid = await bcryptjs_1.default.compare(String(password), String(user.password || ''));
            if (!isPasswordValid) {
                (0, logging_1.logAuthFailure)(req, 'auth:login:invalid', { reason: 'bad-password', userId: user.id });
                return res.status(400).json({ message: 'Invalid credentials' });
            }
            const ids = await prisma_1.prisma.player.findMany({
                where: { userId: user.id, deletedAt: null },
                select: { id: true, leagueId: true },
            });
            const userWithLeagues = {
                ...serializeUser(user),
                leagues: ids.map((i) => ({ id: i.leagueId, playerId: i.id })),
            };
            req.session.regenerate((err) => {
                if (err) {
                    (0, logging_1.logAuthFailure)(req, 'auth:session:regenerate-failed', {
                        flow: 'login',
                        userId: user.id,
                        error: err.message,
                    });
                    return res.status(500).json({ message: 'Server error' });
                }
                req.session.userId = user.id;
                req.session.save((saveErr) => {
                    if (saveErr) {
                        (0, logging_1.logAuthFailure)(req, 'auth:session:save-failed', {
                            flow: 'login',
                            userId: user.id,
                            error: saveErr.message,
                        });
                        return res.status(500).json({ message: 'Server error' });
                    }
                    (0, logging_1.logAuth)(req, 'auth:login:success', {
                        userId: user.id,
                        sessionId: req.sessionID,
                        leagueCount: userWithLeagues.leagues.length,
                    });
                    res.json({ message: 'Login successful', user: userWithLeagues });
                });
            });
        }
        catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Server error' });
        }
    }
    static async loginWithLeagueCode(req, res) {
        try {
            const accessCode = normalizeAccessCode(req.body?.code);
            (0, logging_1.logAuth)(req, 'auth:league-code-login:start', { codeProvided: Boolean(accessCode) });
            if (!accessCode) {
                (0, logging_1.logAuthFailure)(req, 'auth:league-code-login:invalid', { reason: 'missing-code' });
                return res.status(400).json({ message: 'League access code is required' });
            }
            const league = await prisma_1.prisma.league.findFirst({
                where: {
                    viewerAccessCode: accessCode,
                    deletedAt: null,
                },
                select: {
                    id: true,
                    name: true,
                },
            });
            if (!league) {
                (0, logging_1.logAuthFailure)(req, 'auth:league-code-login:invalid', { reason: 'bad-code' });
                return res.status(400).json({ message: 'Invalid league access code' });
            }
            req.session.regenerate((err) => {
                if (err) {
                    (0, logging_1.logAuthFailure)(req, 'auth:session:regenerate-failed', {
                        flow: 'league-code-login',
                        leagueId: league.id,
                        error: err.message,
                    });
                    return res.status(500).json({ message: 'Server error' });
                }
                req.session.leagueAccess = { leagueIds: [league.id] };
                req.session.save((saveErr) => {
                    if (saveErr) {
                        (0, logging_1.logAuthFailure)(req, 'auth:session:save-failed', {
                            flow: 'league-code-login',
                            leagueId: league.id,
                            error: saveErr.message,
                        });
                        return res.status(500).json({ message: 'Server error' });
                    }
                    (0, logging_1.logAuth)(req, 'auth:league-code-login:success', {
                        leagueId: league.id,
                        sessionId: req.sessionID,
                    });
                    return res.json({
                        message: 'League access granted',
                        user: serializeLeagueViewer(league),
                        leagueId: league.id,
                    });
                });
            });
        }
        catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Server error' });
        }
    }
    static async logout(req, res) {
        try {
            req.session.destroy((err) => {
                if (err) {
                    (0, logging_1.logAuthFailure)(req, 'auth:logout:failed', { error: err.message });
                    return res.status(500).json({ message: 'Server error' });
                }
                (0, logging_1.logAuth)(req, 'auth:logout:success');
                res.clearCookie('connect.sid');
                res.json({ message: 'Logout successful' });
            });
        }
        catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Server error' });
        }
    }
    static async getProfile(req, res) {
        try {
            if (!req.session.userId) {
                (0, logging_1.logAuthFailure)(req, 'auth:me:unauthorized', { reason: 'missing-session-user' });
                return res.status(401).json({ message: 'Not authenticated' });
            }
            const user = await user_1.default.findById(req.session.userId);
            if (!user) {
                (0, logging_1.logAuthFailure)(req, 'auth:me:not-found', { userId: req.session.userId });
                return res.status(404).json({ message: 'User not found' });
            }
            (0, logging_1.logAuth)(req, 'auth:me:success', { userId: user.id });
            res.json({ user: serializeUser(user) });
        }
        catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Server error' });
        }
    }
}
const generateLeagueAccessCode = () => crypto_1.default.randomBytes(4).toString('hex').toUpperCase();
exports.generateLeagueAccessCode = generateLeagueAccessCode;
exports.default = AuthController;
