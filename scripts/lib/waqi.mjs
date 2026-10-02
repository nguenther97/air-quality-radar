function detectCountry(name) {
  if (/\bCanada\b/i.test(name)) return 'CA';
  if (/\b(USA|United States)\b/i.test(name)) return 'US';
  if (/\b(Mexico|México)\b/i.test(name)) return 'MX';
  return null;
}

function aqiCategory(aqi) {
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very Unhealthy';
  return 'Hazardous';
}

export function parseWaqi(rawText, { strict = false } = {}) {
  let json;
  try { json = JSON.parse(rawText); } catch {
    if (strict) throw new Error('WAQI returned invalid JSON');
    return [];
  }
  // Propagate failures so fetchSource preserves its cache and shows an outage.
  // Do not echo provider responses: they may contain credential details.
  if (json?.status !== 'ok' || !Array.isArray(json.data)) {
    if (strict) throw new Error('WAQI returned an unsuccessful or malformed response');
    return [];
  }

  const out = [];
  for (const station of json.data) {
    const lat = Number(station.lat);
    const lon = Number(station.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const aqiRaw = station.aqi;
    if (aqiRaw === '-' || aqiRaw == null || String(aqiRaw).trim() === '') continue;
    const aqi = Number(aqiRaw);
    if (!Number.isFinite(aqi) || aqi < 0) continue;

    const name = station.station?.name ?? `WAQI-${station.uid}`;
    const country = detectCountry(name);
    if (country === 'MX') continue;

    out.push({
      id: `WAQI|${station.uid}`,
      country,
      countryVerified: country != null,
      state: null,
      name,
      lat,
      lon,
      unit: 'AQI',
      value: aqi,
      category: aqiCategory(aqi),
      source: 'WAQI',
      observedAt: station.time?.iso ?? station.station?.time?.iso ?? null,
      sourceUrl: 'https://waqi.info/',
    });
  }
  return out;
}
