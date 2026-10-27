// Near Me ranking for the current county example. Deliberately simple and explainable:
//   1. Issues with valid coordinates, nearest first (straight-line distance).
//   2. Issues with no usable coordinates, kept in the feed as countywide items.
// No geocoding happens in the app: distances are measured from the public starting point below.

import type { Issue, LatLng } from '../types/civic';

export type DemoLocation = LatLng & { id: string; label: string; description: string };

// Public starting point for the Fulton example; configure it for another county.
// Never the user's own address. Coordinates come from the
// U.S. Census Bureau geocoder for the published street address (checked 2026-10-22).
export const DEMO_LOCATIONS: DemoLocation[] = [
  { id: 'government-center', label: 'Fulton County Government Center', description: '141 Pryor Street SW, Atlanta', latitude: 33.752699, longitude: -84.390034 },
];

/** Short description of how trustworthy an issue's map point is. */
export function pointKind(issue: Issue): string {
  const loc = issue.location;
  if (loc?.verified) return 'recorded location';
  if (loc?.locationType === 'mock_marker') return 'sample map point';
  if (loc?.locationType === 'approximate') return 'approximate map point';
  return 'unverified map point';
}

/** Bounds for the Fulton example; configure alongside the public starting point for another county. */
const AREA_BOUNDS = { minLat: 33.5, maxLat: 34.2, minLng: -84.86, maxLng: -84.09 };

export function getValidCoordinates(issue: Issue): LatLng | null {
  const lat = issue.location?.latitude;
  const lng = issue.location?.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < AREA_BOUNDS.minLat || lat > AREA_BOUNDS.maxLat || lng < AREA_BOUNDS.minLng || lng > AREA_BOUNDS.maxLng) return null;
  return { latitude: lat, longitude: lng };
}

/** Great-circle distance in miles (haversine formula). */
export function distanceMiles(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

export type RankedIssue = {
  issue: Issue;
  coords: LatLng | null;
  distance: number | null;
  reason: string;
};

export function rankIssuesForLocation(issues: Issue[], origin: LatLng | null): RankedIssue[] {
  const ranked = issues.map((issue): RankedIssue => {
    const coords = getValidCoordinates(issue);
    const distance = coords && origin ? distanceMiles(origin, coords) : null;
    return { issue, coords, distance, reason: explain(issue, coords, distance, origin) };
  });
  return ranked.sort((a, b) => {
    if (a.distance !== null && b.distance !== null) return a.distance - b.distance;
    if (a.distance !== null) return -1;
    if (b.distance !== null) return 1;
    return a.issue.title.localeCompare(b.issue.title);
  });
}

function explain(issue: Issue, coords: LatLng | null, distance: number | null, origin: LatLng | null): string {
  const point = pointKind(issue);
  if (coords && distance !== null) {
    const miles = distance < 0.1 ? 'under 0.1' : distance.toFixed(1);
    return `About ${miles} mi away in a straight line, measured to its ${point}. This is distance only, not a claim that the issue affects this spot.`;
  }
  if (coords && !origin) return `Has ${/^[aeiou]/.test(point) ? 'an' : 'a'} ${point} on the map. Choose a starting location to sort by distance.`;
  return 'This record has no map location, so it is listed as a countywide item instead of being ranked by distance.';
}
