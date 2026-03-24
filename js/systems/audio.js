// audio.js — Web Audio API procedural sound system
'use strict';

const Audio = (() => {
  let ctx = null;
  let enabled = true;
  let initialised = false;
  let musicNodes = [];
  let musicScheduled = [];
  let musicActive = false;
  let musicStopTime = 0;

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

  function beep(freq, dur, vol, type, delay) {
    if (!ctx || !enabled) return;
    try {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type || 'square';
      osc.frequency.value = freq;
      const t = ctx.currentTime + (delay || 0);
      gain.gain.setValueAtTime(vol || 0.07, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.start(t);
      osc.stop(t + dur + 0.01);
    } catch (e) {}
  }

  function noise(dur, vol, delay) {
    if (!ctx || !enabled) return;
    try {
      const sampleRate = ctx.sampleRate;
      const buf  = ctx.createBuffer(1, Math.ceil(sampleRate * dur), sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (vol || 0.12);
      const src  = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      const t = ctx.currentTime + (delay || 0);
      gain.gain.setValueAtTime(vol || 0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start(t);
    } catch (e) {}
  }

  // ── Music ──────────────────────────────────────────────────────────────────
  // Ominous drone + sparse minor chord hits for exploration

  function _addNode(node) { musicNodes.push(node); return node; }

  function startMusic() {
    if (!ctx || !enabled) return;
    stopMusic();
    musicActive = true;

    try {
      const t = ctx.currentTime + 0.1;

      // Master gain (fade in slowly)
      const master = _addNode(ctx.createGain());
      master.gain.setValueAtTime(0, t);
      master.gain.linearRampToValueAtTime(0.6, t + 4);
      master.connect(ctx.destination);

      // ── Base drone (two detuned sawtooth oscillators beating against each other)
      const osc1 = _addNode(ctx.createOscillator());
      osc1.type = 'sawtooth';
      osc1.frequency.value = 41.2;
      const g1 = _addNode(ctx.createGain()); g1.gain.value = 0.06;
      osc1.connect(g1); g1.connect(master);
      osc1.start(t);

      const osc2 = _addNode(ctx.createOscillator());
      osc2.type = 'sawtooth';
      osc2.frequency.value = 41.8; // slight detune for beating
      const g2 = _addNode(ctx.createGain()); g2.gain.value = 0.05;
      osc2.connect(g2); g2.connect(master);
      osc2.start(t);

      // ── Mid-range ominous sine drone
      const osc3 = _addNode(ctx.createOscillator());
      osc3.type = 'sine';
      osc3.frequency.value = 55;
      const g3 = _addNode(ctx.createGain()); g3.gain.value = 0.07;
      osc3.connect(g3); g3.connect(master);
      osc3.start(t);

      // ── Very slow LFO on pitch of osc3 (creates eerie movement)
      const lfo = _addNode(ctx.createOscillator());
      lfo.type = 'sine';
      lfo.frequency.value = 0.06;
      const lfoGain = _addNode(ctx.createGain()); lfoGain.gain.value = 2.5;
      lfo.connect(lfoGain); lfoGain.connect(osc3.frequency);
      lfo.start(t);

      // ── High harmonic drone (filtered)
      const osc4 = _addNode(ctx.createOscillator());
      osc4.type = 'sine';
      osc4.frequency.value = 110.5;
      const g4 = _addNode(ctx.createGain()); g4.gain.value = 0.025;
      // Slow tremolo on high drone
      const trem = _addNode(ctx.createOscillator());
      trem.type = 'sine';
      trem.frequency.value = 0.14;
      const tremGain = _addNode(ctx.createGain()); tremGain.gain.value = 0.018;
      trem.connect(tremGain); tremGain.connect(g4.gain);
      osc4.connect(g4); g4.connect(master);
      osc4.start(t); trem.start(t);

      // ── Schedule sparse ominous chord hits (minor 2nd / tritone intervals)
      const MINOR_FREQS = [55, 58.27, 65.41, 73.42, 82.41, 87.31, 98.0];
      function scheduleChordHit(when) {
        if (!musicActive) return;
        const freq = MINOR_FREQS[Math.floor(Math.random() * MINOR_FREQS.length)];
        const interval = 8 + Math.random() * 14; // 8-22 seconds between hits
        try {
          const ho = ctx.createOscillator();
          ho.type = 'sine';
          ho.frequency.value = freq;
          const hg = ctx.createGain();
          hg.gain.setValueAtTime(0, when);
          hg.gain.linearRampToValueAtTime(0.09, when + 0.8);
          hg.gain.exponentialRampToValueAtTime(0.001, when + 5.0);
          ho.connect(hg); hg.connect(master);
          ho.start(when);
          ho.stop(when + 5.5);
        } catch(e) {}
        musicScheduled.push(setTimeout(() => scheduleChordHit(ctx.currentTime + 0.05), interval * 1000));
      }
      scheduleChordHit(t + 5);

    } catch(e) {}
  }

  function stopMusic() {
    musicActive = false;
    for (const id of musicScheduled) clearTimeout(id);
    musicScheduled = [];
    for (const node of musicNodes) {
      try { node.stop && node.stop(0); } catch(e) {}
      try { node.disconnect(); } catch(e) {}
    }
    musicNodes = [];
  }

  // ── Creepy ambient FX ──────────────────────────────────────────────────────

  function creepyAmbient() {
    if (!ctx || !enabled) return;
    const roll = Math.random();
    try {
      if (roll < 0.3) {
        // Low rumble / distant thunder (filtered noise burst)
        const sr = ctx.sampleRate;
        const dur = 2.5 + Math.random() * 1.5;
        const buf = ctx.createBuffer(1, Math.ceil(sr * dur), sr);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const filt = ctx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.value = 120;
        const g = ctx.createGain();
        const t = ctx.currentTime + 0.05;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.06, t + 0.5);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        src.connect(filt); filt.connect(g); g.connect(ctx.destination);
        src.start(t);

      } else if (roll < 0.55) {
        // Wind howl (swept filtered noise)
        const sr = ctx.sampleRate;
        const dur = 3.0 + Math.random() * 2.0;
        const buf = ctx.createBuffer(1, Math.ceil(sr * dur), sr);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const filt = ctx.createBiquadFilter();
        filt.type = 'bandpass';
        const t = ctx.currentTime + 0.05;
        filt.frequency.setValueAtTime(400 + Math.random() * 300, t);
        filt.frequency.linearRampToValueAtTime(600 + Math.random() * 400, t + dur * 0.5);
        filt.frequency.linearRampToValueAtTime(300 + Math.random() * 200, t + dur);
        filt.Q.value = 0.8;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.04, t + 0.8);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        src.connect(filt); filt.connect(g); g.connect(ctx.destination);
        src.start(t);

      } else if (roll < 0.75) {
        // Distant creak (short pitch-swept sine)
        const t = ctx.currentTime + 0.05;
        const o = ctx.createOscillator();
        o.type = 'sine';
        const startF = 180 + Math.random() * 120;
        o.frequency.setValueAtTime(startF, t);
        o.frequency.linearRampToValueAtTime(startF * 0.6, t + 0.4);
        o.frequency.linearRampToValueAtTime(startF * 0.4, t + 0.9);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.05, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
        o.connect(g); g.connect(ctx.destination);
        o.start(t); o.stop(t + 1.1);

      } else {
        // Distant footstep-like thumps
        const t = ctx.currentTime + 0.05;
        for (let i = 0; i < 3; i++) {
          const ot = t + i * (0.55 + Math.random() * 0.3);
          const sr = ctx.sampleRate;
          const buf = ctx.createBuffer(1, Math.ceil(sr * 0.12), sr);
          const data = buf.getChannelData(0);
          for (let j = 0; j < data.length; j++) data[j] = (Math.random() * 2 - 1);
          const src = ctx.createBufferSource();
          src.buffer = buf;
          const filt = ctx.createBiquadFilter();
          filt.type = 'lowpass';
          filt.frequency.value = 200;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.04, ot);
          g.gain.exponentialRampToValueAtTime(0.001, ot + 0.12);
          src.connect(filt); filt.connect(g); g.connect(ctx.destination);
          src.start(ot);
        }
      }
    } catch(e) {}
  }

  return {
    init, resume,
    startMusic, stopMusic,
    creepyAmbient,

    // UI
    click:   () => beep(480, 0.04, 0.05, 'square'),
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
    toggle:    () => { enabled = !enabled; if (!enabled) stopMusic(); return enabled; },
    isEnabled: () => enabled,
  };
})();
