// stealth.js — Enemies that live in the world before a fight starts.
//
// Each group patrols a stretch around its post, pausing to look both ways.
// People and machines see in a cone in front of them; animals smell you all
// around. Being seen fills their awareness ("?"), and when it is full the
// fight starts ("!"). Noise (walking without sneaking, prying locks, gunfire)
// makes them come and look. Get behind one that hasn't noticed you and you
// can take it down before it knows you're there.
'use strict';

const AWARE_LOOK = 0.3;          // "?" — they stop and stare
const AWARE_FULL = 1;            // "!" — fight
const TAKEDOWN_PX = 46;

function encKind(enc) {
  const sp = enc.previewSprite || '';
  if (/robot|drone/.test(sp)) return 'machine';
  if (sp === 'wolf') return 'animal';
  return 'human';
}

function _encInit(enc, indoor, areaW) {
  if (enc._st) return enc._st;
  const kind = encKind(enc);
  enc._st = {
    home: enc.wx, dir: Math.random() < 0.5 ? -1 : 1, pause: Math.random() * 2,
    amp: indoor ? 50 : 90, speed: kind === 'machine' ? 24 : kind === 'animal' ? 22 : 16,
    state: 'patrol', aware: 0, invX: null, lookT: 0, kind, areaW: areaW || CFG.WORLD_W, moving: false, bang: 0,
  };
  return enc._st;
}

/** How far they can see you right now (px). */
function sightRange(gs, enc, indoor) {
  let r = encounterDetectPx(gs, enc, indoor) * 1.2;
  const nf = nightFactor(gs.time);
  const lit = gs.parent.lightOn;
  if (!indoor && !lit) r *= 1 - 0.35 * nf;          // dark nights hide you
  if (indoor && !lit) r *= 0.85;
  if (!indoor && gs.weather && gs.weather.type === 'rain') r *= isStorm(gs) ? 0.75 : 0.9;   // rain hides you
  if (enc._st && enc._st.kind === 'machine') r *= 1.1;   // sensors
  return r;
}

/** Can this group perceive the player at px? Returns 0..1 strength (0 = no). */
function _perceive(gs, enc, px, indoor) {
  const st = enc._st;
  const d = Math.abs(px - enc.wx);
  const R = sightRange(gs, enc, indoor);
  if (d > R) return 0;
  const inFront = Math.sign(px - enc.wx) === st.dir || d < 6;
  if (st.kind === 'animal') return (1 - d / R) * 0.9 + 0.1;                // smell, all around
  if (!inFront) return d < TILE * 0.9 && !gs.parent.sneaking ? 0.5 : 0;   // you bumped into them
  return (1 - d / R) * 0.85 + 0.15;
}

/**
 * Move patrols, fill awareness, start a fight when someone has seen enough.
 * `list` are the encounters of the area you're in. Returns true if combat began.
 */
function updateStealth(gs, list, px, indoor, dt, moving, areaW) {
  const es = exploreState;
  for (const enc of list || []) {
    if (enc.triggered || enc.killed) continue;
    const st = _encInit(enc, indoor, areaW);
    if (Math.abs(px - enc.wx) < 320 && typeof showHint === 'function')
      showHint(gs, 'stealth', 'Enemies patrol and see in the direction they face (the faint cone). "?" means they noticed something. Sneak (C) up behind one and press E for a takedown. Noise draws them in.');
    // ── perception ───────────────────────────────────────────────────────
    const see = _perceive(gs, enc, px, indoor);
    if (see > 0) {
      let rate = 0.35 + 2.4 * see * see;
      if (gs.parent.sneaking) rate *= 0.6;
      if (!moving) rate *= 0.7;                       // standing still helps
      if (st.state === 'investigate' || st.state === 'look') rate *= 1.4;
      st.aware = Math.min(AWARE_FULL, st.aware + rate * dt);
      if (st.aware >= AWARE_LOOK && st.state !== 'look') {
        if (st.state === 'patrol' && typeof Audio.alert === 'function' && !st._heard) { st._heard = true; }
        st.state = 'look'; st.lookT = 2.5;
      }
      if (st.state === 'look') st.dir = Math.sign(px - enc.wx) || st.dir;
    } else {
      st.aware = Math.max(0, st.aware - 0.22 * dt);
    }
    if (st.aware >= AWARE_FULL) {
      st.bang = Date.now();
      if (Audio.alert) Audio.alert();
      return startEncounterFight(gs, enc, px, indoor, areaW);
    }
    // ── movement ─────────────────────────────────────────────────────────
    st.moving = false;
    const walk = (tx, mult) => {
      const d = tx - enc.wx;
      if (Math.abs(d) < 3) return true;
      st.dir = Math.sign(d);
      enc.wx += st.dir * Math.min(Math.abs(d), st.speed * (mult || 1) * dt);
      enc.wx = clamp(enc.wx, 30, st.areaW - 30);
      st.moving = true;
      return false;
    };
    if (st.state === 'look') {
      st.lookT -= dt;
      if (st.lookT <= 0 && see === 0) { st.state = st.invX != null ? 'investigate' : 'return'; }
    } else if (st.state === 'investigate') {
      if (walk(st.invX, 1.5)) {
        st.lookT = (st.lookT || 0) + dt;
        if (st.lookT > 0.9) { st.dir = -st.dir; st.lookT = -0.6; st._looks = (st._looks || 0) + 1; }
        if (st._looks >= 3) { st.state = 'return'; st.invX = null; st._looks = 0; st.lookT = 0; }
      }
    } else if (st.state === 'return') {
      if (walk(st.home)) st.state = 'patrol';
    } else {
      // patrol: walk to one end, pause and look, walk back
      if (st.pause > 0) { st.pause -= dt; if (st.pause <= 0) st.dir = -st.dir; }
      else if (walk(st.home + st.dir * st.amp)) st.pause = 1.5 + Math.random() * 2;
    }
  }
  return false;
}

/** Something made a noise at x: everyone in `radius` who hasn't started a fight comes to look. */
function makeNoise(gs, x, radius, loudness) {
  const es = exploreState;
  if (!es || gs.inCombat) return;
  const list = es.building ? curArea(es).encounters : es.encounters;
  for (const enc of list || []) {
    if (enc.triggered || enc.killed) continue;
    const st = _encInit(enc, !!es.building, es.building ? curArea(es).width : CFG.WORLD_W);
    const d = Math.abs(enc.wx - x);
    if (d > radius) continue;
    st.aware = Math.min(0.95, st.aware + (loudness || 0.15) * (1 - d / radius));
    if (st.state !== 'look') { st.state = 'investigate'; st.invX = x + randInt(-20, 20); st.lookT = 0; st._looks = 0; }
    else st.invX = x;
  }
}

/** Start the fight with this group (same as walking into them before). */
function startEncounterFight(gs, enc, px, indoor, areaW) {
  enc.triggered = true;
  let enemies;
  if (enc._savedEnemies) { enemies = enc._savedEnemies; enc._savedEnemies = null; }
  else enemies = enc.ids ? enc.ids.map(id => deepClone(ENEMY_TEMPLATES[id])).filter(Boolean)
                         : buildEncounter(enc.difficulty, enc.zone, enc.locCanHunt, gs.day);
  if (!enemies.length) return false;
  gs.mouse.down = false;
  startCombat(gs, enemies, px, enc.wx);
  gs.combat._encRef = enc;
  if (indoor && areaW) {
    for (const e of gs.combat.enemies) { while (e.worldX > areaW - 30) e.worldX -= TILE; while (e.worldX < 30) e.worldX += TILE; }
  }
  gs.inCombat = true;
  return true;
}

// ── Takedowns ────────────────────────────────────────────────────────────────

/** An unaware group right in front of you, facing away: {enc} or null. */
function takedownTarget(gs) {
  const es = exploreState;
  if (!es || gs.inCombat) return null;
  const list = es.building ? curArea(es).encounters : es.encounters;
  const px = es.building ? es.building.px : es.px;
  for (const enc of list || []) {
    if (enc.triggered || enc.killed || !enc._st) continue;
    const st = enc._st;
    const d = enc.wx - px;
    if (Math.abs(d) > TAKEDOWN_PX || st.aware >= AWARE_LOOK) continue;
    if (Math.sign(d) === st.dir || Math.abs(d) < 4) return { enc };   // their back is to you
  }
  return null;
}

/** Strike from behind: a heavy, sure hit before the fight properly starts. */
function doTakedown(gs) {
  const t = takedownTarget(gs);
  if (!t) return false;
  const es = exploreState, enc = t.enc;
  const inB = !!es.building;
  const px = inB ? es.building.px : es.px;
  if (!startEncounterFight(gs, enc, px, inB, inB ? curArea(es).width : 0)) return false;
  const c = gs.combat, p = gs.parent;
  const tgt = c.enemies.slice().sort((a, b) => Math.abs(a.worldX - px) - Math.abs(b.worldX - px))[0];
  // Blades end it quietly on ordinary people and animals; anything else hits
  // hard (stealth and strength); machines shrug off half.
  const wid = p.equipped.weapon;
  const blade = ['knife', 'machete', 'axe', 'spear'].includes(wid);
  let dmg = 10 + skillOf(p, 'stealth') * 2 + Math.max(0, p.strength - 5) * 2 + (wid && getItemDef(wid)?.weaponType === 'firearm' ? 6 : 0);
  if (blade && tgt.type !== 'machine' && !tgt.isBoss && tgt.maxHp <= 30) dmg = tgt.hp;
  else if (blade) dmg += 8;
  if (tgt.type === 'machine') dmg = Math.round(dmg * 0.6);
  tgt.hp = Math.max(0, tgt.hp - dmg);
  c.introTimer = 0.6;
  c.surprised = false; c.ambush = true; c.ambushBonus = 25;
  c.turn = 'player'; c.firstTurn = 'player'; c.pendingAction = null;
  c.openerText = 'TAKEDOWN';
  c.log.length = 0;
  const verb = tgt.type === 'machine' ? 'rip the power cell from' : tgt.type === 'animal' ? 'pounce on' : 'grab';
  combatLog(gs, `Silent takedown: you ${verb} the ${tgt.name} from behind (${dmg} dmg).`, 'good');
  _fx(gs, 'hit', tgt, dmg, px, 0);
  giveXP(p, 8, gs);
  if (tgt.hp <= 0) {
    tgt.dead = true;
    _fx(gs, 'death', tgt, 0, px, 120);
    combatLog(gs, `${tgt.name} goes down without a sound.`, 'good');
    if (typeof checkCombatVictory === 'function') checkCombatVictory(gs);
  }
  return true;
}

// ── Drawing ──────────────────────────────────────────────────────────────────

/** One patrolling group: body, the cone of what they see, and ? / ! above them. */
function drawStealthEncounter(ctx, gs, enc, groundY, now) {
  const st = enc._st;
  if (!st) return false;
  const kind = st.kind;
  const sneaking = gs.parent.sneaking;
  // Vision cone (people and machines): faint, brighter when you sneak or they're suspicious
  if (kind !== 'animal') {
    const R = sightRange(gs, enc, !!exploreState.building);
    const eyeY = groundY - (kind === 'machine' && /drone/.test(enc.previewSprite) ? 44 : 50);
    const sus = st.aware >= AWARE_LOOK;
    const base = sus ? [220, 170, 60] : kind === 'machine' ? [220, 60, 50] : [210, 210, 190];
    const a = (sus ? 0.24 : sneaking ? 0.17 : 0.11) + (kind === 'machine' ? 0.04 : 0);
    const g = ctx.createLinearGradient(enc.wx, 0, enc.wx + st.dir * R, 0);
    g.addColorStop(0, `rgba(${base},${a})`);
    g.addColorStop(0.75, `rgba(${base},${(a * 0.75).toFixed(3)})`);
    g.addColorStop(1, `rgba(${base},0)`);
    ctx.save();
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(enc.wx + st.dir * 4, eyeY);
    ctx.lineTo(enc.wx + st.dir * R, eyeY - 26);
    ctx.lineTo(enc.wx + st.dir * R, groundY + 2);
    ctx.lineTo(enc.wx + st.dir * 4, eyeY + 6);
    ctx.closePath(); ctx.fill();
    // a dotted upper edge so you can read where their view ends
    ctx.strokeStyle = `rgba(${base},${Math.min(0.5, a * 2.2)})`;
    ctx.setLineDash([2, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(enc.wx + st.dir * 4, eyeY); ctx.lineTo(enc.wx + st.dir * R * 0.8, eyeY - 21); ctx.stroke();
    ctx.restore();
  }
  const weapon = enc.ids ? enemyWeaponId({ id: enc.ids[0], index: 0 }) : 'pipe';
  _drawWorldEnemy(ctx, enc.wx, groundY, enc.previewSprite || 'human_hostile', { id: weapon }, st.dir,
                  { id: enc.ids && enc.ids[0], walking: st.moving });
  // Awareness marker
  const top = groundY - (kind === 'animal' ? 38 : 72);
  if (st.aware > 0.04) {
    const full = st.aware >= AWARE_LOOK;
    const col = st.aware > 0.75 ? '#ff5040' : full ? '#e8c040' : '#a8a890';
    ctx.save();
    ctx.globalAlpha = full ? 1 : 0.4 + st.aware;
    drawText(ctx, '?', enc.wx, top, col, full ? 14 : 11, 'center', true);
    fillRect(ctx, enc.wx - 10, top + 4, 20, 3, '#101010');
    fillRect(ctx, enc.wx - 10, top + 4, Math.round(20 * st.aware), 3, col);
    ctx.restore();
  }
  return true;
}

/** "!" that pops over whoever just started the fight. */
function drawAlertPop(ctx, enc, groundY, now) {
  const st = enc._st;
  if (!st || !st.bang || now - st.bang > 900) return;
  const k = (now - st.bang) / 900;
  ctx.save();
  ctx.globalAlpha = 1 - k * k;
  drawText(ctx, '!', enc.wx, groundY - 76 - k * 10, '#ff4030', 14, 'center', true);
  ctx.restore();
}
