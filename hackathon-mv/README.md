# 让 AI 做出下一步决定 · MV

Music video for the song about the JEV hackathon at 云谷404 (Hangzhou, 2026-09-27). It's a deterministic canvas film in a cyanotype style, matching the song's cover art: Prussian blue, paper white and one warm accent.

- The five event photos in `src/` are restyled as cyanotype prints in `styled/` (`stylize.py`). Layout and people are unchanged.
- The other imagery is drawn procedurally: QR chip and circuit traces, the Mid-Autumn moon over a Hangzhou skyline, sign-up page, terminal, seats and pass, milk tea and coffee, red envelopes, thunderstorm, galaxy patch, and more.
- Lyrics are timed per character. SenseVoice (sherpa-onnx) timestamps are aligned to the lyrics embedded in the MP3 by pinyin (`tools/`, output in `data/aligned.json`). Lines highlight karaoke-style with English translations underneath.

## Build

Requirements: Node with Playwright (Chromium), Python 3 with `numpy`, `pillow`, `imageio-ffmpeg`.

```bash
python3 stylize.py                                # src/ -> styled/
python3 timeline.py                               # data/aligned.json -> lyrics.js
python3 build_fonts.py <path>/node_modules/@fontsource   # only if text changes (see file header)
python3 -m http.server 8766 --bind 127.0.0.1 &
node stills.js sheet.png 4 0.25                   # contact sheet, one still per scene
for k in 0 1 2 3; do node render.js 30 $k 4 & done; wait   # -> frames/
./encode.sh                                       # -> hackathon-mv.mp4
```

Fonts: Noto Serif SC, Noto Sans SC, Ma Shan Zheng, Instrument Serif, JetBrains Mono, Inter Tight (SIL Open Font License). Music made with Suno.
