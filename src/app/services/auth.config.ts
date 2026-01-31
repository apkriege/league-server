// Backend (Express API) - passport-config.ts
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as LocalStrategy } from 'passport-local';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import UserService from './user';
dotenv.config();

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      callbackURL: '/api/auth/google/callback',
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const googleEmail = profile.emails?.[0]?.value || '';
        let user = await UserService.findByEmail(googleEmail);

        if (!user) {
          console.log('creating user');

          const newUser = await UserService.create({
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
      } catch (error) {
        return done(error);
      }
    },
  ),
);

passport.use(
  new LocalStrategy(
    { usernameField: 'email' },
    async (email: string, password: string, done: any) => {
      try {
        const user = await UserService.findByEmail(email);

        if (!user || !user.password) {
          return done(null, false, { message: 'Incorrect username.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          return done(null, false, { message: 'Incorrect password.' });
        }

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    },
  ),
);

passport.serializeUser((user: any, done) => {
  console.log('serializeUser', user);
  done(null, user.id);
});

passport.deserializeUser(async (id: any, done) => {
  try {
    const user = await UserService.findById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

export default passport;
