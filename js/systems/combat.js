// combat.js — In-world combat system (v0.27)
'use strict';

const MELEE_RANGE    = 70;   // px — max distance for melee attacks
const FLEE_MIN_DIST  = 110;  // px — min distance from any enemy to attempt flee
const COMBAT_STEP    = 40;   // px — distance per Move action
const CFG_COMBAT_INTRO = 1.2; // s — freeze with "COMBAT" banner when a fight starts

// Melee weapons wear out: number of swings before they break (repair at the workshop)
const WEAPON_DURABILITY = { knife: 40, machete: 45, crowbar: 70, pipe: 50, bat: 35, spear: 30 };

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

function playerMoveLeft(gs) {
  const c = gs.combat;
  if (c.turn !== 'player' || c.phase !== 'action') return;
  if (c.playerAp < 1) { combatLog(gs, 'No AP left to move.', 'warn'); return; }
  c.playerAp--;
  c.playerWx = Math.max(10, c.playerWx - COMBAT_STEP);
  combatLog(gs, 'Moved left.', 'normal');
  if (c.playerAp <= 0) { c.turn = 'enemy'; c.pendingAction = 'enemy'; c.pendingTimer = 0.6; }
}

function playerMoveRight(gs) {
  const c = gs.combat;
  if (c.turn !== 'player' || c.phase !== 'action') return;
  if (c.playerAp < 1) { combatLog(gs, 'No AP left to move.', 'warn'); return; }
  c.playerAp--;
  c.playerWx = Math.min(typeof combatMaxX === 'function' ? combatMaxX(gs) : CFG.WORLD_W - 10, c.playerWx + COMBAT_STEP);
  combatLog(gs, 'Moved right.', 'normal');
  if (c.playerAp <= 0) { c.turn = 'enemy'; c.pendingAction = 'enemy'; c.pendingTimer = 0.6; }
}

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
    const dist = Math.abs(c.playerWx - target.worldX);
    if (dist > 150) hit -= (dist - 150) / 10;
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

  // Melee range check (only for in-world combat)
  if (gs.inCombat && !isRanged) {
    const dist = Math.abs(c.playerWx - target.worldX);
    if (dist > MELEE_RANGE) {
      combatLog(gs, 'Too far — move closer for melee!', 'warn');
      return;
    }
  }

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

  c.turn = 'enemy';
  c.pendingAction = 'enemy'; c.pendingTimer = 0.7;
}

function playerReload(gs) {
  const c  = gs.combat;
  const p  = gs.parent;
  const wd = p.equipped.weapon ? getItemDef(p.equipped.weapon) : null;
  if (!wd || wd.weaponType !== 'firearm') { combatLog(gs, 'Nothing to reload.', 'warn'); return; }
  const spares = p.ammo[wd.ammoType] || 0;
  if (spares <= 0) {
    combatLog(gs, 'No spare ammo!', 'danger');
    c.turn = 'enemy'; c.pendingAction = 'enemy'; c.pendingTimer = 0.7;
    return;
  }
  const needed = c.player.magazineSize - c.player.magazine;
  const loaded = Math.min(needed, spares);
  c.player.magazine    += loaded;
  p.loaded[wd.ammoType] = c.player.magazine;
  p.ammo[wd.ammoType]  -= loaded;
  combatLog(gs, `Reloaded (${c.player.magazine}/${c.player.magazineSize}).`, 'good');
  c.turn = 'enemy'; c.pendingAction = 'enemy'; c.pendingTimer = 0.7;
}

function playerUseItem(gs, itemId) {
  const c   = gs.combat;
  const p   = gs.parent;
  const inv = p.inventory;
  if (countInInventory(inv, itemId) < 1) { combatLog(gs, 'Item not found.', 'warn'); return; }
  const def = getItemDef(itemId);
  useItem(p, inv, itemId, gs);
  combatLog(gs, `Used ${def.name}.`, 'good');
  c.player.hp = clamp(p.health, 0, p.maxHealth);
  if (itemId === 'medkit' && p.wounded && p.health / p.maxHealth >= 0.5) {
    p.wounded = false;
    combatLog(gs, 'Wounds treated.', 'good');
  }
  c.turn = 'enemy'; c.pendingAction = 'enemy'; c.pendingTimer = 0.7;
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
    if (minDist < FLEE_MIN_DIST) {
      combatLog(gs, `Too close to flee! Need ${FLEE_MIN_DIST - Math.round(minDist)}m more distance.`, 'warn');
      return;
    }
    if (c.playerAp < 2) {
      combatLog(gs, 'Need 2 AP to attempt flee.', 'warn');
      return;
    }
    c.playerAp -= 2;
  }

  const fleeChance = 30 + p.agility * 6 + p.skills.stealth * 4;
  if (chance(fleeChance)) {
    combatLog(gs, 'Escaped!', 'good');
    c.phase = 'fled';
    c.pendingAction = 'fled'; c.pendingTimer = 1.0;
  } else {
    combatLog(gs, 'Couldn\'t escape!', 'danger');
    c.turn = 'enemy';
    c.pendingAction = 'enemy'; c.pendingTimer = 0.7;
  }
}

// ── Enemy turn ────────────────────────────────────────────────────────────────

function enemyTurn(gs) {
  const c = gs.combat;
  if (!c || c.phase !== 'action') return;

  c.ambush = false;
  let attackOrder = 0;   // stagger attack animations so each one is visible
  for (const enemy of c.enemies) {
    if (enemy.dead) continue;

    let ap = enemyMaxAp(enemy);

    while (ap > 0) {
      const pDist = gs.inCombat ? Math.abs(c.playerWx - enemy.worldX) : 0;
      // Go for the companion instead when they're clearly closer (or sometimes when both are in reach)
      const comp = (gs.exploreCompanionId && c.companion && !c.compDown) ? c.companion : null;
      const cDist = comp ? Math.abs(c.compWx - enemy.worldX) : Infinity;
      if (enemy._targetComp === undefined || ap === enemyMaxAp(enemy)) {
        enemy._targetComp = !!comp && (cDist < pDist - 15 || (cDist <= MELEE_RANGE && chance(30)));
      }
      const targetComp = enemy._targetComp && !!comp;
      const dist   = targetComp ? cDist : pDist;
      const targetX = targetComp ? c.compWx : c.playerWx;

      // Can attack: ranged weapon or within melee range
      const canAttack = enemy.isRanged || dist <= MELEE_RANGE;

      if (canAttack && ap >= 2) {
        ap -= 2;
        const hit = clamp((enemy.accuracy || 60) - (gs.parent.agility || 5), 10, 90);
        const delay = 300 * attackOrder++;
        enemy._atkT0  = Date.now() + delay;
        enemy._shotTo = targetX;
        const impact = delay + (enemy.isRanged ? 60 : 200);
        if (targetComp) {
          _enemyHitsCompanion(gs, enemy, impact);
          break;
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
          if (!gs.parent.wounded && gs.parent.health / gs.parent.maxHealth < 0.35) {
            gs.parent.wounded = true;
            combatLog(gs, `${gs.parent.name} is seriously wounded.`, 'danger');
            notify('Seriously wounded — use a medkit!', 'danger');
          }
          if (c.player.hp <= 0) {
            _fx(gs, 'death', 'player', 0, enemy.worldX, impact + 20);
            c.phase = 'defeat';
            combatLog(gs, `${gs.parent.name} has fallen.`, 'danger');
            c.pendingAction = 'defeat'; c.pendingTimer = 1.6 + impact / 1000;
            return;
          }
        } else {
          combatLog(gs, `${enemy.name} misses.`, 'normal');
          _fx(gs, 'miss', 'player', 0, enemy.worldX, impact);
        }
        break; // one attack per enemy per turn
      } else if (!canAttack && ap >= 1) {
        // Move toward player
        ap -= 1;
        if (gs.inCombat) {
          const dir = targetX > enemy.worldX ? 1 : -1;
          enemy.worldX += dir * 35;
        }
      } else {
        break;
      }
    }
  }

  // Companion's turn: patch the player up once when they're hurt, otherwise
  // close in on the nearest enemy and attack
  if (gs.exploreCompanionId && c.companion && !c.compDown) {
    const comp  = c.companion;
    const alive = c.enemies.filter(e => !e.dead);
    const delay = 300 * attackOrder++;
    if (alive.length && c.player.hp / c.player.maxHp < 0.4 && !c.compHealed) {
      c.compHealed = true;
      const heal = 6;
      c.player.hp = Math.min(c.player.maxHp, c.player.hp + heal);
      gs.parent.health = Math.min(gs.parent.maxHealth, gs.parent.health + heal);
      combatLog(gs, `${comp.name} patches you up (+${heal} HP).`, 'good');
    } else if (alive.length) {
      const tgt = alive.reduce((a, e) => Math.abs(e.worldX - c.compWx) < Math.abs(a.worldX - c.compWx) ? e : a);
      let d = Math.abs(tgt.worldX - c.compWx);
      if (d > MELEE_RANGE) {
        const step = Math.min(d - 40, 80);
        c.compWx += (tgt.worldX > c.compWx ? 1 : -1) * step;
        d = Math.abs(tgt.worldX - c.compWx);
      }
      if (d <= MELEE_RANGE) {
        c.compAtkT0 = Date.now() + delay;
        const compHit = clamp(55 + (comp.skills?.melee || 1) * 4 - (tgt.agility || 3) * 2, 15, 85);
        if (chance(compHit)) {
          const dmg = Math.max(1, randInt(3, 8) - Math.floor((tgt.armor || 0) / 2));
          tgt.hp -= dmg;
          _fx(gs, 'hit', tgt, dmg, c.compWx, delay + 200);
          combatLog(gs, `${comp.name} hits ${tgt.name} for ${dmg} dmg.`, 'good');
          if (tgt.hp <= 0) {
            tgt.dead = true;
            _fx(gs, 'death', tgt, 0, c.compWx, delay + 220);
            combatLog(gs, `${tgt.name} destroyed.`, 'good');
            collectLoot(gs, tgt);
          }
        } else {
          combatLog(gs, `${comp.name} misses.`, 'normal');
          _fx(gs, 'miss', tgt, 0, c.compWx, delay + 200);
        }
        if (checkCombatVictory(gs)) return;
      } else {
        combatLog(gs, `${comp.name} moves in.`, 'normal');
      }
    }
  }

  c.surprised = false;   // the surprise only lasts their opening round
  // Reset player AP for next turn; input waits until the attack animations finish
  c.playerAp = c.player.maxAp;
  c.busyUntil = attackOrder ? Date.now() + 300 * (attackOrder - 1) + 550 : 0;
  c.turn = 'player';
}

// ── Loot & end ────────────────────────────────────────────────────────────────

// Drops stay on the body; search it afterwards (E) to take them
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
  const dealt = Math.max(1, randInt(enemy.damage[0], enemy.damage[1]));
  comp.health = Math.max(0, (comp.health || 0) - dealt);
  c.compHitT0 = Date.now() + impact;
  _fx(gs, 'hit', pseudo, dealt, enemy.worldX, impact);
  combatLog(gs, `${enemy.name} hits ${comp.name} for ${dealt} dmg.`, 'danger');
  if (comp.health <= 0) {
    comp.health = 1;                 // knocked out, not killed
    c.compDown = true;
    combatLog(gs, `${comp.name} is knocked down and out of the fight!`, 'danger');
    notify(`${comp.name} is badly hurt.`, 'danger');
  }
}

function collectLoot(gs, enemy) {
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

  if (result === 'defeat') {
    gs.inCombat = false;
    gs.combat   = null;
    triggerGameOver(gs, `${gs.parent.name} was killed in combat.`);
    return;
  }

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
