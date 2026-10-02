export const MAX_OBSERVATION_AGE_MS = 3 * 60 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 10 * 60 * 1000;
const OFFSETS = { UTC: 0, GMT: 0, EST: -5, EDT: -4, CST: -6, CDT: -5, MST: -7, MDT: -6, PST: -8, PDT: -7, AKST: -9, AKDT: -8, HST: -10, AST: -4, ADT: -3, NST: -3.5, NDT: -2.5 };
export function airNowTimestamp(date, time, zone) {
  const d = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec((date || '').trim());
  const t = /^(\d{1,2}):(\d{2})$/.exec((time || '').trim());
  const offset = OFFSETS[(zone || '').trim().toUpperCase()];
  if (!d || !t || offset == null || +t[1] > 23 || +t[2] > 59 || +d[1]<1 || +d[1]>12 || +d[2]<1 || +d[2]>31) return null;
  const year = +d[3] < 100 ? 2000 + +d[3] : +d[3];
  if(new Date(Date.UTC(year,+d[1]-1,+d[2])).getUTCMonth()!==+d[1]-1) return null;
  const ms = Date.UTC(year,+d[1]-1,+d[2],+t[1],+t[2]) - offset*3600000;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}
export function observationMs(reading) {
  const value = reading.observedAt;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}
export function freshnessOf(reading, now) {
  if (reading.stale) return 'stale';
  const ms = observationMs(reading);
  if (ms == null || ms > now + FUTURE_TOLERANCE_MS) return 'unknown';
  return now - ms > MAX_OBSERVATION_AGE_MS ? 'stale' : 'fresh';
}
