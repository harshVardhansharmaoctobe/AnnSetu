import { ClipboardCheck } from "lucide-react";
import { Link } from "react-router";
import { AddressLink, StorageBadge } from "@/components/chain";
import { PageHeader } from "@/components/layout/Layouts";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/feedback";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { useApi } from "@/hooks/useApi";
import { api } from "@/lib/api";
import { formatDate, formatEth } from "@/lib/format";

export default function PendingReviews() {
  const { data, error, loading, reload } = useApi(() => api.pendingReviews(), []);
  return (
    <div>
      <PageHeader title="Pending reviews" description="Milestones in PENDING_VERIFICATION for campaigns assigned to you, oldest first." />
      <Card>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : data!.items.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="No pending reviews" description="You're all caught up." />
        ) : (
          <Table>
            <THead>
              <tr><TH>Campaign / milestone</TH><TH>Requested</TH><TH>Escrow</TH><TH>NGO</TH><TH>Submitted</TH><TH /></tr>
            </THead>
            <TBody>
              {data!.items.map((p) => (
                <TR key={`${p.campaignId}-${p.milestoneId}`}>
                  <TD>
                    <p className="font-medium">{p.campaignTitle}</p>
                    <p className="text-xs text-navy-500">M{p.milestoneId + 1} · {p.description}</p>
                    {p.evidence && <StorageBadge isIpfs={p.evidence.isIpfs} />}
                  </TD>
                  <TD className="font-medium whitespace-nowrap">{formatEth(p.amountWei)}</TD>
                  <TD className="whitespace-nowrap">{formatEth(p.escrowWei)}</TD>
                  <TD><AddressLink address={p.ngo} /></TD>
                  <TD className="whitespace-nowrap">{formatDate(p.submittedAt, true)}</TD>
                  <TD><Link to={`/verifier/review/${p.campaignId}/${p.milestoneId}`} className={buttonClass("primary", "sm")}>Review</Link></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
