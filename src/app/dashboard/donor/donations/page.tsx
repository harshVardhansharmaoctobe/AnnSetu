'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { PlusCircle, UtensilsCrossed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingCards, PageHeader, Pagination, StatusBadge } from '@/components/states';
import { useApi, useQueryParam, toQuery, type ListResult } from '@/lib/client';
import { formatDateTime, formatTimeRemaining } from '@/lib/utils';

interface DonationRow {
  id: string; foodName: string; status: string; quantity: number; remainingQuantity: number; unit: string;
  safePickupDeadline: string; createdAt: string; photoUrl: string | null; requestCounts: Record<string, number>;
}

const FILTERS = ['', 'AVAILABLE', 'PARTIALLY_RESERVED', 'FULLY_RESERVED', 'COMPLETED', 'EXPIRED', 'CANCELLED'];

function MyDonations() {
  const [status, setStatus] = useQueryParam('status');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<ListResult<DonationRow>>(
    `/api/donations${toQuery({ scope: 'mine', status, page, pageSize: 12 })}`
  );

  return (
    <div>
      <PageHeader
        title={status === 'COMPLETED' ? 'Donation history' : 'My donations'}
        actions={<Button asChild><Link href="/dashboard/donor/donations/new"><PlusCircle className="mr-2 h-4 w-4" /> New donation</Link></Button>}
      />
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <Button key={f || 'all'} size="sm" variant={status === f ? 'default' : 'outline'} onClick={() => { setStatus(f); setPage(1); }}>
            {f ? f.toLowerCase().replace(/_/g, ' ') : 'All'}
          </Button>
        ))}
      </div>
      {loading && !data ? <LoadingCards />
        : error ? <ErrorState message={error.message} onRetry={reload} />
          : data!.items.length === 0 ? (
            <EmptyState title="No donations here" action={{ label: 'Create donation', href: '/dashboard/donor/donations/new' }} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data!.items.map((d) => (
                <Link key={d.id} href={`/dashboard/donor/donations/${d.id}`} className="group overflow-hidden rounded-xl border bg-white transition hover:-translate-y-0.5 hover:shadow-md">
                  <div className="relative h-36 bg-green-50">
                    {d.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={d.photoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-green-300"><UtensilsCrossed className="h-10 w-10" /></div>
                    )}
                    <StatusBadge status={d.status} className="absolute right-3 top-3 shadow-sm" />
                  </div>
                  <div className="p-4">
                    <p className="font-semibold group-hover:text-green-800">{d.foodName}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {d.remainingQuantity} of {d.quantity} {d.unit.toLowerCase()} unreserved
                    </p>
                    <div className="mt-2 h-1.5 rounded-full bg-muted" aria-hidden>
                      <div className="h-1.5 rounded-full bg-green-600" style={{ width: `${d.quantity > 0 ? Math.round(((d.quantity - d.remainingQuantity) / d.quantity) * 100) : 0}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">Pickup by {formatDateTime(d.safePickupDeadline)} ({formatTimeRemaining(d.safePickupDeadline)})</p>
                    {d.requestCounts.PENDING > 0 && (
                      <p className="mt-2 text-sm font-medium text-amber-700">{d.requestCounts.PENDING} request(s) awaiting you</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<LoadingCards />}><MyDonations /></Suspense>;
}
