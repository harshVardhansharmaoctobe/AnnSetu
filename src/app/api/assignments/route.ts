import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { requireUser } from '@/lib/api-auth';
import { forbidden, listResponse, paginate, parseBody, parseQuery, route } from '@/lib/api';
import { assignmentCreateSchema, assignmentQuerySchema } from '@/lib/validations';
import { acceptAssignment, ACTIVE_ASSIGNMENT_STATUSES, assignVolunteer, ensureVolunteerProfile } from '@/lib/workflow';
import { calculateDistance } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const deliveryInclude = {
  donation: {
    select: {
      id: true, foodName: true, unit: true, foodCategory: true, safePickupDeadline: true, pickupAddress: true,
      latitude: true, longitude: true, handlingInstructions: true, storageConditions: true, photoUrl: true,
      donorProfile: { select: { organisationName: true } },
    },
  },
  ngoProfile: { select: { organisationName: true, address: true, latitude: true, longitude: true } },
} satisfies Prisma.FoodRequestInclude;

const HISTORY = ['DELIVERED', 'COMPLETED', 'REJECTED', 'CANCELLED'] as const;

// GET /api/assignments?scope=mine|open|all&group=active|history&status=
export const GET = route('assignments:list', async (request) => {
  const auth = await requireUser({ roles: ['VOLUNTEER', 'ADMIN'] });
  if (auth.error) return auth.error;
  const actor = auth.user;
  const query = parseQuery(request, assignmentQuerySchema);
  const { skip, take, page, pageSize } = paginate(query.page, query.pageSize);

  if (query.scope === 'all' && actor.role !== 'ADMIN') throw forbidden();
  if (query.scope === 'mine' && actor.role !== 'VOLUNTEER') throw forbidden('Only volunteers have assignments');

  const volunteer = actor.role === 'VOLUNTEER' ? await ensureVolunteerProfile(prisma, actor.id) : null;
  const where: Prisma.VolunteerAssignmentWhereInput =
    query.scope === 'open'
      // Open deliveries: created at donor approval, not yet taken by anyone.
      ? { status: 'PENDING', volunteerProfileId: null }
      : {
        ...(query.status && { status: query.status }),
        ...(query.group === 'active' && { status: { in: ACTIVE_ASSIGNMENT_STATUSES } }),
        ...(query.group === 'history' && { status: { in: [...HISTORY] } }),
        ...(query.scope === 'mine' && { volunteerProfileId: volunteer!.id }),
      };

  const [items, total] = await Promise.all([
    prisma.volunteerAssignment.findMany({
      where,
      orderBy: query.scope === 'open' ? { createdAt: 'asc' } : { updatedAt: 'desc' },
      skip,
      take,
      include: {
        request: { include: deliveryInclude },
        volunteerProfile: { select: { id: true, user: { select: { name: true } } } },
      },
    }),
    prisma.volunteerAssignment.count({ where }),
  ]);

  const hasOrigin = volunteer?.latitude != null && volunteer?.longitude != null;
  return listResponse(
    items.map((a) => ({
      ...a,
      pickupDistanceKm: hasOrigin
        ? calculateDistance(volunteer!.latitude!, volunteer!.longitude!, a.request.donation.latitude, a.request.donation.longitude)
        : null,
      tripDistanceKm: calculateDistance(
        a.request.donation.latitude, a.request.donation.longitude, a.request.ngoProfile.latitude, a.request.ngoProfile.longitude
      ),
    })),
    total, page, pageSize
  );
});

// POST /api/assignments { requestId, volunteerProfileId? }
//   ADMIN:     offers the request's open assignment to a volunteer (status ASSIGNED)
//   VOLUNTEER: accepts the request's open assignment (status ACCEPTED) – same as POST /:id/accept
export const POST = route('assignments:create', async (request) => {
  const auth = await requireUser({ roles: ['VOLUNTEER', 'ADMIN'] });
  if (auth.error) return auth.error;
  const input = await parseBody(request, assignmentCreateSchema);
  if (auth.user.role === 'ADMIN') {
    return NextResponse.json(await assignVolunteer(auth.user, input), { status: 201 });
  }
  if (input.volunteerProfileId) {
    const own = await ensureVolunteerProfile(prisma, auth.user.id);
    if (input.volunteerProfileId !== own.id) throw forbidden('Volunteers can only claim deliveries for themselves');
  }
  return NextResponse.json(await acceptAssignment(auth.user, { requestId: input.requestId }), { status: 201 });
});
