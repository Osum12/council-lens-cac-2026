// Builds data/meetings.json, data/issues.json and data/documents.json for the app from the
// normalized Legistar records, the reviewed titles, the PDF-backed summaries, and the earlier
// records already in the app (kept, with IDs unchanged). Usage: node build.cjs <appDataDir>
const fs = require('fs');
const path = require('path');
const T = require('./text.cjs');
const { keep } = require('./filter.cjs');
const norm = require('./norm.json');
const RAW = path.join(__dirname, 'raw');
// argv[2]: the records the app had before this import (kept, with IDs unchanged).
const OUT = process.argv[2];
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const VERIFIED = '2026-10-24';
const LATEST_MEETING = '2026-10-21';
const CLIENT_GUID = '197058BF-F352-4423-BE44-04DFABBD8188'; // Fulton's Legistar site id, as in every meeting link the API returns

const old = { issues: read(path.join(OUT, 'issues.json')), meetings: read(path.join(OUT, 'meetings.json')), documents: read(path.join(OUT, 'documents.json')) };
const oldIssueByFile = new Map(old.issues.map((i) => [i.id.match(/^issue-(\d\d-\d{4})/)[1], i]));
const oldDocByUrl = new Map(old.documents.map((d) => [d.url, d]));
const titles = read(path.join(__dirname, 'titles', 'all.json'));
const summaries = {};
for (const f of fs.readdirSync(path.join(__dirname, 'summaries')).filter((f) => /^out-\d+\.json$/.test(f)))
  Object.assign(summaries, read(path.join(__dirname, 'summaries', f)));
const geocodes = fs.existsSync(path.join(__dirname, 'geocode.json')) ? read(path.join(__dirname, 'geocode.json')) : {};

// Hand corrections found in review (source wording kept exact; categories the text supports).
const TITLE_FIX = { '25-0630': (t) => t.replace(/^911\b/, '9-1-1') };
const CATEGORY_FIX = { '25-0079': 'government' }; // the text doesn't say which consent decree

// ---------- Meetings ----------
const events = read(path.join(RAW, 'events', 'list-2025-01-01.json')).filter((e) => e.EventBodyId === 138);
const kindOf = (e) => {
  const k = ((e.EventAgendaFile || '').match(/(First_Regular|Second_Regular|Special_Called)_Meeting/) || [])[1];
  return k ? `${k.replace(/_/g, ' ')} Meeting` : 'Meeting';
};
const longDate = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const time24 = (t) => {
  const m = (t || '').match(/(\d+):(\d\d)\s*([AP]M)/i);
  if (!m) return null;
  const h = (Number(m[1]) % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0);
  return `${String(h).padStart(2, '0')}:${m[2]}`;
};
const meetingIdOf = new Map();
const byDate = {};
for (const e of events) (byDate[e.EventDate.slice(0, 10)] ||= []).push(e);
for (const [date, list] of Object.entries(byDate)) {
  list.sort((a, b) => (time24(a.EventTime) || '').localeCompare(time24(b.EventTime) || '') || a.EventId - b.EventId);
  list.forEach((e, i) => {
    const evening = i > 0 && time24(e.EventTime) >= '17:00';
    meetingIdOf.set(e.EventId, `meeting-${date}-boc${i === 0 ? '' : evening && !list.slice(1, i).some((x) => time24(x.EventTime) >= '17:00') ? '-evening' : `-${i + 1}`}`);
  });
}
const oldMeeting = new Map(old.meetings.map((m) => [m.id, m]));

// ---------- Issues ----------
const fmtDate = (iso) => longDate(iso);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
function voteText(v) {
  if (!v) return null;
  const c = v.counts;
  const y = c.Yea || 0, n = c.Nay || 0;
  const extra = [];
  if (c.Abstain) extra.push(`${c.Abstain} abstaining`);
  if (c.Absent) extra.push(`${c.Absent} absent`);
  if (c['Did Not Vote']) extra.push(`${c['Did Not Vote']} not voting`);
  if (c.Recused) extra.push(`${c.Recused} recused`);
  return `${y}–${n}${extra.length ? `, with ${extra.join(' and ')}` : ''}`;
}
// "4–1, with 2 not voting" mid-sentence needs a closing comma: "voted 4–1, with 2 not voting, to deny it".
const withPause = (t) => (t.includes(', with ') ? `${t},` : t);
// "a 5–0 vote, with 1 absent" rather than "a 5–0, with 1 absent vote".
const voteWithRest = (t) => { const [tally, rest] = t.split(', with '); return rest ? `${tally} vote, with ${rest}` : `${tally} vote`; };
// "3 yes, 0 no, 2 absent, 1 not voting": spelled out where a short tally could look like a typo.
function tallyWords(v) {
  if (!v) return null;
  const c = v.counts;
  const parts = [`${c.Yea || 0} yes`, `${c.Nay || 0} no`];
  if (c.Abstain) parts.push(`${c.Abstain} abstaining`);
  if (c.Absent) parts.push(`${c.Absent} absent`);
  if (c['Did Not Vote']) parts.push(`${c['Did Not Vote']} not voting`);
  if (c.Recused) parts.push(`${c.Recused} recused`);
  return parts.join(', ');
}
const motionText = (x) => T.flat(x.text);
function decidingMotion(a, re, passed) {
  return [...a.actions].reverse().find((x) => {
    const t = motionText(x);
    if (/NO VOTE TAKEN/i.test(t) || /(?:approve adding|to add) item #/i.test(t)) return false;
    const p = /motion (passed|carried)/i.test(t) ? true : /motion failed/i.test(t) ? false : x.passed === 1;
    return p === passed && re.test(t);
  });
}
const requestedBy = (title) => {
  const m = T.flat(title).match(/AS REQUESTED BY (COMMISSIONER|CHAIRMAN|VICE[- ]CHAIR(?:MAN)?)\s+([A-Z][A-Z'’-]+)/i);
  return m ? `${m[1].toLowerCase().replace(/^./, (c) => c.toUpperCase()).replace('Vice chair', 'Vice Chair')} ${m[2].charAt(0)}${m[2].slice(1).toLowerCase()}` : null;
};
function resultSentence(m, a) {
  const d = fmtDate(a.date);
  const consent = a.outcomeSource === 'consent-adoption' || /UPON ADOPTION OF THE CONSENT AGENDA/.test(a.marker || '');
  switch (a.outcome) {
    case 'approved': {
      if (a.outcomeSource === 'motion') {
        const x = decidingMotion(a, /\bto (approve|adopt|ratify|nominate|appoint|reappoint|elect)/i, true);
        const v = x && voteText(x.votes);
        // Passed in a changed form: an amended or substitute motion, or the clerk's "AS AMENDED".
        const changed = (x && (/as amended|substitute motion|with a friendly amendment|amending/i.test(motionText(x)))) || /AS AMENDED/.test(a.marker || '');
        const head = changed ? `Approved with changes on ${d}` : `Approved ${d}`;
        const tail = changed ? ' The approved version differs from the original proposal; the item record has the details.' : '';
        return `${head}${v ? `, ${v}` : ''}.${tail}`;
      }
      return consent ? `Approved ${d} as part of the consent agenda.` : `Approved ${d}, according to the clerk’s notes on the item.`;
    }
    case 'failed': {
      const x = decidingMotion(a, /\bto (approve|adopt|ratify|nominate|appoint)/i, false);
      if (x && /lack of a second/i.test(motionText(x))) return `The motion to approve died for lack of a second on ${d}.`;
      const v = x && tallyWords(x.votes);
      return `The motion to approve failed on ${d}${v ? ` (${v})` : ''}.`;
    }
    case 'denied': {
      const x = decidingMotion(a, /\bto (deny|reject)/i, true);
      const v = x && voteText(x.votes);
      return v ? `On ${d} the board voted ${withPause(v)} to deny it.` : `Denied on ${d}.`;
    }
    case 'held': {
      const x = decidingMotion(a, /\bto (hold|table|defer)/i, true);
      const v = x && voteText(x.votes);
      return `Held on ${d}${v ? ` by a ${voteWithRest(v)}` : ''}. It had not come back for a vote as of the board’s ${fmtDate(LATEST_MEETING)} meeting.`;
    }
    case 'filed': {
      const x = decidingMotion(a, /\bto file/i, true);
      const v = x && voteText(x.votes);
      return v ? `On ${d} the board voted ${withPause(v)} to file this item, which closes it without approving it.` : `The board voted on ${d} to file this item, which closes it without approving it.`;
    }
    case 'removed': {
      const who = requestedBy(a.title);
      return `Removed from the ${d} agenda${who ? ` at the request of ${who}` : ''}. It had not come back for a vote as of the board’s ${fmtDate(LATEST_MEETING)} meeting.`;
    }
    case 'hearing':
      return `Public hearing held on ${d}.`;
    default:
      return null;
  }
}
function historySentence(m, last) {
  const earlier = m.appearances.filter((a) => a !== last && a.date < last.date && a.outcome && ['held', 'failed', 'removed', 'denied'].includes(a.outcome));
  if (!earlier.length) return null;
  const words = { held: 'held', failed: 'a motion to approve failed', removed: 'removed from the agenda', denied: 'denied' };
  return `Earlier: ${earlier.map((a) => `${words[a.outcome]} on ${fmtDate(a.date)}`).join('; ')}.`;
}
const STATUS = { approved: 'approved', failed: 'denied', denied: 'denied', held: 'under_consideration', filed: 'withdrawn', removed: 'withdrawn', hearing: 'completed' };

// Identical requests filed more than once (e.g. re-filed for a later meeting) point at each other.
// Records the app already had are always kept, even if the filter would drop them.
for (const m of norm) if (oldIssueByFile.has(m.file) && !keep.includes(m)) keep.push(m);
const officialOf = new Map(keep.map((m) => [m.file, T.cleanOfficial(m.title)]));
const sameAs = new Map();
for (const m of keep) {
  const twins = keep.filter((x) => x !== m && officialOf.get(x.file) === officialOf.get(m.file));
  if (twins.length) sameAs.set(m.file, twins);
}

const issueIdOf = (m) => {
  if (oldIssueByFile.has(m.file)) return oldIssueByFile.get(m.file).id;
  return /^\d\d-\d{4}$/.test(m.file) ? `issue-${m.file}` : `issue-m${m.matterId}`;
};
// The public site's item links, read from each meeting's official page (its IDs differ from the API's).
const siteLinks = read(path.join(__dirname, 'itemlinks.json')).byFile;
const legislationUrl = (m) => {
  const u = siteLinks[m.file]?.[0];
  if (!u) throw new Error(`no official item link for ${m.file}`);
  return u;
};
// Links built from API ids open an "Invalid parameters!" page on the public site: translate them
// (API MatterId -> file number -> the site's own link) and fail loudly if one can't be translated.
const fileOfMatter = new Map(norm.map((x) => [x.matterId, x.file]));
const fixLink = (u) => {
  const m = u.match(/LegislationDetail\.aspx\?ID=(\d{5})&GUID=[^&]+$/);
  if (!m) return u;
  const file = fileOfMatter.get(Number(m[1])) || apiFile(Number(m[1]));
  const site = siteLinks[file]?.[0];
  if (!site) throw new Error(`cannot translate ${u}`);
  return site;
};
// Matters outside 2025-26 meetings (not in norm) are looked up in the cached API matter files.
const apiFile = (id) => {
  const p = path.join(RAW, 'matters', `${id}.json`);
  return fs.existsSync(p) ? read(p).MatterFile : null;
};

const issues = [];
const documents = [];
const meetingIssues = new Map(); // meetingId -> Set(issueId)
const attachmentsByMatter = new Map();
for (const f of fs.readdirSync(path.join(RAW, 'items')))
  for (const it of read(path.join(RAW, 'items', f)))
    if (it.EventItemMatterId && it.EventItemMatterAttachments?.length) attachmentsByMatter.set(it.EventItemMatterId, it.EventItemMatterAttachments.filter((x) => x.MatterAttachmentShowOnInternetPage));

// Order matters: "Contractor's Performance Report" is a report, not an agreement.
const DOC_TYPES = [
  [/resolution/i, 'resolution'],
  [/ordinance/i, 'ordinance'],
  [/presentation|\bppt\b|slides/i, 'presentation'],
  [/fact sheet|factsheet|summary sheet/i, 'fact_sheet'],
  [/report|study|analysis|tabulation|evaluation|scorecard|performance|\bCPR\b/i, 'report'],
  [/agreement|\bcontract\b|amendment|\bMOU\b|\bMOA\b|\bIGA\b|\blease\b|easement|\bdeed\b|\bplat\b/i, 'agreement'],
  [/\bmap\b|site plan|survey/i, 'map'],
  [/letter|memo|correspondence/i, 'letter'],
  [/budget|financial|fiscal|cost/i, 'financial_document'],
];
const docTypeOf = (name) => DOC_TYPES.find(([re]) => re.test(name))?.[1] || 'supporting_document';

let pinned = 0;
for (const m of keep) {
  const id = issueIdOf(m);
  const prior = oldIssueByFile.get(m.file);
  const last = [...m.appearances].reverse().find((a) => a.outcome) || m.appearances.at(-1);
  const meetingIds = [...new Set(m.appearances.map((a) => meetingIdOf.get(a.eventId)))];
  for (const mid of meetingIds) (meetingIssues.get(mid) || meetingIssues.set(mid, new Set()).get(mid)).add(id);
  let status = STATUS[last.outcome] || 'unknown';
  const parts = [];
  let result = last.outcome ? resultSentence(m, last) : null;
  if (!last.outcome) {
    const addFailed = last.actions.find((x) => /(?:approve adding|to add) item #/i.test(motionText(x)) && /lack of a second|motion failed/i.test(motionText(x)));
    if (addFailed) {
      status = 'withdrawn';
      result = `A motion to add it to the ${fmtDate(last.date)} agenda failed${/lack of a second/i.test(motionText(addFailed)) ? ' for lack of a second' : ''}, so the board did not take it up.`;
    } else result = `It was on the ${fmtDate(last.date)} agenda, but the county’s record does not show a result.`;
  }
  const hist = historySentence(m, last);
  const twins = sameAs.get(m.file);
  const twinText = twins ? `The same request also appears as item${twins.length > 1 ? 's' : ''} ${twins.map((x) => `${x.file} (${fmtDate(x.appearances.at(-1).date)})`).join(' and ')}.` : null;
  const draft = last.date === LATEST_MEETING ? `Results from the ${fmtDate(LATEST_MEETING)} meeting come from the clerk’s draft record, which the board is scheduled to ratify on November 4, 2026.` : null;
  const official = officialOf.get(m.file);
  const s = summaries[m.file];
  if (s) parts.push(s.description.trim());
  parts.push([hist, result, twinText, draft].filter(Boolean).join(' '));
  if (!s) parts.push(`The agenda describes it as: “${T.stripSponsors(official)}”`);

  // Earlier records outside the filtered set have no generated title; theirs is kept below.
  const t = titles[m.file] || { title: oldIssueByFile.get(m.file)?.title, category: oldIssueByFile.get(m.file)?.category };
  const addr = T.addressOf(official);
  const g = addr && geocodes[addr];
  let location = null;
  if (g && g.lat) {
    location = { label: addr.split(',')[0], address: addr, latitude: g.lat, longitude: g.lon, locationType: 'approximate', verified: false };
    pinned++;
  }
  const docIds = [];
  for (const att of attachmentsByMatter.get(m.matterId) || []) {
    const url = att.MatterAttachmentHyperlink;
    const priorDoc = oldDocByUrl.get(url);
    const docId = priorDoc ? priorDoc.id : `document-att-${att.MatterAttachmentId}`;
    docIds.push(docId);
    documents.push({
      id: docId,
      title: priorDoc ? priorDoc.title : T.flat(att.MatterAttachmentName).replace(/\.(pdf|docx?|xlsx?|pptx?)$/i, ''),
      documentType: priorDoc ? priorDoc.documentType : docTypeOf(att.MatterAttachmentName),
      meetingId: meetingIdOf.get(last.eventId),
      issueIds: [id],
      publishedDate: null,
      url,
      description: priorDoc ? priorDoc.description : `Attached to agenda item ${m.file}: ${TITLE_FIX[m.file] ? TITLE_FIX[m.file](t.title) : t.title}.`,
      sourceName: 'Fulton County Legistar',
      dataMode: 'curated',
      mockOnly: false,
    });
  }
  const record = {
    id,
    title: TITLE_FIX[m.file] ? TITLE_FIX[m.file](t.title) : t.title,
    category: CATEGORY_FIX[m.file] || t.category,
    summary: parts.join('\n\n'),
    status,
    statusAsOf: last.date,
    meetingIds,
    documentIds: docIds,
    location,
    whyItMayMatter: s?.whyItMayMatter || null,
    sourceUrls: [legislationUrl(m)],
    dataMode: 'curated',
    mockOnly: false,
    featured: false,
  };
  if (prior) {
    // Earlier records stay as written unless a later meeting shows a different result
    // (their statuses were set by reading the documents, e.g. a resolution that only starts a process).
    const changed = prior.status !== record.status && record.statusAsOf > prior.statusAsOf;
    if (!changed) record.status = prior.status;
    Object.assign(record, {
      title: prior.title,
      category: prior.category,
      summary: changed ? `${prior.summary}\n\n${[result, draft].filter(Boolean).join(' ')}` : prior.summary,
      location: prior.location,
      whyItMayMatter: prior.whyItMayMatter,
      featured: prior.featured,
      sourceUrls: [...new Set([legislationUrl(m), ...prior.sourceUrls.map(fixLink)])],
      statusAsOf: changed ? record.statusAsOf : prior.statusAsOf,
    });
    if (changed) console.log('STATUS CHANGED', id, prior.status, '->', record.status);
    if (!record.location && prior.location) record.location = prior.location;
  }
  issues.push(record);
}

// ---------- Meetings + agendas ----------
const meetings = [];
for (const e of events) {
  const id = meetingIdOf.get(e.EventId);
  const date = e.EventDate.slice(0, 10);
  const prev = oldMeeting.get(id);
  const ids = [...(meetingIssues.get(id) || [])];
  const decided = keep.flatMap((m) => m.appearances.filter((a) => a.eventId === e.EventId && a.outcome).map((a) => a.outcome));
  const cnt = (o) => decided.filter((x) => x === o).length;
  const bits = [
    cnt('approved') && `${cnt('approved')} approved`,
    cnt('failed') + cnt('denied') && `${cnt('failed') + cnt('denied')} failed or denied`,
    cnt('held') && `${cnt('held')} held`,
    cnt('removed') && `${cnt('removed')} removed from the agenda`,
    cnt('filed') && `${cnt('filed')} filed`,
    cnt('hearing') && plural(cnt('hearing'), 'public hearing'),
  ].filter(Boolean);
  const countLine = decided.length ? `Of the ${plural(ids.length, 'item')} listed here, the record shows ${bits.join(', ')}.` : `${plural(ids.length, 'item')} listed here.`;
  const draft = date === LATEST_MEETING ? ' Results are from the clerk’s draft record, scheduled for ratification on November 4, 2026.' : '';
  const agendaId = prev?.agendaDocumentIds?.[0] || `document-${id.replace(/^meeting-/, '')}-agenda`;
  if (e.EventAgendaFile) {
    const priorDoc = oldDocByUrl.get(e.EventAgendaFile);
    documents.push({
      id: agendaId,
      title: `Board of Commissioners Agenda, ${longDate(date)}${id.endsWith('-evening') ? ' (evening)' : ''}`,
      documentType: 'agenda',
      meetingId: id,
      issueIds: ids,
      publishedDate: priorDoc?.publishedDate || (e.EventAgendaLastPublishedUTC ? e.EventAgendaLastPublishedUTC.slice(0, 10) : null),
      url: e.EventAgendaFile,
      description: 'Official agenda as published before the meeting. Results of each item are in the item records on the county’s Legistar site.',
      sourceName: 'Fulton County Legistar',
      dataMode: 'curated',
      mockOnly: false,
    });
  }
  meetings.push({
    id,
    title: prev?.title || `Board of Commissioners ${kindOf(e)}, ${longDate(date)}`,
    meetingType: 'board_of_commissioners',
    date,
    startTime: time24(e.EventTime),
    status: 'completed',
    summary: prev?.summary ? `${prev.summary} ${countLine}${draft}` : `${kindOf(e)}${e.EventLocation ? ` in the ${e.EventLocation}` : ''}. ${countLine}${draft}`,
    officialPageUrl: e.EventInSiteURL || null,
    recordingUrl: e.EventMedia ? `https://fulton.legistar.com/Video.aspx?Mode=Granicus&ID1=${e.EventMedia}&G=${CLIENT_GUID}&Mode2=Video` : null,
    agendaDocumentIds: e.EventAgendaFile ? [agendaId] : [],
    issueIds: ids,
    dataMode: 'curated',
    mockOnly: false,
    lastVerifiedAt: VERIFIED,
  });
}

// Existing records that aren't in the rebuilt set are reported, never silently dropped.
for (const i of old.issues) if (!issues.some((x) => x.id === i.id)) console.log('OLD ISSUE NOT REBUILT', i.id);
for (const d of old.documents) if (!documents.some((x) => x.id === d.id)) console.log('OLD DOCUMENT NOT REBUILT', d.id);
for (const mm of old.meetings) if (!meetings.some((x) => x.id === mm.id)) console.log('OLD MEETING NOT REBUILT', mm.id);

meetings.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
issues.sort((a, b) => (b.statusAsOf || '').localeCompare(a.statusAsOf || '') || a.id.localeCompare(b.id));
const dedupDocs = [...new Map(documents.map((d) => [d.id, d])).values()];
fs.writeFileSync(path.join(__dirname, 'out-meetings.json'), JSON.stringify(meetings, null, 2) + '\n');
fs.writeFileSync(path.join(__dirname, 'out-issues.json'), JSON.stringify(issues, null, 2) + '\n');
fs.writeFileSync(path.join(__dirname, 'out-documents.json'), JSON.stringify(dedupDocs, null, 2) + '\n');
console.log({ meetings: meetings.length, issues: issues.length, documents: dedupDocs.length, withSummary: Object.keys(summaries).length, pinned });
