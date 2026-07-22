export const MAX_POP = 14_000_000;

const TREND_WINDOW_MIN_MS = 2 * 60 * 60 * 1000;
const TREND_WINDOW_MAX_MS = 4 * 60 * 60 * 1000;
const STREAK_GAP_MS = 30 * 60 * 1000;
const SNAPSHOT_RETENTION_MS = 48 * 60 * 60 * 1000;
const ELEVATED_CAP_HOURS = 48;

export function classify(unit, value) {
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
  return snapshots.filter((s) => now - s.captured_at <= SNAPSHOT_RETENTION_MS);
}

export function appendSnapshots(snapshots, readings, now) {
  const next = [...snapshots];
  for (const r of readings) {
    if (r.tier === 'ignore') continue;
    next.push({ region_key: r.id, value: r.value, unit: r.unit, tier: r.tier, captured_at: now });
  }
  return next;
}

function historyFor(snapshots, regionKey) {
  return snapshots.filter((s) => s.region_key === regionKey).sort((a, b) => b.captured_at - a.captured_at);
}

export function computeTrend(reading, snapshots, now) {
  const history = historyFor(snapshots, reading.id);
  const candidate = history.find((s) => {
    const age = now - s.captured_at;
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
  const history = historyFor(snapshots, reading.id);
  if (history.length === 0) return null;

  let streakStart = history[0].captured_at;
  for (let i = 0; i < history.length - 1; i++) {
    const gap = history[i].captured_at - history[i + 1].captured_at;
    if (gap > STREAK_GAP_MS) break;
    streakStart = history[i + 1].captured_at;
  }

  const hours = (now - streakStart) / (60 * 60 * 1000);
  return Math.min(hours, ELEVATED_CAP_HOURS);
}

const TREND_MULTIPLIER = { worsening: 1.2, new: 1.05, steady: 1.0, improving: 0.8 };

export function scoreOpportunity(reading) {
  if (reading.population == null || reading.lat == null || reading.lon == null) return null;

  const severityNorm =
    reading.unit === 'AQI'
      ? clamp01((reading.value - 100) / 400)
      : clamp01((reading.value - 4) / 8);
  const popNorm = clamp01(Math.sqrt(reading.population) / Math.sqrt(MAX_POP));
  const trendMultiplier = TREND_MULTIPLIER[reading.trend] ?? 1.0;

  return (0.6 * severityNorm + 0.4 * popNorm) * trendMultiplier;
}

export function topOpportunities(readings, limit = 3) {
  return readings
    .filter((r) => r.tier !== 'ignore')
    .map((r) => ({ ...r, score: scoreOpportunity(r) }))
    .filter((r) => r.score != null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}
