'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { AuthShell } from '@/components/auth-shell';
import { Spinner } from '@/components/states';
import { api, type ApiClientError } from '@/lib/client';

function ResetForm() {
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirmPassword) return setError('Passwords do not match.');
    setBusy(true);
    try {
      await api('/api/password/reset', { body: { token, password, confirmPassword } });
      setDone(true);
    } catch (err) {
      setError((err as ApiClientError).message);
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return <p className="text-sm">This link is incomplete. <Link href="/forgot-password" className="text-green-700 hover:underline">Request a new reset</Link>.</p>;
  }
  if (done) {
    return (
      <div className="space-y-3 text-sm" role="status">
        <CheckCircle2 className="h-10 w-10 text-green-600" />
        <p className="font-medium">Your password has been changed.</p>
        <p className="text-muted-foreground">For your security, all existing sessions were signed out.</p>
        <Button asChild><Link href="/login">Sign in</Link></Button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="password">New password</Label>
        <PasswordInput id="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword">Confirm new password</Label>
        <PasswordInput id="confirmPassword" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
      </div>
      {error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-800" role="alert">
          {error} {error.includes('expired') && <Link href="/forgot-password" className="underline">Request a new link</Link>}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={busy}>{busy && <Spinner className="mr-2" />} Set new password</Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell>
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl">Choose a new password</CardTitle>
            <CardDescription>Reset links work once and expire after one hour.</CardDescription>
          </CardHeader>
          <CardContent><Suspense fallback={<Spinner />}><ResetForm /></Suspense></CardContent>
        </Card>
      </AuthShell>
  );
}
