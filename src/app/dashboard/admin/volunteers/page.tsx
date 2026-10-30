'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Truck } from 'lucide-react';
import { EmptyState, ErrorState, LoadingCards, PageHeader, Pagination, StatusBadge, humanize } from '@/components/states';
import { useApi, toQuery, type ListResult } from '@/lib/client';

interface VolunteerRow {
  id: string; address: string | null; vehicleType: string | null; availability: string | null; isAvailable: boolean; maxDistance: number;
  completedDeliveries: number;
  user: { id: string; name: string; email: string; phone: string | null; accountStatus: string };
  assignments: { id: string; status: string; request: { id: string; donation: { foodName: string }; ngoProfile: { organisationName: string } } }[];
}

/** Volunteer management: availability, current assignments and completed deliveries. */
export default function AdminVolunteersPage() {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<ListResult<VolunteerRow>>(`/api/admin/volunteers${toQuery({ page })}`);
  return (
    <div>
      <PageHeader title="Volunteers" description="Who is available, who is carrying food right now, and who has delivered." />
      {loading && !data ? <LoadingCards />
        : error ? <ErrorState message={error.message} onRetry={reload} />
          : data!.items.length === 0 ? <EmptyState icon={Truck} title="No volunteers yet" />
            : (
              <div className="overflow-x-auto rounded-xl border bg-white">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                    <tr><th className="p-3">Volunteer</th><th className="p-3">Service area</th><th className="p-3">Current assignments</th><th className="p-3">Delivered</th><th className="p-3">Account</th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {data!.items.map((v) => (
                      <tr key={v.id} data-testid="volunteer-row">
                        <td className="p-3">
                          <Link href={`/dashboard/admin/users/${v.user.id}`} className="font-medium hover:underline">{v.user.name}</Link>
                          <p className="text-xs text-muted-foreground">{v.user.phone ?? v.user.email}</p>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {v.address ?? 'Not set'}<br />{v.vehicleType ?? 'no vehicle given'} · up to {v.maxDistance} km · {v.isAvailable ? 'available' : 'unavailable'}
                        </td>
                        <td className="p-3 text-xs">
                          {v.assignments.length === 0 ? <span className="text-muted-foreground">None</span> : v.assignments.map((a) => (
                            <Link key={a.id} href={`/dashboard/admin/deliveries/${a.request.id}`} className="block hover:underline">
                              {a.request.donation.foodName} → {a.request.ngoProfile.organisationName} <span className="text-muted-foreground">({humanize(a.status).toLowerCase()})</span>
                            </Link>
                          ))}
                        </td>
                        <td className="p-3 font-semibold">{v.completedDeliveries}</td>
                        <td className="p-3"><StatusBadge status={v.user.accountStatus} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    </div>
  );
}
