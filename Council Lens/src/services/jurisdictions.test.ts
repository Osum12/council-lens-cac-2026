import countySource from '../../data/georgia/source/st13_ga_cou2020.txt?raw';
import placeSource from '../../data/georgia/source/st13_ga_place2020.txt?raw';
import { CIVIC_DATA_COVERAGE, LEGACY_COUNTY_ID } from '../config/coverage';
import {
  COUNTIES,
  MUNICIPALITIES,
  RESERVED_SEGMENTS,
  availableCounties,
  chooserPath,
  countiesOf,
  countyPath,
  coveredCountyOf,
  countyNames,
  getCounty,
  getMunicipality,
  municipalitiesInCounty,
  placeLabel,
} from './jurisdictions';

const sourceRows = (text: string): string[][] =>
  text
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((r) => r.split('|'));

describe('Georgia county directory', () => {
  it('has all 159 counties, matching the Census source file, in alphabetical order', () => {
    expect(COUNTIES).toHaveLength(159);
    expect(COUNTIES.map((c) => c.name)).toEqual(sourceRows(countySource).map((r) => r[4]).sort((a, b) => a.localeCompare(b)));
    expect(new Set(COUNTIES.map((c) => c.id)).size).toBe(159);
    expect(COUNTIES.every((c) => /^13\d{3}$/.test(c.fips))).toBe(true);
  });

  it('enables Fulton County as the current example, from the Fulton County Board of Commissioners', () => {
    // Guard the current example's coverage. Update with another connected, verified county
    // dataset and county-specific data selection; the geographic directory alone adds no records.
    expect(CIVIC_DATA_COVERAGE).toEqual({ fulton: [{ name: 'Fulton County Board of Commissioners', meetingPlace: 'the Government Center' }] });
    expect(availableCounties().map((c) => c.id)).toEqual(['fulton']);
    expect(COUNTIES.filter((c) => c.id !== 'fulton').every((c) => !c.civicDataAvailable && c.recordSources.length === 0)).toBe(true);
    expect(getCounty(LEGACY_COUNTY_ID)?.civicDataAvailable).toBe(true);
  });
});

describe('Georgia municipality directory', () => {
  it('lists every active incorporated place in the Census source, with unique ids', () => {
    const active = sourceRows(placeSource).filter((r) => r[5] === 'INCORPORATED PLACE' && (r[7] === 'A' || r[4].endsWith('(balance)')));
    expect(MUNICIPALITIES).toHaveLength(active.length);
    expect(new Set(MUNICIPALITIES.map((m) => m.id)).size).toBe(MUNICIPALITIES.length);
    expect(new Set(MUNICIPALITIES.map((m) => m.geoid))).toEqual(new Set(active.map((r) => r[1] + r[2])));
  });

  it('links every municipality only to real counties', () => {
    for (const m of MUNICIPALITIES) {
      expect(m.countyIds.length).toBeGreaterThan(0);
      expect(countiesOf(m)).toHaveLength(m.countyIds.length);
    }
  });

  it('models cities that cross county lines', () => {
    expect(getMunicipality('alpharetta')?.countyIds).toEqual(['fulton']);
    expect(getMunicipality('atlanta')?.countyIds).toEqual(['dekalb', 'fulton']);
    expect(getMunicipality('roswell')?.countyIds).toEqual(['cobb', 'fulton']);
    expect(municipalitiesInCounty('fulton').map((m) => m.id)).toEqual(expect.arrayContaining(['alpharetta', 'atlanta', 'roswell', 'johns-creek']));
    expect(municipalitiesInCounty('dekalb').map((m) => m.id)).toContain('atlanta');
    expect(municipalitiesInCounty('cobb').map((m) => m.id)).not.toContain('alpharetta');
    expect(MUNICIPALITIES.filter((m) => m.countyIds.length > 1).length).toBeGreaterThan(40);
  });

  it('never gives a municipality an id the app uses for its own pages', () => {
    expect(MUNICIPALITIES.filter((m) => RESERVED_SEGMENTS.includes(m.id))).toEqual([]);
  });
});

describe('lookups', () => {
  it('finds the covered county for a city in it', () => {
    expect(coveredCountyOf(getMunicipality('roswell')!)?.id).toBe('fulton');
    expect(coveredCountyOf(getMunicipality('atlanta')!)?.id).toBe('fulton');
    expect(coveredCountyOf(getMunicipality('marietta')!)).toBeNull();
  });

  it('rejects unknown ids instead of guessing, and ignores letter case', () => {
    expect(getCounty('narnia')).toBeNull();
    expect(getMunicipality('narnia')).toBeNull();
    expect(getMunicipality('')).toBeNull();
    expect(getCounty(null)).toBeNull();
    expect(getMunicipality('toString')).toBeNull();
    expect(getCounty('Fulton')?.id).toBe('fulton');
    expect(getMunicipality('ALPHARETTA')?.id).toBe('alpharetta');
  });
});

describe('labels and paths', () => {
  it('names one, two, or more counties', () => {
    const c = (...ids: string[]) => ids.map((id) => getCounty(id)!);
    expect(countyNames(c('fulton'))).toBe('Fulton County');
    expect(countyNames(c('dekalb', 'fulton'))).toBe('DeKalb and Fulton counties');
    expect(countyNames(c('bleckley', 'laurens', 'twiggs'))).toBe('Bleckley, Laurens, and Twiggs counties');
    expect(placeLabel(getMunicipality('alpharetta')!)).toBe('Alpharetta, Fulton County');
    expect(placeLabel(getCounty('fulton')!)).toBe('Fulton County, Georgia');
  });

  it('builds county and chooser links', () => {
    const fulton = getCounty('fulton')!;
    expect(countyPath(fulton)).toBe('/county/fulton');
    expect(countyPath(fulton, '/archive')).toBe('/county/fulton/archive');
    expect(chooserPath(getMunicipality('alpharetta'))).toBe('/?county=fulton&city=alpharetta');
    expect(chooserPath(getMunicipality('roswell'))).toBe('/?county=fulton&city=roswell'); // Cobb comes first, but Fulton has the page
    expect(chooserPath(getMunicipality('marietta'))).toBe('/?county=cobb&city=marietta');
    expect(chooserPath(getCounty('cobb'))).toBe('/?county=cobb');
    expect(chooserPath(null)).toBe('/');
  });
});
