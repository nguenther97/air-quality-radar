import { observationMs } from './freshness.mjs';
export const MAX_POP = 14_000_000;

const TREND_WINDOW_MIN_MS = 2 * 60 * 60 * 1000;
const TREND_WINDOW_MAX_MS = 4 * 60 * 60 * 1000;
const STREAK_GAP_MS = 90 * 60 * 1000;
const SNAPSHOT_RETENTION_MS = 48 * 60 * 60 * 1000;
const ELEVATED_CAP_HOURS = 48;

export function classify(unit, value) {
  if (!Number.isFinite(value) || value < 0 || !['AQI','AQHI'].includes(unit)) return 'ignore';
  if (unit === 'AQI') {
    if (value <= 100) return 'ignore';
    if (value <= 150) return 'watch';
    return 'alert';
  }
  if (value < 7) return 'ignore';
  if (value < 10) return 'watch';
  return 'alert';
}

export function pruneSnapshots(snapshots, now) {
  return snapshots.filter((s) => s.qualityVersion === 2 && Number.isFinite(s.observed_at)
    && now >= s.observed_at && now - s.observed_at <= SNAPSHOT_RETENTION_MS);
}

export function appendSnapshots(snapshots, readings, now) {
  const next = [...snapshots];
  const seen = new Set(next.map(s => `${s.region_key}|${s.observed_at}`));
  for (const r of readings) {
    // Keep below-threshold samples so a recovery breaks an elevated streak.
    // Cached fallback readings are not new observations.
    const observed = observationMs(r);
    if (r.stale || r.freshness !== 'fresh' || observed == null || r.source === 'WAQI') continue;
    const key = `${r.id}|${observed}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push({ qualityVersion: 2, region_key: r.id, value: r.value, unit: r.unit, tier: r.tier, observed_at: observed, captured_at: now });
  }
  return next;
}

function historyFor(snapshots, regionKey) {
  return snapshots.filter((s) => s.qualityVersion === 2 && s.region_key === regionKey).sort((a, b) => b.observed_at - a.observed_at);
}

export function computeTrend(reading, snapshots, now) {
  if (reading.stale || reading.freshness !== 'fresh') return 'unknown';
  const history = historyFor(snapshots, reading.id);
  const candidate = history.find((s) => {
    const age = (observationMs(reading) ?? now) - s.observed_at;
    return age >= TREND_WINDOW_MIN_MS && age <= TREND_WINDOW_MAX_MS;
  });

  if (!candidate) return 'new';

  const delta = reading.value - candidate.value;
  if (reading.unit === 'AQI') {
    if (delta >= 15) return 'worsening';
    if (delta <= -15) return 'improving';
    return 'steady';
  }
  if (delta >= 1.5) return 'worsening';
  if (delta <= -1.5) return 'improving';
  return 'steady';
}

export function computeElevatedHours(reading, snapshots, now) {
  if (reading.stale || reading.freshness !== 'fresh' || reading.tier === 'ignore') return null;
  const observed = observationMs(reading);
  if (observed == null) return null;
  const history = historyFor(snapshots, reading.id);
  if (history.length === 0) return null;

  // Do not bridge an outage between the current reading and stored history.
  const latestAge = observed - history[0].observed_at;
  if (latestAge < 0 || latestAge > STREAK_GAP_MS || history[0].tier === 'ignore') return null;

  let streakStart = history[0].observed_at;
  for (let i = 0; i < history.length - 1; i++) {
    const gap = history[i].observed_at - history[i + 1].observed_at;
    if (gap > STREAK_GAP_MS || history[i + 1].tier === 'ignore') break;
    streakStart = history[i + 1].observed_at;
  }

  const hours = (observed - streakStart) / (60 * 60 * 1000);
  return Math.min(hours, ELEVATED_CAP_HOURS);
}

const TREND_MULTIPLIER = { worsening: 1.2, new: 1.05, steady: 1.0, improving: 0.8 };

export function scoreOpportunity(reading) {
  if (reading.stale || reading.freshness !== 'fresh' || !Number.isFinite(reading.value)) return null;

  const severityNorm =
    reading.unit === 'AQI'
      ? clamp01((reading.value - 100) / 400)
      : clamp01((reading.value - 4) / 8);
  const trendMultiplier = TREND_MULTIPLIER[reading.trend] ?? 1.0;

  // Population remains reference context until comparable market boundaries exist.
  return (reading.tier === 'alert' ? 2 : reading.tier === 'watch' ? 1 : 0) + severityNorm * trendMultiplier;
}

export function topOpportunities(readings, limit = 20) {
  const sorted = readings
    .filter((r) => r.tier !== 'ignore')
    .map((r) => ({ ...r, score: scoreOpportunity(r) }))
    .filter((r) => r.score != null)
    .sort((a, b) => b.score - a.score);
  const seen = new Set();
  return sorted.filter(r => { const key = r.marketKey || r.id; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, limit);
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}
