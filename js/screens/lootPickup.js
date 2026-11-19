// lootPickup.js — Post-combat loot pickup screen
'use strict';

// State for the loot pickup UI
const lootPickupUI = {
  scroll: 0,
};

// The item list being picked from: a searched container (gs.lootSource) or
// enemy drops after a fight (gs.combat.victoryLoot). Same array is edited in place.
function _lootList(gs) {
  if (gs.lootSource) return gs.lootSource.items;
  return gs.combat ? gs.combat.victoryLoot : null;
}

function _lootTaken(gs, item) {
  if (gs.lootSource && gs.lootSource.onTake) gs.lootSource.onTake(item);
}

function renderLootPickup(ctx, gs) {
  const loot = _lootList(gs);
  if (!loot) { gs.screen = 'explore'; return; }

  fillRect(ctx, 0, 0, CFG.W, CFG.H, '#08080f');

  const panW = CFG.W - 80;
  const panX = 40;
  const panY = 20;
  const panH = CFG.H - 40;

  drawPanel(ctx, panX, panY, panW, panH, C.panelBg, C.border2);

  // Title
  fillRect(ctx, panX, panY, panW, 20, '#0a0a18');
  drawText(ctx, gs.lootSource ? gs.lootSource.title : 'ENEMY LOOT', panX + panW/2, panY + 14, C.textBright, 11, 'center', true);
  drawDivider(ctx, panX + 4, panY + 20, panW - 8, C.border2);

  const mx = gs.mouse.x, my = gs.mouse.y;

  // Two-panel layout: left = loot pile, right = player bag
  const midX = panX + Math.floor(panW / 2);
  const listY = panY + 24;
  const listH = panH - 70;

  // Left header
  drawText(ctx, gs.lootSource ? 'FOUND' : 'LOOT PILE', panX + 10, listY + 10, C.textWarn, 9, 'left', true);
  drawText(ctx, '(click to take)', panX + 10, listY + 20, C.textDim, 7);

  // Right header
  const wt     = calcWeight(gs.parent.inventory).toFixed(1);
  const maxWt  = parentMaxCarry().toFixed(1);
  drawText(ctx, 'YOUR BAG', midX + 10, listY + 10, C.textGood, 9, 'left', true);
  drawText(ctx, `${wt}/${maxWt}kg`, midX + 10, listY + 20, wt > maxWt * 0.9 ? C.textWarn : C.textDim, 7);

  drawDivider(ctx, panX + 4, listY + 26, panW - 8, C.border);
  // Vertical divider
  fillRect(ctx, midX - 1, listY, 2, listH, C.border);

  const rowH   = 18;
  const visH   = listH - 28;

  // Draw loot pile (left)
  gs._lootPickupBounds = [];
  ctx.save();
  ctx.beginPath();
  ctx.rect(panX, listY + 28, midX - panX - 2, visH);
  ctx.clip();
  let ly = listY + 28 - lootPickupUI.scroll;
  for (let i = 0; i < loot.length; i++) {
    const slot = loot[i];
    const def  = getItemDef(slot.id);
    if (!def) continue;
    const hov = hitTest(mx, my, panX + 2, ly, midX - panX - 6, rowH);
    if (hov) fillRect(ctx, panX + 2, ly, midX - panX - 6, rowH, C.highlight);
    fillRect(ctx, panX + 4, ly + 2, 2, rowH - 4, itemTypeColor(def.type));
    const ic1 = drawItemIcon(ctx, slot.id, panX + 8, ly + 1, rowH - 2);
    const label = slot.qty > 1 ? `${def.name} x${slot.qty}` : def.name;
    drawText(ctx, label, panX + (ic1 ? rowH + 8 : 12), ly + rowH - 4, hov ? C.textBright : C.text, 9);
    const wt = `${(def.weight * slot.qty).toFixed(1)}kg`;
    drawText(ctx, wt, midX - 14, ly + rowH - 4, C.textDim, 7, 'right');
    if (ly >= listY + 28) {
      gs._lootPickupBounds.push({ x: panX + 2, y: ly, w: midX - panX - 6, h: rowH, idx: i });
    }
    ly += rowH + 1;
  }
  if (loot.length === 0) {
    drawText(ctx, 'Nothing left.', panX + (midX - panX)/2, listY + 50, C.textDim, 8, 'center');
  }
  ctx.restore();

  // Draw player bag (right)
  const inv = gs.parent.inventory;
  gs._lootBagBounds = [];
  ctx.save();
  ctx.beginPath();
  ctx.rect(midX + 1, listY + 28, panX + panW - midX - 2, visH);
  ctx.clip();
  let iy = listY + 28;
  for (let i = 0; i < inv.length; i++) {
    const slot = inv[i];
    const def  = getItemDef(slot.id);
    if (!def) continue;
    const hov = hitTest(mx, my, midX + 2, iy, panX + panW - midX - 6, rowH);
    if (hov) fillRect(ctx, midX + 2, iy, panX + panW - midX - 6, rowH, C.highlight);
    fillRect(ctx, midX + 4, iy + 2, 2, rowH - 4, itemTypeColor(def.type));
    const ic2 = drawItemIcon(ctx, slot.id, midX + 8, iy + 1, rowH - 2);
    const label = slot.qty > 1 ? `${def.name} x${slot.qty}` : def.name;
    drawText(ctx, label, midX + (ic2 ? rowH + 8 : 12), iy + rowH - 4, hov ? C.textBright : C.text, 9);
    if (iy >= listY + 28) {
      gs._lootBagBounds.push({ x: midX + 2, y: iy, w: panX + panW - midX - 6, h: rowH, idx: i });
    }
    iy += rowH + 1;
  }
  if (inv.length === 0) {
    drawText(ctx, 'Bag empty.', midX + (panX + panW - midX)/2, listY + 50, C.textDim, 8, 'center');
  }
  ctx.restore();

  // Instruction line
  const infoY = panY + panH - 44;
  drawDivider(ctx, panX + 4, infoY, panW - 8, C.border);
  drawText(ctx, 'Click loot to take  |  Click bag item to drop back', panX + panW/2, infoY + 12, C.textDim, 8, 'center');

  // Take All button
  const takeAllX = panX + 10, takeAllY = panY + panH - 28;
  const takeAllHov = hitTest(mx, my, takeAllX, takeAllY, 80, 20);
  drawButton(ctx, takeAllX, takeAllY, 80, 20, 'Take All [E]', takeAllHov);
  gs._lootTakeAllBounds = { x: takeAllX, y: takeAllY, w: 80, h: 20 };

  // Done button
  const doneX = panX + panW - 90, doneY = panY + panH - 28;
  const doneHov = hitTest(mx, my, doneX, doneY, 80, 20);
  drawButton(ctx, doneX, doneY, 80, 20, 'Done', doneHov);
  gs._lootDoneBounds = { x: doneX, y: doneY, w: 80, h: 20 };

  drawDayTransition(ctx, gs);
}

function lootPickupClick(mx, my, gs) {
  const list = _lootList(gs);
  if (!list) { gs.screen = 'explore'; return; }

  // Done button
  if (gs._lootDoneBounds && hitTest(mx, my,
      gs._lootDoneBounds.x, gs._lootDoneBounds.y,
      gs._lootDoneBounds.w, gs._lootDoneBounds.h)) {
    closeLootPickup(gs);
    return;
  }

  // Take All
  if (gs._lootTakeAllBounds && hitTest(mx, my,
      gs._lootTakeAllBounds.x, gs._lootTakeAllBounds.y,
      gs._lootTakeAllBounds.w, gs._lootTakeAllBounds.h)) {
    lootTakeAll(gs);
    return;
  }

  // Click on loot pile → take item
  if (gs._lootPickupBounds) {
    for (const b of gs._lootPickupBounds) {
      if (hitTest(mx, my, b.x, b.y, b.w, b.h)) {
        const slot = list[b.idx];
        if (!slot) return;
        const def = getItemDef(slot.id);
        if (!def) return;
        const addWt = def.weight * slot.qty;
        if (calcWeight(gs.parent.inventory) + addWt > parentMaxCarry() * 1.1) {
          notify('Too heavy to carry!', 'warn');
          return;
        }
        addToInventory(gs.parent.inventory, slot.id, slot.qty);
        list.splice(b.idx, 1);
        _lootTaken(gs, slot);
        return;
      }
    }
  }

  // Click on bag item → drop back to loot pile
  if (gs._lootBagBounds) {
    for (const b of gs._lootBagBounds) {
      if (hitTest(mx, my, b.x, b.y, b.w, b.h)) {
        const slot = gs.parent.inventory[b.idx];
        if (!slot) return;
        const def = getItemDef(slot.id);
        if (!def) return;
        list.push({ id: slot.id, qty: slot.qty });
        gs.parent.inventory.splice(b.idx, 1);
        return;
      }
    }
  }
}

// Take everything that fits; closes the screen if nothing is left
function lootTakeAll(gs) {
  const list = _lootList(gs);
  if (!list) return;
  let left = 0;
  for (const item of [...list]) {
    const wt = calcWeight(gs.parent.inventory) + getItemDef(item.id).weight * item.qty;
    if (wt <= parentMaxCarry() * 1.1) {
      addToInventory(gs.parent.inventory, item.id, item.qty);
      list.splice(list.indexOf(item), 1);
      _lootTaken(gs, item);
    } else left++;
  }
  if (left) notify('Too heavy to carry everything.', 'warn');
  else closeLootPickup(gs);
}

function lootPickupKey(key, gs) {
  if (key === 'e') lootTakeAll(gs);
  else if (key === 'escape' || key === 'enter') closeLootPickup(gs);
}

function closeLootPickup(gs) {
  if (gs.lootSource) gs.lootSource = null;   // container keeps whatever was left
  else gs.combat = null;
  gs.screen  = 'explore';
  lootPickupUI.scroll = 0;
}
