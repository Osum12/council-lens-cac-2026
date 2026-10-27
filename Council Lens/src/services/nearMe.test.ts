import { DEMO_LOCATIONS, distanceMiles, getValidCoordinates, rankIssuesForLocation } from './nearMe';
import type { Issue } from '../types/civic';

const base: Issue = {
  id: 'x',
  title: 'X',
  category: 'c',
  summary: 's',
  status: 'unknown',
  statusAsOf: null,
  meetingIds: [],
  documentIds: [],
  location: null,
  whyItMayMatter: null,
  sourceUrls: [],
  dataMode: 'mock',
  mockOnly: true,
  featured: false,
};
const at = (id: string, latitude: number | null, longitude: number | null): Issue => ({
  ...base,
  id,
  title: id,
  location: { label: null, address: null, latitude, longitude, locationType: 'mock_marker', verified: false },
});

describe('nearMe', () => {
  it('computes plausible distances', () => {
    // 0.01 degrees of latitude is about 0.69 miles.
    expect(distanceMiles({ latitude: 34, longitude: -84 }, { latitude: 34.01, longitude: -84 })).toBeCloseTo(0.69, 1);
  });

  it('accepts only finite coordinates inside the Fulton County area', () => {
    expect(getValidCoordinates(at('a', 34.07, -84.29))).not.toBeNull();
    expect(getValidCoordinates(at('b', null, -84.29))).toBeNull();
    expect(getValidCoordinates(at('c', 0, 0))).toBeNull();
    expect(getValidCoordinates(at('d', Number.NaN, -84.29))).toBeNull();
    expect(getValidCoordinates(base)).toBeNull();
  });

  it('ranks located issues by distance and keeps unlocated issues at the end', () => {
    const origin = DEMO_LOCATIONS[0];
    const ranked = rankIssuesForLocation(
      [base, at('far', origin.latitude + 0.05, origin.longitude), at('near', origin.latitude + 0.001, origin.longitude)],
      origin,
    );
    expect(ranked.map((r) => r.issue.id)).toEqual(['near', 'far', 'x']);
    expect(ranked[2].coords).toBeNull();
    expect(ranked[2].reason).toMatch(/no map location/i);
    expect(ranked[0].reason).toMatch(/distance only/i);
  });

  it('does not claim proximity when no location is chosen', () => {
    const ranked = rankIssuesForLocation([at('a', 34.07, -84.29)], null);
    expect(ranked[0].distance).toBeNull();
    expect(ranked[0].reason).not.toMatch(/mi away/);
  });
});
