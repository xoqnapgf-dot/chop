# CHOP/ 快嘴档案馆

Chopper 快嘴说唱、Chopped & Screwed、Sample Chop 切采样的资料网站：人物、曲目、时间线、速度数据，每条资料都附来源和可信度标签。

纯静态站点：Astro 7 + Tailwind CSS 4，部署在 GitHub Pages。

> ⚠️ **`chop-promo/` 是站点的宣传片项目，请勿删除。** 它和站点源码互相独立（站点构建不读它），双击里面的 `index.html` 就能播放。说明见 [chop-promo/README.md](./chop-promo/README.md)。

## 本地运行

```bash
npm install
npm run dev        # 开发模式 http://localhost:4321/chop/
npm run build      # 构建到 dist/，并生成站内搜索索引
npm run preview    # 预览构建结果（搜索只在这里可用）
npm run check      # YAML 截断检查 + 类型和数据格式检查
npm run build:globe  # 重新生成地球的陆地点（一般不需要）
```

## 目录

```
src/
  content/artists/*.md   人物档案（frontmatter 是结构化资料，正文是简介）
  content/learn/*.md     百科文章
  data/tracks.yaml       曲目库（scene: china / world；starter: 路人入门）
  data/timeline.yaml     时间线（scene: china / world）
  data/china-regions.yaml 中国区的地区场景（人物按 region 字段归组）
  data/world-scenes.yaml  地球上的国家标记
  data/globe-land.json   地球陆地点（scripts/build-globe.mjs 生成，只有陆地、没有国界）
  data/media.json        图片来源记录（脚本自动生成）
  assets/artists/<slug>/ 人物图片：avatar / banner / portrait / photo
  assets/tracks/         视频缩略图
  content.config.ts      所有数据的格式定义（写错字段会在构建时报错）
scripts/fetch-youtube.mjs  从 YouTube 抓取人物图片和视频缩略图
```

## 风格标签（快 ≠ Chopper）

每个人物必须填 `style` 和 `styleNote`（为什么这么标）：

| style | 含义 |
|---|---|
| `chopper` | 有来源称其为 chopper，或长期整首使用 chopping 技巧 |
| `fast` | 快嘴：以语速、咬字清晰度为主要标签 |
| `track` | 快歌：因个别快歌或快段落出圈，本人不以快著称 |

没有可靠来源时，不要标 `chopper`。

## 新增一位人物

1. 在 `src/content/artists/` 新建 `<slug>.md`，照着已有文件填写。必填：`name`、`tagline`、`country`、`city`、`region`、`style`、`styleNote`、`sources`。中国区人物的 `region` 要和 `china-regions.yaml` 里的地区名一致；填 `geo: [纬度, 经度]` 会在地球上显示城市点。
   - YAML 单行值里如果有 ` #`（比如 `Speed #1`），必须加引号，否则会被当成注释截断，`npm run check` 会报错。
2. 在 `youtube.channelId` 填官方频道 ID（频道页网址里 `UC` 开头的那串）。
3. 运行 `npm run fetch:yt`，自动下载头像、横幅，并计算主色调。
4. 如果频道头像不是本人照片（比如是专辑宣传图）：
   - 在 frontmatter 加 `portrait: { video: <视频ID>, focusX: 0.5 }`，用官方视频截图当人物照（`focusX` 是人脸的水平位置，0 到 1）；
   - 或者直接把图片放到 `src/assets/artists/<slug>/photo.jpg`，它的优先级最高。
5. 频道横幅只是文字宣传图时，加 `useBanner: false`。
6. 找不到可靠照片就不放：页面会自动用名字生成文字头像。

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

### 部署到其他托管（需要 index.html 的静态文件）

同一份源码有两种产物：

| 产物 | 路径前缀 | 用途 |
|---|---|---|
| `dist/`（默认） | `/chop/` | GitHub Pages |
| 根目录版本 | `/` | 传到别的托管的网站根目录 |

- **不用自己构建**：推送到 `main` 后，GitHub 会自动把根目录版本放进 `site` 分支，在 GitHub 打开该分支 → Code → Download ZIP，解压后里面就是 `index.html`，整体上传即可。
- **自己构建**：`npm run build:root`（可加参数 `-- https://你的域名`），生成 `site-root/`。
- 想让自动构建的版本用自己的域名：仓库 Settings → Secrets and variables → Actions → Variables，新建 `SITE_URL`。
- 也可以直接用环境变量：`SITE_URL=https://你的域名 BASE_PATH=/ npm run build`。

详细步骤见 [部署说明.md](./部署说明.md)。
