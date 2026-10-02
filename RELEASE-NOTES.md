# Radar update — October 1, 2026

## Live explorer

- Search locations and station names, filter by country, source, internal action tier, and freshness.
- View normal and elevated conditions on a responsive map, with synchronized market and detail panels.
- Inspect dated observations, source links, pollutants when supplied, available forecasts, and developing observation history.
- Keep every source reading when a verified place-name match groups multiple readings into one market. Readings from different indices are not averaged.

## Reliability changes

- Normalize Saint/St. place names with state, country, and distance checks. Do not substitute a nearest suburb for regional reporting areas.
- Show population only for supported name matches. Display the matched population place and exclude population from priority scoring because the bundled data are not a consistent set of business-market boundaries or exposure counts.
- Rank recent elevated markets by internal tier, severity, and direction. Unknown population does not suppress a valid environmental signal.
- Preserve dates/timezones in AirNow observations and use a three-hour freshness limit. Missing/future times, older readings, and cached fallback readings do not enter current priorities. Browser status ages every minute.
- Treat unsuccessful or malformed WAQI dashboard responses as failed refreshes; preserve cache fallback. Blank values are not zero.
- Remove WAQI's latitude-based country inference. Unresolved country remains unknown; named Mexico stations are omitted from the current US/Canada view.
- Correct the official Canadian category for AQHI 10 to High Risk. Internal action tiers remain Watch at 7–<10 and Alert at 10+, separately disclosed.
- Keep a versioned 48-hour history of dated AirNow/EC observations, including below-threshold recovery. Deduplicate repeated observation timestamps. Gaps exceeding 90 minutes or recovery end an elevated span. Undated legacy history is excluded, so charts need time to accumulate again.
- Do not add WAQI observations to this history archive. The provider's data-use requirements should be reviewed before expanding its distribution or historical use.
- Label forecasts with their actual valid date/offset instead of calling every forecast tomorrow.
- Run regression tests before each scheduled dashboard build and after source changes.

## Operation

`npm test` runs the regression suite. `npm run build` fetches public feeds and rebuilds `docs/`; WAQI uses the existing `WAQI_TOKEN` environment variable. `node scripts/preview.mjs` serves a local preview. No new paid services or dependencies are required.

GitHub Actions refreshes at :07 and :37, and on source changes to main. Scheduled jobs can be delayed; an overdue dashboard is disclosed after 90 minutes. Source fetching and observation freshness are separate statuses. The existing advisory/weekly-digest workflows remain in place and are not manually triggered by this release.

## Remaining scope

This release does not add fire/smoke/wind layers, comprehensive Mexico coverage, or a calibrated sales forecast. Exact market boundaries, a durable permitted exposure archive, and historical demand validation remain separate work. Near-name or geographic proximity alone is not treated as evidence that two signals describe the same business market.

Data are preliminary and are not an emergency warning service. Follow official local advisories.
