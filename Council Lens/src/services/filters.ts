// Search and filter helpers for the Citywide issue list and the Archive.
// Pure functions over already-loaded records, so they are easy to test and need no backend.

import type { CivicDocument, Issue, IssueStatus, Meeting } from '../types/civic';
import { formatCompactDate, formatDate, parseIsoDate, todayIso } from './format';

/** Relative date windows. 'upcoming' means today or later; the others look back from today. */
export type DateRange = '' | 'upcoming' | '30d' | '90d' | 'year';

export const DATE_RANGE_LABELS: Record<Exclude<DateRange, ''>, string> = {
  upcoming: 'Upcoming',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  year: 'This year',
};

export const isDateRange = (v: string | null): v is DateRange => v === '' || (v !== null && Object.hasOwn(DATE_RANGE_LABELS, v));

/**
 * True when an ISO date falls in the range, relative to `today` (YYYY-MM-DD).
 * Records with no date never match a date range, since we can't place them in time.
 */
export function inDateRange(iso: string | null, range: DateRange, today = todayIso()): boolean {
  if (!range) return true;
  const date = parseIsoDate(iso);
  const now = parseIsoDate(today);
  if (!date || !now) return false;
  if (range === 'upcoming') return date >= now;
  if (range === 'year') return date.getFullYear() === now.getFullYear() && date <= now;
  const days = range === '30d' ? 30 : 90;
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  return date >= start && date <= now;
}

export type IssueFilterState = { q: string; topic: string; status: string; when: DateRange };

/** Lower-cased words of a query; empty words are dropped. */
const terms = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean);

/** True when every query word appears somewhere in the given fields (case-insensitive). */
export function matchesQuery(q: string, ...fields: (string | null | undefined)[]): boolean {
  const words = terms(q);
  if (!words.length) return true;
  const haystack = fields.filter(Boolean).join(' ').toLowerCase();
  return words.every((w) => haystack.includes(w));
}

/** Issues are dated by `statusAsOf`, the date their current status was established. */
export function filterIssues(issues: Issue[], { q, topic, status, when }: IssueFilterState, today = todayIso()): Issue[] {
  return issues.filter(
    (i) =>
      (!topic || i.category === topic) &&
      (!status || i.status === status) &&
      inDateRange(i.statusAsOf, when, today) &&
      matchesQuery(q, i.title, i.summary, i.category.replace(/_/g, ' '), i.location?.label, i.whyItMayMatter),
  );
}

export const isFiltering = (f: IssueFilterState) => Boolean(f.q.trim() || f.topic || f.status || f.when);

/** Distinct values present in the data, so filters never offer an option with zero results. */
export function topicsIn(issues: Issue[]): string[] {
  return [...new Set(issues.map((i) => i.category))].sort();
}

export function statusesIn(issues: Issue[]): IssueStatus[] {
  return [...new Set(issues.map((i) => i.status))];
}

export const meetingMatches = (m: Meeting, q: string) =>
  matchesQuery(q, m.title, m.summary, m.meetingType.replace(/_/g, ' '), m.date, formatDate(m.date, ''), formatCompactDate(m.date, ''));

export const documentMatches = (d: CivicDocument, q: string) =>
  matchesQuery(q, d.title, d.description, d.documentType.replace(/_/g, ' '), d.sourceName, d.publishedDate);
