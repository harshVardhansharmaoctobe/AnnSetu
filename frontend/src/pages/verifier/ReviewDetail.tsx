import { ArrowLeft, Check, FileSearch, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { AddressLink, HashValue, MilestoneStatusBadge, StorageBadge, TxLink } from "@/components/chain";
import { EvidenceFiles } from "@/components/MilestoneList";
import { ReleaseButton } from "@/components/ReleaseButton";
import { TxStatusPanel } from "@/components/TxStatusPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Alert, EmptyState, ErrorState, LoadingState } from "@/components/ui/feedback";
import { Field, Textarea } from "@/components/ui/form";
import { useAuth } from "@/context/AuthContext";
import { useApi } from "@/hooks/useApi";
import { useContractTx } from "@/hooks/useContractTx";
import { api, type IntegrityReport } from "@/lib/api";
import { formatDate, formatEth, sameAddress } from "@/lib/format";

export default function ReviewDetail() {
  const { campaignId = "", milestoneId = "" } = useParams();
  const mid = Number(milestoneId);
  const { user } = useAuth();
  const campaign = useApi(() => api.campaign(campaignId), [campaignId]);
  const tx = useContractTx();
  const [dialog, setDialog] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [integrity, setIntegrity] = useState<IntegrityReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [integrityError, setIntegrityError] = useState<string | null>(null);

  if (campaign.loading) return <LoadingState />;
  if (campaign.error) return <Card><ErrorState error={campaign.error} onRetry={campaign.reload} /></Card>;
  const c = campaign.data!.campaign;
  const m = c.milestones[mid];
  if (!m) return <Card><EmptyState icon={FileSearch} title="Milestone not found" /></Card>;

  const assigned = sameAddress(c.verifier?.address, user?.address);
  const evidence = m.evidence?.find((e) => e.manifest.ref === m.evidenceCID && e.manifest.sha256 === m.evidenceHash?.toLowerCase());

  const checkIntegrity = async () => {
    if (!evidence) return;
    setChecking(true);
    setIntegrityError(null);
    try {
      setIntegrity(await api.integrity(evidence.id));
    } catch (err) {
      setIntegrityError(err instanceof Error ? err.message : String(err));
    } finally {
      setChecking(false);
    }
  };

  const approve = async () => {
    setDialog(null);
    if (await tx.run("Approve milestone", (ct) => ct.approveMilestone(c.id, mid))) void campaign.reload();
  };

  const reject = async () => {
    const r = reason.trim();
    if (r.length < 5) return setReasonError("Explain the reason in at least 5 characters");
    if (r.length > 500) return setReasonError("At most 500 characters");
    setDialog(null);
    if (await tx.run("Reject milestone", (ct) => ct.rejectMilestone(c.id, mid, r))) {
      setReason("");
      void campaign.reload();
    }
  };

  return (
    <div className="space-y-6">
      <Link to="/verifier/pending" className="inline-flex items-center gap-1 text-sm text-navy-500 hover:text-navy-800">
        <ArrowLeft className="size-4" /> Pending reviews
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-wide text-navy-400 uppercase">Evidence review</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{c.title} · Milestone {mid + 1}</h1>
        </div>
        <MilestoneStatusBadge status={m.status} />
      </div>

      {!assigned && (
        <Alert tone="error" title="You are not this campaign's verifier">
          Only {c.verifier?.address} can approve or reject. The contract will reject decisions from any other wallet.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Milestone" />
            <CardContent>
              <p className="font-medium">{m.description}</p>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <div><dt className="text-xs text-navy-500">Requested amount</dt><dd className="font-semibold">{formatEth(m.amountWei)}</dd></div>
                <div><dt className="text-xs text-navy-500">Campaign escrow</dt><dd className="font-semibold">{formatEth(c.escrowWei)}</dd></div>
                <div><dt className="text-xs text-navy-500">Submitted</dt><dd>{formatDate(m.submittedAt, true)}</dd></div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Submitted evidence" description="Values below are the ones recorded on-chain for this milestone." action={<StorageBadge isIpfs={m.evidenceIsIpfs} />} />
            <CardContent className="space-y-4">
              {!m.evidenceCID ? (
                <p className="text-sm text-navy-500">No evidence has been submitted for this milestone.</p>
              ) : (
                <>
                  <dl className="space-y-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2"><dt className="text-navy-500">Manifest reference (CID)</dt><dd><HashValue value={m.evidenceCID} label="CID" /></dd></div>
                    <div className="flex flex-wrap items-center gap-2"><dt className="text-navy-500">Manifest SHA-256</dt><dd><HashValue value={m.evidenceHash} label="hash" /></dd></div>
                    {evidence?.submitTxHash && <div className="flex flex-wrap items-center gap-2"><dt className="text-navy-500">Submission transaction</dt><dd><TxLink hash={evidence.submitTxHash} /></dd></div>}
                    {m.evidenceUrl && <a href={m.evidenceUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-accent-700 underline">Open manifest JSON</a>}
                  </dl>
                  {evidence ? (
                    <>
                      {evidence.note && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className="font-medium">NGO note:</span> {evidence.note}</p>}
                      <EvidenceFiles evidence={evidence} />
                      <div className="grid gap-3 sm:grid-cols-2">
                        {evidence.files.filter((f) => f.mime.startsWith("image/") && f.url).map((f) => (
                          <a key={f.ref} href={f.url!} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-slate-200">
                            <img src={f.url!} alt={f.name} className="h-48 w-full bg-slate-50 object-contain" loading="lazy" />
                          </a>
                        ))}
                      </div>
                      <div className="space-y-2 border-t border-slate-100 pt-4">
                        <Button variant="outline" size="sm" onClick={() => void checkIntegrity()} loading={checking}>
                          <ShieldCheck className="size-4" /> Verify file hashes against the chain
                        </Button>
                        {integrityError && <Alert tone="error">{integrityError}</Alert>}
                        {integrity && (
                          <Alert tone={integrity.allMatch ? "success" : "error"} title={integrity.allMatch ? "Evidence matches the on-chain hash" : "Integrity check failed"}>
                            <ul className="mt-1 space-y-0.5 text-xs">
                              <li>Manifest: {integrity.manifest.match ? "✓ hash matches" : "✗ mismatch or unavailable"}</li>
                              <li>On-chain record points to this evidence: {integrity.isCurrentOnChainEvidence ? "✓" : "✗"}</li>
                              {integrity.files.map((f) => <li key={f.ref}>{f.name}: {f.match ? "✓ hash matches" : "✗ mismatch or unavailable"}</li>)}
                            </ul>
                          </Alert>
                        )}
                      </div>
                    </>
                  ) : (
                    <Alert tone="warning">The off-chain file list for this evidence is not indexed. Use the manifest link above.</Alert>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Campaign" />
            <CardContent>
              <dl className="space-y-3 text-sm">
                <div><dt className="text-xs text-navy-500">NGO</dt><dd><AddressLink address={c.ngo?.address} name={c.ngo?.name} /></dd></div>
                <div><dt className="text-xs text-navy-500">Beneficiary</dt><dd><AddressLink address={c.beneficiary?.address} name={c.beneficiary?.name} /></dd></div>
                <div><dt className="text-xs text-navy-500">Target / donated</dt><dd>{formatEth(c.targetWei)} / {formatEth(c.totalDonatedWei)}</dd></div>
                <div><dt className="text-xs text-navy-500">Milestones released</dt><dd>{c.milestones.filter((x) => x.status === "RELEASED").length} of {c.milestones.length}</dd></div>
              </dl>
              <Link to={`/campaigns/${c.id}/transparency`} className="mt-3 inline-block text-sm font-medium text-accent-700 hover:underline">Full public history →</Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Decision" />
            <CardContent className="space-y-3">
              {m.status === "PENDING_VERIFICATION" && assigned && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="success" onClick={() => setDialog("approve")} loading={tx.busy}><Check className="size-4" /> Approve</Button>
                  <Button variant="danger" onClick={() => setDialog("reject")} disabled={tx.busy}><X className="size-4" /> Reject</Button>
                </div>
              )}
              {m.status === "APPROVED" && <Badge tone="blue">Approved — funds still in escrow</Badge>}
              {m.status === "RELEASED" && <Alert tone="success">Funds released on {formatDate(m.releasedAt, true)}.</Alert>}
              {/* Stays mounted from APPROVED to RELEASED so its confirmation remains visible after the refresh. */}
              {(m.status === "APPROVED" || m.status === "RELEASED") && assigned && (
                <ReleaseButton
                  campaignId={c.id!}
                  milestoneId={mid}
                  amountWei={m.amountWei}
                  escrowWei={c.escrowWei}
                  beneficiary={c.beneficiary?.address}
                  released={m.status === "RELEASED"}
                  onReleased={() => void campaign.reload()}
                />
              )}
              {m.status === "REJECTED" && <Alert tone="error" title="Rejected">{m.rejectionReason}</Alert>}
              {m.status === "PENDING" && <p className="text-sm text-navy-500">Waiting for the NGO to submit evidence.</p>}
              <TxStatusPanel state={tx.state} />
              <p className="flex items-start gap-1.5 text-xs text-navy-500">
                <ShieldAlert className="mt-0.5 size-3.5 shrink-0" /> Decisions are signed by your wallet and recorded permanently on-chain.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={dialog === "approve"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title="Approve this milestone?" description={`Approving allows ${formatEth(m.amountWei)} to be released from escrow to the beneficiary.`}>
          <p className="text-sm text-navy-600">Confirm you have inspected the evidence and it demonstrates: <span className="font-medium">{m.description}</span></p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="success" onClick={() => void approve()}>Approve in MetaMask</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "reject"} onOpenChange={(o) => { if (!o) { setDialog(null); setReasonError(null); } }}>
        <DialogContent title="Reject this milestone" description="The reason is stored on-chain and shown publicly. The NGO can resubmit evidence.">
          <Field label="Reason" htmlFor="reason" required error={reasonError} hint={`${reason.trim().length}/500`}>
            <Textarea id="reason" rows={4} value={reason} onChange={(e) => { setReason(e.target.value); setReasonError(null); }} placeholder="e.g. Receipt total does not match the milestone amount." aria-invalid={!!reasonError} />
          </Field>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => void reject()}>Reject in MetaMask</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
