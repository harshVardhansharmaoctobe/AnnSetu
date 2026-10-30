'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DonorRequestCard, type DonorRequest } from '@/components/donor-request-card';
import { EmptyState, ErrorState, LoadingCards, PageHeader, Pagination } from '@/components/states';
import { useApi, toQuery, type ListResult } from '@/lib/client';

const FILTERS = ['PENDING', '', 'ACCEPTED', 'VOLUNTEER_ASSIGNED', 'PICKED_UP', 'DELIVERED', 'COMPLETED', 'REJECTED'];

export default function DonorRequestsPage() {
  const [status, setStatus] = useState('PENDING');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<ListResult<DonorRequest>>(`/api/requests${toQuery({ status, page })}`);

  return (
    <div>
      <PageHeader title="NGO requests" description="Approve requests to reserve food; declined requests free nothing." />
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <Button key={f || 'all'} size="sm" variant={status === f ? 'default' : 'outline'} onClick={() => { setStatus(f); setPage(1); }}>
            {f ? f.toLowerCase().replace(/_/g, ' ') : 'All'}
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
