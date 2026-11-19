// equipment.js — What the parent wears and carries in their hands
'use strict';
//
// Equipped items live in their slot, not in the bag: equipping moves an item
// out of an inventory, unequipping puts it back into the bag.

const EQUIP_SLOTS = [
  { key: 'weapon',   label: 'Hands' },
  { key: 'light',    label: 'Light' },
  { key: 'chest',    label: 'Chest' },
  { key: 'legs',     label: 'Legs' },
  { key: 'backpack', label: 'Back' },
];

/** Which slot an item goes in, or null if it can't be worn/held. */
function equipSlotFor(def) {
  if (!def) return null;
  if (def.type === 'weapon') return 'weapon';
  if (def.type === 'light') return 'light';
  if (def.type === 'backpack') return 'backpack';
  if (def.type === 'clothing') return def.slot;
  return null;
}

function getEquipped(p, key) {
  return key === 'backpack' ? p.backpackId : (p.equipped[key] || null);
}

function _setEquipped(p, key, id) {
  if (key === 'backpack') p.backpackId = id; else p.equipped[key] = id;
}

/** Fill in slots missing from older saves (the old 'armor' slot becomes 'chest'). */
function normalizeEquipment(p) {
  if (!p) return;
  if (!p.equipped) p.equipped = { weapon: null };
  if (p.equipped.chest === undefined) p.equipped.chest = null;
  if (p.equipped.legs === undefined) p.equipped.legs = null;
  if (p.equipped.light === undefined) p.equipped.light = null;
  if ('armor' in p.equipped) {
    if (p.equipped.armor && !p.equipped.chest && equipSlotFor(getItemDef(p.equipped.armor)) === 'chest') p.equipped.chest = p.equipped.armor;
    delete p.equipped.armor;
  }
}

/** Equip item `id` taken from `fromInv`; whatever was in the slot goes to the bag. */
function equipItem(gs, id, fromInv) {
  const p = gs.parent, def = getItemDef(id), key = equipSlotFor(def);
  if (!key) return false;
  normalizeEquipment(p);
  if (countInInventory(fromInv, id) <= 0) return false;
  removeFromInventory(fromInv, id, 1);
  const old = getEquipped(p, key);
  if (old) addToInventory(p.inventory, old, 1);
  _setEquipped(p, key, id);
  if (key === 'light') p.lightOn = false;
  if (typeof Audio !== 'undefined' && Audio.rustle) Audio.rustle();
  notify(key === 'light' ? `Equipped ${def.name}. Press L to switch it on.` : `Equipped ${def.name}.`, 'good');
  return true;
}

/** Take off whatever is in `key` and put it in the bag. */
function unequipSlot(gs, key) {
  const p = gs.parent, id = getEquipped(p, key);
  if (!id) return false;
  _setEquipped(p, key, null);
  if (key === 'light') p.lightOn = false;
  addToInventory(p.inventory, id, 1);
  notify(`Unequipped ${getItemDef(id).name}.`);
  return true;
}

/** Armor points from clothing. Gunfire is stopped much better by a ballistic vest. */
function playerArmor(p, vsGunfire) {
  let a = 0;
  for (const key of ['chest', 'legs']) {
    const def = p.equipped && p.equipped[key] ? getItemDef(p.equipped[key]) : null;
    if (!def) continue;
    a += (vsGunfire && def.ballistic != null) ? def.ballistic : (def.armor || 0);
  }
  return a;
}

/** Reduce an incoming hit by armor. Fractional armor blocks an extra point some of the time. */
function applyArmor(p, dmg, vsGunfire) {
  const a = playerArmor(p, vsGunfire);
  const block = Math.floor(a) + (Math.random() < a % 1 ? 1 : 0);
  return { dealt: Math.max(1, dmg - block), blocked: Math.min(block, Math.max(0, dmg - 1)) };
}

function hasVest(p) {
  const id = p && p.equipped && p.equipped.chest;
  return !!(id && getItemDef(id) && getItemDef(id).ballistic != null);
}

// ── Paper doll ───────────────────────────────────────────────────────────────
// The character drawn large, with a box per slot. Returns the slot boxes so
// the screen can handle clicks (click a filled slot to take the item off).

const DOLL_BOX = 30;

function drawEquipDoll(ctx, gs, x, y, w, h, mx, my) {
  const p = gs.parent;
  normalizeEquipment(p);
  drawPanel(ctx, x, y, w, h, '#0c0f14', C.border2);
  drawText(ctx, 'EQUIPMENT', x + w / 2, y + 10, C.textDim, 7, 'center', true);

  // Character, three times the in-game size, holding the equipped weapon.
  // (The idle frame's body sits 12px left of the frame centre and its feet
  // 10px below the anchor, so compensate to stand it in the middle.)
  const K = h > 250 ? 3 : 2;
  const footY = y + h - 30;
  const cx = x + w / 2;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(cx, footY, 8 * K, 2 * K, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(cx + 12 * K, footY - 10 * K);
  ctx.scale(K, K);
  drawParent(ctx, 0, 0, 2, 1, 0, p.gender, 'front', p.equipped.weapon ? { id: p.equipped.weapon, t0: 0 } : null);
  ctx.restore();

  // Slots: left column = back / hands / light, right column = chest / legs
  const B = DOLL_BOX, lx = x + 8, rx = x + w - 8 - B;
  const top = y + 26, gap = Math.max(40, Math.floor((footY - top - B) / 2));
  const pos = {
    backpack: [lx, top], weapon: [lx, top + gap], light: [lx, top + gap * 2],
    chest: [rx, top + Math.round(gap * 0.5)], legs: [rx, top + Math.round(gap * 1.5)],
  };
  const boxes = [];
  for (const sl of EQUIP_SLOTS) {
    const [bx, by] = pos[sl.key];
    const id = getEquipped(p, sl.key);
    const def = id ? getItemDef(id) : null;
    const hov = hitTest(mx, my, bx, by, B, B);
    fillRect(ctx, bx, by, B, B, hov && id ? '#1e2634' : '#141820');
    strokeRect(ctx, bx, by, B, B, id ? (hov ? '#a0b0c8' : '#5a6a80') : '#2a303a');
    drawText(ctx, sl.label.toUpperCase(), bx + B / 2, by - 3, C.textDim, 6, 'center');
    if (def) {
      if (!drawItemIcon(ctx, id, bx + 3, by + 3, B - 6)) fillRect(ctx, bx + 8, by + 8, B - 16, B - 16, itemTypeColor(def.type));
      const nm = def.name.length > 11 ? def.name.slice(0, 10) + '.' : def.name;
      drawText(ctx, nm, bx + B / 2, by + B + 7, C.textBright, 6, 'center');
    } else {
      drawText(ctx, '-', bx + B / 2, by + B / 2 + 3, '#3a4048', 8, 'center');
    }
    boxes.push({ key: sl.key, x: bx, y: by, w: B, h: B, id });
  }

  // Protection summary
  const a = playerArmor(p, false), g = playerArmor(p, true);
  const fmt = v => (Math.round(v * 10) / 10).toString();
  drawText(ctx, `Armor ${fmt(a)}${g !== a ? `   vs guns ${fmt(g)}` : ''}`, cx, y + h - 16, a > 0 || g > 0 ? '#8ab0d0' : C.textDim, 7, 'center');
  const hovBox = boxes.find(b => b.id && hitTest(mx, my, b.x, b.y, b.w, b.h));
  drawText(ctx, hovBox ? 'Click to take off' : 'Select an item and Equip', cx, y + h - 6, '#4a5260', 6, 'center');
  return boxes;
}

/** Small shield icon shown next to the HP bar while a bulletproof vest is worn. */
function drawArmorIcon(ctx, x, y) {
  ctx.save();
  ctx.fillStyle = '#1a2028';
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x + 8, y); ctx.lineTo(x + 8, y + 5); ctx.lineTo(x + 4, y + 9); ctx.lineTo(x, y + 5); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#7a9ab8';
  ctx.beginPath();
  ctx.moveTo(x + 1, y + 1); ctx.lineTo(x + 7, y + 1); ctx.lineTo(x + 7, y + 5); ctx.lineTo(x + 4, y + 8); ctx.lineTo(x + 1, y + 5); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#c8d8e8';
  ctx.fillRect(x + 2, y + 2, 2, 3);
  ctx.restore();
}

/** Short stat suffix for an equippable item, e.g. "  (armor 0.5)". */
function _equipStatText(def) {
  if (!def) return '';
  if (def.type === 'clothing') {
    if (def.ballistic != null) return `  (armor ${def.armor}, vs guns ${def.ballistic})`;
    return def.armor ? `  (armor ${def.armor})` : '  (no protection)';
  }
  if (def.type === 'weapon' && def.damage) return Array.isArray(def.damage) ? `  (${def.damage[0]}-${def.damage[1]} dmg)` : `  (${def.damage} dmg)`;
  if (def.type === 'backpack') return `  (+${def.carryBonus} kg)`;
  return '';
}
