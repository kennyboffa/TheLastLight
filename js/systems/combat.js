// combat.js — Turn-based combat system
'use strict';

// Build combat state from exploration encounter
function startCombat(gs, enemies) {
  // Build player combatant
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
    // Reload state
    magazine: 0, magazineSize: 0, ammoType: null,
  };

  // Equip weapon stats
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

  // Build enemy combatants
  const enemyCombatants = enemies.map((e, i) => ({
    ...e,
    isPlayer: false,
    index: i,
    dead: false,
    // AI: picks target (player)
    aiTimer: randInt(0, 2),
  }));

  // Companion combatant (survivor exploring with player)
  const companionData = gs.exploreCompanionId
    ? (gs.survivors || []).find(s => s.id === gs.exploreCompanionId) || null
    : null;

  gs.combat = {
    player: playerCombatant,
    enemies: enemyCombatants,
    companion: companionData,
    turn: 'player',   // 'player' | 'enemy'
    log: [],
    phase: 'action',  // 'action' | 'result' | 'flee' | 'victory' | 'defeat'
    selectedAction: null,  // 'attack' | 'item' | 'flee' | 'reload'
    targetIdx: 0,
    resultText: '',
    resultTimer: 0,
    fleeAttempted: false,
    victoryLoot: [],
    pendingAction: null,  // queued action: 'enemy' | 'victory' | 'defeat' | 'fled'
    pendingTimer: 0,
  };

  combatLog(gs, 'Combat started!', 'warn');
}

function combatLog(gs, text, type) {
  if (!gs.combat) return;
  gs.combat.log.unshift({ text, type: type || 'normal' });
  if (gs.combat.log.length > 8) gs.combat.log.pop();
}

// ── Player actions ────────────────────────────────────────────────────────────

function playerAttack(gs, targetIdx) {
  const c  = gs.combat;
  const p  = gs.parent;
  const target = c.enemies[targetIdx];
  if (!target || target.dead) return;

  const weapDef = p.equipped.weapon ? getItemDef(p.equipped.weapon) : null;
  let dmgMin = 4, dmgMax = 9, hit = c.player.accuracy;

  if (weapDef) {
    dmgMin = weapDef.damage[0];
    dmgMax = weapDef.damage[1];
    hit    = weapDef.accuracy + (weapDef.weaponType === 'firearm'
               ? p.skills.firearms * 3 : p.skills.melee * 3);

    // Firearm: check ammo
    if (weapDef.weaponType === 'firearm') {
      if (c.player.magazine <= 0) {
        combatLog(gs, 'Need to reload!', 'warn');
        return;
      }
      c.player.magazine--;
      p.loaded[weapDef.ammoType] = c.player.magazine;
    }
  } else {
    // Unarmed — base on strength + melee skill
    dmgMin = 2 + Math.floor(p.strength / 2);
    dmgMax = 6 + p.strength;
    hit    = CFG.BASE_HIT_CHANCE + p.skills.melee * 4;
  }

  // Agility bonus to hit
  hit += p.agility * 1.5;
  hit = clamp(hit, 10, 96);

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
      Audio.loot();
    }
  } else {
    combatLog(gs, `${p.name} misses ${target.name}.`, 'normal');
    Audio.miss();
  }

  // Check win
  if (checkCombatVictory(gs)) return;

  // End player turn
  c.turn = 'enemy';
  c.pendingAction = 'enemy'; c.pendingTimer = 0.7;
}

function playerReload(gs) {
  const c = gs.combat;
  const p = gs.parent;
  const wd = p.equipped.weapon ? getItemDef(p.equipped.weapon) : null;
  if (!wd || wd.weaponType !== 'firearm') {
    combatLog(gs, 'Nothing to reload.', 'warn');
    return;
  }
  const spares = p.ammo[wd.ammoType] || 0;
  if (spares <= 0) {
    combatLog(gs, 'No spare ammo!', 'danger');
    c.turn = 'enemy';
    c.pendingAction = 'enemy'; c.pendingTimer = 0.7;
    return;
  }
  const needed = c.player.magazineSize - c.player.magazine;
  const loaded = Math.min(needed, spares);
  c.player.magazine    += loaded;
  p.loaded[wd.ammoType] = c.player.magazine;
  p.ammo[wd.ammoType]  -= loaded;
  combatLog(gs, `Reloaded (${c.player.magazine}/${c.player.magazineSize}).`, 'good');

  c.turn = 'enemy';
  c.pendingAction = 'enemy'; c.pendingTimer = 0.7;
}

function playerUseItem(gs, itemId) {
  const c = gs.combat;
  const p = gs.parent;
  const inv = p.inventory;
  if (countInInventory(inv, itemId) < 1) {
    combatLog(gs, 'Item not found.', 'warn');
    return;
  }
  const def = getItemDef(itemId);
  useItem(p, inv, itemId, gs);
  combatLog(gs, `Used ${def.name}.`, 'good');
  // Sync HP
  c.player.hp = clamp(p.health, 0, p.maxHealth);
  // Medkit clears wounded
  if (itemId === 'medkit' && p.wounded && p.health / p.maxHealth >= 0.5) {
    p.wounded = false;
    combatLog(gs, 'Wounds treated — movement restored.', 'good');
  }

  c.turn = 'enemy';
  c.pendingAction = 'enemy'; c.pendingTimer = 0.7;
}

function playerFlee(gs) {
  const c = gs.combat;
  const p = gs.parent;
  const fleeChance = 30 + p.agility * 6 + p.skills.stealth * 4;
  if (chance(fleeChance)) {
    combatLog(gs, 'Escaped!', 'good');
    c.phase = 'fled';
    c.pendingAction = 'fled'; c.pendingTimer = 1.2;
  } else {
    combatLog(gs, 'Couldn\'t escape!', 'danger');
    c.turn = 'enemy';
    c.pendingAction = 'enemy'; c.pendingTimer = 0.7;
  }
}

// ── Enemy turn (called from game loop via pendingAction) ──────────────────────

function enemyTurn(gs) {
  const c = gs.combat;
  if (!c || c.phase !== 'action') return;

  for (const enemy of c.enemies) {
    if (enemy.dead) continue;
    const hit = clamp((enemy.accuracy || 60), 10, 90);
    if (chance(hit)) {
      const dmg  = randInt(enemy.damage[0], enemy.damage[1]);
      const dealt = Math.max(1, dmg - 0);   // player has no armor by default
      c.player.hp -= dealt;
      gs.parent.health = Math.max(0, gs.parent.health - dealt);
      combatLog(gs, `${enemy.name} hits ${gs.parent.name} for ${dealt} dmg.`, 'danger');
      // Small chance of infection from wound
      if (!gs.parent.infected && chance(5)) {
        gs.parent.infected = true;
        combatLog(gs, 'Wound may be infected!', 'danger');
        notify('Infection risk — treat with antibiotics.', 'danger');
      }
      // Trigger wounded state if HP drops below 35%
      if (!gs.parent.wounded && gs.parent.health / gs.parent.maxHealth < 0.35) {
        gs.parent.wounded = true;
        combatLog(gs, `${gs.parent.name} is seriously wounded — movement slowed.`, 'danger');
        notify('Seriously wounded — movement is slow. Use a medkit!', 'danger');
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
  }

  // Companion auto-attack (fires after enemies act)
  if (gs.exploreCompanionId && c.companion) {
    const comp = c.companion;
    const alive = c.enemies.filter(e => !e.dead);
    if (alive.length > 0) {
      const target = alive[Math.floor(Math.random() * alive.length)];
      const compHit = clamp(50 + (comp.skills?.melee || 1) * 4, 20, 90);
      if (chance(compHit)) {
        const dmg = randInt(3, 8);
        target.hp -= dmg;
        combatLog(gs, `${comp.name} hits ${target.name} for ${dmg} dmg.`, 'good');
        if (target.hp <= 0) {
          target.dead = true;
          combatLog(gs, `${target.name} destroyed.`, 'good');
          collectLoot(gs, target);
        }
      } else {
        combatLog(gs, `${comp.name} misses.`, 'normal');
      }
      if (checkCombatVictory(gs)) return;
    }
  }

  c.turn = 'player';
}

// ── Loot & end ────────────────────────────────────────────────────────────────

function collectLoot(gs, enemy) {
  if (!enemy.drops) return;
  for (const [id, min, max] of enemy.drops) {
    const qty = randInt(min, max);
    if (qty > 0) {
      gs.combat.victoryLoot.push({ id, qty });
    }
  }
}

function checkCombatVictory(gs) {
  const c = gs.combat;
  if (c.enemies.every(e => e.dead)) {
    c.phase = 'victory';
    // Suspicion: destroying AI units
    const aiKills = c.enemies.filter(e => e.type === 'machine' && e.dead);
    for (const e of aiKills) {
      if (e.reward && e.reward.suspicion) {
        gs.suspicion = clamp(gs.suspicion + e.reward.suspicion, 0, CFG.SUSPICION_MAX);
      }
    }
    combatLog(gs, 'Victory! Loot available.', 'good');
    c.pendingAction = 'victory'; c.pendingTimer = 1.5;
    return true;
  }
  return false;
}

// ── Game-loop update (replaces setTimeout-based turn scheduling) ──────────────

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
  // Sync parent HP
  gs.parent.health  = Math.max(0, c.player.hp);
  gs.parent.tiredness = clamp(gs.parent.tiredness + 15, 0, 100);

  if (result === 'defeat') {
    triggerGameOver(gs, `${gs.parent.name} was killed in combat.`);
    return;
  }
  // Mark the encounter that triggered this combat as killed
  if (result === 'victory' && c._encRef) {
    c._encRef.killed = true;
  }

  if (result === 'victory' && c.victoryLoot.length > 0) {
    // Show loot pickup screen — combat object kept alive until player is done
    gs.screen = 'lootPickup';
  } else {
    gs.combat = null;
    gs.screen = 'explore';
  }
}
