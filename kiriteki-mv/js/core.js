/* 霧笛 MV — core: math, easing, keyframes, audio features, WebGL helpers.
   Classic script (no modules) so the whole thing runs from file:// as well as any static host. */
'use strict';
window.MV = window.MV || {};
(function (MV) {
  // ---------- math ----------
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const fract = (x) => x - Math.floor(x);
  const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const hash = (n) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453123);
  const hash2 = (a, b) => fract(Math.sin(a * 12.9898 + b * 78.233) * 43758.5453);
  function vnoise(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u) * 2 - 1; }
  function fbm1(x, o = 4) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f + i * 17.3); f *= 2.03; a *= 0.5; } return s; }
  const hex = (h, k = 1) => { const n = parseInt(h.replace('#', ''), 16); return [((n >> 16) & 255) / 255 * k, ((n >> 8) & 255) / 255 * k, (n & 255) / 255 * k]; };
  const toLin = (c) => c.map((v) => Math.pow(v, 2.2));

  // ---------- easing ----------
  const E = {
    lin: (t) => t,
    in2: (t) => t * t, out2: (t) => 1 - (1 - t) * (1 - t), io2: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    in3: (t) => t * t * t, out3: (t) => 1 - Math.pow(1 - t, 3), io3: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    out4: (t) => 1 - Math.pow(1 - t, 4), io4: (t) => (t < 0.5 ? 8 * t ** 4 : 1 - Math.pow(-2 * t + 2, 4) / 2),
    out5: (t) => 1 - Math.pow(1 - t, 5), in5: (t) => t ** 5,
    outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)), inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
    ioExpo: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2),
    outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    sine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  };
  // keyframes: kf(t, [[time, value, easeName?], ...]) — value may be number or array; ease applies to the segment ending at that key
  function kf(t, keys) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const k1 = keys[i];
      if (t <= k1[0]) {
        const k0 = keys[i - 1];
        let u = (t - k0[0]) / Math.max(1e-6, k1[0] - k0[0]);
        u = (E[k1[2] || 'io3'] || E.io3)(clamp(u));
        if (Array.isArray(k0[1])) return k0[1].map((v, j) => lerp(v, k1[1][j], u));
        return lerp(k0[1], k1[1], u);
      }
    }
    return keys[keys.length - 1][1];
  }
  const env = (t, a, b, fi = 0.3, fo = 0.3) => clamp(Math.min((t - a) / Math.max(1e-4, fi), (b - t) / Math.max(1e-4, fo)));

  Object.assign(MV, { clamp, lerp, smooth, fract, mix3, hash, hash2, vnoise, fbm1, hex, toLin, E, kf, env });

  // ---------- audio features (precomputed in tools/export_audio.py) ----------
  const D = window.MVDATA;
  MV.dur = D.dur;
  const nCh = D.keys.length;
  const raw = Uint8Array.from(atob(D.env), (c) => c.charCodeAt(0));
  const chIndex = {}; D.keys.forEach((k, i) => (chIndex[k] = i));
  // a(ch, t): smoothed envelope 0..1
  MV.a = function (ch, t) {
    const c = chIndex[ch]; if (c === undefined) return 0;
    const x = t * D.fps; const i = Math.floor(x); const f = x - i;
    if (i < 0) return 0; if (i >= D.n - 1) return raw[(D.n - 1) * nCh + c] / 255;
    return lerp(raw[i * nCh + c], raw[(i + 1) * nCh + c], f) / 255;
  };
  // average over a window (for slower motion)
  MV.aw = function (ch, t, w = 0.25) { let s = 0; for (let k = 0; k < 5; k++) s += MV.a(ch, t - w * (k / 4)); return s / 5; };
  MV.beats = D.beats;
  MV.downbeats = D.beats.filter((_, i) => (i - D.downbeatOffset) % 4 === 0 && i >= D.downbeatOffset);
  MV.beatLen = 60 / D.bpm;
  function lastIdx(arr, t) { let lo = 0, hi = arr.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; const v = Array.isArray(arr[m]) ? arr[m][0] : arr[m]; if (v <= t) { r = m; lo = m + 1; } else hi = m - 1; } return r; }
  MV.lastIdx = lastIdx;
  // time since last beat & beat phase
  MV.beatInfo = function (t) {
    const i = lastIdx(D.beats, t);
    if (i < 0) return { i: -1, since: 1e9, phase: 0, down: false };
    const b0 = D.beats[i], b1 = D.beats[i + 1] || b0 + MV.beatLen;
    return { i, since: t - b0, phase: (t - b0) / (b1 - b0), down: (i - D.downbeatOffset) % 4 === 0, bar: Math.floor((i - D.downbeatOffset) / 4) + 1 };
  };
  // pulse that decays after each beat (downbeats stronger)
  MV.beatPulse = function (t, decay = 6) { const b = MV.beatInfo(t); if (b.i < 0) return 0; return Math.exp(-b.since * decay) * (b.down ? 1 : 0.6); };
  MV.events = D.events;
  // recent events of a channel: returns [[time, strength], ...] within window
  MV.recent = function (ch, t, win = 2.5) { const ev = D.events[ch]; if (!ev) return []; const i = lastIdx(ev, t); const out = []; for (let k = i; k >= 0 && t - ev[k][0] < win; k--) out.push(ev[k]); return out; };
  MV.sections = D.sections;
  MV.section = function (t) { for (const s of D.sections) if (t >= s[1] && t < s[2]) return s[0]; return 'out'; };
  MV.bassGone = D.bassGone; MV.bassBack = D.bassBack;

  // ---------- lyrics: split into phrases at the full-width space ----------
  MV.lines = D.lyrics.map((L, li) => {
    const phrases = []; let cur = { li, chars: [] };
    for (const [c, t] of L.c) { if (c === '　') { phrases.push(cur); cur = { li, chars: [] }; } else cur.chars.push({ c, t }); }
    phrases.push(cur);
    phrases.forEach((p, pi) => { p.id = 'L' + (li + 1) + (pi === 0 ? 'a' : 'b'); p.text = p.chars.map((x) => x.c).join(''); p.t0 = p.chars[0].t; p.t1 = pi < phrases.length - 1 ? phrases[pi + 1].chars[0].t : L.t1; });
    return { text: L.text.replace('　', ''), t0: L.t0, t1: L.t1, phrases };
  });
  MV.phrase = {}; MV.lines.forEach((L) => L.phrases.forEach((p) => (MV.phrase[p.id] = p)));

  // ---------- WebGL helpers ----------
  const G = (MV.G = {});
  G.init = function (canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 not available');
    G.gl = gl;
    G.floatRT = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
    gl.getExtension('OES_texture_float_linear');
    G.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    // fullscreen triangle
    G.vaoFS = gl.createVertexArray(); gl.bindVertexArray(G.vaoFS);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    // unit quad for instancing (two triangles, corners in 0..1)
    G.quadBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, G.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
    return gl;
  };
  G.compile = function (name, vsSrc, fsSrc) {
    const gl = G.gl;
    const mk = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s); const lines = src.split('\n');
        const m = /ERROR: \d+:(\d+)/.exec(log); const ln = m ? +m[1] : 0;
        console.error(name, log, '\n', lines.slice(Math.max(0, ln - 4), ln + 2).join('\n'));
        throw new Error('shader ' + name + ': ' + log);
      }
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vsSrc)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fsSrc));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link ' + name + ': ' + gl.getProgramInfoLog(p));
    const prog = { p, name, u: {} };
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); const nm = info.name.replace(/\[0\]$/, ''); prog.u[nm] = { loc: gl.getUniformLocation(p, info.name), type: info.type, size: info.size }; }
    return prog;
  };
  // set uniforms by object; textures as {tex, unit}
  G.use = function (prog, uni) {
    const gl = G.gl; gl.useProgram(prog.p); let unit = 0;
    for (const k in uni) {
      const u = prog.u[k]; if (!u) continue; const v = uni[k];
      switch (u.type) {
        case gl.FLOAT: if (u.size > 1) gl.uniform1fv(u.loc, v); else gl.uniform1f(u.loc, v); break;
        case gl.FLOAT_VEC2: gl.uniform2fv(u.loc, v); break;
        case gl.FLOAT_VEC3: gl.uniform3fv(u.loc, v); break;
        case gl.FLOAT_VEC4: gl.uniform4fv(u.loc, v); break;
        case gl.INT: case gl.BOOL: gl.uniform1i(u.loc, v); break;
        case gl.FLOAT_MAT2: gl.uniformMatrix2fv(u.loc, false, v); break;
        case gl.SAMPLER_2D: gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, v && v.tex ? v.tex : v); gl.uniform1i(u.loc, unit); unit++; break;
        default: break;
      }
    }
  };
  G.fs = function () { const gl = G.gl; gl.bindVertexArray(G.vaoFS); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null); };
  G.tex = function (src, opt = {}) {
    const gl = G.gl; const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !!opt.premul);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    const ifmt = opt.srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8;
    gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, gl.RGBA, gl.UNSIGNED_BYTE, src);
    const mip = opt.mip !== false;
    if (mip) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const wrap = opt.repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    if (G.aniso && mip) gl.texParameterf(gl.TEXTURE_2D, G.aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
    return { tex: t, w: src.width, h: src.height, asp: src.width / src.height };
  };
  G.updateTex = function (t, src) { const gl = G.gl; gl.bindTexture(gl.TEXTURE_2D, t.tex); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); t.w = src.width; t.h = src.height; };
  G.rt = function (w, h, opt = {}) {
    const gl = G.gl; const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    const hdr = opt.hdr !== false && G.floatRT;
    gl.texImage2D(gl.TEXTURE_2D, 0, hdr ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex: t, fb, w, h };
  };
  G.bind = function (rt) { const gl = G.gl; if (rt) { gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fb); gl.viewport(0, 0, rt.w, rt.h); } else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); } };
  G.clear = function (r = 0, g = 0, b = 0, a = 1) { const gl = G.gl; gl.clearColor(r, g, b, a); gl.clear(gl.COLOR_BUFFER_BIT); };
  G.blend = function (mode) {
    const gl = G.gl;
    if (!mode) { gl.disable(gl.BLEND); return; }
    gl.enable(gl.BLEND);
    if (mode === 'add') gl.blendFunc(gl.ONE, gl.ONE);
    else if (mode === 'premul') gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    else if (mode === 'alpha') gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    else if (mode === 'screen') gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
    else if (mode === 'mul') gl.blendFunc(gl.DST_COLOR, gl.ZERO);
  };
})(window.MV);
