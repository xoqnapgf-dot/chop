import cv2, numpy as np, json, sys
from skimage.morphology import skeletonize
src, out_json, out_svg, out_png = sys.argv[1:5]
im = cv2.imread(src); h0, w0 = im.shape[:2]
W = 1600; H = int(h0 * W / w0)
g = cv2.cvtColor(cv2.resize(im, (W, H), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
g = cv2.bilateralFilter(g, 7, 0.08, 5)
# Canny on edge-preserving smoothed luminance, keep long connected structures
g8=(g*255).astype(np.uint8)
g8=cv2.bilateralFilter(g8, 9, 40, 9)
g8=cv2.bilateralFilter(g8, 9, 30, 9)
v=np.median(g8); lo=int(max(8,0.38*v)); hi=int(min(255,0.95*v))
ed=cv2.Canny(g8, lo, hi, L2gradient=True)
n,lab,st,_=cv2.connectedComponentsWithStats(ed,8)
keep=np.zeros(n,bool); keep[1:]=st[1:,cv2.CC_STAT_AREA]>=18
lines=keep[lab].astype(np.uint8)
cv2.imwrite(out_png, 255 - lines * 255)
sk = skeletonize(lines > 0).astype(np.uint8)
# trace skeleton into polylines
Hs, Ws = sk.shape
nb = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
visited = np.zeros_like(sk, bool)
def neighbors(y, x):
    for dy, dx in nb:
        yy, xx = y + dy, x + dx
        if 0 <= yy < Hs and 0 <= xx < Ws and sk[yy, xx]: yield yy, xx
deg = np.zeros_like(sk, np.int32)
ys, xs = np.nonzero(sk)
for y, x in zip(ys, xs): deg[y, x] = sum(1 for _ in neighbors(y, x))
paths = []
def walk(y, x):
    pts = [(x, y)]; visited[y, x] = True
    while True:
        nxt = None
        for yy, xx in neighbors(y, x):
            if not visited[yy, xx]: nxt = (yy, xx); break
        if nxt is None: break
        y, x = nxt; visited[y, x] = True; pts.append((x, y))
        if deg[y, x] > 2: break
    return pts
order = list(zip(ys, xs))
for y, x in sorted(order, key=lambda p: deg[p[0], p[1]] != 1):
    if visited[y, x]: continue
    p = walk(y, x)
    if len(p) >= 12: paths.append(p)
# simplify
out = []
for p in paths:
    a = np.array(p, np.float32).reshape(-1, 1, 2)
    s_ = cv2.approxPolyDP(a, 0.9, False).reshape(-1, 2)
    if len(s_) >= 2: out.append([[round(float(x) / W, 4), round(float(y) / H, 4)] for x, y in s_])
out.sort(key=lambda p: -len(p))
out = out[:2600]
json.dump(out, open(out_json, 'w'), separators=(',', ':'))
with open(out_svg, 'w') as f:
    f.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" fill="none" stroke="#222" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">\n')
    for p in out: f.write('<polyline points="' + ' '.join(f'{x*W:.1f},{y*H:.1f}' for x, y in p) + '"/>\n')
    f.write('</svg>\n')
print('paths', len(paths), 'kept', len(out), 'points', sum(len(p) for p in out))
