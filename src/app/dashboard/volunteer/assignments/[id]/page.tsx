'use client';

import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, ExternalLink, MapPin, PackageCheck, Phone, Truck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ImageUpload } from '@/components/image-upload';
import { MapView } from '@/components/map-view';
import { ProofList, RequestProgress, type Proof } from '@/components/request-progress';
import { ErrorState, LoadingCards, PageHeader, Spinner, StatusBadge, humanize } from '@/components/states';
import { useToast } from '@/components/toaster';
import { api, useApi, type ApiClientError } from '@/lib/client';
import { formatDateTime, formatTimeRemaining } from '@/lib/utils';

interface Contact { name: string; email: string; phone: string | null }
interface AssignmentDetail {
  id: string; status: string; isMine: boolean; isOpen: boolean; acceptedAt: string | null; arrivedAt: string | null;
  pickupTime: string | null; inTransitAt: string | null; deliveryTime: string | null; notes: string | null; rejectionReason: string | null;
  request: {
    id: string; status: string; requestedQuantity: number; deliveredQuantity: number | null; createdAt: string;
    approvedAt: string | null; pickedUpAt: string | null; inTransitAt: string | null; deliveredAt: string | null; completedAt: string | null;
    feedbackRating: number | null; feedbackComment: string | null;
    donation: {
      foodName: string; unit: string; pickupAddress: string; latitude: number; longitude: number; safePickupDeadline: string;
      storageConditions: string; handlingInstructions: string | null; contactPhone: string | null; photoUrl: string | null;
      donorProfile: { organisationName: string; user?: Contact };
    };
    ngoProfile: { organisationName: string; address: string; latitude: number; longitude: number; user?: Contact };
    proofs: Proof[];
  };
}

const directionsLink = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
  `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${a.lat}%2C${a.lng}%3B${b.lat}%2C${b.lng}`;

export default function AssignmentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<AssignmentDetail>(`/api/assignments/${id}`);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<null | 'reject' | 'fail'>(null);
  const [pickupPhoto, setPickupPhoto] = useState<string | null>(null);
  const [proofPhoto, setProofPhoto] = useState<string | null>(null);
  const [delivered, setDelivered] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const geo = useMemo(() => data ? {
    pickup: { lat: data.request.donation.latitude, lng: data.request.donation.longitude },
    dropoff: { lat: data.request.ngoProfile.latitude, lng: data.request.ngoProfile.longitude },
  } : null, [data]);
  const markers = useMemo(() => data && geo ? [
    { id: 'pickup', ...geo.pickup, title: `Pickup: ${data.request.donation.donorProfile.organisationName}`, subtitle: data.request.donation.pickupAddress, tone: 'green' as const },
    { id: 'dropoff', ...geo.dropoff, title: `Drop-off: ${data.request.ngoProfile.organisationName}`, subtitle: data.request.ngoProfile.address, tone: 'blue' as const },
  ] : [], [data, geo]);
  const route = useMemo(() => (geo ? [geo.pickup, geo.dropoff] : undefined), [geo]);

  if (loading && !data) return <LoadingCards count={2} />;
  if (error || !data || !geo) return <ErrorState message={error?.message ?? 'Assignment not found'} onRetry={reload} />;
  const a = data;
  const r = a.request;
  const unit = r.donation.unit.toLowerCase();
  const mine = a.isMine;
  const donorPhone = r.donation.contactPhone ?? r.donation.donorProfile.user?.phone ?? null;

  async function run(action: string, body: unknown, success: string) {
    setBusy(true);
    setFormError(null);
    try {
      await api(`/api/assignments/${id}/${action}`, { method: 'POST', body });
      toast.success(success);
      if (action === 'reject') router.push('/dashboard/volunteer');
      else reload();
    } catch (e) {
      const err = e as ApiClientError;
      setFormError(err.message);
      toast.error('Action failed', err.message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  const act = (action: string, body: unknown, success: string) => () => run(action, body, success).catch(() => {});

  function deliver(e: React.FormEvent) {
    e.preventDefault();
    if (!proofPhoto) return setFormError('Upload a delivery photo as proof first.');
    const qty = Number(delivered || r.requestedQuantity);
    if (!(qty > 0) || qty > r.requestedQuantity) return setFormError(`Delivered quantity must be between 0 and ${r.requestedQuantity}.`);
    run('deliver', { photoUrl: proofPhoto, deliveredQuantity: qty, ...(notes.trim() && { notes: notes.trim() }) }, 'Delivery completed – the NGO will confirm receipt').catch(() => {});
  }

  const statusLabel = a.isOpen ? 'OPEN' : a.status === 'ASSIGNED' && mine ? 'OFFERED_TO_YOU' : a.status;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/volunteer')}><ArrowLeft className="mr-1 h-4 w-4" /> Deliveries</Button>
      <PageHeader
        title={r.donation.foodName}
        description={`${r.requestedQuantity} ${unit} · ${r.donation.donorProfile.organisationName} → ${r.ngoProfile.organisationName}`}
        actions={<StatusBadge status={statusLabel} />}
      />
      <Card><CardContent className="p-6"><RequestProgress request={r} /></CardContent></Card>

      {(a.isOpen || (mine && a.status === 'ASSIGNED')) && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-6">
            <p className="font-medium">
              {a.isOpen ? 'This delivery needs a volunteer. The first volunteer to accept gets it.' : 'An admin asked you to take this delivery. Can you do it?'}
            </p>
            <div className="flex gap-2">
              <Button variant="success" disabled={busy} onClick={act('accept', {}, 'Delivery accepted')}><Check className="mr-2 h-4 w-4" /> Accept</Button>
              {!a.isOpen && <Button variant="outline" disabled={busy} onClick={() => setDialog('reject')}><X className="mr-2 h-4 w-4" /> Reject</Button>}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">1. Pick up</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">{r.donation.donorProfile.organisationName}</p>
            <p><MapPin className="mr-1 inline h-3.5 w-3.5" />{r.donation.pickupAddress}</p>
            <p className="text-muted-foreground">By {formatDateTime(r.donation.safePickupDeadline)} ({formatTimeRemaining(r.donation.safePickupDeadline)})</p>
            <p className="text-muted-foreground">Storage: {r.donation.storageConditions}</p>
            {r.donation.handlingInstructions && <p className="text-muted-foreground">Handling: {r.donation.handlingInstructions}</p>}
            {mine && donorPhone && (
              <a className="inline-flex items-center text-green-700 hover:underline" href={`tel:${donorPhone}`}><Phone className="mr-1 h-3.5 w-3.5" />{donorPhone}</a>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">2. Deliver to</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">{r.ngoProfile.organisationName}</p>
            <p><MapPin className="mr-1 inline h-3.5 w-3.5" />{r.ngoProfile.address}</p>
            {mine && r.ngoProfile.user && <p className="text-muted-foreground">Contact: {r.ngoProfile.user.name}</p>}
            {mine && r.ngoProfile.user?.phone && (
              <a className="inline-flex items-center text-green-700 hover:underline" href={`tel:${r.ngoProfile.user.phone}`}><Phone className="mr-1 h-3.5 w-3.5" />{r.ngoProfile.user.phone}</a>
            )}
            {!mine && <p className="text-xs text-muted-foreground">Contact details are shared once you accept.</p>}
          </CardContent>
        </Card>
      </div>
      <div>
        <MapView
          markers={markers}
          route={route}
          className="h-64"
          label="Pickup and drop-off map"
          legend={[{ tone: 'green', label: 'Pickup (donor)' }, { tone: 'blue', label: 'Drop-off (NGO)' }]}
        />
        <a href={directionsLink(geo.pickup, geo.dropoff)} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center text-sm text-green-700 hover:underline">
          Road directions on OpenStreetMap <ExternalLink className="ml-1 h-3.5 w-3.5" />
        </a>
        <span className="ml-2 text-xs text-muted-foreground">(the dashed line is a straight line, not the road route)</span>
      </div>

      {mine && a.status === 'ACCEPTED' && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-6">
            <p className="text-sm">Heading to the pickup point? Let the donor know when you arrive.</p>
            <div className="flex gap-2">
              <Button variant="outline" disabled={busy} onClick={act('arrive', {}, 'Arrival recorded – the donor has been notified')}>I have arrived at pickup</Button>
              <Button variant="ghost" disabled={busy} onClick={() => setDialog('reject')}>Can no longer do this</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {mine && ['ACCEPTED', 'PICKUP_IN_PROGRESS'].includes(a.status) && (
        <Card>
          <CardHeader><CardTitle className="text-base">Confirm food collection</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5"><Label>Pickup photo (recommended)</Label><ImageUpload value={pickupPhoto} onChange={setPickupPhoto} id="pickup-photo" purpose="PICKUP_PROOF" /></div>
            <Button disabled={busy} onClick={act('pickup', pickupPhoto ? { photoUrl: pickupPhoto } : {}, 'Pickup confirmed')}>
              {busy ? <Spinner className="mr-2" /> : <Truck className="mr-2 h-4 w-4" />} I have collected the food
            </Button>
          </CardContent>
        </Card>
      )}

      {mine && a.status === 'PICKED_UP' && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-6">
            <p className="text-sm">Food collected. Mark the delivery in transit when you set off.</p>
            <Button disabled={busy} onClick={act('transit', {}, 'Marked in transit – the NGO has been notified')}><Truck className="mr-2 h-4 w-4" /> Mark in transit</Button>
          </CardContent>
        </Card>
      )}

      {mine && ['PICKED_UP', 'IN_TRANSIT'].includes(a.status) && (
        <Card>
          <CardHeader><CardTitle className="text-base">Complete delivery</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={deliver} className="space-y-4" noValidate>
              <div className="space-y-1.5"><Label>Delivery photo (required proof)</Label><ImageUpload value={proofPhoto} onChange={setProofPhoto} required id="delivery-photo" purpose="DELIVERY_PROOF" /></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="deliveredQuantity">Quantity delivered ({unit})</Label>
                  <Input id="deliveredQuantity" type="number" min={0.1} max={r.requestedQuantity} step="any" placeholder={String(r.requestedQuantity)} value={delivered} onChange={(e) => setDelivered(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="deliveryNotes">Notes (optional)</Label>
                  <Textarea id="deliveryNotes" rows={1} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="success" disabled={busy || !proofPhoto}>
                  {busy ? <Spinner className="mr-2" /> : <PackageCheck className="mr-2 h-4 w-4" />} Mark as delivered
                </Button>
                <Button type="button" variant="ghost" disabled={busy} onClick={() => setDialog('fail')}><AlertTriangle className="mr-2 h-4 w-4" /> Delivery failed</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {['DELIVERED', 'COMPLETED'].includes(a.status) && (
        <p className="rounded-lg bg-green-50 p-4 text-sm text-green-900">
          {a.status === 'COMPLETED'
            ? `${r.ngoProfile.organisationName} confirmed receipt.${r.feedbackRating ? ` Rating: ${r.feedbackRating}/5.` : ''}${r.feedbackComment ? ` “${r.feedbackComment}”` : ''} Thank you!`
            : 'Delivered – waiting for the NGO to confirm receipt.'}
        </p>
      )}
      {['REJECTED', 'CANCELLED'].includes(a.status) && (
        <p className="rounded-lg bg-muted p-4 text-sm">This assignment is {humanize(a.status).toLowerCase()}{a.rejectionReason || a.notes ? `: ${a.rejectionReason ?? a.notes}` : '.'}</p>
      )}
      {formError && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800" role="alert">{formError}</p>}
      {r.proofs.length > 0 && (
        <Card><CardHeader><CardTitle className="text-base">Proof</CardTitle></CardHeader><CardContent><ProofList proofs={r.proofs} /></CardContent></Card>
      )}

      <ConfirmDialog
        open={dialog === 'reject'} onOpenChange={(o) => !o && setDialog(null)}
        title="Reject this delivery?" description="It goes back to the pool so another volunteer can take it." confirmLabel="Reject" destructive withReason
        onConfirm={(reason) => run('reject', { reason }, 'Delivery rejected')}
      />
      <ConfirmDialog
        open={dialog === 'fail'} onOpenChange={(o) => !o && setDialog(null)}
        title="Report a failed delivery?" description="The request is closed and the donor, NGO and admins are notified. Collected food is not offered again."
        confirmLabel="Report failure" destructive withReason reasonRequired reasonLabel="What happened? (at least 5 characters)"
        onConfirm={(reason) => run('fail', { reason }, 'Failure reported')}
      />
    </div>
  );
}
