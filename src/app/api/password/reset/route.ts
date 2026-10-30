import { NextResponse } from 'next/server';
import { clientIp, errorResponse, parseBody, route } from '@/lib/api';
import { resetPasswordSchema } from '@/lib/validations';
import { limiters } from '@/lib/rate-limit';
import { resetPasswordWithToken } from '@/lib/password-reset';

// POST /api/password/reset { token, password, confirmPassword }
export const POST = route('password:reset', async (request) => {
  if (!limiters.passwordReset.hit(`reset:${clientIp(request)}`).allowed) {
    return errorResponse(429, 'Too many attempts. Please try again later.', 'RATE_LIMITED');
  }
  const { token, password } = await parseBody(request, resetPasswordSchema);
  await resetPasswordWithToken(token, password);
  return NextResponse.json({ message: 'Password updated. You can now sign in.' });
});
