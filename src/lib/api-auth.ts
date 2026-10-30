import { NextResponse } from 'next/server';
import { getServerSession, type Session } from 'next-auth';
import { authOptions } from '@/lib/auth';

type SessionUser = Session['user'];

const STATUS_ERRORS: Record<SessionUser['accountStatus'], string> = {
  APPROVED: '',
  PENDING: 'Your account is awaiting admin approval.',
  REJECTED: 'Your account application was not approved. Contact the FoodBridge team.',
  SUSPENDED: 'This account has been suspended. Contact the FoodBridge team.',
};

interface RequireUserOptions {
  /** Roles allowed through. Defaults to any role. */
  roles?: SessionUser['role'][];
  /** Account statuses allowed through. Defaults to APPROVED only. */
  statuses?: SessionUser['accountStatus'][];
}

type RequireUserResult =
  | { user: SessionUser; error?: undefined }
  | { user?: undefined; error: NextResponse };

/**
 * Guard for protected API routes. Role and status come from the session, which the
 * jwt callback reloads from the database on every call, so they are never stale.
 *
 *   const auth = await requireUser({ roles: ['NGO'] });
 *   if (auth.error) return auth.error;
 */
export async function requireUser({
  roles,
  statuses = ['APPROVED'],
}: RequireUserOptions = {}): Promise<RequireUserResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { user } = session;
  if (!statuses.includes(user.accountStatus)) {
    return {
      error: NextResponse.json(
        { error: STATUS_ERRORS[user.accountStatus], code: `ACCOUNT_${user.accountStatus}` },
        { status: 403 }
      ),
    };
  }
  if (roles && !roles.includes(user.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { user };
}
