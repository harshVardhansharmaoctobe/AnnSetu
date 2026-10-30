import { Clock, HeartHandshake, Users } from "lucide-react";
import { Link } from "react-router";
import { formatDate, formatEth, percent } from "@/lib/format";
import type { Campaign } from "@/lib/types";
import { Badge } from "./ui/badge";
import { DemoBadge } from "./chain";

export function CampaignStateBadge({ campaign }: { campaign: Campaign }) {
  if (campaign.status === "DRAFT") return <Badge tone="neutral">Draft · not on-chain</Badge>;
  if (campaign.suspended) return <Badge tone="rose">Suspended</Badge>;
  if (campaign.ended) return <Badge tone="neutral">Donations closed</Badge>;
  if (!campaign.active) return <Badge tone="amber">Not accepting donations</Badge>;
  return <Badge tone="emerald">Accepting donations</Badge>;
}

export function CampaignCover({ campaign, className = "h-40" }: { campaign: Campaign; className?: string }) {
  if (campaign.coverImage?.url) {
    return <img src={campaign.coverImage.url} alt="" className={`w-full object-cover ${className}`} loading="lazy" />;
  }
  return (
    <div className={`flex w-full items-center justify-center bg-gradient-to-br from-navy-50 to-accent-50 ${className}`}>
      <HeartHandshake className="size-10 text-navy-300" aria-hidden />
    </div>
  );
}

export function CampaignCard({ campaign }: { campaign: Campaign }) {
  const released = campaign.milestones.filter((m) => m.status === "RELEASED").length;
  return (
    <Link
      to={`/campaigns/${campaign.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-navy-200 hover:shadow-md"
    >
      <CampaignCover campaign={campaign} />
      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap gap-1.5">
          <CampaignStateBadge campaign={campaign} />
          <DemoBadge show={campaign.isDemo} />
        </div>
        <h3 className="mt-2 line-clamp-2 font-semibold text-navy-900 group-hover:text-accent-700">{campaign.title}</h3>
        <p className="mt-0.5 truncate text-sm text-navy-500">{campaign.ngo?.name ?? campaign.ngo?.organization ?? "NGO"}</p>

        <div className="mt-auto pt-4">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-semibold text-navy-900">{formatEth(campaign.totalDonatedWei)}</span>
            <span className="text-navy-500">of {formatEth(campaign.targetWei)}</span>
          </div>
          <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="bg-emerald-600" style={{ width: `${percent(campaign.totalReleasedWei, campaign.targetWei)}%` }} />
            <div className="bg-accent-500" style={{ width: `${percent(campaign.escrowWei, campaign.targetWei)}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-navy-500">
            <span className="inline-flex items-center gap-1">
              <Users className="size-3.5" /> {campaign.donorCount} donor{campaign.donorCount === 1 ? "" : "s"}
            </span>
            <span>
              {released}/{campaign.milestones.length} milestones released
            </span>
            {campaign.deadline && (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" /> {campaign.ended ? "Ended" : "Ends"} {formatDate(campaign.deadline)}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
