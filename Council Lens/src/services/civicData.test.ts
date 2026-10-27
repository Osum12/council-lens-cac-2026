import {
  getDatasetInfo,
  getDocumentsForIssue,
  getDocumentsForMeeting,
  getIssueById,
  getIssues,
  getIssuesForMeeting,
  getMeetingById,
  getMeetings,
  getRelatedIssuesForDocument,
  searchRecords,
  setDataLoader,
  type Dataset,
} from './civicData';
import type { Issue } from '../types/civic';
import { mockLoader } from '../test/mockDataset';

// Tests run against the fictional fixture pack, not the real records in /data.
beforeEach(() => setDataLoader(mockLoader));
afterEach(() => setDataLoader(null));

describe('civicData service (JSON fixtures)', () => {
  it('lists records and looks them up by ID', async () => {
    expect((await getMeetings()).length).toBeGreaterThan(0);
    expect((await getIssueById('issue-mock-001'))?.title).toMatch(/Pedestrian/);
    expect(await getIssueById('does-not-exist')).toBeNull();
    expect(await getMeetingById('nope')).toBeNull();
  });

  it('sorts meetings newest first and filters by fields', async () => {
    const dates = (await getMeetings()).map((m) => m.date);
    expect(dates).toEqual([...dates].sort().reverse());
    expect((await getIssues({ featured: true })).every((i) => i.featured)).toBe(true);
    expect((await getIssues({ category: 'transportation' })).map((i) => i.id)).toEqual(['issue-mock-001', 'issue-mock-005']);
  });

  it('resolves relationships by ID', async () => {
    expect((await getDocumentsForMeeting('meeting-mock-002')).map((d) => d.id).sort()).toEqual(['document-mock-002', 'document-mock-003']);
    expect((await getIssuesForMeeting('meeting-mock-001')).map((i) => i.id)).toEqual(['issue-mock-001', 'issue-mock-002']);
    expect((await getRelatedIssuesForDocument('document-mock-001')).map((i) => i.id)).toEqual(['issue-mock-001', 'issue-mock-002']);
    expect((await getDocumentsForIssue('issue-mock-002')).map((d) => d.id).sort()).toEqual(['document-mock-001', 'document-mock-005']);
  });

  it('reports that the current dataset is all mock', async () => {
    const info = await getDatasetInfo();
    expect(info.containsMock).toBe(true);
    expect(info.mockRecords).toBe(info.totalRecords);
  });

  it('searches local text fields', async () => {
    expect((await searchRecords('corridor')).map((r) => r.record.id)).toContain('issue-mock-005');
    expect(await searchRecords('   ')).toEqual([]);
  });
});

describe('civicData service (defensive behavior)', () => {
  const issue = (over: Partial<Issue>): Issue => ({
    id: 'i1',
    title: 'T',
    category: 'c',
    summary: 's',
    status: 'proposed',
    statusAsOf: null,
    meetingIds: [],
    documentIds: [],
    location: null,
    whyItMayMatter: null,
    sourceUrls: [],
    dataMode: 'curated',
    mockOnly: false,
    featured: false,
    ...over,
  });

  it('tolerates missing related records and malformed rows', async () => {
    const bad = { ...issue({ meetingIds: ['ghost'] }), documentIds: undefined, status: 'maybe' } as unknown as Issue;
    setDataLoader(async () => ({ meetings: [], issues: [bad], documents: [] }));
    const loaded = await getIssueById('i1');
    expect(loaded?.documentIds).toEqual([]);
    expect(loaded?.status).toBe('unknown');
    expect(await getDocumentsForIssue('i1')).toEqual([]);
  });

  it('treats records with inconsistent provenance flags as mock', async () => {
    setDataLoader(async () => ({ meetings: [], issues: [issue({ dataMode: 'curated', mockOnly: true })], documents: [] }));
    expect((await getIssueById('i1'))?.dataMode).toBe('mock');
  });

  it('never exposes links on mock records', async () => {
    setDataLoader(async () => ({
      meetings: [],
      issues: [issue({ dataMode: 'mock', mockOnly: true, sourceUrls: ['https://example.org/looks-official'] })],
      documents: [],
    }));
    expect((await getIssueById('i1'))?.sourceUrls).toEqual([]);
  });

  it('surfaces load errors and allows a retry', async () => {
    let calls = 0;
    setDataLoader(async (): Promise<Dataset> => {
      calls += 1;
      if (calls === 1) throw new Error('offline');
      return { meetings: [], issues: [], documents: [] };
    });
    await expect(getIssues()).rejects.toThrow('offline');
    expect(await getIssues()).toEqual([]);
  });
});
