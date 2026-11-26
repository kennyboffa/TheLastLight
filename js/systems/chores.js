// chores.js — Keeping the bunker livable.
//
// Every room gathers filth: after 2 days without cleaning it is dirty, after 4
// it is filthy. Dirt wears on everyone's mood; filth (and an overflowing toilet
// bucket) can make people sick. Cleaning takes about half an hour per room: the
// cleaner walks to the room (along the rows, down the ladder shaft), sweeps it,
// then moves on to the next room that needs it, and walks home when it's done.
// Cleaning the main room empties the toilet bucket too.
//
// Pop-up tags over the rooms say what needs doing; click one to get it done.
'use strict';

const DIRTY_DAYS = 2, FILTHY_DAYS = 4, BUCKET_DAYS = 2;
const CLEAN_HOURS = 0.5;                 // per room
const RECLEAN_AFTER_H = 12;              // a room cleaned this recently is left alone

function absNow(gs) { return gs.day * 1440 + gs.time; }

function chores(gs) {
  if (!gs.shelter.chores) {
    const now = absNow(gs), clean = {};
    for (const row of ROOM_GRID) for (const id of row) clean[id] = now;
    gs.shelter.chores = { clean, bucket: now };
  }
  return gs.shelter.chores;
}

function roomDirtDays(gs, id) { return (absNow(gs) - (chores(gs).clean[id] ?? absNow(gs))) / 1440; }
function roomDirtLevel(gs, id) {
  if (!getRoomUnlocked(id)) return 0;
  const d = roomDirtDays(gs, id);
  return d >= FILTHY_DAYS ? 2 : d >= DIRTY_DAYS ? 1 : 0;
}
function bucketDays(gs) { return (absNow(gs) - chores(gs).bucket) / 1440; }
function bucketDue(gs) { return bucketDays(gs) >= BUCKET_DAYS; }

function _roomCell(id) {
  for (let r = 0; r < ROOM_GRID.length; r++) { const c = ROOM_GRID[r].indexOf(id); if (c >= 0) return { col: c, row: r }; }
  return { col: 0, row: 0 };
}

/** The room that most needs cleaning (not cleaned in the last 12 h), or null. */
function nextRoomToClean(gs, skip) {
  const cands = [];
  for (const row of ROOM_GRID) for (const id of row) {
    if (id === skip || !getRoomUnlocked(id)) continue;
    const hrs = roomDirtDays(gs, id) * 24 + (id === 'main' && bucketDue(gs) ? 48 : 0);
    if (hrs >= RECLEAN_AFTER_H) cands.push({ id, hrs });
  }
  // nobody else already sweeping it
  const taken = new Set(_cleaners(gs).map(w => w.task.room));
  const free = cands.filter(c => !taken.has(c.id));
  free.sort((a, b) => b.hrs - a.hrs);
  return free.length ? free[0].id : null;
}

function _people(gs) {
  const out = [];
  if (!gs.parent.isExploring && !gs.parentMissing) out.push(gs.parent);
  out.push(gs.child);
  for (const s of gs.survivors) if (!s.onMission && !s.isExploring) out.push(s);
  return out;
}
function _cleaners(gs) { return _people(gs).filter(w => w.task && w.task.type === 'clean'); }

/** Someone free to clean: the selected character if idle, else the parent, a survivor, Lily. */
function pickCleaner(gs) {
  const idle = w => w && !w.task && !w.isSleeping && !w.isExploring && !w.onMission;
  const sel = typeof shelterUI !== 'undefined' && shelterUI.selectedChar;
  const selWho = sel === 'parent' ? gs.parent : sel === 'child' ? gs.child : gs.survivors.find(s => s.id === sel);
  if (idle(selWho)) return selWho;
  if (idle(gs.parent) && !gs.parentMissing) return gs.parent;
  const s = gs.survivors.find(idle);
  if (s) return s;
  return idle(gs.child) ? gs.child : null;
}

/** Give `who` the cleaning task, starting with `roomId`. */
function startCleaning(gs, who, roomId) {
  if (!who || who.task || who.isSleeping) return { ok: false, msg: `${who ? who.name : 'Nobody'} is busy.` };
  roomId = roomId || nextRoomToClean(gs);
  if (!roomId) return { ok: false, msg: 'Everything is clean already.' };
  who.task = { type: 'clean', room: roomId, arrived: false };
  who.taskDuration = CLEAN_HOURS;
  who.taskProgress = 0;
  if (who === gs.parent) gs.parent.isWorking = true;
  if (!who.cleanPos) who.cleanPos = { room: 'main', x: who.shelterX !== undefined ? who.shelterX : 30, sweep: 1 };
  who.cleanPos.returning = false;
  return { ok: true, msg: `${who.name} goes to clean the ${ROOM_DEFS[roomId].name.toLowerCase()}.` };
}

/** Cleaning only counts once they're in the room. */
function taskTicks(who) {
  return !(who.task && who.task.type === 'clean' && !who.task.arrived);
}

/** A room is done: mark it (and the bucket), then move on or head home. */
function finishCleaning(gs, who, task) {
  const ch = chores(gs);
  ch.clean[task.room] = absNow(gs);
  if (task.room === 'main') {
    if (bucketDue(gs)) addLog(`${who.name} emptied the toilet bucket.`, 'info');
    ch.bucket = absNow(gs);
  }
  giveXP(who, 4, gs);
  who._nextClean = nextRoomToClean(gs, task.room);
}

/** Called right after a finished task is cleared (see tickTasks). */
function afterTask(gs, who) {
  if (who._nextClean === undefined) return;
  const next = who._nextClean;
  who._nextClean = undefined;
  if (next) startCleaning(gs, who, next);
  else if (who.cleanPos) {
    who.cleanPos.returning = true;
    notify(`${who.name} finished cleaning. The shelter is tidy.`, 'good');
  }
  if (who === gs.parent && !who.task) gs.parent.isWorking = false;
}

// ── Walking between rooms (per frame, from updateCharWander) ────────────────

function moveCleaner(gs, who) {
  const pos = who.cleanPos;
  if (!pos) return false;
  if (who.isSleeping || who.isExploring) { delete who.cleanPos; return false; }
  const target = who.task && who.task.type === 'clean' ? who.task.room : (pos.returning ? 'main' : null);
  if (!target) { delete who.cleanPos; return false; }
  const step = 0.55 * Math.min(4, gs.timeScale || 1);
  const cur = _roomCell(pos.room), dst = _roomCell(target);
  const r = roomRect(cur.col, cur.row);
  pos.moving = true;
  const walk = (tx) => {
    const d = tx - pos.x;
    if (Math.abs(d) <= step) { pos.x = tx; return true; }
    pos.x += Math.sign(d) * step; who.facing = Math.sign(d);
    return false;
  };
  if (pos.room === target) {
    if (who.task && who.task.type === 'clean') {
      who.task.arrived = true;
      // sweep back and forth across the room
      const lo = 16, hi = r.w - 16;
      if (walk(pos.sweep > 0 ? hi : lo)) pos.sweep = -pos.sweep;
      pos.moving = false;
      return true;
    }
    // home again
    const home = who.shelterTargetX !== undefined ? who.shelterTargetX : 30;
    if (walk(home)) { who.shelterX = pos.x; who.shelterTargetX = pos.x; delete who.cleanPos; }
    return true;
  }
  if (cur.row !== dst.row) {
    if (cur.col !== 0) {                                // to the ladder shaft in the left column
      if (walk(2)) { const nr = roomRect(cur.col - 1, cur.row); pos.room = ROOM_GRID[cur.row][cur.col - 1]; pos.x = nr.w - 2; }
    } else if (walk(r.w / 2)) {                         // climb
      pos.room = ROOM_GRID[cur.row + Math.sign(dst.row - cur.row)][0];
      pos.x = r.w / 2;
    }
  } else {
    const dir = Math.sign(dst.col - cur.col);
    if (walk(dir > 0 ? r.w - 2 : 2)) {
      const nc = cur.col + dir, nr = roomRect(nc, cur.row);
      pos.room = ROOM_GRID[cur.row][nc];
      pos.x = dir > 0 ? 2 : nr.w - 2;
    }
  }
  return true;
}

/** Where to draw someone who is out of the main room: {x, y, pose, broom}. */
function cleanerDrawPos(who) {
  const pos = who.cleanPos;
  if (!pos) return null;
  const c = _roomCell(pos.room), r = roomRect(c.col, c.row);
  const sweeping = who.task && who.task.type === 'clean' && who.task.arrived;
  return { x: Math.round(r.x + pos.x), y: r.y + r.h - 4, pose: 'walk', broom: sweeping };
}

/** A broom in front of the sweeper, swishing. */
function drawBroom(ctx, x, y, facing) {
  const t = Date.now() / 160;
  const sw = Math.sin(t) * 3;
  const hx = x + facing * 5, hy = y - 22;
  const bx = x + facing * (12 + sw), by = y - 1;
  ctx.save();
  ctx.strokeStyle = '#7a5a34'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(bx, by - 4); ctx.stroke();
  ctx.fillStyle = '#b8a060';
  ctx.fillRect(Math.round(bx - 4), by - 4, 8, 3);
  ctx.fillStyle = '#8a7440';
  for (let i = -4; i < 4; i += 2) ctx.fillRect(Math.round(bx + i), by - 1, 1, 2);
  // dust kicked up
  ctx.fillStyle = 'rgba(170,150,110,0.5)';
  const k = (Date.now() / 300) % 1;
  ctx.fillRect(Math.round(bx - facing * 3 - k * 4 * facing), Math.round(by - 2 - k * 5), 1, 1);
  ctx.restore();
}

// ── Simulation ───────────────────────────────────────────────────────────────

/** Hourly: dirt and stink wear on the mood of whoever is home. */
function choresTick(gs, hrs) {
  if (!gs.shelter) return;
  chores(gs);
  let load = 0;
  for (const row of ROOM_GRID) for (const id of row) load += roomDirtLevel(gs, id) * 0.12;
  if (bucketDue(gs)) load += 0.3;
  if (!load) return;
  for (const w of _people(gs)) w.depression = clamp((w.depression || 0) + load * hrs, 0, 100);
}

/** Each night: filth and an overflowing bucket can make someone sick. */
function choresDayTick(gs) {
  chores(gs);
  let pct = 0;
  for (const row of ROOM_GRID) for (const id of row) if (roomDirtLevel(gs, id) === 2) pct += 4;
  if (bucketDays(gs) >= BUCKET_DAYS + 1) pct += 8;
  const dirty = ROOM_GRID.flat().filter(id => roomDirtLevel(gs, id) > 0).length;
  if (dirty) addLog(`${dirty} room${dirty > 1 ? 's are' : ' is'} getting dirty. Someone should clean.`, 'warn');
  if (pct && chance(pct)) {
    const who = randChoice([gs.child, gs.parent].filter(w => !w.infected));
    if (who) {
      who.infected = true;
      addLog(`The filth in the shelter made ${who.name} sick. They need antibiotics.`, 'danger');
      notify(`${who.name} got sick from the filth!`, 'danger');
    }
  }
}

// ── Drawing: filth, the bucket and its flies ─────────────────────────────────

function _h(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

/** Grime on the walls and floor, litter, cobwebs when it's filthy. */
function drawRoomFilth(ctx, gs, id, r) {
  const lvl = roomDirtLevel(gs, id);
  if (!lvl) return;
  const seed = id.length * 31 + id.charCodeAt(0);
  const fl = r.y + r.h - 6;
  ctx.save();
  // a grimy cast over the room
  ctx.fillStyle = `rgba(52,40,18,${lvl === 2 ? 0.28 : 0.15})`;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  // stains on the floor and the bottom of the wall
  const n = lvl === 2 ? 9 : 4;
  for (let i = 0; i < n; i++) {
    const x = r.x + 6 + _h(seed + i) * (r.w - 12), w = 4 + Math.round(_h(seed + i * 3) * 9);
    ctx.fillStyle = i % 3 ? 'rgba(46,34,16,0.55)' : 'rgba(70,58,26,0.5)';
    ctx.fillRect(Math.round(x), fl + 1 + Math.round(_h(seed + i * 7) * 3), w, 2);
    // damp streaks running down the wall
    if (i % 2) { ctx.fillStyle = 'rgba(40,32,14,0.45)'; ctx.fillRect(Math.round(x + 2), r.y + 6 + Math.round(_h(seed + i * 5) * 20), 2, 8 + Math.round(_h(seed + i) * 18)); }
  }
  // litter: wrappers, a can, crumbs
  const m = lvl === 2 ? 7 : 3;
  for (let i = 0; i < m; i++) {
    const x = Math.round(r.x + 8 + _h(seed + 40 + i) * (r.w - 16));
    const k = i % 3;
    ctx.fillStyle = k === 0 ? '#8a8270' : k === 1 ? '#6a3a2a' : '#c8b890';
    ctx.fillRect(x, fl + 2, k === 1 ? 3 : 2, k === 1 ? 2 : 1);
  }
  if (lvl === 2) {
    // cobwebs in the top corners
    ctx.strokeStyle = 'rgba(200,200,190,0.35)'; ctx.lineWidth = 0.6;
    for (const [cx, dir] of [[r.x + 1, 1], [r.x + r.w - 1, -1]]) {
      ctx.beginPath();
      for (let k = 0; k < 4; k++) { ctx.moveTo(cx, r.y + 1); ctx.lineTo(cx + dir * (10 - k * 2), r.y + 1 + k * 3); }
      ctx.moveTo(cx + dir * 4, r.y + 1); ctx.quadraticCurveTo(cx + dir * 4, r.y + 5, cx, r.y + 6);
      ctx.moveTo(cx + dir * 8, r.y + 1); ctx.quadraticCurveTo(cx + dir * 7, r.y + 9, cx, r.y + 10);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** x of the toilet bucket (main room, behind a hanging sheet). */
function bucketX(r) { return r.x + 104; }

function drawToiletBucket(ctx, gs, r) {
  const x = bucketX(r), fl = r.y + r.h - 6;
  const due = bucketDue(gs);
  // a sheet hung on a string for some privacy
  ctx.fillStyle = '#5a5a4e'; ctx.fillRect(x - 9, fl - 30, 1, 30);
  ctx.fillStyle = 'rgba(150,142,120,0.55)';
  ctx.fillRect(x - 8, fl - 29, 4, 22);
  ctx.fillStyle = '#3a3a34'; ctx.fillRect(x - 9, fl - 31, 18, 1);
  // bucket with a plank lid
  ctx.fillStyle = '#5c6066'; ctx.fillRect(x - 4, fl - 9, 9, 9);
  ctx.fillStyle = '#74787e'; ctx.fillRect(x - 4, fl - 9, 2, 9);
  ctx.fillStyle = '#44484c'; ctx.fillRect(x - 4, fl - 5, 9, 1);
  ctx.fillStyle = '#6a4a2a'; ctx.fillRect(x - 5, fl - 11, 11, 2);
  ctx.strokeStyle = '#3a3e42'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.arc(x + 0.5, fl - 10, 4, Math.PI, 0); ctx.stroke();   // handle
  if (due) {
    ctx.fillStyle = 'rgba(90,70,20,0.6)'; ctx.fillRect(x - 6, fl, 13, 1);      // spill
    // stink rising off it
    const t = Date.now() / 1000;
    ctx.strokeStyle = 'rgba(150,170,80,0.35)'; ctx.lineWidth = 0.8;
    for (let k = 0; k < 2; k++) {
      const ph = (t * 0.5 + k * 0.5) % 1;
      ctx.globalAlpha = 1 - ph;
      ctx.beginPath();
      for (let j = 0; j <= 6; j++) {
        const yy = fl - 12 - ph * 10 - j * 1.5, xx = x - 2 + k * 4 + Math.sin(t * 3 + j + k) * 1.5;
        j ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    drawFlies(ctx, x + 0.5, fl - 17, Math.min(7, 4 + Math.floor(bucketDays(gs) - BUCKET_DAYS)));
  }
}

/** Little black flies looping around a point. */
function drawFlies(ctx, cx, cy, n) {
  const t = Date.now() / 1000;
  for (let i = 0; i < n; i++) {
    const a = t * (2.2 + i * 0.37) + i * 2.1, b = t * (3.1 + i * 0.23) + i;
    const x = cx + Math.cos(a) * (4 + (i % 3) * 2) + Math.sin(b * 1.7) * 1.5;
    const y = cy + Math.sin(a * 1.3) * (3 + (i % 2) * 2) + Math.cos(b) * 1.2;
    // a dark body with pale flickering wings, readable against the dark wall
    ctx.fillStyle = '#0a0a0a'; ctx.fillRect(Math.round(x) - 0.5, Math.round(y) - 0.5, 1.5, 1.5);
    ctx.fillStyle = (i + Math.floor(t * 24)) % 2 ? 'rgba(220,226,232,0.85)' : 'rgba(180,190,200,0.45)';
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1.5, 1, 1); ctx.fillRect(Math.round(x) + 1, Math.round(y) - 1.5, 1, 1);
  }
}

// ── Pop-up tags ──────────────────────────────────────────────────────────────

const TAG_COL = { warn: ['#3a2c0c', '#e8c060'], danger: ['#3a1210', '#ff8070'], good: ['#16300e', '#9ad08a'], info: ['#10202e', '#8ab8e0'] };

/** Gather what needs doing and draw a tag over each spot. Returns hit boxes (world coords). */
function drawShelterTags(ctx, gs) {
  const tags = [];
  const t = Date.now() / 1000;
  const cleaningRooms = new Set(_cleaners(gs).map(w => w.task.room));
  for (let row = 0; row < ROOM_GRID.length; row++) for (let col = 0; col < ROOM_GRID[row].length; col++) {
    const id = ROOM_GRID[row][col];
    const lvl = roomDirtLevel(gs, id);
    const r = roomRect(col, row);
    if (cleaningRooms.has(id)) tags.push({ x: r.x + r.w / 2, y: r.y + 12, text: 'Cleaning...', kind: 'info' });
    else if (lvl) tags.push({ x: r.x + r.w / 2, y: r.y + 12, text: lvl === 2 ? 'Filthy! Clean' : 'Needs cleaning', kind: lvl === 2 ? 'danger' : 'warn',
      act: () => _assignClean(gs, id) });
  }
  const main = roomRect(0, 0);
  if (bucketDue(gs) && !cleaningRooms.has('main')) {
    tags.push({ x: bucketX(main), y: main.y + main.h - 44, text: 'Empty bucket', kind: 'danger', act: () => _assignClean(gs, 'main') });
  }
  if (typeof garden === 'function' && garden(gs)) {
    const g = garden(gs);
    const cx = GARDEN_HIT.x + GARDEN_HIT.w / 2;
    if (g.beds.some(b => b.crop && !b.dead && b.growth >= 1)) tags.push({ x: cx, y: GARDEN_HIT.y - 8, text: 'Harvest', kind: 'good', act: () => { shelterUI.activeMenu = 'garden'; } });
    else if (g.beds.some(b => b.crop && !b.dead && b.water < 0.3)) tags.push({ x: cx, y: GARDEN_HIT.y - 8, text: 'Water plants', kind: 'warn', act: () => { shelterUI.activeMenu = 'garden'; } });
    else if (g.beds.some(b => b.dead)) tags.push({ x: cx, y: GARDEN_HIT.y - 8, text: 'Clear dead crop', kind: 'warn', act: () => { shelterUI.activeMenu = 'garden'; } });
  }
  const w = gs.parent.equipped.weapon;
  if (w && typeof WEAPON_DURABILITY !== 'undefined' && WEAPON_DURABILITY[w] && weaponCondition(gs.parent, w) <= WEAPON_DURABILITY[w] * 0.2) {
    const ws = getRoomUnlocked('workshop') ? roomRect(0, 1) : main;
    tags.push({ x: ws.x + ws.w / 2, y: ws.y + 26, text: `Repair ${getItemDef(w).name}`, kind: 'warn',
      act: () => { shelterUI.activeMenu = 'crafting'; shelterUI.craftConfirm = null; } });
  }
  // draw
  const boxes = [];
  ctx.save();
  for (const [i, tg] of tags.entries()) {
    const kind = TAG_COL[tg.kind] || TAG_COL.info;
    ctx.font = uiFont(6, true);
    const tw = Math.ceil(ctx.measureText(tg.text).width) + 8, th = 10;
    const bob = Math.round(Math.sin(t * 2.6 + i) * 1.5);
    const x = Math.round(tg.x - tw / 2), y = Math.round(tg.y - th + bob);
    ctx.fillStyle = kind[0]; ctx.globalAlpha = 0.92;
    ctx.fillRect(x, y, tw, th);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = kind[1]; ctx.lineWidth = 0.8; ctx.strokeRect(x + 0.5, y + 0.5, tw - 1, th - 1);
    // little pointer
    ctx.fillStyle = kind[0];
    ctx.beginPath(); ctx.moveTo(tg.x - 3, y + th); ctx.lineTo(tg.x + 3, y + th); ctx.lineTo(tg.x, y + th + 3); ctx.fill();
    drawText(ctx, tg.text, tg.x, y + 7.5, kind[1], 6, 'center', true);
    if (tg.act) boxes.push({ x, y, w: tw, h: th + 3, act: tg.act });
  }
  ctx.restore();
  return boxes;
}

function _assignClean(gs, roomId) {
  const who = pickCleaner(gs);
  if (!who) { notify('Nobody is free to clean right now.', 'warn'); return; }
  const r = startCleaning(gs, who, roomId);
  notify(r.msg, r.ok ? 'good' : 'warn');
}
