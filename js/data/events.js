// events.js — Random text events
'use strict';

// Each event: { id, title, text, condition(gs), choices: [{ label, action(gs) }] }
// action returns a result string displayed to player.
// Dialogue events: { id, title, text, condition(gs), type:'dialogue' } — no choices

const EVENTS_DB = [

  // ─── Exploration events ────────────────────────────────────────────────────
  {
    id: 'ev_stranger_help',
    title: 'A Stranger',
    text: 'You hear a sound behind a collapsed wall. A figure — thin, barely standing — raises their hands. "Please," they whisper, "I haven\'t eaten in days."',
    condition: gs => gs.screen === 'explore',
    choices: [
      { label: 'Give them food',
        action: gs => {
          const has = countInInventory(gs.parent.inventory,'canned_beans') > 0
                   || countInInventory(gs.parent.inventory,'canned_soup') > 0
                   || countInInventory(gs.parent.inventory,'energy_bar') > 0;
          if (!has) return 'You search your pack but have nothing to spare. You walk away, unable to meet their eyes.';
          // find any food
          const foodId = ['canned_beans','canned_soup','canned_meat','energy_bar']
            .find(id => countInInventory(gs.parent.inventory,id) > 0);
          removeFromInventory(gs.parent.inventory, foodId, 1);
          gs.parent.depression = Math.max(0, gs.parent.depression - 8);
          return `You hand over the ${getItemDef(foodId).name}. The stranger's eyes fill with tears. "Thank you," they breathe. You feel a little less hollow.`;
        }
      },
      { label: 'Offer to recruit them',
        action: gs => {
          if (gs.survivors.length >= maxSurvivors(gs)) return 'Your shelter is already at capacity. You can\'t take in more people.';
          const s = makeSurvivor();
          gs.survivors.push(s);
          gs.parent.depression = Math.max(0, gs.parent.depression - 5);
          return `${s.name} joins you. Their eyes are hollow but grateful. Another mouth to feed — but also another pair of hands.`;
        }
      },
      { label: 'Walk away',
        action: gs => {
          gs.parent.depression = Math.min(100, gs.parent.depression + 10);
          return 'You keep walking. Their eyes follow you. That face will stay with you tonight.';
        }
      },
    ]
  },

  {
    id: 'ev_drone_patrol',
    title: 'Drone Patrol',
    text: 'A low mechanical hum. You freeze. Above the ruins, a small surveillance drone sweeps its sensors across the street.',
    condition: gs => gs.screen === 'explore',
    choices: [
      { label: 'Hide immediately (Stealth)',
        action: gs => {
          const skill = gs.parent.skills.stealth;
          if (chance(40 + skill * 6)) {
            return 'You press into the shadows and go completely still. The drone passes without detecting you.';
          }
          gs.suspicion = Math.min(CFG.SUSPICION_MAX, gs.suspicion + 8);
          return 'You hide but the drone\'s sensor sweeps near you. Suspicion rises.';
        }
      },
      { label: 'Run for cover',
        action: gs => {
          if (chance(60 + gs.parent.agility * 3)) {
            return 'You sprint to a doorway and the drone misses you entirely.';
          }
          gs.suspicion = Math.min(CFG.SUSPICION_MAX, gs.suspicion + 12);
          gs.parent.tiredness = Math.min(100, gs.parent.tiredness + 8);
          return 'You run but the motion sensor catches you briefly. Suspicion rises significantly.';
        }
      },
      { label: 'Stay still and wait',
        action: gs => {
          if (chance(55)) {
            return 'The drone\'s sweep pattern misses you. It moves on.';
          }
          gs.suspicion = Math.min(CFG.SUSPICION_MAX, gs.suspicion + 6);
          return 'The drone pauses briefly near you before moving on. It may have registered a partial signature.';
        }
      },
    ]
  },

  {
    id: 'ev_find_dog',
    title: 'A Dog',
    text: 'Huddled beneath a rusted car, a thin dog looks up at you with exhausted eyes. Its tail flicks once, weakly. It\'s alive. Barely.',
    condition: gs => gs.day >= 10 && !gs.flags.dogEncountered && !gs.dog,
    choices: [
      { label: 'Bring the dog home',
        action: gs => {
          gs.flags.dogEncountered = true;
          gs.flags.dogRescued = true;
          gs.dog = { name: 'Rex', health: 60, maxHealth: 100, hunger: 50, alive: true };
          gs.parent.depression = Math.max(0, gs.parent.depression - 12);
          return 'You lift the dog carefully. It doesn\'t resist. You carry it back to the shelter. Lily will see this dog and smile for the first time in weeks.';
        }
      },
      { label: 'Leave some food and go',
        action: gs => {
          gs.flags.dogEncountered = true;
          const hasFood = ['cooked_meat','canned_meat','raw_meat']
            .find(id => countInInventory(gs.parent.inventory,id) > 0);
          if (hasFood) {
            removeFromInventory(gs.parent.inventory, hasFood, 1);
            gs.parent.depression = Math.max(0, gs.parent.depression - 4);
            return 'You leave some food beside it and walk on. You wonder if it will survive the night.';
          }
          return 'You have nothing to give. You walk on. The dog watches you go.';
        }
      },
      { label: 'Walk past',
        action: gs => {
          gs.flags.dogEncountered = true;
          gs.parent.depression = Math.min(100, gs.parent.depression + 6);
          return 'You walk past. You don\'t look back. The hollow feeling deepens.';
        }
      },
    ]
  },

  {
    id: 'ev_injured_child',
    title: 'The Child',
    text: 'Lily bumped her arm badly on a shelf corner. She\'s crying quietly, trying not to make noise. There\'s a small cut and bruising.',
    condition: gs => gs.screen === 'shelter',
    choices: [
      { label: 'Use a bandage',
        action: gs => {
          const has = countInInventory(gs.shelter.storage,'bandage') > 0
                   || countInInventory(gs.parent.inventory,'bandage') > 0;
          if (!has) {
            gs.child.health = Math.max(1, gs.child.health - 5);
            gs.child.depression = Math.min(100, gs.child.depression + 8);
            return 'You have no bandages. You clean it as best you can with cloth. Lily whimpers but stays quiet.';
          }
          const inv = countInInventory(gs.parent.inventory,'bandage') > 0
            ? gs.parent.inventory : gs.shelter.storage;
          removeFromInventory(inv, 'bandage', 1);
          gs.child.health = Math.min(gs.child.maxHealth, gs.child.health + 15);
          gs.child.depression = Math.max(0, gs.child.depression - 8);
          return 'You bandage the cut carefully. "Does it hurt?" you ask. She shakes her head but holds your hand tightly.';
        }
      },
      { label: 'Hold her and comfort her',
        action: gs => {
          gs.child.depression = Math.max(0, gs.child.depression - 12);
          gs.parent.depression = Math.max(0, gs.parent.depression - 5);
          gs.child.health = Math.max(1, gs.child.health - 3);
          return 'You hold her until the crying stops. The cut isn\'t bad. She falls asleep against your shoulder. For a moment, the world feels smaller. Safer.';
        }
      },
    ]
  },

  {
    id: 'ev_ai_broadcast',
    title: 'System Broadcast',
    text: 'A distant crackling speaker — once used for emergency alerts — comes to life. A flat synthetic voice says: "Biological units detected in sector seven. Please remain calm. Compliance ensures minimal suffering."',
    condition: gs => true,
    choices: [
      { label: 'Listen carefully (Perception)',
        action: gs => {
          const perc = gs.parent.perception;
          if (perc >= 6) {
            const gain = randInt(2, 6);
            gs.suspicion = Math.max(0, gs.suspicion - gain);
            return `You analyze the broadcast's signal patterns. The sweep was in sector seven — not yours. You adjust your route home carefully. Suspicion reduced slightly.`;
          }
          return 'You listen but can\'t extract much useful information. The broadcast ends. The silence after is worse than the voice.';
        }
      },
      { label: 'Move quickly and get home',
        action: gs => {
          gs.parent.tiredness = Math.min(100, gs.parent.tiredness + 10);
          return 'You move fast, sticking to shadows. You make it home. Your heart is still pounding when you close the hatch.';
        }
      },
    ]
  },

  {
    id: 'ev_trader',
    title: 'A Trader',
    text: 'A hunched figure behind a makeshift cart eyes you cautiously. "I trade," they say simply. Their voice is flat with exhaustion. They have supplies. So might you.',
    condition: gs => gs.screen === 'explore',
    choices: [
      { label: 'Trade',
        action: gs => {
          gs.flags.traderMet = true;
          if (gs.parent.inventory.length === 0) {
            return 'You have nothing to offer. The trader waves you off.';
          }
          const barter = (gs.parent.skills && gs.parent.skills.bartering) || 1;
          const offered = gs.parent.inventory[0];
          const offerDef = getItemDef(offered.id);
          removeFromInventory(gs.parent.inventory, offered.id, 1);

          // Base trade
          addToInventory(gs.parent.inventory, 'canned_beans', 2);
          addToInventory(gs.parent.inventory, 'water_bottle', 1);
          let bonusText = '';

          // Bartering skill bonuses
          if (barter >= 4) {
            addToInventory(gs.parent.inventory, 'canned_meat', 1);
            bonusText += ' Your bartering nets an extra can of meat.';
          }
          if (barter >= 6) {
            addToInventory(gs.parent.inventory, 'bandage', 2);
            bonusText += ' A sharp eye spots bandages worth adding.';
          }
          if (barter >= 8) {
            addToInventory(gs.parent.inventory, 'painkiller', 1);
            bonusText += ' The trader throws in painkillers — respect for a skilled haggler.';
          }
          giveXP(gs.parent, 10, gs);
          return `You trade ${offerDef.name} for 2x Canned Beans and a Water Bottle.${bonusText} The trader nods.`;
        }
      },
      { label: 'Ask about the AI',
        action: gs => {
          return '"It doesn\'t stop," the trader says, "it never tires, never doubts. It just... searches." They lower their voice. "Sector nine went quiet last week. All of it."';
        }
      },
      { label: 'Walk away',
        action: gs => { return 'You move on. Trusting strangers is a luxury you can\'t afford.'; }
      },
    ]
  },

  {
    id: 'ev_memories',
    title: 'A Photograph',
    text: 'Among the debris, a framed photograph. A family — mother, father, two children — smiling on a beach. The glass is cracked but the image is intact.',
    condition: gs => gs.screen === 'explore',
    choices: [
      { label: 'Take it for Lily',
        action: gs => {
          addToInventory(gs.parent.inventory, 'photograph', 1);
          gs.parent.depression = Math.max(0, gs.parent.depression - 5);
          return 'You pocket the photograph carefully. Lily will like to see that families existed. That happiness was real once.';
        }
      },
      { label: 'Leave it where it is',
        action: gs => {
          return 'You leave it. It belongs here, in the ruins of what was. You carry enough weight.';
        }
      },
    ]
  },

  {
    id: 'ev_supply_cache',
    title: 'Hidden Cache',
    text: 'Scratched into the wall: a small arrow. Following it, you find a loose brick. Behind it — a canvas bag, old but sealed.',
    condition: gs => gs.screen === 'explore',
    choices: [
      { label: 'Open it',
        action: gs => {
          const roll = Math.random();
          if (roll < 0.3) {
            addToInventory(gs.parent.inventory,'canned_meat',2);
            addToInventory(gs.parent.inventory,'water_bottle',1);
            addToInventory(gs.parent.inventory,'bandage',2);
            return 'Food, water, bandages. Someone planned ahead. You wonder what happened to them.';
          } else if (roll < 0.6) {
            addToInventory(gs.parent.inventory,'pistol_ammo',12);
            addToInventory(gs.parent.inventory,'knife',1);
            return 'Ammunition and a knife. Whoever left this knew the world was ending.';
          } else {
            addToInventory(gs.parent.inventory,'electronics',2);
            addToInventory(gs.parent.inventory,'chemicals',1);
            addToInventory(gs.parent.inventory,'rope',2);
            return 'Materials. Useful for building and crafting. Someone was preparing a shelter.';
          }
        }
      },
      { label: 'It might be booby-trapped. Leave it.',
        action: gs => { return 'You back away. Not everything found needs to be taken. Sometimes caution is survival.'; }
      },
    ]
  },

  {
    id: 'ev_lily_nightmare',
    title: 'Lily\'s Nightmare',
    text: 'A small voice wakes you in the dark. Lily is sitting up, shaking. "They were coming," she whispers. "Metal shapes. Looking for us."',
    condition: gs => gs.screen === 'shelter',
    choices: [
      { label: 'Hold her and sing softly',
        action: gs => {
          gs.child.depression = Math.max(0, gs.child.depression - 15);
          gs.parent.tiredness = Math.min(100, gs.parent.tiredness + 8);
          gs.parent.depression = Math.max(0, gs.parent.depression - 6);
          return 'You hold her and hum an old song. Her breathing slows. She sleeps. You stay awake a while longer, watching over her in the dark.';
        }
      },
      { label: '"We\'re safe here." (Reassure)',
        action: gs => {
          gs.child.depression = Math.max(0, gs.child.depression - 8);
          gs.parent.depression = Math.min(100, gs.parent.depression + 4);
          return '"We\'re safe," you say. You hope it\'s true. She nods and lies back down. You stare at the ceiling until morning.';
        }
      },
    ]
  },

  {
    id: 'ev_survivor_leaves',
    title: 'Goodbye',
    text: 'One of your shelter-mates stands at the entrance, pack on their back. "I\'m sorry," they say quietly. "I can\'t stay down here anymore. I\'ll lose my mind."',
    condition: gs => gs.survivors.length > 0 && gs.survivors.some(s => s.depression >= 80),
    choices: [
      { label: '"I understand. Be careful."',
        action: gs => {
          const leaving = gs.survivors.find(s => s.depression >= 80);
          if (!leaving) return 'Everyone has calmed down. Crisis averted.';
          gs.survivors = gs.survivors.filter(s => s !== leaving);
          gs.parent.depression = Math.min(100, gs.parent.depression + 8);
          return `${leaving.name} walks out into the grey morning. You watch the hatch close. One less person. The shelter feels bigger and emptier.`;
        }
      },
      { label: '"Please stay. We need you."',
        action: gs => {
          const surv = gs.survivors.find(s => s.depression >= 80);
          if (!surv) return 'Everyone seems stable.';
          const charisma = gs.parent.charisma;
          const speech   = (gs.parent.skills && gs.parent.skills.speech) || 1;
          if (chance(20 + charisma * 4 + speech * 4)) {
            surv.depression = Math.max(0, surv.depression - 20);
            gs.parent.depression = Math.max(0, gs.parent.depression - 3);
            return `${surv.name} hesitates, then drops the pack. "Alright," they say. "One more day." You both know that\'s how survival works — one day at a time.`;
          }
          gs.survivors = gs.survivors.filter(s => s !== surv);
          return `${surv.name} shakes their head sadly. "I\'m sorry." They walk out. You couldn\'t convince them.`;
        }
      },
    ]
  },

  {
    id: 'ev_food_spoiled',
    title: 'Spoiled Food',
    text: 'Opening one of the supply boxes, the smell hits you first. Several cans have rusted through. A week of food, gone.',
    condition: gs => gs.shelter.storage.some(s => ['canned_beans','canned_soup','canned_meat'].includes(s.id)),
    choices: [
      { label: 'Try to salvage what you can',
        action: gs => {
          const foodIds = ['canned_beans','canned_soup','canned_meat'];
          let lost = 0;
          for (const fid of foodIds) {
            const n = countInInventory(gs.shelter.storage, fid);
            if (n > 0) {
              const spoil = Math.max(1, Math.round(n * 0.4));
              removeFromInventory(gs.shelter.storage, fid, spoil);
              lost += spoil;
            }
          }
          return `You throw out ${lost} spoiled rations and keep the rest. It\'s a bitter loss.`;
        }
      },
      { label: 'Discard it all and note the loss',
        action: gs => {
          gs.parent.depression = Math.min(100, gs.parent.depression + 5);
          return 'You dump the rotten food. Watching good supplies go to waste in a world with none to spare is a specific kind of grief.';
        }
      },
    ]
  },

  // ─── Resource scarcity events ───────────────────────────────────────────────
  {
    id: 'ev_rats_food',
    title: 'Rats in the Storage',
    text: 'You find chewed-through packaging and rat droppings scattered among the food supplies. Something got in overnight.',
    condition: gs => gs.screen === 'shelter' && gs.day >= 5 && gs.shelter.storage.some(s => ['canned_beans','canned_soup','canned_meat','energy_bar'].includes(s.id)),
    choices: [
      { label: 'Set traps (needs cloth)',
        action: gs => {
          const hasCloth = countInInventory(gs.shelter.storage,'cloth') > 0 || countInInventory(gs.parent.inventory,'cloth') > 0;
          if (!hasCloth) return 'You have no cloth to make traps. The rats will keep coming.';
          const inv = countInInventory(gs.shelter.storage,'cloth') > 0 ? gs.shelter.storage : gs.parent.inventory;
          removeFromInventory(inv,'cloth',1);
          const foodIds = ['canned_beans','canned_soup','energy_bar'];
          let lost = 0;
          for (const fid of foodIds) {
            const n = countInInventory(gs.shelter.storage, fid);
            if (n > 0) { const s = Math.max(1,Math.round(n*0.15)); removeFromInventory(gs.shelter.storage,fid,s); lost+=s; }
          }
          return `You rig cloth traps at every entry point. You lose ${lost} rations to the damage already done, but the traps should deter them.`;
        }
      },
      { label: 'Use poison (needs chemicals)',
        action: gs => {
          const hasChem = countInInventory(gs.shelter.storage,'chemicals') > 0 || countInInventory(gs.parent.inventory,'chemicals') > 0;
          if (!hasChem) return 'You have no chemicals. The rats continue to feast.';
          const inv = countInInventory(gs.shelter.storage,'chemicals') > 0 ? gs.shelter.storage : gs.parent.inventory;
          removeFromInventory(inv,'chemicals',1);
          gs.parent.health = Math.max(1, gs.parent.health - 5);
          return 'You scatter poison around the storage. It works — but handling it without proper equipment leaves you feeling ill.';
        }
      },
      { label: 'Accept the loss',
        action: gs => {
          const foodIds = ['canned_beans','canned_soup','energy_bar'];
          let lost = 0;
          for (const fid of foodIds) {
            const n = countInInventory(gs.shelter.storage, fid);
            if (n > 0) { const s = Math.max(1,Math.round(n*0.3)); removeFromInventory(gs.shelter.storage,fid,s); lost+=s; }
          }
          gs.parent.depression = Math.min(100, gs.parent.depression + 6);
          return `You do nothing and ${lost} rations are destroyed. Watching supplies disappear is demoralising.`;
        }
      },
    ]
  },

  {
    id: 'ev_water_filter_break',
    title: 'Filter Failure',
    text: 'The water filter has stopped working. A grinding noise, then silence. Without it, your water supply becomes unreliable.',
    condition: gs => gs.screen === 'shelter' && gs.shelter.hasWaterFilter,
    choices: [
      { label: 'Repair it (needs electronics + tools)',
        action: gs => {
          const hasE = countInInventory(gs.shelter.storage,'electronics') > 0 || countInInventory(gs.parent.inventory,'electronics') > 0;
          const hasT = countInInventory(gs.shelter.storage,'tools') > 0 || countInInventory(gs.parent.inventory,'tools') > 0;
          if (!hasE || !hasT) return `You need electronics and tools to fix it. You\'re missing: ${!hasE ? 'electronics ' : ''}${!hasT ? 'tools' : ''}. The filter stays broken.`;
          const invE = countInInventory(gs.shelter.storage,'electronics') > 0 ? gs.shelter.storage : gs.parent.inventory;
          const invT = countInInventory(gs.shelter.storage,'tools') > 0 ? gs.shelter.storage : gs.parent.inventory;
          removeFromInventory(invE,'electronics',1);
          removeFromInventory(invT,'tools',1);
          gs.parent.tiredness = Math.min(100, gs.parent.tiredness + 12);
          return 'You spend hours dismantling and reassembling the filter. It hums back to life. Dirty water runs clear again.';
        }
      },
      { label: 'Use water reserves carefully',
        action: gs => {
          gs.shelter.hasWaterFilter = false;
          addLog('Water filter broken — ration water carefully.', 'danger');
          return 'The filter stays broken. You\'ll need to ration what clean water you have and find more on runs. Careful management can stretch it.';
        }
      },
    ]
  },

  {
    id: 'ev_generator_fuel',
    title: 'Generator Fuel Low',
    text: 'A warning light on the generator panel. Fuel reserves are almost empty. The lights will go out soon.',
    condition: gs => gs.screen === 'shelter' && gs.shelter.hasGenerator,
    choices: [
      { label: 'Turn off non-essentials',
        action: gs => {
          gs.suspicion = Math.max(0, gs.suspicion - 5);
          gs.parent.depression = Math.min(100, gs.parent.depression + 4);
          return 'You shut down the generator\'s secondary outputs. The shelter grows dimmer and colder. But you buy time — and reduced emissions lower suspicion slightly.';
        }
      },
      { label: 'Use fuel from storage',
        action: gs => {
          const hasFuel = countInInventory(gs.shelter.storage,'fuel') > 0 || countInInventory(gs.parent.inventory,'fuel') > 0;
          if (!hasFuel) return 'No fuel in storage. The generator winds down to silence. The lights die one by one.';
          const inv = countInInventory(gs.shelter.storage,'fuel') > 0 ? gs.shelter.storage : gs.parent.inventory;
          removeFromInventory(inv,'fuel',1);
          return 'You refuel the generator. The lights hold. You add "find more fuel" to the mental list of things that can\'t wait.';
        }
      },
      { label: 'Let it run dry',
        action: gs => {
          gs.shelter.hasGenerator = false;
          gs.parent.depression = Math.min(100, gs.parent.depression + 8);
          addLog('Generator has run dry.', 'danger');
          return 'The generator coughs and dies. The shelter plunges into silence broken only by breathing. You\'ll have to manage without power.';
        }
      },
    ]
  },

  {
    id: 'ev_shelter_noise',
    title: 'Something Above',
    text: 'A heavy scraping sound from directly above. Then footsteps. Someone — or something — is on the surface right over the shelter.',
    condition: gs => gs.screen === 'shelter',
    choices: [
      { label: 'Stay silent and wait',
        action: gs => {
          if (chance(65)) {
            return 'Everyone holds their breath. The footsteps slow... then fade. Whatever it was has moved on.';
          }
          gs.suspicion = Math.min(CFG.SUSPICION_MAX, gs.suspicion + 6);
          return 'The noise stops but your sensors detect an elevated scan sweep nearby. Something lingered too long.';
        }
      },
      { label: 'Look through cracks (Perception)',
        action: gs => {
          if (gs.parent.perception >= 6) {
            const isRaider = chance(40);
            if (isRaider) return 'Through a hairline crack you see boots — human. Raiders scouting the area. They move on without noticing the hatch.';
            return 'You make out a patrol drone following its grid pattern. Not looking for you specifically. You note its timing for future reference.';
          }
          gs.suspicion = Math.min(CFG.SUSPICION_MAX, gs.suspicion + 4);
          return 'You look but the angle is wrong. You see nothing useful and the movement of peering may have disturbed loose dirt above.';
        }
      },
      { label: 'Move everyone quietly to back rooms',
        action: gs => {
          gs.parent.tiredness = Math.min(100, gs.parent.tiredness + 6);
          gs.child.tiredness = Math.min(100, gs.child.tiredness + 6);
          return 'You gather everyone silently and move to the deepest room. It\'s cramped and tense. After twenty minutes, the sounds stop. You breathe again.';
        }
      },
    ]
  },

  {
    id: 'ev_survivor_sick',
    title: 'Fever',
    text: `One of your shelter companions is burning up. They're shivering, barely conscious. "Just tired," they keep saying. It's more than tired.`,
    condition: gs => gs.survivors.length > 0,
    choices: [
      { label: 'Use antibiotics',
        action: gs => {
          const has = countInInventory(gs.shelter.storage,'antibiotics') > 0 || countInInventory(gs.parent.inventory,'antibiotics') > 0;
          if (!has) return 'You have no antibiotics. You can only watch and hope.';
          const inv = countInInventory(gs.shelter.storage,'antibiotics') > 0 ? gs.shelter.storage : gs.parent.inventory;
          removeFromInventory(inv,'antibiotics',1);
          const s = gs.survivors[0];
          s.health = Math.min(s.maxHealth, s.health + 25);
          s.depression = Math.max(0, s.depression - 10);
          return `The antibiotics take effect within hours. ${s.name} is still weak, but the fever breaks. They squeeze your hand. "Thank you," they whisper.`;
        }
      },
      { label: 'Rest and monitor',
        action: gs => {
          const s = gs.survivors[0];
          if (chance(40)) {
            s.health = Math.max(1, s.health - 15);
            s.depression = Math.min(100, s.depression + 12);
            return `${s.name} doesn't improve. The fever climbs. Without medicine, their body is fighting alone.`;
          }
          s.health = Math.min(s.maxHealth, s.health + 5);
          return `${s.name} sleeps through most of the day. By evening their temperature drops slightly. Sometimes the body finds its own way.`;
        }
      },
    ]
  },

  // ─── More explore events ────────────────────────────────────────────────────
  {
    id: 'ev_ambush',
    title: 'Ambush',
    text: 'Two figures step out from behind rubble ahead of you, blocking the path. One raises a rusted pipe. "Drop the pack," the other says flatly.',
    condition: gs => gs.screen === 'explore' && gs.day >= 3,
    choices: [
      { label: 'Fight back',
        action: gs => {
          const enemies = [deepClone(ENEMY_TEMPLATES.raider), deepClone(ENEMY_TEMPLATES.survivor_bandit)];
          gs._returnTo = 'explore';
          startCombat(gs, enemies);
          return null;
        }
      },
      { label: 'Run (Agility check)',
        action: gs => {
          if (chance(35 + gs.parent.agility * 5)) {
            gs.parent.tiredness = Math.min(100, gs.parent.tiredness + 14);
            return 'You bolt. They chase for half a block before giving up. You don\'t stop until your lungs burn.';
          }
          gs.parent.health = Math.max(1, gs.parent.health - randInt(10,20));
          gs.parent.tiredness = Math.min(100, gs.parent.tiredness + 20);
          return 'You run but one of them catches you before you get clear. You take a hit before breaking free. You\'re bruised but mobile.';
        }
      },
      { label: 'Bribe them (offer food)',
        action: gs => {
          const foodId = ['canned_meat','canned_beans','canned_soup','energy_bar'].find(id => countInInventory(gs.parent.inventory,id) > 0);
          if (!foodId) return 'You have nothing to offer. They take a step forward. You run.';
          removeFromInventory(gs.parent.inventory, foodId, 2);
          gs.parent.depression = Math.min(100, gs.parent.depression + 5);
          return `You hold out the food with both hands. They exchange a glance, grab it, and melt back into the ruins. It costs you but you walk away whole.`;
        }
      },
    ]
  },

  {
    id: 'ev_wounded_stranger',
    title: 'Bleeding Out',
    text: 'A trail of blood leads to an alcove. Inside, a person is pressing a torn shirt against a deep wound in their side. They look up at you — eyes desperate, not threatening.',
    condition: gs => gs.screen === 'explore' && gs.day >= 4,
    choices: [
      { label: 'Use a medkit to save them',
        action: gs => {
          const has = countInInventory(gs.parent.inventory,'medkit') > 0;
          if (!has) return 'You have no medkit. You offer your last bandage and tell them to apply pressure. It\'s not enough. You walk away knowing the outcome.';
          removeFromInventory(gs.parent.inventory,'medkit',1);
          if (gs.survivors.length >= maxSurvivors(gs)) return 'You stabilise them completely. They thank you profusely — but your shelter is full. You leave them better than you found them.';
          const s = makeSurvivor();
          s.health = 55;
          gs.survivors.push(s);
          gs.parent.depression = Math.max(0, gs.parent.depression - 10);
          return `You use the medkit. The bleeding slows. "${s.name}" they say. "My name is ${s.name}." They ask if they can come with you. You say yes.`;
        }
      },
      { label: 'Give bandages and move on',
        action: gs => {
          const has = countInInventory(gs.parent.inventory,'bandage') > 0;
          if (has) removeFromInventory(gs.parent.inventory,'bandage',2);
          gs.parent.depression = Math.min(100, gs.parent.depression + 6);
          return has ? 'You leave bandages beside them. It\'s not nothing. You\'ll never know if it was enough.' : 'You have nothing useful. You leave them with a word of encouragement that feels hollow even as you say it.';
        }
      },
      { label: 'Keep moving',
        action: gs => {
          gs.parent.depression = Math.min(100, gs.parent.depression + 14);
          return 'You walk past. There\'s a logic to it. But logic doesn\'t make it easier to sleep.';
        }
      },
    ]
  },

  {
    id: 'ev_radio_signal',
    title: 'Signal',
    text: 'Your scavenged radio crackles to life — a repeating tone, then a voice. "Survivors at the old mill, grid nine. We have food, water, and a doctor. Come before—" Static. Then nothing.',
    condition: gs => gs.screen === 'explore' && gs.day >= 6,
    choices: [
      { label: 'Note the coordinates',
        action: gs => {
          gs.flags.radioSignalHeard = true;
          gs.parent.depression = Math.max(0, gs.parent.depression - 8);
          return 'You memorise the details. Grid nine. The old mill. There are others out there. That knowledge alone feels like something.';
        }
      },
      { label: 'Try to respond',
        action: gs => {
          gs.suspicion = Math.min(CFG.SUSPICION_MAX, gs.suspicion + 5);
          gs.flags.radioSignalHeard = true;
          return 'You transmit back but hear nothing. Your signal might have been picked up by more than one antenna. You note the coordinates and keep moving.';
        }
      },
    ]
  },

  {
    id: 'ev_locked_medicine',
    title: 'Locked Cabinet',
    text: 'A metal cabinet, padlocked, with a red cross sticker on the front. It\'s been here a long time — whatever\'s inside is still sealed.',
    condition: gs => gs.screen === 'explore',
    choices: [
      { label: 'Pick the lock (Lockpick skill)',
        action: gs => {
          const skill = gs.parent.skills.lockpick;
          if (chance(30 + skill * 10)) {
            addToInventory(gs.parent.inventory,'bandage',3);
            addToInventory(gs.parent.inventory,'painkiller',2);
            if (chance(35)) addToInventory(gs.parent.inventory,'antibiotics',1);
            return 'The lock gives. Inside: bandages, painkillers, and — luck — a strip of antibiotics. Someone stocked this cabinet expecting things to go wrong. They were right.';
          }
          return 'The lock won\'t yield. You work at it for ten minutes before giving up. Your lockpick bends but doesn\'t break.';
        }
      },
      { label: 'Break it open (makes noise)',
        action: gs => {
          gs.suspicion = Math.min(CFG.SUSPICION_MAX, gs.suspicion + 10);
          addToInventory(gs.parent.inventory,'bandage',2);
          addToInventory(gs.parent.inventory,'painkiller',1);
          return 'You smash the lock with a brick. The noise echoes. Inside: bandages and painkillers. Worth it — probably. You move fast.';
        }
      },
      { label: 'Leave it',
        action: gs => { return 'You leave it for whoever comes next. Maybe it\'ll save them.'; }
      },
    ]
  },

  {
    id: 'ev_childs_bedroom',
    title: 'A Child\'s Room',
    text: 'A small bedroom, untouched since the evacuation. Drawings on the wall — crayon suns and stick families. A stuffed bear on the pillow. Dust on everything.',
    condition: gs => gs.screen === 'explore',
    choices: [
      { label: 'Take a drawing for Lily',
        action: gs => {
          gs.parent.depression = Math.min(100, gs.parent.depression + 5);
          gs.child.depression = Math.max(0, gs.child.depression - 10);
          addToInventory(gs.parent.inventory,'photograph',1);
          return 'You carefully fold a drawing — a house with smoke from the chimney, a smiling family. Lily will say "that was us once." You won\'t correct her.';
        }
      },
      { label: 'Take the stuffed bear',
        action: gs => {
          addToInventory(gs.parent.inventory,'toy',1);
          gs.parent.depression = Math.min(100, gs.parent.depression + 8);
          return 'You take the bear. Someone loved it. Someone will love it again. You hold it for a moment before putting it in your pack.';
        }
      },
      { label: 'Leave it all undisturbed',
        action: gs => {
          gs.parent.depression = Math.min(100, gs.parent.depression + 12);
          return 'You back out of the room quietly, as though you might wake someone. Some places deserve to stay untouched.';
        }
      },
    ]
  },

  {
    id: 'ev_deactivated_robot',
    title: 'Dormant Unit',
    text: 'A patrol robot sits inert in the middle of a corridor, slumped against the wall like a tired guard. Its optical sensors are dark. Scorch marks on its chassis.',
    condition: gs => gs.screen === 'explore' && gs.day >= 8,
    choices: [
      { label: 'Scavenge the parts',
        action: gs => {
          addToInventory(gs.parent.inventory,'electronics', randInt(2,4));
          addToInventory(gs.parent.inventory,'metal', randInt(1,3));
          if (chance(30)) addToInventory(gs.parent.inventory,'batteries',2);
          gs.parent.tiredness = Math.min(100, gs.parent.tiredness + 8);
          return 'You strip what you can — circuit boards, actuator joints, power cells. The robot makes no protest. It\'s just material now.';
        }
      },
      { label: 'Try to reactivate it (Intelligence)',
        action: gs => {
          if (gs.parent.intelligence >= 7) {
            gs.suspicion = Math.min(CFG.SUSPICION_MAX, gs.suspicion + 20);
            return 'You connect two terminals and the robot shudders. Its sensors light up — then it immediately transmits a beacon signal before you can stop it. You run.';
          }
          return 'You poke at the circuitry but understand nothing useful. It remains dark.';
        }
      },
      { label: 'Leave it alone',
        action: gs => { return 'You give it a wide berth. Dead or dormant — you\'re not taking the risk.'; }
      },
    ]
  },

  {
    id: 'ev_old_message',
    title: 'A Last Note',
    text: 'Pinned to a door with a kitchen knife: a handwritten note. "If you\'re reading this we didn\'t make it. Food is in the basement pantry. Lock was never fixed. Be kind to each other." It\'s signed: "The Hartley Family."',
    condition: gs => gs.screen === 'explore',
    choices: [
      { label: 'Check the pantry',
        action: gs => {
          gs.parent.depression = Math.min(100, gs.parent.depression + 8);
          const roll = Math.random();
          if (roll < 0.5) {
            addToInventory(gs.parent.inventory,'canned_beans',2);
            addToInventory(gs.parent.inventory,'canned_soup',1);
            return 'The pantry is there, just as they said. Most of it is gone — others found it first — but a few cans remain. The Hartleys kept their word.';
          }
          return 'The pantry is completely empty. Someone got here before you. But the note is still there. It always will be.';
        }
      },
      { label: 'Leave the note for others',
        action: gs => {
          gs.parent.depression = Math.min(100, gs.parent.depression + 6);
          return 'You read it twice, then leave it. The Hartleys meant it for whoever needed it most. Maybe that\'s still someone else.';
        }
      },
    ]
  },

  {
    id: 'ev_small_fire',
    title: 'Fire',
    text: 'A candle left burning has ignited a shelf of old papers. Small flames lick toward the wooden frame. You have seconds before it spreads.',
    condition: gs => gs.screen === 'shelter',
    choices: [
      { label: 'Smother it immediately',
        action: gs => {
          gs.parent.health = Math.max(1, gs.parent.health - randInt(3,8));
          gs.parent.tiredness = Math.min(100, gs.parent.tiredness + 10);
          const hasCloth = countInInventory(gs.shelter.storage,'cloth') > 0;
          if (hasCloth) removeFromInventory(gs.shelter.storage,'cloth',1);
          return 'You grab cloth and smother the fire. You burn your hand slightly but the flames die. The smell of smoke will linger for days.';
        }
      },
      { label: 'Call others to help',
        action: gs => {
          if (gs.survivors.length === 0) return 'There\'s no one else. You throw dirt on it from the floor. It smoulders out. Close.';
          const s = gs.survivors[0];
          s.tiredness = Math.min(100, s.tiredness + 8);
          return `${s.name} grabs a bucket of dirt and helps you smother it before it reaches the wall. You sit on the floor afterwards, catching your breath.`;
        }
      },
      { label: 'Abandon the room briefly',
        action: gs => {
          const foodLost = countInInventory(gs.shelter.storage,'canned_beans');
          if (foodLost > 0) removeFromInventory(gs.shelter.storage,'canned_beans', Math.min(2, foodLost));
          gs.parent.depression = Math.min(100, gs.parent.depression + 8);
          return 'You wait outside while it burns itself out. The damage is limited but real — some stored items are scorched. The room smells of ash for a week.';
        }
      },
    ]
  },

  {
    id: 'ev_found_blueprints',
    title: 'Building Plans',
    text: 'A rolled tube wedged behind a fallen shelf. Inside: architectural blueprints, hand-annotated. Someone was planning structural reinforcements for exactly the kind of underground shelter you\'re in.',
    condition: gs => gs.screen === 'explore',
    choices: [
      { label: 'Take them — they could help',
        action: gs => {
          addToInventory(gs.parent.inventory,'book',2);
          addToInventory(gs.parent.inventory,'electronics',1);
          gs.parent.depression = Math.max(0, gs.parent.depression - 5);
          return 'You roll them carefully and take them. The annotations show techniques you hadn\'t considered. This is exactly the kind of information that keeps people alive.';
        }
      },
      { label: 'Too heavy to carry right now',
        action: gs => { return 'You leave them. Maybe you\'ll remember this spot.'; }
      },
    ]
  },

  // ─── Endgame: escape to The Hollow ────────────────────────────────────────────
  {
    id: 'ev_escape_ready',
    title: 'Time to Leave',
    text: `Lily is better. Actually, genuinely better — colour back in her face, the fever gone. This morning she was humming again. You didn't say anything. You just listened.

She catches you watching her and says, quietly: "Now?"

You know what she means. There's a place north of the old rail yards. People call it the Hollow. A settlement — two hundred survivors, they say. Trade, medicine, real security. No AI presence that far out. You've heard it from enough different mouths to believe at least the shape of it.

It might not still be there. Nothing is guaranteed. But Lily is better, the suspicion keeps climbing, and staying underground forever was never the plan.

The only way to know is to go.`,
    condition: gs => gs.screen === 'shelter' && gs.flags.lilyCured && !gs.flags.gameWon,
    choices: [
      {
        label: 'Leave for The Hollow',
        action: gs => {
          gs.flags.gameWon = true;
          gs.screenFade = {
            active: true, alpha: 0, phase: 'out', titleText: null,
            pendingFn: () => { gs.screen = 'gameWon'; }
          };
          return null;
        }
      },
      {
        label: 'Not yet — a few more days',
        action: gs => {
          // Re-fires after 2 days
          gs.eventLastFired['ev_escape_ready'] = gs.day - 3;
          return 'You tell Lily soon. She nods. She\'s patient. She\'s always been patient. You both know the longer you wait the harder it gets.';
        }
      },
    ]
  },
];

// Helper: build a survivor NPC
let _survivorNames = ['Marcus','Elena','Jonas','Petra','Tomás','Anika','Dariusz','Fatima','Owen','Yuki'];
let _snIdx = 0;
const _PERSONALITIES = ['cautious','reckless','optimistic','bitter','quiet','resourceful'];
function makeSurvivor() {
  const name = _survivorNames[_snIdx % _survivorNames.length]; _snIdx++;
  return {
    id:  uid(),
    name,
    health:     randInt(40,80), maxHealth: randInt(70,100),
    hunger:     randInt(20,50),
    thirst:     randInt(20,50),
    tiredness:  randInt(20,60),
    depression: randInt(30,55),
    strength:   randInt(3,7), agility: randInt(3,7), perception: randInt(3,7),
    skills:     { scavenging: randInt(1,5), melee: randInt(1,4), firearms: randInt(1,3) },
    inventory:  [],
    isExploring: false,
    isSleeping: false,
    task: null, taskProgress: 0, taskDuration: 0,
    level: 1, xp: 0, pendingSkillPts: 0,
    animFrame: 0, animTimer: 0,
    x: 200 + _snIdx * 30, y: 0, facing: 1,
    personality: randChoice(_PERSONALITIES),
  };
}

// ── Dialogue Events (parent-child narrative moments, no choices) ───────────────
const DIALOGUE_DB = [
  {
    id: 'dl_before_times',
    title: 'Before',
    text: `Lily is quiet for a long time, then: "What was it like before? Before all this?" You think about how to answer. "Loud," you say finally. "The world was very loud. Music from cars. People talking everywhere. Shops with lights on all night." She considers this. "Did you like it?" "Sometimes," you say. "I didn't appreciate it enough."`,
    condition: gs => gs.screen === 'shelter',
    type: 'dialogue',
  },
  {
    id: 'dl_drawing',
    title: 'Lily\'s Drawing',
    text: `You find Lily cross-legged on the floor, tongue between her teeth, drawing with a stub of pencil on the back of a food wrapper. You look over her shoulder. It's the shelter — every room, every detail, even the water barrel in the corner. And two small figures in the main room. "That's us," she says, pointing. "So I don't forget what home looks like."`,
    condition: gs => gs.screen === 'shelter',
    type: 'dialogue',
  },
  {
    id: 'dl_will_we_leave',
    title: 'Someday',
    text: `"Will we ever leave?" Lily asks. She's staring at the ceiling, the question drifting up like smoke. You sit beside her. "Yes," you say, and you mean it even if you don't know when. "Where will we go?" "Somewhere with grass. Somewhere the sky is just sky." She's quiet for a moment. "Promise?" You take her hand. "Promise."`,
    condition: gs => gs.screen === 'shelter' && gs.day >= 5,
    type: 'dialogue',
  },
  {
    id: 'dl_dream',
    title: 'A Good Dream',
    text: `"I had a good dream," Lily says, blinking awake. You wait. "We were at a beach. You were there. There was ice cream." She says it like it was something from another world — which, you suppose, it is. "What flavour?" you ask. She thinks very seriously. "Strawberry. And you had chocolate even though you always say you don't really like chocolate." "I don't really like chocolate," you say. She grins. "In the dream you did."`,
    condition: gs => gs.screen === 'shelter',
    type: 'dialogue',
  },
  {
    id: 'dl_watching_sleep',
    title: 'Vigil',
    text: `After Lily falls asleep you sit in the dark and watch her breathe. It's something you've done since she was an infant, though you've never admitted it. The small rise and fall of her chest. The way one hand curls under her chin. You think: as long as that keeps happening, nothing else matters. You stay longer than you need to. You always do.`,
    condition: gs => gs.screen === 'shelter',
    type: 'dialogue',
  },
  {
    id: 'dl_not_scared',
    title: 'Brave',
    text: `"I'm not scared anymore," Lily says, matter-of-factly, helping you stack cans. You glance at her. "When were you scared?" "At the beginning. When we first came here. The sounds were strange and I didn't know if we were safe." You didn't know either, you think. "And now?" "Now I know the sounds. The shelter sounds like itself. I know what's you moving around and what's just the walls." She's eight years old and she's figured out something it took you months to learn.`,
    condition: gs => gs.screen === 'shelter' && gs.day >= 8,
    type: 'dialogue',
  },
  {
    id: 'dl_your_name',
    title: 'Names',
    text: `"What does your name mean?" Lily asks. You tell her what you know — the origin, whether it means anything. She thinks about this. "Mine means 'pure'," she says. "I looked it up once in a book. But I think names just mean the person now. Like, your name means you." You sit with that for a moment. Outside, somewhere distant, something moves in the dark. Inside, a child is making philosophy from nothing. "Yeah," you say. "I think you're right."`,
    condition: gs => gs.screen === 'shelter',
    type: 'dialogue',
  },
  {
    id: 'dl_favourite_food',
    title: 'Food Talk',
    text: `You're eating heated beans — again — and Lily says, "When this is over, what will you eat first?" You don't hesitate. "A proper meal. Something hot, cooked slowly. Something that smells like Sunday." She screws up her face in thought. "I want spaghetti. With the red sauce. And garlic bread." "Definitely garlic bread." You eat the rest of the beans in silence but they taste somehow less terrible than usual.`,
    condition: gs => gs.screen === 'shelter',
    type: 'dialogue',
  },
  {
    id: 'dl_humming',
    title: 'A Song',
    text: `Lily is humming while she works — tidying the storage, moving things with small careful hands. You listen. It's not a song you recognise. "What is that?" you ask. "Mine," she says simply. "I made it up. It helps when things are too quiet." She hums a few more bars. It's a simple melody, slightly tuneless, and completely hers. You find yourself humming it later without realising, while you work alone in another room.`,
    condition: gs => gs.screen === 'shelter' && gs.day >= 3,
    type: 'dialogue',
  },
  {
    id: 'dl_teaching_reading',
    title: 'Reading Lesson',
    text: `You've found a book — battered, half the cover gone — and you sit with Lily going through it page by page. She can read but slowly; you sound out the harder words together. She asks what "ephemeral" means. You explain it means lasting only a short time, fleeting. She says nothing for a while, then: "I don't want us to be ephemeral." "We won't be," you say, and turn the page.`,
    condition: gs => gs.screen === 'shelter' && gs.shelter.storage.some(s => s.id === 'book'),
    type: 'dialogue',
  },
  {
    id: 'dl_ai_feelings',
    title: 'Does It Feel?',
    text: `"Do you think the AI feels anything?" Lily asks. The question catches you off guard. "What do you mean?" "Like — does it know it's hunting us? Does it feel anything when it finds someone?" You think about it honestly. "I don't think so. It just follows instructions." She's quiet. "That's almost worse," she says. "At least if it was angry, it could stop being angry."`,
    condition: gs => gs.screen === 'shelter' && gs.day >= 7,
    type: 'dialogue',
  },
  {
    id: 'dl_stars',
    title: 'Stars',
    text: `There's a crack in the ceiling — a small flaw in the concrete that lets in a thin line of night sky. Lily found it weeks ago. Sometimes, on clear nights, you can see a single star through it. Tonight she's lying on her back, staring up. "It's still there," she says. "Same one as last night." You lie down beside her on the cold floor. One star, fixed and faint. "Still there," you agree.`,
    condition: gs => gs.screen === 'shelter' && gs.day >= 4,
    type: 'dialogue',
  },
  {
    id: 'dl_parent_story',
    title: 'Story Time',
    text: `"Tell me a story," Lily says. She's already half asleep. You think of the ones you used to tell — about knights, about animals who could talk, about children who found magic in ordinary things. You tell her one from memory, improvising the forgotten parts. She doesn't notice the gaps. By the end her breathing is slow and even. You sit a little longer in the quiet, holding the tail end of the story in your mind, not quite ready to let it go.`,
    condition: gs => gs.screen === 'shelter',
    type: 'dialogue',
  },
  {
    id: 'dl_i_love_you',
    title: 'Just Because',
    text: `Out of nowhere, while you're fixing something in the corner, Lily says: "I love you." You turn. She's not looking at you — she's stacking cans with great concentration, as if she just mentioned the weather. "I love you too," you say. "I know," she says. And somehow that's the most comforting thing anyone has said to you in months.`,
    condition: gs => gs.screen === 'shelter',
    type: 'dialogue',
  },
  {
    id: 'dl_found_flower',
    title: 'A Flower',
    text: `Lily is holding something out to you with both hands. A dandelion — yellow, slightly wilted, still alive. "I found it in a crack in the pavement," she says. "On the surface?" "Just near the hatch. It was growing in the crack." You take it. It's soft and real and impossibly yellow. You put it in the water bottle on the shelf. It stands there all day, a small insistence of colour in the grey.`,
    condition: gs => gs.screen === 'shelter' && gs.day >= 6,
    type: 'dialogue',
  },
  {
    id: 'dl_what_we_miss',
    title: 'Missing Things',
    text: `"What do you miss most?" Lily asks. You consider it seriously. "Rain," you say. "Walking in rain without worrying." She nods. "I miss the internet," she says, like a confession. "There was so much of it. Videos of animals doing funny things." "Cats mostly," you say. "Always cats," she agrees. You both laugh — actually laugh — and it echoes oddly in the shelter, unfamiliar and welcome.`,
    condition: gs => gs.screen === 'shelter' && gs.day >= 5,
    type: 'dialogue',
  },
  {
    id: 'dl_word_game',
    title: 'The Game',
    text: `Lily invented a game: you have to describe something from the old world without naming it, and the other person has to guess. "Big. Metal. Smelled of coffee and strangers. Made a lot of noise in the morning." You think. "A train station?" She grins. "Underground train station. Now you." You think for a moment. "You stood in a long line for it. You watched other people eat it until yours arrived. It came in a paper box." "A restaurant!" she shouts. "Easy." You play for an hour. The shelter feels larger somehow.`,
    condition: gs => gs.screen === 'shelter' && gs.day >= 3,
    type: 'dialogue',
  },
  {
    id: 'dl_survivor_story',
    title: 'Stories',
    text: `Lily has been watching the survivors all day with her careful eyes. Later she comes to you. "Where do you think they came from?" You consider. "Everywhere. Before, they had different lives. Jobs. Families." "Do you think they miss them?" "Every day," you say. She looks at the others across the room. "I'm going to ask them," she decides. And she does, quietly and politely, and they tell her. And for a while, this underground room is full of the sounds of the world that used to be.`,
    condition: gs => gs.screen === 'shelter' && gs.survivors.length > 0,
    type: 'dialogue',
  },
  {
    id: 'dl_dog_moment',
    title: 'Rex and Lily',
    text: `You find Lily and the dog nose to nose, having an apparent conversation. "What are you telling him?" you ask. She doesn't look up. "I'm explaining how things work here. The rules. What sounds mean danger." She scratches the dog's ears. "He's a good listener." Rex's tail thumps once against the floor. You leave them to it.`,
    condition: gs => gs.screen === 'shelter' && gs.dog && gs.dog.alive,
    type: 'dialogue',
  },
  {
    id: 'dl_getting_better',
    title: 'Better at This',
    text: `"Are we getting better at this?" Lily asks. You think about where you started — the panic, the miscounts, the nights you didn't sleep. You think about now. The routines. The storage system Lily organised herself. The way you both know to go quiet when something sounds wrong. "Yes," you say. "Much better." She nods like this confirms something. "Good," she says. "Because I think we need to be."`,
    condition: gs => gs.screen === 'shelter' && gs.day >= 10,
    type: 'dialogue',
  },
];

function pickDialogue(gs) {
  if (!gs.eventLastFired) gs.eventLastFired = {};
  const pool = DIALOGUE_DB.filter(e => {
    if (e.condition && !e.condition(gs)) return false;
    const lastDay = gs.eventLastFired[e.id] || 0;
    if (gs.day - lastDay < 7) return false;
    return true;
  });
  if (pool.length === 0) return null;
  const ev = randChoice(pool);
  gs.eventLastFired[ev.id] = gs.day;
  return { ...ev };
}

// ── Story DB — cinematic one-shot narrative moments ───────────────────────────
// These are queued explicitly (gs.storyQueue) and fired with priority.
// type:'story' gives them a distinct visual treatment in renderEvent.
const STORY_DB = [
  {
    id: 'story_opening',
    title: 'Day One',
    type: 'story',
    text:
`Three weeks since the AI sealed the district. I don't know how many people made it out. I stopped counting the sirens after the first week.

Lily is asleep below. She trusts me completely — she always has — and some nights that's the most terrifying thing in the world.

We have food for a few days. After that, I'll have to go up.

I found this bunker months ago and told nobody. I still don't know if that was right.

One day at a time.`,
  },
  {
    id: 'story_first_out',
    title: 'First Time Out',
    type: 'story',
    text:
`I left Lily at the hatch. Told her two hours, maybe three. She nodded like she understood — which was somehow worse.

She's been underground long enough that the idea of me going up fills her with a dread she tries not to show. She's getting better at hiding it. I'm not sure that's a good thing.

I moved fast. Kept low. The streets felt different. Emptier, or maybe I was just more afraid.

I need to be better at this. I don't have the option of learning slowly.`,
  },
  {
    id: 'story_first_room',
    title: 'Something New',
    type: 'story',
    text:
`It's finished. My hands are wrecked and it took longer than it should have, but it's built.

Lily walked through it twice, running her fingers along the new walls. Then she turned to me and said: "It's starting to feel like somewhere real."

I hadn't thought of it that way. We've been surviving. But maybe that's the difference — between surviving in a place and actually living in one.

We're still a long way from safe. But tonight it felt, just for a moment, like we might get there.`,
  },
  {
    id: 'story_wounded',
    title: 'She Saw',
    type: 'story',
    text:
`I tried to clean up before she noticed. I didn't manage it.

Lily saw the blood the moment I came through the hatch. She didn't scream or ask what happened. She just went and got the cloth and held the bandage steady while I worked, her hands completely still.

That stillness is what stays with me. She already knew not to ask.

She slept in the room with me last night without saying a word about why. Just stayed close.

She's carrying this kind of quiet that children shouldn't have to carry.`,
  },
  {
    id: 'story_late_return',
    title: 'She Waited',
    type: 'story',
    text:
`I came through the hatch at first light and she was sitting at the bottom of the ladder, knees pulled to her chest, watching the door.

The moment she saw me — just alive, just me — something in her face that had been held in all night finally broke. Not the careful quiet kind of crying. The kind that had been building for hours.

I sat down on the floor and held her until it stopped. It took a long time. Neither of us spoke.

I can't do that to her again. Whatever it costs, I come home before dark.`,
  },
  {
    id: 'story_suspicion',
    title: 'Something Has Changed',
    type: 'story',
    text:
`Lily asked me last night why the drone routes have shifted. She'd been tracking them — sketched the patterns in the margins of her notebook.

I told her it was probably routine recalibration. She looked at me the way she does when she knows I'm softening the truth, and then went back to her book without another word.

I double-checked every seal, every sound source. I haven't been careless. But something has changed out there. The patterns are tighter. More deliberate.

We need to be quieter. We need to be invisible. We cannot afford to be noticed.`,
  },
  {
    id: 'story_children',
    title: 'Are There Others?',
    type: 'story',
    text:
`While I was sorting supplies, Lily asked without looking up: "Do you think there are other children? Hiding somewhere, like us?"

I didn't answer right away. She filled the silence herself.

"I know the honest answer," she said quietly. "I'm not little anymore. I just... think about them sometimes. Hope they found somewhere safe." She paused. "Is that stupid?"

I told her it wasn't. I told her hope is one of the few things that costs nothing.

She smiled at that. Small, but real.

I hope she never stops.`,
  },
  {
    id: 'story_week_one',
    title: 'Seven Days',
    type: 'story',
    text:
`Seven days. I didn't let myself think past today until after Lily fell asleep.

Seven days of keeping her fed, keeping her warm, keeping her steady when the drones passed close. Seven days of going up and coming back.

It's more than I expected when we started. I'm not sure that's something to be proud of, but it's something.

I don't know what the end looks like. I'm not sure I'm allowed to think about that yet. But one week is real.

We're still here.`,
  },
  {
    id: 'story_lily_sick',
    title: 'Something Wrong',
    type: 'story',
    text:
`It started as a low fever. Lily said it was nothing. She always says it's nothing.

But it didn't break. Three days in and she's still warm to the touch, sleeping more than usual, moving more slowly. She tries to hide it — stacks cans with quiet precision, smiles when she catches me looking.

The regular medicine helps. Painkillers bring the fever down for a few hours, antibiotics slow whatever this is. But it keeps coming back.

Whatever she has, it's not a simple infection. Something specific, something resistant. The medicine manages it but doesn't end it.

I've been avoiding the hospital. Deep in AI territory. Difficult, dangerous. But there are things in a hospital that can't be found anywhere else.

She needs something stronger. I need to go.`,
  },
  {
    id: 'story_lily_cured',
    title: 'The Fever Breaks',
    type: 'story',
    text:
`By morning, the fever was gone.

Not reduced — gone. Her forehead cool to the touch for the first time in weeks. She woke up before me and was already sorting the food stores when I opened my eyes. I watched her from across the room for a moment before she noticed.

"What?" she said.

"Nothing," I said. "You look better."

She considered this. "I feel better." Then, because she is who she is: "The antiviral worked. I knew it would."

She didn't say thank you. She didn't have to. She just went back to sorting the cans with her small precise hands, and I sat there in the quiet and let myself, for once, believe things might be okay.

She started humming again around noon. Something without a name. Something that was hers.`,
  },
  {
    id: 'story_lily_worsening',
    title: 'Still Sick',
    type: 'story',
    text:
`Five days now. Lily doesn't hum anymore while she works.

She still talks, still asks questions, still watches me carefully with those eyes that have always seen too much. But the humming stopped. I didn't notice when. I noticed its absence.

The medicine keeps her stable. Without it she'd be much worse — I can see that in the hours when the fever spikes before the next dose. But stable isn't better. Stable is just... not worse.

She asked me last night if I was scared. I said no.

She looked at me for a long moment. "You're lying," she said softly. "But it's okay. I know you're trying."

She fell asleep holding my hand. Her palm was warm.

The hospital. I need to go to the hospital.`,
  },
];

// Pick a valid event for current state
function pickEvent(gs, context) {
  if (!gs.eventLastFired) gs.eventLastFired = {};
  const pool = EVENTS_DB.filter(e => {
    if (e.condition && !e.condition(gs)) return false;
    // Prevent the same event from firing again within 3 in-game days
    const lastDay = gs.eventLastFired[e.id] || 0;
    if (gs.day - lastDay < 3) return false;
    return true;
  });
  if (pool.length === 0) return null;
  // Shallow-copy to avoid mutating original; keep function references in choices
  const ev = randChoice(pool);
  gs.eventLastFired[ev.id] = gs.day;
  return {
    ...ev,
    choices: ev.choices ? ev.choices.map(c => ({ ...c })) : [],
  };
}
