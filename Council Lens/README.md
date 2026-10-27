# Council Lens

A student project for the Congressional App Challenge 2026, Council Lens helps residents follow local government meetings, proposals, decisions, and public documents, with a path back to the official sources.

The app uses shared meeting, issue, and document formats, a common data service, and county-based routes as a foundation for adapting it to other counties. **Fulton County, Georgia, is the first county implementation and the working example included here.** The [repository overview](../README.md#adapting-council-lens-to-another-county) describes the steps for connecting another county's records.

> **Current example:** `data/` holds records from the Fulton County Board of Commissioners: 51 meetings between January 8, 2025 and October 21, 2026, 1,303 substantive agenda items, 4,098 documents, and 47 meeting recordings. There are 125 approximate map pins derived from street addresses with the U.S. Census Bureau geocoder. Links were checked on October 24, 2026. This is a prepared snapshot, rebuilt with the scripts in `scripts/fulton-records/`; see `data/README.md`.

> **Location availability:** The chooser lists all 159 Georgia counties and 538 incorporated cities, towns, and consolidated governments. Fulton County is the only county with civic records in this version. Other counties and all cities show a "Coming soon" page. Adding another county requires its own verified dataset, source processing, geographic settings, and validation; serving several counties together also requires county-specific dataset selection.

The route descriptions below document the included Fulton County implementation.

## Features

| Page | Route | What it does |
|---|---|---|
| Georgia home | `/` | Location chooser: county (all 159), then an optional city or town filtered to that county, with "All of <county>" first. The selection is kept in the URL (`/?county=fulton`), so refresh and Back keep it, and changing the county clears the city. Shows no records. |
| Other counties | `/county/:countyId` | "Coming soon" on every sub-path (e.g. `/county/cobb/archive?q=…`), with links to the cities and towns in the county. No records. Unknown ids show "Location not found". |
| Cities | `/:cityId/*` | Every city shows "Coming soon" on every sub-path; cities in Fulton County point to the Fulton County page. No records. |
| Countywide (Fulton) | `/county/fulton` | Cover hero ("What's on the table in Fulton County") with an issue search and a panel showing the next meeting (when one is scheduled) and the latest decision; issues grouped by result, with keyword search and topic and status filters (kept in the URL, e.g. `/county/fulton?topic=transportation&status=approved`); issue and meeting lists are labelled "From the Fulton County Board of Commissioners"; each issue card links to its official record and, when it has a map point, to Near Me with that issue selected; upcoming and recent meetings with agenda PDF links. |
| Issue detail | `/county/fulton/issues/:issueId` | Plain-language summary (labelled as a rewrite of the sources), status with its "as of" date, why it may matter, a dated timeline of related meetings, documents with direct PDF links, official sources, location with "View on map". |
| Near Me | `/county/fulton/near-me` | The 20 issues nearest one fixed public starting point, the Fulton County Government Center, sorted by straight-line distance; the app never asks for an address. A category filter narrows the list. A Leaflet map shows pins only for issues with coordinates; these are approximate points looked up from addresses in county documents, and the map labels them that way. Choosing a pin highlights the matching list item, and the reverse. Every item says why it's listed. |
| Calendar | `/county/fulton/calendar` | A month grid of every Board meeting in the records, with previous/next month buttons, a "Jump to a month with meetings" menu (`?month=`), and a list of that month's meetings. |
| Archive | `/county/fulton/archive` | Meetings and documents in one list, with keyword search (`?q=`) and type filters for All, Videos, Agendas and Documents (`?type=`), shown 40 at a time; rows link straight to recordings and PDFs. |
| Meeting detail | `/county/fulton/meetings/:meetingId` | Date and time, recording and official-page links when they exist, agenda and documents, related issues. |
| Document detail | `/county/fulton/documents/:documentId` | Description, source, parent meeting, related issues, and the original file link when one exists. |

Honesty rules built into the code:
- Any mock record shows a "Sample data" badge, and a site-wide banner appears unless every loaded record is confirmed curated. With the current real data, neither appears.
- A missing or invalid URL is never rendered as a link. Mock records never carry links, which the data service enforces.
- The app never asks for, stores or logs anyone's address. Near Me always starts from the same public place.
- Distance is described as distance only, never as an impact claim. Issues with no location stay in the list without a pin.
- Status comes straight from the data. Unknown values display as "Status not verified".

The original links (`/archive`, `/near-me`, `/calendar`, `/issues/…`, `/meetings/…`, `/documents/…`) redirect to the same page under `/county/fulton`, keeping their query string, and so do old filtered links to `/` (e.g. `/?topic=…`).

A light/dark theme toggle sits in the header.

Future extensions include additional county integrations, live data updates, accounts, and notifications. Each county integration needs its own official sources and reviewed records.

## Tech stack

- [React](https://react.dev) 19 + TypeScript, built with [Vite](https://vite.dev)
- [React Router](https://reactrouter.com) for routes
- [Leaflet](https://leafletjs.com) with Esri World Street Map tiles for the map (no API key)
- [Vitest](https://vitest.dev) + Testing Library + jsdom for tests, ESLint for linting
- Fonts: Bricolage Grotesque (headings) and Atkinson Hyperlegible Next (text) from Google Fonts; the wordmark is outlined from Outfit

There is no backend, database, API key or secret.

## Run it locally

Prerequisites: Node.js 22.12 or newer to run the app, and npm. The tests need Node.js 22.22+, 24.15+ or 26+ (required by jsdom 30).

```bash
cd "Council Lens"
npm ci
npm run dev          # opens on http://localhost:5173
```

| Command | Purpose |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm test` | Run all tests once |
| `npm run validate:data` | Check the dataset in `data/` (and the test fixtures) against the data contract |
| `npm run build:directory` | Rebuild `data/georgia/directory.json` from the Census files in `data/georgia/source/` |
| `npm run typecheck` | TypeScript type check |
| `npm run lint` | ESLint |
| `npm run build` | Typecheck and production build into `dist/` |
| `npm run preview` | Serve the production build locally |

The map background needs internet access. Without it, the app shows a notice and the list keeps working.

## How the code is organized

```text
data/                 meetings.json, issues.json, documents.json (Fulton County records)
  georgia/            directory.json (counties and municipalities) built from source/ (Census files)
scripts/
  build-georgia-directory.mjs   Builds data/georgia/directory.json
  fulton-records/     The pipeline that built the Fulton County data from Legistar (see its README)
src/
  config/coverage.ts  The one list of counties that have civic records, and their sources (Fulton: Board of Commissioners)
  types/civic.ts      Shared Meeting / Issue / CivicDocument types (matches docs/DATA_CONTRACT.md)
  services/
    civicData.ts      Loads prepared records; list, lookup and relationship functions shared by pages
    nearMe.ts         The public starting point, coordinate validation, distance ranking and explanations
    format.ts         Date/label formatting, safe URL checking, source-link naming
    filters.ts        Keyword/topic/status matching used by Countywide, Near Me and Archive
    useAsync.ts       Loading / error / retry state for data requests
    jurisdictions.ts  Georgia counties and municipalities joined with coverage; lookups and labels
    placeContext.ts   The covered county the current page belongs to, county-scoped links, record-source names
    useUrlParams.ts   URL search-param updates that don't lose quick changes, and search boxes that follow the URL
  components/         Layout, cards, badges, status labels, map, empty/error states,
                      LocationSelector (county → city), PlaceScope (the gate in front of every county page; cities show Coming Soon)
  pages/              One file per route (e.g. CitywidePage.tsx for Countywide, NearMePage.tsx, CalendarPage.tsx, ArchivePage.tsx)
  styles/global.css   Design tokens (light and dark) and all styles
```

Data flows one way: **page → `civicData.ts` → prepared JSON records**. Record pages render inside `CountyScope`, which checks `src/config/coverage.ts`; locations without coverage do not load records. The data service gives pages a shared interface that a different source adapter can supply. Today it loads one county dataset; serving several counties together requires extending loading and caching to isolate each county's records. Map bounds, the public starting point, county-specific copy, defaults, and tests also need review when adapting the app.

## Adding or updating records

Follow `data/README.md`. In short, for each record:

1. Open the official source and check every field yourself.
2. Write each field from what the source says. Add only URLs you have opened.
3. Set `dataMode: "curated"`, `mockOnly: false`, and `lastVerifiedAt` (meetings) or `sourceUrls` (issues).
4. Add coordinates only if the source supports them. Otherwise set `location` to `null`.
5. Run `npm run validate:data` and `npm test`.

## Testing

`npm test` runs the whole suite: 9 test files, 130 tests. Most use the fictional fixture pack in `src/test/fixtures/`, so they don't depend on which real records are in `data/`:
- data integrity for both the real records and the fixtures: unique IDs, relationships that resolve, provenance flags, valid statuses and dates, URL and coordinate rules
- a check that the real data renders with no sample labels and that every issue card's official-record link points to the county's Legistar site
- search and filter behavior, the calendar, hero actions, map links, the issue timeline, and archive search
- data-service behavior: lookups, malformed rows, load errors and retry
- Near Me ranking
- map accessibility with real Leaflet
- page flows for every route, including empty, error and not-found states
- the Georgia directory against the Census source files (159 counties, every active incorporated place, multi-county cities)
- the location chooser, Coming Soon pages, redirects, Back/Forward, and that no place except the Fulton County page shows or loads any record

## Project documents

- [`docs/PIPELINE_ARCHITECTURE.md`](docs/PIPELINE_ARCHITECTURE.md): how the record-processing pipeline turns the county's records into the app's dataset, and how to run the site or rebuild the data
- [`docs/DATA_CONTRACT.md`](docs/DATA_CONTRACT.md): the meeting, issue and document record formats
- [`data/README.md`](data/README.md): what the dataset contains, how results were determined, and its limits
- [`scripts/fulton-records/README.md`](scripts/fulton-records/README.md): the pipeline scripts, step by step

## Credits and open-source software

| What | Used for |
|---|---|
| [React](https://react.dev) and React DOM | User interface |
| [React Router](https://reactrouter.com) | Routes and URLs |
| [Leaflet](https://leafletjs.com) | The Near Me map |
| [Vite](https://vite.dev) with `@vitejs/plugin-react` | Development server and build |
| [TypeScript](https://www.typescriptlang.org) | Type checking |
| [Vitest](https://vitest.dev), [Testing Library](https://testing-library.com) (React, jest-dom, user-event), [jsdom](https://github.com/jsdom/jsdom) | Tests |
| [ESLint](https://eslint.org) with typescript-eslint and eslint-plugin-react-hooks | Linting |
| Esri World Street Map | Map tiles (attribution shown on the map) |
| Bricolage Grotesque, Atkinson Hyperlegible Next ([Google Fonts](https://fonts.google.com)) | Headings and body text |
| Outfit (SIL Open Font License 1.1) | Outlined for the Council Lens wordmark |
| Fulton County Legistar: public web API (`webapi.legistar.com/v1/fulton`) and public site ([fulton.legistar.com](https://fulton.legistar.com)) | Meetings, agenda items, documents, recordings and links |
| U.S. Census Bureau geocoder | Approximate map points from street addresses in county documents, and the Near Me starting point |
| [Playwright](https://playwright.dev), Microsoft Edge, Poppler `pdftotext`, Python | Record pipeline only: reading public meeting pages, link checks, and extracting text from county PDFs and DOCX files |
| U.S. Census Bureau 2020 FIPS reference files for Georgia counties and places (`data/georgia/source/`) | The Georgia county and municipality directory |

