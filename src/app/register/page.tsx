'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { Building2, HandHeart, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PublicHeader } from '@/components/public-chrome';
import { Spinner } from '@/components/states';
import { api, type ApiClientError } from '@/lib/client';
import { cn } from '@/lib/utils';

const ROLES = [
  { value: 'DONOR', label: 'Donor', hint: 'I have surplus food', icon: Building2 },
  { value: 'NGO', label: 'NGO', hint: 'We distribute food', icon: HandHeart },
  { value: 'VOLUNTEER', label: 'Volunteer', hint: 'I can deliver food', icon: Truck },
] as const;

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState<(typeof ROLES)[number]['value']>('DONOR');
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
    <div className="min-h-screen gradient-hero">
      <PublicHeader />
      <main className="flex justify-center px-4 py-12">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle className="text-2xl">Join FoodBridge</CardTitle>
            <CardDescription>An admin reviews every account before it can coordinate food.</CardDescription>
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
                        role === r.value ? 'border-green-600 bg-green-50 text-green-900' : 'hover:bg-muted'
                      )}
                    >
                      <r.icon className="h-5 w-5" />
                      <span className="mt-1 font-semibold">{r.label}</span>
                      <span className="text-xs text-muted-foreground">{r.hint}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              {field('name', 'Full name', <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />)}
              {field('email', 'Email', <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />)}
              {field('phone', 'Phone (optional)', <Input id="phone" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} />)}
              <div className="grid gap-4 sm:grid-cols-2">
                {field('password', 'Password', <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />)}
                {field('confirmPassword', 'Confirm password', <Input id="confirmPassword" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />)}
              </div>
              <p className="text-xs text-muted-foreground">At least 8 characters.</p>
              {formError && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800" role="alert">{formError}</p>}
              <Button type="submit" className="w-full" size="lg" disabled={busy}>{busy && <Spinner className="mr-2" />} Create account</Button>
            </form>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Already registered? <Link href="/login" className="font-medium text-green-700 hover:underline">Sign in</Link>
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
