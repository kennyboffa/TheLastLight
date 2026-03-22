// main.js — Entry point, game loop, input routing
'use strict';

// ── Canvas setup ──────────────────────────────────────────────────────────────

const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');

let SCALE = 1;

function resizeCanvas() {
  const ww = window.innerWidth, wh = window.innerHeight;
  SCALE = Math.min(ww / CFG.W, wh / CFG.H);
  canvas.width  = CFG.W;
  canvas.height = CFG.H;
  canvas.style.width  = Math.floor(CFG.W * SCALE) + 'px';
  canvas.style.height = Math.floor(CFG.H * SCALE) + 'px';
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ── Input handling ────────────────────────────────────────────────────────────

function canvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / SCALE,
    y: (e.clientY - rect.top)  / SCALE,
  };
}

canvas.addEventListener('mousemove', (e) => {
  const { x, y } = canvasCoords(e);
  GS.mouse.x = x;
  GS.mouse.y = y;
});

canvas.addEventListener('mousedown', (e) => {
  const { x, y } = canvasCoords(e);
  GS.mouse.down   = true;
  GS.mouse.clickX = x;
  GS.mouse.clickY = y;
});

canvas.addEventListener('mouseup', (e) => {
  const { x, y } = canvasCoords(e);
  GS.mouse.down    = false;
  GS.mouse.clicked = true;
  GS.mouse.clickX  = x;
  GS.mouse.clickY  = y;
});

// ── Touch support (mobile) ────────────────────────────────────────────────────

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const t = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  const x = (t.clientX - rect.left) / SCALE;
  const y = (t.clientY - rect.top)  / SCALE;
  GS.mouse.x = x; GS.mouse.y = y;
  GS.mouse.down = true;
  GS.mouse.clickX = x; GS.mouse.clickY = y;
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const t = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  GS.mouse.x = (t.clientX - rect.left) / SCALE;
  GS.mouse.y = (t.clientY - rect.top)  / SCALE;
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  GS.mouse.down    = false;
  GS.mouse.clicked = true;
}, { passive: false });

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  GS.keys[key] = true;

  // Don't swallow typing in name input
  if (document.getElementById('name-input') === document.activeElement) return;

  handleKeyPress(key);
});

window.addEventListener('keyup', (e) => {
  GS.keys[e.key.toLowerCase()] = false;
});

function handleKeyPress(key) {
  if (key === 'enter' || key === ' ') {
    if (GS.screen === 'intro')      { introAdvance(); return; }
    if (GS.screen === 'gameOver')   { resetGame(); return; }
  }

  if (GS.screen === 'explore') {
    exploreKeyPress(key, GS);
    return;
  }

  if (GS.screen === 'event') {
    if (key >= '1' && key <= '9') {
      const idx = parseInt(key) - 1;
      const ev  = GS.event;
      if (ev && ev.choices && idx < ev.choices.length && !eventUI.resultText) {
        const choice = ev.choices[idx];
        const result = choice.action(GS);
        eventUI.resultText  = result || '';
        eventUI.resultTimer = 180;
      }
    }
    if (key === 'enter' && eventUI.resultText) closeEvent(GS);
    return;
  }

  if (GS.screen === 'shelter') {
    if (key === 'e') {
      // Feed Lily if hungry
      if (GS.child.hunger > 50) {
        const foodId = ['heated_beans','heated_soup','canned_beans','cooked_meat','canned_soup']
          .find(id => countInInventory(GS.shelter.storage, id) > 0);
        if (foodId) {
          removeFromInventory(GS.shelter.storage, foodId, 1);
          const def = getItemDef(foodId);
          GS.child.hunger = clamp(GS.child.hunger + (def.hunger || -20), 0, 100);
          notify(`Fed Lily: ${def.name}`, 'good');
        }
      }
    }
  }
}

// ── Main game loop ────────────────────────────────────────────────────────────

let lastTime   = 0;
let frameCount = 0;
const TARGET_FPS = 60;

function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05); // cap at 50ms
  lastTime = timestamp;
  frameCount++;

  ctx.clearRect(0, 0, CFG.W, CFG.H);
  ctx.imageSmoothingEnabled = false;

  try {
    update(dt);
    render(ctx);
  } catch (e) {
    // Show error on screen so it's visible even without devtools open
    ctx.fillStyle = '#0e0e18';
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    ctx.fillStyle = '#cc3333';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('ERROR: ' + e.message, 20, 40);
    ctx.fillStyle = '#666';
    ctx.font = '9px monospace';
    const lines = (e.stack || '').split('\n').slice(0, 8);
    lines.forEach((l, i) => ctx.fillText(l, 20, 60 + i * 12));
    ctx.textAlign = 'left';
    console.error(e);
    // Don't call requestAnimationFrame — freeze on error so it's readable
    return;
  }

  GS.mouse.clicked = false;
  requestAnimationFrame(gameLoop);
}

function update(dt) {
  const gs = GS;

  // Day transition takes priority
  if (gs.dayFade.active) return;

  // Stats tick (only in shelter/explore — not during events or combat transitions)
  if (!gs.paused && (gs.screen === 'shelter' || gs.screen === 'explore')) {
    tickStats(gs, dt);
    tickMissions(gs);
  }

  // Screen-specific update
  if (gs.screen === 'intro')      updateIntro(dt);
  if (gs.screen === 'explore')    updateExplore(gs, dt);

  // Shelter ambient events
  if (gs.screen === 'shelter') {
    maybeFireShelterEvent(gs);
    autoFeedLogic(gs);
    updateShelterAmbient(gs);
  }

  // Handle pending click
  if (gs.mouse.clicked) {
    handleClick(gs.mouse.clickX, gs.mouse.clickY, gs);
  }
}

function render(ctx) {
  const gs = GS;

  switch (gs.screen) {
    case 'intro':
      renderIntro(ctx, gs);
      break;
    case 'charCreate':
      renderCharCreate(ctx, gs);
      break;
    case 'shelter':
      renderShelter(ctx, gs);
      break;
    case 'exploreSelect':
      renderExploreSelect(ctx, gs);
      break;
    case 'packScreen':
      renderPackScreen(ctx, gs);
      break;
    case 'explore':
      renderExplore(ctx, gs);
      break;
    case 'combat':
      renderCombat(ctx, gs);
      break;
    case 'event':
      renderEvent(ctx, gs);
      break;
    case 'gameOver':
      renderGameOver(ctx, gs);
      break;
    default:
      fillRect(ctx, 0, 0, CFG.W, CFG.H, C.bg);
  }
}

function renderGameOver(ctx, gs) {
  drawGameOver(ctx, gs);
}

// ── Click routing ─────────────────────────────────────────────────────────────

function handleClick(mx, my, gs) {
  // Day transition / game over
  if (gs.dayFade.active) return;

  switch (gs.screen) {
    case 'intro':
      introAdvance();
      break;
    case 'charCreate':
      charCreateClick(mx, my, gs);
      break;
    case 'shelter':
      shelterClick(mx, my, gs);
      break;
    case 'exploreSelect':
      exploreSelectClick(mx, my, gs);
      break;
    case 'packScreen':
      packScreenClick(mx, my, gs);
      break;
    case 'explore':
      exploreClick(mx, my, gs);
      break;
    case 'combat':
      combatClick(mx, my, gs);
      break;
    case 'event':
      eventClick(mx, my, gs);
      break;
    case 'gameOver': {
      const bx = CFG.W/2 - 55, by = 200;
      if (hitTest(mx, my, bx, by, 110, 24)) resetGame();
      break;
    }
  }
}

// ── Auto feed logic (basic needs management hint) ─────────────────────────────

function autoFeedLogic(gs) {
  // Auto feed Lily if parent is present, storage has food, lily is hungry
  if (gs.parent.isExploring) return;
  const ch = gs.child;
  if (ch.hunger >= 70) {
    const foodOrder = ['heated_beans','heated_soup','cooked_meat','cooked_soup',
                       'canned_beans','canned_soup','canned_meat','energy_bar'];
    for (const fid of foodOrder) {
      if (countInInventory(gs.shelter.storage, fid) > 0) {
        removeFromInventory(gs.shelter.storage, fid, 1);
        const def = getItemDef(fid);
        ch.hunger    = clamp(ch.hunger    + (def.hunger    || -20), 0, 100);
        ch.thirst    = clamp(ch.thirst    + (def.thirst    ||   0), 0, 100);
        ch.depression= clamp(ch.depression+ (def.depression||   0), 0, 100);
        notify(`Lily ate ${def.name}.`, 'good');
        break;
      }
    }
  }
  // Auto drink for lily
  if (ch.thirst >= 70) {
    const waterOrder = ['purified_water','water_bottle','dirty_water'];
    for (const wid of waterOrder) {
      if (countInInventory(gs.shelter.storage, wid) > 0) {
        removeFromInventory(gs.shelter.storage, wid, 1);
        const def = getItemDef(wid);
        ch.thirst = clamp(ch.thirst + (def.thirst || -28), 0, 100);
        ch.health = clamp(ch.health + (def.health || 0), 0, ch.maxHealth);
        notify(`Lily drank ${def.name}.`, 'good');
        break;
      }
    }
  }
}

// ── Companion missions ────────────────────────────────────────────────────────

function tickMissions(gs) {
  for (const m of gs.missions) {
    if (m.status !== 'active') continue;
    const returnMinutes = m.returnDay * 1440 + m.returnTime;
    const nowMinutes    = gs.day * 1440 + gs.time;
    if (nowMinutes >= returnMinutes) {
      resolveMission(gs, m);
    }
  }
  // Clean up old resolved missions (keep last 5)
  gs.missions = gs.missions.filter(m => m.status === 'active').concat(
    gs.missions.filter(m => m.status !== 'active').slice(-5)
  );
}

function resolveMission(gs, m) {
  m.status = 'resolved';
  const survivor = gs.survivors.find(s => s.id === m.survivorId);
  if (survivor) survivor.onMission = false;

  // Small chance lost
  if (chance(m.lostChance)) {
    m.lost = true;
    if (survivor) {
      gs.survivors = gs.survivors.filter(s => s.id !== m.survivorId);
      addLog(`${m.survivorName} did not return from ${m.locName}.`, 'danger');
    }
    return;
  }

  // Injury chance
  if (chance(m.injuryChance) && survivor) {
    const dmg = randInt(10, 35);
    survivor.health = Math.max(5, survivor.health - dmg);
    m.injured = true;
    addLog(`${m.survivorName} returned injured from ${m.locName}.`, 'warn');
  } else {
    addLog(`${m.survivorName} returned from ${m.locName}.`, 'good');
  }

  // Add loot to shelter storage
  for (const item of m.loot) {
    addToInventory(gs.shelter.storage, item.id, item.qty);
  }
  if (m.loot.length > 0) {
    notify(`${m.survivorName} brought back ${m.loot.length} types of supplies.`, 'good');
  }
}

// ── Game reset ────────────────────────────────────────────────────────────────

function resetGame() {
  // Reset state
  Object.assign(GS, {
    screen: 'intro',
    day: 1,
    time: CFG.DAY_START,
    paused: false,
    parent: {
      name:'Alex', gender:'father',
      health:100, maxHealth:100,
      hunger:20, thirst:20, tiredness:20, depression:15,
      infected:false,
      strength:5, agility:5, perception:5, intelligence:5, charisma:5,
      skills:{scavenging:1,stealth:1,exploration:1,bartering:1,speech:1,lockpick:1,melee:1,firearms:1},
      inventory:[], backpackId:null,
      equipped:{weapon:null,armor:null},
      ammo:{pistol:0,rifle:0,shotgun:0},
      loaded:{pistol:0,rifle:0,shotgun:0},
      isExploring:false, isSleeping:false, isWorking:false,
      task:null, taskProgress:0, taskDuration:0,
      level:1, xp:0,
      x:115, y:0, facing:1, animFrame:0, animTimer:0,
    },
    child: {
      name:'Lily', health:80, maxHealth:80,
      hunger:20, thirst:20, tiredness:25, depression:15,
      isAlone:false, infected:false,
      isSleeping:false, task:null, taskProgress:0, taskDuration:0,
      strength:2, agility:5, perception:5, intelligence:6, charisma:6,
      skills:{scavenging:1,stealth:2,exploration:1,bartering:1,speech:2,lockpick:1,melee:1,firearms:1},
      level:1, xp:0,
      x:65, y:0, facing:1, animFrame:0, animTimer:0,
    },
    survivors: [],
    shelter: {
      rooms: [
        {id:'main',     unlocked:true,  level:1, building:false, buildProgress:0},
        {id:'bedroom',  unlocked:true,  level:1, building:false, buildProgress:0},
        {id:'storage',  unlocked:false, level:0, building:false, buildProgress:0},
        {id:'workshop', unlocked:false, level:0, building:false, buildProgress:0},
        {id:'infirmary',unlocked:false, level:0, building:false, buildProgress:0},
        {id:'security', unlocked:false, level:0, building:false, buildProgress:0},
      ],
      storage:[], storageMax:80, defenseLevel:0,
      hasWaterFilter:false, hasGenerator:false, hasRadioDampener:false,
      hasRaincatcher:false,
      campfire:false, noiseBudget:100, noiseToday:0,
      dronePatrol:{ active:false, x:-30, dir:1, timer:0, nextPatrol:300 },
    },
    dog:null, suspicion:10,
    explore:null, combat:null, event:null,
    missions:[],
    _pendingLoc: null,
    flags:{dogEncountered:false,dogRescued:false,firstExplore:false,traderMet:false},
    log:[], notifications:[],
    dayFade:{active:false,alpha:0,phase:'out',timer:0},
    weather:{ type:'clear', timer:0, nextChange:240, rainAccum:0 },
    zoom:1.0,
    mouse:{x:0,y:0,down:false,clicked:false,clickX:0,clickY:0},
    keys:{},
    gameOverReason: '',
  });
  initIntro();
  initCharCreate();
  // Reset shelter UI
  shelterUI.activeMenu   = null;
  shelterUI.selectedRoom = null;
  shelterUI.selectedChar = null;
  // Reset event UI
  eventUI.resultText  = null;
  eventUI.resultTimer = 0;
}

// ── Boot ──────────────────────────────────────────────────────────────────────

initIntro();
requestAnimationFrame(gameLoop);
