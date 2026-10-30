import prisma from '@/lib/db';
import { requireUser } from '@/lib/api-auth';
import { listResponse, paginate, parseQuery, route } from '@/lib/api';
import { paginationQuerySchema } from '@/lib/validations';

export const dynamic = 'force-dynamic';

// GET /api/notifications – the signed-in user's own notifications (any non-suspended status).
export const GET = route('notifications:list', async (request) => {
  const auth = await requireUser({ statuses: ['APPROVED', 'PENDING', 'REJECTED'] });
  if (auth.error) return auth.error;
  const query = parseQuery(request, paginationQuerySchema);
  const { skip, take, page, pageSize } = paginate(query.page, query.pageSize);
  const where = { userId: auth.user.id, ...(query.unreadOnly === 'true' && { isRead: false }) };
  const [items, total] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.notification.count({ where }),
  ]);
  return listResponse(items, total, page, pageSize);
});
