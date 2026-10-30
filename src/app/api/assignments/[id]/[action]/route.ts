import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { notFound, parseBody, route } from '@/lib/api';
import { assignSchema, deliverySchema, emptyBodySchema, failSchema, pickupSchema, reasonSchema } from '@/lib/validations';
import { acceptAssignment, advanceAssignment, assignVolunteer, cancelAssignment, rejectAssignment } from '@/lib/workflow';

type Params = { id: string; action: string };

const ROLE_FOR_ACTION = {
  accept: 'VOLUNTEER',
  reject: 'VOLUNTEER',
  decline: 'VOLUNTEER', // alias of reject
  arrive: 'VOLUNTEER',
  pickup: 'VOLUNTEER',
  transit: 'VOLUNTEER',
  deliver: 'VOLUNTEER',
  fail: 'VOLUNTEER',
  assign: 'ADMIN',
  cancel: 'ADMIN',
} as const;

// POST /api/assignments/:id/(accept|reject|arrive|pickup|transit|deliver|fail|assign|cancel)
export const POST = route<Params>('assignments:action', async (request, { id, action }) => {
  if (!(action in ROLE_FOR_ACTION)) throw notFound('Unknown action');
  const auth = await requireUser({ roles: [ROLE_FOR_ACTION[action as keyof typeof ROLE_FOR_ACTION]] });
  if (auth.error) return auth.error;
  const actor = auth.user;

  switch (action) {
    case 'accept':
      return NextResponse.json(await acceptAssignment(actor, { assignmentId: id }));
    case 'reject':
    case 'decline':
      return NextResponse.json(await rejectAssignment(actor, id, (await parseBody(request, reasonSchema)).reason));
    case 'arrive':
    case 'transit':
      await parseBody(request, emptyBodySchema);
      return NextResponse.json(await advanceAssignment(actor, id, action));
    case 'pickup':
      return NextResponse.json(await advanceAssignment(actor, id, 'pickup', await parseBody(request, pickupSchema)));
    case 'deliver':
      return NextResponse.json(await advanceAssignment(actor, id, 'deliver', await parseBody(request, deliverySchema)));
    case 'fail':
      return NextResponse.json(await advanceAssignment(actor, id, 'fail', await parseBody(request, failSchema)));
    case 'assign':
      return NextResponse.json(await assignVolunteer(actor, { assignmentId: id, ...(await parseBody(request, assignSchema)) }));
    default:
      return NextResponse.json(await cancelAssignment(actor, id, (await parseBody(request, reasonSchema)).reason));
  }
});
