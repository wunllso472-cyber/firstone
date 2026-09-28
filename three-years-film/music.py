"""Original score for THREE YEARS, synthesized from the same timeline the visuals use."""
import json, re, wave, sys
import numpy as np

TL = json.loads(open('timeline.js').read().split('=', 1)[1].strip().rstrip(';'))
SR = 48000
BPM = TL['bpm']
BEAT = 60 / BPM
BAR = BEAT * 4
TOTAL = TL['totalBars'] * BAR + 1.0
N = int(TOTAL * SR)
L = np.zeros(N, np.float32)
R = np.zeros(N, np.float32)
DRY_L = np.zeros(N, np.float32)   # busses that skip the reverb
DRY_R = np.zeros(N, np.float32)
rs = np.random.default_rng(7)

def mtof(m): return 440.0 * 2 ** ((m - 69) / 12)
def S(t): return int(round(t * SR))

def add(sig, t0, pan=0.0, gain=1.0, dry=False):
    i0 = S(t0)
    if i0 >= N: return
    if i0 < 0:
        sig = sig[-i0:]; i0 = 0
    n = min(len(sig), N - i0)
    gl = gain * np.sqrt(0.5 * (1 - pan)); gr = gain * np.sqrt(0.5 * (1 + pan))
    (DRY_L if dry else L)[i0:i0 + n] += (sig[:n] * gl).astype(np.float32)
    (DRY_R if dry else R)[i0:i0 + n] += (sig[:n] * gr).astype(np.float32)

def env_adsr(n, a, d, s, r_len, sus_level):
    a, d, r_len = S(a), S(d), S(r_len)
    e = np.full(n, sus_level, np.float32)
    a = max(a, 1)
    e[:a] = np.linspace(0, 1, a)
    dd = min(d, max(0, n - a))
    if dd > 0: e[a:a + dd] = np.linspace(1, sus_level, dd)
    if r_len > 0 and n > r_len: e[n - r_len:] *= np.linspace(1, 0, r_len) ** 2
    return e

def additive(freq, dur, harmonics, detune_cents=0.0, phase=0.0):
    t = np.arange(S(dur)) / SR
    f = freq * 2 ** (detune_cents / 1200)
    out = np.zeros_like(t)
    for h, amp in harmonics:
        if f * h > 12000: break
        out += amp * np.sin(2 * np.pi * f * h * t + phase * h)
    return out

def hp(x):  # crude one-zero high-pass
    return np.concatenate([[0], np.diff(x)])

def lp(x, k):  # moving-average low-pass (k samples)
    c = np.cumsum(np.concatenate([np.zeros(k), x]))
    return (c[k:] - c[:-k]) / k

def band(n, k=6):  # band-limited noise: no fizz above a few kHz
    return hp(lp(rs.standard_normal(n), k)) * 2.2

# ---------------------------------------------------------------- harmony
CH = {
    'Dm': [50, 57, 62, 65, 69], 'Bb': [46, 53, 58, 62, 65], 'F': [45, 53, 57, 60, 65], 'C': [48, 55, 60, 64, 67],
    'Gm': [43, 50, 55, 58, 62], 'A': [45, 52, 57, 61, 64], 'Asus': [45, 52, 57, 62, 64], 'D': [50, 57, 62, 66, 69],
}
ROOT = {'Dm': 38, 'Bb': 34, 'F': 41, 'C': 36, 'Gm': 43, 'A': 33, 'Asus': 33, 'D': 38}
ARP = {k: [n + 12 for n in v[1:]] + [v[2] + 24] for k, v in CH.items()}

HIT = TL['titleHit']
ACTB = {a['id']: a['bar'] for a in TL['acts']}
def progression(bar):
    b = int(bar)
    if b < 4: return 'Dm'
    if b < ACTB[1]: return ['Dm', 'Bb', 'F', 'C'][(b - 4) % 4]
    if b < ACTB[2]: return ['Dm', 'Bb', 'F', 'C'][(b - ACTB[1]) % 4]
    if b < ACTB[3]: return ['Dm', 'Gm', 'Bb', 'A'][(b - ACTB[2]) % 4]
    if b < ACTB[4]: return ['Dm', 'Bb', 'F', 'C'][(b - ACTB[3]) % 4]
    if b < ACTB[5]: return ['Bb', 'F', 'C', 'Dm'][(b - ACTB[4]) % 4]
    if b < ACTB[6]: return ['Dm', 'Bb', 'Gm', 'A'][(b - ACTB[5]) % 4]
    if b >= HIT: return 'D'
    return ['Bb', 'F', 'Gm', 'Asus', 'Bb', 'F', 'Gm', 'Gm', 'Asus'][min(b - ACTB[6], 8)]

def act_of(bar):
    a = 0
    for x in TL['acts']:
        if bar >= x['bar']: a = x['id']
    return a

# ---------------------------------------------------------------- instruments
def pad(chord, t0, dur, bright, gain):
    for i, m in enumerate(CH[chord]):
        f = mtof(m)
        H = [(h, (1 / h ** 1.25) * (bright ** (h - 1))) for h in range(1, 9)]
        for dc, pan in ((-7, -0.6), (0, 0.0), (7, 0.6)):
            sig = additive(f, dur + 1.4, H, dc, phase=rs.random() * 6.28)
            e = env_adsr(len(sig), 0.45, 0.8, 0.8, 1.4, 0.8)
            add(sig * e, t0, pan * (0.5 + 0.1 * i), gain * 0.075)

def bass(note, t0, dur, gain):
    f = mtof(note)
    sig = additive(f, dur, [(1, 1.0), (2, 0.35), (3, 0.12)])
    e = env_adsr(len(sig), 0.008, 0.12, 0.75, 0.06, 0.75)
    add(sig * e, t0, 0, gain, dry=True)

def kick(t0, gain=1.0):
    n = S(0.5); t = np.arange(n) / SR
    f = 46 + 110 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    sig = np.sin(ph) * np.exp(-t / 0.22) + 0.25 * rs.standard_normal(n) * np.exp(-t / 0.004)
    add(np.tanh(sig * 1.6) * 0.9, t0, 0, gain * 0.55, dry=True)

def clap(t0, gain=1.0):
    n = S(0.35); t = np.arange(n) / SR
    noise = band(n, 3)
    e = np.exp(-t / 0.07) * (1 + 0.6 * (np.sin(2 * np.pi * t / 0.011) > 0) * (t < 0.03))
    sig = noise * e * 0.5 + np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.05) * 0.3
    add(sig, t0, 0.1, gain * 0.32)

def hat(t0, gain=1.0, open_=False, pan=0.25):
    n = S(0.25 if open_ else 0.06); t = np.arange(n) / SR
    sig = hp(lp(rs.standard_normal(n), 2)) * np.exp(-t / (0.09 if open_ else 0.018))
    add(sig * 0.11, t0, pan, gain, dry=True)

def pluck(note, t0, gain, pan):
    f = mtof(note)
    sig = additive(f, 0.9, [(1, 1), (2, 0.5), (3, 0.25), (4, 0.12), (5, 0.06)])
    t = np.arange(len(sig)) / SR
    sig *= np.exp(-t / 0.18) * np.minimum(1, t / 0.003)
    add(sig, t0, pan, gain * 0.095)

def piano(note, t0, gain, pan=0.0):
    f = mtof(note)
    sig = additive(f, 3.0, [(1, 1), (2, 0.42), (3, 0.2), (4, 0.1), (6, 0.04)], detune_cents=1.5) + \
          additive(f, 3.0, [(1, 0.6), (2, 0.2)], detune_cents=-1.5)
    t = np.arange(len(sig)) / SR
    sig *= np.exp(-t / 0.9) * np.minimum(1, t / 0.004)
    add(sig, t0, pan, gain * 0.09)

def riser(t0, dur, gain=1.0):
    n = S(dur); t = np.arange(n) / SR; k = t / dur
    noise = band(n, 8) * (k ** 2.2)
    f = 180 * (2 ** (4 * k))
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * (k ** 3) * 0.3
    add((noise * 0.25 + tone), t0, -0.3, gain * 0.5)
    add((noise * 0.25 + tone), t0, 0.3, gain * 0.5)

def impact(t0, gain=1.0):
    n = S(3.2); t = np.arange(n) / SR
    boom = np.sin(2 * np.pi * (38 + 40 * np.exp(-t / 0.08)) * t) * np.exp(-t / 0.9)
    crash = band(n, 5) * np.exp(-t / 0.5) * 0.35
    add(np.tanh(boom * 1.4) * 0.8, t0, 0, gain * 0.7, dry=True)
    add(crash, t0, -0.2, gain * 0.6); add(crash[::-1][::-1] * 0.9, t0 + 0.004, 0.2, gain * 0.6)

def whoosh(t_hit, gain=1.0):
    dur = 0.45; n = S(dur); t = np.arange(n) / SR; k = t / dur
    sig = band(n, 10) * np.sin(np.pi * k) ** 2 * k
    add(sig * 0.18, t_hit - dur * 0.85, -0.5, gain); add(sig * 0.18, t_hit - dur * 0.8, 0.5, gain)

def click(t0, gain=1.0):
    n = S(0.03); t = np.arange(n) / SR
    sig = band(n, 2) * np.exp(-t / 0.004) + np.sin(2 * np.pi * 2400 * t) * np.exp(-t / 0.006) * 0.3
    add(sig * 0.35, t0, (rs.random() - 0.5) * 0.4, gain, dry=True)

def drop_sweep(t0, dur=0.9):
    n = S(dur); t = np.arange(n) / SR; k = t / dur
    f = 420 * (2 ** (-3 * k))
    sig = np.tanh(3 * np.sin(2 * np.pi * np.cumsum(f) / SR)) * (1 - k) * 0.35
    add(sig, t0, 0, 0.8)

# ---------------------------------------------------------------- arrangement
act_bars = [a['bar'] for a in TL['acts']]
total_bars = TL['totalBars']
BRIGHT = {0: 0.35, 1: 0.5, 2: 0.45, 3: 0.62, 4: 0.7, 5: 0.33, 6: 0.5}
PADG = {0: 0.8, 1: 1.0, 2: 1.0, 3: 0.85, 4: 1.0, 5: 1.05, 6: 1.1}

# pads: one chord per bar (prologue drone for first 4 bars)
pad('Dm', 0.0, 4 * BAR - 0.3, 0.3, 0.55)
for b in range(4, HIT):
    pad(progression(b), b * BAR, BAR, BRIGHT[act_of(b)], PADG[act_of(b)])
pad('D', HIT * BAR, 3 * BAR, 0.45, 1.0)

# prologue: low drone + typing
bass(26, 0.2, 4 * BAR - 0.4, 0.18)
thirty2 = BEAT / 8
for ln in TL['typing']:
    for i, ch in enumerate(ln['text']):
        if ch != ' ': click(ln['bar'] * BAR + i * thirty2, 0.55)

# rhythm section by act
def is_last_bar(b): return (b + 1) in act_bars
for b in range(4, HIT):
    a = act_of(b); ch = progression(b); root = ROOT[ch]; t0 = b * BAR
    last = is_last_bar(b)
    steps = range(16)
    for st in steps:
        ts = t0 + st * BEAT / 4
        if last and st >= 8: continue            # drop out under the riser
        if a == 0 and b >= 4:
            if st == 0: kick(ts, 0.7)
        if a == 1:
            if st in (0, 8): kick(ts, 0.8)
            if st in (2, 6, 10, 14): hat(ts, 0.5)
            if st % 4 == 0: bass(root + 12, ts, BEAT * 0.9, 0.2)
        if a == 2:
            if st in (0, 6, 10): kick(ts, 0.85)
            if st == 12: clap(ts, 0.8)
            hat(ts, 0.55 if st % 2 else 0.3, pan=0.3 if st % 2 else -0.2)
            if st in (0, 6, 10): bass(root + 12, ts, BEAT * 0.7, 0.22)
        if a == 3:
            if st % 4 == 0: kick(ts, 1.0)
            if st in (4, 12): clap(ts, 1.0)
            if st % 4 == 2: hat(ts, 0.8, open_=True)
            elif st % 2 == 1: hat(ts, 0.35)
            if st % 2 == 0: bass(root + 12 + (12 if st % 8 == 6 else 0), ts, BEAT * 0.42, 0.2)
            arp = ARP[ch]; pluck(arp[[0, 1, 2, 3, 2, 1][st % 6]], ts, 0.9, -0.4 if st % 2 else 0.4)
        if a == 4:
            if st % 4 == 0: kick(ts, 0.95)
            if st in (4, 12): clap(ts, 0.9)
            if st % 4 == 2: hat(ts, 0.9, open_=True)
            if st % 4 == 0: bass(root + 12, ts, BEAT * 0.85, 0.22)
            arp = ARP[ch]; pluck(arp[[0, 2, 1, 3][st % 4]] + (12 if st % 8 == 7 else 0), ts, 0.8, -0.5 if st % 2 else 0.5)
        if a == 5:                               # stakes: a heartbeat and a ticking clock
            if st in (0, 3): kick(ts, 0.85 if st == 0 else 0.55)
            if st % 2 == 0: hat(ts, 0.28, pan=0.5 if st % 4 else -0.5)
            if st == 0: bass(root, ts, BAR * 0.95, 0.2)
            if st in (8, 14): pluck(ARP[ch][3] + 12, ts, 0.35, 0.6 if st == 8 else -0.6)
        if a == 6 and b < 95:
            if st % 4 == 0 and b >= 92: piano(ARP[ch][(st // 4) % 4], ts, 0.9, -0.2 + 0.1 * (st // 4))
            if st % 2 == 0 and b < 92: pluck(ARP[ch][[0, 1, 2, 3, 2, 1, 0, 1][(st // 2) % 8]], ts, 0.5, 0.3 if st % 4 else -0.3)
    # sustained sub under act changes
    if a in (1, 2, 3, 4) and not last:
        bass(root, t0, BAR * 0.98, 0.14)

# epilogue build and final chord
riser((HIT - 1) * BAR, BAR, 0.8)
for i, m in enumerate([62, 66, 69, 74]):
    piano(m, HIT * BAR + i * BEAT / 2, 1.1, -0.3 + 0.2 * i)
bass(38, HIT * BAR, 2.5 * BAR, 0.2)

# transitions
for ab in act_bars[1:]:
    riser((ab - 1) * BAR, BAR, 1.0 if ab != ACTB[6] else 0.7)
    impact(ab * BAR, 1.0 if ab != ACTB[6] else 0.6)
riser(3 * BAR, BAR, 0.9)
impact(4 * BAR, 1.2)
impact(HIT * BAR, 1.0)
for sb in TL['slams']:
    impact(sb * BAR, 0.55); kick(sb * BAR, 1.2)
cuts = {s['bar'] for s in TL['shots']} - set(act_bars) - set(TL['slams']) - {0, 4}
for cb in sorted(cuts):
    whoosh(cb * BAR, 0.9)

# story accents
nv = next(s for s in TL['shots'] if s['id'] == 'nvda')
drop_sweep(nv['bar'] * BAR + 1.8, 0.8)
idx = {s['id']: s for s in TL['shots']}
for k in range(0, 6):                       # terminal line ticks
    click(idx['cc']['bar'] * BAR + 0.25 + k * BEAT, 0.8)
impact(idx['fake']['bar'] * BAR + 1.9, 0.45)       # deepfake stamp
impact(idx['court']['bar'] * BAR + 0.35 + 3 * BEAT, 0.35)   # settlement stamp
for k in range(4):                          # desktop clicks
    click(idx['cu']['bar'] * BAR + [0.5, 1.3, 2.1, 2.9][k] + 0.02, 1.2)

# ---------------------------------------------------------------- sidechain + reverb + master
kick_times = []
for b in range(4, HIT):
    a = act_of(b)
    if a in (3, 4):
        for q in range(4): kick_times.append(b * BAR + q * BEAT)
    elif a in (1,):
        kick_times += [b * BAR, b * BAR + 2 * BEAT]
duck = np.ones(N, np.float32)
dn = S(0.32); curve = 1 - 0.55 * np.exp(-np.arange(dn) / SR / 0.09)
for kt in kick_times:
    i = S(kt); n = min(dn, N - i)
    if n > 0: duck[i:i + n] = np.minimum(duck[i:i + n], curve[:n])
L *= duck; R *= duck

def reverb(x, seed, secs=2.8):
    r = np.random.default_rng(seed)
    n = S(secs); t = np.arange(n) / SR
    ir = r.standard_normal(n) * np.exp(-t / (secs / 5.5))
    ir[:S(0.012)] = 0
    ir /= np.sqrt(np.sum(ir ** 2))
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[:len(x)]
    return y.astype(np.float32)

wetL, wetR = reverb(L, 1), reverb(R, 2)
mixL = L + DRY_L + 0.32 * wetL
mixR = R + DRY_R + 0.32 * wetR
body = slice(S(6 * BAR), S(63 * BAR))
rms = np.sqrt(np.mean(((mixL[body] + mixR[body]) / 2) ** 2))
g = 10 ** (-13.5 / 20) / rms                  # music sits around -14 dBFS
mixL, mixR = np.tanh(mixL * g * 1.1) / 1.1, np.tanh(mixR * g * 1.1) / 1.1
fade = np.ones(N, np.float32)
fo = S(3.5); fade[-fo:] = np.linspace(1, 0, fo) ** 2
fade[:S(0.05)] = np.linspace(0, 1, S(0.05))
mixL *= fade * 0.93; mixR *= fade * 0.93

pcm = (np.stack([mixL, mixR], 1) * 32767).astype('<i2')
with wave.open('score.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print(f'score.wav  {TOTAL:.2f}s  peak-normalized')
