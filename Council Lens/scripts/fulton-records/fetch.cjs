// Pulls Fulton County BOC records from the public Legistar web API into raw/ (cached; rerun-safe).
// node fetch.cjs [fromDate]
const fs = require('fs');
const path = require('path');
const API = 'https://webapi.legistar.com/v1/fulton';
const RAW = path.join(__dirname, 'raw');
for (const d of ['events', 'items', 'matters', 'histories', 'votes', 'texts']) fs.mkdirSync(path.join(RAW, d), { recursive: true });
const from = process.argv[2] || '2025-01-01';

async function get(url, file, tries = 4) {
  if (file && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(r.status + ' ' + url);
      const j = await r.json();
      if (file) fs.writeFileSync(file, JSON.stringify(j));
      return j;
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((res) => setTimeout(res, 1000 * (i + 1)));
    }
  }
}
async function pool(list, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < list.length) { const x = list[i++]; await fn(x); } }));
}

(async () => {
  const events = await get(`${API}/events?$filter=EventDate+ge+datetime'${from}'&$orderby=EventDate`, path.join(RAW, 'events', `list-${from}.json`));
  console.log('events', events.length);
  const matterIds = new Set();
  const rollCallItems = [];
  await pool(events, 4, async (e) => {
    const items = await get(`${API}/events/${e.EventId}/eventitems?AgendaNote=1&MinutesNote=1&Attachments=1`, path.join(RAW, 'items', `${e.EventId}.json`));
    for (const it of items) {
      if (it.EventItemMatterId) matterIds.add(it.EventItemMatterId);
      if (it.EventItemRollCallFlag || it.EventItemTally || it.EventItemPassedFlag !== null) rollCallItems.push(it.EventItemId);
    }
  });
  console.log('matters', matterIds.size, 'items with actions', rollCallItems.length);
  let done = 0;
  await pool([...matterIds], 6, async (id) => {
    await get(`${API}/matters/${id}`, path.join(RAW, 'matters', `${id}.json`));
    await get(`${API}/matters/${id}/histories`, path.join(RAW, 'histories', `${id}.json`));
    if (++done % 200 === 0) console.log('matters fetched', done);
  });
  done = 0;
  await pool(rollCallItems, 6, async (id) => {
    await get(`${API}/eventitems/${id}/votes`, path.join(RAW, 'votes', `${id}.json`));
    if (++done % 200 === 0) console.log('votes fetched', done);
  });
  console.log('done');
})();
