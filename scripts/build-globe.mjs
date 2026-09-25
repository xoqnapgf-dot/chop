#!/usr/bin/env node
/**
 * 生成点阵地球的陆地点：在球面上用斐波那契格点均匀取样，只保留落在陆地上的点。
 * 数据来自 Natural Earth（world-atlas 的 land-50m，只有陆地轮廓、没有国界）。
 * 输出 src/data/globe-land.json：[纬度×10, 经度×10, ...] 的扁平整数数组。
 *
 * 用法：node scripts/build-globe.mjs [点数，默认 14000]
 */
import fs from 'node:fs/promises';
import { geoContains } from 'd3-geo';
import { feature } from 'topojson-client';

const N = Number(process.argv[2] ?? 14000);
const topo = JSON.parse(await fs.readFile(new URL('../node_modules/world-atlas/land-50m.json', import.meta.url), 'utf8'));
const land = feature(topo, topo.objects.land);

const golden = Math.PI * (3 - Math.sqrt(5));
const out = [];
for (let i = 0; i < N; i++) {
  const y = 1 - (i / (N - 1)) * 2; // 1 → -1
  const lat = (Math.asin(y) * 180) / Math.PI;
  const lon = ((((i * golden * 180) / Math.PI) % 360) + 540) % 360 - 180;
  if (lat < -60) continue; // 南极洲不画，画面更干净
  if (geoContains(land, [lon, lat])) out.push(Math.round(lat * 10), Math.round(lon * 10));
}
await fs.writeFile(new URL('../src/data/globe-land.json', import.meta.url), JSON.stringify(out));
console.log(`陆地点 ${out.length / 2} 个（取样 ${N}）`);
