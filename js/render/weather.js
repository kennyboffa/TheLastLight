// weather.js — Rain you can see: two layers of slanted streaks with splashes
// where they land, and the shelter's camouflaged rain catcher with water
// running down into the bunker while it rains.
'use strict';

function _hash01(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Rain over a region of the screen. x0..x0+w wide, falling from topY to
 * groundY, with splashes on the ground line. `density` scales the drop count.
 */
function drawRain(ctx, x0, w, topY, groundY, density) {
  const t = performance.now() / 1000;
  const H = groundY - topY;
  const wind = 0.28;                       // sideways drift per unit of fall
  density = density || 1;
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, topY, w, H + 2); ctx.clip();
  const layer = (count, speed, len, alpha, color, seedBase) => {
    ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const r1 = _hash01(seedBase + i), r2 = _hash01(seedBase + i * 7.3);
      const sp = speed * (0.85 + 0.3 * r2);
      const fall = (r2 * H + t * sp) % (H + len);
      const y = topY + fall - len;
      const x = x0 + ((r1 * w + fall * wind) % w);
      ctx.moveTo(Math.round(x), Math.round(y));
      ctx.lineTo(Math.round(x + len * wind), Math.round(y + len));
    }
    ctx.stroke();
  };
  layer(Math.round(w * 0.22 * density), 330, 6, 0.22, '#7f93a8', 1);     // far, fine drizzle
  layer(Math.round(w * 0.09 * density), 560, 13, 0.5, '#a6b8c8', 500);   // near, heavier drops
  // splashes: little crowns that flash where drops hit the ground
  ctx.globalAlpha = 0.55; ctx.fillStyle = '#b8c8d6';
  const bucket = Math.floor(t * 9);
  const n = Math.round(w * 0.05 * density);
  for (let i = 0; i < n; i++) {
    const r = _hash01(bucket * 31 + i * 3.7);
    if (r > 0.6) continue;
    const x = Math.round(x0 + _hash01(bucket * 17 + i) * w);
    ctx.fillRect(x - 1, groundY - 2, 1, 1); ctx.fillRect(x + 1, groundY - 2, 1, 1); ctx.fillRect(x, groundY - 1, 1, 1);
  }
  // wet sheen along the ground
  ctx.globalAlpha = 0.12; ctx.fillStyle = '#5a7a9a';
  ctx.fillRect(x0, groundY, w, 3);
  ctx.restore();
}

// ── Shelter rain catcher ─────────────────────────────────────────────────────

// Where the catcher sits on the surface (shelter world coords) and where its
// pipe comes down: over the water jug in the main room.
const RAINCATCHER = { cx: 60, pipeX: 38 };

/** The disguised catcher on the surface (drawn with the surface scene). */
function drawRaincatcherSurface(ctx, gs) {
  if (!gs.shelter.hasRaincatcher) return;
  const gy = CFG.SURFACE_H - 2;
  drawEnvSprite(ctx, 'surf_raincatcher', RAINCATCHER.cx, gy);
  if (gs.weather && gs.weather.type === 'rain') {
    // a thin film of water sliding down the sheet into the gutter
    const t = performance.now() / 1000;
    ctx.save();
    ctx.fillStyle = '#9ab4cc';
    const x0 = RAINCATCHER.cx - 32;                    // sprite left edge
    for (let i = 0; i < 6; i++) {
      const k = ((t * 0.9 + i / 6) % 1);                 // 0 = top right, 1 = gutter
      const sx = x0 + 60 - k * 47, sy = gy - 36 + 6 + k * 12;
      ctx.globalAlpha = 0.65;
      ctx.fillRect(Math.round(sx), Math.round(sy), 2, 1);
    }
    ctx.globalAlpha = 0.25;
    ctx.fillRect(x0 + 13, gy - 36 + 7, 47, 1);           // sheen on the sheet
    ctx.restore();
  }
}

/** The pipe through the earth into the main room, dripping into the jug while it rains. */
function drawRaincatcherPipe(ctx, gs) {
  if (!gs.shelter.hasRaincatcher) return;
  const main = roomRect(0, 0);
  const x = RAINCATCHER.pipeX;
  const top = CFG.SURFACE_H - 1, inRoom = main.y + 2, end = main.y + main.h - 34;
  // through the earth: an old cable conduit, so it doesn't look like plumbing from above
  fillRect(ctx, x, top, 4, inRoom - top, '#2e2c28');
  fillRect(ctx, x + 1, top, 1, inRoom - top, '#4a4640');
  // inside: bracketed to the wall, ending above the water jug
  fillRect(ctx, x, inRoom, 4, end - inRoom, '#3a3a36');
  fillRect(ctx, x + 1, inRoom, 1, end - inRoom, '#5a5a54');
  for (let y = inRoom + 8; y < end - 4; y += 14) fillRect(ctx, x - 1, y, 6, 2, '#24221e');
  fillRect(ctx, x - 1, end, 6, 2, '#24221e');            // spout
  if (gs.weather && gs.weather.type === 'rain') {
    const t = performance.now() / 1000;
    const k = (t * 1.6) % 1;
    ctx.save();
    ctx.fillStyle = '#8ab0d0';
    ctx.globalAlpha = 0.85;
    ctx.fillRect(x + 1, Math.round(end + 2 + k * 12), 2, 2);   // drip into the jug
    if (k > 0.85) { ctx.globalAlpha = 0.5; ctx.fillRect(x - 1, end + 15, 6, 1); }   // ripple
    ctx.restore();
  }
}
