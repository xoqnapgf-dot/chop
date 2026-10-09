/* 霧笛 MV — the timeline. Every shot is a function of time; nothing is pre-rendered.
   Coordinates: screen "p-space", height = 1 (y ∈ [-0.5, 0.5], down positive), width = aspect.
   Plates: painted backgrounds (image + monocular depth) rendered with steep-parallax marching. */
'use strict';
(function (MV) {
  const { kf, clamp, lerp, smooth, E, env, hex, toLin } = MV;
  const L = (h, k = 1) => toLin(hex(h)).map((v) => v * k);
  const C = (MV.COL = {
    white: [1, 1, 1], ink: [0.012, 0.013, 0.016], paper: L('#ecebe6'),
    gold: L('#ffcf7a'), crim: L('#ff5a4e'), pink: L('#ff7fb3'), silv: L('#d9d2ff'), sea: L('#8ff0d6'), amber: L('#ffb35c'),
    fogN: L('#2a3a46'), fogD: L('#9fb2bc'), fogM: L('#d9d4d0'),
  });
  // ------------------------------------------------------------------ shot list helpers
  const SH = (MV.shots = []);
  function S(t0, t1, opt, draw) { SH.push(Object.assign({ t0, t1, draw, tin: null }, opt)); }
  const P = MV.phrase;
  const ph = (id) => P[id];
  // camera keyframes in local progress (0..1)
  function cam(p, keys) {
    const out = {}; const fields = ['x', 'y', 'zoom', 'roll', 'focus', 'dolly'];
    for (const f of fields) { const ks = keys.filter((k) => k[1][f] !== undefined).map((k) => [k[0], k[1][f], k[2]]); if (ks.length) out[f] = kf(p, ks); }
    const pk = keys.filter((k) => k[1].par).map((k) => [k[0], k[1].par, k[2]]); if (pk.length) out.par = kf(p, pk);
    return out;
  }
  const shake = (t, amt) => [MV.fbm1(t * 9.1) * amt, MV.fbm1(t * 8.3 + 40) * amt];
  // text style presets
  // dark ink lettering for bright daylight plates (the glyph halo turns light automatically)
  const INK = (hex = '#2a2630') => ({ col: L(hex), glow: 0, bleed: 0.25 });
  const V = (x, y, size = 0.058, o = {}) => Object.assign({ mode: 'v', x, y, size, font: 'mincho', col: [1, 1, 1], spacing: 1.08, glow: 0.25, inDur: 0.5 }, o);
  const H = (x, y, size = 0.05, o = {}) => Object.assign({ mode: 'h', x, y, size, font: 'mincho', col: [1, 1, 1], spacing: 1.04, glow: 0.2, inDur: 0.45 }, o);
  MV.styles = { V, H };
  const W = () => MV.R.asp / 2; // half width
  // five strings, high to low: violin, voice, guitar, cajon, bass — each driven by its own stem
  const STR = [['vln', 0.0016, 0], ['voc', 0.0019, 0], ['gtr', 0.0023, 0], ['cj', 0.0029, 1], ['bass', 0.0042, 1]];
  function stringSet(t, o = {}) {
    return STR.map(([ch, r, wound], i) => {
      const env = ch === 'cj' ? Math.max(MV.a('kick', t), MV.a('snare', t)) : MV.a(ch, t);
      let amp = env * 0.004; for (const [te, st] of (ch === 'voc' ? [] : MV.recent(ch === 'cj' ? 'snare' : ch, t, 1.2))) amp += st * 0.012 * Math.exp(-(t - te) * 4);
      const a = o.base ? smooth(o.base + i * o.stagger, o.base + 0.35 + i * o.stagger, t) : 1;
      const y0 = (o.y ?? 0) + (i - 2) * (o.gap0 ?? 0.085), y1 = (o.y ?? 0) + (i - 2) * (o.gap1 ?? 0.05);
      return { y0, y1, r, wound, amp: amp * (o.ampK ?? 1), freq: 60 + i * 9, a: a * (o.alpha ?? 1), cut: o.cut && o.cut[i] };
    });
  }
  // lights auto-detected from the painting (tools/prep_assets.py) can be scaled per shot
  const lightsOf = (name, k = 1, extra = []) => ((MV.META[name] && MV.META[name].lights) || []).map((l) => Object.assign({}, l, { i: (l.i ?? 1) * k * 0.5, r: Math.min(0.1, l.r ?? 0.08) })).concat(extra);
  // HUD state requested by shots (visibility etc.)
  MV.hud = { vis: 0, label: '', show: 1 };

  // ================================================================== INTRO 0 → 22.93
  // 01 darkness: a distant harbour lamp breathes with the first notes
  S(0, 2.45, { bg: [0, 0, 0] }, (c) => {
    const t = c.t;
    c.fogLayer({ amt: 0.5 * smooth(0, 1.8, t), col: L('#1b252c'), speed: 0.01, seed: 3 });
    let pulse = 0; for (const [te, st] of MV.recent('gtr', t, 2).concat(MV.recent('vln', t, 2))) pulse += st * Math.exp(-(t - te) * 2.2);
    const k = smooth(0.15, 1.6, t);
    c.glow({ x: 0.36, y: 0.04, r: 0.5, col: L('#ffb35c', (0.08 + pulse * 0.12) * k) });
    c.glow({ x: 0.36, y: 0.04, r: 0.05, col: L('#ffd9a0', (0.9 + pulse * 0.8) * k) });
    c.particles('dust', { count: 140, size: 0.004, col: L('#9fb6c4', 0.5), alpha: smooth(0.2, 2, t) * 0.5, speed: 0.4, seed: 2 });
    c.ripple(0.36, 0.04, 0.3, 0.6);
    MV.hud.vis = 0; MV.hud.show = smooth(0.6, 2.2, t);
    c.post({ bloom: 0.9, grain: 0.07, vig: 0.6 });
  });
  // 02 five real strings come into focus, tuned one by one by the first notes
  S(2.45, 4.12, { tin: { type: 'fade', dur: 0.5 }, bg: [0, 0, 0] }, (c) => {
    const t = c.t;
    c.solid(L('#07090b'));
    c.particles('bokeh', { count: 22, size: 0.09, col: L('#ff9a4c', 0.35), alpha: 0.7, vel: [0.004, 0], speed: 0.3, zmin: 0.2, seed: 22 });
    c.stringsShot(stringSet(t, { base: 2.5, stagger: 0.28 }), { focus: -0.25, dof: 1.6, exposure: 1.15 });
    const a = smooth(2.6, 3.2, c.t) * (1 - smooth(3.8, 4.1, c.t));
    c.mg.text('KIRITEKI  —  さよならは終わりじゃない', -W() + 0.08, 0.42, { size: 0.014, alpha: a * 0.6, font: 'mono' });
    c.post({ bloom: 0.7, grain: 0.06, vig: 0.55 });
  });
  // 03 night sea under fog — the band enters; lighthouse beam sweeps over the procedural ocean
  S(4.12, 7.30, { tin: { type: 'flash', dur: 0.35, col: L('#bfd3dc', 0.6) } }, (c) => {
    const t = c.t; const lt = c.lt;
    c.sea({ pos: [0, 2.0, lt * 1.6], ang: [0.12 + lt * 0.01, -0.05], moon: true, sun: [-0.35, 0.22, 1], sunCol: L('#cfe0ff', 0.8), skyTop: L('#0b1420'), skyHor: L('#3b4d5a'), fogCol: L('#41535e'), water: L('#071016'), fogDen: 0.045, wave: 0.8, exposure: 1.1,
      rings: [[0, 26, 4.12, 1.2], [3, 30, 5.18, 0.8]] });
    c.fogLayer({ amt: 0.35, col: L('#5d717c'), speed: 0.03, seed: 4 });
    c.beam({ x: 0.55, y: -0.02, ang: Math.PI * (1.05 + lt * 0.16), i: 0.75, col: L('#fff1d6'), w: 0.15 });
    c.post({ bloom: 0.8, grain: 0.06, vig: 0.5, exposure: 1.05 });
    MV.hud.vis = Math.round(lerp(0, 12, smooth(4.2, 7, t)));
  });
  // 04 foghorn — huge kanji 霧 made of fog
  S(7.30, 9.59, { tin: { type: 'fog', dur: 0.7, col: L('#9fb2bc', 0.5) } }, (c) => {
    const lt = c.lt;
    c.fogfly({ speed: 0.6, density: 0.32, a: L('#6c7f88'), b: L('#0f171d'), lamps: 0.6, lampCol: L('#ffb35c'), seed: 3 });
    c.bigGlyph('霧', { x: 0, y: 0, h: 0.86, font: 'minchoB', col: L('#e7ecee', 1.1), alpha: smooth(0, 0.6, lt) * (1 - smooth(1.6, 2.29, lt)), fog: 1, dissolve: smooth(1.4, 2.3, lt) });
    c.ripple(0, 0, 7.35, 1.2); c.ripple(0, 0, 8.45, 0.7);
    c.mg.text('霧笛 / FOGHORN  ─  2.3 s  ·  110 Hz', W() - 0.08, 0.42, { size: 0.013, align: 'right', alpha: 0.55 });
    c.post({ bloom: 0.7, grain: 0.07, vig: 0.45 });
  });
  // 05 fly through the fog, lamps streaming past
  S(9.59, 11.87, { tin: { type: 'zoom', dur: 0.5 } }, (c) => {
    c.fogfly({ speed: 2.2 + MV.a('kick', c.t) * 1.5, density: 0.36, a: L('#7b8f98'), b: L('#101920'), lamps: 1, lampCol: L('#ffb35c', 1.2), seed: 7, warp: 1 });
    c.particles('bokeh', { count: 24, size: 0.06, col: L('#ffb35c', 0.5), alpha: 0.6, vel: [0, 0], speed: 0.4, zmin: 0.3, seed: 9 });
    c.post({ bloom: 0.9, grain: 0.06, vig: 0.5, ca: 0.6 });
  });
  // 06 the fog parts: the harbor (painted plate) at blue hour
  S(11.87, 14.12, { tin: { type: 'fog', dur: 1.0, col: L('#cfd8dc', 0.6) } }, (c) => {
    const p = c.p;
    c.plate('harbor', cam(p, [[0, { x: 0.05, y: 0.02, zoom: 1.12, par: [0.03, 0.0], focus: 0.45 }], [1, { x: 0.1, y: 0.0, zoom: 1.2, par: [-0.03, 0.005] }]]), {
      fog: { col: L('#8fa3ad'), amt: 0.75, near: 0.1, far: 1.0, scale: 1.4, vel: [0.04, 0] }, lights: lightsOf('harbor', 1.2), water: 1, sky: 1, emis: 0.4,
      beam: { u: 0.853, v: 0.274, z: 0.12, ang: Math.PI * (0.95 + c.lt * 0.18), i: 0.7, c: L('#fff2da'), w: 0.06 }, grade: { exposure: 0.9, sat: 0.9, tint: [0.92, 0.98, 1.06] },
    });
    c.particles('dust', { count: 90, size: 0.004, col: L('#dfe9ee', 0.6), alpha: 0.5, speed: 0.3, seed: 5 });
    c.post({ bloom: 0.6, grain: 0.05, vig: 0.4 });
    MV.hud.vis = Math.round(lerp(12, 40, smooth(11.9, 14, c.t)));
  });
  // 07 the empty bench, close
  S(14.12, 16.37, { tin: { type: 'cut' } }, (c) => {
    c.plate('harbor', cam(c.p, [[0, { x: -0.43, y: 0.17, zoom: 2.3, par: [0.02, 0], focus: 0.7, dolly: 0.1 }], [1, { x: -0.40, y: 0.16, zoom: 2.5, par: [-0.015, 0], dolly: 0.15 }]]), {
      fog: { col: L('#8fa3ad'), amt: 0.6, near: 0.05, far: 1, scale: 2, vel: [0.05, 0] }, lights: lightsOf('harbor', 1.0), water: 1, dof: 0.6, dofF: 0.75, grade: { exposure: 0.9, sat: 0.85, tint: [0.92, 0.98, 1.06] } });
    c.mg.text('05:42', -W() + 0.08, 0.38, { size: 0.02, alpha: 0.7 });
    c.mg.line(-W() + 0.08, 0.405, -W() + 0.28, 0.405, { alpha: 0.4 });
    c.mg.text('FERRY TERMINAL  ·  BENCH 03', -W() + 0.08, 0.425, { size: 0.011, alpha: 0.5 });
    c.post({ bloom: 0.5, grain: 0.05, vig: 0.45 });
  });
  // 08 title: 霧笛 written stroke by stroke
  S(16.37, 18.65, { tin: { type: 'ink', dur: 0.6, pt: [0.3, 0] } }, (c) => {
    c.plate('harbor', { x: 0.2, y: -0.05, zoom: 1.05, par: [0.02 * Math.sin(c.lt), 0] }, { fog: { col: L('#8fa3ad'), amt: 0.95, near: 0.3, far: 1 }, lights: lightsOf('harbor', 0.6), grade: { exposure: 0.55, sat: 0.6 } });
    c.brush('title', '霧笛', [16.55, 17.35], { x: 0.42, y: -0.02, h: 0.74, col: L('#f3f6f7', 1.0), halo: L('#05080a'), haloA: 0.6, cell: 300, weight: 1.15, maxCharDur: 0.8 });
    c.mg.text('さよならは終わりじゃない', 0.18, -0.26, { size: 0.026, font: 'mincho', vertical: true, alpha: smooth(17.2, 17.8, c.t) * 0.85, color: 'rgba(240,242,243,0.9)' });
    c.post({ bloom: 0.6, grain: 0.06, vig: 0.5, paint: 0.25 });
  });
  // 09 postcards — the route of the year, laid out on an editorial grid
  S(18.65, 20.90, { tin: { type: 'push', dur: 0.45, dir: [-1, 0] } }, (c) => {
    c.solid(L('#26292c'));
    const cards = ['skysea', 'school', 'sunset', 'snowwalk'];
    cards.forEach((n, i) => {
      const tt = c.t - 18.75 - i * 0.28; const a = E.out3(clamp(tt / 0.5));
      const x = -0.62 + i * 0.41, y = 0.02 + (i % 2 ? 0.03 : -0.02);
      const r_ = (i - 1.5) * 0.04, X = x + (1 - a) * 0.15;
      c.sprite(null, { shape: 'glow', x: X + 0.012, y: y + 0.02, w: 0.46, h: 0.36, tint: [0, 0, 0], alpha: a * 0.35, linear: true });
      c.sprite('white', { x: X, y, w: 0.4, h: 0.29, rot: r_, alpha: a, tint: L('#f7f4ee') });
      c.sprite(n, { x: X, y: y - 0.006, h: 0.24, w: 0.37, rot: r_, alpha: a, uv: [0.08, 0, 0.92, 1] });
      c.mg.text(['夏', '雨', '夕', '雪'][i], x - 0.17, y - 0.17, { size: 0.022, font: 'mincho', alpha: a * 0.85 });
      c.mg.text(['08.17', '06.02', '10.21', '11.29'][i], x + 0.17, y + 0.17, { size: 0.011, alpha: a * 0.7, align: 'right' });
    });
    c.mg.line(-0.8, 0.22, 0.8, 0.22, { dash: [0.004, 0.006], dashOff: c.t * 0.02, alpha: smooth(18.7, 19.3, c.t) * 0.5 });
    c.post({ bloom: 0.3, grain: 0.06, vig: 0.45, paper: 0.6 });
  });
  // 10 page turn into morning (light leak)
  S(20.90, 22.93, { tin: { type: 'leak', dur: 0.8, col: L('#ffd9b8', 0.9), dir: [0.85, 0.2] } }, (c) => {
    c.plate('window', cam(c.p, [[0, { x: 0.25, y: -0.06, zoom: 1.6, par: [0.02, 0], focus: 0.4 }], [1, { x: 0.2, y: -0.05, zoom: 1.45 }]]), { lights: lightsOf('window', 0.8), sway: 1, sky: 1, grade: { exposure: 1.05, sat: 0.95 }, dof: 0.5, dofF: 0.2 });
    c.particles('dust', { count: 120, size: 0.004, col: L('#fff1dc', 1.2), alpha: 0.7, speed: 0.3, seed: 12, box: [-0.2, -0.5, W(), 0.3] });
    c.post({ bloom: 0.7, grain: 0.04, vig: 0.3, halation: 0.15 });
    MV.hud.vis = Math.round(lerp(40, 300, smooth(21, 22.9, c.t)));
  });

  // ================================================================== VERSE 1 (guitar + voice only)
  S(22.93, 24.35, { tin: { type: 'cut' } }, (c) => {
    c.plate('window', cam(c.p, [[0, { x: 0.1, y: 0, zoom: 1.12, par: [0.03, 0.005], focus: 0.45 }], [1, { x: 0.05, y: -0.01, zoom: 1.18, par: [0.0, 0] }]]), { lights: lightsOf('window', 0.9), sway: 1.4, sky: 1, grade: { exposure: 1.05 } });
    c.particles('petals', { count: 40, size: 0.03, atlas: 'petals', col: [1.05, 1, 1], vel: [-0.12, 0.06], wind: 1, zmin: 0.2, dof: 1.2, dofF: 0.4, seed: 21, alpha: smooth(22.9, 23.6, c.t) });
    c.text('L1a', V(-W() + 0.22, -0.3, 0.064, INK()));
    c.post({ bloom: 0.7, grain: 0.04, vig: 0.25, halation: 0.12 });
  });
  S(24.35, 26.61, { tin: { type: 'cut' } }, (c) => {
    // petals rush in through the window toward the camera
    c.plate('window', cam(c.p, [[0, { x: 0.22, y: -0.08, zoom: 1.5, par: [0.02, 0], focus: 0.3 }], [1, { x: 0.25, y: -0.09, zoom: 1.9, dolly: 0.1 }]]), { lights: lightsOf('window', 1.1), sway: 1.6, sky: 1, dof: 0.8, dofF: 0.25, grade: { exposure: 1.1 } });
    c.particles('petals', { count: 110, size: 0.045, atlas: 'petals', col: [1.08, 1.02, 1.02], vel: [-0.35, 0.12], wind: 2, zmin: 0.1, dof: 1.6, dofF: 0.35, seed: 22, speed: 1.4 });
    c.text('L1b', V(-W() + 0.22, -0.28, 0.072, INK('#5a2434')));
    c.post({ bloom: 0.85, grain: 0.04, vig: 0.25, halation: 0.2 });
  });
  S(26.61, 29.21, { tin: { type: 'push', dur: 0.4, dir: [1, 0] } }, (c) => {
    c.plate('case', cam(c.p, [[0, { x: -0.12, y: 0.02, zoom: 1.35, par: [0.025, 0], focus: 0.55 }], [1, { x: -0.18, y: 0.0, zoom: 1.42, par: [-0.02, 0] }]]), { lights: lightsOf('case', 0.9), dof: kf(c.p, [[0, 1.2], [0.6, 0.3]]), dofF: 0.62, grade: { exposure: 1.0, sat: 0.95 } });
    c.particles('dust', { count: 140, size: 0.0045, col: L('#ffe8c8', 1.4), alpha: 0.8, speed: 0.25, seed: 26, box: [0.0, -0.45, W(), 0.35] });
    c.text('L2a', V(W() - 0.2, -0.3, 0.06, INK()));
    // museum-style tag
    const a = smooth(27.0, 27.5, c.t);
    c.mg.line(-0.33, 0.06, -0.2, 0.0, { alpha: a * 0.7 }); c.mg.circle(-0.33, 0.06, 0.004, { fill: 'rgba(235,236,232,0.8)', alpha: a });
    c.mg.text('D-28  /  1978', -0.19, -0.012, { size: 0.016, alpha: a * 0.85 }); c.mg.text('NO. 0288736', -0.19, 0.014, { size: 0.011, alpha: a * 0.55 });
    c.post({ bloom: 0.6, grain: 0.05, vig: 0.35 });
  });
  S(29.21, 31.35, { tin: { type: 'cut' } }, (c) => {
    // lift: the camera tilts up fast as the case goes onto a shoulder
    const k = E.inExpo(clamp((c.t - 30.4) / 0.95));
    c.plate('case', { x: -0.16, y: 0.05 - k * 0.45, zoom: 1.6 + k * 0.3, par: [0, -0.02 - k * 0.05], focus: 0.6, roll: -k * 0.08 }, { lights: lightsOf('case', 1), dof: 0.4 + k * 2, dofF: 0.6, grade: { exposure: 1 + k * 0.5 } });
    c.text('L2b', V(W() - 0.2, -0.32, 0.06, INK()));
    c.post({ bloom: 0.6 + k, grain: 0.05, vig: 0.35, flash: k * 0.6, flashCol: [1, 0.97, 0.92] });
  });
  S(31.35, 33.67, { tin: { type: 'flash', dur: 0.3 } }, (c) => {
    // slope: follow the tiny figure down to the station; a route line draws itself
    c.plate('slope', cam(c.p, [[0, { x: 0, y: -0.28, zoom: 1.0, par: [0, 0.02], focus: 0.5 }], [1, { x: -0.02, y: 0.02, zoom: 1.05, par: [0.005, -0.015] }]]), { lights: lightsOf('slope', 0.8), sway: 1, sky: 1, water: 0.6, grade: { exposure: 1.05 } });
    c.particles('petals', { count: 50, size: 0.028, atlas: 'petals', col: [1.05, 1, 1], vel: [-0.1, 0.08], wind: 1, zmin: 0.2, dof: 1, dofF: 0.5, seed: 31 });
    const pr = E.io2(clamp((c.t - 31.6) / 2.0));
    const route = [[-0.02, 0.38], [0.0, 0.25], [-0.03, 0.12], [0.02, 0.0], [0.07, -0.08], [0.12, -0.15]];
    c.mg.poly(route.slice(0, Math.max(2, Math.ceil(pr * route.length))), { dash: [0.006, 0.006], alpha: 0.75, w: 0.002 });
    c.mg.text((320 - Math.round(pr * 320)).toString().padStart(3, '0') + ' m', 0.14, -0.15, { size: 0.016, alpha: 0.8 });
    c.text('L3a', V(W() - 0.2, -0.3, 0.06, INK()));
    c.post({ bloom: 0.55, grain: 0.045, vig: 0.3 });
  });
  S(33.67, 35.91, { tin: { type: 'cut' } }, (c) => {
    c.plate('slope', cam(c.p, [[0, { x: 0.12, y: -0.05, zoom: 2.0, par: [0.015, 0], focus: 0.25 }], [1, { x: 0.15, y: -0.07, zoom: 2.2, par: [-0.01, 0] }]]), { lights: lightsOf('slope', 1), sky: 1, water: 1, grade: { exposure: 1.05 }, fog: { col: L('#d9e4ea'), amt: 0.35, near: 0, far: 1, scale: 2 } });
    c.text('L3b', V(-W() + 0.2, -0.24, 0.06, INK()));
    c.mg.text('駅', 0.04, 0.06, { size: 0.03, font: 'mincho', alpha: 0.85 }); c.mg.circle(0.04, 0.06, 0.03, { alpha: 0.6, dash: [0.004, 0.004] });
    c.post({ bloom: 0.55, grain: 0.045, vig: 0.3 });
  });
  S(35.91, 37.77, { tin: { type: 'iris', dur: 0.6, pt: [0, 0] } }, (c) => {
    // a voice remembered: the singer inside a vinyl-like circle, ringed by the vocal waveform
    const k = smooth(35.9, 37.4, c.t);
    c.plate('face1', cam(c.p, [[0, { x: -0.1, y: -0.04, zoom: 1.35, par: [0.02, 0], focus: 0.5 }], [1, { x: -0.08, y: -0.05, zoom: 1.45 }]]), { fog: { col: L('#cdb994'), amt: lerp(1.25, 0.15, E.out2(k)), near: 1, far: 1, scale: 0.6, vel: [0.02, -0.01] }, grade: { sat: 0.35, tint: [1.12, 0.98, 0.8], exposure: 0.95, contrast: 1.05 }, vig: 0.6 });
    c.voiceRipples(-0.42, 0.1, 0.6);
    c.text('L4a', V(W() - 0.24, -0.26, 0.06, { col: L('#f3d9a6', 1.2) }));
    c.post({ bloom: 0.7, grain: 0.07, vig: 0.5 });
  });
  S(37.77, 39.69, { tin: { type: 'cut' } }, (c) => {
    c.plate('face1', cam(c.p, [[0, { x: -0.02, y: 0.0, zoom: 1.12, par: [0.02, 0], focus: 0.5 }], [1, { x: 0.02, y: 0.0, zoom: 1.2, par: [-0.02, 0] }]]), { halftone: kf(c.p, [[0, 0], [1, 0.9]]), duo: 0.4, duoA: L('#1c1714'), duoB: L('#f0e2c8'), htScale: 85, grade: { sat: 0.7, exposure: 1.05 } });
    const echo = [0, 1, 2]; echo.forEach((k) => c.text('L4b', V(W() - 0.24 - k * 0.012, -0.24 - k * 0.012, 0.062, { alpha: k ? 0.25 / k : 1, col: L('#fff6e6', 1.1) })));
    c.post({ bloom: 0.5, grain: 0.08, vig: 0.45, paint: 0.3 });
  });

  // ================================================================== PRE-CHORUS 1
  S(39.69, 41.95, { tin: { type: 'fog', dur: 0.9 } }, (c) => {
    c.plate('harbor', cam(c.p, [[0, { x: -0.36, y: 0.12, zoom: 1.75, par: [0.02, 0], focus: 0.7 }], [1, { x: -0.4, y: 0.14, zoom: 2.05, par: [-0.01, 0], dolly: 0.12 }]]), {
      fog: { col: L('#9fb0b8'), amt: 0.85, near: 0.12, far: 1, scale: 1.6, vel: [0.05, 0] }, lights: lightsOf('harbor', 1.1), water: 1, grade: { exposure: 0.95, sat: 0.8, tint: [0.92, 0.98, 1.05] } });
    c.text('L5a', H(-0.35, -0.28, 0.05));
    MV.hud.vis = 30;
    c.post({ bloom: 0.5, grain: 0.05, vig: 0.4 });
  });
  S(41.95, 44.23, { tin: { type: 'cut' } }, (c) => {
    // the unsent message: typed, then deleted
    c.plate('harbor', { x: -0.4, y: 0.15, zoom: 2.1, par: [0, 0], focus: 0.7 }, { fog: { col: L('#9fb0b8'), amt: 0.9, near: 0.15, far: 1, scale: 1.6 }, lights: lightsOf('harbor', 0.8), water: 1, grade: { exposure: 0.7, sat: 0.6 }, dof: 1.5, dofF: 0.1 });
    c.messageBox({ x: 0, y: 0.05, text: 'ありがとう', t0: 42.0, typeEnd: 43.0, delStart: 43.25, delEnd: 44.0 });
    c.post({ bloom: 0.4, grain: 0.05, vig: 0.45 });
  });
  S(44.23, 46.35, { tin: { type: 'ripple', dur: 0.8, pt: [0, 0.1] } }, (c) => {
    // a face in the water — trembling with the reflections
    c.plate('face4', cam(c.p, [[0, { x: 0, y: 0.02, zoom: 1.1, par: [0.01, 0], focus: 0.5 }], [1, { x: 0.02, y: 0.0, zoom: 1.16 }]]), { grade: { exposure: 0.75, sat: 0.5, tint: [0.75, 0.9, 1.05], lift: L('#0a1820') }, duo: 0.35, duoA: L('#06121a'), duoB: L('#b9d6e2'), waterAll: 1 });
    c.text('L6a', V(-W() + 0.2, -0.26, 0.058, { wobble: (t, i) => [Math.sin(t * 3 + i) * 0.004, 0] }));
    c.post({ bloom: 0.5, grain: 0.06, vig: 0.5 });
  });
  S(46.35, 48.15, { tin: { type: 'cut' } }, (c) => {
    c.plate('harbor', cam(c.p, [[0, { x: 0.32, y: 0.2, zoom: 2.6, par: [0.01, 0], focus: 0.4 }], [1, { x: 0.36, y: 0.2, zoom: 2.75 }]]), { fog: { col: L('#9fb0b8'), amt: 0.4, near: 0, far: 1, scale: 2 }, lights: lightsOf('harbor', 1.2), water: 2.2, grade: { exposure: 0.9, sat: 0.85 } });
    c.text('L6b', V(-W() + 0.2, -0.26, 0.058, { wobble: (t, i) => [Math.sin(t * 5 + i * 0.7) * 0.007, Math.sin(t * 3.1 + i) * 0.003] }));
    c.post({ bloom: 0.6, grain: 0.05, vig: 0.4 });
  });
  S(48.15, 50.51, { tin: { type: 'push', dur: 0.4, dir: [0, -1] } }, (c) => {
    // footsteps on beats ripple the puddles
    const rip = []; for (let k = 0; k < 4; k++) { const tb = 48.22 + k * MV.beatLen * 1.0; rip.push([0.38 + k * 0.08, 0.86 - k * 0.04, tb, 1]); }
    c.plate('puddles', cam(c.p, [[0, { x: 0, y: 0.32, zoom: 1.0, par: [0.01, 0.01], focus: 0.6 }], [1, { x: 0, y: 0.25, zoom: 1.02 }]]), { lights: lightsOf('puddles', 0.8), water: 1.5, ripples: rip, sky: 1, grade: { exposure: 1.0 } });
    ['1', '2', '3', '4'].forEach((s, k) => { const tb = 48.22 + k * MV.beatLen; c.mg.text(s, -W() + 0.12 + k * 0.05, 0.4, { size: 0.016, alpha: smooth(tb, tb + 0.1, c.t) * 0.85 }); });
    c.text('L7a', V(W() - 0.22, -0.3, 0.06));
    c.post({ bloom: 0.6, grain: 0.045, vig: 0.3 });
  });
  S(50.51, 53.12, { tin: { type: 'cut' } }, (c) => {
    const k = E.io3(c.p);
    c.plate('puddles', { x: 0, y: lerp(0.25, -0.26, k), zoom: 1.0, par: [0, lerp(0.02, -0.02, k)], focus: 0.5 }, { lights: lightsOf('puddles', 1), water: 1, sky: 1.5, grade: { exposure: 1.0 + k * 0.15 } });
    c.particles('gulls', { count: 5, size: 0.03, col: L('#f3efe8'), vel: [0.04, 0], box: [-W(), -0.45, W(), -0.15], seed: 51, alpha: k });
    c.text('L7b', V(W() - 0.22, -0.3, 0.06));
    c.post({ bloom: 0.65 + k * 0.2, grain: 0.045, vig: 0.3 });
  });
  S(53.12, 55.06, { tin: { type: 'zoom', dur: 0.4 } }, (c) => {
    // acceleration through brightening fog
    const k = c.p;
    c.fogfly({ speed: 2 + k * 5, density: 0.3 - k * 0.12, a: L('#e9edf0', 1 + k), b: L('#7c919c'), lamps: 0.5, lampCol: L('#ffd9a0', 1.3), seed: 11, warp: 1 });
    c.text('L8a', H(0, 0.3, 0.052, { align: 'center', col: L('#203038'), glow: 0 }));
    MV.hud.vis = Math.round(lerp(30, 300, k));
    c.post({ bloom: 0.8, grain: 0.04, vig: 0.25, ca: 0.8 });
  });
  S(55.06, 57.25, { tin: { type: 'cut' } }, (c) => {
    // 行 — the camera flies through the kanji
    const k = E.inExpo(clamp((c.t - 55.3) / 1.9));
    c.fogfly({ speed: 7, density: 0.22, a: L('#e9eef1', 1.2), b: L('#7d929c'), seed: 12, lamps: 0.6, lampCol: L('#ffe2b0', 1.2), warp: 1 });
    c.bigGlyph('行', { x: 0, y: 0, h: 0.62 + k * 6, font: 'minchoB', col: L('#1b262c'), alpha: smooth(56.3, 56.45, c.t) * (1 - smooth(57.0, 57.2, c.t)) });
    c.post({ bloom: 1.0, grain: 0.04, vig: 0.2, flash: smooth(56.9, 57.2, c.t) * 0.9, flashCol: [1, 0.98, 0.93] });
  });

  // ================================================================== CHORUS 1 (full band)
  S(57.25, 59.51, { tin: { type: 'flash', dur: 0.4, col: L('#fff4dc', 1) } }, (c) => {
    c.plate('skysea', cam(c.p, [[0, { x: -0.25, y: 0, zoom: 1.04, par: [0.03, 0.01], focus: 0.3 }], [1, { x: -0.12, y: -0.01, zoom: 1.06, par: [-0.02, 0] }]]), { sky: 1.4, water: 1, lights: lightsOf('skysea', 1.2), grade: { exposure: 1.05, sat: 1.05 } });
    c.brush('c1', 'さよならは', [57.2, 58.7, 59.12, 59.35, 59.58], { x: 0.5, y: -0.04, h: 0.82, col: L('#151b26'), halo: L('#fff4e2', 1.0), haloA: 0.7, cell: 230, weight: 1.1 });
    c.post({ bloom: 0.9, grain: 0.035, vig: 0.25, letter: 0.06 });
  });
  S(59.51, 61.79, { tin: { type: 'cut' } }, (c) => {
    c.plate('skysea', cam(c.p, [[0, { x: 0.15, y: 0.08, zoom: 1.35, par: [0.025, 0.01], focus: 0.4 }], [1, { x: 0.25, y: 0.1, zoom: 1.42, par: [-0.02, 0] }]]), { sky: 1.4, water: 1.2, lights: lightsOf('skysea', 1.2), grade: { exposure: 1.05 } });
    c.brush('c1b', '終わりじゃない', [60.68, 61.12, 61.52, 61.70, 61.92, 62.15, 62.38], { x: -0.55, y: 0.0, h: 0.88, col: L('#151b26'), halo: L('#fff4e2', 1.0), haloA: 0.7, cell: 200, weight: 1.1 });
    c.post({ bloom: 0.9, grain: 0.035, vig: 0.25, letter: 0.06 });
  });
  S(61.79, 62.96, { tin: { type: 'cut' } }, (c) => {
    // the staff, singing: melody traced from the vocal pitch
    c.solid(L('#0a0c0e'));
    c.particles('bokeh', { count: 30, size: 0.08, col: L('#ffcf7a', 0.4), alpha: 0.8, vel: [0.01, 0], speed: 0.4, zmin: 0.2, seed: 61 });
    c.stringsShot(stringSet(c.t, { ampK: 1.4, gap0: 0.1, gap1: 0.055 }), { focus: 0.1, dof: 1.4, exposure: 1.2, tint: [1.05, 0.95, 0.82] });
    c.post({ bloom: 0.9, grain: 0.05, vig: 0.5 });
  });
  S(62.96, 64.52, { tin: { type: 'cut' } }, (c) => {
    c.plate('skysea', cam(c.p, [[0, { x: -0.2, y: -0.28, zoom: 1.9, par: [0.02, 0], focus: 0.2 }], [1, { x: -0.1, y: -0.3, zoom: 2.0 }]]), { sky: 2, lights: lightsOf('skysea', 1.4), grade: { exposure: 1.1 } });
    c.text('L10a', H(0, 0.28, 0.056, { align: 'center', col: L('#1b2330'), glow: 0 }));
    c.post({ bloom: 0.9, grain: 0.035, vig: 0.25, letter: 0.06 });
  });
  S(64.52, 66.31, { tin: { type: 'cut' } }, (c) => {
    c.plate('skysea', cam(c.p, [[0, { x: 0.3, y: -0.3, zoom: 2.1, par: [0.02, 0] }], [1, { x: 0.36, y: -0.31, zoom: 2.2 }]]), { sky: 2, lights: lightsOf('skysea', 1.4), grade: { exposure: 1.12 } });
    c.text('L10b', H(0, 0.28, 0.056, { align: 'center', col: L('#1b2330'), glow: 0 }));
    const k = smooth(65.86, 66.1, c.t); c.bigGlyph('会', { x: 0, y: -0.06, h: 0.22 + k * 0.05, font: 'brush', col: L('#151b26'), halo: L('#fff4e2'), alpha: k * (1 - smooth(66.2, 66.31, c.t)) });
    c.post({ bloom: 1.0, grain: 0.035, vig: 0.25, letter: 0.06 });
  });
  S(66.31, 67.66, { tin: { type: 'cut' } }, (c) => {
    c.plate('vln', cam(c.p, [[0, { x: 0.02, y: 0, zoom: 1.1, par: [0.03, 0], focus: 0.6 }], [1, { x: -0.02, y: 0, zoom: 1.18, par: [-0.02, 0] }]]), { grade: { exposure: 1.05, sat: 1.05 }, dof: 0.6, dofF: 0.65, sweep: c.sheen('vln') });
    c.post({ bloom: 0.8, grain: 0.05, vig: 0.35 });
  });
  S(67.66, 69.62, { tin: { type: 'cut' } }, (c) => {
    c.plate('face1', cam(c.p, [[0, { x: 0, y: 0.02, zoom: 1.08, par: [0.02, 0], focus: 0.5 }], [1, { x: 0.02, y: 0.0, zoom: 1.14 }]]), { grade: { exposure: 1.1, sat: 0.95, tint: [1.08, 1.0, 0.9] }, lights: [{ u: 0.18, v: 0.62, z: 0.6, c: L('#ffcf7a'), i: 0.6 + MV.a('voc', c.t), r: 0.25 }] });
    c.voiceRipples(-0.42, 0.12, 0.8);
    c.text('L11a', V(W() - 0.2, -0.28, 0.062, { wobble: (t, i) => [Math.sin(t * 40 + i) * 0.002 * MV.a('voc', t), 0], col: L('#fff1d8', 1.2), glow: 0.5 }));
    c.post({ bloom: 0.9, grain: 0.05, vig: 0.35, halation: 0.2 });
  });
  S(69.62, 72.12, { tin: { type: 'cut' } }, (c) => {
    // rings contract inward: an embrace
    c.plate('face1', cam(c.p, [[0, { x: 0.02, y: 0.0, zoom: 1.15, par: [0.01, 0] }], [1, { x: 0.0, y: 0.0, zoom: 1.3 }]]), { grade: { exposure: 1.15, sat: 0.95, tint: [1.1, 1.0, 0.88] } });
    c.glow({ x: -0.3, y: 0.05, r: lerp(0.9, 0.35, E.io2(c.p)), col: L('#ffcf7a', 0.10 + 0.08 * MV.a('voc', c.t)) });
    c.text('L11b', V(W() - 0.2, -0.28, 0.062, { col: L('#fff1d8', 1.2), glow: 0.5 }));
    c.post({ bloom: 0.9, grain: 0.05, vig: 0.4, halation: 0.25 });
  });
  // performance flashes cut on the beat
  S(72.12, 73.50, { tin: { type: 'cut' } }, (c) => {
    c.plate('gtr', cam(c.p, [[0, { x: 0, y: 0, zoom: 1.1, par: [0.03, 0], focus: 0.6 }], [1, { x: 0.03, y: 0, zoom: 1.2 }]]), { grade: { exposure: 1.05 }, dof: 0.5, dofF: 0.7, sweep: c.sheen('gtr') });
    c.text('L12a', V(-W() + 0.2, -0.22, 0.06));
    c.post({ bloom: 0.8, grain: 0.05, vig: 0.35 });
  });
  S(73.50, 75.35, { tin: { type: 'cut' } }, (c) => {
    c.plate('bass', cam(c.p, [[0, { x: 0, y: 0, zoom: 1.1, par: [0.03, 0], focus: 0.6 }], [1, { x: -0.03, y: 0, zoom: 1.2 }]]), { grade: { exposure: 1.05 }, dof: 0.5, dofF: 0.7, sweep: c.sheen('bass', { k: 1.1 }) });
    c.text('L12a', V(-W() + 0.2, -0.22, 0.06));
    c.post({ bloom: 0.8, grain: 0.05, vig: 0.35 });
  });
  S(75.35, 77.61, { tin: { type: 'cut' } }, (c) => {
    const b = MV.beatInfo(c.t); const cut = ['cajon', 'vln', 'gtr', 'face1'][Math.max(0, b.i) % 4];
    c.plate(cut, { x: 0, y: 0, zoom: 1.12 + MV.beatPulse(c.t, 8) * 0.05, par: [0.02, 0], focus: 0.6 }, { grade: { exposure: 1.05 + MV.beatPulse(c.t) * 0.2 }, duo: 0.25, duoA: L('#1a1216'), duoB: L('#ffe6c2') });
    c.brush('utau1', '歌う', [74.08, 75.0], { x: 0.0, y: 0, h: 0.62, col: L('#151b26'), halo: L('#fff4e2', 1.0), haloA: 0.8, cell: 300, weight: 1.3, mode: 'h' });
    c.post({ bloom: 0.9, grain: 0.05, vig: 0.35, shake: shake(c.t, 0.002 * MV.a('kick', c.t)) });
  });
  S(77.61, 79.58, { tin: { type: 'cut' } }, (c) => {
    c.plate('skysea', cam(c.p, [[0, { x: 0, y: 0, zoom: 1.3 }], [1, { x: 0, y: 0, zoom: 1.0, par: [0, 0.02] }]]), { sky: 1, water: 1, lights: lightsOf('skysea', 1), grade: { exposure: lerp(1.05, 0.7, c.p), sat: lerp(1, 0.5, c.p) } });
    c.lensRain({ amt: smooth(78.4, 79.5, c.t) });
    c.post({ bloom: 0.6, grain: 0.05, vig: 0.35, letter: 0.06 * (1 - c.p) });
  });

  // ================================================================== VERSE 2 — rain, chalk, sunset
  S(79.58, 81.38, { tin: { type: 'cut' } }, (c) => {
    // 霧 → 雨 : the weather radical stays, the rest washes away
    c.solid(L('#2b3337'));
    c.particles('rain', { count: 420, size: 0.05, col: L('#c9d5db'), alpha: 0.5, vel: [-0.08, 1.6], speed: 1, seed: 79 });
    c.morphGlyph('霧', '雨', { x: 0, y: 0, h: 0.72, k: E.io3(clamp((c.t - 79.8) / 1.2)), col: L('#e9eef0', 1.1) });
    c.text('L13a', V(W() - 0.2, -0.28, 0.056, INK('#2b1812')));
    MV.hud.vis = 80;
    c.post({ bloom: 0.5, grain: 0.06, vig: 0.4 });
  });
  S(81.38, 83.50, { tin: { type: 'cut' } }, (c) => {
    c.plate('school', cam(c.p, [[0, { x: -0.1, y: 0.05, zoom: 1.12, par: [0.03, 0], focus: 0.5 }], [1, { x: 0.02, y: 0.04, zoom: 1.16, par: [-0.02, 0] }]]), { water: 1.6, sky: 1, sway: 0.8, lights: lightsOf('school', 0.8), grade: { exposure: 0.95, sat: 0.85, tint: [0.95, 1.0, 1.04] }, ripples: rainRipples(c.t, 81.38) });
    c.particles('rain', { count: 380, size: 0.045, col: L('#d6e0e5'), alpha: 0.35, vel: [-0.05, 1.5], seed: 80 });
    c.text('L13b', V(-W() + 0.2, -0.3, 0.056, INK('#2b1812')));
    c.mg.text('降水量  2.0 mm/h', W() - 0.08, -0.42, { size: 0.012, align: 'right', alpha: 0.6 });
    c.post({ bloom: 0.5, grain: 0.05, vig: 0.35 });
  });
  S(83.50, 85.84, { tin: { type: 'push', dur: 0.4, dir: [0, 1] } }, (c) => {
    c.plate('chalk', cam(c.p, [[0, { x: 0, y: 0.03, zoom: 1.1, par: [0.02, 0.005], focus: 0.6 }], [1, { x: 0.05, y: 0.02, zoom: 1.16 }]]), { water: 0.8, grade: { exposure: 0.98 } });
    c.text('L14a', H(-0.62, -0.32, 0.054, { font: 'hand', col: L('#f6f6f2', 1.1), glow: 0.1 }));
    c.post({ bloom: 0.4, grain: 0.06, vig: 0.35 });
  });
  S(85.84, 87.82, { tin: { type: 'cut' } }, (c) => {
    const k = clamp((c.t - 86.2) / 1.5);
    c.plate('chalk', { x: 0.06, y: 0.02, zoom: 1.18, par: [0.01, 0], focus: 0.6 }, { erode: k, water: 0.8 });
    c.particles('dust', { count: Math.round(220 * Math.sin(k * Math.PI)), size: 0.004, col: L('#ffffff', 1.2), alpha: 0.9, vel: [0.35, -0.04], speed: 1, seed: 86, box: [-W(), -0.1, W(), 0.5] });
    c.text('L14b', H(-0.62, -0.32, 0.054, { font: 'hand', col: L('#f6f6f2', 1.1), out: 86.8, outDur: 0.9, driftX: 0.08, drift: 0 }));
    c.post({ bloom: 0.4, grain: 0.06, vig: 0.35 });
  });
  S(87.82, 90.36, { tin: { type: 'fog', dur: 0.8, col: L('#ffb07a', 0.6) } }, (c) => {
    c.plate('sunset', cam(c.p, [[0, { x: -0.05, y: 0.05, zoom: 1.04, par: [0.02, 0], focus: 0.55 }], [1, { x: 0.0, y: 0.04, zoom: 1.12, dolly: 0.08 }]]), { water: 1, sky: 1.2, lights: lightsOf('sunset', 1.2), grade: { exposure: 1.05, sat: 1.05 } });
    c.text('L15a', V(W() - 0.18, -0.34, 0.058, { col: L('#ffe1c4', 1.2) }));
    c.post({ bloom: 0.9, grain: 0.04, vig: 0.3, letter: 0.07, halation: 0.25 });
  });
  S(90.36, 92.40, { tin: { type: 'cut' } }, (c) => {
    c.plate('sunset', cam(c.p, [[0, { x: 0, y: -0.15, zoom: 1.5, par: [0.015, 0], focus: 0.2 }], [1, { x: 0.02, y: -0.22, zoom: 1.6 }]]), { water: 1, sky: 1.6, lights: lightsOf('sunset', 1.6), grade: { exposure: 1.1, sat: 1.12 } });
    c.text('L15b', V(-W() + 0.2, -0.3, 0.06, { col: L('#ffd0a8', 1.4), glow: 0.5 }));
    c.post({ bloom: 1.0, grain: 0.04, vig: 0.3, letter: 0.07, halation: 0.3 });
  });
  S(92.40, 94.36, { tin: { type: 'flash', dur: 0.25, col: [1, 1, 1] } }, (c) => {
    // the moment becomes a photograph, pinned
    c.solid(L('#e9e5dd'));
    c.sprite('sunset', { x: 0.02, y: -0.01, h: 0.62, rot: -0.03 + c.lt * 0.004, paperEdge: 0.4, seed: 4 });
    c.mg.rect(-0.62, -0.36, 1.26, 0.72, { color: 'rgba(30,30,32,0.15)', w: 0.001 });
    c.mg.text('10.21  17:48', 0.6, 0.36, { size: 0.012, align: 'right', color: 'rgba(30,30,32,0.7)' });
    c.text('L16a', V(-W() + 0.17, -0.3, 0.058, { col: L('#1c1c20'), glow: 0, bleed: 0.2 }));
    c.post({ bloom: 0.3, grain: 0.05, vig: 0.25, paper: 1 });
  });
  S(94.36, 97.36, { tin: { type: 'cut' } }, (c) => {
    // the photograph burns; the warm face behind it
    c.plate('face2', cam(c.p, [[0, { x: 0, y: 0, zoom: 1.1, par: [0.02, 0], focus: 0.5 }], [1, { x: 0.02, y: 0, zoom: 1.18 }]]), { grade: { exposure: 1.0, sat: 1.1, tint: [1.15, 0.9, 0.75] } });
    c.burnOver('sunset', { p: clamp((c.t - 94.5) / 2.4), pt: [0.05, 0.02], h: 0.62 });
    c.particles('embers', { count: 80, size: 0.008, col: L('#ff8a3c', 2), alpha: smooth(94.6, 95.2, c.t), seed: 95, speed: 1 });
    c.text('L16b', V(-W() + 0.17, -0.3, 0.058, { col: L('#ffd2a8', 1.5), glow: 0.6 }));
    c.post({ bloom: 0.9, grain: 0.06, vig: 0.45, halation: 0.3 });
  });

  // ================================================================== PRE-CHORUS 2 — objects, hands, rain on glass
  S(97.36, 101.16, { tin: { type: 'fog', dur: 0.6, col: L('#4a3a30', 0.4) } }, (c) => {
    c.solid(L('#0e0f12'));
    c.fogLayer({ amt: 0.25, col: L('#2a3036'), speed: 0.02, seed: 2 });
    c.objects({ t0: 97.4 });
    c.text('L17a', H(-0.62, 0.36, 0.044, { col: L('#e9e3d8') }));
    c.text('L17b', H(-0.62, 0.42, 0.044, { col: L('#e9e3d8') }));
    c.post({ bloom: 0.6, grain: 0.06, vig: 0.45 });
  });
  S(101.16, 103.42, { tin: { type: 'leak', dur: 0.6, col: L('#ffb35c', 0.8), dir: [0.7, 0.2] } }, (c) => {
    c.plate('hands', cam(c.p, [[0, { x: 0.02, y: 0.02, zoom: 1.08, par: [0.025, 0], focus: 0.7 }], [1, { x: 0.0, y: 0.0, zoom: 1.15, dolly: 0.06 }]]), { lights: lightsOf('hands', 1.2), water: 1, dof: 0.5, dofF: 0.8, grade: { exposure: 1.05 } });
    c.particles('dust', { count: 60, size: 0.006, col: L('#ffe2b8', 1.3), alpha: 0.6, vel: [0.0, -0.03], seed: 101, box: [-0.3, -0.2, 0.3, 0.3] });
    c.text('L18a', V(-W() + 0.2, -0.28, 0.058, { col: L('#fff1dc', 1.1) }));
    c.post({ bloom: 0.8, grain: 0.05, vig: 0.35, halation: 0.2 });
  });
  S(103.42, 105.74, { tin: { type: 'cut' } }, (c) => {
    // warmth spreads from the touching hands: cold teal → amber
    const k = E.io2(clamp((c.t - 103.5) / 2.0));
    c.plate('hands', { x: 0.0, y: 0.0, zoom: 1.2 + k * 0.08, par: [0.01, 0], focus: 0.7 }, { lights: lightsOf('hands', 1 + k), dof: 0.6, dofF: 0.8, grade: { exposure: 1.0 + k * 0.1, sat: lerp(0.4, 1.15, k), tint: [lerp(0.8, 1.12, k), 1, lerp(1.15, 0.85, k)] } });
    c.text('L18b', V(-W() + 0.2, -0.28, 0.058, { col: L('#fff1dc', 1.1) }));
    c.mg.text(`${(lerp(31.2, 36.6, k)).toFixed(1)} ℃`, W() - 0.1, 0.4, { size: 0.016, align: 'right', alpha: 0.7 });
    c.post({ bloom: 0.8, grain: 0.05, vig: 0.35, halation: 0.25 });
  });
  S(105.74, 108.66, { tin: { type: 'ripple', dur: 0.6, pt: [0.2, -0.1] } }, (c) => {
    c.plate('barwin', cam(c.p, [[0, { x: 0.12, y: -0.06, zoom: 1.25, par: [0.01, 0], focus: 0.4 }], [1, { x: 0.14, y: -0.06, zoom: 1.3 }]]), { lights: lightsOf('barwin', 1.1), emis: 0.3, glass: 1, glassRect: [0, 0, 1, 1], glassMask: c.glassText('L19a', 105.74, { x: 0.18, y: -0.24, size: 0.088 }), grade: { exposure: 1.0 } });
    c.post({ bloom: 0.8, grain: 0.05, vig: 0.4 });
  });
  S(108.66, 110.44, { tin: { type: 'cut' } }, (c) => {
    c.plate('barwin', { x: 0.13, y: -0.07, zoom: 1.4, par: [0, 0], focus: 0.4 }, { lights: lightsOf('barwin', 1.1), emis: 0.3, glass: 1, glassMask: c.glassText('L19b', 107.3, { x: 0.05, y: -0.3, size: 0.075 }), grade: { exposure: 1.0 } });
    c.post({ bloom: 0.8, grain: 0.05, vig: 0.4 });
  });
  S(110.44, 112.72, { tin: { type: 'cut' } }, (c) => {
    // a hand wipes the glass clear
    const k = E.io3(clamp((c.t - 110.6) / 1.2));
    c.plate('barwin', { x: 0.13, y: -0.07, zoom: 1.4 + k * 0.1, focus: 0.4 }, { lights: lightsOf('barwin', 1.2), emis: 0.4, glass: 1, glassClear: k, grade: { exposure: 1.0 + k * 0.1 } });
    c.text('L20a', V(-W() + 0.2, -0.28, 0.058, { col: L('#fff1dc', 1.2), glow: 0.4 }));
    c.post({ bloom: 0.8, grain: 0.05, vig: 0.4 });
  });
  S(112.72, 113.57, { tin: { type: 'cut' } }, (c) => {
    const k = E.inExpo(c.p);
    c.plate('barwin', { x: 0.14, y: -0.08, zoom: 1.5 + k * 2.5, focus: 0.4, dolly: k }, { lights: lightsOf('barwin', 1.4), emis: 0.6, grade: { exposure: 1.1 + k } });
    c.text('L20b', V(-W() + 0.2, -0.24, 0.058, { col: L('#fff1dc', 1.2) }));
    c.post({ bloom: 1, grain: 0.04, vig: 0.3, flash: k * 0.7, flashCol: L('#ffe2b0') });
  });

  // ================================================================== CHORUS 2 — the warm room, drawn then painted
  S(113.57, 116.98, { tin: { type: 'flash', dur: 0.3, col: L('#ffe2b0') } }, (c) => {
    const draw = clamp((c.t - 113.6) / 2.6);
    c.plate('barband', cam(c.p, [[0, { x: 0.0, y: 0.0, zoom: 1.04, par: [0.01, 0], focus: 0.5 }], [1, { x: 0.02, y: -0.01, zoom: 1.08 }]]), { sketch: c.sketch('barband', draw), reveal: kf(c.t, [[115.8, 0], [119.0, 1.6, 'io2']]), revO: [0.45, 0.4], lights: lightsOf('barband', smooth(115.8, 118, c.t)) });
    c.brush('c2a', 'さよならは', [113.46, 114.70, 115.42, 115.68, 115.94], { x: 0.56, y: -0.05, h: 0.62, col: L('#2a2420'), glow: 0, cell: 200, weight: 1.0 });
    c.post({ bloom: 0.4, grain: 0.05, vig: 0.3, paper: 1 - smooth(116, 118, c.t) * 0.7 });
  });
  S(116.98, 118.53, { tin: { type: 'cut' } }, (c) => {
    c.plate('barband', cam(c.p, [[0, { x: 0.05, y: -0.06, zoom: 1.3, par: [0.02, 0], focus: 0.4 }], [1, { x: 0.08, y: -0.07, zoom: 1.38 }]]), { sketch: c.sketch('barband', 1), reveal: kf(c.t, [[115.8, 0], [119.0, 1.6, 'io2']]), revO: [0.45, 0.4], lights: lightsOf('barband', 1) });
    c.text('L21b', V(-W() + 0.2, -0.3, 0.06, { col: L('#2a2420'), glow: 0, bleed: 0.25 }));
    c.post({ bloom: 0.5, grain: 0.05, vig: 0.3, paper: 0.4, paint: 0.35 });
  });
  S(118.53, 119.28, { tin: { type: 'cut' } }, (c) => {
    // postcards pinned on the wall — the route of the year
    c.solid(L('#3a2e26'));
    c.glow({ x: 0, y: -0.02, r: 0.9, col: L('#ffd2a0', 0.07) });
    ['school', 'sunset', 'city', 'skysea', 'ferry'].forEach((n, i) => {
      const o = { x: -0.7 + i * 0.35, y: Math.sin(i * 1.7) * 0.05, h: 0.22, rot: (MV.hash(i) - 0.5) * 0.1, paperEdge: 1, seed: i };
      c.sprite(n, Object.assign({}, o, { x: o.x + 0.012, y: o.y + 0.02, sil: 1, silCol: [0, 0, 0], alpha: 0.55, lod: 3.5 }));
      c.sprite(n, Object.assign(o, { tint: [1.05, 0.98, 0.9] }));
    });
    c.post({ bloom: 0.4, grain: 0.06, vig: 0.4 });
  });
  S(119.28, 121.42, { tin: { type: 'cut' } }, (c) => {
    c.plate('city', cam(c.p, [[0, { x: 0.15, y: 0.03, zoom: 1.08, par: [0.02, 0], focus: 0.3 }], [1, { x: 0.25, y: 0.02, zoom: 1.12 }]]), { water: 1.2, sky: 1, emis: 0.5, lights: lightsOf('city', 1), grade: { exposure: 1.0 } });
    c.text('L22a', V(-W() + 0.2, -0.3, 0.058));
    c.post({ bloom: 0.9, grain: 0.05, vig: 0.4, letter: 0.06 });
  });
  S(121.42, 123.88, { tin: { type: 'cut' } }, (c) => {
    // split: the fog harbour and the bright city under one sky; a single thread connects them
    c.split([
      (cc) => cc.plate('harbor', { x: -0.3, y: 0.08, zoom: 1.6, focus: 0.6 }, { fog: { col: L('#5e6d75'), amt: 0.9, near: 0.1, far: 1 }, lights: lightsOf('harbor', 1.3), water: 1, grade: { exposure: 0.55, sat: 0.6 } }),
      (cc) => cc.plate('city', { x: 0.4, y: 0.02, zoom: 1.3, focus: 0.4 }, { water: 1.2, emis: 0.6, lights: lightsOf('city', 1.1) }),
    ], { gap: 0.006, k: E.out3(clamp((c.t - 121.45) / 0.5)) });
    c.text('L22b', H(0, 0.36, 0.05, { align: 'center' }));
    c.post({ bloom: 0.9, grain: 0.05, vig: 0.35, letter: 0.06 });
  });
  S(123.88, 126.50, { tin: { type: 'cut' } }, (c) => {
    c.plate('face5', cam(c.p, [[0, { x: 0, y: 0.0, zoom: 1.08, par: [0.02, 0], focus: 0.5 }], [1, { x: 0.02, y: 0.01, zoom: 1.15 }]]), { grade: { exposure: 1.0, sat: 0.95, tint: [0.95, 1.02, 1.05] } });
    c.particles('dust', { count: 50, size: 0.005, col: L('#dff7f0', 1.3), alpha: 0.6, seed: 124 });
    c.text('L23a', V(W() - 0.2, -0.28, 0.06, { wobble: (t, i) => [Math.sin(t * 30 + i) * 0.003 * MV.a('vln', t), 0], col: L('#e8fff8', 1.1) }));
    c.post({ bloom: 0.7, grain: 0.05, vig: 0.4 });
  });
  S(126.50, 128.30, { tin: { type: 'cut' } }, (c) => {
    c.plate('vln', cam(c.p, [[0, { x: -0.03, y: 0.0, zoom: 1.2, par: [0.03, 0], focus: 0.6 }], [1, { x: 0.03, y: 0.0, zoom: 1.3 }]]), { grade: { exposure: 1.05 }, dof: 0.7, dofF: 0.65, sweep: c.sheen('vln') });
    c.text('L23b', V(W() - 0.2, -0.28, 0.06, INK('#1d2228')));
    c.post({ bloom: 0.8, grain: 0.05, vig: 0.35 });
  });
  S(128.30, 130.40, { tin: { type: 'cut' } }, (c) => {
    c.plate('barband', cam(c.p, [[0, { x: 0, y: 0, zoom: 1.05, par: [0.02, 0], focus: 0.5 }], [1, { x: 0, y: -0.01, zoom: 1.1 }]]), { lights: lightsOf('barband', 1 + MV.beatPulse(c.t) * 0.6), emis: 0.5, grade: { exposure: 1.05 + MV.beatPulse(c.t) * 0.1 } });
    c.text('L24a', V(-W() + 0.2, -0.28, 0.062, { col: L('#fff1dc', 1.2), glow: 0.4 }));
    c.post({ bloom: 0.8, grain: 0.04, vig: 0.3, paint: 0.25 });
  });
  S(130.40, 131.80, { tin: { type: 'cut' } }, (c) => {
    // the bass string snaps — the ground of the song is gone
    const t = c.t; const k = smooth(130.46, 131.25, t);
    c.solid(L('#08090b'));
    c.particles('bokeh', { count: 26, size: 0.08, col: L('#ffb07a', 0.35), alpha: 0.7 * (1 - k * 0.6), vel: [0.01, 0], speed: 0.4, zmin: 0.2, seed: 130 });
    const set = stringSet(t, { ampK: 1.3, gap0: 0.1, gap1: 0.055, y: -0.02 });
    set[4].amp += 0.02 * Math.exp(-Math.max(0, t - 130.42) * 3); set[4].cut = [0.56, k];
    c.stringsShot(set, { focus: 0.0, dof: 1.2, exposure: 1.15 - k * 0.3 });
    const cx = (0.56 - 0.5) * MV.R.asp; const cy = -0.02 + 2 * MV.lerp(0.1, 0.055, 0.56);
    c.particles('sparks', { count: 80, size: 0.01, col: L('#ffd2a0', 2.2), t0: 130.46, origin: [cx, cy], spread: 0.7, seed: 7 });
    c.ripple(cx, cy, 130.46, 1.0);
    c.text('L24b', V(-W() + 0.2, -0.24, 0.06, { col: L('#fff1dc', 1.0) }));
    const a = smooth(130.6, 130.9, t);
    c.mg.text('Ⅴ  ─  受信なし', W() - 0.08, 0.42, { size: 0.014, align: 'right', alpha: a * (0.6 + 0.4 * Math.round(Math.sin(t * 12) * 0.5 + 0.5)), color: 'rgba(255,150,180,0.95)' });
    c.post({ bloom: 0.8, grain: 0.06, vig: 0.55, shake: shake(t, 0.006 * Math.exp(-Math.max(0, t - 130.46) * 5)) });
  });
  S(131.80, 133.10, { tin: { type: 'fade', dur: 0.4 } }, (c) => {
    // the room dims; fog rolls in over the warm painting
    const k = smooth(131.8, 133.0, c.t);
    c.plate('barband', { x: 0.0, y: -0.01, zoom: 1.12 + k * 0.05, par: [0.01, 0], focus: 0.5 }, { lights: lightsOf('barband', 1 - k * 0.7), fog: { col: L('#3c4a52'), amt: 0.3 + k * 1.0, near: 0.4, far: 1, scale: 1.5 }, grade: { exposure: 0.9 - k * 0.45, sat: 0.8 - k * 0.5 } });
    c.mg.text('Ⅴ  ─  受信なし', W() - 0.08, 0.42, { size: 0.014, align: 'right', alpha: 0.7 * (1 - k), color: 'rgba(255,150,180,0.95)' });
    c.mg.text('送信失敗', W() - 0.08, 0.445, { size: 0.011, align: 'right', font: 'mincho', alpha: 0.6 * (1 - k) });
    c.post({ bloom: 0.6, grain: 0.06, vig: 0.5 });
  });

  // ================================================================== BRIDGE (no bass) — lost in the night fog
  S(133.10, 135.02, { tin: { type: 'fog', dur: 1.0, col: L('#25323a', 0.6) } }, (c) => {
    const drift = [Math.sin(c.lt * 0.7) * 0.03, Math.sin(c.lt * 0.5) * 0.01];
    c.plate('lighthouse', cam(c.p, [[0, { x: -0.2 + drift[0], y: 0.02, zoom: 1.1, par: [0.02, 0], focus: 0.4, roll: Math.sin(c.lt * 0.6) * 0.02 }], [1, { x: -0.1 + drift[0], y: 0.03, zoom: 1.15, roll: Math.sin(c.lt * 0.6) * 0.02 }]]), {
      fog: { col: L('#3a4a54'), amt: 1.1, near: 0.15, far: 1, scale: 1.4, vel: [0.06, 0] }, lights: lightsOf('lighthouse', 1.3), water: 1.2, beam: { u: 0.64, v: 0.39, z: 0.15, ang: Math.PI * (0.72 + c.lt * 0.22), i: 0.7, c: L('#fff1d6'), w: 0.12 }, grade: { exposure: 0.95, sat: 0.8 } });
    c.text('L25a', V(-W() + 0.2, -0.28, 0.058, { alpha: 0.95 }));
    MV.hud.vis = 5;
    c.post({ bloom: 0.8, grain: 0.06, vig: 0.5 });
  });
  S(135.02, 137.30, { tin: { type: 'cut' } }, (c) => {
    // words only exist where the lighthouse beam passes
    const ang = Math.PI * (0.55 + (c.t - 135.02) * 0.38);
    c.plate('lighthouse', { x: 0.1, y: -0.02, zoom: 1.35, par: [Math.sin(c.lt) * 0.01, 0], focus: 0.4 }, { fog: { col: L('#3a4a54'), amt: 1.2, near: 0.2, far: 1, scale: 1.4 }, lights: lightsOf('lighthouse', 1.2), beam: { u: 0.64, v: 0.39, z: 0.15, ang, i: 0.85, c: L('#fff1d6'), w: 0.13 }, water: 1, grade: { exposure: 0.9, sat: 0.75 } });
    c.beamText('L25b', { x: -0.15, y: -0.05, size: 0.075, beamU: 0.64, beamV: 0.39, ang, w: 0.13 });
    c.post({ bloom: 0.9, grain: 0.06, vig: 0.5 });
  });
  S(137.30, 139.36, { tin: { type: 'cut' } }, (c) => {
    // a remembered smile inside a lamp's glow
    c.plate('face4', cam(c.p, [[0, { x: -0.03, y: -0.03, zoom: 1.32, par: [0.02, 0], focus: 0.6 }], [1, { x: -0.01, y: -0.04, zoom: 1.4 }]]), { fog: { col: L('#1c140e'), amt: 0.45, near: 0.5, far: 1, scale: 0.7, vel: [0.012, -0.004] }, grade: { exposure: 0.92, tint: [1.18, 0.95, 0.72], sat: 0.8, contrast: 1.1 }, vig: 1 });
    c.glow({ x: 0.3, y: -0.3, r: 0.7, col: L('#ff9a3c', 0.08 + MV.a('voc', c.t) * 0.08) });
    c.fogLayer({ amt: 0.18, col: L('#2a2018'), speed: 0.02, seed: 6 });
    c.text('L26a', V(-W() + 0.22, -0.26, 0.058, { col: L('#ffe8c8', 1.2) }));
    c.post({ bloom: 1.0, grain: 0.06, vig: 0.55 });
  });
  S(139.36, 141.36, { tin: { type: 'cut' } }, (c) => {
    c.plate('lighthouse', { x: -0.62, y: -0.12, zoom: 3.0, par: [0.01, 0], focus: 0.7 }, { fog: { col: L('#3a4a54'), amt: 0.8, near: 0.1, far: 1, scale: 2 }, lights: lightsOf('lighthouse', 1.5 + smooth(139.4, 140.5, c.t) * 2), grade: { exposure: 0.95 } });
    c.text('L26b', V(W() - 0.2, -0.28, 0.06, { col: L('#ffd9a0', 1.6), glow: 0.8 }));
    c.post({ bloom: 1.1, grain: 0.06, vig: 0.5 });
  });
  S(141.36, 143.80, { tin: { type: 'cut' } }, (c) => {
    c.plate('lighthouse', { x: 0.0, y: 0.0, zoom: 1.05, par: [0.01, 0], focus: 0.4 }, { fog: { col: L('#2e3b44'), amt: 1.0, near: 0.15, far: 1 }, lights: lightsOf('lighthouse', 1), grade: { exposure: 0.75, sat: 0.7 } });
    c.particles('lanterns', { count: 72, size: 0.026, col: L('#ffb35c', 1.6), t0: 141.4, spread: 2.4, box: [-W(), -0.5, W(), 0.5], seed: 141 });
    c.text('L27a', V(-W() + 0.2, -0.28, 0.058, { col: L('#ffe8c8', 1.1) }));
    c.post({ bloom: 1.1, grain: 0.06, vig: 0.45 });
  });
  S(143.80, 146.32, { tin: { type: 'cut' } }, (c) => {
    // the small lights stack into a column — a lighthouse made of wishes
    const k = smooth(143.9, 145.8, c.t);
    c.plate('lighthouse', { x: 0.0, y: 0.0, zoom: 1.05, focus: 0.4 }, { fog: { col: L('#2e3b44'), amt: 1.0, near: 0.15, far: 1 }, lights: lightsOf('lighthouse', 1 + k), beam: { u: 0.64, v: 0.39, z: 0.15, ang: -Math.PI * 0.5, i: k * 1.4, c: L('#ffe3b0'), w: 0.05 + k * 0.05 }, grade: { exposure: 0.75 + k * 0.2, sat: 0.7 } });
    c.particles('lanterns', { count: 72, size: 0.026, col: L('#ffb35c', 1.8), t0: 141.4, spread: 2.4, box: [-W(), -0.5, W(), 0.5], seed: 141, stack: k, target: [0.29, 0.25] });
    c.text('L27b', V(-W() + 0.2, -0.28, 0.058, { col: L('#ffe8c8', 1.1) }));
    c.post({ bloom: 1.1, grain: 0.06, vig: 0.45 });
  });
  S(146.32, 148.32, { tin: { type: 'fog', dur: 0.9, col: L('#ffe7c4', 0.6) } }, (c) => {
    // dawn: the fog thins, visibility counter rolls up
    const k = smooth(146.4, 148.3, c.t);
    c.plate('puddles', { x: 0, y: -0.18, zoom: 1.0, par: [0.01, 0.01], focus: 0.4 }, { fog: { col: L('#b9c0c4'), amt: lerp(0.95, 0.3, k), near: 0.2, far: 1, scale: 1.2, vel: [0.08, 0] }, lights: lightsOf('puddles', 0.8 + k * 0.6), sky: 1, water: 0.6, grade: { exposure: 0.82 + k * 0.15 } });
    c.text('L28a', V(W() - 0.2, -0.3, 0.064, { col: L('#fff6e8', 1.0), glow: 0.2, out: 153 }));
    MV.hud.vis = Math.round(lerp(5, 2000, E.in3(k)));
    c.post({ bloom: 0.9, grain: 0.05, vig: 0.35, halation: 0.2 });
  });
  S(148.32, 153.88, { tin: { type: 'cut' } }, (c) => {
    const k = smooth(148.4, 151, c.t);
    c.plate('skysea', cam(c.p, [[0, { x: 0.05, y: -0.08, zoom: 1.5, par: [0.02, 0], focus: 0.3 }], [1, { x: 0.12, y: -0.05, zoom: 1.08, par: [-0.02, 0] }]]), { sky: 1.5, water: 1, lights: lightsOf('skysea', 1.0 + k * 0.6), fog: { col: L('#f4e8da'), amt: (1 - k) * 0.6, near: 0.2, far: 1, scale: 1 }, grade: { exposure: 0.92 + k * 0.08, sat: 1.05 } });
    c.bigGlyph('朝', { x: -0.45, y: 0.0, h: 0.5, font: 'brush', col: L('#151b26'), halo: L('#fff4e2'), alpha: smooth(148.4, 149.2, c.t) * (1 - smooth(152.6, 153.6, c.t)), dissolve: smooth(152.4, 153.8, c.t) });
    c.text('L28a', V(W() - 0.2, -0.3, 0.064, { col: L('#151b26'), glow: 0, out: 152.6 }));
    c.post({ bloom: 1.1, grain: 0.04, vig: 0.25, letter: 0.06, halation: 0.25 });
  });

  // ================================================================== INSTRUMENTAL (violin + guitar + drums, still no bass)
  S(153.88, 156.12, { tin: { type: 'push', dur: 0.4, dir: [1, 0] } }, (c) => {
    c.plate('ferry', cam(c.p, [[0, { x: -0.2, y: 0.02, zoom: 1.2, par: [0.05, 0], focus: 0.45 }], [1, { x: 0.05, y: 0.02, zoom: 1.2, par: [-0.05, 0] }]]), { water: 1.4, sky: 1, lights: lightsOf('ferry', 1), grade: { exposure: 1.05, sat: 1.1 } });
    c.particles('gulls', { count: 9, size: 0.035, col: L('#fbfaf6'), vel: [-0.08, 0], box: [-W(), -0.45, W(), -0.05], seed: 154 });
    c.mg.text('航路  ─  5 h 00 m', W() - 0.08, 0.42, { size: 0.013, align: 'right', alpha: 0.7 });
    c.post({ bloom: 0.8, grain: 0.035, vig: 0.25, letter: 0.06 });
  });
  S(156.12, 158.34, { tin: { type: 'cut' } }, (c) => {
    // the open sea, procedural — a violin line skims the waves
    const lt = c.lt;
    c.sea({ pos: [lt * 3, 2.5, lt * 12], ang: [0.4, -0.06], sun: [0.6, 0.35, 1], sunCol: L('#fff2d8', 1.1), skyTop: L('#2f6fb3'), skyHor: L('#bfe3f2'), fogCol: L('#cfe6ef'), water: L('#0b4a63'), fogDen: 0.008, wave: 1.1, exposure: 1.05 });
    c.particles('gulls', { count: 5, size: 0.03, col: L('#fbfaf6'), vel: [-0.1, 0], box: [-W(), -0.42, W(), -0.15], seed: 156 });
    c.post({ bloom: 0.7, grain: 0.03, vig: 0.2 });
  });
  S(158.34, 161.14, { tin: { type: 'cut' } }, (c) => {
    c.plate('festival', cam(c.p, [[0, { x: -0.55, y: -0.2, zoom: 2.2, par: [0.03, 0], focus: 0.3 }], [1, { x: -0.45, y: -0.18, zoom: 2.0, par: [-0.02, 0] }]]), { emis: 0.6, lights: lightsOf('festival', 1), grade: { exposure: 1.0 } });
    c.mg.text('SUMMER MUSIC FES.  ─  ENTRY 07', -W() + 0.08, 0.42, { size: 0.013, alpha: 0.75 });
    c.mg.text('霧笛（雾屿市）', -W() + 0.08, 0.445, { size: 0.013, alpha: 0.6, font: 'mincho' });
    MV.hud.vis = -1;
    c.post({ bloom: 0.9, grain: 0.04, vig: 0.3 });
  });

  // ================================================================== FINAL CHORUS — the missing line, then the return
  S(161.14, 163.96, { tin: { type: 'flash', dur: 0.35, col: L('#ffd0b0') } }, (c) => {
    // stage without the bassist (crop excludes stage right)
    c.plate('festival', cam(c.p, [[0, { x: -0.25, y: -0.04, zoom: 1.45, par: [0.02, 0], focus: 0.5 }], [1, { x: -0.22, y: -0.05, zoom: 1.55, dolly: 0.05 }]]), { emis: 0.6, lights: lightsOf('festival', 1.1), grade: { exposure: 1.0 } });
    c.brush('fc1', 'さよならは', [161.14, 162.14, 162.44, 162.71, 162.98], { x: 0.55, y: -0.04, h: 0.66, col: L('#fff3dc', 1.0), halo: L('#0a0608'), haloA: 0.6, cell: 200 });
    c.post({ bloom: 0.9, grain: 0.04, vig: 0.3 });
  });
  S(163.96, 166.30, { tin: { type: 'cut' } }, (c) => {
    c.plate('festival', cam(c.p, [[0, { x: -0.1, y: 0.18, zoom: 1.6, par: [0.04, 0], focus: 0.85 }], [1, { x: -0.18, y: 0.17, zoom: 1.7, par: [-0.03, 0] }]]), { emis: 0.6, lights: lightsOf('festival', 1.1), dof: 0.9, dofF: 0.9, grade: { exposure: 0.95 } });
    c.text('L29b', V(W() - 0.2, -0.3, 0.06, { col: L('#fff3dc', 1.2), glow: 0.4 }));
    c.post({ bloom: 0.9, grain: 0.04, vig: 0.35 });
  });
  S(166.30, 168.48, { tin: { type: 'cut' } }, (c) => {
    c.plate('festival', cam(c.p, [[0, { x: 0.05, y: -0.36, zoom: 1.9, par: [0.02, 0], focus: 0.2 }], [1, { x: 0.12, y: -0.37, zoom: 2.0 }]]), { emis: 0.8, lights: lightsOf('festival', 1.2), sky: 1, grade: { exposure: 1.0 } });
    c.text('L30a', H(0, 0.3, 0.054, { align: 'center', col: L('#fff3dc', 1.2), glow: 0.4 }));
    c.post({ bloom: 1.0, grain: 0.04, vig: 0.3 });
  });
  S(168.48, 170.70, { tin: { type: 'cut' } }, (c) => {
    // the ferry ticket, stamped
    c.solid(L('#151317'));
    c.sprite('obj5', { x: 0, y: 0, h: 0.42, rot: -0.06 + Math.sin(c.lt) * 0.01, alpha: smooth(168.5, 168.9, c.t) });
    const k = smooth(169.0, 169.12, c.t); c.mg.circle(0.15, 0.06, 0.07, { color: `rgba(220,60,70,${0.85 * k})`, w: 0.004 }); c.mg.text('済', 0.15, 0.06, { size: 0.05, font: 'mincho', align: 'center', color: `rgba(220,60,70,${0.85 * k})` });
    c.text('L30b', H(0, 0.34, 0.05, { align: 'center' }));
    c.post({ bloom: 0.6, grain: 0.05, vig: 0.45 });
  });
  S(170.70, 172.92, { tin: { type: 'cut' } }, (c) => {
    c.plate('face1', cam(c.p, [[0, { x: 0, y: 0, zoom: 1.05, par: [0.02, 0], focus: 0.5 }], [1, { x: 0.02, y: 0, zoom: 1.12 }]]), { grade: { exposure: 1.15, tint: [1.08, 1.0, 0.92] }, lights: [{ u: 0.18, v: 0.62, z: 0.6, c: L('#ffcf7a'), i: 0.8 + MV.a('voc', c.t), r: 0.25 }] });
    c.voiceRipples(-0.42, 0.12, 1.1);
    c.text('L31a', V(W() - 0.2, -0.28, 0.064, { col: L('#fff1d8', 1.3), glow: 0.6 }));
    c.post({ bloom: 1.0, grain: 0.05, vig: 0.35, shake: shake(c.t, 0.0015) });
  });
  S(172.92, 175.34, { tin: { type: 'cut' } }, (c) => {
    c.plate('face1', { x: -0.06, y: 0.0, zoom: 1.25 + c.p * 0.1, par: [0.015, 0], focus: 0.5 }, { grade: { exposure: 0.8, sat: 0.7, tint: [1.08, 0.98, 0.9] }, vig: 0.6, lights: [{ u: 0.18, v: 0.62, z: 0.6, c: L('#ffcf7a'), i: 0.8 + MV.a('voc', c.t), r: 0.3 }] });
    for (let k = 0; k < 5; k++) c.ripple(-0.35, 0.1, 172.92 + k * MV.beatLen, 1.4 - k * 0.15);
    c.text('L31b', H(0, -0.05, 0.11, { align: 'center', font: 'minchoB', col: L('#fff1d8', 1.05), glow: 0.25, spacing: 1.15 }));
    c.post({ bloom: 1.1, grain: 0.05, vig: 0.4, shake: shake(c.t, 0.003 * MV.a('kick', c.t)) });
  });
  S(175.34, 177.46, { tin: { type: 'cut' } }, (c) => {
    // a ring travels across the plaza into the dark wings, where someone waits
    c.fogfly({ speed: 0.15, density: 0.26, a: L('#3a2f3a'), b: L('#07060a'), lamps: 0.7, lampCol: L('#ffb07a', 0.8), seed: 31 });
    c.particles('bokeh', { count: 26, size: 0.07, col: L('#ff9a5c', 0.5), alpha: 0.6, vel: [0.01, 0], speed: 0.3, zmin: 0.2, seed: 176, box: [-W(), -0.5, -0.1, 0.5] });
    c.glow({ x: 0.32, y: -0.05, r: 0.55, col: L('#ff8fb8', 0.18) });
    c.sprite('bassist', { x: 0.25, y: 0.06, h: 0.95 * 1.015, sil: 1, silCol: L('#ff9cc0', 0.9), lod: 4.5, alpha: 0.6, add: true });
    c.sprite('bassist', { x: 0.25, y: 0.06, h: 0.95, sil: 0.72, silCol: L('#0d0a0e') });
    c.ripple(-1.0, 0.05, 175.4, 0.9);
    c.text('L32a', V(-W() + 0.2, -0.28, 0.06, { col: L('#fff1d8', 1.2) }));
    c.post({ bloom: 0.9, grain: 0.06, vig: 0.5 });
  });
  S(177.46, 178.56, { tin: { type: 'cut' } }, (c) => {
    c.fogfly({ speed: 0.15, density: 0.24, a: L('#3a2f3a'), b: L('#07060a'), lamps: 0.5, lampCol: L('#ffb07a', 0.7), seed: 32 });
    c.glow({ x: 0.05, y: -0.1, r: 0.7, col: L('#ff8fb8', 0.2 + c.lt * 0.15) });
    const bh = 1.6 + c.lt * 0.15;
    c.sprite('bassist', { x: 0.0, y: 0.15, h: bh * 1.012, sil: 1, silCol: L('#ffa6c8', 0.8), lod: 5, alpha: 0.55, add: true });
    c.sprite('bassist', { x: 0.0, y: 0.15, h: bh, sil: 0.5, silCol: L('#120e12') });
    c.text('L32b', V(-W() + 0.25, -0.18, 0.08, { col: L('#ffd8e8', 1.4), glow: 0.6 }));
    c.post({ bloom: 1.0, grain: 0.06, vig: 0.5 });
  });
  S(178.56, 180.74, { tin: { type: 'cut' } }, (c) => {
    // the held breath — everything waits for the ground to come back
    const k = smooth(178.6, 180.7, c.t);
    c.plate('festival', { x: -0.25 + k * 0.1, y: -0.04, zoom: 1.55 - k * 0.3, par: [0.0, 0], focus: 0.5 }, { emis: 0.6, lights: lightsOf('festival', 1 + k * 0.5), grade: { exposure: 0.85 + k * 0.2, sat: 0.6 + k * 0.4 } });
    c.text('L33a', V(W() - 0.2, -0.3, 0.064, { col: L('#fff3dc', 1.3), glow: 0.5, out: 181.6 }));
    c.post({ bloom: 0.9 + k * 0.5, grain: 0.05, vig: 0.35 + k * 0.2 });
  });
  S(180.74, 182.34, { tin: { type: 'flash', dur: 0.18, col: L('#ffd6e6', 1.2) } }, (c) => {
    // IMPACT: the bass returns — full stage, shockwave from the floor, first snow
    const age = c.t - 180.74;
    c.plate('festival', cam(c.p, [[0, { x: 0.05, y: -0.02, zoom: 1.06, par: [0.03, 0], focus: 0.5 }], [1, { x: 0.05, y: -0.03, zoom: 1.12 }]]), { emis: 0.8, lights: lightsOf('festival', 1.6), grade: { exposure: 1.1, sat: 1.1 } });
    c.ripple(0.12, 0.5, 180.74, 2.2); c.ripple(0.12, 0.5, 180.95, 1.2);
    c.particles('snow', { count: Math.round(160 * smooth(180.8, 181.8, c.t)), size: 0.008, col: L('#ffffff', 1.1), vel: [0.02, 0.08], dof: 1, dofF: 0.4, seed: 181 });
    c.particles('sparks', { count: 90, size: 0.01, col: C.pink, t0: 180.74, origin: [0.12, 0.45], spread: 1.2, seed: 7 });
    c.text('L33a', V(W() - 0.2, -0.3, 0.064, { col: L('#fff3dc', 1.3), glow: 0.5, out: 181.6 }));
    c.post({ bloom: 1.2, grain: 0.04, vig: 0.3, shake: shake(c.t, 0.02 * Math.exp(-age * 4)), ca: 1.5 * Math.exp(-age * 3) });
  });
  S(182.34, 184.18, { tin: { type: 'cut' } }, (c) => {
    const b = MV.beatInfo(c.t); const cut = ['bass', 'gtr', 'cajon', 'vln'][Math.max(0, b.i) % 4];
    c.plate(cut, { x: 0, y: 0, zoom: 1.15 + MV.beatPulse(c.t, 8) * 0.06, par: [0.02, 0], focus: 0.6 }, { grade: { exposure: 1.1 + MV.beatPulse(c.t) * 0.25, sat: 1.1 }, sweep: c.sheen(cut === 'cajon' ? 'snare' : cut, { k: 1.2 }) });
    c.particles('snow', { count: 120, size: 0.008, col: L('#ffffff', 1.1), vel: [0.02, 0.08], dof: 1, dofF: 0.4, seed: 182 });
    c.text('L33b', V(W() - 0.2, -0.32, 0.064, { col: L('#fff3dc', 1.4), glow: 0.6 }));
    c.post({ bloom: 1.0, grain: 0.05, vig: 0.3, shake: shake(c.t, 0.003 * MV.a('kick', c.t)) });
  });
  S(184.18, 186.42, { tin: { type: 'fog', dur: 0.7, col: L('#ffe2b0', 0.6) } }, (c) => {
    c.plate('barband', cam(c.p, [[0, { x: 0.0, y: -0.05, zoom: 1.1, par: [0.02, 0], focus: 0.5 }], [1, { x: 0.02, y: -0.06, zoom: 1.2, dolly: 0.06 }]]), { lights: lightsOf('barband', 1.3), emis: 0.6, grade: { exposure: 1.1, tint: [1.08, 1.0, 0.9] } });
    c.text('L34a', V(-W() + 0.2, -0.28, 0.062, { col: L('#fff1dc', 1.2), glow: 0.4 }));
    c.post({ bloom: 0.9, grain: 0.04, vig: 0.3, paint: 0.4, halation: 0.25 });
  });
  S(186.42, 188.50, { tin: { type: 'cut' } }, (c) => {
    // the cassette — "店内録音・凪" — reels turning: a voice that is still alive
    c.solid(L('#120f0d'));
    c.glow({ x: 0, y: 0, r: 0.6, col: L('#ffb35c', 0.35) });
    c.sprite('obj3', { x: 0, y: 0, h: 0.5, rot: Math.sin(c.lt * 0.8) * 0.02 });
    c.reels({ x: 0, y: 0.0, h: 0.5, t: c.t });
    c.text('L34b', V(W() - 0.2, -0.28, 0.062, { col: L('#fff1dc', 1.2), glow: 0.4 }));
    c.post({ bloom: 0.8, grain: 0.06, vig: 0.45 });
  });
  S(188.50, 191.04, { tin: { type: 'fog', dur: 0.8, col: L('#dfe7ec', 0.5) } }, (c) => {
    // first snow over the night harbour; the bench
    c.plate('harbor', cam(c.p, [[0, { x: -0.3, y: 0.08, zoom: 1.45, par: [0.02, 0], focus: 0.7 }], [1, { x: -0.35, y: 0.1, zoom: 1.6, dolly: 0.08 }]]), { fog: { col: L('#41505a'), amt: 0.7, near: 0.1, far: 1, scale: 1.5 }, lights: lightsOf('harbor', 1.6), water: 1, grade: { exposure: 0.6, sat: 0.55, tint: [0.85, 0.95, 1.1] } });
    c.particles('snow', { count: 260, size: 0.009, col: L('#ffffff', 1.1), vel: [0.015, 0.06], dof: 1.4, dofF: 0.45, seed: 188 });
    c.text('L35a', V(W() - 0.2, -0.28, 0.06, { col: L('#f2f6f8', 1.2) }));
    c.mg.text('初雪', -W() + 0.08, 0.42, { size: 0.018, font: 'mincho', alpha: 0.75 });
    MV.hud.vis = 500;
    c.post({ bloom: 0.8, grain: 0.05, vig: 0.4 });
  });
  S(191.04, 193.26, { tin: { type: 'cut' } }, (c) => {
    c.plate('face3', cam(c.p, [[0, { x: 0, y: 0, zoom: 1.06, par: [0.02, 0], focus: 0.5 }], [1, { x: 0.02, y: 0.01, zoom: 1.12 }]]), { grade: { exposure: 1.05, tint: [1.05, 1.0, 0.96] }, lights: [{ u: 0.3, v: 0.8, z: 0.6, c: L('#ffcf9a'), i: 0.4 + MV.a('kick', c.t) * 0.8, r: 0.3 }] });
    c.particles('snow', { count: 160, size: 0.008, col: L('#ffffff', 1.0), vel: [0.015, 0.06], dof: 1.4, dofF: 0.45, seed: 191 });
    c.text('L35b', V(W() - 0.2, -0.28, 0.06, INK('#2a2430')));
    c.post({ bloom: 0.8, grain: 0.05, vig: 0.4, paint: 0.2 });
  });
  S(193.26, 196.14, { tin: { type: 'fog', dur: 0.8, col: L('#e7edf1', 0.6) } }, (c) => {
    c.plate('snowwalk', cam(c.p, [[0, { x: -0.05, y: 0.08, zoom: 1.25, par: [0.02, 0.01], focus: 0.55 }], [1, { x: -0.02, y: 0.0, zoom: 1.18, par: [0, -0.01] }]]), { lights: lightsOf('snowwalk', 1.2), water: 1, emis: 0.4, beam: { u: 0.86, v: 0.17, z: 0.08, ang: Math.PI * (1.0 + c.lt * 0.15), i: 0.6, c: L('#fff1d6'), w: 0.06 }, grade: { exposure: 1.0 } });
    c.particles('snow', { count: 320, size: 0.009, col: L('#ffffff', 1.1), vel: [0.015, 0.06], dof: 1.4, dofF: 0.45, seed: 193 });
    c.text('L36a', V(-W() + 0.2, -0.3, 0.06, { col: L('#fff4ea', 1.2) }));
    c.post({ bloom: 0.8, grain: 0.045, vig: 0.35 });
  });
  S(196.14, 203.50, { tin: { type: 'cut' } }, (c) => {
    // crane up: past the walkers to the lighthouse and the sky; fog closes gently
    const k = E.io2(c.p);
    c.plate('snowwalk', { x: lerp(-0.02, 0.3, k), y: lerp(0.0, -0.3, k), zoom: lerp(1.18, 1.45, k), par: [0.01, lerp(0, -0.03, k)], focus: 0.5 }, { lights: lightsOf('snowwalk', 1.2), water: 1, emis: 0.4, beam: { u: 0.86, v: 0.17, z: 0.08, ang: Math.PI * (1.0 + c.lt * 0.15), i: 0.7, c: L('#fff1d6'), w: 0.06 }, fog: { col: L('#bfcbd2'), amt: smooth(199.5, 203.5, c.t) * 1.1, near: 0.3, far: 1, scale: 1.2 }, grade: { exposure: 1.0 } });
    c.particles('snow', { count: 320, size: 0.009, col: L('#ffffff', 1.1), vel: [0.015, 0.06], dof: 1.4, dofF: 0.45, seed: 196 });
    c.brush('aruku', '歩く', [195.16, 196.14], { x: 0.5, y: -0.05, h: 0.5, col: L('#fff6ea', 1.0), halo: L('#05080c'), haloA: 0.55, cell: 300, weight: 1.1, alpha: 1 - smooth(201.5, 203.2, c.t) });
    c.text('L36a', V(-W() + 0.2, -0.3, 0.06, { col: L('#fff4ea', 1.2), out: 199.5 }));
    c.post({ bloom: 0.85, grain: 0.045, vig: 0.35 });
  });
  // ================================================================== OUTRO
  S(203.50, 210.63, { tin: { type: 'fog', dur: 1.4, col: L('#cbd6dc', 0.5) } }, (c) => {
    const ex = 1 - smooth(208.6, 210.4, c.t);
    c.fogfly({ speed: 0.25, density: 0.3, a: L('#9fb0b8'), b: L('#1b252c'), seed: 21, exposure: ex });
    c.glow({ x: 0.42, y: -0.06, r: 0.32, col: L('#fff1d6', 0.18 * ex) }); c.glow({ x: 0.42, y: -0.06, r: 0.02, col: L('#fff1d6', 1.6 * ex) });
    c.beam({ x: 0.42, y: -0.06, ang: Math.PI * (0.9 + c.lt * 0.12), i: 0.32 * ex, col: L('#fff1d6'), w: 0.2 });
    c.ripple(0.42, -0.06, 204.3, 0.9);
    const a = smooth(205.0, 205.9, c.t) * (1 - smooth(208.4, 209.8, c.t));
    c.mg.text('歌が終わっても、こだまは残る。', 0, 0.06, { size: 0.03, font: 'mincho', align: 'center', alpha: a * 0.92, track: 0.12 });
    c.mg.text('霧笛', 0, 0.14, { size: 0.018, font: 'mincho', align: 'center', alpha: a * 0.65, track: 0.4 });
    MV.hud.vis = Math.round(lerp(500, 0, smooth(203.6, 207, c.t))); MV.hud.show = 1 - smooth(207.5, 209, c.t);
    c.post({ bloom: 0.6, grain: 0.06, vig: 0.5, fade: smooth(209.2, 210.6, c.t) });
  });

  // ------------------------------------------------------------------ rain ripples helper (deterministic)
  function rainRipples(t, t0) { const r = []; for (let k = 0; k < 8; k++) { const per = 0.37 + MV.hash(k) * 0.3; const ph_ = Math.floor((t - t0) / per - MV.hash(k + 9)); const tt = t0 + (ph_ + MV.hash(k + 9)) * per; r.push([0.15 + MV.hash(k * 3 + ph_) * 0.7, 0.62 + MV.hash(k * 7 + ph_ * 1.3) * 0.33, tt, 0.7]); } return r; }

})(window.MV);
