"use strict";

/* ======================= WORLD CLOCK PANEL ======================= */
const clockList = document.getElementById('clockList');
const pinCount = document.getElementById('pinCount');
// Maps each pinned city object → its current clock-row DOM element.
// Rebuilt on every renderClockList() call so setHoveredSprite can find rows fast.
var clockRowEls = new Map();

function renderClockList(){
  clockRowEls.clear(); // stale DOM refs are gone after innerHTML = ''
  pinCount.textContent = `· ${pinned.length}`;
  clockList.innerHTML = '';
  const now = new Date();
  pinned.forEach((city, rowIdx)=>{
    const off = getOffsetMinutes(now, city.tz);
    const lp = localParts(now, city.tz);
    const day = isDaytime(lp.hour + lp.minute/60);
    const row = document.createElement('div');
    row.className = 'clock-row';
    row.innerHTML = `
      <span class="row-handle" draggable="true" title="Drag to reorder">⠿</span>
      <div class="cr-left">
        <div class="cr-name">${city.name}</div>
        <div class="cr-off">${offsetLabel(off)} · ${lp.weekday}</div>
      </div>
      <div class="cr-right">
        <span class="cr-icon">${day ? '☀️' : '🌙'}</span>
        <span class="cr-time">${fmtTimeLoc(now, city.tz).replace(/(AM|PM)/, '<span class="cr-ampm">$1</span>')}</span>
        <button class="cr-remove" title="Remove">×</button>
      </div>
    `;

    // Zone accent: colored left bar + soft outer glow (matches globe pin / map fill)
    const cardColor = getZoneAccentCard(city);
    row.style.setProperty('--card-accent-bar', colorToRgba(cardColor, 0.85));
    row.style.setProperty('--card-glow',        colorToRgba(cardColor, 0.28));

    // Register in map so setHoveredSprite can find this element instantly
    clockRowEls.set(city, row);

    // Re-apply cross-highlight if this city's sprite is still the hovered one
    if(hoveredSprite && hoveredSprite.userData && hoveredSprite.userData.city === city){
      row.classList.add('card-sprite-hover');
    }

    const removeBtn = row.querySelector('.cr-remove');
    const handle = row.querySelector('.row-handle');

    // Prevent × and drag handle from bubbling up to the row click handler
    removeBtn.addEventListener('click', e=>{ e.stopPropagation(); togglePin(city); });
    handle.addEventListener('click', e=>{ e.stopPropagation(); });

    attachRowDragReorder(row, handle, rowIdx);

    // Cross-highlight ↔ globe: hovering a card scales up / brightens the matching sprite
    row.addEventListener('mouseenter', ()=>{
      const sprite = city._marker || markerMeshes.find(s=>s.userData.city===city);
      if(sprite) setHoveredSprite(sprite);
    });
    row.addEventListener('mouseleave', ()=>{
      const sprite = city._marker || markerMeshes.find(s=>s.userData.city===city);
      if(hoveredSprite === sprite) setHoveredSprite(null);
    });

    // Fly globe to this city when the row body is clicked
    row.addEventListener('click', ()=>{
      flyToLatLon(city.lat, city.lon, {zoom: 8.4});
      autoShowPinnedTooltip(city);
    });

    clockList.appendChild(row);
  });
}

/* city search / add */
const citySearch = document.getElementById('citySearch');
const citySuggestions = document.getElementById('citySuggestions');
let citySearchSeq = 0;
let citySearchDebounce = null;

function renderCitySuggestionList(results){
  citySuggestions.innerHTML = results.map((r,i)=>
    `<div class="suggestion-item" data-idx="${i}"><span class="s-name">${r.label}</span></div>`
  ).join('');
  citySuggestions.classList.add('show');
  citySuggestions.querySelectorAll('.suggestion-item').forEach(el=>{
    el.addEventListener('click', ()=>{
      const r = results[+el.dataset.idx];
      const resolved = resolveTimezoneForLatLon(r.lat, r.lon);
      pinCustomLocation(r.shortName, resolved.country || r.countryName || '', r.lat, r.lon, resolved.tz);
      citySearch.value = ''; citySuggestions.classList.remove('show');
    });
  });
}
citySearch.addEventListener('input', ()=>{
  const q = citySearch.value.trim();
  if(citySearchDebounce) clearTimeout(citySearchDebounce);
  if(q.length < 2){ citySuggestions.classList.remove('show'); return; }

  const instant = localSearchWithFallback(q, 8);
  if(instant.length) renderCitySuggestionList(instant);

  const mySeq = ++citySearchSeq;
  citySearchDebounce = setTimeout(async ()=>{
    const results = await geocode(q, 8);
    if(mySeq !== citySearchSeq) return;
    if(!results || results.__failed || !results.length){
      if(!instant.length) citySuggestions.classList.remove('show');
      return;
    }
    renderCitySuggestionList(results);
  }, 300);
});
document.addEventListener('click', (e)=>{
  if(!e.target.closest('.add-city-wrap')) citySuggestions.classList.remove('show');
});

document.getElementById('clearPinsBtn').addEventListener('click', clearAllPins);
document.getElementById('clearPinsBtnGlobe').addEventListener('click', clearAllPins);

const DEFAULT_PRESET_NAMES = ["New York","London","Dubai","Tokyo","Sydney"];
var usPresetActive = false;
function buildUSPreset(){
  const denver = CITIES.find(c=>c.name==="Denver");
  const chicago = CITIES.find(c=>c.name==="Chicago");
  const newyork = CITIES.find(c=>c.name==="New York");
  const sacramento = {name:"Sacramento", country:"USA", lat:38.5816, lon:-121.4944, tz:"America/Los_Angeles", custom:true};
  return [sacramento, denver, chicago, newyork];
}
function updatePresetButton(){
  const btn = document.getElementById('presetToggleBtn');
  btn.textContent = usPresetActive ? t('worldCitiesBtn') : t('usZonesBtn');
  btn.title = usPresetActive ? t('switchToWorld') : t('switchToUS');
  btn.classList.toggle('active', usPresetActive);
}
document.getElementById('presetToggleBtn').addEventListener('click', ()=>{
  if(usPresetActive){
    const defaults = DEFAULT_PRESET_NAMES.map(n=>CITIES.find(c=>c.name===n)).filter(Boolean);
    if(!defaults.find(c=>c.tz===LOCAL_CITY.tz)) defaults.unshift(LOCAL_CITY);
    swapPinnedTo(defaults);
    // leave the globe view where it is when returning to world cities
  }else{
    swapPinnedTo(buildUSPreset());
    // fly to a continental-US overview: wide enough to see all four time zones at once
    flyToLatLon(39.5, -98.35, {zoom: 10.2});
  }
  usPresetActive = !usPresetActive;
  updatePresetButton();
});

function attachRowDragReorder(row, handle, rowIdx){
  handle.addEventListener('dragstart', (e)=>{
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(rowIdx));
    requestAnimationFrame(()=> row.classList.add('dragging'));
  });
  handle.addEventListener('dragend', ()=>{
    row.classList.remove('dragging');
    document.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over'));
  });
  row.addEventListener('dragover', (e)=>{
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    row.classList.add('drag-over');
  });
  row.addEventListener('dragleave', ()=>{ row.classList.remove('drag-over'); });
  row.addEventListener('drop', (e)=>{
    e.preventDefault();
    row.classList.remove('drag-over');
    const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
    movePinned(fromIdx, rowIdx);
  });
}

/* ======================= CLOCK TICKS ======================= */
const utcClockEl = document.getElementById('utcClock');
function tickUTC(){
  const now = new Date();
  if(LOCAL_TZ && LOCAL_TZ !== 'UTC'){
    try{
      const lp = localParts(now, LOCAL_TZ);
      const abbr = tzAbbreviation(now, LOCAL_TZ);
      const h12 = lp.hour % 12 || 12;
      const ampm = lp.hour >= 12 ? 'PM' : 'AM';
      const label = abbr || LOCAL_TZ.split('/').pop().replace(/_/g,' ');
      utcClockEl.textContent = h12 + ':' + pad2(lp.minute) + ':' + pad2(lp.second) + ' ' + ampm + ' ' + label;
      return;
    }catch(e){}
  }
  // fallback: UTC
  utcClockEl.textContent = fmtTime24(now,'UTC') + ':' + pad2(now.getUTCSeconds()) + ' UTC';
}
