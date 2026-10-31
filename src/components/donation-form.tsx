'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import { LocationPicker, type LocationValue } from '@/components/location-picker';
import { debugLocation } from '@/lib/location-debug';
import { ImageUpload } from '@/components/image-upload';
import { Spinner } from '@/components/states';
import { FOOD_CATEGORIES, FOOD_TYPES, QUANTITY_UNITS } from '@/lib/constants';
import type { ApiClientError } from '@/lib/client';

export interface DonationFormValues {
  foodName: string;
  description?: string;
  foodCategory: string;
  foodType: string;
  quantity: number;
  unit: string;
  preparationTime: string;
  safePickupDeadline: string;
  storageConditions: string;
  handlingInstructions?: string;
  contactPhone?: string;
  photoUrl?: string;
  pickupAddress: string;
  latitude: number;
  longitude: number;
  foodSafetyDeclared?: true;
}

/** Formats a Date for <input type="datetime-local"> in the browser's timezone. */
export function toLocalInput(value: Date | string) {
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function DonationForm({
  mode,
  initial,
  defaultLocation,
  onSubmit,
  onCancel,
}: {
  mode: 'create' | 'edit';
  initial?: Omit<Partial<DonationFormValues>, 'photoUrl'> & { photoUrl?: string | null };
  defaultLocation?: LocationValue;
  onSubmit: (values: DonationFormValues) => Promise<void>;
  onCancel?: () => void;
}) {
  const now = Date.now();
  const [foodName, setFoodName] = useState(initial?.foodName ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [foodCategory, setFoodCategory] = useState(initial?.foodCategory ?? 'COOKED_MEALS');
  const [foodType, setFoodType] = useState(initial?.foodType ?? 'VEGETARIAN');
  const [quantity, setQuantity] = useState(initial?.quantity !== undefined ? String(initial.quantity) : '');
  const [unit, setUnit] = useState(initial?.unit ?? 'MEALS');
  const [preparationTime, setPreparationTime] = useState(toLocalInput(initial?.preparationTime ?? new Date(now - 30 * 60_000)));
  const [deadline, setDeadline] = useState(toLocalInput(initial?.safePickupDeadline ?? new Date(now + 4 * 3_600_000)));
  const [storage, setStorage] = useState(initial?.storageConditions ?? '');
  const [handling, setHandling] = useState(initial?.handlingInstructions ?? '');
  const [contactPhone, setContactPhone] = useState(initial?.contactPhone ?? '');
  const [photoUrl, setPhotoUrl] = useState<string | null>(initial?.photoUrl ?? null);
  const [safety, setSafety] = useState(false);
  const [location, setLocation] = useState<LocationValue>(
    initial?.pickupAddress
      ? { address: initial.pickupAddress, latitude: initial.latitude ?? null, longitude: initial.longitude ?? null }
      : defaultLocation ?? { address: '', latitude: null, longitude: null }
  );
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    const local: Record<string, string[]> = {};
    if (foodName.trim().length < 2) local.foodName = ['Food name is required'];
    if (!(Number(quantity) > 0)) local.quantity = ['Quantity must be greater than zero'];
    if (!storage.trim()) local.storageConditions = ['Storage conditions are required'];
    if (location.address.trim().length < 5) local.address = ['Pickup address is required'];
    if (location.latitude === null || location.longitude === null) local.latitude = ['Set the pickup location'];
    if (mode === 'create' && !safety) local.foodSafetyDeclared = ['You must declare food safety'];
    if (Object.keys(local).length) {
      setErrors(local);
      setFormError('Please fix the highlighted fields.');
      return;
    }

    setBusy(true);
    debugLocation('sending to backend', { pickupAddress: location.address.trim(), latitude: location.latitude, longitude: location.longitude });
    try {
      await onSubmit({
        foodName: foodName.trim(),
        description: description.trim() || undefined,
        foodCategory, foodType, unit,
        quantity: Number(quantity),
        preparationTime: new Date(preparationTime).toISOString(),
        safePickupDeadline: new Date(deadline).toISOString(),
        storageConditions: storage.trim(),
        handlingInstructions: handling.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        ...(photoUrl && { photoUrl }),
        pickupAddress: location.address.trim(),
        latitude: location.latitude!,
        longitude: location.longitude!,
        ...(mode === 'create' && { foodSafetyDeclared: true as const }),
      });
    } catch (err) {
      const apiErr = err as ApiClientError;
      setErrors(apiErr.fieldErrors ?? {});
      setFormError(apiErr.message === 'Validation failed' ? 'Please fix the highlighted fields.' : apiErr.message);
    } finally {
      setBusy(false);
    }
  }

  const err = (field: string) => errors[field]?.[0] && <p className="text-sm text-destructive">{errors[field]![0]}</p>;

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <Card>
        <CardHeader><CardTitle className="text-lg">What food are you donating?</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="foodName">Food title</Label>
            <Input id="foodName" value={foodName} onChange={(e) => setFoodName(e.target.value)} placeholder="e.g. Veg biryani, 40 portions" maxLength={120} />
            {err('foodName')}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={3} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="foodCategory">Category</Label>
              <NativeSelect id="foodCategory" value={foodCategory} onChange={(e) => setFoodCategory(e.target.value)}>
                {FOOD_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="foodType">Food type</Label>
              <NativeSelect id="foodType" value={foodType} onChange={(e) => setFoodType(e.target.value)}>
                {FOOD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quantity">Quantity</Label>
              <Input id="quantity" type="number" min={0.1} step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              {err('quantity')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit">Unit</Label>
              <NativeSelect id="unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
                {QUANTITY_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="preparationTime">Prepared at</Label>
              <Input id="preparationTime" type="datetime-local" value={preparationTime} onChange={(e) => setPreparationTime(e.target.value)} />
              {err('preparationTime')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="safePickupDeadline">Safe to pick up until</Label>
              <Input id="safePickupDeadline" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              {err('safePickupDeadline')}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Photo</Label>
            <ImageUpload value={photoUrl} onChange={setPhotoUrl} id="donation-photo" purpose="DONATION_PHOTO" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Handling and pickup</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="storageConditions">Storage conditions</Label>
              <Input id="storageConditions" value={storage} onChange={(e) => setStorage(e.target.value)} placeholder="e.g. Refrigerated, sealed trays" maxLength={300} />
              {err('storageConditions')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contactPhone">Pickup contact phone</Label>
              <Input id="contactPhone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} maxLength={20} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="handling">Special handling instructions</Label>
            <Textarea id="handling" value={handling} onChange={(e) => setHandling(e.target.value)} maxLength={500} rows={2} />
          </div>
          <LocationPicker value={location} onChange={setLocation} addressLabel="Pickup address" errors={errors} idPrefix="pickup" />
          {err('pickupAddress')}
        </CardContent>
      </Card>

      {mode === 'create' && (
        <label className="flex items-start gap-3 rounded-lg border bg-white p-4 text-sm">
          <input type="checkbox" checked={safety} onChange={(e) => setSafety(e.target.checked)} className="mt-0.5 h-4 w-4 accent-green-600" id="foodSafetyDeclared" />
          <span>
            I confirm this food was prepared and stored hygienically, is safe to eat, and is fit to be donated until the pickup deadline.
            {err('foodSafetyDeclared')}
          </span>
        </label>
      )}

      {formError && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800" role="alert">{formError}</p>}
      <div className="flex justify-end gap-2">
        {onCancel && <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>}
        <Button type="submit" size="lg" disabled={busy}>
          {busy && <Spinner className="mr-2" />} {mode === 'create' ? 'Publish donation' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
