'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Clock, MapPin, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ErrorState, LoadingCards, PageHeader, Spinner, StatusBadge, humanize } from '@/components/states';
import { MapView } from '@/components/map-view';
import { useToast } from '@/components/toaster';
import { api, useApi, type ApiClientError } from '@/lib/client';
import { formatDateTime, formatTimeRemaining } from '@/lib/utils';

interface Detail {
  id: string; foodName: string; description: string | null; foodCategory: string; foodType: string;
  quantity: number; remainingQuantity: number; unit: string; preparationTime: string; safePickupDeadline: string;
  storageConditions: string; handlingInstructions: string | null; photoUrl: string | null; pickupAddress: string;
  latitude: number; longitude: number;
  status: string; donorProfile: { organisationName: string; organisationType: string };
  myRequest: { id: string; status: string; requestedQuantity: number } | null;
}

export default function NgoDonationDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<Detail>(`/api/donations/${id}`);
  const [quantity, setQuantity] = useState('');
  const [beneficiaries, setBeneficiaries] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (loading && !data) return <LoadingCards count={2} />;
  if (error || !data) return <ErrorState message={error?.message ?? 'Donation not found'} onRetry={reload} />;
  const d = data;
  const unit = d.unit.toLowerCase();
  const open = ['AVAILABLE', 'PARTIALLY_RESERVED'].includes(d.status) && new Date(d.safePickupDeadline) > new Date();
  const canRequest = open && (!d.myRequest || d.myRequest.status === 'CANCELLED');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const qty = Number(quantity);
    if (!(qty > 0)) return setFormError('Enter a quantity greater than zero.');
    if (qty > d.remainingQuantity) return setFormError(`Only ${d.remainingQuantity} ${unit} are available.`);
    setBusy(true);
    try {
      const created = await api<{ id: string }>('/api/requests', {
        body: {
          donationId: d.id,
          requestedQuantity: qty,
          ...(beneficiaries && { beneficiaryCount: Number.parseInt(beneficiaries, 10) }),
          ...(notes.trim() && { notes: notes.trim() }),
        },
      });
      toast.success('Request sent', 'The donor has been notified.');
      router.push(`/dashboard/ngo/requests/${created.id}`);
    } catch (err) {
      setFormError((err as ApiClientError).message);
      reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/ngo/browse')}><ArrowLeft className="mr-1 h-4 w-4" /> Find food</Button>
      <PageHeader
        title={d.foodName}
        description={`${d.donorProfile.organisationName} · ${humanize(d.foodCategory)} · ${humanize(d.foodType)}`}
        actions={<StatusBadge status={d.status} />}
      />
      <Card>
        <CardContent className="grid gap-6 p-6 md:grid-cols-[1fr_16rem]">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="text-muted-foreground">Available</dt><dd className="text-lg font-semibold">{d.remainingQuantity} {unit}</dd></div>
            <div><dt className="text-muted-foreground">Pick up by</dt><dd className="font-medium"><Clock className="mr-1 inline h-3.5 w-3.5" />{formatDateTime(d.safePickupDeadline)} ({formatTimeRemaining(d.safePickupDeadline)})</dd></div>
            <div><dt className="text-muted-foreground">Prepared</dt><dd>{formatDateTime(d.preparationTime)}</dd></div>
            <div><dt className="text-muted-foreground">Storage</dt><dd>{d.storageConditions}</dd></div>
            <div className="sm:col-span-2"><dt className="text-muted-foreground">Pickup location</dt><dd data-testid="pickup-address"><MapPin className="mr-1 inline h-3.5 w-3.5" />{d.pickupAddress}</dd></div>
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
        label="Pickup location map"
        markers={[{ id: 'pickup', lat: d.latitude, lng: d.longitude, title: `Pickup: ${d.donorProfile.organisationName}`, subtitle: d.pickupAddress, tone: 'green' }]}
      />

      {d.myRequest && d.myRequest.status !== 'CANCELLED' ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-6">
            <p>You requested <strong>{d.myRequest.requestedQuantity} {unit}</strong> – status: <StatusBadge status={d.myRequest.status} /></p>
            <Button asChild variant="outline"><Link href={`/dashboard/ngo/requests/${d.myRequest.id}`}>Track request</Link></Button>
          </CardContent>
        </Card>
      ) : canRequest ? (
        <Card>
          <CardHeader><CardTitle className="text-lg">Request this food</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4" noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="requestedQuantity">Quantity ({unit}, max {d.remainingQuantity})</Label>
                  <Input id="requestedQuantity" type="number" min={0.1} max={d.remainingQuantity} step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="beneficiaryCount">People it will feed (optional)</Label>
                  <Input id="beneficiaryCount" type="number" min={1} value={beneficiaries} onChange={(e) => setBeneficiaries(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notes">Note to the donor (optional)</Label>
                <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={2} />
              </div>
              {formError && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800" role="alert">{formError}</p>}
              <Button type="submit" disabled={busy}>{busy ? <Spinner className="mr-2" /> : <Send className="mr-2 h-4 w-4" />} Send request</Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <p className="rounded-lg bg-muted p-4 text-sm">This donation is no longer accepting requests.</p>
      )}
    </div>
  );
}
