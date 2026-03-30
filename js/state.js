// state.js — Central game state
'use strict';

const GS = {
  // ── Screen ────────────────────────────────────────────────────────────────
  screen: 'title',   // title | intro | charCreate | shelter | explore | combat | event | gameOver | dayFade

  // ── Time ──────────────────────────────────────────────────────────────────
  day:  1,
  time: CFG.DAY_START,   // minutes since midnight
  paused: false,

  // ── Parent ────────────────────────────────────────────────────────────────
  parent: {
    name:    'Alex',
    gender:  'father',   // 'father' | 'mother'
    health:  25, maxHealth: 25,
    hunger:  20,
    thirst:  20,
    tiredness: 20,
    depression: 15,
    infected: false,
    trait: null,             // optional trait id (slow_metabolism, fast_healer, etc.)
    hasExploredToday: false,   // reset each morning; prevents multiple runs per day
    // Attributes
    strength: 5, agility: 5, perception: 5, intelligence: 5, charisma: 5,
    // Skills
    skills: { scavenging:1, stealth:1, exploration:1, bartering:1, speech:1, lockpick:1, melee:1, firearms:1 },
    // Inventory
    inventory: [],
    backpackId: null,    // item id of equipped backpack
    equipped: { weapon: null, armor: null },
    // Ammo tracking (rounds in magazine, spare ammo)
    ammo: { pistol: 0, rifle: 0, shotgun: 0 },
    loaded: { pistol: 0, rifle: 0, shotgun: 0 },
    // State flags
    isExploring: false,
    isSleeping:  false,
    isWorking:   false,
    wounded:     false,
    task: null,          // current shelter task
    taskProgress: 0,
    taskDuration: 0,
    // Progression
    level: 1, xp: 0, pendingSkillPts: 0,
    // Animation
    x: 115, y: 0, facing: 1, animFrame: 0, animTimer: 0,
  },

  // ── Child ─────────────────────────────────────────────────────────────────
  child: {
    name:   'Lily',
    health: 20, maxHealth: 20,
    hunger: 20,
    thirst: 20,
    tiredness: 25,
    depression: 15,
    isAlone: false,
    infected: false,
    isSleeping: false,
    task: null, taskProgress: 0, taskDuration: 0,
    // Attributes (child-appropriate)
    strength: 2, agility: 5, perception: 5, intelligence: 6, charisma: 6,
    // Skills (low; grow via XP)
    skills: { scavenging:1, stealth:2, exploration:1, bartering:1, speech:2, lockpick:1, melee:1, firearms:1 },
    // Progression
    level: 1, xp: 0, pendingSkillPts: 0,
    x: 65, y: 0, facing: 1, animFrame: 0, animTimer: 0,
  },

  // ── Survivors ─────────────────────────────────────────────────────────────
  survivors: [],   // array of survivor objects (same shape as parent minus attrs/skills)

  // ── Shelter ───────────────────────────────────────────────────────────────
  shelter: {
    rooms: [
      { id: 'main',      unlocked: true,  level: 1, building: false, buildProgress: 0 },
      { id: 'bedroom',   unlocked: true,  level: 1, building: false, buildProgress: 0 },  // unlocked from start
      { id: 'storage',   unlocked: false, level: 0, building: false, buildProgress: 0 },
      { id: 'workshop',  unlocked: false, level: 0, building: false, buildProgress: 0 },
      { id: 'infirmary', unlocked: false, level: 0, building: false, buildProgress: 0 },
      { id: 'security',  unlocked: false, level: 0, building: false, buildProgress: 0 },
    ],
    storage: [],
    storageMax: 80,
    defenseLevel: 0,
    hasWaterFilter:   false,
    hasGenerator:     false,
    hasRadioDampener: false,
    bedroomBed2: false,
    bedroomBed3: false,
    hasRaincatcher:   false,
    campfire: false,
    noiseBudget: 100,
    noiseToday: 0,
    // Drone patrol above shelter
    dronePatrol: { active: false, x: -30, dir: 1, timer: 0, nextPatrol: 300 },
  },

  // ── Weather ───────────────────────────────────────────────────────────────
  // nextRainDay: day number when next rain event is scheduled
  weather: { type: 'clear', timer: 0, nextChange: 4, rainAccum: 0, nextRainDay: 3, rainDuration: 0 },

  // ── Distant background drone (visual only, flies above bunker skyline) ───
  distantDrone: { x: -60, dir: 1, active: false, timer: 0, nextAppear: 900 },

  // ── Zoom ──────────────────────────────────────────────────────────────────
  zoom: 1.0,
  userScale: 1.0,   // user-adjustable display scale (set via Settings menu)

  // ── Dog ───────────────────────────────────────────────────────────────────
  dog: null,     // null | { name:'Rex', health:100, hunger:20, alive:true }

  // ── Suspicion ─────────────────────────────────────────────────────────────
  suspicion: 10,

  // ── Exploration state ─────────────────────────────────────────────────────
  explore: null,    // set when in explore screen

  // ── Combat state ──────────────────────────────────────────────────────────
  combat: null,

  // ── Current text event ────────────────────────────────────────────────────
  event: null,

  // ── Difficulty ────────────────────────────────────────────────────────────
  difficulty: 'normal',   // 'easy' | 'normal' | 'hard'

  // ── Flags ─────────────────────────────────────────────────────────────────
  flags: {
    dogEncountered:  false,
    dogRescued:      false,
    firstExplore:    false,
    traderMet:       false,
    // Story flags — each fires exactly once
    storyOpening:    false,  // day 1 opening
    storyFirstOut:   false,  // first time parent leaves to explore
    storyFirstRoom:  false,  // first new room built
    storyWounded:    false,  // returned wounded from exploration
    storyLateReturn: false,  // didn't come home before night
    storySuspicion:  false,  // suspicion crossed 50%
    storyChildren:   false,  // Lily wonders about other children
    storyWeekOne:    false,  // survived 7 days
    // Endgame flags
    lilySick:        false,  // Lily has fallen ill (day 15+)
    lilySickDay:     0,      // day sickness started
    lilyCured:       false,  // Lily has been given the antiviral
    antiviralFound:  false,  // antiviral has been found in hospital
    escapeReady:     false,  // escape event has been queued
    gameWon:         false,  // player completed the game
  },

  // ── Pending story queue (IDs from STORY_DB, fire next shelter opportunity) ──
  storyQueue: [],

  // ── Journal archives ──────────────────────────────────────────────────────
  seenStories: [],   // story IDs seen, in order (oldest first)
  readNotes:   [],   // { id, title, text } for world notes found and read

  // ── Crafting unlock system ────────────────────────────────────────────────
  // Recipes marked needsBlueprint:true are hidden until their blueprint is used
  unlockedRecipes: ['r_bandage', 'r_torch', 'r_spear'],  // always available

  // ── Location unlock system ────────────────────────────────────────────────
  unlockedLocations: ['forest', 'church'],
  foundMaps: { area_map_1: false, area_map_2: false },

  // ── Late return flag (player didn't come home before 23:00) ──────────────
  lateReturn: false,

  // ── Zoom animation ────────────────────────────────────────────────────────
  zoomAnim: { scale: 1.0, target: 1.0 },

  // ── Screen transition fade ────────────────────────────────────────────────
  screenFade: { active: false, alpha: 0, phase: 'idle', pendingFn: null },

  // ── Game log ──────────────────────────────────────────────────────────────
  log: [],    // { text, type, day, time }
  notifications: [],   // short on-screen messages: { text, type, ttl }

  // ── Day transition ────────────────────────────────────────────────────────
  dayFade: { active: false, alpha: 0, phase: 'out', timer: 0 },

  // ── UI input state ────────────────────────────────────────────────────────
  mouse: { x: 0, y: 0, down: false, clicked: false, clickX: 0, clickY: 0 },
  keys:  {},

  // ── Title screen ──────────────────────────────────────────────────────────
  title: {
    timer: 0, alpha: 0, textAlpha: 0, ready: false,
    dustX: null, dustY: null, dustS: null,
  },

  // ── Intro / char creation ─────────────────────────────────────────────────
  intro: {
    lineIdx: 0, charIdx: 0, timer: 0,
    done: false, waitForInput: false,
  },

  // ── Exploration companion ─────────────────────────────────────────────────
  exploreCompanionId: null,  // survivor id of companion on current exploration

  // ── Location persistence ──────────────────────────────────────────────────
  locationStates: {},   // { [locId]: saved container/loot/encounter state }

  // ── Companion missions ────────────────────────────────────────────────────
  missions: [],

  // ── Event cooldowns (last fired day per event id) ─────────────────────────
  eventLastFired: {},

  cc: {
    step: 0,     // 0=gender/name  1=attributes  2=skills
    gender: 'father',
    name:   '',
    attrPts: 2,   // distributable attribute points above base
    skillPts: 5,  // distributable skill points
    attrs:  { strength:5, agility:5, perception:5, intelligence:5, charisma:5 },
    skills: { scavenging:1, stealth:1, exploration:1, bartering:1, speech:1, lockpick:1, melee:1, firearms:1 },
    nameInputActive: false,
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────

function addLog(text, type) {
  GS.log.unshift({ text, type: type || 'normal', day: GS.day, time: GS.time });
  if (GS.log.length > 60) GS.log.pop();
  notify(text, type);
}

function notify(text, type) {
  GS.notifications.unshift({ text, type: type || 'normal', ttl: 220 });
  if (GS.notifications.length > 4) GS.notifications.pop();
}

function setScreen(name) {
  GS.screen = name;
}

function getRoom(id) {
  return GS.shelter.rooms.find(r => r.id === id);
}

function getRoomUnlocked(id) {
  return GS.shelter.rooms.find(r => r.id === id && r.unlocked);
}

function maxSurvivors(gs) {
  // Base 3, +1 per built room (excluding main and bedroom which start unlocked)
  const builtRooms = (gs.shelter.rooms || []).filter(
    r => r.id !== 'main' && r.id !== 'bedroom' && r.unlocked
  ).length;
  const extraBeds = (gs.shelter.bedroomBed2 ? 1 : 0) + (gs.shelter.bedroomBed3 ? 1 : 0);
  return 3 + builtRooms + extraBeds;
}

function parentTitle() {
  return GS.parent.gender === 'father' ? 'Father' : 'Mother';
}

function isDaytime() {
  return GS.time >= 7*60 && GS.time < 20*60;
}

// Total weight of an inventory array
function calcWeight(inv) {
  return inv.reduce((sum, slot) => {
    const def = getItemDef(slot.id);
    return def ? sum + def.weight * slot.qty : sum;
  }, 0);
}

function parentMaxCarry() {
  let base = 12 + GS.parent.strength * 1.5;
  if (GS.parent.backpackId) {
    const def = getItemDef(GS.parent.backpackId);
    if (def) base += def.carryBonus || 0;
  }
  return base;
}

function shelterStorageWeight() {
  return calcWeight(GS.shelter.storage);
}
