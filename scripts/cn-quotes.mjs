// 构建后把中文段落里的引号统一配成中文引号 “…”。
// Markdown 正文会自动转换，但页面模板和数据文件里的文字不会，中文字体下直引号会显示成两个右引号。
// 只处理文字节点：跳过 script / style / pre / code / textarea 和所有标签属性。
import fs from 'node:fs/promises';
import path from 'node:path';

const DIST = path.resolve('dist');
const CJK = /[㐀-鿿＀-￯　-〿]/;
const SKIP = new Set(['script', 'style', 'pre', 'code', 'textarea']);
// 这些标签开始或结束时，引号配对重新计算
const BLOCK = /^(p|li|h[1-6]|div|dd|dt|td|th|section|article|figcaption|blockquote|button|a|span|label|option|title)$/;

async function* walk(dir) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith('.html')) yield p;
  }
}

function convert(html) {
  let out = '';
  let skip = 0;
  let open = false;
  let changed = 0;
  // 最后一项：不构成标签的单个 <（比如脚本里的 y < 10）原样保留
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][\w-]*)[^>]*>|[^<]+|</g;
  for (const m of html.matchAll(re)) {
    const tok = m[0];
    if (tok === '<') {
      out += tok;
      continue;
    }
    if (tok[0] === '<') {
      const name = (m[1] || '').toLowerCase();
      if (SKIP.has(name)) skip += tok[1] === '/' ? -1 : tok.endsWith('/>') ? 0 : 1;
      if (BLOCK.test(name) && name !== 'a' && name !== 'span') open = false;
      out += tok;
      continue;
    }
    // 只有引号的文字节点（比如 "<strong>…</strong>" 两侧）也要参与配对
    const onlyQuotes = /^[\s"“”]+$/.test(tok);
    if (skip > 0 || (!open && !CJK.test(tok) && !onlyQuotes)) {
      out += tok;
      continue;
    }
    // Markdown 自动转换的弯引号在"中文字前后都是中文"时常常配错方向，这里一并重新配对
    out += tok.replace(/"|&quot;|&#34;|“|”/g, () => {
      changed++;
      open = !open;
      return open ? '“' : '”';
    });
  }
  return { out, changed };
}

let files = 0;
let total = 0;
for await (const f of walk(DIST)) {
  const html = await fs.readFile(f, 'utf8');
  const { out, changed } = convert(html);
  // 自检：除了引号本身，其他字符一个都不能变
  const norm = (x) => x.replace(/&quot;|&#34;|["“”]/g, '"');
  if (norm(out) !== norm(html)) throw new Error(`cn-quotes 改动了引号以外的内容：${f}`);
  if (changed) {
    await fs.writeFile(f, out);
    files++;
    total += changed;
  }
}
console.log(`中文引号：${files} 个页面，替换 ${total} 处`);
