/** 站点级配置 */
export const SITE = {
  name: 'CHOP/',
  fullName: 'CHOP/ 快嘴档案馆',
  description: '快速说唱资料库：中国快嘴专区与世界 chopper 地图，人物、曲目、历史、语速数据，每条都附来源。',
};

export const NAV = [
  { href: 'china/', label: '中国区', en: 'China' },
  { href: 'world/', label: '世界', en: 'World' },
  { href: 'choppers/', label: '人物', en: 'People' },
  { href: 'tracks/', label: '曲目', en: 'Tracks' },
  { href: 'timeline/', label: '时间线', en: 'Timeline' },
  { href: 'learn/', label: '百科', en: 'Learn' },
  { href: 'lab/', label: '实验室', en: 'Lab' },
] as const;
