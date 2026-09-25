/** 站点级配置 */
export const SITE = {
  name: 'CHOP/',
  fullName: 'CHOP/ 快嘴档案馆',
  description: 'Chopper 快嘴说唱、Chopped & Screwed 与切采样的资料库：人物、曲目、历史、速度数据，每条都附来源。',
  repo: 'https://github.com/xoqnapgf-dot/chop',
};

/**
 * 讨论区（Giscus，基于 GitHub Discussions）。
 * 开启步骤：
 * 1. 仓库 Settings → General → Features 勾选 Discussions
 * 2. 安装 https://github.com/apps/giscus 到本仓库
 * 3. 到 https://giscus.app 选择仓库，复制 repoId、categoryId 填到下面
 * 留空时页面会显示"讨论区即将开放"的占位卡片。
 */
export const GISCUS = {
  repo: 'xoqnapgf-dot/chop',
  repoId: '',
  category: 'Announcements',
  categoryId: '',
};

export const NAV = [
  { href: 'learn/', label: '百科', en: 'Learn' },
  { href: 'choppers/', label: '人物', en: 'Choppers' },
  { href: 'tracks/', label: '曲目', en: 'Tracks' },
  { href: 'timeline/', label: '时间线', en: 'Timeline' },
  { href: 'lab/', label: '实验室', en: 'Lab' },
  { href: 'community/', label: '讨论', en: 'Community' },
] as const;
