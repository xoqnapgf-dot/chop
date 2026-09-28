import { getCollection, type CollectionEntry } from 'astro:content';

export type Member = { name: string; slug?: string };
export type SeriesEntry = CollectionEntry<'series'>;
export type Episode = SeriesEntry['data']['episodes'][number];

/** lineup 里的 "艺名@slug" 拆成名字和档案 slug */
export function member(raw: string): Member {
  const i = raw.lastIndexOf('@');
  return i > 0 ? { name: raw.slice(0, i), slug: raw.slice(i + 1) } : { name: raw };
}

export const epYear = (ep: Episode) => Number(ep.date.slice(0, 4));

/** "2016-12-20" → "2016 年 12 月 20 日"；只有年份就原样 */
export function epDate(ep: Episode): string {
  const [y, m, d] = ep.date.split('-');
  if (!m) return `${y} 年`;
  return d ? `${y} 年 ${Number(m)} 月 ${Number(d)} 日` : `${y} 年 ${Number(m)} 月`;
}

export async function allSeries() {
  return (await getCollection('series')).sort((a, b) => a.data.order - b.data.order);
}

/** 按人数排的常客：同一个档案或同名算一个人 */
export function regulars(s: SeriesEntry) {
  const count = new Map<string, { m: Member; n: number; eps: string[] }>();
  for (const ep of s.data.episodes) {
    for (const raw of ep.lineup) {
      const m = member(raw);
      const key = m.slug ?? m.name.toLowerCase();
      const cur = count.get(key) ?? { m, n: 0, eps: [] };
      cur.n += 1;
      cur.eps.push(ep.no);
      count.set(key, cur);
    }
  }
  return [...count.values()].sort((a, b) => b.n - a.n);
}

/** 某个人上过的所有系列、所有集 */
export async function seriesOf(slug: string) {
  const out: { series: SeriesEntry; eps: Episode[] }[] = [];
  for (const s of await allSeries()) {
    const eps = s.data.episodes.filter((ep) => ep.lineup.some((r) => member(r).slug === slug));
    if (eps.length) out.push({ series: s, eps });
  }
  return out;
}

/** 每个系列一个颜色（按顺序轮流用辅助色板） */
export const seriesColor = (s: SeriesEntry) => `var(--p${((s.data.order - 1) % 6) + 1})`;
