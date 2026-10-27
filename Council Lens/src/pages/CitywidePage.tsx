import { useRef, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useUrlParams, useUrlText } from '../services/useUrlParams';
import { getDocuments, getIssues, getMeetings } from '../services/civicData';
import { filterIssues, isFiltering, statusesIn, topicsIn, type IssueFilterState } from '../services/filters';
import { formatDate, formatTime, formatWeekdayDate, humanize, ISSUE_STATUS_LABELS, safeUrl, todayIso } from '../services/format';
import { useAsync } from '../services/useAsync';
import { usePageTitle } from '../services/usePageTitle';
import { IssueCard, MeetingCard } from '../components/Cards';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { isMock } from '../components/MockBadge';
import { IssueStatusBadge } from '../components/StatusBadge';
import { Ripples } from '../components/Ripples';
import { CompassMark } from '../components/CompassMark';
import { AtlasBackdrop } from '../components/AtlasBackdrop';
import type { CivicDocument, Issue, Meeting } from '../types/civic';
import { usePlace, usePlaceHref, useRecordSources } from '../services/placeContext';
import { nb } from '../components/nb';
import { ShowMoreButton, useStepped } from '../components/ShowMore';

/**
 * Upcoming = not held or canceled, and dated today or later. A "scheduled" meeting with no
 * date counts as upcoming; a "scheduled" meeting whose date has passed does not.
 */
export function splitMeetings(meetings: Meeting[], today = todayIso()) {
  const isUpcoming = (m: Meeting) =>
    m.status !== 'completed' && m.status !== 'canceled' && (m.date ? m.date >= today : m.status === 'scheduled');
  const upcoming = meetings.filter(isUpcoming).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
  const recent = meetings.filter((m) => !isUpcoming(m)).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  return { upcoming, recent };
}

/** The agenda for a meeting: prefers a plain agenda over a packet. */
export function agendaFor(meeting: Meeting, documents: CivicDocument[]): CivicDocument | null {
  const docs = meeting.agendaDocumentIds.map((id) => documents.find((d) => d.id === id)).filter((d): d is CivicDocument => Boolean(d));
  return docs.find((d) => d.documentType === 'agenda') ?? docs[0] ?? null;
}

/** What the records cover, from the meetings themselves: "Items from the board’s 51 meetings, January 8, 2025 to October 21, 2026, …". */
function coverageLine(meetings: Meeting[]): string {
  const dates = meetings.filter((m) => !isMock(m) && m.date).map((m) => m.date!).sort();
  if (!dates.length) return '';
  return `Agenda items from the board’s ${meetings.length} meetings, ${nb(formatDate(dates[0]))} to ${nb(formatDate(dates.at(-1)!))}. Ceremonial items such as proclamations are left out.`;
}

/** Most recent verification date across curated records, or null when none is recorded. */
function lastChecked(meetings: Meeting[]): string | null {
  const dates = meetings.filter((m) => !isMock(m) && m.lastVerifiedAt).map((m) => m.lastVerifiedAt!.slice(0, 10));
  return dates.length ? dates.sort().at(-1)! : null;
}

export function CitywidePage() {
  usePageTitle('Countywide');
  const place = usePlace();
  const sources = useRecordSources();
  const state = useAsync(() => Promise.all([getMeetings(), getIssues(), getDocuments()]), []);
  const issuesHeading = useRef<HTMLHeadingElement>(null);
  const meetingsHeading = useRef<HTMLHeadingElement>(null);
  const { params, setParam } = useUrlParams();
  // The search box keeps its own text so fast typing is never lost; the URL follows it.
  const [query, onQuery] = useUrlText(params, setParam, 'q');

  // In-page jumps also move keyboard focus, so screen-reader users land where sighted users do.
  const jumpTo = (el: HTMLElement | null) => {
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    el.focus({ preventScroll: true });
  };

  const ready = state.status === 'ready' ? state.data : null;
  const anyMock = ready ? [...ready[0], ...ready[1], ...ready[2]].some(isMock) : false;
  const checked = ready && !anyMock ? lastChecked(ready[0]) : null;

  return (
    <div className="page">
      <AtlasBackdrop />
      <section className="hero hero--county" aria-labelledby="citywide-title">
        <div className="hero__inner">
          <div className="hero__main">
            <p className="hero__place">
              <CompassMark />
              {place?.name}, Georgia
            </p>
            <h1 id="citywide-title" className="hero__title">
              <span className="hero__line">What’s on the table</span> <span className="hero__line">in {place?.name}</span>
            </h1>
            <p className="hero__lede">Recent decisions and public meetings of the {sources}, in plain language, with a link to every official record.</p>
          </div>
          {/* Before the search panel in the DOM, so tab order matches what is drawn first. */}
          {ready && <Docket meetings={ready[0]} issues={ready[1]} documents={ready[2]} />}
          <div className="searchpanel">
            <p className="searchpanel__prompt" aria-hidden="true">
              What can we help you find?
            </p>
            <form
              className="hero-search"
              role="search"
              aria-label="Issue search"
              onSubmit={(e) => {
                e.preventDefault();
                jumpTo(issuesHeading.current);
              }}
            >
              <label htmlFor="hero-q" className="visually-hidden">
                Search issues
              </label>
              <SearchIcon />
              <input
                id="hero-q"
                type="search"
                value={query}
                placeholder="e.g. property tax"
                onChange={(e) => onQuery(e.target.value)}
              />
              <button type="submit" className="hero-search__button">
                Search
              </button>
            </form>
            {ready && <TopicStrip issues={ready[1]} onPick={() => setTimeout(() => jumpTo(issuesHeading.current), 0)} />}
            {ready && (
              <p className="hero__note">
                {anyMock
                  ? 'These records include sample data and are not county totals.'
                  : `${coverageLine(ready[0])}${checked ? ` Last checked against official county records on ${nb(formatDate(checked))}.` : ''}`}
              </p>
            )}
          </div>
        </div>
      </section>

      {state.status === 'loading' && <LoadingState rows={4} />}
      {state.status === 'error' && <ErrorState onRetry={state.retry} />}
      {ready && (
        <CitywideContent
          meetings={ready[0]}
          issues={ready[1]}
          documents={ready[2]}
          issuesHeading={issuesHeading}
          meetingsHeading={meetingsHeading}
        />
      )}
    </div>
  );
}

type ContentProps = {
  meetings: Meeting[];
  issues: Issue[];
  documents: CivicDocument[];
  issuesHeading: RefObject<HTMLHeadingElement | null>;
  meetingsHeading: RefObject<HTMLHeadingElement | null>;
};

function CitywideContent({ meetings, issues, documents, issuesHeading, meetingsHeading }: ContentProps) {
  const sources = useRecordSources();
  const href = usePlaceHref();
  const { params, setParam, clearParams } = useUrlParams();
  // Values from the URL are only honored if they exist in the data, so a stale or mistyped
  // link never filters by something the dropdowns can't show.
  const rawTopic = params.get('topic') ?? '';
  const rawStatus = params.get('status') ?? '';
  const filters: IssueFilterState = {
    q: params.get('q') ?? '',
    topic: topicsIn(issues).includes(rawTopic) ? rawTopic : '',
    status: (statusesIn(issues) as string[]).includes(rawStatus) ? rawStatus : '',
    when: '',
  };
  const setFilter = (key: keyof IssueFilterState, value: string) => {
    setParam(key, value);
  };
  const clearFilters = () => {
    clearParams();
  };

  if (!meetings.length && !issues.length) {
    return (
      <EmptyState title="No civic records are loaded yet.">
        <p>When meetings and issues are added to the dataset, they’ll appear here.</p>
      </EmptyState>
    );
  }

  const { upcoming, recent } = splitMeetings(meetings);
  const filtering = isFiltering(filters);
  const matches = filterIssues(issues, filters);

  return (
    <div className="citywide-grid">
      <section className="section" aria-labelledby="issues-heading">
        <div className="section__head">
          <h2 id="issues-heading" ref={issuesHeading} tabIndex={-1}>
            Issues
          </h2>
          <p className="section__source">From the {sources}</p>
          <Link to={href('/near-me')} className="text-link">
            See them on the map
          </Link>
        </div>

        <PageJumps issues={filtering ? matches : issues} meetingCount={upcoming.length + Math.min(recent.length, 4)} />

        <IssueFilters issues={issues} filters={filters} onChange={setFilter} onClear={clearFilters} />
        <p className="results-count" role="status" aria-live="polite">
          {filtering
            ? `${matches.length.toLocaleString('en-US')} of ${issues.length.toLocaleString('en-US')} issues match`
            : `${issues.length.toLocaleString('en-US')} issues`}
        </p>

        {filtering ? (
          matches.length ? (
            <GroupedIssues issues={matches} />
          ) : (
            <EmptyState
              title="No issues match these filters."
              action={
                <button type="button" className="button button--ghost" onClick={clearFilters}>
                  Clear filters
                </button>
              }
            >
              <p>Try a different word, or choose “All topics” and “Any status”.</p>
            </EmptyState>
          )
        ) : (
          <GroupedIssues issues={issues} shorten />
        )}
      </section>

      <aside className="section section--meetings" aria-labelledby="meetings-heading">
        <h2 id="meetings-heading" ref={meetingsHeading} tabIndex={-1}>
          Meetings
        </h2>
        <p className="section__source">From the {sources}</p>
        {upcoming.length > 0 && <MeetingGroup title="Coming up" upcoming meetings={upcoming} documents={documents} empty="" />}
        <MeetingGroup title="Recent" meetings={recent.slice(0, 4)} documents={documents} empty="No past meetings in this dataset." />
        <Link to={href('/archive')} className="text-link">
          Browse all meetings and documents
        </Link>
      </aside>
    </div>
  );
}

function IssueFilters({
  issues,
  filters,
  onChange,
  onClear,
}: {
  issues: Issue[];
  filters: IssueFilterState;
  onChange: (key: keyof IssueFilterState, value: string) => void;
  onClear: () => void;
}) {
  return (
    <form className="filters" role="search" aria-label="Search and filter issues" onSubmit={(e) => e.preventDefault()}>
      <div className="filters__field">
        <label htmlFor="issue-topic">Topic</label>
        <select id="issue-topic" value={filters.topic} onChange={(e) => onChange('topic', e.target.value)}>
          <option value="">All topics</option>
          {topicsIn(issues).map((t) => (
            <option key={t} value={t}>
              {humanize(t)}
            </option>
          ))}
        </select>
      </div>
      <div className="filters__field">
        <label htmlFor="issue-status">Status</label>
        <select id="issue-status" value={filters.status} onChange={(e) => onChange('status', e.target.value)}>
          <option value="">Any status</option>
          {statusesIn(issues).map((s) => (
            <option key={s} value={s}>
              {ISSUE_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      {isFiltering(filters) && (
        <button type="button" className="button button--ghost filters__clear" onClick={onClear}>
          Clear
        </button>
      )}
    </form>
  );
}

/** Main items first, then the most recently decided. */
const byImportance = (issues: Issue[]) =>
  [...issues].sort((a, b) => Number(b.featured) - Number(a.featured) || (b.statusAsOf ?? '').localeCompare(a.statusAsOf ?? ''));

/**
 * Issues are grouped by where they stand, so the long list reads as three short ones.
 * Grouping is presentational: it runs on whatever the search and filters already matched,
 * and a group with nothing in it is not shown.
 */
const GROUPS: { id: string; title: string; glyph: string; statuses: string[] }[] = [
  { id: 'issues-pending', title: 'Still being decided', glyph: '◐', statuses: ['proposed', 'under_consideration'] },
  { id: 'issues-approved', title: 'Approved', glyph: '●', statuses: ['approved', 'completed'] },
  { id: 'issues-denied', title: 'Denied', glyph: '✕', statuses: ['denied'] },
  { id: 'issues-other', title: 'Withdrawn or status not recorded', glyph: '–', statuses: ['withdrawn', 'unknown'] },
];
const groupOf = (i: Issue) => GROUPS.find((g) => g.statuses.includes(i.status)) ?? GROUPS[GROUPS.length - 1];

/** A long group opens with its first few issues (more when the list is a search result) and grows a step at a time. */
const SHORT_LENGTH = 6;
const STEP = 24;

function GroupedIssues({ issues, shorten = false }: { issues: Issue[]; shorten?: boolean }) {
  const sorted = byImportance(issues);
  return (
    <div className="issue-groups">
      {GROUPS.map((g) => {
        const members = sorted.filter((i) => groupOf(i) === g);
        return members.length ? <IssueGroup key={g.id} group={g} members={members} first={shorten ? SHORT_LENGTH : STEP} /> : null;
      })}
    </div>
  );
}

function IssueGroup({ group: g, members, first }: { group: (typeof GROUPS)[number]; members: Issue[]; first: number }) {
  // Only cut when it saves real scrolling: never hide just one or two issues.
  const opening = members.length > first + 2 ? first : members.length;
  const { visible, remaining, more, listRef } = useStepped(members, opening, STEP, `${opening}|${members.length}|${members[0].id}`);
  return (
    <section className={`issue-group issue-group--${g.id.replace('issues-', '')}`} aria-labelledby={g.id}>
      <h3 id={g.id} className="issue-group__title" tabIndex={-1}>
        <span className="issue-group__glyph" aria-hidden="true">
          {g.glyph}
        </span>
        {g.title}
        <span className="issue-group__count">
          {members.length.toLocaleString('en-US')}
          <span className="visually-hidden">{members.length === 1 ? ' issue' : ' issues'}</span>
        </span>
      </h3>
      <IssueList issues={visible} headingLevel={4} listRef={listRef} />
      <ShowMoreButton remaining={remaining} step={STEP} noun={`${g.title.toLowerCase()} issues`} onClick={more} />
    </section>
  );
}

/** A compact "on this page" row: each status group with its count, and the meetings column. */
function PageJumps({ issues, meetingCount }: { issues: Issue[]; meetingCount: number }) {
  const go = (id: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    // Keep the address in step (so the section can be linked), without dropping the search
    // and filter params or adding a history entry for every jump.
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}#${id}`);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    el.focus({ preventScroll: true });
  };
  const present = GROUPS.map((g) => ({ g, n: issues.filter((i) => groupOf(i) === g).length })).filter((x) => x.n > 0);
  // With one group (or none) visible, the row would only repeat the group heading.
  if (present.length < 2) return null;
  return (
    <nav className="jumps" aria-label="On this page">
      <ul className="jumps__list">
        {present.map(({ g, n }) => (
          <li key={g.id}>
            <a className="jumps__link" href={`#${g.id}`} onClick={go(g.id)}>
              <span aria-hidden="true" className="jumps__glyph">
                {g.glyph}
              </span>
              {g.title}
              <span className="jumps__count">{n}</span>
            </a>
          </li>
        ))}
        {meetingCount > 0 && (
          <li className="jumps__meetings">
            <a className="jumps__link" href="#meetings-heading" onClick={go('meetings-heading')}>
              <CalendarIcon />
              Meetings
              <span className="jumps__count">{meetingCount}</span>
            </a>
          </li>
        )}
      </ul>
    </nav>
  );
}

function CalendarIcon() {
  return (
    <svg className="jumps__glyph" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <rect x="4" y="5" width="16" height="15" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M4 10h16M9 3v4M15 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IssueList({ issues, headingLevel, listRef }: { issues: Issue[]; headingLevel: 3 | 4; listRef?: RefObject<HTMLElement | null> }) {
  return (
    <ul className="issue-list" ref={listRef as RefObject<HTMLUListElement | null> | undefined}>
      {issues.map((i) => (
        <li key={i.id}>
          <IssueCard issue={i} headingLevel={headingLevel} />
        </li>
      ))}
    </ul>
  );
}

function MeetingGroup({
  title,
  meetings,
  documents,
  empty,
  upcoming = false,
}: {
  title: string;
  meetings: Meeting[];
  documents: CivicDocument[];
  empty: ReactNode;
  upcoming?: boolean;
}) {
  return (
    <>
      <h3 className="subhead">{title}</h3>
      {meetings.length ? (
        <ul className={`stack calendar${upcoming ? ' calendar--upcoming' : ''}`}>
          {meetings.map((m) => (
            <li key={m.id}>
              <MeetingCard meeting={m} agenda={agendaFor(m, documents)} headingLevel={4} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={String(empty)} />
      )}
    </>
  );
}

/**
 * "Next at <meeting place>": the next scheduled meeting, what is on its agenda, and the most
 * recent recorded decision. Everything shown comes from the dataset; nothing is invented.
 */
function Docket({ meetings, issues, documents }: { meetings: Meeting[]; issues: Issue[]; documents: CivicDocument[] }) {
  const href = usePlaceHref();
  const meetingPlace = usePlace()?.recordSources[0]?.meetingPlace ?? 'City Hall';
  const next = splitMeetings(meetings).upcoming[0] ?? null;
  const onAgenda = next ? issues.filter((i) => next.issueIds.includes(i.id)) : [];
  const decided = issues
    .filter((i) => ['approved', 'denied', 'withdrawn', 'completed'].includes(i.status) && i.statusAsOf)
    // Newest first; on the same day, a featured item, then one with a plain-language explanation.
    .sort(
      (a, b) =>
        b.statusAsOf!.localeCompare(a.statusAsOf!) || Number(b.featured) - Number(a.featured) || Number(Boolean(b.whyItMayMatter)) - Number(Boolean(a.whyItMayMatter)),
    )[0];
  const agenda = next ? agendaFor(next, documents) : null;
  if (!next && !decided) return null;
  return (
    <aside className="docket" aria-label={next ? `Next at ${meetingPlace}` : 'Latest decision'}>
      {/* The rings centre on the featured record, like the ripple around a map pin. */}
      <Ripples />
      {next && (
        <div className="docket__block">
          <p className="docket__kicker">Next at {meetingPlace}</p>
          <p className="docket__date">
            <time dateTime={next.date ?? undefined}>{nb(formatWeekdayDate(next.date))}</time>
            {next.startTime && <span className="docket__time">{formatTime(next.startTime)}</span>}
          </p>
          <p className="docket__title">
            <Link to={href(`/meetings/${encodeURIComponent(next.id)}`)}>{next.title}</Link>
          </p>
          {onAgenda.length > 0 && (
            <>
              <p className="docket__label">On the agenda</p>
              <ul className="docket__list">
                {onAgenda.map((i) => (
                  <li key={i.id}>
                    <Link to={href(`/issues/${encodeURIComponent(i.id)}`)}>{i.title}</Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          {agenda && safeUrl(agenda.url) && !isMock(agenda) && (
            <a className="docket__source" href={safeUrl(agenda.url)!} target="_blank" rel="noopener noreferrer">
              Read the agenda (PDF)<span className="visually-hidden"> for {next.title}, opens in a new tab</span>
            </a>
          )}
        </div>
      )}
      {decided && (
        <div className="docket__block docket__block--decided">
          <p className="docket__kicker">Latest decision</p>
          <p className="docket__title docket__title--small">
            <Link to={href(`/issues/${encodeURIComponent(decided.id)}`)}>{decided.title}</Link>
          </p>
          <p className="docket__meta">
            <IssueStatusBadge status={decided.status} /> on {nb(formatDate(decided.statusAsOf))}
          </p>
        </div>
      )}
    </aside>
  );
}

/**
 * One shortcut per topic that has issues in the data, with its count. Each link opens the
 * issue list filtered to that topic, so a shortcut never leads to an empty list.
 */
function TopicStrip({ issues, onPick }: { issues: Issue[]; onPick: () => void }) {
  const [params] = useSearchParams();
  const active = params.get('topic') ?? '';
  const topics = topicsIn(issues);
  if (!topics.length) return null;
  return (
    <nav className="topics" aria-labelledby="topics-title">
      <p id="topics-title" className="topics__title">
        Browse by topic
      </p>
      <ul className="topics__list">
        {topics.map((t) => {
          const count = issues.filter((i) => i.category === t).length;
          const current = t === active;
          return (
            <li key={t}>
              <Link
                to={{ search: `?topic=${encodeURIComponent(t)}` }}
                className="topic"
                data-topic={t}
                aria-current={current ? 'true' : undefined}
                onClick={onPick}
              >
                {current && (
                  <span className="topic__check" aria-hidden="true">
                    ✓
                  </span>
                )}
                <span className="topic__name">{humanize(t)}</span>
                <span className="topic__count">
                  {count}
                  <span className="visually-hidden">{count === 1 ? ' issue' : ' issues'}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SearchIcon() {
  return (
    <svg className="hero-search__icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="m15.5 15.5 5 5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
