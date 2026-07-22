const US_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
  'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK',
  'OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC','PR','VI','GU','AS','MP',
]);

const CA_PROVINCES = new Set(['AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT']);

export function parseAirNow(rawText) {
  const groups = new Map();

  for (const line of rawText.split('\n')) {
    const row = line.trim();
    if (!row) continue;
    const cols = row.split('|');
    if (cols.length < 17) continue;

    const [
      , , observationTime, timeZone, , typeFlag, latestFlag, reportingArea, stateAbbrev,
      latitude, longitude, , aqiRaw, category,
    ] = cols;

    if (typeFlag !== 'O' || latestFlag !== 'Y') continue;
    const state = stateAbbrev.trim().toUpperCase();
    const country = US_STATES.has(state) ? 'US' : CA_PROVINCES.has(state) ? 'CA' : null;
    if (!country) continue;

    const aqi = Number(aqiRaw);
    if (!Number.isFinite(aqi)) continue;

    const key = `${country}|${state}|${reportingArea.trim()}`;
    const existing = groups.get(key);
    if (existing && existing.value >= aqi) continue;

    groups.set(key, {
      id: key,
      country,
      state,
      name: reportingArea.trim(),
      lat: Number(latitude) || null,
      lon: Number(longitude) || null,
      unit: 'AQI',
      value: aqi,
      category: category.trim(),
      source: 'AirNow',
      observedAt: observationTime.trim(),
      timeZone: timeZone.trim(),
    });
  }

  return [...groups.values()];
}
