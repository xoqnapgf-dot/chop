#!/usr/bin/env python3
"""Pack images + analysis data into browser-loadable JS for the 霧笛 MV.

Everything is shipped as classic <script> files (data URIs) so the MV runs from file:// without CORS
problems for WebGL textures, and from any static host.

Inputs (produced earlier in the pipeline, see README):
  gen/   original generated plates (gpt-image-2.5, 'low')        up/  Real-ESRGAN anime x4 upscales
  depth/ Depth-Anything-V2-Small depth maps                         posters 1-5 (character sheets)
Outputs (in the MV folder):
  assets/packed/*.js, js/manifest.js, js/meta.js, js/kanjivg.js, js/lineart.js, js/pitch.js, css/fonts.css,
  assets/src/* (editable source images)
"""
import base64, io, json, os, sys
import numpy as np, cv2
from PIL import Image

WORK = sys.argv[1]           # scratch work dir with gen/ up/ depth/ refs/ fonts/ ...
OUT = sys.argv[2]            # MV folder
IMDIR = sys.argv[3]          # folder with the character posters 1.jpg..5.jpg
os.makedirs(f'{OUT}/assets/packed', exist_ok=True); os.makedirs(f'{OUT}/assets/src', exist_ok=True)

PLATES = {  # name: (generated file, max width for the runtime texture)
    'harbor': 'test_harbor', 'window': 'p02_window', 'slope': 'p03_slope', 'puddles': 'p04_puddles', 'skysea': 'p05_skysea',
    'school': 'p06_schoolyard', 'sunset': 'p07_sunset_two', 'hands': 'p08_hands', 'barwin': 'p10_barwindow', 'barband': 'p11_bar_band',
    'city': 'p12_city', 'lighthouse': 'p13_lighthouse', 'ferry': 'p14_ferry', 'festival': 'p15_festival', 'snowwalk': 'p16_snowwalk',
    'chalk': 'p19_chalk', 'case': 'p20_case',
}
# crops from the character posters (x0,y0,x1,y1 in poster pixels)
CROPS = {
    'face1': (1, (30, 150, 630, 488)), 'face2': (2, (0, 205, 520, 497)), 'face3': (3, (60, 180, 660, 518)),
    'face4': (4, (0, 205, 560, 520)), 'face5': (5, (0, 165, 460, 424)),
    'gtr': (2, (330, 480, 844, 769)), 'bass': (4, (470, 540, 844, 750)), 'vln': (5, (500, 560, 844, 753)), 'cajon': (3, (400, 870, 780, 1084)),
}

def poly_mask(h, w, polys):
    m = np.zeros((h, w), np.float32)
    for p in polys:
        pts = np.array([[x * w, y * h] for x, y in p], np.int32)
        cv2.fillPoly(m, [pts], 1.0)
    return m

def ys(h, w): return np.repeat(np.linspace(0, 1, h)[:, None], w, 1)

def fx_map(name, rgb, dep):
    """R sway, G water, B sky/clouds, A emissive — small RGBA map sampled in image space."""
    h, w = 288, int(288 * rgb.shape[1] / rgb.shape[0])
    im = cv2.resize(rgb, (w, h), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
    d = cv2.resize(dep, (w, h), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
    lum = im @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    sat = im.max(2) - im.min(2)
    Y = ys(h, w)
    R = np.zeros((h, w), np.float32); G = R.copy(); B = R.copy()
    if name == 'harbor':
        G = poly_mask(h, w, [[(0.2, 0.5), (1, 0.48), (1, 0.9), (0.78, 0.85), (0.45, 0.75), (0.3, 0.67), (0.2, 0.6)]]) * (d < 0.55)
        B = (Y < 0.42) * (d < 0.12)
    elif name == 'window':
        R = poly_mask(h, w, [[(0, 0), (0.27, 0), (0.25, 0.55), (0.12, 0.76), (0, 0.72)], [(0.86, 0), (1, 0), (1, 0.45), (0.9, 0.5)]]) + 0.4 * poly_mask(h, w, [[(0.12, 0), (0.4, 0), (0.4, 0.13), (0.12, 0.13)]])
        G = poly_mask(h, w, [[(0.42, 0.37), (0.88, 0.37), (0.88, 0.46), (0.42, 0.46)]]) * 0.6
        B = (Y < 0.36) * (d < 0.1)
    elif name == 'slope':
        R = poly_mask(h, w, [[(0, 0), (0.36, 0), (0.3, 0.33), (0, 0.38)]])
        G = poly_mask(h, w, [[(0.28, 0.24), (1, 0.22), (1, 0.34), (0.45, 0.36)]]) * (d < 0.3)
        B = (Y < 0.17) * (d < 0.1)
    elif name == 'puddles':
        G = np.clip((Y > 0.5) * np.clip((lum - 0.26) / 0.14, 0, 1) + poly_mask(h, w, [[(0, 0.36), (1, 0.36), (1, 0.48), (0, 0.5)]]) * 0.7, 0, 1)
        B = (Y < 0.33)
    elif name == 'skysea':
        B = np.clip((Y < 0.36) + ((lum > 0.62) * (sat < 0.2) * (Y > 0.36)), 0, 1)
        G = poly_mask(h, w, [[(0.45, 0.45), (0.95, 0.42), (0.95, 0.62), (0.5, 0.64)]]) * (1 - (lum > 0.62) * (sat < 0.2))
    elif name == 'school':
        R = poly_mask(h, w, [[(0, 0), (0.33, 0), (0.31, 0.5), (0, 0.52)]])
        G = (Y > 0.5) * np.clip((lum - 0.3) / 0.15, 0, 1)
        B = (Y < 0.36) * (d < 0.15)
    elif name == 'sunset':
        G = poly_mask(h, w, [[(0, 0.5), (1, 0.49), (1, 0.69), (0, 0.69)]]) * (d < 0.42)
        B = (Y < 0.48) * (d < 0.15)
    elif name == 'hands':
        G = poly_mask(h, w, [[(0.55, 0.5), (1, 0.48), (1, 0.86), (0.6, 0.86)]]) * (d < 0.4)
        B = (Y < 0.3) * (d < 0.12)
    elif name == 'city':
        G = (Y > 0.6) * (d < 0.5); B = (Y < 0.5) * (d < 0.12)
    elif name == 'lighthouse':
        G = (Y > 0.55) * (d < 0.55); B = (Y < 0.45) * (d < 0.1)
    elif name == 'ferry':
        G = (Y > 0.62) * (d < 0.45); B = (Y < 0.6) * (d < 0.15)
    elif name == 'snowwalk':
        G = poly_mask(h, w, [[(0.72, 0.42), (1, 0.4), (1, 0.76), (0.75, 0.76)]]) * (d < 0.5); B = (Y < 0.3) * (d < 0.12)
    elif name == 'chalk':
        G = (Y > 0.3) * np.clip((lum - 0.5) / 0.15, 0, 1) * (sat > 0.05)
    # emissive: very bright pixels (lamps, windows, city lights)
    A = np.clip((lum - 0.78) / 0.15, 0, 1) * (sat > 0.08)
    fx = np.dstack([R, G, B, A]).clip(0, 1)
    fx = cv2.GaussianBlur(fx, (0, 0), 1.6)
    return (fx * 255).astype(np.uint8)

def detect_lights(name, rgb, dep, nmax=6):
    h, w = 432, int(432 * rgb.shape[1] / rgb.shape[0])
    im = cv2.resize(rgb, (w, h), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
    d = cv2.resize(dep, (w, h), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
    lum = im @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    thr = max(0.82, np.percentile(lum, 99.6))
    m = (lum >= thr).astype(np.uint8)
    n, lab, st, cen = cv2.connectedComponentsWithStats(m, 8)
    cands = []
    for i in range(1, n):
        area = st[i, cv2.CC_STAT_AREA]
        if area < 3: continue
        sel = lab == i
        col = im[sel].mean(0); col = col / max(1e-3, col.max())
        cx, cy = cen[i]
        z = float(np.median(d[sel]))
        bw, bh = st[i, cv2.CC_STAT_WIDTH], st[i, cv2.CC_STAT_HEIGHT]
        if bw > w * 0.25 or bh > h * 0.25: continue          # skip big bright areas (sky)
        score = area * float(lum[sel].mean())
        cands.append((score, dict(u=round(cx / w, 4), v=round(cy / h, 4), z=round(z, 3), c=[round(float(x), 3) for x in col], r=round(float(min(0.16, 0.03 + np.sqrt(area) / h * 1.6)), 3), i=0.8)))
    cands.sort(key=lambda x: -x[0])
    out = []
    for s, L in cands:
        if all(abs(L['u'] - o['u']) + abs(L['v'] - o['v']) > 0.04 for o in out): out.append(L)
        if len(out) >= nmax: break
    return out

def to_webp_bytes(img, q=82, lossless=False, alpha=False):
    pil = Image.fromarray(img)
    buf = io.BytesIO(); pil.save(buf, 'WEBP', quality=q, lossless=lossless, method=6); return buf.getvalue()

manifest = []
meta = {}
def pack(name, data, mime='image/webp'):
    uri = f'data:{mime};base64,' + base64.b64encode(data).decode()
    fn = f'assets/packed/{name}.js'
    with open(f'{OUT}/{fn}', 'w') as f: f.write(f'MV_ASSET({json.dumps(name)},"{uri}");\n')
    manifest.append({'name': name, 'file': fn, 'size': len(uri)})

def load_rgb(p): return cv2.cvtColor(cv2.imread(p, cv2.IMREAD_COLOR), cv2.COLOR_BGR2RGB)

# ---------------------------------------------------------------- plates
for name, src in PLATES.items():
    up = f'{WORK}/up/{src}.png'; gen = f'{WORK}/gen/{src}.png'
    rgb = load_rgb(up if os.path.exists(up) else gen)
    if not os.path.exists(up):  # fallback while upscales are still running
        s = 1.5 if rgb.shape[0] < rgb.shape[1] else 2.0
        rgb = cv2.resize(rgb, (int(rgb.shape[1] * s), int(rgb.shape[0] * s)), interpolation=cv2.INTER_LANCZOS4)
    dep = cv2.imread(f'{WORK}/depth/{src}.png', cv2.IMREAD_GRAYSCALE)
    depr = cv2.resize(dep, (rgb.shape[1], rgb.shape[0]), interpolation=cv2.INTER_CUBIC)
    pack(name, to_webp_bytes(rgb, 84))
    dsmall = cv2.resize(dep, (min(1280, dep.shape[1]), int(min(1280, dep.shape[1]) * dep.shape[0] / dep.shape[1])), interpolation=cv2.INTER_AREA)
    dsmall = cv2.GaussianBlur(dsmall, (0, 0), 0.8)
    pack(name + '_d', to_webp_bytes(np.dstack([dsmall] * 3), 92))
    fx = fx_map(name, rgb, depr)
    pack(name + '_fx', to_webp_bytes(fx, lossless=True))
    meta[name] = {'lights': detect_lights(name, rgb, depr), 'w': rgb.shape[1], 'h': rgb.shape[0]}
    Image.open(gen).convert('RGB').save(f'{OUT}/assets/src/{name}.webp', quality=90)
    print('plate', name, rgb.shape, len(meta[name]['lights']), 'lights', flush=True)

# ---------------------------------------------------------------- poster crops (character art)
for name, (pi, (x0, y0, x1, y1)) in CROPS.items():
    upc = f'{WORK}/up/crop_{name}.png'
    if os.path.exists(upc): rgb = load_rgb(upc)
    else:
        src = load_rgb(f'{IMDIR}/{pi}.jpg')[y0:y1, x0:x1]
        rgb = cv2.resize(src, (src.shape[1] * 3, src.shape[0] * 3), interpolation=cv2.INTER_LANCZOS4)
    dep = cv2.imread(f'{WORK}/depth/poster{pi}.png', cv2.IMREAD_GRAYSCALE)[y0:y1, x0:x1]
    dep = cv2.normalize(dep.astype(np.float32), None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    pack(name, to_webp_bytes(rgb, 86))
    pack(name + '_d', to_webp_bytes(np.dstack([cv2.GaussianBlur(dep, (0, 0), 1.0)] * 3), 92))
    meta[name] = {'lights': [], 'w': rgb.shape[1], 'h': rgb.shape[0]}
    print('crop', name, rgb.shape, flush=True)

# string end points (u0,v0,u1,v1,z) in crop space — vibrating overlays follow the real instrument strings
meta['gtr']['strings'] = [[0.30, 0.645 + 0.021 * k, 1.0, -0.0025 + 0.00875 * k, 0.7] for k in range(6)]
meta['bass']['strings'] = [[(k - 1.5) * 0.0137, 0.928 + (k - 1.5) * 0.029, 0.625 + (k - 1.5) * 0.0137, (k - 1.5) * 0.029, 0.7] for k in range(4)]
meta['vln']['strings'] = [[0.40 - (k - 1.5) * 0.0027, 0.06 + (k - 1.5) * 0.012, 0.88 - (k - 1.5) * 0.0027, 0.40 + (k - 1.5) * 0.012, 0.7] for k in range(4)]
meta['vln']['bow'] = [0.33, 0.42, 0.56, 0.0]

# ---------------------------------------------------------------- transparent assets
def rgba(p):
    im = cv2.imread(p, cv2.IMREAD_UNCHANGED); return cv2.cvtColor(im, cv2.COLOR_BGRA2RGBA)
bass = rgba(f'{WORK}/up/t22_bassist.png' if os.path.exists(f'{WORK}/up/t22_bassist.png') else f'{WORK}/gen/t22_bassist.png')
pack('bassist', to_webp_bytes(bass, 88))
pet = rgba(f'{WORK}/gen/t23_petals.png'); pack('petals', to_webp_bytes(pet, 90))
obj = rgba(f'{WORK}/gen/t09_objects.png')
a = (obj[:, :, 3] > 20).astype(np.uint8)
n, lab, st, cen = cv2.connectedComponentsWithStats(cv2.dilate(a, np.ones((9, 9), np.uint8)), 8)
comps = [(st[i, cv2.CC_STAT_AREA], i) for i in range(1, n) if st[i, cv2.CC_STAT_AREA] > 1500]
comps = sorted(comps, reverse=True)[:7]
boxes = sorted([st[i] for _, i in comps], key=lambda s: (round(s[1] / 260), s[0]))
for k, s in enumerate(boxes):
    x, y, w_, h_ = s[0], s[1], s[2], s[3]; pad = 6
    crop = obj[max(0, y - pad):y + h_ + pad, max(0, x - pad):x + w_ + pad]
    pack(f'obj{k}', to_webp_bytes(crop, 90))
    print('obj', k, crop.shape)
Image.open(f'{WORK}/gen/t09_objects.png').save(f'{OUT}/assets/src/objects.png')
Image.open(f'{WORK}/gen/t23_petals.png').save(f'{OUT}/assets/src/petals.png')
Image.open(f'{WORK}/gen/t22_bassist.png').save(f'{OUT}/assets/src/bassist.png')

# ---------------------------------------------------------------- data scripts
with open(f'{OUT}/js/manifest.js', 'w') as f: f.write('window.MV=window.MV||{};MV.MANIFEST=' + json.dumps(manifest) + ';\n')
with open(f'{OUT}/js/meta.js', 'w') as f: f.write('window.MV=window.MV||{};MV.META=' + json.dumps(meta, ensure_ascii=False) + ';\n')
kvg = json.load(open(f'{WORK}/kanjivg_strokes.json', encoding='utf-8'))
with open(f'{OUT}/js/kanjivg.js', 'w', encoding='utf-8') as f: f.write('/* stroke data derived from KanjiVG (CC BY-SA 3.0, Ulrich Apel) */\nwindow.MV=window.MV||{};MV.KVG=' + json.dumps(kvg, ensure_ascii=False, separators=(',', ':')) + ';\n')
la = json.load(open(f'{WORK}/lineart_barband.json'))
with open(f'{OUT}/js/lineart.js', 'w') as f: f.write('/* vectorised pencil line art of the bar scene (tools/lineart.py) */\nwindow.MV=window.MV||{};MV.LINEART={barband:' + json.dumps(la, separators=(',', ':')) + '};\n')
import shutil
shutil.copy(f'{WORK}/lineart_barband.svg', f'{OUT}/assets/src/barband_lineart.svg')
pit = json.load(open(f'{WORK}/pitch.json'))
with open(f'{OUT}/js/pitch.js', 'w') as f: f.write('/* vocal pitch (pYIN on the Demucs vocal stem), half-semitone steps, 0 = unvoiced */\nwindow.MV=window.MV||{};MV.PITCH=' + json.dumps(pit, separators=(',', ':')) + ';\n')

# ---------------------------------------------------------------- fonts (subset woff2 → CSS data URIs)
FONTS = [('KM Mincho', 'ShipporiMinchoB1-Medium'), ('KM MinchoB', 'ShipporiMinchoB1-ExtraBold'), ('KM Brush', 'YujiSyuku-Regular'), ('KM Hand', 'KleeOne-SemiBold'), ('KM Mono', 'IBMPlexMono-Regular')]
css = ['/* subset fonts (SIL Open Font License 1.1) — Shippori Mincho B1, Yuji Syuku, Klee One, IBM Plex Mono */']
def renamed_woff2(path, fam):
    # Subsets are Modified Versions under the OFL, and IBM Plex declares the Reserved Font Name "Plex",
    # so every subset gets its own internal name (copyright and license records are kept as they are).
    import io
    from fontTools.ttLib import TTFont
    f = TTFont(path)
    ps = fam.replace(' ', '')
    keep = []
    for r in f['name'].names:
        if r.nameID in (1, 4, 16): r.string = fam
        elif r.nameID in (2, 17): r.string = 'Regular'
        elif r.nameID == 3: r.string = 'kiriteki-mv subset;' + ps
        elif r.nameID == 6: r.string = ps
        elif r.nameID in (18, 21, 22, 25): continue
        keep.append(r)
    f['name'].names = keep
    if 'CFF ' in f:
        cff = f['CFF '].cff; cff.fontNames = [ps]; td = cff.topDictIndex[0]; td.FullName = fam; td.FamilyName = fam
    f.flavor = 'woff2'; bio = io.BytesIO(); f.save(bio); return bio.getvalue()


for fam, fn in FONTS:
    p = f'{WORK}/subset/{fn}.woff2'
    if not os.path.exists(p): continue
    b = base64.b64encode(renamed_woff2(p, fam)).decode()
    css.append(f'@font-face{{font-family:"{fam}";src:url(data:font/woff2;base64,{b}) format("woff2");font-display:block;}}')
open(f'{OUT}/css/fonts.css', 'w').write('\n'.join(css) + '\n')
tot = sum(m['size'] for m in manifest)
print('packed', len(manifest), 'files', round(tot / 1e6, 2), 'MB')
