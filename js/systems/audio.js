// audio.js — Web Audio API procedural sound system
'use strict';

const Audio = (() => {
  let ctx = null;
  let enabled = true;
  let initialised = false;

  function init() {
    if (initialised) return;
    initialised = true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { ctx = null; }
  }

  // iOS / mobile: AudioContext starts suspended — must resume after user gesture
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

  return {
    init, resume,

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
    toggle:    () => { enabled = !enabled; return enabled; },
    isEnabled: () => enabled,
  };
})();
