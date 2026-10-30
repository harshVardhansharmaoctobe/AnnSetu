'use client';

import { useSession } from 'next-auth/react';
import { useState } from 'react';
import { NativeSelect } from '@/components/ui/native-select';
import { ImpactPanel, type ImpactData } from '@/components/impact-panel';
import { ErrorState, LoadingCards, PageHeader } from '@/components/states';
import { useApi } from '@/lib/client';

export default function ImpactPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'ADMIN';
  const [interval, setTrendInterval] = useState<'day' | 'week' | 'month'>('week');
  const platform = useApi<ImpactData>(`/api/impact?trend=${interval}`);
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
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Across FoodBridge</h2>
          <NativeSelect aria-label="Trend period" className="w-40" value={interval} onChange={(e) => setTrendInterval(e.target.value as 'day' | 'week' | 'month')}>
            <option value="day">Daily (30 days)</option>
            <option value="week">Weekly (12 weeks)</option>
            <option value="month">Monthly (12 months)</option>
          </NativeSelect>
        </div>
        {platform.loading && !platform.data ? <LoadingCards count={4} />
          : platform.error || !platform.data ? <ErrorState message={platform.error?.message ?? 'Could not load impact'} onRetry={platform.reload} />
            : <ImpactPanel data={platform.data} />}
      </section>
    </div>
  );
}
