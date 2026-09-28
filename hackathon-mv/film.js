/* 让 AI 做出下一步决定 — a cyanotype music video. Every frame is a pure function of time T. */
(() => {
  const LY = window.LY;
  const W = 1920, H = 1080, CX = W / 2, CY = H / 2;
  const cv = document.getElementById('c');
  const ctx = cv.getContext('2d');
  const BEAT = 60 / LY.bpm;

  // ---------- math ----------
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const E = {
    outExpo: k => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)),
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
  const rgba = (h, a) => { const c = hex(h); return `rgba(${c[0]},${c[1]},${c[2]},${clamp(a).toFixed(3)})`; };

  // ---------- palette: cyanotype blues, paper white, one warm accent ----------
  const C = {
    ink: '#050f26', navy: '#0a2656', blue: '#1d4f96', mid: '#3b78c4', sky: '#9cc8f0',
    paper: '#eaf1f6', glow: '#cfe8ff', gold: '#ffc86b', red: '#ff7a5c',
  };

  // ---------- fonts ----------
  const F = {
    serif: (w, s) => `${w} ${s}px "Noto Serif SC"`,
    sans: (w, s) => `${w} ${s}px "Noto Sans SC"`,
    brush: s => `400 ${s}px "Ma Shan Zheng"`,
    en: s => `italic 400 ${s}px "Instrument Serif"`,
    mono: (w, s) => `${w} ${s}px "JetBrains Mono", "Noto Sans SC"`,
    lat: (w, s) => `${w} ${s}px "Inter Tight"`,
  };

  // ---------- assets ----------
  const IMG = {}, BLUR = {};
  const PHOTOS = ['lobby', 'pitch', 'demo', 'group', 'sheet'];
  const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  function offscreen(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  let GRAIN = [], BLOT = null, STARS = [];
  function buildTextures() {
    const r = rng(7);
    for (let n = 0; n < 4; n++) {
      const g = offscreen(960, 540), gx = g.getContext('2d'), id = gx.createImageData(960, 540);
      for (let i = 0; i < id.data.length; i += 4) { const v = 128 + (r() + r() + r() - 1.5) * 120; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
      gx.putImageData(id, 0, 0); GRAIN.push(g);
    }
    BLOT = offscreen(96, 54); const bx = BLOT.getContext('2d'), bd = bx.createImageData(96, 54);
    for (let i = 0; i < bd.data.length; i += 4) { const v = 110 + r() * 110; bd.data[i] = bd.data[i + 1] = bd.data[i + 2] = v; bd.data[i + 3] = 255; }
    bx.putImageData(bd, 0, 0);
    for (let i = 0; i < 260; i++) STARS.push({ x: r() * W, y: r() * H, s: 0.6 + r() * 2.2, ph: r() * 6.28, sp: 0.6 + r() * 2 });
    for (const k of PHOTOS) {
      const b = offscreen(960, 540), bx2 = b.getContext('2d');
      bx2.filter = 'blur(14px)'; coverDraw(bx2, IMG[k], 0, 0, 960, 540, 1.08, 0.5, 0.5); BLUR[k] = b;
    }
  }

  // ---------- drawing helpers ----------
  function coverDraw(c, img, x, y, w, h, zoom = 1, fx = 0.5, fy = 0.5) {
    const s = Math.max(w / img.width, h / img.height) * zoom, iw = img.width * s, ih = img.height * s;
    const ox = clamp(x + w / 2 - fx * iw, x + w - iw, x), oy = clamp(y + h / 2 - fy * ih, y + h - ih, y);
    c.drawImage(img, ox, oy, iw, ih);
  }
  // Ken Burns: zoom and focus drift over k.
  function kenBurns(c, key, k, z0, z1, f0, f1) {
    const e = E.inOutSine(k);
    coverDraw(c, IMG[key], 0, 0, W, H, lerp(z0, z1, e), lerp(f0[0], f1[0], e), lerp(f0[1], f1[1], e));
  }
  function vignette(c, a = 0.55) {
    const g = c.createRadialGradient(CX, CY, H * 0.35, CX, CY, H * 1.05);
    g.addColorStop(0, 'rgba(5,15,38,0)'); g.addColorStop(1, `rgba(5,15,38,${a})`);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }
  function bg(c, T, o = {}) {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, o.top || C.navy); g.addColorStop(1, o.bottom || C.ink);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const rg = c.createRadialGradient(o.gx ?? CX, o.gy ?? CY * 0.9, 0, o.gx ?? CX, o.gy ?? CY * 0.9, H * 0.9);
    rg.addColorStop(0, rgba(C.mid, o.glow ?? 0.35)); rg.addColorStop(1, rgba(C.mid, 0));
    c.fillStyle = rg; c.fillRect(0, 0, W, H);
    c.save(); c.globalAlpha = 0.22; c.globalCompositeOperation = 'multiply'; c.imageSmoothingEnabled = true;
    c.drawImage(BLOT, -40 + Math.sin(T * 0.05) * 30, -30, W + 80, H + 60); c.restore();
    if (o.grid !== false) {
      c.save(); c.strokeStyle = rgba(C.sky, 0.06); c.lineWidth = 1; const off = (T * 6) % 60;
      c.beginPath();
      for (let x = -off; x < W; x += 60) { c.moveTo(x, 0); c.lineTo(x, H); }
      for (let y = -off * 0.5; y < H; y += 60) { c.moveTo(0, y); c.lineTo(W, y); }
      c.stroke(); c.restore();
    }
  }
  function stars(c, T, a = 1, n = STARS.length) {
    c.save();
    for (let i = 0; i < n; i++) {
      const s = STARS[i], tw = 0.5 + 0.5 * Math.sin(T * s.sp + s.ph);
      c.fillStyle = rgba(C.glow, a * (0.25 + 0.75 * tw) * 0.8);
      c.beginPath(); c.arc(s.x, s.y, s.s, 0, 6.283); c.fill();
    }
    c.restore();
  }
  function txt(c, s, x, y, o = {}) {
    c.save();
    c.font = o.f || F.sans(500, 32); c.textAlign = o.align || 'center'; c.textBaseline = o.base || 'alphabetic';
    c.globalAlpha = o.alpha ?? 1;
    if (o.ls) c.letterSpacing = o.ls + 'px';
    if (o.glow) { c.shadowColor = o.glowCol || rgba(C.sky, 0.9); c.shadowBlur = o.glow; }
    if (o.stroke) { c.lineWidth = o.stroke; c.strokeStyle = o.strokeCol || C.ink; c.lineJoin = 'round'; c.strokeText(s, x, y); }
    c.fillStyle = o.fill || C.paper; c.fillText(s, x, y);
    c.restore();
  }
  function measure(c, s, f, ls = 0) { c.save(); c.font = f; if (ls) c.letterSpacing = ls + 'px'; const w = c.measureText(s).width; c.restore(); return w; }
  // Text revealed left to right (brush writing, karaoke).
  function revealTxt(c, s, x, y, p, o = {}) {
    const w = measure(c, s, o.f, o.ls), x0 = o.align === 'left' ? x : x - w / 2;
    if (o.dim !== undefined) txt(c, s, x, y, { ...o, alpha: (o.alpha ?? 1) * o.dim, glow: 0 });
    c.save(); c.beginPath(); c.rect(x0 - 40, y - 400, p >= 1 ? w + 80 : 40 + w * clamp(p), 800); c.clip();
    txt(c, s, x, y, o); c.restore();
  }
  function rrect(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
  function panel(c, x, y, w, h, o = {}) {
    c.save();
    c.shadowColor = 'rgba(0,8,24,0.55)'; c.shadowBlur = o.shadow ?? 40; c.shadowOffsetY = 16;
    rrect(c, x, y, w, h, o.r ?? 18); c.fillStyle = o.fill || rgba(C.paper, 0.96); c.fill();
    c.shadowColor = 'transparent';
    if (o.stroke) { c.lineWidth = 2; c.strokeStyle = o.stroke; c.stroke(); }
    c.restore();
  }
  // A photo printed on paper: white border, slight tilt, drop shadow.
  function print(c, key, cx, cy, w, rot = 0, a = 1, o = {}) {
    const img = IMG[key], h = o.h || w * img.height / img.width, b = o.border ?? 18;
    c.save(); c.globalAlpha = a; c.translate(cx, cy); c.rotate(rot);
    c.shadowColor = 'rgba(0,6,20,0.6)'; c.shadowBlur = 50; c.shadowOffsetY = 20;
    c.fillStyle = '#f2f6f8'; c.fillRect(-w / 2 - b, -h / 2 - b, w + 2 * b, h + 2 * b + (o.caption ? 46 : 0));
    c.shadowColor = 'transparent';
    c.beginPath(); c.rect(-w / 2, -h / 2, w, h); c.clip();
    coverDraw(c, img, -w / 2, -h / 2, w, h, o.zoom || 1, o.fx ?? 0.5, o.fy ?? 0.5);
    c.restore();
    if (o.caption) {
      c.save(); c.globalAlpha = a; c.translate(cx, cy); c.rotate(rot);
      txt(c, o.caption, 0, h / 2 + b + 30, { f: F.brush(34), fill: C.blue }); c.restore();
    }
  }
  function flash(c, a, col = C.glow) { if (a <= 0) return; c.save(); c.globalAlpha = clamp(a); c.fillStyle = col; c.fillRect(0, 0, W, H); c.restore(); }
  function glowDot(c, x, y, r, col, a = 1) {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(col, a)); g.addColorStop(0.35, rgba(col, a * 0.35)); g.addColorStop(1, rgba(col, 0));
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill();
  }
  function beatPulse(T, sharp = 6) { const ph = ((T - LY.beat0) / BEAT) % 1; return Math.exp(-sharp * (ph < 0 ? ph + 1 : ph)); }

  // ---------- procedural motifs ----------
  // Pseudo QR code (decorative), 25x25 modules.
  const QR = (() => {
    const n = 25, m = [], r = rng(404);
    for (let y = 0; y < n; y++) { m.push([]); for (let x = 0; x < n; x++) m[y].push(r() < 0.5 ? 1 : 0); }
    const finder = (ox, oy) => { for (let y = -1; y < 8; y++) for (let x = -1; x < 8; x++) {
      const X = ox + x, Y = oy + y; if (X < 0 || Y < 0 || X >= n || Y >= n) continue;
      const d = Math.max(Math.abs(x - 3), Math.abs(y - 3)); m[Y][X] = (d === 3 || d <= 1) ? 1 : 0; } };
    finder(0, 0); finder(n - 7, 0); finder(0, n - 7);
    for (let i = 8; i < n - 8; i++) { m[6][i] = m[i][6] = i % 2 ? 0 : 1; }
    return m;
  })();
  function drawQR(c, cx, cy, size, a = 1, reveal = 1) {
    const n = 25, s = size / n;
    c.save(); c.globalAlpha = a;
    c.fillStyle = C.paper; rrect(c, cx - size / 2 - s * 2, cy - size / 2 - s * 2, size + s * 4, size + s * 4, s * 1.5); c.fill();
    c.fillStyle = C.navy;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (!QR[y][x]) continue;
      const d = Math.hypot(x - 12, y - 12) / 17; if (d > reveal) continue;
      c.fillRect(cx - size / 2 + x * s, cy - size / 2 + y * s, s + 0.5, s + 0.5);
    }
    c.restore();
  }
  // Circuit traces radiating from a square chip, as on the cover.
  function makeTraces(seed, count, hs, reach) {
    const r = rng(seed), out = [];
    for (let i = 0; i < count; i++) {
      const side = i % 4, u = (r() - 0.5) * 2 * hs * 0.9;
      let x = side === 0 ? u : side === 1 ? hs : side === 2 ? u : -hs;
      let y = side === 0 ? -hs : side === 1 ? u : side === 2 ? hs : u;
      const dir = [[0, -1], [1, 0], [0, 1], [-1, 0]][side];
      const pts = [[x, y]], L = reach * (0.35 + r() * 0.65);
      let len = 0, d = dir.slice(), turns = 0;
      while (len < L && turns < 5) {
        const stepL = 30 + r() * 120; x += d[0] * stepL; y += d[1] * stepL; len += stepL * Math.hypot(d[0], d[1]); pts.push([x, y]); turns++;
        const side2 = r() < 0.5 ? 1 : -1;
        if (d[0] && d[1]) d = dir.slice(); else d = [dir[0] + (dir[0] ? 0 : side2), dir[1] + (dir[1] ? 0 : side2)];
      }
      let tot = 0; const cum = [0];
      for (let j = 1; j < pts.length; j++) { tot += Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]); cum.push(tot); }
      out.push({ pts, cum, tot, pad: r() < 0.6, chip: r() < 0.12, ph: r(), sp: 0.3 + r() * 0.5 });
    }
    return out;
  }
  function pointAt(tr, dist) {
    for (let j = 1; j < tr.pts.length; j++) if (dist <= tr.cum[j]) {
      const k = (dist - tr.cum[j - 1]) / (tr.cum[j] - tr.cum[j - 1] || 1);
      return [lerp(tr.pts[j - 1][0], tr.pts[j][0], k), lerp(tr.pts[j - 1][1], tr.pts[j][1], k)];
    }
    return tr.pts[tr.pts.length - 1];
  }
  const TRACES = makeTraces(11, 72, 150, 720);
  function circuit(c, cx, cy, grow, T, a = 1, scale = 1, traces = TRACES) {
    c.save(); c.translate(cx, cy); c.scale(scale, scale); c.lineCap = 'round'; c.lineJoin = 'round';
    for (const tr of traces) {
      const L = tr.tot * clamp(grow * 1.15 - tr.ph * 0.15);
      if (L <= 0) continue;
      c.strokeStyle = rgba(C.sky, 0.55 * a); c.lineWidth = 2.2 / scale;
      c.beginPath(); c.moveTo(tr.pts[0][0], tr.pts[0][1]);
      for (let j = 1; j < tr.pts.length; j++) {
        if (tr.cum[j] <= L) c.lineTo(tr.pts[j][0], tr.pts[j][1]);
        else { const p = pointAt(tr, L); c.lineTo(p[0], p[1]); break; }
      }
      c.stroke();
      if (L >= tr.tot - 1) {
        const e = tr.pts[tr.pts.length - 1];
        if (tr.chip) { c.fillStyle = rgba(C.sky, 0.8 * a); c.fillRect(e[0] - 16, e[1] - 11, 32, 22); c.strokeStyle = rgba(C.glow, a); c.strokeRect(e[0] - 16, e[1] - 11, 32, 22); }
        else if (tr.pad) { c.strokeStyle = rgba(C.glow, 0.9 * a); c.lineWidth = 2; c.beginPath(); c.arc(e[0], e[1], 5, 0, 6.283); c.stroke(); }
      }
      // Signal pulse travelling outward.
      const pd = ((T * tr.sp + tr.ph) % 1) * tr.tot;
      if (pd < L) { const p = pointAt(tr, pd); glowDot(c, p[0], p[1], 16, C.glow, 0.9 * a); }
    }
    c.restore();
  }
  // Hangzhou skyline: West Lake hills, Leifeng Pagoda, towers.
  const SKY = (() => {
    const r = rng(2026), towers = [];
    let x = 980; while (x < W + 60) { const w = 50 + r() * 90, h = 120 + r() * 300; towers.push({ x, w, h, win: r() }); x += w + 6 + r() * 30; }
    return towers;
  })();
  function skyline(c, base, T, o = {}) {
    const col = o.col || C.ink;
    c.save(); c.fillStyle = col;
    // hills
    c.beginPath(); c.moveTo(0, H);
    for (let x = 0; x <= W; x += 20) c.lineTo(x, base - 70 - 50 * Math.sin(x / 260) - 30 * Math.sin(x / 97 + 1) - (x < 900 ? 60 * Math.sin(x / 900 * Math.PI) : 0));
    c.lineTo(W, H); c.fill();
    // pagoda
    const px = o.px ?? 430, py = base - 150;
    for (let i = 0; i < 5; i++) {
      const tw = 120 - i * 18, th = 44, y = py - i * th;
      c.fillRect(px - tw / 2 + 8, y - th + 10, tw - 16, th - 10);
      c.beginPath(); c.moveTo(px - tw / 2 - 16, y - th + 12); c.lineTo(px + tw / 2 + 16, y - th + 12); c.lineTo(px + tw / 2 - 6, y - th + 2); c.lineTo(px - tw / 2 + 6, y - th + 2); c.fill();
    }
    c.fillRect(px - 3, py - 5 * 44 - 40, 6, 44);
    // towers
    for (const t of SKY) c.fillRect(t.x, base - t.h, t.w, t.h + 200);
    if (o.windows) {
      const r = rng(9);
      for (const t of SKY) for (let yy = base - t.h + 14; yy < base - 10; yy += 22) for (let xx = t.x + 8; xx < t.x + t.w - 10; xx += 18) {
        const on = r(); if (on > o.windows) continue;
        c.fillStyle = r() < 0.2 ? rgba(C.gold, 0.85) : rgba(C.sky, 0.7); c.fillRect(xx, yy, 8, 11);
      }
    }
    c.restore();
  }
  // Binary decision tree; one branch is chosen and lit.
  function decisionTree(c, x, y, len, ang, depth, grow, r, lit, a) {
    if (depth === 0 || grow <= 0) return;
    const g = clamp(grow * 6 - (6 - depth)); if (g <= 0) return;
    const x2 = x + Math.cos(ang) * len * g, y2 = y + Math.sin(ang) * len * g;
    c.strokeStyle = lit ? rgba(C.gold, a) : rgba(C.sky, 0.45 * a); c.lineWidth = lit ? 5 : 2 + depth * 0.4;
    if (lit) { c.shadowColor = C.gold; c.shadowBlur = 24; } else c.shadowBlur = 0;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke();
    c.shadowBlur = 0;
    c.fillStyle = lit ? C.gold : rgba(C.glow, 0.7 * a); c.beginPath(); c.arc(x2, y2, lit ? 7 : 4, 0, 6.283); c.fill();
    if (g < 1) return;
    const pick = r() < 0.5, spread = 0.38 + r() * 0.2;
    decisionTree(c, x2, y2, len * 0.74, ang - spread, depth - 1, grow, r, lit && pick, a);
    decisionTree(c, x2, y2, len * 0.74, ang + spread, depth - 1, grow, r, lit && !pick, a);
  }
  function envelope(c, x, y, w, rot, label, a = 1) {
    const h = w * 0.62;
    c.save(); c.translate(x, y); c.rotate(rot); c.globalAlpha = a;
    c.shadowColor = 'rgba(0,6,20,0.5)'; c.shadowBlur = 20; c.shadowOffsetY = 8;
    c.fillStyle = C.paper; c.fillRect(-w / 2, -h / 2, w, h); c.shadowColor = 'transparent';
    c.strokeStyle = rgba(C.blue, 0.6); c.lineWidth = 2;
    c.beginPath(); c.moveTo(-w / 2, -h / 2); c.lineTo(0, h * 0.08); c.lineTo(w / 2, -h / 2); c.stroke();
    c.fillStyle = C.gold; c.beginPath(); c.arc(0, h * 0.08, w * 0.06, 0, 6.283); c.fill();
    if (label) txt(c, label, 0, h * 0.36, { f: F.sans(700, w * 0.085), fill: C.navy });
    c.restore();
  }
  function hongbao(c, x, y, w, rot, a = 1) {
    const h = w * 1.45;
    c.save(); c.translate(x, y); c.rotate(rot); c.globalAlpha = a;
    c.shadowColor = 'rgba(0,6,20,0.5)'; c.shadowBlur = 18;
    rrect(c, -w / 2, -h / 2, w, h, w * 0.08); c.fillStyle = '#e8573f'; c.fill(); c.shadowColor = 'transparent';
    c.fillStyle = '#c9412c'; c.beginPath(); c.moveTo(-w / 2, -h / 2 + w * 0.08); c.quadraticCurveTo(0, -h / 2 + h * 0.36, w / 2, -h / 2 + w * 0.08); c.lineTo(w / 2, -h / 2); c.lineTo(-w / 2, -h / 2); c.fill();
    c.fillStyle = C.gold; c.beginPath(); c.arc(0, -h / 2 + h * 0.3, w * 0.16, 0, 6.283); c.fill();
    txt(c, '甜', 0, h * 0.26, { f: F.serif(900, w * 0.42), fill: C.gold });
    c.restore();
  }
  function avatar(c, x, y, r, label, col = C.mid) {
    c.save(); c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill();
    c.strokeStyle = C.paper; c.lineWidth = 3; c.stroke();
    txt(c, label, x, y + r * 0.36, { f: F.sans(700, r * 0.95), fill: C.paper }); c.restore();
  }
  function keyShape(c, x, y, s, rot, col, a = 1) {
    c.save(); c.translate(x, y); c.rotate(rot); c.scale(s, s); c.globalAlpha = a;
    c.strokeStyle = col; c.lineWidth = 7; c.lineCap = 'round';
    c.beginPath(); c.arc(-40, 0, 22, 0, 6.283); c.stroke();
    c.beginPath(); c.moveTo(-18, 0); c.lineTo(60, 0); c.moveTo(40, 0); c.lineTo(40, 16); c.moveTo(56, 0); c.lineTo(56, 12); c.stroke();
    c.restore();
  }
  function bubble(c, x, y, w, text, o = {}) {
    const h = o.h || 74, right = o.right;
    c.save(); c.globalAlpha = o.a ?? 1;
    rrect(c, x, y, w, h, 20); c.fillStyle = o.fill || C.paper; c.fill();
    c.beginPath();
    if (right) { c.moveTo(x + w - 8, y + 20); c.lineTo(x + w + 14, y + 28); c.lineTo(x + w - 8, y + 40); }
    else { c.moveTo(x + 8, y + 20); c.lineTo(x - 14, y + 28); c.lineTo(x + 8, y + 40); }
    c.fill();
    txt(c, text, x + 26, y + h / 2 + 12, { f: o.f || F.sans(500, 32), fill: o.col || C.navy, align: 'left' });
    c.restore();
  }
  function cup(c, x, y, s, T, kind, a = 1) {
    // Blueprint-style line drawing with dimension notes.
    c.save(); c.translate(x, y); c.scale(s, s); c.globalAlpha = a;
    c.strokeStyle = C.paper; c.lineWidth = 4; c.lineJoin = 'round'; c.lineCap = 'round';
    if (kind === 'tea') {
      c.beginPath(); c.moveTo(-90, -160); c.lineTo(90, -160); c.lineTo(70, 170); c.lineTo(-70, 170); c.closePath(); c.stroke();
      c.beginPath(); c.ellipse(0, -160, 100, 22, 0, 0, 6.283); c.stroke();
      c.beginPath(); c.moveTo(20, -160); c.lineTo(50, -300); c.lineTo(78, -296); c.lineTo(48, -160); c.stroke();
      c.fillStyle = rgba(C.sky, 0.25); c.beginPath(); c.moveTo(-84, -70); c.lineTo(84, -70); c.lineTo(70, 170); c.lineTo(-70, 170); c.fill();
      const r = rng(5);
      for (let i = 0; i < 22; i++) { const px = (r() - 0.5) * 120, py = 110 + r() * 50 - Math.max(0, Math.sin(T * 2 + i)) * 4; c.fillStyle = C.paper; c.beginPath(); c.arc(px, py, 10, 0, 6.283); c.fill(); }
      c.setLineDash([8, 8]); c.lineWidth = 2; c.strokeStyle = C.gold;
      c.beginPath(); c.moveTo(110, -70); c.lineTo(190, -70); c.moveTo(110, 170); c.lineTo(190, 170); c.moveTo(170, -70); c.lineTo(170, 170); c.stroke(); c.setLineDash([]);
      txt(c, '三分糖', 205, 40, { f: F.brush(56), fill: C.gold, align: 'left' });
      txt(c, 'SUGAR 30%', 205, 84, { f: F.mono(600, 22), fill: C.sky, align: 'left' });
    } else {
      c.beginPath(); c.moveTo(-110, -40); c.lineTo(110, -40); c.lineTo(90, 150); c.quadraticCurveTo(0, 175, -90, 150); c.closePath(); c.stroke();
      c.beginPath(); c.arc(135, 40, 45, -1.3, 1.3); c.stroke();
      c.beginPath(); c.ellipse(0, 175, 190, 26, 0, 0, 6.283); c.stroke();
      for (let i = 0; i < 3; i++) {
        c.beginPath(); const sx = -50 + i * 50;
        for (let j = 0; j <= 20; j++) { const yy = -60 - j * 9, xx = sx + Math.sin(j * 0.6 - T * 3 + i) * 12; j ? c.lineTo(xx, yy) : c.moveTo(xx, yy); }
        c.globalAlpha = a * 0.7; c.stroke(); c.globalAlpha = a;
      }
      txt(c, '提神', -230, 60, { f: F.brush(56), fill: C.gold, align: 'right' });
      txt(c, 'CAFFEINE ↑', -230, 104, { f: F.mono(600, 22), fill: C.sky, align: 'right' });
    }
    c.restore();
  }

  // ---------- scenes: (c, s) with s = { k, t, d, T, o } ----------
  const PROJECTS = ['飞书群训练营答疑机器人', 'AI 内容检测器', '安吉 AI 需求站', 'Jev Sales Assistant', 'Jev 辅助教学和办公', '事见：ETF 的新闻雷达', 'Benchmark 任务工厂', '初心 AI 小助'];
  const S = {
    intro(c, s) {
      bg(c, s.T, { glow: 0.25 + 0.2 * s.k });
      stars(c, s.T, 0.6);
      const g = E.outCubic(seg(s.t, 0.5, s.d * 0.8));
      circuit(c, CX, CY - 40, g, s.T, 1, 0.9);
      glowDot(c, CX, CY - 40, 420, C.glow, 0.35 + 0.25 * beatPulse(s.T, 3) * g);
      drawQR(c, CX, CY - 40, 220, clamp(s.t / 1.5), E.outCubic(seg(s.t, 0.3, 3)));
      const tk = seg(s.t, s.d * 0.45, s.d * 0.62);
      txt(c, '云谷404 · JEV 黑客松', CX, 190, { f: F.sans(700, 30), ls: 12, alpha: seg(s.t, 1, 2.5), fill: C.sky });
      revealTxt(c, '让 AI 做出下一步决定', CX, 860, E.inOutCubic(tk), { f: F.serif(900, 92), glow: 30, ls: 6 });
      txt(c, 'Let AI Make the Next Decision', CX, 930, { f: F.en(44), alpha: seg(s.t, s.d * 0.6, s.d * 0.72), fill: C.sky });
      txt(c, '2026.09.27 · 杭州 · 云谷中心', CX, 990, { f: F.mono(400, 22), alpha: seg(s.t, s.d * 0.65, s.d * 0.78) * 0.8, fill: C.sky, ls: 4 });
    },
    qr(c, s) {
      bg(c, s.T);
      const r = rng(88), n = 140, conv = E.inOutCubic(seg(s.t, 0.4, s.d * 0.8));
      for (let i = 0; i < 4; i++) {
        const rk = ((s.t - 0.2 - i * 0.45) / 2.2); if (rk < 0 || rk > 1) continue;
        c.strokeStyle = rgba(C.glow, (1 - rk) * 0.7); c.lineWidth = 3; c.beginPath(); c.arc(CX, CY - 30, 160 + rk * 700, 0, 6.283); c.stroke();
      }
      for (let i = 0; i < n; i++) {
        const ang = r() * 6.283, dist = 900 + r() * 500, sx = CX + Math.cos(ang) * dist, sy = CY + Math.sin(ang) * dist;
        const ring = 200 + (i % 5) * 42 + r() * 20, ta = ang + s.t * 0.12, tx = CX + Math.cos(ta) * ring, ty = CY - 30 + Math.sin(ta) * ring * 0.9;
        const kk = E.outCubic(clamp(conv * 1.4 - r() * 0.4));
        const x = lerp(sx, tx, kk), y = lerp(sy, ty, kk);
        c.fillStyle = i % 9 === 0 ? C.gold : rgba(C.glow, 0.85); c.beginPath(); c.arc(x, y, 5 + (i % 3) * 2, 0, 6.283); c.fill();
      }
      const sc = 1 + 0.06 * Math.exp(-6 * seg(s.t, 0.2, 1.2)) * (s.t > 0.2 ? 1 : 0);
      c.save(); c.translate(CX, CY - 30); c.scale(sc, sc); drawQR(c, 0, 0, 260); c.restore();
      const cnt = Math.round(lerp(12, 286, E.outCubic(conv)));
      panel(c, CX - 260, CY + 250, 520, 90, { fill: rgba(C.paper, 0.95), r: 45 });
      txt(c, `JEV 黑客松交流群（${cnt}）`, CX, CY + 308, { f: F.sans(700, 34), fill: C.navy });
    },
    moon(c, s) {
      bg(c, s.T, { top: '#071d45', gx: 1350, gy: 300, glow: 0.3, grid: false });
      stars(c, s.T, 0.9);
      const mx = 1350, my = 300 + (1 - E.outCubic(s.k)) * 60;
      glowDot(c, mx, my, 360, C.glow, 0.45);
      c.save(); c.beginPath(); c.arc(mx, my, 130, 0, 6.283); c.fillStyle = '#eef5fa'; c.fill(); c.clip();
      const r = rng(15); for (let i = 0; i < 14; i++) { c.fillStyle = rgba(C.sky, 0.35); c.beginPath(); c.arc(mx + (r() - 0.5) * 220, my + (r() - 0.5) * 220, 8 + r() * 26, 0, 6.283); c.fill(); }
      c.fillStyle = 'rgba(7,29,69,0.88)'; c.beginPath(); c.arc(mx - 220, my - 20, 150, 0, 6.283); c.fill();
      c.restore();
      // neural constellation beside the moon
      const nodes = [], rr = rng(31);
      for (let l = 0; l < 4; l++) for (let j = 0; j < 4 - (l % 2); j++) nodes.push([580 + l * 150, 170 + j * 110 + (l % 2) * 55 + (rr() - 0.5) * 20, l]);
      const nk = seg(s.t, 1, s.d * 0.8);
      c.lineWidth = 1.5;
      for (const a of nodes) for (const b of nodes) if (b[2] === a[2] + 1) {
        const on = clamp(nk * 4 - a[2]);
        c.strokeStyle = rgba(C.sky, 0.35 * on); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(lerp(a[0], b[0], on), lerp(a[1], b[1], on)); c.stroke();
      }
      for (const a of nodes) glowDot(c, a[0], a[1], 18, C.glow, clamp(nk * 4 - a[2] + 1));
      // drifting cloud bands
      c.save(); c.globalAlpha = 0.25; c.fillStyle = C.sky;
      for (let i = 0; i < 3; i++) { const x = ((s.T * 18 + i * 700) % 2400) - 400; c.beginPath(); c.ellipse(x, 380 + i * 60, 260, 22, 0, 0, 6.283); c.fill(); }
      c.restore();
      skyline(c, 980, s.T, { windows: 0.25 });
      txt(c, '中秋 · 月未圆', 1350, 520, { f: F.brush(44), fill: C.glow, alpha: seg(s.t, 1.5, 2.5) * 0.9 });
    },
    signup(c, s) {
      bg(c, s.T);
      const e = E.outCubic(seg(s.t, 0, 0.8)), x = CX - 440, y = 150 + (1 - e) * 80;
      panel(c, x, y, 880, 600, { r: 16 });
      c.fillStyle = '#d7e3ee'; rrect(c, x, y, 880, 56, [16, 16, 0, 0]); c.fill();
      for (let i = 0; i < 3; i++) { c.fillStyle = [C.red, C.gold, C.mid][i]; c.beginPath(); c.arc(x + 32 + i * 28, y + 28, 8, 0, 6.283); c.fill(); }
      rrect(c, x + 130, y + 12, 600, 32, 16); c.fillStyle = C.paper; c.fill();
      txt(c, 'jev.ai/signup', x + 150, y + 36, { f: F.mono(400, 20), fill: C.blue, align: 'left' });
      txt(c, '注册 Jev', CX, y + 150, { f: F.sans(700, 46), fill: C.navy });
      for (let i = 0; i < 2; i++) { rrect(c, CX - 280, y + 200 + i * 90, 560, 64, 10); c.strokeStyle = rgba(C.blue, 0.4); c.lineWidth = 2; c.stroke(); txt(c, ['邮箱', '密码'][i], CX - 256, y + 243 + i * 90, { f: F.sans(400, 26), fill: rgba(C.blue, 0.6), align: 'left' }); }
      rrect(c, CX - 280, y + 400, 560, 70, 12); c.fillStyle = C.blue; c.fill();
      txt(c, '注册', CX, y + 447, { f: F.sans(700, 30), fill: C.paper });
      const pk = seg(s.t, s.d * 0.3, s.d * 0.3 + 0.25), sc = lerp(2.2, 1, E.outCubic(pk));
      if (pk > 0) {
        c.save(); c.fillStyle = rgba(C.ink, 0.45 * pk); c.fillRect(x, y, 880, 600); c.restore();
        c.save(); c.translate(CX, y + 330); c.rotate(-0.12); c.scale(sc, sc); c.globalAlpha = pk;
        c.strokeStyle = C.red; c.lineWidth = 8; rrect(c, -300, -80, 600, 160, 14); c.stroke();
        c.lineWidth = 3; rrect(c, -284, -64, 568, 128, 8); c.stroke();
        txt(c, '新用户暂停注册', 0, 22, { f: F.serif(900, 64), fill: C.red, ls: 6 });
        c.restore();
        txt(c, '抱歉，请稍后再试', CX, y + 560, { f: F.sans(500, 26), fill: C.blue, alpha: pk });
      }
    },
    code(c, s) {
      bg(c, s.T, { glow: 0.2 });
      const x = 260, y = 130, w = 1400, h = 700;
      panel(c, x, y, w, h, { fill: 'rgba(6,20,48,0.94)', stroke: rgba(C.sky, 0.3), r: 14 });
      for (let i = 0; i < 3; i++) { c.fillStyle = rgba(C.sky, 0.5); c.beginPath(); c.arc(x + 30 + i * 26, y + 28, 7, 0, 6.283); c.fill(); }
      txt(c, 'hackathon — zsh', x + w / 2, y + 36, { f: F.mono(400, 20), fill: rgba(C.sky, 0.6) });
      const lines = [
        ['$ ', 'jev init hackathon --venue 云谷404', C.glow],
        ['', '✓ project created · 10:00', C.gold],
        ['', "const jev = new Jev({ key: process.env.JEV_KEY })", C.paper],
        ['', 'async function nextStep(context) {', C.paper],
        ['', '  const d = await jev.decide(context)', C.paper],
        ['', '  return d.action   // 让 AI 做出下一步决定', C.sky],
        ['', '}', C.paper],
        ['', 'while (passion) { build(); ship(); }', C.gold],
        ['$ ', 'npm run demo', C.glow],
      ];
      const cps = 26, total = lines.reduce((a, l) => a + l[1].length, 0);
      let budget = s.t * cps * (total / (cps * (s.d - 0.6)));
      let ly = y + 110;
      for (const [pre, str, col] of lines) {
        const n = Math.max(0, Math.min(str.length, Math.floor(budget))); budget -= str.length;
        if (n <= 0 && budget < -str.length) break;
        txt(c, pre + str.slice(0, n), x + 50, ly, { f: F.mono(400, 32), fill: col, align: 'left' });
        if (n < str.length && n >= 0) {
          const cw = measure(c, pre + str.slice(0, n), F.mono(400, 32));
          if (Math.floor(s.T * 2.5) % 2 === 0) { c.fillStyle = C.glow; c.fillRect(x + 50 + cw + 4, ly - 30, 16, 36); }
          break;
        }
        ly += 62;
      }
    },
    keys(c, s) {
      bg(c, s.T);
      const av = [[240, 420, '甲'], [560, 300, '乙'], [560, 560, '丙']];
      for (const a of av) avatar(c, a[0], a[1], 56, a[2]);
      for (let i = 0; i < 3; i++) {
        const k = seg(s.t, 0.3 + i * 0.8, 1.3 + i * 0.8), a = av[0], b = av[1 + (i % 2)];
        const x = lerp(a[0], b[0], E.inOutCubic(k)), y = lerp(a[1], b[1], E.inOutCubic(k)) - Math.sin(k * Math.PI) * 140;
        if (k > 0 && k < 1) { panel(c, x - 110, y - 30, 220, 60, { r: 12, fill: C.gold, shadow: 20 }); txt(c, 'sk-jev-••••' + ['4f2a', '9c1e', '7b30'][i], x, y + 10, { f: F.mono(600, 20), fill: C.ink }); }
      }
      txt(c, '借 Key', 400, 720, { f: F.brush(60), fill: C.gold });
      const docs = ['接入文档', 'FAQ 汇总', '踩坑记录', 'API 速查'];
      for (let i = 0; i < docs.length; i++) {
        const k = E.outBack(seg(s.t, s.d * 0.42 + i * 0.35, s.d * 0.42 + i * 0.35 + 0.5));
        if (k <= 0) continue;
        const x = 1320 + (i % 2 ? 14 : -14), y = 700 - i * 70 - (1 - k) * 200;
        c.save(); c.globalAlpha = clamp(k); c.translate(x, y); c.rotate((i % 2 ? 1 : -1) * 0.04);
        panel(c, -260, -150, 520, 300, { r: 8, shadow: 24 });
        txt(c, docs[i], -220, -90, { f: F.sans(700, 38), fill: C.navy, align: 'left' });
        c.fillStyle = rgba(C.blue, 0.25); for (let j = 0; j < 4; j++) c.fillRect(-220, -50 + j * 36, 380 - j * 50, 12);
        c.restore();
      }
      txt(c, '整理文档', 1320, 180, { f: F.brush(60), fill: C.gold, alpha: seg(s.t, s.d * 0.45, s.d * 0.6) });
    },
    token(c, s) {
      bg(c, s.T);
      const x = CX - 480, y = 90, w = 960, h = 720;
      panel(c, x, y, w, h, { fill: rgba('#dfe9f2', 0.97), r: 22 });
      txt(c, 'JEV 黑客松交流群（286）', CX, y + 60, { f: F.sans(700, 32), fill: C.navy });
      c.fillStyle = rgba(C.blue, 0.2); c.fillRect(x, y + 90, w, 2);
      const msgs = [['A', 'Key 额度用完了……', 0.2], ['B', '我也缺 token', 0.9]];
      msgs.forEach(([who, m, t0], i) => {
        const a = seg(s.t, t0, t0 + 0.3); if (a <= 0) return;
        avatar(c, x + 70, y + 170 + i * 120, 34, who, C.mid);
        bubble(c, x + 124, y + 132 + i * 120, measure(c, m, F.sans(500, 32)) + 54, m, { a });
      });
      const oa = seg(s.t, s.d * 0.45, s.d * 0.45 + 0.35);
      if (oa > 0) {
        const m = '缺 token 都来找我！', bw = measure(c, m, F.sans(700, 40)) + 60, by = y + 470 + (1 - E.outBack(oa)) * 40;
        avatar(c, x + w - 70, by + 44, 40, '主', C.blue);
        txt(c, '群主', x + w - 70, by - 12, { f: F.sans(700, 22), fill: C.blue });
        bubble(c, x + w - 130 - bw, by, bw, m, { right: true, h: 90, fill: C.gold, f: F.sans(700, 40), a: oa });
        const r = rng(3);
        for (let i = 0; i < 18; i++) {
          const tk = s.t - s.d * 0.45 - r() * 1.2; if (tk < 0) continue;
          const px = x + w - 300 + (r() - 0.5) * 500 + Math.sin(tk * 3 + i) * 20, py = by - tk * 260 * (0.6 + r() * 0.6);
          c.save(); c.globalAlpha = clamp(1.4 - tk * 0.6); c.fillStyle = C.gold; c.beginPath(); c.arc(px, py, 22, 0, 6.283); c.fill();
          txt(c, 'T', px, py + 9, { f: F.lat(900, 24), fill: C.ink }); c.restore();
        }
      }
    },
    lobby(c, s) {
      kenBurns(c, 'lobby', s.k, 1.02, 1.18, [0.5, 0.5], [0.62, 0.6]);
      vignette(c, 0.6);
      const r = rng(21);
      for (let i = 0; i < 36; i++) {
        const x = (r() * W + s.T * (10 + r() * 30)) % W, y = 120 + r() * 700 + Math.sin(s.T + i) * 12;
        glowDot(c, x, y, 20 + r() * 50, r() < 0.7 ? C.gold : C.glow, 0.3 + 0.3 * Math.sin(s.T * 1.3 + i) ** 2);
      }
      panel(c, 90, 90, 330, 84, { fill: rgba(C.ink, 0.7), r: 10, shadow: 0 });
      txt(c, '云谷中心 · 3F', 120, 146, { f: F.sans(700, 36), fill: C.paper, align: 'left' });
    },
    night(c, s) {
      bg(c, s.T, { glow: 0.18, top: '#06173a' });
      stars(c, s.T, 0.5, 120);
      const flick = Math.floor(s.T * 2) % 2;
      txt(c, flick ? '02:00' : '02 00', 520, 560, { f: F.mono(600, 220), fill: C.glow, glow: 40 });
      txt(c, '凌晨', 520, 330, { f: F.brush(70), fill: C.gold });
      const x = 980, y = 200, w = 800, h = 560;
      panel(c, x, y, w, h, { fill: 'rgba(6,20,48,0.92)', stroke: rgba(C.sky, 0.3), r: 12 });
      const r = rng(55), n = Math.floor(s.t * 3.2);
      const lat = [];
      for (let i = 0; i < 30; i++) lat.push(380 + r() * 700);
      for (let i = Math.max(0, n - 9); i < n; i++) {
        const row = i - Math.max(0, n - 9);
        txt(c, `→ jev.decide()  200 OK  ${Math.round(lat[i % 30])}ms`, x + 34, y + 60 + row * 44, { f: F.mono(400, 24), fill: i === n - 1 ? C.gold : rgba(C.sky, 0.85), align: 'left' });
      }
      c.strokeStyle = C.gold; c.lineWidth = 3; c.beginPath();
      for (let i = 0; i < Math.min(n, 30); i++) { const px = x + 40 + i * 24, py = y + h - 40 - (lat[i] - 380) / 700 * 90; i ? c.lineTo(px, py) : c.moveTo(px, py); }
      c.stroke();
    },
    decide(c, s) {
      bg(c, s.T, { glow: 0.4 });
      stars(c, s.T, 0.5, 140);
      const o = s.o || {};
      c.save(); c.lineCap = 'round';
      decisionTree(c, CX, 1060, 250, -Math.PI / 2, 7, E.outCubic(seg(s.t, 0, s.d * 0.85)), rng(o.seed || 1), true, 0.9);
      c.restore();
      const pulse = beatPulse(s.T, 5);
      revealTxt(c, '让 AI 做出下一步决定', CX, 470, bigP(s.T) ?? 1, { f: F.serif(900, 120 + pulse * 4), glow: 40 + pulse * 30, ls: 8, dim: 0.18 });
      txt(c, 'Let AI make the next decision', CX, 560, { f: F.en(52), fill: C.sky, alpha: seg(s.t, 0.6, 1.2) });
    },
    sign(c, s) {
      bg(c, s.T, { glow: 0.3 });
      c.save(); c.translate(CX, CY - 20); c.rotate(-0.03);
      panel(c, -620, -300, 1240, 560, { r: 6, fill: '#eef4f8' });
      txt(c, 'JEV 黑客松 · 参赛确认', -560, -220, { f: F.sans(700, 34), fill: C.navy, align: 'left' });
      c.fillStyle = rgba(C.blue, 0.2); for (let j = 0; j < 3; j++) c.fillRect(-560, -170 + j * 40, 900 - j * 160, 12);
      c.strokeStyle = C.blue; c.lineWidth = 3; c.beginPath(); c.moveTo(-560, 150); c.lineTo(560, 150); c.stroke();
      txt(c, '签名 / Signed with Jev', -560, 200, { f: F.mono(400, 22), fill: C.blue, align: 'left' });
      revealTxt(c, '我们', -380, 120, E.inOutSine(seg(s.t, 0.4, s.d * 0.55)), { f: F.brush(210), fill: C.navy, align: 'left' });
      revealTxt(c, '— Jev', 120, 110, seg(s.t, s.d * 0.5, s.d * 0.75), { f: F.brush(110), fill: C.blue, align: 'left' });
      const st = seg(s.t, s.d * 0.72, s.d * 0.72 + 0.2);
      if (st > 0) {
        c.save(); c.translate(420, -120); c.rotate(0.2); c.scale(lerp(1.8, 1, st), lerp(1.8, 1, st)); c.globalAlpha = st;
        c.strokeStyle = C.red; c.lineWidth = 6; c.beginPath(); c.arc(0, 0, 90, 0, 6.283); c.stroke();
        txt(c, '已验证', 0, 14, { f: F.serif(900, 42), fill: C.red }); c.restore();
      }
      c.restore();
    },
    seats(c, s) {
      bg(c, s.T);
      const cols = 6, rows = 5, sw = 110, gap = 30, gx = 190, gy = 180;
      const lit = Math.floor(E.outCubic(seg(s.t, 0.1, s.d * 0.6)) * 30);
      for (let i = 0; i < 30; i++) {
        const cx = gx + (i % cols) * (sw + gap), cy = gy + Math.floor(i / cols) * (sw + gap - 20);
        const on = i < lit;
        c.save(); c.fillStyle = on ? C.gold : rgba(C.sky, 0.18); if (on) { c.shadowColor = C.gold; c.shadowBlur = 20; }
        rrect(c, cx, cy + 20, sw, sw * 0.55, 14); c.fill(); rrect(c, cx + 8, cy - 12, sw - 16, 36, 12); c.fill(); c.restore();
      }
      txt(c, `${String(lit).padStart(2, '0')} / 30`, gx + 3 * (sw + gap) - gap / 2, 900, { f: F.mono(600, 64), fill: C.paper });
      const tk = E.outBack(seg(s.t, s.d * 0.45, s.d * 0.45 + 0.6));
      if (tk > 0) {
        c.save(); c.translate(1450, 520 + (1 - tk) * 400); c.rotate(0.08 - tk * 0.1);
        panel(c, -280, -170, 560, 340, { r: 20, fill: C.paper });
        c.fillStyle = C.blue; rrect(c, -280, -170, 560, 90, [20, 20, 0, 0]); c.fill();
        txt(c, 'JEV 通行证', 0, -110, { f: F.sans(900, 38), fill: C.paper, ls: 6 });
        txt(c, '$300', 0, 60, { f: F.lat(900, 150), fill: C.navy });
        txt(c, 'API CREDITS · ADMIT ONE', 0, 130, { f: F.mono(600, 22), fill: C.blue });
        c.restore();
      }
    },
    lights(c, s) {
      bg(c, s.T, { top: '#051535', glow: 0.15, grid: false });
      stars(c, s.T, 0.8);
      // A tall building whose windows light up one by one.
      const bx = 560, by = 120, bw = 800, bh = 960;
      c.fillStyle = '#071a3e'; c.fillRect(bx, by, bw, bh);
      const r = rng(77), k = E.inCubic(seg(s.t, 0, s.d * 0.9));
      for (let yy = by + 30; yy < H; yy += 56) for (let xx = bx + 30; xx < bx + bw - 30; xx += 62) {
        const th = r(), on = th < 0.08 + k * 0.85, warm = r() < 0.3;
        c.fillStyle = on ? (warm ? C.gold : C.glow) : rgba(C.sky, 0.08);
        if (on) { c.save(); c.shadowColor = warm ? C.gold : C.sky; c.shadowBlur = 16; c.fillRect(xx, yy, 36, 30); c.restore(); } else c.fillRect(xx, yy, 36, 30);
      }
      skyline(c, 1080, s.T, { col: '#040d22', windows: 0.3 });
      txt(c, '念头 → 灯', 1620, 200, { f: F.brush(66), fill: C.gold, alpha: seg(s.t, 1, 2) });
    },
    ticket(c, s) {
      bg(c, s.T, { glow: 0.35 });
      const e = E.outBack(seg(s.t, 0, 0.7));
      c.save(); c.translate(CX, CY - 40); c.scale(e, e); c.rotate(-0.04);
      panel(c, -700, -230, 1400, 460, { r: 26, fill: C.paper });
      c.setLineDash([12, 12]); c.strokeStyle = rgba(C.blue, 0.5); c.lineWidth = 3; c.beginPath(); c.moveTo(250, -210); c.lineTo(250, 210); c.stroke(); c.setLineDash([]);
      txt(c, '门票', -620, -120, { f: F.sans(700, 30), fill: C.blue, align: 'left', ls: 8 });
      txt(c, '热爱', -620, 90, { f: F.serif(900, 230), fill: C.navy, align: 'left' });
      txt(c, 'ADMIT ONE · 云谷404', -620, 170, { f: F.mono(600, 24), fill: C.blue, align: 'left' });
      const code = ['git commit -m "proof"', 'npm run demo', '200 OK ✓'];
      const pk = seg(s.t, s.d * 0.4, s.d * 0.75);
      code.forEach((l, i) => { const n = Math.floor(clamp(pk * 3 - i) * l.length); txt(c, l.slice(0, n), 290, -100 + i * 70, { f: F.mono(600, 30), fill: i === 2 ? '#1a8a5a' : C.navy, align: 'left' }); });
      txt(c, '证明', 470, 180, { f: F.brush(80), fill: C.red, alpha: seg(s.t, s.d * 0.7, s.d * 0.8) });
      c.restore();
    },
    tea(c, s) {
      bg(c, s.T, { glow: 0.3 });
      const e = E.outCubic(seg(s.t, 0, 0.8));
      cup(c, 620, 560 + (1 - e) * 80, 1.25, s.T, 'tea', e);
      const e2 = E.outCubic(seg(s.t, s.d * 0.45, s.d * 0.45 + 0.8));
      cup(c, 1380, 600 + (1 - e2) * 80, 1.1, s.T, 'coffee', e2);
    },
    group(c, s) {
      const o = s.o || {};
      kenBurns(c, 'group', s.k, o.z0 || 1.0, o.z1 || 1.1, o.f0 || [0.5, 0.52], o.f1 || [0.5, 0.48]);
      // Halation: the glow of the prints breathes on the beat.
      c.save(); c.globalCompositeOperation = 'screen'; c.globalAlpha = 0.16 + 0.22 * beatPulse(s.T, 4);
      coverDraw(c, BLUR.group, 0, 0, W, H, 1, 0.5, 0.5); c.restore();
      vignette(c, 0.55);
      flash(c, (o.flash ? 1 : 0) * (1 - seg(s.t, 0, 0.5)), '#ffffff');
      if (o.caption !== false) {
        txt(c, '2026.09.27 · 云谷404 · 大合照', W - 90, 110, { f: F.mono(600, 24), fill: C.paper, align: 'right', ls: 3, alpha: seg(s.t, 0.5, 1.2) });
      }
    },
    pitch(c, s) {
      kenBurns(c, 'pitch', s.k, 1.05, 1.2, [0.45, 0.55], [0.35, 0.55]);
      vignette(c, 0.5);
      panel(c, 90, 80, 420, 170, { fill: rgba(C.ink, 0.72), r: 12, shadow: 0 });
      txt(c, '18:00 路演', 120, 150, { f: F.sans(900, 50), fill: C.gold, align: 'left' });
      txt(c, '会议室「旷野」', 120, 222, { f: F.brush(52), fill: C.paper, align: 'left', alpha: seg(s.t, s.d * 0.4, s.d * 0.55) });
    },
    projects(c, s) {
      coverDraw(c, BLUR.demo, 0, 0, W, H, 1.02 + s.k * 0.04);
      c.fillStyle = rgba(C.ink, 0.45); c.fillRect(0, 0, W, H);
      print(c, 'demo', CX, 380, 960, -0.02, 1, { zoom: 1.1 + s.k * 0.08, fx: 0.4, fy: 0.45 });
      const picks = [[0, '飞书机器人'], [5, '金融雷达'], [3, '销售助理']];
      picks.forEach(([pi, tag], i) => {
        const k = E.outBack(seg(s.t, 0.2 + i * (s.d * 0.26), 0.7 + i * (s.d * 0.26)));
        if (k <= 0) return;
        const x = 340 + i * 620, y = 790;
        c.save(); c.translate(x, y + (1 - k) * 120); c.globalAlpha = clamp(k);
        panel(c, -280, -85, 560, 170, { r: 16, fill: C.paper });
        txt(c, tag, 0, -8, { f: F.serif(900, 56), fill: C.navy });
        txt(c, PROJECTS[pi], 0, 50, { f: F.sans(500, 26), fill: C.blue });
        c.restore();
      });
    },
    letters(c, s) {
      bg(c, s.T, { glow: 0.3 });
      stars(c, s.T, 0.6);
      PROJECTS.forEach((p, i) => {
        const k = seg(s.t, i * 0.35, i * 0.35 + s.d * 0.9);
        if (k <= 0) return;
        const e = E.inOutSine(k), sx = 200 + (i % 4) * 480, sy = 1150;
        const x = lerp(sx, CX + (i - 3.5) * 60, e), y = lerp(sy, 180, e), w = lerp(320, 90, e);
        envelope(c, x, y, w, Math.sin(s.T * 1.5 + i) * 0.15, e < 0.6 ? p : '', 1 - seg(k, 0.85, 1));
      });
      glowDot(c, CX, 180, 200 + beatPulse(s.T) * 40, C.glow, 0.5);
      txt(c, 'To: 未来', CX, 360, { f: F.brush(90), fill: C.gold, alpha: seg(s.t, s.d * 0.3, s.d * 0.5) });
    },
    tong(c, s) {
      bg(c, s.T, { glow: 0.3 });
      const a = [460, 560], b = [1460, 560], k = E.inOutCubic(seg(s.t, 0.2, s.d * 0.35));
      c.setLineDash([16, 14]); c.strokeStyle = rgba(C.sky, 0.5); c.lineWidth = 4; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); c.setLineDash([]);
      c.save(); c.strokeStyle = C.gold; c.lineWidth = 8; c.shadowColor = C.gold; c.shadowBlur = 30;
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(lerp(a[0], b[0], k), a[1]); c.stroke(); c.restore();
      for (const [p, l] of [[a, 'demo'], [b, 'Jev']]) { panel(c, p[0] - 130, p[1] - 70, 260, 140, { r: 70, fill: C.paper }); txt(c, l, p[0], p[1] + 20, { f: F.lat(800, 54), fill: C.navy }); }
      const ok = seg(s.t, s.d * 0.35, s.d * 0.35 + 0.3);
      if (ok > 0) {
        for (let i = 0; i < 24; i++) {
          const ang = i / 24 * 6.283, r0 = 150 + E.outCubic(ok) * 60, r1 = r0 + 60 + (i % 2) * 50;
          c.strokeStyle = rgba(C.gold, ok * 0.8); c.lineWidth = 5; c.beginPath(); c.moveTo(CX + Math.cos(ang) * r0, 330 + Math.sin(ang) * r0); c.lineTo(CX + Math.cos(ang) * r1, 330 + Math.sin(ang) * r1); c.stroke();
        }
        c.save(); c.translate(CX, 330); const sc = lerp(1.8, 1, E.outBack(ok)); c.scale(sc, sc);
        txt(c, '通了！', 0, 60, { f: F.brush(190), fill: C.paper, glow: 40, glowCol: C.gold }); c.restore();
        txt(c, '200 OK', CX, 690, { f: F.mono(600, 40), fill: C.gold, alpha: ok });
        txt(c, '> 奖品', CX, 800, { f: F.sans(700, 44), fill: C.sky, alpha: seg(s.t, s.d * 0.65, s.d * 0.8) });
      }
    },
    sun(c, s) {
      bg(c, s.T, { top: '#10306a', glow: 0.2 });
      const y = lerp(900, 480, E.outCubic(seg(s.t, 0, s.d * 0.6))), R = 190;
      glowDot(c, CX, y, 620, C.gold, 0.55);
      c.save(); c.translate(CX, y); c.rotate(s.T * 0.2);
      for (let i = 0; i < 16; i++) { c.rotate(6.283 / 16); c.fillStyle = rgba(C.gold, 0.7); c.beginPath(); c.moveTo(R + 20, -14); c.lineTo(R + 110 + (i % 2) * 50, 0); c.lineTo(R + 20, 14); c.fill(); }
      c.restore();
      c.fillStyle = '#ffd98a'; c.beginPath(); c.arc(CX, y, R, 0, 6.283); c.fill();
      // A crown drops onto the sun.
      const ck = E.outBack(seg(s.t, s.d * 0.5, s.d * 0.5 + 0.6));
      if (ck > 0) {
        c.save(); c.translate(CX, y - R - 40 - (1 - ck) * 300); c.globalAlpha = clamp(ck);
        c.fillStyle = C.paper; c.strokeStyle = C.navy; c.lineWidth = 6;
        c.beginPath(); c.moveTo(-120, 60); c.lineTo(-140, -60); c.lineTo(-60, 0); c.lineTo(0, -90); c.lineTo(60, 0); c.lineTo(140, -60); c.lineTo(120, 60); c.closePath(); c.fill(); c.stroke();
        c.restore();
      }
      txt(c, '初心 AI 小助', CX, y + 30, { f: F.serif(900, 64), fill: C.navy });
      skyline(c, 1090, s.T, { col: '#0a2656' });
      txt(c, '太阳王', CX, 170, { f: F.brush(90), fill: C.paper, alpha: seg(s.t, s.d * 0.55, s.d * 0.7), glow: 20, glowCol: C.gold });
    },
    starkey(c, s) {
      bg(c, s.T, { top: '#051535', glow: 0.2, grid: false });
      stars(c, s.T, 1);
      const r = rng(61);
      for (let i = 0; i < 40; i++) {
        const x = r() * W, y = r() * H, sc = 0.3 + r() * 0.6, tw = 0.4 + 0.6 * Math.sin(s.T * 2 + i) ** 2;
        glowDot(c, x, y, 40 * sc, C.glow, tw * 0.6);
        keyShape(c, x, y, sc * 0.6, r() * 6.28 + s.T * 0.2, rgba(C.glow, 0.8), tw);
      }
      const k = E.outCubic(seg(s.t, 0.3, s.d * 0.6));
      glowDot(c, CX, CY, 380 * k, C.gold, 0.6);
      keyShape(c, CX + 20, CY, 3.2 * k, -0.4 + Math.sin(s.T) * 0.05, C.gold, k);
      txt(c, '攥着 Key，像攥着星光', CX, 200, { f: F.brush(64), fill: C.paper, alpha: seg(s.t, s.d * 0.4, s.d * 0.6) });
    },
    sheet(c, s) {
      bg(c, s.T, { glow: 0.25 });
      const z = lerp(1, 1.5, E.inOutSine(s.k));
      c.save(); c.translate(CX + 200, CY + lerp(40, -40, s.k)); c.scale(z, z);
      print(c, 'sheet', 0, 0, 560, 0.06, 1, { fx: 0.5, fy: 0.62 });
      c.restore();
      const a = seg(s.t, 0.3, 1);
      txt(c, '没有大奖', 420, 440, { f: F.serif(900, 110), fill: C.sky, alpha: a * 0.7 });
      c.save(); c.strokeStyle = rgba(C.red, a); c.lineWidth = 8; c.beginPath(); c.moveTo(180, 420); c.lineTo(180 + 480 * seg(s.t, 1, 1.5), 400); c.stroke(); c.restore();
      txt(c, '只有大场', 420, 640, { f: F.serif(900, 140), fill: C.paper, alpha: seg(s.t, s.d * 0.45, s.d * 0.6), glow: 30 });
    },
    hongbao(c, s) {
      bg(c, s.T, { glow: 0.3 });
      const r = rng(8);
      for (let i = 0; i < 26; i++) {
        const x = r() * W, sp = 180 + r() * 220, y0 = -200 - r() * 900, y = y0 + s.t * sp;
        hongbao(c, x + Math.sin(s.t * 2 + i) * 30, y, 70 + r() * 60, Math.sin(s.t * 1.5 + i) * 0.5, 1);
      }
      const k = E.outBack(seg(s.t, 0.4, 1.1));
      c.save(); c.translate(CX, CY); c.scale(k, k); hongbao(c, 0, 0, 300, -0.05, 1); c.restore();
      txt(c, '自掏腰包', CX, 200, { f: F.brush(70), fill: C.gold, alpha: seg(s.t, s.d * 0.3, s.d * 0.5) });
    },
    constellation(c, s) {
      bg(c, s.T, { top: '#051535', glow: 0.15, grid: false });
      stars(c, s.T, 0.5);
      // Heads in the group photo, as fractions of the frame.
      const heads = [[.125, .49], [.16, .47], [.215, .45], [.25, .44], [.335, .43], [.39, .48], [.54, .47], [.61, .5], [.645, .46], [.68, .46], [.73, .44], [.76, .43], [.8, .47], [.875, .44], [.925, .46]];
      const k = E.inOutCubic(seg(s.t, 0.2, s.d * 0.7)), r = rng(17);
      const pa = seg(s.t, s.d * 0.6, s.d);
      c.save(); c.globalAlpha = pa * 0.55; coverDraw(c, IMG.group, 0, 0, W, H, 1.0); c.restore();
      const pts = heads.map(([hx, hy]) => { const sx = r() * W, sy = r() * H; return [lerp(sx, hx * W, k), lerp(sy, hy * H, k)]; });
      c.strokeStyle = rgba(C.glow, 0.4 * k); c.lineWidth = 2; c.beginPath();
      pts.forEach((p, i) => { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.stroke();
      pts.forEach(p => { glowDot(c, p[0], p[1], 34, C.glow, 0.9); glowDot(c, p[0], p[1], 10, '#ffffff', 1); });
      txt(c, '谢谢你撺的局', CX, 200, { f: F.brush(80), fill: C.gold, alpha: seg(s.t, 0.5, 1.3) });
    },
    storm(c, s) {
      const bolt = [0.15, 0.48, 0.72].some(b => { const x = s.k - b; return x > 0 && x < 0.03; });
      bg(c, s.T, { top: '#04102a', bottom: '#020815', glow: 0.1, grid: false });
      flash(c, bolt ? 0.35 : 0, C.glow);
      if (bolt) {
        const r = rng(Math.floor(s.k * 40)); let x = 500 + r() * 900, y = 0;
        c.strokeStyle = '#ffffff'; c.lineWidth = 5; c.shadowColor = C.glow; c.shadowBlur = 30; c.beginPath(); c.moveTo(x, y);
        while (y < 700) { x += (r() - 0.5) * 120; y += 40 + r() * 60; c.lineTo(x, y); } c.stroke(); c.shadowBlur = 0;
      }
      skyline(c, 860, s.T, { col: '#030a1c', windows: 0.2, px: 1500 });
      c.fillStyle = '#02071a'; c.fillRect(0, 852, W, H - 852); c.fillStyle = rgba(C.sky, 0.25); c.fillRect(0, 852, W, 2);
      const rr = rng(4);
      c.strokeStyle = rgba(C.sky, 0.45); c.lineWidth = 2; c.beginPath();
      for (let i = 0; i < 260; i++) { const x = (rr() * (W + 300) - s.T * 240 * 0.3) % (W + 300), y = (rr() * H + s.T * 1400 * (0.8 + rr() * 0.4)) % H; c.moveTo(x, y); c.lineTo(x - 12, y + 44); }
      c.stroke();
      // Walkers with umbrellas heading right.
      for (let i = 0; i < 6; i++) {
        const x = ((s.t * 70 + i * 330) % (W + 300)) - 150, y = 850, bob = Math.abs(Math.sin(s.t * 5 + i)) * 6;
        c.fillStyle = C.paper;
        c.beginPath(); c.arc(x, y - 110 - bob, 14, 0, 6.283); c.fill();
        c.fillRect(x - 10, y - 95 - bob, 20, 60);
        c.strokeStyle = C.paper; c.lineWidth = 6; c.beginPath(); c.moveTo(x - 5, y - 35 - bob); c.lineTo(x - 5 - Math.sin(s.t * 5 + i) * 14, y); c.moveTo(x + 5, y - 35 - bob); c.lineTo(x + 5 + Math.sin(s.t * 5 + i) * 14, y); c.stroke();
        c.fillStyle = i % 3 === 0 ? C.gold : C.mid; c.beginPath(); c.arc(x + 6, y - 140 - bob, 60, Math.PI, 0); c.fill();
        c.lineWidth = 3; c.beginPath(); c.moveTo(x + 6, y - 140 - bob); c.lineTo(x + 6, y - 80 - bob); c.stroke();
      }
      txt(c, '杭州 · 雷暴', 110, 130, { f: F.mono(600, 26), fill: C.sky, align: 'left', ls: 4 });
    },
    next(c, s) {
      bg(c, s.T, { glow: 0.35 });
      const flip = E.inOutCubic(seg(s.t, 0.4, 1.4));
      c.save(); c.translate(CX, CY - 40);
      panel(c, -300, -300, 600, 560, { r: 20 });
      c.fillStyle = C.blue; rrect(c, -300, -300, 600, 130, [20, 20, 0, 0]); c.fill();
      txt(c, 'NEXT', 0, -210, { f: F.lat(900, 60), fill: C.paper, ls: 12 });
      txt(c, '下次活动', 0, 30, { f: F.serif(900, 110), fill: C.navy });
      txt(c, '我们继续 →', 0, 170, { f: F.brush(70), fill: C.blue, alpha: seg(s.t, s.d * 0.4, s.d * 0.6) });
      if (flip < 1) {
        c.save(); c.scale(1, Math.cos(flip * Math.PI / 2)); c.translate(0, 0);
        panel(c, -300, -170, 600, 430, { r: 0, fill: '#f4f8fb', shadow: 10 });
        txt(c, '09.27', 0, 90, { f: F.lat(900, 170), fill: C.navy }); c.restore();
      }
      c.restore();
    },
    patch(c, s) {
      bg(c, s.T, { top: '#040f2a', glow: 0.2, grid: false });
      stars(c, s.T, 1);
      // Spiral galaxy.
      const r = rng(99);
      for (let i = 0; i < 900; i++) {
        const arm = i % 3, d = Math.pow(r(), 0.7) * 520, ang = arm * 2.094 + d / 110 + s.T * 0.08 + (r() - 0.5) * 0.5;
        const x = 1250 + Math.cos(ang) * d, y = 470 + Math.sin(ang) * d * 0.45;
        c.fillStyle = rgba(r() < 0.1 ? C.gold : C.glow, 0.25 + r() * 0.6); c.fillRect(x, y, 2.5, 2.5);
      }
      glowDot(c, 1250, 470, 160, C.glow, 0.6);
      // The patch, stitched onto space.
      const pk = E.outBack(seg(s.t, s.d * 0.35, s.d * 0.35 + 0.7));
      if (pk > 0) {
        c.save(); c.translate(1250, 470); c.rotate(-0.12); c.scale(pk, pk);
        c.fillStyle = C.navy; c.strokeStyle = C.gold; c.lineWidth = 10; c.beginPath(); c.arc(0, 0, 190, 0, 6.283); c.fill(); c.stroke();
        c.setLineDash([10, 10]); c.lineWidth = 3; c.strokeStyle = C.paper; c.beginPath(); c.arc(0, 0, 168, 0, 6.283); c.stroke(); c.setLineDash([]);
        txt(c, '云谷', 0, -20, { f: F.serif(900, 80), fill: C.paper });
        txt(c, '404', 0, 80, { f: F.lat(900, 90), fill: C.gold });
        c.restore();
      }
      const x = 120, y = 260;
      panel(c, x, y, 640, 330, { fill: 'rgba(6,20,48,0.9)', stroke: rgba(C.sky, 0.3), r: 12 });
      const diff = [['--- a/universe', C.sky], ['+++ b/universe', C.sky], ['@@ 2026.09.27 @@', C.gold], ['- 各自摸索', C.red], ['+ 一起做点东西', '#7de3a8']];
      diff.forEach(([l, col], i) => { if (s.t > 0.3 + i * 0.35) txt(c, l, x + 36, y + 70 + i * 54, { f: F.mono(600, 30), fill: col, align: 'left' }); });
      txt(c, 'git apply universe.patch', x + 20, y + 400, { f: F.mono(400, 26), fill: C.glow, align: 'left', alpha: seg(s.t, s.d * 0.3, s.d * 0.4) });
    },
    montage(c, s) {
      bg(c, s.T, { glow: 0.35 });
      const o = s.o || {}, keys = o.keys || ['lobby', 'pitch', 'demo', 'group'];
      keys.forEach((k, i) => {
        const a = seg(s.t, i * 0.25, i * 0.25 + 0.5), n = keys.length;
        const x = CX + (i - (n - 1) / 2) * 400 + Math.sin(s.T * 0.5 + i) * 10, y = CY - 40 + (i % 2 ? 40 : -40) + (1 - E.outCubic(a)) * 300;
        print(c, k, x, y, k === 'sheet' ? 300 : 520, (i % 2 ? 0.06 : -0.05), a);
      });
      c.fillStyle = rgba(C.ink, o.big ? 0.6 : 0.35); c.fillRect(0, 0, W, H);
      if (o.big) {
        const pulse = beatPulse(s.T, 5);
        revealTxt(c, o.big, CX, CY + 30, bigP(s.T) ?? 1, { f: F.serif(900, 110 + pulse * 4), glow: 40 + pulse * 20, ls: 6, stroke: 10, strokeCol: rgba(C.ink, 0.6) });
        if (o.en) txt(c, o.en, CX, CY + 110, { f: F.en(50), fill: C.sky, alpha: seg(s.t, 0.8, 1.4) });
      }
      if (o.title) {
        const a = seg(s.t, 1.2, 2.2) * (1 - seg(s.t, s.d - 0.6, s.d));
        txt(c, o.title, CX, 930, { f: F.mono(600, 64), fill: C.paper, ls: 8, alpha: a, glow: 20 });
        txt(c, o.sub, CX, 1000, { f: F.sans(500, 32), fill: C.sky, alpha: a * seg(s.t, 2.4, 3.2), ls: 6 });
      }
    },
    roster(c, s) {
      bg(c, s.T, { glow: 0.25 });
      coverDraw(c, BLUR.demo, 0, 0, W, H, 1.05); c.fillStyle = rgba(C.ink, 0.72); c.fillRect(0, 0, W, H);
      const x = 300, y = 150, w = 1320, h = 760;
      panel(c, x, y, w, h, { fill: 'rgba(6,20,48,0.93)', stroke: rgba(C.sky, 0.3), r: 14 });
      txt(c, '$ ls ./projects', x + 50, y + 80, { f: F.mono(600, 32), fill: C.glow, align: 'left' });
      PROJECTS.forEach((p, i) => {
        const a = seg(s.t, 0.6 + i * 0.55, 0.9 + i * 0.55); if (a <= 0) return;
        const yy = y + 160 + i * 72;
        txt(c, String(i + 1).padStart(2, '0'), x + 60, yy, { f: F.mono(600, 30), fill: C.gold, align: 'left', alpha: a });
        txt(c, p, x + 140, yy, { f: F.sans(700, 38), fill: C.paper, align: 'left', alpha: a });
        txt(c, '✓ demo', x + w - 60, yy, { f: F.mono(600, 26), fill: '#7de3a8', align: 'right', alpha: seg(s.t, 1.2 + i * 0.55, 1.5 + i * 0.55) });
      });
    },
    score(c, s) {
      bg(c, s.T, { glow: 0.3 });
      print(c, 'sheet', 1480, CY + 20, 420, 0.07, E.outCubic(seg(s.t, 0, 0.8)), { fx: 0.5, fy: 0.3 });
      txt(c, '选手互评 · 四个维度', 140, 200, { f: F.serif(900, 64), fill: C.paper, align: 'left' });
      txt(c, '100 分', 140, 260, { f: F.mono(600, 30), fill: C.gold, align: 'left' });
      const dims = [['场景与产品闭环', 30], ['Jev 判断设计', 25], ['验证与异常处理', 25], ['现场演示与说明', 20]];
      dims.forEach(([n, v], i) => {
        const k = E.outCubic(seg(s.t, 0.8 + i * 0.9, 2 + i * 0.9)), y = 380 + i * 150;
        txt(c, n, 140, y, { f: F.sans(700, 38), fill: C.paper, align: 'left', alpha: clamp(k * 3) });
        c.fillStyle = rgba(C.sky, 0.15); rrect(c, 140, y + 24, 900, 30, 15); c.fill();
        c.save(); c.fillStyle = C.gold; c.shadowColor = C.gold; c.shadowBlur = 16; rrect(c, 140, y + 24, Math.max(30, 900 * v / 30 * k), 30, 15); c.fill(); c.restore();
        txt(c, String(Math.round(v * k)), 1070, y + 50, { f: F.mono(600, 36), fill: C.gold, align: 'left' });
      });
    },
    rise(c, s) {
      bg(c, s.T, { glow: 0.2 + 0.3 * s.k });
      stars(c, s.T, 0.5);
      circuit(c, CX, CY - 20, E.inCubic(s.k) * 1.05, s.T * (1 + s.k * 2), 1, 0.8 + s.k * 0.5);
      glowDot(c, CX, CY - 20, 300 + 300 * s.k, C.glow, 0.3 + 0.4 * s.k * beatPulse(s.T, 3));
      const clockT = 17 + Math.floor(E.inCubic(s.k) * 60) / 60;
      const hh = Math.floor(clockT), mm = Math.floor((clockT - hh) * 60);
      panel(c, CX - 230, CY - 110, 460, 180, { fill: 'rgba(6,20,48,0.9)', stroke: rgba(C.sky, 0.4), r: 16 });
      txt(c, `${hh}:${String(mm).padStart(2, '0')}`, CX, CY + 20, { f: F.mono(600, 120), fill: C.glow, glow: 30 });
      txt(c, '路演即将开始', CX, CY + 190, { f: F.sans(700, 44), fill: C.gold, ls: 10, alpha: seg(s.t, 2, 3) });
      flash(c, seg(s.t, s.d - 0.8, s.d) * 0.6, C.glow);
    },
    notfound(c, s) {
      bg(c, s.T, { glow: 0.3 });
      const g = s.t < s.d * 0.5, r = rng(Math.floor(s.T * 12));
      const jx = g ? (r() - 0.5) * 30 : 0;
      c.save(); c.globalCompositeOperation = 'screen';
      txt(c, '404', CX - 8 + jx, 520, { f: F.lat(900, 360), fill: rgba(C.red, 0.7) });
      txt(c, '404', CX + 8 - jx, 520, { f: F.lat(900, 360), fill: rgba(C.sky, 0.8) });
      c.restore();
      txt(c, '404', CX, 520, { f: F.lat(900, 360), fill: C.paper, glow: 30 });
      if (g) txt(c, 'NOT FOUND', CX, 640, { f: F.mono(600, 50), fill: C.sky, ls: 20 });
      else {
        txt(c, 'FOUND US', CX, 640, { f: F.mono(600, 50), fill: C.gold, ls: 20 });
      }
    },
    end(c, s) {
      const pa = 1 - seg(s.t, s.d * 0.45, s.d * 0.65);
      bg(c, s.T, { glow: 0.3 });
      stars(c, s.T, 0.6);
      if (pa > 0) { c.save(); c.globalAlpha = pa; kenBurns(c, 'group', s.k, 1.12, 1.0, [0.5, 0.5], [0.5, 0.5]); vignette(c, 0.7); c.restore(); }
      circuit(c, CX, CY - 60, 1 - seg(s.t, s.d * 0.85, s.d), s.T, 1 - pa, 0.7);
      if (pa < 1) drawQR(c, CX, CY - 60, 160, 1 - pa);
      revealTxt(c, '未完待续', CX, 800, E.inOutCubic(seg(s.t, 1.2, 3.1)), { f: F.brush(150), fill: C.paper, glow: 30 });
      txt(c, 'to be continued', CX, 880, { f: F.en(44), fill: C.sky, alpha: seg(s.t, 2.8, 3.8) });
      const ca = seg(s.t, s.d * 0.6, s.d * 0.7) * (1 - seg(s.t, s.d - 1.2, s.d - 0.2));
      txt(c, '音乐《让 AI 做出下一步决定》· 由 Suno 生成   |   画面：JEV 黑客松现场照片 · 云谷中心 2026.09.27', CX, 1010, { f: F.sans(400, 22), fill: C.sky, alpha: ca });
    },
  };

  // ---------- chrome: section tag, event tag, lyrics ----------
  function chrome(c, T) {
    let sec = null; for (const x of LY.sections) if (T >= x.t) sec = x;
    if (sec && sec.label) {
      const a = seg(T, sec.t, sec.t + 0.6) * 0.85;
      txt(c, sec.label, 90, 66, { f: F.mono(600, 20), fill: C.sky, align: 'left', ls: 5, alpha: a });
    }
    if (T > 12 && T < LY.duration - 14) txt(c, '云谷404 · JEV 黑客松', W - 90, 66, { f: F.sans(500, 20), fill: C.sky, align: 'right', ls: 4, alpha: 0.7 });
  }
  // Fraction of the line's width sung by time T, from per-character times.
  const UNIT = /[A-Za-z]+|\d+|[\u4e00-\u9fff]/g;
  function charProgress(L, T) {
    if (!L._u) { L._u = []; let m; UNIT.lastIndex = 0; while ((m = UNIT.exec(L.zh))) L._u.push([m.index, m.index + m[0].length]); L._w = null; }
    const ct = L.ct, n = ct.length; if (T <= ct[0]) return 0;
    let u = n; for (let i = 0; i < n; i++) { const t1 = i + 1 < n ? Math.min(ct[i + 1], ct[i] + 0.6) : L.t1 - 0.1; if (T < t1) { u = i + clamp((T - ct[i]) / Math.max(0.05, t1 - ct[i])); break; } }
    if (!L._w) { const f = F.serif(900, 60), full = measure(ctx, L.zh, f, 3); L._w = L._u.map(([a, b]) => [measure(ctx, L.zh.slice(0, a), f, 3) / full, measure(ctx, L.zh.slice(0, b), f, 3) / full]); }
    const i = Math.min(n - 1, Math.floor(u)), fr = u - i; if (u >= n) return 1;
    return lerp(L._w[i][0], L._w[i][1], fr);
  }
  function lyrics(c, T) {
    LY.lines.forEach((L, i) => {
      const nx = LY.lines[i + 1], end = Math.min(L.t1 + 0.1, nx ? nx.t0 - 0.3 : 1e9);
      if (T < L.t0 - 0.2 || T > end + 0.2 || L.hide) return;
      const a = seg(T, L.t0 - 0.2, L.t0 + 0.05) * (1 - seg(T, end, end + 0.2));
      const p = charProgress(L, T);
      const y = L.y || 948;
      c.save(); c.globalAlpha = a;
      const g = c.createLinearGradient(0, y - 110, 0, H);
      g.addColorStop(0, 'rgba(5,15,38,0)'); g.addColorStop(1, 'rgba(5,15,38,0.55)');
      c.fillStyle = g; c.fillRect(0, y - 110, W, H - y + 110); c.restore();
      revealTxt(c, L.zh, CX, y, p, { f: F.serif(900, 60), fill: C.paper, glow: 18, glowCol: rgba(C.mid, 0.9), dim: 0.45, alpha: a, ls: 3, stroke: 6, strokeCol: rgba(C.ink, 0.5) });
      if (L.en) txt(c, L.en, CX, y + 52, { f: F.en(34), fill: C.sky, alpha: a * 0.85 });
    });
  }
  // Sung fraction of the hidden (scene-drawn) line active at T, or null.
  function bigP(T) {
    for (const L of LY.lines) if (L.hide && T >= L.t0 - 0.5 && T <= L.t1 + 2) return charProgress(L, T);
    return null;
  }
  function post(c, T, frame) {
    c.save(); c.globalCompositeOperation = 'overlay'; c.globalAlpha = 0.09;
    c.drawImage(GRAIN[frame % 4], 0, 0, W, H); c.restore();
    vignette(c, 0.35);
    const fin = seg(T, 0, 1.2), fout = 1 - seg(T, LY.duration - 2.5, LY.duration - 0.2);
    flash(c, 1 - fin * fout, '#000000');
  }

  // ---------- frame ----------
  const buf = offscreen(W, H), bctx = buf.getContext('2d');
  function sceneState(i, T) {
    const cue = LY.cues[i], next = LY.cues[i + 1], t1 = next ? next.t : LY.duration;
    const d = t1 - cue.t, t = T - cue.t;
    return { k: clamp(t / d), t, d, T, o: cue.o };
  }
  function drawCue(c, i, T) { c.save(); S[LY.cues[i].scene](c, sceneState(i, T)); c.restore(); }
  function render(T, frame = 0) {
    let i = 0; for (let j = 0; j < LY.cues.length; j++) if (T >= LY.cues[j].t) i = j;
    const cue = LY.cues[i], XF = cue.xf ?? 0.45, since = T - cue.t;
    if (i > 0 && since < XF && cue.tr !== 'cut') {
      drawCue(ctx, i - 1, T);
      bctx.setTransform(1, 0, 0, 1, 0, 0); bctx.globalAlpha = 1; bctx.globalCompositeOperation = 'source-over';
      drawCue(bctx, i, T);
      ctx.save(); ctx.globalAlpha = E.inOutSine(since / XF); ctx.drawImage(buf, 0, 0); ctx.restore();
    } else drawCue(ctx, i, T);
    if (cue.tr === 'flash') flash(ctx, 0.8 * (1 - seg(since, 0, 0.35)), C.glow);
    chrome(ctx, T);
    lyrics(ctx, T);
    post(ctx, T, frame);
  }

  window.FILM = { DURATION: LY.duration, render };
  window.ready = (async () => {
    await Promise.all(PHOTOS.map(async k => { IMG[k] = await load('styled/' + k + '.jpg'); }));
    const faces = [F.serif(900, 60), F.sans(400, 30), F.sans(500, 30), F.sans(700, 30), F.sans(900, 30), F.brush(60), F.en(40), F.mono(400, 30), F.mono(600, 30), F.lat(800, 60), F.lat(900, 60)];
    await Promise.all(faces.map(f => document.fonts.load(f, window.ALLTEXT || '云谷')));
    await document.fonts.ready;
    buildTextures();
    render(0);
    return true;
  })();
})();
