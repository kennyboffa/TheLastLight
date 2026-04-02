// explore.js — Side-scrolling exploration with buildings, containers, fog of war
'use strict';

const GROUND_Y    = 276;
const PLAYER_FOOT = GROUND_Y;
const BUILDING_W  = 900;   // interior width of each building floor

// World zoom — game world is rendered at this scale; HUD/buttons are drawn
// AFTER ctx.restore() so they stay at 1× and never get clipped or scrolled.
const EXPLORE_VIEW_ZOOM = 1.15;

let exploreState = null;
let fogCanvas    = null;   // offscreen canvas for fog of war

// ── Mobile D-pad button rects ─────────────────────────────────────────────────
const _MOBILE_BTNS = {
  left:   { x: 8,   y: 272, w: 60, h: 44 },
  right:  { x: 74,  y: 272, w: 60, h: 44 },
  action: { x: 526, y: 272, w: 66, h: 44 },
};

// ── Fog of war ────────────────────────────────────────────────────────────────

function initFogCanvas() {
  fogCanvas = document.createElement('canvas');
  fogCanvas.width  = CFG.W;
  fogCanvas.height = CFG.H;
}

function nightFactor(time) {
  // Returns 0=full day, 1=full night
  if (time >= 7*60 && time < 19*60) return 0;          // day
  if (time >= 21*60 || time < 5*60) return 1;          // night
  if (time >= 19*60) return (time - 19*60) / (2*60);   // dusk (19-21)
  return 1 - (time - 5*60) / (2*60);                   // dawn (5-7)
}

function renderFog(ctx, playerScreenX, playerScreenY, gs, isIndoor) {
  if (!fogCanvas) initFogCanvas();
  const fc = fogCanvas.getContext('2d');
  const df = dayFactor(gs.time);
  const nf = nightFactor(gs.time);
  // Night shrinks fog radius significantly
  const baseOut = CFG.FOG_RADIUS_OUT + Math.round(130 * df);
  const baseIn  = CFG.FOG_RADIUS_IN  + Math.round(60  * df);
  const nightShrinkOut = Math.round(120 * nf);
  const nightShrinkIn  = Math.round(80  * nf);
  const radius = (isIndoor ? baseIn - nightShrinkIn : baseOut - nightShrinkOut);

  fc.clearRect(0, 0, CFG.W, CFG.H);
  fc.fillStyle = 'rgba(0,0,0,0.84)';
  fc.fillRect(0, 0, CFG.W, CFG.H);

  // Punch a radial hole around the player
  const grad = fc.createRadialGradient(
    playerScreenX, playerScreenY, 0,
    playerScreenX, playerScreenY, radius
  );
  grad.addColorStop(0,   'rgba(0,0,0,1)');
  grad.addColorStop(0.55,'rgba(0,0,0,1)');
  grad.addColorStop(1,   'rgba(0,0,0,0)');

  fc.globalCompositeOperation = 'destination-out';
  fc.fillStyle = grad;
  fc.fillRect(0, 0, CFG.W, CFG.H);
  fc.globalCompositeOperation = 'source-over';

  ctx.drawImage(fogCanvas, 0, 0);
}

// ── Init exploration ──────────────────────────────────────────────────────────

function startExploration(gs, loc) {
  if (!loc) loc = randChoice(LOCATIONS_DB);

  // Pre-generate buildings (MUST be done here — never call randInt in render)
  const buildings = [];
  for (const zone of loc.zones) {
    const zoneBdefs = zone.buildings || [];
    for (const bdef of zoneBdefs) {
      // Random-layout areas: skip some optional buildings (~30% chance of absence per visit)
      // and randomise positions so the area looks genuinely different each time
      if (loc.randomLayout && !bdef.required && chance(30)) continue;
      const baseRelX = loc.randomLayout
        ? Math.floor(zone.w * 0.1) + randInt(0, Math.floor(zone.w * 0.65))
        : bdef.relX;
      const bx = zone.x + baseRelX;
      // Tents are much smaller than proper buildings
      const bw     = bdef.isTent ? 55 + randInt(0, 20) : 130 + randInt(0, 80);
      const bh     = bdef.isTent ? 40 + randInt(0, 10) : 85 + randInt(20, 55);
      const nFloors = bdef.numFloors || 1;
      const floors  = [];
      for (let fi = 0; fi < nFloors; fi++) {
        floors.push(genBuildingFloor(fi, nFloors, bdef));
      }
      buildings.push({
        bx, bw, bh,
        label:    bdef.label || zone.name,
        theme:    bdef.theme || 'urban',
        numFloors: nFloors,
        floors,
        doorX:    bx + Math.floor(bw / 2) - 8,
        isTent:   !!bdef.isTent,
      });
    }
    // Add a small generic structure for zones with no explicit buildings but outdoor loot
    if ((zone.buildings || []).length === 0 && zone.lootTable &&
        !zone.lootTable.startsWith('nature') && !zone.lootTable.startsWith('water')) {
      const bx = zone.x + Math.floor(zone.w * 0.4);
      const bw = 90 + randInt(0, 50);
      const bh = 65 + randInt(0, 40);
      buildings.push({
        bx, bw, bh,
        label: zone.name,
        theme: 'urban',
        numFloors: 1,
        floors: [genBuildingFloor(0, 1, { lootQuality: 'light', theme: 'urban' })],
        doorX: bx + Math.floor(bw / 2) - 8,
      });
    }
  }

  // Outdoor containers — scarce: 0-1 per zone only outside nature zones
  const containers = [];
  for (const zone of loc.zones) {
    const isNatureZone = zone.lootTable && (zone.lootTable.startsWith('nature') || zone.lootTable.startsWith('water'));
    const count = isNatureZone ? 0 : randInt(0, 1);
    for (let i = 0; i < count; i++) {
      const cx = zone.x + 50 + randInt(0, zone.w - 100);
      if (buildings.some(b => Math.abs(cx - (b.doorX + 8)) < 35)) continue;
      const types = ['locker', 'bag'];
      // 30% chance container is empty (already picked over)
      const loot = chance(30) ? [] : rollLoot(zone.lootTable);
      containers.push({
        wx: cx, wy: GROUND_Y,
        type: randChoice(types),
        searched: false, searching: false,
        searchProgress: 0,
        searchDuration: 1.5 + randFloat(0.5, 2.5),
        loot,
      });
    }
  }

  // Sparse ground loot — only ~15% of rolled items end up visible on the ground
  const lootItems = [];
  for (const zone of loc.zones) {
    const items = rollLoot(zone.lootTable);
    const groundItems = items.filter(() => Math.random() < 0.15);
    for (const item of groundItems) {
      lootItems.push({
        id: item.id, qty: item.qty,
        wx: zone.x + randInt(30, zone.w - 30),
        wy: PLAYER_FOOT, taken: false,
      });
    }
  }

  // Enemy encounters — capped at 0-2 for early game
  const encounters = [];
  for (const zone of loc.zones) {
    if (chance(zone.enemyChance)) {
      encounters.push({
        wx: zone.x + Math.floor(zone.w * 0.6) + randInt(-20, 20),
        triggered: false, killed: false, distance: 70,
        difficulty: loc.difficulty,
        locCanHunt: !!loc.canHunt,
        zone,
      });
    }
  }
  // Cap encounter count by difficulty (shuffle then slice)
  const maxEnc = loc.difficulty <= 1 ? 2 : loc.difficulty <= 2 ? 3 : encounters.length;
  for (let i = encounters.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = encounters[i]; encounters[i] = encounters[j]; encounters[j] = tmp;
  }
  encounters.length = Math.min(encounters.length, maxEnc);

  // Random events
  const events = [];
  for (let i = 0; i < 2; i++) {
    events.push({ wx: randInt(300, CFG.WORLD_W - 300), triggered: false, distance: 40 });
  }

  // Hunt spots
  const huntSpots = [];
  if (loc.canHunt) {
    for (const zone of loc.zones) {
      if (zone.huntChance && chance(zone.huntChance)) {
        huntSpots.push({ wx: zone.x + randInt(40, zone.w - 40), used: false });
      }
    }
  }

  // Pre-generate decorative elements (bushes, grass, bones, wrecks, debris)
  const foliage = [];
  const bonesPiles = [];
  const isForestLoc = loc.bgTheme === 'forest';
  for (const zone of loc.zones) {
    const isNature = zone.lootTable && zone.lootTable.startsWith('nature');
    const isUrban  = !isNature && !isForestLoc;
    const bushCount = isNature ? 6 + randInt(0, 6) : randInt(0, 3);
    const grassCount = isNature ? 8 + randInt(0, 8) : randInt(0, 3);

    for (let i = 0; i < bushCount; i++) {
      const wx = zone.x + 20 + randInt(0, zone.w - 40);
      const type = chance(35) ? 'wide_bush' : 'bush';
      foliage.push({ type, wx });
    }
    for (let i = 0; i < grassCount; i++) {
      foliage.push({ type: 'grass', wx: zone.x + 10 + randInt(0, zone.w - 20) });
    }

    // Tall trees / dead trees in nature / forest zones
    if (isNature || isForestLoc) {
      const tallCount = randInt(1, 4);
      for (let i = 0; i < tallCount; i++) {
        foliage.push({ type: 'tall_tree', wx: zone.x + 30 + randInt(0, zone.w - 60) });
      }
      if (chance(40)) {
        foliage.push({ type: 'dead_tree', wx: zone.x + 40 + randInt(0, zone.w - 80) });
      }
    }

    // Car wrecks and debris in urban / industrial zones
    if (isUrban) {
      const wreckCount = randInt(0, 2);
      for (let i = 0; i < wreckCount; i++) {
        foliage.push({ type: 'car_wreck', wx: zone.x + 60 + randInt(0, zone.w - 120) });
      }
      const debrisCount = randInt(1, 4);
      for (let i = 0; i < debrisCount; i++) {
        foliage.push({ type: 'debris', wx: zone.x + 20 + randInt(0, zone.w - 40) });
      }
    }

    // Bones: small chance in each zone, higher in dangerous zones
    const boneChance = isNature ? 8 : (zone.enemyChance || 0) > 25 ? 35 : 15;
    if (chance(boneChance)) {
      bonesPiles.push({ wx: zone.x + 30 + randInt(0, zone.w - 60) });
    }
  }

  exploreState = {
    location:  loc,
    scrollX:   0,
    loot:      lootItems,
    containers,
    buildings,
    encounters,
    events,
    huntSpots,
    foliage,
    bonesPiles,
    px: 80, py: PLAYER_FOOT,
    velX: 0, facing: 1,
    animFrame: 0, animTimer: 0,
    showReturnPrompt: false,
    building: null,   // non-null when inside a building
    invOpen: false, invScroll: 0, invSelected: null,
  };

  // Random areas always regenerate — never restore persistent state
  const RANDOM_AREAS = ['forest', 'factory', 'village'];

  // Restore persistent loot/encounter state from previous visit (not for random areas)
  const saved = (!RANDOM_AREAS.includes(loc.id)) && gs.locationStates && gs.locationStates[loc.id];
  if (saved) {
    saved.containers.forEach((sc, i) => {
      if (exploreState.containers[i]) exploreState.containers[i].searched = sc.searched;
    });
    saved.loot.forEach((sl, i) => {
      if (exploreState.loot[i]) exploreState.loot[i].taken = sl.taken;
    });
    saved.encounters.forEach((se, i) => {
      if (!exploreState.encounters[i]) return;
      if (se.killed) {
        // Enemy was killed — small chance a wanderer moved in
        exploreState.encounters[i].triggered = chance(12) ? false : true;
      } else if (se.triggered) {
        // Encounter was triggered but not killed (fled) — don't re-trigger
        exploreState.encounters[i].triggered = true;
      }
    });
    if (saved.buildings) {
      saved.buildings.forEach((sb, bi) => {
        if (!exploreState.buildings[bi]) return;
        sb.floors.forEach((sf, fi) => {
          if (!exploreState.buildings[bi].floors[fi]) return;
          sf.containers.forEach((sc, ci) => {
            const c = exploreState.buildings[bi].floors[fi].containers[ci];
            if (c) c.searched = sc.searched;
          });
        });
      });
    }
  }

  // Inject area maps into specific buildings if not yet found
  if (!gs.foundMaps) gs.foundMaps = { area_map_1: false, area_map_2: false };
  if (!gs.foundMaps.area_map_1) {
    const mapBldg = buildings.find(b => b.label === 'Forest Cabin' || b.label === 'Church Hall');
    if (mapBldg && mapBldg.floors[0]?.containers.length > 0) {
      mapBldg.floors[0].containers[0].loot.push({ id: 'area_map_1', qty: 1 });
    }
  }
  if (!gs.foundMaps.area_map_2) {
    const mapBldg2 = buildings.find(b => b.label?.startsWith('House No.') || b.label === 'Storage Depot');
    if (mapBldg2 && mapBldg2.floors[0]?.containers.length > 0) {
      mapBldg2.floors[0].containers[0].loot.push({ id: 'area_map_2', qty: 1 });
    }
  }

  gs.parent.isExploring    = true;
  gs.parent.hasExploredToday = true; // one run per day
  gs.child.isAlone         = true;
  gs.timeScale = 1; // always reset speed on exploration start
  Audio.resume();
  Audio.stopShelterMusic();
  Audio.startMusic();

  // Travel time: harder locations take longer to reach (diff 1-2: +1h, diff 3-4: +2h)
  const travelMins = loc.difficulty >= 3 ? 120 : 60;
  gs.time = Math.min(gs.time + travelMins, CFG.DAY_END - 60);

  gs.screenFade = { active: true, alpha: 0, phase: 'out', titleText: null, pendingFn: () => {
    gs.screen   = 'explore';
    gs.zoomAnim = { scale: 1.0, target: 1.0 };
  }};

  // Mark companion as away on exploration
  if (gs.exploreCompanionId) {
    const comp = (gs.survivors || []).find(s => s.id === gs.exploreCompanionId);
    if (comp && !comp.onMission) {
      comp.isExploring = true;
      addLog(`Exploring: ${loc.name} (with ${comp.name})`, 'info');
    } else {
      gs.exploreCompanionId = null;
      addLog(`Exploring: ${loc.name}`, 'info');
    }
  } else {
    addLog(`Exploring: ${loc.name}`, 'info');
  }

  if (!gs.flags.firstExplore) {
    gs.flags.firstExplore = true;
    notify('A/D to move. [E] to interact. Enter buildings for better loot.', 'info');
    // Opening story: show on return from first ever exploration
    if (!gs.flags.storyOpening) {
      gs.flags.storyOpening = true;
      gs._pendingStoryOpening = true;
    }
    // Reflection on leaving Lily: also fires on return
    if (!gs.flags.storyFirstOut) {
      gs.flags.storyFirstOut = true;
      gs._pendingStoryFirstOut = true;
    }
  }
}

// Generate one floor of a building
function genBuildingFloor(floorIdx, totalFloors, bdef) {
  const theme   = bdef.theme    || 'urban';
  const quality = bdef.lootQuality || 'light';
  const cCount  = 1 + randInt(0, 2);
  const containers = [];
  const usedX = [];
  for (let i = 0; i < cCount; i++) {
    let cx;
    let attempts = 0;
    do { cx = 90 + randInt(0, BUILDING_W - 180); attempts++; }
    while (usedX.some(p => Math.abs(p - cx) < 70) && attempts < 20);
    usedX.push(cx);
    const typesByTheme = {
      hospital: ['cabinet', 'locker', 'box'],
      factory:  ['crate', 'box', 'barrel'],
      mall:     ['shelf', 'locker', 'bag'],
      house:    ['locker', 'chest', 'bag'],
      cabin:    ['chest', 'bag', 'crate'],
      office:   ['locker', 'cabinet', 'box'],
    };
    const types = typesByTheme[theme] || ['locker', 'crate', 'chest', 'bag'];
    containers.push({
      wx: cx, wy: GROUND_Y,
      type: randChoice(types),
      searched: false, searching: false,
      searchProgress: 0,
      searchDuration: 1.5 + randFloat(0.5, 2.5),
      // 25% chance a building container is empty — already looted by others
      loot: chance(25) ? [] : rollBuildingLoot(theme, quality),
    });
  }
  return {
    containers,
    stairsUpX:   floorIdx < totalFloors - 1 ? BUILDING_W - 110 : null,
    stairsDownX: floorIdx > 0               ? 110              : null,
    exitX:       floorIdx === 0             ? 55                : null,
    width:       BUILDING_W,
  };
}

// ── Update ────────────────────────────────────────────────────────────────────

function updateExplore(gs, dt) {
  if (!exploreState) return;
  if (exploreState.building) { updateBuildingInterior(gs, dt); return; }

  const es = exploreState;
  const p  = gs.parent;

  // Movement (keyboard + mobile D-pad)
  const dpadLeft  = gs.mouse.down && hitTest(gs.mouse.x, gs.mouse.y, _MOBILE_BTNS.left.x,  _MOBILE_BTNS.left.y,  _MOBILE_BTNS.left.w,  _MOBILE_BTNS.left.h);
  const dpadRight = gs.mouse.down && hitTest(gs.mouse.x, gs.mouse.y, _MOBILE_BTNS.right.x, _MOBILE_BTNS.right.y, _MOBILE_BTNS.right.w, _MOBILE_BTNS.right.h);
  const left  = gs.keys['a'] || gs.keys['arrowleft']  || dpadLeft;
  const right = gs.keys['d'] || gs.keys['arrowright'] || dpadRight;
  const speedMult = (gs.parent.wounded ? 0.55 : 1.0) * (gs.timeScale || 1);
  if (left)       { es.velX = -CFG.PLAYER_SPEED * speedMult; es.facing = -1; }
  else if (right) { es.velX =  CFG.PLAYER_SPEED * speedMult; es.facing =  1; }
  else es.velX = 0;

  es.px = clamp(es.px + es.velX, 10, CFG.WORLD_W - 10);

  const targetScroll = es.px - CFG.W * 0.35;
  es.scrollX = clamp(lerp(es.scrollX, targetScroll, 0.15), 0, CFG.WORLD_W - CFG.W);

  es.animTimer++;
  if (Math.abs(es.velX) > 0.1 && es.animTimer % 12 === 0) es.animFrame++;
  else if (Math.abs(es.velX) < 0.1) es.animFrame = 0;
  p.animFrame = es.animFrame;
  p.facing    = es.facing;

  // Container search tick
  for (const c of es.containers) {
    if (c.searching) {
      c.searchProgress += dt;
      const dur = c._meticulousAdj ? c.searchDuration * 1.5 : c.searchDuration;
      if (c.searchProgress >= dur) {
        c.searching = false; c.searched = true;
        finishSearch(c, gs);
      }
    }
  }

  // Encounters — trigger distance grows by 20% at night
  const nightMult = 1 + nightFactor(gs.time) * 0.2;
  for (const enc of es.encounters) {
    if (!enc.triggered && Math.abs(es.px - enc.wx) < enc.distance * nightMult) {
      enc.triggered = true;
      const enemies = buildEncounter(enc.difficulty, enc.zone, enc.locCanHunt, gs.day);
      if (enemies.length > 0) { gs.mouse.down = false; startCombat(gs, enemies); gs.combat._encRef = enc; gs.screen = 'combat'; return; }
    }
  }

  // Random events
  for (const ev of es.events) {
    if (!ev.triggered && Math.abs(es.px - ev.wx) < ev.distance) {
      ev.triggered = true;
      const eventData = pickEvent(gs, 'explore');
      if (eventData) {
        gs.mouse.down = false; eventUI.openLockFrames = 3; gs.event = eventData; gs.screen = 'event'; gs._returnTo = 'explore'; return;
      }
    }
  }

  // Hunt spots
  for (const spot of es.huntSpots) {
    if (!spot.used && Math.abs(es.px - spot.wx) < 30) {
      spot.used = true;
      addToInventory(p.inventory, 'raw_meat', randInt(1, 3));
      addLog('Hunted: found raw meat.', 'good');
    }
  }

  es.showReturnPrompt = es.px < 80 || es.px > CFG.WORLD_W - 120;
  if (p.tiredness >= 92) {
    // Collapsed from exhaustion — treated like a late return (found at dawn)
    gs.lateReturn    = true;
    gs.parent.wounded = true;
    addLog(`${p.name} collapsed from exhaustion in the field.`, 'danger');
    endExploration(gs);
    return;
  }

  // Creepy ambient FX — triggers randomly, roughly every 2-5 minutes
  es._creepyTimer = (es._creepyTimer || 0) + 1;
  if (es._creepyTimer > 7200 && Math.random() < 0.002) {
    Audio.creepyAmbient();
    es._creepyTimer = Math.floor(Math.random() * 3600); // reset with variance
  }

}

function updateBuildingInterior(gs, dt) {
  const es  = exploreState;
  const bi  = es.building;
  const bld = es.buildings[bi.bldgIdx];
  const fl  = bld.floors[bi.floorIdx];
  const p   = gs.parent;

  const biDpadLeft  = gs.mouse.down && hitTest(gs.mouse.x, gs.mouse.y, _MOBILE_BTNS.left.x,  _MOBILE_BTNS.left.y,  _MOBILE_BTNS.left.w,  _MOBILE_BTNS.left.h);
  const biDpadRight = gs.mouse.down && hitTest(gs.mouse.x, gs.mouse.y, _MOBILE_BTNS.right.x, _MOBILE_BTNS.right.y, _MOBILE_BTNS.right.w, _MOBILE_BTNS.right.h);
  const left  = gs.keys['a'] || gs.keys['arrowleft']  || biDpadLeft;
  const right = gs.keys['d'] || gs.keys['arrowright'] || biDpadRight;
  const biSpeedMult = gs.timeScale || 1;
  if (left)       { bi.velX = -CFG.PLAYER_SPEED * biSpeedMult; bi.facing = -1; }
  else if (right) { bi.velX =  CFG.PLAYER_SPEED * biSpeedMult; bi.facing =  1; }
  else bi.velX = 0;

  bi.px = clamp(bi.px + bi.velX, 10, fl.width - 10);

  const targetScroll = bi.px - CFG.W * 0.35;
  bi.scrollX = clamp(lerp(bi.scrollX, targetScroll, 0.15), 0, Math.max(0, fl.width - CFG.W));

  bi.animTimer = (bi.animTimer || 0) + 1;
  if (Math.abs(bi.velX) > 0.1 && bi.animTimer % 12 === 0) bi.animFrame = ((bi.animFrame || 0) + 1);
  else if (Math.abs(bi.velX) < 0.1) bi.animFrame = 0;
  p.animFrame = bi.animFrame || 0;
  p.facing    = bi.facing;

  // Container search tick
  for (const c of fl.containers) {
    if (c.searching) {
      c.searchProgress += dt;
      const dur = c._meticulousAdj ? c.searchDuration * 1.5 : c.searchDuration;
      if (c.searchProgress >= dur) {
        c.searching = false; c.searched = true;
        finishSearch(c, gs);
      }
    }
  }
}

function finishSearch(container, gs) {
  if (!container.loot || container.loot.length === 0) {
    notify('Nothing useful found.', 'info');
    return;
  }

  // Hospital antiviral injection — 40% chance per container when Lily is sick and antiviral not yet found
  if (exploreState && exploreState.location && exploreState.location.id === 'hospital'
      && gs.flags.lilySick && !gs.flags.lilyCured && !gs.flags.antiviralFound
      && Math.random() < 0.40) {
    gs.flags.antiviralFound = true;
    container.loot.push({ id: 'antiviral', qty: 1 });
  }

  // Apply trait-based loot bonuses — expand loot pool before picking up
  let loot = container.loot.slice();
  const trait = gs.parent.trait;
  const nf    = nightFactor(gs.time);
  // lucky: 10% more items (extra roll per item)
  if (trait === 'lucky') {
    const bonus = [];
    for (const item of loot) {
      if (Math.random() < 0.10) bonus.push({ ...item });
    }
    loot = loot.concat(bonus);
  }
  // meticulous: 30% more items
  if (trait === 'meticulous') {
    const bonus = [];
    for (const item of loot) {
      if (Math.random() < 0.30) bonus.push({ ...item });
    }
    loot = loot.concat(bonus);
  }
  // night_owl: +20% items at night, -10% at day
  if (trait === 'night_owl') {
    if (nf > 0.5) {
      // night — add ~20% extra items
      const bonus = [];
      for (const item of loot) {
        if (Math.random() < 0.20) bonus.push({ ...item });
      }
      loot = loot.concat(bonus);
    } else {
      // day — remove ~10% of items
      loot = loot.filter(() => Math.random() >= 0.10);
    }
  }

  let added = 0;
  let tooHeavy = 0;
  const names = [];
  for (const item of loot) {
    const def  = getItemDef(item.id);
    const maxW = parentMaxCarry();
    const curW = calcWeight(gs.parent.inventory);
    if (def && curW + def.weight * item.qty <= maxW) {
      addToInventory(gs.parent.inventory, item.id, item.qty);
      if (names.length < 2) names.push(def.name);
      added++;
    } else if (def) {
      tooHeavy++;
    }
  }
  if (tooHeavy > 0 && added === 0) {
    notify('Too heavy to carry — drop something first.', 'warn');
    return;
  }
  if (added > 0) {
    addLog(`Found: ${names.join(', ')}${container.loot.length > 2 ? '...' : ''}`, 'good');
    giveXP(gs.parent, added * 2, gs); // +2 XP per item found
    // Check for map items
    for (const item of container.loot) {
      if (item.id === 'area_map_1' || item.id === 'area_map_2') {
        handleMapPickup(item.id, gs);
      }
    }
  } else {
    notify('Too heavy to carry.', 'warn');
  }
}

// ── Key handling ──────────────────────────────────────────────────────────────

function exploreKeyPress(key, gs) {
  if (!exploreState) return;
  const es = exploreState;

  if (key === 'e') {
    if (es.building) interactBuilding(gs);
    else             interactOutdoor(gs);
    return;
  }
  if (key === 'escape') {
    if (es.building) notify('Find the exit door to leave the building.', 'info');
    else if (es.showReturnPrompt) endExploration(gs);
    else notify('Move to the edge of the area to return home.', 'info');
  }
}

function interactOutdoor(gs) {
  const es = exploreState;

  // Pick up nearby ground loot
  const nearLoot = es.loot.find(item => !item.taken && Math.abs(es.px - item.wx) < 25);
  if (nearLoot) {
    const def  = getItemDef(nearLoot.id);
    const maxW = parentMaxCarry();
    const curW = calcWeight(gs.parent.inventory);
    if (curW + (def?.weight || 0) * nearLoot.qty > maxW) { notify('Too heavy.', 'warn'); return; }
    addToInventory(gs.parent.inventory, nearLoot.id, nearLoot.qty);
    nearLoot.taken = true;
    addLog(`Picked up: ${def?.name || nearLoot.id} x${nearLoot.qty}`, 'good');
    giveXP(gs.parent, 2, gs); // +2 XP per pickup
    return;
  }

  // Cancel an in-progress search
  const searchingC = es.containers.find(c => c.searching && Math.abs(es.px - c.wx) < 30);
  if (searchingC) { searchingC.searching = false; searchingC.searchProgress = 0; return; }

  // Start searching a container
  const nearC = es.containers.find(c => !c.searched && !c.searching && Math.abs(es.px - c.wx) < 30);
  if (nearC) {
    nearC.searching = true; nearC.searchProgress = 0;
    if (gs.parent.trait === 'meticulous') nearC._meticulousAdj = true;
    notify('Searching...', 'info'); return;
  }

  // Search a tent (not enterable — just a search prompt)
  const nearTent = es.buildings.find(b => b.isTent && !b._tentSearched && Math.abs(es.px - (b.bx + b.bw / 2)) < 30);
  if (nearTent) {
    nearTent._tentSearched = true;
    const loot = nearTent.floors[0].containers[0]?.loot || [];
    if (loot.length === 0) {
      notify('The tent has been picked clean — nothing left.', 'info');
    } else {
      let added = 0;
      const names = [];
      for (const item of loot) {
        const def  = getItemDef(item.id);
        const maxW = parentMaxCarry();
        const curW = calcWeight(gs.parent.inventory);
        if (def && curW + def.weight * item.qty <= maxW) {
          addToInventory(gs.parent.inventory, item.id, item.qty);
          if (names.length < 3) names.push(def.name);
          added++;
        }
      }
      if (added > 0) notify(`Found in tent: ${names.join(', ')}.`, 'good');
      else notify('Too heavy to carry what\'s in the tent.', 'warn');
    }
    return;
  }

  // Enter a building (non-tent)
  const nearB = es.buildings.find(b => !b.isTent && Math.abs(es.px - (b.doorX + 8)) < 24);
  if (nearB) {
    const bldgIdx = es.buildings.indexOf(nearB);
    es.building = {
      bldgIdx, floorIdx: 0,
      px: (nearB.floors[0].exitX || 60) + 24,
      scrollX: 0, velX: 0, facing: 1, animFrame: 0, animTimer: 0,
    };
    notify(`Entered: ${nearB.label}`, 'info');
    return;
  }

  if (es.showReturnPrompt) endExploration(gs);
}

function interactBuilding(gs) {
  const es  = exploreState;
  const bi  = es.building;
  const bld = es.buildings[bi.bldgIdx];
  const fl  = bld.floors[bi.floorIdx];

  // Exit door (floor 0 only)
  if (fl.exitX !== null && Math.abs(bi.px - fl.exitX) < 30) {
    es.building = null;
    notify('Exited building.', 'info');
    return;
  }

  // Stairs up
  if (fl.stairsUpX !== null && Math.abs(bi.px - fl.stairsUpX) < 30 && bi.floorIdx + 1 < bld.numFloors) {
    bi.floorIdx++;
    bi.px = bld.floors[bi.floorIdx].stairsDownX || 110;
    bi.scrollX = 0;
    notify(`Floor ${bi.floorIdx + 1} / ${bld.numFloors}`, 'info');
    return;
  }

  // Stairs down
  if (fl.stairsDownX !== null && Math.abs(bi.px - fl.stairsDownX) < 30 && bi.floorIdx > 0) {
    bi.floorIdx--;
    bi.px = bld.floors[bi.floorIdx].stairsUpX || BUILDING_W - 110;
    bi.scrollX = 0;
    notify(`Floor ${bi.floorIdx + 1} / ${bld.numFloors}`, 'info');
    return;
  }

  // Cancel in-progress search
  const searchingC = fl.containers.find(c => c.searching && Math.abs(bi.px - c.wx) < 30);
  if (searchingC) { searchingC.searching = false; searchingC.searchProgress = 0; return; }

  // Start searching
  const nearC = fl.containers.find(c => !c.searched && !c.searching && Math.abs(bi.px - c.wx) < 30);
  if (nearC) {
    nearC.searching = true; nearC.searchProgress = 0;
    if (gs.parent.trait === 'meticulous') nearC._meticulousAdj = true;
    notify('Searching...', 'info');
  }
}

// ── Click handling ────────────────────────────────────────────────────────────

function exploreClick(mx, my, gs) {
  if (!exploreState) return;
  const es = exploreState;

  // Inventory overlay — handle before anything else
  if (es.invOpen) {
    const px = 30, py = 40, pw = CFG.W - 60, ph = CFG.H - 80;

    // Close button
    if (gs._exploreInvClose && hitTest(mx, my, gs._exploreInvClose.x, gs._exploreInvClose.y, gs._exploreInvClose.w, gs._exploreInvClose.h)) {
      es.invOpen = false; es.invSelected = null; return;
    }

    // Action buttons (shown when item is selected)
    if (es.invSelected !== null && gs._exploreInvActionBtns) {
      for (const btn of gs._exploreInvActionBtns) {
        if (!hitTest(mx, my, btn.x, btn.y, btn.w, btn.h)) continue;
        const slot = gs.parent.inventory[es.invSelected];
        if (!slot) { es.invSelected = null; return; }
        const def = getItemDef(slot.id);
        if (!def) { es.invSelected = null; return; }

        if (btn.action === 'read') {
          gs._returnTo = 'explore';
          gs.event = { id: slot.id, type: 'note', title: def.name, text: def.noteText || '...', choices: [] };
          gs.screen = 'event';
          es.invOpen = false;
          es.invSelected = null;
          return;
        }

        if (btn.action === 'learn_bp') {
          const recipeId = def.blueprintFor;
          if (recipeId && !(gs.unlockedRecipes || []).includes(recipeId)) {
            if (!gs.unlockedRecipes) gs.unlockedRecipes = [];
            gs.unlockedRecipes.push(recipeId);
            removeFromInventory(gs.parent.inventory, slot.id, 1);
            const recipeName = def.name.replace('Blueprint: ', '');
            notify(`Blueprint learned: ${recipeName}`, 'good');
            addLog(`Learned crafting recipe: ${recipeName}.`, 'good');
          } else {
            notify('Already known.', 'info');
          }
          es.invSelected = null;
          return;
        }

        if (btn.action === 'use') {
          const used = useItem(gs.parent, gs.parent.inventory, slot.id, gs);
          if (used) {
            const effects = [];
            if (def.hunger  && def.hunger  < 0) effects.push(`hunger ${def.hunger}`);
            if (def.thirst  && def.thirst  < 0) effects.push(`thirst ${def.thirst}`);
            if (def.health  && def.health  > 0) effects.push(`+${def.health} HP`);
            notify(`Used ${def.name}${effects.length ? ' ('+effects.join(', ')+')' : ''}.`, 'good');
          } else { notify(`Can't use ${def.name}.`, 'warn'); }
          es.invSelected = null;
          return;
        }

        if (btn.action === 'equip') {
          if (def.type === 'weapon') {
            // Swap current weapon to inventory
            if (gs.parent.equipped.weapon) {
              addToInventory(gs.parent.inventory, gs.parent.equipped.weapon, 1);
            }
            gs.parent.equipped.weapon = slot.id;
            removeFromInventory(gs.parent.inventory, slot.id, 1);
            notify(`Equipped ${def.name}.`, 'good');
          } else if (def.type === 'backpack') {
            if (gs.parent.backpackId) {
              addToInventory(gs.parent.inventory, gs.parent.backpackId, 1);
            }
            gs.parent.backpackId = slot.id;
            removeFromInventory(gs.parent.inventory, slot.id, 1);
            notify(`Equipped ${def.name}.`, 'good');
          } else if (def.type === 'armor') {
            if (gs.parent.equipped.armor) {
              addToInventory(gs.parent.inventory, gs.parent.equipped.armor, 1);
            }
            gs.parent.equipped.armor = slot.id;
            removeFromInventory(gs.parent.inventory, slot.id, 1);
            notify(`Equipped ${def.name}.`, 'good');
          }
          es.invSelected = null;
        } else if (btn.action === 'drop1') {
          removeFromInventory(gs.parent.inventory, slot.id, 1);
          const dropX = (es.px || 80) + randInt(-25, 25);
          es.loot.push({ id: slot.id, qty: 1, wx: dropX, wy: PLAYER_FOOT, taken: false });
          notify(`Dropped ${def.name}.`, 'warn');
          if (!gs.parent.inventory.find(s => s.id === slot.id)) es.invSelected = null;
        } else if (btn.action === 'dropAll') {
          const qty = slot.qty;
          removeFromInventory(gs.parent.inventory, slot.id, qty);
          const dropX = (es.px || 80) + randInt(-25, 25);
          es.loot.push({ id: slot.id, qty, wx: dropX, wy: PLAYER_FOOT, taken: false });
          notify(`Dropped ${def.name} x${qty}.`, 'warn');
          es.invSelected = null;
        }
        return;
      }
    }

    // Item row click — select/deselect
    if (gs._exploreInvRows) {
      for (const row of gs._exploreInvRows) {
        if (my >= row.y1 && my < row.y2) {
          es.invSelected = (es.invSelected === row.idx) ? null : row.idx;
          return;
        }
      }
    }

    // Click outside modal to close
    if (!hitTest(mx, my, px, py, pw, ph)) { es.invOpen = false; es.invSelected = null; }
    return;
  }

  // D-pad left/right — ignore clicks (movement handled by mouse.down in update)
  if (hitTest(mx, my, _MOBILE_BTNS.left.x, _MOBILE_BTNS.left.y, _MOBILE_BTNS.left.w, _MOBILE_BTNS.left.h)) return;
  if (hitTest(mx, my, _MOBILE_BTNS.right.x, _MOBILE_BTNS.right.y, _MOBILE_BTNS.right.w, _MOBILE_BTNS.right.h)) return;
  // Action button
  if (hitTest(mx, my, _MOBILE_BTNS.action.x, _MOBILE_BTNS.action.y, _MOBILE_BTNS.action.w, _MOBILE_BTNS.action.h)) {
    exploreKeyPress('e', gs); return;
  }

  // INV button
  if (gs._exploreInvBtn && hitTest(mx, my, gs._exploreInvBtn.x, gs._exploreInvBtn.y, gs._exploreInvBtn.w, gs._exploreInvBtn.h)) {
    es.invOpen = !es.invOpen; if (!es.invOpen) es.invSelected = null; return;
  }

  // Return Home button (bottom-left) — only at area edges and outside buildings
  if (es.showReturnPrompt && !es.building) {
    const _retBtnY = CFG.H - 30;
    if (hitTest(mx, my, 6, _retBtnY, 96, 20)) {
      endExploration(gs);
      return;
    }
  }

  if (es.building) {
    const bi  = es.building;
    const fl  = es.buildings[bi.bldgIdx].floors[bi.floorIdx];
    const wx  = mx + bi.scrollX;
    const nearC = fl.containers.find(c => !c.searched && !c.searching &&
      Math.abs(wx - c.wx) < 24 && my > GROUND_Y - 35 && my < GROUND_Y + 10);
    if (nearC) {
      nearC.searching = true; nearC.searchProgress = 0;
      if (gs.parent.trait === 'meticulous') nearC._meticulousAdj = true;
      notify('Searching...', 'info');
    }
    return;
  }

  // Outdoor click on ground loot
  const wx = mx + es.scrollX;
  const nearLoot = es.loot.find(item => !item.taken &&
    Math.abs(wx - item.wx) < 20 && Math.abs(my - GROUND_Y) < 28);
  if (nearLoot) {
    const def  = getItemDef(nearLoot.id);
    const maxW = parentMaxCarry();
    const curW = calcWeight(gs.parent.inventory);
    if (curW + (def?.weight || 0) * nearLoot.qty > maxW) { notify('Too heavy.', 'warn'); return; }
    addToInventory(gs.parent.inventory, nearLoot.id, nearLoot.qty);
    nearLoot.taken = true;
    addLog(`Picked up: ${def?.name || nearLoot.id} x${nearLoot.qty}`, 'good');
    giveXP(gs.parent, 2, gs);
    return;
  }

  // Outdoor click on container
  const nearC = es.containers.find(c => !c.searched && !c.searching &&
    Math.abs(wx - c.wx) < 24 && my > GROUND_Y - 35 && my < GROUND_Y + 10);
  if (nearC) {
    nearC.searching = true; nearC.searchProgress = 0;
    if (gs.parent.trait === 'meticulous') nearC._meticulousAdj = true;
    notify('Searching...', 'info');
  }
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderExplore(ctx, gs) {
  if (!exploreState) return;
  const es = exploreState;

  if (es.building) renderBuildingInterior(ctx, gs, es);
  else             renderOutdoor(ctx, gs, es);

  drawGrainFilter(ctx);
  drawZoneTitleCard(ctx, es);
  drawExploreHUD(ctx, gs, es);
  if (es.invOpen) drawExploreInventory(ctx, gs, es);
  // Notifications centered between left HUD panels and right clock to avoid overlap
  drawNotifications(ctx, gs, CFG.W / 2, 14, true);
  drawDayTransition(ctx, gs);
}

function renderOutdoor(ctx, gs, es) {
  const loc = es.location;
  const vz  = EXPLORE_VIEW_ZOOM;

  // Outer zoom — scales game world 1.15×; HUD drawn after this restore stays 1×.
  ctx.save();
  ctx.scale(vz, vz);

  drawExploreBackground(ctx, es.scrollX, null, CFG.H, gs.time, loc.bgTheme);
  fillRect(ctx, 0, GROUND_Y, CFG.W, CFG.H - GROUND_Y, C.ground);
  fillRect(ctx, 0, GROUND_Y, CFG.W, 3, C.dirt2);

  ctx.save();
  ctx.translate(-es.scrollX, 0);

  // Zone tint overlays
  for (const zone of loc.zones) {
    fillRect(ctx, zone.x, 0, zone.w, GROUND_Y, zone.bgColor || C.bg, 0.18);
  }

  // Trees for nature/forest zones
  for (const zone of loc.zones) {
    const isNature = zone.lootTable && zone.lootTable.startsWith('nature');
    if (isNature) {
      for (let tx = zone.x + 30; tx < zone.x + zone.w - 20; tx += 64) {
        drawExploreTree(ctx, tx, GROUND_Y);
      }
    }
  }

  // Foliage / environment dressing (pre-generated positions)
  if (es.foliage) {
    for (const f of es.foliage) {
      switch (f.type) {
        case 'bush':       drawExploreBush(ctx, f.wx, GROUND_Y);      break;
        case 'wide_bush':  drawExploreWideBush(ctx, f.wx, GROUND_Y);  break;
        case 'grass':      drawExploreGrass(ctx, f.wx, GROUND_Y);     break;
        case 'tall_tree':  drawExploreTallTree(ctx, f.wx, GROUND_Y);  break;
        case 'dead_tree':  drawExploreDeadTree(ctx, f.wx, GROUND_Y);  break;
        case 'car_wreck':  drawExploreCarWreck(ctx, f.wx, GROUND_Y);  break;
        case 'debris':     drawExploreDebrisPile(ctx, f.wx, GROUND_Y); break;
      }
    }
  }

  // Bones / skeleton piles
  if (es.bonesPiles) {
    for (const b of es.bonesPiles) {
      drawExploreBones(ctx, b.wx, GROUND_Y);
    }
  }

  // Buildings / tents (pre-generated data — no randInt here)
  for (const bld of es.buildings) {
    if (bld.isTent) {
      drawExploreTent(ctx, bld.bx + bld.bw / 2, GROUND_Y, bld.bw, bld.bh, bld.label);
      if (Math.abs(es.px - (bld.bx + bld.bw / 2)) < 30) {
        if (bld._tentSearched) {
          drawText(ctx, 'Searched', bld.bx + bld.bw / 2, GROUND_Y - bld.bh - 8, C.textDim, 6, 'center');
        } else {
          drawText(ctx, '[E] Search Tent', bld.bx + bld.bw / 2, GROUND_Y - bld.bh - 8, C.textBright, 7, 'center');
        }
      }
    } else {
      if (bld.theme === 'cabin') {
        drawExploreCabin(ctx, bld.bx, GROUND_Y - bld.bh, bld.bw, bld.bh, bld.label);
      } else {
        drawExploreBuildingByTheme(ctx, bld.theme, bld.bx, GROUND_Y - bld.bh, bld.bw, bld.bh, bld.label);
      }
      if (Math.abs(es.px - (bld.doorX + 8)) < 24) {
        drawText(ctx, '[E] Enter', bld.doorX + 8, GROUND_Y - bld.bh - 8, C.textBright, 7, 'center');
      }
    }
  }

  // Outdoor containers
  for (const c of es.containers) {
    if (c.searched) continue;
    const near = Math.abs(es.px - c.wx) < 30;
    drawExploreContainer(ctx, c.wx, GROUND_Y, c.type, near);
    if (c.searching) {
      drawSearchBar(ctx, c.wx, GROUND_Y - 22, c.searchProgress / (c._meticulousAdj ? c.searchDuration * 1.5 : c.searchDuration));
    } else if (near) {
      drawText(ctx, '[E] Search', c.wx, GROUND_Y - 24, C.textBright, 7, 'center');
    }
  }

  // Ground loot
  for (const item of es.loot) {
    if (item.taken) continue;
    const def = getItemDef(item.id);
    if (!def) continue;
    const sx = item.wx, sy = GROUND_Y - 6;
    if (!drawGroundItem(ctx, item.id, sx, GROUND_Y, item.wx)) {
      fillRect(ctx, sx - 4, sy - 4, 8, 8, itemTypeColor(def.type), 0.9);
      strokeRect(ctx, sx - 4, sy - 4, 8, 8, C.border2);
    }
    if (item.qty > 1) drawText(ctx, String(item.qty), sx + 5, sy - 2, C.textDim, 6);
    if (Math.abs(es.px - item.wx) < 30) {
      drawText(ctx, def.name, sx, sy - 12, C.textBright, 7, 'center');
    }
  }

  // Encounter warning markers
  for (const enc of es.encounters) {
    if (!enc.triggered && Math.abs(es.px - enc.wx) > 50) {
      drawText(ctx, '⚠', enc.wx, GROUND_Y - 10, '#cc3333', 8, 'center');
    }
  }

  // Hunt spot markers
  for (const spot of es.huntSpots) {
    if (!spot.used) {
      drawText(ctx, '🐾', spot.wx, GROUND_Y - 2, '#3a6a20', 7, 'center');
    }
  }

  // Player
  const _outSearching = es.containers.some(c => c.searching);
  const _outPose = Math.abs(es.velX) > 0.1 ? 'run' : (_outSearching ? 'back' : 'front');
  drawParent(ctx, es.px, PLAYER_FOOT, 2, es.facing, es.animFrame, gs.parent.gender, _outPose);

  // Companion following player
  if (gs.exploreCompanionId) {
    const compIdx = (gs.survivors || []).findIndex(s => s.id === gs.exploreCompanionId);
    if (compIdx >= 0) {
      const compX = es.px - es.facing * 22;
      drawSurvivor(ctx, compX, PLAYER_FOOT, 2, -es.facing, es.animFrame, compIdx, Math.abs(es.velX) > 0.1 ? 'side' : 'front');
    }
  }

  ctx.restore(); // end world translate
  ctx.restore(); // end view zoom

  // Fog — centred on player's scaled screen position (drawn at 1× after zoom restore)
  renderFog(ctx, (es.px - es.scrollX) * vz, PLAYER_FOOT * vz - 12, gs, false);

  // Weather overlay (1×, over everything)
  drawExploreWeather(ctx, gs);
}

function renderBuildingInterior(ctx, gs, es) {
  const bi  = es.building;
  const bld = es.buildings[bi.bldgIdx];
  const fl  = bld.floors[bi.floorIdx];
  const vz  = EXPLORE_VIEW_ZOOM;

  ctx.save();
  ctx.scale(vz, vz);

  // Indoor background
  fillRect(ctx, 0, 0, CFG.W, CFG.H, '#0c0c14');

  ctx.save();
  ctx.translate(-bi.scrollX, 0);

  // Floor
  fillRect(ctx, 0, GROUND_Y, fl.width, CFG.H - GROUND_Y, '#171215');
  fillRect(ctx, 0, GROUND_Y, fl.width, 2, '#2e2028');

  // Ceiling
  fillRect(ctx, 0, 0, fl.width, 28, '#080810');
  fillRect(ctx, 0, 26, fl.width, 2, '#181820');

  // Walls (boundary)
  fillRect(ctx, 0, 0, 8, GROUND_Y, '#161620');
  fillRect(ctx, fl.width - 8, 0, 8, GROUND_Y, '#161620');

  // Floor number label (top centre)
  drawText(ctx, `${bld.label}  —  Floor ${bi.floorIdx + 1} / ${bld.numFloors}`,
    fl.width / 2, 20, C.textDim, 7, 'center');

  // Ambient wall lamps (flickering, some broken)
  for (let lx = 130; lx < fl.width - 100; lx += 200) {
    fillRect(ctx, lx - 4, 28, 8, 3, '#303040');
    const lit = (lx / 200 + bi.floorIdx) % 3 !== 0;
    if (lit) fillRect(ctx, lx - 2, 31, 4, 3, '#b0a050', 0.45);
  }

  // Theme-relevant interior decoration
  drawBuildingInteriorDecor(ctx, bld.theme, fl.width, GROUND_Y);

  // Exit door
  if (fl.exitX !== null) {
    const ex = fl.exitX;
    fillRect(ctx, ex, GROUND_Y - 30, 18, 30, '#070710');
    strokeRect(ctx, ex, GROUND_Y - 30, 18, 30, '#2a2a40');
    drawText(ctx, 'EXIT', ex + 9, GROUND_Y - 33, '#3a6a3a', 7, 'center');
    if (Math.abs(bi.px - ex) < 30) {
      drawText(ctx, '[E] Exit', ex + 9, GROUND_Y - 44, C.textBright, 7, 'center');
    }
  }

  // Stairs
  if (fl.stairsUpX !== null) {
    drawBuildingStairs(ctx, fl.stairsUpX, GROUND_Y, 'up');
    if (Math.abs(bi.px - fl.stairsUpX) < 30) {
      drawText(ctx, '[E] Up', fl.stairsUpX + 12, GROUND_Y - 32, C.textBright, 7, 'center');
    }
  }
  if (fl.stairsDownX !== null) {
    drawBuildingStairs(ctx, fl.stairsDownX, GROUND_Y, 'down');
    if (Math.abs(bi.px - fl.stairsDownX) < 30) {
      drawText(ctx, '[E] Down', fl.stairsDownX + 12, GROUND_Y - 32, C.textBright, 7, 'center');
    }
  }

  // Containers
  for (const c of fl.containers) {
    if (c.searched) {
      drawExploreContainerEmpty(ctx, c.wx, GROUND_Y);
      continue;
    }
    const near = Math.abs(bi.px - c.wx) < 30;
    drawExploreContainer(ctx, c.wx, GROUND_Y, c.type, near);
    if (c.searching) {
      drawSearchBar(ctx, c.wx, GROUND_Y - 22, c.searchProgress / (c._meticulousAdj ? c.searchDuration * 1.5 : c.searchDuration));
    } else if (near) {
      drawText(ctx, '[E] Search', c.wx, GROUND_Y - 24, C.textBright, 7, 'center');
    }
  }

  // Player
  const _biSearching = fl.containers.some(c => c.searching);
  const _biPose = Math.abs(bi.velX) > 0.1 ? 'run' : (_biSearching ? 'back' : 'front');
  drawParent(ctx, bi.px, PLAYER_FOOT, 2, bi.facing, bi.animFrame || 0, gs.parent.gender, _biPose);

  // Companion in building
  if (gs.exploreCompanionId) {
    const compIdx = (gs.survivors || []).findIndex(s => s.id === gs.exploreCompanionId);
    if (compIdx >= 0) {
      drawSurvivor(ctx, bi.px - bi.facing * 22, PLAYER_FOOT, 2, -bi.facing, bi.animFrame || 0, compIdx, Math.abs(bi.velX) > 0.1 ? 'side' : 'front');
    }
  }

  ctx.restore(); // end world translate
  ctx.restore(); // end view zoom

  // Indoor fog (tighter radius)
  renderFog(ctx, (bi.px - bi.scrollX) * vz, PLAYER_FOOT * vz - 12, gs, true);
}

// ── HUD ───────────────────────────────────────────────────────────────────────

function drawExploreHUD(ctx, gs, es) {
  const loc = es.location;
  const mx = gs.mouse.x, my = gs.mouse.y;

  // Location / zone info panel + clock
  drawPanel(ctx, 6, 6, 258, 34, C.panelBg);
  drawText(ctx, loc.name, 12, 20, C.text, 10);
  if (es.building) {
    const bi  = es.building;
    const bld = es.buildings[bi.bldgIdx];
    drawText(ctx, `${bld.label} — Floor ${bi.floorIdx + 1}`, 12, 32, C.textDim, 9);
  } else {
    const curZone = loc.zones.find(z => es.px >= z.x && es.px < z.x + z.w);
    if (curZone) drawText(ctx, curZone.name, 12, 32, C.textDim, 9);
  }

  // Player full status bars below location panel
  const p = gs.parent;
  const hpPct = p.health / p.maxHealth;
  const hpColor = hpPct > 0.6 ? '#3a8a3a' : hpPct > 0.3 ? '#aa6020' : '#cc2020';
  const dColor  = p.depression > 70 ? '#9944dd' : C.depression;
  drawPanel(ctx, 6, 43, 196, 82, C.panelBg);
  // Five stat bars with bigger text and taller bars
  const STATS = [
    { label:'HP',    val: p.health,    max: p.maxHealth, color: hpColor },
    { label:'Food',  val: 100 - p.hunger,  max: 100, color: C.hunger },
    { label:'Water', val: 100 - p.thirst,  max: 100, color: C.thirst },
    { label:'Rest',  val: 100 - p.tiredness, max: 100, color: C.tiredness },
    { label:'Mood',  val: 100 - p.depression, max: 100, color: dColor },
  ];
  let sy = 47;
  for (const st of STATS) {
    drawText(ctx, st.label, 10, sy + 7, C.textDim, 8, 'left');
    drawStatBar(ctx, 40, sy, 110, 7, st.val, st.max, st.color, null, false);
    sy += 15;
  }
  if (p.wounded) drawText(ctx, 'WOUNDED', 162, 118, '#cc3030', 8, 'right');

  // Mini log strip — last 2 messages below the status bars
  if (gs.log && gs.log.length > 0) {
    const logEntries = gs.log.slice(0, 2);
    const LOG_COLS = { danger:'#cc4444', good:'#44aa55', warn:'#cc8830', info:'#7090c0' };
    drawPanel(ctx, 6, 128, 196, 5 + logEntries.length * 12, C.panelBg);
    let ly = 138;
    for (const entry of logEntries) {
      drawText(ctx, entry.text, 11, ly, LOG_COLS[entry.type] || C.textDim, 8);
      ly += 12;
    }
  }

  // Clock display (top-right of HUD)
  const timeStr = formatTime(gs.time);
  const timeWarnColor = gs.time >= 20 * 60 ? (gs.time >= 22 * 60 ? '#cc2828' : '#cc7020') : C.textBright;
  drawPanel(ctx, CFG.W - 84, 6, 78, 26, C.panelBg);
  drawText(ctx, timeStr, CFG.W - 45, 23, timeWarnColor, 13, 'center', true);

  // Pick-up hint
  if (!es.building) {
    const nearLoot = es.loot.find(item => !item.taken && Math.abs(es.px - item.wx) < 25);
    if (nearLoot) {
      const def = getItemDef(nearLoot.id);
      drawPanel(ctx, CFG.W / 2 - 84, CFG.H - 52, 168, 18, C.panelBg, C.border);
      drawText(ctx, `[E] ${def?.name || nearLoot.id}`, CFG.W / 2, CFG.H - 39, C.textDim, 9, 'center');
    }
    if (es.showReturnPrompt) {
      drawPanel(ctx, CFG.W / 2 - 94, CFG.H - 52, 188, 18, C.panelBg, C.border);
      drawText(ctx, '[E] Return to shelter', CFG.W / 2, CFG.H - 39, C.textDim, 9, 'center');
    }
  }

  // Carry weight
  const wt    = calcWeight(gs.parent.inventory).toFixed(1);
  const maxWt = parentMaxCarry().toFixed(1);
  const wtCol = parseFloat(wt) > parseFloat(maxWt) * 0.9 ? C.textWarn : C.textDim;
  drawText(ctx, `Carry: ${wt}/${maxWt}kg`, 12, CFG.H - 36, wtCol, 9);

  // Night run warning
  const nf = nightFactor(gs.time);
  if (nf > 0.3) {
    const nightCol = nf > 0.7 ? '#cc2828' : '#cc7020';
    const nightLabel = nf > 0.7 ? 'NIGHT RUN' : 'DUSK';
    drawText(ctx, nightLabel, CFG.W / 2, 50, nightCol, 9, 'center', true);
  }

  // Wounded indicator
  if (gs.parent.wounded) {
    drawText(ctx, 'WOUNDED', CFG.W / 2, 62, '#cc2828', 8, 'center', true);
  }

  // Return Home button — only visible at the area edges, not inside a building
  if (es.showReturnPrompt && !es.building) {
    const retBtnY = CFG.H - 34;
    drawButton(ctx, 6, retBtnY, 112, 26, 'Return Home', hitTest(mx, my, 6, retBtnY, 112, 26));
  }

  // ── Mobile D-pad (always visible; only meaningful on touch devices) ──────────
  const MB = _MOBILE_BTNS;
  const leftHov  = hitTest(mx, my, MB.left.x,   MB.left.y,   MB.left.w,   MB.left.h);
  const rightHov = hitTest(mx, my, MB.right.x,  MB.right.y,  MB.right.w,  MB.right.h);
  const actHov   = hitTest(mx, my, MB.action.x, MB.action.y, MB.action.w, MB.action.h);
  const isLeft   = GS.keys['a'] || GS.keys['arrowleft'];
  const isRight  = GS.keys['d'] || GS.keys['arrowright'];
  drawButton(ctx, MB.left.x,   MB.left.y,   MB.left.w,   MB.left.h,   '◀', leftHov,  isLeft);
  drawButton(ctx, MB.right.x,  MB.right.y,  MB.right.w,  MB.right.h,  '▶', rightHov, isRight);
  drawButton(ctx, MB.action.x, MB.action.y, MB.action.w, MB.action.h, '[E]', actHov);

  // INV button (top-right, below clock panel)
  const invBtnX = CFG.W - 60, invBtnY = 34;
  const invHov = hitTest(mx, my, invBtnX, invBtnY, 50, 22);
  drawButton(ctx, invBtnX, invBtnY, 50, 22, 'INV', invHov, es.invOpen);
  gs._exploreInvBtn = { x: invBtnX, y: invBtnY, w: 50, h: 22 };
}

// ── Drawing helpers ───────────────────────────────────────────────────────────

function drawExploreTent(ctx, cx, groundY, w, h, label) {
  // A-frame tent shape — triangle roof with small floor
  const hw = w / 2;
  ctx.save();
  ctx.fillStyle = '#2a3020';
  ctx.beginPath();
  ctx.moveTo(cx, groundY - h);
  ctx.lineTo(cx - hw, groundY);
  ctx.lineTo(cx + hw, groundY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#3a4a28';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Door opening
  ctx.fillStyle = '#111810';
  ctx.beginPath();
  ctx.moveTo(cx, groundY - h * 0.55);
  ctx.lineTo(cx - hw * 0.22, groundY);
  ctx.lineTo(cx + hw * 0.22, groundY);
  ctx.closePath();
  ctx.fill();
  // Rope guys
  ctx.strokeStyle = '#4a4030';
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.6;
  ctx.beginPath(); ctx.moveTo(cx, groundY - h); ctx.lineTo(cx - hw - 10, groundY - 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, groundY - h); ctx.lineTo(cx + hw + 10, groundY - 2); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
  if (label) drawText(ctx, label, cx, groundY - h - 6, C.textDim, 6, 'center');
}

function drawExploreTree(ctx, x, groundY) {
  const v = _envVariant(x, 3);
  const key = ['tree_1','tree_2','tree_3'][v];
  if (drawEnvSprite(ctx, key, x, groundY, 52, 90)) return;
  // Fallback procedural
  fillRect(ctx, x - 3, groundY - 30, 6, 30, '#3a2810');
  ctx.fillStyle = '#18380e';
  ctx.beginPath(); ctx.moveTo(x, groundY - 88); ctx.lineTo(x - 18, groundY - 48); ctx.lineTo(x + 18, groundY - 48); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#1e4810';
  ctx.beginPath(); ctx.moveTo(x, groundY - 70); ctx.lineTo(x - 22, groundY - 36); ctx.lineTo(x + 22, groundY - 36); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#264a14';
  ctx.beginPath(); ctx.moveTo(x, groundY - 56); ctx.lineTo(x - 14, groundY - 28); ctx.lineTo(x + 14, groundY - 28); ctx.closePath(); ctx.fill();
}

function drawExploreBush(ctx, x, groundY) {
  if (drawEnvSprite(ctx, 'bush', x, groundY, 46, 30)) return;
  ctx.save();
  ctx.fillStyle = '#1a3a0e';
  ctx.beginPath();
  ctx.arc(x,      groundY - 10, 12, Math.PI, 0);
  ctx.arc(x - 10, groundY - 8,   9, Math.PI, 0);
  ctx.arc(x + 10, groundY - 8,   9, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#234a12';
  ctx.beginPath();
  ctx.arc(x, groundY - 13, 8, Math.PI, 0);
  ctx.fill();
  ctx.restore();
}

function drawExploreGrass(ctx, x, groundY) {
  const key = _envVariant(x, 2) === 0 ? 'grass_1' : 'grass_2';
  if (drawEnvSprite(ctx, key, x, groundY, 50, 18)) return;
  ctx.save();
  ctx.strokeStyle = '#1e3a10';
  ctx.lineWidth = 1;
  for (let i = -3; i <= 3; i++) {
    const bx = x + i * 5;
    ctx.beginPath();
    ctx.moveTo(bx, groundY);
    ctx.lineTo(bx + (i % 2 === 0 ? -2 : 2), groundY - 8 - Math.abs(i) * 1.5);
    ctx.stroke();
  }
  ctx.restore();
}

function drawExploreBones(ctx, x, groundY) {
  const key = _envVariant(x, 2) === 0 ? 'bones_1' : 'bones_2';
  if (drawEnvSprite(ctx, key, x, groundY, 34, 16)) return;
  ctx.save();
  ctx.globalAlpha = 0.75;
  fillRect(ctx, x - 4, groundY - 10, 8, 7, '#a89878');
  fillRect(ctx, x - 2, groundY - 3,  4, 4, '#a89878');
  fillRect(ctx, x - 3, groundY - 9, 2, 2, '#1a1a1a');
  fillRect(ctx, x + 1, groundY - 9, 2, 2, '#1a1a1a');
  for (let i = 0; i < 3; i++) fillRect(ctx, x + 6 + i * 5, groundY - 6 + i, 12, 2, '#9a8868');
  fillRect(ctx, x + 6, groundY - 2, 18, 2, '#9a8868');
  ctx.restore();
}

function drawExploreTallTree(ctx, x, groundY) {
  if (drawEnvSprite(ctx, 'large_tree', x, groundY, 58, 130)) return;
  fillRect(ctx, x - 3, groundY - 50, 6, 50, '#221508');
  ctx.fillStyle = '#0a1e06';
  ctx.beginPath(); ctx.moveTo(x, groundY-128); ctx.lineTo(x-10, groundY-96); ctx.lineTo(x+10, groundY-96); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#0e2608';
  ctx.beginPath(); ctx.moveTo(x, groundY-106); ctx.lineTo(x-14, groundY-70); ctx.lineTo(x+14, groundY-70); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#122e0a';
  ctx.beginPath(); ctx.moveTo(x, groundY-86); ctx.lineTo(x-18, groundY-46); ctx.lineTo(x+18, groundY-46); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#16320e';
  ctx.beginPath(); ctx.moveTo(x, groundY-64); ctx.lineTo(x-22, groundY-28); ctx.lineTo(x+22, groundY-28); ctx.closePath(); ctx.fill();
}

function drawExploreDeadTree(ctx, x, groundY) {
  if (drawEnvSprite(ctx, 'dead_tree', x, groundY, 54, 115)) return;
  fillRect(ctx, x - 3, groundY - 55, 6, 55, '#1e1208');
  ctx.save();
  ctx.strokeStyle = '#221408'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x - 1, groundY - 40); ctx.lineTo(x - 24, groundY - 68); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 1, groundY - 36); ctx.lineTo(x + 20, groundY - 60); ctx.stroke();
  ctx.restore();
}

function drawExploreWideBush(ctx, x, groundY) {
  if (drawEnvSprite(ctx, 'bush_berry', x, groundY, 60, 32)) return;
  ctx.save();
  ctx.fillStyle = '#0e2008';
  ctx.beginPath();
  ctx.arc(x,      groundY - 12, 18, Math.PI, 0);
  ctx.arc(x - 16, groundY - 8,  12, Math.PI, 0);
  ctx.arc(x + 16, groundY - 8,  12, Math.PI, 0);
  ctx.fill();
  ctx.restore();
}

function drawExploreCarWreck(ctx, x, groundY) {
  ctx.save();
  ctx.globalAlpha = 0.88;
  const carW = 52, carH = 18;
  const bx = x - carW / 2;
  // Body
  fillRect(ctx, bx,     groundY - carH,      carW,     carH,     '#2a1808');
  strokeRect(ctx, bx,   groundY - carH,      carW,     carH,     '#4a2a14');
  // Roof
  fillRect(ctx, bx + 9, groundY - carH - 14, carW - 18, 14,     '#1e1008');
  strokeRect(ctx, bx + 9, groundY - carH - 14, carW - 18, 14,   '#3a1e10');
  // Broken windshields (dark with crack lines)
  fillRect(ctx, bx + 11, groundY - carH - 12, 12, 10, '#080c10');
  fillRect(ctx, bx + 28, groundY - carH - 12, 12, 10, '#080c10');
  strokeRect(ctx, bx + 11, groundY - carH - 12, 12, 10, '#141c24', 0.7);
  strokeRect(ctx, bx + 28, groundY - carH - 12, 12, 10, '#141c24', 0.7);
  // Crack lines on windows
  ctx.strokeStyle = '#303848'; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(bx+14, groundY-carH-12); ctx.lineTo(bx+18, groundY-carH-4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bx+30, groundY-carH-12); ctx.lineTo(bx+35, groundY-carH-3); ctx.stroke();
  // Wheels (flat)
  fillRect(ctx, bx + 4,        groundY - 7, 9, 7, '#141414');
  fillRect(ctx, bx + carW - 13, groundY - 7, 9, 7, '#141414');
  // Rust streaks
  fillRect(ctx, bx + 2,  groundY - carH + 5, 3, 8, '#5a2808', 0.55);
  fillRect(ctx, bx + carW - 5, groundY - carH + 4, 3, 10, '#5a2808', 0.55);
  ctx.restore();
}

function drawExploreDebrisPile(ctx, x, groundY) {
  if (drawEnvSprite(ctx, 'trash', x, groundY, 44, 20)) return;
  ctx.save();
  ctx.globalAlpha = 0.75;
  const pieces = [
    { ox: -10, h: 7, w: 14, col: '#201c14' },
    { ox:  2,  h: 5, w: 10, col: '#181410' },
    { ox:  8,  h: 8, w: 12, col: '#1c1810' },
    { ox: -4,  h: 4, w:  8, col: '#242018' },
  ];
  for (const p of pieces) {
    fillRect(ctx, x + p.ox - p.w/2, groundY - p.h, p.w, p.h, p.col);
    strokeRect(ctx, x + p.ox - p.w/2, groundY - p.h, p.w, p.h, '#302c20');
  }
  ctx.restore();
}

function drawExploreCabin(ctx, bx, by, bw, bh, label) {
  // Log cabin exterior — darker, more rustic look with wood texture hints
  // Foundation / base
  fillRect(ctx, bx - 4, by + bh - 6, bw + 8, 10, '#1e1208');
  // Walls — log cabin warm brown
  fillRect(ctx, bx, by + 10, bw, bh - 10, '#2a1808');
  fillRect(ctx, bx, by + 10, bw, bh - 10, '#261406', 0.5);
  // Horizontal log lines
  for (let ly = by + 14; ly < by + bh; ly += 8) {
    fillRect(ctx, bx, ly, bw, 1, '#1a1006', 0.6);
    fillRect(ctx, bx, ly + 1, bw, 1, '#3a2010', 0.3);
  }
  // Gabled roof
  ctx.save();
  ctx.fillStyle = '#181008';
  ctx.beginPath();
  ctx.moveTo(bx - 8, by + 10);
  ctx.lineTo(bx + bw / 2, by - 18);
  ctx.lineTo(bx + bw + 8, by + 10);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#2a1a0c'; ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
  // Roof shingles
  for (let rl = 0; rl < 5; rl++) {
    const rfrac = rl / 5;
    const rx = bx - 8 + rfrac * (bw / 2 + 8);
    const ry = by + 10 - rfrac * 28;
    const rw = (bw + 16) * (1 - rfrac);
    fillRect(ctx, rx, ry, rw, 1, '#3a2810', 0.4);
  }
  // Chimney
  fillRect(ctx, bx + bw * 0.7, by - 26, 14, 22, '#2a1a10');
  strokeRect(ctx, bx + bw * 0.7, by - 26, 14, 22, '#3a2416');
  // Windows with warm glow
  const ww = 18, wh = 14;
  fillRect(ctx, bx + 14, by + 18, ww, wh, '#0a0c06');
  fillRect(ctx, bx + 14, by + 18, ww, wh, '#302810', 0.3); // faint warm light
  strokeRect(ctx, bx + 14, by + 18, ww, wh, '#3a2418');
  if (bw > 80) {
    fillRect(ctx, bx + bw - 32, by + 18, ww, wh, '#0a0c06');
    strokeRect(ctx, bx + bw - 32, by + 18, ww, wh, '#3a2418');
  }
  // Door
  const doorX = bx + Math.floor(bw / 2) - 8;
  fillRect(ctx, doorX, by + bh - 26, 16, 26, '#0a0806');
  strokeRect(ctx, doorX, by + bh - 26, 16, 26, '#2a1810');
  fillRect(ctx, doorX + 11, by + bh - 16, 3, 3, '#4a3010', 0.7); // door handle
  if (label) drawText(ctx, label, bx + bw / 2, by - 22, '#a08060', 7, 'center');
}

function drawExploreContainer(ctx, wx, groundY, type, highlighted) {
  // Sprite mapping per container type
  const spriteKey = (type === 'locker' || type === 'cabinet') ? 'locker'
                  : (type === 'chest') ? 'chest'
                  : (type === 'crate') ? 'crate'
                  : 'box';
  const sprW = (type === 'locker' || type === 'cabinet') ? 20 : (type === 'chest') ? 30 : 26;
  const sprH = (type === 'locker' || type === 'cabinet') ? 40 : (type === 'chest') ? 22 : 24;
  if (highlighted) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    fillRect(ctx, wx - sprW / 2 - 2, groundY - sprH - 2, sprW + 4, sprH + 2, '#a08840');
    ctx.restore();
  }
  if (drawEnvSprite(ctx, spriteKey, wx, groundY, sprW, sprH)) {
    drawText(ctx, type, wx, groundY - sprH - 4, C.textDim, 6, 'center');
    return;
  }
  // Fallback procedural
  const h  = type === 'locker' || type === 'cabinet' ? 32 : type === 'chest' ? 16 : 20;
  const w  = type === 'locker' || type === 'cabinet' ? 14 : type === 'chest' ? 24 : 18;
  const bg = highlighted ? '#28241a' : '#181410';
  const br = highlighted ? '#8a7840' : '#403c28';
  fillRect(ctx, wx - w / 2, groundY - h, w, h, bg);
  strokeRect(ctx, wx - w / 2, groundY - h, w, h, br);
  const icon = { locker:'▪', cabinet:'▪', chest:'▬', crate:'▦', shelf:'≡', barrel:'○', bag:'◇' }[type] || '▪';
  drawText(ctx, icon, wx, groundY - h / 2 - 1, '#6a6040', 6, 'center');
  drawText(ctx, type, wx, groundY - h - 4, C.textDim, 5, 'center');
}

function drawExploreContainerEmpty(ctx, wx, groundY) {
  fillRect(ctx, wx - 9, groundY - 14, 18, 14, '#0e0e0e');
  strokeRect(ctx, wx - 9, groundY - 14, 18, 14, '#242424');
  drawText(ctx, 'empty', wx, groundY - 18, '#383838', 5, 'center');
}

function drawSearchBar(ctx, wx, y, progress) {
  const w = 44;
  fillRect(ctx, wx - w / 2, y, w, 5, '#141414');
  fillRect(ctx, wx - w / 2, y, w * clamp(progress, 0, 1), 5, '#7aaa30');
  strokeRect(ctx, wx - w / 2, y, w, 5, '#303020');
  drawText(ctx, 'searching...', wx, y - 2, C.textDim, 6, 'center');
}

function drawBuildingInteriorDecor(ctx, theme, floorW, groundY) {
  const W = floorW;
  const G = groundY;
  ctx.save();
  ctx.globalAlpha = 0.55;
  switch (theme) {
    case 'hospital': {
      // Hospital beds along walls
      for (let bx = 120; bx < W - 100; bx += 220) {
        fillRect(ctx, bx, G - 24, 60, 20, '#1c1c28');
        fillRect(ctx, bx, G - 30, 60, 8,  '#151520'); // pillow
        strokeRect(ctx, bx, G - 30, 60, 26, '#2a2a3a');
        drawText(ctx, '———', bx + 30, G - 17, '#2a2a44', 6, 'center');
        // Medical drip stand
        fillRect(ctx, bx + 65, G - 45, 2, 45, '#2a2a3a');
        fillRect(ctx, bx + 62, G - 46, 8, 3,  '#3a3a4a');
      }
      // Overturned wheelchair
      fillRect(ctx, W * 0.6, G - 14, 22, 12, '#1a1a28');
      strokeRect(ctx, W * 0.6, G - 14, 22, 12, '#2a2a3a');
      break;
    }
    case 'office': {
      // Desks with monitors
      for (let dx = 100; dx < W - 80; dx += 180) {
        fillRect(ctx, dx, G - 22, 55, 18, '#181820');
        strokeRect(ctx, dx, G - 22, 55, 18, '#242430');
        // Monitor
        fillRect(ctx, dx + 10, G - 44, 28, 22, '#0e0e18');
        strokeRect(ctx, dx + 10, G - 44, 28, 22, '#1c1c2c');
        fillRect(ctx, dx + 22, G - 22, 4, 4, '#181820'); // monitor stand
        // Chair
        fillRect(ctx, dx + 15, G - 12, 18, 14, '#141420');
        strokeRect(ctx, dx + 15, G - 12, 18, 14, '#1e1e2e');
      }
      // Filing cabinet
      fillRect(ctx, W * 0.75, G - 38, 24, 38, '#161622');
      strokeRect(ctx, W * 0.75, G - 38, 24, 38, '#222230');
      for (let i = 0; i < 3; i++) fillRect(ctx, W * 0.75 + 2, G - 36 + i * 13, 20, 10, '#0e0e18');
      break;
    }
    case 'factory': {
      // Heavy machinery and conveyor belts
      for (let mx2 = 80; mx2 < W - 80; mx2 += 230) {
        fillRect(ctx, mx2, G - 50, 60, 50, '#141418');
        strokeRect(ctx, mx2, G - 50, 60, 50, '#202028');
        fillRect(ctx, mx2 + 10, G - 44, 40, 20, '#0e0e14');
        fillRect(ctx, mx2 + 20, G - 48, 18, 6,  '#2a2a38'); // exhaust
        fillRect(ctx, mx2 + 22, G - 54, 4, 8,   '#2a2a38');
      }
      // Conveyor belt
      fillRect(ctx, 150, G - 12, W - 300, 10, '#1a1820');
      strokeRect(ctx, 150, G - 12, W - 300, 10, '#28283a');
      for (let sx2 = 160; sx2 < W - 300; sx2 += 30)
        fillRect(ctx, sx2, G - 12, 2, 10, '#222230');
      break;
    }
    case 'mall': {
      // Shop shelves and mannequins
      for (let sx2 = 80; sx2 < W - 80; sx2 += 200) {
        fillRect(ctx, sx2, G - 50, 8, 50, '#181818');   // shelf post
        for (let sh = 1; sh <= 3; sh++) fillRect(ctx, sx2, G - sh * 16, 60, 4, '#1c1c24');
        fillRect(ctx, sx2 + 65, G - 40, 12, 40, '#161620'); // mannequin body
        fillRect(ctx, sx2 + 67, G - 52, 8, 12,  '#161620'); // mannequin head
      }
      break;
    }
    case 'house': case 'cabin': {
      // Furniture: table, chairs, broken shelves
      fillRect(ctx, W * 0.35, G - 28, 60, 20, '#1a1410');
      strokeRect(ctx, W * 0.35, G - 28, 60, 20, '#242018');
      fillRect(ctx, W * 0.35 + 5,  G - 14, 12, 14, '#141210');
      fillRect(ctx, W * 0.35 + 43, G - 14, 12, 14, '#141210');
      // Couch / sofa
      fillRect(ctx, W * 0.6, G - 26, 52, 22, '#1c1818');
      fillRect(ctx, W * 0.6, G - 34, 52, 10, '#141414'); // backrest
      strokeRect(ctx, W * 0.6, G - 34, 52, 30, '#242020');
      break;
    }
    case 'pharmacy': {
      // Medicine shelves
      for (let sx2 = 80; sx2 < W - 60; sx2 += 100) {
        fillRect(ctx, sx2, G - 52, 50, 50, '#121216');
        strokeRect(ctx, sx2, G - 52, 50, 50, '#1c1c24');
        for (let sh = 0; sh < 3; sh++) {
          fillRect(ctx, sx2 + 2, G - 48 + sh * 16, 46, 12, '#0e0e18');
          // Pill bottles (some knocked over)
          for (let b = 0; b < 3; b++)
            fillRect(ctx, sx2 + 5 + b * 14, G - 48 + sh * 16 + 2, 6, 8, '#1a2030');
        }
      }
      break;
    }
    case 'church': {
      // Crucifixion cross near entry — Singularity cult scene
      const cx2 = Math.round(W * 0.25);
      // Vertical beam
      fillRect(ctx, cx2 - 3, G - 90, 6, 90, '#1e1610');
      strokeRect(ctx, cx2 - 3, G - 90, 6, 90, '#2e261a');
      // Horizontal beam
      fillRect(ctx, cx2 - 28, G - 74, 56, 5, '#1e1610');
      strokeRect(ctx, cx2 - 28, G - 74, 56, 5, '#2e261a');
      // Crucified figure (stick figure, dark)
      ctx.globalAlpha = 0.70;
      // Body
      fillRect(ctx, cx2 - 2, G - 68, 4, 22, '#2a1c10');
      // Head
      ctx.fillStyle = '#3a2818';
      ctx.beginPath(); ctx.arc(cx2, G - 72, 5, 0, Math.PI * 2); ctx.fill();
      // Arms along crossbeam
      fillRect(ctx, cx2 - 26, G - 72, 22, 3, '#2a1c10');
      fillRect(ctx, cx2 + 4,  G - 72, 22, 3, '#2a1c10');
      // Legs
      fillRect(ctx, cx2 - 4, G - 46, 3, 16, '#2a1c10');
      fillRect(ctx, cx2 + 1, G - 46, 3, 16, '#2a1c10');
      ctx.globalAlpha = 0.55;
      // Candles at base of cross
      for (let ci = -1; ci <= 1; ci++) {
        const cx3 = cx2 + ci * 14;
        fillRect(ctx, cx3 - 2, G - 14, 4, 14, '#c8a840');
        fillRect(ctx, cx3 - 1, G - 14, 2, 2,  '#ffe880'); // flame
        ctx.fillStyle = '#ff8820';
        ctx.beginPath(); ctx.arc(cx3, G - 15, 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#c8a840';
      }
      // Note on floor near cross
      fillRect(ctx, cx2 + 22, G - 8, 14, 10, '#c8b870');
      strokeRect(ctx, cx2 + 22, G - 8, 14, 10, '#a09050');
      drawText(ctx, '✉', cx2 + 29, G - 2, '#a09050', 6, 'center');
      // Pews (benches) further back
      ctx.globalAlpha = 0.55;
      for (let px2 = 80; px2 < W - 80; px2 += 180) {
        if (Math.abs(px2 - cx2) < 100) continue;
        fillRect(ctx, px2, G - 18, 70, 12, '#1a1208');
        strokeRect(ctx, px2, G - 18, 70, 12, '#2a1e10');
        fillRect(ctx, px2, G - 22, 70, 5,  '#141008'); // backrest
      }
      break;
    }
    default: {
      // Generic: some rubble and debris
      for (let rx = 100; rx < W - 100; rx += 180) {
        fillRect(ctx, rx, G - 10, 30, 10, '#141418');
        fillRect(ctx, rx + 5, G - 16, 20, 8,  '#101014');
      }
      break;
    }
  }
  ctx.restore();
}

function drawBuildingStairs(ctx, sx, groundY, dir) {
  const col = '#30283c';
  const colLight = '#48387a';
  for (let i = 0; i < 6; i++) {
    const ox    = dir === 'up' ? i * 9 : (5 - i) * 9;
    const stepY = groundY - (i + 1) * 9;
    const sw    = 42 - i * 3;
    fillRect(ctx, sx + ox, stepY, sw, 9, col);
    fillRect(ctx, sx + ox, stepY, sw, 2, colLight); // step edge highlight
  }
  drawText(ctx, dir === 'up' ? '▲ STAIRS UP' : '▼ STAIRS DOWN', sx + 22, groundY - 68, '#8a7aaa', 7, 'center');
}

// ── In-explore inventory overlay ──────────────────────────────────────────────

function drawExploreInventory(ctx, gs, es) {
  const px = 30, py = 40, pw = CFG.W - 60, ph = CFG.H - 80;
  const mx = gs.mouse.x, my = gs.mouse.y;

  fillRect(ctx, 0, 0, CFG.W, CFG.H, '#000000', 0.55);
  drawModal(ctx, px, py, pw, ph, 'INVENTORY & EQUIPMENT');

  // Equipped strip
  const eq = gs.parent.equipped;
  const weapDef = eq.weapon ? getItemDef(eq.weapon) : null;
  const bpDef   = gs.parent.backpackId ? getItemDef(gs.parent.backpackId) : null;
  let ey = py + 22;
  drawText(ctx, `Weapon: ${weapDef ? weapDef.name : 'none'}`, px + 8, ey + 8, weapDef ? '#88cc88' : C.textDim, 8);
  drawText(ctx, `Backpack: ${bpDef ? bpDef.name : 'none'}`, px + pw/2, ey + 8, bpDef ? '#88cc88' : C.textDim, 8);
  ey += 14;
  drawDivider(ctx, px + 4, ey, pw - 8, C.border2);
  ey += 4;

  // Action panel height: shown when item selected
  const selSlot = es.invSelected !== null ? gs.parent.inventory[es.invSelected] : null;
  const selDef  = selSlot ? getItemDef(selSlot.id) : null;
  const actionH = selSlot ? 36 : 0;

  const listH = ph - (ey - py) - 30 - actionH;
  const rows = drawInventoryList(ctx, gs.parent.inventory, px + 4, ey, pw - 8, listH,
    `CARRYING  ${calcWeight(gs.parent.inventory).toFixed(1)}/${parentMaxCarry().toFixed(1)}kg`,
    es.invScroll || 0, mx, my, es.invSelected);
  gs._exploreInvRows = rows;

  // Action panel
  gs._exploreInvActionBtns = [];
  if (selSlot && selDef) {
    const ay = ey + listH + 4;
    fillRect(ctx, px + 4, ay, pw - 8, actionH - 2, '#0e1525');
    drawText(ctx, `Selected: ${selDef.name}${selSlot.qty > 1 ? ` x${selSlot.qty}` : ''}`, px + 10, ay + 10, '#c8c8d8', 8);
    let bx = px + 10;
    const by = ay + 16;
    const bh = 14;
    const isEquippable = def => def.type === 'weapon' || def.type === 'backpack' || def.type === 'armor';
    const isConsumable = def => def.type === 'food' || def.type === 'drink' || def.type === 'medicine' || def.type === 'water';
    if (selDef.type === 'note') {
      const bw = 36;
      const hov = hitTest(mx, my, bx, by, bw, bh);
      drawButton(ctx, bx, by, bw, bh, 'Read', hov);
      gs._exploreInvActionBtns.push({ action: 'read', x: bx, y: by, w: bw, h: bh });
      bx += bw + 5;
    }
    if (selDef.type === 'blueprint') {
      const bw = 42;
      const alreadyKnown = selDef.blueprintFor && (gs.unlockedRecipes || []).includes(selDef.blueprintFor);
      const hov = !alreadyKnown && hitTest(mx, my, bx, by, bw, bh);
      drawButton(ctx, bx, by, bw, bh, alreadyKnown ? 'Known' : 'Learn', hov, false, alreadyKnown);
      gs._exploreInvActionBtns.push({ action: 'learn_bp', x: bx, y: by, w: bw, h: bh });
      bx += bw + 5;
    }
    if (isConsumable(selDef)) {
      const bw = 36;
      const hov = hitTest(mx, my, bx, by, bw, bh);
      drawButton(ctx, bx, by, bw, bh, 'Use', hov);
      gs._exploreInvActionBtns.push({ action: 'use', x: bx, y: by, w: bw, h: bh });
      bx += bw + 5;
    }
    if (isEquippable(selDef)) {
      const bw = 44;
      const hov = hitTest(mx, my, bx, by, bw, bh);
      drawButton(ctx, bx, by, bw, bh, 'Equip', hov);
      gs._exploreInvActionBtns.push({ action: 'equip', x: bx, y: by, w: bw, h: bh });
      bx += bw + 5;
    }
    { const bw = 38;
      const hov = hitTest(mx, my, bx, by, bw, bh);
      drawButton(ctx, bx, by, bw, bh, 'Drop 1', hov);
      gs._exploreInvActionBtns.push({ action: 'drop1', x: bx, y: by, w: bw, h: bh });
      bx += bw + 5; }
    { const bw = 48;
      const hov = hitTest(mx, my, bx, by, bw, bh);
      drawButton(ctx, bx, by, bw, bh, 'Drop All', hov);
      gs._exploreInvActionBtns.push({ action: 'dropAll', x: bx, y: by, w: bw, h: bh });
      bx += bw + 5; }
  } else {
    drawText(ctx, 'Click item to select it.', px + pw/2, py + ph - 18, C.textDim, 7, 'center');
  }

  // Close button
  const closeX = px + pw - 54, closeY = py + ph - 20;
  drawButton(ctx, closeX, closeY, 50, 16, 'Close', hitTest(mx, my, closeX, closeY, 50, 16));
  gs._exploreInvClose = { x: closeX, y: closeY, w: 50, h: 16 };
}

// ── Grain filter ─────────────────────────────────────────────────────────────

function drawGrainFilter(ctx) {
  ctx.save();
  ctx.globalAlpha = 0.045;
  for (let i = 0; i < 700; i++) {
    const gx = (Math.random() * CFG.W) | 0;
    const gy = (Math.random() * CFG.H) | 0;
    ctx.fillStyle = Math.random() > 0.5 ? '#ffffff' : '#000000';
    ctx.fillRect(gx, gy, 1, 1);
  }
  ctx.restore();
}

// ── Zone title card (fade in 6s → linger 6s → fade out 6s) ──────────────────

function drawZoneTitleCard(ctx, es) {
  // Zone title cards removed per user request
}

// ── Weather overlay in explore ────────────────────────────────────────────────

function drawExploreWeather(ctx, gs) {
  if (!gs.weather) return;
  const w  = gs.weather.type;
  const fc = frameCount;

  if (w === 'rain') {
    ctx.save();
    ctx.strokeStyle = '#3a5a7a';
    ctx.lineWidth   = 1;
    ctx.globalAlpha = 0.38;
    for (let i = 0; i < 40; i++) {
      const rx = ((i * 137 + fc * 2.5) % CFG.W);
      const ry = ((i * 47  + fc * 5)   % GROUND_Y);
      ctx.beginPath();
      ctx.moveTo(Math.round(rx), Math.round(ry));
      ctx.lineTo(Math.round(rx + 2), Math.round(ry + 8));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  if (w === 'cloudy' || w === 'rain') {
    ctx.save();
    ctx.globalAlpha = w === 'rain' ? 0.22 : 0.10;
    ctx.fillStyle = '#101018';
    ctx.fillRect(0, 0, CFG.W, GROUND_Y);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Small weather icon top-right (not scrolled) — placed left of clock panel
  const icon  = w === 'rain' ? '🌧' : w === 'cloudy' ? '☁' : '☀';
  drawText(ctx, icon, CFG.W - 80, 16, C.textDim, 9, 'right');
}

// ── Map pickup ────────────────────────────────────────────────────────────────

function handleMapPickup(mapId, gs) {
  if (!gs.foundMaps) gs.foundMaps = { area_map_1: false, area_map_2: false };
  if (gs.foundMaps[mapId]) return;
  gs.foundMaps[mapId] = true;
  if (mapId === 'area_map_1') {
    if (!gs.unlockedLocations) gs.unlockedLocations = ['forest', 'church'];
    ['suburb', 'pharmacy'].forEach(id => {
      if (!gs.unlockedLocations.includes(id)) gs.unlockedLocations.push(id);
    });
    addLog('Found a map — Suburban Ruins and City Pharmacy are now accessible!', 'good');
    notify('NEW AREAS UNLOCKED: Suburbs + Pharmacy!', 'good');
  } else if (mapId === 'area_map_2') {
    if (!gs.unlockedLocations) gs.unlockedLocations = ['forest', 'church'];
    ['mall', 'hospital', 'factory', 'police', 'bunker', 'rooftop', 'village'].forEach(id => {
      if (!gs.unlockedLocations.includes(id)) gs.unlockedLocations.push(id);
    });
    addLog('Found a detailed map — all remaining areas are now accessible!', 'good');
    notify('ALL AREAS UNLOCKED!', 'good');
  }
}

// ── End exploration ───────────────────────────────────────────────────────────

function endExploration(gs) {
  const es = exploreState;
  if (!es) return;

  // Save location state for persistence (random areas never persist)
  const _RANDOM_AREAS = ['forest', 'factory', 'village'];
  if (!_RANDOM_AREAS.includes(es.location.id)) {
    gs.locationStates[es.location.id] = {
      containers: es.containers.map(c => ({ searched: c.searched })),
      loot:       es.loot.map(l => ({ taken: l.taken })),
      encounters: es.encounters.map(e => ({ triggered: e.triggered, killed: e.killed })),
      buildings:  es.buildings.map(b => ({
        floors: b.floors.map(f => ({
          containers: f.containers.map(c => ({ searched: c.searched })),
        })),
      })),
    };
  }

  gs.parent.isExploring = false;
  gs.child.isAlone      = false;
  Audio.stopMusic();
  Audio.startShelterMusic();
  // Return companion
  if (gs.exploreCompanionId) {
    const comp = (gs.survivors || []).find(s => s.id === gs.exploreCompanionId);
    if (comp) comp.isExploring = false;
    gs.exploreCompanionId = null;
  }
  gs.suspicion = clamp(gs.suspicion + randInt(2, 5), 0, CFG.SUSPICION_MAX);
  addLog(`Returned from ${es.location?.name || 'exploration'}.`, 'info');

  // Stories queued on first-ever return
  if (gs._pendingStoryOpening) {
    gs._pendingStoryOpening = false;
    gs.storyQueue.push('story_opening');
  }
  if (gs._pendingStoryFirstOut) {
    gs._pendingStoryFirstOut = false;
    gs.storyQueue.push('story_first_out');
  }
  // Story: first time returning wounded (voluntary return only — late return sets this later)
  if (gs.parent.wounded && !gs.flags.storyWounded && !gs.lateReturn) {
    gs.flags.storyWounded = true;
    gs.storyQueue.push('story_wounded');
  }

  if (gs.lateReturn) {
    exploreState = null;
    gs.keys      = {};
    gs.screen    = 'shelter';
    gs.zoomAnim  = { scale: 1.0, target: 1.0 };
  } else {
    gs.screenFade = { active: true, alpha: 0, phase: 'out', titleText: null, pendingFn: () => {
      exploreState = null;
      gs.keys      = {};
      gs.screen    = 'shelter';
      gs.zoomAnim  = { scale: 1.0, target: 1.0 };
    }};
  }
}
