import { CheckCircle2, Loader2, Wallet, XCircle } from "lucide-react";
import type { TxState } from "@/hooks/useContractTx";
import { cn } from "@/lib/format";
import { TxLink } from "./chain";

/** Shows exactly where a wallet transaction is; never shows success before the receipt confirms it. */
export function TxStatusPanel({ state, successMessage, className }: { state: TxState; successMessage?: string; className?: string }) {
  if (state.phase === "idle") return null;

  const box = {
    signing: "border-accent-100 bg-accent-50 text-accent-700",
    pending: "border-accent-100 bg-accent-50 text-accent-700",
    indexing: "border-emerald-200 bg-emerald-50 text-emerald-800",
    confirmed: "border-emerald-200 bg-emerald-50 text-emerald-800",
    failed: "border-rose-200 bg-rose-50 text-rose-800",
  }[state.phase];

  return (
    <div className={cn("rounded-lg border px-4 py-3 text-sm", box, className)} role={state.phase === "failed" ? "alert" : "status"} aria-live="polite">
      <div className="flex items-start gap-3">
        {state.phase === "signing" && <Wallet className="mt-0.5 size-4 shrink-0" />}
        {(state.phase === "pending" || state.phase === "indexing") && <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />}
        {state.phase === "confirmed" && <CheckCircle2 className="mt-0.5 size-4 shrink-0" />}
        {state.phase === "failed" && <XCircle className="mt-0.5 size-4 shrink-0" />}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium">
            {state.phase === "signing" && `${state.label}: confirm in your wallet…`}
            {state.phase === "pending" && `${state.label}: submitted, waiting for the block to be mined…`}
            {state.phase === "indexing" && `${state.label}: confirmed on-chain in block ${state.blockNumber}. Updating records…`}
            {state.phase === "confirmed" && (successMessage ?? `${state.label}: confirmed on-chain.`)}
            {state.phase === "failed" && `${state.label} failed`}
          </p>
          {state.phase === "failed" && state.error && <p className="break-words">{state.error}</p>}
          {state.phase === "confirmed" && (
            <p className="text-xs opacity-90">
              Block {state.blockNumber}
              {!state.indexed && " · the dashboard will refresh when the indexer catches up"}
            </p>
          )}
          {state.hash && (
            <p className="flex flex-wrap items-center gap-1 text-xs">
              Transaction: <TxLink hash={state.hash} />
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
