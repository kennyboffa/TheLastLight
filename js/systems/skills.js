// skills.js — What each attribute and skill actually does, in one place, so the
// numbers the game uses and the text the character sheet shows stay in step.
'use strict';

function skillOf(who, k) { return (who && who.skills && who.skills[k]) || 1; }
function attrOf(who, k)  { return (who && who[k]) || 5; }

// ── Searching ────────────────────────────────────────────────────────────────

/** Multiplier on how long a search takes (scavenging + intelligence). */
function searchTimeMult(who) {
  const m = 1.12 - skillOf(who, 'scavenging') * 0.06 - (attrOf(who, 'intelligence') - 5) * 0.03;
  return clamp(m, 0.45, 1.25);
}
/** Seconds a search of `c` takes for the player. */
function searchDur(c, who) {
  return c.searchDuration * (c._meticulousAdj ? 1.5 : 1) * searchTimeMult(who || GS.parent);
}
/** % chance per item found to turn up one extra (scavenging). */
function scavengeBonusPct(who) { return Math.min(45, (skillOf(who, 'scavenging') - 1) * 5); }
/** % chance to notice something tucked away that others missed (perception). */
function hiddenFindPct(who) { return clamp((attrOf(who, 'perception') - 4) * 4, 0, 28); }

// ── Locks ────────────────────────────────────────────────────────────────────

function lockpickPct(who) {
  return clamp(15 + skillOf(who, 'lockpick') * 12 + (attrOf(who, 'agility') - 5) * 2 + (attrOf(who, 'perception') - 5) * 2, 5, 95);
}
function hasCrowbar(who) {
  return who.equipped && who.equipped.weapon === 'crowbar' || (who.inventory || []).some(s => s.id === 'crowbar');
}

// ── Trade ────────────────────────────────────────────────────────────────────

/** Traders' markup on what they sell: 3x, less with bartering and charisma. */
function tradeMarkup(who) {
  return Math.round(clamp(3 - (skillOf(who, 'bartering') - 1) * 0.12 - (attrOf(who, 'charisma') - 5) * 0.06, 1.8, 3.3) * 100) / 100;
}
/** What traders pay, as a share of value (bartering). */
function sellMult(who) { return clamp(1 + (skillOf(who, 'bartering') - 1) * 0.05, 1, 1.45); }
/** Chance to talk a trader down (speech + charisma). */
function haggleChance(who) {
  return clamp(15 + skillOf(who, 'speech') * 8 + (attrOf(who, 'charisma') - 5) * 4, 5, 90);
}

/** A speech check in an event: base + speech and charisma. */
function speechPct(who, base) {
  return Math.round(clamp((base || 10) + skillOf(who, 'speech') * 8 + (attrOf(who, 'charisma') - 5) * 4, 5, 92));
}

// ── Talking hostile people down in a fight ───────────────────────────────────

const TALK_AP = 2;
/** Who will listen: people, not machines or animals, and not traders. */
function canTalkDown(c) {
  if (!c || c._traderId) return false;
  const alive = c.enemies.filter(e => !e.dead);
  return alive.length > 0 && alive.every(e => e.type === 'human');
}
function talkDownChance(gs) {
  const c = gs.combat, p = gs.parent;
  const alive = c.enemies.filter(e => !e.dead);
  let pct = 8 + skillOf(p, 'speech') * 7 + (attrOf(p, 'charisma') - 5) * 3;
  pct -= (alive.length - 1) * 8;                                      // a crowd has more pride
  if (alive.some(e => e.id === 'singularity_cultist')) pct -= 15;     // true believers
  if (alive.some(e => e.isBoss)) pct -= 20;
  if (alive.some(e => e.hp < e.maxHp * 0.5)) pct += 15;               // they're hurting
  if (c.enemies.some(e => e.dead)) pct += 10;                         // you've dropped one of them
  if (c.companion && !c.compDown) pct += 8;
  if (gs.parent.equipped.weapon && getItemDef(gs.parent.equipped.weapon)?.weaponType === 'firearm') pct += 6;
  pct -= (c.talkTries || 0) * 15;                                     // it gets old fast
  return Math.round(clamp(pct, 5, 85));
}

// ── Combat extras ────────────────────────────────────────────────────────────

/** Perception steadies your aim, mostly with guns. */
function perceptionHitBonus(who, isRanged) { return (attrOf(who, 'perception') - 5) * (isRanged ? 3 : 1); }

// ── Getting around ───────────────────────────────────────────────────────────

/** Exploration: knowing the shortcuts. Multiplier on map travel time. */
function travelMult(who) { return clamp(1.03 - skillOf(who, 'exploration') * 0.03, 0.76, 1); }
/** Exploration: pacing yourself. Multiplier on stamina use while out. */
function exploreStaminaMult(who) { return clamp(1.04 - skillOf(who, 'exploration') * 0.04, 0.7, 1); }

// ── Learning and leading ─────────────────────────────────────────────────────

/** Intelligence: XP multiplier. */
function xpMult(who) { return clamp(1 + (attrOf(who, 'intelligence') - 5) * 0.04, 0.8, 1.2); }
/** Intelligence: extra skill points on level up. */
function bonusSkillPts(who) { return attrOf(who, 'intelligence') >= 8 ? 2 : attrOf(who, 'intelligence') >= 6 ? 1 : 0; }
/** Intelligence: crafting and building time multiplier. */
function workTimeMult(who) { return clamp(1 - (attrOf(who, 'intelligence') - 5) * 0.05, 0.75, 1.2); }
/** Charisma: how fast the people around you lose heart. */
function moraleMult(who) { return clamp(1 - (attrOf(who, 'charisma') - 5) * 0.06, 0.7, 1.25); }
