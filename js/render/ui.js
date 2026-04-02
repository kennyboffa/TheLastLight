// ui.js — Reusable UI components
'use strict';

const PANEL_X = CFG.W - CFG.PANEL_W;

// ── Stats panel (right side) ──────────────────────────────────────────────────

function drawStatsPanel(ctx, gs) {
  const x = PANEL_X, w = CFG.PANEL_W, h = CFG.H;

  // Background
  fillRect(ctx, x, 0, w, h, C.panelBg);
  strokeRect(ctx, x, 0, w, h, C.border);

  let y = 8;

  // Day / Time
  drawText(ctx, `DAY ${gs.day}`, x + w/2, y + 13, C.textBright, 14, 'center', true);
  y += 18;
  const timeStr = formatTime(gs.time);
  drawText(ctx, timeStr, x + w/2, y + 11, C.textDim, 12, 'center');
  y += 15;
  drawDivider(ctx, x + 6, y, w - 12, C.border2);
  y += 6;

  // ── Parent stats ───────────────────────────────────────────────────────────
  const pLvl = gs.parent.level || 1;
  const pRowStart = y;
  const isPSel = typeof shelterUI !== 'undefined' && shelterUI.selectedChar === 'parent';
  if (isPSel) fillRect(ctx, x + 4, y, w - 8, 8, '#1a1a2a');
  drawText(ctx, gs.parent.name.toUpperCase() + ' (' + parentTitle() + ')', x + 8, y + 9, isPSel ? '#aaaaff' : C.text, 10, 'left', true);
  drawText(ctx, `Lv.${pLvl}`, x + w - 8, y + 9, '#d4aa40', 9, 'right', true);
  y += 12;

  y = drawPersonStats(ctx, gs.parent, x + 8, y, w - 16);
  y += 4;
  gs._parentStatBounds = { x, y: pRowStart, w, h: y - pRowStart };
  drawDivider(ctx, x + 6, y, w - 12, C.border2);
  y += 5;

  // ── Child stats ────────────────────────────────────────────────────────────
  const chLvl = gs.child.level || 1;
  const chRowStart = y;
  const isCSel = typeof shelterUI !== 'undefined' && shelterUI.selectedChar === 'child';
  if (isCSel) fillRect(ctx, x + 4, y, w - 8, 8, '#2a1a2a');
  drawText(ctx, gs.child.name.toUpperCase() + ' (Child)', x + 8, y + 9, isCSel ? '#ffaaff' : '#a0809a', 10, 'left', true);
  drawText(ctx, `Lv.${chLvl}`, x + w - 8, y + 9, '#d4aa40', 9, 'right', true);
  y += 12;
  y = drawPersonStats(ctx, gs.child, x + 8, y, w - 16);
  y += 4;
  gs._childStatBounds = { x, y: chRowStart, w, h: y - chRowStart };

  // Survivors (hidden during combat — player fights alone)
  if (gs.survivors.length > 0 && gs.screen !== 'combat') {
    gs._survivorStatBounds = [];
    drawDivider(ctx, x + 6, y, w - 12, C.border2);
    y += 5;
    for (const s of gs.survivors) {
      const rowStartY = y;
      if (s.onMission) {
        // Stats hidden while away — just show name and status
        drawText(ctx, s.name, x + 8, y + 9, '#505060', 10);
        y += 12;
        drawText(ctx, 'ON MISSION', x + w / 2, y + 5, '#3a5a78', 9, 'center');
        y += 14;
        gs._survivorStatBounds.push({ id: s.id, x, y: rowStartY, w, h: y - rowStartY });
        continue;
      } else {
        const isSel = typeof shelterUI !== 'undefined' && shelterUI.selectedChar === s.id;
        if (isSel) fillRect(ctx, x + 4, y, w - 8, 8, '#1a2a1a');
        drawText(ctx, `${s.name}  Lv.${s.level || 1}`, x + 8, y + 9, isSel ? '#aaffaa' : C.textDim, 10);
        y += 10;
        y = drawPersonStats(ctx, s, x + 8, y, w - 16, true);
        y += 3;
      }
      gs._survivorStatBounds.push({ id: s.id, x, y: rowStartY, w, h: y - rowStartY });
    }
  }

  // Dog
  if (gs.dog && gs.dog.alive) {
    drawDivider(ctx, x + 6, y, w - 12, C.border2);
    y += 5;
    drawText(ctx, gs.dog.name + ' (Dog)', x + 8, y + 8, '#9a7040', 8);
    y += 11;
    drawStatBar(ctx, x+8, y, w-16, 6, gs.dog.health,     100, '#aa6622', null, 'HP');
    y += 8;
    drawStatBar(ctx, x+8, y, w-16, 6, 100-gs.dog.hunger, 100, C.hunger,  null, 'Fed');
    y += 10;
  }

  // ── SUPPLIES mini-panel ───────────────────────────────────────────────────
  const suppliesY = h - 112;
  drawDivider(ctx, x + 6, suppliesY - 4, w - 12, C.border2);
  drawText(ctx, 'SUPPLIES', x + 8, suppliesY + 9, C.textDim, 9, 'left', true);

  // Count food items
  const foodIds = ['canned_beans','canned_soup','canned_meat','canned_fruit','energy_bar',
    'cooked_meat','heated_beans','heated_soup','mushroom','dried_berries','jerky','raw_meat'];
  const waterIds = ['water_bottle','purified_water','dirty_water'];
  let totalFood = 0, totalWater = 0;
  for (const fid of foodIds)  totalFood  += countInInventory(gs.shelter.storage, fid);
  for (const wid of waterIds) totalWater += countInInventory(gs.shelter.storage, wid);

  const foodColor  = totalFood  > 10 ? '#3aaa50' : totalFood  >= 5 ? '#cc8830' : '#cc2828';
  const waterColor = totalWater > 10 ? '#2878cc' : totalWater >= 5 ? '#cc8830' : '#cc2828';

  drawText(ctx, `Food: ${totalFood}`, x + 8,       suppliesY + 22, foodColor,  9, 'left');
  drawText(ctx, `Water: ${totalWater}`, x + w / 2, suppliesY + 22, waterColor, 9, 'left');

  // ── Suspicion meter ────────────────────────────────────────────────────────
  const suspY = h - 80;
  drawDivider(ctx, x + 6, suspY - 6, w - 12, C.border2);
  drawText(ctx, 'AI SUSPICION', x + 8, suspY + 10, gs.suspicion > 70 ? C.textDanger : C.textDim, 10, 'left', true);
  const suspColor = gs.suspicion < 40 ? '#2a6a2a' : gs.suspicion < 70 ? '#8a6a10' : '#aa2020';
  drawStatBar(ctx, x+8, suspY + 12, w - 16, 10, gs.suspicion, 100, suspColor, null);
  const suspLabel = gs.suspicion < 30 ? 'LOW' : gs.suspicion < 60 ? 'MODERATE' : gs.suspicion < 85 ? 'HIGH' : 'CRITICAL';
  drawText(ctx, suspLabel, x + w/2, suspY + 12 + 8, C.textDim, 8, 'center');
}

function drawPersonStats(ctx, person, x, y, w, compact) {
  const bh  = compact ? 7 : 8;
  const gap = compact ? 11 : 12;
  const lblW = 36;

  const hpPct   = person.health / person.maxHealth;
  const hpColor = hpPct > 0.6 ? C.hp : hpPct > 0.3 ? '#cc6020' : '#dd1010';
  const dcolor  = person.depression > 70 ? '#9944dd' : C.depression;

  const stats = [
    { label: 'HP',     value: person.health,     max: person.maxHealth, color: hpColor },
    { label: 'Hunger', value: person.hunger,      max: 100, color: C.hunger },
    { label: 'Thirst', value: person.thirst,      max: 100, color: C.thirst },
    { label: 'Tired',  value: person.tiredness,   max: 100, color: C.tiredness },
    { label: 'Mood',   value: person.depression,  max: 100, color: dcolor },
  ];

  for (const s of stats) {
    drawText(ctx, s.label, x + lblW - 2, y + bh, C.textDim, 8, 'right');
    drawStatBar(ctx, x + lblW, y, w - lblW, bh, s.value, s.max, s.color, null, true);
    y += gap;
  }

  // Compact warning line
  const warns = [];
  if (person.hunger > CFG.HUNGER_WARN)   warns.push('HUNGRY');
  if (person.thirst > CFG.THIRST_WARN)   warns.push('THIRSTY');
  if (person.tiredness > 75)             warns.push('TIRED');
  if (person.depression > CFG.DEPR_WARN) warns.push('DEPR');
  if (person.infected)                   warns.push('INFECTED');
  if (warns.length > 0) {
    drawText(ctx, warns.join(' · '), x + lblW, y, '#cc7730', 6);
    y += 8;
  }

  return y + (compact ? 0 : 3);
}

// ── Notification popups (floating messages) ───────────────────────────────────

function drawNotifications(ctx, gs, startX, startY, centered) {
  const notifs = gs.notifications.filter(n => n.ttl > 0);
  const nx     = startX  !== undefined ? startX  : 10;
  let   ny     = startY  !== undefined ? startY  : 20;
  const align  = centered ? 'center' : 'left';
  for (const n of notifs) {
    const typeColor = n.type === 'danger' ? C.textDanger
                    : n.type === 'warn'   ? C.textWarn
                    : n.type === 'good'   ? C.textGood
                    : C.text;
    drawTextShadow(ctx, n.text, nx, ny, typeColor, '#000000aa', 11, align);
    ny += 15;
    n.ttl--;
  }
  gs.notifications = notifs;
}

// ── Action button grid ─────────────────────────────────────────────────────────

function drawActionButtons(ctx, buttons, mx, my) {
  const results = {};
  for (const btn of buttons) {
    const hovered = hitTest(mx, my, btn.x, btn.y, btn.w, btn.h);
    drawButton(ctx, btn.x, btn.y, btn.w, btn.h, btn.label, hovered, btn.active, btn.disabled);
    results[btn.id] = { hovered, x: btn.x, y: btn.y, w: btn.w, h: btn.h };
  }
  return results;
}

// ── Inventory list ────────────────────────────────────────────────────────────

function drawInventoryList(ctx, inv, x, y, w, h, title, scrollY, mx, my, selectedIdx) {
  // Panel background
  drawPanel(ctx, x, y, w, h, C.panelBg2, C.border2);

  // Title
  fillRect(ctx, x, y, w, 14, C.panelBg);
  drawText(ctx, title || 'INVENTORY', x + 6, y + 10, C.textBright, 9, 'left', true);
  drawDivider(ctx, x+2, y+14, w-4, C.border);

  const rowH = 18;
  const visRows = Math.floor((h - 18) / rowH);
  const startIdx = Math.floor(scrollY / rowH);

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y + 15, w, h - 15);
  ctx.clip();

  let itemY = y + 15 - (scrollY % rowH);

  const clickResults = [];

  for (let i = startIdx; i < Math.min(inv.length, startIdx + visRows + 1); i++) {
    const slot = inv[i];
    if (!slot) continue;
    const def = getItemDef(slot.id);
    if (!def) continue;

    const hov = hitTest(mx, my, x, itemY, w, rowH);
    const sel = (selectedIdx !== undefined && selectedIdx !== null && i === selectedIdx);
    if (sel)  fillRect(ctx, x, itemY, w, rowH, '#1a2a3a');
    else if (hov) fillRect(ctx, x, itemY, w, rowH, C.highlight);

    // Type colour strip
    fillRect(ctx, x + 2, itemY + 2, 3, rowH - 4, itemTypeColor(def.type));

    // Name + qty
    const label = slot.qty > 1 ? `${def.name} x${slot.qty}` : def.name;
    drawText(ctx, label, x + 10, itemY + rowH - 5, sel ? '#aaddff' : hov ? C.textBright : C.text, 9);

    // Weight
    const wt = `${(def.weight * slot.qty).toFixed(1)}kg`;
    drawText(ctx, wt, x + w - 4, itemY + rowH - 5, C.textDim, 7, 'right');

    clickResults.push({ idx: i, slot, y1: itemY, y2: itemY + rowH });
    itemY += rowH;
  }

  ctx.restore();

  // Scroll indicator
  if (inv.length > visRows) {
    const trackH = h - 18;
    const thumbH = Math.max(20, trackH * visRows / inv.length);
    const thumbY = y + 16 + (scrollY / (inv.length * rowH - h)) * (trackH - thumbH);
    fillRect(ctx, x + w - 4, y + 16, 3, trackH, C.border2);
    fillRect(ctx, x + w - 4, thumbY, 3, thumbH, '#555565');
  }

  return clickResults;
}

// ── Dialog / modal panel ──────────────────────────────────────────────────────

function drawModal(ctx, x, y, w, h, title) {
  // Shadow
  fillRect(ctx, x + 4, y + 4, w, h, '#000000', 0.5);
  // Body
  drawPanel(ctx, x, y, w, h, C.panelBg, C.border2);
  // Title bar
  fillRect(ctx, x, y, w, 20, '#0e0e20');
  drawText(ctx, title || '', x + w/2, y + 14, C.textBright, 11, 'center', true);
  drawDivider(ctx, x+2, y+20, w-4, C.border2);
}

// ── In-game log strip ─────────────────────────────────────────────────────────

function drawLog(ctx, gs, x, y, w, h) {
  fillRect(ctx, x, y, w, h, C.panelBg, 0.9);
  strokeRect(ctx, x, y, w, h, C.border);
  const maxLines = Math.floor((h - 4) / 10);
  let ly = y + 10;
  for (let i = 0; i < Math.min(gs.log.length, maxLines); i++) {
    const entry = gs.log[i];
    const col = entry.type === 'danger' ? C.textDanger
              : entry.type === 'good'   ? C.textGood
              : entry.type === 'warn'   ? C.textWarn
              : entry.type === 'info'   ? '#8888cc'
              : C.textDim;
    drawText(ctx, entry.text, x + 4, ly, col, 8);
    ly += 10;
  }
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function drawTooltip(ctx, itemId, mx, my) {
  const def = getItemDef(itemId);
  if (!def) return;

  const lines = [];
  lines.push({ text: def.name, color: C.textBright, size: 9, bold: true });
  if (def.weight) lines.push({ text: `Weight: ${def.weight}kg`, color: C.textDim, size: 8 });
  if (def.desc)   lines.push({ text: def.desc, color: C.text, size: 8, wrap: 140 });
  if (def.hunger  && def.hunger < 0)  lines.push({ text: `Hunger: ${def.hunger}`,     color: C.hunger,    size: 8 });
  if (def.thirst  && def.thirst < 0)  lines.push({ text: `Thirst: ${def.thirst}`,     color: C.thirst,    size: 8 });
  if (def.health  && def.health > 0)  lines.push({ text: `Health: +${def.health}`,    color: C.hp,        size: 8 });
  if (def.depression && def.depression < 0) lines.push({ text: `Mood: ${def.depression}`, color: C.depression, size: 8 });
  if (def.damage) lines.push({ text: `Damage: ${def.damage[0]}-${def.damage[1]}`, color: '#cc8888', size: 8 });

  const tw = 160, lh = 12;
  const th = lines.length * lh + 10;
  let tx = Math.min(mx + 10, CFG.W - tw - 5);
  let ty = Math.max(5, my - th - 5);

  fillRect(ctx, tx, ty, tw, th, C.panelBg);
  strokeRect(ctx, tx, ty, tw, th, C.border2);

  let lineY = ty + 11;
  for (const line of lines) {
    drawText(ctx, line.text, tx + 6, lineY, line.color, line.size || 8, 'left', line.bold);
    lineY += lh;
  }
}

// ── Day transition overlay ────────────────────────────────────────────────────

function drawDayTransition(ctx, gs) {
  const df = gs.dayFade;
  if (!df.active) return;

  df.timer++;

  if (df.phase === 'out') {
    df.alpha = Math.min(1, df.timer / 60);
    drawFade(ctx, df.alpha);
    if (df.alpha >= 1) {
      df.phase = 'text';
      df.timer = 0;
      advanceDay(gs);
    }
  } else if (df.phase === 'text') {
    drawFade(ctx, 1);
    if (df.message) {
      // Late return: show custom dramatic message
      drawText(ctx, `Day ${gs.day}`, CFG.W / 2, CFG.H / 2 - 50, C.textBright, 20, 'center', true);
      const lines = df.message.split('\n');
      let ly = CFG.H / 2 - 10;
      for (const line of lines) {
        drawText(ctx, line, CFG.W / 2, ly, '#cc4444', 9, 'center');
        ly += 16;
      }
      if (df.timer > 180) { df.phase = 'in'; df.timer = 0; df.message = null; }
    } else {
      drawText(ctx, `Day ${gs.day}`, CFG.W / 2, CFG.H / 2 - 8, C.textBright, 20, 'center', true);
      drawText(ctx, formatTime(gs.time), CFG.W / 2, CFG.H / 2 + 14, C.textDim, 10, 'center');
      if (df.timer > 100) { df.phase = 'in'; df.timer = 0; }
    }
  } else if (df.phase === 'in') {
    df.alpha = Math.max(0, 1 - df.timer / 60);
    drawFade(ctx, df.alpha);
    if (df.alpha <= 0) {
      df.active = false;
      df.alpha  = 0;
      df.phase  = 'out';
      df.timer  = 0;
    }
  }
}

// ── Game over screen ──────────────────────────────────────────────────────────

function drawGameOver(ctx, gs) {
  fillRect(ctx, 0, 0, CFG.W, CFG.H, '#000000');

  const cx = CFG.W / 2;
  drawText(ctx, 'GAME OVER', cx, 80, '#441111', 40, 'center', true);
  drawText(ctx, gs.gameOverReason || 'You did not survive.', cx, 128, C.textDim, 10, 'center');
  drawText(ctx, `You survived ${gs.day} day${gs.day !== 1 ? 's' : ''}.`, cx, 146, C.textDim, 9, 'center');

  const mx = gs.mouse.x, my = gs.mouse.y;

  // Autosave option — shown if an autosave exists
  const autoInfo = (typeof getAutosaveInfo === 'function') && getAutosaveInfo();
  let btnY = 170;
  if (autoInfo) {
    const abx = cx - 90, abw = 180, abh = 24;
    const autoBtnHov = hitTest(mx, my, abx, btnY, abw, abh);
    drawButton(ctx, abx, btnY, abw, abh, `Continue — Day ${autoInfo.day}`, autoBtnHov, false, false);
    drawText(ctx, '(autosave)', cx, btnY + abh + 10, '#555566', 7, 'center');
    btnY += abh + 20;
    gs._gameOverAutoBtn = { x: abx, y: btnY - abh - 20, w: abw, h: abh };
  } else {
    gs._gameOverAutoBtn = null;
  }

  const bx = cx - 55, by = btnY + (autoInfo ? 10 : 0);
  drawButton(ctx, bx, by, 110, 24, 'New Game', hitTest(mx, my, bx, by, 110, 24), false, false);
  gs._gameOverNewBtn = { x: bx, y: by, w: 110, h: 24 };
}

function drawGameWon(ctx, gs) {
  fillRect(ctx, 0, 0, CFG.W, CFG.H, '#04060a');

  // Grain overlay
  ctx.globalAlpha = 0.025;
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 200; i++) {
    ctx.fillRect(Math.random() * CFG.W | 0, Math.random() * CFG.H | 0, 1, 1);
  }
  ctx.globalAlpha = 1;

  const cx  = CFG.W / 2;
  const panW = CFG.W - 80;
  const panX = 40;
  drawPanel(ctx, panX, 14, panW, CFG.H - 28, '#060a06', '#3a6a3a');
  fillRect(ctx, panX, 14, panW, 22, '#060e06');
  drawText(ctx, 'THE LAST LIGHT', cx, 29, '#6ab46a', 11, 'center', true);
  drawDivider(ctx, panX + 4, 36, panW - 8, '#3a6a3a');

  const endText =
`You left before dawn. You didn't look back.

Lily walked beside you the whole way, her pack too big for her frame, her steps steady. She didn't ask if you were scared. You didn't ask her either. Some things you keep to yourselves.

The rail yards were empty. The freight tunnel was dark and cold and longer than you expected. You held her hand through the worst of it and she held yours.

On the other side — light. Real light, from fires and windows and people moving in the early morning.

The Hollow was real.

A woman at the perimeter gate looked at you both for a long moment, then stepped aside. "We've got a doctor," she said. "Food in an hour. You can sleep."

You looked at Lily. She looked at you.

"We made it," she said.

Not a question. She never made it a question.

You stayed.

— — —

The world outside was still broken. The AI was still searching. The drones still flew their grid patterns over the ruins of the old city. Nothing had been resolved. Nothing had been fixed.

But here, for now, there was warmth. There was safety. There was a child who was going to be okay.

Maybe that was enough to start with.

Maybe, somewhere, there was a sequel to all of this.

For now — you were here. Both of you. Together.

That was everything.`;

  let ty = 52;
  ty = drawWrapped(ctx, endText, panX + 20, ty, panW - 40, 8, '#c0d4b0', 14);

  const mx = gs.mouse.x, my = gs.mouse.y;
  const bx = cx - 55, by = CFG.H - 38;
  drawButton(ctx, bx, by, 110, 22, 'Play Again', hitTest(mx, my, bx, by, 110, 22));
}
