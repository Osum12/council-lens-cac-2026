import { filterIssues, isFiltering, matchesQuery, meetingMatches, statusesIn, topicsIn } from './filters';
import { mockDataset } from '../test/mockDataset';

const issues = mockDataset.issues;

describe('filters', () => {
  it('matches every query word, case-insensitively, across fields', () => {
    expect(matchesQuery('ROAD study', 'Sample Road Corridor Study')).toBe(true);
    expect(matchesQuery('road park', 'Sample Road Corridor Study')).toBe(false);
    expect(matchesQuery('   ', 'anything')).toBe(true);
    expect(matchesQuery('x', null, undefined)).toBe(false);
  });

  it('combines keyword, topic, and status', () => {
    expect(filterIssues(issues, { q: '', topic: 'transportation', status: '', when: '' }).map((i) => i.id)).toEqual(['issue-mock-001', 'issue-mock-005']);
    expect(filterIssues(issues, { q: '', topic: 'transportation', status: 'proposed', when: '' }).map((i) => i.id)).toEqual(['issue-mock-005']);
    expect(filterIssues(issues, { q: 'land-use', topic: '', status: '', when: '' }).map((i) => i.id)).toEqual(['issue-mock-003']);
    expect(filterIssues(issues, { q: 'zoning', topic: '', status: '', when: '' }).map((i) => i.id)).toContain('issue-mock-003'); // category text is searchable
  });

  it('only offers topics and statuses that exist in the data', () => {
    expect(topicsIn(issues)).toEqual(['community_planning', 'development_and_zoning', 'parks_and_public_spaces', 'transportation']);
    expect(statusesIn(issues).sort()).toEqual(['proposed', 'under_consideration', 'unknown']);
    expect(isFiltering({ q: ' ', topic: '', status: '', when: '' })).toBe(false);
  });
});

describe('date ranges', () => {
  const today = '2026-10-22';
  it('handles each range, including boundaries', async () => {
    const { inDateRange } = await import('./filters');
    expect(inDateRange('2026-10-22', 'upcoming', today)).toBe(true);
    expect(inDateRange('2026-10-21', 'upcoming', today)).toBe(false);
    expect(inDateRange('2026-09-22', '30d', today)).toBe(true); // exactly 30 days back
    expect(inDateRange('2026-09-21', '30d', today)).toBe(false);
    expect(inDateRange('2026-10-27', '30d', today)).toBe(false); // future is not "last 30 days"
    expect(inDateRange('2026-07-24', '90d', today)).toBe(true);
    expect(inDateRange('2026-01-01', 'year', today)).toBe(true);
    expect(inDateRange('2025-12-31', 'year', today)).toBe(false);
    expect(inDateRange(null, '30d', today)).toBe(false); // undated records can't match a range
    expect(inDateRange(null, '', today)).toBe(true);
  });

  it('accepts only known range values from the URL', async () => {
    const { isDateRange } = await import('./filters');
    expect(isDateRange('30d')).toBe(true);
    expect(isDateRange('')).toBe(true);
    expect(isDateRange('constructor')).toBe(false);
    expect(isDateRange('7d')).toBe(false);
    expect(isDateRange(null)).toBe(false);
  });

  it('filters issues by when their status was set', () => {
    // Fixture statusAsOf dates: Oct 12, Oct 12, Oct 15, null, Oct 20 (2026).
    expect(filterIssues(issues, { q: '', topic: '', status: '', when: '30d' }, today).map((i) => i.id)).toEqual([
      'issue-mock-001',
      'issue-mock-002',
      'issue-mock-003',
      'issue-mock-005',
    ]);
    expect(filterIssues(issues, { q: '', topic: '', status: '', when: '30d' }, '2026-12-30')).toEqual([]);
  });
});

describe('meeting search', () => {
  it('finds a meeting by its date as people write it', () => {
    const m = { ...mockDataset.meetings[0], date: '2026-10-26' };
    for (const q of ['2026-10-26', 'October 26', 'Oct 26', 'oct 26, 2026']) expect(meetingMatches(m, q)).toBe(true);
    expect(meetingMatches(m, 'Oct 27')).toBe(false);
  });
});
