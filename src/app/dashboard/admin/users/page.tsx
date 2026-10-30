'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { UserActions } from '@/components/user-actions';
import { EmptyState, ErrorState, LoadingCards, PageHeader, Pagination, StatusBadge, humanize } from '@/components/states';
import { useApi, toQuery, type ListResult } from '@/lib/client';
import { formatDate } from '@/lib/utils';

interface UserRow {
  id: string; name: string; email: string; phone: string | null; role: string; accountStatus: string; createdAt: string;
  donorProfile: { organisationName: string; address: string } | null;
  ngoProfile: { organisationName: string; registrationNumber: string | null; address: string } | null;
  volunteerProfile: { address: string | null; vehicleType: string | null; availability: string | null } | null;
}

function UsersInner() {
  const params = useSearchParams();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => { setDebounced(q); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data, error, loading, reload } = useApi<ListResult<UserRow>>(`/api/admin/users${toQuery({ q: debounced, role, status, page })}`);

  return (
    <div>
      <PageHeader title="Users" description="Review, approve and manage donor, NGO and volunteer accounts." />
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_12rem_12rem]">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
        </div>
        <NativeSelect aria-label="Role" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
          <option value="">All roles</option>
          {['DONOR', 'NGO', 'VOLUNTEER', 'ADMIN'].map((r) => <option key={r} value={r}>{humanize(r)}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'].map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
        </NativeSelect>
      </div>
      {loading && !data ? <LoadingCards />
        : error ? <ErrorState message={error.message} onRetry={reload} />
          : data!.items.length === 0 ? <EmptyState title="No users match these filters" />
            : (
              <div className="overflow-x-auto rounded-xl border bg-white">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                    <tr><th className="p-3">User</th><th className="p-3">Role</th><th className="p-3">Details</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {data!.items.map((u) => {
                      const org = u.donorProfile ?? u.ngoProfile;
                      return (
                        <tr key={u.id} data-testid="user-row">
                          <td className="p-3"><p className="font-medium">{u.name}</p><p className="text-xs text-muted-foreground">{u.email}{u.phone && ` · ${u.phone}`}</p></td>
                          <td className="p-3">{humanize(u.role)}</td>
                          <td className="p-3 text-xs text-muted-foreground">
                            {org ? <>{org.organisationName}<br />{org.address}</> : u.volunteerProfile ? <>{u.volunteerProfile.address ?? 'No service area'}{u.volunteerProfile.vehicleType && ` · ${u.volunteerProfile.vehicleType}`}</> : u.role === 'ADMIN' ? '—' : 'Profile not completed'}
                            <br />Joined {formatDate(u.createdAt)}
                          </td>
                          <td className="p-3"><StatusBadge status={u.accountStatus} /></td>
                          <td className="p-3"><UserActions user={u} onChanged={reload} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    </div>
  );
}

export default function UsersPage() {
  return <Suspense fallback={<LoadingCards />}><UsersInner /></Suspense>;
}
