/**
 * 极简 Markdown：只支持段落、**粗体**、以 "- " 开头的列表。
 * 用于 YAML 数据里的多行正文，内容都是站内自己写的，不含用户输入。
 */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

export function mdLite(src: string): string {
  return src
    .trim()
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block.split('\n').map((l) => l.trim());
      if (lines.every((l) => l.startsWith('- '))) {
        return `<ul>${lines.map((l) => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>`;
      }
      // 段落里夹着列表的情况：先段落后列表
      const para = lines.filter((l) => !l.startsWith('- '));
      const items = lines.filter((l) => l.startsWith('- '));
      return (para.length ? `<p>${inline(para.join(''))}</p>` : '') + (items.length ? `<ul>${items.map((l) => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>` : '');
    })
    .join('');
}
