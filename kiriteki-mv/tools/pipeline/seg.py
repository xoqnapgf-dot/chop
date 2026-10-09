import onnxruntime as ort, numpy as np, cv2, sys, os
IM=os.environ.get('MV_IMAGES', 'images/')
sess=ort.InferenceSession('models/isnetis.onnx',providers=['CPUExecutionProvider'])
def mask(img,s=1024):
    h,w=img.shape[:2]; r=s/max(h,w); nh,nw=int(h*r),int(w*r)
    x=np.zeros((s,s,3),np.float32); x[(s-nh)//2:(s-nh)//2+nh,(s-nw)//2:(s-nw)//2+nw]=cv2.resize(img,(nw,nh))/255.
    m=sess.run(None,{'img':x.transpose(2,0,1)[None]})[0][0][0]
    m=m[(s-nh)//2:(s-nh)//2+nh,(s-nw)//2:(s-nw)//2+nw]
    return cv2.resize(m,(w,h))
for i in range(1,6):
    img=cv2.cvtColor(cv2.imread(IM+f'{i}.jpg'),cv2.COLOR_BGR2RGB)
    m=mask(img)
    cv2.imwrite(f'chars/mask{i}.png',(np.clip(m,0,1)*255).astype(np.uint8))
    rgba=np.dstack([img,(np.clip(m,0,1)*255).astype(np.uint8)])
    cv2.imwrite(f'chars/cut{i}.png',cv2.cvtColor(rgba,cv2.COLOR_RGBA2BGRA))
    print(i,'mask mean',m.mean().round(3))
