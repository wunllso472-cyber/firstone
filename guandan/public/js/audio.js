/* Sound effects are synthesised with WebAudio; call-outs ("对三", "炸弹"…) use the browser's zh-CN speech voice. */
(function () {
  'use strict';
  let ctx = null;
  let master = null;
  const prefs = { sfx: true, voice: true };
  try {
    Object.assign(prefs, JSON.parse(localStorage.getItem('gd.audio') || '{}'));
  } catch (e) {}

  function ac() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, opts = {}) {
    const a = ac();
    if (!a || !prefs.sfx) return;
    const t = a.currentTime + (opts.delay || 0);
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = opts.type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.vol || 0.3, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function noise(dur, opts = {}) {
    const a = ac();
    if (!a || !prefs.sfx) return;
    const t = a.currentTime + (opts.delay || 0);
    const len = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, opts.decay || 2);
    const src = a.createBufferSource();
    src.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = opts.filter || 'lowpass';
    f.frequency.value = opts.freq || 1200;
    const g = a.createGain();
    g.gain.value = opts.vol || 0.5;
    src.connect(f).connect(g).connect(master);
    src.start(t);
  }

  const SFX = {
    click() { tone(1400, 0.04, { type: 'square', vol: 0.06 }); },
    select() { tone(900, 0.05, { type: 'triangle', vol: 0.12 }); },
    deal() { noise(0.05, { filter: 'highpass', freq: 3000, vol: 0.25, decay: 3 }); },
    play() {
      noise(0.08, { filter: 'bandpass', freq: 2200, vol: 0.6, decay: 3 });
      tone(320, 0.06, { type: 'triangle', vol: 0.12 });
    },
    pass() { tone(420, 0.12, { type: 'sine', vol: 0.12, to: 300 }); },
    turn() {
      tone(988, 0.1, { type: 'sine', vol: 0.18 });
      tone(1319, 0.16, { type: 'sine', vol: 0.18, delay: 0.1 });
    },
    tick() { tone(1800, 0.03, { type: 'square', vol: 0.05 }); },
    warn() { tone(660, 0.08, { type: 'square', vol: 0.08 }); tone(660, 0.08, { type: 'square', vol: 0.08, delay: 0.14 }); },
    bomb() {
      noise(1.2, { freq: 500, vol: 1, decay: 1.6 });
      tone(90, 0.8, { type: 'sawtooth', vol: 0.35, to: 30 });
    },
    sflush() {
      noise(0.9, { freq: 900, vol: 0.8, decay: 1.8 });
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, { type: 'triangle', vol: 0.15, delay: i * 0.06 }));
    },
    rocket() {
      tone(200, 0.7, { type: 'sawtooth', vol: 0.2, to: 1800 });
      noise(1.6, { freq: 700, vol: 1, decay: 1.2, delay: 0.55 });
      tone(70, 1, { type: 'sawtooth', vol: 0.4, to: 25, delay: 0.55 });
    },
    swoosh() { noise(0.35, { filter: 'bandpass', freq: 1600, vol: 0.5, decay: 1 }); },
    win() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.18, delay: i * 0.13 })); },
    lose() { [523, 466, 415, 349].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.15, delay: i * 0.2 })); },
    out() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.18, { type: 'sine', vol: 0.16, delay: i * 0.07 })); },
    tribute() { tone(740, 0.12, { type: 'triangle', vol: 0.15 }); tone(988, 0.2, { type: 'triangle', vol: 0.15, delay: 0.1 }); },
    splat() { noise(0.25, { freq: 700, vol: 0.7, decay: 2 }); },
    ding() { tone(1568, 0.3, { type: 'sine', vol: 0.15 }); },
  };

  let zhVoice = null;
  function pickVoice() {
    if (!('speechSynthesis' in window)) return;
    const vs = speechSynthesis.getVoices();
    zhVoice = vs.find((v) => /zh[-_]CN/i.test(v.lang)) || vs.find((v) => /^zh/i.test(v.lang)) || null;
  }
  if ('speechSynthesis' in window) {
    pickVoice();
    speechSynthesis.onvoiceschanged = pickVoice;
  }
  function say(text, female) {
    if (!prefs.voice || !('speechSynthesis' in window) || !zhVoice) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.voice = zhVoice;
      u.lang = zhVoice.lang;
      u.rate = 1.15;
      u.pitch = female ? 1.35 : 0.95;
      u.volume = 0.9;
      speechSynthesis.speak(u);
    } catch (e) {}
  }

  window.SND = {
    prefs,
    play(name) {
      if (SFX[name]) {
        try {
          SFX[name]();
        } catch (e) {}
      }
    },
    say,
    unlock() { ac(); },
    save() {
      try {
        localStorage.setItem('gd.audio', JSON.stringify(prefs));
      } catch (e) {}
    },
  };
})();
