import { useParams } from "react-router";
import { CampaignStateBadge } from "@/components/CampaignCard";
import { AddressLink, TxLink } from "@/components/chain";
import { EventTimeline } from "@/components/EventTimeline";
import { FundsSummary } from "@/components/FundsSummary";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui/feedback";
import { useApi } from "@/hooks/useApi";
import { api } from "@/lib/api";
import { formatDate, formatEth } from "@/lib/format";
import { OwnedCampaign } from "./shared";

export default function ManageCampaign() {
  const { id = "" } = useParams();
  const events = useApi(() => api.campaignEvents(id), [id]);

  return (
    <OwnedCampaign>
      {(c) => {
        const next = c.milestones.find((m) => m.status !== "RELEASED");
        return (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Card>
                <CardHeader title="Campaign" action={<CampaignStateBadge campaign={c} />} />
                <CardContent>
                  <dl className="grid gap-4 text-sm sm:grid-cols-2">
                    <div><dt className="text-xs text-navy-500">Beneficiary (fixed)</dt><dd><AddressLink address={c.beneficiary?.address} name={c.beneficiary?.name} /></dd></div>
                    <div><dt className="text-xs text-navy-500">Assigned verifier</dt><dd><AddressLink address={c.verifier?.address} name={c.verifier?.name} /></dd></div>
                    <div><dt className="text-xs text-navy-500">Target</dt><dd className="font-medium">{formatEth(c.targetWei)}</dd></div>
                    <div><dt className="text-xs text-navy-500">Donations close</dt><dd>{formatDate(c.deadline, true)}</dd></div>
                    <div><dt className="text-xs text-navy-500">Donors</dt><dd>{c.donorCount} ({c.donationCount} donations)</dd></div>
                    <div><dt className="text-xs text-navy-500">Created in</dt><dd><TxLink hash={c.createdTxHash} /></dd></div>
                  </dl>
                  {next && (
                    <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                      Next milestone: <span className="font-medium">M{next.id + 1} · {next.description}</span> ({formatEth(next.amountWei)}) —{" "}
                      {next.status === "PENDING" && "submit evidence to request verification."}
                      {next.status === "PENDING_VERIFICATION" && "waiting for the verifier."}
                      {next.status === "APPROVED" && "approved; the verifier or admin can release the funds."}
                      {next.status === "REJECTED" && "rejected; resubmit evidence."}
                    </p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader title="Activity" />
                <CardContent>
                  {events.loading ? <LoadingState /> : events.error ? <ErrorState error={events.error} onRetry={events.reload} /> : <EventTimeline events={events.data!.events} />}
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader title="Funds" description="Escrowed funds are not available to the NGO until released." />
              <CardContent><FundsSummary campaign={c} /></CardContent>
            </Card>
          </div>
        );
      }}
    </OwnedCampaign>
  );
}
