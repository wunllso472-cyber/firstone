// node render.js <fps> <part> <parts>  -> frames/NNNNNN.jpg   (needs: python3 -m http.server 8766 in this folder)
// node render.js still <outdir> <t1> <t2> ...  -> stills for review
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const args = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://127.0.0.1:8766/film.html#render'); await p.evaluate(() => window.ready);
  const grab = async (t, i) => { const url = await p.evaluate(([t, i]) => { window.FILM.render(t, i); return document.getElementById('c').toDataURL('image/jpeg', 0.95); }, [t, i]);
    return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'); };
  if (args[0] === 'still') {
    fs.mkdirSync(args[1], { recursive: true });
    for (const s of args.slice(2)) { const t0 = Date.now(); fs.writeFileSync(`${args[1]}/t${(+s).toFixed(2)}.jpg`, await grab(+s, Math.round(+s * 30))); console.log(s, Date.now() - t0, 'ms'); }
  } else {
    const FPS = +args[0], part = +args[1], parts = +args[2];
    const total = Math.round(await p.evaluate(() => window.FILM.DURATION) * FPS);
    const per = Math.ceil(total / parts), a = part * per, z = Math.min(total, a + per);
    fs.mkdirSync('frames', { recursive: true });
    for (let i = a; i < z; i++) {
      fs.writeFileSync(`frames/${String(i).padStart(6, '0')}.jpg`, await grab(i / FPS, i));
      if (i % 150 === 0) console.log(`part ${part}: frame ${i}/${z}`);
    }
    console.log(`part ${part} done ${a}-${z - 1}`);
  }
  if (errs.length) console.log('ERRORS', errs);
  await b.close();
})();
