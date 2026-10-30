import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { notFound, parseBody, route } from '@/lib/api';
import { confirmReceiptSchema, disputeResolutionSchema, reasonSchema } from '@/lib/validations';
import { approveRequest, cancelRequest, confirmReceipt, rejectRequest, resolveDispute } from '@/lib/workflow';

type Params = { id: string; action: string };

const ROLE_FOR_ACTION = {
  approve: 'DONOR',
  reject: 'DONOR',
  cancel: 'NGO',
  confirm: 'NGO',
  resolve: 'ADMIN',
} as const;

// POST /api/requests/:id/(approve|reject|cancel|confirm|resolve)
export const POST = route<Params>('requests:action', async (request, { id, action }) => {
  if (!(action in ROLE_FOR_ACTION)) throw notFound('Unknown action');
  const role = ROLE_FOR_ACTION[action as keyof typeof ROLE_FOR_ACTION];
  const auth = await requireUser({ roles: [role] });
  if (auth.error) return auth.error;
  const actor = auth.user;

  switch (action) {
    case 'approve':
      return NextResponse.json(await approveRequest(actor, id));
    case 'reject': {
      const { reason } = await parseBody(request, reasonSchema);
      return NextResponse.json(await rejectRequest(actor, id, reason));
    }
    case 'cancel': {
      const { reason } = await parseBody(request, reasonSchema);
      return NextResponse.json(await cancelRequest(actor, id, reason));
    }
    case 'resolve':
      return NextResponse.json(await resolveDispute(actor, id, await parseBody(request, disputeResolutionSchema)));
    default:
      return NextResponse.json(await confirmReceipt(actor, id, await parseBody(request, confirmReceiptSchema)));
  }
});
