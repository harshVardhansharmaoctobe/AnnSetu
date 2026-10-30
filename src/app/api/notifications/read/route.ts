import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireUser } from '@/lib/api-auth';
import { notFound, parseBody, route } from '@/lib/api';
import { markReadSchema } from '@/lib/validations';

// POST /api/notifications/read  { id } | { all: true }
export const POST = route('notifications:read', async (request) => {
  const auth = await requireUser({ statuses: ['APPROVED', 'PENDING', 'REJECTED'] });
  if (auth.error) return auth.error;
  const input = await parseBody(request, markReadSchema);

  // userId in the filter guarantees users can only touch their own notifications.
  const where = 'id' in input ? { id: input.id, userId: auth.user.id } : { userId: auth.user.id, isRead: false };
  const result = await prisma.notification.updateMany({ where, data: { isRead: true } });
  if ('id' in input && result.count === 0) {
    const exists = await prisma.notification.count({ where: { id: input.id, userId: auth.user.id } });
    if (!exists) throw notFound('Notification not found');
  }
  return NextResponse.json({ updated: result.count });
});
