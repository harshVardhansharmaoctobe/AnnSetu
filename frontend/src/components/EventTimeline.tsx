import {
  BadgeCheck,
  CircleDollarSign,
  FilePlus2,
  FileUp,
  Flag,
  HandCoins,
  Pause,
  ShieldCheck,
  ShieldX,
  UserCheck,
  UserMinus,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router";
import { formatDate, formatEth, shortAddress } from "@/lib/format";
import type { ChainEvent } from "@/lib/types";
import { TxLink } from "./chain";

interface Described {
  icon: LucideIcon;
  tone: string;
  title: string;
  detail?: string;
}

export function describeEvent(e: ChainEvent): Described {
  const m = e.milestoneId !== null ? `Milestone ${e.milestoneId + 1}` : "";
  const a = e.args as Record<string, string>;
  switch (e.event) {
    case "CampaignCreated":
      return { icon: Flag, tone: "bg-navy-100 text-navy-700", title: "Campaign created", detail: `Target ${formatEth(e.amountWei)} · beneficiary ${shortAddress(e.subject)}` };
    case "MilestoneCreated":
      return { icon: FilePlus2, tone: "bg-slate-100 text-navy-600", title: `${m} defined`, detail: `${formatEth(e.amountWei)} · ${a.description ?? ""}` };
    case "CampaignStatusChanged":
      return {
        icon: Pause,
        tone: "bg-slate-100 text-navy-600",
        title: String(a.active) === "true" ? "Campaign open for donations" : String(a.suspended) === "true" ? "Campaign suspended by admin" : "Campaign closed to donations",
      };
    case "CampaignVerifierChanged":
      return { icon: UserCheck, tone: "bg-slate-100 text-navy-600", title: "Verifier reassigned", detail: `New verifier ${shortAddress(e.subject)}` };
    case "DonationReceived":
      return { icon: HandCoins, tone: "bg-accent-50 text-accent-700", title: `Donation of ${formatEth(e.amountWei)} locked in escrow`, detail: `From ${shortAddress(e.actor)}` };
    case "EvidenceSubmitted":
      return { icon: FileUp, tone: "bg-amber-50 text-amber-700", title: `${m}: evidence submitted`, detail: `By NGO ${shortAddress(e.actor)} · pending verification` };
    case "MilestoneApproved":
      return { icon: ShieldCheck, tone: "bg-emerald-50 text-emerald-700", title: `${m}: approved by verifier`, detail: `Verifier ${shortAddress(e.actor)}` };
    case "MilestoneRejected":
      return { icon: ShieldX, tone: "bg-rose-50 text-rose-700", title: `${m}: rejected by verifier`, detail: `Reason: ${a.reason ?? "—"}` };
    case "FundsReleased":
      return { icon: CircleDollarSign, tone: "bg-emerald-100 text-emerald-800", title: `${m}: ${formatEth(e.amountWei)} released`, detail: `Paid to beneficiary ${shortAddress(e.subject)}` };
    case "NGORegistered":
      return { icon: BadgeCheck, tone: "bg-emerald-50 text-emerald-700", title: "NGO authorised", detail: shortAddress(e.subject) };
    case "VerifierRegistered":
      return { icon: BadgeCheck, tone: "bg-emerald-50 text-emerald-700", title: "Verifier authorised", detail: shortAddress(e.subject) };
    case "NGORevoked":
      return { icon: UserMinus, tone: "bg-rose-50 text-rose-700", title: "NGO access revoked", detail: shortAddress(e.subject) };
    case "VerifierRevoked":
      return { icon: UserMinus, tone: "bg-rose-50 text-rose-700", title: "Verifier access revoked", detail: shortAddress(e.subject) };
    default:
      return { icon: Flag, tone: "bg-slate-100 text-navy-600", title: e.event };
  }
}

export function EventTimeline({ events, showCampaign = false }: { events: ChainEvent[]; showCampaign?: boolean }) {
  return (
    <ol className="relative space-y-0">
      {events.map((e, i) => {
        const d = describeEvent(e);
        const Icon = d.icon;
        return (
          <li key={`${e.txHash}-${e.logIndex}`} className="relative flex gap-3 pb-5">
            {i < events.length - 1 && <span className="absolute top-8 left-4 h-[calc(100%-2rem)] w-px bg-slate-200" aria-hidden />}
            <span className={`relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full ${d.tone}`}>
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-sm font-medium text-navy-900">
                {d.title}
                {showCampaign && e.campaignId !== null && (
                  <Link to={`/campaigns/${e.campaignId}`} className="ml-1.5 text-xs font-normal text-accent-700 hover:underline">
                    Campaign #{e.campaignId}
                  </Link>
                )}
              </p>
              {d.detail && <p className="truncate text-xs text-navy-500">{d.detail}</p>}
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-navy-400">
                <span>{formatDate(e.blockTimestamp, true)}</span>
                <span>· block {e.blockNumber}</span>
                <TxLink hash={e.txHash} />
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
