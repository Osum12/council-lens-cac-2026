import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useUrlParams } from '../services/useUrlParams';
import { getIssues } from '../services/civicData';
import { humanize } from '../services/format';
import { topicsIn } from '../services/filters';
import { DEMO_LOCATIONS, pointKind, rankIssuesForLocation, type RankedIssue } from '../services/nearMe';
import { useAsync } from '../services/useAsync';
import { usePageTitle } from '../services/usePageTitle';
import { IssueMap, type MapPoint } from '../components/IssueMap';
import { MockBadge, isMock } from '../components/MockBadge';
import { IssueStatusBadge } from '../components/StatusBadge';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { usePlaceHref } from '../services/placeContext';
import { PinIcon } from '../components/PinIcon';
import { CompassMark } from '../components/CompassMark';

// Only the nearest few are shown: mapped items by distance, then countywide items if a category has
// fewer than this many on the map. The full list lives on the Countywide page.
const NEAREST = 20;
export function NearMePage() {
  usePageTitle('Near Me');
  const { params, setParam } = useUrlParams();
  // One public starting point; nothing about the viewer's own location is asked for or stored.
  const origin = DEMO_LOCATIONS[0];
  const selectedId = params.get('issue');
  const state = useAsync(() => getIssues(), []);

  const updateParam = (key: string, value: string | null) => {
    setParam(key, value);
  };

  const issues = state.status === 'ready' ? state.data : null;
  const topics = useMemo(() => (issues ? topicsIn(issues) : []), [issues]);
  const rawTopic = params.get('topic') ?? '';
  const topic = topics.includes(rawTopic) ? rawTopic : '';
  const ranked = useMemo(
    () => (issues ? rankIssuesForLocation(topic ? issues.filter((i) => i.category === topic) : issues, origin) : []),
    [issues, origin, topic],
  );
  const setTopic = (next: string) => {
    // A highlighted issue outside the new category would have no pin or card, so drop it.
    const selected = issues?.find((i) => i.id === selectedId);
    if (next && selected && selected.category !== next) updateParam('issue', null);
    updateParam('topic', next || null);
  };
  // The nearest 20, plus the mapped issue a "View on map" link asked for if it ranks further down,
  // so the link always lands on its pin.
  const nearest = Math.min(NEAREST, ranked.length);
  const shown = useMemo(() => {
    const top = ranked.slice(0, NEAREST);
    const asked = selectedId && !top.some((r) => r.issue.id === selectedId) ? ranked.find((r) => r.issue.id === selectedId && r.coords) : undefined;
    return asked ? [...top, asked] : top;
  }, [ranked, selectedId]);
  // Pin numbers count only issues that have coordinates, so pins read 1, 2, 3… with no gaps.
  const points: MapPoint[] = useMemo(
    () =>
      shown
        .filter((r) => r.coords)
        .map((r, i) => ({ id: r.issue.id, title: r.issue.title, number: i + 1, coords: r.coords!, note: r.issue.location?.verified ? null : isMock(r.issue) ? 'sample map point' : pointKind(r.issue) })),
    [shown],
  );
  const pinNumber = (id: string) => points.find((p) => p.id === id)?.number ?? null;

  // When a marker is chosen, bring its card into view. When the choice came from a card's
  // "Show on map" button on the stacked layout, bring the map into view instead.
  const listRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLElement>(null);
  const fromFeed = useRef(false);
  useEffect(() => {
    if (!selectedId) return;
    const stacked = window.matchMedia?.('(max-width: 900px)').matches;
    if (fromFeed.current) {
      fromFeed.current = false;
      if (stacked) {
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        mapRef.current?.scrollIntoView?.({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
      }
      return;
    }
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    listRef.current
      ?.querySelector(`[data-issue-id="${CSS.escape(selectedId)}"]`)
      ?.scrollIntoView?.({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [selectedId, ranked]);

  const located = shown.filter((r) => r.coords);
  const unlocated = shown.filter((r) => !r.coords);
  const placeHref = usePlaceHref();
  const item = (r: RankedIssue) => (
    <li key={r.issue.id}>
      <FeedItem
        ranked={r}
        number={pinNumber(r.issue.id)}
        selected={r.issue.id === selectedId}
        onShowOnMap={() => {
          fromFeed.current = r.issue.id !== selectedId;
          updateParam('issue', r.issue.id === selectedId ? null : r.issue.id);
        }}
      />
    </li>
  );

  return (
    <div className="page">
      <header className="page-header">
        <h1>
          <CompassMark className="compass--heading" />
          Near Me
        </h1>
        <p className="page-header__lede">
          The {NEAREST} issues nearest the starting point, closest at the top. Distance helps you find nearby items, but it doesn’t tell you whether an issue affects a particular
          home.
        </p>
      </header>

      <p className="nearme__start">
        <PinIcon className="nearme__start-icon" />
        <span>
          Distances are measured from <strong>{origin.label}</strong>, {origin.description}.
        </span>
      </p>

      {state.status === 'loading' && <LoadingState rows={4} />}
      {state.status === 'error' && <ErrorState onRetry={state.retry} />}
      {state.status === 'ready' && topics.length > 0 && (
        <form className="filters nearme__filters" role="search" aria-label="Filter issues by category" onSubmit={(e) => e.preventDefault()}>
          <div className="filters__field">
            <label htmlFor="nearme-topic">Category</label>
            <select id="nearme-topic" value={topic} onChange={(e) => setTopic(e.target.value)}>
              <option value="">All categories</option>
              {topics.map((t) => (
                <option key={t} value={t}>
                  {humanize(t)}
                </option>
              ))}
            </select>
          </div>
          <p className="results-count nearme__count" role="status" aria-live="polite">
            {nearest < ranked.length && `Nearest ${nearest} of `}
            {ranked.length.toLocaleString('en-US')} {ranked.length === 1 ? 'issue' : 'issues'}
            {topic ? ` in ${humanize(topic)}` : ''}, {points.length} on the map
          </p>
        </form>
      )}
      {state.status === 'ready' &&
        (ranked.length === 0 ? (
          <EmptyState title="No issues are in the dataset yet." />
        ) : (
          <div className="nearme">
            <section className="nearme__map" aria-labelledby="map-h" ref={mapRef}>
              <h2 id="map-h" className="visually-hidden">
                Map
              </h2>
              <IssueMap points={points} origin={origin} selectedId={selectedId} onSelect={(id) => updateParam('issue', id)} />
              <p className="fine-print">
                The gold-ringed dot marked “Start here” is the starting point, {origin.label}. Numbered pins match the list. Dashed pins are approximate: they are placed from a street address, not an exact site boundary. Pins that would overlap are drawn slightly apart so each one can be selected.{' '}
                {unlocated.length > 0 &&
                  `${unlocated.length} issue${unlocated.length > 1 ? 's have' : ' has'} no map location and appear${unlocated.length > 1 ? '' : 's'} in the list only.`}
              </p>
            </section>
            <section className="nearme__feed" aria-labelledby="feed-h">
              <h2 id="feed-h" className="nearme__feed-title">
                {points.length ? `Sorted by distance from ${origin.label}` : 'Countywide items, without a map location'}
              </h2>
              <div className="feed-groups" ref={listRef}>
                {located.length > 0 && (
                  <>
                    <p className="feed__intro">Distances are straight lines to each item’s map point. They are not a claim that an issue affects that spot.</p>
                    <ol className="feed">{located.map(item)}</ol>
                  </>
                )}
                {unlocated.length > 0 && (
                  <>
                    {located.length > 0 && <h3 className="feed__group">Countywide items</h3>}
                    {/* Said once for the whole group instead of on every card. */}
                    <p className="feed__intro">
                      {unlocated.length === 1
                        ? unlocated[0].reason
                        : `These ${unlocated.length.toLocaleString('en-US')} records have no map location, so each is listed as a countywide item instead of being ranked by distance.`}
                    </p>
                    <ol className="feed feed--countywide">{unlocated.map(item)}</ol>
                  </>
                )}
                {nearest < ranked.length && (
                  <p className="feed__intro nearme__all">
                    <Link to={`${placeHref('/')}${topic ? `?topic=${encodeURIComponent(topic)}` : ''}`}>
                      See all {ranked.length.toLocaleString('en-US')} issues{topic ? ` in ${humanize(topic)}` : ''} on the Countywide page
                    </Link>
                  </p>
                )}
              </div>
            </section>
          </div>
        ))}
    </div>
  );
}

function FeedItem({ ranked, number, selected, onShowOnMap }: { ranked: RankedIssue; number: number | null; selected: boolean; onShowOnMap: () => void }) {
  const href = usePlaceHref();
  const { issue, coords, reason } = ranked;
  return (
    <article className={`feed-item${selected ? ' feed-item--selected' : ''}`} data-issue-id={issue.id} data-topic={issue.category}>
      {number !== null ? (
        <span className="feed-item__num">
          <span className="visually-hidden">Map pin </span>
          {number}
        </span>
      ) : (
        <span className="feed-item__num feed-item__num--none" aria-hidden="true">
          —
        </span>
      )}
      <div className="feed-item__body">
        <div className="card__top">
          <span className="tag tag--topic">{humanize(issue.category)}</span>
          <IssueStatusBadge status={issue.status} />
        </div>
        <h3 className="feed-item__title">
          <Link to={href(`/issues/${encodeURIComponent(issue.id)}`)}>{issue.title}</Link>
        </h3>
        {coords && (
          <p className="feed-item__reason">
            <span className="visually-hidden">Why it’s listed: </span>
            {/* The "distance only" caveat is said once above the list. */}
            {reason.replace(/\s*This is distance only, not a claim that the issue affects this spot\.$/, '')}
          </p>
        )}
        <div className="card__foot">
          {isMock(issue) && <MockBadge record={issue} />}
          {coords && (
            <button type="button" className="button button--small button--ghost" aria-pressed={selected} onClick={onShowOnMap}>
              {selected ? 'Highlighted on map' : 'Show on map'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
