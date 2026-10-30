import { HandCoins } from "lucide-react";
import { useParams } from "react-router";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AddressLink, TxLink } from "@/components/chain";
import { Card, CardContent, CardHeader, StatCard } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/feedback";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { useApi } from "@/hooks/useApi";
import { api } from "@/lib/api";
import { formatDate, formatEth, weiToEthNumber } from "@/lib/format";
import { OwnedCampaign } from "./shared";

export default function CampaignDonations() {
  const { id = "" } = useParams();
  const donations = useApi(() => api.transactions({ campaignId: Number(id), event: "DonationReceived", limit: 500 }), [id]);

  return (
    <OwnedCampaign>
      {(c) => {
        if (donations.loading) return <LoadingState />;
        if (donations.error) return <Card><ErrorState error={donations.error} onRetry={donations.reload} /></Card>;
        const list = donations.data!.events;
        let running = 0;
        const series = [...list].reverse().map((d) => {
          running += weiToEthNumber(d.amountWei ?? "0");
          return { date: formatDate(d.blockTimestamp), total: Number(running.toFixed(6)) };
        });
        return (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard label="Donated" value={formatEth(c.totalDonatedWei)} icon={<HandCoins className="size-4" />} />
              <StatCard label="Donors" value={c.donorCount} hint={`${c.donationCount} transactions`} />
              <StatCard label="Held in escrow" value={formatEth(c.escrowWei)} tone="blue" />
            </div>
            {list.length === 0 ? (
              <Card><EmptyState icon={HandCoins} title="No donations yet" description="Share the campaign page with donors." /></Card>
            ) : (
              <>
                <Card>
                  <CardHeader title="Cumulative donations (ETH)" />
                  <CardContent className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={series} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#4b628c" }} />
                        <YAxis tick={{ fontSize: 11, fill: "#4b628c" }} />
                        <Tooltip formatter={(v) => `${v} ETH`} />
                        <Area type="monotone" dataKey="total" stroke="#3b76f6" fill="#dbe8fe" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader title="Donation transactions" />
                  <Table>
                    <THead><tr><TH>Date</TH><TH>Donor</TH><TH>Amount</TH><TH>Transaction</TH></tr></THead>
                    <TBody>
                      {list.map((d) => (
                        <TR key={d._id}>
                          <TD className="whitespace-nowrap">{formatDate(d.blockTimestamp, true)}</TD>
                          <TD><AddressLink address={d.actor} /></TD>
                          <TD className="font-medium">{formatEth(d.amountWei)}</TD>
                          <TD><TxLink hash={d.txHash} /></TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </Card>
              </>
            )}
          </div>
        );
      }}
    </OwnedCampaign>
  );
}
