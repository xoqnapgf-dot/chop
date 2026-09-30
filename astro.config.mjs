// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { satteri } from '@astrojs/markdown-satteri';
import { tableWrap } from './src/lib/rehype-table-wrap.mjs';

// 默认是 GitHub Pages：https://<user>.github.io/chop/
// 部署到别的托管（域名根目录）时用环境变量覆盖：
//   SITE_URL=https://你的域名 BASE_PATH=/ npm run build
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://xoqnapgf-dot.github.io',
  base: process.env.BASE_PATH ?? '/chop',
  trailingSlash: 'ignore',
  integrations: [sitemap()],
  vite: { plugins: [tailwindcss()] },
  markdown: { processor: satteri({ hastPlugins: [tableWrap] }) },
  image: { layout: 'constrained' },
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
});
