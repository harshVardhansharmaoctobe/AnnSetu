'use client';

import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProofList, RequestProgress, type Proof } from '@/components/request-progress';
import { ErrorState, LoadingCards, PageHeader, StatusBadge, humanize } from '@/components/states';
import { useApi } from '@/lib/client';
import { formatDateTime } from '@/lib/utils';

interface Contact { name: string; email: string; phone: string | null }
interface Detail {
  id: string; status: string; requestedQuantity: number; deliveredQuantity: number | null; beneficiaryCount: number | null;
  createdAt: string; approvedAt: string | null; pickedUpAt: string | null; deliveredAt: string | null; completedAt: string | null;
  rejectionReason: string | null; disputeReason: string | null; notes: string | null;
  donation: { foodName: string; unit: string; pickupAddress: string; donorProfile: { organisationName: string; user: Contact } };
  ngoProfile: { organisationName: string; address: string; user: Contact };
  assignments: { id: string; status: string; createdAt: string; notes: string | null; volunteerProfile: { user: Contact } }[];
  proofs: Proof[];
  impact: { mealsRescued: number; weightKg: number | null; co2SavedKg: number | null } | null;
}

const ContactLine = ({ c }: { c: Contact }) => (
  <p className="text-muted-foreground">{c.name} · {c.email}{c.phone && ` · ${c.phone}`}</p>
);

export default function AdminDeliveryDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, loading, reload } = useApi<Detail>(`/api/requests/${id}`);
  if (loading && !data) return <LoadingCards count={2} />;
  if (error || !data) return <ErrorState message={error?.message ?? 'Delivery not found'} onRetry={reload} />;
  const r = data;
  const unit = r.donation.unit.toLowerCase();

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/admin/deliveries')}><ArrowLeft className="mr-1 h-4 w-4" /> Deliveries</Button>
      <PageHeader title={r.donation.foodName} description={`${r.requestedQuantity} ${unit} requested${r.deliveredQuantity !== null ? ` · ${r.deliveredQuantity} delivered` : ''}`} actions={<StatusBadge status={r.status} />} />
      <Card><CardContent className="p-6"><RequestProgress request={r} /></CardContent></Card>
      {r.impact && (
        <p className="rounded-lg bg-green-50 p-4 text-sm text-green-900">
          Impact recorded: ≈ {r.impact.mealsRescued} meals, ≈ {r.impact.weightKg ?? 0} kg food, ≈ {r.impact.co2SavedKg ?? 0} kg CO₂e (estimates).
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Donor</CardTitle></CardHeader>
          <CardContent className="text-sm"><p className="font-medium">{r.donation.donorProfile.organisationName}</p><p className="text-muted-foreground">{r.donation.pickupAddress}</p><ContactLine c={r.donation.donorProfile.user} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">NGO</CardTitle></CardHeader>
          <CardContent className="text-sm">
            <p className="font-medium">{r.ngoProfile.organisationName}</p><p className="text-muted-foreground">{r.ngoProfile.address}</p><ContactLine c={r.ngoProfile.user} />
            {r.beneficiaryCount && <p className="mt-1">{r.beneficiaryCount} intended beneficiaries</p>}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Volunteer assignments</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {r.assignments.length === 0 ? <p className="text-muted-foreground">None yet.</p> : r.assignments.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
              <div><p className="font-medium">{a.volunteerProfile.user.name}</p><p className="text-xs text-muted-foreground">{formatDateTime(a.createdAt)}{a.notes && ` · ${a.notes}`}</p></div>
              <StatusBadge status={a.status} />
            </div>
          ))}
        </CardContent>
      </Card>
      {r.proofs.length > 0 && <Card><CardHeader><CardTitle className="text-base">Proof</CardTitle></CardHeader><CardContent><ProofList proofs={r.proofs} /></CardContent></Card>}
      {r.notes && <p className="text-sm text-muted-foreground">NGO note: {r.notes}</p>}
      {r.rejectionReason && <p className="text-sm text-muted-foreground">{humanize(r.status)} reason: {r.rejectionReason}</p>}
    </div>
  );
}
