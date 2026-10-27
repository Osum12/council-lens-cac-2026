# County Records Pipeline — Fulton Example

This folder contains the first county source integration for Council Lens. These scripts built `data/meetings.json`, `data/issues.json`, and `data/documents.json` from Fulton County's official Legistar records on October 24, 2026. They demonstrate how county records can be collected and mapped to the app's [shared civic data contract](../../docs/DATA_CONTRACT.md).

**Fulton County is the current working example.** The scripts include its API endpoint, governing-body ID, source wording, dates, and geographic assumptions. They can serve as a starting point for another county integration, with changes for that county's sources and procedures. The app itself reads the prepared dataset; it does not run these scripts or fetch live government records.

Full details (how results are worked out, prerequisites, the exact working-folder layout, step order and what needs manual review) are in [docs/PIPELINE_ARCHITECTURE.md](../../docs/PIPELINE_ARCHITECTURE.md). The full rebuild has not been re-run end to end from a clean machine for this release.

They were run from a working folder with this layout, and expect it: the scripts side by side, `notable.json`, `titles/all.json`, `summaries/out-*.json`, `itemlinks.json`, `geocode.json` and `base/` next to them, and a `raw/` cache that `fetch.cjs` fills. The reviewed inputs are kept in `reviewed/`; copy them into place before running `build.cjs`. Prerequisites: Node.js 18 or later; `pdftotext` (Poppler) and Python 3 (DOCX attachments only) for `docs.cjs`; Microsoft Edge and `playwright-core` for `itemlinks.cjs` and `pagecheck.cjs`. `playwright-core` is not in the app's `package.json`; the two scripts load it from `../pw/node_modules/playwright-core`, a folder named `pw` beside the working folder (`mkdir pw && cd pw && npm init -y && npm i playwright-core`).

| Step | Script | What it does |
| --- | --- | --- |
| 1 | `fetch.cjs` | Downloads events from January 1, 2025 on (later steps keep only the Board of Commissioners, body 138), agenda items (with attachments), matters, matter histories and roll-call votes from `https://webapi.legistar.com/v1/fulton` into `raw/` (cached). |
| 2 | `normalize.cjs` | One record per agenda item with every meeting appearance. Works out each meeting's result from the clerk's motion text ("to hold. The motion passed…"), which is more reliable than the pass/fail flag; a passed approval wins over failed substitutes and amendments; procedural motions ("to add item … to the agenda") never decide an item. Consent items take the result of the adopted consent agenda. The clerk's result note on the title ("(APPROVED)", "(HELD)") is the fallback and a cross-check. |
| 3 | `filter.cjs` | Keeps substantive items; drops agenda adoption, minutes ratification, proclamations, public comment, closed sessions, and presentations or discussions with no decision. |
| 4 | `docs.cjs`, `dossiers.cjs` | Downloads the attachments (PDF and DOCX, up to 8 per item) of the items listed in `reviewed/notable.json` (169 file numbers selected by these criteria: large contracts, budget and tax items, ordinances, commissioners' resolutions, and most items that failed, were held, filed or withdrawn; see `data/README.md`), extracts their text, and writes one source file per item (`summaries/dossiers/<file>.md`) and six batch lists for preparing the explanations. |
| 5 | Prepared and reviewed (outside the scripts) | `reviewed/titles/all.json`: a short title and topic for every item, written from the official wording only; every number in a title was checked against the source. `reviewed/summaries/out-*.json`: plain-language explanations for the 169 selected items, each fact backed by an exact quote from the county's documents. No script produces these files. |
| 6 | `checksum.cjs` | Re-check of the explanations (prints problems, changes nothing): quotes exist in their sources, numbers occur in the sources (rounded amounts such as "$5.65 million" are matched only by their leading digits, so they were also checked separately), no explanation states an outcome. |
| 7 | `itemlinks.cjs` | Reads each meeting's official page on fulton.legistar.com and records the public link for every item. The public site's item IDs differ from the API's, so links built from API IDs open an "Invalid parameters!" page. |
| 8 | `geocode.cjs` | Looks up street addresses quoted in item text with the U.S. Census Bureau geocoder (approximate pins). |
| 9 | `build.cjs base` | Writes `out-meetings.json`, `out-issues.json` and `out-documents.json`, which are then copied to `data/meetings.json`, `data/issues.json` and `data/documents.json`. The dates `VERIFIED`, `LATEST_MEETING` and the ratification date are constants in the script and must be updated for a new rebuild. `base/` (kept in `reviewed/base`) holds the 24 records the app had before this import; they are kept with IDs unchanged, and any that cannot be rebuilt are reported. |
| 10 | `urlcheck.cjs`, `pagecheck.cjs` | Opens every link: files must return 2xx; item pages must show their own file number, meeting pages their date, recordings must not be an error page. |

## Adapting the example pipeline

Keep the output meeting, issue, and document formats shared with the app, and adapt the source-facing steps to the county being connected:

| Area | What to adapt |
| --- | --- |
| Acquisition | The official source endpoint, meeting-body identifiers, date range, and cached input paths in `fetch.cjs`, `normalize.cjs`, `itemlinks.cjs`, and `build.cjs`. A portal other than Legistar needs its own acquisition and mapping code. |
| Interpretation | Motion wording, consent rules, result fallbacks, agenda sections, and inclusion criteria in `normalize.cjs`, `filter.cjs`, and `text.cjs`. Validate them against the county's recorded actions. |
| Reviewed inputs | County-specific titles, selected items, explanations, evidence, earlier records, public links, and geocoding results. Prepare a separate working folder and cache for the new county. |
| Output and links | Source names, recording-link formats and site identifiers, verification dates, draft-result wording, document types, and link checks in `build.cjs`, `urlcheck.cjs`, and `pagecheck.cjs`. |
| Geography | Address extraction and state-match rules in `text.cjs` and `geocode.cjs`; configure map bounds and a public starting point separately in the app. |

The supplied `reviewed/` files are inputs for the Fulton example, not template records to relabel. After producing and reviewing another county's dataset, connect it to the data service and update coverage, location settings, and county-specific tests. Serving several counties together also requires dataset selection and cache isolation in the app.

See [Adapting to another county](../../docs/PIPELINE_ARCHITECTURE.md#c-adapting-to-another-county) for the full integration steps. The existing rebuild instructions above reproduce the Fulton workflow; changing only the API URL is not sufficient for another county.
