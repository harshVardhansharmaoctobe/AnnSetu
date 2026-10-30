'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';
import {
  AlertTriangle, BarChart3, Bell, ClipboardList, FileClock, Hourglass, Inbox, LayoutDashboard, Leaf, LogOut, Menu,
  Package, PlusCircle, Search, Truck, User, Users, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/client';
import { humanize } from '@/components/states';

type NavItem = { label: string; href: string; icon: React.ComponentType<{ className?: string }>; exact?: boolean };

const COMMON: NavItem[] = [
  { label: 'Impact', href: '/dashboard/impact', icon: BarChart3 },
  { label: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  { label: 'Profile', href: '/dashboard/profile', icon: User },
];

const ROLE_NAV: Record<string, NavItem[]> = {
  DONOR: [
    { label: 'Overview', href: '/dashboard/donor', icon: LayoutDashboard, exact: true },
    { label: 'New donation', href: '/dashboard/donor/donations/new', icon: PlusCircle },
    { label: 'My donations', href: '/dashboard/donor/donations', icon: Package, exact: true },
    { label: 'Requests', href: '/dashboard/donor/requests', icon: Inbox },
  ],
  NGO: [
    { label: 'Overview', href: '/dashboard/ngo', icon: LayoutDashboard, exact: true },
    { label: 'Find food', href: '/dashboard/ngo/browse', icon: Search },
    { label: 'My requests', href: '/dashboard/ngo/requests', icon: ClipboardList },
  ],
  VOLUNTEER: [
    { label: 'Deliveries', href: '/dashboard/volunteer', icon: Truck, exact: true },
  ],
  ADMIN: [
    { label: 'Overview', href: '/dashboard/admin', icon: LayoutDashboard, exact: true },
    { label: 'Users', href: '/dashboard/admin/users', icon: Users },
    { label: 'Deliveries', href: '/dashboard/admin/deliveries', icon: Truck },
    { label: 'Donations', href: '/dashboard/admin/donations', icon: Package },
    { label: 'Reports', href: '/dashboard/admin/reports', icon: AlertTriangle },
    { label: 'Audit log', href: '/dashboard/admin/audit', icon: FileClock },
  ],
};

export interface ShellUser {
  name?: string | null;
  email?: string | null;
  role: string;
  accountStatus: string;
}

export default function DashboardLayout({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  const approved = user.accountStatus === 'APPROVED';
  const nav: NavItem[] = approved
    ? [...(ROLE_NAV[user.role] ?? []), ...COMMON.filter((c) => !(user.role === 'ADMIN' && c.href === '/dashboard/profile'))]
    : [{ label: 'Account status', href: '/dashboard/pending', icon: Hourglass }, ...COMMON.filter((c) => c.href !== '/dashboard/impact')];

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<{ unread: number }>('/api/notifications/count')
        .then((r) => alive && setUnread(r.unread))
        .catch(() => {});
    load();
    const timer = setInterval(load, 30_000);
    window.addEventListener('notifications:changed', load);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener('notifications:changed', load);
    };
  }, [pathname]);

  useEffect(() => setOpen(false), [pathname]);

  const isActive = (item: NavItem) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + '/'));

  const sidebar = (
    <nav className="flex h-full flex-col" aria-label="Dashboard">
      <Link href="/" className="flex items-center gap-2 px-5 py-5">
        <span className="rounded-lg gradient-primary p-1.5"><Leaf className="h-5 w-5 text-white" /></span>
        <span className="text-lg font-bold">FoodBridge</span>
      </Link>
      <div className="flex-1 space-y-1 overflow-y-auto px-3">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive(item) ? 'bg-green-50 text-green-800' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
            aria-current={isActive(item) ? 'page' : undefined}
          >
            <item.icon className="h-4 w-4" />
            <span className="flex-1">{item.label}</span>
            {item.href === '/dashboard/notifications' && unread > 0 && (
              <span className="rounded-full bg-green-600 px-2 py-0.5 text-xs text-white" data-testid="unread-badge">{unread}</span>
            )}
          </Link>
        ))}
      </div>
      <div className="border-t p-4">
        <p className="truncate text-sm font-semibold">{user.name}</p>
        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {humanize(user.role)}{!approved && ` · ${humanize(user.accountStatus)}`}
        </p>
        <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => signOut({ callbackUrl: '/' })}>
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </Button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-white lg:block">{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl animate-slide-in">{sidebar}</aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-white/90 px-4 backdrop-blur lg:hidden">
          <button onClick={() => setOpen((o) => !o)} aria-label={open ? 'Close menu' : 'Open menu'} className="p-2" data-testid="menu-toggle">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <Link href="/" className="flex items-center gap-2 font-bold"><Leaf className="h-5 w-5 text-green-600" /> FoodBridge</Link>
          <Link href="/dashboard/notifications" className="relative p-2" aria-label={`Notifications (${unread} unread)`}>
            <Bell className="h-5 w-5" />
            {unread > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-green-600" />}
          </Link>
        </header>
        <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
