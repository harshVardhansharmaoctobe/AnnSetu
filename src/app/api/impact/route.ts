import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireUser } from '@/lib/api-auth';
import { route } from '@/lib/api';
import { getImpactStats, getTrends, normaliseRange, type ImpactScope } from '@/lib/stats';

export const dynamic = 'force-dynamic';

// GET /api/impact            – public platform aggregates (no personal data)
// GET /api/impact?scope=me   – the signed-in donor/NGO/volunteer's own contribution
export const GET = route('impact', async (request) => {
  if (request.nextUrl.searchParams.get('scope') !== 'me') {
    // Optional platform trends (aggregates only): ?trend=day|week|month
    const trend = request.nextUrl.searchParams.get('trend');
    const interval = trend === 'day' || trend === 'week' || trend === 'month' ? trend : null;
    const [stats, trends] = await Promise.all([
      getImpactStats({ kind: 'platform' }),
      interval ? getTrends(normaliseRange({ interval })) : Promise.resolve(undefined),
    ]);
    return NextResponse.json({ ...stats, ...(trends && { trends }) }, {
      headers: { 'Cache-Control': 'public, max-age=15' },
    });
  }

  const auth = await requireUser({ roles: ['DONOR', 'NGO', 'VOLUNTEER'] });
  if (auth.error) return auth.error;
  const { id, role } = auth.user;

  let scope: ImpactScope | null = null;
  if (role === 'DONOR') {
    const p = await prisma.donorProfile.findUnique({ where: { userId: id }, select: { id: true } });
    if (p) scope = { kind: 'donor', donorProfileId: p.id };
  } else if (role === 'NGO') {
    const p = await prisma.nGOProfile.findUnique({ where: { userId: id }, select: { id: true } });
    if (p) scope = { kind: 'ngo', ngoProfileId: p.id };
  } else {
    const p = await prisma.volunteerProfile.findUnique({ where: { userId: id }, select: { id: true } });
    if (p) scope = { kind: 'volunteer', volunteerProfileId: p.id };
  }
  if (!scope) return NextResponse.json({ scope: 'none', profileIncomplete: true });
  return NextResponse.json(await getImpactStats(scope));
});
