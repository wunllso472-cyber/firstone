// Contact sheet of stills: node stills.js out.png [cols] [scale] [mode]
// mode "cues": one still per scene cue (60% in). A comma list of seconds also works.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, out, colsArg = '5', scaleArg = '0.25', mode = 'cues'] = process.argv;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://127.0.0.1:8766/film.html'); await p.evaluate(() => window.ready);
  const times = await p.evaluate(mode => {
    if (mode !== 'cues') return mode.split(',').map(Number);
    const c = window.LY.cues; return c.map((x, i) => x.t + ((c[i + 1] ? c[i + 1].t : window.LY.duration) - x.t) * 0.6);
  }, mode);
  const cols = +colsArg, sc = +scaleArg, w = 1920 * sc, h = 1080 * sc;
  const shots = [];
  for (const t of times) { await p.evaluate(t => window.FILM.render(t, 0), t); shots.push(await p.evaluate(() => document.getElementById('c').toDataURL('image/jpeg', 0.85))); }
  await p.setViewportSize({ width: Math.round(cols * w), height: Math.round(Math.ceil(times.length / cols) * (h + 22)) });
  await p.setContent(`<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(${cols},${w}px);font:14px monospace;color:#9cf">${shots.map((s, i) => `<div><img src="${s}" width="${w}" height="${h}" style="display:block"><div style="height:22px">${times[i].toFixed(1)}s</div></div>`).join('')}</body>`);
  await p.screenshot({ path: out, fullPage: true });
  console.log('wrote', out, errs.length ? errs : '');
  await b.close();
})();
