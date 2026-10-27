// Opens every fulton.legistar.com page link in the built data in a real browser and checks the
// page shows what it should: an item page shows its own file number; a meeting page shows its
// date; a video page is not an error page. Cached in pagecheck.json.
const fs = require('fs');
const path = require('path');
const { chromium } = require(path.join(__dirname, '..', 'pw', 'node_modules', 'playwright-core'));
const FILE = path.join(__dirname, 'pagecheck.json');
const cache = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
const I = require('./out-issues.json'), M = require('./out-meetings.json');
const siteLinks = require('./itemlinks.json').byFile;
const fileOfUrl = new Map(Object.entries(siteLinks).map(([f, [u]]) => [u, f]));
const jobs = [];
for (const u of new Set(I.flatMap((i) => i.sourceUrls))) jobs.push({ u, expect: fileOfUrl.get(u), kind: 'item' });
for (const m of M) {
  if (m.officialPageUrl) jobs.push({ u: m.officialPageUrl, expect: new Date(m.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' }), kind: 'meeting' });
  if (m.recordingUrl) jobs.push({ u: m.recordingUrl, expect: null, kind: 'video' });
}
(async () => {
  const b = await chromium.launch({ channel: 'msedge' });
  const todo = jobs.filter((j) => !cache[j.u]?.ok);
  console.log('pages', jobs.length, 'to check', todo.length);
  let i = 0, done = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    const p = await b.newPage();
    while (i < todo.length) {
      const j = todo[i++];
      let res;
      try {
        const r = await p.goto(j.u, { waitUntil: 'domcontentloaded', timeout: 90000 });
        const text = await p.evaluate(() => document.body.innerText);
        const invalid = /Invalid parameters/i.test(text) || text.length < 200;
        const shows = j.expect ? text.includes(j.expect) : true;
        res = { ok: r.status() === 200 && !invalid && shows, status: r.status(), note: invalid ? 'invalid page' : shows ? '' : `missing ${j.expect}` };
      } catch (e) {
        res = { ok: false, status: 0, note: e.message.slice(0, 60) };
      }
      cache[j.u] = { ...res, kind: j.kind };
      if (++done % 100 === 0) { fs.writeFileSync(FILE, JSON.stringify(cache)); console.log('checked', done); }
    }
    await p.close();
  }));
  fs.writeFileSync(FILE, JSON.stringify(cache));
  await b.close();
  const bad = jobs.filter((j) => !cache[j.u].ok);
  console.log('ok', jobs.length - bad.length, 'bad', bad.length);
  for (const j of bad.slice(0, 30)) console.log(' ', j.kind, cache[j.u].status, cache[j.u].note, j.u);
})();
