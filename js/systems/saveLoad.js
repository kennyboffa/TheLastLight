// saveLoad.js — Single-slot save / load via localStorage
'use strict';

const SAVE_KEY      = 'tll_save_v1';
const AUTOSAVE_KEY  = 'tll_autosave_v1';

// Fields that should NOT be persisted (runtime UI/input state or display prefs)
const SKIP_FIELDS = ['mouse', 'keys', 'dayFade', 'screenFade', 'notifications', 'intro', 'cc', 'userScale', 'zoomAnim'];

function saveGame(gs) {
  try {
    const data = {};
    for (const key of Object.keys(gs)) {
      if (SKIP_FIELDS.includes(key)) continue;
      // Skip non-serialisable internal bounds/cache keys
      if (key.startsWith('_')) continue;
      data[key] = gs[key];
    }
    data._savedAt = Date.now();
    data._saveDay = gs.day;
    data._saveTime = gs.time;
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    notify('Game saved.', 'good');
    return true;
  } catch (e) {
    notify('Save failed: ' + e.message, 'danger');
    return false;
  }
}

function loadGame(gs) {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) { notify('No save found.', 'warn'); return false; }
    const data = JSON.parse(raw);
    // Restore all saved keys onto GS
    for (const key of Object.keys(data)) {
      if (key.startsWith('_save') || key === '_savedAt') continue;
      if (SKIP_FIELDS.includes(key)) continue;
      gs[key] = data[key];
    }
    // Always restore to shelter screen after load
    gs.screen = 'shelter';
    gs.combat  = null;
    gs.event   = null;
    gs.explore = null;
    gs.paused  = false;
    gs.dayFade    = { active: false, alpha: 0, phase: 'out', timer: 0 };
    gs.screenFade = { active: false, alpha: 0, phase: 'idle', pendingFn: null };
    gs.notifications = [];
    // Reset any UI state
    if (typeof shelterUI !== 'undefined') {
      shelterUI.activeMenu   = null;
      shelterUI.selectedRoom = null;
      shelterUI.selectedChar = null;
    }
    if (typeof eventUI !== 'undefined') {
      eventUI.resultText  = null;
      eventUI.resultTimer = 0;
    }
    notify('Game loaded — Day ' + gs.day + '.', 'good');
    return true;
  } catch (e) {
    notify('Load failed: ' + e.message, 'danger');
    return false;
  }
}

function hasSave() {
  return !!localStorage.getItem(SAVE_KEY);
}

function getSaveInfo() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return {
      day:  data._saveDay  || 1,
      time: data._saveTime || 0,
      savedAt: data._savedAt || 0,
    };
  } catch (e) {
    return null;
  }
}

// ── Autosave (fires at the start of each new day) ─────────────────────────────

function autoSaveGame(gs) {
  try {
    const data = {};
    for (const key of Object.keys(gs)) {
      if (SKIP_FIELDS.includes(key)) continue;
      if (key.startsWith('_')) continue;
      data[key] = gs[key];
    }
    data._savedAt  = Date.now();
    data._saveDay  = gs.day;
    data._saveTime = gs.time;
    data._isAuto   = true;
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
  } catch (e) {
    // Silent — autosave failures shouldn't interrupt gameplay
  }
}

function loadAutosave(gs) {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) { notify('No autosave found.', 'warn'); return false; }
    const data = JSON.parse(raw);
    for (const key of Object.keys(data)) {
      if (key.startsWith('_save') || key === '_savedAt' || key === '_isAuto') continue;
      if (SKIP_FIELDS.includes(key)) continue;
      gs[key] = data[key];
    }
    gs.screen     = 'shelter';
    gs.combat     = null;
    gs.event      = null;
    gs.explore    = null;
    gs.paused     = false;
    gs.dayFade    = { active: false, alpha: 0, phase: 'out', timer: 0 };
    gs.screenFade = { active: false, alpha: 0, phase: 'idle', pendingFn: null };
    gs.notifications = [];
    if (typeof shelterUI !== 'undefined') {
      shelterUI.activeMenu   = null;
      shelterUI.selectedRoom = null;
      shelterUI.selectedChar = null;
    }
    if (typeof eventUI !== 'undefined') {
      eventUI.resultText  = null;
      eventUI.resultTimer = 0;
    }
    notify('Autosave loaded — Day ' + gs.day + '.', 'good');
    return true;
  } catch (e) {
    notify('Autosave load failed: ' + e.message, 'danger');
    return false;
  }
}

function hasAutosave() {
  return !!localStorage.getItem(AUTOSAVE_KEY);
}

function getAutosaveInfo() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return { day: data._saveDay || 1, time: data._saveTime || 0, savedAt: data._savedAt || 0 };
  } catch (e) {
    return null;
  }
}
