import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireUser } from '@/lib/api-auth';
import { route } from '@/lib/api';

export const dynamic = 'force-dynamic';

// GET /api/notifications/count – unread count for the header badge.
export const GET = route('notifications:count', async () => {
  const auth = await requireUser({ statuses: ['APPROVED', 'PENDING', 'REJECTED'] });
  if (auth.error) return auth.error;
  const unread = await prisma.notification.count({ where: { userId: auth.user.id, isRead: false } });
  return NextResponse.json({ unread });
});
