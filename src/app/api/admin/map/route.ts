import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireUser } from '@/lib/api-auth';
import { route } from '@/lib/api';
import { expireStaleDonations, OPEN_DONATION_STATUSES } from '@/lib/workflow';

export const dynamic = 'force-dynamic';

const LIMIT = 200;

// GET /api/admin/map – stored locations of approved donors/NGOs, open donations and deliveries in
// progress. These are saved addresses, not live positions (FoodBridge does not track volunteers).
export const GET = route('admin:map', async () => {
  const auth = await requireUser({ roles: ['ADMIN'] });
  if (auth.error) return auth.error;
  await expireStaleDonations();

  const [donors, ngos, donations, deliveries] = await Promise.all([
    prisma.donorProfile.findMany({
      where: { user: { accountStatus: 'APPROVED' } },
      select: { id: true, organisationName: true, address: true, latitude: true, longitude: true },
      take: LIMIT,
    }),
    prisma.nGOProfile.findMany({
      where: { user: { accountStatus: 'APPROVED' } },
      select: { id: true, organisationName: true, address: true, latitude: true, longitude: true },
      take: LIMIT,
    }),
    prisma.foodDonation.findMany({
      where: { status: { in: OPEN_DONATION_STATUSES }, safePickupDeadline: { gt: new Date() } },
      select: { id: true, foodName: true, remainingQuantity: true, unit: true, latitude: true, longitude: true },
      orderBy: { safePickupDeadline: 'asc' },
      take: LIMIT,
    }),
    prisma.foodRequest.findMany({
      where: { status: { in: ['VOLUNTEER_ASSIGNED', 'PICKED_UP'] } },
      select: {
        id: true, status: true,
        donation: { select: { foodName: true, latitude: true, longitude: true } },
        ngoProfile: { select: { organisationName: true, latitude: true, longitude: true } },
      },
      take: LIMIT,
    }),
  ]);
  return NextResponse.json({ donors, ngos, donations, deliveries });
});
