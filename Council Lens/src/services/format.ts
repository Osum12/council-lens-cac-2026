// Display helpers shared across pages. Dates in the data are ISO YYYY-MM-DD;
// they are parsed as local calendar dates so they never shift a day by timezone.

import type { IssueStatus } from '../types/civic';

/** Today as a local YYYY-MM-DD string (matches how dates are stored in the data). */
export function todayIso(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function parseIsoDate(iso: string | null): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(iso: string | null, fallback = 'Date not provided'): string {
  const d = parseIsoDate(iso);
  return d ? d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : fallback;
}

/** "Oct 26, 2026": compact form for tight spaces like meeting cards. */
export function formatCompactDate(iso: string | null, fallback = 'Date not provided'): string {
  const d = parseIsoDate(iso);
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : fallback;
}

export function formatShortDate(iso: string | null): { month: string; day: string } | null {
  const d = parseIsoDate(iso);
  return d ? { month: d.toLocaleDateString('en-US', { month: 'short' }), day: String(d.getDate()) } : null;
}

export function formatTime(hhmm: string | null): string | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Turns data identifiers like "development_and_zoning" into "Development and zoning". */
export function humanize(value: string | null | undefined): string {
  if (!value) return 'Not specified';
  const text = value.replace(/[_-]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const MEETING_TYPE_LABELS: Record<string, string> = {
  city_council: 'City Council',
  planning_commission: 'Planning Commission',
  board_of_commissioners: 'Board of Commissioners',
  other_public_meeting: 'Public meeting',
};
export const meetingTypeLabel = (t: string) => MEETING_TYPE_LABELS[t] ?? humanize(t);

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  proposed: 'Proposed',
  under_consideration: 'Under consideration',
  approved: 'Approved',
  denied: 'Denied',
  withdrawn: 'Withdrawn',
  completed: 'Completed',
  unknown: 'Status not verified',
};

const MEETING_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  completed: 'Held',
  canceled: 'Canceled',
};
export const meetingStatusLabel = (s: string) => MEETING_STATUS_LABELS[s] ?? 'Status unknown';

const AGENDA_QUOTE = /^The agenda describes it as: “([\s\S]*)”$/;

/**
 * An issue summary is one or more paragraphs (blank-line separated). A paragraph written as
 * `The agenda describes it as: “…”` is the county's own wording, quoted, not a rewrite.
 */
export function summaryParts(summary: string | null | undefined): { prose: string[]; agendaQuote: string | null } {
  const paras = (summary ?? '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const quoteAt = paras.findIndex((p) => AGENDA_QUOTE.test(p));
  return {
    prose: paras.filter((_, i) => i !== quoteAt),
    agendaQuote: quoteAt >= 0 ? paras[quoteAt].match(AGENDA_QUOTE)![1] : null,
  };
}

/** Only http(s) URLs are ever rendered as links; anything else is treated as unavailable. */
export function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

export function formatWeekday(iso: string | null): string | null {
  const d = parseIsoDate(iso);
  return d ? d.toLocaleDateString('en-US', { weekday: 'short' }) : null;
}

/** Names a source link by where it points, so readers know what they will open. */
export function sourceLabel(url: string, index = 0): string {
  if (/legistar\.com\/LegislationDetail\.aspx/.test(url)) return 'Item record on the county’s Legistar site';
  if (/legistar\.com\/MeetingDetail\.aspx/.test(url)) return 'Meeting page on the county’s Legistar site';
  if (/legistar1\.com\/.*\.pdf$/i.test(url)) return 'Official document (PDF)';
  if (/portal\.civicclerk\.com\/event\//.test(url)) return 'Meeting page on the city’s portal';
  if (/civicclerk\.com\/.*GetMeetingFileStream/.test(url)) return 'Official meeting document (PDF)';
  return `Official source ${index + 1}`;
}

/** Prefers a direct official document over a portal page as the single "primary" source. */
export function primarySource(urls: string[]): string | null {
  const valid = urls.map(safeUrl).filter((u): u is string => Boolean(u));
  return valid.find((u) => /GetMeetingFileStream/.test(u)) ?? valid[0] ?? null;
}

/** "Monday, October 26": for headline-style dates where the year is implied. */
export function formatWeekdayDate(iso: string | null): string {
  const d = parseIsoDate(iso);
  return d ? d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : 'Date to be announced';
}
