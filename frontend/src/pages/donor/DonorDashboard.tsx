import { HandCoins, Landmark, ShieldCheck, Wallet } from "lucide-react";
import { Link } from "react-router";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EventTimeline } from "@/components/EventTimeline";
import { PageHeader } from "@/components/layout/Layouts";
import { buttonClass } from "@/components/ui/button";
import { Card, CardContent, CardHeader, StatCard } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/feedback";
import { useAuth } from "@/context/AuthContext";
import { useApi } from "@/hooks/useApi";
import { api } from "@/lib/api";
import { formatEth, weiToEthNumber } from "@/lib/format";

export default function DonorDashboard() {
  const { user } = useAuth();
  const address = user!.address;
  const donations = useApi(() => api.donations(address), [address]);
  const activity = useApi(async () => {
    // Activity on campaigns this donor supports: releases and verifier decisions.
    const d = await api.donations(address);
    const ids = d.totals.map((t) => t.campaignId);
    const lists = await Promise.all(ids.map((id) => api.campaignEvents(id)));
    return lists
      .flatMap((l) => l.events)
      .filter((e) => ["FundsReleased", "MilestoneApproved", "MilestoneRejected", "EvidenceSubmitted"].includes(e.event))
      .sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex)
      .slice(0, 10);
  }, [address]);

  if (donations.loading) return <LoadingState />;
  if (donations.error) return <Card><ErrorState error={donations.error} onRetry={donations.reload} /></Card>;
  const { totals, events } = donations.data!;

  const contributed = totals.reduce((s, t) => s + BigInt(t.contributedWei ?? t.indexedContributedWei), 0n);
  const chart = totals.map((t) => ({
    name: t.title.length > 18 ? `${t.title.slice(0, 18)}…` : t.title,
    "Your donation": weiToEthNumber(t.contributedWei ?? t.indexedContributedWei),
    "Campaign released": weiToEthNumber(t.totalReleasedWei),
  }));

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user!.name}`}
        description="Track where your donations are: in escrow, or released after a verified milestone."
        actions={<Link to="/campaigns" className={buttonClass("primary")}>Find a campaign</Link>}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="You donated" value={formatEth(contributed)} hint="Read from the contract (getDonation)" icon={<HandCoins className="size-4" />} />
        <StatCard label="Donations" value={events.length} hint="Confirmed transactions" icon={<Wallet className="size-4" />} tone="blue" />
        <StatCard label="Campaigns supported" value={totals.length} icon={<Landmark className="size-4" />} tone="emerald" />
      </div>

      {totals.length === 0 ? (
        <Card className="mt-6">
          <EmptyState
            icon={HandCoins}
            title="No donations from this wallet yet"
            description="When you donate, the transaction appears here with live escrow and release status."
            action={<Link to="/campaigns" className={buttonClass("primary")}>Browse campaigns</Link>}
          />
        </Card>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader title="Your support vs. verified releases" description="ETH per campaign" />
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#4b628c" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#4b628c" }} />
                  <Tooltip formatter={(v) => `${v} ETH`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Your donation" fill="#3b76f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Campaign released" fill="#059669" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader title="Updates on campaigns you support" action={<ShieldCheck className="size-4 text-navy-400" />} />
            <CardContent>
              {activity.loading ? (
                <LoadingState />
              ) : activity.error ? (
                <ErrorState error={activity.error} onRetry={activity.reload} />
              ) : activity.data!.length === 0 ? (
                <p className="text-sm text-navy-500">No evidence, verification or release activity yet. Your funds remain in escrow.</p>
              ) : (
                <EventTimeline events={activity.data!} showCampaign />
              )}
            </CardContent>
          </Card>
        </div>
      )}
      {totals.length > 0 && (
        <p className="mt-4 text-sm">
          <Link to="/donor/donations" className="font-medium text-accent-700 hover:underline">See all your donations →</Link>
        </p>
      )}
    </div>
  );
}
