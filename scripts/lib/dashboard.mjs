import { buildPopulationIndex, matchPopulation } from './population.mjs';
import { freshnessOf } from './freshness.mjs';
import { classify, pruneSnapshots, appendSnapshots, computeTrend, computeElevatedHours, topOpportunities } from './metrics.mjs';

export function assembleDashboard({ readings, cities, snapshots, forecasts = [], sourceStatus, now }) {
  const index = buildPopulationIndex(cities);
  const history = pruneSnapshots(snapshots, now);
  const forecastById = new Map();
  for (const f of forecasts) {
    const prev = forecastById.get(f.id);
    if (!prev || f.dayOffset < prev.dayOffset || (f.dayOffset === prev.dayOffset && f.value > prev.value)) forecastById.set(f.id,f);
  }
  const enriched = readings.filter(r => !(r.source === 'WAQI' && /\b(Mexico|México)\b/i.test(r.name))).map(input => {
    // Old WAQI cache entries used a latitude heuristic for country. Do not inherit it.
    const r = input.source === 'WAQI' && !input.countryVerified ? { ...input, country:null, state:null } : input;
    const population = matchPopulation(r,index);
    const fresh = freshnessOf(r,now);
    const base = { ...r, freshness:fresh, tier:classify(r.unit,r.value), population:population.population,
      populationMatch:population.matchType, populationLocation:population.matchedCity,
      state:r.state || population.matchedState, country:r.country || population.matchedCountry,
      marketKey:population.marketKey || r.id, marketName:population.matchedCity || r.name };
    const forecast = forecastById.get(r.id);
    return { ...base, trend:computeTrend(base,history,now), elevatedHours:computeElevatedHours(base,history,now),
      forecastNextDay:forecast ? { ...forecast, tier:classify(forecast.unit,forecast.value) } : null,
      history:history.filter(s => s.region_key === r.id).map(s=>({ at:s.observed_at,value:s.value })) };
  });
  // Keep every measurement. Group only verified place names for market navigation.
  const grouped = new Map();
  for (const r of enriched) {
    if (!grouped.has(r.marketKey)) grouped.set(r.marketKey,[]);
    grouped.get(r.marketKey).push(r);
  }
  const markets = [...grouped.entries()].map(([key,items]) => {
    const rank = r => (r.freshness === 'fresh' ? 10 : 0) + (r.source === 'AirNow' || r.source === 'EC AQHI' ? 2 : 0);
    items.sort((a,b)=>rank(b)-rank(a) || (Date.parse(b.observedAt)||0)-(Date.parse(a.observedAt)||0) || a.id.localeCompare(b.id));
    return { ...items[0], marketKey:key, observations:items };
  });
  markets.sort((a,b)=>a.marketName.localeCompare(b.marketName));
  return { data: { version:'2026.10.01', generatedAt:now, sourceStatus, readings:enriched, markets,
    topOpportunities:topOpportunities(markets), historyPolicy:'New history uses dated observations; older undated samples were excluded.' },
    snapshots:appendSnapshots(history,enriched,now) };
}
