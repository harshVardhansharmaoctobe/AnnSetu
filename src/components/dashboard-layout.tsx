'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  LayoutDashboard,
  PlusCircle,
  Package,
  Inbox,
  Truck,
  History,
  BarChart3,
  Settings,
  Search,
  ClipboardList,
  CheckCircle2,
  MapPin,
  Route,
  Users,
  Shield,
  AlertTriangle,
  Bell,
  LogOut,
  Menu,
  X,
  Leaf,
} from 'lucide-react';
import { useState, useEffect } from 'react';

const ROLE_NAV: Record<string, { label: string; href: string; icon: any }[]> = {
  DONOR: [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Create Donation', href: '/dashboard/donations/create', icon: PlusCircle },
    { label: 'My Donations', href: '/dashboard/donations', icon: Package },
    { label: 'Incoming Requests', href: '/dashboard/requests', icon: Inbox },
    { label: 'Active Deliveries', href: '/dashboard/deliveries', icon: Truck },
    { label: 'History', href: '/dashboard/history', icon: History },
    { label: 'Impact', href: '/dashboard/impact', icon: BarChart3 },
    { label: 'Profile', href: '/dashboard/profile', icon: Settings },
  ],
  NGO: [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Discover Food', href: '/dashboard/discover', icon: Search },
    { label: 'My Requests', href: '/dashboard/requests', icon: ClipboardList },
    { label: 'Active Deliveries', href: '/dashboard/deliveries', icon: Truck },
    { label: 'Completed', href: '/dashboard/history', icon: CheckCircle2 },
    { label: 'Impact', href: '/dashboard/impact', icon: BarChart3 },
    { label: 'Profile', href: '/dashboard/profile', icon: Settings },
  ],
  VOLUNTEER: [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Available Tasks', href: '/dashboard/tasks', icon: MapPin },
    { label: 'Active Assignment', href: '/dashboard/active', icon: Route },
    { label: 'History', href: '/dashboard/history', icon: History },
    { label: 'Profile', href: '/dashboard/profile', icon: Settings },
  ],
  ADMIN: [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Users', href: '/dashboard/users', icon: Users },
    { label: 'Donors', href: '/dashboard/donors', icon: Package },
    { label: 'NGOs', href: '/dashboard/ngos', icon: Shield },
    { label: 'Donations', href: '/dashboard/donations', icon: Package },
    { label: 'Requests', href: '/dashboard/requests', icon: ClipboardList },
    { label: 'Deliveries', href: '/dashboard/deliveries', icon: Truck },
    { label: 'Disputes', href: '/dashboard/disputes', icon: AlertTriangle },
    { label: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
  ],
};

const ROLE_COLORS: Record<string, string> = {
  DONOR: 'bg-blue-100 text-blue-800',
  NGO: 'bg-purple-100 text-purple-800',
  VOLUNTEER: 'bg-orange-100 text-orange-800',
  ADMIN: 'bg-red-100 text-red-800',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);

  const role = session?.user?.role || 'DONOR';
  const navItems = ROLE_NAV[role] || [];

  // Fetch unread notification count
  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const res = await fetch('/api/notifications/count');
        if (res.ok) {
          const data = await res.json();
          setNotificationCount(data.count);
        }
      } catch { /* ignore */ }
    };
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // poll every 30s
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile header */}
      <div className="lg:hidden flex items-center justify-between p-4 bg-white border-b sticky top-0 z-30">
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2">
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <Link href="/dashboard" className="flex items-center gap-2">
          <Leaf className="h-6 w-6 text-green-600" />
          <span className="font-bold text-lg">FoodBridge</span>
        </Link>
        <Link href="/dashboard/notifications" className="relative p-2">
          <Bell className="h-5 w-5" />
          {notificationCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
              {notificationCount > 9 ? '9+' : notificationCount}
            </span>
          )}
        </Link>
      </div>

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 bg-white border-r transform transition-transform duration-200 ease-in-out lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center gap-3 p-6 border-b">
            <div className="h-10 w-10 rounded-lg gradient-primary flex items-center justify-center">
              <Leaf className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg">FoodBridge</h1>
              <p className="text-xs text-muted-foreground">Food Rescue Platform</p>
            </div>
          </div>

          {/* User info */}
          <div className="p-4 border-b">
            <p className="font-medium text-sm truncate">{session?.user?.name}</p>
            <p className="text-xs text-muted-foreground truncate">{session?.user?.email}</p>
            <Badge className={cn('mt-2', ROLE_COLORS[role])}>{role}</Badge>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-green-50 text-green-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  )}
                >
                  <Icon className={cn('h-4 w-4', isActive && 'text-green-600')} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t space-y-2">
            <Link
              href="/dashboard/notifications"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Bell className="h-4 w-4" />
              Notifications
              {notificationCount > 0 && (
                <Badge variant="destructive" className="ml-auto text-xs">{notificationCount}</Badge>
              )}
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-colors w-full"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/20 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main content */}
      <main className="lg:ml-64 min-h-screen">
        <div className="p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
