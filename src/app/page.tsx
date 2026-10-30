import Link from 'next/link';
import {
  ArrowRight, Building2, CheckCircle2, ClipboardCheck, HandHeart, MapPin, ShieldCheck, Truck, UtensilsCrossed, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PublicFooter, PublicHeader } from '@/components/public-chrome';
import { getImpactStats } from '@/lib/stats';
import prisma from '@/lib/db';

// Rendered per request so the stats are live (and the build never needs a database).
export const dynamic = 'force-dynamic';

async function loadStats() {
  try {
    return await getImpactStats({ kind: 'platform' });
  } catch {
    return null; // database unavailable – the section shows a notice instead of numbers
  }
}

/**
 * Open, unexpired listings from approved donors. Public visitors see only the donor's name, the food,
 * the quantity still available and the time left – never addresses, contacts or photos.
 */
async function loadFeatured() {
  try {
    return await prisma.foodDonation.findMany({
      where: {
        status: { in: ['AVAILABLE', 'PARTIALLY_RESERVED'] },
        safePickupDeadline: { gt: new Date() },
        remainingQuantity: { gt: 0 },
        donorProfile: { user: { accountStatus: 'APPROVED' } },
      },
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: {
        id: true, foodName: true, foodCategory: true, foodType: true, remainingQuantity: true, unit: true, safePickupDeadline: true,
        donorProfile: { select: { organisationName: true, user: { select: { isDemo: true } } } },
      },
    });
  } catch {
    return null;
  }
}

const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

const ROLES = [
  {
    icon: Building2, title: 'Donors', who: 'Restaurants, hotels, caterers, hostels and event organisers',
    steps: ['List surplus food with quantity and a safe pickup deadline', 'Approve requests from nearby NGOs', 'Track pickup and delivery with photo proof'],
  },
  {
    icon: HandHeart, title: 'NGOs', who: 'Community kitchens, shelters and food banks',
    steps: ['Discover nearby food, sorted by distance and urgency', 'Request the quantity you can use', 'Confirm receipt so impact is recorded'],
  },
  {
    icon: Truck, title: 'Volunteers', who: 'Neighbours with a bike, scooter or car',
    steps: ['Accept or claim a delivery near you', 'Confirm pickup at the donor', 'Upload a delivery photo at the NGO'],
  },
];

export default async function LandingPage() {
  const [stats, featured] = await Promise.all([loadStats(), loadFeatured()]);
  const supportEmail = process.env.SUPPORT_EMAIL?.trim() || null;

  return (
    <div className="min-h-screen bg-white">
      <PublicHeader />

      <section className="gradient-hero">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-2 md:py-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-green-700 shadow-sm">
              <ShieldCheck className="h-3.5 w-3.5" /> Verified donors, NGOs and volunteers
            </p>
            <p className="mt-5 text-sm font-bold uppercase tracking-[0.2em] text-green-700" data-testid="tagline">From Surplus to Served.</p>
            <h1 className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">
              Surplus food shouldn&apos;t end up in the bin.
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              FoodBridge connects kitchens that have extra food with nearby NGOs that need it – and the volunteers who carry it
              there – before it spoils.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="xl"><Link href="/register">Join FoodBridge <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
              <Button asChild size="xl" variant="outline"><Link href="/login">Sign in</Link></Button>
            </div>
          </div>
          <div className="grid content-center gap-4 sm:grid-cols-2">
            {[
              { icon: UtensilsCrossed, label: 'Meals served (est.)', value: stats ? fmt(stats.estimates.mealsServed) : '—' },
              { icon: Truck, label: 'Verified deliveries', value: stats ? fmt(stats.deliveries.completed) : '—' },
              { icon: ClipboardCheck, label: 'Donations listed', value: stats ? fmt(stats.donations.total) : '—' },
              { icon: Users, label: 'NGOs participating', value: stats?.participants ? fmt(stats.participants.participatingNgos) : '—' },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border bg-white p-6 shadow-sm">
                <s.icon className="h-6 w-6 text-green-600" />
                <p className="mt-3 text-3xl font-bold">{s.value}</p>
                <p className="text-sm text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="about" className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-10 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold">The problem</h2>
            <p className="mt-4 text-muted-foreground">
              Every evening, restaurants, hostels, caterers and event venues are left with good food they cannot sell or serve.
              At the same time, shelters and community kitchens a few kilometres away struggle to feed everyone who comes to them.
              The gap is not food – it is coordination: who has what, who needs it, and who can move it safely before it spoils.
            </p>
          </div>
          <div>
            <h2 className="text-3xl font-bold">Our solution</h2>
            <ul className="mt-4 space-y-3 text-muted-foreground">
              {[
                'Donors list surplus with a safe pickup deadline and a food-safety declaration.',
                'NGOs see nearby food first, ranked by distance, urgency and fit.',
                'Approvals reserve quantities atomically, so food is never promised twice.',
                'Volunteers carry it with pickup and delivery photo proof.',
                'Impact is recorded only when the receiving NGO confirms delivery.',
                'Free for NGOs: donated food and its delivery never cost the NGO anything.',
              ].map((t) => (
                <li key={t} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" /> {t}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="bg-slate-50 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-bold">How it works</h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-muted-foreground">
            Donor lists food → NGO requests → donor approves → volunteer picks up → delivery with proof → NGO confirms → impact recorded.
          </p>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {ROLES.map((r) => (
              <div key={r.title} className="rounded-2xl border bg-white p-6">
                <r.icon className="h-8 w-8 text-green-600" />
                <h3 className="mt-4 text-xl font-semibold">{r.title}</h3>
                <p className="text-sm text-muted-foreground">{r.who}</p>
                <ol className="mt-4 space-y-2 text-sm">
                  {r.steps.map((s, i) => (
                    <li key={s} className="flex gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-800">{i + 1}</span>{s}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="available" className="mx-auto max-w-6xl px-4 pt-16" data-testid="featured-donations">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-3xl font-bold">Food available right now</h2>
            <p className="mt-1 text-muted-foreground">Live listings from verified donors. Verified NGOs can request them free of charge.</p>
          </div>
          <Button asChild variant="outline"><Link href="/register/ngo">Request food as an NGO <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
        </div>
        {featured === null ? (
          <p className="mt-6 rounded-lg bg-muted p-4 text-sm text-muted-foreground">Listings are temporarily unavailable.</p>
        ) : featured.length === 0 ? (
          <p className="mt-6 rounded-lg bg-muted p-4 text-sm text-muted-foreground">No food is listed at the moment – donors post surplus throughout the day.</p>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((d) => {
              const hoursLeft = Math.max(0, Math.round((d.safePickupDeadline.getTime() - Date.now()) / 3_600_000));
              return (
                <article key={d.id} className="rounded-2xl border bg-white p-5 shadow-sm" data-testid="featured-donation">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold">{d.foodName}</h3>
                    {d.donorProfile.user.isDemo && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Demo listing</span>}
                  </div>
                  <p className="text-sm text-muted-foreground">{d.donorProfile.organisationName}</p>
                  <p className="mt-3 text-sm">
                    <span className="font-semibold">{fmt(d.remainingQuantity)} {d.unit === 'MEALS' ? 'meals' : 'kg'}</span> available ·{' '}
                    {d.foodCategory.toLowerCase().replace(/_/g, ' ')} · {d.foodType.toLowerCase().replace(/_/g, '-')}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{hoursLeft < 1 ? 'Less than an hour left to collect' : `About ${hoursLeft} h left to collect`}</p>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section id="impact" className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-3xl font-bold">Live impact</h2>
        {stats ? (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'Food waste prevented (est.)', value: `${fmt(stats.estimates.foodWastePreventedKg)} kg` },
                { label: 'CO₂e avoided (est.)', value: `${fmt(stats.estimates.co2SavedKg)} kg` },
                { label: 'Open donations right now', value: fmt(stats.donations.openNow) },
                { label: 'Active volunteers', value: stats.participants ? fmt(stats.participants.activeVolunteers) : '—' },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border p-5">
                  <p className="text-2xl font-bold">{s.value}</p>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Computed from FoodBridge records. Estimates count verified (NGO-confirmed) deliveries only and assume 1 kg food ≈ {stats.estimates.assumptions.mealsPerKg} meals
              and ≈ {stats.estimates.assumptions.co2KgPerKgFood} kg CO₂e.
              {stats.demo && (stats.demo.donations > 0 || stats.demo.verifiedDeliveries > 0) && (
                <> Includes demo data: {fmt(stats.demo.donations)} donation(s) and {fmt(stats.demo.verifiedDeliveries)} verified deliver{stats.demo.verifiedDeliveries === 1 ? 'y' : 'ies'} from seeded demo accounts.</>
              )}
            </p>
          </>
        ) : (
          <p className="mt-4 rounded-lg bg-muted p-4 text-sm text-muted-foreground">Live statistics are temporarily unavailable.</p>
        )}
      </section>

      <section id="help" className="bg-slate-50 py-16">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold">Help &amp; contact</h2>
            <p className="mt-4 text-muted-foreground">
              New accounts are reviewed by a FoodBridge admin before they can coordinate food. Questions about your account,
              a delivery or a food-safety concern?{' '}
              {supportEmail ? (
                <>Email the FoodBridge team at <a className="font-medium text-green-700 hover:underline" href={`mailto:${supportEmail}`}>{supportEmail}</a>.</>
              ) : (
                <>Contact the FoodBridge coordinator who onboarded your organisation.</>
              )}
            </p>
            <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><MapPin className="h-4 w-4" /> Pilot city: Jaipur, Rajasthan</p>
          </div>
          <dl className="space-y-4 text-sm">
            {[
              ['Is the food safe?', 'Donors must declare food safety, state storage conditions and set a safe pickup deadline. Expired listings disappear automatically.'],
              ['Who can join?', 'Registered food businesses and institutions (donors), NGOs and community kitchens, and individual volunteers. Admin accounts cannot be created through sign-up.'],
              ['What does it cost?', 'Nothing. Donors give surplus food for free and NGOs never pay for food or delivery. Deliveries are carried by volunteers, and FoodBridge processes no payments.'],
              ['How are impact numbers calculated?', 'Verified figures count only deliveries the receiving NGO confirmed. Estimates (meals, CO₂e) are derived from those with the conversion factors shown, and records from seeded demo accounts are reported separately.'],
            ].map(([q, a]) => (
              <div key={q} className="rounded-xl border bg-white p-4"><dt className="font-semibold">{q}</dt><dd className="mt-1 text-muted-foreground">{a}</dd></div>
            ))}
          </dl>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
