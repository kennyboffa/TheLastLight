// packScreen.js — Pre-exploration inventory packing and equipment screen
'use strict';

let packUI = { invScroll: 0, storScroll: 0, selected: null, selectedSide: null };

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
  const actionBarH = 28; // height reserved at bottom for action buttons
  const panelY = 52, panelH = CFG.H - 88 - actionBarH;
  const invW = 300, storW = CFG.W - invW - 20;
  const invX = 10, storX = invX + invW + 6;

  const wt = calcWeight(gs.parent.inventory).toFixed(1);
  const maxWt = parentMaxCarry().toFixed(1);

  const invRows = drawInventoryList(ctx, gs.parent.inventory, invX, panelY, invW, panelH,
    `MY BAG  ${wt}/${maxWt}kg`, packUI.invScroll, mx, my,
    (packUI.selectedSide === 'inv' ? packUI.selected : null));
  const storRows = drawInventoryList(ctx, gs.shelter.storage, storX, panelY, storW, panelH,
    'SHELTER STORAGE', packUI.storScroll, mx, my,
    (packUI.selectedSide === 'stor' ? packUI.selected : null));

  gs._packInvRows  = invRows;
  gs._packStorRows = storRows;

  // ── Selection action bar ─────────────────────────────────────────────────
  const abY = panelY + panelH + 4;
  const abH = actionBarH - 2;

  if (packUI.selected !== null && packUI.selectedSide) {
    const rows = packUI.selectedSide === 'inv' ? invRows : storRows;
    const inv  = packUI.selectedSide === 'inv' ? gs.parent.inventory : gs.shelter.storage;
    const row  = rows.find(r => r.idx === packUI.selected);
    if (row) {
      const def = getItemDef(row.slot.id);
      fillRect(ctx, invX, abY, CFG.W - 20, abH, '#0e1018');
      strokeRect(ctx, invX, abY, CFG.W - 20, abH, C.border2);
      drawText(ctx, `Selected: ${def ? def.name : row.slot.id}`, invX + 8, abY + 11, C.textBright, 8);

      let bx = invX + 120;
      const by = abY + 5;
      const bh = 18;

      if (packUI.selectedSide === 'inv') {
        // Equip option for weapons/armor/backpack
        if (def && (def.type === 'weapon' || def.type === 'armor' || def.type === 'backpack')) {
          const bw = 46;
          const isEq = (def.type === 'weapon' && gs.parent.equipped.weapon === row.slot.id)
                    || (def.type === 'armor'   && gs.parent.equipped.armor  === row.slot.id)
                    || (def.type === 'backpack' && gs.parent.backpackId      === row.slot.id);
          const hov = hitTest(mx, my, bx, by, bw, bh);
          drawButton(ctx, bx, by, bw, bh, isEq ? 'Unequip' : 'Equip', hov);
          gs._packEquipBtn = { x: bx, y: by, w: bw, h: bh, action: isEq ? 'unequip' : 'equip', slot: row.slot };
          bx += bw + 6;
        } else {
          gs._packEquipBtn = null;
        }
        // Move to storage
        const mw = 80;
        const mhov = hitTest(mx, my, bx, by, mw, bh);
        drawButton(ctx, bx, by, mw, bh, '→ Storage', mhov);
        gs._packMoveBtn = { x: bx, y: by, w: mw, h: bh, action: 'toStorage', slot: row.slot };
      } else {
        gs._packEquipBtn = null;
        // Move to bag
        const mw = 80;
        const mhov = hitTest(mx, my, bx, by, mw, bh);
        drawButton(ctx, bx, by, mw, bh, '→ My Bag', mhov);
        gs._packMoveBtn = { x: bx, y: by, w: mw, h: bh, action: 'toBag', slot: row.slot };
      }
    } else {
      // Row no longer found — deselect
      packUI.selected = null; packUI.selectedSide = null;
      gs._packEquipBtn = null; gs._packMoveBtn = null;
    }
  } else {
    // Hint text
    drawText(ctx, 'Click an item to select it, then choose an action', invX + 8, abY + 11, C.textDim, 7);
    gs._packEquipBtn = null; gs._packMoveBtn = null;
  }

  // ── Bottom buttons ───────────────────────────────────────────────────────
  const btnY = CFG.H - 28;
  drawButton(ctx, 10,          btnY, 80, 22, '< Cancel', hitTest(mx, my, 10, btnY, 80, 22));
  drawButton(ctx, CFG.W - 120, btnY, 110, 22, 'Go Explore \u2192', hitTest(mx, my, CFG.W - 120, btnY, 110, 22), false, false);

  // Carry weight bar at bottom
  drawStatBar(ctx, 10, btnY - 10, CFG.W - 20, 5, parseFloat(wt), parseFloat(maxWt), parseFloat(wt) > parseFloat(maxWt) * 0.9 ? C.textWarn : '#2a6a4a');
}

function packScreenClick(mx, my, gs) {
  const btnY = CFG.H - 28;

  // Cancel
  if (hitTest(mx, my, 10, btnY, 80, 22)) {
    packUI.selected = null; packUI.selectedSide = null;
    gs._pendingLoc = null; gs.screen = 'shelter'; return;
  }
  // Go Explore
  if (hitTest(mx, my, CFG.W - 120, btnY, 110, 22)) {
    packUI.selected = null; packUI.selectedSide = null;
    const loc = gs._pendingLoc;
    gs._pendingLoc = null;
    startExploration(gs, loc);
    return;
  }

  // Action buttons (equip / move)
  if (gs._packEquipBtn) {
    const b = gs._packEquipBtn;
    if (hitTest(mx, my, b.x, b.y, b.w, b.h)) {
      const slot = b.slot;
      const def  = getItemDef(slot.id);
      if (!def) { packUI.selected = null; return; }
      if (b.action === 'equip') {
        if (def.type === 'weapon')   gs.parent.equipped.weapon = slot.id;
        else if (def.type === 'armor') gs.parent.equipped.armor = slot.id;
        else if (def.type === 'backpack') gs.parent.backpackId = slot.id;
        notify(`Equipped ${def.name}.`, 'good');
      } else {
        if (def.type === 'weapon'   && gs.parent.equipped.weapon    === slot.id) gs.parent.equipped.weapon = null;
        if (def.type === 'armor'    && gs.parent.equipped.armor     === slot.id) gs.parent.equipped.armor  = null;
        if (def.type === 'backpack' && gs.parent.backpackId         === slot.id) gs.parent.backpackId      = null;
        notify(`Unequipped ${def.name}.`);
      }
      packUI.selected = null; packUI.selectedSide = null;
      return;
    }
  }
  if (gs._packMoveBtn) {
    const b = gs._packMoveBtn;
    if (hitTest(mx, my, b.x, b.y, b.w, b.h)) {
      const slot = b.slot;
      const def  = getItemDef(slot.id);
      if (!def) { packUI.selected = null; return; }
      if (b.action === 'toStorage') {
        removeFromInventory(gs.parent.inventory, slot.id, slot.qty);
        addToInventory(gs.shelter.storage, slot.id, slot.qty);
        notify(`Moved ${def.name} to storage.`);
      } else {
        const curW = calcWeight(gs.parent.inventory);
        const maxW = parentMaxCarry();
        if (curW + def.weight * slot.qty > maxW) {
          notify('Too heavy to carry.', 'warn'); return;
        }
        removeFromInventory(gs.shelter.storage, slot.id, slot.qty);
        addToInventory(gs.parent.inventory, slot.id, slot.qty);
        notify(`Loaded ${def.name} into bag.`, 'good');
      }
      packUI.selected = null; packUI.selectedSide = null;
      return;
    }
  }

  // Click in bag — select item
  const panelY = 52;
  const panelH = CFG.H - 88 - 28;
  const invX = 10, invW = 300;
  const storX = invX + invW + 6;
  const storW = CFG.W - invW - 20;

  if (gs._packInvRows && hitTest(mx, my, invX, panelY, invW, panelH)) {
    for (const row of gs._packInvRows) {
      if (my >= row.y1 && my < row.y2 && mx >= invX && mx < invX + invW) {
        if (packUI.selectedSide === 'inv' && packUI.selected === row.idx) {
          packUI.selected = null; packUI.selectedSide = null;
        } else {
          packUI.selected = row.idx; packUI.selectedSide = 'inv';
        }
        return;
      }
    }
  }

  // Click in storage — select item
  if (gs._packStorRows && hitTest(mx, my, storX, panelY, storW, panelH)) {
    for (const row of gs._packStorRows) {
      if (my >= row.y1 && my < row.y2 && mx >= storX && mx < storX + storW) {
        if (packUI.selectedSide === 'stor' && packUI.selected === row.idx) {
          packUI.selected = null; packUI.selectedSide = null;
        } else {
          packUI.selected = row.idx; packUI.selectedSide = 'stor';
        }
        return;
      }
    }
  }

  // Click outside panels — deselect
  packUI.selected = null; packUI.selectedSide = null;
}

function packScreenScroll(dy, gs) {
  if (!gs._packInvRows && !gs._packStorRows) return;
  const invX = 10, invW = 300;
  if (gs.mouse.x < invX + invW) {
    packUI.invScroll = Math.max(0, packUI.invScroll + dy * 20);
  } else {
    packUI.storScroll = Math.max(0, packUI.storScroll + dy * 20);
  }
}
