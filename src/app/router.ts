import express, { Router } from 'express';
import {
  adminGuard as admin,
  eventAdminGuard,
  flightAdminGuard,
  leagueMemberGuard,
  leagueAdminGuard,
  playerMemberGuard,
  playerAdminGuard,
  superAdminGuard as superAdmin,
  teamMemberGuard,
  teamAdminGuard,
  userGuard as user,
  userSelfOrAdminGuard,
} from './middleware/auth-guard';
import User from './controllers/user';
import Team from './controllers/team';
import League from './controllers/league';
import Club from './controllers/club';
import Course from './controllers/course';
import Event from './controllers/event';
import Player from './controllers/player';
import Score from './controllers/round';
import Auth from './controllers/auth';
import Flight from './controllers/flight';
import Admin from './controllers/admin';
import Payment from './controllers/payment';
import Operations from './controllers/operations';
import TestController from './controllers/test';
import HealthController from './controllers/health';
import { createRateLimiter } from './middleware/security';

const router: Router = express.Router();
const authRateLimiter = createRateLimiter({ keyPrefix: 'auth', windowMs: 15 * 60 * 1000, max: 20 });
const paymentRateLimiter = createRateLimiter({
  keyPrefix: 'payment',
  windowMs: 15 * 60 * 1000,
  max: 10,
});

router.get('/test-handicap', admin, TestController.fullHandicapTest);
router.get('/health', HealthController.getHealth);

// =====================
// AUTH ROUTES
// =====================
router.post('/auth/login', authRateLimiter, Auth.login);
router.post('/auth/register', authRateLimiter, Auth.register);
router.get('/auth/debug-session', Auth.debugSession);
router.post('/auth/logout', user, Auth.logout);
router.get('/auth/me', user, Auth.getProfile);

// =====================
// PAYMENT ROUTES
// =====================
router.post('/payments/checkout-session', user, paymentRateLimiter, Payment.createCheckoutSession);
router.get('/payments/stripe-state', user, paymentRateLimiter, Payment.getStripeState);

// =====================
// OPERATIONS ROUTES
// =====================
router.get('/notifications', user, Operations.getNotifications);
router.put('/notifications/:id/read', user, Operations.markNotificationRead);
router.get('/invitations/:token', Operations.getInvitationByToken);
router.post('/invitations/:token/claim', user, Operations.claimInvitation);
router.get('/leagues/:leagueId/invitations', leagueAdminGuard, Operations.getLeagueInvitations);
router.post('/leagues/:leagueId/invitations', leagueAdminGuard, Operations.createLeagueInvitations);
router.delete(
  '/leagues/:leagueId/invitations/:invitationId',
  leagueAdminGuard,
  Operations.revokeLeagueInvitation,
);
router.get('/leagues/:leagueId/onboarding', leagueAdminGuard, Operations.getLeagueOnboarding);
router.put('/leagues/:leagueId/onboarding', leagueAdminGuard, Operations.updateLeagueOnboarding);
router.get('/leagues/:leagueId/audit-logs', leagueAdminGuard, Operations.getLeagueAuditLogs);
router.post('/leagues/:leagueId/notifications', leagueAdminGuard, Operations.createLeagueNotification);

// =====================
// ADMIN ROUTES
// =====================
const adminRoutes = express.Router();
router.get('/admin/leagues', admin, Admin.getLeagues);
router.get('/admin/leagues/:id', admin, Admin.getLeague);
router.use('/admin', admin, adminRoutes); // Uncomment to enable admin routes

// =====================
// PUBLIC ROUTES
// =====================

// Users
router.get('/users', admin, User.getUsers);
router.get('/users/:id', userSelfOrAdminGuard, User.getUserById);
router.get('/users/:id/leagues', userSelfOrAdminGuard, User.getUserLeagues);
router.post('/users', admin, User.createUser);
router.put('/users/:id', userSelfOrAdminGuard, User.updateUser);
router.delete('/users/:id', userSelfOrAdminGuard, User.deleteUser);

// Clubs
router.get('/clubs', Club.getClubs);
router.get('/clubs/:id', Club.getClub);
router.post('/clubs', superAdmin, Club.createClub);
router.put('/clubs/:id', superAdmin, Club.updateClub);

// Courses
router.get('/courses', Course.getCourses);
router.get('/courses/:id', Course.getCourse);
router.post('/courses', superAdmin, Course.createCourse);
router.put('/courses/:id', superAdmin, Course.updateCourse);
router.delete('/courses/:id', superAdmin, Course.deleteCourse);

// Leagues
router.get('/leagues', user, League.getLeagues);
router.get('/leagues/:id', leagueMemberGuard, League.getLeague);
router.get('/leagues/:id/metrics', leagueMemberGuard, League.getLeagueMetrics);
router.post('/leagues', admin, League.createLeague);
router.put('/leagues/:id', admin, leagueAdminGuard, League.updateLeague);
router.delete('/leagues/:id', admin, leagueAdminGuard, League.deleteLeague);

// League Players & Teams
router.get('/leagues/:leagueId/players', leagueMemberGuard, Player.getLeaguePlayers);
router.post('/leagues/:leagueId/players', leagueAdminGuard, Player.createPlayer);
router.get('/leagues/:leagueId/teams', leagueMemberGuard, Team.getLeagueTeams);
router.post('/leagues/:leagueId/teams', leagueAdminGuard, Team.createTeam);

// League Events
router.get('/leagues/:leagueId/events', leagueMemberGuard, Event.getLeagueEvents);
router.get('/leagues/:leagueId/events/:eventId', leagueMemberGuard, Event.getLeagueEvent);
router.get('/leagues/:leagueId/events/:eventId/scores', leagueMemberGuard, Score.getLeagueEventScores);
router.post('/leagues/:leagueId/event', leagueAdminGuard, Event.createEvent);
router.post('/leagues/:leagueId/events', leagueAdminGuard, Event.createMultipleEvents);
router.put('/leagues/:leagueId/events/:eventId', leagueAdminGuard, Event.updateEvent);
router.post('/leagues/:leagueId/events/:eventId/scores', eventAdminGuard, Score.createLeagueEventScores);
router.put('/leagues/:leagueId/events/:eventId/scores', eventAdminGuard, Score.updateLeagueEventScores);

// Flights
router.put('/flights/:flightId/players', flightAdminGuard, Flight.updateFlightPlayers);

// player
router.get('/players', admin, Player.getPlayers);
router.get('/players/:id', playerMemberGuard, Player.getPlayer);
router.put('/players/:id', playerAdminGuard, Player.updatePlayer);
router.delete('/players/:id', playerAdminGuard, Player.deletePlayer);
router.get('/leagues/:leagueId/players/:playerId/stats', leagueMemberGuard, Player.getPlayerStats);

// team
router.get('/teams/:id', teamMemberGuard, Team.getTeam);
router.put('/teams/:id', teamAdminGuard, Team.updateTeam);
router.delete('/teams/:id', teamAdminGuard, Team.deleteTeam);

export default router;
