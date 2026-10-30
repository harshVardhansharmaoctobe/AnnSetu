import { ArrowRight, BadgeCheck, FileSearch, HandCoins, Landmark, Lock, ShieldCheck, Upload } from "lucide-react";
import { Link } from "react-router";
import { CampaignCard } from "@/components/CampaignCard";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useApi } from "@/hooks/useApi";
import { api } from "@/lib/api";
import { config } from "@/lib/config";
import { formatEth } from "@/lib/format";

const STEPS = [
  { icon: Landmark, title: "NGO creates a campaign", text: "Target, beneficiary wallet and milestones are written to the smart contract. Allocations must add up to the target." },
  { icon: HandCoins, title: "Donors give via MetaMask", text: "Every donation is a signed transaction. The ETH is locked in the contract's escrow — not sent to the NGO." },
  { icon: Upload, title: "NGO submits evidence", text: "Photos, receipts and documents are stored on IPFS. The CID and SHA-256 hash are recorded on-chain for the milestone." },
  { icon: FileSearch, title: "Independent verifier reviews", text: "Only the verifier assigned to the campaign can approve or reject, and a rejection must state a reason." },
  { icon: ShieldCheck, title: "Contract releases funds", text: "After approval, exactly the milestone's allocation goes to the fixed beneficiary — once, never more than is in escrow." },
  { icon: BadgeCheck, title: "Anyone can audit", text: "Donations, evidence, decisions and releases are public on the campaign's transparency page and on the block explorer." },
];

export default function Landing() {
  const { data, error, loading, reload } = useApi(() => api.campaigns(), []);
  const campaigns = data?.campaigns ?? [];
  const totals = campaigns.reduce(
    (t, c) => ({ donated: t.donated + BigInt(c.totalDonatedWei), released: t.released + BigInt(c.totalReleasedWei), escrow: t.escrow + BigInt(c.escrowWei) }),
    { donated: 0n, released: 0n, escrow: 0n },
  );

  return (
    <div>
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:py-20 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
              <Lock className="size-3.5" /> Escrowed by a smart contract on {config.chainName}
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-navy-950 sm:text-5xl">
              Charity donations you can follow from wallet to impact.
            </h1>
            <p className="mt-4 max-w-xl text-lg text-navy-600">
              TrustChain holds donations in escrow and releases them milestone by milestone, only after an independent verifier approves evidence stored on IPFS.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/campaigns" className={buttonClass("primary", "lg")}>
                Browse campaigns <ArrowRight className="size-4" />
              </Link>
              <Link to="/register" className={buttonClass("outline", "lg")}>
                Create an account
              </Link>
            </div>
          </div>

          <Card className="p-6">
            <p className="text-sm font-medium text-navy-500">Platform totals · read from indexed contract state</p>
            {loading ? (
              <div className="mt-4 space-y-3">
                <Skeleton className="h-8 w-40" />
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-8 w-36" />
              </div>
            ) : error ? (
              <ErrorState error={error} onRetry={reload} className="py-4" />
            ) : (
              <dl className="mt-4 grid grid-cols-2 gap-5">
                <div>
                  <dt className="text-xs text-navy-500">Campaigns on-chain</dt>
                  <dd className="text-2xl font-semibold">{campaigns.length}</dd>
                </div>
                <div>
                  <dt className="text-xs text-navy-500">Total donated</dt>
                  <dd className="text-2xl font-semibold">{formatEth(totals.donated)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-navy-500">Held in escrow</dt>
                  <dd className="text-2xl font-semibold text-accent-700">{formatEth(totals.escrow)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-navy-500">Released after verification</dt>
                  <dd className="text-2xl font-semibold text-emerald-700">{formatEth(totals.released)}</dd>
                </div>
              </dl>
            )}
            <p className="mt-5 border-t border-slate-100 pt-4 text-xs text-navy-400">
              Test network only. Amounts are testnet ETH with no monetary value.
            </p>
          </Card>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-14 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight">How TrustChain works</h2>
        <p className="mt-1 text-navy-500">Money only moves when the contract's rules are met — no one can skip a step.</p>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <Card className="h-full p-5">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-navy-50 text-navy-700">
                    <s.icon className="size-4.5" />
                  </span>
                  <span className="text-xs font-semibold text-navy-400">STEP {i + 1}</span>
                </div>
                <h3 className="mt-3 font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-navy-600">{s.text}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Recent campaigns</h2>
            <p className="mt-1 text-navy-500">Live from the TrustChain contract.</p>
          </div>
          <Link to="/campaigns" className="text-sm font-medium text-accent-700 hover:underline">
            View all →
          </Link>
        </div>
        <div className="mt-6">
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-80 rounded-xl" />
              ))}
            </div>
          ) : error ? null : campaigns.length === 0 ? (
            <Card>
              <EmptyState icon={Landmark} title="No campaigns yet" description="Once an authorised NGO creates a campaign on-chain it will appear here." />
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {campaigns.slice(0, 3).map((c) => (
                <CampaignCard key={c.id} campaign={c} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
