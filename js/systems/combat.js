// combat.js — In-world combat system (v0.27)
'use strict';

// Combat is on a line of tiles. One tile = one Move.
const COMBAT_STEP    = 40;   // px — one tile
const TILE           = COMBAT_STEP;
const MELEE_RANGE    = TILE + 8;        // px — adjacent tile (used by the companion and UI hints)
const FLEE_MIN_DIST  = 3 * TILE;        // px — must be at least 3 tiles from every enemy to flee

// AP cost and reach (in tiles) of each way to attack. Unarmed = '_fists'.
const WEAPON_COMBAT = {
  _fists:  { ap: 2, range: 1 },
  knife:   { ap: 2, range: 1 }, pipe:    { ap: 2, range: 1 }, axe: { ap: 3, range: 1 },
  machete: { ap: 3, range: 1 }, bat:     { ap: 3, range: 1 }, crowbar: { ap: 3, range: 1 },
  spear:   { ap: 2, range: 2 },                                  // long reach
  pistol:  { ap: 2, range: 6 }, shotgun: { ap: 3, range: 4 }, rifle:   { ap: 3, range: 10 },
};
const AP_COST = { move: 1, item: 1, reload: 2, flee: 2 };

function weaponCombatStats(id) {
  if (!id) return WEAPON_COMBAT._fists;
  if (WEAPON_COMBAT[id]) return WEAPON_COMBAT[id];
  const d = getItemDef(id);
  return d && d.weaponType === 'firearm' ? { ap: 2, range: 6 } : { ap: 2, range: 1 };
}
function playerAttackStats(gs) { return weaponCombatStats(gs.parent.equipped.weapon); }
function tilesBetween(a, b) { return Math.round(Math.abs(a - b) / TILE); }

// ── Bleeding ─────────────────────────────────────────────────────────────────
// Hits can open a bleeding wound (not on machines). In a fight a bleeder loses
// 1-3 HP every round; the player keeps bleeding afterwards (2 HP per game hour)
// until a bandage or medkit stops it.
const BLEED_WEAPONS = new Set(['knife', 'machete', 'axe', 'spear', 'pistol', 'rifle', 'shotgun']);
function bleedChance(weaponId, attacker) {
  if (attacker && attacker.type === 'animal') return 30;              // teeth and claws
  if (weaponId && BLEED_WEAPONS.has(weaponId)) return 30;             // blades and bullets
  return 12;                                                          // fists, clubs, pipes
}

// ── Plot Armor ───────────────────────────────────────────────────────────────
// With Plot Armor on: companions faint instead of dying, you faint instead of
// dying while your companion still stands, and bleeding stops at 5 HP.
function plotArmor(gs) { return !!gs.plotArmor; }
function _companionStanding(c) { return !!(c.companion && !c.compDown && !c.compDead); }

/** You hit 0 HP. Returns true if you only fainted (Plot Armor with a companion standing). */
function _playerFalls(gs, fromX, impact, cause) {
  const c = gs.combat;
  if (plotArmor(gs) && _companionStanding(c)) {
    c.player.hp = 0;
    gs.parent.health = 1;            // out cold, not dead (keeps the general death check away)
    c.playerDown = true;
    c.playerDeathT0 = Date.now() + (impact || 0); c.playerDeathDir = fromX > c.playerWx ? -1 : 1;
    combatLog(gs, `${gs.parent.name} collapses! ${c.companion.name} fights on.`, 'danger');
    return true;
  }
  _fx(gs, 'death', 'player', 0, fromX, (impact || 0) + 20);
  c.phase = 'defeat';
  combatLog(gs, cause || `${gs.parent.name} has fallen.`, 'danger');
  c.pendingAction = 'defeat'; c.pendingTimer = 1.6 + (impact || 0) / 1000;
  return false;
}

/** Bleeding damage at the start of a round. Returns true if it killed. */
function _bleedTick(gs, who) {
  const c = gs.combat;
  let dmg = randInt(1, 3);
  if (who === 'player') {
    if (c.playerDown) return false;
    if (plotArmor(gs)) {                                   // bleeding can't take you below 5 HP
      dmg = Math.min(dmg, Math.max(0, c.player.hp - 5));
      if (dmg <= 0) return false;
    }
    c.player.hp -= dmg;
    gs.parent.health = Math.max(0, gs.parent.health - dmg);
    _fx(gs, 'bleed', 'player', dmg, c.playerWx, 0);
    combatLog(gs, `${gs.parent.name} is bleeding (-${dmg}).`, 'danger');
    if (c.player.hp <= 0) return !_playerFalls(gs, c.playerWx + 1, 0, `${gs.parent.name} bled out.`);
    return false;
  }
  who.hp -= dmg;
  _fx(gs, 'bleed', who, dmg, who.worldX, 0);
  combatLog(gs, `${who.name} bleeds (-${dmg}).`, 'good');
  if (who.hp <= 0) {
    who.dead = true;
    _fx(gs, 'death', who, 0, who.worldX + 1, 60);
    combatLog(gs, `${who.name} bled out.`, 'good');
    collectLoot(gs, who);
    const _xp = { machine: 20, human: 15, animal: 10 };
    giveXP(gs.parent, Math.round((_xp[who.type] || 12) * (who.isBoss ? 3 : 1)), gs);
    return true;
  }
  return false;
}

function _startPlayerBleeding(gs, why) {
  if (gs.parent.bleeding) return;
  gs.parent.bleeding = true;
  combatLog(gs, why || `${gs.parent.name} is bleeding!`, 'danger');
  notify('Bleeding: use a bandage to stop it.', 'danger');
}

// Enemies: an attack costs 2 AP (bosses 3); shooters reach 6 tiles, everyone else 1
function enemyAttackAp(e) { return e.atkAp || (e.isBoss ? 3 : 2); }
function enemyRangeTiles(e) { return e.isRanged ? (e.rangeTiles || 6) : 1; }

/** Is world-x tile `x` taken by someone other than `self`? */
function _tileTaken(c, x, self) {
  const near = v => Math.abs(v - x) < TILE / 2;
  if (self !== 'player' && near(c.playerWx)) return true;
  if (self !== 'comp' && c.companion && !c.compDown && near(c.compWx)) return true;
  return c.enemies.some(e => e !== self && !e.dead && near(e.worldX));
}

/** Put a combatant on the grid (relative to where the fight started), on a free tile. */
function _snapToGrid(c, x, self, dirIfTaken) {
  let t = c.gridOrigin + Math.round((x - c.gridOrigin) / TILE) * TILE;
  for (let i = 0; i < 12 && _tileTaken(c, t, self); i++) t += (dirIfTaken || 1) * TILE;
  return t;
}

/** Spend player AP; the turn passes when it runs out. */
function _spendPlayerAp(gs, n) {
  const c = gs.combat;
  c.playerAp = Math.max(0, c.playerAp - n);
  if (c.playerAp <= 0 && c.phase === 'action') { c.turn = 'enemy'; c.pendingAction = 'enemy'; c.pendingTimer = 0.7; }
}
const CFG_COMBAT_INTRO = 1.2; // s — freeze with "COMBAT" banner when a fight starts

// Melee weapons wear out: number of swings before they break (repair at the workshop)
const WEAPON_DURABILITY = { knife: 40, machete: 45, crowbar: 70, pipe: 50, bat: 35, spear: 30, axe: 60 };

function weaponCondition(p, id) {
  if (!WEAPON_DURABILITY[id]) return null;
  p.weaponWear = p.weaponWear || {};
  if (p.weaponWear[id] === undefined) p.weaponWear[id] = WEAPON_DURABILITY[id];
  return p.weaponWear[id];
}

function _wearWeapon(gs, id) {
  const p = gs.parent;
  if (weaponCondition(p, id) === null) return;
  p.weaponWear[id] -= 1;
  const left = p.weaponWear[id];
  const name = getItemDef(id).name;
  if (left === Math.floor(WEAPON_DURABILITY[id] * 0.2)) notify(`${name} is badly worn — repair it at the workshop.`, 'warn');
  if (left <= 0) {
    combatLog(gs, `${name} breaks!`, 'danger');
    notify(`Your ${name} broke!`, 'danger');
    if (typeof Audio.breakWeapon === 'function') Audio.breakWeapon();
    if (p.equipped.weapon === id) p.equipped.weapon = null;   // the equipped one is held, not in the bag
    delete p.weaponWear[id];
  }
}

// AP per enemy turn: 2 + floor(agility / 3)
function enemyMaxAp(enemy) {
  return 2 + Math.floor((enemy.agility || 3) / 3);
}

// Build combat state. playerWx/encounterWx are world-x positions.
function startCombat(gs, enemies, playerWx, encounterWx) {
  const p = gs.parent;

  const playerCombatant = {
    isPlayer: true,
    name: p.name,
    hp: p.health, maxHp: p.maxHealth,
    armor: 0,
    accuracy: CFG.BASE_HIT_CHANCE + p.skills.melee * 2,
    ap: 4, maxAp: 4,
    weapon: p.equipped.weapon,
    dead: false,
    magazine: 0, magazineSize: 0, ammoType: null,
  };

  if (p.equipped.weapon) {
    const wd = getItemDef(p.equipped.weapon);
    if (wd) {
      if (wd.weaponType === 'firearm') {
        playerCombatant.magazine     = p.loaded[wd.ammoType] || 0;
        playerCombatant.magazineSize = wd.magazineSize || 8;
        playerCombatant.ammoType     = wd.ammoType;
        playerCombatant.accuracy     = CFG.BASE_HIT_CHANCE + p.skills.firearms * 3;
      } else {
        playerCombatant.accuracy = CFG.BASE_HIT_CHANCE + p.skills.melee * 3;
      }
    }
  }

  // Space enemies out around the encounter world position.
  // If an enemy already has worldX (re-used from a fled combat) preserve it.
  const count = enemies.length;
  const enemyCombatants = enemies.map((e, i) => ({
    ...e,
    isPlayer: false,
    index: i,
    dead: false,
    aiTimer: randInt(0, 2),
    worldX: (e.worldX !== undefined)
      ? e.worldX
      : (encounterWx || (playerWx + 200)) + (i - (count - 1) / 2) * 55,
  }));

  const companionData = gs.exploreCompanionId
    ? (gs.survivors || []).find(s => s.id === gs.exploreCompanionId) || null
    : null;

  gs.combat = {
    player: playerCombatant,
    enemies: enemyCombatants,
    companion: companionData,
    turn: 'player',
    log: [],
    phase: 'action',
    selectedAction: null,
    targetIdx: 0,
    resultText: '',
    resultTimer: 0,
    fleeAttempted: false,
    victoryLoot: [],
    pendingAction: null,
    pendingTimer: 0,
    // World-space positions
    playerWx: playerWx || 80,
    playerAp: 4,   // AP remaining this player turn
    ambush: false,      // set below: snuck up on them (first strike bonus)
    surprised: false,   // set below: they caught you sneaking badly (they go first, +2 dmg)
    // Companion stands beside you, on the side away from the enemies
    compWx: (playerWx || 80) + (((encounterWx || playerWx + 200) >= (playerWx || 80)) ? -24 : 24),
    compDown: false, compHealed: false,
    introTimer: CFG_COMBAT_INTRO, // brief freeze + "COMBAT" banner before anyone acts
  };

  // Stop the player dead: held movement keys must not carry into the fight
  gs.keys = {};
  gs.mouse.down = false;
  if (typeof exploreState !== 'undefined' && exploreState) {
    exploreState.velX = 0;
    exploreState.animFrame = 0;
  }

  // Line everyone up on tiles: enemies at least one tile away, each on its own tile
  const c0 = gs.combat;
  c0.gridOrigin = c0.playerWx;
  const side = (encounterWx || c0.playerWx + 200) >= c0.playerWx ? 1 : -1;
  c0.compWx = c0.playerWx - side * TILE;
  for (const e of c0.enemies) {
    let x = e.worldX;
    if (Math.abs(x - c0.playerWx) < TILE) x = c0.playerWx + side * TILE;
    e.worldX = _snapToGrid(c0, x, e, side);
  }

  _rollCombatOpening(gs, enemyCombatants);
  Audio.startCombatMusic();
}

// Who acts first. Sneaking is a stealth check: a good sneak ambushes (bonus to
// the first hit that grows with the skill); a clumsy one can be caught by
// surprise (enemies act first and hit 2 harder that round). Otherwise the
// side with the highest agility starts.
function _rollCombatOpening(gs, enemies) {
  const c = gs.combat, p = gs.parent;
  const stealth = (p.skills && p.skills.stealth) || 1;
  if (p.sneaking) {
    const sneakOk = clamp(25 + stealth * 12 + (p.agility || 5) * 2 - (gs.difficulty === 'hard' ? 10 : 0), 10, 95);
    if (chance(sneakOk)) {
      c.ambush = true;
      c.ambushBonus = 10 + Math.min(30, stealth * 4);
    } else if (chance(clamp(45 - stealth * 8, 0, 40))) {
      c.surprised = true;
    }
  } else if (chance(15)) {
    // walking in openly: 15% chance they saw you first and jump you
    c.surprised = true;
  }
  const pAgi = p.agility || 5;
  const fastest = enemies.reduce((a, e) => ((e.agility || 3) > (a.agility || 3) ? e : a), enemies[0] || {});
  const enemyAgi = fastest.agility || 3;
  const playerFirst = c.ambush || (!c.surprised && pAgi >= enemyAgi);
  c.firstTurn = playerFirst ? 'player' : 'enemy';
  if (c.ambush) {
    combatLog(gs, `You catch them off guard! First strike +${c.ambushBonus}% to hit.`, 'good');
    c.openerText = 'AMBUSH';
  } else if (c.surprised) {
    combatLog(gs, p.sneaking ? 'They heard you coming. Caught by surprise!' : 'They saw you first. Caught by surprise!', 'danger');
    c.openerText = 'CAUGHT BY SURPRISE';
  } else if (!playerFirst) {
    combatLog(gs, `${fastest.name || 'They'} ${enemies.length > 1 ? 'are' : 'is'} quicker and acts first.`, 'warn');
    c.openerText = 'ENEMY TURN';
  } else {
    combatLog(gs, p.sneaking ? 'Spotted. You are quicker, though.' : 'Combat started! You are quicker.', 'warn');
    c.openerText = 'YOUR TURN';
  }
  if (!playerFirst) {
    // enemies move right after the "COMBAT" freeze
    c.turn = 'enemy';
    c.pendingAction = 'enemy';
    c.pendingTimer = 0.35;
  }
}

// Visual effects hook (blood, sparks, damage numbers, deaths) — implemented
// by the exploration renderer; delayMs staggers effects of simultaneous attacks.
function _fx(gs, type, who, amount, fromX, delayMs) {
  if (typeof combatFx === 'function') combatFx(gs, type, who, amount || 0, fromX, delayMs || 0);
}

function combatLog(gs, text, type) {
  if (!gs.combat) return;
  gs.combat.log.unshift({ text, type: type || 'normal' });
  if (gs.combat.log.length > 8) gs.combat.log.pop();
}

// ── Player actions ────────────────────────────────────────────────────────────

function _playerMove(gs, dir) {
  const c = gs.combat;
  if (c.turn !== 'player' || c.phase !== 'action') return;
  if (c.playerAp < AP_COST.move) { combatLog(gs, 'No AP left to move.', 'warn'); return; }
  const maxX = typeof combatMaxX === 'function' ? combatMaxX(gs) : CFG.WORLD_W - 10;
  const nx = c.playerWx + dir * TILE;
  if (nx < 10 || nx > maxX) { combatLog(gs, "Can't go further.", 'warn'); return; }
  if (c.enemies.some(e => !e.dead && Math.abs(e.worldX - nx) < TILE / 2)) { combatLog(gs, 'Blocked by an enemy.', 'warn'); return; }
  c.playerWx = nx;
  if (c.companion && !c.compDown && Math.abs(c.compWx - nx) < TILE / 2) c.compWx -= dir * TILE;   // swap past your companion
  combatLog(gs, dir < 0 ? 'Moved left.' : 'Moved right.', 'normal');
  _spendPlayerAp(gs, AP_COST.move);
}
function playerMoveLeft(gs)  { _playerMove(gs, -1); }
function playerMoveRight(gs) { _playerMove(gs, 1); }

function playerEndTurn(gs) {
  const c = gs.combat;
  if (c.turn !== 'player' || c.phase !== 'action') return;
  c.turn = 'enemy';
  c.pendingAction = 'enemy'; c.pendingTimer = 0.5;
}

// Player's chance to hit `target` with the equipped weapon (%, 10–90).
// Weapon accuracy and skill help; the target's agility (dodging), darkness and
// long gun range hurt.
function playerHitChance(gs, target) {
  const c = gs.combat, p = gs.parent;
  const weapDef  = p.equipped.weapon ? getItemDef(p.equipped.weapon) : null;
  const isRanged = weapDef && weapDef.weaponType === 'firearm';
  let hit;
  if (weapDef) hit = weapDef.accuracy * 0.9 + (isRanged ? p.skills.firearms : p.skills.melee) * 4;
  else         hit = 60 + p.skills.melee * 4;
  hit += p.agility;
  hit -= (target.agility || 3) * 2;
  if (nightFactor(gs.time) > 0.5 && p.trait !== 'night_owl') hit -= 10;
  if (c && c.ambush) hit += c.ambushBonus || 20;     // they haven't noticed you yet (better sneak, bigger bonus)
  if (isRanged && c && target.worldX !== undefined) {
    // accurate out to half the weapon's reach, then -6% per tile
    const tiles = tilesBetween(c.playerWx, target.worldX), half = Math.ceil(weaponCombatStats(weapDef.id).range / 2);
    if (tiles > half) hit -= (tiles - half) * 6;
  }
  return Math.round(clamp(hit, 10, 90));
}

function playerAttack(gs, targetIdx) {
  const c  = gs.combat;
  const p  = gs.parent;
  const target = c.enemies[targetIdx];
  if (!target || target.dead) return;

  const weapDef  = p.equipped.weapon ? getItemDef(p.equipped.weapon) : null;
  const isRanged = weapDef && weapDef.weaponType === 'firearm';

  // Reach (tiles) and AP cost depend on the weapon
  const ws = weaponCombatStats(weapDef ? weapDef.id : null);
  if (gs.inCombat && tilesBetween(c.playerWx, target.worldX) > ws.range) {
    combatLog(gs, ws.range === 1 ? 'Too far — get next to them!' : `Out of range (${ws.range} tiles).`, 'warn');
    return;
  }
  if (c.playerAp < ws.ap) { combatLog(gs, `Need ${ws.ap} AP to attack.`, 'warn'); return; }

  let dmgMin = 4, dmgMax = 9, hit = c.player.accuracy;

  if (weapDef) {
    // melee weapons hit harder with strength (+1 per 2 STR above 4)
    const strBonus = isRanged ? 0 : Math.max(0, Math.floor((p.strength - 4) / 2));
    dmgMin = weapDef.damage[0] + strBonus;
    dmgMax = weapDef.damage[1] + strBonus;
    if (isRanged) {
      if (c.player.magazine <= 0) { combatLog(gs, 'Need to reload!', 'warn'); return; }
      c.player.magazine--;
      p.loaded[weapDef.ammoType] = c.player.magazine;
    }
  } else {
    // fists: weaker than any weapon
    dmgMin = 1 + Math.floor(p.strength / 3);
    dmgMax = 2 + Math.floor(p.strength / 2);
  }

  if (p.trait === 'night_owl') {
    const nf   = nightFactor(gs.time);
    const mult = nf > 0.5 ? 1.20 : 0.90;
    dmgMin = Math.max(1, Math.round(dmgMin * mult));
    dmgMax = Math.max(1, Math.round(dmgMax * mult));
  }

  hit = playerHitChance(gs, target);

  c.playerAnimT0 = Date.now();   // swing / muzzle flash on the held weapon
  c.lastShotTo   = target.worldX;
  const ambushHit = c.ambush;
  c.ambush = false;
  if (weapDef && !isRanged) _wearWeapon(gs, weapDef.id);
  // Gunfire is loud: nearby enemies come running, and the AI hears it too
  if (isRanged) {
    gs.suspicion = clamp(gs.suspicion + 1, 0, CFG.SUSPICION_MAX);
    if (typeof gunNoise === 'function') gunNoise(gs);
  }
  if (chance(hit)) {
    const raw    = Math.round(randInt(dmgMin, dmgMax) * (ambushHit ? 1.5 : 1));
    // armor absorbs half its value, so light weapons still matter against armored targets
    const damage = Math.max(1, raw - Math.floor((target.armor || 0) / 2));
    target.hp   -= damage;
    _fx(gs, 'hit', target, damage, c.playerWx, isRanged ? 60 : 200);
    combatLog(gs, `${p.name} hits ${target.name} for ${damage} dmg.`, 'good');
    Audio.hit();
    if (target.hp > 0 && !target.bleeding && target.type !== 'machine' && chance(bleedChance(weapDef ? weapDef.id : null))) {
      target.bleeding = true;
      combatLog(gs, `${target.name} is bleeding!`, 'good');
    }
    if (target.hp <= 0) {
      target.dead = true;
      _fx(gs, 'death', target, 0, c.playerWx, isRanged ? 80 : 220);
      combatLog(gs, `${target.name} destroyed.`, 'good');
      collectLoot(gs, target);
      const _xp = { machine:20, human:15, animal:10 };
      giveXP(gs.parent, Math.round((_xp[target.type] || 12) * (target.isBoss ? 3 : 1)), gs);
      Audio.loot();
    }
  } else {
    combatLog(gs, `${p.name} misses ${target.name}.`, 'normal');
    _fx(gs, 'miss', target, 0, c.playerWx, isRanged ? 60 : 200);
    Audio.miss();
  }

  if (checkCombatVictory(gs)) return;

  c.busyUntil = Date.now() + 450;      // let the swing / shot play out
  _spendPlayerAp(gs, ws.ap);
}

function playerReload(gs) {
  const c  = gs.combat;
  const p  = gs.parent;
  const wd = p.equipped.weapon ? getItemDef(p.equipped.weapon) : null;
  if (!wd || wd.weaponType !== 'firearm') { combatLog(gs, 'Nothing to reload.', 'warn'); return; }
  const spares = p.ammo[wd.ammoType] || 0;
  if (spares <= 0) { combatLog(gs, 'No spare ammo!', 'danger'); return; }
  if (c.playerAp < AP_COST.reload) { combatLog(gs, `Need ${AP_COST.reload} AP to reload.`, 'warn'); return; }
  const needed = c.player.magazineSize - c.player.magazine;
  const loaded = Math.min(needed, spares);
  c.player.magazine    += loaded;
  p.loaded[wd.ammoType] = c.player.magazine;
  p.ammo[wd.ammoType]  -= loaded;
  combatLog(gs, `Reloaded (${c.player.magazine}/${c.player.magazineSize}).`, 'good');
  _spendPlayerAp(gs, AP_COST.reload);
}

function playerUseItem(gs, itemId) {
  const c   = gs.combat;
  const p   = gs.parent;
  const inv = p.inventory;
  if (countInInventory(inv, itemId) < 1) { combatLog(gs, 'Item not found.', 'warn'); return; }
  if (c.playerAp < AP_COST.item) { combatLog(gs, 'No AP left.', 'warn'); return; }
  const def = getItemDef(itemId);
  useItem(p, inv, itemId, gs);
  combatLog(gs, `Used ${def.name}.`, 'good');
  c.player.hp = clamp(p.health, 0, p.maxHealth);
  if (itemId === 'medkit' && p.wounded && p.health / p.maxHealth >= 0.5) {
    p.wounded = false;
    combatLog(gs, 'Wounds treated.', 'good');
  }
  _spendPlayerAp(gs, AP_COST.item);
}

function playerFlee(gs) {
  const c = gs.combat;
  const p = gs.parent;

  // Distance check when fighting in the world
  if (gs.inCombat) {
    const alive = c.enemies.filter(e => !e.dead);
    const minDist = alive.length > 0
      ? Math.min(...alive.map(e => Math.abs(c.playerWx - e.worldX)))
      : 999;
    if (minDist < FLEE_MIN_DIST - TILE / 2) {
      combatLog(gs, `Too close to flee! Get ${Math.max(1, Math.ceil((FLEE_MIN_DIST - minDist) / TILE))} more tile(s) away.`, 'warn');
      return;
    }
    if (c.playerAp < AP_COST.flee) {
      combatLog(gs, `Need ${AP_COST.flee} AP to attempt flee.`, 'warn');
      return;
    }
    c.playerAp -= AP_COST.flee;
  }

  const fleeChance = 30 + p.agility * 6 + p.skills.stealth * 4;
  if (chance(fleeChance)) {
    combatLog(gs, 'Escaped!', 'good');
    c.phase = 'fled';
    c.pendingAction = 'fled'; c.pendingTimer = 1.0;
  } else {
    combatLog(gs, 'Couldn\'t escape!', 'danger');
    _spendPlayerAp(gs, 0);
  }
}

// ── Enemy turn ────────────────────────────────────────────────────────────────

function enemyTurn(gs) {
  const c = gs.combat;
  if (!c || c.phase !== 'action') return;

  c.ambush = false;
  // Bleeding enemies lose blood before they act
  for (const enemy of c.enemies) {
    if (!enemy.dead && enemy.bleeding) _bleedTick(gs, enemy);
  }
  if (checkCombatVictory(gs)) return;
  let attackOrder = 0;   // stagger attack animations so each one is visible
  for (const enemy of c.enemies) {
    if (c.phase !== 'action') return;
    if (enemy.dead) continue;

    let ap = enemyMaxAp(enemy);
    let attacks = 0;
    const atkAp = enemyAttackAp(enemy), reach = enemyRangeTiles(enemy);

    while (ap > 0) {
      const pDist = gs.inCombat ? Math.abs(c.playerWx - enemy.worldX) : 0;
      // Go for the companion instead when they're clearly closer (or sometimes when both are in reach)
      const comp = (gs.exploreCompanionId && c.companion && !c.compDown) ? c.companion : null;
      const cDist = comp ? Math.abs(c.compWx - enemy.worldX) : Infinity;
      if (enemy._targetComp === undefined || ap === enemyMaxAp(enemy)) {
        enemy._targetComp = !!comp && (cDist < pDist - TILE / 2 || (cDist <= MELEE_RANGE && chance(30)));
      }
      if (c.playerDown && !comp) break;                   // nobody left standing to hit
      if (c.playerDown) enemy._targetComp = true;          // you're on the ground: they go for your companion
      const targetComp = enemy._targetComp && !!comp;
      const targetX = targetComp ? c.compWx : c.playerWx;
      const tiles   = gs.inCombat ? tilesBetween(targetX, enemy.worldX) : 1;

      if (tiles <= reach && ap >= atkAp && attacks < 2) {
        // Attack (costs AP; at most two per turn)
        ap -= atkAp;
        attacks++;
        const hit = clamp((enemy.accuracy || 60) - (gs.parent.agility || 5), 10, 90);
        const delay = 300 * attackOrder++;
        enemy._atkT0  = Date.now() + delay;
        enemy._shotTo = targetX;
        const impact = delay + (enemy.isRanged ? 60 : 200);
        if (targetComp) {
          _enemyHitsCompanion(gs, enemy, impact);
          continue;
        }
        if (chance(hit)) {
          const dmg   = randInt(enemy.damage[0], enemy.damage[1]) + (c.surprised ? 2 : 0);
          const { dealt, blocked } = applyArmor(gs.parent, dmg, !!enemy.isRanged);
          c.player.hp -= dealt;
          _fx(gs, 'hit', 'player', dealt, enemy.worldX, impact);
          gs.parent.health = Math.max(0, gs.parent.health - dealt);
          combatLog(gs, `${enemy.name} hits ${gs.parent.name} for ${dealt} dmg${blocked ? ` (${blocked} blocked)` : ''}.`, 'danger');
          if (!gs.parent.infected && chance(5)) {
            gs.parent.infected = true;
            combatLog(gs, 'Wound may be infected!', 'danger');
            notify('Infection risk — use antibiotics.', 'danger');
          }
          if (c.player.hp > 0 && chance(bleedChance(enemyWeaponId && enemyWeaponId(enemy), enemy))) {
            _startPlayerBleeding(gs, `The wound is bleeding!`);
          }
          if (!gs.parent.wounded && gs.parent.health / gs.parent.maxHealth < 0.35) {
            gs.parent.wounded = true;
            combatLog(gs, `${gs.parent.name} is seriously wounded.`, 'danger');
            notify('Seriously wounded — use a medkit!', 'danger');
            _startPlayerBleeding(gs, `${gs.parent.name} is badly hurt and bleeding.`);
          }
          if (c.player.hp <= 0) {
            if (!_playerFalls(gs, enemy.worldX, impact)) return;
            break;                                         // this enemy's done; others go for the companion
          }
        } else {
          combatLog(gs, `${enemy.name} misses.`, 'normal');
          _fx(gs, 'miss', 'player', 0, enemy.worldX, impact);
        }
      } else if (tiles > reach && ap >= 1) {
        // Step one tile closer (1 AP), unless someone is in the way
        const dir = targetX > enemy.worldX ? 1 : -1;
        const nx = enemy.worldX + dir * TILE;
        if (gs.inCombat && _tileTaken(c, nx, enemy)) break;
        ap -= 1;
        if (gs.inCombat) enemy.worldX = nx;
      } else {
        break;
      }
    }
  }

  // Companion's turn (their own AP, weapon and judgement)
  if (gs.exploreCompanionId && c.companion && !c.compDown) {
    if (_companionTurn(gs, attackOrder)) return;      // the fight is over
  }

  c.surprised = false;   // the surprise only lasts their opening round
  if (c.phase !== 'action') return;
  // Out cold: your turn passes while your companion fights on
  if (c.playerDown) {
    c.turn = 'enemy'; c.pendingAction = 'enemy'; c.pendingTimer = 1.1;
    return;
  }
  // Your own bleeding wound costs blood every round
  if (gs.parent.bleeding && c.phase === 'action' && _bleedTick(gs, 'player')) return;
  // Reset player AP for next turn; input waits until the attack animations finish
  c.playerAp = c.player.maxAp;
  c.busyUntil = attackOrder ? Date.now() + 300 * (attackOrder - 1) + 550 : 0;
  c.turn = 'player';
}

// ── Loot & end ────────────────────────────────────────────────────────────────

// Drops stay on the body; search it afterwards (E) to take them
/** The companion acts on their own: first aid if you need it, then fight with
 *  whatever they're holding, using AP like you do. Returns true if the fight ended. */
function _companionTurn(gs, order) {
  const c = gs.combat, comp = c.companion, p = gs.parent;
  comp.equipped = comp.equipped || { weapon: null, chest: null, legs: null };
  let ap = 4;
  // First aid comes first (not while you're out cold: they fight for both of you)
  if (c.playerDown) { /* no time for first aid */ }
  else if (p.bleeding && !c.compBandaged && countInInventory(p.inventory, 'bandage') > 0) {
    c.compBandaged = true; ap -= 2;
    removeFromInventory(p.inventory, 'bandage', 1);
    p.bleeding = false;
    combatLog(gs, `${comp.name} binds your wound. The bleeding stops.`, 'good');
  } else if (c.player.hp / c.player.maxHp < 0.4 && !c.compHealed) {
    c.compHealed = true; ap -= 2;
    const heal = 6;
    c.player.hp = Math.min(c.player.maxHp, c.player.hp + heal);
    p.health = Math.min(p.maxHealth, p.health + heal);
    combatLog(gs, `${comp.name} patches you up (+${heal} HP).`, 'good');
  }
  const wid = comp.equipped.weapon, wd = wid ? getItemDef(wid) : null;
  const isGun = !!(wd && wd.weaponType === 'firearm');
  const ws = weaponCombatStats(wid);
  const skill = isGun ? ((comp.skills && comp.skills.firearms) || 1) : ((comp.skills && comp.skills.melee) || 1);
  let delay = 300 * order;
  for (let guard = 0; ap > 0 && guard < 8; guard++) {
    const alive = c.enemies.filter(e => !e.dead);
    if (!alive.length) break;
    const tgt = alive.reduce((a, e) => Math.abs(e.worldX - c.compWx) < Math.abs(a.worldX - c.compWx) ? e : a);
    const tiles = tilesBetween(tgt.worldX, c.compWx);
    const hasAmmo = !isGun || (p.ammo[wd.ammoType] || 0) > 0;
    const reach = isGun && hasAmmo ? ws.range : 1;
    const cost = isGun && !hasAmmo ? 2 : ws.ap;
    const dir = tgt.worldX > c.compWx ? 1 : -1;
    // a shooter with someone in their face steps back first, if there's room
    if (isGun && hasAmmo && tiles <= 1 && ap >= 1 + cost && !_tileTaken(c, c.compWx - dir * TILE, 'comp')) {
      c.compWx -= dir * TILE; ap -= 1;
      combatLog(gs, `${comp.name} backs off to get a clear shot.`, 'normal');
      continue;
    }
    if (tiles <= reach && ap >= cost) {
      ap -= cost;
      c.compAtkT0 = Date.now() + delay;
      let hit = (wd ? wd.accuracy * 0.9 : 60) + skill * 4 + (comp.agility || 5) - (tgt.agility || 3) * 2;
      if (isGun && hasAmmo && tiles > Math.ceil(ws.range / 2)) hit -= (tiles - Math.ceil(ws.range / 2)) * 6;
      hit = clamp(hit, 10, 90);
      let lo, hi;
      if (wd && (!isGun || hasAmmo)) {
        const str = isGun ? 0 : Math.max(0, Math.floor(((comp.strength || 5) - 4) / 2));
        lo = wd.damage[0] + str; hi = wd.damage[1] + str;
      } else { lo = 1 + Math.floor((comp.strength || 5) / 3); hi = 2 + Math.floor((comp.strength || 5) / 2); }
      if (isGun && hasAmmo) {
        p.ammo[wd.ammoType] -= 1;
        gs.suspicion = clamp(gs.suspicion + 1, 0, CFG.SUSPICION_MAX);
        if (typeof gunNoise === 'function') gunNoise(gs);
      }
      const verb = isGun && hasAmmo ? 'shoots' : 'hits';
      if (chance(hit)) {
        const dmg = Math.max(1, randInt(lo, hi) - Math.floor((tgt.armor || 0) / 2));
        tgt.hp -= dmg;
        _fx(gs, 'hit', tgt, dmg, c.compWx, delay + (isGun ? 60 : 200));
        combatLog(gs, `${comp.name} ${verb} ${tgt.name} for ${dmg} dmg.`, 'good');
        if (tgt.hp > 0 && !tgt.bleeding && tgt.type !== 'machine' && chance(bleedChance(wid))) {
          tgt.bleeding = true; combatLog(gs, `${tgt.name} is bleeding!`, 'good');
        }
        if (tgt.hp <= 0) {
          tgt.dead = true;
          _fx(gs, 'death', tgt, 0, c.compWx, delay + 220);
          combatLog(gs, `${comp.name} takes down ${tgt.name}.`, 'good');
          collectLoot(gs, tgt);
          giveXP(gs.parent, Math.round(((({ machine: 20, human: 15, animal: 10 })[tgt.type]) || 12) * 0.5), gs);
        }
      } else {
        combatLog(gs, `${comp.name} misses ${tgt.name}.`, 'normal');
        _fx(gs, 'miss', tgt, 0, c.compWx, delay + 200);
      }
      delay += 300;
      if (checkCombatVictory(gs)) return true;
      continue;
    }
    if (tiles > reach && ap >= 1) {
      // they can squeeze past you, but not through an enemy
      const nx = c.compWx + dir * TILE;
      if (c.enemies.some(e => !e.dead && Math.abs(e.worldX - nx) < TILE / 2)) break;
      c.compWx = nx; ap -= 1;
      continue;
    }
    break;
  }
  return false;
}

/** A companion was killed (no Plot Armor): gone for good, their gear left where they fell. */
function _companionDied(gs, c) {
  const comp = c.companion;
  gs.survivors = (gs.survivors || []).filter(s => s !== comp && s.id !== comp.id);
  gs.exploreCompanionId = null;
  const es = typeof exploreState !== 'undefined' ? exploreState : null;
  const gear = Object.values(comp.equipped || {}).filter(Boolean);
  if (es && gear.length) {
    const list = es.building ? null : es.loot;
    if (list) for (const id of gear) list.push({ id, qty: 1, wx: c.compWx + randInt(-10, 10), wy: PLAYER_FOOT, taken: false });
    else if (es.building) { const area = curArea(es); area.containers.push({ wx: c.compWx, type: 'bag', label: comp.name, searched: true, searching: false, searchProgress: 0, searchDuration: 1, loot: gear.map(id => ({ id, qty: 1 })) }); }
  }
  gs.parent.depression = clamp(gs.parent.depression + 25, 0, 100);
  gs.child.depression = clamp(gs.child.depression + 15, 0, 100);
  addLog(`${comp.name} died out there. You couldn't save them.`, 'danger');
}

// An enemy attacks the companion instead of the player
function _enemyHitsCompanion(gs, enemy, impact) {
  const c = gs.combat, comp = c.companion;
  const hit = clamp((enemy.accuracy || 60) - 5, 10, 90);
  const pseudo = { worldX: c.compWx, sprite: 'human_hostile' };
  if (!chance(hit)) {
    combatLog(gs, `${enemy.name} misses ${comp.name}.`, 'normal');
    _fx(gs, 'miss', pseudo, 0, enemy.worldX, impact);
    return;
  }
  // their clothes and armour protect them like yours protect you
  const { dealt } = applyArmor(comp, randInt(enemy.damage[0], enemy.damage[1]), !!enemy.isRanged);
  comp.health = Math.max(0, (comp.health || 0) - dealt);
  c.compHitT0 = Date.now() + impact;
  _fx(gs, 'hit', pseudo, dealt, enemy.worldX, impact);
  combatLog(gs, `${enemy.name} hits ${comp.name} for ${dealt} dmg.`, 'danger');
  if (comp.health <= 0) {
    comp.health = plotArmor(gs) ? 1 : 0;
    c.compDown = true;
    if (plotArmor(gs)) {
      combatLog(gs, `${comp.name} faints and is out of the fight!`, 'danger');
    } else {
      c.compDead = true;                                    // without Plot Armor, people die
      combatLog(gs, `${comp.name} is killed!`, 'danger');
      notify(`${comp.name} is dead.`, 'danger');
    }
    // both of you down: the fight is lost
    if (c.playerDown) {
      c.phase = 'defeat';
      combatLog(gs, 'There is no one left standing.', 'danger');
      c.pendingAction = 'defeat'; c.pendingTimer = 1.8;
    }
  }
}

function collectLoot(gs, enemy) {
  if (enemy._fixedLoot) { enemy._loot = enemy._fixedLoot.map(s => ({ ...s })); return; }   // a trader's whole stock
  enemy._loot = [];
  if (!enemy.drops) return;
  for (const [id, min, max] of enemy.drops) {
    const qty = thinLoot(randInt(min, max));
    if (qty > 0) enemy._loot.push({ id, qty });
  }
}

function checkCombatVictory(gs) {
  const c = gs.combat;
  if (c.enemies.every(e => e.dead)) {
    c.phase = 'victory';
    const aiKills = c.enemies.filter(e => e.type === 'machine' && e.dead);
    for (const e of aiKills) {
      if (e.reward && e.reward.suspicion) {
        gs.suspicion = clamp(gs.suspicion + e.reward.suspicion, 0, CFG.SUSPICION_MAX);
      }
    }
    combatLog(gs, 'Victory!', 'good');
    c.pendingAction = 'victory'; c.pendingTimer = 1.5;
    return true;
  }
  return false;
}

function updateCombat(gs, dt) {
  const c = gs.combat;
  if (!c) return;
  if (c.introTimer > 0) { c.introTimer -= dt; return; }
  if (c.openingShot) {
    // fire the aimed shot as soon as the banner clears (nearest enemy in reach)
    c.openingShot = false;
    const alive = c.enemies.filter(e => !e.dead);
    const tgt = alive.reduce((a, e) => (!a || Math.abs(e.worldX - c.playerWx) < Math.abs(a.worldX - c.playerWx) ? e : a), null);
    if (tgt) { c.targetIdx = alive.indexOf(tgt); playerAttack(gs, c.enemies.indexOf(tgt)); }
    return;
  }
  if (!c.pendingAction) return;
  c.pendingTimer -= dt;
  if (c.pendingTimer > 0) return;
  const action = c.pendingAction;
  c.pendingAction = null;
  if      (action === 'enemy')   enemyTurn(gs);
  else if (action === 'victory') endCombat(gs, 'victory');
  else if (action === 'defeat')  endCombat(gs, 'defeat');
  else if (action === 'fled')    endCombat(gs, 'fled');
}

function endCombat(gs, result) {
  const c = gs.combat;
  gs.parent.health    = Math.max(0, c.player.hp);
  gs.parent.tiredness = clamp(gs.parent.tiredness + 15, 0, 100);
  Audio.stopCombatMusic();

  if (result !== 'defeat') {
    // Plot Armor: whoever fainted comes round with 5 HP
    if (c.playerDown) {
      gs.parent.health = 5;
      addLog(`${gs.parent.name} comes to${c.companion ? `, ${c.companion.name} kneeling beside them` : ''}.`, 'info');
      notify(`You come round with 5 HP.`, 'warn');
    }
    if (c.companion && c.compDown && !c.compDead) {
      c.companion.health = Math.max(5, c.companion.health || 0);
      addLog(`${c.companion.name} gets back up, shaken (5 HP).`, 'info');
    }
    if (c.companion && c.compDead) _companionDied(gs, c);
  }

  if (result === 'defeat') {
    gs.inCombat = false;
    gs.combat   = null;
    triggerGameOver(gs, `${gs.parent.name} was killed in combat.`);
    return;
  }

  if (c._traderId && typeof traderCombatEnded === 'function') traderCombatEnded(gs, c, result);

  // A shelter raid ends back in the shelter, not in exploration
  if (gs.isRaid && typeof finishRaid === 'function') { finishRaid(gs, result, c); return; }

  if (result === 'victory' && c._encRef) c._encRef.killed = true;
  // Bodies stay where they fell for the rest of this exploration
  if (result !== 'defeat' && typeof archiveCorpses === 'function') archiveCorpses(gs, c);

  if (result === 'fled') {
    const enc = c._encRef || null;
    // Survivors retain current HP; shove them away from player
    const maxX = typeof combatMaxX === 'function' ? combatMaxX(gs) - 20 : CFG.WORLD_W - 30;
    const survivors = c.enemies.filter(e => !e.dead).map(e => {
      const dir = e.worldX >= c.playerWx ? 1 : -1;
      return { ...e, worldX: clamp(e.worldX + dir * 320, 30, maxX) };
    });
    if (enc) {
      if (survivors.length > 0) {
        // Save survivors so re-approach fights the same weakened enemies
        enc._savedEnemies = survivors;
        enc.wx = Math.round(survivors.reduce((s, e) => s + e.worldX, 0) / survivors.length);
        enc.triggered = false; // make them re-appear on the map
      } else {
        enc.killed = true; // all dead while fleeing — they're gone
      }
    }
    gs.screenFade = {
      active: true, alpha: 0, phase: 'out', titleText: null,
      pendingFn: () => {
        gs.inCombat = false;
        gs.combat   = null;
        gs.screen   = 'explore';
        Audio.startMusic();
      },
    };
    return;
  }

  // Victory — restart explore music
  Audio.startMusic();
  gs.inCombat = false;
  gs.combat   = null;
  gs.screen   = 'explore';
  if (c.enemies.some(e => e._loot && e._loot.length)) notify('Search the bodies for loot [E].', 'info');
}
