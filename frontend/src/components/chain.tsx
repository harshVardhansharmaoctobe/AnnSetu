import { Check, Copy, ExternalLink, HardDrive, Globe2, FlaskConical } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { explorerAddressUrl, explorerTxUrl } from "@/lib/config";
import { cn, shortAddress, shortHash } from "@/lib/format";
import type { MilestoneStatus } from "@/lib/types";
import { Badge, type BadgeTone } from "./ui/badge";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      className="rounded p-0.5 text-navy-400 hover:bg-slate-100 hover:text-navy-700"
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
    >
      {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
    </button>
  );
}

export function AddressLink({ address, name, className }: { address?: string | null; name?: string | null; className?: string }) {
  if (!address) return <span className="text-navy-400">—</span>;
  const ext = explorerAddressUrl(address);
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1 align-middle", className)}>
      {name && <span className="truncate font-medium text-navy-800">{name}</span>}
      <span className={cn("font-mono text-xs text-navy-600", name && "text-navy-400")} title={address}>
        {shortAddress(address)}
      </span>
      <CopyButton value={address} label="Copy address" />
      {ext && (
        <a href={ext} target="_blank" rel="noreferrer" className="text-navy-400 hover:text-accent-600" title="View on block explorer">
          <ExternalLink className="size-3.5" />
        </a>
      )}
    </span>
  );
}

export function TxLink({ hash, className }: { hash?: string | null; className?: string }) {
  if (!hash) return <span className="text-navy-400">—</span>;
  const ext = explorerTxUrl(hash);
  return (
    <span className={cn("inline-flex items-center gap-1 align-middle", className)}>
      <Link to={`/tx/${hash}`} className="font-mono text-xs text-accent-700 hover:underline" title={hash}>
        {shortHash(hash)}
      </Link>
      <CopyButton value={hash} label="Copy transaction hash" />
      {ext && (
        <a href={ext} target="_blank" rel="noreferrer" className="text-navy-400 hover:text-accent-600" title="View on block explorer">
          <ExternalLink className="size-3.5" />
        </a>
      )}
    </span>
  );
}

const MILESTONE_BADGES: Record<MilestoneStatus, { tone: BadgeTone; label: string }> = {
  DRAFT: { tone: "neutral", label: "Draft" },
  PENDING: { tone: "neutral", label: "Awaiting evidence" },
  PENDING_VERIFICATION: { tone: "amber", label: "Pending verification" },
  APPROVED: { tone: "blue", label: "Approved · awaiting release" },
  REJECTED: { tone: "rose", label: "Rejected" },
  RELEASED: { tone: "emerald", label: "Funds released" },
};

export function MilestoneStatusBadge({ status }: { status: MilestoneStatus }) {
  const b = MILESTONE_BADGES[status];
  return <Badge tone={b.tone}>{b.label}</Badge>;
}

/** Makes it impossible to mistake local development storage for IPFS. */
export function StorageBadge({ isIpfs }: { isIpfs: boolean | null | undefined }) {
  if (isIpfs === null || isIpfs === undefined) return null;
  return isIpfs ? (
    <Badge tone="blue" title="Pinned on IPFS">
      <Globe2 className="size-3" /> IPFS
    </Badge>
  ) : (
    <Badge tone="amber" title="Stored on the TrustChain API server for local development. Not on IPFS.">
      <HardDrive className="size-3" /> Local dev storage · not IPFS
    </Badge>
  );
}

export function DemoBadge({ show = true }: { show?: boolean }) {
  if (!show) return null;
  return (
    <Badge tone="violet" title="Seeded demonstration data">
      <FlaskConical className="size-3" /> Demo data
    </Badge>
  );
}

export function HashValue({ value, label }: { value?: string | null; label?: string }) {
  if (!value) return <span className="text-navy-400">—</span>;
  return (
    <span className="inline-flex max-w-full items-center gap-1">
      <code className="truncate rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-navy-700" title={value}>
        {value.length > 26 ? `${value.slice(0, 14)}…${value.slice(-8)}` : value}
      </code>
      <CopyButton value={value} label={label ? `Copy ${label}` : "Copy"} />
    </span>
  );
}
