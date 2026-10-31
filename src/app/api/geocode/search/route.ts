import { NextResponse } from 'next/server';
import { z } from 'zod';
import { clientIp, errorResponse, parseQuery, route } from '@/lib/api';
import { limiters } from '@/lib/rate-limit';
import { searchAddress } from '@/lib/geocoding';
import { debugLocation } from '@/lib/location-debug';

export const dynamic = 'force-dynamic';

const querySchema = z.object({ q: z.string().trim().min(3, 'Type at least 3 characters').max(200) });

// GET /api/geocode/search?q=… – address search for the location picker. Public, because the
// registration form uses it before an account exists; rate limited per IP and cached.
export const GET = route('geocode:search', async (request) => {
  if (!limiters.geocoding.hit(clientIp(request)).allowed) {
    return errorResponse(429, 'Too many address lookups. Please wait a few minutes.', 'RATE_LIMITED');
  }
  const { q } = parseQuery(request, querySchema);
  const results = await searchAddress(q);
  debugLocation('geocoder search', { q, results });
  return NextResponse.json({ results }, { headers: { 'Cache-Control': 'private, max-age=3600' } });
});
