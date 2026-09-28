const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const [,, fpsArg, part, parts] = process.argv;
const FPS = +fpsArg;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8765/' + (process.env.PAGE || 'film.html')); await p.evaluate(() => window.ready);
  const dur = await p.evaluate(() => window.FILM.DURATION);
  const total = Math.round(dur * FPS);
  const per = Math.ceil(total / +parts), a = +part * per, z = Math.min(total, a + per);
  for (let i = a; i < z; i++) {
    const url = await p.evaluate(([t, i]) => { window.FILM.render(t, i); return document.getElementById('c').toDataURL('image/jpeg', 0.94); }, [i / FPS, i]);
    fs.writeFileSync(`frames/${String(i).padStart(6, '0')}.jpg`, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
    if (i % 600 === 0) console.log(`part ${part}: frame ${i}/${z}`);
  }
  console.log(`part ${part} done ${a}-${z - 1}`, errs.length ? errs : '');
  await b.close();
})();
