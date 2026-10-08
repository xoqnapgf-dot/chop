// 文案检查：这些写法读起来像 AI 腔或自说自话，出现就让构建失败。
import fs from 'node:fs';
import path from 'node:path';

const BAN = [
  '值得一提', '总的来说', '综上所述', '综上', '需要说明的是', '值得注意的是', '众所周知', '不难发现',
  '不言而喻', '毋庸置疑', '毫无疑问', '彰显', '凸显', '堪称', '可谓', '不容小觑', '独树一帜',
  '本站采用', '待补充', '留作', '有公开出处再补', '不下结论', '本站收录这首是因为',
];
// 引用别人原话的地方允许出现（评论、标题里的原文），放在这里按"文件:词"登记
const ALLOW = new Set(['src/content/artists/kindergarten-killer.md:毫无疑问', 'src/content/artists/don-xperto.md:众所周知']);

const roots = ['src/content', 'src/data', 'src/pages', 'src/components'];
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(md|yaml|astro)$/.test(e.name)) files.push(p);
  }
})('.' === '.' ? 'src' : '.');

let bad = 0;
for (const f of files) {
  if (!roots.some((r) => f.startsWith(r))) continue;
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const w of BAN) {
      if (line.includes(w) && !ALLOW.has(`${f}:${w}`)) {
        console.error(`${f}:${i + 1} 文案里有"${w}"`);
        bad++;
      }
    }
  });
}
if (bad) {
  console.error(`\n共 ${bad} 处，改掉再构建。`);
  process.exit(1);
}
console.log('文案检查通过');
