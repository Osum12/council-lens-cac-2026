import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useUrlParams } from '../services/useUrlParams';
import { getMeetings } from '../services/civicData';
import { formatTime, formatWeekdayDate, safeUrl, todayIso } from '../services/format';
import { MeetingStatusBadge } from '../components/StatusBadge';
import { MockBadge, isMock } from '../components/MockBadge';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { useAsync } from '../services/useAsync';
import { usePageTitle } from '../services/usePageTitle';
import { usePlaceHref } from '../services/placeContext';
import type { Meeting } from '../types/civic';

const WEEKDAYS = [
  ['Sun', 'Sunday'],
  ['Mon', 'Monday'],
  ['Tue', 'Tuesday'],
  ['Wed', 'Wednesday'],
  ['Thu', 'Thursday'],
  ['Fri', 'Friday'],
  ['Sat', 'Saturday'],
] as const;

/** "2026-10" → "October 2026". */
const monthLabel = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

/** Moves a "YYYY-MM" month by `step` months. */
export function shiftMonth(month: string, step: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + step, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** The weeks of a month, Sunday first; days outside the month are null. */
export function monthWeeks(month: string): (string | null)[][] {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: first }, () => null),
    ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`),
  ];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

/** "Board of Commissioners Second Regular Meeting, October 21, 2026" → "Second Regular Meeting". */
export const shortMeetingTitle = (title: string) =>
  title.replace(/^Board of Commissioners\s+/, '').replace(/,\s+[A-Z][a-z]+ \d{1,2}, \d{4}$/, '');

export function CalendarPage() {
  usePageTitle('Calendar');
  const href = usePlaceHref();
  const { params, setParam } = useUrlParams();
  const state = useAsync(() => getMeetings(), []);
  const meetings = useMemo(
    () => (state.status === 'ready' ? state.data.filter((m) => m.date).sort((a, b) => `${a.date}${a.startTime ?? ''}`.localeCompare(`${b.date}${b.startTime ?? ''}`)) : []),
    [state],
  );

  // The months with meetings, and the range the calendar can move through: from the first
  // meeting to whichever is later, the last meeting or this month.
  const today = todayIso();
  const byMonth = useMemo(() => {
    const map = new Map<string, Meeting[]>();
    for (const m of meetings) map.set(m.date!.slice(0, 7), [...(map.get(m.date!.slice(0, 7)) ?? []), m]);
    return map;
  }, [meetings]);
  const first = meetings[0]?.date?.slice(0, 7) ?? today.slice(0, 7);
  const lastMeeting = meetings[meetings.length - 1]?.date?.slice(0, 7) ?? today.slice(0, 7);
  const last = lastMeeting > today.slice(0, 7) ? lastMeeting : today.slice(0, 7);
  const asked = params.get('month') ?? '';
  // Opens on this month when it is in range, else on the month of the latest meeting.
  const month = /^\d{4}-\d{2}$/.test(asked) && asked >= first && asked <= last ? asked : today.slice(0, 7) >= first ? today.slice(0, 7) : lastMeeting;
  const goTo = (next: string) => setParam('month', next === today.slice(0, 7) ? null : next);
  const inMonth = byMonth.get(month) ?? [];
  const onDay = (day: string) => inMonth.filter((m) => m.date === day);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Calendar</h1>
        <p className="page-header__lede">Every Board of Commissioners meeting in the records, month by month. Choose a meeting to see its agenda items, documents and recording.</p>
      </header>

      {state.status === 'loading' && <LoadingState rows={5} />}
      {state.status === 'error' && <ErrorState onRetry={state.retry} />}
      {state.status === 'ready' &&
        (meetings.length === 0 ? (
          <EmptyState title="No meetings are in the dataset yet." />
        ) : (
          <section className="calendar" aria-labelledby="cal-month">
            <div className="calendar__bar">
              <button type="button" className="button button--ghost calendar__step" onClick={() => goTo(shiftMonth(month, -1))} disabled={month <= first} aria-label={`Previous month, ${monthLabel(shiftMonth(month, -1))}`}>
                <span aria-hidden="true">←</span>
              </button>
              <h2 id="cal-month" className="calendar__month" aria-live="polite">
                {monthLabel(month)}
              </h2>
              <button type="button" className="button button--ghost calendar__step" onClick={() => goTo(shiftMonth(month, 1))} disabled={month >= last} aria-label={`Next month, ${monthLabel(shiftMonth(month, 1))}`}>
                <span aria-hidden="true">→</span>
              </button>
              <div className="filters__field calendar__jump">
                <label htmlFor="cal-jump">Jump to a month with meetings</label>
                <select id="cal-jump" value={byMonth.has(month) ? month : ''} onChange={(e) => e.target.value && goTo(e.target.value)}>
                  {!byMonth.has(month) && <option value="">{monthLabel(month)} (no meetings)</option>}
                  {[...byMonth.keys()].reverse().map((k) => (
                    <option key={k} value={k}>
                      {monthLabel(k)} ({byMonth.get(k)!.length} {byMonth.get(k)!.length === 1 ? 'meeting' : 'meetings'})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <table className="calendar__grid">
              <caption className="visually-hidden">Board meetings in {monthLabel(month)}</caption>
              <thead>
                <tr>
                  {WEEKDAYS.map(([short, long]) => (
                    <th key={short} scope="col">
                      <abbr title={long}>{short}</abbr>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthWeeks(month).map((week, w) => (
                  <tr key={w}>
                    {week.map((day, d) =>
                      day ? (
                        <td key={day} className={`calendar__day${day === today ? ' calendar__day--today' : ''}${onDay(day).length ? ' calendar__day--meeting' : ''}`}>
                          <span className="calendar__date">
                            {Number(day.slice(8))}
                            {day === today && <span className="calendar__today">Today</span>}
                          </span>
                          {onDay(day).map((m) => (
                            <Link key={m.id} to={href(`/meetings/${encodeURIComponent(m.id)}`)} className="calendar__event">
                              <span className="calendar__event-time">{formatTime(m.startTime) ?? 'Time not set'}</span>
                              <span className="calendar__event-title">{shortMeetingTitle(m.title)}</span>
                            </Link>
                          ))}
                        </td>
                      ) : (
                        <td key={`blank-${w}-${d}`} className="calendar__day calendar__day--blank" aria-hidden="true" />
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            <h3 className="calendar__list-title">
              {inMonth.length ? `${inMonth.length} ${inMonth.length === 1 ? 'meeting' : 'meetings'} in ${monthLabel(month)}` : `No board meetings in the records for ${monthLabel(month)}`}
            </h3>
            {inMonth.length > 0 && (
              <ol className="calendar__list">
                {inMonth.map((m) => (
                  <li key={m.id}>
                    <article className="calendar-item">
                      <p className="calendar-item__when">
                        {formatWeekdayDate(m.date)}
                        {formatTime(m.startTime) && ` · ${formatTime(m.startTime)}`}
                      </p>
                      <h4 className="calendar-item__title">
                        <Link to={href(`/meetings/${encodeURIComponent(m.id)}`)}>{shortMeetingTitle(m.title)}</Link>
                      </h4>
                      <div className="card__foot">
                        <MeetingStatusBadge status={m.status} />
                        <span className="calendar-item__meta">
                          {m.issueIds.length} {m.issueIds.length === 1 ? 'agenda item' : 'agenda items'}
                          {!isMock(m) && safeUrl(m.recordingUrl) ? ' · Recording available' : ''}
                        </span>
                        {isMock(m) && <MockBadge record={m} />}
                      </div>
                    </article>
                  </li>
                ))}
              </ol>
            )}
          </section>
        ))}
    </div>
  );
}
