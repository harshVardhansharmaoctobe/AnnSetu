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
  const approved = useApi<ListResult<NgoRequestRow>>('/api/requests?statuses=ACCEPTED,VOLUNTEER_ASSIGNED&pageSize=1');
  const active = useApi<ListResult<NgoRequestRow>>('/api/requests?statuses=PICKED_UP,IN_TRANSIT,DELIVERED&pageSize=1');
  const received = (u?: { MEALS: number; KG: number }) =>
    u ? [u.MEALS ? `${u.MEALS} meals` : null, u.KG ? `${u.KG} kg` : null].filter(Boolean).join(' + ') || '0' : '–';

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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Food received (verified)" value={received(impact.data?.deliveries?.quantityVerified)} hint={impact.data?.estimates ? `≈ ${impact.data.estimates.mealsServed} meals (est.)` : undefined} icon={UtensilsCrossed} tone="rose" />
        <StatCard label="Pending requests" value={impact.data?.requests?.pending ?? '–'} hint="Awaiting donor decision" icon={ClipboardList} tone="slate" />
        <StatCard label="Approved requests" value={approved.data?.total ?? '–'} hint="Waiting for pickup" icon={CheckCircle2} tone="blue" />
        <StatCard label="Active deliveries" value={active.data?.total ?? '–'} hint={toConfirm.data?.total ? `${toConfirm.data.total} awaiting your confirmation` : 'Picked up or on the way'} icon={Truck} tone="amber" />
        <StatCard label="Completed deliveries" value={impact.data?.deliveries?.completed ?? '–'} hint="Confirmed by you" icon={CheckCircle2} />
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
