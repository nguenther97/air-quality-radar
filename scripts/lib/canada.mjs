export function parseCanadaAQHI(geojson) {
  const out = [];
  for (const feature of geojson.features ?? []) {
    const p = feature.properties ?? {};
    if (p.latest === false) continue;

    const aqhi = Number(p.aqhi);
    if (!Number.isFinite(aqhi)) continue;

    const name = (p.location_name_en ?? '').trim();
    const locationId = (p.location_id ?? '').trim();
    if (!name || !locationId) continue;

    const coords = feature.geometry?.coordinates;

    out.push({
      id: `CA|${locationId}|${name}`,
      country: 'CA',
      state: null, // Environment Canada's feed has no province field; filled in from the nearest-city population match.
      name,
      lat: Array.isArray(coords) ? Number(coords[1]) : null,
      lon: Array.isArray(coords) ? Number(coords[0]) : null,
      unit: 'AQHI',
      value: aqhi,
      category: aqhiRiskLabel(aqhi),
      source: 'EC AQHI',
      observedAt: p.observation_datetime ?? null,
    });
  }
  return out;
}

function aqhiRiskLabel(value) {
  if (value < 4) return 'Low Risk';
  if (value < 7) return 'Moderate Risk';
  if (value < 10) return 'High Risk';
  return 'Very High Risk';
}

const FORECAST_WINDOW_MIN_MS = 18 * 60 * 60 * 1000;
const FORECAST_WINDOW_MAX_MS = 30 * 60 * 60 * 1000;

export function parseCanadaAQHIForecast(geojson, nowMs) {
  const byLocation = new Map();

  for (const feature of geojson.features ?? []) {
    const p = feature.properties ?? {};
    const aqhi = Number(p.aqhi);
    const locationId = (p.location_id ?? '').trim();
    const name = (p.location_name_en ?? '').trim();
    const forecastAt = p.forecast_datetime ? Date.parse(p.forecast_datetime) : NaN;
    if (!Number.isFinite(aqhi) || !locationId || !name || !Number.isFinite(forecastAt)) continue;

    const age = forecastAt - nowMs;
    if (age < FORECAST_WINDOW_MIN_MS || age > FORECAST_WINDOW_MAX_MS) continue;

    const id = `CA|${locationId}|${name}`;
    const existing = byLocation.get(id);
    if (existing && existing.value >= aqhi) continue;
    byLocation.set(id, { id, dayOffset: 1, unit: 'AQHI', value: aqhi, category: aqhiRiskLabel(aqhi) });
  }

  return [...byLocation.values()];
}
