import { HandCoins, Lock } from "lucide-react";
import { useState } from "react";
import { useWallet } from "@/context/WalletContext";
import { useContractTx } from "@/hooks/useContractTx";
import { config } from "@/lib/config";
import { formatEth, shortAddress } from "@/lib/format";
import type { Campaign } from "@/lib/types";
import { parseEthInput } from "@/lib/validation";
import { TxStatusPanel } from "./TxStatusPanel";
import { Button } from "./ui/button";
import { Dialog, DialogContent } from "./ui/dialog";
import { Alert } from "./ui/feedback";
import { Field, Input } from "./ui/form";

export function DonatePanel({ campaign, onDonated }: { campaign: Campaign; onDonated: () => void }) {
  const wallet = useWallet();
  const tx = useContractTx();
  const [amount, setAmount] = useState("");
  const [touched, setTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const remaining = BigInt(campaign.targetWei) - BigInt(campaign.totalDonatedWei);
  const parsed = parseEthInput(amount, { max: remaining > 0n ? remaining : 0n });
  const error = parsed.error === "Amount exceeds the maximum allowed" ? `At most ${formatEth(remaining, 18)} can still be donated` : parsed.error;

  const closedReason = campaign.suspended
    ? "This campaign has been suspended by the platform admin."
    : campaign.ended
      ? "This campaign's donation period has ended."
      : !campaign.active
        ? "This campaign is not accepting donations yet (milestones not fully allocated)."
        : remaining <= 0n
          ? "This campaign is fully funded."
          : null;

  const donate = async () => {
    setConfirming(false);
    if (!parsed.wei) return;
    const receipt = await tx.run("Donation", (c) => c.donate(campaign.id, { value: parsed.wei }));
    if (receipt) {
      setAmount("");
      setTouched(false);
      onDonated();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-navy-600">
        <Lock className="mt-0.5 size-3.5 shrink-0" />
        <p>
          Your ETH goes to the TrustChain contract, not to the NGO. It is released to the beneficiary {shortAddress(campaign.beneficiary?.address)} only
          after the assigned verifier approves each milestone.
        </p>
      </div>

      {closedReason ? (
        <Alert tone="info">{closedReason}</Alert>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (!parsed.error) setConfirming(true);
          }}
          noValidate
        >
          <Field label="Amount (ETH)" htmlFor="donation-amount" error={touched ? error : null} hint={`Up to ${formatEth(remaining, 6)} remaining`}>
            <Input
              id="donation-amount"
              inputMode="decimal"
              placeholder="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={() => setTouched(true)}
              aria-invalid={touched && !!error}
              disabled={tx.busy}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            {["0.01", "0.05", "0.1"].map((v) => (
              <button
                key={v}
                type="button"
                className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-navy-700 hover:bg-slate-50"
                onClick={() => {
                  setAmount(v);
                  setTouched(true);
                }}
                disabled={tx.busy}
              >
                {v} ETH
              </button>
            ))}
          </div>
          {!wallet.hasProvider ? (
            <Alert tone="warning" title="MetaMask required">
              Install the MetaMask extension to donate. <a className="underline" href="https://metamask.io/download/" target="_blank" rel="noreferrer">Get MetaMask</a>
            </Alert>
          ) : !wallet.account ? (
            <Button className="w-full" onClick={() => void wallet.connect()} loading={wallet.connecting}>
              Connect MetaMask to donate
            </Button>
          ) : !wallet.isCorrectNetwork ? (
            <Button className="w-full" variant="outline" onClick={() => void wallet.switchNetwork()}>
              Switch to {config.chainName}
            </Button>
          ) : (
            <Button type="submit" variant="success" className="w-full" loading={tx.busy}>
              <HandCoins className="size-4" /> Donate {parsed.wei ? formatEth(parsed.wei, 6) : ""}
            </Button>
          )}
        </form>
      )}

      <TxStatusPanel state={tx.state} successMessage="Donation confirmed on-chain and locked in escrow. Thank you!" />

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent title="Confirm donation" description="Review the details, then confirm the transaction in MetaMask.">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-navy-500">Amount</dt>
              <dd className="font-semibold">{parsed.wei ? formatEth(parsed.wei, 18) : "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-navy-500">Campaign</dt>
              <dd className="text-right">#{campaign.id} · {campaign.title}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-navy-500">Held by</dt>
              <dd className="font-mono text-xs">{shortAddress(config.contractAddress, 6)} (escrow contract)</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-navy-500">Released to</dt>
              <dd className="font-mono text-xs">{shortAddress(campaign.beneficiary?.address, 6)} after verification</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-navy-500">Network</dt>
              <dd>{config.chainName}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-navy-500">Network gas fees apply. Donations cannot be withdrawn by the donor once sent.</p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="success" onClick={() => void donate()}>
              Confirm in MetaMask
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
