"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const user_1 = __importDefault(require("../models/user"));
const prisma_1 = require("../../prisma");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const serializeUser = (user) => ({
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    username: user.username,
    role: user.role,
    phone: user.phone,
    metadata: user.metadata,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    deletedAt: user.deletedAt,
});
class UserController {
    static sanitizeUserUpdatePayload = (payload, canManageRoles) => {
        const data = {};
        if (payload.firstName != null)
            data.firstName = String(payload.firstName).trim();
        if (payload.lastName != null)
            data.lastName = String(payload.lastName).trim();
        if (payload.email != null)
            data.email = String(payload.email).trim().toLowerCase();
        if (payload.phone !== undefined)
            data.phone = payload.phone ? String(payload.phone).trim() : null;
        if (payload.password)
            data.password = payload.password;
        if (canManageRoles) {
            if (payload.username != null)
                data.username = String(payload.username).trim();
            if (payload.role != null) {
                const role = String(payload.role).trim().toUpperCase();
                if (!['USER', 'ADMIN', 'SUPER'].includes(role)) {
                    throw new Error('Invalid user role');
                }
                data.role = role;
            }
        }
        return data;
    };
    static getUsers = async (req, res) => {
        try {
            const users = await user_1.default.findAll();
            res.status(200).json(users.map(serializeUser));
        }
        catch (error) {
            console.error(error);
            res.status(500).send(error);
        }
    };
    static getUserById = async (req, res) => {
        try {
            const id = Number(req.params.id);
            const user = await user_1.default.findById(id);
            if (!user) {
                res.status(404).send({ message: 'User not found' });
                return;
            }
            res.status(200).json(serializeUser(user));
        }
        catch (error) {
            console.error(error);
            res.status(500).send(error);
        }
    };
    static getProfile = async (req, res) => {
        try {
            const { email } = req.user;
            const user = await user_1.default.findByEmail(email);
            if (!user) {
                res.status(404).send({ message: 'User not found' });
                return;
            }
            res.status(200).json(serializeUser(user));
        }
        catch (error) {
            console.error(error);
            res.status(500).send(error);
        }
    };
    static createUser = async (req, res) => {
        try {
            const newUser = UserController.sanitizeUserUpdatePayload(req.body || {}, true);
            if (!newUser.firstName || !newUser.lastName || !newUser.email || !newUser.password) {
                return res.status(400).json({ message: 'First name, last name, email, and password are required' });
            }
            if (String(newUser.password).length < 10) {
                return res.status(400).json({ message: 'Password must be at least 10 characters' });
            }
            if (newUser.password) {
                newUser.password = await bcryptjs_1.default.hash(String(newUser.password), 10);
            }
            const user = await user_1.default.create(newUser);
            res.status(201).json(serializeUser(user));
        }
        catch (error) {
            console.error(error);
            if (error instanceof Error && error.message === 'Invalid user role') {
                return res.status(400).json({ message: error.message });
            }
            res.status(500).send(error);
        }
    };
    static updateUser = async (req, res) => {
        try {
            const id = Number(req.params.id);
            const sessionUser = req.user;
            const role = String(sessionUser?.role || '').toUpperCase();
            const canManageRoles = role === 'SUPER';
            const updatedUser = UserController.sanitizeUserUpdatePayload(req.body || {}, canManageRoles);
            if (Object.keys(updatedUser).length === 0) {
                return res.status(400).json({ message: 'No valid fields provided for update' });
            }
            if (updatedUser.password) {
                if (String(updatedUser.password).length < 10) {
                    return res.status(400).json({ message: 'Password must be at least 10 characters' });
                }
                updatedUser.password = await bcryptjs_1.default.hash(String(updatedUser.password), 10);
            }
            const user = await user_1.default.update(id, updatedUser);
            if (!user) {
                res.status(404).send({ message: 'User not found' });
                return;
            }
            res.status(200).json(serializeUser(user));
        }
        catch (error) {
            console.error(error);
            if (error instanceof Error && error.message === 'Invalid user role') {
                return res.status(400).json({ message: error.message });
            }
            res.status(500).send(error);
        }
    };
    static deleteUser = async (req, res) => {
        try {
            const id = Number(req.params.id);
            const activeManagedLeagues = await prisma_1.prisma.league.count({
                where: { adminId: id, deletedAt: null },
            });
            if (activeManagedLeagues > 0) {
                return res.status(409).json({
                    message: 'Transfer or delete active leagues before deleting this account',
                });
            }
            const user = await user_1.default.delete(id);
            res.status(200).json({ message: 'User deleted' });
        }
        catch (error) {
            console.error(error);
            res.status(500).send(error);
        }
    };
    static getUserLeagues = async (req, res) => {
        try {
            const userId = Number(req.params.id);
            const leagueIds = await prisma_1.prisma.player.findMany({
                where: { userId, deletedAt: null },
                select: { leagueId: true },
            });
            const leagues = await prisma_1.prisma.league.findMany({
                where: { id: { in: leagueIds.map((l) => l.leagueId) }, deletedAt: null },
            });
            if (!leagues) {
                res.status(404).send({ message: 'Leagues not found for user' });
                return;
            }
            res.status(200).json(leagues);
        }
        catch (error) {
            console.error(error);
            res.status(500).send(error);
        }
    };
}
exports.default = UserController;
