"""Build lyrics.js: lyric lines with per-character timing, scene cues and sections.

Character times come from data/aligned.json (SenseVoice timestamps aligned to the
known lyrics, see tools/). Cues snap to the song's beat grid.

  python3 timeline.py        # -> lyrics.js
"""
import json, re

BPM, BEAT0, DURATION = 127.6, 0.142, 203.18
BEAT = 60 / BPM

EN = [
    "One soft chime of a QR code, and people from everywhere join the group",
    "The Mid-Autumn moon isn't full yet, and we're already thinking about models",
    "The sign-up page says sorry: new users paused",
    "But a passion for code never calls a halt",
    "Someone lends a key, someone tidies up the docs",
    "The group admin waves and laughs: short on tokens? Come to me",
    "Third floor of Yungu Center, a night on Lantern Street",
    "At 2 a.m., someone is still testing Jev's responses",
    "Let AI make the next decision",
    "We sign our own names with Jev",
    "Thirty seats, a three-hundred-dollar pass",
    "Running an idea until it's a light in the night",
    "Let AI make the next decision",
    "Passion is the ticket, code is the proof",
    "Milk tea at 30% sugar, coffee to keep us going",
    "In the group photo, we're all glowing shadows",
    "The 6 p.m. demos, in a meeting room called “Wilderness”",
    "A Feishu bot, a finance radar, a sales assistant",
    "Every demo is a letter to the future",
    "“It works!” from the audience beats any prize",
    "Chuxin wants to save the sun, and be the Sun King",
    "Really we're all the same, holding keys like starlight",
    "No grand prize, just a grand gathering",
    "Red envelopes out of our own pockets, still sweet as candy",
    "Thank you for setting it up, bringing the stars together",
    "Thunderstorms over Hangzhou can't stop those on their way",
    "Next event, we carry on",
    "And give the universe a patch of our own",
    "Let AI make the next decision",
    "We decided to meet",
    "The story of Yungu 404",
    "To be continued",
]

# (lyric line index or absolute time, scene, options). Line cues land on the beat before the vocal.
CUES = [
    (0.0, 'intro', None),
    ('L0', 'qr', None), ('L1', 'moon', None), ('L2', 'signup', None), ('L3', 'code', None),
    ('L4', 'keys', None), ('L5', 'token', None), ('L6', 'lobby', None), ('L7', 'night', None),
    ('L8', 'decide', {'seed': 1}, 'flash'), ('L9', 'sign', None), ('L10', 'seats', None), ('L11', 'lights', None),
    ('L12', 'decide', {'seed': 5}, 'flash'), ('L13', 'ticket', None), ('L14', 'tea', None),
    ('L15', 'group', {'flash': True}, 'cut'),
    (93.6, 'montage', {'keys': ['lobby', 'pitch', 'demo', 'group'], 'title': '10:00 — 20:00', 'sub': '十个小时，八个项目'}),
    (101.1, 'roster', None), (108.6, 'score', None), (116.1, 'rise', None),
    ('L16', 'pitch', None, 'flash'), ('L17', 'projects', None), ('L18', 'letters', None), ('L19', 'tong', None),
    ('L20', 'sun', None), ('L21', 'starkey', None), ('L22', 'sheet', None), ('L23', 'hongbao', None),
    (155.0, 'constellation', None), ('L25', 'storm', None), ('L26', 'next', None), ('L27', 'patch', None),
    ('L28', 'montage', {'keys': ['lobby', 'pitch', 'group', 'demo', 'sheet'], 'big': '让 AI 做出下一步决定', 'en': 'Let AI make the next decision'}, 'flash'),
    ('L29', 'group', {'flash': True, 'caption': False, 'z0': 1.15, 'z1': 1.0}, 'cut'),
    ('L30', 'notfound', None), (184.6, 'end', None),
]
HIDE = {8, 12, 28, 31}  # lines the scene itself writes large
SECTIONS = [(0, 'INTRO · 前奏'), ('L0', 'VERSE 01 · 主歌一'), ('L8', 'CHORUS · 副歌'), (93.6, 'INTERLUDE · 间奏'),
            ('L16', 'VERSE 02 · 主歌二'), (155.0, 'BRIDGE · 桥段'), ('L28', 'OUTRO · 尾声')]


def snap_before(t):
    n = int((t - BEAT0) / BEAT)
    return round(BEAT0 + n * BEAT, 3)


def main():
    al = json.load(open('data/aligned.json'))
    lines = []
    for i, l in enumerate(al):
        ts = [c[0] for c in l['chars']]
        lines.append({'t0': round(ts[0] - 0.12, 2), 't1': round(ts[-1] + 0.5, 2), 'zh': l['zh'], 'en': EN[i],
                      'ct': [round(t, 2) for t in ts], **({'hide': True} if i in HIDE else {})})
    at = lambda x: snap_before(lines[int(x[1:])]['t0'] - 0.05) if isinstance(x, str) else x
    cues = []
    for c in CUES:
        d = {'t': at(c[0]), 'scene': c[1]}
        if c[2]: d['o'] = c[2]
        if len(c) > 3: d['tr'] = c[3]
        cues.append(d)
    for a, b in zip(cues, cues[1:]):
        assert b['t'] > a['t'] + 1.5, (a, b)
    sections = [{'t': at(t), 'label': s} for t, s in SECTIONS]
    chars = set(''.join(l['zh'] + l['en'] for l in lines))
    data = {'bpm': BPM, 'beat0': BEAT0, 'duration': DURATION, 'lines': lines, 'cues': cues, 'sections': sections}
    with open('lyrics.js', 'w') as f:
        f.write('window.LY = ' + json.dumps(data, ensure_ascii=False, indent=1) + ';\n')
    for c in cues: print(f"{c['t']:7.2f} {c['scene']}")


if __name__ == '__main__':
    main()
