# Shared Civic Data Contract

This document defines the shared meeting, issue, and document formats that county integrations supply to Council Lens. The fields describe civic records and their relationships independently of the source portal used by a county.

**Fulton County, Georgia, is the current example:** its Board of Commissioners records are in `data/`. Fictional records in `src/test/fixtures/` exercise the same formats. Another county can supply its own records through a source adapter that maps into these fields; see the [county adaptation guide](PIPELINE_ARCHITECTURE.md#c-adapting-to-another-county).

All features use these shared fields. A change to the record shape must update this contract, `src/types/civic.ts`, and the fixtures together.

## County integration boundaries

- The current data service loads and caches one county dataset. Record types do not currently include a county ID; the active county comes from route and place context.
- A deployment serving one county can use that county's prepared records with matching coverage, geography, and source settings.
- Serving several counties together requires extending dataset selection and caching so each route receives only its county's records. Coverage settings alone do not isolate data.
- Keep IDs stable and unique within each record type in a dataset. For several datasets, scope lookups and relationships to the selected county or introduce namespaced IDs; any schema change must be reflected in the types, service, fixtures, and tests.
- Map local motion and status terminology to the shared status values using evidence from that county's records. The Fulton pipeline's parsing rules are an example implementation, not a universal interpretation of meeting procedures.

## Data-mode rules

- `dataMode: "mock"` and `mockOnly: true`: fictional test data. Must have visible MOCK / SAMPLE identification.
- `dataMode: "curated"` and `mockOnly: false`: data taken from an original official source and checked against it (see the [pipeline architecture](PIPELINE_ARCHITECTURE.md)). `lastVerifiedAt` or equivalent verification metadata should be populated where applicable.
- A live/API mode must not be introduced until there is a real integration. Never use a `live` label just because the UI is interactive.

## Meeting

```ts
export type Meeting = {
  id: string;
  title: string;
  meetingType: string;
  date: string | null;       // ISO YYYY-MM-DD
  startTime: string | null;  // HH:mm when known
  status: string;
  summary: string | null;
  officialPageUrl: string | null;
  recordingUrl: string | null;
  agendaDocumentIds: string[];
  issueIds: string[];
  dataMode: "mock" | "curated";
  mockOnly: boolean;
  lastVerifiedAt: string | null;
};
```

## Issue

```ts
export type IssueStatus =
  | "proposed"
  | "under_consideration"
  | "approved"
  | "denied"
  | "withdrawn"
  | "completed"
  | "unknown";

export type Issue = {
  id: string;
  title: string;
  category: string;
  summary: string;
  status: IssueStatus;
  statusAsOf: string | null;
  meetingIds: string[];
  documentIds: string[];
  location: {
    label: string | null;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    locationType: "verified" | "approximate" | "mock_marker" | "unknown";
    verified: boolean;
  } | null;
  whyItMayMatter: string | null;
  sourceUrls: string[];
  dataMode: "mock" | "curated";
  mockOnly: boolean;
  featured: boolean;
};
```

## Document

```ts
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
  dataMode: "mock" | "curated";
  mockOnly: boolean;
};
```

## Repository/service API

Implement names according to the project's language conventions, but retain equivalent capabilities:

```ts
getMeetings(filters?)
getMeetingById(id)
getIssues(filters?)
getIssueById(id)
getDocuments(filters?)
getDocumentsForMeeting(meetingId)
getIssuesForMeeting(meetingId)
getRelatedIssuesForDocument(documentId)
searchRecords(query)
```

Near Me ranks issues by straight-line distance from one fixed public starting point. It never asks for or geocodes anyone's address. The current example uses the Fulton County Government Center. An adapted county integration must configure its own public starting point and coordinate bounds in `src/services/nearMe.ts`; these settings are separate from the record formats.

## Data rules

1. IDs are stable and unique within their entity type.
2. Relationships are by ID, not duplicated nested records.
3. Null means unavailable/unknown; do not substitute invented values.
4. Only records with valid numeric latitude and longitude can create map markers.
5. A location marked `mock_marker` or a record marked mock must have a visible mock label.
6. A status must be supported by source evidence before a record is marked curated.
7. Never use agenda inclusion alone as evidence that an item was approved.
8. URLs must come from verified source material; do not construct guessed official links.
9. Keep fixture changes and this contract synchronized.
