// Looks up street addresses quoted in item text with the U.S. Census Bureau geocoder (cached).
// Only exact address matches inside Georgia are kept; they are shown as approximate map points.
const fs = require('fs');
const path = require('path');
const T = require('./text.cjs');
const { keep } = require('./filter.cjs');
const FILE = path.join(__dirname, 'geocode.json');
const cache = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
const addrs = [...new Set(keep.map((m) => T.addressOf(T.cleanOfficial(m.title))).filter(Boolean))];
(async () => {
  let hit = 0;
  for (const a of addrs) {
    if (!(a in cache)) {
      const u = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(a)}&benchmark=Public_AR_Current&format=json`;
      try {
        const j = await (await fetch(u)).json();
        const m = j.result?.addressMatches?.[0];
        cache[a] = m && /, GA, \d{5}/.test(m.matchedAddress) ? { lat: +m.coordinates.y.toFixed(6), lon: +m.coordinates.x.toFixed(6), matched: m.matchedAddress } : { lat: null };
      } catch (e) {
        console.log('error', a, e.message);
        continue;
      }
      fs.writeFileSync(FILE, JSON.stringify(cache, null, 1));
    }
    if (cache[a].lat) hit++;
  }
  console.log('addresses', addrs.length, 'matched', hit);
})();
