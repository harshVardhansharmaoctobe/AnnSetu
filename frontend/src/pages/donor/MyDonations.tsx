import { HandCoins } from "lucide-react";
import { Link } from "react-router";
import { TxLink } from "@/components/chain";
import { PageHeader } from "@/components/layout/Layouts";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState, ProgressBar } from "@/components/ui/feedback";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { useAuth } from "@/context/AuthContext";
import { useApi } from "@/hooks/useApi";
import { api } from "@/lib/api";
import { formatDate, formatEth, percent } from "@/lib/format";

export default function MyDonations() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi(() => api.donations(user!.address), [user!.address]);

  if (loading) return <LoadingState />;
  if (error) return <Card><ErrorState error={error} onRetry={reload} /></Card>;
  const { events, totals } = data!;
  const titles = new Map(totals.map((t) => [t.campaignId, t.title]));

  return (
    <div className="space-y-6">
      <PageHeader title="My donations" description="Every donation is a confirmed transaction from your wallet to the escrow contract." />
      {events.length === 0 ? (
        <Card>
          <EmptyState icon={HandCoins} title="No donations yet" action={<Link to="/campaigns" className={buttonClass("primary")}>Browse campaigns</Link>} />
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader title="By campaign" description="Your total per campaign is read live from the contract." />
            <Table>
              <THead>
                <tr>
                  <TH>Campaign</TH>
                  <TH>You contributed</TH>
                  <TH>Campaign released</TH>
                  <TH>Milestones</TH>
                </tr>
              </THead>
              <TBody>
                {totals.map((t) => (
                  <TR key={t.campaignId}>
                    <TD>
                      <Link to={`/campaigns/${t.campaignId}/transparency`} className="font-medium text-accent-700 hover:underline">{t.title}</Link>
                    </TD>
                    <TD className="font-medium">
                      {formatEth(t.contributedWei ?? t.indexedContributedWei)}
                      {t.contributedWei === null && <span className="ml-1 text-xs text-amber-700">(indexed; chain unreachable)</span>}
                    </TD>
                    <TD className="min-w-40">
                      <p className="text-sm">{formatEth(t.totalReleasedWei)} of {formatEth(t.totalDonatedWei)} donated</p>
                      <ProgressBar value={percent(t.totalReleasedWei, t.totalDonatedWei)} className="mt-1" />
                    </TD>
                    <TD>{t.milestonesReleased}/{t.milestoneCount} released</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <Card>
            <CardHeader title="Donation transactions" />
            <Table>
              <THead>
                <tr>
                  <TH>Date</TH>
                  <TH>Campaign</TH>
                  <TH>Amount</TH>
                  <TH>Transaction</TH>
                  <TH />
                </tr>
              </THead>
              <TBody>
                {events.map((e) => (
                  <TR key={e._id}>
                    <TD className="whitespace-nowrap">{formatDate(e.blockTimestamp, true)}</TD>
                    <TD>{titles.get(e.campaignId!) ?? `Campaign #${e.campaignId}`}</TD>
                    <TD className="font-medium">{formatEth(e.amountWei)}</TD>
                    <TD><TxLink hash={e.txHash} /></TD>
                    <TD>
                      <Link to={`/donor/donations/${e.txHash}`} className="text-sm font-medium text-accent-700 hover:underline">Details</Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
