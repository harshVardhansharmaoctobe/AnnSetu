'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DonationForm, type DonationFormValues } from '@/components/donation-form';
import { ErrorState, LoadingCards, PageHeader } from '@/components/states';
import { useToast } from '@/components/toaster';
import { api, useApi } from '@/lib/client';

interface Profile {
  phone: string | null;
  donorProfile: { address: string; latitude: number; longitude: number } | null;
}

export default function NewDonationPage() {
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<Profile>('/api/profile');

  if (loading && !data) return <LoadingCards count={2} />;
  if (error || !data) return <ErrorState message={error?.message ?? 'Could not load your profile'} onRetry={reload} />;
  if (!data.donorProfile) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900">
        <p className="font-semibold">Complete your donor profile first</p>
        <p className="mt-1 text-sm">We use your organisation name and location for every listing.</p>
        <Link href="/dashboard/profile" className="mt-3 inline-block font-semibold underline">Go to profile</Link>
      </div>
    );
  }

  async function create(values: DonationFormValues) {
    const donation = await api<{ id: string }>('/api/donations', { body: values });
    toast.success('Donation published', 'Nearby NGOs can now request it.');
    router.push(`/dashboard/donor/donations/${donation.id}`);
  }

  const p = data.donorProfile;
  return (
    <div>
      <PageHeader title="New donation" description="Describe the surplus food and when it must be collected." />
      <DonationForm
        mode="create"
        defaultLocation={{ address: p.address, latitude: p.latitude, longitude: p.longitude }}
        initial={{ contactPhone: data.phone ?? undefined }}
        onSubmit={create}
        onCancel={() => router.back()}
      />
    </div>
  );
}
