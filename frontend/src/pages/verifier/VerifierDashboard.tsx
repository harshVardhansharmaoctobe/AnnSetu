import { CircleDollarSign, ClipboardCheck, History } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { TxLink } from "@/components/chain";
import { PageHeader } from "@/components/layout/Layouts";
import { ReleaseButton } from "@/components/ReleaseButton";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { Alert, EmptyState, ErrorState, LoadingState } from "@/components/ui/feedback";
import { useAuth } from "@/context/AuthContext";
import { useApi } from "@/hooks/useApi";
import { api } from "@/lib/api";
import { formatEth, relativeTime } from "@/lib/format";

export default function VerifierDashboard() {
  const { user } = useAuth();
  const [released, setReleased] = useState<{ label: string; hash: string } | null>(null);
  const data = useApi(
    () => Promise.all([api.pendingReviews(), api.awaitingRelease(), api.verificationHistory({ verifier: user!.address })]),
    [user!.address],
  );
  if (data.loading) return <LoadingState />;
  if (data.error) return <Card><ErrorState error={data.error} onRetry={data.reload} /></Card>;
  const [pending, awaiting, history] = data.data!;

  return (
    <div className="space-y-6">
      <PageHeader title="Verifier dashboard" description="Review evidence for the campaigns assigned to your wallet. Every decision is a signed on-chain transaction." />
      {released && (
        <Alert tone="success" title={`${released.label} released to the beneficiary`}>
          <span className="inline-flex items-center gap-1">Transaction <TxLink hash={released.hash} /></span>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Pending reviews" value={pending.items.length} icon={<ClipboardCheck className="size-4" />} tone="amber" />
        <StatCard label="Approved, awaiting release" value={awaiting.items.length} icon={<CircleDollarSign className="size-4" />} tone="blue" />
        <StatCard label="Decisions made" value={history.records.length} hint={`${history.records.filter((r) => r.decision === "REJECTED").length} rejected`} icon={<History className="size-4" />} tone="emerald" />
      </div>

      <Card>
        <CardHeader title="Pending reviews" action={<Link to="/verifier/pending" className="text-sm font-medium text-accent-700 hover:underline">View all</Link>} />
        {pending.items.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="Nothing to review" description="Milestones appear here when an NGO submits evidence for a campaign you verify." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {pending.items.slice(0, 5).map((p) => (
              <li key={`${p.campaignId}-${p.milestoneId}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.campaignTitle} · M{p.milestoneId + 1}</p>
                  <p className="truncate text-xs text-navy-500">{p.description} · {formatEth(p.amountWei)} · submitted {relativeTime(p.submittedAt)}</p>
                </div>
                <Link to={`/verifier/review/${p.campaignId}/${p.milestoneId}`} className={buttonClass("primary", "sm")}>Review</Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Approved milestones awaiting release" description="Release sends the allocation from escrow to the campaign's beneficiary." />
        {awaiting.items.length === 0 ? (
          <EmptyState icon={CircleDollarSign} title="No approved milestones waiting" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {awaiting.items.map((a) => (
              <li key={`${a.campaignId}-${a.milestoneId}`} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{a.campaignTitle} · M{a.milestoneId + 1}</p>
                  <p className="text-xs text-navy-500">{a.description} · escrow {formatEth(a.escrowWei)}</p>
                </div>
                <ReleaseButton size="sm" campaignId={a.campaignId} milestoneId={a.milestoneId} amountWei={a.amountWei} escrowWei={a.escrowWei} beneficiary={a.beneficiary} onReleased={(hash) => {
                    setReleased({ label: `${formatEth(a.amountWei)} for ${a.campaignTitle} · M${a.milestoneId + 1}`, hash });
                    void data.reload();
                  }} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
