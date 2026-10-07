/* 霧笛 MV — engine: asset loading, render passes, draw primitives (plates, sprites, particles, ribbons,
   glyphs), brush calligraphy, motion-graphics overlay, pencil sketch drawer, post-processing. */
'use strict';
(function (MV) {
  const { G, clamp, lerp, kf, E } = MV;
  // ======================================================================= assets
  const A = (MV.assets = { data: {}, img: {}, tex: {} });
  window.MV_ASSET = (name, uri) => { A.data[name] = uri; };
  A.loadScripts = function (list, onProgress) {
    return new Promise((resolve, reject) => {
      let i = 0; let bytes = 0; const total = list.reduce((s, x) => s + x.size, 0);
      const next = () => {
        if (i >= list.length) { resolve(); return; }
        const it = list[i++]; const s = document.createElement('script'); s.src = it.file;
        s.onload = () => { bytes += it.size; onProgress && onProgress(bytes / total, it.name); next(); };
        s.onerror = () => reject(new Error('failed to load ' + it.file));
        document.head.appendChild(s);
      };
      next();
    });
  };
  A.decode = async function (onProgress) {
    const names = Object.keys(A.data); let k = 0;
    await Promise.all(names.map(async (n) => {
      const im = new Image(); im.src = A.data[n];
      try { await im.decode(); } catch (e) { await new Promise((r) => { im.onload = r; }); }
      A.img[n] = im; delete A.data[n]; k++; onProgress && onProgress(k / names.length);
    }));
  };
  // textures are created lazily (first use) so GPU memory stays bounded
  A.get = function (name, opt) {
    if (A.tex[name]) return A.tex[name];
    const im = A.img[name]; if (!im) { console.warn('missing asset', name); return null; }
    const isDepth = /_d$|_fx$/.test(name);
    A.tex[name] = G.tex(im, { srgb: !isDepth && !(opt && opt.linear), mip: true });
    return A.tex[name];
  };
  A.prewarm = function (names) { names.forEach((n) => A.get(n)); };

  // ======================================================================= renderer core
  const R = (MV.R = {});
  R.init = function (canvas) {
    const gl = G.init(canvas); R.gl = gl; R.canvas = canvas;
    const S = MV.SH;
    R.P = {
      plate: G.compile('plate', S.vsFS, S.plate),
      sprite: G.compile('sprite', S.spriteVS, S.spriteFS),
      part: G.compile('part', S.partVS, S.partFS),
      rib: G.compile('rib', S.ribVS, S.ribFS),
      glyph: G.compile('glyph', S.glyphVS, S.glyphFS),
      sea: G.compile('sea', S.vsFS, S.sea),
      fogfly: G.compile('fogfly', S.vsFS, S.fogfly),
      trans: G.compile('trans', S.vsFS, S.trans),
      pre: G.compile('pre', S.vsFS, S.prefilter),
      down: G.compile('down', S.vsFS, S.down),
      up: G.compile('up', S.vsFS, S.up),
      kuwa: G.compile('kuwa', S.vsFS, S.kuwa),
      overlay: G.compile('overlay', S.vsFS, S.overlay),
      final: G.compile('final', S.vsFS, S.final),
      maskcomp: G.compile('maskcomp', S.vsFS, S.maskcomp),
      foglayer: G.compile('foglayer', S.vsFS, S.foglayer),
      beamov: G.compile('beamov', S.vsFS, S.beamov),
      strings: G.compile('strings', S.vsFS, S.strings),
    };
    // quad VAO (sprites, particles)
    R.vaoQuad = gl.createVertexArray(); gl.bindVertexArray(R.vaoQuad);
    gl.bindBuffer(gl.ARRAY_BUFFER, G.quadBuf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    // ribbon VAO
    R.ribBuf = gl.createBuffer(); R.vaoRib = gl.createVertexArray(); gl.bindVertexArray(R.vaoRib);
    gl.bindBuffer(gl.ARRAY_BUFFER, R.ribBuf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
    gl.bindVertexArray(null);
    // glyph VAO (instanced)
    R.glyphBuf = gl.createBuffer(); R.vaoGlyph = gl.createVertexArray(); gl.bindVertexArray(R.vaoGlyph);
    gl.bindBuffer(gl.ARRAY_BUFFER, G.quadBuf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, R.glyphBuf);
    for (let i = 0; i < 4; i++) { gl.enableVertexAttribArray(1 + i); gl.vertexAttribPointer(1 + i, 4, gl.FLOAT, false, 64, i * 16); gl.vertexAttribDivisor(1 + i, 1); }
    gl.bindVertexArray(null);
    const wc = Object.assign(document.createElement('canvas'), { width: 4, height: 4 }); const wx = wc.getContext('2d'); wx.fillStyle = '#fff'; wx.fillRect(0, 0, 4, 4);
    R.white = G.tex(wc, { mip: false });
    R.blankMask = R.white;
    const cc = Object.assign(document.createElement('canvas'), { width: 4, height: 4 });
    R.clear = G.tex(cc, { mip: false });
    R.resize(1280, 720);
  };
  R.resize = function (w, h) {
    if (R.W === w && R.H === h) return;
    R.W = w; R.H = h; R.asp = w / h;
    R.rtA = G.rt(w, h); R.rtB = G.rt(w, h); R.rtC = G.rt(w, h); R.rtD = G.rt(w, h);
    R.bloom = []; let bw = w >> 1, bh = h >> 1;
    for (let i = 0; i < 6; i++) { R.bloom.push(G.rt(Math.max(2, bw), Math.max(2, bh))); bw >>= 1; bh >>= 1; }
    R.kuwaRT = G.rt(w >> 1, h >> 1);
    MV.MG.resize(w, h);
  };
  R.target = null;
  R.begin = function (rt, bg = [0, 0, 0]) { R.target = rt; G.bind(rt); G.blend(null); G.clear(bg[0], bg[1], bg[2], 1); };

  // ---------- plate (2.5D painting with fog and light) ----------
  R.project = function (cam, u, v, z, imgAsp) {
    const qx = (u - 0.5) * imgAsp, qy = v - 0.5;
    const s = cam._zoom * (1 + cam.dolly * (z - cam.focus));
    const wx = (qx - cam.x - cam.par[0] * (z - cam.focus)) * s, wy = (qy - cam.y - cam.par[1] * (z - cam.focus)) * s;
    const c = Math.cos(cam.roll), sn = Math.sin(cam.roll);
    return [c * wx - sn * wy, sn * wx + c * wy];
  };
  R.plate = function (name, cam, o = {}) {
    const img = A.get(name), dep = A.get(name + '_d'); if (!img) return;
    const fx = A.img[name + '_fx'] ? A.get(name + '_fx') : null;
    cam = Object.assign({ x: 0, y: 0, zoom: 1, roll: 0, par: [0, 0], focus: 0.5, dolly: 0 }, cam);
    const cover = Math.max(1, R.asp / img.asp);
    cam._zoom = cam.zoom * cover;
    // keep the view inside the image (with a small margin) unless asked not to
    if (!o.free) {
      const hw = R.asp / 2 / cam._zoom, hh = 0.5 / cam._zoom; const iw = img.asp / 2;
      cam.x = clamp(cam.x, -iw + hw, iw - hw); cam.y = clamp(cam.y, -0.5 + hh, 0.5 - hh);
    }
    const mag = Math.hypot(cam.par[0], cam.par[1]) * cam._zoom + Math.abs(cam.dolly) * 0.35;
    const steps = cam.steps || Math.round(clamp(mag * 260, 10, 48));
    const fog = Object.assign({ col: [0.6, 0.66, 0.7], amt: 0, near: 0.1, far: 1, scale: 1, vel: [0.02, 0] }, o.fog || {});
    const lights = o.lights || []; const LPos = [], LDep = [], LCol = [], LRad = [];
    for (let i = 0; i < 6; i++) {
      const L = lights[i];
      if (L) { const p = R.project(cam, L.u, L.v, L.z ?? 0.3, img.asp); LPos.push(p[0], p[1]); LDep.push(L.z ?? 0.3); const k = L.i ?? 1; LCol.push(L.c[0] * k, L.c[1] * k, L.c[2] * k); LRad.push(L.r ?? 0.12); }
      else { LPos.push(0, 0); LDep.push(0); LCol.push(0, 0, 0); LRad.push(0.1); }
    }
    const beam = o.beam || null; let bp = [0, 0];
    if (beam) bp = R.project(cam, beam.u, beam.v, beam.z ?? 0.2, img.asp);
    const rip = o.ripples || []; const RIP = []; for (let i = 0; i < 8; i++) { const r = rip[i]; if (r) RIP.push(r[0], r[1], r[2], r[3] ?? 1); else RIP.push(0, 0, -99, 0); }
    const g = Object.assign({ exposure: 1, sat: 1, contrast: 1, tint: [1, 1, 1], lift: [0, 0, 0] }, o.grade || {});
    const alpha = o.alpha ?? 1;
    G.blend(alpha < 1 ? 'premul' : null);
    G.use(R.P.plate, {
      uImg: img, uDep: dep, uFx: fx || R.white, uHasFx: fx ? 1 : 0, uSteps: steps,
      uSketch: o.sketch ? o.sketch.tex : R.white, uGlassMask: o.glassMask ? o.glassMask : R.clear,
      uAsp: R.asp, uImgAsp: img.asp, uZoom: cam._zoom, uRoll: cam.roll, uFocus: cam.focus, uDolly: cam.dolly, uCam: [cam.x, cam.y], uPar: cam.par,
      uTime: o.time ?? MV.now,
      uExposure: g.exposure, uSat: g.sat, uContrast: g.contrast, uTint: g.tint, uLift: g.lift, uAlpha: alpha,
      uFogCol: fog.col, uFogAmt: fog.amt, uFogNear: fog.near, uFogFar: fog.far, uFogScale: fog.scale, uFogVel: fog.vel,
      uLN: lights.length, uLPos: LPos, uLDep: LDep, uLCol: LCol, uLRad: LRad,
      uBeamInt: beam ? beam.i : 0, uBeamAng: beam ? beam.ang : 0, uBeamW: beam ? beam.w ?? 0.09 : 0.1, uBeamDep: beam ? beam.z ?? 0.2 : 0, uBeamPos: bp, uBeamCol: beam ? beam.c : [1, 1, 1],
      uWater: o.water ?? (o.waterAll ? 1 : 0), uWaterAll: o.waterAll ?? 0, uSway: o.sway ?? 0, uSkyMove: o.sky ?? 0, uEmis: o.emis ?? 0,
      uRipN: rip.length, uRip: RIP,
      uDof: o.dof ?? 0, uDofF: o.dofF ?? 0.5,
      uGlass: o.glass ?? 0, uGlassClear: o.glassClear ?? 0, uGlassRect: o.glassRect || [0, 0, 1, 1],
      uSketchOn: o.sketch ? (o.hatch ?? 1) : 0, uReveal: o.reveal ?? 0, uRevO: o.revO || [0.5, 0.5],
      uErode: o.erode ?? 0,
      uDuo: o.duo ?? 0, uDuoA: o.duoA || [0.02, 0.03, 0.04], uDuoB: o.duoB || [0.9, 0.88, 0.82], uHalftone: o.halftone ?? 0, uHTScale: o.htScale ?? 90,
      uVig: o.vig ?? 0, uSweep: o.sweep || [0, 0, 0.1, 0], uSweepCol: o.sweepCol || [1.0, 0.86, 0.66],
    });
    G.fs();
    G.blend(null);
  };
  // ---------- procedural scenes ----------
  R.sea = function (o) {
    const r = o.rings || []; const RING = []; for (let i = 0; i < 4; i++) { const x = r[i]; if (x) RING.push(x[0], x[1], x[2], x[3] ?? 1); else RING.push(0, 0, -99, 0); }
    G.use(R.P.sea, {
      uAsp: R.asp, uTime: o.time ?? MV.now, uFov: o.fov ?? 0.9, uWave: o.wave ?? 1, uFogDen: o.fogDen ?? 0.01, uMoon: o.moon ? 1 : 0, uExposure: o.exposure ?? 1,
      uCamPos: o.pos || [0, 3, 0], uCamAng: o.ang || [0, -0.08], uSunDir: norm3(o.sun || [0.2, 0.15, 1]), uSunCol: o.sunCol || [1.2, 1.0, 0.8],
      uSkyTop: o.skyTop || [0.1, 0.2, 0.4], uSkyHor: o.skyHor || [0.6, 0.65, 0.7], uFogCol: o.fogCol || [0.55, 0.6, 0.65], uWaterCol: o.water || [0.02, 0.06, 0.09],
      uRing: RING, uBeam: [0, 0, 0], uRain: o.rain ?? 0,
    });
    G.fs();
  };
  function norm3(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  R.fogfly = function (o) {
    G.use(R.P.fogfly, { uAsp: R.asp, uTime: o.time ?? MV.now, uSpeed: o.speed ?? 1, uDensity: o.density ?? 0.35, uSeed: o.seed ?? 1, uExposure: o.exposure ?? 1, uTilt: o.tilt ?? 0,
      uFogA: o.a || [0.5, 0.56, 0.6], uFogB: o.b || [0.05, 0.07, 0.09], uLampCol: o.lampCol || [1.0, 0.6, 0.25], uLamps: o.lamps ?? 0, uWarp: o.warp ?? 0 });
    G.fs();
  };
  // ---------- shaded strings ----------
  // list: [{y0,y1,r,wound,amp,freq,phase,a,cut:[pos,k]}]
  R.strings = function (list, o = {}) {
    const S4 = [], V4 = [], C4 = [];
    for (let i = 0; i < 6; i++) { const s = list[i]; if (s) { S4.push(s.y0, s.y1, s.r, s.wound ? 1 : 0); V4.push(s.amp ?? 0, s.freq ?? 70, s.phase ?? i * 1.3, s.a ?? 1); C4.push(s.cut ? s.cut[0] : 0, s.cut ? s.cut[1] : 0, 0, 0); } else { S4.push(0, 0, 0.001, 0); V4.push(0, 1, 0, 0); C4.push(0, 0, 0, 0); } }
    G.blend('premul');
    G.use(R.P.strings, { uAsp: R.asp, uTime: o.time ?? MV.now, uExposure: o.exposure ?? 1, uFocus: o.focus ?? 0, uDof: o.dof ?? 1, uN: list.length, uS: S4, uV: V4, uCut: C4, uKey: o.key || [0.25, -0.75, 0.6], uTint: o.tint || [1.0, 0.92, 0.82] });
    G.fs(); G.blend(null);
  };
  // ---------- sprite ----------
  R.sprite = function (tex, o = {}) {
    const gl = R.gl;
    const t = tex ? (tex === 'white' ? R.white : typeof tex === 'string' ? A.get(tex) : tex) : R.white; if (!t) return;
    const uvr = o.uv || [0, 0, 1, 1];
    const w = o.w ?? (o.h ? o.h * t.asp * ((uvr[2] - uvr[0]) / (uvr[3] - uvr[1])) : 0.5);
    const h = o.h ?? w / (t.asp * ((uvr[2] - uvr[0]) / (uvr[3] - uvr[1])));
    G.blend(o.add ? 'add' : 'premul');
    G.use(R.P.sprite, {
      uTex: t, uC: [o.x ?? 0, o.y ?? 0], uSize: [w, h], uRot: o.rot ?? 0, uAsp: R.asp, uUVR: uvr,
      uAlpha: o.alpha ?? 1, uTime: MV.now, uSeed: o.seed ?? 1, uTint: o.tint || [1, 1, 1], uAdd: o.addCol || [0, 0, 0],
      uDuo: o.duo ?? 0, uDuoA: o.duoA || [0, 0, 0], uDuoB: o.duoB || [1, 1, 1], uSil: o.sil ?? 0, uSilCol: o.silCol || [0, 0, 0],
      uRim: o.rim ?? 0, uRimCol: o.rimCol || [1, 1, 1], uDissolve: o.dissolve ?? 0, uSoft: o.soft ?? 0, uLod: o.lod ?? 0, uPaperEdge: o.paperEdge ?? 0, uLinear: o.linear ? 1 : 0, uPremul: o.premul ? 1 : 0,
      uShape: o.shape === 'glow' ? 1 : 0, uCircle: o.circle ?? 0, uBurn: o.burn ?? 0, uBurnPt: o.burnPt || [0, 0], uDGrad: o.dGrad || [0, 0], uFogMask: o.fogMask ?? 0, uSprAsp: w / h,
    });
    gl.bindVertexArray(R.vaoQuad); gl.drawArrays(gl.TRIANGLES, 0, 6); gl.bindVertexArray(null);
    G.blend(null);
  };
  // ---------- particles ----------
  const PT = { dust: 0, petals: 1, rain: 2, snow: 3, lanterns: 4, sparks: 5, bokeh: 6, gulls: 7, embers: 8 };
  R.particles = function (type, o = {}) {
    const gl = R.gl; const n = Math.round(o.count ?? 100); if (n <= 0 || (o.alpha ?? 1) <= 0) return;
    const ty = PT[type];
    G.blend(ty === 4 || ty === 5 || ty === 8 || ty === 0 ? 'add' : 'premul');
    const hw = R.asp / 2;
    G.use(R.P.part, {
      uType: ty, uTime: o.time ?? MV.now, uT0: o.t0 ?? 0, uSeed: o.seed ?? 1, uAsp: R.asp, uSize: o.size ?? 0.01, uSizeVar: o.sizeVar ?? 0.4, uSpeed: o.speed ?? 1,
      uWind: o.wind ?? 0, uZMin: o.zmin ?? 0, uZMax: o.zmax ?? 1, uLife: o.life ?? 5, uSpread: o.spread ?? 1, uStack: o.stack ?? 0,
      uBox: o.box || [-hw - 0.1, -0.6, hw + 0.1, 0.6], uVel: o.vel || [0, 0.05], uOrigin: o.origin || [0, 0], uCamOff: o.camOff || [0, 0], uTarget: o.target || [0, 0], uCount: n,
      uCol: o.col || [1, 1, 1], uAlpha: o.alpha ?? 1, uDofF: o.dofF ?? 0.5, uDof: o.dof ?? 0, uAtlas: o.atlas ? A.get(o.atlas) : R.white,
    });
    gl.bindVertexArray(R.vaoQuad); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n); gl.bindVertexArray(null);
    G.blend(null);
  };
  // ---------- ribbons ----------
  // list of {pts:[[x,y]...], col:[r,g,b], a, w}
  R.ribbons = function (list, o = {}) {
    const gl = R.gl; const verts = [];
    for (const r of list) {
      const P = r.pts; const n = P.length; if (n < 2 || r.a <= 0.002) continue;
      const w = r.w ?? 0.01;
      for (let i = 0; i < n - 1; i++) {
        const seg = [i, i + 1]; const quad = [];
        for (const k of seg) {
          const a = P[Math.max(0, k - 1)], b = P[Math.min(n - 1, k + 1)];
          let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
          const nx = -ty, ny = tx; const ww = w * (r.wf ? r.wf(k / (n - 1)) : 1); const aa = r.a * (r.af ? r.af(k / (n - 1)) : 1);
          const c = P[k];
          quad.push([c[0] + nx * ww, c[1] + ny * ww, aa, 1, k / (n - 1)], [c[0] - nx * ww, c[1] - ny * ww, aa, -1, k / (n - 1)]);
        }
        const [p0, q0, p1, q1] = quad;
        for (const v of [p0, q0, p1, p1, q0, q1]) verts.push(v[0], v[1], r.col[0], r.col[1], r.col[2], v[2], v[3], v[4]);
      }
    }
    if (!verts.length) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, R.ribBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
    G.blend('add');
    G.use(R.P.rib, { uAsp: R.asp, uCore: o.core ?? 9, uGlow: o.glow ?? 1.2 });
    gl.bindVertexArray(R.vaoRib); gl.drawArrays(gl.TRIANGLES, 0, verts.length / 8); gl.bindVertexArray(null);
    G.blend(null);
  };
  // ---------- glyphs ----------
  R.glyphs = function (atlas, inst, o = {}) {
    if (!inst.length) return; const gl = R.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, R.glyphBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(inst), gl.DYNAMIC_DRAW);
    G.blend('premul');
    G.use(R.P.glyph, { uAsp: R.asp, uAtlas: atlas, uGlow: o.glow ?? 0, uInkBleed: o.bleed ?? 0.4, uTime: MV.now, uSoftOnly: o.softOnly ? 1 : 0 });
    gl.bindVertexArray(R.vaoGlyph); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, inst.length / 16); gl.bindVertexArray(null);
    G.blend(null);
  };

  // ======================================================================= text (lyrics)
  const T = (MV.T = {});
  T.fonts = { mincho: '"KM Mincho"', minchoB: '"KM MinchoB"', brush: '"KM Brush"', hand: '"KM Hand"', mono: '"KM Mono", ui-monospace, monospace' };
  T.atlases = {};
  // build an atlas for a font containing all lyric characters; R = sharp coverage, G = blurred coverage
  T.atlas = function (font, cell = 128) {
    const key = font + cell; if (T.atlases[key]) return T.atlases[key];
    const chars = Array.from(new Set(MV.lines.map((l) => l.text).join('') + 'さよならは終わりじゃない霧笛歌が終わってもこだまは残る。'));
    const cols = Math.ceil(Math.sqrt(chars.length)); const size = cols * cell;
    const sharp = document.createElement('canvas'); sharp.width = sharp.height = size; const cs = sharp.getContext('2d');
    const soft = document.createElement('canvas'); soft.width = soft.height = size; const cb = soft.getContext('2d');
    for (const ctx of [cs, cb]) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, size, size); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `${Math.round(cell * 0.78)}px ${T.fonts[font]}`; }
    cb.filter = `blur(${Math.round(cell * 0.07)}px)`;
    const map = {};
    chars.forEach((c, i) => {
      const x = (i % cols) * cell, y = Math.floor(i / cols) * cell;
      cs.fillText(c, x + cell / 2, y + cell / 2 + cell * 0.02); cb.fillText(c, x + cell / 2, y + cell / 2 + cell * 0.02);
      map[c] = [x / size, y / size, (x + cell) / size, (y + cell) / size];
    });
    const a = cs.getImageData(0, 0, size, size).data, b = cb.getImageData(0, 0, size, size).data;
    const out = new ImageData(size, size); const d = out.data;
    for (let i = 0; i < d.length; i += 4) { d[i] = a[i]; d[i + 1] = Math.min(255, b[i] * 1.6); d[i + 2] = 0; d[i + 3] = 255; }
    const c = document.createElement('canvas'); c.width = c.height = size; c.getContext('2d').putImageData(out, 0, 0);
    const tex = G.tex(c, { mip: true });
    return (T.atlases[key] = { tex, map, cell });
  };
  // compute per-character instances for a phrase with a given style
  // style: {mode:'v'|'h', x, y, size, font, col:[r,g,b] (linear, HDR ok), alpha, spacing, lead, inDur, out (time), outDur, align, jitter, rise, wobble, glow}
  T.phraseInst = function (ph, st, t, inst) {
    const at = T.atlas(st.font || 'mincho', st.cell || 128);
    const chars = typeof ph === 'string' ? Array.from(ph).map((c, i) => ({ c, t: (st.t0 ?? 0) + i * (st.step ?? 0.08) })) : ph.chars;
    const n = chars.length; const sz = st.size ?? 0.06; const sp = (st.spacing ?? 1.05) * sz;
    const total = sp * (n - 1);
    let x0 = st.x ?? 0, y0 = st.y ?? 0;
    const align = st.align ?? 'start';
    const off = align === 'center' ? -total / 2 : align === 'end' ? -total : 0;
    const col = st.col || [1, 1, 1]; const alpha = st.alpha ?? 1;
    const outT = st.out ?? (typeof ph === 'string' ? 1e9 : ph.t1 + (st.hold ?? 0.25)); const outDur = st.outDur ?? 0.7;
    for (let i = 0; i < n; i++) {
      const ch = chars[i]; const ta = ch.t - (st.lead ?? 0.12);
      let rev = clamp((t - ta) / (st.inDur ?? 0.45)); if (rev <= 0) continue;
      rev = E.out3(rev);
      let dis = clamp((t - outT - (st.outStagger ?? 0.04) * i) / outDur);
      if (dis >= 1) continue;
      const g = at.map[ch.c]; if (!g) continue;
      let px = x0, py = y0;
      if ((st.mode || 'v') === 'v') py += off + i * sp; else px += off + i * sp;
      // small typographic adjustments for vertical small kana
      if ((st.mode || 'v') === 'v' && 'ゃゅょっャュョッぁぃぅぇぉ'.includes(ch.c)) { px += sz * 0.12; py -= sz * 0.12; }
      const rise = (st.rise ?? 0.012) * (1 - rev) + dis * (st.drift ?? 0.03);
      py -= rise; px += dis * (st.driftX ?? 0);
      if (st.wobble) { const w = st.wobble(t, i); px += w[0]; py += w[1]; }
      const s = sz * (1 + (1 - rev) * (st.pop ?? 0.06));
      const rot = (st.rot ?? 0) + (st.jitter ? (MV.hash(i * 7.1 + 3) - 0.5) * st.jitter : 0);
      const af = st.alphaFn ? st.alphaFn(i, px, py, t) : 1; if (af <= 0.001) continue;
      inst.push(px, py, s, s, g[0], g[1], g[2], g[3], rev, dis, rot, MV.hash(i + n * 3.7), col[0], col[1], col[2], alpha * af);
    }
    return at;
  };
  T.draw = function (ph, st, t) {
    const inst = []; const at = T.phraseInst(ph, st, t, inst);
    const lum = (st.col || [1, 1, 1]).reduce((a, b) => a + b, 0) / 3;
    if (st.halo !== false) { const sh = []; const hc = st.haloCol || (lum > 0.5 ? [0.0, 0.01, 0.02] : [1.0, 0.97, 0.92]); T.phraseInst(ph, Object.assign({}, st, { col: hc, alpha: (st.alpha ?? 1) * (st.haloA ?? (lum > 0.5 ? 0.55 : 0.7)) }), t, sh); R.glyphs(at.tex, sh, { softOnly: true }); }
    if (st.shadow) { const sh = []; T.phraseInst(ph, Object.assign({}, st, { col: st.shadow, x: (st.x ?? 0) + 0.003, y: (st.y ?? 0) + 0.004 }), t, sh); R.glyphs(at.tex, sh, { glow: 0, bleed: 0.2 }); }
    R.glyphs(at.tex, inst, { glow: st.glow ?? 0, bleed: st.bleed ?? 0.45 });
  };
  // big single glyph textures (for large kinetic kanji)
  T.bigCache = {};
  T.big = function (c, font = 'minchoB', px = 512) {
    const key = c + font + px; if (T.bigCache[key]) return T.bigCache[key];
    const cv = document.createElement('canvas'); cv.width = cv.height = px; const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `${Math.round(px * 0.86)}px ${T.fonts[font]}`; ctx.fillText(c, px / 2, px / 2 + px * 0.03);
    return (T.bigCache[key] = G.tex(cv, { mip: true, premul: true }));
  };

  // ======================================================================= brush calligraphy (KanjiVG strokes)
  const B = (MV.Brush = {});
  B.tip = null;
  function makeTip() {
    const s = 128; const c = document.createElement('canvas'); c.width = c.height = s; const x = c.getContext('2d');
    const img = x.createImageData(s, s); const d = img.data;
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      const u = (i / s - 0.5) * 2, v = (j / s - 0.5) * 2; const r = Math.hypot(u * 1.0, v * 1.0);
      // bristle streaks along x (stroke direction)
      const streak = 0.65 + 0.35 * Math.sin(v * 40 + Math.sin(v * 13) * 2) * Math.sin(v * 17.3 + 1.7);
      let a = clamp((1 - r) * 4.5) * streak; a *= 0.85 + 0.15 * MV.hash(i * 0.37 + j * 17.1);
      d[(j * s + i) * 4] = d[(j * s + i) * 4 + 1] = d[(j * s + i) * 4 + 2] = 255; d[(j * s + i) * 4 + 3] = a * 255;
    }
    x.putImageData(img, 0, 0); return c;
  }
  // create a brush text object. chars laid out vertically (mode 'v') or horizontally.
  // times: array of start times per char; strokes progress over each char's duration
  B.create = function (text, times, o = {}) {
    if (!B.tip) B.tip = makeTip();
    const chars = Array.from(text); const n = chars.length; const cell = o.cell || 256; const vert = (o.mode || 'v') === 'v';
    const W = vert ? cell : cell * n, H = vert ? cell * n : cell;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d');
    const strokes = [];
    chars.forEach((c, ci) => {
      const S = MV.KVG[c]; if (!S) return;
      const t0 = times[ci]; const t1 = (times[ci + 1] ?? t0 + (o.charDur || 0.6)); const dur = clamp((t1 - t0) * 0.92, 0.18, o.maxCharDur || 0.9);
      const lens = S.map((pts) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0));
      const tot = lens.reduce((a, b) => a + b, 0) + S.length * 0.08;
      let acc = 0; const ox = vert ? 0 : ci * cell, oy = vert ? ci * cell : 0;
      S.forEach((pts, si) => {
        const a = t0 + dur * (acc / tot); acc += lens[si] + 0.08; const b = t0 + dur * ((acc - 0.08) / tot);
        strokes.push({ pts: pts.map((p) => [ox + (0.08 + p[0] * 0.84) * cell, oy + (0.08 + p[1] * 0.84) * cell]), a, b, len: lens[si], drawn: 0, wk: clamp(Math.sqrt(5 / S.length), 0.55, 1.15) });
      });
    });
    return { cv, ctx, strokes, W, H, cell, tex: null, lastT: -1, weight: o.weight || 1, dirty: true };
  };
  function stampStroke(b, s, from, to) {
    const ctx = b.ctx; const P = s.pts; const n = P.length; const base = b.cell * 0.058 * b.weight;
    for (let k = from; k < to; k++) {
      const f = k / (n - 1);
      const press = (0.55 + 0.6 * E.out2(clamp(f / 0.12))) * (1 - 0.72 * E.in2(clamp((f - 0.62) / 0.38)));
      const blob = 1 + 0.5 * Math.exp(-f * 25);
      const w = base * press * blob * (s.len < 0.12 ? 1.25 : 1) * s.wk;
      const p = P[k], q = P[Math.min(n - 1, k + 1)], r0 = P[Math.max(0, k - 1)];
      const ang = Math.atan2(q[1] - r0[1], q[0] - r0[0]);
      const steps = 3;
      const nx = P[Math.min(n - 1, k + 1)];
      for (let j = 0; j < steps; j++) {
        const u = j / steps; const x = lerp(p[0], nx[0], u), y = lerp(p[1], nx[1], u);
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.globalAlpha = clamp(0.35 + 0.65 * (1 - f * 0.55));
        ctx.drawImage(B.tip, -w * 0.9, -w * 0.62, w * 1.8, w * 1.24); ctx.restore();
      }
    }
  }
  B.update = function (b, t) {
    if (t < b.lastT) { b.ctx.clearRect(0, 0, b.W, b.H); b.strokes.forEach((s) => (s.drawn = 0)); b.dirty = true; }
    b.lastT = t;
    for (const s of b.strokes) {
      const n = s.pts.length; const k = Math.floor(clamp((t - s.a) / Math.max(0.01, s.b - s.a)) * (n - 1)) + (t >= s.b ? 1 : 0);
      const target = Math.min(n, t >= s.a ? Math.max(1, k) : 0);
      if (target > s.drawn) { stampStroke(b, s, s.drawn, target); s.drawn = target; b.dirty = true; }
    }
    if (b.dirty) { if (!b.tex) b.tex = G.tex(b.cv, { mip: true, premul: true }); else { G.updateTex(b.tex, b.cv); R.gl.generateMipmap(R.gl.TEXTURE_2D); } b.dirty = false; }
  };
  // draw brush text as a sprite; o: x,y (center), h (height in screen units for vertical), col, glow
  B.draw = function (b, t, o) {
    B.update(b, t); if (!b.tex) return;
    const h = o.h ?? 0.8; const w = h * b.W / b.H;
    if (o.halo) R.sprite(b.tex, { x: o.x, y: o.y, w: w * 1.03, h: h * 1.03, tint: o.halo, alpha: (o.haloA ?? 0.55) * (o.alpha ?? 1), lod: 4.2, linear: true, premul: true });
    if (o.glow) R.sprite(b.tex, { x: o.x, y: o.y, w: w * 1.02, h: h * 1.02, tint: o.glowCol || o.col, alpha: o.glow * (o.alpha ?? 1), lod: 3.5, linear: true, add: true, premul: true });
    R.sprite(b.tex, { x: o.x, y: o.y, w, h, tint: o.col || [1, 1, 1], alpha: o.alpha ?? 1, linear: true, dissolve: o.dissolve ?? 0, seed: 3, premul: true });
  };

  // ======================================================================= MG overlay (Canvas2D)
  const M = (MV.MG = {});
  M.cv = document.createElement('canvas'); M.ctx = M.cv.getContext('2d'); M.dirty = false; M.alpha = 1;
  M.resize = function (w, h) { M.cv.width = w; M.cv.height = h; M.W = w; M.H = h; M.tex = null; };
  M.begin = function () { M.ctx.setTransform(1, 0, 0, 1, 0, 0); M.ctx.clearRect(0, 0, M.W, M.H); M.dirty = false; };
  // p-space → pixels
  M.X = (x) => (x / (M.W / M.H) + 0.5) * M.W; M.Y = (y) => (y + 0.5) * M.H; M.S = (s) => s * M.H;
  M.text = function (str, x, y, o = {}) {
    const c = M.ctx; M.dirty = true; c.save(); c.globalAlpha = (o.alpha ?? 1) * M.alpha;
    c.font = `${o.weight || ''} ${Math.round(M.S(o.size ?? 0.018))}px ${T.fonts[o.font || 'mono']}`.trim();
    c.fillStyle = o.color || 'rgba(235,236,232,0.9)'; c.textAlign = o.align || 'left'; c.textBaseline = o.base || 'middle';
    if (c.letterSpacing !== undefined) c.letterSpacing = `${(o.track ?? 0.08) * M.S(o.size ?? 0.018)}px`;
    if (o.vertical) { let yy = M.Y(y); for (const ch of Array.from(str)) { c.fillText(ch, M.X(x), yy); yy += M.S(o.size ?? 0.018) * (o.lh ?? 1.1); } }
    else c.fillText(str, M.X(x), M.Y(y));
    c.restore();
  };
  M.line = function (x1, y1, x2, y2, o = {}) { const c = M.ctx; M.dirty = true; c.save(); c.globalAlpha = (o.alpha ?? 1) * M.alpha; c.strokeStyle = o.color || 'rgba(235,236,232,0.85)'; c.lineWidth = Math.max(1, M.S(o.w ?? 0.0012)); if (o.dash) c.setLineDash(o.dash.map(M.S)); c.beginPath(); c.moveTo(M.X(x1), M.Y(y1)); c.lineTo(M.X(x2), M.Y(y2)); c.stroke(); c.restore(); };
  M.rect = function (x, y, w, h, o = {}) { const c = M.ctx; M.dirty = true; c.save(); c.globalAlpha = (o.alpha ?? 1) * M.alpha; if (o.fill) { c.fillStyle = o.fill; c.fillRect(M.X(x), M.Y(y), M.S(w), M.S(h)); } if (o.stroke !== false) { c.strokeStyle = o.color || 'rgba(235,236,232,0.8)'; c.lineWidth = Math.max(1, M.S(o.w ?? 0.0012)); if (o.dash) c.setLineDash(o.dash.map(M.S)); c.strokeRect(M.X(x), M.Y(y), M.S(w), M.S(h)); } c.restore(); };
  M.circle = function (x, y, r, o = {}) { const c = M.ctx; M.dirty = true; c.save(); c.globalAlpha = (o.alpha ?? 1) * M.alpha; c.beginPath(); c.arc(M.X(x), M.Y(y), M.S(r), o.a0 ?? 0, o.a1 ?? Math.PI * 2); if (o.fill) { c.fillStyle = o.fill; c.fill(); } if (o.stroke !== false) { c.strokeStyle = o.color || 'rgba(235,236,232,0.8)'; c.lineWidth = Math.max(1, M.S(o.w ?? 0.0012)); if (o.dash) c.setLineDash(o.dash.map(M.S)); c.stroke(); } c.restore(); };
  M.poly = function (pts, o = {}) { if (pts.length < 2) return; const c = M.ctx; M.dirty = true; c.save(); c.globalAlpha = (o.alpha ?? 1) * M.alpha; c.strokeStyle = o.color || 'rgba(235,236,232,0.8)'; c.lineWidth = Math.max(1, M.S(o.w ?? 0.0012)); c.lineJoin = 'round'; c.lineCap = 'round'; if (o.dash) c.setLineDash(o.dash.map(M.S)); if (o.dashOff) c.lineDashOffset = M.S(o.dashOff); c.beginPath(); c.moveTo(M.X(pts[0][0]), M.Y(pts[0][1])); for (let i = 1; i < pts.length; i++) c.lineTo(M.X(pts[i][0]), M.Y(pts[i][1])); if (o.close) c.closePath(); if (o.fill) { c.fillStyle = o.fill; c.fill(); } c.stroke(); c.restore(); };
  M.upload = function () { if (!M.dirty) return null; if (!M.tex) M.tex = G.tex(M.cv, { mip: false, premul: true }); else G.updateTex(M.tex, M.cv); return M.tex; };

  // ======================================================================= pencil sketch drawer (vectorised line art)
  const K = (MV.Sketch = {});
  K.create = function (paths, W, H, o = {}) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d');
    // order: by distance from a focal point, so the drawing grows outward like an artist works
    const f = o.focus || [0.5, 0.5];
    const items = paths.map((p, i) => { let cx = 0, cy = 0; p.forEach((q) => { cx += q[0]; cy += q[1]; }); cx /= p.length; cy /= p.length; const len = p.reduce((s, q, k) => (k ? s + Math.hypot(q[0] - p[k - 1][0], q[1] - p[k - 1][1]) : 0), 0); return { p, d: Math.hypot((cx - f[0]) * 1.7, cy - f[1]) + MV.hash(i) * 0.08, len }; });
    items.sort((a, b) => a.d - b.d);
    const total = items.reduce((s, it) => s + it.len, 0); let acc = 0; items.forEach((it) => { it.s0 = acc / total; acc += it.len; it.s1 = acc / total; });
    return { cv, ctx, items, W, H, done: 0, tex: null, lastP: -1 };
  };
  K.update = function (k, prog) {
    const ctx = k.ctx;
    if (prog < k.lastP) { ctx.clearRect(0, 0, k.W, k.H); k.done = 0; }
    k.lastP = prog; let changed = false;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    while (k.done < k.items.length && k.items[k.done].s0 <= prog) {
      const it = k.items[k.done]; const p = it.p;
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.85)'; ctx.lineWidth = pass ? 2.2 : 1.1;
        ctx.beginPath(); const jx = (MV.hash(k.done * 3.3 + pass) - 0.5) * 1.6, jy = (MV.hash(k.done * 5.1 + pass) - 0.5) * 1.6;
        ctx.moveTo(p[0][0] * k.W + jx, p[0][1] * k.H + jy); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0] * k.W + jx, p[i][1] * k.H + jy); ctx.stroke();
      }
      k.done++; changed = true;
    }
    if (changed || !k.tex) { if (!k.tex) k.tex = G.tex(k.cv, { mip: true, premul: true }); else { G.updateTex(k.tex, k.cv); R.gl.generateMipmap(R.gl.TEXTURE_2D); } }
  };

  // ======================================================================= post-processing
  R.post = function (src, P, t) {
    const gl = R.gl;
    // bloom
    G.bind(R.bloom[0]); G.use(R.P.pre, { uSrc: src, uTexel: [1 / R.W, 1 / R.H], uThresh: P.bloomThresh ?? 0.85, uKnee: 0.4 }); G.fs();
    for (let i = 1; i < R.bloom.length; i++) { G.bind(R.bloom[i]); G.use(R.P.down, { uSrc: R.bloom[i - 1], uTexel: [1 / R.bloom[i - 1].w, 1 / R.bloom[i - 1].h] }); G.fs(); }
    G.blend('add');
    for (let i = R.bloom.length - 1; i > 0; i--) { G.bind(R.bloom[i - 1]); G.use(R.P.up, { uSrc: R.bloom[i], uTexel: [1 / R.bloom[i].w, 1 / R.bloom[i].h], uR: 1 }); G.fs(); }
    G.blend(null);
    // painterly
    if ((P.paint ?? 0) > 0.01) { G.bind(R.kuwaRT); G.use(R.P.kuwa, { uSrc: src, uTexel: [1 / R.W, 1 / R.H], uRad: P.paintRad ?? 5 }); G.fs(); }
    G.bind(null);
    G.use(R.P.final, {
      uScene: src, uBloom: R.bloom[0], uKuwa: R.kuwaRT, uAsp: R.asp, uTime: t,
      uBloomAmt: P.bloom ?? 0.5, uPaint: P.paint ?? 0, uPaper: P.paper ?? 0, uGrain: P.grain ?? 0.04, uVig: P.vig ?? 0.35, uCA: P.ca ?? 0.25, uFade: P.fade ?? 0, uLetter: P.letter ?? 0,
      uExposure: P.exposure ?? 1, uSat: P.sat ?? 1, uHalation: P.halation ?? 0.08, uFlash: P.flash ?? 0, uShake: P.shake || [0, 0],
      uLift: P.lift || [0, 0, 0], uGamma: P.gamma || [1, 1, 1], uGain: P.gain || [1, 1, 1], uFadeCol: P.fadeCol || [0, 0, 0], uFlashCol: P.flashCol || [1, 1, 1],
      uRpN: (P.ripples || []).length, uRp: rippleArr(P.ripples || [], t),
    });
    G.fs();
  };
  function rippleArr(list, t) { const out = []; for (let i = 0; i < 6; i++) { const r = list[i]; if (r) out.push(r[0], r[1], t - r[2], r[3] ?? 1); else out.push(0, 0, -1, 0); } return out; }
  R.transition = function (a, b, dst, type, p, o = {}) {
    G.bind(dst); G.use(R.P.trans, { uA: a, uB: b, uP: p, uAsp: R.asp, uSeed: o.seed ?? 1.7, uTime: MV.now, uType: type, uDir: o.dir || [1, 0], uPt: o.pt || [0, 0], uCol: o.col || [1, 1, 1] }); G.fs();
  };
  R.maskComp = function (src, o) {
    G.blend('premul');
    G.use(R.P.maskcomp, { uSrc: src, uShape: o.shape === 'rect' ? 1 : 0, uC: [o.x ?? 0, o.y ?? 0], uR: o.r ?? 0.3, uSoft: o.soft ?? 0.02, uAsp: R.asp, uAlpha: o.alpha ?? 1, uRect: o.rect || [-9, -9, 9, 9] });
    G.fs(); G.blend(null);
  };
  R.fogLayer = function (o) { G.blend('premul'); G.use(R.P.foglayer, { uAsp: R.asp, uTime: o.time ?? MV.now, uAmt: o.amt ?? 0.3, uSpeed: o.speed ?? 0.02, uSeed: o.seed ?? 1, uCol: o.col || [0.5, 0.55, 0.6] }); G.fs(); G.blend(null); };
  R.beam = function (o) { G.blend('add'); G.use(R.P.beamov, { uAsp: R.asp, uTime: MV.now, uAng: o.ang ?? 0, uW: o.w ?? 0.08, uI: o.i ?? 1, uPos: [o.x ?? 0, o.y ?? 0], uCol: o.col || [1, 1, 1] }); G.fs(); G.blend(null); };
  R.overlay = function (tex, dst, alpha = 1, gain = 1) { G.bind(dst); G.blend('premul'); G.use(R.P.overlay, { uSrc: tex, uAlpha: alpha, uGain: gain }); G.fs(); G.blend(null); };
})(window.MV);
