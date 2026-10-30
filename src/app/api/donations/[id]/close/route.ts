import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { route } from '@/lib/api';
import { closeDonation } from '@/lib/workflow';

// POST /api/donations/:id/close – "mark unavailable": no new requests, approved ones are still delivered.
export const POST = route<{ id: string }>('donations:close', async (_request, { id }) => {
  const auth = await requireUser({ roles: ['DONOR'] });
  if (auth.error) return auth.error;
  return NextResponse.json(await closeDonation(auth.user, id));
});
