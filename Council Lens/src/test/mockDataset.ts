// The original fictional fixture pack, kept for tests only so the test suite
// does not depend on whichever real records are in /data.
import meetings from './fixtures/mock-meetings.json';
import issues from './fixtures/mock-issues.json';
import documents from './fixtures/mock-documents.json';
import type { Dataset } from '../services/civicData';
import type { CivicDocument, Issue, Meeting } from '../types/civic';

export const mockDataset: Dataset = {
  meetings: meetings as Meeting[],
  issues: issues as Issue[],
  documents: documents as CivicDocument[],
};

export const mockLoader = async (): Promise<Dataset> => structuredClone(mockDataset);
