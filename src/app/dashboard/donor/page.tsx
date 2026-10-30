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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Donations listed" value={impact.data?.donations?.total ?? '–'} icon={Package} />
        <StatCard label="Open right now" value={impact.data?.donations?.openNow ?? '–'} icon={Leaf} tone="blue" />
        <StatCard label="Deliveries confirmed" value={impact.data?.deliveries?.completed ?? '–'} icon={Truck} tone="amber" />
        <StatCard
          label="Meals served (est.)"
          value={impact.data?.estimates?.mealsServed ?? '–'}
          hint="From NGO-confirmed deliveries"
          icon={UtensilsCrossed}
          tone="rose"
        />
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
