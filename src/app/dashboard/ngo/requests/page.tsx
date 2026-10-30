'use client';

import { Suspense, useState } from 'react';
import { Button } from '@/components/ui/button';
import { NgoRequestList, type NgoRequestRow } from '@/components/ngo-request-list';
import { LoadingCards, PageHeader, Pagination, humanize } from '@/components/states';
import { useApi, useQueryParam, toQuery, type ListResult } from '@/lib/client';

const GROUPS: Record<string, { title: string; description: string; statuses: string }> = {
  active: {
    title: 'Active deliveries',
    description: 'Approved requests on their way to you – follow the volunteer and confirm on arrival.',
    statuses: 'ACCEPTED,VOLUNTEER_ASSIGNED,PICKED_UP,IN_TRANSIT,DELIVERED',
  },
  received: { title: 'Received food', description: 'Deliveries you confirmed – these count as verified impact.', statuses: 'COMPLETED' },
};
const FILTERS = ['', 'PENDING', 'ACCEPTED', 'VOLUNTEER_ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED', 'DISPUTED', 'REJECTED', 'CANCELLED'];

function NgoRequests() {
  const [group, setGroup] = useQueryParam('group');
  const [status, setStatus] = useQueryParam('status');
  const [page, setPage] = useState(1);
  const g = GROUPS[group];
  const state = useApi<ListResult<NgoRequestRow>>(
    `/api/requests${toQuery(g ? { statuses: g.statuses, page } : { status, page })}`
  );
  return (
    <div>
      <PageHeader title={g?.title ?? 'Food requests'} description={g?.description ?? 'Track each request from approval to delivery.'} />
      {!g && (
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <Button key={f || 'all'} size="sm" variant={status === f ? 'default' : 'outline'} onClick={() => { setStatus(f); setPage(1); }}>
              {f ? humanize(f) : 'All'}
            </Button>
          ))}
        </div>
      )}
      {g && <Button variant="ghost" size="sm" className="mb-3" onClick={() => setGroup('')}>Show all requests</Button>}
      <NgoRequestList state={state} empty={{ title: 'Nothing here yet', action: { label: 'Discover food', href: '/dashboard/ngo/browse' } }} />
      {state.data && <Pagination page={state.data.page} pageSize={state.data.pageSize} total={state.data.total} onPage={setPage} />}
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<LoadingCards count={2} />}><NgoRequests /></Suspense>;
}
