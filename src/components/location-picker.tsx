'use client';

import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, Crosshair, MapPin, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MapView } from '@/components/map-view';
import { Spinner } from '@/components/states';
import { api, toQuery, type ApiClientError } from '@/lib/client';
import { debugLocation } from '@/lib/location-debug';

export interface LocationValue {
  address: string;
  latitude: number | null;
  longitude: number | null;
}

interface GeoPlace { address: string; area: string; latitude: number; longitude: number }

/**
 * Address-first location input. People search for an address (or use their device location, or click
 * the map) and see a readable address; the coordinates behind the pin are kept for distances and maps
 * but only shown under "Enter coordinates manually". Lookups go through FoodBridge's server
 * (/api/geocode), which uses OpenStreetMap; if that is unavailable, a typed address plus a pin still works.
 */
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
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoPlace[] | null>(null);
  const [busy, setBusy] = useState<null | 'search' | 'locate' | 'reverse'>(null);
  const [message, setMessage] = useState<{ tone: 'info' | 'warn'; text: string } | null>(null);
  const [failedPoint, setFailedPoint] = useState<{ lat: number; lng: number; source: 'map' | 'device' } | null>(null);
  const lookup = useRef(0); // ignores answers to superseded lookups
  const hasCoords = value.latitude !== null && value.longitude !== null;
  const picked = useMemo(() => (hasCoords ? { lat: value.latitude!, lng: value.longitude! } : null), [hasCoords, value.latitude, value.longitude]);

  async function search() {
    const q = query.trim();
    if (q.length < 3) return setMessage({ tone: 'warn', text: 'Type at least 3 characters of the address, e.g. "Mansarovar, Jaipur".' });
    const id = ++lookup.current;
    setBusy('search');
    setMessage(null);
    try {
      debugLocation('search query', { q });
      const { results: found } = await api<{ results: GeoPlace[] }>(`/api/geocode/search${toQuery({ q })}`);
      debugLocation('search results', found);
      if (id !== lookup.current) return;
      setResults(found);
      if (found.length === 0) setMessage({ tone: 'warn', text: 'No matching address found. Try the area and city, or place the pin on the map.' });
    } catch (e) {
      if (id === lookup.current) setMessage({ tone: 'warn', text: (e as ApiClientError).message });
    } finally {
      if (id === lookup.current) setBusy(null);
    }
  }

  /** Address and pin always come from the same search result – never mixed with earlier values. */
  function choose(place: GeoPlace) {
    lookup.current++;
    setResults(null);
    setQuery('');
    setFailedPoint(null);
    debugLocation('selected result', place);
    onChange({ address: place.address, latitude: place.latitude, longitude: place.longitude });
    setMessage({ tone: 'info', text: 'Address selected. Add a flat, building or landmark below if it helps the volunteer.' });
  }

  /**
   * Moves the pin (map click, marker drag or device location), then fills in the address for that point.
   * The previous address is cleared at once, so an old address can never be saved with the new pin –
   * if the lookup fails, the field stays empty until the user types the address or retries.
   */
  async function pinAt(lat: number, lng: number, source: 'map' | 'device') {
    const id = ++lookup.current;
    setResults(null);
    setFailedPoint(null);
    onChange({ address: '', latitude: lat, longitude: lng });
    debugLocation('pin moved', { source, lat, lng });
    setBusy('reverse');
    setMessage(null);
    try {
      const { result } = await api<{ result: (GeoPlace & { approximate?: boolean }) | null }>(`/api/geocode/reverse${toQuery({ lat, lng })}`);
      debugLocation('reverse result', { lat, lng, result });
      if (id !== lookup.current) return;
      if (result) {
        onChange({ address: result.address, latitude: lat, longitude: lng });
        setMessage(result.approximate
          ? { tone: 'warn', text: 'There is no mapped street right at the pin, so only the area was filled in. Please add the street or building.' }
          : { tone: 'info', text: `Address filled in from the ${source === 'map' ? 'map pin' : 'your location'} – check it and add a flat or building if needed.` });
      } else {
        setMessage({ tone: 'warn', text: 'Pin placed, but no address was found there. Please type the address.' });
      }
    } catch (e) {
      if (id !== lookup.current) return;
      setFailedPoint({ lat, lng, source });
      setMessage({ tone: 'warn', text: `Pin placed, but the address could not be looked up: ${(e as ApiClientError).message} Type it below or retry.` });
    } finally {
      if (id === lookup.current) setBusy(null);
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      return setMessage({ tone: 'warn', text: 'Location is not available in this browser – search for the address or click the map.' });
    }
    setBusy('locate');
    setMessage(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => void pinAt(+pos.coords.latitude.toFixed(6), +pos.coords.longitude.toFixed(6), 'device'),
      (err) => {
        setBusy(null);
        setMessage({
          tone: 'warn',
          text: err.code === err.PERMISSION_DENIED
            ? 'Location permission was denied. Search for the address or click the map instead.'
            : 'Could not get your location. Search for the address or click the map instead.',
        });
      },
      { timeout: 10_000 }
    );
  }

  const coord = (raw: string) => (raw.trim() === '' || Number.isNaN(Number(raw)) ? null : Number(raw));
  const coordError = errors?.latitude?.[0] || errors?.longitude?.[0];

  return (
    <div className="space-y-3 rounded-xl border bg-slate-50/60 p-4" data-testid={`${idPrefix}-picker`}>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-search`}>Find the address</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id={`${idPrefix}-search`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void search(); } }}
            placeholder="e.g. Shipra Path, Mansarovar, Jaipur"
            maxLength={200}
            autoComplete="off"
          />
          <div className="flex gap-2">
            <Button type="button" onClick={search} disabled={busy !== null} className="flex-1 sm:flex-none">
              {busy === 'search' ? <Spinner className="mr-2" /> : <Search className="mr-2 h-4 w-4" />} Find
            </Button>
            <Button type="button" variant="outline" onClick={useMyLocation} disabled={busy !== null} className="flex-1 sm:flex-none" title="Use my current location">
              {busy === 'locate' ? <Spinner className="mr-2" /> : <Crosshair className="mr-2 h-4 w-4" />} My location
            </Button>
          </div>
        </div>
        {results && results.length > 0 && (
          <ul className="mt-1 divide-y overflow-hidden rounded-lg border bg-white shadow-sm" aria-label="Matching addresses">
            {results.map((r) => (
              <li key={`${r.latitude},${r.longitude},${r.address}`}>
                <button type="button" onClick={() => choose(r)} className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm hover:bg-green-50 focus:bg-green-50 focus:outline-none" data-testid="address-result">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                  <span><span className="block font-medium">{r.area}</span><span className="block text-muted-foreground">{r.address}</span></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <MapView className="h-56" label="Location map" onPick={(pos) => void pinAt(pos.lat, pos.lng, 'map')} picked={picked} />
      <p className="text-xs text-muted-foreground">Click the map or drag the pin to adjust it – the address is filled in for you.</p>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-address`}>{addressLabel}</Label>
        <Textarea
          id={`${idPrefix}-address`}
          rows={2}
          value={value.address}
          onChange={(e) => onChange({ ...value, address: e.target.value.replace(/\s*\n\s*/g, ', ') })}
          placeholder="House / building, street, area, city"
          maxLength={300}
        />
        {errors?.address?.[0] && <p className="text-sm text-destructive">{errors.address[0]}</p>}
      </div>

      <div aria-live="polite" className="space-y-1 text-sm">
        {busy === 'reverse' && <p className="flex items-center gap-2 text-muted-foreground"><Spinner /> Looking up the address…</p>}
        {hasCoords && busy !== 'reverse' && (
          <p className="flex items-center gap-1.5 text-green-800" data-testid={`${idPrefix}-pinned`}>
            <CheckCircle2 className="h-4 w-4" /> Location pinned on the map
          </p>
        )}
        {!hasCoords && <p className="text-muted-foreground">No location pinned yet – search for the address, use your location or click the map.</p>}
        {message && <p className={message.tone === 'warn' ? 'text-amber-700' : 'text-muted-foreground'} data-testid={`${idPrefix}-message`}>{message.text}</p>}
        {failedPoint && busy === null && (
          <Button type="button" size="sm" variant="outline" onClick={() => void pinAt(failedPoint.lat, failedPoint.lng, failedPoint.source)}>Retry address lookup</Button>
        )}
        {coordError && <p className="text-destructive">Pin the location: search for the address, use your location or click the map.</p>}
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Enter coordinates manually</summary>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-lat`}>Latitude</Label>
            <Input id={`${idPrefix}-lat`} inputMode="decimal" value={value.latitude ?? ''} onChange={(e) => onChange({ ...value, latitude: coord(e.target.value) })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-lng`}>Longitude</Label>
            <Input id={`${idPrefix}-lng`} inputMode="decimal" value={value.longitude ?? ''} onChange={(e) => onChange({ ...value, longitude: coord(e.target.value) })} />
          </div>
        </div>
      </details>
      <p className="text-[11px] text-muted-foreground">Address search © OpenStreetMap contributors.</p>
    </div>
  );
}
