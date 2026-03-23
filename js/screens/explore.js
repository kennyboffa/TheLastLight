// explore.js — Side-scrolling exploration with buildings, containers, fog of war
'use strict';

const GROUND_Y    = 240;
const PLAYER_FOOT = GROUND_Y;
const BUILDING_W  = 900;   // interior width of each building floor

let exploreState = null;
let fogCanvas    = null;   // offscreen canvas for fog of war

// ── Mobile D-pad button rects ─────────────────────────────────────────────────
const _MOBILE_BTNS = {
  left:   { x: 10,  y: 290, w: 40, h: 30 },
  right:  { x: 56,  y: 290, w: 40, h: 30 },
  action: { x: 546, y: 290, w: 44, h: 30 },
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
    for (const bdef of (zone.buildings || [])) {
      const bx     = zone.x + bdef.relX;
      const bw     = 130 + randInt(0, 80);
      const bh     = 85 + randInt(20, 55);
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

  // Outdoor containers (2-4 per zone, scattered)
  // Crates and chests are only found near/inside buildings — not in forest/nature exterior
  const containers = [];
  for (const zone of loc.zones) {
    const isNatureZone = zone.lootTable && (zone.lootTable.startsWith('nature') || zone.lootTable.startsWith('water'));
    const count = isNatureZone ? 0 : 2 + randInt(0, 2);
    for (let i = 0; i < count; i++) {
      const cx = zone.x + 50 + randInt(0, zone.w - 100);
      if (buildings.some(b => Math.abs(cx - (b.doorX + 8)) < 35)) continue;
      // Nature-adjacent zones only spawn bags/backpacks, never crates or chests
      const types = ['locker', 'bag'];
      containers.push({
        wx: cx, wy: GROUND_Y,
        type: randChoice(types),
        searched: false, searching: false,
        searchProgress: 0,
        searchDuration: 1 + randFloat(0.5, 2),
        loot: rollLoot(zone.lootTable),
      });
    }
  }

  // Sparse ground loot (fewer items since containers added)
  const lootItems = [];
  for (const zone of loc.zones) {
    const items = rollLoot(zone.lootTable);
    // Only place ~40% of rolled items on the ground; rest in containers
    const groundItems = items.filter(() => Math.random() < 0.4);
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

  exploreState = {
    location:  loc,
    scrollX:   0,
    loot:      lootItems,
    containers,
    buildings,
    encounters,
    events,
    huntSpots,
    px: 80, py: PLAYER_FOOT,
    velX: 0, facing: 1,
    animFrame: 0, animTimer: 0,
    showReturnPrompt: false,
    building: null,   // non-null when inside a building
    invOpen: false, invScroll: 0,
  };

  // Restore persistent loot/encounter state from previous visit
  const saved = gs.locationStates && gs.locationStates[loc.id];
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

  gs.parent.isExploring = true;
  gs.child.isAlone      = true;
  gs.screenFade = { active: true, alpha: 0, phase: 'out', pendingFn: () => {
    gs.screen   = 'explore';
    gs.zoomAnim = { scale: 1.55, target: 1.0 };
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
  }
}

// Generate one floor of a building
function genBuildingFloor(floorIdx, totalFloors, bdef) {
  const theme   = bdef.theme    || 'urban';
  const quality = bdef.lootQuality || 'light';
  const cCount  = 2 + randInt(0, 2);
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
      searchDuration: 1 + randFloat(0.5, 2),
      loot: rollBuildingLoot(theme, quality),
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
  const speedMult = gs.parent.wounded ? 0.55 : 1.0;
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
      if (c.searchProgress >= c.searchDuration) {
        c.searching = false; c.searched = true;
        finishSearch(c, gs);
      }
    }
  }

  // Encounters
  for (const enc of es.encounters) {
    if (!enc.triggered && Math.abs(es.px - enc.wx) < enc.distance) {
      enc.triggered = true;
      const enemies = buildEncounter(enc.difficulty, enc.zone, enc.locCanHunt);
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
  if (p.tiredness >= 92) { endExploration(gs); notify('Too exhausted. Returned home.', 'warn'); }
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
  if (left)       { bi.velX = -CFG.PLAYER_SPEED; bi.facing = -1; }
  else if (right) { bi.velX =  CFG.PLAYER_SPEED; bi.facing =  1; }
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
      if (c.searchProgress >= c.searchDuration) {
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
  let added = 0;
  const names = [];
  for (const item of container.loot) {
    const def  = getItemDef(item.id);
    const maxW = parentMaxCarry();
    const curW = calcWeight(gs.parent.inventory);
    if (def && curW + def.weight * item.qty <= maxW) {
      addToInventory(gs.parent.inventory, item.id, item.qty);
      if (names.length < 2) names.push(def.name);
      added++;
    }
  }
  if (added > 0) {
    addLog(`Found: ${names.join(', ')}${container.loot.length > 2 ? '...' : ''}`, 'good');
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
    return;
  }

  // Cancel an in-progress search
  const searchingC = es.containers.find(c => c.searching && Math.abs(es.px - c.wx) < 30);
  if (searchingC) { searchingC.searching = false; searchingC.searchProgress = 0; return; }

  // Start searching a container
  const nearC = es.containers.find(c => !c.searched && !c.searching && Math.abs(es.px - c.wx) < 30);
  if (nearC) { nearC.searching = true; nearC.searchProgress = 0; notify('Searching...', 'info'); return; }

  // Enter a building
  const nearB = es.buildings.find(b => Math.abs(es.px - (b.doorX + 8)) < 24);
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
  if (nearC) { nearC.searching = true; nearC.searchProgress = 0; notify('Searching...', 'info'); }
}

// ── Click handling ────────────────────────────────────────────────────────────

function exploreClick(mx, my, gs) {
  if (!exploreState) return;
  const es = exploreState;

  // Inventory overlay — handle before anything else
  if (es.invOpen) {
    if (gs._exploreInvClose && hitTest(mx, my, gs._exploreInvClose.x, gs._exploreInvClose.y, gs._exploreInvClose.w, gs._exploreInvClose.h)) {
      es.invOpen = false; return;
    }
    if (gs._exploreInvRows) {
      for (const row of gs._exploreInvRows) {
        if (my >= row.y1 && my < row.y2) {
          const def = getItemDef(row.slot.id);
          if (def) {
            removeFromInventory(gs.parent.inventory, row.slot.id, row.slot.qty);
            notify(`Dropped ${def.name}.`, 'warn');
          }
          return;
        }
      }
    }
    // Click outside modal to close
    const px = 30, py = 40, pw = CFG.W - 60, ph = CFG.H - 80;
    if (!hitTest(mx, my, px, py, pw, ph)) es.invOpen = false;
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
    es.invOpen = !es.invOpen; return;
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
    if (nearC) { nearC.searching = true; nearC.searchProgress = 0; notify('Searching...', 'info'); }
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
    return;
  }

  // Outdoor click on container
  const nearC = es.containers.find(c => !c.searched && !c.searching &&
    Math.abs(wx - c.wx) < 24 && my > GROUND_Y - 35 && my < GROUND_Y + 10);
  if (nearC) { nearC.searching = true; nearC.searchProgress = 0; notify('Searching...', 'info'); }
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderExplore(ctx, gs) {
  if (!exploreState) return;
  const es = exploreState;

  if (es.building) renderBuildingInterior(ctx, gs, es);
  else             renderOutdoor(ctx, gs, es);

  drawExploreHUD(ctx, gs, es);
  if (es.invOpen) drawExploreInventory(ctx, gs, es);
  drawNotifications(ctx, gs);
  drawDayTransition(ctx, gs);
}

function renderOutdoor(ctx, gs, es) {
  const loc = es.location;

  drawExploreBackground(ctx, es.scrollX, null, CFG.H, gs.time);
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
    if (zone.bgColor && (zone.bgColor.startsWith('#0') || zone.bgColor.startsWith('#06') ||
        zone.bgColor.startsWith('#07') || zone.bgColor.startsWith('#08') ||
        zone.bgColor.startsWith('#09') || zone.bgColor.startsWith('#060'))) {
      const isNature = zone.lootTable && zone.lootTable.startsWith('nature');
      if (isNature) {
        for (let tx = zone.x + 30; tx < zone.x + zone.w - 20; tx += 58) {
          drawExploreTree(ctx, tx, GROUND_Y);
        }
      }
    }
  }

  // Buildings (pre-generated data — no randInt here)
  for (const bld of es.buildings) {
    drawExploreBuilding(ctx, bld.bx, GROUND_Y - bld.bh, bld.bw, bld.bh, bld.label);
    if (Math.abs(es.px - (bld.doorX + 8)) < 24) {
      drawText(ctx, '[E] Enter', bld.doorX + 8, GROUND_Y - bld.bh - 8, C.textBright, 7, 'center');
    }
  }

  // Outdoor containers
  for (const c of es.containers) {
    if (c.searched) continue;
    const near = Math.abs(es.px - c.wx) < 30;
    drawExploreContainer(ctx, c.wx, GROUND_Y, c.type, near);
    if (c.searching) {
      drawSearchBar(ctx, c.wx, GROUND_Y - 22, c.searchProgress / c.searchDuration);
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
    fillRect(ctx, sx - 4, sy - 4, 8, 8, itemTypeColor(def.type), 0.9);
    strokeRect(ctx, sx - 4, sy - 4, 8, 8, C.border2);
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
  drawParent(ctx, es.px, PLAYER_FOOT, 2, es.facing, es.animFrame, gs.parent.gender);

  // Companion following player
  if (gs.exploreCompanionId) {
    const compIdx = (gs.survivors || []).findIndex(s => s.id === gs.exploreCompanionId);
    if (compIdx >= 0) {
      const compX = es.px - es.facing * 22;
      drawSurvivor(ctx, compX, PLAYER_FOOT, 2, -es.facing, es.animFrame, compIdx);
    }
  }

  ctx.restore();

  // Fog of war (drawn over world, not over HUD)
  const playerScreenX = es.px - es.scrollX;
  renderFog(ctx, playerScreenX, PLAYER_FOOT - 12, gs, false);

  // Weather overlay
  drawExploreWeather(ctx, gs);
}

function renderBuildingInterior(ctx, gs, es) {
  const bi  = es.building;
  const bld = es.buildings[bi.bldgIdx];
  const fl  = bld.floors[bi.floorIdx];

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

  // Ambient wall lamps
  for (let lx = 130; lx < fl.width - 100; lx += 200) {
    fillRect(ctx, lx - 4, 28, 8, 3, '#303040');
    fillRect(ctx, lx - 2, 31, 4, 3, '#b0a050', 0.45);
  }

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
      drawSearchBar(ctx, c.wx, GROUND_Y - 22, c.searchProgress / c.searchDuration);
    } else if (near) {
      drawText(ctx, '[E] Search', c.wx, GROUND_Y - 24, C.textBright, 7, 'center');
    }
  }

  // Player
  drawParent(ctx, bi.px, PLAYER_FOOT, 2, bi.facing, bi.animFrame || 0, gs.parent.gender);

  // Companion in building
  if (gs.exploreCompanionId) {
    const compIdx = (gs.survivors || []).findIndex(s => s.id === gs.exploreCompanionId);
    if (compIdx >= 0) {
      drawSurvivor(ctx, bi.px - bi.facing * 22, PLAYER_FOOT, 2, -bi.facing, bi.animFrame || 0, compIdx);
    }
  }

  ctx.restore();

  // Indoor fog (tighter radius)
  const playerScreenX = bi.px - bi.scrollX;
  renderFog(ctx, playerScreenX, PLAYER_FOOT - 12, gs, true);
}

// ── HUD ───────────────────────────────────────────────────────────────────────

function drawExploreHUD(ctx, gs, es) {
  const loc = es.location;
  const mx = gs.mouse.x, my = gs.mouse.y;

  // Location / zone info panel + clock
  drawPanel(ctx, 6, 6, 240, 30, C.panelBg);
  drawText(ctx, loc.name, 12, 18, C.text, 8);
  if (es.building) {
    const bi  = es.building;
    const bld = es.buildings[bi.bldgIdx];
    drawText(ctx, `${bld.label} — Floor ${bi.floorIdx + 1}`, 12, 30, C.textDim, 7);
  } else {
    const curZone = loc.zones.find(z => es.px >= z.x && es.px < z.x + z.w);
    if (curZone) drawText(ctx, curZone.name, 12, 30, C.textDim, 7);
  }

  // Clock display (top-right of HUD)
  const timeStr = formatTime(gs.time);
  const timeWarnColor = gs.time >= 20 * 60 ? (gs.time >= 22 * 60 ? '#cc2828' : '#cc7020') : C.textBright;
  drawPanel(ctx, CFG.W - 72, 6, 66, 20, C.panelBg);
  drawText(ctx, timeStr, CFG.W - 39, 19, timeWarnColor, 10, 'center', true);

  // Pick-up hint
  if (!es.building) {
    const nearLoot = es.loot.find(item => !item.taken && Math.abs(es.px - item.wx) < 25);
    if (nearLoot) {
      const def = getItemDef(nearLoot.id);
      drawPanel(ctx, CFG.W / 2 - 70, CFG.H - 50, 140, 14, C.panelBg, C.border);
      drawText(ctx, `[E] ${def?.name || nearLoot.id}`, CFG.W / 2, CFG.H - 40, C.textDim, 7, 'center');
    }
    if (es.showReturnPrompt) {
      drawPanel(ctx, CFG.W / 2 - 80, CFG.H - 50, 160, 14, C.panelBg, C.border);
      drawText(ctx, '[E] Return to shelter', CFG.W / 2, CFG.H - 40, C.textDim, 7, 'center');
    }
  }

  // Carry weight
  const wt    = calcWeight(gs.parent.inventory).toFixed(1);
  const maxWt = parentMaxCarry().toFixed(1);
  const wtCol = parseFloat(wt) > parseFloat(maxWt) * 0.9 ? C.textWarn : C.textDim;
  drawText(ctx, `Carry: ${wt}/${maxWt}kg`, 12, CFG.H - 38, wtCol, 8);

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
    const retBtnY = CFG.H - 30;
    drawButton(ctx, 6, retBtnY, 96, 20, 'Return Home', hitTest(mx, my, 6, retBtnY, 96, 20));
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

  // INV button (top-right)
  const invBtnX = CFG.W - 50, invBtnY = 6;
  const invHov = hitTest(mx, my, invBtnX, invBtnY, 40, 18);
  drawButton(ctx, invBtnX, invBtnY, 40, 18, 'INV', invHov, es.invOpen);
  gs._exploreInvBtn = { x: invBtnX, y: invBtnY, w: 40, h: 18 };
}

// ── Drawing helpers ───────────────────────────────────────────────────────────

function drawExploreTree(ctx, x, groundY) {
  fillRect(ctx, x - 3, groundY - 28, 6, 28, '#3a2810');
  ctx.fillStyle = '#18380e';
  ctx.beginPath();
  ctx.moveTo(x, groundY - 78);
  ctx.lineTo(x - 16, groundY - 42);
  ctx.lineTo(x + 16, groundY - 42);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#264a14';
  ctx.beginPath();
  ctx.moveTo(x, groundY - 62);
  ctx.lineTo(x - 12, groundY - 30);
  ctx.lineTo(x + 12, groundY - 30);
  ctx.closePath();
  ctx.fill();
}

function drawExploreContainer(ctx, wx, groundY, type, highlighted) {
  const h  = type === 'locker' || type === 'cabinet' ? 32 : type === 'chest' ? 16 : 20;
  const w  = type === 'locker' || type === 'cabinet' ? 14 : type === 'chest' ? 24 : 18;
  const bg = highlighted ? '#28241a' : '#181410';
  const br = highlighted ? '#8a7840' : '#403c28';
  fillRect(ctx, wx - w / 2, groundY - h, w, h, bg);
  strokeRect(ctx, wx - w / 2, groundY - h, w, h, br);
  const icon = { locker:'▪', cabinet:'▪', chest:'▬', crate:'▦',
                 shelf:'≡', barrel:'○', bag:'◇' }[type] || '▪';
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

function drawBuildingStairs(ctx, sx, groundY, dir) {
  const col = '#30283c';
  for (let i = 0; i < 4; i++) {
    const ox  = dir === 'up' ? i * 5 : (3 - i) * 5;
    const stepY = groundY - (i + 1) * 5;
    fillRect(ctx, sx + ox, stepY, 22 - i * 2, 5, col);
  }
  drawText(ctx, dir === 'up' ? '▲' : '▼', sx + 12, groundY - 24, '#6a5a88', 8, 'center');
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
  drawText(ctx, `Weapon: ${weapDef ? weapDef.name : 'none'}`, px + 8, ey + 8, weapDef ? C.textBright : C.textDim, 8);
  drawText(ctx, `Backpack: ${bpDef ? bpDef.name : 'none'}`, px + pw/2, ey + 8, bpDef ? C.textBright : C.textDim, 8);
  ey += 14;
  drawDivider(ctx, px + 4, ey, pw - 8, C.border2);
  ey += 4;

  const listH = ph - (ey - py) - 30;
  const rows = drawInventoryList(ctx, gs.parent.inventory, px + 4, ey, pw - 8, listH,
    `CARRYING  ${calcWeight(gs.parent.inventory).toFixed(1)}/${parentMaxCarry().toFixed(1)}kg`,
    es.invScroll || 0, mx, my);
  gs._exploreInvRows = rows;

  // Hint
  drawText(ctx, 'Click item to drop it.  Tap anywhere outside to close.', px + pw/2, py + ph - 8, C.textDim, 7, 'center');

  // Close button
  const closeX = px + pw - 54, closeY = py + ph - 20;
  drawButton(ctx, closeX, closeY, 50, 16, 'Close', hitTest(mx, my, closeX, closeY, 50, 16));
  gs._exploreInvClose = { x: closeX, y: closeY, w: 50, h: 16 };
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
    ['mall', 'hospital', 'factory', 'police', 'bunker', 'rooftop'].forEach(id => {
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

  // Save location state for persistence
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

  gs.parent.isExploring = false;
  gs.child.isAlone      = false;
  // Return companion
  if (gs.exploreCompanionId) {
    const comp = (gs.survivors || []).find(s => s.id === gs.exploreCompanionId);
    if (comp) comp.isExploring = false;
    gs.exploreCompanionId = null;
  }
  gs.suspicion = clamp(gs.suspicion + randInt(2, 5), 0, CFG.SUSPICION_MAX);
  addLog(`Returned from ${es.location?.name || 'exploration'}.`, 'info');
  gs.screenFade = { active: true, alpha: 0, phase: 'out', pendingFn: () => {
    exploreState = null;
    gs.keys      = {};
    gs.screen    = 'shelter';
    gs.zoomAnim  = { scale: 0.55, target: 1.0 };
  }};
}
