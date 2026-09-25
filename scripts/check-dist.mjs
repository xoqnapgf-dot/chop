#!/usr/bin/env node
/**
 * 构建后检查：页面文字里不应该出现没被渲染的 Markdown 加粗标记 "**"。
 * （中文里 **《书名》** 这种写法会因为标点规则失效，需要写成《**书名**》。）
 */
import fs from 'node:fs';
import path from 'node:path';

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.html') ? [path.join(d, e.name)] : []));
let bad = 0;
for (const f of walk('dist')) {
  const text = fs
    .readFileSync(f, 'utf8')
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, '')
    .replace(/<[^>]+>/g, ' ');
  // 逐个看星号串：恰好两个星号才算未渲染的加粗标记；三个及以上（如歌名 F*** Em All）不算
  const hits = [...text.matchAll(/\*+/g)]
    .filter((m) => m[0].length === 2)
    .map((m) => ({ 0: text.slice(Math.max(0, m.index - 12), m.index + 14) }));
  for (const m of hits) {
    console.error(`${f}: 未渲染的加粗标记：…${m[0].trim()}…`);
    bad++;
  }
}
if (bad) process.exit(1);
console.log('构建产物检查通过');
