# 霧笛（むてき）— 「さよならは終わりじゃない」MV

一首离别歌的实时 MV。所有画面都由 WebGL2 在浏览器里逐帧实时渲染，不是视频文件，也不是图片轮播。画面由歌曲本身驱动：分轨能量、鼓点、贝斯的消失与回归、逐字歌词时间、人声音高。

目前画面里只有日语歌词，中文翻译之后再加。

## 打开方式

- **本地**：双击 `index.html`，点「再生」。推荐最新版 Chrome 或 Edge（需要 WebGL2）。
- **部署**：把整个 `kiriteki-mv/` 文件夹原样上传到任何静态托管即可，例如 GitHub Pages、Netlify、Vercel 或对象存储。全部使用相对路径，不需要构建。
- 首次加载约 15 MB。图像素材以 base64 打包在 `assets/packed/*.js` 里，这样用 `file://` 直接打开时，WebGL 也能读取贴图，不会被浏览器的跨域限制拦住。

## 操作

| 按键 / 控件 | 作用 |
|---|---|
| 空格 | 播放 / 暂停 |
| ← / → | 后退 / 前进 5 秒（按住 Shift 为 1 秒） |
| `,` / `.` | 暂停时逐帧后退 / 前进（1/30 秒） |
| F | 全屏 |
| H | 隐藏 / 显示控制条 |
| D | 调试信息 |
| 画质下拉框 | 4K寄り（1.5×）/ 高画質（1×，默认）/ 中画質 / 低画質 |

- 内部渲染宽度 = min(窗口宽 × 设备像素比, 1920 × 画质系数)。
- 如果检测到持续掉帧，会自动降到中画质。
- 检查用的静帧模式：`index.html?still&t=秒数&w=宽度`，会渲染指定时间点的一帧静止画面。

## 画面技术

- **2.5D 绘景**：每张背景用 Depth Anything V2 估计深度。着色器对高度场做 steep parallax 光线步进，得到真实视差和景深。
- **绘景上的效果**：深度感知的体积雾，并由画面里自动检测出的灯光照亮；灯塔光束；水面涟漪；风吹摇曳；天空流动；画面掠光。
- **程序化场景**：
  - 夜海与白天的海（高度场光线步进）。
  - 雾中穿行。
  - 雨打玻璃：每颗雨滴是一枚小鱼眼透镜，显示背后倒置的清晰景物；周围是冷凝雾，还有滑落的水痕、手指在雾上写的歌词，以及手掌擦过玻璃。
  - 素描到水彩、雨水抹去粉笔字、胶片烧穿、半调网点、双色调。
- **音乐驱动**：
  - Demucs 分离人声、鼓、贝斯和其他，得到 8 路包络和各轨起音点。
  - librosa 提取节拍（约 107.7 BPM）。
  - Whisper large-v3 逐字对齐歌词。
  - pYIN 提取人声音高。
- **文字**：歌词按演唱时间逐字出现，伴随墨水洇开和消散。标题「霧笛」和副歌用 KanjiVG 笔顺数据驱动的毛笔书写。
- **粒子**：尘、花瓣、雨、雪、灯笼（会堆叠）、火花、散景、海鸥、余烬。全部为无状态的 GPU 实例化粒子。
- **后期**：双重滤波 bloom、广义 Kuwahara 绘画滤镜、胶片颗粒、暗角、色差、光学冲击波折射、闪白和淡入淡出。
- **转场（13 种）**：硬切、淡化、雾、闪白、墨、烧穿、擦除、圈入、推拉、推移、故障、水波、漏光。

## 分镜概要

| 段落 | 时间 | 画面 |
|---|---|---|
| Intro | 0:00–0:23 | 黑暗里远处一盏灯随吉他和小提琴呼吸。五根弦调音，夜海与灯塔光束，「霧」字，穿过雾到港口，长椅 05:42，毛笔写出「霧笛」，明信片，窗。 |
| Verse 1 | 0:23–0:40 | 晨窗与花瓣；琴盒「D-28 / 1978」；坡道通往车站（320 m）；主唱的脸从暖雾中浮现。 |
| Pre-Chorus 1 | 0:40–0:57 | 雾中长椅；没发出去的「ありがとう」；水面倒影；水洼里的脚步 1-2-3-4；穿雾加速。 |
| Chorus 1 | 0:57–1:20 | 云海之上毛笔写出「さよならは / 終わりじゃない」；五弦齐振；主唱与声波涟漪；鼓点蒙太奇。 |
| Verse 2 | 1:20–1:37 | 「霧」变成「雨」；雨中操场；黑板粉笔字被雨抹去；夕阳下两个女孩；照片烧穿，露出另一张脸。 |
| Pre-Chorus 2 | 1:37–1:53 | 物件目录 No.01–07；两只手的温度从冷青变成琥珀；雨打玻璃上写字、擦玻璃，镜头推进窗内。 |
| Chorus 2 | 1:53–2:13 | 素描变成水彩；酒吧；明信片墙；城市；港口与城市分屏；贝斯弦断，屏幕显示「受信なし」「送信失敗」。 |
| Bridge | 2:13–2:34 | 没有贝斯。灯塔光束在雾中扫出歌词；72 盏灯笼升空汇入光束；黎明的水洼（视程从 5 m 到 2000 m）；「朝」。 |
| Interlude | 2:34–2:41 | 渡轮与海鸥「航路 5 h 00 m」；白天的海；夏日音乐节 ENTRY 07。 |
| Final Chorus | 2:41–3:24 | 少了贝斯手的舞台，贝斯手站在侧台逆光里。3:00.74 贝斯回归：地面冲击波、雪、火花。之后是暖色酒吧、磁带、初雪的港口、雪中漫步，镜头升空写出「歩く」。 |
| Outro | 3:24–3:31 | 雾、灯塔，「歌が終わっても、こだまは残る。」，「霧笛」。 |

## 文件结构

```
kiriteki-mv/
├─ index.html          入口
├─ css/                界面样式 + 子集化字体（data URI）
├─ js/
│  ├─ core.js          数学、缓动、音频包络、节拍、歌词、WebGL 封装
│  ├─ shaders.js       全部 GLSL（绘景视差、海、雾、雨玻璃、粒子、文字、后期等）
│  ├─ engine.js        渲染器：素材加载、绘景、精灵、粒子、文字、毛笔、动态图形层、后期
│  ├─ director.js      镜头调度、转场、HUD、镜头工具函数
│  ├─ shots.js         分镜脚本（约 90 个镜头，按秒对齐歌曲）
│  ├─ main.js          启动、播放器、按键、静帧模式
│  └─ data.js meta.js manifest.js kanjivg.js lineart.js pitch.js
│                      生成的数据（音频分析、灯光位置、素材清单、笔顺、线稿、音高）
├─ assets/packed/      运行时用的图像（base64 JS）
├─ assets/src/         可编辑的原始图（webp / png / svg）
├─ audio/song.m4a      歌曲
├─ tools/              素材与音频分析管线（Python，只在重新生成素材时需要）
└─ licenses/           字体与 KanjiVG 许可证
```

## 制作管线（`tools/`）

播放 MV 不需要这些脚本。只有重新生成素材时才用得到。脚本最初在临时工作目录里运行，路径通过环境变量 `MV_AUDIO`、`MV_IMAGES` 指定。

| 脚本 | 作用 |
|---|---|
| `pipeline/gen.py` + `pipeline/batch.py` | 通过中转站调用 gpt-image-2.5（sunburst，quality low）生成背景图。全部提示词在 `pipeline/prompts/`。密钥只从环境变量 `IMG_API_BASE` 和 `IMG_API_KEY` 读取，不写进仓库。 |
| `pipeline/esrgan.py` | Real-ESRGAN anime 6B 放大（自写 RRDBNet 推理，不依赖 torchvision） |
| `pipeline/depth.py` | Depth Anything V2 Small 深度估计 |
| `pipeline/seg.py` | 角色抠图（anime-segmentation ISNet） |
| `pipeline/lineart.py` | 线稿提取，用于素描到水彩的镜头 |
| `pipeline/whisper.py`、`whisper2.py`、`align.py` | 歌词逐字对齐 |
| `pipeline/export_audio.py` | 分轨包络、起音点、节拍，输出到 `js/data.js` |
| `pipeline/pitch.py` | 人声音高 |
| `prep_assets.py` | 打包素材，输出 `assets/packed/`、`js/meta.js` 等，并把字体子集改名后写入 `css/fonts.css` |

## 署名与授权

- **歌曲、歌词、角色设定**：归原作者所有。
- **背景图**：由 gpt-image-2.5 生成，再经 Real-ESRGAN 放大。
- **字体**：均为 SIL Open Font License 1.1，已子集化并改名为 KM Mincho / KM MinchoB / KM Brush / KM Hand / KM Mono。许可证全文见 `licenses/`。
  - 明朝：Shippori Mincho B1
  - 毛笔：Yuji Syuku
  - 手写：Klee One
  - 等宽：IBM Plex Mono
- **笔顺数据**：KanjiVG © Ulrich Apel，CC BY-SA 3.0。`js/kanjivg.js` 是它的衍生数据，同样以 CC BY-SA 3.0 提供。
- **处理工具**（只在制作时使用，不随包分发）：
  - Depth Anything V2 Small（Apache-2.0）
  - Real-ESRGAN（BSD-3-Clause）
  - anime-segmentation ISNet（Apache-2.0）
  - Demucs（MIT；只用来分析，分离出的音轨不随包分发）
  - Whisper / faster-whisper（MIT）
  - librosa（ISC）
