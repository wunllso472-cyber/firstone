// Storyboard shared by the picture (film.js) and the score (music.py).
// 120 BPM, 4/4: one bar = 2 s, one beat = 0.5 s. 30 bars = a :60 spot.
window.TL = {
  "bpm": 120,
  "totalBars": 30,
  "shots": [
    { "id": "cold",      "bar": 0,    "len": 2   },
    { "id": "nations",   "bar": 2,    "len": 2   },
    { "id": "map",       "bar": 4,    "len": 3   },
    { "id": "stats",     "bar": 7,    "len": 3   },
    { "id": "stadium",   "bar": 10,   "len": 3   },
    { "id": "flight",    "bar": 13,   "len": 2   },
    { "id": "goalcam",   "bar": 15,   "len": 2.5 },
    { "id": "celebrate", "bar": 17.5, "len": 2.5 },
    { "id": "opener",    "bar": 20,   "len": 2   },
    { "id": "final",     "bar": 22,   "len": 2   },
    { "id": "title",     "bar": 24,   "len": 4   },
    { "id": "end",       "bar": 28,   "len": 2   }
  ],
  "nationHits": [2, 2.25, 2.5],
  "statHits": [7, 8, 9],
  "drop": 10,
  "goal": 17,
  "titleHit": 24,
  "endHit": 28,
  "cityStart": 4.25,
  "cityStep": 0.125
};
