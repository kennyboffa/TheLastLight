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
  ctx.font = uiFont(10, true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#786040';
  ctx.fillText('T H E', W / 2, titleCY - 8);

  // "LAST  LIGHT" — large title with layered glow
  // Outer glow passes (very low alpha)
  ctx.font = uiFont(36, true);
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

  // ── Main menu ─────────────────────────────────────────────────────────────
  if (t.ready) drawTitleMenu(ctx, gs);
}

function titleAdvance() {
  initIntro();
  setScreen('intro');
}

// ── Main menu: Continue / New Game / Load Game / Profile / Quit ─────────────

const titleUI = { panel: null, confirmDelete: false };

function _saveSlots() {
  const slots = [];
  const a = typeof getAutosaveInfo === 'function' && getAutosaveInfo();
  const m = typeof getSaveInfo === 'function' && getSaveInfo();
  if (a) slots.push({ kind: 'auto', label: 'Autosave', ...a });
  if (m) slots.push({ kind: 'manual', label: 'Saved game', ...m });
  return slots;
}

function _fmtSaved(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
function _fmtGameTime(m) { m = Math.round(m || 0); return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }

function _menuButtons(gs) {
  const slots = _saveSlots();
  const latest = slots.slice().sort((x, y) => (y.savedAt || 0) - (x.savedAt || 0))[0];
  const list = [];
  if (latest) list.push({ id: 'continue', label: `Continue  (Day ${latest.day})`, slot: latest });
  list.push({ id: 'new', label: 'New Game' });
  list.push({ id: 'load', label: 'Load Game', disabled: !slots.length });
  list.push({ id: 'profiles', label: `Profile: ${activeProfile().name}` });
  list.push({ id: 'quit', label: 'Quit' });
  return list;
}

function _loadSlot(gs, slot) {
  Audio.resume();
  if (slot.kind === 'auto') loadAutosave(gs); else loadGame(gs);
  titleUI.panel = null;
}

function drawTitleMenu(ctx, gs) {
  const W = CFG.W, H = CFG.H, mx = gs.mouse.x, my = gs.mouse.y;
  const cx = W / 2, bw = 200, bh = 20, gap = 6;
  titleUI._btns = [];
  const btn = (x, y, w, label, id, extra, disabled) => {
    drawButton(ctx, x, y, w, bh, label, !disabled && hitTest(mx, my, x, y, w, bh), false, !!disabled);
    if (!disabled) titleUI._btns.push({ x, y, w, h: bh, id, ...(extra || {}) });
  };
  let y = Math.round(H * 0.57);

  if (!titleUI.panel) {
    for (const b of _menuButtons(gs)) { btn(cx - bw / 2, y, bw, b.label, b.id, { slot: b.slot }, b.disabled); y += bh + gap; }
    return;
  }
  const pw = 300, px = cx - pw / 2, py = y - 8, ph = H - py - 12;
  drawPanel(ctx, px, py, pw, ph, 'rgba(10,10,16,0.92)', '#3a3020');
  let ty = py + 16;
  if (titleUI.panel === 'load') {
    drawText(ctx, `LOAD GAME  —  ${activeProfile().name}`, cx, ty, '#c4a030', 9, 'center', true); ty += 14;
    const slots = _saveSlots();
    if (!slots.length) { drawText(ctx, 'No saved games on this profile.', cx, ty + 10, C.textDim, 8, 'center'); ty += 24; }
    for (const sl of slots) {
      btn(px + 12, ty, pw - 24, `${sl.label}: Day ${sl.day}, ${_fmtGameTime(sl.time)}`, 'loadSlot', { slot: sl });
      drawText(ctx, `saved ${_fmtSaved(sl.savedAt)}`, cx, ty + bh + 8, '#5a5a66', 6, 'center');
      ty += bh + 16;
    }
    btn(cx - 40, py + ph - bh - 8, 80, 'Back', 'back');
  } else if (titleUI.panel === 'profiles') {
    drawText(ctx, 'PROFILES', cx, ty, '#c4a030', 9, 'center', true); ty += 12;
    drawText(ctx, 'Each profile has its own saved games.', cx, ty, C.textDim, 7, 'center'); ty += 8;
    const act = activeProfileId();
    for (const pr of listProfiles().slice(0, 4)) {
      btn(px + 12, ty, pw - 24, `${pr.id === act ? '✓ ' : ''}${pr.name}`, 'pickProfile', { pid: pr.id });
      ty += bh + 4;
    }
    const by = py + ph - bh - 8;
    btn(px + 12, by, 84, 'New profile', 'newProfile', null, listProfiles().length >= 4);
    btn(px + 102, by, 96, titleUI.confirmDelete ? 'Really delete?' : 'Delete current', 'delProfile', null, listProfiles().length <= 1);
    btn(px + pw - 82, by, 70, 'Back', 'back');
  } else if (titleUI.panel === 'confirmNew') {
    const sl = _saveSlots().find(s2 => s2.kind === 'auto');
    drawText(ctx, 'START A NEW GAME?', cx, ty, '#c4a030', 9, 'center', true); ty += 18;
    ty = drawWrapped(ctx, `${activeProfile().name} has a game in progress${sl ? ` (Day ${sl.day})` : ''}. A new game will replace this profile's autosave. A manual save is kept.`,
      px + 16, ty, pw - 32, 8, C.text, 12) + 10;
    btn(px + 16, py + ph - bh - 8, 130, 'Start new game', 'newConfirmed');
    btn(px + pw - 100, py + ph - bh - 8, 84, 'Cancel', 'back');
  } else if (titleUI.panel === 'quit') {
    drawText(ctx, 'QUIT', cx, ty, '#c4a030', 9, 'center', true); ty += 22;
    drawWrapped(ctx, 'The game runs in your browser. You can close this tab or window now; your saves stay on this computer.', px + 16, ty, pw - 32, 8, C.text, 12);
    btn(cx - 40, py + ph - bh - 8, 80, 'Back', 'back');
  }
}

function titleClick(mx, my, gs) {
  const t = gs.title;
  if (!t || !t.ready) { if (t) { t.alpha = 1; t.textAlpha = 1; t.ready = true; } return; }   // click skips the fade-in
  const b = (titleUI._btns || []).find(r => hitTest(mx, my, r.x, r.y, r.w, r.h));
  if (!b) return;
  Audio.resume();
  if (b.id !== 'delProfile') titleUI.confirmDelete = false;
  switch (b.id) {
    case 'continue': _loadSlot(gs, b.slot); break;
    case 'loadSlot': _loadSlot(gs, b.slot); break;
    case 'new':
      if (_saveSlots().some(s2 => s2.kind === 'auto')) titleUI.panel = 'confirmNew';
      else titleAdvance();
      break;
    case 'newConfirmed': titleUI.panel = null; titleAdvance(); break;
    case 'load': titleUI.panel = 'load'; break;
    case 'profiles': titleUI.panel = 'profiles'; break;
    case 'pickProfile': setActiveProfile(b.pid); break;
    case 'newProfile': {
      const name = window.prompt('Name for the new profile:', `Player ${listProfiles().length + 1}`);
      if (name !== null) createProfile(name);
      break;
    }
    case 'delProfile':
      if (!titleUI.confirmDelete) { titleUI.confirmDelete = true; break; }
      titleUI.confirmDelete = false;
      deleteProfile(activeProfileId());
      break;
    case 'quit':
      titleUI.panel = 'quit';
      try { window.close(); } catch (e) {}
      break;
    case 'back': titleUI.panel = null; break;
  }
}

/** Keyboard on the title: Enter/Space picks the first menu option, Esc backs out. */
function titleKey(key, gs) {
  const t = gs.title;
  if (!t) return;
  if (!t.ready) { t.alpha = 1; t.textAlpha = 1; t.ready = true; return; }
  if (key === 'escape') { titleUI.panel = null; return; }
  if ((key === 'enter' || key === ' ') && !titleUI.panel) {
    const first = _menuButtons(gs)[0];
    Audio.resume();
    if (first.id === 'continue') _loadSlot(gs, first.slot); else titleAdvance();
  }
}

/** Leave the current game for the main menu. */
function quitToTitle(gs) {
  if (typeof resetGame === 'function') resetGame();
  GS.screen = 'title';
  initTitle();
  const t = GS.title; t.alpha = 1; t.textAlpha = 1; t.ready = true;
  titleUI.panel = null;
}
