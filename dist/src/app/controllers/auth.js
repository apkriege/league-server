"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("express-session");
const prisma_1 = require("../../prisma");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const user_1 = __importDefault(require("../models/user"));
const billing_1 = require("../utils/billing");
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
class AuthController {
    static async register(req, res) {
        try {
            const { firstName, lastName, email, password } = req.body || {};
            if (!firstName || !lastName || !email || !password) {
                return res
                    .status(400)
                    .json({ message: 'First name, last name, email, and password are required' });
            }
            const normalizedEmail = String(email).trim().toLowerCase();
            const existingUser = await user_1.default.findByEmail(normalizedEmail);
            if (existingUser) {
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
                    console.error('Session regenerate error:', err);
                    return res.status(500).json({ message: 'Server error' });
                }
                req.session.userId = user.id;
                req.session.save((saveErr) => {
                    if (saveErr) {
                        console.error('Session save error:', saveErr);
                        return res.status(500).json({ message: 'Server error' });
                    }
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
            if (!normalizedEmail || !password) {
                return res.status(400).json({ message: 'Email and password are required' });
            }
            const user = await user_1.default.findByEmail(normalizedEmail);
            if (!user || user.deletedAt) {
                return res.status(400).json({ message: 'Invalid credentials' });
            }
            const isPasswordValid = await bcryptjs_1.default.compare(String(password), String(user.password || ''));
            if (!isPasswordValid) {
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
                    console.error('Session regenerate error:', err);
                    return res.status(500).json({ message: 'Server error' });
                }
                req.session.userId = user.id;
                req.session.save((saveErr) => {
                    if (saveErr) {
                        console.error('Session save error:', saveErr);
                        return res.status(500).json({ message: 'Server error' });
                    }
                    res.json({ message: 'Login successful', user: userWithLeagues });
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
                    console.error('Session destroy error:', err);
                    return res.status(500).json({ message: 'Server error' });
                }
                res.clearCookie('connect.sid'); // Default session cookie name
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
                return res.status(401).json({ message: 'Not authenticated' });
            }
            const user = await user_1.default.findById(req.session.userId);
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }
            res.json({ user: serializeUser(user) });
        }
        catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Server error' });
        }
    }
}
exports.default = AuthController;
