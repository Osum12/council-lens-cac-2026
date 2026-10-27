# Council Lens — Civic Data

Council Lens represents a county's dataset in three JSON files: `meetings.json`, `issues.json`, and `documents.json`. Their [common record formats](../docs/DATA_CONTRACT.md) describe meetings, agenda items, decisions, source links, and supporting documents independently of a county's source system. A county integration supplies its own records in those formats.

**Fulton County, Georgia, is the current example included in this repository.** The app loads this one county dataset today. The [county adaptation guide](../docs/PIPELINE_ARCHITECTURE.md#c-adapting-to-another-county) explains how to prepare another county's data and connect it to the app.

## Current example: Fulton County

As of 2026-10-24, the files contain **curated real records** (`dataMode: "curated"`, `mockOnly: false`) from the **Fulton County Board of Commissioners**, covering every Board meeting from January 8, 2025 through October 21, 2026:

- **51 meetings** (all 51 Board meetings in that period: regular, second regular and special called), each with its official meeting page, its agenda PDF, and the meeting recording where one is published (47).
- **1,303 agenda items** ("issues"): every substantive item on those agendas. Left out: adoption of the agenda, ratification of minutes, proclamations and certificates, public comment, closed (executive) sessions, and presentations or discussions where the board decided nothing.
- **4,098 documents**: the 51 agendas and every published attachment of those items (resolutions, agreements, reports, fact sheets, exhibits).

The earlier City of Alpharetta records were removed from the app on 2026-10-22 at the team's request. The fictional fixture pack in `src/test/fixtures/` is used only by the automated tests.

## Sources and interpretation in the current example

The included civic records come from Fulton County's official agenda system, [Legistar](https://fulton.legistar.com/), read through its public web API (`https://webapi.legistar.com/v1/fulton`) on 2026-10-24: events, agenda items with attachments, item histories, and roll-call votes. The scripts that built these files, and the reviewed inputs, are in [scripts/fulton-records/](../scripts/fulton-records/README.md).

The result rules, inclusion criteria, dates, and counts below describe this integration. Another county needs interpretation rules checked against its own meeting procedures and source records.

### Results (statuses)

A result is never inferred from an item being on an agenda. Each comes from the county's record of the meeting:

1. **The motion text.** The clerk records each motion ("A motion was made by … to hold. The motion passed by the following vote"). This wording is used first, because Legistar's separate pass/fail flag contradicts the motion text in 11 places. When several motions were made, a passed approval wins over failed substitute motions or amendments; motions only to add an item to the agenda never decide it.
2. **The consent agenda.** Consent items are enacted by the single motion adopting the consent agenda; the clerk notes "(APPROVED UPON ADOPTION OF THE CONSENT AGENDA)" on each.
3. **The clerk's result note** on the item title ("(APPROVED)", "(HELD)", "(FAILED)"), used where no motion was recorded and checked against the motion text everywhere else. The remaining disagreements (5) are public hearings and presentations where both a hearing and a vote happened; the vote is used.

How results map to app statuses: approved → **Approved** (with "Approved with changes" when the passed motion was an amended or substitute version); a failed motion to approve or a vote to deny → **Denied**; held or tabled → **Under consideration**; filed (closed without approval) or removed from the agenda at a sponsor's request → **Withdrawn**, with the reason in the summary; a public hearing held → **Completed**. One item (26-0364, an elections staffing contract on the June 17, 2026 agenda) has no recorded result and is marked "Status not verified"; the same request appears again as item 26-0397.

Vote counts come from the roll call. Results from the **October 21, 2026** meeting come from the clerk's draft record, which the board is scheduled to ratify on November 4, 2026; those items say so.

### Titles and summaries

- **Titles** are short plain-language names written from each item's official wording. Every number in a title was checked against that wording.
- **169 notable items** (large contracts, budget and tax items, ordinances, and commissioners' resolutions, including most items that failed, were held, filed or withdrawn) have a plain-language summary written from the attached documents. Each fact in those summaries is backed by an exact quote from the county's documents, and every number was re-checked against the sources (amounts like "$2.24 million" are roundings of figures such as $2,239,975.02). Where the documents disagree with each other, the summary leaves the disputed detail out.
- **All other items** show the recorded result and then the agenda's own wording, quoted and labeled as the county's wording (not presented as a rewrite).
- The 24 records from the earlier version of the dataset keep their text; their links were corrected (see below).
- In all, **193 items** have a plain-language explanation: the 169 notable items and the 24 earlier records. The other 1,110 show the county's wording.

### Links

All 5,499 links in these files were opened on 2026-10-24: every document file returned a success (2xx) response; every item page was opened in a browser and shows its own file number; every meeting page shows its date; every recording loads.

Item links are the public site's own links, read from each meeting's official page. (Links built from the API's item IDs open an "Invalid parameters!" page; the 24 earlier records used those and were corrected.)

## Map locations in the current example

162 items quote a street address in their county text (mostly sewer and water easements and private-improvement agreements). Those addresses were looked up with the U.S. Census Bureau geocoder on 2026-10-24; 67 of the 86 distinct addresses matched, which places 120 items. With the 6 earlier hand-placed points (one overlaps), 125 items have a map pin. All pins are `locationType: "approximate"`, `verified: false`. All other items are countywide or have no single address, so they have no pin.

Near Me measures distance from one public place, the Fulton County Government Center (141 Pryor Street SW, Atlanta), also geocoded with the Census geocoder. The app never asks for or stores anyone's own address.

## Known limits of the current example

- Ceremonial and procedural items are left out on purpose (see above).
- Topics (categories) are a reading aid chosen from each item's wording; some items could fit more than one.
- Some county documents disagree with each other or contain typos (for example different amounts in a resolution and its fact sheet). Summaries leave those details out rather than pick one.
- Minutes for the October 21, 2026 meeting were not yet ratified when the data was read.

## Adding or updating a record

These steps apply to records from any county once its integration is connected:

1. Find the item in the county's official meeting or records system and open its item record, agenda, minutes, and attachments where available. For the current example, use [Fulton County Legistar](https://fulton.legistar.com/).
2. Write the summary using only what the documents and the recorded motion say. Distinguish what was discussed from what was decided.
3. Use only URLs you have opened (item links: copy them from the meeting page). Set `lastVerifiedAt` (meetings) and `statusAsOf` (issues).
4. Keep IDs stable and update relationships in both directions (issue ↔ meeting, issue ↔ document, meeting → agenda document).
5. Run `npm run validate:data` and `npm test`.

## Preparing another county's dataset

- Collect that county's official records and map them to the same meeting, issue, and document fields. Preserve source links and relationships; leave unavailable facts as `null` where the contract permits it.
- Check the county's motion language, consent procedure, and result terminology before mapping outcomes to app statuses. Review titles and explanations against that county's documents.
- Use stable IDs within the dataset. If several counties will share a deployment, define dataset boundaries and ID handling so records and relationships cannot cross counties accidentally.
- Use addresses supported by the source material for map points. Configure the county's public starting point and coordinate bounds in the app; the current settings are for Fulton.
- Replace the prepared dataset for a deployment serving one county. To serve several counties together, first extend the data service to select and cache each county's dataset separately.
- Enable the county in coverage settings only after its records are connected and checked. Update the dataset's source notes, counts, verification dates, and county-specific tests.

See the [architecture guide](../docs/PIPELINE_ARCHITECTURE.md#c-adapting-to-another-county) for the source files involved. The reviewed inputs in `scripts/fulton-records/reviewed/` belong to the Fulton example and must be replaced with inputs from the new county when adapting that pipeline.

## Status values

`proposed`, `under_consideration`, `approved`, `denied`, `withdrawn`, `completed`, `unknown`. Only use a status when source evidence supports it.

## Georgia location directory (`georgia/`)

`georgia/directory.json` lists Georgia's 159 counties and 538 incorporated places (cities, towns and consolidated governments). It is geography only and has no civic records. It is generated by `npm run build:directory` from two U.S. Census Bureau files kept unchanged in `georgia/source/`:

- https://www2.census.gov/geo/docs/reference/codes2020/cou/st13_ga_cou2020.txt (counties)
- https://www2.census.gov/geo/docs/reference/codes2020/place/st13_ga_place2020.txt (places, with the counties each one is in)

Census-designated places (unincorporated communities) are left out. The two "(balance)" rows for Athens-Clarke and Augusta-Richmond are kept under the government's name. A place can be in several counties (Atlanta is in DeKalb and Fulton). The list is as of 2020, so places incorporated since then aren't in it yet.

Which places are enabled for civic records is configured in `src/config/coverage.ts`. Fulton County is the current example; other counties and all cities show "Coming soon" pages. The directory makes a place selectable but does not supply its civic records. Another county needs its own connected, verified dataset before coverage is enabled. Expanding outside Georgia also requires a new location directory and updates to state-specific navigation and copy.
