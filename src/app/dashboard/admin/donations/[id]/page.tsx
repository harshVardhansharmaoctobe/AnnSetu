'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapView } from '@/components/map-view';
import { RequestProgress } from '@/components/request-progress';
import { ErrorState, LoadingCards, PageHeader, StatCard, StatusBadge, humanize } from '@/components/states';
import { useApi } from '@/lib/client';
import { formatDateTime, formatTimeRemaining } from '@/lib/utils';

interface Contact { name: string; email: string; phone: string | null }
interface Detail {
  id: string; foodName: string; description: string | null; foodCategory: string; foodType: string; status: string;
  quantity: number; remainingQuantity: number; unit: string; createdAt: string; preparationTime: string; safePickupDeadline: string;
  storageConditions: string; handlingInstructions: string | null; pickupAddress: string; latitude: number; longitude: number;
  donorProfile: { userId: string; organisationName: string; organisationType: string; user: Contact & { id: string } };
  requests: {
    id: string; status: string; requestedQuantity: number; deliveredQuantity: number | null; createdAt: string;
    approvedAt: string | null; pickedUpAt: string | null; inTransitAt: string | null; deliveredAt: string | null; completedAt: string | null;
    rejectionReason: string | null; disputeReason: string | null;
    ngoProfile: { userId: string; organisationName: string; address: string; latitude: number; longitude: number };
    assignments: { id: string; status: string; volunteerProfile: { user: Contact } | null }[];
  }[];
}

const RESERVED = ['ACCEPTED', 'VOLUNTEER_ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'];

/** Admin view of one donation: quantities, donor, every NGO request and its delivery progress. */
export default function AdminDonationDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, loading, reload } = useApi<Detail>(`/api/donations/${id}`);
  if (loading && !data) return <LoadingCards count={2} />;
  if (error || !data) return <ErrorState message={error?.message ?? 'Donation not found'} onRetry={reload} />;
  const d = data;
  const unit = d.unit.toLowerCase();
  const reserved = d.requests.filter((r) => RESERVED.includes(r.status)).reduce((s, r) => s + r.requestedQuantity, 0);
  const delivered = d.requests.filter((r) => r.status === 'COMPLETED').reduce((s, r) => s + (r.deliveredQuantity ?? r.requestedQuantity), 0);

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/admin/donations')}><ArrowLeft className="mr-1 h-4 w-4" /> Donations</Button>
      <PageHeader
        title={d.foodName}
        description={`${humanize(d.foodCategory)} · ${humanize(d.foodType)} · listed ${formatDateTime(d.createdAt)}`}
        actions={<StatusBadge status={d.status} />}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="donation-quantities">
        <StatCard label="Listed" value={`${d.quantity} ${unit}`} />
        <StatCard label="Reserved" value={`${reserved} ${unit}`} hint="Approved, not yet confirmed" tone="amber" />
        <StatCard label="Delivered (verified)" value={`${delivered} ${unit}`} tone="rose" />
        <StatCard label="Still available" value={`${d.remainingQuantity} ${unit}`} hint={`Pick up by ${formatDateTime(d.safePickupDeadline)} (${formatTimeRemaining(d.safePickupDeadline)})`} tone="blue" />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Donor</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <Link href={`/dashboard/admin/users/${d.donorProfile.user.id}`} className="font-medium hover:underline">{d.donorProfile.organisationName}</Link>
            <p className="text-muted-foreground">{d.donorProfile.user.name} · {d.donorProfile.user.email}{d.donorProfile.user.phone && ` · ${d.donorProfile.user.phone}`}</p>
            <p>{d.pickupAddress}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Food details</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Prepared {formatDateTime(d.preparationTime)} · storage: {d.storageConditions}</p>
            {d.handlingInstructions && <p className="text-muted-foreground">Handling: {d.handlingInstructions}</p>}
            {d.description && <p className="text-muted-foreground">{d.description}</p>}
          </CardContent>
        </Card>
      </div>
      <MapView
        className="h-64"
        label="Donation and requesting NGOs"
        markers={[
          { id: 'pickup', lat: d.latitude, lng: d.longitude, title: `Pickup: ${d.donorProfile.organisationName}`, subtitle: d.pickupAddress, tone: 'green' },
          ...d.requests.map((r) => ({ id: r.id, lat: r.ngoProfile.latitude, lng: r.ngoProfile.longitude, title: r.ngoProfile.organisationName, subtitle: `${r.requestedQuantity} ${unit} · ${humanize(r.status)}`, href: `/dashboard/admin/deliveries/${r.id}`, tone: 'blue' as const })),
        ]}
        legend={[{ tone: 'green', label: 'Pickup (donor)' }, { tone: 'blue', label: 'Requesting NGO' }]}
      />
      <Card>
        <CardHeader><CardTitle className="text-base">Requests ({d.requests.length})</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {d.requests.length === 0 && <p className="text-sm text-muted-foreground">No NGO has requested this donation yet.</p>}
          {d.requests.map((r) => {
            const a = r.assignments.find((x) => x.volunteerProfile && !['REJECTED', 'CANCELLED'].includes(x.status));
            return (
              <div key={r.id} className="space-y-3 rounded-lg border p-4" data-testid="admin-donation-request">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="text-sm">
                    <Link href={`/dashboard/admin/deliveries/${r.id}`} className="font-semibold hover:underline">{r.ngoProfile.organisationName}</Link>
                    <p className="text-muted-foreground">
                      {r.requestedQuantity} {unit} requested{r.deliveredQuantity !== null && ` · ${r.deliveredQuantity} delivered`}
                      {a?.volunteerProfile && ` · volunteer ${a.volunteerProfile.user.name}`}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <RequestProgress request={r} />
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
