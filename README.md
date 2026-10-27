# Council Lens

**From public records to public understanding.**

Council Lens brings local government meetings, proposals, decisions, and supporting documents into one searchable place. It helps residents follow what their county is working on, understand recorded outcomes, and open the official sources behind each record.

The project is built around shared civic record formats, county-based navigation, and a separate data-processing layer. This provides a foundation for adapting Council Lens to other counties by connecting their official records and configuring their local geography.

**Fulton County, Georgia, is the first county implementation and the working example included in this repository.** It demonstrates the full path from government records to a resident-facing website.

Built for the Congressional App Challenge 2026.

**[Explore Council Lens](https://osum12.github.io/council-lens-cac-2026/)**

![Council Lens home page](Council%20Lens/docs/images/home.png)

## What residents can do

| Feature | What it offers |
|---|---|
| County overview | Browse proposals and decisions, grouped by recorded outcome, with keyword, topic, and status filters. |
| Issue pages | Follow an item's result, related meetings, explanations where available, supporting documents, and official source links. |
| Near Me | Explore mapped issues and their straight-line distance from a fixed public starting point, without sharing a personal address. |
| Calendar | Find board meetings by month and open their agendas and related records. |
| Archive | Search meetings, recordings, agendas, and supporting documents. |
| Location chooser | Choose a county and optional city or town, with clear availability for each location. |

The app includes light and dark themes, layouts for phones and desktops, and keyboard navigation.

<p>
  <img src="Council%20Lens/docs/images/issue.png" alt="An issue page showing a recorded decision, an explanation, and official sources" width="49%">
  <img src="Council%20Lens/docs/images/near-me.png" alt="Near Me showing mapped county issues and a numbered list" width="49%">
</p>

## A foundation for other counties

The interface works with three shared record types: **meetings, issues, and documents**. Source collection and processing happen separately from the pages residents use.

| Part | How it supports adaptation |
|---|---|
| Shared data contract | Defines common fields and relationships for meetings, agenda items, outcomes, documents, and source links. |
| Data service | Gives pages one interface for loading and querying records, separate from the government source system. |
| County-based routes | Organizes pages under `/county/:countyId`, with county labels and source names supplied through place context. |
| Coverage settings | Identifies which counties have records ready to display. |
| Record-processing scripts | Demonstrates how one county's official records can be collected, interpreted, linked, and checked before publication. |

### Adapting Council Lens to another county

1. **Connect the county's official sources.** Adapt the existing Legistar pipeline or write a source adapter for the county's meeting portal, agendas, minutes, and document system. Outcome rules and link handling need to match that source.
2. **Prepare the common records.** Map the source material into the meeting, issue, and document formats in the [data contract](Council%20Lens/docs/DATA_CONTRACT.md), preserving source links and relationships.
3. **Configure the county experience.** Update coverage and source names, geography where needed, the public map starting point, map bounds, and county-specific labels and defaults.
4. **Connect the dataset.** For a deployment serving one county, replace the prepared dataset. Serving several counties together requires extending the data service to select and isolate a dataset for each county.
5. **Check and publish.** Review source facts, outcomes, links, and map locations; update county-specific tests and run the validation checks before enabling coverage.

The current app loads one county dataset. A coverage setting alone does not add another county's records. Expanding beyond Georgia also requires a new location directory and updates to state-specific navigation and copy.

## Current example: Fulton County

The included dataset covers the **Fulton County Board of Commissioners**, using its official Legistar records:

- **51 meetings** between January 8, 2025 and October 21, 2026.
- **1,303 substantive agenda items** and **4,098 agendas and supporting documents**.
- **47 meeting recordings** linked from the records.
- **193 items with plain-language explanations**; the remaining items show the county's agenda wording, labeled as a quote.
- **125 approximate map pins** derived from street addresses in the records. Near Me shows the 20 issues nearest the Fulton County Government Center.

The Georgia directory lists all 159 counties and 538 incorporated cities, towns, and consolidated governments. Fulton County is the only location with civic records in this version. Other counties and all cities show a "Coming soon" page; city government records are not included.

This is a prepared snapshot, checked on October 24, 2026. Record collection and validation use scripts, with review and prepared explanations before publication. The website does not refresh its records automatically.

## How it works

```text
Official county meeting and document sources
        |
County-specific collection and processing
(current example: scripts/fulton-records/ for Fulton County Legistar)
        |
Normalize outcomes, link records, prepare explanations, review and check
        v
Prepared meetings, issues, and documents in data/
        v
Shared civic data service
        v
County overview, record pages, Near Me, Calendar, and Archive
```

The Fulton implementation addresses two problems that matter when adapting to another source:

- **Interpreting outcomes.** A passed motion to hold an item is different from approval. The pipeline checks the clerk's written motion text; Legistar's separate pass/fail field disagreed with that text in 11 places in the included period.
- **Resolving public links.** Legistar's API item IDs differ from its public website IDs. The pipeline reads meeting pages to find public item links and checks that each opens the expected record.

See the [pipeline architecture](Council%20Lens/docs/PIPELINE_ARCHITECTURE.md) for the current implementation and rebuild steps.

## Tools and languages

- **Languages:** TypeScript, JavaScript (Node.js), HTML, and CSS; Python for DOCX text extraction in the record pipeline.
- **App:** React, React Router, Vite, and Leaflet with Esri World Street Map tiles.
- **Checks:** Vitest, Testing Library, jsdom, ESLint, and TypeScript.
- **Current pipeline:** Node.js, the Fulton County Legistar web API, Poppler `pdftotext`, the U.S. Census Bureau geocoder, and Playwright with Microsoft Edge.

## Run locally

The app is in [`Council Lens/`](Council%20Lens/). It needs Node.js 22.12 or newer; tests need Node 22.22+, 24.15+, or 26+.

```bash
cd "Council Lens"
npm ci
npm run dev        # development server, http://localhost:5173
npm run build      # production build into dist/
npm run preview    # serve the production build locally
```

Validation commands:

```bash
npm run validate:data
npm test
npm run typecheck
npm run lint
```

The website uses the committed dataset and runs without an account, API key, or backend server. Map tiles require internet access. Rebuilding records from official sources needs additional tools described in the architecture document.

### Hosting

The repository includes a [GitHub Pages workflow](.github/workflows/pages.yml) that builds the app with its project-site base path and copies `index.html` to `404.html` so inner links can load. The router uses the build's base URL.

For another static host, serve the built `Council Lens/dist/` directory and configure a fallback to `index.html` for application routes. Set Vite's build base to match the deployment path.

## Documentation

- [Application README](Council%20Lens/README.md): routes, code layout, tests, and credits
- [Pipeline architecture](Council%20Lens/docs/PIPELINE_ARCHITECTURE.md)
- [Dataset notes](Council%20Lens/data/README.md)
- [Data contract](Council%20Lens/docs/DATA_CONTRACT.md)

## Credits

Current example records: Fulton County Board of Commissioners, through its Legistar system. Map tiles: Esri. Geocoding and the Georgia location directory: U.S. Census Bureau. Fonts: Bricolage Grotesque, Atkinson Hyperlegible Next, and Outfit (SIL Open Font License). See the [application README](Council%20Lens/README.md#credits-and-open-source-software) for open-source software credits.

Council Lens is an independent project and is not affiliated with or endorsed by the governments whose records it presents.
