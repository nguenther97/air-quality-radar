# Air Quality Radar

[Open the live radar](https://nguenther97.github.io/air-quality-radar/)

An Alen planning prototype for exploring air quality across US and Canadian markets. It identifies recent elevated observations that may warrant investigation. It does not establish purchase intent or predict sales.

## Explore the radar

Search locations, filter sources and conditions, and select a map marker or market to inspect observations, available forecasts, and developing history. Verified place-name matches group related readings while preserving each source. AQI and AQHI remain separate indices.

Recent observations must have a verified timestamp within three hours. Saved, older, and undated readings remain visible but are excluded from current priorities. A successful fetch does not by itself make an observation current.

Priorities use internal severity tiers and observed direction. AQI Watch is 101–150 and Alert is above 150; AQHI Watch is 7–<10 and Alert is 10+. These planning tiers are distinct from official Canadian health categories, where AQHI 7–10 is High Risk and above 10 is Very High Risk. Population is reference context only, not a verified exposure count or a scoring factor.

## Run and publish

Use Node.js 24. `npm test` runs the regression suite; `npm run build` fetches feeds and generates `docs/`. The optional existing `WAQI_TOKEN` environment variable enables WAQI. `node scripts/preview.mjs` serves the generated site locally.

GitHub Actions rebuilds at :07 and :37 each hour and after source changes to main. GitHub Pages serves `docs/`. Scheduled runs can be delayed; the dashboard displays its build time and marks overdue refreshes after 90 minutes.

The separate advisory and weekly-digest workflows remain in place. They are not triggered by the dashboard build.

## Sources and limitations

- Observations: [AirNow](https://www.airnow.gov/), [Environment Canada](https://weather.gc.ca/airquality/pages/index_e.html), and [WAQI](https://waqi.info/). Reporting locations do not provide continuous geographic coverage. Blank map areas do not establish clean air.
- Population: bundled [SimpleMaps Basic World Cities Database](https://simplemaps.com/data/world-cities), under Creative Commons Attribution 4.0. Name, jurisdiction, and distance checks are required; regional areas are not assigned the population of the nearest suburb.
- History: `data/snapshots.json` retains 48 hours of dated AirNow/EC observations. Repeated timestamps are deduplicated, recovery breaks an elevated span, and gaps over 90 minutes are not bridged. Undated legacy history is excluded. WAQI observations are not added to this history archive.
- Forecasts are shown only when supplied by the selected source, with their valid date. They are forecasts, not observations.
- Mexico coverage, fire/smoke/wind layers, consistent business-market boundaries, and validated demand forecasting remain future work. Historical sales and a permitted environmental archive are needed to test the forecasting hypothesis.

See [release notes](RELEASE-NOTES.md) for the October 2026 changes. This public prototype contains aggregate public environmental data; do not add customer data or secrets. Follow official local advisories for health and safety decisions.
