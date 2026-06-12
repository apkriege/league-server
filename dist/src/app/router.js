"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_guard_1 = require("./middleware/auth-guard");
const user_1 = __importDefault(require("./controllers/user"));
const team_1 = __importDefault(require("./controllers/team"));
const league_1 = __importDefault(require("./controllers/league"));
const club_1 = __importDefault(require("./controllers/club"));
const course_1 = __importDefault(require("./controllers/course"));
const event_1 = __importDefault(require("./controllers/event"));
const player_1 = __importDefault(require("./controllers/player"));
const round_1 = __importDefault(require("./controllers/round"));
const auth_1 = __importDefault(require("./controllers/auth"));
const flight_1 = __importDefault(require("./controllers/flight"));
const admin_1 = __importDefault(require("./controllers/admin"));
const payment_1 = __importDefault(require("./controllers/payment"));
const test_1 = __importDefault(require("./controllers/test"));
const security_1 = require("./middleware/security");
const router = express_1.default.Router();
const authRateLimiter = (0, security_1.createRateLimiter)({ keyPrefix: 'auth', windowMs: 15 * 60 * 1000, max: 20 });
const paymentRateLimiter = (0, security_1.createRateLimiter)({
    keyPrefix: 'payment',
    windowMs: 15 * 60 * 1000,
    max: 10,
});
router.get('/test-handicap', auth_guard_1.adminGuard, test_1.default.fullHandicapTest);
// =====================
// AUTH ROUTES
// =====================
router.post('/auth/login', authRateLimiter, auth_1.default.login);
router.post('/auth/register', authRateLimiter, auth_1.default.register);
router.post('/auth/logout', auth_guard_1.userGuard, auth_1.default.logout);
router.get('/auth/me', auth_guard_1.userGuard, auth_1.default.getProfile);
// =====================
// PAYMENT ROUTES
// =====================
router.post('/payments/checkout-session', auth_guard_1.userGuard, paymentRateLimiter, payment_1.default.createCheckoutSession);
router.get('/payments/stripe-state', auth_guard_1.userGuard, paymentRateLimiter, payment_1.default.getStripeState);
// =====================
// ADMIN ROUTES
// =====================
const adminRoutes = express_1.default.Router();
router.get('/admin/leagues', auth_guard_1.adminGuard, admin_1.default.getLeagues);
router.get('/admin/leagues/:id', auth_guard_1.adminGuard, admin_1.default.getLeague);
router.use('/admin', auth_guard_1.adminGuard, adminRoutes); // Uncomment to enable admin routes
// =====================
// PUBLIC ROUTES
// =====================
// Users
router.get('/users', auth_guard_1.adminGuard, user_1.default.getUsers);
router.get('/users/:id', auth_guard_1.userSelfOrAdminGuard, user_1.default.getUserById);
router.get('/users/:id/leagues', auth_guard_1.userSelfOrAdminGuard, user_1.default.getUserLeagues);
router.post('/users', auth_guard_1.adminGuard, user_1.default.createUser);
router.put('/users/:id', auth_guard_1.userSelfOrAdminGuard, user_1.default.updateUser);
router.delete('/users/:id', auth_guard_1.userSelfOrAdminGuard, user_1.default.deleteUser);
// Clubs
router.get('/clubs', club_1.default.getClubs);
router.get('/clubs/:id', club_1.default.getClub);
router.post('/clubs', auth_guard_1.superAdminGuard, club_1.default.createClub);
router.put('/clubs/:id', auth_guard_1.superAdminGuard, club_1.default.updateClub);
// Courses
router.get('/courses', course_1.default.getCourses);
router.get('/courses/:id', course_1.default.getCourse);
router.post('/courses', auth_guard_1.superAdminGuard, course_1.default.createCourse);
router.put('/courses/:id', auth_guard_1.superAdminGuard, course_1.default.updateCourse);
router.delete('/courses/:id', auth_guard_1.superAdminGuard, course_1.default.deleteCourse);
// Leagues
router.get('/leagues', auth_guard_1.userGuard, league_1.default.getLeagues);
router.get('/leagues/:id', auth_guard_1.leagueMemberGuard, league_1.default.getLeague);
router.get('/leagues/:id/metrics', auth_guard_1.leagueMemberGuard, league_1.default.getLeagueMetrics);
router.post('/leagues', auth_guard_1.userGuard, league_1.default.createLeague);
router.put('/leagues/:id', auth_guard_1.leagueAdminGuard, league_1.default.updateLeague);
router.delete('/leagues/:id', auth_guard_1.leagueAdminGuard, league_1.default.deleteLeague);
// League Players & Teams
router.get('/leagues/:leagueId/players', auth_guard_1.leagueMemberGuard, player_1.default.getLeaguePlayers);
router.post('/leagues/:leagueId/players', auth_guard_1.leagueAdminGuard, player_1.default.createPlayer);
router.get('/leagues/:leagueId/teams', auth_guard_1.leagueMemberGuard, team_1.default.getLeagueTeams);
router.post('/leagues/:leagueId/teams', auth_guard_1.leagueAdminGuard, team_1.default.createTeam);
// League Events
router.get('/leagues/:leagueId/events', auth_guard_1.leagueMemberGuard, event_1.default.getLeagueEvents);
router.get('/leagues/:leagueId/events/:eventId', auth_guard_1.leagueMemberGuard, event_1.default.getLeagueEvent);
router.get('/leagues/:leagueId/events/:eventId/scores', auth_guard_1.leagueMemberGuard, round_1.default.getLeagueEventScores);
router.post('/leagues/:leagueId/event', auth_guard_1.leagueAdminGuard, event_1.default.createEvent);
router.post('/leagues/:leagueId/events', auth_guard_1.leagueAdminGuard, event_1.default.createMultipleEvents);
router.put('/leagues/:leagueId/events/:eventId', auth_guard_1.leagueAdminGuard, event_1.default.updateEvent);
router.post('/leagues/:leagueId/events/:eventId/scores', auth_guard_1.eventAdminGuard, round_1.default.createLeagueEventScores);
router.put('/leagues/:leagueId/events/:eventId/scores', auth_guard_1.eventAdminGuard, round_1.default.updateLeagueEventScores);
// Flights
router.put('/flights/:flightId/players', auth_guard_1.flightAdminGuard, flight_1.default.updateFlightPlayers);
// player
router.get('/players', auth_guard_1.adminGuard, player_1.default.getPlayers);
router.get('/players/:id', auth_guard_1.playerMemberGuard, player_1.default.getPlayer);
router.put('/players/:id', auth_guard_1.playerAdminGuard, player_1.default.updatePlayer);
router.delete('/players/:id', auth_guard_1.playerAdminGuard, player_1.default.deletePlayer);
router.get('/leagues/:leagueId/players/:playerId/stats', auth_guard_1.leagueMemberGuard, player_1.default.getPlayerStats);
// team
router.get('/teams/:id', auth_guard_1.teamMemberGuard, team_1.default.getTeam);
router.put('/teams/:id', auth_guard_1.teamAdminGuard, team_1.default.updateTeam);
router.delete('/teams/:id', auth_guard_1.teamAdminGuard, team_1.default.deleteTeam);
exports.default = router;
