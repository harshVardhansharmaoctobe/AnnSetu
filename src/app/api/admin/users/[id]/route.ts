import { NextResponse } from 'next/server';
import type { AccountStatus, NotificationType } from '@prisma/client';
import prisma from '@/lib/db';
import { requireUser } from '@/lib/api-auth';
import { clientIp, conflict, forbidden, notFound, parseBody, route } from '@/lib/api';
import { accountActionSchema } from '@/lib/validations';
import { audit, notify } from '@/lib/events';
import { adminUserSelect } from '@/lib/selects';
import { releaseAssignment } from '@/lib/workflow';

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

    // A suspended volunteer's deliveries that are not yet picked up reopen for other volunteers.
    if (t.to === 'SUSPENDED' && target.role === 'VOLUNTEER') {
      const active = await tx.volunteerAssignment.findMany({
        where: { volunteerProfile: { userId: id }, status: { in: ['ASSIGNED', 'ACCEPTED', 'PICKUP_IN_PROGRESS'] } },
        select: { id: true, requestId: true, status: true },
      });
      for (const a of active) await releaseAssignment(tx, a, 'CANCELLED', 'Volunteer account suspended');
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

// GET /api/admin/users/:id – profile details, activity counts and the account's audit history.
export const GET = route<{ id: string }>('admin:user-detail', async (_request, { id }) => {
  const auth = await requireUser({ roles: ['ADMIN'] });
  if (auth.error) return auth.error;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      ...adminUserSelect,
      avatarUrl: true,
      isDemo: true,
      donorProfile: true,
      ngoProfile: true,
      volunteerProfile: true,
    },
  });
  if (!user) throw notFound('User not found');
  const [donations, requests, assignments, history] = await Promise.all([
    user.donorProfile ? prisma.foodDonation.groupBy({ by: ['status'], where: { donorProfileId: user.donorProfile.id }, _count: true }) : [],
    user.ngoProfile ? prisma.foodRequest.groupBy({ by: ['status'], where: { ngoProfileId: user.ngoProfile.id }, _count: true }) : [],
    user.volunteerProfile ? prisma.volunteerAssignment.groupBy({ by: ['status'], where: { volunteerProfileId: user.volunteerProfile.id }, _count: true }) : [],
    prisma.auditLog.findMany({
      where: { OR: [{ entity: 'User', entityId: id }, { userId: id }] },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { user: { select: { name: true, role: true } } },
    }),
  ]);
  const counts = (rows: { status: string; _count: number }[]) => Object.fromEntries(rows.map((r) => [r.status, r._count]));
  return NextResponse.json({
    ...user,
    activity: { donations: counts(donations), requests: counts(requests), assignments: counts(assignments) },
    history,
  });
});
