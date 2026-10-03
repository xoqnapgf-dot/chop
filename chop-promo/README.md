# CHOP/ 宣传片（chop-promo）

> ⚠️ **请勿删除这个文件夹。** 这是 CHOP/ 快嘴档案馆的宣传片项目，和站点源码互相独立：站点构建不会读它，删掉也不会让站点出错，但片子就没了。整理仓库、重构站点时请保留 `chop-promo/` 整个文件夹。

一部 3 分 13 秒的宣传短片，用网页代码写成：打开 `index.html` 就能播放，画面跟着音乐逐拍走。不需要安装任何东西，也不需要联网。

## 怎么看

- **本地**：双击 `index.html`（Chrome、Edge、Firefox、Safari 都可以），点"播放宣传片"。
- **放到网上**：把整个 `chop-promo/` 文件夹上传到任意静态托管（GitHub Pages、Netlify、Vercel、虚拟主机……），访问里面的 `index.html`。所有路径都是相对路径。
- **导出成视频**：全屏（F）后用 OBS 或系统录屏录下来；按 H 可以隐藏 HUD 和播放条。网址后加 `?clean=1` 直接隐藏界面。

| 按键 | 作用 |
|---|---|
| 空格 | 播放 / 暂停 |
| ← → | 后退 / 前进 5 秒（按住 Shift 是 1 秒） |
| , . | 逐帧后退 / 前进 |
| 1–9 | 跳到第 1–9 章 |
| F | 全屏 |
| H | 隐藏 / 显示界面 |

网址参数：`?t=95` 从第 95 秒开始；`?autoplay=1` 加载完自动播放；`?render=1` 逐帧渲染模式（给无头浏览器截帧，提供 `window.renderFrame(t)`）。

## 片子讲了什么

音乐是 Tech N9ne 的《Worldwide Choppers》（2011）剪辑版，就是站点曲目库里的 `worldwide-choppers`。原曲每一段前面都有女声报所在地（Turkey、Chicago、Kansas、California……），片子的章节就跟着这些地名走。

| 时间 | 章节 | 内容 |
|---|---|---|
| 0:00 | 开场 | 一秒钟，能塞进多少个音节？3 → 6 → 10.87 → 15.4 → 21 |
| 0:07 | 土耳其 | 点阵地球亮起，飞到伊斯坦布尔；Ceza 第一个出场 |
| 0:14 | 中西部 → 世界 | 从堪萨斯城射向 23 个国家的弧线；"CHOP/" 字标 |
| 0:29 | 把音节剁碎 | 主歌爆发：首页标题、站点首页、快 ≠ Chop、两个层次、chop 的四个特点 |
| 0:44 | 人物 | 78 位人物的 3D 墙，8 张脸每拍一切 |
| 0:55 | 测速 | SPS、1 秒爆发榜（只取"已证实"）、一条算式、测速规则 |
| 1:14 | 时间线 | 1980 → 2026，每拍飞过一件事 |
| 1:28 | 曲目 | 101 首曲目的缩略图墙，主打曲卡片 |
| 1:42 | 芝加哥 1992 | Twista 吉尼斯纪录：计数器按 10.87 音节/秒真实速度跳；速度阶梯 |
| 1:56 | 中国区 | 地球转向中国，六个地区，23 位中文快嘴 |
| 2:13 | 世界地图 | 合作连线、站点世界页、21 个系列企划 |
| 2:27 | SPS kid | Chopper ≠ SPS kid；标出来的数字 vs 听众数出来的 |
| 2:42 | 来源 | 四种可信度标签、542 条独立来源、每个数字都能复算 |
| 2:56 | 收尾 | 七个栏目一小节一个，落版 |

所有人物、数字、文案都来自站点源码（`src/content`、`src/data`），由 `tools/build-data.py` 生成；画面里的站点截图来自站点本身。HUD 左下角的"音节 / 秒"是按歌词行粗略估算的，标了"估算"，不是测速数据。

## 文件

```
chop-promo/
  index.html                入口
  css/film.css              播放器、HUD、通用样式（颜色和站点深色主题一致）
  css/scenes.css            各场景样式
  js/core.js                时钟（以音频时间为准）、舞台缩放、胶片颗粒、HUD、播放控制
  js/gl.js                  WebGL：点阵地球、弧线、星尘、光速线（three.js r128）
  js/scenes.js              分镜：所有场景都挂在一条 GSAP 时间线上，剪辑点落在 130 BPM 节拍网格
  js/main.js                启动、加载、网址参数
  js/lib/                   three.min.js、gsap.min.js（本地副本，不走 CDN）
  js/data/site.js           站点数据（生成）
  js/data/audio.js          音频分析：节拍、能量包络、估算语速（生成）
  js/data/globe.js          地球陆地点（生成）
  assets/audio/             配乐剪辑版
  assets/img/               人物方图、横幅、曲目缩略图、站点截图
  assets/fonts/             Unbounded、Space Grotesk、JetBrains Mono、思源黑体/宋体（子集）
  tools/                    重新生成数据的脚本
```

## 站点内容更新后怎么同步

```bash
python3 chop-promo/tools/build-data.py          # 人物、曲目、时间线、统计数字、图片
npm install && node chop-promo/tools/build-globe.mjs   # 地球陆地点（一般不需要）
python3 chop-promo/tools/subset-fonts.py NotoSansSC[wght].ttf   # 改了文案、出现新汉字时
```

配乐怎么剪、怎么分析见 `tools/analyze-audio.py` 开头的说明。站点截图是对 `npm run preview` 的页面用 Playwright 截的 1440 宽整页图，放在 `assets/img/site/`。

## 版权说明

配乐《Worldwide Choppers》版权归 Tech N9ne / Strange Music 所有；人物图片来自各自的官方频道（站点 `src/data/media.json` 有来源记录）。本片为非商业的爱好者展示。字体均为 SIL Open Font License；three.js 为 MIT 许可；GSAP 为 GreenSock 标准许可（免费使用）。
