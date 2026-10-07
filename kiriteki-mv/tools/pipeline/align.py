import os
import json, difflib, numpy as np
A=os.environ.get('MV_AUDIO', 'audio/')
r1=json.load(open(A+'whisper_large-v3.json')); r2=json.load(open(A+'whisper_chunks.json'))
W=[]
for s in r1:
    for w in s['words']:
        if w['s']<52 or (79<=w['s']<105.5): W.append(w)
for s in r2:
    for w in s['words']:
        if 52<=w['s']<79 or (105.5<=w['s']<200): W.append(w)
W.sort(key=lambda w:w['s'])
# dedupe overlapping duplicates (130 chunk overlap)
D=[]
for w in W:
    if D and abs(w['s']-D[-1]['s'])<0.05: continue
    if D and w['s']<D[-1]['s']: continue
    D.append(w)
W=D
# expand to chars
C=[]
for w in W:
    t=w['w'].strip(); n=len(t)
    if n==0: continue
    for i,ch in enumerate(t):
        C.append((ch, w['s']+(w['e']-w['s'])*i/n, w['e']))
lyr=[l.strip() for l in open('lyrics.txt',encoding='utf-8') if l.strip() and not l.startswith('[')]
sections=json.load(open('sections.json'))
# line start hints (seconds) from whisper inspection
hints=[22.93,26.61,31.35,35.91,39.69,44.23,48.15,53.12, 57.20,62.96,67.66,72.12, 79.58,83.50,87.82,92.40, 97.36,101.16,105.74,110.44, 113.46,119.28,123.88,128.30, 133.10,137.30,141.36,146.32, 161.14,166.30,170.70,175.34,178.56,184.18,188.50,193.26]
assert len(hints)==len(lyr),(len(hints),len(lyr))
out=[]
for li,line in enumerate(lyr):
    t0=hints[li]; t1=hints[li+1] if li+1<len(hints) else 198.5
    if li in (11,23): t1=min(t1, t0+6.0)
    if li==27: t1=153.0
    if li==35: t1=203.5
    cand=[c for c in C if t0-0.25<=c[1]<t1-0.05]
    chars=[ch for ch in line]
    plain=[ch for ch in chars if ch!='　']
    sm=difflib.SequenceMatcher(None,''.join(plain),''.join(c[0] for c in cand),autojunk=False)
    times=[None]*len(plain)
    for a,b,n in sm.get_matching_blocks():
        for k in range(n): times[a+k]=cand[b+k][1]
    times[0]=t0 if times[0] is None else min(times[0],t0+0.2)
    # last char: if none, estimate
    # monotonic interpolate
    known=[i for i,t in enumerate(times) if t is not None]
    for i in range(len(times)):
        if times[i] is None:
            prev=max([k for k in known if k<i],default=None); nxt=min([k for k in known if k>i],default=None)
            if nxt is None:
                tp=times[prev]; times[i]=tp+0.35*(i-prev)
            else:
                times[i]=times[prev]+(times[nxt]-times[prev])*(i-prev)/(nxt-prev)
    for i in range(1,len(times)):
        if times[i]<times[i-1]: times[i]=times[i-1]+0.05
    # rebuild with spaces (space gets time of next char)
    res=[]; j=0
    for ch in chars:
        if ch=='　': res.append([ch, round(times[j],3)])
        else: res.append([ch, round(times[j],3)]); j+=1
    out.append({'i':li,'text':line,'t0':round(t0,3),'t1':round(t1,3),'chars':res})
    print(f"{li:2d} {t0:7.2f}-{t1:7.2f} "+' '.join(f"{c}{t:.2f}" for c,t in res if c!='　'))
json.dump(out,open('lyrics_timed.json','w'),ensure_ascii=False,indent=0)
