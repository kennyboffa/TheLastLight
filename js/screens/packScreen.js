// packScreen.js — Pre-exploration inventory packing and equipment screen
'use strict';

let packUI = { invScroll: 0, storScroll: 0, selected: null, selectedSide: null, confirmExplore: false, dollWho: 'parent' };

/** Survivors fit to come along: at home, not on a mission, not badly hurt or exhausted. */
function availableCompanions(gs) {
  return (gs.survivors || []).filter(s => !s.onMission && !s.isExploring && !s.task
    && s.health > (s.maxHealth || 100) * 0.3 && (s.tiredness || 0) < 75);
}
function _packCompanion(gs) {
  const c = gs.exploreCompanionId && (gs.survivors || []).find(s => s.id === gs.exploreCompanionId);
  return c && availableCompanions(gs).includes(c) ? c : null;
}

function _packLayout() {
  const actionBarH = 28;
  const panelY = 28, panelH = CFG.H - 64 - actionBarH;
  const dollX = 10, dollW = 176;
  const invX = dollX + dollW + 6, invW = 262;
  const storX = invX + invW + 6, storW = CFG.W - 10 - storX;
  return { actionBarH, panelY, panelH, dollX, dollW, invX, invW, storX, storW };
}

function renderPackScreen(ctx, gs) {
  const loc = gs._pendingLoc;
  if (!loc) { gs.screen = 'shelter'; return; }

  fillRect(ctx, 0, 0, CFG.W, CFG.H, C.bg);

  // Title
  drawText(ctx, `PREPARE: ${loc.name.toUpperCase()}`, CFG.W/2, 16, C.textBright, 10, 'center', true);
  drawDivider(ctx, 10, 22, CFG.W - 20, C.border2);

  const mx = gs.mouse.x, my = gs.mouse.y;

  // ── Layout: character + slots | bag | storage ─────────────────────────────
  const L = _packLayout();
  const actionBarH = L.actionBarH, panelY = L.panelY, panelH = L.panelH;
  const invW = L.invW, storW = L.storW, invX = L.invX, storX = L.storX;
  // Companion: who comes along (cycles through the survivors fit to go)
  const comp = _packCompanion(gs);
  if (!comp) packUI.dollWho = 'parent';
  const avail = availableCompanions(gs);
  const cbx = CFG.W - 196, cby = 6;
  if (avail.length) {
    drawButton(ctx, cbx, cby, 186, 16, `Companion: ${comp ? comp.name : 'none'}  ▸`, hitTest(mx, my, cbx, cby, 186, 16), !!comp);
    gs._packCompBtn = { x: cbx, y: cby, w: 186, h: 16 };
  } else {
    drawText(ctx, 'No one free to come along', CFG.W - 12, 18, C.textDim, 7, 'right');
    gs._packCompBtn = null;
  }
  // Doll tabs: you / your companion; equipping goes to whoever is shown
  const who = packUI.dollWho === 'comp' && comp ? comp : gs.parent;
  gs._packDollBoxes = drawEquipDoll(ctx, gs, L.dollX, panelY, L.dollW, panelH, mx, my, who, false);
  gs._packTabs = [];
  const tabs = comp ? [['parent', gs.parent.name], ['comp', comp.name]] : [['parent', 'EQUIPMENT']];
  const tw = Math.floor((L.dollW - 8) / tabs.length);
  tabs.forEach(([id, label], i) => {
    const tx = L.dollX + 4 + i * tw, ty = panelY + 3;
    if (comp) drawButton(ctx, tx, ty, tw - 2, 14, label.slice(0, 12), hitTest(mx, my, tx, ty, tw - 2, 14), (packUI.dollWho === 'comp') === (id === 'comp'));
    else drawText(ctx, label, L.dollX + L.dollW / 2, panelY + 11, C.textDim, 7, 'center', true);
    gs._packTabs.push({ id, x: tx, y: ty, w: tw - 2, h: 14 });
  });

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
      fillRect(ctx, L.dollX, abY, CFG.W - 20, abH, '#0e1018');
      strokeRect(ctx, L.dollX, abY, CFG.W - 20, abH, C.border2);
      drawText(ctx, `Selected: ${def ? def.name : row.slot.id}${_equipStatText(def)}`, L.dollX + 8, abY + 11, C.textBright, 8);

      let bx = L.dollX + 8 + Math.min(260, Math.max(150, ctx.measureText(`Selected: ${def ? def.name : row.slot.id}${_equipStatText(def)}`).width + 16));
      const by = abY + 5;
      const bh = 18;

      // Equip straight from the bag or from storage
      if (equipSlotFor(def)) {
        const bw = 46;
        const hov = hitTest(mx, my, bx, by, bw, bh);
        drawButton(ctx, bx, by, bw, bh, 'Equip', hov);
        gs._packEquipBtn = { x: bx, y: by, w: bw, h: bh, action: 'equip', slot: row.slot, side: packUI.selectedSide };
        bx += bw + 6;
      } else {
        gs._packEquipBtn = null;
      }
      const mw = 80;
      const mhov = hitTest(mx, my, bx, by, mw, bh);
      const toStor = packUI.selectedSide === 'inv';
      drawButton(ctx, bx, by, mw, bh, toStor ? '→ Storage' : '→ My Bag', mhov);
      gs._packMoveBtn = { x: bx, y: by, w: mw, h: bh, action: toStor ? 'toStorage' : 'toBag', slot: row.slot };
    } else {
      // Row no longer found — deselect
      packUI.selected = null; packUI.selectedSide = null;
      gs._packEquipBtn = null; gs._packMoveBtn = null;
    }
  } else {
    // Hint text
    drawText(ctx, 'Click an item to select it, then choose an action. Click an equipment slot to take it off.', L.dollX + 8, abY + 11, C.textDim, 7);
    gs._packEquipBtn = null; gs._packMoveBtn = null;
  }

  // ── Bottom buttons ───────────────────────────────────────────────────────
  const btnY = CFG.H - 28;
  drawButton(ctx, 10,          btnY, 80, 22, '< Cancel', hitTest(mx, my, 10, btnY, 80, 22));
  drawButton(ctx, CFG.W - 120, btnY, 110, 22, 'Go Explore \u2192', hitTest(mx, my, CFG.W - 120, btnY, 110, 22), false, false);

  // Carry weight bar at bottom
  drawStatBar(ctx, 10, btnY - 10, CFG.W - 20, 5, parseFloat(wt), parseFloat(maxWt), parseFloat(wt) > parseFloat(maxWt) * 0.9 ? C.textWarn : '#2a6a4a');

  // ── Confirm exploration dialog ────────────────────────────────────────────
  if (packUI.confirmExplore) {
    const dw = 260, dh = 88;
    const dx = Math.round((CFG.W - dw) / 2), dy = Math.round((CFG.H - dh) / 2);
    drawModal(ctx, dx, dy, dw, dh, 'Confirm Departure');
    drawText(ctx, `Head to ${loc.name}?`, dx + dw/2, dy + 34, C.textBright, 9, 'center');
    drawText(ctx, 'You cannot return until the expedition ends.', dx + dw/2, dy + 47, C.textDim, 7, 'center');
    const yBtnY = dy + dh - 22;
    drawButton(ctx, dx + 10,        yBtnY, 108, 16, 'Yes — Let\'s go', hitTest(mx, my, dx + 10,       yBtnY, 108, 16));
    drawButton(ctx, dx + dw - 118,  yBtnY, 108, 16, 'No — Stay',       hitTest(mx, my, dx + dw - 118, yBtnY, 108, 16));
    gs._packConfirmBtns = {
      yes: { x: dx + 10,       y: yBtnY, w: 108, h: 16 },
      no:  { x: dx + dw - 118, y: yBtnY, w: 108, h: 16 },
    };
  }
}

function packScreenClick(mx, my, gs) {
  const btnY = CFG.H - 28;

  // Confirm dialog takes priority
  if (packUI.confirmExplore && gs._packConfirmBtns) {
    const cb = gs._packConfirmBtns;
    if (hitTest(mx, my, cb.yes.x, cb.yes.y, cb.yes.w, cb.yes.h)) {
      packUI.confirmExplore = false;
      packUI.selected = null; packUI.selectedSide = null;
      const loc = gs._pendingLoc;
      gs._pendingLoc = null;
      beginTravel(gs, loc, 'out');      // walk there on the world map, then explore
      return;
    }
    if (hitTest(mx, my, cb.no.x, cb.no.y, cb.no.w, cb.no.h)) {
      packUI.confirmExplore = false; return;
    }
    return; // click outside dialog — keep it open
  }

  // Companion picker: none → each free survivor → none
  if (gs._packCompBtn && hitTest(mx, my, gs._packCompBtn.x, gs._packCompBtn.y, gs._packCompBtn.w, gs._packCompBtn.h)) {
    const avail = availableCompanions(gs);
    const cur = _packCompanion(gs);
    const i = cur ? avail.indexOf(cur) : -1;
    const next = avail[i + 1] || null;
    gs.exploreCompanionId = next ? next.id : null;
    packUI.dollWho = next ? 'comp' : 'parent';
    if (next) { next.equipped = next.equipped || { weapon: null, chest: null, legs: null }; notify(`${next.name} will come with you.`, 'good'); }
    return;
  }
  for (const t of gs._packTabs || []) {
    if (hitTest(mx, my, t.x, t.y, t.w, t.h)) { packUI.dollWho = t.id; packUI.selected = null; return; }
  }
  // Cancel
  if (hitTest(mx, my, 10, btnY, 80, 22)) {
    packUI.selected = null; packUI.selectedSide = null; packUI.confirmExplore = false;
    gs._pendingLoc = null; gs.screen = 'shelter'; return;
  }
  // Go Explore — show confirm dialog first
  if (hitTest(mx, my, CFG.W - 120, btnY, 110, 22)) {
    packUI.confirmExplore = true; return;
  }

  // Action buttons (equip / move)
  if (gs._packEquipBtn) {
    const b = gs._packEquipBtn;
    if (hitTest(mx, my, b.x, b.y, b.w, b.h)) {
      const slot = b.slot;
      const def  = getItemDef(slot.id);
      if (!def) { packUI.selected = null; return; }
      const target = packUI.dollWho === 'comp' ? _packCompanion(gs) : null;
      equipItem(gs, slot.id, b.side === 'stor' ? gs.shelter.storage : gs.parent.inventory, target || undefined);
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

  // Equipment slot — take it off into the bag
  if (gs._packDollBoxes) {
    const box = gs._packDollBoxes.find(b => hitTest(mx, my, b.x, b.y, b.w, b.h));
    if (box) {
      const target = packUI.dollWho === 'comp' ? _packCompanion(gs) : null;
      if (box.id) unequipSlot(gs, box.key, target || undefined);
      packUI.selected = null; packUI.selectedSide = null; return;
    }
  }

  // Click in bag — select item
  const { panelY, panelH, invX, invW, storX, storW } = _packLayout();

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
  const { invX, invW } = _packLayout();
  if (gs.mouse.x < invX + invW) {
    packUI.invScroll = Math.max(0, packUI.invScroll + dy * 20);
  } else {
    packUI.storScroll = Math.max(0, packUI.storScroll + dy * 20);
  }
}
