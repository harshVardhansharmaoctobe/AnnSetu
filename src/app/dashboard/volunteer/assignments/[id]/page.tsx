'use client';

import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ArrowLeft, Check, MapPin, PackageCheck, Phone, Truck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ImageUpload } from '@/components/image-upload';
import { MapView } from '@/components/map-view';
import { ProofList, RequestProgress, type Proof } from '@/components/request-progress';
import { ErrorState, LoadingCards, PageHeader, Spinner, StatusBadge } from '@/components/states';
import { useToast } from '@/components/toaster';
import { api, useApi, type ApiClientError } from '@/lib/client';
import { formatDateTime, formatTimeRemaining } from '@/lib/utils';

interface Contact { name: string; email: string; phone: string | null }
interface AssignmentDetail {
  id: string; status: string; isMine: boolean;
  request: {
    id: string; status: string; requestedQuantity: number; deliveredQuantity: number | null; createdAt: string;
    approvedAt: string | null; pickedUpAt: string | null; deliveredAt: string | null; completedAt: string | null;
    donation: {
      foodName: string; unit: string; pickupAddress: string; latitude: number; longitude: number; safePickupDeadline: string;
      storageConditions: string; handlingInstructions: string | null; contactPhone: string | null; photoUrl: string | null;
      donorProfile: { organisationName: string; user: Contact };
    };
    ngoProfile: { organisationName: string; address: string; latitude: number; longitude: number; user: Contact };
    proofs: Proof[];
  };
}

const mapsLink = (lat: number, lng: number) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;

export default function AssignmentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<AssignmentDetail>(`/api/assignments/${id}`);
  const [busy, setBusy] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [pickupPhoto, setPickupPhoto] = useState<string | null>(null);
  const [proofPhoto, setProofPhoto] = useState<string | null>(null);
  const [delivered, setDelivered] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const markers = useMemo(() => data ? [
    { id: 'pickup', lat: data.request.donation.latitude, lng: data.request.donation.longitude, title: 'Pickup', subtitle: data.request.donation.donorProfile.organisationName, tone: 'green' as const },
    { id: 'dropoff', lat: data.request.ngoProfile.latitude, lng: data.request.ngoProfile.longitude, title: 'Drop-off', subtitle: data.request.ngoProfile.organisationName, tone: 'blue' as const },
  ] : [], [data]);

  if (loading && !data) return <LoadingCards count={2} />;
  if (error || !data) return <ErrorState message={error?.message ?? 'Assignment not found'} onRetry={reload} />;
  const a = data;
  const r = a.request;
  const unit = r.donation.unit.toLowerCase();

  async function run(action: string, body: unknown, success: string) {
    setBusy(true);
    setFormError(null);
    try {
      await api(`/api/assignments/${id}/${action}`, { method: 'POST', body });
      toast.success(success);
      reload();
    } catch (e) {
      const err = e as ApiClientError;
      setFormError(err.message);
      toast.error('Action failed', err.message);
      throw e;
    } finally {
      setBusy(false);
    }
  }

  function deliver(e: React.FormEvent) {
    e.preventDefault();
    if (!proofPhoto) return setFormError('Upload a delivery photo as proof first.');
    const qty = Number(delivered || r.requestedQuantity);
    if (!(qty > 0) || qty > r.requestedQuantity) return setFormError(`Delivered quantity must be between 0 and ${r.requestedQuantity}.`);
    run('deliver', { photoUrl: proofPhoto, deliveredQuantity: qty, ...(notes.trim() && { notes: notes.trim() }) }, 'Delivery completed – the NGO will confirm receipt').catch(() => {});
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/volunteer')}><ArrowLeft className="mr-1 h-4 w-4" /> Deliveries</Button>
      <PageHeader title={r.donation.foodName} description={`${r.requestedQuantity} ${unit} · ${r.donation.donorProfile.organisationName} → ${r.ngoProfile.organisationName}`} actions={<StatusBadge status={a.status} />} />
      <Card><CardContent className="p-6"><RequestProgress request={r} /></CardContent></Card>

      {a.isMine && a.status === 'ASSIGNED' && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-6">
            <p className="font-medium">An admin assigned this delivery to you. Can you take it?</p>
            <div className="flex gap-2">
              <Button variant="success" disabled={busy} onClick={() => run('accept', {}, 'Assignment accepted').catch(() => {})}><Check className="mr-2 h-4 w-4" /> Accept</Button>
              <Button variant="outline" disabled={busy} onClick={() => setDeclining(true)}><X className="mr-2 h-4 w-4" /> Decline</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">1. Pick up</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">{r.donation.donorProfile.organisationName}</p>
            <a className="text-green-700 hover:underline" href={mapsLink(r.donation.latitude, r.donation.longitude)} target="_blank" rel="noopener noreferrer">
              <MapPin className="mr-1 inline h-3.5 w-3.5" />{r.donation.pickupAddress}
            </a>
            <p className="text-muted-foreground">By {formatDateTime(r.donation.safePickupDeadline)} ({formatTimeRemaining(r.donation.safePickupDeadline)})</p>
            <p className="text-muted-foreground">Storage: {r.donation.storageConditions}</p>
            {r.donation.handlingInstructions && <p className="text-muted-foreground">Handling: {r.donation.handlingInstructions}</p>}
            {(r.donation.contactPhone ?? r.donation.donorProfile.user.phone) && (
              <a className="inline-flex items-center text-green-700 hover:underline" href={`tel:${r.donation.contactPhone ?? r.donation.donorProfile.user.phone}`}>
                <Phone className="mr-1 h-3.5 w-3.5" />{r.donation.contactPhone ?? r.donation.donorProfile.user.phone}
              </a>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">2. Deliver to</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">{r.ngoProfile.organisationName}</p>
            <a className="text-green-700 hover:underline" href={mapsLink(r.ngoProfile.latitude, r.ngoProfile.longitude)} target="_blank" rel="noopener noreferrer">
              <MapPin className="mr-1 inline h-3.5 w-3.5" />{r.ngoProfile.address}
            </a>
            <p className="text-muted-foreground">Contact: {r.ngoProfile.user.name}</p>
            {r.ngoProfile.user.phone && (
              <a className="inline-flex items-center text-green-700 hover:underline" href={`tel:${r.ngoProfile.user.phone}`}><Phone className="mr-1 h-3.5 w-3.5" />{r.ngoProfile.user.phone}</a>
            )}
          </CardContent>
        </Card>
      </div>
      <MapView
        markers={markers}
        className="h-64"
        label="Pickup and drop-off map"
        legend={[{ tone: 'green', label: 'Pickup (donor)' }, { tone: 'blue', label: 'Drop-off (NGO)' }]}
      />

      {a.isMine && a.status === 'ACCEPTED' && (
        <Card>
          <CardHeader><CardTitle className="text-base">Confirm pickup</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5"><Label>Pickup photo (optional)</Label><ImageUpload value={pickupPhoto} onChange={setPickupPhoto} id="pickup-photo" /></div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} onClick={() => run('pickup', pickupPhoto ? { photoUrl: pickupPhoto } : {}, 'Pickup confirmed').catch(() => {})}>
                {busy ? <Spinner className="mr-2" /> : <Truck className="mr-2 h-4 w-4" />} I have picked up the food
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setDeclining(true)}>Can no longer do this</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {a.isMine && a.status === 'PICKED_UP' && (
        <Card>
          <CardHeader><CardTitle className="text-base">Complete delivery</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={deliver} className="space-y-4" noValidate>
              <div className="space-y-1.5"><Label>Delivery photo (required proof)</Label><ImageUpload value={proofPhoto} onChange={setProofPhoto} required id="delivery-photo" /></div>
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
              <Button type="submit" variant="success" disabled={busy || !proofPhoto}>
                {busy ? <Spinner className="mr-2" /> : <PackageCheck className="mr-2 h-4 w-4" />} Mark as delivered
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
      {formError && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800" role="alert">{formError}</p>}
      {r.proofs.length > 0 && (
        <Card><CardHeader><CardTitle className="text-base">Proof</CardTitle></CardHeader><CardContent><ProofList proofs={r.proofs} /></CardContent></Card>
      )}

      <ConfirmDialog
        open={declining} onOpenChange={setDeclining}
        title="Decline this delivery?" description="It goes back to the pool so another volunteer can take it." confirmLabel="Decline" destructive withReason
        onConfirm={(reason) => run('decline', { reason }, 'Delivery declined')}
      />
    </div>
  );
}
