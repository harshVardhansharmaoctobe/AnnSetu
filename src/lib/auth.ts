import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/db';
import { loginSchema } from '@/lib/validations';
import { limiters } from '@/lib/rate-limit';

/**
 * Account status policy
 *   APPROVED  – can sign in and use the app.
 *   PENDING   – can sign in (to see their status / complete their profile) but
 *               protected APIs reject them; see requireUser() in api-auth.ts.
 *   REJECTED  – same as PENDING, read-only.
 *   SUSPENDED – cannot sign in; any existing session is revoked on its next use.
 * ADMIN accounts cannot be created through public registration.
 */
export const AUTH_ERRORS = {
  INVALID_CREDENTIALS: 'Invalid email or password',
  SUSPENDED: 'This account has been suspended. Contact the FoodBridge team.',
  TOO_MANY_ATTEMPTS: 'Too many failed sign-in attempts. Please wait 15 minutes and try again.',
} as const;

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) {
          throw new Error(AUTH_ERRORS.INVALID_CREDENTIALS);
        }
        const { email, password } = parsed.data;

        // Lockout is per email: after LOGIN_MAX_FAILURES wrong passwords, even the right one is
        // refused until the window resets. Successful sign-in clears the counter.
        if (!limiters.loginFailures.check(email).allowed) {
          throw new Error(AUTH_ERRORS.TOO_MANY_ATTEMPTS);
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !(await bcrypt.compare(password, user.password))) {
          limiters.loginFailures.hit(email);
          throw new Error(AUTH_ERRORS.INVALID_CREDENTIALS);
        }
        limiters.loginFailures.reset(email);

        // Checked only after the password, so account status is never revealed to someone without it.
        if (user.accountStatus === 'SUSPENDED') {
          throw new Error(AUTH_ERRORS.SUSPENDED);
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          accountStatus: user.accountStatus,
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.accountStatus = user.accountStatus;
        return token;
      }

      // Runs on every session read (getServerSession, /api/auth/session), so role and
      // status changes made by an admin take effect immediately instead of after 24h.
      const current = await prisma.user.findUnique({
        where: { id: token.id },
        select: { role: true, accountStatus: true },
      });
      if (!current || current.accountStatus === 'SUSPENDED') {
        // Throwing makes NextAuth discard the session: getServerSession() returns null.
        throw new Error('Session revoked: account deleted or suspended');
      }
      token.role = current.role;
      token.accountStatus = current.accountStatus;
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.accountStatus = token.accountStatus;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
};
