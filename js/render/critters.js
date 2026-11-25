// critters.js — Harmless background animals: mice and rats scurrying in
// buildings, crows pecking on the ground that take off when you come near,
// and the odd flock crossing the sky. Purely visual, never saved.
'use strict';

const _critterClock = { last: 0 };

function _critterDt() {
  const now = performance.now();
  const dt = _critterClock.last ? Math.min(0.1, (now - _critterClock.last) / 1000) : 0;
  _critterClock.last = now;
  return dt;
}

// ── Indoors: mice & rats ─────────────────────────────────────────────────────

function _spawnRodents(area) {
  const list = [];
  if (Math.random() < 0.4) {
    const n = Math.random() < 0.3 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      list.push({
        kind: Math.random() < 0.3 ? 'rat' : 'mouse',
        x: 40 + Math.random() * (area.width - 80),
        dir: Math.random() < 0.5 ? -1 : 1,
        speed: 0, timer: 1 + Math.random() * 3, gone: false, legT: 0,
      });
    }
  }
  return list;
}

function _updateRodent(m, area, playerX, dt) {
  if (m.gone) return;
  const scared = Math.abs(playerX - m.x) < 70;
  if (scared) {
    m.dir = m.x < playerX ? -1 : 1;           // bolt away from you
    m.speed = m.kind === 'rat' ? 150 : 180;
  } else {
    m.timer -= dt;
    if (m.timer <= 0) {
      if (m.speed > 0) { m.speed = 0; m.timer = 1 + Math.random() * 4; }            // stop and sniff
      else { m.speed = 60 + Math.random() * 70; m.dir = Math.random() < 0.5 ? -1 : 1; m.timer = 0.3 + Math.random() * 0.9; }
    }
  }
  m.x += m.dir * m.speed * dt;
  m.legT += dt * (m.speed > 0 ? 14 : 0);
  // into a hole in the skirting board
  if (m.x < 10 || m.x > area.width - 10) {
    if (scared) m.gone = true;
    else { m.x = clamp(m.x, 10, area.width - 10); m.dir *= -1; }
  }
}

function _drawRodent(ctx, m, groundY) {
  if (m.gone) return;
  const big = m.kind === 'rat';
  const w = big ? 9 : 6, h = big ? 4 : 3;
  const x = Math.round(m.x), y = groundY;
  const body = big ? '#3a3430' : '#5a524a', dark = '#1e1a18';
  ctx.save();
  ctx.translate(x, y);
  if (m.dir < 0) ctx.scale(-1, 1);
  // tail
  fillRect(ctx, -w / 2 - (big ? 6 : 4), -2, big ? 6 : 4, 1, '#6a5a52');
  // body and head
  fillRect(ctx, -w / 2, -h - 1, w, h, body);
  fillRect(ctx, w / 2 - 1, -h, 3, h - 1, body);
  fillRect(ctx, w / 2 + 2, -h + 1, 1, 1, '#a07a6a');               // nose
  fillRect(ctx, w / 2 - 1, -h - 1, 1, 1, dark);                   // ear
  // legs flicker while running
  const f = Math.floor(m.legT) % 2;
  fillRect(ctx, -w / 2 + 1 + f, -1, 1, 1, dark);
  fillRect(ctx, w / 2 - 2 - f, -1, 1, 1, dark);
  ctx.restore();
}

/** Mice and rats for the building area you're in. */
function drawIndoorCritters(ctx, area, playerX, groundY) {
  const dt = _critterDt();
  if (!area._critters) area._critters = _spawnRodents(area);
  for (const m of area._critters) {
    _updateRodent(m, area, playerX, dt);
    _drawRodent(ctx, m, groundY);
  }
}

// ── Outdoors: crows ──────────────────────────────────────────────────────────

function _spawnGroundBirds(worldW) {
  const birds = [];
  const flocks = 2 + Math.floor(Math.random() * 4);
  for (let f = 0; f < flocks; f++) {
    const cx = 200 + Math.random() * (worldW - 400);
    const n = 1 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      birds.push({
        x: cx + (Math.random() - 0.5) * 50, y: 0, vx: 0, vy: 0,
        dir: Math.random() < 0.5 ? -1 : 1, state: 'ground',
        peckT: Math.random() * 3, hopT: 1 + Math.random() * 4, flapT: Math.random(), delay: 0,
      });
    }
  }
  return birds;
}

function _drawCrow(ctx, b, x, y) {
  const flying = b.state !== 'ground';
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(b.dir < 0 ? -1.5 : 1.5, 1.5);           // crow-sized next to a person
  const body = '#202026', beak = '#6a5838';
  if (!flying) {
    const peck = b.peckT < 0.25;                     // head dips to the ground
    fillRect(ctx, -4, -5, 7, 4, body);                // body
    fillRect(ctx, -6, -5, 2, 2, body);                // tail
    fillRect(ctx, peck ? 2 : 2, peck ? -3 : -7, 3, 3, body);   // head
    fillRect(ctx, peck ? 5 : 5, peck ? -2 : -6, 2, 1, beak);
    fillRect(ctx, -1, -1, 1, 1, '#2a2622'); fillRect(ctx, 1, -1, 1, 1, '#2a2622');  // legs
  } else {
    const up = Math.floor(b.flapT * 10) % 2 === 0;
    fillRect(ctx, -3, -2, 7, 3, body);
    fillRect(ctx, 4, -2, 2, 2, body); fillRect(ctx, 6, -1, 1, 1, beak);
    fillRect(ctx, -5, -1, 2, 1, body);
    if (up) { fillRect(ctx, -2, -6, 2, 4, body); fillRect(ctx, 0, -5, 2, 3, body); }
    else    { fillRect(ctx, -2, 1, 2, 4, body); fillRect(ctx, 0, 1, 2, 3, body); }
  }
  ctx.restore();
}

/** Crows on the ground (fly off when you get close) and flocks overhead. */
function drawOutdoorCritters(ctx, es, playerX, groundY, viewLeft, viewW, inCombat) {
  const dt = _critterDt();
  if (!es._birds) { es._birds = _spawnGroundBirds(CFG.WORLD_W); es._skyBirds = []; es._skyTimer = 8 + Math.random() * 20; }

  for (const b of es._birds) {
    if (b.state === 'gone') continue;
    if (b.state === 'ground') {
      b.peckT -= dt; if (b.peckT < 0) b.peckT = 0.8 + Math.random() * 2.5;
      b.hopT -= dt;
      if (b.hopT < 0) { b.x += b.dir * (2 + Math.random() * 4); if (Math.random() < 0.4) b.dir *= -1; b.hopT = 1 + Math.random() * 4; }
      // startled: you came close, or a fight broke out nearby
      if (Math.abs(playerX - b.x) < 95 || (inCombat && Math.abs(playerX - b.x) < 300)) {
        b.state = 'flee';
        b.delay = Math.random() * 0.25;              // the flock doesn't lift as one
        b.dir = b.x < playerX ? -1 : 1;
        b.vx = b.dir * (70 + Math.random() * 50);
        b.vy = -(60 + Math.random() * 40);
      }
    } else if (b.state === 'flee') {
      if (b.delay > 0) { b.delay -= dt; }
      else {
        b.flapT += dt;
        b.vy -= 40 * dt;                              // climbing
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.y < -groundY - 20) b.state = 'gone';
      }
    }
    if (b.x < viewLeft - 20 || b.x > viewLeft + viewW + 20) continue;
    _drawCrow(ctx, b, b.x, groundY + b.y);
  }

  // Now and then a flock crosses the sky
  es._skyTimer -= dt;
  if (es._skyTimer <= 0) {
    es._skyTimer = 20 + Math.random() * 40;
    const dir = Math.random() < 0.5 ? -1 : 1;
    const n = 2 + Math.floor(Math.random() * 4);
    const y0 = 60 + Math.random() * 80;
    const x0 = dir > 0 ? viewLeft - 30 : viewLeft + viewW + 30;
    for (let i = 0; i < n; i++) {
      es._skyBirds.push({ x: x0 - dir * i * 14, y: y0 + (i % 2) * 6 + i * 3, dir, vx: dir * (45 + Math.random() * 10), flapT: Math.random(), state: 'sky', life: 0 });
    }
  }
  for (const b of es._skyBirds) {
    b.flapT += dt; b.life += dt;
    b.x += b.vx * dt; b.y += Math.sin(b.life * 2 + b.x * 0.01) * 0.1;
    _drawCrow(ctx, b, b.x, b.y);
  }
  es._skyBirds = es._skyBirds.filter(b => b.life < 40 && b.x > viewLeft - 200 && b.x < viewLeft + viewW + 200);
}

// ── Paper scraps & litter (built-up areas) ───────────────────────────────────
// Litter that lies in the street and lifts into the air when a gust comes.
// Each kind has its own look and its own way of moving.
const LITTER_KINDS = {
  //            w  h  colours (main, detail)       lift  float  weight
  paper:     { w: 5, h: 3, col: ['#d6d0bc', '#9a9484'], lift: 1.0, float: 1.0, heavy: 0.0 },
  newspaper: { w: 7, h: 4, col: ['#b8b4a6', '#4a4842'], lift: 0.8, float: 0.9, heavy: 0.2 },
  receipt:   { w: 2, h: 5, col: ['#e4e0d4', '#a8a498'], lift: 1.2, float: 1.2, heavy: 0.0 },
  cardboard: { w: 6, h: 3, col: ['#8a6a44', '#5a4430'], lift: 0.45, float: 0.5, heavy: 0.6 },
  bag:       { w: 5, h: 4, col: ['#d8dcd8', '#a8b0b0'], lift: 1.3, float: 1.8, heavy: -0.4 },
  leaf:      { w: 3, h: 2, col: ['#7a5a2a', '#5a3e1c'], lift: 1.1, float: 1.1, heavy: 0.0 },
};
const LITTER_MIX = ['paper', 'paper', 'paper', 'newspaper', 'newspaper', 'receipt', 'cardboard', 'bag', 'leaf', 'leaf'];

function _spawnPapers(worldW) {
  const out = [];
  for (let i = 0; i < 30; i++) {
    const kind = LITTER_MIX[Math.floor(Math.random() * LITTER_MIX.length)];
    out.push({ kind, x: 60 + Math.random() * (worldW - 120), y: 0, vx: 0, vy: 0, state: 'rest',
               flip: Math.random() * 6, tint: 0.85 + Math.random() * 0.25 });
  }
  return out;
}

function _litterColour(hex, k) {
  const r = Math.min(255, Math.round(parseInt(hex.slice(1, 3), 16) * k));
  const g = Math.min(255, Math.round(parseInt(hex.slice(3, 5), 16) * k));
  const b = Math.min(255, Math.round(parseInt(hex.slice(5, 7), 16) * k));
  return `rgb(${r},${g},${b})`;
}

function drawPaperScraps(ctx, es, viewLeft, viewW, groundY) {
  if (!es._papers || !es._papers[0] || !es._papers[0].kind) es._papers = _spawnPapers(CFG.WORLD_W);
  if (!es._paperClock) es._paperClock = performance.now();
  const now = performance.now();
  const dt = Math.min(0.1, (now - es._paperClock) / 1000);
  es._paperClock = now;
  const { g } = windNow();
  for (const p of es._papers) {
    const K = LITTER_KINDS[p.kind];
    if (p.state === 'rest') {
      // heavier litter needs a stronger gust to move; when it does, it skids rather than flies
      const need = 0.45 + K.heavy * 0.4;
      if (g > need && Math.random() < dt * g * 0.6 * K.lift) {
        p.state = 'fly';
        p.vx = (30 + Math.random() * 45) * K.lift;
        p.vy = -(25 + Math.random() * 35) * K.lift * (K.heavy > 0.5 ? 0.25 : 1);
      }
    } else {
      p.flip += dt * (6 + g * 8) * (p.kind === 'bag' ? 0.4 : 1);
      p.vx += (g * 70 * K.float - p.vx) * dt * 0.8;
      p.vy += ((18 + K.heavy * 30) - g * 22 * K.float) * dt + Math.sin(p.flip * 1.7) * dt * 30 * K.float;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.y >= 0) {
        p.y = 0; p.vy = 0;
        if (g < 0.5 || Math.random() < 0.3 + K.heavy * 0.5) p.state = 'rest';
        else p.vy = -(15 + Math.random() * 20) * K.lift;
      }
      if (p.y < -170) p.vy = Math.abs(p.vy) * 0.3;
      if (p.x > CFG.WORLD_W - 20) p.x = 20;
    }
    if (p.x < viewLeft - 12 || p.x > viewLeft + viewW + 12) continue;
    const main = _litterColour(K.col[0], p.tint), det = _litterColour(K.col[1], p.tint);
    const x = Math.round(p.x), y = Math.round(groundY - 1 + p.y);
    const edge = p.state === 'fly' && p.kind !== 'bag' && Math.floor(p.flip) % 2;   // tumbling: flat, then edge-on
    ctx.fillStyle = main;
    if (edge) { ctx.fillRect(x, y - K.h, 1, K.h + 1); continue; }
    switch (p.kind) {
      case 'newspaper':
        ctx.fillRect(x - 3, y - 3, K.w, K.h);
        ctx.fillStyle = det;
        ctx.fillRect(x - 2, y - 2, 2, 1); ctx.fillRect(x + 1, y - 2, 2, 1); ctx.fillRect(x - 2, y, 5, 1);   // print
        break;
      case 'receipt':
        ctx.fillRect(x, y - 4, K.w, K.h); ctx.fillStyle = det; ctx.fillRect(x, y - 2, 1, 1);
        break;
      case 'cardboard':
        ctx.fillRect(x - 3, y - 2, K.w, K.h); ctx.fillStyle = det; ctx.fillRect(x - 3, y, K.w, 1); ctx.fillRect(x, y - 2, 1, 2);
        break;
      case 'bag': {
        const puff = p.state === 'fly' ? Math.round(Math.sin(p.flip * 3)) : 0;      // billows as it flies
        ctx.globalAlpha = 0.8;
        ctx.fillRect(x - 2, y - 3 - puff, K.w, K.h + puff); ctx.fillRect(x - 1, y - 4 - puff, 3, 1);
        ctx.fillStyle = det; ctx.fillRect(x - 2, y, 2, 1); ctx.fillRect(x + 2, y - 2 - puff, 1, 1);
        ctx.globalAlpha = 1;
        break;
      }
      case 'leaf':
        ctx.fillRect(x - 1, y - 1, 3, 2); ctx.fillStyle = det; ctx.fillRect(x + 2, y, 1, 1);
        break;
      default:   // a sheet of paper with a fold
        ctx.fillRect(x - 2, y - 2, K.w + 1, K.h); ctx.fillStyle = det; ctx.fillRect(x - 1, y, 4, 1); ctx.fillRect(x + 2, y - 2, 1, 1);
    }
  }
}
