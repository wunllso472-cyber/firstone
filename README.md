# Cat on a Tricycle

An SVG animation of a cat riding a tricycle along a dirt path at the foot of the mountains.

Open `index.html` in a browser. There's no build step and it needs no network access.

- **Views:** first-person (from the cat's eyes), behind, side. Keys `1` / `2` / `3`.
- **Speed:** slow, medium, fast. Arrow keys `↑` / `↓`. The ride eases between speeds.
- **Pause:** button or `Space`.

# Land of the Free

A music video for the song "Land of the Free" (performed by breezygrunge5444, made with Suno), in `wide-horizon/index.html`. It needs no build step. The recording is embedded in `track.js` and plays unchanged.

- **Cut to the recording:** each scene changes on the last beat before its lyric begins. The scenes are New York Harbor, the flag, Monument Valley, Kansas wheat, the Rockies, Washington, New York City, a Cape Canaveral launch, the flag again and the Golden Gate. The rocket ignites on "Engines" and lifts off on "rockets take flight". Fireworks launch on one beat and burst on the next, more of them when the song is louder. The picture pushes in slightly on each beat, most in the choruses.
- **Lyrics:** they fill in word by word at the times the words are sung, including the repeats in the final chorus.
- **Controls:** play button, seek bar, section buttons and clickable lyrics. `Space` plays and pauses, `←` / `→` skip five seconds.
- **MP4 export:** `node wide-horizon/export_video.js out.mp4 [ffmpeg]` renders every frame at its exact time (30 fps, 1280×720, lyrics burned in) and muxes in the recording. It needs Playwright and an ffmpeg with libx264; `pip install imageio-ffmpeg` provides one.
- **Re-cutting to a new recording:** `analyze_track.py song.mp3 <model dir>` measures the beats and loudness, transcribes the vocal with word timestamps, aligns it to the lyrics, and rewrites both the timing block in `index.html` and `track.js`. Setup is in its docstring.
