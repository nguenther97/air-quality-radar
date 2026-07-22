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
