// usage: node sheet.js out.png "t1,t2,..."|shots [cols] [offsetFraction]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, out, spec = 'shots', colsArg = '4', fracArg = '0.62'] = process.argv;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://127.0.0.1:8765/' + (process.env.PAGE || 'film.html'));
  await p.evaluate(() => window.ready); await p.evaluate(c => { window.__CW = c; }, +(process.env.CW || 480));
  const res = await p.evaluate(([spec, cols, frac]) => {
    const { BAR } = window.FILM;
    const times = spec === 'shots' ? window.TL.shots.map(s => (s.bar + s.len * frac) * BAR) : spec.split(',').map(Number);
    const src = document.getElementById('c');
    const cw = window.__CW || 480, ch = cw * 9 / 16, rows = Math.ceil(times.length / cols);
    const sh = document.createElement('canvas'); sh.width = cw * cols; sh.height = (ch + 22) * rows;
    const g = sh.getContext('2d'); g.fillStyle = '#222'; g.fillRect(0, 0, sh.width, sh.height);
    times.forEach((t, i) => {
      window.FILM.render(t, i);
      const x = (i % cols) * cw, y = Math.floor(i / cols) * (ch + 22);
      g.drawImage(src, x, y, cw, ch);
      g.fillStyle = '#fff'; g.font = '14px monospace'; g.fillText(`${i} t=${t.toFixed(2)}s`, x + 6, y + ch + 16);
    });
    return sh.toDataURL('image/png');
  }, [spec, +colsArg, +fracArg]);
  require('fs').writeFileSync(out, Buffer.from(res.split(',')[1], 'base64'));
  console.log('errors:', errs.length ? errs : 'none');
  await b.close();
})();
