import { CheckCircle2, FileUp, Send, Upload, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { HashValue, StorageBadge } from "@/components/chain";
import { EvidenceFiles } from "@/components/MilestoneList";
import { TxStatusPanel } from "@/components/TxStatusPanel";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Field, Textarea } from "@/components/ui/form";
import { useApi } from "@/hooks/useApi";
import { useContractTx } from "@/hooks/useContractTx";
import { api } from "@/lib/api";
import { formatBytes, formatEth } from "@/lib/format";
import type { Evidence } from "@/lib/types";
import { validateEvidenceFiles } from "@/lib/validation";
import { OwnedCampaign } from "./shared";

/** Step 1: upload files → IPFS (CID + SHA-256). Step 2: NGO signs submitEvidence(campaign, milestone, CID, hash). */
export default function SubmitEvidence() {
  const { mid = "0" } = useParams();
  const milestoneId = Number(mid);
  const navigate = useNavigate();
  const tx = useContractTx();
  const storage = useApi(() => api.chainStatus(), []);
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<Evidence | null>(null);

  return (
    <OwnedCampaign>
      {(c, reload) => {
        const m = c.milestones[milestoneId];
        if (!m) return <Alert tone="error">Milestone not found.</Alert>;
        const canSubmit = m.status === "PENDING" || m.status === "REJECTED";

        const upload = async (e: FormEvent) => {
          e.preventDefault();
          const err = validateEvidenceFiles(files);
          setFileError(err);
          if (err) return;
          if (note.length > 1000) return;
          setUploading(true);
          setUploadError(null);
          try {
            const form = new FormData();
            form.set("campaignId", String(c.id));
            form.set("milestoneId", String(milestoneId));
            form.set("note", note.trim());
            files.forEach((f) => form.append("files", f));
            setEvidence((await api.uploadEvidence(form)).evidence);
          } catch (err) {
            setUploadError(err instanceof Error ? err.message : String(err));
          } finally {
            setUploading(false);
          }
        };

        const submitOnChain = async () => {
          if (!evidence) return;
          const receipt = await tx.run("Submit evidence", (ct) => ct.submitEvidence(c.id, milestoneId, evidence.manifest.ref, evidence.manifest.sha256));
          if (receipt) reload();
        };

        return (
          <div className="space-y-6">
            <Card>
              <CardHeader title={`Milestone ${milestoneId + 1}: ${m.description}`} description={`Allocation ${formatEth(m.amountWei)}`} />
              <CardContent className="space-y-3">
                {m.status === "REJECTED" && m.rejectionReason && (
                  <Alert tone="error" title="Previous submission was rejected">{m.rejectionReason}</Alert>
                )}
                {!canSubmit && tx.state.phase !== "confirmed" && (
                  <Alert tone="info">This milestone is {m.status.toLowerCase().replace("_", " ")}, so new evidence cannot be submitted.</Alert>
                )}
                {storage.data && !storage.data.storage.isIpfs && (
                  <Alert tone="warning" title="Local development storage">
                    IPFS credentials are not configured on the server. Files will be stored on the API server with a local:// reference — this is NOT IPFS and is labelled as such everywhere.
                  </Alert>
                )}
              </CardContent>
            </Card>

            {tx.state.phase === "confirmed" ? (
              <Card>
                <CardContent className="space-y-4 py-6">
                  <p className="flex items-center gap-2 font-medium text-emerald-700"><CheckCircle2 className="size-5" /> Evidence recorded on-chain — milestone is now pending verification.</p>
                  <TxStatusPanel state={tx.state} />
                  <div className="flex gap-2">
                    <Button onClick={() => navigate(`/ngo/campaigns/${c.id}/milestones`)}>Back to milestones</Button>
                  </div>
                </CardContent>
              </Card>
            ) : canSubmit && !evidence ? (
              <Card>
                <CardHeader title="Step 1 · Upload evidence" description="Photos, receipts and supporting documents. JPG, PNG, WEBP or PDF, up to 10 MB each, max 6 files." />
                <CardContent>
                  <form onSubmit={upload} noValidate className="space-y-4">
                    <label htmlFor="files" className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-4 py-8 text-center hover:bg-slate-50">
                      <Upload className="size-6 text-navy-400" />
                      <span className="text-sm font-medium">Choose files</span>
                      <span className="text-xs text-navy-500">Each file is hashed (SHA-256) and stored; a manifest listing them is what goes on-chain.</span>
                    </label>
                    <input
                      id="files"
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      className="sr-only"
                      onChange={(e) => {
                        const list = [...files, ...Array.from(e.target.files ?? [])];
                        setFiles(list);
                        setFileError(validateEvidenceFiles(list));
                        e.target.value = "";
                      }}
                    />
                    {files.length > 0 && (
                      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                        {files.map((f, i) => (
                          <li key={`${f.name}-${i}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                            <span className="min-w-0 flex-1 truncate">{f.name}</span>
                            <span className="text-xs text-navy-400">{formatBytes(f.size)}</span>
                            <button type="button" className="rounded p-1 text-navy-400 hover:bg-slate-100" aria-label={`Remove ${f.name}`} onClick={() => {
                              const list = files.filter((_, j) => j !== i);
                              setFiles(list);
                              setFileError(list.length ? validateEvidenceFiles(list) : null);
                            }}>
                              <X className="size-4" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {fileError && <Alert tone="error">{fileError}</Alert>}
                    <Field label="Note for the verifier (optional)" htmlFor="note" error={note.length > 1000 ? "At most 1000 characters" : null}>
                      <Textarea id="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Foundation completed 12 Oct; invoice #4411 attached." />
                    </Field>
                    {uploadError && <Alert tone="error" title="Upload failed">{uploadError}</Alert>}
                    <div className="flex justify-end gap-2">
                      <Link to={`/ngo/campaigns/${c.id}/milestones`} className={buttonClass("outline")}>Cancel</Link>
                      <Button type="submit" loading={uploading}><FileUp className="size-4" /> Upload & hash files</Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            ) : evidence ? (
              <Card>
                <CardHeader title="Step 2 · Record evidence on-chain" description="Sign submitEvidence in MetaMask. The manifest reference and hash become part of the milestone's permanent record." />
                <CardContent className="space-y-4">
                  <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
                    <p className="flex flex-wrap items-center gap-2">Manifest reference <HashValue value={evidence.manifest.ref} label="reference" /> <StorageBadge isIpfs={evidence.isIpfs} /></p>
                    <p className="flex flex-wrap items-center gap-2">Manifest SHA-256 <HashValue value={evidence.manifest.sha256} label="hash" /></p>
                    {evidence.manifest.url && <a className="text-xs font-medium text-accent-700 underline" href={evidence.manifest.url} target="_blank" rel="noreferrer">Open manifest</a>}
                  </div>
                  <EvidenceFiles evidence={evidence} />
                  <TxStatusPanel state={tx.state} />
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="outline" disabled={tx.busy} onClick={() => { setEvidence(null); setFiles([]); tx.reset(); }}>Upload different files</Button>
                    <Button variant="success" loading={tx.busy} onClick={() => void submitOnChain()}>
                      <Send className="size-4" /> {tx.state.phase === "failed" ? "Try again" : "Submit evidence in MetaMask"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>
        );
      }}
    </OwnedCampaign>
  );
}
