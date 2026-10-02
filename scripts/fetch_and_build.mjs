import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAirNow, parseAirNowForecast } from './lib/airnow.mjs';
import { parseCanadaAQHI, parseCanadaAQHIForecast } from './lib/canada.mjs';
import { parseWaqi } from './lib/waqi.mjs';
import { assembleDashboard } from './lib/dashboard.mjs';
import { renderDashboard } from './lib/render.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AIRNOW_URL = 'https://files.airnowtech.org/airnow/today/reportingarea.dat';
const CANADA_URL = 'https://api.weather.gc.ca/collections/aqhi-observations-realtime/items?f=json&limit=2000&latest=true';
const CANADA_FORECAST_URL = 'https://api.weather.gc.ca/collections/aqhi-forecasts-realtime/items?f=json&limit=2000';

async function fetchText(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
async function readJson(rel, fallback) {
  try { return JSON.parse(await readFile(path.join(ROOT,rel),'utf8')); } catch { return fallback; }
}
async function writeJson(rel,value) {
  await writeFile(path.join(ROOT,rel),JSON.stringify(value)+'\n','utf8');
}
export async function fetchSource(name,url,parse,cache,{ cachedOnly=false,now=Date.now() }={}) {
  try {
    if (cachedOnly || !url) throw new Error(url ? 'Using saved observations' : 'Feed is not configured');
    const raw = await fetchText(url);
    const readings = parse(raw);
    if (!readings.length) throw new Error('No valid observations returned');
    cache[name] = { fetchedAt:now,readings };
    return { readings:readings.map(r=>({...r,fetchedAt:now})),raw,
      status:{source:name,ok:true,fetchedAt:now,count:readings.length} };
  } catch (err) {
    const cached=cache[name];
    return {readings:(cached?.readings || []).map(r=>({...r,stale:true,fetchedAt:cached.fetchedAt})),raw:null,
      status:{source:name,ok:false,fetchedAt:cached?.fetchedAt || null,count:cached?.readings?.length || 0,
        error:!url ? 'Feed is not configured' : cachedOnly ? 'Using saved observations' : 'Refresh failed; showing saved observations'} };
  }
}
function parseCanada(raw) {
  const json=JSON.parse(raw);
  if (!Array.isArray(json.features)) throw new Error('Invalid Canadian response');
  if (json.links?.some(l=>l.rel==='next')) throw new Error('Canadian response incomplete');
  return parseCanadaAQHI(json);
}
export async function main({cachedOnly=false}={}) {
  const now=Date.now();
  const cache=await readJson('data/last_good_readings.json',{});
  const cities=await readJson('data/cities_us_ca.json',[]);
  const token=process.env.WAQI_TOKEN || '';
  const waqiUrl=token ? `https://api.waqi.info/v2/map/bounds/?latlng=24,-130,60,-55&networks=all&token=${encodeURIComponent(token)}` : null;
  const [airnow,canada,waqi,canadaForecastRaw]=await Promise.all([
    fetchSource('AirNow',AIRNOW_URL,parseAirNow,{...cache,AirNow:cache.airnow},{cachedOnly,now}),
    fetchSource('EC AQHI',CANADA_URL,parseCanada,{...cache,'EC AQHI':cache.canada},{cachedOnly,now}),
    fetchSource('WAQI',waqiUrl,raw=>parseWaqi(raw,{strict:true}),{...cache,WAQI:cache.waqi},{cachedOnly,now}),
    cachedOnly ? null : fetchText(CANADA_FORECAST_URL).catch(()=>null),
  ]);
  const sources=[airnow,canada,waqi];
  for (const [i,key] of ['airnow','canada','waqi'].entries()) {
    if (sources[i].status.ok) cache[key]={fetchedAt:now,readings:sources[i].readings};
  }
  let canadianForecasts=[];
  try { if(canadaForecastRaw) canadianForecasts=parseCanadaAQHIForecast(JSON.parse(canadaForecastRaw),now); } catch {}
  const result=assembleDashboard({now,cities,sourceStatus:sources.map(s=>s.status),
    readings:sources.flatMap(s=>s.readings),snapshots:await readJson('data/snapshots.json',[]),
    forecasts:[...(airnow.raw ? parseAirNowForecast(airnow.raw) : []),...canadianForecasts]});
  await mkdir(path.join(ROOT,'docs'),{recursive:true});
  await writeFile(path.join(ROOT,'docs/index.html'),renderDashboard(result.data),'utf8');
  for (const file of ['app.js','styles.css']) await copyFile(path.join(ROOT,'scripts/ui',file),path.join(ROOT,'docs',file));
  if(!cachedOnly) {
    await writeJson('data/last_good_readings.json',cache);
    await writeJson('data/snapshots.json',result.snapshots);
  }
  console.log(JSON.stringify({markets:result.data.markets.length,readings:result.data.readings.length,
    fresh:result.data.readings.filter(r=>r.freshness==='fresh').length,
    priorities:result.data.topOpportunities.length,sources:result.data.sourceStatus}));
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main({cachedOnly:process.argv.includes('--cached')}).catch(err=>{console.error(err);process.exitCode=1;});
}
