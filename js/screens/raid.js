// raid.js — Raiders (and later drones) attacking the shelter
'use strict';

// Shelter defenses: security room level plus any defense upgrades
function shelterDefense(gs) {
  const sec = getRoom('security');
  return (sec && sec.unlocked ? (sec.level || 1) : 0) + (gs.shelter.defenseLevel || 0);
}

/** Called at the start of each day: maybe schedule a raid for later today. */
function rollDailyRaid(gs) {
  if (gs.day < 4 || gs.suspicion < 35 || gs.pendingRaid) return;
  const odds = clamp((gs.suspicion - 30) * 1.2 - shelterDefense(gs) * 6, 0, 45);
  if (chance(odds)) gs.pendingRaid = { at: randInt(10 * 60, 18 * 60) };
}

/** Called from the shelter update: when the raid time comes and the parent is home, it starts. */
function checkRaid(gs) {
  const r = gs.pendingRaid;
  if (!r || gs.screen !== 'shelter' || gs.time < r.at || gs.parent.isExploring || gs.dayFade.active) return;
  gs.pendingRaid = null;
  const drones = gs.suspicion >= 70 && chance(40);
  gs.event = {
    id: 'ev_raid', type: 'event', title: drones ? 'Drones at the hatch!' : 'Raiders at the hatch!',
    text: drones
      ? 'A whine of rotors overhead, then the scrape of metal on the hatch. The machines have found the way in.'
      : 'Boots on the rubble above. Someone is prying at the hatch with a crowbar, laughing. They know you are down here.',
    choices: [
      { label: 'Fight them at the hatch', action: g => { startRaidFight(g, drones); return null; } },
      { label: 'Stay quiet and let them take what they want', action: g => hideFromRaid(g) },
    ],
  };
  gs.screen = 'event';
  gs._returnTo = 'shelter';
  eventUI.openLockFrames = 5;
  Audio.alert();
}

/** Fight the raid using the normal exploration combat, outside the hatch. */
function startRaidFight(gs, drones) {
  const loc = {
    id: 'raid', name: 'Shelter Hatch', bgTheme: 'urban_dark', difficulty: 1 + Math.floor(gs.day / 8),
    zones: [{ x: 0, w: CFG.WORLD_W, name: 'The Hatch', lootTable: null, enemyChance: 0, bgColor: C.bg }],
  };
  const px = 320;
  exploreState = {
    location: loc, scrollX: px - EXPLORE_VIEW_W * 0.4,
    loot: [], containers: [], buildings: [], encounters: [], events: [], huntSpots: [],
    foliage: [{ type: 'debris', wx: 180 }, { type: 'car_wreck', wx: 560 }, { type: 'debris', wx: 640 }],
    bonesPiles: [], px, py: PLAYER_FOOT, velX: 0, facing: 1, animFrame: 0, animTimer: 0,
    showReturnPrompt: false, building: null, invOpen: false, invScroll: 0, invSelected: null,
  };
  // Who shows up grows with time
  const n = clamp(2 + Math.floor(gs.day / 10), 2, 5);
  const ids = [];
  for (let i = 0; i < n; i++) {
    if (drones) ids.push(i === 0 && gs.day >= 15 ? 'patrol_robot' : 'scout_drone');
    else ids.push(i === 0 && gs.day >= 8 ? 'raider_armed' : 'raider');
  }
  const enemies = ids.map(id => deepClone(ENEMY_TEMPLATES[id]));
  gs.isRaid = true;
  gs.screen = 'explore';
  gs.mouse.down = false;
  startCombat(gs, enemies, px, px + 170);
  gs.inCombat = true;
  gs.combat.enemies.forEach((e, i) => { e.worldX = px + 130 + i * 58; });
  // Traps and barricades soften them up
  const def = shelterDefense(gs);
  if (def > 0) {
    for (const e of gs.combat.enemies) e.hp = Math.max(1, e.hp - def * 4);
    combatLog(gs, `Your defenses wound the attackers (-${def * 4} HP each).`, 'good');
  }
}

/** Raid fight over (victory or fled). Defeat is a normal game over. */
function finishRaid(gs, result, c) {
  gs.isRaid   = false;
  gs.inCombat = false;
  gs.combat   = null;
  exploreState = null;
  gs.screen = 'shelter';
  Audio.stopCombatMusic();
  Audio.startShelterMusic();
  if (result === 'victory') {
    let taken = 0;
    for (const e of c.enemies) for (const it of (e._loot || [])) { addToInventory(gs.shelter.storage, it.id, it.qty); taken += it.qty; }
    gs.suspicion = clamp(gs.suspicion - 10, 0, CFG.SUSPICION_MAX);
    addLog(`The raid was driven off.${taken ? ` Took ${taken} items from the attackers.` : ''}`, 'good');
  } else {
    addLog(hideFromRaid(gs), 'danger');
  }
}

/** Hide: they ransack part of the storage. Returns the result text. */
function hideFromRaid(gs) {
  const st = gs.shelter.storage;
  let lost = 0;
  for (const slot of [...st]) {
    const take = Math.ceil(slot.qty * 0.3);
    if (take > 0 && chance(70)) { removeFromInventory(st, slot.id, take); lost += take; }
  }
  gs.parent.depression = clamp(gs.parent.depression + 10, 0, 100);
  gs.child.depression  = clamp(gs.child.depression + 15, 0, 100);
  gs.suspicion = clamp(gs.suspicion - 5, 0, CFG.SUSPICION_MAX);
  return `You hold Lily close in the dark while they ransack the storage. They leave with ${lost} items.`;
}
