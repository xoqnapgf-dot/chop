import os
import json, sys, numpy as np, soundfile as sf, librosa
from faster_whisper import WhisperModel
A=os.environ.get('MV_AUDIO', 'audio/')
v,sr=librosa.load(A+'sep4/htdemucs/song22/vocals.wav',sr=16000,mono=True)
m=WhisperModel('large-v3', device='cpu', compute_type='int8', cpu_threads=4)
chunks=[(52,80,"一歩ずつ顔を上げて 今日を越えて行く さよならは終わりじゃない 遠い空でまた会える 震える声抱きしめて 私は今歌う"),
        (104,133,"涙なら拭わなくていい 明日へ進めばいい さよならは終わりじゃない 遠い空でまた会える 震える声抱きしめて 私は今歌う"),
        (130,156,"もしも道に迷う夜は あの日の笑顔灯りにする 小さな願い重ねながら 新しい朝へ"),
        (160,210,"さよならは終わりじゃない 遠い空でまた会える この声よ高く強く 君のもとへ届け さよならは終わりじゃない 胸の中で生きている 震える声抱きしめて 私は今歩く")]
out=[]
for a,b,p in chunks:
    seg=v[int(a*16000):int(b*16000)]
    segs,_=m.transcribe(seg,language='ja',word_timestamps=True,initial_prompt=p,vad_filter=False,beam_size=5,condition_on_previous_text=False)
    for s in segs:
        ws=[{'s':w.start+a,'e':w.end+a,'w':w.word,'p':w.probability} for w in s.words]
        out.append({'start':s.start+a,'end':s.end+a,'text':s.text,'words':ws})
        print(f"== {s.start+a:.2f}-{s.end+a:.2f} {s.text}",flush=True)
        print(' '.join(f"{w['w'].strip()}@{w['s']:.2f}" for w in ws),flush=True)
json.dump(out,open(A+'whisper_chunks.json','w'),ensure_ascii=False,indent=1)
