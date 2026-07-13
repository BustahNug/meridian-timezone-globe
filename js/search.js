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

// lowercase country name → ISO2 code (longest names first at lookup time)
const COUNTRY_NAME_TO_CODE = Object.fromEntries(
  Object.entries(COUNTRY_NAMES).map(([code, name]) => [name.toLowerCase(), code])
);

const GEOCODE_USER_AGENT = 'MeridianTimezoneGlobe/1.0 (https://meridianzones.netlify.app)';
const GEOCODE_TIMEOUT_MS = 5000;
const GEO_DEV = typeof location !== 'undefined' && (
  location.hostname === 'localhost' ||
  location.hostname === '127.0.0.1' ||
  /[?&]geo_dev=1(?:&|$)/.test(location.search)
);

function geoLog(step, detail){
  if(GEO_DEV) console.log('[geocode]', step, detail || '');
}

function fillTemplate(key, vars){
  let s = t(key);
  Object.entries(vars || {}).forEach(([k, v])=>{ s = s.split('{' + k + '}').join(v); });
  return s;
}

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

function extractCountryHint(query){
  const lq = query.toLowerCase();
  const names = Object.keys(COUNTRY_NAME_TO_CODE).sort((a, b)=> b.length - a.length);
  for(const name of names){
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[\\s,]+');
    const re = new RegExp('(?:^|[\\s,])' + escaped + '(?:[\\s,]|$)');
    if(re.test(lq)) return COUNTRY_NAME_TO_CODE[name];
  }
  return null;
}

const SETTLEMENT_OSM_VALUES = new Set(['city','town','village','hamlet','municipality','borough','suburb']);
const POI_OSM_VALUES = new Set(['footway','track','path','cycleway','pedestrian','steps','bridleway','service']);

/* City-like tokens at the end of an address fragment (after stripping street suffixes). */
function trailingCityPhrase(text){
  const tokens = text.replace(/^\s*\d+\s*/, '').split(/[\s,]+/).filter(Boolean);
  const kept = [];
  for(let i = tokens.length - 1; i >= 0; i--){
    const tok = tokens[i];
    const lc = tok.toLowerCase().replace(/\.$/, '');
    if(STREET_SUFFIXES.has(lc) || /^\d+$/.test(tok)) break;
    kept.unshift(tok);
  }
  return kept.join(' ');
}

/* Strip a leading house number and return {houseNumber, rest}. */
function splitHouseNumber(query){
  const m = query.trim().match(/^(\d+[A-Za-z]?)\s+(.+)$/);
  if(!m) return {houseNumber: null, rest: query.trim()};
  return {houseNumber: m[1], rest: m[2].trim()};
}

/* Parse US-style address pieces: house number, street, city, state. */
function parseAddressComponents(query){
  const stateHint = extractStateHint(query);
  const stateName = stateHint ? US_STATE_ABBR[stateHint] : null;
  const countryCode = extractCountryHint(query) || (stateHint ? 'US' : null);
  const {houseNumber, rest} = splitHouseNumber(query);
  let city = null, street = null;

  if(stateHint){
    const commaParts = rest.split(',').map(s => s.trim()).filter(Boolean);
    if(commaParts.length >= 2 && extractStateHint(commaParts[commaParts.length - 1]) === stateHint){
      const cityPart = commaParts[commaParts.length - 2];
      city = trailingCityPhrase(cityPart);
      if(city){
        const cityRe = new RegExp('\\b' + city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
        street = cityPart.replace(cityRe, '').trim().replace(/^\d+\s*/, '').trim() || null;
      }
    }else{
      const stateFull = stateName.toLowerCase();
      const lq = rest.toLowerCase();
      let idx = lq.lastIndexOf(stateFull);
      if(idx < 0){
        const re = new RegExp('(?:^|[\\s,])' + stateFull.replace(/ /g, '[\\s,]+') + '(?:[\\s,]|$)');
        const m = lq.match(re);
        if(m) idx = m.index;
      }
      if(idx >= 0){
        const before = rest.slice(0, idx).trim().replace(/[,\s]+$/, '');
        city = trailingCityPhrase(before);
        if(city){
          const cityRe = new RegExp('\\b' + city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
          street = before.replace(cityRe, '').trim().replace(/^\d+\s*/, '').trim() || null;
        }
      }
    }
  }

  return {houseNumber, street, city, stateHint, stateName, countryCode};
}

function looksLikeStreetAddress(components){
  if(!components) return false;
  if(components.houseNumber) return true;
  if(components.street && components.stateHint) return true;
  return false;
}

function looksLikePoiQuery(query, components){
  const lq = query.toLowerCase();
  if(components && components.houseNumber) return false;
  if(!/\b(trail|falls|path|track)\b/.test(lq)) return false;
  // Explicit trail/POI wording without a house-number address pattern.
  return !looksLikeStreetAddress(components);
}

function stateMatchesResult(components, result){
  if(!components.stateHint) return true;
  const target = components.stateName.toLowerCase();
  const fields = [result.state, result.admin, result.label, result.countryName].filter(Boolean).map(s => String(s).toLowerCase());
  if(components.stateHint.length === 2){
    return fields.some(f => f.includes(target) || f.includes(components.stateHint.toLowerCase()));
  }
  return fields.some(f => f.includes(target));
}

function isSettlementResult(result){
  const val = (result.osmValue || result.placeType || result.addresstype || '').toLowerCase();
  if(SETTLEMENT_OSM_VALUES.has(val)) return true;
  if(result.osmClass === 'place') return true;
  if(result.osmType === 'administrative' && (result.addresstype === 'city' || result.addresstype === 'town' || result.addresstype === 'village')) return true;
  return false;
}

function isPoiResult(result){
  const val = (result.osmValue || result.placeType || '').toLowerCase();
  if(POI_OSM_VALUES.has(val)) return true;
  if(result.osmKey === 'highway') return true;
  if(/\btrail\b/i.test(result.label || '')) return true;
  return false;
}

function cityMatchesResult(components, result){
  if(!components.city) return false;
  const cityLc = components.city.toLowerCase();
  const names = [result.shortName, result.city, result.label].filter(Boolean).map(s => String(s).toLowerCase());
  return names.some(n => n === cityLc || n.startsWith(cityLc + ',') || n.includes(', ' + cityLc + ','));
}

function formatSettlementPlaceLabel(result, components){
  const parts = dedupe([result.shortName || result.city, components.stateName, result.countryName || 'United States']).filter(Boolean);
  return parts.join(', ');
}

function applyHonestTownLabel(result, components, usedStructuredFallback){
  if(!components || !looksLikeStreetAddress(components)) return result;
  if(result.streetLevel) return result;
  if(!isSettlementResult(result)) return result;
  if(!cityMatchesResult(components, result) && !usedStructuredFallback) return result;
  const place = formatSettlementPlaceLabel(result, components);
  return {...result, label: fillTemplate('geoTownNotStreet', {place})};
}

function rankGeocodeResults(results, query, components){
  const addressLike = looksLikeStreetAddress(components);
  const poiIntent = looksLikePoiQuery(query, components);
  return results.slice().sort((a, b)=>{
    const score = r => {
      let s = 0;
      if(r.streetLevel) s += 200;
      if(addressLike && components.city && cityMatchesResult(components, r) && stateMatchesResult(components, r)) s += 120;
      if(addressLike && isSettlementResult(r) && stateMatchesResult(components, r)) s += 80;
      if(poiIntent && isPoiResult(r)) s += 90;
      if(addressLike && isPoiResult(r)) s -= 60;
      if(isSettlementResult(r)) s += 20;
      if(r._structured) s += 15;
      return s;
    };
    return score(b) - score(a);
  });
}

function dedupeGeocodeResults(results){
  const seen = new Set();
  return results.filter(r=>{
    const key = [r.lat && r.lat.toFixed(3), r.lon && r.lon.toFixed(3), r.shortName, r.label].join('|');
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* Best city-name candidate from the part of the query that precedes a US state name. */
function extractCityBeforeState(query){
  const parsed = parseAddressComponents(query);
  return parsed.city || null;
}

function buildOnlineRelaxedQuery(query){
  const parsed = parseAddressComponents(query);
  if(parsed.city && parsed.stateName) return parsed.city + ', ' + parsed.stateName;
  if(parsed.stateName) return parsed.stateName;
  const countryCode = parsed.countryCode;
  if(countryCode){
    const countryName = COUNTRY_NAMES[countryCode] || countryCode;
    const city = extractCityCandidates(query).find(c => c.length >= 3);
    if(city) return city + ', ' + countryName;
  }
  const candidates = extractCityCandidates(query).filter(c => c.length >= 3);
  return candidates.length ? candidates[0] : null;
}

function mapPhotonFeature(f, query){
  const p = f.properties || {};
  const parts = dedupe([p.name, p.street, p.city, p.state, p.country]);
  return {
    lat: f.geometry.coordinates[1],
    lon: f.geometry.coordinates[0],
    label: parts.join(', ') || query,
    shortName: p.name || p.city || p.state || p.country || query,
    countryName: p.country || '',
    city: p.city || '',
    state: p.state || '',
    street: p.street || '',
    osmKey: p.osm_key || '',
    osmValue: p.osm_value || '',
    placeType: p.type || '',
    streetLevel: !!(p.housenumber || p.street),
    _provider: 'photon'
  };
}

function mapNominatimResult(d){
  const addr = d.address || {};
  const city = addr.city || addr.town || addr.village || addr.hamlet || '';
  const state = addr.state || '';
  return {
    lat: parseFloat(d.lat),
    lon: parseFloat(d.lon),
    label: d.display_name,
    shortName: city || state || d.display_name.split(',')[0],
    countryName: addr.country || '',
    city,
    state,
    street: addr.road || addr.pedestrian || addr.footway || '',
    osmClass: d.class || '',
    osmType: d.type || '',
    category: d.category || '',
    addresstype: d.addresstype || '',
    osmValue: d.addresstype || d.type || '',
    placeType: d.addresstype || d.type || '',
    streetLevel: !!(addr.house_number || d.addresstype === 'house' || d.class === 'building' || d.class === 'place' && d.type === 'house'),
    _provider: 'nominatim'
  };
}

function formatLocalLabel(name, cc, admin, countryName){
  const parts = [name];
  if(cc === 'US' && admin){
    const abbr = admin.toUpperCase();
    const stateName = US_STATE_ABBR[abbr];
    if(stateName) parts.push(stateName);
    else if(!/^\d+$/.test(admin)) parts.push(admin);
  }else if(admin && !/^\d+$/.test(admin)){
    parts.push(admin);
  }
  parts.push(countryName);
  return dedupe(parts.filter(Boolean)).join(', ');
}

function formatLocalResult(row, suffix){
  const name = row[0], cc = row[1], admin = row[2], lat = row[3], lon = row[4];
  const countryName = COUNTRY_NAMES[cc] || cc;
  const label = formatLocalLabel(name, cc, admin, countryName) + (suffix ? ' ' + suffix : '');
  return {lat, lon, label, shortName: name, countryName, admin, countryCode: cc};
}

function topCitiesInState(stateHint, limit){
  const rows = [];
  for(let i = 0; i < CITY_DATA.length; i++){
    const row = CITY_DATA[i];
    if(row[1] === 'US' && row[2] && row[2].toUpperCase() === stateHint) rows.push(row);
  }
  rows.sort((a, b)=> b[5] - a[5]);
  return rows.slice(0, limit).map(row => formatLocalResult(row));
}

function topCitiesInCountry(countryCode, limit){
  const rows = [];
  for(let i = 0; i < CITY_DATA.length; i++){
    const row = CITY_DATA[i];
    if(row[1] === countryCode) rows.push(row);
  }
  rows.sort((a, b)=> b[5] - a[5]);
  return rows.slice(0, limit).map(row => formatLocalResult(row));
}

function wrapResultList(items, extra){
  const out = items.slice();
  if(extra){
    if(extra.banner) out.banner = extra.banner;
    if(extra.__meta) out.__meta = extra.__meta;
  }
  return out;
}

function geocodeOfflineHint(reason){
  if(reason === 'offline' || reason === 'network') return t('geoHintOfflineBrowser');
  if(reason === 'rate_limited') return t('geoHintRateLimited');
  return t('geoHintServiceUnavailable');
}

function classifyProviderError(err, status){
  if(status === 429) return 'rate_limited';
  if(status === 403) return 'rate_limited';
  if(!navigator.onLine) return 'offline';
  if(err && err.name === 'AbortError') return 'timeout';
  if(err && (err.message === 'Failed to fetch' || err.name === 'TypeError')) return 'network';
  return 'service';
}

async function fetchPhoton(query, limit){
  const url = 'https://photon.komoot.io/api/?q=' + encodeURIComponent(query) + '&limit=' + limit;
  geoLog('photon request', url);
  try{
    const ctrl = new AbortController();
    const timer = setTimeout(()=> ctrl.abort(), GEOCODE_TIMEOUT_MS);
    const res = await fetch(url, {signal: ctrl.signal});
    clearTimeout(timer);
    geoLog('photon response', {status: res.status, ok: res.ok});
    if(!res.ok){
      return {results: null, reason: classifyProviderError(null, res.status), status: res.status};
    }
    const data = await res.json();
    if(data && Array.isArray(data.features) && data.features.length){
      return {results: data.features.map(f => mapPhotonFeature(f, query))};
    }
    return {results: [], reason: null, status: res.status};
  }catch(e){
    geoLog('photon error', e.message || e);
    return {results: null, reason: classifyProviderError(e), error: e};
  }
}

async function fetchNominatim(query, limit){
  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=' + limit + '&q=' + encodeURIComponent(query);
  geoLog('nominatim request', url);
  try{
    const ctrl = new AbortController();
    const timer = setTimeout(()=> ctrl.abort(), GEOCODE_TIMEOUT_MS);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': GEOCODE_USER_AGENT
      }
    });
    clearTimeout(timer);
    geoLog('nominatim response', {status: res.status, ok: res.ok});
    if(!res.ok){
      return {results: null, reason: classifyProviderError(null, res.status), status: res.status};
    }
    const data = await res.json();
    if(data && data.length){
      return {results: data.map(mapNominatimResult)};
    }
    return {results: [], reason: null, status: res.status};
  }catch(e){
    geoLog('nominatim error', e.message || e);
    return {results: null, reason: classifyProviderError(e), error: e};
  }
}

async function fetchNominatimStructured(components, limit){
  if(!components.city || !components.stateName) return {results: []};
  const params = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '1',
    limit: String(limit),
    city: components.city,
    state: components.stateName,
    countrycodes: 'us'
  });
  if(components.street) params.set('street', components.street);
  if(components.houseNumber) params.set('housenumber', components.houseNumber);
  const url = 'https://nominatim.openstreetmap.org/search?' + params.toString();
  geoLog('nominatim structured request', url);
  try{
    const ctrl = new AbortController();
    const timer = setTimeout(()=> ctrl.abort(), GEOCODE_TIMEOUT_MS);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': GEOCODE_USER_AGENT
      }
    });
    clearTimeout(timer);
    geoLog('nominatim structured response', {status: res.status, ok: res.ok});
    if(!res.ok){
      return {results: null, reason: classifyProviderError(null, res.status), status: res.status};
    }
    const data = await res.json();
    if(data && data.length){
      return {results: data.map(d => ({...mapNominatimResult(d), _structured: true}))};
    }
    return {results: [], reason: null, status: res.status};
  }catch(e){
    geoLog('nominatim structured error', e.message || e);
    return {results: null, reason: classifyProviderError(e), error: e};
  }
}

async function fetchPhotonCityState(components, limit){
  if(!components.city || !components.stateName) return {results: []};
  const q = components.city + ', ' + components.stateName;
  const resp = await fetchPhoton(q, Math.max(limit * 2, 12));
  if(!resp.results) return resp;
  const ranked = rankGeocodeResults(resp.results, q, components);
  return {results: ranked.slice(0, limit), reason: resp.reason, status: resp.status, error: resp.error};
}

function finalizeOnlineResults(results, query, components, meta){
  const usedStructuredFallback = !!meta.structuredFallback;
  const ranked = rankGeocodeResults(dedupeGeocodeResults(results), query, components);
  const labeled = ranked.map(r => applyHonestTownLabel(r, components, usedStructuredFallback));
  return wrapResultList(labeled.slice(0, meta.limit), {__meta: meta.__meta});
}

function hasStreetLevelMatch(results){
  return results.some(r => r.streetLevel);
}

function hasSettlementMatch(results, components){
  return results.some(r => isSettlementResult(r) && stateMatchesResult(components, r) &&
    (!components.city || cityMatchesResult(components, r)));
}

async function geocodeOnline(query, limit){
  const attempts = [];
  const components = parseAddressComponents(query);
  function note(provider, outcome){ attempts.push({provider, ...outcome}); }

  let merged = [];
  let photon = await fetchPhoton(query, limit);
  note('photon', {query, count: photon.results ? photon.results.length : null, reason: photon.reason, status: photon.status});
  if(photon.results && photon.results.length) merged = merged.concat(photon.results);

  let nominatim = await fetchNominatim(query, limit);
  note('nominatim', {query, count: nominatim.results ? nominatim.results.length : null, reason: nominatim.reason, status: nominatim.status});
  if(nominatim.results && nominatim.results.length) merged = merged.concat(nominatim.results);

  const needsStructured = components.city && components.stateHint && (
    !merged.length || (looksLikeStreetAddress(components) && !hasStreetLevelMatch(merged) && !hasSettlementMatch(merged, components))
  );

  let structuredFallback = false;
  if(needsStructured){
    geoLog('structured fallback', components);
    if(components.street || components.houseNumber){
      const streetTry = await fetchNominatimStructured(components, limit);
      note('nominatim-structured-street', {count: streetTry.results ? streetTry.results.length : null, reason: streetTry.reason, status: streetTry.status});
      if(streetTry.results && streetTry.results.length){
        merged = merged.concat(streetTry.results);
        if(hasStreetLevelMatch(streetTry.results)){
          return finalizeOnlineResults(merged, query, components, {
            limit, structuredFallback: true,
            __meta: {source: 'online', provider: 'nominatim-structured', attempts}
          });
        }
      }
    }

    const cityStreet = {...components, street: null, houseNumber: null};
    const structNom = await fetchNominatimStructured(cityStreet, limit);
    note('nominatim-structured-city', {count: structNom.results ? structNom.results.length : null, reason: structNom.reason, status: structNom.status});
    if(structNom.results && structNom.results.length) merged = merged.concat(structNom.results);

    const structPhoton = await fetchPhotonCityState(components, limit);
    note('photon-structured-city', {count: structPhoton.results ? structPhoton.results.length : null, reason: structPhoton.reason, status: structPhoton.status});
    if(structPhoton.results && structPhoton.results.length) merged = merged.concat(structPhoton.results);
    structuredFallback = true;
  }else{
    const relaxed = buildOnlineRelaxedQuery(query);
    if(relaxed && relaxed.toLowerCase() !== query.trim().toLowerCase() && !merged.length){
      geoLog('relaxed online query', relaxed);
      photon = await fetchPhoton(relaxed, limit);
      note('photon-relaxed', {query: relaxed, count: photon.results ? photon.results.length : null, reason: photon.reason, status: photon.status});
      if(photon.results && photon.results.length) merged = merged.concat(photon.results);
      nominatim = await fetchNominatim(relaxed, limit);
      note('nominatim-relaxed', {query: relaxed, count: nominatim.results ? nominatim.results.length : null, reason: nominatim.reason, status: nominatim.status});
      if(nominatim.results && nominatim.results.length) merged = merged.concat(nominatim.results);
    }
  }

  if(merged.length){
    return finalizeOnlineResults(merged, query, components, {
      limit, structuredFallback,
      __meta: {source: 'online', provider: structuredFallback ? 'structured' : 'free-text', attempts}
    });
  }

  const reasons = [photon.reason, nominatim.reason].filter(Boolean);
  let offlineReason = 'service';
  if(!navigator.onLine || reasons.includes('offline') || reasons.includes('network')) offlineReason = 'offline';
  else if(reasons.includes('rate_limited')) offlineReason = 'rate_limited';

  return {failed: true, offlineReason, attempts, photon, nominatim};
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
   When hardFilterRegion is true, only cities in that state/country are returned. */
function searchLocalCities(query, limit, opts){
  opts = opts || {};
  const stateHint = opts.stateHint || null;
  const countryCode = opts.countryCode || null;
  const hardFilter = !!opts.hardFilterRegion;
  const q = query.trim().toLowerCase();
  if(!q) return [];
  const scored = [];
  for(let i = 0; i < CITY_DATA.length; i++){
    const row = CITY_DATA[i];
    const name = row[0], cc = row[1], admin = row[2], lat = row[3], lon = row[4], pop = row[5];
    if(hardFilter && stateHint){
      if(cc !== 'US' || !admin || admin.toUpperCase() !== stateHint) continue;
    }
    if(hardFilter && countryCode && !stateHint){
      if(cc !== countryCode) continue;
    }
    const countryName = COUNTRY_NAMES[cc] || cc;
    const nameLc = name.toLowerCase();
    let score = -1;
    if(nameLc === q) score = 3;
    else if(nameLc.startsWith(q)) score = 2;
    else if(nameLc.includes(q) || countryName.toLowerCase().includes(q)) score = 1;
    if(score >= 0) scored.push({row, score, pop});
  }
  scored.sort((a, b)=> b.score - a.score || b.pop - a.pop);
  return scored.slice(0, limit).map(s => formatLocalResult(s.row));
}

/* synchronous — no network wait, so this is safe to call on every keystroke for instant
   suggestions. Tries a direct match first, then the address-parsing fallback. */
function localSearchWithFallback(query, limit){
  const stateHint = extractStateHint(query);
  const countryCode = extractCountryHint(query);
  const hardFilterRegion = !!(stateHint || countryCode);
  const opts = {stateHint, countryCode, hardFilterRegion};

  let local = searchLocalCities(query, limit, opts);
  let usedCandidate = query.trim();
  let usedNearestSuffix = false;

  if(!local.length){
    for(const candidate of extractCityCandidates(query)){
      if(candidate.length < 3) continue;
      const attempt = searchLocalCities(candidate, limit, opts);
      if(attempt.length){
        local = attempt;
        usedCandidate = candidate;
        usedNearestSuffix = true;
        break;
      }
    }
  }

  if(local.length){
    if(usedNearestSuffix && hardFilterRegion){
      local = local.map(r => ({...r, label: r.label + ' ' + t('nearestCitySuffix')}));
    }
    return wrapResultList(local);
  }

  if(stateHint){
    const region = US_STATE_ABBR[stateHint];
    const parsed = parseAddressComponents(query);
    const term = parsed.city || trailingCityPhrase(query) || extractCityCandidates(query).find(c => c.length >= 3) || query.trim();
    const fallback = topCitiesInState(stateHint, limit);
    if(fallback.length){
      fallback.banner = fillTemplate('offlineNoMatchInState', {term, region});
      return wrapResultList(fallback, {banner: fallback.banner});
    }
  }

  if(countryCode){
    const region = COUNTRY_NAMES[countryCode] || countryCode;
    const term = trailingCityPhrase(query) || extractCityCandidates(query).find(c => c.length >= 3) || query.trim();
    const fallback = topCitiesInCountry(countryCode, limit);
    if(fallback.length){
      fallback.banner = fillTemplate('offlineNoMatchInState', {term, region});
      return wrapResultList(fallback, {banner: fallback.banner});
    }
  }

  return wrapResultList([]);
}

async function geocode(query, limit){
  if(!navigator.onLine){
    geoLog('browser offline — using local search');
    const local = localSearchWithFallback(query, limit);
    if(local.length){
      local.__meta = {source: 'offline', reason: 'offline', hint: geocodeOfflineHint('offline')};
      if(local.banner) local.__meta.banner = local.banner;
      return local;
    }
    return {__failed: true, reason: 'offline', hint: geocodeOfflineHint('offline'), detail: 'offline'};
  }

  const online = await geocodeOnline(query, limit);
  if(!online.failed) return online;

  geoLog('online providers exhausted', online);
  const local = localSearchWithFallback(query, limit);
  if(local.length){
    local.__meta = {
      source: 'offline',
      reason: online.offlineReason,
      hint: geocodeOfflineHint(online.offlineReason),
      attempts: online.attempts
    };
    if(local.banner) local.__meta.banner = local.banner;
    return local;
  }

  const detail = (online.photon && online.photon.status) ? ('HTTP ' + online.photon.status) :
    (online.nominatim && online.nominatim.status) ? ('HTTP ' + online.nominatim.status) :
    (online.photon && online.photon.error && online.photon.error.message) ||
    (online.nominatim && online.nominatim.error && online.nominatim.error.message) ||
    'no results';
  return {
    __failed: true,
    reason: online.offlineReason,
    hint: geocodeOfflineHint(online.offlineReason),
    detail
  };
}

function renderLookupMessage(msg){
  lookupResults.classList.add('show');
  lookupResults.innerHTML = '<div class="lr-item lr-hint">' + msg + '</div>';
}
function renderSuggestions(results, banner){
  lookupResults.classList.add('show');
  const hint = banner || results.banner || (results.__meta && (results.__meta.banner || results.__meta.hint));
  const hintHtml = hint ? '<div class="lr-item lr-hint">' + hint + '</div>' : '';
  lookupResults.innerHTML = hintHtml + results.map((r, i)=>`
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
  if(instant.length) renderSuggestions(instant, instant.banner);

  const mySeq = ++suggestSeq;
  suggestDebounce = setTimeout(async ()=>{
    const results = await geocode(q, 6);
    if(mySeq !== suggestSeq) return; // a newer keystroke already superseded this request
    if(results && results.__failed){
      if(!instant.length) renderLookupMessage(results.hint || (t('searchFailedPrefix') + ' (' + results.detail + ') — ' + t('corsHint')));
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
      renderLookupMessage(results.hint || (t('searchFailedPrefix') + ' (' + results.detail + ') — ' + t('corsHint')));
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
