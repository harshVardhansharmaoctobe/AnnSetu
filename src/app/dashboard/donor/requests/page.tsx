'use client';

import { Suspense, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DonorRequestCard, type DonorRequest } from '@/components/donor-request-card';
import { EmptyState, ErrorState, LoadingCards, PageHeader, Pagination, humanize } from '@/components/states';
import { useApi, useQueryParam, toQuery, type ListResult } from '@/lib/client';

const FILTERS = ['PENDING', 'ACCEPTED', 'VOLUNTEER_ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED', 'REJECTED', 'CANCELLED', 'ALL'];
const TITLES: Record<string, string> = { PENDING: 'Incoming requests', ACCEPTED: 'Approved requests' };

function DonorRequests() {
  const [status, setStatus] = useQueryParam('status', 'PENDING');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<ListResult<DonorRequest>>(
    `/api/requests${toQuery({ status: status === 'ALL' ? undefined : status, page })}`
  );

  return (
    <div>
      <PageHeader
        title={TITLES[status] ?? 'NGO requests'}
        description="Approving a request reserves that quantity for the NGO and opens a delivery for volunteers."
      />
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <Button key={f} size="sm" variant={status === f ? 'default' : 'outline'} onClick={() => { setStatus(f); setPage(1); }}>
            {f === 'ALL' ? 'All' : f === 'ACCEPTED' ? 'Approved' : humanize(f)}
          </Button>
        ))}
      </div>
      {loading && !data ? <LoadingCards count={2} />
        : error ? <ErrorState message={error.message} onRetry={reload} />
          : data!.items.length === 0 ? <EmptyState title="No requests in this view" />
            : <div className="space-y-3">{data!.items.map((r) => <DonorRequestCard key={r.id} request={r} onChanged={reload} />)}</div>}
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<LoadingCards count={2} />}><DonorRequests /></Suspense>;
}
