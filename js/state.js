"use strict";

/* ======================= LANGUAGE / I18N ======================= */

var currentLang = 'en';
function t(key){
  const dict = I18N[currentLang] || I18N.en;
  return (dict && dict[key] !== undefined) ? dict[key] : (I18N.en[key] || key);
}
function applyLanguage(lang){
  currentLang = I18N[lang] ? lang : 'en';
  // RTL: only Arabic needs dir="rtl"; all other supported languages are LTR
  const isRTL = currentLang === 'ar';
  document.documentElement.dir  = isRTL ? 'rtl' : 'ltr';
  document.documentElement.lang = currentLang;
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const key = el.getAttribute('data-i18n');
    const val = t(key);
    if(val.indexOf('<b>') !== -1) el.innerHTML = val; else el.textContent = val;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el=>{
    el.title = t(el.getAttribute('data-i18n-title'));
  });
  if(typeof renderLegend === 'function') renderLegend();
  if(typeof renderClockList === 'function') renderClockList();
  if(typeof renderConverter === 'function') renderConverter();
  if(typeof updatePresetButton === 'function') updatePresetButton();
  if(typeof setAutoRotate === 'function' && typeof autoRotate !== 'undefined') setAutoRotate(autoRotate);
  if(typeof LOCAL_TZ !== 'undefined'){
    const tzLabel = document.getElementById('localTzLabel');
    if(tzLabel){
      const abbr = tzAbbreviation(new Date(), LOCAL_TZ);
      tzLabel.textContent = `${t('yourTimezone')}${LOCAL_TZ}${abbr ? ' · ' + abbr : ''}`;
    }
  }
}
document.getElementById('languageSelect').addEventListener('change', (e)=>{
  applyLanguage(e.target.value);
});

/* ======================= STATE ======================= */

var pinned = [];
const defaults = ["New York","London","Dubai","Tokyo","Sydney"];
defaults.forEach(n=>{
  const c = CITIES.find(x=>x.name===n);
  if(c) pinned.push(c);
});
if(!pinned.find(c=>c.tz===LOCAL_CITY.tz)) pinned.unshift(LOCAL_CITY);

var refCityIdx = 0;
var refInstant = Date.now();

/* ======================= MUTATION FUNCTIONS ======================= */

function togglePin(city){
  const idx = pinned.indexOf(city);
  if(idx >= 0){
    if(pinned.length <= 1) return;
    pinned.splice(idx,1);
    if(city.custom) removeCustomMarker(city);
  }else{
    pinned.push(city);
  }
  refCityIdx = Math.min(refCityIdx, pinned.length-1);
  refreshMarkerLooks();
  renderClockList();
  renderConverter();
}

/* removes every pinned city except "home" (the auto-detected local time zone), so the
   app is left in a valid, still-usable state rather than completely empty */
function clearAllPins(){
  pinned.forEach(city=>{ if(city.custom) removeCustomMarker(city); });
  pinned = [LOCAL_CITY];
  refCityIdx = 0;
  refreshMarkerLooks();
  renderClockList();
  renderConverter();
}

/* swaps the whole pinned list between the app's normal international defaults and a
   4-city US time zone spread (Pacific/Mountain/Central/Eastern) */
function swapPinnedTo(newPinned){
  pinned.forEach(city=>{ if(city.custom) removeCustomMarker(city); });
  pinned = newPinned;
  newPinned.forEach(city=>{ if(city.custom) addCustomMarker(city); });
  refCityIdx = 0;
  refreshMarkerLooks();
  renderClockList();
  renderConverter();
}

/* drag-to-reorder, shared by the world clock list and the converter rows since both
   just render the same underlying `pinned` array in order */
function movePinned(fromIdx, toIdx){
  if(isNaN(fromIdx) || isNaN(toIdx)) return;
  if(fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= pinned.length || toIdx >= pinned.length) return;
  const refCity = pinned[refCityIdx];
  const [item] = pinned.splice(fromIdx, 1);
  pinned.splice(toIdx, 0, item);
  const newIdx = pinned.indexOf(refCity);
  refCityIdx = newIdx >= 0 ? newIdx : 0;
  renderClockList();
  renderConverter();
}

function pinCustomLocation(name, country, lat, lon, tz){
  const city = {name, country, lat, lon, tz, custom:true};
  pinned.push(city);
  addCustomMarker(city);
  renderClockList();
  renderConverter();
}

var currentLookup = null; // {name, addr, lat, lon, tz}
