import os
import json, sys
from faster_whisper import WhisperModel
S=os.environ.get('MV_AUDIO', 'audio/')
m=WhisperModel(sys.argv[1], device='cpu', compute_type='int8', cpu_threads=4)
prompt="さよならは終わりじゃない 遠い空でまた会える 震える声抱きしめて 私は今歌う 朝の窓に薄紅の風"
segs,info=m.transcribe(S+'sep/htdemucs/song22/vocals.wav', language='ja', word_timestamps=True, initial_prompt=prompt, vad_filter=True, beam_size=5)
out=[]
for s in segs:
    out.append({'start':s.start,'end':s.end,'text':s.text,'words':[{'s':w.start,'e':w.end,'w':w.word,'p':w.probability} for w in s.words]})
    print(f"{s.start:7.2f}-{s.end:7.2f} {s.text}", flush=True)
json.dump(out,open(S+f'whisper_{sys.argv[1]}.json','w'),ensure_ascii=False,indent=1)
