// One markdown dossier per notable item, plus batch lists for the summary writers.
const fs = require('fs');
const path = require('path');
const T = require('./text.cjs');
const norm = require('./norm.json');
const notable = require('./notable.json');
const out = path.join(__dirname, 'summaries');
fs.mkdirSync(path.join(out, 'dossiers'), { recursive: true });
const fmtVotes = (v) => (v ? Object.entries(v.counts).map(([k, n]) => `${k} ${n}`).join(', ') + ' — ' + v.people.map(([p, x]) => `${p}: ${x}`).join('; ') : 'no roll call recorded');

for (const file of notable) {
  const m = norm.find((x) => x.file === file);
  const dir = path.join(__dirname, 'docs', file);
  const txts = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).map((f) => path.join(dir, f)) : [];
  const lines = [
    `# ${file}`,
    '',
    `Agenda section: ${m.type}`,
    `Requested by: ${m.requester || 'not stated'}`,
    `Sponsors (commissioners): ${T.sponsorsOf(m.title).join(', ') || 'none named'}`,
    `Final outcome (derived from the record): ${m.outcome || 'not recorded'} on ${m.outcomeDate || 'n/a'}`,
    '',
    '## Official description (the county’s agenda wording, clerk notes removed)',
    T.cleanOfficial(m.title),
    '',
    '## Clerk’s full title as it stands now (includes result notes)',
    T.flat(m.title),
    '',
    '## Meeting history',
  ];
  for (const a of m.appearances) {
    lines.push(`- ${a.date}: outcome at this meeting = ${a.outcome || 'no action recorded'}${a.outcomeSource ? ` (from ${a.outcomeSource})` : ''}`);
    for (const x of a.actions) lines.push(`  - Motion: ${T.flat(x.text) || x.name} | votes: ${fmtVotes(x.votes)}`);
  }
  lines.push('', '## Attached documents (extracted text files; read them)');
  for (const t of txts) lines.push(`- ${t}`);
  if (!txts.length) lines.push('- none available; use only the official description');
  fs.writeFileSync(path.join(out, 'dossiers', `${file}.md`), lines.join('\n'));
}
const B = 6;
const n = Math.ceil(notable.length / B);
for (let b = 0; b < B; b++) fs.writeFileSync(path.join(out, `batch-${b + 1}.json`), JSON.stringify(notable.slice(b * n, (b + 1) * n)));
console.log('dossiers', notable.length, 'batches of', n);
