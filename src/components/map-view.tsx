'use client';

import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import type { Map as LeafletMap, LayerGroup } from 'leaflet';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
  href?: string;
  tone?: 'green' | 'blue' | 'amber';
}

const TONES = { green: '#16a34a', blue: '#2563eb', amber: '#d97706' };

/**
 * Leaflet map without react-leaflet (which targets React 18 while the App Router runs React 19).
 * Markers are circle markers (no image assets); popup text is set via textContent, never HTML.
 * If OpenStreetMap tiles cannot load, markers still render and the page keeps its list view.
 */
export function MapView({
  markers,
  center,
  zoom = 12,
  onPick,
  picked,
  className = 'h-80',
}: {
  markers?: MapMarker[];
  center?: { lat: number; lng: number } | null;
  zoom?: number;
  onPick?: (pos: { lat: number; lng: number }) => void;
  picked?: { lat: number; lng: number } | null;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const pickRef = useRef(onPick);
  const [leaflet, setLeaflet] = useState<typeof import('leaflet') | null>(null);
  const [failed, setFailed] = useState(false);
  pickRef.current = onPick;

  useEffect(() => {
    let cancelled = false;
    import('leaflet')
      .then((mod) => {
        if (cancelled || !container.current || map.current) return;
        const L = mod.default ?? mod;
        const start = center ?? (markers?.[0] ? { lat: markers[0].lat, lng: markers[0].lng } : { lat: 26.9124, lng: 75.7873 });
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

    for (const mk of markers ?? []) {
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
      L.circleMarker([mk.lat, mk.lng], {
        radius: 9, color: '#fff', weight: 2, fillColor: TONES[mk.tone ?? 'green'], fillOpacity: 0.95,
      }).bindPopup(popup).addTo(layer.current);
      points.push([mk.lat, mk.lng]);
    }
    if (picked) {
      L.circleMarker([picked.lat, picked.lng], { radius: 10, color: '#fff', weight: 3, fillColor: '#dc2626', fillOpacity: 1 })
        .addTo(layer.current);
      points.push([picked.lat, picked.lng]);
    }
    if (center) points.push([center.lat, center.lng]);
    if (points.length > 1) map.current.fitBounds(points, { padding: [30, 30], maxZoom: 14 });
    else if (points.length === 1) map.current.setView(points[0], Math.max(map.current.getZoom(), 13));
  }, [leaflet, markers, picked, center]);

  if (failed) {
    return (
      <div className={`${className} flex items-center justify-center rounded-lg border bg-muted text-sm text-muted-foreground`}>
        Map unavailable – locations are still listed below.
      </div>
    );
  }
  return <div ref={container} className={`${className} w-full overflow-hidden rounded-lg border`} role="region" aria-label="Map" />;
}
