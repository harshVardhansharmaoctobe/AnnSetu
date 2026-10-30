'use client';

import { useState } from 'react';
import { BarChart } from '@/components/bar-chart';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { ErrorState, LoadingCards, PageHeader, StatusBadge, humanize } from '@/components/states';
import { useApi, toQuery } from '@/lib/client';

type Units = { MEALS: number; KG: number };
interface Analytics {
  range: { from: string; to: string; interval: string };
  trends: { period: string; donationsListed: number; listed: Units; verifiedDeliveries: number; delivered: Units }[];
  donations: { status: string; count: number; quantity: number }[];
  requests: { status: string; count: number; quantity: number }[];
  assignments: { status: string; count: number }[];
  newUsers: { role: string; status: string; count: number }[];
  recoveredByCategory: { category: string; quantity: Units }[];
  verifiedDeliveries: number;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const qty = (u: Units) => [u.MEALS ? `${u.MEALS} meals` : null, u.KG ? `${u.KG} kg` : null].filter(Boolean).join(' + ') || '0';

function StatusTable({ title, rows, showQuantity }: { title: string; rows: { status: string; count: number; quantity?: number }[]; showQuantity?: boolean }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">No records in this period.</p> : (
          <table className="w-full text-sm">
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.status}><td className="py-2"><StatusBadge status={r.status} /></td><td className="py-2 text-right font-semibold">{r.count}</td>
                  {showQuantity && <td className="py-2 text-right text-muted-foreground">{r.quantity} units</td>}</tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

/** Admin reports for a chosen period: trends, donations, deliveries, users and verified food recovery. */
export default function AnalyticsPage() {
  const [from, setFrom] = useState(iso(new Date(Date.now() - 29 * 86_400_000)));
  const [to, setTo] = useState(iso(new Date()));
  const [interval, setTrendInterval] = useState('day');
  const [applied, setApplied] = useState({ from, to, interval });
  const { data, error, loading, reload } = useApi<Analytics>(`/api/admin/analytics${toQuery(applied)}`);

  const userRows = Object.values((data?.newUsers ?? []).reduce<Record<string, { role: string; total: number; byStatus: Record<string, number> }>>((acc, u) => {
    acc[u.role] ??= { role: u.role, total: 0, byStatus: {} };
    acc[u.role].total += u.count;
    acc[u.role].byStatus[u.status] = (acc[u.role].byStatus[u.status] ?? 0) + u.count;
    return acc;
  }, {}));

  return (
    <div className="space-y-6">
      <PageHeader title="Reports & analytics" description="All figures come from FoodBridge records for the selected period. Delivered quantities count verified deliveries only." />
      <form
        className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
        onSubmit={(e) => { e.preventDefault(); setApplied({ from, to, interval }); }}
      >
        <div className="space-y-1.5"><Label htmlFor="from">From</Label><Input id="from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="to">To</Label><Input id="to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></div>
        <div className="space-y-1.5">
          <Label htmlFor="interval">Group by</Label>
          <NativeSelect id="interval" value={interval} onChange={(e) => setTrendInterval(e.target.value)}>
            <option value="day">Day</option><option value="week">Week</option><option value="month">Month</option>
          </NativeSelect>
        </div>
        <Button type="submit">Apply</Button>
      </form>

      {loading && !data ? <LoadingCards count={4} />
        : error || !data ? <ErrorState message={error?.message ?? 'Could not load analytics'} onRetry={reload} />
          : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Donations listed vs. verified deliveries</CardTitle>
                  <p className="text-xs text-muted-foreground">{data.verifiedDeliveries} verified deliveries in this period · listed {qty(data.trends.reduce((s, t) => ({ MEALS: s.MEALS + t.listed.MEALS, KG: s.KG + t.listed.KG }), { MEALS: 0, KG: 0 }))} · delivered {qty(data.trends.reduce((s, t) => ({ MEALS: s.MEALS + t.delivered.MEALS, KG: s.KG + t.delivered.KG }), { MEALS: 0, KG: 0 }))}</p>
                </CardHeader>
                <CardContent>
                  <BarChart
                    title="Donations listed and deliveries verified per period"
                    labels={data.trends.map((t) => t.period)}
                    series={[
                      { name: 'Donations listed', color: '#86efac', values: data.trends.map((t) => t.donationsListed) },
                      { name: 'Verified deliveries', color: '#15803d', values: data.trends.map((t) => t.verifiedDeliveries) },
                    ]}
                  />
                </CardContent>
              </Card>
              <div className="grid gap-4 md:grid-cols-3">
                <StatusTable title="Donation report (created in period)" rows={data.donations} showQuantity />
                <StatusTable title="Request & delivery report" rows={data.requests} showQuantity />
                <StatusTable title="Volunteer assignments" rows={data.assignments} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle className="text-base">User report (registered in period)</CardTitle></CardHeader>
                  <CardContent>
                    {userRows.length === 0 ? <p className="text-sm text-muted-foreground">No new users in this period.</p> : (
                      <ul className="divide-y text-sm">
                        {userRows.map((u) => (
                          <li key={u.role} className="flex flex-wrap items-center justify-between gap-2 py-2">
                            <span className="font-medium">{humanize(u.role)} · {u.total}</span>
                            <span className="flex flex-wrap gap-1">{Object.entries(u.byStatus).map(([s, c]) => <span key={s} className="flex items-center gap-1"><StatusBadge status={s} />{c}</span>)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base">Food recovery by category (verified)</CardTitle></CardHeader>
                  <CardContent>
                    {data.recoveredByCategory.length === 0 ? <p className="text-sm text-muted-foreground">No verified deliveries in this period.</p> : (
                      <ul className="divide-y text-sm">
                        {data.recoveredByCategory.map((c) => <li key={c.category} className="flex justify-between py-2"><span>{humanize(c.category)}</span><b>{qty(c.quantity)}</b></li>)}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
    </div>
  );
}
