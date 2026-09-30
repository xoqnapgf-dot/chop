// 构建一份「域名根目录」版本，输出到 site-root/，index.html 在最外层，可直接整个上传到别的托管。
// 用法：npm run build:root            （canonical 用默认地址）
//       npm run build:root -- https://你的域名
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const site = process.argv[2] ?? process.env.SITE_URL ?? 'https://xoqnapgf-dot.github.io';
const env = { ...process.env, BASE_PATH: '/', SITE_URL: site };

const r = spawnSync('npm', ['run', 'build'], { stdio: 'inherit', env, shell: true });
if (r.status !== 0) process.exit(r.status ?? 1);

fs.rmSync('site-root', { recursive: true, force: true });
fs.renameSync('dist', 'site-root');
console.log('\n完成：site-root/ 里就是可上传的网站，index.html 在最外层。');
console.log('把 site-root 里面的所有内容传到托管的网站根目录（如 InfinityFree 的 htdocs）。');
