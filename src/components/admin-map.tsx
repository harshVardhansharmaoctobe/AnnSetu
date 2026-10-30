'use client';

import { useMemo } from 'react';
import { MapView, type MapMarker } from '@/components/map-view';
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

/** Platform map for admins: donors, NGOs, open donations and drop-off points of deliveries in progress. */
export function AdminMap() {
  const { data, error, loading, reload } = useApi<MapData>('/api/admin/map');
  const markers: MapMarker[] = useMemo(() => {
    if (!data) return [];
    return [
      ...data.donors.map((p) => ({ id: `d-${p.id}`, lat: p.latitude, lng: p.longitude, title: p.organisationName, subtitle: `Donor · ${p.address}`, tone: 'green' as const })),
      ...data.ngos.map((p) => ({ id: `n-${p.id}`, lat: p.latitude, lng: p.longitude, title: p.organisationName, subtitle: `NGO · ${p.address}`, tone: 'blue' as const })),
      ...data.donations.map((d) => ({ id: `f-${d.id}`, lat: d.latitude, lng: d.longitude, title: d.foodName, subtitle: `Open donation · ${d.remainingQuantity} ${d.unit.toLowerCase()}`, tone: 'amber' as const })),
      ...data.deliveries.map((r) => ({
        id: `r-${r.id}`, lat: r.ngoProfile.latitude, lng: r.ngoProfile.longitude, title: `Delivery: ${r.donation.foodName}`,
        subtitle: `${humanize(r.status)} → ${r.ngoProfile.organisationName}`, href: `/dashboard/admin/deliveries/${r.id}`, tone: 'red' as const,
      })),
    ];
  }, [data]);

  if (loading && !data) return <Skeleton className="h-80 w-full" />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  return (
    <MapView
      markers={markers}
      className="h-80"
      label="Platform locations"
      legend={[
        { tone: 'green', label: `Donors (${data?.donors.length ?? 0})` },
        { tone: 'blue', label: `NGOs (${data?.ngos.length ?? 0})` },
        { tone: 'amber', label: `Open donations (${data?.donations.length ?? 0})` },
        { tone: 'red', label: `Deliveries in progress – drop-off (${data?.deliveries.length ?? 0})` },
      ]}
    />
  );
}
