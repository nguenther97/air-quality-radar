import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

import { createIssue, addComment, closeIssue } from './lib/github.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE_PATH = 'data/alert_state.json';
const REALERT_WINDOW_MS = 24 * 60 * 60 * 1000;

const EVENT_SCHEMA = {
  type: 'object',
  properties: {
    events: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          locationKey: {
            type: 'string',
            description: "Stable unique id for this specific metro/city/station, e.g. 'US-CA-Los Angeles' or 'CA-ON-Toronto'. Never a province- or region-wide key.",
          },
          region: { type: 'string', description: 'City or metro name' },
          stateOrProvince: { type: 'string' },
          country: { type: 'string', enum: ['US', 'CA'] },
          tier: { type: 'string', enum: ['alert', 'watch'] },
          value: { type: 'string', description: 'The AQI or AQHI number as a string, or "n/a" if this is an advisory-only event with no numeric reading' },
          unit: { type: 'string', enum: ['AQI', 'AQHI', 'advisory'] },
          category: { type: 'string', description: 'e.g. "Unhealthy", "Very Unhealthy", "Active wildfire smoke advisory"' },
          cause: { type: 'string', description: 'e.g. wildfire smoke, ozone, particulate, dust storm' },
          trend: { type: 'string', description: 'What the data/forecast says about direction — worsening, improving, steady, or forecast detail' },
          source: { type: 'string', description: 'Named source, e.g. "AirNow", "Environment Canada AQHI", "IQAir", or the specific advisory issuer' },
          marketingAngle: {
            type: 'string',
            description: "One specific, region-tailored marketing suggestion for Alen Air (an air purifier brand) — reflect the region's character (dense urban metro vs affluent suburb vs rural), not a generic template.",
          },
        },
        required: ['locationKey', 'region', 'stateOrProvince', 'country', 'tier', 'value', 'unit', 'category', 'cause', 'trend', 'source', 'marketingAngle'],
        additionalProperties: false,
      },
    },
  },
  required: ['events'],
  additionalProperties: false,
};

const PROMPT = `You are researching current air quality conditions across the US and Canada for Alen Air, an air purifier brand, to time geo-targeted marketing pushes.

Search and read from AirNow (current conditions + wildfire smoke map: airnow.gov), Environment Canada's AQHI conditions (weather.gc.ca), and IQAir's city/world air quality ranking pages. Cover major metro areas and large population centers across the US and Canada — do not limit yourself to a fixed city list. Actively look for official health/wildfire-smoke advisories, not just numeric readings, since those can indicate a metro-wide event even where a single station's number looks unremarkable.

Classify each elevated location you find:
- ALERT: US AQI >= 151, OR an active official health/wildfire-smoke advisory covering a metro area.
- WATCH: AQI 101-150.
- Ignore anything AQI <= 100 or Environment Canada AQHI Low/Moderate Risk with no advisory.

For Canada, use Environment Canada's AQHI scale: 7-9 = WATCH, 10+ = ALERT.

Return one entry per distinct city/metro/monitoring station — never aggregate multiple cities under one province-wide or region-wide entry, since a single wildfire-smoke event can hit several cities in the same province at once and each needs to be tracked independently.

For each entry, write one specific, region-tailored marketing angle for Alen Air: reflect what you know or can infer about that region (dense urban metro vs affluent suburb vs rural, likely demographics, income level) rather than a generic "buy an air purifier" line.

If nothing anywhere currently qualifies for ALERT or WATCH, return an empty events array.`;

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

async function gatherEvents() {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 8000,
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 10 }],
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: EVENT_SCHEMA } },
    messages: [{ role: 'user', content: PROMPT }],
  });

  if (response.stop_reason === 'refusal') {
    console.error('Model declined the request; treating as no events this run.');
    return [];
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) return [];
  return JSON.parse(textBlock.text).events;
}

function issueBody(event, state) {
  return [
    `**${event.region}, ${event.stateOrProvince} (${event.country})** — ${event.value} ${event.unit} · ${event.category}`,
    '',
    `**Cause:** ${event.cause}`,
    `**Trend:** ${event.trend}`,
    `**Source:** ${event.source}`,
    '',
    `**Suggested marketing angle:** ${event.marketingAngle}`,
    '',
    `_First seen: ${new Date(state.firstSeen).toISOString()}_`,
  ].join('\n');
}

async function main() {
  const now = Date.now();
  const state = await readJson(STATE_PATH, {});
  const events = await gatherEvents();

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
          title: `[${event.tier.toUpperCase()}] ${event.region}, ${event.stateOrProvince} — ${event.value} ${event.unit}`,
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
  console.log(`Done. ${events.length} elevated location(s) this run.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
