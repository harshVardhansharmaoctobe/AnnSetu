'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Phone, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ProofList, RequestProgress, type Proof } from '@/components/request-progress';
import { ErrorState, LoadingCards, PageHeader, StatusBadge, humanize } from '@/components/states';
import { useToast } from '@/components/toaster';
import { api, useApi, type ApiClientError } from '@/lib/client';
import { formatDateTime } from '@/lib/utils';

interface Contact { name: string; email: string; phone: string | null }
interface RequestDetail {
  id: string; status: string; requestedQuantity: number; deliveredQuantity: number | null; beneficiaryCount: number | null;
  notes: string | null; createdAt: string; approvedAt: string | null; pickedUpAt: string | null; deliveredAt: string | null;
  completedAt: string | null; rejectionReason: string | null; disputeReason: string | null;
  donation: {
    id: string; foodName: string; unit: string; pickupAddress: string; safePickupDeadline: string; contactPhone: string | null;
    donorProfile: { organisationName: string; user: Contact };
  };
  assignments: { id: string; status: string; volunteerProfile: { vehicleType: string | null; user: Contact } }[];
  proofs: Proof[];
  impact: { mealsRescued: number; weightKg: number | null } | null;
}

export default function NgoRequestDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<RequestDetail>(`/api/requests/${id}`);
  const [dialog, setDialog] = useState<null | 'cancel' | 'confirm' | 'dispute'>(null);

  if (loading && !data) return <LoadingCards count={2} />;
  if (error || !data) return <ErrorState message={error?.message ?? 'Request not found'} onRetry={reload} />;
  const r = data;
  const unit = r.donation.unit.toLowerCase();
  const volunteer = r.assignments.find((a) => !['DECLINED', 'CANCELLED'].includes(a.status));
  const approved = !['PENDING', 'REJECTED', 'CANCELLED'].includes(r.status);

  const act = (path: string, body: unknown, success: string) => async () => {
    try {
      await api(`/api/requests/${id}/${path}`, { method: 'POST', body });
      toast.success(success);
      reload();
    } catch (e) {
      toast.error('Action failed', (e as ApiClientError).message);
      throw e;
    }
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/ngo/requests')}><ArrowLeft className="mr-1 h-4 w-4" /> My requests</Button>
      <PageHeader
        title={r.donation.foodName}
        description={`${r.requestedQuantity} ${unit} from ${r.donation.donorProfile.organisationName} · requested ${formatDateTime(r.createdAt)}`}
        actions={<StatusBadge status={r.status} />}
      />

      <Card>
        <CardContent className="p-6"><RequestProgress request={r} /></CardContent>
      </Card>

      {r.status === 'DELIVERED' && (
        <Card className="border-green-300 bg-green-50">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-6">
            <div>
              <p className="font-semibold">The volunteer marked this food as delivered ({r.deliveredQuantity} {unit}).</p>
              <p className="text-sm text-muted-foreground">Confirm receipt to record the impact, or report a problem.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="success" onClick={() => setDialog('confirm')}><CheckCircle2 className="mr-2 h-4 w-4" /> Confirm receipt</Button>
              <Button variant="outline" onClick={() => setDialog('dispute')}><AlertTriangle className="mr-2 h-4 w-4" /> Report problem</Button>
            </div>
          </CardContent>
        </Card>
      )}
      {r.impact && (
        <p className="rounded-lg bg-green-50 p-4 text-sm text-green-900">
          Impact recorded: ≈ {r.impact.mealsRescued} meals{r.impact.weightKg ? ` (≈ ${r.impact.weightKg} kg of food)` : ''} rescued.
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Pickup</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">{r.donation.donorProfile.organisationName}</p>
            <p className="text-muted-foreground">{r.donation.pickupAddress}</p>
            <p className="text-muted-foreground">Pick up by {formatDateTime(r.donation.safePickupDeadline)}</p>
            {approved && (r.donation.contactPhone || r.donation.donorProfile.user.phone) && (
              <a className="inline-flex items-center text-green-700 hover:underline" href={`tel:${r.donation.contactPhone ?? r.donation.donorProfile.user.phone}`}>
                <Phone className="mr-1 h-3.5 w-3.5" /> {r.donation.contactPhone ?? r.donation.donorProfile.user.phone}
              </a>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Volunteer</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {volunteer ? (
              <>
                <p className="font-medium">{volunteer.volunteerProfile.user.name}</p>
                <p className="text-muted-foreground">{humanize(volunteer.status)}{volunteer.volunteerProfile.vehicleType && ` · ${volunteer.volunteerProfile.vehicleType}`}</p>
                {volunteer.volunteerProfile.user.phone && (
                  <a className="inline-flex items-center text-green-700 hover:underline" href={`tel:${volunteer.volunteerProfile.user.phone}`}>
                    <Phone className="mr-1 h-3.5 w-3.5" /> {volunteer.volunteerProfile.user.phone}
                  </a>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">{r.status === 'ACCEPTED' ? 'Approved – a volunteer will be assigned soon.' : 'Not assigned yet.'}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {r.proofs.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Pickup and delivery proof</CardTitle></CardHeader>
          <CardContent><ProofList proofs={r.proofs} /></CardContent>
        </Card>
      )}

      {['PENDING', 'ACCEPTED', 'VOLUNTEER_ASSIGNED'].includes(r.status) && (
        <Button variant="outline" onClick={() => setDialog('cancel')}><XCircle className="mr-2 h-4 w-4" /> Withdraw request</Button>
      )}

      <ConfirmDialog
        open={dialog === 'cancel'} onOpenChange={(o) => !o && setDialog(null)}
        title="Withdraw this request?" description="Any reserved quantity is released back to the donor." confirmLabel="Withdraw" destructive withReason
        onConfirm={(reason) => act('cancel', { reason }, 'Request withdrawn')()}
      />
      <ConfirmDialog
        open={dialog === 'confirm'} onOpenChange={(o) => !o && setDialog(null)}
        title="Confirm you received the food?" description="This completes the delivery and records its impact." confirmLabel="Confirm receipt"
        onConfirm={() => act('confirm', { outcome: 'CONFIRMED' }, 'Receipt confirmed – thank you!')()}
      />
      <ConfirmDialog
        open={dialog === 'dispute'} onOpenChange={(o) => !o && setDialog(null)}
        title="Report a problem with this delivery" description="The donor and the FoodBridge admins will be notified." confirmLabel="Report problem" destructive
        withReason reasonRequired reasonLabel="What went wrong? (at least 5 characters)"
        onConfirm={(reason) => act('confirm', { outcome: 'DISPUTED', disputeReason: reason }, 'Problem reported')()}
      />
    </div>
  );
}
