// 2026 — a :60 promo spot for the United States · Canada · Mexico tournament.
// Deterministic: FILM.render(t) draws the frame at time t (seconds). Everything is procedural.
(() => {
const W = 1920, H = 1080;
const TL = window.TL, BAR = 240 / TL.bpm, BEAT = BAR / 4;
const DURATION = TL.totalBars * BAR;
const out = document.getElementById('c'), X = out.getContext('2d');
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const SC = mk(W, H), S = SC.getContext('2d');           // scene
const BG = mk(W, H), G = BG.getContext('2d');           // background layer (for depth of field)
const BL = mk(W / 4, H / 4), B = BL.getContext('2d');   // bloom

// ------------------------------------------------------------------ utils
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const eo3 = t => 1 - Math.pow(1 - clamp(t), 3);
const eo5 = t => 1 - Math.pow(1 - clamp(t), 5);
const eio = t => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const eback = t => { t = clamp(t); const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = (i, j = 0) => { let h = (i * 374761393 + j * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const vnoise = x => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i, 7), hash(i + 1, 7), u) * 2 - 1; };
const B2S = b => b * BAR;
const hex = (h, a = 1) => { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
const mixHex = (h1, h2, k) => { const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
  const r = lerp(a >> 16, b >> 16, k) | 0, g = lerp((a >> 8) & 255, (b >> 8) & 255, k) | 0, bl = lerp(a & 255, b & 255, k) | 0; return `rgb(${r},${g},${bl})`; };

const C = { red: '#ff2b45', green: '#00c46a', blue: '#2f6bff', white: '#f4f6ff', gold: '#ffcc55', navy: '#0a1330',
            cRed: '#d80621', mGreen: '#006847', uBlue: '#0a3161' };

// ------------------------------------------------------------------ type
function font(size, weight = 900, fam = 'Inter Tight', italic = false) { return `${italic ? 'italic ' : ''}${weight} ${size}px '${fam}'`; }
function text(ctx, s, x, y, o = {}) {
  ctx.save();
  ctx.font = font(o.size || 40, o.weight || 900, o.fam || 'Inter Tight', o.italic);
  ctx.letterSpacing = (o.track || 0) + 'px';
  ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'alphabetic';
  ctx.globalAlpha *= o.alpha === undefined ? 1 : o.alpha;
  if (o.shadow) { ctx.shadowColor = o.shadow; ctx.shadowBlur = o.blur || 30; }
  ctx.fillStyle = o.color || C.white;
  ctx.fillText(s, x, y);
  ctx.restore();
}
function tw(s, size, weight = 900, track = 0, fam = 'Inter Tight', italic = false) {
  S.save(); S.font = font(size, weight, fam, italic); S.letterSpacing = track + 'px'; const w = S.measureText(s).width - track; S.restore(); return w;
}
// A line that rises into place from behind a mask, and optionally leaves the same way.
function reveal(ctx, s, x, y, t, t0, o = {}) {
  const dur = o.dur || 0.5, size = o.size || 60;
  const p = eo5((t - t0) / dur);
  if (p <= 0) return;
  const q = o.tOut !== undefined ? eio((t - o.tOut) / 0.35) : 0;
  if (q >= 1) return;
  const w = tw(s, size, o.weight || 900, o.track || 0, o.fam, o.italic);
  const x0 = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
  ctx.save();
  ctx.beginPath(); ctx.rect(x0 - 40, y - size * 1.05, w + 80 + (o.track || 0), size * 1.35); ctx.clip();
  const dy = (1 - p) * size * 1.1 - q * size * 1.1;
  text(ctx, s, x, y + dy, Object.assign({}, o, { alpha: (o.alpha === undefined ? 1 : o.alpha) * (0.2 + 0.8 * p) }));
  ctx.restore();
}

// ------------------------------------------------------------------ 3D
function camera(px, py, pz, tx, ty, tz, fov, roll = 0, cx = W / 2, cy = H / 2) {
  let fx = tx - px, fy = ty - py, fz = tz - pz; const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
  let rx = -fz, rz = fx; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl; let ry = 0;
  let ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
  if (roll) { const c = Math.cos(roll), s = Math.sin(roll);
    const r2 = [rx * c + ux * s, ry * c + uy * s, rz * c + uz * s], u2 = [ux * c - rx * s, uy * c - ry * s, uz * c - rz * s];
    [rx, ry, rz] = r2; [ux, uy, uz] = u2; }
  return { px, py, pz, rx, ry, rz, ux, uy, uz, fx, fy, fz, focal: (H / 2) / Math.tan(fov * Math.PI / 360), cx, cy };
}
function toCam(K, x, y, z) { const dx = x - K.px, dy = y - K.py, dz = z - K.pz;
  return [dx * K.rx + dy * K.ry + dz * K.rz, dx * K.ux + dy * K.uy + dz * K.uz, dx * K.fx + dy * K.fy + dz * K.fz]; }
function projV(K, v) { return [K.cx + v[0] * K.focal / v[2], K.cy - v[1] * K.focal / v[2], v[2]]; }
function proj(K, x, y, z) { const v = toCam(K, x, y, z); return v[2] < 0.05 ? null : projV(K, v); }
const NEAR = 0.1;
function clipPoly(vs) {
  const o = [];
  for (let i = 0; i < vs.length; i++) {
    const a = vs[i], b = vs[(i + 1) % vs.length], ai = a[2] >= NEAR, bi = b[2] >= NEAR;
    if (ai) o.push(a);
    if (ai !== bi) { const k = (NEAR - a[2]) / (b[2] - a[2]); o.push([lerp(a[0], b[0], k), lerp(a[1], b[1], k), NEAR]); }
  }
  return o;
}
function poly3(ctx, K, pts) {
  const vs = clipPoly(pts.map(p => toCam(K, p[0], p[1], p[2])));
  if (vs.length < 3) return false;
  for (let i = 0; i < vs.length; i++) { const p = projV(K, vs[i]); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
  ctx.closePath(); return true;
}
function seg3(ctx, K, a, b) {
  let va = toCam(K, a[0], a[1], a[2]), vb = toCam(K, b[0], b[1], b[2]);
  if (va[2] < NEAR && vb[2] < NEAR) return false;
  if (va[2] < NEAR) { const k = (NEAR - va[2]) / (vb[2] - va[2]); va = [lerp(va[0], vb[0], k), lerp(va[1], vb[1], k), NEAR]; }
  if (vb[2] < NEAR) { const k = (NEAR - vb[2]) / (va[2] - vb[2]); vb = [lerp(vb[0], va[0], k), lerp(vb[1], va[1], k), NEAR]; }
  const p = projV(K, va), q = projV(K, vb);
  ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); return (va[2] + vb[2]) / 2;
}

// ------------------------------------------------------------------ sprites
function glowSprite(size, stops) {
  const c = mk(size, size), g = c.getContext('2d'), r = size / 2;
  const gr = g.createRadialGradient(r, r, 0, r, r, r); stops.forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr; g.fillRect(0, 0, size, size); return c;
}
const GLOW_W = glowSprite(128, [[0, 'rgba(255,255,255,1)'], [0.08, 'rgba(255,250,235,0.9)'], [0.25, 'rgba(255,235,200,0.25)'], [1, 'rgba(255,220,180,0)']]);
const GLOW_SOFT = glowSprite(128, [[0, 'rgba(255,255,255,0.5)'], [0.4, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']]);
const tinted = {};
function glowTint(col) {
  if (tinted[col]) return tinted[col];
  return (tinted[col] = glowSprite(128, [[0, 'rgba(255,255,255,1)'], [0.1, hex(col, 0.9)], [0.35, hex(col, 0.25)], [1, hex(col, 0)]]));
}
const GRAIN = [0, 1, 2].map(k => { const c = mk(256, 256), g = c.getContext('2d'), d = g.createImageData(256, 256), r = rng(99 + k);
  for (let i = 0; i < d.data.length; i += 4) { const v = 128 + (r() + r() + r() - 1.5) * 90; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  g.putImageData(d, 0, 0); return c; });

// ------------------------------------------------------------------ the ball
const PHI = (1 + Math.sqrt(5)) / 2;
const ICO = [[0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI], [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0], [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1]]
  .map(v => { const l = Math.hypot(...v); return v.map(x => x / l); });
const PANEL_COL = ['#c8102e', '#0a8a52', '#1f4fd1', '#c8102e', '#0a8a52', '#1f4fd1', '#1f4fd1', '#c8102e', '#0a8a52', '#1f4fd1', '#c8102e', '#0a8a52'];
const nrm = v => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
const slerpPts = (a, b, n) => { const o = []; for (let k = 0; k <= n; k++) o.push(nrm([lerp(a[0], b[0], k / n), lerp(a[1], b[1], k / n), lerp(a[2], b[2], k / n)])); return o; };
const ICO_EDGES = []; ICO.forEach((a, i) => ICO.forEach((b, j) => { if (j > i && Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1.1) ICO_EDGES.push([i, j]); }));
const PANELS = ICO.map((v, i) => {
  const nb = ICO_EDGES.filter(e => e.includes(i)).map(e => ICO[e[0] === i ? e[1] : e[0]]);
  const a = Math.abs(v[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const t1 = nrm([v[1] * a[2] - v[2] * a[1], v[2] * a[0] - v[0] * a[2], v[0] * a[1] - v[1] * a[0]]), t2 = [v[1] * t1[2] - v[2] * t1[1], v[2] * t1[0] - v[0] * t1[2], v[0] * t1[1] - v[1] * t1[0]];
  const cs = nb.map(n => nrm(v.map((x, k) => x + (n[k] - x) / 3))).sort((p, q) => Math.atan2(p[0] * t2[0] + p[1] * t2[1] + p[2] * t2[2], p[0] * t1[0] + p[1] * t1[1] + p[2] * t1[2]) - Math.atan2(q[0] * t2[0] + q[1] * t2[1] + q[2] * t2[2], q[0] * t1[0] + q[1] * t1[1] + q[2] * t1[2]));
  const pts = []; cs.forEach((c, k) => pts.push(...slerpPts(c, cs[(k + 1) % 5], 4).slice(0, 4)));
  return { v, pts };
});
const SEAMS = ICO_EDGES.map(([i, j]) => { const a = ICO[i], b = ICO[j]; return slerpPts(nrm(a.map((x, k) => x + (b[k] - x) / 3)), nrm(a.map((x, k) => x + 2 * (b[k] - x) / 3)), 4); });
function rotMat(ax, ay, az) {
  const [ca, sa, cb, sb, cc, sc] = [Math.cos(ax), Math.sin(ax), Math.cos(ay), Math.sin(ay), Math.cos(az), Math.sin(az)];
  // Rz * Ry * Rx
  return [cc * cb, cc * sb * sa - sc * ca, cc * sb * ca + sc * sa, sc * cb, sc * sb * sa + cc * ca, sc * sb * ca - cc * sa, -sb, cb * sa, cb * ca];
}
const mulV = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
const FLAT_K = { rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0, fx: 0, fy: 0, fz: 1 };
function drawBall(ctx, sx, sy, r, M, K = FLAT_K, o = {}) {
  if (r < 0.6) return;
  const scr = v => { const w = mulV(M, v); return [w[0] * K.rx + w[1] * K.ry + w[2] * K.rz, -(w[0] * K.ux + w[1] * K.uy + w[2] * K.uz), -(w[0] * K.fx + w[1] * K.fy + w[2] * K.fz)]; };
  ctx.save();
  ctx.translate(sx, sy);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.clip();
  const base = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.05);
  base.addColorStop(0, '#ffffff'); base.addColorStop(0.55, '#e6e9f2'); base.addColorStop(1, '#8a93a8');
  ctx.fillStyle = base; ctx.fillRect(-r, -r, 2 * r, 2 * r);
  if (r > 3) PANELS.forEach((P, i) => {
    const c = scr(P.v); if (c[2] < -0.35) return;
    ctx.beginPath();
    P.pts.forEach((p, k) => { let q = scr(p); if (q[2] < 0) { const l = Math.hypot(q[0], q[1]) || 1; q = [q[0] / l, q[1] / l]; }
      k ? ctx.lineTo(q[0] * r, q[1] * r) : ctx.moveTo(q[0] * r, q[1] * r); });
    ctx.closePath(); ctx.fillStyle = PANEL_COL[i]; ctx.globalAlpha = clamp(0.4 + c[2] * 1.2, 0, 1) * 0.95; ctx.fill();
    ctx.globalAlpha = 1;
  });
  if (r > 12) { ctx.strokeStyle = 'rgba(60,70,95,0.55)'; ctx.lineWidth = Math.max(0.8, r * 0.014); ctx.beginPath();
    for (const sm of SEAMS) { let pen = false; for (const p of sm) { const q = scr(p); if (q[2] < 0.02) { pen = false; continue; } pen ? ctx.lineTo(q[0] * r, q[1] * r) : ctx.moveTo(q[0] * r, q[1] * r); pen = true; } }
    ctx.stroke(); }
  const sh = ctx.createRadialGradient(-r * 0.4, -r * 0.45, r * 0.2, -r * 0.1, -r * 0.1, r * 1.35);
  sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(0.55, 'rgba(0,0,10,0.12)'); sh.addColorStop(1, 'rgba(0,0,20,0.78)');
  ctx.fillStyle = sh; ctx.fillRect(-r, -r, 2 * r, 2 * r);
  ctx.globalCompositeOperation = 'lighter';
  const sp = ctx.createRadialGradient(-r * 0.38, -r * 0.42, 0, -r * 0.38, -r * 0.42, r * 0.5);
  sp.addColorStop(0, 'rgba(255,255,255,0.75)'); sp.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sp; ctx.fillRect(-r, -r, 2 * r, 2 * r);
  if (o.rim) { const rim = ctx.createRadialGradient(0, 0, r * 0.82, 0, 0, r); rim.addColorStop(0, 'rgba(0,0,0,0)'); rim.addColorStop(1, hex(o.rim, 0.3));
    ctx.fillStyle = rim; ctx.fillRect(-r, -r, 2 * r, 2 * r); }
  ctx.restore();
}

// ------------------------------------------------------------------ stadium model
const STAD = (() => {
  const A = 60, Bz = 41, N = 112, r = rng(7);
  const hOf = d => d <= 18 ? 1.2 + d * 0.56 : d <= 19 ? 11.3 + (d - 18) * 2.2 : 13.5 + (d - 19) * 0.74;
  const P = (th, d, h) => { const c = Math.cos(th), s = Math.sin(th);
    return [Math.sign(c) * Math.pow(Math.abs(c), 0.55) * (A + d), h === undefined ? hOf(d) : h, Math.sign(s) * Math.pow(Math.abs(s), 0.55) * (Bz + d)]; };
  const secs = [];
  for (let i = 0; i < N; i++) {
    const t0 = i / N * Math.PI * 2, t1 = (i + 1) / N * Math.PI * 2, tm = (t0 + t1) / 2;
    const tiers = [[0, 18], [19, 40]].map(([d0, d1]) => [P(t0, d0), P(t1, d0), P(t1, d1), P(t0, d1)]);
    const crowd = [];
    [[0.6, 17.6, 150], [19.4, 39.4, 190]].forEach(([d0, d1, n]) => {
      for (let k = 0; k < n; k++) { const th = lerp(t0, t1, r()), d = lerp(d0, d1, Math.pow(r(), 0.9)); const p = P(th, d);
        crowd.push(p[0], p[1] + 0.55, p[2], r(), r()); }
    });
    secs.push({ i, tm, tiers, crowd: new Float32Array(crowd), mid: P(tm, 20, 16),
      ribbon: [P(t0, 18, 11.3), P(t1, 18, 11.3), P(t1, 18.6, 13.4), P(t0, 18.6, 13.4)],
      facade: [P(t0, 41, 0), P(t1, 41, 0), P(t1, 41, 31), P(t0, 41, 31)],
      roof: [P(t0, 12, 34), P(t1, 12, 34), P(t1, 43, 31.5), P(t0, 43, 31.5)],
      light: P(tm, 12.5, 33.6), lightOn: i % 2 === 0 });
  }
  const city = []; const rc = rng(21);
  for (let k = 0; k < 4200; k++) { const a = rc() * Math.PI * 2, d = 130 + Math.pow(rc(), 0.7) * 1500;
    const gx = Math.round(Math.cos(a) * d / 18) * 18 + (rc() - 0.5) * 6, gz = Math.round(Math.sin(a) * d / 18) * 18 + (rc() - 0.5) * 6;
    city.push([gx, 0.5, gz, rc()]); }
  return { secs, P, city, A, Bz };
})();

const THEMES = {
  mixed: { crowd: ['#d83a4c', '#dfe3ee', '#1fa866', '#3d6fe0', '#e8b650', '#c86a4a', '#8fb8e0'], dark: 0.62, ribbon: [C.red, C.green, C.blue], sky: ['#02040b', '#0b1633'] },
  mexico: { crowd: ['#1fa866', '#dfe3ee', '#d83a4c', '#138a50', '#4fcf8a'], dark: 0.6, ribbon: [C.green, C.white, C.red], sky: ['#02060a', '#0a1f22'] },
  usa: { crowd: ['#3d6fe0', '#dfe3ee', '#d83a4c', '#6a8fd0'], dark: 0.6, ribbon: [C.blue, C.white, C.red], sky: ['#02040c', '#0d1740'] },
};
const DARKS = ['#262c40', '#2f2a3a', '#1f2a33', '#3a3a48', '#20243a'];

function drawPitch(ctx, K) {
  ctx.fillStyle = '#0b2014'; ctx.beginPath(); poly3(ctx, K, [[-61, 0, -42], [61, 0, -42], [61, 0, 42], [-61, 0, 42]]); ctx.fill();
  const NS = 18;
  for (let i = 0; i < NS; i++) {
    const x0 = -52.5 + 105 * i / NS, x1 = -52.5 + 105 * (i + 1) / NS;
    ctx.fillStyle = i % 2 ? '#1f6a33' : '#1a5c2c';
    ctx.beginPath(); poly3(ctx, K, [[x0, 0, -34], [x1, 0, -34], [x1, 0, 34], [x0, 0, 34]]); ctx.fill();
  }
  // light pools from the floodlights
  const c0 = proj(K, 0, 0, 0);
  if (c0) { const rr = 70 * K.focal / c0[2]; const g = ctx.createRadialGradient(c0[0], c0[1], 0, c0[0], c0[1], rr);
    g.addColorStop(0, 'rgba(190,255,200,0.10)'); g.addColorStop(1, 'rgba(190,255,200,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  // markings
  const L = [];
  const line = (a, b, n = 8) => { for (let k = 0; k < n; k++) L.push([[lerp(a[0], b[0], k / n), 0.02, lerp(a[1], b[1], k / n)], [lerp(a[0], b[0], (k + 1) / n), 0.02, lerp(a[1], b[1], (k + 1) / n)]]); };
  const arc = (cx, cz, r, a0, a1, n = 24) => { for (let k = 0; k < n; k++) { const u = lerp(a0, a1, k / n), v = lerp(a0, a1, (k + 1) / n);
    L.push([[cx + Math.cos(u) * r, 0.02, cz + Math.sin(u) * r], [cx + Math.cos(v) * r, 0.02, cz + Math.sin(v) * r]]); } };
  line([-52.5, -34], [52.5, -34], 16); line([-52.5, 34], [52.5, 34], 16); line([-52.5, -34], [-52.5, 34], 10); line([52.5, -34], [52.5, 34], 10); line([0, -34], [0, 34], 10);
  arc(0, 0, 9.15, 0, Math.PI * 2, 36);
  for (const s of [-1, 1]) {
    const gx = 52.5 * s;
    line([gx, -20.16], [gx - 16.5 * s, -20.16], 3); line([gx - 16.5 * s, -20.16], [gx - 16.5 * s, 20.16], 6); line([gx - 16.5 * s, 20.16], [gx, 20.16], 3);
    line([gx, -9.16], [gx - 5.5 * s, -9.16], 1); line([gx - 5.5 * s, -9.16], [gx - 5.5 * s, 9.16], 3); line([gx - 5.5 * s, 9.16], [gx, 9.16], 1);
    const a = Math.acos(5.5 / 9.15); arc(gx - 11 * s, 0, 9.15, s > 0 ? Math.PI - a : -a, s > 0 ? Math.PI + a : a, 10);
  }
  ctx.strokeStyle = 'rgba(240,255,245,0.85)'; ctx.lineCap = 'round';
  for (const [a, b] of L) { ctx.beginPath(); const z = seg3(ctx, K, a, b); if (!z) continue; ctx.lineWidth = clamp(0.13 * K.focal / z, 0.6, 7); ctx.stroke(); }
}

function drawGoal(ctx, K, gx, net = null) {
  const s = Math.sign(gx), back = gx + 2.0 * s, top = 2.44, zw = 3.66;
  // net
  ctx.strokeStyle = net ? 'rgba(235,240,255,0.42)' : 'rgba(235,240,255,0.3)'; ctx.lineWidth = net ? 1.3 : 1;
  const disp = net ? net : () => 0;
  const NP = (y, z, depth) => [gx + s * depth + s * disp(y, z) * (depth / 2), y, z];
  ctx.beginPath();
  for (let z = -zw; z <= zw + 1e-6; z += 0.3) {
    let prev2 = null; for (let d = 0; d <= 2.0001; d += 0.5) { const p = NP(top, z, d); if (prev2) seg3(ctx, K, prev2, p); prev2 = p; } }
  for (let c = -zw - top; c <= zw + top; c += net ? 0.15 : 0.3) for (const sg of [1, -1]) { let prev = null;
    for (let z = -zw; z <= zw + 1e-6; z += 0.12) { const y = sg * (z - c); if (y < 0 || y > top) { prev = null; continue; } const p = NP(y, z, 2.0); if (prev) seg3(ctx, K, prev, p); prev = p; } }
  for (let y = 0; y <= top + 1e-6; y += 0.3) {
    for (const z of [-zw, zw]) { let pv = null; for (let d = 0; d <= 2.0001; d += 0.5) { const p = NP(y, z, d); if (pv) seg3(ctx, K, pv, p); pv = p; } } }
  for (let d = 0; d <= 2.0001; d += 0.3) { let prev = null; for (let z = -zw; z <= zw + 1e-6; z += 0.61) { const p = NP(top, z, d); if (prev) seg3(ctx, K, prev, p); prev = p; } }
  ctx.stroke();
  // frame
  ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round';
  for (const [a, b] of [[[gx, 0, -zw], [gx, top, -zw]], [[gx, top, -zw], [gx, top, zw]], [[gx, top, zw], [gx, 0, zw]]]) {
    for (let k = 0; k < 6; k++) { const p = a.map((v, i) => lerp(v, b[i], k / 6)), q = a.map((v, i) => lerp(v, b[i], (k + 1) / 6));
      ctx.beginPath(); const z = seg3(ctx, K, p, q); if (!z) continue; ctx.lineWidth = clamp(0.12 * K.focal / z, 1, 60); ctx.stroke(); }
  }
}

function drawStadium(ctx, K, t, o = {}) {
  const th = THEMES[o.theme || 'mixed'];
  const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, th.sky[0]); sky.addColorStop(1, th.sky[1]);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  if (K.py > 20) { // surrounding city at night
    ctx.fillStyle = '#05070c'; ctx.beginPath(); poly3(ctx, K, [[-2000, 0, -2000], [2000, 0, -2000], [2000, 0, 2000], [-2000, 0, 2000]]); ctx.fill();
    for (const [x, y, z, u] of STAD.city) { const p = proj(K, x, y, z); if (!p) continue; const a = clamp(1 - p[2] / 1600) * (0.35 + 0.65 * u);
      ctx.fillStyle = u > 0.8 ? `rgba(160,200,255,${a})` : `rgba(255,${190 + (u * 50) | 0},130,${a})`; const sz = clamp(260 / p[2], 0.7, 3); ctx.fillRect(p[0], p[1], sz, sz); }
  }
  drawPitch(ctx, K);
  if (o.goals) { drawGoal(ctx, K, -52.5); if (!o.skipGoal2) drawGoal(ctx, K, 52.5, o.net); }
  const above = K.py > 33;
  const order = STAD.secs.map(s => { const v = toCam(K, s.mid[0], s.mid[1], s.mid[2]); return [v[2], s]; }).sort((a, b) => b[0] - a[0]);
  const frame = Math.floor(t * 15), bounce = o.bounce || 0;
  const cols = th.crowd, dk = th.dark;
  for (const [, s] of order) {
    const lightFace = 0.6 + 0.4 * Math.cos(s.tm - 0.8);
    const ox = s.mid[0], oz = s.mid[2], ol = Math.hypot(ox, oz), vx = K.px - ox, vy = K.py - s.mid[1], vz = K.pz - oz;
    const facesOut = (ox * vx + oz * vz) / ol > 0, standsVisible = !(above && facesOut);
    if (above && facesOut) { ctx.fillStyle = '#0c101c'; ctx.beginPath(); if (poly3(ctx, K, s.facade)) ctx.fill(); }
    if (standsVisible) {
    s.tiers.forEach((q, ti) => { ctx.fillStyle = mixHex('#141a2c', '#2a3150', lightFace * (ti ? 0.7 : 1)); ctx.beginPath(); if (poly3(ctx, K, q)) ctx.fill(); });
    const cr = s.crowd;
    for (let k = 0; k < cr.length; k += 5) {
      const u = cr[k + 3], ph = cr[k + 4];
      const jump = bounce ? bounce * 0.35 * Math.max(0, Math.sin((t / BEAT + ph) * Math.PI * 2)) : 0;
      const dx = cr[k] - K.px, dy = cr[k + 1] + jump - K.py, dz = cr[k + 2] - K.pz;
      const z = dx * K.fx + dy * K.fy + dz * K.fz; if (z < 1) continue;
      const sx = K.cx + (dx * K.rx + dy * K.ry + dz * K.rz) * K.focal / z, sy = K.cy - (dx * K.ux + dy * K.uy + dz * K.uz) * K.focal / z;
      if (sx < -10 || sx > W + 10 || sy < -10 || sy > H + 10) continue;
      const sz = clamp(0.62 * K.focal / z, 0.7, 9);
      const flash = hash(k, frame) > 0.9965;
      if (flash) { ctx.drawImage(GLOW_W, sx - sz * 3, sy - sz * 3, sz * 6, sz * 6); continue; }
      ctx.globalAlpha = clamp(1.25 - z / 700) * lightFace;
      ctx.fillStyle = u < dk ? DARKS[(u * 97 | 0) % 5] : cols[((u - dk) / (1 - dk) * cols.length) | 0];
      ctx.fillRect(sx - sz / 2, sy - sz / 2, sz, sz * 1.3);
    }
    ctx.globalAlpha = 1;
    // LED ribbon between the tiers
    const rc = th.ribbon[Math.floor((s.i + t * 12) / 6) % th.ribbon.length];
    ctx.fillStyle = rc; ctx.beginPath(); if (poly3(ctx, K, s.ribbon)) { ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1; }
    }
    // roof
    ctx.beginPath(); if (poly3(ctx, K, s.roof)) { ctx.fillStyle = above ? '#1a2032' : '#070910'; ctx.fill(); if (above) { ctx.strokeStyle = 'rgba(150,170,210,0.25)'; ctx.lineWidth = 1; ctx.stroke(); } }
    if (s.lightOn) { const p = proj(K, ...s.light); if (p) { const sz = clamp(9 * K.focal / p[2], 6, 160);
      ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(GLOW_W, p[0] - sz, p[1] - sz, sz * 2, sz * 2); ctx.globalCompositeOperation = 'source-over'; } }
  }
}

// ------------------------------------------------------------------ map
const COAST = [[-166,68.9],[-156.5,71.3],[-148,70.3],[-141,69.6],[-135,69],[-129,70],[-120,69.5],[-114,68.5],[-108,68.3],[-100,67.8],[-95,68],[-90,68.5],[-85,69.5],[-82,66.5],[-86,64.5],[-90,64],[-94,61],[-94,59],[-92.5,57],[-88,56],[-82.5,55],[-82,52.5],[-80,51.2],[-79,54.5],[-77,56.5],[-76.5,59],[-78,62],[-73,62.3],[-70,61],[-65,60.3],[-64.5,58.5],[-61.5,56],[-57,54],[-55.7,52],[-59,50.2],[-64,50.1],[-66.5,49.3],[-64.5,48.9],[-65,47.8],[-64.5,46.3],[-60,46],[-61.5,45],[-66,43.6],[-66,45.2],[-67.2,44.6],[-70.2,43.6],[-70.6,42.6],[-70,41.8],[-71.8,41.3],[-74,40.5],[-74,39.5],[-75.5,38.5],[-76,37],[-75.5,35.3],[-77.9,33.9],[-79.2,33.1],[-81,31.7],[-81.3,30],[-80,26.8],[-80.4,25.2],[-81.2,25.3],[-82.7,27.8],[-82.8,29.2],[-84.3,30],[-86,30.4],[-89.5,30.2],[-89.3,29.1],[-91,29.2],[-94,29.6],[-97,27.7],[-97.4,25.9],[-97.7,22.5],[-97.3,20.8],[-95.9,18.8],[-94.5,18.2],[-92,18.6],[-91,19.3],[-90.4,21],[-87,21.5],[-87.5,19.5],[-88.2,17.9],[-88.2,16],[-86,15.9],[-83.3,15],[-83.6,11],[-82,9],[-79.5,9.5],[-77.4,8.7],[-78.2,7.5],[-80.4,7.4],[-82.9,8.1],[-85.7,10],[-85.8,11.2],[-87.6,13],[-91.4,13.9],[-92.2,14.5],[-94,16],[-96.5,15.7],[-98.5,16.3],[-101.5,17.6],[-104.9,19.3],[-105.6,20.4],[-105.2,21.6],[-106.8,23.4],[-108.4,25.2],[-109.4,26.6],[-111,28.3],[-112.8,30.3],[-114.7,31.7],[-114.5,30.5],[-112.8,27.9],[-111,25.5],[-110,24],[-109.5,23.2],[-110.3,23.4],[-112.2,24.8],[-112.5,26.5],[-114.2,27.8],[-115.6,29.6],[-117.1,32.5],[-118.5,34],[-120.6,34.6],[-121.9,36.6],[-122.5,37.8],[-123.8,39.8],[-124.4,42],[-124,46.2],[-124.7,48.4],[-123.2,49],[-125,50],[-127.9,50.8],[-128,52],[-130.3,54.3],[-131.5,55.5],[-133.5,57.5],[-136.5,58.5],[-139.8,59.8],[-145,60.3],[-148,60],[-151.5,59.2],[-154,57.3],[-158,56.5],[-162,55],[-164.8,54.4],[-160,58.5],[-162,60],[-165.2,60.7],[-164.5,63],[-161,64.5],[-165.3,64.5],[-168,65.6],[-164.5,66.6]];
const LAKES = [[[-92,46.7],[-84.5,46.5],[-84.8,47.9],[-88,48.8],[-90,47.9]], [[-87.8,41.7],[-86.3,42.3],[-85.5,45.7],[-88,45.8],[-87.8,44]], [[-84.3,43.9],[-82.5,43.1],[-81.7,45],[-81,46],[-84,46],[-84.5,45.3]],
  [[-83.4,41.7],[-78.9,42.8],[-79.3,42.5],[-81.6,41.5]], [[-79.8,43.3],[-76.2,43.5],[-76.5,44.2],[-79.2,43.8]]];
const inPoly = (x, y, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
  if ((P[i][1] > y) !== (P[j][1] > y) && x < (P[j][0] - P[i][0]) * (y - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; } return c; };
const pwl = (P, x) => { for (let i = 0; i < P.length - 1; i++) if (x >= P[i][0] && x <= P[i + 1][0]) return lerp(P[i][1], P[i + 1][1], (x - P[i][0]) / (P[i + 1][0] - P[i][0])); return null; };
const CANB = [[-141, 49], [-95, 49], [-89, 48], [-84.5, 46.5], [-82.5, 45.3], [-82.5, 42], [-79, 42.8], [-76, 44], [-74.7, 45], [-71.5, 45], [-70, 46.5], [-69, 47.4], [-68, 47.1], [-67, 45.2], [-60, 45]];
const MEXB = [[-118, 32.5], [-114.7, 32.7], [-111, 31.3], [-108.2, 31.3], [-106.5, 31.8], [-104.5, 29.6], [-103, 29], [-101.4, 29.8], [-99.5, 27.5], [-97.2, 25.9], [-96, 25.9]];
function country(lon, lat) {
  if (lon < -141) return 1;                               // Alaska
  if (lat < 18.2 && lon > -92.2) return 3;                // Central America (neutral)
  const cb = pwl(CANB, lon); if (cb !== null && lat > cb) return 0; if (lon > -141 && lat > 49 && lon < -95) return 0;
  if (lon > -67) return lat > 44.9 ? 0 : 1;
  const mb = pwl(MEXB, lon); if (mb !== null && lat < mb) return 2; if (lon < -118 && lat < 32.5) return 2;
  return 1;
}
const MAPDOTS = (() => { const d = [];
  for (let lat = 6; lat < 72; lat += 0.62) { const step = 0.62 / Math.cos(lat * Math.PI / 180);
    for (let lon = -170; lon < -52; lon += step) { const jx = lon + (hash(lat * 100 | 0, lon * 100 | 0) - 0.5) * 0.08;
      if (!inPoly(jx, lat, COAST) || LAKES.some(L => inPoly(jx, lat, L))) continue; d.push([jx, lat, country(jx, lat), hash(lon * 7 | 0, lat * 13 | 0)]); } }
  return d; })();
const CITIES = [
  ['VANCOUVER', 49.28, -123.12, 0, -1, -16, 'right'], ['SEATTLE', 47.61, -122.33, 1, 1, 22, 'left'], ['SAN FRANCISCO BAY AREA', 37.40, -121.97, 1, -1, 4, 'right'],
  ['LOS ANGELES', 33.95, -118.34, 1, -1, 18, 'right'], ['GUADALAJARA', 20.68, -103.46, 2, -1, 4, 'right'], ['MEXICO CITY', 19.30, -99.15, 2, 1, 26, 'left'],
  ['MONTERREY', 25.67, -100.24, 2, 1, 6, 'left'], ['DALLAS', 32.75, -97.09, 1, -1, -8, 'right'], ['HOUSTON', 29.68, -95.41, 1, 1, 24, 'left'],
  ['KANSAS CITY', 39.05, -94.48, 1, 1, 6, 'left'], ['ATLANTA', 33.75, -84.40, 1, 1, 6, 'left'], ['MIAMI', 25.96, -80.24, 1, 1, 6, 'left'],
  ['TORONTO', 43.65, -79.38, 0, -1, -16, 'right'], ['BOSTON', 42.09, -71.26, 1, 1, -6, 'left'], ['PHILADELPHIA', 39.90, -75.17, 1, 1, 26, 'left'], ['NEW YORK NEW JERSEY', 40.81, -74.07, 1, 1, 8, 'left']];
const NCOL = [C.red, C.blue, C.green, '#5a6275'];
function ortho(lon, lat, lon0, lat0) {
  const r = Math.PI / 180, cl = Math.cos(lat * r);
  const x = cl * Math.sin((lon - lon0) * r), y = Math.cos(lat0 * r) * Math.sin(lat * r) - Math.sin(lat0 * r) * cl * Math.cos((lon - lon0) * r);
  const vis = Math.sin(lat0 * r) * Math.sin(lat * r) + Math.cos(lat0 * r) * cl * Math.cos((lon - lon0) * r);
  return [x, y, vis];
}

// ------------------------------------------------------------------ skylines for the nation panels
function skyline(seed, kind) {
  const c = mk(700, 520), g = c.getContext('2d'), r = rng(seed);
  g.fillStyle = '#000';
  let x = -10;
  while (x < 710) { const w = 26 + r() * 60, h = 60 + Math.pow(r(), 1.6) * 250; g.fillRect(x, 520 - h, w, h); x += w + r() * 6; }
  if (kind === 0) { g.fillRect(346, 90, 8, 430); g.beginPath(); g.ellipse(350, 250, 24, 14, 0, 0, Math.PI * 2); g.fill(); g.fillRect(330, 262, 40, 12); g.fillRect(349, 10, 2, 90); }
  if (kind === 1) { g.beginPath(); g.moveTo(180, 520); g.bezierCurveTo(230, 330, 470, 330, 520, 520); g.fill(); g.fillRect(420, 190, 14, 330); g.beginPath(); g.arc(427, 180, 12, 0, 7); g.fill(); }
  if (kind === 2) { g.fillRect(300, 150, 100, 370); g.fillRect(318, 100, 64, 60); g.fillRect(335, 60, 30, 50); g.fillRect(348, 0, 4, 70); g.fillRect(470, 190, 70, 330); g.fillRect(140, 220, 80, 300); }
  g.globalCompositeOperation = 'source-atop';
  for (let k = 0; k < 900; k++) { g.fillStyle = r() > 0.35 ? `rgba(255,${200 + r() * 50 | 0},150,${0.35 + r() * 0.5})` : 'rgba(150,200,255,0.5)';
    g.fillRect((r() * 175 | 0) * 4, 250 + (r() * 67 | 0) * 4, 2, 2); }
  return c;
}
const SKY = [skyline(3, 0), skyline(5, 1), skyline(9, 2)];

// ------------------------------------------------------------------ shared overlays
function letterbox(ctx, k) { if (k <= 0) return; const h = 132 * k; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, h); ctx.fillRect(0, H - h, W, h); }
function triBar(ctx, x, y, w, h, p = 1) {
  const cols = [C.red, C.green, C.blue];
  cols.forEach((c, i) => { const seg = w / 3; const pw = clamp(p * 3 - i) * seg; if (pw <= 0) return; ctx.fillStyle = c; ctx.fillRect(x + seg * i, y, pw, h); });
}
function bokeh(ctx, t, n, seed, o = {}) {
  const r = rng(seed); ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const x0 = r() * W, y0 = r() * H, s = 20 + r() * (o.max || 110), sp = (r() - 0.5) * (o.speed || 30), col = r();
    const x = ((x0 + t * sp + W * 2) % (W + 200)) - 100, y = y0 + Math.sin(t * 0.7 + i) * 10;
    ctx.globalAlpha = (0.08 + r() * 0.18) * (o.alpha || 1);
    ctx.drawImage(col > 0.75 ? glowTint(C.blue) : col > 0.55 ? glowTint(C.red) : col > 0.4 ? glowTint(C.green) : GLOW_SOFT, x - s, y - s, s * 2, s * 2);
  }
  ctx.restore();
}
// confetti in 3D-ish screen space with depth-based blur
const CONF = (() => { const r = rng(44), a = []; for (let i = 0; i < 700; i++) a.push({ x: r() * 2 - 1, y: r(), z: 0.15 + r() * 1.6, c: [C.red, C.green, C.blue, C.white, C.gold][r() * 5 | 0], ph: r() * 6.28, sp: 0.6 + r(), sw: r() }); return a; })();
function confetti(ctx, t, amt, burstT = null) {
  ctx.save();
  for (const p of CONF) {
    if (hash(p.ph * 1000 | 0) > amt) continue;
    let y = ((p.y + t * 0.09 * p.sp) % 1.2) - 0.1, x = p.x + Math.sin(t * 1.3 * p.sp + p.ph) * 0.05;
    if (burstT !== null) { const dt = t - burstT; const e = eo3(dt * 1.6); y = lerp(0.95, -0.1 + p.y * 0.9, e) + Math.max(0, dt - 0.4) * 0.05 * p.sp; x = p.x * lerp(0.05, 1, e); }
    const sx = W / 2 + x * W * 0.6 / p.z, sy = H * 0.5 + (y - 0.5) * H / p.z, s = 14 / p.z;
    const fl = Math.cos(t * 6 * p.sp + p.ph);
    ctx.globalAlpha = clamp(1.3 - Math.abs(p.z - 0.8) * 0.7);
    ctx.fillStyle = p.c; ctx.save(); ctx.translate(sx, sy); ctx.rotate(p.ph + t * p.sp * 2); ctx.fillRect(-s / 2, -s * 0.3 * Math.abs(fl), s, s * 0.6 * Math.abs(fl) + 0.5); ctx.restore();
  }
  ctx.restore();
}

// ------------------------------------------------------------------ shots
const SHOTS = {};

SHOTS.cold = (ctx, t) => {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const cx = W / 2, cy = 500, r = lerp(150, 200, eio(t / 4)) + (t > 3.4 ? eo3((t - 3.4) / 0.6) * 90 : 0);
  // cone of light
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const cone = ctx.createLinearGradient(0, -100, 0, H); cone.addColorStop(0, 'rgba(210,225,255,0.20)'); cone.addColorStop(1, 'rgba(210,225,255,0.02)');
  ctx.fillStyle = cone; ctx.beginPath(); ctx.moveTo(cx - 60, -40); ctx.lineTo(cx + 60, -40); ctx.lineTo(cx + 520, H); ctx.lineTo(cx - 520, H); ctx.fill();
  const floor = ctx.createRadialGradient(cx, 930, 10, cx, 930, 560); floor.addColorStop(0, 'rgba(60,140,80,0.35)'); floor.addColorStop(1, 'rgba(20,60,30,0)');
  ctx.fillStyle = floor; ctx.save(); ctx.scale(1, 0.22); ctx.fillRect(0, 930 / 0.22 - 700, W, 1400); ctx.restore();
  const r0 = rng(12);
  for (let i = 0; i < 160; i++) { const x = cx + (r0() - 0.5) * 900 * (0.3 + r0()), y = ((r0() * H + t * (8 + r0() * 20)) % H), s = 1 + r0() * 3;
    const inCone = clamp(1 - Math.abs(x - cx) / (60 + y * 0.45)); ctx.globalAlpha = inCone * (0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2 + i)));
    ctx.drawImage(GLOW_SOFT, x - s * 4, y - s * 4, s * 8, s * 8); }
  ctx.restore();
  // contact shadow
  const sh = ctx.createRadialGradient(cx, 905, 0, cx, 905, 240); sh.addColorStop(0, 'rgba(0,0,0,0.7)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save(); ctx.scale(1, 0.18); ctx.fillStyle = sh; ctx.fillRect(cx - 300, 905 / 0.18 - 300, 600, 600); ctx.restore();
  const spin = t * 0.5 + Math.pow(ss(3.0, 4.0, t), 2) * 5;
  drawBall(ctx, cx, cy + Math.sin(t * 1.6) * 6, r, rotMat(0.35 + t * 0.05, spin, 0.2), FLAT_K, { rim: '#9fc0ff' });
  reveal(ctx, 'ONE BALL.', cx, 850, t, 1.0, { size: 64, track: 26, align: 'center', tOut: 3.1 });
};

SHOTS.nations = (ctx, t) => {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const names = ['CANADA', 'MÉXICO', 'USA'], deep = [['#3a0610', C.cRed], ['#022517', '#0a7a4c'], ['#040c26', '#1a3f8f']];
  const lists = ['TORONTO · VANCOUVER', 'GUADALAJARA · MEXICO CITY · MONTERREY', '11 HOST CITIES'];
  const sk = 110, pw = W / 3;
  const push = 1 + t * 0.012 + ss(3.6, 4, t) * 0.08;
  ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(push, push); ctx.translate(-W / 2, -H / 2);
  for (let i = 0; i < 3; i++) {
    const tin = TL.nationHits[i] * BAR - B2S(2), p = eo5((t - tin) / 0.55); if (p <= 0) continue;
    const x0 = i * pw, x1 = (i + 1) * pw;
    ctx.save(); ctx.beginPath();
    const yT = lerp(H, -20, p);
    ctx.moveTo(x0 + (i ? sk / 2 : -sk), yT); ctx.lineTo(x1 + (i < 2 ? sk / 2 : sk), yT); ctx.lineTo(x1 - (i < 2 ? sk / 2 : -sk), H + 20); ctx.lineTo(x0 - (i ? sk / 2 : sk), H + 20); ctx.closePath(); ctx.clip();
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, deep[i][0]); g.addColorStop(0.75, deep[i][1]); g.addColorStop(1, deep[i][0]);
    ctx.fillStyle = g; ctx.fillRect(x0 - sk, 0, pw + sk * 2, H);
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 5; k++) { const bx = x0 + pw * (0.15 + k * 0.18) + Math.sin(t * 0.8 + k + i) * 30; const bg = ctx.createLinearGradient(bx, 0, bx + 120, H);
      bg.addColorStop(0, 'rgba(255,255,255,0.10)'); bg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = bg;
      ctx.beginPath(); ctx.moveTo(bx - 8, 0); ctx.lineTo(bx + 8, 0); ctx.lineTo(bx + 200, H); ctx.lineTo(bx + 60, H); ctx.fill(); }
    ctx.globalCompositeOperation = 'source-over';
    const par = (t - tin) * 14;
    ctx.globalAlpha = 0.95; ctx.drawImage(SKY[i], x0 + pw / 2 - 350 - par * (i - 1), H - 520 + 30 * (1 - p)); ctx.globalAlpha = 1;
    const fl = 1 - eo3((t - tin) / 0.35); if (fl > 0) { ctx.fillStyle = `rgba(255,255,255,${fl * 0.6})`; ctx.fillRect(x0 - sk, 0, pw + 2 * sk, H); }
    ctx.restore();
    reveal(ctx, names[i], x0 + pw / 2, 610, t, tin + 0.08, { size: 118, track: 6, align: 'center', dur: 0.45, shadow: 'rgba(0,0,0,0.5)' });
    reveal(ctx, lists[i], x0 + pw / 2, 668, t, tin + 0.3, { size: 22, weight: 700, track: 5, align: 'center', alpha: 0.85 });
  }
  ctx.restore();
  // seams
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 1; i < 3; i++) { const p = eo5((t - (TL.nationHits[i] * BAR - B2S(2))) / 0.55); if (p <= 0) continue; const x = i * pw;
    ctx.strokeStyle = `rgba(255,255,255,${0.6 * p})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + sk / 2, -20); ctx.lineTo(x - sk / 2, H + 20); ctx.stroke(); }
  ctx.restore();
  reveal(ctx, 'THREE NATIONS.', W / 2, 250, t, 1.5, { size: 96, track: 12, align: 'center', shadow: 'rgba(0,0,0,0.6)', blur: 40 });
  reveal(ctx, 'For the first time, three countries host together.', W / 2, 318, t, 2.0, { size: 44, weight: 400, fam: 'Instrument Serif', italic: true, align: 'center', shadow: 'rgba(0,0,0,0.7)' });
};

SHOTS.map = (ctx, t) => {
  const bg = ctx.createRadialGradient(W * 0.6, H * 0.45, 50, W * 0.6, H * 0.5, W * 0.8); bg.addColorStop(0, '#0c1a3a'); bg.addColorStop(1, '#010309');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const NY = CITIES[15];
  const zin = Math.pow(ss(5.2, 6, t), 2);
  const lon0 = lerp(-101, -96, t / 6) + zin * ( NY[2] + 96 ) * 0.7, lat0 = 36 + zin * 4;
  const R = lerp(1180, 1340, eio(t / 6)) * (1 + zin * 2.6), cx = 1060 - zin * 100, cy = 560;
  const P = (lon, lat) => { const o = ortho(lon, lat, lon0, lat0); return [cx + o[0] * R, cy - o[1] * R, o[2]]; };
  // globe limb glow
  const lg = ctx.createRadialGradient(cx, cy + R * 0.02, R * 0.96, cx, cy, R * 1.06); lg.addColorStop(0, 'rgba(60,120,255,0)'); lg.addColorStop(0.5, 'rgba(60,120,255,0.18)'); lg.addColorStop(1, 'rgba(60,120,255,0)');
  ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
  const lit = CITIES.map((c, i) => [i, TL.cityStart * BAR + i * TL.cityStep * BAR - B2S(4)]);
  const cityP = CITIES.map(c => P(c[2], c[1]));
  // dots
  for (const [lon, lat, cn, u] of MAPDOTS) {
    const p = P(lon, lat); if (p[2] < 0 || p[0] < -5 || p[0] > W + 5 || p[1] < -5 || p[1] > H + 5) continue;
    const appear = clamp((t - 0.05 - (p[0] / W) * 0.6 - u * 0.25) / 0.3);
    if (appear <= 0) continue;
    let b = 0;
    for (let i = 0; i < 16; i++) { const dt = t - lit[i][1]; if (dt < 0) continue; const d = Math.hypot(p[0] - cityP[i][0], p[1] - cityP[i][1]) / (R / 1200);
      const ring = dt * 520; b += Math.exp(-Math.pow((d - ring) / 30, 2)) * Math.exp(-dt * 1.6) + Math.exp(-d / 60) * 0.5; }
    ctx.globalAlpha = appear * clamp(0.5 + b * 0.8 + u * 0.15);
    ctx.fillStyle = b > 0.6 ? '#ffffff' : NCOL[cn];
    const s = 3.6 * R / 1250; ctx.fillRect(p[0] - s / 2, p[1] - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
  // tour path
  ctx.save(); ctx.lineCap = 'round';
  for (let i = 1; i < 16; i++) {
    const dt = t - lit[i][1] + 0.18; if (dt < 0) continue; const k = eo3(dt / 0.3);
    const a = cityP[i - 1], b = cityP[i], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dl = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ctl = [mx + (a[1] - b[1]) * 0.25, my - dl * 0.3];
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.6; ctx.beginPath();
    for (let s = 0; s <= 24; s++) { const u = s / 24 * k; const x = (1 - u) * (1 - u) * a[0] + 2 * u * (1 - u) * ctl[0] + u * u * b[0], y = (1 - u) * (1 - u) * a[1] + 2 * u * (1 - u) * ctl[1] + u * u * b[1]; s ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
  }
  ctx.restore();
  // cities
  CITIES.forEach((c, i) => {
    const dt = t - lit[i][1]; if (dt < 0) return; const [x, y] = cityP[i]; const col = NCOL[c[3]];
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const gs = 60 + 40 * Math.exp(-dt * 4); ctx.drawImage(glowTint(col), x - gs / 2, y - gs / 2, gs, gs);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = hex('#ffffff', Math.exp(-dt * 2) * 0.9); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 6 + eo3(dt / 0.8) * 50, 0, 7); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 5 * eback(dt / 0.25), 0, 7); ctx.fill();
    ctx.restore();
    const la = eo3(dt / 0.3) * (1 - zin);
    text(ctx, c[0], x + c[4] * 16, y + c[5], { size: 19, weight: 700, track: 2.5, align: c[6], alpha: la, shadow: 'rgba(0,0,0,0.9)', blur: 8 });
  });
  // counter
  const n = lit.filter(l => t >= l[1]).length; const fade = 1 - zin;
  if (n > 0) {
    const lp = t - lit[n - 1][1], bump = 1 + 0.08 * Math.exp(-lp * 10);
    ctx.save(); ctx.globalAlpha = fade; ctx.translate(150, 760); ctx.scale(bump, bump);
    text(ctx, String(n), 0, 0, { size: 260, weight: 900, track: -8 }); ctx.restore();
  }
  reveal(ctx, 'HOST CITIES', 158, 830, t, 0.6, { size: 42, weight: 800, track: 10, alpha: fade });
  ctx.globalAlpha = fade; triBar(ctx, 158, 860, 330, 8, eo3((t - 0.8) / 1.2)); ctx.globalAlpha = 1;
  reveal(ctx, 'Sixteen cities. One summer.', 158, 922, t, 1.3, { size: 42, weight: 400, fam: 'Instrument Serif', italic: true, alpha: 0.9 * fade });
};

SHOTS.stats = (ctx, t) => {
  ctx.fillStyle = '#02040a'; ctx.fillRect(0, 0, W, H);
  // rushing pitch lines, very dark
  const K = camera(-40 + t * 22, 3.2, -8, 20 + t * 22, 0.5, -2, 62, -0.05);
  ctx.save(); ctx.globalAlpha = 0.5; drawPitch(ctx, K); ctx.restore();
  const vg = ctx.createLinearGradient(0, 0, 0, H); vg.addColorStop(0, 'rgba(2,4,10,1)'); vg.addColorStop(0.45, 'rgba(2,4,10,0.55)'); vg.addColorStop(1, 'rgba(2,4,10,0.2)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  bokeh(ctx, t, 36, 5, { speed: 60, max: 140 });
  const items = [['48', 'NATIONS', 'The biggest field ever assembled.', C.red], ['104', 'MATCHES', 'Forty more than any tournament before.', C.green], ['39', 'DAYS', 'June 11 to July 19, 2026.', C.blue]];
  const i = clamp(Math.floor(t / BAR), 0, 2), lt = t - i * BAR; const [num, lab, sub, col] = items[i];
  const pin = eo5(lt / 0.32), pout = eio((lt - 1.72) / 0.28);
  const target = +num, shown = lt < 0.3 ? Math.round(target * eo3(lt / 0.3)) : target;
  const sc = lerp(1.6, 1, pin) * (1 + lt * 0.02);
  const nw = tw(num, 400, 900, -14);
  const lx = W / 2 - (nw + 60 + tw(lab, 120, 900, 4)) / 2;
  ctx.save(); ctx.translate(-pout * 900, 0); ctx.globalAlpha = pin * (1 - pout);
  // colour flare behind the number
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= 0.55 + 0.45 * Math.exp(-lt * 3);
  ctx.drawImage(glowTint(col), lx - 300, H / 2 - 520, nw + 600, 1000); ctx.restore();
  for (let g = 3; g >= 0; g--) { // motion ghosts on entry
    ctx.save(); const gs = sc + g * 0.06 * (1 - pin); ctx.translate(lx + nw / 2, 600 - 150); ctx.scale(gs, gs); ctx.globalAlpha *= g ? 0.18 * (1 - pin) : 1;
    text(ctx, String(shown), 0, 150, { size: 400, weight: 900, track: -14, align: 'center' }); ctx.restore(); }
  ctx.restore();
  ctx.save(); ctx.translate(-pout * 1200, 0);
  reveal(ctx, lab, lx + nw + 60, 505, lt, 0.12, { size: 120, weight: 900, track: 4, color: col, alpha: 1 - pout });
  ctx.globalAlpha = 1 - pout; ctx.fillStyle = col; ctx.fillRect(lx + nw + 64, 540, 380 * eo3((lt - 0.25) / 0.5), 6); ctx.globalAlpha = 1;
  reveal(ctx, sub, lx + nw + 62, 606, lt, 0.35, { size: 46, weight: 400, fam: 'Instrument Serif', italic: true, alpha: 0.9 * (1 - pout) });
  ctx.restore();
  // pre-drop build: strobing white
  if (t > 5.0) { const k = ss(5.0, 6.0, t); ctx.fillStyle = `rgba(255,255,255,${k * 0.35 * (0.5 + 0.5 * Math.sin(t * 60))})`; ctx.fillRect(0, 0, W, H); }
};

SHOTS.stadium = (ctx, t) => {
  const e = eio(t / 6), a = lerp(2.55, 1.05, e), rad = lerp(230, 30, eo3(t / 6)), h = lerp(140, 9, eio(t / 6));
  const K = camera(Math.cos(a) * rad, h, Math.sin(a) * rad, lerp(0, 8, e), lerp(0, 3, e), 0, lerp(46, 56, e), lerp(-0.04, 0.03, e));
  drawStadium(ctx, K, t + 20, { theme: 'mixed', goals: true, bounce: 1 });
  reveal(ctx, 'THE WHOLE WORLD', W / 2, 520, t, 1.0, { size: 108, track: 10, align: 'center', shadow: 'rgba(0,0,0,0.6)', blur: 40, tOut: 5.2 });
  reveal(ctx, 'IS COMING.', W / 2, 640, t, 1.5, { size: 108, track: 10, align: 'center', shadow: 'rgba(0,0,0,0.6)', blur: 40, tOut: 5.3 });
};

function ballFlight(t) { // t: seconds since 26.0; world position of the ball
  const u = t / 4;
  return [lerp(-8, 40, u), 0.11 + 7.5 * Math.sin(Math.PI * clamp(u * 0.92)) * 0.9, lerp(12, 1.5, u)];
}
SHOTS.flight = (ctx, t) => {
  const b = ballFlight(t);
  const back = lerp(0.9, 1.6, eio(t / 4));
  const K = camera(b[0] - back * 1.25, b[1] + 0.28 * back + 0.1, b[2] + back * 0.55, b[0] + 6, b[1] - 0.25, b[2] - 1.4, 50, Math.sin(t * 0.8) * 0.05);
  G.clearRect(0, 0, W, H); drawStadium(G, K, t + 26, { theme: 'mixed', goals: true, bounce: 1 });
  ctx.save(); ctx.filter = 'blur(2.5px)'; ctx.drawImage(BG, 0, 0); ctx.restore();
  // speed streaks
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; const r = rng(31);
  for (let i = 0; i < 90; i++) { const ang = r() * Math.PI * 2, ph = (r() + t * (1.5 + r())) % 1, d0 = 180 + ph * 1000;
    const x = W * 0.55 + Math.cos(ang) * d0, y = H * 0.5 + Math.sin(ang) * d0 * 0.7; ctx.strokeStyle = `rgba(255,255,255,${0.14 * ph})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ang) * 120 * ph, y + Math.sin(ang) * 84 * ph); ctx.stroke(); }
  ctx.restore();
  const p = proj(K, ...b); if (!p) return;
  const r2 = 0.11 * K.focal / p[2];
  // contact shadow on the grass
  const sp = proj(K, b[0], 0.01, b[2]); if (sp) { const sr = 0.2 * K.focal / sp[2] * clamp(1 - b[1] / 8, 0.2, 1); ctx.save(); ctx.globalAlpha = 0.5 * clamp(1 - b[1] / 6);
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(sp[0], sp[1], sr, sr * 0.3, 0, 0, 7); ctx.fill(); ctx.restore(); }
  for (let g = 3; g >= 1; g--) { ctx.globalAlpha = 0.1; drawBall(ctx, p[0], p[1], r2, rotMat(t * 14 - g * 0.12, 0.3, t * 3), K); }
  ctx.globalAlpha = 1; drawBall(ctx, p[0], p[1], r2, rotMat(t * 14, 0.3, t * 3), K, { rim: '#ffd9a0' });
};

const HIT = 4.0; // goalcam local time of net contact (= 34.0 s)
function goalBall(t) {
  const s = t < 3.2 ? lerp(0, 0.5, t / 3.2) : lerp(0.5, 1, Math.pow(clamp((t - 3.2) / 0.8), 1.6));
  return [lerp(40, 54.4, s), lerp(2.3, 1.55, s) + Math.sin(s * Math.PI) * 0.5, lerp(-3.5, 0.9, s)];
}
SHOTS.goalcam = (ctx, t) => {
  const pre = t < HIT, dt = t - HIT;
  const netAmp = pre ? 0 : 1.25 * (1 - Math.exp(-dt * 14)) * Math.exp(-dt * 2.2) * (1 + 0.25 * Math.sin(dt * 18) * Math.exp(-dt * 3));
  const net = (y, z) => netAmp * Math.exp(-(Math.pow(y - 1.55, 2) + Math.pow(z - 0.9, 2)) / 1.1);
  const push = eio(t / HIT) * 1.4;
  const K = camera(57.6 - push * 0.6, 1.3, 1.5 - push * 0.2, 44, 1.8, -1.6, lerp(30, 26, eio(t / 5)), 0.02);
  // background pass, defocused
  G.save(); G.clearRect(0, 0, W, H); drawStadium(G, K, t + 30, { theme: 'mixed', goals: true, skipGoal2: true, bounce: pre ? 0.3 : 1.4 }); G.restore();
  ctx.save(); ctx.filter = `blur(${pre ? 5 : 3}px) saturate(${pre ? 0.55 : 1.15})`; ctx.drawImage(BG, 0, 0); ctx.restore();
  const b = pre ? goalBall(t) : [54.4 + netAmp * 0.9, Math.max(0.11, 1.55 - dt * dt * 3), 0.9];
  const p = proj(K, ...b);
  if (p) { const r = 0.11 * K.focal / p[2]; drawBall(ctx, p[0], p[1], r, rotMat(t * 2.5, 0.2, t * 0.7), K, { rim: '#ffd9a0' }); }
  drawGoal(ctx, K, 52.5, net || (() => 0));
  if (!pre) confetti(ctx, t, ss(0, 0.8, dt) * 0.6, HIT);
};

function silhouettes(ctx, t) {
  const r = rng(77);
  const figs = [];
  for (let row = 0; row < 2; row++) for (let i = 0; i < (row ? 15 : 11); i++)
    figs.push({ row, x: -40 + i * (row ? 140 : 190) + (r() - 0.5) * 70, s: (row ? 0.62 : 0.95) + r() * 0.3, ph: r(), scarf: r() > 0.5, arms: r() });
  for (const f of figs.sort((a, b) => b.row - a.row)) {
    const { x, s, ph, row } = f, jump = Math.max(0, Math.sin((t / BEAT + ph) * Math.PI)) * 36 * s;
    const base = H + 30 - jump - (row ? 70 : 0), head = base - 330 * s;
    const wave = Math.sin(t * 7 + ph * 9) * 0.3;
    const body = (col, off) => { ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.ellipse(x, head + off, 34 * s, 42 * s, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - 100 * s, base); ctx.quadraticCurveTo(x - 96 * s, head + 70 * s + off, x - 30 * s, head + 58 * s + off); ctx.lineTo(x + 30 * s, head + 58 * s + off); ctx.quadraticCurveTo(x + 96 * s, head + 70 * s + off, x + 100 * s, base); ctx.fill();
      for (const sd of [-1, 1]) { if (f.arms < 0.25 && sd > 0) continue;
        ctx.lineWidth = 24 * s; ctx.beginPath(); ctx.moveTo(x + sd * 70 * s, head + 80 * s + off); ctx.lineTo(x + sd * (104 + 30 * wave * sd) * s, head - 40 * s + off); ctx.stroke();
        ctx.lineWidth = 19 * s; ctx.beginPath(); ctx.moveTo(x + sd * (104 + 30 * wave * sd) * s, head - 40 * s + off); ctx.lineTo(x + sd * (80 + 50 * wave) * s, head - 160 * s + off); ctx.stroke();
        ctx.beginPath(); ctx.arc(x + sd * (80 + 50 * wave) * s, head - 168 * s + off, 14 * s, 0, 7); ctx.fill(); }
    };
    ctx.globalAlpha = 1;
    body(row ? 'rgba(255,190,140,0.35)' : 'rgba(255,205,160,0.6)', -3); body(row ? '#0b0d16' : '#020306', 0);
    if (f.scarf && f.arms >= 0.25) { const sc = [[C.red, C.white], [C.green, C.white], [C.blue, C.red]][(x / 100 | 0) % 3], w = (170 + 50 * wave) * s, y0 = head - 175 * s;
      for (let k = 0; k < 8; k++) { ctx.fillStyle = sc[k % 2]; ctx.globalAlpha = row ? 0.7 : 1; ctx.fillRect(x - w / 2 + k * w / 8, y0 - 14 * s + Math.sin(t * 9 + k * 0.8 + ph * 5) * 5 * s, w / 8 + 1, 26 * s); }
      ctx.globalAlpha = 1; }
  }
}
SHOTS.celebrate = (ctx, t) => {
  const K = camera(-30 + t * 1.5, 14, 64, 20, 6, -10, 58, -0.03 + Math.sin(t) * 0.01);
  G.clearRect(0, 0, W, H); drawStadium(G, K, t + 35, { theme: 'mixed', goals: true, bounce: 1.6 });
  ctx.save(); ctx.filter = 'blur(7px) brightness(1.15) saturate(1.2)'; ctx.drawImage(BG, 0, 0); ctx.restore();
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 7; k++) { const x = 180 + k * 260 + Math.sin(t * 1.3 + k) * 40, s = 600 + 200 * Math.sin(t * 3 + k * 2);
    ctx.globalAlpha = 0.25 + 0.2 * Math.max(0, Math.sin((t / BEAT) * Math.PI + k)); ctx.drawImage(GLOW_W, x - s / 2, 120 - s / 2, s, s); }
  ctx.restore();
  confetti(ctx, t + 3, 0.55);
  silhouettes(ctx, t);
  confetti(ctx, t * 1.1 + 7, 0.25);
  reveal(ctx, 'ONE CONTINENT.', W / 2, 300, t, 0.35, { size: 120, track: 8, align: 'center', shadow: 'rgba(0,0,0,0.55)', blur: 50 });
  reveal(ctx, 'ONE GAME.', W / 2, 430, t, 1.6, { size: 120, track: 8, align: 'center', shadow: 'rgba(0,0,0,0.55)', blur: 50 });
};

function infoCard(ctx, t, side, col, kicker, big, city, sub) {
  const x = side < 0 ? 150 : W - 150, al = side < 0 ? 'left' : 'right';
  const g = ctx.createLinearGradient(side < 0 ? 0 : W, 0, side < 0 ? W * 0.7 : W * 0.3, 0); g.addColorStop(0, 'rgba(0,3,10,0.82)'); g.addColorStop(1, 'rgba(0,3,10,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = col; const bw = 8, bh = 340 * eo5((t - 0.15) / 0.6); ctx.fillRect(side < 0 ? x - 40 : x + 32, 330, bw, bh);
  reveal(ctx, kicker, x, 380, t, 0.2, { size: 34, weight: 800, track: 12, color: col, align: al });
  reveal(ctx, big, x, 540, t, 0.3, { size: 170, weight: 900, track: -2, align: al });
  reveal(ctx, city, x, 618, t, 0.45, { size: 58, weight: 800, track: 6, align: al });
  reveal(ctx, sub, x, 690, t, 0.7, { size: 44, weight: 400, fam: 'Instrument Serif', italic: true, align: al, alpha: 0.9 });
}
SHOTS.opener = (ctx, t) => {
  const a = 3.9 + t * 0.09, K = camera(Math.cos(a) * 150, 88 - t * 3, Math.sin(a) * 150, 0, 0, 0, 44, 0.02, W * 0.66, H * 0.52);
  drawStadium(ctx, K, t + 40, { theme: 'mexico', goals: true, bounce: 0.6 });
  infoCard(ctx, t, -1, C.green, 'OPENING MATCH', 'JUNE 11', 'MEXICO CITY', 'Estadio Azteca, the first stadium to host three World Cups.');
};
const FW = (() => { const r = rng(88), a = []; for (let i = 0; i < 14; i++) a.push({ t: 0.1 + i * 0.26 + r() * 0.15, x: 0.06 + r() * 0.58, y: 0.1 + r() * 0.3, c: [C.red, C.white, C.blue, C.gold][i % 4], n: 70 + (r() * 40 | 0), s: r() * 1000 }); return a; })();
function fireworks(ctx, t) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const f of FW) { const dt = t - f.t; if (dt < -0.5 || dt > 2.2) continue;
    if (dt < 0) { const k = 1 + dt / 0.5; ctx.globalAlpha = 0.8; ctx.drawImage(glowTint(C.gold), f.x * W - 8, lerp(H * 0.7, f.y * H, eo3(k)) - 8, 16, 16); continue; }
    const r = rng(f.s | 0), fade = Math.pow(1 - dt / 2.2, 1.5);
    for (let i = 0; i < f.n; i++) { const ang = r() * Math.PI * 2, sp = 180 + r() * 160, d = sp * eo3(dt / 1.2), x = f.x * W + Math.cos(ang) * d, y = f.y * H + Math.sin(ang) * d + dt * dt * 60;
      ctx.globalAlpha = fade * (0.6 + 0.4 * Math.sin(t * 40 + i)); const s = 10 + 6 * (1 - dt / 2.2); ctx.drawImage(glowTint(f.c), x - s, y - s, s * 2, s * 2); }
    ctx.globalAlpha = fade * 0.25 * Math.exp(-dt * 3); ctx.drawImage(glowTint(f.c), f.x * W - 400, f.y * H - 400, 800, 800);
  }
  ctx.restore();
}
SHOTS.final = (ctx, t) => {
  const a = 0.7 - t * 0.08, K = camera(Math.cos(a) * 225, 88 + t * 4, Math.sin(a) * 225, 0, 6, 0, 46, -0.02, W * 0.33, H * 0.54);
  drawStadium(ctx, K, t + 44, { theme: 'usa', goals: true, bounce: 0.8 });
  fireworks(ctx, t);
  infoCard(ctx, t, 1, C.blue, 'THE FINAL', 'JULY 19', 'NEW YORK NEW JERSEY', 'One match. One champion.');
  if (t > 3.0) { ctx.fillStyle = `rgba(255,255,255,${ss(3.0, 4.0, t) * 0.5})`; ctx.fillRect(0, 0, W, H); }
};

function titleScene(ctx, t) { // t: seconds since the title hit (48.0)
  ctx.fillStyle = '#01030a'; ctx.fillRect(0, 0, W, H);
  // sweeping stadium beams in the three colours
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  [[C.red, 0.2, -1], [C.green, 0.5, 1], [C.blue, 0.8, -1], [C.white, 0.35, 1], [C.white, 0.65, -1]].forEach(([col, bx, dir], i) => {
    const ang = Math.sin(t * 0.45 * dir + i) * 0.35, x = bx * W, len = 1500;
    ctx.save(); ctx.translate(x, H + 60); ctx.rotate(ang);
    const g = ctx.createLinearGradient(0, 0, 0, -len); g.addColorStop(0, hex(col, col === C.white ? 0.16 : 0.34)); g.addColorStop(1, hex(col, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(18, 0); ctx.lineTo(190, -len); ctx.lineTo(-190, -len); ctx.fill(); ctx.restore();
    ctx.drawImage(glowTint(col), x - 150, H - 90, 300, 300);
  });
  ctx.restore();
  bokeh(ctx, t, 26, 17, { speed: 14, max: 90, alpha: 0.8 });
  confetti(ctx, t * 0.6 + 11, 0.22);
  const end = ss(10.8, 11.8, t);
  const push = 1 + t * 0.006;
  ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(push, push); ctx.translate(-W / 2, -H / 2);
  // the numerals
  const p = eo5(t / 0.45), cx = W / 2, by = 610;
  const digits = ['2', '0', '2', '6'], size = 330, tr = -10, full = tw('2026', size, 900, tr);
  let x = cx - full / 2;
  digits.forEach((d, i) => {
    const w = tw(d, size, 900, 0) + tr, dp = eo5((t - i * 0.06) / 0.5);
    for (let g = 3; g >= 0; g--) {
      ctx.save(); const sc = lerp(1.35, 1, dp) + g * 0.05 * (1 - dp); ctx.translate(x + w / 2, by - size * 0.36); ctx.scale(sc, sc);
      ctx.globalAlpha = (g ? 0.15 * (1 - dp) : dp);
      const gr = ctx.createLinearGradient(0, -size * 0.7, 0, size * 0.3); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#c8d3ee');
      text(ctx, d, 0, size * 0.36, { size, weight: 900, align: 'center', color: gr, shadow: 'rgba(0,0,0,0.5)', blur: 50 }); ctx.restore();
    }
    x += w;
  });
  triBar(ctx, cx - full / 2, by + 40, full, 14, eo3((t - 0.3) / 0.7));
  reveal(ctx, 'CANADA  ·  MÉXICO  ·  USA', cx, 262, t, 1.0, { size: 44, weight: 800, track: 16, align: 'center' });
  reveal(ctx, 'JUNE 11 — JULY 19', cx, by + 130, t, 2.0, { size: 46, weight: 700, track: 14, align: 'center' });
  reveal(ctx, 'The whole world. One continent.', cx, by + 220, t, 3.5, { size: 54, weight: 400, fam: 'Instrument Serif', italic: true, align: 'center', alpha: 0.92 });
  ctx.restore();
  if (t > 8.2) text(ctx, 'Unofficial fan-made concept. Not affiliated with or endorsed by FIFA.', W / 2, H - 46, { size: 19, weight: 500, track: 1.5, align: 'center', alpha: 0.5 * ss(8.2, 8.8, t) * (1 - end) });
  if (end > 0) { ctx.fillStyle = `rgba(0,0,0,${end})`; ctx.fillRect(0, 0, W, H); }
}
SHOTS.title = (ctx, t) => titleScene(ctx, t);
SHOTS.end = (ctx, t) => titleScene(ctx, t + 8);

// ------------------------------------------------------------------ frame
const SHOT_T = TL.shots.map(s => ({ id: s.id, t0: s.bar * BAR, t1: (s.bar + s.len) * BAR }));
const IMPACTS = [
  ...TL.nationHits.map(b => [b * BAR, 7]), ...TL.statHits.map(b => [b * BAR, 16]), [TL.drop * BAR, 20], [TL.goal * BAR, 34], [TL.titleHit * BAR, 18], [TL.endHit * BAR, 6]];
const FLASHES = [[TL.nationHits[0] * BAR, 0.5], [TL.drop * BAR, 0.9], [TL.goal * BAR, 1.0], [TL.titleHit * BAR, 0.85], [17.5 * BAR, 0.4], [20 * BAR, 0.35], [22 * BAR, 0.35]];
const WHIPS = [4 * BAR, 7 * BAR, 13 * BAR, 15 * BAR];

function render(t, frameIndex = Math.round(t * 30)) {
  const shot = SHOT_T.find(s => t >= s.t0 && t < s.t1) || SHOT_T[SHOT_T.length - 1];
  const lt = t - shot.t0;
  // camera shake + punch-in on hits
  let sx = 0, sy = 0, rot = 0, zoom = 1;
  for (const [ti, amp] of IMPACTS) { const d = t - ti; if (d < 0 || d > 1.2) continue; const k = amp * Math.exp(-d * 6);
    sx += vnoise(t * 38 + ti) * k; sy += vnoise(t * 41 + ti + 50) * k; rot += vnoise(t * 23 + ti + 90) * k * 0.0009; zoom += 0.035 * (amp / 20) * Math.exp(-d * 9); }
  S.save(); S.setTransform(1, 0, 0, 1, 0, 0);
  S.translate(W / 2 + sx, H / 2 + sy); S.rotate(rot); S.scale(zoom * 1.02, zoom * 1.02); S.translate(-W / 2, -H / 2);
  S.globalAlpha = 1; S.globalCompositeOperation = 'source-over'; S.filter = 'none';
  SHOTS[shot.id](S, lt);
  S.restore();

  X.save(); X.globalCompositeOperation = 'copy'; X.drawImage(SC, 0, 0); X.restore();
  // whip-pan blur around selected cuts
  for (const wt of WHIPS) { const d = t - wt; if (Math.abs(d) > 0.14) continue; const k = 1 - Math.abs(d) / 0.14;
    X.save(); for (let i = 1; i <= 5; i++) { X.globalAlpha = 0.22 * k; X.drawImage(SC, i * 28 * k * Math.sign(d || 1), 0); } X.restore(); }
  // bloom
  B.save(); B.globalCompositeOperation = 'copy'; B.filter = 'brightness(0.75) contrast(2.4) blur(5px)'; B.drawImage(out, 0, 0, W / 4, H / 4); B.restore();
  X.save(); X.globalCompositeOperation = 'lighter'; X.globalAlpha = 0.55; X.drawImage(BL, 0, 0, W, H); X.restore();
  // grade: cool shadows, warm highlights, vignette
  X.save();
  X.globalCompositeOperation = 'soft-light'; X.fillStyle = 'rgba(20,50,90,0.35)'; X.fillRect(0, 0, W, H);
  X.globalCompositeOperation = 'source-over';
  const slow = shot.id === 'goalcam' && lt < HIT ? 0.25 + 0.1 * Math.max(0, Math.sin(lt / BEAT * Math.PI * 2)) : 0;
  const vg = X.createRadialGradient(W / 2, H / 2, H * (0.45 - slow * 0.6), W / 2, H / 2, H * 1.05);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${0.62 + slow})`); X.fillStyle = vg; X.fillRect(0, 0, W, H);
  X.restore();
  // letterbox during the match sequence
  const lb = ss(20 * 1, 20.6, t) * (1 - ss(34.8, 35.2, t));
  letterbox(X, lb);
  // flashes
  for (const [ti, a] of FLASHES) { const d = t - ti; if (d < 0 || d > 1) continue; X.fillStyle = `rgba(255,255,255,${a * Math.exp(-d * 7)})`; X.fillRect(0, 0, W, H); }
  // grain
  X.save(); X.globalCompositeOperation = 'overlay'; X.globalAlpha = 0.045;
  const gi = GRAIN[frameIndex % 3], ox = (hash(frameIndex, 1) * 256) | 0, oy = (hash(frameIndex, 2) * 256) | 0;
  X.translate(-ox, -oy); X.fillStyle = X.createPattern(gi, 'repeat'); X.fillRect(ox, oy, W, H); X.restore();
  // fade from / to black
  const fin = 1 - ss(0, 0.7, t); if (fin > 0) { X.fillStyle = `rgba(0,0,0,${fin})`; X.fillRect(0, 0, W, H); }
}

window.FILM = { DURATION, render };
window.ready = document.fonts.ready.then(() => Promise.all(['900', '800', '700', '500', '400'].map(w => document.fonts.load(`${w} 40px 'Inter Tight'`)))
  .then(() => Promise.all([document.fonts.load("italic 40px 'Instrument Serif'"), document.fonts.load("40px 'Instrument Serif'")]))).then(() => true);
})();
