import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { notFound, parseBody, route } from '@/lib/api';
import { deliverySchema, pickupSchema, reasonSchema } from '@/lib/validations';
import {
  acceptAssignment, cancelAssignment, declineAssignment, markDelivered, markPickedUp,
} from '@/lib/workflow';

type Params = { id: string; action: string };

const ROLE_FOR_ACTION = {
  accept: 'VOLUNTEER',
  decline: 'VOLUNTEER',
  pickup: 'VOLUNTEER',
  deliver: 'VOLUNTEER',
  cancel: 'ADMIN',
} as const;

// POST /api/assignments/:id/(accept|decline|pickup|deliver|cancel)
export const POST = route<Params>('assignments:action', async (request, { id, action }) => {
  if (!(action in ROLE_FOR_ACTION)) throw notFound('Unknown action');
  const auth = await requireUser({ roles: [ROLE_FOR_ACTION[action as keyof typeof ROLE_FOR_ACTION]] });
  if (auth.error) return auth.error;
  const actor = auth.user;

  switch (action) {
    case 'accept':
      return NextResponse.json(await acceptAssignment(actor, id));
    case 'decline':
      return NextResponse.json(await declineAssignment(actor, id, (await parseBody(request, reasonSchema)).reason));
    case 'pickup':
      return NextResponse.json(await markPickedUp(actor, id, await parseBody(request, pickupSchema)));
    case 'deliver':
      return NextResponse.json(await markDelivered(actor, id, await parseBody(request, deliverySchema)));
    default:
      return NextResponse.json(await cancelAssignment(actor, id, (await parseBody(request, reasonSchema)).reason));
  }
});
