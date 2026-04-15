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

  // ── Explore music nodes ───────────────────────────────────────────────────────
  let explMusicNodes      = [];
  let explMusicScheduled  = [];
  let explMusicActive     = false;
  let explMasterGain      = null;

  // ── Shelter music nodes ───────────────────────────────────────────────────────
  let shltMusicNodes     = [];
  let shltMusicScheduled = [];
  let shltMusicActive    = false;
  let shltMasterGain     = null;

  // ── Combat music nodes ────────────────────────────────────────────────────────
  let combatMusicNodes     = [];
  let combatMusicScheduled = [];
  let combatMusicActive    = false;
  let combatMasterGain     = null;

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

  // ── Explore music (ominous drone + sparse chord hits) ─────────────────────────

  function _addExplNode(node) { explMusicNodes.push(node); return node; }

  function startMusic() {
    if (!ctx || !enabled) return;
    stopShelterMusic();
    stopMusic();
    explMusicActive = true;

    try {
      const t = ctx.currentTime + 0.1;

      explMasterGain = _addExplNode(ctx.createGain());
      explMasterGain.gain.setValueAtTime(0, t);
      explMasterGain.gain.linearRampToValueAtTime(0.3 * musicVol, t + 4);
      explMasterGain.connect(ctx.destination);

      const osc1 = _addExplNode(ctx.createOscillator());
      osc1.type = 'sawtooth'; osc1.frequency.value = 41.2;
      const g1 = _addExplNode(ctx.createGain()); g1.gain.value = 0.06;
      osc1.connect(g1); g1.connect(explMasterGain); osc1.start(t);

      const osc2 = _addExplNode(ctx.createOscillator());
      osc2.type = 'sawtooth'; osc2.frequency.value = 41.8;
      const g2 = _addExplNode(ctx.createGain()); g2.gain.value = 0.05;
      osc2.connect(g2); g2.connect(explMasterGain); osc2.start(t);

      const osc3 = _addExplNode(ctx.createOscillator());
      osc3.type = 'sine'; osc3.frequency.value = 55;
      const g3 = _addExplNode(ctx.createGain()); g3.gain.value = 0.07;
      osc3.connect(g3); g3.connect(explMasterGain); osc3.start(t);

      const lfo = _addExplNode(ctx.createOscillator());
      lfo.type = 'sine'; lfo.frequency.value = 0.06;
      const lfoGain = _addExplNode(ctx.createGain()); lfoGain.gain.value = 2.5;
      lfo.connect(lfoGain); lfoGain.connect(osc3.frequency); lfo.start(t);

      const osc4 = _addExplNode(ctx.createOscillator());
      osc4.type = 'sine'; osc4.frequency.value = 110.5;
      const g4 = _addExplNode(ctx.createGain()); g4.gain.value = 0.025;
      const trem = _addExplNode(ctx.createOscillator());
      trem.type = 'sine'; trem.frequency.value = 0.14;
      const tremGain = _addExplNode(ctx.createGain()); tremGain.gain.value = 0.018;
      trem.connect(tremGain); tremGain.connect(g4.gain);
      osc4.connect(g4); g4.connect(explMasterGain); osc4.start(t); trem.start(t);

      const MINOR_FREQS = [55, 58.27, 65.41, 73.42, 82.41, 87.31, 98.0];
      function scheduleChordHit(when) {
        if (!explMusicActive) return;
        const freq     = MINOR_FREQS[Math.floor(Math.random() * MINOR_FREQS.length)];
        const interval = 8 + Math.random() * 14;
        try {
          const ho = ctx.createOscillator(); ho.type = 'sine'; ho.frequency.value = freq;
          const hg = ctx.createGain();
          hg.gain.setValueAtTime(0, when);
          hg.gain.linearRampToValueAtTime(0.09, when + 0.8);
          hg.gain.exponentialRampToValueAtTime(0.0001, when + 5.0);
          ho.connect(hg); hg.connect(explMasterGain);
          ho.start(when); ho.stop(when + 5.5);
        } catch(e) {}
        explMusicScheduled.push(setTimeout(() => scheduleChordHit(ctx.currentTime + 0.05), interval * 1000));
      }
      scheduleChordHit(t + 5);

    } catch(e) {}
  }

  function stopMusic() {
    explMusicActive = false;
    explMasterGain  = null;
    for (const id of explMusicScheduled) clearTimeout(id);
    explMusicScheduled = [];
    for (const node of explMusicNodes) {
      try { node.stop && node.stop(0); } catch(e) {}
      try { node.disconnect(); } catch(e) {}
    }
    explMusicNodes = [];
  }

  // ── Shelter music (soft, sad, melancholic piano-like tones) ──────────────────

  function _addShltNode(node) { shltMusicNodes.push(node); return node; }

  function startShelterMusic() {
    if (!ctx || !enabled) return;
    stopMusic();
    stopShelterMusic();
    shltMusicActive = true;

    try {
      const t = ctx.currentTime + 0.5;

      // Soft master (fades in slowly)
      shltMasterGain = _addShltNode(ctx.createGain());
      shltMasterGain.gain.setValueAtTime(0, t);
      shltMasterGain.gain.linearRampToValueAtTime(0.45 * musicVol, t + 5);
      shltMasterGain.connect(ctx.destination);

      // Low A2 drone — barely audible background hum
      const drone = _addShltNode(ctx.createOscillator());
      drone.type = 'sine'; drone.frequency.value = 55;
      const dg = _addShltNode(ctx.createGain()); dg.gain.value = 0.04;
      drone.connect(dg); dg.connect(shltMasterGain); drone.start(t);

      // Very slow vibrato on drone
      const lfo = _addShltNode(ctx.createOscillator());
      lfo.type = 'sine'; lfo.frequency.value = 0.05;
      const lg = _addShltNode(ctx.createGain()); lg.gain.value = 0.8;
      lfo.connect(lg); lg.connect(drone.frequency); lfo.start(t);

      // Soft triangle-wave shimmer (high, very quiet)
      const shimmer = _addShltNode(ctx.createOscillator());
      shimmer.type = 'triangle'; shimmer.frequency.value = 440;
      const sg = _addShltNode(ctx.createGain()); sg.gain.value = 0.008;
      const sLfo = _addShltNode(ctx.createOscillator());
      sLfo.type = 'sine'; sLfo.frequency.value = 0.12;
      const sLg = _addShltNode(ctx.createGain()); sLg.gain.value = 0.005;
      sLfo.connect(sLg); sLg.connect(sg.gain);
      shimmer.connect(sg); sg.connect(shltMasterGain);
      shimmer.start(t); sLfo.start(t);

      // ── Sparse piano-like melody (A minor, descending/ascending phrases) ────
      // Each note: [hz, startOffset_s, attackDur_s, decayDur_s, peak]
      // Piano envelope: fast attack, slow exponential decay
      const MELODY = [
        // Phrase 1 — lonely falling (bars 1-2)
        [330.0,  0.5,  0.04, 2.2,  0.14],  // E4
        [293.7,  3.2,  0.04, 2.0,  0.12],  // D4
        [261.6,  5.6,  0.04, 2.4,  0.13],  // C4
        [220.0,  8.5,  0.05, 3.8,  0.10],  // A3 — long lonely hold
        // Silence ~3.5s
        // Phrase 2 — tentative rise then fall (bars 3-4)
        [220.0, 15.5,  0.04, 1.2,  0.09],  // A3
        [261.6, 17.1,  0.04, 1.2,  0.11],  // C4
        [329.6, 18.7,  0.04, 1.0,  0.12],  // E4
        [392.0, 20.1,  0.04, 1.4,  0.10],  // G4
        [329.6, 22.0,  0.04, 3.0,  0.11],  // E4 — falls back
        // Silence ~3s
        // Phrase 3 — quiet resolution (bars 5-6)
        [293.7, 27.5,  0.04, 1.5,  0.10],  // D4
        [261.6, 29.5,  0.04, 1.4,  0.09],  // C4
        [220.0, 31.5,  0.05, 5.0,  0.08],  // A3 — final long fade
      ];
      const LOOP_S = 38.0;  // loop length in seconds

      function scheduleMelody(base) {
        if (!shltMusicActive) return;
        for (const [hz, off, atk, dec, pk] of MELODY) {
          const nt = base + off;
          try {
            const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = hz;
            // Add a quiet second harmonic for warmth
            const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = hz * 2;
            const gn = ctx.createGain();
            gn.gain.setValueAtTime(0, nt);
            gn.gain.linearRampToValueAtTime(pk, nt + atk);
            gn.gain.exponentialRampToValueAtTime(0.0002, nt + atk + dec);
            const g2n = ctx.createGain(); g2n.gain.value = 0.18; // overtone quieter
            o.connect(gn); o2.connect(g2n); g2n.connect(gn);
            gn.connect(shltMasterGain);
            o.start(nt); o.stop(nt + atk + dec + 0.1);
            o2.start(nt); o2.stop(nt + atk + dec + 0.1);
            shltMusicNodes.push(o, gn, o2, g2n);
          } catch(e) {}
        }
        // Schedule next loop slightly before end to avoid gap
        shltMusicScheduled.push(
          setTimeout(() => scheduleMelody(ctx.currentTime + 0.05), (LOOP_S - 1.5) * 1000)
        );
      }

      scheduleMelody(t + 1);

    } catch(e) {}
  }

  function stopShelterMusic() {
    shltMusicActive = false;
    shltMasterGain  = null;
    for (const id of shltMusicScheduled) clearTimeout(id);
    shltMusicScheduled = [];
    for (const node of shltMusicNodes) {
      try { node.stop && node.stop(0); } catch(e) {}
      try { node.disconnect(); } catch(e) {}
    }
    shltMusicNodes = [];
  }

  // ── Combat music (ominous low beat + drone) ───────────────────────────────────

  function _addCombatNode(node) { combatMusicNodes.push(node); return node; }

  function startCombatMusic() {
    if (!ctx || !enabled) return;
    stopMusic();
    stopShelterMusic();
    stopCombatMusic();
    combatMusicActive = true;

    try {
      const t = ctx.currentTime + 0.05;

      combatMasterGain = _addCombatNode(ctx.createGain());
      combatMasterGain.gain.setValueAtTime(0, t);
      combatMasterGain.gain.linearRampToValueAtTime(0.55 * musicVol, t + 1.5);
      combatMasterGain.connect(ctx.destination);

      // Deep sub-bass drone: two detuned sawtooths
      const d1 = _addCombatNode(ctx.createOscillator());
      d1.type = 'sawtooth'; d1.frequency.value = 41.0;
      const dg1 = _addCombatNode(ctx.createGain()); dg1.gain.value = 0.045;
      d1.connect(dg1); dg1.connect(combatMasterGain); d1.start(t);

      const d2 = _addCombatNode(ctx.createOscillator());
      d2.type = 'sawtooth'; d2.frequency.value = 41.5;
      const dg2 = _addCombatNode(ctx.createGain()); dg2.gain.value = 0.035;
      d2.connect(dg2); dg2.connect(combatMasterGain); d2.start(t);

      // Tension layer: 82 Hz + slow tremolo
      const ten = _addCombatNode(ctx.createOscillator());
      ten.type = 'sine'; ten.frequency.value = 82;
      const tg = _addCombatNode(ctx.createGain()); tg.gain.value = 0.06;
      const tLfo = _addCombatNode(ctx.createOscillator());
      tLfo.type = 'sine'; tLfo.frequency.value = 0.22;
      const tLg = _addCombatNode(ctx.createGain()); tLg.gain.value = 0.045;
      tLfo.connect(tLg); tLg.connect(tg.gain);
      ten.connect(tg); tg.connect(combatMasterGain);
      ten.start(t); tLfo.start(t);

      // Rhythmic kick at ~70 BPM (857 ms)
      const beatMs = (60 / 70) * 1000;
      function scheduleKick(when) {
        if (!combatMusicActive) return;
        try {
          const ko = ctx.createOscillator(); ko.type = 'sine';
          ko.frequency.setValueAtTime(85, when);
          ko.frequency.exponentialRampToValueAtTime(28, when + 0.18);
          const kg = ctx.createGain();
          kg.gain.setValueAtTime(0, when);
          kg.gain.linearRampToValueAtTime(0.22, when + 0.008);
          kg.gain.exponentialRampToValueAtTime(0.0001, when + 0.28);
          ko.connect(kg); kg.connect(combatMasterGain);
          ko.start(when); ko.stop(when + 0.32);
        } catch(e) {}
        combatMusicScheduled.push(setTimeout(() => scheduleKick(ctx.currentTime + 0.02), beatMs));
      }
      scheduleKick(t + 0.3);

      // Sparse metallic accent: bandpass noise, every 5-10 s
      function scheduleAccent(when) {
        if (!combatMusicActive) return;
        const interval = 5000 + Math.random() * 5000;
        try {
          const sr  = ctx.sampleRate;
          const dur = 0.10 + Math.random() * 0.08;
          const buf = ctx.createBuffer(1, Math.ceil(sr * dur), sr);
          const data = buf.getChannelData(0);
          for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
          const src = ctx.createBufferSource(); src.buffer = buf;
          const flt = ctx.createBiquadFilter();
          flt.type = 'bandpass';
          flt.frequency.value = 800 + Math.random() * 500;
          flt.Q.value = 5;
          const ag = ctx.createGain();
          ag.gain.setValueAtTime(0.11, when);
          ag.gain.exponentialRampToValueAtTime(0.0001, when + dur);
          src.connect(flt); flt.connect(ag); ag.connect(combatMasterGain);
          src.start(when);
        } catch(e) {}
        combatMusicScheduled.push(setTimeout(() => scheduleAccent(ctx.currentTime + 0.02), interval));
      }
      scheduleAccent(t + 2 + Math.random() * 3);

    } catch(e) {}
  }

  function stopCombatMusic() {
    combatMusicActive = false;
    combatMasterGain  = null;
    for (const id of combatMusicScheduled) clearTimeout(id);
    combatMusicScheduled = [];
    for (const node of combatMusicNodes) {
      try { node.stop && node.stop(0); } catch(e) {}
      try { node.disconnect(); } catch(e) {}
    }
    combatMusicNodes = [];
  }

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
    // Apply live to any running master gains
    if (explMasterGain) {
      try { explMasterGain.gain.setTargetAtTime(0.3 * musicVol, ctx.currentTime, 0.1); } catch(e) {}
    }
    if (shltMasterGain) {
      try { shltMasterGain.gain.setTargetAtTime(0.45 * musicVol, ctx.currentTime, 0.1); } catch(e) {}
    }
    if (combatMasterGain) {
      try { combatMasterGain.gain.setTargetAtTime(0.55 * musicVol, ctx.currentTime, 0.1); } catch(e) {}
    }
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
    toggle:    () => { enabled = !enabled; if (!enabled) { stopMusic(); stopShelterMusic(); } return enabled; },
    isEnabled: () => enabled,

    // Volume accessors
    setMusicVol, getMusicVol,
    setSfxVol,   getSfxVol,
    setClickVol, getClickVol,
  };
})();
