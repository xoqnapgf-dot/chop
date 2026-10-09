import sys, numpy as np, torch, cv2
from transformers import pipeline
from PIL import Image
pipe=pipeline('depth-estimation',model='depth-anything/Depth-Anything-V2-Small-hf',device='cpu')
for src,dst in zip(sys.argv[1::2],sys.argv[2::2]):
    im=Image.open(src).convert('RGB')
    w,h=im.size
    # run at higher res for detail: resize so long side ~ 1022 (multiple of 14)
    s=1022/max(w,h); im2=im.resize((int(w*s)//14*14,int(h*s)//14*14),Image.BICUBIC)
    d=pipe(im2)['predicted_depth'].squeeze().numpy()
    d=cv2.resize(d,(w,h),interpolation=cv2.INTER_CUBIC)
    d=(d-d.min())/(d.max()-d.min()+1e-6)
    cv2.imwrite(dst,(d*255).astype(np.uint8)); print('ok',dst,d.shape)
