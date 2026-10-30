'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/states';
import { useToast } from '@/components/toaster';
import { api, type ApiClientError } from '@/lib/client';

/** Admin decision on a reported delivery problem: verify (impact recorded) or close (no impact). */
export function ResolveDisputeDialog({
  request,
  onClose,
  onResolved,
}: {
  request: { id: string; requestedQuantity: number; deliveredQuantity: number | null; disputeReason: string | null; unit: string; foodName: string };
  onClose: () => void;
  onResolved: () => void;
}) {
  const toast = useToast();
  const [outcome, setOutcome] = useState<'VERIFY' | 'CLOSE'>('VERIFY');
  const [quantity, setQuantity] = useState(String(request.deliveredQuantity ?? request.requestedQuantity));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unit = request.unit.toLowerCase();

  async function submit() {
    setError(null);
    const verifiedQuantity = Number(quantity);
    if (note.trim().length < 5) return setError('Explain the decision (at least 5 characters).');
    if (outcome === 'VERIFY' && !(verifiedQuantity > 0 && verifiedQuantity <= request.requestedQuantity)) {
      return setError(`Verified quantity must be between 0 and ${request.requestedQuantity} ${unit}.`);
    }
    setBusy(true);
    try {
      await api(`/api/requests/${request.id}/resolve`, {
        body: { outcome, note: note.trim(), ...(outcome === 'VERIFY' && { verifiedQuantity }) },
      });
      toast.success(outcome === 'VERIFY' ? 'Delivery verified – impact recorded' : 'Report closed – no impact recorded');
      onResolved();
    } catch (e) {
      setError((e as ApiClientError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolve reported problem</DialogTitle>
          <DialogDescription>{request.foodName}: “{request.disputeReason}”</DialogDescription>
        </DialogHeader>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Decision</legend>
          {[
            { value: 'VERIFY', label: 'Delivery verified', hint: 'Food was delivered – record impact for the verified quantity.' },
            { value: 'CLOSE', label: 'Could not be verified', hint: 'Close the report – no impact is recorded.' },
          ].map((o) => (
            <label key={o.value} className="flex items-start gap-2 rounded-md border p-3 text-sm">
              <input type="radio" name="outcome" value={o.value} checked={outcome === o.value} onChange={() => setOutcome(o.value as 'VERIFY' | 'CLOSE')} className="mt-0.5 accent-green-600" />
              <span><span className="font-medium">{o.label}</span><span className="block text-muted-foreground">{o.hint}</span></span>
            </label>
          ))}
        </fieldset>
        {outcome === 'VERIFY' && (
          <div className="space-y-1.5">
            <Label htmlFor="verifiedQuantity">Verified quantity ({unit}, approved {request.requestedQuantity})</Label>
            <Input id="verifiedQuantity" type="number" min={0.1} max={request.requestedQuantity} step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="resolutionNote">Note for the NGO, donor and volunteer</Label>
          <Textarea id="resolutionNote" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} />
        </div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Back</Button>
          <Button onClick={submit} disabled={busy}>{busy && <Spinner className="mr-2" />} Save decision</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
