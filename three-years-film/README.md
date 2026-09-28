# THREE YEARS: AI, Sept 2023 → Sept 2026

A short documentary about AI over three years, built as a deterministic canvas film with an original synthesized score.

Five acts (Senses, Thought, Action, Abundance, Stakes), each with a how-it-works explainer and real-data charts. The picture (`film.js`) and the music (`music.py`) both read the same storyboard (`timeline.js`), so every cut lands on the beat.

## Build

Requirements: Node with Playwright (Chromium), Python 3 with `numpy` and `imageio-ffmpeg`.

```bash
python3 -m http.server 8765 --bind 127.0.0.1 &   # canvas export needs http://, not file://
python3 music.py                                  # -> score.wav
for k in 0 1 2 3; do node render.js 60 $k 4 & done; wait   # -> frames/*.jpg (60 fps)
./encode.sh                                       # -> three-years.mp4
```

`node sheet.js out.png shots 5 0.7` renders a contact sheet with one still per shot. Use it for quick visual review.

## Real photos (in progress)

`photo_plan.json` lists a real photo for each shot, such as laureate portraits, CEOs, data centres and the European Parliament. `fetch_photos.py` searches Wikimedia Commons and keeps only files whose license allows reuse (CC0, public domain, CC BY, CC BY-SA). It downloads candidates and records author and license for the on-screen credits:

```bash
python3 fetch_photos.py          # needs commons.wikimedia.org + upload.wikimedia.org allowed
python3 fetch_photos.py --pick   # after writing picks.json -> photos.js
```

Shots opt in with `"photo": "<key>"` in `timeline.js`, plus an optional `"photoMode"`:
- `full`: full-bleed photo.
- `backdrop`: blurred, behind diagrams.
- `center`: centred layout.

The Nobel and "three frontier models" shots switch to real portraits automatically when `nobel_*` / `trio_*` photos exist.

Fonts: Inter Tight, Instrument Serif and JetBrains Mono (SIL Open Font License).
