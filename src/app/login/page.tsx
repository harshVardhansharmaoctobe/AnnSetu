'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Suspense, useState } from 'react';
import { LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { AuthShell } from '@/components/auth-shell';
import { Spinner } from '@/components/states';

const KNOWN_ERRORS = new Set([
  'Invalid email or password',
  'This account has been suspended. Contact the FoodBridge team.',
  'Too many failed sign-in attempts. Please wait 15 minutes and try again.',
]);

/** Only same-site relative paths are accepted as post-login destinations (no open redirects). */
function safeCallback(raw: string | null) {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard';
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const urlError = params.get('error');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    urlError ? (KNOWN_ERRORS.has(urlError) ? urlError : 'Sign-in failed. Please try again.') : null
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await signIn('credentials', { email, password, redirect: false });
      if (!result || result.error) {
        setError(result?.error && KNOWN_ERRORS.has(result.error) ? result.error : 'Invalid email or password');
        return;
      }
      router.push(safeCallback(params.get('callbackUrl')));
      router.refresh();
    } catch {
      setError('Could not reach FoodBridge. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl">Welcome back</CardTitle>
        <CardDescription>Sign in to coordinate food rescues.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link href="/forgot-password" className="text-xs text-green-700 hover:underline">Forgot password?</Link>
            </div>
            <PasswordInput id="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            {busy ? <Spinner className="mr-2" /> : <LogIn className="mr-2 h-4 w-4" />} Sign in
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          New to FoodBridge? <Link href="/register" className="font-medium text-green-700 hover:underline">Create an account</Link>
        </p>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <AuthShell>
        <Suspense fallback={<Spinner />}><LoginForm /></Suspense>
      </AuthShell>
  );
}
