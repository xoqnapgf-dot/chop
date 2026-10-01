import type { APIRoute } from 'astro';
import { SITE } from '@/lib/site';
import { url } from '@/lib/url';

/** 网页应用清单：让手机能"添加到主屏幕"。路径全部带 base，两种部署（/chop/ 与根目录）都适用 */
export const GET: APIRoute = () =>
  new Response(
    JSON.stringify({
      name: SITE.fullName,
      short_name: 'CHOP/',
      description: SITE.description,
      lang: 'zh-CN',
      start_url: url(''),
      scope: url(''),
      display: 'standalone',
      background_color: '#0a0807',
      theme_color: '#0a0807',
      icons: [
        { src: url('icons/icon-192.png'), sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: url('icons/icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: url('icons/icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    }),
    { headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' } },
  );
