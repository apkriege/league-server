"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../../prisma");
class AdminController {
    static getLeagues = async (req, res) => {
        try {
            const { user } = req; // Assuming you have user info in the request object
            const role = String(user?.role || '').toUpperCase();
            const isSuperAdmin = role === 'SUPER';
            const leagues = await prisma_1.prisma.league.findMany({
                where: isSuperAdmin
                    ? undefined
                    : {
                        adminId: user.id, // Filter leagues by the admin's user ID
                    },
                include: {
                    _count: {
                        select: {
                            players: true,
                            events: true,
                        },
                    },
                },
                orderBy: {
                    id: 'desc',
                },
            });
            return res.json(leagues);
        }
        catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Internal server error' });
        }
    };
    static getLeague = async (req, res) => {
        try {
            const { user } = req;
            const role = String(user?.role || '').toUpperCase();
            const isSuperAdmin = role === 'SUPER';
            const leagueId = Number(req.params.id);
            const league = await prisma_1.prisma.league.findFirst({
                where: {
                    id: leagueId,
                    ...(isSuperAdmin ? {} : { adminId: user.id }), // Ensure the league belongs to the admin
                },
                include: {
                    events: true,
                    players: true,
                    teams: {
                        include: {
                            players: true,
                        },
                    },
                },
            });
            if (!league) {
                return res.status(404).json({ message: 'League not found' });
            }
            return res.json(league);
        }
        catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Internal server error' });
        }
    };
}
exports.default = AdminController;
