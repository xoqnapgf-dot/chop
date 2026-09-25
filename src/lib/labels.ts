export const COUNTRY: Record<string, { name: string }> = {
  US: { name: '美国' },
  KR: { name: '韩国' },
  TR: { name: '土耳其' },
  CN: { name: '中国' },
  PH: { name: '菲律宾' },
};

/** 风格标签：快 ≠ Chopper */
export const STYLE = {
  chopper: { name: 'Chopper', short: 'Chopper', color: 'var(--style-chopper)', desc: '有来源称其为 chopper，或长期整首使用 chopping 技巧' },
  fast: { name: '快嘴', short: '快嘴', color: 'var(--style-fast)', desc: '以语速、咬字清晰度为主要标签' },
  track: { name: '快歌', short: '快歌', color: 'var(--style-track)', desc: '因个别快歌或快段落出圈，本人不以快著称' },
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

export const UNIT = {
  'syl/s': '音节/秒',
  'char/s': '字/秒',
  'word/s': '词/秒',
} as const;

/** 展示用名字：中文艺人用中文名，其他用艺名 */
export function displayName(a: { name: string; nameZh?: string; country: string }): string {
  return a.country === 'CN' && a.nameZh ? a.nameZh : a.name;
}
