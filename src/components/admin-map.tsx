'use client';

import { useMemo, useState } from 'react';
import { MapView, type MapMarker, type MarkerTone } from '@/components/map-view';
import { ErrorState, Skeleton, humanize } from '@/components/states';
import { useApi } from '@/lib/client';

interface Place { id: string; organisationName: string; address: string; latitude: number; longitude: number }
interface MapData {
  donors: Place[];
  ngos: Place[];
  donations: { id: string; foodName: string; remainingQuantity: number; unit: string; latitude: number; longitude: number }[];
  deliveries: {
    id: string; status: string;
    donation: { foodName: string; latitude: number; longitude: number };
    ngoProfile: { organisationName: string; latitude: number; longitude: number };
  }[];
}

type Layer = 'donors' | 'ngos' | 'donations' | 'deliveries';
const LAYERS: { key: Layer; label: string; tone: MarkerTone }[] = [
  { key: 'donors', label: 'Donors', tone: 'green' },
  { key: 'ngos', label: 'NGOs', tone: 'blue' },
  { key: 'donations', label: 'Open donations', tone: 'amber' },
  { key: 'deliveries', label: 'Deliveries in progress (drop-off)', tone: 'red' },
];

/** Platform map for admins with toggleable layers: donors, NGOs, open donations, deliveries in progress. */
export function AdminMap() {
  const { data, error, loading, reload } = useApi<MapData>('/api/admin/map');
  const [visible, setVisible] = useState<Record<Layer, boolean>>({ donors: true, ngos: true, donations: true, deliveries: true });

  const markers: MapMarker[] = useMemo(() => {
    if (!data) return [];
    return [
      ...(visible.donors ? data.donors.map((p) => ({ id: `d-${p.id}`, lat: p.latitude, lng: p.longitude, title: p.organisationName, subtitle: `Donor · ${p.address}`, tone: 'green' as const })) : []),
      ...(visible.ngos ? data.ngos.map((p) => ({ id: `n-${p.id}`, lat: p.latitude, lng: p.longitude, title: p.organisationName, subtitle: `NGO · ${p.address}`, tone: 'blue' as const })) : []),
      ...(visible.donations ? data.donations.map((d) => ({
        id: `f-${d.id}`, lat: d.latitude, lng: d.longitude, title: d.foodName,
        subtitle: `Open donation · ${d.remainingQuantity} ${d.unit.toLowerCase()}`, href: `/dashboard/admin/donations/${d.id}`, tone: 'amber' as const,
      })) : []),
      ...(visible.deliveries ? data.deliveries.map((r) => ({
        id: `r-${r.id}`, lat: r.ngoProfile.latitude, lng: r.ngoProfile.longitude, title: `Delivery: ${r.donation.foodName}`,
        subtitle: `${humanize(r.status)} → ${r.ngoProfile.organisationName}`, href: `/dashboard/admin/deliveries/${r.id}`, tone: 'red' as const,
      })) : []),
    ];
  }, [data, visible]);

  if (loading && !data) return <Skeleton className="h-80 w-full" />;
  if (error || !data) return <ErrorState message={error?.message ?? 'Could not load the map'} onRetry={reload} />;
  const counts: Record<Layer, number> = { donors: data.donors.length, ngos: data.ngos.length, donations: data.donations.length, deliveries: data.deliveries.length };

  return (
    <div className="space-y-3">
      <fieldset className="flex flex-wrap gap-2" aria-label="Map layers">
        <legend className="sr-only">Show on map</legend>
        {LAYERS.map((l) => (
          <label key={l.key} className="inline-flex cursor-pointer items-center gap-2 rounded-full border bg-white px-3 py-1 text-xs">
            <input
              type="checkbox"
              className="accent-green-600"
              checked={visible[l.key]}
              onChange={(e) => setVisible((v) => ({ ...v, [l.key]: e.target.checked }))}
              data-testid={`layer-${l.key}`}
            />
            {l.label} ({counts[l.key]})
          </label>
        ))}
      </fieldset>
      <MapView
        markers={markers}
        className="h-80"
        label="Platform locations"
        legend={LAYERS.filter((l) => visible[l.key]).map((l) => ({ tone: l.tone, label: l.label }))}
      />
    </div>
  );
}
