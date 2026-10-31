'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { Building2, HandHeart, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { AuthShell } from '@/components/auth-shell';
import { Spinner } from '@/components/states';
import { api, type ApiClientError } from '@/lib/client';
import { cn } from '@/lib/utils';

const ROLES = [
  { value: 'DONOR', slug: 'donor', label: 'Donor', hint: 'I have surplus food', icon: Building2 },
  { value: 'NGO', slug: 'ngo', label: 'NGO', hint: 'We distribute food', icon: HandHeart },
  { value: 'VOLUNTEER', slug: 'volunteer', label: 'Volunteer', hint: 'I can deliver food', icon: Truck },
] as const;

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState<'DONOR' | 'NGO' | 'VOLUNTEER'>('DONOR');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    if (password !== confirmPassword) {
      setErrors({ confirmPassword: ['Passwords do not match'] });
      return;
    }
    setBusy(true);
    try {
      await api('/api/register', { body: { name, email, phone: phone || undefined, password, confirmPassword, role } });
      const result = await signIn('credentials', { email, password, redirect: false });
      router.push(result?.error ? '/login' : '/dashboard/profile');
      router.refresh();
    } catch (err) {
      const apiErr = err as ApiClientError;
      setErrors(apiErr.fieldErrors);
      setFormError(apiErr.message === 'Validation failed' ? 'Please fix the highlighted fields.' : apiErr.message);
    } finally {
      setBusy(false);
    }
  }

  const field = (id: string, label: string, input: React.ReactNode) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {input}
      {errors[id]?.[0] && <p className="text-sm text-destructive">{errors[id]![0]}</p>}
    </div>
  );

  return (
    <AuthShell>
        <Card className="w-full max-w-lg shadow-md border-green-100">
          <CardHeader>
            <CardTitle className="text-2xl font-bold">Join FoodBridge</CardTitle>
            <CardDescription>
              Every account is verified by an admin. You will complete your profile on the next step.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4" noValidate>
              <fieldset>
                <legend className="mb-2 text-sm font-medium">I am joining as</legend>
                <div className="grid grid-cols-3 gap-2">
                  {ROLES.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setRole(r.value)}
                      aria-pressed={role === r.value}
                      data-testid={`role-${r.value}`}
                      className={cn(
                        'flex flex-col items-center rounded-lg border p-3 text-center text-sm transition',
                        role === r.value ? 'border-green-600 bg-green-50 text-green-900 font-semibold ring-1 ring-green-600' : 'hover:bg-muted'
                      )}
                    >
                      <r.icon className="h-5 w-5 mb-1" />
                      <span>{r.label}</span>
                      <span className="text-[11px] text-muted-foreground">{r.hint}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              {field('name', 'Full name', <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="e.g. Rahul Sharma" />)}
              {field('email', 'Email', <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e.g. rahul@example.com" />)}
              {field('phone', 'Phone (optional)', <Input id="phone" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} placeholder="+91 98765 43210" />)}
              <div className="grid gap-4 sm:grid-cols-2">
                {field('password', 'Password', <PasswordInput id="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" />)}
                {field('confirmPassword', 'Confirm password', <PasswordInput id="confirmPassword" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repeat password" />)}
              </div>
              <p className="text-xs text-muted-foreground">Passwords must be at least 8 characters long.</p>
              {formError && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800" role="alert">{formError}</p>}
              <Button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white" size="lg" disabled={busy}>
                {busy && <Spinner className="mr-2" />} Create account
              </Button>
            </form>
            <div className="mt-6 flex flex-col gap-2 border-t pt-4 text-center text-sm text-muted-foreground">
              <p>
                Looking for role details?{' '}
                <Link href="/register/donor" className="text-green-700 hover:underline">Donor</Link> ·{' '}
                <Link href="/register/ngo" className="text-green-700 hover:underline">NGO</Link> ·{' '}
                <Link href="/register/volunteer" className="text-green-700 hover:underline">Volunteer</Link>
              </p>
              <p>
                Already have an account?{' '}
                <Link href="/login" className="font-medium text-green-700 hover:underline">Sign in</Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </AuthShell>
  );
}
