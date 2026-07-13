"use strict";

/* ---- color-vision-deficiency support ----
   Each "family" below is one time zone (Pacific/Mountain/etc). DEFAULT is the app's normal
   palette; the others are built from well-established colorblind-safe references (the
   Protanopia/Deuteranopia palette is the widely-used Okabe–Ito set, safe for both since
   they're both red-green deficiencies; Tritanopia gets its own set that avoids the
   blue/yellow hues that type confuses; Monochromacy relies on lightness + a repeating
   pattern rather than hue at all, since hue carries no information for full color blindness). */
const FAMILIES = {
  Pacific: ["America/Los_Angeles","America/Vancouver"],
  Mountain: ["America/Denver","America/Edmonton","America/Phoenix"],
  Central: ["America/Chicago","America/Winnipeg"],
  Eastern: ["America/New_York","America/Toronto"],
  Atlantic: ["America/Halifax"],
  Newfoundland: ["America/St_Johns"],
  Alaska: ["America/Anchorage","America/Puerto_Rico","America/St_Thomas"],
  Hawaii: ["Pacific/Honolulu","Pacific/Pago_Pago","Pacific/Guam","Pacific/Saipan"]
};
const FAMILY_ORDER = ["Pacific","Mountain","Central","Eastern","Atlantic","Newfoundland","Alaska","Hawaii"];
const FAMILY_PALETTES = {
  off:          {Pacific:"#2fa8c9", Mountain:"#f2786a", Central:"#e3ac3d", Eastern:"#2ec49c", Atlantic:"#7a6fd9", Newfoundland:"#d97a9c", Alaska:"#b48ee0", Hawaii:"#e08ed0"},
  protanopia:   {Pacific:"#0072B2", Mountain:"#E69F00", Central:"#F0E442", Eastern:"#009E73", Atlantic:"#56B4E9", Newfoundland:"#CC79A7", Alaska:"#D55E00", Hawaii:"#999999"},
  deuteranopia: {Pacific:"#0072B2", Mountain:"#E69F00", Central:"#F0E442", Eastern:"#009E73", Atlantic:"#56B4E9", Newfoundland:"#CC79A7", Alaska:"#D55E00", Hawaii:"#999999"},
  tritanopia:   {Pacific:"#D55E00", Mountain:"#009E73", Central:"#CC79A7", Eastern:"#E69F00", Atlantic:"#920000", Newfoundland:"#444444", Alaska:"#FF6EB4", Hawaii:"#8B4513"},
  monochrome:   {Pacific:"#1a1a1a", Mountain:"#4d4d4d", Central:"#808080", Eastern:"#e0e0e0", Atlantic:"#1a1a1a", Newfoundland:"#4d4d4d", Alaska:"#808080", Hawaii:"#e0e0e0"}
};
// in monochrome mode these families additionally get a diagonal-stripe pattern so they
// stay distinguishable from the same-lightness solid family they're paired with above
const MONOCHROME_PATTERNED_FAMILIES = ["Atlantic","Newfoundland","Alaska","Hawaii"];

function expandFamilyPalette(familyColors){
  const out = {};
  FAMILY_ORDER.forEach(fam=>{ FAMILIES[fam].forEach(tz=>{ out[tz] = familyColors[fam]; }); });
  return out;
}
function expandFamilyList(familyNames){
  const out = [];
  familyNames.forEach(fam=> FAMILIES[fam].forEach(tz=>out.push(tz)));
  return out;
}

const DEFAULT_ZONE_COLORS = expandFamilyPalette(FAMILY_PALETTES.off);
let ZONE_COLORS = {...DEFAULT_ZONE_COLORS};
const DEFAULT_STRIPED_ZONES = new Set(["America/Phoenix"]);
let STRIPED_ZONES = new Set(DEFAULT_STRIPED_ZONES);
let activeColorMode = 'off';

function getActiveFamilyPalette(){
  return FAMILY_PALETTES[activeColorMode] || FAMILY_PALETTES.off;
}
function syncZoneColors(){
  ZONE_COLORS = expandFamilyPalette(getActiveFamilyPalette());
  renderLegend();
}

function renderLegend(){
  const legend = document.getElementById('legend');
  if(!legend) return;
  const LEGEND_KEY = {Pacific:'legendPacific', Mountain:'legendMountain', Central:'legendCentral', Eastern:'legendEastern',
    Atlantic:'legendAtlantic', Newfoundland:'legendNewfoundland', Alaska:'legendAlaska', Hawaii:'legendHawaii'};
  const parts = FAMILY_ORDER.map(fam=>{
    const tzKey = FAMILIES[fam][0];
    const color = ZONE_COLORS[tzKey];
    const patterned = activeColorMode === 'monochrome' && MONOCHROME_PATTERNED_FAMILIES.includes(fam);
    const bg = patterned
      ? `repeating-linear-gradient(45deg, ${color}, ${color} 3px, rgba(255,255,255,0.5) 3px, rgba(255,255,255,0.5) 5px)`
      : color;
    return `<span><i class="swatch" style="background:${bg};"></i>${t(LEGEND_KEY[fam])}</span>`;
  });
  const noDstColor = ZONE_COLORS["America/Denver"];
  parts.push(`<span><i class="swatch" style="background:repeating-linear-gradient(45deg,${noDstColor},${noDstColor} 3px,rgba(255,255,255,0.5) 3px,rgba(255,255,255,0.5) 5px);"></i>${t('legendNoDST')}</span>`);
  legend.innerHTML = parts.join('\n');
}
function applyColorblindMode(mode){
  activeColorMode = mode;
  ZONE_COLORS = expandFamilyPalette(getActiveFamilyPalette());
  STRIPED_ZONES = new Set(DEFAULT_STRIPED_ZONES);
  if(mode === 'monochrome'){
    expandFamilyList(MONOCHROME_PATTERNED_FAMILIES).forEach(tz=>STRIPED_ZONES.add(tz));
  }
  renderLegend();
  if(typeof lastMapArgs !== 'undefined' && lastMapArgs){ drawStaticMap(...lastMapArgs); redrawTexture(); }
  if(markerMeshes.length) refreshMarkerLooks();
  if(typeof renderClockList === 'function') renderClockList();
}
document.getElementById('colorblindSelect').addEventListener('change', (e)=>{
  applyColorblindMode(e.target.value);
});
syncZoneColors();

/* ── Theme system ─────────────────────────────────────────────────────────── */
(function(){
  const THEME_KEY = 'meridian_theme';
  const DEFAULT_THEME = 'contrast';
  const sel = document.getElementById('themeSelect');

  function applyTheme(name){
    document.documentElement.dataset.theme = name;
    try{ localStorage.setItem(THEME_KEY, name); }catch(e){}
    // Invalidate the stripe-pattern cache — colors differ between dark and light palettes
    Object.keys(stripePatternCache).forEach(k => delete stripePatternCache[k]);
    syncZoneColors();
    updateAtmosphereForTheme();
    updateEarthMaterialForTheme();
    _accentTexCache.clear();
    refreshMarkerTexturesForTheme();
    if(typeof renderClockList === 'function') renderClockList();
    // Redraw the globe canvas with the new palette
    if(typeof lastMapArgs !== 'undefined' && lastMapArgs){
      drawStaticMap(...lastMapArgs);
      redrawTexture();
    } else if(typeof baseCtx !== 'undefined' && baseCtx){
      // Geo data not loaded yet; repaint the base canvas ocean and night tint
      baseCtx.fillStyle = getGlobePalette().ocean;
      baseCtx.fillRect(0, 0, TEX_W, TEX_H);
      redrawTexture();
    }
  }

  // Sync selector to whatever was already applied (either from localStorage via
  // the inline head script, or the default baked into the html attribute).
  const current = document.documentElement.dataset.theme || DEFAULT_THEME;
  sel.value = current;

  sel.addEventListener('change', (e)=> applyTheme(e.target.value));
})();

/* Returns a palette object with all theme-dependent canvas drawing colors.
   The globe canvas always uses the dark-theme palette so it stays visible inside
   the dark globe-stage container (same across every page theme). */
function getGlobePalette(){
  return {
    ocean:         OCEAN_COLOR,
    graticule:     'rgba(255,255,255,0.05)',
    countryBorder: 'rgba(255,255,255,0.42)',
    stateBorder:   'rgba(255,255,255,0.28)',
    stripeStroke:  'rgba(255,255,255,0.40)',
    labelFill:     'rgba(255,255,255,0.92)',
    labelStroke:   'rgba(6,9,18,0.65)',
    labelWidth:    null,
    oceanFill:     'rgba(150,190,235,0.5)',
    oceanStroke:   'rgba(4,6,14,0.5)',
    stateFill:     'rgba(255,255,255,0.78)',
    stateFillCity: 'rgba(255,255,255,0.70)',
    stateFillExtra:'rgba(255,255,255,0.82)',
    nightMax:      0.68,
    nightSteepness:3.2,
    nightRgb:      [5, 7, 18],
    markerGlow:    '#32eea8',
    markerSearch:  '#f06cd8',
  };
}

const stripePatternCache = {};
function getStripePattern(ctx, baseColor, stripeColor){
  const key = baseColor + '|' + (stripeColor || 'w');
  if(stripePatternCache[key]) return stripePatternCache[key];
  const c = document.createElement('canvas'); c.width = 12; c.height = 12;
  const pctx = c.getContext('2d');
  pctx.fillStyle = baseColor; pctx.fillRect(0,0,12,12);
  pctx.strokeStyle = stripeColor || 'rgba(255,255,255,0.4)'; pctx.lineWidth = 2.2;
  [-4,4,12,20].forEach(off=>{
    pctx.beginPath(); pctx.moveTo(off,12); pctx.lineTo(off+12,0); pctx.stroke();
  });
  const pat = ctx.createPattern(c, 'repeat');
  stripePatternCache[key] = pat;
  return pat;
}
function offsetToColor(offsetMinutes){
  const hours = offsetMinutes/60;
  if(activeColorMode === 'off'){
    const hue = ((hours+12)/26)*300;
    return `hsl(${hue.toFixed(1)}, 52%, 44%)`;
  }
  if(activeColorMode === 'monochrome'){
    const light = 15 + ((hours+12)/26)*65;
    return `hsl(0, 0%, ${light.toFixed(1)}%)`;
  }
  // colorblind modes: one safe hue, vary only lightness
  const hue = activeColorMode === 'tritanopia' ? 20 : 205;
  const light = 25 + ((hours+12)/26)*45;
  return `hsl(${hue}, 55%, ${light.toFixed(1)}%)`;
}

/* ── Zone accent lookup (pins, cards, legend share ZONE_COLORS / offsetToColor) ── */

function hexToRgba(hex, alpha){
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function colorToRgba(color, alpha){
  if(!color) return `rgba(128,128,128,${alpha})`;
  if(color.charAt(0) === '#') return hexToRgba(color, alpha);
  const m = color.match(/^hsl\(([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%\)$/);
  if(m) return `hsla(${m[1]}, ${m[2]}%, ${m[3]}%, ${alpha})`;
  return color;
}

/* Card accent bars need a touch more saturation/darkness than the map fill on white panels */
function deriveCardAccent(color){
  if(!color) return color;
  const theme = document.documentElement.dataset.theme || 'contrast';
  const onLight = theme === 'light' || theme === 'nordic';
  if(color.charAt(0) === '#'){
    const factor = onLight ? 0.72 : 0.82;
    const r = Math.round(parseInt(color.slice(1,3),16) * factor);
    const g = Math.round(parseInt(color.slice(3,5),16) * factor);
    const b = Math.round(parseInt(color.slice(5,7),16) * factor);
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
  }
  const m = color.match(/^hsl\(([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%\)$/);
  if(m){
    const h = +m[1];
    const s = Math.min(100, +m[2] * (onLight ? 1.28 : 1.18));
    const l = Math.max(0, +m[3] - (onLight ? 14 : 10));
    return `hsl(${h.toFixed(1)}, ${s.toFixed(1)}%, ${l.toFixed(1)}%)`;
  }
  return color;
}

function getUSLegendZoneColor(tz, now){
  tz = zoneGroup(tz);
  if(tz === 'America/Phoenix'){
    return isMountainDSTActive(now)
      ? ZONE_COLORS['America/Los_Angeles']
      : ZONE_COLORS['America/Denver'];
  }
  if(ZONE_COLORS[tz]) return ZONE_COLORS[tz];
  return null;
}

function getZoneAccent(city){
  const now = new Date();
  const usColor = getUSLegendZoneColor(city.tz, now);
  if(usColor) return usColor;
  return offsetToColor(getOffsetMinutes(now, city.tz));
}

function getZoneAccentCard(city){
  return deriveCardAccent(getZoneAccent(city));
}

function warmupAccentTextures(){
  const seen = new Set();
  function add(c){
    if(c && !seen.has(c)){ seen.add(c); getAccentTex(c); }
  }
  Object.values(ZONE_COLORS).forEach(add);
  if(typeof pinned !== 'undefined') pinned.forEach(city => add(getZoneAccent(city)));
}

let zoneColorMode = true;

/* ======================= GLOBE (three.js) ======================= */
const stage = document.getElementById('globeStage');
let renderer, scene, camera, earthGroup, earthMesh;
var markerMeshes = [];
let dragging = false, lastX = 0, lastY = 0, rotY = 0.6, rotX = -0.15;
var autoRotate = true;
function setAutoRotate(on){
  autoRotate = on;
  const btn = document.getElementById('autoRotateBtn');
  if(btn){
    btn.classList.toggle('active', on);
    const iconEl = btn.querySelector('.ibl-icon');
    const textEl = btn.querySelector('.ibl-text');
    if(iconEl) iconEl.textContent = on ? '⏸' : '▶';
    else btn.textContent = on ? '⏸' : '▶';
    if(textEl) textEl.textContent = on ? 'Pause' : 'Play';
    btn.title = on ? t('pauseRotation') : t('resumeRotation');
  }
}
let flyAnim = null;

function initGlobe(){
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, stage.clientWidth/stage.clientHeight, 0.1, 1000);
  camera.position.set(0,0,11.2);

  renderer = new THREE.WebGLRenderer({antialias:true, alpha:true});
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio||1));
  renderer.setSize(stage.clientWidth, stage.clientHeight);
  stage.insertBefore(renderer.domElement, stage.firstChild);

  scene.add(new THREE.AmbientLight(0xffffff, 1.25));

  earthGroup = new THREE.Group();
  earthGroup.rotation.x = rotX;
  earthGroup.rotation.y = rotY;
  scene.add(earthGroup);

  buildEarth();
  buildAtmosphere();
  buildMarkers();
  loadGeoData();

  window.addEventListener('resize', onResize);
  attachDragControls();
  animate();
}

let baseCtx, overlayCtx, canvasTex, baseCanvas, labelCanvas, labelCtx;
const TEX_W = 2048, TEX_H = 1024;

function buildEarth(){
  const geo = new THREE.SphereGeometry(5, 64, 48);

  baseCanvas = document.createElement('canvas');
  baseCanvas.width = TEX_W; baseCanvas.height = TEX_H;
  baseCtx = baseCanvas.getContext('2d');
  baseCtx.fillStyle = getGlobePalette().ocean;
  baseCtx.fillRect(0,0,TEX_W,TEX_H);

  labelCanvas = document.createElement('canvas');
  labelCanvas.width = TEX_W; labelCanvas.height = TEX_H;
  labelCtx = labelCanvas.getContext('2d');

  const overlayCanvas = document.createElement('canvas');
  overlayCanvas.width = TEX_W; overlayCanvas.height = TEX_H;
  overlayCtx = overlayCanvas.getContext('2d');
  canvasTex = new THREE.CanvasTexture(overlayCanvas);

  const mat = new THREE.MeshPhongMaterial({map:canvasTex, shininess:4, specular:0x111a2e});
  earthMesh = new THREE.Mesh(geo, mat);
  earthGroup.add(earthMesh);

  updateEarthMaterialForTheme();
  redrawTexture();
}

function updateEarthMaterialForTheme(){
  if(!earthMesh) return;
  earthMesh.material.specular.setHex(0x111a2e);
  earthMesh.material.shininess = 4;
}

function proj(lon, lat){ return [ (lon+180)/360*TEX_W, (90-lat)/180*TEX_H ]; }

function drawRing(ctx, ring){
  ctx.moveTo(...proj(ring[0][0], ring[0][1]));
  for(let i=1;i<ring.length;i++){ ctx.lineTo(...proj(ring[i][0], ring[i][1])); }
  ctx.closePath();
}
function fillGeometry(ctx, geometry, color){
  ctx.fillStyle = color;
  ctx.beginPath();
  if(geometry.type==='Polygon'){ geometry.coordinates.forEach(r=>drawRing(ctx,r)); }
  else if(geometry.type==='MultiPolygon'){ geometry.coordinates.forEach(poly=>poly.forEach(r=>drawRing(ctx,r))); }
  ctx.fill('evenodd');
}
function strokeMesh(ctx, mesh, style, width){
  ctx.strokeStyle = style; ctx.lineWidth = width; ctx.lineJoin='round';
  ctx.beginPath();
  const lines = mesh.type==='MultiLineString' ? mesh.coordinates : [mesh.coordinates];
  lines.forEach(line=>{
    if(!line || !line.length) return;
    ctx.moveTo(...proj(line[0][0], line[0][1]));
    for(let i=1;i<line.length;i++) ctx.lineTo(...proj(line[i][0], line[i][1]));
  });
  ctx.stroke();
}

/* ---- label placement: area-weighted polygon centroid, biggest ring wins ---- */
function ringArea(ring){
  let a = 0;
  for(let i=0;i<ring.length-1;i++){ a += ring[i][0]*ring[i+1][1] - ring[i+1][0]*ring[i][1]; }
  return a/2;
}
function ringCentroid(ring){
  let cx=0, cy=0, a=0;
  for(let i=0;i<ring.length-1;i++){
    const x0=ring[i][0], y0=ring[i][1], x1=ring[i+1][0], y1=ring[i+1][1];
    const cross = x0*y1 - x1*y0;
    a += cross; cx += (x0+x1)*cross; cy += (y0+y1)*cross;
  }
  a *= 0.5;
  if(Math.abs(a) < 1e-9){
    let sx=0, sy=0;
    ring.forEach(p=>{ sx+=p[0]; sy+=p[1]; });
    return [sx/ring.length, sy/ring.length];
  }
  return [cx/(6*a), cy/(6*a)];
}
function bbox(ring){
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  ring.forEach(p=>{ if(p[0]<minX)minX=p[0]; if(p[0]>maxX)maxX=p[0]; if(p[1]<minY)minY=p[1]; if(p[1]>maxY)maxY=p[1]; });
  return {w:maxX-minX, h:maxY-minY};
}
function labelPointForGeometry(geometry){
  const polys = geometry.type==='Polygon' ? [geometry.coordinates] : (geometry.type==='MultiPolygon' ? geometry.coordinates : null);
  if(!polys || !polys.length) return null;
  let best=null, bestArea=-1;
  polys.forEach(poly=>{
    const ring = poly[0];
    if(!ring || ring.length<3) return;
    const b = bbox(ring);
    const areaProxy = b.w*b.h;
    if(areaProxy > bestArea){ bestArea = areaProxy; best = ring; }
  });
  if(!best) return null;
  const c = ringCentroid(best);
  const b = bbox(best);
  return {lon:c[0], lat:c[1], bboxArea:b.w*b.h};
}
function drawTextLabel(ctx, lon, lat, text, size, opts){
  opts = opts || {};
  const pal = getGlobePalette();
  const [x,y] = proj(lon,lat);
  ctx.save();
  ctx.font = `${opts.weight||600} ${size}px ${opts.font||"'Inter', sans-serif"}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = pal.labelWidth || Math.max(1.5, size/7);
  ctx.strokeStyle = opts.stroke || pal.labelStroke;
  ctx.fillStyle = opts.fill || pal.labelFill;
  if(opts.letterSpace){ try{ ctx.letterSpacing = opts.letterSpace; }catch(e){} }
  const width = ctx.measureText(text).width;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.restore();
  return {x, y, width, height: size*1.15};
}
function drawFeatureLabels(ctx, features, opt){
  features.forEach(f=>{
    const lp = labelPointForGeometry(f.geometry);
    if(!lp) return;
    if(lp.bboxArea < opt.minArea) return;
    const size = Math.max(opt.minSize, Math.min(opt.maxSize, opt.base + Math.sqrt(lp.bboxArea)*opt.scale));
    const text = opt.nameOf ? opt.nameOf(f) : f.name;
    if(!text) return;
    const m = drawTextLabel(ctx, lp.lon, lp.lat, text, size, opt.style);
    if(opt.hitList){
      opt.hitList.push({
        x0:m.x-m.width/2, x1:m.x+m.width/2, y0:m.y-m.height/2, y1:m.y+m.height/2,
        name:f.name, kind:opt.kind, lat:lp.lat, lon:lp.lon
      });
    }
  });
}
function drawOceanLabels(ctx){
  OCEAN_LABELS.forEach(o=>{
    drawTextLabel(ctx, o.lon, o.lat, o.name, o.size, {
      weight:500, font:"'Space Grotesk', sans-serif",
      fill:'rgba(150,190,235,0.5)', stroke:'rgba(4,6,14,0.5)'
    });
  });
}

/* colorFn(tz) → CSS color string. When omitted, falls back to ZONE_COLORS (the North
   American family palette) which is correct for Canada but wrong for Russia etc. Pass an
   explicit colorFn for non-North-American MULTI countries so each band gets a proper
   UTC-offset-based color that also respects the active colorblind palette. */
function fillCountryByLonBands(ctx, geometry, bands, colorFn){
  // capped short of the actual pole: a thin rectangular color band, wrapped onto a sphere,
  // gets stretched into a full ring right at the pole (all longitudes converge to one point
  // there), so we leave a small gap rather than render that distortion
  const NORTH_CAP = 80;
  let prevLon = -180;
  bands.forEach(b=>{
    const lonEnd = Math.min(b.lt, 180);
    const color = colorFn ? colorFn(b.tz) : (ZONE_COLORS[b.tz] || '#7a7a7a');
    ctx.save();
    ctx.beginPath();
    const p1 = proj(prevLon, NORTH_CAP), p2 = proj(lonEnd, -90);
    ctx.rect(p1[0], p1[1], p2[0]-p1[0], p2[1]-p1[1]);
    ctx.clip();
    fillGeometry(ctx, geometry, color);
    ctx.restore();
    prevLon = lonEnd;
  });
}

/* Fills a country geometry using rectangular lon/lat zones (needed for Australia, where
   the Darwin vs Adelaide boundary is a latitude line, not a longitude line). */
function fillCountryByZoneRects(ctx, geometry, rects, now){
  rects.forEach(r=>{
    const color = offsetToColor(getOffsetMinutes(now, r.tz));
    ctx.save();
    ctx.beginPath();
    const p1 = proj(r.lonMin, r.latMax), p2 = proj(r.lonMax, r.latMin);
    ctx.rect(p1[0], p1[1], p2[0]-p1[0], p2[1]-p1[1]);
    ctx.clip();
    fillGeometry(ctx, geometry, color);
    ctx.restore();
  });
}

function drawStaticMap(countries, countryMesh, usStates, usMesh){
  const pal = getGlobePalette();
  baseCtx.clearRect(0,0,TEX_W,TEX_H);
  baseCtx.fillStyle = pal.ocean;
  baseCtx.fillRect(0,0,TEX_W,TEX_H);

  // subtle graticule
  baseCtx.strokeStyle = pal.graticule; baseCtx.lineWidth = 1;
  for(let lon=-180; lon<=180; lon+=15){
    baseCtx.beginPath(); const p1=proj(lon,90), p2=proj(lon,-90);
    baseCtx.moveTo(p1[0],p1[1]); baseCtx.lineTo(p2[0],p2[1]); baseCtx.stroke();
  }
  for(let lat=-75; lat<=75; lat+=15){
    baseCtx.beginPath(); const p1=proj(-180,lat), p2=proj(180,lat);
    baseCtx.moveTo(p1[0],p1[1]); baseCtx.lineTo(p2[0],p2[1]); baseCtx.stroke();
  }

  // fill each region either by continent (default) or by time zone
  if(zoneColorMode){
    const now = new Date();
    const offsetColorFn = tz => offsetToColor(getOffsetMinutes(now, tz));
    countries.forEach(f=>{
      if(f.name === "United States of America") return; // filled per-state below instead
      // Canada: longitude-band fill using North American family palette colors
      if(f.name === "Canada"){ fillCountryByLonBands(baseCtx, f.geometry, CANADA_TZ_BANDS); return; }
      // Australia: lat+lon rect fill (Darwin vs Adelaide share a longitude band but differ by latitude)
      if(f.name === "Australia"){ fillCountryByZoneRects(baseCtx, f.geometry, AUSTRALIA_ZONE_RECTS, now); return; }
      // Other multi-timezone countries with longitude-band resolvers
      const bands = MULTI_ZONE_BANDS[f.name];
      if(bands){ fillCountryByLonBands(baseCtx, f.geometry, bands, offsetColorFn); return; }
      const info = COUNTRY_INFO[f.name];
      let tz = info ? info.tz : null;
      if(tz === 'MULTI'){
        const lp = labelPointForGeometry(f.geometry);
        const resolver = MULTI_ZONE_RESOLVERS[f.name];
        tz = (resolver && lp) ? resolver(lp.lat, lp.lon) : 'UTC';
      }
      const off = tz ? getOffsetMinutes(now, tz) : 0;
      fillGeometry(baseCtx, f.geometry, offsetToColor(off));
    });
    usStates.forEach(f=>{
      const raw = US_STATE_TZ[f.name];
      let color, fill;
      if(raw === "America/Phoenix"){
        // Arizona never observes DST, so its fixed UTC-7 offset actually matches
        // Pacific Daylight Time in summer and Mountain Standard Time in winter
        color = isMountainDSTActive(now) ? ZONE_COLORS["America/Los_Angeles"] : ZONE_COLORS["America/Denver"];
        fill = getStripePattern(baseCtx, color, pal.stripeStroke);
      }else{
        const grp = raw ? zoneGroup(raw) : null;
        color = grp ? (ZONE_COLORS[grp] || '#7a7a7a') : '#7a7a7a';
        fill = (raw && STRIPED_ZONES.has(raw)) ? getStripePattern(baseCtx, color, pal.stripeStroke) : color;
      }
      fillGeometry(baseCtx, f.geometry, fill);
    });
  }else{
    countries.forEach(f=>{
      const info = COUNTRY_INFO[f.name];
      const color = info ? (CONTINENT_COLORS[info.c] || '#888') : '#7a7a7a';
      fillGeometry(baseCtx, f.geometry, color);
    });
  }

  // country borders
  strokeMesh(baseCtx, countryMesh, pal.countryBorder, 1.6);
  // US state borders (thinner, drawn on top, only visible within the US landmass already filled)
  strokeMesh(baseCtx, usMesh, pal.stateBorder, 0.9);

  lastMapArgs = [countries, countryMesh, usStates, usMesh];
  redrawLabels(currentLODTier());
}
let lastMapArgs = null;
if(document.fonts && document.fonts.ready){
  document.fonts.ready.then(()=>{
    if(lastMapArgs){ redrawLabels(currentLODTier()); redrawTexture(); }
  });
}

/* ---- zoom-responsive label detail (level of detail) ---- */
const ZOOM_NEAR = 7.5, ZOOM_FAR = 18;
const LOD_TIERS = [
  { // zoomed in close: reveal small countries/states, but shrink text so it sits inside their borders
    name:'close', country:{minArea:0.05, minSize:6, maxSize:16, base:3, scale:0.75},
    state:{show:true, minArea:0.03, minSize:5, maxSize:10, base:3, scale:0.5}, oceanScale:0.65
  },
  { // default / mid zoom
    name:'mid', country:{minArea:0.35, minSize:7, maxSize:24, base:5, scale:1.2},
    state:{show:true, minArea:1.0, minSize:6, maxSize:13, base:4, scale:0.7}, oceanScale:0.9
  },
  { // zoomed out: whole globe visible, only the biggest countries get names, text sized up to stay legible
    name:'far', country:{minArea:3, minSize:9, maxSize:30, base:7, scale:1.6},
    state:{show:false}, oceanScale:1.2 }
];
function currentLODTier(){
  if(!camera) return LOD_TIERS[1];
  const t = (camera.position.z - ZOOM_NEAR)/(ZOOM_FAR - ZOOM_NEAR); // 0=near,1=far
  if(t < 0.32) return LOD_TIERS[0];
  if(t < 0.7) return LOD_TIERS[1];
  return LOD_TIERS[2];
}
let labelHitRegions = [];
function redrawLabels(tier){
  if(!labelCtx || !lastMapArgs) return;
  const [countries, , usStates] = lastMapArgs;
  const pal = getGlobePalette();
  labelCtx.clearRect(0,0,TEX_W,TEX_H);
  labelHitRegions = [];

  OCEAN_LABELS.forEach(o=>{
    drawTextLabel(labelCtx, o.lon, o.lat, o.name, o.size*tier.oceanScale, {
      weight:500, font:"'Space Grotesk', sans-serif",
      fill: pal.oceanFill, stroke: pal.oceanStroke
    });
  });

  drawFeatureLabels(labelCtx, countries, Object.assign({
    kind:'country',
    hitList: labelHitRegions,
    // once a country's own states are being labeled, drop its country-level label so the
    // big name doesn't sit on top of (and block) the state names underneath it
    nameOf: f => (tier.state.show && f.name === "United States of America") ? null : (DISPLAY_NAME[f.name] || f.name),
    style: { weight:600, font:"'Inter', sans-serif", fill: pal.labelFill, stroke: pal.labelStroke }
  }, tier.country));

  if(tier.state.show){
    drawFeatureLabels(labelCtx, usStates, Object.assign({
      kind:'state',
      hitList: labelHitRegions,
      nameOf: f => f.name,
      style: { weight:500, font:"'Inter', sans-serif", fill: pal.stateFill, stroke: pal.labelStroke }
    }, tier.state));

    EXTRA_LABELS.forEach(el=>{
      const size = tier.state.minSize + el.weight*(tier.state.maxSize - tier.state.minSize);
      const extraFill = el.kind==='city' ? pal.stateFillCity : pal.stateFillExtra;
      const m = drawTextLabel(labelCtx, el.lon, el.lat, el.name, size, {
        weight: el.kind==='city' ? 500 : 600,
        font: "'Inter', sans-serif",
        fill: extraFill,
        stroke: pal.labelStroke
      });
      labelHitRegions.push({
        x0:m.x-m.width/2, x1:m.x+m.width/2, y0:m.y-m.height/2, y1:m.y+m.height/2,
        name:el.name, kind:el.kind, tz:el.tz, lat:el.lat, lon:el.lon
      });
    });
  }
}
let lodDebounceHandle = null, lastTierName = 'mid';
function scheduleLODUpdate(){
  if(lodDebounceHandle) clearTimeout(lodDebounceHandle);
  lodDebounceHandle = setTimeout(()=>{
    const tier = currentLODTier();
    if(tier.name !== lastTierName){
      lastTierName = tier.name;
      redrawLabels(tier);
      redrawTexture();
    }
  }, 140);
}

function redrawTexture(){
  if(!overlayCtx) return;
  const pal = getGlobePalette();
  overlayCtx.clearRect(0,0,TEX_W,TEX_H);
  overlayCtx.drawImage(baseCanvas, 0, 0);
  if(labelCanvas) overlayCtx.drawImage(labelCanvas, 0, 0);

  // day/night tint based on real current time — one continuous curve (no branch mismatch),
  // rendered as a true gradient so there's no banding at any zoom level
  const now = new Date();
  const utcH = now.getUTCHours() + now.getUTCMinutes()/60 + now.getUTCSeconds()/3600;
  const MAX_NIGHT = pal.nightMax;
  const STEEPNESS = pal.nightSteepness || 3.2;
  function nightAlpha(localH){
    const angle = ((localH - 12) / 24) * Math.PI * 2; // 0 at local noon, ±π at local midnight
    const dayness = Math.cos(angle);                  // +1 at noon, -1 at midnight, smooth in between
    const t = 1 / (1 + Math.exp(STEEPNESS * dayness)); // logistic curve, continuous everywhere
    return t * MAX_NIGHT;
  }

  const [r,g,b] = pal.nightRgb;
  const grad = overlayCtx.createLinearGradient(0, 0, TEX_W, 0);
  const stops = 240;
  for(let i=0; i<=stops; i++){
    const frac = i/stops;
    const lon = -180 + 360*frac;
    let localH = utcH + lon/15;
    localH = ((localH % 24) + 24) % 24;
    const night = nightAlpha(localH);
    grad.addColorStop(frac, `rgba(${r},${g},${b},${night.toFixed(3)})`);
  }
  overlayCtx.fillStyle = grad;
  overlayCtx.fillRect(0, 0, TEX_W, TEX_H);

  canvasTex.needsUpdate = true;
}

function buildAtmosphere(){
  const geo = new THREE.SphereGeometry(5.35, 48, 32);
  atmosphereMat = new THREE.ShaderMaterial({
    uniforms:{
      uRimColor: { value: new THREE.Color(0.45, 0.55, 0.95) },
      uIntensity: { value: 0.65 }
    },
    vertexShader:`
      varying vec3 vNormal;
      void main(){
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader:`
      uniform vec3 uRimColor;
      uniform float uIntensity;
      varying vec3 vNormal;
      void main(){
        float intensity = pow(0.62 - dot(vNormal, vec3(0.0,0.0,1.0)), 2.2);
        gl_FragColor = vec4(uRimColor, intensity * uIntensity);
      }`,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent:true,
    depthWrite:false
  });
  atmosphereMesh = new THREE.Mesh(geo, atmosphereMat);
  earthGroup.add(atmosphereMesh);
  updateAtmosphereForTheme();
}

let atmosphereMesh = null;
let atmosphereMat = null;
function updateAtmosphereForTheme(){
  if(!atmosphereMesh || !atmosphereMat) return;
  atmosphereMesh.visible = true;
  atmosphereMat.uniforms.uRimColor.value.setRGB(0.45, 0.55, 0.95);
  atmosphereMat.uniforms.uIntensity.value = 0.65;
  atmosphereMat.blending = THREE.AdditiveBlending;
}

function latLonToVec3(lat, lon, radius){
  const phi = (90 - lat) * Math.PI/180;
  const theta = (lon + 180) * Math.PI/180;
  return new THREE.Vector3(
    -radius * Math.cos(theta) * Math.sin(phi),
    radius * Math.cos(phi),
    radius * Math.sin(theta) * Math.sin(phi)
  );
}
function yawToFace(lat, lon){
  const p = latLonToVec3(lat, lon, 1);
  return Math.atan2(-p.x, p.z);
}
/* With rotation.order='YXZ' (yaw applied before pitch), yaw and pitch decouple cleanly:
   yaw brings the point's longitude into the vertical plane facing the camera, then pitch
   (which only affects Y/Z at that point) equals the point's latitude-driven angle exactly. */
function orientationToFace(lat, lon){
  const p = latLonToVec3(lat, lon, 1);
  const ry = Math.atan2(-p.x, p.z);
  const z1 = -p.x*Math.sin(ry) + p.z*Math.cos(ry);
  const rx = Math.atan2(p.y, z1);
  return { yaw: ry, pitch: rx };
}
function vec3ToLatLon(v, radius){
  const phi = Math.acos(Math.max(-1, Math.min(1, v.y/radius)));
  const theta = Math.atan2(v.z, -v.x);
  let lon = theta*180/Math.PI - 180;
  if(lon < -180) lon += 360;
  if(lon > 180) lon -= 360;
  const lat = 90 - phi*180/Math.PI;
  return {lat, lon};
}

function markerSpriteTexture(color){
  const c = document.createElement('canvas'); c.width=64; c.height=64;
  const ctx = c.getContext('2d');
  const cx=32, cy=32;
  // Drop shadow — keeps marker visible on both dark and light zone fills
  ctx.shadowColor='rgba(0,0,0,0.60)'; ctx.shadowBlur=10; ctx.shadowOffsetY=1;
  // Dark outer ring provides a defined edge against any zone color
  ctx.beginPath(); ctx.arc(cx,cy,19,0,Math.PI*2);
  ctx.fillStyle='rgba(0,0,0,0.62)'; ctx.fill();
  ctx.shadowBlur=0; ctx.shadowOffsetY=0;
  // White halo — high-contrast separator that reads on every background
  ctx.beginPath(); ctx.arc(cx,cy,16,0,Math.PI*2);
  ctx.fillStyle='rgba(255,255,255,0.95)'; ctx.fill();
  // Solid color center
  ctx.beginPath(); ctx.arc(cx,cy,11,0,Math.PI*2);
  ctx.fillStyle=color; ctx.fill();
  // Subtle inner highlight for depth
  const shine=ctx.createRadialGradient(cx-2,cy-3,0,cx,cy,11);
  shine.addColorStop(0,'rgba(255,255,255,0.42)'); shine.addColorStop(1,'rgba(0,0,0,0)');
  ctx.beginPath(); ctx.arc(cx,cy,11,0,Math.PI*2);
  ctx.fillStyle=shine; ctx.fill();
  return new THREE.CanvasTexture(c);
}

// One texture per palette color, built once and reused every frame — no per-frame cost
const _accentTexCache = new Map();
function getAccentTex(color){
  if(!_accentTexCache.has(color)) _accentTexCache.set(color, markerSpriteTexture(color));
  return _accentTexCache.get(color);
}

let glowTex, searchTex;
var searchMarker = null;
function refreshMarkerTexturesForTheme(){
  const pal = getGlobePalette();
  _accentTexCache.clear();
  glowTex = markerSpriteTexture(pal.markerGlow);
  searchTex = markerSpriteTexture(pal.markerSearch);
  if(markerMeshes.length) refreshMarkerLooks();
  if(searchMarker){
    searchMarker.material.map = searchTex;
    searchMarker.material.needsUpdate = true;
  }
}
function buildMarkers(){
  const pal = getGlobePalette();
  glowTex   = markerSpriteTexture(pal.markerGlow);
  searchTex = markerSpriteTexture(pal.markerSearch);
  warmupAccentTextures();
  CITIES.forEach(city=>{
    const pos = latLonToVec3(city.lat, city.lon, 5.02);
    const isPinned = pinned.includes(city);
    const tex = isPinned ? getAccentTex(getZoneAccent(city)) : glowTex;
    const mat = new THREE.SpriteMaterial({map: tex, depthTest:true, transparent:true});
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(isPinned?0.38:0.26, isPinned?0.38:0.26, 1);
    sprite.position.copy(pos);
    sprite.userData.city = city;
    earthGroup.add(sprite);
    markerMeshes.push(sprite);
  });
}
function refreshMarkerLooks(){
  markerMeshes.forEach(sprite=>{
    const city = sprite.userData.city;
    const isPinned = pinned.includes(city);
    // Map lookup only — texture was built once in buildMarkers / getAccentTex
    sprite.material.map = isPinned ? getAccentTex(getZoneAccent(city)) : glowTex;
    sprite.material.needsUpdate = true;
    if(sprite !== hoveredSprite){
      const s = isPinned ? 0.38 : 0.26;
      sprite.scale.set(s, s, 1);
    }
  });
}
function setSearchMarker(lat, lon, cityLike){
  if(searchMarker){ earthGroup.remove(searchMarker); }
  const mat = new THREE.SpriteMaterial({map: searchTex, depthTest:true, transparent:true});
  searchMarker = new THREE.Sprite(mat);
  searchMarker.scale.set(0.44,0.44,1);
  searchMarker.position.copy(latLonToVec3(lat, lon, 5.03));
  searchMarker.userData.city = cityLike;
  searchMarker.userData.isSearchMarker = true;
  earthGroup.add(searchMarker);
}

function addCustomMarker(city){
  const mat = new THREE.SpriteMaterial({map: getAccentTex(getZoneAccent(city)), depthTest:true, transparent:true});
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.38, 0.38, 1);
  sprite.position.copy(latLonToVec3(city.lat, city.lon, 5.02));
  sprite.userData.city = city;
  sprite.userData.isCustomMarker = true;
  earthGroup.add(sprite);
  markerMeshes.push(sprite);
  city._marker = sprite;
}
function removeCustomMarker(city){
  if(!city._marker) return;
  earthGroup.remove(city._marker);
  const idx = markerMeshes.indexOf(city._marker);
  if(idx >= 0) markerMeshes.splice(idx, 1);
  city._marker = null;
}

function onResize(){
  camera.aspect = stage.clientWidth/stage.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(stage.clientWidth, stage.clientHeight);
}

function attachDragControls(){
  const dom = renderer.domElement;
  let moved = false, downX=0, downY=0;

  dom.addEventListener('pointerdown', (e)=>{
    dragging = true; moved = false; flyAnim = null;
    lastX = e.clientX; lastY = e.clientY; downX = e.clientX; downY = e.clientY;
    dom.setPointerCapture(e.pointerId);
  });
  dom.addEventListener('pointermove', (e)=>{
    if(dragging){
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      if(Math.abs(e.clientX-downX)+Math.abs(e.clientY-downY) > 4){
        if(!moved && autoRotate) setAutoRotate(false);
        moved = true;
      }
      rotY += dx*0.005; rotX += dy*0.005;
      rotX = Math.max(-1.2, Math.min(1.2, rotX));
      earthGroup.rotation.y = rotY; earthGroup.rotation.x = rotX;
      lastX = e.clientX; lastY = e.clientY;
    }
    handleHover(e);
  });
  window.addEventListener('pointerup', (e)=>{
    if(dragging && !moved) handleClick(e);
    dragging = false;
  });
  dom.addEventListener('wheel', (e)=>{
    e.preventDefault();
    camera.position.z = Math.max(7.5, Math.min(18, camera.position.z + e.deltaY*0.01));
    scheduleLODUpdate();
  }, {passive:false});

  document.getElementById('autoRotateBtn').addEventListener('click', ()=>{
    setAutoRotate(!autoRotate);
  });
  document.getElementById('resetViewBtn').addEventListener('click', ()=>{
    flyAnim = null;
    rotX = -0.15; rotY = 0.6;
    camera.position.z = 11.2;
    scheduleLODUpdate();
  });
}

const raycaster = new THREE.Raycaster();
const pointerVec = new THREE.Vector2();
const tooltip = document.getElementById('tooltip');
const labelInfoBox = document.getElementById('labelInfoBox');
let hoveredCity = null;
let hoveredLabel = null;
var hoveredSprite = null;

function spriteBaseScale(sprite){
  if(sprite === searchMarker) return 0.44;
  return pinned.includes(sprite.userData.city) ? 0.38 : 0.26;
}
function setHoveredSprite(sprite){
  // Remove card highlight from the previously hovered sprite's row
  if(hoveredSprite && hoveredSprite !== sprite){
    const prevRow = clockRowEls.get(hoveredSprite.userData && hoveredSprite.userData.city);
    if(prevRow) prevRow.classList.remove('card-sprite-hover');
    const s = spriteBaseScale(hoveredSprite);
    hoveredSprite.scale.set(s, s, 1);
  }
  hoveredSprite = sprite;
  if(sprite){
    // Add card highlight for the new sprite's row
    const newRow = clockRowEls.get(sprite.userData && sprite.userData.city);
    if(newRow) newRow.classList.add('card-sprite-hover');
    const s = spriteBaseScale(sprite);
    // Respect prefers-reduced-motion: skip scale animation; instant state change is fine
    const noMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    sprite.scale.set(noMotion ? s : s * 1.6, noMotion ? s : s * 1.6, 1);
  }
}

function getPointer(e){
  const rect = renderer.domElement.getBoundingClientRect();
  pointerVec.x = ((e.clientX-rect.left)/rect.width)*2-1;
  pointerVec.y = -((e.clientY-rect.top)/rect.height)*2+1;
  return rect;
}

function resolveRegionTz(region){
  if(region.tz) return region.tz;
  if(region.kind === 'state'){
    return US_STATE_TZ[region.name] || 'America/New_York';
  }
  const info = COUNTRY_INFO[region.name];
  if(!info) return 'UTC';
  if(info.tz === 'MULTI'){
    const resolver = MULTI_ZONE_RESOLVERS[region.name];
    return resolver ? resolver(region.lat, region.lon) : 'UTC';
  }
  return info.tz;
}
function updateLabelInfoBox(){
  if(!hoveredLabel) return;
  const tz = resolveRegionTz(hoveredLabel);
  const now = new Date();
  const abbr = tzAbbreviation(now, tz);
  const KIND_LABEL = { state:t('kindUSState'), province:t('kindProvince'), city:t('kindCity'), country:t('kindCountry') };
  labelInfoBox.innerHTML = `
    <div class="lib-name">${hoveredLabel.name}</div>
    <div class="lib-kind">${KIND_LABEL[hoveredLabel.kind] || t('kindRegion')} · ${tz}</div>
    <div class="lib-row"><span class="lib-label">${t('localTimeLabel')}</span><span class="lib-value">${fmtTime24(now, tz)}${abbr ? ` <span class="lib-abbr">${abbr}</span>` : ''}</span></div>
    <div class="lib-row"><span class="lib-label">${t('utcLabel')}</span><span class="lib-value">${fmtTime24(now, 'UTC')}</span></div>
  `;
}
setInterval(updateLabelInfoBox, 1000);

function checkLabelHover(){
  if(!earthMesh || !labelHitRegions.length){
    if(hoveredLabel){ hoveredLabel = null; labelInfoBox.classList.remove('show'); }
    return;
  }
  const hit = raycaster.intersectObject(earthMesh)[0];
  if(!hit){
    if(hoveredLabel){ hoveredLabel = null; labelInfoBox.classList.remove('show'); }
    return;
  }
  const local = earthMesh.worldToLocal(hit.point.clone());
  const {lat, lon} = vec3ToLatLon(local, 5);
  const px = proj(lon, lat);
  const region = labelHitRegions.find(r => px[0]>=r.x0 && px[0]<=r.x1 && px[1]>=r.y0 && px[1]<=r.y1);
  if(!region){
    if(hoveredLabel){ hoveredLabel = null; labelInfoBox.classList.remove('show'); }
    return;
  }
  if(hoveredLabel !== region){
    hoveredLabel = region;
    updateLabelInfoBox();
    labelInfoBox.classList.add('show');
  }
}

function handleHover(e){
  const rect = getPointer(e);
  raycaster.setFromCamera(pointerVec, camera);
  const targets = searchMarker ? markerMeshes.concat([searchMarker]) : markerMeshes;
  const hits = raycaster.intersectObjects(targets);
  if(hits.length){
    const sprite = hits[0].object;
    const city = sprite.userData.city;
    hoveredCity = city;
    setHoveredSprite(sprite);
    renderer.domElement.style.cursor = dragging ? 'grabbing' : 'pointer';
    showTooltip(city, e.clientX-rect.left, e.clientY-rect.top);
  }else{
    hoveredCity = null;
    setHoveredSprite(null);
    renderer.domElement.style.cursor = dragging ? 'grabbing' : 'grab';
    tooltip.classList.remove('show');
  }
  checkLabelHover();
}

function showTooltip(city, x, y){
  const now = new Date();
  const off = getOffsetMinutes(now, city.tz);
  const hint = pinned.includes(city) ? t('clickToUnpin') : t('clickToPin');
  tooltip.innerHTML = `
    <div class="t-city">${city.name}</div>
    <div class="t-country">${city.country||''}</div>
    <div class="t-time">${fmtTimeLoc(now, city.tz)}</div>
    <div class="t-meta">${fmtDateShort(now, city.tz)} · ${offsetLabel(off)}</div>
    <div class="t-hint">${hint}</div>
  `;
  const stageRect = stage.getBoundingClientRect();
  let left = x + 18, top = y - 10;
  if(left + 190 > stageRect.width) left = x - 200;
  tooltip.style.left = left+'px';
  tooltip.style.top = Math.max(8, top)+'px';
  tooltip.classList.add('show');
}

function handleClick(e){
  if(!hoveredCity) return;
  togglePin(hoveredCity);
}

function flyToLatLon(lat, lon, opts){
  opts = opts || {};
  const { yaw: targetYaw, pitch: targetPitchRaw } = orientationToFace(lat, lon);
  const targetPitch = Math.max(-1.2, Math.min(1.2, targetPitchRaw));

  let curYaw = rotY % (Math.PI*2);
  let deltaYaw = targetYaw - curYaw;
  while(deltaYaw > Math.PI) deltaYaw -= Math.PI*2;
  while(deltaYaw < -Math.PI) deltaYaw += Math.PI*2;

  let curPitch = rotX % (Math.PI*2);
  let deltaPitch = targetPitch - curPitch;
  while(deltaPitch > Math.PI) deltaPitch -= Math.PI*2;
  while(deltaPitch < -Math.PI) deltaPitch += Math.PI*2;

  const startYaw = rotY, startPitch = rotX, t0 = performance.now(), dur = 800;
  const startZoom = camera.position.z;
  const targetZoom = opts.zoom != null ? opts.zoom : startZoom;
  setAutoRotate(false);
  flyAnim = function(){
    const t = Math.min(1, (performance.now()-t0)/dur);
    const ease = 1 - Math.pow(1-t, 3);
    rotY = startYaw + deltaYaw*ease;
    rotX = startPitch + deltaPitch*ease;
    earthGroup.rotation.y = rotY;
    earthGroup.rotation.x = rotX;
    camera.position.z = startZoom + (targetZoom-startZoom)*ease;
    if(t >= 1){ flyAnim = null; scheduleLODUpdate(); }
  };
}

function projectToScreen(worldVec3){
  const p = worldVec3.clone().project(camera);
  const rect = renderer.domElement.getBoundingClientRect();
  return { x: (p.x*0.5+0.5)*rect.width, y: (-p.y*0.5+0.5)*rect.height, visible: p.z < 1 };
}

/* keeps the tooltip glued to the search marker's on-screen position while the camera
   flies/zooms toward it, so the time info appears right at the pin without needing a hover */
function autoShowSearchTooltip(cityLike){
  function step(){
    if(!searchMarker) return;
    const wp = new THREE.Vector3();
    searchMarker.getWorldPosition(wp);
    const pos = projectToScreen(wp);
    if(pos.visible) showTooltip(cityLike, pos.x, pos.y);
    if(flyAnim) requestAnimationFrame(step);
  }
  step();
}

/* Same as autoShowSearchTooltip but for an existing pinned-city sprite. Works for both
   built-in CITIES (found by identity in markerMeshes) and custom-added cities
   (which store a direct _marker reference). */
function autoShowPinnedTooltip(city){
  const sprite = city._marker || markerMeshes.find(s => s.userData.city === city);
  if(!sprite) return;
  function step(){
    const wp = new THREE.Vector3();
    sprite.getWorldPosition(wp);
    const pos = projectToScreen(wp);
    if(pos.visible) showTooltip(city, pos.x, pos.y);
    if(flyAnim) requestAnimationFrame(step);
  }
  step();
}

function animate(){
  requestAnimationFrame(animate);
  if(flyAnim){ flyAnim(); }
  else if(autoRotate && !dragging){
    rotY += 0.0011;
    earthGroup.rotation.y = rotY;
  }
  renderer.render(scene, camera);
}
