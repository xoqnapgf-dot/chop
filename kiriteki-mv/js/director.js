/* 霧笛 MV — director: schedules shots and transitions, builds the per-shot drawing context
   (plates, particles, text, brush, optical ripples, sheen, glass, …), draws the HUD, then post. */
'use strict';
(function (MV) {
  const { R, G, T, MG, Sketch, clamp, lerp, smooth, E, kf } = MV; const B = MV.Brush;
  const D = (MV.D = {});
  const TT = { cut: 0, fade: 1, fog: 2, flash: 3, ink: 4, burn: 5, wipe: 6, iris: 7, zoom: 8, push: 9, glitch: 10, ripple: 11, leak: 12 };
  const brushCache = {}, sketchCache = {}, glassCache = {};

  // ---------------------------------------------------------------- active shots at time t
  D.active = function (t) {
    const S = MV.shots; let i = 0;
    for (let k = 0; k < S.length; k++) if (t >= S[k].t0) i = k;
    const cur = S[i]; const res = { a: cur, b: null, w: 0, tr: null };
    const tin = cur.tin && cur.tin.type !== 'cut' ? cur.tin : null;
    if (tin && i > 0 && t < cur.t0 + tin.dur / 2) { res.a = S[i - 1]; res.b = cur; res.w = clamp((t - (cur.t0 - tin.dur / 2)) / tin.dur); res.tr = tin; return res; }
    const nx = S[i + 1];
    if (nx && nx.tin && nx.tin.type !== 'cut' && t >= nx.t0 - nx.tin.dur / 2) { res.a = cur; res.b = nx; res.w = clamp((t - (nx.t0 - nx.tin.dur / 2)) / nx.tin.dur); res.tr = nx.tin; }
    return res;
  };

  // ---------------------------------------------------------------- context given to shot.draw
  function makeCtx(shot, t, mgAlpha) {
    const post = {};
    const c = {
      t, lt: t - shot.t0, p: clamp((t - shot.t0) / (shot.t1 - shot.t0)), d: shot.t1 - shot.t0, shot,
      _plate: null,
      post(o) { Object.assign(post, o); },
      mg: MG,
      plate(name, cam, o = {}) {
        if (o.waterAll) { o.water = o.waterAll * 1.0; }
        R.plate(name, cam, o);
        const img = MV.assets.get(name); c._plate = { name, cam: Object.assign({ x: 0, y: 0, zoom: 1, roll: 0, par: [0, 0], focus: 0.5, dolly: 0 }, cam), asp: img ? img.asp : 1.78 };
        c._plate.cam._zoom = c._plate.cam.zoom * Math.max(1, R.asp / c._plate.asp);
      },
      project(u, v, z = 0.5) { const P = c._plate; if (!P) return [0, 0]; return R.project(P.cam, u, v, z, P.asp); },
      sea: (o) => R.sea(o), fogfly: (o) => R.fogfly(o),
      solid(col) { G.clear(col[0], col[1], col[2], 1); },
      particles: (type, o) => R.particles(type, o),
      sprite: (n, o) => R.sprite(n, o),
      fogLayer: (o) => R.fogLayer(o),
      beam: (o) => R.beam(o),
      glow(o) { R.sprite(null, { shape: 'glow', x: o.x, y: o.y, w: o.r * 2, h: o.r * 2, tint: o.col, add: true, linear: true }); },
      text(id, st) { const ph = MV.phrase[id]; if (!ph) return; T.draw(ph, st, t); },
      brush(key, text, times, o = {}) {
        let b = brushCache[key]; if (!b) b = brushCache[key] = B.create(text, times, { cell: o.cell, weight: o.weight, mode: o.mode, maxCharDur: o.maxCharDur });
        B.draw(b, t, o);
      },
      bigGlyph(ch, o = {}) {
        const tex = T.big(ch, o.font || 'minchoB', 512); const a = o.alpha ?? 1; if (a <= 0) return;
        if (o.halo) R.sprite(tex, { x: o.x, y: o.y, h: o.h * 1.05, w: o.h * 1.05, tint: o.halo, alpha: a * (o.haloA ?? 0.75), lod: 4.5, premul: true, linear: true });
        if (o.glow) R.sprite(tex, { x: o.x, y: o.y, h: o.h * 1.04, w: o.h * 1.04, tint: o.col, alpha: a * o.glow, lod: 4, add: true, premul: true, linear: true });
        R.sprite(tex, { x: o.x, y: o.y, h: o.h, w: o.h, tint: o.col, alpha: a, premul: true, linear: true, dissolve: o.dissolve ?? 0, fogMask: o.fog ?? 0, seed: 5 });
      },
      morphGlyph(a, b, o) {
        const k = o.k; const ta = T.big(a, 'minchoB', 512), tb = T.big(b, 'minchoB', 512);
        // the lower part of 霧 rains away first; the 雨 radical rises and becomes 雨
        R.sprite(ta, { x: o.x, y: o.y + k * 0.05, h: o.h, w: o.h, tint: o.col, alpha: 1 - smooth(0.55, 1, k), premul: true, linear: true, dissolve: k * 1.4, dGrad: [0, -1.2], seed: 2 });
        R.sprite(tb, { x: o.x, y: o.y + (1 - k) * -0.12, h: o.h * lerp(0.5, 1, E.out3(k)), w: o.h * lerp(0.5, 1, E.out3(k)), tint: o.col, alpha: smooth(0.35, 0.9, k), premul: true, linear: true });
      },
      stringsShot(list, o) { R.strings(list, o); },
      ripple(x, y, t0, k = 1) { (post.ripples = post.ripples || []).push([x, y, t0, k]); },
      voiceRipples(x, y, k = 1) { const per = MV.beatLen; for (let j = 0; j < 4; j++) { const te = Math.floor(t / per) * per - j * per; const e = MV.a('voc', te + 0.05); if (e > 0.3) c.ripple(x, y, te, e * k); } },
      sheen(ch, o = {}) { const ev = MV.recent(ch, t, 1.6); if (!ev.length) return [0, 0, 0.1, 0]; const [te, st] = ev[0]; const age = t - te; const hw = R.asp / 2; return [lerp(-hw - 0.3, hw + 0.3, clamp(age / 1.1)), o.ang ?? -0.6, o.w ?? 0.16, (o.k ?? 0.9) * Math.max(0.35, st) * (1 - smooth(0.8, 1.4, age))]; },
      disc(name, o) {
        const prev = R.target; G.bind(R.rtD); G.clear(0, 0, 0, 1);
        const cam = { x: o.ox ?? 0, y: o.oy ?? 0, zoom: o.zoom ?? 1.2, par: [Math.sin(t * 0.5) * (o.par ?? 0.01), 0], focus: 0.5 };
        R.plate(name, cam, { duo: o.duo ?? 0, duoA: o.duoA, duoB: o.duoB, grade: o.grade });
        G.bind(prev); R.maskComp(R.rtD, { shape: 'circle', x: o.x, y: o.y, r: o.r, soft: o.soft ?? 0.02 });
      },
      split(fns, o = {}) {
        const prev = R.target; const k = o.k ?? 1; const gap = o.gap ?? 0.005; const hw = R.asp / 2;
        fns.forEach((fn, i) => {
          G.bind(R.rtD); G.clear(0, 0, 0, 1); fn(c);
          G.bind(prev);
          const x0 = i === 0 ? -hw : gap / 2 + (1 - k) * hw, x1 = i === 0 ? -gap / 2 - (1 - k) * hw * 0 : hw;
          R.maskComp(R.rtD, { shape: 'rect', rect: i === 0 ? [-hw, -0.5, -gap / 2, 0.5] : [x0, -0.5, x1, 0.5], alpha: i === 0 ? 1 : k });
        });
      },
      sketch(name, prog) {
        let k = sketchCache[name]; if (!k) k = sketchCache[name] = Sketch.create(MV.LINEART[name], 2048, 1152, { focus: [0.45, 0.42] });
        Sketch.update(k, prog); return k;
      },
      glassText(id, t0, o = {}) {
        let g = glassCache[id]; if (!g) { const cv = document.createElement('canvas'); cv.width = 960; cv.height = 540; g = glassCache[id] = { cv, ctx: cv.getContext('2d'), tex: null }; }
        const ph = MV.phrase[id]; const ctx = g.ctx; ctx.clearRect(0, 0, 960, 540);
        const sz = (o.size ?? 0.07) * 540; ctx.font = `${Math.round(sz)}px ${T.fonts.hand}`; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.filter = 'blur(1.4px)'; ctx.strokeStyle = '#fff'; ctx.lineWidth = sz * 0.085; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        const x = ((o.x ?? 0) / R.asp + 0.5) * 960; let y = ((o.y ?? -0.2) + 0.5) * 540;
        ph.chars.forEach((ch, i) => { const k = clamp((t - (ch.t - 0.05)) / 0.45); if (k <= 0) return; ctx.globalAlpha = k; ctx.strokeText(ch.c, x, y + i * sz * 1.08); ctx.fillText(ch.c, x, y + i * sz * 1.08); });
        if (!g.tex) g.tex = G.tex(g.cv, { mip: false, premul: true }); else G.updateTex(g.tex, g.cv);
        return g.tex;
      },
      beamText(id, o) {
        const piv = c.project(o.beamU, o.beamV, 0.15);
        T.draw(MV.phrase[id], Object.assign(MV.styles.V(o.x, o.y, o.size, { col: MV.COL.white.map((v) => v * 1.6), glow: 0.7 }), {
          alphaFn: (i, px, py) => { const ang = Math.atan2(py - piv[1], px - piv[0]); const da = Math.abs(((ang - o.ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI); return 0.04 + smooth(o.w * 1.3, o.w * 0.2, da) * 1.1; },
        }), t);
      },
      messageBox(o) { drawMessage(c, o); },
      objects(o) { drawObjects(c, o); },
      reels(o) { const ctx = MG; [-0.115, 0.115].forEach((dx) => { const cx = o.x + dx * o.h / 0.5, cy = o.y + 0.012 * o.h / 0.5; for (let k = 0; k < 6; k++) { const a = o.t * 2.4 + k * Math.PI / 3; ctx.line(cx + Math.cos(a) * 0.012, cy + Math.sin(a) * 0.012, cx + Math.cos(a) * 0.028, cy + Math.sin(a) * 0.028, { alpha: 0.75, w: 0.002, color: 'rgba(255,240,220,0.9)' }); } }); },
      burnOver(name, o) { R.sprite(name, { x: o.pt ? 0.02 : 0, y: -0.01, h: o.h ?? 0.62, rot: -0.03, burn: o.p, burnPt: [0.0, 0.0], seed: 3 }); },
      lensRain(o) { if (o.amt <= 0) return; R.particles('bokeh', { count: Math.round(50 * o.amt), size: 0.03, col: [0.8, 0.85, 0.9], alpha: 0.5 * o.amt, vel: [0, 0.02], seed: 77 }); R.particles('rain', { count: Math.round(260 * o.amt), size: 0.04, col: [0.8, 0.85, 0.9], alpha: 0.35 * o.amt, vel: [-0.05, 1.5], seed: 78 }); },
    };
    MG.alpha = mgAlpha;
    return { c, post };
  }


  // ---------------------------------------------------------------- instrument strings overlay (vibrating, stem-driven)
  function drawStrings(c, name) {
    const S = MV.META[name] && MV.META[name].strings; if (!S) return;
    const ch = { gtr: 'gtr', bass: 'bass', vln: 'vln', cajon: 'snare' }[name] || 'gtr';
    const col = { gtr: MV.COL.crim, bass: MV.COL.pink, vln: MV.COL.sea, cajon: MV.COL.silv }[name];
    const env = MV.a(ch, c.t); const ev = MV.recent(ch === 'snare' ? 'snare' : ch, c.t, 1.2);
    const list = [];
    S.forEach((s, k) => {
      const p0 = c.project(s[0], s[1], s[4] ?? 0.6), p1 = c.project(s[2], s[3], s[4] ?? 0.6);
      const N = 48; const pts = []; const dx = p1[0] - p0[0], dy = p1[1] - p0[1]; const len = Math.hypot(dx, dy) || 1; const nx = -dy / len, ny = dx / len;
      let amp = env * 0.004; for (const [te, st] of ev) { const age = c.t - te; amp += st * 0.012 * Math.exp(-age * 5); }
      for (let i = 0; i <= N; i++) { const u = i / N; const vib = Math.sin(Math.PI * u) * Math.sin(c.t * (90 + k * 23)) * amp * (1 + k * 0.1); pts.push([p0[0] + dx * u + nx * vib, p0[1] + dy * u + ny * vib]); }
      list.push({ pts, col: col.map((v) => v * (0.6 + env * 1.4)), a: 0.35 + env * 0.65, w: 0.0035 });
    });
    const bow = MV.META[name].bow;
    if (bow) { const b0 = c.project(bow[0], bow[1], 0.7), b1 = c.project(bow[2], bow[3], 0.7); const ph = (c.t * 0.9) % 1; const pts = []; for (let i = 0; i <= 24; i++) { const u = ph - 0.12 + (i / 24) * 0.24; pts.push([lerp(b0[0], b1[0], u), lerp(b0[1], b1[1], u)]); }
      list.push({ pts, col: MV.COL.sea.map((v) => v * 1.4), a: 0.3 + env * 0.8, w: 0.004, af: (s) => Math.sin(s * Math.PI) }); }
    R.ribbons(list, { core: 18, glow: 2 });
  }
  // ---------------------------------------------------------------- the unsent message (typed, then deleted)
  function drawMessage(c, o) {
    const t = c.t; const chars = Array.from(o.text);
    let n = Math.floor(clamp((t - o.t0) / (o.typeEnd - o.t0)) * chars.length + 1e-6);
    if (t > o.delStart) n = Math.max(0, chars.length - Math.floor(clamp((t - o.delStart) / (o.delEnd - o.delStart)) * chars.length + 1e-6));
    if (t < o.t0) n = 0;
    const a = smooth(o.t0 - 0.35, o.t0, t);
    const w = 0.62, h = 0.085, x = o.x - w / 2, y = o.y - h / 2;
    MG.rect(x, y, w, h, { fill: 'rgba(12,16,20,0.55)', color: 'rgba(230,236,240,0.55)', alpha: a });
    const str = chars.slice(0, n).join('');
    MG.text(str, x + 0.03, o.y, { size: 0.034, font: 'mincho', alpha: a, color: 'rgba(245,247,248,0.95)', track: 0.05 });
    const cw = 0.034 * 1.0 * n; const blink = (Math.floor(t * 2.2) % 2) ? 0.9 : 0.15;
    MG.line(x + 0.03 + cw + 0.006, o.y - 0.02, x + 0.03 + cw + 0.006, o.y + 0.02, { alpha: a * blink, w: 0.0018 });
    MG.text('送信', x + w - 0.03, o.y, { size: 0.016, align: 'right', font: 'mincho', alpha: a * (n > 0 ? 0.75 : 0.25) });
    MG.text(t > o.delEnd ? '下書きを削除しました' : '', x, y + h + 0.03, { size: 0.012, font: 'mincho', alpha: a * 0.6 });
  }
  // ---------------------------------------------------------------- inventory of lost things
  const OBJ = [['obj0', '100円', 'No.01'], ['obj1', 'シーグラス', 'No.02'], ['obj2', 'ピック', 'No.03'], ['obj3', 'カセット', 'No.04'], ['obj4', 'ドーナツ', 'No.05'], ['obj5', '乗船券', 'No.06'], ['obj6', '貝殻', 'No.07']];
  function drawObjects(c, o) {
    const t = c.t; const hw = MV.R.asp / 2; const n = OBJ.length; const span = Math.min(1.5, hw * 1.7);
    const away = smooth(98.76, 100.9, t);
    const drift = (t - o.t0) * 0.012;
    // a pool of warm light on a dark table, like a museum case
    c.glow({ x: 0, y: 0.01, r: span * 0.62, col: MV.toLin(MV.hex('#ffd9a8')).map((v) => v * 0.075 * (1 - away * 0.6)) });
    OBJ.forEach(([name, label, no], i) => {
      const te = o.t0 + i * MV.beatLen * 0.5; const a = E.out3(clamp((t - te) / 0.45));
      if (a <= 0) return;
      const x0 = -span / 2 + (i / (n - 1)) * span - drift; const y0 = -0.02 + Math.sin(i * 1.9) * 0.03;
      // after "数えるより" everything drifts up and out of focus
      const dx = Math.sin(i * 2.1) * 0.06 * away, dy = -0.12 * away * (0.6 + MV.hash(i) * 0.8);
      const fl = Math.sin(t * 0.8 + i) * 0.006;
      const tex = MV.assets.get(name); const asp = tex ? tex.asp : 1; const H = (asp > 1.6 ? 0.1 : 0.15) * (1 - away * 0.25);
      const x = x0 + dx, y = y0 + dy + fl, rot = Math.sin(t * 0.5 + i) * 0.08;
      R.sprite(name, { x: x + 0.012, y: y + 0.02 + away * 0.05, h: H, rot, sil: 1, silCol: [0, 0, 0], alpha: a * (1 - away) * 0.6, lod: 3.5 });
      R.sprite(name, { x, y, h: H, alpha: a * (1 - away * 0.85), rot, lod: away * 3 });
      MG.text(no, x, y + 0.125, { size: 0.0105, align: 'center', alpha: a * (1 - away) * 0.5 });
      MG.text(label, x, y + 0.152, { size: 0.017, font: 'mincho', align: 'center', alpha: a * (1 - away) * 0.9 });
    });
    const cnt = Math.max(0, Math.min(n, Math.floor((t - o.t0) / (MV.beatLen * 0.5)) + 1)); const left = Math.round(cnt * (1 - away));
    MG.text(String(left).padStart(2, '0'), hw - 0.1, -0.36, { size: 0.06, align: 'right', alpha: 0.85 });
    MG.text('失くしたもの', hw - 0.1, -0.3, { size: 0.013, align: 'right', font: 'mincho', alpha: 0.6 });
  }
  // ---------------------------------------------------------------- HUD
  let visShown = 0;
  const SECNAME = { intro: 'INTRO', v1: 'VERSE Ⅰ', pc1: 'PRE-CHORUS Ⅰ', c1: 'CHORUS Ⅰ', v2: 'VERSE Ⅱ', pc2: 'PRE-CHORUS Ⅱ', c2: 'CHORUS Ⅱ', br: 'BRIDGE', inst: 'INTERLUDE', fc: 'FINAL CHORUS', out: 'CODA' };
  D.hud = function (t, dt) {
    const h = MV.hud; const a = (h.show ?? 1) * 0.62; if (a <= 0.01) return;
    MG.alpha = 1;
    const hw = MV.R.asp / 2; const m = 0.05;
    MG.text('霧笛', -hw + m, -0.45, { size: 0.016, font: 'mincho', alpha: a, track: 0.3 });
    MG.text('♩=108', -hw + m + 0.07, -0.45, { size: 0.011, alpha: a * 0.7 });
    // visibility meter
    const target = h.vis; if (target >= 0) visShown += (target - visShown) * clamp(dt * 3.5);
    const vs = target < 0 ? '  ─  ' : String(Math.round(visShown)).padStart(4, '0');
    MG.text('視程', hw - m - 0.15, -0.45, { size: 0.012, font: 'mincho', alpha: a, align: 'right' });
    MG.text(vs + ' m', hw - m, -0.45, { size: 0.014, alpha: a, align: 'right' });
    const frac = target < 0 ? 1 : clamp(Math.log10(1 + visShown) / Math.log10(2001));
    MG.line(hw - m - 0.15, -0.428, hw - m, -0.428, { alpha: a * 0.25 }); MG.line(hw - m - 0.15, -0.428, hw - m - 0.15 + 0.15 * frac, -0.428, { alpha: a * 0.8, w: 0.0018 });
    const b = MV.beatInfo(t);
    const mm = Math.floor(t / 60), ss = (t % 60).toFixed(2).padStart(5, '0');
    MG.text(`${mm}:${ss}`, hw - m, 0.45, { size: 0.012, alpha: a * 0.8, align: 'right' });
    MG.text(`BAR ${String(Math.max(0, b.bar || 0)).padStart(3, '0')}  ${'●○○○'.slice(0, 0)}${['·', '·', '·', '·'].map((d, i) => (i === ((b.i - 1) % 4 + 4) % 4 ? '●' : '·')).join(' ')}`, hw - m - 0.13, 0.45, { size: 0.011, alpha: a * 0.7, align: 'right' });
    MG.text(SECNAME[MV.section(t)] || '', -hw + m, 0.45, { size: 0.011, alpha: a * 0.7 });
  };

  // ---------------------------------------------------------------- render one frame
  let lastT = 0;
  D.render = function (t) {
    MV.now = t; const dt = Math.abs(t - lastT) < 0.5 ? Math.abs(t - lastT) : 0.016; lastT = t;
    MG.begin();
    const act = D.active(t);
    const shots = act.b ? [[act.a, R.rtA, 1 - act.w], [act.b, R.rtB, act.w]] : [[act.a, R.rtA, 1]];
    const posts = [];
    for (const [shot, rt, w] of shots) {
      R.begin(rt, shot.bg || [0, 0, 0]);
      const { c, post } = makeCtx(shot, t, act.b ? (shot === act.a ? 1 - smooth(0, 0.6, act.w) : smooth(0.4, 1, act.w)) : 1);
      try { shot.draw(c); } catch (e) { if (!D._err) { console.error('shot error', shot.t0, e); D._err = 1; } }
      posts.push([post, w]);
    }
    let src = R.rtA;
    if (act.b) { const tr = act.tr; R.transition(R.rtA, R.rtB, R.rtC, TT[tr.type] ?? 1, act.w, { col: tr.col, pt: tr.pt, dir: tr.dir, seed: (act.b.t0 * 7.3) % 10 }); src = R.rtC; }
    G.bind(src);
    D.hud(t, dt);
    const tex = MG.upload(); if (tex) R.overlay(tex, src, 1, 1.15);
    // blend post params between the two shots
    const P = {}; const keys = new Set(); posts.forEach(([p]) => Object.keys(p).forEach((k) => keys.add(k)));
    const DEF = { bloom: 0.5, grain: 0.04, vig: 0.35, ca: 0.25, paint: 0, paper: 0, letter: 0, exposure: 1, sat: 1, halation: 0.08, flash: 0, fade: 0, shake: [0, 0] };
    for (const k of keys) {
      let acc = null;
      for (const [p, w] of posts) { const v = p[k] ?? DEF[k]; if (v === undefined) continue; if (Array.isArray(v)) { acc = acc || v.map(() => 0); v.forEach((x, i) => (acc[i] += x * w)); } else acc = (acc || 0) + v * w; }
      P[k] = acc;
    }
    if (posts.length === 1) { const rp = P.ripples; Object.assign(P, posts[0][0]); }
    P.ripples = [].concat(...posts.map(([p]) => p.ripples || [])).filter((r) => t - r[2] < 4 && t >= r[2]).slice(-6);
    R.post(src, P, t);
  };
})(window.MV);
