import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

import { parseAirNow } from './lib/airnow.mjs';
import { parseCanadaAQHI } from './lib/canada.mjs';
import { classify } from './lib/metrics.mjs';
import { createIssue, addComment, closeIssue } from './lib/github.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE_PATH = 'data/alert_state.json';
const REALERT_WINDOW_MS = 24 * 60 * 60 * 1000;
const AIRNOW_URL = 'https://files.airnowtech.org/airnow/today/reportingarea.dat';
const CANADA_URL = 'https://api.weather.gc.ca/collections/aqhi-observations-realtime/items?f=json&limit=2000&latest=true';
const FETCH_TIMEOUT_MS = 30_000;

const ENRICHMENT_SCHEMA = {
  type: 'object',
  properties: {
    enriched: {
      type: 'array',
      description: 'One entry per locationKey provided in the input list.',
      items: {
        type: 'object',
        properties: {
          locationKey: { type: 'string' },
          cause: { type: 'string', description: 'e.g. wildfire smoke, ozone/summer smog, industrial or traffic particulate, dust storm, or other — whatever the evidence actually points to' },
          trend: { type: 'string', description: 'What current data or forecasts say about direction — worsening, improving, steady, or specific forecast detail' },
          advisory: { type: 'string', description: 'Name/description of any active official advisory covering this location, or the literal string "none" if you found no advisory' },
          marketingAngle: {
            type: 'string',
            description: "One specific, region-tailored marketing suggestion for Alen Air (an air purifier brand) — reflect the region's character (dense urban metro vs affluent suburb vs rural), not a generic template.",
          },
        },
        required: ['locationKey', 'cause', 'trend', 'advisory', 'marketingAngle'],
        additionalProperties: false,
      },
    },
    additionalEvents: {
      type: 'array',
      description: 'Locations under an active official advisory that are NOT in the provided input list — e.g. a metro-wide health advisory where no single monitoring station happens to cross the numeric threshold.',
      items: {
        type: 'object',
        properties: {
          locationKey: { type: 'string', description: "Stable unique id, e.g. 'US-CA-Los Angeles' or 'CA-ON-Toronto'. Never a province- or region-wide key." },
          region: { type: 'string' },
          stateOrProvince: { type: 'string' },
          country: { type: 'string', enum: ['US', 'CA'] },
          tier: { type: 'string', enum: ['alert', 'watch'] },
          category: { type: 'string' },
          cause: { type: 'string' },
          trend: { type: 'string' },
          advisory: { type: 'string' },
          source: { type: 'string' },
          marketingAngle: { type: 'string' },
        },
        required: ['locationKey', 'region', 'stateOrProvince', 'country', 'tier', 'category', 'cause', 'trend', 'advisory', 'source', 'marketingAngle'],
        additionalProperties: false,
      },
    },
  },
  required: ['enriched', 'additionalEvents'],
  additionalProperties: false,
};

function buildPrompt(readings) {
  return `You are helping Alen Air, an air purifier brand, time geo-targeted marketing pushes around real air-quality events across the US and Canada.

A separate deterministic data feed has already identified the following currently elevated locations (AQI/AQHI readings pulled directly from AirNow and Environment Canada) and classified their tier. Do NOT re-derive or second-guess these numbers or tiers — treat them as ground truth:

${JSON.stringify(readings, null, 2)}

Your job has two parts:

**Part 1 — Enrich each location above.** For each locationKey in the list, research and return: the likely cause (this can be anything — wildfire smoke, ozone/summer smog, industrial or traffic particulate, dust storms, or something else entirely; do not assume wildfire smoke by default), the current trend or forecast direction, whether an official government health or air-quality advisory is active for that location (name it, or say "none"), and one specific marketing angle for Alen Air tailored to that region's actual character (dense urban metro vs affluent suburb vs rural area, likely demographics) rather than a generic template.

**Part 2 — Find what the numeric feed would miss.** Separately search for any other US or Canadian metro area currently under an active official air-quality or health advisory of any kind (not limited to wildfire smoke — ozone action days, dust storm warnings, industrial incidents, and general air-quality advisories all count) that is NOT already in the list above. This is the whole reason for doing live research instead of just reading the numbers: an advisory can cover a metro area even when no single monitoring station's reading crosses the numeric threshold. For each one you find, classify it ALERT or WATCH using the same rule as the numeric feed (ALERT = an active official advisory covering the metro, or equivalent severity to AQI >= 151 / AQHI >= 10; WATCH = a milder advisory or equivalent to AQI 101-150 / AQHI 7-9), and provide the same fields plus a marketing angle.

If you find no advisories beyond what's already in the list, return an empty additionalEvents array.`;
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

async function fetchText(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fetchDeterministicReadings() {
  const [airnowRaw, canadaRaw] = await Promise.all([
    fetchText(AIRNOW_URL).catch((err) => {
      console.error(`AirNow fetch failed: ${err.message}`);
      return null;
    }),
    fetchText(CANADA_URL).catch((err) => {
      console.error(`Environment Canada fetch failed: ${err.message}`);
      return null;
    }),
  ]);

  const readings = [
    ...(airnowRaw ? parseAirNow(airnowRaw) : []),
    ...(canadaRaw ? parseCanadaAQHI(JSON.parse(canadaRaw)) : []),
  ];

  return readings
    .map((r) => ({ ...r, tier: classify(r.unit, r.value) }))
    .filter((r) => r.tier !== 'ignore')
    .map((r) => ({
      locationKey: r.id,
      region: r.name,
      stateOrProvince: r.state,
      country: r.country,
      tier: r.tier,
      value: r.value,
      unit: r.unit,
      category: r.category,
      source: r.source,
    }));
}

async function enrichAndFindAdditional(readings) {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 8000,
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 10 }],
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: ENRICHMENT_SCHEMA } },
    messages: [{ role: 'user', content: buildPrompt(readings) }],
  });

  if (response.stop_reason === 'refusal') {
    console.error('Model declined the request; proceeding with numeric readings only, no enrichment.');
    return { enriched: [], additionalEvents: [] };
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) return { enriched: [], additionalEvents: [] };
  return JSON.parse(textBlock.text);
}

function mergeEvents(readings, enrichmentResult) {
  const enrichedByKey = new Map(enrichmentResult.enriched.map((e) => [e.locationKey, e]));

  const fromFeed = readings.map((r) => {
    const e = enrichedByKey.get(r.locationKey);
    return {
      ...r,
      cause: e?.cause ?? 'Elevated air pollution (cause not determined this run)',
      trend: e?.trend ?? 'See dashboard for live trend',
      advisory: e?.advisory ?? 'none',
      marketingAngle: e?.marketingAngle ?? `Geo-targeted push for ${r.region}, ${r.stateOrProvince} — air quality currently ${r.category}.`,
    };
  });

  const additional = enrichmentResult.additionalEvents.map((e) => ({
    locationKey: e.locationKey,
    region: e.region,
    stateOrProvince: e.stateOrProvince,
    country: e.country,
    tier: e.tier,
    value: null,
    unit: 'advisory',
    category: e.category,
    source: e.source,
    cause: e.cause,
    trend: e.trend,
    advisory: e.advisory,
    marketingAngle: e.marketingAngle,
  }));

  return [...fromFeed, ...additional];
}

function issueBody(event, state) {
  const lines = [
    `**${event.region}, ${event.stateOrProvince} (${event.country})** — ${event.value != null ? `${event.value} ${event.unit}` : event.unit} · ${event.category}`,
    '',
    `**Cause:** ${event.cause}`,
    `**Trend:** ${event.trend}`,
  ];
  if (event.advisory && event.advisory !== 'none') lines.push(`**Active advisory:** ${event.advisory}`);
  lines.push('', `**Source:** ${event.source}`, '', `**Suggested marketing angle:** ${event.marketingAngle}`, '', `_First seen: ${new Date(state.firstSeen).toISOString()}_`);
  return lines.join('\n');
}

async function main() {
  const now = Date.now();
  const state = await readJson(STATE_PATH, {});

  const readings = await fetchDeterministicReadings();
  const enrichmentResult = await enrichAndFindAdditional(readings);
  const events = mergeEvents(readings, enrichmentResult);

  const seenKeys = new Set();

  for (const event of events) {
    seenKeys.add(event.locationKey);
    const existing = state[event.locationKey];

    const isNew = !existing;
    const escalated = existing && existing.tier !== 'alert' && event.tier === 'alert';
    const staleAlertReminder =
      existing && event.tier === 'alert' && existing.tier === 'alert' && now - existing.lastAlertedAt > REALERT_WINDOW_MS;

    const shouldReport = isNew || escalated || staleAlertReminder;

    const nextState = {
      region: `${event.region}, ${event.stateOrProvince}`,
      tier: event.tier,
      firstSeen: existing?.firstSeen ?? now,
      lastAlertedAt: shouldReport ? now : existing?.lastAlertedAt ?? null,
      issueNumber: existing?.issueNumber ?? null,
    };

    if (shouldReport) {
      if (isNew) {
        nextState.issueNumber = await createIssue({
          title: `[${event.tier.toUpperCase()}] ${event.region}, ${event.stateOrProvince} — ${event.value != null ? `${event.value} ${event.unit}` : event.unit}`,
          body: issueBody(event, nextState),
          labels: [event.tier],
        });
        console.log(`Opened issue #${nextState.issueNumber} for ${event.locationKey}`);
      } else {
        const reason = escalated ? 'Escalated to ALERT' : 'Still elevated (24h reminder)';
        await addComment(nextState.issueNumber, `**${reason}** — ${issueBody(event, nextState)}`);
        console.log(`Commented on issue #${nextState.issueNumber} for ${event.locationKey} (${reason})`);
      }
    }

    state[event.locationKey] = nextState;
  }

  for (const key of Object.keys(state)) {
    if (seenKeys.has(key)) continue;
    const entry = state[key];
    if (entry.issueNumber) {
      await closeIssue(entry.issueNumber, 'No longer elevated as of this check — closing.');
      console.log(`Closed issue #${entry.issueNumber} for ${key} (resolved)`);
    }
    delete state[key];
  }

  await writeJson(STATE_PATH, state);
  console.log(`Done. ${readings.length} from the numeric feed, ${enrichmentResult.additionalEvents.length} additional advisory-only location(s), ${events.length} total this run.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
