# Air Quality Radar

Internal tool for Alen Air — times geo-targeted marketing pushes to moments when
air quality across North America is bad enough to drive real purchase intent.

## What runs here

- **`scripts/fetch_and_build.mjs`** — runs every 30 minutes via GitHub Actions.
  Fetches AirNow (US) and Environment Canada AQHI (Canada) conditions, joins
  population data, classifies severity, tracks trend history, and regenerates
  the dashboard published at **docs/** via GitHub Pages.
- **`scripts/alert_check.mjs`** — runs every 3 hours via GitHub Actions. Uses
  Claude with web search to catch official advisories an API poll would miss,
  dedupes per-location, and opens/updates a GitHub Issue for anything that
  newly qualifies as Watch or Alert tier.

## Data

- `data/cities_us_ca.json` — bundled US/Canada city population dataset (SimpleMaps
  Basic World Cities Database, CC BY 4.0).
- `data/snapshots.json` — rolling 48h trend history, rewritten each refresh run.
- `data/alert_state.json` — per-location dedupe state for the alert check.

## Known limitations

- Mexico is not covered — no free real-time air-quality feed was available.
- Canada's AQHI 7/9-10 watch/alert cutoffs are a judgment-call mapping to the
  AQI thresholds, not a validated study.
- This repo is public, per a deliberate tradeoff: GitHub Pages requires a
  public repo on the Free plan. The underlying data is aggregate public
  AQI/AQHI readings and population figures — not customer data or secrets.
