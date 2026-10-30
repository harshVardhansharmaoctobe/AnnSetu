'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import { LocationPicker, type LocationValue } from '@/components/location-picker';
import { ImageUpload } from '@/components/image-upload';
import { ErrorState, LoadingCards, PageHeader, Spinner, StatusBadge } from '@/components/states';
import { useToast } from '@/components/toaster';
import { api, useApi, type ApiClientError } from '@/lib/client';
import { FOOD_CATEGORIES, ORGANISATION_TYPES, VEHICLE_TYPES } from '@/lib/constants';

interface Profile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  role: 'DONOR' | 'NGO' | 'VOLUNTEER' | 'ADMIN';
  accountStatus: string;
  donorProfile: { organisationName: string; organisationType: string; address: string; latitude: number; longitude: number; description: string | null } | null;
  ngoProfile: {
    organisationName: string; registrationNumber: string | null; address: string; latitude: number; longitude: number;
    description: string | null; receivingCapacity: number; foodPreferences: string | null;
  } | null;
  volunteerProfile: {
    address: string | null; latitude: number | null; longitude: number | null; vehicleType: string | null;
    availability: string | null; isAvailable: boolean; maxDistance: number;
  } | null;
}

export default function ProfilePage() {
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<Profile>('/api/profile');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [orgName, setOrgName] = useState('');
  const [orgType, setOrgType] = useState('restaurant');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [description, setDescription] = useState('');
  const [capacity, setCapacity] = useState('100');
  const [preferences, setPreferences] = useState<string[]>([]);
  const [vehicleType, setVehicleType] = useState('');
  const [availability, setAvailability] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [maxDistance, setMaxDistance] = useState('15');
  const [location, setLocation] = useState<LocationValue>({ address: '', latitude: null, longitude: null });

  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setPhone(data.phone ?? '');
    setAvatarUrl(data.avatarUrl ?? null);
    const p = data.donorProfile ?? data.ngoProfile;
    if (p) {
      setOrgName(p.organisationName);
      setDescription(p.description ?? '');
      setLocation({ address: p.address, latitude: p.latitude, longitude: p.longitude });
    }
    if (data.donorProfile) setOrgType(data.donorProfile.organisationType);
    if (data.ngoProfile) {
      setRegistrationNumber(data.ngoProfile.registrationNumber ?? '');
      setCapacity(String(data.ngoProfile.receivingCapacity));
      setPreferences(data.ngoProfile.foodPreferences?.split(',').filter(Boolean) ?? []);
    }
    if (data.volunteerProfile) {
      const v = data.volunteerProfile;
      setVehicleType(v.vehicleType ?? '');
      setAvailability(v.availability ?? '');
      setIsAvailable(v.isAvailable);
      setMaxDistance(String(v.maxDistance));
      setLocation({ address: v.address ?? '', latitude: v.latitude, longitude: v.longitude });
    }
  }, [data]);

  if (loading && !data) return <LoadingCards count={2} />;
  if (error || !data) return <ErrorState message={error?.message ?? 'Could not load your profile'} onRetry={reload} />;

  const role = data.role;
  const hasLocation = location.latitude !== null && location.longitude !== null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const body: Record<string, unknown> = { name: name.trim(), phone: phone.trim() || undefined, avatarUrl };

    if (role === 'DONOR' || role === 'NGO') {
      if (!hasLocation) {
        setFormError('Set your location on the map (or use your current location).');
        return;
      }
      const common = {
        organisationName: orgName.trim(),
        address: location.address.trim(),
        latitude: location.latitude,
        longitude: location.longitude,
        description: description.trim() || undefined,
      };
      if (role === 'DONOR') body.donorProfile = { ...common, organisationType: orgType };
      else {
        body.ngoProfile = {
          ...common,
          registrationNumber: registrationNumber.trim() || undefined,
          receivingCapacity: Number.parseInt(capacity, 10),
          foodPreferences: preferences.join(',') || undefined,
        };
      }
    } else if (role === 'VOLUNTEER') {
      body.volunteerProfile = {
        address: location.address.trim() || undefined,
        ...(hasLocation && { latitude: location.latitude, longitude: location.longitude }),
        vehicleType: vehicleType || undefined,
        availability: availability.trim() || undefined,
        isAvailable,
        maxDistance: Number(maxDistance) || undefined,
      };
    }

    setSaving(true);
    try {
      await api('/api/profile', { method: 'PUT', body });
      toast.success('Profile saved');
      await reload();
      router.refresh();
    } catch (err) {
      const e2 = err as ApiClientError;
      setFormError(e2.status === 400 ? 'Please check the highlighted details and try again.' : e2.message);
      toast.error('Could not save profile', e2.message);
    } finally {
      setSaving(false);
    }
  }

  const orgLabel = role === 'NGO' ? 'NGO name' : 'Organisation / business name';

  return (
    <form onSubmit={save} className="space-y-6" noValidate>
      <PageHeader
        title="Your profile"
        description="These details are shared with the people you coordinate deliveries with."
        actions={<StatusBadge status={data.accountStatus} />}
      />

      <Card>
        <CardHeader><CardTitle className="text-lg">Account</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={100} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Contact phone</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} placeholder="+91 …" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Email</Label>
            <p className="text-sm text-muted-foreground">{data.email}</p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Profile photo</Label>
            <ImageUpload value={avatarUrl} onChange={setAvatarUrl} id="avatar-photo" purpose="AVATAR" label="Upload profile photo" />
          </div>
        </CardContent>
      </Card>

      {(role === 'DONOR' || role === 'NGO') && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{role === 'DONOR' ? 'Donor details' : 'NGO details'}</CardTitle>
            <CardDescription>Required before you can {role === 'DONOR' ? 'list donations' : 'request food'}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="orgName">{orgLabel}</Label>
                <Input id="orgName" value={orgName} onChange={(e) => setOrgName(e.target.value)} required maxLength={120} />
              </div>
              {role === 'DONOR' ? (
                <div className="space-y-1.5">
                  <Label htmlFor="orgType">Organisation type</Label>
                  <NativeSelect id="orgType" value={orgType} onChange={(e) => setOrgType(e.target.value)}>
                    {ORGANISATION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </NativeSelect>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="regNo">Registration / reference number</Label>
                  <Input id="regNo" value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} maxLength={60} />
                </div>
              )}
            </div>
            {role === 'NGO' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="capacity">Receiving capacity (meals per pickup)</Label>
                  <Input id="capacity" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
                </div>
                <fieldset className="space-y-1.5">
                  <legend className="text-sm font-medium">Preferred food</legend>
                  <div className="flex flex-wrap gap-2">
                    {FOOD_CATEGORIES.map((c) => {
                      const on = preferences.includes(c.value);
                      return (
                        <button
                          key={c.value} type="button" aria-pressed={on}
                          onClick={() => setPreferences((p) => (on ? p.filter((x) => x !== c.value) : [...p, c.value]))}
                          className={`rounded-full border px-3 py-1 text-xs ${on ? 'border-green-600 bg-green-50 text-green-800' : 'text-muted-foreground'}`}
                        >
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="description">About {role === 'NGO' ? 'your NGO' : 'your organisation'}</Label>
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={3} />
            </div>
            <LocationPicker value={location} onChange={setLocation} addressLabel={role === 'NGO' ? 'Service address' : 'Address'} />
          </CardContent>
        </Card>
      )}

      {role === 'VOLUNTEER' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Volunteer details</CardTitle>
            <CardDescription>Your service area helps us show nearby deliveries first.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="vehicle">Vehicle</Label>
                <NativeSelect id="vehicle" value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
                  <option value="">Not specified</option>
                  {VEHICLE_TYPES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="availability">Availability</Label>
                <Input id="availability" value={availability} onChange={(e) => setAvailability(e.target.value)} placeholder="e.g. Weekday evenings" maxLength={200} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="maxDistance">Max distance (km)</Label>
                <Input id="maxDistance" type="number" min={1} max={100} value={maxDistance} onChange={(e) => setMaxDistance(e.target.value)} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isAvailable} onChange={(e) => setIsAvailable(e.target.checked)} className="h-4 w-4 accent-green-600" />
              I am currently available for deliveries
            </label>
            <LocationPicker value={location} onChange={setLocation} addressLabel="Service area" />
          </CardContent>
        </Card>
      )}

      {formError && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800" role="alert">{formError}</p>}
      <div className="flex justify-end">
        <Button type="submit" disabled={saving} size="lg">
          {saving ? <Spinner className="mr-2" /> : <Save className="mr-2 h-4 w-4" />} Save profile
        </Button>
      </div>
    </form>
  );
}
