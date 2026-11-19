// explore.js — Side-scrolling exploration with buildings, containers, fog of war
'use strict';

const GROUND_Y    = 276;
const PLAYER_FOOT = GROUND_Y;
const BUILDING_W  = 900;   // interior width of each building floor

// World zoom — game world is rendered at this scale; HUD/buttons are drawn
// AFTER ctx.restore() so they stay at 1× and never get clipped or scrolled.
const EXPLORE_VIEW_ZOOM = 1.15;
// Visible world width at that zoom — the camera must clamp to this, not CFG.W,
// or the last ~96px of every map/floor can never scroll into view.
const EXPLORE_VIEW_W = CFG.W / EXPLORE_VIEW_ZOOM;

let exploreState = null;
let fogCanvas    = null;   // offscreen canvas for fog of war

// ── Touch controls ────────────────────────────────────────────────────────────
// Bottom corners, below the walking area. Only shown on touch devices
// (keyboard players use A/D/E); the first screen tap turns them on.
const _MOBILE_BTNS = {
  left:   { x: 6,   y: CFG.H - 50, w: 50, h: 42 },
  right:  { x: 60,  y: CFG.H - 50, w: 50, h: 42 },
  action: { x: CFG.W - 62, y: CFG.H - 50, w: 56, h: 42 },
};
let _touchUsed = false;
function touchControlsOn(gs) {
  if (!_touchUsed && !(window.matchMedia && window.matchMedia('(pointer: coarse)').matches)) return false;
  const es = exploreState;
  return !(gs.inCombat && gs.combat) && !(es && es.invOpen);
}

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
  // Lighter by day so the scenery is visible; as dark as before at night
  fc.fillStyle = `rgba(0,0,0,${(0.84 - 0.40 * df).toFixed(3)})`;
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

  // Places that remember progress are generated from a fixed seed (per run),
  // so buildings, rooms, furniture and containers are the same every visit.
  if (!gs.worldSeed) gs.worldSeed = Math.floor(Math.random() * 1e9);
  const _unseed = ['forest', 'factory', 'village'].includes(loc.id) ? null
                : seedRandom(loc.id + ':' + gs.worldSeed);

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
      // Building size comes from its facade sprite; tents use the tent sprite size
      const facade = bdef.isTent ? null : pickBuildingSprite(bdef.theme || 'urban', bdef.label || zone.name);
      const bw     = bdef.isTent ? 72 : facade.w;
      const bh     = bdef.isTent ? 46 : facade.h;
      const nFloors = bdef.numFloors || 1;
      const floors  = [];
      for (let fi = 0; fi < nFloors; fi++) {
        floors.push(genBuildingFloorArea(fi, nFloors, bdef, loc.difficulty || 1));
      }
      buildings.push({
        bx, bw, bh,
        label:    bdef.label || zone.name,
        theme:    bdef.theme || 'urban',
        numFloors: nFloors,
        floors,
        doorX:    bx + Math.floor(bw / 2) - 8,
        isTent:   !!bdef.isTent,
        sprite:   facade ? facade.key : null,
      });
    }
    // Add a small generic structure for zones with no explicit buildings but outdoor loot
    if ((zone.buildings || []).length === 0 && zone.lootTable &&
        !zone.lootTable.startsWith('nature') && !zone.lootTable.startsWith('water')) {
      const bx = zone.x + Math.floor(zone.w * 0.4);
      const facade = pickBuildingSprite('urban', zone.name);
      const bw = facade.w;
      const bh = facade.h;
      buildings.push({
        bx, bw, bh,
        label: zone.name,
        theme: 'urban',
        numFloors: 1,
        floors: [genBuildingFloorArea(0, 1, { lootQuality: 'light', theme: 'urban', enemyChance: zone.enemyChance || 15 }, loc.difficulty || 1)],
        doorX: bx + Math.floor(bw / 2) - 8,
        sprite: facade.key,
      });
    }
  }

  // Containers are inside buildings only — nothing outside
  const containers = [];

  // Sparse ground loot — only ~15% of rolled items end up visible on the ground
  const lootItems = [];
  for (const zone of loc.zones) {
    const items = rollLoot(zone.lootTable);
    const groundItems = items.filter(it => it.id !== 'raw_meat' && Math.random() < 0.15);
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
      const _ps = (loc.canHunt || zone.canHunt) ? 'wolf'
                : loc.id === 'factory' ? 'robot' : 'human_hostile';
      encounters.push({
        wx: zone.x + Math.floor(zone.w * 0.6) + randInt(-20, 20),
        triggered: false, killed: false, distance: 70,
        difficulty: loc.difficulty,
        locCanHunt: !!loc.canHunt,
        zone,
        previewSprite: _ps,
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

  if (_unseed) _unseed();

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
      const c = exploreState.containers[i];
      if (c) { c.searched = sc.searched; if (sc.loot) c.loot = sc.loot; }
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
          const fl = exploreState.buildings[bi].floors[fi];
          const restoreArea = (area, sa) => {
            if (!area || !sa) return;
            sa.containers.forEach((sc, ci) => {
              const c = area.containers[ci];
              if (!c) return;
              c.searched = sc.searched;
              if (sc.loot) c.loot = sc.loot;
            });
            (sa.cleared || []).forEach((cl, ei) => { const e = area.encounters[ei]; if (e && cl) { e.triggered = true; e.killed = true; } });
          };
          restoreArea(fl, sf);
          (sf.rooms || []).forEach((sr, ri) => restoreArea(fl.rooms && fl.rooms[ri], sr));
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

// ── Update ────────────────────────────────────────────────────────────────────

function updateExplore(gs, dt) {
  if (!exploreState) return;
  if (exploreState.building) { updateBuildingInterior(gs, dt); return; }

  const es = exploreState;
  const p  = gs.parent;

  // While in combat: keep scroll locked on combat player position, skip exploration
  if (gs.inCombat && gs.combat) {
    const targetScroll = gs.combat.playerWx - EXPLORE_VIEW_W * 0.4;
    es.scrollX = clamp(lerp(es.scrollX, targetScroll, 0.12), 0, CFG.WORLD_W - EXPLORE_VIEW_W);
    es.px = gs.combat.playerWx;
    return;
  }

  // Movement (keyboard + mobile D-pad)
  const dpadLeft  = touchControlsOn(gs) && gs.mouse.down && hitTest(gs.mouse.x, gs.mouse.y, _MOBILE_BTNS.left.x,  _MOBILE_BTNS.left.y,  _MOBILE_BTNS.left.w,  _MOBILE_BTNS.left.h);
  const dpadRight = touchControlsOn(gs) && gs.mouse.down && hitTest(gs.mouse.x, gs.mouse.y, _MOBILE_BTNS.right.x, _MOBILE_BTNS.right.y, _MOBILE_BTNS.right.w, _MOBILE_BTNS.right.h);
  const left  = gs.keys['a'] || gs.keys['arrowleft']  || dpadLeft;
  const right = gs.keys['d'] || gs.keys['arrowright'] || dpadRight;
  const speedMult = (gs.parent.wounded ? 0.55 : 1.0) * (gs.timeScale || 1);
  if (left)       { es.velX = -CFG.PLAYER_SPEED * speedMult; es.facing = -1; }
  else if (right) { es.velX =  CFG.PLAYER_SPEED * speedMult; es.facing =  1; }
  else es.velX = 0;

  // velX is tuned in px per 60fps frame; scale by real time so slow frames don't slow walking
  es.px = clamp(es.px + es.velX * dt * 60, 10, CFG.WORLD_W - 10);

  const targetScroll = es.px - EXPLORE_VIEW_W * 0.4;
  es.scrollX = clamp(lerp(es.scrollX, targetScroll, 0.15), 0, CFG.WORLD_W - EXPLORE_VIEW_W);

  es.animTimer++;
  if (Math.abs(es.velX) > 0.1 && es.animTimer % 12 === 0) es.animFrame++;
  else if (Math.abs(es.velX) < 0.1) es.animFrame = 0;
  p.animFrame = es.animFrame;
  p.facing    = es.facing;

  // Container search tick
  // Searching: moving away aborts it
  _tickSearches(gs, es.containers, Math.abs(es.velX) > 0.1, dt);

  // Enemy encounters — stealth affects detection range
  const stealth    = gs.parent.skills?.stealth || 0;
  const alertRange = Math.max(50, 150 - stealth * 12);
  const nightMult  = 1 + nightFactor(gs.time) * 0.3;
  for (const enc of es.encounters) {
    if (!enc.triggered && Math.abs(es.px - enc.wx) < alertRange * nightMult) {
      enc.triggered = true;
      // Re-use survivors from a previous fled combat (same HP); else roll fresh
      let enemies;
      if (enc._savedEnemies) {
        enemies = enc._savedEnemies;
        enc._savedEnemies = null;
      } else {
        enemies = buildEncounter(enc.difficulty, enc.zone, enc.locCanHunt, gs.day);
      }
      if (enemies.length > 0) {
        gs.mouse.down = false;
        startCombat(gs, enemies, es.px, enc.wx);
        gs.combat._encRef = enc;
        gs.inCombat = true;
        return;
      }
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

  // ── Tiredness warnings & collapse ─────────────────────────────────────────
  if (p.tiredness >= 80 && !es._tiredWarned) {
    es._tiredWarned = true;
    notify(`${p.name} is exhausted. Head home soon.`, 'warn');
    addLog(`${p.name} is running on empty — should return home.`, 'warn');
  }
  if (p.tiredness >= 100) {
    // Collapsed — goes missing for 6–16 game hours before returning
    const missingMins = randInt(360, 960);
    gs.parentMissing        = true;
    gs.parentMissingMinutes = missingMins;
    notify(`${p.name} collapsed from exhaustion!`, 'danger');
    addLog(`${p.name} collapsed in the field and went missing.`, 'danger');
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
  const es   = exploreState;
  const bi   = es.building;
  const area = curArea(es);
  const p    = gs.parent;

  // In combat: camera follows the fight, normal movement is off
  if (gs.inCombat && gs.combat) {
    const targetScroll = gs.combat.playerWx - EXPLORE_VIEW_W * 0.4;
    bi.scrollX = areaScroll(area, lerp(bi.scrollX, targetScroll, 0.12));
    bi.px = gs.combat.playerWx;
    bi.velX = 0;
    return;
  }

  const biDpadLeft  = touchControlsOn(gs) && gs.mouse.down && hitTest(gs.mouse.x, gs.mouse.y, _MOBILE_BTNS.left.x,  _MOBILE_BTNS.left.y,  _MOBILE_BTNS.left.w,  _MOBILE_BTNS.left.h);
  const biDpadRight = touchControlsOn(gs) && gs.mouse.down && hitTest(gs.mouse.x, gs.mouse.y, _MOBILE_BTNS.right.x, _MOBILE_BTNS.right.y, _MOBILE_BTNS.right.w, _MOBILE_BTNS.right.h);
  const left  = gs.keys['a'] || gs.keys['arrowleft']  || biDpadLeft;
  const right = gs.keys['d'] || gs.keys['arrowright'] || biDpadRight;
  const biSpeedMult = gs.timeScale || 1;
  if (left)       { bi.velX = -CFG.PLAYER_SPEED * biSpeedMult; bi.facing = -1; }
  else if (right) { bi.velX =  CFG.PLAYER_SPEED * biSpeedMult; bi.facing =  1; }
  else bi.velX = 0;

  bi.px = clamp(bi.px + bi.velX * dt * 60, 10, area.width - 10);

  const targetScroll = bi.px - EXPLORE_VIEW_W * 0.45;
  bi.scrollX = areaScroll(area, lerp(bi.scrollX, targetScroll, 0.15));

  bi.animTimer = (bi.animTimer || 0) + 1;
  if (Math.abs(bi.velX) > 0.1 && bi.animTimer % 12 === 0) bi.animFrame = ((bi.animFrame || 0) + 1);
  else if (Math.abs(bi.velX) < 0.1) bi.animFrame = 0;
  p.animFrame = bi.animFrame || 0;
  p.facing    = bi.facing;

  // Searching: moving away aborts it, otherwise it ticks on
  _tickSearches(gs, area.containers, Math.abs(bi.velX) > 0.1, dt);

  // Enemies inside
  if (checkIndoorEncounters(gs, area, bi.px)) return;

  // Tiredness warning / collapse (same thresholds as outdoor)
  if (p.tiredness >= 80 && !es._tiredWarned) {
    es._tiredWarned = true;
    notify(`${p.name} is exhausted. Head home soon.`, 'warn');
    addLog(`${p.name} is running on empty — should return home.`, 'warn');
  }
  if (p.tiredness >= 100) {
    const missingMins = randInt(360, 960);
    gs.parentMissing        = true;
    gs.parentMissingMinutes = missingMins;
    notify(`${p.name} collapsed from exhaustion!`, 'danger');
    addLog(`${p.name} collapsed inside a building and went missing.`, 'danger');
    endExploration(gs);
  }
}

// Search progress for a list of containers; moving cancels a search in progress
function _tickSearches(gs, containers, moving, dt) {
  for (const c of containers) {
    if (!c.searching) continue;
    if (moving) {
      c.searching = false; c.searchProgress = 0;
      notify('Search interrupted.', 'warn');
      continue;
    }
    c.searchProgress += dt;
    const dur = c._meticulousAdj ? c.searchDuration * 1.5 : c.searchDuration;
    if (c.searchProgress >= dur) {
      c.searching = false; c.searched = true;
      finishSearch(c, gs);
    }
  }
}

// Open the take-what-you-want dialog for a container's items
function openContainerLoot(gs, container) {
  const names = { box: 'Box', crate: 'Crate', chest: 'Chest', locker: 'Locker', cabinet: 'Cabinet',
                  shelf: 'Shelf', bookshelf: 'Bookshelf', bag: 'Bag', barrel: 'Barrel', tent: 'Tent', body: 'Body' };
  gs.lootSource = {
    items: container.loot,
    title: (container.label ? `${container.label} (${names[container.type] || ''})` : (names[container.type] || 'Container')).toUpperCase(),
    onTake: (item) => {
      if (item.id === 'area_map_1' || item.id === 'area_map_2') handleMapPickup(item.id, gs);
    },
  };
  gs.mouse.down = false;
  lootPickupUI.scroll = 0;
  gs.screen = 'lootPickup';
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

  // Show what was found and let the player pick; leftovers stay in the container
  container.loot = loot;
  if (loot.length === 0) { notify('Nothing useful found.', 'info'); return; }
  giveXP(gs.parent, loot.length * 2, gs); // +2 XP per item found
  openContainerLoot(gs, container);
}

// ── Key handling ──────────────────────────────────────────────────────────────

function exploreKeyPress(key, gs) {
  if (!exploreState) return;
  const es = exploreState;

  // ── Combat keyboard shortcuts ─────────────────────────────────────────────
  if (gs.inCombat && gs.combat) {
    const c = gs.combat;
    if (c.introTimer > 0 || (c.busyUntil && Date.now() < c.busyUntil) || c.turn !== 'player' || c.phase !== 'action') return;
    if (c.itemMenu) {
      const n = parseInt(key, 10);
      const items = combatUsableItems(gs);
      if (n >= 1 && n <= items.length) { c.itemMenu = false; playerUseItem(gs, items[n - 1].id); }
      else if (key === 'escape' || key === 'i') c.itemMenu = false;
      return;
    }
    if (key === 'i') { if (combatUsableItems(gs).length) c.itemMenu = true; return; }
    if (key === 'arrowleft'  || key === 'a') { playerMoveLeft(gs);  return; }
    if (key === 'arrowright' || key === 'd') { playerMoveRight(gs); return; }
    if (key === ' ' || key === 'f') {
      // Attack current target
      const alive = c.enemies.filter(e => !e.dead);
      if (alive.length) {
        const realIdx = c.enemies.indexOf(alive[c.targetIdx] || alive[0]);
        playerAttack(gs, realIdx >= 0 ? realIdx : 0);
      }
      return;
    }
    if (key === 'enter' || key === 'e') { playerEndTurn(gs); return; }
    return;
  }

  if (key === 'e') {
    if (es.building) interactBuilding(gs);
    else             interactOutdoor(gs);
    return;
  }
  if (key === 'h') { startHunt(gs); return; }
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

  // Bodies, then outdoor containers
  if (_interactBodies(gs, es.px)) return;
  if (_interactContainers(gs, es.containers, es.px)) return;

  // Search a tent (not enterable — just a search prompt)
  const nearTent = es.buildings.find(b => b.isTent && Math.abs(es.px - (b.bx + b.bw / 2)) < 30
                                         && !(b._tentSearched && !(b._tentLoot && b._tentLoot.length)));
  if (nearTent) {
    if (!nearTent._tentSearched) {
      nearTent._tentSearched = true;
      nearTent._tentLoot = (nearTent.floors[0].containers || []).flatMap(c => c.loot || []);
    }
    if (!nearTent._tentLoot.length) { notify('The tent has been picked clean — nothing left.', 'info'); return; }
    openContainerLoot(gs, { type: 'tent', loot: nearTent._tentLoot });
    return;
  }

  // Enter a building (non-tent)
  const nearB = es.buildings.find(b => !b.isTent && Math.abs(es.px - (b.doorX + 8)) < 24);
  if (nearB) {
    const bldgIdx = es.buildings.indexOf(nearB);
    es.building = {
      bldgIdx, floorIdx: 0, roomIdx: null,
      px: (nearB.floors[0].exitX || 60) + 24,
      scrollX: 0, velX: 0, facing: 1, animFrame: 0, animTimer: 0,
    };
    notify(`Entered: ${nearB.label}`, 'info');
    return;
  }

  if (es.showReturnPrompt) endExploration(gs);
}

function interactBuilding(gs) {
  const es   = exploreState;
  const bi   = es.building;
  const bld  = es.buildings[bi.bldgIdx];
  const fl   = bld.floors[bi.floorIdx];
  const area = curArea(es);

  if (area.isRoom) {
    // Back out to the hallway, in front of this room's door
    if (Math.abs(bi.px - (area.backDoorX + DOOR_W / 2)) < 26) {
      const door = fl.doors.find(d => d.roomIdx === bi.roomIdx);
      bi.roomIdx = null;
      bi.px = door ? door.x + DOOR_W / 2 : 120;
      bi.scrollX = clamp(bi.px - EXPLORE_VIEW_W * 0.45, 0, Math.max(0, fl.width - EXPLORE_VIEW_W));
      return;
    }
  } else {
    // Exit door (floor 0 only)
    if (fl.exitX !== null && Math.abs(bi.px - fl.exitX) < 30) {
      es.building = null;
      notify('Exited building.', 'info');
      return;
    }
    // Stairs up
    if (fl.stairsUpX !== null && Math.abs(bi.px - fl.stairsUpX) < 30 && bi.floorIdx + 1 < bld.numFloors) {
      bi.floorIdx++;
      bi.roomIdx = null;
      bi.px = bld.floors[bi.floorIdx].stairsDownX || 110;
      bi.scrollX = 0;
      notify(`Floor ${bi.floorIdx + 1} / ${bld.numFloors}`, 'info');
      return;
    }
    // Stairs down
    if (fl.stairsDownX !== null && Math.abs(bi.px - fl.stairsDownX) < 30 && bi.floorIdx > 0) {
      bi.floorIdx--;
      bi.roomIdx = null;
      bi.px = bld.floors[bi.floorIdx].stairsUpX || BUILDING_W - 110;
      bi.scrollX = clamp(bi.px - EXPLORE_VIEW_W * 0.45, 0, Math.max(0, BUILDING_W - EXPLORE_VIEW_W));
      notify(`Floor ${bi.floorIdx + 1} / ${bld.numFloors}`, 'info');
      return;
    }
    // Room doorways
    const door = (fl.doors || []).find(d => Math.abs(bi.px - (d.x + DOOR_W / 2)) < 20);
    if (door) {
      bi.roomIdx = door.roomIdx;
      const room = fl.rooms[door.roomIdx];
      bi.px = room.backDoorX + DOOR_W / 2 + 24;
      bi.scrollX = areaScroll(room, 0);
      return;
    }
  }

  if (_interactBodies(gs, bi.px)) return;
  _interactContainers(gs, area.containers, bi.px);
}

// Search a nearby body (drops from a fight). Returns true if it did.
function _interactBodies(gs, px) {
  const es = exploreState;
  if (!es || !es.corpses) return false;
  const here = areaKey(es);
  const body = es.corpses.find(cp => (cp.where || 'out') === here && cp.loot && cp.loot.length && Math.abs(px - cp.x) < 28);
  if (!body) return false;
  openContainerLoot(gs, { type: 'body', loot: body.loot, label: body.name });
  return true;
}

// Search / re-open / cancel the nearest container
function _interactContainers(gs, containers, px) {
  const searchingC = containers.find(c => c.searching && Math.abs(px - c.wx) < 30);
  if (searchingC) { searchingC.searching = false; searchingC.searchProgress = 0; return true; }
  // Items left behind earlier can be picked up without searching again
  const leftover = containers.find(c => c.searched && c.loot && c.loot.length && Math.abs(px - c.wx) < 30);
  if (leftover) { openContainerLoot(gs, leftover); return true; }
  const nearC = containers.find(c => !c.searched && !c.searching && Math.abs(px - c.wx) < 30);
  if (nearC) {
    nearC.searching = true; nearC.searchProgress = 0;
    if (gs.parent.trait === 'meticulous') nearC._meticulousAdj = true;
    notify('Searching... (moving cancels)', 'info');
    return true;
  }
  return false;
}

// ── Click handling ────────────────────────────────────────────────────────────

function exploreClick(mx, my, gs) {
  if (!exploreState) return;
  const es = exploreState;

  // ── In-world combat clicks ────────────────────────────────────────────────────
  if (gs.inCombat && gs.combat) {
    _handleExploreCombatClick(mx, my, gs);
    return;
  }

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
  const _tc = touchControlsOn(gs);
  if (_tc && hitTest(mx, my, _MOBILE_BTNS.left.x, _MOBILE_BTNS.left.y, _MOBILE_BTNS.left.w, _MOBILE_BTNS.left.h)) return;
  if (_tc && hitTest(mx, my, _MOBILE_BTNS.right.x, _MOBILE_BTNS.right.y, _MOBILE_BTNS.right.w, _MOBILE_BTNS.right.h)) return;
  // Action button
  if (_tc && hitTest(mx, my, _MOBILE_BTNS.action.x, _MOBILE_BTNS.action.y, _MOBILE_BTNS.action.w, _MOBILE_BTNS.action.h)) {
    exploreKeyPress('e', gs); return;
  }

  // HUNT button
  if (gs._exploreHuntBtn && hitTest(mx, my, gs._exploreHuntBtn.x, gs._exploreHuntBtn.y, gs._exploreHuntBtn.w, gs._exploreHuntBtn.h)) {
    startHunt(gs); return;
  }
  // INV button
  if (gs._exploreInvBtn && hitTest(mx, my, gs._exploreInvBtn.x, gs._exploreInvBtn.y, gs._exploreInvBtn.w, gs._exploreInvBtn.h)) {
    es.invOpen = !es.invOpen; if (!es.invOpen) es.invSelected = null; return;
  }

  // Return Home button (bottom-left) — only at area edges and outside buildings
  if (es.showReturnPrompt && !es.building) {
    const _rb = _returnBtnRect(gs);
    if (hitTest(mx, my, _rb.x, _rb.y, _rb.w, _rb.h)) {
      endExploration(gs);
      return;
    }
  }

  if (es.building) {
    // Clicking a container within reach acts like pressing E on it
    const bi  = es.building;
    const area = curArea(es);
    const wx  = mx / EXPLORE_VIEW_ZOOM + bi.scrollX;
    const wy  = my / EXPLORE_VIEW_ZOOM;
    const hit = area.containers.find(c => Math.abs(wx - c.wx) < 24 && wy > GROUND_Y - 60 && wy < GROUND_Y + 12);
    if (hit && Math.abs(bi.px - hit.wx) < 30) _interactContainers(gs, [hit], bi.px);
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
  if (gs.inCombat && gs.combat && gs.combat.introTimer > 0) _drawCombatBanner(ctx, gs.combat.introTimer);
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
  // Walking path: textured ground that scrolls with the world
  if (!fillTextureScrolled(ctx, exploreGroundTexture(loc.bgTheme), es.scrollX, 1, GROUND_Y, CFG.H - GROUND_Y,
                           0.15 + (1 - dayFactor(gs.time)) * 0.45)) {
    fillRect(ctx, 0, GROUND_Y, CFG.W, CFG.H - GROUND_Y, C.ground);
  }
  fillRect(ctx, 0, GROUND_Y, CFG.W, 3, C.dirt2);

  ctx.save();
  ctx.translate(-es.scrollX, 0);

  // Zone tint overlays
  for (const zone of loc.zones) {
    fillRect(ctx, zone.x, 0, zone.w, GROUND_Y, zone.bgColor || C.bg, 0.18);
  }

  // Only draw what's on screen (plus a margin for wide sprites)
  const _viewL = es.scrollX - 140, _viewR = es.scrollX + CFG.W / vz + 140;
  const _onScreen = (x) => x > _viewL && x < _viewR;

  // Trees for nature/forest zones (desaturation is baked into the sprites)
  for (const zone of loc.zones) {
    const isNature = zone.lootTable && zone.lootTable.startsWith('nature');
    if (isNature) {
      for (let tx = zone.x + 30; tx < zone.x + zone.w - 20; tx += 64) {
        if (_onScreen(tx)) drawExploreTree(ctx, tx, GROUND_Y);
      }
    }
  }

  // Foliage / environment dressing (pre-generated positions)
  if (es.foliage) {
    for (const f of es.foliage) {
      if (!_onScreen(f.wx)) continue;
      switch (f.type) {
        case 'bush':       drawExploreBush(ctx, f.wx, GROUND_Y);       break;
        case 'wide_bush':  drawExploreWideBush(ctx, f.wx, GROUND_Y);   break;
        case 'grass':      drawExploreGrass(ctx, f.wx, GROUND_Y);      break;
        case 'tall_tree':  drawExploreTallTree(ctx, f.wx, GROUND_Y);   break;
        case 'dead_tree':  drawExploreDeadTree(ctx, f.wx, GROUND_Y);   break;
        case 'car_wreck':  drawExploreCarWreck(ctx, f.wx, GROUND_Y);   break;
        case 'debris':     drawExploreDebrisPile(ctx, f.wx, GROUND_Y); break;
      }
    }
  }

  // Bones / skeleton piles
  if (es.bonesPiles) {
    for (const b of es.bonesPiles) {
      if (_onScreen(b.wx)) drawExploreBones(ctx, b.wx, GROUND_Y);
    }
  }

  // Buildings / tents (pre-generated data — no randInt here)
  for (const bld of es.buildings) {
    if (bld.bx + bld.bw < _viewL || bld.bx > _viewR) continue;
    if (bld.isTent) {
      drawExploreTent(ctx, bld.bx + bld.bw / 2, GROUND_Y, bld.bw, bld.bh, bld.label);
      if (Math.abs(es.px - (bld.bx + bld.bw / 2)) < 30) {
        if (bld._tentSearched && bld._tentLoot && bld._tentLoot.length) {
          drawText(ctx, '[E] Take items', bld.bx + bld.bw / 2, GROUND_Y - bld.bh - 8, C.textBright, 7, 'center');
        } else if (bld._tentSearched) {
          drawText(ctx, 'Searched', bld.bx + bld.bw / 2, GROUND_Y - bld.bh - 8, C.textDim, 6, 'center');
        } else {
          drawText(ctx, '[E] Search Tent', bld.bx + bld.bw / 2, GROUND_Y - bld.bh - 8, C.textBright, 7, 'center');
        }
      }
    } else {
      if (bld.theme === 'cabin' && !bld.sprite) {
        drawExploreCabin(ctx, bld.bx, GROUND_Y - bld.bh, bld.bw, bld.bh, bld.label);
      } else {
        drawExploreBuildingByTheme(ctx, bld.theme, bld.bx, GROUND_Y - bld.bh, bld.bw, bld.bh, bld.label, bld.sprite);
      }
      if (Math.abs(es.px - (bld.doorX + 8)) < 24) {
        drawText(ctx, '[E] Enter', bld.doorX + 8, GROUND_Y - bld.bh - 8, C.textBright, 7, 'center');
      }
    }
  }

  // Outdoor containers
  for (const c of es.containers) {
    if (c.searched && !(c.loot && c.loot.length)) continue;
    drawAreaContainer(ctx, c, Math.abs(es.px - c.wx) < 30);
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

  // Hunt spot markers
  for (const spot of es.huntSpots) {
    if (!spot.used) {
      drawText(ctx, '🐾', spot.wx, GROUND_Y - 2, '#3a6a20', 7, 'center');
    }
  }

  // Bodies, enemies, player (incl. combat reactions)
  const _outSearching = es.containers.some(c => c.searching);
  drawExploreActors(ctx, gs, es, {
    px: es.px, facing: es.facing, animFrame: es.animFrame,
    pose: Math.abs(es.velX) > 0.1 ? 'run' : (_outSearching ? 'back' : 'front'),
    encounters: es.encounters, patrolAmp: 35, where: 'out',
  });

  // Companion following player (uses combat world-x during combat)
  if (gs.exploreCompanionId) {
    const compIdx = (gs.survivors || []).findIndex(s => s.id === gs.exploreCompanionId);
    if (compIdx >= 0) {
      const compAnchorX = (gs.inCombat && gs.combat) ? gs.combat.playerWx : es.px;
      const compX = compAnchorX - es.facing * 22;
      drawSurvivor(ctx, compX, PLAYER_FOOT, 2, -es.facing, es.animFrame, compIdx, Math.abs(es.velX) > 0.1 ? 'side' : 'front');
    }
  }

  // Blood, sparks, damage numbers, tracers
  _updateDrawFx(ctx, gs, es);

  ctx.restore(); // end world translate
  ctx.restore(); // end view zoom

  // Fog — centred on player's scaled screen position (drawn at 1× after zoom restore)
  renderFog(ctx, (es.px - es.scrollX) * vz, PLAYER_FOOT * vz - 12, gs, false);

  // Weather overlay (1×, over everything)
  drawExploreWeather(ctx, gs);
}

// Bodies, enemies (patrolling or in combat) and the player, with combat
// reactions. Shared by outdoors and building floors/rooms. `o.where` keys
// bodies to the place they fell.
function drawExploreActors(ctx, gs, es, o) {
  _fxStore();
  const _now = Date.now();
  for (const cp of es.corpses) {
    if ((cp.where || 'out') !== o.where) continue;
    _drawCorpse(ctx, cp.x, cp.sprite, cp.dir, cp.t0, cp.weapon, _now);
    if (!gs.inCombat && cp.loot && cp.loot.length && Math.abs(o.px - cp.x) < 28) {
      drawText(ctx, '[E] Search body', cp.x, GROUND_Y - 22, C.textBright, 7, 'center');
    }
  }

  if (gs.inCombat && gs.combat) {
    for (const en of gs.combat.enemies) {
      const enFacing = gs.combat.playerWx >= en.worldX ? 1 : -1;
      if (en.dead && en._deathT0) {
        _drawCorpse(ctx, en.worldX, en.sprite, en._deathDir || -enFacing, en._deathT0, enemyWeaponId(en), _now);
        continue;
      }
      const _ex = en.worldX + _hitOffset(en._hitT0, en._hitDir || -enFacing);
      _drawWorldEnemy(ctx, _ex, GROUND_Y, en.sprite, { id: enemyWeaponId(en), t0: en._atkT0 }, enFacing);
      if (en.dead) continue;
      drawStatBar(ctx, en.worldX - 22, GROUND_Y - 52, 44, 5,
        en.hp, en.maxHp, (en.hp / en.maxHp) > 0.5 ? '#aa2222' : '#dd1010');
      drawText(ctx, en.name, en.worldX, GROUND_Y - 57, '#cc4444', 7, 'center');
      if (gs.combat.targetIdx === en.index && gs.combat.turn === 'player') {
        ctx.save(); ctx.strokeStyle = '#cc4433'; ctx.lineWidth = 1.5;
        ctx.strokeRect(en.worldX - 18, GROUND_Y - 95, 36, 95);
        ctx.restore();
      }
    }
  } else {
    for (let i = 0; i < o.encounters.length; i++) {
      const enc = o.encounters[i];
      if (enc.triggered || enc.killed) continue;
      // Patrol oscillation (visual only — detection still uses enc.wx)
      const patrolWx = enc.wx + Math.sin(_now / 1400 + i * 2.1) * o.patrolAmp;
      const weapon = enc.ids ? enemyWeaponId({ id: enc.ids[0], index: 0 }) : 'pipe';
      ctx.save();
      ctx.globalAlpha = 0.82;
      _drawWorldEnemy(ctx, patrolWx, GROUND_Y, enc.previewSprite || 'human_hostile', { id: weapon });
      ctx.restore();
    }
  }

  // Player
  const pc = gs.inCombat && gs.combat ? gs.combat : null;
  const px = pc ? pc.playerWx : o.px;
  let facing = o.facing;
  if (pc) {
    const tg = pc.enemies.filter(e => !e.dead)[pc.targetIdx] || pc.enemies.find(e => !e.dead);
    if (tg) facing = tg.worldX >= pc.playerWx ? 1 : -1;
  }
  const weapon = { id: gs.parent.equipped.weapon, t0: pc ? pc.playerAnimT0 : 0 };
  if (pc && pc.playerDeathT0 && _now >= pc.playerDeathT0) {
    // falls backwards
    const k = Math.min(1, (_now - pc.playerDeathT0) / FX_FALL_MS);
    const e = 1 - (1 - k) * (1 - k);
    const dir = pc.playerDeathDir || -facing;
    ctx.save();
    ctx.translate(px, PLAYER_FOOT - 6 * e);
    ctx.rotate(dir * e * Math.PI / 2);
    drawParent(ctx, 0, 0, 2, facing, 0, gs.parent.gender, 'front', null);
    ctx.restore();
  } else {
    const hx = px + (pc ? _hitOffset(pc.playerHitT0, pc.playerHitDir || -facing) : 0);
    drawParent(ctx, hx, PLAYER_FOOT, 2, facing, o.animFrame, gs.parent.gender, o.pose, weapon);
  }
  if (pc) {
    drawStatBar(ctx, px - 22, PLAYER_FOOT - 52, 44, 5,
      pc.player.hp, pc.player.maxHp, (pc.player.hp / pc.player.maxHp) > 0.4 ? '#3a8a3a' : '#cc2020');
    drawText(ctx, gs.parent.name, px, PLAYER_FOOT - 57, '#88cc88', 7, 'center');
    const apStr = '▪'.repeat(pc.playerAp) + '▫'.repeat(Math.max(0, pc.player.maxAp - pc.playerAp));
    drawText(ctx, apStr, px, PLAYER_FOOT - 63, '#d4c888', 7, 'center');
  }
}

function renderBuildingInterior(ctx, gs, es) {
  const bi   = es.building;
  const bld  = es.buildings[bi.bldgIdx];
  const area = curArea(es);
  const W    = area.width;
  const vz   = EXPLORE_VIEW_ZOOM;

  ctx.save();
  ctx.scale(vz, vz);
  fillRect(ctx, 0, 0, CFG.W, CFG.H, '#0c0c14');
  ctx.save();
  ctx.translate(-bi.scrollX, 0);

  // Solid wall beyond the ends (visible when a small room is centred)
  fillRect(ctx, -400, 0, 400, CFG.H, '#0d0d12');
  fillRect(ctx, W, 0, 400, CFG.H, '#0d0d12');
  // Floor, ceiling, textured walls
  fillRect(ctx, 0, GROUND_Y, W, CFG.H - GROUND_Y, '#171215');
  fillRect(ctx, 0, GROUND_Y, W, 2, '#2e2028');
  fillRect(ctx, 0, 0, W, 28, '#080810');
  fillRect(ctx, 0, 26, W, 2, '#181820');
  const tx = INTERIOR_TEXTURES[bld.theme] || INTERIOR_TEXTURES.urban;
  fillTexture(ctx, tx[0], 0, 28, W, GROUND_Y - 28, area.isRoom ? 0.38 : 0.30);
  fillTexture(ctx, tx[1], 0, GROUND_Y + 2, W, CFG.H - GROUND_Y, 0.35);
  fillRect(ctx, 0, GROUND_Y - 6, W, 6, '#000', 0.35);   // skirting shadow
  fillRect(ctx, 0, 0, 8, GROUND_Y, '#161620');
  fillRect(ctx, W - 8, 0, 8, GROUND_Y, '#161620');

  const where = area.isRoom ? `${bld.label}  —  ${area.label}` : `${bld.label}  —  Floor ${bi.floorIdx + 1} / ${bld.numFloors}`;
  drawText(ctx, where, W / 2, 20, C.textDim, 7, 'center');

  // Ceiling lamps (some broken)
  for (let lx = 130; lx < W - 100; lx += 200) {
    fillRect(ctx, lx - 4, 28, 8, 3, '#303040');
    if ((lx / 200 + bi.floorIdx) % 3 !== 0) fillRect(ctx, lx - 2, 31, 4, 3, '#b0a050', 0.45);
  }

  drawAreaFurniture(ctx, area, GROUND_Y);

  const near = (x, r) => Math.abs(bi.px - x) < r;
  if (area.isRoom) {
    drawRoomDoor(ctx, area.backDoorX, GROUND_Y, 'Hallway', near(area.backDoorX + DOOR_W / 2, 26), '[E] Leave');
  } else {
    // Room doorways along the hallway
    for (const d of area.doors || []) {
      drawRoomDoor(ctx, d.x, GROUND_Y, d.label, near(d.x + DOOR_W / 2, 20), '[E] Enter');
    }
    // Exit door
    if (area.exitX !== null) {
      const ex = area.exitX;
      if (!drawEnvSprite(ctx, 'f_exit_door', ex + 9, GROUND_Y)) {
        fillRect(ctx, ex, GROUND_Y - 30, 18, 30, '#070710');
        strokeRect(ctx, ex, GROUND_Y - 30, 18, 30, '#2a2a40');
        drawText(ctx, 'EXIT', ex + 9, GROUND_Y - 33, '#3a6a3a', 7, 'center');
      }
      if (near(ex, 30)) drawText(ctx, '[E] Exit', ex + 9, GROUND_Y - 46, C.textBright, 7, 'center');
    }
    // Stairs
    if (area.stairsUpX !== null) {
      drawBuildingStairs(ctx, area.stairsUpX, GROUND_Y, 'up');
      if (near(area.stairsUpX, 30)) drawText(ctx, '[E] Up', area.stairsUpX + 12, GROUND_Y - 86, C.textBright, 7, 'center');
    }
    if (area.stairsDownX !== null) {
      drawBuildingStairs(ctx, area.stairsDownX, GROUND_Y, 'down');
      if (near(area.stairsDownX, 30)) drawText(ctx, '[E] Down', area.stairsDownX + 12, GROUND_Y - 86, C.textBright, 7, 'center');
    }
  }

  // Containers (searchable furniture is drawn by the furniture pass)
  for (const c of area.containers) drawAreaContainer(ctx, c, near(c.wx, 30));

  // Bodies, enemies, player
  const searching = area.containers.some(c => c.searching);
  drawExploreActors(ctx, gs, es, {
    px: bi.px, facing: bi.facing, animFrame: bi.animFrame || 0,
    pose: Math.abs(bi.velX) > 0.1 ? 'run' : (searching ? 'back' : 'front'),
    encounters: area.encounters || [], patrolAmp: 18, where: areaKey(es),
  });

  // Companion
  if (gs.exploreCompanionId && !gs.inCombat) {
    const compIdx = (gs.survivors || []).findIndex(s => s.id === gs.exploreCompanionId);
    if (compIdx >= 0) {
      drawSurvivor(ctx, bi.px - bi.facing * 22, PLAYER_FOOT, 2, -bi.facing, bi.animFrame || 0, compIdx, Math.abs(bi.velX) > 0.1 ? 'side' : 'front');
    }
  }

  _updateDrawFx(ctx, gs, es);

  ctx.restore(); // end world translate
  ctx.restore(); // end view zoom
  renderFog(ctx, (bi.px - bi.scrollX) * vz, PLAYER_FOOT * vz - 12, gs, true);
}

// One container: sprite (unless it's a piece of furniture), prompt, progress
function drawAreaContainer(ctx, c, isNear) {
  const isFurn = !!c.furnitureKey;
  const top = isFurn ? GROUND_Y - ((FURN_SIZE[c.furnitureKey] || [0, 40])[1]) : GROUND_Y - 24;
  const left = c.loot && c.loot.length;
  if (c.searched && !left) {
    if (!isFurn) drawExploreContainerEmpty(ctx, c.wx, GROUND_Y);
    else if (isNear) drawText(ctx, 'empty', c.wx, top - 4, '#5a5a5a', 6, 'center');
    return;
  }
  if (!isFurn && !c.searched) drawExploreContainer(ctx, c.wx, GROUND_Y, c.type, isNear);
  if (!isFurn && c.searched) drawExploreContainerEmpty(ctx, c.wx, GROUND_Y);
  if (c.searching) {
    drawSearchBar(ctx, c.wx, top - 4, c.searchProgress / (c._meticulousAdj ? c.searchDuration * 1.5 : c.searchDuration));
  } else if (isNear) {
    drawText(ctx, c.searched ? '[E] Take items' : `[E] Search${isFurn ? ' ' + c.type : ''}`, c.wx, top - 4, C.textBright, 7, 'center');
  }
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
    const _a = curArea(es);
    drawText(ctx, _a.isRoom ? `${bld.label} — ${_a.label}` : `${bld.label} — Floor ${bi.floorIdx + 1}`, 12, 32, C.textDim, 9);
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

  // Pick-up hint (not during combat — the combat HUD owns the bottom of the screen)
  if (!es.building && !gs.inCombat) {
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

  // Carry weight (hidden during combat — the action bar sits there)
  if (!gs.inCombat) {
    const wt    = calcWeight(gs.parent.inventory).toFixed(1);
    const maxWt = parentMaxCarry().toFixed(1);
    const wtCol = parseFloat(wt) > parseFloat(maxWt) * 0.9 ? C.textWarn : C.textDim;
    // sits right of the D-pad when touch controls are shown
    drawText(ctx, `Carry: ${wt}/${maxWt}kg`, touchControlsOn(gs) ? 118 : 12, CFG.H - 36, wtCol, 9);
  }

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
  if (es.showReturnPrompt && !es.building && !gs.inCombat) {
    const rb = _returnBtnRect(gs);
    drawButton(ctx, rb.x, rb.y, rb.w, rb.h, 'Return Home', hitTest(mx, my, rb.x, rb.y, rb.w, rb.h));
  }

  // ── Combat overlay HUD (replaces D-pad when in combat) ───────────────────────
  if (gs.inCombat && gs.combat) {
    _drawExploreCombatHUD(ctx, gs, mx, my);
  } else if (touchControlsOn(gs)) {
    // Touch D-pad + action button (touch devices only)
    const MB = _MOBILE_BTNS;
    ctx.save();
    ctx.globalAlpha = 0.7;
    const leftHov  = hitTest(mx, my, MB.left.x,   MB.left.y,   MB.left.w,   MB.left.h);
    const rightHov = hitTest(mx, my, MB.right.x,  MB.right.y,  MB.right.w,  MB.right.h);
    const actHov   = hitTest(mx, my, MB.action.x, MB.action.y, MB.action.w, MB.action.h);
    const isLeft   = GS.keys['a'] || GS.keys['arrowleft'];
    const isRight  = GS.keys['d'] || GS.keys['arrowright'];
    drawButton(ctx, MB.left.x,   MB.left.y,   MB.left.w,   MB.left.h,   '◀', leftHov,  isLeft);
    drawButton(ctx, MB.right.x,  MB.right.y,  MB.right.w,  MB.right.h,  '▶', rightHov, isRight);
    drawButton(ctx, MB.action.x, MB.action.y, MB.action.w, MB.action.h, '[E]', actHov);
    ctx.restore();
  }

  // INV button (top-right, below clock panel)
  const invBtnX = CFG.W - 60, invBtnY = 34;
  const invHov = hitTest(mx, my, invBtnX, invBtnY, 50, 22);
  drawButton(ctx, invBtnX, invBtnY, 50, 22, 'INV', invHov, es.invOpen);
  gs._exploreInvBtn = { x: invBtnX, y: invBtnY, w: 50, h: 22 };

  // HUNT button (huntable areas, outdoors, not fighting)
  gs._exploreHuntBtn = null;
  if (canHuntHere(gs)) {
    const hx = CFG.W - 60, hy = 60;
    drawButton(ctx, hx, hy, 50, 22, 'HUNT', hitTest(mx, my, hx, hy, 50, 22));
    drawText(ctx, '1 hour [H]', hx + 25, hy + 31, C.textDim, 6, 'center');
    gs._exploreHuntBtn = { x: hx, y: hy, w: 50, h: 22 };
  }
}

function canHuntHere(gs) {
  const es = exploreState;
  return !!(es && es.location.canHunt && !es.building && !gs.inCombat && !es.invOpen);
}

// Spend an hour hunting: fade out, pass time, roll for meat, show the result, fade in
function startHunt(gs) {
  if (!canHuntHere(gs) || (gs.screenFade && gs.screenFade.active)) return;
  gs.mouse.down = false;
  gs.keys = {};
  const fade = { active: true, alpha: 0, phase: 'out', titleText: null };
  fade.pendingFn = () => {
    // An hour passes in 10-minute steps (hunger, thirst, nightfall all apply)
    for (let i = 0; i < 6; i++) {
      tickStats(gs, 10 / CFG.MINS_PER_REAL_SEC);
      if (gs.screen !== 'explore' || !exploreState) return;   // night fell: run ended
    }
    const p = gs.parent;
    const skill = (p.skills.stealth || 1) * 6 + (p.skills.exploration || 1) * 4 + (p.perception || 5) * 2;
    const odds = clamp(10 + skill, 15, 85);
    p.tiredness = clamp(p.tiredness + 6, 0, 100);
    if (chance(odds)) {
      const qty = randInt(1, 2 + Math.floor(skill / 30));
      const def = getItemDef('raw_meat');
      if (calcWeight(p.inventory) + def.weight * qty <= parentMaxCarry()) {
        addToInventory(p.inventory, 'raw_meat', qty);
        addLog(`Hunting paid off: ${qty} raw meat.`, 'good');
      } else {
        exploreState.loot.push({ id: 'raw_meat', qty, wx: exploreState.px + 20, wy: GROUND_Y, taken: false });
        addLog(`Hunted ${qty} raw meat — too heavy, left it on the ground.`, 'warn');
      }
      giveXP(p, 6, gs);
      fade.titleText = `Caught ${qty} raw meat`;
    } else {
      addLog('An hour of hunting, nothing caught.', 'warn');
      fade.titleText = 'Nothing caught';
    }
  };
  gs.screenFade = fade;
}

// ── In-world combat HUD ───────────────────────────────────────────────────────

const _COMBAT_BAR_Y = CFG.H - 34;

function _drawExploreCombatHUD(ctx, gs, mx, my) {
  const c = gs.combat;

  // Combat log strip (above action bar)
  // Compact strip so it doesn't cover the ground line and characters' feet
  const logX = 6, logY = CFG.H - 76, logW = CFG.W - 12, logH = 36;
  fillRect(ctx, logX, logY, logW, logH, C.panelBg, 0.88);
  strokeRect(ctx, logX, logY, logW, logH, C.border2);
  const LOG_COLS = { good:'#44aa55', danger:'#cc4444', warn:'#cc8830', normal:C.textDim };
  let ly = logY + 10;
  for (let i = 0; i < Math.min(c.log.length, 3); i++) {
    const e = c.log[i];
    drawText(ctx, e.text, logX + 8, ly, LOG_COLS[e.type] || C.textDim, 8);
    ly += 11;
  }

  // Action bar background
  fillRect(ctx, 0, _COMBAT_BAR_Y - 4, CFG.W, 40, C.panelBg, 0.92);
  drawDivider(ctx, 0, _COMBAT_BAR_Y - 4, CFG.W, C.border2);

  const _busy = c.busyUntil && Date.now() < c.busyUntil;
  if (c.turn !== 'player' || c.phase !== 'action' || _busy) {
    const msg = (c.turn === 'enemy' || _busy) ? 'Enemy turn...' : (c.phase === 'victory' ? 'VICTORY!' : c.phase === 'fled' ? 'ESCAPED!' : 'DEFEATED');
    const col = (c.phase === 'victory' || c.phase === 'fled') ? C.textGood : C.textDanger;
    drawText(ctx, msg, CFG.W / 2, _COMBAT_BAR_Y + 14, col, 10, 'center', true);
    return;
  }

  let bx = 8;

  // AP display
  const apStr = `AP:${c.playerAp}/${c.player.maxAp}`;
  drawText(ctx, apStr, bx + 14, _COMBAT_BAR_Y + 14, '#d4c888', 9, 'center', true);
  bx += 34;

  // Move left
  const mlHov = hitTest(mx, my, bx, _COMBAT_BAR_Y, 32, 24);
  drawButton(ctx, bx, _COMBAT_BAR_Y, 32, 24, '◀', mlHov, false, c.playerAp < 1);
  gs._combatMoveL = { x: bx, y: _COMBAT_BAR_Y, w: 32, h: 24 };
  bx += 36;

  // Move right
  const mrHov = hitTest(mx, my, bx, _COMBAT_BAR_Y, 32, 24);
  drawButton(ctx, bx, _COMBAT_BAR_Y, 32, 24, '▶', mrHov, false, c.playerAp < 1);
  gs._combatMoveR = { x: bx, y: _COMBAT_BAR_Y, w: 32, h: 24 };
  bx += 36;

  // End Turn
  const etHov = hitTest(mx, my, bx, _COMBAT_BAR_Y, 50, 24);
  drawButton(ctx, bx, _COMBAT_BAR_Y, 50, 24, 'End ↵', etHov);
  gs._combatEndTurn = { x: bx, y: _COMBAT_BAR_Y, w: 50, h: 24 };
  bx += 56;

  // Attack
  const wd        = gs.parent.equipped.weapon ? getItemDef(gs.parent.equipped.weapon) : null;
  const isFirearm = wd && wd.weaponType === 'firearm';
  const isEmpty   = isFirearm && c.player.magazine <= 0;
  const alive     = c.enemies.filter(e => !e.dead);
  const tgt       = alive[c.targetIdx] || alive[0];
  const meleeDist = (gs.inCombat && tgt) ? Math.abs(c.playerWx - tgt.worldX) : 0;
  const tooFar    = !isFirearm && meleeDist > MELEE_RANGE;
  const hitPct    = tgt ? playerHitChance(gs, tgt) : 0;
  const atkLabel  = isEmpty ? '⚠ EMPTY' : (tooFar ? 'Too far' : `${wd ? 'Attack' : 'Punch'} ${hitPct}%`);
  const atkHov    = hitTest(mx, my, bx, _COMBAT_BAR_Y, 80, 24);
  drawButton(ctx, bx, _COMBAT_BAR_Y, 80, 24, atkLabel, atkHov, false, isEmpty || tooFar);
  if (wd) drawText(ctx, wd.name.slice(0,10), bx + 40, _COMBAT_BAR_Y - 2, C.textDim, 7, 'center');
  gs._combatAtk = { x: bx, y: _COMBAT_BAR_Y, w: 80, h: 24 };
  bx += 86;

  // Reload (firearm only)
  if (isFirearm) {
    const rlHov = hitTest(mx, my, bx, _COMBAT_BAR_Y, 56, 24);
    drawButton(ctx, bx, _COMBAT_BAR_Y, 56, 24, 'Reload', rlHov, false,
      !isEmpty || (gs.parent.ammo[wd.ammoType] || 0) <= 0);
    gs._combatReload = { x: bx, y: _COMBAT_BAR_Y, w: 56, h: 24 };
    bx += 62;
  } else { gs._combatReload = null; }

  // Target cycle (multiple enemies)
  if (alive.length > 1) {
    const tgHov = hitTest(mx, my, bx, _COMBAT_BAR_Y, 60, 24);
    drawButton(ctx, bx, _COMBAT_BAR_Y, 60, 24, `Target ${c.targetIdx + 1}/${alive.length}`, tgHov);
    gs._combatTarget = { x: bx, y: _COMBAT_BAR_Y, w: 60, h: 24 };
    bx += 66;
  } else { gs._combatTarget = null; }

  // Item
  const hasUsable = combatUsableItems(gs).length > 0;
  const itHov = hitTest(mx, my, bx, _COMBAT_BAR_Y, 50, 24);
  drawButton(ctx, bx, _COMBAT_BAR_Y, 50, 24, 'Item [I]', itHov, !!c.itemMenu, !hasUsable);
  gs._combatItem = { x: bx, y: _COMBAT_BAR_Y, w: 50, h: 24 };
  bx += 56;

  // Flee
  const canFlee = !alive.length || Math.min(...alive.map(e => Math.abs(c.playerWx - e.worldX))) >= FLEE_MIN_DIST;
  const flHov   = hitTest(mx, my, bx, _COMBAT_BAR_Y, 48, 24);
  drawButton(ctx, bx, _COMBAT_BAR_Y, 48, 24, 'Flee', flHov, false, c.playerAp < 2 || !canFlee);
  gs._combatFlee = { x: bx, y: _COMBAT_BAR_Y, w: 48, h: 24 };
  // Flee hint
  if (!canFlee) {
    const needed = alive.length ? Math.round(FLEE_MIN_DIST - Math.min(...alive.map(e => Math.abs(c.playerWx - e.worldX)))) : 0;
    if (needed > 0) drawText(ctx, `need ${needed}m`, bx + 24, _COMBAT_BAR_Y - 2, '#884444', 6, 'center');
  }

  if (c.itemMenu) _drawCombatItemMenu(ctx, gs, mx, my);
}

// ── In-world combat click handler ────────────────────────────────────────────

// Items that can be used mid-fight: food, water and medicine (not Lily's antiviral)
function combatUsableItems(gs) {
  return gs.parent.inventory.filter(s => {
    const d = getItemDef(s.id);
    return d && ['food', 'water', 'medicine'].includes(d.type) && s.id !== 'antiviral';
  });
}

// What an item does, short form for the picker
function _itemEffectText(d) {
  const parts = [];
  if (d.health) parts.push(`+${d.health} HP`);
  // hunger/thirst values are reductions, so show them as food/water gained
  const sgn = v => (v > 0 ? '+' : '') + v;
  if (d.hunger) parts.push(`food ${sgn(-d.hunger)}`);
  if (d.thirst) parts.push(`water ${sgn(-d.thirst)}`);
  if (d.clearsInfection) parts.push('cures infection');
  return parts.join(', ');
}

// Combat item picker (opened with the Item button or I)
function _drawCombatItemMenu(ctx, gs, mx, my) {
  const items = combatUsableItems(gs);
  const rowH = 16, w = 280;
  const h = 24 + items.length * rowH + 14;
  const x = Math.round(CFG.W / 2 - w / 2), y = _COMBAT_BAR_Y - 8 - h;
  drawPanel(ctx, x, y, w, h, C.panelBg, C.border2);
  drawText(ctx, 'USE ITEM  (uses your turn)', x + 8, y + 14, C.textBright, 8, 'left', true);
  gs._combatItemRows = [];
  items.forEach((slot, i) => {
    const d = getItemDef(slot.id);
    const ry = y + 22 + i * rowH;
    const hov = hitTest(mx, my, x + 4, ry, w - 8, rowH);
    if (hov) fillRect(ctx, x + 4, ry, w - 8, rowH, C.highlight);
    const ic = drawItemIcon(ctx, slot.id, x + 8, ry + 1, rowH - 2);
    drawText(ctx, `${i + 1}. ${d.name}${slot.qty > 1 ? ' x' + slot.qty : ''}`, x + (ic ? rowH + 10 : 10), ry + rowH - 4, hov ? C.textBright : C.text, 8);
    drawText(ctx, _itemEffectText(d), x + w - 8, ry + rowH - 4, C.textDim, 7, 'right');
    gs._combatItemRows.push({ x: x + 4, y: ry, w: w - 8, h: rowH, id: slot.id });
  });
  drawText(ctx, 'Click outside or Esc to cancel', x + w / 2, y + h - 4, C.textDim, 6, 'center');
}

// Return Home button: bottom-left, or left of the [E] button when touch controls are shown
function _returnBtnRect(gs) {
  return touchControlsOn(gs) ? { x: CFG.W - 186, y: CFG.H - 34, w: 112, h: 26 }
                             : { x: 6, y: CFG.H - 34, w: 112, h: 26 };
}

function _handleExploreCombatClick(mx, my, gs) {
  const c = gs.combat;
  if (!c || c.introTimer > 0 || (c.busyUntil && Date.now() < c.busyUntil) || c.turn !== 'player' || c.phase !== 'action') return;

  // Item picker open: pick an item, or click anywhere else to close it
  if (c.itemMenu) {
    const row = (gs._combatItemRows || []).find(r => hitTest(mx, my, r.x, r.y, r.w, r.h));
    c.itemMenu = false;
    if (row) playerUseItem(gs, row.id);
    return;
  }

  // Move left
  if (gs._combatMoveL && hitTest(mx, my, gs._combatMoveL.x, gs._combatMoveL.y, gs._combatMoveL.w, gs._combatMoveL.h)) {
    playerMoveLeft(gs); return;
  }
  // Move right
  if (gs._combatMoveR && hitTest(mx, my, gs._combatMoveR.x, gs._combatMoveR.y, gs._combatMoveR.w, gs._combatMoveR.h)) {
    playerMoveRight(gs); return;
  }
  // End Turn
  if (gs._combatEndTurn && hitTest(mx, my, gs._combatEndTurn.x, gs._combatEndTurn.y, gs._combatEndTurn.w, gs._combatEndTurn.h)) {
    playerEndTurn(gs); return;
  }
  // Attack
  if (gs._combatAtk && hitTest(mx, my, gs._combatAtk.x, gs._combatAtk.y, gs._combatAtk.w, gs._combatAtk.h)) {
    const alive = c.enemies.filter(e => !e.dead);
    if (!alive.length) return;
    // Find the actual index of the current target in c.enemies
    const realIdx = c.enemies.indexOf(alive[c.targetIdx] || alive[0]);
    playerAttack(gs, realIdx >= 0 ? realIdx : 0);
    return;
  }
  // Reload
  if (gs._combatReload && hitTest(mx, my, gs._combatReload.x, gs._combatReload.y, gs._combatReload.w, gs._combatReload.h)) {
    playerReload(gs); return;
  }
  // Target cycle
  if (gs._combatTarget && hitTest(mx, my, gs._combatTarget.x, gs._combatTarget.y, gs._combatTarget.w, gs._combatTarget.h)) {
    const alive = c.enemies.filter(e => !e.dead);
    if (alive.length > 1) {
      let next = (c.targetIdx + 1) % alive.length;
      c.targetIdx = next;
    }
    return;
  }
  // Item
  if (gs._combatItem && hitTest(mx, my, gs._combatItem.x, gs._combatItem.y, gs._combatItem.w, gs._combatItem.h)) {
    if (combatUsableItems(gs).length) c.itemMenu = true;
    return;
  }
  // Flee
  if (gs._combatFlee && hitTest(mx, my, gs._combatFlee.x, gs._combatFlee.y, gs._combatFlee.w, gs._combatFlee.h)) {
    playerFlee(gs); return;
  }
}

// Start in-world combat from outside the encounter system (e.g. an event's
// "Fight back" choice). Enemies appear a short distance ahead of the player.
function startExploreCombat(gs, enemies) {
  const es = exploreState;
  if (!es || !enemies || enemies.length === 0) return;
  if (es.building) es.building = null; // fights happen outdoors
  const dir = es.facing || 1;
  const enemyWx = clamp(es.px + dir * 140, 40, CFG.WORLD_W - 40);
  gs.mouse.down = false;
  startCombat(gs, enemies, es.px, enemyWx);
  gs.inCombat = true;
}

// "COMBAT" banner shown while the fight's opening freeze runs
function _drawCombatBanner(ctx, timeLeft) {
  const total = CFG_COMBAT_INTRO;
  const t = 1 - timeLeft / total;                       // 0 → 1 over the freeze
  const fadeIn  = Math.min(1, t / 0.15);
  const fadeOut = Math.min(1, timeLeft / 0.25);
  const a = Math.min(fadeIn, fadeOut);
  const stretch = 0.85 + 0.15 * Math.min(1, t / 0.2);   // quick horizontal snap-in
  const cy = Math.round(CFG.H * 0.42);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(0, cy - 26, CFG.W, 52);
  ctx.fillStyle = '#8a2a20';
  ctx.fillRect(0, cy - 26, CFG.W, 2);
  ctx.fillRect(0, cy + 24, CFG.W, 2);
  ctx.translate(CFG.W / 2, cy);
  ctx.scale(stretch, 1);
  ctx.font = 'bold 30px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#1a0806';
  ctx.fillText('C O M B A T', 2, 2);
  ctx.fillStyle = '#d4483a';
  ctx.fillText('C O M B A T', 0, 0);
  ctx.restore();
}

// ── Combat effects: blood, sparks, damage numbers, deaths, corpses ───────────
// combat.js reports hits/misses/deaths via combatFx(); everything here is
// visual and lives on exploreState for the rest of the run.

const FX_GRAVITY = 300;     // px/s²
const FX_FALL_MS = 450;     // death topple time

function _fxStore() {
  const es = exploreState;
  if (!es) return null;
  if (!es.fx) { es.fx = []; es.decals = []; es.floaters = []; es.corpses = []; es.fxQueue = []; }
  return es;
}

function _isMachine(sprite) { return sprite === 'robot' || sprite === 'drone' || sprite === 'drone_heavy'; }

// Height above the ground where hits land, per body type
function _hitHeight(sprite) {
  if (sprite === 'drone' || sprite === 'drone_heavy') return 40;
  if (sprite === 'wolf') return 14;
  if (sprite === 'robot') return 34;
  return 28;
}

function _spray(es, x, y, dir, machine, n) {
  for (let i = 0; i < n; i++) {
    es.fx.push({
      x: x + (Math.random() - 0.5) * 4, y: y + (Math.random() - 0.5) * 8,
      vx: dir * (25 + Math.random() * 95) + (Math.random() - 0.5) * 30,
      vy: -(15 + Math.random() * 85),
      life: machine ? 0.45 + Math.random() * 0.3 : 1.5,
      machine, where: areaKey(es),
      size: Math.random() < 0.3 ? 2 : 1,
      color: machine ? ['#ffd060', '#ffa030', '#fff4c0'][i % 3] : ['#8a1010', '#a01a14', '#6a0a0a'][i % 3],
    });
  }
}

function combatFx(gs, type, who, amount, fromX, delayMs) {
  const es = _fxStore();
  if (!es || !gs.combat) return;
  if (delayMs > 0) { es.fxQueue.push({ at: Date.now() + delayMs, args: [gs, type, who, amount, fromX, 0] }); return; }
  const c = gs.combat;
  const now = Date.now();
  const isPlayer = who === 'player';
  const x = isPlayer ? c.playerWx : who.worldX;
  const sprite = isPlayer ? 'player' : who.sprite;
  const y = GROUND_Y - _hitHeight(sprite);
  const away = x >= (fromX === undefined ? x - 1 : fromX) ? 1 : -1;   // direction away from the attacker
  const machine = _isMachine(sprite);
  if (type === 'hit') {
    if (isPlayer) { c.playerHitT0 = now; c.playerHitDir = away; }
    else { who._hitT0 = now; who._hitDir = away; }
    _spray(es, x, y, away, machine, 6 + Math.min(16, amount * 2));
    es.floaters.push({ x, y: y - 18, text: '-' + amount, color: isPlayer ? '#ff5a4a' : '#ffd8a8', t0: now });
  } else if (type === 'miss') {
    es.floaters.push({ x, y: y - 18, text: isPlayer ? 'DODGE' : 'MISS', color: '#b8b4a0', t0: now });
  } else if (type === 'death') {
    if (isPlayer) { c.playerDeathT0 = now; c.playerDeathDir = away; }
    else { who._deathT0 = now; who._deathDir = away; }
    _spray(es, x, y, away, machine, 18);
  }
}

// Move dead enemies into the persistent corpse list when a fight ends
function archiveCorpses(gs, c) {
  const es = _fxStore();
  if (!es || !c) return;
  for (const en of c.enemies) {
    if (!en.dead) continue;
    es.corpses.push({ x: en.worldX, sprite: en.sprite, dir: en._deathDir || 1,
                      t0: en._deathT0 || 0, weapon: enemyWeaponId(en), where: areaKey(es),
                      loot: en._loot || [], name: en.name });
  }
}

// Draw one fallen body (k = 0..1 through the fall). `dir` is the direction it falls.
function _drawCorpse(ctx, x, sprite, dir, t0, weapon, now) {
  const k = t0 ? Math.min(1, Math.max(0, (now - t0) / FX_FALL_MS)) : 1;
  const e = 1 - (1 - k) * (1 - k);                      // ease-out
  const facing = -dir;                                   // was facing its attacker
  // Blood pool (or oil) spreading under the body
  const pt = t0 ? Math.min(1, Math.max(0, (now - t0 - 250) / 2500)) : 1;
  if (pt > 0) {
    const pw = (sprite === 'wolf' ? 10 : 8) + pt * (_isMachine(sprite) ? 8 : 16);
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = _isMachine(sprite) ? '#141414' : '#5a0808';
    ctx.beginPath();
    ctx.ellipse(x + dir * 10, GROUND_Y + 1, pw, 2 + pt * 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  if (sprite === 'drone' || sprite === 'drone_heavy') {
    // drops out of the air, tilting
    const yy = GROUND_Y - 28 + e * 20;
    ctx.translate(x, yy);
    ctx.rotate(dir * e * 0.5);
    drawDroneSprite(ctx, 0, 0, 2, 0);
  } else if (sprite === 'wolf') {
    ctx.translate(x, GROUND_Y);
    ctx.scale(1, 1 - 0.45 * e);                           // slumps onto its side
    ctx.rotate(dir * e * 0.15);
    drawWolfSprite(ctx, 0, 0, 2, facing, 0);
  } else {
    // people and robots topple backwards, pivoting on their feet
    const lift = (sprite === 'robot' ? 17 : 10) * e;
    ctx.translate(x, GROUND_Y - lift);
    ctx.rotate(dir * e * Math.PI / 2);
    if (sprite === 'robot') drawRobotSprite(ctx, 0, 0, 2, facing);
    else drawHumanEnemy(ctx, 0, 0, 2, facing, 0, null);
  }
  ctx.restore();
  // dropped weapon lying beside the body
  if (weapon && k >= 0.6 && _itemArt[weapon]) {
    const img = _itemArt[weapon];
    ctx.save();
    ctx.translate(Math.round(x - dir * 18), GROUND_Y);
    if (facing < 0) ctx.scale(-1, 1);
    ctx.drawImage(img, -Math.round(img.naturalWidth / 2), -img.naturalHeight);
    ctx.restore();
  }
}

// Particles, ground stains, floating numbers, tracers. Called inside the world transform.
function _updateDrawFx(ctx, gs, es) {
  if (!es.fx) return;
  const now = Date.now();
  const pnow = performance.now();
  const dt = Math.min(0.05, es._fxLast ? (pnow - es._fxLast) / 1000 : 0);
  es._fxLast = pnow;
  // delayed effects
  if (es.fxQueue.length) {
    const due = es.fxQueue.filter(q => q.at <= now);
    es.fxQueue = es.fxQueue.filter(q => q.at > now);
    for (const q of due) combatFx(...q.args);
  }
  // ground stains
  const here = areaKey(es);
  for (const d of es.decals) if ((d.where || 'out') === here) fillRect(ctx, d.x, GROUND_Y + d.y, d.w, 1, d.color, 0.9);
  // particles
  const keep = [];
  for (const p of es.fx) {
    p.vy += FX_GRAVITY * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    if (p.y >= GROUND_Y) {
      if (!p.machine) {
        es.decals.push({ x: Math.round(p.x), y: Math.floor(Math.random() * 3), w: 1 + Math.floor(Math.random() * 3), color: p.color, where: p.where });
        if (es.decals.length > 400) es.decals.shift();
      }
      continue;
    }
    if (p.life <= 0) continue;
    if ((p.where || 'out') !== here) { keep.push(p); continue; }
    fillRect(ctx, Math.round(p.x), Math.round(p.y), p.size, p.size, p.color);
    keep.push(p);
  }
  es.fx = keep;
  // bullet tracers (player and gun-carrying enemies)
  const c = gs.combat;
  if (gs.inCombat && c) {
    const tracer = (fromX, toX, t0) => {
      const t = (now - (t0 || 0)) / 1000;
      if (t < 0 || t > 0.07) return;
      ctx.save();
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = '#ffe6a8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(fromX, GROUND_Y - 26); ctx.lineTo(toX, GROUND_Y - 27);
      ctx.stroke();
      ctx.restore();
    };
    const pw = gs.parent.equipped.weapon;
    if (pw && WEAPON_GUNS.has(pw) && c.lastShotTo !== undefined) tracer(c.playerWx, c.lastShotTo, c.playerAnimT0);
    for (const en of c.enemies) {
      const w = enemyWeaponId(en);
      if (w && WEAPON_GUNS.has(w) && en._shotTo !== undefined) tracer(en.worldX, en._shotTo, en._atkT0);
    }
  }
  // floating numbers
  es.floaters = es.floaters.filter(f => now - f.t0 < 900);
  for (const f of es.floaters) {
    const t = (now - f.t0) / 900;
    ctx.save();
    ctx.globalAlpha = 1 - t * t;
    drawText(ctx, f.text, f.x, f.y - t * 18, f.color, 8, 'center', true);
    ctx.restore();
  }
}

// Knockback offset while a hit reaction plays
function _hitOffset(t0, dir) {
  if (!t0) return 0;
  const t = (Date.now() - t0) / 220;
  if (t < 0 || t >= 1) return 0;
  return Math.round(dir * 5 * Math.sin(t * Math.PI));
}

// ── World enemy sprite helper ─────────────────────────────────────────────────

// Weapon each human enemy type carries (machines and animals carry none)
const ENEMY_WEAPONS = {
  raider: ['pipe', 'knife', 'bat'],
  raider_armed: ['pistol'],
  survivor_bandit: ['knife', 'crowbar'],
  singularity_cultist: ['machete'],
  boss_raider_chief: ['shotgun'],
};
function enemyWeaponId(en) {
  const list = ENEMY_WEAPONS[en.id];
  if (!list) return null;
  return list[(en.index || 0) % list.length];   // stable per enemy, varied within a group
}

function _drawWorldEnemy(ctx, wx, groundY, sprite, weapon, facing) {
  const frame = Math.floor(Date.now() / 300) % 2;
  const f = facing || -1;
  switch (sprite) {
    case 'drone':
    case 'drone_heavy': drawDroneSprite(ctx, wx, groundY - 28, 2, frame); break;
    case 'robot':       drawRobotSprite(ctx, wx, groundY, 2, f); break;
    case 'wolf':        drawWolfSprite(ctx, wx, groundY, 2, f, frame); break;
    default:            drawHumanEnemy(ctx, wx, groundY, 2, f, frame, weapon); break;
  }
}

// ── Drawing helpers ───────────────────────────────────────────────────────────

function drawExploreTent(ctx, cx, groundY, w, h, label) {
  if (drawEnvSprite(ctx, 'tent', cx, groundY, w, h)) {
    if (label) drawText(ctx, label, cx, groundY - h - 6, C.textDim, 6, 'center');
    return;
  }
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
  if (drawEnvSprite(ctx, 'car_wreck', x, groundY, 68, 36)) return;
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
  // Alternate the hand-drawn trash pile with concrete rubble
  const key = _envVariant(x, 2) === 0 ? 'trash' : 'debris';
  if (drawEnvSprite(ctx, key, x, groundY, 44, 20)) return;
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
  // Heights relative to a ~48px-tall person: lockers chest-high-plus, crates waist-high
  const CONTAINER_H = { locker: 42, chest: 18, crate: 24, box: 16 };
  const targetH = CONTAINER_H[spriteKey];
  const fit = _fitSprite(spriteKey, targetH);
  if (fit) {
    if (highlighted) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      fillRect(ctx, wx - fit.width / 2 - 2, groundY - fit.height - 2, fit.width + 4, fit.height + 2, '#a08840');
      ctx.restore();
    }
    drawEnvSpriteFit(ctx, spriteKey, wx, groundY, targetH);
    drawText(ctx, type, wx, groundY - fit.height - 4, C.textDim, 6, 'center');
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

// [wall texture, floor texture] per building theme
const INTERIOR_TEXTURES = {
  hospital: ['tex_wall_tile', 'tex_floor_tile'],
  office:   ['tex_wall_plaster', 'tex_floor_tile'],
  factory:  ['tex_wall_concrete', 'tex_floor_concrete'],
  mall:     ['tex_wall_tile', 'tex_floor_tile'],
  house:    ['tex_wall_plaster', 'tex_floor_wood'],
  cabin:    ['tex_wall_wood', 'tex_floor_wood'],
  pharmacy: ['tex_wall_tile', 'tex_floor_tile'],
  church:   ['tex_wall_stone', 'tex_floor_wood'],
  urban:    ['tex_wall_brick', 'tex_floor_concrete'],
  tent:     ['tex_wall_brick', 'tex_floor_concrete'],
};


// How far below the wall line the walking floor is (characters' shoes)
const STAIR_FLOOR = 12;

function drawBuildingStairs(ctx, sx, groundY, dir) {
  // Up: bottom step on the walking floor (feet stand ~10px in front of the wall line).
  // Down: the flight sinks into a dark stairwell cut into the floor.
  if (dir === 'down' && _envSpr['f_stairs_down']) {
    const sink = 40;
    fillRect(ctx, sx - 6, groundY + 2, 74, 60, '#050404', 0.9);       // stairwell opening
    fillRect(ctx, sx - 6, groundY + 2, 74, 2, '#2a2420');
    drawEnvSprite(ctx, 'f_stairs_down', sx + 24, groundY + STAIR_FLOOR + sink);
    drawText(ctx, '▼ DOWN', sx + 24, groundY - 76 + sink, '#8a7aaa', 7, 'center');
    return;
  }
  // bottom step level with the walking floor (where the character's shoes are)
  if (drawEnvSprite(ctx, dir === 'up' ? 'f_stairs_up' : 'f_stairs_down', sx + 24, groundY + STAIR_FLOOR)) {
    drawText(ctx, dir === 'up' ? '▲ UP' : '▼ DOWN', sx + 24, groundY - 76 + STAIR_FLOOR - 10, '#8a7aaa', 7, 'center');
    return;
  }
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
      containers: es.containers.map(c => ({ searched: c.searched, loot: c.searched ? c.loot : undefined })),
      loot:       es.loot.map(l => ({ taken: l.taken })),
      encounters: es.encounters.map(e => ({ triggered: e.triggered, killed: e.killed })),
      buildings:  es.buildings.map(b => ({
        floors: b.floors.map(f => {
          const saveArea = a => ({
            containers: a.containers.map(c => ({ searched: c.searched, loot: c.searched ? c.loot : undefined })),
            cleared: (a.encounters || []).map(e => !!(e.killed || e.triggered)),
          });
          return { ...saveArea(f), rooms: (f.rooms || []).map(saveArea) };
        }),
      })),
    };
  }

  gs.parent.isExploring = false;
  gs.child.isAlone      = false;
  gs.inCombat           = false;
  gs.combat             = null;
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
