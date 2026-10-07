/* 霧笛 MV — boot, playback clock, UI. */
'use strict';
(function (MV) {
  const $ = (id) => document.getElementById(id);
  const Q = new URLSearchParams(location.search);
  const STILL = Q.has('still');
  const audio = $('song'), canvas = $('gl');
  let quality = parseFloat(Q.get('q') || localStorageGet('kiriteki.q') || '1');
  let playing = false, clockBase = 0, perfBase = 0, pausedAt = parseFloat(Q.get('t') || '0') || 0, uiTimer = 0, debug = Q.has('debug');
  const fpsHist = [];

  function localStorageGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function localStorageSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  function fail(msg) { const e = $('err'); e.textContent = msg; e.classList.remove('hidden'); }
  window.addEventListener('error', (ev) => { if (!STILL) fail('エラー: ' + ev.message); });

  // ---------------------------------------------------------------- clock (audio is the master; perf.now() smooths between audio updates)
  function now() {
    if (!playing) return pausedAt;
    const at = audio.currentTime; const pt = performance.now() / 1000;
    if (Math.abs(at - clockBase) > 0.001) { clockBase = at; perfBase = pt; }
    return Math.min(MV.dur, clockBase + (pt - perfBase));
  }
  function play() {
    if (pausedAt >= MV.dur - 0.05) pausedAt = 0;
    audio.currentTime = pausedAt; clockBase = pausedAt; perfBase = performance.now() / 1000;
    const p = audio.play(); playing = true; setIcon();
    if (p && p.catch) p.catch(() => { /* autoplay blocked or no audio: keep running on the perf clock */ });
  }
  function pause() { pausedAt = now(); audio.pause(); playing = false; setIcon(); }
  function seek(t) { t = MV.clamp(t, 0, MV.dur - 0.01); pausedAt = t; clockBase = t; perfBase = performance.now() / 1000; audio.currentTime = t; }
  function setIcon() { $('ppicon').setAttribute('d', playing ? 'M7 5h4v14H7zM13 5h4v14h-4z' : 'M8 5.5v13l11-6.5z'); }
  audio.addEventListener('ended', () => { playing = false; pausedAt = MV.dur; setIcon(); showUI(); });

  // ---------------------------------------------------------------- sizing (16:9 letterbox; internal resolution follows quality)
  function resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    let w = vw, h = vw * 9 / 16; if (h > vh) { h = vh; w = vh * 16 / 9; }
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let rw = Math.round(Math.min(w * dpr, 1920 * quality) / 2) * 2; if (STILL) rw = parseInt(Q.get('w') || '1280', 10);
    const rh = Math.round(rw * 9 / 16 / 2) * 2;
    canvas.width = rw; canvas.height = rh;
    if (MV.R.gl) MV.R.resize(rw, rh);
  }
  window.addEventListener('resize', resize);

  // ---------------------------------------------------------------- UI
  function fmt(t) { const m = Math.floor(t / 60); const s = (t % 60).toFixed(1).padStart(4, '0'); return `${m}:${s}`; }
  function showUI() { $('ui').classList.remove('hidden'); document.body.classList.remove('nocursor'); clearTimeout(uiTimer); uiTimer = setTimeout(() => { if (playing) { $('ui').classList.add('hidden'); document.body.classList.add('nocursor'); } }, 2600); }
  function buildTimeline() {
    const sec = $('tlsec'); const names = { v1: 'A1', pc1: 'B1', c1: 'サビ1', v2: 'A2', pc2: 'B2', c2: 'サビ2', br: 'Cメロ', inst: '間奏', fc: '大サビ', out: '終' };
    MV.sections.forEach((s) => { if (!names[s[0]]) return; const sp = document.createElement('span'); sp.style.left = (s[1] / MV.dur * 100) + '%'; const b = document.createElement('b'); b.textContent = names[s[0]]; sp.appendChild(b); sec.appendChild(sp); });
    const tl = $('tl'); let drag = false;
    const at = (ev) => { const r = tl.getBoundingClientRect(); return MV.clamp((ev.clientX - r.left) / r.width) * MV.dur; };
    tl.addEventListener('pointerdown', (ev) => { drag = true; tl.setPointerCapture(ev.pointerId); seek(at(ev)); });
    tl.addEventListener('pointermove', (ev) => { if (drag) seek(at(ev)); });
    tl.addEventListener('pointerup', () => { drag = false; });
  }
  function updateUI(t) {
    $('time').textContent = `${fmt(t)} / ${fmt(MV.dur)}`;
    const f = (t / MV.dur * 100) + '%'; $('tlfill').style.width = f; $('tlhead').style.left = f;
  }
  function toggleFS() { const el = document.documentElement; if (!document.fullscreenElement) (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el); else (document.exitFullscreen || document.webkitExitFullscreen).call(document); }
  window.addEventListener('keydown', (ev) => {
    if (ev.target.tagName === 'SELECT') return;
    if (ev.code === 'Space') { ev.preventDefault(); if (!started) return start(); playing ? pause() : play(); showUI(); }
    else if (ev.code === 'ArrowRight') { seek(now() + (ev.shiftKey ? 1 : 5)); showUI(); }
    else if (ev.code === 'ArrowLeft') { seek(now() - (ev.shiftKey ? 1 : 5)); showUI(); }
    else if (ev.key === 'f' || ev.key === 'F') toggleFS();
    else if (ev.key === 'h' || ev.key === 'H') { const u = $('ui'); u.classList.toggle('hidden'); }
    else if (ev.key === 'd' || ev.key === 'D') { debug = !debug; $('dbg').classList.toggle('hidden', !debug); }
    else if (ev.key === '.' && !playing) { seek(now() + 1 / 30); }
    else if (ev.key === ',' && !playing) { seek(now() - 1 / 30); }
  });
  window.addEventListener('pointermove', () => { if (started) showUI(); });
  $('pp').addEventListener('click', () => { playing ? pause() : play(); });
  $('fs').addEventListener('click', toggleFS);
  $('quality').value = String(quality);
  $('quality').addEventListener('change', (ev) => { quality = parseFloat(ev.target.value); localStorageSet('kiriteki.q', String(quality)); resize(); });

  // ---------------------------------------------------------------- boot
  let started = false;
  async function boot() {
    try {
      const prog = (f, label) => { $('loadfill').style.width = (f * 100).toFixed(1) + '%'; $('loadtxt').textContent = label; };
      prog(0.02, 'フォント');
      await Promise.all(['KM Mincho', 'KM MinchoB', 'KM Brush', 'KM Hand', 'KM Mono'].map((f) => document.fonts.load(`32px "${f}"`, 'さよなら霧笛0'))).catch(() => {});
      await MV.assets.loadScripts(MV.MANIFEST, (f, n) => prog(0.05 + f * 0.75, '素材 ' + Math.round(f * 100) + '%'));
      prog(0.82, 'デコード');
      await MV.assets.decode((f) => prog(0.82 + f * 0.1, 'デコード ' + Math.round(f * 100) + '%'));
      resize();
      MV.R.init(canvas); resize();
      prog(0.94, 'シェーダー');
      // pre-build glyph atlases and upload textures in small batches (avoids one huge stall)
      MV.T.atlas('mincho', 128); MV.T.atlas('minchoB', 128); MV.T.atlas('hand', 128);
      const names = Object.keys(MV.assets.img);
      for (let i = 0; i < names.length; i++) { MV.assets.get(names[i]); if (i % 4 === 3) await new Promise((r) => requestAnimationFrame(r)); prog(0.94 + 0.06 * (i / names.length), 'テクスチャ'); }
      // warm up every shader with a frame
      MV.D.render(pausedAt);
      prog(1, '準備完了');
      buildTimeline();
      if (STILL) { stillFrame(); return; }
      $('playbtn').disabled = false; $('playbtn').focus();
    } catch (e) { console.error(e); fail('初期化に失敗しました: ' + e.message + '\nWebGL2 対応ブラウザ（Chrome / Edge / Firefox / Safari 15+）でお試しください。'); }
  }
  function start() { if (started) return; started = true; $('intro').classList.add('gone'); play(); showUI(); requestAnimationFrame(loop); }
  $('playbtn').addEventListener('click', start);

  let lastFrame = performance.now(), downgraded = false, slowFrames = 0;
  function loop() {
    const t = now();
    MV.D.render(t);
    updateUI(t);
    const pn = performance.now(); const dt = pn - lastFrame; lastFrame = pn; fpsHist.push(dt); if (fpsHist.length > 60) fpsHist.shift();
    // automatic quality step-down if the GPU struggles (once)
    if (playing && dt > 40) slowFrames++; else slowFrames = Math.max(0, slowFrames - 1);
    if (!downgraded && slowFrames > 90 && quality > 0.75) { downgraded = true; quality = 0.75; $('quality').value = '0.75'; resize(); }
    if (debug) { const avg = fpsHist.reduce((a, b) => a + b, 0) / fpsHist.length; const act = MV.D.active(t); $('dbg').textContent = `t ${t.toFixed(2)}  fps ${(1000 / avg).toFixed(0)}  ${canvas.width}x${canvas.height}\nshot ${act.a.t0.toFixed(2)}${act.b ? ' → ' + act.b.t0.toFixed(2) + ' ' + act.w.toFixed(2) : ''}  ${MV.section(t)}`; }
    requestAnimationFrame(loop);
  }
  // deterministic still frames for review: ?still&t=73.5&w=1280
  async function stillFrame() {
    $('intro').classList.add('gone');
    const t = pausedAt;
    // pre-roll so time-dependent canvases (brush, sketch) are built up to t
    for (let k = 8; k >= 0; k--) { MV.D.render(Math.max(0, t - k * 0.12)); }
    MV.D.render(t);
    window.__frameReady = true;
  }
  window.MV_STILL = async function (t) { MV.D.render(Math.max(0, t - 0.5)); MV.D.render(Math.max(0, t - 0.2)); MV.D.render(t); return true; };
  boot();
})(window.MV);
