// music.js — Procedural score for The Last Light (Web Audio, no files).
//
// A small engine: a reverb'd music bus, a handful of instruments (felt piano,
// plucked guitar, pad, bass, music box, glass, drums, wind) and a step
// sequencer that runs each "song" a few hundred ms ahead of the audio clock.
// Songs pick chords, sections and melodies as they go, so they never loop
// exactly. Tracks cross-fade when the game switches between them.
//
//   Hearth  — the shelter: slow, warm, melancholic piano
//   Ashes   — exploring: sparse picked guitar over a drone; darker at night
//   Static  — combat: driving bass and drums, tense stabs
'use strict';

function createMusicEngine(getCtx, getVol, isEnabled) {
  let bus = null, noiseBuf = null;
  const pluckCache = {};
  let current = null;              // the playing track
  const fading = new Set();

  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];

  // ── Bus: dry + convolution reverb into a gentle compressor ───────────────
  function getBus() {
    const ctx = getCtx();
    if (bus && bus.ctx === ctx) return bus;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.008; comp.release.value = 0.3;
    comp.connect(ctx.destination);
    const dry = ctx.createGain(); dry.connect(comp);
    const rev = ctx.createConvolver(); rev.buffer = impulse(ctx, 3.4, 2.4);
    const wet = ctx.createGain(); wet.gain.value = 0.5; rev.connect(wet); wet.connect(comp);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    bus = { ctx, dry, rev, comp };
    return bus;
  }
  function impulse(ctx, sec, decay) {
    const len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = b.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  // ── Instruments: (dest, time, ...) — each makes and frees its own nodes ──
  function env(g, t, a, peak, dur, rel) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setTargetAtTime(0.0001, t + a, (dur || 1) / 4);
    if (rel) g.gain.setTargetAtTime(0.0001, t + rel, 0.08);
  }

  /** Felt piano: three partials, a soft hammer, a filter that closes as it rings. */
  function piano(dest, t, midi, vel, len) {
    const ctx = getCtx(), f = mtof(midi), dur = len || 3;
    const g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(Math.min(6000, f * 7), t); lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 1.6), t + dur);
    lp.connect(g); g.connect(dest);
    env(g, t, 0.006, 0.16 * vel, dur);
    for (const [mult, amp, type, det] of [[1, 1, 'sine', 0], [2, 0.32, 'sine', 3], [3, 0.09, 'triangle', -4], [4.01, 0.04, 'sine', 0]]) {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = type; o.frequency.value = f * mult; o.detune.value = det; og.gain.value = amp;
      o.connect(og); og.connect(lp); o.start(t); o.stop(t + dur + 0.2);
    }
    const n = ctx.createBufferSource(), ng = ctx.createGain(), nf = ctx.createBiquadFilter();
    n.buffer = noiseBuf; nf.type = 'bandpass'; nf.frequency.value = f * 4; nf.Q.value = 2;
    ng.gain.setValueAtTime(0.03 * vel, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    n.connect(nf); nf.connect(ng); ng.connect(dest); n.start(t, Math.random()); n.stop(t + 0.05);
  }

  /** Plucked string (Karplus–Strong, precomputed per pitch). */
  function pluckBuffer(midi) {
    const ctx = getCtx(), key = midi + '@' + ctx.sampleRate;
    if (pluckCache[key]) return pluckCache[key];
    const sr = ctx.sampleRate, f = mtof(midi), N = Math.max(2, Math.round(sr / f));
    const len = Math.floor(sr * 2.6), buf = ctx.createBuffer(1, len, sr), out = buf.getChannelData(0);
    const ring = new Float32Array(N);
    for (let i = 0; i < N; i++) ring[i] = (Math.random() * 2 - 1) * (0.6 + 0.4 * Math.sin(i / N * Math.PI));
    const decay = 0.996 - Math.max(0, (midi - 60)) * 0.0004;
    let idx = 0, prev = 0;
    for (let i = 0; i < len; i++) {
      const cur = ring[idx];
      const nxt = (cur + prev) * 0.5 * decay;
      out[i] = cur; ring[idx] = nxt; prev = cur;
      idx = (idx + 1) % N;
    }
    return (pluckCache[key] = buf);
  }
  function pluck(dest, t, midi, vel, bright) {
    const ctx = getCtx();
    const s = ctx.createBufferSource(); s.buffer = pluckBuffer(midi);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = bright || 2600;
    const g = ctx.createGain(); g.gain.value = 0.5 * vel;
    s.connect(lp); lp.connect(g); g.connect(dest); s.start(t); s.stop(t + 2.6);
  }

  /** Pad: detuned saws through a slowly breathing low-pass. */
  function pad(dest, t, notes, dur, vel, cutoff) {
    const ctx = getCtx();
    const g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 0.7;
    const c0 = cutoff || 900;
    lp.frequency.setValueAtTime(c0 * 0.6, t); lp.frequency.linearRampToValueAtTime(c0, t + dur * 0.5); lp.frequency.linearRampToValueAtTime(c0 * 0.7, t + dur);
    lp.connect(g); g.connect(dest);
    const a = Math.min(2.2, dur * 0.35);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05 * vel, t + a);
    g.gain.setValueAtTime(0.05 * vel, t + dur - 0.2); g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.6);
    for (const m of notes) for (const det of [-7, 6]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det;
      o.connect(lp); o.start(t); o.stop(t + dur + 1.8);
    }
  }

  function bass(dest, t, midi, vel, len, grit) {
    const ctx = getCtx(), f = mtof(midi), dur = len || 0.6;
    const g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(grit ? 900 : 420, t); lp.frequency.exponentialRampToValueAtTime(grit ? 220 : 160, t + dur);
    lp.connect(g); g.connect(dest);
    env(g, t, 0.01, 0.26 * vel, dur, dur);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = grit ? 'sawtooth' : 'triangle'; o2.frequency.value = f; o2.detune.value = 4;
    const g2 = ctx.createGain(); g2.gain.value = grit ? 0.45 : 0.3;
    o.connect(lp); o2.connect(g2); g2.connect(lp);
    o.start(t); o2.start(t); o.stop(t + dur + 0.3); o2.stop(t + dur + 0.3);
  }

  /** Music box: high sine with a glassy overtone and a little wobble. */
  function bell(dest, t, midi, vel) {
    const ctx = getCtx(), f = mtof(midi);
    const g = ctx.createGain(); g.connect(dest);
    env(g, t, 0.004, 0.09 * vel, 2.4);
    for (const [m, a] of [[1, 1], [2.76, 0.25], [5.4, 0.06]]) {
      const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sine'; o.frequency.value = f * m; og.gain.value = a;
      o.connect(og); og.connect(g); o.start(t); o.stop(t + 2.6);
    }
  }

  /** Bowed glass: slow-swelling pure tone (night). */
  function glass(dest, t, midi, vel, dur) {
    const ctx = getCtx();
    const g = ctx.createGain(); g.connect(dest);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.035 * vel, t + dur * 0.45); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = mtof(midi);
    const v = ctx.createOscillator(), vg = ctx.createGain(); v.frequency.value = 4.5; vg.gain.value = 3;
    v.connect(vg); vg.connect(o.detune);
    o.connect(g); o.start(t); v.start(t); o.stop(t + dur + 0.1); v.stop(t + dur + 0.1);
  }

  function noiseHit(dest, t, type, freq, q, vol, dur) {
    const ctx = getCtx();
    const n = ctx.createBufferSource(); n.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f); f.connect(g); g.connect(dest); n.start(t, Math.random()); n.stop(t + dur + 0.02);
  }
  function kick(dest, t, vel) {
    const ctx = getCtx();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.14);
    g.gain.setValueAtTime(0.5 * vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.4);
    noiseHit(dest, t, 'lowpass', 1800, 0.5, 0.05 * vel, 0.02);
  }
  function snare(dest, t, vel) {
    noiseHit(dest, t, 'bandpass', 2200, 0.8, 0.22 * vel, 0.16);
    const ctx = getCtx(), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(240, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    g.gain.setValueAtTime(0.12 * vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.14);
  }
  function hat(dest, t, vel, open) { noiseHit(dest, t, 'highpass', 7000, 0.7, 0.07 * vel, open ? 0.18 : 0.035); }
  function tom(dest, t, midi, vel) {
    const ctx = getCtx(), f = mtof(midi), o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(f * 1.7, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
    g.gain.setValueAtTime(0.32 * vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.55);
  }
  /** Dirty chord stab (combat). */
  function stab(dest, t, notes, vel) {
    const ctx = getCtx();
    const sh = ctx.createWaveShaper(), curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 3); }
    sh.curve = curve;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(300, t + 0.6);
    const g = ctx.createGain(); env(g, t, 0.005, 0.06 * vel, 0.8);
    sh.connect(lp); lp.connect(g); g.connect(dest);
    for (const m of notes) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.connect(sh); o.start(t); o.stop(t + 1); }
  }
  /** A noise sweep that rises into the next section. */
  function riser(dest, t, dur, vol) {
    const ctx = getCtx();
    const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(5000, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.95); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.05);
    n.connect(f); f.connect(g); g.connect(dest); n.start(t); n.stop(t + dur + 0.1);
  }

  /** Long-running layers (drone, wind); returned so the track can stop them. */
  function drone(dest, t, midi, vol) {
    const ctx = getCtx(), nodes = [];
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 6);
    g.connect(dest); nodes.push(g);
    for (const [m, det, type, a] of [[midi, 0, 'sine', 1], [midi + 12, 5, 'triangle', 0.25], [midi + 7, -4, 'sine', 0.2]]) {
      const o = ctx.createOscillator(), og = ctx.createGain(); o.type = type; o.frequency.value = mtof(m); o.detune.value = det; og.gain.value = a;
      o.connect(og); og.connect(g); o.start(t); nodes.push(o);
    }
    return nodes;
  }
  function wind(dest, t, vol) {
    const ctx = getCtx();
    const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 0.8;
    const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 0.07; lg.gain.value = 260;
    l.connect(lg); lg.connect(f.frequency);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 5);
    n.connect(f); f.connect(g); g.connect(dest); n.start(t); l.start(t);
    return [n, l, g];
  }

  // ── Track: a song running on the sequencer ───────────────────────────────
  function makeTrack(song) {
    const ctx = getCtx(), b = getBus();
    const out = ctx.createGain();
    const t0 = ctx.currentTime + 0.12;
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.linearRampToValueAtTime(song.level * getVol(), t0 + (song.fadeIn || 3));
    out.connect(b.dry);
    const send = ctx.createGain(); send.gain.value = song.reverb; out.connect(send); send.connect(b.rev);
    const tr = { song, out, send, step: 0, next: t0 + 0.1, stepDur: 60 / song.bpm / 4, persist: [], state: {}, timer: null };
    if (song.setup) tr.persist = song.setup(tr, t0) || [];
    tr.timer = setInterval(() => schedule(tr), 60);
    schedule(tr);
    return tr;
  }
  function schedule(tr) {
    const ctx = getCtx();
    if (!ctx) return;
    while (tr.next < ctx.currentTime + 0.35) {
      // a little swing / human feel on off-beats
      const swing = (tr.step % 2) ? tr.stepDur * (tr.song.swing || 0) : 0;
      try { tr.song.onStep(tr, tr.step, tr.next + swing); } catch (e) {}
      tr.next += tr.stepDur;
      tr.step++;
    }
  }
  function stopTrack(tr, fade) {
    if (!tr) return;
    const ctx = getCtx();
    clearInterval(tr.timer);
    const f = fade == null ? 1.6 : fade;
    try { tr.out.gain.cancelScheduledValues(ctx.currentTime); tr.out.gain.setValueAtTime(tr.out.gain.value, ctx.currentTime); tr.out.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + f); } catch (e) {}
    fading.add(tr);
    setTimeout(() => {
      for (const n of tr.persist) { try { n.stop && n.stop(); } catch (e) {} try { n.disconnect(); } catch (e) {} }
      try { tr.out.disconnect(); tr.send.disconnect(); } catch (e) {}
      fading.delete(tr);
    }, f * 1000 + 200);
  }

  // ── Harmony helpers ──────────────────────────────────────────────────────
  // chords as [root midi, quality]; voiced close around a centre note
  const QUAL = { m: [0, 3, 7], M: [0, 4, 7], m7: [0, 3, 7, 10], M7: [0, 4, 7, 11], s4: [0, 5, 7], d: [0, 3, 6], add9: [0, 4, 7, 14] };
  function voice(root, q, centre) {
    return QUAL[q].map(iv => { let m = root + iv; while (m < centre - 6) m += 12; while (m > centre + 6) m -= 12; return m; }).sort((a, b) => a - b);
  }

  // ── Songs ────────────────────────────────────────────────────────────────
  // Steps are 16ths: 16 per bar.

  const HEARTH = {
    name: 'hearth', bpm: 62, level: 0.55, reverb: 0.55, swing: 0.06,
    // A minor, warm turns toward C and F
    progs: [
      [[57, 'm'], [53, 'M7'], [48, 'M'], [55, 'M']],
      [[57, 'm'], [52, 'm'], [53, 'M'], [52, 'M']],
      [[53, 'M7'], [48, 'add9'], [55, 'M'], [57, 'm']],
      [[50, 'm7'], [55, 'M'], [48, 'M7'], [57, 'm']],
    ],
    scale: [57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81],
    onStep(tr, step, t) {
      const s = tr.state, bar = Math.floor(step / 16), pos = step % 16;
      if (pos === 0) {
        if (bar % 8 === 0) {                       // new section every 8 bars
          s.prog = pick(this.progs);
          s.section = bar === 0 ? 'intro' : pick(['arp', 'arp', 'melody', 'melody', 'sparse']);
          s.motif = null;
        }
        const [root, q] = s.prog[bar % 4];
        s.chord = voice(root, q, 62);
        s.root = root;
        // pad holds the bar, bass on one
        pad(tr.out, t, voice(root, q, 57), tr.stepDur * 16, s.section === 'sparse' ? 0.7 : 0.9, 800);
        if (s.section !== 'intro') bass(tr.out, t, root - 12, 0.6, tr.stepDur * 12);
      }
      const hum = () => rnd(-0.008, 0.012);
      // piano: broken chord, gentle; denser in 'arp'
      const arp = s.section === 'arp' ? [0, 3, 6, 8, 11, 14] : s.section === 'melody' ? [0, 6, 8, 14] : s.section === 'intro' ? [0, 8] : [0];
      if (arp.includes(pos) && s.chord) {
        const order = [0, 2, 1, 2, 0, 1];
        const i = arp.indexOf(pos);
        let m = s.chord[order[i % order.length] % s.chord.length] + (i >= 3 ? 12 : 0);
        piano(tr.out, t + hum(), m, rnd(0.55, 0.8) * (pos === 0 ? 1.15 : 1), 3.2);
      }
      // melody: a 4-note motif, answered a bar later, resting every other pair
      if (s.section === 'melody' && s.chord) {
        if (!s.motif || (pos === 0 && bar % 4 === 0)) {
          const rhythm = pick([[0, 6, 8, 12], [0, 4, 10, 12], [2, 6, 8, 14], [0, 8, 10, 14]]);
          const steps = pick([[0, -1, -2, 0], [0, 1, 2, -1], [2, 1, 0, -2], [0, 2, 1, 0]]);
          s.motif = { rhythm, steps };
        }
        if (bar % 4 !== 3) {
          const k = s.motif.rhythm.indexOf(pos);
          if (k >= 0) {
            const top = s.chord[s.chord.length - 1] + 12;
            let idx = this.scale.findIndex(x => x >= top); if (idx < 0) idx = this.scale.length - 4;
            const m = this.scale[Math.max(0, Math.min(this.scale.length - 1, idx + s.motif.steps[k] + (bar % 2 ? -1 : 0)))];
            (bar % 8 < 4 ? bell : piano)(tr.out, t + hum(), m, rnd(0.6, 0.85), 2.6);
          }
        }
      }
    },
  };

  const ASHES = {
    name: 'ashes', bpm: 74, level: 0.5, reverb: 0.6, swing: 0.1,
    // D minor: Dm – C – Bb – A, two bars each (the long walk)
    progs: [
      [[50, 'm'], [48, 'M'], [46, 'M'], [45, 'M']],
      [[50, 'm'], [46, 'M'], [41, 'M'], [45, 's4']],
      [[50, 'm7'], [53, 'M'], [48, 'M'], [45, 'm']],
    ],
    setup(tr, t) {
      const night = tr.state.night = typeof GS !== 'undefined' && typeof nightFactor === 'function' && nightFactor(GS.time) > 0.5;
      return [...drone(tr.out, t, 38, night ? 0.06 : 0.045), ...wind(tr.out, t, night ? 0.05 : 0.03)];
    },
    onStep(tr, step, t) {
      const s = tr.state, bar = Math.floor(step / 16), pos = step % 16;
      const night = s.night;
      if (pos === 0 && bar % 2 === 0) {
        if (bar % 8 === 0) { s.prog = pick(this.progs); s.density = night ? rnd(0.18, 0.35) : rnd(0.35, 0.65); s.pattern = pick([[0, 7, 2, 9, 4, 11], [0, 4, 7, 12, 7, 4], [0, 7, 12, 7, 3, 7]]); }
        const [root, q] = s.prog[(bar / 2) % 4];
        s.chord = voice(root, q, 55); s.root = root;
        pad(tr.out, t, voice(root, q, 52), tr.stepDur * 32, night ? 0.6 : 0.75, night ? 520 : 700);
        bass(tr.out, t, root - 12, 0.7, tr.stepDur * 14);
      }
      if (!s.chord) return;
      // picked guitar: an ostinato on the 8ths, notes dropped at random
      if (pos % 2 === 0 && Math.random() < s.density) {
        const i = (pos / 2) % s.pattern.length;
        const m = s.root + 12 + s.pattern[i] - (s.pattern[i] > 9 ? 12 : 0);
        pluck(tr.out, t + rnd(0, 0.015), m, rnd(0.5, 0.85), night ? 1600 : 2800);
      }
      // a soft second guitar answering, daytime only
      if (!night && pos === 10 && bar % 4 === 1 && Math.random() < 0.6) pluck(tr.out, t, s.chord[s.chord.length - 1] + 12, 0.45, 3200);
      // night: glass tones that rub against the chord
      if (night && pos === 4 && bar % 4 === 0) glass(tr.out, t, pick([74, 75, 77, 81, 82]), 0.9, tr.stepDur * 28);
      // a far-off metal clank now and then
      if (pos === 13 && Math.random() < 0.05) noiseHit(tr.out, t, 'bandpass', rnd(900, 1500), 9, 0.05, 0.5);
    },
  };

  const STATIC = {
    name: 'static', bpm: 118, level: 0.5, reverb: 0.22, fadeIn: 0.8,
    // E phrygian: E – F – E – D, then G – F – E
    progs: [[[40, 'm'], [41, 'M'], [40, 'm'], [38, 'M']], [[40, 'm'], [43, 'M'], [41, 'M'], [40, 'm']]],
    onStep(tr, step, t) {
      const s = tr.state, bar = Math.floor(step / 16), pos = step % 16;
      if (pos === 0) {
        if (bar % 8 === 0) s.prog = pick(this.progs);
        const [root, q] = s.prog[bar % 4];
        s.root = root; s.chord = voice(root, q, 52);
        if (bar % 2 === 0) stab(tr.out, t, voice(root, q, 52).map(m => m + 12), 0.9);
      }
      const fill = bar % 4 === 3 && pos >= 12;
      // drums
      if (!fill && (pos === 0 || pos === 6 || pos === 8 || (pos === 11 && bar % 2))) kick(tr.out, t, pos === 0 ? 1 : 0.8);
      if (!fill && (pos === 4 || pos === 12)) snare(tr.out, t, 0.9);
      if (pos % 2 === 0) hat(tr.out, t, pos % 4 === 0 ? 0.9 : 0.55, pos === 14 && bar % 2);
      if (fill) tom(tr.out, t, [45, 43, 41, 38][pos - 12], 0.9);
      // bass ostinato: 8ths on the root, an octave jump and a b2 push
      if (pos % 2 === 0) {
        const pat = [0, 0, 12, 0, 0, 1, 0, 12];
        bass(tr.out, t, s.root - 12 + pat[pos / 2], pos === 0 ? 0.7 : 0.5, tr.stepDur * 1.5, true);
      }
      // rising noise into every 8th bar
      if (bar % 8 === 7 && pos === 0) riser(tr.out, t, tr.stepDur * 16, 0.05);
      // high tension bell every few bars
      if (pos === 14 && bar % 4 === 1) bell(tr.out, t, s.root + 36 + pick([0, 1, 7]), 0.5);
    },
  };

  const SONGS = { hearth: HEARTH, ashes: ASHES, static: STATIC };

  // ── Public ───────────────────────────────────────────────────────────────
  function play(name, fade) {
    const ctx = getCtx();
    if (!ctx || !isEnabled()) return;
    if (current && current.song.name === name && !(name === 'ashes' && _nightChanged())) return;
    if (current) stopTrack(current, fade);
    current = makeTrack(SONGS[name]);
  }
  function _nightChanged() {
    const night = typeof GS !== 'undefined' && typeof nightFactor === 'function' && nightFactor(GS.time) > 0.5;
    return current && current.state.night !== night;
  }
  function stop(name, fade) {
    if (current && (!name || current.song.name === name)) { stopTrack(current, fade); current = null; }
  }
  function setVolume() {
    const ctx = getCtx();
    if (current && ctx) { try { current.out.gain.setTargetAtTime(current.song.level * getVol(), ctx.currentTime, 0.1); } catch (e) {} }
  }
  function playing() { return current ? current.song.name : null; }
  /** Offline rendering (previews/tests): schedule the current song up to `sec`. */
  function renderTo(sec) {
    if (!current) return;
    clearInterval(current.timer);
    while (current.next < sec) {
      const swing = (current.step % 2) ? current.stepDur * (current.song.swing || 0) : 0;
      try { current.song.onStep(current, current.step, current.next + swing); } catch (e) {}
      current.next += current.stepDur; current.step++;
    }
  }
  return { play, stop, setVolume, playing, renderTo };
}
