import { notFound } from 'next/navigation';
import { AuthShell } from '@/components/auth-shell';
import { RegistrationForm, type RegistrationRole } from '@/components/registration-form';

const ROLE_BY_SLUG: Record<string, RegistrationRole> = { donor: 'DONOR', ngo: 'NGO', volunteer: 'VOLUNTEER' };

// /register/donor · /register/ngo · /register/volunteer – there is deliberately no admin form.
export default async function RegisterRolePage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  const mapped = ROLE_BY_SLUG[role];
  if (!mapped) notFound();
  return (
    <AuthShell wide>
        <RegistrationForm role={mapped} />
      </AuthShell>
  );
}
