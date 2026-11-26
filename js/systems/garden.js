// garden.js — A rubble garden on the surface over the bunker.
//
// Three beds hidden among the debris. Plant seeds, keep them watered (rain
// does it for you; dirty water is fine for plants), and in a few days you
// harvest real food. Two dry days and a crop withers. Animals dig at the beds
// now and then (less with a dog around), and green growing things show from
// the air, so every planted bed adds a little suspicion each day.
'use strict';

Object.assign(ITEMS_DB, {
  seeds_potato: { id: 'seeds_potato', name: 'Potato Seed', type: 'material', weight: 0.2, value: 10, stackable: true,
    desc: 'Sprouting seed potatoes. Plant in the garden: ready in 5 days.' },
  seeds_beans:  { id: 'seeds_beans',  name: 'Bean Seeds',  type: 'material', weight: 0.05, value: 8, stackable: true,
    desc: 'A twist of paper with dried beans. Plant in the garden: ready in 4 days.' },
  seeds_herbs:  { id: 'seeds_herbs',  name: 'Herb Seeds',  type: 'material', weight: 0.02, value: 9, stackable: true,
    desc: 'Mint, yarrow, chamomile. Plant in the garden: ready in 3 days.' },
  potato:       { id: 'potato', name: 'Potato', type: 'food', weight: 0.3, value: 6, hunger: -12, thirst: 0, depression: 2,
    desc: 'Edible raw, barely. Much better baked over a fire.', stackable: true },
  baked_potato: { id: 'baked_potato', name: 'Baked Potato', type: 'food', weight: 0.3, value: 9, hunger: -30, thirst: 2, depression: -6,
    desc: 'Charred skin, soft inside. Tastes like before.', stackable: true },
  green_beans:  { id: 'green_beans', name: 'Green Beans', type: 'food', weight: 0.2, value: 7, hunger: -14, thirst: -4, depression: -4,
    desc: 'Fresh and crunchy. Lily pretends not to like them.', stackable: true },
  herbs:        { id: 'herbs', name: 'Fresh Herbs', type: 'food', weight: 0.05, value: 8, hunger: -2, thirst: -6, depression: -10, health: 3,
    desc: 'A bitter tea of mint and yarrow. Settles the stomach and the nerves.', stackable: true },
});
COOK_MAP.potato = 'baked_potato';

const CROPS = {
  seeds_potato: { name: 'Potatoes', days: 5, out: 'potato', yield: [3, 5], flower: '#e8e4d0' },
  seeds_beans:  { name: 'Beans',    days: 4, out: 'green_beans', yield: [3, 4], flower: '#7ab050' },
  seeds_herbs:  { name: 'Herbs',    days: 3, out: 'herbs', yield: [2, 3], flower: '#a088c8' },
};

UPGRADES_DB.garden = {
  id: 'garden', name: 'Rubble Garden',
  desc: 'Three planting beds hidden in the rubble above. Grow potatoes, beans and herbs. Rain waters them. Plants show from the air: a little suspicion.',
  buildCost: { wood: 6, metal: 2, cloth: 2 }, needsTools: false, buildNoise: 3,
  buildTime: 3, requiresRoom: null, key: 'hasGarden',
};

// Seeds turn up in homes, gardens and markets; Aldo sells them
for (const [table, entry] of [
  ['home_light', ['seeds_beans', 1, 2, 14]], ['home_medium', ['seeds_potato', 1, 2, 14]], ['church_home', ['seeds_herbs', 1, 2, 20]],
  ['village_market', ['seeds_potato', 1, 3, 25]], ['rooftop_main', ['seeds_herbs', 1, 2, 35]], ['rooftop_main', ['seeds_beans', 1, 2, 35]],
  ['cabin_cabin', ['seeds_potato', 1, 2, 18]], ['house_home', ['seeds_beans', 1, 2, 12]],
]) {
  const t = (typeof BUILDING_LOOT !== 'undefined' && BUILDING_LOOT[table]) || LOOT_TABLES[table];
  if (t) t.push(entry);
}
if (typeof TRADERS !== 'undefined' && TRADERS.church) TRADERS.church.pool.push(['seeds_potato', 0, 2], ['seeds_beans', 0, 2], ['seeds_herbs', 0, 1]);

function garden(gs) {
  if (!gs.shelter.hasGarden) return null;
  if (!gs.shelter.garden) {
    gs.shelter.garden = { beds: [0, 1, 2].map(() => ({ crop: null, growth: 0, water: 0.6, dry: 0, dead: false })) };
    if (typeof showHint === 'function') showHint(gs, 'garden', 'Your rubble garden is up top, right of the hatch. Click it to plant seeds, water and harvest.');
  }
  return gs.shelter.garden;
}

function bedStatus(b) {
  if (!b.crop) return 'Empty';
  if (b.dead) return 'Withered';
  if (b.growth >= 1) return 'Ready to harvest';
  if (b.water < 0.3) return b.dry ? 'Parched! Water today' : 'Dry';
  return `Growing (${Math.round(b.growth * 100)}%)`;
}

// ── Actions ──────────────────────────────────────────────────────────────────

function _takeFromStores(gs, id, n) {
  const st = countInInventory(gs.shelter.storage, id), inv = countInInventory(gs.parent.inventory, id);
  if (st + inv < n) return false;
  const a = Math.min(st, n);
  if (a) removeFromInventory(gs.shelter.storage, id, a);
  if (n - a) removeFromInventory(gs.parent.inventory, id, n - a);
  return true;
}
function seedCount(gs, id) { return countInInventory(gs.shelter.storage, id) + countInInventory(gs.parent.inventory, id); }

function plantBed(gs, i, seedId) {
  const g = garden(gs), b = g && g.beds[i];
  if (!b || (b.crop && !b.dead)) return { ok: false, msg: 'That bed is in use.' };
  if (!_takeFromStores(gs, seedId, 1)) return { ok: false, msg: 'No seeds of that kind.' };
  Object.assign(b, { crop: seedId, growth: 0, water: Math.max(b.water, 0.5), dry: 0, dead: false, planted: gs.day, nibbled: false });
  gs.time += 15;
  giveXP(gs.parent, 3, gs);
  return { ok: true, msg: `Planted ${CROPS[seedId].name.toLowerCase()}.` };
}

function waterBed(gs, i) {
  const g = garden(gs), b = g && g.beds[i];
  if (!b || !b.crop || b.dead) return { ok: false, msg: 'Nothing to water.' };
  if (b.water >= 0.95) return { ok: false, msg: 'Already soaked.' };
  // dirty water does fine for plants — save the clean stuff
  const src = ['dirty_water', 'water_bottle'].find(id => seedCount(gs, id) > 0);
  if (!src) return { ok: false, msg: 'No water in storage.' };
  _takeFromStores(gs, src, 1);
  b.water = 1; b.dry = 0;
  gs.time += 10;
  return { ok: true, msg: `Watered (${getItemDef(src).name}).` };
}

function harvestBed(gs, i) {
  const g = garden(gs), b = g && g.beds[i];
  if (!b || !b.crop) return { ok: false, msg: 'Nothing here.' };
  if (b.dead) { Object.assign(b, { crop: null, dead: false, growth: 0 }); return { ok: true, msg: 'Cleared the withered stalks.' }; }
  if (b.growth < 1) return { ok: false, msg: 'Not ready yet.' };
  const c = CROPS[b.crop];
  let n = randInt(c.yield[0], c.yield[1]) + (b.nibbled ? -1 : 0) + (b.perfect ? 1 : 0);
  n = Math.max(1, n);
  addToInventory(gs.shelter.storage, c.out, n);
  // every so often a plant goes to seed and you keep some
  const keptSeed = chance(45);
  if (keptSeed) addToInventory(gs.shelter.storage, b.crop, 1);
  Object.assign(b, { crop: null, growth: 0, dead: false });
  gs.time += 20;
  gs.parent.depression = clamp(gs.parent.depression - 4, 0, 100);
  if (gs.child) gs.child.depression = clamp(gs.child.depression - 6, 0, 100);
  giveXP(gs.parent, 10, gs);
  addLog(`Harvested ${n} ${getItemDef(c.out).name.toLowerCase()}${keptSeed ? ' (and saved some seed)' : ''}.`, 'good');
  return { ok: true, msg: `Harvested ${n} ${getItemDef(c.out).name}.` };
}

// ── Simulation ───────────────────────────────────────────────────────────────

/** Rain keeps the beds wet (called from the stat tick while it rains). */
function gardenRain(gs) {
  const g = garden(gs);
  if (!g) return;
  for (const b of g.beds) { b.water = 1; b.dry = 0; }
}

/** A night passes: plants grow if watered, wither if not; pests; suspicion. */
function gardenDayTick(gs) {
  const g = garden(gs);
  if (!g) return;
  const w = gs.weather ? gs.weather.type : 'clear';
  let planted = 0;
  for (const b of g.beds) {
    if (!b.crop || b.dead) continue;
    planted++;
    const c = CROPS[b.crop];
    if (b.water >= 0.3) {
      b.growth = Math.min(1, b.growth + (1 / c.days) * (w === 'clear' ? 1.1 : w === 'rain' ? 0.95 : 1));
      if (b.growth >= 1 && b.perfect === undefined) b.perfect = !b.nibbled && !b.wasDry;
    } else {
      b.dry++; b.wasDry = true;
      if (b.dry >= 2) { b.dead = true; addLog(`The ${c.name.toLowerCase()} withered. Nobody watered them.`, 'warn'); continue; }
      addLog(`The ${c.name.toLowerCase()} are parched.`, 'warn');
    }
    b.water = Math.max(0, b.water - (w === 'clear' ? 0.55 : 0.4));
    // something digs at the beds at night (a dog keeps them off)
    if (b.growth > 0.2 && b.growth < 1 && chance(gs.dog && gs.dog.alive ? 3 : 10)) {
      b.growth = Math.max(0.05, b.growth - 0.25); b.nibbled = true;
      addLog(`Something dug at the ${c.name.toLowerCase()} in the night.`, 'warn');
    }
  }
  // green shows from the air
  if (planted) gs.suspicion = clamp(gs.suspicion + 0.4 * planted, 0, CFG.SUSPICION_MAX);
}

// ── Drawing (surface, in shelter world coords) ───────────────────────────────

const GARDEN_X = [298, 330, 362];
const GARDEN_HIT = { x: 284, y: CFG.SURFACE_H - 26, w: 96, h: 28 };

function drawGardenSurface(ctx, gs) {
  const g = garden(gs);
  if (!g) return;
  const gy = CFG.SURFACE_H - 2;
  const t = performance.now() / 1000;
  g.beds.forEach((b, i) => {
    const x = GARDEN_X[i];
    // bed: broken planks and rubble around dark soil
    fillRect(ctx, x - 12, gy - 4, 24, 4, '#2a1c12');
    fillRect(ctx, x - 13, gy - 5, 3, 5, '#4a3a2a'); fillRect(ctx, x + 10, gy - 6, 3, 6, '#3e3226');
    fillRect(ctx, x - 10, gy - 5, 20, 1, b.water > 0.5 ? '#1e140c' : '#3a2a1c');
    fillRect(ctx, x - 16, gy - 3, 3, 3, '#5a5650'); fillRect(ctx, x + 14, gy - 2, 4, 2, '#4a4844');
    if (!b.crop) return;
    const c = CROPS[b.crop];
    const dryK = b.dead ? 1 : b.water < 0.3 ? 0.6 : 0;
    const leaf = dryK >= 1 ? '#6a5430' : dryK > 0 ? '#7a8a3a' : '#4a8a3a';
    const leaf2 = dryK >= 1 ? '#5a4428' : dryK > 0 ? '#6a7a30' : '#3a6e2e';
    const h = b.dead ? 4 : Math.round(2 + b.growth * 11);
    const sway = (k) => Math.round(Math.sin(t * 1.6 + i + k) * (b.dead ? 0 : 0.6));
    for (let p = -1; p <= 1; p++) {
      const px = x + p * 6;
      const ph = h - Math.abs(p) * 2;
      if (ph <= 0) continue;
      fillRect(ctx, px + sway(1), gy - 5 - ph, 1, ph, leaf2);
      for (let k = 2; k < ph; k += 3) {
        fillRect(ctx, px - 2 + sway(k), gy - 5 - k, 2, 1, leaf);
        fillRect(ctx, px + 1 + sway(k), gy - 6 - k, 2, 1, leaf);
      }
      if (b.growth >= 0.75 && !b.dead) {
        ctx.fillStyle = c.flower;
        ctx.fillRect(px + sway(ph), gy - 6 - ph, 2, 2);
        if (b.growth >= 1) { ctx.fillStyle = b.crop === 'seeds_beans' ? '#9ad060' : '#f0e8a0'; ctx.fillRect(px - 2, gy - 5 - Math.round(ph / 2), 1, 3); }
      }
    }
  });
  // ready to harvest: a little marker so you notice from below
  if (g.beds.some(b => b.crop && !b.dead && b.growth >= 1)) {
    const a = 0.5 + 0.5 * Math.sin(t * 3);
    ctx.save(); ctx.globalAlpha = a;
    drawText(ctx, '✿', GARDEN_HIT.x + GARDEN_HIT.w / 2, GARDEN_HIT.y - 2, '#e8d080', 8, 'center', true);
    ctx.restore();
  }
}

// ── Menu ─────────────────────────────────────────────────────────────────────

const GARDEN_UI = { x: 40, y: 40, w: 360, h: 230 };

function drawGardenMenu(ctx, gs, mx, my) {
  const g = garden(gs), U = GARDEN_UI;
  drawModal(ctx, U.x, U.y, U.w, U.h, 'RUBBLE GARDEN');
  gs._gardenBtns = [];
  const btn = (x, y, w, label, act, disabled) => {
    const hov = hitTest(mx, my, x, y, w, 16);
    drawButton(ctx, x, y, w, 16, label, hov, false, disabled);
    if (!disabled) gs._gardenBtns.push({ x, y, w, h: 16, act });
  };
  const seeds = Object.keys(CROPS).filter(id => seedCount(gs, id) > 0);
  const water = seedCount(gs, 'dirty_water') + seedCount(gs, 'water_bottle');
  g.beds.forEach((b, i) => {
    const y = U.y + 26 + i * 56;
    fillRect(ctx, U.x + 8, y, U.w - 16, 50, '#0e0e14');
    strokeRect(ctx, U.x + 8, y, U.w - 16, 50, C.border);
    const name = b.crop ? CROPS[b.crop].name : 'Bed ' + (i + 1);
    drawText(ctx, name, U.x + 16, y + 12, C.textBright, 8, 'left', true);
    const stCol = b.dead ? C.textDanger : b.growth >= 1 ? C.textGood : b.water < 0.3 && b.crop ? C.textWarn : C.textDim;
    drawText(ctx, bedStatus(b), U.x + 100, y + 12, stCol, 7, 'left');
    if (b.crop && !b.dead) {
      drawText(ctx, 'growth', U.x + 16, y + 25, C.textDim, 6, 'left');
      drawStatBar(ctx, U.x + 50, y + 20, 90, 5, b.growth * 100, 100, '#6aa04a');
      drawText(ctx, 'water', U.x + 16, y + 35, C.textDim, 6, 'left');
      drawStatBar(ctx, U.x + 50, y + 30, 90, 5, b.water * 100, 100, '#4a7ab0');
      const days = Math.max(0, Math.ceil((1 - b.growth) * CROPS[b.crop].days));
      if (days) drawText(ctx, `~${days} day${days > 1 ? 's' : ''} left`, U.x + 148, y + 30, C.textDim, 6, 'left');
    }
    const bx = U.x + U.w - 16;
    if (!b.crop) {
      if (!seeds.length) drawText(ctx, 'No seeds (find them in homes, or buy from Aldo)', bx, y + 32, C.textDim, 6, 'right');
      let x = bx;
      for (const sid of seeds.slice().reverse()) {
        const label = `Plant ${CROPS[sid].name} (${seedCount(gs, sid)})`;
        const w = Math.round(label.length * 5.6 + 12);
        x -= w;
        btn(x, y + 26, w, label, () => plantBed(gs, i, sid));
        x -= 4;
      }
    } else if (b.dead || b.growth >= 1) {
      btn(bx - 70, y + 26, 70, b.dead ? 'Clear' : 'Harvest', () => harvestBed(gs, i));
    } else {
      btn(bx - 80, y + 26, 80, `Water (${water})`, () => waterBed(gs, i), water <= 0 || b.water >= 0.95);
    }
  });
  drawText(ctx, 'Rain waters every bed. Dirty water is fine for plants. Each planted bed adds a little suspicion.', U.x + 10, U.y + U.h - 28, C.textDim, 6, 'left');
  btn(U.x + 8, U.y + U.h - 20, 50, 'Close', () => { shelterUI.activeMenu = null; });
}

function gardenMenuClick(gs, mx, my) {
  for (const b of gs._gardenBtns || []) {
    if (!hitTest(mx, my, b.x, b.y, b.w, b.h)) continue;
    const r = b.act();
    if (r && r.msg) notify(r.msg, r.ok ? 'good' : 'warn');
    return;
  }
  const U = GARDEN_UI;
  if (!hitTest(mx, my, U.x, U.y, U.w, U.h)) shelterUI.activeMenu = null;
}
