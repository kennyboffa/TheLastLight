// recipes.js — Crafting recipes and shelter room definitions
'use strict';

// ── Room Definitions ─────────────────────────────────────────────────────────
const ROOM_DEFS = {
  main:      { id:'main',      name:'Main Room',    col:0, row:0,
    desc:'Your living quarters. Rest and eat here.',
    buildCost: null, buildNoise: 0, buildTime: 0,
    maxLevel: 3,
    upgradeCost: [null, { wood:10, cloth:6 }, { metal:10, electronics:4 }],
    upgradeTime: [0, 6, 10],
    upgradeDesc: ['', 'Reinforced walls. +5 shelter defense.', 'Advanced insulation. Reduces cold debuffs.'] },

  bedroom:   { id:'bedroom',   name:'Bedroom',      col:1, row:0,
    desc:'Proper beds. Sleep restores tiredness faster.',
    buildCost: { wood:24, cloth:16 }, needsTools:true, buildNoise:14, buildTime:8,
    storageBonus: 0, effect:'betterSleep',
    maxLevel: 3,
    upgradeCost: [null, { cloth:9, wood:6 }, { cloth:12, chemicals:5 }],
    upgradeTime: [0, 5, 8],
    upgradeDesc: ['', 'Better mattresses. Sleep restores +10% more.', 'Climate control. Removes cold/heat sleep penalty.'] },

  storage:   { id:'storage',   name:'Storage Room', col:2, row:0,
    desc:'Adds 40 kg of storage capacity.',
    buildCost: { wood:30, metal:16 }, needsTools:true, buildNoise:14, buildTime:10,
    storageBonus: 40, effect:'moreStorage',
    maxLevel: 3,
    upgradeCost: [null, { metal:9, wood:6 }, { metal:15, electronics:5 }],
    upgradeTime: [0, 8, 12],
    upgradeDesc: ['', 'Shelving system. +30kg capacity.', 'Climate-controlled vault. +50kg capacity.'] },

  workshop:  { id:'workshop',  name:'Workshop',     col:0, row:1,
    desc:'Allows advanced crafting of items and upgrades.',
    buildCost: { wood:20, metal:32 }, needsTools:true, buildNoise:20, buildTime:12,
    effect:'crafting',
    maxLevel: 3,
    upgradeCost: [null, { metal:12, electronics:6 }, { metal:18, electronics:12 }],
    upgradeTime: [0, 10, 14],
    upgradeDesc: ['', 'Better tools. Crafting 15% faster.', 'Fabricator. Unlocks high-tech recipes.'] },

  infirmary: { id:'infirmary', name:'Infirmary',    col:1, row:1,
    desc:'Heals injuries faster. Reduces infection chance.',
    buildCost: { cloth:24, chemicals:14 }, needsTools:true, buildNoise:12, buildTime:8,
    effect:'healing',
    maxLevel: 3,
    upgradeCost: [null, { cloth:9, chemicals:6 }, { chemicals:12, electronics:6 }],
    upgradeTime: [0, 7, 10],
    upgradeDesc: ['', 'Medical supplies. Heal +20% faster.', 'Surgical kit. Can treat critical wounds.'] },

  security:  { id:'security',  name:'Security Room',col:2, row:1,
    desc:'Monitor AI activity. Reduces daily suspicion gain.',
    buildCost: { metal:24, electronics:20 }, needsTools:true, buildNoise:22, buildTime:16,
    effect:'lowSuspicion',
    maxLevel: 3,
    upgradeCost: [null, { electronics:9, metal:6 }, { electronics:15, metal:9 }],
    upgradeTime: [0, 10, 14],
    upgradeDesc: ['', 'Signal scramblers. -15% suspicion gain.', 'Full counter-surveillance suite. -30% suspicion gain.'] },
};

// ── Upgrade Definitions (shelter upgrades beyond rooms) ───────────────────────
const UPGRADES_DB = {
  water_filter: {
    id:'water_filter', name:'Water Filter',
    desc:'Purify dirty water. Essential for clean supply.',
    buildCost: { metal:6, cloth:3, chemicals:5 }, needsTools:true, buildNoise:6,
    buildTime:6, requiresRoom:'workshop', key:'hasWaterFilter',
  },
  campfire: {
    id:'campfire', name:'Campfire / Stove',
    desc:'Cook food and boil water. Reduces depression.',
    buildCost: { metal:5, wood:6 }, needsTools:false, buildNoise:5,
    buildTime:4, requiresRoom:null, key:'campfire',
  },
  raincatcher: {
    id:'raincatcher', name:'Rain Catcher',
    desc:'Collects rainwater. Passively generates dirty water during rain.',
    buildCost: { metal:6, cloth:5 }, needsTools:false, buildNoise:4,
    buildTime:3, requiresRoom:null, key:'hasRaincatcher',
  },
  generator: {
    id:'generator', name:'Generator',
    desc:'Power and warmth. Increases suspicion slightly each day.',
    buildCost: { metal:12, electronics:8, fuel:6 }, needsTools:true, buildNoise:20,
    buildTime:14, requiresRoom:'workshop', key:'hasGenerator',
  },
  radio_dampener: {
    id:'radio_dampener', name:'Radio Dampener',
    desc:'Suppresses electronic signatures. Reduces daily suspicion.',
    buildCost: { metal:9, electronics:12 }, needsTools:true, buildNoise:8,
    buildTime:10, requiresRoom:'security', key:'hasRadioDampener',
  },
  defense_barrier: {
    id:'defense_barrier', name:'Defense Barrier',
    desc:'Reinforced entrance. Raises shelter defense level.',
    buildCost: { metal:18, wood:10 }, needsTools:true, buildNoise:18,
    buildTime:12, requiresRoom:null, key:null, effect:'defense',
  },
  bedroom_bed2: {
    id:'bedroom_bed2', name:'Extra Bed (2nd)',
    desc:'Build a second bed. Allows one more survivor to shelter here.',
    buildCost: { wood:9, cloth:6 }, needsTools:false, buildNoise:4,
    buildTime:3, requiresRoom:'bedroom', key:'bedroomBed2',
  },
  bedroom_bed3: {
    id:'bedroom_bed3', name:'Extra Bed (3rd)',
    desc:'Build a third bed. Allows one more survivor to shelter here.',
    buildCost: { wood:9, cloth:6 }, needsTools:false, buildNoise:4,
    buildTime:3, requiresRoom:'bedroom', key:'bedroomBed3',
  },
};

// ── Item Crafting Recipes ─────────────────────────────────────────────────────
// needsBlueprint:true → hidden until the matching blueprint item is used/learned
const RECIPES_DB = [
  // Always available (no blueprint needed)
  { id:'r_bandage',   name:'Bandage',        output:'bandage',      qty:2,
    cost:{ cloth:3 },         needsWorkshop:false, craftTime:0.25, desc:'Tear cloth into bandages. Stops bleeding.' },
  { id:'r_torch',     name:'Torch',          output:'matches',      qty:3,
    cost:{ wood:2, cloth:1 }, needsWorkshop:false, craftTime:0.25, desc:'Improvised torch / matches. Provides light.' },
  { id:'r_spear',     name:'Spear',          output:'spear',        qty:1,
    cost:{ wood:3, metal:2 }, needsWorkshop:false, craftTime:0.75, desc:'A wooden shaft with a sharpened metal tip. Good reach.' },

  // Blueprint-locked recipes (hidden until blueprint is found)
  { id:'r_sbackpack', name:'Small Backpack', output:'small_backpack', qty:1,
    cost:{ cloth:9, rope:3 }, needsWorkshop:true, needsBlueprint:true, craftTime:1.5, desc:'Sew a small carrying pack. Adds carry weight.' },
  { id:'r_backpack',  name:'Backpack',       output:'backpack',     qty:1,
    cost:{ cloth:15, rope:6, metal:3 }, needsWorkshop:true, needsBlueprint:true, craftTime:2.0, desc:'Standard backpack. Significantly increases carry capacity.' },
  { id:'r_pipe_wpn',  name:'Metal Pipe',     output:'pipe',         qty:1,
    cost:{ metal:5 }, needsWorkshop:true, needsBlueprint:true, craftTime:1.0, desc:'Shape scrap into a heavy pipe weapon.' },
  { id:'r_crowbar',   name:'Crowbar',        output:'crowbar',      qty:1,
    cost:{ metal:8 }, needsWorkshop:true, needsTools:true, needsBlueprint:true, craftTime:1.5, desc:'Forge a crowbar. Opens doors and crates. Good melee weapon.' },
  { id:'r_purify',    name:'Purify Water',   output:'purified_water', qty:2,
    cost:{ dirty_water:3, chemicals:1 }, needsWorkshop:false, requiresUpgrade:'water_filter',
    craftTime:0.5, desc:'Filter dirty water into clean drinking water. Requires water filter.' },
  { id:'r_medkit',    name:'First Aid Kit',  output:'medkit',       qty:1,
    cost:{ bandage:6, chemicals:4, cloth:3 }, needsWorkshop:true, needsBlueprint:true, craftTime:1.0, desc:'Assemble a comprehensive first aid kit. High healing value.' },
];
