// Render the music video to an MP4: every frame drawn at its exact time, captions burned in,
// the recording from track.js as the soundtrack.
//
//   npm install playwright          (uses a Chromium that Playwright can find)
//   node export_video.js out.mp4 [ffmpeg path]
//
// ffmpeg needs libx264; `pip install imageio-ffmpeg` provides one.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const FPS = 30, BATCH = 15;
const out = process.argv[2] || 'land-of-the-free.mp4';
const ffmpeg = process.argv[3] || 'ffmpeg';

(async () => {
  // The soundtrack is embedded in track.js; unpack it for ffmpeg.
  const js = fs.readFileSync(path.join(__dirname, 'track.js'), 'utf8');
  const mp3 = path.join(os.tmpdir(), 'land-of-the-free-track.mp3');
  fs.writeFileSync(mp3, Buffer.from(js.match(/"([A-Za-z0-9+/=]+)"/)[1], 'base64'));

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await page.goto('file://' + path.join(__dirname, 'index.html'));
  const fonts = await page.evaluate(async () => {
    const faces = ['800 36px "Libre Franklin"', '400 56px "Alfa Slab One"', '500 20px "IBM Plex Mono"'];
    await Promise.all(faces.map(f => document.fonts.load(f)));
    window.WH_RENDER.stop();
    return faces.map(f => f + (document.fonts.check(f) ? ' loaded' : ' MISSING (fallback font used)'));
  });
  console.log(fonts.join('\n'));
  const duration = await page.evaluate(() => window.WH_RENDER.duration);
  const frames = Math.ceil(duration * FPS);

  const enc = spawn(ffmpeg, ['-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-i', mp3, '-map', '0:v', '-map', '1:a',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => enc.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg exited with ' + c))));

  for (let f = 0; f < frames; f += BATCH) {
    const shots = await page.evaluate(({ f, n, fps }) => {
      const cv = document.getElementById('screen'), shots = [];
      for (let i = 0; i < n; i++) {
        window.WH_RENDER.frame((f + i) / fps, 1 / fps);
        shots.push(cv.toDataURL('image/jpeg', 0.93).split(',')[1]);
      }
      return shots;
    }, { f, n: Math.min(BATCH, frames - f), fps: FPS });
    for (const s of shots) {
      if (!enc.stdin.write(Buffer.from(s, 'base64'))) await new Promise(r => enc.stdin.once('drain', r));
    }
    if (f % (FPS * 10) < BATCH) process.stdout.write(`\r${Math.round(f / FPS)}s / ${Math.round(duration)}s`);
  }
  enc.stdin.end();
  await done;
  await browser.close();
  console.log(`\nwrote ${out}`);
})().catch(e => { console.error(e); process.exit(1); });
