// main.js — Entry point, game loop, input routing
'use strict';

// ── Canvas setup ──────────────────────────────────────────────────────────────

const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');

let SCALE = 1;

function resizeCanvas() {
  // visualViewport gives the true visible area on mobile (excludes address bar,
  // on-screen keyboard, etc.). Fall back to window dimensions on desktop.
  const vp = window.visualViewport;
  const ww = vp ? vp.width  : window.innerWidth;
  const wh = vp ? vp.height : window.innerHeight;
  const fitScale  = Math.min(ww / CFG.W, wh / CFG.H);
  const userScale = (typeof GS !== 'undefined' && GS.userScale) ? GS.userScale : 1.0;

  canvas.width  = CFG.W;
  canvas.height = CFG.H;

  // Use exact fitScale (no integer floor-snap) so the game fills available
  // space precisely. CSS image-rendering:pixelated keeps pixels crisp.
  const displayScale = fitScale;
  SCALE = displayScale * userScale;
  canvas.style.width  = Math.round(CFG.W * displayScale) + 'px';
  canvas.style.height = Math.round(CFG.H * displayScale) + 'px';
  canvas.style.filter = 'saturate(0.7)';

  // User zoom: CSS transform that scales from the BOTTOM so the bottom
  // control bar always stays visible.  Overflow grows upward and is clipped
  // by the body's overflow:hidden, hiding the top of the game content.
  if (Math.abs(userScale - 1.0) > 0.001) {
    canvas.style.transform       = `scale(${userScale})`;
    canvas.style.transformOrigin = 'bottom center';
  } else {
    canvas.style.transform       = '';
    canvas.style.transformOrigin = '';
  }
}

window.addEventListener('resize', resizeCanvas);
// Fires when the phone rotates
window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 100));
// Fires when iOS address bar shows/hides
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', resizeCanvas);
}
resizeCanvas();

// ── Input handling ────────────────────────────────────────────────────────────

function canvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / SCALE,
    y: (e.clientY - rect.top)  / SCALE,
  };
}

canvas.addEventListener('mousemove', (e) => {
  const { x, y } = canvasCoords(e);
  GS.mouse.x = x;
  GS.mouse.y = y;
});

let _mouseDownX = 0, _mouseDownY = 0;

canvas.addEventListener('mousedown', (e) => {
  const { x, y } = canvasCoords(e);
  GS.mouse.down   = true;
  GS.mouse.clickX = x;
  GS.mouse.clickY = y;
  _mouseDownX = x; _mouseDownY = y;
});

canvas.addEventListener('mouseup', (e) => {
  Audio.init();   // initialise audio context on first user gesture
  const { x, y } = canvasCoords(e);
  GS.mouse.down   = false;
  GS.mouse.clickX = x;
  GS.mouse.clickY = y;
  // Suppress click if mouse was dragged (scrolling menus)
  const dragDist = Math.abs(x - _mouseDownX) + Math.abs(y - _mouseDownY);
  if (dragDist <= 6) GS.mouse.clicked = true;
});

// ── Touch support (mobile) ────────────────────────────────────────────────────

// Tracks which mobile D-pad buttons are held (suppresses normal click)
let _mobileHeld = { left: false, right: false, action: false };

function _isMobileBtn(x, y) {
  if (GS.screen !== 'explore') return false;
  const MB = _MOBILE_BTNS;
  return hitTest(x, y, MB.left.x,   MB.left.y,   MB.left.w,   MB.left.h)
      || hitTest(x, y, MB.right.x,  MB.right.y,  MB.right.w,  MB.right.h)
      || hitTest(x, y, MB.action.x, MB.action.y, MB.action.w, MB.action.h);
}

let _touchStartX = 0, _touchStartY = 0;

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const firstT = e.changedTouches[0];
  _touchLastY  = (firstT.clientY - rect.top)  / SCALE;
  _touchStartX = (firstT.clientX - rect.left) / SCALE;
  _touchStartY = _touchLastY;
  // Handle all active touches (multi-touch for e.g. left + action simultaneously)
  for (const t of e.changedTouches) {
    const x = (t.clientX - rect.left) / SCALE;
    const y = (t.clientY - rect.top)  / SCALE;
    if (GS.screen === 'explore') {
      const MB = _MOBILE_BTNS;
      // Store touch identifier so touchend can release regardless of final finger position
      if (hitTest(x, y, MB.left.x,   MB.left.y,   MB.left.w,   MB.left.h))   { GS.keys['a'] = true; _mobileHeld.left   = t.identifier; continue; }
      if (hitTest(x, y, MB.right.x,  MB.right.y,  MB.right.w,  MB.right.h))  { GS.keys['d'] = true; _mobileHeld.right  = t.identifier; continue; }
      if (hitTest(x, y, MB.action.x, MB.action.y, MB.action.w, MB.action.h)) { _mobileHeld.action = t.identifier; exploreKeyPress('e', GS); continue; }
    }
    // Regular touch → mouse
    GS.mouse.x = x; GS.mouse.y = y;
    GS.mouse.down = true;
    GS.mouse.clickX = x; GS.mouse.clickY = y;
  }
}, { passive: false });

let _touchLastY  = 0;

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const t = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  const cy = (t.clientY - rect.top) / SCALE;
  GS.mouse.x = (t.clientX - rect.left) / SCALE;
  GS.mouse.y = cy;
  // Drag scrolling for menu screens
  if (GS.screen === 'exploreSelect') {
    esScrollY = Math.max(0, esScrollY - (cy - _touchLastY));
  } else if (GS.screen === 'shelter' && shelterUI) {
    const delta = cy - _touchLastY;
    if (shelterUI.activeMenu === 'storage') {
      shelterUI.storageScroll = Math.max(0, (shelterUI.storageScroll || 0) - delta);
    } else if (shelterUI.activeMenu === 'journal') {
      const jt = shelterUI.journalTab;
      if      (jt === 'help')  shelterUI.helpScroll  = Math.max(0, (shelterUI.helpScroll  || 0) - delta);
      else if (jt === 'diary') shelterUI.diaryScroll = Math.max(0, (shelterUI.diaryScroll || 0) - delta);
      else if (jt === 'other') shelterUI.otherScroll = Math.max(0, (shelterUI.otherScroll || 0) - delta);
      else                     shelterUI.storageScroll = Math.max(0, (shelterUI.storageScroll || 0) - delta);
    } else if (shelterUI.activeMenu === 'crafting') {
      shelterUI.craftingScroll = Math.max(0, (shelterUI.craftingScroll || 0) - delta);
    }
  }
  _touchLastY = cy;
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  Audio.init();    // initialise on first touch gesture
  Audio.resume();  // iOS AudioContext starts suspended
  const rect = canvas.getBoundingClientRect();

  // If a screen transition happened while a D-pad button was held, clear it.
  if (GS.screen !== 'explore' && (_mobileHeld.left !== false || _mobileHeld.right !== false || _mobileHeld.action !== false)) {
    _mobileHeld.left = _mobileHeld.right = _mobileHeld.action = false;
    GS.keys['a'] = false;
    GS.keys['d'] = false;
  }

  for (const t of e.changedTouches) {
    if (GS.screen === 'explore') {
      // Release by matching the touch identifier that originally pressed each button.
      // This fixes "stuck key" when the finger slides off the button before lifting.
      if (_mobileHeld.left   === t.identifier) { GS.keys['a'] = false; _mobileHeld.left   = false; continue; }
      if (_mobileHeld.right  === t.identifier) { GS.keys['d'] = false; _mobileHeld.right  = false; continue; }
      if (_mobileHeld.action === t.identifier) { _mobileHeld.action = false; continue; }
    }
  }
  // Only fire click if no mobile button is still held and touch didn't drag
  if (_mobileHeld.left === false && _mobileHeld.right === false && _mobileHeld.action === false) {
    const t0 = e.changedTouches[0];
    const rect2 = canvas.getBoundingClientRect();
    const ex = (t0.clientX - rect2.left) / SCALE;
    const ey2 = (t0.clientY - rect2.top)  / SCALE;
    const touchDrag = Math.abs(ex - _touchStartX) + Math.abs(ey2 - _touchStartY);
    GS.mouse.down = false;
    if (touchDrag <= 8) GS.mouse.clicked = true;
  }
}, { passive: false });

// ── Mouse wheel scrolling ─────────────────────────────────────────────────────

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 1 : -1;
  const scrollAmt = 60;
  if (GS.screen === 'exploreSelect') {
    esScrollY = Math.max(0, esScrollY + delta * scrollAmt);
  } else if (GS.screen === 'shelter') {
    if (shelterUI) {
      if (shelterUI.activeMenu === 'journal') {
        const jt = shelterUI.journalTab;
        if      (jt === 'help')  shelterUI.helpScroll  = Math.max(0, (shelterUI.helpScroll  || 0) + delta * scrollAmt);
        else if (jt === 'diary') shelterUI.diaryScroll = Math.max(0, (shelterUI.diaryScroll || 0) + delta * scrollAmt);
        else if (jt === 'other') shelterUI.otherScroll = Math.max(0, (shelterUI.otherScroll || 0) + delta * scrollAmt);
        else                     shelterUI.storageScroll = Math.max(0, (shelterUI.storageScroll || 0) + delta * scrollAmt);
      } else if (shelterUI.activeMenu === 'storage') {
        shelterUI.storageScroll = Math.max(0, (shelterUI.storageScroll || 0) + delta * scrollAmt);
      } else if (shelterUI.activeMenu === 'crafting') {
        shelterUI.craftingScroll = Math.max(0, (shelterUI.craftingScroll || 0) + delta * 20);
      }
    }
  } else if (GS.screen === 'packScreen') {
    packScreenScroll(delta, GS);
  } else if (GS.screen === 'explore' && typeof exploreScroll === 'function') {
    exploreScroll(delta, GS);
  }
}, { passive: false });

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  GS.keys[key] = true;

  // Don't swallow typing in name input
  if (document.getElementById('name-input') === document.activeElement) return;

  handleKeyPress(key);
});

window.addEventListener('keyup', (e) => {
  GS.keys[e.key.toLowerCase()] = false;
});

function handleKeyPress(key) {
  if (key === 'enter' || key === ' ') {
    if (GS.screen === 'title')      { Audio.resume(); titleAdvance(); return; }
    if (GS.screen === 'intro')      { introAdvance(); return; }
    if (GS.screen === 'gameOver')   { resetGame(); return; }
  }

  if (GS.screen === 'explore') {
    exploreKeyPress(key, GS);
    return;
  }

  if (GS.screen === 'event') {
    if (key >= '1' && key <= '9') {
      const idx = parseInt(key) - 1;
      const ev  = GS.event;
      if (ev && ev.choices && idx < ev.choices.length && !eventUI.resultText) {
        const choice = ev.choices[idx];
        const result = choice.action(GS);
        eventUI.resultText  = result || '';
        eventUI.resultTimer = 180;
      }
    }
    if (key === 'enter' && eventUI.resultText) closeEvent(GS);
    return;
  }

  if (GS.screen === 'shelter') {
    if (key === 'e') {
      // Feed Lily if hungry
      if (GS.child.hunger > 50) {
        const foodId = ['heated_beans','heated_soup','canned_beans','cooked_meat','canned_soup']
          .find(id => countInInventory(GS.shelter.storage, id) > 0);
        if (foodId) {
          removeFromInventory(GS.shelter.storage, foodId, 1);
          const def = getItemDef(foodId);
          GS.child.hunger = clamp(GS.child.hunger + (def.hunger || -20), 0, 100);
          notify(`Fed Lily: ${def.name}`, 'good');
        }
      }
    }
  }
}

// ── Main game loop ────────────────────────────────────────────────────────────

let lastTime   = 0;
let frameCount = 0;
const TARGET_FPS = 60;

function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05); // cap at 50ms
  lastTime = timestamp;
  frameCount++;

  ctx.clearRect(0, 0, CFG.W, CFG.H);
  ctx.imageSmoothingEnabled = false;

  try {
    update(dt);
    render(ctx);
    // Click handled AFTER render so bounds are always fresh
    if (GS.mouse.clicked) {
      handleClick(GS.mouse.clickX, GS.mouse.clickY, GS);
    }
  } catch (e) {
    // Show error on screen so it's visible even without devtools open
    ctx.fillStyle = '#0e0e18';
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    ctx.fillStyle = '#cc3333';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('ERROR: ' + e.message, 20, 40);
    ctx.fillStyle = '#666';
    ctx.font = '9px monospace';
    const lines = (e.stack || '').split('\n').slice(0, 8);
    lines.forEach((l, i) => ctx.fillText(l, 20, 60 + i * 12));
    ctx.textAlign = 'left';
    console.error(e);
    // Don't call requestAnimationFrame — freeze on error so it's readable
    return;
  }

  GS.mouse.clicked = false;
  requestAnimationFrame(gameLoop);
}

function update(dt) {
  const gs = GS;

  // Zoom animation tick (runs even during day transitions)
  const za = gs.zoomAnim;
  if (za && Math.abs(za.scale - za.target) > 0.0005) {
    za.scale = lerp(za.scale, za.target, 0.007);
    if (Math.abs(za.scale - za.target) < 0.002) za.scale = za.target;
  }

  // Screen transition fade tick
  const sf = gs.screenFade;
  if (sf && sf.active) {
    if (sf.phase === 'out') {
      sf.alpha = Math.min(1, sf.alpha + 0.04);
      if (sf.alpha >= 1) {
        if (sf.pendingFn) { sf.pendingFn(); sf.pendingFn = null; }
        // Hold on the title card if one is shown; otherwise go straight to fade-in
        sf.phase    = sf.titleText ? 'hold' : 'in';
        sf.holdTimer = sf.titleText ? 180 : 0; // ~3s at 60fps
      }
    } else if (sf.phase === 'hold') {
      sf.holdTimer = (sf.holdTimer || 0) - 1;
      if (sf.holdTimer <= 0) sf.phase = 'in';
    } else if (sf.phase === 'in') {
      sf.alpha = Math.max(0, sf.alpha - 0.025);
      if (sf.alpha <= 0) { sf.active = false; sf.phase = 'idle'; }
    }
  }

  // Day transition takes priority
  if (gs.dayFade.active) return;

  // Stats tick (only in shelter/explore — not during events or combat transitions)
  // timeScale only applies in shelter (not during exploration)
  if (!gs.paused && (gs.screen === 'shelter' || gs.screen === 'explore')) {
    const scaledDt = (gs.screen === 'shelter') ? dt * (gs.timeScale || 1) : dt;
    tickStats(gs, scaledDt);
    tickMissions(gs);
  }

  // Screen-specific update
  if (gs.screen === 'title')      updateTitle(dt);
  if (gs.screen === 'intro')      updateIntro(dt);
  if (gs.screen === 'explore' && !(gs.screenFade && gs.screenFade.active))
    updateExplore(gs, dt);
  if (gs.screen === 'combat')     updateCombat(gs, dt);

  // Shelter ambient events (skip if day transition just started this frame)
  if (gs.screen === 'shelter' && !gs.dayFade.active) {
    maybeFireShelterEvent(gs);
    maybeFireDialogueEvent(gs);
    autoFeedLogic(gs);
    updateShelterAmbient(gs);
  }

}


function render(ctx) {
  const gs = GS;

  // Zoom transition — clips to the main game world area only (excludes right stats panel
  // and bottom controls so the UI stays at normal scale during cinematic zoom)
  const zoom = gs.zoomAnim ? gs.zoomAnim.scale : 1.0;
  const hasZoom = Math.abs(zoom - 1.0) > 0.001;
  const zoomW = (typeof MAIN_W !== 'undefined') ? MAIN_W : CFG.W; // main game area width

  if (hasZoom) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, zoomW, CFG.H);
    ctx.clip();
    ctx.translate(zoomW / 2, CFG.H / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-zoomW / 2, -CFG.H / 2);
  }

  switch (gs.screen) {
    case 'title':
      renderTitle(ctx, gs);
      break;
    case 'intro':
      renderIntro(ctx, gs);
      break;
    case 'charCreate':
      renderCharCreate(ctx, gs);
      break;
    case 'shelter':
      renderShelter(ctx, gs);
      break;
    case 'exploreSelect':
      renderExploreSelect(ctx, gs);
      break;
    case 'packScreen':
      renderPackScreen(ctx, gs);
      break;
    case 'explore':
      renderExplore(ctx, gs);
      break;
    case 'combat':
      renderCombat(ctx, gs);
      break;
    case 'lootPickup':
      renderLootPickup(ctx, gs);
      break;
    case 'event':
      renderEvent(ctx, gs);
      break;
    case 'gameOver':
      renderGameOver(ctx, gs);
      break;
    case 'gameWon':
      renderGameWon(ctx, gs);
      break;
    default:
      fillRect(ctx, 0, 0, CFG.W, CFG.H, C.bg);
  }

  if (hasZoom) {
    ctx.restore();
    // Redraw UI panels at 1:1 scale on top — they were drawn inside the zoom
    // context above but got clipped away since they're outside the game world area
    if (gs.screen === 'shelter') {
      drawStatsPanel(ctx, gs);
      drawShelterControls(ctx, gs, gs.mouse.x, gs.mouse.y);
    }
  }

  // Vignette — dark edges for a gritty, claustrophobic feel
  const vig = ctx.createRadialGradient(CFG.W / 2, CFG.H / 2, CFG.W * 0.28, CFG.W / 2, CFG.H / 2, CFG.W * 0.82);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.62)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, CFG.W, CFG.H);

  // Film grain — scattered noise/dirt particles, no directional pattern
  if (gs.screen !== 'intro') {
    const seed = frameCount % 31;
    ctx.save();
    ctx.globalAlpha = 0.10;
    for (let i = 0; i < 2800; i++) {
      // Cross-multiplied large coprimes break any linear/diagonal distribution
      const h1 = (i * 7369 + seed * 3491 + i * seed * 113) % 7919;
      const h2 = (i * 5171 + seed * 6143 + (i ^ seed) * 317) % 7793;
      const gx = Math.floor(h1 / 7919 * CFG.W);
      const gy = Math.floor(h2 / 7793 * CFG.H);
      // Mixed gray tones: dark specks, mid-gray, occasional light dust
      const tone = (i * 3 + seed * 7) % 9;
      if      (tone < 4) ctx.fillStyle = '#1a1a1a';   // dark speck
      else if (tone < 7) ctx.fillStyle = '#555555';   // mid gray
      else               ctx.fillStyle = '#cccccc';   // light dust
      const sz = (i * 11 + seed) % 17 < 2 ? 2 : 1;  // ~12% are 2×2 dust blobs
      ctx.fillRect(gx, gy, sz, sz);
    }
    ctx.restore();
  }

  // Screen transition black overlay
  const sf = gs.screenFade;
  if (sf && sf.active && sf.alpha > 0) {
    ctx.save();
    ctx.globalAlpha = sf.alpha;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    ctx.globalAlpha = 1;
    ctx.restore();

    // Cinematic area title card — shown during the black phase
    if (sf.titleText && sf.alpha > 0.7) {
      const titleAlpha = (sf.alpha - 0.7) / 0.3;
      ctx.save();
      ctx.globalAlpha = titleAlpha;
      drawText(ctx, sf.titleText.toUpperCase(), CFG.W / 2, CFG.H / 2 - 8, '#c4943a', 18, 'center', true);
      drawDivider(ctx, CFG.W / 2 - 80, CFG.H / 2 + 2, 160, '#5a3a10');
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }
}

function renderGameOver(ctx, gs) {
  drawGameOver(ctx, gs);
}

function renderGameWon(ctx, gs) {
  drawGameWon(ctx, gs);
}

// ── Click routing ─────────────────────────────────────────────────────────────

function handleClick(mx, my, gs) {
  // Day transition / game over
  if (gs.dayFade.active) return;
  if (gs.screenFade && gs.screenFade.active) return;
  Audio.click();

  switch (gs.screen) {
    case 'title':
      Audio.resume();
      titleAdvance();
      break;
    case 'intro':
      introAdvance();
      break;
    case 'charCreate':
      charCreateClick(mx, my, gs);
      break;
    case 'shelter':
      shelterClick(mx, my, gs);
      break;
    case 'exploreSelect':
      exploreSelectClick(mx, my, gs);
      break;
    case 'packScreen':
      packScreenClick(mx, my, gs);
      break;
    case 'explore':
      exploreClick(mx, my, gs);
      break;
    case 'combat':
      combatClick(mx, my, gs);
      break;
    case 'lootPickup':
      lootPickupClick(mx, my, gs);
      break;
    case 'event':
      eventClick(mx, my, gs);
      break;
    case 'gameOver': {
      // Autosave button (rendered by drawGameOver and stored in _gameOverAutoBtn)
      if (gs._gameOverAutoBtn) {
        const ab = gs._gameOverAutoBtn;
        if (hitTest(mx, my, ab.x, ab.y, ab.w, ab.h)) {
          loadAutosave(GS);
          break;
        }
      }
      // New game button
      if (gs._gameOverNewBtn) {
        const nb = gs._gameOverNewBtn;
        if (hitTest(mx, my, nb.x, nb.y, nb.w, nb.h)) resetGame();
      }
      break;
    }
    case 'gameWon': {
      const bx = CFG.W/2 - 55, by = CFG.H - 38;
      if (hitTest(mx, my, bx, by, 110, 22)) resetGame();
      break;
    }
  }
}

// ── Auto feed logic (basic needs management hint) ─────────────────────────────

function autoFeedLogic(gs) {
  // Auto feed Lily if parent is present, storage has food, lily is hungry
  if (gs.parent.isExploring) return;
  const ch = gs.child;
  if (ch.hunger >= 70) {
    const foodOrder = ['heated_beans','heated_soup','cooked_meat','cooked_soup',
                       'canned_beans','canned_soup','canned_meat','energy_bar'];
    for (const fid of foodOrder) {
      if (countInInventory(gs.shelter.storage, fid) > 0) {
        removeFromInventory(gs.shelter.storage, fid, 1);
        const def = getItemDef(fid);
        ch.hunger    = clamp(ch.hunger    + (def.hunger    || -20), 0, 100);
        ch.thirst    = clamp(ch.thirst    + (def.thirst    ||   0), 0, 100);
        ch.depression= clamp(ch.depression+ (def.depression||   0), 0, 100);
        notify(`Lily ate ${def.name}.`, 'good');
        break;
      }
    }
  }
  // Auto drink for lily
  if (ch.thirst >= 70) {
    const waterOrder = ['purified_water','water_bottle','dirty_water'];
    for (const wid of waterOrder) {
      if (countInInventory(gs.shelter.storage, wid) > 0) {
        removeFromInventory(gs.shelter.storage, wid, 1);
        const def = getItemDef(wid);
        ch.thirst = clamp(ch.thirst + (def.thirst || -28), 0, 100);
        ch.health = clamp(ch.health + (def.health || 0), 0, ch.maxHealth);
        notify(`Lily drank ${def.name}.`, 'good');
        break;
      }
    }
  }
}

// ── Companion missions ────────────────────────────────────────────────────────

function tickMissions(gs) {
  for (const m of gs.missions) {
    if (m.status !== 'active') continue;
    const returnMinutes = m.returnDay * 1440 + m.returnTime;
    const nowMinutes    = gs.day * 1440 + gs.time;
    if (nowMinutes >= returnMinutes) {
      resolveMission(gs, m);
    }
  }
  // Clean up old resolved missions (keep last 5)
  gs.missions = gs.missions.filter(m => m.status === 'active').concat(
    gs.missions.filter(m => m.status !== 'active').slice(-5)
  );
}

function resolveMission(gs, m) {
  m.status = 'resolved';
  const survivor = gs.survivors.find(s => s.id === m.survivorId);
  if (survivor) survivor.onMission = false;

  // Small chance lost
  if (chance(m.lostChance)) {
    m.lost = true;
    if (survivor) {
      gs.survivors = gs.survivors.filter(s => s.id !== m.survivorId);
      addLog(`${m.survivorName} doesn't seem to be coming back from ${m.locName}...`, 'danger');
    }
    return;
  }

  // Injury chance
  if (chance(m.injuryChance) && survivor) {
    const dmg = randInt(10, 35);
    survivor.health = Math.max(5, survivor.health - dmg);
    m.injured = true;
    addLog(`${m.survivorName} returned injured from ${m.locName}.`, 'warn');
  } else {
    addLog(`${m.survivorName} returned from ${m.locName}.`, 'good');
  }

  // Add loot to shelter storage
  for (const item of m.loot) {
    addToInventory(gs.shelter.storage, item.id, item.qty);
  }
  if (m.loot.length > 0) {
    notify(`${m.survivorName} brought back ${m.loot.length} types of supplies.`, 'good');
  }
}

// ── Game reset ────────────────────────────────────────────────────────────────

function resetGame() {
  // Reset state
  Object.assign(GS, {
    screen: 'intro',
    day: 1,
    time: CFG.DAY_START,
    paused: false,
    parent: {
      name:'Alex', gender:'father',
      health:100, maxHealth:100,
      hunger:20, thirst:20, tiredness:20, depression:15,
      infected:false,
      strength:5, agility:5, perception:5, intelligence:5, charisma:5,
      skills:{scavenging:1,stealth:1,exploration:1,bartering:1,speech:1,lockpick:1,melee:1,firearms:1},
      inventory:[], backpackId:null,
      equipped:{weapon:null,armor:null},
      ammo:{pistol:0,rifle:0,shotgun:0},
      loaded:{pistol:0,rifle:0,shotgun:0},
      isExploring:false, isSleeping:false, isWorking:false,
      task:null, taskProgress:0, taskDuration:0,
      level:1, xp:0,
      x:115, y:0, facing:1, animFrame:0, animTimer:0,
    },
    child: {
      name:'Lily', health:80, maxHealth:80,
      hunger:20, thirst:20, tiredness:25, depression:15,
      isAlone:false, infected:false,
      isSleeping:false, task:null, taskProgress:0, taskDuration:0,
      strength:2, agility:5, perception:5, intelligence:6, charisma:6,
      skills:{scavenging:1,stealth:2,exploration:1,bartering:1,speech:2,lockpick:1,melee:1,firearms:1},
      level:1, xp:0,
      x:65, y:0, facing:1, animFrame:0, animTimer:0,
    },
    survivors: [],
    shelter: {
      rooms: [
        {id:'main',     unlocked:true,  level:1, building:false, buildProgress:0},
        {id:'bedroom',  unlocked:true,  level:1, building:false, buildProgress:0},
        {id:'storage',  unlocked:false, level:0, building:false, buildProgress:0},
        {id:'workshop', unlocked:false, level:0, building:false, buildProgress:0},
        {id:'infirmary',unlocked:false, level:0, building:false, buildProgress:0},
        {id:'security', unlocked:false, level:0, building:false, buildProgress:0},
      ],
      storage:[], storageMax:80, defenseLevel:0,
      hasWaterFilter:false, hasGenerator:false, hasRadioDampener:false,
      hasRaincatcher:false,
      campfire:false, noiseBudget:100, noiseToday:0,
      dronePatrol:{ active:false, x:-30, dir:1, timer:0, nextPatrol:300 },
    },
    dog:null, suspicion:10,
    explore:null, combat:null, event:null,
    missions:[], eventLastFired:{},
    _pendingLoc: null,
    flags:{dogEncountered:false,dogRescued:false,firstExplore:false,traderMet:false,
           lilySick:false,lilySickDay:0,lilyCured:false,antiviralFound:false,escapeReady:false,gameWon:false},
    log:[], notifications:[],
    dayFade:{active:false,alpha:0,phase:'out',timer:0},
    weather:{ type:'clear', timer:0, nextChange:240, rainAccum:0 },
    zoom:1.0,
    timeScale: 1,
    mouse:{x:0,y:0,down:false,clicked:false,clickX:0,clickY:0},
    keys:{},
    gameOverReason: '',
  });
  initTitle();
  initCharCreate();
  // Reset shelter UI
  shelterUI.activeMenu   = null;
  shelterUI.selectedRoom = null;
  shelterUI.selectedChar = null;
  // Reset event UI
  eventUI.resultText  = null;
  eventUI.resultTimer = 0;
}

// ── Boot ──────────────────────────────────────────────────────────────────────

initTitle();
requestAnimationFrame(gameLoop);
