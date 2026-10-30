import { ExternalLink, FileText, Image as ImageIcon } from "lucide-react";
import type { ReactNode } from "react";
import { formatBytes, formatDate, formatEth } from "@/lib/format";
import type { Evidence, Milestone } from "@/lib/types";
import { HashValue, MilestoneStatusBadge, StorageBadge, TxLink } from "./chain";

export function EvidenceFiles({ evidence }: { evidence: Evidence }) {
  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
      {evidence.files.map((f) => {
        const Icon = f.mime.startsWith("image/") ? ImageIcon : FileText;
        return (
          <li key={f.ref} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
            <Icon className="size-4 shrink-0 text-navy-400" aria-hidden />
            <span className="min-w-0 flex-1 truncate font-medium text-navy-800" title={f.name}>
              {f.name}
            </span>
            <span className="text-xs text-navy-400">{formatBytes(f.size)}</span>
            <span className="text-xs text-navy-400" title={`SHA-256 ${f.sha256}`}>
              sha256 {f.sha256.slice(0, 10)}…
            </span>
            {f.url && (
              <a href={f.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-accent-700 hover:underline">
                Open <ExternalLink className="size-3" />
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function MilestoneList({ milestones, actions }: { milestones: Milestone[]; actions?: (m: Milestone) => ReactNode }) {
  return (
    <ol className="space-y-3">
      {milestones.map((m) => {
        const current = m.evidence?.find((e) => e.manifest.ref === m.evidenceCID && e.manifest.sha256 === m.evidenceHash?.toLowerCase()) ?? m.evidence?.[0];
        return (
          <li key={m.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium tracking-wide text-navy-400 uppercase">Milestone {m.id + 1}</p>
                <p className="mt-0.5 font-medium break-words text-navy-900">{m.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-navy-900">{formatEth(m.amountWei)}</span>
                <MilestoneStatusBadge status={m.status} />
              </div>
            </div>

            {m.status === "REJECTED" && m.rejectionReason && (
              <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
                <span className="font-medium">Verifier's reason:</span> {m.rejectionReason}
              </p>
            )}

            {m.evidenceCID && (
              <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-navy-600">
                  <span className="font-medium text-navy-800">On-chain evidence</span>
                  <StorageBadge isIpfs={m.evidenceIsIpfs} />
                  <span className="inline-flex items-center gap-1">
                    Ref <HashValue value={m.evidenceCID} label="evidence reference" />
                  </span>
                  <span className="inline-flex items-center gap-1">
                    SHA-256 <HashValue value={m.evidenceHash} label="evidence hash" />
                  </span>
                  {m.evidenceUrl && (
                    <a href={m.evidenceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-accent-700 hover:underline">
                      Manifest <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
                {current && current.files.length > 0 && <EvidenceFiles evidence={current} />}
                {current?.note && <p className="text-xs text-navy-600">NGO note: {current.note}</p>}
                {current?.submitTxHash && (
                  <p className="flex items-center gap-1 text-xs text-navy-500">
                    Submission tx <TxLink hash={current.submitTxHash} />
                  </p>
                )}
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="flex flex-wrap gap-x-3 text-xs text-navy-400">
                {m.submittedAt && <span>Submitted {formatDate(m.submittedAt, true)}</span>}
                {m.reviewedAt && <span>Reviewed {formatDate(m.reviewedAt, true)}</span>}
                {m.releasedAt && <span>Released {formatDate(m.releasedAt, true)}</span>}
              </p>
              {actions?.(m)}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
