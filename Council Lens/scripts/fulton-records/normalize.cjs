// One record per Legistar matter (BOC, 2025-01-01 on): every meeting appearance, its recorded
// action(s), the clerk's result marker in the title, roll-call votes, and the derived status.
// Writes norm.json and prints cross-check statistics.
const fs = require('fs');
const path = require('path');
const RAW = path.join(__dirname, 'raw');
const read = (p) => JSON.parse(fs.readFileSync(path.join(RAW, p), 'utf8'));
const exists = (p) => fs.existsSync(path.join(RAW, p));

const events = read('events/list-2025-01-01.json').filter((e) => e.EventBodyId === 138);
const T_flat = (s) => (s || '').replace(/\s+/g, ' ');
const day = (d) => d.slice(0, 10);

// Result markers the clerk appends to item titles, mapped to an outcome.
const MARKERS = [
  [/APPROVED UPON ADOPTION OF THE CONSENT AGENDA/, 'approved'],
  [/ADOPTED UPON ADOPTION OF THE CONSENT AGENDA/, 'approved'],
  [/APPROVED AS AMENDED|ADOPTED AS AMENDED|AMENDED AND APPROVED/, 'approved'],
  [/^APPROVED$|^ADOPTED$|^ADOPTED AS PRESENTED$|^RATIFIED$|^APPOINTED|^REAPPOINTED|^CONFIRMED|^CONDUCTED\/APPROVED$|^PRESENTED\/APPROVED$/, 'approved'],
  [/^CONDUCTED$/, 'hearing'],
  [/^PRESENTED\/DISCUSSED$/, 'discussed'],
  [/^SPREAD ON THE MINUTES/, 'spread'],
  [/^FAILED|MOTION .*FAILED$/, 'failed'],
  [/^DENIED$|^REJECTED$/, 'denied'],
  [/^HELD$|^TABLED$|^DEFERRED/, 'held'],
  [/^REMOVED|^WITHDRAWN/, 'removed'],
  [/^FILED$|^RECEIVED AND FILED/, 'filed'],
  [/^DISCUSSED$|^PRESENTED$|^HEARD$/, 'discussed'],
  [/PUBLIC HEARING CONDUCTED/, 'hearing'],
];
function markerOf(title) {
  const t = (title || '').replace(/\s+/g, ' ');
  const groups = [...t.matchAll(/\(([A-Z][A-Z0-9 ,.'’/&-]{2,})\)/g)].map((m) => m[1].trim());
  const hits = groups.map((g) => ({ g, o: MARKERS.find(([re]) => re.test(g))?.[1] })).filter((x) => x.o);
  if (/PUBLIC HEARING CONDUCTED/.test(t)) hits.push({ g: 'PUBLIC HEARING CONDUCTED', o: 'hearing' });
  return { last: hits.at(-1) || null, all: groups };
}
// What a motion asked for and whether it carried, read from the clerk's motion text first
// ("to hold. The motion passed..."), since the pass/fail flag and action name are sometimes wrong.
function motionOf(a) {
  const t = (a.text || '').replace(/\s+/g, ' ');
  if (/NO VOTE TAKEN/i.test(t)) return null;
  const verbM = t.match(
    /\bto (approve|adopt|ratify|deny|reject|hold|table|file|amend|call the question|reconsider|enter|opt|accept|remove|defer|withdraw|add|oppose|support|request|take|send|direct|move|suspend|nominate|appoint|reappoint|elect)\b/i,
  );
  // A motion whose wording names no deciding action ("to add item ... to the agenda") doesn't decide the item.
  let verb = (verbM ? verbM[1] : t ? 'other' : a.name || '').toLowerCase();
  if (/(?:approve adding|to add) item #/i.test(t)) verb = 'add';
  const res = /motion (passed|carried)/i.test(t) ? true : /motion failed/i.test(t) ? false : a.passed === 1 ? true : a.passed === 0 ? false : null;
  if (res === null) return null;
  const textSaysPassed = /motion (passed|carried)/i.test(t) ? true : /motion failed/i.test(t) ? false : null;
  return { verb, passed: res, flagConflict: textSaysPassed !== null && a.passed !== null && (a.passed === 1) !== textSaysPassed };
}
// A meeting's outcome from all of its motions: a passed approval wins over failed substitutes or amendments.
function meetingOutcome(actions) {
  const ms = actions.map(motionOf).filter(Boolean);
  const passed = (re) => ms.some((m) => m.passed && re.test(m.verb));
  if (passed(/^(approve|adopt|ratify|nominate|appoint|reappoint|elect)/)) return 'approved';
  if (passed(/^(deny|reject)/)) return 'denied';
  if (passed(/^(hold|table|defer)/)) return 'held';
  if (passed(/^(file)/)) return 'filed';
  if (passed(/^(withdraw|remove)/)) return 'removed';
  if (ms.some((m) => !m.passed && /^(approve|adopt|ratify)/.test(m.verb))) return 'failed';
  return null;
}
function actionOutcome(name, passed) {
  if (!name || passed === null || passed === undefined) return null;
  const n = name.toLowerCase();
  if (/^(approve|adopt|ratify)( as amended)?$/.test(n)) return passed ? 'approved' : 'failed';
  if (/^(deny|reject)$/.test(n)) return passed ? 'denied' : null;
  if (/^(hold|table)$/.test(n)) return passed ? 'held' : null;
  if (/^file$/.test(n)) return passed ? 'filed' : null;
  return null; // call the question, reconsider, executive session, decorum...
}
function tallyOf(votes) {
  if (!votes || !votes.length) return null;
  const c = {};
  for (const v of votes) c[v.VoteValueName] = (c[v.VoteValueName] || 0) + 1;
  return { counts: c, people: votes.map((v) => [v.VotePersonName, v.VoteValueName]) };
}

// Meetings whose consent agenda was adopted by a passed motion.
const consentAdopted = new Set();
for (const e of events) {
  if (!exists(`items/${e.EventId}.json`)) continue;
  for (const it of read(`items/${e.EventId}.json`)) {
    if (!/^Adoption of the Consent Agenda/i.test((it.EventItemTitle || '').trim())) continue;
    const m = motionOf({ text: it.EventItemActionText, name: it.EventItemActionName, passed: it.EventItemPassedFlag });
    if (m && m.passed && /^(adopt|approve)/.test(m.verb)) consentAdopted.add(e.EventId);
  }
}

const matters = new Map();
const disagreements = [];
const flagConflicts = [];
for (const e of events) {
  if (!exists(`items/${e.EventId}.json`)) continue;
  const items = read(`items/${e.EventId}.json`).filter((i) => i.EventItemMatterId);
  const byMatter = new Map();
  for (const it of items) {
    if (!byMatter.has(it.EventItemMatterId)) byMatter.set(it.EventItemMatterId, []);
    byMatter.get(it.EventItemMatterId).push(it);
  }
  for (const [mid, rows] of byMatter) {
    const titled = rows.find((r) => r.EventItemAgendaSequence !== null) || rows[0];
    const actions = rows
      .filter((r) => r.EventItemActionName)
      .sort((a, b) => (a.EventItemMinutesSequence ?? 1e9) - (b.EventItemMinutesSequence ?? 1e9) || a.EventItemId - b.EventItemId)
      .map((r) => ({
        itemId: r.EventItemId,
        name: r.EventItemActionName,
        passed: r.EventItemPassedFlag,
        text: r.EventItemActionText,
        mover: r.EventItemMover,
        seconder: r.EventItemSeconder,
        votes: exists(`votes/${r.EventItemId}.json`) ? tallyOf(read(`votes/${r.EventItemId}.json`)) : null,
      }));
    const decisive = actions.filter((a) => motionOf(a));
    const fromAction = meetingOutcome(actions);
    for (const a of actions) { const m = motionOf(a); if (m?.flagConflict) flagConflicts.push(titled.EventItemMatterFile + ' ' + day(e.EventDate) + ' ' + a.itemId); }
    const mk = markerOf(titled.EventItemTitle);
    const fromMarker = mk.last?.o || null;
    const appearance = {
      eventId: e.EventId,
      date: day(e.EventDate),
      title: titled.EventItemTitle,
      consent: /^Consent/.test(titled.EventItemMatterType || ''),
      actions,
      decisive: decisive.at(-1) || null,
      marker: mk.last?.g || null,
      markers: mk.all,
      motionOutcome: fromAction,
      outcome: fromAction,
      outcomeSource: fromAction ? 'motion' : null,
    };
    if (!matters.has(mid)) matters.set(mid, { matterId: mid, appearances: [] });
    matters.get(mid).appearances.push(appearance);
  }
}

const out = [];
for (const [mid, m] of matters) {
  const mt = read(`matters/${mid}.json`);
  m.appearances.sort((a, b) => a.date.localeCompare(b.date));
  // The title marker is the clerk's final result; it describes the latest appearance only.
  const tail = m.appearances.at(-1);
  // "ITEM WAS REMOVED AS REQUESTED BY COMMISSIONER X" with no deciding vote: the sponsor pulled it.
  // (Being moved off the consent agenda for separate consideration is not a removal.)
  if (!tail.outcome && /ITEM (?:WAS )?(?:REMOVED|WITHDRAWN)(?! FROM THE CONSENT AGENDA)[^.]*AS REQUESTED BY/i.test(T_flat(tail.title))) {
    tail.outcome = 'removed';
    tail.outcomeSource = 'clerk-marker';
  }
  if (!tail.outcome && tail.marker) {
    const o = markerOf(tail.title).last?.o;
    if (o) { tail.outcome = o; tail.outcomeSource = 'clerk-marker'; }
  }
  // A consent item with no note of its own, on a consent agenda the board adopted, was enacted
  // by that one motion ("All matters listed on the Consent Agenda ... will be enacted by one motion").
  if (!tail.outcome && /^Consent -/.test(mt.MatterTypeName) && !tail.actions.length && consentAdopted.has(tail.eventId)) {
    tail.outcome = 'approved';
    tail.outcomeSource = 'consent-adoption';
  }
  const last = [...m.appearances].reverse().find((a) => a.outcome) || null;
  const finalMarker = markerOf(tail.title).last?.o || null;
  if (last && finalMarker && last.outcomeSource === 'motion' && finalMarker !== last.outcome)
    disagreements.push({ file: mt.MatterFile, date: last.date, motion: last.outcome, marker: markerOf(tail.title).last.g });
  out.push({
    matterId: mid,
    guid: mt.MatterGuid,
    file: mt.MatterFile,
    title: mt.MatterTitle,
    type: mt.MatterTypeName,
    matterStatus: mt.MatterStatusName,
    requester: mt.MatterRequester,
    introDate: mt.MatterIntroDate ? day(mt.MatterIntroDate) : null,
    passedDate: mt.MatterPassedDate ? day(mt.MatterPassedDate) : null,
    enactment: mt.MatterEnactmentNumber,
    appearances: m.appearances,
    outcome: last?.outcome || null,
    outcomeDate: last?.date || null,
  });
}
fs.writeFileSync(path.join(__dirname, 'norm.json'), JSON.stringify(out));

const c = (arr, f) => Object.entries(arr.reduce((o, x) => ((o[f(x)] = (o[f(x)] || 0) + 1), o), {})).sort((a, b) => b[1] - a[1]);
console.log('matters', out.length);
console.log('outcome', c(out, (x) => x.outcome));
console.log('outcome source (last)', c(out, (x) => [...x.appearances].reverse().find((a) => a.outcome)?.outcomeSource || 'none'));
console.log('final disagreements', disagreements.length, disagreements);
console.log('flag vs text conflicts', flagConflicts.length, flagConflicts.slice(0, 20));
console.log('legistar status vs outcome', c(out, (x) => x.matterStatus + ' -> ' + x.outcome));
const unk = out.filter((x) => !x.outcome);
console.log('no outcome', unk.length, c(unk, (x) => x.type));
console.log('unmatched markers', c(out.flatMap((x) => x.appearances.flatMap((a) => a.markers)).filter((g) => /^[A-Z ]+$/.test(g) && !MARKERS.some(([re]) => re.test(g))), (g) => g).slice(0, 40));
