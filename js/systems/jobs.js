// jobs.js — Work for the traders. Each trader offers one job at a time:
//   fetch   — bring them supplies they're short of
//   clear   — deal with raiders who keep hitting their carts at a named place
//   courier — a runner went missing; find the sealed package and bring it back
// Jobs have a deadline. Done well they pay in goods and earn trust; trust
// lowers prices and opens up their better stock. Let one lapse and trust drops.
'use strict';

ITEMS_DB.sealed_package = { id: 'sealed_package', name: 'Sealed Package', type: 'quest', weight: 1.2, value: 0, stackable: false,
  desc: 'Wrapped in tarp and tape, heavier than it looks. Not yours to open.' };

const JOB_SPEC = {
  church: {
    fetch: [['cloth', 6, 10], ['bandage', 3, 5], ['wood', 6, 10], ['canned_beans', 3, 4], ['water_bottle', 3, 5], ['rope', 1, 2]],
    clearAt: ['village', 'suburb', 'factory'],
    pay: 1.0,
    premium: ['medkit', 'antibiotics', 'leather_jacket', 'machete'],
  },
  city: {
    fetch: [['electronics', 3, 5], ['batteries', 4, 6], ['chemicals', 3, 5], ['metal', 6, 10], ['pistol_ammo', 10, 16], ['tools', 1, 1]],
    clearAt: ['suburb', 'police', 'factory', 'village'],
    pay: 1.5,
    premium: ['rifle', 'rifle_ammo', 'bulletproof_vest', 'medkit', 'shotgun_ammo'],
  },
};

function _trust(st) { return st.trust || 0; }
function _jobOf(gs, id) { return (gs.jobs || []).find(j => j.trader === id && j.state === 'active'); }
function _locName(id) { const l = LOCATIONS_DB.find(x => x.id === id); return l ? l.name : id; }

/** Roll a new job for a trader. */
function makeJob(gs, traderId) {
  const spec = JOB_SPEC[traderId];
  const roll = Math.random() * 100;
  const due = gs.day + randInt(4, 6);
  if (roll < 45) {
    const [item, lo, hi] = randChoice(spec.fetch.filter(f => getItemDef(f[0])));
    const qty = randInt(lo, hi);
    const val = getItemDef(item).value * qty;
    return { trader: traderId, kind: 'fetch', item, qty, due, reward: Math.round(val * 1.7 + 20), trust: 12, state: 'active' };
  }
  if (roll < 75) {
    const loc = randChoice(spec.clearAt);
    return { trader: traderId, kind: 'clear', loc, need: randInt(2, 3), progress: 0, due, reward: Math.round(90 * spec.pay), trust: 20, state: 'active' };
  }
  const loc = randChoice(LOCATIONS_DB.filter(l => l.id !== TRADERS[traderId].locId && l.id !== 'forest' && WORLD_MAP_POS[l.id]).map(l => l.id));
  return { trader: traderId, kind: 'courier', loc, due, reward: Math.round(75 * spec.pay), trust: 18, state: 'active', placed: false };
}

function jobText(j) {
  if (j.kind === 'fetch')   return `Bring ${j.qty} ${getItemDef(j.item).name} to ${TRADERS[j.trader].name}`;
  if (j.kind === 'clear')   return `Kill ${j.need} raiders at ${_locName(j.loc)} (${Math.min(j.progress, j.need)}/${j.need})`;
  return `Recover the sealed package at ${_locName(j.loc)}`;
}
function jobReady(gs, j) {
  if (j.kind === 'fetch')   return countInInventory(gs.parent.inventory, j.item) >= j.qty;
  if (j.kind === 'clear')   return j.progress >= j.need;
  return countInInventory(gs.parent.inventory, 'sealed_package') > 0;
}
function jobDaysLeft(gs, j) { return j.due - gs.day; }

/** Mark the target place on the map (and reveal it if it wasn't). */
function _revealLoc(gs, loc) {
  if (!loc) return;
  const un = gs.unlockedLocations || ['forest', 'church'];
  if (!un.includes(loc)) { gs.unlockedLocations = [...un, loc]; gs.mapNew = [...new Set([...(gs.mapNew || []), loc])]; }
}

/** Pay out: goods from their shelves worth about `value`. */
function _payReward(gs, traderId, value, exclude) {
  const st = traderState(gs, traderId);
  const pool = [...TRADERS[traderId].pool.map(p => p[0]), ...(_trust(st) >= 40 ? JOB_SPEC[traderId].premium : [])]
    .filter(id => id !== exclude && getItemDef(id) && getItemDef(id).value > 0);
  const got = {};
  let left = value, guard = 0;
  while (left > 6 && guard++ < 40) {
    const fits = pool.filter(id => getItemDef(id).value <= left);
    if (!fits.length) break;
    const id = randChoice(fits);
    got[id] = (got[id] || 0) + 1;
    left -= getItemDef(id).value;
  }
  for (const [id, q] of Object.entries(got)) {
    addToInventory(gs.parent.inventory, id, q);
  }
  return Object.entries(got).map(([id, q]) => `${getItemDef(id).name}${q > 1 ? ' x' + q : ''}`).join(', ');
}

/** The talk options a trader gets for jobs. */
function jobChoices(gs, traderId, root) {
  const st = traderState(gs, traderId);
  const t = TRADERS[traderId];
  const j = _jobOf(gs, traderId);
  const quote = traderId === 'church'
    ? { offer: j2 => j2.kind === 'fetch' ? `"We're short on ${getItemDef(j2.item).name.toLowerCase()}. Bring me ${j2.qty} and I'll make it worth the walk."`
                    : j2.kind === 'clear' ? `"Raiders at ${_locName(j2.loc)} have been robbing the carts that keep this place fed. I don't ask you to enjoy it. ${j2.need} of them, and the carts get through."`
                    : `"A boy ran a parcel for me to ${_locName(j2.loc)} and never came back. Find the package. If you find him... bring me his name."`,
        thanks: '"Bless you. Truly." He counts it out, then counts it again, and pushes your share across the table.',
        notyet: '"Not yet, I see. The days are short, friend."' }
    : { offer: j2 => j2.kind === 'fetch' ? `"I need ${j2.qty} ${getItemDef(j2.item).name.toLowerCase()}. Don't ask what for. You'll be paid in things that keep you breathing."`
                    : j2.kind === 'clear' ? `"Some crew in ${_locName(j2.loc)} thinks my convoys are a buffet. Make ${j2.need} of them stop thinking."`
                    : `"My runner went dark at ${_locName(j2.loc)}. The package is sealed. It stays sealed. Bring it to me and you'll like what I pay."`,
        thanks: '"Good." Vera checks it twice, then pays without haggling, which is the closest she gets to a compliment.',
        notyet: '"Then why are you standing at my counter?"' };
  const out = [];
  if (!j) {
    out.push({ label: 'Got any work?', next: () => {
      const offer = makeJob(gs, traderId);
      return {
        text: `${quote.offer(offer)}\n\nPays about ${offer.reward} in goods. ${offer.due - gs.day} days.`,
        choices: [
          { label: 'I\'ll do it.', next: () => {
              gs.jobs = (gs.jobs || []).filter(x => x.state === 'active' || x.trader !== traderId).concat([offer]);
              _revealLoc(gs, offer.loc);
              addLog(`New job: ${jobText(offer)} (by day ${offer.due}).`, 'info');
              notify('Job accepted.', 'good');
              root.text = traderId === 'church' ? '"Go with God. And come back."' : '"Clock\'s running."';
              _refreshJobChoice(gs, traderId, root);
              return root;
            } },
          { label: 'Not now.', next: () => root },
        ],
      };
    } });
  } else {
    const ready = jobReady(gs, j);
    out.push({ label: ready ? `It's done. (${jobText(j)})` : `About the job... (${jobText(j)}, ${jobDaysLeft(gs, j)}d left)`,
      reply: g => {
        if (!jobReady(g, j)) return quote.notyet;
        if (j.kind === 'fetch') removeFromInventory(g.parent.inventory, j.item, j.qty);
        if (j.kind === 'courier') removeFromInventory(g.parent.inventory, 'sealed_package', 1);
        j.state = 'done';
        setTimeout(() => _refreshJobChoice(g, traderId, root), 0);
        st.trust = Math.min(100, _trust(st) + j.trust);
        st.jobsDone = (st.jobsDone || 0) + 1;
        const paid = _payReward(g, traderId, j.reward, j.item);
        giveXP(g.parent, 25, g);
        addLog(`Job done for ${t.name}: ${paid}. Trust ${st.trust}.`, 'good');
        notify(`Paid: ${paid}`, 'good');
        if (st.trust >= 40 && !st._premiumTold) { st._premiumTold = true; return quote.thanks + ' "From now on, ask about the good stock. You\'ve earned a look at it."'; }
        return quote.thanks;
      } });
  }
  out.forEach(c => { c._job = true; });
  return out;
}

/** Swap the job line in an open conversation for the current one. */
function _refreshJobChoice(gs, traderId, root) {
  const i = root.choices.findIndex(c => c._job);
  if (i < 0) return;
  root.choices.splice(i, 1, ...jobChoices(gs, traderId, root));
  if (root._asked) delete root._asked[i];
}

// ── Hooks ────────────────────────────────────────────────────────────────────

/** Combat won: count raiders killed where a clear job points. */
function jobsOnVictory(gs, c) {
  const es = exploreState;
  if (!es || !gs.jobs) return;
  const here = es.location && es.location.id;
  const humans = c.enemies.filter(e => e.dead && e.type === 'human' && !String(e.id || '').startsWith('trader')).length;
  for (const j of gs.jobs) {
    if (j.state !== 'active' || j.kind !== 'clear' || j.loc !== here || !humans) continue;
    const was = j.progress;
    j.progress = Math.min(j.need, j.progress + humans);
    if (j.progress >= j.need && was < j.need) notify(`Job done: go back to ${TRADERS[j.trader].name}.`, 'good');
  }
}

/** Arriving somewhere: the missing runner and the package, with company. */
function jobsOnArrive(gs, es) {
  for (const j of gs.jobs || []) {
    if (j.state !== 'active' || j.kind !== 'courier' || j.loc !== es.location.id) continue;
    if (countInInventory(gs.parent.inventory, 'sealed_package') > 0) continue;
    const wx = Math.round(CFG.WORLD_W * (0.55 + Math.random() * 0.3));
    es.loot.push({ id: 'sealed_package', qty: 1, wx, wy: PLAYER_FOOT, taken: false, quest: true });
    es.bonesPiles = es.bonesPiles || [];
    es.bonesPiles.push({ wx: wx - 14 });
    // whoever got the runner is still around
    const ids = es.location.difficulty >= 3 ? ['raider_armed', 'raider'] : ['raider', 'survivor_bandit'];
    es.encounters.push({ wx: wx + 90, triggered: false, killed: false, ids, previewSprite: 'human_hostile', difficulty: es.location.difficulty || 1,
      zone: es.location.zones[0], locCanHunt: false });
  }
}

/** New day: jobs past their deadline lapse. */
function jobsDayTick(gs) {
  for (const j of gs.jobs || []) {
    if (j.state !== 'active' || gs.day <= j.due) continue;
    j.state = 'failed';
    const st = traderState(gs, j.trader);
    st.trust = Math.max(-30, _trust(st) - 10);
    addLog(`You let ${TRADERS[j.trader].name}'s job lapse. Trust ${st.trust}.`, 'warn');
  }
  if (gs.jobs && gs.jobs.length > 12) gs.jobs = gs.jobs.filter(j => j.state === 'active').concat(gs.jobs.filter(j => j.state !== 'active').slice(-6));
}

/** Trust's effect on their prices: up to 25% off. */
function trustPriceMult(gs, traderId) {
  const st = gs.traders && gs.traders[traderId];
  return st ? 1 - clamp(st.trust || 0, -30, 100) * 0.0025 : 1;
}

/** Trusted customers see the good stuff when they restock. */
function premiumStock(gs, traderId) {
  const st = gs.traders && gs.traders[traderId];
  if (!st || _trust(st) < 40 || !JOB_SPEC[traderId]) return [];
  return JOB_SPEC[traderId].premium.filter(id => getItemDef(id)).sort(() => Math.random() - 0.5).slice(0, 2).map(id => ({ id, qty: 1 }));
}

/** Active jobs for the HUD. */
function activeJobs(gs) { return (gs.jobs || []).filter(j => j.state === 'active'); }
