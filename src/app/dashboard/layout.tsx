import DashboardLayout from '@/components/dashboard-layout';
import { requirePageUser } from '@/lib/page-auth';

export default async function Layout({ children }: { children: React.ReactNode }) {
  // Signed-in, non-suspended users only; pending/rejected users see a limited menu.
  const user = await requirePageUser({ statuses: ['APPROVED', 'PENDING', 'REJECTED'] });
  return (
    <DashboardLayout user={{ name: user.name, email: user.email, role: user.role, accountStatus: user.accountStatus }}>
      {children}
    </DashboardLayout>
  );
}
