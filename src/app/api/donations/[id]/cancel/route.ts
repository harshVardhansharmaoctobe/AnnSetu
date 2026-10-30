import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { route } from '@/lib/api';
import { cancelDonation } from '@/lib/workflow';

// POST /api/donations/:id/cancel
export const POST = route<{ id: string }>('donations:cancel', async (_request, { id }) => {
  const auth = await requireUser({ roles: ['DONOR'] });
  if (auth.error) return auth.error;
  return NextResponse.json(await cancelDonation(auth.user, id));
});
