import { defineCollection, reference } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { z } from 'astro/zod';

/** 可信度四级：已证实 / 有争议 / 待核实 / 已辟谣 */
export const confidence = z.enum(['verified', 'disputed', 'pending', 'debunked']);

const source = z.object({
  title: z.string(),
  url: z.url(),
});

/** [纬度, 经度] */
const geo = z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]);

/** 一条"速度"说法：数值 + 口径 + 可信度 + 出处 */
const speedClaim = z.object({
  value: z.number(),
  unit: z.enum(['syl/s', 'char/s', 'word/s']).default('syl/s'),
  label: z.string(), // 例如 "Godzilla 第三段主歌"
  kind: z.enum(['official', 'measured', 'claimed']), // 官方认证 / 第三方测算 / 自称或传闻
  /**
   * 测量窗口：不同窗口的数字不能直接比
   * burst = 爆发（约 1–2 秒，SPS 社区常用）；short = 短段（3–15 秒）；long = 整段平均（15 秒以上）；unknown = 口径不明
   */
  window: z.enum(['burst', 'short', 'long', 'unknown']),
  /** 有的话填上，页面会显示算式 */
  syllables: z.number().optional(),
  seconds: z.number().optional(),
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
    country: z.enum(['US', 'KR', 'TR', 'CN', 'PH']),
    city: z.string(),
    /** 分组用的地区名，中国区按这个分组（如"川渝"） */
    region: z.string(),
    geo: geo.optional(),
    activeSince: z.number().int().optional(),
    born: z.string().optional(),
    died: z.string().optional(),
    /**
     * 风格标签（快 ≠ Chop；chop 是风格，chopper 是唱 chop 的人）：
     * chopper = 有来源称其为 chopper，或长期整首地唱 chop
     * fast    = 以语速/快嘴著称
     * track   = 因个别快歌或快段落出圈，本人不以快著称
     */
    style: z.enum(['chopper', 'fast', 'track']),
    styleNote: z.string(),
    /** 没标 Chopper，但接近 chop（有争议、和 chopper 合作过、速度强度接近等），写明理由 */
    nearChop: z.string().optional(),
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
    /** 没有合适的 YouTube 图时，从网易云音乐歌手页取图（avatar 头像 / cover 封面），裁成正方形存为 photo.jpg */
    photoSource: z
      .object({
        site: z.literal('netease'),
        id: z.number().int(),
        image: z.enum(['avatar', 'cover']),
        focusX: z.number().min(0).max(1).default(0.5),
        focusY: z.number().min(0).max(1).default(0.5),
        /** >1 表示放大裁切（取更小的正方形） */
        zoom: z.number().min(1).max(4).default(1),
      })
      .optional(),
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
    /** 本站收录的艺人；流行歌手等不建档的可以为空 */
    artists: z.array(reference('artists')).default([]),
    credit: z.string(), // 展示用的完整署名
    scene: z.enum(['china', 'world']),
    /** 路人入门曲目（流行歌里的快段落等） */
    starter: z.boolean().default(false),
    year: z.number().int().optional(),
    album: z.string().optional(),
    youtube: z.string(), // 视频 ID
    youtubeChannel: z.string(), // 上传频道名
    officialUpload: z.boolean(),
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
    scene: z.enum(['china', 'world']),
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
    sources: z.array(source).default([]),
  }),
});

/** 中国区的地区场景 */
const regions = defineCollection({
  loader: file('src/data/china-regions.yaml'),
  schema: z.object({
    name: z.string(),
    en: z.string(),
    cities: z.array(z.object({ name: z.string(), geo })),
    summary: z.string(),
    body: z.string(),
    order: z.number(),
    sources: z.array(source).default([]),
  }),
});

/** 地球上的国家/场景标记（除了本站建档的人物之外，也可以列出来源里提到的名字） */
const scenes = defineCollection({
  loader: file('src/data/world-scenes.yaml'),
  schema: z.object({
    name: z.string(),
    en: z.string(),
    geo,
    summary: z.string(),
    /** 未建档但有来源提到的人 */
    mentions: z.array(z.string()).default([]),
    link: z.string().optional(),
    sources: z.array(source).min(1),
  }),
});

/** chopper cypher 的逐人测算表（来自社区，只收录艺名和作品数据） */
const cyphers = defineCollection({
  loader: file('src/data/cyphers.yaml'),
  schema: z.object({
    title: z.string(),
    host: z.string(),
    youtube: z.string(),
    note: z.string(),
    calculator: z.string(),
    window: z.enum(['burst', 'short', 'long']),
    entries: z.array(z.object({ name: z.string(), sps: z.number(), syllables: z.number(), seconds: z.number() })).min(1),
    sources: z.array(source).min(1),
  }),
});

export const collections = { artists, tracks, timeline, learn, regions, scenes, cyphers };
