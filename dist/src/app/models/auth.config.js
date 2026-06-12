"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Backend (Express API) - passport-config.ts
const passport_1 = __importDefault(require("passport"));
const passport_google_oauth20_1 = require("passport-google-oauth20");
const passport_local_1 = require("passport-local");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const dotenv_1 = __importDefault(require("dotenv"));
const user_1 = __importDefault(require("./user"));
dotenv_1.default.config();
passport_1.default.use(new passport_google_oauth20_1.Strategy({
    clientID: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackURL: '/api/auth/google/callback',
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const googleEmail = profile.emails?.[0]?.value || '';
        let user = await user_1.default.findByEmail(googleEmail);
        if (!user) {
            console.log('creating user');
            const newUser = await user_1.default.create({
                first: profile.name?.givenName || '',
                last: profile.name?.familyName || '',
                username: profile.displayName || '',
                email: googleEmail,
                google_id: profile.id,
                role: 'user',
            });
            console.log('created user', newUser);
            return done(null, newUser);
        }
        return done(null, user);
    }
    catch (error) {
        return done(error);
    }
}));
passport_1.default.use(new passport_local_1.Strategy({ usernameField: 'email' }, async (email, password, done) => {
    try {
        const user = await user_1.default.findByEmail(email);
        if (!user || !user.password) {
            return done(null, false, { message: 'Incorrect username.' });
        }
        const isMatch = await bcryptjs_1.default.compare(password, user.password);
        if (!isMatch) {
            return done(null, false, { message: 'Incorrect password.' });
        }
        return done(null, user);
    }
    catch (err) {
        return done(err);
    }
}));
passport_1.default.serializeUser((user, done) => {
    console.log('serializeUser', user);
    done(null, user.id);
});
passport_1.default.deserializeUser(async (id, done) => {
    try {
        const user = await user_1.default.findById(id);
        done(null, user);
    }
    catch (err) {
        done(err);
    }
});
exports.default = passport_1.default;
