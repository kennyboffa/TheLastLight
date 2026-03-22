// explore.js — Side-scrolling exploration with buildings, containers, fog of war
'use strict';

const GROUND_Y    = 240;
const PLAYER_FOOT = GROUND_Y;
const BUILDING_W  = 900;   // interior width of each building floor

let exploreState = null;
let fogCanvas    = null;   // offscreen canvas for fog of war

// ── Fog of war ────────────────────────────────────────────────────────────────

function initFogCanvas() {
  fogCanvas = document.createElement('canvas');
  fogCanvas.width  = CFG.W;
  fogCanvas.height = CFG.H;
}

function renderFog(ctx, playerScreenX, playerScreenY, isIndoor) {
  if (!fogCanvas) initFogCanvas();
  const fc     = fogCanvas.getContext('2d');
  const radius = isIndoor ? CFG.FOG_RADIUS_IN : CFG.FOG_RADIUS_OUT;

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
      const bw     = 70 + randInt(0, 60);
      const bh     = 48 + randInt(10, 44);
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
      const bw = 48 + randInt(0, 28);
      const bh = 36 + randInt(0, 28);
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
  const containers = [];
  for (const zone of loc.zones) {
    const count = 2 + randInt(0, 2);
    for (let i = 0; i < count; i++) {
      const cx = zone.x + 50 + randInt(0, zone.w - 100);
      if (buildings.some(b => Math.abs(cx - (b.doorX + 8)) < 35)) continue;
      const types = ['crate', 'locker', 'chest', 'bag'];
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

  gs.parent.isExploring = true;
  gs.child.isAlone      = true;
  gs.screen             = 'explore';
  addLog(`Exploring: ${loc.name}`, 'info');

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

  // Movement
  const left  = gs.keys['a'] || gs.keys['arrowleft'];
  const right = gs.keys['d'] || gs.keys['arrowright'];
  if (left)       { es.velX = -CFG.PLAYER_SPEED; es.facing = -1; }
  else if (right) { es.velX =  CFG.PLAYER_SPEED; es.facing =  1; }
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
      if (enemies.length > 0) { startCombat(gs, enemies); gs.combat._encRef = enc; gs.screen = 'combat'; return; }
    }
  }

  // Random events
  for (const ev of es.events) {
    if (!ev.triggered && Math.abs(es.px - ev.wx) < ev.distance) {
      ev.triggered = true;
      const eventData = pickEvent(gs, 'explore');
      if (eventData) {
        gs.event = eventData; gs.screen = 'event'; gs._returnTo = 'explore'; return;
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

  const left  = gs.keys['a'] || gs.keys['arrowleft'];
  const right = gs.keys['d'] || gs.keys['arrowright'];
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
    if (!es.building) endExploration(gs);
    else notify('Find the exit door to leave the building.', 'info');
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

  // Return Home button
  if (hitTest(mx, my, 12, CFG.H - 55, 90, 16)) {
    if (es.building) notify('Find the exit door first.', 'warn');
    else endExploration(gs);
    return;
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
  drawNotifications(ctx, gs);
  drawDayTransition(ctx, gs);
}

function renderOutdoor(ctx, gs, es) {
  const loc = es.location;

  drawExploreBackground(ctx, es.scrollX, null, CFG.H);
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

  ctx.restore();

  // Fog of war (drawn over world, not over HUD)
  const playerScreenX = es.px - es.scrollX;
  renderFog(ctx, playerScreenX, PLAYER_FOOT - 12, false);

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

  ctx.restore();

  // Indoor fog (tighter radius)
  const playerScreenX = bi.px - bi.scrollX;
  renderFog(ctx, playerScreenX, PLAYER_FOOT - 12, true);
}

// ── HUD ───────────────────────────────────────────────────────────────────────

function drawExploreHUD(ctx, gs, es) {
  const loc = es.location;
  const mx = gs.mouse.x, my = gs.mouse.y;

  // Location / floor info panel
  drawPanel(ctx, 6, 6, 220, 30, C.panelBg);
  drawText(ctx, loc.name, 12, 18, C.text, 8);
  if (es.building) {
    const bi  = es.building;
    const bld = es.buildings[bi.bldgIdx];
    drawText(ctx, `${bld.label} — Floor ${bi.floorIdx + 1}`, 12, 30, C.textDim, 7);
  } else {
    const curZone = loc.zones.find(z => es.px >= z.x && es.px < z.x + z.w);
    if (curZone) drawText(ctx, curZone.name, 12, 30, C.textDim, 7);
  }

  // Pick-up hint
  if (!es.building) {
    const nearLoot = es.loot.find(item => !item.taken && Math.abs(es.px - item.wx) < 25);
    if (nearLoot) {
      const def = getItemDef(nearLoot.id);
      drawPanel(ctx, CFG.W / 2 - 70, CFG.H - 50, 140, 14, C.panelBg, C.border);
      drawText(ctx, `[E] ${def?.name || nearLoot.id}`, CFG.W / 2, CFG.H - 40, C.textDim, 7, 'center');
    }
    if (es.showReturnPrompt) {
      drawPanel(ctx, CFG.W / 2 - 80, CFG.H - 66, 160, 14, C.panelBg, C.border);
      drawText(ctx, '[E] Return to shelter', CFG.W / 2, CFG.H - 56, C.textDim, 7, 'center');
    }
  }

  // Carry weight
  const wt    = calcWeight(gs.parent.inventory).toFixed(1);
  const maxWt = parentMaxCarry().toFixed(1);
  const wtCol = parseFloat(wt) > parseFloat(maxWt) * 0.9 ? C.textWarn : C.textDim;
  drawText(ctx, `Carry: ${wt}/${maxWt}kg`, 12, CFG.H - 38, wtCol, 8);

  // Return Home button
  drawButton(ctx, 12, CFG.H - 55, 90, 16, 'Return Home', hitTest(mx, my, 12, CFG.H - 55, 90, 16));
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

  // Small weather icon top-right (not scrolled)
  const icon  = w === 'rain' ? '🌧' : w === 'cloudy' ? '☁' : '☀';
  drawText(ctx, icon, CFG.W - CFG.PANEL_W - 14, 16, C.textDim, 9, 'right');
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
  exploreState          = null;
  gs.screen             = 'shelter';
  gs.suspicion = clamp(gs.suspicion + randInt(2, 5), 0, CFG.SUSPICION_MAX);
  addLog(`Returned from ${es.location?.name || 'exploration'}.`, 'info');
}
