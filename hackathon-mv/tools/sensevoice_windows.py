import sherpa_onnx, numpy as np, json
d='sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/'
rec=sherpa_onnx.OfflineRecognizer.from_sense_voice(model=d+'model.int8.onnx',tokens=d+'tokens.txt',language='zh',use_itn=False,num_threads=4)
x=np.fromfile('mono16.f32',dtype=np.float32); sr=16000
W,Hh=10.0,2.0
wins=[]
t=0.0
while t < len(x)/sr - 1:
    s=rec.create_stream(); s.accept_waveform(sr,x[int(t*sr):int((t+W)*sr)]); rec.decode_stream(s)
    r=s.result
    wins.append({"t":t,"text":r.text,"toks":[[round(t+ts,2),tok] for tok,ts in zip(r.tokens,r.timestamps)]})
    t+=Hh
json.dump(wins,open('sv_windows.json','w'),ensure_ascii=False)
print(len(wins))
