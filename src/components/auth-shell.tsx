import Link from 'next/link';
import { BadgeCheck, HandHeart, Leaf, MapPin, Truck } from 'lucide-react';

const POINTS = [
  { icon: MapPin, text: 'Surplus food matched to NGOs nearby, by real distance' },
  { icon: Truck, text: 'Volunteers collect and deliver with photo proof' },
  { icon: BadgeCheck, text: 'Every donor, NGO and volunteer is verified' },
  { icon: HandHeart, text: 'Free for NGOs – no food or delivery fees' },
];

/** Two-panel layout for sign-in, registration and password pages: brand panel + form. */
export function AuthShell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="grid min-h-screen bg-slate-50 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="relative hidden overflow-hidden bg-green-800 p-10 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-green-700/60" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-green-900/50" aria-hidden />
        <Link href="/" className="relative flex items-center gap-2 text-lg font-bold">
          <span className="rounded-lg bg-white/15 p-1.5"><Leaf className="h-5 w-5" /></span> FoodBridge
        </Link>
        <div className="relative mt-auto max-w-md">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-green-200">From Surplus to Served</p>
          <h2 className="mt-3 text-3xl font-bold leading-tight">Good food should feed people, not landfills.</h2>
          <ul className="mt-8 space-y-4">
            {POINTS.map((p) => (
              <li key={p.text} className="flex items-start gap-3 text-green-50">
                <span className="mt-0.5 rounded-md bg-white/10 p-1.5"><p.icon className="h-4 w-4" /></span>
                <span>{p.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-auto pt-10 text-xs text-green-200">Built for food donors, NGOs and volunteers in your city.</p>
      </aside>
      <main className="flex flex-col">
        <div className="flex items-center justify-between px-4 py-4 sm:px-8 lg:justify-end">
          <Link href="/" className="flex items-center gap-2 font-bold lg:hidden"><Leaf className="h-5 w-5 text-green-600" /> FoodBridge</Link>
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← Back to home</Link>
        </div>
        <div className="flex flex-1 items-start justify-center px-4 pb-12 pt-4 sm:items-center sm:px-8">
          <div className={wide ? 'w-full max-w-2xl' : 'w-full max-w-md'}>{children}</div>
        </div>
      </main>
    </div>
  );
}
