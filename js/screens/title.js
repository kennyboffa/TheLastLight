// title.js — Opening title screen shown before story intro
'use strict';

function initTitle() {
  const N = 34;
  GS.title = {
    timer:      0,
    alpha:      0,       // background fade-in 0→1
    textAlpha:  0,       // title text fade-in 0→1
    ready:      false,   // prompt pulsing
    // Dust mote particles
    dustX: Array.from({length: N}, (_, i) => ((i * 97 + 13) % CFG.W)),
    dustY: Array.from({length: N}, (_, i) => 60 + ((i * 137 + 7)  % 280)),
    dustS: Array.from({length: N}, (_, i) => 0.10 + (i % 7) * 0.04),
  };
}

function updateTitle(dt) {
  const t = GS.title;
  if (!t) return;
  t.timer++;
  // Fade in background slowly
  t.alpha = Math.min(1, t.alpha + 0.007);
  // Title text fades in once background is half-visible
  if (t.alpha > 0.45) t.textAlpha = Math.min(1, t.textAlpha + 0.009);
  // Prompt appears once text is nearly fully shown
  if (t.textAlpha > 0.9 && !t.ready) t.ready = true;
  // Drift dust motes upward, wrap at top
  for (let i = 0; i < t.dustY.length; i++) {
    t.dustY[i] -= t.dustS[i];
    if (t.dustY[i] < 8) t.dustY[i] = 290 + ((t.dustX[i] * 3) % 90);
  }
}

function renderTitle(ctx, gs) {
  const W = CFG.W, H = CFG.H;
  const t = gs.title;
  if (!t) { fillRect(ctx, 0, 0, W, H, '#000000'); return; }

  // Solid black base
  ctx.fillStyle = '#050508';
  ctx.fillRect(0, 0, W, H);

  const horizY = Math.round(H * 0.62);

  ctx.save();
  ctx.globalAlpha = t.alpha;

  // Sky gradient — near-black blue-grey at top, slightly warmer at horizon
  const sky = ctx.createLinearGradient(0, 0, 0, horizY);
  sky.addColorStop(0, '#05050c');
  sky.addColorStop(0.65, '#0b0b1a');
  sky.addColorStop(1,    '#12101c');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, horizY);

  // Horizon amber glow — the last light bleeding through ruins
  const glowX = Math.round(W * 0.47);
  const horizGlow = ctx.createRadialGradient(glowX, horizY, 0, glowX, horizY, Math.round(W * 0.52));
  horizGlow.addColorStop(0,    'rgba(230,155,45,0.22)');
  horizGlow.addColorStop(0.22, 'rgba(190,90,20,0.09)');
  horizGlow.addColorStop(0.55, 'rgba(90,30,5,0.03)');
  horizGlow.addColorStop(1,    'rgba(0,0,0,0)');
  ctx.fillStyle = horizGlow;
  ctx.fillRect(0, horizY - 110, W, 150);

  // Narrow vertical light column rising from glow centre
  const colGrad = ctx.createLinearGradient(0, 0, 0, horizY);
  colGrad.addColorStop(0,   'rgba(230,165,40,0)');
  colGrad.addColorStop(0.6, 'rgba(230,165,40,0.015)');
  colGrad.addColorStop(1,   'rgba(230,165,40,0.10)');
  ctx.fillStyle = colGrad;
  ctx.fillRect(glowX - 18, 0, 36, horizY);

  // ── Ruined city silhouette ───────────────────────────────────────────────
  ctx.fillStyle = '#07070f';
  // Each entry: [bx, topFrac, bw, hFrac]
  const bldgs = [
    [  0,  0.30, 50, 0.32],
    [ 48,  0.42, 28, 0.20],
    [ 74,  0.20, 54, 0.42],
    [126,  0.35, 34, 0.27],
    [158,  0.17, 50, 0.45],
    [206,  0.38, 56, 0.24],
    [260,  0.26, 38, 0.36],
    [296,  0.44, 26, 0.18],
    [320,  0.18, 48, 0.44],
    [366,  0.32, 36, 0.30],
    [400,  0.13, 46, 0.49],
    [444,  0.36, 52, 0.26],
    [494,  0.22, 40, 0.40],
    [532,  0.39, 32, 0.23],
    [562,  0.15, 54, 0.47],
    [614,  0.30, 34, 0.32],
    [646,  0.40, 42, 0.22],
    [686,  0.21, 56, 0.41],
    [740,  0.33, 38, 0.29],
  ];
  for (const [bx, topFrac, bw, hFrac] of bldgs) {
    const bh = Math.round(H * hFrac);
    const by = Math.round(horizY - bh);
    ctx.fillRect(bx, by, bw, bh + 80);
    // Jagged broken roofline
    ctx.fillStyle = '#050509';
    ctx.beginPath();
    ctx.moveTo(bx,                         by);
    ctx.lineTo(bx + Math.round(bw * 0.28), by - 5);
    ctx.lineTo(bx + Math.round(bw * 0.52), by - 1);
    ctx.lineTo(bx + Math.round(bw * 0.76), by - 8);
    ctx.lineTo(bx + bw,                    by);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#07070f';
  }

  // Ground — near-black below horizon
  ctx.fillStyle = '#040406';
  ctx.fillRect(0, horizY, W, H - horizY);

  // Floating dust motes
  for (let i = 0; i < t.dustX.length; i++) {
    ctx.globalAlpha = (0.055 + (i % 5) * 0.025) * t.alpha;
    ctx.fillStyle = i % 4 === 0 ? '#c08830' : '#787878';
    ctx.fillRect(Math.round(t.dustX[i]), Math.round(t.dustY[i]), 1, 1);
  }
  ctx.restore();

  // ── Title text ────────────────────────────────────────────────────────────
  ctx.save();
  ctx.globalAlpha = t.textAlpha;

  const titleCY  = Math.round(H * 0.30);
  const lineX    = Math.round(W / 2 - 135);
  const lineLen  = 270;

  // Top separator
  ctx.strokeStyle = '#382510';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(lineX, titleCY - 24);
  ctx.lineTo(lineX + lineLen, titleCY - 24);
  ctx.stroke();

  // "T H E" — small dim label above the main word
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#786040';
  ctx.fillText('T H E', W / 2, titleCY - 8);

  // "LAST  LIGHT" — large title with layered glow
  // Outer glow passes (very low alpha)
  ctx.font = 'bold 36px monospace';
  ctx.globalAlpha = t.textAlpha * 0.12;
  ctx.fillStyle = '#e8c040';
  for (let dx = -4; dx <= 4; dx += 2) {
    for (let dy = -2; dy <= 2; dy += 2) {
      ctx.fillText('LAST  LIGHT', W / 2 + dx, titleCY + 32 + dy);
    }
  }
  // Crisp top layer
  ctx.globalAlpha = t.textAlpha;
  ctx.fillStyle = '#c4a030';
  ctx.fillText('LAST  LIGHT', W / 2, titleCY + 32);

  // Bottom separator
  ctx.globalAlpha = t.textAlpha;
  ctx.strokeStyle = '#382510';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(lineX, titleCY + 50);
  ctx.lineTo(lineX + lineLen, titleCY + 50);
  ctx.stroke();

  ctx.restore();

  // ── "Press any key" prompt ────────────────────────────────────────────────
  if (t.ready) {
    const pulse = 0.38 + 0.28 * Math.sin(Date.now() / 720);
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#706858';
    ctx.fillText('CLICK OR PRESS ANY KEY TO CONTINUE', W / 2, Math.round(H * 0.76));
    ctx.restore();
  }
}

function titleAdvance() {
  initIntro();
  setScreen('intro');
}
