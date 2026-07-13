"use strict";

/* ======================= TIME HELPERS ======================= */

function isValidTimeZone(tz){
  try{ Intl.DateTimeFormat('en-US', {timeZone: tz}); return true; }catch(e){ return false; }
}
function safeTz(tz){ return isValidTimeZone(tz) ? tz : 'UTC'; }

function getOffsetMinutes(date, timeZone){
  timeZone = safeTz(timeZone);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle:'h23',
    year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit'
  });
  const parts = dtf.formatToParts(date).reduce((acc,p)=>{ acc[p.type]=p.value; return acc; }, {});
  const asUTC = Date.UTC(+parts.year, +parts.month-1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUTC - date.getTime())/60000);
}

function offsetLabel(mins){
  const sign = mins < 0 ? "-" : "+";
  const abs = Math.abs(mins);
  const h = Math.floor(abs/60);
  const m = abs%60;
  return `UTC${sign}${h}${m ? ':'+String(m).padStart(2,'0') : ''}`;
}

function localParts(date, timeZone){
  timeZone = safeTz(timeZone);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle:'h23',
    year:'numeric', month:'short', day:'2-digit', weekday:'short',
    hour:'2-digit', minute:'2-digit', second:'2-digit'
  });
  const parts = dtf.formatToParts(date).reduce((acc,p)=>{ acc[p.type]=p.value; return acc; }, {});
  return {
    hour:+parts.hour, minute:+parts.minute, second:+parts.second,
    weekday:parts.weekday, month:parts.month, day:parts.day, year:parts.year
  };
}

function fmtTime12(date, timeZone){
  return new Intl.DateTimeFormat('en-US', {timeZone: safeTz(timeZone), hour:'numeric', minute:'2-digit', hour12:true}).format(date);
}
function fmtTime24(date, timeZone){
  return new Intl.DateTimeFormat('en-GB', {timeZone: safeTz(timeZone), hour:'2-digit', minute:'2-digit', hour12:false}).format(date);
}
// Languages that conventionally use 24-hour time; English is excluded (12h default)
const USE_24H_LANGS = new Set(['es','fr','de','pt','it','nl','pl','ru','tr','ar','hi','zh','ja','ko','vi','id']);
function fmtTimeLoc(date, timeZone){
  return USE_24H_LANGS.has(currentLang) ? fmtTime24(date, timeZone) : fmtTime12(date, timeZone);
}
function fmtDateShort(date, timeZone){
  return new Intl.DateTimeFormat('en-US', {timeZone: safeTz(timeZone), weekday:'short', month:'short', day:'numeric'}).format(date);
}
function tzAbbreviation(date, timeZone){
  timeZone = safeTz(timeZone);
  const locales = ['en-US','en-GB'];
  for(const loc of locales){
    try{
      const parts = new Intl.DateTimeFormat(loc, {timeZone, timeZoneName:'short', hour:'2-digit'}).formatToParts(date);
      const part = parts.find(p=>p.type==='timeZoneName');
      if(part && !/^GMT/.test(part.value)) return part.value;
    }catch(e){}
  }
  try{
    const part = new Intl.DateTimeFormat('en-US', {timeZone, timeZoneName:'short', hour:'2-digit'}).formatToParts(date).find(p=>p.type==='timeZoneName');
    return part ? part.value : '';
  }catch(e){ return ''; }
}

/* wall-clock time in a given timezone -> the corresponding UTC instant */
function zonedWallTimeToUTC(y, mo, d, h, mi, timeZone){
  let guess = Date.UTC(y, mo, d, h, mi, 0);
  for(let i=0;i<2;i++){
    const off = getOffsetMinutes(new Date(guess), timeZone);
    guess = Date.UTC(y, mo, d, h, mi, 0) - off*60000;
  }
  return guess;
}

function isDaytime(hourFloat){ return hourFloat >= 6 && hourFloat < 18; }
