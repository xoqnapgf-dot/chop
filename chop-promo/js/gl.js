/* =====================================================================
 * CHOP/ 宣传片 · WebGL 层（three.js r128，经典脚本，可本地双击运行）
 * 只画程序生成的东西（点阵地球、弧线、星尘、光速线），不加载图片纹理：
 * 本地 file:// 打开时浏览器禁止把本地图片传进 WebGL，所以图片一律走 DOM。
 * 所有状态都放在 G 里，由主时间线补间；画面只取决于时间 t。
 * ===================================================================== */
(function () {
  'use strict';
  const { W, H, S, el, rand } = window.FILM;
  const D2R = Math.PI / 180;
  const R = 200; // 地球半径（世界单位）

  const G = {
    // 地球
    globe: 0, // 整体不透明度
    reveal: 0, // 陆地点亮起的比例
    lat: 20, lon: -40, dist: 760, fov: 34, // 摄像机绕地球的位置
    shiftX: 0, shiftY: 0, // 画面偏移（像素），把地球放到画面一侧
    roll: 0,
    spin: 0, // 额外经度自转（度）
    hotCN: 0, // 中国区高亮
    atmo: 1,
    markers: 0, // 国家标记
    cities: 0, // 人物城市点
    arcsOut: 0, arcsOutA: 0, // 从堪萨斯城射向世界的弧线：进度（秒）/ 不透明度
    arcsCol: 0, arcsColA: 0, // 合作连线
    pulse: 0, // 跟随音频的闪烁强度
    // 星尘 / 光速
    stars: 0.0,
    warp: 0, // 光速线可见度
    travel: 0, // 光速线位移（时间线里线性推进）
    stretch: 0, // 拖尾长度
    warpHue: 0, // 0 金 1 红
    labels: 0, // 地球上的文字标签
  };

  const canvas = document.getElementById('gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  let q = 1;
  function resize(stageScale) {
    q = Math.min(2, Math.max(1, stageScale * (window.devicePixelRatio || 1)));
    renderer.setPixelRatio(1);
    renderer.setSize(Math.round(W * q), Math.round(H * q), false);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
  }

  /* ---------- 坐标 ---------- */
  function ll2v(lat, lon, r) {
    const phi = (90 - lat) * D2R, th = (lon + 180) * D2R;
    return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th));
  }

  /* ---------- 软圆点的着色器片段 ---------- */
  const dotFrag = `
    varying float vA; varying vec3 vC;
    void main(){
      vec2 p = gl_PointCoord - 0.5; float d = length(p);
      float a = smoothstep(0.5, 0.15, d);
      gl_FragColor = vec4(vC, vA * a);
    }`;

  /* ============ 地球场景 ============ */
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, W / H, 1, 6000);
  const world = new THREE.Group();
  scene.add(world);

  // 遮挡球：写深度，挡住背面的点；本身是很深的暖黑
  const occ = new THREE.Mesh(
    new THREE.SphereGeometry(R * 0.985, 96, 64),
    new THREE.ShaderMaterial({
      transparent: true,
      uniforms: { uO: { value: 0 } },
      vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform float uO; varying vec3 vN; varying vec3 vV; void main(){ float f = 1. - max(dot(vN, vV), 0.); vec3 c = mix(vec3(0.045,0.032,0.024), vec3(0.32,0.21,0.07), pow(f, 3.0)); gl_FragColor = vec4(c, uO); }`,
    }),
  );
  world.add(occ);

  // 大气辉光：背面渲染的大一圈球，菲涅尔
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.18, 96, 64),
    new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
      uniforms: { uO: { value: 0 }, uC: { value: new THREE.Color(0xe8b84a) } },
      vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform float uO; uniform vec3 uC; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(max(0., 0.62 - dot(vN, vV)*-1.0 ), 4.0); float i = pow(1.0 - abs(dot(vN, vV)), 6.0); gl_FragColor = vec4(uC, uO * (i*1.4)); }`,
    }),
  );
  world.add(atmo);

  // 陆地点阵
  const land = window.GLOBE || [];
  const nLand = land.length / 2;
  const lp = new Float32Array(nLand * 3), lr = new Float32Array(nLand), lcn = new Float32Array(nLand);
  // 中国区高亮不画国界：只让站点里中国区地区城市、中国人物所在城市周围的点发红光
  const hotCities = [];
  S.regions.forEach((r) => r.cities.forEach((c) => hotCities.push(c.geo)));
  S.artists.filter((a) => a.country === 'CN' && a.geo).forEach((a) => hotCities.push(a.geo));
  const hotV = hotCities.map((g) => ll2v(g[0], g[1], 1));
  const SIG = 3.2 * D2R;
  for (let i = 0; i < nLand; i++) {
    const lat = land[i * 2] / 10, lon = land[i * 2 + 1] / 10;
    const v = ll2v(lat, lon, R);
    lp[i * 3] = v.x; lp[i * 3 + 1] = v.y; lp[i * 3 + 2] = v.z;
    lr[i] = rand(i * 3.17 + 1);
    const n = v.clone().normalize();
    let heat = 0;
    for (const h of hotV) {
      const ang = n.angleTo(h);
      if (ang < SIG * 3) heat = Math.max(heat, Math.exp(-(ang * ang) / (2 * SIG * SIG)));
    }
    lcn[i] = heat;
  }
  const landGeo = new THREE.BufferGeometry();
  landGeo.setAttribute('position', new THREE.BufferAttribute(lp, 3));
  landGeo.setAttribute('aR', new THREE.BufferAttribute(lr, 1));
  landGeo.setAttribute('aCN', new THREE.BufferAttribute(lcn, 1));
  const landMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uO: { value: 0 }, uReveal: { value: 0 }, uT: { value: 0 }, uSize: { value: 3.2 }, uCN: { value: 0 }, uPulse: { value: 0 }, uQ: { value: 1 } },
    vertexShader: `
      attribute float aR; attribute float aCN;
      uniform float uO, uReveal, uT, uSize, uCN, uPulse, uQ;
      varying float vA; varying vec3 vC;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normalize(position));
        float facing = dot(n, normalize(-mv.xyz));
        float rim = smoothstep(0.0, 0.5, facing);
        float on = smoothstep(aR - 0.06, aR, uReveal);
        float tw = 0.75 + 0.25 * sin(uT * 2.3 + aR * 40.0) + uPulse * 0.6 * step(0.82, fract(aR * 13.0 + uT * 0.7));
        vec3 gold = vec3(0.93, 0.74, 0.32);
        vec3 red = vec3(1.0, 0.30, 0.22);
        vC = mix(gold, red, aCN * uCN);
        vA = uO * on * rim * tw * (0.55 + 0.45 * aCN * uCN + 0.25);
        gl_PointSize = uSize * uQ * (1.0 + aCN * uCN * 0.5) * (900.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: dotFrag,
  });
  const landPts = new THREE.Points(landGeo, landMat);
  world.add(landPts);

  // 经纬网（很淡）
  const gridMat = new THREE.LineBasicMaterial({ color: 0xe8b84a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const gridGroup = new THREE.Group();
  for (let lat = -60; lat <= 60; lat += 30) {
    const pts = [];
    for (let lon = -180; lon <= 180; lon += 3) pts.push(ll2v(lat, lon, R * 1.002));
    gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
  }
  for (let lon = -180; lon < 180; lon += 30) {
    const pts = [];
    for (let lat = -80; lat <= 80; lat += 3) pts.push(ll2v(lat, lon, R * 1.002));
    gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
  }
  world.add(gridGroup);

  /* ---------- 标记：国家 + 人物城市 ---------- */
  const scenes = S.scenes;
  const sceneGeo = Object.fromEntries(scenes.map((s) => [s.id, s.geo]));
  function markerPoints(list, size, uniformsExtra) {
    const n = list.length;
    const p = new Float32Array(n * 3), c = new Float32Array(n * 3), r = new Float32Array(n);
    list.forEach((m, i) => {
      const v = ll2v(m.lat, m.lon, R * 1.012);
      p.set([v.x, v.y, v.z], i * 3);
      const col = new THREE.Color(m.color);
      c.set([col.r, col.g, col.b], i * 3);
      r[i] = rand(i * 11.3 + 2);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('aC', new THREE.BufferAttribute(c, 3));
    g.setAttribute('aR', new THREE.BufferAttribute(r, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: Object.assign({ uO: { value: 0 }, uT: { value: 0 }, uSize: { value: size }, uQ: { value: 1 } }, uniformsExtra || {}),
      vertexShader: `
        attribute vec3 aC; attribute float aR; uniform float uO, uT, uSize, uQ; varying float vA; varying vec3 vC; varying float vRing;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vec3 n = normalize(normalMatrix * normalize(position));
          float facing = dot(n, normalize(-mv.xyz));
          vC = aC; vRing = fract(uT * 0.6 + aR);
          float on = smoothstep(aR * 0.6, aR * 0.6 + 0.4, uO);
          vA = on * smoothstep(0.05, 0.35, facing);
          gl_PointSize = uSize * uQ * (900.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vA; varying vec3 vC; varying float vRing;
        void main(){
          vec2 p = gl_PointCoord - 0.5; float d = length(p) * 2.0;
          float core = smoothstep(0.28, 0.12, d);
          float glow = smoothstep(1.0, 0.0, d) * 0.35;
          float ring = smoothstep(0.06, 0.0, abs(d - vRing)) * (1.0 - vRing) * 0.9;
          gl_FragColor = vec4(mix(vC, vec3(1.0), core * 0.6), vA * (core + glow + ring));
        }`,
    });
    const pts = new THREE.Points(g, m);
    world.add(pts);
    return pts;
  }
  const sceneMarkers = markerPoints(
    scenes.map((s) => ({ lat: s.geo[0], lon: s.geo[1], color: s.id === 'cn' ? 0xff4b3e : 0xf0c75e })),
    26,
  );
  const cityList = S.artists.filter((a) => a.geo).map((a) => ({ lat: a.geo[0], lon: a.geo[1], color: a.country === 'CN' ? 0xff5a4a : 0xe8b84a }));
  const cityMarkers = markerPoints(cityList, 14);

  /* ---------- 弧线：用密集的点画，和站点地球的点状虚线一个味道 ---------- */
  function arcPoints(pairs, opt) {
    const per = opt.per || 140;
    const n = pairs.length * per;
    const p = new Float32Array(n * 3), u = new Float32Array(n), dl = new Float32Array(n), w = new Float32Array(n), cc = new Float32Array(n * 3);
    pairs.forEach((pr, k) => {
      const a = ll2v(pr.from[0], pr.from[1], 1).normalize(), b = ll2v(pr.to[0], pr.to[1], 1).normalize();
      const ang = Math.acos(Math.min(1, Math.max(-1, a.dot(b))));
      const h = R * (0.08 + ang * 0.28);
      const col = new THREE.Color(pr.color || 0xf0c75e);
      for (let i = 0; i < per; i++) {
        const tt = i / (per - 1);
        // 球面插值
        const s = Math.sin(ang) || 1;
        const v = a.clone().multiplyScalar(Math.sin((1 - tt) * ang) / s).add(b.clone().multiplyScalar(Math.sin(tt * ang) / s));
        v.normalize().multiplyScalar(R * 1.01 + Math.sin(Math.PI * tt) * h);
        const j = k * per + i;
        p.set([v.x, v.y, v.z], j * 3);
        u[j] = tt; dl[j] = pr.delay || 0; w[j] = pr.w || 1;
        cc.set([col.r, col.g, col.b], j * 3);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('aU', new THREE.BufferAttribute(u, 1));
    g.setAttribute('aD', new THREE.BufferAttribute(dl, 1));
    g.setAttribute('aW', new THREE.BufferAttribute(w, 1));
    g.setAttribute('aC', new THREE.BufferAttribute(cc, 3));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uO: { value: 0 }, uP: { value: 0 }, uDur: { value: opt.dur || 1.2 }, uSize: { value: opt.size || 3 }, uQ: { value: 1 }, uT: { value: 0 } },
      vertexShader: `
        attribute float aU, aD, aW; attribute vec3 aC; uniform float uO, uP, uDur, uSize, uQ, uT;
        varying float vA; varying vec3 vC;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float head = clamp((uP - aD) / uDur, 0.0, 1.0);
          float drawn = step(aU, head);
          float nearHead = smoothstep(0.12, 0.0, head - aU) * step(head, 0.999);
          float dash = 0.55 + 0.45 * step(0.5, fract(aU * 46.0 - uT * 1.5));
          vC = mix(aC, vec3(1.0), nearHead * 0.8);
          vA = uO * drawn * (dash * (0.35 + 0.15 * aW) + nearHead * 1.2);
          gl_PointSize = uSize * uQ * (1.0 + nearHead * 1.6) * (900.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: dotFrag,
    });
    const pts = new THREE.Points(g, m);
    world.add(pts);
    return pts;
  }
  // 1）从堪萨斯城（Tech N9ne / Strange Music）射向每一个场景国家，按距离依次出发
  const KC = [39.1, -94.58];
  const outPairs = scenes
    .filter((s) => s.id !== 'us')
    .map((s) => {
      const a = ll2v(KC[0], KC[1], 1), b = ll2v(s.geo[0], s.geo[1], 1);
      return { from: KC, to: s.geo, d: a.angleTo(b), color: s.id === 'cn' ? 0xff5a4a : 0xf0c75e, id: s.id };
    })
    .sort((x, y) => x.d - y.d);
  outPairs.forEach((p, i) => (p.delay = i * 0.16));
  const arcsOut = arcPoints(outPairs, { per: 150, dur: 1.4, size: 3.2 });
  // 2）合作连线：同一首歌里合作过的国家
  const colPairs = S.arcs
    .filter((a) => sceneGeo[a.a] && sceneGeo[a.b])
    .map((a, i) => ({ from: sceneGeo[a.a], to: sceneGeo[a.b], w: Math.min(3, a.w), delay: i * 0.05, color: a.a === 'cn' || a.b === 'cn' ? 0xff5a4a : 0xf0c75e }));
  const arcsCol = arcPoints(colPairs, { per: 120, dur: 1.0, size: 2.6 });

  /* ============ 星尘 + 光速线（独立场景，摄像机沿 -z 前进） ============ */
  const space = new THREE.Scene();
  const spaceCam = new THREE.PerspectiveCamera(70, W / H, 0.1, 4000);
  const NS = 2600;
  const sp = new Float32Array(NS * 3), sr = new Float32Array(NS);
  for (let i = 0; i < NS; i++) {
    const a = rand(i * 1.31) * Math.PI * 2, rr = 30 + Math.pow(rand(i * 2.71 + 3), 0.6) * 700;
    sp.set([Math.cos(a) * rr, Math.sin(a) * rr * 0.62, -rand(i * 5.17 + 1) * 3000], i * 3);
    sr[i] = rand(i * 7.7 + 5);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  starGeo.setAttribute('aR', new THREE.BufferAttribute(sr, 1));
  const starMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uO: { value: 0 }, uTravel: { value: 0 }, uQ: { value: 1 }, uT: { value: 0 }, uHue: { value: 0 } },
    vertexShader: `
      attribute float aR; uniform float uO, uTravel, uQ, uT, uHue; varying float vA; varying vec3 vC;
      void main(){
        vec3 p = position; p.z = mod(p.z + uTravel, 3000.0) - 3000.0;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float fade = smoothstep(-3000.0, -2200.0, p.z) * smoothstep(0.0, -60.0, p.z);
        vA = uO * fade * (0.4 + 0.6 * aR) * (0.8 + 0.2 * sin(uT * 3.0 + aR * 50.0));
        vC = mix(mix(vec3(1.0, 0.86, 0.6), vec3(0.95, 0.9, 0.85), aR), vec3(1.0, 0.4, 0.3), uHue * step(0.5, aR));
        gl_PointSize = (1.0 + aR * 2.2) * uQ * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: dotFrag,
  });
  space.add(new THREE.Points(starGeo, starMat));

  // 光速线：每条两个顶点，尾部沿 z 拉长
  const NL = 900;
  const wp = new Float32Array(NL * 2 * 3), wt = new Float32Array(NL * 2), wr = new Float32Array(NL * 2);
  for (let i = 0; i < NL; i++) {
    const a = rand(i * 3.3 + 11) * Math.PI * 2, rr = 40 + Math.pow(rand(i * 4.1 + 2), 0.5) * 520;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr * 0.6, z = -rand(i * 6.6 + 7) * 3000;
    for (let k = 0; k < 2; k++) {
      wp.set([x, y, z], (i * 2 + k) * 3);
      wt[i * 2 + k] = k;
      wr[i * 2 + k] = rand(i * 9.1 + 1);
    }
  }
  const warpGeo = new THREE.BufferGeometry();
  warpGeo.setAttribute('position', new THREE.BufferAttribute(wp, 3));
  warpGeo.setAttribute('aTail', new THREE.BufferAttribute(wt, 1));
  warpGeo.setAttribute('aR', new THREE.BufferAttribute(wr, 1));
  const warpMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uO: { value: 0 }, uTravel: { value: 0 }, uStretch: { value: 0 }, uHue: { value: 0 } },
    vertexShader: `
      attribute float aTail, aR; uniform float uO, uTravel, uStretch, uHue; varying float vA; varying vec3 vC;
      void main(){
        vec3 p = position; p.z = mod(p.z + uTravel * (0.8 + aR * 0.5), 3000.0) - 3000.0;
        p.z -= aTail * uStretch * (0.6 + aR);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float fade = smoothstep(-3000.0, -1800.0, p.z) * smoothstep(0.0, -80.0, p.z);
        vA = uO * fade * (1.0 - aTail * 0.95) * (0.35 + 0.65 * aR);
        vec3 gold = vec3(1.0, 0.78, 0.36); vec3 red = vec3(1.0, 0.32, 0.24);
        vC = mix(gold, red, uHue * step(0.45, aR));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying float vA; varying vec3 vC; void main(){ gl_FragColor = vec4(vC, vA); }`,
  });
  space.add(new THREE.LineSegments(warpGeo, warpMat));

  /* ============ 地球上的文字标签（DOM，跟随投影） ============ */
  const labelLayer = el('div', null, null, document.getElementById('cam'));
  labelLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
  labelLayer.parentNode.insertBefore(labelLayer, document.getElementById('scenes'));
  const labels = [];
  /** 加一个跟随经纬度的标签；alpha(t) 决定何时显示 */
  function addLabel(lat, lon, html, cls, alpha) {
    const e = el('div', 'gl-label ' + (cls || ''), html, labelLayer);
    labels.push({ v: ll2v(lat, lon, R * 1.02), e, alpha });
    return e;
  }
  const tmp = new THREE.Vector3(), tmpN = new THREE.Vector3(), camDir = new THREE.Vector3();

  /* ============ 渲染 ============ */
  function render(t) {
    const any = G.globe > 0.002 || G.stars > 0.002 || G.warp > 0.002;
    canvas.style.visibility = any ? 'visible' : 'hidden';
    labelLayer.style.visibility = G.globe > 0.01 && G.labels > 0.01 ? 'visible' : 'hidden';
    if (!any) return;
    renderer.clear();
    const pulse = window.FILM.hit('kick', t, 0.15, 0.3) * G.pulse;

    if (G.stars > 0.002 || G.warp > 0.002) {
      starMat.uniforms.uO.value = G.stars;
      starMat.uniforms.uTravel.value = G.travel * 0.25 + t * 6;
      starMat.uniforms.uQ.value = q;
      starMat.uniforms.uT.value = t;
      starMat.uniforms.uHue.value = G.warpHue;
      warpMat.uniforms.uO.value = G.warp;
      warpMat.uniforms.uTravel.value = G.travel;
      warpMat.uniforms.uStretch.value = G.stretch;
      warpMat.uniforms.uHue.value = G.warpHue;
      spaceCam.rotation.z = G.roll * D2R * 0.5;
      renderer.render(space, spaceCam);
    }

    if (G.globe > 0.002) {
      camera.fov = G.fov;
      camera.aspect = W / H;
      // 画面偏移：把地球推到画面一侧
      camera.setViewOffset(W, H, -G.shiftX, -G.shiftY, W, H);
      const lon = G.lon + G.spin;
      const pos = ll2v(G.lat, lon, G.dist);
      camera.position.copy(pos);
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 0, 0);
      camera.rotateZ(G.roll * D2R);
      camera.updateProjectionMatrix();
      world.updateMatrixWorld();

      occ.material.uniforms.uO.value = Math.min(1, G.globe * 1.2);
      atmo.material.uniforms.uO.value = G.globe * G.atmo * (0.85 + pulse * 0.6);
      atmo.material.uniforms.uC.value.setRGB(0.91 + 0.09 * G.hotCN, 0.72 - 0.42 * G.hotCN, 0.29 - 0.08 * G.hotCN);
      landMat.uniforms.uO.value = G.globe;
      landMat.uniforms.uReveal.value = G.reveal;
      landMat.uniforms.uT.value = t;
      landMat.uniforms.uCN.value = G.hotCN;
      landMat.uniforms.uPulse.value = pulse;
      landMat.uniforms.uQ.value = q;
      gridMat.opacity = 0.05 * G.globe;
      sceneMarkers.material.uniforms.uO.value = G.markers * G.globe;
      sceneMarkers.material.uniforms.uT.value = t;
      sceneMarkers.material.uniforms.uQ.value = q;
      cityMarkers.material.uniforms.uO.value = G.cities * G.globe;
      cityMarkers.material.uniforms.uT.value = t;
      cityMarkers.material.uniforms.uQ.value = q;
      for (const [o, P, A] of [[arcsOut, G.arcsOut, G.arcsOutA], [arcsCol, G.arcsCol, G.arcsColA]]) {
        o.visible = A > 0.002;
        o.material.uniforms.uO.value = A * G.globe;
        o.material.uniforms.uP.value = P;
        o.material.uniforms.uT.value = t;
        o.material.uniforms.uQ.value = q;
      }
      renderer.render(scene, camera);

      // 标签投影
      if (G.labels > 0.01) {
        camDir.copy(camera.position).normalize();
        for (const L of labels) {
          const a = (L.alpha ? L.alpha(t) : 1) * G.labels * G.globe;
          tmpN.copy(L.v).normalize();
          const facing = tmpN.dot(camDir);
          const vis = a * Math.max(0, Math.min(1, (facing - 0.15) / 0.25));
          if (vis < 0.01) { L.e.style.opacity = 0; continue; }
          tmp.copy(L.v).project(camera);
          const x = (tmp.x * 0.5 + 0.5) * W, y = (-tmp.y * 0.5 + 0.5) * H;
          L.e.style.opacity = vis;
          L.e.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        }
      }
    }
  }

  /** 经纬度在当前镜头下的屏幕坐标（场景里用来对齐 DOM） */
  function project(lat, lon) {
    tmp.copy(ll2v(lat, lon, R)).project(camera);
    return { x: (tmp.x * 0.5 + 0.5) * W, y: (-tmp.y * 0.5 + 0.5) * H };
  }

  window.GL = { G, render, resize, addLabel, project, outPairs, KC, ll2v };
})();
