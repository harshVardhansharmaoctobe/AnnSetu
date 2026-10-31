import { NextResponse } from 'next/server';
import { z } from 'zod';
import { clientIp, errorResponse, parseQuery, route } from '@/lib/api';
import { limiters } from '@/lib/rate-limit';
import { reverseGeocode } from '@/lib/geocoding';
import { debugLocation } from '@/lib/location-debug';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

// GET /api/geocode/reverse?lat=…&lng=… – the human-readable address at a map pin or device location.
export const GET = route('geocode:reverse', async (request) => {
  if (!limiters.geocoding.hit(clientIp(request)).allowed) {
    return errorResponse(429, 'Too many address lookups. Please wait a few minutes.', 'RATE_LIMITED');
  }
  const { lat, lng } = parseQuery(request, querySchema);
  const result = await reverseGeocode(lat, lng);
  debugLocation('geocoder reverse', { lat, lng, result });
  return NextResponse.json({ result }, { headers: { 'Cache-Control': 'private, max-age=3600' } });
});
