import { ClipboardCheck, HandCoins, Landmark, ShieldCheck, Users } from "lucide-react";
import { Link } from "react-router";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EventTimeline } from "@/components/EventTimeline";
import { PageHeader } from "@/components/layout/Layouts";
import { Card, CardContent, CardHeader, StatCard } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui/feedback";
import { useApi } from "@/hooks/useApi";
import { api } from "@/lib/api";
import { formatEth, weiToEthNumber } from "@/lib/format";

export default function AdminDashboard() {
  const { data, error, loading, reload } = useApi(() => api.overview(), []);
  if (loading) return <LoadingState />;
  if (error) return <Card><ErrorState error={error} onRetry={reload} /></Card>;
  const o = data!;
  const chart = [
    { name: "Donated", eth: weiToEthNumber(o.totalDonatedWei), fill: "#263858" },
    { name: "In escrow", eth: weiToEthNumber(o.escrowWei), fill: "#3b76f6" },
    { name: "Released", eth: weiToEthNumber(o.totalReleasedWei), fill: "#059669" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Platform overview" description="Totals are summed from contract state indexed for every campaign." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Campaigns" value={o.campaigns} icon={<Landmark className="size-4" />} />
        <StatCard label="Donations" value={o.donations} hint={`${o.donors} unique donors`} icon={<HandCoins className="size-4" />} tone="blue" />
        <StatCard label="Pending reviews" value={o.pendingReviews} icon={<ClipboardCheck className="size-4" />} tone="amber" />
        <StatCard label="Authorised NGOs / verifiers" value={`${o.ngos} / ${o.verifiers}`} hint={`${o.users} registered users`} icon={<Users className="size-4" />} tone="emerald" />
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader title="Funds across the platform" />
          <CardContent>
            <dl className="mb-4 grid grid-cols-3 gap-2 text-sm">
              <div><dt className="text-xs text-navy-500">Donated</dt><dd className="font-semibold">{formatEth(o.totalDonatedWei)}</dd></div>
              <div><dt className="text-xs text-navy-500">Escrow</dt><dd className="font-semibold text-accent-700">{formatEth(o.escrowWei)}</dd></div>
              <div><dt className="text-xs text-navy-500">Released</dt><dd className="font-semibold text-emerald-700">{formatEth(o.totalReleasedWei)}</dd></div>
            </dl>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#4b628c" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#4b628c" }} />
                  <Tooltip formatter={(v) => `${v} ETH`} />
                  <Bar dataKey="eth" radius={[4, 4, 0, 0]}>
                    {chart.map((d) => <Cell key={d.name} fill={d.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <Link to="/admin/ngos" className="font-medium text-accent-700 hover:underline">Manage NGOs →</Link>
              <Link to="/admin/verifiers" className="font-medium text-accent-700 hover:underline">Manage verifiers →</Link>
              <Link to="/admin/campaigns" className="font-medium text-accent-700 hover:underline">Monitor campaigns →</Link>
            </div>
          </CardContent>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader title="Recent platform activity" action={<ShieldCheck className="size-4 text-navy-400" />} />
          <CardContent>
            {o.recentEvents.length === 0 ? <p className="text-sm text-navy-500">No on-chain activity yet.</p> : <EventTimeline events={o.recentEvents} showCampaign />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
