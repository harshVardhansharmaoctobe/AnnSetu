'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Ban, Clock, EyeOff, MapPin, Pencil, Phone, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DonationForm, type DonationFormValues } from '@/components/donation-form';
import { DonorRequestCard } from '@/components/donor-request-card';
import { MapView } from '@/components/map-view';
import { ProofList, RequestProgress, type Proof } from '@/components/request-progress';
import { EmptyState, ErrorState, LoadingCards, PageHeader, StatusBadge, humanize } from '@/components/states';
import { useToast } from '@/components/toaster';
import { api, useApi, type ApiClientError } from '@/lib/client';
import { formatDateTime, formatTimeRemaining } from '@/lib/utils';

interface Contact { name: string; email: string; phone: string | null }
interface DonationDetail {
  id: string; foodName: string; description: string | null; foodCategory: string; foodType: string;
  quantity: number; remainingQuantity: number; unit: string; preparationTime: string; safePickupDeadline: string;
  storageConditions: string; handlingInstructions: string | null; contactPhone: string | null; photoUrl: string | null;
  pickupAddress: string; latitude: number; longitude: number; status: string; createdAt: string;
  requests: {
    id: string; status: string; requestedQuantity: number; deliveredQuantity: number | null; beneficiaryCount: number | null;
    notes: string | null; createdAt: string; approvedAt: string | null; pickedUpAt: string | null; deliveredAt: string | null;
    completedAt: string | null; rejectionReason: string | null; disputeReason: string | null;
    ngoProfile: { organisationName: string; address: string; latitude: number; longitude: number; user: Contact };
    assignments: { id: string; status: string; volunteerProfile: { vehicleType: string | null; user: Contact } | null }[];
    proofs: Proof[];
  }[];
}

export default function DonorDonationDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<DonationDetail>(`/api/donations/${id}`);
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [closing, setClosing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (loading && !data) return <LoadingCards count={2} />;
  if (error || !data) return <ErrorState message={error?.message ?? 'Donation not found'} onRetry={reload} />;

  const d = data;
  const unit = d.unit.toLowerCase();
  const activeRequests = d.requests.filter((r) => !['REJECTED', 'CANCELLED'].includes(r.status));
  const canEdit = d.status === 'AVAILABLE' && activeRequests.length === 0;
  const inTransit = d.requests.some((r) => ['VOLUNTEER_ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'].includes(r.status));
  const canClose = ['AVAILABLE', 'PARTIALLY_RESERVED'].includes(d.status);
  const canDelete = d.requests.length === 0;
  const canCancel = !['COMPLETED', 'CANCELLED'].includes(d.status) && !inTransit;

  async function save(values: DonationFormValues) {
    await api(`/api/donations/${id}`, { method: 'PATCH', body: values });
    toast.success('Donation updated');
    setEditing(false);
    reload();
  }

  async function closeListing() {
    try {
      await api(`/api/donations/${id}/close`, { method: 'POST', body: {} });
      toast.success('Marked unavailable', 'Approved requests will still be delivered.');
      reload();
    } catch (e) {
      toast.error('Could not update', (e as ApiClientError).message);
      throw e;
    }
  }

  async function remove() {
    try {
      await api(`/api/donations/${id}`, { method: 'DELETE' });
      toast.success('Donation deleted');
      router.push('/dashboard/donor/donations');
    } catch (e) {
      toast.error('Could not delete', (e as ApiClientError).message);
      throw e;
    }
  }

  async function cancel() {
    try {
      await api(`/api/donations/${id}/cancel`, { method: 'POST', body: {} });
      toast.success('Donation cancelled');
      reload();
    } catch (e) {
      toast.error('Could not cancel', (e as ApiClientError).message);
      throw e;
    }
  }

  if (editing) {
    return (
      <div>
        <PageHeader title="Edit donation" />
        <DonationForm mode="edit" initial={{ ...d, description: d.description ?? undefined, handlingInstructions: d.handlingInstructions ?? undefined, contactPhone: d.contactPhone ?? undefined }} onSubmit={save} onCancel={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/donor/donations')}>
        <ArrowLeft className="mr-1 h-4 w-4" /> My donations
      </Button>
      <PageHeader
        title={d.foodName}
        description={`${humanize(d.foodCategory)} · ${humanize(d.foodType)} · listed ${formatDateTime(d.createdAt)}`}
        actions={
          <>
            <StatusBadge status={d.status} className="self-center" />
            {canEdit && <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="mr-2 h-4 w-4" /> Edit</Button>}
            {canClose && <Button variant="outline" onClick={() => setClosing(true)}><EyeOff className="mr-2 h-4 w-4" /> Mark unavailable</Button>}
            {canCancel && !canDelete && <Button variant="outline" onClick={() => setCancelling(true)}><Ban className="mr-2 h-4 w-4" /> Cancel donation</Button>}
            {canDelete && <Button variant="outline" onClick={() => setDeleting(true)}><Trash2 className="mr-2 h-4 w-4" /> Delete</Button>}
          </>
        }
      />

      <Card>
        <CardContent className="grid gap-6 p-6 md:grid-cols-[1fr_16rem]">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="text-muted-foreground">Quantity</dt><dd className="font-medium">{d.quantity} {unit} ({d.remainingQuantity} unreserved)</dd></div>
            <div><dt className="text-muted-foreground">Pickup deadline</dt><dd className="font-medium"><Clock className="mr-1 inline h-3.5 w-3.5" />{formatDateTime(d.safePickupDeadline)} · {formatTimeRemaining(d.safePickupDeadline)}</dd></div>
            <div><dt className="text-muted-foreground">Prepared</dt><dd>{formatDateTime(d.preparationTime)}</dd></div>
            <div><dt className="text-muted-foreground">Storage</dt><dd>{d.storageConditions}</dd></div>
            <div className="sm:col-span-2"><dt className="text-muted-foreground">Pickup address</dt><dd data-testid="pickup-address"><MapPin className="mr-1 inline h-3.5 w-3.5" />{d.pickupAddress}</dd></div>
            {d.handlingInstructions && <div className="sm:col-span-2"><dt className="text-muted-foreground">Handling</dt><dd>{d.handlingInstructions}</dd></div>}
            {d.description && <div className="sm:col-span-2"><dt className="text-muted-foreground">Description</dt><dd>{d.description}</dd></div>}
          </dl>
          {d.photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={d.photoUrl} alt={d.foodName} className="h-48 w-full rounded-lg object-cover" />
          )}
        </CardContent>
      </Card>

      <MapView
        className="h-64"
        label="Pickup and requesting NGOs"
        markers={[
          { id: 'pickup', lat: d.latitude, lng: d.longitude, title: 'Pickup point', subtitle: d.pickupAddress, tone: 'green' },
          ...d.requests
            .filter((r) => !['REJECTED', 'CANCELLED'].includes(r.status))
            .map((r) => ({
              id: r.id, lat: r.ngoProfile.latitude, lng: r.ngoProfile.longitude, title: r.ngoProfile.organisationName,
              subtitle: `${r.requestedQuantity} ${unit} · ${humanize(r.status)}`, tone: 'blue' as const,
            })),
        ]}
        legend={[{ tone: 'green', label: 'Pickup point' }, { tone: 'blue', label: 'Requesting NGO' }]}
      />

      <Card>
        <CardHeader><CardTitle className="text-lg">NGO requests ({d.requests.length})</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {d.requests.length === 0 && <EmptyState title="No requests yet" description="NGOs nearby can see this donation and request it." />}
          {d.requests.map((r) => {
            if (r.status === 'PENDING') {
              return (
                <DonorRequestCard
                  key={r.id}
                  showDonation={false}
                  onChanged={reload}
                  request={{ ...r, donation: { id: d.id, foodName: d.foodName, unit: d.unit } }}
                />
              );
            }
            const volunteer = r.assignments.find((a) => a.volunteerProfile && !['REJECTED', 'CANCELLED'].includes(a.status));
            return (
              <div key={r.id} className="space-y-4 rounded-lg border p-4" data-testid="donor-request-tracking">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{r.ngoProfile.organisationName}</p>
                    <p className="text-sm text-muted-foreground">
                      {r.requestedQuantity} {unit}{r.deliveredQuantity !== null && ` · ${r.deliveredQuantity} delivered`} · {r.ngoProfile.address}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <RequestProgress request={r} />
                {volunteer && (
                  <p className="text-sm">
                    Volunteer: <span className="font-medium">{volunteer.volunteerProfile!.user.name}</span>
                    {volunteer.volunteerProfile!.user.phone && (
                      <a href={`tel:${volunteer.volunteerProfile!.user.phone}`} className="ml-2 inline-flex items-center text-green-700 hover:underline">
                        <Phone className="mr-1 h-3.5 w-3.5" />{volunteer.volunteerProfile!.user.phone}
                      </a>
                    )}
                    <span className="ml-2 text-muted-foreground">({humanize(volunteer.status)})</span>
                  </p>
                )}
                {r.status === 'ACCEPTED' && <p className="text-sm text-muted-foreground">Waiting for a volunteer to be assigned.</p>}
                <ProofList proofs={r.proofs} />
              </div>
            );
          })}
        </CardContent>
      </Card>
      <p className="text-sm text-muted-foreground">
        Need help? <Link href="/#help" className="text-green-700 hover:underline">Contact the FoodBridge team</Link>.
      </p>

      <ConfirmDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title="Cancel this donation?"
        description="Pending and approved NGO requests will be closed and the NGOs notified. This cannot be undone."
        confirmLabel="Cancel donation"
        destructive
        onConfirm={cancel}
      />
      <ConfirmDialog
        open={closing}
        onOpenChange={setClosing}
        title="Mark the remaining food unavailable?"
        description="Pending requests are declined and no new requests are accepted. Requests you already approved are still delivered."
        confirmLabel="Mark unavailable"
        onConfirm={closeListing}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this donation?"
        description="No NGO has requested it yet, so it can be removed completely. This cannot be undone."
        confirmLabel="Delete donation"
        destructive
        onConfirm={remove}
      />
    </div>
  );
}
