// Opens every URL in the built data and records the HTTP status (cached in urlcheck.json).
// A link counts as working only on a 2xx response; Legistar pages are also checked for an error page.
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, 'urlcheck.json');
const cache = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
const I = require('./out-issues.json'), M = require('./out-meetings.json'), D = require('./out-documents.json');
const urls = [...new Set([...I.flatMap((i) => i.sourceUrls), ...M.flatMap((m) => [m.officialPageUrl, m.recordingUrl]), ...D.map((d) => d.url)].filter(Boolean))];
async function check(u) {
  for (let i = 0; i < 3; i++) {
    try {
      const isPage = /legistar\.com\/(LegislationDetail|MeetingDetail|Video)\.aspx/.test(u);
      const r = await fetch(u, { headers: isPage ? {} : { Range: 'bytes=0-0' }, redirect: 'follow', signal: AbortSignal.timeout(60000) });
      let ok = r.status >= 200 && r.status < 300;
      let note = '';
      if (isPage) {
        const body = await r.text();
        if (/Invalid parameters|An error has occurred|Page not found/i.test(body)) { ok = false; note = 'error page'; }
      } else await r.body?.cancel();
      return { status: r.status, ok, note };
    } catch (e) {
      if (i === 2) return { status: 0, ok: false, note: e.message.slice(0, 60) };
      await new Promise((res) => setTimeout(res, 2000 * (i + 1)));
    }
  }
}
(async () => {
  const todo = urls.filter((u) => !cache[u]?.ok);
  console.log('urls', urls.length, 'to check', todo.length);
  let i = 0, done = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (i < todo.length) {
      const u = todo[i++];
      cache[u] = await check(u);
      if (++done % 250 === 0) { fs.writeFileSync(FILE, JSON.stringify(cache)); console.log('checked', done); }
    }
  }));
  fs.writeFileSync(FILE, JSON.stringify(cache));
  const bad = urls.filter((u) => !cache[u].ok);
  console.log('working', urls.length - bad.length, 'broken', bad.length);
  for (const u of bad.slice(0, 40)) console.log(' ', cache[u].status, cache[u].note, u);
})();
