// Substantive items only: drops ceremony, procedure, presentations and closed sessions.
const n = require('./norm.json');
const flat = (s) => (s || '').replace(/\s+/g, ' ').trim();
const EXCLUDE_TYPES = /^(Executive Session|Commissioners Presentation\/Discussion|CM Presentation)/;
const EXCLUDE_TITLES = [
  /^Adoption of the .*Agenda/i,
  /^Ratification of (the )?Minutes/i,
  /Proclamations? (and Certificates )?for Spreading/i,
  /^Presentation of Proclamations/i,
  /^Public Comment/i,
  /^(CALL TO ORDER|ROLL CALL|INVOCATION|PLEDGE)/i,
  /^Adoption of the .*Meeting/i,
  /^Executive \(CLOSED\)/i,
  /^No action is requested/i,
];
// Presentations and discussions stay only when the board actually decided something on them.
const TALK = /^(Presentation|Discussion|Follow up discussion|Reparations Task Force Update)/i;
function reason(m) {
  const t = flat(m.title);
  if (EXCLUDE_TYPES.test(m.type)) return 'type:' + m.type.replace(/ -.*/, '');
  const hit = EXCLUDE_TITLES.find((re) => re.test(t));
  if (hit) return 'title:' + hit.source.slice(0, 30);
  if (m.outcome === 'discussed') return 'discussed-only';
  if (m.outcome === 'spread') return 'spread-on-minutes';
  if (TALK.test(t) && !['approved', 'failed', 'denied', 'held', 'filed'].includes(m.outcome)) return 'presentation';
  return null;
}
const keep = [];
const drop = {};
for (const m of n) {
  const r = reason(m);
  if (r) drop[r] = (drop[r] || 0) + 1;
  else keep.push(m);
}
module.exports = { keep, flat };
if (require.main === module) {
  const c = (arr, f) => Object.entries(arr.reduce((o, x) => ((o[f(x)] = (o[f(x)] || 0) + 1), o), {})).sort((a, b) => b[1] - a[1]);
  console.log('kept', keep.length, 'dropped', n.length - keep.length, drop);
  console.log('kept outcomes', c(keep, (m) => m.outcome));
  console.log('kept types', c(keep, (m) => m.type));
  const none = keep.filter((m) => !m.outcome);
  console.log('\nNO OUTCOME', none.length);
  for (const m of none.slice(0, 60))
    console.log(' ', m.file, m.appearances.at(-1).date, '[' + m.type.slice(0, 22) + ']', flat(m.title).slice(0, 70), '...', flat(m.appearances.at(-1).title).slice(-90));
}
