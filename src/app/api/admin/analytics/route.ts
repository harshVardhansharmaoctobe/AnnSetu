import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/api-auth';
import { badRequest, parseQuery, route } from '@/lib/api';
import { getAnalytics, normaliseRange } from '@/lib/stats';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  interval: z.enum(['day', 'week', 'month']).default('day'),
});

// GET /api/admin/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD&interval=day|week|month
export const GET = route('admin:analytics', async (request) => {
  const auth = await requireUser({ roles: ['ADMIN'] });
  if (auth.error) return auth.error;
  const q = parseQuery(request, querySchema);
  // An end date without a time means "the whole day".
  const to = q.to ? new Date(q.to.getTime() + (request.nextUrl.searchParams.get('to')?.length === 10 ? 86_399_999 : 0)) : undefined;
  if (q.from && to && q.from > to) throw badRequest('The start date must be before the end date');
  return NextResponse.json(await getAnalytics(normaliseRange({ from: q.from, to, interval: q.interval })));
});
