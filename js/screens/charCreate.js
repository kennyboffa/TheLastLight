// charCreate.js — Character creation screen
'use strict';

const ATTRS  = ['strength','agility','perception','intelligence','charisma'];
const SKILLS_LIST = ['scavenging','stealth','exploration','bartering','speech','lockpick','melee','firearms'];
const ATTR_DESCS = {
  strength:     'Carry weight, melee damage',
  agility:      'Speed, flee chance, dodge',
  perception:   'Detection, accuracy bonus',
  intelligence: 'Task speed, bonus skill pts',
  charisma:     'Speech, morale of others',
};
const SKILL_DESCS = {
  scavenging:   'Find more / better loot',
  stealth:      'Avoid AI detection, sneak',
  exploration:  'Navigate locations safely',
  bartering:    'Better trade prices',
  speech:       'Convince survivors, events',
  lockpick:     'Open locked areas',
  melee:        'Melee combat accuracy',
  firearms:     'Ranged accuracy & handling',
};

const DIFFICULTIES = {
  easy:   { label: 'Easy',   desc: 'Slower stat decay. Less suspicion build-up. Recommended for new players.',  decayMult: 0.7, suspMult: 0.6, color: '#3aaa50' },
  normal: { label: 'Normal', desc: 'Balanced challenge. The world is hard but fair.',                           decayMult: 1.0, suspMult: 1.0, color: '#c4c4b0' },
  hard:   { label: 'Hard',   desc: 'Faster hunger and thirst. The AI is more alert. Every decision counts.',   decayMult: 1.4, suspMult: 1.5, color: '#cc4428' },
};

let CC_scroll = 0;

function initCharCreate() {
  GS.cc = {
    step: 0,
    difficulty: 'normal',
    gender: 'father',
    name: 'Survivor',
    attrPts: 2,
    skillPts: 5,
    attrs:  { strength:5, agility:5, perception:5, intelligence:5, charisma:5 },
    skills: { scavenging:1, stealth:1, exploration:1, bartering:1, speech:1, lockpick:1, melee:1, firearms:1 },
    nameInputActive: false,
    hoveredItem: null,
  };
  CC_scroll = 0;
}

function renderCharCreate(ctx, gs) {
  fillRect(ctx, 0, 0, CFG.W, CFG.H, C.bg);

  const cc = gs.cc;
  const cx = CFG.W / 2;

  // Title
  drawText(ctx, 'CHARACTER CREATION', cx, 22, C.textBright, 13, 'center', true);
  drawDivider(ctx, 40, 28, CFG.W - 80, C.border2);

  // Step indicator (4 steps now)
  const steps = ['Difficulty', 'Identity', 'Attributes', 'Skills'];
  let sx = cx - (steps.length * 68) / 2 + 10;
  for (let i = 0; i < steps.length; i++) {
    const active = i === cc.step;
    const col = active ? C.textBright : (i < cc.step ? C.textGood : C.textDim);
    drawText(ctx, `${i+1}. ${steps[i]}`, sx, 42, col, 8, 'left', active);
    sx += 68;
  }
  drawDivider(ctx, 40, 47, CFG.W - 80, C.border);

  if (cc.step === 0)      renderStepDifficulty(ctx, gs, cx);
  else if (cc.step === 1) renderStep0(ctx, gs, cx);
  else if (cc.step === 2) renderStep1(ctx, gs, cx);
  else if (cc.step === 3) renderStep2(ctx, gs, cx);

  // Bottom navigation
  const mx = gs.mouse.x, my = gs.mouse.y;
  if (cc.step > 0) {
    drawButton(ctx, 40, CFG.H - 32, 80, 20, '< Back', hitTest(mx, my, 40, CFG.H-32, 80, 20));
  }
  const nextDisabledStep2 = cc.step === 2 && cc.attrPts > 0;
  const nextLabel = cc.step === 3 ? 'Begin →' : 'Next >';
  drawButton(ctx, CFG.W - 120, CFG.H - 32, 80, 20, nextLabel,
    hitTest(mx, my, CFG.W-120, CFG.H-32, 80, 20), false, nextDisabledStep2);
}

// ── Step 0: Difficulty ────────────────────────────────────────────────────────

function renderStepDifficulty(ctx, gs, cx) {
  const cc = gs.cc;
  const mx = gs.mouse.x, my = gs.mouse.y;
  let y = 68;

  drawText(ctx, 'Choose difficulty:', cx, y, C.textDim, 9, 'center');
  y += 18;

  const keys = ['easy','normal','hard'];
  const btnW = 150, btnH = 36;
  for (const key of keys) {
    const def = DIFFICULTIES[key];
    const bx = cx - btnW / 2;
    const sel = cc.difficulty === key;
    const hov = hitTest(mx, my, bx, y, btnW, btnH);
    fillRect(ctx, bx, y, btnW, btnH, sel ? '#0e1a0e' : (hov ? C.btnHover : C.btnBg));
    strokeRect(ctx, bx, y, btnW, btnH, sel ? def.color : (hov ? C.border2 : C.border));
    drawText(ctx, def.label, cx, y + 14, sel ? def.color : C.textBright, 11, 'center', true);
    drawText(ctx, def.desc, cx, y + 26, C.textDim, 7, 'center');
    y += btnH + 10;
  }

  // Show selected difficulty summary
  const selDef = DIFFICULTIES[cc.difficulty];
  y += 8;
  drawDivider(ctx, 80, y, CFG.W - 160, C.border);
  y += 12;
  drawText(ctx, `Selected: ${selDef.label}`, cx, y, selDef.color, 9, 'center', true);
  y += 14;
  drawText(ctx, `Decay rate ×${selDef.decayMult}  ·  Suspicion ×${selDef.suspMult}`, cx, y, C.textDim, 8, 'center');
}

// ── Step 1: Gender & Name ─────────────────────────────────────────────────────

function renderStep0(ctx, gs, cx) {
  const cc = gs.cc;
  let y = 70;

  drawText(ctx, 'Choose your role:', cx, y, C.textDim, 9, 'center');
  y += 16;

  // Gender buttons
  const btnW = 100, btnH = 28;
  const fatherX = cx - btnW - 10, motherX = cx + 10;
  const mx = gs.mouse.x, my = gs.mouse.y;

  drawButton(ctx, fatherX, y, btnW, btnH, 'Father',
    hitTest(mx, my, fatherX, y, btnW, btnH), cc.gender === 'father');
  drawButton(ctx, motherX, y, btnW, btnH, 'Mother',
    hitTest(mx, my, motherX, y, btnW, btnH), cc.gender === 'mother');
  y += 40;

  // Parent sprite preview
  const sprScale = 3;
  drawParent(ctx, cx, y + 38, sprScale, 1, 0, cc.gender);
  y += 64;

  drawText(ctx, 'Your name:', cx, y + 10, C.textDim, 9, 'center');
  y += 16;

  // Name display area
  const nameW = 200, nameH = 20;
  const nameX = cx - nameW / 2;
  fillRect(ctx, nameX, y, nameW, nameH, '#0a0a14');
  strokeRect(ctx, nameX, y, nameW, nameH, cc.nameInputActive ? C.border2 : C.border);

  const displayName = cc.name || (cc.nameInputActive ? '' : 'Click to change name');
  drawText(ctx, displayName, nameX + nameW/2, y + nameH - 5, C.textBright, 10, 'center');
  if (cc.nameInputActive && Math.floor(Date.now() / 500) % 2 === 0) {
    ctx.font = '10px monospace';
    const nameW2 = ctx.measureText(cc.name).width;
    fillRect(ctx, nameX + nameW/2 + nameW2/2 + 2, y + 3, 6, 12, C.textDim);
  }
  y += 28;

  drawText(ctx, 'Your child is named Lily, 8 years old.', cx, y + 10, C.textDim, 8, 'center');
}

// ── Step 2: Attributes ────────────────────────────────────────────────────────

function renderStep1(ctx, gs, cx) {
  const cc = gs.cc;
  const mx = gs.mouse.x, my = gs.mouse.y;
  let y = 65;

  const ptsColor = cc.attrPts > 0 ? C.textWarn : C.textGood;
  drawText(ctx, `Points remaining: ${cc.attrPts}`, cx, y, ptsColor, 9, 'center', true);
  y += 16;

  for (const attr of ATTRS) {
    const val = cc.attrs[attr];
    const label = attr.charAt(0).toUpperCase() + attr.slice(1);

    const hov = hitTest(mx, my, 60, y - 2, CFG.W - 120, 22);
    if (hov) {
      fillRect(ctx, 60, y - 2, CFG.W - 120, 22, C.highlight);
      drawText(ctx, ATTR_DESCS[attr], cx, CFG.H - 50, C.textDim, 8, 'center');
    }

    drawText(ctx, label, 70, y + 12, C.text, 9);

    const minX = CFG.W/2 - 50, plusX = CFG.W/2 + 28;
    drawButton(ctx, minX, y, 18, 18, '−', hitTest(mx, my, minX, y, 18, 18), false, val <= 1);
    drawText(ctx, String(val), cx, y + 12, val >= 8 ? C.textGood : C.textBright, 10, 'center', true);
    drawButton(ctx, plusX, y, 18, 18, '+', hitTest(mx, my, plusX, y, 18, 18), false, cc.attrPts <= 0 || val >= 10);

    y += 26;
  }
}

// ── Step 3: Skills ────────────────────────────────────────────────────────────

function renderStep2(ctx, gs, cx) {
  const cc = gs.cc;
  const mx = gs.mouse.x, my = gs.mouse.y;
  let y = 65;

  const ptsColor = cc.skillPts > 0 ? C.textWarn : C.textGood;
  drawText(ctx, `Skill points: ${cc.skillPts}`, cx, y, ptsColor, 9, 'center', true);
  y += 14;
  drawText(ctx, '(5 points — spend now or save for leveling up)', cx, y, C.textDim, 7, 'center');
  y += 14;

  for (const skill of SKILLS_LIST) {
    const val = cc.skills[skill];
    const label = skill.charAt(0).toUpperCase() + skill.slice(1);

    const hov = hitTest(mx, my, 60, y - 2, CFG.W - 120, 20);
    if (hov) {
      fillRect(ctx, 60, y - 2, CFG.W - 120, 20, C.highlight);
      drawText(ctx, SKILL_DESCS[skill], cx, CFG.H - 50, C.textDim, 8, 'center');
    }

    drawText(ctx, label, 70, y + 11, C.text, 9);

    for (let p = 0; p < 10; p++) {
      const px = CFG.W/2 - 50 + p * 13;
      fillRect(ctx, px, y + 3, 11, 11, p < val ? '#3a6a3a' : '#151520');
      strokeRect(ctx, px, y + 3, 11, 11, p < val ? '#5a9a5a' : C.border);
    }

    const minX = CFG.W - 80, plusX = CFG.W - 58;
    drawButton(ctx, minX, y, 18, 18, '−', hitTest(mx, my, minX, y, 18, 18), false, val <= 1);
    drawButton(ctx, plusX, y, 18, 18, '+', hitTest(mx, my, plusX, y, 18, 18), false, cc.skillPts <= 0 || val >= 10);

    y += 24;
  }
}

// ── Input handlers ─────────────────────────────────────────────────────────────

function charCreateClick(mx, my, gs) {
  const cc = gs.cc;
  const cx = CFG.W / 2;

  // Navigation
  const nextDisabled = (cc.step === 2 && cc.attrPts > 0);
  if (hitTest(mx, my, CFG.W - 120, CFG.H - 32, 80, 20) && !nextDisabled) {
    if (cc.step < 3) {
      cc.step++;
    } else {
      finalizeCharacter(gs);
      return;
    }
  }
  if (cc.step > 0 && hitTest(mx, my, 40, CFG.H - 32, 80, 20)) cc.step--;

  if (cc.step === 0) {
    // Difficulty selection
    const keys = ['easy','normal','hard'];
    const btnW = 150, btnH = 36;
    let y = 86;
    for (const key of keys) {
      const bx = cx - btnW / 2;
      if (hitTest(mx, my, bx, y, btnW, btnH)) cc.difficulty = key;
      y += btnH + 10;
    }
  }

  if (cc.step === 1) {
    // Gender
    const btnW = 100, btnH = 28;
    const fatherX = cx - btnW - 10;
    const motherX = cx + 10;
    const genderBtnY = 86;
    if (hitTest(mx, my, fatherX, genderBtnY, btnW, btnH)) cc.gender = 'father';
    if (hitTest(mx, my, motherX, genderBtnY, btnW, btnH)) cc.gender = 'mother';

    // Name input (Y = 86+40+60+16 = 202)
    const nameW = 200, nameH = 20;
    const nameX = cx - nameW / 2;
    const nameY = 202;
    if (hitTest(mx, my, nameX, nameY, nameW, nameH)) {
      cc.nameInputActive = true;
      showNameInput(gs);
    }
  }

  if (cc.step === 2) {
    for (const attr of ATTRS) {
      const rowY = 81 + ATTRS.indexOf(attr) * 26;
      const minX = CFG.W/2 - 50, plusX = CFG.W/2 + 28;
      if (hitTest(mx, my, minX, rowY, 18, 18) && cc.attrs[attr] > 1) {
        cc.attrs[attr]--; cc.attrPts++;
      }
      if (hitTest(mx, my, plusX, rowY, 18, 18) && cc.attrPts > 0 && cc.attrs[attr] < 10) {
        cc.attrs[attr]++; cc.attrPts--;
      }
    }
  }

  if (cc.step === 3) {
    for (let si = 0; si < SKILLS_LIST.length; si++) {
      const skill = SKILLS_LIST[si];
      const rowY = 93 + si * 24;
      const minX = CFG.W - 80, plusX = CFG.W - 58;
      if (hitTest(mx, my, minX, rowY, 18, 18) && cc.skills[skill] > 1) {
        cc.skills[skill]--; cc.skillPts++;
      }
      if (hitTest(mx, my, plusX, rowY, 18, 18) && cc.skillPts > 0 && cc.skills[skill] < 10) {
        cc.skills[skill]++; cc.skillPts--;
      }
    }
  }
}

function showNameInput(gs) {
  const wrap = document.getElementById('name-input-wrap');
  const inp  = document.getElementById('name-input');
  wrap.style.display = 'block';
  inp.value = gs.cc.name;
  inp.select();
  inp.focus();
  inp.oninput = () => { gs.cc.name = inp.value || 'Survivor'; };
  inp.onblur  = () => { wrap.style.display = 'none'; gs.cc.nameInputActive = false; if (!gs.cc.name.trim()) gs.cc.name = 'Survivor'; };
  inp.onkeydown = (e) => { if (e.key === 'Enter') inp.blur(); };
}

function finalizeCharacter(gs) {
  const cc = gs.cc;

  // Apply difficulty
  gs.difficulty = cc.difficulty || 'normal';

  Object.assign(gs.parent, {
    name:    cc.name.trim() || (cc.gender === 'father' ? 'Mark' : 'Amanda'),
    gender:  cc.gender,
    strength: cc.attrs.strength, agility: cc.attrs.agility,
    perception: cc.attrs.perception, intelligence: cc.attrs.intelligence,
    charisma:   cc.attrs.charisma,
    skills:  { ...cc.skills },
    level: 1, xp: 0, pendingSkillPts: cc.skillPts,
  });

  // Starting inventory based on skills
  const inv = gs.parent.inventory;
  addToInventory(inv, 'canned_beans', 3);
  addToInventory(inv, 'water_bottle', 2);
  addToInventory(inv, 'bandage', 2);
  if (cc.skills.melee >= 4)    addToInventory(inv, 'knife', 1);
  if (cc.skills.firearms >= 4) { addToInventory(inv, 'pistol', 1); addToInventory(inv, 'pistol_ammo', 8); }

  // Shelter starting storage
  const storage = gs.shelter.storage;
  addToInventory(storage, 'canned_beans', 5);
  addToInventory(storage, 'canned_soup',  3);
  addToInventory(storage, 'water_bottle', 4);
  addToInventory(storage, 'wood', 6);
  addToInventory(storage, 'metal', 4);
  addToInventory(storage, 'cloth', 3);
  addToInventory(storage, 'matches', 2);

  setScreen('shelter');
  const diffLabel = DIFFICULTIES[gs.difficulty].label;
  addLog(`Day 1. ${gs.parent.name} and Lily are hiding below ground. Difficulty: ${diffLabel}.`, 'info');
}
