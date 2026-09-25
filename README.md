# CHOP/ 快嘴档案馆

Chopper 快嘴说唱、Chopped & Screwed、Sample Chop 切采样的资料网站：人物、曲目、时间线、速度数据，每条资料都附来源和可信度标签。

纯静态站点：Astro 7 + Tailwind CSS 4，部署在 GitHub Pages。

## 本地运行

```bash
npm install
npm run dev        # 开发模式 http://localhost:4321/chop/
npm run build      # 构建到 dist/，并生成站内搜索索引
npm run preview    # 预览构建结果（搜索只在这里可用）
npm run check      # 类型和数据格式检查
```

## 目录

```
src/
  content/artists/*.md   人物档案（frontmatter 是结构化资料，正文是简介）
  content/learn/*.md     百科文章
  data/tracks.yaml       曲目库
  data/timeline.yaml     时间线
  data/media.json        图片来源记录（脚本自动生成）
  assets/artists/<slug>/ 人物图片：avatar / banner / portrait / photo
  assets/tracks/         视频缩略图
  content.config.ts      所有数据的格式定义（写错字段会在构建时报错）
scripts/fetch-youtube.mjs  从 YouTube 抓取人物图片和视频缩略图
```

## 新增一位人物

1. 在 `src/content/artists/` 新建 `<slug>.md`，照着已有文件填写。必填：`name`、`tagline`、`country`、`city`、`region`、`activeSince`、`lane`、`sources`。
2. 在 `youtube.channelId` 填官方频道 ID（频道页网址里 `UC` 开头的那串）。
3. 运行 `npm run fetch:yt`，自动下载头像、横幅，并计算主色调。
4. 如果频道头像不是本人照片（比如是专辑宣传图）：
   - 在 frontmatter 加 `portrait: { video: <视频ID>, focusX: 0.5 }`，用官方视频截图当人物照（`focusX` 是人脸的水平位置，0 到 1）；
   - 或者直接把图片放到 `src/assets/artists/<slug>/photo.jpg`，它的优先级最高。
5. 频道横幅只是文字宣传图时，加 `useBanner: false`。

图片优先级：`photo.*` > `portrait.jpg` > `avatar.jpg`。

## 可信度标签

| 标签 | 含义 |
|---|---|
| `verified` 已证实 | 有权威或多个独立来源，数字可以复算 |
| `disputed` 有争议 | 来源互相矛盾，或口径不清 |
| `pending` 待核实 | 只有单一来源，或来源可信度一般 |
| `debunked` 已辟谣 | 已被证明错误 |

## 部署

1. 仓库 Settings → Pages → Source 选 **GitHub Actions**。
2. 推送到 `main` 分支会自动构建并部署到 `https://xoqnapgf-dot.github.io/chop/`。

绑定自定义域名时，改 `astro.config.mjs` 里的 `site`，并把 `base` 改成 `'/'`。
