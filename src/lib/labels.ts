export const COUNTRY: Record<string, { name: string }> = {
  US: { name: '美国' },
  KR: { name: '韩国' },
  TR: { name: '土耳其' },
  CN: { name: '中国' },
  PH: { name: '菲律宾' },
  GE: { name: '格鲁吉亚' },
  MX: { name: '墨西哥' },
  AU: { name: '澳大利亚' },
  CA: { name: '加拿大' },
  GB: { name: '英国' },
};

/**
 * 风格层级（快 ≠ Chop）：chop 是风格，chopper 是唱 chop 的人。
 * name = 贴在人物上的标签；level = 讲"三个层次"时用的风格名
 */
export const STYLE = {
  chopper: { name: 'Chopper', level: 'Chop', short: 'Chopper', color: 'var(--style-chopper)', desc: '长期、整首地唱 chop；有可靠来源称其为 chopper' },
  fast: { name: '快嘴', level: '快嘴', short: '快嘴', color: 'var(--style-fast)', desc: '以语速、咬字清晰度为主要标签' },
  track: { name: '快歌', level: '快歌', short: '快歌', color: 'var(--style-track)', desc: '因个别快歌或快段落出圈，本人不以快著称' },
} as const;
export type Style = keyof typeof STYLE;

export const SCENE = {
  china: { name: '中国区', color: 'var(--scene-china)' },
  world: { name: '世界', color: 'var(--scene-world)' },
} as const;

export type Confidence = 'verified' | 'disputed' | 'pending' | 'debunked';
export const CONFIDENCE: Record<Confidence, { label: string; icon: string; color: string; desc: string }> = {
  verified: { label: '已证实', icon: '✓', color: 'var(--good)', desc: '有权威或多个独立来源，数字可复算' },
  disputed: { label: '有争议', icon: '!', color: 'var(--warning)', desc: '来源互相矛盾或口径不清' },
  pending: { label: '待核实', icon: '?', color: 'var(--neutral)', desc: '只有单一来源或来源可信度一般' },
  debunked: { label: '已辟谣', icon: '×', color: 'var(--critical)', desc: '已被证明错误' },
};

export const SPEED_KIND = {
  official: '官方认证',
  measured: '第三方测算',
  claimed: '说法/传闻',
} as const;

export const WINDOW = {
  burst: { name: '爆发', desc: '约 0.7–2 秒内的峰值，SPS 社区常用口径；满 1 秒含金量最高', order: 1 },
  short: { name: '短段', desc: '3–15 秒的一段', order: 2 },
  long: { name: '整段平均', desc: '15 秒以上的整段主歌或整段表演', order: 3 },
  unknown: { name: '口径不明', desc: '来源没说测了多长', order: 4 },
} as const;
export type SpeedWindow = keyof typeof WINDOW;

export const UNIT = {
  'syl/s': '音节/秒',
  'char/s': '字/秒',
  'word/s': '词/秒',
} as const;

/** 展示用名字：中文艺人用中文名，其他用艺名 */
/** 所在地统一写法：中国区"省 城市"，其他"国家 州/省 城市"；没有可靠来源的写"所在地未公开"（国外的至少写国家） */
export function placeLabel(a: { country: string; city: string }): string {
  const known = a.city !== '未公开';
  if (a.country === 'CN') return known ? a.city : '所在地未公开';
  const c = COUNTRY[a.country].name;
  return known && a.city !== c ? `${c} ${a.city}` : c;
}

export function displayName(a: { name: string; nameZh?: string; country: string }): string {
  return a.country === 'CN' && a.nameZh ? a.nameZh : a.name;
}
