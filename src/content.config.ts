import { defineCollection, reference } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { z } from 'astro/zod';

/** 可信度四级：已证实 / 有争议 / 待核实 / 已辟谣 */
export const confidence = z.enum(['verified', 'disputed', 'pending', 'debunked']);

const source = z.object({
  title: z.string(),
  url: z.url(),
});

/** 一条"速度"说法：数值 + 口径 + 可信度 + 出处 */
const speedClaim = z.object({
  value: z.number(),
  unit: z.enum(['syl/s', 'char/s', 'word/s']).default('syl/s'),
  label: z.string(), // 例如 "Godzilla 第三段主歌"
  kind: z.enum(['official', 'measured', 'claimed']), // 官方认证 / 第三方测算 / 自称或传闻
  confidence,
  note: z.string().optional(),
  sources: z.array(source).min(1),
});

const artists = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/artists' }),
  schema: z.object({
    name: z.string(),
    nameZh: z.string().optional(),
    realName: z.string().optional(),
    tagline: z.string(),
    country: z.enum(['US', 'KR', 'TR', 'CN', 'DK', 'DE', 'PH', 'JP', 'OTHER']),
    city: z.string(),
    region: z.string(), // 例如 "美国中西部"
    activeSince: z.number().int(),
    born: z.string().optional(),
    died: z.string().optional(),
    /** 在 chop 三种含义里属于哪一类 */
    lane: z.array(z.enum(['chopper', 'screw', 'sample'])).min(1),
    tags: z.array(z.string()).default([]),
    featured: z.boolean().default(false),
    youtube: z
      .object({
        channelId: z.string(),
        handle: z.string().optional(),
        kind: z.enum(['official', 'topic', 'label']),
      })
      .optional(),
    /** 频道头像不是本人时，用官方视频截图当人物照（由 scripts/fetch-youtube.mjs 生成 portrait.jpg） */
    portrait: z.object({ video: z.string(), focusX: z.number().min(0).max(1).default(0.5) }).optional(),
    /** 频道横幅只是宣传文字图时设为 false */
    useBanner: z.boolean().default(true),
    related: z.array(reference('artists')).default([]),
    speed: z.array(speedClaim).default([]),
    sources: z.array(source).min(1),
  }),
});

const tracks = defineCollection({
  loader: file('src/data/tracks.yaml'),
  schema: z.object({
    title: z.string(),
    artists: z.array(reference('artists')).min(1),
    credit: z.string(), // 展示用的完整署名，含非收录艺人
    year: z.number().int().optional(),
    album: z.string().optional(),
    youtube: z.string(), // 视频 ID
    youtubeChannel: z.string(), // 上传频道名
    officialUpload: z.boolean(),
    lane: z.enum(['chopper', 'screw', 'sample']),
    note: z.string(),
    confidence: confidence.default('verified'),
    sources: z.array(source).min(1),
  }),
});

const timeline = defineCollection({
  loader: file('src/data/timeline.yaml'),
  schema: z.object({
    year: z.number().int(),
    title: z.string(),
    body: z.string(),
    lane: z.enum(['chopper', 'screw', 'sample']),
    artist: reference('artists').optional(),
    confidence: confidence.default('verified'),
    sources: z.array(source).min(1),
  }),
});

const learn = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/learn' }),
  schema: z.object({
    title: z.string(),
    kicker: z.string(),
    summary: z.string(),
    order: z.number(),
    lane: z.enum(['chopper', 'screw', 'sample', 'general']),
    sources: z.array(source).default([]),
  }),
});

export const collections = { artists, tracks, timeline, learn };
