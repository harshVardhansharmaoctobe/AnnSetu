'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { NgoRequestList, type NgoRequestRow } from '@/components/ngo-request-list';
import { PageHeader, Pagination } from '@/components/states';
import { useApi, toQuery, type ListResult } from '@/lib/client';

const FILTERS = ['', 'PENDING', 'ACCEPTED', 'VOLUNTEER_ASSIGNED', 'PICKED_UP', 'DELIVERED', 'COMPLETED', 'REJECTED', 'CANCELLED'];

export default function NgoRequestsPage() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const state = useApi<ListResult<NgoRequestRow>>(`/api/requests${toQuery({ status, page })}`);
  return (
    <div>
      <PageHeader title="My requests" description="Track each request from approval to delivery." />
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <Button key={f || 'all'} size="sm" variant={status === f ? 'default' : 'outline'} onClick={() => { setStatus(f); setPage(1); }}>
            {f ? f.toLowerCase().replace(/_/g, ' ') : 'All'}
          </Button>
        ))}
      </div>
      <NgoRequestList state={state} empty={{ title: 'No requests here', action: { label: 'Find food', href: '/dashboard/ngo/browse' } }} />
      {state.data && <Pagination page={state.data.page} pageSize={state.data.pageSize} total={state.data.total} onPage={setPage} />}
    </div>
  );
}
