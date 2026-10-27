import type { IssueStatus } from '../types/civic';
import { ISSUE_STATUS_LABELS, meetingStatusLabel } from '../services/format';

// Each status gets a shape glyph as well as a color, so status is never conveyed by color alone.
const GLYPHS: Record<IssueStatus, string> = {
  proposed: '○',
  under_consideration: '◐',
  approved: '●',
  denied: '✕',
  withdrawn: '–',
  completed: '✓',
  unknown: '?',
};

export function IssueStatusBadge({ status }: { status: IssueStatus }) {
  const s = status in ISSUE_STATUS_LABELS ? status : 'unknown';
  return (
    <span className={`status status--${s}`}>
      <span aria-hidden="true" className="status__glyph">
        {GLYPHS[s]}
      </span>
      {ISSUE_STATUS_LABELS[s]}
    </span>
  );
}

export function MeetingStatusBadge({ status }: { status: string }) {
  const known = ['scheduled', 'completed', 'canceled'].includes(status) ? status : 'unknown';
  return <span className={`status status--meeting-${known}`}>{meetingStatusLabel(status)}</span>;
}
