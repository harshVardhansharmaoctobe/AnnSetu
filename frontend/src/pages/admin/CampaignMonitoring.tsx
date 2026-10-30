import { Megaphone, Pause, Play, UserCog } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { CampaignStateBadge } from "@/components/CampaignCard";
import { AddressLink, DemoBadge } from "@/components/chain";
import { PageHeader } from "@/components/layout/Layouts";
import { TxStatusPanel } from "@/components/TxStatusPanel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/feedback";
import { Field, Select } from "@/components/ui/form";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { useApi } from "@/hooks/useApi";
import { useContractTx } from "@/hooks/useContractTx";
import { api } from "@/lib/api";
import { formatEth, sameAddress } from "@/lib/format";
import type { Campaign } from "@/lib/types";

export default function CampaignMonitoring() {
  const data = useApi(() => Promise.all([api.campaigns(), api.verifiers()]), []);
  const tx = useContractTx();
  const [suspendTarget, setSuspendTarget] = useState<Campaign | null>(null);
  const [reassign, setReassign] = useState<Campaign | null>(null);
  const [newVerifier, setNewVerifier] = useState("");

  if (data.loading) return <LoadingState />;
  if (data.error) return <Card><ErrorState error={data.error} onRetry={data.reload} /></Card>;
  const [{ campaigns }, { accounts: verifiers }] = data.data!;

  const toggleSuspend = async () => {
    const c = suspendTarget!;
    setSuspendTarget(null);
    if (await tx.run(c.suspended ? "Resume donations" : "Suspend donations", (ct) => ct.setCampaignSuspended(c.id, !c.suspended))) void data.reload();
  };
  const doReassign = async () => {
    const c = reassign!;
    setReassign(null);
    if (await tx.run("Reassign verifier", (ct) => ct.setCampaignVerifier(c.id, newVerifier))) void data.reload();
  };
  const eligible = (c: Campaign) => verifiers.filter((v) => !sameAddress(v.address, c.verifier?.address) && !sameAddress(v.address, c.beneficiary?.address));

  return (
    <div className="space-y-6">
      <PageHeader title="Campaign monitoring" description="Every on-chain campaign. Suspending only stops new donations; escrowed funds and reviews are unaffected." />
      <TxStatusPanel state={tx.state} />
      <Card>
        {campaigns.length === 0 ? (
          <EmptyState icon={Megaphone} title="No campaigns yet" />
        ) : (
          <Table className="min-w-[860px]">
            <THead><tr><TH>Campaign</TH><TH>Status</TH><TH>Donated / escrow / released</TH><TH>Milestones</TH><TH>Verifier</TH><TH>Actions</TH></tr></THead>
            <TBody>
              {campaigns.map((c) => (
                <TR key={c.id}>
                  <TD>
                    <Link to={`/campaigns/${c.id}/transparency`} className="font-medium text-accent-700 hover:underline">#{c.id} {c.title}</Link>
                    <p className="text-xs text-navy-500">{c.ngo?.name ?? "—"} <DemoBadge show={c.isDemo} /></p>
                  </TD>
                  <TD><CampaignStateBadge campaign={c} /></TD>
                  <TD className="text-sm whitespace-nowrap">
                    {formatEth(c.totalDonatedWei)} / <span className="text-accent-700">{formatEth(c.escrowWei)}</span> / <span className="text-emerald-700">{formatEth(c.totalReleasedWei)}</span>
                  </TD>
                  <TD className="text-sm">
                    {c.milestones.filter((m) => m.status === "RELEASED").length}/{c.milestones.length} released
                    {c.milestones.some((m) => m.status === "PENDING_VERIFICATION") && <p className="text-xs text-amber-700">Review pending</p>}
                    {c.milestones.some((m) => m.status === "APPROVED") && <p className="text-xs text-accent-700">Release pending</p>}
                  </TD>
                  <TD><AddressLink address={c.verifier?.address} name={c.verifier?.name} /></TD>
                  <TD>
                    <div className="flex flex-wrap gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => setSuspendTarget(c)} disabled={tx.busy}>
                        {c.suspended ? <><Play className="size-3.5" /> Resume</> : <><Pause className="size-3.5" /> Suspend</>}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setReassign(c); setNewVerifier(""); }} disabled={tx.busy || eligible(c).length === 0} title={eligible(c).length === 0 ? "No other eligible verifier" : undefined}>
                        <UserCog className="size-3.5" /> Verifier
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Dialog open={!!suspendTarget} onOpenChange={(o) => !o && setSuspendTarget(null)}>
        <DialogContent title={suspendTarget?.suspended ? "Resume donations?" : "Suspend donations?"} description={`Campaign #${suspendTarget?.id} · ${suspendTarget?.title}`}>
          <p className="text-sm text-navy-600">{suspendTarget?.suspended ? "The campaign will accept donations again (if before its end date)." : "New donations will be rejected by the contract. Funds already in escrow remain releasable through verified milestones."}</p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSuspendTarget(null)}>Cancel</Button>
            <Button variant={suspendTarget?.suspended ? "success" : "danger"} onClick={() => void toggleSuspend()}>Confirm in MetaMask</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reassign} onOpenChange={(o) => !o && setReassign(null)}>
        <DialogContent title="Reassign verifier" description={`Campaign #${reassign?.id}. The new verifier cannot be the NGO or the beneficiary.`}>
          <Field label="New verifier" htmlFor="new-verifier">
            <Select id="new-verifier" value={newVerifier} onChange={(e) => setNewVerifier(e.target.value)}>
              <option value="">Select a verifier</option>
              {reassign && eligible(reassign).map((v) => <option key={v.address} value={v.address}>{(v.organization ?? v.name ?? "Verifier") + ` · ${v.address.slice(0, 8)}…`}</option>)}
            </Select>
          </Field>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setReassign(null)}>Cancel</Button>
            <Button disabled={!newVerifier} onClick={() => void doReassign()}>Confirm in MetaMask</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
