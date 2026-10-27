# Council Lens: Pipeline and Architecture

Council Lens is a React + TypeScript + Vite website for exploring county meetings, proposals, decisions, and supporting documents. Its shared civic record formats, data service, and county-based routes provide a foundation for adapting the app to other counties. Collection and interpretation of government records happen in a separate source-processing layer.

**Fulton County, Georgia, is the first county implementation and the current working example.** Its Board of Commissioners records live in `data/` as three JSON files. A Node.js pipeline in `scripts/fulton-records/` built that dataset from the county's official Legistar records as read on October 24, 2026.

The website reads prepared records; it never runs the pipeline or contacts Legistar. The included data is a snapshot. The current data service loads one county dataset, so adding several counties to one deployment requires county-specific dataset selection and caching.

This document describes the shared architecture, the Fulton example pipeline, how to run the website and rebuild the example dataset, and [how to adapt the app to another county](#c-adapting-to-another-county).

---

## 1. Overview

### 1.1 Shared architecture

```text
Official county meeting and document sources
        |
County source adapter: collect, interpret, link, review, and check
        v
Shared Meeting / Issue / CivicDocument records
        v
Data service: src/services/civicData.ts
        v
County routes, overview, record pages, Near Me, Calendar, and Archive
```

| Layer | Shared foundation | Current example |
| --- | --- | --- |
| Record formats | Meeting, issue, and document fields with source links and ID relationships | Fulton records in `data/`, plus fictional test fixtures |
| Data service | Async lookups, filters, relationships, normalization, and lazy loading | One cached dataset loaded from the three prepared JSON files |
| Place context and routing | `/county/:countyId` routes with county labels and government source names | Fulton enabled in coverage settings; other counties show "Coming soon" |
| Resident interface | County overview, detail pages, search, calendar, archive, and map components | Fulton data, with local defaults and copy that need review for another county |
| Source processing | County records mapped into the common formats before publication | `scripts/fulton-records/`, including Fulton-specific rules and reviewed inputs |
| Geography | Location selection and map display | Georgia directory, Fulton map bounds, and the Fulton County Government Center starting point |

The record formats and data-service interface separate the pages from government portals. Source parsing, county datasets, map settings, and some labels remain specific to the current implementation; they must be adapted and checked for each new county.

### 1.2 Current example: Fulton County pipeline

The detailed flow below documents the scripts included in this repository.

```
 Fulton County Legistar web API              fulton.legistar.com          U.S. Census Bureau
 https://webapi.legistar.com/v1/fulton       (public website)             geocoder
          |                                        |                            |
          v                                        |                            |
  fetch.cjs ---> raw/ (cached API responses)       |                            |
          |                                        |                            |
          v                                        |                            |
  normalize.cjs ---> norm.json                     |                            |
   (one record per agenda item, every              |                            |
    meeting appearance, result per meeting)        |                            |
          |                                        |                            |
          v                                        |                            |
  filter.cjs (in memory: drops ceremonial          |                            |
              and procedural items)                |                            |
          |                                        |                            |
          +--> docs.cjs ---> docs/<file>/*.pdf|docx + .txt                      |
          |      (attachments of the 169 selected items in notable.json)        |
          |    dossiers.cjs ---> summaries/dossiers/*.md, summaries/batch-*.json |
          |    [prepared and reviewed] titles/all.json, summaries/out-*.json    |
          |    checksum.cjs (quote and number checks; prints problems)          |
          |                                        |                            |
          +--> itemlinks.cjs <---------------------+  ---> itemlinks.json       |
          +--> geocode.cjs <----------------------------------------------------+
          |      ---> geocode.json
          |
          v
  build.cjs base ---> out-meetings.json, out-issues.json, out-documents.json
          |
          +--> urlcheck.cjs ---> urlcheck.json    (every link: HTTP status)
          +--> pagecheck.cjs ---> pagecheck.json  (every Legistar page: content check)
          |
          v
  copied to data/meetings.json, data/issues.json, data/documents.json
          |
          v
  src/services/civicData.ts  (lazy dynamic import of the three JSON files)
          |
          v
  pages (src/pages/*.tsx)
```

---

## 2. How the current example pipeline works

All scripts in `scripts/fulton-records/` are CommonJS (`.cjs`) files run with Node.js. They use only Node's built-in modules and the built-in `fetch`, except where noted (`pdftotext`, Python, `playwright-core`). The parsing rules and source details in this section describe the Fulton integration; another county's adapter must be checked against its own records.

### 2.1 Acquisition from the Legistar web API (`fetch.cjs`)

`fetch.cjs` reads Fulton County's public Legistar web API at `https://webapi.legistar.com/v1/fulton`. These are the endpoints it calls:

| Endpoint | Saved to |
| --- | --- |
| `GET /events?$filter=EventDate ge datetime'<from>'&$orderby=EventDate` | `raw/events/list-<from>.json` |
| `GET /events/{EventId}/eventitems?AgendaNote=1&MinutesNote=1&Attachments=1` (for every event) | `raw/items/{EventId}.json` |
| `GET /matters/{MatterId}` (every matter referenced by an agenda item) | `raw/matters/{MatterId}.json` |
| `GET /matters/{MatterId}/histories` | `raw/histories/{MatterId}.json` |
| `GET /eventitems/{EventItemId}/votes` (every item with a roll call, tally or pass/fail flag) | `raw/votes/{EventItemId}.json` |

Every response is written to `raw/` and reused on the next run (a file that exists is never fetched again), so the script can be rerun safely. Requests are retried up to four times with a growing delay, and run four to six at a time.

The `from` date defaults to `2025-01-01` and can be passed as an argument (`node fetch.cjs 2025-01-01`). The later scripts read `raw/events/list-2025-01-01.json` by that exact name, so use the default.

The events list covers every body in Fulton's Legistar. The later scripts keep only events with `EventBodyId === 138`, the Board of Commissioners.

Two things `fetch.cjs` downloads are not used by later steps: `raw/histories/` (matter histories), and an empty `raw/texts/` folder that it creates.

### 2.2 From agenda items to issues (`normalize.cjs`)

Legistar lists each meeting's agenda as event items. An item that is a piece of business carries a matter id and a file number (for example `25-0656`). The same matter often appears at several meetings, for example when it is held at one meeting and voted on at a later one.

`normalize.cjs` groups the agenda rows of every Board meeting by matter id and writes one record per matter to `norm.json`. Each record has:

- the matter's file number, title, agenda section (matter type), requester, Legistar status, and intro/passed dates (from `raw/matters/`);
- an `appearances` list with one entry per meeting where the matter appeared, sorted by date. Each appearance holds the item title as it stood on that agenda, every recorded action (motion text, pass/fail flag, mover, seconder, roll-call tally from `raw/votes/`), the clerk's result notes, and the result worked out for that meeting;
- `outcome` and `outcomeDate`: the result of the latest appearance that has one.

In the finished dataset, each issue keeps the ids of every meeting it appeared at (`meetingIds`), and each meeting lists every issue that appeared on its agenda (`issueIds`). In the current data, 84 issues appear at more than one meeting.

### 2.3 How a result is worked out

A result is never inferred from an item being on an agenda. For each appearance, the script reads the county's record of what happened, in this order.

**1. The motion text first.** The clerk records each motion in words, for example "A motion was made by … to hold. The motion passed by the following vote …". The script reads the motion's verb (approve, adopt, deny, hold, table, file, withdraw, and so on) and whether the text says "motion passed/carried" or "motion failed". Legistar also has a separate pass/fail flag on each action. The flag is used only when the text says neither. The text comes first because the flag and the text disagree in places: the script counts and prints every such conflict, and on the October 24, 2026 run there were 11.

When a meeting has several motions on one item, they are combined in this order of priority:

1. a passed motion to approve, adopt, ratify, nominate, appoint, reappoint or elect gives **approved**. This means a passed approval beats failed substitute motions or failed amendments made before it;
2. otherwise a passed motion to deny or reject gives **denied**;
3. otherwise a passed motion to hold, table or defer gives **held**. A passed motion to hold is a hold. It is never counted as an approval;
4. otherwise a passed motion to file gives **filed** (closed without approval);
5. otherwise a passed motion to withdraw or remove gives **removed**;
6. otherwise a failed motion to approve, adopt or ratify gives **failed**.

Motions recorded as "NO VOTE TAKEN" are ignored. Procedural motions only "to add item # … to the agenda" (or "approve adding item # …") never decide an item.

**2. Fallbacks for the latest appearance.** If no motion decided the item at its latest meeting, the script tries, in order:

- a note that the item was removed or withdrawn "as requested by" a commissioner gives **removed** (being moved off the consent agenda for separate consideration does not count);
- the clerk's result note in the item title, for example "(APPROVED)", "(HELD)", "(FAILED)", "(APPROVED UPON ADOPTION OF THE CONSENT AGENDA)" or "PUBLIC HEARING CONDUCTED". A fixed table of note patterns maps them to results (approved, held, failed, denied, filed, removed, public hearing, discussed, spread on the minutes);
- a consent agenda item with no action of its own, at a meeting whose "Adoption of the Consent Agenda" motion passed, gives **approved** (consent items are enacted by that one motion).

**3. Cross-check.** For every item decided by a motion, the script compares that result with the clerk's note on the final title and prints each disagreement for review. The clerk's notes describe only the latest appearance, so they are not used for earlier ones.

In `build.cjs`, results become app statuses:

| Result | App status | Wording in the issue summary |
| --- | --- | --- |
| approved | `approved` | "Approved [date], [vote]", or "Approved with changes" when the passing motion was amended or a substitute, or the clerk wrote "AS AMENDED". Consent items say "as part of the consent agenda". |
| failed | `denied` | "The motion to approve failed …" with the tally, or "died for lack of a second" |
| denied | `denied` | "The board voted … to deny it." |
| held | `under_consideration` | "Held on … It had not come back for a vote as of the board's October 21, 2026 meeting." |
| filed | `withdrawn` | "… to file this item, which closes it without approving it." |
| removed | `withdrawn` | "Removed from the … agenda at the request of …" |
| public hearing | `completed` | "Public hearing held on …" |
| none | `unknown` | "… the county's record does not show a result." |

If an item has no result and a motion to add it to the agenda failed, it is marked `withdrawn` with that explanation. Earlier holds, failures, removals and denials are listed in an "Earlier: …" sentence. Vote counts come from the roll-call records.

The October 21, 2026 meeting was the latest one in the snapshot, and its minutes had not yet been ratified. Every item and meeting whose result comes from that meeting says that the result is from the clerk's draft record.

### 2.4 Filtering ceremonial and procedural items (`filter.cjs`)

`filter.cjs` loads `norm.json` and keeps only substantive items. It does not write a file. `geocode.cjs` and `build.cjs` load it as a module and use its `keep` list. Run on its own, it prints counts of what it kept and dropped.

It drops:

- these agenda sections: Executive Session, Commissioners Presentation/Discussion, CM Presentation;
- items whose titles match adoption of the agenda, ratification of minutes, proclamations and certificates, public comment, call to order, roll call, invocation, pledge, closed executive sessions, and "No action is requested";
- items whose only result is "discussed" or "spread on the minutes";
- presentations and discussions, unless the board approved, failed, denied, held or filed something on them.

`build.cjs` adds back any item that one of the 24 earlier records refers to, even if the filter dropped it.

### 2.5 Short titles and selected plain-language explanations

**Short titles.** Every kept item has a short, plain-language title and one topic in `titles/all.json` (1,303 entries, keyed by file number). The titles were prepared from each item's official wording only, with no outcome in the title, and every number in a title was checked against that wording. `text.cjs` has deterministic helpers that clean the clerk's notes off official titles, find commissioner sponsors, amounts and street addresses, and propose rule-based short titles and categories.

There is no script in this repository that creates the title input batches or merges the finished batches into `titles/all.json`. That step was done outside the scripts, and the reviewed file is kept in `scripts/fulton-records/reviewed/titles/all.json`. `build.cjs` also applies two hand corrections (`TITLE_FIX` and `CATEGORY_FIX`).

**Selected plain-language explanations.** 169 items, listed by file number in `notable.json`, have a plain-language explanation of 2 to 4 sentences, plus an optional "why it may matter" sentence. They cover large contracts, budget and tax items, ordinances, commissioners' resolutions, and most items that failed, were held, filed or withdrawn. No script selects the list; it was chosen item by item.

The steps were:

1. `docs.cjs` downloads the published attachments of those 169 items (up to 8 per item, PDF and DOCX only) into `docs/<file>/`, and extracts their text to a `.txt` file beside each one. PDFs use `pdftotext -layout -l 40` (first 40 pages). DOCX files are read by a short Python snippet that unzips `word/document.xml`.
2. `dossiers.cjs` writes one Markdown file per item to `summaries/dossiers/<file>.md`. Each file holds the official wording, sponsors, meeting history, motions and votes, and the paths of the extracted texts. It also splits the 169 file numbers into six batch lists, `summaries/batch-1.json` to `batch-6.json`.
3. The explanations were written from those sources into `summaries/out-1.json` to `out-6.json`. Each entry has `description`, `whyItMayMatter`, and an `evidence` list of facts, each with an exact quote and its source. The explanations do not state the outcome, because the app adds the result itself from the record.
4. `checksum.cjs` re-checks every explanation. It prints problems and does not change any file.

**What `checksum.cjs` checks, and its limits.**

- Each evidence quote must appear in the item's official title or extracted document text. Whitespace and letter case are ignored.
- Each number in the description and "why it may matter" text must appear in the same sources, with or without thousands separators. A rounded amount followed by "million" or "billion" (for example "$5.65 million" for $5,650,169.00) is accepted when its leading digits appear in a source figure. This is a loose match: it confirms the digits, not that the rounding is correct, so rounded amounts were also checked separately against the source figures.
- A description fails if it states an outcome (for example "was approved", "voted", "motion passed") or is longer than 650 characters.

The check cannot confirm that a sentence's meaning matches its quote. It only confirms that the quoted words and the numbers exist in the sources. Explanations exist for these 169 selected items and for the 24 earlier records (193 in all). For every other item, the app shows the recorded result followed by the county's own agenda wording, quoted and labeled as such.

### 2.6 Supporting documents

`build.cjs` makes a document record for:

- each Board meeting's agenda PDF (`EventAgendaFile`), linked to that meeting and to every issue on it; and
- every attachment of a kept item that Legistar marks as shown on the public site (`MatterAttachmentShowOnInternetPage`). It is linked to its issue and to the meeting of the item's latest decided appearance.

Each attachment's document type (resolution, ordinance, presentation, fact sheet, report, agreement, map, letter, financial document, or supporting document) is guessed from its file name. Documents are de-duplicated by id. The earlier document records keep their ids, titles, types and descriptions.

### 2.7 Public-source links (`itemlinks.cjs`, `urlcheck.cjs`, `pagecheck.cjs`)

The web API's matter ids are not the item ids used by the public website. A `LegislationDetail.aspx?ID=…` link built from an API id opens an "Invalid parameters!" page on fulton.legistar.com. So item links come from the public site itself.

- `itemlinks.cjs` opens each Board meeting's public page (`EventInSiteURL`) in Microsoft Edge through `playwright-core`. It records every `LegislationDetail.aspx` link whose text is a file number, in `itemlinks.json` (`byEvent` and `byFile`). It notes whether a meeting's grid has a pager, but does not page through it. In the saved file, none of the 51 meetings was paged.
- `build.cjs` uses the first link for each file number as the issue's source URL, and stops with an error if an item has none. It also translates any API-id links found in the earlier records into the site's own links, and stops if one cannot be translated.
- Meeting pages are the API's `EventInSiteURL`. Recording links are built from `EventMedia` and the site's id, in the same form the public site uses.

After the build, two scripts check the links. Both cache their results and on a rerun check only links that previously failed.

- `urlcheck.cjs` requests every URL in the three output files. Document files are requested with `Range: bytes=0-0`. A link passes on a 2xx response. For Legistar item, meeting and video pages, the response body must also not contain "Invalid parameters", "An error has occurred" or "Page not found".
- `pagecheck.cjs` opens every item, meeting and recording page in Edge. It passes a page only if it returns HTTP 200, has at least 200 characters of text, and does not show "Invalid parameters". Item pages must also show their own file number, and meeting pages their date (M/D/YYYY).

According to `data/README.md`, all 5,499 links in the committed data passed on October 24, 2026. Links can stop working later if the county changes its site.

### 2.8 Approximate map locations (`geocode.cjs`)

`text.cjs` finds a street address in an item's cleaned official wording only when it is written in full, with street number, street type, city, "Georgia" or "GA", and a ZIP code. `geocode.cjs` sends each distinct address to the U.S. Census Bureau geocoder (`geocoding.geo.census.gov/geocoder/locations/onelineaddress`, benchmark `Public_AR_Current`). It keeps the first match only if the matched address is in Georgia. Results, including misses, are cached in `geocode.json`. The current file has 86 addresses, 67 of them matched.

`build.cjs` gives a matched item a location with `locationType: "approximate"` and `verified: false`. These are approximate pins for an address quoted in the record. They are not surveyed parcel locations.

### 2.9 Building the dataset (`build.cjs`)

`node build.cjs base` combines `norm.json`, the filter's `keep` list, `titles/all.json`, `summaries/out-*.json`, `geocode.json`, `itemlinks.json`, the cached `raw/` files, and the earlier records in the folder given as the argument (`base/`, a copy of `reviewed/base/`: 24 issues, 8 meetings, 18 documents).

It writes three files next to the scripts:

- `out-meetings.json`: one record per Board meeting, with an id such as `meeting-2026-10-21-boc` (`-evening` or `-2` when there are two on one day), the start time, official page, recording link, agenda document, issue ids, and a count of results;
- `out-issues.json`: one record per kept item, with id `issue-<file number>` (or `issue-m<matterId>` when the file number is malformed), short title, topic, summary, status, `statusAsOf`, meeting and document ids, location, source URL;
- `out-documents.json`: agendas and attachments.

The earlier records keep their ids, titles, summaries and locations. An earlier record's status changes only if a later meeting shows a different result, and the script prints "STATUS CHANGED" when that happens. Any earlier record that could not be rebuilt is printed, never silently dropped.

Every record is written with `dataMode: "curated"` and `mockOnly: false`, and meetings get `lastVerifiedAt`.

Some dates are written into `build.cjs` as constants. A new rebuild must update them: `VERIFIED = '2026-10-24'`, `LATEST_MEETING = '2026-10-21'`, and the November 4, 2026 ratification date in the draft-record sentences.

The three `out-*.json` files are then copied to `data/meetings.json`, `data/issues.json` and `data/documents.json`. No script does this step.

### 2.10 Frontend integration

- The pages (`src/pages/*.tsx`) and a few components never import the JSON directly. They call the async functions in `src/services/civicData.ts`, for example `getMeetings`, `getIssueById`, `getIssuesForMeeting`, `getDocumentsForIssue`, `searchRecords` and `getDatasetInfo`.
- `civicData.ts` loads the three files with dynamic `import('../../data/*.json')` the first time a page asks for data, and caches the result. Vite emits each file as its own chunk (`meetings-*.js`, `issues-*.js`, `documents-*.js` in `dist/assets/`), so pages that don't show records never download them. The Near Me page, which uses Leaflet, is also loaded lazily (`React.lazy` in `src/App.tsx`).
- On load, the service normalizes every row. Missing arrays become empty arrays, and unknown statuses become `unknown`. A row is treated as real only if it has both `dataMode: "curated"` and `mockOnly: false`. Any other row is treated as mock, and its links are removed. In development, unresolved ids between records are logged.
- Record shapes are defined in `src/types/civic.ts` and `docs/DATA_CONTRACT.md`. The fictional records in `src/test/fixtures/` are used only by the automated tests.

---

## A. Running the website from the committed data

The website needs only Node.js and npm. It does not need Python, Poppler, a browser automation library or network access to county systems.

**Prerequisites**

- Node.js 22.12 or later (Vite 8 requires `^20.19.0 || >=22.12.0`). To run the tests, use Node.js 22.22.2 or later on the 22 line, 24.15 or later, or 26 or later: the jsdom 30 test environment requires one of these. `package.json` has no `engines` field, so npm will only warn on an older version.
- npm (the one that ships with Node.js). Dependencies are pinned by `package-lock.json`.

**Commands** (from `Council Lens/`)

| Command | What it does |
| --- | --- |
| `npm ci` | Installs the exact dependency versions from `package-lock.json`. |
| `npm run dev` | Starts the Vite development server. |
| `npm run build` | Type-checks (`tsc --noEmit`) and builds the static site into `dist/`. |
| `npm run preview` | Serves the built `dist/` locally. |
| `npm test` | Runs the Vitest test suite (jsdom). |
| `npm run validate:data` | Runs only the data-integrity tests (`src/services/dataIntegrity.test.ts`) against `data/`. |
| `npm run typecheck` | TypeScript check only. |
| `npm run lint` | ESLint. |
| `npm run build:directory` | Rebuilds `data/georgia/directory.json` (Georgia counties and places, geography only) from the Census files in `data/georgia/source/`. Not needed to run the site. |

---

## B. Rebuilding the dataset from government sources

These instructions rebuild the included Fulton County example. For another county, first adapt the source integration and app settings described in [section C](#c-adapting-to-another-county). The supplied reviewed inputs, caches, source identifiers, and dates belong to Fulton.

**Status.** The full rebuild has not been re-run end to end from a clean machine for this release. The committed `data/` files were built on October 24, 2026 from the inputs kept in `scripts/fulton-records/reviewed/`. Spot checks show that those inputs match the committed data: all 169 explanations, and every title except the 24 kept earlier records and the listed title corrections. But county records change, so a new rebuild will produce a newer snapshot, not an identical one. Do not run these steps inside `data/`. Review all output before copying it there.

### B.1 Prerequisites

| Needed for | Requirement | How the scripts use it |
| --- | --- | --- |
| All scripts | Node.js 18 or later (built-in `fetch`, `AbortSignal.timeout`). Node 22.12+ is fine and matches section A. | No npm packages, except `playwright-core` below. |
| `docs.cjs` (PDF text) | `pdftotext` from Poppler, on `PATH` | Called as `pdftotext -layout -l 40 <file> -`. |
| `docs.cjs` (DOCX text) | Python 3, on `PATH` as `python` | Called as `python -I -c …`; uses only the standard library (`zipfile`, `re`). Needed only if a selected item has a DOCX attachment. No other script uses Python. |
| `itemlinks.cjs`, `pagecheck.cjs` | `playwright-core` and Microsoft Edge (installed normally) | `chromium.launch({ channel: 'msedge' })`. `playwright-core` is **not** in `package.json`. The scripts load it from a fixed relative path: `<working folder>/../pw/node_modules/playwright-core`. |
| `fetch.cjs`, `docs.cjs`, `geocode.cjs`, `urlcheck.cjs` | Internet access to `webapi.legistar.com`, `fulton.legistar.com` and `geocoding.geo.census.gov` | |

Installing `playwright-core` where the scripts expect it. A plain `npm i playwright-core` in the working folder is not enough, because the path is fixed to a sibling folder named `pw`:

```sh
# from the folder that CONTAINS your working folder
mkdir pw
cd pw
npm init -y
npm i playwright-core
```

Microsoft Edge must be installed. No Playwright browser download is needed.

### B.2 Working-folder layout

Each script reads its inputs from its own folder (`__dirname`), and `build.cjs` also reads the `base` folder relative to the current directory. Run the scripts from a working folder outside the repository, with this layout:

```
<parent>/
  pw/node_modules/playwright-core/      # see B.1
  work/                                 # run every command from here
    fetch.cjs normalize.cjs filter.cjs text.cjs docs.cjs dossiers.cjs
    checksum.cjs itemlinks.cjs geocode.cjs build.cjs urlcheck.cjs pagecheck.cjs
    notable.json                        # from reviewed/notable.json
    titles/all.json                     # from reviewed/titles/all.json
    summaries/out-1.json … out-6.json   # from reviewed/summaries/
    itemlinks.json                      # from reviewed/itemlinks.json (optional; see below)
    geocode.json                        # from reviewed/geocode.json (optional; see below)
    base/issues.json meetings.json documents.json   # from reviewed/base/
    raw/ docs/                          # filled by fetch.cjs and docs.cjs
```

Inputs each script reads:

| Script | Reads (relative to the working folder) |
| --- | --- |
| `fetch.cjs` | nothing (network only) |
| `normalize.cjs` | `raw/events/list-2025-01-01.json`, `raw/items/`, `raw/matters/`, `raw/votes/` |
| `filter.cjs` | `norm.json` |
| `docs.cjs` | `notable.json`, `raw/items/` |
| `dossiers.cjs` | `text.cjs`, `norm.json`, `notable.json`, `docs/` |
| `checksum.cjs` | `text.cjs`, `norm.json`, `summaries/out-*.json`, `docs/` |
| `itemlinks.cjs` | `raw/events/list-2025-01-01.json`, `itemlinks.json` if present, `../pw/node_modules/playwright-core` |
| `geocode.cjs` | `text.cjs`, `filter.cjs` (so `norm.json`), `geocode.json` if present |
| `build.cjs` | `text.cjs`, `filter.cjs`, `norm.json`, `raw/`, `titles/all.json`, `summaries/out-*.json`, `geocode.json` (optional), `itemlinks.json`, and `<arg>/issues.json`, `<arg>/meetings.json`, `<arg>/documents.json` |
| `urlcheck.cjs` | `out-issues.json`, `out-meetings.json`, `out-documents.json`, `urlcheck.json` if present |
| `pagecheck.cjs` | `out-issues.json`, `out-meetings.json`, `itemlinks.json`, `pagecheck.json` if present, `../pw/node_modules/playwright-core` |

`itemlinks.cjs` and `geocode.cjs` skip anything already in their cache file. To re-read every meeting page or re-look-up every address, start without those files. To add only new meetings or addresses, start with the reviewed copies.

Pass `base` (the 24 earlier records), not the current `data/` folder, to `build.cjs`. If you pass `data/`, every current record would be treated as an earlier record and kept unchanged.

### B.3 Order of steps

Run from the working folder:

| # | Command | Output files | Manual review |
| --- | --- | --- | --- |
| 1 | `node fetch.cjs` | `raw/events/list-2025-01-01.json`, `raw/items/*.json`, `raw/matters/*.json`, `raw/histories/*.json`, `raw/votes/*.json` | |
| 2 | `node normalize.cjs` | `norm.json` | Yes: read the printed flag-versus-text conflicts, motion-versus-clerk-note disagreements, items with no result, and unmatched clerk notes. |
| 3 | `node filter.cjs` | none (prints counts and items with no result) | Yes: check what was kept and dropped. |
| 4 | `node docs.cjs` | `docs/<file>/<attachmentId>.pdf\|.docx` and `.txt` | Yes: check the printed download and extraction failures. |
| 5 | `node dossiers.cjs` | `summaries/dossiers/<file>.md`, `summaries/batch-1.json` … `batch-6.json` | |
| 6 | (prepared outside the scripts) | `titles/all.json`, `summaries/out-1.json` … `out-6.json` | Yes: prepared and reviewed against the sources. Needed only for new or changed items; the reviewed files can be reused. `notable.json` is also chosen item by item, not by a script. |
| 7 | `node checksum.cjs` | none (prints problems) | Yes: fix every reported problem; check rounded amounts against the source figures. |
| 8 | `node itemlinks.cjs` | `itemlinks.json` | Yes: check the printed per-meeting counts, and any meeting marked PAGED. |
| 9 | `node geocode.cjs` | `geocode.json` | |
| 10 | `node build.cjs base` | `out-meetings.json`, `out-issues.json`, `out-documents.json` | Yes: check "STATUS CHANGED" and "NOT REBUILT" lines. First update `VERIFIED`, `LATEST_MEETING` and the ratification date in `build.cjs`. |
| 11 | `node urlcheck.cjs` | `urlcheck.json` | Yes: every link must pass. |
| 12 | `node pagecheck.cjs` | `pagecheck.json` | Yes: every page must pass. |
| 13 | copy the files | `out-meetings.json` → `data/meetings.json`, `out-issues.json` → `data/issues.json`, `out-documents.json` → `data/documents.json` | Yes: then run `npm run validate:data` and `npm test`, and update the counts and dates in `data/README.md`. |

Steps 4 to 7 depend on step 2. Step 8 must finish before step 10, because `build.cjs` stops if any kept item has no public link. Steps 11 and 12 need step 10's output.

---

## C. Adapting to another county

The shared record formats and resident-facing features are the starting point. Connecting another county requires its official records, source interpretation, and local settings. Use a separate working folder and caches for each source integration.

### C.1 Connect and interpret official records

For another Legistar source, inspect its API and public pages before adapting the Fulton scripts. For a different records portal, implement acquisition and mapping code for that portal while keeping the same output record formats.

| Integration point | Current implementation | Work for another county |
| --- | --- | --- |
| Official source | `fetch.cjs` uses `webapi.legistar.com/v1/fulton` | Connect the county's official meeting and document sources and confirm access, response fields, and completeness. |
| Meeting selection | `normalize.cjs`, `itemlinks.cjs`, and `build.cjs` select body `138` and read a fixed event-list path | Set the correct body identifiers, date range, and input paths consistently. |
| Outcomes and inclusion | `normalize.cjs`, `filter.cjs`, and `text.cjs` interpret Fulton motion text and agenda sections | Check consent procedures, motions, deferrals, withdrawals, result terminology, and inclusion criteria against the new county's records. |
| Public links and documents | `itemlinks.cjs`, `build.cjs`, `urlcheck.cjs`, and `pagecheck.cjs` handle the Fulton portal and recording URLs | Resolve the new source's public links, document types, site identifiers, and page-content checks. |
| Reviewed content | `reviewed/` contains Fulton titles, explanations, evidence, earlier records, links, and geocoding results | Prepare county-specific inputs and review them against that county's sources. |
| Geography and dates | `text.cjs` and `geocode.cjs` assume Georgia addresses; `build.cjs` embeds verification and meeting dates | Adapt address extraction, geographic checks, source names, verification dates, and any draft-minutes wording. |

### C.2 Supply the shared dataset

Produce meetings, issues, and documents using the [shared data contract](DATA_CONTRACT.md). Keep IDs stable, relationships resolvable, official links attached, and unavailable facts explicit. Check every status against a recorded action; an item's presence on an agenda is not an approval.

For a deployment serving one county, its prepared dataset can replace the three files in `data/`, together with matching app settings. For several counties in one deployment, extend `src/services/civicData.ts` to select and cache records by county before enabling more coverage. The current service has one loader and one cached dataset; route context alone does not filter that dataset. Define how IDs and relationships stay within each county, and update types and fixtures if the schema changes.

### C.3 Configure the county experience

| App area | Files to review | County-specific changes |
| --- | --- | --- |
| Coverage and government labels | `src/config/coverage.ts`, `src/services/placeContext.ts` | Connect records first, then enable the county and set its government name and meeting place. |
| Location directory | `data/georgia/directory.json`, `src/services/jurisdictions.ts`, and the location chooser | Use the existing directory for Georgia counties. Beyond Georgia, supply a matching directory and update state-specific navigation and copy. |
| Map and proximity | `src/services/nearMe.ts`, `src/components/IssueMap.tsx`, `src/pages/NearMePage.tsx` | Configure public starting coordinates, coordinate bounds, map defaults, and local labels. Keep approximate pins labeled as approximate. |
| Routes and page content | `src/config/coverage.ts`, `src/App.tsx`, `src/pages/`, and `src/components/` | Review legacy redirects, county-specific wording, source links, and page defaults for the new deployment. |
| Validation | `src/services/*.test.ts`, `src/pages/*.test.tsx`, and component tests | Update county-specific expectations and verify that unavailable locations do not show another county's records. |

### C.4 Review and publish

Review source facts, outcome mapping, record relationships, official links, and map locations. Run `npm run validate:data`, `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` after adapting the code and data. For a deployment with several counties, also verify that switching counties cannot reuse the previous county's cached records or resolve its record IDs.

Update dataset notes with the government source, coverage period, counts, verification date, and known limits. Check record pages, map behavior, and direct links in the deployed app. See the [repository README](../../README.md#hosting) for hosting configuration.

---

## Current implementation limits

- **A snapshot, not live.** The data is what Legistar showed on October 24, 2026. The app does not update itself. New meetings appear only after a rebuild like the one in section B.
- **One current county integration.** The included example covers the Fulton County Board of Commissioners (January 8, 2025 to October 21, 2026: 51 meetings, 1,303 issues, 4,098 documents). Other counties need their own source integration and dataset. City government records are not included, and the Georgia location directory supplies geography only.
- **One dataset at a time.** County routes and coverage settings are shared foundations, but the data service does not yet select separate county datasets. Serving several counties together requires the service changes described in section C.
- **Draft results for the latest meeting.** Results from October 21, 2026 come from the clerk's draft record, which was not yet ratified. The app says so on those records.
- **Approximate pins.** Map points come from addresses quoted in the records, matched by the Census geocoder. They are approximate and unverified. Most items have no single address and so no pin.
- **Explanations for selected items only.** 193 items have a plain-language explanation (169 selected items plus the 24 earlier records). Every other item shows its result and the county's own wording.
- **Rule-based interpretation.** Results, filtering and document types come from pattern rules over the clerk's wording. Unusual wording can be misread. The cross-check output helps with this, but it is not a guarantee.
- **Rebuild not re-tested end to end** on a clean machine for this release (see section B).

## Possible future work

These are ideas only. None of them is implemented.

- A scheduled rebuild with a review step before new data is published.
- Making `playwright-core` an optional dev dependency, with a configurable path instead of `../pw`.
- Reading the `from` date and the dates in `build.cjs` from arguments instead of constants.
- Paging through meeting grids in `itemlinks.cjs`, if the county's pages start to use paging.
- Additional county source integrations, each with its own verified dataset and local settings.
- County-specific dataset selection and caching for a deployment serving several counties together.
