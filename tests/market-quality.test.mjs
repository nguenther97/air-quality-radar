import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildPopulationIndex,matchPopulation } from '../scripts/lib/population.mjs';
import { freshnessOf,airNowTimestamp } from '../scripts/lib/freshness.mjs';
import { parseAirNow,parseAirNowForecast } from '../scripts/lib/airnow.mjs';
import { parseCanadaAQHI,parseCanadaAQHIForecast } from '../scripts/lib/canada.mjs';
import { parseWaqi } from '../scripts/lib/waqi.mjs';
import { assembleDashboard } from '../scripts/lib/dashboard.mjs';
import { appendSnapshots,pruneSnapshots,topOpportunities } from '../scripts/lib/metrics.mjs';
import { renderDashboard } from '../scripts/lib/render.mjs';
import { fetchSource } from '../scripts/fetch_and_build.mjs';

const now=Date.parse('2026-10-01T22:00:00Z');
const cities=JSON.parse(await readFile(new URL('../data/cities_us_ca.json',import.meta.url)));
const index=buildPopulationIndex(cities);
const base={id:'US|CA|Hanford',name:'Hanford',state:'CA',country:'US',lat:36.325,lon:-119.647,source:'AirNow',unit:'AQI',value:110,observedAt:'2026-10-01T21:00:00Z'};

test('Saint Louis resolves to St. Louis, not its nearest suburb',()=>{
 const result=matchPopulation({...base,name:'Saint Louis',state:'MO',lat:38.6332,lon:-90.7075},index);
 assert.equal(result.matchedCity,'St. Louis');assert.equal(result.population,2129918);
});
test('a multi-city reporting area does not inherit a suburb population',()=>{
 const result=matchPopulation({...base,name:'Cleveland-Akron-Lorain',state:'OH',lat:41.3831,lon:-81.4168},index);
 assert.equal(result.population,null);assert.equal(result.matchedCity,null);
});
test('station and reporting area with a verified Hanford name share a market',()=>{
 const a=matchPopulation(base,index);
 const b=matchPopulation({...base,name:'Hanford-S Irwin Street, Kings, California',state:null,source:'WAQI',lat:36.31572,lon:-119.64323},index);
 assert.equal(a.marketKey,b.marketKey);assert.equal(b.matchedCity,'Hanford');
});
test('a mismatched country cannot borrow a same-named population',()=>{
 assert.equal(matchPopulation({...base,country:'CA'},index).population,null);
});
test('AirNow observation retains date, timezone, and pollutant',()=>{
 const line='10/01/26|10/01/26|13:00|PDT|0|O|Y|Hanford|CA|36.325|-119.647|PM2.5|110|Unhealthy for Sensitive Groups|No||Agency';
 const r=parseAirNow(line)[0];assert.equal(r.observedAt,'2026-10-01T20:00:00.000Z');assert.equal(r.pollutant,'PM2.5');assert.equal(freshnessOf(r,now),'fresh');
 assert.equal(airNowTimestamp('10/01/26','13:00','BAD'),null);
});
test('unknown, old, fallback, and future observations do not count as current',()=>{
 assert.equal(freshnessOf({...base,observedAt:'13:00'},now),'unknown');
 assert.equal(freshnessOf({...base,observedAt:'2026-09-29T13:00:00Z'},now),'stale');
 assert.equal(freshnessOf({...base,stale:true},now),'stale');
 assert.equal(freshnessOf({...base,observedAt:'2026-10-02T13:00:00Z'},now),'unknown');
});
test('AQHI 10 is high risk; missing values are not zero',()=>{
 const feature=value=>({properties:{location_id:'X',location_name_en:'Test',aqhi:value,observation_datetime:base.observedAt},geometry:{coordinates:[-100,50]}});
 assert.equal(parseCanadaAQHI({features:[feature(10)]})[0].category,'High Risk');
 assert.equal(parseCanadaAQHI({features:[feature(null),feature('')] }).length,0);
});
test('next available forecast preserves actual date and offset',()=>{
 const line='10/01/26|10/03/26||PDT|2|F|Y|Hanford|CA|36.325|-119.647|PM2.5|90|Moderate|No||Agency';
 const f=parseAirNowForecast(line)[0];assert.equal(f.dayOffset,2);assert.equal(f.validDate,'10/03/26');
});
test('assembly groups known duplicate markets but keeps all readings and normal conditions',()=>{
 const station={...base,id:'WAQI|281',source:'WAQI',name:'Hanford-S Irwin Street, Kings, California',state:null,value:108};
 const clean={...base,id:'US|CA|Fresno',name:'Fresno',lat:36.7831,lon:-119.7941,value:30};
 const out=assembleDashboard({now,cities,readings:[base,station,clean],snapshots:[],sourceStatus:[]});
 assert.equal(out.data.readings.length,3);assert.equal(out.data.markets.length,2);
 assert.equal(out.data.topOpportunities.length,1);assert.equal(out.data.markets.find(m=>m.marketName==='Hanford').observations.length,2);
});
test('legacy undated snapshots are excluded and repeated observations are not duplicated',()=>{
 assert.deepEqual(pruneSnapshots([{region_key:'x',captured_at:now,value:300}],now),[]);
 const r={...base,freshness:'fresh',tier:'watch'};
 const first=appendSnapshots([], [r],now);assert.equal(first.length,1);
 assert.equal(appendSnapshots(first,[r],now+60000).length,1);
});
test('unknown-time readings cannot rank, while unknown population does not hide real exposure',()=>{
 assert.equal(topOpportunities([{...base,tier:'watch',freshness:'unknown'}]).length,0);
 assert.equal(topOpportunities([{...base,tier:'watch',freshness:'fresh',population:null}]).length,1);
});
test('WAQI country is not guessed from latitude',()=>{
 const result=parseWaqi(JSON.stringify({status:'ok',data:[{uid:1,aqi:20,lat:45.5,lon:-73.5,station:{name:'Unnamed'}}]}));
 assert.equal(result[0].country,null);
});
test('failed strict WAQI fetch retains the saved cache and marks fallback stale',async()=>{
 const oldFetch=globalThis.fetch;const cache={WAQI:{fetchedAt:now-60000,readings:[base]}};
 try{globalThis.fetch=async()=>({ok:true,text:async()=>'{"status":"error"}'});
 const result=await fetchSource('WAQI','https://example.test',raw=>parseWaqi(raw,{strict:true}),cache,{now});
 assert.equal(result.status.ok,false);assert.equal(result.readings[0].stale,true);assert.equal(cache.WAQI.fetchedAt,now-60000);
 }finally{globalThis.fetch=oldFetch;}
});
test('rendered data cannot escape the JSON script element',()=>{
 const html=renderDashboard({markets:[{name:'</script><script>alert(1)</script>'}]});
 assert.ok(!html.includes('<script>alert(1)</script>'));assert.ok(html.includes('\\u003c/script>'));
});
