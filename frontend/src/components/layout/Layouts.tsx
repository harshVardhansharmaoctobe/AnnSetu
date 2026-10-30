import {
  ClipboardCheck,
  FilePlus2,
  Gauge,
  HandCoins,
  History,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Megaphone,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { useAuth } from "@/context/AuthContext";
import { config } from "@/lib/config";
import { cn, shortAddress } from "@/lib/format";
import type { Role } from "@/lib/types";
import { StatusBanners } from "../StatusBanners";
import { WalletButton } from "../WalletButton";
import { Button, buttonClass } from "../ui/button";

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 font-semibold text-navy-900">
      <span className="flex size-8 items-center justify-center rounded-lg bg-navy-900">
        <ShieldCheck className="size-4.5 text-emerald-400" aria-hidden />
      </span>
      <span className="text-lg tracking-tight">TrustChain</span>
    </Link>
  );
}

export function dashboardPath(roles: Role[] | undefined) {
  if (roles?.includes("ADMIN")) return "/admin";
  if (roles?.includes("NGO")) return "/ngo";
  if (roles?.includes("VERIFIER")) return "/verifier";
  return "/donor";
}

function SiteHeader() {
  const auth = useAuth();
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex">
            <NavLink to="/campaigns" className={({ isActive }) => cn("rounded-md px-3 py-1.5 text-sm font-medium", isActive ? "bg-slate-100 text-navy-900" : "text-navy-600 hover:text-navy-900")}>
              Campaigns
            </NavLink>
            <Link to="/#how-it-works" className="rounded-md px-3 py-1.5 text-sm font-medium text-navy-600 hover:text-navy-900">
              How it works
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <WalletButton className="hidden sm:inline-flex" />
          {auth.user ? (
            <>
              <Link to={dashboardPath(auth.roles?.roles)} className={buttonClass("primary", "sm")}>
                <LayoutDashboard className="size-4" /> Dashboard
              </Link>
              <Button variant="ghost" size="sm" onClick={auth.signOut} aria-label="Sign out" title="Sign out">
                <LogOut className="size-4" />
              </Button>
            </>
          ) : (
            <Link to="/login" className={buttonClass("primary", "sm")}>
              Sign in
            </Link>
          )}
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-1.5 md:hidden">
        <Link to="/campaigns" className="rounded-md px-3 py-1 text-sm font-medium text-navy-700">
          Campaigns
        </Link>
        <Link to="/#how-it-works" className="rounded-md px-3 py-1 text-sm font-medium text-navy-700">
          How it works
        </Link>
        <WalletButton className="ml-auto sm:hidden" />
      </nav>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-navy-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>TrustChain · milestone-based charity escrow · {config.chainName} test network only — no real money.</p>
        <p className="font-mono" title={config.contractAddress}>
          Contract {config.contractAddress ? shortAddress(config.contractAddress, 6) : "not configured"} · chain {config.chainId}
        </p>
      </div>
    </footer>
  );
}

export function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <StatusBanners />
      <main className="flex-1">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const NAV: { role: Role; title: string; items: NavItem[] }[] = [
  {
    role: "ADMIN",
    title: "Admin",
    items: [
      { to: "/admin", label: "Overview", icon: Gauge, end: true },
      { to: "/admin/ngos", label: "NGO management", icon: Users },
      { to: "/admin/verifiers", label: "Verifier management", icon: ShieldCheck },
      { to: "/admin/campaigns", label: "Campaign monitoring", icon: Megaphone },
    ],
  },
  {
    role: "NGO",
    title: "NGO",
    items: [
      { to: "/ngo", label: "My campaigns", icon: LayoutDashboard, end: true },
      { to: "/ngo/campaigns/new", label: "Create campaign", icon: FilePlus2 },
    ],
  },
  {
    role: "VERIFIER",
    title: "Verifier",
    items: [
      { to: "/verifier", label: "Overview", icon: LayoutDashboard, end: true },
      { to: "/verifier/pending", label: "Pending reviews", icon: ClipboardCheck },
      { to: "/verifier/history", label: "Verification history", icon: History },
    ],
  },
  {
    role: "DONOR",
    title: "Donor",
    items: [
      { to: "/donor", label: "Overview", icon: HandCoins, end: true },
      { to: "/donor/donations", label: "My donations", icon: ListChecks },
    ],
  },
];

export function DashboardLayout() {
  const auth = useAuth();
  const location = useLocation();
  const roles = auth.roles?.roles ?? (auth.user ? ["DONOR"] : []);
  const sections = NAV.filter((s) => roles.includes(s.role));

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap",
      isActive ? "bg-navy-900 text-white" : "text-navy-600 hover:bg-slate-100 hover:text-navy-900",
    );

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <StatusBanners />
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row">
        <aside className="lg:w-60 lg:shrink-0">
          {/* Mobile: horizontal scroller. Desktop: sticky sidebar. */}
          <nav className="flex gap-1 overflow-x-auto pb-1 lg:sticky lg:top-24 lg:flex-col lg:gap-5 lg:overflow-visible" aria-label="Dashboard">
            {sections.map((s) => (
              <div key={s.role} className="flex gap-1 lg:flex-col">
                <p className="hidden px-3 pb-1 text-xs font-semibold tracking-wide text-navy-400 uppercase lg:block">{s.title}</p>
                {s.items.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
                    <item.icon className="size-4" aria-hidden /> {item.label}
                  </NavLink>
                ))}
              </div>
            ))}
            {auth.user && (
              <div className="hidden rounded-lg border border-slate-200 bg-white p-3 text-xs lg:block">
                <p className="font-medium text-navy-900">{auth.user.name}</p>
                <p className="font-mono text-navy-500">{shortAddress(auth.user.address)}</p>
                <p className="mt-1 text-navy-400">On-chain roles: {roles.join(", ")}</p>
              </div>
            )}
          </nav>
        </aside>
        <main className="min-w-0 flex-1" key={location.pathname}>
          <Outlet />
        </main>
      </div>
      <SiteFooter />
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-navy-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-navy-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
