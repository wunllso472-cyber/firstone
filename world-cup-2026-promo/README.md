# 2026: a :60 promo spot for the Canada · Mexico · USA World Cup

A 60-second, 1080p promo film for the 2026 tournament. The picture is a deterministic canvas animation and the music is an original synthesized score. The film uses no stock footage, photos, samples or logos.

**Watch:** `wc2026-promo-60s.mp4` (H.264 High, 1920×1080, 30 fps, AAC 320k, about -14 LUFS).

Unofficial fan-made concept. Not affiliated with or endorsed by FIFA. It uses no FIFA marks, emblem, trophy artwork or official slogan.

## Storyboard (120 BPM, one bar = 2 s)

| Time | Shot | Picture | Sound |
|---|---|---|---|
| 0–4 s | Cold open | A ball turns in a shaft of light. **ONE BALL.** | Heartbeat, low pad, a bell |
| 4–8 s | Nations | Three panels slam in: Canada, México, USA, each with its skyline. **THREE NATIONS.** | Three taiko hits, string ostinato |
| 8–14 s | Map | Dot-matrix North America. The 16 host cities light up west to east, joined by a tour line, with a counter. | Four-on-the-floor; each city plays a rising note |
| 14–20 s | Stats | **48 NATIONS · 104 MATCHES · 39 DAYS** | Slams, driving toms, snare roll and riser |
| 20–26 s | Stadium | Aerial fly-in over a full stadium at night. **THE WHOLE WORLD IS COMING.** | The drop: the full anthem with a crowd chant |
| 26–30 s | Flight | Tracking shot beside the ball in the air | Anthem |
| 30–35 s | Goal-cam | Telephoto shot from behind the net. The ball arrives in slow motion and hits the net on the downbeat at 34.0 s. | Low-passed breakdown and heartbeat, then **GOAL**: impact and crowd roar |
| 35–40 s | Celebrate | Silhouetted fans with scarves, confetti. **ONE CONTINENT. ONE GAME.** | Anthem and chant |
| 40–44 s | Opener | **JUNE 11 · MEXICO CITY**: Estadio Azteca, the first stadium to host three World Cups | |
| 44–48 s | Final | **JULY 19 · NEW YORK NEW JERSEY**, with fireworks | Build |
| 48–60 s | End card | **2026**, CANADA · MÉXICO · USA, JUNE 11 — JULY 19, *The whole world. One continent.* | Final chorus, then the button at 56 s |

Facts on screen: 48 teams, 104 matches (40 more than the 64 of 1998–2022), 16 host cities (11 USA, 3 Mexico, 2 Canada), June 11 – July 19, 2026, opening match at Estadio Azteca and the final at New York New Jersey.

## Build

Requirements: Node with Playwright (Chromium), and Python 3 with `numpy`, `scipy` and `imageio-ffmpeg`.

```bash
python3 -m http.server 8766 --bind 127.0.0.1 &           # canvas export needs http://
python3 music.py                                          # -> score.wav (about 30 s)
for k in 0 1 2 3; do node render.js 30 $k 4 & done; wait  # -> frames/*.jpg (about 2 min)
./encode.sh                                               # -> both deliverables
```

`encode.sh` writes two files:
- `wc2026-promo-60s.mp4`: the web master. 1080p30, CRF 21, -14 LUFS.
- `wc2026-promo-60s-broadcast.mp4`: the broadcast master. 1080p29.97, CRF 16, short GOP, -24 LKFS (ATSC A/85), -2 dBTP. It is not committed because of its size.

`node render.js still <dir> 12.5 34.1 …` renders single frames for review. Open `film.html` over http to preview in real time; click to start it with the score.

## How it's made

- `timeline.js` is the storyboard. The picture and the score both read it, so cuts, slams and the goal land on the beat.
- `film.js` holds the whole picture:
  - a small 3D projector with near-plane clipping;
  - a procedural stadium with about 38k crowd points, phone flashes, an LED ribbon, roof floodlights and the surrounding city at night;
  - the pitch and its markings, and goals with a net that deforms on impact;
  - a truncated-icosahedron ball in the three host colours;
  - an orthographic dot map of North America, fireworks, confetti and fan silhouettes.

  Post-processing adds bloom, grade, vignette, depth-of-field, camera shake on hits, whip-pan blur, flashes, a 2.39 letterbox in the match sequence, and film grain.
- `music.py` synthesizes the score. It includes supersaw chords, bass, plucks, bells, taiko, a kit, risers and impacts, a crowd bed and goal roar, and a formant-synthesized crowd chant. It also mixes it: sidechain, a low-pass breakdown, convolution reverb and soft-clip mastering.

Fonts: Inter Tight and Instrument Serif (SIL Open Font License).
