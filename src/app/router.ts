import express, { Router } from 'express';
import { adminGuard as admin, userGuard as user } from './middleware/auth-guard';
import User from './controllers/user';
import Team from './controllers/team';
import League from './controllers/league';
import Club from './controllers/club';
import Course from './controllers/course';
import Event from './controllers/event';
import Player from './controllers/player';
import Score from './controllers/round';
import Auth from './controllers/auth';
import Dashboard from './controllers/dashboard';

const router: Router = express.Router();

// =====================
// AUTH ROUTES
// =====================
router.post('/auth/login', Auth.login);
// router.post('/auth/register', Auth.register);
router.post('/auth/logout', Auth.logout);
router.get('/auth/me', user, Auth.getProfile);

// =====================
// ADMIN ROUTES
// =====================
const adminRoutes = express.Router();
router.get('/admin/leagues', League.getAdminLeagues);
router.get('/admin/leagues/:id', League.getAdminLeague);
router.get('/admin/events/:eventId', Event.getAdminEvent);
router.post('/admin/events/:eventId/scores', Event.runEventScoring);

// router.use('/admin', admin, adminRoutes); // Uncomment to enable admin routes

// =====================
// USER ROUTES
// =====================
const userRoutes = express.Router();
userRoutes.get('/profile', User.getProfile);

// router.use(user, userRoutes); // Uncomment to enable user routes

// =====================
// PUBLIC ROUTES
// =====================

// Users
router.get('/users', User.getUsers);
router.post('/users', User.createUser);
router.get('/users/:id', User.getUserById);
router.put('/users/:id', User.updateUser);
router.delete('/users/:id', User.deleteUser);
router.get('/users/:id/leagues', User.getUserLeagues);

// Clubs
router.get('/clubs', Club.getClubs);
router.post('/clubs', Club.createClub);
router.get('/clubs/:id', Club.getClub);
router.put('/clubs/:id', Club.updateClub);

// Courses
router.get('/courses', Course.getCourses);
router.post('/courses', Course.createCourse);
router.get('/courses/:id', Course.getCourse);
router.put('/courses/:id', Course.updateCourse);
router.delete('/courses/:id', Course.deleteCourse);

// Leagues
router.get('/leagues', League.getLeagues);
router.post('/leagues', League.createLeague);
router.get('/leagues/:id', League.getLeague);
router.put('/leagues/:id', League.updateLeague);
router.delete('/leagues/:id', League.deleteLeague);

// League Info (protected)
router.get('/leagues/:leagueId/info', League.getLeagueInfo);

// League Players & Teams
router.get('/leagues/:leagueId/players', Player.getLeaguePlayers);
router.get('/leagues/:leagueId/teams', Team.getLeagueTeams);

// League Events
router.get('/leagues/:leagueId/events', Event.getLeagueEvents);
router.post('/leagues/:leagueId/event', Event.createEvent);
router.post('/leagues/:leagueId/events', Event.createMultipleEvents);
router.get('/leagues/:leagueId/events/:eventId', Event.getLeagueEvent);
// router.get('/leagues/:leagueId/events/:eventId/scores', Event.getLeagueEventR);

router.post('/leagues/:leagueId/events/:eventId/scores', Score.createLeagueEventScores);

// Player Dashboard
router.get('/dashboard/leagues/:leagueId/players/:playerId/events', Dashboard.getPlayerEvents);
router.get('/dashboard/leagues/:leagueId/players/:playerId/stats', Dashboard.getPlayerStats);
router.get('/dashboard/leagues/:leagueId/stats', Dashboard.getLeagueStats);
router.get('/dashboard/leagues/:leagueId/leaderboards', Dashboard.getLeagueLeaderboards);

export default router;
