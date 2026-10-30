import { BadgeCheck, Droplets, FlaskConical, HandHeart, Leaf, Package, Recycle, Scale, Truck, Users, UtensilsCrossed } from 'lucide-react';
import { StatCard } from '@/components/states';
import { BarChart } from '@/components/bar-chart';

type Units = { MEALS: number; KG: number };

export interface ImpactData {
  scope: string;
  donations: {
    total: number;
    quantityListed: Units;
    quantityAvailable: Units;
    quantityReserved: Units;
    openNow: number;
    completed: number;
    byCategory: { category: string; count: number }[];
  };
  deliveries: {
    completed: number;
    quantityVerified: Units;
    awaitingConfirmation: number;
    quantityAwaitingConfirmation: Units;
    openDisputes: number;
    recoveryRatePercent: { MEALS: number | null; KG: number | null };
  };
  requests: { pending: number; deliveryCompletionRatePercent: number | null; approvedFinalOutcomes: number };
  recoveredByCategory: { category: string; quantity: Units }[];
  trends?: { period: string; donationsListed: number; listed: Units; verifiedDeliveries: number; delivered: Units }[];
  participants: { activeVolunteers: number; participatingNgos: number; activeDonors: number; volunteerVerifiedDeliveries: number } | null;
  demo: { donations: number; verifiedDeliveries: number; mealsServed: number; note: string } | null;
  estimates: {
    confirmedDeliveries: number;
    mealsServed: number;
    foodWastePreventedKg: number;
    co2SavedKg: number;
    waterSavedLiters: number;
    assumptions: { mealsPerKg: number; co2KgPerKgFood: number; waterLitersPerKgFood: number; note: string };
  };
}

const n = (v: number) => v.toLocaleString('en-IN', { maximumFractionDigits: 1 });
const qty = (q: Units) => [q.MEALS ? `${n(q.MEALS)} meals` : null, q.KG ? `${n(q.KG)} kg` : null].filter(Boolean).join(' + ') || '0';
const label = (c: string) => c.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (x) => x.toUpperCase());
const rates = (r: { MEALS: number | null; KG: number | null }) =>
  [r.MEALS !== null ? `${r.MEALS}% of meals` : null, r.KG !== null ? `${r.KG}% of kg` : null].filter(Boolean).join(' · ') || '—';

function SectionTitle({ icon: Icon, title, hint }: { icon: React.ComponentType<{ className?: string }>; title: string; hint: string }) {
  return (
    <div className="mb-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground"><Icon className="h-4 w-4" /> {title}</h2>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/** Verified records, estimates and demo data are shown in separate, labelled sections. */
export function ImpactPanel({ data }: { data: ImpactData }) {
  const maxCat = Math.max(1, ...data.donations.byCategory.map((c) => c.count));
  const a = data.estimates.assumptions;
  const d = data.deliveries;

  return (
    <div className="space-y-8" data-testid="impact-panel">
      <section>
        <SectionTitle icon={BadgeCheck} title="Verified platform records" hint="Counted from database records. Deliveries count only once the receiving NGO confirmed them (or an admin verified a reported problem)." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total food listed" value={qty(data.donations.quantityListed)} hint={`${n(data.donations.total)} donations`} icon={Package} />
          <StatCard label="Food delivered (verified)" value={qty(d.quantityVerified)} hint={`Recovery: ${rates(d.recoveryRatePercent)}`} icon={HandHeart} tone="rose" />
          <StatCard label="Verified deliveries" value={n(d.completed)} hint="Confirmed by the receiving NGO" icon={Truck} tone="amber" />
          <StatCard label="Completed donations" value={n(data.donations.completed)} hint={`${n(data.donations.openNow)} open right now`} icon={Leaf} tone="blue" />
        </div>
        {(d.awaitingConfirmation > 0 || d.openDisputes > 0) && (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Not yet counted: {d.awaitingConfirmation} deliver{d.awaitingConfirmation === 1 ? 'y' : 'ies'} awaiting NGO confirmation
            ({qty(d.quantityAwaitingConfirmation)}){d.openDisputes > 0 && ` · ${d.openDisputes} reported problem(s) under review`}.
          </p>
        )}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Available now" value={qty(data.donations.quantityAvailable)} hint="Unreserved, unexpired" icon={Package} tone="blue" />
          <StatCard label="Reserved for NGOs" value={qty(data.donations.quantityReserved)} hint="Approved, not yet confirmed" icon={Package} tone="amber" />
          <StatCard label="Pending requests" value={n(data.requests.pending)} hint="Awaiting donor decision" icon={Users} tone="slate" />
          <StatCard
            label="Delivery completion rate"
            value={data.requests.deliveryCompletionRatePercent === null ? '—' : `${data.requests.deliveryCompletionRatePercent}%`}
            hint={`Of ${data.requests.approvedFinalOutcomes} approved requests that reached an outcome`}
            icon={BadgeCheck}
            tone="rose"
          />
        </div>
        {data.participants && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Active donors" value={n(data.participants.activeDonors)} hint="Listed food at least once" icon={Users} tone="slate" />
            <StatCard label="Participating NGOs" value={n(data.participants.participatingNgos)} hint="Requested food at least once" icon={Users} tone="slate" />
            <StatCard label="Active volunteers" value={n(data.participants.activeVolunteers)} hint="Accepted at least one delivery" icon={Users} tone="slate" />
            <StatCard label="Volunteer deliveries (verified)" value={n(data.participants.volunteerVerifiedDeliveries)} hint="Carried by volunteers and confirmed" icon={Truck} tone="slate" />
          </div>
        )}
      </section>

      <section>
        <SectionTitle icon={Recycle} title="Estimated impact" hint="Derived from verified deliveries only, using stated assumptions – these are estimates, not measurements." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Meals served (est.)" value={n(data.estimates.mealsServed)} icon={UtensilsCrossed} />
          <StatCard label="Food waste prevented (est.)" value={`${n(data.estimates.foodWastePreventedKg)} kg`} icon={Scale} tone="amber" />
          <StatCard label="CO₂e avoided (est.)" value={`${n(data.estimates.co2SavedKg)} kg`} icon={Leaf} tone="blue" />
          <StatCard label="Water saved (est.)" value={`${n(data.estimates.waterSavedLiters)} L`} icon={Droplets} tone="slate" />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Based on {data.estimates.confirmedDeliveries} verified deliveries. Assumptions: 1 kg of food ≈ {a.mealsPerKg} meals,
          ≈ {a.co2KgPerKgFood} kg CO₂e and ≈ {n(a.waterLitersPerKgFood)} L of water.
        </p>
      </section>

      {data.demo && (
        <section data-testid="impact-demo">
          <SectionTitle icon={FlaskConical} title="Demo data" hint={data.demo.note} />
          <p className="rounded-lg border border-dashed bg-white p-4 text-sm">
            {data.demo.donations > 0 || data.demo.verifiedDeliveries > 0
              ? <>Of the figures above, <strong>{n(data.demo.donations)}</strong> donation(s), <strong>{n(data.demo.verifiedDeliveries)}</strong> verified deliver{data.demo.verifiedDeliveries === 1 ? 'y' : 'ies'} and ≈ <strong>{n(data.demo.mealsServed)}</strong> meals come from demo accounts.</>
              : 'No demo records are included in these figures.'}
          </p>
        </section>
      )}

      {data.trends && data.trends.length > 0 && (
        <section>
          <SectionTitle icon={Package} title="Trends" hint="Donations listed per period and deliveries verified per period (by confirmation date)." />
          <div className="rounded-xl border bg-white p-5">
            <BarChart
              title="Donations listed and deliveries verified per period"
              labels={data.trends.map((t) => t.period)}
              series={[
                { name: 'Donations listed', color: '#86efac', values: data.trends.map((t) => t.donationsListed) },
                { name: 'Verified deliveries', color: '#15803d', values: data.trends.map((t) => t.verifiedDeliveries) },
              ]}
            />
          </div>
        </section>
      )}

      {data.recoveredByCategory.length > 0 && (
        <section>
          <SectionTitle icon={Recycle} title="Food recovered by category" hint="Verified deliveries only." />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.recoveredByCategory.map((c) => (
              <div key={c.category} className="rounded-xl border bg-white p-4">
                <p className="text-sm text-muted-foreground">{label(c.category)}</p>
                <p className="text-lg font-semibold">{qty(c.quantity)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {data.donations.byCategory.length > 0 && (
        <section>
          <SectionTitle icon={Package} title="Donations by category" hint="All listed (non-cancelled) donations." />
          <div className="space-y-2 rounded-xl border bg-white p-5">
            {data.donations.byCategory.map((c) => (
              <div key={c.category} className="grid grid-cols-[8rem_1fr_2.5rem] items-center gap-3 text-sm">
                <span className="truncate text-muted-foreground">{label(c.category)}</span>
                <div className="h-2.5 rounded-full bg-muted" role="presentation">
                  <div className="h-2.5 rounded-full bg-green-600" style={{ width: `${(c.count / maxCat) * 100}%` }} />
                </div>
                <span className="text-right font-medium">{c.count}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
