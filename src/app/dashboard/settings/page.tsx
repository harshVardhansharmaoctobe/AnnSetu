'use client';

import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { useState } from 'react';
import { KeyRound, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader, Spinner, StatusBadge, humanize } from '@/components/states';
import { useToast } from '@/components/toaster';
import { api, type ApiClientError } from '@/lib/client';

export default function SettingsPage() {
  const toast = useToast();
  const { data: session } = useSession();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) return setError('New password must be at least 8 characters.');
    if (newPassword !== confirmPassword) return setError('New passwords do not match.');
    setBusy(true);
    try {
      await api('/api/password/change', { body: { currentPassword, newPassword, confirmPassword } });
      toast.success('Password changed', 'Please sign in with your new password.');
      await signOut({ callbackUrl: '/login' });
    } catch (err) {
      setError((err as ApiClientError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Manage your account security." />
      <Card>
        <CardHeader><CardTitle className="text-lg">Account</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
          <div><p className="text-muted-foreground">Email</p><p className="font-medium">{session?.user?.email}</p></div>
          <div><p className="text-muted-foreground">Role</p><p className="font-medium">{session?.user && humanize(session.user.role)}</p></div>
          <div><p className="text-muted-foreground">Status</p>{session?.user && <StatusBadge status={session.user.accountStatus} />}</div>
          <p className="text-muted-foreground sm:col-span-3">Edit your name, phone, photo and organisation details on your <Link href="/dashboard/profile" className="text-green-700 hover:underline">profile</Link>.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><KeyRound className="h-5 w-5" /> Change password</CardTitle>
          <CardDescription>Changing your password signs you out on every device.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={change} className="max-w-md space-y-4">
            <div className="space-y-1.5"><Label htmlFor="currentPassword">Current password</Label><Input id="currentPassword" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="newPassword">New password</Label><Input id="newPassword" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="confirmNewPassword">Confirm new password</Label><Input id="confirmNewPassword" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></div>
            {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
            <Button type="submit" disabled={busy}>{busy && <Spinner className="mr-2" />} Change password</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-6">
          <p className="text-sm">Sign out of FoodBridge on this device.</p>
          <Button variant="outline" onClick={() => signOut({ callbackUrl: '/' })}><LogOut className="mr-2 h-4 w-4" /> Sign out</Button>
        </CardContent>
      </Card>
    </div>
  );
}
