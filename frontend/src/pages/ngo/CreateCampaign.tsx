import { CheckCircle2, ImagePlus, Plus, Rocket, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { HashValue, StorageBadge } from "@/components/chain";
import { PageHeader } from "@/components/layout/Layouts";
import { TxStatusPanel } from "@/components/TxStatusPanel";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert, LoadingState } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useAuth } from "@/context/AuthContext";
import { useApi } from "@/hooks/useApi";
import { useContractTx } from "@/hooks/useContractTx";
import { api, type DraftResponse } from "@/lib/api";
import { formatEth } from "@/lib/format";
import { hasErrors, parseEthInput, sumMilestones, validateCampaignForm, type CampaignFormErrors, type CampaignFormValues } from "@/lib/validation";

const EMPTY: CampaignFormValues = {
  title: "",
  description: "",
  beneficiary: "",
  verifier: "",
  target: "",
  endDate: "",
  milestones: [
    { description: "", amount: "" },
    { description: "", amount: "" },
  ],
};

/** Step 1: validate + upload metadata (cover image + JSON) to IPFS. Step 2: NGO signs createCampaign. */
export default function CreateCampaign() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const resumeId = params.get("draft");
  const tx = useContractTx();
  const verifiers = useApi(() => api.verifiers(), []);

  const [values, setValues] = useState<CampaignFormValues>(EMPTY);
  const [cover, setCover] = useState<File | null>(null);
  const [errors, setErrors] = useState<CampaignFormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftResponse | null>(null);

  // Resume a draft whose metadata was prepared but whose transaction never happened.
  const resume = useApi(() => api.myCampaigns(), [resumeId], { enabled: !!resumeId });
  useEffect(() => {
    const d = resume.data?.campaigns.find((c) => c.draftId === resumeId && c.status === "DRAFT");
    if (!d || !d.metadata) return;
    setDraft({
      draftId: d.draftId,
      metadata: { ref: d.metadata.ref, url: d.metadata.url, isIpfs: d.metadata.isIpfs, provider: d.metadata.isIpfs ? "ipfs" : "local" },
      contractArgs: {
        title: d.title,
        metadataCID: d.metadata.ref,
        beneficiary: d.beneficiary!.address,
        verifier: d.verifier!.address,
        targetAmount: d.targetWei,
        deadline: Math.floor(new Date(d.deadline!).getTime() / 1000),
        milestoneDescriptions: d.milestones.map((m) => m.description),
        milestoneAmounts: d.milestones.map((m) => m.amountWei),
      },
    });
  }, [resume.data, resumeId]);

  const live = useMemo(() => validateCampaignForm(values, user?.address), [values, user?.address]);
  const shown = submitted ? live : errors;
  const targetWei = parseEthInput(values.target).wei;
  const allocated = sumMilestones(values.milestones);
  const minDate = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

  const set = <K extends keyof CampaignFormValues>(k: K, v: CampaignFormValues[K]) => setValues((s) => ({ ...s, [k]: v }));
  const setMilestone = (i: number, k: "description" | "amount", v: string) =>
    setValues((s) => ({ ...s, milestones: s.milestones.map((m, j) => (j === i ? { ...m, [k]: v } : m)) }));

  const prepare = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setErrors(live);
    if (cover && !["image/jpeg", "image/png", "image/webp"].includes(cover.type)) {
      setPrepareError("Cover image must be JPG, PNG or WEBP");
      return;
    }
    if (hasErrors(live)) return;
    setPreparing(true);
    setPrepareError(null);
    try {
      const form = new FormData();
      form.set("title", values.title.trim());
      form.set("description", values.description.trim());
      form.set("beneficiary", values.beneficiary.trim());
      form.set("verifier", values.verifier);
      form.set("targetEth", values.target.trim());
      form.set("endDate", new Date(`${values.endDate}T23:59:59`).toISOString());
      form.set("milestones", JSON.stringify(values.milestones.map((m) => ({ description: m.description.trim(), amountEth: m.amount.trim() }))));
      if (cover) form.set("cover", cover);
      setDraft(await api.createDraft(form));
    } catch (err) {
      setPrepareError(err instanceof Error ? err.message : String(err));
    } finally {
      setPreparing(false);
    }
  };

  const publish = async () => {
    if (!draft) return;
    const a = draft.contractArgs;
    const receipt = await tx.run("Create campaign", (c) =>
      c.createCampaign(a.title, a.metadataCID, a.beneficiary, a.verifier, a.targetAmount, a.deadline, a.milestoneDescriptions, a.milestoneAmounts),
    );
    if (!receipt) return;
    // Find the new campaign id from the CampaignCreated log.
    const { Interface } = await import("ethers");
    const abi = (await import("@/contracts/TrustChain.abi.json")).default;
    const iface = new Interface(abi);
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed?.name === "CampaignCreated") {
          navigate(`/ngo/campaigns/${parsed.args.campaignId}`, { replace: true });
          return;
        }
      } catch {
        /* not a TrustChain log */
      }
    }
  };

  if (resumeId && resume.loading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <PageHeader title="Create campaign" description="Define the target and milestones. Allocations must add up exactly to the target." />

      <ol className="flex flex-wrap gap-2 text-sm">
        <li className={`rounded-full px-3 py-1 ${draft ? "bg-emerald-50 text-emerald-700" : "bg-navy-900 text-white"}`}>1 · Details & metadata upload</li>
        <li className={`rounded-full px-3 py-1 ${draft ? "bg-navy-900 text-white" : "bg-slate-100 text-navy-500"}`}>2 · Create on-chain (MetaMask)</li>
      </ol>

      {!draft ? (
        <form onSubmit={prepare} noValidate className="space-y-6">
          <Card>
            <CardHeader title="Campaign details" />
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Field label="Title" htmlFor="title" required error={shown.title} className="md:col-span-2" hint="Stored on-chain (max 120 characters).">
                <Input id="title" value={values.title} onChange={(e) => set("title", e.target.value)} maxLength={120} aria-invalid={!!shown.title} />
              </Field>
              <Field label="Description" htmlFor="description" required error={shown.description} className="md:col-span-2" hint="Stored in the campaign metadata JSON.">
                <Textarea id="description" rows={5} value={values.description} onChange={(e) => set("description", e.target.value)} maxLength={5000} aria-invalid={!!shown.description} />
              </Field>
              <Field label="Beneficiary wallet" htmlFor="beneficiary" required error={shown.beneficiary} hint="Released funds go only to this address. It cannot be changed later.">
                <Input id="beneficiary" placeholder="0x…" value={values.beneficiary} onChange={(e) => set("beneficiary", e.target.value)} className="font-mono" aria-invalid={!!shown.beneficiary} />
              </Field>
              <Field label="Independent verifier" htmlFor="verifier" required error={shown.verifier ?? (verifiers.error ? verifiers.error.message : null)} hint="Only this verifier can approve your milestones.">
                <Select id="verifier" value={values.verifier} onChange={(e) => set("verifier", e.target.value)} aria-invalid={!!shown.verifier} disabled={verifiers.loading}>
                  <option value="">{verifiers.loading ? "Loading verifiers…" : "Select an authorised verifier"}</option>
                  {verifiers.data?.accounts.map((v) => (
                    <option key={v.address} value={v.address}>
                      {(v.organization ?? v.name ?? "Unnamed verifier") + ` · ${v.address.slice(0, 8)}…`}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Target (ETH)" htmlFor="target" required error={shown.target}>
                <Input id="target" inputMode="decimal" placeholder="0.3" value={values.target} onChange={(e) => set("target", e.target.value)} aria-invalid={!!shown.target} />
              </Field>
              <Field label="Donations close on" htmlFor="endDate" required error={shown.endDate}>
                <Input id="endDate" type="date" min={minDate} value={values.endDate} onChange={(e) => set("endDate", e.target.value)} aria-invalid={!!shown.endDate} />
              </Field>
              <Field label="Cover image (optional)" htmlFor="cover" className="md:col-span-2" hint="JPG, PNG or WEBP. Uploaded to the configured IPFS provider.">
                <label htmlFor="cover" className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm text-navy-600 hover:bg-slate-50">
                  <ImagePlus className="size-4" /> {cover ? `${cover.name}` : "Choose an image"}
                </label>
                <input id="cover" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => setCover(e.target.files?.[0] ?? null)} />
              </Field>
              {verifiers.data && verifiers.data.accounts.length === 0 && (
                <Alert tone="warning" className="md:col-span-2">No verifiers are authorised yet. Ask the platform admin to register one.</Alert>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader
              title="Milestones"
              description="Each milestone's allocation is released only after its evidence is approved."
              action={
                <p className={`text-sm font-medium ${targetWei !== null && allocated === targetWei ? "text-emerald-700" : "text-amber-700"}`}>
                  Allocated {formatEth(allocated, 6)} / {targetWei !== null ? formatEth(targetWei, 6) : "—"}
                </p>
              }
            />
            <CardContent className="space-y-3">
              {values.milestones.map((m, i) => (
                <div key={i} className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_9rem_auto] sm:items-start">
                  <Field label={`Milestone ${i + 1}`} htmlFor={`m-${i}-d`} error={shown.milestoneRows?.[i]?.description}>
                    <Input id={`m-${i}-d`} placeholder="e.g. Foundation and site preparation" value={m.description} onChange={(e) => setMilestone(i, "description", e.target.value)} maxLength={280} />
                  </Field>
                  <Field label="ETH" htmlFor={`m-${i}-a`} error={shown.milestoneRows?.[i]?.amount}>
                    <Input id={`m-${i}-a`} inputMode="decimal" placeholder="0.1" value={m.amount} onChange={(e) => setMilestone(i, "amount", e.target.value)} />
                  </Field>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="sm:mt-6"
                    aria-label={`Remove milestone ${i + 1}`}
                    disabled={values.milestones.length === 1}
                    onClick={() => set("milestones", values.milestones.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              {shown.milestones && <Alert tone="error">{shown.milestones}</Alert>}
              <Button variant="outline" size="sm" disabled={values.milestones.length >= 20} onClick={() => set("milestones", [...values.milestones, { description: "", amount: "" }])}>
                <Plus className="size-4" /> Add milestone
              </Button>
            </CardContent>
          </Card>

          {prepareError && <Alert tone="error" title="Could not prepare the campaign">{prepareError}</Alert>}
          <div className="flex justify-end gap-2">
            <Link to="/ngo" className={buttonClass("outline")}>Cancel</Link>
            <Button type="submit" loading={preparing}>Upload metadata & continue</Button>
          </div>
        </form>
      ) : (
        <Card>
          <CardHeader title="Create the campaign on-chain" description="Your wallet signs TrustChain.createCampaign with exactly these values." />
          <CardContent className="space-y-4">
            <Alert tone="success" title="Metadata stored">
              <span className="inline-flex flex-wrap items-center gap-2">
                Reference <HashValue value={draft.metadata.ref} label="metadata reference" /> <StorageBadge isIpfs={draft.metadata.isIpfs} />
                {draft.metadata.url && <a className="underline" href={draft.metadata.url} target="_blank" rel="noreferrer">View JSON</a>}
              </span>
            </Alert>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-navy-500">Title</dt><dd className="font-medium">{draft.contractArgs.title}</dd></div>
              <div><dt className="text-navy-500">Target</dt><dd className="font-medium">{formatEth(draft.contractArgs.targetAmount, 18)}</dd></div>
              <div><dt className="text-navy-500">Beneficiary</dt><dd className="font-mono text-xs break-all">{draft.contractArgs.beneficiary}</dd></div>
              <div><dt className="text-navy-500">Verifier</dt><dd className="font-mono text-xs break-all">{draft.contractArgs.verifier}</dd></div>
              <div><dt className="text-navy-500">Donations close</dt><dd>{new Date(draft.contractArgs.deadline * 1000).toLocaleString()}</dd></div>
            </dl>
            <ol className="space-y-1 text-sm">
              {draft.contractArgs.milestoneDescriptions.map((d, i) => (
                <li key={i} className="flex justify-between gap-3 rounded-md bg-slate-50 px-3 py-2">
                  <span><span className="text-navy-400">{i + 1}.</span> {d}</span>
                  <span className="font-medium whitespace-nowrap">{formatEth(draft.contractArgs.milestoneAmounts[i], 18)}</span>
                </li>
              ))}
            </ol>
            <TxStatusPanel state={tx.state} successMessage="Campaign created on-chain. Opening it…" />
            {tx.state.phase === "confirmed" ? (
              <p className="flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 className="size-4" /> Done</p>
            ) : (
              <div className="flex flex-wrap justify-end gap-2">
                {!resumeId && (
                  <Button variant="outline" onClick={() => { setDraft(null); tx.reset(); }} disabled={tx.busy}>
                    Back and edit
                  </Button>
                )}
                <Button variant="success" onClick={() => void publish()} loading={tx.busy}>
                  <Rocket className="size-4" /> {tx.state.phase === "failed" ? "Try again" : "Create campaign in MetaMask"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
