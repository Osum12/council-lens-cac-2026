// Validates JSON records against docs/DATA_CONTRACT.md: the real records in /data
// and the fictional test fixtures. Run with `npm run validate:data` after editing data.

import meetings from '../../data/meetings.json';
import issues from '../../data/issues.json';
import documents from '../../data/documents.json';
import { mockDataset } from '../test/mockDataset';
import { findBrokenRelationships, type Dataset } from './civicData';
import type { CivicDocument, Issue, Meeting } from '../types/civic';

const realDataset: Dataset = { meetings: meetings as Meeting[], issues: issues as Issue[], documents: documents as CivicDocument[] };

const STATUSES = ['proposed', 'under_consideration', 'approved', 'denied', 'withdrawn', 'completed', 'unknown'];
const MEETING_STATUSES = ['scheduled', 'completed', 'canceled', 'unknown'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isHttpUrl = (u: string) => {
  try {
    return ['http:', 'https:'].includes(new URL(u).protocol);
  } catch {
    return false;
  }
};

describe.each([
  ['data/ (records shown in the app)', realDataset],
  ['test fixtures (fictional)', mockDataset],
])('%s', (_name, { meetings: M, issues: I, documents: D }) => {
  const ALL = [...M, ...I, ...D];

  it('has unique IDs within each record type', () => {
    for (const list of [M, I, D]) {
      const ids = list.map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('has no unresolved relationship IDs', () => {
    expect(findBrokenRelationships({ meetings: M, issues: I, documents: D })).toEqual([]);
  });

  it('keeps relationships consistent in both directions', () => {
    for (const issue of I) {
      for (const mid of issue.meetingIds) expect(M.find((m) => m.id === mid)?.issueIds).toContain(issue.id);
      for (const did of issue.documentIds) expect(D.find((d) => d.id === did)?.issueIds).toContain(issue.id);
    }
    // agendaDocumentIds lists agenda items only; other attachments link via document.meetingId.
    for (const meeting of M) {
      for (const did of meeting.agendaDocumentIds) expect(D.find((d) => d.id === did)?.meetingId).toBe(meeting.id);
    }
  });

  it('marks provenance consistently, and curated rows carry verification evidence', () => {
    for (const r of ALL) {
      expect(['mock', 'curated']).toContain(r.dataMode);
      expect(r.mockOnly).toBe(r.dataMode === 'mock');
    }
    for (const m of M.filter((x) => x.dataMode === 'curated')) {
      expect(m.lastVerifiedAt).not.toBeNull();
      expect(m.officialPageUrl ?? m.recordingUrl).not.toBeNull();
    }
    for (const i of I.filter((x) => x.dataMode === 'curated')) expect(i.sourceUrls.length).toBeGreaterThan(0);
    for (const d of D.filter((x) => x.dataMode === 'curated')) expect(d.url).not.toBeNull();
  });

  it('uses only contract statuses', () => {
    for (const i of I) expect(STATUSES).toContain(i.status);
    for (const m of M) expect(MEETING_STATUSES).toContain(m.status);
  });

  it('uses ISO dates or null', () => {
    for (const m of M) {
      if (m.date !== null) expect(m.date).toMatch(ISO_DATE);
      if (m.lastVerifiedAt !== null) expect(m.lastVerifiedAt).toMatch(ISO_DATE);
    }
    for (const i of I) if (i.statusAsOf !== null) expect(i.statusAsOf).toMatch(ISO_DATE);
    for (const d of D) if (d.publishedDate !== null) expect(d.publishedDate).toMatch(ISO_DATE);
  });

  it('has only null or valid http(s) URLs, and mock rows have no URLs at all', () => {
    const urls = (r: Meeting | Issue | CivicDocument) =>
      'recordingUrl' in r ? [r.recordingUrl, r.officialPageUrl] : 'sourceUrls' in r ? r.sourceUrls : [r.url];
    for (const r of ALL) {
      for (const u of urls(r)) {
        if (u === null) continue;
        expect(isHttpUrl(u)).toBe(true);
        expect(r.dataMode).not.toBe('mock'); // mock records must never carry real-looking links
      }
    }
  });

  it('only uses numeric coordinates, and never marks mock or approximate points as verified', () => {
    for (const i of I) {
      if (!i.location) continue;
      const { latitude, longitude, locationType, verified } = i.location;
      expect(latitude === null || Number.isFinite(latitude)).toBe(true);
      expect(longitude === null || Number.isFinite(longitude)).toBe(true);
      if (locationType !== 'verified') expect(verified).toBe(false);
      if (i.dataMode === 'mock') expect(verified).toBe(false);
    }
  });
});

