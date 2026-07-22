const EARTH_RADIUS_KM = 6371;
const NEAREST_MAX_KM = 50;

function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const rLat1 = (lat1 * Math.PI) / 180;
  const rLat2 = (lat2 * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

export function buildPopulationIndex(cities) {
  const byNameState = new Map();
  for (const city of cities) {
    byNameState.set(`${city.state}|${city.city.toLowerCase()}`, city);
  }
  return { cities, byNameState };
}

export function matchPopulation(reading, index) {
  if (reading.state) {
    const exact = index.byNameState.get(`${reading.state}|${reading.name.toLowerCase()}`);
    if (exact) return { population: exact.population, matchType: 'exact', matchedCity: exact.city, matchedState: exact.state };
  }

  if (reading.lat == null || reading.lon == null) {
    return { population: null, matchType: null, matchedCity: null, matchedState: null };
  }

  let best = null;
  let bestDist = Infinity;
  for (const city of index.cities) {
    const d = haversineKm(reading.lat, reading.lon, city.lat, city.lon);
    if (d < bestDist) {
      bestDist = d;
      best = city;
    }
  }

  if (best && bestDist <= NEAREST_MAX_KM) {
    return { population: best.population, matchType: 'nearest', matchedCity: best.city, matchedState: best.state };
  }

  return { population: null, matchType: null, matchedCity: null, matchedState: null };
}
