'use client';

import { useSession } from 'next-auth/react';
import { ImpactPanel, type ImpactData } from '@/components/impact-panel';
import { ErrorState, LoadingCards, PageHeader } from '@/components/states';
import { useApi } from '@/lib/client';

export default function ImpactPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'ADMIN';
  const platform = useApi<ImpactData>('/api/impact');
  const mine = useApi<ImpactData & { profileIncomplete?: boolean }>(session && !isAdmin ? '/api/impact?scope=me' : null);

  return (
    <div className="space-y-10">
      <PageHeader title="Impact" description="Computed live from FoodBridge records. Estimates are labelled as such." />
      {mine.data && !mine.data.profileIncomplete && (
        <section>
          <h2 className="mb-4 text-xl font-bold">Your contribution</h2>
          <ImpactPanel data={mine.data} />
        </section>
      )}
      <section>
        <h2 className="mb-4 text-xl font-bold">Across FoodBridge</h2>
        {platform.loading && !platform.data ? <LoadingCards count={4} />
          : platform.error || !platform.data ? <ErrorState message={platform.error?.message ?? 'Could not load impact'} onRetry={platform.reload} />
            : <ImpactPanel data={platform.data} />}
      </section>
    </div>
  );
}
