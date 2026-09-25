// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// GitHub Pages：https://<user>.github.io/<repo>/
// 如果以后绑定自定义域名，把 site 改成域名、base 改成 '/'。
export default defineConfig({
  site: 'https://xoqnapgf-dot.github.io',
  base: '/chop',
  trailingSlash: 'ignore',
  integrations: [sitemap()],
  vite: { plugins: [tailwindcss()] },
  image: { layout: 'constrained' },
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
});
