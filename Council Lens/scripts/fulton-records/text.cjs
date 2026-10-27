// Deterministic text helpers: clean official titles, build short titles, sponsors, amounts,
// categories, addresses. Everything is derived from the county's own wording; nothing is invented.
const flat = (s) => (s || '').replace(/\s+/g, ' ').trim();
const COMMISSIONERS = ['Pitts', 'Ellis', 'Abdur-Rahman', 'Arrington', 'Barrett', 'Hall', 'Thorne', 'Ivory'];

// Clerk annotations that are not part of the item's description.
function cleanOfficial(title) {
  let t = flat(title);
  t = t.replace(/\s*(ITEM (REMOVED|HEARD|MOVED|ADDED|PULLED)\b.*)$/i, '');
  t = t.replace(/\s*PUBLIC HEARING CONDUCTED.*$/i, '');
  // Parenthesized all-caps notes: results, "HELD ON 9/16/26", "MOTION TO APPROVE FAILED ON ..."
  t = t.replace(/\s*\((?=[^)]*[A-Z]{3})[A-Z0-9 ,.'’/&:#-]+\)/g, (m) => (/[a-z]/.test(m) ? m : ''));
  return t.replace(/\s+([.,;])/g, '$1').trim();
}

function sponsorsOf(title) {
  const t = flat(title);
  const groups = [...t.matchAll(/\(([A-Z][A-Za-z'’-]+(?:\s*\/\s*[A-Z][A-Za-z'’-]+)*)\)/g)].map((m) => m[1].split(/\s*\/\s*/));
  for (const g of groups.reverse()) if (g.every((n) => COMMISSIONERS.includes(n))) return g;
  return [];
}
const stripSponsors = (t) =>
  t.replace(/\s*\((?:[A-Z][A-Za-z'’-]+)(?:\s*\/\s*[A-Z][A-Za-z'’-]+)*\)/g, (m) => {
    const names = m.replace(/[()\s]/g, '').split('/');
    return names.every((n) => COMMISSIONERS.includes(n)) ? '' : m;
  });

const money = (t) => [...t.matchAll(/\$\s?([\d,]+(?:\.\d{2})?)/g)].map((m) => Number(m[1].replace(/,/g, ''))).filter((n) => n > 0);
const fmtMoney = (n) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace(/\.?0+$/, '')} million` : `$${Math.round(n).toLocaleString('en-US')}`;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function trimTo(s, n = 110) {
  s = s.replace(/[\s,;:–-]+$/, '');
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const at = Math.max(cut.lastIndexOf(', '), cut.lastIndexOf('; '), cut.lastIndexOf(' – '), cut.lastIndexOf(' - '));
  return (at > 50 ? cut.slice(0, at) : cut.slice(0, cut.lastIndexOf(' '))).replace(/[\s,;:–-]+$/, '') + '…';
}
const SMALL = /^(of|and|the|for|on|in|to|a|an|at|by)$/;
const titleCase = (s) =>
  s
    .toLowerCase()
    .replace(/\b([a-z])([a-z'’]*)/g, (m, a, b, i) => (i > 0 && SMALL.test(a + b) ? a + b : a.toUpperCase() + b))
    .replace(/\b(Iii|Ii|Iv)\b/g, (m) => m.toUpperCase())
    .replace(/\b(Ems|Opeb|Marta|Cdbg|Hiv|Usa)\b/g, (m) => m.toUpperCase());

// "… - Department of X, 25ITB1259516C-JH, Hazardous Waste Disposal Services in the total amount … with Clean Harbors …"
const CODE = /(\d.*[A-Z]|[A-Z].*\d)/; // solicitation numbers mix letters and digits
const CODE_PART = /^(SWC|RFP|IFB|ITB|Sourcewell|City of Atlanta Contract|Contract\s*#|NASPO|OMNIA|GSA)/i;
const STOP =
  /,?\s+(?:in\s+(?:an?|the)\s+(?:total\s+)?(?:estimated\s+)?amount|with\s+(?:\(A\)|[A-Z])|at no (?:additional )?cost|for\s+the\s+(?:purchase|rental|period)|to provide|subject to)\b|;/;
function contractParts(t) {
  const dash = t.search(/\s[-–]\s/);
  if (dash < 0) return { service: null };
  let rest = t.slice(dash + 3);
  const stop = rest.search(STOP);
  if (stop > 0) rest = rest.slice(0, stop);
  const parts = rest.split(/,\s*/).map((p) => p.trim()).filter(Boolean);
  // Drop the department (first part) and any part that is a contract or solicitation number.
  const tail = parts.slice(1).filter((p) => !(CODE.test(p.split(' ')[0]) || CODE_PART.test(p) || /#\s?\w*\d/.test(p)));
  const service = tail
    .join(', ')
    .replace(/^the\s+/i, '')
    .replace(/^Progressive Design\/Build for /i, 'Design-build for ');
  return { service: service.length > 3 ? service : null };
}

function projectOf(t) {
  const m = t.match(/constructing (?:the )?(.+?)(?: Project)? (?:located )?at \d/i) || t.match(/for (?:the )?(.+? Project)\b/i);
  return m ? m[1].replace(/^the /i, '').trim() : null;
}
function placeOf(t) {
  const a = addressOf(t);
  return a ? a.split(',')[0] : null;
}

const PATTERNS = [
  [/^Request approval (?:to|of) renew (?:an )?existing contracts?\b/i, (t) => ['Contract renewal', contractParts(t).service]],
  [/^Request approval (?:to|of) extend (?:an )?existing\b/i, (t) => ['Contract extension', contractParts(t).service]],
  [/^Request approval (?:to|of) amend (?:an |the )?existing contracts?\b/i, (t) => ['Contract amendment', contractParts(t).service]],
  [/^Request approval to (?:increase|increase the) spending authority\b/i, (t) => ['More spending authority', contractParts(t).service]],
  [/^Request approval to utilize cooperative purchasing\b/i, (t) => ['Cooperative purchase', contractParts(t).service]],
  [/^Request approval of (?:a )?statewide contracts?\b/i, (t) => ['State-contract purchase', contractParts(t).service]],
  [/^Request approval of the lowest responsible bidders?\b/i, (t) => ['Contract award (lowest bidder)', contractParts(t).service]],
  [/^Request approval of (?:a )?recommended proposals?\b/i, (t) => ['Contract award', contractParts(t).service]],
  [/^Request approval of a change order\b/i, (t) => ['Change order', contractParts(t).service]],
  [/^Request approval to close out a contract\b/i, (t) => ['Contract close-out', contractParts(t).service]],
  [
    /^Request approval of an? (Sewer|Water|Water Vault|Sanitary Sewer|Stormwater) Easement Dedication\b/i,
    (t, m) => [`${cap(m[1].toLowerCase())} easement`, projectOf(t) || placeOf(t)],
  ],
  [/^Request approval of an Indemnification,? Maintenance,? and Land Use Agreement\b/i, (t) => ['Private improvements in a county easement', projectOf(t) || placeOf(t)]],
  [/^Request approval of an? Sanitary Sewer System Ownership/i, (t) => ['Sewer system ownership transfer', projectOf(t) || placeOf(t)]],
];

function shortTitle(official, type) {
  const t = stripSponsors(official);
  // Board appointments: "FULTON COUNTY ARTS COUNCIL This Council…"
  const board = t.match(/^((?:[A-Z][A-Z’'&().,-]*\s+){1,12}[A-Z][A-Z’'&().-]+)\s+(?=[A-Z][a-z]|\()/);
  if (board && board[1].length > 8 && (/Appointments/.test(type) || /BOARD|COUNCIL|COMMISSION|AUTHORITY|COMMITTEE|TRUST|TASK FORCE|AGENCY|CORPORATION|PANEL/.test(board[1])))
    return `Appointment: ${titleCase(board[1].replace(/\s*\(.*$/, ''))}`;
  for (const [re, fn] of PATTERNS) {
    const m = t.match(re);
    if (m) {
      const [kind, what] = fn(t, m);
      if (what) return trimTo(`${kind}: ${what}`, 120);
    }
  }
  let s = t
    .replace(/^Request (?:for )?(?:public hearing and )?approval (?:of |to |for )?/i, '')
    .replace(/^(?:a|an|the) Resolution /i, 'Resolution ')
    .replace(/^Resolution by the (?:Fulton County )?Board of Commissioners /i, 'Resolution ');
  s = s.split(/(?<=[a-z0-9)])\.\s+(?=[A-Z])/)[0];
  const cut = s.search(/;|,? (?:for the purpose(?: of)?|authorizing the Chairman|and for other purposes|pursuant to|subject to)\b/i);
  if (cut >= 35) s = s.slice(0, cut);
  return trimTo(cap(s), 140);
}

const CATS = [
  ['board_appointments', /Appointments|^Appointment:/i],
  ['elections', /Registration (?:and|&) Elections|\belections?\b|ballot|poll workers?|absentee/i],
  ['budget_and_taxes', /millage|\bbudget|soundings|\btax(es)?\b|rollback|TSPLOST|appropriat|fund balance|financing|\bbonds?\b|revenue|Finance Department|pension|OPEB/i],
  ['utilities', /hydrant|sewer|wastewater|stormwater|water (?:main|line|meter|treatment|valve|vault|easement|resources|system|supply)|Public Works|lift station|NPDES/i],
  ['public_safety', /Justice and Safety|Sheriff|jail|detention|police|\bfire\b|emergency|E-?911|\bcourts?\b|judicial|District Attorney|public defender|medical examiner|corrections|juvenile|Solicitor|probate|marshal/i],
  ['transportation', /transportation|transit|MARTA|GDOT|roadway|traffic signal|airport|aviation|sidewalk|intersection improvement|road improvements/i],
  ['housing_and_neighborhoods', /housing|homeless|CDBG|Community Development|\bHUD\b|affordable|tenant|eviction|blight|neighborhood/i],
  ['health', /health|behavioral|hospital|Grady|opioid|\bHIV\b|Ryan White|clinic|medical|substance|mental|kratom/i],
  ['human_services', /senior|aging|elder|veteran|workforce|youth|children|family|disabilit|\bfood\b|Community Services/i],
  ['parks_and_culture', /Arts and Libraries|library|libraries|\barts?\b|culture|museum|\bparks?\b|recreation|botanical/i],
  ['development_and_zoning', /zoning|land use|rezoning|Development Authority|economic development|redevelopment|tax allocation|\bTAD\b|data center|annex/i],
];
function categoryOf(text, type, short) {
  for (const [c, re] of CATS) if (re.test(c === 'board_appointments' ? `${type} ${short}` : `${type} ${text}`)) return c;
  return 'government';
}

// Street addresses in the county's wording: "at 5195 Mason Road, Union City, Georgia 30349".
const ADDRESS =
  /\b(\d{2,6}[A-Z]?\s+(?:[A-Z][\w.'’-]*\s+){0,6}(?:Road|Rd|Street|St|Avenue|Ave|Drive|Dr|Boulevard|Blvd|Parkway|Pkwy|Way|Lane|Ln|Court|Ct|Circle|Cir|Place|Pl|Highway|Hwy|Trail|Terrace|Pike|Run|Crossing|Point|Bend|Ridge)\.?(?:,?\s+(?:NW|NE|SW|SE|N|S|E|W))?(?:,?\s*(?:Suite|Ste\.?|Unit|Bldg\.?)\s*[\w-]+)?,\s*[A-Z][A-Za-z .]+?,\s*(?:Georgia|GA)\.?,?\s*\d{5})/;
function addressOf(t) {
  const m = flat(t).match(ADDRESS);
  return m ? m[1].replace(/\s+/g, ' ') : null;
}

module.exports = { flat, cleanOfficial, sponsorsOf, stripSponsors, money, fmtMoney, shortTitle, categoryOf, addressOf, trimTo, cap };
