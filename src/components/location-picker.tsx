'use client';

import { useState } from 'react';
import { Crosshair } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapView } from '@/components/map-view';
import { Spinner } from '@/components/states';

export interface LocationValue {
  address: string;
  latitude: number | null;
  longitude: number | null;
}

/** Address text plus coordinates: set by clicking the map, using the device location, or typing. */
export function LocationPicker({
  value,
  onChange,
  addressLabel = 'Address',
  errors,
  idPrefix = 'loc',
}: {
  value: LocationValue;
  onChange: (value: LocationValue) => void;
  addressLabel?: string;
  errors?: Record<string, string[] | undefined>;
  idPrefix?: string;
}) {
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const hasCoords = value.latitude !== null && value.longitude !== null;

  function useMyLocation() {
    if (!navigator.geolocation) {
      setGeoError('Location is not available in this browser – click the map instead.');
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({ ...value, latitude: +pos.coords.latitude.toFixed(6), longitude: +pos.coords.longitude.toFixed(6) });
        setLocating(false);
      },
      () => {
        setGeoError('Could not get your location – click the map or enter coordinates.');
        setLocating(false);
      },
      { timeout: 10_000 }
    );
  }

  const coord = (raw: string) => (raw.trim() === '' || Number.isNaN(Number(raw)) ? null : Number(raw));

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-address`}>{addressLabel}</Label>
        <Input
          id={`${idPrefix}-address`}
          value={value.address}
          onChange={(e) => onChange({ ...value, address: e.target.value })}
          placeholder="Street, area, city"
          maxLength={300}
        />
        {errors?.address?.[0] && <p className="text-sm text-destructive">{errors.address[0]}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-lat`}>Latitude</Label>
          <Input
            id={`${idPrefix}-lat`} inputMode="decimal" value={value.latitude ?? ''}
            onChange={(e) => onChange({ ...value, latitude: coord(e.target.value) })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-lng`}>Longitude</Label>
          <Input
            id={`${idPrefix}-lng`} inputMode="decimal" value={value.longitude ?? ''}
            onChange={(e) => onChange({ ...value, longitude: coord(e.target.value) })}
          />
        </div>
        <Button type="button" variant="outline" onClick={useMyLocation} disabled={locating} className="col-span-2 sm:col-span-1">
          {locating ? <Spinner className="mr-2" /> : <Crosshair className="mr-2 h-4 w-4" />} Use my location
        </Button>
      </div>
      {(errors?.latitude?.[0] || errors?.longitude?.[0]) && (
        <p className="text-sm text-destructive">Set a valid location on the map or enter coordinates.</p>
      )}
      {geoError && <p className="text-sm text-amber-700">{geoError}</p>}
      <MapView
        className="h-56"
        onPick={(pos) => onChange({ ...value, latitude: pos.lat, longitude: pos.lng })}
        picked={hasCoords ? { lat: value.latitude!, lng: value.longitude! } : null}
      />
      <p className="text-xs text-muted-foreground">Click the map to set the exact location.</p>
    </div>
  );
}
