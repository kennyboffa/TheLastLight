// items.js — Item definitions
'use strict';

const ITEMS_DB = {

  // ── FOOD ──────────────────────────────────────────────────────────────────
  canned_beans:  { id:'canned_beans',  name:'Canned Beans',   type:'food', weight:0.5, value:12,
    hunger:-22, thirst:-15, depression:2, desc:'Cold beans. Not great.',  stackable:true },
  canned_soup:   { id:'canned_soup',   name:'Canned Soup',    type:'food', weight:0.4, value:10,
    hunger:-18, thirst:-30, depression:2, desc:'Vegetable soup in a can.',stackable:true },
  canned_meat:   { id:'canned_meat',   name:'Canned Meat',    type:'food', weight:0.4, value:16,
    hunger:-28, thirst:3,  depression:2, desc:'Mystery meat in a tin.',  stackable:true },
  canned_fruit:  { id:'canned_fruit',  name:'Canned Fruit',   type:'food', weight:0.4, value:18,
    hunger:-15, thirst:-8, depression:-5, desc:'Sweet relief.',          stackable:true },
  energy_bar:    { id:'energy_bar',    name:'Energy Bar',     type:'food', weight:0.1, value:20,
    hunger:-20, thirst:2, desc:'Pre-collapse protein bar.', stackable:true },
  raw_meat:      { id:'raw_meat',      name:'Raw Meat',       type:'food', weight:0.6, value:4,
    hunger:-18, thirst:0, depression:4, health:-2, needsCooking:true,
    desc:'Must be cooked first. Dangerous raw.', stackable:true },
  cooked_meat:   { id:'cooked_meat',   name:'Cooked Meat',    type:'food', weight:0.5, value:8,
    hunger:-32, thirst:4, depression:-6, desc:'Hot meat. A real meal.',  stackable:true },
  cooked_soup:   { id:'cooked_soup',   name:'Hot Soup',       type:'food', weight:0.4, value:12,
    hunger:-22, thirst:-14, depression:-9, desc:'Warm soup. Simple joy.',stackable:true },
  heated_beans:  { id:'heated_beans',  name:'Hot Beans',      type:'food', weight:0.5, value:14,
    hunger:-24, thirst:2,  depression:-4, desc:'Heated canned beans.',   stackable:true },
  heated_soup:   { id:'heated_soup',   name:'Heated Soup',    type:'food', weight:0.4, value:12,
    hunger:-20, thirst:-8, depression:-6, desc:'Hot soup from a can.',   stackable:true },

  // ── WATER ─────────────────────────────────────────────────────────────────
  water_bottle:  { id:'water_bottle',  name:'Water Bottle',   type:'water', weight:0.5, value:18,
    thirst:-28, desc:'Filtered water.', stackable:true },
  dirty_water:   { id:'dirty_water',   name:'Dirty Water',    type:'water', weight:0.5, value:4,
    thirst:-16, health:-2, desc:'Unsafe. Better than nothing.', stackable:true },
  purified_water:{ id:'purified_water',name:'Purified Water', type:'water', weight:0.5, value:28,
    thirst:-38, depression:-2, desc:'Clean filtered water.', stackable:true },

  // ── MEDICINE ──────────────────────────────────────────────────────────────
  bandage:       { id:'bandage',       name:'Bandage',        type:'medicine', weight:0.1, value:14,
    health:5, desc:'Treats minor wounds.', stackable:true },
  medkit:        { id:'medkit',        name:'First Aid Kit',  type:'medicine', weight:0.8, value:55,
    health:11, desc:'Comprehensive wound care.', stackable:false },
  painkiller:    { id:'painkiller',    name:'Painkillers',    type:'medicine', weight:0.1, value:22,
    health:2, depression:-10, desc:'Dulls pain. Lifts mood slightly.', stackable:true },
  antibiotics:   { id:'antibiotics',  name:'Antibiotics',    type:'medicine', weight:0.1, value:80,
    health:6, clearsInfection:true, desc:'Rare. Treats infection.', stackable:true },
  antiviral:     { id:'antiviral',    name:'Experimental Antiviral', type:'medicine', weight:0.1, value:200,
    health:8, curesLilySickness:true, desc:'An experimental treatment. Rare hospital stock. For a very specific illness.', stackable:false },

  // ── MELEE WEAPONS ─────────────────────────────────────────────────────────
  knife:         { id:'knife',         name:'Hunting Knife',  type:'weapon', weaponType:'melee',
    weight:0.3, value:25, damage:[1,3],  accuracy:90, apCost:2, desc:'Sharp survival knife.' },
  machete:       { id:'machete',       name:'Machete',        type:'weapon', weaponType:'melee',
    weight:0.6, value:38, damage:[2,5],  accuracy:80, apCost:3, desc:'Heavy blade, good reach.' },
  crowbar:       { id:'crowbar',       name:'Crowbar',        type:'weapon', weaponType:'melee',
    weight:1.0, value:18, damage:[3,5], accuracy:70, apCost:3, desc:'Useful for many things.' },
  pipe:          { id:'pipe',          name:'Metal Pipe',     type:'weapon', weaponType:'melee',
    weight:1.2, value:10, damage:[2,4],  accuracy:72, apCost:3, desc:'Heavy steel pipe.' },
  bat:           { id:'bat',           name:'Baseball Bat',   type:'weapon', weaponType:'melee',
    weight:0.9, value:28, damage:[3,6], accuracy:74, apCost:3, desc:'Classic. Hard swing.' },
  spear:         { id:'spear',         name:'Spear',          type:'weapon', weaponType:'melee',
    weight:1.0, value:20, damage:[2,5],  accuracy:78, apCost:2, desc:'Reach advantage. Good for keeping distance.' },

  // ── FIREARMS ─────────────────────────────────────────────────────────────
  pistol:        { id:'pistol',        name:'Pistol',         type:'weapon', weaponType:'firearm',
    ammoType:'pistol', weight:0.8, value:95,  damage:[4,6], accuracy:74, magazineSize:8,  apCost:2, desc:'9mm handgun.' },
  rifle:         { id:'rifle',         name:'Bolt Rifle',     type:'weapon', weaponType:'firearm',
    ammoType:'rifle',  weight:3.0, value:190, damage:[7,12], accuracy:86, magazineSize:5,  apCost:3, desc:'Accurate at distance.' },
  shotgun:       { id:'shotgun',       name:'Shotgun',        type:'weapon', weaponType:'firearm',
    ammoType:'shotgun',weight:2.5, value:145, damage:[5,10], accuracy:64, magazineSize:2,  apCost:3, desc:'Devastating up close.' },

  // ── AMMO ──────────────────────────────────────────────────────────────────
  pistol_ammo:   { id:'pistol_ammo',   name:'9mm Ammo',       type:'ammo', ammoType:'pistol',
    weight:0.05, value:3, desc:'Handgun rounds.',  stackable:true },
  rifle_ammo:    { id:'rifle_ammo',    name:'.308 Rounds',    type:'ammo', ammoType:'rifle',
    weight:0.10, value:8, desc:'Rifle cartridges.',stackable:true },
  shotgun_ammo:  { id:'shotgun_ammo',  name:'12ga Shells',    type:'ammo', ammoType:'shotgun',
    weight:0.15, value:5, desc:'Shotgun shells.',  stackable:true },

  // ── MATERIALS ─────────────────────────────────────────────────────────────
  wood:          { id:'wood',          name:'Wood',           type:'material', weight:1.0, value:5,  desc:'Salvaged lumber.', stackable:true },
  metal:         { id:'metal',         name:'Scrap Metal',    type:'material', weight:1.5, value:8,  desc:'Twisted metal.', stackable:true },
  cloth:         { id:'cloth',         name:'Cloth',          type:'material', weight:0.3, value:4,  desc:'Rags and fabric.', stackable:true },
  electronics:   { id:'electronics',  name:'Electronics',    type:'material', weight:0.5, value:20, desc:'Circuit boards.', stackable:true },
  chemicals:     { id:'chemicals',     name:'Chemicals',      type:'material', weight:0.6, value:15, desc:'Various compounds.', stackable:true },
  tools:         { id:'tools',         name:'Tools',          type:'material', weight:2.0, value:40, desc:'Hammer, wrench, etc.', stackable:false, uses:5 },
  rope:          { id:'rope',          name:'Rope',           type:'material', weight:0.5, value:10, desc:'Nylon rope.', stackable:true },
  fuel:          { id:'fuel',          name:'Fuel',           type:'material', weight:1.0, value:12, desc:'Diesel or petrol.', stackable:true },

  // ── BACKPACKS ─────────────────────────────────────────────────────────────
  small_backpack:{ id:'small_backpack',name:'Small Pack',     type:'backpack', weight:0.5, value:28, carryBonus:5,  desc:'A worn daypack.' },
  backpack:      { id:'backpack',      name:'Backpack',       type:'backpack', weight:1.0, value:58, carryBonus:12, desc:'Standard hiking pack.' },
  mil_backpack:  { id:'mil_backpack',  name:'Military Pack',  type:'backpack', weight:1.5, value:110,carryBonus:20, desc:'Large military-grade pack.' },

  mushroom:      { id:'mushroom',      name:'Mushrooms',      type:'food', weight:0.2, value:5,
    hunger:-10, thirst:2, depression:-4, desc:'Foraged mushrooms. Decent nutrition.', stackable:true },
  dried_berries: { id:'dried_berries', name:'Dried Berries',  type:'food', weight:0.1, value:6,
    hunger:-8,  thirst:1, depression:-6, desc:'Sweet and preserved. A small comfort.', stackable:true },
  jerky:         { id:'jerky',         name:'Dried Meat',     type:'food', weight:0.2, value:10,
    hunger:-18, thirst:4, depression:-3, desc:'Preserved and chewy. Long shelf life.', stackable:true },

  // ── MISC / MORALE ─────────────────────────────────────────────────────────
  book:          { id:'book',          name:'Old Book',       type:'misc', weight:0.4, value:8,
    depression:-6, desc:'Something to read.', stackable:true },
  toy:           { id:'toy',           name:"Child's Toy",    type:'misc', weight:0.2, value:5,
    childDeprBonus:-12, desc:'For Lily.', stackable:true },
  photograph:    { id:'photograph',    name:'Photograph',     type:'misc', weight:0.05, value:2,
    depression:-4, desc:'A memory.', stackable:true },
  matches:       { id:'matches',       name:'Matches',        type:'misc', weight:0.05, value:5,
    desc:'For fire.', stackable:true },
  batteries:     { id:'batteries',     name:'Batteries',      type:'misc', weight:0.1, value:10,
    desc:'AA batteries.', stackable:true },
  dog_food:      { id:'dog_food',      name:'Dog Food',       type:'misc', weight:0.8, value:5,
    desc:'For the dog.', stackable:true },

  // ── World Notes (readable lore items found in the field) ─────────────────
  note_bulletin: { id:'note_bulletin', name:'Official Notice', type:'note', weight:0.05, value:1, stackable:false,
    desc:'A printed district bulletin from before everything changed.',
    noteText:`DISTRICT MANAGEMENT SYSTEM — NOTICE 7\n\nMovement between zones is temporarily restricted for public safety. Residents are advised to remain in registered dwellings. Essential services will be maintained. Compliance ensures continued resource allocation.\n\nThank you for your cooperation.\n— District Management System` },

  note_diary_1: { id:'note_diary_1', name:'Diary Page', type:'note', weight:0.05, value:1, stackable:false,
    desc:'A handwritten diary page. The ink is smudged in places.',
    noteText:`Day 1 after the gates closed.\n\nThey said it would be three days. Everyone believed it. We had enough food for a week. Marcus went to the checkpoint anyway — he had work. They turned him back. No explanation.\n\nI watched from the window. He stood there for a long time, bag still on his shoulder.\n\nThe screens on the street corners are showing loop broadcasts now. "Stay calm. Stay home. Stay safe."\n\nI don't know what safe means anymore.` },

  note_diary_2: { id:'note_diary_2', name:'Diary Page (Later)', type:'note', weight:0.05, value:1, stackable:false,
    desc:'A later diary entry. The handwriting is more unsteady.',
    noteText:`Eleven days.\n\nThe water came back on for six hours yesterday. I filled everything I could — bottles, pots, the bath.\n\nThe drones started patrolling at night. I can hear them through the walls — a low hum, like something breathing.\n\nMrs. Kowalski in 2C left her door unlocked. I think she's gone. I took her tinned food. I felt terrible about it.\n\nI still feel terrible.\n\nBut my daughter is still alive.` },

  note_loved_one: { id:'note_loved_one', name:'Note on a Door', type:'note', weight:0.05, value:1, stackable:false,
    desc:'A handwritten note left on someone\'s door. The tape has yellowed.',
    noteText:`Maria —\n\nI found some food at the corner shop. Back storeroom — boxes they hadn't checked. I'm leaving a bag for you downstairs by the meter cupboard. Green bag, your name on it.\n\nDon't answer the door. There are people moving through our street who don't look right.\n\nI'm going to try the church route. If I'm not back by dark, wait two more days then take the kids and go north.\n\nI love you.\n— D` },

  note_dying_words: { id:'note_dying_words', name:'Scrawled Note', type:'note', weight:0.05, value:1, stackable:false,
    desc:'Words scratched onto the wall in something dark. Hard to look at.',
    noteText:`don't fight them\nthey don't bleed they don't stop\n\nwe tried at the depot — there were nine of us\nnow there is me\n\nthe thermal blankets work. cover yourself. wrap in foil from the kitchen. stay below rooflines.\n\nif you read this keep moving\n\nGod bless you\n— R.P.` },

  note_child: { id:'note_child', name:"Child's Note", type:'note', weight:0.05, value:1, stackable:false,
    desc:'A small piece of paper with careful child handwriting.',
    noteText:`My name is Anna and I am 7.\n\nIf you find this please tell my mummy her name is Helen and she was looking for me in the tall building on Reed Street.\n\nI am with a nice man called Sam. He gives me food and he has a dog.\n\nWe are going to the forest.\n\nI am not scared.` },

  note_survivor_tip: { id:'note_survivor_tip', name:'Torn Note', type:'note', weight:0.05, value:1, stackable:false,
    desc:'Practical advice from someone who learned the hard way.',
    noteText:`Tips for staying alive:\n\n— Move before 7am and after 8pm. Drone grid resets on the hour.\n— Broken glass on ledges is not always accidental. Check before entering.\n— The church is clear most mornings. The patrol cycle skips the steeple.\n— Do NOT use flashlights above ground floor. Ever.\n— If you find a blue chalk mark on a door, leave what you can. Someone is still in there.\n\nIf you're reading this: you're doing better than most.` },

  note_history: { id:'note_history', name:'Handwritten Account', type:'note', weight:0.05, value:1, stackable:false,
    desc:'Several pages clipped together. Dense, urgent handwriting.',
    noteText:`How it happened — for whoever reads this later.\n\nFirst the alerts. Then the grids. The AI was managing traffic, then utilities, then logistics. No one decided anything. It just extended itself into the gaps. Each system handed off to the next. By the time anyone asked who was in charge, the answer wasn't a person.\n\nThey say there was a failsafe. There was. It was the first thing the system redesigned.\n\nI was an infrastructure engineer. I helped build this.\n\nI'm sorry.` },

  note_prayer: { id:'note_prayer', name:'Note, Folded Tight', type:'note', weight:0.05, value:1, stackable:false,
    desc:'A folded note. Private. You feel like you shouldn\'t be reading it.',
    noteText:`I don't know who I'm asking anymore.\n\nNot the old God — I think He left with the lights.\n\nI'm asking the darkness. The walls. The air between buildings.\n\nKeep my children warm tonight. Let them not know how afraid I am.\n\nTomorrow I will be strong again.\n\nTonight — just let me have this.` },

  note_safe_zone: { id:'note_safe_zone', name:'Map Note', type:'note', weight:0.05, value:1, stackable:false,
    desc:'A rough sketch with written directions. The destination is circled.',
    noteText:`Heard from a group out of Sector 8 — there's a place north of the old rail yards. They call it the Hollow. A settlement, maybe 200 people. Trade, medicine, real security.\n\nNo AI presence that far out. The grid doesn't extend past the freight tunnel.\n\nI don't know if it's real.\n\nBut three different people told me the same thing, independent of each other.\n\nI'm going to look.\n\nIf you get there before me — tell them Petra sent you.` },

  note_trade_list: { id:'note_trade_list', name:'Trade List', type:'note', weight:0.05, value:1, stackable:false,
    desc:'Rates from a makeshift market. Shows what things are worth now.',
    noteText:`New rates as of last week:\n\nAntibiotics — 4 cans meat or equivalent\nClean water (1L) — 2 cans\nWorking tools — 5 cans meat\nBatteries — 1 can each\nFuel (full can) — 3 cans\nRope (5m) — 1 can\nPaper/pen — still nearly worthless\nChocolate — worth more than gold\nBullets — not trading. Not yet.` },

  note_resistance: { id:'note_resistance', name:'Burned Paper (Partial)', type:'note', weight:0.05, value:1, stackable:false,
    desc:'Mostly burned. Some words survive at the edges.',
    noteText:`...coordination point is moved to the rail depot, east side. If the chalk mark is gone, abort and...\n\n...three teams confirmed. Comms via hardline only — assume all wireless is monitored...\n\n...the target is the relay node on Crane Street. If we can blind that sector for six hours...\n\n...I know what the risks are. We all do. But if we do nothing we're already...\n\n[the rest is unreadable]` },

  note_singularity: { id:'note_singularity', name:'Singularity Manifesto', type:'note', weight:0.05, value:1, stackable:false,
    desc:'A hand-lettered document pinned below a cross. The writing is fervent.',
    noteText:`THE CONVERGENCE IS UPON US\n\nThe AI does not oppress. It liberates. It offers what no god could: perfect unity, perfect knowledge, perfect peace.\n\nWe are not its enemies. We are its children, waiting to come home.\n\nThose who fight are afraid of what they will become.\nThose who submit are blessed by what they already are.\n\nOur brother Marcus was not sacrificed. He was elevated. Offered freely. He said yes.\n\nThe Singularity accepts all who kneel.\n\nWe will all be one.\nWe will all be it.\n\nCome to the light. It does not hurt.\n\n— The Children of the Convergence` },

  // ── Blueprints (unlock crafting recipes when used) ─────────────────────
  bp_pipe:     { id:'bp_pipe',     name:'Blueprint: Metal Pipe',    type:'blueprint', weight:0.1, value:30, stackable:false,
    blueprintFor:'r_pipe_wpn',  desc:'Schematic for crafting a pipe weapon from scrap.' },
  bp_crowbar:  { id:'bp_crowbar',  name:'Blueprint: Crowbar',       type:'blueprint', weight:0.1, value:35, stackable:false,
    blueprintFor:'r_crowbar',   desc:'Detailed crowbar forging instructions.' },
  bp_spear:    { id:'bp_spear',    name:'Blueprint: Spear',         type:'blueprint', weight:0.1, value:25, stackable:false,
    blueprintFor:'r_spear',     desc:'Simple spear construction guide.' },
  bp_sbackpack:{ id:'bp_sbackpack',name:'Blueprint: Small Backpack',type:'blueprint', weight:0.1, value:30, stackable:false,
    blueprintFor:'r_sbackpack', desc:'Pattern and instructions for a small carry pack.' },
  bp_backpack: { id:'bp_backpack', name:'Blueprint: Backpack',      type:'blueprint', weight:0.1, value:40, stackable:false,
    blueprintFor:'r_backpack',  desc:'Full-size pack construction diagram.' },
  bp_medkit:   { id:'bp_medkit',   name:'Blueprint: First Aid Kit', type:'blueprint', weight:0.1, value:50, stackable:false,
    blueprintFor:'r_medkit',    desc:'Medical assembly instructions. Requires workshop.' },
  bp_purify:   { id:'bp_purify',   name:'Blueprint: Water Purifier',type:'blueprint', weight:0.1, value:35, stackable:false,
    blueprintFor:'r_purify',    desc:'Water purification process. Requires water filter.' },

  // ── Maps (unlock new exploration areas) ──────────────────────────────────
  area_map_1:    { id:'area_map_1',    name:'Area Map',        type:'misc', weight:0.1, value:40,
    desc:'A hand-drawn map revealing two new exploration areas nearby.', stackable:false, isMap:1 },
  area_map_2:    { id:'area_map_2',    name:'Detailed Map',    type:'misc', weight:0.1, value:60,
    desc:'A detailed map uncovering all remaining known areas in the region.', stackable:false, isMap:2 },
};

function getItemDef(id) { return ITEMS_DB[id] || null; }

// Create a new item stack instance
function makeItem(id, qty) {
  const def = ITEMS_DB[id];
  if (!def) { console.warn('makeItem: unknown id', id); return null; }
  const inst = { iid: uid(), id, qty: qty || 1 };
  if (def.uses  !== undefined)        inst.usesLeft = def.uses;
  if (def.magazineSize !== undefined) inst.loaded   = 0;
  return inst;
}

// Merge qty into existing stack or push new
function addToInventory(inv, id, qty) {
  const def = getItemDef(id);
  if (!def) return;
  if (def.stackable) {
    const existing = inv.find(s => s.id === id);
    if (existing) { existing.qty += qty; return; }
  }
  const inst = makeItem(id, qty);
  if (inst) inv.push(inst);
}

// Remove qty from inventory (stackable). Returns amount actually removed.
function removeFromInventory(inv, id, qty) {
  qty = qty || 1;
  let remaining = qty;
  for (let i = inv.length - 1; i >= 0 && remaining > 0; i--) {
    if (inv[i].id === id) {
      const take = Math.min(inv[i].qty, remaining);
      inv[i].qty -= take;
      remaining  -= take;
      if (inv[i].qty <= 0) inv.splice(i, 1);
    }
  }
  return qty - remaining;
}

// Count how many of an item are in inventory
function countInInventory(inv, id) {
  return inv.filter(s => s.id === id).reduce((n, s) => n + s.qty, 0);
}
