import prisma from '@/lib/db';
import { requireUser } from '@/lib/api-auth';
import { listResponse, paginate, parseQuery, route } from '@/lib/api';
import { paginationQuerySchema } from '@/lib/validations';
import { ACTIVE_ASSIGNMENT_STATUSES } from '@/lib/workflow';

export const dynamic = 'force-dynamic';

// GET /api/admin/volunteers – volunteers with availability, current load and completed deliveries.
export const GET = route('admin:volunteers', async (request) => {
  const auth = await requireUser({ roles: ['ADMIN'] });
  if (auth.error) return auth.error;
  const query = parseQuery(request, paginationQuerySchema);
  const { skip, take, page, pageSize } = paginate(query.page, query.pageSize);
  const where = { user: { role: 'VOLUNTEER' as const } };
  const [items, total] = await Promise.all([
    prisma.volunteerProfile.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, accountStatus: true } },
        assignments: {
          where: { status: { in: ACTIVE_ASSIGNMENT_STATUSES } },
          select: { id: true, status: true, request: { select: { id: true, donation: { select: { foodName: true } }, ngoProfile: { select: { organisationName: true } } } } },
        },
        _count: { select: { assignments: { where: { status: { in: ['DELIVERED', 'COMPLETED'] } } } } },
      },
    }),
    prisma.volunteerProfile.count({ where }),
  ]);
  return listResponse(
    items.map(({ _count, ...v }) => ({ ...v, completedDeliveries: _count.assignments })),
    total, page, pageSize
  );
});
