export const COUNTRY: Record<string, { name: string; flag: string }> = {
  US: { name: '美国', flag: '🇺🇸' },
  KR: { name: '韩国', flag: '🇰🇷' },
  TR: { name: '土耳其', flag: '🇹🇷' },
  CN: { name: '中国', flag: '🇨🇳' },
  DK: { name: '丹麦', flag: '🇩🇰' },
  DE: { name: '德国', flag: '🇩🇪' },
  PH: { name: '菲律宾', flag: '🇵🇭' },
  JP: { name: '日本', flag: '🇯🇵' },
  OTHER: { name: '其他', flag: '🌐' },
};

export const LANE = {
  chopper: { name: 'Chopper 快嘴', short: '快嘴', color: 'var(--lane-chopper)' },
  screw: { name: 'Chopped & Screwed', short: 'C&S', color: 'var(--lane-screw)' },
  sample: { name: 'Sample Chop 切采样', short: '切采样', color: 'var(--lane-sample)' },
  general: { name: '综合', short: '综合', color: 'var(--ink-3)' },
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
