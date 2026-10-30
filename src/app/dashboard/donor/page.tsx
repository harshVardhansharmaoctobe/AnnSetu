'use client';

import Link from 'next/link';
import { Inbox, Leaf, Package, PlusCircle, Truck, UtensilsCrossed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DonorRequestCard, type DonorRequest } from '@/components/donor-request-card';
import { EmptyState, ErrorState, LoadingCards, PageHeader, StatCard, StatusBadge } from '@/components/states';
import { useApi, type ListResult } from '@/lib/client';
import { formatTimeRemaining } from '@/lib/utils';
import type { ImpactData } from '@/components/impact-panel';

interface DonationRow {
  id: string; foodName: string; status: string; quantity: number; remainingQuantity: number; unit: string;
  safePickupDeadline: string; requestCounts: Record<string, number>;
}

const qty = (u?: { MEALS: number; KG: number }) => u ? [u.MEALS ? `${u.MEALS} meals` : null, u.KG ? `${u.KG} kg` : null].filter(Boolean).join(' + ') || '0' : '–';

export default function DonorOverview() {
  const impact = useApi<ImpactData & { profileIncomplete?: boolean }>('/api/impact?scope=me');
  const pending = useApi<ListResult<DonorRequest>>('/api/requests?status=PENDING&pageSize=10');
  const donations = useApi<ListResult<DonationRow>>('/api/donations?scope=mine&pageSize=5');

  const refresh = () => {
    pending.reload();
    donations.reload();
    impact.reload();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Donor dashboard"
        description="List surplus food, approve NGO requests and follow every delivery."
        actions={<Button asChild><Link href="/dashboard/donor/donations/new"><PlusCircle className="mr-2 h-4 w-4" /> New donation</Link></Button>}
      />

      {impact.data?.profileIncomplete && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Complete your <Link href="/dashboard/profile" className="font-semibold underline">donor profile</Link> before listing food.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total food donations" value={impact.data?.donations?.total ?? '–'} hint={qty(impact.data?.donations?.quantityListed)} icon={Package} />
        <StatCard label="Available food" value={qty(impact.data?.donations?.quantityAvailable)} hint={`${impact.data?.donations?.openNow ?? 0} open listing(s)`} icon={Leaf} tone="blue" />
        <StatCard label="Reserved food" value={qty(impact.data?.donations?.quantityReserved)} hint="Approved for NGOs, not yet confirmed" icon={Inbox} tone="amber" />
        <StatCard label="Delivered (verified)" value={qty(impact.data?.deliveries?.quantityVerified)} hint={`${impact.data?.deliveries?.completed ?? 0} confirmed deliveries`} icon={Truck} />
        <StatCard label="Pending requests" value={impact.data?.requests?.pending ?? '–'} hint="Awaiting your decision" icon={Inbox} tone="rose" />
        <StatCard label="Completed donations" value={impact.data?.donations?.completed ?? '–'} hint={impact.data?.estimates ? `≈ ${impact.data.estimates.mealsServed} meals served (est.)` : undefined} icon={UtensilsCrossed} tone="slate" />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg">Requests awaiting your decision</CardTitle>
          <Link href="/dashboard/donor/requests" className="text-sm text-green-700 hover:underline">All requests</Link>
        </CardHeader>
        <CardContent className="space-y-3">
          {pending.loading && !pending.data ? <LoadingCards count={2} />
            : pending.error ? <ErrorState message={pending.error.message} onRetry={pending.reload} />
              : pending.data!.items.length === 0 ? (
                <EmptyState icon={Inbox} title="No pending requests" description="When an NGO requests your food, it appears here." />
              ) : pending.data!.items.map((r) => <DonorRequestCard key={r.id} request={r} onChanged={refresh} />)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg">Recent donations</CardTitle>
          <Link href="/dashboard/donor/donations" className="text-sm text-green-700 hover:underline">View all</Link>
        </CardHeader>
        <CardContent>
          {donations.loading && !donations.data ? <LoadingCards count={2} />
            : donations.error ? <ErrorState message={donations.error.message} onRetry={donations.reload} />
              : donations.data!.items.length === 0 ? (
                <EmptyState title="No donations yet" description="List your first surplus food in under a minute." action={{ label: 'Create donation', href: '/dashboard/donor/donations/new' }} />
              ) : (
                <ul className="divide-y">
                  {donations.data!.items.map((d) => (
                    <li key={d.id}>
                      <Link href={`/dashboard/donor/donations/${d.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-muted/40">
                        <div>
                          <p className="font-medium">{d.foodName}</p>
                          <p className="text-xs text-muted-foreground">
                            {d.remainingQuantity}/{d.quantity} {d.unit.toLowerCase()} open · {formatTimeRemaining(d.safePickupDeadline)}
                            {d.requestCounts.PENDING ? ` · ${d.requestCounts.PENDING} pending request(s)` : ''}
                          </p>
                        </div>
                        <StatusBadge status={d.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
        </CardContent>
      </Card>
    </div>
  );
}
