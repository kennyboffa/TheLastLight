// packScreen.js — Pre-exploration inventory packing and equipment screen
'use strict';

let packUI = { invScroll: 0, storScroll: 0 };

function renderPackScreen(ctx, gs) {
  const loc = gs._pendingLoc;
  if (!loc) { gs.screen = 'shelter'; return; }

  fillRect(ctx, 0, 0, CFG.W, CFG.H, C.bg);

  // Title
  drawText(ctx, `PREPARE: ${loc.name.toUpperCase()}`, CFG.W/2, 16, C.textBright, 10, 'center', true);
  drawDivider(ctx, 10, 22, CFG.W - 20, C.border2);

  const mx = gs.mouse.x, my = gs.mouse.y;

  // ── Equip strip ──────────────────────────────────────────────────────────
  const eq = gs.parent.equipped;
  const weapDef = eq.weapon ? getItemDef(eq.weapon) : null;
  const armDef  = eq.armor  ? getItemDef(eq.armor)  : null;
  const bpDef   = gs.parent.backpackId ? getItemDef(gs.parent.backpackId) : null;

  const equipY = 28;
  drawPanel(ctx, 10, equipY, CFG.W - 20, 20, C.panelBg2, C.border);
  const slots = [
    { label: 'Weapon', val: weapDef ? weapDef.name : 'none', x: 18 },
    { label: 'Armor',  val: armDef  ? armDef.name  : 'none', x: 190 },
    { label: 'Pack',   val: bpDef   ? bpDef.name   : 'none', x: 370 },
  ];
  for (const sl of slots) {
    drawText(ctx, `${sl.label}: `, sl.x, equipY + 13, C.textDim, 7);
    drawText(ctx, sl.val, sl.x + 52, equipY + 13, sl.val === 'none' ? '#444450' : C.textBright, 7);
  }

  // ── Two panels ───────────────────────────────────────────────────────────
  const panelY = 52, panelH = CFG.H - 88;
  const invW = 300, storW = CFG.W - invW - 20;
  const invX = 10, storX = invX + invW + 6;

  // Weight
  const wt = calcWeight(gs.parent.inventory).toFixed(1);
  const maxWt = parentMaxCarry().toFixed(1);
  const wtCol = parseFloat(wt) >= parseFloat(maxWt) * 0.9 ? C.textWarn : C.textDim;

  const invRows = drawInventoryList(ctx, gs.parent.inventory, invX, panelY, invW, panelH,
    `MY BAG  ${wt}/${maxWt}kg`, packUI.invScroll, mx, my);
  const storRows = drawInventoryList(ctx, gs.shelter.storage, storX, panelY, storW, panelH,
    'SHELTER STORAGE', packUI.storScroll, mx, my);

  // Equip hint inside inventory panel
  drawText(ctx, 'Click item: equip/unequip  |  items below: move to bag', invX + 4, panelY + panelH + 4, C.textDim, 7);

  // ── Bottom buttons ───────────────────────────────────────────────────────
  const btnY = CFG.H - 28;
  drawButton(ctx, 10,          btnY, 80, 22, '< Cancel', hitTest(mx, my, 10, btnY, 80, 22));
  drawButton(ctx, CFG.W - 120, btnY, 110, 22, 'Go Explore \u2192', hitTest(mx, my, CFG.W - 120, btnY, 110, 22), false, false);

  // Carry weight bar at bottom
  drawStatBar(ctx, 10, btnY - 10, CFG.W - 20, 5, parseFloat(wt), parseFloat(maxWt), parseFloat(wt) > parseFloat(maxWt) * 0.9 ? C.textWarn : '#2a6a4a');

  gs._packInvRows  = invRows;
  gs._packStorRows = storRows;
}

function packScreenClick(mx, my, gs) {
  const btnY = CFG.H - 28;

  // Cancel
  if (hitTest(mx, my, 10, btnY, 80, 22)) {
    gs._pendingLoc = null; gs.screen = 'shelter'; return;
  }
  // Go Explore
  if (hitTest(mx, my, CFG.W - 120, btnY, 110, 22)) {
    const loc = gs._pendingLoc;
    gs._pendingLoc = null;
    startExploration(gs, loc);
    return;
  }

  // Click in bag (inventory) — equip weapon/armor/backpack, or move to storage
  if (gs._packInvRows) {
    for (const row of gs._packInvRows) {
      if (my >= row.y1 && my < row.y2) {
        const slot = row.slot;
        const def  = getItemDef(slot.id);
        if (!def) break;
        if (def.type === 'weapon') {
          // Toggle equip
          if (gs.parent.equipped.weapon === slot.id) {
            gs.parent.equipped.weapon = null;
            notify(`Unequipped ${def.name}.`);
          } else {
            gs.parent.equipped.weapon = slot.id;
            notify(`Equipped ${def.name}.`, 'good');
          }
        } else if (def.type === 'backpack') {
          if (gs.parent.backpackId === slot.id) {
            gs.parent.backpackId = null;
            notify(`Removed ${def.name}.`);
          } else {
            gs.parent.backpackId = slot.id;
            notify(`Equipped ${def.name}.`, 'good');
          }
        } else {
          // Move to storage
          removeFromInventory(gs.parent.inventory, slot.id, slot.qty);
          addToInventory(gs.shelter.storage, slot.id, slot.qty);
          notify(`Moved ${def.name} to storage.`);
        }
        return;
      }
    }
  }

  // Click in storage — move to parent inventory
  if (gs._packStorRows) {
    for (const row of gs._packStorRows) {
      if (my >= row.y1 && my < row.y2) {
        const slot = row.slot;
        const def  = getItemDef(slot.id);
        if (!def) break;
        const curW = calcWeight(gs.parent.inventory);
        const maxW = parentMaxCarry();
        if (curW + def.weight * slot.qty > maxW) {
          notify('Too heavy to carry.', 'warn'); return;
        }
        removeFromInventory(gs.shelter.storage, slot.id, slot.qty);
        addToInventory(gs.parent.inventory, slot.id, slot.qty);
        notify(`Loaded ${def.name} into bag.`, 'good');
        return;
      }
    }
  }
}

function packScreenScroll(dy, gs) {
  if (!gs._packInvRows && !gs._packStorRows) return;
  // Determine which side based on mouse position
  if (gs.mouse.x < 310) {
    packUI.invScroll = Math.max(0, packUI.invScroll + dy * 20);
  } else {
    packUI.storScroll = Math.max(0, packUI.storScroll + dy * 20);
  }
}
