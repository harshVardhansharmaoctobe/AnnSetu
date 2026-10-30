'use client';

import Link from 'next/link';
import { EmptyState, ErrorState, LoadingCards, StatusBadge } from '@/components/states';
import type { ApiClientError, ListResult } from '@/lib/client';
import { formatDateTime } from '@/lib/utils';

export interface NgoRequestRow {
  id: string; status: string; requestedQuantity: number; createdAt: string; updatedAt: string;
  donation: { foodName: string; unit: string; pickupAddress: string; donorProfile: { organisationName: string } };
  assignments: { volunteerProfile: { user: { name: string } } }[];
}

export function NgoRequestList({ state, empty }: {
  state: { data: ListResult<NgoRequestRow> | null; error: ApiClientError | null; loading: boolean; reload: () => void };
  empty: { title: string; description?: string; action?: { label: string; href: string } };
}) {
  if (state.loading && !state.data) return <LoadingCards count={2} />;
  if (state.error) return <ErrorState message={state.error.message} onRetry={state.reload} />;
  if (!state.data || state.data.items.length === 0) return <EmptyState {...empty} />;
  return (
    <ul className="divide-y rounded-xl border bg-white">
      {state.data.items.map((r) => (
        <li key={r.id}>
          <Link href={`/dashboard/ngo/requests/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-muted/40" data-testid="ngo-request-row">
            <div>
              <p className="font-medium">{r.donation.foodName}</p>
              <p className="text-xs text-muted-foreground">
                {r.requestedQuantity} {r.donation.unit.toLowerCase()} · {r.donation.donorProfile.organisationName} · updated {formatDateTime(r.updatedAt)}
                {r.assignments[0] && ` · volunteer ${r.assignments[0].volunteerProfile.user.name}`}
              </p>
            </div>
            <StatusBadge status={r.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
