import { getCollection, type CollectionEntry } from 'astro:content';

export type Collab = CollectionEntry<'collabs'>;

/** 一首合作曲的链接：优先网易云，其次写明的出处 */
export const collabHref = (c: Collab) =>
  c.data.netease ? `https://music.163.com/#/song?id=${c.data.netease}` : c.data.source!.url;

export const collabYear = (c: Collab) => c.data.date.slice(0, 4);

/** 按"两人一组"汇总：同一首歌有三位收录人物时，三对各记一次 */
export async function collabPairs() {
  const all = (await getCollection('collabs')).sort((a, b) => a.data.date.localeCompare(b.data.date));
  const pairs = new Map<string, { a: string; b: string; songs: Collab[] }>();
  for (const c of all) {
    const ids = [...new Set(c.data.artists.map((r) => r.id))].sort();
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const key = `${ids[i]}|${ids[j]}`;
        if (!pairs.has(key)) pairs.set(key, { a: ids[i], b: ids[j], songs: [] });
        pairs.get(key)!.songs.push(c);
      }
  }
  return { all, pairs: [...pairs.values()].sort((x, y) => y.songs.length - x.songs.length || x.a.localeCompare(y.a)) };
}
