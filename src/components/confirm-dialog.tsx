'use client';

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/states';

/**
 * Confirmation dialog for consequential actions. With `withReason`, collects an optional
 * (or required) reason that is passed to `onConfirm`.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  destructive,
  withReason,
  reasonRequired,
  reasonLabel = 'Reason (optional)',
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  withReason?: boolean;
  reasonRequired?: boolean;
  reasonLabel?: string;
  onConfirm: (reason?: string) => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm(withReason ? reason.trim() || undefined : undefined);
      setReason('');
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {withReason && (
          <div className="space-y-2">
            <Label htmlFor="confirm-reason">{reasonLabel}</Label>
            <Textarea id="confirm-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={3} />
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Back</Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={confirm}
            disabled={busy || (reasonRequired && reason.trim().length < 5)}
          >
            {busy && <Spinner className="mr-2" />} {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
