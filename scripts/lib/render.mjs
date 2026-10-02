export function renderDashboard(data) {
  const payload=JSON.stringify(data).replace(/</g,'\\u003c');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Air Quality Radar — Alen</title><meta name="description" content="Explore air quality across US and Canadian markets with dated observations, trends, and forecasts.">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="">
<link rel="stylesheet" href="./styles.css?v=20261001">
</head><body>
<a class="skip" href="#workspace">Skip to air quality map</a>
<header class="header"><div class="brand"><span class="brand-mark">a</span><div><div class="eyebrow">ALEN · MARKET INTELLIGENCE</div><h1>Air Quality Radar</h1></div></div><div class="header-right"><span id="updated"></span><button id="refreshBtn" class="quiet">Refresh</button><button id="themeToggle" class="quiet" aria-label="Toggle dark mode">Light / dark</button></div></header>
<main>
<section class="overview" aria-label="Monitoring summary"><div class="overview-intro"><h2>A clearer view of your markets.</h2><p>Observed air quality across the US &amp; Canada.</p></div><div class="stat"><strong id="marketCount">—</strong><span>locations &amp; markets</span></div><div class="stat"><strong id="freshCount">—</strong><span>with recent observations</span></div><div class="stat"><strong id="priorityCount">—</strong><span>current elevated markets</span></div></section>
<div id="statusBanner" class="status" role="status"></div>
<section class="toolbar" aria-label="Map filters">
<label class="search-label"><span>Find a location</span><input type="search" id="search" placeholder="City, state, or station name" autocomplete="off"></label>
<label><span>Country</span><select id="country"><option value="">All coverage</option value="US">United States</option><option value="CA">Canada</option><option value="unknown">Unverified location</option></select></label>
<label><span>Source</span><select id="source"><option value="">All sources</option><option>AirNow</option><option>EC AQHI</option><option>WAQI</option></select></label>
<label><span>Conditions</span><select id="tier"><option value="">All conditions</option><option value="elevated">Watch &amp; alert</option><option value="alert">Alert</option><option value="watch">Watch</option><option value="ignore">Below watch</option></select></label>
<label class="check"><input id="freshOnly" type="checkbox"><span>Recent only</span></label><button id="clearFilters" class="quiet">Clear filters</button>
</section>
<section class="workspace" id="workspace" aria-label="Air quality explorer">
<aside class="market-panel"><div class="panel-heading"><h2>Markets</h2><span id="resultCount"></span></div><div class="list-tabs" role="group" aria-label="Market view"><button id="allView" aria-pressed="true">All locations</button><button id="priorityView" aria-pressed="false">Priorities</button></div><p class="list-note" id="listNote">Select a location to explore its readings.</p><div id="marketList"></div><button id="showMore" class="quiet full" hidden>Show more locations</button></aside>
<div class="map-panel"><div class="map-heading"><span>Air quality observations</span><button id="resetMap" class="quiet">Reset map</button></div><div id="map" aria-label="Interactive air quality map"></div><div class="map-footer"><div class="legend" aria-label="US AQI legend"><b>US AQI</b><span><i style="--c:#4daa69"></i>0–50</span><span><i style="--c:#e4bd43"></i>51–100</span><span><i style="--c:#e88b3e"></i>101–150</span><span><i style="--c:#d95656"></i>151–200</span><span><i style="--c:#9d68ad"></i>201–300</span><span><i style="--c:#873853"></i>301+</span></div><div class="legend"><b>AQHI</b><span>1–3 low</span><span>4–6 moderate</span><span>7–10 high</span><span>10+ very high</span><span><i style="--c:#87939e"></i>Stale / time unknown</span></div><p>Markers show reporting locations, not continuous coverage. Blank areas do not mean clean air.</p></div></div>
<aside class="detail-panel" id="detail" aria-label="Selected location"><p>Select a location on the map or in the list.</p></aside>
</section>
<details class="method"><summary>Sources, coverage &amp; how priorities work</summary><div class="method-grid"><section><h3>Observation freshness</h3><p>Recent means a dated observation within 3 hours. Cached fallback readings, older measurements, and readings without a verified time remain visible but are excluded from current priorities. Status updates while this page is open.</p><div id="sourceStatus"></div></section><section><h3>Market priorities</h3><p>Priorities use current severity and observed direction. Population is reference context only, not an exposed audience or a sales forecast. Confirmed place-name matches are grouped; uncertain locations stay separate.</p><p>Watch / Alert are internal planning tiers: US AQI 101–150 / 151+, Canadian AQHI 7–&lt;10 / 10+. AQI and AQHI are different scales, not interchangeable values.</p></section><section><h3>Coverage &amp; provenance</h3><p>AirNow reporting areas, Environment Canada AQHI locations, and available WAQI stations. Mexico is not systematically monitored. Missing sources and observation times are disclosed.</p><p><a href="https://www.airnow.gov/">AirNow</a> · <a href="https://weather.gc.ca/airquality/pages/index_e.html">Environment Canada</a> · <a href="https://waqi.info/">World Air Quality Index</a> · <a href="https://simplemaps.com/data/world-cities">SimpleMaps population reference (CC BY 4.0)</a></p><p>Use official local advisories for health and emergency decisions. Elevated AQI alone does not identify wildfire smoke.</p></section></div></details>
</main><footer class="site-footer"><span>Alen Air Quality Radar</span><span>Public observations · Planning context · Release 2026.10.01</span><a href="https://github.com/nguenther97/air-quality-radar">Project &amp; methodology</a></footer>
<script type="application/json" id="aqr-data">${payload}</script>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
<script src="./app.js?v=20261001" defer></script>
</body></html>`;
}
