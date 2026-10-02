(() => {
  'use strict';
  const DATA = JSON.parse(document.getElementById('aqr-data').textContent);
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels = { fresh:'Recent observation', stale:'Stale / saved reading', unknown:'Observation time unknown' };
  const trendLabels = { worsening:'Worsening', improving:'Improving', steady:'Steady', new:'Not enough history', unknown:'Trend unavailable' };
  let selectedKey = DATA.topOpportunities[0]?.marketKey || DATA.markets[0]?.marketKey;
  let selectedObservation = null;
  let priorityMode = false, limit = 60, map, markers, selectedMarker;
  let visible = [];
  function freshness(r) {
    if (r.stale) return 'stale';
    const date = /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(r.observedAt || '') ? Date.parse(r.observedAt) : NaN;
    if (!Number.isFinite(date) || date > Date.now()+600000) return 'unknown';
    return Date.now()-date > 10800000 ? 'stale' : 'fresh';
  }
  const dateText = value => { const d = new Date(value); return Number.isFinite(d.getTime()) ? d.toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}) : 'Not supplied'; };
  function ageText(r) {
    if(freshness(r)==='unknown') return 'Time unknown';
    const mins=Math.max(0,Math.floor((Date.now()-Date.parse(r.observedAt))/60000));
    if(!Number.isFinite(mins)) return 'Saved reading';
    return mins<60 ? `${mins}m ago` : mins<1440 ? `${Math.floor(mins/60)}h ${mins%60}m ago` : `${Math.floor(mins/1440)}d ago`;
  }
  function color(r) {
    if (freshness(r)!=='fresh') return '#87939e';
    if (r.unit==='AQHI') return r.value<4 ? '#529dbd' : r.value<7 ? '#e4bd43' : r.value<=10 ? '#d95656' : '#873853';
    return r.value<=50 ? '#4daa69' : r.value<=100 ? '#e4bd43' : r.value<=150 ? '#e88b3e' : r.value<=200 ? '#d95656' : r.value<=300 ? '#9d68ad' : '#873853';
  }
  const valueText = r => r.unit==='AQHI' ? (r.value>10 ? '10+' : String(Math.round(r.value*10)/10)) : String(Math.round(r.value));
  function priorityScore(r) {
    const normal=r.unit==='AQI' ? (r.value-100)/400 : (r.value-4)/8;
    return (r.tier==='alert'?2:r.tier==='watch'?1:0)+Math.max(0,Math.min(1,normal))*({worsening:1.2,improving:.8,new:1.05}[r.trend]||1);
  }
  function representative(items) {
    return [...items].sort((a,b)=>(freshness(b)==='fresh')-(freshness(a)==='fresh')
      || (b.source!=='WAQI')-(a.source!=='WAQI') || (Date.parse(b.observedAt)||0)-(Date.parse(a.observedAt)||0))[0];
  }
  function filtered() {
    const query=$('search').value.trim().toLowerCase();
    return DATA.markets.map(m=> {
      const items=m.observations.filter(r=>(!$('source').value || r.source===$('source').value)
        && (!$('country').value || (r.country || 'unknown')===$('country').value)
        && (!$('freshOnly').checked || freshness(r)==='fresh'));
      const r=representative(items);
      return r ? {...r,observations:items,marketKey:m.marketKey,marketName:m.marketName} : null;
    }).filter(Boolean).filter(r=> {
      const matches=!query || [r.marketName,r.state,r.country,...r.observations.map(o=>o.name)].join(' ').toLowerCase().includes(query);
      const tier=$('tier').value;
      return matches && (!tier || (tier==='elevated' ? r.tier!=='ignore' : r.tier===tier))
        && (!priorityMode || (freshness(r)==='fresh' && r.tier!=='ignore'));
    }).sort((a,b)=>priorityMode ? priorityScore(b)-priorityScore(a) || a.marketName.localeCompare(b.marketName)
      : (freshness(b)==='fresh')-(freshness(a)==='fresh') || priorityScore(b)-priorityScore(a) || a.marketName.localeCompare(b.marketName));
  }
  function renderSummary() {
    const recent=DATA.markets.map(m=>representative(m.observations)).filter(r=>freshness(r)==='fresh');
    $('marketCount').textContent=DATA.markets.length.toLocaleString();
    $('freshCount').textContent=recent.length.toLocaleString();
    $('priorityCount').textContent=recent.filter(r=>r.tier!=='ignore').length;
    $('updated').textContent='Built '+dateText(DATA.generatedAt);
    const problems=DATA.sourceStatus.filter(s=>!s.ok).map(s=>s.source+': '+s.error);
    const old=Date.now()-DATA.generatedAt>90*60000;
    const unknown=DATA.readings.filter(r=>freshness(r)==='unknown').length;
    const notes=[...(old?['This dashboard is overdue for a refresh.']:[]),...problems,
      ...(unknown?[`${unknown.toLocaleString()} ${unknown===1?'reading has':'readings have'} no verified observation time and ${unknown===1?'is':'are'} excluded from priorities.`]:[])];
    $('statusBanner').textContent=notes.join(' · ');
    $('statusBanner').hidden=!notes.length;
    $('sourceStatus').innerHTML=DATA.sourceStatus.map(s=>`<p><b>${escape(s.source)}</b> · ${s.ok?'Last fetch succeeded':'Refresh unavailable'} · ${s.count||0} readings<br>Fetched ${escape(s.fetchedAt?dateText(s.fetchedAt):'Never')}</p>`).join('');
  }
  function renderList() {
    $('resultCount').textContent=visible.length.toLocaleString();
    $('allView').setAttribute('aria-pressed',String(!priorityMode));
    $('priorityView').setAttribute('aria-pressed',String(priorityMode));
    $('listNote').textContent=priorityMode?'Recent elevated markets, ordered by severity and direction.':'Current elevated locations first. Select any location to explore.';
    $('marketList').innerHTML=visible.length ? visible.slice(0,limit).map(r=>`<button class="market-row ${r.marketKey===selectedKey?'selected':''}" data-market="${escape(r.marketKey)}" aria-pressed="${r.marketKey===selectedKey}"><span class="row-copy"><b>${escape(r.marketName)}</b><small>${escape([r.state,r.country].filter(Boolean).join(' · ') || 'Location unverified')} · ${r.observations.length} reading${r.observations.length===1?'':'s'}</small><small>${escape(ageText(r))} · ${escape(r.source)}</small></span><span class="aqi-chip" style="--signal:${color(r)}"><strong>${escape(valueText(r))}</strong><small>${escape(r.unit)}</small></span></button>`).join('') : '<p class="empty">No locations match these filters. Try clearing a filter or including older readings.</p>';
    $('marketList').querySelectorAll('[data-market]').forEach(b=>b.addEventListener('click',()=>select(b.dataset.market,true)));
    $('showMore').hidden=visible.length<=limit;
    $('showMore').textContent=`Show more (${Math.max(0,visible.length-limit)} remaining)`;
  }
  function historyChart(r) {
    const points=[...(r.history||[]),...(freshness(r)==='fresh'?[{at:Date.parse(r.observedAt),value:r.value}]:[])];
    const unique=[...new Map(points.filter(p=>Number.isFinite(p.at)).map(p=>[p.at,p])).values()].sort((a,b)=>a.at-b.at);
    if(unique.length<2) return '<p class="muted">A trend will appear after enough dated observations accumulate. Earlier undated history was excluded.</p>';
    const min=Math.min(...unique.map(p=>p.value)),max=Math.max(...unique.map(p=>p.value));
    const start=unique[0].at,end=unique.at(-1).at;
    const x=p=>10+(p.at-start)/(end-start||1)*260,y=p=>75-(p.value-min)/(max-min||1)*60;
    const path=unique.map((p,i)=>(!i || p.at-unique[i-1].at>90*60000?'M':'L')+x(p).toFixed(1)+','+y(p).toFixed(1)).join(' ');
    return `<svg class="spark" viewBox="0 0 280 90" role="img" aria-label="${escape(r.unit)} observations from ${escape(dateText(start))} to ${escape(dateText(end))}; minimum ${min}, maximum ${max}"><path d="${path}" fill="none" stroke="currentColor" stroke-width="2.5"/>${unique.map(p=>`<circle cx="${x(p)}" cy="${y(p)}" r="2.5" fill="currentColor"/>`).join('')}</svg><p class="chart-caption">${escape(dateText(start))} – ${escape(dateText(end))}</p><details><summary>View observation values</summary>${unique.slice(-24).map(p=>`<p>${escape(dateText(p.at))}: <b>${escape(p.value)} ${escape(r.unit)}</b></p>`).join('')}</details>`;
  }
  function renderDetail() {
    const m=visible.find(m=>m.marketKey===selectedKey);
    if(!m) { $('detail').innerHTML='<div class="detail-heading"><span class="eyebrow">LOCATION DETAIL</span><h2>Select a location</h2><p>Choose a map marker or a location from the list.</p></div>'; return; }
    const r=m.observations.find(r=>r.id===selectedObservation) || m;
    const f=r.forecastNextDay;
    const fDate=f?.validAt ? dateText(f.validAt) : f?.validDate || (f?.dayOffset===1 ? 'Next day' : `In ${f?.dayOffset} days`);
    const safeUrl = /^https:\/\//.test(r.sourceUrl||'') ? r.sourceUrl : r.source==='AirNow'?'https://www.airnow.gov/':r.source==='EC AQHI'?'https://weather.gc.ca/airquality/pages/index_e.html':'https://waqi.info/';
    $('detail').innerHTML=`<div class="detail-heading"><span class="eyebrow">LOCATION DETAIL</span><h2>${escape(m.marketName)}</h2><p>${escape([r.state,r.country].filter(Boolean).join(' · ') || 'Jurisdiction unverified')}</p></div>
      <div class="reading-card" style="--signal:${color(r)}"><span class="freshness ${freshness(r)}">${escape(labels[freshness(r)])}</span><div class="big-reading">${escape(valueText(r))}<span>${escape(r.unit)}</span></div><strong>${escape(r.category)}</strong><p>${escape(r.name)}</p></div>
      <dl class="facts"><div><dt>Observed</dt><dd>${escape(r.observedAt && freshness(r)!=='unknown'?dateText(r.observedAt):'Time not verified')}</dd></div><div><dt>Source</dt><dd><a href="${escape(safeUrl)}" target="_blank" rel="noopener">${escape(r.source)}</a></dd></div><div><dt>Main pollutant</dt><dd>${escape(r.pollutant || 'Not supplied')}</dd></div><div><dt>Planning tier</dt><dd>${r.tier==='ignore'?'Below watch':escape(r.tier.toUpperCase())}${freshness(r)!=='fresh'?' · not current':''}</dd></div><div><dt>Direction</dt><dd>${escape(freshness(r)==='fresh' ? trendLabels[r.trend] || 'Unavailable' : 'Unavailable')}</dd></div><div><dt>Observed elevated span</dt><dd>${freshness(r)==='fresh' && r.elevatedHours>0 ? `${r.elevatedHours.toFixed(1)}h · sampled, not continuous` : 'Not established'}</dd></div></dl>
      <section class="detail-section"><h3>Next available forecast</h3>${f?`<div class="forecast"><b>${escape(valueText(f))} ${escape(f.unit)}</b><span>${escape(f.category)}</span><small>Valid ${escape(fDate)} · forecast, not observed</small></div>`:'<p class="muted">No forecast is available from this source for this location.</p>'}</section>
      <section class="detail-section"><h3>Recent observations</h3>${historyChart(r)}</section>
      <section class="detail-section"><h3>Population reference</h3><p>${r.population!=null?`<b>${Math.round(r.population).toLocaleString()}</b> · ${escape(r.populationLocation)}<br><small>Bundled SimpleMaps place estimate. Not a verified exposure count; excluded from priority scoring.</small>`:'No verified place-name match. A nearby suburb’s population is not substituted.'}</p></section>
      <section class="detail-section"><h3>Readings in this market (${m.observations.length})</h3>${m.observations.map(o=>`<button class="observation" data-observation="${escape(o.id)}" aria-pressed="${o.id===r.id}"><b>${escape(o.source)} · ${escape(valueText(o))} ${escape(o.unit)}</b><small>${escape(o.name)} · ${escape(ageText(o))}</small></button>`).join('')}<p class="muted">AQI and AQHI are separate indices. Source readings are not averaged.</p></section>`;
    $('detail').querySelectorAll('[data-observation]').forEach(b=>b.addEventListener('click',()=>{selectedObservation=b.dataset.observation;renderDetail();}));
  }
  function renderMap() {
    if(!map) return;
    markers.clearLayers();selectedMarker=null;
    for(const r of visible) {
      if(!Number.isFinite(r.lat)||!Number.isFinite(r.lon))continue;
      const marker=L.circleMarker([r.lat,r.lon],{radius:r.marketKey===selectedKey?10:6,color:color(r),fillColor:color(r),fillOpacity:freshness(r)==='fresh'?.85:.35,weight:r.marketKey===selectedKey?3:1.5,dashArray:freshness(r)==='fresh'?null:'3 2'});
      marker.bindTooltip(`<b>${escape(r.marketName)}</b><br>${escape(valueText(r))} ${escape(r.unit)} · ${escape(labels[freshness(r)])}`);
      marker.on('click',()=>select(r.marketKey,false));marker.addTo(markers);
      const el=marker.getElement();if(el){el.setAttribute('tabindex','0');el.setAttribute('role','button');el.setAttribute('aria-label',`${r.marketName}, ${valueText(r)} ${r.unit}, ${labels[freshness(r)]}`);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(r.marketKey,false);}});}
      if(r.marketKey===selectedKey)selectedMarker=marker;
    }
  }
  function select(key,pan) {
    selectedKey=key;selectedObservation=null;renderList();renderDetail();renderMap();
    const r=visible.find(r=>r.marketKey===key);
    if(pan&&map&&r&&Number.isFinite(r.lat)&&Number.isFinite(r.lon))map.setView([r.lat,r.lon],7);
    if(pan&&window.innerWidth<760)$('detail').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function render() {
    visible=filtered();
    if(!visible.some(r=>r.marketKey===selectedKey)){selectedKey=visible[0]?.marketKey;selectedObservation=null;}
    renderSummary();renderList();renderMap();renderDetail();
  }
  try {const saved=localStorage.getItem('aqr-theme');if(saved)document.documentElement.dataset.theme=saved;}catch{}
  $('themeToggle').addEventListener('click',()=>{const dark=document.documentElement.dataset.theme==='dark';document.documentElement.dataset.theme=dark?'light':'dark';try{localStorage.setItem('aqr-theme',dark?'light':'dark');}catch{}});
  $('refreshBtn').addEventListener('click',()=>location.reload());
  if(typeof L!=='undefined') {
    map=L.map('map',{preferCanvas:false,scrollWheelZoom:true});
    map.fitBounds([[24,-130],[60,-60]],{padding:[20,20]});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
    markers=L.layerGroup().addTo(map);
  } else $('map').innerHTML='<p class="empty">The map could not load. All readings are still available in the location list.</p>';
  $('resetMap').addEventListener('click',()=>map?.fitBounds([[24,-130],[60,-60]],{padding:[20,20]}));
  for(const id of ['search','country','source','tier','freshOnly'])$(id).addEventListener(id==='search'?'input':'change',()=>{limit=60;render();});
  $('clearFilters').addEventListener('click',()=>{for(const id of ['search','country','source','tier'])$(id).value='';$('freshOnly').checked=false;priorityMode=false;limit=60;render();});
  $('allView').addEventListener('click',()=>{priorityMode=false;limit=60;render();});
  $('priorityView').addEventListener('click',()=>{priorityMode=true;limit=60;render();});
  $('showMore').addEventListener('click',()=>{limit+=60;renderList();});
  setInterval(render,60000);
  render();
})();
