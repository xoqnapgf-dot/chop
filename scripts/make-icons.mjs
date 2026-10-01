#!/usr/bin/env node
/**
 * 生成主屏幕图标（PWA / iOS "添加到主屏幕"）。
 * 图案：五根音频条，被一道斜线"剁"开，右下半错位滑出——对应首页标题的斜杠。
 * 满版方形、无圆角（iOS 会自己裁圆角）；图案全部在中间 70% 内，同时满足 maskable 的安全区。
 * 改了图案就跑一次：node scripts/make-icons.mjs
 */
import sharp from 'sharp';
import fs from 'node:fs';

const heights = [200, 440, 600, 380, 150];
const w = 76;
const gap = 40;
const x0 = (1024 - (5 * w + 4 * gap)) / 2;
const bars = heights
  .map((h, i) => `<rect x="${x0 + i * (w + gap)}" y="${512 - h / 2}" width="${w}" height="${h}" rx="${w / 2}"/>`)
  .join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
<defs>
  <radialGradient id="bg" cx="50%" cy="42%" r="75%"><stop offset="0" stop-color="#1c140d"/><stop offset="1" stop-color="#0a0807"/></radialGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f3d27a"/><stop offset="1" stop-color="#d9a62b"/></linearGradient>
  <clipPath id="a"><polygon points="0,0 1024,0 0,1024"/></clipPath>
  <clipPath id="b"><polygon points="1024,0 1024,1024 0,1024"/></clipPath>
</defs>
<rect width="1024" height="1024" fill="url(#bg)"/>
<g fill="url(#gold)">
  <g clip-path="url(#a)">${bars}</g>
  <g clip-path="url(#b)" transform="translate(26,-26)">${bars}</g>
</g>
</svg>`;

fs.mkdirSync('public/icons', { recursive: true });
fs.writeFileSync('public/icons/icon.svg', svg);
const out = { 'apple-touch-icon.png': 180, 'icon-192.png': 192, 'icon-512.png': 512 };
for (const [name, size] of Object.entries(out)) {
  await sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png({ compressionLevel: 9 }).toFile(`public/icons/${name}`);
}
console.log('图标已生成：public/icons/');
