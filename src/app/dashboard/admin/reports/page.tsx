'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResolveDisputeDialog } from '@/components/resolve-dispute-dialog';
import { EmptyState, ErrorState, LoadingCards, PageHeader, Pagination, StatusBadge } from '@/components/states';
import { useApi, toQuery, type ListResult } from '@/lib/client';
import { formatDateTime } from '@/lib/utils';

interface Report {
  id: string; status: string; requestedQuantity: number; deliveredQuantity: number | null; updatedAt: string;
  disputeReason: string | null; disputeResolution: string | null; disputeResolvedAt: string | null;
  donation: { foodName: string; unit: string; donorProfile: { organisationName: string } };
  ngoProfile: { organisationName: string };
}

/** Reported delivery problems (NGO disputes): open ones first, with admin resolution. */
export default function ReportsPage() {
  const [page, setPage] = useState(1);
  const [resolving, setResolving] = useState<Report | null>(null);
  // A verified dispute becomes COMPLETED, so open reports = DISPUTED; resolved ones remain listed via audit/details.
  const { data, error, loading, reload } = useApi<ListResult<Report>>(`/api/requests${toQuery({ status: 'DISPUTED', page })}`);
  const open = data?.items.filter((r) => !r.disputeResolvedAt) ?? [];
  const closed = data?.items.filter((r) => r.disputeResolvedAt) ?? [];

  const row = (r: Report) => (
    <li key={r.id} className="rounded-xl border bg-white p-4" data-testid="report-row">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="text-sm">
          <Link href={`/dashboard/admin/deliveries/${r.id}`} className="font-semibold hover:underline">{r.donation.foodName}</Link>
          <p className="text-muted-foreground">
            {r.donation.donorProfile.organisationName} → {r.ngoProfile.organisationName} · {r.deliveredQuantity ?? r.requestedQuantity} {r.donation.unit.toLowerCase()} reported delivered
          </p>
          <p className="mt-1">Reported problem: <span className="font-medium">{r.disputeReason}</span></p>
          {r.disputeResolvedAt && <p className="mt-1 text-muted-foreground">Closed {formatDateTime(r.disputeResolvedAt)} – no impact recorded. Note: {r.disputeResolution}</p>}
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={r.disputeResolvedAt ? 'CLOSED' : 'DISPUTED'} />
          {!r.disputeResolvedAt && <Button size="sm" onClick={() => setResolving(r)}>Resolve</Button>}
        </div>
      </div>
    </li>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Delivery problems reported by NGOs. Verified deliveries record impact; closed reports do not." />
      {loading && !data ? <LoadingCards count={2} />
        : error ? <ErrorState message={error.message} onRetry={reload} />
          : (
            <>
              <section>
                <h2 className="mb-3 font-semibold">Open ({open.length})</h2>
                {open.length === 0 ? <EmptyState icon={AlertTriangle} title="No open reports" description="NGOs can report a problem when confirming a delivery." />
                  : <ul className="space-y-3">{open.map(row)}</ul>}
              </section>
              {closed.length > 0 && (
                <section>
                  <h2 className="mb-3 font-semibold">Closed without impact ({closed.length})</h2>
                  <ul className="space-y-3">{closed.map(row)}</ul>
                </section>
              )}
              <p className="text-xs text-muted-foreground">
                Reports resolved as verified become completed deliveries – see <Link href="/dashboard/admin/audit?q=DISPUTE" className="underline">the audit log</Link>.
              </p>
            </>
          )}
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      {resolving && (
        <ResolveDisputeDialog
          request={{ ...resolving, unit: resolving.donation.unit, foodName: resolving.donation.foodName }}
          onClose={() => setResolving(null)}
          onResolved={() => { setResolving(null); reload(); }}
        />
      )}
    </div>
  );
}
