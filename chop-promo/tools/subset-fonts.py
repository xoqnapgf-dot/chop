#!/usr/bin/env python3
"""
把思源黑体 / 思源宋体（Noto Sans SC / Noto Serif SC，可变字重）裁成只含片子里用到的字，
输出 assets/fonts/noto-*-subset.woff2。改了文案以后重新跑一次。
用法：python3 chop-promo/tools/subset-fonts.py <NotoSansSC[wght].ttf> [NotoSerifSC[wght].ttf]
宋体只用在两句话上（开场和"都可以复算"），没有本地宋体时可以用 Google Fonts 的 text= 参数直接取子集：
  https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@700;900&text=一秒钟，能塞进多少个音节？每一个数字，都可以复算。
字体下载：https://github.com/google/fonts/tree/main/ofl/notosanssc 、ofl/notoserifsc（SIL OFL 1.1）
需要：pip install fonttools brotli
"""
import glob, os, sys
from fontTools import subset

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
files = glob.glob(os.path.join(ROOT, 'js', '*.js')) + glob.glob(os.path.join(ROOT, 'js', 'data', 'site.js')) + [os.path.join(ROOT, 'index.html')]
chars = set()
for f in files:
    chars |= set(open(f, encoding='utf8').read())
# 常用标点和全部 ASCII 兜底
chars |= set('，。、；：？！“”‘’（）《》〈〉【】—…·・「」『』～ ') | {chr(c) for c in range(0x20, 0x7f)}
text = ''.join(sorted(c for c in chars if ord(c) >= 0x20))
print('字符数', len(text))
jobs = [(sys.argv[1], 'noto-sans-sc-subset.woff2')]
if len(sys.argv) > 2:
    jobs.append((sys.argv[2], 'noto-serif-sc-subset.woff2'))
for src, out in jobs:
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    fnt = subset.load_font(src, opts)
    s = subset.Subsetter(opts)
    s.populate(text=text)
    s.subset(fnt)
    dst = os.path.join(ROOT, 'assets', 'fonts', out)
    subset.save_font(fnt, dst, opts)
    print(out, os.path.getsize(dst) // 1024, 'KB')
