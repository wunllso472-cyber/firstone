# Cat on a Tricycle

An SVG animation of a cat riding a tricycle along a dirt path at the foot of the mountains.

Open `index.html` in a browser. There's no build step and it needs no network access.

- **Views:** first-person (from the cat's eyes), behind, side. Keys `1` / `2` / `3`.
- **Speed:** slow, medium, fast. Arrow keys `↑` / `↓`. The ride eases between speeds.
- **Pause:** button or `Space`.

# Land of the Wide Horizon

An original anthem for the United States with a music video, in `wide-horizon/index.html`.

- **Song:** F major, 96 BPM, 2:20. Intro, two verses, two choruses, a bridge, a final chorus and an outro. The band is synthesized live with the Web Audio API.
- **Vocals:** a synthetic singing voice sings every lyric. `make_vocals.py` renders it into `vocals.js`: the Kokoro neural TTS voice speaks each word, then the WORLD vocoder stretches the vowels to the note lengths and retunes them to the melody. Choruses get a doubled take, and the final chorus adds a harmony a third above. The melody lives once, in the `<script id="song">` block of `index.html`, which drives the voice, the band's lead line and the karaoke timing. To change a lyric or a note, edit that block and rerun the script (setup is in its docstring).
- **Video:** canvas scenes cut to the song: New York Harbor at sunrise, the flag with fireworks, Kansas wheat, the Rockies, Washington, New York City at night, a Cape Canaveral launch and the Golden Gate at sunset. Karaoke-style lyrics fill in syllable by syllable as they're sung.
- **Controls:** play button, seek bar, section buttons and clickable lyrics. `Space` plays and pauses, `←` / `→` skip five seconds.
