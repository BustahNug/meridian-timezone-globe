"use strict";

/* ======================= PLACE LOOKUP (predictive search-as-you-type) ======================= */
const placeInput = document.getElementById('placeSearchInput');
const placeBtn = document.getElementById('placeSearchBtn');
const lookupResults = document.getElementById('lookupResults');
const lookupCard = document.getElementById('lookupCard');
let lookupBusy = false;
let suggestSeq = 0; // guards against out-of-order async responses overwriting newer ones

/* ---- search ⓘ info-button popover ---- */
(function(){
  const btn = document.getElementById('lookupInfoBtn');
  const pop = document.getElementById('lookupInfoPopover');
  if(!btn || !pop) return;
  let leaveTimer = null;
  const show = ()=>{ clearTimeout(leaveTimer); pop.classList.add('show'); };
  const hide = ()=>{ pop.classList.remove('show'); };
  btn.addEventListener('mouseenter', show);
  btn.addEventListener('mouseleave', ()=>{ leaveTimer = setTimeout(()=>{ if(!pop.matches(':hover')) hide(); }, 120); });
  pop.addEventListener('mouseenter', ()=>clearTimeout(leaveTimer));
  pop.addEventListener('mouseleave', hide);
  btn.addEventListener('click', (e)=>{ e.stopPropagation(); pop.classList.toggle('show'); });
  document.addEventListener('click', (e)=>{ if(!e.target.closest('.lookup-hint-row')) hide(); });
})();

function dedupe(arr){
  const seen = new Set();
  return arr.filter(x=>{ if(!x || seen.has(x)) return false; seen.add(x); return true; });
}

/* Tries Photon (komoot) first — it's built for live search-as-you-type — and falls back
   to Nominatim if that fails, so one provider being slow/unavailable doesn't break search.
   Returns a normalized array [{lat, lon, label, shortName, countryName}], or null if both
   providers failed outright (as opposed to simply finding zero results). */
/* Offline fallback search against the embedded CITY_DATA. Each entry is
   [name, countryCode, adminCode, lat, lon, population]. Matches on city name
   or country name, ranked by match quality then population. */
/* When a full address doesn't match anything directly (street-level detail isn't in our
   offline city dataset), strip the house number/street-suffix/unit noise and try the
   remaining words as city-name candidates, longest trailing phrase first. This turns
   "1656 Ainsdale Dr Roseville, CA" into a search for "Roseville" so it can still resolve
   to the right city (and therefore the right time zone) even fully offline. */
const STREET_SUFFIXES = new Set(['st','street','dr','drive','ave','avenue','rd','road','blvd',
  'boulevard','ln','lane','ct','court','way','pl','place','ter','terrace','cir','circle',
  'pkwy','parkway','hwy','highway','apt','unit','ste','suite','#']);
const US_STATE_NAMES = new Set([
  'alabama','alaska','arizona','arkansas','california','colorado','connecticut','delaware',
  'florida','georgia','hawaii','idaho','illinois','indiana','iowa','kansas','kentucky',
  'louisiana','maine','maryland','massachusetts','michigan','minnesota','mississippi',
  'missouri','montana','nebraska','nevada','ohio','oklahoma','oregon','pennsylvania',
  'tennessee','texas','utah','vermont','virginia','washington','wisconsin','wyoming'
  // states/territories that are also common city names (New York, Georgia, etc.) are
  // deliberately left out so a query naming them as the actual target still works
]);

// 2-letter abbreviation → full state name (all 50 + DC + inhabited territories)
const US_STATE_ABBR = {
  'AL':'Alabama','AK':'Alaska','AZ':'Arizona','AR':'Arkansas','CA':'California',
  'CO':'Colorado','CT':'Connecticut','DE':'Delaware','FL':'Florida','GA':'Georgia',
  'HI':'Hawaii','ID':'Idaho','IL':'Illinois','IN':'Indiana','IA':'Iowa',
  'KS':'Kansas','KY':'Kentucky','LA':'Louisiana','ME':'Maine','MD':'Maryland',
  'MA':'Massachusetts','MI':'Michigan','MN':'Minnesota','MS':'Mississippi',
  'MO':'Missouri','MT':'Montana','NE':'Nebraska','NV':'Nevada','NH':'New Hampshire',
  'NJ':'New Jersey','NM':'New Mexico','NY':'New York','NC':'North Carolina',
  'ND':'North Dakota','OH':'Ohio','OK':'Oklahoma','OR':'Oregon','PA':'Pennsylvania',
  'RI':'Rhode Island','SC':'South Carolina','SD':'South Dakota','TN':'Tennessee',
  'TX':'Texas','UT':'Utah','VT':'Vermont','VA':'Virginia','WA':'Washington',
  'WV':'West Virginia','WI':'Wisconsin','WY':'Wyoming','DC':'District of Columbia',
  'PR':'Puerto Rico','GU':'Guam','VI':'Virgin Islands','AS':'American Samoa',
  'MP':'Northern Mariana Islands'
};

// Build a reverse map: lowercase full name → 2-letter abbreviation, used for full-name detection.
const US_FULL_NAME_TO_ABBR = Object.fromEntries(
  Object.entries(US_STATE_ABBR).map(([abbr, full]) => [full.toLowerCase(), abbr])
);

/* Return the 2-letter uppercase US state abbreviation embedded in a query string, or null.
   Checks 2-letter tokens first (most unambiguous), then scans for full state names.
   This is intentionally separate from extractCityCandidates — the state token is extracted
   as a hint for ranking, not discarded entirely. */
function extractStateHint(query){
  const tokens = query.split(/[\s,]+/).filter(Boolean);
  for(const tok of tokens){
    const up = tok.toUpperCase().replace(/\.$/, '');
    if(up.length === 2 && US_STATE_ABBR[up]) return up;
  }
  // Full state name check (e.g. "Wisconsin", "Tennessee")
  const lq = query.toLowerCase();
  for(const [fullLc, abbr] of Object.entries(US_FULL_NAME_TO_ABBR)){
    // word-boundary guard: don't match "indiana" inside "Indianapolis"
    const re = new RegExp('(?:^|[\\s,])' + fullLc.replace(/ /g,'[\\s,]+') + '(?:[\\s,]|$)');
    if(re.test(lq)) return abbr;
  }
  return null;
}

function extractCityCandidates(query){
  const tokens = query.replace(/^\s*\d+\s*/, '').split(/[\s,]+/).filter(Boolean);
  const words = tokens.filter(t=>{
    const lc = t.toLowerCase().replace(/\.$/,'');
    if(STREET_SUFFIXES.has(lc)) return false;
    if(US_STATE_NAMES.has(lc)) return false;
    // Drop 2-letter US state abbreviations so they don't surface as city candidates
    const up = t.toUpperCase().replace(/\.$/, '');
    if(up.length === 2 && US_STATE_ABBR[up]) return false;
    if(/^\d+$/.test(t)) return false; // drop house/unit numbers, zip codes
    return true;
  });
  const candidates = [];
  for(let win=Math.min(3, words.length); win>=1; win--){
    for(let start=words.length-win; start>=0; start--){
      candidates.push(words.slice(start, start+win).join(' '));
    }
  }
  return candidates;
}

/* stateHint: optional 2-letter uppercase US state abbreviation (e.g. "TN").
   When provided, US cities whose admin field matches get a +10 score bonus so they
   rank above same-named cities in other states regardless of population. */
function searchLocalCities(query, limit, stateHint){
  const q = query.trim().toLowerCase();
  if(!q) return [];
  const scored = [];
  for(let i=0;i<CITY_DATA.length;i++){
    const row = CITY_DATA[i];
    const name = row[0], cc = row[1], admin = row[2], lat = row[3], lon = row[4], pop = row[5];
    const countryName = COUNTRY_NAMES[cc] || cc;
    const nameLc = name.toLowerCase();
    let score = -1;
    if(nameLc === q) score = 3;
    else if(nameLc.startsWith(q)) score = 2;
    else if(nameLc.includes(q) || countryName.toLowerCase().includes(q)) score = 1;
    if(score >= 0){
      if(stateHint && cc === 'US' && admin && admin.toUpperCase() === stateHint) score += 10;
      scored.push({row, score, pop, name, cc, admin, lat, lon, countryName});
    }
  }
  scored.sort((a,b)=> b.score-a.score || b.pop-a.pop);
  return scored.slice(0, limit).map(s=>{
    const showAdmin = s.admin && !/^\d+$/.test(s.admin);
    return {
      lat: s.lat, lon: s.lon,
      label: dedupe([s.name, showAdmin ? s.admin : null, s.countryName]).join(', '),
      shortName: s.name,
      countryName: s.countryName
    };
  });
}

/* synchronous — no network wait, so this is safe to call on every keystroke for instant
   suggestions. Tries a direct match first, then the address-parsing fallback. */
function localSearchWithFallback(query, limit){
  const stateHint = extractStateHint(query);
  let local = searchLocalCities(query, limit, stateHint);
  if(!local.length){
    for(const candidate of extractCityCandidates(query)){
      if(candidate.length < 3) continue;
      const attempt = searchLocalCities(candidate, limit, stateHint);
      if(attempt.length){
        local = attempt.map(r=>({...r, label: r.label + ' ' + t('nearestCitySuffix')}));
        break;
      }
    }
  }
  return local;
}

async function geocode(query, limit){
  let photonErr = null, nominatimErr = null;
  try{
    const ctrl = new AbortController();
    const timer = setTimeout(()=>ctrl.abort(), 5000);
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=${limit}`;
    const res = await fetch(url, {signal: ctrl.signal});
    clearTimeout(timer);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    if(data && Array.isArray(data.features) && data.features.length){
      return data.features.map(f=>{
        const p = f.properties || {};
        const parts = dedupe([p.name, p.street, p.city, p.state, p.country]);
        return {
          lat: f.geometry.coordinates[1],
          lon: f.geometry.coordinates[0],
          label: parts.join(', ') || query,
          shortName: p.name || p.city || p.state || p.country || query,
          countryName: p.country || ''
        };
      });
    }
  }catch(e){ photonErr = e; console.error('Photon geocoding failed:', e); }

  try{
    const ctrl = new AbortController();
    const timer = setTimeout(()=>ctrl.abort(), 5000);
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=${limit}&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {headers:{'Accept':'application/json'}, signal: ctrl.signal});
    clearTimeout(timer);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    if(data && data.length){
      return data.map(d=>({
        lat: parseFloat(d.lat), lon: parseFloat(d.lon),
        label: d.display_name,
        shortName: (d.address && (d.address.city || d.address.town || d.address.village || d.address.state || d.address.country)) || d.display_name.split(',')[0],
        countryName: (d.address && d.address.country) || ''
      }));
    }
  }catch(e){
    nominatimErr = e;
    console.error('Nominatim geocoding failed:', e);
  }

  // both live providers either failed outright or returned nothing — fall back to the
  // embedded offline dataset so search still works (covers cities/states/countries;
  // won't resolve arbitrary street addresses or exact zip codes without a live API,
  // but does try to extract a city name out of a full address as a last resort)
  const local = localSearchWithFallback(query, limit);
  if(local.length) return local;
  if(photonErr || nominatimErr){
    const detail = (photonErr && photonErr.message) || (nominatimErr && nominatimErr.message) || 'unknown error';
    return {__failed: true, detail};
  }
  return [];
}

function renderLookupMessage(msg){
  lookupResults.classList.add('show');
  lookupResults.innerHTML = `<div class="lr-item">${msg}</div>`;
}
function renderSuggestions(results){
  lookupResults.classList.add('show');
  lookupResults.innerHTML = results.map((r,i)=>`
    <div class="lr-item" data-idx="${i}"><span>${r.label}</span></div>
  `).join('');
  lookupResults.querySelectorAll('.lr-item[data-idx]').forEach(el=>{
    el.addEventListener('click', ()=> selectPlace(results[+el.dataset.idx]));
  });
}

/* live predictive suggestions while typing, debounced so we're not hammering the API on every keystroke */
let suggestDebounce = null;
placeInput.addEventListener('input', ()=>{
  const q = placeInput.value.trim();
  if(suggestDebounce) clearTimeout(suggestDebounce);
  if(q.length < 2){ lookupResults.classList.remove('show'); return; }

  // instant, offline, no network wait — shows something immediately while typing
  const instant = localSearchWithFallback(q, 6);
  if(instant.length) renderSuggestions(instant);

  const mySeq = ++suggestSeq;
  suggestDebounce = setTimeout(async ()=>{
    const results = await geocode(q, 6);
    if(mySeq !== suggestSeq) return; // a newer keystroke already superseded this request
    if(results && results.__failed){
      if(!instant.length) renderLookupMessage(`${t('searchFailedPrefix')} (${results.detail}) — ${t('corsHint')}`);
      return;
    }
    if(!results.length){
      if(!instant.length) renderLookupMessage(t('noMatchesYet'));
      return;
    }
    renderSuggestions(results); // may upgrade with more precise live results
  }, 300);
});
document.addEventListener('click', (e)=>{
  if(!e.target.closest('.lookup')) lookupResults.classList.remove('show');
});

async function runPlaceSearch(){
  const q = placeInput.value.trim();
  if(!q || lookupBusy) return;
  lookupBusy = true;
  placeBtn.disabled = true; placeBtn.textContent = '…';
  try{
    const results = await geocode(q, 6);
    if(results && results.__failed){
      renderLookupMessage(`${t('searchFailedPrefix')} (${results.detail}) — ${t('corsHint')}`);
    }else if(!results.length){
      renderLookupMessage(t('noMatchesFound'));
    }else if(results.length === 1){
      selectPlace(results[0]);
    }else{
      renderSuggestions(results);
    }
  }finally{
    lookupBusy = false;
    placeBtn.disabled = false; placeBtn.textContent = t('searchBtn');
  }
}

function selectPlace(r){
  if(suggestDebounce) clearTimeout(suggestDebounce);
  lookupResults.classList.remove('show');
  const resolved = resolveTimezoneForLatLon(r.lat, r.lon);
  const tz = resolved.tz;
  currentLookup = {name: r.shortName, addr: r.label, lat: r.lat, lon: r.lon, tz, country: resolved.country || r.countryName || ''};
  document.getElementById('lcName').textContent = r.shortName;
  document.getElementById('lcAddr').textContent = r.label;
  document.getElementById('lcTz').textContent = tz + (resolved.approx ? ' (approximate)' : '');
  lookupCard.classList.add('show');
  updateLookupCardTime();
  const pinCity = {name: r.shortName, country: currentLookup.country, lat: r.lat, lon: r.lon, tz};
  setSearchMarker(r.lat, r.lon, pinCity);
  flyToLatLon(r.lat, r.lon, {zoom: 8.4});
  autoShowSearchTooltip(pinCity);
}

function updateLookupCardTime(){
  if(!currentLookup || !lookupCard.classList.contains('show')) return;
  const now = new Date();
  document.getElementById('lcTime').textContent = fmtTime24(now, currentLookup.tz);
  document.getElementById('lcDate').textContent = fmtDateShort(now, currentLookup.tz) + ' · ' + offsetLabel(getOffsetMinutes(now, currentLookup.tz));
}

placeBtn.addEventListener('click', runPlaceSearch);
placeInput.addEventListener('keydown', (e)=>{
  if(e.key === 'Enter'){
    // if a suggestion list is already showing, pick the first one; otherwise run a fresh search
    const firstItem = lookupResults.querySelector('.lr-item[data-idx="0"]');
    if(lookupResults.classList.contains('show') && firstItem){ firstItem.click(); }
    else{ runPlaceSearch(); }
  }
});
document.getElementById('lcPinBtn').addEventListener('click', ()=>{
  if(!currentLookup) return;
  pinCustomLocation(currentLookup.name, currentLookup.country, currentLookup.lat, currentLookup.lon, currentLookup.tz);
});
document.getElementById('lcCloseBtn').addEventListener('click', ()=>{
  currentLookup = null;
  document.getElementById('lookupCard').classList.remove('show');
});

/* ======================= FIRST-VISIT COACH MARKS ======================= */
const COACH_STEPS = [
  { targetId:'placeSearchInput',
    title:'Search for any place',
    text:'Type a city, country, address, or zip code. Results appear instantly and you can pin them to your world clock.',
    pos:'below' },
  { targetId:'globeStage',
    title:'Click a dot to pin it',
    text:'Each glowing dot is a city. Click it to pin it and see its local time. Drag to spin the globe — scroll to zoom.',
    pos:'below' },
  { targetSel:'.clock-panel',
    title:'Your world clock',
    text:'Pinned cities appear here with their current time. Click any row to fly the globe there, or drag ⠿ to reorder.',
    pos:'below' },
  { targetSel:'.converter',
    title:'Compare across time zones',
    text:'Drag the glowing circular marker left or right to translate any moment in time across all your pinned cities.',
    pos:'above' }
];
let coachStepIdx = 0;
let coachHighlightEl = null;

function coachSetHighlight(el){
  if(coachHighlightEl) coachHighlightEl.classList.remove('coach-highlight');
  coachHighlightEl = el;
  if(el) el.classList.add('coach-highlight');
}

function positionCoachMark(targetEl, pos){
  const mark = document.getElementById('coachMark');
  const MARK_W = 272;
  mark.dataset.arrow = pos;
  const vw = window.innerWidth, vh = window.innerHeight;
  const r = targetEl.getBoundingClientRect();
  const GAP = 14;
  const markH = mark.offsetHeight || 175;
  let top, left;
  if(pos === 'below'){
    top = r.bottom + GAP; left = r.left + r.width/2 - MARK_W/2;
  } else if(pos === 'above'){
    top = r.top - markH - GAP; left = r.left + r.width/2 - MARK_W/2;
  } else if(pos === 'right'){
    top = r.top + r.height/2 - markH/2; left = r.right + GAP;
  } else {
    top = r.top + r.height/2 - markH/2; left = r.left - MARK_W - GAP;
  }
  left = Math.max(12, Math.min(vw - MARK_W - 12, left));
  top  = Math.max(12, Math.min(vh - markH - 12, top));
  mark.style.left = left + 'px';
  mark.style.top  = top  + 'px';
}

function showCoachStep(i){
  if(i >= COACH_STEPS.length){ finishCoach(); return; }
  const step = COACH_STEPS[i];
  const target = step.targetId
    ? document.getElementById(step.targetId)
    : document.querySelector(step.targetSel);
  if(!target){ showCoachStep(i + 1); return; }

  document.getElementById('coachStepNum').textContent = (i + 1) + ' / ' + COACH_STEPS.length;
  document.getElementById('coachTitle').textContent = step.title;
  document.getElementById('coachText').textContent = step.text;
  document.getElementById('coachNext').textContent = (i === COACH_STEPS.length - 1) ? 'Done ✓' : 'Next →';

  const mark = document.getElementById('coachMark');
  mark.classList.remove('hide');
  coachSetHighlight(target);

  // scroll target into view if needed, then position after a frame
  const tr = target.getBoundingClientRect();
  const vh = window.innerHeight;
  if(tr.bottom < 0 || tr.top > vh){
    target.scrollIntoView({behavior:'smooth', block:'center'});
  }
  requestAnimationFrame(()=>{ positionCoachMark(target, step.pos); });
}

function finishCoach(){
  coachSetHighlight(null);
  const ov = document.getElementById('coachOverlay');
  if(ov) ov.style.display = 'none';
  try{ localStorage.setItem('meridian_onboarded', '1'); }catch(e){}
}

function initCoachMarks(){
  document.getElementById('coachOverlay').style.display = '';
  document.getElementById('coachNext').addEventListener('click', ()=>{
    coachStepIdx++;
    showCoachStep(coachStepIdx);
  });
  document.getElementById('coachSkip').addEventListener('click', finishCoach);
  setTimeout(()=>{ showCoachStep(0); }, 950);
}
