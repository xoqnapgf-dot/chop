#!/usr/bin/env python3
"""
从站点源码生成宣传片要用的数据和图片（只读 src/，不改动站点）。

输出：
  chop-promo/js/data/site.js        人物、曲目、时间线、地区、测速、统计
  chop-promo/assets/img/artists/    人物方图（photo > portrait > avatar，和站点规则一致）
  chop-promo/assets/img/banners/    人物横幅
  chop-promo/assets/img/tracks/     曲目和视频缩略图

用法：python3 chop-promo/tools/build-data.py   （需要 PyYAML 和 ImageMagick 的 convert）
"""
import glob
import json
import os
import re
import subprocess

import yaml

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'src')
OUT = os.path.join(ROOT, 'chop-promo')
IMG = os.path.join(OUT, 'assets', 'img')


def frontmatter(path):
    text = open(path, encoding='utf8').read()
    m = re.match(r'^---\n(.*?)\n---\n(.*)$', text, re.S)
    return yaml.safe_load(m.group(1)), m.group(2)


def load(name):
    return yaml.safe_load(open(os.path.join(SRC, 'data', name), encoding='utf8'))


def resize(src, dst, geometry, quality=80):
    if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
        return
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    subprocess.run(['convert', src, '-resize', geometry, '-strip', '-interlace', 'Plane', '-quality', str(quality), dst], check=True)


def square(src, dst, size, focus_x=0.5):
    """裁成正方形；横图按 focusX 取人脸位置。"""
    if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
        return
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    w, h = map(int, subprocess.check_output(['identify', '-format', '%w %h', src]).split())
    s = min(w, h)
    x = int(max(0, min(w - s, focus_x * w - s / 2)))
    y = int((h - s) / 2)
    subprocess.run(['convert', src, '-crop', f'{s}x{s}+{x}+{y}', '+repage', '-resize', f'{size}x{size}', '-strip', '-quality', '82', dst], check=True)


# ---------- 人物 ----------
artists = []
sources = set()
source_titles = {}
for path in sorted(glob.glob(os.path.join(SRC, 'content', 'artists', '*.md'))):
    d, _ = frontmatter(path)
    slug = os.path.basename(path)[:-3]
    folder = os.path.join(SRC, 'assets', 'artists', slug)
    files = os.listdir(folder) if os.path.isdir(folder) else []
    pick = next((f for pre in ('photo', 'portrait', 'avatar') for f in files if f.startswith(pre + '.')), None)
    img = None
    if pick:
        focus = (d.get('portrait') or {}).get('focusX', 0.5) if pick.startswith('portrait') else 0.5
        img = f'assets/img/artists/{slug}.jpg'
        square(os.path.join(folder, pick), os.path.join(OUT, img), 480, focus)
    banner = None
    if 'banner.jpg' in files and d.get('useBanner', True):
        banner = f'assets/img/banners/{slug}.jpg'
        resize(os.path.join(folder, 'banner.jpg'), os.path.join(OUT, banner), '1600x')
    speeds = [s for s in d.get('speed') or [] if isinstance(s.get('value'), (int, float))]
    for s in d.get('sources', []):
        sources.add(s['url'])
        source_titles.setdefault(s['url'], s['title'])
    artists.append({
        'slug': slug,
        'name': d['name'],
        'zh': d.get('nameZh'),
        'country': d['country'],
        'city': d.get('city'),
        'region': d.get('region'),
        'style': d['style'],
        'geo': d.get('geo'),
        'since': d.get('activeSince'),
        'featured': bool(d.get('featured')),
        'tagline': d.get('tagline'),
        'img': img,
        'banner': banner,
        'speed': [{
            'v': s['value'], 'win': s.get('window'), 'conf': s.get('confidence'), 'by': s.get('by'),
            'label': s.get('label'), 'syl': s.get('syllables'), 'sec': s.get('seconds'),
        } for s in speeds],
    })

# ---------- 曲目 ----------
tracks = []
for t in load('tracks.yaml'):
    thumb = None
    yid = t.get('youtube')
    if yid and os.path.exists(os.path.join(SRC, 'assets', 'tracks', f'{yid}.jpg')):
        thumb = f'assets/img/tracks/{yid}.jpg'
        resize(os.path.join(SRC, 'assets', 'tracks', f'{yid}.jpg'), os.path.join(OUT, thumb), '560x315^', 78)
    for s in t.get('sources', []):
        sources.add(s['url'])
        source_titles.setdefault(s['url'], s['title'])
    tracks.append({'id': t['id'], 'title': t['title'], 'year': t.get('year'), 'credit': t.get('credit'),
                   'artists': t.get('artists', []), 'scene': t.get('scene'), 'starter': bool(t.get('starter')), 'thumb': thumb})

videos = []
for v in load('videos.yaml'):
    p = os.path.join(SRC, 'assets', 'videos', f"{v['id']}.jpg")
    if os.path.exists(p):
        thumb = f"assets/img/tracks/{v['id']}.jpg"
        resize(p, os.path.join(OUT, thumb), '560x315^', 78)
        videos.append({'id': v['id'], 'title': v.get('title'), 'author': v.get('author'), 'kind': v.get('kind'), 'thumb': thumb})

# ---------- 时间线 / 地区 / 场景 / 系列 / 百科 ----------
timeline = sorted(load('timeline.yaml'), key=lambda e: e['year'])
for e in timeline:
    for s in e.get('sources', []):
        sources.add(s['url'])
        source_titles.setdefault(s['url'], s['title'])
timeline = [{'year': e['year'], 'title': e['title'], 'body': e.get('body'), 'scene': e.get('scene')} for e in timeline]

regions = [{'name': r['name'], 'en': r.get('en'), 'cities': r.get('cities', []), 'summary': r.get('summary')}
           for r in sorted(load('china-regions.yaml'), key=lambda r: r.get('order', 99))]
scenes = [{'id': s['id'], 'name': s['name'], 'en': s.get('en'), 'geo': s['geo']} for s in load('world-scenes.yaml')]

series = []
for path in sorted(glob.glob(os.path.join(SRC, 'content', 'series', '*.md'))):
    d, _ = frontmatter(path)
    series.append({'name': d['name'], 'short': d.get('short'), 'years': str(d.get('years', '')), 'scene': d.get('scene'),
                   'episodes': len(d.get('episodes') or []), 'order': d.get('order', 99)})
series.sort(key=lambda s: s['order'])

learn = []
for path in sorted(glob.glob(os.path.join(SRC, 'content', 'learn', '*.md'))):
    d, _ = frontmatter(path)
    learn.append({'title': d['title'], 'kicker': d.get('kicker'), 'summary': d.get('summary'), 'order': d.get('order', 9)})
learn.sort(key=lambda x: x['order'])

# 合作连线：同一首歌里出现过的国家对（和站点 Globe.astro 的算法一致，这里只算曲库）
country_of = {a['slug']: a['country'].lower() for a in artists}
scene_ids = {s['id'] for s in scenes}
pairs = {}
for t in tracks:
    cs = sorted({country_of[a] for a in t['artists'] if a in country_of and country_of[a] in scene_ids})
    for i in range(len(cs)):
        for j in range(i + 1, len(cs)):
            pairs[(cs[i], cs[j])] = pairs.get((cs[i], cs[j]), 0) + 1
arcs = [{'a': a, 'b': b, 'w': w} for (a, b), w in sorted(pairs.items(), key=lambda kv: -kv[1])]

cn = [a for a in artists if a['country'] == 'CN']
stats = {
    'cn': len(cn),
    'world': len(artists) - len(cn),
    'artists': len(artists),
    'tracks': len(tracks),
    'sources': len(sources),
    'chopper': sum(a['style'] == 'chopper' for a in artists),
    'fast': sum(a['style'] == 'fast' for a in artists),
    'countries': len({a['country'] for a in artists}),
    'series': len(series),
    'timeline': len(timeline),
    'measurements': sum(len(a['speed']) for a in artists),
}

site = {'stats': stats, 'artists': artists, 'tracks': tracks, 'videos': videos, 'timeline': timeline,
        'regions': regions, 'scenes': scenes, 'series': series, 'learn': learn, 'arcs': arcs,
        'sourceTitles': list(source_titles.values())[:160]}
with open(os.path.join(OUT, 'js', 'data', 'site.js'), 'w', encoding='utf8') as f:
    f.write('/* 由 tools/build-data.py 从站点源码生成，不要手改 */\nwindow.SITE = ')
    json.dump(site, f, ensure_ascii=False, separators=(',', ':'))
    f.write(';\n')
print(json.dumps(stats, ensure_ascii=False))
