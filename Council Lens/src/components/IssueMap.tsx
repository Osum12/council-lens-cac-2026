import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { LatLng } from '../types/civic';

/** `note` describes an unverified point (e.g. "approximate map point"); null for verified locations. */
export type MapPoint = { id: string; title: string; number: number; coords: LatLng; note: string | null };

type Props = {
  points: MapPoint[];
  origin: (LatLng & { label: string }) | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
};

// Used only when there are no points or starting location to frame the map.
const FALLBACK_CENTER: L.LatLngTuple = [34.0754, -84.2941];

type Offset = [number, number];

const pinIcon = (p: MapPoint, selected: boolean, [dx, dy]: Offset = [0, 0]) =>
  L.divIcon({
    className: '',
    // Only the numeric pin number is interpolated into HTML; titles are set as attributes below.
    html: `<span class="pin${selected ? ' pin--selected' : ''}${p.note ? ' pin--unverified' : ''}"><span>${Number(p.number)}</span></span>`,
    iconSize: [34, 42],
    iconAnchor: [17 - dx, 40 - dy],
  });

// Pins closer than this many pixels would cover each other.
const PIN_GAP = 32;

/**
 * Screen offsets that move overlapping pins just far enough apart to click, at the current zoom.
 * Pins are placed in number order; each one tries its own spot, then spots on rings around it.
 */
function spreadPins(map: L.Map, entries: { id: string; latlng: L.LatLng }[]): Map<string, Offset> {
  const placed: L.Point[] = [];
  const offsets = new Map<string, Offset>();
  for (const { id, latlng } of entries) {
    const base = map.latLngToLayerPoint(latlng);
    let chosen: Offset = [0, 0];
    search: for (let ring = 0; ring <= 4; ring++) {
      const steps = ring === 0 ? 1 : 8;
      for (let s = 0; s < steps; s++) {
        const angle = (s / steps) * 2 * Math.PI;
        const off: Offset = [Math.round(Math.cos(angle) * ring * PIN_GAP), Math.round(Math.sin(angle) * ring * PIN_GAP)];
        const at = base.add(L.point(off[0], off[1]));
        if (placed.every((q) => q.distanceTo(at) >= PIN_GAP)) {
          chosen = off;
          placed.push(at);
          break search;
        }
      }
    }
    offsets.set(id, chosen);
  }
  return offsets;
}

/**
 * Leaflet map with a public Esri basemap. Only records with valid coordinates are
 * passed in, so a record without a location never gets a marker. Markers are
 * created once per data change and only restyled on selection, so a keyboard
 * user's focus stays on the pin they chose.
 */
export function IssueMap({ points, origin, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef(new Map<string, { marker: L.Marker; point: MapPoint; offset: Offset }>());
  const onSelectRef = useRef(onSelect);
  const selectedRef = useRef(selectedId);
  const [tilesFailed, setTilesFailed] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
    selectedRef.current = selectedId;
  }, [onSelect, selectedId]);

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current) return;
    // No initial view here: the marker effect below sets it, so tiles load once at the right zoom.
    const map = L.map(containerRef.current, { scrollWheelZoom: false });
    const tiles = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution:
        'Tiles &copy; <a href="https://www.esri.com/en-us/legal/terms-of-use">Esri</a> &mdash; Sources: Esri, HERE, Garmin, USGS, Intermap, INCREMENT P, NRCan, Esri Japan, METI, Esri China (Hong Kong), Esri Korea, Esri (Thailand), NGCC, &copy; OpenStreetMap contributors, and the GIS User Community',
    });
    let errors = 0;
    tiles.on('tileerror', () => {
      errors += 1;
      if (errors >= 3) setTilesFailed(true);
    });
    tiles.on('tileload', () => {
      errors = 0;
      setTilesFailed(false);
    });
    tiles.addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    const markers = markersRef.current;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      markers.clear();
    };
  }, []);

  // Frame the map and build markers when the data or starting location changes.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    markersRef.current.clear();

    // Set the view first: Leaflet only creates marker elements once the map has a view,
    // and the accessibility attributes below need those elements.
    const latlngs: L.LatLngTuple[] = points.map((p) => [p.coords.latitude, p.coords.longitude]);
    if (origin) latlngs.push([origin.latitude, origin.longitude]);
    if (latlngs.length > 1) map.fitBounds(L.latLngBounds(latlngs), { padding: [36, 36], maxZoom: 16 });
    else if (latlngs.length === 1) map.setView(latlngs[0], 15);
    else map.setView(FALLBACK_CENTER, 14);
    const offsets = spreadPins(map, points.map((p) => ({ id: p.id, latlng: L.latLng(p.coords.latitude, p.coords.longitude) })));

    for (const p of points) {
      const label = `Map pin ${p.number}: ${p.title}${p.note ? ` (${p.note})` : ''}`;
      const marker = L.marker([p.coords.latitude, p.coords.longitude], {
        title: label,
        riseOnHover: true,
        icon: pinIcon(p, p.id === selectedRef.current, offsets.get(p.id)),
        zIndexOffset: p.id === selectedRef.current ? 1000 : 0,
      });
      marker.on('click', () => onSelectRef.current(p.id));
      marker.on('keypress', (e: L.LeafletKeyboardEvent) => {
        if (e.originalEvent.key === 'Enter' || e.originalEvent.key === ' ') {
          e.originalEvent.preventDefault();
          onSelectRef.current(p.id);
        }
      });
      layer.addLayer(marker);
      const el = marker.getElement();
      el?.setAttribute('aria-label', label);
      el?.setAttribute('aria-pressed', String(p.id === selectedRef.current));
      markersRef.current.set(p.id, { marker, point: p, offset: offsets.get(p.id) ?? [0, 0] });
    }

    if (origin) {
      const o = L.marker([origin.latitude, origin.longitude], {
        title: `${origin.label} (starting location)`,
        keyboard: false,
        interactive: false,
        // Drawn above the issue pins (a selected pin still rises above it), with a pulsing ring and a
        // "Start here" flag, so it is found first.
        zIndexOffset: 500,
        icon: L.divIcon({
          className: 'origin',
          html: '<span class="origin__pulse"></span><span class="origin-dot"></span><span class="origin__flag">Start here</span>',
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
      });
      layer.addLayer(o);
    }

  }, [points, origin]);

  // Re-spread pins after each zoom, since their distance on screen changes with it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onZoom = () => {
      const entries = [...markersRef.current].map(([id, m]) => ({ id, latlng: m.marker.getLatLng() }));
      const offsets = spreadPins(map, entries);
      for (const [id, m] of markersRef.current) {
        const next = offsets.get(id) ?? [0, 0];
        if (next[0] === m.offset[0] && next[1] === m.offset[1]) continue;
        m.offset = next;
        const el = m.marker.getElement();
        const hadFocus = el !== undefined && el === document.activeElement;
        m.marker.setIcon(pinIcon(m.point, id === selectedRef.current, next));
        const nextEl = m.marker.getElement();
        nextEl?.setAttribute('aria-label', `Map pin ${m.point.number}: ${m.point.title}${m.point.note ? ` (${m.point.note})` : ''}`);
        nextEl?.setAttribute('aria-pressed', String(id === selectedRef.current));
        if (hadFocus) nextEl?.focus();
      }
    };
    map.on('zoomend', onZoom);
    return () => {
      map.off('zoomend', onZoom);
    };
  }, []);

  // Restyle markers on selection without recreating their DOM nodes.
  useEffect(() => {
    for (const [id, { marker, point, offset }] of markersRef.current) {
      const selected = id === selectedId;
      const el = marker.getElement();
      const hadFocus = el !== undefined && el === document.activeElement;
      marker.setIcon(pinIcon(point, selected, offset));
      marker.setZIndexOffset(selected ? 1000 : 0);
      const next = marker.getElement();
      next?.setAttribute('aria-pressed', String(selected));
      if (hadFocus) next?.focus();
    }
    const sel = selectedId ? markersRef.current.get(selectedId) : undefined;
    if (sel && mapRef.current) mapRef.current.panInside(sel.marker.getLatLng(), { padding: [48, 48] });
  }, [selectedId]);

  return (
    <div className="map">
      <div ref={containerRef} className="map__canvas" role="region" aria-label="Map of issues that have a map point" />
      <div className="map__notices">
        {tilesFailed && (
          <p className="map__notice" role="status">
            Map background couldn’t load (you may be offline). Markers and the list still work.
          </p>
        )}
        {points.length === 0 && <p className="map__notice">None of the listed issues has map coordinates.</p>}
      </div>
    </div>
  );
}
