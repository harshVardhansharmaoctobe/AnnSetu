import { AlertTriangle, FilePlus2, HandCoins, Landmark, ShieldCheck } from "lucide-react";
import { Link } from "react-router";
import { CampaignStateBadge } from "@/components/CampaignCard";
import { DemoBadge } from "@/components/chain";
import { PageHeader } from "@/components/layout/Layouts";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState, ProgressBar } from "@/components/ui/feedback";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { useApi } from "@/hooks/useApi";
import { api } from "@/lib/api";
import { formatEth, percent } from "@/lib/format";

export default function NgoDashboard() {
  const { data, error, loading, reload } = useApi(() => api.myCampaigns(), []);
  if (loading) return <LoadingState />;
  if (error) return <Card><ErrorState error={error} onRetry={reload} /></Card>;

  const all = data!.campaigns;
  const live = all.filter((c) => c.status === "ONCHAIN");
  const drafts = all.filter((c) => c.status === "DRAFT");
  const sum = (k: "totalDonatedWei" | "escrowWei" | "totalReleasedWei") => live.reduce((s, c) => s + BigInt(c[k]), 0n);
  const todo = live.flatMap((c) =>
    c.milestones.filter((m) => m.status === "PENDING" || m.status === "REJECTED").map((m) => ({ c, m })),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="NGO dashboard"
        description="Your campaigns, funds in escrow and milestones that need evidence."
        actions={<Link to="/ngo/campaigns/new" className={buttonClass("primary")}><FilePlus2 className="size-4" /> Create campaign</Link>}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Campaigns on-chain" value={live.length} icon={<Landmark className="size-4" />} />
        <StatCard label="Total donated" value={formatEth(sum("totalDonatedWei"))} icon={<HandCoins className="size-4" />} />
        <StatCard label="Held in escrow" value={formatEth(sum("escrowWei"))} hint="Not yet available to you" tone="blue" icon={<ShieldCheck className="size-4" />} />
        <StatCard label="Released to beneficiaries" value={formatEth(sum("totalReleasedWei"))} tone="emerald" icon={<ShieldCheck className="size-4" />} />
      </div>

      {todo.length > 0 && (
        <Card>
          <CardHeader title="Milestones needing evidence" description="Submit photos, receipts or documents to request verification." action={<AlertTriangle className="size-4 text-amber-500" />} />
          <ul className="divide-y divide-slate-100">
            {todo.map(({ c, m }) => (
              <li key={`${c.id}-${m.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{c.title} · Milestone {m.id + 1}</p>
                  <p className="truncate text-xs text-navy-500">
                    {m.status === "REJECTED" ? `Rejected: ${m.rejectionReason}` : m.description} · {formatEth(m.amountWei)}
                  </p>
                </div>
                <Link to={`/ngo/campaigns/${c.id}/milestones/${m.id}/evidence`} className={buttonClass(m.status === "REJECTED" ? "danger" : "outline", "sm")}>
                  {m.status === "REJECTED" ? "Resubmit evidence" : "Submit evidence"}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader title="Your campaigns" />
        {live.length === 0 && drafts.length === 0 ? (
          <EmptyState
            icon={Landmark}
            title="No campaigns yet"
            description="Create your first campaign with milestones. Donations are held in escrow until each milestone is verified."
            action={<Link to="/ngo/campaigns/new" className={buttonClass("primary")}>Create campaign</Link>}
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Campaign</TH>
                <TH>Status</TH>
                <TH>Raised</TH>
                <TH>Milestones</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {live.map((c) => (
                <TR key={c.draftId}>
                  <TD>
                    <p className="font-medium">{c.title}</p>
                    <p className="text-xs text-navy-400">#{c.id} <DemoBadge show={c.isDemo} /></p>
                  </TD>
                  <TD><CampaignStateBadge campaign={c} /></TD>
                  <TD className="min-w-44">
                    <p className="text-sm">{formatEth(c.totalDonatedWei)} / {formatEth(c.targetWei)}</p>
                    <ProgressBar value={percent(c.totalDonatedWei, c.targetWei)} tone="blue" className="mt-1" />
                  </TD>
                  <TD className="text-sm">
                    {c.milestones.filter((m) => m.status === "RELEASED").length}/{c.milestones.length} released
                    {c.milestones.some((m) => m.status === "PENDING_VERIFICATION") && <p className="text-xs text-amber-700">Awaiting verifier</p>}
                  </TD>
                  <TD className="text-right">
                    <Link to={`/ngo/campaigns/${c.id}`} className={buttonClass("outline", "sm")}>Manage</Link>
                  </TD>
                </TR>
              ))}
              {drafts.map((c) => (
                <TR key={c.draftId}>
                  <TD>
                    <p className="font-medium">{c.title}</p>
                    <p className="text-xs text-navy-400">Metadata prepared, not yet created on-chain</p>
                  </TD>
                  <TD><CampaignStateBadge campaign={c} /></TD>
                  <TD className="text-sm text-navy-500">Target {formatEth(c.targetWei)}</TD>
                  <TD className="text-sm">{c.milestones.length} planned</TD>
                  <TD className="text-right">
                    <Link to={`/ngo/campaigns/new?draft=${c.draftId}`} className={buttonClass("outline", "sm")}>Publish on-chain</Link>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
