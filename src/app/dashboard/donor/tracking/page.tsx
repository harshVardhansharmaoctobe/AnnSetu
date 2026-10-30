'use client';

import Link from 'next/link';
import { Truck } from 'lucide-react';
import { RequestProgress } from '@/components/request-progress';
import { EmptyState, ErrorState, LoadingCards, PageHeader, StatusBadge, humanize } from '@/components/states';
import { useApi, type ListResult } from '@/lib/client';
import { formatDateTime } from '@/lib/utils';

interface Row {
  id: string; status: string; requestedQuantity: number; createdAt: string; updatedAt: string;
  approvedAt: string | null; pickedUpAt: string | null; inTransitAt: string | null; deliveredAt: string | null; completedAt: string | null;
  donation: { id: string; foodName: string; unit: string };
  ngoProfile: { organisationName: string; address: string };
  assignments: { id: string; status: string; volunteerProfile: { user: { name: string } } | null }[];
}

const ACTIVE = 'ACCEPTED,VOLUNTEER_ASSIGNED,PICKED_UP,IN_TRANSIT,DELIVERED';

/** Approved requests on the donor's donations that are still on their way to the NGO. */
export default function DonorTrackingPage() {
  const { data, error, loading, reload } = useApi<ListResult<Row>>(`/api/requests?statuses=${ACTIVE}&pageSize=50`);
  return (
    <div className="space-y-6">
      <PageHeader title="Volunteer tracking" description="Every approved request from approval to the NGO's confirmation." />
      {loading && !data ? <LoadingCards count={2} />
        : error ? <ErrorState message={error.message} onRetry={reload} />
          : data!.items.length === 0 ? <EmptyState icon={Truck} title="Nothing on the way" description="Approved requests appear here until the NGO confirms receipt." />
            : (
              <ul className="space-y-4">
                {data!.items.map((r) => {
                  const a = r.assignments[0];
                  return (
                    <li key={r.id} className="space-y-4 rounded-xl border bg-white p-5" data-testid="tracking-row">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <Link href={`/dashboard/donor/donations/${r.donation.id}`} className="font-semibold hover:underline">{r.donation.foodName}</Link>
                          <p className="text-sm text-muted-foreground">{r.requestedQuantity} {r.donation.unit.toLowerCase()} → {r.ngoProfile.organisationName}, {r.ngoProfile.address}</p>
                          <p className="text-sm">
                            Volunteer: {a?.volunteerProfile ? <span className="font-medium">{a.volunteerProfile.user.name}</span> : <span className="text-muted-foreground">open – waiting for a volunteer</span>}
                            {a && <span className="text-muted-foreground"> · assignment {humanize(a.status).toLowerCase()}</span>}
                          </p>
                        </div>
                        <div className="text-right"><StatusBadge status={r.status} /><p className="mt-1 text-xs text-muted-foreground">Updated {formatDateTime(r.updatedAt)}</p></div>
                      </div>
                      <RequestProgress request={r} />
                    </li>
                  );
                })}
              </ul>
            )}
    </div>
  );
}
