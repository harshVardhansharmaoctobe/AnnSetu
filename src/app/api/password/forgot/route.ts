import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { clientIp, errorResponse, parseBody, route } from '@/lib/api';
import { forgotPasswordSchema } from '@/lib/validations';
import { limiters } from '@/lib/rate-limit';
import { createResetToken, resetUrl } from '@/lib/password-reset';
import { notifyAdmins } from '@/lib/events';

const GENERIC = { message: 'If an account exists for that email, a password reset has been started.' };

// POST /api/password/forgot { email } – always answers generically so accounts cannot be discovered.
export const POST = route('password:forgot', async (request) => {
  const ip = clientIp(request);
  if (!limiters.passwordReset.hit(`ip:${ip}`).allowed) {
    return errorResponse(429, 'Too many reset requests. Please try again later.', 'RATE_LIMITED');
  }
  const { email } = await parseBody(request, forgotPasswordSchema);
  if (!limiters.passwordReset.hit(`email:${email}`).allowed) return NextResponse.json(GENERIC);

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, accountStatus: true } });
  if (user && user.accountStatus !== 'SUSPENDED') {
    const { token } = await createResetToken(user.id);
    if (process.env.NODE_ENV !== 'production' || process.env.LOG_RESET_LINKS === 'true') {
      // No email provider in this MVP: the link is available to the operator in the server log.
      console.info(`[password-reset] link for ${email} (valid 1 hour): ${resetUrl(token)}`);
    }
    await notifyAdmins(prisma, {
      type: 'PASSWORD_RESET_REQUESTED',
      title: 'Password reset requested',
      message: `${user.name} (${email}) asked to reset their password. If they cannot receive the link, issue one from Users.`,
      link: `/dashboard/admin/users/${user.id}`,
    });
  }
  return NextResponse.json(GENERIC);
});
