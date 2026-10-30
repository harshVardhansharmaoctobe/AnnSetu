import type { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { requireUser } from '@/lib/api-auth';
import { listResponse, paginate, parseQuery, route } from '@/lib/api';
import { userQuerySchema } from '@/lib/validations';
import { adminUserSelect } from '@/lib/selects';

export const dynamic = 'force-dynamic';

// GET /api/admin/users?q=&role=&status=
export const GET = route('admin:users', async (request) => {
  const auth = await requireUser({ roles: ['ADMIN'] });
  if (auth.error) return auth.error;
  const query = parseQuery(request, userQuerySchema);
  const { skip, take, page, pageSize } = paginate(query.page, query.pageSize);

  const where: Prisma.UserWhereInput = {
    ...(query.role && { role: query.role }),
    ...(query.status && { accountStatus: query.status }),
    ...(query.q && {
      OR: [
        { name: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
      ],
    }),
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [{ accountStatus: 'asc' }, { createdAt: 'desc' }],
      skip,
      take,
      select: {
        ...adminUserSelect,
        donorProfile: { select: { organisationName: true, organisationType: true, address: true } },
        ngoProfile: { select: { organisationName: true, registrationNumber: true, address: true, receivingCapacity: true } },
        volunteerProfile: {
          select: { id: true, address: true, vehicleType: true, availability: true, isAvailable: true, latitude: true, longitude: true },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);
  return listResponse(items, total, page, pageSize);
});
