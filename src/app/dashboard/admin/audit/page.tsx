'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { EmptyState, ErrorState, LoadingCards, PageHeader, Pagination, humanize } from '@/components/states';
import { useApi, toQuery, type ListResult } from '@/lib/client';
import { formatDateTime } from '@/lib/utils';

interface Entry {
  id: string; action: string; entity: string; entityId: string | null; details: string | null; ipAddress: string | null; createdAt: string;
  user: { name: string; email: string; role: string } | null;
}

export default function AuditPage() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [entity, setEntity] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => { setDebounced(q); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [q]);
  const { data, error, loading, reload } = useApi<ListResult<Entry>>(`/api/admin/audit${toQuery({ q: debounced, entity, page })}`);

  return (
    <div>
      <PageHeader title="Audit log" description="Every account decision and delivery state change, newest first." />
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_14rem]">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search action, details or user" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search audit log" />
        </div>
        <NativeSelect aria-label="Entity" value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }}>
          <option value="">All entities</option>
          {['User', 'FoodDonation', 'FoodRequest', 'VolunteerAssignment'].map((x) => <option key={x} value={x}>{x}</option>)}
        </NativeSelect>
      </div>
      {loading && !data ? <LoadingCards />
        : error ? <ErrorState message={error.message} onRetry={reload} />
          : data!.items.length === 0 ? <EmptyState title="No audit entries" />
            : (
              <div className="overflow-x-auto rounded-xl border bg-white">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                    <tr><th className="p-3">When</th><th className="p-3">Who</th><th className="p-3">Action</th><th className="p-3">Details</th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {data!.items.map((e) => (
                      <tr key={e.id} data-testid="audit-row">
                        <td className="whitespace-nowrap p-3 text-xs">{formatDateTime(e.createdAt)}</td>
                        <td className="p-3 text-xs">{e.user ? <>{e.user.name}<br /><span className="text-muted-foreground">{humanize(e.user.role)}</span></> : 'System / deleted user'}</td>
                        <td className="p-3"><span className="font-medium">{humanize(e.action)}</span><br /><span className="text-xs text-muted-foreground">{e.entity}{e.entityId && ` · ${e.entityId.slice(0, 10)}…`}</span></td>
                        <td className="p-3 text-xs text-muted-foreground">{e.details ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    </div>
  );
}
