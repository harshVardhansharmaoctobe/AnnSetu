import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { requireUser } from '@/lib/api-auth';
import { listResponse, paginate, parseQuery, route } from '@/lib/api';

export const dynamic = 'force-dynamic';

const auditQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  entity: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(25),
});

// GET /api/admin/audit
export const GET = route('admin:audit', async (request) => {
  const auth = await requireUser({ roles: ['ADMIN'] });
  if (auth.error) return auth.error;
  const query = parseQuery(request, auditQuerySchema);
  const { skip, take, page, pageSize } = paginate(query.page, query.pageSize);

  const where: Prisma.AuditLogWhereInput = {
    ...(query.entity && { entity: query.entity }),
    ...(query.q && {
      OR: [
        { action: { contains: query.q, mode: 'insensitive' } },
        { details: { contains: query.q, mode: 'insensitive' } },
        { user: { name: { contains: query.q, mode: 'insensitive' } } },
      ],
    }),
  };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: { user: { select: { name: true, email: true, role: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return listResponse(items, total, page, pageSize);
});
