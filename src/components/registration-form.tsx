'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import { LocationPicker, type LocationValue } from '@/components/location-picker';
import { Spinner } from '@/components/states';
import { api, type ApiClientError } from '@/lib/client';
import { ORGANISATION_TYPES, VEHICLE_TYPES } from '@/lib/constants';

export type RegistrationRole = 'DONOR' | 'NGO' | 'VOLUNTEER';

const COPY: Record<RegistrationRole, { title: string; description: string }> = {
  DONOR: { title: 'Register as a food donor', description: 'Restaurants, hotels, bakeries, caterers and event organisers list surplus food for free.' },
  NGO: { title: 'Register your NGO', description: 'Verified NGOs receive donated food free of charge – no food or delivery fees.' },
  VOLUNTEER: { title: 'Register as a volunteer', description: 'Collect surplus food from donors and deliver it to NGOs near you.' },
};

/** Role-specific sign-up: account details plus that role's profile, created together. */
export function RegistrationForm({ role }: { role: RegistrationRole }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [orgType, setOrgType] = useState('restaurant');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [capacity, setCapacity] = useState('100');
  const [description, setDescription] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [availability, setAvailability] = useState('');
  const [location, setLocation] = useState<LocationValue>({ address: '', latitude: null, longitude: null });
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const needsOrg = role === 'DONOR' || role === 'NGO';
  const hasLocation = location.latitude !== null && location.longitude !== null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    if (password !== confirmPassword) return setErrors({ confirmPassword: ['Passwords do not match'] });
    if (needsOrg && orgName.trim().length < 2) return setErrors({ orgName: ['Organisation name is required'] });
    if (needsOrg && (location.address.trim().length < 5 || !hasLocation)) {
      return setErrors({ address: ['Enter the address and set the location on the map'] });
    }

    const common = {
      organisationName: orgName.trim(), address: location.address.trim(),
      latitude: location.latitude, longitude: location.longitude, description: description.trim() || undefined,
    };
    const body: Record<string, unknown> = { name, email, phone: phone || undefined, password, confirmPassword, role };
    if (role === 'DONOR') body.donorProfile = { ...common, organisationType: orgType };
    if (role === 'NGO') body.ngoProfile = { ...common, registrationNumber: registrationNumber.trim() || undefined, receivingCapacity: Number.parseInt(capacity, 10) || 1 };
    if (role === 'VOLUNTEER') {
      body.volunteerProfile = {
        vehicleType: vehicleType || undefined, availability: availability.trim() || undefined,
        ...(location.address.trim() && { address: location.address.trim() }),
        ...(hasLocation && { latitude: location.latitude, longitude: location.longitude }),
      };
    }

    setBusy(true);
    try {
      await api('/api/register', { body });
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
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="text-2xl">{COPY[role].title}</CardTitle>
        <CardDescription>{COPY[role].description} An admin verifies every account before it can coordinate food.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-6" noValidate>
          <fieldset className="space-y-4">
            <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Your account</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {field('name', 'Full name', <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />)}
              {field('phone', 'Phone', <Input id="phone" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} />)}
            </div>
            {field('email', 'Email', <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />)}
            <div className="grid gap-4 sm:grid-cols-2">
              {field('password', 'Password', <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />)}
              {field('confirmPassword', 'Confirm password', <Input id="confirmPassword" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />)}
            </div>
            <p className="text-xs text-muted-foreground">At least 8 characters.</p>
          </fieldset>

          {needsOrg && (
            <fieldset className="space-y-4">
              <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{role === 'NGO' ? 'Your NGO' : 'Your organisation'}</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                {field('orgName', role === 'NGO' ? 'NGO name' : 'Organisation / business name', <Input id="orgName" value={orgName} onChange={(e) => setOrgName(e.target.value)} maxLength={120} />)}
                {role === 'DONOR'
                  ? field('orgType', 'Organisation type', (
                    <NativeSelect id="orgType" value={orgType} onChange={(e) => setOrgType(e.target.value)}>
                      {ORGANISATION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </NativeSelect>
                  ))
                  : field('registrationNumber', 'Registration / reference number', <Input id="registrationNumber" value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} maxLength={60} />)}
              </div>
              {role === 'NGO' && field('capacity', 'Receiving capacity (meals per pickup)', <Input id="capacity" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} />)}
              {field('description', role === 'NGO' ? 'Who you serve (optional)' : 'About you (optional)', <Textarea id="description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />)}
              <LocationPicker value={location} onChange={setLocation} addressLabel={role === 'NGO' ? 'Service address' : 'Pickup address'} errors={errors} />
            </fieldset>
          )}

          {role === 'VOLUNTEER' && (
            <fieldset className="space-y-4">
              <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">How you can help</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                {field('vehicleType', 'Vehicle', (
                  <NativeSelect id="vehicleType" value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
                    <option value="">Not specified</option>
                    {VEHICLE_TYPES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                  </NativeSelect>
                ))}
                {field('availability', 'Availability', <Input id="availability" placeholder="e.g. Weekday evenings" value={availability} onChange={(e) => setAvailability(e.target.value)} maxLength={200} />)}
              </div>
              <LocationPicker value={location} onChange={setLocation} addressLabel="Service area (optional)" />
            </fieldset>
          )}

          {formError && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800" role="alert">{formError}</p>}
          <Button type="submit" className="w-full" size="lg" disabled={busy}>{busy && <Spinner className="mr-2" />} Create account</Button>
          <p className="text-center text-sm text-muted-foreground">
            Already registered? <Link href="/login" className="font-medium text-green-700 hover:underline">Sign in</Link> ·{' '}
            <Link href="/register" className="font-medium text-green-700 hover:underline">Choose a different role</Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
