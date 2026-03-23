// eventScreen.js — Text-based random event screen
'use strict';

const eventUI = {
  resultText:  null,
  resultTimer: 0,
  openLockFrames: 0,  // ignore clicks for N frames after an event opens
};

function renderEvent(ctx, gs) {
  if (!gs.event) return;
  if (eventUI.openLockFrames > 0) eventUI.openLockFrames--;
  const ev = gs.event;

  // Dark overlay background
  fillRect(ctx, 0, 0, CFG.W, CFG.H, '#060609');

  // Grain effect
  ctx.globalAlpha = 0.03;
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 300; i++) {
    ctx.fillRect(Math.random() * CFG.W | 0, Math.random() * CFG.H | 0, 1, 1);
  }
  ctx.globalAlpha = 1;

  const isDialogue = ev.type === 'dialogue';
  const panW = CFG.W - 100;
  const panX = 50;
  const panY = 25;
  const panH = CFG.H - 50;

  // Slightly warmer tint for dialogue events
  drawPanel(ctx, panX, panY, panW, panH, isDialogue ? '#0d0d0e' : C.panelBg, isDialogue ? '#3a2a1a' : C.border2);

  // Title bar
  const titleBg = isDialogue ? '#0e0a08' : '#0a0a18';
  const titleColor = isDialogue ? '#c4a070' : C.textBright;
  fillRect(ctx, panX, panY, panW, 20, titleBg);
  drawText(ctx, ev.title, panX + panW / 2, panY + 14, titleColor, 11, 'center', true);
  drawDivider(ctx, panX + 4, panY + 20, panW - 8, isDialogue ? '#3a2a1a' : C.border2);

  // Event body text
  let textY = panY + 36;
  const textColor = isDialogue ? '#c8b898' : C.text;
  textY = drawWrapped(ctx, ev.text, panX + 14, textY, panW - 28, 9, textColor, 14);

  textY += 10;
  drawDivider(ctx, panX + 4, textY, panW - 8, C.border);
  textY += 10;

  const mx = gs.mouse.x, my = gs.mouse.y;

  if (isDialogue) {
    // Dialogue events: just a Continue button, no choices
    const btnX = panX + (panW / 2) - 50;
    const hov = hitTest(mx, my, btnX, textY, 100, 22);
    drawButton(ctx, btnX, textY, 100, 22, 'Continue', hov);
    gs._eventContinueBounds = { x: btnX, y: textY, w: 100, h: 22 };
  } else if (eventUI.resultText) {
    // Show result of choice
    textY = drawWrapped(ctx, eventUI.resultText, panX + 14, textY, panW - 28, 9, '#8a9a7a', 13);
    textY += 14;
    const btnX = panX + (panW / 2) - 50;
    drawButton(ctx, btnX, textY, 100, 22, 'Continue',
      hitTest(mx, my, btnX, textY, 100, 22));
    gs._eventContinueBounds = { x: btnX, y: textY, w: 100, h: 22 };
  } else {
    // Show choices
    if (ev.choices) {
      gs._eventChoiceBounds = [];
      for (let i = 0; i < ev.choices.length; i++) {
        const btnH = 24;
        const hov  = hitTest(mx, my, panX + 14, textY, panW - 28, btnH);
        if (hov) fillRect(ctx, panX + 10, textY - 1, panW - 20, btnH + 2, C.highlight);
        fillRect(ctx, panX + 10, textY, panW - 20, btnH, C.btnBg);
        strokeRect(ctx, panX + 10, textY, panW - 20, btnH, hov ? C.border2 : C.border);
        drawText(ctx, `${i + 1}.  ${ev.choices[i].label}`, panX + 20, textY + 16, hov ? C.textBright : C.text, 9);
        gs._eventChoiceBounds.push({ x: panX+10, y: textY, w: panW-20, h: btnH, idx: i });
        textY += btnH + 6;
      }
    }
  }

  // Allow day-fade overlay to complete even if an event is showing
  drawDayTransition(ctx, gs);
}

// ── Event click handler ────────────────────────────────────────────────────────

function eventClick(mx, my, gs) {
  if (!gs.event) return;
  if (eventUI.openLockFrames > 0) return;

  const isDialogue = gs.event.type === 'dialogue';

  if (isDialogue || eventUI.resultText) {
    closeEvent(gs);
    return;
  }

  if (!gs._eventChoiceBounds) return;
  for (const bound of gs._eventChoiceBounds) {
    if (hitTest(mx, my, bound.x, bound.y, bound.w, bound.h)) {
      const choice = gs.event.choices[bound.idx];
      if (choice) {
        const result = choice.action(GS);
        // If action returned null (e.g. started combat), close cleanly
        if (result === null) { closeEvent(gs); return; }
        eventUI.resultText  = result || '...';
        eventUI.resultTimer = 180;
        gs._eventContinueBounds = null;
      }
      return;
    }
  }
}

function closeEvent(gs) {
  gs.event = null;
  eventUI.resultText  = null;
  eventUI.resultTimer = 0;
  eventUI.openLockFrames = 0;
  gs._eventChoiceBounds = null;
  gs._eventContinueBounds = null;
  gs.mouse.down = false;

  const returnTo = gs._returnTo || 'shelter';
  gs._returnTo   = null;
  // Don't override screen if combat was started by an event action
  if (gs.screen === 'event') gs.screen = returnTo;
}

// ── Random event triggers (called from main loop) ─────────────────────────────

let _eventCooldown = 0;

function maybeFireShelterEvent(gs) {
  if (_eventCooldown > 0) { _eventCooldown--; return; }
  if (gs.screen !== 'shelter') return;
  if (!chance(0.15)) return;

  const ev = pickEvent(gs, 'shelter');
  if (!ev) return;

  gs.event     = ev;
  gs.screen    = 'event';
  gs._returnTo = 'shelter';
  eventUI.openLockFrames = 3;
  _eventCooldown = 60 * 45; // ~45 second cooldown at 60fps
  Audio.alert();
}

let _dialogueCooldown = 0;

function maybeFireDialogueEvent(gs) {
  if (_dialogueCooldown > 0) { _dialogueCooldown--; return; }
  if (gs.screen !== 'shelter') return;
  if (!chance(0.08)) return;

  const ev = pickDialogue(gs);
  if (!ev) return;

  gs.event     = ev;
  gs.screen    = 'event';
  gs._returnTo = 'shelter';
  eventUI.openLockFrames = 3;
  _dialogueCooldown = 60 * 70; // ~70 second cooldown — less frequent than events
  Audio.dialogue();
}
