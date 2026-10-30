import { ArrowLeft, Eye } from "lucide-react";
import { Link, useParams } from "react-router";
import { AddressLink, TxLink } from "@/components/chain";
import { EventTimeline } from "@/components/EventTimeline";
import { FundsSummary } from "@/components/FundsSummary";
import { PageHeader } from "@/components/layout/Layouts";
import { buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert, ErrorState, LoadingState } from "@/components/ui/feedback";
import { useApi } from "@/hooks/useApi";
import { api } from "@/lib/api";
import { formatDate, formatEth } from "@/lib/format";

/** One donation: its transaction, and what has happened to the campaign's escrow since. */
export default function DonationDetail() {
  const { txHash = "" } = useParams();
  const data = useApi(async () => {
    const tx = await api.tx(txHash);
    const donation = tx.events.find((e) => e.event === "DonationReceived");
    if (!donation) return { tx, donation: null, campaign: null, after: [] };
    const [campaign, events] = await Promise.all([api.campaign(donation.campaignId!), api.campaignEvents(donation.campaignId!)]);
    const after = events.events.filter(
      (e) => (e.blockNumber > donation.blockNumber || (e.blockNumber === donation.blockNumber && e.logIndex > donation.logIndex)) && e.event !== "MilestoneCreated",
    );
    return { tx, donation, campaign: campaign.campaign, after };
  }, [txHash]);

  if (data.loading) return <LoadingState />;
  if (data.error) return <Card><ErrorState error={data.error} onRetry={data.reload} /></Card>;
  const { tx, donation, campaign, after } = data.data!;

  if (!donation || !campaign) {
    return (
      <div>
        <PageHeader title="Donation details" />
        <Alert tone="warning" title="Not a donation">This transaction has no indexed DonationReceived event.</Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link to="/donor/donations" className="inline-flex items-center gap-1 text-sm text-navy-500 hover:text-navy-800">
        <ArrowLeft className="size-4" /> My donations
      </Link>
      <PageHeader
        title={`${formatEth(donation.amountWei)} to ${campaign.title}`}
        description={`Donated ${formatDate(donation.blockTimestamp, true)}`}
        actions={<Link to={`/campaigns/${campaign.id}/transparency`} className={buttonClass("outline")}><Eye className="size-4" /> Transparency tracker</Link>}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Transaction" />
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-navy-500">Status</dt><dd>{tx.receipt?.status === "success" ? <Badge tone="emerald">Confirmed</Badge> : <Badge tone="amber">Receipt unavailable</Badge>}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-navy-500">Hash</dt><dd><TxLink hash={donation.txHash} /></dd></div>
              <div className="flex justify-between gap-4"><dt className="text-navy-500">Block</dt><dd>{donation.blockNumber}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-navy-500">From</dt><dd><AddressLink address={donation.actor} /></dd></div>
              <div className="flex justify-between gap-4"><dt className="text-navy-500">Held by</dt><dd><AddressLink address={tx.receipt?.to} name="Escrow contract" /></dd></div>
              <div className="flex justify-between gap-4"><dt className="text-navy-500">Beneficiary (on release)</dt><dd><AddressLink address={campaign.beneficiary?.address} name={campaign.beneficiary?.name} /></dd></div>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Campaign funds now" description="Live from the contract" />
          <CardContent>
            <FundsSummary campaign={campaign} showChart={false} />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader title="What happened since your donation" description="Evidence, verification decisions and releases after your transaction." />
        <CardContent>
          {after.length === 0 ? (
            <p className="text-sm text-navy-500">Nothing yet — your donation is held in escrow until a milestone is verified and released.</p>
          ) : (
            <EventTimeline events={after} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
