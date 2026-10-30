import { History } from "lucide-react";
import { Link } from "react-router";
import { HashValue, TxLink } from "@/components/chain";
import { PageHeader } from "@/components/layout/Layouts";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/feedback";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { useAuth } from "@/context/AuthContext";
import { useApi } from "@/hooks/useApi";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";

export default function VerificationHistory() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi(() => api.verificationHistory({ verifier: user!.address }), [user!.address]);
  return (
    <div>
      <PageHeader title="Verification history" description="Your approvals and rejections, as recorded by the contract's events." />
      <Card>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : data!.records.length === 0 ? (
          <EmptyState icon={History} title="No decisions yet" />
        ) : (
          <Table>
            <THead><tr><TH>Date</TH><TH>Campaign / milestone</TH><TH>Decision</TH><TH>Evidence hash</TH><TH>Transaction</TH></tr></THead>
            <TBody>
              {data!.records.map((r) => (
                <TR key={r._id}>
                  <TD className="whitespace-nowrap">{formatDate(r.decidedAt, true)}</TD>
                  <TD>
                    <Link to={`/verifier/review/${r.campaignId}/${r.milestoneId}`} className="font-medium text-accent-700 hover:underline">{r.campaignTitle ?? `Campaign #${r.campaignId}`}</Link>
                    <p className="text-xs text-navy-500">M{r.milestoneId + 1} · {r.milestoneDescription}</p>
                  </TD>
                  <TD>
                    <Badge tone={r.decision === "APPROVED" ? "emerald" : "rose"}>{r.decision === "APPROVED" ? "Approved" : "Rejected"}</Badge>
                    {r.reason && <p className="mt-1 max-w-xs text-xs break-words text-navy-500">{r.reason}</p>}
                  </TD>
                  <TD><HashValue value={r.evidenceHash} label="hash" /></TD>
                  <TD><TxLink hash={r.txHash} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
