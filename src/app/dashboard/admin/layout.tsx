import { requirePageUser } from '@/lib/page-auth';

// Approved ADMIN accounts only; everyone else is redirected to their own dashboard.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePageUser({ roles: ['ADMIN'] });
  return children;
}
