'use client';

import Link from 'next/link';
import { CheckCircle2, ClipboardList, Search, Truck, UtensilsCrossed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NgoRequestList, type NgoRequestRow } from '@/components/ngo-request-list';
import { PageHeader, StatCard } from '@/components/states';
import type { ImpactData } from '@/components/impact-panel';
import { useApi, type ListResult } from '@/lib/client';

export default function NgoOverview() {
  const impact = useApi<ImpactData & { profileIncomplete?: boolean }>('/api/impact?scope=me');
  const toConfirm = useApi<ListResult<NgoRequestRow>>('/api/requests?status=DELIVERED&pageSize=10');
  const recent = useApi<ListResult<NgoRequestRow>>('/api/requests?pageSize=6');

  return (
    <div className="space-y-6">
      <PageHeader
        title="NGO dashboard"
        description="Find surplus food near you, request it and confirm deliveries."
        actions={<Button asChild><Link href="/dashboard/ngo/browse"><Search className="mr-2 h-4 w-4" /> Find food</Link></Button>}
      />
      {impact.data?.profileIncomplete && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Complete your <Link href="/dashboard/profile" className="font-semibold underline">NGO profile</Link> (address and capacity) before requesting food.
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Awaiting your confirmation" value={toConfirm.data?.total ?? '–'} icon={CheckCircle2} tone="amber" />
        <StatCard label="Deliveries received" value={impact.data?.deliveries?.completed ?? '–'} icon={Truck} />
        <StatCard label="Meals received (est.)" value={impact.data?.estimates?.mealsServed ?? '–'} hint="From confirmed deliveries" icon={UtensilsCrossed} tone="rose" />
        <StatCard label="Total requests" value={recent.data?.total ?? '–'} icon={ClipboardList} tone="blue" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Delivered – please confirm receipt</CardTitle></CardHeader>
        <CardContent>
          <NgoRequestList state={toConfirm} empty={{ title: 'Nothing to confirm', description: 'Deliveries awaiting your confirmation appear here.' }} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg">Recent requests</CardTitle>
          <Link href="/dashboard/ngo/requests" className="text-sm text-green-700 hover:underline">All requests</Link>
        </CardHeader>
        <CardContent>
          <NgoRequestList state={recent} empty={{ title: 'No requests yet', action: { label: 'Find food', href: '/dashboard/ngo/browse' } }} />
        </CardContent>
      </Card>
    </div>
  );
}
