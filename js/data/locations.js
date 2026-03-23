// locations.js — Exploration locations
'use strict';

// Each location has zones (areas within it) and buildings (enterable structures).
// buildings[] within a zone: { relX, label, numFloors, theme, lootQuality, enemyChance }
const LOCATIONS_DB = [
  {
    id: 'forest',
    name: 'Outer Forest',
    desc: 'Dense woodland beyond the city. The AI rarely patrols here. Good for hunting, foraging, and finding abandoned structures.',
    difficulty: 1,
    bgTheme: 'forest',
    canHunt: true,
    ambientDesc: 'Birdsong. The smell of damp earth. Almost peaceful.',
    zones: [
      { id:'edge',    name:'Forest Edge',  x:0,    w:550, bgColor:'#090e07', lootTable:'nature_light', enemyChance:8,  huntChance:15 },
      { id:'deep',    name:'Deep Forest',  x:550,  w:650, bgColor:'#060c04', lootTable:'nature_heavy', enemyChance:6,  huntChance:35,
        buildings:[
          { relX:200, label:'Abandoned Tent',  numFloors:1, theme:'tent',  lootQuality:'light', enemyChance:5  },
        ]},
      { id:'clearing',name:'Clearing',     x:1200, w:500, bgColor:'#080e06', lootTable:'nature_rare',  enemyChance:12, huntChance:40 },
      { id:'cabin',   name:'Forest Cabin', x:1700, w:600, bgColor:'#070c05', lootTable:'home_medium',  enemyChance:18,
        buildings:[
          { relX:220, label:'Forest Cabin',   numFloors:2, theme:'cabin', lootQuality:'cabin',  enemyChance:20 },
        ]},
      { id:'stream',  name:'Stream',       x:2300, w:500, bgColor:'#060c08', lootTable:'water_heavy',  enemyChance:8,  huntChance:20 },
    ],
  },
  {
    id: 'factory',
    name: 'Industrial Complex',
    desc: 'Heavy materials and salvageable machinery. The AI uses this plant for manufacturing — patrols are frequent and dangerous.',
    difficulty: 3,
    bgTheme: 'industrial',
    ambientDesc: 'The hiss of automated systems. Metal on metal. The AI is active here.',
    zones: [
      { id:'yard',    name:'Outer Yard',    x:0,    w:500, bgColor:'#0c0d0f', lootTable:'materials',    enemyChance:25 },
      { id:'floor1',  name:'Factory Floor', x:500,  w:700, bgColor:'#0a0b0e', lootTable:'heavy_mat',    enemyChance:40,
        buildings:[
          { relX:200, label:'Factory Block A', numFloors:3, theme:'factory', lootQuality:'heavy',   enemyChance:45 },
        ]},
      { id:'stores',  name:'Storage Hall',  x:1200, w:500, bgColor:'#090a0d', lootTable:'materials_r',  enemyChance:35,
        buildings:[
          { relX:150, label:'Storage Hall',    numFloors:1, theme:'factory', lootQuality:'factory', enemyChance:30 },
        ]},
      { id:'control', name:'Control Block',  x:1700, w:550, bgColor:'#07080c', lootTable:'electronics',  enemyChance:55, requiresLockpick:true,
        buildings:[
          { relX:180, label:'Control Room',    numFloors:2, theme:'office',  lootQuality:'rare',    enemyChance:55 },
        ]},
      { id:'garage',  name:'Vehicle Bay',   x:2250, w:550, bgColor:'#0a0c0f', lootTable:'heavy_mat',    enemyChance:30 },
    ],
  },
  {
    id: 'mall',
    name: 'Abandoned Mall',
    desc: 'The shopping centre has everything — textiles, food, weapons — if you survive long enough to find it.',
    difficulty: 2,
    bgTheme: 'urban',
    ambientDesc: 'Empty escalators. Broken mannequins. A distant alarm still cycling.',
    zones: [
      { id:'lot',      name:'Parking Lot',     x:0,    w:450, bgColor:'#0d0d0a', lootTable:'urban_light',  enemyChance:12 },
      { id:'entrance', name:'Mall Entrance',   x:450,  w:300, bgColor:'#111108', lootTable:'mixed_light',   enemyChance:10 },
      { id:'main',     name:'Main Floor',      x:750,  w:800, bgColor:'#0e0e08', lootTable:'mall_general',  enemyChance:22,
        buildings:[
          { relX:250, label:'Department Store', numFloors:3, theme:'mall',    lootQuality:'mall',    enemyChance:28 },
        ]},
      { id:'food',     name:'Food Court',      x:1550, w:500, bgColor:'#0c0c06', lootTable:'food_heavy',    enemyChance:18 },
      { id:'back',     name:'Staff Offices',   x:2050, w:450, bgColor:'#0a0a05', lootTable:'mixed_rare',    enemyChance:30, requiresLockpick:true,
        buildings:[
          { relX:150, label:'Staff Area',       numFloors:1, theme:'office',  lootQuality:'medium',  enemyChance:25 },
        ]},
    ],
  },
  {
    id: 'hospital',
    name: 'City Hospital',
    desc: 'High-value medical supplies and high danger. The AI uses hospitals as patrol hubs.',
    difficulty: 4,
    bgTheme: 'urban_dark',
    ambientDesc: 'Flickering emergency lights. Distant mechanical sounds.',
    zones: [
      { id:'lot',      name:'Ambulance Bay',   x:0,    w:400, bgColor:'#0c0c0f', lootTable:'medical_light', enemyChance:20 },
      { id:'lobby',    name:'Main Lobby',      x:400,  w:400, bgColor:'#0d0d12', lootTable:'mixed_light',   enemyChance:25 },
      { id:'wards',    name:'Patient Wards',   x:800,  w:600, bgColor:'#0a0a0e', lootTable:'medical_heavy', enemyChance:38,
        buildings:[
          { relX:180, label:'Ward Block',       numFloors:3, theme:'hospital', lootQuality:'medical', enemyChance:42 },
        ]},
      { id:'pharmacy', name:'Pharmacy',         x:1400, w:400, bgColor:'#080810', lootTable:'medicine_rare', enemyChance:40, requiresLockpick:true },
      { id:'lab',      name:'Research Lab',    x:1800, w:500, bgColor:'#06060e', lootTable:'electronics',   enemyChance:50,
        buildings:[
          { relX:160, label:'Lab Block',        numFloors:2, theme:'hospital', lootQuality:'rare',    enemyChance:55 },
        ]},
    ],
  },
  {
    id: 'pharmacy',
    name: 'City Pharmacy',
    desc: 'A strip of medical shops and a small pharmacy. Stripped bare in the early days — but dedicated scavengers found hidden stockrooms.',
    difficulty: 2,
    bgTheme: 'urban',
    ambientDesc: 'Broken glass underfoot. Empty shelves. The smell of antiseptic lingers.',
    zones: [
      { id:'street',   name:'Back Street',     x:0,    w:400, bgColor:'#0d0d0f', lootTable:'medical_light', enemyChance:15 },
      { id:'frontage', name:'Shop Frontage',   x:400,  w:500, bgColor:'#0b0b10', lootTable:'pharmacy_main', enemyChance:20,
        buildings:[
          { relX:120, label:'Pharmacy A',    numFloors:1, theme:'pharmacy', lootQuality:'pharma',  enemyChance:18 },
          { relX:320, label:'Medical Clinic',numFloors:2, theme:'hospital', lootQuality:'medical', enemyChance:22 },
        ]},
      { id:'stockroom',name:'Hidden Stockroom',x:900,  w:500, bgColor:'#090910', lootTable:'pharmacy_rare', enemyChance:30, requiresLockpick:true,
        buildings:[
          { relX:160, label:'Storage Depot', numFloors:1, theme:'pharmacy', lootQuality:'pharma_rare', enemyChance:25 },
        ]},
      { id:'alley',    name:'Service Alley',   x:1400, w:400, bgColor:'#0b0b0d', lootTable:'medical_light', enemyChance:25 },
    ],
  },
  {
    id: 'suburb',
    name: 'Suburban Ruins',
    desc: 'Rows of collapsed houses. Personal belongings scattered everywhere. Moderate danger.',
    difficulty: 2,
    bgTheme: 'suburb',
    ambientDesc: "Overgrown paths. A child's swing still moves in the wind.",
    zones: [
      { id:'street',  name:'Main Street',    x:0,    w:500, bgColor:'#0d0d0a', lootTable:'home_light',   enemyChance:14 },
      { id:'homes1',  name:'Row Houses',     x:500,  w:650, bgColor:'#0c0c08', lootTable:'home_medium',  enemyChance:20,
        buildings:[
          { relX:100, label:'House No.4',    numFloors:2, theme:'house',   lootQuality:'home',   enemyChance:18 },
          { relX:420, label:'House No.7',    numFloors:2, theme:'house',   lootQuality:'home',   enemyChance:14 },
        ]},
      { id:'school',  name:'Old School',     x:1150, w:650, bgColor:'#0c0c0a', lootTable:'mixed_medium', enemyChance:28,
        buildings:[
          { relX:220, label:'School Building',numFloors:2, theme:'office',  lootQuality:'medium', enemyChance:25 },
        ]},
      { id:'back',    name:'Back Gardens',   x:1800, w:550, bgColor:'#0a0c06', lootTable:'food_light',   enemyChance:10, huntChance:15 },
    ],
  },

  {
    id: 'police',
    name: 'Police Station',
    desc: 'An old precinct building. Stripped of most weapons early on, but the armory was locked. Patrols are frequent — the AI uses it as a waypoint hub.',
    difficulty: 3,
    bgTheme: 'urban_dark',
    ambientDesc: 'Overturned desks. Broken radios still cycling static. Someone left the coffee machine running.',
    zones: [
      { id:'lot',     name:'Parking Lot',    x:0,    w:400, bgColor:'#0c0c0f', lootTable:'urban_light',  enemyChance:20 },
      { id:'lobby',   name:'Front Desk',     x:400,  w:400, bgColor:'#0b0b0e', lootTable:'police_main',  enemyChance:28,
        buildings:[
          { relX:150, label:'Station Block', numFloors:3, theme:'office', lootQuality:'police', enemyChance:32 },
        ]},
      { id:'cells',   name:'Holding Cells',  x:800,  w:450, bgColor:'#090910', lootTable:'police_main',  enemyChance:35, requiresLockpick:true },
      { id:'armory',  name:'Armory',         x:1250, w:450, bgColor:'#07070c', lootTable:'police_rare',  enemyChance:50, requiresLockpick:true,
        buildings:[
          { relX:160, label:'Weapons Locker', numFloors:1, theme:'office', lootQuality:'rare', enemyChance:55, bossChance:12 },
        ]},
      { id:'evidence',name:'Evidence Room',  x:1700, w:400, bgColor:'#080810', lootTable:'mixed_rare',   enemyChance:40, requiresLockpick:true },
    ],
  },

  {
    id: 'church',
    name: 'Old Church',
    desc: 'A stone church at the edge of the district. Some survivors used it as a shelter early on — donations and supplies may remain. The crypt below was locked.',
    difficulty: 1,
    bgTheme: 'suburb',
    ambientDesc: 'Stained glass. Silence that feels different from other silences. Someone left candles burning.',
    zones: [
      { id:'yard',    name:'Courtyard',     x:0,    w:450, bgColor:'#0d0d0a', lootTable:'home_light',   enemyChance:8 },
      { id:'hall',    name:'Main Hall',     x:450,  w:500, bgColor:'#0c0c08', lootTable:'church_main',  enemyChance:10,
        buildings:[
          { relX:180, label:'Church Hall',  numFloors:2, theme:'house', lootQuality:'home', enemyChance:10 },
        ]},
      { id:'tower',   name:'Bell Tower',    x:950,  w:350, bgColor:'#0b0b07', lootTable:'mixed_light',  enemyChance:14 },
      { id:'crypt',   name:'Crypt',         x:1300, w:450, bgColor:'#080806', lootTable:'church_main',  enemyChance:20, requiresLockpick:true,
        buildings:[
          { relX:140, label:'Underground Crypt', numFloors:1, theme:'pharmacy', lootQuality:'medical', enemyChance:18, bossChance:8 },
        ]},
    ],
  },

  {
    id: 'bunker',
    name: 'Underground Bunker',
    desc: 'A pre-collapse government bunker. The AI has partially occupied it for server infrastructure. Deep in — very dangerous — but the supplies left behind are substantial.',
    difficulty: 4,
    bgTheme: 'urban_dark',
    ambientDesc: 'Emergency lights. The hum of old ventilation. The AI\'s processes run here. Something watched you enter.',
    zones: [
      { id:'tunnel',  name:'Access Tunnel',   x:0,    w:400, bgColor:'#0a0a0e', lootTable:'mixed_light',  enemyChance:30 },
      { id:'command', name:'Command Room',    x:400,  w:500, bgColor:'#08080d', lootTable:'bunker_main',  enemyChance:45,
        buildings:[
          { relX:180, label:'Command Block',  numFloors:2, theme:'factory', lootQuality:'heavy', enemyChance:50 },
        ]},
      { id:'barracks',name:'Barracks',        x:900,  w:500, bgColor:'#07070c', lootTable:'bunker_main',  enemyChance:40 },
      { id:'vault',   name:'Armory Vault',    x:1400, w:400, bgColor:'#060609', lootTable:'bunker_rare',  enemyChance:60, requiresLockpick:true,
        buildings:[
          { relX:140, label:'Vault',          numFloors:1, theme:'office',  lootQuality:'rare',  enemyChance:65, bossChance:20 },
        ]},
      { id:'power',   name:'Power Room',      x:1800, w:450, bgColor:'#050508', lootTable:'electronics',  enemyChance:55,
        buildings:[
          { relX:150, label:'Server Core',    numFloors:2, theme:'factory', lootQuality:'factory', enemyChance:60, bossChance:15 },
        ]},
    ],
  },

  {
    id: 'rooftop',
    name: 'Rooftop Garden',
    desc: 'Someone turned the roof of a city block into a garden. Overgrown now, but things still grow. Water tanks. A greenhouse. A moment of quiet in the ruins.',
    difficulty: 1,
    bgTheme: 'forest',
    ambientDesc: 'Wind. Open sky. Plants growing through cracked concrete. Almost beautiful.',
    zones: [
      { id:'stair',   name:'Stairwell',       x:0,    w:350, bgColor:'#090c07', lootTable:'urban_light',  enemyChance:10 },
      { id:'roof',    name:'Roof Level',      x:350,  w:500, bgColor:'#080b06', lootTable:'rooftop_main', enemyChance:8  },
      { id:'green',   name:'Greenhouse',      x:850,  w:500, bgColor:'#070c05', lootTable:'rooftop_main', enemyChance:6,
        buildings:[
          { relX:170, label:'Greenhouse',     numFloors:1, theme:'tent', lootQuality:'light', enemyChance:5 },
        ]},
      { id:'tanks',   name:'Water Tanks',     x:1350, w:450, bgColor:'#060a06', lootTable:'water_heavy',  enemyChance:10 },
    ],
  },
];

// ── Loot Tables ───────────────────────────────────────────────────────────────
const LOOT_TABLES = {
  urban_light:     [['wood',1,3],['metal',1,2],['cloth',1,2],['rope',1,1]],
  food_light:      [['canned_beans',1,2],['canned_soup',1,2],['energy_bar',0,1]],
  food_heavy:      [['canned_beans',1,4],['canned_soup',1,3],['canned_meat',1,3],['canned_fruit',1,2]],
  food_rare:       [['canned_meat',1,4],['energy_bar',1,3],['canned_fruit',1,3],['jerky',0,2]],
  mall_general:    [['cloth',2,5],['canned_beans',0,2],['energy_bar',0,2],['rope',0,2],['batteries',1,3]],
  mixed_rare:      [['electronics',1,2],['chemicals',1,2],['bandage',1,3],['pistol_ammo',4,10]],
  medical_light:   [['bandage',1,3],['painkiller',1,2]],
  medical_heavy:   [['bandage',2,4],['medkit',0,1],['painkiller',1,3],['antibiotics',0,1]],
  medicine_rare:   [['medkit',1,2],['antibiotics',1,2],['chemicals',2,4]],
  mixed_light:     [['cloth',1,3],['rope',1,2],['batteries',1,2],['matches',1,3]],
  mixed_medium:    [['electronics',1,2],['batteries',1,3],['tools',0,1],['rope',1,3]],
  home_light:      [['cloth',1,4],['book',0,1],['matches',1,2],['toy',0,1],['canned_beans',0,2]],
  home_medium:     [['cloth',2,5],['wood',1,3],['book',0,1],['toy',0,1],['bandage',0,2],['canned_soup',0,2]],
  materials:       [['metal',2,5],['wood',1,4],['rope',1,3],['tools',0,1]],
  heavy_mat:       [['metal',3,8],['tools',0,1],['electronics',1,3],['fuel',1,3]],
  materials_r:     [['metal',4,8],['electronics',2,4],['chemicals',1,3],['tools',1,1]],
  electronics:     [['electronics',2,5],['batteries',2,4],['chemicals',1,2]],
  nature_light:    [['wood',1,4],['rope',0,2],['mushroom',0,2],['dried_berries',0,1]],
  nature_heavy:    [['wood',2,5],['raw_meat',1,2],['mushroom',1,3],['dried_berries',0,2]],
  nature_rare:     [['raw_meat',1,3],['rope',1,3],['mushroom',1,4],['jerky',0,2]],
  water_heavy:     [['dirty_water',2,4],['raw_meat',0,2]],
  pharmacy_main:   [['bandage',2,4],['painkiller',1,3],['antibiotics',0,1],['cloth',1,3]],
  pharmacy_rare:   [['bandage',3,6],['medkit',1,2],['antibiotics',1,3],['painkiller',2,4],['chemicals',1,2]],
  police_main:     [['cloth',1,2],['metal',1,3],['pistol_ammo',4,10],['bandage',0,2]],
  police_rare:     [['pistol_ammo',8,16],['rifle_ammo',4,8],['medkit',0,1],['shotgun_ammo',2,6],['pistol',0,1]],
  church_main:     [['cloth',2,4],['book',1,2],['canned_beans',0,3],['bandage',1,3],['matches',1,2]],
  bunker_main:     [['electronics',2,4],['metal',1,3],['fuel',1,2],['batteries',2,4]],
  bunker_rare:     [['medkit',1,2],['antibiotics',1,2],['pistol_ammo',8,16],['rifle_ammo',4,8],['electronics',2,4]],
  rooftop_main:    [['canned_fruit',1,3],['mushroom',1,4],['dirty_water',1,3],['rope',0,2],['dried_berries',0,3]],
};

// ── Building interior loot tables (per theme+quality) ─────────────────────────
// Each table: [itemId, min, max]  — used when searching containers inside buildings
const BUILDING_LOOT = {
  tent_light:     [['cloth',0,2],['matches',0,1],['dried_berries',0,2],['rope',0,1]],
  cabin_cabin:    [['wood',1,3],['cloth',1,3],['canned_beans',0,2],['book',0,1],['knife',0,1],['rifle_ammo',0,4]],
  factory_heavy:  [['metal',2,5],['electronics',1,3],['tools',0,1],['fuel',0,2],['rope',1,2]],
  factory_factory:[['metal',1,4],['electronics',0,2],['rope',0,2]],
  office_rare:    [['electronics',1,3],['chemicals',1,2],['pistol_ammo',0,8],['pistol',0,1]],
  office_medium:  [['batteries',1,3],['electronics',0,2],['book',0,1],['cloth',0,2]],
  mall_mall:      [['cloth',2,6],['rope',0,2],['bandage',0,2],['canned_beans',0,3],['bat',0,1],['energy_bar',0,2]],
  hospital_medical:[['bandage',1,4],['painkiller',0,2],['medkit',0,1],['antibiotics',0,1],['chemicals',0,2]],
  hospital_rare:  [['medkit',1,2],['antibiotics',0,2],['chemicals',1,3]],
  house_home:        [['cloth',1,4],['canned_beans',0,3],['book',0,1],['toy',0,1],['matches',0,2],['bandage',0,2]],
  pharmacy_pharma:   [['bandage',2,5],['painkiller',1,3],['medkit',0,1],['antibiotics',0,2],['chemicals',0,2]],
  pharmacy_pharma_rare:[['medkit',1,3],['antibiotics',1,3],['bandage',3,6],['painkiller',2,4],['chemicals',1,3]],
  generic_light:     [['cloth',0,2],['matches',0,1],['batteries',0,2]],
  generic_medium:    [['cloth',0,3],['canned_beans',0,2],['bandage',0,2],['rope',0,1]],
  office_police:     [['pistol_ammo',4,10],['metal',1,3],['cloth',1,2],['bandage',0,2],['pistol',0,1]],
};

// ── Enemy Templates ────────────────────────────────────────────────────────────
const ENEMY_TEMPLATES = {
  scout_drone: {
    id:'scout_drone', name:'Scout Drone', type:'machine',
    hp:35, maxHp:35, armor:5, accuracy:60,
    damage:[8,16], reward:{ suspicion:-3 },
    desc:'A small flying surveillance drone.',
    sprite:'drone', drops:[['electronics',1,2],['batteries',1,2]],
  },
  patrol_robot: {
    id:'patrol_robot', name:'Patrol Robot', type:'machine',
    hp:80, maxHp:80, armor:15, accuracy:68,
    damage:[14,26], reward:{ suspicion:-5 },
    desc:'Bipedal security robot. Slow but tough.',
    sprite:'robot', drops:[['metal',2,4],['electronics',1,2]],
  },
  hunter_drone: {
    id:'hunter_drone', name:'Hunter Drone', type:'machine',
    hp:55, maxHp:55, armor:8, accuracy:72,
    damage:[18,30], reward:{ suspicion:-8 },
    desc:'Combat model. Targets biological life.',
    sprite:'drone_heavy', drops:[['electronics',2,3],['pistol_ammo',4,8]],
  },
  raider: {
    id:'raider', name:'Raider', type:'human',
    hp:60, maxHp:60, armor:5, accuracy:65,
    damage:[12,22], reward:{},
    desc:'Desperate and dangerous.',
    sprite:'human_hostile', drops:[['canned_beans',0,2],['cloth',1,3],['knife',0,1]],
  },
  raider_armed: {
    id:'raider_armed', name:'Armed Raider', type:'human',
    hp:70, maxHp:70, armor:8, accuracy:70,
    damage:[16,28], isRanged:true, reward:{},
    desc:'Has a firearm. Take cover.',
    sprite:'human_hostile', drops:[['pistol_ammo',4,10],['pistol',0,1],['canned_meat',0,2]],
  },
  survivor_bandit: {
    id:'survivor_bandit', name:'Survivor', type:'human',
    hp:50, maxHp:50, armor:3, accuracy:60,
    damage:[10,18], reward:{},
    desc:'Another survivor who turned hostile.',
    sprite:'human_hostile', drops:[['canned_beans',0,3],['water_bottle',0,1],['bandage',0,1]],
  },
  wolf: {
    id:'wolf', name:'Feral Wolf', type:'animal',
    hp:45, maxHp:45, armor:0, accuracy:75,
    damage:[14,22], reward:{},
    desc:'Starving and aggressive.',
    sprite:'wolf', drops:[['raw_meat',2,4]],
  },
  wild_dog: {
    id:'wild_dog', name:'Wild Dog', type:'animal',
    hp:28, maxHp:28, armor:0, accuracy:70,
    damage:[8,14], reward:{},
    desc:'Pack animal. More dangerous in groups.',
    sprite:'wolf', drops:[['raw_meat',1,2]],
  },
  // ── Bosses ───────────────────────────────────────────────────────────────────
  boss_hunter: {
    id:'boss_hunter', name:'Elite Hunter', type:'machine',
    hp:150, maxHp:150, armor:20, accuracy:80,
    damage:[25,42], reward:{ suspicion:-12 }, isBoss:true,
    desc:'Combat-grade AI unit. Fast, armoured, lethal.',
    sprite:'drone_heavy', drops:[['electronics',3,5],['pistol_ammo',8,16],['rifle_ammo',4,8]],
  },
  boss_raider_chief: {
    id:'boss_raider_chief', name:'Raider Chief', type:'human',
    hp:120, maxHp:120, armor:15, accuracy:75,
    damage:[22,38], isRanged:true, reward:{}, isBoss:true,
    desc:'Veteran survivor gone ruthless. Leads the pack.',
    sprite:'human_hostile', drops:[['pistol',1,1],['pistol_ammo',8,16],['canned_meat',2,4],['medkit',0,1]],
  },
  boss_patrol_heavy: {
    id:'boss_patrol_heavy', name:'Heavy Patrol Unit', type:'machine',
    hp:200, maxHp:200, armor:28, accuracy:72,
    damage:[30,50], reward:{ suspicion:-15 }, isBoss:true,
    desc:'Armoured combat chassis. Rare — extremely dangerous.',
    sprite:'robot', drops:[['metal',4,6],['electronics',3,5],['fuel',2,3]],
  },
};

// Enemy encounter groups by difficulty/theme
const ENCOUNTER_GROUPS = {
  1: [['scout_drone',1,1],['wild_dog',0,1]],
  2: [['scout_drone',1,2],['raider',0,1],['wild_dog',0,1]],
  3: [['patrol_robot',1,1],['scout_drone',0,1],['raider_armed',0,1],['survivor_bandit',0,1]],
  4: [['hunter_drone',1,2],['patrol_robot',1,1],['raider_armed',1,2]],
  forest: [['wolf',1,2],['wild_dog',0,2],['scout_drone',0,1]],
};

function rollLoot(tableId) {
  const table = LOOT_TABLES[tableId];
  if (!table) return [];
  const result = [];
  for (const [id, min, max] of table) {
    const qty = randInt(min, max);
    if (qty > 0) result.push({ id, qty });
  }
  return result;
}

function rollBuildingLoot(theme, quality) {
  const key = theme + '_' + quality;
  const table = BUILDING_LOOT[key] || BUILDING_LOOT['generic_' + quality] || BUILDING_LOOT.generic_light;
  const result = [];
  for (const [id, min, max] of table) {
    const qty = randInt(min, max);
    if (qty > 0) result.push({ id, qty });
  }
  return result;
}

function buildEncounter(locationDifficulty, zone, locCanHunt) {
  const key = (locCanHunt || zone.canHunt) ? 'forest' : Math.min(4, locationDifficulty);
  const group = ENCOUNTER_GROUPS[key];
  if (!group) return [];
  const enemies = [];
  for (const [templateId, min, max] of group) {
    const count = randInt(min, max);
    for (let i = 0; i < count; i++) {
      const t = ENEMY_TEMPLATES[templateId];
      if (t) enemies.push(deepClone(t));
    }
  }
  // Boss spawn check
  const bossChance = zone.bossChance || 0;
  if (bossChance > 0 && Math.random() * 100 < bossChance) {
    // Pick boss based on difficulty/type
    const machineLoc = locationDifficulty >= 4;
    const humanLoc   = locationDifficulty <= 2;
    const bossId = machineLoc ? (chance(60) ? 'boss_hunter' : 'boss_patrol_heavy')
                 : humanLoc   ? 'boss_raider_chief'
                 : (chance(50) ? 'boss_hunter' : 'boss_raider_chief');
    const boss = ENEMY_TEMPLATES[bossId];
    if (boss) enemies.push(deepClone(boss));
  }
  return enemies;
}
