"""Original score for the 2026 promo, synthesized from the same timeline the picture uses.

Stadium anthem in D major at 120 BPM: heartbeat cold open, nation hits, a city-by-city
arpeggio, stat slams, a full drop with a crowd chant, a slow-motion breakdown into the
goal, and a final title statement. Writes score.wav (48 kHz, 16-bit stereo).
"""
import json, wave
import numpy as np
from scipy.signal import butter, sosfilt

TL = json.loads(open('timeline.js').read().split('window.TL =', 1)[1].strip().rstrip(';'))
SR = 48000
BEAT = 60 / TL['bpm']
BAR = BEAT * 4
TOTAL = TL['totalBars'] * BAR
N = int((TOTAL + 0.5) * SR)
rs = np.random.default_rng(26)

BUS = {k: np.zeros((2, N), np.float32) for k in ('music', 'drums', 'fx', 'crowd', 'choir')}

def S(t): return int(round(t * SR))
def mtof(m): return 440.0 * 2 ** ((m - 69) / 12)
def tb(bar, beat=0.0): return bar * BAR + beat * BEAT

def add(bus, sig, t0, pan=0.0, gain=1.0):
    i0 = S(t0)
    if i0 < 0: sig = sig[-i0:]; i0 = 0
    n = min(len(sig), N - i0)
    if n <= 0: return
    BUS[bus][0, i0:i0 + n] += sig[:n] * gain * np.sqrt(0.5 * (1 - pan))
    BUS[bus][1, i0:i0 + n] += sig[:n] * gain * np.sqrt(0.5 * (1 + pan))

def filt(x, kind, f, order=2):
    sos = butter(order, f, btype=kind, fs=SR, output='sos')
    return sosfilt(sos, x).astype(np.float32)

def env(n, a, r):
    e = np.ones(n, np.float32)
    na, nr = min(n, max(1, S(a))), min(n, max(1, S(r)))
    e[:na] = np.linspace(0, 1, na)
    e[n - nr:] *= np.linspace(1, 0, nr) ** 1.5
    return e

def saw(freq, dur, detune=0.0, bright=1.0, phase=None):
    n = S(dur); t = np.arange(n) / SR
    f = freq * 2 ** (detune / 1200)
    ph = rs.random() * 2 * np.pi if phase is None else phase
    out = np.zeros(n, np.float32)
    hmax = int(min(40, 9000 / f))
    for h in range(1, hmax + 1):
        out += (np.sin(2 * np.pi * f * h * t + ph * h) / h * (bright ** (h - 1))).astype(np.float32)
    return out * 0.6

# ------------------------------------------------------------------ harmony
PROG = {'D': [50, 57, 62, 66, 69], 'A': [45, 57, 61, 64, 69], 'Bm': [47, 54, 59, 62, 66], 'G': [43, 55, 59, 62, 67],
        'Em': [40, 55, 59, 64, 67], 'Dsus': [50, 57, 62, 67, 69]}
ROOT = {'D': 38, 'A': 33, 'Bm': 35, 'G': 31, 'Em': 40, 'Dsus': 38}
LOOP = ['D', 'A', 'Bm', 'G']
def chord_at(bar):
    b = int(bar)
    if b < 2: return 'Bm'
    if b < 4: return ['Bm', 'G'][b - 2]
    if b < 7: return LOOP[(b - 4) % 4]
    if b < 10: return ['Bm', 'G', 'A'][b - 7]
    if 15 <= b < 17: return ['Bm', 'A'][b - 15]
    if b >= 28: return 'D'
    if b >= 24: return LOOP[(b - 24) % 4]
    return LOOP[(b - 10) % 4]

# ------------------------------------------------------------------ instruments
def supersaw_chord(name, t0, dur, gain, cutoff=5000, bright=0.92):
    for m in PROG[name][1:]:
        f = mtof(m)
        for d, pan in ((-11, -0.7), (-4, -0.25), (0, 0.0), (5, 0.3), (12, 0.7)):
            sig = saw(f, dur + 0.25, d, bright)
            sig = filt(sig, 'low', cutoff)
            sig *= env(len(sig), 0.03, 0.25)
            add('music', sig, t0, pan, gain * 0.03)

def pad(name, t0, dur, gain, cutoff=1400):
    for m in PROG[name]:
        for d, pan in ((-6, -0.6), (6, 0.6)):
            sig = filt(saw(mtof(m), dur + 1.2, d, 0.8), 'low', cutoff)
            sig *= env(len(sig), 0.6, 1.2)
            add('music', sig, t0, pan, gain * 0.018)

def bass(m, t0, dur, gain=1.0, drive=1.6):
    f = mtof(m); n = S(dur); t = np.arange(n) / SR
    sig = np.sin(2 * np.pi * f * t) + 0.45 * np.sin(4 * np.pi * f * t) + 0.18 * saw(f, dur, 0, 0.7)
    sig = np.tanh(sig * drive) * env(n, 0.005, 0.05)
    add('music', sig.astype(np.float32), t0, 0, gain * 0.26)

def pluck(m, t0, gain=1.0, pan=0.0, decay=0.22):
    f = mtof(m); sig = filt(saw(f, 0.9, 0, 0.85), 'low', 4200); t = np.arange(len(sig)) / SR
    sig *= np.exp(-t / decay) * np.minimum(1, t / 0.002)
    add('music', sig, t0, pan, gain * 0.16)

def bell(m, t0, gain=1.0, pan=0.0):
    f = mtof(m); n = S(3.5); t = np.arange(n) / SR
    sig = sum(a * np.sin(2 * np.pi * f * k * t) * np.exp(-t / d) for k, a, d in ((1, 1, 1.6), (2.0, 0.5, 0.9), (2.76, 0.35, 0.6), (5.4, 0.15, 0.3), (8.93, 0.06, 0.15)))
    add('music', (sig * np.minimum(1, t / 0.002)).astype(np.float32), t0, pan, gain * 0.09)

def brass_stab(name, t0, gain=1.0):
    for m in PROG[name][:4]:
        for d in (-7, 0, 7):
            sig = filt(saw(mtof(m - 12 if m > 60 else m), 0.9, d, 0.9), 'low', 2200)
            t = np.arange(len(sig)) / SR
            sig *= np.minimum(1, t / 0.01) * np.exp(-t / 0.35)
            add('music', sig, t0, d / 12, gain * 0.05)

VOWEL = {'o': [(430, 1.0, 70), (820, 0.55, 80), (2800, 0.08, 120)], 'a': [(730, 1.0, 90), (1090, 0.6, 100), (2440, 0.12, 120)]}
def voice(m, t0, dur, gain=1.0, vowel='o', pan=0.0):
    """A formant-shaped chorus of detuned voices singing one note."""
    f0 = mtof(m); n = S(dur + 0.2); t = np.arange(n) / SR
    out = np.zeros(n, np.float32)
    for v in range(7):
        det = 2 ** ((rs.random() - 0.5) * 30 / 1200)
        vib = 1 + 0.006 * np.sin(2 * np.pi * (5 + rs.random()) * t + rs.random() * 6) * np.minimum(1, t / 0.3)
        scoop = 1 - 0.03 * np.exp(-t / 0.05)
        ph = 2 * np.pi * np.cumsum(f0 * det * vib * scoop) / SR
        sig = np.zeros(n, np.float32)
        for h in range(1, int(4200 / f0) + 1):
            fh = f0 * h
            a = sum(g * np.exp(-((fh - F) / bw) ** 2 / 2) for F, g, bw in VOWEL[vowel]) + 0.02
            sig += (a / np.sqrt(h) * np.sin(h * ph)).astype(np.float32)
        off = S(rs.random() * 0.03)
        out[off:] += sig[:n - off] * 0.3
    out *= env(n, 0.06, 0.18)
    add('choir', out, t0, pan, gain * 0.05)

# chant melody: (beat offset in the 4-bar phrase, length in beats, midi)
CHANT = [(0, 1, 66), (1, 1, 66), (2, 1, 69), (3, 1, 66),
         (4, 1, 64), (5, 1, 64), (6, 2, 61),
         (8, 1, 62), (9, 1, 66), (10, 1, 71), (11, 1, 69),
         (12, 1.5, 67), (13.5, 0.5, 66), (14, 2, 64)]
def chant(bar0, gain=1.0, vowel='o'):
    for b, l, m in CHANT:
        t0 = tb(bar0, b)
        voice(m, t0, l * BEAT * 0.92, gain, vowel, -0.25)
        voice(m - 12, t0, l * BEAT * 0.92, gain * 0.7, vowel, 0.25)

def kick(t0, gain=1.0, low=48):
    n = S(0.55); t = np.arange(n) / SR
    f = low + 120 * np.exp(-t / 0.03)
    sig = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.25) + 0.2 * rs.standard_normal(n) * np.exp(-t / 0.003)
    add('drums', np.tanh(sig * 1.8).astype(np.float32), t0, 0, gain * 0.5)

def heartbeat(t0, gain=1.0):
    for dt, g in ((0, 1.0), (0.26, 0.7)):
        n = S(0.5); t = np.arange(n) / SR
        sig = np.sin(2 * np.pi * np.cumsum(40 + 30 * np.exp(-t / 0.04)) / SR) * np.exp(-t / 0.16)
        add('drums', filt(sig.astype(np.float32), 'low', 180), t0 + dt, 0, gain * g * 0.9)

def clap(t0, gain=1.0):
    n = S(0.35); t = np.arange(n) / SR
    nz = filt(rs.standard_normal(n).astype(np.float32), 'band', [900, 5000])
    e = np.exp(-t / 0.08) * (1 + 0.8 * ((t < 0.03) & (np.sin(2 * np.pi * t / 0.009) > 0)))
    add('drums', nz * e * 0.6, t0, 0.05, gain * 0.5)

def snare(t0, gain=1.0):
    n = S(0.3); t = np.arange(n) / SR
    nz = filt(rs.standard_normal(n).astype(np.float32), 'band', [1200, 7000]) * np.exp(-t / 0.09)
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.05)
    add('drums', (nz * 0.7 + tone * 0.5).astype(np.float32), t0, -0.05, gain * 0.45)

def hat(t0, gain=1.0, open_=False, pan=0.3):
    n = S(0.3 if open_ else 0.07); t = np.arange(n) / SR
    nz = filt(rs.standard_normal(n).astype(np.float32), 'high', 7000) * np.exp(-t / (0.1 if open_ else 0.02))
    add('drums', nz, t0, pan, gain * 0.16)

def taiko(t0, gain=1.0, pitch=58, pan=0.0):
    n = S(1.2); t = np.arange(n) / SR
    body = np.sin(2 * np.pi * np.cumsum(pitch + 40 * np.exp(-t / 0.05)) / SR) * np.exp(-t / 0.45)
    skin = filt(rs.standard_normal(n).astype(np.float32), 'low', 900) * np.exp(-t / 0.05)
    add('drums', np.tanh((body * 1.4 + skin * 0.6) * 1.3).astype(np.float32), t0, pan, gain * 0.55)

def impact(t0, gain=1.0):
    n = S(3.5); t = np.arange(n) / SR
    boom = np.tanh(1.5 * np.sin(2 * np.pi * np.cumsum(34 + 60 * np.exp(-t / 0.07)) / SR) * np.exp(-t / 1.0))
    crash = filt(rs.standard_normal(n).astype(np.float32), 'high', 2500) * np.exp(-t / 0.9) * 0.35
    add('fx', boom.astype(np.float32), t0, 0, gain * 0.55)
    add('fx', crash, t0, -0.3, gain * 0.35); add('fx', np.roll(crash, 97), t0, 0.3, gain * 0.35)

def riser(t_end, dur, gain=1.0):
    n = S(dur); t = np.arange(n) / SR; k = t / dur
    nz = rs.standard_normal(n).astype(np.float32)
    out = np.zeros(n, np.float32)
    for i in range(8):                                   # stepped band-pass sweep
        a, b = int(i * n / 8), int((i + 1) * n / 8) + S(0.05)
        fc = 400 * 2 ** (i * 0.6)
        seg = filt(nz[a:b], 'band', [fc * 0.7, min(fc * 1.6, 20000)])
        out[a:a + len(seg)] += seg[:len(out) - a]
    tone = np.sin(2 * np.pi * np.cumsum(110 * 2 ** (3 * k)) / SR) * 0.25
    sig = (out * 0.5 + tone) * k ** 2.5
    add('fx', sig.astype(np.float32), t_end - dur, -0.2, gain * 0.5); add('fx', np.roll(sig, 300).astype(np.float32), t_end - dur, 0.2, gain * 0.5)

def reverse_swell(t_end, dur, gain=1.0):
    n = S(dur); t = np.arange(n) / SR
    nz = filt(rs.standard_normal(n).astype(np.float32), 'high', 3000) * (t / dur) ** 3
    add('fx', nz, t_end - dur, 0, gain * 0.35)

def whoosh(t_hit, gain=1.0):
    dur = 0.5; n = S(dur); k = np.arange(n) / n
    nz = filt(rs.standard_normal(n).astype(np.float32), 'band', [300, 3000]) * np.sin(np.pi * k) ** 2
    add('fx', nz, t_hit - dur * 0.7, -0.5, gain * 0.3); add('fx', np.roll(nz, 400), t_hit - dur * 0.7, 0.5, gain * 0.3)

def roll(t0, t1, gain=1.0):
    t = t0; step = BEAT / 2
    while t < t1:
        k = (t - t0) / (t1 - t0)
        snare(t, gain * (0.35 + 0.65 * k))
        step = BEAT / 2 if k < 0.35 else BEAT / 4 if k < 0.7 else BEAT / 8
        t += step

# ------------------------------------------------------------------ arrangement
# 0-4 s  cold open: heartbeat, low pad, a bell on "ONE BALL."
pad('Bm', 0.0, 4.0, 0.8, 700)
for k in range(4): heartbeat(k * 1.0 + 0.02, 0.7 + 0.1 * k)
bell(78, 1.0, 1.0, 0.1); bell(74, 1.0 + BEAT * 1.5, 0.6, -0.2)
reverse_swell(4.0, 2.0, 1.0)

# 4-8 s  nations: three taiko hits, then an ostinato
for i, b in enumerate(TL['nationHits']):
    taiko(tb(b), 1.1, [52, 58, 64][i], [-0.4, 0, 0.4][i]); kick(tb(b), 0.9)
impact(tb(2.75), 0.8)
for b in (2, 3):
    ch = chord_at(b); pad(ch, tb(b), BAR, 1.0, 1800)
    for s in range(8):
        pluck(PROG[ch][1 + s % 4] + 12, tb(b, s / 2), 0.7 + 0.2 * (s % 2 == 0), 0.35 if s % 2 else -0.35)
    for q in (2, 3): taiko(tb(b, q + 0.5 if b == 3 else q), 0.45, 70, 0.2)
riser(8.0, 1.5, 0.6)

# 8-14 s  map: four-on-the-floor and a rising city arpeggio
PENTA = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86, 88, 90, 93, 95, 98]
for b in range(4, 7):
    ch = chord_at(b); pad(ch, tb(b), BAR, 1.0, 2400)
    for q in range(4):
        kick(tb(b, q), 0.9); hat(tb(b, q + 0.5), 0.8)
        bass(ROOT[ch] + 12, tb(b, q), BEAT * 0.45); bass(ROOT[ch] + 12, tb(b, q + 0.5), BEAT * 0.4, 0.8)
    clap(tb(b, 1), 0.7); clap(tb(b, 3), 0.7)
for i in range(16):
    t0 = tb(TL['cityStart'] + i * TL['cityStep'])
    bell(PENTA[i], t0, 0.55, -0.5 + i / 15); pluck(PENTA[i], t0, 0.6, 0.5 - i / 15, 0.3)
whoosh(14.0, 1.2)

# 14-20 s  stats: slams, driving toms, the build
for i, b in enumerate(TL['statHits']):
    t0 = tb(b); impact(t0, 0.8); taiko(t0, 1.0, 50); kick(t0, 1.1); brass_stab(chord_at(b), t0, 1.0)
    ch = chord_at(b); pad(ch, t0, BAR, 1.0, 1600 + i * 800)
    for s in range(16 if b < 9 else 8):
        if s % 4 == 0: kick(tb(b, s / 4), 0.8)
        taiko(tb(b, s / 4), 0.14 + 0.08 * (s % 4 == 2), 90 + 10 * (s % 3), 0.5 * (-1) ** s)
    for q in range(4): bass(ROOT[ch] + 12, tb(b, q), BEAT * 0.8, 0.9)
roll(tb(9), tb(9, 3.75), 0.8)
riser(tb(10) - 0.02, BAR, 1.2)
whoosh(tb(10), 1.0)

# 20-30 s  the drop: full anthem with the chant
def anthem_bar(b, dense=1.0, choir=True):
    ch = chord_at(b)
    supersaw_chord(ch, tb(b), BAR * 0.98, dense, 5200)
    for q in range(4):
        kick(tb(b, q), 1.2)
        hat(tb(b, q + 0.5), 0.9 * dense, open_=True, pan=0.25)
        hat(tb(b, q + 0.25), 0.4 * dense, pan=-0.3); hat(tb(b, q + 0.75), 0.4 * dense, pan=-0.3)
        for e in (0, 0.5): bass(ROOT[ch] + 12 + (12 if (q == 3 and e) else 0), tb(b, q + e), BEAT * 0.42)
    clap(tb(b, 1)); clap(tb(b, 3))
    snare(tb(b, 1), 0.5); snare(tb(b, 3), 0.5)
impact(tb(10), 1.4); kick(tb(10), 1.4)
for b in range(10, 15): anthem_bar(b)
chant(10, 1.0); chant(14, 0.9)   # second phrase runs into the breakdown and is filtered there

# 30-34 s  slow-motion breakdown
pad('Bm', tb(15), BAR * 2, 1.2, 600)
bass(35, tb(15), BAR * 2, 0.8, 1.0)
for k in range(4): heartbeat(tb(15, k * 2), 1.0)
riser(tb(17) - 0.08, 2.6, 1.3)
reverse_swell(tb(17) - 0.08, 1.5, 1.4)

# 34 s  GOAL
impact(tb(17), 1.8); kick(tb(17), 1.5); taiko(tb(17), 1.4, 46); brass_stab('D', tb(17), 1.5)
supersaw_chord('D', tb(17), BAR * 0.5, 1.2, 7000)
for b in range(18, 24): anthem_bar(b, 1.0 if b < 20 else 0.75)
supersaw_chord('G', tb(17.5), BAR * 0.5, 1.0, 5200)
for q in (2, 3): kick(tb(17, q)); clap(tb(17, q))
chant(18, 1.1); chant(22, 0.8)
roll(tb(23, 2), tb(24), 0.7); riser(tb(24) - 0.02, BAR, 1.1)
for cut in (20, 22): whoosh(tb(cut), 0.8); taiko(tb(cut), 0.8, 55)

# 48-56 s  title: the last big statement
impact(tb(24), 1.6); kick(tb(24), 1.4); taiko(tb(24), 1.3, 44)
for b in range(24, 28):
    anthem_bar(b, 1.0)
    pad(chord_at(b), tb(b), BAR, 1.3, 2600)
    if b == 27: roll(tb(27, 2), tb(28), 0.6)
chant(24, 1.5)
# 56 s  button
impact(tb(28), 1.1); kick(tb(28), 1.2); taiko(tb(28), 1.2, 44)
supersaw_chord('D', tb(28), 3.2, 1.1, 4500); pad('D', tb(28), 3.0, 1.2, 2000)
for i, m in enumerate([74, 78, 81, 86]): bell(m, tb(28) + i * 0.09, 0.8, -0.3 + 0.2 * i)
bass(38, tb(28), 3.0, 1.0, 1.0)

# ------------------------------------------------------------------ crowd bed
def crowd_bed():
    n = N; t = np.arange(n) / SR
    base = rs.standard_normal((2, n)).astype(np.float32)
    bed = np.stack([filt(filt(base[c], 'band', [250, 2600], 2), 'low', 3500) for c in range(2)])
    am = 1 + 0.25 * np.interp(t, np.arange(0, TOTAL + 1, 0.37), rs.standard_normal(int((TOTAL + 1) / 0.37) + 1))
    lvl = np.interp(t, [0, 19.5, 20, 29.5, 30.5, 33.8, 34.0, 36, 40, 47.5, 48, 55.5, 56, 58, 60.5],
                       [0, 0, .55, .55, .18, .25, 1.35, 1.0, .5, .5, .7, .6, .75, .3, 0])
    BUS['crowd'] += bed * (am * lvl)[None, :] * 0.2
    # goal roar: brighter, rising voices
    r0 = S(tb(17)); rn = S(5.0); tt = np.arange(rn) / SR
    roar = filt(rs.standard_normal(rn).astype(np.float32), 'band', [500, 4000]) * np.minimum(1, tt / 0.12) * np.exp(-tt / 2.2)
    BUS['crowd'][0, r0:r0 + rn] += roar * 0.32; BUS['crowd'][1, r0:r0 + rn] += np.roll(roar, 211) * 0.32
crowd_bed()

# ------------------------------------------------------------------ mix
def band_mask(t_from, t_to, cutoff, fade=0.25):
    """Low-pass the music between two times (the slow-motion breakdown)."""
    for k in ('music', 'choir', 'drums'):
        for c in range(2):
            x = BUS[k][c]; lpx = filt(x, 'low', cutoff, 4)
            m = np.clip(np.minimum((np.arange(N) / SR - t_from) / fade, (t_to - np.arange(N) / SR) / 0.05), 0, 1)
            x[:] = x * (1 - m) + lpx * m
band_mask(tb(15) - 0.05, tb(17) - 0.02, 420)

# sidechain: duck music + choir under the kicks in the anthem sections
kick_times = [tb(b, q) for b in list(range(10, 15)) + list(range(18, 28)) for q in range(4)]
duck = np.ones(N, np.float32); dn = S(0.3); curve = 1 - 0.45 * np.exp(-np.arange(dn) / SR / 0.08)
for kt in kick_times:
    i = S(kt); duck[i:i + dn] = np.minimum(duck[i:i + dn], curve[:max(0, min(dn, N - i))])
BUS['music'] *= duck[None, :]; BUS['choir'] *= (0.5 + 0.5 * duck)[None, :]

def reverb(x, seed, secs=3.2, pre=0.02):
    r = np.random.default_rng(seed); n = S(secs); t = np.arange(n) / SR
    ir = r.standard_normal(n) * np.exp(-t / (secs / 6.0)); ir[:S(pre)] = 0; ir = filt(ir.astype(np.float32), 'low', 6000)
    ir /= np.sqrt(np.sum(ir ** 2))
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    return np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[:len(x)].astype(np.float32)

send = {'music': 0.28, 'choir': 0.75, 'drums': 0.12, 'fx': 0.3, 'crowd': 0.2}
level = {'music': 1.0, 'choir': 1.6, 'drums': 1.0, 'fx': 0.9, 'crowd': 0.9}
dry = sum(BUS[k] * level[k] for k in BUS)
wet_in = sum(BUS[k] * send[k] for k in BUS)
wet = np.stack([reverb(wet_in[0], 1), reverb(wet_in[1], 2)])
mix = dry + 0.5 * wet
mix = np.stack([filt(mix[c], 'high', 28) for c in range(2)])

# master: normalise the busy middle to about -14 dBFS RMS, soft-clip the peaks, fade the tail
body = slice(S(20), S(56))
rms = np.sqrt(np.mean(mix[:, body] ** 2))
mix *= 10 ** (-13.0 / 20) / rms
mix = np.tanh(mix * 1.15) / 1.15 * 0.97
fade = np.ones(N, np.float32); fo = S(2.2); end = S(TOTAL)
fade[end - fo:end] = np.linspace(1, 0, fo) ** 2; fade[end:] = 0
mix *= fade[None, :]
mix = mix[:, :end]

pcm = (np.clip(mix.T, -1, 1) * 32767).astype('<i2')
with wave.open('score.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print(f'score.wav  {TOTAL:.2f}s  peak {np.abs(mix).max():.3f}')
