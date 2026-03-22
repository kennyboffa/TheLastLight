// shelter.js — Shelter management screen
'use strict';

// Room layout constants
const ROOM_GRID = [
  ['main','bedroom','storage'],
  ['workshop','infirmary','security'],
];
const MAIN_W = CFG.W - CFG.PANEL_W;  // 440

// Compute room rect from grid col/row
function roomRect(col, row) {
  const totalW = ROOM_GRID[0].length * CFG.ROOM_W + (ROOM_GRID[0].length - 1) * CFG.ROOM_GAP;
  const startX = Math.floor((MAIN_W - totalW) / 2);
  const x = startX + col * (CFG.ROOM_W + CFG.ROOM_GAP);
  const y = CFG.SURFACE_H + 12 + row * (CFG.ROOM_H + CFG.ROOM_GAP);
  return { x, y, w: CFG.ROOM_W, h: CFG.ROOM_H };
}

// ── Shelter action menus ───────────────────────────────────────────────────────

let shelterUI = {
  activeMenu: null,    // null | 'room' | 'crafting' | 'storage' | 'cooking' | 'char'
  selectedRoom: null,
  contextItem: null,
  storageScroll: 0,
  craftingScroll: 0,
  menuX: 0, menuY: 0,
  tooltip: null,
  tooltipX: 0, tooltipY: 0,
  selectedChar: null,    // null | 'parent' | 'child' | survivor.id
  charPanelX: 60, charPanelY: 100,
};

function renderShelter(ctx, gs) {
  // Background
  fillRect(ctx, 0, 0, MAIN_W, CFG.H, C.bg);

  // Surface scene
  drawSurface(ctx, gs.day * 30);
  drawHatch(ctx, MAIN_W / 2, CFG.SURFACE_H - 2);

  // Weather overlay on surface
  drawShelterWeather(ctx, gs);

  // Drone patrol above shelter
  drawDronePatrol(ctx, gs);

  // Earth fill below surface
  drawEarth(ctx, 0, CFG.SURFACE_H, MAIN_W, CFG.H - CFG.SURFACE_H);

  // Shaft from hatch to first room
  const mainRect = roomRect(0, 0);
  fillRect(ctx, MAIN_W/2 - 6, CFG.SURFACE_H - 2, 12, 14, C.metal);

  // Draw rooms
  const mx = gs.mouse.x, my = gs.mouse.y;
  for (let row = 0; row < ROOM_GRID.length; row++) {
    for (let col = 0; col < ROOM_GRID[row].length; col++) {
      const roomId = ROOM_GRID[row][col];
      const room   = getRoom(roomId);
      const def    = ROOM_DEFS[roomId];
      const r      = roomRect(col, row);
      const sel    = shelterUI.selectedRoom === roomId;
      const hov    = !shelterUI.activeMenu && hitTest(mx, my, r.x, r.y, r.w, r.h);

      drawRoomInterior(ctx, r.x, r.y, r.w, r.h, room.unlocked, sel || hov);

      if (room.unlocked) {
        drawText(ctx, def.name, r.x + r.w/2, r.y + 12, C.textDim, 8, 'center', true);
      } else {
        drawText(ctx, def.name, r.x + r.w/2, r.y + r.h/2 - 2, '#303035', 8, 'center', false);
        drawText(ctx, '[ BUILD ]', r.x + r.w/2, r.y + r.h/2 + 10, '#2a2a35', 7, 'center');
      }

      // Building progress bar
      if (room.building) {
        const prog = gs.parent.taskProgress / gs.parent.taskDuration;
        drawStatBar(ctx, r.x + 4, r.y + r.h - 10, r.w - 8, 5, prog * 100, 100, C.textGood);
        drawText(ctx, 'BUILDING...', r.x + r.w/2, r.y + r.h - 14, C.textWarn, 7, 'center');
      }

      // Shaft/connector between rows
      if (row === 0 && col === 0 && ROOM_GRID.length > 1) {
        const lowerRect = roomRect(0, 1);
        fillRect(ctx, r.x + r.w/2 - 5, r.y + r.h, 10, lowerRect.y - (r.y + r.h), C.metal);
      }
    }
  }

  // Connectors between columns (same row)
  for (let row = 0; row < ROOM_GRID.length; row++) {
    for (let col = 0; col < ROOM_GRID[row].length - 1; col++) {
      const r1 = roomRect(col, row);
      const r2 = roomRect(col+1, row);
      fillRect(ctx, r1.x + r1.w, r1.y + r1.h/2 - 5, r2.x - (r1.x + r1.w), 10, C.metal);
    }
  }

  // Characters in main room
  drawShelterCharacters(ctx, gs);

  // Right stats panel
  drawStatsPanel(ctx, gs);

  // Weather / raincatcher badge
  drawWeatherBadge(ctx, gs);

  // Bottom controls bar
  drawShelterControls(ctx, gs, mx, my);

  // Active menu overlay
  if (shelterUI.activeMenu) drawShelterMenu(ctx, gs, mx, my);

  // Tooltip
  if (shelterUI.tooltip) drawTooltip(ctx, shelterUI.tooltip, shelterUI.tooltipX, shelterUI.tooltipY);

  // Notifications
  drawNotifications(ctx, gs);

  // Day transition
  drawDayTransition(ctx, gs);
}

// ── Character idle wandering ──────────────────────────────────────────────────

function updateCharWander(gs) {
  const speed = 0.45;

  function wander(who, defaultX) {
    if (who.shelterX === undefined) {
      who.shelterX       = defaultX;
      who.shelterTargetX = defaultX;
      who.wanderTimer    = randInt(60, 300);
    }
    if (who.isSleeping || who.task) return;  // busy chars stay put
    who.wanderTimer--;
    if (who.wanderTimer <= 0) {
      who.shelterTargetX = randInt(10, 195);
      who.wanderTimer    = randInt(150, 480);
    }
    const dx = who.shelterTargetX - who.shelterX;
    if (Math.abs(dx) > 0.5) {
      who.shelterX += Math.sign(dx) * Math.min(speed, Math.abs(dx));
      who.facing    = dx > 0 ? 1 : -1;
    }
  }

  if (!gs.parent.isExploring) wander(gs.parent, 28);
  wander(gs.child, 52);
  gs.survivors.forEach((s, i) => { if (!s.isExploring) wander(s, 82 + i * 26); });
}

// ── Characters in rooms ───────────────────────────────────────────────────────

function drawShelterCharacters(ctx, gs) {
  updateCharWander(gs);

  const p     = gs.parent;
  const ch    = gs.child;
  const mainR = roomRect(0, 0);
  const groundY = mainR.y + mainR.h - 12;

  // Animate
  p.animTimer++;
  ch.animTimer++;
  if (p.animTimer  % 30 === 0) p.animFrame++;
  if (ch.animTimer % 25 === 0) ch.animFrame++;

  gs._charHitBounds = [];

  // ── Parent ──────────────────────────────────────────────────────────────────
  if (!p.isExploring) {
    const px  = Math.round(p.shelterX !== undefined ? p.shelterX : 28);
    const sel = shelterUI.selectedChar === 'parent';
    if (sel) {
      ctx.save(); ctx.globalAlpha = 0.18;
      fillRect(ctx, px - 10, groundY - 24, 22, 28, '#8888ff');
      ctx.globalAlpha = 1; ctx.restore();
      strokeRect(ctx, px - 10, groundY - 24, 22, 28, '#8888ff');
    }
    drawParent(ctx, px, groundY, 2, p.facing, p.isSleeping ? 0 : p.animFrame, p.gender);
    if (p.isSleeping) drawText(ctx, 'zzz', px + 10, groundY - 26, C.textDim, 7);
    if (p.isWorking && p.task) {
      const prog = p.taskProgress / p.taskDuration;
      drawStatBar(ctx, px - 10, groundY - 29, 30, 4, prog * 100, 100, C.textGood);
      drawText(ctx, 'working', px, groundY - 32, C.textDim, 6, 'center');
    }
    drawText(ctx, p.name, px, groundY - 26, sel ? '#aaaaff' : C.textDim, 6, 'center');
    gs._charHitBounds.push({ id: 'parent', x: px - 10, y: groundY - 24, w: 22, h: 28 });
  }

  // ── Child ───────────────────────────────────────────────────────────────────
  const cpx  = Math.round(ch.shelterX !== undefined ? ch.shelterX : 52);
  const csel = shelterUI.selectedChar === 'child';
  if (csel) {
    ctx.save(); ctx.globalAlpha = 0.18;
    fillRect(ctx, cpx - 8, groundY - 20, 18, 24, '#ff88ff');
    ctx.globalAlpha = 1; ctx.restore();
    strokeRect(ctx, cpx - 8, groundY - 20, 18, 24, '#cc88cc');
  }
  drawChild(ctx, cpx, groundY, 2, ch.facing, ch.animFrame);
  if (ch.isSleeping) drawText(ctx, 'zzz', cpx + 8, groundY - 20, C.textDim, 7);
  drawText(ctx, ch.name, cpx, groundY - 22, csel ? '#ffaaff' : C.textDim, 6, 'center');
  gs._charHitBounds.push({ id: 'child', x: cpx - 8, y: groundY - 20, w: 18, h: 24 });

  // ── Dog ─────────────────────────────────────────────────────────────────────
  if (gs.dog && gs.dog.alive) {
    drawDog(ctx, Math.round(cpx + 22), groundY, 2, 1, ch.animFrame);
  }

  // ── Survivors ───────────────────────────────────────────────────────────────
  gs.survivors.forEach((s, i) => {
    s.animTimer = (s.animTimer || 0) + 1;
    if (s.animTimer % 28 === 0) s.animFrame = (s.animFrame || 0) + 1;
    const sx   = Math.round(s.shelterX !== undefined ? s.shelterX : 82 + i * 26);
    const ssel = shelterUI.selectedChar === s.id;
    if (ssel) {
      ctx.save(); ctx.globalAlpha = 0.18;
      fillRect(ctx, sx - 9, groundY - 22, 20, 26, '#88ff88');
      ctx.globalAlpha = 1; ctx.restore();
      strokeRect(ctx, sx - 9, groundY - 22, 20, 26, '#88cc88');
    }
    drawSurvivor(ctx, sx, groundY, 2, s.facing, s.animFrame, i);
    if (s.isSleeping) drawText(ctx, 'zzz', sx + 8, groundY - 22, C.textDim, 7);
    if (s.task && s.taskDuration > 0) {
      const prog = s.taskProgress / s.taskDuration;
      drawStatBar(ctx, sx - 9, groundY - 27, 24, 3, prog * 100, 100, C.textGood);
    }
    drawText(ctx, s.name, sx, groundY - 24, ssel ? '#aaffaa' : C.textDim, 6, 'center');
    gs._charHitBounds.push({ id: s.id, x: sx - 9, y: groundY - 22, w: 20, h: 26 });
  });
}

// ── Character task panel ──────────────────────────────────────────────────────

function drawCharPanel(ctx, gs, mx, my) {
  const sel = shelterUI.selectedChar;
  if (!sel) return;

  let who, role, selColor;
  if (sel === 'parent') {
    who = gs.parent; role = parentTitle(); selColor = '#8888ff';
  } else if (sel === 'child') {
    who = gs.child; role = 'Child'; selColor = '#cc88cc';
  } else {
    who = gs.survivors.find(s => s.id === sel);
    role = 'Survivor'; selColor = '#88cc88';
  }
  if (!who) { shelterUI.selectedChar = null; shelterUI.activeMenu = null; return; }

  const PW = 184, PH = sel === 'parent' ? 260 : 220;
  const px = clamp(shelterUI.charPanelX, 2, MAIN_W - PW - 2);
  const py = clamp(shelterUI.charPanelY, 2, CFG.H - PH - 36);

  fillRect(ctx, px, py, PW, PH, C.panelBg);
  strokeRect(ctx, px, py, PW, PH, selColor);
  fillRect(ctx, px, py, PW, 18, '#0a0a18');
  drawText(ctx, `${who.name.toUpperCase()}  (${role})`, px + PW/2, py + 12, selColor, 8, 'center', true);

  let y = py + 24;
  const sw = PW - 16;
  drawStatBar(ctx, px+8, y, sw, 5, who.health, who.maxHealth, C.hp,         null, 'HP');      y += 9;
  drawStatBar(ctx, px+8, y, sw, 5, who.hunger,        100,    C.hunger,     null, 'Hunger');   y += 9;
  drawStatBar(ctx, px+8, y, sw, 5, who.thirst,        100,    C.thirst,     null, 'Thirst');   y += 9;
  drawStatBar(ctx, px+8, y, sw, 5, who.tiredness,     100,    C.tiredness,  null, 'Tired');    y += 9;
  drawStatBar(ctx, px+8, y, sw, 5, who.depression,    100,    C.depression, null, 'Depr.');    y += 10;

  // Level & XP
  const lvl    = who.level  || 1;
  const curXP  = who.xp     || 0;
  const needXP = xpForLevel(lvl);
  drawText(ctx, `Lv.${lvl}`, px+8, y+8, '#d4aa40', 7, 'left', true);
  drawText(ctx, `XP: ${curXP}/${needXP}`, px + PW - 8, y+8, C.textDim, 7, 'right');
  y += 11;
  drawStatBar(ctx, px+8, y, sw, 4, curXP, needXP, '#d4aa40');
  y += 10;

  const taskLabel = who.isSleeping ? 'Sleeping...'
    : who.task ? (who.task.type[0].toUpperCase() + who.task.type.slice(1) + '...')
    : 'Idle';
  drawText(ctx, `Task: ${taskLabel}`, px+8, y+8, who.task || who.isSleeping ? C.textGood : C.textDim, 7);
  y += 12;
  if ((who.task || who.isSleeping) && who.taskDuration > 0) {
    drawStatBar(ctx, px+8, y, sw, 3, who.taskProgress, who.taskDuration, C.textGood);
    y += 7;
  }
  y += 6;
  drawDivider(ctx, px+4, y, PW-8, C.border2); y += 8;

  gs._charPanelBtns = [];
  const BW = sw, BH = 18;
  function addBtn(label, id, disabled) {
    const hov = !disabled && hitTest(mx, my, px+8, y, BW, BH);
    drawButton(ctx, px+8, y, BW, BH, label, hov, false, disabled);
    gs._charPanelBtns.push({ id, x: px+8, y, w: BW, h: BH, disabled });
    y += BH + 4;
  }

  const noTask   = !who.task && !who.isSleeping;
  const foodIds  = ['heated_beans','heated_soup','cooked_meat','canned_beans','canned_soup','canned_meat','energy_bar'];
  const waterIds = ['purified_water','water_bottle','dirty_water'];
  const hasFood  = foodIds.some(id  => countInInventory(gs.shelter.storage, id) > 0);
  const hasWater = waterIds.some(id => countInInventory(gs.shelter.storage, id) > 0);

  addBtn('Sleep',             'sleep',   !noTask);
  addBtn('Eat from Storage',  'eat',     !noTask || !hasFood);
  addBtn('Drink from Storage','drink',   !noTask || !hasWater);
  if (sel === 'parent') {
    addBtn('Play with Lily',  'play',    !noTask);
    addBtn('Explore...',      'explore', !noTask || who.isExploring);
  }

  const closeY   = py + PH - 22;
  const closeHov = hitTest(mx, my, px + PW - 58, closeY, 50, 16);
  drawButton(ctx, px + PW - 58, closeY, 50, 16, 'Close', closeHov);
  gs._charPanelClose = { x: px + PW - 58, y: closeY, w: 50, h: 16 };
}

// ── Character task assignment ─────────────────────────────────────────────────

function handleCharTask(taskId, gs) {
  const sel = shelterUI.selectedChar;
  if (!sel) return;

  let who;
  if (sel === 'parent')     who = gs.parent;
  else if (sel === 'child') who = gs.child;
  else who = gs.survivors.find(s => s.id === sel);
  if (!who) return;

  const foodIds  = ['heated_beans','heated_soup','cooked_meat','canned_beans','canned_soup','canned_meat','energy_bar'];
  const waterIds = ['purified_water','water_bottle','dirty_water'];

  switch (taskId) {
    case 'sleep':
      who.isSleeping   = true;
      who.task         = { type: 'sleep' };
      who.taskDuration = 5;
      who.taskProgress = 0;
      if (sel === 'parent') gs.parent.isWorking = false;
      notify(`${who.name} went to sleep.`, 'normal');
      shelterUI.activeMenu = null;
      break;

    case 'eat': {
      const foodId = foodIds.find(id => countInInventory(gs.shelter.storage, id) > 0);
      if (foodId) {
        removeFromInventory(gs.shelter.storage, foodId, 1);
        const def = getItemDef(foodId);
        who.hunger     = clamp(who.hunger     + (def.hunger     || -20), 0, 100);
        who.thirst     = clamp(who.thirst     + (def.thirst     ||   0), 0, 100);
        who.depression = clamp(who.depression + (def.depression ||   0), 0, 100);
        who.health     = clamp(who.health     + (def.health     ||   0), 0, who.maxHealth);
        notify(`${who.name} ate ${def.name}.`, 'good');
        shelterUI.activeMenu = null;
      }
      break;
    }

    case 'drink': {
      const waterId = waterIds.find(id => countInInventory(gs.shelter.storage, id) > 0);
      if (waterId) {
        removeFromInventory(gs.shelter.storage, waterId, 1);
        const def = getItemDef(waterId);
        who.thirst = clamp(who.thirst + (def.thirst || -28), 0, 100);
        who.health = clamp(who.health + (def.health ||   0), 0, who.maxHealth);
        notify(`${who.name} drank ${def.name}.`, 'good');
        shelterUI.activeMenu = null;
      }
      break;
    }

    case 'play':
      if (sel === 'parent' && !gs.parent.task) {
        gs.parent.task         = { type: 'play' };
        gs.parent.taskDuration = 2;
        gs.parent.taskProgress = 0;
        gs.parent.isWorking    = true;
        notify(`Playing with ${gs.child.name}.`, 'good');
        shelterUI.activeMenu = null;
      }
      break;

    case 'explore':
      if (sel === 'parent') {
        shelterUI.activeMenu   = null;
        shelterUI.selectedChar = null;
        gs.screen = 'exploreSelect';
      }
      break;
  }
}

// ── Bottom controls ───────────────────────────────────────────────────────────

const CTRL_BUTTONS = [
  { id: 'explore',  label: 'Explore',   w: 72 },
  { id: 'craft',    label: 'Craft',     w: 56 },
  { id: 'storage',  label: 'Storage',   w: 62 },
  { id: 'cook',     label: 'Cook',      w: 56, needsCampfire: true },
  { id: 'sleep',    label: 'Sleep',     w: 52 },
  { id: 'play',     label: 'Play',      w: 52 },
  { id: 'endday',   label: 'End Day',   w: 62 },
];

function drawShelterControls(ctx, gs, mx, my) {
  const barH = 30, barY = CFG.H - barH;
  fillRect(ctx, 0, barY, MAIN_W, barH, C.panelBg);
  drawDivider(ctx, 0, barY, MAIN_W, C.border2);

  let bx = 6;
  for (const btn of CTRL_BUTTONS) {
    const disabled = (btn.needsCampfire && !gs.shelter.campfire)
                  || (btn.id === 'explore' && gs.parent.isExploring)
                  || (btn.id === 'sleep'   && gs.parent.isSleeping);
    const active = (btn.id === 'craft'   && shelterUI.activeMenu === 'crafting')
                || (btn.id === 'storage' && shelterUI.activeMenu === 'storage')
                || (btn.id === 'cook'    && shelterUI.activeMenu === 'cooking');
    drawButton(ctx, bx, barY + 5, btn.w, 20, btn.label,
      hitTest(mx, my, bx, barY + 5, btn.w, 20), active, disabled);
    bx += btn.w + 4;
  }
}

// ── Context menus ─────────────────────────────────────────────────────────────

function drawShelterMenu(ctx, gs, mx, my) {
  const M = shelterUI;

  if (M.activeMenu === 'room')     drawRoomMenu(ctx, gs, mx, my);
  else if (M.activeMenu === 'crafting') drawCraftingMenu(ctx, gs, mx, my);
  else if (M.activeMenu === 'storage')  drawStorageMenu(ctx, gs, mx, my);
  else if (M.activeMenu === 'cooking')  drawCookingMenu(ctx, gs, mx, my);
  else if (M.activeMenu === 'char')     drawCharPanel(ctx, gs, mx, my);
}

function drawRoomMenu(ctx, gs, mx, my) {
  const roomId = shelterUI.selectedRoom;
  if (!roomId) return;
  const def  = ROOM_DEFS[roomId];
  const room = getRoom(roomId);
  const W2 = 210, H2 = 200;
  const px = clamp(shelterUI.menuX, 2, MAIN_W - W2 - 2);
  const py = clamp(shelterUI.menuY, 2, CFG.H - H2 - 2);

  drawModal(ctx, px, py, W2, H2, def.name);
  let y = py + 24;

  drawText(ctx, def.desc, px + 8, y + 9, C.textDim, 8);
  y += 20;

  if (!room.unlocked) {
    drawText(ctx, 'Build cost:', px + 8, y + 9, C.text, 8);
    y += 12;
    if (def.buildCost) {
      for (const [id, qty] of Object.entries(def.buildCost)) {
        const have = countInInventory(gs.shelter.storage, id) + countInInventory(gs.parent.inventory, id);
        const col  = have >= qty ? C.textGood : C.textDanger;
        drawText(ctx, `  ${getItemDef(id)?.name || id}: ${have}/${qty}`, px + 8, y + 9, col, 8);
        y += 11;
      }
      if (def.needsTools) {
        const haveTools = countInInventory(gs.shelter.storage,'tools') + countInInventory(gs.parent.inventory,'tools');
        drawText(ctx, `  Tools: ${haveTools}/1`, px+8, y+9, haveTools>0?C.textGood:C.textDanger, 8);
        y += 11;
      }
      drawText(ctx, `Noise: +${def.buildNoise} (Suspicion)`, px+8, y+9, C.textWarn, 7);
      y += 14;
      const canBuild = canAfford(def.buildCost, gs, true)
        && (!def.needsTools || countInInventory(gs.shelter.storage,'tools')+countInInventory(gs.parent.inventory,'tools')>0)
        && gs.parent.task === null;
      // Position build button near bottom
      const buildBtnY = py + H2 - 48;
      drawButton(ctx, px+8, buildBtnY, W2-16, 18, 'Build Room',
        hitTest(mx, my, px+8, buildBtnY, W2-16, 18), false, !canBuild);
      y += 22;
    }
  } else {
    drawText(ctx, 'Room level: ' + room.level, px+8, y+9, C.textGood, 8);
    y += 14;
  }

  const closeX = px+8, closeY = py + H2 - 24;
  drawButton(ctx, closeX, closeY, 50, 16, 'Close', hitTest(mx, my, closeX, closeY, 50, 16));
}

function drawCraftingMenu(ctx, gs, mx, my) {
  const W2 = 280, H2 = 220;
  const px = 60, py = 50;
  drawModal(ctx, px, py, W2, H2, 'CRAFTING');

  let y = py + 24;
  const visRecipes = RECIPES_DB.concat(Object.values(UPGRADES_DB));

  for (const recipe of visRecipes) {
    if (y > py + H2 - 40) break;

    // Check if already built (for upgrades)
    if (recipe.key && gs.shelter[recipe.key]) continue;

    const name = recipe.name;
    const canMake = recipe.buildCost
      ? canAfford(recipe.buildCost, gs, true)
      : canAfford(recipe.cost || {}, gs, true);

    const hov = hitTest(mx, my, px+4, y, W2-8, 18);
    if (hov) fillRect(ctx, px+4, y, W2-8, 18, C.highlight);

    const col = canMake ? C.text : C.textDim;
    drawText(ctx, name, px + 10, y + 11, col, 8);
    if (canMake) drawText(ctx, '✓', px + W2 - 18, y + 11, C.textGood, 8);

    y += 20;
  }

  const closeX = px+8, closeY = py + H2 - 24;
  drawButton(ctx, closeX, closeY, 50, 16, 'Close', hitTest(mx, my, closeX, closeY, 50, 16));
}

function drawStorageMenu(ctx, gs, mx, my) {
  const W2 = 280, H2 = 240;
  const px = 60, py = 40;

  const storage = gs.shelter.storage;
  const wt = shelterStorageWeight().toFixed(1);
  const title = `STORAGE  ${wt}/${gs.shelter.storageMax}kg`;
  drawModal(ctx, px, py, W2, H2, title);

  const clicks = drawInventoryList(ctx, storage, px + 2, py + 17, W2 - 4, H2 - 40, null,
    shelterUI.storageScroll, mx, my);

  shelterUI._storageClicks = clicks;

  const closeX = px + 8, closeY = py + H2 - 22;
  drawButton(ctx, closeX, closeY, 50, 16, 'Close', hitTest(mx, my, closeX, closeY, 50, 16));
}

function drawCookingMenu(ctx, gs, mx, my) {
  const W2 = 240, H2 = 180;
  const px = 80, py = 60;
  drawModal(ctx, px, py, W2, H2, 'COOK FOOD');
  let y = py + 24;

  const cookable = [
    { srcId:'raw_meat',   outId:'cooked_meat',  label:'Cook Meat (raw → cooked)' },
    { srcId:'canned_soup',outId:'heated_soup',  label:'Heat Soup (canned → hot)' },
    { srcId:'canned_beans',outId:'heated_beans',label:'Heat Beans (canned → hot)' },
  ];

  for (const item of cookable) {
    const qty = countInInventory(gs.shelter.storage, item.srcId);
    const canCook = qty > 0 && !gs.parent.isWorking && gs.parent.task === null;
    const hov = hitTest(mx, my, px+4, y, W2-8, 20);
    if (hov) fillRect(ctx, px+4, y, W2-8, 20, C.highlight);
    drawButton(ctx, px+8, y+1, W2-16, 18, `${item.label} (${qty})`,
      hov, false, !canCook);
    y += 24;
  }

  const closeX = px+8, closeY = py + H2 - 24;
  drawButton(ctx, closeX, closeY, 50, 16, 'Close', hitTest(mx, my, closeX, closeY, 50, 16));
}

// ── Click handler ─────────────────────────────────────────────────────────────

function shelterClick(mx, my, gs) {
  const M    = shelterUI;
  const barY = CFG.H - 30;

  // Close menu on outside click
  if (M.activeMenu) {
    handleMenuClick(mx, my, gs);
    return;
  }

  // Bottom control bar
  for (const btn of CTRL_BUTTONS) {
    let bx = 6;
    for (const b of CTRL_BUTTONS) {
      if (b === btn) break;
      bx += b.w + 4;
    }
    if (hitTest(mx, my, bx, barY + 5, btn.w, 20)) {
      handleControlBtn(btn.id, gs, mx, my);
      return;
    }
  }

  // Character click (check before room clicks)
  if (GS._charHitBounds) {
    for (const bound of GS._charHitBounds) {
      if (hitTest(mx, my, bound.x, bound.y, bound.w, bound.h)) {
        M.selectedChar = bound.id;
        M.activeMenu   = 'char';
        M.charPanelX   = clamp(bound.x - 60, 2, MAIN_W - 188);
        M.charPanelY   = clamp(bound.y - 220, 2, CFG.H - 260);
        return;
      }
    }
  }

  // Room click
  for (let row = 0; row < ROOM_GRID.length; row++) {
    for (let col = 0; col < ROOM_GRID[row].length; col++) {
      const roomId = ROOM_GRID[row][col];
      const r      = roomRect(col, row);
      if (hitTest(mx, my, r.x, r.y, r.w, r.h)) {
        M.selectedRoom = roomId;
        M.activeMenu   = 'room';
        M.menuX        = r.x;
        M.menuY        = r.y - 10;
        return;
      }
    }
  }
}

function handleControlBtn(id, gs, mx, my) {
  const M = shelterUI;
  switch (id) {
    case 'explore':
      gs.screen = 'exploreSelect';
      break;
    case 'craft':
      M.activeMenu = M.activeMenu === 'crafting' ? null : 'crafting';
      break;
    case 'storage':
      M.activeMenu = M.activeMenu === 'storage' ? null : 'storage';
      break;
    case 'cook':
      M.activeMenu = M.activeMenu === 'cooking' ? null : 'cooking';
      break;
    case 'sleep':
      gs.parent.isSleeping = true;
      gs.parent.task = { type:'sleep' };
      gs.parent.taskDuration = 6;   // 6 game hours
      gs.parent.taskProgress = 0;
      notify('Sleeping...', 'normal');
      break;
    case 'play':
      if (!gs.parent.task) {
        gs.parent.task = { type:'play' };
        gs.parent.taskDuration = 2;
        gs.parent.taskProgress = 0;
        gs.parent.isWorking = true;
        notify(`Playing with ${gs.child.name}.`, 'good');
      }
      break;
    case 'endday':
      startDayTransition(gs);
      break;
  }
}

function handleMenuClick(mx, my, gs) {
  const M    = shelterUI;
  const barH = 30;

  if (M.activeMenu === 'room') {
    const roomId = M.selectedRoom;
    const def    = ROOM_DEFS[roomId];
    const room   = getRoom(roomId);
    const W2 = 210, H2 = 200;
    const px = clamp(M.menuX, 2, MAIN_W - W2 - 2);
    const py = clamp(M.menuY, 2, CFG.H - H2 - 2);

    // Build button (positioned near bottom of modal)
    if (!room.unlocked) {
      const buildBtnY = py + H2 - 48;
      if (hitTest(mx, my, px+8, buildBtnY, W2-16, 18)) {
        const result = buildRoom(gs, roomId);
        if (result.ok) M.activeMenu = null;
        else notify(result.msg, 'warn');
        return;
      }
    }
    // Close
    if (hitTest(mx, my, px+8, py + H2 - 24, 50, 16)) { M.activeMenu = null; M.selectedRoom = null; }
    return;
  }

  if (M.activeMenu === 'crafting') {
    const W2 = 280, H2 = 220;
    const px = 60, py = 50;
    const allRecipes = RECIPES_DB.concat(Object.values(UPGRADES_DB));
    let y = py + 24;
    for (const recipe of allRecipes) {
      if (recipe.key && gs.shelter[recipe.key]) continue;
      if (hitTest(mx, my, px+4, y, W2-8, 18)) {
        // Is it a room upgrade or item recipe?
        if (UPGRADES_DB[recipe.id]) {
          const result = buildUpgrade(gs, recipe.id);
          if (!result.ok) notify(result.msg, 'warn');
        } else {
          const result = craftItem(gs, recipe.id);
          if (!result.ok) notify(result.msg, 'warn');
        }
      }
      y += 20;
    }
    if (hitTest(mx, my, px+8, py + H2 - 24, 50, 16)) M.activeMenu = null;
    return;
  }

  if (M.activeMenu === 'storage') {
    const W2 = 280, H2 = 240;
    const px = 60, py = 40;
    if (hitTest(mx, my, px+8, py + H2 - 22, 50, 16)) { M.activeMenu = null; return; }
    return;
  }

  if (M.activeMenu === 'char') {
    // Close button
    if (GS._charPanelClose) {
      const b = GS._charPanelClose;
      if (hitTest(mx, my, b.x, b.y, b.w, b.h)) {
        M.activeMenu = null; M.selectedChar = null; return;
      }
    }
    // Task buttons
    if (GS._charPanelBtns) {
      for (const btn of GS._charPanelBtns) {
        if (!btn.disabled && hitTest(mx, my, btn.x, btn.y, btn.w, btn.h)) {
          handleCharTask(btn.id, gs); return;
        }
      }
    }
    // Click outside panel closes it
    const sel = M.selectedChar;
    const PH  = sel === 'parent' ? 260 : 220;
    const PW  = 184;
    const px  = clamp(M.charPanelX, 2, MAIN_W - PW - 2);
    const py  = clamp(M.charPanelY, 2, CFG.H - PH - 36);
    if (!hitTest(mx, my, px, py, PW, PH)) { M.activeMenu = null; M.selectedChar = null; }
    return;
  }

  if (M.activeMenu === 'cooking') {
    const W2 = 240, H2 = 180;
    const px = 80, py = 60;
    const cookable = [
      { srcId:'raw_meat',   outId:'cooked_meat' },
      { srcId:'canned_soup',outId:'heated_soup' },
      { srcId:'canned_beans',outId:'heated_beans' },
    ];
    let y = py + 24;
    for (const item of cookable) {
      if (hitTest(mx, my, px+8, y+1, W2-16, 18)) {
        const result = cookFood(gs, item.srcId, 1);
        if (!result.ok) notify(result.msg, 'warn');
        M.activeMenu = null;
        return;
      }
      y += 24;
    }
    if (hitTest(mx, my, px+8, py + H2 - 24, 50, 16)) M.activeMenu = null;
  }
}

// ── Drone patrol ──────────────────────────────────────────────────────────────

function updateShelterAmbient(gs) {
  const dp = gs.shelter.dronePatrol;
  if (!dp) return;

  if (dp.active) {
    dp.x += dp.dir * 1.2;
    // Drone reached far edge — deactivate
    if (dp.x > MAIN_W + 40 || dp.x < -40) {
      dp.active = false;
      dp.timer  = 0;
      // Suspicion affects how soon next patrol arrives
      const base = gs.suspicion > 70 ? 90 : gs.suspicion > 40 ? 200 : 420;
      dp.nextPatrol = base + randInt(0, 120);
    }
  } else {
    dp.timer++;
    if (dp.timer >= dp.nextPatrol) {
      dp.active = true;
      dp.timer  = 0;
      dp.dir    = randInt(0, 1) === 0 ? 1 : -1;
      dp.x      = dp.dir === 1 ? -30 : MAIN_W + 30;
    }
  }
}

function drawDronePatrol(ctx, gs) {
  const dp = gs.shelter.dronePatrol;
  if (!dp || !dp.active) return;

  const y = 18 + Math.sin(dp.timer * 0.08) * 3;
  drawDroneSprite(ctx, dp.x, y, 1.5, dp.timer);

  // Spotlight beam (faint cone downward)
  ctx.save();
  ctx.globalAlpha = 0.07;
  const grad = ctx.createLinearGradient(dp.x, y + 10, dp.x, CFG.SURFACE_H);
  grad.addColorStop(0, '#c0c8ff');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(dp.x - 4, y + 10);
  ctx.lineTo(dp.x - 28, CFG.SURFACE_H);
  ctx.lineTo(dp.x + 28, CFG.SURFACE_H);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ── Weather visuals on shelter surface ───────────────────────────────────────

function drawShelterWeather(ctx, gs) {
  if (!gs.weather) return;
  const w    = gs.weather.type;
  const SH   = CFG.SURFACE_H;
  const SW   = MAIN_W;
  const fc   = frameCount;   // from main.js — updated each frame

  if (w === 'cloudy' || w === 'rain') {
    // Slow-drifting clouds
    ctx.save();
    ctx.globalAlpha = w === 'rain' ? 0.55 : 0.30;
    ctx.fillStyle = '#1a1a2a';
    const cloudDefs = [
      { bx: 40,  by: 8,  rx: 28, ry: 10 },
      { bx: 140, by: 12, rx: 22, ry:  8 },
      { bx: 260, by: 6,  rx: 32, ry: 12 },
      { bx: 360, by: 10, rx: 20, ry:  7 },
    ];
    for (const c of cloudDefs) {
      const cx = ((c.bx + fc * 0.12) % (SW + 60)) - 30;
      ctx.beginPath();
      ctx.ellipse(Math.round(cx), c.by, c.rx, c.ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  if (w === 'rain') {
    // Animated rain streaks
    ctx.save();
    ctx.strokeStyle = '#3a5a7a';
    ctx.lineWidth   = 1;
    ctx.globalAlpha = 0.45;
    const drops = 22;
    for (let i = 0; i < drops; i++) {
      // Pseudo-random but deterministic per frame+drop
      const seed = (i * 137 + fc * 3) % 1000;
      const rx   = (seed * SW / 1000 + fc * 0.8) % SW;
      const ry   = (i * 41 + fc * 5) % SH;
      ctx.beginPath();
      ctx.moveTo(Math.round(rx), Math.round(ry));
      ctx.lineTo(Math.round(rx + 2), Math.round(ry + 7));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Puddle shimmer on ground line
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#2a4a6a';
    ctx.fillRect(0, SH - 4, SW, 3);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  if (w === 'clear') {
    // Faint warm sky glow when clear
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#302818';
    ctx.fillRect(0, 0, SW, SH);
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

// ── Weather/raincatcher badge ─────────────────────────────────────────────────

function drawWeatherBadge(ctx, gs) {
  if (!gs.weather) return;
  const w  = gs.weather.type;
  const icon = w === 'rain' ? '🌧' : w === 'cloudy' ? '☁' : '☀';
  const label = w.charAt(0).toUpperCase() + w.slice(1);

  // Small badge in top-left of surface area
  drawPanel(ctx, 4, 4, 70, 16, C.panelBg);
  drawText(ctx, icon, 10, 16, C.text, 8);
  drawText(ctx, label, 22, 16, C.textDim, 7);

  // Raincatcher status if built
  if (gs.shelter.hasRaincatcher) {
    const collecting = w === 'rain';
    const col = collecting ? '#2878cc' : C.textDim;
    drawPanel(ctx, 78, 4, 90, 16, C.panelBg);
    drawText(ctx, collecting ? 'Collecting' : 'Raincatcher', 84, 16, col, 7);
  }
}
