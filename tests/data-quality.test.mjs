import test from 'node:test';
import assert from 'node:assert/strict';
import { appendSnapshots, computeElevatedHours, topOpportunities } from '../scripts/lib/metrics.mjs';
import { parseWaqi } from '../scripts/lib/waqi.mjs';

const now = Date.parse('2026-10-01T20:00:00Z');
const minute = 60_000;
const reading = { id: 'market', tier: 'alert', value: 195, unit: 'AQI', population: 100000, lat: 40, lon: -100, freshness:'fresh', observedAt:new Date(now).toISOString() };
const sample = (minutesAgo, tier = 'alert') => ({ qualityVersion:2, region_key: 'market', observed_at:now-minutesAgo*minute, captured_at: now - minutesAgo * minute, tier, value: tier === 'ignore' ? 40 : 195, unit: 'AQI' });

test('stale high values cannot displace current opportunities', () => {
  const stale = { ...reading, id: 'cached', value: 500, stale: true };
  assert.deepEqual(topOpportunities([stale, reading]).map(r => r.id), ['market']);
});
test('cached fallback data do not create new history', () => {
  assert.deepEqual(appendSnapshots([], [{ ...reading, stale: true }], now), []);
});
test('recovery observations are retained to break future streaks', () => {
  const result = appendSnapshots([], [{ ...reading, tier: 'ignore', value: 40 }], now);
  assert.equal(result.length, 1);
  assert.equal(result[0].tier, 'ignore');
});
test('a day-long outage cannot become a 24-hour elevated event', () => {
  assert.equal(computeElevatedHours(reading, [sample(1440)], now), null);
});
test('a recent continuous streak still produces its duration', () => {
  assert.equal(computeElevatedHours(reading, [sample(60), sample(30)], now), 1);
});
test('a clean-air interval stops a streak even without a scheduling gap', () => {
  assert.equal(computeElevatedHours(reading, [sample(90), sample(60, 'ignore'), sample(30)], now), 0.5);
});
test('stale, recovered, or future-dated observations cannot establish duration', () => {
  assert.equal(computeElevatedHours({ ...reading, stale: true }, [sample(30)], now), null);
  assert.equal(computeElevatedHours({ ...reading, tier: 'ignore' }, [sample(30)], now), null);
  assert.equal(computeElevatedHours(reading, [sample(-30)], now), null);
});
test('WAQI failures propagate to the existing cache fallback handler', () => {
  for (const raw of ['invalid', 'null', '{"status":"error","data":"token problem"}', '{"status":"ok","data":null}']) {
    assert.throws(() => parseWaqi(raw, { strict: true }), /WAQI/);
    assert.deepEqual(parseWaqi(raw), []);
  }
  assert.deepEqual(parseWaqi('{"status":"ok","data":[]}'), []);
});
test('WAQI blank values are missing, while an explicit zero remains valid', () => {
  const data = ['', ' ', '-', null, 0, '195'].map((aqi, uid) => ({ uid, aqi, lat: 40, lon: -100, station: { name: 'Sample' } }));
  assert.deepEqual(parseWaqi(JSON.stringify({ status: 'ok', data })).map(r => r.value), [0, 195]);
});
