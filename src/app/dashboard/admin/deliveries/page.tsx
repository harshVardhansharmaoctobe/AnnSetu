'use client';

import Link from 'next/link';
import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState, ErrorState, LoadingCards, PageHeader, Pagination, Spinner, StatusBadge, humanize } from '@/components/states';
import { useToast } from '@/components/toaster';
import { api, useApi, toQuery, type ApiClientError, type ListResult } from '@/lib/client';
import { calculateDistance, formatDateTime } from '@/lib/utils';

interface Row {
  id: string; status: string; requestedQuantity: number; updatedAt: string;
  donation: { foodName: string; unit: string; pickupAddress: string; latitude: number; longitude: number; donorProfile: { organisationName: string } };
  ngoProfile: { organisationName: string };
  assignments: { id: string; status: string; volunteerProfile: { user: { name: string } } }[];
}
interface Volunteer {
  id: string; name: string; phone: string | null;
  volunteerProfile: { id: string; address: string | null; vehicleType: string | null; isAvailable: boolean; latitude: number | null; longitude: number | null } | null;
}

const FILTERS = ['ACCEPTED', 'VOLUNTEER_ASSIGNED', 'PICKED_UP', 'DELIVERED', 'DISPUTED', 'COMPLETED', ''];

function AssignDialog({ row, onClose, onDone }: { row: Row; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const { data, error, loading } = useApi<ListResult<Volunteer>>('/api/admin/users?role=VOLUNTEER&status=APPROVED&pageSize=50');
  const volunteers = (data?.items ?? [])
    .filter((v) => v.volunteerProfile)
    .map((v) => ({
      ...v,
      distance: v.volunteerProfile!.latitude != null && v.volunteerProfile!.longitude != null
        ? calculateDistance(v.volunteerProfile!.latitude, v.volunteerProfile!.longitude, row.donation.latitude, row.donation.longitude)
        : null,
    }))
    .sort((a, b) => Number(b.volunteerProfile!.isAvailable) - Number(a.volunteerProfile!.isAvailable) || (a.distance ?? 1e9) - (b.distance ?? 1e9));

  async function assign(volunteerProfileId: string) {
    setBusy(volunteerProfileId);
    try {
      await api('/api/assignments', { body: { requestId: row.id, volunteerProfileId } });
      toast.success('Volunteer assigned', 'They have been asked to accept the delivery.');
      onDone();
    } catch (e) {
      toast.error('Could not assign', (e as ApiClientError).message);
      onDone();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign a volunteer</DialogTitle>
          <DialogDescription>{row.donation.foodName} · pickup at {row.donation.pickupAddress}</DialogDescription>
        </DialogHeader>
        {loading ? <Spinner /> : error ? <p className="text-sm text-destructive">{error.message}</p>
          : volunteers.length === 0 ? <p className="text-sm text-muted-foreground">No approved volunteers yet.</p> : (
            <ul className="max-h-80 divide-y overflow-y-auto">
              {volunteers.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 py-3" data-testid="volunteer-option">
                  <div className="text-sm">
                    <p className="font-medium">{v.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {v.distance !== null ? `${v.distance} km from pickup` : 'No service location'}
                      {v.volunteerProfile!.vehicleType && ` · ${v.volunteerProfile!.vehicleType}`}
                      {!v.volunteerProfile!.isAvailable && ' · marked unavailable'}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => assign(v.volunteerProfile!.id)} disabled={busy !== null}>
                    {busy === v.volunteerProfile!.id && <Spinner className="mr-1" />} Assign
                  </Button>
                </li>
              ))}
            </ul>
          )}
      </DialogContent>
    </Dialog>
  );
}

export default function AdminDeliveriesPage() {
  const toast = useToast();
  const [status, setStatus] = useState('ACCEPTED');
  const [page, setPage] = useState(1);
  const [assigning, setAssigning] = useState<Row | null>(null);
  const [removing, setRemoving] = useState<Row | null>(null);
  const { data, error, loading, reload } = useApi<ListResult<Row>>(`/api/requests${toQuery({ status, page })}`);

  async function removeVolunteer(reason?: string) {
    const assignment = removing?.assignments[0];
    if (!assignment) return;
    try {
      await api(`/api/assignments/${assignment.id}/cancel`, { body: { reason } });
      toast.success('Volunteer removed', 'The delivery is back in the volunteer pool.');
      reload();
    } catch (e) {
      toast.error('Could not remove volunteer', (e as ApiClientError).message);
      throw e;
    }
  }

  return (
    <div>
      <PageHeader title="Deliveries" description="Assign volunteers to approved requests and follow every delivery to completion." />
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <Button key={f || 'all'} size="sm" variant={status === f ? 'default' : 'outline'} onClick={() => { setStatus(f); setPage(1); }}>
            {f === 'ACCEPTED' ? 'Needs volunteer' : f ? humanize(f) : 'All'}
          </Button>
        ))}
      </div>
      {loading && !data ? <LoadingCards />
        : error ? <ErrorState message={error.message} onRetry={reload} />
          : data!.items.length === 0 ? <EmptyState title="Nothing in this view" />
            : (
              <ul className="space-y-3">
                {data!.items.map((r) => {
                  const assignment = r.assignments[0];
                  return (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4" data-testid="delivery-row">
                      <div className="text-sm">
                        <Link href={`/dashboard/admin/deliveries/${r.id}`} className="font-semibold hover:underline">{r.donation.foodName}</Link>
                        <p className="text-muted-foreground">
                          {r.requestedQuantity} {r.donation.unit.toLowerCase()} · {r.donation.donorProfile.organisationName} → {r.ngoProfile.organisationName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Updated {formatDateTime(r.updatedAt)}{assignment && ` · ${assignment.volunteerProfile.user.name} (${humanize(assignment.status)})`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={r.status} />
                        {r.status === 'ACCEPTED' && <Button size="sm" onClick={() => setAssigning(r)}><UserPlus className="mr-1 h-4 w-4" /> Assign</Button>}
                        {r.status === 'VOLUNTEER_ASSIGNED' && assignment && (
                          <Button size="sm" variant="outline" onClick={() => setRemoving(r)}>Remove volunteer</Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      {assigning && <AssignDialog row={assigning} onClose={() => setAssigning(null)} onDone={() => { setAssigning(null); reload(); }} />}
      <ConfirmDialog
        open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove the volunteer from this delivery?" description="The volunteer is notified and the delivery returns to the pool." confirmLabel="Remove" destructive withReason
        onConfirm={removeVolunteer}
      />
    </div>
  );
}
