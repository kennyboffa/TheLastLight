// interior.js — Building floors and rooms: layout, furniture, doors, indoor enemies
'use strict';

// A building has floors; a floor can have rooms behind doorways. Floors and
// rooms are both "areas" with the same shape:
//   { width, containers[], furniture[], encounters[], exitX, stairsUpX,
//     stairsDownX, doors[] (floors), isRoom/label/backDoorX (rooms) }

// Rooms per building type: [min, max] and the kinds of room it has
// Rooms behind doorways, per building plan (a building's `plan`, else its theme)
const ROOM_PLAN = {
  house:    { n: [1, 2], kinds: ['Bedroom', 'Bathroom', 'Kitchen', 'Closet'] },
  urban:    { n: [2, 3], kinds: ['Apartment', 'Bedroom', 'Bathroom', 'Storage'] },   // apartment block
  office:   { n: [2, 3], kinds: ['Office', 'Meeting Room', 'Storage', 'Restroom'] },
  hospital: { n: [2, 3], kinds: ['Ward', 'Exam Room', 'Supply Room', 'Office'] },
  pharmacy: { n: [1, 1], kinds: ['Stock Room', 'Office'] },
  mall:     { n: [1, 2], kinds: ['Stock Room', 'Changing Room', 'Office'] },
  factory:  { n: [1, 2], kinds: ['Foreman Office', 'Tool Room', 'Locker Room'] },
  church:   { n: [1, 2], kinds: ['Vestry', 'Sacristy', 'Parish Office'] },
  crypt:    { n: [0, 1], kinds: ['Ossuary', 'Burial Chamber'] },
  cabin:    { n: [0, 1], kinds: ['Bedroom'] },
  shed:     { n: [0, 0], kinds: [] },
  storage:  { n: [1, 2], kinds: ['Storage', 'Tool Room'] },
  police:   { n: [2, 3], kinds: ['Holding Cell', 'Interrogation', 'Locker Room', 'Evidence Room', 'Office'] },
  bunker:   { n: [1, 2], kinds: ['Barracks', 'Armory', 'Radio Room', 'Storage'] },
  school:   { n: [2, 3], kinds: ['Classroom', 'Classroom', "Teachers' Room", 'Restroom'] },
  hall:     { n: [1, 2], kinds: ['Office', 'Meeting Room', 'Storage'] },
  shop:     { n: [1, 2], kinds: ['Stock Room', 'Back Office', 'Kitchen'] },
};

// Furniture groups per room kind (numbers are gaps in px)
const ROOM_FURNITURE = {
  'Bedroom':        [['s_bed_good', 4, 's_nightstand'], ['f_bookshelf']],
  'Bathroom':       [['s_medcab']],
  'Kitchen':        [['f_table'], ['s_shelf'], ['s_stove']],
  'Closet':         [['s_shelf'], ['s_crates']],
  'Apartment':      [['f_sofa'], ['f_table'], ['f_bookshelf']],
  'Storage':        [['s_shelf'], ['s_crates'], ['f_store_shelf']],
  'Stock Room':     [['f_store_shelf'], ['s_crates'], ['s_shelf']],
  'Supply Room':    [['f_med_shelf'], ['s_shelf']],
  'Tool Room':      [['s_workbench'], ['s_shelf']],
  'Office':         [['f_desk', 4, 'f_office_chair'], ['f_filing']],
  'Foreman Office': [['f_desk', 4, 'f_office_chair'], ['f_filing']],
  'Meeting Room':   [['f_office_chair', 6, 'f_table', 6, 'f_office_chair']],
  'Restroom':       [['s_medcab']],
  'Ward':           [['f_hospital_bed', 6, 'f_iv_stand'], ['s_medcab']],
  'Exam Room':      [['s_cot', 6, 'f_iv_stand'], ['f_med_shelf']],
  'Changing Room':  [['f_mannequin'], ['f_mannequin']],
  'Vestry':         [['f_bookshelf'], ['f_table']],
  'Sacristy':       [['s_shelf'], ['f_bookshelf']],
  'Parish Office':  [['f_desk', 4, 'f_office_chair'], ['f_bookshelf']],
  'Ossuary':        [['debris'], ['s_crates']],
  'Burial Chamber': [['f_church_cross'], ['debris']],
  'Holding Cell':   [['s_cot']],
  'Interrogation':  [['f_office_chair', 6, 'f_table', 6, 'f_office_chair']],
  'Locker Room':    [['s_shelf'], ['s_crates']],
  'Evidence Room':  [['s_shelf'], ['f_filing', 2, 'f_filing']],
  'Barracks':       [['s_cot', 8, 's_cot'], ['s_crates']],
  'Armory':         [['s_gunrack'], ['s_crates'], ['s_gunrack']],
  'Radio Room':     [['s_radio'], ['f_filing']],
  'Classroom':      [['f_table'], ['f_table'], ['f_bookshelf']],
  "Teachers' Room": [['f_table'], ['f_sofa'], ['f_bookshelf']],
  'Back Office':    [['f_desk', 4, 'f_office_chair'], ['f_filing']],
};

// Hallway furniture per building theme
const HALL_FURNITURE = {
  hospital: [['f_hospital_bed', 6, 'f_iv_stand'], ['f_wheelchair'], ['f_hospital_bed', 6, 'f_iv_stand']],
  office:   [['f_desk', 4, 'f_office_chair'], ['f_filing', 2, 'f_filing'], ['f_desk', 4, 'f_office_chair']],
  factory:  [['f_machine'], ['conveyor'], ['f_machine']],
  mall:     [['f_store_shelf', 4, 'f_store_shelf'], ['f_mannequin', 8, 'f_mannequin'], ['f_store_shelf']],
  house:    [['f_sofa'], ['f_table'], ['f_bookshelf']],
  cabin:    [['f_table'], ['f_bookshelf'], ['f_sofa']],
  pharmacy: [['f_med_shelf', 4, 'f_med_shelf'], ['f_med_shelf']],
  church:   [['f_church_cross'], ['f_pew'], ['f_pew'], ['f_pew']],
  urban:    [['debris'], ['f_table'], ['debris']],
  crypt:    [['debris'], ['f_church_cross'], ['debris']],
  police:   [['f_desk', 4, 'f_office_chair'], ['f_filing', 2, 'f_filing'], ['s_sandbags']],
  bunker:   [['s_sandbags'], ['s_crates'], ['s_barrel', 4, 's_barrel']],
  school:   [['f_table'], ['f_bookshelf'], ['f_table']],
  hall:     [['f_table'], ['f_bookshelf'], ['f_sofa']],
  shop:     [['f_store_shelf', 4, 'f_store_shelf'], ['f_table']],
  shed:     [['s_workbench'], ['s_shelf']],
  storage:  [['s_shelf'], ['s_crates'], ['s_barrel', 4, 's_barrel']],
  tent:     [['debris']],
};

// Sprite sizes (from tools/gen_art.py) so layout doesn't depend on load order
const FURN_SIZE = {
  f_hospital_bed: [64, 28], f_iv_stand: [14, 48], f_wheelchair: [26, 24], f_desk: [58, 42],
  f_office_chair: [20, 30], f_filing: [22, 42], f_machine: [62, 56], f_conveyor: [32, 14],
  f_store_shelf: [46, 54], f_med_shelf: [46, 54], f_mannequin: [16, 50], f_sofa: [56, 28],
  f_table: [56, 30], f_bookshelf: [34, 52], f_pew: [72, 24], f_church_cross: [44, 88],
  s_bed_good: [54, 22], s_nightstand: [12, 20], s_shelf: [44, 58], s_crates: [40, 34],
  s_workbench: [60, 40], s_medcab: [26, 44], s_cot: [50, 18], s_stove: [26, 20],
  debris: [52, 22], s_gunrack: [30, 44], s_radio: [52, 38], s_sandbags: [44, 18], s_barrel: [20, 26],
};

// Furniture you can search, and the container type it acts as
const SEARCHABLE_FURNITURE = {
  f_store_shelf: 'shelf', f_med_shelf: 'shelf', f_bookshelf: 'bookshelf',
  f_filing: 'cabinet', s_shelf: 'shelf', s_medcab: 'cabinet',
};

const DOOR_W = 35;   // matches f_door.png (taller than a person)

// ── Area helpers ──────────────────────────────────────────────────────────────

/** The floor or room the player is currently in. */
function curArea(es) {
  const bi = es.building;
  const fl = es.buildings[bi.bldgIdx].floors[bi.floorIdx];
  return (bi.roomIdx !== null && bi.roomIdx !== undefined) ? fl.rooms[bi.roomIdx] : fl;
}

/** Key for where things (bodies, blood) belong: outdoors or a specific floor/room. */
function areaKey(es) {
  if (!es || !es.building) return 'out';
  const bi = es.building;
  return `b${bi.bldgIdx}f${bi.floorIdx}r${bi.roomIdx === null || bi.roomIdx === undefined ? '-' : bi.roomIdx}`;
}

/** Camera scroll for an area: rooms narrower than the screen are centred. */
function areaScroll(area, x) {
  const vw = CFG.W / (EXPLORE_VIEW_ZOOM * INDOOR_ZOOM_MULT);   // areas are always indoors
  if (area.width <= vw) return -(vw - area.width) / 2;
  return clamp(x, 0, area.width - vw);
}

/** Right-hand limit for movement in combat (indoors: the area's width). */
function combatMaxX(gs) {
  const es = typeof exploreState !== 'undefined' ? exploreState : null;
  if (es && es.building) return curArea(es).width - 10;
  return CFG.WORLD_W - 10;
}

// ── Generation ────────────────────────────────────────────────────────────────

function _overlaps(x0, x1, busy, pad) {
  return busy.some(b => x1 > b[0] - pad && x0 < b[1] + pad);
}

/** Lay furniture groups across an area, avoiding `busy` [x0,x1] spans. */
function layoutFurniture(area, groups, busy, theme, quality, x0, x1) {
  let x = x0, i = 0, guard = 0;
  while (x < x1 && guard++ < 200) {
    const group = groups[i % groups.length];
    let gw = 0;
    const parts = [];
    for (const it of group) {
      if (typeof it === 'number') { gw += it; continue; }
      if (it === 'conveyor') { parts.push({ key: 'f_conveyor', x: gw, w: 96, repeat: 3 }); gw += 96; continue; }
      const sz = FURN_SIZE[it] || [30, 30];
      parts.push({ key: it, x: gw, w: sz[0] });
      gw += sz[0];
    }
    if (x + gw <= x1 && !_overlaps(x, x + gw, busy, 14)) {
      for (const pt of parts) {
        if (pt.repeat) {
          for (let k = 0; k < pt.repeat; k++) area.furniture.push({ key: pt.key, x: x + pt.x + k * 32 + 16 });
          continue;
        }
        const cx = x + pt.x + pt.w / 2;
        area.furniture.push({ key: pt.key, x: cx });
        const ctype = SEARCHABLE_FURNITURE[pt.key];
        if (ctype) {
          area.containers.push(_makeContainer(cx, ctype, theme, quality, pt.key));
        }
      }
      busy.push([x, x + gw]);
      x += gw + 50 + randInt(0, 60);
      i++;
    } else {
      x += 20;
    }
  }
}

function _makeContainer(x, type, theme, quality, furnitureKey) {
  return {
    wx: x, wy: GROUND_Y, type,
    furnitureKey: furnitureKey || null,
    searched: false, searching: false, searchProgress: 0,
    searchDuration: 1.5 + randFloat(0.5, 2.5),
    // 25-35% already picked clean by someone else
    loot: chance(furnitureKey ? 35 : 25) ? [] : rollBuildingLoot(theme, quality),
  };
}

// Enemy groups that can be met inside buildings (weights); machines are rare
// and only in harder places
function _indoorEnemyGroup(diff) {
  const options = [
    [35, ['raider']], [20, ['survivor_bandit']], [22, ['wild_dog']], [8, ['singularity_cultist']],
  ];
  if (diff >= 2) options.push([10, ['wild_dog', 'wild_dog']], [6, ['scout_drone']]);
  if (diff >= 3) options.push([8, ['raider', 'raider']], [4, ['patrol_robot']]);
  const total = options.reduce((s, o) => s + o[0], 0);
  let r = Math.random() * total;
  for (const [w, ids] of options) { if ((r -= w) <= 0) return ids; }
  return ['raider'];
}

function _maybeIndoorEncounter(area, enemyChance, diff, x0, x1) {
  if (!chance(enemyChance)) return;
  const ids = _indoorEnemyGroup(diff);
  const t = ENEMY_TEMPLATES[ids[0]];
  area.encounters.push({
    wx: Math.round(x0 + Math.random() * Math.max(10, x1 - x0)),
    ids, triggered: false, killed: false,
    previewSprite: t ? t.sprite : 'human_hostile',
  });
}

function _genRoom(kind, theme, quality, enemyChance, diff) {
  const width = 400 + randInt(0, 140);
  const room = {
    isRoom: true, label: kind, kind, width,
    backDoorX: 34,
    containers: [], furniture: [], encounters: [],
    exitX: null, stairsUpX: null, stairsDownX: null, doors: [],
  };
  const busy = [[room.backDoorX - 10, room.backDoorX + DOOR_W + 10]];
  layoutFurniture(room, ROOM_FURNITURE[kind] || [['s_crates']], busy, theme, quality, 90, width - 40);
  // plus 0-1 regular container
  if (chance(55)) {
    for (let tries = 0; tries < 20; tries++) {
      const x = 100 + randInt(0, width - 160);
      if (!_overlaps(x - 14, x + 14, busy, 10)) {
        room.containers.push(_makeContainer(x, randChoice(['box', 'chest', 'crate', 'locker']), theme, quality));
        busy.push([x - 14, x + 14]);
        break;
      }
    }
  }
  _maybeIndoorEncounter(room, enemyChance * 0.35, diff, width * 0.45, width - 60);
  return room;
}

// Floor length per kind of building: a cabin is one main room (plus maybe a
// bedroom), houses and shops are modest, big public buildings get the full hall.
const FLOOR_WIDTH = { cabin: 380, shed: 360, house: 620, shop: 620, pharmacy: 560, hall: 700, crypt: 520, storage: 560 };
function floorWidthFor(bdef) {
  if (bdef.width) return bdef.width;
  return FLOOR_WIDTH[bdef.plan] || FLOOR_WIDTH[bdef.theme] || BUILDING_W;
}

/** Build one floor: exit/stairs, room doors, furniture, containers, enemies. */
function genBuildingFloorArea(floorIdx, totalFloors, bdef, diff) {
  const theme   = bdef.theme || 'urban';
  const quality = bdef.lootQuality || 'light';
  const W = floorWidthFor(bdef);
  const fl = {
    width: W,
    exitX:       floorIdx === 0 ? 55 : null,
    stairsUpX:   floorIdx < totalFloors - 1 ? W - 110 : null,
    stairsDownX: floorIdx > 0 ? 110 : null,
    containers: [], furniture: [], encounters: [], doors: [], rooms: [],
  };
  // Spans already used by the exit door and stairs
  const busy = [];
  if (fl.exitX !== null) busy.push([fl.exitX - 6, fl.exitX + 30]);
  if (fl.stairsDownX !== null) busy.push([fl.stairsDownX - 4, fl.stairsDownX + 66]);
  if (fl.stairsUpX !== null) busy.push([fl.stairsUpX - 4, fl.stairsUpX + 66]);

  // Rooms behind doorways
  const plan = bdef.isTent ? null : (ROOM_PLAN[bdef.plan] || ROOM_PLAN[theme] || ROOM_PLAN.urban);
  if (plan) {
    const n = randInt(plan.n[0], plan.n[1]);
    const kinds = [...plan.kinds].sort(() => Math.random() - 0.5);
    for (let r = 0; r < n; r++) {
      for (let tries = 0; tries < 30; tries++) {
        const x = 180 + randInt(0, Math.max(0, W - 380));
        if (_overlaps(x, x + DOOR_W, busy, 70)) continue;
        const kind = kinds[r % kinds.length];
        fl.rooms.push(_genRoom(kind, theme, quality, bdef.enemyChance || 15, diff));
        fl.doors.push({ x, roomIdx: fl.rooms.length - 1, label: kind });
        busy.push([x - 4, x + DOOR_W + 4]);
        break;
      }
    }
  }

  // Hallway furniture (searchable shelves etc. become containers)
  layoutFurniture(fl, HALL_FURNITURE[bdef.plan] || HALL_FURNITURE[theme] || HALL_FURNITURE.urban, busy, theme, quality, 70, W - 70);

  // A few regular containers in the gaps
  const cCount = 1 + randInt(0, 1);
  const typesByTheme = {
    hospital: ['cabinet', 'locker', 'box'], factory: ['crate', 'box', 'barrel'],
    mall: ['locker', 'bag', 'box'], house: ['locker', 'chest', 'bag'],
    cabin: ['chest', 'bag', 'crate'], office: ['locker', 'cabinet', 'box'],
  };
  for (let i = 0; i < cCount; i++) {
    for (let tries = 0; tries < 30; tries++) {
      const cx = 90 + randInt(0, Math.max(0, W - 180));
      if (_overlaps(cx - 14, cx + 14, busy, 30)) continue;
      fl.containers.push(_makeContainer(cx, randChoice(typesByTheme[theme] || ['locker', 'crate', 'chest', 'bag']), theme, quality));
      busy.push([cx - 14, cx + 14]);
      break;
    }
  }

  // Someone (or something) may be inside
  _maybeIndoorEncounter(fl, (bdef.enemyChance || 15) * 0.5, diff, Math.min(320, Math.round(W * 0.55)), Math.max(Math.min(320, Math.round(W * 0.55)) + 10, W - 60));
  return fl;
}

// ── Indoor encounters ─────────────────────────────────────────────────────────

/** Check indoor enemies against the player; starts combat. Returns true if it did. */
function checkIndoorEncounters(gs, area, px) {
  for (const enc of area.encounters) {
    if (enc.triggered || enc.killed) continue;
    if (Math.abs(px - enc.wx) > encounterDetectPx(gs, enc, true)) continue;
    enc.triggered = true;
    let enemies;
    if (enc._savedEnemies) { enemies = enc._savedEnemies; enc._savedEnemies = null; }
    else enemies = enc.ids.map(id => deepClone(ENEMY_TEMPLATES[id])).filter(Boolean);
    if (!enemies.length) continue;
    gs.mouse.down = false;
    startCombat(gs, enemies, px, enc.wx);
    gs.combat._encRef = enc;
    // keep fighters inside the room, still one per tile
    const c = gs.combat;
    for (const e of c.enemies) {
      let x = e.worldX;
      while (x > area.width - 30) x -= TILE;
      while (x < 30) x += TILE;
      e.worldX = x;
    }
    gs.inCombat = true;
    return true;
  }
  return false;
}

// ── Drawing ───────────────────────────────────────────────────────────────────

function drawAreaFurniture(ctx, area, groundY) {
  for (const f of area.furniture) drawEnvSprite(ctx, f.key, f.x, groundY);
}

function drawRoomDoor(ctx, x, groundY, label, near, prompt) {
  if (!drawEnvSprite(ctx, 'f_door', x + DOOR_W / 2, groundY)) {
    fillRect(ctx, x, groundY - 34, DOOR_W, 34, '#0c0a08');
    strokeRect(ctx, x, groundY - 34, DOOR_W, 34, '#3a3026');
  }
  // The room's name only shows with the prompt, when you're at the door
  if (near) drawText(ctx, `${prompt} ${label}`, x + DOOR_W / 2, groundY - 64, C.textBright, 7, 'center');
}
