function detectCountry(lat, lon) {
  if (lat > 49.5) return 'CA';
  if (lat > 48.5 && lon < -120) return 'CA';
  return 'US';
}

function aqiCategory(aqi) {
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very Unhealthy';
  return 'Hazardous';
}

export function parseWaqi(rawText) {
  let json;
  try { json = JSON.parse(rawText); } catch { return []; }
  if (json.status !== 'ok' || !Array.isArray(json.data)) return [];

  const out = [];
  for (const station of json.data) {
    const lat = Number(station.lat);
    const lon = Number(station.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const aqiRaw = station.aqi;
    if (aqiRaw === '-' || aqiRaw == null) continue;
    const aqi = Number(aqiRaw);
    if (!Number.isFinite(aqi) || aqi < 0) continue;

    const country = detectCountry(lat, lon);
    const name = station.station?.name ?? `WAQI-${station.uid}`;

    out.push({
      id: `WAQI|${station.uid}`,
      country,
      state: null,
      name,
      lat,
      lon,
      unit: 'AQI',
      value: aqi,
      category: aqiCategory(aqi),
      source: 'WAQI',
    });
  }
  return out;
}
