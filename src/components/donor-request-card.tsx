'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Check, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { StatusBadge } from '@/components/states';
import { useToast } from '@/components/toaster';
import { api, type ApiClientError } from '@/lib/client';
import { formatDateTime } from '@/lib/utils';

export interface DonorRequest {
  id: string;
  status: string;
  requestedQuantity: number;
  beneficiaryCount: number | null;
  notes: string | null;
  createdAt: string;
  donation: { id: string; foodName: string; unit: string };
  ngoProfile: { organisationName: string; address: string };
  assignments?: { volunteerProfile: { user: { name: string } } | null }[];
}

/** Incoming NGO request with approve/reject for the donor. */
export function DonorRequestCard({ request, onChanged, showDonation = true }: {
  request: DonorRequest;
  onChanged: () => void;
  showDonation?: boolean;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const unit = request.donation.unit.toLowerCase();

  async function approve() {
    setBusy(true);
    try {
      await api(`/api/requests/${request.id}/approve`, { method: 'POST', body: {} });
      toast.success('Request approved', `${request.requestedQuantity} ${unit} reserved for ${request.ngoProfile.organisationName}.`);
      onChanged();
    } catch (e) {
      toast.error('Could not approve', (e as ApiClientError).message);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function reject(reason?: string) {
    try {
      await api(`/api/requests/${request.id}/reject`, { method: 'POST', body: { reason } });
      toast.success('Request declined');
      onChanged();
    } catch (e) {
      toast.error('Could not decline', (e as ApiClientError).message);
      throw e;
    }
  }

  return (
    <div className="rounded-lg border bg-white p-4" data-testid="donor-request">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{request.ngoProfile.organisationName}</p>
          <p className="text-sm text-muted-foreground">
            {request.requestedQuantity} {unit}
            {showDonation && (
              <> of <Link href={`/dashboard/donor/donations/${request.donation.id}`} className="text-green-700 hover:underline">{request.donation.foodName}</Link></>
            )}
            {' · '}{formatDateTime(request.createdAt)}
          </p>
        </div>
        <StatusBadge status={request.status} />
      </div>
      {(request.beneficiaryCount || request.notes) && (
        <p className="mt-2 text-sm">
          {request.beneficiaryCount && (
            <span className="mr-3 inline-flex items-center gap-1 text-muted-foreground"><Users className="h-3.5 w-3.5" /> {request.beneficiaryCount} beneficiaries</span>
          )}
          {request.notes}
        </p>
      )}
      {request.assignments?.[0] && (
        <p className="mt-2 text-sm text-muted-foreground">Volunteer: {request.assignments[0].volunteerProfile?.user.name ?? 'open – waiting for a volunteer'}</p>
      )}
      {request.status === 'PENDING' && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="success" onClick={approve} disabled={busy}>
            <Check className="mr-1 h-4 w-4" /> Approve
          </Button>
          <Button size="sm" variant="outline" onClick={() => setRejecting(true)} disabled={busy}>
            <X className="mr-1 h-4 w-4" /> Decline
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={rejecting}
        onOpenChange={setRejecting}
        title="Decline this request?"
        description={`${request.ngoProfile.organisationName} will be notified.`}
        confirmLabel="Decline request"
        destructive
        withReason
        onConfirm={reject}
      />
    </div>
  );
}
