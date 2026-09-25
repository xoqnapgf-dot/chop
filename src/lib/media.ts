import type { ImageMetadata } from 'astro';
import media from '@/data/media.json';

type Mod = { default: ImageMetadata };
const artistImgs = import.meta.glob<Mod>('/src/assets/artists/*/*.{jpg,jpeg,png,webp}', { eager: true });
const trackImgs = import.meta.glob<Mod>('/src/assets/tracks/*.jpg', { eager: true });
const videoImgs = import.meta.glob<Mod>('/src/assets/videos/*.jpg', { eager: true });

function find(slug: string, name: string) {
  const hit = Object.entries(artistImgs).find(([p]) => p.startsWith(`/src/assets/artists/${slug}/${name}.`));
  return hit?.[1].default;
}

/**
 * 人物照优先级：
 * photo.*（手动放置，最高） > portrait.jpg（官方视频截图） > avatar.jpg（频道头像）
 */
export function artistPhoto(slug: string): ImageMetadata | undefined {
  return find(slug, 'photo') ?? find(slug, 'portrait') ?? find(slug, 'avatar');
}

export function artistBanner(slug: string): ImageMetadata | undefined {
  return find(slug, 'banner');
}

export function artistMedia(slug: string) {
  return (media.artists as Record<string, { channelUrl?: string | null; kind?: string; color: string; fetchedAt: string; photo?: { site: string; url: string; name: string } }>)[slug];
}

/** 人物主色：有照片取照片主色；没有照片按 slug 在色板里取（稳定、且不同人不同色） */
const PALETTE = ['#e5322d', '#e8b84a', '#c9772f', '#a8231d', '#d9a441', '#8c2f22'];
export function artistColor(slug: string): string {
  const c = artistMedia(slug)?.color;
  if (c && artistPhoto(slug)) return c;
  const hash = [...slug].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return PALETTE[hash % PALETTE.length];
}

/** 测速/推荐视频的本地封面 */
export function videoCover(id: string): ImageMetadata | undefined {
  return videoImgs[`/src/assets/videos/${id}.jpg`]?.default;
}

export function trackThumb(videoId: string): ImageMetadata | undefined {
  return trackImgs[`/src/assets/tracks/${videoId}.jpg`]?.default;
}
