// Georgia geography (state → county → municipality) joined with civic-record coverage.
// Directory data is geography only and comes from the U.S. Census Bureau (see
// scripts/build-georgia-directory.mjs). Whether a place has civic records comes only
// from src/config/coverage.ts. Fulton is the current working example; other counties need
// their own connected datasets. Cities currently have Coming Soon pages without records.

import directory from '../../data/georgia/directory.json';
import { CIVIC_DATA_COVERAGE, type RecordSource } from '../config/coverage';

export type County = {
  level: 'county';
  id: string;
  name: string; // e.g. "Fulton County"
  fips: string;
  civicDataAvailable: boolean;
  /** Governments whose records the county page shows; empty when it has none. */
  recordSources: RecordSource[];
};

export type Municipality = {
  level: 'municipality';
  id: string;
  name: string; // e.g. "Alpharetta"
  kind: string; // "city", "town" or "consolidated government"
  geoid: string;
  /** A municipality can sit in more than one county (Atlanta is in DeKalb and Fulton). */
  countyIds: string[];
};

export type Jurisdiction = County | Municipality;

export const GEORGIA = directory.state;
export const DIRECTORY_SOURCE = directory.source;

export const COUNTIES: County[] = directory.counties.map((c) => {
  const recordSources = Object.hasOwn(CIVIC_DATA_COVERAGE, c.id) ? CIVIC_DATA_COVERAGE[c.id] : [];
  return { level: 'county', ...c, civicDataAvailable: recordSources.length > 0, recordSources };
});
export const MUNICIPALITIES: Municipality[] = directory.municipalities.map((m) => ({ level: 'municipality', ...m }));

const countyById = new Map(COUNTIES.map((c) => [c.id, c]));
const municipalityById = new Map(MUNICIPALITIES.map((m) => [m.id, m]));

/** Lookups ignore letter case, so /county/Fulton works; unknown ids return null, never a fallback. */
export const getCounty = (id: string | null | undefined): County | null => (id ? (countyById.get(id.toLowerCase()) ?? null) : null);
export const getMunicipality = (id: string | null | undefined): Municipality | null => (id ? (municipalityById.get(id.toLowerCase()) ?? null) : null);

/** Municipalities with any part inside the county, alphabetically. */
export const municipalitiesInCounty = (countyId: string): Municipality[] => MUNICIPALITIES.filter((m) => m.countyIds.includes(countyId));

export const countiesOf = (m: Municipality): County[] => m.countyIds.map(getCounty).filter((c): c is County => c !== null);

export const availableCounties = (): County[] => COUNTIES.filter((c) => c.civicDataAvailable);

/** The county page a city's old links should open: a county of that city that has records, if any. */
export const coveredCountyOf = (m: Municipality): County | null => countiesOf(m).find((c) => c.civicDataAvailable) ?? null;

/** "Fulton County", "DeKalb and Fulton counties", "Bleckley, Laurens, and Twiggs counties". */
export function countyNames(counties: County[]): string {
  const bare = counties.map((c) => c.name.replace(/ County$/, ''));
  if (bare.length <= 1) return counties[0]?.name ?? '';
  const list = bare.length === 2 ? bare.join(' and ') : `${bare.slice(0, -1).join(', ')}, and ${bare[bare.length - 1]}`;
  return `${list} counties`;
}

/** "Fulton County, Georgia" or "Roswell, Cobb and Fulton counties" for headers. */
export function placeLabel(place: Jurisdiction): string {
  return place.level === 'county' ? `${place.name}, Georgia` : `${place.name}, ${countyNames(countiesOf(place))}`;
}

/** Links for a county's pages, e.g. countyPath(fulton, '/archive') → "/county/fulton/archive". */
export const countyPath = (c: Pick<County, 'id'>, path = '/') => `/county/${c.id}${path === '/' ? '' : path}`;

/** The home-page chooser, pre-filled with the place (used by "Change location"). A city in several counties uses the one with a page, if any. */
export function chooserPath(place?: Jurisdiction | null): string {
  if (!place) return '/';
  if (place.level === 'county') return `/?county=${place.id}`;
  const county = coveredCountyOf(place) ?? countiesOf(place)[0];
  return county ? `/?${new URLSearchParams({ county: county.id, city: place.id })}` : '/';
}

/** Sections of a county's pages; also the app's original top-level links, which redirect. */
export const PAGE_SECTIONS = ['near-me', 'calendar', 'archive', 'issues', 'meetings', 'documents'] as const;

/** First path segments the app uses for itself; a municipality id may never be one of these. */
export const RESERVED_SEGMENTS: readonly string[] = ['county', ...PAGE_SECTIONS];
