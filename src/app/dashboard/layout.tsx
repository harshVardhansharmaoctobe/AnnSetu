import DashboardLayout from '@/components/dashboard-layout';
import prisma from '@/lib/db';
import { requirePageUser } from '@/lib/page-auth';

export default async function Layout({ children }: { children: React.ReactNode }) {
  // Signed-in, non-suspended users only; pending/rejected users see a limited menu.
  const user = await requirePageUser({ statuses: ['APPROVED', 'PENDING', 'REJECTED'] });
  const extra = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true, avatarUrl: true } });
  return (
    <DashboardLayout user={{ name: extra?.name ?? user.name, email: user.email, role: user.role, accountStatus: user.accountStatus, avatarUrl: extra?.avatarUrl }}>
      {children}
    </DashboardLayout>
  );
}
