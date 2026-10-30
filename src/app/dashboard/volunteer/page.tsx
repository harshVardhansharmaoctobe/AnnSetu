'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { ArrowRight, Award, Clock, MapPin, Navigation, Route, Truck, UtensilsCrossed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState, ErrorState, LoadingCards, PageHeader, Spinner, StatCard, StatusBadge } from '@/components/states';
import { useToast } from '@/components/toaster';
import type { ImpactData } from '@/components/impact-panel';
import { api, useApi, type ApiClientError, type ListResult } from '@/lib/client';
import { formatDateTime, formatTimeRemaining } from '@/lib/utils';

interface Delivery {
  requestedQuantity: number;
  donation: { foodName: string; unit: string; pickupAddress: string; safePickupDeadline: string; donorProfile: { organisationName: string } };
  ngoProfile: { organisationName: string; address: string };
}
interface Assignment {
  id: string; status: string; updatedAt: string; request: Delivery;
  pickupDistanceKm: number | null; tripDistanceKm: number;
}

function DeliverySummary({ d }: { d: Delivery }) {
  return (
    <div className="space-y-1 text-sm">
      <p className="font-semibold">{d.donation.foodName} · {d.requestedQuantity} {d.donation.unit.toLowerCase()}</p>
      <p className="text-muted-foreground"><MapPin className="mr-1 inline h-3.5 w-3.5" />From {d.donation.donorProfile.organisationName}, {d.donation.pickupAddress}</p>
      <p className="text-muted-foreground"><Navigation className="mr-1 inline h-3.5 w-3.5" />To {d.ngoProfile.organisationName}, {d.ngoProfile.address}</p>
      <p className="text-muted-foreground"><Clock className="mr-1 inline h-3.5 w-3.5" />Pick up by {formatDateTime(d.donation.safePickupDeadline)} ({formatTimeRemaining(d.donation.safePickupDeadline)})</p>
    </div>
  );
}

function VolunteerDashboard() {
  const toast = useToast();
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') ?? 'available');
  useEffect(() => setTab(params.get('tab') ?? 'available'), [params]);
  const open = useApi<ListResult<Assignment>>('/api/assignments?scope=open&pageSize=30');
  const active = useApi<ListResult<Assignment>>('/api/assignments?scope=mine&group=active&pageSize=50');
  const history = useApi<ListResult<Assignment>>('/api/assignments?scope=mine&group=history&pageSize=50');
  const impact = useApi<ImpactData & { profileIncomplete?: boolean }>('/api/impact?scope=me');
  const [accepting, setAccepting] = useState<string | null>(null);

  // Without an explicit ?tab=, open on "My assignments" when the volunteer has work in progress
  // (including deliveries an admin offered them), otherwise on the open pool.
  const hasActive = (active.data?.total ?? 0) > 0;
  useEffect(() => {
    if (!params.get('tab') && hasActive) setTab('mine');
  }, [hasActive, params]);

  const delivered = history.data?.items.filter((a) => ['DELIVERED', 'COMPLETED'].includes(a.status)) ?? [];
  const km = delivered.reduce((sum, a) => sum + a.tripDistanceKm, 0);
  const offers = active.data?.items.filter((a) => a.status === 'ASSIGNED').length ?? 0;

  async function accept(id: string) {
    setAccepting(id);
    try {
      await api(`/api/assignments/${id}/accept`, { body: {} });
      toast.success('Delivery accepted', 'It is now in My assignments.');
      setTab('mine');
    } catch (e) {
      toast.error('Could not accept', (e as ApiClientError).message);
    } finally {
      setAccepting(null);
      open.reload();
      active.reload();
    }
  }

  const list = (state: typeof active, emptyTitle: string, emptyHint?: string) =>
    state.loading && !state.data ? <LoadingCards count={2} />
      : state.error ? <ErrorState message={state.error.message} onRetry={state.reload} />
        : state.data!.items.length === 0 ? <EmptyState icon={Truck} title={emptyTitle} description={emptyHint} />
          : (
            <div className="grid gap-4 md:grid-cols-2">
              {state.data!.items.map((a) => (
                <Link key={a.id} href={`/dashboard/volunteer/assignments/${a.id}`} className="rounded-xl border bg-white p-5 transition hover:shadow-md" data-testid="assignment-card">
                  <div className="mb-2 flex items-center justify-between">
                    <StatusBadge status={a.status === 'ASSIGNED' ? 'OFFERED_TO_YOU' : a.status} />
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <DeliverySummary d={a.request} />
                </Link>
              ))}
            </div>
          );

  return (
    <div className="space-y-6">
      <PageHeader title="Volunteer deliveries" description="Accept a delivery, collect the food and hand it over with photo proof." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open deliveries" value={open.data?.total ?? '–'} hint="Waiting for a volunteer" icon={MapPin} tone="blue" />
        <StatCard label="My active deliveries" value={active.data?.total ?? '–'} hint={offers ? `${offers} offered to you – please answer` : undefined} icon={Truck} tone="amber" />
        <StatCard label="Deliveries completed" value={history.data ? delivered.length : '–'} icon={Award} />
        <StatCard label="Meals delivered (verified)" value={impact.data?.deliveries ? impact.data.deliveries.quantityVerified.MEALS : '–'} hint="Confirmed by NGOs" icon={UtensilsCrossed} tone="rose" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="available">Available ({open.data?.total ?? 0})</TabsTrigger>
          <TabsTrigger value="mine">My assignments ({active.data?.total ?? 0})</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="contribution">Contribution</TabsTrigger>
        </TabsList>
        <TabsContent value="available" className="mt-4">
          {open.loading && !open.data ? <LoadingCards count={2} />
            : open.error ? <ErrorState message={open.error.message} onRetry={open.reload} />
              : open.data!.items.length === 0 ? <EmptyState icon={Truck} title="No deliveries waiting" description="When a donor approves an NGO request, the delivery appears here." />
                : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {open.data!.items.map((job) => (
                      <div key={job.id} className="flex flex-col rounded-xl border bg-white p-5" data-testid="open-job">
                        <DeliverySummary d={job.request} />
                        <p className="mt-2 text-xs text-muted-foreground">
                          {job.pickupDistanceKm !== null ? `${job.pickupDistanceKm} km to pickup · ` : 'Add your service area in your profile to see distances · '}
                          {job.tripDistanceKm} km pickup → drop-off (straight line)
                        </p>
                        <div className="mt-4 flex gap-2">
                          <Button className="flex-1" onClick={() => accept(job.id)} disabled={accepting !== null}>
                            {accepting === job.id && <Spinner className="mr-2" />} Accept delivery
                          </Button>
                          <Button asChild variant="outline"><Link href={`/dashboard/volunteer/assignments/${job.id}`}>Details</Link></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
        </TabsContent>
        <TabsContent value="mine" className="mt-4">{list(active, 'No active deliveries', 'Accept one from the Available tab.')}</TabsContent>
        <TabsContent value="completed" className="mt-4">{list(history, 'No past deliveries yet')}</TabsContent>
        <TabsContent value="contribution" className="mt-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Deliveries handed over" value={delivered.length} icon={Truck} />
            <StatCard label="Verified deliveries" value={impact.data?.estimates?.confirmedDeliveries ?? '–'} hint="Confirmed by the receiving NGO" icon={Award} tone="amber" />
            <StatCard label="Distance covered (approx.)" value={`${Math.round(km * 10) / 10} km`} hint="Straight-line pickup → drop-off; real routes are longer" icon={Route} tone="blue" />
          </div>
          <p className="mt-4 rounded-lg bg-green-50 p-4 text-sm text-green-900">
            Volunteering on FoodBridge is unpaid: there are no earnings or fees. Your contribution is measured in food delivered to people who need it
            {impact.data?.estimates ? ` – about ${impact.data.estimates.mealsServed} meals so far (estimate from verified deliveries).` : '.'}
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<LoadingCards count={2} />}><VolunteerDashboard /></Suspense>;
}
