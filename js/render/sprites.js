// sprites.js — Pixel art character and environment drawing
'use strict';

// ── Character sprites ─────────────────────────────────────────────────────────
// All sprites drawn at "natural" 1px = 1 logical px scale.
// Caller passes ctx with appropriate transform/scale.

function _shadowOval(ctx, rx, ry, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha || 0.28;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawParent(ctx, x, y, s, facing, animFrame, gender, pose) {
  // s = scale factor (e.g. 2 for shelter view)
  // facing: 1=right, -1=left
  // pose: 'front'(default) | 'side' | 'back' | 'sleep'
  pose = pose || 'front';
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (facing < 0) { ctx.scale(-1, 1); }

  const sk        = gender === 'mother' ? '#c49878' : C.skin;
  const skDark    = gender === 'mother' ? '#a07848' : '#a07848';
  const clothes   = gender === 'mother' ? '#3a2a44' : '#1a1e3a'; // dark navy jacket
  const clothesHi = gender === 'mother' ? '#4a3858' : '#262c52'; // lighter navy highlight
  const shirt     = gender === 'mother' ? '#8a2a3a' : '#7a1818'; // red undershirt
  const hair      = C.hair;
  const hairHi    = '#504040';
  const pants     = gender === 'mother' ? '#1a1428' : '#141428'; // dark charcoal
  const pantsHi   = gender === 'mother' ? '#24183a' : '#1c1e38';
  const legSwing  = (animFrame % 2 === 0) ? 0 : 1;

  if (pose === 'front') {
    _shadowOval(ctx, 7*s, 2*s);
    // Head
    fillRect(ctx, -4*s, -18*s, 8*s, 8*s, sk);
    fillRect(ctx, -4*s, -18*s, 8*s, 1*s, '#ffffff', 0.14); // top highlight
    fillRect(ctx,  3*s, -17*s, 1*s, 6*s, '#000000', 0.12); // right-edge shadow
    // Hair (3 tones)
    fillRect(ctx, -4*s, -18*s, 8*s, 3*s, hair);
    fillRect(ctx, -4*s, -16*s, 1*s, 2*s, hair);
    fillRect(ctx,  3*s, -16*s, 1*s, 2*s, hair);
    fillRect(ctx, -3*s, -18*s, 4*s, 1*s, hairHi, 0.5); // hair highlight
    // Eyebrows
    fillRect(ctx, -3*s, -15*s, 2*s, 1*s, hair, 0.85);
    fillRect(ctx,  1*s, -15*s, 2*s, 1*s, hair, 0.85);
    // Sunglasses (dark rectangular lenses over eyes)
    fillRect(ctx, -4*s, -15*s, 3*s, 3*s, '#080810');       // left lens
    fillRect(ctx,  1*s, -15*s, 3*s, 3*s, '#080810');       // right lens
    fillRect(ctx,  0,   -15*s, 1*s, 1*s, '#18182c');       // nose bridge
    fillRect(ctx, -4*s, -15*s, 3*s, 1*s, '#2a3060', 0.45); // left lens shine
    fillRect(ctx,  1*s, -15*s, 3*s, 1*s, '#2a3060', 0.45); // right lens shine
    fillRect(ctx, -4*s, -15*s, 8*s, 1*s, '#303050', 0.7);  // top frame
    fillRect(ctx, -4*s, -13*s, 8*s, 1*s, '#202040', 0.7);  // bottom frame
    // Nose shadow + cheek highlight
    fillRect(ctx, -1*s, -12*s, 1*s, 1*s, skDark, 0.5);
    fillRect(ctx, -3*s, -13*s, 1*s, 2*s, '#ffffff', 0.08);
    // Mouth
    fillRect(ctx, -1*s, -11*s, 3*s, 1*s, skDark, 0.5);
    // Neck
    fillRect(ctx, -1*s, -10*s, 2*s, 2*s, sk);
    fillRect(ctx,  0,   -10*s, 1*s, 2*s, '#000', 0.1);
    // Torso with highlight + shadow
    fillRect(ctx, -4*s, -8*s, 8*s, 7*s, clothes);
    fillRect(ctx, -4*s, -8*s, 8*s, 1*s, '#fff', 0.09);
    fillRect(ctx, -4*s, -2*s, 8*s, 1*s, '#000', 0.15);
    fillRect(ctx,  3*s, -7*s, 1*s, 5*s, '#000', 0.12);
    fillRect(ctx, -3*s, -7*s, 2*s, 4*s, clothesHi, 0.18); // chest light
    // Red undershirt + jacket lapels
    fillRect(ctx, -1*s, -8*s, 3*s, 6*s, shirt, 0.75);     // red shirt center
    fillRect(ctx, -4*s, -8*s, 3*s, 4*s, clothes);          // left lapel (overrides red)
    fillRect(ctx,  2*s, -8*s, 2*s, 4*s, clothes);          // right lapel
    fillRect(ctx, -4*s, -8*s, 3*s, 1*s, clothesHi, 0.3);  // lapel edge highlight
    fillRect(ctx,  2*s, -8*s, 2*s, 1*s, clothesHi, 0.3);
    // Collar / neck opening
    fillRect(ctx, -1*s, -8*s, 1*s, 2*s, sk, 0.4);
    fillRect(ctx,  0,   -8*s, 1*s, 2*s, sk, 0.2);
    // Belt
    fillRect(ctx, -4*s, -1*s, 8*s, 1*s, '#3a2a10');
    fillRect(ctx,  0,   -1*s, 1*s, 1*s, '#8a7a50', 0.6); // buckle
    // Arms with highlight/shadow
    fillRect(ctx, -6*s, -8*s, 2*s, 5*s, clothes);
    fillRect(ctx,  4*s, -8*s, 2*s, 5*s, clothes);
    fillRect(ctx, -6*s, -7*s, 1*s, 4*s, '#fff', 0.07);
    fillRect(ctx,  5*s, -7*s, 1*s, 4*s, '#000', 0.12);
    // Hands
    fillRect(ctx, -6*s, -3*s, 2*s, 2*s, sk);
    fillRect(ctx,  4*s, -3*s, 2*s, 2*s, sk);
    // Legs with highlight/shadow
    fillRect(ctx, -4*s, -1*s, 3*s, 6*s + legSwing*s, pants);
    fillRect(ctx,  1*s, -1*s, 3*s, 6*s - legSwing*s, pants);
    fillRect(ctx, -4*s, -1*s, 1*s, 6*s + legSwing*s, '#fff', 0.07);
    fillRect(ctx,  3*s, -1*s, 1*s, 6*s - legSwing*s, '#000', 0.1);
    fillRect(ctx, -4*s, 1*s + legSwing*s, 3*s, 2*s, pantsHi, 0.3); // knee
    // Boots
    fillRect(ctx, -5*s, 5*s + legSwing*s, 4*s, 2*s, '#282828');
    fillRect(ctx,  1*s, 5*s - legSwing*s, 4*s, 2*s, '#282828');
    fillRect(ctx, -5*s, 5*s + legSwing*s, 4*s, 1*s, '#444', 0.3); // boot top shine
    fillRect(ctx, -5*s, 6*s + legSwing*s, 1*s, 1*s, '#333'); // heel

  } else if (pose === 'side') {
    _shadowOval(ctx, 6*s, 2*s);
    fillRect(ctx, -1*s, -18*s, 6*s, 7*s, sk);
    fillRect(ctx, -1*s, -18*s, 6*s, 1*s, '#fff', 0.14);
    fillRect(ctx,  4*s, -17*s, 1*s, 5*s, '#000', 0.12);
    // Hair
    fillRect(ctx, -1*s, -18*s, 6*s, 3*s, hair);
    fillRect(ctx, -2*s, -17*s, 1*s, 3*s, hair);
    fillRect(ctx, -1*s, -18*s, 4*s, 1*s, hairHi, 0.4);
    // Ear
    fillRect(ctx, -1*s, -14*s, 1*s, 2*s, skDark, 0.7);
    // Eyebrow
    fillRect(ctx,  2*s, -15*s, 2*s, 1*s, hair, 0.85);
    // Sunglasses (side profile — rectangular dark lens)
    fillRect(ctx,  1*s, -15*s, 4*s, 3*s, '#080810');       // dark lens
    fillRect(ctx,  1*s, -15*s, 4*s, 1*s, '#2a3060', 0.45); // lens shine
    fillRect(ctx,  1*s, -15*s, 1*s, 3*s, '#282848', 0.8);  // front frame
    fillRect(ctx,  4*s, -15*s, 1*s, 3*s, '#1a1830', 0.8);  // rear frame
    // Nose bump
    fillRect(ctx,  4*s, -12*s, 1*s, 2*s, sk);
    fillRect(ctx,  5*s, -11*s, 1*s, 1*s, skDark, 0.6);
    // Mouth
    fillRect(ctx,  3*s, -10*s, 2*s, 1*s, skDark, 0.5);
    // Neck
    fillRect(ctx, -1*s, -10*s, 2*s, 2*s, sk);
    // Torso (dark navy jacket)
    fillRect(ctx, -2*s, -9*s, 5*s, 7*s, clothes);
    fillRect(ctx, -2*s, -9*s, 5*s, 1*s, clothesHi, 0.3);  // shoulder highlight
    fillRect(ctx,  2*s, -8*s, 1*s, 5*s, '#000', 0.14);
    // Red undershirt visible at front opening
    fillRect(ctx, -2*s, -8*s, 1*s, 5*s, shirt, 0.7);
    // Jacket edge detail
    fillRect(ctx, -2*s, -9*s, 1*s, 7*s, clothesHi, 0.15);
    // Belt
    fillRect(ctx, -2*s, -2*s, 5*s, 1*s, '#3a2a10');
    // Front arm
    fillRect(ctx,  2*s, -9*s + legSwing*s, 2*s, 5*s, clothes);
    fillRect(ctx,  2*s, -9*s + legSwing*s, 1*s, 5*s, '#fff', 0.08);
    fillRect(ctx,  2*s, -4*s + legSwing*s, 2*s, 2*s, sk);
    // Back arm (darker)
    fillRect(ctx, -4*s, -9*s - legSwing*s, 2*s, 4*s, '#1e2a1e');
    // Front leg
    fillRect(ctx,  0,   -2*s, 3*s, 5*s + legSwing*s, pants);
    fillRect(ctx,  0,   -2*s, 1*s, 5*s + legSwing*s, '#fff', 0.07);
    fillRect(ctx, -1*s, 3*s + legSwing*s, 5*s, 2*s, '#282828'); // boot
    fillRect(ctx, -1*s, 3*s + legSwing*s, 5*s, 1*s, '#444', 0.3);
    // Back leg (darker)
    fillRect(ctx, -2*s, -2*s, 3*s, 5*s - legSwing*s, '#181820');
    fillRect(ctx, -2*s,  3*s - legSwing*s, 3*s, 2*s, '#1a1a1a');

  } else if (pose === 'back') {
    _shadowOval(ctx, 7*s, 2*s);
    fillRect(ctx, -4*s, -18*s, 8*s, 8*s, hair);
    fillRect(ctx, -4*s, -18*s, 8*s, 1*s, hairHi, 0.4);
    fillRect(ctx, -1*s, -10*s, 2*s, 2*s, sk);
    fillRect(ctx, -4*s,  -8*s, 8*s, 7*s, clothes);
    fillRect(ctx, -4*s,  -8*s, 8*s, 1*s, '#fff', 0.07);
    fillRect(ctx, -4*s,  -2*s, 8*s, 1*s, '#000', 0.12);
    fillRect(ctx,  3*s,  -7*s, 1*s, 5*s, '#000', 0.1);
    fillRect(ctx, -6*s,  -8*s, 2*s, 5*s, clothes);
    fillRect(ctx,  4*s,  -8*s, 2*s, 5*s, clothes);
    fillRect(ctx, -6*s,  -3*s, 2*s, 2*s, sk);
    fillRect(ctx,  4*s,  -3*s, 2*s, 2*s, sk);
    fillRect(ctx, -4*s, -1*s, 3*s, 6*s + legSwing*s, pants);
    fillRect(ctx,  1*s, -1*s, 3*s, 6*s - legSwing*s, pants);
    fillRect(ctx, -4*s, -1*s, 1*s, 6*s + legSwing*s, '#fff', 0.06);
    fillRect(ctx, -5*s, 5*s + legSwing*s, 4*s, 2*s, '#252525');
    fillRect(ctx,  1*s, 5*s - legSwing*s, 4*s, 2*s, '#252525');

  } else if (pose === 'sleep') {
    // Lying horizontal
    fillRect(ctx,  3*s, -8*s, 10*s, 5*s, '#3a2e48');
    fillRect(ctx,  5*s, -7*s,  7*s, 2*s, '#504060'); // pillow highlight
    fillRect(ctx, -9*s, -6*s, 18*s, 5*s, '#2a1e38');
    fillRect(ctx, -9*s, -6*s, 18*s, 1*s, '#3a2e50', 0.5); // blanket top
    fillRect(ctx, -8*s, -5*s, 12*s, 3*s, clothes);
    fillRect(ctx,  5*s,-12*s,  7*s, 7*s, sk);
    fillRect(ctx,  5*s,-12*s,  7*s, 3*s, hair);
    fillRect(ctx,  7*s, -8*s,  2*s, 1*s, '#333'); // closed eye
  }

  ctx.restore();
}

function drawChild(ctx, x, y, s, facing, animFrame, pose) {
  pose = pose || 'front';
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (facing < 0) { ctx.scale(-1, 1); }

  const sk     = '#d4a070';
  const skDark = '#a87850';
  const dress  = '#3a2a40';
  const dressHi= '#4e3a56';
  const hair   = '#301808';
  const hairHi = '#4a2818';
  const leg    = (animFrame % 2 === 0) ? 0 : 1;

  if (pose === 'front') {
    _shadowOval(ctx, 5*s, 1.5*s);
    // Head
    fillRect(ctx, -3*s, -14*s, 7*s, 7*s, sk);
    fillRect(ctx, -3*s, -14*s, 7*s, 1*s, '#fff', 0.14);
    fillRect(ctx,  3*s, -13*s, 1*s, 5*s, '#000', 0.1);
    // Hair with highlight
    fillRect(ctx, -3*s, -14*s, 7*s, 2*s, hair);
    fillRect(ctx,  3*s, -13*s, 1*s, 4*s, hair);
    fillRect(ctx, -2*s, -14*s, 3*s, 1*s, hairHi, 0.45);
    // Eyebrows
    fillRect(ctx, -1*s, -11*s, 1*s, 1*s, hair, 0.7);
    fillRect(ctx,  2*s, -11*s, 1*s, 1*s, hair, 0.7);
    // Eyes (whites + iris)
    fillRect(ctx, -2*s, -10*s, 2*s, 2*s, '#ccc8c0', 0.8);
    fillRect(ctx,  1*s, -10*s, 2*s, 2*s, '#ccc8c0', 0.8);
    fillRect(ctx, -1*s, -10*s, 1*s, 2*s, '#181830'); // iris L
    fillRect(ctx,  2*s, -10*s, 1*s, 2*s, '#181830'); // iris R
    // Nose
    fillRect(ctx,  0,    -8*s, 1*s, 1*s, skDark, 0.4);
    // Neck
    fillRect(ctx,  0,    -7*s, 2*s, 2*s, sk);
    // Dress with highlight
    fillRect(ctx, -3*s,  -5*s, 7*s, 5*s, dress);
    fillRect(ctx, -3*s,  -5*s, 7*s, 1*s, dressHi, 0.4);
    fillRect(ctx,  3*s,  -4*s, 1*s, 3*s, '#000', 0.1);
    fillRect(ctx, -2*s,  -4*s, 2*s, 3*s, dressHi, 0.18);
    // Arms
    fillRect(ctx, -5*s,  -5*s, 2*s, 4*s, sk);
    fillRect(ctx,  3*s,  -5*s, 2*s, 4*s, sk);
    fillRect(ctx, -5*s,  -4*s, 1*s, 3*s, '#fff', 0.07);
    fillRect(ctx,  4*s,  -4*s, 1*s, 3*s, '#000', 0.1);
    // Legs with highlight
    fillRect(ctx, -3*s,  0,  3*s, 5*s + leg*s, '#2a1a2e');
    fillRect(ctx,  1*s,  0,  3*s, 5*s - leg*s, '#2a1a2e');
    fillRect(ctx, -3*s,  0,  1*s, 5*s + leg*s, '#fff', 0.07);
    // Shoes
    fillRect(ctx, -4*s, 5*s + leg*s, 4*s, 2*s, '#201020');
    fillRect(ctx,  1*s, 5*s - leg*s, 4*s, 2*s, '#201020');
    fillRect(ctx, -4*s, 5*s + leg*s, 4*s, 1*s, '#3a2a3a', 0.4);

  } else if (pose === 'side') {
    _shadowOval(ctx, 4*s, 1.5*s);
    fillRect(ctx, -1*s, -14*s, 5*s, 6*s, sk);
    fillRect(ctx, -1*s, -14*s, 5*s, 1*s, '#fff', 0.14);
    fillRect(ctx,  3*s, -13*s, 1*s, 4*s, '#000', 0.1);
    fillRect(ctx, -1*s, -14*s, 5*s, 2*s, hair);
    fillRect(ctx, -2*s, -13*s, 1*s, 2*s, hair);
    fillRect(ctx,  2*s, -11*s, 2*s, 2*s, '#ccc8c0', 0.8);
    fillRect(ctx,  3*s, -11*s, 1*s, 2*s, '#181830');
    fillRect(ctx,  2*s, -12*s, 2*s, 1*s, hair, 0.8); // eyebrow
    fillRect(ctx,  3*s, -10*s, 1*s, 1*s, skDark, 0.5); // nose
    fillRect(ctx,  0,    -8*s, 2*s, 2*s, sk);
    fillRect(ctx, -2*s,  -6*s, 4*s, 5*s, dress);
    fillRect(ctx, -2*s,  -6*s, 4*s, 1*s, dressHi, 0.4);
    fillRect(ctx,  1*s,  -6*s + leg*s, 2*s, 3*s, sk);
    fillRect(ctx, -3*s,  -6*s - leg*s, 2*s, 3*s, '#28203a');
    fillRect(ctx,  0,    0,   2*s, 4*s + leg*s, '#2a1a2e');
    fillRect(ctx, -1*s,  4*s + leg*s, 4*s, 2*s, '#201020');
    fillRect(ctx, -1*s,  0,   2*s, 4*s - leg*s, '#1e1028');
    fillRect(ctx, -2*s,  4*s - leg*s, 3*s, 2*s, '#181018');

  } else if (pose === 'back') {
    _shadowOval(ctx, 5*s, 1.5*s);
    fillRect(ctx, -3*s, -14*s, 7*s, 7*s, hair);
    fillRect(ctx, -3*s, -14*s, 7*s, 1*s, hairHi, 0.4);
    fillRect(ctx,  0,    -7*s, 2*s, 2*s, sk);
    fillRect(ctx, -3*s,  -5*s, 7*s, 5*s, dress);
    fillRect(ctx, -3*s,  -5*s, 7*s, 1*s, dressHi, 0.3);
    fillRect(ctx,  3*s,  -4*s, 1*s, 3*s, '#000', 0.1);
    fillRect(ctx, -5*s,  -5*s, 2*s, 4*s, sk);
    fillRect(ctx,  3*s,  -5*s, 2*s, 4*s, sk);
    fillRect(ctx, -3*s,  0,  3*s, 5*s + leg*s, '#2a1a2e');
    fillRect(ctx,  1*s,  0,  3*s, 5*s - leg*s, '#2a1a2e');
    fillRect(ctx, -4*s, 5*s + leg*s, 4*s, 2*s, '#181018');
    fillRect(ctx,  1*s, 5*s - leg*s, 4*s, 2*s, '#181018');

  } else if (pose === 'sleep') {
    fillRect(ctx,  2*s,  -7*s, 8*s, 4*s, '#3a2e48');
    fillRect(ctx,  4*s,  -6*s, 5*s, 2*s, '#504060', 0.5); // pillow highlight
    fillRect(ctx, -7*s,  -5*s, 14*s, 4*s, '#2a1e38');
    fillRect(ctx, -7*s,  -5*s, 14*s, 1*s, '#3a2e50', 0.4);
    fillRect(ctx, -6*s,  -4*s,  9*s, 2*s, dress);
    fillRect(ctx,  4*s, -10*s,  6*s, 6*s, sk);
    fillRect(ctx,  4*s, -10*s,  6*s, 2*s, hair);
    fillRect(ctx,  6*s,  -7*s,  2*s, 1*s, '#333');
  }

  ctx.restore();
}

function drawSurvivor(ctx, x, y, s, facing, animFrame, idx, pose) {
  pose = pose || 'front';
  const clothColors  = ['#2a3828','#282a38','#382820','#283030'];
  const clothHiColor = ['#3a4e38','#383a4e','#4e3830','#384040'];
  const hairColors   = ['#201808','#101020','#301810','#102018'];
  const hairHiColors = ['#382818','#201828','#482010','#183020'];
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (facing < 0) { ctx.scale(-1, 1); }

  const sk   = C.skin;
  const skD  = '#a07848';
  const cl   = clothColors[idx % clothColors.length];
  const clHi = clothHiColor[idx % clothHiColor.length];
  const hr   = hairColors[idx % hairColors.length];
  const hrHi = hairHiColors[idx % hairHiColors.length];
  const leg  = (animFrame % 2 === 0) ? 0 : 1;

  if (pose === 'front') {
    _shadowOval(ctx, 7*s, 2*s);
    fillRect(ctx, -4*s, -18*s, 8*s, 8*s, sk);
    fillRect(ctx, -4*s, -18*s, 8*s, 1*s, '#fff', 0.12);
    fillRect(ctx,  3*s, -17*s, 1*s, 6*s, '#000', 0.1);
    fillRect(ctx, -4*s, -18*s, 8*s, 2*s, hr);
    fillRect(ctx, -4*s, -16*s, 1*s, 2*s, hr);
    fillRect(ctx,  3*s, -16*s, 1*s, 2*s, hr);
    fillRect(ctx, -3*s, -18*s, 3*s, 1*s, hrHi, 0.4);
    fillRect(ctx, -3*s, -15*s, 2*s, 1*s, hr, 0.8); // eyebrow L
    fillRect(ctx,  1*s, -15*s, 2*s, 1*s, hr, 0.8); // eyebrow R
    fillRect(ctx, -3*s, -14*s, 2*s, 2*s, '#ccc8c0', 0.8);
    fillRect(ctx,  1*s, -14*s, 2*s, 2*s, '#ccc8c0', 0.8);
    fillRect(ctx, -2*s, -14*s, 1*s, 2*s, '#222'); // iris L
    fillRect(ctx,  2*s, -14*s, 1*s, 2*s, '#222'); // iris R
    fillRect(ctx, -1*s, -12*s, 1*s, 1*s, skD, 0.5); // nose
    fillRect(ctx, -1*s, -11*s, 3*s, 1*s, skD, 0.4); // mouth
    fillRect(ctx, -1*s, -10*s, 2*s, 2*s, sk);
    // Torso
    fillRect(ctx, -4*s, -8*s, 8*s, 7*s, cl);
    fillRect(ctx, -4*s, -8*s, 8*s, 1*s, '#fff', 0.08);
    fillRect(ctx, -4*s, -2*s, 8*s, 1*s, '#000', 0.13);
    fillRect(ctx,  3*s, -7*s, 1*s, 5*s, '#000', 0.1);
    fillRect(ctx, -3*s, -7*s, 2*s, 4*s, clHi, 0.2);
    // Arms
    fillRect(ctx, -6*s, -8*s, 2*s, 5*s, cl);
    fillRect(ctx,  4*s, -8*s, 2*s, 5*s, cl);
    fillRect(ctx, -6*s, -7*s, 1*s, 4*s, '#fff', 0.07);
    fillRect(ctx,  5*s, -7*s, 1*s, 4*s, '#000', 0.1);
    // Legs + boots
    fillRect(ctx, -4*s, -1*s, 3*s, 6*s + leg*s, '#222');
    fillRect(ctx,  1*s, -1*s, 3*s, 6*s - leg*s, '#222');
    fillRect(ctx, -4*s, -1*s, 1*s, 6*s + leg*s, '#fff', 0.06);
    fillRect(ctx, -4*s,  1*s + leg*s, 3*s, 2*s, '#333', 0.3);
    fillRect(ctx, -5*s, 5*s + leg*s, 4*s, 2*s, '#1a1a1a');
    fillRect(ctx,  1*s, 5*s - leg*s, 4*s, 2*s, '#1a1a1a');
    fillRect(ctx, -5*s, 5*s + leg*s, 4*s, 1*s, '#3a3a3a', 0.35);

  } else if (pose === 'side') {
    _shadowOval(ctx, 6*s, 2*s);
    fillRect(ctx, -1*s, -18*s, 6*s, 7*s, sk);
    fillRect(ctx, -1*s, -18*s, 6*s, 1*s, '#fff', 0.12);
    fillRect(ctx,  4*s, -17*s, 1*s, 5*s, '#000', 0.1);
    fillRect(ctx, -1*s, -18*s, 6*s, 3*s, hr);
    fillRect(ctx, -2*s, -17*s, 1*s, 3*s, hr);
    fillRect(ctx, -1*s, -18*s, 4*s, 1*s, hrHi, 0.4);
    fillRect(ctx, -1*s, -14*s, 1*s, 2*s, skD, 0.6); // ear
    fillRect(ctx,  2*s, -14*s, 2*s, 2*s, '#ccc8c0', 0.8);
    fillRect(ctx,  3*s, -14*s, 1*s, 2*s, '#222');
    fillRect(ctx,  2*s, -15*s, 2*s, 1*s, hr, 0.8);
    fillRect(ctx,  4*s, -13*s, 1*s, 2*s, sk); // nose
    fillRect(ctx, -1*s, -11*s, 2*s, 2*s, sk);
    fillRect(ctx, -2*s,  -9*s, 5*s, 7*s, cl);
    fillRect(ctx, -2*s,  -9*s, 5*s, 1*s, '#fff', 0.08);
    fillRect(ctx,  2*s,  -8*s, 1*s, 5*s, '#000', 0.1);
    fillRect(ctx,  2*s,  -9*s + leg*s, 2*s, 5*s, cl);
    fillRect(ctx,  2*s,  -9*s + leg*s, 1*s, 5*s, '#fff', 0.07);
    fillRect(ctx,  2*s,  -4*s + leg*s, 2*s, 2*s, sk);
    fillRect(ctx, -4*s,  -9*s - leg*s, 2*s, 4*s, '#1e2220');
    fillRect(ctx,  0,    -2*s, 3*s, 5*s + leg*s, '#222');
    fillRect(ctx,  0,    -2*s, 1*s, 5*s + leg*s, '#fff', 0.06);
    fillRect(ctx, -1*s,   3*s + leg*s, 5*s, 2*s, '#1a1a1a');
    fillRect(ctx, -2*s,  -2*s, 3*s, 5*s - leg*s, '#181818');
    fillRect(ctx, -2*s,   3*s - leg*s, 3*s, 2*s, '#141414');

  } else if (pose === 'back') {
    _shadowOval(ctx, 7*s, 2*s);
    fillRect(ctx, -4*s, -18*s, 8*s, 8*s, hr);
    fillRect(ctx, -4*s, -18*s, 8*s, 1*s, hrHi, 0.4);
    fillRect(ctx, -1*s, -10*s, 2*s, 2*s, sk);
    fillRect(ctx, -4*s, -8*s, 8*s, 7*s, cl);
    fillRect(ctx, -4*s, -8*s, 8*s, 1*s, '#fff', 0.07);
    fillRect(ctx,  3*s, -7*s, 1*s, 5*s, '#000', 0.1);
    fillRect(ctx, -6*s, -8*s, 2*s, 5*s, cl);
    fillRect(ctx,  4*s, -8*s, 2*s, 5*s, cl);
    fillRect(ctx, -4*s, -1*s, 3*s, 6*s + leg*s, '#222');
    fillRect(ctx,  1*s, -1*s, 3*s, 6*s - leg*s, '#222');
    fillRect(ctx, -5*s, 5*s + leg*s, 4*s, 2*s, '#141414');
    fillRect(ctx,  1*s, 5*s - leg*s, 4*s, 2*s, '#141414');

  } else if (pose === 'sleep') {
    fillRect(ctx,  3*s,  -8*s, 10*s, 5*s, '#3a2e48');
    fillRect(ctx,  5*s,  -7*s,  7*s, 2*s, '#504060', 0.5);
    fillRect(ctx, -9*s,  -6*s, 18*s, 5*s, '#201830');
    fillRect(ctx, -9*s,  -6*s, 18*s, 1*s, '#302040', 0.4);
    fillRect(ctx, -8*s,  -5*s, 12*s, 3*s, cl);
    fillRect(ctx,  5*s, -12*s,  7*s, 7*s, sk);
    fillRect(ctx,  5*s, -12*s,  7*s, 3*s, hr);
    fillRect(ctx,  7*s,  -8*s,  2*s, 1*s, '#333');
  }

  ctx.restore();
}

function drawDog(ctx, x, y, s, facing, animFrame) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (facing < 0) { ctx.scale(-1, 1); }

  const fur  = '#6b4a2a';
  const furHi= '#8a6040';
  const dark = '#3a2810';
  const nose = '#1a1010';
  const leg  = (animFrame % 2 === 0) ? 0 : 1;

  _shadowOval(ctx, 8*s, 2*s);

  // Tail (curved, wagging)
  const wag = Math.sin(animFrame * 0.2) * 2 * s;
  fillRect(ctx, -8*s, -8*s + wag, 2*s, 4*s, fur);
  fillRect(ctx, -9*s, -9*s + wag, 2*s, 2*s, fur); // curl
  fillRect(ctx, -8*s, -8*s + wag, 1*s, 3*s, '#fff', 0.07); // tail highlight

  // Body with belly shadow
  fillRect(ctx, -6*s, -6*s, 12*s, 5*s, fur);
  fillRect(ctx, -6*s, -6*s, 12*s, 1*s, furHi, 0.4); // back highlight (top)
  fillRect(ctx, -5*s, -2*s, 10*s, 1*s, dark, 0.35); // belly shadow
  fillRect(ctx, -6*s, -5*s, 1*s, 4*s, '#fff', 0.06); // left highlight

  // Head
  fillRect(ctx,  4*s, -9*s, 5*s, 5*s, fur);
  fillRect(ctx,  4*s, -9*s, 5*s, 1*s, furHi, 0.3);
  fillRect(ctx,  8*s, -8*s, 1*s, 4*s, '#000', 0.1);
  // Ears (pointed up)
  fillRect(ctx,  4*s, -12*s, 2*s, 4*s, dark);
  fillRect(ctx,  6*s, -11*s, 1*s, 2*s, '#5a3818', 0.4); // inner ear
  // Eye
  fillRect(ctx,  7*s, -8*s, 2*s, 2*s, '#c8b090', 0.7);
  fillRect(ctx,  8*s, -8*s, 1*s, 2*s, dark);
  fillRect(ctx,  7*s, -8*s, 1*s, 1*s, '#fff', 0.25); // eye shine
  // Snout
  fillRect(ctx,  8*s, -7*s, 3*s, 3*s, dark);
  fillRect(ctx,  9*s, -6*s, 1*s, 1*s, '#000'); // nostril
  fillRect(ctx,  8*s, -7*s, 3*s, 1*s, '#5a3a20', 0.3); // snout top

  // Legs (front pair brighter, rear pair darker)
  fillRect(ctx,  2*s, -1*s, 2*s, 3*s + leg*s, fur);   // front-right
  fillRect(ctx, -1*s, -1*s, 2*s, 3*s - leg*s, fur);   // front-left
  fillRect(ctx, -4*s, -1*s, 2*s, 3*s + leg*s, dark);  // rear-right
  fillRect(ctx, -1*s + leg*s*2, -1*s, 2*s, 3*s - leg*s, dark); // rear-left
  // Paw tips
  fillRect(ctx,  2*s, 2*s + leg*s, 2*s, 1*s, dark);
  fillRect(ctx, -1*s, 2*s - leg*s, 2*s, 1*s, dark);
  fillRect(ctx, -4*s, 2*s + leg*s, 2*s, 1*s, nose);
  ctx.restore();
}

// ── Enemy sprites ─────────────────────────────────────────────────────────────

function drawDroneSprite(ctx, x, y, s, animFrame) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));

  const body  = '#2a2e36';
  const bodyHi= '#3a4050';
  const glow  = '#60a0cc';
  const dark  = '#181c22';
  const arm   = '#202430';
  const hover = Math.sin(animFrame * 0.15) * 2 * s;

  ctx.translate(0, hover);

  // Fading shadow on ground (moves opposite hover)
  ctx.save();
  ctx.translate(0, -hover + 30*s);
  ctx.globalAlpha = 0.12 + Math.cos(animFrame * 0.15) * 0.06;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(0, 0, 9*s, 2*s, 0, 0, Math.PI*2); ctx.fill();
  ctx.restore();

  // Rotor arms (4 directions)
  fillRect(ctx, -14*s, -1*s, 6*s, 2*s, arm);
  fillRect(ctx,  8*s,  -1*s, 6*s, 2*s, arm);
  fillRect(ctx,  -1*s, -12*s, 2*s, 6*s, arm);
  fillRect(ctx,  -1*s,  6*s,  2*s, 6*s, arm);

  // Rotor discs (blurred circles at tips)
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#8ab8d0';
  ctx.beginPath(); ctx.arc(-11*s, 0, 4*s, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc( 11*s, 0, 4*s, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(0, -9*s, 3*s, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(0,  9*s, 3*s, 0, Math.PI*2); ctx.fill();
  ctx.restore();

  // Antenna
  fillRect(ctx, 0, -10*s, 1*s, 4*s, bodyHi);
  fillRect(ctx, -1*s, -11*s, 3*s, 1*s, glow, 0.5);

  // Main body (hexagonal cross)
  fillRect(ctx, -6*s, -4*s, 12*s, 8*s, body);
  fillRect(ctx, -4*s, -6*s, 8*s, 12*s, body);
  // Body panel highlights
  fillRect(ctx, -6*s, -4*s, 12*s, 1*s, bodyHi, 0.35); // top edge
  fillRect(ctx, -5*s, -3*s, 1*s, 6*s, '#ffffff', 0.06); // left highlight
  fillRect(ctx,  4*s, -3*s, 1*s, 6*s, '#000', 0.18); // right shadow
  fillRect(ctx, -6*s,  3*s, 12*s, 1*s, '#000', 0.2); // bottom shadow

  // Central sensor eye (glowing)
  fillRect(ctx, -2*s, -2*s, 4*s, 4*s, glow, 0.9);
  fillRect(ctx,  0,   -1*s, 2*s, 2*s, '#c0e0ff', 0.85);
  fillRect(ctx, -1*s, -2*s, 2*s, 1*s, '#e0f4ff', 0.4); // highlight
  fillRect(ctx, -2*s,  2*s, 4*s, 1*s, '#000', 0.3); // eye bottom shadow

  // Belly sensor array
  fillRect(ctx, -3*s,  3*s, 6*s, 2*s, dark);
  fillRect(ctx, -2*s,  3*s, 1*s, 1*s, glow, 0.45);
  fillRect(ctx,  0,    3*s, 1*s, 1*s, glow, 0.45);
  fillRect(ctx,  2*s,  3*s, 1*s, 1*s, glow, 0.45);

  ctx.restore();
}

function drawRobotSprite(ctx, x, y, s, facing) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (facing < 0) ctx.scale(-1, 1);

  const body  = '#303840';
  const bodyHi= '#404e5c';
  const bodyDk= '#1c2228';
  const head  = '#252c34';
  const headHi= '#323c48';
  const eye   = '#cc2020';
  const eyeHi = '#ff6060';
  const leg   = '#202830';
  const legHi = '#2c3a48';
  const joint = '#505a68';

  _shadowOval(ctx, 9*s, 2.5*s);

  // Legs
  fillRect(ctx, -5*s, -2*s, 4*s, 8*s, leg);
  fillRect(ctx,  1*s, -2*s, 4*s, 8*s, leg);
  // Leg highlights + shadows
  fillRect(ctx, -5*s, -2*s, 1*s, 8*s, '#fff', 0.08);
  fillRect(ctx,  4*s, -2*s, 1*s, 8*s, '#000', 0.18);
  fillRect(ctx,  1*s, -2*s, 1*s, 8*s, '#fff', 0.08);
  // Knee joints
  fillRect(ctx, -5*s, 2*s, 4*s, 2*s, joint);
  fillRect(ctx,  1*s, 2*s, 4*s, 2*s, joint);
  fillRect(ctx, -5*s, 2*s, 4*s, 1*s, '#fff', 0.1);
  // Feet (extended)
  fillRect(ctx, -6*s, 6*s, 5*s, 2*s, leg);
  fillRect(ctx,  1*s, 6*s, 5*s, 2*s, leg);
  fillRect(ctx, -6*s, 6*s, 5*s, 1*s, legHi, 0.35);

  // Lower body
  fillRect(ctx, -5*s, -6*s, 10*s, 4*s, body);
  fillRect(ctx, -5*s, -6*s, 10*s, 1*s, '#fff', 0.09);
  fillRect(ctx, -5*s, -3*s, 10*s, 1*s, '#000', 0.18);
  // Hip joints
  fillRect(ctx, -5*s, -3*s, 4*s, 1*s, joint);
  fillRect(ctx,  1*s, -3*s, 4*s, 1*s, joint);

  // Shoulder pads (before arms, drawn wider)
  fillRect(ctx, -9*s, -16*s, 3*s, 4*s, bodyHi);
  fillRect(ctx,  6*s, -16*s, 3*s, 4*s, bodyHi);
  fillRect(ctx, -9*s, -16*s, 3*s, 1*s, '#fff', 0.12);

  // Arms
  fillRect(ctx, -9*s, -15*s, 3*s, 8*s, body);
  fillRect(ctx,  6*s, -15*s, 3*s, 8*s, body);
  fillRect(ctx, -9*s, -14*s, 1*s, 7*s, '#fff', 0.08); // left arm highlight
  fillRect(ctx,  8*s, -14*s, 1*s, 7*s, '#000', 0.15); // right arm shadow
  // Elbow joints
  fillRect(ctx, -9*s, -10*s, 3*s, 2*s, joint);
  fillRect(ctx,  6*s, -10*s, 3*s, 2*s, joint);

  // Torso
  fillRect(ctx, -6*s, -16*s, 12*s, 10*s, body);
  fillRect(ctx, -6*s, -16*s, 12*s, 1*s, '#fff', 0.1); // top highlight
  fillRect(ctx,  5*s, -15*s, 1*s, 8*s, '#000', 0.15); // right edge shadow
  fillRect(ctx, -6*s, -15*s, 1*s, 8*s, '#fff', 0.06); // left edge highlight
  // Torso panel lines
  fillRect(ctx, -6*s, -11*s, 12*s, 1*s, bodyDk, 0.45); // horizontal panel seam
  fillRect(ctx,  0,   -15*s, 1*s, 8*s, bodyDk, 0.3);   // vertical seam
  // Chest reactor
  fillRect(ctx, -2*s, -14*s, 4*s, 4*s, '#141820');
  fillRect(ctx, -1*s, -13*s, 2*s, 2*s, eye, 0.85);
  fillRect(ctx, -1*s, -13*s, 2*s, 1*s, eyeHi, 0.35); // glow top
  // Side vents
  fillRect(ctx, -6*s, -13*s, 1*s, 2*s, bodyDk);
  fillRect(ctx,  5*s, -13*s, 1*s, 2*s, bodyDk);

  // Head
  fillRect(ctx, -5*s, -24*s, 10*s, 8*s, head);
  fillRect(ctx, -5*s, -24*s, 10*s, 1*s, '#fff', 0.12); // top
  fillRect(ctx,  4*s, -23*s, 1*s, 6*s, '#000', 0.18);  // right shadow
  fillRect(ctx, -5*s, -23*s, 1*s, 6*s, '#fff', 0.07);  // left highlight
  // Head panel seam
  fillRect(ctx, -5*s, -20*s, 10*s, 1*s, bodyDk, 0.3);
  // Visor (full-width red bar, two-tone)
  fillRect(ctx, -4*s, -21*s, 8*s, 3*s, '#1a0808');
  fillRect(ctx, -4*s, -21*s, 8*s, 3*s, eye, 0.82);
  fillRect(ctx, -4*s, -21*s, 8*s, 1*s, eyeHi, 0.3); // visor top glow
  fillRect(ctx, -4*s, -19*s, 8*s, 1*s, '#000', 0.3); // visor bottom shadow
  // Head side lights
  fillRect(ctx, -5*s, -22*s, 1*s, 1*s, eye, 0.5);
  fillRect(ctx,  4*s, -22*s, 1*s, 1*s, eye, 0.5);

  ctx.restore();
}

function drawHumanEnemy(ctx, x, y, s, facing, animFrame) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (facing < 0) ctx.scale(-1, 1);

  const sk   = '#a07040';
  const skD  = '#705020';
  const cl   = '#3a2020';
  const vest = '#241a14';
  const leg  = (animFrame % 2 === 0) ? 0 : 1;

  _shadowOval(ctx, 7*s, 2*s);

  // Head
  fillRect(ctx, -4*s, -18*s, 8*s, 8*s, sk);
  fillRect(ctx, -4*s, -18*s, 8*s, 1*s, '#fff', 0.1);
  fillRect(ctx,  3*s, -17*s, 1*s, 6*s, '#000', 0.12);
  // Bandana / head wrap (full head cover)
  fillRect(ctx, -4*s, -18*s, 8*s, 4*s, '#1a1010');
  fillRect(ctx, -4*s, -14*s, 8*s, 1*s, '#2e1818'); // wrap lower edge
  fillRect(ctx, -4*s, -18*s, 8*s, 1*s, '#2e1818', 0.5); // wrap top
  // Angry furrowed brows
  fillRect(ctx, -3*s, -14*s, 3*s, 1*s, '#0a0606', 0.9); // brow L (angled)
  fillRect(ctx,  1*s, -14*s, 3*s, 1*s, '#0a0606', 0.9); // brow R
  fillRect(ctx, -3*s, -15*s, 1*s, 1*s, '#0a0606', 0.6); // brow inner L
  fillRect(ctx,  3*s, -15*s, 1*s, 1*s, '#0a0606', 0.6); // brow inner R
  // Eyes (red-tinted angry)
  fillRect(ctx, -3*s, -13*s, 2*s, 2*s, '#c8a090', 0.7);
  fillRect(ctx,  1*s, -13*s, 2*s, 2*s, '#c8a090', 0.7);
  fillRect(ctx, -2*s, -13*s, 1*s, 2*s, '#3a0808'); // iris L
  fillRect(ctx,  2*s, -13*s, 1*s, 2*s, '#3a0808'); // iris R
  // Nose
  fillRect(ctx, -1*s, -11*s, 1*s, 1*s, skD, 0.6);
  // Snarl / grit
  fillRect(ctx, -2*s, -10*s, 5*s, 1*s, skD, 0.5);
  fillRect(ctx, -1*s, -10*s, 3*s, 1*s, '#1a0808', 0.4); // dark gap
  // Neck
  fillRect(ctx, -1*s, -10*s, 2*s, 2*s, sk);

  // Base shirt / arms
  fillRect(ctx, -4*s, -8*s, 8*s, 7*s, cl);
  fillRect(ctx, -6*s, -8*s, 2*s, 5*s, cl);
  fillRect(ctx,  4*s, -8*s, 2*s, 5*s, cl);
  fillRect(ctx, -6*s, -7*s, 1*s, 4*s, '#fff', 0.06);
  fillRect(ctx,  5*s, -7*s, 1*s, 4*s, '#000', 0.12);
  // Tactical vest overlay
  fillRect(ctx, -3*s, -8*s, 6*s, 7*s, vest);
  fillRect(ctx, -3*s, -8*s, 6*s, 1*s, '#3a2828', 0.5);
  fillRect(ctx,  2*s, -7*s, 1*s, 5*s, '#000', 0.2);
  // Vest pouches
  fillRect(ctx, -3*s, -5*s, 2*s, 3*s, '#181210');
  fillRect(ctx,  1*s, -5*s, 2*s, 3*s, '#181210');
  fillRect(ctx, -3*s, -5*s, 2*s, 1*s, '#2a1e14', 0.5);
  fillRect(ctx,  1*s, -5*s, 2*s, 1*s, '#2a1e14', 0.5);
  // Hands
  fillRect(ctx, -6*s, -3*s, 2*s, 2*s, sk);
  fillRect(ctx,  4*s, -3*s, 2*s, 2*s, sk);

  // Legs
  fillRect(ctx, -4*s, -1*s, 3*s, 6*s + leg*s, '#201818');
  fillRect(ctx,  1*s, -1*s, 3*s, 6*s - leg*s, '#201818');
  fillRect(ctx, -4*s, -1*s, 1*s, 6*s + leg*s, '#fff', 0.06);
  fillRect(ctx,  3*s, -1*s, 1*s, 6*s - leg*s, '#000', 0.1);
  // Boots
  fillRect(ctx, -5*s, 5*s + leg*s, 4*s, 2*s, '#161010');
  fillRect(ctx,  1*s, 5*s - leg*s, 4*s, 2*s, '#161010');
  fillRect(ctx, -5*s, 5*s + leg*s, 4*s, 1*s, '#2a1e1e', 0.35);
  fillRect(ctx, -5*s, 6*s + leg*s, 1*s, 1*s, '#2a2020'); // heel

  // Weapon (rifle barrel over shoulder)
  fillRect(ctx,  4*s, -8*s, 1*s, 10*s, '#3a3820');
  fillRect(ctx,  4*s, -7*s, 3*s, 2*s, '#4a4a2a');
  fillRect(ctx,  6*s, -7*s, 1*s, 2*s, '#686040', 0.5); // receiver highlight

  ctx.restore();
}

function drawWolfSprite(ctx, x, y, s, facing, animFrame) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (facing < 0) { ctx.scale(-1, 1); }

  const fur  = '#4a4038'; // grey-brown wolf
  const furHi= '#6a5a50';
  const dark = '#282018';
  const nose = '#1a1010';
  const leg  = (animFrame % 2 === 0) ? 0 : 1;

  _shadowOval(ctx, 10*s, 2.5*s);

  // Tail (low, aggressive)
  fillRect(ctx, -10*s, -2*s, 3*s, 2*s, fur);
  fillRect(ctx, -10*s, -2*s, 3*s, 1*s, furHi, 0.25);

  // Body (larger than dog)
  fillRect(ctx, -7*s, -8*s, 14*s, 6*s, fur);
  fillRect(ctx, -7*s, -8*s, 14*s, 1*s, furHi, 0.35); // back highlight
  fillRect(ctx, -7*s, -7*s, 1*s, 5*s, '#fff', 0.06);
  // Neck hump (hackles raised)
  fillRect(ctx,  4*s, -10*s, 4*s, 3*s, fur);
  fillRect(ctx,  4*s, -12*s, 2*s, 2*s, dark); // hackle spikes
  fillRect(ctx,  6*s, -11*s, 2*s, 1*s, dark);

  // Head (longer, lower snout)
  fillRect(ctx,  5*s, -12*s, 6*s, 6*s, fur);
  fillRect(ctx,  5*s, -12*s, 6*s, 1*s, furHi, 0.3);
  fillRect(ctx, 10*s, -11*s, 1*s, 5*s, '#000', 0.1);
  // Ears (pointed)
  fillRect(ctx,  5*s, -15*s, 2*s, 4*s, dark);
  fillRect(ctx,  8*s, -14*s, 2*s, 3*s, dark);
  fillRect(ctx,  5*s, -14*s, 1*s, 2*s, '#7a5040', 0.4);
  // Eye (amber / menacing)
  fillRect(ctx,  9*s, -11*s, 2*s, 2*s, '#d09020', 0.8);
  fillRect(ctx, 10*s, -11*s, 1*s, 2*s, dark);
  fillRect(ctx,  9*s, -11*s, 1*s, 1*s, '#fff', 0.3);
  // Long snout
  fillRect(ctx, 10*s, -10*s, 4*s, 3*s, dark);
  fillRect(ctx, 10*s, -10*s, 4*s, 1*s, '#6a4830', 0.3);
  fillRect(ctx, 13*s, -9*s, 1*s, 1*s, nose); // nostril
  // Teeth hint
  fillRect(ctx, 11*s, -7*s, 3*s, 1*s, '#d0c0a0', 0.6);

  // Legs
  fillRect(ctx,  3*s, -2*s, 2*s, 4*s + leg*s, fur);
  fillRect(ctx,  0,   -2*s, 2*s, 4*s - leg*s, fur);
  fillRect(ctx, -4*s, -2*s, 2*s, 4*s + leg*s, dark);
  fillRect(ctx, -2*s, -2*s, 2*s, 4*s - leg*s, dark);
  // Paws
  fillRect(ctx,  3*s, 2*s + leg*s, 3*s, 1*s, dark);
  fillRect(ctx,  0,   2*s - leg*s, 3*s, 1*s, dark);
  fillRect(ctx, -4*s, 2*s + leg*s, 3*s, 1*s, nose);

  ctx.restore();
}

// ── Environment / shelter tiles ───────────────────────────────────────────────

function drawRoomInterior(ctx, x, y, w, h, unlocked, selected) {
  const bg = unlocked ? C.floor : C.bg;
  const wall = unlocked ? C.wallLight : C.border;

  // Floor
  fillRect(ctx, x, y, w, h, bg);

  // Wall details (brick-like pattern)
  if (unlocked) {
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#ffffff';
    for (let gy = 0; gy < h; gy += 8) {
      const offset = (Math.floor(gy / 8) % 2) * 12;
      for (let gx = offset; gx < w; gx += 24) {
        ctx.fillRect(Math.round(x + gx), Math.round(y + gy), 22, 7);
      }
    }
    ctx.globalAlpha = 1;
  }

  // Border
  const borderColor = selected ? '#6a8a6a' : (unlocked ? C.border2 : C.border);
  strokeRect(ctx, x, y, w, h, borderColor, selected ? 2 : 1);

  // Top highlight line
  if (unlocked) {
    ctx.strokeStyle = C.wallLight;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(x)+1, Math.round(y)+1);
    ctx.lineTo(Math.round(x+w)-1, Math.round(y)+1);
    ctx.stroke();
  }
}

// ── Day / Night cycle helpers ─────────────────────────────────────────────────

function _lerpHex(a, b, t) {
  const p = s => [parseInt(s.slice(1,3),16), parseInt(s.slice(3,5),16), parseInt(s.slice(5,7),16)];
  const [ar,ag,ab] = p(a), [br,bg,bb] = p(b);
  return `rgb(${Math.round(ar+(br-ar)*t)},${Math.round(ag+(bg-ag)*t)},${Math.round(ab+(bb-ab)*t)})`;
}

// Key frames mapped to 24h clock: t = game_minutes / 1440
// [t,  skyTop,    skyBottom]
const _SKY_KF = [
  [0.00, '#050408', '#080810'],  // 00:00 midnight — near black
  [0.17, '#0a0614', '#0d0820'],  // 04:00 deep night
  [0.25, '#1e0c28', '#2c1238'],  // 06:00 dawn — dark purple
  [0.33, '#2a1830', '#1a2040'],  // 08:00 morning — purple-blue
  [0.50, '#182838', '#1e3450'],  // 12:00 noon — overcast blue-grey
  [0.67, '#1a2030', '#1c2840'],  // 16:00 afternoon
  [0.75, '#28101c', '#3a1428'],  // 18:00 dusk — warm purple
  [0.88, '#0e060e', '#140810'],  // 21:00 evening
  [1.00, '#050408', '#080810'],  // 24:00 midnight
];

function _getSkyColors(t) {
  for (let i = 1; i < _SKY_KF.length; i++) {
    if (t <= _SKY_KF[i][0]) {
      const [pt, pa, pb] = _SKY_KF[i-1], [nt, na, nb] = _SKY_KF[i];
      const f = (t - pt) / (nt - pt);
      return [_lerpHex(pa, na, f), _lerpHex(pb, nb, f)];
    }
  }
  return [_SKY_KF[0][1], _SKY_KF[0][2]];
}

// Static star positions
const _STARS = [
  [28,7],[65,13],[118,4],[175,11],[238,6],[295,9],[352,7],[408,13],[450,5],
  [58,16],[142,8],[268,3],[432,10],[90,5],[200,14],[330,9],[480,6],
];

function drawSurface(ctx, scrollOffset, time) {
  const H = CFG.SURFACE_H;
  const W = CFG.W - CFG.PANEL_W;
  // Use in-game clock (minutes 0-1440) when available, else fall back to 6am
  const t = (time !== undefined) ? time / 1440 : 0.25;
  const [skyTop, skyBot] = _getSkyColors(t);

  // Sky base
  fillRect(ctx, 0, 0, W, H, skyTop);
  fillRect(ctx, 0, H * 0.4, W, H * 0.6, skyBot);

  // Stars — visible at night (t<0.22 or t>0.83), fade near dawn/dusk
  const starA = t < 0.17 ? 1 : t < 0.27 ? 1-(t-0.17)/0.10 : t > 0.83 ? (t-0.83)/0.09 : 0;
  if (starA > 0.01) {
    ctx.save();
    ctx.fillStyle = '#ccc8e0';
    for (const [sx, sy] of _STARS) {
      ctx.globalAlpha = starA * (0.4 + ((sx * sy) % 7) * 0.08);
      ctx.fillRect(sx, sy, (sx + sy) % 4 === 0 ? 2 : 1, (sx + sy) % 4 === 0 ? 2 : 1);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Moon (night) or dim sun (day)
  const isNight = t < 0.25 || t > 0.80;
  if (isNight) {
    const mt = t < 0.25 ? t / 0.25 : (t - 0.80) / 0.20;
    const mx2 = 30 + mt * (W - 60);
    const mAlpha = Math.min(1, t < 0.20 ? 1 : t < 0.25 ? 1-(t-0.20)/0.05 : t > 0.88 ? 1 : (t-0.80)/0.08);
    ctx.save();
    ctx.globalAlpha = mAlpha * 0.85;
    ctx.fillStyle = '#d4cce8';
    ctx.beginPath(); ctx.arc(mx2, 14, 5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = skyTop; // crescent shadow
    ctx.beginPath(); ctx.arc(mx2+2, 13, 4, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  } else {
    const dayFrac = (t - 0.25) / 0.55;
    const sunX = 30 + dayFrac * (W - 60);
    const sunA = t < 0.35 ? (t-0.25)/0.10 : t > 0.70 ? 1-(t-0.70)/0.10 : 1;
    // Ambient daylight wash over the sky
    ctx.save();
    ctx.globalAlpha = sunA * 0.18;
    ctx.fillStyle = '#c8a850';
    ctx.fillRect(0, 0, W, H);
    // Sun disc
    ctx.globalAlpha = sunA * 0.75;
    ctx.fillStyle = '#d4b060';
    ctx.beginPath(); ctx.arc(sunX, 15, 10, 0, Math.PI*2); ctx.fill();
    // Inner bright core
    ctx.globalAlpha = sunA * 0.55;
    ctx.fillStyle = '#ffe8a0';
    ctx.beginPath(); ctx.arc(sunX, 15, 5, 0, Math.PI*2); ctx.fill();
    // Halo
    ctx.globalAlpha = sunA * 0.18;
    ctx.fillStyle = '#c8a040';
    ctx.beginPath(); ctx.arc(sunX, 15, 22, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Distant building silhouettes
  const winBright = isNight ? 0.55 : 0.12;
  ctx.globalAlpha = 0.35;
  const buildings = [
    { x: 20, w: 40, h: 55 }, { x: 70, w: 30, h: 45 }, { x: 105, w: 50, h: 65 },
    { x: 160, w: 35, h: 40 }, { x: 200, w: 60, h: 70 }, { x: 265, w: 25, h: 35 },
    { x: 295, w: 45, h: 55 }, { x: 345, w: 20, h: 30 }, { x: 370, w: 55, h: 60 },
    { x: 430, w: 30, h: 42 },
  ];
  ctx.fillStyle = '#14141a';
  const so = (scrollOffset * 0.05) % W;
  for (const b of buildings) {
    const bx = ((b.x - so) % (W + 100) + W + 100) % (W + 100) - 50;
    ctx.fillRect(Math.round(bx), Math.round(H - b.h), Math.round(b.w), Math.round(b.h));
    // Windows
    ctx.fillStyle = `rgba(200,200,140,${winBright})`;
    for (let wi = 4; wi < b.w - 4; wi += 8) {
      for (let wj = 8; wj < b.h - 6; wj += 10) {
        if ((b.x + wi + wj) % 3 !== 0) // some windows dark
          ctx.fillRect(Math.round(bx + wi), Math.round(H - b.h + wj), 4, 5);
      }
    }
    ctx.fillStyle = '#14141a';
  }
  ctx.globalAlpha = 1;

  // Ground line / dirt
  fillRect(ctx, 0, H - 4, W, 4, C.dirt);
  fillRect(ctx, 0, H - 2, W, 2, C.dirt2);

  // Debris / rocks
  ctx.fillStyle = C.concrete;
  ctx.globalAlpha = 0.4;
  const debris = [15, 80, 150, 230, 310, 390, 460];
  for (const dx of debris) {
    const px = ((dx - so * 0.2) % (W + 60) + W + 60) % (W + 60) - 30;
    ctx.fillRect(Math.round(px), H - 5, 6, 3);
  }
  ctx.globalAlpha = 1;
}

// Draw the shelter entrance / hatch on surface
function drawHatch(ctx, x, y) {
  fillRect(ctx, x - 12, y - 2, 24, 4, C.metal);
  fillRect(ctx, x - 10, y - 1, 20, 2, C.metalLight);
  // Handle
  fillRect(ctx, x - 2, y - 3, 4, 1, C.metalLight);
}

// Underground dirt/earth fill
function drawEarth(ctx, x, y, w, h) {
  fillRect(ctx, x, y, w, h, C.dirt);
  // Texture dots
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#ffffff';
  for (let ey = y; ey < y + h; ey += 6) {
    for (let ex = x; ex < x + w; ex += 10) {
      if ((ex + ey) % 20 < 10) ctx.fillRect(Math.round(ex), Math.round(ey), 2, 2);
    }
  }
  ctx.globalAlpha = 1;
}

// ── Exploration environment ───────────────────────────────────────────────────

function drawExploreBackground(ctx, scrollX, zone, worldH, time, bgTheme) {
  const W = CFG.W;
  const H = worldH;

  // Sky
  fillRect(ctx, 0, 0, W, H * 0.45, C.sky);
  if (time !== undefined) fillRect(ctx, 0, 0, W, H * 0.45, '#2a3850', dayFactor(time) * 0.35);
  // Ground
  fillRect(ctx, 0, H * 0.45, W, H * 0.55, C.ground);

  if (bgTheme === 'ruined_city') {
    // Ruined city skyline — collapsed skyscrapers with broken silhouettes
    const rpx = -(scrollX * 0.15) % (W * 2);
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#0d0d18';
    // Tall ruined towers with jagged tops
    const towers = [
      [0,  H*0.08, 44, H*0.37],
      [50, H*0.15, 30, H*0.30],
      [86, H*0.04, 52, H*0.41],
      [145,H*0.12, 36, H*0.33],
      [188,H*0.07, 28, H*0.38],
      [220,H*0.18, 48, H*0.27],
      [275,H*0.06, 38, H*0.39],
      [320,H*0.14, 55, H*0.31],
      [382,H*0.09, 30, H*0.36],
      [418,H*0.16, 44, H*0.28],
      [468,H*0.05, 40, H*0.40],
      [516,H*0.13, 50, H*0.32],
      [572,H*0.08, 32, H*0.37],
      [610,H*0.17, 46, H*0.29],
    ];
    for (const [tx, ty, tw, th] of towers) {
      for (let rep = -1; rep <= 1; rep++) {
        const bx = Math.round(tx + rpx % W + rep * W);
        ctx.fillRect(bx, ty, tw, th);
        // Jagged broken top
        ctx.fillStyle = '#0a0a14';
        ctx.beginPath();
        ctx.moveTo(bx, ty);
        ctx.lineTo(bx + tw * 0.3, ty - 8);
        ctx.lineTo(bx + tw * 0.5, ty - 3);
        ctx.lineTo(bx + tw * 0.7, ty - 12);
        ctx.lineTo(bx + tw, ty);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#0d0d18';
        // Broken windows
        for (let wy = ty + 8; wy < ty + th - 10; wy += 14) {
          for (let wx2 = bx + 4; wx2 < bx + tw - 8; wx2 += 10) {
            if ((wx2 + wy + (tx | 0)) % 3 !== 0)
              ctx.fillRect(wx2, wy, 5, 6);
          }
        }
      }
    }
    ctx.restore();
    // Heavy dark overhead haze for bunker-area atmosphere
    fillRect(ctx, 0, 0, W, H * 0.45, '#060610', 0.35);
  } else {
    // Default distant silhouettes (parallax 0.2)
    const px = -(scrollX * 0.2) % (W * 2);
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#12121a';
    const bdata = [0,55,80,45, 90,60,50,50, 155,70,60,55, 220,50,40,60, 265,65,55,45, 320,80,40,65];
    for (let i = 0; i < bdata.length; i += 4) {
      const bx = ((bdata[i] + W - px % W) % (W * 2));
      ctx.fillRect(Math.round(bx - W), bdata[i+3], bdata[i+2], bdata[i+1]);
      ctx.fillRect(Math.round(bx), bdata[i+3], bdata[i+2], bdata[i+1]);
    }
    ctx.globalAlpha = 1;
  }

  // Ground texture
  fillRect(ctx, 0, Math.round(H * 0.45), W, 3, C.dirt2);
}

function drawExploreBuilding(ctx, bx, by, bw, bh, label) {
  // Building exterior (relative to world coords, caller applies offset)
  fillRect(ctx, bx, by, bw, bh, C.wall);
  fillRect(ctx, bx, by, bw, 4, C.wallLight);  // roofline

  // Windows
  const winW = 16, winH = 12, winGap = 24;
  for (let wx = bx + 12; wx < bx + bw - winW; wx += winGap) {
    fillRect(ctx, wx, by + 8, winW, winH, '#0a0e14');
    // Occasional lit window
    if (chance(15)) fillRect(ctx, wx + 2, by + 10, winW - 4, winH - 4, '#181a10', 0.5);
    strokeRect(ctx, wx, by + 8, winW, winH, '#1c2028');
  }

  // Door
  const doorX = bx + Math.floor(bw / 2) - 8;
  fillRect(ctx, doorX, by + bh - 24, 16, 24, '#0a0808');
  strokeRect(ctx, doorX, by + bh - 24, 16, 24, C.border2);

  // Label
  if (label) {
    drawText(ctx, label, bx + bw / 2, by - 4, C.textDim, 8, 'center');
  }
}
