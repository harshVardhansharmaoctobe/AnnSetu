import { NextResponse } from 'next/server';
import type { AccountStatus, NotificationType } from '@prisma/client';
import prisma from '@/lib/db';
import { requireUser } from '@/lib/api-auth';
import { clientIp, conflict, forbidden, notFound, parseBody, route } from '@/lib/api';
import { accountActionSchema } from '@/lib/validations';
import { audit, notify } from '@/lib/events';
import { adminUserSelect } from '@/lib/selects';

const TRANSITIONS: Record<
  'approve' | 'reject' | 'suspend' | 'reinstate',
  { from: AccountStatus[]; to: AccountStatus; notification: NotificationType; title: string; message: string }
> = {
  approve: {
    from: ['PENDING', 'REJECTED'], to: 'APPROVED', notification: 'ACCOUNT_APPROVED',
    title: 'Account approved', message: 'Your FoodBridge account has been approved. Welcome aboard!',
  },
  reject: {
    from: ['PENDING'], to: 'REJECTED', notification: 'ACCOUNT_REJECTED',
    title: 'Account not approved', message: 'Your FoodBridge application was not approved.',
  },
  suspend: {
    from: ['APPROVED', 'PENDING'], to: 'SUSPENDED', notification: 'ACCOUNT_SUSPENDED',
    title: 'Account suspended', message: 'Your FoodBridge account has been suspended.',
  },
  reinstate: {
    from: ['SUSPENDED'], to: 'APPROVED', notification: 'ACCOUNT_REINSTATED',
    title: 'Account reinstated', message: 'Your FoodBridge account has been reinstated.',
  },
};

// POST /api/admin/users/:id  { action: approve|reject|suspend|reinstate, reason? }
export const POST = route<{ id: string }>('admin:user-action', async (request, { id }) => {
  const auth = await requireUser({ roles: ['ADMIN'] });
  if (auth.error) return auth.error;
  const admin = auth.user;
  const { action, reason } = await parseBody(request, accountActionSchema);
  const t = TRANSITIONS[action];

  if (id === admin.id) throw forbidden('You cannot change your own account status', 'SELF_ACTION');

  const updated = await prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id }, select: { id: true, role: true, accountStatus: true, name: true } });
    if (!target) throw notFound('User not found');
    if (target.role === 'ADMIN') throw forbidden('Admin accounts are managed directly in the database', 'ADMIN_TARGET');

    const moved = await tx.user.updateMany({
      where: { id, accountStatus: { in: t.from } },
      data: { accountStatus: t.to },
    });
    if (moved.count === 0) {
      throw conflict(`Cannot ${action} an account that is ${target.accountStatus.toLowerCase()}`, 'INVALID_TRANSITION');
    }

    // A suspended volunteer's deliveries that are not yet picked up go back to the pool.
    if (t.to === 'SUSPENDED' && target.role === 'VOLUNTEER') {
      const active = await tx.volunteerAssignment.findMany({
        where: { volunteerProfile: { userId: id }, status: { in: ['ASSIGNED', 'ACCEPTED'] } },
        select: { id: true, requestId: true },
      });
      if (active.length > 0) {
        await tx.volunteerAssignment.updateMany({
          where: { id: { in: active.map((a) => a.id) } },
          data: { status: 'CANCELLED', notes: 'Volunteer account suspended' },
        });
        await tx.foodRequest.updateMany({
          where: { id: { in: active.map((a) => a.requestId) }, status: 'VOLUNTEER_ASSIGNED' },
          data: { status: 'ACCEPTED' },
        });
      }
    }

    await notify(tx, {
      userId: id,
      type: t.notification,
      title: t.title,
      message: reason ? `${t.message} Reason: ${reason}` : t.message,
      link: '/dashboard',
    });
    await audit(tx, {
      userId: admin.id,
      action: `ACCOUNT_${t.to}`,
      entity: 'User',
      entityId: id,
      details: `${target.accountStatus} → ${t.to}${reason ? `: ${reason}` : ''}`,
      ipAddress: clientIp(request),
    });
    return tx.user.findUniqueOrThrow({ where: { id }, select: adminUserSelect });
  });

  return NextResponse.json(updated);
});
