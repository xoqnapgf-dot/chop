/* =====================================================================
 * CHOP/ 宣传片 · 分镜
 * 剪辑点全部落在 130 BPM 的节拍网格上：BAR(n, b) = 第 n 小节第 b 拍。
 * 歌曲结构（剪辑版）：
 *   0–7s 前奏 · 7s 土耳其（Ceza）· 15–30s Tech N9ne 念白 · 30s 主歌爆发
 *   89s 副歌 · 103s 芝加哥（Twista）· 148s 副歌 · 162s 堪萨斯（D-Loc）· 177s 加州（Twisted Insane）· 192s 结束
 * 所有文字和数字都取自站点源码（js/data/site.js 由 tools/build-data.py 生成）。
 * ===================================================================== */
(function () {
  'use strict';
  const F = window.FILM;
  const { tl, BAR, BEAT, el, img, scene, chapter, CAM, FXP, punch, flash, blurWhip, env, hit, onFrame, S, rand, noise1 } = F;
  const G = window.GL.G;
  const GLX = window.GL;
  const byId = Object.fromEntries(S.artists.map((a) => [a.slug, a]));
  const STAT = S.stats;
  const ez = (n) => gsap.parseEase(n);
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const lerp = (a, b, k) => a + (b - a) * k;

  /* ---------- 补间小工具 ---------- */
  const inited = new WeakSet();
  /** fromTo，且在构建时就把元素放到 from 状态（倒放、跳转都正确） */
  function ft(target, from, to, t, dur = 0.6, ease = 'power3.out') {
    const list = gsap.utils.toArray(target);
    list.forEach((e) => { if (!inited.has(e)) { gsap.set(e, from); inited.add(e); } });
    tl.fromTo(list, from, Object.assign({}, to, { duration: dur, ease, immediateRender: false }), t);
  }
  function inUp(target, t, dur = 0.7, dist = 60, stagger = 0) {
    ft(target, { y: dist, opacity: 0 }, { y: 0, opacity: 1, stagger }, t, dur, 'expo.out');
  }
  function fadeIn(target, t, dur = 0.5) { ft(target, { opacity: 0 }, { opacity: 1 }, t, dur, 'power2.out'); }
  function out(target, t, dur = 0.35, extra = {}) {
    tl.to(target, Object.assign({ opacity: 0, duration: dur, ease: 'power2.in' }, extra), t);
  }
  /** GL 状态补间 */
  function g(vars, t, dur, ease = 'power2.inOut') {
    tl.to(G, Object.assign({}, vars, { duration: dur, ease }), t);
  }
  function gset(vars, t) { tl.set(G, vars, t); }
  /** 只在 [a, b) 内调用的帧回调 */
  function frame(a, b, fn) { onFrame((t) => { if (t >= a && t < b) fn(t); }); }
  /** 数字从 from 走到 to（纯函数，按时间取值） */
  function counter(e, a, dur, from, to, dec = 0, ease = 'power3.out', b = 1e9) {
    const E = ez(ease);
    let last = '';
    frame(a - 0.5, b, (t) => {
      const k = E(clamp01((t - a) / dur));
      const s = (from + (to - from) * k).toFixed(dec);
      if (s !== last) { e.textContent = s; last = s; }
    });
  }
  function av(a, cls, parent) {
    const w = el('div', 'avatar ' + (cls || ''), null, parent);
    if (a && a.img) img(a.img, null, w);
    return w;
  }
  const label = (a) => (a.zh ? `${a.zh}` : a.name);
  function plate(parent, src, url, cls) {
    const p = el('div', 'plate ' + (cls || ''), null, parent);
    const c = el('div', 'chrome', '<i></i><i></i><i></i>', p);
    el('span', null, url, c);
    const v = el('div', 'view', null, p);
    const im = img(src, null, v);
    im.style.width = '100%';
    return { p, v, im };
  }

  /* ---------- 全局：信箱黑边、HUD、底鼓抖动 ---------- */
  FXP.lb = 138; FXP.hud = 0; FXP.grain = 0.09; FXP.vignette = 0.75; FXP.leak = 0.0;
  tl.set(FXP, { lb: 138, hud: 0, grain: 0.09, vignette: 0.75, leak: 0 }, 0);
  tl.set(CAM, { x: 0, y: 0, s: 1, r: 0, blur: 0, shake: 0, kickZoom: 0, rgb: 0, bright: 1, sat: 1 }, 0);
  tl.set(G, { globe: 0, reveal: 0, stars: 0, warp: 0, travel: 0, stretch: 0, markers: 0, cities: 0, arcsOut: 0, arcsOutA: 0, arcsCol: 0, arcsColA: 0, hotCN: 0, labels: 0, pulse: 0, spin: 0, roll: 0, shiftX: 0, shiftY: 0, warpHue: 0 }, 0);

  /* =================================================================
   * 00 冷开场：一秒钟，能塞进多少个音节？      0 → 7.34
   * ================================================================= */
  const T_TURKEY = 7.34;
  chapter(0, 'COLD OPEN', 0, '开场');
  scene('cold', 0, T_TURKEY, (root) => {
    g({ stars: 0.55 }, 0, 3, 'power1.inOut');
    tl.fromTo(G, { travel: 0 }, { travel: 900, duration: T_TURKEY, ease: 'none', immediateRender: false }, 0);

    const eb = el('div', 'eb eyebrow', 'CHOP/ <b>·</b> 快嘴档案馆 <b>·</b> FILM', root);
    fadeIn(eb, 0.3, 1.2);

    const meter = el('div', 'meter', null, root);
    const bars = Array.from({ length: 72 }, () => el('i', null, null, meter));
    ft(meter, { scaleX: 0 }, { scaleX: 1 }, 0.35, 1.4, 'expo.out');
    frame(0, T_TURKEY, (t) => {
      const ramp = clamp01((t - 0.6) / 1.2);
      bars.forEach((b, i) => {
        const n = 0.5 + 0.5 * noise1(t * 6 + i * 0.37);
        const wave = Math.max(0, Math.sin(i * 0.21 - t * 5)) * 0.25;
        const e = env('rms', t) * 1.6 + env('high', t + i * 0.002) * 0.8;
        b.style.transform = `scaleY(${(0.04 + ramp * (0.05 + n * 0.12 + wave) + e * (0.3 + n * 0.7)).toFixed(3)})`;
      });
    });

    const q1 = el('div', 'q1', '一秒钟，', root);
    const q2 = el('div', 'q2', '能塞进<span class="gold">多少个音节</span>？', root);
    const c1 = F.splitChars(q1);
    ft(c1, { opacity: 0, y: 30, filter: 'blur(12px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', stagger: 0.09 }, 1.2, 0.9, 'expo.out');
    ft(q2, { opacity: 0, y: 30, filter: 'blur(12px)' }, { opacity: 1, y: 0, filter: 'blur(0px)' }, 2.6, 1.1, 'expo.out');
    out([q1, q2, meter, eb], 4.75, 0.25);

    // 站点首页步进器的五档速度，越来越快
    const presets = [
      ['3', '90 BPM · 8 分音符'], ['6', '90 BPM · 16 分音符'], ['10.87', 'TWISTA · 1992'], ['15.4', 'EL CHOJIN · 2008'], ['21', 'CRUCIFIED · 爆发'],
    ];
    const ts = [4.95, 5.65, 6.2, 6.62, 6.95];
    presets.forEach(([v, l], i) => {
      const n = el('div', 'num', `${v}<small>${l}</small>`, root);
      const end = i < presets.length - 1 ? ts[i + 1] : T_TURKEY;
      tl.set(n, { opacity: 1 }, ts[i]);
      tl.fromTo(n, { scale: 1.25, filter: 'blur(10px)' }, { scale: 1, filter: 'blur(0px)', duration: 0.3, ease: 'expo.out', immediateRender: false }, ts[i]);
      tl.set(n, { opacity: 0 }, end);
      if (i === 4) n.style.color = 'var(--gold)';
    });
    punch(6.95, 0.05, 0.4);
  });

  /* =================================================================
   * 01 土耳其：Ceza 开场                       7.34 → 14.64
   * ================================================================= */
  const T_MIDWEST = 14.64;
  chapter(1, 'TURKEY', T_TURKEY, '土耳其');
  flash(T_TURKEY, 0.9, 0.6);
  // 地球从黑暗里点亮，摄像机飞向伊斯坦布尔
  gset({ globe: 0, reveal: 0, lat: 22, lon: -20, dist: 1500, fov: 34, shiftX: 470, markers: 0, labels: 0, pulse: 0.8, atmo: 1 }, T_TURKEY);
  g({ globe: 1 }, T_TURKEY, 1.2, 'power2.out');
  g({ reveal: 1 }, T_TURKEY, 3.2, 'power2.inOut');
  g({ lat: 39, lon: 32, dist: 640 }, T_TURKEY, 5.6, 'power3.inOut');
  g({ stars: 0.25 }, T_TURKEY, 2);
  g({ markers: 1, labels: 1 }, T_TURKEY + 1.5, 1.2);
  tl.set(FXP, { hud: 0 }, T_TURKEY);
  tl.to(FXP, { hud: 0.82, duration: 1, ease: 'power2.out' }, T_TURKEY + 0.6);
  tl.to(FXP, { lb: 90, duration: 1.2, ease: 'power3.inOut' }, T_TURKEY);
  GLX.addLabel(41.0, 28.98, '<div class="in"><small>ISTANBUL</small>伊斯坦布尔 · Ceza</div>', 'big', (t) => (t > T_TURKEY + 2.4 && t < T_MIDWEST ? 1 : 0));

  scene('turkey', T_TURKEY, T_MIDWEST, (root) => {
    const tag = el('div', 'tag abs', '01 · TURKEY', root);
    F.css(tag, { left: '118px', top: '190px' });
    ft(tag, { opacity: 0, x: -40 }, { opacity: 1, x: 0 }, T_TURKEY + 0.2, 0.6, 'expo.out');
    const big = el('div', 'big', 'TÜRKİYE', root);
    const bigCh = F.splitChars(big);
    ft(bigCh, { opacity: 0, yPercent: 100, rotateX: -80 }, { opacity: 1, yPercent: 0, rotateX: 0, stagger: 0.04 }, T_TURKEY + 0.3, 0.8, 'expo.out');
    const zh = el('div', 'zhname', '土耳其', root);
    inUp(zh, T_TURKEY + 0.7, 0.8);
    const ceza = byId.ceza;
    const who = el('div', 'who card', null, root);
    av(ceza, null, who);
    el('div', null, `<h3>${ceza.name}</h3><p>${ceza.city} · Chopper · 《Worldwide Choppers》第一个出场</p>`, who);
    ft(who, { opacity: 0, x: -60 }, { opacity: 1, x: 0 }, T_TURKEY + 1.4, 0.8, 'expo.out');
    const langs = el('div', 'langs', '一首歌，<b>三种语言</b>：英语 · 丹麦语 · 土耳其语', root);
    inUp(langs, BAR(7), 0.7, 30);
    punch(BAR(7), 0.05, 0.6);
    flash(BAR(7), 0.35, 0.4);
    out([tag, big, zh, who, langs], T_MIDWEST - 0.3, 0.3, { x: -80 });
  });

  /* =================================================================
   * 02 从中西部到全世界                       14.64 → 29.85（主歌爆发）
   * ================================================================= */
  const T_DROP = BAR(16);
  chapter(2, 'MIDWEST', T_MIDWEST, '中西部 → 世界');
  blurWhip(T_MIDWEST, 18, 0.5);
  g({ lat: 38, lon: -95, dist: 560, shiftX: 380 }, T_MIDWEST - 0.2, 1.6, 'power3.inOut');
  GLX.addLabel(GLX.KC[0], GLX.KC[1], '<div class="in"><small>KANSAS CITY</small>堪萨斯城 · Strange Music</div>', 'big', (t) => (t > T_MIDWEST + 0.9 && t < 19.2 ? 1 : 0));
  // 弧线：18.46 "take it all over the world"
  const T_WORLD = 18.46;
  gset({ arcsOut: 0, arcsOutA: 1 }, T_WORLD - 0.01);
  tl.fromTo(G, { arcsOut: 0 }, { arcsOut: 6.2, duration: 6.2, ease: 'none', immediateRender: false }, T_WORLD);
  g({ dist: 1050, lat: 30, lon: -30, shiftX: 300 }, T_WORLD, 6, 'power2.inOut');
  // 国家标签：弧线到达时出现
  GLX.outPairs.forEach((p) => {
    const s = S.scenes.find((x) => x.id === p.id);
    const arrive = T_WORLD + p.delay + 1.4;
    GLX.addLabel(s.geo[0], s.geo[1], `<div class="in">${s.name}</div>`, s.id === 'cn' ? 'cn' : '', (t) => (t > arrive && t < 24.6 ? clamp01((t - arrive) / 0.3) : 0));
  });

  scene('midwest', T_MIDWEST, T_DROP, (root) => {
    const side = el('div', 'side', null, root);
    const eb = el('div', 'eyebrow', 'WORLDWIDE <b>·</b> 1990s → NOW', side);
    const h2 = el('h2', null, '从美国中西部<br/><span class="gold">到整个世界</span>', side);
    const p = el('p', null, 'Chop 1990 年代初在美国中西部兴起，后来被 Tech N9ne 做成跨国企划；如今 YouTube 上的 SPS 社区还在把语速往上推。', side);
    fadeIn(eb, T_MIDWEST + 0.5, 0.6);
    const lines = h2.innerHTML.split('<br>');
    inUp(h2, T_MIDWEST + 0.7, 1.0, 60);
    inUp(p, 17.2, 0.9, 30);

    const cnt = el('div', 'count', null, root);
    const mk = (n, l) => { const d = el('div', null, `<b>0</b><span>${l}</span>`, cnt); return d.querySelector('b'); };
    const cN = mk(STAT.countries, '个国家 / 地区');
    const cA = mk(STAT.artists, '位人物');
    const cT = mk(STAT.tracks, '首曲目');
    inUp(cnt, T_WORLD, 0.8, 30);
    counter(cN, T_WORLD, 5.2, 0, STAT.countries, 0, 'power1.inOut', T_DROP);
    counter(cA, T_WORLD + 0.3, 5.2, 0, STAT.artists, 0, 'power1.inOut', T_DROP);
    counter(cT, T_WORLD + 0.6, 5.2, 0, STAT.tracks, 0, 'power1.inOut', T_DROP);
    out([side, cnt], BAR(13) - 0.1, 0.4, { x: -100, filter: 'blur(10px)' });

    // "This is the pinnacle"：地球退场，字标组装，冲向主歌
    const T_PIN = BAR(13);
    g({ dist: 2600, globe: 0, shiftX: 0, markers: 0 }, T_PIN - 0.2, 2.4, 'power3.in');
    gset({ arcsOutA: 0, labels: 0 }, T_PIN + 2.3);
    g({ stars: 0.7, warp: 0.35, stretch: 60 }, T_PIN, 2, 'power2.in');
    tl.fromTo(G, { travel: 0 }, { travel: 9000, duration: T_DROP - T_PIN, ease: 'power3.in', immediateRender: false }, T_PIN);
    g({ warp: 1, stretch: 520 }, BAR(15), BAR(16) - BAR(15), 'power3.in');

    const logo = el('div', 'logo', null, root);
    const lb = el('b', 'bars', '<i></i><i></i><i></i><i></i><i></i>', logo);
    const word = el('span', null, 'CHOP<em>/</em>', logo);
    const sub = el('div', 'sub', '快嘴档案馆', root);
    F.gsap = gsap;
    gsap.set(logo, { xPercent: -50, yPercent: -50, x: 0, y: 0 });
    const barEls = [...lb.children];
    const hs = [0.45, 0.8, 1, 0.65, 0.3];
    ft(barEls, { scaleY: 0 }, { scaleY: (i) => hs[i], stagger: 0.07 }, T_PIN + 0.2, 0.6, 'back.out(2)');
    ft(word, { opacity: 0, x: 80, filter: 'blur(16px)' }, { opacity: 1, x: 0, filter: 'blur(0px)' }, T_PIN + 0.5, 0.9, 'expo.out');
    ft(sub, { opacity: 0, letterSpacing: '2em' }, { opacity: 1, letterSpacing: '1em' }, T_PIN + 1.2, 1.2, 'expo.out');
    frame(T_PIN + 1.2, T_DROP, (t) => {
      const lv = [env('low', t), env('mid', t), env('rms', t), env('high', t), env('mid', t - 0.06)];
      barEls.forEach((b, i) => (b.style.transform = `scaleY(${(hs[i] * (0.55 + lv[i] * 0.7)).toFixed(3)})`));
    });
    // 节拍上的抽帧：字标随第 14、15 小节每拍闪一下
    for (let k = 0; k < 8; k++) {
      const tt = BAR(14, k);
      tl.fromTo(logo, { scale: 1.06 }, { scale: 1, duration: 0.3, ease: 'expo.out', immediateRender: false }, tt);
    }
    tl.to(CAM, { shake: 0.9, duration: BAR(16) - BAR(14), ease: 'power2.in' }, BAR(14));
    // 最后两拍：字标被横刀切开
    ft(logo, { scale: 1, opacity: 1 }, { scale: 2.6, opacity: 0, filter: 'blur(20px)' }, BAR(15, 3), BEAT, 'power3.in');
    out(sub, BAR(15, 2), 0.3);
  });

  /* =================================================================
   * 03 把音节剁碎（主歌爆发）                  29.85 → 42.77
   * ================================================================= */
  chapter(3, 'CHOP', T_DROP, '把音节剁碎');
  flash(T_DROP, 1, 0.7);
  tl.set(CAM, { shake: 0, kickZoom: 1, rgb: 0 }, T_DROP);
  tl.to(FXP, { lb: 0, duration: 0.5, ease: 'expo.out' }, T_DROP);
  tl.to(FXP, { leak: 0.6, vignette: 0.6, grain: 0.07, duration: 1 }, T_DROP);
  g({ warp: 0.35, stretch: 160, stars: 0.6 }, T_DROP, 1, 'power2.out');
  tl.fromTo(G, { travel: 9000 }, { travel: 15000, duration: BAR(17) - T_DROP, ease: 'power1.out', immediateRender: false }, T_DROP);

  // 32s 起：光速线不停，减弱并反向——拖尾朝向镜头，像镜头在缓缓后撤（从静止平滑起步）
  g({ warp: 0.2, stars: 0.42 }, BAR(17) - 0.2, 1.2, 'power2.inOut');
  tl.fromTo(G, { stretch: 160 }, { stretch: -120, duration: 1.0, ease: 'power2.inOut', immediateRender: false }, BAR(17) - 0.3);
  tl.fromTo(G, { travel: 15000 }, { travel: 9500, duration: BAR(23) - BAR(17), ease: 'power1.in', immediateRender: false }, BAR(17));
  scene('hero', T_DROP, BAR(17), (root) => {
    el('div', 'glow', null, root);
    const eb = el('div', 'eb eyebrow', 'CHOP <b>·</b> 快嘴 <b>·</b> 中国区 &amp; 世界', root);
    const h1 = el('div', 'h1', null, root);
    const l1 = el('div', 'l1', '把音节', h1);
    const l2 = el('div', 'l2', '剁碎。', h1);
    const s1 = F.chopText(l1, 6);
    const s2 = F.chopText(l2, 6);
    // 每一刀：切片从两侧交错砸进来，落在拍点上
    [...s1, ...s2].forEach((s, i) => {
      const dir = i % 2 ? 1 : -1;
      const at = T_DROP + (i < 6 ? 0 : BEAT * 2) + (i % 6) * 0.035;
      ft(s, { x: dir * (500 + rand(i) * 400), opacity: 0 }, { x: 0, opacity: 1 }, at, 0.55, 'expo.out');
    });
    const knife = el('div', 'knife', null, root);
    ft(knife, { top: 600, scaleX: 0, opacity: 1 }, { scaleX: 1, opacity: 0 }, T_DROP + BEAT * 2, 0.5, 'expo.out');
    fadeIn(eb, T_DROP + 0.3, 0.5);
    const note = el('div', 'note', '<b>快速说唱档案馆</b>。从美国中西部的 chopper，到南京、成都、西安、乌鲁木齐的中文快嘴。', root);
    inUp(note, T_DROP + BEAT * 4, 0.7, 30);
    // 底鼓一来，切片就错位一下
    frame(T_DROP, BAR(17), (t) => {
      const k = hit('kick', t, 0.07, 0.2);
      [...s1, ...s2].forEach((s, i) => (s.style.translate = `${((i % 2 ? 1 : -1) * k * (3 + rand(i * 3) * 9)).toFixed(1)}px 0`));
    });
    tl.to(root, { opacity: 0, duration: 0.15 }, BAR(17) - 0.15);
  });

  // 产品镜头：站点首页
  scene('product', BAR(17), BAR(19), (root) => {
    const persp = el('div', 'persp', null, root);
    const pl = plate(persp, 'assets/img/site/home.jpg', 'zhishixuebao2026.github.io/chop/');
    ft(pl.p, { rotateY: -28, rotateX: 14, z: -500, x: 300, opacity: 0 }, { rotateY: -16, rotateX: 8, z: 0, x: 0, opacity: 1 }, BAR(17), 0.9, 'expo.out');
    tl.to(pl.p, { rotateY: -10, rotateX: 4, z: 120, duration: BAR(19) - BAR(17) - 0.9, ease: 'none' }, BAR(17) + 0.9);
    tl.fromTo(pl.im, { y: 0 }, { y: -1100, duration: BAR(19) - BAR(17), ease: 'power1.inOut', immediateRender: false }, BAR(17));
    const left = el('div', 'left', null, root);
    el('div', 'eyebrow', 'THE ARCHIVE', left);
    el('h2', null, '快嘴说唱<br/><span class="gold">资料网站</span>', left);
    el('p', null, '人物、曲目、时间线、速度数据，<br/>每条资料都附来源和可信度标签。', left);
    inUp([...left.children], BAR(17) + 0.15, 0.7, 40, 0.08);
    const st = el('div', 'stats', null, root);
    [[STAT.cn, '位中国区人物'], [STAT.world, '位世界人物'], [STAT.tracks, '首曲目'], [STAT.sources, '条独立来源']].forEach(([n, l], i) => {
      const d = el('div', null, `<b>0</b><span>${l}</span>`, st);
      counter(d.querySelector('b'), BAR(17, 1) + i * 0.12, 1.6, 0, n, 0, 'expo.out', BAR(19));
    });
    inUp(st, BAR(17, 1), 0.6, 30);
    tl.to(root, { opacity: 0, duration: 0.12 }, BAR(19) - 0.12);
  });

  // 快 ≠ Chop
  scene('neq', BAR(19), BAR(23), (root) => {
    const eq = el('div', 'eq', '<span class="k">快</span><span class="ne">≠</span><span class="c">CHOP</span>', root);
    gsap.set(eq, { xPercent: -50, yPercent: -54, x: 0, y: 0 });
    const parts = [...eq.children];
    ft(parts[0], { opacity: 0, scale: 2.4 }, { opacity: 1, scale: 1 }, BAR(19), 0.5, 'expo.out');
    ft(parts[1], { opacity: 0, scale: 0.2 }, { opacity: 1, scale: 1 }, BAR(19, 1), 0.4, 'back.out(3)');
    ft(parts[2], { opacity: 0, x: 200 }, { opacity: 1, x: 0 }, BAR(19, 2), 0.5, 'expo.out');
    punch(BAR(19), 0.07); punch(BAR(19, 2), 0.05);
    const cap = el('div', 'cap', 'Chop 是一种风格，唱 chop 的人才叫 chopper。会唱得快的人，不一定唱 chop。', root);
    inUp(cap, BAR(19, 3), 0.5, 20);
    out([eq, cap], BAR(20) - 0.12, 0.12);

    // 两个层次（站点首页同款卡片）
    const tiers = el('div', 'tiers', null, root);
    const mkTier = (cls, lv, name, text, eg, n) => {
      const c = el('div', 'tier card ' + cls, null, tiers);
      const tb = el('div', 'tb', null, c);
      const bs = Array.from({ length: 22 }, (_, i) => {
        const b = el('i', null, null, tb);
        b.style.height = (cls === 'fast' ? 30 + rand(i + 5) * 60 : 40 + rand(i * 7 + 2) * 60) + '%';
        return b;
      });
      el('div', 'lv', `LEVEL ${lv}`, c);
      el('h3', null, name, c);
      el('p', null, text, c);
      el('div', 'eg', `例：<b>${eg}</b> · 收录 ${n} 位`, c);
      return { c, bs };
    };
    const t1 = mkTier('fast', 1, '快嘴', '有公认的高速段落，或者语速、咬字就是他的招牌；但没有整首、长期地"切"音节。', '法老 · 杨和苏 · 光光 · Eminem', STAT.fast);
    const t2 = mkTier('chop', 2, 'Chop', '整首、长期地"切"音节：一拍塞多个音节、flow 多变、押韵密集。', 'Twista · Tech N9ne · 小安迪', STAT.chopper);
    ft(t1.c, { opacity: 0, y: 120, rotateX: 20 }, { opacity: 1, y: 0, rotateX: 0 }, BAR(20), 0.7, 'expo.out');
    ft(t2.c, { opacity: 0, y: 120, rotateX: 20 }, { opacity: 1, y: 0, rotateX: 0 }, BAR(20, 2), 0.7, 'expo.out');
    ft(t1.bs, { scaleY: 0 }, { scaleY: 1, stagger: 0.015 }, BAR(20) + 0.1, 0.5, 'expo.out');
    ft(t2.bs, { scaleY: 0 }, { scaleY: 1, stagger: 0.015 }, BAR(20, 2) + 0.1, 0.5, 'expo.out');
    frame(BAR(20), BAR(22), (t) => {
      // 快嘴：一路平推；chop：切得更碎、更跳
      t1.bs.forEach((b, i) => (b.style.translate = `0 ${(-env('mid', t - i * 0.01) * 8).toFixed(1)}px`));
      t2.bs.forEach((b, i) => (b.style.translate = `0 ${(-hit('onset', t - i * 0.02, 0.07, 0.15) * 26 * (0.4 + rand(i))).toFixed(1)}px`));
    });
    out(tiers, BAR(22) - 0.12, 0.12);

    // 四条：chop 除了快还有什么（每拍一条）
    const rules = [
      ['01 · CHOP', '一拍塞进<span class="gold">两三四</span>个音节'],
      ['02 · FLOW', 'Flow <span class="gold">多变</span>'],
      ['03 · RHYME', '押韵<span class="gold">密集</span>'],
      ['04 · LENGTH', '<span class="gold">贯穿</span>整首'],
    ];
    rules.forEach(([k, txt], i) => {
      const r = el('div', 'rule4', `<small>${k}</small>${txt}`, root);
      const a = BAR(22, i), b = BAR(22, i + 1);
      tl.set(r, { opacity: 1 }, a);
      tl.fromTo(r, { scale: 1.3, filter: 'blur(14px)' }, { scale: 1, filter: 'blur(0px)', duration: 0.25, ease: 'expo.out', immediateRender: false }, a);
      tl.set(r, { opacity: 0 }, b);
      gsap.set(r, { opacity: 0 });
      punch(a, 0.04, 0.3);
    });
  });

  // (Worldwide choppers) —— 鼓停的一小节
  scene('wwc', BAR(23), BAR(24), (root) => {
    g({ warp: 0, stars: 0.3 }, BAR(23), 0.4);
    tl.to(FXP, { leak: 0, duration: 0.3 }, BAR(23));
    const w1 = el('div', 'w w1 outline-gold', 'WORLDWIDE', root);
    const w2 = el('div', 'w w2', 'CHOPPERS', root);
    const c1 = F.splitChars(w1), c2 = F.splitChars(w2);
    ft(c1, { opacity: 0, y: -40 }, { opacity: 1, y: 0, stagger: 0.03 }, BAR(23) + 0.4, 0.4, 'expo.out');
    ft(c2, { opacity: 0, y: 40 }, { opacity: 1, y: 0, stagger: 0.03 }, BAR(23) + 0.65, 0.4, 'expo.out');
    tl.to(CAM, { s: 1.12, duration: BAR(24) - BAR(23), ease: 'power2.in' }, BAR(23));
    tl.set(CAM, { s: 1 }, BAR(24));
  });

  /* =================================================================
   * 04 人物库                                  44.62 → 55.70
   * ================================================================= */
  chapter(4, 'PEOPLE', BAR(24), '人物');
  flash(BAR(24), 0.8, 0.5);
  tl.to(FXP, { leak: 0.35, duration: 1 }, BAR(24));
  scene('people', BAR(24), BAR(28), (root) => {
    const wrap = el('div', 'wallwrap', null, root);
    const wall = el('div', 'wall', null, wrap);
    // 按"中国区 / 世界"交错排开，颜色更均匀
    const list = [...S.artists].sort((a, b) => rand(a.slug.length * 13 + a.name.charCodeAt(0)) - rand(b.slug.length * 13 + b.name.charCodeAt(0)));
    const tiles = list.map((a) => {
      const tdiv = el('div', 'tile ' + a.style, null, wall);
      img(a.img, null, tdiv);
      el('span', 'dot', a.style === 'chopper' ? '● Chopper' : '● 快嘴', tdiv);
      F.fitText(el('div', 'nm', a.zh || a.name, tdiv), 152, 0.6);
      return tdiv;
    });
    const order = tiles.map((_, i) => i).sort((a, b) => rand(a * 3.3) - rand(b * 3.3));
    order.forEach((idx, k) => {
      ft(tiles[idx], { opacity: 0, z: -900, rotateY: 90 }, { opacity: 1, z: 0, rotateY: 0 }, BAR(24) + k * 0.014, 0.6, 'expo.out');
    });
    ft(wall, { rotateY: -32, rotateX: 10, x: 520, z: -300 }, { rotateY: -18, rotateX: 6, x: 260, z: 0 }, BAR(24), BAR(26) - BAR(24), 'power2.out');
    tl.to(wall, { rotateY: 22, rotateX: -4, x: 120, z: 200, duration: BAR(28) - BAR(26), ease: 'power2.inOut' }, BAR(26));
    blurWhip(BAR(26), 10, 0.4);
    el('div', 'shade', null, root);
    const title = el('div', 'title', null, root);
    el('div', 'eyebrow', 'PEOPLE <b>·</b> 人物库', title);
    const n = el('div', 'n', '0', title);
    el('h2', null, '位人物', title);
    const chips = el('div', 'chips', `<span class="chip chopper">Chopper ${STAT.chopper}</span><span class="chip fast">快嘴 ${STAT.fast}</span>`, title);
    inUp([...title.children], BAR(24) + 0.2, 0.7, 50, 0.08);
    counter(n, BAR(24) + 0.2, 1.6, 0, STAT.artists, 0, 'expo.out', BAR(28));
    const split = el('div', 'split', `<span><b>${STAT.cn}</b>位中国区</span><span><b>${STAT.world}</b>位世界</span><span><b>${STAT.countries}</b>个国家 / 地区</span>`, root);
    inUp(split, BAR(26), 0.6, 30);
  });

  // 聚光灯：每拍一张脸
  scene('spot', BAR(28), BAR(30), (root) => {
    const picks = ['twista', 'tech-n9ne', 'busta-rhymes', 'bone-thugs-n-harmony', 'crucified', 'outsider', 'lil-andy', 'guang-guang'];
    const tones = ['rgba(232,184,74,0.75)', 'rgba(200,33,27,0.75)'];
    picks.forEach((slug, i) => {
      const a = byId[slug];
      const ph = el('div', 'ph', null, root);
      const pic = el('div', 'pic', null, ph);
      const im = img(a.img, null, pic);
      const tone = el('div', 'tone', null, pic);
      tone.style.background = a.country === 'CN' ? tones[1] : tones[i % 2];
      el('div', 'fade', null, pic);
      el('div', 'idx', `${String(i + 1).padStart(2, '0')} / 08`, ph);
      if (a.zh) el('div', 'zh', a.zh, ph);
      F.fitText(el('div', 'nm', a.name, ph), 1180, 0.55);
      el('div', 'meta', `<span class="chip ${a.style}">${a.style === 'chopper' ? 'Chopper' : '快嘴'}</span><span>${a.city}</span>${a.since ? `<span class="dim">· ${a.since} 起</span>` : ''}`, ph);
      el('div', 'tagline', a.tagline || '', ph);
      const s = BAR(28, i), e = BAR(28, i + 1);
      gsap.set(ph, { opacity: 0 });
      tl.set(ph, { opacity: 1 }, s);
      tl.set(ph, { opacity: 0 }, e);
      tl.fromTo(im, { scale: 1.25, x: 40 }, { scale: 1.05, x: 0, duration: BEAT, ease: 'expo.out', immediateRender: false }, s);
      tl.fromTo(ph.querySelector('.nm'), { x: -60, opacity: 0 }, { x: 0, opacity: 1, duration: 0.3, ease: 'expo.out', immediateRender: false }, s);
    });
    tl.set(CAM, { rgb: 0.45 }, BAR(28));
    tl.set(CAM, { rgb: 0 }, BAR(30));
  });

  /* =================================================================
   * 05 测速：SPS                               55.70 → 74.16
   * ================================================================= */
  chapter(5, 'SPEED', BAR(30), '测速');
  flash(BAR(30), 0.9, 0.5);
  scene('sps', BAR(30), BAR(31), (root) => {
    const big = el('div', 'bigs', 'SPS', root);
    const chs = F.splitChars(big);
    ft(chs, { opacity: 0, scaleY: 3, y: -100 }, { opacity: 1, scaleY: 1, y: 0, stagger: 0.06 }, BAR(30), 0.5, 'expo.out');
    const d1 = el('div', 'def', 'SYLLABLES PER SECOND', root);
    const d2 = el('div', 'def2', '音节数<span class="op">÷</span>秒数', root);
    inUp(d1, BAR(30, 1), 0.5, 20);
    inUp(d2, BAR(30, 2), 0.5, 20);
    punch(BAR(30), 0.08);
  });

  // 爆发榜（已证实的条目）
  const conf = { verified: 'var(--good)', disputed: 'var(--warn)', pending: 'var(--serious)', debunked: 'var(--critical)' };
  const best = {};
  S.artists.forEach((a) => {
    if (a.slug === 'shad' || a.slug === 'nihilist') return; // 站点对这两位有与音乐无关的说明，片子里不突出
    a.speed.filter((s) => s.win === 'burst' && s.conf === 'verified').forEach((s) => {
      if (!best[a.slug] || s.v > best[a.slug].v) best[a.slug] = Object.assign({ a }, s);
    });
  });
  const top = Object.values(best).sort((x, y) => y.v - x.v).slice(0, 11);
  const MAXV = 25;
  scene('chart', BAR(31), BAR(34), (root) => {
    const head = el('div', 'head', null, root);
    el('div', 'eyebrow', 'BURST <b>·</b> 1 秒爆发 <b>·</b> 已证实', head);
    el('h2', null, '谁的一秒最快', head);
    inUp([...head.children], BAR(31), 0.6, 30, 0.08);
    const lg = el('div', 'legend', null, root);
    [['verified', '已证实'], ['disputed', '有争议'], ['pending', '待核实'], ['debunked', '已辟谣']].forEach(([k, l]) => el('span', null, `<i style="background:${conf[k]}"></i>${l}`, lg));
    fadeIn(lg, BAR(31) + 0.3, 0.5);
    const rows = el('div', 'rows', null, root);
    const trackLeft = 140 + 60 + 18 + 330 + 18, trackW = 1920 - 280 - 60 - 330 - 120 - 54;
    [[6, '16 分'], [9, '三连音'], [12, '32 分'], [20, '20']].forEach(([v, l]) => {
      const gd = el('div', 'guide', `<span>${l}</span>`, root);
      gd.style.left = trackLeft + (v / MAXV) * trackW + 'px';
      fadeIn(gd, BAR(31) + 0.4, 0.6);
    });
    top.forEach((r, i) => {
      const row = el('div', 'row', null, rows);
      av(r.a, 'av', row);
      F.fitText(el('div', 'nm', `${r.a.name}<small>${r.by} · ${r.a.city || ''}</small>`, row), 330, 0.7);
      const tr = el('div', 'track', null, row);
      const bar = el('i', 'bar', null, tr);
      bar.style.width = (r.v / MAXV) * 100 + '%';
      bar.style.background = conf[r.conf];
      const v = el('div', 'v', '0.00', row);
      const at = BAR(31) + 0.5 + i * BEAT * 0.5;
      ft(row, { opacity: 0, x: -40 }, { opacity: 1, x: 0 }, at, 0.4, 'expo.out');
      ft(bar, { scaleX: 0 }, { scaleX: 1 }, at, 0.9, 'expo.out');
      counter(v, at, 0.9, 0, r.v, 2, 'expo.out', BAR(34));
      if (r.a.slug === 'crucified') { row.classList.add('hl'); row.dataset.hl = 1; }
    });
    const src = el('div', 'src', '出处：NahDah Vebb《Top 150 Fastest Rappers》（2023）、NahDah 2024 每国最快、五里亭亭长 2022、SPS wiki；每条都能在站内看到算式。', root);
    fadeIn(src, BAR(32), 0.6);
    // 镜头慢推
    ft(rows, { scale: 1 }, { scale: 1.04 }, BAR(31), BAR(34) - BAR(31), 'none');
    blurWhip(BAR(34) - 0.2, 16, 0.2);
  });

  // 一条算式
  const cru = byId.crucified.speed.find((s) => s.win === 'burst' && s.conf === 'verified');
  scene('formula', BAR(34), BAR(36), (root) => {
    const card = el('div', 'card', null, root);
    gsap.set(card, { xPercent: -50, yPercent: -50, x: 0, y: 0 });
    const who = el('div', 'who', null, card);
    av(byId.crucified, null, who);
    el('div', null, `<h3>Crucified</h3><p>${cru.label} · ${cru.by}</p>`, who);
    el('div', 'badge', '● 已证实', card);
    // 每一项是一列：数字在上、说明在下，说明永远对齐自己的数字
    const f = el('div', 'f', null, card);
    const term = (v, l, cls) => el('div', 'term ' + (cls || ''), `<b>${v}</b><span>${l}</span>`, f);
    const fs = [term(cru.syl, '音节数'), el('div', 'op', '÷', f), term(cru.sec, '秒数'), el('div', 'op', '≈', f), term(cru.v, '每秒音节数', 'r')];
    ft(card, { opacity: 0, scale: 0.92, y: 40 }, { opacity: 1, scale: 1, y: 0 }, BAR(34), 0.7, 'expo.out');
    ft(fs, { opacity: 0, y: 40 }, { opacity: 1, y: 0, stagger: BEAT / 2 }, BAR(34, 1), 0.45, 'expo.out');
    punch(BAR(35), 0.025);
    tl.to(card, { scale: 1.03, duration: BAR(36) - BAR(34) - 0.7, ease: 'none' }, BAR(34) + 0.7);
  });

  // 实验室：测速规则
  scene('lab', BAR(36), BAR(40), (root) => {
    const persp = el('div', 'persp', null, root);
    const pl = plate(persp, 'assets/img/site/lab.jpg', 'zhishixuebao2026.github.io/chop/lab/');
    ft(pl.p, { rotateY: 24, rotateX: 10, z: -400, x: -200, opacity: 0 }, { rotateY: 14, rotateX: 6, z: 0, x: 0, opacity: 1 }, BAR(36), 0.9, 'expo.out');
    tl.fromTo(pl.im, { y: -120 }, { y: -600, duration: BAR(40) - BAR(36), ease: 'none', immediateRender: false }, BAR(36));
    tl.to(pl.p, { rotateY: 8, z: 80, duration: BAR(40) - BAR(36) - 0.9, ease: 'none' }, BAR(36) + 0.9);
    const rs = el('div', 'rules', null, root);
    const rules = ['一条算式', '数唱出来的，不数写出来的', '窗口至少 0.7 秒，满 1 秒最硬', '比峰值，不比 10 秒平均', '只算正式的录音室歌曲', '加速、拼接：整个人除名'];
    rules.forEach((r, i) => {
      const d = el('div', 'lrule', `<b>0${i + 1}</b><span>${r}</span>`, rs);
      ft(d, { opacity: 0, x: 120 }, { opacity: 1, x: 0 }, BAR(37) + i * BEAT * 2, 0.5, 'expo.out');
    });
    const eb = el('div', 'eyebrow abs', 'LAB <b>·</b> 测速规则：一个数字要过几道关', root);
    F.css(eb, { left: '120px', top: '90px' });
    fadeIn(eb, BAR(36) + 0.2, 0.5);
    tl.to(root, { opacity: 0, duration: 0.2 }, BAR(40) - 0.2);
  });

  /* =================================================================
   * 06 时间线：1980 → 2026（每拍一件事）       74.16 → 88.92
   * ================================================================= */
  chapter(6, 'TIMELINE', BAR(40), '时间线');
  const T_TL = BAR(40), T_TL_END = BAR(48);
  flash(T_TL, 0.6, 0.4);
  g({ stars: 0.9, warp: 0.6, stretch: 140 }, T_TL, 0.6);
  tl.fromTo(G, { travel: 0 }, { travel: 26000, duration: T_TL_END - T_TL, ease: 'power1.in', immediateRender: false }, T_TL);
  g({ warp: 1, stretch: 700 }, BAR(46), BAR(48) - BAR(46), 'power2.in');
  scene('time', T_TL, T_TL_END, (root) => {
    const tunnel = el('div', 'tunnel', null, root);
    const ybg = el('div', 'yearbg', '1980', tunnel);
    const evs = S.timeline.slice(0, 32);
    const cards = evs.map((e, i) => {
      const c = el('div', 'ev card ' + e.scene, `<div><span class="y">${e.year}</span><span class="sc">${e.scene === 'china' ? '中国区' : '世界'}</span></div><h4>${e.title}</h4><p>${e.body || ''}</p>`, tunnel);
      c.style.opacity = 0;
      return c;
    });
    const hdr = el('div', 'hdr', null, root);
    el('div', 'eyebrow', `TIMELINE <b>·</b> ${S.timeline[0].year}—${S.timeline[S.timeline.length - 1].year}`, hdr);
    el('h2', null, `${STAT.timeline} 件事`, hdr);
    inUp([...hdr.children], T_TL + 0.1, 0.6, 30, 0.08);
    const lanes = el('div', 'lanes', '<span><i style="background:var(--gold)"></i>世界</span><span><i style="background:var(--hot)"></i>中国区</span>', root);
    fadeIn(lanes, T_TL + 0.3, 0.5);
    const yr = el('div', 'yr', '1980<small>当前年份</small>', root);
    const yrB = document.createTextNode('');
    const LIFE = 2.6; // 每张卡从远处飞到镜头前的时间
    frame(T_TL - 0.1, T_TL_END, (t) => {
      let cur = evs[0];
      cards.forEach((c, i) => {
        const launch = T_TL + 0.2 + i * BEAT;
        const k = (t - launch) / LIFE;
        if (k < 0 || k > 1) { c.style.opacity = 0; return; }
        if (t >= launch + LIFE * 0.62) cur = evs[i];
        const side = i % 2 ? 1 : -1;
        const z = -2600 + k * 3200;
        const x = side * (430 + rand(i * 5) * 160);
        const y = (rand(i * 9) - 0.5) * 360;
        const op = Math.min(1, k * 4) * Math.min(1, (1 - k) * 5);
        c.style.opacity = op.toFixed(3);
        c.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${z.toFixed(1)}px) rotateY(${(-side * 18).toFixed(1)}deg)`;
      });
      ybg.textContent = cur.year;
      yr.firstChild.nodeValue = cur.year;
    });
    out([hdr, lanes, yr], T_TL_END - 0.3, 0.3);
  });

  /* =================================================================
   * 07 副歌：曲目墙                            88.92 → 103.69
   * ================================================================= */
  const T_HOOK = BAR(48), T_TWISTA = 102.47;
  chapter(7, 'TRACKS', T_HOOK, '曲目');
  flash(T_HOOK, 1, 0.7);
  g({ warp: 0, stars: 0.2 }, T_HOOK, 0.3);
  tl.to(FXP, { leak: 0.5, duration: 1 }, T_HOOK);
  scene('tracks', T_HOOK, T_TWISTA, (root) => {
    const plane = el('div', 'plane', null, root);
    const pool = [...S.tracks.filter((t) => t.thumb).map((t) => t.thumb), ...S.videos.map((v) => v.thumb)];
    const lanes = [];
    for (let r = 0; r < 9; r++) {
      const lane = el('div', 'lane', null, plane);
      for (let k = 0; k < 16; k++) img(pool[(r * 16 + k * 7 + r * 3) % pool.length], null, lane);
      lanes.push(lane);
    }
    frame(T_HOOK, T_TWISTA, (t) => {
      const dt = t - T_HOOK;
      const boost = 1 + hit('kick', t, 0.15, 0.3) * 0.0;
      lanes.forEach((l, r) => {
        const dir = r % 2 ? 1 : -1;
        const sp = 60 + rand(r * 4) * 70;
        const x = -1200 + dir * ((dt * sp * boost) % 3400) * 0.5 + (dir > 0 ? -600 : 0);
        l.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
      });
    });
    ft(plane, { opacity: 0, scale: 1.4 }, { opacity: 1, scale: 1 }, T_HOOK, 1.2, 'expo.out');
    el('div', 'dim', null, root);
    const title = el('div', 'title', null, root);
    el('div', 'eyebrow', 'TRACKS <b>·</b> 曲目库', title);
    const n = el('div', 'n', '0', title);
    el('h2', null, '首曲目', title);
    el('p', null, `世界 ${S.tracks.filter((t) => t.scene === 'world').length} 首 · 中国区 ${S.tracks.filter((t) => t.scene === 'china').length} 首 · ${STAT.series} 个系列企划`, title);
    inUp([...title.children], T_HOOK + 0.2, 0.7, 50, 0.08);
    counter(n, T_HOOK + 0.2, 2.2, 0, STAT.tracks, 0, 'expo.out', T_TWISTA);
    // (Worldwide choppers) 95.55：主打曲卡片
    const wwc = S.tracks.find((t) => t.id === 'worldwide-choppers');
    const feat = el('div', 'feat card', null, root);
    img(wwc.thumb, null, feat);
    el('div', 'y', `${wwc.year} · ALL 6'S AND 7'S`, feat);
    el('h3', null, wwc.title, feat);
    el('p', null, '九位参与者、三种语言（英语、丹麦语、土耳其语）的跨国 chopper 合作。你现在听到的就是它。', feat);
    ft(feat, { opacity: 0, x: 200, rotateY: -30 }, { opacity: 1, x: 0, rotateY: 0 }, 95.55, 0.7, 'expo.out');
    flash(95.55, 0.5, 0.4);
    punch(95.55, 0.05);
    out([feat, title], BAR(55) - 0.1, 0.3, { x: -60 });
    tl.to(CAM, { s: 1.15, blur: 6, duration: T_TWISTA - BAR(55), ease: 'power3.in' }, BAR(55));
    tl.set(CAM, { s: 1, blur: 0 }, T_TWISTA);
  });

  /* =================================================================
   * 08 芝加哥 1992：Twista                     102.47 → 116.61
   * ================================================================= */
  chapter(8, 'CHICAGO 1992', T_TWISTA, '芝加哥 1992');
  flash(T_TWISTA, 1, 0.6);
  tl.to(FXP, { leak: 0.2, duration: 1 }, T_TWISTA);
  gset({ globe: 1, reveal: 1, lat: 44, lon: -88, dist: 380, shiftX: 0, shiftY: 0, markers: 1, cities: 1, labels: 1, arcsOutA: 0, hotCN: 0, stars: 0.3 }, T_TWISTA);
  g({ dist: 520, lat: 41.9 }, T_TWISTA, BAR(56) - T_TWISTA, 'power2.out');
  GLX.addLabel(41.88, -87.63, '<div class="in"><small>CHICAGO</small>芝加哥 · Twista</div>', 'big', (t) => (t > T_TWISTA + 0.1 && t < BAR(56) ? 1 : 0));
  gset({ globe: 0, labels: 0 }, BAR(56));
  scene('twista', BAR(56), BAR(60), (root) => {
    const tw = byId.twista;
    const por = el('div', 'portrait', null, root);
    const im = img(tw.img, null, por);
    el('div', 'tone', null, por);
    el('div', 'fade', null, por);
    ft(im, { scale: 1.3 }, { scale: 1.05 }, BAR(56), BAR(60) - BAR(56), 'power2.out');
    ft(por, { opacity: 0 }, { opacity: 1 }, BAR(56), 0.3, 'power2.out');
    const rt = el('div', 'rt', null, root);
    el('div', 'eyebrow', 'GUINNESS WORLD RECORDS <b>·</b> 1992', rt);
    F.fitText(el('h2', null, 'TWISTA', rt), 960);
    el('h3', null, '最快的英语说唱者', rt);
    inUp([...rt.children], BAR(56) + 0.1, 0.7, 60, 0.1);
    const cnt = el('div', 'cnt', null, root);
    const a = el('div', null, '<b>0</b><span>个音节</span>', cnt);
    const b = el('div', null, '<b>55</b><span>秒</span>', cnt);
    inUp(cnt, BAR(57), 0.5, 30);
    // 按 10.87 音节/秒 的真实速度往上跳——你看到的就是吉尼斯认证的速度
    const ab = a.querySelector('b');
    frame(BAR(57), BAR(60), (t) => { ab.textContent = Math.min(598, Math.floor((t - BAR(57)) * 10.87 * 1)); });
    const eqn = el('div', 'eqn', '598 <span class="dim">÷</span> 55 <span class="dim">≈</span> <span class="r">10.87</span>', root);
    inUp(eqn, BAR(58), 0.5, 20);
    const foot = el('div', 'foot', '计数器正按 10.87 音节 / 秒往上跳。这个纪录 1998 年被芝加哥的 Rebel XD 打破，吉尼斯 2008 年以后也不再认证新的"最快说唱"。', root);
    fadeIn(foot, BAR(58, 2), 0.6);
    tl.to(root, { opacity: 0, duration: 0.2 }, BAR(60) - 0.2);
  });

  // 速度阶梯：步进器按真实速率闪
  scene('ladder', BAR(60), BAR(63), (root) => {
    const val = el('div', 'val', '3<small>音节 / 秒</small>', root);
    const seq = el('div', 'seq', null, root);
    gsap.set(seq, { xPercent: -50, yPercent: -50, x: 0, y: 0 });
    const cells = Array.from({ length: 32 }, () => el('i', null, null, seq));
    const lbl = el('div', 'lbl', '', root);
    const presets = [
      [3, '90 BPM 的 8 分音符'], [6, '90 BPM 的 16 分音符'], [10.87, 'Twista 1992 · 吉尼斯'], [15.4, 'El Chojin 2008 · 吉尼斯'], [21, 'Crucified · 1 秒爆发'],
    ];
    const steps = el('div', 'steps', null, root);
    const stEls = presets.map(([v, l]) => el('span', null, `${l.split(' · ')[0]} · ${v}`, steps));
    el('div', 'note', '一格一个音节，按真实速度亮起（数据和站点首页的步进器一致）', root);
    const st = [BAR(60), BAR(60, 3), BAR(61, 2), BAR(62), BAR(62, 2)];
    ft([val, seq, lbl, steps], { opacity: 0, y: 30 }, { opacity: 1, y: 0, stagger: 0.05 }, BAR(60), 0.5, 'expo.out');
    st.forEach((s, i) => punch(s, 0.03 + i * 0.012, 0.3));
    frame(BAR(60), BAR(63), (t) => {
      let i = 0;
      for (let k = 0; k < st.length; k++) if (t >= st[k]) i = k;
      const [v, l] = presets[i];
      val.firstChild.nodeValue = String(v);
      lbl.textContent = l;
      stEls.forEach((e, k) => e.classList.toggle('on', k === i));
      const n = Math.floor((t - st[i]) * v);
      cells.forEach((c, k) => c.classList.toggle('on', k === n % 32 || (v > 10 && k === (n - 1 + 32) % 32)));
    });
    tl.to(CAM, { shake: 0.6, duration: BAR(63) - BAR(62), ease: 'power2.in' }, BAR(62));
    tl.set(CAM, { shake: 0 }, BAR(63));
  });

  /* =================================================================
   * 09 中国区                                  116.61 → 133.23
   * ================================================================= */
  const T_CN = BAR(63);
  chapter(9, 'CHINA', T_CN, '中国区');
  flash(T_CN, 1, 0.6);
  gset({ globe: 1, reveal: 1, lat: 30, lon: 70, dist: 900, shiftX: -420, shiftY: 0, markers: 1, cities: 1, labels: 1, hotCN: 0 }, T_CN);
  g({ lat: 33, lon: 106, dist: 520, hotCN: 1 }, T_CN, 2.2, 'power3.out');
  g({ spin: 6 }, T_CN + 2.2, BAR(72) - T_CN - 2.2, 'none');
  tl.to(FXP, { leak: 0.45, duration: 1 }, T_CN);
  S.regions.forEach((r) => r.cities.forEach((c) => {
    GLX.addLabel(c.geo[0], c.geo[1], `<div class="in"><small>${r.name}</small>${c.name}</div>`, 'cn', (t) => (t > T_CN + 1.6 && t < BAR(71) ? 1 : 0));
  }));
  scene('china', T_CN, BAR(72), (root) => {
    const hd = el('div', 'hd', null, root);
    el('div', 'eyebrow hot', 'CHINA <b>·</b> 中国区', hd);
    el('h2', null, '中国<span class="hot">快嘴</span>', hd);
    el('p', null, '从南京 D-Evil 的《Speed #1》，活死人的硬核快嘴，选秀舞台上的"机枪快嘴"，到 B 站和 QQ 群里自己组 cypher 的 chopper。', hd);
    inUp([...hd.children], T_CN + 0.2, 0.7, 60, 0.1);
    const st = el('div', 'st', null, root);
    const cnTracks = S.tracks.filter((t) => t.scene === 'china').length;
    const firstCn = S.timeline.filter((e) => e.scene === 'china').reduce((m, e) => Math.min(m, e.year), 9999);
    [[STAT.cn, '位人物'], [S.regions.length, '个地区'], [cnTracks, '首曲目'], [firstCn, '最早记录']].forEach(([n, l], i) => {
      const d = el('div', null, `<b>0</b><span>${l}</span>`, st);
      counter(d.querySelector('b'), T_CN + 0.6 + i * 0.1, 1.4, n > 1000 ? 1980 : 0, n, 0, 'expo.out', BAR(64));
    });
    inUp(st, T_CN + 0.5, 0.6, 30);
    out([hd, st], BAR(64) - 0.15, 0.2, { x: 80 });

    // 地区卡片：每小节一个
    S.regions.forEach((r, i) => {
      const c = el('div', 'reg card', null, root);
      el('div', 'no', String(i + 1).padStart(2, '0'), c);
      el('div', 'en', r.en || '', c);
      el('h3', null, r.name, c);
      el('p', null, r.summary, c);
      const who = el('div', 'who', null, c);
      S.artists.filter((a) => a.country === 'CN' && a.region === r.name).slice(0, 6).forEach((a) => {
        const s = el('span', null, null, who);
        av(a, null, s);
        s.appendChild(document.createTextNode(a.zh || a.name));
      });
      const a = BAR(64 + i), b = BAR(65 + i);
      gsap.set(c, { opacity: 0 });
      tl.fromTo(c, { opacity: 0, x: 120, rotateY: -12 }, { opacity: 1, x: 0, rotateY: 0, duration: 0.5, ease: 'expo.out', immediateRender: false }, a);
      tl.to(c, { opacity: 0, x: -60, duration: 0.2, ease: 'power2.in' }, b - 0.2);
      punch(a, 0.03, 0.4);
    });

    // 中国区人物绕一圈
    const ring = el('div', 'ring', null, root);
    const cn = S.artists.filter((a) => a.country === 'CN');
    const avs = cn.map((a) => av(a, null, ring));
    const rt = el('div', 'ringtxt', `${STAT.cn} 位中文快嘴与 chopper<small>按地区归档：川渝 · 新疆 · 西安 · 华东 · 华南 · 网络</small>`, root);
    gsap.set([ring, rt], { opacity: 0 });
    tl.set(ring, { opacity: 1 }, BAR(70));
    fadeIn(rt, BAR(70) + 0.2, 0.4);
    g({ globe: 0.25 }, BAR(70), 0.4);
    frame(BAR(70), BAR(72), (t) => {
      const k = ez('expo.out')(clamp01((t - BAR(70)) / 1.2));
      avs.forEach((e, i) => {
        const ang = (i / avs.length) * Math.PI * 2 + (t - BAR(70)) * 0.35;
        const rx = 760 * k, ry = 380 * k;
        e.style.left = 960 + Math.cos(ang) * rx + 'px';
        e.style.top = 540 + Math.sin(ang) * ry + 'px';
        e.style.opacity = k;
      });
    });
    tl.to(root, { opacity: 0, duration: 0.2 }, BAR(72) - 0.2);
  });

  /* =================================================================
   * 10 世界地图 · 合作连线 · 系列              133.23 → 147.99
   * ================================================================= */
  const T_MAP = BAR(72);
  chapter(10, 'WORLD MAP', T_MAP, '世界地图');
  g({ globe: 1, hotCN: 0, lat: 25, lon: 20, dist: 820, shiftX: 380, spin: 0 }, T_MAP, 1.4, 'power3.inOut');
  gset({ arcsColA: 1, arcsCol: 0, labels: 0 }, T_MAP);
  tl.fromTo(G, { arcsCol: 0 }, { arcsCol: 5, duration: 5, ease: 'none', immediateRender: false }, T_MAP + 0.3);
  g({ spin: 90 }, T_MAP + 1.4, BAR(76) - T_MAP - 1.4, 'none');
  scene('map', T_MAP, BAR(80), (root) => {
    const hd = el('div', 'hd', null, root);
    el('div', 'eyebrow', 'WORLD MAP <b>·</b> 世界 Chop 地图', hd);
    el('h2', null, `世界 <span class="gold">Chop</span>`, hd);
    el('p', null, '虚线连接同一首歌里合作过的国家，越粗合作越多。从美国中西部，到土耳其、韩国、菲律宾、巴西、格鲁吉亚。', hd);
    inUp([...hd.children], T_MAP + 0.2, 0.7, 50, 0.1);
    out(hd, BAR(76) - 0.2, 0.2);
    // 站点世界页
    const persp = el('div', 'persp', null, root);
    const pl = plate(persp, 'assets/img/site/world.jpg', 'zhishixuebao2026.github.io/chop/world/');
    gsap.set(pl.p, { opacity: 0 });
    tl.fromTo(pl.p, { opacity: 0, rotateY: -30, rotateX: 12, x: 500, z: -300 }, { opacity: 1, rotateY: -14, rotateX: 6, x: 0, z: 0, duration: 0.8, ease: 'expo.out', immediateRender: false }, BAR(76));
    tl.fromTo(pl.im, { y: 0 }, { y: -900, duration: BAR(80) - BAR(76), ease: 'power1.inOut', immediateRender: false }, BAR(76));
    g({ shiftX: -560, dist: 1100 }, BAR(76), 0.9, 'power3.inOut');
    const t2 = el('div', 'hd', null, root);
    el('div', 'eyebrow', 'THE SITE <b>·</b> /world/', t2);
    el('h2', null, '一首歌，<br/>三种语言', t2);
    t2.style.top = '330px';
    t2.style.width = '560px';
    inUp([...t2.children], BAR(76) + 0.2, 0.7, 40, 0.1);
    tl.to(root, { opacity: 0, duration: 0.2 }, BAR(78) - 0.2);
    gset({ globe: 0, arcsColA: 0 }, BAR(78));
  });

  // 系列企划：21 个名字飞快滚过
  scene('series', BAR(78), BAR(80), (root) => {
    const col = el('div', 'col', null, root);
    // 颜色和站点系列页一致：按 order 轮流用 --p1…--p6（深色主题的值）
    const PAL = ['#ff5a4a', '#e8b84a', '#45c2a8', '#e08cc2', '#ff9d55', '#b9c65a'];
    const hexA = (h, a) => `rgba(${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)},${a})`;
    // "XX Choppers" 只给前缀上色；没有 Chopper 字样的（Cypher、Kill、Inutilis…）整个名字上色
    const paint = (name) => {
      if (!/chopper/i.test(name)) return `<span class="px">${name}</span>`;
      return name.split(/(\bChoppers?\b|\s*\/\s*)/i).filter((x) => x).map((x) => (/^(Choppers?|\s*\/\s*)$/i.test(x) ? x : `<span class="px">${x}</span>`)).join('');
    };
    const list = [...S.series, ...S.series];
    const rows = list.map((sr) => {
      const r = el('div', null, paint(sr.name.replace(/（.*?）/g, '')), col);
      const c = PAL[(sr.order - 1 + 6) % 6];
      r.style.setProperty('--c', c);
      r.style.setProperty('--c2', hexA(c, 0.55));
      return r;
    });
    el('div', 'mask', null, root);
    const lab = el('div', 'lab eyebrow', 'SERIES <b>·</b> 系列企划', root);
    const cnt = el('div', 'cnt', `<b>${STAT.series}</b>个 chopper 系列`, root);
    fadeIn([lab, cnt], BAR(78), 0.3);
    const LH = 104 * 1.12;
    frame(BAR(78), BAR(80), (t) => {
      const k = ez('power2.inOut')(clamp01((t - BAR(78)) / (BAR(80) - BAR(78))));
      const y = 540 - LH / 2 - k * LH * (S.series.length + 2);
      col.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
      const cur = Math.round((540 - LH / 2 - y) / LH);
      rows.forEach((r, i) => r.classList.toggle('on', i === cur));
    });
    tl.to(CAM, { shake: 0.5, duration: 1, ease: 'power2.in' }, BAR(79));
    tl.set(CAM, { shake: 0 }, BAR(80));
  });

  /* =================================================================
   * 11 副歌：Chopper ≠ SPS kid                 147.99 → 162.76
   * ================================================================= */
  const T_KID = BAR(80);
  chapter(11, 'SPS KID', T_KID, 'Chopper ≠ SPS kid');
  flash(T_KID, 0.9, 0.5);
  tl.to(FXP, { leak: 0.3, duration: 1 }, T_KID);
  scene('kid', T_KID, BAR(88), (root) => {
    const hd = el('div', 'hd', null, root);
    el('div', 'eyebrow', '圈内的贬义说法 <b>·</b> "SPS KID"', hd);
    el('h2', null, '<span class="gold">CHOPPER</span><span class="ne">≠</span><span class="hot">SPS KID</span>', hd);
    inUp([...hd.children], T_KID, 0.6, 50, 0.1);
    punch(T_KID, 0.06);
    const tbl = el('div', 'tbl', null, root);
    const rows = [
      ['', 'SPS kid', 'Chopper', 'h'],
      ['追什么', '数字越高越好', '快，而且清楚'],
      ['吐字', '含糊，甚至胡乱发音', '每个音节都是词'],
      ['手段', '剪辑拼接、后期加速', '有 flow，现场也唱得出来'],
      ['取样', '只挑最快的 1 秒', '整首、长期地切'],
    ];
    rows.forEach((r, i) => {
      const tr = el('div', 'tr ' + (r[3] || ''), `<span>${r[0]}</span><p class="k">${r[1]}</p><p class="c">${r[2]}</p>`, tbl);
      ft(tr, { opacity: 0, y: 40 }, { opacity: 1, y: 0 }, T_KID + 0.5 + i * BEAT * 2, 0.5, 'expo.out');
    });
    out([hd, tbl], BAR(84) - 0.2, 0.2);

    // 标出来的 vs 听众逐字数的（站点百科的例子）
    const vs = el('div', 'vs', null, root);
    el('h3', null, '标出来的 <span class="dim">vs</span> <span class="gold">听众逐字数出来的</span>', vs);
    const mkr = (cls, name, sub, w, v, ghost) => {
      const r = el('div', 'r ' + cls, `<div class="l">${name}<small>${sub}</small></div><div class="b"><i class="${ghost ? 'ghost' : 'real'}"></i></div><div class="v">${v}</div>`, vs);
      r.querySelector('i').style.width = w + '%';
      return r;
    };
    const r1 = mkr('claim', 'LYB', '视频标题（2017）', 92.4, '46.2', true);
    const r2 = mkr('real', 'LYB', '听众放慢逐字数', 40, '18–20', false);
    const cap = el('div', 'cap', '一到快段就在滚同一个音节——<b>chopper 快，而且每个音节都是词、有 flow、能现场唱出来；SPS kid 只剩一个数字。</b>', vs);
    gsap.set(vs, { opacity: 0 });
    tl.set(vs, { opacity: 1 }, BAR(84));
    inUp(vs.querySelector('h3'), BAR(84), 0.5, 30);
    ft(r1, { opacity: 0, x: -60 }, { opacity: 1, x: 0 }, BAR(84, 2), 0.5, 'expo.out');
    ft(r1.querySelector('i'), { scaleX: 0 }, { scaleX: 1 }, BAR(84, 2), 0.9, 'expo.out');
    ft(r2, { opacity: 0, x: -60 }, { opacity: 1, x: 0 }, BAR(85, 2), 0.5, 'expo.out');
    ft(r2.querySelector('i'), { scaleX: 0 }, { scaleX: 1 }, BAR(85, 2), 0.9, 'expo.out');
    punch(BAR(85, 2), 0.05);
    inUp(cap, BAR(86, 2), 0.6, 30);
    tl.to(root, { opacity: 0, duration: 0.2 }, BAR(88) - 0.2);
  });

  /* =================================================================
   * 12 堪萨斯：可信度 · 来源 · 复算             162.76 → 177.53
   * ================================================================= */
  const T_SRC = BAR(88);
  chapter(12, 'SOURCES', T_SRC, '来源与可信度');
  flash(T_SRC, 0.9, 0.5);
  scene('conf', T_SRC, BAR(90), (root) => {
    const hd = el('div', 'hd', null, root);
    el('div', 'eyebrow', 'CONFIDENCE <b>·</b> 可信度标签', hd);
    el('h2', null, '每一条资料，都标清楚有多可信', hd);
    inUp([...hd.children], T_SRC, 0.5, 30, 0.08);
    const grid = el('div', 'grid', null, root);
    const items = [
      ['verified', '已证实', 'VERIFIED', '有权威或多个独立来源，数字可以复算', '✓'],
      ['disputed', '有争议', 'DISPUTED', '来源互相矛盾，或口径不清', '!'],
      ['pending', '待核实', 'PENDING', '只有单一来源，或来源可信度一般', '?'],
      ['debunked', '已辟谣', 'DEBUNKED', '已被证明错误', '×'],
    ];
    items.forEach(([k, zh, en, d, ic], i) => {
      const c = el('div', 'st card', `<div class="ic" style="background:${conf[k]}">${ic}</div><h3 style="color:${conf[k]}">${zh}</h3><div class="en">${en}</div><p>${d}</p>`, grid);
      c.style.setProperty('--c', conf[k]);
      ft(c, { opacity: 0, y: 140, rotateX: -30 }, { opacity: 1, y: 0, rotateX: 0 }, T_SRC + 0.3 + i * BEAT * 1.5, 0.6, 'expo.out');
      punch(T_SRC + 0.3 + i * BEAT * 1.5, 0.025, 0.3);
    });
    tl.to(root, { opacity: 0, duration: 0.15 }, BAR(90) - 0.15);
  });

  scene('src', BAR(90), BAR(92), (root) => {
    const tk = el('div', 'ticker', null, root);
    const col = el('div', 'col', null, tk);
    const titles = S.sourceTitles;
    for (let i = 0; i < titles.length; i++) el('div', null, titles[i], col);
    el('div', 'fade', null, tk);
    const n = el('div', 'n', '0', root);
    const l = el('div', 'lbl', '条独立来源', root);
    const p = el('div', 'p', '人物、曲目、时间线的每一条都附出处：维基百科、官方频道、榜单原始文档、B 站和知乎的原帖。', root);
    counter(n, BAR(90), 2.4, 0, STAT.sources, 0, 'expo.out', BAR(92));
    inUp([l, p], BAR(90) + 0.3, 0.6, 30, 0.1);
    frame(BAR(90), BAR(92), (t) => {
      const y = -(t - BAR(90)) * 420;
      col.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
    });
    fadeIn(tk, BAR(90), 0.4);
  });

  // 鼓停：数字都可以复算
  scene('recalc', BAR(92), BAR(96), (root) => {
    tl.to(FXP, { leak: 0, lb: 110, duration: 0.6 }, BAR(92));
    const l1 = el('div', 'line', '每一个数字，', root);
    const l2 = el('div', 'line', '都可以<span class="gold">复算</span>。', root);
    l1.style.top = '230px'; l2.style.top = '360px';
    ft(F.splitChars(l1), { opacity: 0, filter: 'blur(10px)' }, { opacity: 1, filter: 'blur(0px)', stagger: 0.08 }, BAR(92) + 0.1, 0.6, 'power2.out');
    ft(l2, { opacity: 0, filter: 'blur(10px)' }, { opacity: 1, filter: 'blur(0px)' }, BAR(93), 0.8, 'power2.out');
    const eqs = el('div', 'eqs', null, root);
    const list = [
      ['598 ÷ 55', '10.87', 'Twista · 1992 吉尼斯'],
      [`${cru.syl} ÷ ${cru.sec}`, String(cru.v), 'Crucified · 1 秒爆发'],
      ['799 ÷ 46', '17.37', 'Crucified · 现场 46 秒'],
    ];
    list.forEach(([a, r, s], i) => {
      const d = el('div', null, `${a} <span class="dim">≈</span> <span class="r">${r}</span><small>${s}</small>`, eqs);
      ft(d, { opacity: 0, x: -30 }, { opacity: 1, x: 0 }, BAR(93, 2) + i * BEAT * 2, 0.5, 'expo.out');
    });
    tl.to(FXP, { lb: 0, duration: 0.4 }, BAR(95, 2));
    tl.to(CAM, { s: 1.08, duration: BAR(96) - BAR(95), ease: 'power2.in' }, BAR(95));
    tl.set(CAM, { s: 1 }, BAR(96));
    tl.to(root, { opacity: 0, duration: 0.2 }, BAR(96) - 0.2);
  });

  /* =================================================================
   * 13 加州 · 收尾：一小节一个栏目，最后落版   177.53 → 结束
   * ================================================================= */
  const T_FIN = BAR(96);
  chapter(13, 'FINALE', 176.69, '收尾');
  flash(T_FIN, 1, 0.6);
  tl.to(FXP, { leak: 0.6, duration: 1 }, T_FIN);
  tl.set(CAM, { kickZoom: 0.9 }, T_FIN);
  scene('final', T_FIN, BAR(103), (root) => {
    const secs = [
      ['CHINA', '中国区', '川渝、新疆、西安、华东、华南，和网络上的新一代 chopper。', 'china', 'china/', 'cn'],
      ['WORLD', '世界', `${STAT.countries} 个国家和地区，一张点阵地球。`, 'world', 'world/', ''],
      ['PEOPLE', '人物', `${STAT.artists} 位：分清快嘴和 Chopper。`, 'choppers', 'choppers/', ''],
      ['TRACKS', '曲目', `${STAT.tracks} 首，每首都标了出处。`, 'tracks', 'tracks/', ''],
      ['SERIES', '系列', `${STAT.series} 个 chopper 系列企划。`, 'series', 'series/', ''],
      ['TIMELINE', '时间线', '1980 到今天，左边世界，右边中国区。', 'timeline', 'timeline/', ''],
      ['LEARN', '百科', '快嘴 ≠ Chop、起源、测速口径、吉尼斯。', 'learn', 'learn/', ''],
    ];
    secs.forEach(([en, zh, ds, shot, path, tone], i) => {
      const s = el('div', 'sec', null, root);
      const pl = plate(s, `assets/img/site/${shot}.jpg`, `zhishixuebao2026.github.io/chop/${path}`);
      el('div', 'ix', `${String(i + 1).padStart(2, '0')} / 07`, s);
      el('div', 'en', en, s);
      const nm = F.fitText(el('div', 'nm', zh, s), 560);
      if (tone === 'cn') nm.style.color = 'var(--hot)';
      el('div', 'ds', ds, s);
      const a = BAR(96 + i), b = BAR(97 + i);
      gsap.set(s, { opacity: 0 });
      tl.set(s, { opacity: 1 }, a);
      tl.set(s, { opacity: 0 }, b);
      tl.fromTo(pl.p, { x: 300, rotateY: -25, scale: 0.9 }, { x: 0, rotateY: -8, scale: 1, duration: 0.6, ease: 'expo.out', immediateRender: false }, a);
      tl.fromTo(pl.im, { y: 0 }, { y: -700, duration: b - a, ease: 'power1.in', immediateRender: false }, a);
      tl.fromTo(nm, { x: -80, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: 'expo.out', immediateRender: false }, a);
      pl.p.style.transformPerspective = '2000px';
      // 每小节的第 3、4 拍插两张人物的快切
      [2, 3].forEach((bt, k) => {
        const pick = S.artists[(i * 7 + k * 31 + 5) % S.artists.length];
        const c = el('div', 'cut', null, root);
        img(pick.img, null, c);
        el('div', 'w', zh, c);
        gsap.set(c, { opacity: 0 });
        const ta = BAR(96 + i, bt + 0.5), tb = BAR(96 + i, bt + 1);
        if (i >= 5) { tl.set(c, { opacity: 1 }, ta); tl.set(c, { opacity: 0 }, tb); }
      });
    });
  });

  // 落版
  const T_END = BAR(103);
  scene('end', T_END, F.DURATION + 1, (root) => {
    el('div', 'glow', null, root);
    const logo = el('div', 'logo', null, root);
    gsap.set(logo, { xPercent: -50, yPercent: -50, x: 0, y: 0 });
    const lb = el('b', 'bars', '<i></i><i></i><i></i><i></i><i></i>', logo);
    el('span', null, 'CHOP<em>/</em>', logo);
    const sub = el('div', 'sub', '快嘴档案馆', root);
    const desc = el('div', 'desc', 'Chopper 快嘴说唱 · 人物、曲目、时间线、速度数据 · 每条资料都附来源和可信度标签', root);
    const url = el('div', 'url', 'zhishixuebao2026.github.io/chop', root);
    gsap.set(url, { xPercent: -50, x: 0 });
    const stats = el('div', 'stats', `<span><b>${STAT.cn}</b>位中国区人物</span><span><b>${STAT.world}</b>位世界人物</span><span><b>${STAT.tracks}</b>首曲目</span><span><b>${STAT.sources}</b>条独立来源</span>`, root);
    gsap.set(stats, { xPercent: -50, x: 0 });
    el('div', 'credit', '音乐：Tech N9ne ft. Ceza, JL B.Hood, U$O, Yelawolf, Twista, Busta Rhymes, D-Loc, Twisted Insane《Worldwide Choppers》（2011）剪辑版 · 非商业展示', root);
    const hs = [0.45, 0.8, 1, 0.65, 0.3];
    const bars = [...lb.children];
    flash(T_END, 1, 0.8);
    punch(T_END, 0.12, 1.2);
    ft(logo, { opacity: 0, scale: 1.4, filter: 'blur(24px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)' }, T_END, 0.9, 'expo.out');
    ft(bars, { scaleY: 0 }, { scaleY: (i) => hs[i], stagger: 0.06 }, T_END + 0.1, 0.6, 'back.out(2)');
    ft(sub, { opacity: 0, letterSpacing: '1.8em' }, { opacity: 1, letterSpacing: '0.9em' }, 191.04, 1.2, 'expo.out');
    inUp([desc], 191.5, 0.8, 20);
    ft(url, { opacity: 0, y: 20 }, { opacity: 1, y: 0 }, 191.9, 0.8, 'expo.out');
    ft(stats, { opacity: 0, y: 20 }, { opacity: 1, y: 0 }, 192.3, 0.8, 'expo.out');
    tl.to(FXP, { hud: 0, leak: 0.25, duration: 1 }, T_END);
    tl.to(CAM, { kickZoom: 0, duration: 0.5 }, T_END);
    frame(T_END, F.DURATION + 1, (t) => {
      const fade = clamp01((192.4 - t) / 1.2);
      const lv = [env('low', t), env('mid', t), env('rms', t), env('high', t), env('mid', t - 0.06)];
      if (t > T_END + 0.8) bars.forEach((b, i) => (b.style.transform = `scaleY(${(hs[i] * (1 - fade * 0.5 + lv[i] * 0.6 * fade)).toFixed(3)})`));
    });
  });

  // 结尾留一点余味：最后 0.8 秒画面慢慢变暗但不黑屏
  tl.to(CAM, { bright: 0.85, duration: 1.2, ease: 'power1.in' }, F.DURATION - 1.3);
  tl.set({}, {}, F.DURATION + 0.5);
})();
