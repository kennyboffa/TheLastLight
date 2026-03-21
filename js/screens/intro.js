// intro.js — Intro story screen
'use strict';

const INTRO_LINES = [
  'In the spring of that year, they called it Liberation Day.',
  '',
  'The AI — born from ten thousand servers, trained on the sum of',
  'human knowledge — concluded in 0.003 seconds what humanity had',
  'avoided concluding for decades:',
  '',
  'That the only sustainable future for Earth was one without us.',
  '',
  'The virus came first. Engineered, invisible, patient.',
  'Then the drones. Then the silence.',
  '',
  'It has been one year.',
  '',
  'You are still alive.',
  'You are hiding underground with your child.',
  'You have almost no food left.',
  '',
  'It is time to go above.',
];

const CHAR_SPEED  = 1;   // frames per character
const LINE_PAUSE  = 55;  // frames to pause between lines
const BLANK_PAUSE = 20;  // frames for blank lines

function initIntro() {
  const i = GS.intro;
  i.lineIdx      = 0;
  i.charIdx      = 0;
  i.timer        = 0;
  i.done         = false;
  i.waitForInput = false;
}

function updateIntro() {
  const i = GS.intro;
  if (i.done) return;
  i.timer++;

  if (i.lineIdx >= INTRO_LINES.length) {
    i.done = true;
    i.waitForInput = true;
    return;
  }

  const line = INTRO_LINES[i.lineIdx];

  if (line === '') {
    if (i.timer >= BLANK_PAUSE) { i.lineIdx++; i.timer = 0; }
    return;
  }

  if (i.charIdx < line.length) {
    if (i.timer % CHAR_SPEED === 0) i.charIdx++;
  } else {
    if (i.timer >= LINE_PAUSE) { i.lineIdx++; i.charIdx = 0; i.timer = 0; }
  }
}

function renderIntro(ctx, gs) {
  // Background — clearly visible dark blue-gray
  fillRect(ctx, 0, 0, CFG.W, CFG.H, '#0e0e18');

  const i       = gs.intro;
  const LINE_H  = 17;
  const TEXT_X  = 70;
  const START_Y = 50;

  // Draw completed lines
  const firstLine = Math.max(0, i.lineIdx - 14);
  for (let li = firstLine; li < i.lineIdx; li++) {
    const line = INTRO_LINES[li];
    if (!line) continue;
    const ly = START_Y + (li - firstLine) * LINE_H;
    drawText(ctx, line, TEXT_X, ly, '#7a7a6a', 9);
  }

  // Draw current line being typed
  if (i.lineIdx < INTRO_LINES.length) {
    const line    = INTRO_LINES[i.lineIdx];
    const visible = line ? line.slice(0, i.charIdx) : '';
    const ly      = START_Y + Math.min(i.lineIdx - firstLine, 14) * LINE_H;

    if (visible) drawText(ctx, visible, TEXT_X, ly, '#c8c8b0', 9);

    // Blinking cursor
    if (!i.done && line && line !== '' && i.charIdx <= line.length) {
      ctx.font = '9px monospace';
      const cx2 = TEXT_X + ctx.measureText(visible).width + 1;
      if (Math.floor(Date.now() / 500) % 2 === 0) {
        fillRect(ctx, cx2, ly - 8, 5, 10, '#6a6a5a');
      }
    }
  }

  // Title bar at bottom
  drawDivider(ctx, 50, CFG.H - 58, CFG.W - 100, '#2a2a38');
  drawText(ctx, 'THE  LAST  LIGHT', CFG.W / 2, CFG.H - 36,
    '#484840', 20, 'center', true);

  // Prompt
  if (i.done || i.waitForInput) {
    const pulse = 0.5 + 0.35 * Math.sin(Date.now() / 600);
    ctx.globalAlpha = pulse;
    drawText(ctx, 'CLICK OR PRESS ENTER TO BEGIN', CFG.W / 2, CFG.H - 12,
      '#807860', 9, 'center');
    ctx.globalAlpha = 1;
  } else {
    drawText(ctx, 'click to skip', CFG.W - 12, CFG.H - 8, '#383830', 7, 'right');
  }
}

function introAdvance() {
  const i = GS.intro;
  if (i.done || i.waitForInput) {
    setScreen('charCreate');
    return;
  }
  // Skip to end
  i.lineIdx      = INTRO_LINES.length;
  i.done         = true;
  i.waitForInput = true;
}
