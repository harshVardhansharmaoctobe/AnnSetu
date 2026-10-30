import { FileUp, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { MilestoneList } from "@/components/MilestoneList";
import { TxStatusPanel } from "@/components/TxStatusPanel";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/form";
import { useContractTx } from "@/hooks/useContractTx";
import { formatEth } from "@/lib/format";
import type { Campaign } from "@/lib/types";
import { parseEthInput } from "@/lib/validation";
import { OwnedCampaign } from "./shared";

function AddMilestone({ campaign, onAdded }: { campaign: Campaign; onAdded: () => void }) {
  const tx = useContractTx();
  const unallocated = BigInt(campaign.targetWei) - BigInt(campaign.totalAllocatedWei);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [errors, setErrors] = useState<{ description?: string; amount?: string }>({});

  if (unallocated <= 0n) {
    return (
      <div className="space-y-3">
        <TxStatusPanel state={tx.state} successMessage="Milestone added on-chain. The campaign is now fully allocated and accepts donations." />
        <Alert tone="info">All {formatEth(campaign.targetWei)} of the target is allocated to milestones, so no further milestones can be added.</Alert>
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const err: typeof errors = {};
    const d = description.trim();
    if (d.length < 3 || d.length > 280) err.description = "3–280 characters";
    const a = parseEthInput(amount, { max: unallocated });
    if (a.error) err.amount = a.error === "Amount exceeds the maximum allowed" ? `At most ${formatEth(unallocated, 18)} is unallocated` : a.error;
    setErrors(err);
    if (Object.keys(err).length || !a.wei) return;
    if (await tx.run("Add milestone", (c) => c.createMilestone(campaign.id, d, a.wei))) {
      setDescription("");
      setAmount("");
      onAdded();
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <Alert tone="warning">{formatEth(unallocated, 18)} of the target is unallocated. The campaign accepts donations only once allocations equal the target.</Alert>
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <Field label="Milestone description" htmlFor="new-desc" error={errors.description}>
          <Input id="new-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={280} />
        </Field>
        <Field label="Allocation (ETH)" htmlFor="new-amt" error={errors.amount}>
          <Input id="new-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
      </div>
      <Button type="submit" loading={tx.busy}><Plus className="size-4" /> Add milestone on-chain</Button>
      <TxStatusPanel state={tx.state} />
    </form>
  );
}

export default function ManageMilestones() {
  return (
    <OwnedCampaign>
      {(c, reload) => (
        <div className="space-y-6">
          <Card>
            <CardHeader title="Milestones" description="Submit evidence for each milestone. Only the assigned verifier can approve it; you cannot release funds yourself." />
            <CardContent>
              <MilestoneList
                milestones={c.milestones}
                actions={(m) =>
                  m.status === "PENDING" || m.status === "REJECTED" ? (
                    <Link to={`/ngo/campaigns/${c.id}/milestones/${m.id}/evidence`} className={buttonClass(m.status === "REJECTED" ? "danger" : "primary", "sm")}>
                      <FileUp className="size-4" /> {m.status === "REJECTED" ? "Resubmit evidence" : "Submit evidence"}
                    </Link>
                  ) : null
                }
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader title="Add a milestone" />
            <CardContent><AddMilestone campaign={c} onAdded={reload} /></CardContent>
          </Card>
        </div>
      )}
    </OwnedCampaign>
  );
}
