#!/usr/bin/env node
/**
 * 从歌手的 YouTube 频道抓取头像和横幅，从视频抓取缩略图，保存到 src/assets/，
 * 同时把来源信息、主色调写进 src/data/media.json。
 *
 * 用法：
 *   npm run fetch:yt            只抓缺失的图片
 *   npm run fetch:yt -- --force 全部重新抓
 *
 * 图片存在仓库里而不是外链，这样即使 YouTube 在访问者所在地区打不开，图片也能正常显示。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import * as yaml from 'js-yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const force = process.argv.includes('--force');
const UA = { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36', 'accept-language': 'en' };

const artistsDir = path.join(root, 'src/content/artists');
const mediaFile = path.join(root, 'src/data/media.json');
const media = JSON.parse(await fs.readFile(mediaFile, 'utf8').catch(() => '{"artists":{},"tracks":{}}'));

const exists = (p) => fs.access(p).then(() => true, () => false);

async function download(url, dest, { width } = {}) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  let img = sharp(Buffer.from(await res.arrayBuffer()));
  if (width) img = img.resize({ width, withoutEnlargement: true });
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await img.jpeg({ quality: 88, mozjpeg: true }).toFile(dest);
}

/** 取图片的主色，用于页面的氛围光 */
async function dominant(file) {
  const { dominant: d } = await sharp(file).stats();
  return '#' + [d.r, d.g, d.b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** 从视频缩略图裁出一张正方形人物照，focusX 是人脸在画面中的水平位置（0–1） */
async function portraitFromVideo(id, focusX, dest) {
  for (const size of ['maxresdefault', 'hqdefault']) {
    const res = await fetch(`https://i.ytimg.com/vi/${id}/${size}.jpg`, { headers: UA });
    if (!res.ok) continue;
    const buf = Buffer.from(await res.arrayBuffer());
    const { width, height } = await sharp(buf).metadata();
    // hqdefault 上下有黑边，按 16:9 的有效区域取
    const h = size === 'hqdefault' ? Math.round((width * 9) / 16) : height;
    const top = Math.round((height - h) / 2);
    const left = Math.max(0, Math.min(width - h, Math.round(focusX * width - h / 2)));
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await sharp(buf).extract({ left, top, width: h, height: h }).resize(800, 800).jpeg({ quality: 88, mozjpeg: true }).toFile(dest);
    return;
  }
  throw new Error('缩略图不可用');
}

function frontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  return m ? yaml.load(m[1]) : {};
}

async function channelImages(channelId) {
  const res = await fetch(`https://www.youtube.com/channel/${channelId}`, { headers: UA });
  const html = await res.text();
  const avatar = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
  // 横幅：取 yt3 上宽度参数 =wNNNN 的最大一张
  const banners = [...html.matchAll(/https:\/\/yt3\.googleusercontent\.com\/([A-Za-z0-9_-]+)=w(\d+)-fcrop64=[^"\\]+/g)];
  const banner = banners.sort((a, b) => +b[2] - +a[2])[0]?.[0];
  return {
    avatar: avatar?.replace(/=s\d+/, '=s800'),
    banner,
  };
}

// ---------- 歌手 ----------
for (const f of (await fs.readdir(artistsDir)).filter((f) => f.endsWith('.md'))) {
  const slug = f.replace(/\.md$/, '');
  const fm = frontmatter(await fs.readFile(path.join(artistsDir, f), 'utf8'));
  if (!fm.youtube?.channelId) continue;
  const dir = path.join(root, 'src/assets/artists', slug);
  const avatarPath = path.join(dir, 'avatar.jpg');
  const bannerPath = path.join(dir, 'banner.jpg');
  const portraitPath = path.join(dir, 'portrait.jpg');

  // 频道头像不是本人照片时（比如专辑宣传图），在 frontmatter 里用 portrait 指定一个官方视频截图
  if (fm.portrait?.video && (force || !(await exists(portraitPath)))) {
    try {
      await portraitFromVideo(fm.portrait.video, fm.portrait.focusX ?? 0.5, portraitPath);
      console.log(`✓ ${slug} portrait ← ${fm.portrait.video}`);
    } catch (e) {
      console.warn(`✗ ${slug} portrait: ${e.message}`);
    }
  }
  if (!force && (await exists(avatarPath))) continue;

  try {
    const { avatar, banner } = await channelImages(fm.youtube.channelId);
    if (!avatar) throw new Error('找不到头像');
    await download(avatar, avatarPath, { width: 800 });
    let hasBanner = false;
    // Topic 频道（YouTube 自动生成）的横幅是默认占位图，不用
    if (banner && fm.youtube.kind !== 'topic') {
      await download(banner, bannerPath, { width: 2120 });
      hasBanner = true;
    }
    media.artists[slug] = {
      channelUrl: `https://www.youtube.com/channel/${fm.youtube.channelId}`,
      kind: fm.youtube.kind,
      avatar: avatar,
      banner: banner ?? null,
      hasBanner,
      color: await dominant((await exists(portraitPath)) ? portraitPath : avatarPath),
      fetchedAt: new Date().toISOString().slice(0, 10),
    };
    console.log(`✓ ${slug}${hasBanner ? ' (+banner)' : ''}`);
  } catch (e) {
    console.warn(`✗ ${slug}: ${e.message}`);
  }
}

// ---------- 曲目缩略图 ----------
const tracks = yaml.load(await fs.readFile(path.join(root, 'src/data/tracks.yaml'), 'utf8'));
for (const t of tracks) {
  const dest = path.join(root, 'src/assets/tracks', `${t.youtube}.jpg`);
  if (!force && (await exists(dest))) continue;
  // maxresdefault 不一定存在，失败就退回 hqdefault
  for (const size of ['maxresdefault', 'sddefault', 'hqdefault']) {
    try {
      await download(`https://i.ytimg.com/vi/${t.youtube}/${size}.jpg`, dest, { width: 1280 });
      media.tracks[t.id] = { video: `https://www.youtube.com/watch?v=${t.youtube}`, size, color: await dominant(dest) };
      console.log(`✓ track ${t.id} (${size})`);
      break;
    } catch {
      /* 尝试下一个尺寸 */
    }
  }
}

await fs.writeFile(mediaFile, JSON.stringify(media, null, 2) + '\n');
console.log('media.json 已更新');
