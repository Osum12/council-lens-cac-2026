import { useMemo, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { useUrlParams, useUrlText } from '../services/useUrlParams';
import { getDocuments, getMeetings } from '../services/civicData';
import { formatDate, formatTime, humanize, meetingTypeLabel, safeUrl } from '../services/format';
import { documentMatches, meetingMatches } from '../services/filters';
import { MeetingStatusBadge } from '../components/StatusBadge';
import { ExternalAction } from '../components/Cards';
import { useAsync } from '../services/useAsync';
import { usePageTitle } from '../services/usePageTitle';
import { MockBadge, isMock } from '../components/MockBadge';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import type { CivicDocument, Meeting } from '../types/civic';
import { usePlaceHref, useRecordSources } from '../services/placeContext';
import { ShowMoreButton, useStepped } from '../components/ShowMore';

export type ArchiveFilter = 'all' | 'videos' | 'agendas' | 'documents';

export type ArchiveEntry =
  | { kind: 'meeting'; id: string; date: string | null; record: Meeting; groups: ArchiveFilter[] }
  | { kind: 'document'; id: string; date: string | null; record: CivicDocument; groups: ArchiveFilter[] };

const FILTERS: { id: ArchiveFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'videos', label: 'Videos' },
  { id: 'agendas', label: 'Agendas' },
  { id: 'documents', label: 'Documents' },
];

// Display grouping only; the source documentType values are never changed.
const AGENDA_TYPES = new Set(['agenda', 'agenda_packet']);

/**
 * Builds one date-sorted list of meetings and documents, tagged with the filter groups each belongs to.
 * A document is dated by its meeting (so minutes sit next to the meeting they record); documents
 * without a meeting fall back to their publish date.
 */
export function buildArchiveEntries(meetings: Meeting[], documents: CivicDocument[]): ArchiveEntry[] {
  const meetingDate = (d: CivicDocument) => meetings.find((m) => m.id === d.meetingId)?.date ?? null;
  const entries: ArchiveEntry[] = [
    ...meetings.map((m) => ({
      kind: 'meeting' as const,
      id: m.id,
      date: m.date,
      record: m,
      groups: ['all', ...(safeUrl(m.recordingUrl) ? ['videos' as const] : [])] as ArchiveFilter[],
    })),
    ...documents.map((d) => ({
      kind: 'document' as const,
      id: d.id,
      date: meetingDate(d) ?? d.publishedDate,
      record: d,
      groups: ['all', AGENDA_TYPES.has(d.documentType) ? 'agendas' : 'documents'] as ArchiveFilter[],
    })),
  ];
  return entries.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.kind.localeCompare(a.kind)); // same date: meeting before its documents
}

const PAGE = 40;

const EMPTY_COPY: Record<ArchiveFilter, string> = {
  all: 'No meetings or documents are in the archive yet.',
  videos: 'No meeting recordings are linked in this dataset yet.',
  agendas: 'No agendas are in this dataset yet.',
  documents: 'No other documents are in this dataset yet.',
};

export function ArchivePage() {
  usePageTitle('Archive');
  const sources = useRecordSources();
  const { params, setParam: setUrlParam, clearParams } = useUrlParams();
  const raw = params.get('type');
  const filter: ArchiveFilter = FILTERS.some((f) => f.id === raw) ? (raw as ArchiveFilter) : 'all';
  const state = useAsync(() => Promise.all([getMeetings(), getDocuments()]), []);

  const setFilter = (next: ArchiveFilter) => {
    setUrlParam('type', next === 'all' ? null : next);
  };

  const q = params.get('q') ?? '';
  // The search box keeps its own text so fast typing is never lost; the URL follows it.
  const [query, setQuery] = useUrlText(params, setUrlParam, 'q');

  const all = useMemo(() => (state.status === 'ready' ? buildArchiveEntries(state.data[0], state.data[1]) : []), [state]);
  const entries = useMemo(() => all.filter((e) => entryMatches(e, q)), [all, q]);
  const visible = entries.filter((e) => e.groups.includes(filter));
  // Thousands of records: the list opens with the newest and grows on request.
  const { visible: shown, remaining, more, listRef } = useStepped(visible, PAGE, PAGE, `${filter}|${q}|${visible.length}`);
  const count = (f: ArchiveFilter) => entries.filter((e) => e.groups.includes(f)).length;

  return (
    <div className="page">
      <header className="page-header">
        <h1>Archive</h1>
        <p className="page-header__lede">
          Meetings, recordings, agendas, and supporting documents from {sources || 'the county’s official sources'}, with links to the original records.
        </p>
      </header>

      <form className="filters filters--compact" role="search" aria-label="Search the archive" onSubmit={(e) => e.preventDefault()}>
        <div className="filters__field filters__field--grow">
          <label htmlFor="archive-q">Search meetings and documents</label>
          <div className="search-field">
            <svg className="search-field__icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
              <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
              <path d="m15.5 15.5 5 5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
            <input id="archive-q" type="search" value={query} placeholder="e.g. property tax, housing, September" onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
      </form>

      <div className="filter-bar" role="group" aria-label="Filter by record type">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className="chip"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            disabled={state.status !== 'ready'}
          >
            {f.label}
            {state.status === 'ready' && <span className="chip__count">{count(f.id)}</span>}
          </button>
        ))}
      </div>

      {state.status === 'loading' && <LoadingState rows={5} />}
      {state.status === 'error' && <ErrorState onRetry={state.retry} />}
      {state.status === 'ready' && (
        <>
          <p className="results-count" role="status" aria-live="polite">
            {visible.length.toLocaleString('en-US')} {visible.length === 1 ? 'record' : 'records'}
            {q ? ` matching “${q}”` : ''}
          </p>
          {visible.length ? (
            <>
            <ol className="archive-list" ref={listRef as RefObject<HTMLOListElement | null>}>
              {shown.map((e) => (
                <li key={`${e.kind}-${e.id}`}>
                  <ArchiveRow entry={e} />
                </li>
              ))}
            </ol>
            <ShowMoreButton remaining={remaining} step={PAGE} noun="records" onClick={more} />
            </>
          ) : (
            <EmptyState
              title={emptyTitle(filter, q, count('all'))}
              action={
                <div className="button-row">
                  {q && filter !== 'all' && count('all') > 0 && (
                    <button type="button" className="button button--ghost" onClick={() => setFilter('all')}>
                      Show all types
                    </button>
                  )}
                  {(q || filter !== 'all') && (
                    <button type="button" className="button button--ghost" onClick={clearParams}>
                      Show all records
                    </button>
                  )}
                </div>
              }
            />
          )}
        </>
      )}
    </div>
  );
}

/** Explains an empty result, naming the active type so a combined search isn't misleading. */
function emptyTitle(filter: ArchiveFilter, q: string, matchesInAll: number): string {
  if (!q) return EMPTY_COPY[filter];
  if (filter === 'all') return `No records match “${q}”.`;
  const type = FILTERS.find((f) => f.id === filter)!.label.toLowerCase();
  return matchesInAll > 0
    ? `No ${type} match “${q}”. ${matchesInAll} other ${matchesInAll === 1 ? 'record matches' : 'records match'} in All.`
    : `No records match “${q}”.`;
}

const entryMatches = (e: ArchiveEntry, q: string) => (e.kind === 'meeting' ? meetingMatches(e.record, q) : documentMatches(e.record, q));

function ArchiveRow({ entry }: { entry: ArchiveEntry }) {
  const href = usePlaceHref();
  const isMeeting = entry.kind === 'meeting';
  const to = href(isMeeting ? `/meetings/${encodeURIComponent(entry.id)}` : `/documents/${encodeURIComponent(entry.id)}`);
  const typeLabel = isMeeting ? `${meetingTypeLabel(entry.record.meetingType)} meeting` : humanize(entry.record.documentType);
  const mock = isMock(entry.record);
  const recording = isMeeting && !mock ? safeUrl(entry.record.recordingUrl) : null;
  const file = !isMeeting && !mock ? safeUrl(entry.record.url) : null;
  const time = isMeeting ? formatTime(entry.record.startTime) : null;

  return (
    <article className={`archive-row archive-row--${entry.kind}`}>
      <span className="archive-row__icon" aria-hidden="true">
        <RowIcon kind={isMeeting ? 'meeting' : 'document'} />
      </span>
      <div className="archive-row__body">
        <div className="card__top">
          <span className="tag">{typeLabel}</span>
          {isMeeting && <MeetingStatusBadge status={entry.record.status} />}
          {mock && <MockBadge record={entry.record} />}
        </div>
        <h2 className="archive-row__title">
          <Link to={to} className="card__link">
            {entry.record.title}
          </Link>
        </h2>
        <p className="archive-row__date">
          {isMeeting ? (
            <>
              <time dateTime={entry.date ?? undefined}>{formatDate(entry.date)}</time>
              {time ? ` at ${time}` : ''}
            </>
          ) : entry.record.meetingId && entry.date !== entry.record.publishedDate ? (
            <>
              For the <time dateTime={entry.date ?? undefined}>{formatDate(entry.date)}</time> meeting.
              {entry.record.publishedDate && (
                <>
                  {' '}Published <span className="nowrap">{formatDate(entry.record.publishedDate)}</span>.
                </>
              )}
            </>
          ) : (
            <>
              Published <time dateTime={entry.date ?? undefined}>{formatDate(entry.date)}</time>
            </>
          )}
        </p>
        <div className="card__actions">
          {isMeeting ? (
            recording ? (
              <ExternalAction href={recording} context={entry.record.title}>
                Watch recording
              </ExternalAction>
            ) : (
              <span className="card__action card__action--muted">
                {entry.record.status === 'scheduled' ? 'No recording yet: this meeting hasn’t happened' : 'No recording linked'}
              </span>
            )
          ) : file ? (
            <ExternalAction href={file} context={entry.record.title}>
              Open PDF
            </ExternalAction>
          ) : (
            <span className="card__action card__action--muted">No file linked</span>
          )}
        </div>
      </div>
    </article>
  );
}

/** Decorative row icon; the type label next to it carries the meaning. */
function RowIcon({ kind }: { kind: 'meeting' | 'document' }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false">
      {kind === 'meeting' ? (
        <path d="M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
      ) : (
        <path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm7 0v5h5M9 13h6m-6 4h6" />
      )}
    </svg>
  );
}
