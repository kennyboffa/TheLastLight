// combat.js — In-world combat system (v0.27)
'use strict';

const MELEE_RANGE    = 70;   // px — max distance for melee attacks
const FLEE_MIN_DIST  = 110;  // px — min distance from any enemy to attempt flee
const COMBAT_STEP    = 40;   // px — distance per Move action

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
  };

  combatLog(gs, 'Combat started!', 'warn');
  Audio.startCombatMusic();
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
  c.playerWx = Math.min(CFG.WORLD_W - 10, c.playerWx + COMBAT_STEP);
  combatLog(gs, 'Moved right.', 'normal');
  if (c.playerAp <= 0) { c.turn = 'enemy'; c.pendingAction = 'enemy'; c.pendingTimer = 0.6; }
}

function playerEndTurn(gs) {
  const c = gs.combat;
  if (c.turn !== 'player' || c.phase !== 'action') return;
  c.turn = 'enemy';
  c.pendingAction = 'enemy'; c.pendingTimer = 0.5;
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
    dmgMin = weapDef.damage[0];
    dmgMax = weapDef.damage[1];
    hit    = weapDef.accuracy + (isRanged
               ? p.skills.firearms * 3 : p.skills.melee * 3);
    if (isRanged) {
      if (c.player.magazine <= 0) { combatLog(gs, 'Need to reload!', 'warn'); return; }
      c.player.magazine--;
      p.loaded[weapDef.ammoType] = c.player.magazine;
    }
  } else {
    dmgMin = 2 + Math.floor(p.strength / 2);
    dmgMax = 6 + p.strength;
    hit    = CFG.BASE_HIT_CHANCE + p.skills.melee * 4;
  }

  if (p.trait === 'night_owl') {
    const nf   = nightFactor(gs.time);
    const mult = nf > 0.5 ? 1.20 : 0.90;
    dmgMin = Math.max(1, Math.round(dmgMin * mult));
    dmgMax = Math.max(1, Math.round(dmgMax * mult));
  }

  hit += p.agility * 1.5;
  hit  = clamp(hit, 10, 96);

  if (chance(hit)) {
    const raw    = randInt(dmgMin, dmgMax);
    const damage = Math.max(1, raw - (target.armor || 0));
    target.hp   -= damage;
    combatLog(gs, `${p.name} hits ${target.name} for ${damage} dmg.`, 'good');
    Audio.hit();
    if (target.hp <= 0) {
      target.dead = true;
      combatLog(gs, `${target.name} destroyed.`, 'good');
      collectLoot(gs, target);
      const _xp = { machine:20, human:15, animal:10 };
      giveXP(gs.parent, Math.round((_xp[target.type] || 12) * (target.isBoss ? 3 : 1)), gs);
      Audio.loot();
    }
  } else {
    combatLog(gs, `${p.name} misses ${target.name}.`, 'normal');
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

  for (const enemy of c.enemies) {
    if (enemy.dead) continue;

    let ap = enemyMaxAp(enemy);

    while (ap > 0) {
      const dist = gs.inCombat ? Math.abs(c.playerWx - enemy.worldX) : 0;

      // Can attack: ranged weapon or within melee range
      const canAttack = enemy.isRanged || dist <= MELEE_RANGE;

      if (canAttack && ap >= 2) {
        ap -= 2;
        const hit = clamp(enemy.accuracy || 60, 10, 90);
        if (chance(hit)) {
          const dmg   = randInt(enemy.damage[0], enemy.damage[1]);
          const dealt = Math.max(1, dmg);
          c.player.hp -= dealt;
          gs.parent.health = Math.max(0, gs.parent.health - dealt);
          combatLog(gs, `${enemy.name} hits ${gs.parent.name} for ${dealt} dmg.`, 'danger');
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
            c.phase = 'defeat';
            combatLog(gs, `${gs.parent.name} has fallen.`, 'danger');
            c.pendingAction = 'defeat'; c.pendingTimer = 1.5;
            return;
          }
        } else {
          combatLog(gs, `${enemy.name} misses.`, 'normal');
        }
        break; // one attack per enemy per turn
      } else if (!canAttack && ap >= 1) {
        // Move toward player
        ap -= 1;
        if (gs.inCombat) {
          const dir = c.playerWx > enemy.worldX ? 1 : -1;
          enemy.worldX += dir * 35;
        }
      } else {
        break;
      }
    }
  }

  // Companion auto-attack
  if (gs.exploreCompanionId && c.companion) {
    const comp  = c.companion;
    const alive = c.enemies.filter(e => !e.dead);
    if (alive.length > 0) {
      const tgt     = alive[Math.floor(Math.random() * alive.length)];
      const compHit = clamp(50 + (comp.skills?.melee || 1) * 4, 20, 90);
      if (chance(compHit)) {
        const dmg = randInt(3, 8);
        tgt.hp -= dmg;
        combatLog(gs, `${comp.name} hits ${tgt.name} for ${dmg} dmg.`, 'good');
        if (tgt.hp <= 0) {
          tgt.dead = true;
          combatLog(gs, `${tgt.name} destroyed.`, 'good');
          collectLoot(gs, tgt);
        }
      } else {
        combatLog(gs, `${comp.name} misses.`, 'normal');
      }
      if (checkCombatVictory(gs)) return;
    }
  }

  // Reset player AP for next turn
  c.playerAp = c.player.maxAp;
  c.turn = 'player';
}

// ── Loot & end ────────────────────────────────────────────────────────────────

function collectLoot(gs, enemy) {
  if (!enemy.drops) return;
  for (const [id, min, max] of enemy.drops) {
    const qty = randInt(min, max);
    if (qty > 0) gs.combat.victoryLoot.push({ id, qty });
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
  if (!c || !c.pendingAction) return;
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

  if (result === 'victory' && c._encRef) c._encRef.killed = true;

  if (result === 'fled') {
    const enc = c._encRef || null;
    // Survivors retain current HP; shove them away from player
    const survivors = c.enemies.filter(e => !e.dead).map(e => {
      const dir = e.worldX >= c.playerWx ? 1 : -1;
      return { ...e, worldX: e.worldX + dir * 320 };
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
  if (c.victoryLoot.length > 0) {
    gs.inCombat = false;
    gs.screen   = 'lootPickup';
  } else {
    gs.inCombat = false;
    gs.combat   = null;
    gs.screen   = 'explore';
  }
}
