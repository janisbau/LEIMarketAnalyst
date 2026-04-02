# CLAUDE.md — LEI Market Analyzer

This file documents all decisions, architecture choices, and context for this project so any future Claude session (or collaborator) can pick up exactly where we left off.

---

## Project Overview

**LEI Market Analyzer** is a static single-page web app for aspiring LOUs (Legal Entity Identifier issuers) who want a comprehensive view of the global LEI market — competitive landscape, geographic opportunity, RA relationships, and trend data.

It tracks:
- **LOUs** — the ~40 accredited organizations that issue LEI codes worldwide
- **Registration Agents (RAs)** — ~67 intermediaries that distribute LEI services on behalf of LOUs
- **Geographic coverage** — which countries each LOU is accredited to operate in; actual daily issuance volume per country
- **Market share** — cumulative active/lapsed LEIs per LOU from full Golden Copy
- **Market trends** — daily LEI issuance volume, growth rates, status breakdown, transfers
- **Relationships** — force-directed network showing RA ↔ LOU connections, weighted by activity
- **Market intelligence** — opportunity scores per country, whitespace detection, RA coverage gaps, regulatory context

Data comes from the Global LEI Foundation (GLEIF). All data is free and publicly accessible; no API key required.

**Repository:** https://github.com/janisbau/LEIMarketAnalyst

---

## Tech Stack

| Dependency | Version | Source | Purpose |
|---|---|---|---|
| Chart.js | 4.4.0 | jsdelivr CDN | Line, bar, doughnut trend charts |
| Leaflet.js | 1.9.4 | unpkg CDN | World choropleth map |
| vis.js Network | latest | unpkg CDN | RA-LOU force-directed network graph |
| Tabulator.js | 6.2.1 | unpkg CDN | Sortable, filterable, paginated tables |
| GLEIF REST API | v1 | api.gleif.org | Live LOU/RA structure data (free, no auth) |
| GLEIF Golden Copy API | v2 | goldencopy.gleif.org | Bulk LEI CSV files for trend statistics |
| GeoJSON World | — | github.com/datasets/geo-countries | Country polygons for Leaflet choropleth |
| Google Fonts | — | CDN | Inter (body) + Space Grotesk (headings) |
| GitHub Actions | free tier | github.com | Daily delta pipeline + monthly full pipeline |
| GitHub Pages | free | github.com | Static site hosting |

**No build tools. No npm. No Node.js required.** All JS is plain ES5/ES6, no modules, opened via http.server.

---

## Project Structure

```
LEIMarket/
├── index.html                  — App shell: nav, 7 view sections, overlays, loading screen
├── style.css                   — NASDAQ dark theme, CSS variables, all view styles (v=5)
├── api.js                      — GLEIF REST API fetches, sessionStorage caching, loadLocalStats()
├── app.js                      — Boot sequence, tab routing, global search, window.App namespace
├── views/
│   ├── dashboard.js            — KPI cards, market health, intelligence bullets, market share chart
│   ├── map.js                  — World choropleth (Leaflet); Coverage mode (daily volume) + Opportunity mode
│   ├── network.js              — RA-LOU force graph (vis.js); activity-weighted nodes; sidebar detail
│   ├── lou-table.js            — LOU directory (Tabulator); market share %, lapse rate, compare, CSV export
│   ├── ra-table.js             — RA directory (Tabulator); loyalty badges, multi-LOU filter, CSV export
│   ├── trends.js               — 6 Chart.js charts (daily volume, top LOUs, country growth, status, market share, transfers)
│   ├── intelligence.js         — Intelligence tab: insights, opportunity scores, whitespace, RA gaps, regulatory context
│   ├── lou-profile.js          — Full-screen LOU profile overlay: 4 tabs (Overview/RA Network/Geography/Trends)
│   └── comparison.js           — Side-by-side LOU comparison modal (up to 4 LOUs)
├── data/
│   ├── daily-stats.json        — AUTO-GENERATED daily; today's delta snapshot (byLou, byCountry, transfers)
│   ├── history.json            — AUTO-GENERATED; cumulative daily time-series, last 730 days
│   ├── market-share.json       — AUTO-GENERATED monthly; active/lapsed/share% per LOU
│   ├── market-share-history.json — AUTO-GENERATED monthly; monthly snapshots (last 36 months)
│   ├── entity-types.json       — AUTO-GENERATED monthly; entity type breakdown per LOU
│   ├── renewal-pipeline.json   — AUTO-GENERATED monthly; LEI expiries by LOU/month (next 12 months)
│   ├── lou-home-countries.json — AUTO-GENERATED monthly; primary country per LOU (most LEIs issued)
│   └── regulatory-context.json — STATIC; 25 jurisdictions with regulations and adoption levels
├── scripts/
│   ├── process_delta.py        — Processes daily GLEIF delta CSV → daily-stats.json + history.json
│   ├── process_full.py         — Processes full Golden Copy CSV → 5 market-share files (streaming)
│   └── fetch_local.py          — LOCAL BOOTSTRAP: downloads + processes Golden Copy without GitHub Actions
├── .github/
│   └── workflows/
│       ├── update-stats.yml    — Daily cron (08:00 UTC): delta download → process → commit
│       └── update-full.yml     — Monthly cron (1st, 07:00 UTC): full download → process → commit
└── CLAUDE.md                   — This file
```

---

## How to Run

### Option 1 — Local (recommended for development)
```bash
cd C:\Users\jbauv\LEIMarket
python -m http.server 3001
```
Open `http://localhost:3001`. **Do not open `index.html` directly** — `fetch()` calls fail on `file://`.

### Option 2 — GitHub Pages (production)
1. Create a repo on GitHub
2. `git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git`
3. `git push -u origin master`
4. Settings → Pages → Source: Branch `master`, folder `/root`
5. Site live at `https://YOUR_USERNAME.github.io/YOUR_REPO`

---

## Getting Data (Critical First Step)

The app shows live GLEIF structural data (LOUs, RAs, jurisdictions) automatically on load. But trend/statistics charts need to be populated separately.

### Local bootstrap (run once)
```bash
cd C:\Users\jbauv\LEIMarket
python scripts/fetch_local.py          # delta only (~1.6 MB, fast, populates history)
python scripts/fetch_local.py --full   # also full Golden Copy (~450 MB, populates market share)
```
`fetch_local.py` uses the GLEIF publishes API to get the current download URL automatically (no hardcoded URLs to go stale).

### Automated (GitHub Actions)
- **Daily** (08:00 UTC): `update-stats.yml` downloads LastDay delta, runs `process_delta.py`, commits `daily-stats.json` + `history.json`
- **Monthly** (1st of month, 07:00 UTC): `update-full.yml` downloads full Golden Copy, runs `process_full.py`, commits 5 market-share files
- Trigger manually: GitHub → Actions → workflow → "Run workflow"
- **The repo stays lightweight** — raw Golden Copy is processed and discarded, only small JSON files (~100KB total) are committed

### GLEIF Golden Copy API
```
GET https://goldencopy.gleif.org/api/v2/golden-copies/publishes
```
Returns JSON with current download URLs for full and delta files. **Use this API to get the URL** — do not hardcode storage URLs as they change with each publish date.

---

## Data Architecture

### Two live data sources

**Source A — GLEIF REST API (live, on page load)**
- Fetched in parallel at boot, cached in `sessionStorage` for the browser session
- Provides: all LOUs, all RAs, per-LOU jurisdiction lists

**Source B — Processed Golden Copy (pre-aggregated JSON, static files)**
- Raw files too large for browser; pre-processed by Python scripts
- Frontend reads small JSON files via `fetch('data/*.json', { cache: 'no-store' })`
- `cache: 'no-store'` ensures browser always reads fresh files after pipeline runs

### `window.App` namespace

```javascript
App.api      — GLEIF fetch functions
App.data     — all loaded data (see shape below)
App.views    — each view's init() function + generateInsights()
App.helpers  — louName(lou), escHtml(s)
App.chartDefaults — shared Chart.js config factory
```

### `App.data` full shape

```javascript
App.data = {
  // From GLEIF REST API (live)
  lous: [],              // 40 LOU objects
  ras: [],               // ~67 RA objects (each has ._louLei injected)
  louMap: {},            // { louLei → louObject }
  rasByLou: {},          // { louLei → [ra, ra, ...] }
  jurisdictions: {},     // { louLei → [jurisdiction, ...] }
  countryCoverage: {},   // { 'US' → ['lei1', 'lei2'], ... }  (all LOUs per country)

  // From data/daily-stats.json (daily pipeline)
  stats: {
    date, totalDelta, byLou, byCountry, byLouByCountry,
    byLouStatus, transfers: { outflows, inflows }, statusBreakdown
  },

  // From data/history.json (daily pipeline, last 730 days)
  history: [ { date, newLEIs, byLou, byCountry, transfers, statusBreakdown }, ... ],

  // From data/market-share.json (monthly pipeline)
  marketShare: { date, totalActive, byLou: { lei → { active, lapsed, total, sharePercent } } },

  // From data/market-share-history.json (monthly pipeline)
  marketShareHistory: [ { date, byLou: { lei → sharePercent } }, ... ],

  // From data/renewal-pipeline.json (monthly pipeline)
  renewalPipeline: { byLou: { lei → { 'YYYY-MM' → count } } },

  // From data/entity-types.json (monthly pipeline)
  entityTypes: { byLou: { lei → { typeName → count } } },

  // From data/lou-home-countries.json (monthly pipeline)
  louHomeCountries: { lei → 'CC' },  // proxy from jurisdictions if file not yet generated

  // From data/regulatory-context.json (static)
  regulatoryContext: { 'CC' → { name, regulations, adoptionLevel, estimatedEntities } },
}
```

### Boot sequence

1. Show loading overlay
2. Parallel: fetch all LOUs, all RAs, all 8 local JSON data files
3. Build `louMap`, `rasByLou`
4. Fetch 40 jurisdiction lists in parallel
5. Build `countryCoverage`
6. Proxy `louHomeCountries` from jurisdictions if monthly pipeline hasn't run
7. Hide overlay → render Dashboard

### Lazy view init
Each view's `init()` is called only on first tab click. Tracked via `_initializedViews` in `app.js`.

---

## GLEIF API Notes

### Endpoints used

| Endpoint | Purpose |
|---|---|
| `GET https://api.gleif.org/api/v1/lei-issuers?page[size]=100` | All LOUs |
| `GET https://api.gleif.org/api/v1/registration-agents?page[size]=100` | All RAs |
| `GET https://api.gleif.org/api/v1/lei-issuers/{lei}/jurisdictions?page[size]=300` | Per-LOU jurisdictions |
| `GET https://goldencopy.gleif.org/api/v2/golden-copies/publishes` | Latest file metadata + URLs |

### Known quirks

- **Bracket notation in URLs** — GLEIF uses JSON:API style `page[size]=100`. Use template literals directly, not `URLSearchParams` (it percent-encodes brackets → API breaks).
- **GeoJSON country codes** — The `datasets/geo-countries` GeoJSON uses `ISO3166-1-Alpha-2` as the property key (NOT `ISO_A2` or `iso_a2`). The `getCountryCode()` function in `map.js` checks this first.
- **40 parallel jurisdiction fetches** — GLEIF's rate limits are generous; this completes in 2–4s.
- **CORS** — GLEIF REST API supports browser `fetch()` directly; no proxy needed.
- **Golden Copy URL** — Always use `goldencopy.gleif.org` (NOT `goldencopy-next.gleif.org`). URLs are dynamic (include date/ID); resolve them from the publishes API at runtime.

---

## Key Design Decisions

### Why colour map by daily issuance volume, not LOU count?
The GLEIF jurisdictions API returns all countries a LOU is *licensed* to operate in. Most LOUs have global accreditation, meaning every country shows 3+ LOUs — a uniform cyan map with no information. Switching to actual daily issuance volume (`stats.byCountry`) gives a meaningful choropleth showing real market activity.

### Why vis.js Network over D3?
D3's force graph requires ~200 lines of SVG, scales, and simulation code. vis.js wraps it into a data-in/render-out API in ~30 lines. Right choice for a beginner project that needs to ship.

### Why GitHub Actions for pipeline, not a server?
Golden Copy delta files are large (1–500MB). A static site cannot process them browser-side. GitHub Actions downloads, processes, and commits tiny JSON outputs (~100KB total). The entire site stays static and hosts for free on GitHub Pages.

### Why `cache: 'no-store'` for local JSON fetches?
After running `fetch_local.py` or the pipeline, the browser needs to pick up freshly generated files. Without `no-store`, Chrome caches the previous JSON (even placeholder files) and the dashboard keeps showing `—`.

### Why Python only (no npm/Node for scripts)?
Keeps the toolchain minimal. All processing uses only Python standard library (`csv`, `json`, `zipfile`, `urllib`). No `pip install` required.

---

## CSS Conventions

- All theme colors as CSS variables in `:root`; prefix: `--sp-` for theme, `--` for generic
- Cache-buster on `style.css?v=5` — increment `v` when making significant CSS changes
- All JS scripts have `?v=N` cache-busters too; currently at `v=2` or `v=3`
- Tabulator dark theme: use `tabulator_midnight.min.css` as base (not the default light theme)
- Tabulator cell/row backgrounds use solid hex colors (not transparent) to avoid compositing issues

---

## GitHub Actions Pipelines

### Daily delta (`update-stats.yml`, 08:00 UTC)
1. Fetch current download URL from `goldencopy.gleif.org/api/v2/golden-copies/publishes`
2. Download LastDay delta ZIP (~1–2MB)
3. Unzip, run `scripts/process_delta.py`
4. Commit `data/daily-stats.json` + `data/history.json` (only if changed)

### Monthly full (`update-full.yml`, 1st of month 07:00 UTC)
1. Fetch current full file URL from publishes API
2. Download full Golden Copy ZIP (~450MB)
3. Unzip, run `scripts/process_full.py` (streaming, ~3.2M records)
4. Commit 5 files: `market-share.json`, `market-share-history.json`, `entity-types.json`, `renewal-pipeline.json`, `lou-home-countries.json`

**Cost:** ~2 min/day × 30 = 60 min/month. GitHub free tier: 2,000 min/month. **Total cost: $0.**

---

## Session History

### Session 3 — Data bootstrap, map contrast, network contrast (2026-04-02)

**Problem: wrong GLEIF Golden Copy URL**
- Original code used `goldencopy-next.gleif.org` — this domain does not resolve
- Correct domain: `goldencopy.gleif.org`; use the publishes API for dynamic URLs
- Fixed in both GitHub Actions workflows and new local bootstrap script

**New: `scripts/fetch_local.py`**
- Downloads and processes Golden Copy locally without needing GitHub Actions
- Uses stdlib only (`urllib`, `zipfile`, `subprocess`) — no pip required
- Usage: `python scripts/fetch_local.py` (delta only) or `--full` (also market share)
- Shows progress bar, cleans up ZIP + extracted CSV after processing

**Map — coverage mode overhaul**
- Fixed `getCountryCode()` — was looking for `ISO_A2`; GeoJSON actually uses `ISO3166-1-Alpha-2` → every country returned null, all rendered as darkest shade
- Switched coverage metric from LOU accreditation count (all countries show 3+, uniform cyan) to actual daily issuance volume — 5-tier scale: 0 / <50 / 50-299 / 300-999 / 1000+
- New coverage colors: dark slate (0), dark blue, vivid blue, sky blue, bright cyan — all high-contrast on the dark CartoDB basemap
- Opportunity mode: softer amber/orange palette (was flat green/yellow)
- Hover: white border at weight 2.5 for clear country highlighting
- Legend updated to "Daily LEIs" with tier labels

**Network graph contrast**
- Edges: `#1e2a3a` (near-invisible on `#080c17` bg) → `#1e4060` at 85% opacity, width 1.2px
- RA nodes: dark grey blobs → green spectrum (#1a9a60 inactive → #00e676 active); clearly distinct from LOU cyan
- RA font: dim grey size 10 → brightness 160–235 scaled by activity, size 11, strokeWidth 3
- LOU font: white (#ffffff), size 13, strokeWidth 3 for readability on dark canvas

**Data: initial Golden Copy loaded**
- Ran `fetch_local.py --full`; processed 3,269,116 records from 2026-04-02 Golden Copy
- `market-share.json`: 1,873,774 active LEIs globally, 40 LOUs
- All 7 data files committed to repo; dashboard now shows real numbers

**Bug fix: browser caching of JSON data files**
- Added `cache: 'no-store'` to `loadLocalJson()` in `api.js`
- Prevents stale placeholder files from being served after pipeline runs

### Session 2 — Full requirements implementation (2026-03-31)
Implemented all 21 strategic requirements (REQ-01 to REQ-21) identified in the gap analysis for an aspiring LOU:

- `scripts/process_delta.py` — added `byLouByCountry`, `byLouStatus`, `transfers`, `statusBreakdown`
- `scripts/process_full.py` — new full Golden Copy processor (streaming CSV, ~3M records)
- `.github/workflows/update-full.yml` — monthly pipeline
- `data/regulatory-context.json` — static file with 25 jurisdictions
- `views/intelligence.js` — Intelligence tab (7th tab): insights, opportunity scores, whitespace, RA gaps, regulatory table
- `views/lou-profile.js` — Full-screen LOU profile overlay with 4 tabs
- `views/comparison.js` — Side-by-side LOU comparison modal (up to 4 LOUs)
- `views/map.js` — Coverage/Opportunity mode toggle; LOU names in popups link to profile
- `views/lou-table.js` — Market share %, lapse rate, compare checkboxes, CSV export, clickable LOU names
- `views/ra-table.js` — Loyalty badges (Exclusive/Dual/Multi), multi-LOU filter, CSV export
- `views/trends.js` — Charts 5 (market share over time) and 6 (status breakdown stacked bar)
- `views/network.js` — RA activity weighting, "View Full Profile" buttons in sidebar
- `app.js` — Global search (LOUs/RAs/countries, category badges, click-to-navigate)
- `api.js` — `loadLocalStats()` loads all 8 JSON files; proxy `louHomeCountries`

### Session 1 — Initial build (2026-03-31)
Built the entire application from scratch:
- Project scaffold: `index.html`, `style.css`, `api.js`, `app.js`
- 6 views: Dashboard, World Map, Network Graph, LOU Directory, RA Directory, Trends
- GitHub Actions daily pipeline + `scripts/process_delta.py`
- NASDAQ dark theme with CSS variables
- `CLAUDE.md` documentation
