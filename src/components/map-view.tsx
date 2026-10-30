'use client';

import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import type { Map as LeafletMap, LayerGroup } from 'leaflet';

export type MarkerTone = 'green' | 'blue' | 'amber' | 'red';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
  href?: string;
  tone?: MarkerTone;
}

const LEGEND_COLORS: Record<MarkerTone, string> = { green: '#16a34a', blue: '#2563eb', amber: '#d97706', red: '#dc2626' };

/** Rejects missing, out-of-range and placeholder (0,0) coordinates instead of drawing them in the wrong place. */
export function hasValidCoords(lat: unknown, lng: unknown): boolean {
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)
    && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}

/**
 * Leaflet map without react-leaflet (which targets React 18 while the App Router runs React 19).
 * Markers carry a title (accessible name) and their popups are built with textContent, never HTML.
 * If OpenStreetMap tiles cannot load, markers still render and pages keep their list views.
 */
export function MapView({
  markers,
  center,
  zoom = 12,
  onPick,
  picked,
  legend,
  className = 'h-80',
  label = 'Map',
}: {
  markers?: MapMarker[];
  center?: { lat: number; lng: number } | null;
  zoom?: number;
  onPick?: (pos: { lat: number; lng: number }) => void;
  picked?: { lat: number; lng: number } | null;
  legend?: { tone: MarkerTone; label: string }[];
  className?: string;
  label?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const pickRef = useRef(onPick);
  const [leaflet, setLeaflet] = useState<typeof import('leaflet') | null>(null);
  const [failed, setFailed] = useState(false);
  pickRef.current = onPick;

  const valid = (markers ?? []).filter((m) => hasValidCoords(m.lat, m.lng));
  const skipped = (markers?.length ?? 0) - valid.length;

  useEffect(() => {
    let cancelled = false;
    import('leaflet')
      .then((mod) => {
        if (cancelled || !container.current || map.current) return;
        const L = mod.default ?? mod;
        const first = valid[0];
        const start = center && hasValidCoords(center.lat, center.lng) ? center : first ? { lat: first.lat, lng: first.lng } : { lat: 26.9124, lng: 75.7873 };
        const m = L.map(container.current, { scrollWheelZoom: false }).setView([start.lat, start.lng], zoom);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(m);
        m.on('click', (e) => pickRef.current?.({ lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6) }));
        layer.current = L.layerGroup().addTo(m);
        map.current = m;
        setLeaflet(L);
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const L = leaflet;
    if (!L || !map.current || !layer.current) return;
    layer.current.clearLayers();
    const points: [number, number][] = [];
    const icon = (tone: MarkerTone) => L.divIcon({ className: `fb-marker fb-marker-${tone}`, iconSize: [18, 18], iconAnchor: [9, 9] });

    for (const mk of valid) {
      const popup = document.createElement('div');
      const title = document.createElement(mk.href ? 'a' : 'strong');
      title.textContent = mk.title;
      if (mk.href && title instanceof HTMLAnchorElement) {
        title.href = mk.href;
        title.style.fontWeight = '600';
      }
      popup.appendChild(title);
      if (mk.subtitle) {
        const sub = document.createElement('div');
        sub.textContent = mk.subtitle;
        sub.style.color = '#64748b';
        popup.appendChild(sub);
      }
      L.marker([mk.lat, mk.lng], { icon: icon(mk.tone ?? 'green'), title: mk.title, alt: mk.title, keyboard: true })
        .bindPopup(popup)
        .addTo(layer.current);
      points.push([mk.lat, mk.lng]);
    }
    if (picked && hasValidCoords(picked.lat, picked.lng)) {
      L.marker([picked.lat, picked.lng], { icon: icon('red'), title: 'Selected location', keyboard: false }).addTo(layer.current);
      points.push([picked.lat, picked.lng]);
    }
    if (center && hasValidCoords(center.lat, center.lng)) points.push([center.lat, center.lng]);
    if (points.length > 1) map.current.fitBounds(points, { padding: [30, 30], maxZoom: 14 });
    else if (points.length === 1) map.current.setView(points[0], Math.max(map.current.getZoom(), 13));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaflet, markers, picked, center]);

  if (failed) {
    return (
      <div className={`${className} flex items-center justify-center rounded-lg border bg-muted text-sm text-muted-foreground`}>
        Map unavailable – locations are still listed on this page.
      </div>
    );
  }
  return (
    <div>
      <div ref={container} className={`${className} w-full overflow-hidden rounded-lg border`} role="region" aria-label={label} />
      {(legend?.length || skipped > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {legend?.map((l) => (
            <span key={l.label} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: LEGEND_COLORS[l.tone] }} /> {l.label}
            </span>
          ))}
          {skipped > 0 && <span>{skipped} location(s) without valid coordinates are not shown.</span>}
        </div>
      )}
    </div>
  );
}
