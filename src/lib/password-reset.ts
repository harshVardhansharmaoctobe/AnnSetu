import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/db';
import { badRequest } from '@/lib/api';
import { audit, notify } from '@/lib/events';
import { limiters } from '@/lib/rate-limit';

/**
 * Password reset tokens.
 *
 * The token is 32 random bytes (base64url) given to the user once; only its SHA-256 hash is stored.
 * Tokens expire after RESET_TOKEN_TTL_MS, are single-use, and issuing a new one invalidates older ones.
 * Changing the password sets User.passwordChangedAt, which revokes every session issued before it.
 *
 * Delivery: there is no email provider in this MVP. Self-service requests log the link to the server
 * console in development and notify admins, who can issue a link from user management.
 */
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function resetUrl(token: string) {
  const base = (process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/reset-password?token=${encodeURIComponent(token)}`;
}

export async function createResetToken(userId: string, createdById?: string) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.passwordResetToken.create({ data: { userId, tokenHash: hashToken(token), expiresAt, createdById } }),
  ]);
  return { token, expiresAt };
}

/** Sets a new password and revokes older sessions. Caller has already validated the password. */
async function setPassword(userId: string, password: string, action: string, actorId: string) {
  const hashed = await bcrypt.hash(password, 12);
  // Session tokens record their issue time in whole seconds, so the change time is rounded UP to the
  // next second: every token issued before (or in the same second as) the change is revoked.
  const changedAt = new Date(Math.ceil(Date.now() / 1000) * 1000);
  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: { password: hashed, passwordChangedAt: changedAt },
      select: { id: true, email: true },
    });
    await tx.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
    await audit(tx, { userId: actorId, action, entity: 'User', entityId: userId });
    await notify(tx, {
      userId,
      type: 'GENERAL',
      title: 'Password changed',
      message: 'Your FoodBridge password was changed and other sessions were signed out. If this was not you, contact the FoodBridge team.',
    });
    return updated;
  });
  limiters.loginFailures.reset(user.email);
}

export async function resetPasswordWithToken(token: string, password: string) {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, accountStatus: true } } },
  });
  if (!record || record.usedAt || record.expiresAt <= new Date() || record.user.accountStatus === 'SUSPENDED') {
    throw badRequest('This reset link is invalid or has expired. Request a new one.', 'INVALID_TOKEN');
  }
  // Claim the token first so it cannot be used twice concurrently.
  const claimed = await prisma.passwordResetToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count === 0) throw badRequest('This reset link has already been used.', 'INVALID_TOKEN');
  await setPassword(record.userId, password, 'PASSWORD_RESET', record.userId);
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { password: true } });
  if (!(await bcrypt.compare(currentPassword, user.password))) {
    throw badRequest('Your current password is incorrect', 'WRONG_PASSWORD');
  }
  if (await bcrypt.compare(newPassword, user.password)) {
    throw badRequest('Choose a password different from your current one', 'SAME_PASSWORD');
  }
  await setPassword(userId, newPassword, 'PASSWORD_CHANGED', userId);
}
