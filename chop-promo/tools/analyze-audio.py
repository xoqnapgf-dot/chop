#!/usr/bin/env python3
"""
宣传片的配乐：剪辑 + 分析，生成 assets/audio/worldwide-choppers-edit.mp3 和 js/data/audio.js。

1. 下载原曲（B 站 BV11x411g7cU，和站点曲目库 worldwide-choppers 的 bilibili 字段一致）：
     yt-dlp -f bestaudio -x --audio-format wav -o wwc.%(ext)s https://www.bilibili.com/video/BV11x411g7cU
2. 下载带时间轴的歌词（LRCLIB，id 24010451，时长 326.69 秒，和这份音频对得上）：
     curl -s "https://lrclib.net/api/get/24010451" | python3 -c "import json,sys;print(json.load(sys.stdin)['syncedLyrics'])" > wwc.lrc
3. python3 chop-promo/tools/analyze-audio.py wwc.wav wwc.lrc

剪辑：三段在"I'm light years ahead of my peers"副歌处拼接，拼接点用互相关对齐（都在 0.95 以上），40ms 等功率交叉淡化。
  0:00–1:30.2（Ceza、Tech N9ne）+ 2:44.0–3:43.0（Twista）+ 4:42.1–结尾（D-Loc、Twisted Insane）
节拍：梳状滤波拟合，三段都是 130.0 BPM，而且落在同一张网格上（t = 0.315 + 0.4615k）。
  （在 mp3 上重新拟合会因为编码器延迟差 5ms 左右，不影响画面。）
每秒音节数：按歌词行粗略估算（英语用 CMU 词典，其他语言数元音组），片子里目前没有显示，也不是测速数据。
需要：pip install librosa soundfile scipy pronouncing；系统里要有 ffmpeg。
"""
import json
import os
import re
import subprocess
import sys

import librosa
import numpy as np
import pronouncing
import soundfile as sf
from scipy.signal import correlate

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC, LRC = sys.argv[1], sys.argv[2]

x, sr = sf.read(SRC)
mono = x.mean(1) if x.ndim > 1 else x


def align(t1, t2, w=1.0, search=0.05):
    """在 t2 附近找和 t1 处最像的位置（互相关）。"""
    a = mono[int(t1 * sr):int((t1 + w) * sr)]
    b = mono[int((t2 - search) * sr):int((t2 + w + search) * sr)]
    c = correlate(b, a, 'valid', method='fft')
    nb = np.sqrt(np.convolve(b ** 2, np.ones(len(a)), 'valid'))
    c = c / (np.linalg.norm(a) * nb + 1e-9)
    i = int(np.argmax(c))
    return t2 - search + i / sr, float(c[i])


# ---------- 剪辑 ----------
A1, B1 = 90.2, 223.0
A2, ca = align(A1, A1 + 73.8128)
B2, cb = align(B1, B1 + 59.0769)
print(f'拼接点 1：{A1} → {A2:.4f}（相关 {ca:.3f}）；拼接点 2：{B1} → {B2:.4f}（相关 {cb:.3f}）')
fade = int(0.04 * sr)
ang = np.linspace(0, np.pi / 2, fade)[:, None] if x.ndim > 1 else np.linspace(0, np.pi / 2, fade)


def seg(a, b):
    return x[int(a * sr):int(b * sr)]


def xf(p, q):
    return np.concatenate([p[:-fade], p[-fade:] * np.cos(ang) + q[:fade] * np.sin(ang), q[fade:]])


edit = xf(xf(seg(0, A1 + 0.02), seg(A2 - 0.02, B1 + 0.02)), seg(B2 - 0.02, len(x) / sr))
tmp = os.path.join(HERE, '_edit.wav')
sf.write(tmp, edit, sr)
mp3 = os.path.join(ROOT, 'assets', 'audio', 'worldwide-choppers-edit.mp3')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-c:a', 'libmp3lame', '-b:a', '224k', mp3], check=True)

# ---------- 包络（50 fps） ----------
y, sr2 = librosa.load(tmp, sr=22050, mono=True)
os.remove(tmp)
dur = len(y) / sr2
S = np.abs(librosa.stft(y, n_fft=2048, hop_length=441))
f = librosa.fft_frequencies(sr=sr2, n_fft=2048)


def norm(e):
    return np.clip(e / np.percentile(e, 99.5), 0, 1)


def band(lo, hi):
    return norm(S[(f >= lo) & (f < hi)].mean(0))


low, mid, high = band(30, 150), band(150, 2000), band(2000, 9000)
rms = norm(librosa.feature.rms(y=y, frame_length=2048, hop_length=441)[0])
onset = norm(librosa.onset.onset_strength(y=y, sr=sr2, hop_length=441))
kick = norm(np.maximum(0, np.diff(low, prepend=low[0])))

# ---------- 节拍网格 ----------
hop = 110
yy, sr3 = librosa.load(mp3, sr=44100, mono=True)
on = librosa.onset.onset_strength(y=yy, sr=sr3, hop_length=hop)
fr = sr3 / hop
best = None
for P in np.arange(0.458, 0.472, 0.0001):
    for ph in np.arange(0, P, 0.0025):
        sc = on[(np.arange(ph, dur, P) * fr).astype(int).clip(0, len(on) - 1)].mean()
        if best is None or sc > best[0]:
            best = (sc, P, ph)
_, P, T0 = best
print(f'节拍：{60 / P:.2f} BPM，第一拍 {T0:.3f}s')
beats = [[round(float(T0 + k * P), 3), 1 if k % 4 == 0 else 0] for k in range(int((dur - T0) / P) + 1)]

# ---------- 歌词 → 估算每秒音节数 ----------
def remap(s):
    if s < A1:
        return s
    if A2 <= s < B1:
        return s - (A2 - A1)
    if s >= B2:
        return s - (B2 - (A1 + B1 - A2))
    return None


lines = []
for L in open(LRC, encoding='utf8'):
    m = re.match(r'\[(\d+):([\d.]+)\]\s*(.*)', L.strip())
    if m:
        lines.append((int(m.group(1)) * 60 + float(m.group(2)), m.group(3)))
VOW = re.compile(r'[aeiouyæøåıöüâîû]+', re.I)


def syl(w):
    w = re.sub(r"[^a-zA-Zæøåıöüçşğâîû']", '', w).lower().replace("'", '')
    if not w:
        return 0
    p = pronouncing.phones_for_word(w)
    if p:
        return pronouncing.syllable_count(p[0])
    n = len(VOW.findall(w))
    if w.endswith('e') and n > 1 and not w.endswith('le'):
        n -= 1
    return max(1, n)


PLACES = {'Turkey', 'Denmark', 'Alabama', 'Chicago', 'New York', 'Kansas', 'California', 'Twista', 'K.C.'}
sps = np.zeros(int(dur * 10) + 1)
places = []
for i, (s, txt) in enumerate(lines):
    T = remap(s)
    if T is None:
        continue
    e = lines[i + 1][0] if i + 1 < len(lines) else s + 2
    if remap(e) is None or e <= s:
        e = s + 1.8
    if txt.strip() in PLACES:
        if txt.strip() in {'Turkey', 'Chicago', 'Kansas', 'California'}:
            places.append([round(T, 2), txt.strip()])
        continue
    n = sum(syl(w) for w in re.split(r'[\s\-]+', re.sub(r'\(.*?\)', '', txt)))
    if n and e - s > 0.2:
        a, b = int(T * 10), int((T + e - s) * 10)
        sps[a:b] = np.maximum(sps[a:b], n / (e - s))
sps = np.convolve(sps, np.ones(5) / 5, 'same')

q = lambda arr: [int(round(v * 99)) for v in arr]
data = {
    'fps': 50, 'duration': round(dur, 3), 'tempo': round(60 / P, 2), 'beats': beats,
    'rms': q(rms), 'low': q(low), 'mid': q(mid), 'high': q(high), 'onset': q(onset), 'kick': q(kick),
    'sps': [round(float(v), 1) for v in sps], 'places': places,
    'source': {'title': 'Worldwide Choppers', 'artist': 'Tech N9ne ft. Ceza, JL B.Hood, U$O, Yelawolf, Twista, Busta Rhymes, D-Loc, Twisted Insane',
               'album': "All 6's and 7's (2011)", 'edit': '剪辑版：0:00–1:30.2 + 2:44.0–3:43.0 + 4:42.1–结尾，在相同的副歌处拼接（互相关 0.95+）'},
    'grid': {'t0': round(float(T0), 3), 'beat': round(float(P), 4)},
}
with open(os.path.join(ROOT, 'js', 'data', 'audio.js'), 'w', encoding='utf8') as fo:
    fo.write('/* 由 tools/analyze-audio.py 生成：50fps 的能量包络、130 BPM 节拍网格、按歌词行估算的每秒音节数 */\nwindow.AUDIO = ')
    json.dump(data, fo, ensure_ascii=False, separators=(',', ':'))
    fo.write(';\n')
print('时长', round(dur, 2), '秒；写入 js/data/audio.js')
