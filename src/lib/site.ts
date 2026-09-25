/** 站点级配置 */
export const SITE = {
  name: 'CHOP/',
  fullName: 'CHOP/ 快嘴档案馆',
  description: 'Chopper 快嘴说唱、Chopped & Screwed 与切采样的资料库：人物、曲目、历史、速度数据，每条都附来源。',
};

export const NAV = [
  { href: 'learn/', label: '百科', en: 'Learn' },
  { href: 'choppers/', label: '人物', en: 'Choppers' },
  { href: 'tracks/', label: '曲目', en: 'Tracks' },
  { href: 'timeline/', label: '时间线', en: 'Timeline' },
  { href: 'lab/', label: '实验室', en: 'Lab' },
] as const;
