"use strict";

/* ======================= CONVERTER ======================= */
const converterRows = document.getElementById('converterRows');
const refCitySelect = document.getElementById('refCitySelect');
const refDateInput = document.getElementById('refDate');
const refTimeInput = document.getElementById('refTime');

const convAddInput = document.getElementById('convAddInput');
const convAddSuggestions = document.getElementById('convAddSuggestions');
let convAddSeq = 0;
let convAddDebounce = null;

function renderConvAddSuggestions(results){
  convAddSuggestions.classList.add('show');
  convAddSuggestions.innerHTML = results.map((r,i)=>`<div class="lr-item" data-idx="${i}">${r.label}</div>`).join('');
  convAddSuggestions.querySelectorAll('.lr-item[data-idx]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const r = results[+el.dataset.idx];
      const resolved = resolveTimezoneForLatLon(r.lat, r.lon);
      pinCustomLocation(r.shortName, resolved.country || r.countryName || '', r.lat, r.lon, resolved.tz);
      convAddInput.value = '';
      convAddSuggestions.classList.remove('show');
    });
  });
}
convAddInput.addEventListener('input', ()=>{
  const q = convAddInput.value.trim();
  if(convAddDebounce) clearTimeout(convAddDebounce);
  if(q.length < 2){ convAddSuggestions.classList.remove('show'); return; }

  const instant = localSearchWithFallback(q, 6);
  if(instant.length) renderConvAddSuggestions(instant);

  const mySeq = ++convAddSeq;
  convAddDebounce = setTimeout(async ()=>{
    const results = await geocode(q, 6);
    if(mySeq !== convAddSeq) return;
    if(!results || results.__failed || !results.length){
      if(!instant.length){
        convAddSuggestions.classList.add('show');
        convAddSuggestions.innerHTML = `<div class="lr-item">${t('noMatchesSpelling')}</div>`;
      }
      return;
    }
    renderConvAddSuggestions(results);
  }, 300);
});
document.addEventListener('click', (e)=>{
  if(!e.target.closest('.conv-add-wrap')) convAddSuggestions.classList.remove('show');
});
convAddInput.addEventListener('keydown', (e)=>{
  if(e.key === 'Enter'){
    const first = convAddSuggestions.querySelector('.lr-item[data-idx="0"]');
    if(convAddSuggestions.classList.contains('show') && first) first.click();
  }
});

function pad2(n){ return String(n).padStart(2,'0'); }

function syncRefInputsFromInstant(){
  const city = pinned[refCityIdx];
  const lp = localParts(new Date(refInstant), city.tz);
  refDateInput.value = `${lp.year}-${pad2(monthIdx(lp.month)+1)}-${pad2(lp.day)}`;
  refTimeInput.value = `${pad2(lp.hour)}:${pad2(lp.minute)}`;
}
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function monthIdx(short){ return MONTHS.indexOf(short); }

function renderRefCitySelect(){
  refCitySelect.innerHTML = pinned.map((c,i)=>`<option value="${i}">${c.name}</option>`).join('');
  refCitySelect.value = String(refCityIdx);
}

refCitySelect.addEventListener('change', ()=>{
  refCityIdx = +refCitySelect.value;
  syncRefInputsFromInstant();
  renderConverter();
});

function applyRefFromInputs(){
  const city = pinned[refCityIdx];
  const [y,mo,d] = refDateInput.value.split('-').map(Number);
  const [h,mi] = refTimeInput.value.split(':').map(Number);
  if(!y || !mo || !d || isNaN(h) || isNaN(mi)) return;
  refInstant = zonedWallTimeToUTC(y, mo-1, d, h, mi, city.tz);
  renderConverter();
}
refDateInput.addEventListener('change', applyRefFromInputs);
refTimeInput.addEventListener('change', applyRefFromInputs);

document.getElementById('nowBtn').addEventListener('click', ()=>{
  refInstant = Date.now();
  syncRefInputsFromInstant();
  renderConverter();
});

function renderConverter(){
  renderRefCitySelect();
  syncRefInputsFromInstant();
  converterRows.innerHTML = '';
  const instant = new Date(refInstant);

  pinned.forEach((city, rowIdx)=>{
    const off = getOffsetMinutes(instant, city.tz);
    const lp = localParts(instant, city.tz);
    const hourFloat = lp.hour + lp.minute/60;

    const row = document.createElement('div');
    row.className = 'conv-row';

    const segs = [];
    for(let h=0; h<24; h++){
      const day = isDaytime(h+0.5);
      segs.push(`<div class="seg${day ? ' seg-day' : ''}"></div>`);
    }
    const cursorPct = (hourFloat/24)*100;

    row.innerHTML = `
      <span class="row-handle" draggable="true" title="Drag to reorder">⠿</span>
      <div class="conv-city">
        <div class="cc-name">${city.name}</div>
        <div class="cc-meta">${offsetLabel(off)} · ${lp.weekday}, ${lp.month} ${lp.day}</div>
        <div class="cc-time">${fmtTimeLoc(instant, city.tz).replace(/(AM|PM)/, '<span class="cc-ampm">$1</span>')}</div>
      </div>
      <div class="bar-wrap">
        <div class="bar" data-idx="${rowIdx}">
          ${segs.join('')}
          <div class="now-band" style="left:${cursorPct}%;"><div class="now-band-knob"></div></div>
        </div>
        <div class="bar-hours"><span>${t('bar12am')}</span><span>${t('bar6am')}</span><span>${t('bar12pm')}</span><span>${t('bar6pm')}</span><span>${t('bar12am')}</span></div>
      </div>
      <button class="conv-row-remove" title="Remove">×</button>
    `;
    converterRows.appendChild(row);
    row.querySelector('.conv-row-remove').addEventListener('click', ()=>togglePin(city));
    attachRowDragReorder(row, row.querySelector('.row-handle'), rowIdx);

    const barEl = row.querySelector('.bar');
    function setFromClientX(clientX){
      const rect = barEl.getBoundingClientRect();
      let frac = (clientX-rect.left)/rect.width;
      frac = Math.max(0, Math.min(0.9993, frac));
      const totalMin = Math.round(frac*24*60);
      const h = Math.floor(totalMin/60), mi = totalMin%60;
      const nowLp = localParts(instant, city.tz);
      refInstant = zonedWallTimeToUTC(+nowLp.year, monthIdx(nowLp.month), +nowLp.day, h, mi, city.tz);
      refCityIdx = rowIdx;
      renderConverter();
    }
    let barDragging = false;
    barEl.addEventListener('pointerdown', (e)=>{ barDragging = true; barEl.setPointerCapture(e.pointerId); setFromClientX(e.clientX); });
    barEl.addEventListener('pointermove', (e)=>{ if(barDragging) setFromClientX(e.clientX); });
    barEl.addEventListener('pointerup', ()=>{ barDragging = false; });
  });
}
