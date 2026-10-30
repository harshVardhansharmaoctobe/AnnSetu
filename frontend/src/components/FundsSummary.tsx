import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatEth, percent, weiToEthNumber } from "@/lib/format";
import type { Campaign } from "@/lib/types";

const COLORS = { released: "#059669", escrow: "#3b76f6", remaining: "#e2e8f0" };

/**
 * Donated vs held in escrow vs released — kept visually and verbally distinct. A donation is
 * not an expenditure: funds stay in the contract until a verified milestone releases them.
 */
export function FundsSummary({ campaign, showChart = true }: { campaign: Campaign; showChart?: boolean }) {
  const target = BigInt(campaign.targetWei);
  const donated = BigInt(campaign.totalDonatedWei);
  const released = BigInt(campaign.totalReleasedWei);
  const escrow = BigInt(campaign.escrowWei);
  const remaining = target > donated ? target - donated : 0n;

  const data = [
    { name: "Released to beneficiary", value: weiToEthNumber(released), color: COLORS.released },
    { name: "Held in escrow", value: weiToEthNumber(escrow), color: COLORS.escrow },
    { name: "Not yet donated", value: weiToEthNumber(remaining), color: COLORS.remaining },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-2xl font-semibold text-navy-900">{formatEth(donated)}</p>
          <p className="text-sm text-navy-500">of {formatEth(target)} target</p>
        </div>
        <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100" aria-label="Funding breakdown">
          <div className="bg-emerald-600" style={{ width: `${percent(released, target)}%` }} title="Released" />
          <div className="bg-accent-500" style={{ width: `${percent(escrow, target)}%` }} title="Held in escrow" />
        </div>
        <p className="mt-1 text-xs text-navy-500">{percent(donated, target).toFixed(1)}% funded</p>
      </div>

      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Figure color="bg-navy-800" label="Total donated" value={formatEth(donated)} note="Sent by donors to the contract" />
        <Figure color="bg-accent-500" label="Held in escrow" value={formatEth(escrow)} note="Locked until milestones are verified" />
        <Figure color="bg-emerald-600" label="Released" value={formatEth(released)} note="Paid to the beneficiary after approval" />
      </dl>

      {showChart && data.length > 0 && (
        <div className="h-44" aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={70} paddingAngle={2} stroke="none">
                {data.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => `${Number(v).toLocaleString("en-US", { maximumFractionDigits: 6 })} ETH`} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function Figure({ color, label, value, note }: { color: string; label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-navy-500">
        <span className={`size-2 rounded-full ${color}`} aria-hidden /> {label}
      </dt>
      <dd className="mt-0.5 font-semibold text-navy-900">{value}</dd>
      <dd className="text-[11px] leading-tight text-navy-400">{note}</dd>
    </div>
  );
}
