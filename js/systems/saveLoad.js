// saveLoad.js — Single-slot save / load via localStorage
'use strict';

const SAVE_KEY      = 'tll_save_v1';
const AUTOSAVE_KEY  = 'tll_autosave_v1';

// ── Profiles: each player on this computer has their own saves ───────────────
// The first profile ('default') uses the original keys so existing saves stay put.
const PROFILES_KEY = 'tll_profiles';
const ACTIVE_PROFILE_KEY = 'tll_active_profile';

function _lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function _lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function _lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

function listProfiles() {
  try {
    const list = JSON.parse(_lsGet(PROFILES_KEY) || 'null');
    if (Array.isArray(list) && list.length) return list;
  } catch (e) {}
  return [{ id: 'default', name: 'Player 1' }];
}
function _saveProfiles(list) { _lsSet(PROFILES_KEY, JSON.stringify(list)); }
function activeProfileId() {
  const id = _lsGet(ACTIVE_PROFILE_KEY);
  return id && listProfiles().some(p => p.id === id) ? id : listProfiles()[0].id;
}
function activeProfile() { return listProfiles().find(p => p.id === activeProfileId()) || listProfiles()[0]; }
function setActiveProfile(id) { _lsSet(ACTIVE_PROFILE_KEY, id); }
function createProfile(name) {
  const list = listProfiles();
  const p = { id: 'p' + Date.now().toString(36), name: (name || '').trim().slice(0, 16) || `Player ${list.length + 1}` };
  list.push(p); _saveProfiles(list); setActiveProfile(p.id);
  return p;
}
function deleteProfile(id) {
  let list = listProfiles();
  if (list.length <= 1) return false;
  _lsDel(_profileKey(SAVE_KEY, id)); _lsDel(_profileKey(AUTOSAVE_KEY, id));
  list = list.filter(p => p.id !== id); _saveProfiles(list);
  if (activeProfileId() === id || !list.some(p => p.id === activeProfileId())) setActiveProfile(list[0].id);
  return true;
}
function _profileKey(base, id) { id = id || activeProfileId(); return id === 'default' ? base : `${base}__${id}`; }
function _saveKey() { return _profileKey(SAVE_KEY); }
function _autoKey() { return _profileKey(AUTOSAVE_KEY); }

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
    localStorage.setItem(_saveKey(), JSON.stringify(data));
    notify('Game saved.', 'good');
    return true;
  } catch (e) {
    notify('Save failed: ' + e.message, 'danger');
    return false;
  }
}

/** Clear the current game back to a fresh state (keeping preferences), so a
 *  loaded save never inherits anything from the run that was just played. */
function _resetForLoad(gs) {
  if (typeof GS_INITIAL === 'undefined') return;
  const keep = { settings: gs.settings, userScale: gs.userScale, mouse: gs.mouse, keys: {} };
  for (const k of Object.keys(gs)) if (!(k in keep)) delete gs[k];
  Object.assign(gs, JSON.parse(JSON.stringify(GS_INITIAL)), keep);
}

function loadGame(gs) {
  try {
    const raw = localStorage.getItem(_saveKey());
    if (!raw) { notify('No save found.', 'warn'); return false; }
    const data = JSON.parse(raw);
    _resetForLoad(gs);
    // Restore all saved keys onto GS
    for (const key of Object.keys(data)) {
      if (key.startsWith('_save') || key === '_savedAt') continue;
      if (SKIP_FIELDS.includes(key)) continue;
      gs[key] = data[key];
    }
    _finishLoad(gs);
    notify('Game loaded — Day ' + gs.day + '.', 'good');
    return true;
  } catch (e) {
    notify('Load failed: ' + e.message, 'danger');
    return false;
  }
}

// Shared clean-up after restoring any save: always resume in the shelter with
// no exploration/combat in progress (autosaves can be written mid-exploration).
function _finishLoad(gs) {
  gs.screen   = 'shelter';
  gs.combat   = null;
  gs.inCombat = false;
  gs.isRaid   = false;
  gs.travel   = null;
  gs.event    = null;
  gs.explore  = null;
  gs.paused   = false;
  gs._returnTo = null;
  gs.dayFade    = { active: false, alpha: 0, phase: 'out', timer: 0 };
  gs.screenFade = { active: false, alpha: 0, phase: 'idle', pendingFn: null };
  gs.notifications = [];
  if (gs.parent) gs.parent.isExploring = false;
  if (!gs.runId) gs.runId = 'old' + Date.now().toString(36);   // saves from before run ids
  if (gs.parent && typeof normalizeEquipment === 'function') normalizeEquipment(gs.parent);
  if (gs.child)  gs.child.isAlone = false;
  for (const s of (gs.survivors || [])) s.isExploring = false;
  gs.exploreCompanionId = null;
  if (typeof exploreState !== 'undefined') exploreState = null;
  if (typeof shelterUI !== 'undefined') {
    shelterUI.activeMenu   = null;
    shelterUI.selectedRoom = null;
    shelterUI.selectedChar = null;
  }
  if (typeof eventUI !== 'undefined') {
    eventUI.resultText  = null;
    eventUI.resultTimer = 0;
  }
  Audio.stopCombatMusic();
  Audio.stopMusic();
  Audio.startShelterMusic();
}

function hasSave() {
  return !!localStorage.getItem(_saveKey());
}

function getSaveInfo() {
  try {
    const raw = localStorage.getItem(_saveKey());
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
    localStorage.setItem(_autoKey(), JSON.stringify(data));
  } catch (e) {
    // Silent — autosave failures shouldn't interrupt gameplay
  }
}

function loadAutosave(gs) {
  try {
    const raw = localStorage.getItem(_autoKey());
    if (!raw) { notify('No autosave found.', 'warn'); return false; }
    const data = JSON.parse(raw);
    _resetForLoad(gs);
    for (const key of Object.keys(data)) {
      if (key.startsWith('_save') || key === '_savedAt' || key === '_isAuto') continue;
      if (SKIP_FIELDS.includes(key)) continue;
      gs[key] = data[key];
    }
    _finishLoad(gs);
    notify('Autosave loaded — Day ' + gs.day + '.', 'good');
    return true;
  } catch (e) {
    notify('Autosave load failed: ' + e.message, 'danger');
    return false;
  }
}

function hasAutosave() {
  return !!localStorage.getItem(_autoKey());
}

function getAutosaveInfo() {
  try {
    const raw = localStorage.getItem(_autoKey());
    if (!raw) return null;
    const data = JSON.parse(raw);
    return { day: data._saveDay || 1, time: data._saveTime || 0, savedAt: data._savedAt || 0, runId: data.runId || null };
  } catch (e) {
    return null;
  }
}
