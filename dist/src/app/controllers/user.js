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
    static sanitizeUserUpdatePayload = (payload, isAdmin) => {
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
        if (isAdmin) {
            if (payload.username != null)
                data.username = String(payload.username).trim();
            if (payload.role != null)
                data.role = String(payload.role).trim().toUpperCase();
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
            const newUser = req.body;
            if (newUser.password) {
                newUser.password = await bcryptjs_1.default.hash(String(newUser.password), 10);
            }
            const user = await user_1.default.create(newUser);
            res.status(201).json(serializeUser(user));
        }
        catch (error) {
            console.error(error);
            res.status(500).send(error);
        }
    };
    static updateUser = async (req, res) => {
        try {
            const id = Number(req.params.id);
            const sessionUser = req.user;
            const role = String(sessionUser?.role || '').toUpperCase();
            const isAdmin = role === 'ADMIN' || role === 'SUPER';
            const updatedUser = UserController.sanitizeUserUpdatePayload(req.body || {}, isAdmin);
            if (Object.keys(updatedUser).length === 0) {
                return res.status(400).json({ message: 'No valid fields provided for update' });
            }
            if (updatedUser.password) {
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
            res.status(500).send(error);
        }
    };
    static deleteUser = async (req, res) => {
        try {
            const id = Number(req.params.id);
            const user = await user_1.default.delete(id);
            res.status(200).json(user);
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
                where: { userId },
                select: { leagueId: true },
            });
            const leagues = await prisma_1.prisma.league.findMany({
                where: { id: { in: leagueIds.map((l) => l.leagueId) } },
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
