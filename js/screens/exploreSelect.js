// exploreSelect.js — World map: pick where to go, then watch the trip there
// (and back) while the clock runs. Unvisited places sit under fog; places you
// have no map for are hidden until you find one.
'use strict';

let esScrollY = 0;   // kept for the old scroll handlers in main.js

// Map spots (map-local px). Must match MAP_POS in tools/gen_art.py (map_world.png).
const WORLD_MAP_POS = {
  shelter: [270, 190],
  forest: [200, 222], church: [338, 222],          // close to home
  rooftop: [355, 120], suburb: [170, 120], pharmacy: [420, 175],
  village: [90, 255], mall: [445, 80], police: [470, 270], factory: [110, 330],
  hospital: [500, 40], bunker: [60, 50],
};
const MAP_X = 10, MAP_Y = 40, MAP_W = 540, MAP_H = 360;
const MAP_PANEL_X = MAP_X + MAP_W + 8;

// mapUI.from: set while out in the field (choosing where to go next), else null
const mapUI = { selected: null, fogKey: '', fogCanvas: null, from: null };

// Latest time you can set out from the shelter
const LAST_DEPARTURE = 17 * 60;

// ── Travel time ──────────────────────────────────────────────────────────────

function _mapDist(locId, fromId) {
  const a = WORLD_MAP_POS[fromId || 'shelter'] || WORLD_MAP_POS.shelter, b = WORLD_MAP_POS[locId] || a;
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/** Minutes to walk (or cycle) to a location, from the shelter or from another location. */
function travelMinutes(gs, locId, fromId) {
  let mins = Math.max(20, Math.round(_mapDist(locId, fromId) / 2.2 / 5) * 5);
  if (gs.shelter && gs.shelter.hasBike) mins = Math.max(10, Math.round(mins / 2 / 5) * 5);
  return mins;
}

function fmtDuration(mins) {
  const h = Math.floor(mins / 60), m = Math.round(mins % 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m} min`;
}
function fmtClock(mins) {
  const t = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

function _visited(gs) {
  if (!gs.visitedLocations) gs.visitedLocations = Object.keys(gs.locationStates || {});
  return gs.visitedLocations;
}
function _unlocked(gs) { return gs.unlockedLocations || ['forest', 'church']; }

// ── Fog of war ───────────────────────────────────────────────────────────────

function _mapFog(gs) {
  const visited = _visited(gs), unlocked = _unlocked(gs);
  const key = visited.join(',') + '|' + unlocked.join(',');
  if (mapUI.fogCanvas && mapUI.fogKey === key) return mapUI.fogCanvas;
  const cv = mapUI.fogCanvas || document.createElement('canvas');
  cv.width = MAP_W; cv.height = MAP_H;
  const c = cv.getContext('2d');
  c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, MAP_W, MAP_H);
  c.fillStyle = 'rgba(12,12,16,0.9)';
  c.fillRect(0, 0, MAP_W, MAP_H);
  // drifting mist texture (fixed pattern)
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 160; i++) {
    const x = rnd() * MAP_W, y = rnd() * MAP_H, r = 10 + rnd() * 30;
    c.fillStyle = `rgba(40,42,48,${(0.05 + rnd() * 0.08).toFixed(3)})`;
    c.beginPath(); c.ellipse(x, y, r * 1.6, r, 0, 0, Math.PI * 2); c.fill();
  }
  // clear around home and places you've been; thin the fog where a map shows the way
  c.globalCompositeOperation = 'destination-out';
  const hole = (x, y, r, strength) => {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(0,0,0,${strength})`); g.addColorStop(0.6, `rgba(0,0,0,${strength})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  };
  const [hx, hy] = WORLD_MAP_POS.shelter;
  hole(hx, hy, 75, 1);
  for (const id of unlocked) {
    const p = WORLD_MAP_POS[id]; if (!p) continue;
    if (visited.includes(id)) {
      hole(p[0], p[1], 60, 1);
      // the road you took is known too
      for (let k = 0.2; k < 1; k += 0.2) hole(hx + (p[0] - hx) * k, hy + (p[1] - hy) * k, 26, 0.85);
    } else {
      hole(p[0], p[1], 34, 0.45);   // marked on a map, never seen: dim
    }
  }
  c.globalCompositeOperation = 'source-over';
  mapUI.fogKey = key;
  mapUI.fogCanvas = cv;
  return cv;
}

// ── Drawing ──────────────────────────────────────────────────────────────────

function _mapPt(id) { const p = WORLD_MAP_POS[id]; return [MAP_X + p[0], MAP_Y + p[1]]; }

/** Draw the map with roads, markers and fog. `opts.travel` hides travel times and hover. */
function drawWorldMap(ctx, gs, opts) {
  opts = opts || {};
  const mx = gs.mouse.x, my = gs.mouse.y;
  const visited = _visited(gs), unlocked = _unlocked(gs);
  ctx.save();
  ctx.beginPath(); ctx.rect(MAP_X, MAP_Y, MAP_W, MAP_H); ctx.clip();
  const bg = _envSpr.map_world;
  if (bg && bg.complete && bg.naturalWidth) ctx.drawImage(bg, MAP_X, MAP_Y);
  else fillRect(ctx, MAP_X, MAP_Y, MAP_W, MAP_H, '#262620');
  // roads to known places
  const [hx, hy] = _mapPt('shelter');
  ctx.setLineDash([4, 3]);
  for (const id of unlocked) {
    if (!WORLD_MAP_POS[id]) continue;
    const [x, y] = _mapPt(id);
    ctx.strokeStyle = visited.includes(id) ? 'rgba(176,150,104,0.75)' : 'rgba(150,130,96,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(x, y); ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.drawImage(_mapFog(gs), MAP_X, MAP_Y);

  // home
  fillRect(ctx, hx - 6, hy - 5, 12, 10, '#3a3e3a'); strokeRect(ctx, hx - 6, hy - 5, 12, 10, '#c8b878');
  fillRect(ctx, hx - 2, hy - 2, 4, 4, '#c8b878');
  drawText(ctx, 'HOME', hx, hy + 15, '#e0d098', 7, 'center', true);

  // locations (no map for it yet = hidden in the fog)
  const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 250);
  mapUI._markers = [];
  for (const loc of LOCATIONS_DB) {
    if (!unlocked.includes(loc.id) || !WORLD_MAP_POS[loc.id]) continue;
    const [x, y] = _mapPt(loc.id);
    const seen = visited.includes(loc.id);
    const sel = mapUI.selected === loc.id || opts.highlight === loc.id;
    const hov = !opts.travel && Math.hypot(mx - x, my - y) < 12;
    const diffColor = ['#4a9a4a', '#9a9a3a', '#c07030', '#c03030', '#a02020'][Math.min(4, loc.difficulty - 1)];
    ctx.save();
    ctx.globalAlpha = seen ? 1 : 0.7;
    if (sel || hov) { ctx.strokeStyle = '#f0e0a0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = '#141414'; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = seen ? diffColor : '#6a6a6a'; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
    if (!seen) drawText(ctx, '?', x, y + 3, '#e8e8e8', 7, 'center', true);
    drawText(ctx, loc.name, x + 1, y + 17, '#000', 7, 'center');
    drawText(ctx, loc.name, x, y + 16, seen ? '#e8e0c8' : '#a8a498', 7, 'center');
    if (mapUI.from === loc.id && !opts.travel) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#9ad08a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.stroke();
      drawText(ctx, 'YOU ARE HERE', x, y - 13, '#9ad08a', 6, 'center', true);
    } else if (!opts.travel) drawText(ctx, fmtDuration(travelMinutes(gs, loc.id, mapUI.from)), x, y - 10, '#c8b880', 6, 'center');
    if ((gs.mapNew || []).includes(loc.id)) {
      ctx.globalAlpha = 0.6 + 0.4 * pulse;
      drawText(ctx, 'NEW', x + 12, y - 4, '#f0c040', 6, 'left', true);
    }
    ctx.restore();
    if (mapUI.from !== loc.id) mapUI._markers.push({ id: loc.id, x, y });
  }
  ctx.restore();
  strokeRect(ctx, MAP_X, MAP_Y, MAP_W, MAP_H, C.border2);
}

function _drawMapHeader(ctx, gs, title) {
  drawText(ctx, title, MAP_X + 4, 22, C.textBright, 12, 'left', true);
  drawText(ctx, `Day ${gs.day}  ${fmtClock(gs.time)}`, CFG.W - 12, 20, C.textBright, 10, 'right', true);
  drawText(ctx, `${gs.weather.type}  ·  ${gs.shelter.hasBike ? 'by bike (half time)' : 'on foot'}`, CFG.W - 12, 33, C.textDim, 7, 'right');
}

// ── Destination screen ───────────────────────────────────────────────────────

const _MAP_BACK = () => ({ x: MAP_PANEL_X + 8, y: MAP_Y + MAP_H - 24, w: 60, h: 18 });

function renderExploreSelect(ctx, gs) {
  fillRect(ctx, 0, 0, CFG.W, CFG.H, C.bg);
  const from = mapUI.from && LOCATIONS_DB.find(l => l.id === mapUI.from);
  _drawMapHeader(ctx, gs, from ? `WHERE NEXT?  (at ${from.name})` : 'WORLD MAP');
  drawWorldMap(ctx, gs);
  if (from) {
    // a dashed line from where you stand to the place you picked
    const sel = mapUI.selected && WORLD_MAP_POS[mapUI.selected];
    if (sel) {
      const [ax, ay] = _mapPt(from.id), [bx, by] = _mapPt(mapUI.selected);
      ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(154,208,138,0.8)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.restore();
    }
  }
  const mx = gs.mouse.x, my = gs.mouse.y;
  const px = MAP_PANEL_X, pw = CFG.W - px - 8, py = MAP_Y;
  drawPanel(ctx, px, py, pw, MAP_H, C.panelBg, C.border2);
  mapUI._go = null;

  const loc = mapUI.selected && LOCATIONS_DB.find(l => l.id === mapUI.selected);
  if (!loc) {
    let y = py + 16;
    drawText(ctx, 'Choose a destination', px + 8, y, C.textBright, 9, 'left', true); y += 16;
    y = drawWrapped(ctx, 'Click a place on the map. Places you have not been to are shrouded. Find maps to mark more of the region.',
      px + 8, y, pw - 16, 7, C.textDim, 10) + 10;
    drawText(ctx, from ? `Times are from ${from.name}.` : 'Times are one way.', px + 8, y, C.textDim, 7); y += 22;
    drawText(ctx, 'Legend', px + 8, y, C.text, 8, 'left', true); y += 14;
    [['#4a9a4a', 'Easy'], ['#9a9a3a', 'Moderate'], ['#c07030', 'Dangerous'], ['#c03030', 'Deadly'], ['#6a6a6a', 'Unexplored']].forEach(([c, t]) => {
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(px + 14, y - 3, 4, 0, Math.PI * 2); ctx.fill();
      drawText(ctx, t, px + 24, y, C.textDim, 7); y += 13;
    });
  } else {
    const seen = _visited(gs).includes(loc.id);
    const mins = travelMinutes(gs, loc.id, mapUI.from);
    let y = py + 16;
    drawText(ctx, loc.name, px + 8, y, C.textBright, 9, 'left', true); y += 13;
    const stars = '★'.repeat(loc.difficulty) + '☆'.repeat(Math.max(0, 4 - loc.difficulty));
    drawText(ctx, `${stars}  ${seen ? 'explored' : 'unexplored'}`, px + 8, y, seen ? '#9a9a70' : '#888', 7); y += 14;
    drawText(ctx, `Travel: ${fmtDuration(mins)}${gs.shelter.hasBike ? ' (bike)' : ''}`, px + 8, y, '#d8c890', 8); y += 12;
    drawText(ctx, `Arrive about ${fmtClock(gs.time + mins)}`, px + 8, y, C.textDim, 7); y += 14;
    y = drawWrapped(ctx, seen ? loc.desc : 'You only know it from a map. ' + loc.desc, px + 8, y, pw - 16, 7, C.textDim, 10) + 8;
    ctx.font = '7px monospace';
    let tx = px + 8;
    for (const tag of getLocationTags(loc)) {
      const tw = ctx.measureText(tag).width + 6;
      if (tx + tw > px + pw - 6) { tx = px + 8; y += 13; }
      fillRect(ctx, tx, y - 8, tw, 11, '#1a2a18'); strokeRect(ctx, tx, y - 8, tw, 11, '#3a5a30');
      drawText(ctx, tag, tx + 3, y, '#6a9a60', 7);
      tx += tw + 4;
    }
    const reason = _travelBlockReason(gs, loc);
    const gy = py + MAP_H - 52;
    if (reason) drawWrapped(ctx, reason, px + 8, gy - 16, pw - 16, 7, C.textWarn, 9);
    drawButton(ctx, px + 8, gy, pw - 16, 22, from ? 'Travel there →' : 'Prepare & travel →', !reason && hitTest(mx, my, px + 8, gy, pw - 16, 22), false, !!reason);
    mapUI._go = reason ? null : { x: px + 8, y: gy, w: pw - 16, h: 22, loc };
  }
  const b = _MAP_BACK();
  drawButton(ctx, b.x, b.y, b.w, b.h, '< Back', hitTest(mx, my, b.x, b.y, b.w, b.h));
  mapUI._home = null;
  if (from) {
    // going home is always an option from the field
    const hx = b.x + b.w + 6, hw = pw - b.w - 22;
    const hm = travelMinutes(gs, from.id);
    drawButton(ctx, hx, b.y, hw, b.h, `Home (${fmtDuration(hm)})`, hitTest(mx, my, hx, b.y, hw, b.h));
    mapUI._home = { x: hx, y: b.y, w: hw, h: b.h };
  }
}

function _travelBlockReason(gs, loc) {
  if (gs.parent.tiredness >= 70) return 'Too exhausted to go on. Rest first.';
  if (gs.parent.depression >= 90) return 'Too overwhelmed to face the outside.';
  if (!mapUI.from && gs.time > LAST_DEPARTURE) return 'Too late to set out today (after 17:00).';
  if (gs.time + travelMinutes(gs, loc.id, mapUI.from) > CFG.DAY_END - 60) return 'Too late to get there before dark.';
  return null;
}

/** Why the parent can't leave the shelter right now, or null. */
function setOutBlockReason(gs) {
  if (gs.parent.isExploring) return 'Already out.';
  if (gs.time > LAST_DEPARTURE) return "It's past 17:00. Too late to set out today.";
  if (gs.parent.tiredness >= 70) return 'Stamina too low to go out. Rest first.';
  return null;
}

function getLocationTags(loc) {
  const tags = [];
  if (loc.canHunt)     tags.push('hunting');
  const allTables = loc.zones.map(z => z.lootTable).join(',');
  if (allTables.includes('food'))     tags.push('food');
  if (allTables.includes('medical'))  tags.push('medicine');
  if (allTables.includes('material')) tags.push('materials');
  if (allTables.includes('electron')) tags.push('electronics');
  if (allTables.includes('nature'))   tags.push('foraging');
  if (loc.zones.some(z => (z.buildings||[]).length > 0)) tags.push('buildings');
  if (loc.zones.some(z => z.requiresLockpick))           tags.push('lockpick needed');
  tags.push(`diff ${loc.difficulty}/4`);
  return tags;
}

function exploreSelectClick(mx, my, gs) {
  const b = _MAP_BACK();
  if (hitTest(mx, my, b.x, b.y, b.w, b.h)) {
    mapUI.selected = null;
    if (mapUI.from) { mapUI.from = null; gs.screen = 'explore'; }   // back to where you were standing
    else gs.screen = 'shelter';
    return;
  }
  if (mapUI._home && hitTest(mx, my, mapUI._home.x, mapUI._home.y, mapUI._home.w, mapUI._home.h)) {
    mapUI.selected = null;
    gs.screen = 'explore';
    endExploration(gs);
    return;
  }
  if (mapUI._go && hitTest(mx, my, mapUI._go.x, mapUI._go.y, mapUI._go.w, mapUI._go.h)) {
    const loc = mapUI._go.loc;
    if (_travelBlockReason(gs, loc)) return;
    gs.mapNew = (gs.mapNew || []).filter(id => id !== loc.id);
    if (mapUI.from) {
      // straight on from the field: no stop at home to repack
      const fromId = mapUI.from;
      mapUI.from = null; mapUI.selected = null;
      gs.inCombat = false; gs.combat = null;
      beginTravel(gs, loc, 'out', fromId);
      return;
    }
    gs.screen = 'packScreen';
    gs._pendingLoc = loc;
    return;
  }
  for (const m of mapUI._markers || []) {
    if (Math.hypot(mx - m.x, my - m.y) < 13) {
      mapUI.selected = m.id;
      gs.mapNew = (gs.mapNew || []).filter(id => id !== m.id);
      return;
    }
  }
  if (hitTest(mx, my, MAP_X, MAP_Y, MAP_W, MAP_H)) mapUI.selected = null;
}

// ── Travelling (out and back) ────────────────────────────────────────────────

/** Walk to (dir 'out') or home from (dir 'home') a location while time passes. */
function beginTravel(gs, loc, dir, fromId) {
  const mins = travelMinutes(gs, loc.id, fromId);
  gs.travel = { locId: loc.id, fromId: fromId || null, dir, mins, spent: 0, t: 0, dur: clamp(mins / 12.5, 3.2, 9) };   // walk at a readable pace; game time is the same
  gs.screen = 'travel';
  gs.keys = {};
  gs.mouse.down = false;
}

function _travelAdvance(gs, mins) {
  // Time and needs move on as they would at home (the walk itself is uneventful)
  gs.screen = 'shelter';
  tickStats(gs, mins / CFG.MINS_PER_REAL_SEC);
  if (gs.screen === 'shelter' && !gs.dayFade.active) gs.screen = 'travel';
}

function updateTravel(gs, dt) {
  const tr = gs.travel;
  if (!tr) { gs.screen = 'shelter'; return; }
  const prevT = tr.t;
  tr.t = Math.min(tr.dur, tr.t + dt);
  const want = tr.mins * (tr.t / tr.dur);
  if (want > tr.spent) { const step = want - tr.spent; tr.spent = want; _travelAdvance(gs, step); }
  if (gs.dayFade.active) { gs.travel = null; gs.screen = 'shelter'; return; }   // night fell on the way
  if (Math.floor(tr.t * 3) !== Math.floor(prevT * 3) && Audio.step) Audio.step(true);
  if (tr.t >= tr.dur) _finishTravel(gs);
}

function _finishTravel(gs) {
  const tr = gs.travel;
  gs.travel = null;
  const loc = LOCATIONS_DB.find(l => l.id === tr.locId);
  gs.screen = 'shelter';
  gs.zoomAnim = { scale: 1.0, target: 1.0 };
  if (tr.dir === 'out') startExploration(gs, loc, true);   // fades from here into the location
}

/** Skip the rest of the trip (click / Space). */
function travelSkip(gs) {
  const tr = gs.travel;
  if (!tr) return;
  const left = tr.mins - tr.spent;
  tr.spent = tr.mins; tr.t = tr.dur;
  if (left > 0) _travelAdvance(gs, left);
  if (gs.dayFade.active) { gs.travel = null; gs.screen = 'shelter'; return; }
  _finishTravel(gs);
}

function renderTravel(ctx, gs) {
  const tr = gs.travel;
  fillRect(ctx, 0, 0, CFG.W, CFG.H, C.bg);
  if (!tr) return;
  const loc = LOCATIONS_DB.find(l => l.id === tr.locId);
  _drawMapHeader(ctx, gs, tr.dir === 'out' ? 'TRAVELLING' : 'HEADING HOME');
  drawWorldMap(ctx, gs, { travel: true, highlight: tr.locId });

  // party marker moving along the road
  const k = tr.t / tr.dur, e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  const [hx, hy] = _mapPt(tr.fromId || 'shelter'), [lx, ly] = _mapPt(tr.locId);
  const [ax, ay, bx, by] = tr.dir === 'out' ? [hx, hy, lx, ly] : [lx, ly, hx, hy];
  const x = ax + (bx - ax) * e, y = ay + (by - ay) * e;
  ctx.save();
  ctx.strokeStyle = 'rgba(240,220,150,0.8)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(x, y); ctx.stroke();
  // little walking figure (half size)
  ctx.translate(x, y + 2);
  ctx.scale(0.5, 0.5);
  drawParent(ctx, 0, -18, 2, bx >= ax ? 1 : -1, Math.floor(Date.now() / 90), gs.parent.gender, 'run', null);
  ctx.restore();
  const comp = gs.exploreCompanionId && (gs.survivors || []).find(s => s.id === gs.exploreCompanionId);
  const names = gs.parent.name + (comp ? ` & ${comp.name}` : '');
  drawText(ctx, names, x + 1, y - 27, '#000', 7, 'center', true);
  drawText(ctx, names, x, y - 28, '#f0e0a0', 7, 'center', true);

  // side panel: clock running
  const px = MAP_PANEL_X, pw = CFG.W - px - 8, py = MAP_Y;
  drawPanel(ctx, px, py, pw, MAP_H, C.panelBg, C.border2);
  let ty = py + 16;
  const fromLoc = tr.fromId && LOCATIONS_DB.find(l => l.id === tr.fromId);
  drawText(ctx, tr.dir === 'out' ? `To ${loc.name}` : `From ${loc.name}`, px + 8, ty, C.textBright, 8, 'left', true); ty += 12;
  if (fromLoc) { drawText(ctx, `from ${fromLoc.name}`, px + 8, ty, C.textDim, 7); }
  ty += 4;
  drawText(ctx, gs.shelter.hasBike ? 'Cycling' : 'Walking', px + 8, ty, C.textDim, 7); ty += 22;
  drawText(ctx, fmtClock(gs.time), px + pw / 2, ty + 8, '#e8d8a0', 18, 'center', true); ty += 26;
  drawStatBar(ctx, px + 10, ty, pw - 20, 6, tr.spent, tr.mins, '#b09a5a');
  ty += 18;
  drawText(ctx, `${fmtDuration(Math.max(0, tr.mins - tr.spent))} to go`, px + pw / 2, ty, C.textDim, 7, 'center');
  drawText(ctx, 'Click or Space to skip', px + pw / 2, py + MAP_H - 10, '#5a5a66', 7, 'center');
}
