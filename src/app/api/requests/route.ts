import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { requireUser } from '@/lib/api-auth';
import { listResponse, paginate, parseBody, parseQuery, route } from '@/lib/api';
import { foodRequestSchema, requestQuerySchema } from '@/lib/validations';
import { createRequest } from '@/lib/workflow';

export const dynamic = 'force-dynamic';

// GET /api/requests – NGO: own requests · DONOR: requests on own donations · ADMIN: all
export const GET = route('requests:list', async (request) => {
  const auth = await requireUser({ roles: ['NGO', 'DONOR', 'ADMIN'] });
  if (auth.error) return auth.error;
  const actor = auth.user;
  const query = parseQuery(request, requestQuerySchema);
  const { skip, take, page, pageSize } = paginate(query.page, query.pageSize);

  const where: Prisma.FoodRequestWhereInput = {
    ...(query.status && { status: query.status }),
    ...(query.donationId && { donationId: query.donationId }),
    ...(actor.role === 'NGO' && { ngoProfile: { userId: actor.id } }),
    ...(actor.role === 'DONOR' && { donation: { donorProfile: { userId: actor.id } } }),
  };

  const [items, total] = await Promise.all([
    prisma.foodRequest.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip,
      take,
      include: {
        donation: {
          select: {
            id: true, foodName: true, unit: true, quantity: true, status: true, foodCategory: true,
            safePickupDeadline: true, pickupAddress: true, photoUrl: true, latitude: true, longitude: true,
            donorProfile: { select: { organisationName: true } },
          },
        },
        ngoProfile: { select: { id: true, organisationName: true, address: true } },
        assignments: {
          where: { status: { notIn: ['DECLINED', 'CANCELLED'] } },
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { id: true, status: true, volunteerProfile: { select: { user: { select: { name: true } } } } },
        },
      },
    }),
    prisma.foodRequest.count({ where }),
  ]);
  return listResponse(items, total, page, pageSize);
});

// POST /api/requests – NGO requests food from a donation.
export const POST = route('requests:create', async (request) => {
  const auth = await requireUser({ roles: ['NGO'] });
  if (auth.error) return auth.error;
  const input = await parseBody(request, foodRequestSchema);
  return NextResponse.json(await createRequest(auth.user, input), { status: 201 });
});
