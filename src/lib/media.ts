import type { ImageMetadata } from 'astro';
import media from '@/data/media.json';

type Mod = { default: ImageMetadata };
const artistImgs = import.meta.glob<Mod>('/src/assets/artists/*/*.{jpg,jpeg,png,webp}', { eager: true });
const trackImgs = import.meta.glob<Mod>('/src/assets/tracks/*.jpg', { eager: true });

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
  return (media.artists as Record<string, { channelUrl: string; kind: string; color: string; fetchedAt: string }>)[slug];
}

export function artistColor(slug: string): string {
  return artistMedia(slug)?.color ?? '#c6f432';
}

export function trackThumb(videoId: string): ImageMetadata | undefined {
  return trackImgs[`/src/assets/tracks/${videoId}.jpg`]?.default;
}
