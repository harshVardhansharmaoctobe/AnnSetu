import { requirePageUser } from '@/lib/page-auth';

// Approved VOLUNTEER accounts only; everyone else is redirected to their own dashboard.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePageUser({ roles: ['VOLUNTEER'] });
  return children;
}
