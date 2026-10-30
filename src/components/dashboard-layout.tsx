'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Suspense, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, Award, BarChart3, Bell, CheckCircle2, ChevronDown, ClipboardList, FileClock, History, Hourglass, Inbox,
  LayoutDashboard, Leaf, LineChart, LogOut, Map as MapIcon, Menu, Package, PackageCheck, PlusCircle, Search, Settings,
  Truck, User, Users, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/client';
import { humanize } from '@/components/states';

type NavItem = { label: string; href: string; icon: React.ComponentType<{ className?: string }> };
type NavSection = { title?: string; items: NavItem[] };

const ACCOUNT: NavSection = {
  title: 'Account',
  items: [
    { label: 'Impact', href: '/dashboard/impact', icon: BarChart3 },
    { label: 'Notifications', href: '/dashboard/notifications', icon: Bell },
    { label: 'Profile', href: '/dashboard/profile', icon: User },
    { label: 'Settings', href: '/dashboard/settings', icon: Settings },
  ],
};

const ROLE_NAV: Record<string, NavSection[]> = {
  DONOR: [{
    items: [
      { label: 'Overview', href: '/dashboard/donor', icon: LayoutDashboard },
      { label: 'Add food donation', href: '/dashboard/donor/donations/new', icon: PlusCircle },
      { label: 'My donations', href: '/dashboard/donor/donations', icon: Package },
      { label: 'Incoming requests', href: '/dashboard/donor/requests?status=PENDING', icon: Inbox },
      { label: 'Approved requests', href: '/dashboard/donor/requests?status=ACCEPTED', icon: CheckCircle2 },
      { label: 'Volunteer tracking', href: '/dashboard/donor/tracking', icon: Truck },
      { label: 'Donation history', href: '/dashboard/donor/donations?status=COMPLETED', icon: History },
    ],
  }],
  NGO: [{
    items: [
      { label: 'Overview', href: '/dashboard/ngo', icon: LayoutDashboard },
      { label: 'Discover food', href: '/dashboard/ngo/browse', icon: Search },
      { label: 'Map', href: '/dashboard/ngo/browse?view=map', icon: MapIcon },
      { label: 'Food requests', href: '/dashboard/ngo/requests', icon: ClipboardList },
      { label: 'Active deliveries', href: '/dashboard/ngo/requests?group=active', icon: Truck },
      { label: 'Received food', href: '/dashboard/ngo/requests?group=received', icon: PackageCheck },
    ],
  }],
  VOLUNTEER: [{
    items: [
      { label: 'Available assignments', href: '/dashboard/volunteer?tab=available', icon: Search },
      { label: 'My assignments', href: '/dashboard/volunteer?tab=mine', icon: Truck },
      { label: 'Completed tasks', href: '/dashboard/volunteer?tab=completed', icon: CheckCircle2 },
      { label: 'Contribution', href: '/dashboard/volunteer?tab=contribution', icon: Award },
    ],
  }],
  ADMIN: [{
    items: [
      { label: 'Command center', href: '/dashboard/admin', icon: LayoutDashboard },
      { label: 'Users', href: '/dashboard/admin/users', icon: Users },
      { label: 'Volunteers', href: '/dashboard/admin/volunteers', icon: Truck },
      { label: 'Donations', href: '/dashboard/admin/donations', icon: Package },
      { label: 'Requests & deliveries', href: '/dashboard/admin/deliveries', icon: ClipboardList },
      { label: 'Reported issues', href: '/dashboard/admin/reports', icon: AlertTriangle },
      { label: 'Analytics', href: '/dashboard/admin/analytics', icon: LineChart },
      { label: 'Audit log', href: '/dashboard/admin/audit', icon: FileClock },
    ],
  }],
};

export interface ShellUser {
  name?: string | null;
  email?: string | null;
  role: string;
  accountStatus: string;
  avatarUrl?: string | null;
}

function Avatar({ user, size = 'h-8 w-8' }: { user: ShellUser; size?: string }) {
  const initials = (user.name ?? user.email ?? '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return user.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={user.avatarUrl} alt="" className={cn(size, 'rounded-full object-cover')} />
  ) : (
    <span className={cn(size, 'flex items-center justify-center rounded-full bg-green-100 text-xs font-semibold text-green-800')} aria-hidden>{initials}</span>
  );
}

function useUnreadCount(pathname: string) {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => api<{ unread: number }>('/api/notifications/count').then((r) => alive && setUnread(r.unread)).catch(() => {});
    load();
    const timer = setInterval(load, 30_000);
    window.addEventListener('notifications:changed', load);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener('notifications:changed', load);
    };
  }, [pathname]);
  return unread;
}

function UserMenu({ user }: { user: ShellUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-full p-1 pr-2 hover:bg-muted" aria-haspopup="menu" aria-expanded={open} data-testid="user-menu">
        <Avatar user={user} />
        <span className="hidden text-sm font-medium md:inline">{user.name}</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-56 rounded-lg border bg-white p-1 shadow-lg animate-fade-in">
          <div className="border-b px-3 py-2">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
          <Link role="menuitem" href="/dashboard/profile" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted"><User className="h-4 w-4" /> Profile</Link>
          <Link role="menuitem" href="/dashboard/settings" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted"><Settings className="h-4 w-4" /> Settings</Link>
          <button role="menuitem" onClick={() => signOut({ callbackUrl: '/' })} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-700 hover:bg-red-50"><LogOut className="h-4 w-4" /> Sign out</button>
        </div>
      )}
    </div>
  );
}

function Shell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const [open, setOpen] = useState(false);
  const unread = useUnreadCount(pathname);
  useEffect(() => setOpen(false), [pathname, search]);

  const approved = user.accountStatus === 'APPROVED';
  const sections: NavSection[] = approved
    ? [...(ROLE_NAV[user.role] ?? []), { ...ACCOUNT, items: ACCOUNT.items.filter((i) => !(user.role === 'ADMIN' && i.href === '/dashboard/profile')) }]
    : [{ items: [{ label: 'Account status', href: '/dashboard/pending', icon: Hourglass }] }, { ...ACCOUNT, items: ACCOUNT.items.filter((i) => i.href !== '/dashboard/impact') }];

  const allHrefs = sections.flatMap((s) => s.items.map((i) => i.href));
  // The most specific matching item wins (query-string items beat plain paths, deeper paths beat parents).
  const score = (href: string) => {
    const [path, query] = href.split('?');
    if (query) {
      if (pathname !== path) return -1;
      const wanted = new URLSearchParams(query);
      return [...wanted.entries()].every(([k, v]) => search.get(k) === v) ? 1000 + path.length : -1;
    }
    if (pathname === path) return 500 + path.length + (search.toString() ? 0 : 1);
    return pathname.startsWith(path + '/') ? path.length : -1;
  };
  const activeHref = allHrefs.reduce<string | null>((best, h) => (score(h) > (best ? score(best) : -1) ? h : best), null);

  const sidebar = (
    <nav className="flex h-full flex-col" aria-label="Dashboard">
      <Link href="/" className="flex items-center gap-2 px-5 py-5">
        <span className="rounded-lg gradient-primary p-1.5"><Leaf className="h-5 w-5 text-white" /></span>
        <span>
          <span className="block text-lg font-bold leading-tight">FoodBridge</span>
          <span className="block text-[11px] text-muted-foreground">From Surplus to Served</span>
        </span>
      </Link>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {sections.map((section, idx) => (
          <div key={section.title ?? idx}>
            {section.title && <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{section.title}</p>}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = item.href === activeHref;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      active ? 'bg-green-50 text-green-800' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                    aria-current={active ? 'page' : undefined}
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="flex-1">{item.label}</span>
                    {item.href === '/dashboard/notifications' && unread > 0 && (
                      <span className="rounded-full bg-green-600 px-2 py-0.5 text-xs text-white" data-testid="unread-badge">{unread}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t p-4 text-xs text-muted-foreground">
        Signed in as {humanize(user.role)}{!approved && ` · ${humanize(user.accountStatus)}`}
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r bg-white lg:block">{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl animate-slide-in">{sidebar}</aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b bg-white/90 px-4 backdrop-blur lg:px-8">
          <div className="flex items-center gap-2">
            <button onClick={() => setOpen((o) => !o)} aria-label={open ? 'Close menu' : 'Open menu'} className="p-2 lg:hidden" data-testid="menu-toggle">
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <Link href="/dashboard" className="flex items-center gap-2 font-bold lg:hidden"><Leaf className="h-5 w-5 text-green-600" /> FoodBridge</Link>
            <span className="hidden text-sm text-muted-foreground lg:inline">{humanize(user.role)} dashboard</span>
          </div>
          <div className="flex items-center gap-1">
            <Link href="/dashboard/notifications" className="relative rounded-full p-2 hover:bg-muted" aria-label={`Notifications (${unread} unread)`}>
              <Bell className="h-5 w-5" />
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-green-600 px-1 text-[10px] font-bold text-white">{unread > 99 ? '99+' : unread}</span>
              )}
            </Link>
            <UserMenu user={user} />
          </div>
        </header>
        <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

export default function DashboardLayout(props: { user: ShellUser; children: React.ReactNode }) {
  return <Suspense fallback={null}><Shell {...props} /></Suspense>;
}
