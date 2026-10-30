import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireUser } from '@/lib/api-auth';
import { notFound, route } from '@/lib/api';
import { contactSelect } from '@/lib/selects';

export const dynamic = 'force-dynamic';

// GET /api/requests/:id – visible to the requesting NGO, the donor, the assigned volunteer and admins.
export const GET = route<{ id: string }>('requests:get', async (_request, { id }) => {
  const auth = await requireUser({ roles: ['NGO', 'DONOR', 'VOLUNTEER', 'ADMIN'] });
  if (auth.error) return auth.error;
  const actor = auth.user;

  const request = await prisma.foodRequest.findUnique({
    where: { id },
    include: {
      donation: {
        include: {
          donorProfile: {
            select: { userId: true, organisationName: true, organisationType: true, address: true, user: { select: contactSelect } },
          },
        },
      },
      ngoProfile: {
        select: {
          userId: true, organisationName: true, address: true, latitude: true, longitude: true,
          registrationNumber: true, user: { select: contactSelect },
        },
      },
      assignments: {
        orderBy: { createdAt: 'desc' },
        include: {
          volunteerProfile: { select: { id: true, userId: true, vehicleType: true, user: { select: contactSelect } } },
        },
      },
      proofs: { orderBy: { createdAt: 'asc' }, include: { submittedBy: { select: { name: true, role: true } } } },
      impact: true,
    },
  });
  if (!request) throw notFound('Request not found');

  const isNgo = request.ngoProfile.userId === actor.id;
  const isDonor = request.donation.donorProfile.userId === actor.id;
  const isVolunteer = request.assignments.some(
    (a) => a.volunteerProfile.userId === actor.id && !['DECLINED', 'CANCELLED'].includes(a.status)
  );
  if (!(actor.role === 'ADMIN' || isNgo || isDonor || isVolunteer)) throw notFound('Request not found');

  return NextResponse.json({
    ...request,
    viewer: { isNgo, isDonor, isVolunteer, isAdmin: actor.role === 'ADMIN' },
  });
});
