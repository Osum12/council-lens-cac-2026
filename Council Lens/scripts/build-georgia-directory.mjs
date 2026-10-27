// Builds data/georgia/directory.json from the U.S. Census Bureau 2020 FIPS reference files
// kept in data/georgia/source/. Run with: npm run build:directory
// Source files:
//   https://www2.census.gov/geo/docs/reference/codes2020/cou/st13_ga_cou2020.txt
//   https://www2.census.gov/geo/docs/reference/codes2020/place/st13_ga_place2020.txt
// The directory is geography only. It holds no civic records and no availability flags;
// which places have civic records is decided in src/config/coverage.ts.
import { readFileSync, writeFileSync } from 'node:fs';

const read = (file) => {
  const [header, ...rows] = readFileSync(new URL(`../data/georgia/source/${file}`, import.meta.url), 'utf8').trim().split(/\r?\n/);
  const keys = header.split('|');
  return rows.map((r) => Object.fromEntries(r.split('|').map((v, i) => [keys[i], v])));
};

const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const counties = read('st13_ga_cou2020.txt').map((c) => ({
  id: slugify(c.COUNTYNAME.replace(/ County$/, '')),
  name: c.COUNTYNAME,
  fips: c.STATEFP + c.COUNTYFP,
}));
const countyByName = new Map(counties.map((c) => [c.name, c]));

// Incorporated places only (no census-designated places). The two "(balance)" rows are the
// city portions of the Athens-Clarke and Augusta-Richmond consolidated governments; they are
// kept so those places can be found, under the government's name.
const municipalities = read('st13_ga_place2020.txt')
  .filter((p) => p.TYPE === 'INCORPORATED PLACE' && (p.FUNCSTAT === 'A' || p.PLACENAME.endsWith(' (balance)')))
  .map((p) => {
    const raw = p.PLACENAME.replace(/ \(balance\)$/, '');
    const m = raw.match(/^(.*) (city|town)$/);
    const name = m ? m[1] : raw;
    const countyIds = p.COUNTIES.split('~~~').map((n) => {
      const c = countyByName.get(n);
      if (!c) throw new Error(`Unknown county "${n}" for ${p.PLACENAME}`);
      return c.id;
    });
    return { id: slugify(name), name, kind: m ? m[2] : 'consolidated government', geoid: p.STATEFP + p.PLACEFP, countyIds };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const ids = new Set();
for (const m of municipalities) {
  if (ids.has(m.id)) throw new Error(`Duplicate municipality id ${m.id}`);
  ids.add(m.id);
}

const directory = {
  state: { id: 'georgia', name: 'Georgia', fips: '13' },
  source: {
    name: 'U.S. Census Bureau, 2020 FIPS codes for counties and places (Georgia)',
    urls: [
      'https://www2.census.gov/geo/docs/reference/codes2020/cou/st13_ga_cou2020.txt',
      'https://www2.census.gov/geo/docs/reference/codes2020/place/st13_ga_place2020.txt',
    ],
    note: 'Incorporated places as of 2020. Cities incorporated or dissolved since 2020 are not reflected yet.',
  },
  counties: counties.sort((a, b) => a.name.localeCompare(b.name)),
  municipalities,
};
writeFileSync(new URL('../data/georgia/directory.json', import.meta.url), JSON.stringify(directory, null, 1) + '\n');
console.log(`${directory.counties.length} counties, ${municipalities.length} municipalities`);
