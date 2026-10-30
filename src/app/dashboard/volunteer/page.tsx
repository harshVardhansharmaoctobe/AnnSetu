'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, Clock, MapPin, Navigation, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState, ErrorState, LoadingCards, PageHeader, Spinner, StatCard, StatusBadge } from '@/components/states';
import { useToast } from '@/components/toaster';
import type { ImpactData } from '@/components/impact-panel';
import { api, useApi, type ApiClientError, type ListResult } from '@/lib/client';
import { formatDateTime, formatTimeRemaining } from '@/lib/utils';

interface Delivery {
  donation: { foodName: string; unit: string; pickupAddress: string; safePickupDeadline: string; donorProfile: { organisationName: string } };
  ngoProfile: { organisationName: string; address: string };
}
interface Assignment { id: string; status: string; updatedAt: string; request: Delivery & { requestedQuantity: number } }
interface OpenJob extends Delivery { id: string; requestedQuantity: number; pickupDistanceKm: number | null; tripDistanceKm: number }

const ACTIVE = ['ASSIGNED', 'ACCEPTED', 'PICKED_UP'];

function DeliverySummary({ d, qty }: { d: Delivery; qty: number }) {
  return (
    <div className="space-y-1 text-sm">
      <p className="font-semibold">{d.donation.foodName} · {qty} {d.donation.unit.toLowerCase()}</p>
      <p className="text-muted-foreground"><MapPin className="mr-1 inline h-3.5 w-3.5" />From {d.donation.donorProfile.organisationName}, {d.donation.pickupAddress}</p>
      <p className="text-muted-foreground"><Navigation className="mr-1 inline h-3.5 w-3.5" />To {d.ngoProfile.organisationName}, {d.ngoProfile.address}</p>
      <p className="text-muted-foreground"><Clock className="mr-1 inline h-3.5 w-3.5" />Pick up by {formatDateTime(d.donation.safePickupDeadline)} ({formatTimeRemaining(d.donation.safePickupDeadline)})</p>
    </div>
  );
}

export default function VolunteerDashboard() {
  const toast = useToast();
  const mine = useApi<ListResult<Assignment>>('/api/assignments?scope=mine&pageSize=50');
  const open = useApi<ListResult<OpenJob>>('/api/assignments?scope=open&pageSize=20');
  const impact = useApi<ImpactData & { profileIncomplete?: boolean }>('/api/impact?scope=me');
  const [claiming, setClaiming] = useState<string | null>(null);

  const active = mine.data?.items.filter((a) => ACTIVE.includes(a.status)) ?? [];
  const history = mine.data?.items.filter((a) => !ACTIVE.includes(a.status)) ?? [];

  async function claim(requestId: string) {
    setClaiming(requestId);
    try {
      await api('/api/assignments', { body: { requestId } });
      toast.success('Delivery claimed', 'It is now in your active deliveries.');
    } catch (e) {
      toast.error('Could not claim', (e as ApiClientError).message);
    } finally {
      setClaiming(null);
      mine.reload();
      open.reload();
    }
  }

  const list = (items: Assignment[], emptyTitle: string) =>
    mine.loading && !mine.data ? <LoadingCards count={2} />
      : mine.error ? <ErrorState message={mine.error.message} onRetry={mine.reload} />
        : items.length === 0 ? <EmptyState icon={Truck} title={emptyTitle} />
          : (
            <div className="grid gap-4 md:grid-cols-2">
              {items.map((a) => (
                <Link key={a.id} href={`/dashboard/volunteer/assignments/${a.id}`} className="rounded-xl border bg-white p-5 transition hover:shadow-md" data-testid="assignment-card">
                  <div className="mb-2 flex items-center justify-between"><StatusBadge status={a.status} /><ArrowRight className="h-4 w-4 text-muted-foreground" /></div>
                  <DeliverySummary d={a.request} qty={a.request.requestedQuantity} />
                </Link>
              ))}
            </div>
          );

  return (
    <div className="space-y-6">
      <PageHeader title="Volunteer deliveries" description="Accept deliveries, collect food and drop it off with proof." />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Active deliveries" value={mine.data ? active.length : '–'} icon={Truck} tone="amber" />
        <StatCard label="Open deliveries nearby" value={open.data?.total ?? '–'} icon={MapPin} tone="blue" />
        <StatCard label="Deliveries completed" value={mine.data ? history.filter((a) => a.status === 'DELIVERED').length : '–'} hint={impact.data?.estimates ? `≈ ${impact.data.estimates.mealsServed} meals confirmed` : undefined} icon={Navigation} />
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
          <TabsTrigger value="open">Available ({open.data?.total ?? 0})</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="active" className="mt-4">{list(active, 'No active deliveries')}</TabsContent>
        <TabsContent value="open" className="mt-4">
          {open.loading && !open.data ? <LoadingCards count={2} />
            : open.error ? <ErrorState message={open.error.message} onRetry={open.reload} />
              : open.data!.items.length === 0 ? <EmptyState icon={Truck} title="No deliveries waiting" description="Approved requests that need a volunteer appear here." />
                : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {open.data!.items.map((job) => (
                      <div key={job.id} className="flex flex-col rounded-xl border bg-white p-5" data-testid="open-job">
                        <DeliverySummary d={job} qty={job.requestedQuantity} />
                        <p className="mt-2 text-xs text-muted-foreground">
                          {job.pickupDistanceKm !== null ? `${job.pickupDistanceKm} km to pickup · ` : ''}{job.tripDistanceKm} km pickup → drop-off
                        </p>
                        <Button className="mt-4" onClick={() => claim(job.id)} disabled={claiming !== null}>
                          {claiming === job.id && <Spinner className="mr-2" />} Claim delivery
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
        </TabsContent>
        <TabsContent value="history" className="mt-4">{list(history, 'No past deliveries yet')}</TabsContent>
      </Tabs>
    </div>
  );
}
