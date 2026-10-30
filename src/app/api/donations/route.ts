import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { requireUser } from '@/lib/api-auth';
import { forbidden, listResponse, paginate, parseBody, parseQuery, route } from '@/lib/api';
import { donationCreateSchema, donationQuerySchema } from '@/lib/validations';
import { createDonation, expireStaleDonations, OPEN_DONATION_STATUSES } from '@/lib/workflow';
import { calculateDistance } from '@/lib/utils';
import { calculateMatchScore } from '@/lib/matching';

export const dynamic = 'force-dynamic';

const MAX_DISCOVERY_CANDIDATES = 500;

const validCoords = (lat: number | null | undefined, lng: number | null | undefined) =>
  typeof lat === 'number' && typeof lng === 'number' && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

// GET /api/donations?scope=available|mine|all
export const GET = route('donations:list', async (request) => {
  const auth = await requireUser({ roles: ['DONOR', 'NGO', 'ADMIN'] });
  if (auth.error) return auth.error;
  const actor = auth.user;
  const query = parseQuery(request, donationQuerySchema);
  const { skip, take, page, pageSize } = paginate(query.page, query.pageSize);

  await expireStaleDonations();

  const textFilter: Prisma.FoodDonationWhereInput | undefined = query.q
    ? {
      OR: [
        { foodName: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
        { pickupAddress: { contains: query.q, mode: 'insensitive' } },
        { donorProfile: { organisationName: { contains: query.q, mode: 'insensitive' } } },
      ],
    }
    : undefined;
  const common: Prisma.FoodDonationWhereInput = {
    ...textFilter,
    ...(query.category && { foodCategory: query.category }),
    ...(query.foodType && { foodType: query.foodType }),
  };

  if (query.scope === 'mine' || query.scope === 'all') {
    if (query.scope === 'mine' && actor.role !== 'DONOR') throw forbidden('Only donors have their own donations');
    if (query.scope === 'all' && actor.role !== 'ADMIN') throw forbidden();
    const where: Prisma.FoodDonationWhereInput = {
      ...common,
      ...(query.status && { status: query.status }),
      ...(query.scope === 'mine' && { donorProfile: { userId: actor.id } }),
    };
    const [items, total] = await Promise.all([
      prisma.foodDonation.findMany({
        where,
        orderBy: query.sort === 'expiry' ? { safePickupDeadline: 'asc' } : { createdAt: 'desc' },
        skip,
        take,
        include: {
          donorProfile: { select: { organisationName: true } },
          requests: { select: { status: true } },
        },
      }),
      prisma.foodDonation.count({ where }),
    ]);
    return listResponse(
      items.map(({ requests, ...d }) => ({
        ...d,
        requestCounts: requests.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {}),
      })),
      total, page, pageSize
    );
  }

  // Discovery: open, unexpired donations from approved donors – an NGO (and admin) feature.
  if (actor.role === 'DONOR') throw forbidden('Discovery is available to NGOs; donors see their own donations with scope=mine');
  const ngo = actor.role === 'NGO' ? await prisma.nGOProfile.findUnique({ where: { userId: actor.id } }) : null;
  const originLat = query.lat ?? ngo?.latitude;
  const originLng = query.lng ?? ngo?.longitude;
  const hasOrigin = validCoords(originLat, originLng);
  const now = new Date();
  const deadlineFilter: Prisma.DateTimeFilter = { gt: now };
  if (query.expiresWithinHours) deadlineFilter.lte = new Date(now.getTime() + query.expiresWithinHours * 3_600_000);

  const candidates = await prisma.foodDonation.findMany({
    where: {
      ...common,
      status: { in: OPEN_DONATION_STATUSES },
      safePickupDeadline: deadlineFilter,
      remainingQuantity: { gt: 0, ...(query.minQuantity && { gte: query.minQuantity }) },
      donorProfile: { user: { accountStatus: 'APPROVED' } },
    },
    orderBy: query.sort === 'expiry' ? { safePickupDeadline: 'asc' } : { createdAt: 'desc' },
    take: MAX_DISCOVERY_CANDIDATES,
    include: { donorProfile: { select: { organisationName: true, organisationType: true } } },
  });

  let rows = candidates.map((d) => {
    const distanceKm = hasOrigin && validCoords(d.latitude, d.longitude)
      ? calculateDistance(originLat!, originLng!, d.latitude, d.longitude)
      : null;
    const match = ngo && distanceKm !== null
      ? calculateMatchScore({ donation: d, ngo })
      : null;
    return { ...d, distanceKm, matchScore: match?.totalScore ?? null, matchExplanation: match?.explanation ?? null };
  });
  if (query.radiusKm && hasOrigin) rows = rows.filter((d) => d.distanceKm !== null && d.distanceKm <= query.radiusKm!);
  if (query.sort === 'nearest' && hasOrigin) {
    rows.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  }

  const pageRows = rows.slice(skip, skip + take);
  const myRequests = ngo && pageRows.length > 0
    ? await prisma.foodRequest.findMany({
      where: { ngoProfileId: ngo.id, donationId: { in: pageRows.map((d) => d.id) } },
      select: { id: true, donationId: true, status: true },
    })
    : [];
  const byDonation = new Map(myRequests.map((r) => [r.donationId, r]));

  return NextResponse.json({
    items: pageRows.map((d) => ({ ...d, myRequest: byDonation.get(d.id) ?? null })),
    total: rows.length,
    page,
    pageSize,
    origin: hasOrigin ? { lat: originLat, lng: originLng, source: query.lat !== undefined ? 'query' : 'profile' } : null,
    truncated: candidates.length === MAX_DISCOVERY_CANDIDATES,
  });
});

// POST /api/donations
export const POST = route('donations:create', async (request) => {
  const auth = await requireUser({ roles: ['DONOR'] });
  if (auth.error) return auth.error;
  const input = await parseBody(request, donationCreateSchema);
  const donation = await createDonation(auth.user, input);
  return NextResponse.json(donation, { status: 201 });
});
