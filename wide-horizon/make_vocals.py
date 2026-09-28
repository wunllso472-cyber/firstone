"""Render the sung vocal for "Land of the Wide Horizon" into vocals.js.

The melody and lyrics come from the <script id="song"> block in index.html, so
the voice, the band and the karaoke timing all read one source.

How it sings: each word is spoken by the Kokoro neural TTS voice, analysed with
the WORLD vocoder, split into syllables, and resynthesised with each vowel
stretched to its note length and its pitch set to the melody (with a small
scoop into each note and vibrato on long notes). Consonants keep their spoken
length and land just before the beat, the way a singer places them.

Setup (the model files are ~350 MB and are not committed):
    pip install kokoro-onnx pyworld soundfile numpy lameenc
    curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
    curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
Run:
    python3 make_vocals.py <dir with the model files> [preview.wav]
"""
import base64
import json
import os
import re
import sys

import lameenc
import numpy as np
import pyworld as pw
from kokoro_onnx import Kokoro

HERE = os.path.dirname(os.path.abspath(__file__))
BPM, KEY = 96, 53  # F3; the voice sings an octave below the instrumental lead
BEAT = 60 / BPM
TOTAL = 140.0
SR = 24000
FP = 5.0  # WORLD frame period, ms
FS = FP / 1000
SCALE = [0, 2, 4, 5, 7, 9, 11]
VOICE = "af_heart"
# Unstressed function words in their sung (reduced) form, given as phonemes.
REDUCED = {"the": "ðə", "a": "ɐ", "of": "əv", "to": "tə", "and": "ənd", "her": "hɚ", "at": "æt", "as": "æz"}


def semi(d):
    return SCALE[d % 7] + 12 * (d // 7)


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def load_song():
    html = open(os.path.join(HERE, "index.html"), encoding="utf-8").read()
    block = re.search(r'<script type="application/json" id="song">(.*?)</script>', html, re.S).group(1)
    return json.loads(block)["lines"]


def words_of(line):
    """Group a line's notes into words: [(text, [(start_s, dur_s, degree, syllable), ...]), ...]."""
    words, beat = [], 0.0
    for beats, deg, syl in line["notes"]:
        note = (line["t"] + beat * BEAT, beats * BEAT, deg, syl.lstrip("-"))
        if syl.startswith("-"):
            words[-1][1].append(note)
        else:
            words.append([None, [note]])
        beat += beats
    for w in words:
        w[0] = "".join(n[3] for n in w[1])
    return words


class Singer:
    def __init__(self, model_dir):
        self.tts = Kokoro(os.path.join(model_dir, "kokoro-v1.0.onnx"), os.path.join(model_dir, "voices-v1.0.bin"))
        self.cache = {}

    def analyse(self, word, n_syl, syl_letters):
        key = (word.lower(), n_syl)
        if key in self.cache:
            return self.cache[key]
        low = word.lower()
        if low in REDUCED and n_syl == 1:
            audio, _ = self.tts.create(REDUCED[low], voice=VOICE, speed=0.9, is_phonemes=True)
        else:
            audio, _ = self.tts.create(word, voice=VOICE, speed=0.85, lang="en-us")
        x = audio.astype(np.float64)
        f0, t = pw.harvest(x, SR, f0_floor=80, f0_ceil=700, frame_period=FP)
        sp = pw.cheaptrick(x, f0, t, SR)
        ap = pw.d4c(x, f0, t, SR)
        hop = int(SR * FS)
        energy = np.array([np.sqrt(np.mean(x[max(0, i * hop - hop):i * hop + hop] ** 2) + 1e-12) for i in range(len(f0))])
        loud = energy > energy.max() * 0.04
        lo = int(np.argmax(loud))
        hi = len(loud) - int(np.argmax(loud[::-1]))
        # Syllable boundaries: split by letter share, then snap to the nearest energy dip.
        bounds = [lo]
        total = sum(syl_letters)
        acc = 0
        for n in syl_letters[:-1]:
            acc += n
            guess = lo + int(round((hi - lo) * acc / total))
            a, b = max(bounds[-1] + 2, guess - 8), min(hi - 2, guess + 8)
            bounds.append(a + int(np.argmin(energy[a:b])) if b > a else guess)
        bounds.append(hi)
        rms = np.sqrt(np.mean(x[lo * hop:hi * hop] ** 2)) + 1e-9
        self.cache[key] = (f0, sp, ap, bounds, rms)
        return self.cache[key]

    def render(self, word, notes, transpose=0, cents=0.0):
        """Return (start_time_s, samples) for one sung word."""
        letters = [max(1, len(re.sub(r"[^a-z]", "", n[3].lower()))) for n in notes]
        f0, sp, ap, bounds, rms = self.analyse(word, len(notes), letters)
        segs = []
        for i in range(len(notes)):
            a, b = bounds[i], bounds[i + 1]
            v = f0[a:b] > 0
            if v.any():
                first, last = a + int(np.argmax(v)), b - int(np.argmax(v[::-1]))
            else:
                first, last = a, b
            segs.append((a, first, last, b))

        start = notes[0][0] - (segs[0][1] - segs[0][0]) * FS
        src, pitch = [], []
        for i, (a, first, last, b) in enumerate(segs):
            midi = KEY + semi(notes[i][2] + transpose)
            prev = KEY + semi(notes[i - 1][2] + transpose) if i else midi - 0.7
            for k in range(a, first):
                src.append(k); pitch.append(0.0)
            if i < len(notes) - 1:
                na, nf = segs[i + 1][0], segs[i + 1][1]
                end = notes[i + 1][0] - (nf - na) * FS - (b - last) * FS
            else:
                end = notes[i][0] + notes[i][1] - 0.09 - (b - last) * FS
            n_in = max(1, last - first)
            now = start + len(src) * FS
            n_out = max(int(round((end - now) / FS)), max(1, n_in // 2))
            head = tail = min(int(n_in * 0.2), 12)
            mid_in, mid_out = n_in - head - tail, n_out - head - tail
            for k in range(n_out):
                if mid_out < 2 or mid_in < 2:
                    s = first + (k * (n_in - 1) / max(1, n_out - 1))
                elif k < head:
                    s = first + k
                elif k < head + mid_out:
                    s = first + head + (k - head) * (mid_in - 1) / (mid_out - 1)
                else:
                    s = last - tail + (k - head - mid_out)
                src.append(s)
                if f0[min(len(f0) - 1, int(round(s)))] > 0:
                    tt = k * FS
                    glide = min(1.0, tt / 0.07)
                    glide = glide * glide * (3 - 2 * glide)
                    m = prev + (midi - prev) * glide
                    depth = 0.3 * min(1.0, max(0.0, (tt - 0.28) / 0.3)) if n_out * FS > 0.5 else 0.0
                    m += depth * np.sin(2 * np.pi * 5.4 * tt)
                    pitch.append(hz(m) * 2 ** (cents / 1200))
                else:
                    pitch.append(0.0)
            for k in range(last, b):
                src.append(k); pitch.append(0.0)

        src = np.clip(np.array(src), 0, len(f0) - 1)
        i0 = np.floor(src).astype(int)
        i1 = np.minimum(i0 + 1, len(f0) - 1)
        w = (src - i0)[:, None]
        sp_o = np.ascontiguousarray(sp[i0] * (1 - w) + sp[i1] * w)
        ap_o = np.ascontiguousarray(ap[i0] * (1 - w) + ap[i1] * w)
        y = pw.synthesize(np.array(pitch), sp_o, ap_o, SR, FP)
        y *= 0.12 / rms
        fade_in, fade_out = int(0.004 * SR), int(0.04 * SR)
        y[:fade_in] *= np.linspace(0, 1, fade_in)
        y[-fade_out:] *= np.linspace(1, 0, fade_out)
        return start, y


def main():
    model_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    preview = sys.argv[2] if len(sys.argv) > 2 else None
    singer = Singer(model_dir)
    track = np.zeros(int(TOTAL * SR) + SR)

    def place(start, y, gain):
        s = int(round(start * SR))
        seg = track[max(0, s):s + len(y)]
        seg += y[max(0, -s):max(0, -s) + len(seg)] * gain

    for line in load_song():
        big = line["sec"] in ("Chorus", "Final Chorus", "Outro")
        for word, notes in words_of(line):
            place(*singer.render(word, notes), 1.0)
            if big:  # a second, slightly detuned take for a fuller chorus
                st, y = singer.render(word, notes, cents=9)
                place(st + 0.018, y, 0.28)
            if line["sec"] in ("Final Chorus", "Outro"):  # harmony a third above
                place(*singer.render(word, notes, transpose=2), 0.3)
        print(f"{line['t']:6.1f}s  {line['text']}")

    track /= max(1e-9, np.abs(track).max()) / 0.9
    pcm = (np.clip(track, -1, 1) * 32767).astype(np.int16)
    if preview:
        import soundfile as sf
        sf.write(preview, pcm, SR)
    enc = lameenc.Encoder()
    enc.set_bit_rate(80)
    enc.set_in_sample_rate(SR)
    enc.set_channels(1)
    enc.set_quality(2)
    mp3 = enc.encode(pcm.tobytes()) + enc.flush()
    with open(os.path.join(HERE, "vocals.js"), "w") as f:
        f.write("// Generated by make_vocals.py: the sung lead vocal as base64 MP3 (24 kHz mono).\n")
        f.write("window.WH_VOCALS = \"" + base64.b64encode(mp3).decode() + "\";\n")
    print(f"vocals.js: {len(mp3) / 1e6:.2f} MB of MP3")


if __name__ == "__main__":
    main()
