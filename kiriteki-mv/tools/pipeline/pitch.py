import os
import librosa, numpy as np, json
A=os.environ.get('MV_AUDIO', 'audio/')
y,sr=librosa.load(A+'sep4/htdemucs/song22/vocals.wav',sr=16000,mono=True)
hop=320  # 50 fps
f0,vf,vp=librosa.pyin(y,fmin=110,fmax=1000,sr=sr,frame_length=1280,hop_length=hop)
midi=np.where(vf,librosa.hz_to_midi(np.nan_to_num(f0,nan=1)),0)
rms=librosa.feature.rms(y=y,frame_length=1280,hop_length=hop)[0]
n=min(len(midi),len(rms)); midi=midi[:n]; rms=rms[:n]
midi[rms<0.01]=0
v=midi[midi>0]; print('frames',n,'voiced',len(v),'range',np.percentile(v,[1,50,99]))
q=np.round(np.clip(midi,0,127)*2).astype(int)  # half-semitone resolution, 0=unvoiced
json.dump({'fps':50,'q2':q.tolist()},open('pitch.json','w'))
