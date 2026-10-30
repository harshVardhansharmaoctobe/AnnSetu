import { redirect } from 'next/navigation';
import { getServerSession, type Session } from 'next-auth';
import { authOptions } from '@/lib/auth';

type SessionUser = Session['user'];

/**
 * Server-side page guard. The session is refreshed from the database by the jwt callback, so
 * role/status changes apply on the next navigation. This only decides which page to show –
 * every API route enforces the same rules independently.
 */
export async function requirePageUser({
  roles,
  statuses = ['APPROVED'],
}: { roles?: SessionUser['role'][]; statuses?: SessionUser['accountStatus'][] } = {}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');
  const user = session.user;
  if (!statuses.includes(user.accountStatus)) redirect('/dashboard/pending');
  if (roles && !roles.includes(user.role)) redirect('/dashboard');
  return user;
}

export const ROLE_HOME: Record<SessionUser['role'], string> = {
  DONOR: '/dashboard/donor',
  NGO: '/dashboard/ngo',
  VOLUNTEER: '/dashboard/volunteer',
  ADMIN: '/dashboard/admin',
};
