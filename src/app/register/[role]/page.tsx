import { notFound } from 'next/navigation';
import { PublicHeader } from '@/components/public-chrome';
import { RegistrationForm, type RegistrationRole } from '@/components/registration-form';

const ROLE_BY_SLUG: Record<string, RegistrationRole> = { donor: 'DONOR', ngo: 'NGO', volunteer: 'VOLUNTEER' };

// /register/donor · /register/ngo · /register/volunteer – there is deliberately no admin form.
export default async function RegisterRolePage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  const mapped = ROLE_BY_SLUG[role];
  if (!mapped) notFound();
  return (
    <div className="min-h-screen gradient-hero">
      <PublicHeader />
      <main className="flex justify-center px-4 py-10">
        <RegistrationForm role={mapped} />
      </main>
    </div>
  );
}
