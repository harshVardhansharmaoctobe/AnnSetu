import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { route } from '@/lib/api';
import { getAdminStats, getImpactStats } from '@/lib/stats';
import { expireStaleDonations } from '@/lib/workflow';

export const dynamic = 'force-dynamic';

// GET /api/admin/stats
export const GET = route('admin:stats', async () => {
  const auth = await requireUser({ roles: ['ADMIN'] });
  if (auth.error) return auth.error;
  await expireStaleDonations();
  const [platform, impact] = await Promise.all([getAdminStats(), getImpactStats({ kind: 'platform' })]);
  return NextResponse.json({ ...platform, impact });
});
