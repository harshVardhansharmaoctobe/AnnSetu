'use client';

import { Check } from 'lucide-react';
import { cn, formatDateTime } from '@/lib/utils';
import { humanize } from '@/components/states';

const STEPS = [
  { status: 'PENDING', label: 'Requested', at: 'createdAt' },
  { status: 'ACCEPTED', label: 'Approved', at: 'approvedAt' },
  { status: 'VOLUNTEER_ASSIGNED', label: 'Volunteer assigned', at: null },
  { status: 'PICKED_UP', label: 'Picked up', at: 'pickedUpAt' },
  { status: 'DELIVERED', label: 'Delivered', at: 'deliveredAt' },
  { status: 'COMPLETED', label: 'Receipt confirmed', at: 'completedAt' },
] as const;
const ORDER: string[] = STEPS.map((s) => s.status);

export interface ProgressRequest {
  status: string;
  createdAt: string;
  approvedAt?: string | null;
  pickedUpAt?: string | null;
  deliveredAt?: string | null;
  completedAt?: string | null;
  rejectionReason?: string | null;
  disputeReason?: string | null;
}

/** Step tracker for one request's journey from NGO request to confirmed receipt. */
export function RequestProgress({ request }: { request: ProgressRequest }) {
  if (['REJECTED', 'CANCELLED'].includes(request.status)) {
    return (
      <p className="rounded-md bg-muted p-3 text-sm">
        {humanize(request.status)}{request.rejectionReason ? ` – ${request.rejectionReason}` : ''}
      </p>
    );
  }
  const current = request.status === 'DISPUTED' ? ORDER.indexOf('DELIVERED') : ORDER.indexOf(request.status);

  return (
    <div>
      <ol className="grid grid-cols-3 gap-y-4 sm:grid-cols-6" aria-label="Delivery progress">
        {STEPS.map((step, i) => {
          const done = i <= current;
          const at = step.at ? (request as unknown as Record<string, string | null | undefined>)[step.at] : null;
          return (
            <li key={step.status} className="flex flex-col items-center text-center" aria-current={i === current ? 'step' : undefined}>
              <span
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold',
                  done ? 'border-green-600 bg-green-600 text-white' : 'border-muted-foreground/30 text-muted-foreground'
                )}
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className={cn('mt-1 text-xs font-medium', !done && 'text-muted-foreground')}>{step.label}</span>
              {done && at && <span className="text-[10px] text-muted-foreground">{formatDateTime(at)}</span>}
            </li>
          );
        })}
      </ol>
      {request.status === 'DISPUTED' && (
        <p className="mt-3 rounded-md bg-rose-50 p-3 text-sm text-rose-800">Issue reported by the NGO: {request.disputeReason}</p>
      )}
    </div>
  );
}

export interface Proof {
  id: string;
  type: 'PICKUP' | 'DELIVERY';
  photoUrl: string | null;
  quantity: number | null;
  notes: string | null;
  createdAt: string;
}

export function ProofList({ proofs }: { proofs: Proof[] }) {
  if (proofs.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {proofs.map((p) => (
        <figure key={p.id} className="rounded-lg border p-3">
          {p.photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.photoUrl} alt={`${humanize(p.type)} proof`} className="h-40 w-full rounded-md object-cover" />
          )}
          <figcaption className="mt-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{humanize(p.type)} proof</span> · {formatDateTime(p.createdAt)}
            {p.quantity !== null && ` · ${p.quantity} delivered`}
            {p.notes && <span className="block">{p.notes}</span>}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
