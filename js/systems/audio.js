// audio.js — Web Audio API procedural sound system
'use strict';

const Audio = (() => {
  let ctx = null;
  let enabled = true;
  let initialised = false;

  // ── Volume levels (0–1) ──────────────────────────────────────────────────────
  let musicVol = 0.60;   // shelter & explore music master volume
  let sfxVol   = 0.80;   // all SFX (combat, loot, etc.)
  let clickVol = 0.225;  // UI click sound (0 = silent)

  function init() {
    if (initialised) return;
    initialised = true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { ctx = null; }
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  // ── Low-level oscillator helper ───────────────────────────────────────────────
  function beep(freq, dur, vol, type, delay) {
    if (!ctx || !enabled) return;
    const v = (vol || 0.07) * sfxVol;
    if (v < 0.0005) return;
    try {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type || 'square';
      osc.frequency.value = freq;
      const t = ctx.currentTime + (delay || 0);
      gain.gain.setValueAtTime(v, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.start(t);
      osc.stop(t + dur + 0.01);
    } catch (e) {}
  }

  // Filtered noise burst — the base for footsteps, rustles and thuds
  function shapedNoise(dur, vol, type, freq, q, delay) {
    if (!ctx || !enabled) return;
    const v = vol * sfxVol;
    if (v < 0.0005) return;
    try {
      const sr = ctx.sampleRate;
      const buf = ctx.createBuffer(1, Math.ceil(sr * dur), sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 0.8;
      const g = ctx.createGain();
      const t = ctx.currentTime + (delay || 0);
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(ctx.destination);
      src.start(t);
    } catch (e) {}
  }

  // ── Rain: a looping hiss, muffled underground / indoors ────────────────────
  let rain = null;   // { src, filter, gain, muffled }
  function setRain(on, muffled) {
    if (!ctx) return;
    const want = on && enabled && sfxVol > 0.001;
    try {
      if (!want) {
        if (rain) {
          const r = rain; rain = null;
          r.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
          setTimeout(() => { try { r.src.stop(); } catch (e) {} }, 1500);
        }
        return;
      }
      const vol = (muffled ? 0.035 : 0.06) * sfxVol;
      const freq = muffled ? 380 : 1400;
      if (!rain) {
        const sr = ctx.sampleRate, len = sr * 2;
        const buf = ctx.createBuffer(1, len, sr);
        const d = buf.getChannelData(0);
        let last = 0;
        for (let i = 0; i < len; i++) { last = last * 0.6 + (Math.random() * 2 - 1) * 0.4; d[i] = last + (Math.random() < 0.0015 ? (Math.random() - 0.5) * 2 : 0); }
        const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
        const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = freq;
        const gain = ctx.createGain(); gain.gain.value = 0.0001;
        src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
        src.start();
        rain = { src, filter, gain, muffled: null };
      }
      if (rain.muffled !== muffled) {
        rain.muffled = muffled;
        rain.filter.frequency.setTargetAtTime(freq, ctx.currentTime, 0.3);
      }
      rain.gain.gain.setTargetAtTime(vol, ctx.currentTime, 0.6);
    } catch (e) {}
  }

  function noise(dur, vol, delay) {
    if (!ctx || !enabled) return;
    const v = (vol || 0.12) * sfxVol;
    if (v < 0.0005) return;
    try {
      const sampleRate = ctx.sampleRate;
      const buf  = ctx.createBuffer(1, Math.ceil(sampleRate * dur), sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
      const src  = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      const t = ctx.currentTime + (delay || 0);
      gain.gain.setValueAtTime(v, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start(t);
    } catch (e) {}
  }

  // ── Music: the procedural score lives in music.js ─────────────────────────
  // Hearth (shelter), Ashes (exploring, darker at night), Static (combat).
  // Switching cross-fades; stopping fades out.
  const music = createMusicEngine(() => ctx, () => musicVol, () => enabled);

  function startMusic()        { if (ctx && enabled) music.play('ashes'); }
  function stopMusic()         { music.stop('ashes'); }
  function startShelterMusic() { if (ctx && enabled) music.play('hearth'); }
  function stopShelterMusic()  { music.stop('hearth'); }
  function startCombatMusic()  { if (ctx && enabled) music.play('static', 0.7); }
  function stopCombatMusic()   { music.stop('static', 1.4); }

  // ── Creepy ambient FX ──────────────────────────────────────────────────────────

  function creepyAmbient() {
    if (!ctx || !enabled) return;
    const roll = Math.random();
    try {
      if (roll < 0.3) {
        const sr = ctx.sampleRate;
        const dur = 2.5 + Math.random() * 1.5;
        const buf = ctx.createBuffer(1, Math.ceil(sr * dur), sr);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
        const src = ctx.createBufferSource(); src.buffer = buf;
        const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 120;
        const g = ctx.createGain();
        const t = ctx.currentTime + 0.05;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.06 * sfxVol, t + 0.5);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.connect(filt); filt.connect(g); g.connect(ctx.destination); src.start(t);

      } else if (roll < 0.55) {
        const sr = ctx.sampleRate;
        const dur = 3.0 + Math.random() * 2.0;
        const buf = ctx.createBuffer(1, Math.ceil(sr * dur), sr);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
        const src = ctx.createBufferSource(); src.buffer = buf;
        const filt = ctx.createBiquadFilter(); filt.type = 'bandpass';
        const t = ctx.currentTime + 0.05;
        filt.frequency.setValueAtTime(400 + Math.random() * 300, t);
        filt.frequency.linearRampToValueAtTime(600 + Math.random() * 400, t + dur * 0.5);
        filt.frequency.linearRampToValueAtTime(300 + Math.random() * 200, t + dur);
        filt.Q.value = 0.8;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.04 * sfxVol, t + 0.8);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.connect(filt); filt.connect(g); g.connect(ctx.destination); src.start(t);

      } else if (roll < 0.75) {
        const t = ctx.currentTime + 0.05;
        const o = ctx.createOscillator(); o.type = 'sine';
        const startF = 180 + Math.random() * 120;
        o.frequency.setValueAtTime(startF, t);
        o.frequency.linearRampToValueAtTime(startF * 0.6, t + 0.4);
        o.frequency.linearRampToValueAtTime(startF * 0.4, t + 0.9);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.05 * sfxVol, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
        o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 1.1);

      } else {
        const t = ctx.currentTime + 0.05;
        for (let i = 0; i < 3; i++) {
          const ot = t + i * (0.55 + Math.random() * 0.3);
          const sr = ctx.sampleRate;
          const buf = ctx.createBuffer(1, Math.ceil(sr * 0.12), sr);
          const data = buf.getChannelData(0);
          for (let j = 0; j < data.length; j++) data[j] = (Math.random() * 2 - 1);
          const src = ctx.createBufferSource(); src.buffer = buf;
          const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 200;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.04 * sfxVol, ot);
          g.gain.exponentialRampToValueAtTime(0.0001, ot + 0.12);
          src.connect(filt); filt.connect(g); g.connect(ctx.destination); src.start(ot);
        }
      }
    } catch(e) {}
  }

  // ── Volume control helpers ─────────────────────────────────────────────────────

  function setMusicVol(v) {
    musicVol = Math.max(0, Math.min(1, v));
    music.setVolume();
  }
  function getMusicVol()  { return musicVol; }
  function setSfxVol(v)   { sfxVol   = Math.max(0, Math.min(1, v)); }
  function getSfxVol()    { return sfxVol; }
  function setClickVol(v) { clickVol = Math.max(0, Math.min(1, v)); }
  function getClickVol()  { return clickVol; }

  return {
    init, resume,
    // Explore music
    startMusic, stopMusic,
    // Shelter music
    startShelterMusic, stopShelterMusic,
    // Combat music
    startCombatMusic, stopCombatMusic,
    // Ambient
    creepyAmbient,
    musicPlaying: () => music.playing(),

    // UI click — separate volume track, bypasses sfxVol
    click: () => {
      if (!ctx || !enabled || clickVol < 0.001) return;
      try {
        const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 480;
        const g = ctx.createGain();
        const t = ctx.currentTime;
        g.gain.setValueAtTime(0.05 * clickVol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
        o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.05);
      } catch(e) {}
    },

    confirm: () => { beep(520, 0.07, 0.07); beep(680, 0.10, 0.06, 'square', 0.07); },
    cancel:  () => beep(200, 0.10, 0.05, 'sawtooth'),

    // Combat
    hit:     () => noise(0.06, 0.14),
    miss:    () => beep(160, 0.08, 0.04, 'sawtooth'),
    death:   () => {
      beep(160, 0.3, 0.10, 'sawtooth');
      beep(100, 0.5, 0.07, 'sawtooth', 0.25);
    },

    // Movement & world
    step:    (soft) => shapedNoise(0.05, soft ? 0.025 : 0.05, 'lowpass', 420 + Math.random() * 160, 1),
    door:    () => { shapedNoise(0.18, 0.09, 'lowpass', 160, 1); beep(90 + Math.random() * 20, 0.25, 0.03, 'triangle', 0.05); },
    rustle:  () => { for (let i = 0; i < 3; i++) shapedNoise(0.09, 0.035, 'bandpass', 1800 + Math.random() * 900, 1.5, i * 0.11); },
    thud:    () => { shapedNoise(0.22, 0.12, 'lowpass', 110, 1); beep(55, 0.2, 0.05, 'sine'); },
    breakWeapon: () => { shapedNoise(0.12, 0.12, 'highpass', 2500, 1); beep(220, 0.15, 0.05, 'square', 0.03); },
    wind:    () => shapedNoise(1.6, 0.05, 'bandpass', 500, 0.6),

    // Events & rewards
    loot:    () => beep(660, 0.09, 0.06, 'sine'),
    levelUp: () => {
      [440, 554, 660, 880].forEach((f, i) => beep(f, 0.14, 0.08, 'sine', i * 0.08));
    },
    alert:   () => {
      beep(880, 0.08, 0.09);
      beep(880, 0.08, 0.09, 'square', 0.14);
    },
    dialogue: () => beep(360, 0.08, 0.04, 'sine'),

    // Toggle mute
    toggle:    () => { enabled = !enabled; if (!enabled) { music.stop(); setRain(false); } return enabled; },
    setRain,
    isEnabled: () => enabled,

    // Volume accessors
    setMusicVol, getMusicVol,
    setSfxVol,   getSfxVol,
    setClickVol, getClickVol,
  };
})();
