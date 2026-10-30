'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useToast } from '@/components/toaster';
import { api, type ApiClientError } from '@/lib/client';

type Action = 'approve' | 'reject' | 'suspend' | 'reinstate';

const AVAILABLE: Record<string, Action[]> = {
  PENDING: ['approve', 'reject', 'suspend'],
  APPROVED: ['suspend'],
  REJECTED: ['approve'],
  SUSPENDED: ['reinstate'],
};
const LABELS: Record<Action, string> = { approve: 'Approve', reject: 'Reject', suspend: 'Suspend', reinstate: 'Reinstate' };

/** Account status buttons for admins; destructive actions go through a confirmation dialog. */
export function UserActions({ user, onChanged }: {
  user: { id: string; name: string; role: string; accountStatus: string };
  onChanged: () => void;
}) {
  const toast = useToast();
  const [pending, setPending] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  if (user.role === 'ADMIN') return <span className="text-xs text-muted-foreground">Managed in database</span>;

  async function run(action: Action, reason?: string) {
    setBusy(true);
    try {
      await api(`/api/admin/users/${user.id}`, { body: { action, reason } });
      toast.success(`${user.name}: ${LABELS[action].toLowerCase()}d`);
      onChanged();
    } catch (e) {
      toast.error('Action failed', (e as ApiClientError).message);
      onChanged();
      throw e;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {(AVAILABLE[user.accountStatus] ?? []).map((action) => (
        <Button
          key={action}
          size="sm"
          variant={action === 'approve' || action === 'reinstate' ? 'success' : 'outline'}
          disabled={busy}
          onClick={() => (action === 'approve' ? run(action).catch(() => {}) : setPending(action))}
          data-testid={`user-action-${action}`}
        >
          {LABELS[action]}
        </Button>
      ))}
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title={`${pending ? LABELS[pending] : ''} ${user.name}?`}
        description={pending === 'suspend' ? 'They will be signed out immediately and cannot sign in until reinstated.' : 'The user will be notified.'}
        confirmLabel={pending ? LABELS[pending] : 'Confirm'}
        destructive={pending === 'suspend' || pending === 'reject'}
        withReason
        onConfirm={(reason) => run(pending!, reason)}
      />
    </div>
  );
}
