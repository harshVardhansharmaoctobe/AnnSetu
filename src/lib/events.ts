import type { NotificationType, Prisma } from '@prisma/client';
import prisma from '@/lib/db';

type Db = Prisma.TransactionClient | typeof prisma;

export interface NotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
}

/** Creates in-app notifications. Pass the transaction client so they commit with the state change. */
export async function notify(db: Db, notifications: NotificationInput | NotificationInput[]) {
  const data = Array.isArray(notifications) ? notifications : [notifications];
  if (data.length > 0) await db.notification.createMany({ data });
}

/** Notifies every approved admin (e.g. new registration awaiting review). */
export async function notifyAdmins(db: Db, notification: Omit<NotificationInput, 'userId'>) {
  const admins = await db.user.findMany({
    where: { role: 'ADMIN', accountStatus: 'APPROVED' },
    select: { id: true },
  });
  await notify(db, admins.map((a) => ({ ...notification, userId: a.id })));
}

export interface AuditInput {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string;
  details?: string;
  ipAddress?: string;
}

/** Appends an audit log entry. Never put secrets or passwords in `details`. */
export async function audit(db: Db, entry: AuditInput) {
  await db.auditLog.create({ data: entry });
}
