'use client';

import Link from 'next/link';
import { useState } from 'react';
import { MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PublicHeader } from '@/components/public-chrome';
import { Spinner } from '@/components/states';
import { api, type ApiClientError } from '@/lib/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api('/api/password/forgot', { body: { email } });
      setSent(true);
    } catch (err) {
      setError((err as ApiClientError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen gradient-hero">
      <PublicHeader />
      <main className="flex justify-center px-4 py-16">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl">Forgot your password?</CardTitle>
            <CardDescription>Enter your account email and we will start a password reset.</CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="space-y-3 text-sm" role="status">
                <MailCheck className="h-10 w-10 text-green-600" />
                <p className="font-medium">If an account exists for {email}, a reset has been started.</p>
                <p className="text-muted-foreground">
                  The reset link is valid for one hour. This FoodBridge installation does not send email yet: the FoodBridge
                  team has been notified and will share the link with you through your registered contact details.
                </p>
                <Link href="/login" className="inline-block font-medium text-green-700 hover:underline">Back to sign in</Link>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
                <Button type="submit" className="w-full" disabled={busy}>{busy && <Spinner className="mr-2" />} Reset password</Button>
                <p className="text-center text-sm"><Link href="/login" className="text-green-700 hover:underline">Back to sign in</Link></p>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
