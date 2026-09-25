#!/usr/bin/env node
/**
 * 防止 YAML 静默截断：单行值里出现 " #" 会被当成注释（例如 Speed #1 变成 Speed）。
 * 检查 src/data/*.yaml 和内容文件的 frontmatter，发现没加引号的就报错。
 */
import fs from 'node:fs';
import path from 'node:path';

const files = [
  ...fs.readdirSync('src/data').filter((f) => f.endsWith('.yaml')).map((f) => path.join('src/data', f)),
  ...['src/content/artists', 'src/content/learn'].flatMap((d) => fs.readdirSync(d).filter((f) => f.endsWith('.md')).map((f) => path.join(d, f))),
];
let bad = 0;
for (const f of files) {
  let text = fs.readFileSync(f, 'utf8');
  if (f.endsWith('.md')) text = text.split(/^---$/m)[1] ?? '';
  let inBlock = false;
  let blockIndent = 0;
  text.split('\n').forEach((line, i) => {
    const indent = line.match(/^\s*/)[0].length;
    if (inBlock && (line.trim() === '' || indent > blockIndent)) return;
    inBlock = false;
    const m = line.match(/^(\s*)(?:- )?[\w-]+:\s+(.*)$/);
    if (!m) return;
    const val = m[2];
    if (/[|>][-+]?\s*$/.test(val)) {
      inBlock = true;
      blockIndent = m[1].length;
      return;
    }
    if (/^['"{[]/.test(val)) return;
    if (/\s#/.test(val)) {
      console.error(`${f}:${i + 1}  值里有 " #"，会被 YAML 当成注释截断，请加引号：\n    ${line.trim()}`);
      bad++;
    }
  });
}
if (bad) process.exit(1);
console.log(`YAML 检查通过（${files.length} 个文件）`);
