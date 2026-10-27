import { createContext, useContext } from 'react';
import { countyPath, type County } from './jurisdictions';

/** The covered county whose records the current page shows; null outside its pages. */
export const PlaceContext = createContext<County | null>(null);

export const usePlace = () => useContext(PlaceContext);

/** Builds links inside the current county, e.g. href('/archive') → "/county/fulton/archive". */
export function usePlaceHref() {
  const place = usePlace();
  return (path = '/') => (place ? countyPath(place, path) : path);
}

/** "Fulton County Board of Commissioners" — the governments the current records come from, for labels. */
export function useRecordSources(): string {
  const names = (usePlace()?.recordSources ?? []).map((s) => s.name);
  return names.length < 3 ? names.join(' and ') : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}
