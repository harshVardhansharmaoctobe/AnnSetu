import { CheckCircle2, ExternalLink, XCircle } from "lucide-react";
import { Link, useParams } from "react-router";
import { AddressLink, CopyButton } from "@/components/chain";
import { EventTimeline } from "@/components/EventTimeline";
import { PageHeader } from "@/components/layout/Layouts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert, ErrorState, LoadingState } from "@/components/ui/feedback";
import { useApi } from "@/hooks/useApi";
import { api } from "@/lib/api";
import { config, explorerTxUrl } from "@/lib/config";

export default function Transaction() {
  const { hash = "" } = useParams();
  const valid = /^0x[0-9a-fA-F]{64}$/.test(hash);
  const tx = useApi(() => api.tx(hash), [hash], { enabled: valid });
  const ext = valid ? explorerTxUrl(hash) : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <PageHeader title="Transaction details" description={`${config.chainName} · decoded TrustChain events`} />
      {!valid ? (
        <Alert tone="error" title="Invalid transaction hash">A transaction hash is 0x followed by 64 hexadecimal characters.</Alert>
      ) : tx.loading ? (
        <LoadingState />
      ) : tx.error ? (
        <Card><ErrorState error={tx.error} onRetry={tx.reload} /></Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-navy-500">Hash</span>
                <code className="font-mono text-xs break-all text-navy-800">{hash}</code>
                <CopyButton value={hash} />
              </div>
              {tx.data!.receipt ? (
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-navy-500">Status (from receipt)</dt>
                    <dd className="mt-0.5">
                      {tx.data!.receipt.status === "success" ? (
                        <Badge tone="emerald"><CheckCircle2 className="size-3" /> Success</Badge>
                      ) : (
                        <Badge tone="rose"><XCircle className="size-3" /> Reverted</Badge>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-navy-500">Block</dt>
                    <dd className="mt-0.5">{tx.data!.receipt.blockNumber}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-navy-500">From</dt>
                    <dd className="mt-0.5"><AddressLink address={tx.data!.receipt.from} /></dd>
                  </div>
                  <div>
                    <dt className="text-xs text-navy-500">To</dt>
                    <dd className="mt-0.5 flex items-center gap-2">
                      <AddressLink address={tx.data!.receipt.to} />
                      {tx.data!.receipt.toTrustChain && <Badge tone="blue">TrustChain contract</Badge>}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-navy-500">Gas used</dt>
                    <dd className="mt-0.5">{Number(tx.data!.receipt.gasUsed).toLocaleString()}</dd>
                  </div>
                </dl>
              ) : (
                <Alert tone="warning">No receipt found on {config.chainName}. The transaction may be pending, on another network, or the RPC is unreachable.</Alert>
              )}
              {ext && (
                <a href={ext} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-accent-700 hover:underline">
                  View on block explorer <ExternalLink className="size-3.5" />
                </a>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader title="TrustChain events in this transaction" />
            <CardContent>
              {tx.data!.events.length === 0 ? (
                <p className="text-sm text-navy-500">No TrustChain events indexed for this transaction.</p>
              ) : (
                <>
                  <EventTimeline events={tx.data!.events} />
                  {tx.data!.events[0].campaignId !== null && (
                    <Link to={`/campaigns/${tx.data!.events[0].campaignId}`} className="text-sm font-medium text-accent-700 hover:underline">
                      Open campaign #{tx.data!.events[0].campaignId} →
                    </Link>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
