/**
 * 点阵地球：Canvas 2D 正射投影，不依赖 3D 库。
 * - 陆地点在构建时算好（scripts/build-globe.mjs），这里只做旋转和绘制
 * - 拖动旋转带惯性；空闲时自转；离开视口 / 切到后台时停止渲染
 * - 标记可点击（也可以通过页面上的按钮列表选择，保证键盘和读屏可用）
 */
import land from '@/data/globe-land.json';

export type GlobeMarker = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** scene = 国家/地区场景（大标记，带文字）；city = 人物所在城市（小点） */
  kind: 'scene' | 'city';
  tone: 'china' | 'world';
};
export type GlobeArc = { from: [number, number]; to: [number, number] };

type Options = {
  markers: GlobeMarker[];
  arcs?: GlobeArc[];
  onSelect?: (id: string) => void;
  start?: [number, number]; // [lon, lat]
};

const RAD = Math.PI / 180;

export function mountGlobe(canvas: HTMLCanvasElement, opts: Options) {
  const ctx = canvas.getContext('2d', { alpha: true })!;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;

  // ---- 陆地点：预先转成单位向量 ----
  const n = land.length / 2;
  const PA = new Float32Array(n);
  const PB = new Float32Array(n);
  const PC = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const lat = (land[i * 2] / 10) * RAD;
    const lon = (land[i * 2 + 1] / 10) * RAD;
    PA[i] = Math.cos(lat) * Math.cos(lon);
    PB[i] = Math.cos(lat) * Math.sin(lon);
    PC[i] = Math.sin(lat);
  }

  // ---- 状态 ----
  let lon0 = opts.start?.[0] ?? 100;
  let lat0 = opts.start?.[1] ?? 20;
  let vLon = 0;
  let vLat = 0;
  let W = 0;
  let H = 0;
  let R = 0;
  let cx = 0;
  let cy = 0;
  let dpr = 1;
  let selected: string | null = null;
  let hovered: string | null = null;
  let dragging = false;
  let lastInteract = -1e9;
  let tween: { fromLon: number; fromLat: number; toLon: number; toLat: number; t0: number; dur: number } | null = null;
  let running = false;
  let raf = 0;
  let inView = false;
  let colors = readColors();
  let backdrop: HTMLCanvasElement | null = null;

  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (k: string) => cs.getPropertyValue(k).trim();
    return {
      ink: v('--ink') || '#f6efe3',
      bg: v('--bg') || '#0a0807',
      china: v('--scene-china') || '#ff4b3e',
      world: v('--scene-world') || '#f0c75e',
      accent: v('--accent') || '#e8b84a',
      dark: document.documentElement.dataset.theme !== 'light',
      font: `600 ${coarse ? 12 : 13}px ${getComputedStyle(document.body).fontFamily}`,
    };
  }

  // ---- 投影 ----
  let sl = 0, cl = 1, sp = 0, cp = 1;
  function setRot() {
    sl = Math.sin(lon0 * RAD);
    cl = Math.cos(lon0 * RAD);
    sp = Math.sin(lat0 * RAD);
    cp = Math.cos(lat0 * RAD);
  }
  /** 输入单位向量分量，返回 [X, Y, Z]，Z > 0 为正面 */
  function rot(a: number, b: number, c: number, out: Float32Array) {
    const m = a * cl + b * sl;
    out[0] = b * cl - a * sl;
    out[1] = c * cp - sp * m;
    out[2] = c * sp + cp * m;
  }
  function vec(lat: number, lon: number): [number, number, number] {
    const la = lat * RAD;
    const lo = lon * RAD;
    return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  }

  const markerVec = opts.markers.map((m) => vec(m.lat, m.lon));
  // 弧线：沿大圆插值，抬高离开球面
  const arcs = (opts.arcs ?? []).map((a) => {
    const p = vec(a.from[0], a.from[1]);
    const q = vec(a.to[0], a.to[1]);
    const dot = Math.min(1, Math.max(-1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2]));
    const om = Math.acos(dot);
    const steps = 48;
    const pts: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const s1 = Math.sin((1 - t) * om) / Math.sin(om);
      const s2 = Math.sin(t * om) / Math.sin(om);
      const lift = 1 + 0.12 * Math.sin(Math.PI * t) * Math.min(1, om * 1.4);
      pts.push((s1 * p[0] + s2 * q[0]) * lift, (s1 * p[1] + s2 * q[1]) * lift, (s1 * p[2] + s2 * q[2]) * lift);
    }
    return pts;
  });

  // ---- 尺寸 ----
  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.75 : 2);
    W = rect.width;
    H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    R = Math.min(W, H) * 0.42;
    cx = W / 2;
    cy = H / 2;
    buildBackdrop();
    draw(performance.now());
  }

  /** 球体底色和大气光晕只在尺寸或主题变化时画一次 */
  function buildBackdrop() {
    backdrop = document.createElement('canvas');
    backdrop.width = canvas.width;
    backdrop.height = canvas.height;
    const b = backdrop.getContext('2d')!;
    b.scale(dpr, dpr);
    // 只在球体边缘外画一圈很窄的大气光，半径控制在画布内，避免出现方形边界
    const edge = Math.min(R * 1.16, Math.min(W, H) / 2 - 1);
    const glow = b.createRadialGradient(cx, cy, R * 0.96, cx, cy, edge);
    glow.addColorStop(0, hexA(colors.accent, colors.dark ? 0.22 : 0.3));
    glow.addColorStop(1, hexA(colors.accent, 0));
    b.fillStyle = glow;
    b.beginPath();
    b.arc(cx, cy, edge, 0, Math.PI * 2);
    b.fill();
    // 球体：中性色的立体感，不带绿色
    const body = b.createRadialGradient(cx - R * 0.4, cy - R * 0.45, R * 0.05, cx, cy, R);
    body.addColorStop(0, colors.dark ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.9)');
    body.addColorStop(0.6, colors.dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)');
    body.addColorStop(1, colors.dark ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.1)');
    b.fillStyle = colors.bg;
    b.beginPath();
    b.arc(cx, cy, R, 0, Math.PI * 2);
    b.fill();
    b.fillStyle = body;
    b.fill();
    b.strokeStyle = hexA(colors.ink, colors.dark ? 0.14 : 0.18);
    b.lineWidth = 1;
    b.stroke();
  }

  // ---- 绘制 ----
  const tmp = new Float32Array(3);
  const BUCKETS = 4;
  const bx: Float32Array[] = Array.from({ length: BUCKETS }, () => new Float32Array(n));
  const by: Float32Array[] = Array.from({ length: BUCKETS }, () => new Float32Array(n));
  const bn = new Int32Array(BUCKETS);
  const backX = new Float32Array(n);
  const backY = new Float32Array(n);
  const screen: { id: string; x: number; y: number; z: number; m: GlobeMarker }[] = [];

  function draw(now: number) {
    setRot();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (backdrop) ctx.drawImage(backdrop, 0, 0, W, H);

    // 陆地点：按深度分 4 档，一档一个颜色，减少状态切换；一次遍历完成
    bn.fill(0);
    let backCount = 0;
    const drawBack = !coarse; // 背面的淡点（"透视"效果）只在桌面端画
    for (let i = 0; i < n; i++) {
      rot(PA[i], PB[i], PC[i], tmp);
      const z = tmp[2];
      if (z <= 0) {
        if (drawBack && (i & 1) === 0) {
          backX[backCount] = cx + R * tmp[0];
          backY[backCount] = cy - R * tmp[1];
          backCount++;
        }
        continue;
      }
      const k = Math.min(BUCKETS - 1, Math.floor(z * BUCKETS));
      const j = bn[k]++;
      bx[k][j] = cx + R * tmp[0];
      by[k][j] = cy - R * tmp[1];
    }
    if (backCount) {
      ctx.fillStyle = hexA(colors.ink, colors.dark ? 0.07 : 0.08);
      for (let j = 0; j < backCount; j++) ctx.fillRect(backX[j], backY[j], 1, 1);
    }
    const base = Math.max(1.1, R / 170);
    for (let k = 0; k < BUCKETS; k++) {
      const depth = (k + 0.5) / BUCKETS;
      ctx.fillStyle = hexA(colors.ink, (colors.dark ? 0.22 : 0.25) + depth * (colors.dark ? 0.68 : 0.6));
      const s = base * (0.7 + depth * 0.5);
      const h = s / 2;
      const X = bx[k];
      const Y = by[k];
      for (let j = 0; j < bn[k]; j++) ctx.fillRect(X[j] - h, Y[j] - h, s, s);
    }

    // 弧线
    if (arcs.length) {
      ctx.lineWidth = 1.4;
      ctx.lineCap = 'round';
      ctx.setLineDash([4, 6]);
      ctx.lineDashOffset = reduceMotion ? 0 : -((now / 40) % 10);
      ctx.strokeStyle = hexA(colors.world, 0.85);
      for (const pts of arcs) {
        ctx.beginPath();
        let pen = false;
        for (let i = 0; i < pts.length; i += 3) {
          rot(pts[i], pts[i + 1], pts[i + 2], tmp);
          const x = tmp[0];
          const y = tmp[1];
          const visible = tmp[2] > 0 || x * x + y * y > 1;
          if (!visible) {
            pen = false;
            continue;
          }
          const sx = cx + R * x;
          const sy = cy - R * y;
          if (pen) ctx.lineTo(sx, sy);
          else ctx.moveTo(sx, sy);
          pen = true;
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // 标记
    screen.length = 0;
    const pulse = reduceMotion ? 0.5 : (now % 2200) / 2200;
    for (let i = 0; i < opts.markers.length; i++) {
      const m = opts.markers[i];
      const v = markerVec[i];
      rot(v[0], v[1], v[2], tmp);
      if (tmp[2] <= 0.02) continue;
      const x = cx + R * tmp[0];
      const y = cy - R * tmp[1];
      screen.push({ id: m.id, x, y, z: tmp[2], m });
    }
    // 远的先画
    screen.sort((a, b) => a.z - b.z);
    ctx.font = colors.font;
    ctx.textBaseline = 'middle';
    for (const s of screen) {
      const color = s.m.tone === 'china' ? colors.china : colors.world;
      const active = s.id === selected || s.id === hovered;
      const fade = Math.min(1, s.z * 2.2);
      if (s.m.kind === 'city') {
        ctx.fillStyle = hexA(color, 0.9 * fade);
        ctx.beginPath();
        ctx.arc(s.x, s.y, active ? 3.2 : 2.2, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      // 扩散的光圈
      const pr = 6 + pulse * 16;
      ctx.strokeStyle = hexA(color, (1 - pulse) * 0.7 * fade);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, pr, 0, Math.PI * 2);
      ctx.stroke();
      // 核心点
      ctx.fillStyle = hexA(color, fade);
      ctx.beginPath();
      ctx.arc(s.x, s.y, active ? 7 : 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hexA(colors.bg, fade);
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 标签：选中/悬停的优先，其余按离观察者远近；和已画的标签重叠就不画
    const boxes: [number, number, number, number][] = [];
    const labeled = screen
      .filter((s) => s.m.kind === 'scene' && (s.z > 0.25 || s.id === selected || s.id === hovered))
      .sort((a, b) => Number(b.id === selected || b.id === hovered) - Number(a.id === selected || a.id === hovered) || b.z - a.z);
    for (const s of labeled) {
      const color = s.m.tone === 'china' ? colors.china : colors.world;
      const active = s.id === selected || s.id === hovered;
      const fade = Math.min(1, s.z * 2.2);
      const label = s.m.name;
      const tw = ctx.measureText(label).width;
      const box: [number, number, number, number] = [s.x + 5, s.y - 12, s.x + 17 + tw + 6, s.y + 10];
      if (boxes.some((o) => box[0] < o[2] && box[2] > o[0] && box[1] < o[3] && box[3] > o[1])) continue;
      boxes.push(box);
      const lx = s.x + 11;
      const ly = s.y - 1;
      ctx.fillStyle = hexA(colors.bg, 0.82 * fade);
      roundRect(ctx, lx - 6, ly - 11, tw + 12, 22, 11);
      ctx.fill();
      if (active) {
        ctx.strokeStyle = hexA(color, 0.9);
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.fillStyle = hexA(colors.ink, fade);
      ctx.fillText(label, lx, ly + 0.5);
    }
  }

  // ---- 动画循环 ----
  function frame(now: number) {
    raf = 0;
    let moving = false;
    if (tween) {
      const t = Math.min(1, (now - tween.t0) / tween.dur);
      const e = 1 - Math.pow(1 - t, 3);
      lon0 = tween.fromLon + (tween.toLon - tween.fromLon) * e;
      lat0 = tween.fromLat + (tween.toLat - tween.fromLat) * e;
      if (t >= 1) tween = null;
      moving = true;
    } else if (!dragging) {
      if (Math.abs(vLon) > 0.001 || Math.abs(vLat) > 0.001) {
        lon0 += vLon;
        lat0 = clampLat(lat0 + vLat);
        vLon *= 0.94;
        vLat *= 0.94;
        moving = true;
      } else if (!reduceMotion && now - lastInteract > 3500) {
        lon0 += 0.045; // 自转
        moving = true;
      }
    }
    draw(now);
    // 有动画（光圈、弧线、自转）就继续；减少动态效果时只在需要时重绘
    if (running && (moving || !reduceMotion || dragging)) raf = requestAnimationFrame(frame);
  }
  function start() {
    if (running) return;
    running = true;
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  function kick() {
    if (running && !raf) raf = requestAnimationFrame(frame);
    else if (!running) draw(performance.now());
  }
  const clampLat = (v: number) => Math.max(-55, Math.min(65, v));

  // ---- 交互 ----
  let px = 0, py = 0, downX = 0, downY = 0, lastT = 0;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    tween = null;
    canvas.setPointerCapture(e.pointerId);
    px = downX = e.clientX;
    py = downY = e.clientY;
    lastT = performance.now();
    vLon = vLat = 0;
    lastInteract = lastT;
    kick();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) {
      if (e.pointerType === 'mouse') {
        const hit = pick(e);
        if (hit !== hovered) {
          hovered = hit;
          canvas.style.cursor = hit ? 'pointer' : 'grab';
          kick();
        }
      }
      return;
    }
    const now = performance.now();
    const dx = e.clientX - px;
    const dy = e.clientY - py;
    px = e.clientX;
    py = e.clientY;
    const k = (180 / Math.PI / R) * 0.9;
    lon0 -= dx * k;
    lat0 = clampLat(lat0 + dy * k);
    const dt = Math.max(1, now - lastT);
    vLon = (-dx * k * 16) / dt;
    vLat = (dy * k * 16) / dt;
    lastT = now;
    lastInteract = now;
    kick();
  });
  const end = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    lastInteract = performance.now();
    const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
    if (moved < 6) {
      const hit = pick(e);
      if (hit) select(hit, true);
    }
    kick();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => {
    if (hovered) {
      hovered = null;
      kick();
    }
  });

  function pick(e: PointerEvent): string | null {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const radius = e.pointerType === 'touch' ? 26 : 16;
    let best: string | null = null;
    let bd = radius * radius;
    for (const s of screen) {
      if (s.m.kind !== 'scene') continue;
      const d = (s.x - x) ** 2 + (s.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = s.id;
      }
    }
    return best;
  }

  function select(id: string, notify = false) {
    selected = id;
    const m = opts.markers.find((x) => x.id === id);
    if (m) focus(m.lon, m.lat);
    if (notify) opts.onSelect?.(id);
    kick();
  }

  function focus(lon: number, lat: number) {
    // 走最短的经度方向
    let target = lon;
    while (target - lon0 > 180) target -= 360;
    while (target - lon0 < -180) target += 360;
    tween = { fromLon: lon0, fromLat: lat0, toLon: target, toLat: clampLat(lat * 0.8), t0: performance.now(), dur: reduceMotion ? 1 : 900 };
    lastInteract = performance.now();
    if (!running) {
      // 离屏时直接跳过去
      lon0 = target;
      lat0 = clampLat(lat * 0.8);
      tween = null;
    }
    kick();
  }

  // ---- 生命周期 ----
  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas);
  const io = new IntersectionObserver(([e]) => {
    inView = e.isIntersecting;
    inView && !document.hidden ? start() : stop();
  });
  io.observe(canvas);
  const onVis = () => (document.hidden ? stop() : inView && start());
  document.addEventListener('visibilitychange', onVis);
  const mo = new MutationObserver(() => {
    colors = readColors();
    buildBackdrop();
    kick();
  });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  resize();

  return {
    select: (id: string) => select(id, false),
    destroy() {
      stop();
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    },
  };
}

function hexA(color: string, a: number) {
  const c = color.trim();
  if (c.startsWith('#')) {
    const h = c.length === 4 ? c.slice(1).split('').map((x) => x + x).join('') : c.slice(1, 7);
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a.toFixed(3)})`;
  }
  return c;
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
