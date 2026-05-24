'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';

export interface MapPoint { lat: number; lon: number; label: string }

/**
 * Lazy map for geo answers — Leaflet loaded from CDN at runtime (zero bundle, no
 * key), OpenStreetMap tiles, gold circle markers (on-brand, and they avoid
 * Leaflet's broken default-icon image paths). Connects two points with a line
 * for a distance answer. Browser-only; cleans up on unmount.
 */
export function MapView({ points, line }: { points: MapPoint[]; line?: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!points?.length) return;
    let map: any;
    let cancelled = false;
    (async () => {
      const CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      if (!document.querySelector(`link[href="${CSS}"]`)) {
        const l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = CSS;
        document.head.appendChild(l);
      }
      const url = 'https://esm.sh/leaflet@1.9.4';
      const L: any = (await import(/* webpackIgnore: true */ /* @vite-ignore */ url)).default;
      if (cancelled || !ref.current) return;
      map = L.map(ref.current, { zoomControl: true, scrollWheelZoom: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(map);
      const latlngs = points.map((p) => [p.lat, p.lon] as [number, number]);
      for (const p of points) {
        L.circleMarker([p.lat, p.lon], { radius: 7, color: '#b8860b', fillColor: '#e2b24a', fillOpacity: 0.9, weight: 2 })
          .addTo(map)
          .bindPopup(p.label);
      }
      if (line && latlngs.length >= 2) L.polyline(latlngs, { color: '#b8860b', weight: 3, opacity: 0.8 }).addTo(map);
      if (latlngs.length === 1) map.setView(latlngs[0], 9);
      else map.fitBounds(latlngs, { padding: [40, 40] });
    })();
    return () => {
      cancelled = true;
      if (map) map.remove();
    };
  }, [points, line]);

  return <div ref={ref} className="mt-3 h-64 w-full overflow-hidden rounded-xl border border-[var(--color-stroke)]" />;
}
