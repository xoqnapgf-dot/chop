#!/usr/bin/env node
/**
 * 宣传片用的高密度点阵地球（和站点 scripts/build-globe.mjs 同一算法，点更密）。
 * 需要先在仓库根目录 npm install（用到站点的 d3-geo / topojson-client / world-atlas）。
 * 输出 chop-promo/js/data/globe.js：window.GLOBE = [纬度×10, 经度×10, ...]
 */
import fs from 'node:fs/promises';
import { geoContains } from 'd3-geo';
import { feature } from 'topojson-client';

const N = Number(process.argv[2] ?? 70000);
const topo = JSON.parse(await fs.readFile(new URL('../../node_modules/world-atlas/land-50m.json', import.meta.url), 'utf8'));
const land = feature(topo, topo.objects.land);
const golden = Math.PI * (3 - Math.sqrt(5));
const out = [];
for (let i = 0; i < N; i++) {
  const y = 1 - (i / (N - 1)) * 2;
  const lat = (Math.asin(y) * 180) / Math.PI;
  const lon = ((((i * golden * 180) / Math.PI) % 360) + 540) % 360 - 180;
  if (lat < -60) continue;
  if (geoContains(land, [lon, lat])) out.push(Math.round(lat * 10), Math.round(lon * 10));
}
await fs.writeFile(new URL('../js/data/globe.js', import.meta.url), '/* 由 tools/build-globe.mjs 生成 */\nwindow.GLOBE = ' + JSON.stringify(out) + ';\n');
console.log(`陆地点 ${out.length / 2} 个（取样 ${N}）`);
