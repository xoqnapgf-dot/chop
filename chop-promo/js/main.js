/* =====================================================================
 * CHOP/ 宣传片 · 启动
 * 网址参数：
 *   ?t=95      从第 95 秒开始
 *   ?clean=1   隐藏 HUD 和播放条（录屏用）
 *   ?autoplay=1 加载完自动播放（浏览器可能要求先点一下）
 *   ?render=1  逐帧渲染模式：不放音频，提供 window.renderFrame(t)，给无头浏览器截帧用
 * ===================================================================== */
(function () {
  'use strict';
  const F = window.FILM;
  const p = F.params;
  const cover = document.getElementById('cover');
  const btn = document.getElementById('play');
  const btnLabel = document.getElementById('play-label');
  document.body.classList.add('covered');
  if (p.get('clean') === '1') document.body.classList.add('clean');

  F.start();
  const t0 = Math.max(0, Math.min(F.DURATION, parseFloat(p.get('t')) || 0));
  F.seek(t0);

  const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  let pct = 0;
  const loadFill = document.getElementById('load-fill');
  const show = () => { btnLabel.textContent = `加载中 ${Math.round(pct * 100)}%`; loadFill.style.width = pct * 100 + '%'; };
  const imgs = F.preloadAll((k) => { pct = k * 0.9; show(); });
  const audio = document.getElementById('audio');
  const audioReady = new Promise((res) => {
    if (audio.readyState >= 3) return res();
    audio.addEventListener('canplaythrough', res, { once: true });
    audio.addEventListener('error', res, { once: true });
    setTimeout(res, 8000); // 本地打开时有的浏览器不触发 canplaythrough
  });

  function begin() {
    cover.classList.add('gone');
    document.body.classList.remove('covered');
    F.play();
  }

  if (p.get('render') === '1') {
    // 逐帧渲染：外部脚本调用 renderFrame(t) 后截图
    cover.style.display = 'none';
    document.body.classList.remove('covered');
    document.body.classList.add('clean');
    window.renderFrame = (t) => { F.seek(t); return true; };
    Promise.all([fontsReady, imgs]).then(() => { F.runFit(); F.seek(t0); window.__ready = true; });
    return;
  }

  Promise.all([fontsReady, imgs, audioReady]).then(() => {
    pct = 1;
    show();
    document.getElementById('cover').classList.add('ready');
    F.runFit();
    btn.disabled = false;
    btnLabel.textContent = t0 > 0 ? `从 ${Math.floor(t0 / 60)}:${String(Math.floor(t0 % 60)).padStart(2, '0')} 播放` : '播放宣传片';
    F.seek(t0);
    if (p.get('autoplay') === '1') begin();
  });
  btn.addEventListener('click', begin);
  window.addEventListener('keydown', (e) => {
    if (document.body.classList.contains('covered') && !btn.disabled && (e.code === 'Space' || e.key === 'Enter')) { e.preventDefault(); begin(); }
  });
})();
