// sprites.js — Pixel art character and environment drawing
'use strict';

// ── Character sprites ─────────────────────────────────────────────────────────
// All sprites drawn at "natural" 1px = 1 logical px scale.
// Caller passes ctx with appropriate transform/scale.

function drawParent(ctx, x, y, s, facing, animFrame, gender, pose) {
  // s = scale factor (e.g. 2 for shelter view)
  // facing: 1=right, -1=left
  // pose: 'front'(default) | 'side' | 'back' | 'sleep'
  pose = pose || 'front';
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (facing < 0) { ctx.scale(-1, 1); }

  const sk      = gender === 'mother' ? '#c49878' : C.skin;
  const clothes = gender === 'mother' ? '#3a3a50' : '#2e3828';
  const hair    = C.hair;
  const pants   = gender === 'mother' ? '#1e1e30' : '#1e2218';
  const legSwing = (animFrame % 2 === 0) ? 0 : 1;

  if (pose === 'front') {
    // Head
    fillRect(ctx, -4*s, -18*s, 8*s, 8*s, sk);
    fillRect(ctx, -4*s, -18*s, 8*s, 2*s, hair);
    fillRect(ctx, -2*s, -14*s, 1*s, 1*s, '#111');
    fillRect(ctx,  1*s, -14*s, 1*s, 1*s, '#111');
    // Neck + torso + arms
    fillRect(ctx, -1*s, -10*s, 2*s, 2*s, sk);
    fillRect(ctx, -4*s,  -8*s, 8*s, 7*s, clothes);
    fillRect(ctx, -6*s,  -8*s, 2*s, 5*s, clothes);
    fillRect(ctx,  4*s,  -8*s, 2*s, 5*s, clothes);
    fillRect(ctx, -6*s,  -3*s, 2*s, 2*s, sk);
    fillRect(ctx,  4*s,  -3*s, 2*s, 2*s, sk);
    // Legs + feet
    fillRect(ctx, -4*s, -1*s, 3*s, 6*s + legSwing*s, pants);
    fillRect(ctx,  1*s, -1*s, 3*s, 6*s - legSwing*s, pants);
    fillRect(ctx, -4*s,  5*s + legSwing*s, 3*s, 2*s, '#222');
    fillRect(ctx,  1*s,  5*s - legSwing*s, 3*s, 2*s, '#222');

  } else if (pose === 'side') {
    // Side profile (facing direction = front of profile)
    fillRect(ctx, -1*s, -18*s, 6*s, 7*s, sk);
    fillRect(ctx, -1*s, -18*s, 6*s, 3*s, hair);
    fillRect(ctx,  3*s, -13*s, 1*s, 1*s, '#111'); // eye
    fillRect(ctx, -1*s, -11*s, 2*s, 2*s, sk); // neck
    fillRect(ctx, -2*s,  -9*s, 5*s, 7*s, clothes); // torso
    // Front arm (swings with stride)
    fillRect(ctx,  2*s,  -9*s + legSwing*s, 2*s, 5*s, clothes);
    fillRect(ctx,  2*s,  -4*s + legSwing*s, 2*s, 2*s, sk);
    // Back arm (counter-swing, darker)
    fillRect(ctx, -4*s,  -9*s - legSwing*s, 2*s, 4*s, '#1e2a1e');
    // Front leg
    fillRect(ctx,  0,    -2*s, 3*s, 5*s + legSwing*s, pants);
    fillRect(ctx,  0,     3*s + legSwing*s, 4*s, 2*s, '#222');
    // Back leg (darker)
    fillRect(ctx, -2*s,  -2*s, 3*s, 5*s - legSwing*s, '#181820');
    fillRect(ctx, -2*s,   3*s - legSwing*s, 3*s, 2*s, '#1a1a1a');

  } else if (pose === 'back') {
    // Back view — hair covers head, no eyes
    fillRect(ctx, -4*s, -18*s, 8*s, 8*s, hair);
    fillRect(ctx, -1*s, -10*s, 2*s, 2*s, sk); // neck
    fillRect(ctx, -4*s,  -8*s, 8*s, 7*s, clothes);
    fillRect(ctx, -6*s,  -8*s, 2*s, 5*s, clothes);
    fillRect(ctx,  4*s,  -8*s, 2*s, 5*s, clothes);
    fillRect(ctx, -6*s,  -3*s, 2*s, 2*s, sk);
    fillRect(ctx,  4*s,  -3*s, 2*s, 2*s, sk);
    fillRect(ctx, -4*s, -1*s, 3*s, 6*s + legSwing*s, pants);
    fillRect(ctx,  1*s, -1*s, 3*s, 6*s - legSwing*s, pants);
    fillRect(ctx, -4*s,  5*s + legSwing*s, 3*s, 2*s, '#1a1a1a');
    fillRect(ctx,  1*s,  5*s - legSwing*s, 3*s, 2*s, '#1a1a1a');

  } else if (pose === 'sleep') {
    // Lying horizontal — head at +x end (facing direction), body to left
    fillRect(ctx,  3*s, -8*s, 10*s, 5*s, '#3a2e48'); // pillow
    fillRect(ctx,  5*s, -7*s,  7*s, 3*s, '#504060'); // pillow highlight
    fillRect(ctx, -9*s, -6*s, 18*s, 5*s, '#2a1e38'); // blanket
    fillRect(ctx, -8*s, -5*s, 12*s, 3*s, clothes);   // body lump
    fillRect(ctx,  5*s,-12*s,  7*s, 7*s, sk);         // head
    fillRect(ctx,  5*s,-12*s,  7*s, 3*s, hair);       // hair
    fillRect(ctx,  7*s, -8*s,  2*s, 1*s, '#333');     // closed eye
  }

  ctx.restore();
}

function drawChild(ctx, x, y, s, facing, animFrame, pose) {
  pose = pose || 'front';
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (facing < 0) { ctx.scale(-1, 1); }

  const sk   = '#d4a070';
  const dress = '#3a2a40';
  const hair  = '#301808';
  const leg   = (animFrame % 2 === 0) ? 0 : 1;

  if (pose === 'front') {
    fillRect(ctx, -3*s, -14*s, 7*s, 7*s, sk);
    fillRect(ctx, -3*s, -14*s, 7*s, 2*s, hair);
    fillRect(ctx,  3*s, -13*s, 1*s, 4*s, hair);
    fillRect(ctx, -1*s, -10*s, 1*s, 1*s, '#181830');
    fillRect(ctx,  2*s, -10*s, 1*s, 1*s, '#181830');
    fillRect(ctx,  0,    -7*s, 2*s, 2*s, sk);
    fillRect(ctx, -3*s,  -5*s, 7*s, 5*s, dress);
    fillRect(ctx, -5*s,  -5*s, 2*s, 4*s, sk);
    fillRect(ctx,  3*s,  -5*s, 2*s, 4*s, sk);
    fillRect(ctx, -3*s,   0,   3*s, 5*s + leg*s, '#2a1a2e');
    fillRect(ctx,  1*s,   0,   3*s, 5*s - leg*s, '#2a1a2e');
    fillRect(ctx, -3*s,  5*s + leg*s, 3*s, 2*s, '#201020');
    fillRect(ctx,  1*s,  5*s - leg*s, 3*s, 2*s, '#201020');

  } else if (pose === 'side') {
    fillRect(ctx, -1*s, -14*s, 5*s, 6*s, sk);
    fillRect(ctx, -1*s, -14*s, 5*s, 2*s, hair);
    fillRect(ctx,  2*s, -11*s, 1*s, 1*s, '#181830');
    fillRect(ctx,  0,    -8*s, 2*s, 2*s, sk);
    fillRect(ctx, -2*s,  -6*s, 4*s, 5*s, dress);
    fillRect(ctx,  1*s,  -6*s + leg*s, 2*s, 3*s, sk);
    fillRect(ctx, -3*s,  -6*s - leg*s, 2*s, 3*s, '#28203a');
    fillRect(ctx,  0,     0,   2*s, 4*s + leg*s, '#2a1a2e');
    fillRect(ctx,  0,    4*s + leg*s, 3*s, 2*s, '#201020');
    fillRect(ctx, -1*s,   0,   2*s, 4*s - leg*s, '#1e1028');
    fillRect(ctx, -1*s,  4*s - leg*s, 2*s, 2*s, '#181018');

  } else if (pose === 'back') {
    fillRect(ctx, -3*s, -14*s, 7*s, 7*s, hair);
    fillRect(ctx,  0,    -7*s, 2*s, 2*s, sk);
    fillRect(ctx, -3*s,  -5*s, 7*s, 5*s, dress);
    fillRect(ctx, -5*s,  -5*s, 2*s, 4*s, sk);
    fillRect(ctx,  3*s,  -5*s, 2*s, 4*s, sk);
    fillRect(ctx, -3*s,   0,   3*s, 5*s + leg*s, '#2a1a2e');
    fillRect(ctx,  1*s,   0,   3*s, 5*s - leg*s, '#2a1a2e');
    fillRect(ctx, -3*s,  5*s + leg*s, 3*s, 2*s, '#181018');
    fillRect(ctx,  1*s,  5*s - leg*s, 3*s, 2*s, '#181018');

  } else if (pose === 'sleep') {
    fillRect(ctx,  2*s,  -7*s, 8*s, 4*s, '#3a2e48'); // pillow
    fillRect(ctx, -7*s,  -5*s, 14*s, 4*s, '#2a1e38'); // blanket
    fillRect(ctx, -6*s,  -4*s,  9*s, 2*s, dress);
    fillRect(ctx,  4*s, -10*s,  6*s, 6*s, sk);
    fillRect(ctx,  4*s, -10*s,  6*s, 2*s, hair);
    fillRect(ctx,  6*s,  -7*s,  2*s, 1*s, '#333');
  }

  ctx.restore();
}

function drawSurvivor(ctx, x, y, s, facing, animFrame, idx, pose) {
  pose = pose || 'front';
  const clothColors = ['#2a3828','#282a38','#382820','#283030'];
  const hairColors  = ['#201808','#101020','#301810','#102018'];
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (facing < 0) { ctx.scale(-1, 1); }

  const sk  = C.skin;
  const cl  = clothColors[idx % clothColors.length];
  const hr  = hairColors[idx % hairColors.length];
  const leg = (animFrame % 2 === 0) ? 0 : 1;

  if (pose === 'front') {
    fillRect(ctx, -4*s, -18*s, 8*s, 8*s, sk);
    fillRect(ctx, -4*s, -18*s, 8*s, 2*s, hr);
    fillRect(ctx, -2*s, -14*s, 1*s, 1*s, '#111');
    fillRect(ctx,  1*s, -14*s, 1*s, 1*s, '#111');
    fillRect(ctx, -1*s, -10*s, 2*s, 2*s, sk);
    fillRect(ctx, -4*s,  -8*s, 8*s, 7*s, cl);
    fillRect(ctx, -6*s,  -8*s, 2*s, 5*s, cl);
    fillRect(ctx,  4*s,  -8*s, 2*s, 5*s, cl);
    fillRect(ctx, -4*s, -1*s, 3*s, 6*s + leg*s, '#222');
    fillRect(ctx,  1*s, -1*s, 3*s, 6*s - leg*s, '#222');
    fillRect(ctx, -4*s,  5*s + leg*s, 3*s, 2*s, '#1a1a1a');
    fillRect(ctx,  1*s,  5*s - leg*s, 3*s, 2*s, '#1a1a1a');

  } else if (pose === 'side') {
    fillRect(ctx, -1*s, -18*s, 6*s, 7*s, sk);
    fillRect(ctx, -1*s, -18*s, 6*s, 3*s, hr);
    fillRect(ctx,  3*s, -13*s, 1*s, 1*s, '#111');
    fillRect(ctx, -1*s, -11*s, 2*s, 2*s, sk);
    fillRect(ctx, -2*s,  -9*s, 5*s, 7*s, cl);
    fillRect(ctx,  2*s,  -9*s + leg*s, 2*s, 5*s, cl);
    fillRect(ctx,  2*s,  -4*s + leg*s, 2*s, 2*s, sk);
    fillRect(ctx, -4*s,  -9*s - leg*s, 2*s, 4*s, '#1e2220');
    fillRect(ctx,  0,    -2*s, 3*s, 5*s + leg*s, '#222');
    fillRect(ctx,  0,     3*s + leg*s, 4*s, 2*s, '#1a1a1a');
    fillRect(ctx, -2*s,  -2*s, 3*s, 5*s - leg*s, '#181818');
    fillRect(ctx, -2*s,   3*s - leg*s, 3*s, 2*s, '#141414');

  } else if (pose === 'back') {
    fillRect(ctx, -4*s, -18*s, 8*s, 8*s, hr);
    fillRect(ctx, -1*s, -10*s, 2*s, 2*s, sk);
    fillRect(ctx, -4*s,  -8*s, 8*s, 7*s, cl);
    fillRect(ctx, -6*s,  -8*s, 2*s, 5*s, cl);
    fillRect(ctx,  4*s,  -8*s, 2*s, 5*s, cl);
    fillRect(ctx, -4*s, -1*s, 3*s, 6*s + leg*s, '#222');
    fillRect(ctx,  1*s, -1*s, 3*s, 6*s - leg*s, '#222');
    fillRect(ctx, -4*s,  5*s + leg*s, 3*s, 2*s, '#141414');
    fillRect(ctx,  1*s,  5*s - leg*s, 3*s, 2*s, '#141414');

  } else if (pose === 'sleep') {
    fillRect(ctx,  3*s,  -8*s, 10*s, 5*s, '#3a2e48');
    fillRect(ctx,  5*s,  -7*s,  7*s, 3*s, '#504060');
    fillRect(ctx, -9*s,  -6*s, 18*s, 5*s, '#201830');
    fillRect(ctx, -8*s,  -5*s, 12*s, 3*s, cl);
    fillRect(ctx,  5*s, -12*s,  7*s, 7*s, sk);
    fillRect(ctx,  5*s, -12*s,  7*s, 3*s, hr);
    fillRect(ctx,  7*s,  -8*s,  2*s, 1*s, '#333');
  }

  ctx.restore();
}

function drawDog(ctx, x, y, s, facing, animFrame) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (facing < 0) { ctx.scale(-1, 1); }

  const fur = '#6b4a2a';
  const dark = '#3a2810';
  const leg = (animFrame % 2 === 0) ? 0 : 1;

  // Body
  fillRect(ctx, -6*s, -6*s, 12*s, 5*s, fur);
  // Head
  fillRect(ctx,  4*s, -9*s, 5*s, 5*s, fur);
  // Snout
  fillRect(ctx,  8*s, -7*s, 3*s, 2*s, dark);
  // Ears
  fillRect(ctx,  4*s, -11*s, 2*s, 3*s, dark);
  // Tail
  fillRect(ctx, -8*s, -8*s, 2*s, 4*s, fur);
  // Legs (4)
  fillRect(ctx, -4*s, -1*s, 2*s, 3*s + leg*s, dark);
  fillRect(ctx, -1*s, -1*s, 2*s, 3*s - leg*s, dark);
  fillRect(ctx,  2*s, -1*s, 2*s, 3*s + leg*s, dark);
  fillRect(ctx,  5*s, -1*s, 2*s, 3*s - leg*s, dark);
  ctx.restore();
}

// ── Enemy sprites ─────────────────────────────────────────────────────────────

function drawDroneSprite(ctx, x, y, s, animFrame) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));

  const body = '#2a2e36';
  const glow = '#60a0cc';
  const dark = '#181c22';
  // Hover animation
  const hover = Math.sin(animFrame * 0.15) * 2 * s;

  ctx.translate(0, hover);
  // Main body (hexagonal-ish)
  fillRect(ctx, -6*s, -4*s, 12*s, 8*s, body);
  fillRect(ctx, -4*s, -6*s, 8*s, 12*s, body);
  // Eye / sensor (glowing)
  fillRect(ctx, -2*s, -2*s, 4*s, 4*s, glow, 0.9);
  fillRect(ctx,  0,   -1*s, 2*s, 2*s, '#c0e0ff', 0.8);
  // Rotors
  fillRect(ctx, -12*s, -2*s, 4*s, 1*s, dark);
  fillRect(ctx,  8*s, -2*s, 4*s, 1*s, dark);
  fillRect(ctx, -2*s, -10*s, 1*s, 4*s, dark);
  fillRect(ctx,  1*s, -10*s, 1*s, 4*s, dark);
  ctx.restore();
}

function drawRobotSprite(ctx, x, y, s, facing) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (facing < 0) ctx.scale(-1, 1);

  const body = '#303840';
  const head = '#252c34';
  const eye  = '#cc2020';
  const leg  = '#202830';

  // Head
  fillRect(ctx, -5*s, -24*s, 10*s, 8*s, head);
  fillRect(ctx, -3*s, -21*s, 5*s, 3*s, eye, 0.9);
  // Torso
  fillRect(ctx, -6*s, -16*s, 12*s, 10*s, body);
  // Arms
  fillRect(ctx, -9*s, -15*s, 3*s, 8*s, body);
  fillRect(ctx,  6*s, -15*s, 3*s, 8*s, body);
  // Lower body
  fillRect(ctx, -5*s, -6*s, 10*s, 4*s, body);
  // Legs
  fillRect(ctx, -5*s, -2*s, 4*s, 8*s, leg);
  fillRect(ctx,  1*s, -2*s, 4*s, 8*s, leg);
  // Feet
  fillRect(ctx, -6*s, 6*s, 5*s, 2*s, leg);
  fillRect(ctx,  1*s, 6*s, 5*s, 2*s, leg);
  ctx.restore();
}

function drawHumanEnemy(ctx, x, y, s, facing, animFrame) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (facing < 0) ctx.scale(-1, 1);

  const sk  = '#a07040';
  const cl  = '#3a2020';
  const leg = (animFrame % 2 === 0) ? 0 : 1;

  fillRect(ctx, -4*s, -18*s, 8*s, 8*s, sk);
  fillRect(ctx, -4*s, -18*s, 8*s, 2*s, '#1a1008');
  // Angry eyes
  fillRect(ctx, -2*s, -13*s, 2*s, 1*s, '#1a0808');
  fillRect(ctx,  1*s, -13*s, 2*s, 1*s, '#1a0808');
  fillRect(ctx, -4*s,  -8*s, 8*s, 7*s, cl);
  fillRect(ctx, -6*s,  -8*s, 2*s, 5*s, cl);
  fillRect(ctx,  4*s,  -8*s, 2*s, 5*s, cl);
  fillRect(ctx, -4*s,  -1*s, 3*s, 6*s + leg*s, '#201818');
  fillRect(ctx,  1*s,  -1*s, 3*s, 6*s - leg*s, '#201818');
  fillRect(ctx, -4*s,   5*s + leg*s, 3*s, 2*s, '#161010');
  fillRect(ctx,  1*s,   5*s - leg*s, 3*s, 2*s, '#161010');
  // Weapon hint
  fillRect(ctx,  4*s,  -6*s, 4*s, 1*s, '#4a4a3a');
  ctx.restore();
}

function drawWolfSprite(ctx, x, y, s, facing, animFrame) {
  drawDog(ctx, x, y, s, facing, animFrame); // reuse dog, slightly different call
}

// ── Environment / shelter tiles ───────────────────────────────────────────────

function drawRoomInterior(ctx, x, y, w, h, unlocked, selected) {
  const bg = unlocked ? C.floor : C.bg;
  const wall = unlocked ? C.wallLight : C.border;

  // Floor
  fillRect(ctx, x, y, w, h, bg);

  // Wall details (brick-like pattern)
  if (unlocked) {
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#ffffff';
    for (let gy = 0; gy < h; gy += 8) {
      const offset = (Math.floor(gy / 8) % 2) * 12;
      for (let gx = offset; gx < w; gx += 24) {
        ctx.fillRect(Math.round(x + gx), Math.round(y + gy), 22, 7);
      }
    }
    ctx.globalAlpha = 1;
  }

  // Border
  const borderColor = selected ? '#6a8a6a' : (unlocked ? C.border2 : C.border);
  strokeRect(ctx, x, y, w, h, borderColor, selected ? 2 : 1);

  // Top highlight line
  if (unlocked) {
    ctx.strokeStyle = C.wallLight;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(x)+1, Math.round(y)+1);
    ctx.lineTo(Math.round(x+w)-1, Math.round(y)+1);
    ctx.stroke();
  }
}

// ── Day / Night cycle helpers ─────────────────────────────────────────────────

function _lerpHex(a, b, t) {
  const p = s => [parseInt(s.slice(1,3),16), parseInt(s.slice(3,5),16), parseInt(s.slice(5,7),16)];
  const [ar,ag,ab] = p(a), [br,bg,bb] = p(b);
  return `rgb(${Math.round(ar+(br-ar)*t)},${Math.round(ag+(bg-ag)*t)},${Math.round(ab+(bb-ab)*t)})`;
}

// Key frames mapped to 24h clock: t = game_minutes / 1440
// [t,  skyTop,    skyBottom]
const _SKY_KF = [
  [0.00, '#050408', '#080810'],  // 00:00 midnight — near black
  [0.17, '#0a0614', '#0d0820'],  // 04:00 deep night
  [0.25, '#1e0c28', '#2c1238'],  // 06:00 dawn — dark purple
  [0.33, '#2a1830', '#1a2040'],  // 08:00 morning — purple-blue
  [0.50, '#182838', '#1e3450'],  // 12:00 noon — overcast blue-grey
  [0.67, '#1a2030', '#1c2840'],  // 16:00 afternoon
  [0.75, '#28101c', '#3a1428'],  // 18:00 dusk — warm purple
  [0.88, '#0e060e', '#140810'],  // 21:00 evening
  [1.00, '#050408', '#080810'],  // 24:00 midnight
];

function _getSkyColors(t) {
  for (let i = 1; i < _SKY_KF.length; i++) {
    if (t <= _SKY_KF[i][0]) {
      const [pt, pa, pb] = _SKY_KF[i-1], [nt, na, nb] = _SKY_KF[i];
      const f = (t - pt) / (nt - pt);
      return [_lerpHex(pa, na, f), _lerpHex(pb, nb, f)];
    }
  }
  return [_SKY_KF[0][1], _SKY_KF[0][2]];
}

// Static star positions
const _STARS = [
  [28,7],[65,13],[118,4],[175,11],[238,6],[295,9],[352,7],[408,13],[450,5],
  [58,16],[142,8],[268,3],[432,10],[90,5],[200,14],[330,9],[480,6],
];

function drawSurface(ctx, scrollOffset, time) {
  const H = CFG.SURFACE_H;
  const W = CFG.W - CFG.PANEL_W;
  // Use in-game clock (minutes 0-1440) when available, else fall back to 6am
  const t = (time !== undefined) ? time / 1440 : 0.25;
  const [skyTop, skyBot] = _getSkyColors(t);

  // Sky base
  fillRect(ctx, 0, 0, W, H, skyTop);
  fillRect(ctx, 0, H * 0.4, W, H * 0.6, skyBot);

  // Stars — visible at night (t<0.22 or t>0.83), fade near dawn/dusk
  const starA = t < 0.17 ? 1 : t < 0.27 ? 1-(t-0.17)/0.10 : t > 0.83 ? (t-0.83)/0.09 : 0;
  if (starA > 0.01) {
    ctx.save();
    ctx.fillStyle = '#ccc8e0';
    for (const [sx, sy] of _STARS) {
      ctx.globalAlpha = starA * (0.4 + ((sx * sy) % 7) * 0.08);
      ctx.fillRect(sx, sy, (sx + sy) % 4 === 0 ? 2 : 1, (sx + sy) % 4 === 0 ? 2 : 1);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Moon (night) or dim sun (day)
  const isNight = t < 0.25 || t > 0.80;
  if (isNight) {
    const mt = t < 0.25 ? t / 0.25 : (t - 0.80) / 0.20;
    const mx2 = 30 + mt * (W - 60);
    const mAlpha = Math.min(1, t < 0.20 ? 1 : t < 0.25 ? 1-(t-0.20)/0.05 : t > 0.88 ? 1 : (t-0.80)/0.08);
    ctx.save();
    ctx.globalAlpha = mAlpha * 0.85;
    ctx.fillStyle = '#d4cce8';
    ctx.beginPath(); ctx.arc(mx2, 14, 5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = skyTop; // crescent shadow
    ctx.beginPath(); ctx.arc(mx2+2, 13, 4, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  } else {
    const dayFrac = (t - 0.25) / 0.55;
    const sunX = 30 + dayFrac * (W - 60);
    const sunA = t < 0.35 ? (t-0.25)/0.10 : t > 0.70 ? 1-(t-0.70)/0.10 : 1;
    // Ambient daylight wash over the sky
    ctx.save();
    ctx.globalAlpha = sunA * 0.18;
    ctx.fillStyle = '#c8a850';
    ctx.fillRect(0, 0, W, H);
    // Sun disc
    ctx.globalAlpha = sunA * 0.75;
    ctx.fillStyle = '#d4b060';
    ctx.beginPath(); ctx.arc(sunX, 15, 10, 0, Math.PI*2); ctx.fill();
    // Inner bright core
    ctx.globalAlpha = sunA * 0.55;
    ctx.fillStyle = '#ffe8a0';
    ctx.beginPath(); ctx.arc(sunX, 15, 5, 0, Math.PI*2); ctx.fill();
    // Halo
    ctx.globalAlpha = sunA * 0.18;
    ctx.fillStyle = '#c8a040';
    ctx.beginPath(); ctx.arc(sunX, 15, 22, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Distant building silhouettes
  const winBright = isNight ? 0.55 : 0.12;
  ctx.globalAlpha = 0.35;
  const buildings = [
    { x: 20, w: 40, h: 55 }, { x: 70, w: 30, h: 45 }, { x: 105, w: 50, h: 65 },
    { x: 160, w: 35, h: 40 }, { x: 200, w: 60, h: 70 }, { x: 265, w: 25, h: 35 },
    { x: 295, w: 45, h: 55 }, { x: 345, w: 20, h: 30 }, { x: 370, w: 55, h: 60 },
    { x: 430, w: 30, h: 42 },
  ];
  ctx.fillStyle = '#14141a';
  const so = (scrollOffset * 0.05) % W;
  for (const b of buildings) {
    const bx = ((b.x - so) % (W + 100) + W + 100) % (W + 100) - 50;
    ctx.fillRect(Math.round(bx), Math.round(H - b.h), Math.round(b.w), Math.round(b.h));
    // Windows
    ctx.fillStyle = `rgba(200,200,140,${winBright})`;
    for (let wi = 4; wi < b.w - 4; wi += 8) {
      for (let wj = 8; wj < b.h - 6; wj += 10) {
        if ((b.x + wi + wj) % 3 !== 0) // some windows dark
          ctx.fillRect(Math.round(bx + wi), Math.round(H - b.h + wj), 4, 5);
      }
    }
    ctx.fillStyle = '#14141a';
  }
  ctx.globalAlpha = 1;

  // Ground line / dirt
  fillRect(ctx, 0, H - 4, W, 4, C.dirt);
  fillRect(ctx, 0, H - 2, W, 2, C.dirt2);

  // Debris / rocks
  ctx.fillStyle = C.concrete;
  ctx.globalAlpha = 0.4;
  const debris = [15, 80, 150, 230, 310, 390, 460];
  for (const dx of debris) {
    const px = ((dx - so * 0.2) % (W + 60) + W + 60) % (W + 60) - 30;
    ctx.fillRect(Math.round(px), H - 5, 6, 3);
  }
  ctx.globalAlpha = 1;
}

// Draw the shelter entrance / hatch on surface
function drawHatch(ctx, x, y) {
  fillRect(ctx, x - 12, y - 2, 24, 4, C.metal);
  fillRect(ctx, x - 10, y - 1, 20, 2, C.metalLight);
  // Handle
  fillRect(ctx, x - 2, y - 3, 4, 1, C.metalLight);
}

// Underground dirt/earth fill
function drawEarth(ctx, x, y, w, h) {
  fillRect(ctx, x, y, w, h, C.dirt);
  // Texture dots
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#ffffff';
  for (let ey = y; ey < y + h; ey += 6) {
    for (let ex = x; ex < x + w; ex += 10) {
      if ((ex + ey) % 20 < 10) ctx.fillRect(Math.round(ex), Math.round(ey), 2, 2);
    }
  }
  ctx.globalAlpha = 1;
}

// ── Exploration environment ───────────────────────────────────────────────────

function drawExploreBackground(ctx, scrollX, zone, worldH, time, bgTheme) {
  const W = CFG.W;
  const H = worldH;

  // Sky
  fillRect(ctx, 0, 0, W, H * 0.45, C.sky);
  if (time !== undefined) fillRect(ctx, 0, 0, W, H * 0.45, '#2a3850', dayFactor(time) * 0.35);
  // Ground
  fillRect(ctx, 0, H * 0.45, W, H * 0.55, C.ground);

  if (bgTheme === 'ruined_city') {
    // Ruined city skyline — collapsed skyscrapers with broken silhouettes
    const rpx = -(scrollX * 0.15) % (W * 2);
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#0d0d18';
    // Tall ruined towers with jagged tops
    const towers = [
      [0,  H*0.08, 44, H*0.37],
      [50, H*0.15, 30, H*0.30],
      [86, H*0.04, 52, H*0.41],
      [145,H*0.12, 36, H*0.33],
      [188,H*0.07, 28, H*0.38],
      [220,H*0.18, 48, H*0.27],
      [275,H*0.06, 38, H*0.39],
      [320,H*0.14, 55, H*0.31],
      [382,H*0.09, 30, H*0.36],
      [418,H*0.16, 44, H*0.28],
      [468,H*0.05, 40, H*0.40],
      [516,H*0.13, 50, H*0.32],
      [572,H*0.08, 32, H*0.37],
      [610,H*0.17, 46, H*0.29],
    ];
    for (const [tx, ty, tw, th] of towers) {
      for (let rep = -1; rep <= 1; rep++) {
        const bx = Math.round(tx + rpx % W + rep * W);
        ctx.fillRect(bx, ty, tw, th);
        // Jagged broken top
        ctx.fillStyle = '#0a0a14';
        ctx.beginPath();
        ctx.moveTo(bx, ty);
        ctx.lineTo(bx + tw * 0.3, ty - 8);
        ctx.lineTo(bx + tw * 0.5, ty - 3);
        ctx.lineTo(bx + tw * 0.7, ty - 12);
        ctx.lineTo(bx + tw, ty);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#0d0d18';
        // Broken windows
        for (let wy = ty + 8; wy < ty + th - 10; wy += 14) {
          for (let wx2 = bx + 4; wx2 < bx + tw - 8; wx2 += 10) {
            if ((wx2 + wy + (tx | 0)) % 3 !== 0)
              ctx.fillRect(wx2, wy, 5, 6);
          }
        }
      }
    }
    ctx.restore();
    // Heavy dark overhead haze for bunker-area atmosphere
    fillRect(ctx, 0, 0, W, H * 0.45, '#060610', 0.35);
  } else {
    // Default distant silhouettes (parallax 0.2)
    const px = -(scrollX * 0.2) % (W * 2);
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#12121a';
    const bdata = [0,55,80,45, 90,60,50,50, 155,70,60,55, 220,50,40,60, 265,65,55,45, 320,80,40,65];
    for (let i = 0; i < bdata.length; i += 4) {
      const bx = ((bdata[i] + W - px % W) % (W * 2));
      ctx.fillRect(Math.round(bx - W), bdata[i+3], bdata[i+2], bdata[i+1]);
      ctx.fillRect(Math.round(bx), bdata[i+3], bdata[i+2], bdata[i+1]);
    }
    ctx.globalAlpha = 1;
  }

  // Ground texture
  fillRect(ctx, 0, Math.round(H * 0.45), W, 3, C.dirt2);
}

function drawExploreBuilding(ctx, bx, by, bw, bh, label) {
  // Building exterior (relative to world coords, caller applies offset)
  fillRect(ctx, bx, by, bw, bh, C.wall);
  fillRect(ctx, bx, by, bw, 4, C.wallLight);  // roofline

  // Windows
  const winW = 16, winH = 12, winGap = 24;
  for (let wx = bx + 12; wx < bx + bw - winW; wx += winGap) {
    fillRect(ctx, wx, by + 8, winW, winH, '#0a0e14');
    // Occasional lit window
    if (chance(15)) fillRect(ctx, wx + 2, by + 10, winW - 4, winH - 4, '#181a10', 0.5);
    strokeRect(ctx, wx, by + 8, winW, winH, '#1c2028');
  }

  // Door
  const doorX = bx + Math.floor(bw / 2) - 8;
  fillRect(ctx, doorX, by + bh - 24, 16, 24, '#0a0808');
  strokeRect(ctx, doorX, by + bh - 24, 16, 24, C.border2);

  // Label
  if (label) {
    drawText(ctx, label, bx + bw / 2, by - 4, C.textDim, 8, 'center');
  }
}
