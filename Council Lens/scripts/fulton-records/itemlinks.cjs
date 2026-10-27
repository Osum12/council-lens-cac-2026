// Reads each meeting's official page on fulton.legistar.com and records the public link for every
// agenda item (file number -> LegislationDetail URL). The public site's item IDs differ from the
// web API's MatterIds, so item links must come from the site itself. Cached in itemlinks.json.
const fs = require('fs');
const path = require('path');
const { chromium } = require(path.join(__dirname, '..', 'pw', 'node_modules', 'playwright-core'));
const FILE = path.join(__dirname, 'itemlinks.json');
const cache = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : { byEvent: {}, byFile: {} };
const events = require('./raw/events/list-2025-01-01.json').filter((e) => e.EventBodyId === 138);
(async () => {
  const b = await chromium.launch({ channel: 'msedge' });
  const p = await b.newPage();
  for (const e of events) {
    if (cache.byEvent[e.EventId]) continue;
    await p.goto(e.EventInSiteURL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    // Show every row if the grid is paged.
    const rows = await p.$$eval('a[href*="LegislationDetail.aspx"]', (as) =>
      as.map((a) => ({ text: a.textContent.trim(), href: a.href })).filter((x) => /^\d\d-\d{4}$|^\d\d-$/.test(x.text)),
    );
    const pager = await p.$$eval('.rgPageNext, a.rgNumPart', (x) => x.length);
    cache.byEvent[e.EventId] = { url: e.EventInSiteURL, count: rows.length, paged: pager > 0 };
    for (const r of rows) (cache.byFile[r.text] ||= []).includes(r.href) || cache.byFile[r.text].push(r.href);
    fs.writeFileSync(FILE, JSON.stringify(cache, null, 1));
    console.log(e.EventDate.slice(0, 10), e.EventId, rows.length, pager ? 'PAGED' : '');
  }
  await b.close();
  console.log('files linked', Object.keys(cache.byFile).length);
})();
