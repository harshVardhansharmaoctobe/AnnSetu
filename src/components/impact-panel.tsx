import { Droplets, HandHeart, Leaf, Package, Scale, Truck, Users, UtensilsCrossed } from 'lucide-react';
import { StatCard } from '@/components/states';

export interface ImpactData {
  scope: string;
  donations: {
    total: number;
    quantityDonated: { MEALS: number; KG: number };
    openNow: number;
    byCategory: { category: string; count: number }[];
  };
  deliveries: { completed: number; awaitingConfirmation: number; quantityDelivered: { MEALS: number; KG: number } };
  participants: { activeVolunteers: number; participatingNgos: number; activeDonors: number } | null;
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
const qty = (q: { MEALS: number; KG: number }) =>
  [q.MEALS ? `${n(q.MEALS)} meals` : null, q.KG ? `${n(q.KG)} kg` : null].filter(Boolean).join(' + ') || '0';
const label = (c: string) => c.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (x) => x.toUpperCase());

/** Impact figures from real records; estimates are labelled and their formula stated. */
export function ImpactPanel({ data }: { data: ImpactData }) {
  const maxCat = Math.max(1, ...data.donations.byCategory.map((c) => c.count));
  const a = data.estimates.assumptions;

  return (
    <div className="space-y-6" data-testid="impact-panel">
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Recorded activity</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total donations" value={n(data.donations.total)} hint={qty(data.donations.quantityDonated)} icon={Package} />
          <StatCard label="Open donations" value={n(data.donations.openNow)} hint="Available to request now" icon={Leaf} tone="blue" />
          <StatCard
            label="Completed deliveries"
            value={n(data.deliveries.completed)}
            hint={data.deliveries.awaitingConfirmation ? `${data.deliveries.awaitingConfirmation} awaiting NGO confirmation` : 'Confirmed by the receiving NGO'}
            icon={Truck}
            tone="amber"
          />
          <StatCard label="Quantity delivered" value={qty(data.deliveries.quantityDelivered)} hint="Delivered or confirmed" icon={HandHeart} tone="rose" />
        </div>
        {data.participants && (
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <StatCard label="Active volunteers" value={n(data.participants.activeVolunteers)} hint="Accepted at least one delivery" icon={Users} tone="slate" />
            <StatCard label="Participating NGOs" value={n(data.participants.participatingNgos)} hint="Requested food at least once" icon={Users} tone="slate" />
            <StatCard label="Active donors" value={n(data.participants.activeDonors)} hint="Listed food at least once" icon={Users} tone="slate" />
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Estimated impact</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Meals served (est.)" value={n(data.estimates.mealsServed)} icon={UtensilsCrossed} />
          <StatCard label="Food waste prevented (est.)" value={`${n(data.estimates.foodWastePreventedKg)} kg`} icon={Scale} tone="amber" />
          <StatCard label="CO₂e avoided (est.)" value={`${n(data.estimates.co2SavedKg)} kg`} icon={Leaf} tone="blue" />
          <StatCard label="Water saved (est.)" value={`${n(data.estimates.waterSavedLiters)} L`} icon={Droplets} tone="slate" />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Estimates use {data.estimates.confirmedDeliveries} NGO-confirmed deliveries only. Assumptions: 1 kg of food ≈ {a.mealsPerKg} meals,
          ≈ {a.co2KgPerKgFood} kg CO₂e and ≈ {n(a.waterLitersPerKgFood)} L of water. These are rough planning figures, not measurements.
        </p>
      </section>

      {data.donations.byCategory.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Donations by category</h2>
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
