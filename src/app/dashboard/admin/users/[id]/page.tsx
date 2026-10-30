'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Copy, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UserActions } from '@/components/user-actions';
import { MapView } from '@/components/map-view';
import { ErrorState, LoadingCards, PageHeader, Spinner, StatusBadge, humanize } from '@/components/states';
import { useToast } from '@/components/toaster';
import { api, useApi, type ApiClientError } from '@/lib/client';
import { formatDate, formatDateTime } from '@/lib/utils';

interface Place { address: string | null; latitude: number | null; longitude: number | null }
interface UserDetail {
  id: string; name: string; email: string; phone: string | null; role: string; accountStatus: string; createdAt: string;
  avatarUrl: string | null; isDemo: boolean;
  donorProfile: (Place & { organisationName: string; organisationType: string; description: string | null }) | null;
  ngoProfile: (Place & { organisationName: string; registrationNumber: string | null; receivingCapacity: number; description: string | null }) | null;
  volunteerProfile: (Place & { vehicleType: string | null; availability: string | null; isAvailable: boolean; maxDistance: number }) | null;
  activity: { donations: Record<string, number>; requests: Record<string, number>; assignments: Record<string, number> };
  history: { id: string; action: string; details: string | null; createdAt: string; user: { name: string; role: string } | null }[];
}

function Counts({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data);
  if (entries.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{title}</p>
      <div className="flex flex-wrap gap-2">{entries.map(([k, v]) => <span key={k} className="flex items-center gap-1"><StatusBadge status={k} /><b className="text-sm">{v}</b></span>)}</div>
    </div>
  );
}

export default function AdminUserDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<UserDetail>(`/api/admin/users/${id}`);
  const [reset, setReset] = useState<{ resetUrl: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <LoadingCards count={2} />;
  if (error || !data) return <ErrorState message={error?.message ?? 'User not found'} onRetry={reload} />;
  const u = data;
  const profile = u.donorProfile ?? u.ngoProfile ?? u.volunteerProfile;

  async function issueReset() {
    setBusy(true);
    try {
      setReset(await api(`/api/admin/users/${id}/reset-link`, { method: 'POST', body: {} }));
    } catch (e) {
      toast.error('Could not create a reset link', (e as ApiClientError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/admin/users')}><ArrowLeft className="mr-1 h-4 w-4" /> Users</Button>
      <PageHeader
        title={u.name}
        description={`${humanize(u.role)} · joined ${formatDate(u.createdAt)}${u.isDemo ? ' · demo account' : ''}`}
        actions={<><StatusBadge status={u.accountStatus} className="self-center" /><UserActions user={u} onChanged={reload} /></>}
      />
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Contact</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>{u.email}</p>
            <p className="text-muted-foreground">{u.phone ?? 'No phone number'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Profile</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {!profile && <p className="text-muted-foreground">{u.role === 'ADMIN' ? 'Administrator account' : 'Profile not completed yet.'}</p>}
            {u.donorProfile && <><p className="font-medium">{u.donorProfile.organisationName}</p><p className="text-muted-foreground">{humanize(u.donorProfile.organisationType)}</p></>}
            {u.ngoProfile && <><p className="font-medium">{u.ngoProfile.organisationName}</p><p className="text-muted-foreground">Reg. no. {u.ngoProfile.registrationNumber ?? '—'} · capacity {u.ngoProfile.receivingCapacity} meals</p></>}
            {u.volunteerProfile && <p className="text-muted-foreground">{u.volunteerProfile.vehicleType ?? 'No vehicle given'} · {u.volunteerProfile.availability ?? 'availability not given'} · {u.volunteerProfile.isAvailable ? 'available' : 'unavailable'} · up to {u.volunteerProfile.maxDistance} km</p>}
            {profile?.address && <p>{profile.address}</p>}
            {(u.donorProfile?.description ?? u.ngoProfile?.description) && <p className="text-muted-foreground">{u.donorProfile?.description ?? u.ngoProfile?.description}</p>}
          </CardContent>
        </Card>
      </div>
      {profile?.latitude != null && profile.longitude != null && (
        <MapView className="h-56" label="Registered location" markers={[{ id: u.id, lat: profile.latitude, lng: profile.longitude, title: u.name, subtitle: profile.address ?? undefined, tone: u.role === 'NGO' ? 'blue' : 'green' }]} />
      )}
      <Card>
        <CardHeader><CardTitle className="text-base">Activity</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Counts title="Donations" data={u.activity.donations} />
          <Counts title="Food requests" data={u.activity.requests} />
          <Counts title="Volunteer assignments" data={u.activity.assignments} />
          {Object.keys({ ...u.activity.donations, ...u.activity.requests, ...u.activity.assignments }).length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
        </CardContent>
      </Card>
      {u.role !== 'ADMIN' && u.accountStatus !== 'SUSPENDED' && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4" /> Password reset</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">Create a one-time link (valid 1 hour) and share it with the user through a channel you trust. Issuing a new link cancels older ones.</p>
            {reset ? (
              <div className="space-y-2 rounded-md border bg-muted/40 p-3">
                <code className="block break-all text-xs" data-testid="reset-url">{reset.resetUrl}</code>
                <p className="text-xs text-muted-foreground">Expires {formatDateTime(reset.expiresAt)}. It is shown only once.</p>
                <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(reset.resetUrl).then(() => toast.success('Link copied'))}><Copy className="mr-1 h-4 w-4" /> Copy link</Button>
              </div>
            ) : (
              <Button variant="outline" onClick={issueReset} disabled={busy}>{busy && <Spinner className="mr-2" />} Issue reset link</Button>
            )}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle className="text-base">Account history</CardTitle></CardHeader>
        <CardContent>
          {u.history.length === 0 ? <p className="text-sm text-muted-foreground">No audit entries.</p> : (
            <ul className="divide-y text-sm">
              {u.history.map((h) => (
                <li key={h.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span><span className="font-medium">{humanize(h.action)}</span>{h.details && <span className="text-muted-foreground"> · {h.details}</span>}</span>
                  <span className="text-xs text-muted-foreground">{h.user ? `${h.user.name} · ` : ''}{formatDateTime(h.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
