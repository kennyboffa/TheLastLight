// exploreSelect.js — Location selection before exploration
'use strict';

let esScrollY = 0;

function renderExploreSelect(ctx, gs) {
  const W = CFG.W, H = CFG.H;
  fillRect(ctx, 0, 0, W, H, C.bg);

  // Title
  drawText(ctx, 'CHOOSE DESTINATION', W/2, 22, C.textBright, 13, 'center', true);
  drawDivider(ctx, 40, 28, W - 80, C.border2);
  drawText(ctx, 'Select a location to explore today.', W/2, 42, C.textDim, 8, 'center');

  const mx = gs.mouse.x, my = gs.mouse.y;
  const cardH = 68;
  const cardW = W - 80;
  const cardX = 40;
  const listY = 55;
  const listH = H - 50 - listY;
  const totalH = LOCATIONS_DB.length * (cardH + 6);
  const maxScroll = Math.max(0, totalH - listH);
  esScrollY = Math.min(Math.max(esScrollY, 0), maxScroll);

  // Clip list area
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, listY, W, listH);
  ctx.clip();

  let cy = listY - esScrollY;

  const unlocked = gs.unlockedLocations || ['forest', 'church'];

  for (const loc of LOCATIONS_DB) {
    const isUnlocked = unlocked.includes(loc.id);
    const hov = isUnlocked && hitTest(mx, my, cardX, cy, cardW, cardH);

    if (!isUnlocked) ctx.globalAlpha = 0.35;

    // Card bg
    fillRect(ctx, cardX, cy, cardW, cardH, hov ? '#111120' : C.panelBg);
    strokeRect(ctx, cardX, cy, cardW, cardH, hov ? '#3a3a5a' : C.border2);

    // Difficulty bar (left accent strip, colour coded)
    const diffColor = ['#2a6a2a','#6a6a2a','#8a4a20','#8a2020','#6a1a1a'][Math.min(4, loc.difficulty - 1)];
    fillRect(ctx, cardX, cy, 4, cardH, diffColor);

    // Location name
    drawText(ctx, loc.name, cardX + 14, cy + 16, hov ? C.textBright : C.text, 11, 'left', true);

    if (!isUnlocked) {
      ctx.globalAlpha = 1;
      drawText(ctx, '🔒 LOCKED', cardX + cardW - 8, cy + 16, '#664444', 8, 'right', true);
    } else {
      // Difficulty stars
      const stars = '★'.repeat(loc.difficulty) + '☆'.repeat(Math.max(0, 4 - loc.difficulty));
      drawText(ctx, stars, cardX + cardW - 6, cy + 16, diffColor, 9, 'right');
    }

    if (!isUnlocked) ctx.globalAlpha = 0.35;

    // Description
    drawWrapped(ctx, isUnlocked ? loc.desc : 'Area not yet accessible. Find a map to unlock new regions.',
      cardX + 14, cy + 26, cardW - 30, 8, C.textDim, 11);

    // What to find tags (only for unlocked)
    if (isUnlocked) {
      const tags = getLocationTags(loc);
      let tx = cardX + 14;
      for (const tag of tags) {
        if (tx + 50 > cardX + cardW - 10) break;
        const tw = ctx.measureText(tag).width + 6;
        ctx.font = '7px monospace';
        fillRect(ctx, tx, cy + cardH - 14, tw, 11, '#1a2a18');
        strokeRect(ctx, tx, cy + cardH - 14, tw, 11, '#3a5a30');
        drawText(ctx, tag, tx + 3, cy + cardH - 5, '#6a9a60', 7);
        tx += tw + 4;
      }
    }

    ctx.globalAlpha = 1;
    cy += cardH + 6;
  }

  ctx.restore();

  // Scroll indicator
  if (maxScroll > 0) {
    const trackH = listH - 4;
    const thumbH = Math.max(20, trackH * (listH / totalH));
    const thumbY = listY + 2 + (esScrollY / maxScroll) * (trackH - thumbH);
    fillRect(ctx, W - 10, listY + 2, 5, trackH, '#1a1a28');
    fillRect(ctx, W - 10, thumbY, 5, thumbH, '#3a3a5a');
  }

  // Back button
  const bx = 40, by = H - 36;
  drawButton(ctx, bx, by, 70, 22, '< Back', hitTest(mx, my, bx, by, 70, 22));

  // Weather indicator top-right
  const wicon = gs.weather.type === 'rain' ? '🌧' : gs.weather.type === 'cloudy' ? '☁' : '☀';
  drawText(ctx, `${wicon} ${gs.weather.type}`, W - 50, 20, C.textDim, 8, 'center');
}

function getLocationTags(loc) {
  const tags = [];
  if (loc.canHunt)     tags.push('hunting');
  const allTables = loc.zones.map(z => z.lootTable).join(',');
  if (allTables.includes('food'))     tags.push('food');
  if (allTables.includes('medical'))  tags.push('medicine');
  if (allTables.includes('material')) tags.push('materials');
  if (allTables.includes('electron')) tags.push('electronics');
  if (allTables.includes('nature'))   tags.push('foraging');
  if (loc.zones.some(z => (z.buildings||[]).length > 0)) tags.push('buildings');
  if (loc.zones.some(z => z.requiresLockpick))           tags.push('lockpick needed');
  tags.push(`diff ${loc.difficulty}/4`);
  return tags;
}

function exploreSelectClick(mx, my, gs) {
  const cardH = 68;
  const cardW = CFG.W - 80;
  const cardX = 40;
  let cy = 55 - esScrollY;

  const unlocked = gs.unlockedLocations || ['forest', 'church'];
  for (const loc of LOCATIONS_DB) {
    if (hitTest(mx, my, cardX, cy, cardW, cardH)) {
      if (!unlocked.includes(loc.id)) {
        notify('This area is locked. Find a map to unlock new regions.', 'warn');
        return;
      }
      gs.screen = 'packScreen';
      gs._pendingLoc = loc;
      return;
    }
    cy += cardH + 6;
  }

  // Back button
  if (hitTest(mx, my, 40, CFG.H - 36, 70, 22)) {
    gs.screen = 'shelter';
  }
}
