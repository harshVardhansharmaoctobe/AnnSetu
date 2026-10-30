import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireUser } from '@/lib/api-auth';
import { notFound, parseBody, route } from '@/lib/api';
import { donationUpdateSchema } from '@/lib/validations';
import { deleteDonation, updateDonation } from '@/lib/workflow';
import { contactSelect } from '@/lib/selects';

export const dynamic = 'force-dynamic';

type Params = { id: string };

// GET /api/donations/:id – donor owner and admins see every request; an NGO sees only its own.
export const GET = route<Params>('donations:get', async (_request, { id }) => {
  const auth = await requireUser({ roles: ['DONOR', 'NGO', 'ADMIN'] });
  if (auth.error) return auth.error;
  const actor = auth.user;

  const donation = await prisma.foodDonation.findUnique({
    where: { id },
    include: {
      donorProfile: {
        select: {
          id: true, userId: true, organisationName: true, organisationType: true, address: true,
          user: { select: { ...contactSelect, accountStatus: true } },
        },
      },
      requests: {
        orderBy: { createdAt: 'asc' },
        include: {
          ngoProfile: {
            select: {
              id: true, userId: true, organisationName: true, address: true, latitude: true, longitude: true,
              receivingCapacity: true, user: { select: contactSelect },
            },
          },
          assignments: {
            orderBy: { createdAt: 'desc' },
            include: { volunteerProfile: { select: { id: true, vehicleType: true, user: { select: contactSelect } } } },
          },
          proofs: { orderBy: { createdAt: 'asc' } },
        },
      },
    },
  });
  if (!donation) throw notFound('Donation not found');

  const isOwner = donation.donorProfile.userId === actor.id;
  if (actor.role === 'ADMIN' || isOwner) {
    return NextResponse.json({ ...donation, viewerRole: isOwner ? 'OWNER' : 'ADMIN' });
  }

  // Other donors never see someone else's donation.
  if (actor.role === 'DONOR') throw notFound('Donation not found');

  // NGO view: only donations from approved donors, and only its own request.
  if (donation.donorProfile.user.accountStatus !== 'APPROVED') throw notFound('Donation not found');
  const myRequest = donation.requests.find((r) => r.ngoProfile.userId === actor.id) ?? null;
  const approved = myRequest && !['PENDING', 'REJECTED', 'CANCELLED'].includes(myRequest.status);
  const { requests: _all, donorProfile, ...rest } = donation;
  return NextResponse.json({
    ...rest,
    // Direct contact details are shared with an NGO only once the donor approved its request.
    contactPhone: approved ? donation.contactPhone : null,
    donorProfile: {
      organisationName: donorProfile.organisationName,
      organisationType: donorProfile.organisationType,
      ...(approved && { user: donorProfile.user }),
    },
    myRequest,
    viewerRole: 'NGO',
  });
});

// PATCH /api/donations/:id – donor edits a donation that has no active requests yet.
export const PATCH = route<Params>('donations:update', async (request, { id }) => {
  const auth = await requireUser({ roles: ['DONOR'] });
  if (auth.error) return auth.error;
  const input = await parseBody(request, donationUpdateSchema);
  return NextResponse.json(await updateDonation(auth.user, id, input));
});

// DELETE /api/donations/:id – donor removes a donation that no NGO has requested.
export const DELETE = route<Params>('donations:delete', async (_request, { id }) => {
  const auth = await requireUser({ roles: ['DONOR'] });
  if (auth.error) return auth.error;
  return NextResponse.json(await deleteDonation(auth.user, id));
});
