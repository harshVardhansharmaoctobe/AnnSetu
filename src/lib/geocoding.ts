import { ApiError } from '@/lib/api';
import { calculateDistance } from '@/lib/utils';

/**
 * Address lookup (geocoding) through a Nominatim-compatible service – OpenStreetMap's by default.
 *
 * All lookups happen on the server so that the public service's usage policy is respected:
 *  - one request per second at most (a process-wide queue),
 *  - an identifying User-Agent,
 *  - results cached (24 h) so repeated searches and map clicks don't hit the service again,
 *  - no search-as-you-type: the UI searches only when the user presses "Find".
 *
 * GEOCODER_URL overrides the service (the tests point it at a local stub); GEOCODER_URL=off disables lookups,
 * in which case the UI still accepts a typed address plus a map pin.
 */

export interface GeoPlace {
  /** Human-readable address shown everywhere, e.g. "Shipra Path, Mansarovar, Jaipur, Rajasthan 302020, India". */
  address: string;
  /** Short area label for cards, e.g. "Mansarovar, Jaipur". */
  area: string;
  latitude: number;
  longitude: number;
}

type NominatimAddress = Partial<Record<
  'house_number' | 'road' | 'neighbourhood' | 'suburb' | 'quarter' | 'residential' | 'city_district' | 'city' | 'town' |
  'village' | 'county' | 'state_district' | 'state' | 'postcode' | 'country', string
>>;
interface NominatimResult { lat: string; lon: string; name?: string; display_name?: string; address?: NominatimAddress }

const DEFAULT_URL = 'https://nominatim.openstreetmap.org';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;
const MIN_INTERVAL_MS = 1100;
const TIMEOUT_MS = 8000;

function baseUrl() {
  const configured = process.env.GEOCODER_URL?.trim();
  if (configured === 'off') return null;
  return (configured || DEFAULT_URL).replace(/\/$/, '');
}

export const geocodingEnabled = () => baseUrl() !== null;

const unavailable = () => new ApiError(503, 'Address lookup is unavailable right now – type the address and place the pin on the map.', 'GEOCODING_UNAVAILABLE');

// ─── Formatting ───

/** "Jaipur Municipal Corporation" → "Jaipur", "Barodia Scheme , Jaipur" → "Barodia Scheme, Jaipur". */
const clean = (v: string | undefined) =>
  v?.replace(/\s+,/g, ',').replace(/\s+(Municipal Corporation|Municipal Council|Nagar Nigam|Tehsil)$/i, '').trim() || undefined;

/** Splits on commas and drops empty and repeated parts (case-insensitive), keeping the first occurrence. */
const dedupe = (parts: (string | undefined)[]) => {
  const out: string[] = [];
  for (const p of parts.flatMap((x) => (x ?? '').split(','))) {
    const v = p.trim();
    if (v && !out.some((o) => o.toLowerCase() === v.toLowerCase())) out.push(v);
  }
  return out;
};

/**
 * Turns a Nominatim result into the address people see. The place's own name (a landmark, station,
 * building or shop – Nominatim's `name`) comes first, so the text names the same thing the pin marks.
 * With `areaOnly`, street-level parts are left out (used when the nearest mapped object is far from the pin).
 */
export function formatPlace(r: NominatimResult, opts: { areaOnly?: boolean } = {}): GeoPlace | null {
  const latitude = Number(r.lat);
  const longitude = Number(r.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const a = r.address ?? {};
  const name = opts.areaOnly ? undefined : clean(r.name);
  const street = opts.areaOnly ? undefined
    : [a.house_number, a.road].filter(Boolean).join(a.house_number && /^\d/.test(a.house_number) ? ', ' : ' ') || undefined;
  const area = clean(a.neighbourhood ?? a.suburb ?? a.quarter ?? a.residential ?? a.city_district);
  const city = clean(a.city ?? a.town ?? a.village ?? a.state_district ?? a.county);
  const state = [a.state, a.postcode].filter(Boolean).join(' ') || undefined;
  const parts = dedupe([name, street, area, city, state, a.country]);
  const address = parts.length >= 2 ? parts.join(', ') : clean(r.display_name) || parts.join(', ');
  if (!address) return null;
  return {
    address: address.slice(0, 300),
    area: dedupe([area, city]).slice(0, 2).join(', ') || dedupe([city, a.state]).join(', ') || address.split(',').slice(0, 2).join(',').trim(),
    latitude: Math.round(latitude * 1e6) / 1e6,
    longitude: Math.round(longitude * 1e6) / 1e6,
  };
}

// ─── Throttled, cached requests ───

const globalState = globalThis as unknown as {
  foodbridgeGeocoder?: { cache: Map<string, { at: number; value: unknown }>; queue: Promise<unknown>; last: number };
};
const state = (globalState.foodbridgeGeocoder ??= { cache: new Map(), queue: Promise.resolve(), last: 0 });

function cached<T>(key: string): T | undefined {
  const hit = state.cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    state.cache.delete(key);
    return undefined;
  }
  return hit.value as T;
}

function remember(key: string, value: unknown) {
  if (state.cache.size >= CACHE_MAX) state.cache.delete(state.cache.keys().next().value!);
  state.cache.set(key, { at: Date.now(), value });
}

/** Runs requests one at a time, at least MIN_INTERVAL_MS apart. */
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = state.queue.then(async () => {
    const wait = state.last + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    state.last = Date.now();
    return fn();
  });
  state.queue = run.catch(() => undefined);
  return run;
}

async function call(path: string, params: Record<string, string>) {
  const base = baseUrl();
  if (!base) throw unavailable();
  const url = `${base}${path}?${new URLSearchParams({ format: 'jsonv2', addressdetails: '1', 'accept-language': 'en', ...params })}`;
  return throttled(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const contact = process.env.SUPPORT_EMAIL?.trim();
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': `FoodBridge/1.0 (food rescue platform${contact ? `; ${contact}` : ''})`, Accept: 'application/json' },
      });
      if (!res.ok) throw unavailable();
      return (await res.json()) as unknown;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw unavailable();
    } finally {
      clearTimeout(timer);
    }
  });
}

/** Up to 5 matches for a typed address, biased to the configured country (India by default). */
export async function searchAddress(query: string): Promise<GeoPlace[]> {
  const q = query.trim().replace(/\s+/g, ' ');
  const key = `s:${q.toLowerCase()}`;
  const hit = cached<GeoPlace[]>(key);
  if (hit) return hit;
  const country = process.env.GEOCODER_COUNTRY?.trim() || 'in';
  const data = await call('/search', { q, limit: '5', ...(country !== 'any' && { countrycodes: country }) });
  const places = (Array.isArray(data) ? data : []).map((r) => formatPlace(r as NominatimResult)).filter((p): p is GeoPlace => p !== null);
  remember(key, places);
  return places;
}

/** The address at a point (map click or device location); null when nothing is found there. */
export async function reverseGeocode(latitude: number, longitude: number): Promise<(GeoPlace & { approximate: boolean }) | null> {
  const lat = latitude.toFixed(5);
  const lon = longitude.toFixed(5);
  const key = `r:${lat},${lon}`;
  let place = cached<(GeoPlace & { approximate: boolean }) | null>(key);
  if (place === undefined) {
    const data = (await call('/reverse', { lat, lon, zoom: '18' })) as NominatimResult & { error?: string };
    place = data && !data.error ? describePoint(data, latitude, longitude) : null;
    remember(key, place);
  }
  // Keep the exact point the user chose; the service may snap to the nearest building.
  return place ? { ...place, latitude, longitude } : null;
}

/** Beyond this distance the nearest mapped object no longer describes the pin itself. */
export const REVERSE_MAX_STREET_DISTANCE_M = 150;

/**
 * Reverse results are the nearest mapped object, which can be far from the pin (open ground, a large
 * campus). If it is further than REVERSE_MAX_STREET_DISTANCE_M, only the area is used, so the address
 * never names a street or building that is not where the pin is.
 */
export function describePoint(r: NominatimResult, latitude: number, longitude: number): (GeoPlace & { approximate: boolean }) | null {
  const metres = calculateDistance(latitude, longitude, Number(r.lat), Number(r.lon)) * 1000;
  const approximate = !Number.isFinite(metres) || metres > REVERSE_MAX_STREET_DISTANCE_M;
  const place = formatPlace(r, { areaOnly: approximate });
  return place ? { ...place, approximate } : null;
}
