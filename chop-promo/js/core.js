/* =====================================================================
 * CHOP/ 宣传片 · 核心
 * 时间轴的唯一真相是音频时间：每一帧都把 GSAP 主时间线 seek 到当前时间，
 * 所以暂停、拖动、跳章节时画面都和音乐对齐；也能按任意时间逐帧渲染。
 * ===================================================================== */
(function () {
  'use strict';

  const W = 1920, H = 1080;
  const A = window.AUDIO;
  const S = window.SITE;
  const params = new URLSearchParams(location.search);

  /* ---------- 节拍网格：130 BPM，三段拼接后仍是同一张网格 ---------- */
  const T0 = A.grid.t0, BEAT = A.grid.beat, BARLEN = BEAT * 4;
  /** 第 n 小节第 b 拍（可为小数）的时间 */
  const BAR = (n, b = 0) => T0 + BARLEN * n + BEAT * b;

  /* ---------- 音频包络取样（50 fps，线性插值，返回 0–1） ---------- */
  function env(name, t) {
    const arr = A[name];
    const x = t * A.fps;
    const i = Math.floor(x);
    if (i < 0 || i >= arr.length - 1) return 0;
    const f = x - i;
    return (arr[i] * (1 - f) + arr[i + 1] * f) / 99;
  }
  /** 带衰减的峰值：过去 win 秒内的最大值按指数衰减，适合做"打击"脉冲 */
  function hit(name, t, decay = 0.18, win = 0.4) {
    const arr = A[name];
    let best = 0;
    const i1 = Math.floor(t * A.fps);
    const i0 = Math.max(0, i1 - Math.floor(win * A.fps));
    for (let i = i0; i <= i1 && i < arr.length; i++) {
      const age = t - i / A.fps;
      const v = (arr[i] / 99) * Math.exp(-age / decay);
      if (v > best) best = v;
    }
    return best;
  }
  function spsAt(t) {
    const x = t * 10, i = Math.floor(x);
    if (i < 0 || i >= A.sps.length - 1) return 0;
    return A.sps[i] * (1 - (x - i)) + A.sps[i + 1] * (x - i);
  }
  /** 节拍相位：距离上一拍的秒数、拍号 */
  function beatInfo(t) {
    const k = Math.floor((t - T0) / BEAT);
    return { k, bar: Math.floor(k / 4), beat: ((k % 4) + 4) % 4, since: t - (T0 + k * BEAT) };
  }

  /* ---------- 确定性的伪随机（同一个种子永远同一个值） ---------- */
  function rand(seed) {
    let s = (seed * 9301 + 49297) % 233280;
    s = Math.sin(s * 12.9898) * 43758.5453;
    return s - Math.floor(s);
  }
  function noise1(x) {
    const i = Math.floor(x), f = x - i;
    const u = f * f * (3 - 2 * f);
    return (rand(i) * (1 - u) + rand(i + 1) * u) * 2 - 1;
  }

  /* ---------- DOM 小工具 ---------- */
  function el(tag, cls, html, parent) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }
  function css(e, o) { Object.assign(e.style, o); return e; }
  /** 拆字：返回每个字的 span（空格保留） */
  function splitChars(e) {
    const text = e.textContent;
    e.textContent = '';
    return [...text].map((c) => {
      const s = el('span', 'ch', c === ' ' ? '&nbsp;' : c, e);
      return s;
    });
  }
  function splitWords(e) {
    const words = e.textContent.split(/(\s+)/);
    e.textContent = '';
    return words.filter((w) => w.length).map((w) => (/^\s+$/.test(w) ? (e.appendChild(document.createTextNode(' ')), null) : el('span', 'wd', w, e))).filter(Boolean);
  }
  /**
   * "剁碎"文字：同一段文字叠 n 层，每层用 clip-path 只露出一条横带。
   * 返回切片数组，动画里分别推 x，就像被刀横着剁开。
   */
  function chopText(e, n = 7) {
    const html = e.innerHTML;
    e.innerHTML = '';
    e.classList.add('chop');
    el('span', 'ghost', html, e);
    const slices = [];
    for (let i = 0; i < n; i++) {
      const s = el('span', 'slice', html, e);
      const a = (i / n) * 100, b = ((i + 1) / n) * 100;
      s.style.clipPath = `inset(${a}% -20% ${100 - b}% -20%)`;
      s.style.webkitClipPath = s.style.clipPath;
      slices.push(s);
    }
    return slices;
  }

  /* ---------- 图片：统一登记、预加载 ---------- */
  const imgs = new Set();
  function img(src, cls, parent) {
    const i = el('img', cls, null, parent);
    i.decoding = 'async';
    i.alt = '';
    i.draggable = false;
    i.src = src;
    imgs.add(src);
    return i;
  }
  function preloadAll(onProgress) {
    const list = [...imgs];
    let done = 0;
    return Promise.all(
      list.map((src) => new Promise((res) => {
        const i = new Image();
        const fin = () => { done++; onProgress(done / list.length); res(); };
        i.onload = () => (i.decode ? i.decode().catch(() => {}).then(fin) : fin());
        i.onerror = fin;
        i.src = src;
      })),
    );
  }

  /* ---------- 主时间线与场景注册 ---------- */
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } });
  const chapters = [];
  const scenesRoot = document.getElementById('scenes');

  /** 注册一个场景：在 [start, end) 内可见，build(root, tl) 往主时间线里加动画 */
  function scene(id, start, end, build) {
    const root = el('section', 'scene', null, scenesRoot);
    root.id = 's-' + id;
    tl.set(root, { autoAlpha: 1 }, start);
    tl.set(root, { autoAlpha: 0 }, end);
    build(root, start, end);
    return root;
  }
  function chapter(no, name, t, label) { chapters.push({ no, name, t, label: label || name }); }

  /* ---------- 摄像机（整块舞台的 2D 运镜）+ 程序化抖动 ---------- */
  const CAM = { x: 0, y: 0, s: 1, r: 0, blur: 0, shake: 0, kickZoom: 0, rgb: 0, bright: 1, sat: 1 };
  const FXP = { grain: 0.07, vignette: 0.55, leak: 0, scan: 0.0, lb: 0, hud: 0 };

  /** 快捷：在 t 处来一下"推镜冲击" */
  function punch(t, amt = 0.06, dur = 0.5) {
    tl.fromTo(CAM, { s: 1 + amt }, { s: 1, duration: dur, ease: 'expo.out', immediateRender: false }, t);
  }
  function flash(t, a = 0.85, dur = 0.45) {
    tl.fromTo('#flash', { opacity: a }, { opacity: 0, duration: dur, ease: 'power2.out', immediateRender: false }, t);
  }
  function blurWhip(t, amt = 14, dur = 0.35) {
    tl.fromTo(CAM, { blur: amt }, { blur: 0, duration: dur, ease: 'power2.out', immediateRender: false }, t);
  }

  /* ---------- 舞台缩放 ---------- */
  const stage = document.getElementById('stage');
  const camEl = document.getElementById('cam');
  let stageScale = 1;
  function fit() {
    const vw = window.innerWidth, vh = window.innerHeight;
    stageScale = Math.min(vw / W, vh / H);
    stage.style.transform = `scale(${stageScale}) translate(-50%, -50%)`;
    stage.style.left = '50%';
    stage.style.top = '50%';
    stage.style.transformOrigin = '0 0';
    stage.style.transform = `translate(-50%, -50%) scale(${stageScale})`;
    stage.style.transformOrigin = '50% 50%';
    if (window.GL) window.GL.resize(stageScale);
  }

  /* ---------- 胶片层：颗粒、扫描线、暗角、漏光 ---------- */
  const fx = document.getElementById('fx');
  const fctx = fx.getContext('2d');
  fx.width = W / 2; fx.height = H / 2; // 半分辨率足够，放大后颗粒更像胶片
  const grainTiles = [];
  (function makeGrain() {
    for (let k = 0; k < 6; k++) {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 256;
      const g = c.getContext('2d');
      const d = g.createImageData(256, 256);
      for (let i = 0; i < d.data.length; i += 4) {
        const v = Math.floor(rand(i * 7 + k * 99991) * 255);
        d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
        d.data[i + 3] = 255;
      }
      g.putImageData(d, 0, 0);
      grainTiles.push(c);
    }
  })();
  function drawFx(t) {
    const w = fx.width, h = fx.height;
    fctx.clearRect(0, 0, w, h);
    // 漏光：两团暖色光斑缓慢游走
    if (FXP.leak > 0.001) {
      fctx.globalCompositeOperation = 'source-over';
      const lx = w * (0.5 + 0.45 * noise1(t * 0.13 + 3)), ly = h * (0.5 + 0.4 * noise1(t * 0.11 + 9));
      let g = fctx.createRadialGradient(lx, ly, 0, lx, ly, w * 0.6);
      g.addColorStop(0, `rgba(255,150,60,${0.22 * FXP.leak})`);
      g.addColorStop(1, 'rgba(255,120,40,0)');
      fctx.fillStyle = g; fctx.fillRect(0, 0, w, h);
      const mx = w * (0.5 + 0.5 * noise1(t * 0.09 + 21)), my = h * (0.5 + 0.5 * noise1(t * 0.07 + 33));
      g = fctx.createRadialGradient(mx, my, 0, mx, my, w * 0.45);
      g.addColorStop(0, `rgba(255,70,50,${0.14 * FXP.leak})`);
      g.addColorStop(1, 'rgba(255,60,40,0)');
      fctx.fillStyle = g; fctx.fillRect(0, 0, w, h);
    }
    // 颗粒
    if (FXP.grain > 0.001) {
      const tile = grainTiles[Math.floor(t * 24) % grainTiles.length];
      fctx.globalAlpha = FXP.grain;
      const ox = Math.floor(rand(Math.floor(t * 24)) * 256), oy = Math.floor(rand(Math.floor(t * 24) + 7) * 256);
      for (let x = -ox; x < w; x += 256) for (let y = -oy; y < h; y += 256) fctx.drawImage(tile, x, y);
      fctx.globalAlpha = 1;
    }
    // 扫描线
    if (FXP.scan > 0.001) {
      fctx.fillStyle = `rgba(0,0,0,${FXP.scan})`;
      for (let y = 0; y < h; y += 3) fctx.fillRect(0, y, w, 1);
    }
  }
  // 暗角用 CSS 叠层（multiply 在 fx 的 screen 混合里做不了）
  const vig = el('div', 'grain-vignette', null, stage);
  vig.style.zIndex = 30;

  /* ---------- HUD ---------- */
  const hud = document.getElementById('hud');
  const hudTc = document.getElementById('hud-tc');
  const hudBar = document.getElementById('hud-bar');
  const hudNo = document.getElementById('hud-no');
  const hudName = document.getElementById('hud-name');
  const spsV = document.getElementById('sps-v');
  const spsFill = document.getElementById('sps-fill');
  const hudBars = [...document.querySelectorAll('.hud-logo .bars i')];
  const lbBars = [...document.querySelectorAll('#letterbox i')];
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  function drawHud(t) {
    hud.style.opacity = FXP.hud;
    if (FXP.hud < 0.01) return;
    const f = Math.floor((t % 1) * 24);
    hudTc.textContent = `${pad(Math.floor(t / 60))}:${pad(Math.floor(t % 60))}:${pad(f)}`;
    const bi = beatInfo(t);
    hudBar.textContent = t < T0 ? 'BAR -- · -' : `BAR ${pad(bi.bar + 1, 3)} · ${bi.beat + 1}`;
    let ch = chapters[0];
    for (const c of chapters) if (t >= c.t) ch = c;
    if (ch) { hudNo.textContent = pad(ch.no); hudName.textContent = ch.name; }
    const sps = spsAt(t);
    spsV.textContent = sps.toFixed(1);
    spsFill.style.width = Math.min(100, (sps / 25) * 100) + '%';
    const lv = [env('low', t), env('mid', t), env('rms', t), env('mid', t - 0.05), env('high', t)];
    hudBars.forEach((b, i) => (b.style.transform = `scaleY(${0.25 + lv[i] * 0.85})`));
  }

  /* ---------- 每帧渲染 ---------- */
  let lastT = -1;
  const frameHooks = [];
  function onFrame(fn) { frameHooks.push(fn); }
  function render(t) {
    tl.seek(t, false);
    // 运镜：时间线给的基础值 + 底鼓带来的轻微抖动和冲击
    const kick = hit('kick', t, 0.12, 0.3);
    const sh = CAM.shake;
    const jx = sh * 14 * noise1(t * 23.0) + sh * kick * 10 * noise1(t * 61 + 5);
    const jy = sh * 10 * noise1(t * 19.0 + 40) + sh * kick * 8 * noise1(t * 53 + 9);
    const s = CAM.s * (1 + CAM.kickZoom * kick * 0.035);
    camEl.style.transform = `translate3d(${CAM.x + jx}px, ${CAM.y + jy}px, 0) scale(${s}) rotate(${CAM.r}deg)`;
    const filters = [];
    if (CAM.blur > 0.05) filters.push(`blur(${CAM.blur.toFixed(2)}px)`);
    if (Math.abs(CAM.bright - 1) > 0.01) filters.push(`brightness(${CAM.bright.toFixed(3)})`);
    if (Math.abs(CAM.sat - 1) > 0.01) filters.push(`saturate(${CAM.sat.toFixed(3)})`);
    if (CAM.rgb > 0.05) {
      const o = (CAM.rgb * (0.6 + kick)).toFixed(2);
      filters.push(`drop-shadow(${o}px 0 0 rgba(255,40,40,0.55)) drop-shadow(-${o}px 0 0 rgba(40,220,255,0.45))`);
    }
    camEl.style.filter = filters.join(' ');
    vig.style.opacity = FXP.vignette;
    lbBars.forEach((b) => (b.style.height = FXP.lb + 'px'));
    for (const fn of frameHooks) fn(t);
    if (window.GL) window.GL.render(t);
    drawFx(t);
    drawHud(t);
    lastT = t;
  }

  /* ---------- 时钟：音频时间 + 帧间插值 ---------- */
  const audio = document.getElementById('audio');
  const DURATION = A.duration;
  const clock = { playing: false, t: 0, perf0: 0, audio0: 0 };
  function now() {
    if (!clock.playing) return clock.t;
    const est = clock.audio0 + (performance.now() - clock.perf0) / 1000;
    const real = audio.currentTime;
    // 音频时间是粗粒度的，只在偏差较大时重新对齐
    if (Math.abs(est - real) > 0.06) { clock.audio0 = real; clock.perf0 = performance.now(); return real; }
    return est;
  }
  function play() {
    if (clock.t >= DURATION - 0.05) seek(0);
    audio.currentTime = clock.t;
    const p = audio.play();
    clock.playing = true;
    clock.audio0 = clock.t; clock.perf0 = performance.now();
    document.body.classList.add('playing');
    if (p && p.catch) p.catch(() => { clock.playing = false; document.body.classList.remove('playing'); });
  }
  function pause() {
    clock.t = now();
    clock.playing = false;
    audio.pause();
    document.body.classList.remove('playing');
  }
  function seek(t) {
    t = Math.max(0, Math.min(DURATION, t));
    clock.t = t;
    clock.audio0 = t; clock.perf0 = performance.now();
    try { audio.currentTime = t; } catch (e) {}
    render(t);
  }
  audio.addEventListener('ended', () => { pause(); clock.t = DURATION; });
  audio.addEventListener('playing', () => { clock.audio0 = audio.currentTime; clock.perf0 = performance.now(); });
  audio.addEventListener('waiting', () => { clock.t = audio.currentTime; });

  function loop() {
    const t = now();
    if (clock.playing) clock.t = t;
    if (t !== lastT || clock.playing) render(t);
    ui.update(t);
    requestAnimationFrame(loop);
  }

  /* ---------- 播放控制 ---------- */
  const ui = (function () {
    const fill = document.getElementById('ui-fill');
    const head = document.getElementById('ui-head');
    const time = document.getElementById('ui-time');
    const bar = document.getElementById('ui-bar');
    const chapEl = document.getElementById('ui-chapters');
    const fmt = (t) => `${Math.floor(t / 60)}:${pad(Math.floor(t % 60))}`;
    document.getElementById('ui-dur').textContent = fmt(DURATION);
    function buildChapters() {
      chapters.forEach((c) => {
        const i = el('i', null, `<span>${pad(c.no)} ${c.label}</span>`, chapEl);
        i.style.left = (c.t / DURATION) * 100 + '%';
      });
    }
    let dragging = false;
    function seekFromEvent(e) {
      const r = bar.getBoundingClientRect();
      seek(((e.clientX - r.left) / r.width) * DURATION);
    }
    bar.addEventListener('pointerdown', (e) => { dragging = true; bar.setPointerCapture(e.pointerId); seekFromEvent(e); });
    bar.addEventListener('pointermove', (e) => dragging && seekFromEvent(e));
    bar.addEventListener('pointerup', () => (dragging = false));
    document.getElementById('ui-play').addEventListener('click', () => (clock.playing ? pause() : play()));
    document.getElementById('ui-fs').addEventListener('click', toggleFs);
    document.getElementById('ui-hud').addEventListener('click', () => document.body.classList.toggle('clean'));
    let idleTimer;
    function wake() {
      document.body.classList.remove('idle');
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => clock.playing && document.body.classList.add('idle'), 2200);
    }
    window.addEventListener('pointermove', wake);
    window.addEventListener('pointerdown', wake);
    return {
      buildChapters,
      update(t) {
        const p = (t / DURATION) * 100;
        fill.style.width = p + '%';
        head.style.left = p + '%';
        time.textContent = fmt(t);
      },
    };
  })();

  function toggleFs() {
    const d = document;
    if (!d.fullscreenElement && !d.webkitFullscreenElement) {
      const r = d.documentElement;
      (r.requestFullscreen || r.webkitRequestFullscreen).call(r);
    } else {
      (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    }
  }

  window.addEventListener('keydown', (e) => {
    if (document.body.classList.contains('covered')) return;
    if (e.code === 'Space' || e.key === 'k') { e.preventDefault(); clock.playing ? pause() : play(); }
    else if (e.key === 'ArrowRight') seek(now() + (e.shiftKey ? 1 : 5));
    else if (e.key === 'ArrowLeft') seek(now() - (e.shiftKey ? 1 : 5));
    else if (e.key === ',') seek(now() - 1 / 30);
    else if (e.key === '.') seek(now() + 1 / 30);
    else if (e.key === 'f' || e.key === 'F') toggleFs();
    else if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('clean');
    else if (/^[1-9]$/.test(e.key)) { const c = chapters[+e.key - 1]; if (c) seek(c.t); }
    else if (e.key === '0') seek(0);
  });
  window.addEventListener('resize', fit);

  /* ---------- 对外 ---------- */
  window.FILM = {
    W, H, A, S, params, BAR, BEAT, BARLEN, T0, DURATION,
    env, hit, spsAt, beatInfo, rand, noise1,
    el, css, splitChars, splitWords, chopText, img, preloadAll,
    tl, scene, chapter, chapters, CAM, FXP, punch, flash, blurWhip,
    onFrame, render, play, pause, seek, now, fit, ui, clock,
    get stageScale() { return stageScale; },
    start() { fit(); ui.buildChapters(); requestAnimationFrame(loop); },
  };
})();
