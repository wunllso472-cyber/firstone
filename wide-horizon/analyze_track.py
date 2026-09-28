"""Measure a recording of the song and cut the music video to it.

Writes two things next to this script:
  - track.js: the recording itself, base64-encoded, played unchanged by index.html
  - the <script id="timing"> block in index.html: beats and their strength, loudness
    (10 values per second), section starts, scene cuts, and when every sung word begins.

Steps: librosa finds the beats and loudness; the Parakeet speech recognizer
(sherpa-onnx) transcribes the vocal with word timestamps; a fuzzy alignment maps
those words onto the lyrics below (including the repeats sung in the final
chorus); each scene then cuts on the last beat before its lyric starts.

Setup:
    pip install librosa sherpa-onnx numpy
    curl -LO https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2
    tar xjf sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2
Run:
    python3 analyze_track.py song.mp3 sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8
"""
import base64
import difflib
import json
import os
import re
import sys

import librosa
import numpy as np
import sherpa_onnx

HERE = os.path.dirname(os.path.abspath(__file__))
CHORUS=["Oh, America, land of the wide horizon,","Fifty stars that burn as one,","From the Eastern shore to the Western skyline,","Home of the brave beneath the sun."]
SECS=[("Verse 1",["When the harbor lights meet the morning tide,","And the Lady lifts her torch with pride,","Every tired heart from a distant shore","Finds a welcome here at the open door."]),
("Chorus",CHORUS),
("Verse 2",["Golden wheat rolls across the plains,","Barn doors open to the summer rains,","Eagles circle where the Rockies climb,","Rivers carry every dream in time."]),
("Chorus",CHORUS),
("Bridge",["Neon towers light the city night,","Engines thunder and the rockets take flight,","Many voices, and one song we share,","Freedom ringing through the open air."]),
("Final Chorus",["Oh, America, America, land of the wide horizon, wide horizon,","Fifty stars that burn as one, that burn as one,","From the Golden Gate to the Liberty skyline,","Home of the brave beneath the sun."]),
("Outro",["Land of the free, home of the brave."])]

# Scene list: (key, where it starts as (section index, line index) in SECS, lower-third label, section name).
SCENE_PLAN = [
    ("intro", None, None, None),
    ("harbor", (0, 0), "New York Harbor", "Verse 1"),
    ("flag", (1, 0), "Old Glory", "Chorus"),
    ("valley", (1, 2), "Monument Valley, Arizona", "Chorus"),
    ("prairie", (2, 0), "Kansas Wheat Country", "Verse 2"),
    ("mountains", (2, 2), "The Rocky Mountains", "Verse 2"),
    ("capitol", (3, 0), "Washington, D.C.", "Chorus"),
    ("flag", (3, 2), "Fifty Stars", "Chorus"),
    ("city", (4, 0), "New York City", "Bridge"),
    ("rocket", (4, 1), "Cape Canaveral, Florida", "Bridge"),
    ("finale", (5, 0), "Old Glory", "Final Chorus"),
    ("pacific", (5, 2), "Golden Gate, San Francisco", "Final Chorus"),
    ("outro", (6, 0), None, None),
]


def norm(w):
    return re.sub(r"[^a-z0-9]", "", w.lower().replace("harbour", "harbor"))


def transcribe(path, model_dir):
    """Word start times from the recording, transcribed in overlapping 20 s windows."""
    d = model_dir.rstrip("/") + "/"
    rec = sherpa_onnx.OfflineRecognizer.from_transducer(
        encoder=d + "encoder.int8.onnx", decoder=d + "decoder.int8.onnx", joiner=d + "joiner.int8.onnx",
        tokens=d + "tokens.txt", model_type="nemo_transducer")
    y, _ = librosa.load(path, sr=16000, mono=True)
    words, win, hop = [], 20, 15
    for s0 in np.arange(0, len(y) / 16000, hop):
        st = rec.create_stream()
        st.accept_waveform(16000, y[int(s0 * 16000):int((s0 + win) * 16000)])
        rec.decode_stream(st)
        cur = None
        for tk, t in zip(st.result.tokens, st.result.timestamps):
            t = float(t) + s0
            if tk.startswith(" ") or cur is None:
                if cur:
                    words.append(cur)
                cur = {"w": tk.strip(), "t": t, "chunk": float(s0)}
            else:
                cur["w"] += tk
        if cur:
            words.append(cur)
    # Keep each word from the window where it sits away from the window edges.
    words = [w for w in words if (w["chunk"] == 0 or w["t"] >= w["chunk"] + 2.5) and w["t"] < w["chunk"] + 17.5]
    return sorted(words, key=lambda w: w["t"])


def align(asr):
    """Give every lyric word a time: fuzzy global alignment against the transcript."""
    A = [norm(w["w"]) for w in asr]
    lyr=[]
    for si,(sec,lines) in enumerate(SECS):
        for li,text in enumerate(lines):
            for wi,w in enumerate(text.split()):
                lyr.append(dict(sec=sec,si=si,li=li,text=text,w=w,n=norm(w)))
    L=[x['n'] for x in lyr]
    # global alignment with fuzzy word similarity
    n,m=len(L),len(A)
    sim=lambda a,b:difflib.SequenceMatcher(None,a,b).ratio()
    G=-0.4
    S=[[0.0]*(m+1) for _ in range(n+1)];P=[[None]*(m+1) for _ in range(n+1)]
    for i in range(1,n+1): S[i][0]=S[i-1][0]+G;P[i][0]='u'
    for j in range(1,m+1): S[0][j]=S[0][j-1]+G*0.5;P[0][j]='l'
    for i in range(1,n+1):
        for j in range(1,m+1):
            s=sim(L[i-1],A[j-1]); d=S[i-1][j-1]+(s*2-0.6 if s>=0.5 else -1.5)
            u=S[i-1][j]+G; l=S[i][j-1]+G*0.5
            S[i][j],P[i][j]=max((d,'d'),(u,'u'),(l,'l'))
    i,j=n,m;match={}
    while i>0 or j>0:
        p=P[i][j]
        if p=='d':
            if sim(L[i-1],A[j-1])>=0.5: match[i-1]=j-1
            i,j=i-1,j-1
        elif p=='u': i-=1
        else: j-=1
    for k,x in enumerate(lyr): x['t']=asr[match[k]]['t'] if k in match else None
    # fill gaps: backward from the next anchor at ~0.3 s per word
    for k in range(len(lyr)-1,-1,-1):
        if lyr[k]['t'] is None:
            nxt=next((lyr[q]['t'] for q in range(k+1,len(lyr)) if lyr[q]['t'] is not None),None)
            lyr[k]['t']=nxt-0.3
            lyr[k]['fill']=True
    # enforce monotonic
    for k in range(1,len(lyr)): lyr[k]['t']=max(lyr[k]['t'],lyr[k-1]['t']+0.05)
    return lyr


def main():
    path, model_dir = sys.argv[1], sys.argv[2]
    lyr = align(transcribe(path, model_dir))
    y, sr = librosa.load(path, sr=22050, mono=True)
    dur = len(y) / sr
    oenv = librosa.onset.onset_strength(y=y, sr=sr)
    tempo, bf = librosa.beat.beat_track(onset_envelope=oenv, sr=sr)
    beats = librosa.frames_to_time(bf, sr=sr)
    bs = np.clip(oenv[bf] / np.percentile(oenv[bf], 95), 0, 1)
    rms = librosa.feature.rms(y=y, hop_length=sr // 10)[0]
    e = np.convolve(rms, np.ones(5) / 5, "same")
    e = np.clip((e - np.percentile(e, 5)) / (np.percentile(e, 98) - np.percentile(e, 5)), 0, 1)

    first = {}
    for x in lyr:
        first.setdefault((x["si"], x["li"]), x["t"])

    def cut(t):  # the last beat at least 0.3 s before t
        return round(float(beats[beats <= t - 0.3][-1]), 2)

    sections = [{"name": "Intro", "start": 0.0}] + [
        {"name": name, "start": cut(first[(i, 0)])} for i, (name, _) in enumerate(SECS)]
    plan = [(k, 0.0 if at is None else cut(first[at]), lab, sub) for k, at, lab, sub in SCENE_PLAN]
    scenes = [{"k": k, "a": a, "b": plan[i + 1][1] if i + 1 < len(plan) else round(dur, 2), "label": lab, "sub": sub}
              for i, (k, a, lab, sub) in enumerate(plan)]
    lines = []
    for x in lyr:
        if not lines or (lines[-1]["si"], lines[-1]["li"]) != (x["si"], x["li"]):
            lines.append({"sec": x["sec"], "si": x["si"], "li": x["li"], "text": x["text"], "words": []})
        lines[-1]["words"].append([round(x["t"], 2), x["w"]])
    for i, L in enumerate(lines):  # a line stays up until the next starts, at most 2.5 s after its last word
        nxt = lines[i + 1]["words"][0][0] if i + 1 < len(lines) else dur
        L["end"] = round(min(nxt - 0.15, L["words"][-1][0] + 2.5), 2)
        del L["si"], L["li"]
    timing = {"duration": round(dur, 2), "bpm": round(float(np.atleast_1d(tempo)[0]), 1),
              "beats": [[round(float(t), 2), round(float(s), 2)] for t, s in zip(beats, bs)],
              "energy": [round(float(v), 2) for v in e], "sections": sections, "scenes": scenes, "lines": lines}

    page = os.path.join(HERE, "index.html")
    html = open(page, encoding="utf-8").read()
    html = re.sub(r'(<script type="application/json" id="timing">).*?(</script>)',
                  lambda m: m.group(1) + json.dumps(timing, separators=(",", ":")) + m.group(2), html, count=1, flags=re.S)
    open(page, "w", encoding="utf-8").write(html)
    with open(os.path.join(HERE, "track.js"), "w") as f:
        f.write("// Generated by analyze_track.py: the song recording as base64 MP3, played unchanged.\n")
        f.write('window.WH_TRACK = "' + base64.b64encode(open(path, "rb").read()).decode() + '";\n')
    for s in scenes:
        print(f'{s["a"]:7.2f}  {s["k"]}')


if __name__ == "__main__":
    main()
