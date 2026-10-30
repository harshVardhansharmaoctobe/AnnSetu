import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { parseBody, route } from '@/lib/api';
import { changePasswordSchema } from '@/lib/validations';
import { changePassword } from '@/lib/password-reset';

// POST /api/password/change { currentPassword, newPassword, confirmPassword }
// All sessions (including this one) are revoked afterwards; the client signs in again.
export const POST = route('password:change', async (request) => {
  const auth = await requireUser({ statuses: ['APPROVED', 'PENDING', 'REJECTED'] });
  if (auth.error) return auth.error;
  const { currentPassword, newPassword } = await parseBody(request, changePasswordSchema);
  await changePassword(auth.user.id, currentPassword, newPassword);
  return NextResponse.json({ message: 'Password changed. Please sign in again.' });
});
