import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireUser } from '@/lib/api-auth';
import { notFound, route } from '@/lib/api';
import { contactSelect } from '@/lib/selects';

export const dynamic = 'force-dynamic';

// GET /api/assignments/:id
// Full details for the assigned volunteer, the donor and NGO of the delivery, and admins.
// Any approved volunteer may preview an OPEN (unassigned) delivery, without contact details.
export const GET = route<{ id: string }>('assignments:get', async (_request, { id }) => {
  const auth = await requireUser({ roles: ['VOLUNTEER', 'DONOR', 'NGO', 'ADMIN'] });
  if (auth.error) return auth.error;
  const actor = auth.user;

  const assignment = await prisma.volunteerAssignment.findUnique({
    where: { id },
    include: {
      volunteerProfile: { select: { id: true, userId: true, vehicleType: true, user: { select: contactSelect } } },
      request: {
        include: {
          donation: {
            include: {
              donorProfile: { select: { userId: true, organisationName: true, address: true, user: { select: contactSelect } } },
            },
          },
          ngoProfile: {
            select: { userId: true, organisationName: true, address: true, latitude: true, longitude: true, user: { select: contactSelect } },
          },
          proofs: { orderBy: { createdAt: 'asc' } },
        },
      },
    },
  });
  if (!assignment) throw notFound('Assignment not found');

  const isMine = assignment.volunteerProfile?.userId === actor.id;
  const isParty = actor.role === 'ADMIN' || isMine
    || assignment.request.donation.donorProfile.userId === actor.id
    || assignment.request.ngoProfile.userId === actor.id;
  const isOpenPreview = actor.role === 'VOLUNTEER' && assignment.status === 'PENDING' && !assignment.volunteerProfileId;
  if (!isParty && !isOpenPreview) throw notFound('Assignment not found');

  if (!isParty) {
    // Open delivery preview: locations and food details, but no contact information yet.
    const { request: r, ...rest } = assignment;
    const { donorProfile, contactPhone: _phone, ...donation } = r.donation;
    const { user: _ngoUser, ...ngoProfile } = r.ngoProfile;
    return NextResponse.json({
      ...rest,
      request: {
        ...r,
        proofs: [],
        donation: { ...donation, contactPhone: null, donorProfile: { organisationName: donorProfile.organisationName, address: donorProfile.address } },
        ngoProfile,
      },
      isMine: false,
      isOpen: true,
    });
  }
  return NextResponse.json({ ...assignment, isMine, isOpen: assignment.status === 'PENDING' && !assignment.volunteerProfileId });
});
