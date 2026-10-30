'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { EmptyState, ErrorState, LoadingCards, PageHeader, Pagination, StatusBadge, humanize } from '@/components/states';
import { useApi, toQuery, type ListResult } from '@/lib/client';
import { formatDateTime } from '@/lib/utils';

interface Row {
  id: string; foodName: string; status: string; quantity: number; remainingQuantity: number; unit: string; foodCategory: string;
  safePickupDeadline: string; createdAt: string; pickupAddress: string; donorProfile: { organisationName: string };
  requestCounts: Record<string, number>;
}

export default function AdminDonationsPage() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => { setDebounced(q); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [q]);
  const { data, error, loading, reload } = useApi<ListResult<Row>>(`/api/donations${toQuery({ scope: 'all', q: debounced, status, page })}`);

  return (
    <div>
      <PageHeader title="All donations" />
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_14rem]">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search food, donor or address" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search donations" />
        </div>
        <NativeSelect aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {['AVAILABLE', 'PARTIALLY_RESERVED', 'FULLY_RESERVED', 'COMPLETED', 'EXPIRED', 'CANCELLED'].map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
        </NativeSelect>
      </div>
      {loading && !data ? <LoadingCards />
        : error ? <ErrorState message={error.message} onRetry={reload} />
          : data!.items.length === 0 ? <EmptyState title="No donations match" />
            : (
              <div className="overflow-x-auto rounded-xl border bg-white">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                    <tr><th className="p-3">Donation</th><th className="p-3">Donor</th><th className="p-3">Quantity</th><th className="p-3">Pickup by</th><th className="p-3">Requests</th><th className="p-3">Status</th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {data!.items.map((d) => (
                      <tr key={d.id}>
                        <td className="p-3"><p className="font-medium">{d.foodName}</p><p className="text-xs text-muted-foreground">{humanize(d.foodCategory)} · {formatDateTime(d.createdAt)}</p></td>
                        <td className="p-3">{d.donorProfile.organisationName}</td>
                        <td className="p-3">{d.remainingQuantity}/{d.quantity} {d.unit.toLowerCase()}</td>
                        <td className="p-3">{formatDateTime(d.safePickupDeadline)}</td>
                        <td className="p-3 text-xs">{Object.entries(d.requestCounts).map(([k, v]) => `${v} ${humanize(k).toLowerCase()}`).join(', ') || '—'}</td>
                        <td className="p-3"><StatusBadge status={d.status} /></td>
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
