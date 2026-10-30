import { CircleDollarSign } from "lucide-react";
import { useState } from "react";
import { useContractTx } from "@/hooks/useContractTx";
import { formatEth, shortAddress } from "@/lib/format";
import { TxStatusPanel } from "./TxStatusPanel";
import { Button } from "./ui/button";
import { Dialog, DialogContent } from "./ui/dialog";
import { Alert } from "./ui/feedback";

/** Release an approved milestone's allocation to the beneficiary (verifier or admin wallet). */
export function ReleaseButton({
  campaignId,
  milestoneId,
  amountWei,
  escrowWei,
  beneficiary,
  onReleased,
  released = false,
  size = "md",
}: {
  campaignId: number;
  milestoneId: number;
  amountWei: string;
  escrowWei: string;
  beneficiary?: string | null;
  onReleased: (txHash: string) => void;
  /** Already released on-chain: render nothing unless this instance just performed the release. */
  released?: boolean;
  size?: "sm" | "md";
}) {
  const tx = useContractTx();
  const [open, setOpen] = useState(false);
  const insufficient = BigInt(escrowWei) < BigInt(amountWei);

  const release = async () => {
    setOpen(false);
    const receipt = await tx.run("Release funds", (c) => c.releaseFunds(campaignId, milestoneId));
    if (receipt) onReleased(receipt.hash);
  };

  if (released && tx.state.phase === "idle") return null;

  return (
    <div className="space-y-2">
      {tx.state.phase !== "confirmed" && !released && (
        <Button variant="success" size={size} onClick={() => setOpen(true)} loading={tx.busy} disabled={insufficient}>
          <CircleDollarSign className="size-4" /> Release {formatEth(amountWei)}
        </Button>
      )}
      {insufficient && !released && (
        <p className="text-xs text-amber-700">
          Escrow holds {formatEth(escrowWei)}, which is less than this milestone's {formatEth(amountWei)}. Release becomes possible once more donations arrive.
        </p>
      )}
      <TxStatusPanel state={tx.state} successMessage={`${formatEth(amountWei)} released to the beneficiary.`} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Release milestone funds?" description="This transfers ETH out of escrow and cannot be undone.">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-navy-500">Milestone</dt><dd>Campaign #{campaignId} · M{milestoneId + 1}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-navy-500">Amount</dt><dd className="font-semibold">{formatEth(amountWei, 18)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-navy-500">Recipient (fixed beneficiary)</dt><dd className="font-mono text-xs">{shortAddress(beneficiary, 6)}</dd></div>
          </dl>
          <Alert tone="info" className="mt-4">The contract checks the approval, the escrow balance and that this milestone was not released before.</Alert>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="success" onClick={() => void release()}>Confirm in MetaMask</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
