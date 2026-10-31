'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { Clock, List, Map as MapIcon, MapPin, Search, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { MapView, type MapMarker } from '@/components/map-view';
import { EmptyState, ErrorState, LoadingCards, PageHeader, Pagination, StatusBadge, humanize } from '@/components/states';
import { useApi, useQueryParam, toQuery } from '@/lib/client';
import { FOOD_CATEGORIES, FOOD_TYPES } from '@/lib/constants';
import { areaOf, formatTimeRemaining } from '@/lib/utils';

interface Donation {
  id: string; foodName: string; foodCategory: string; foodType: string; remainingQuantity: number; unit: string;
  safePickupDeadline: string; pickupAddress: string; latitude: number; longitude: number; photoUrl: string | null;
  distanceKm: number | null; matchScore: number | null; matchExplanation: string | null;
  donorProfile: { organisationName: string };
  myRequest: { id: string; status: string } | null;
}
interface DiscoveryResult {
  items: Donation[]; total: number; page: number; pageSize: number;
  origin: { lat: number; lng: number; source: string } | null; truncated: boolean;
}

export default function Page() {
  return <Suspense fallback={<LoadingCards />}><BrowsePage /></Suspense>;
}

function BrowsePage() {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [category, setCategory] = useState('');
  const [foodType, setFoodType] = useState('');
  const [expires, setExpires] = useState('');
  const [sort, setSort] = useState('nearest');
  const [radius, setRadius] = useState('');
  const [page, setPage] = useState(1);
  const [viewParam, setViewParam] = useQueryParam('view', 'list');
  const view = viewParam === 'map' ? 'map' : 'list';
  const setView = (v: 'list' | 'map') => setViewParam(v);
  const [minQuantity, setMinQuantity] = useState('');

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(q); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const url = `/api/donations${toQuery({
    scope: 'available', q: debouncedQ, category, foodType, expiresWithinHours: expires, sort, radiusKm: radius, minQuantity, page, pageSize: 12,
  })}`;
  const { data, error, loading, reload } = useApi<DiscoveryResult>(url);

  const origin = useMemo(() => (data?.origin ? { lat: data.origin.lat, lng: data.origin.lng } : null), [data]);
  const markers: MapMarker[] = useMemo(
    () => [
      ...(data?.items ?? []).map((d) => ({
        id: d.id, lat: d.latitude, lng: d.longitude, title: d.foodName, tone: 'green' as const,
        subtitle: `${d.remainingQuantity} ${d.unit.toLowerCase()} · ${d.donorProfile.organisationName}${d.distanceKm !== null ? ` · ${d.distanceKm} km` : ''}`,
        href: `/dashboard/ngo/donations/${d.id}`,
      })),
      ...(origin ? [{ id: 'origin', lat: origin.lat, lng: origin.lng, title: 'Your NGO', subtitle: 'Saved NGO address', tone: 'blue' as const }] : []),
    ],
    [data, origin]
  );
  const setFilter = (fn: (v: string) => void) => (e: React.ChangeEvent<HTMLSelectElement>) => { fn(e.target.value); setPage(1); };

  return (
    <div>
      <PageHeader
        title="Find food"
        description={data?.origin ? 'Distances are measured from your NGO address.' : 'Add your NGO location in your profile to see distances.'}
        actions={
          <div className="flex rounded-lg border bg-white p-1" role="group" aria-label="View">
            <Button size="sm" variant={view === 'list' ? 'default' : 'ghost'} onClick={() => setView('list')}><List className="mr-1 h-4 w-4" /> List</Button>
            <Button size="sm" variant={view === 'map' ? 'default' : 'ghost'} onClick={() => setView('map')}><MapIcon className="mr-1 h-4 w-4" /> Map</Button>
          </div>
        }
      />

      <div className="mb-6 grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="relative sm:col-span-2">
          <Label htmlFor="search" className="sr-only">Search</Label>
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input id="search" className="pl-9" placeholder="Search food, donor or area" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <NativeSelect aria-label="Category" value={category} onChange={setFilter(setCategory)}>
          <option value="">All categories</option>
          {FOOD_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Food type" value={foodType} onChange={setFilter(setFoodType)}>
          <option value="">Any food type</option>
          {FOOD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Expires within" value={expires} onChange={setFilter(setExpires)}>
          <option value="">Any pickup deadline</option>
          <option value="3">Within 3 hours</option>
          <option value="12">Within 12 hours</option>
          <option value="24">Within 24 hours</option>
        </NativeSelect>
        <div className="grid grid-cols-2 gap-2">
          <NativeSelect aria-label="Sort" value={sort} onChange={setFilter(setSort)}>
            <option value="nearest">Nearest</option>
            <option value="newest">Newest</option>
            <option value="expiry">Expiring soon</option>
          </NativeSelect>
          <NativeSelect aria-label="Radius" value={radius} onChange={setFilter(setRadius)}>
            <option value="">Any distance</option>
            <option value="5">≤ 5 km</option>
            <option value="10">≤ 10 km</option>
            <option value="25">≤ 25 km</option>
          </NativeSelect>
        </div>
        <NativeSelect aria-label="Minimum quantity available" value={minQuantity} onChange={setFilter(setMinQuantity)}>
          <option value="">Any quantity</option>
          <option value="10">At least 10</option>
          <option value="25">At least 25</option>
          <option value="50">At least 50</option>
        </NativeSelect>
      </div>

      {view === 'map' && (
        <div className="mb-6">
          <MapView
            markers={markers}
            className="h-96"
            label="Map of available donations"
            legend={[{ tone: 'green', label: 'Available donation (pickup point)' }, ...(origin ? [{ tone: 'blue' as const, label: 'Your NGO' }] : [])]}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {origin ? 'Shows the donations on this page. Click a marker to open it.' : 'Add your NGO address in your profile to see your own location and distances.'}
          </p>
        </div>
      )}

      {loading && !data ? <LoadingCards />
        : error ? <ErrorState message={error.message} onRetry={reload} />
          : data!.items.length === 0 ? (
            <EmptyState title="No food available right now" description="Try widening your filters, or check back soon – donors post surplus throughout the day." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data!.items.map((d) => (
                <Link
                  key={d.id}
                  href={`/dashboard/ngo/donations/${d.id}`}
                  className="flex flex-col overflow-hidden rounded-xl border bg-white transition hover:shadow-md"
                  data-testid="donation-card"
                >
                  {d.photoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={d.photoUrl} alt="" className="h-36 w-full object-cover" />
                  )}
                  <div className="flex flex-1 flex-col p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold">{d.foodName}</p>
                      {d.myRequest && <StatusBadge status={d.myRequest.status} />}
                    </div>
                    <p className="text-sm text-muted-foreground">{d.donorProfile.organisationName} · {areaOf(d.pickupAddress)}</p>
                    <p className="mt-2 text-sm">{d.remainingQuantity} {d.unit.toLowerCase()} · {humanize(d.foodCategory)} · {humanize(d.foodType)}</p>
                    <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {formatTimeRemaining(d.safePickupDeadline)}</span>
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" /> {d.distanceKm !== null ? `${d.distanceKm} km away` : 'Distance unknown'}
                      </span>
                      {d.matchScore !== null && (
                        <span className="inline-flex items-center gap-1 text-green-700" title={d.matchExplanation ?? undefined}>
                          <Sparkles className="h-3.5 w-3.5" /> {d.matchScore}% match
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    </div>
  );
}
