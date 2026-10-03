// 部署前把"线上当前版本"引用的 CSS / JS 下载回 dist/_astro。
//
// 为什么需要：GitHub Pages 会让浏览器缓存 HTML 约 10 分钟，站点还会悬停预加载页面。
// 每次部署后，带哈希的 CSS / JS 文件名会变、旧文件被删掉；
// 这时浏览器里缓存的旧页面去找旧样式就会 404，页面只剩文字和图片。
// 把上一版的这些小文件一起发布，旧页面在缓存过期前也能正常显示。
//
// 图片的文件名按内容生成，内容不变名字就不变，这里不处理。
// 线上拿不到（第一次部署、断网）时直接跳过，不影响部署。
import fs from 'node:fs/promises';
import path from 'node:path';

const SITE = process.env.SITE_URL || 'https://xoqnapgf-dot.github.io';
const BASE = (process.env.BASE_PATH ?? '/chop').replace(/\/$/, '');
const out = path.resolve('dist/_astro');

async function get(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res;
}

async function main() {
  let pages = [];
  try {
    const xml = await (await get(`${SITE}${BASE}/sitemap-0.xml`)).text();
    pages = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  } catch (e) {
    console.log(`跳过：拿不到线上的 sitemap（${e.message}）`);
    return;
  }

  const assets = new Set();
  const re = new RegExp(`${BASE}/_astro/[\\w.-]+\\.(?:css|js)`, 'g');
  await Promise.all(
    pages.map(async (u) => {
      try {
        const html = await (await get(u)).text();
        for (const m of html.matchAll(re)) assets.add(m[0]);
      } catch {
        /* 单页失败不要紧 */
      }
    }),
  );

  // JS 之间会互相 import（如 ./page.xxx.js），顺着找一层
  const queue = [...assets].filter((a) => a.endsWith('.js'));
  for (const a of queue) {
    try {
      const js = await (await get(SITE + a)).text();
      for (const m of js.matchAll(/["'`]\.\/([\w.-]+\.(?:js|css))["'`]/g)) {
        const dep = `${BASE}/_astro/${m[1]}`;
        if (!assets.has(dep)) {
          assets.add(dep);
          if (dep.endsWith('.js')) queue.push(dep);
        }
      }
    } catch {
      /* 忽略 */
    }
  }

  let kept = 0;
  for (const a of assets) {
    const dest = path.join(out, path.basename(a));
    try {
      await fs.access(dest);
      continue; // 新版本里已经有同名文件
    } catch {
      /* 不存在，下载 */
    }
    try {
      const buf = Buffer.from(await (await get(SITE + a)).arrayBuffer());
      await fs.writeFile(dest, buf);
      kept++;
    } catch (e) {
      console.warn(`✗ ${a}: ${e.message}`);
    }
  }
  console.log(`保留上一版资源 ${kept} 个（线上共引用 ${assets.size} 个）`);
}

await main();
