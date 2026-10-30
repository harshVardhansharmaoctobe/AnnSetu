import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireUser } from '@/lib/api-auth';
import { clientIp, forbidden, notFound, route } from '@/lib/api';
import { audit } from '@/lib/events';
import { createResetToken, resetUrl } from '@/lib/password-reset';

// POST /api/admin/users/:id/reset-link – admin-assisted reset when the user cannot receive email.
// The link is returned once, to the admin, who shares it with the user through a trusted channel.
export const POST = route<{ id: string }>('admin:reset-link', async (request, { id }) => {
  const auth = await requireUser({ roles: ['ADMIN'] });
  if (auth.error) return auth.error;
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, accountStatus: true } });
  if (!target) throw notFound('User not found');
  if (target.role === 'ADMIN') throw forbidden('Admin passwords are managed directly in the database', 'ADMIN_TARGET');
  if (target.accountStatus === 'SUSPENDED') throw forbidden('Reinstate the account before resetting its password', 'SUSPENDED_TARGET');

  const { token, expiresAt } = await createResetToken(id, auth.user.id);
  await audit(prisma, { userId: auth.user.id, action: 'PASSWORD_RESET_LINK_ISSUED', entity: 'User', entityId: id, ipAddress: clientIp(request) });
  return NextResponse.json({ resetUrl: resetUrl(token), expiresAt }, { headers: { 'Cache-Control': 'no-store' } });
});
