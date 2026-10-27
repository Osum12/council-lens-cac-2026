// Shared civic data service. Every page reads Meeting/Issue/Document records
// through these functions; no page imports the JSON fixtures directly.
// Current working example: one Fulton County dataset in /data. Another county's source
// adapter can supply these shared record formats, with matching local app settings.
// Several counties in one deployment require county-specific loading and cache isolation;
// route context and coverage settings alone do not select a dataset.

import type { CivicDocument, Issue, Meeting } from '../types/civic';

export type Dataset = {
  meetings: Meeting[];
  issues: Issue[];
  documents: CivicDocument[];
};

export type DatasetInfo = {
  totalRecords: number;
  mockRecords: number;
  curatedRecords: number;
  /** True when at least one loaded record is mock/sample data. */
  containsMock: boolean;
};

export type MeetingFilters = { status?: string; meetingType?: string };
export type IssueFilters = { status?: string; category?: string; featured?: boolean };
export type DocumentFilters = { documentType?: string; meetingId?: string };

export type SearchResult =
  | { kind: 'meeting'; record: Meeting }
  | { kind: 'issue'; record: Issue }
  | { kind: 'document'; record: CivicDocument };

type Loader = () => Promise<Dataset>;

// The records (a few MB of JSON) load on first use as their own files, not inside the app
// bundle, so the home page and Coming Soon pages never download them.
const jsonLoader: Loader = async () => {
  const [meetings, issues, documents] = await Promise.all([
    import('../../data/meetings.json'),
    import('../../data/issues.json'),
    import('../../data/documents.json'),
  ]);
  return {
    meetings: meetings.default as Meeting[],
    issues: issues.default as Issue[],
    documents: documents.default as CivicDocument[],
  };
};

let loader: Loader = jsonLoader;
let cache: Promise<Dataset> | null = null;

/** Test hook: swap the data source (e.g. to simulate an empty dataset or a load error). */
export function setDataLoader(next: Loader | null): void {
  loader = next ?? jsonLoader;
  cache = null;
}

/** Clears the cached dataset so the next call reloads it (used by "Try again"). */
export function resetDataCache(): void {
  cache = null;
}

async function loadDataset(): Promise<Dataset> {
  if (!cache) {
    cache = loader()
      .then((raw) => {
        const data = normalize(raw);
        if (import.meta.env.DEV) logRelationshipWarnings(data);
        return data;
      })
      .catch((err) => {
        cache = null; // allow retry
        throw err;
      });
  }
  return cache;
}

const asArray = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

/**
 * Defends pages against malformed rows: missing arrays become [], unclear provenance is
 * treated as mock, and mock rows never carry links (so a sample record can't look sourced).
 */
function normalize(raw: Dataset): Dataset {
  const isCurated = (r: { dataMode?: unknown; mockOnly?: unknown }) =>
    r.dataMode === 'curated' && r.mockOnly === false;
  const MOCK = { dataMode: 'mock' as const, mockOnly: true };
  return {
    meetings: (raw.meetings ?? []).map((m) => ({
      ...m,
      agendaDocumentIds: asArray(m.agendaDocumentIds),
      issueIds: asArray(m.issueIds),
      ...(isCurated(m) ? {} : { ...MOCK, officialPageUrl: null, recordingUrl: null }),
    })),
    issues: (raw.issues ?? []).map((i) => ({
      ...i,
      meetingIds: asArray(i.meetingIds),
      documentIds: asArray(i.documentIds),
      status: ISSUE_STATUSES.includes(i.status) ? i.status : 'unknown',
      ...(isCurated(i) ? { sourceUrls: asArray(i.sourceUrls) } : { ...MOCK, sourceUrls: [] }),
    })),
    documents: (raw.documents ?? []).map((d) => ({
      ...d,
      issueIds: asArray(d.issueIds),
      ...(isCurated(d) ? {} : { ...MOCK, url: null }),
    })),
  };
}

const ISSUE_STATUSES: Issue['status'][] = [
  'proposed',
  'under_consideration',
  'approved',
  'denied',
  'withdrawn',
  'completed',
  'unknown',
];

/** Returns human-readable descriptions of IDs that do not resolve. Used by tests and dev logging. */
export function findBrokenRelationships(data: Dataset): string[] {
  const meetingIds = new Set(data.meetings.map((m) => m.id));
  const issueIds = new Set(data.issues.map((i) => i.id));
  const docIds = new Set(data.documents.map((d) => d.id));
  const problems: string[] = [];
  for (const m of data.meetings) {
    m.agendaDocumentIds.filter((id) => !docIds.has(id)).forEach((id) => problems.push(`${m.id} -> missing document ${id}`));
    m.issueIds.filter((id) => !issueIds.has(id)).forEach((id) => problems.push(`${m.id} -> missing issue ${id}`));
  }
  for (const i of data.issues) {
    i.meetingIds.filter((id) => !meetingIds.has(id)).forEach((id) => problems.push(`${i.id} -> missing meeting ${id}`));
    i.documentIds.filter((id) => !docIds.has(id)).forEach((id) => problems.push(`${i.id} -> missing document ${id}`));
  }
  for (const d of data.documents) {
    if (d.meetingId && !meetingIds.has(d.meetingId)) problems.push(`${d.id} -> missing meeting ${d.meetingId}`);
    d.issueIds.filter((id) => !issueIds.has(id)).forEach((id) => problems.push(`${d.id} -> missing issue ${id}`));
  }
  return problems;
}

function logRelationshipWarnings(data: Dataset): void {
  const problems = findBrokenRelationships(data);
  if (problems.length) console.warn('[civicData] Unresolved record references:', problems);
}

const byDateDesc = (a: string | null, b: string | null) => (b ?? '').localeCompare(a ?? '');
const pickIds = <T extends { id: string }>(records: T[], ids: string[]) =>
  ids.map((id) => records.find((r) => r.id === id)).filter((r): r is T => Boolean(r));

// ---- Meetings ----

export async function getMeetings(filters: MeetingFilters = {}): Promise<Meeting[]> {
  const { meetings } = await loadDataset();
  return meetings
    .filter((m) => !filters.status || m.status === filters.status)
    .filter((m) => !filters.meetingType || m.meetingType === filters.meetingType)
    .sort((a, b) => byDateDesc(a.date, b.date));
}

export async function getMeetingById(id: string): Promise<Meeting | null> {
  const { meetings } = await loadDataset();
  return meetings.find((m) => m.id === id) ?? null;
}

export async function getMeetingsForIssue(issueId: string): Promise<Meeting[]> {
  const { meetings, issues } = await loadDataset();
  const issue = issues.find((i) => i.id === issueId);
  return issue ? pickIds(meetings, issue.meetingIds) : [];
}

// ---- Issues ----

export async function getIssues(filters: IssueFilters = {}): Promise<Issue[]> {
  const { issues } = await loadDataset();
  return issues
    .filter((i) => !filters.status || i.status === filters.status)
    .filter((i) => !filters.category || i.category === filters.category)
    .filter((i) => filters.featured === undefined || i.featured === filters.featured);
}

export async function getIssueById(id: string): Promise<Issue | null> {
  const { issues } = await loadDataset();
  return issues.find((i) => i.id === id) ?? null;
}

export async function getIssuesForMeeting(meetingId: string): Promise<Issue[]> {
  const { meetings, issues } = await loadDataset();
  const meeting = meetings.find((m) => m.id === meetingId);
  // Union of both directions of the relationship, so a one-sided link still shows up.
  const ids = new Set([...(meeting?.issueIds ?? []), ...issues.filter((i) => i.meetingIds.includes(meetingId)).map((i) => i.id)]);
  return issues.filter((i) => ids.has(i.id));
}

export async function getRelatedIssuesForDocument(documentId: string): Promise<Issue[]> {
  const { documents, issues } = await loadDataset();
  const doc = documents.find((d) => d.id === documentId);
  const ids = new Set([...(doc?.issueIds ?? []), ...issues.filter((i) => i.documentIds.includes(documentId)).map((i) => i.id)]);
  return issues.filter((i) => ids.has(i.id));
}

// ---- Documents ----

export async function getDocuments(filters: DocumentFilters = {}): Promise<CivicDocument[]> {
  const { documents } = await loadDataset();
  return documents
    .filter((d) => !filters.documentType || d.documentType === filters.documentType)
    .filter((d) => !filters.meetingId || d.meetingId === filters.meetingId)
    .sort((a, b) => byDateDesc(a.publishedDate, b.publishedDate));
}

export async function getDocumentById(id: string): Promise<CivicDocument | null> {
  const { documents } = await loadDataset();
  return documents.find((d) => d.id === id) ?? null;
}

export async function getDocumentsForMeeting(meetingId: string): Promise<CivicDocument[]> {
  const { meetings, documents } = await loadDataset();
  const meeting = meetings.find((m) => m.id === meetingId);
  const ids = new Set([...(meeting?.agendaDocumentIds ?? []), ...documents.filter((d) => d.meetingId === meetingId).map((d) => d.id)]);
  return documents.filter((d) => ids.has(d.id));
}

export async function getDocumentsForIssue(issueId: string): Promise<CivicDocument[]> {
  const { documents, issues } = await loadDataset();
  const issue = issues.find((i) => i.id === issueId);
  const ids = new Set([...(issue?.documentIds ?? []), ...documents.filter((d) => d.issueIds.includes(issueId)).map((d) => d.id)]);
  return documents.filter((d) => ids.has(d.id));
}

// ---- Cross-record ----

/** Simple case-insensitive match over local text fields. P1 feature; not yet used by a page. */
export async function searchRecords(query: string): Promise<SearchResult[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const { meetings, issues, documents } = await loadDataset();
  const hit = (...fields: (string | null)[]) => fields.some((f) => f?.toLowerCase().includes(q));
  return [
    ...meetings.filter((m) => hit(m.title, m.summary, m.meetingType, m.date)).map((record) => ({ kind: 'meeting' as const, record })),
    ...issues.filter((i) => hit(i.title, i.summary, i.category)).map((record) => ({ kind: 'issue' as const, record })),
    ...documents.filter((d) => hit(d.title, d.description, d.documentType)).map((record) => ({ kind: 'document' as const, record })),
  ];
}

export async function getDatasetInfo(): Promise<DatasetInfo> {
  const { meetings, issues, documents } = await loadDataset();
  const all = [...meetings, ...issues, ...documents];
  const mockRecords = all.filter((r) => r.mockOnly || r.dataMode === 'mock').length;
  return {
    totalRecords: all.length,
    mockRecords,
    curatedRecords: all.length - mockRecords,
    containsMock: mockRecords > 0,
  };
}
