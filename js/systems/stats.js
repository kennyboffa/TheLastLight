// stats.js — Stat decay, healing, and daily tick
'use strict';

// Difficulty multiplier for stat decay
function diffMult(gs) {
  if (gs.difficulty === 'easy')   return 0.7;
  if (gs.difficulty === 'hard')   return 1.4;
  return 1.0;
}
function diffSuspMult(gs) {
  if (gs.difficulty === 'easy')   return 0.6;
  if (gs.difficulty === 'hard')   return 1.5;
  return 1.0;
}

// Called every game frame with deltaTime in real seconds
function tickStats(gs, dt) {
  if (gs.paused || gs.screen !== 'shelter' && gs.screen !== 'explore') return;

  const mins = dt * CFG.MINS_PER_REAL_SEC;
  const hrs  = mins / 60;

  // ── Advance time ────────────────────────────────────────────────────────────
  gs.time += mins;
  if (gs.time >= CFG.DAY_END) {
    if (gs.screen === 'explore') {
      // Late return: player didn't make it back before nightfall
      const pName = gs.parent.name;
      gs.lateReturn = true;
      const presentSurvivors = (gs.survivors || []).filter(s => !s.onMission);
      const comfortName = presentSurvivors.length > 0 ? presentSurvivors[0].name : null;
      const deprIncrease = comfortName ? 15 : 25;
      gs.child.depression = clamp(gs.child.depression + deprIncrease, 0, 100);
      const comfortLine = comfortName
        ? `\nAt least ${gs.child.name} was comforted by ${comfortName}.`
        : '';
      gs.dayFade.message  = `${pName} didn't return before nightfall.\n${gs.child.name} spent the night alone and terrified.${comfortLine}`;
      endExploration(gs);
      notify(`${pName} didn't return in time — ${gs.child.name} is scared!`, 'danger');
    }
    startDayTransition(gs);
    return;
  }

  const dm = diffMult(gs);

  // ── Parent ──────────────────────────────────────────────────────────────────
  const p = gs.parent;
  // Trait multipliers for hunger/thirst
  const isNightTime = gs.time < 7 * 60 || gs.time >= 20 * 60; // before 7am or after 8pm
  let pHungerMult = 1.0;
  if (p.trait === 'slow_metabolism') pHungerMult = 0.80;
  if (p.trait === 'fast_healer')     pHungerMult = 1.20;
  const pTireMult = (p.trait === 'night_owl')
    ? (isNightTime ? 0.6 : 1.25)
    : 1.0;
  if (!p.isSleeping) {
    p.hunger    = clamp(p.hunger    + CFG.HUNGER_PER_HOUR * dm * hrs * pHungerMult, 0, 100);
    p.thirst    = clamp(p.thirst    + CFG.THIRST_PER_HOUR * dm * hrs * pHungerMult, 0, 100);
    const tireRate = (p.isExploring || p.isWorking) ? CFG.TIRE_ACTIVE_PER_HOUR : CFG.TIRE_IDLE_PER_HOUR;
    const rainTire = (p.isExploring && gs.weather && gs.weather.type === 'rain')
      ? CFG.TIRE_ACTIVE_PER_HOUR * 0.6 : 0;
    p.tiredness = clamp(p.tiredness + (tireRate + rainTire) * dm * hrs * pTireMult, 0, 100);
  } else {
    p.hunger    = clamp(p.hunger    + CFG.HUNGER_PER_HOUR * 0.3 * dm * hrs * pHungerMult, 0, 100);
    p.thirst    = clamp(p.thirst    + CFG.THIRST_PER_HOUR * 0.3 * dm * hrs * pHungerMult, 0, 100);
    p.tiredness = clamp(p.tiredness + CFG.TIRE_SLEEP_PER_HOUR * hrs, 0, 100);
    if (p.tiredness <= 0) {
      p.isSleeping = false; p.tiredness = 0;
      if (p.task && p.task.type === 'sleep') {
        p.task = null; p.taskProgress = 0; p.taskDuration = 0; p.isWorking = false;
        notify(`${p.name} woke up rested.`, 'good');
      }
    }
  }

  // Wounded heals naturally once HP recovers above 60%
  if (p.wounded && p.health / p.maxHealth >= 0.6) p.wounded = false;

  // Depression (ambient rise + child-based effects handled below)
  p.depression = clamp(p.depression + CFG.DEPR_PARENT_IDLE_PER_HOUR * dm * hrs, 0, 100);

  // HP damage from hunger/thirst
  if (p.hunger  >= CFG.HUNGER_DAMAGE)  p.health = Math.max(0, p.health - CFG.HEALTH_DRAIN_PER_HOUR * hrs);
  if (p.thirst  >= CFG.THIRST_DAMAGE)  p.health = Math.max(0, p.health - CFG.HEALTH_DRAIN_PER_HOUR * 1.5 * hrs);

  // Infection: slow health drain (scaled to 25 maxHP), notify once per hour
  if (p.infected) {
    p.health = Math.max(1, p.health - 0.4 * hrs);
    // Periodic reminder (roughly once per game hour)
    if (!p._infNotifyTimer) p._infNotifyTimer = 0;
    p._infNotifyTimer -= hrs;
    if (p._infNotifyTimer <= 0) {
      notify(`${p.name} is infected — use antibiotics!`, 'danger');
      p._infNotifyTimer = 1;
    }
  } else {
    p._infNotifyTimer = 0;
  }

  // Forced sleep if too tired
  if (p.tiredness >= CFG.TIRE_FORCED_SLEEP && !p.isSleeping) {
    p.isSleeping = true;
    notify('Too tired to continue — sleeping.', 'warn');
  }

  // ── Child ───────────────────────────────────────────────────────────────────
  const ch = gs.child;
  if (ch.isSleeping) {
    ch.hunger    = clamp(ch.hunger    + CFG.HUNGER_PER_HOUR * 0.3 * hrs, 0, 100);
    ch.thirst    = clamp(ch.thirst    + CFG.THIRST_PER_HOUR * 0.3 * hrs, 0, 100);
    ch.tiredness = clamp(ch.tiredness + CFG.TIRE_SLEEP_PER_HOUR * hrs, 0, 100);
    if (ch.tiredness <= 0) { ch.isSleeping = false; ch.task = null; ch.tiredness = 0; }
  } else {
    ch.hunger    = clamp(ch.hunger    + CFG.HUNGER_PER_HOUR * 0.8 * hrs, 0, 100);
    ch.thirst    = clamp(ch.thirst    + CFG.THIRST_PER_HOUR * 0.8 * hrs, 0, 100);
    ch.tiredness = clamp(ch.tiredness + CFG.TIRE_IDLE_PER_HOUR * 0.6 * hrs, 0, 100);
  }

  if (ch.hunger  >= CFG.HUNGER_DAMAGE)  ch.health = Math.max(0, ch.health - CFG.HEALTH_DRAIN_PER_HOUR * hrs);
  if (ch.thirst  >= CFG.THIRST_DAMAGE)  ch.health = Math.max(0, ch.health - CFG.HEALTH_DRAIN_PER_HOUR * 1.5 * hrs);
  if (ch.infected) {
    ch.health = Math.max(1, ch.health - 0.4 * hrs);
    if (!ch._infNotifyTimer) ch._infNotifyTimer = 0;
    ch._infNotifyTimer -= hrs;
    if (ch._infNotifyTimer <= 0) {
      notify(`${gs.child.name} is infected — needs antibiotics!`, 'danger');
      ch._infNotifyTimer = 1;
    }
  } else { ch._infNotifyTimer = 0; }

  // Child depression: rises when alone, falls when with parent
  ch.isAlone = p.isExploring;
  const childDeprRate = ch.isAlone ? CFG.DEPR_CHILD_ALONE_PER_HOUR : CFG.DEPR_CHILD_PARENT_PER_HOUR;
  ch.depression = clamp(ch.depression + childDeprRate * hrs, 0, 100);

  // Dog bonus
  if (gs.dog && gs.dog.alive) {
    ch.depression = clamp(ch.depression - 1.5 * hrs, 0, 100);
    p.depression  = clamp(p.depression  - 0.6 * hrs, 0, 100);
    gs.dog.hunger = clamp(gs.dog.hunger + 4 * hrs, 0, 100);
    if (gs.dog.hunger >= 90) {
      gs.dog.health = Math.max(0, gs.dog.health - CFG.HEALTH_DRAIN_PER_HOUR * hrs);
      if (gs.dog.health <= 0) {
        gs.dog.alive = false;
        addLog('The dog has died from starvation.', 'danger');
        ch.depression = Math.min(100, ch.depression + 30);
        p.depression  = Math.min(100, p.depression  + 20);
      }
    }
  }

  // ── Survivors ──────────────────────────────────────────────────────────────
  for (const s of gs.survivors) {
    if (s.isSleeping) {
      s.hunger    = clamp(s.hunger    + CFG.HUNGER_PER_HOUR * 0.3 * hrs, 0, 100);
      s.thirst    = clamp(s.thirst    + CFG.THIRST_PER_HOUR * 0.3 * hrs, 0, 100);
      s.tiredness = clamp(s.tiredness + CFG.TIRE_SLEEP_PER_HOUR * hrs, 0, 100);
      if (s.tiredness <= 0) { s.isSleeping = false; s.task = null; s.tiredness = 0; }
    } else {
      s.hunger    = clamp(s.hunger    + CFG.HUNGER_PER_HOUR * hrs, 0, 100);
      s.thirst    = clamp(s.thirst    + CFG.THIRST_PER_HOUR * hrs, 0, 100);
      s.tiredness = clamp(s.tiredness + (s.isExploring ? CFG.TIRE_ACTIVE_PER_HOUR : CFG.TIRE_IDLE_PER_HOUR) * hrs, 0, 100);
    }
    s.depression = clamp(s.depression + 0.5 * hrs, 0, 100);
    if (s.hunger  >= CFG.HUNGER_DAMAGE) s.health = Math.max(0, s.health - CFG.HEALTH_DRAIN_PER_HOUR * hrs);
    if (s.thirst  >= CFG.THIRST_DAMAGE) s.health = Math.max(0, s.health - CFG.HEALTH_DRAIN_PER_HOUR * 1.5 * hrs);
  }

  // ── AI Suspicion passive tick ───────────────────────────────────────────────
  // Very slow daily drift upward
  const suspRise = 0.15 * diffSuspMult(gs) * hrs;
  const suspReduce = gs.shelter.hasRadioDampener ? 0.12 * hrs : 0;
  const roomBonus  = getRoomUnlocked('security') ? 0.08 * hrs : 0;
  const prevSusp = gs.suspicion;
  gs.suspicion = clamp(gs.suspicion + suspRise - suspReduce - roomBonus, 0, CFG.SUSPICION_MAX);
  if (gs.shelter.hasGenerator) gs.suspicion = clamp(gs.suspicion + 0.2 * hrs, 0, CFG.SUSPICION_MAX);

  // Story: suspicion crosses 50 for the first time
  if (!gs.flags.storySuspicion && prevSusp < CFG.SUSPICION_MAX * 0.5 && gs.suspicion >= CFG.SUSPICION_MAX * 0.5) {
    gs.flags.storySuspicion = true;
    gs.storyQueue.push('story_suspicion');
  }

  // ── Autonomous character AI ────────────────────────────────────────────────
  tickCharacterAI(gs);

  // ── Death check ────────────────────────────────────────────────────────────
  if (p.health  <= 0) triggerGameOver(gs, 'The parent died.');
  if (ch.health <= 0) triggerGameOver(gs, 'Lily did not survive.');
  if (gs.suspicion >= CFG.SUSPICION_MAX) triggerGameOver(gs, 'The AI found the shelter.');

  // ── Weather ────────────────────────────────────────────────────────────────
  tickWeather(gs, hrs);

  // ── Task progress ──────────────────────────────────────────────────────────
  tickTasks(gs, hrs);
}

function tickTasks(gs, hrs) {
  // Parent task
  const p = gs.parent;
  if (p.task) {
    p.taskProgress += hrs;
    if (p.taskProgress >= p.taskDuration) {
      finishTask(gs, p, p.task);
      p.task = null; p.taskProgress = 0; p.taskDuration = 0; p.isWorking = false;
    }
  }
  // Child task
  const ch2 = gs.child;
  if (ch2.task) {
    ch2.taskProgress = (ch2.taskProgress || 0) + hrs;
    if (ch2.taskProgress >= ch2.taskDuration) {
      finishTask(gs, ch2, ch2.task);
      ch2.task = null; ch2.taskProgress = 0; ch2.taskDuration = 0;
    }
  }

  // Survivor tasks
  for (const s of gs.survivors) {
    if (s.task) {
      s.taskProgress += hrs;
      if (s.taskProgress >= s.taskDuration) {
        finishTask(gs, s, s.task);
        s.task = null; s.taskProgress = 0; s.taskDuration = 0;
      }
    }
  }
}

function _healMult(who) {
  if (who.trait === 'fast_healer')     return 1.30;
  if (who.trait === 'slow_metabolism') return 0.80;
  return 1.0;
}

function finishTask(gs, who, task) {
  switch (task.type) {
    case 'sleep':
      who.isSleeping = false;
      notify(`${who.name} woke up.`, 'normal');
      break;
    case 'eat': {
      const def = getItemDef(task.itemId);
      if (!def) break;
      const hm = _healMult(who);
      who.hunger    = clamp(who.hunger    + (def.hunger    || 0), 0, 100);
      who.thirst    = clamp(who.thirst    + (def.thirst    || 0), 0, 100);
      who.depression= clamp(who.depression+ (def.depression|| 0), 0, 100);
      who.health    = clamp(who.health    + Math.round((def.health || 0) * hm), 0, who.maxHealth);
      if (def.clearsInfection) who.infected = false;
      notify(`${who.name} ate ${def.name}.`, 'good');
      break;
    }
    case 'drink': {
      const def = getItemDef(task.itemId);
      if (!def) break;
      const hm = _healMult(who);
      who.thirst = clamp(who.thirst + (def.thirst || 0), 0, 100);
      who.health = clamp(who.health + Math.round((def.health || 0) * hm), 0, who.maxHealth);
      notify(`${who.name} drank ${def.name}.`, 'good');
      break;
    }
    case 'craft': {
      const recipe = RECIPES_DB.find(r => r.id === task.recipeId);
      if (recipe) {
        const outQty = task.qty || recipe.qty || 1;
        addToInventory(gs.shelter.storage, recipe.output, outQty);
        notify(`Crafted ${outQty}x ${getItemDef(recipe.output)?.name || recipe.output}.`, 'good');
      }
      giveXP(who, 15, gs);
      break;
    }
    case 'build':
      completeBuildTask(gs, task);
      giveXP(who, 25, gs);
      break;
    case 'play':
      gs.child.depression  = clamp(gs.child.depression  - 18, 0, 100);
      gs.parent.depression = clamp(gs.parent.depression - 10, 0, 100);
      notify('Lily\'s mood has improved.', 'good');
      giveXP(gs.parent, 8, gs);
      giveXP(gs.child,  5, gs);
      break;
    case 'cook':
      finishCooking(gs, task);
      giveXP(who, 10, gs);
      break;
    case 'hunt':
      finishHunt(gs, task);
      giveXP(who, 20, gs);
      break;
  }
}

function completeBuildTask(gs, task) {
  if (task.roomId && task.upgradeLevel) {
    // Room level upgrade
    const room = getRoom(task.roomId);
    if (room) {
      const def = ROOM_DEFS[room.id];
      room.level = task.upgradeLevel;
      // Apply storage bonus for storage room upgrades
      if (def && def.effect === 'moreStorage') {
        const bonus = task.upgradeLevel === 2 ? 30 : 50;
        gs.shelter.storageMax += bonus;
        notify(`${def.name} upgraded to level ${room.level}. +${bonus}kg capacity.`, 'good');
      } else {
        notify(`${def ? def.name : 'Room'} upgraded to level ${room.level}.`, 'good');
      }
    }
  } else if (task.roomId) {
    const room = getRoom(task.roomId);
    if (room) {
      room.unlocked = true; room.level = 1; room.building = false;
      const def = ROOM_DEFS[room.id];
      if (def && def.storageBonus) gs.shelter.storageMax += def.storageBonus;
      if (def && def.effect === 'moreStorage') notify('Storage room built. +40kg capacity.', 'good');
      else notify(`${def ? def.name : 'Room'} constructed.`, 'good');
      gs.suspicion = clamp(gs.suspicion + (def ? def.buildNoise * 0.3 : 5), 0, CFG.SUSPICION_MAX);
      // Story: first new room completed
      if (!gs.flags.storyFirstRoom) {
        gs.flags.storyFirstRoom = true;
        gs.storyQueue.push('story_first_room');
      }
    }
  } else if (task.upgradeId) {
    const upg = UPGRADES_DB[task.upgradeId];
    if (upg && upg.key) gs.shelter[upg.key] = true;
    notify(`${upg ? upg.name : 'Upgrade'} complete.`, 'good');
    gs.suspicion = clamp(gs.suspicion + (upg ? upg.buildNoise * 0.3 : 3), 0, CFG.SUSPICION_MAX);
  }
}

function finishCooking(gs, task) {
  const src  = task.inputId;  // e.g. 'raw_meat' | 'canned_soup'
  const out  = task.outputId; // e.g. 'cooked_meat' | 'heated_soup'
  const qty  = task.qty || 1;
  const storage = gs.shelter.storage;
  if (countInInventory(storage, src) >= qty) {
    removeFromInventory(storage, src, qty);
    addToInventory(storage, out, qty);
    notify(`Cooked ${qty}x ${getItemDef(out).name}.`, 'good');
  }
}

function finishHunt(gs, task) {
  const yield_ = randInt(1, 3);
  addToInventory(gs.shelter.storage, 'raw_meat', yield_);
  addLog(`Hunt successful: found ${yield_} raw meat.`, 'good');
}

// ── Weather tick ──────────────────────────────────────────────────────────────
function tickWeather(gs, hrs) {
  const w = gs.weather;

  if (w.type === 'rain') {
    // Active rain: count down duration
    w.rainDuration = Math.max(0, (w.rainDuration || 0) - hrs);
    if (w.rainDuration <= 0) {
      w.type = 'cloudy';
      notify('The rain has stopped.', 'info');
    }
    // Raincatcher: 1 clean water_bottle per hour of rain
    if (gs.shelter.hasRaincatcher) {
      w.rainAccum = (w.rainAccum || 0) + hrs;
      if (w.rainAccum >= 1) {
        w.rainAccum -= 1;
        addToInventory(gs.shelter.storage, 'water_bottle', 1);
        notify('Raincatcher collected a bottle of water.', 'good');
      }
    }
  } else {
    // Between rain events: slow clear/cloudy cycling
    w.timer += hrs;
    if (w.timer >= (w.nextChange || 4)) {
      w.timer = 0;
      w.nextChange = randFloat(CFG.WEATHER_CHANGE_MIN, CFG.WEATHER_CHANGE_MAX);
      const prev = w.type;
      w.type = Math.random() < 0.55 ? 'clear' : 'cloudy';
      if (w.type !== prev) notify(`Weather: ${w.type}`, 'info');
    }
  }
}

// Called from advanceDay — checks whether rain should start today
function maybeStartRain(gs) {
  const w = gs.weather;
  if (!w.nextRainDay) w.nextRainDay = gs.day + randInt(3, 7);
  if (gs.day >= w.nextRainDay && w.type !== 'rain') {
    w.type        = 'rain';
    w.rainDuration = randFloat(2, 8); // 2–8 game hours of rain
    w.rainAccum   = 0;
    w.nextRainDay  = gs.day + randInt(3, 7);
    addLog('It is raining today.', 'info');
    if (gs.screen === 'explore') notify('It has started raining — you tire faster outside.', 'warn');
    else notify('It started raining outside.', 'info');
  }
}

// ── Day transition ────────────────────────────────────────────────────────────
function startDayTransition(gs) {
  gs.dayFade.active = true;
  gs.dayFade.phase  = 'out';
  gs.dayFade.alpha  = 0;
  gs.dayFade.timer  = 0;
}

function advanceDay(gs) {
  gs.day++;
  gs.time = CFG.DAY_START;
  gs.timeScale = 1; // reset game speed to normal at start of each new day

  // Autosave at the start of every new day
  if (typeof autoSaveGame === 'function') autoSaveGame(gs);

  // Parent: if sleeping when day ends, they wake up fully rested
  if (gs.parent.isSleeping) {
    gs.parent.isSleeping   = false;
    gs.parent.tiredness    = 0;
    gs.parent.task         = null;
    gs.parent.taskProgress = 0;
    gs.parent.taskDuration = 0;
    gs.parent.isWorking    = false;
  } else if (!gs.lateReturn && !gs.parent.isExploring) {
    // Parent was home in the bunker — they rested through the night even if not
    // explicitly assigned a sleep task (working late, eating, etc.)
    gs.parent.tiredness = 0;
  }

  gs.shelter.noiseToday = 0;
  gs.parent.hasExploredToday = false; // new day — can explore once more

  // Child rests at night (overridden below if parent didn't come home)
  gs.child.isSleeping = false;
  gs.child.tiredness  = 0;
  if (gs.child.task && gs.child.task.type === 'sleep') {
    gs.child.task = null; gs.child.taskProgress = 0; gs.child.taskDuration = 0;
  }

  // Late return penalties — player spent the night outside
  if (gs.lateReturn) {
    gs.lateReturn = false;
    gs.parent.wounded   = true;
    gs.parent.tiredness = clamp(gs.parent.tiredness + 50, 0, 100);
    gs.parent.health    = Math.max(1, Math.floor(gs.parent.health * 0.65));
    gs.time             = CFG.DAY_START + randInt(120, 300); // returns 8–11 AM
    // Lily didn't sleep — override the normal night rest that already ran above
    gs.child.tiredness  = 55;  // exhausted from staying up all night
    gs.child.health     = Math.max(1, gs.child.health - 2); // stress/fear toll
    gs.child.depression = clamp(gs.child.depression + 10, 0, 100);
    addLog(`${gs.parent.name} returned wounded and exhausted after a night outside.`, 'danger');
    addLog(`${gs.child.name} didn't sleep. She was awake the whole night waiting.`, 'warn');
    // Story: the morning after not coming home
    if (!gs.flags.storyLateReturn) {
      gs.flags.storyLateReturn = true;
      gs.storyQueue.push('story_late_return');
    }
  }

  // Day 15: Lily falls ill with something medicine can slow but not cure
  if (gs.day === 15 && !gs.flags.lilySick) {
    gs.flags.lilySick    = true;
    gs.flags.lilySickDay = gs.day;
    gs.storyQueue.push('story_lily_sick');
  }

  // Lily sick: worsening story at day 20 if not yet cured
  if (gs.day === 20 && gs.flags.lilySick && !gs.flags.lilyCured) {
    gs.storyQueue.push('story_lily_worsening');
  }

  // Daily medicine consumption while Lily is sick
  if (gs.flags.lilySick && !gs.flags.lilyCured) {
    const medOrder = ['painkiller', 'antibiotics'];
    let medFound = false;
    for (const medId of medOrder) {
      const storageCount = countInInventory(gs.shelter.storage, medId);
      const invCount     = countInInventory(gs.parent.inventory, medId);
      if (storageCount > 0) {
        removeFromInventory(gs.shelter.storage, medId, 1);
        addLog(`${gs.child.name} took ${getItemDef(medId).name} to manage her fever.`, 'info');
        medFound = true; break;
      } else if (invCount > 0) {
        removeFromInventory(gs.parent.inventory, medId, 1);
        addLog(`${gs.child.name} took ${getItemDef(medId).name} to manage her fever.`, 'info');
        medFound = true; break;
      }
    }
    if (!medFound) {
      gs.child.health = Math.max(1, gs.child.health - 3);
      addLog(`${gs.child.name} has no medicine — her fever is getting worse.`, 'danger');
      notify(`${gs.child.name} needs medicine to manage her illness!`, 'danger');
    }
  }

  // Week-one milestone
  if (gs.day === 7 && !gs.flags.storyWeekOne) {
    gs.flags.storyWeekOne = true;
    gs.storyQueue.push('story_week_one');
  }

  // Lily wonders about other children — triggers on day 6 if not yet seen
  if (gs.day >= 6 && !gs.flags.storyChildren) {
    gs.flags.storyChildren = true;
    gs.storyQueue.push('story_children');
  }

  // Dog availability
  if (gs.day >= 10 && !gs.flags.dogEncountered) gs.flags.dogAvailable = true;

  // Survivors: all rest at night → tiredness reset, sleep tasks cleared
  for (const s of gs.survivors) {
    s.isSleeping = false;
    if (!s.isExploring) s.tiredness = 0;
    if (s.task && s.task.type === 'sleep') {
      s.task = null; s.taskProgress = 0; s.taskDuration = 0;
    }
    s.depression = clamp(s.depression - 2, 0, 100);
    giveXP(s, 5, gs);
  }

  // Overnight hunger/thirst (DAY_END 23:00 → DAY_START 6:00 = 7 h of sleep)
  // Everyone is resting so rate is 0.3× the normal per-hour value.
  const overnightHrs = (CFG.DAY_START + 1440 - CFG.DAY_END) / 60; // ~7 h
  const dm = diffMult(gs);
  const oChars = [gs.parent, gs.child, ...(gs.survivors || []).filter(s => !s.onMission)];
  for (const who of oChars) {
    who.hunger = clamp(who.hunger + CFG.HUNGER_PER_HOUR * 0.3 * dm * overnightHrs, 0, 100);
    who.thirst = clamp(who.thirst + CFG.THIRST_PER_HOUR * 0.3 * dm * overnightHrs, 0, 100);
  }

  // Check if rain should start today
  maybeStartRain(gs);

  // Daily survival XP
  giveXP(gs.parent, 8, gs);
  giveXP(gs.child,  5, gs);

  notify(`Day ${gs.day}`, 'info');
}

// ── Game over ─────────────────────────────────────────────────────────────────
function triggerGameOver(gs, reason) {
  gs.gameOverReason = reason;
  gs.screen = 'gameOver';
}

// ── XP & Leveling ─────────────────────────────────────────────────────────────

function xpForLevel(lvl) {
  // XP needed to go from lvl to lvl+1: 100, 140, 196, 274, …
  return Math.floor(100 * Math.pow(1.4, lvl - 1));
}

// Attribute cycling order for level-up bonuses
const _ATTR_CYCLE  = ['strength','agility','perception','intelligence','charisma'];
const _SKILL_CYCLE = ['scavenging','stealth','exploration','bartering','speech','lockpick','melee','firearms'];

function giveXP(who, amount, gs) {
  if (!who || amount <= 0) return;
  // Apply XP trait modifiers
  if      (who.trait === 'fast_learner') amount = Math.round(amount * 1.20);
  else if (who.trait === 'slow_learner') amount = Math.round(amount * 0.80);
  who.xp   = (who.xp   || 0) + amount;
  who.level = (who.level || 1);
  const needed = xpForLevel(who.level);
  if (who.xp >= needed) {
    who.xp -= needed;
    who.level++;
    who.maxHealth += 5;
    who.health = Math.min((who.health || 0) + 5, who.maxHealth);

    // Attribute boost — cycle through in order
    const attrKey = _ATTR_CYCLE[(who.level - 2) % _ATTR_CYCLE.length];
    if (who[attrKey] !== undefined) who[attrKey] = Math.min(10, who[attrKey] + 1);

    // Skill points per level — modified by trait
    if (who.skills) {
      let pts = 2;
      if      (who.trait === 'fast_learner') pts = 1; // -1 skill pt
      else if (who.trait === 'slow_learner') pts = 3; // +1 skill pt
      else if (who.trait === 'lucky')        pts = 1; // -1 skill pt
      who.pendingSkillPts = (who.pendingSkillPts || 0) + pts;
      notify(`${who.name} reached Level ${who.level}! +1 ${attrKey}, +${pts} skill pts, +5 HP`, 'good');
    } else {
      notify(`${who.name} reached Level ${who.level}! +1 ${attrKey}, +5 HP`, 'good');
    }
    if (gs) addLog(`${who.name} leveled up to Level ${who.level}.`, 'good');
    Audio.levelUp();
  }
}

// ── Autonomous character AI ────────────────────────────────────────────────────
function tickCharacterAI(gs) {
  const foodIds  = ['heated_beans','heated_soup','cooked_meat','canned_beans','canned_soup','canned_meat','energy_bar'];
  const waterIds = ['purified_water','water_bottle','dirty_water'];

  function autoNeeds(who) {
    if (who.task || who.isSleeping) return;
    // Auto-sleep when very tired
    if (who.tiredness >= 80) {
      who.isSleeping   = true;
      who.task         = { type: 'sleep' };
      who.taskDuration = 5;
      who.taskProgress = 0;
      notify(`${who.name} is exhausted and went to sleep.`, 'normal');
      return;
    }
    // Auto-eat when very hungry
    if (who.hunger >= 78) {
      const foodId = foodIds.find(id => countInInventory(gs.shelter.storage, id) > 0);
      if (foodId) {
        removeFromInventory(gs.shelter.storage, foodId, 1);
        const def = getItemDef(foodId);
        who.hunger     = clamp(who.hunger     + (def.hunger     || -20), 0, 100);
        who.thirst     = clamp(who.thirst     + (def.thirst     ||   0), 0, 100);
        who.depression = clamp(who.depression + (def.depression ||   0), 0, 100);
        notify(`${who.name} ate ${def.name}.`, 'good');
        return;
      }
    }
    // Auto-drink when very thirsty
    if (who.thirst >= 72) {
      const waterId = waterIds.find(id => countInInventory(gs.shelter.storage, id) > 0);
      if (waterId) {
        removeFromInventory(gs.shelter.storage, waterId, 1);
        const def = getItemDef(waterId);
        who.thirst = clamp(who.thirst + (def.thirst || -28), 0, 100);
        who.health = clamp(who.health + (def.health ||   0), 0, who.maxHealth);
        notify(`${who.name} drank ${def.name}.`, 'good');
        return;
      }
    }
  }

  // Parent (only when in shelter)
  if (!gs.parent.isExploring) autoNeeds(gs.parent);

  // Lily — only sleep (eating/drinking handled by autoFeedLogic)
  const ch = gs.child;
  if (ch.tiredness >= 85 && !ch.task && !ch.isSleeping) {
    ch.isSleeping   = true;
    ch.task         = { type: 'sleep' };
    ch.taskDuration = 6;
    ch.taskProgress = 0;
    notify(`${ch.name} is exhausted and went to sleep.`, 'normal');
  }

  // Survivors
  for (const s of gs.survivors) {
    if (!s.isExploring) autoNeeds(s);
  }
}

// ── Consume item directly ─────────────────────────────────────────────────────
function useItem(who, inv, itemId, gs) {
  const def = getItemDef(itemId);
  if (!def) return false;
  if (countInInventory(inv, itemId) < 1) return false;
  removeFromInventory(inv, itemId, 1);
  const hm = _healMult(who);
  who.hunger     = clamp(who.hunger     + (def.hunger     || 0), 0, 100);
  who.thirst     = clamp(who.thirst     + (def.thirst     || 0), 0, 100);
  who.depression = clamp(who.depression + (def.depression  || 0), 0, 100);
  who.health     = clamp(who.health     + Math.round((def.health || 0) * hm), 0, who.maxHealth);
  if (def.clearsInfection && who) who.infected = false;
  if (def.childDeprBonus && gs) gs.child.depression = clamp(gs.child.depression + def.childDeprBonus, 0, 100);
  return true;
}
