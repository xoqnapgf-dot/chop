# Minimal RRDBNet (Real-ESRGAN anime 6B) inference without torchvision.
import torch, torch.nn as nn, torch.nn.functional as F, numpy as np, cv2, sys
class RDB(nn.Module):
    def __init__(s,nf=64,gc=32):
        super().__init__()
        s.conv1=nn.Conv2d(nf,gc,3,1,1); s.conv2=nn.Conv2d(nf+gc,gc,3,1,1); s.conv3=nn.Conv2d(nf+2*gc,gc,3,1,1)
        s.conv4=nn.Conv2d(nf+3*gc,gc,3,1,1); s.conv5=nn.Conv2d(nf+4*gc,nf,3,1,1); s.l=nn.LeakyReLU(0.2,True)
    def forward(s,x):
        x1=s.l(s.conv1(x)); x2=s.l(s.conv2(torch.cat((x,x1),1))); x3=s.l(s.conv3(torch.cat((x,x1,x2),1)))
        x4=s.l(s.conv4(torch.cat((x,x1,x2,x3),1))); x5=s.conv5(torch.cat((x,x1,x2,x3,x4),1)); return x5*0.2+x
class RRDB(nn.Module):
    def __init__(s,nf=64,gc=32):
        super().__init__(); s.rdb1=RDB(nf,gc); s.rdb2=RDB(nf,gc); s.rdb3=RDB(nf,gc)
    def forward(s,x): return s.rdb3(s.rdb2(s.rdb1(x)))*0.2+x
class RRDBNet(nn.Module):
    def __init__(s,nb=6,nf=64,gc=32):
        super().__init__()
        s.conv_first=nn.Conv2d(3,nf,3,1,1); s.body=nn.Sequential(*[RRDB(nf,gc) for _ in range(nb)]); s.conv_body=nn.Conv2d(nf,nf,3,1,1)
        s.conv_up1=nn.Conv2d(nf,nf,3,1,1); s.conv_up2=nn.Conv2d(nf,nf,3,1,1); s.conv_hr=nn.Conv2d(nf,nf,3,1,1); s.conv_last=nn.Conv2d(nf,3,3,1,1); s.l=nn.LeakyReLU(0.2,True)
    def forward(s,x):
        f=s.conv_first(x); f=f+s.conv_body(s.body(f))
        f=s.l(s.conv_up1(F.interpolate(f,scale_factor=2,mode='nearest'))); f=s.l(s.conv_up2(F.interpolate(f,scale_factor=2,mode='nearest')))
        return s.conv_last(s.l(s.conv_hr(f)))
torch.set_num_threads(4)
net=RRDBNet(); sd=torch.load('models/RealESRGAN_x4plus_anime_6B.pth',map_location='cpu'); sd=sd.get('params_ema',sd.get('params',sd)); net.load_state_dict(sd,strict=True); net.eval()
def up(img,tile=256,pad=12):
    h,w=img.shape[:2]; x=torch.from_numpy(img[:,:,::-1].astype(np.float32)/255).permute(2,0,1)[None]
    out=torch.zeros(1,3,h*4,w*4)
    with torch.no_grad():
        for y0 in range(0,h,tile):
            for x0 in range(0,w,tile):
                y1=min(h,y0+tile); x1=min(w,x0+tile); ya=max(0,y0-pad); xa=max(0,x0-pad); yb=min(h,y1+pad); xb=min(w,x1+pad)
                o=net(x[:,:,ya:yb,xa:xb])
                out[:,:,y0*4:y1*4,x0*4:x1*4]=o[:,:,(y0-ya)*4:(y0-ya)*4+(y1-y0)*4,(x0-xa)*4:(x0-xa)*4+(x1-x0)*4]
    o=(out[0].clamp(0,1).permute(1,2,0).numpy()[:,:,::-1]*255).round().astype(np.uint8); return o
for src,dst,scale in zip(sys.argv[1::3],sys.argv[2::3],sys.argv[3::3]):
    im=cv2.imread(src,cv2.IMREAD_UNCHANGED); alpha=None
    if im.shape[2]==4: alpha=im[:,:,3]; im=im[:,:,:3]
    o=up(im); s=float(scale)
    if s!=4: o=cv2.resize(o,(int(im.shape[1]*s),int(im.shape[0]*s)),interpolation=cv2.INTER_AREA)
    if alpha is not None:
        a=cv2.resize(alpha,(o.shape[1],o.shape[0]),interpolation=cv2.INTER_CUBIC); o=np.dstack([o,a])
    cv2.imwrite(dst,o); print('ok',dst,o.shape,flush=True)
