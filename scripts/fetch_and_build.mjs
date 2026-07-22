import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseAirNow } from './lib/airnow.mjs';
import { parseCanadaAQHI } from './lib/canada.mjs';
import { buildPopulationIndex, matchPopulation } from './lib/population.mjs';
import {
  classify, pruneSnapshots, appendSnapshots, computeTrend, computeElevatedHours, topOpportunities,
} from './lib/metrics.mjs';
import { renderDashboard } from './lib/render.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AIRNOW_URL = 'https://files.airnowtech.org/airnow/today/reportingarea.dat';
const CANADA_URL = 'https://api.weather.gc.ca/collections/aqhi-observations-realtime/items?f=json&limit=2000&latest=true';
const FETCH_TIMEOUT_MS = 30_000;

async function fetchText(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function readJson(relPath, fallback) {
  try {
    return JSON.parse(await readFile(path.join(ROOT, relPath), 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(relPath, value) {
  await writeFile(path.join(ROOT, relPath), JSON.stringify(value, null, 2) + '\n', 'utf8');
}

async function fetchSource(name, url, parse, cache) {
  try {
    const raw = await fetchText(url);
    const readings = parse(raw);
    cache[name] = { fetchedAt: Date.now(), readings };
    return { readings, status: { source: name, ok: true } };
  } catch (err) {
    const cached = cache[name];
    return {
      readings: (cached?.readings ?? []).map((r) => ({ ...r, stale: true, staleSince: cached.fetchedAt })),
      status: { source: name, ok: false, error: String(err.message ?? err) },
    };
  }
}

async function main() {
  const now = Date.now();
  const cache = await readJson('data/last_good_readings.json', {});
  const cities = await readJson('data/cities_us_ca.json', []);
  const popIndex = buildPopulationIndex(cities);

  const [airnow, canada] = await Promise.all([
    fetchSource('airnow', AIRNOW_URL, parseAirNow, cache),
    fetchSource('canada', CANADA_URL, parseCanadaAQHI, cache),
  ]);

  await writeJson('data/last_good_readings.json', cache);

  let readings = [...airnow.readings, ...canada.readings];
  readings = readings.map((r) => {
    const tier = classify(r.unit, r.value);
    const pop = matchPopulation(r, popIndex);
    return {
      ...r,
      tier,
      population: pop.population,
      populationMatch: pop.matchType,
      state: r.state || pop.matchedState,
    };
  });

  let snapshots = await readJson('data/snapshots.json', []);
  snapshots = pruneSnapshots(snapshots, now);

  readings = readings.map((r) => ({
    ...r,
    trend: computeTrend(r, snapshots, now),
    elevatedHours: computeElevatedHours(r, snapshots, now),
  }));

  snapshots = appendSnapshots(snapshots, readings, now);
  await writeJson('data/snapshots.json', snapshots);

  const dashboardData = {
    generatedAt: now,
    sourceStatus: [airnow.status, canada.status],
    readings: readings
      .filter((r) => r.tier !== 'ignore')
      .sort((a, b) => (b.tier === 'alert') - (a.tier === 'alert') || b.value - a.value),
    topOpportunities: topOpportunities(readings),
  };

  await writeFile(path.join(ROOT, 'docs/index.html'), renderDashboard(dashboardData), 'utf8');

  console.log(
    `Built dashboard: ${dashboardData.readings.length} elevated readings, ` +
      `${dashboardData.topOpportunities.length} top opportunities. ` +
      `Sources: ${dashboardData.sourceStatus.map((s) => `${s.source}=${s.ok ? 'ok' : 'FAIL:' + s.error}`).join(', ')}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
