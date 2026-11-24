// traders.js — Two people who trade: Brother Aldo at the old church (basics)
// and Vera in the mall (better gear). They sell at 3x an item's value and buy
// at its value. Stock changes every 3 days. You can try to rob them; they are
// tough, and if they die they are gone for good.
'use strict';

const TRADE_MARKUP = 3;
const TRADER_RESTOCK_DAYS = 3;

const TRADERS = {
  church: {
    id: 'church', name: 'Brother Aldo', locId: 'church', building: 'The Rectory',
    sprite: 'survivor_2', weapon: 'axe',
    greet: 'A broad, fair-haired man in a patched work jacket looks up from a ledger. An axe leans within easy reach. "Peace, traveller. If you came to trade, you\'re welcome. If you came for anything else, you\'re not."',
    hostileGreet: 'Aldo is on his feet before you are through the door, axe in both hands. "You made your choice last time. Get out of my house."',
    enemy: { id: 'trader_church', name: 'Brother Aldo', type: 'human', hp: 90, maxHp: 90, armor: 3, accuracy: 82, agility: 6,
             damage: [5, 9], sprite: 'trader_church', detect: 5, desc: 'The rectory\'s keeper. Big, calm, and good with an axe.' },
    gear: [['axe', 1], ['work_jacket', 1]],
    pool: [['bandage', 2, 4], ['canned_beans', 2, 3], ['canned_soup', 1, 2], ['water_bottle', 2, 3], ['matches', 1, 3],
           ['cloth', 2, 4], ['painkiller', 0, 1], ['batteries', 0, 2], ['dried_berries', 1, 3],
           ['canned_fruit', 0, 1], ['rope', 0, 1], ['screws_nuts', 0, 3]],
  },
  city: {
    id: 'city', name: 'Vera', locId: 'mall', building: "Vera's Exchange",
    sprite: 'survivor_1', weapon: 'shotgun',
    greet: 'Behind a counter of welded shopping carts sits a woman in a police vest, a shotgun across her knees. "Look all you like. Touch nothing until we agree on a price."',
    hostileGreet: 'The shotgun comes up the moment Vera sees you. "Wrong store. Turn around, slowly."',
    enemy: { id: 'trader_city', name: 'Vera', type: 'human', hp: 120, maxHp: 120, armor: 6, accuracy: 78, agility: 5,
             damage: [7, 12], isRanged: true, rangeTiles: 4, sprite: 'trader_city', detect: 6, desc: 'Runs the mall exchange. Armoured and armed.' },
    gear: [['shotgun', 1], ['bulletproof_vest', 1], ['shotgun_ammo', 8]],
    pool: [['medkit', 1, 2], ['antibiotics', 0, 1], ['pistol_ammo', 8, 16], ['rifle_ammo', 0, 6], ['shotgun_ammo', 0, 8],
           ['purified_water', 2, 3], ['canned_meat', 1, 3], ['energy_bar', 1, 3], ['batteries', 2, 4], ['flashlight', 0, 1],
           ['tools', 0, 1], ['electronics', 1, 2], ['backpack', 0, 1], ['leather_jacket', 0, 1], ['cargo_pants', 0, 1],
           ['pistol', 0, 1], ['bike_chain', 0, 1], ['bike_wheels', 0, 1], ['screws_nuts', 2, 6]],
  },
};

// A wandering trader met in random events: no home, fresh cart every time
TRADERS.wanderer = {
  id: 'wanderer', name: 'Wandering Trader', locId: null, building: null, sprite: 'survivor_1', weapon: null,
  enemy: { id: 'trader_wanderer', name: 'Wandering Trader', type: 'human', hp: 40, maxHp: 40, armor: 1, accuracy: 70, agility: 6, damage: [3, 6], sprite: 'human_hostile' },
  gear: [],
  pool: [['canned_beans', 1, 2], ['water_bottle', 1, 2], ['bandage', 0, 2], ['batteries', 0, 2], ['matches', 0, 2],
         ['dried_berries', 0, 2], ['rope', 0, 1], ['painkiller', 0, 1], ['screws_nuts', 0, 2], ['jerky', 0, 2]],
};

function openWandererTrade(gs) {
  const st = traderState(gs, 'wanderer');
  st.stock = _rollTraderStock(TRADERS.wanderer);
  st.nextRestock = gs.day + 1;
  openTrade(gs, 'wanderer');
}

// ── State ────────────────────────────────────────────────────────────────────

function traderState(gs, id) {
  if (!gs.traders) gs.traders = {};
  if (!gs.traders[id]) {
    const t = TRADERS[id];
    gs.traders[id] = { alive: true, hostile: false, met: false, hp: t.enemy.maxHp, stock: null, nextRestock: 0, asked: {} };
  }
  const st = gs.traders[id];
  if (st.alive && (!st.stock || gs.day >= st.nextRestock)) {
    st.stock = _rollTraderStock(TRADERS[id]);
    st.nextRestock = gs.day + TRADER_RESTOCK_DAYS;
    st.hp = TRADERS[id].enemy.maxHp;           // patched up between visits
  }
  return st;
}

function _rollTraderStock(t) {
  const out = [];
  for (const [id, min, max] of t.pool) {
    if (!getItemDef(id)) continue;
    const q = randInt(min, max);
    if (q > 0) out.push({ id, qty: q });
  }
  // Always a handful of things, never empty
  if (out.length < 4) for (const [id, , max] of t.pool) { if (out.length >= 4) break; if (getItemDef(id) && !out.some(s => s.id === id) && max > 0) out.push({ id, qty: 1 }); }
  return out;
}

function buyPrice(id)  { return Math.max(1, Math.round((getItemDef(id)?.value || 1) * TRADE_MARKUP)); }
function sellPrice(id) { return Math.max(1, Math.round(getItemDef(id)?.value || 1)); }

// ── Placing them in the world ────────────────────────────────────────────────

/** Put living traders into their building when a location is generated. */
function placeTraders(gs, loc, buildings) {
  for (const t of Object.values(TRADERS)) {
    if (t.locId !== loc.id) continue;
    const st = traderState(gs, t.id);
    const bld = buildings.find(b => b.label === t.building);
    if (!bld) continue;
    const fl = bld.floors[0];
    fl.encounters = [];                         // nobody else bothers them at home
    if (st.alive) fl.npcs = [{ traderId: t.id, x: Math.round(fl.width * 0.62) }];
  }
}

function _nearNpc(area, px) {
  return (area.npcs || []).find(n => Math.abs(n.x - px) < 34 && traderState(GS, n.traderId).alive);
}

/** Draw traders standing in their area (not while fighting them). */
function drawAreaNpcs(ctx, gs, area, px, groundY) {
  for (const n of area.npcs || []) {
    const t = TRADERS[n.traderId], st = traderState(gs, n.traderId);
    if (!st.alive) continue;
    if (gs.inCombat && gs.combat && gs.combat._traderId === n.traderId) continue;   // drawn as the enemy
    const facing = px >= n.x ? 1 : -1;
    drawCharSprite(ctx, t.sprite, n.x, groundY, 2, facing, 48, { id: t.weapon, t0: 0 });
    drawText(ctx, t.name, n.x, groundY - 56, st.hostile ? '#cc5544' : '#d8c890', 7, 'center', true);
    drawText(ctx, st.hostile ? 'hostile' : 'trader', n.x, groundY - 49, C.textDim, 6, 'center');
    if (!gs.inCombat && Math.abs(px - n.x) < 34) drawText(ctx, '[E] Talk', n.x, groundY - 66, C.textBright, 7, 'center');
  }
}

/** E near a trader: open the conversation. Returns true if it did. */
function interactTrader(gs, area, px) {
  const n = _nearNpc(area, px);
  if (!n) return false;
  openTraderTalk(gs, n.traderId);
  return true;
}

// ── Conversation ─────────────────────────────────────────────────────────────

function _openEvent(gs, ev) {
  gs.event = ev;
  gs.screen = 'event';
  gs._returnTo = 'explore';
  eventUI.openLockFrames = 4;
  eventUI.resultText = null;
}

function openTraderTalk(gs, id) {
  const t = TRADERS[id], st = traderState(gs, id);
  if (st.hostile) {
    _openEvent(gs, { id: 'trader_' + id, type: 'event', title: t.name, text: t.hostileGreet, choices: [
      { label: 'Raise your hands and back out', action: () => 'You back out the way you came. Nobody follows.' },
      { label: 'Try to make amends (give 40 worth of goods)', when: g => _bagValue(g) >= 40, action: g => {
          _payGoods(g, 40);
          st.hostile = false;
          return `${t.name} watches you set the goods down. A long silence. "...Fine. Once. Don't make me regret it."`;
        } },
      { label: 'Attack', action: g => { startTraderFight(g, id); return null; } },
    ] });
    return;
  }
  const first = !st.met;
  st.met = true;
  const root = id === 'church' ? _aldoTalk(gs, t, st, first) : _veraTalk(gs, t, st, first);
  _openEvent(gs, root);
}

function _bagValue(gs) { return gs.parent.inventory.reduce((s, sl) => s + sellPrice(sl.id) * sl.qty, 0); }
function _payGoods(gs, amount) {
  // cheapest things first, until the amount is covered
  const inv = [...gs.parent.inventory].sort((a, b) => sellPrice(a.id) - sellPrice(b.id));
  let paid = 0;
  for (const sl of inv) {
    while (paid < amount && countInInventory(gs.parent.inventory, sl.id) > 0) {
      removeFromInventory(gs.parent.inventory, sl.id, 1);
      paid += sellPrice(sl.id);
    }
  }
}

function _robNode(gs, t, id, root) {
  return {
    text: id === 'church'
      ? 'Aldo closes the ledger slowly. "I buried a lot of people who thought the end of the world made things simple." His hand rests on the axe. "Think about the girl waiting for you. Then decide."'
      : 'Vera doesn\'t move except for her thumb, which slides the safety off. "Everyone tries it once. The ones who tried it are out back."',
    choices: [
      { label: 'Back off. "Forget I said anything."', next: () => { root.text = id === 'church' ? '"Already forgotten," Aldo says. He does not take his hand off the axe.' : '"Smart," Vera says. The safety clicks back on.'; return root; } },
      { label: 'Attack', action: g => { startTraderFight(g, id); return null; } },
    ],
  };
}

function _aldoTalk(gs, t, st, first) {
  const root = {
    id: 'trader_church', type: 'event', title: t.name,
    text: first ? t.greet : '"Back again. The Lord provides, and so, occasionally, do I." Aldo gestures at his shelves.',
    choices: [],
  };
  const restockIn = Math.max(0, st.nextRestock - gs.day);
  root.choices = [
    { label: 'Let\'s trade.', action: g => { openTrade(g, 'church'); return null; } },
    { label: 'Who are you?', reply: '"Aldo. I kept this church before. I keep it now, after a fashion." He smiles thinly. "People still come here looking for something. Mostly it\'s bandages."' },
    { label: 'What do you know about the machines?', next: () => ({
        text: '"They don\'t come inside churches much. Not out of respect. There\'s nothing here they want." He taps the table. "What do you want to know?"',
        choices: [
          { label: 'Where are they strongest?', reply: '"The bunker in the north and the hospital. Lights at all hours. If you go, go at dawn, and go quiet."' },
          { label: 'Can they be stopped?', reply: '"Stopped? I doubt it. Avoided, yes. Noise draws them. Gunfire most of all. Even I hear it from here."' },
          { label: 'Back', next: () => root },
        ],
      }) },
    { label: 'Anyone else out there trading?', reply: g => {
        const known = (g.unlockedLocations || []).includes('mall');
        if (!known) {
          g.unlockedLocations = [...(g.unlockedLocations || ['forest', 'church']), 'mall'];
          g.mapNew = [...new Set([...(g.mapNew || []), 'mall'])];
          notify('The mall is now marked on your map.', 'good');
        }
        return '"A woman named Vera runs an exchange out of the old mall, in the food court. Better stock than mine, worse manners, and she prices like the world still has banks." He marks it on your map. "Don\'t try anything there. Truly."';
      } },
    { label: 'When do you get new supplies?', reply: `"Every few days a cart comes through. Ask me again in ${restockIn || 'a'} day${restockIn === 1 ? '' : 's'}."` },
    { label: 'I have a daughter. She\'s sick sometimes...', when: g => g.day >= 3, reply: '"Then keep antibiotics, not bullets." He considers you. "Vera sometimes has them. And the hospital pharmacy, if you are brave or foolish."' },
    { label: 'Hand over your supplies. Now.', next: () => _robNode(gs, t, 'church', root) },
    { label: 'Goodbye.', action: () => '"Go carefully," Aldo says, already back in his ledger.' },
  ];
  return root;
}

function _veraTalk(gs, t, st, first) {
  const root = {
    id: 'trader_city', type: 'event', title: t.name,
    text: first ? t.greet : '"You again. Good. Repeat customers are the only kind that live long enough to matter."',
    choices: [],
  };
  root.choices = [
    { label: 'Let\'s trade.', action: g => { openTrade(g, 'city'); return null; } },
    { label: 'Where do you get all this?', reply: '"Police armory, before it got crowded. Convoys, after. Some of it walks in on people who didn\'t walk out." She shrugs. "Don\'t ask what you don\'t want answered."' },
    { label: 'Why are your prices so high?', next: () => ({
        text: '"Because I\'m alive and you\'re shopping." She leans back. "Want the long answer?"',
        choices: [
          { label: 'Yes.', reply: '"Every box on that shelf cost somebody a trip through drone country. I charge for the trip, not the box. You want it cheap, take the trip yourself."' },
          { label: 'Will you haggle?', reply: '"No. But I buy anything that isn\'t garbage, at a fair price. Fair for me."' },
          { label: 'Back', next: () => root },
        ],
      }) },
    { label: 'What do you know about the hospital?', reply: '"Antiviral\'s still in there. Everybody knows. Nobody comes back with it. The machines guard that wing like it matters to them." She narrows her eyes. "Maybe it does."' },
    { label: 'Who else is out there?', reply: '"Raiders, mostly, in the suburbs and the village. Some of them carry pistols now. And a priest out at the old church who thinks I\'m the devil." A dry laugh. "He\'s half right."' },
    { label: 'Give me everything. Now.', next: () => _robNode(gs, t, 'city', root) },
    { label: 'Goodbye.', action: () => '"Come back with something worth my time."' },
  ];
  return root;
}

// ── Trading screen ───────────────────────────────────────────────────────────

const tradeUI = { traderId: null, take: {}, give: {}, scrollL: 0, scrollR: 0 };

function openTrade(gs, id) {
  traderState(gs, id);
  tradeUI.traderId = id; tradeUI.take = {}; tradeUI.give = {}; tradeUI.scrollL = 0; tradeUI.scrollR = 0;
  gs.screen = 'trade';
}

function _tradeTotals(gs) {
  let price = 0, offer = 0;
  for (const [id, q] of Object.entries(tradeUI.take)) price += buyPrice(id) * q;
  for (const [id, q] of Object.entries(tradeUI.give)) offer += sellPrice(id) * q;
  return { price, offer };
}

function _tradeList(ctx, x, y, w, h, title, list, basket, priceFn, mx, my, scroll) {
  drawPanel(ctx, x, y, w, h, C.panelBg, C.border2);
  drawText(ctx, title, x + 8, y + 12, C.textBright, 8, 'left', true);
  const rowH = 18, top = y + 18;
  const rows = [];
  ctx.save(); ctx.beginPath(); ctx.rect(x, top, w, h - 20); ctx.clip();
  list.forEach((sl, i) => {
    const ry = top + i * rowH - scroll;
    if (ry < top - rowH || ry > y + h) return;
    const d = getItemDef(sl.id); if (!d) return;
    const inBasket = basket[sl.id] || 0;
    const hov = hitTest(mx, my, x + 2, ry, w - 4, rowH);
    if (inBasket) fillRect(ctx, x + 2, ry, w - 4, rowH, '#1e2a1a');
    else if (hov) fillRect(ctx, x + 2, ry, w - 4, rowH, C.highlight);
    drawItemIcon(ctx, sl.id, x + 4, ry + 1, rowH - 2);
    drawText(ctx, `${d.name}${sl.qty > 1 ? ' x' + sl.qty : ''}`, x + rowH + 8, ry + 12, C.text, 8);
    drawText(ctx, `${priceFn(sl.id)}`, x + w - 46, ry + 12, '#d8c070', 8, 'right');
    if (inBasket) {
      drawText(ctx, `[${inBasket}]`, x + w - 30, ry + 12, '#9ad08a', 8, 'center', true);
      drawText(ctx, '−', x + w - 10, ry + 12, '#d08a8a', 9, 'center', true);
    }
    rows.push({ id: sl.id, max: sl.qty, x: x + 2, y: ry, w: w - 4, h: rowH, minusX: x + w - 18 });
  });
  ctx.restore();
  return rows;
}

function renderTrade(ctx, gs) {
  const t = TRADERS[tradeUI.traderId], st = traderState(gs, tradeUI.traderId);
  const mx = gs.mouse.x, my = gs.mouse.y;
  fillRect(ctx, 0, 0, CFG.W, CFG.H, '#08080c');
  drawText(ctx, `TRADING WITH ${t.name.toUpperCase()}`, CFG.W / 2, 18, C.textBright, 11, 'center', true);
  drawText(ctx, `They sell at ${TRADE_MARKUP}x value and buy at value. Click to add, − to remove.${t.locId ? ` New stock in ${Math.max(0, st.nextRestock - gs.day)} day(s).` : ''}`,
    CFG.W / 2, 31, C.textDim, 7, 'center');
  const W2 = (CFG.W - 30) / 2, y = 40, h = CFG.H - 110;
  tradeUI._rowsL = _tradeList(ctx, 10, y, W2, h, `${t.name.toUpperCase()}'S GOODS (price)`, st.stock, tradeUI.take, buyPrice, mx, my, tradeUI.scrollL);
  tradeUI._rowsR = _tradeList(ctx, 20 + W2, y, W2, h, 'YOUR BAG (worth)', gs.parent.inventory, tradeUI.give, sellPrice, mx, my, tradeUI.scrollR);

  const { price, offer } = _tradeTotals(gs);
  const by = CFG.H - 62;
  drawPanel(ctx, 10, by, CFG.W - 20, 52, C.panelBg2, C.border);
  drawText(ctx, `You get: ${price}`, 24, by + 16, '#d8c070', 9, 'left', true);
  drawText(ctx, `You give: ${offer}`, 24, by + 32, offer >= price ? '#9ad08a' : '#d08a8a', 9, 'left', true);
  const ok = price > 0 && offer >= price;
  drawText(ctx, ok ? (offer > price ? `(you overpay by ${offer - price})` : 'Fair deal.') : price > 0 ? `Need ${price - offer} more.` : 'Pick what you want.', 24, by + 46, C.textDim, 7);
  const bx = CFG.W - 290;
  const btn = (x, label, en) => { drawButton(ctx, x, by + 14, 86, 24, label, en && hitTest(mx, my, x, by + 14, 86, 24), false, !en); return { x, y: by + 14, w: 86, h: 24 }; };
  tradeUI._deal  = btn(bx, 'Deal', ok);
  tradeUI._clear = btn(bx + 92, 'Clear', true);
  tradeUI._back  = btn(bx + 184, 'Done', true);
}

function tradeClick(mx, my, gs) {
  const st = traderState(gs, tradeUI.traderId);
  const hit = r => r && hitTest(mx, my, r.x, r.y, r.w, r.h);
  if (hit(tradeUI._back)) {
    gs.screen = 'explore';
    if (TRADERS[tradeUI.traderId].locId) openTraderTalk(gs, tradeUI.traderId);   // back to the conversation
    return;
  }
  if (hit(tradeUI._clear)) { tradeUI.take = {}; tradeUI.give = {}; return; }
  if (hit(tradeUI._deal)) {
    const { price, offer } = _tradeTotals(gs);
    if (!(price > 0 && offer >= price)) return;
    // weight check for what you take
    const addW = Object.entries(tradeUI.take).reduce((s, [id, q]) => s + (getItemDef(id).weight || 0) * q, 0);
    const remW = Object.entries(tradeUI.give).reduce((s, [id, q]) => s + (getItemDef(id).weight || 0) * q, 0);
    if (calcWeight(gs.parent.inventory) - remW + addW > parentMaxCarry()) { notify('That won\'t fit in your bag.', 'warn'); return; }
    for (const [id, q] of Object.entries(tradeUI.give)) { removeFromInventory(gs.parent.inventory, id, q); addToInventory(st.stock, id, q); }
    for (const [id, q] of Object.entries(tradeUI.take)) { removeFromInventory(st.stock, id, q); addToInventory(gs.parent.inventory, id, q); }
    tradeUI.take = {}; tradeUI.give = {};
    if (Audio.loot) Audio.loot();
    giveXP(gs.parent, 5, gs);
    notify('Deal.', 'good');
    return;
  }
  const pick = (rows, basket) => {
    for (const r of rows || []) {
      if (!hit(r)) continue;
      const cur = basket[r.id] || 0;
      if (cur && mx >= r.minusX) { if (cur <= 1) delete basket[r.id]; else basket[r.id] = cur - 1; }
      else if (cur < r.max) basket[r.id] = cur + 1;
      return true;
    }
    return false;
  };
  if (pick(tradeUI._rowsL, tradeUI.take)) return;
  pick(tradeUI._rowsR, tradeUI.give);
}

function tradeScroll(dy, gs) {
  if (gs.mouse.x < CFG.W / 2) tradeUI.scrollL = Math.max(0, tradeUI.scrollL + dy * 18);
  else tradeUI.scrollR = Math.max(0, tradeUI.scrollR + dy * 18);
}

// ── Fighting them ────────────────────────────────────────────────────────────

function startTraderFight(gs, id) {
  const es = exploreState;
  if (!es || !es.building) return;
  const t = TRADERS[id], st = traderState(gs, id);
  const area = curArea(es);
  const npc = (area.npcs || []).find(n => n.traderId === id);
  const enemy = deepClone(t.enemy);
  enemy.hp = st.hp;
  // Everything they own drops if they fall
  enemy._fixedLoot = [...t.gear.map(([gid, q]) => ({ id: gid, qty: q })), ...st.stock.map(s => ({ id: s.id, qty: s.qty }))];
  gs.screen = 'explore';
  gs.mouse.down = false;
  startCombat(gs, [enemy], es.building.px, npc ? npc.x : es.building.px + 80);
  const c = gs.combat;
  c._traderId = id;
  gs.inCombat = true;
  for (const e of c.enemies) { while (e.worldX > area.width - 30) e.worldX -= TILE; while (e.worldX < 30) e.worldX += TILE; }
  st.hostile = true;
  combatLog(gs, `${t.name} won't go down easily.`, 'danger');
}

/** Combat with a trader ended (called from endCombat). */
function traderCombatEnded(gs, c, result) {
  const id = c._traderId, st = traderState(gs, id), t = TRADERS[id];
  const e = c.enemies[0];
  if (result === 'victory') {
    st.alive = false;
    st.stock = [];
    addLog(`${t.name} is dead. Nobody will trade there again.`, 'danger');
    gs.parent.depression = clamp(gs.parent.depression + 12, 0, 100);
    const es = exploreState;
    if (es && es.building) { const area = curArea(es); area.npcs = (area.npcs || []).filter(n => n.traderId !== id); }
  } else if (e) {
    st.hp = Math.max(1, e.hp);      // remembers the wounds; holds a grudge
    st.hostile = true;
  }
}
