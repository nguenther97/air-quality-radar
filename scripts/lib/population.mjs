import { US_STATES, CA_PROVINCES } from './airnow.mjs';

const empty = () => ({ population: null, matchType: null, matchedCity: null, matchedState: null, marketKey: null });
export function normalizePlace(name = '') {
  return name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\bsaint\b/g, 'st').replace(/[^a-z0-9]+/g, ' ').trim();
}
export function haversineKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const a = Math.sin((lat2-lat1)*rad/2)**2 + Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin((lon2-lon1)*rad/2)**2;
  return 12742 * Math.asin(Math.sqrt(Math.min(1,a)));
}
function countryOf(city) { return CA_PROVINCES.has(city.state) ? 'CA' : US_STATES.has(city.state) ? 'US' : null; }
export function buildPopulationIndex(cities) { return { cities }; }
export function matchPopulation(reading, index) {
  // A nearest suburb is not the population of a regional reporting area.
  const name = normalizePlace(reading.name);
  const named = index.cities.filter(c => (!reading.state || c.state === reading.state)
    && (!reading.country || countryOf(c) === reading.country) && normalizePlace(c.city) === name);
  const located = Number.isFinite(reading.lat) && Number.isFinite(reading.lon);
  const nearby = candidates => located ? candidates.filter(c => haversineKm(reading.lat,reading.lon,c.lat,c.lon) <= 50) : candidates;
  let candidates = nearby(named);
  let matchType = 'name';
  if (!candidates.length && reading.source === 'WAQI' && located) {
    const stationCity = normalizePlace((reading.name || '').split(/[,-]/)[0]);
    candidates = index.cities.filter(c => normalizePlace(c.city) === stationCity
      && (!reading.state || c.state === reading.state) && (!reading.country || countryOf(c) === reading.country)
      && haversineKm(reading.lat,reading.lon,c.lat,c.lon) <= 15);
    matchType = 'station-name';
  }
  if (candidates.length !== 1) return empty();
  const city = candidates[0];
  if (!reading.state && !located) return empty();
  return { population: Number.isFinite(city.population) ? city.population : null, matchType,
    matchedCity: city.city, matchedState: city.state, matchedCountry: countryOf(city),
    marketKey: `${countryOf(city)}|${city.state}|${normalizePlace(city.city)}` };
}
