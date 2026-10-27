// Independent check of the PDF-backed summaries: evidence quotes exist in their sources, every
// number in a description occurs in the item's sources, and no description states an outcome.
const fs = require('fs');
const path = require('path');
const T = require('./text.cjs');
const norm = require('./norm.json');
const S = {};
for (const f of fs.readdirSync(path.join(__dirname, 'summaries')).filter((f) => /^out-\d+\.json$/.test(f)))
  Object.assign(S, JSON.parse(fs.readFileSync(path.join(__dirname, 'summaries', f), 'utf8')));
const squash = (s) => (s || '').replace(/\s+/g, '').toLowerCase();
const problems = [];
for (const [file, s] of Object.entries(S)) {
  const m = norm.find((x) => x.file === file);
  const dir = path.join(__dirname, 'docs', file);
  const docs = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')) : [];
  const official = T.flat(m.title);
  const all = squash([official, ...docs].join(' '));
  for (const e of s.evidence || []) if (!all.includes(squash(e.quote))) problems.push([file, 'quote not found', e.quote.slice(0, 80)]);
  const text = `${s.description} ${s.whyItMayMatter || ''}`;
  // Numbers: compare digits only ("$5.65 million" is checked as 5.65 against 5,650,169 loosely below).
  for (const n of text.match(/\d[\d,]*(?:\.\d+)?/g) || []) {
    const bare = n.replace(/,/g, '');
    if (all.includes(n.replace(/,/g, ',').toLowerCase()) || all.includes(bare)) continue;
    // "$5.65 million" style: accept when the leading digits of a source figure match.
    const lead = bare.replace('.', '');
    if (/million|billion/.test(text.slice(text.indexOf(n), text.indexOf(n) + n.length + 10)) && all.replace(/[,.]/g, '').includes(lead)) continue;
    problems.push([file, 'number not in sources', n]);
  }
  if (/\b(was|were) (approved|denied|adopted|rejected|held|withdrawn)|\bvoted\b|\bvote of\b|motion (passed|failed)/i.test(s.description)) problems.push([file, 'states an outcome', s.description.slice(0, 100)]);
  if (s.description.length > 650) problems.push([file, 'long', s.description.length]);
}
console.log('summaries', Object.keys(S).length, 'problems', problems.length);
for (const p of problems) console.log(' ', p.join(' | '));
