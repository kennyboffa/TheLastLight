// lighting.js — Light and dark for exploration.
//
// Darkness is a layer with holes punched in it: a small circle of what you can
// make out around yourself, a real beam when your flashlight is on (pointing
// where you face), and warm pools around burning barrels and lamps, red ones
// around machines. Lights are then added back on top in colour, nights get a
// cold blue grade, and storms throw lightning.
'use strict';

const _fireT0 = Math.random() * 1000;

/** A rusted oil drum with a fire in it (somebody's warmth, somebody's camp). */
function drawFireBarrel(ctx, x, gy) {
  const t = performance.now() / 1000 + _fireT0;
  x = Math.round(x);
  // drum
  fillRect(ctx, x - 7, gy - 20, 14, 20, '#3a2a20');
  fillRect(ctx, x - 7, gy - 20, 3, 20, '#2a1e16');
  fillRect(ctx, x + 4, gy - 20, 3, 20, '#4a3424');
  fillRect(ctx, x - 7, gy - 14, 14, 2, '#24180f');
  fillRect(ctx, x - 7, gy - 6, 14, 2, '#24180f');
  fillRect(ctx, x - 2, gy - 11, 3, 3, '#5a3018');               // rust bloom
  fillRect(ctx, x - 8, gy - 21, 16, 2, '#1e1610');              // rim
  // glow on the rim and inside
  fillRect(ctx, x - 6, gy - 21, 12, 1, '#c86a20');
  // flames: a wide base that narrows and licks upward, hot core inside
  const h = 13 + Math.round(Math.sin(t * 7.3) * 2 + Math.sin(t * 13.1) * 1.5);
  const sway = (k) => Math.round(Math.sin(t * 6 + k * 0.45) * (k / h) * 2.5);
  for (let k = 0; k < h; k++) {
    const r = k / h;
    const w = Math.max(1, Math.round(13 * Math.pow(1 - r, 0.8) * (0.9 + 0.1 * Math.sin(t * 11 + k))));
    const cx = x + sway(k);
    ctx.fillStyle = r > 0.7 ? '#d8481a' : r > 0.4 ? '#ff7a22' : '#ff9c2a';
    ctx.fillRect(cx - Math.floor(w / 2), gy - 21 - k, w, 1);
    const wi = Math.round(w * 0.55);
    if (wi > 0 && r < 0.75) {
      ctx.fillStyle = r < 0.3 ? '#fff2b0' : '#ffd060';
      ctx.fillRect(cx - Math.floor(wi / 2), gy - 21 - k, wi, 1);
    }
  }
  // a stray tongue that breaks off now and then
  const tk = (t * 1.7) % 1;
  if (tk < 0.5) { ctx.fillStyle = '#ff8a2a'; ctx.globalAlpha = 1 - tk * 2; ctx.fillRect(x + sway(h) - 1, gy - 23 - h - Math.round(tk * 8), 2, 2); ctx.globalAlpha = 1; }
  // smoke
  for (let i = 0; i < 3; i++) {
    const life = (t * 0.25 + i / 3) % 1;
    ctx.globalAlpha = 0.18 * (1 - life);
    ctx.fillStyle = '#6a6a6a';
    const sx = x + Math.sin(t * 0.8 + i * 2) * 3 + life * 10, sy = gy - 36 - life * 46, sz = 3 + Math.round(life * 6);
    ctx.fillRect(Math.round(sx - sz / 2), Math.round(sy), sz, sz);
  }
  ctx.globalAlpha = 1;
  // embers drifting up
  for (let i = 0; i < 4; i++) {
    const life = (t * 0.6 + i * 0.25) % 1;
    const ex = x + Math.sin(t * 2 + i * 3) * 4 + (i - 1.5) * 2;
    const ey = gy - 26 - life * 30;
    ctx.globalAlpha = 1 - life;
    ctx.fillStyle = life < 0.5 ? '#ffc040' : '#ff7020';
    ctx.fillRect(Math.round(ex), Math.round(ey), 1, 1);
  }
  ctx.globalAlpha = 1;
}

/** Flicker of a fire, 0.8..1.05, stable per light. */
function _flicker(seed) {
  const t = performance.now() / 1000;
  return 0.88 + 0.08 * Math.sin(t * 9 + seed) + 0.05 * Math.sin(t * 23 + seed * 1.7);
}

/**
 * Darkness, light and colour over the explored scene (screen space, drawn at 1x).
 * o: { px, py: player screen pos; facing; indoor; vz; lights: [{x,y,r,kind:'fire'|'lamp'|'red'}] }
 */
function renderLighting(ctx, gs, o) {
  if (!fogCanvas) initFogCanvas();
  const fc = fogCanvas.getContext('2d');
  const df = dayFactor(gs.time), nf = nightFactor(gs.time);
  const indoor = o.indoor, vz = o.vz || 1;
  const lightOn = !!gs.parent.lightOn;
  // what you can make out around yourself
  const baseOut = CFG.FOG_RADIUS_OUT + Math.round(130 * df), baseIn = CFG.FOG_RADIUS_IN + Math.round(60 * df);
  let radius = indoor ? baseIn - Math.round(80 * nf) : baseOut - Math.round(120 * nf);
  if (lightOn) radius += indoor ? 30 : 20;
  const dark = indoor ? 0.84 - 0.42 * df : 0.84 - 0.74 * df;

  fc.clearRect(0, 0, CFG.W, CFG.H);
  fc.globalCompositeOperation = 'source-over';
  fc.fillStyle = `rgba(0,0,0,${dark.toFixed(3)})`;
  fc.fillRect(0, 0, CFG.W, CFG.H);
  fc.globalCompositeOperation = 'destination-out';
  const hole = (x, y, r, inner, strength) => {
    const g = fc.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(0,0,0,${strength})`);
    g.addColorStop(inner, `rgba(0,0,0,${strength})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    fc.fillStyle = g;
    fc.fillRect(x - r, y - r, r * 2, r * 2);
  };
  hole(o.px, o.py, radius, 0.55, 1);
  // flashlight beam: a wedge from your chest in the direction you face
  const chestY = o.py - 22 * vz, f = o.facing || 1;
  const beamL = (indoor ? 250 : 180 + 140 * nf) * vz;
  const beam = (target, alphaStops, spread) => {
    spread = spread || 1;
    const g = target.createRadialGradient(o.px, chestY, 6, o.px, chestY, beamL);
    for (const [k, a] of alphaStops) g.addColorStop(k, a);
    target.fillStyle = g;
    target.beginPath();
    target.moveTo(o.px + f * 6 * vz, chestY - 2);
    target.lineTo(o.px + f * beamL, chestY - beamL * 0.28 * spread);
    target.lineTo(o.px + f * beamL, chestY + beamL * 0.4 * spread);
    target.lineTo(o.px + f * 6 * vz, chestY + 3);
    target.closePath(); target.fill();
  };
  if (lightOn) {
    // soft edges: a wide faint wedge under a narrower strong one
    beam(fc, [[0, 'rgba(0,0,0,0.55)'], [0.6, 'rgba(0,0,0,0.35)'], [1, 'rgba(0,0,0,0)']], 1.35);
    beam(fc, [[0, 'rgba(0,0,0,1)'], [0.65, 'rgba(0,0,0,0.8)'], [1, 'rgba(0,0,0,0)']], 0.8);
  }
  // lights in the world
  for (const L of o.lights || []) {
    const fl = L.kind === 'fire' ? _flicker(L.x * 0.37) : 1;
    hole(L.x, L.y, L.r * fl, L.kind === 'red' ? 0.2 : 0.3, L.kind === 'red' ? 0.55 : 0.95);
  }
  fc.globalCompositeOperation = 'source-over';
  ctx.drawImage(fogCanvas, 0, 0);

  // ── colour ─────────────────────────────────────────────────────────────
  const amb = Math.max(nf, indoor ? 0.6 : 0);          // how much the lights show
  ctx.save();
  if (!indoor && nf > 0) {
    // cold moonlight grade over the whole frame
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.6 * nf;
    ctx.fillStyle = '#6a78b0';
    ctx.fillRect(0, 0, CFG.W, CFG.H);
  }
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 1;
  for (const L of o.lights || []) {
    const fl = L.kind === 'fire' ? _flicker(L.x * 0.37) : 1;
    const r = L.r * fl;
    const col = L.kind === 'red' ? '255,40,30' : L.kind === 'lamp' ? '255,200,120' : '255,130,40';
    const a = (L.kind === 'red' ? 0.22 : 0.2) * (0.35 + 0.65 * amb) * fl;
    const g = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, r);
    g.addColorStop(0, `rgba(${col},${a.toFixed(3)})`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(L.x - r, L.y - r, r * 2, r * 2);
  }
  if (lightOn) {
    const a = 0.05 + 0.08 * amb;
    beam(ctx, [[0, `rgba(255,244,214,${(a * 0.5).toFixed(3)})`], [1, 'rgba(255,240,200,0)']], 1.3);
    beam(ctx, [[0, `rgba(255,244,214,${a})`], [0.6, `rgba(255,240,200,${(a * 0.5).toFixed(3)})`], [1, 'rgba(255,240,200,0)']], 0.8);
    // dust hanging in the beam
    const t = performance.now() / 1000;
    ctx.fillStyle = 'rgba(255,246,220,0.55)';
    for (let i = 0; i < 18; i++) {
      const k = ((i * 0.618 + t * 0.03 * (1 + (i % 3))) % 1);
      const dx = k * beamL * 0.9 + 10;
      const spread = dx * 0.34;
      const dy = Math.sin(i * 12.9 + t * 0.6) * spread + spread * 0.1;
      ctx.globalAlpha = (1 - k) * 0.5 * (0.5 + 0.5 * Math.sin(t * 2 + i));
      ctx.fillRect(Math.round(o.px + f * dx), Math.round(chestY + dy), 1, 1);
    }
  }
  ctx.restore();
}

// ── Lightning ────────────────────────────────────────────────────────────────

const _storm = { next: 0, t0: 0 };
/** Some rainy days are storms. */
function isStorm(gs) { return gs.weather && gs.weather.type === 'rain' && ((gs.day * 7 + 3) % 5) < 2; }

/** Flash the sky now and then in a storm (screen space, after everything). */
function drawLightning(ctx, gs, skyBottom) {
  if (!isStorm(gs)) return;
  const now = performance.now();
  if (!_storm.next) _storm.next = now + 4000 + Math.random() * 8000;
  if (now >= _storm.next) {
    _storm.t0 = now;
    _storm.next = now + 7000 + Math.random() * 14000;
    _storm.bolt = 80 + Math.random() * (CFG.W - 160);
    if (typeof Audio !== 'undefined' && Audio.thud) {
      setTimeout(() => Audio.thud(), 500 + Math.random() * 900);
      setTimeout(() => Audio.thud(), 1100 + Math.random() * 900);
    }
  }
  const k = (now - _storm.t0) / 420;
  if (k < 0 || k > 1) return;
  // two quick pulses
  const a = (k < 0.25 ? 1 - k * 4 * 0.6 : k < 0.4 ? 0.3 : 0.75 * (1 - k)) * 0.5;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(200,215,255,${a.toFixed(3)})`;
  ctx.fillRect(0, 0, CFG.W, CFG.H);
  // the bolt itself, far away over the skyline
  if (k < 0.3) {
    ctx.strokeStyle = `rgba(240,245,255,${(0.9 - k * 2).toFixed(2)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let x = _storm.bolt, y = 0;
    ctx.moveTo(x, y);
    let seed = _storm.t0;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    while (y < (skyBottom || CFG.H * 0.45)) { x += (rnd() - 0.5) * 22; y += 8 + rnd() * 14; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  ctx.restore();
}
