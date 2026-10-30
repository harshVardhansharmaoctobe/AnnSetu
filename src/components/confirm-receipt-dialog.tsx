'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/states';
import { cn } from '@/lib/utils';

/** NGO confirms receipt, optionally rating the delivery (1–5) and leaving feedback for donor and volunteer. */
export function ConfirmReceiptDialog({ open, onOpenChange, onConfirm }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: { rating?: number; feedback?: string }) => Promise<void>;
}) {
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm({ ...(rating > 0 && { rating }), ...(feedback.trim() && { feedback: feedback.trim() }) });
      onOpenChange(false);
    } catch {
      /* the caller shows the error */
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm you received the food?</DialogTitle>
          <DialogDescription>This completes the delivery and records it as verified impact.</DialogDescription>
        </DialogHeader>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">How did it go? (optional)</legend>
          <div className="flex gap-1" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`}
                onClick={() => setRating(rating === n ? 0 : n)} className="rounded p-1 hover:bg-muted">
                <Star className={cn('h-6 w-6', n <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground')} />
              </button>
            ))}
          </div>
        </fieldset>
        <div className="space-y-1.5">
          <Label htmlFor="feedback">Feedback for the donor and volunteer (optional)</Label>
          <Textarea id="feedback" rows={3} maxLength={500} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Back</Button>
          <Button variant="success" onClick={confirm} disabled={busy} data-testid="confirm-receipt-submit">{busy && <Spinner className="mr-2" />} Confirm receipt</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
