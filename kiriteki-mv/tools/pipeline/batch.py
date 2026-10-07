import json, subprocess, sys, concurrent.futures as cf
STYLE=" Japanese anime film background art in the style of Makoto Shinkai, painterly digital painting, cinematic composition, soft volumetric light, atmospheric perspective, delicate details. No text, no letters, no watermark, no signature."
jobs=json.load(open(sys.argv[1]))
def run(j):
    name,size,bg,refs,prompt=j
    p=prompt.strip()+("" if bg=="transparent" else STYLE)
    r=subprocess.run(['python3','gen.py',name,size,p,bg,refs],capture_output=True,text=True,timeout=600)
    return name, (r.stdout[-300:]+r.stderr[-300:])
with cf.ThreadPoolExecutor(3) as ex:
    for name,out in ex.map(run,jobs): print('###',name,out.replace('\n',' | '),flush=True)
