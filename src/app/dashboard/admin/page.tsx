'use client';

import Link from 'next/link';
import { AlertTriangle, Package, Truck, UserCheck, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ImpactPanel, type ImpactData } from '@/components/impact-panel';
import { AdminMap } from '@/components/admin-map';
import { UserActions } from '@/components/user-actions';
import { EmptyState, ErrorState, LoadingCards, PageHeader, StatCard, StatusBadge, humanize } from '@/components/states';
import { useApi, type ListResult } from '@/lib/client';
import { formatDateTime } from '@/lib/utils';

interface AdminStats {
  users: { total: number; pending: number; byRole: Record<string, number>; byStatus: Record<string, number> };
  donationsByStatus: Record<string, number>;
  requestsByStatus: Record<string, number>;
  activeAssignments: number;
  awaitingVolunteer: number;
  openDisputes: number;
  impact: ImpactData;
}
interface PendingUser {
  id: string; name: string; email: string; role: string; accountStatus: string; createdAt: string;
  donorProfile: { organisationName: string } | null; ngoProfile: { organisationName: string } | null;
}

export default function AdminOverview() {
  const stats = useApi<AdminStats>('/api/admin/stats');
  const pending = useApi<ListResult<PendingUser>>('/api/admin/users?status=PENDING&pageSize=10');
  const refresh = () => { stats.reload(); pending.reload(); };

  if (stats.loading && !stats.data) return <LoadingCards count={4} />;
  if (stats.error || !stats.data) return <ErrorState message={stats.error?.message ?? 'Could not load stats'} onRetry={stats.reload} />;
  const s = stats.data;
  const disputes = s.openDisputes;
  const units = (u: { MEALS: number; KG: number }) =>
    [u.MEALS ? `${u.MEALS} meals` : null, u.KG ? `${u.KG} kg` : null].filter(Boolean).join(' + ') || '0';

  return (
    <div className="space-y-8">
      <PageHeader title="Admin dashboard" description="Approve accounts, keep deliveries moving and monitor platform impact." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Pending approvals" value={s.users.pending} hint={`${s.users.total} accounts in total`} icon={UserCheck} tone="amber" />
        <StatCard label="Awaiting a volunteer" value={s.awaitingVolunteer} hint="Approved requests" icon={Truck} tone="rose" />
        <StatCard label="Deliveries in progress" value={s.activeAssignments} icon={Package} tone="blue" />
        <Link href="/dashboard/admin/reports" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <StatCard label="Open reports" value={disputes} hint="Delivery problems to review" icon={AlertTriangle} tone={disputes ? 'rose' : 'slate'} />
        </Link>
      </div>

      <section aria-label="Users by role" data-testid="users-by-role">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Users</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Total users', value: s.users.total, href: '/dashboard/admin/users' },
            { label: 'Donors', value: s.users.byRole.DONOR ?? 0, href: '/dashboard/admin/users?role=DONOR' },
            { label: 'NGOs', value: s.users.byRole.NGO ?? 0, href: '/dashboard/admin/users?role=NGO' },
            { label: 'Volunteers', value: s.users.byRole.VOLUNTEER ?? 0, href: '/dashboard/admin/volunteers' },
          ].map((c) => (
            <Link key={c.label} href={c.href} className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <StatCard label={c.label} value={c.value} icon={Users} tone="slate" />
            </Link>
          ))}
        </div>
      </section>

      <section aria-label="Food and deliveries">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Food and deliveries</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Total donations" value={s.impact.donations.total} icon={Package} />
          <StatCard label="Available food" value={units(s.impact.donations.quantityAvailable)} hint="Unreserved, unexpired" icon={Package} tone="blue" />
          <StatCard label="Reserved food" value={units(s.impact.donations.quantityReserved)} hint="Approved, not yet confirmed" icon={Package} tone="amber" />
          <StatCard label="Completed deliveries" value={s.impact.deliveries.completed} hint="Confirmed by NGOs" icon={Truck} />
          <StatCard label="Cancelled requests" value={s.requestsByStatus.CANCELLED ?? 0} icon={AlertTriangle} tone="slate" />
        </div>
      </section>

      <Card>
        <CardHeader><CardTitle className="text-lg">Platform map</CardTitle></CardHeader>
        <CardContent><AdminMap /></CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg">Accounts awaiting approval</CardTitle>
          <Link href="/dashboard/admin/users?status=PENDING" className="text-sm text-green-700 hover:underline">All users</Link>
        </CardHeader>
        <CardContent>
          {pending.loading && !pending.data ? <LoadingCards count={1} />
            : pending.error ? <ErrorState message={pending.error.message} onRetry={pending.reload} />
              : pending.data!.items.length === 0 ? <EmptyState icon={Users} title="No pending accounts" />
                : (
                  <ul className="divide-y">
                    {pending.data!.items.map((u) => (
                      <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid="pending-user">
                        <div>
                          <p className="font-medium">{u.name} <span className="text-xs text-muted-foreground">· {humanize(u.role)}</span></p>
                          <p className="text-xs text-muted-foreground">
                            {u.email} · {u.donorProfile?.organisationName ?? u.ngoProfile?.organisationName ?? 'No organisation profile yet'} · {formatDateTime(u.createdAt)}
                          </p>
                        </div>
                        <UserActions user={u} onChanged={refresh} />
                      </li>
                    ))}
                  </ul>
                )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {[{ title: 'Donations by status', data: s.donationsByStatus }, { title: 'Requests by status', data: s.requestsByStatus }].map((block) => (
          <Card key={block.title}>
            <CardHeader><CardTitle className="text-base">{block.title}</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {Object.keys(block.data).length === 0 ? <p className="text-sm text-muted-foreground">None yet</p>
                : Object.entries(block.data).map(([k, v]) => <span key={k} className="flex items-center gap-1"><StatusBadge status={k} /><span className="text-sm font-semibold">{v}</span></span>)}
            </CardContent>
          </Card>
        ))}
      </div>

      <ImpactPanel data={s.impact} />
    </div>
  );
}
