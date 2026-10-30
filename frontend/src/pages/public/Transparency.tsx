import { ArrowLeft, Download, HandCoins, Landmark, ShieldCheck } from "lucide-react";
import { Link, useParams } from "react-router";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AddressLink, DemoBadge, HashValue, MilestoneStatusBadge, StorageBadge, TxLink } from "@/components/chain";
import { EventTimeline } from "@/components/EventTimeline";
import { FundsSummary } from "@/components/FundsSummary";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, StatCard } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/feedback";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { useApi } from "@/hooks/useApi";
import { api } from "@/lib/api";
import { formatDate, formatEth, weiToEthNumber } from "@/lib/format";

export default function Transparency() {
  const { id = "" } = useParams();
  const campaign = useApi(() => api.campaign(id), [id]);
  const events = useApi(() => api.campaignEvents(id), [id]);
  const verifications = useApi(() => api.verificationHistory({ campaignId: Number(id) }), [id]);

  if (campaign.loading) return <LoadingState label="Reading campaign state from the contract…" />;
  if (campaign.error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Card>
          <ErrorState error={campaign.error} onRetry={campaign.reload} />
        </Card>
      </div>
    );
  }
  const c = campaign.data!.campaign;
  const all = events.data?.events ?? [];
  const donations = all.filter((e) => e.event === "DonationReceived");
  const releases = all.filter((e) => e.event === "FundsReleased");

  const chartData = c.milestones.map((m) => ({
    name: `M${m.id + 1}`,
    Allocated: weiToEthNumber(m.amountWei),
    Released: m.status === "RELEASED" ? weiToEthNumber(m.amountWei) : 0,
  }));

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ campaign: c, events: all, verifications: verifications.data?.records ?? [] }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trustchain-campaign-${c.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <Link to={`/campaigns/${c.id}`} className="inline-flex items-center gap-1 text-sm text-navy-500 hover:text-navy-800">
          <ArrowLeft className="size-4" /> Campaign page
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-wide text-navy-400 uppercase">Public transparency tracker</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{c.title}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-navy-500">
              Campaign #{c.id} · {c.source === "chain" ? `figures read live from the contract at block ${c.syncedBlock}` : "blockchain unreachable — last indexed figures"}
              <DemoBadge show={c.isDemo} />
            </p>
          </div>
          <button type="button" onClick={exportJson} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">
            <Download className="size-4" /> Export JSON
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Target" value={formatEth(c.targetWei)} icon={<Landmark className="size-4" />} />
        <StatCard label="Total donated" value={formatEth(c.totalDonatedWei)} hint={`${c.donationCount} donations · ${c.donorCount} donors`} icon={<HandCoins className="size-4" />} tone="navy" />
        <StatCard label="Held in escrow" value={formatEth(c.escrowWei)} hint="Locked in the contract" tone="blue" icon={<ShieldCheck className="size-4" />} />
        <StatCard label="Released" value={formatEth(c.totalReleasedWei)} hint={`${c.milestones.filter((m) => m.status === "RELEASED").length} of ${c.milestones.length} milestones`} tone="emerald" icon={<ShieldCheck className="size-4" />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Where the money is" description="Donated ≠ spent. Escrowed funds are still in the contract." />
          <CardContent>
            <FundsSummary campaign={c} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Milestone allocations vs releases" description="ETH per milestone" />
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#4b628c" }} />
                <YAxis tick={{ fontSize: 12, fill: "#4b628c" }} />
                <Tooltip formatter={(v) => `${v} ETH`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Allocated" fill="#c9d4e6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Released" fill="#059669" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader title="Milestone progress & evidence" description="Evidence references and hashes are the values stored in the contract." />
        <Table>
          <THead>
            <tr>
              <TH>#</TH>
              <TH>Milestone</TH>
              <TH>Allocation</TH>
              <TH>Status</TH>
              <TH>Evidence (on-chain)</TH>
              <TH>Dates</TH>
            </tr>
          </THead>
          <TBody>
            {c.milestones.map((m) => (
              <TR key={m.id}>
                <TD className="text-navy-500">{m.id + 1}</TD>
                <TD className="max-w-xs">
                  <p className="break-words">{m.description}</p>
                  {m.rejectionReason && <p className="mt-1 text-xs text-rose-700">Rejected: {m.rejectionReason}</p>}
                </TD>
                <TD className="font-medium whitespace-nowrap">{formatEth(m.amountWei)}</TD>
                <TD><MilestoneStatusBadge status={m.status} /></TD>
                <TD>
                  {m.evidenceCID ? (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        {m.evidenceUrl ? (
                          <a href={m.evidenceUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-accent-700 hover:underline">
                            Open manifest
                          </a>
                        ) : null}
                        <StorageBadge isIpfs={m.evidenceIsIpfs} />
                      </div>
                      <HashValue value={m.evidenceCID} label="reference" />
                      <HashValue value={m.evidenceHash} label="SHA-256" />
                    </div>
                  ) : (
                    <span className="text-xs text-navy-400">Not submitted</span>
                  )}
                </TD>
                <TD className="text-xs whitespace-nowrap text-navy-500">
                  {m.submittedAt && <p>Submitted {formatDate(m.submittedAt)}</p>}
                  {m.reviewedAt && <p>Reviewed {formatDate(m.reviewedAt)}</p>}
                  {m.releasedAt && <p className="text-emerald-700">Released {formatDate(m.releasedAt)}</p>}
                  {!m.submittedAt && "—"}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Verification history" description="Every approval and rejection, signed by the verifier's wallet." />
          {verifications.loading ? (
            <LoadingState />
          ) : verifications.error ? (
            <ErrorState error={verifications.error} onRetry={verifications.reload} />
          ) : verifications.data!.records.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="No verification decisions yet" />
          ) : (
            <Table className="min-w-[480px]">
              <THead>
                <tr>
                  <TH>Milestone</TH>
                  <TH>Decision</TH>
                  <TH>Verifier</TH>
                  <TH>Transaction</TH>
                </tr>
              </THead>
              <TBody>
                {verifications.data!.records.map((v) => (
                  <TR key={v._id}>
                    <TD>
                      M{v.milestoneId + 1}
                      <p className="text-xs text-navy-400">{formatDate(v.decidedAt, true)}</p>
                    </TD>
                    <TD>
                      <Badge tone={v.decision === "APPROVED" ? "emerald" : "rose"}>{v.decision === "APPROVED" ? "Approved" : "Rejected"}</Badge>
                      {v.reason && <p className="mt-1 max-w-[14rem] text-xs break-words text-navy-500">{v.reason}</p>}
                    </TD>
                    <TD><AddressLink address={v.verifier} /></TD>
                    <TD><TxLink hash={v.txHash} /></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title="Fund releases" description="Transfers from escrow to the beneficiary." />
          {releases.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="No funds released yet" description="Funds stay in escrow until a milestone is approved and released." />
          ) : (
            <Table className="min-w-[420px]">
              <THead>
                <tr>
                  <TH>Milestone</TH>
                  <TH>Amount</TH>
                  <TH>Recipient</TH>
                  <TH>Transaction</TH>
                </tr>
              </THead>
              <TBody>
                {releases.map((r) => (
                  <TR key={r._id}>
                    <TD>
                      M{(r.milestoneId ?? 0) + 1}
                      <p className="text-xs text-navy-400">{formatDate(r.blockTimestamp, true)}</p>
                    </TD>
                    <TD className="font-medium text-emerald-700">{formatEth(r.amountWei)}</TD>
                    <TD><AddressLink address={r.subject} /></TD>
                    <TD><TxLink hash={r.txHash} /></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Donations" description={`${donations.length} donation transaction${donations.length === 1 ? "" : "s"}, all held in escrow on arrival.`} />
        {events.error ? (
          <ErrorState error={events.error} onRetry={events.reload} />
        ) : donations.length === 0 ? (
          <EmptyState icon={HandCoins} title="No donations yet" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Date</TH>
                <TH>Donor</TH>
                <TH>Amount</TH>
                <TH>Block</TH>
                <TH>Transaction</TH>
              </tr>
            </THead>
            <TBody>
              {donations.map((d) => (
                <TR key={d._id}>
                  <TD className="whitespace-nowrap">{formatDate(d.blockTimestamp, true)}</TD>
                  <TD><AddressLink address={d.actor} /></TD>
                  <TD className="font-medium">{formatEth(d.amountWei)}</TD>
                  <TD className="text-navy-500">{d.blockNumber}</TD>
                  <TD><TxLink hash={d.txHash} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title="Complete blockchain timeline" description="Every TrustChain event for this campaign, newest first." />
        <CardContent>{all.length === 0 ? <p className="text-sm text-navy-500">No events indexed yet.</p> : <EventTimeline events={all} />}</CardContent>
      </Card>
    </div>
  );
}
