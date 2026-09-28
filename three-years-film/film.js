/* THREE YEARS — a deterministic canvas film. Every frame is a pure function of time t. */
(() => {
  const TL = window.TL;
  const BAR = 60 / TL.bpm * TL.beatsPerBar, BEAT = BAR / TL.beatsPerBar;
  const W = 1920, H = 1080, CX = W / 2, CY = H / 2;
  const cv = document.getElementById('c');
  const ctx = cv.getContext('2d');
  const DURATION = TL.totalBars * BAR;

  // ---------- math ----------
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const E = {
    outExpo: k => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)),
    inExpo: k => (k <= 0 ? 0 : Math.pow(2, 10 * k - 10)),
    outCubic: k => 1 - Math.pow(1 - k, 3),
    inCubic: k => k * k * k,
    inOutCubic: k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
    outBack: k => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); },
    inOutSine: k => -(Math.cos(Math.PI * k) - 1) / 2,
  };
  function rng(seed) {
    return () => {
      seed = (seed + 0x6D2B79F5) | 0;
      let q = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      q = (q + Math.imul(q ^ (q >>> 7), 61 | q)) ^ q;
      return ((q ^ (q >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mixRGB = (a, b, k) => a.map((v, i) => Math.round(lerp(v, b[i], k)));
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${clamp(a).toFixed(3)})`;

  // ---------- fonts ----------
  const F = {
    sans: (w, s) => `${w} ${s}px "Inter Tight"`,
    serif: (s, it = true) => `${it ? 'italic ' : ''}400 ${s}px "Instrument Serif"`,
    mono: (w, s) => `${w} ${s}px "JetBrains Mono"`,
  };

  // ---------- timeline lookups ----------
  const acts = TL.acts.map(a => ({ ...a, rgb: hex(a.accent) }));
  const shots = TL.shots;
  function actAt(bar) { let a = acts[0]; for (const x of acts) if (bar >= x.bar) a = x; return a; }
  function accentAt(t) {
    const bar = t / BAR, a = actAt(bar), i = acts.indexOf(a);
    if (i === 0) return a.rgb;
    const k = E.inOutCubic(seg(t, a.bar * BAR - 0.35, a.bar * BAR + 0.35));
    return mixRGB(acts[i - 1].rgb, a.rgb, k);
  }
  function shotAt(t) {
    const bar = t / BAR;
    for (let i = shots.length - 1; i >= 0; i--) if (bar >= shots[i].bar) return i;
    return 0;
  }
  const INTENSITY = [0.0, 0.55, 0.65, 1.0, 0.85, 0.5, 0.35];

  // ---------- state for one frame ----------
  let A = [255, 255, 255];        // current accent
  const ac = a => rgba(A, a);
  const wh = a => `rgba(244,242,250,${clamp(a).toFixed(3)})`;
  let PULSE = 0, T = 0;

  // ---------- background: rotating 3D constellation ----------
  const NET = (() => {
    const r = rng(42), pts = [];
    for (let i = 0; i < 170; i++) {
      const u = r() * 2 - 1, th = r() * Math.PI * 2, rad = 520 + r() * 520;
      const s = Math.sqrt(1 - u * u);
      pts.push([Math.cos(th) * s * rad * 1.6, u * rad * 0.7, Math.sin(th) * s * rad]);
    }
    const links = [];
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1], pts[i][2] - pts[j][2]);
      if (d < 250) links.push([i, j]);
    }
    return { pts, links };
  })();
  function drawNetwork(t, strength) {
    if (strength <= 0.001) return;
    const ang = t * 0.045, ca = Math.cos(ang), sa = Math.sin(ang), tilt = 0.28, ct = Math.cos(tilt), st = Math.sin(tilt);
    const proj = NET.pts.map(([x, y, z]) => {
      const x1 = x * ca - z * sa, z1 = x * sa + z * ca;
      const y2 = y * ct - z1 * st, z2 = y * st + z1 * ct;
      const zz = z2 + 1900, f = 1150 / zz;
      return [CX + x1 * f, CY + y2 * f, f];
    });
    ctx.lineWidth = 1;
    for (const [i, j] of NET.links) {
      const p = proj[i], q = proj[j], d = (p[2] + q[2]) / 2;
      ctx.strokeStyle = ac((0.05 + 0.1 * PULSE) * strength * d * 1.4);
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
    }
    for (const p of proj) {
      ctx.fillStyle = ac((0.25 + 0.45 * PULSE) * strength * p[2] * 1.3);
      ctx.beginPath(); ctx.arc(p[0], p[1], 1.2 + p[2] * 2.2, 0, Math.PI * 2); ctx.fill();
    }
  }

  // grain tiles
  const GRAIN = [0, 1, 2, 3].map(k => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'), im = g.createImageData(256, 256), r = rng(900 + k);
    for (let i = 0; i < im.data.length; i += 4) { const v = r() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
    g.putImageData(im, 0, 0); return c;
  });

  function drawBackground(t, act) {
    ctx.fillStyle = '#04050a'; ctx.fillRect(0, 0, W, H);
    const lvl = act.id === 0 ? 0.35 * E.outCubic(seg(t, 4 * BAR, 4 * BAR + 1.5)) : 1;
    const gx = CX + Math.sin(t * 0.13) * 380, gy = CY + Math.cos(t * 0.09) * 180;
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, 1150);
    g.addColorStop(0, ac((0.13 + 0.05 * PULSE) * lvl));
    g.addColorStop(0.55, ac(0.035 * lvl));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const sh = shots[shotAt(t)];
    drawNetwork(t, lvl * (sh.photo && IMG[sh.photo] ? 0.25 : 1));
  }
  function drawFinish(t, frameNo) {
    const v = ctx.createRadialGradient(CX, CY, 420, CX, CY, 1250);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.globalAlpha = 0.055; ctx.globalCompositeOperation = 'overlay';
    const pat = ctx.createPattern(GRAIN[frameNo % 4], 'repeat');
    const r = rng(frameNo * 7 + 1);
    ctx.translate(-r() * 256, -r() * 256);
    ctx.fillStyle = pat; ctx.fillRect(0, 0, W + 256, H + 256);
    ctx.restore();
  }


  // ---------- photographs ----------
  /* Real photos, loaded once. Each gets a pre-blurred copy for use as a soft backdrop. */
  const IMG = {};
  const photoLoads = Object.entries(window.PHOTOS || {}).map(([k, p]) => new Promise(res => {
    const im = new Image();
    im.onload = () => {
      const b = document.createElement('canvas'); b.width = 960; b.height = 540;
      const g = b.getContext('2d'); const s0 = Math.max(960 / im.width, 540 / im.height);
      g.filter = 'blur(14px) saturate(0.7) brightness(0.7)';
      g.drawImage(im, (960 - im.width * s0) / 2, (540 - im.height * s0) / 2, im.width * s0, im.height * s0);
      IMG[k] = { im, blur: b, focus: p.focus || [0.5, 0.42], credit: p.credit || '' };
      res();
    };
    im.onerror = () => res();
    im.src = p.src;
  }));
  function coverDraw(im, x, y, w, h, focus, zoom = 1, iw = im.width, ih = im.height) {
    const sc = Math.max(w / iw, h / ih) * zoom, dw = iw * sc, dh = ih * sc;
    ctx.drawImage(im, x + (w - dw) * focus[0], y + (h - dh) * focus[1], dw, dh);
  }
  let CREDIT = null;
  /* Full-bleed documentary plate: slow push-in and drift, graded toward the act colour,
     darkened on the side where the words sit. */
  function photoPlate(key, te, dur, mode) {
    const P = IMG[key]; if (!P) return false;
    const k = clamp(te / dur);
    const fin = E.outCubic(clamp(te / 0.55)), fout = 1 - E.inCubic(clamp((te - (dur - 0.4)) / 0.4));
    const vis = fin * fout;
    ctx.save();
    ctx.globalAlpha = vis;
    if (mode === 'backdrop') {
      coverDraw(P.blur, -30, -20, W + 60, H + 40, [0.5, 0.5], 1 + 0.04 * k);
      ctx.fillStyle = 'rgba(4,5,10,0.55)'; ctx.fillRect(0, 0, W, H);
    } else {
      ctx.filter = 'saturate(0.82) contrast(1.05) brightness(0.9)';
      const drift = (k - 0.5) * 36;
      coverDraw(P.im, -60 + drift, -34, W + 120, H + 68, P.focus, 1.0 + 0.07 * E.inOutSine(k));
      ctx.filter = 'none';
      ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = ac(0.32); ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      const g = ctx.createLinearGradient(0, 0, W, 0);
      if (mode === 'center') { g.addColorStop(0, 'rgba(4,5,10,0.55)'); g.addColorStop(0.5, 'rgba(4,5,10,0.35)'); g.addColorStop(1, 'rgba(4,5,10,0.55)'); }
      else { g.addColorStop(0, 'rgba(4,5,10,0.93)'); g.addColorStop(0.38, 'rgba(4,5,10,0.78)'); g.addColorStop(0.62, 'rgba(4,5,10,0.18)'); g.addColorStop(1, 'rgba(4,5,10,0.05)'); }
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const v = ctx.createLinearGradient(0, 0, 0, H);
      v.addColorStop(0, 'rgba(4,5,10,0.55)'); v.addColorStop(0.2, 'rgba(4,5,10,0)'); v.addColorStop(0.78, 'rgba(4,5,10,0)'); v.addColorStop(1, 'rgba(4,5,10,0.8)');
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
    if (P.credit) CREDIT = [P.credit, vis];
    return true;
  }
  /* A real portrait in a frame, cropped around the face. */
  function portrait(key, x, y, w, h, k, r = 18) {
    const P = IMG[key]; if (!P || k <= 0) return false;
    ctx.save();
    ctx.globalAlpha *= clamp(k);
    ctx.translate(x + w / 2, y + h / 2); const sc = lerp(1.06, 1, E.outCubic(clamp(k))); ctx.scale(sc, sc); ctx.translate(-(x + w / 2), -(y + h / 2));
    roundRect(x, y, w, h, r); ctx.save(); ctx.clip();
    ctx.filter = 'saturate(0.85) contrast(1.05)';
    coverDraw(P.im, x, y, w, h, P.focus, 1.0);
    ctx.filter = 'none';
    const g = ctx.createLinearGradient(0, y + h * 0.55, 0, y + h);
    g.addColorStop(0, 'rgba(4,5,10,0)'); g.addColorStop(1, 'rgba(4,5,10,0.85)');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.restore();
    ctx.strokeStyle = wh(0.18); ctx.lineWidth = 1.5; roundRect(x, y, w, h, r); ctx.stroke();
    ctx.restore();
    return true;
  }
  function drawCredit() {
    if (!CREDIT || CREDIT[1] <= 0.01) return;
    label('PHOTO  ·  ' + CREDIT[0].toUpperCase(), W - 150, 1052, { font: F.mono(500, 13), color: wh(0.5), align: 'right', spacing: 2, alpha: CREDIT[1] });
  }

  // ---------- kinetic type ----------
  function wrap(str, font, maxW) {
    ctx.font = font;
    const words = str.split(' '), lines = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  }
  /* Words rise out of a mask, staggered; on exit they drift up and fade. */
  function kinetic(lines, x, y, o) {
    const { font, size, lh, color, te, tout = -1, align = 'left', stagger = 0.055, dur = 0.85, spacing = 0, maskPad = 0.3 } = o;
    ctx.save();
    ctx.font = font; ctx.textBaseline = 'alphabetic'; ctx.letterSpacing = spacing + 'px';
    let k = 0;
    lines.forEach((line, li) => {
      const ly = y + li * lh;
      const words = line.split(' ');
      const space = ctx.measureText(' ').width;
      const widths = words.map(w => ctx.measureText(w).width);
      const total = widths.reduce((a, b) => a + b, 0) + space * (words.length - 1);
      let wx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, ly - size * 1.05, W, size * (1.05 + maskPad)); ctx.clip();
      words.forEach((w, wi) => {
        const pin = E.outExpo(clamp((te - k * stagger) / dur));
        const pout = tout >= 0 ? E.inCubic(clamp((tout - k * 0.018) / 0.38)) : 0;
        const dy = (1 - pin) * size * 0.95 - pout * size * 0.9;
        const a = pin * (1 - pout);
        if (a > 0.002) { ctx.fillStyle = typeof color === 'function' ? color(w, a) : color.replace('ALPHA', a.toFixed(3)); ctx.fillText(w, wx, ly + dy); }
        wx += widths[wi] + space; k++;
      });
      ctx.restore();
    });
    ctx.restore();
    return k;
  }
  function label(str, x, y, o) {
    const { font = F.mono(500, 22), color = wh(0.6), align = 'left', spacing = 4, alpha = 1 } = o || {};
    if (alpha <= 0.002) return;
    ctx.save(); ctx.font = font; ctx.letterSpacing = spacing + 'px'; ctx.textAlign = align;
    ctx.globalAlpha *= alpha; ctx.fillStyle = color; ctx.fillText(str, x, y); ctx.restore();
  }
  function typewriter(str, x, y, n, o) {
    label(str.slice(0, Math.max(0, Math.floor(n))), x, y, o);
  }

  // ---------- shot layouts ----------
  /* Standard event: date + headline + sub on the left, visual on the right. */
  function eventText(s, te, tout) {
    const x = 150, maxW = 840;
    const tl = wrap(s.title, F.sans(800, 80), maxW);
    const sl = s.sub ? wrap(s.sub, F.serif(44), 780) : [];
    const total = 44 + tl.length * 88 + (sl.length ? 26 + sl.length * 52 : 0);
    let y = CY - total / 2 + 20;
    // date kicker with accent rule
    const kin = E.outExpo(clamp(te / 0.7)), kout = tout >= 0 ? E.inCubic(clamp(tout / 0.3)) : 0;
    ctx.fillStyle = ac(0.9 * (1 - kout));
    ctx.fillRect(x, y - 9, 46 * kin, 3);
    label(s.date || s.kicker || '', x + 62 - (1 - kin) * 20, y, { font: F.mono(600, 26), color: ac(1), spacing: 6, alpha: kin * (1 - kout) });
    y += 44 + 72;
    kinetic(tl, x, y, { font: F.sans(800, 80), size: 80, lh: 88, color: 'rgba(246,244,252,ALPHA)', te: te - 0.12, tout, spacing: -1.5 });
    y += (tl.length - 1) * 88;
    if (sl.length) {
      y += 26 + 52;
      kinetic(sl, x, y, { font: F.serif(44), size: 44, lh: 52, color: 'rgba(196,194,212,ALPHA)', te: te - 0.45, tout, stagger: 0.03 });
    }
  }
  /* Centered "idea" card: visual above, kicker + big statement below. */
  function ideaText(s, te, tout, y0 = 770) {
    const kin = E.outExpo(clamp(te / 0.7)), kout = tout >= 0 ? E.inCubic(clamp(tout / 0.3)) : 0;
    label(s.kicker, CX, y0, { font: F.mono(600, 26), color: ac(1), spacing: 10, align: 'center', alpha: kin * (1 - kout) });
    const tl = wrap(s.title, F.sans(900, 104), 1500);
    kinetic(tl, CX, y0 + 120, { font: F.sans(900, 104), size: 104, lh: 112, align: 'center', color: 'rgba(250,248,255,ALPHA)', te: te - 0.15, tout, spacing: -3 });
    if (s.sub) {
      const sl = wrap(s.sub, F.serif(42), 1300);
      kinetic(sl, CX, y0 + 120 + tl.length * 112 - 30, { font: F.serif(42), size: 42, lh: 50, align: 'center', color: 'rgba(196,194,212,ALPHA)', te: te - 0.6, tout, stagger: 0.03 });
    }
  }

  // ---------- drawing primitives ----------
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
  function glowDot(x, y, r, a = 1) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, ac(0.9 * a)); g.addColorStop(0.35, ac(0.35 * a)); g.addColorStop(1, ac(0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  function drawOn(pathFn, len, k) {
    ctx.setLineDash([len * k, len]); pathFn(); ctx.stroke(); ctx.setLineDash([]);
  }
  function star5(x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 ? r * 0.42 : r, a = -Math.PI / 2 + i * Math.PI / 5;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
  }
  function check(x, y, s, k) {
    ctx.beginPath(); ctx.moveTo(x - s * 0.5, y); ctx.lineTo(x - s * 0.15, y + s * 0.35); ctx.lineTo(x + s * 0.55, y - s * 0.4);
    ctx.setLineDash([s * 2.2 * k, s * 3]); ctx.stroke(); ctx.setLineDash([]);
  }
  const fadeIO = (te, dur, tout) => E.outCubic(clamp(te / 0.6)) * (tout >= 0 ? 1 - E.inCubic(clamp(tout / 0.35)) : 1);

  // ---------- visuals ----------
  const V = {};

  V.cold = (s, te, tout) => {
    // typed prologue in a terminal voice
    const lines = TL.typing.filter(l => !l.shot);
    const thirty2 = BEAT / 8;
    const collapse = E.inExpo(seg(te, 3.35 * BAR, 4 * BAR));
    ctx.save();
    ctx.translate(CX, CY); ctx.scale(1 - collapse * 0.9, 1 - collapse * 0.9); ctx.translate(-CX, -CY);
    ctx.globalAlpha = 1 - collapse;
    let lastEnd = 0, cursorAt = null;
    lines.forEach((ln, i) => {
      const start = ln.bar * BAR, n = (te - start) / thirty2;
      const y = 440 + i * 92, x = 250;
      if (n > 0) {
        const txt = ln.text.slice(0, Math.min(ln.text.length, Math.floor(n)));
        const isLast = i === lines.length - 1;
        label(txt, x, y, { font: F.mono(isLast ? 600 : 400, 46), color: isLast ? '#ffffff' : 'rgba(230,228,240,0.78)', spacing: 1 });
        ctx.font = F.mono(isLast ? 600 : 400, 46); ctx.letterSpacing = '1px';
        cursorAt = [x + ctx.measureText(txt).width + 8, y];
        ctx.letterSpacing = '0px';
      }
      lastEnd = start + ln.text.length * thirty2;
    });
    if (!cursorAt) cursorAt = [250, 440];
    const blink = (Math.floor(te / (BEAT / 2)) % 2 === 0) || te < lastEnd;
    if (blink) { ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(cursorAt[0], cursorAt[1] - 38, 22, 46); }
    ctx.restore();
    // the collapse becomes a point of light
    if (collapse > 0) glowDot(CX, CY, 40 + collapse * 260, collapse);
    // tiny header
    label('00:00:00 — 2023.09', 150, 120, { font: F.mono(400, 20), color: wh(0.35), spacing: 4, alpha: E.outCubic(seg(te, 0.2, 1.2)) * (1 - collapse) });
  };

  V.title = (s, te, tout) => {
    const flash = Math.exp(-te / 0.22);
    const k = E.outExpo(clamp(te / 1.6));
    const spacing = lerp(90, 14, k);
    const out = tout >= 0 ? E.inCubic(clamp(tout / 0.4)) : 0;
    ctx.save();
    ctx.globalAlpha = (1 - out);
    ctx.font = F.sans(900, 230); ctx.letterSpacing = spacing + 'px'; ctx.textAlign = 'center';
    const grd = ctx.createLinearGradient(0, 380, 0, 600);
    grd.addColorStop(0, '#ffffff'); grd.addColorStop(1, '#bdb8d6');
    ctx.fillStyle = grd;
    ctx.fillText('THREE YEARS', CX + spacing / 2, 590 - out * 40);
    ctx.restore();
    const sub = E.outExpo(clamp((te - 0.7) / 1));
    label('How AI learned to see, think, and act', CX, 690 - out * 30, { font: F.serif(54), color: 'rgba(214,210,232,1)', align: 'center', spacing: 0, alpha: sub * (1 - out) });
    label('SEPT 2023  —  SEPT 2026', CX, 780 - out * 30, { font: F.mono(500, 24), color: 'rgba(255,255,255,0.55)', align: 'center', spacing: 10, alpha: E.outExpo(clamp((te - 1.1) / 1)) * (1 - out) });
    if (flash > 0.01) { ctx.fillStyle = `rgba(255,255,255,${(flash * 0.85).toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
  };

  V.card = (s, te, tout) => {
    const act = acts[s.act];
    const k = E.outExpo(clamp(te / 1.1));
    const out = tout >= 0 ? E.inCubic(clamp(tout / 0.35)) : 0;
    const flash = Math.exp(-te / 0.18) * 0.5;
    // light sweep
    const sx = lerp(-300, W + 300, E.inOutCubic(clamp(te / 0.9)));
    const sg = ctx.createLinearGradient(sx - 300, 0, sx + 300, 0);
    sg.addColorStop(0, ac(0)); sg.addColorStop(0.5, ac(0.16)); sg.addColorStop(1, ac(0));
    ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.globalAlpha = k * (1 - out);
    ctx.translate(CX, 470); ctx.scale(lerp(1.18, 1, k) + out * 0.08, lerp(1.18, 1, k) + out * 0.08);
    ctx.font = F.serif(380, false); ctx.textAlign = 'center';
    const g = ctx.createLinearGradient(0, -300, 0, 60);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, rgba(act.rgb, 1));
    ctx.fillStyle = g; ctx.fillText(act.numeral, 0, 100);
    ctx.restore();
    label(act.name, CX + 14, 700, { font: F.sans(900, 60), color: '#ffffff', align: 'center', spacing: 28, alpha: E.outExpo(clamp((te - 0.2) / 0.9)) * (1 - out) });
    label(act.line, CX, 780, { font: F.serif(44), color: 'rgba(208,204,226,1)', align: 'center', spacing: 0, alpha: E.outExpo(clamp((te - 0.45) / 0.9)) * (1 - out) });
    ctx.save(); ctx.globalAlpha = 1 - out; motif(s.act, te, CX, 200); ctx.restore();
    if (flash > 0.01) { ctx.fillStyle = ac(flash); ctx.fillRect(0, 0, W, H); }
  };

  // ACT I --------------------------------------------------------------
  V.eye = (s, te, tout) => {
    const a = fadeIO(te, 0, tout), cx = 1370, cy = 530;
    const d = E.inOutCubic(clamp(te / 1.4));
    ctx.save(); ctx.globalAlpha = a;
    ctx.strokeStyle = ac(0.95); ctx.lineWidth = 3;
    drawOn(() => { ctx.beginPath(); ctx.moveTo(cx - 330, cy); ctx.quadraticCurveTo(cx, cy - 250, cx + 330, cy); ctx.quadraticCurveTo(cx, cy + 250, cx - 330, cy); }, 1500, d);
    const ir = E.outBack(clamp((te - 0.5) / 0.9));
    if (ir > 0) {
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, 112 * ir, 0, Math.PI * 2); ctx.stroke();
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(te * 0.6);
      ctx.setLineDash([4, 10]); ctx.strokeStyle = ac(0.6);
      ctx.beginPath(); ctx.arc(0, 0, 84 * ir, 0, Math.PI * 2); ctx.stroke();
      ctx.rotate(-te * 1.4); ctx.setLineDash([24, 14]); ctx.strokeStyle = ac(0.4);
      ctx.beginPath(); ctx.arc(0, 0, 62 * ir, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      for (let i = 0; i < 60; i++) {
        const ang = i / 60 * Math.PI * 2 + te * 0.2, r0 = 124 * ir, r1 = (i % 5 ? 132 : 146) * ir;
        ctx.strokeStyle = ac(i % 5 ? 0.35 : 0.8); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(Math.cos(ang) * r0, Math.sin(ang) * r0); ctx.lineTo(Math.cos(ang) * r1, Math.sin(ang) * r1); ctx.stroke();
      }
      ctx.restore();
      glowDot(cx, cy, 90 * ir, 0.5 + PULSE * 0.5);
      ctx.fillStyle = '#04050a'; ctx.beginPath(); ctx.arc(cx, cy, (36 + 10 * PULSE) * ir, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(cx + 16, cy - 18, 7 * ir, 0, Math.PI * 2); ctx.fill();
    }
    ['SEE', 'HEAR', 'SPEAK'].forEach((w, i) => {
      const k = E.outExpo(clamp((te - 1.1 - i * BEAT * 2) / 0.6));
      const px = cx - 260 + i * 260;
      label(w, px, cy + 300 + (1 - k) * 16, { font: F.mono(600, 24), color: ac(1), align: 'center', spacing: 8, alpha: k });
      ctx.fillStyle = ac(0.5 * k); ctx.fillRect(px - 1, cy + 222, 2, 44 * k);
    });
    ctx.restore();
  };

  V.tokens = (s, te, tout) => {
    const a = fadeIO(te, 0, tout);
    const cols = 40, rows = 24, cw = 15, chh = 7, gx = 4, gy = 9;
    const x0 = 1380 - (cols * (cw + gx)) / 2, y0 = 250;
    const prog = E.inOutCubic(seg(te, 0.35, 3.6));
    const n = Math.floor(prog * cols * rows);
    const r = rng(5);
    ctx.save(); ctx.globalAlpha = a;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const idx = j * cols + i, w = cw * (0.45 + r() * 0.55);
      const lit = idx < n, head = idx >= n - 12 && idx < n;
      ctx.fillStyle = head ? '#ffffff' : lit ? ac(0.55 + 0.3 * ((i + j) % 3 === 0)) : wh(0.06);
      ctx.fillRect(x0 + i * (cw + gx), y0 + j * (chh + gy), w, chh);
    }
    const count = Math.round(prog * 1e6).toLocaleString('en-US');
    label(count, 1380, y0 + rows * (chh + gy) + 110, { font: F.sans(800, 104), color: '#ffffff', align: 'center', spacing: -2 });
    label('TOKENS IN CONTEXT', 1380, y0 + rows * (chh + gy) + 160, { font: F.mono(500, 22), color: ac(0.9), align: 'center', spacing: 8 });
    ctx.restore();
  };

  V.film = (s, te, tout) => {
    const a = fadeIO(te, 0, tout);
    const prompt = 'a paper boat drifting at sunset';
    const x0 = 990, x1 = 1800, cy = 540, fw = 300, fh = 180, gap = 26;
    ctx.save(); ctx.globalAlpha = a;
    label('PROMPT ›', x0 + 10, 330, { font: F.mono(600, 22), color: ac(1), spacing: 4 });
    typewriter(prompt, x0 + 150, 330, (te - 0.2) / 0.035, { font: F.mono(400, 22), color: wh(0.85), spacing: 1 });
    ctx.beginPath(); ctx.rect(x0, 380, x1 - x0, 330); ctx.clip();
    const off = te * 150;
    // film base with sprockets
    ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fillRect(x0, cy - fh / 2 - 44, x1 - x0, fh + 88);
    for (let x = -((off) % 36); x < x1 - x0; x += 36) {
      ctx.fillStyle = wh(0.18);
      ctx.fillRect(x0 + x, cy - fh / 2 - 32, 16, 12); ctx.fillRect(x0 + x, cy + fh / 2 + 20, 16, 12);
    }
    const appear = E.outCubic(seg(te, 0.9, 1.6));
    for (let k = -1; k < 5; k++) {
      const fx = x0 + 20 + k * (fw + gap) - (off % (fw + gap));
      const gi = k + Math.floor(off / (fw + gap));
      const fy = cy - fh / 2;
      ctx.save();
      roundRect(fx, fy, fw, fh, 8); ctx.clip();
      const sky = ctx.createLinearGradient(0, fy, 0, fy + fh);
      sky.addColorStop(0, `rgba(40,30,80,${appear})`); sky.addColorStop(0.62, ac(0.55 * appear)); sky.addColorStop(0.63, `rgba(10,20,40,${appear})`); sky.addColorStop(1, `rgba(4,8,20,${appear})`);
      ctx.fillStyle = sky; ctx.fillRect(fx, fy, fw, fh);
      const sunX = fx + ((gi * 37) % fw + fw) % fw, sunY = fy + fh * 0.62 - 26 + Math.sin(gi * 0.7) * 6;
      ctx.fillStyle = `rgba(255,236,200,${0.95 * appear})`; ctx.beginPath(); ctx.arc(sunX, sunY, 18, 0, Math.PI * 2); ctx.fill();
      // boat
      const bx = fx + fw * 0.35 + Math.sin(gi * 0.9 + te) * 20, by = fy + fh * 0.66 + 4;
      ctx.fillStyle = `rgba(255,255,255,${0.9 * appear})`;
      ctx.beginPath(); ctx.moveTo(bx - 26, by); ctx.lineTo(bx + 26, by); ctx.lineTo(bx + 14, by + 10); ctx.lineTo(bx - 14, by + 10); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(bx - 2, by); ctx.lineTo(bx + 6, by - 24); ctx.lineTo(bx + 16, by); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = ac(0.55); ctx.lineWidth = 2; roundRect(fx, fy, fw, fh, 8); ctx.stroke();
      label(String(gi * 24).padStart(4, '0'), fx + 10, fy + fh + 12, { font: F.mono(400, 12), color: wh(0.35), spacing: 1 });
    }
    ctx.restore();
    const edge = ctx.createLinearGradient(x0, 0, x1, 0);
    edge.addColorStop(0, 'rgba(4,5,10,1)'); edge.addColorStop(0.08, 'rgba(4,5,10,0)'); edge.addColorStop(0.92, 'rgba(4,5,10,0)'); edge.addColorStop(1, 'rgba(4,5,10,1)');
    ctx.fillStyle = edge; ctx.fillRect(x0, 380, x1 - x0, 330);
  };

  V.voice = (s, te, tout) => {
    const a = fadeIO(te, 0, tout), cx = 1370, cy = 520;
    ctx.save(); ctx.globalAlpha = a;
    // alternate: person speaks (grey), model answers (accent)
    const phase = Math.floor(te / (BEAT * 2)) % 2;
    const local = (te % (BEAT * 2)) / (BEAT * 2);
    const env = Math.sin(Math.PI * clamp(local * 1.1));
    for (let ring = 3; ring >= 0; ring--) {
      ctx.beginPath();
      for (let i = 0; i <= 200; i++) {
        const th = i / 200 * Math.PI * 2;
        const wob = Math.sin(th * 6 + te * 5 + ring) * 0.5 + Math.sin(th * 11 - te * 7) * 0.3 + Math.sin(th * 3 + te * 2.3 + ring * 2) * 0.4;
        const R = 150 + ring * 22 + wob * (18 + 30 * env) * (1 - ring * 0.18);
        const x = cx + Math.cos(th) * R, y = cy + Math.sin(th) * R;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = phase ? ac(0.85 - ring * 0.18) : wh(0.6 - ring * 0.12); ctx.lineWidth = ring ? 1.5 : 3; ctx.stroke();
    }
    glowDot(cx, cy, 150, phase ? 0.55 * env + 0.15 : 0.12);
    label(phase ? 'MODEL' : 'YOU', cx, cy + 12, { font: F.mono(600, 26), color: phase ? '#ffffff' : wh(0.7), align: 'center', spacing: 8 });
    label('AVG RESPONSE  320 MS', cx, cy + 300, { font: F.mono(500, 22), color: ac(0.9), align: 'center', spacing: 6, alpha: E.outCubic(seg(te, 0.8, 1.4)) });
    ctx.restore();
  };

  V.sound = (s, te, tout) => {
    const a = fadeIO(te, 0, tout), cx = 1380, cy = 470;
    ctx.save(); ctx.globalAlpha = a;
    ctx.strokeStyle = ac(0.7); ctx.lineWidth = 2; roundRect(cx - 250, cy - 150, 500, 280, 12); ctx.stroke();
    ctx.fillStyle = ac(0.1); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(cx - 26, cy - 40); ctx.lineTo(cx + 36, cy - 10); ctx.lineTo(cx - 26, cy + 20); ctx.closePath(); ctx.fill();
    for (let i = 0; i < 64; i++) {
      const h = (Math.abs(Math.sin(i * 0.9 + te * 9)) * 0.6 + Math.abs(Math.sin(i * 0.23 - te * 4)) * 0.4) * (30 + 50 * PULSE);
      ctx.fillStyle = ac(0.85); ctx.fillRect(cx - 250 + i * 7.9, cy + 220 - h / 2, 4, h);
    }
    ctx.restore();
  };

  const ICON = {
    eye: (x, y, s) => { ctx.beginPath(); ctx.moveTo(x - s, y); ctx.quadraticCurveTo(x, y - s * 0.8, x + s, y); ctx.quadraticCurveTo(x, y + s * 0.8, x - s, y); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, s * 0.3, 0, 7); ctx.stroke(); },
    ear: (x, y, s) => { ctx.beginPath(); ctx.arc(x, y - s * 0.2, s * 0.6, Math.PI * 0.95, Math.PI * 2.3); ctx.quadraticCurveTo(x + s * 0.2, y + s * 0.7, x - s * 0.2, y + s * 0.8); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y - s * 0.2, s * 0.25, Math.PI, Math.PI * 2.2); ctx.stroke(); },
    wave: (x, y, s) => { ctx.beginPath(); for (let i = 0; i <= 40; i++) { const u = i / 40; const px = x - s + u * s * 2, py = y + Math.sin(u * Math.PI * 4) * s * 0.45 * Math.sin(u * Math.PI); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.stroke(); },
    frame: (x, y, s) => { ctx.strokeRect(x - s, y - s * 0.65, s * 2, s * 1.3); ctx.beginPath(); ctx.moveTo(x - s * 0.2, y - s * 0.3); ctx.lineTo(x + s * 0.35, y); ctx.lineTo(x - s * 0.2, y + s * 0.3); ctx.closePath(); ctx.stroke(); },
    text: (x, y, s) => { for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x - s, y - s * 0.6 + i * s * 0.4); ctx.lineTo(x + s * (i === 3 ? 0.2 : 1), y - s * 0.6 + i * s * 0.4); ctx.stroke(); } },
  };

  V.idea1 = (s, te, tout) => {
    const a = fadeIO(te, 0, tout), cx = CX, cy = 400;
    const m = E.inOutCubic(seg(te, 0.5, 1.7));
    ctx.save(); ctx.globalAlpha = a;
    const names = ['text', 'eye', 'ear', 'wave', 'frame'];
    names.forEach((n, i) => {
      const ang = -Math.PI / 2 + i / names.length * Math.PI * 2 + te * 0.25;
      const R = lerp(300, 0, m);
      const x = cx + Math.cos(ang) * R, y = cy + Math.sin(ang) * R * 0.8;
      ctx.strokeStyle = ac(0.95 * (1 - m * 0.9)); ctx.lineWidth = 3;
      ICON[n](x, y, 46 * (1 - m * 0.6));
    });
    const orb = E.outExpo(seg(te, 1.5, 2.3));
    if (orb > 0) {
      glowDot(cx, cy, 240 * orb, 0.7 + 0.3 * PULSE);
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(cx, cy, 34 * orb, 0, 7); ctx.fill();
      for (let r = 0; r < 3; r++) {
        const ph = ((te - 1.5) / (BEAT * 2) + r / 3) % 1;
        ctx.strokeStyle = ac(0.6 * (1 - ph) * orb); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, 40 + ph * 220, 0, 7); ctx.stroke();
      }
    }
    ctx.restore();
    ideaText(s, te - 0.9, tout);
  };

  // ACT II -------------------------------------------------------------
  const TREE = (() => {
    const r = rng(11), levels = [[{ x: 0, y: 0, p: -1, on: true }]];
    for (let L = 1; L <= 6; L++) {
      const prev = levels[L - 1], cur = [];
      prev.forEach((n, pi) => {
        const kids = n.on ? 3 : (r() < 0.55 ? 2 : 1);
        for (let k = 0; k < kids; k++) cur.push({ p: pi, on: false, r: r() });
      });
      const onKids = cur.filter(c => prev[c.p].on);
      onKids[Math.floor(r() * onKids.length)].on = true;
      const span = Math.min(560, 40 + cur.length * 26);
      cur.forEach((c, i) => { c.x = L * 104; c.y = (cur.length === 1 ? 0 : (i / (cur.length - 1) - 0.5) * span) + (c.r - 0.5) * 14; });
      levels.push(cur);
    }
    return levels;
  })();
  V.tree = (s, te, tout) => {
    const a = fadeIO(te, 0, tout), ox = 1020, oy = 520;
    ctx.save(); ctx.globalAlpha = a;
    const per = 0.42;
    for (let L = 1; L < TREE.length; L++) {
      const k = E.outCubic(clamp((te - 0.2 - L * per) / 0.5));
      if (k <= 0) continue;
      TREE[L].forEach(n => {
        const p = TREE[L - 1][n.p];
        const x0 = ox + p.x, y0 = oy + p.y, x1 = ox + lerp(p.x, n.x, k), y1 = oy + lerp(p.y, n.y, k);
        ctx.strokeStyle = n.on ? ac(0.95) : wh(0.14); ctx.lineWidth = n.on ? 3 : 1.2;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.bezierCurveTo(x0 + 60, y0, x1 - 60, y1, x1, y1); ctx.stroke();
        ctx.fillStyle = n.on ? '#ffffff' : wh(0.3);
        ctx.beginPath(); ctx.arc(x1, y1, n.on ? 6 : 3, 0, 7); ctx.fill();
        if (n.on && k > 0.6) glowDot(x1, y1, 30, 0.6);
      });
    }
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(ox, oy, 8, 0, 7); ctx.fill(); glowDot(ox, oy, 40, 0.7);
    const done = te > 0.2 + 6 * per + 0.5;
    const secs = Math.min(12, Math.floor(clamp((te - 0.2) / (6 * per + 0.5)) * 12));
    label(done ? 'Thought for 12s' : `Thinking… ${secs}s`, ox - 10, oy - 320, { font: F.mono(500, 24), color: done ? ac(1) : wh(0.7), spacing: 1 });
    if (done) {
      const last = TREE[6].find(n => n.on), k = E.outBack(clamp((te - 0.2 - 6 * per - 0.5) / 0.5));
      const x = ox + last.x + 26, y = oy + last.y;
      ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
      ctx.fillStyle = ac(1); roundRect(0, -24, 150, 48, 24); ctx.fill();
      label('ANSWER', 75, 8, { font: F.mono(700, 20), color: '#05060a', align: 'center', spacing: 4 });
      ctx.restore();
    }
    ctx.restore();
  };

  V.arc = (s, te, tout) => {
    const a = fadeIO(te, 0, tout);
    const bars = [['GPT-3', '2020', 0], ['GPT-4o', '2024', 5], ['o3', 'BUDGET LIMIT', 75.7], ['o3', 'HIGH COMPUTE', 87.5]];
    const x0 = 1040, base = 760, hMax = 420, bw = 124, gap = 58;
    ctx.save(); ctx.globalAlpha = a;
    label('ARC-AGI-1  ·  SEMI-PRIVATE SET', x0, base - hMax - 50, { font: F.mono(600, 20), color: ac(1), spacing: 5 });
    ctx.setLineDash([4, 8]); ctx.strokeStyle = wh(0.18); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, base - hMax); ctx.lineTo(x0 + 4 * (bw + gap) - gap, base - hMax); ctx.stroke(); ctx.setLineDash([]);
    label('100%', x0 - 14, base - hMax + 6, { font: F.mono(500, 15), color: wh(0.4), align: 'right', spacing: 1 });
    ctx.fillStyle = wh(0.3); ctx.fillRect(x0, base, 4 * (bw + gap) - gap, 2);
    bars.forEach(([n, d, v], i) => {
      const st = 0.3 + i * BEAT * (i >= 2 ? 1.4 : 1), k = E.outCubic(clamp((te - st) / (i >= 2 ? 0.9 : 0.5)));
      const h = Math.max(3, hMax * v / 100 * k), x = x0 + i * (bw + gap);
      if (i >= 2) { const g = ctx.createLinearGradient(0, base - h, 0, base); g.addColorStop(0, ac(1)); g.addColorStop(1, ac(0.35)); ctx.fillStyle = g; }
      else ctx.fillStyle = wh(0.35);
      ctx.fillRect(x, base - h, bw, h);
      if (i === 3 && k > 0.98) glowDot(x + bw / 2, base - h, 70, 0.5 + 0.4 * PULSE);
      label((v * k).toFixed(v % 1 ? 1 : 0) + '%', x + bw / 2, base - h - 18, { font: F.sans(800, i >= 2 ? 46 : 30), color: i >= 2 ? '#ffffff' : wh(0.8), align: 'center', spacing: -1, alpha: clamp((te - st) / 0.3) });
      label(n, x + bw / 2, base + 42, { font: F.sans(700, 26), color: wh(0.9), align: 'center', spacing: 0 });
      label(d, x + bw / 2, base + 70, { font: F.mono(500, 14), color: wh(0.45), align: 'center', spacing: 2 });
    });
    ctx.restore();
  };

  V.lock = (s, te, tout) => {
    const a = fadeIO(te, 0, tout), cx = 1380, cy = 560;
    const open = E.outBack(clamp((te - 1.0) / 0.7));
    ctx.save(); ctx.globalAlpha = a;
    ctx.strokeStyle = ac(1); ctx.lineWidth = 18; ctx.lineCap = 'round';
    ctx.save(); ctx.translate(cx + 80, cy - 110 - open * 70); ctx.rotate(-open * 0.55);
    ctx.beginPath(); ctx.moveTo(-160, 60); ctx.lineTo(-160, -20); ctx.arc(-80, -20, 80, Math.PI, 0); ctx.lineTo(0, 60 - open * 40); ctx.stroke();
    ctx.restore();
    ctx.lineCap = 'butt';
    const g = ctx.createLinearGradient(0, cy - 110, 0, cy + 130);
    g.addColorStop(0, ac(0.95)); g.addColorStop(1, ac(0.55));
    ctx.fillStyle = g; roundRect(cx - 150, cy - 110, 300, 240, 26); ctx.fill();
    label('R1', cx, cy + 40, { font: F.sans(900, 110), color: '#05060a', align: 'center', spacing: -4 });
    ['OPEN WEIGHTS', 'MIT LICENSE'].forEach((w, i) => {
      const k = E.outExpo(clamp((te - 1.5 - i * BEAT) / 0.6));
      const x = cx - 150 + i * 170, y = cy + 190;
      ctx.globalAlpha = a * k;
      ctx.strokeStyle = ac(0.8); ctx.lineWidth = 2; roundRect(x, y, i ? 150 : 158, 46, 23); ctx.stroke();
      label(w, x + (i ? 75 : 79), y + 30, { font: F.mono(600, 16), color: ac(1), align: 'center', spacing: 3 });
    });
    const ck = E.outExpo(clamp((te - 1.5 - 2 * BEAT) / 0.6));
    ctx.globalAlpha = a * ck;
    ctx.fillStyle = ac(0.16); roundRect(cx - 150, cy + 256, 328, 50, 25); ctx.fill();
    label('$5.6M  ·  V3 FINAL TRAINING RUN', cx + 14, cy + 288, { font: F.mono(700, 16), color: '#ffffff', align: 'center', spacing: 2 });
    ctx.restore();
  };

  const PRICE = (() => { const r = rng(77), p = []; let v = 0.5; for (let i = 0; i < 90; i++) { v += (r() - 0.44) * 0.05; p.push(v); } return p; })();
  V.crash = (s, te, tout) => {
    const a = fadeIO(te, 0, tout);
    const x0 = 1010, x1 = 1760, y0 = 300, y1 = 700;
    const draw = clamp((te - 0.2) / 1.6), drop = E.inExpo(seg(te, 1.8, 2.25));
    ctx.save(); ctx.globalAlpha = a;
    for (let i = 0; i <= 4; i++) { ctx.fillStyle = wh(0.07); ctx.fillRect(x0, y0 + i * (y1 - y0) / 4, x1 - x0, 1); }
    const n = PRICE.length, last = PRICE[n - 1];
    const px = i => lerp(x0, x1 - 60, i / (n - 1)), py = v => lerp(y1, y0, (v - 0.2) / 1.2);
    ctx.lineWidth = 3; ctx.strokeStyle = wh(0.9); ctx.beginPath();
    const m = Math.max(1, Math.floor(draw * n));
    for (let i = 0; i < m; i++) i ? ctx.lineTo(px(i), py(PRICE[i])) : ctx.moveTo(px(i), py(PRICE[i]));
    ctx.stroke();
    if (drop > 0) {
      const ex = px(n - 1) + 60 * drop, ey = lerp(py(last), py(last) + (py(0.2) - py(last)) * 0.72, drop);
      ctx.strokeStyle = '#ff4d5e'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(px(n - 1), py(last)); ctx.lineTo(ex, ey); ctx.stroke();
      const gg = ctx.createRadialGradient(ex, ey, 0, ex, ey, 70); gg.addColorStop(0, 'rgba(255,77,94,0.8)'); gg.addColorStop(1, 'rgba(255,77,94,0)');
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(ex, ey, 70, 0, 7); ctx.fill();
    }
    const val = Math.round(590 * drop);
    label(drop > 0 ? `≈ −$${val}B` : '$ —', x1, y0 - 40, { font: F.sans(900, 88), color: drop > 0 ? '#ff4d5e' : wh(0.3), align: 'right', spacing: -2 });
    label('NVDA  ·  MARKET VALUE  ·  ONE TRADING DAY', x0, y1 + 50, { font: F.mono(500, 18), color: wh(0.5), spacing: 4 });
    ctx.restore();
  };

  V.medal = (s, te, tout) => {
    const a = fadeIO(te, 0, tout), cx = 1380;
    const k = E.outBack(clamp((te - 0.1) / 0.9));
    const cy = lerp(300, 540, k);
    ctx.save(); ctx.globalAlpha = a;
    // ribbon
    ctx.fillStyle = ac(0.9);
    ctx.beginPath(); ctx.moveTo(cx - 120, cy - 330); ctx.lineTo(cx - 40, cy - 330); ctx.lineTo(cx + 20, cy - 120); ctx.lineTo(cx - 60, cy - 120); ctx.closePath(); ctx.fill();
    ctx.fillStyle = ac(0.6);
    ctx.beginPath(); ctx.moveTo(cx + 120, cy - 330); ctx.lineTo(cx + 40, cy - 330); ctx.lineTo(cx - 20, cy - 120); ctx.lineTo(cx + 60, cy - 120); ctx.closePath(); ctx.fill();
    // laurel
    for (let side of [-1, 1]) for (let i = 0; i < 11; i++) {
      const ang = Math.PI / 2 + side * (0.35 + i * 0.2), r = 205;
      const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r;
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang + side * 0.9);
      ctx.fillStyle = `rgba(232,200,120,${0.7 * E.outCubic(clamp((te - 0.5 - i * 0.05) / 0.4))})`;
      ctx.beginPath(); ctx.ellipse(0, 0, 18, 7, 0, 0, 7); ctx.fill(); ctx.restore();
    }
    const g = ctx.createRadialGradient(cx - 50, cy - 60, 20, cx, cy, 170);
    g.addColorStop(0, '#fff2c2'); g.addColorStop(0.5, '#e7b94d'); g.addColorStop(1, '#9c6b1e');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 165, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(120,80,20,0.6)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, 138, 0, 7); ctx.stroke();
    label('IMO', cx, cy + 22, { font: F.serif(96, false), color: 'rgba(90,58,12,0.92)', align: 'center', spacing: 2 });
    label('2025', cx, cy + 70, { font: F.mono(700, 24), color: 'rgba(90,58,12,0.8)', align: 'center', spacing: 8 });
    // glint
    const gx = lerp(cx - 260, cx + 260, E.inOutCubic(seg(te, 1.0, 1.8)));
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, 165, 0, 7); ctx.clip();
    const gl = ctx.createLinearGradient(gx - 60, cy - 100, gx + 60, cy + 100);
    gl.addColorStop(0, 'rgba(255,255,255,0)'); gl.addColorStop(0.5, 'rgba(255,255,255,0.55)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl; ctx.fillRect(cx - 200, cy - 200, 400, 400); ctx.restore();
    ctx.restore();
  };

  V.idea2 = (s, te, tout) => {
    const a = fadeIO(te, 0, tout);
    const ox = 230, oy = 640, w = 760, h = 400;
    ctx.save(); ctx.globalAlpha = a;
    const ax = E.outCubic(seg(te, 0.1, 0.7));
    ctx.strokeStyle = wh(0.5); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + w * ax, oy); ctx.stroke();
    const ay = E.outCubic(seg(te, 1.6, 2.3));
    ctx.strokeStyle = ac(0.9);
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox, oy - h * ay); ctx.stroke();
    label('TRAINING COMPUTE  →', ox + w, oy + 44, { font: F.mono(500, 20), color: wh(0.6), align: 'right', spacing: 4, alpha: ax });
    ctx.save(); ctx.translate(ox - 30, oy); ctx.rotate(-Math.PI / 2);
    label('THINKING TIME  →', 0, 0, { font: F.mono(600, 20), color: ac(1), spacing: 4, alpha: ay }); ctx.restore();
    // path: first along x, then bending upward
    const p1 = E.inOutCubic(seg(te, 0.3, 1.6)), p2 = E.inOutCubic(seg(te, 1.8, 3.6));
    ctx.lineWidth = 4; ctx.strokeStyle = wh(0.85); ctx.beginPath(); ctx.moveTo(ox, oy - 20);
    ctx.lineTo(ox + 420 * p1, oy - 20 - 30 * p1); ctx.stroke();
    let hx = ox + 420 * p1, hy = oy - 20 - 30 * p1;
    if (p2 > 0) {
      ctx.strokeStyle = ac(1); ctx.beginPath(); ctx.moveTo(hx, hy);
      const N = 40;
      for (let i = 1; i <= N * p2; i++) {
        const u = i / N; const x = ox + 420 + u * 300, y = oy - 50 - Math.pow(u, 1.6) * 300;
        ctx.lineTo(x, y); hx = x; hy = y;
      }
      ctx.stroke();
    }
    glowDot(hx, hy, 50, 0.9); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx, hy, 7, 0, 7); ctx.fill();
    label('2023: BIGGER MODELS', ox + 20, oy - 60, { font: F.mono(500, 18), color: wh(0.65), spacing: 3, alpha: E.outCubic(seg(te, 0.8, 1.3)) });
    label('2024 →: LONGER THINKING', ox + 470, oy - 360, { font: F.mono(600, 18), color: ac(1), spacing: 3, alpha: E.outCubic(seg(te, 2.8, 3.3)) });
    ctx.restore();
    // text on the right for this idea
    const kin = E.outExpo(clamp((te - 0.2) / 0.7)), kout = tout >= 0 ? E.inCubic(clamp(tout / 0.3)) : 0;
    label(s.kicker, 1160, 330, { font: F.mono(600, 26), color: ac(1), spacing: 10, alpha: kin * (1 - kout) });
    const tl = wrap(s.title, F.sans(900, 84), 620);
    kinetic(tl, 1160, 440, { font: F.sans(900, 84), size: 84, lh: 90, color: 'rgba(250,248,255,ALPHA)', te: te - 0.35, tout, spacing: -2.5 });
    const sl = wrap(s.sub, F.serif(38), 600);
    kinetic(sl, 1160, 440 + tl.length * 90 + 20, { font: F.serif(38), size: 38, lh: 46, color: 'rgba(196,194,212,ALPHA)', te: te - 0.9, tout, stagger: 0.03 });
  };

  // ACT III ------------------------------------------------------------
  V.desktop = (s, te, tout) => {
    const a = fadeIO(te, 0, tout);
    const x0 = 1000, y0 = 290, w = 740, h = 470;
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(18,19,28,0.92)'; roundRect(x0, y0, w, h, 16); ctx.fill();
    ctx.strokeStyle = wh(0.14); ctx.lineWidth = 1.5; ctx.stroke();
    ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x0 + 26 + i * 22, y0 + 24, 7, 0, 7); ctx.fill(); });
    ctx.fillStyle = wh(0.05); ctx.fillRect(x0, y0 + 48, 170, h - 48);
    for (let i = 0; i < 6; i++) { ctx.fillStyle = wh(i === 1 ? 0.25 : 0.1); roundRect(x0 + 22, y0 + 76 + i * 40, 120 - (i * 17) % 40, 12, 6); ctx.fill(); }
    const fx = x0 + 210;
    const fields = [{ y: y0 + 100, label: 'Name', text: 'Ada Lovelace' }, { y: y0 + 190, label: 'Email', text: 'ada@example.com' }, { y: y0 + 280, label: 'Plan', text: 'Team' }];
    const steps = [0.5, 1.3, 2.1, 2.9]; // arrive at field 1..3, then button
    fields.forEach((f, i) => {
      label(f.label.toUpperCase(), fx, f.y - 12, { font: F.mono(500, 14), color: wh(0.45), spacing: 3 });
      ctx.strokeStyle = te > steps[i] ? ac(0.9) : wh(0.2); ctx.lineWidth = 2; roundRect(fx, f.y, 480, 50, 10); ctx.stroke();
      typewriter(f.text, fx + 16, f.y + 33, (te - steps[i] - 0.1) / 0.035, { font: F.mono(400, 20), color: wh(0.9), spacing: 0 });
    });
    const btn = { x: fx, y: y0 + 380, w: 200, h: 54 };
    const clicked = te > steps[3] + 0.15;
    ctx.fillStyle = clicked ? ac(1) : wh(0.12); roundRect(btn.x, btn.y, btn.w, btn.h, 12); ctx.fill();
    label(clicked ? 'DONE ✓' : 'SUBMIT', btn.x + btn.w / 2, btn.y + 35, { font: F.mono(700, 18), color: clicked ? '#05060a' : wh(0.8), align: 'center', spacing: 4 });
    // cursor path
    const pts = [[x0 + w + 120, y0 + h + 60], [fx + 60, fields[0].y + 30], [fx + 60, fields[1].y + 30], [fx + 60, fields[2].y + 30], [btn.x + 110, btn.y + 32]];
    let seg_i = 0; while (seg_i < 4 && te > steps[seg_i]) seg_i++;
    const t0 = seg_i === 0 ? 0 : steps[seg_i - 1] + 0.2, t1 = steps[Math.min(seg_i, 3)];
    const k = seg_i >= 4 ? 1 : E.inOutCubic(clamp((te - t0) / Math.max(0.01, t1 - t0)));
    const from = pts[seg_i], to = pts[Math.min(seg_i + 1, 4)];
    const cxp = seg_i >= 4 ? pts[4][0] : lerp(from[0], to[0], k), cyp = seg_i >= 4 ? pts[4][1] : lerp(from[1], to[1], k);
    steps.forEach(st => { const r = te - st; if (r > 0 && r < 0.5) { ctx.strokeStyle = ac(1 - r / 0.5); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cxp, cyp, 10 + r * 90, 0, 7); ctx.stroke(); } });
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#05060a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cxp, cyp); ctx.lineTo(cxp, cyp + 34); ctx.lineTo(cxp + 9, cyp + 26); ctx.lineTo(cxp + 16, cyp + 40); ctx.lineTo(cxp + 22, cyp + 37); ctx.lineTo(cxp + 15, cyp + 24); ctx.lineTo(cxp + 26, cyp + 24); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  };

  V.hub = (s, te, tout) => {
    const a = fadeIO(te, 0, tout), cx = 1380, cy = 530;
    const nodes = ['FILES', 'CODE', 'DATABASE', 'BROWSER', 'CALENDAR', 'EMAIL', 'SEARCH', 'DESIGN'];
    ctx.save(); ctx.globalAlpha = a;
    nodes.forEach((n, i) => {
      const ang = -Math.PI / 2 + i / nodes.length * Math.PI * 2;
      const R = 290, x = cx + Math.cos(ang) * R * 1.12, y = cy + Math.sin(ang) * R * 0.86;
      const k = E.outCubic(clamp((te - 0.3 - i * BEAT * 0.5) / 0.5));
      if (k <= 0) return;
      ctx.strokeStyle = ac(0.55); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(lerp(cx, x, k), lerp(cy, y, k)); ctx.stroke();
      const ph = ((te * 0.9 + i * 0.37) % 1);
      if (k >= 1) { const inward = i % 2; const u = inward ? 1 - ph : ph; glowDot(lerp(cx, x, u), lerp(cy, y, u), 16, 0.9); }
      ctx.globalAlpha = a * k;
      ctx.fillStyle = 'rgba(12,13,20,0.95)'; roundRect(x - 78, y - 24, 156, 48, 24); ctx.fill();
      ctx.strokeStyle = ac(0.8); ctx.stroke();
      label(n, x, y + 7, { font: F.mono(600, 16), color: wh(0.9), align: 'center', spacing: 3 });
      ctx.globalAlpha = a;
    });
    glowDot(cx, cy, 150, 0.45 + 0.4 * PULSE);
    ctx.fillStyle = ac(1); ctx.beginPath(); ctx.arc(cx, cy, 70, 0, 7); ctx.fill();
    label('MCP', cx, cy + 12, { font: F.mono(800, 34), color: '#05060a', align: 'center', spacing: 2 });
    ctx.restore();
  };

  V.terminal = (s, te, tout) => {
    const a = fadeIO(te, 0, tout);
    const x0 = 1000, y0 = 290, w = 760, h = 470;
    const lines = [
      ['$ ', 'claude', 0],
      ['> ', 'fix the failing checkout tests', 1],
      ['● ', 'Reading 14 files', 2],
      ['● ', 'Editing src/cart/total.ts', 2],
      ['● ', 'Running test suite…', 2],
      ['✓ ', '42 passed, 0 failed', 3],
    ];
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(10,11,17,0.95)'; roundRect(x0, y0, w, h, 16); ctx.fill();
    ctx.strokeStyle = ac(0.35); ctx.lineWidth = 1.5; ctx.stroke();
    label('~/shop — agent', x0 + w / 2, y0 + 30, { font: F.mono(500, 16), color: wh(0.4), align: 'center', spacing: 2 });
    ctx.fillStyle = wh(0.08); ctx.fillRect(x0, y0 + 48, w, 1);
    lines.forEach(([pre, txt, kind], i) => {
      const st = 0.25 + i * BEAT;
      if (te < st) return;
      const y = y0 + 110 + i * 56;
      const col = kind === 3 ? ac(1) : kind === 2 ? wh(0.6) : wh(0.95);
      label(pre, x0 + 36, y, { font: F.mono(700, 24), color: kind === 0 ? wh(0.5) : ac(1), spacing: 0 });
      typewriter(txt, x0 + 70, y, (te - st) / 0.022, { font: F.mono(kind === 3 ? 700 : 400, 24), color: col, spacing: 0 });
    });
    if (Math.floor(te / (BEAT / 2)) % 2 === 0) { ctx.fillStyle = ac(0.9); ctx.fillRect(x0 + 36, y0 + 110 + 6 * 56 - 22, 14, 26); }
    ctx.restore();
  };

  V.trio = (s, te, tout) => {
    // headline centered at top
    const kin = E.outExpo(clamp(te / 0.7)), kout = tout >= 0 ? E.inCubic(clamp(tout / 0.3)) : 0;
    label(s.date, CX, 190, { font: F.mono(600, 26), color: ac(1), align: 'center', spacing: 8, alpha: kin * (1 - kout) });
    kinetic([s.title], CX, 290, { font: F.sans(800, 80), size: 80, lh: 88, align: 'center', color: 'rgba(246,244,252,ALPHA)', te: te - 0.1, tout, spacing: -1.5 });
    const cards = [['NOV 12', 'GPT-5.1', 'OPENAI'], ['NOV 18', 'Gemini 3', 'GOOGLE'], ['NOV 24', 'Claude Opus 4.5', 'ANTHROPIC']];
    cards.forEach(([d, n, m], i) => {
      const st = i * BAR + 0.02, r = te - st;
      if (r < 0) return;
      const k = E.outExpo(clamp(r / 0.45));
      const x = CX + (i - 1) * 440, y = 640;
      const out = tout >= 0 ? E.inCubic(clamp((tout - i * 0.04) / 0.3)) : 0;
      ctx.save(); ctx.globalAlpha = k * (1 - out);
      ctx.translate(x, y); const sc = lerp(1.35, 1, k); ctx.scale(sc, sc);
      ctx.fillStyle = 'rgba(14,15,22,0.92)'; roundRect(-190, -190, 380, 380, 22); ctx.fill();
      const pk = ['trio_openai', 'trio_google', 'trio_anthropic'][i], hasP = !!IMG[pk];
      if (hasP) { portrait(pk, -190, -190, 380, 380, 1, 22); }
      ctx.strokeStyle = ac(0.25 + 0.6 * Math.exp(-r / 0.4)); ctx.lineWidth = 2; roundRect(-190, -190, 380, 380, 22); ctx.stroke();
      if (hasP) {                                   // photo card: date chip on top, name over the shade
        ctx.fillStyle = 'rgba(4,5,10,0.7)'; roundRect(-166, -166, 136, 42, 21); ctx.fill();
        label(d, -98, -137, { font: F.mono(700, 20), color: ac(1), align: 'center', spacing: 3 });
        const nl = wrap(n, F.sans(800, 44), 330);
        nl.forEach((ln, j) => label(ln, -160, 118 - (nl.length - 1 - j) * 48, { font: F.sans(800, 44), color: '#ffffff', spacing: -1 }));
        label(m, -160, 160, { font: F.mono(600, 17), color: wh(0.75), spacing: 5 });
      } else {
        label(d, -150, -120, { font: F.mono(600, 26), color: ac(1), spacing: 6 });
        const nl = wrap(n, F.sans(800, 58), 310);
        nl.forEach((ln, j) => label(ln, -150, -10 + j * 64 - (nl.length - 1) * 20, { font: F.sans(800, 58), color: '#ffffff', spacing: -1.5 }));
        label(m, -150, 150, { font: F.mono(500, 20), color: wh(0.55), spacing: 6 });
      }
      ctx.restore();
      const fl = Math.exp(-r / 0.12) * 0.35 * (1 - out);
      if (fl > 0.01) { ctx.fillStyle = ac(fl); ctx.fillRect(0, 0, W, H); }
    });
  };

  V.swe = (s, te, tout) => {
    const a = fadeIO(te, 0, tout);
    const x0 = 1010, x1 = 1760, y = 580;
    const k = E.outCubic(seg(te, 0.4, 2.4)), v = 80.9 * k;
    ctx.save(); ctx.globalAlpha = a;
    label(v.toFixed(1) + '%', x0 - 8, y - 70, { font: F.sans(900, 170), color: '#ffffff', spacing: -6 });
    ctx.fillStyle = wh(0.08); roundRect(x0, y, x1 - x0, 26, 13); ctx.fill();
    const g = ctx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, ac(0.5)); g.addColorStop(1, ac(1));
    ctx.fillStyle = g; roundRect(x0, y, (x1 - x0) * v / 100, 26, 13); ctx.fill();
    const mx = x0 + (x1 - x0) * 0.8;
    ctx.fillStyle = wh(0.8); ctx.fillRect(mx - 1, y - 18, 2, 62);
    label('80%', mx, y + 80, { font: F.mono(600, 20), color: wh(0.8), align: 'center', spacing: 2 });
    if (k > 0.99) glowDot(x0 + (x1 - x0) * v / 100, y + 13, 60, 0.8 * (0.6 + 0.4 * PULSE));
    label('SWE-BENCH VERIFIED', x0, y + 150, { font: F.mono(600, 22), color: ac(1), spacing: 8 });
    ctx.restore();
  };

  V.agents = (s, te, tout) => {
    const a = fadeIO(te, 0, tout);
    const tasks = ['Plan the migration', 'Read 212 files', 'Write the tests', 'Refactor billing module', 'Run the eval suite', 'Fix 3 regressions', 'Open pull request', 'Address review comments', 'Update the docs', 'Deploy to staging', 'Monitor the rollout', 'Write the summary'];
    const x0 = 1000, y0 = 250, rowH = 62, vis = 7;
    const speed = 2.3; // rows per second
    const pos = te * speed;
    ctx.save(); ctx.globalAlpha = a;
    ctx.beginPath(); ctx.rect(x0 - 20, y0, 820, rowH * vis); ctx.clip();
    for (let i = 0; i < tasks.length + vis; i++) {
      const y = y0 + (i - pos + 3) * rowH;
      if (y < y0 - rowH || y > y0 + rowH * vis) continue;
      const doneK = clamp(pos - i + 0.2, 0, 1);
      const nm = tasks[i % tasks.length];
      ctx.strokeStyle = doneK > 0 ? ac(1) : wh(0.3); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x0 + 16, y + 30, 14, 0, 7); ctx.stroke();
      if (doneK > 0) { ctx.fillStyle = ac(0.9); ctx.beginPath(); ctx.arc(x0 + 16, y + 30, 14, 0, 7); ctx.fill(); ctx.strokeStyle = '#05060a'; ctx.lineWidth = 3; check(x0 + 16, y + 30, 14, doneK); }
      label(nm, x0 + 52, y + 38, { font: F.mono(doneK > 0 ? 400 : 600, 24), color: doneK > 0 ? wh(0.45) : wh(0.95), spacing: 0 });
      label(`#${String(i + 1).padStart(3, '0')}`, x0 + 760, y + 38, { font: F.mono(400, 18), color: wh(0.3), align: 'right', spacing: 2 });
    }
    ctx.restore();
    ctx.save(); ctx.globalAlpha = a;
    const edge = ctx.createLinearGradient(0, y0, 0, y0 + rowH * vis);
    edge.addColorStop(0, 'rgba(4,5,10,1)'); edge.addColorStop(0.2, 'rgba(4,5,10,0)'); edge.addColorStop(0.8, 'rgba(4,5,10,0)'); edge.addColorStop(1, 'rgba(4,5,10,1)');
    ctx.fillStyle = edge; ctx.fillRect(x0 - 20, y0, 820, rowH * vis);
    label('AUTONOMOUS  ·  STEP ' + String(Math.floor(pos * 37 + 120)).padStart(4, '0'), x0, y0 + rowH * vis + 60, { font: F.mono(600, 20), color: ac(1), spacing: 5 });
    ctx.restore();
  };

  V.idea3 = (s, te, tout) => {
    const a = fadeIO(te, 0, tout), cx = CX, cy = 400;
    const m = E.inOutCubic(seg(te, 0.9, 1.6));
    ctx.save(); ctx.globalAlpha = a;
    // question bubble
    ctx.save(); ctx.globalAlpha = a * (1 - m);
    ctx.strokeStyle = wh(0.85); ctx.lineWidth = 4;
    roundRect(cx - 130, cy - 100, 260, 170, 40); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 60, cy + 70); ctx.lineTo(cx - 90, cy + 120); ctx.lineTo(cx - 20, cy + 70); ctx.stroke();
    label('?', cx, cy + 34, { font: F.sans(900, 120), color: '#ffffff', align: 'center', spacing: 0 });
    ctx.restore();
    // becomes a row of completed actions
    for (let i = 0; i < 4; i++) {
      const k = E.outBack(clamp((te - 1.3 - i * BEAT) / 0.45));
      if (k <= 0) continue;
      const x = cx + (i - 1.5) * 150;
      ctx.save(); ctx.translate(x, cy); ctx.scale(k, k);
      ctx.fillStyle = ac(1); ctx.beginPath(); ctx.arc(0, 0, 48, 0, 7); ctx.fill();
      ctx.strokeStyle = '#05060a'; ctx.lineWidth = 7; check(0, 2, 42, clamp((te - 1.45 - i * BEAT) / 0.3));
      ctx.restore();
      if (i < 3 && k > 0.9) { ctx.fillStyle = ac(0.4); ctx.fillRect(x + 58, cy - 1, 34, 2); }
    }
    ctx.restore();
    ideaText(s, te - 0.9, tout);
  };

  // ACT IV -------------------------------------------------------------
  V.price = (s, te, tout) => {
    const kin = E.outExpo(clamp(te / 0.7)), kout = tout >= 0 ? E.inCubic(clamp(tout / 0.35)) : 0;
    const al = kin * (1 - kout);
    label(s.kicker, CX, 210, { font: F.mono(600, 26), color: ac(1), align: 'center', spacing: 10, alpha: al });
    const k1 = E.inOutCubic(seg(te, 0.9, 1.9)), k2 = E.inOutCubic(seg(te, 2.5, 3.6));
    const v = k2 > 0 ? Math.exp(lerp(Math.log(5), Math.log(0.1), k2)) : Math.exp(lerp(Math.log(30), Math.log(5), k1));
    label('$' + v.toFixed(2), CX, 470, { font: F.sans(900, 230), color: '#ffffff', align: 'center', spacing: -8, alpha: al });
    label('LIST PRICE PER MILLION INPUT TOKENS, AT LAUNCH', CX, 540, { font: F.mono(500, 19), color: wh(0.5), align: 'center', spacing: 5, alpha: al });
    const bw = 1000, bx = CX - bw / 2;
    const rows = [['GPT-4', 'MAR 2023', 30, 0.3], ['GPT-4o', 'MAY 2024', 5, 1.9], ['GEMINI 2.0 FLASH', 'FEB 2025', 0.1, 3.6]];
    rows.forEach(([n, d, p, st], i) => {
      const y = 630 + i * 70, show = E.outCubic(clamp((te - st) / 0.5));
      if (show <= 0) return;
      const last = i === 2;
      label(n + '   ' + d, bx, y, { font: F.mono(600, 20), color: last ? ac(1) : wh(0.8), spacing: 3, alpha: al * show });
      label('$' + p.toFixed(2), bx + bw, y, { font: F.mono(700, 20), color: last ? ac(1) : wh(0.8), align: 'right', spacing: 1, alpha: al * show });
      ctx.globalAlpha = al * show; ctx.fillStyle = last ? ac(1) : wh(0.7 - i * 0.15);
      ctx.fillRect(bx, y + 14, Math.max(5, bw * p / 30 * show), 9); ctx.globalAlpha = 1;
    });
    kinetic([s.title], CX, 930, { font: F.sans(900, 90), size: 90, lh: 96, align: 'center', color: (w, a) => (w.includes('300') ? ac(a) : `rgba(250,248,255,${a})`), te: te - 3.9, tout, spacing: -3 });
  };

  V.open = (s, te, tout) => {
    const kin = E.outExpo(clamp(te / 0.7)), kout = tout >= 0 ? E.inCubic(clamp(tout / 0.3)) : 0;
    label(s.kicker, 150, 250, { font: F.mono(600, 26), color: ac(1), spacing: 8, alpha: kin * (1 - kout) });
    kinetic([s.title], 150, 350, { font: F.sans(900, 92), size: 92, lh: 96, color: 'rgba(250,248,255,ALPHA)', te: te - 0.1, tout, spacing: -3 });
    const rows = [['JUL 2024', 'Llama 3.1', 405, '405B'], ['JAN 2025', 'DeepSeek-R1', 671, '671B'], ['AUG 2025', 'gpt-oss', 117, '117B'], ['APR 2026', 'DeepSeek-V4', 1600, '1.6T']];
    rows.forEach(([d, n, p, lab], i) => {
      const k = E.outExpo(clamp((te - 0.5 - i * BEAT) / 0.7));
      const out = tout >= 0 ? E.inCubic(clamp((tout - i * 0.03) / 0.3)) : 0;
      const y = 490 + i * 110, al = k * (1 - out);
      label(d, 150, y, { font: F.mono(500, 22), color: wh(0.5), spacing: 4, alpha: al });
      label(n, 360, y + 4, { font: F.sans(800, 48), color: '#ffffff', spacing: -1, alpha: al });
      const bw = 820 * p / 1600 * E.outCubic(clamp((te - 0.7 - i * BEAT) / 0.9));
      ctx.globalAlpha = al; ctx.fillStyle = ac(0.85); roundRect(820, y - 18, Math.max(2, bw), 20, 10); ctx.fill(); ctx.globalAlpha = 1;
      label(lab, 820 + bw + 20, y, { font: F.mono(700, 24), color: ac(1), spacing: 2, alpha: al });
    });
    label('PARAMETERS  ·  OPEN WEIGHTS', 820, 460 - 30, { font: F.mono(500, 18), color: wh(0.4), spacing: 5, alpha: kin * (1 - kout) });
  };

  V.users = (s, te, tout) => {
    const kin = E.outExpo(clamp(te / 0.7)), kout = tout >= 0 ? E.inCubic(clamp(tout / 0.3)) : 0;
    const al = kin * (1 - kout);
    // dot field
    const cols = 44, rows = 30, x0 = 1110, y0 = 300, gap = 15;
    const fill = E.inOutCubic(seg(te, 0.4, 3.8));
    ctx.save(); ctx.globalAlpha = al;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const idx = i * rows + j, on = idx < fill * cols * rows;
      ctx.fillStyle = on ? ac(0.35 + 0.5 * (((i * 7 + j * 3) % 11) / 11)) : wh(0.06);
      ctx.beginPath(); ctx.arc(x0 + i * gap, y0 + j * gap, on ? 3.2 : 2.2, 0, 7); ctx.fill();
    }
    ctx.restore();
    label(s.kicker, 150, 300, { font: F.mono(600, 26), color: ac(1), spacing: 8, alpha: al });
    kinetic([s.title], 150, 400, { font: F.sans(900, 92), size: 92, lh: 96, color: 'rgba(250,248,255,ALPHA)', te: te - 0.1, tout, spacing: -3 });
    const stats = [['800M', 'WEEKLY CHATGPT USERS', 'OCT 2025', 0.6], ['1B', 'MONTHLY GEMINI APP USERS', 'AUG 2026', 0.6 + BEAT * 2]];
    stats.forEach(([n, l, d, st], i) => {
      const k = E.outExpo(clamp((te - st) / 0.7)), y = 600 + i * 190;
      label(n, 150, y + (1 - k) * 30, { font: F.sans(900, 120), color: '#ffffff', spacing: -4, alpha: k * (1 - kout) });
      label(l, 150, y + 50, { font: F.mono(600, 20), color: ac(1), spacing: 5, alpha: k * (1 - kout) });
      label(d, 150, y + 80, { font: F.mono(400, 18), color: wh(0.45), spacing: 4, alpha: k * (1 - kout) });
    });
    label('ILLUSTRATIVE', x0, y0 + rows * gap + 20, { font: F.mono(400, 14), color: wh(0.25), spacing: 4, alpha: al });
  };

  V.racks = (s, te, tout) => {
    const a = fadeIO(te, 0, tout);
    const vx = 1400, vy = 400;
    ctx.save(); ctx.globalAlpha = a;
    const r = rng(8);
    for (let d = 9; d >= 0; d--) {
      const k = E.outCubic(clamp((te - 0.2 - (9 - d) * 0.12) / 0.5));
      if (k <= 0) continue;
      const sc = 1 / (1 + d * 0.32);
      for (const side of [-1, 1]) {
        const x = vx + side * (130 + 250 * sc) , w = 120 * sc, h = 420 * sc * k;
        const y = vy + 220 * sc - h;
        const rg = ctx.createLinearGradient(0, y, 0, y + h); rg.addColorStop(0, 'rgba(40,44,62,0.98)'); rg.addColorStop(1, 'rgba(16,18,28,0.98)');
        ctx.fillStyle = rg; ctx.fillRect(x - w / 2, y, w, h);
        ctx.strokeStyle = ac(0.35 + 0.4 * sc); ctx.lineWidth = 1.5; ctx.strokeRect(x - w / 2, y, w, h);
        for (let u = 0; u < 14; u++) {
          const ly = y + 12 * sc + u * (h - 24 * sc) / 14;
          const on = ((u * 7 + d * 3 + Math.floor(te / (BEAT / 2)) * (side + 2)) % 5) < 2;
          ctx.fillStyle = on ? ac(0.95) : wh(0.12);
          ctx.fillRect(x - w / 2 + 10 * sc, ly, 6 * sc, 3 * sc + 1);
          ctx.fillStyle = wh(0.07); ctx.fillRect(x - w / 2 + 22 * sc, ly, w - 34 * sc, 3 * sc + 1);
        }
      }
    }
    // floor lines
    ctx.strokeStyle = ac(0.2); ctx.lineWidth = 1;
    for (let i = -6; i <= 6; i++) { ctx.beginPath(); ctx.moveTo(vx, vy + 60); ctx.lineTo(vx + i * 220, 1000); ctx.stroke(); }
    const k = E.outExpo(clamp((te - 1.2) / 0.8));
    label('UP TO $500B', vx, 860, { font: F.sans(900, 88), color: '#ffffff', align: 'center', spacing: -2, alpha: k });
    ctx.restore();
  };

  V.nobel = (s, te, tout) => {
    const people = [['nobel_hopfield', 'John Hopfield', 'PHYSICS'], ['nobel_hinton', 'Geoffrey Hinton', 'PHYSICS'],
      ['nobel_baker', 'David Baker', 'CHEMISTRY'], ['nobel_hassabis', 'Demis Hassabis', 'CHEMISTRY'], ['nobel_jumper', 'John Jumper', 'CHEMISTRY']];
    if (people.every(p => IMG[p[0]])) {
      const kin = E.outExpo(clamp(te / 0.7)), kout = tout >= 0 ? E.inCubic(clamp(tout / 0.35)) : 0;
      label(s.date, 150, 200, { font: F.mono(600, 26), color: ac(1), spacing: 6, alpha: kin * (1 - kout) });
      kinetic([s.title], 150, 290, { font: F.sans(800, 76), size: 76, lh: 82, color: 'rgba(246,244,252,ALPHA)', te: te - 0.1, tout, spacing: -1.5 });
      const cw = 300, chh = 400, gap = 30, x0 = (W - (5 * cw + 4 * gap)) / 2, y0 = 420;
      [['PHYSICS  ·  NEURAL NETWORKS', 0, 2], ['CHEMISTRY  ·  PROTEINS', 2, 5]].forEach(([t, a, b], gi) => {
        const k = E.outExpo(clamp((te - 0.4 - gi * BEAT * 2) / 0.6)) * (1 - kout);
        const xa = x0 + a * (cw + gap), xb = x0 + b * (cw + gap) - gap;
        ctx.fillStyle = ac(0.8 * k); ctx.fillRect(xa, y0 - 26, (xb - xa) * k, 2);
        label(t, xa, y0 - 40, { font: F.mono(700, 18), color: ac(1), spacing: 5, alpha: k });
      });
      people.forEach(([key, name], i) => {
        const st = 0.5 + (i < 2 ? i : 2 * 2 * BEAT / 1 + (i - 2)) * 0.18 + (i >= 2 ? 0 : 0);
        const k = E.outCubic(clamp((te - (i < 2 ? 0.5 + i * 0.2 : 0.5 + BEAT * 2 + (i - 2) * 0.2)) / 0.7)) * (1 - kout);
        const x = x0 + i * (cw + gap);
        ctx.save(); ctx.globalAlpha = k; ctx.translate(0, (1 - k) * 30);
        portrait(key, x, y0, cw, chh, 1);
        label(name, x + 22, y0 + chh - 26, { font: F.sans(800, 30), color: '#ffffff', spacing: -0.5 });
        ctx.restore();
        const P = IMG[key]; if (P && P.credit && k > 0.5) CREDIT = ['Portraits via Wikimedia Commons (see end credits)', 1 - kout];
      });
      return;
    }
    const a = fadeIO(te, 0, tout);
    const meds = [[1150, 'PHYSICS', 'John Hopfield', 'Geoffrey Hinton', 'neural networks'], [1560, 'CHEMISTRY', 'Demis Hassabis', 'John Jumper', 'David Baker', 'protein structure']];
    ctx.save(); ctx.globalAlpha = a;
    meds.forEach((m, i) => {
      const [x, field, ...names] = m;
      const k = E.outBack(clamp((te - 0.2 - i * BEAT * 2) / 0.8));
      if (k <= 0) return;
      const y = 450;
      ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
      const g = ctx.createRadialGradient(-40, -50, 10, 0, 0, 150);
      g.addColorStop(0, '#fff2c2'); g.addColorStop(0.5, '#e2b24a'); g.addColorStop(1, '#8e5f18');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 135, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(110,70,16,0.6)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 112, 0, 7); ctx.stroke();
      label(field, 0, -8, { font: F.mono(700, 20), color: 'rgba(84,52,10,0.9)', align: 'center', spacing: 5 });
      label('2024', 0, 34, { font: F.serif(52, false), color: 'rgba(84,52,10,0.9)', align: 'center', spacing: 1 });
      ctx.restore();
      const nk = E.outCubic(clamp((te - 0.8 - i * BEAT * 2) / 0.6));
      const people = names.slice(0, -1), what = names[names.length - 1];
      people.forEach((p, j) => label(p, x, 650 + j * 44, { font: F.sans(700, 32), color: '#ffffff', align: 'center', spacing: -0.5, alpha: nk }));
      label(what.toUpperCase(), x, 650 + people.length * 44 + 12, { font: F.mono(500, 16), color: ac(1), align: 'center', spacing: 5, alpha: nk });
    });
    ctx.restore();
  };

  V.eu = (s, te, tout) => {
    const a = fadeIO(te, 0, tout), cx = 1380, cy = 530;
    ctx.save(); ctx.globalAlpha = a;
    for (let i = 0; i < 12; i++) {
      const k = E.outBack(clamp((te - 0.1 - i * 0.07) / 0.4));
      if (k <= 0) continue;
      const ang = -Math.PI / 2 + i / 12 * Math.PI * 2;
      ctx.save(); ctx.translate(cx + Math.cos(ang) * 190, cy + Math.sin(ang) * 190); ctx.scale(k, k);
      ctx.fillStyle = ac(1); star5(0, 0, 22); ctx.fill(); ctx.restore();
    }
    glowDot(cx, cy, 160, 0.25 + PULSE * 0.3);
    ctx.restore();
  };

  V.idea4 = (s, te, tout) => {
    const a = fadeIO(te, 0, tout), cx = CX, cy = 400;
    ctx.save(); ctx.globalAlpha = a;
    const r = rng(4);
    for (let i = 0; i < 260; i++) {
      const ang = r() * Math.PI * 2, sp = 0.25 + r() * 0.75, off = r();
      const ph = ((te * 0.32 * sp + off) % 1);
      const R = 20 + ph * 520, x = cx + Math.cos(ang) * R * 1.5, y = cy + Math.sin(ang) * R * 0.62;
      const al = Math.sin(ph * Math.PI) * E.outCubic(clamp(te / 0.8));
      ctx.fillStyle = ac(al * 0.9);
      ctx.beginPath(); ctx.arc(x, y, 1.5 + 2.5 * ph, 0, 7); ctx.fill();
    }
    glowDot(cx, cy, 190, 0.8 + 0.2 * PULSE);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, 16, 0, 7); ctx.fill();
    ctx.restore();
    ideaText(s, te - 0.5, tout);
  };

  // EPILOGUE -----------------------------------------------------------
  V.recap = (s, te, tout) => {
    const rows = [['01', 'SEE', 'one model, every sense', 1], ['02', 'THINK', 'intelligence scales with thinking', 2], ['03', 'ACT', 'from answering to doing', 3], ['04', 'SPREAD', 'cheap, open, and everywhere', 4], ['05', 'WEIGH', 'power raises the stakes', 5]];
    rows.forEach(([n, w, d, ai], i) => {
      const st = 0.2 + i * BEAT * 2, k = E.outExpo(clamp((te - st) / 0.8));
      const out = tout >= 0 ? E.inCubic(clamp((tout - i * 0.04) / 0.3)) : 0;
      const y = 280 + i * 136, al = k * (1 - out), c = acts[ai].rgb;
      label(n, 330, y - 10, { font: F.mono(600, 24), color: rgba(c, 1), spacing: 4, alpha: al });
      ctx.save(); ctx.beginPath(); ctx.rect(380, y - 100, 1400, 124); ctx.clip();
      label(w, 400, y + (1 - k) * 100, { font: F.sans(900, 100), color: '#ffffff', spacing: -3, alpha: al });
      ctx.restore();
      ctx.font = F.sans(900, 100); ctx.letterSpacing = '-3px';
      const ww = ctx.measureText(w).width; ctx.letterSpacing = '0px';
      label(d, 400 + ww + 40, y - 4, { font: F.serif(46), color: rgba(c, 1), spacing: 0, alpha: E.outExpo(clamp((te - st - 0.25) / 0.8)) * (1 - out) });
    });
  };

  V.then = (s, te, tout) => {
    const l1 = 'Three years ago, we asked AI questions.';
    const l2 = 'Now we hand it work.';
    const dim = E.inOutCubic(seg(te, 1.5 * BAR - 0.3, 1.5 * BAR + 0.4));
    kinetic([l1], CX, 490, { font: F.sans(800, 84), size: 84, lh: 90, align: 'center', color: (w, a) => `rgba(250,248,255,${a * lerp(1, 0.38, dim)})`, te, tout, spacing: -2 });
    kinetic([l2], CX, 610, { font: F.sans(800, 84), size: 84, lh: 90, align: 'center', color: 'rgba(255,226,184,ALPHA)', te: te - 1.5 * BAR, tout, spacing: -2 });
  };

  V.end = (s, te, tout) => {
    // the cursor from the prologue returns and types the last line
    const lines = TL.typing.filter(l => l.shot === 'end');
    const thirty2 = BEAT / 8, hit = (TL.titleHit - s.bar) * BAR;
    const collapse = E.inExpo(seg(te, hit - 0.55, hit));
    ctx.save();
    ctx.translate(CX, CY); ctx.scale(1 - collapse * 0.9, 1 - collapse * 0.9); ctx.translate(-CX, -CY);
    ctx.globalAlpha = 1 - collapse;
    let cursorAt = null, lastEnd = 0;
    lines.forEach((ln, i) => {
      const start = (ln.bar - s.bar) * BAR, n = (te - start) / thirty2;
      ctx.font = F.mono(500, 58); ctx.letterSpacing = '0px';
      const full = ctx.measureText(ln.text).width, x = CX - full / 2, y = 500 + i * 90;
      if (n > 0) {
        const txt = ln.text.slice(0, Math.min(ln.text.length, Math.floor(n)));
        label(txt, x, y, { font: F.mono(500, 58), color: i ? '#ffe2b8' : '#ffffff', spacing: 0 });
        ctx.font = F.mono(500, 58); cursorAt = [x + ctx.measureText(txt).width + 8, y];
      }
      lastEnd = start + ln.text.length * thirty2;
    });
    if (cursorAt && ((Math.floor(te / (BEAT / 2)) % 2 === 0) || te < lastEnd)) { ctx.fillStyle = '#ffffff'; ctx.fillRect(cursorAt[0], cursorAt[1] - 48, 26, 58); }
    ctx.restore();
    if (collapse > 0 && te < hit) glowDot(CX, CY, 40 + collapse * 260, collapse);
    const tt = te - hit;
    if (tt > 0) {
      const k = E.outExpo(clamp(tt / 1.8)), out = tout >= 0 ? E.inCubic(clamp(tout / 0.6)) : 0;
      ctx.save(); ctx.globalAlpha = k * (1 - out);
      ctx.font = F.sans(900, 170); const sp = lerp(70, 12, k); ctx.letterSpacing = sp + 'px'; ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff'; ctx.fillText('THREE YEARS', CX + sp / 2, 560);
      ctx.restore();
      label('SEPT 2023  —  SEPT 2026', CX, 650, { font: F.mono(500, 24), color: wh(0.6), align: 'center', spacing: 10, alpha: E.outExpo(clamp((tt - 0.5) / 1)) * (1 - out) });
      if (tt < 0.4) { ctx.fillStyle = `rgba(255,236,210,${(Math.exp(-tt / 0.15) * 0.7).toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
    }
  };

  V.sources = (s, te, tout) => {
    const k = E.outCubic(clamp(te / 0.6)), out = E.inCubic(seg(te, s.len * BAR - 1.1, s.len * BAR));
    const al = k * (1 - out);
    label('SOURCES', CX, 400, { font: F.mono(600, 20), color: wh(0.6), align: 'center', spacing: 10, alpha: al });
    const ls = [
      'Announcements from OpenAI, Google, Google DeepMind, Anthropic, Meta and DeepSeek; ARC Prize; METR;',
      'IEA, Energy and AI (2025); International AI Safety Report (2025); court filings; the Nobel Foundation;',
      'the European Commission; market data for Jan 27, 2025.',
      'Figures are as reported at the time. Animations are illustrative.',
    ];
    ls.forEach((l, i) => label(l, CX, 470 + i * 46, { font: F.serif(34), color: 'rgba(214,210,230,1)', align: 'center', spacing: 0, alpha: al }));
  };

  // ================= v2: recurring character, explainers, data, stakes =================

  /* The blinking cursor from the prologue, reborn on every act card. */
  function motif(id, te, x, y) {
    const k = E.outBack(clamp((te - 0.15) / 0.6));
    if (k <= 0 || !id || id > 5) return;
    ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
    const blink = Math.floor(te / (BEAT / 2)) % 2 === 0;
    ctx.lineWidth = 3; ctx.strokeStyle = ac(1); ctx.fillStyle = ac(1);
    if (id === 1) {                       // the cursor opens into an eye
      const o = E.inOutCubic(clamp((te - 0.35) / 0.5));
      ctx.beginPath(); ctx.moveTo(-44, 0); ctx.quadraticCurveTo(0, -38 * o, 44, 0); ctx.quadraticCurveTo(0, 38 * o, -44, 0); ctx.stroke();
      const hgt = lerp(40, 18, o);
      ctx.fillRect(-8, -hgt / 2, 16, hgt);
    } else if (id === 2) {                // the cursor, thinking
      ctx.fillRect(-52, -22, 16, 44);
      for (let i = 0; i < 3; i++) { const b = Math.max(0, Math.sin(te * 7 - i * 0.8)); ctx.beginPath(); ctx.arc(-6 + i * 24, 12 - b * 12, 6, 0, 7); ctx.fill(); }
    } else if (id === 3) {                // the cursor becomes a pointer, and clicks
      const c = (te % (BEAT * 2)) / (BEAT * 2);
      if (c < 0.35) { ctx.strokeStyle = ac(1 - c / 0.35); ctx.beginPath(); ctx.arc(-6, -16, 8 + c * 80, 0, 7); ctx.stroke(); }
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(-6, -16); ctx.lineTo(-6, 24); ctx.lineTo(4, 15); ctx.lineTo(11, 31); ctx.lineTo(18, 28); ctx.lineTo(11, 13); ctx.lineTo(23, 13); ctx.closePath(); ctx.fill();
    } else if (id === 4) {                // one cursor becomes many
      for (let j = 0; j < 3; j++) for (let i = 0; i < 11; i++) {
        const d = Math.hypot(i - 5, (j - 1) * 1.3), kk = clamp((te - 0.3 - d * 0.08) / 0.3);
        if (kk <= 0) continue;
        ctx.globalAlpha = kk * (d === 0 ? 1 : 0.5); ctx.fillRect((i - 5) * 26 - 5, (j - 1) * 30 - 10, 10, 20);
      }
    } else if (id === 5) {                // the cursor inside a warning sign, flickering
      ctx.globalAlpha = Math.sin(te * 23) > -0.3 ? 1 : 0.35;
      ctx.beginPath(); ctx.moveTo(0, -38); ctx.lineTo(42, 32); ctx.lineTo(-42, 32); ctx.closePath(); ctx.stroke();
      if (blink) ctx.fillRect(-5, -8, 10, 28);
    }
    ctx.restore();
  }

  V.roadmap = (s, te, tout) => {
    const out = tout >= 0 ? E.inCubic(clamp(tout / 0.35)) : 0;
    kinetic([s.title], CX, 330, { font: F.sans(800, 76), size: 76, lh: 80, align: 'center', color: 'rgba(246,244,252,ALPHA)', te, tout, spacing: -2 });
    for (let i = 1; i <= 5; i++) {
      const a = acts[i], k = E.outExpo(clamp((te - 0.45 - (i - 1) * BEAT * 0.75) / 0.7)), x = CX + (i - 3) * 320;
      const al = k * (1 - out);
      label(a.numeral, x, 575 + (1 - k) * 40, { font: F.serif(124, false), color: rgba(a.rgb, 1), align: 'center', spacing: 0, alpha: al });
      label(a.name, x + 4, 650, { font: F.mono(600, 22), color: wh(0.85), align: 'center', spacing: 8, alpha: al });
      ctx.fillStyle = rgba(a.rgb, 0.8 * al); ctx.fillRect(x - 30 * k, 680, 60 * k, 2);
    }
    label('One question: what actually changed?', CX, 800, { font: F.serif(48), color: 'rgba(214,210,232,1)', align: 'center', spacing: 0, alpha: E.outExpo(clamp((te - 0.45 - 4.5 * BEAT) / 0.8)) * (1 - out) });
  };

  /* HOW: image patches, sound slices and word pieces become one token stream. */
  V.howTokens = (s, te, tout) => {
    const a = fadeIO(te, 0, tout);
    ctx.save(); ctx.globalAlpha = a;
    const sx = 1030, colX = 1410, boxX = 1560;
    const pal = ['#26275a', '#473a86', '#a14f86', '#e2795e', '#f6b660', '#ffe4a8'];
    const toks = [];
    for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) toks.push({ m: 0, sx: sx + i * 36, sy: 300 + j * 36, c: pal[Math.min(5, j * 2 + ((i + j) % 2))] });
    for (let i = 0; i < 6; i++) toks.push({ m: 1, sx: sx + i * 26, sy: 520 });
    ['the', 'cat', 'sat'].forEach((w, i) => toks.push({ m: 2, sx: sx + i * 58, sy: 700, w }));
    const cut = E.outCubic(seg(te, 0.25, 0.9));
    const lab = (t, y) => label(t, sx, y, { font: F.mono(600, 16), color: wh(0.5), spacing: 4 });
    lab('IMAGE', 272); lab('SOUND', 470); lab('TEXT', 660);
    // source shapes
    ctx.globalAlpha = a * lerp(1, 0.28, E.inOutCubic(seg(te, 1.0, 2.2)));
    toks.forEach(t => {
      if (t.m === 0) { ctx.fillStyle = t.c; ctx.fillRect(t.sx + cut * 0, t.sy, 34 - cut * 4, 34 - cut * 4); }
      if (t.m === 1) {
        ctx.strokeStyle = ac(0.9); ctx.lineWidth = 2; ctx.beginPath();
        for (let u = 0; u <= 22; u++) { const x = t.sx + u, y = t.sy + Math.sin((t.sx + u) * 0.35) * 16 * Math.sin(u / 22 * Math.PI); u ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.stroke();
        if (cut > 0.2) { ctx.fillStyle = wh(0.5 * cut); ctx.fillRect(t.sx + 23, t.sy - 22, 1.5, 44); }
      }
      if (t.m === 2) { label(t.w, t.sx, t.sy + 8, { font: F.mono(600, 26), color: '#ffffff', spacing: 0 }); if (cut > 0.2) { ctx.strokeStyle = wh(0.35 * cut); ctx.lineWidth = 1.5; roundRect(t.sx - 6, t.sy - 20, 54, 38, 8); ctx.stroke(); } }
    });
    ctx.globalAlpha = a;
    // the model
    const bk = E.outCubic(seg(te, 0.6, 1.2));
    ctx.fillStyle = 'rgba(14,16,26,0.95)'; roundRect(boxX, 360, 200 * bk, 300, 20); ctx.fill();
    ctx.strokeStyle = ac(0.6 + 0.4 * PULSE); ctx.lineWidth = 2; ctx.stroke();
    if (bk > 0.9) {
      for (let r = 0; r < 5; r++) { ctx.fillStyle = ac(0.12 + 0.08 * ((r + Math.floor(te * 4)) % 3)); ctx.fillRect(boxX + 24, 400 + r * 44, 152, 26); }
      label('ONE MODEL', boxX + 100, 700, { font: F.mono(700, 18), color: ac(1), align: 'center', spacing: 5 });
    }
    // tokens fly into a single stream, then flow into the model
    toks.forEach((t, i) => {
      const st = 0.95 + i * 0.07, k = E.inOutCubic(clamp((te - st) / 0.6));
      if (k <= 0) return;
      const slot = i, ty = 262 + slot * 25.5;
      const flow = Math.max(0, te - 2.7 - slot * 0.06) * 240;
      let x = lerp(t.sx, colX, k) + flow, y = lerp(t.sy, ty, k) + Math.sin(k * Math.PI) * -30;
      const fade = clamp(1 - (x - boxX) / 40);
      if (fade <= 0) return;
      ctx.globalAlpha = a * fade;
      ctx.fillStyle = t.m === 0 ? t.c : t.m === 1 ? ac(0.95) : '#ffffff';
      roundRect(x - 11, y - 11, 22, 22, 5); ctx.fill();
      ctx.globalAlpha = a;
    });
    label('TOKENS', colX, 236, { font: F.mono(600, 16), color: wh(0.5), align: 'center', spacing: 4, alpha: E.outCubic(seg(te, 1.0, 1.5)) });
    ctx.restore();
  };

  /* HOW: many attempts, a verifier, and reinforcement of what worked. */
  V.howRL = (s, te, tout) => {
    const a = fadeIO(te, 0, tout);
    ctx.save(); ctx.globalAlpha = a;
    const px = 1050, py = 540, ax = 1520;
    const answers = ['408', '398', '408', '418', '408'];
    const ok = answers.map(v => v === '408');
    const rein = E.inOutCubic(seg(te, 3.0, 3.8));
    answers.forEach((v, i) => {
      const y = 330 + i * 105, st = 0.4 + i * 0.16, k = clamp((te - st) / 0.9);
      if (k <= 0) return;
      ctx.strokeStyle = ok[i] ? ac(lerp(0.55, 1, rein)) : wh(lerp(0.3, 0.06, rein));
      ctx.lineWidth = ok[i] ? lerp(2, 5, rein) : 1.6;
      const r = rng(i + 3); const wig = [r(), r(), r()].map(q => (q - 0.5) * 120);
      drawOn(() => { ctx.beginPath(); ctx.moveTo(px + 110, py); ctx.bezierCurveTo(px + 230, py + wig[0], ax - 220, y + wig[1], ax - 24, y); }, 700, k);
      if (k >= 1) label(v, ax, y + 10, { font: F.mono(700, 30), color: ok[i] ? '#ffffff' : wh(lerp(0.8, 0.3, rein)), spacing: 0 });
      const vk = E.outBack(clamp((te - 2.0 - i * 0.14) / 0.4));
      if (vk > 0) {
        ctx.save(); ctx.translate(ax + 130, y); ctx.scale(vk, vk);
        ctx.fillStyle = ok[i] ? ac(1) : 'rgba(255,90,100,0.25)'; ctx.beginPath(); ctx.arc(0, 0, 22, 0, 7); ctx.fill();
        ctx.strokeStyle = ok[i] ? '#05060a' : 'rgba(255,120,130,0.9)'; ctx.lineWidth = 4;
        if (ok[i]) check(0, 1, 20, 1); else { ctx.beginPath(); ctx.moveTo(-8, -8); ctx.lineTo(8, 8); ctx.moveTo(8, -8); ctx.lineTo(-8, 8); ctx.stroke(); }
        ctx.restore();
      }
    });
    label('VERIFIER', ax + 130, 262, { font: F.mono(600, 16), color: wh(0.55), align: 'center', spacing: 4, alpha: clamp((te - 1.9) / 0.4) });
    // problem card
    ctx.fillStyle = 'rgba(14,16,26,0.95)'; roundRect(px - 110, py - 56, 220, 112, 16); ctx.fill();
    ctx.strokeStyle = ac(0.7); ctx.lineWidth = 2; ctx.stroke();
    label('17 × 24 = ?', px, py + 12, { font: F.mono(700, 30), color: '#ffffff', align: 'center', spacing: 0 });
    label('PROBLEM', px, py - 76, { font: F.mono(600, 16), color: wh(0.55), align: 'center', spacing: 4 });
    // reinforcement loop back to the model
    if (rein > 0) {
      ctx.strokeStyle = ac(0.8 * rein); ctx.lineWidth = 2; ctx.setLineDash([6, 8]);
      ctx.beginPath(); ctx.moveTo(ax + 130, 800); ctx.bezierCurveTo(ax + 130, 900, px, 900, px, py + 70); ctx.stroke(); ctx.setLineDash([]);
      const u = (te * 0.6) % 1, q = 1 - u;
      const bx = q * q * q * (ax + 130) + 3 * q * q * u * (ax + 130) + 3 * q * u * u * px + u * u * u * px;
      const by = q * q * q * 800 + 3 * q * q * u * 900 + 3 * q * u * u * 900 + u * u * u * (py + 70);
      glowDot(bx, by, 22, rein);
      label('REINFORCE WHAT WORKED  ·  REPEAT × MILLIONS', (ax + 130 + px) / 2, 930, { font: F.mono(700, 18), color: ac(1), align: 'center', spacing: 4, alpha: rein });
    }
    ctx.restore();
  };

  /* HOW: observe → think → act → check, around and around. */
  V.howLoop = (s, te, tout) => {
    const a = fadeIO(te, 0, tout), cx = 1380, cy = 520, R = 200;
    ctx.save(); ctx.globalAlpha = a;
    const nodes = [['OBSERVE', -90], ['THINK', 0], ['ACT', 90], ['CHECK', 180]];
    const lapT = BEAT * 4, prog = Math.max(0, te - 0.6) / lapT;
    const ang = -Math.PI / 2 + prog * Math.PI * 2;
    const ring = E.outCubic(seg(te, 0.1, 0.8));
    ctx.strokeStyle = ac(0.25); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + ring * Math.PI * 2); ctx.stroke();
    if (te > 0.6) {
      ctx.strokeStyle = ac(0.9); ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(cx, cy, R, ang - 0.9, ang); ctx.stroke();
      glowDot(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R, 40, 1);
    }
    nodes.forEach(([n, d], i) => {
      const th = d * Math.PI / 180, x = cx + Math.cos(th) * R, y = cy + Math.sin(th) * R;
      const k = E.outBack(clamp((te - 0.2 - i * 0.15) / 0.5));
      if (k <= 0) return;
      let diff = ((ang - th) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const lit = te > 0.6 ? Math.exp(-diff / 0.5) : 0;
      ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
      ctx.fillStyle = lit > 0.3 ? ac(0.25 + 0.75 * lit) : 'rgba(14,16,26,0.95)';
      roundRect(-78, -26, 156, 52, 26); ctx.fill(); ctx.strokeStyle = ac(0.8); ctx.lineWidth = 2; ctx.stroke();
      label(n, 0, 7, { font: F.mono(700, 18), color: lit > 0.5 ? '#05060a' : wh(0.9), align: 'center', spacing: 4 });
      ctx.restore();
    });
    const lap = Math.floor(prog) + 1;
    label('AGENT', cx, cy - 4, { font: F.sans(900, 44), color: '#ffffff', align: 'center', spacing: 4, alpha: ring });
    label(te > 0.6 ? `LOOP ${lap}` : '', cx, cy + 34, { font: F.mono(600, 18), color: ac(1), align: 'center', spacing: 4 });
    ['TERMINAL', 'BROWSER', 'FILES', 'APIs'].forEach((t, i) => {
      const k = E.outExpo(clamp((te - 1.2 - i * BEAT * 0.5) / 0.6));
      const x = cx - 270 + i * 180, y = cy + R + 110;
      ctx.globalAlpha = a * k;
      ctx.strokeStyle = ac(0.5); ctx.lineWidth = 1.5; roundRect(x - 70, y - 22, 140, 44, 10); ctx.stroke();
      label(t, x, y + 6, { font: F.mono(600, 15), color: wh(0.8), align: 'center', spacing: 3 });
      ctx.globalAlpha = a;
    });
    label('TOOLS', cx, cy + R + 60, { font: F.mono(600, 14), color: wh(0.4), align: 'center', spacing: 5, alpha: clamp((te - 1.2) / 0.5) });
    ctx.restore();
  };

  /* DATA: METR task-completion time horizons (50% success), log scale. */
  V.metr = (s, te, tout) => {
    const kin = E.outExpo(clamp(te / 0.7)), kout = tout >= 0 ? E.inCubic(clamp(tout / 0.35)) : 0;
    const al = kin * (1 - kout);
    label(s.kicker, 150, 180, { font: F.mono(600, 24), color: ac(1), spacing: 8, alpha: al });
    kinetic([s.title], 150, 270, { font: F.sans(800, 70), size: 70, lh: 76, color: 'rgba(246,244,252,ALPHA)', te: te - 0.1, tout, spacing: -1.5 });
    kinetic([s.sub], 150, 330, { font: F.serif(36), size: 36, lh: 42, color: 'rgba(196,194,212,ALPHA)', te: te - 0.4, tout, stagger: 0.02 });
    const x0 = 290, x1 = 1680, y0 = 420, y1 = 880, Y0 = 2019, Y1 = 2026.4, LMAX = Math.log10(8 * 3600);
    const X = yr => lerp(x0, x1, (yr - Y0) / (Y1 - Y0)), Yv = sec => lerp(y1, y0, Math.log10(sec) / LMAX);
    ctx.save(); ctx.globalAlpha = al;
    const gk = E.outCubic(seg(te, 0.2, 0.9));
    [[1, '1 sec'], [10, '10 sec'], [60, '1 min'], [600, '10 min'], [3600, '1 hour'], [8 * 3600, '8 hours']].forEach(([v, l]) => {
      ctx.fillStyle = wh(0.08); ctx.fillRect(x0, Yv(v), (x1 - x0) * gk, 1);
      label(l, x0 - 16, Yv(v) + 6, { font: F.mono(500, 16), color: wh(0.45), align: 'right', spacing: 1 });
    });
    for (let yr = 2019; yr <= 2026; yr++) label(String(yr), X(yr), y1 + 36, { font: F.mono(500, 16), color: wh(0.45), align: 'center', spacing: 2, alpha: gk });
    const pts = [['GPT-2', 2019.13, 2, '2 sec'], ['GPT-3', 2020.45, 9, '9 sec'], ['GPT-4', 2023.2, 240, '~4 min'], ['Claude 3.7 Sonnet', 2025.15, 59 * 60, '59 min'], ['Claude Opus 4.5', 2025.9, 4 * 3600 + 49 * 60, '~4 h 49 min']];
    // exponential trend through the points (least squares on log2)
    const n = pts.length, mx = pts.reduce((q, p) => q + p[1], 0) / n, my = pts.reduce((q, p) => q + Math.log2(p[2]), 0) / n;
    const slope = pts.reduce((q, p) => q + (p[1] - mx) * (Math.log2(p[2]) - my), 0) / pts.reduce((q, p) => q + (p[1] - mx) ** 2, 0);
    const fit = yr => Math.pow(2, my + slope * (yr - mx));
    const tk = E.inOutCubic(seg(te, 3.4, 5.0));
    if (tk > 0) {
      ctx.setLineDash([10, 10]); ctx.strokeStyle = ac(0.55); ctx.lineWidth = 2; ctx.beginPath();
      for (let yr = 2019; yr <= lerp(2019, 2026.3, tk); yr += 0.05) { const v = Math.min(fit(yr), 8 * 3600); yr === 2019 ? ctx.moveTo(X(yr), Yv(v)) : ctx.lineTo(X(yr), Yv(v)); }
      ctx.stroke(); ctx.setLineDash([]);
    }
    pts.forEach(([nm, yr, sec, lab], i) => {
      const st = 0.7 + i * BEAT * 0.9, k = E.outBack(clamp((te - st) / 0.5));
      if (k <= 0) return;
      const x = X(yr), y = Yv(sec), last = i === n - 1;
      glowDot(x, y, 34 * k, last ? 0.9 : 0.5);
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, 7 * k, 0, 7); ctx.fill();
      const below = i === n - 2, lx = last || below ? x - 22 : x + 20, al2 = clamp((te - st - 0.15) / 0.4);
      const dy = below ? 44 : 0, al_ = last || below ? 'right' : 'left';
      label(nm, lx, y - 14 + dy, { font: F.sans(700, 24), color: '#ffffff', align: al_, spacing: -0.5, alpha: al2 });
      label(lab, lx, y + 14 + dy, { font: F.mono(700, 18), color: ac(1), align: al_, spacing: 1, alpha: al2 });
    });
    const dk = E.outExpo(clamp((te - 5.0) / 0.8));
    if (dk > 0) {
      ctx.globalAlpha = al * dk;
      ctx.fillStyle = ac(0.15); roundRect(x0 + 40, y0 + 20, 560, 86, 14); ctx.fill();
      label('DOUBLING ≈ EVERY 7 MONTHS', x0 + 70, y0 + 58, { font: F.mono(700, 22), color: ac(1), spacing: 3 });
      label('2019–2024, and faster since', x0 + 70, y0 + 90, { font: F.serif(28), color: 'rgba(220,216,236,1)', spacing: 0 });
    }
    ctx.restore();
  };

  // ACT V: STAKES ------------------------------------------------------
  V.energy = (s, te, tout) => {
    const a = fadeIO(te, 0, tout);
    const base = 800, hPer = 0.48, bw = 170;
    ctx.save(); ctx.globalAlpha = a;
    const bars = [['2024', 415, 0.4, '415 TWh'], ['2030', 945, 1.5, '~945 TWh']];
    // Japan reference line, just under 945
    const jk = E.outCubic(seg(te, 2.6, 3.2)), jy = base - 925 * hPer;
    ctx.setLineDash([8, 8]); ctx.strokeStyle = wh(0.55 * jk); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(1040, jy); ctx.lineTo(1040 + 700 * jk, jy); ctx.stroke(); ctx.setLineDash([]);
    label("≈ JAPAN'S TOTAL ELECTRICITY USE TODAY", 1040, jy + 30, { font: F.mono(600, 16), color: wh(0.7), spacing: 3, alpha: jk });
    bars.forEach(([yr, v, st, lab], i) => {
      const k = E.outCubic(clamp((te - st) / 1.1)), h = v * hPer * k, x = 1150 + i * 330;
      const g = ctx.createLinearGradient(0, base - h, 0, base);
      g.addColorStop(0, i ? ac(1) : wh(0.6)); g.addColorStop(1, i ? ac(0.3) : wh(0.15));
      ctx.fillStyle = g; ctx.fillRect(x, base - h, bw, h);
      label(lab, x + bw / 2, base - h - 20, { font: F.sans(800, 44), color: '#ffffff', align: 'center', spacing: -1, alpha: clamp((te - st) / 0.4) });
      label(yr + (i ? '  (PROJECTED)' : ''), x + bw / 2, base + 40, { font: F.mono(600, 18), color: i ? ac(1) : wh(0.6), align: 'center', spacing: 3, alpha: clamp((te - st) / 0.4) });
    });
    ctx.fillStyle = wh(0.3); ctx.fillRect(1100, base, 620, 2);
    // lightning bolt
    const bk = E.outBack(clamp((te - 0.2) / 0.5));
    ctx.save(); ctx.translate(1720, 330); ctx.scale(bk, bk); ctx.fillStyle = ac(1);
    ctx.beginPath(); ctx.moveTo(8, -46); ctx.lineTo(-22, 6); ctx.lineTo(0, 6); ctx.lineTo(-8, 46); ctx.lineTo(24, -8); ctx.lineTo(2, -8); ctx.closePath(); ctx.fill(); ctx.restore();
    label('GLOBAL DATA-CENTRE ELECTRICITY', 1100, base + 90, { font: F.mono(500, 15), color: wh(0.4), spacing: 4 });
    ctx.restore();
  };

  V.court = (s, te, tout) => {
    const a = fadeIO(te, 0, tout);
    ctx.save(); ctx.globalAlpha = a;
    const card = (x, y, w, h, k, lines) => {
      ctx.save(); ctx.globalAlpha = a * k; ctx.translate(0, (1 - k) * 40);
      ctx.fillStyle = 'rgba(16,17,26,0.96)'; roundRect(x, y, w, h, 16); ctx.fill();
      ctx.strokeStyle = wh(0.18); ctx.lineWidth = 1.5; ctx.stroke();
      lines.forEach(([t, f, c, dy]) => label(t, x + 32, y + dy, { font: f, color: c, spacing: f.includes('Mono') ? 3 : -0.5 }));
      ctx.restore();
    };
    card(1010, 280, 560, 190, E.outExpo(clamp((te - 0.2) / 0.7)), [
      ['FILED DEC 2023', F.mono(600, 16), ac(1), 44],
      ['The New York Times', F.sans(800, 36), '#ffffff', 96],
      ['v. OpenAI & Microsoft', F.sans(500, 30), wh(0.8), 140],
    ]);
    const k2 = E.outExpo(clamp((te - 0.2 - BEAT * 2) / 0.7));
    card(1160, 520, 600, 250, k2, [
      ['SETTLED 2025  ·  APPROVED 2026', F.mono(600, 16), ac(1), 44],
      ['Bartz v. Anthropic', F.sans(800, 36), '#ffffff', 96],
      ['~500,000 books', F.sans(500, 30), wh(0.8), 140],
    ]);
    const sk = E.outBack(clamp((te - 0.35 - BEAT * 3) / 0.45));
    if (sk > 0) {
      ctx.save(); ctx.translate(1600, 700); ctx.rotate(-0.08); ctx.scale(lerp(1.6, 1, sk), lerp(1.6, 1, sk)); ctx.globalAlpha = a * clamp(sk);
      ctx.strokeStyle = ac(1); ctx.lineWidth = 4; roundRect(-120, -44, 240, 88, 12); ctx.stroke();
      label('$1.5B', 0, 22, { font: F.sans(900, 62), color: ac(1), align: 'center', spacing: -2 });
      ctx.restore();
    }
    ctx.restore();
  };

  V.fake = (s, te, tout) => {
    const a = fadeIO(te, 0, tout), cx = 1380, cy = 530;
    ctx.save(); ctx.globalAlpha = a;
    const stamp = E.outBack(clamp((te - 1.9) / 0.4));
    const glitch = stamp > 0 ? 1 : 0;
    ctx.fillStyle = 'rgba(16,17,26,0.96)'; roundRect(cx - 210, cy - 290, 420, 580, 44); ctx.fill();
    ctx.strokeStyle = wh(0.2); ctx.lineWidth = 2; ctx.stroke();
    label('INCOMING CALL', cx, cy - 200, { font: F.mono(600, 18), color: wh(0.55), align: 'center', spacing: 5 });
    label('"President Biden"', cx, cy - 140, { font: F.sans(800, 38), color: '#ffffff', align: 'center', spacing: -1 });
    label('NEW HAMPSHIRE  ·  JAN 2024', cx, cy - 100, { font: F.mono(500, 15), color: wh(0.45), align: 'center', spacing: 3 });
    const r = rng(Math.floor(te * 30));
    for (let i = 0; i < 40; i++) {
      const h = (Math.abs(Math.sin(i * 0.7 + te * 8)) * 0.7 + 0.3 * Math.abs(Math.sin(i * 0.31 - te * 3))) * 110;
      const off = glitch && r() < 0.25 ? (r() - 0.5) * 40 : 0;
      ctx.fillStyle = glitch && r() < 0.3 ? ac(0.9) : wh(0.8);
      ctx.fillRect(cx - 180 + i * 9 + off, cy + 30 - h / 2, 5, h);
    }
    ['#ff5f57', '#28c840'].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx - 90 + i * 180, cy + 210, 36, 0, 7); ctx.fill(); });
    if (stamp > 0) {
      ctx.save(); ctx.translate(cx, cy + 20); ctx.rotate(-0.14); const sc = lerp(1.8, 1, clamp(stamp)); ctx.scale(sc, sc);
      ctx.globalAlpha = a * clamp(stamp);
      ctx.fillStyle = 'rgba(4,5,10,0.75)'; roundRect(-230, -52, 460, 104, 12); ctx.fill();
      ctx.strokeStyle = ac(1); ctx.lineWidth = 5; ctx.stroke();
      label('SYNTHETIC VOICE', 0, 16, { font: F.mono(800, 38), color: ac(1), align: 'center', spacing: 4 });
      ctx.restore();
      const fl = Math.exp(-(te - 1.9) / 0.12) * 0.25;
      if (fl > 0.01) { ctx.fillStyle = ac(fl); ctx.fillRect(0, 0, W, H); }
    }
    ctx.restore();
  };

  V.rules = (s, te, tout) => {
    const a = fadeIO(te, 0, tout);
    const docs = [['AUG 2024', 'EU AI Act enters into force', 'THE FIRST BROAD AI LAW'], ['JAN 2025', 'International AI Safety Report', '96 EXPERTS  ·  30 COUNTRIES'], ['JAN 2026', "Claude's new constitution", 'A MODEL’S VALUES, PUBLISHED']];
    ctx.save(); ctx.globalAlpha = a;
    docs.forEach(([d, t, sub], i) => {
      const k = E.outExpo(clamp((te - 0.25 - i * BEAT * 1.5) / 0.7));
      if (k <= 0) return;
      const x = 1030 + i * 30, y = 290 + i * 170;
      ctx.save(); ctx.globalAlpha = a * k; ctx.translate((1 - k) * 80, 0);
      ctx.fillStyle = 'rgba(16,17,26,0.96)'; roundRect(x, y, 680, 140, 16); ctx.fill();
      ctx.strokeStyle = ac(0.45); ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = ac(1); ctx.fillRect(x, y + 20, 4, 100);
      label(d, x + 34, y + 44, { font: F.mono(700, 18), color: ac(1), spacing: 4 });
      label(t, x + 34, y + 88, { font: F.sans(800, 34), color: '#ffffff', spacing: -0.5 });
      label(sub, x + 34, y + 120, { font: F.mono(500, 14), color: wh(0.5), spacing: 3 });
      ctx.restore();
    });
    ctx.restore();
  };

  /* SHIFT 05: a balance that never quite settles. */
  V.idea5 = (s, te, tout) => {
    const a = fadeIO(te, 0, tout), cx = CX, cy = 250;
    ctx.save(); ctx.globalAlpha = a;
    const k = E.outCubic(seg(te, 0.1, 0.8));
    const tilt = 0.16 * Math.sin(te * 1.3) * k;
    ctx.strokeStyle = wh(0.85); ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + 380 * k); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 90, cy + 380 * k); ctx.lineTo(cx + 90, cy + 380 * k); ctx.stroke();
    const L = 330 * k, ex = Math.cos(tilt) * L, ey = Math.sin(tilt) * L;
    ctx.beginPath(); ctx.moveTo(cx - ex, cy - ey); ctx.lineTo(cx + ex, cy + ey); ctx.stroke();
    glowDot(cx, cy, 40, 0.8);
    [[-1, 'CAPABILITY'], [1, 'CARE']].forEach(([sd, t]) => {
      const px = cx + sd * ex, py = cy + sd * ey;
      ctx.strokeStyle = wh(0.5); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - 70, py + 120); ctx.moveTo(px, py); ctx.lineTo(px + 70, py + 120); ctx.stroke();
      ctx.strokeStyle = sd < 0 ? ac(1) : wh(0.85); ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(px - 90, py + 120); ctx.quadraticCurveTo(px, py + 170, px + 90, py + 120); ctx.stroke();
      label(t, px, py + 210, { font: F.mono(700, 20), color: sd < 0 ? ac(1) : wh(0.85), align: 'center', spacing: 6, alpha: k });
    });
    ctx.restore();
    ideaText(s, te - 0.6, tout, 800);
  };

  // ---------- HUD ----------
  let lastM = 0;
  function drawHUD(t, si, act) {
    const s = shots[si];
    const show = act.id >= 1 && act.id <= 4 ? 1 : 0;
    const k = E.inOutCubic(seg(t, acts[1].bar * BAR - 0.3, acts[1].bar * BAR + 0.6)) * (1 - E.inOutCubic(seg(t, acts[6].bar * BAR - 0.6, acts[6].bar * BAR)));
    if (k <= 0.001) return;
    ctx.save(); ctx.globalAlpha = k;
    label('THREE YEARS', 150, 92, { font: F.mono(600, 18), color: wh(0.55), spacing: 6 });
    label(`${act.numeral || ''}  ·  ${act.name}`, W - 150, 92, { font: F.mono(600, 18), color: ac(0.95), align: 'right', spacing: 6 });
    // beat dots
    const beatIdx = Math.floor(t / BEAT) % 4;
    for (let i = 0; i < 4; i++) { ctx.fillStyle = i === beatIdx ? ac(0.9) : wh(0.15); ctx.beginPath(); ctx.arc(W - 150 - 76 + i * 22, 118, 3.2, 0, 7); ctx.fill(); }
    // timeline
    const x0 = 150, x1 = W - 150, y = 990;
    ctx.fillStyle = wh(0.16); ctx.fillRect(x0, y, x1 - x0, 1);
    const mx = m => lerp(x0, x1, m / 36);
    [['2024', 4], ['2025', 16], ['2026', 28]].forEach(([yr, m]) => {
      ctx.fillStyle = wh(0.35); ctx.fillRect(mx(m), y - 8, 1, 17);
      label(yr, mx(m) + 10, y + 32, { font: F.mono(500, 16), color: wh(0.4), spacing: 3 });
    });
    for (let m = 0; m <= 36; m++) { ctx.fillStyle = wh(0.18); ctx.fillRect(mx(m), y - 3, 1, 7); }
    // playhead eases from previous dated shot to this one
    let cur = null, prev = null;
    for (let i = si; i >= 0; i--) if (shots[i].m !== undefined) { if (!cur) cur = shots[i]; else { prev = shots[i]; break; } }
    if (cur) {
      const lt = t - cur.bar * BAR;
      const from = prev ? prev.m : cur.m;
      const m = lerp(from, cur.m, E.inOutCubic(clamp(lt / 0.9)));
      ctx.fillStyle = ac(0.9); ctx.fillRect(x0, y - 1, mx(m) - x0, 3);
      glowDot(mx(m), y, 28, 0.8);
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(mx(m), y, 5, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  // ---------- main ----------
  function render(t, frameNo = 0) {
    T = t;
    const bar = t / BAR, act = actAt(bar);
    A = accentAt(t);
    const beatPhase = (t % BEAT) / BEAT;
    PULSE = Math.exp(-beatPhase * BEAT / 0.16) * INTENSITY[act.id];
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.textAlign = 'left'; ctx.letterSpacing = '0px'; ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    drawBackground(t, act);
    const si = shotAt(t), s = shots[si];
    const te = t - s.bar * BAR, dur = s.len * BAR;
    const tout = te - (dur - 0.42);
    // gentle push-in per shot
    const z = 1 + 0.022 * E.inOutSine(clamp(te / dur));
    ctx.save();
    ctx.translate(CX, CY); ctx.scale(z, z); ctx.translate(-CX, -CY);
    CREDIT = null;
    const pkey = s.photo, pmode = pkey && IMG[pkey] ? (s.photoMode || 'full') : null;
    if (pmode) photoPlate(pkey, te, dur, pmode);
    if (pmode === 'full' && s.overlay) { if (s.overlay in V) V[s.overlay](s, te, tout >= 0 ? tout : -1); }
    else if (s.vis in V && pmode !== 'full') V[s.vis](s, te, tout >= 0 && s.vis !== 'sources' && s.vis !== 'end' ? tout : (s.vis === 'end' && tout >= 0 ? tout : -1));
    if (s.title && (s.date || s.explain) && !s.selfText && !["trio", "metr"].includes(s.vis)) eventText(s, te, tout >= 0 ? tout : -1);
    ctx.restore();
    drawHUD(t, si, act);
    drawCredit();
    drawFinish(t, frameNo);
    // global fade in / out
    const fin = seg(t, 0, 0.6), fout = 1 - seg(t, DURATION - 0.9, DURATION);
    const k = Math.min(fin, fout);
    if (k < 1) { ctx.fillStyle = `rgba(0,0,0,${(1 - k).toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
  }

  window.FILM = { render, DURATION, BAR, BEAT, IMG };
  window.ready = Promise.all([
    document.fonts.load(F.sans(900, 40)), document.fonts.load(F.sans(800, 40)), document.fonts.load(F.sans(700, 40)),
    document.fonts.load(F.serif(40)), document.fonts.load(F.serif(40, false)),
    document.fonts.load(F.mono(400, 20)), document.fonts.load(F.mono(700, 20)),
  ].concat(photoLoads)).then(() => document.fonts.ready).then(() => { render(0); return true; });
})();
