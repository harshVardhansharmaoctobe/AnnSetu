import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireUser } from '@/lib/api-auth';
import { notFound, route } from '@/lib/api';
import { contactSelect } from '@/lib/selects';

export const dynamic = 'force-dynamic';

// GET /api/assignments/:id – the volunteer, the donor, the NGO of that delivery, and admins.
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

  const allowed =
    actor.role === 'ADMIN' ||
    assignment.volunteerProfile.userId === actor.id ||
    assignment.request.donation.donorProfile.userId === actor.id ||
    assignment.request.ngoProfile.userId === actor.id;
  if (!allowed) throw notFound('Assignment not found');

  return NextResponse.json({ ...assignment, isMine: assignment.volunteerProfile.userId === actor.id });
});
