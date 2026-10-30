import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { requireUser } from '@/lib/api-auth';
import { forbidden, listResponse, paginate, parseBody, parseQuery, route } from '@/lib/api';
import { assignmentCreateSchema, assignmentQuerySchema } from '@/lib/validations';
import { createAssignment, ensureVolunteerProfile } from '@/lib/workflow';
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

// GET /api/assignments?scope=mine|open|all
export const GET = route('assignments:list', async (request) => {
  const auth = await requireUser({ roles: ['VOLUNTEER', 'ADMIN'] });
  if (auth.error) return auth.error;
  const actor = auth.user;
  const query = parseQuery(request, assignmentQuerySchema);
  const { skip, take, page, pageSize } = paginate(query.page, query.pageSize);

  if (query.scope === 'open') {
    // Approved requests waiting for a volunteer.
    const volunteer = actor.role === 'VOLUNTEER' ? await ensureVolunteerProfile(prisma, actor.id) : null;
    const where: Prisma.FoodRequestWhereInput = { status: 'ACCEPTED' };
    const [items, total] = await Promise.all([
      prisma.foodRequest.findMany({ where, orderBy: { approvedAt: 'asc' }, skip, take, include: deliveryInclude }),
      prisma.foodRequest.count({ where }),
    ]);
    const hasOrigin = volunteer?.latitude != null && volunteer?.longitude != null;
    return listResponse(
      items.map((r) => ({
        ...r,
        pickupDistanceKm: hasOrigin
          ? calculateDistance(volunteer!.latitude!, volunteer!.longitude!, r.donation.latitude, r.donation.longitude)
          : null,
        tripDistanceKm: calculateDistance(r.donation.latitude, r.donation.longitude, r.ngoProfile.latitude, r.ngoProfile.longitude),
      })),
      total, page, pageSize
    );
  }

  if (query.scope === 'all' && actor.role !== 'ADMIN') throw forbidden();
  if (query.scope === 'mine' && actor.role !== 'VOLUNTEER') throw forbidden('Only volunteers have assignments');

  const where: Prisma.VolunteerAssignmentWhereInput = {
    ...(query.status && { status: query.status }),
    ...(query.scope === 'mine' && { volunteerProfile: { userId: actor.id } }),
  };
  const [items, total] = await Promise.all([
    prisma.volunteerAssignment.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip,
      take,
      include: {
        request: { include: deliveryInclude },
        volunteerProfile: { select: { id: true, user: { select: { name: true } } } },
      },
    }),
    prisma.volunteerAssignment.count({ where }),
  ]);
  return listResponse(items, total, page, pageSize);
});

// POST /api/assignments – admin assigns a volunteer, or a volunteer claims an open delivery.
export const POST = route('assignments:create', async (request) => {
  const auth = await requireUser({ roles: ['VOLUNTEER', 'ADMIN'] });
  if (auth.error) return auth.error;
  const input = await parseBody(request, assignmentCreateSchema);
  return NextResponse.json(await createAssignment(auth.user, input), { status: 201 });
});
