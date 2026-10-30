import { redirect } from 'next/navigation';
import { requirePageUser, ROLE_HOME } from '@/lib/page-auth';

export default async function DashboardIndex() {
  const user = await requirePageUser({ statuses: ['APPROVED', 'PENDING', 'REJECTED'] });
  redirect(user.accountStatus === 'APPROVED' ? ROLE_HOME[user.role] : '/dashboard/pending');
}
