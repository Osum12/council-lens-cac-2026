// Shared record types for county source integrations. Current example: Fulton County.
// Source of truth: docs/DATA_CONTRACT.md. Update the contract, prepared records in /data,
// and fictional fixtures in src/test/fixtures together when these types change.

export type DataMode = 'mock' | 'curated';

export type MeetingStatus = 'scheduled' | 'completed' | 'canceled' | 'unknown';

export type Meeting = {
  id: string;
  title: string;
  meetingType: string;
  date: string | null; // ISO YYYY-MM-DD
  startTime: string | null; // HH:mm when known
  status: string; // normally a MeetingStatus; unexpected values display as "unknown"
  summary: string | null;
  officialPageUrl: string | null;
  recordingUrl: string | null;
  agendaDocumentIds: string[];
  issueIds: string[];
  dataMode: DataMode;
  mockOnly: boolean;
  lastVerifiedAt: string | null;
};

export type IssueStatus =
  | 'proposed'
  | 'under_consideration'
  | 'approved'
  | 'denied'
  | 'withdrawn'
  | 'completed'
  | 'unknown';

export type LocationType = 'verified' | 'approximate' | 'mock_marker' | 'unknown';

export type IssueLocation = {
  label: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  locationType: LocationType;
  verified: boolean;
};

export type Issue = {
  id: string;
  title: string;
  category: string;
  summary: string;
  status: IssueStatus;
  statusAsOf: string | null;
  meetingIds: string[];
  documentIds: string[];
  location: IssueLocation | null;
  whyItMayMatter: string | null;
  sourceUrls: string[];
  dataMode: DataMode;
  mockOnly: boolean;
  featured: boolean;
};

export type CivicDocument = {
  id: string;
  title: string;
  documentType: string;
  meetingId: string | null;
  issueIds: string[];
  publishedDate: string | null;
  url: string | null;
  description: string | null;
  sourceName: string | null;
  dataMode: DataMode;
  mockOnly: boolean;
};

/** Anything carrying provenance flags; used by the shared mock indicator. */
export type ProvenancedRecord = { dataMode: DataMode; mockOnly: boolean };

export type LatLng = { latitude: number; longitude: number };
