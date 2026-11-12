/* ------------------------------------------------------------------
   FLORIDA BAY ROLEPLAY - BEACH SCENE
   Everything here is drawn in code (no image files), so it costs nothing to download.
   Switch parts off in Config.Effects (config.js).
------------------------------------------------------------------- */
(function () {
  "use strict";
  const cfg = window.Config || {};
  if (cfg.Background === "video") return;
  const fx = Object.assign({ waves: true, clouds: true, birds: true, plane: true, palms: true, sunset: true }, cfg.Effects || {});

  const $ = (s) => document.querySelector(s);
  const TAU = Math.PI * 2;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, x) => { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
  const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a === undefined ? 1 : a})`;
  const seeded = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  /* colours at the two ends of the load: late afternoon (0) and sunset (1) */
  const P0 = { seaFar: [18, 96, 142], seaMid: [24, 152, 172], seaNear: [66, 208, 190], haze: [247, 220, 174], sun: [255, 246, 222], foam: [255, 255, 255], sand0: [238, 216, 172], sand1: [206, 172, 124], wet: [112, 86, 66], bird: [14, 28, 48], isle: [78, 120, 140], cloudLit: [255, 241, 222], cloudShade: [112, 142, 182], streak: [255, 240, 225] };
  const P1 = { seaFar: [22, 50, 100], seaMid: [26, 112, 134], seaNear: [56, 172, 172], haze: [255, 173, 102], sun: [255, 224, 172], foam: [255, 238, 222], sand0: [208, 162, 122], sand1: [140, 100, 78], wet: [66, 44, 44], bird: [26, 16, 40], isle: [74, 52, 96], cloudLit: [255, 196, 160], cloudShade: [108, 92, 150], streak: [255, 150, 110] };
  const pal = (d) => { const o = {}; for (const k in P0) o[k] = mix(P0[k], P1[k], d); return o; };

  const cvs = $("#sea"), ctx = cvs.getContext("2d");
  const skyB = $(".sky-b"), cloudsB = $("#cloudsB"), sunEl = $("#sun"), far = $("#far");
  let W, H, RS, S, hy, sy, sx, vw, vh;
  let dusk = 0, duskTarget = 0, progress = 0, lastDrawDusk = -1;
  let isleB = null;

  function layout() {
    vw = window.innerWidth; vh = window.innerHeight;
    RS = Math.min(1, 1920 / vw); // render the sea at most 1920 wide, the browser scales it up
    W = cvs.width = Math.round(vw * RS); H = cvs.height = Math.round(vh * RS);
    S = H / 1080; hy = H * 0.55; sy = H * 0.80; sx = W * 0.462;
    far.style.top = vh * 0.55 + "px";
  }

  /* ---------------- palms ---------------- */
  // one frond = a curved spine with drooping leaflets, built once and drawn in two passes (rim light, then silhouette)
  function makeFrond(rng, ox, oy, ang, L, droop) {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const P = (t) => ({ x: ox + dx * L * t, y: oy + dy * L * t + droop * L * t * t });
    const spine = [], leaf = [];
    for (let i = 0; i <= 30; i++) spine.push(P(i / 30));
    for (let t = 0.1; t <= 1; t += 0.027) {
      const p = P(t), p2 = P(t + 0.01), ta = Math.atan2(p2.y - p.y, p2.x - p.x);
      for (const side of [-1, 1]) {
        const la = ta + side * (1.2 - 0.62 * t) + (rng() - 0.5) * 0.18;
        const len = L * 0.17 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.1 + 0.9 * t)), 0.9) * (0.72 + 0.28 * rng());
        leaf.push({ x: p.x, y: p.y, cx: p.x + Math.cos(la) * len * 0.5, cy: p.y + Math.sin(la) * len * 0.5 + len * 0.05, ex: p.x + Math.cos(la) * len, ey: p.y + Math.sin(la) * len + len * 0.3, w: 3.0 - 1.7 * t });
      }
    }
    return { spine, leaf };
  }
  function strokeFrond(g, f, s, dx, dy, color) {
    g.strokeStyle = color; g.lineCap = "round";
    g.lineWidth = 3.4 * s; g.beginPath();
    f.spine.forEach((p, i) => (i ? g.lineTo(p.x + dx, p.y + dy) : g.moveTo(p.x + dx, p.y + dy))); g.stroke();
    for (const l of f.leaf) {
      g.lineWidth = l.w * s; g.beginPath(); g.moveTo(l.x + dx, l.y + dy); g.quadraticCurveTo(l.cx + dx, l.cy + dy, l.ex + dx, l.ey + dy); g.stroke();
    }
  }

  function buildPalms() {
    const host = $("#palms"); host.innerHTML = "";
    if (!fx.palms) return;
    const sz = Math.round(vh * 0.5);
    const rng = seeded(7);
    const layers = [
      { dark: "#08333b", n: 6, a0: -0.05, a1: 1.2, len: 0.82, dur: 9.5, delay: -2 },   // back fronds, a little lighter
      { dark: "#031a21", n: 7, a0: 0.05, a1: 1.45, len: 1.0, dur: 7.2, delay: -5 },    // front fronds
    ];
    for (const side of ["l", "r"]) {
      layers.forEach((ly, li) => {
        const c = document.createElement("canvas"); c.width = c.height = sz; c.className = side;
        c.style.width = c.style.height = sz + "px";
        c.style.transformOrigin = side === "l" ? "3% 0" : "97% 0";
        c.style.animationDuration = ly.dur + (side === "r" ? 1.7 : 0) + "s";
        c.style.animationDelay = ly.delay + "s";
        const g = c.getContext("2d"), s1 = sz / 540;
        if (side === "r") { g.translate(sz, 0); g.scale(-1, 1); }
        const fr = [];
        for (let i = 0; i < ly.n; i++) {
          const a = lerp(ly.a0, ly.a1, i / (ly.n - 1)) + (rng() - 0.5) * 0.14;
          fr.push(makeFrond(rng, sz * 0.03, sz * 0.0, a, sz * 0.5 * ly.len * (0.82 + 0.2 * rng()), 0.28 + 0.35 * (a / 1.45) + rng() * 0.1));
        }
        fr.forEach((f) => strokeFrond(g, f, s1, 1.8 * s1, -0.6 * s1, li ? "rgba(255,186,110,.5)" : "rgba(255,200,140,.28)"));
        fr.forEach((f) => strokeFrond(g, f, s1, 0, 0, ly.dark));
        host.appendChild(c);
      });
    }
  }

  /* ---------------- clouds ---------------- */
  function makeCloud(w, h, lit, shade, rng) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"), base = h * 0.66, n = 9 + Math.floor(rng() * 6);
    g.fillStyle = "#fff";
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, r = h * (0.12 + 0.2 * Math.pow(Math.sin(Math.PI * t), 0.8) * (0.55 + 0.45 * rng()));
      g.beginPath(); g.arc(w * (0.1 + 0.8 * t), base - r * (0.45 + 0.4 * rng()), r, 0, TAU); g.fill();
    }
    g.globalCompositeOperation = "source-atop";
    const gr = g.createLinearGradient(0, 0, 0, base + h * 0.06);
    gr.addColorStop(0, rgba(lit)); gr.addColorStop(0.5, rgba(mix(lit, shade, 0.35))); gr.addColorStop(1, rgba(shade));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = "destination-out";
    const f = g.createLinearGradient(0, base - h * 0.02, 0, base + h * 0.08);
    f.addColorStop(0, "rgba(0,0,0,0)"); f.addColorStop(1, "rgba(0,0,0,1)");
    g.fillStyle = f; g.fillRect(0, base - h * 0.02, w, h);
    return soften(c, Math.max(2, h * 0.022), 0.93);
  }
  function makeStreak(w, h, col, rng) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d");
    for (let i = 0; i < 4; i++) {
      g.fillStyle = rgba(col, 0.2 + rng() * 0.2);
      g.beginPath(); g.ellipse(w * (0.3 + rng() * 0.4), h * (0.3 + rng() * 0.4), w * (0.2 + rng() * 0.25), h * (0.07 + rng() * 0.08), 0, 0, TAU); g.fill();
    }
    return soften(c, h * 0.05, 1);
  }
  function soften(src, px, alpha) {
    const o = document.createElement("canvas"); o.width = src.width; o.height = src.height;
    const g = o.getContext("2d");
    try { g.filter = "blur(" + px + "px)"; } catch (e) {}
    g.globalAlpha = alpha; g.drawImage(src, 0, 0);
    return o;
  }
  function buildClouds() {
    const a = $("#cloudsA"), b = $("#cloudsB"); a.innerHTML = b.innerHTML = "";
    if (!fx.clouds) return;
    const rng = seeded(21), items = [];
    for (let i = 0; i < 8; i++) { const w = Math.round(vh * (0.45 + rng() * 0.45)); items.push({ s: false, w, h: Math.round(w * (0.28 + rng() * 0.1)), y: vh * (0.05 + rng() * 0.38), dur: 280 + rng() * 260, seed: i + 3 }); }
    for (let i = 0; i < 4; i++) { const w = Math.round(vh * (0.9 + rng() * 0.7)); items.push({ s: true, w, h: Math.round(vh * 0.07), y: vh * (0.3 + rng() * 0.22), dur: 520 + rng() * 300, seed: i + 40 }); }
    items.forEach((it) => {
      [[a, P0], [b, P1]].forEach(([host, p]) => {
        const r = seeded(it.seed * 97);
        const c = it.s ? makeStreak(it.w, it.h, p.streak, r) : makeCloud(it.w, it.h, p.cloudLit, p.cloudShade, r);
        c.style.top = it.y + "px"; c.style.animationDuration = it.dur + "s"; c.style.animationDelay = "-" + ((it.seed * 53) % it.dur).toFixed(1) + "s";
        host.appendChild(c);
      });
    });
  }

  /* ---------------- island + sailboat on the horizon ---------------- */
  function buildFar() {
    far.innerHTML = ""; isleB = null;
    const w = Math.round(vw * 0.17), h = Math.round(vh * 0.1);
    [P0, P1].forEach((p, k) => {
      const c = document.createElement("canvas"); c.width = w; c.height = h; c.style.left = vw * 0.462 - w * 0.62 + "px";
      const g = c.getContext("2d"), rng = seeded(5), col = rgba(p.isle);
      g.fillStyle = col;
      g.beginPath(); g.moveTo(0, h); g.quadraticCurveTo(w * 0.1, h * 0.84, w * 0.28, h * 0.88); g.quadraticCurveTo(w * 0.5, h * 0.78, w * 0.72, h * 0.87); g.quadraticCurveTo(w * 0.92, h * 0.86, w, h); g.fill();
      [[0.3, 0.62, 0.3], [0.42, 0.78, 0.36], [0.55, 0.7, 0.26], [0.68, 0.64, 0.3]].forEach(([px, ph, pl]) => {
        const bx = w * px, by = h * 0.88, top = by - h * ph, lean = (rng() - 0.5) * w * 0.03;
        g.strokeStyle = col; g.lineCap = "round"; g.lineWidth = Math.max(1.6, h * 0.025);
        g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(bx + lean, (by + top) / 2, bx + lean * 1.6, top); g.stroke();
        for (let i = 0; i < 7; i++) {
          const f = makeFrond(rng, bx + lean * 1.6, top, -0.4 + i * 0.58 + (rng() - 0.5) * 0.2, h * pl * 0.55, 0.4);
          strokeFrond(g, f, h / 260, 0, 0, col);
        }
      });
      if (k) c.style.opacity = 0; else c.style.opacity = 1;
      far.appendChild(c); if (k) isleB = c;
    });
    // fading in B over A: A stays solid underneath, B takes over as dusk rises
    const ns = "http://www.w3.org/2000/svg", bs = Math.round(vh * 0.034);
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 40 44"); svg.setAttribute("class", "boat");
    svg.style.width = bs + "px"; svg.style.height = bs * 1.1 + "px"; svg.style.left = vw * 0.462 + vw * 0.035 + "px";
    svg.innerHTML = '<path d="M20 2 L20 31 L5 31 Z" fill="#1a2a44"/><path d="M22 7 L22 31 L35 31 Z" fill="#1a2a44" opacity=".92"/><path d="M3 33 H37 L33 39 H8 Z" fill="#14213a"/>';
    far.appendChild(svg);
  }

  /* ---------------- sea ---------------- */
  const glints = Array.from({ length: 190 }, () => ({ u: Math.pow(Math.random(), 0.8), dx: (Math.random() + Math.random() + Math.random() - 1.5) * 1.3, sp: rnd(0.5, 2.4), ph: rnd(0, TAU), k: rnd(0.5, 1.3) }));
  const sparks = Array.from({ length: 70 }, () => ({ x: Math.random(), u: Math.random(), sp: rnd(0.4, 1.6), ph: rnd(0, TAU), w: rnd(3, 9) }));
  const MAXADV = () => 0.018 * H;
  const edgeY = (x, t) => { const u = x / W; return sy + MAXADV() * (0.5 + 0.5 * Math.sin(t * 0.55)) + H * (0.006 * Math.sin(u * 8.6 + t * 0.7) + 0.004 * Math.sin(u * 25 - t * 1.1 + 1.7) + 0.003 * Math.sin(u * 58 + t * 0.5)); };

  let speckle = null;
  function sandSpeckle() {
    const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d"), r = seeded(11);
    for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? "rgba(80,55,35,.16)" : "rgba(255,244,220,.2)"; g.fillRect(r() * 256, r() * 256, 1 + r() * 1.6, 1 + r() * 1.2); }
    return ctx.createPattern(c, "repeat");
  }
  function drawSea(t, P) {
    // sand + wet sand
    let g = ctx.createLinearGradient(0, sy, 0, H); g.addColorStop(0, rgba(P.sand0)); g.addColorStop(1, rgba(P.sand1));
    ctx.fillStyle = g; ctx.fillRect(0, sy - 0.04 * H, W, H);
    if (!speckle) speckle = sandSpeckle();
    ctx.fillStyle = speckle; ctx.fillRect(0, sy, W, H - sy);
    g = ctx.createLinearGradient(0, sy - 0.01 * H, 0, sy + 0.09 * H);
    g.addColorStop(0, rgba(P.wet, 0.65)); g.addColorStop(0.55, rgba(P.wet, 0.28)); g.addColorStop(1, rgba(P.wet, 0));
    ctx.fillStyle = g; ctx.fillRect(0, sy - 0.01 * H, W, 0.1 * H);
    ctx.save(); ctx.translate(sx, sy + 0.035 * H); ctx.scale(3.2, 0.3);
    g = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.16 * H); g.addColorStop(0, rgba(P.haze, 0.38)); g.addColorStop(1, rgba(P.haze, 0));
    ctx.fillStyle = g; ctx.fillRect(-0.2 * H, -0.2 * H, 0.4 * H, 0.4 * H); ctx.restore();

    // water body
    const wp = new Path2D(); wp.moveTo(0, hy); wp.lineTo(W, hy);
    for (let x = W; x >= -12; x -= 12) wp.lineTo(x, edgeY(x, t));
    wp.closePath();
    const bottom = sy + MAXADV() + 0.02 * H;
    g = ctx.createLinearGradient(0, hy, 0, bottom);
    g.addColorStop(0, rgba(mix(P.seaFar, P.haze, 0.55))); g.addColorStop(0.07, rgba(P.seaFar)); g.addColorStop(0.55, rgba(P.seaMid)); g.addColorStop(1, rgba(P.seaNear));
    ctx.fillStyle = g; ctx.fill(wp);

    ctx.save(); ctx.clip(wp);
    // the sun's path on the water
    ctx.save(); ctx.translate(sx, hy); ctx.scale(1, 1.9);
    g = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.17 * H); g.addColorStop(0, rgba(P.sun, 0.5)); g.addColorStop(0.5, rgba(P.haze, 0.16)); g.addColorStop(1, rgba(P.haze, 0));
    ctx.fillStyle = g; ctx.fillRect(-0.2 * H, 0, 0.4 * H, 0.2 * H); ctx.restore();

    // swells travelling in to shore
    const M = 9;
    ctx.lineJoin = "round";
    for (let i = 0; i < M; i++) {
      const u = (i / M + t * 0.02) % 1, p = Math.pow(u, 1.9), y0 = hy + (sy - hy) * p;
      const amp = (0.0015 + 0.0055 * p) * H, k1 = 5 + i * 0.7, ph = i * 1.7 + t * (0.35 + 0.25 * p);
      const a = smooth(0, 0.08, u) * (0.1 + 0.28 * p) * (1 - smooth(0.9, 1, u)), lw = (0.7 + 3.4 * p) * S;
      const path = new Path2D();
      for (let x = -10, first = true; x <= W + 10; x += 14, first = false) {
        const y = y0 + amp * Math.sin((x / W) * k1 * TAU + ph) + amp * 0.5 * Math.sin((x / W) * k1 * 2.1 * TAU - ph * 1.3);
        if (first) path.moveTo(x, y); else path.lineTo(x, y);
      }
      ctx.lineWidth = lw * 3; ctx.strokeStyle = rgba([0, 38, 66], a * 0.55); ctx.save(); ctx.translate(0, lw * 1.6); ctx.stroke(path); ctx.restore();
      ctx.lineWidth = lw; ctx.strokeStyle = rgba(mix(P.foam, P.haze, 0.35), a); ctx.stroke(path);
      const br = smooth(0.78, 0.95, u) * (1 - smooth(0.97, 1, u)) * 0.6;
      if (br > 0.02) { ctx.setLineDash([34 * S, 20 * S, 12 * S, 26 * S]); ctx.lineDashOffset = -t * 22 * S + i * 40; ctx.lineWidth = lw * 1.5; ctx.strokeStyle = rgba(P.foam, br); ctx.stroke(path); ctx.setLineDash([]); }
    }

    // sun glitter + a few sparkles elsewhere
    ctx.globalCompositeOperation = "lighter";
    for (const q of glints) {
      const p = Math.pow(q.u, 1.6), y = hy + (sy - hy) * p, x = sx + q.dx * (0.02 + 0.16 * p) * W + Math.sin(t * 0.7 + q.ph) * 3 * S;
      const a = Math.pow(Math.max(0, Math.sin(t * q.sp + q.ph)), 4) * (0.9 - 0.35 * p);
      if (a < 0.02) continue;
      const w = (5 + 46 * p) * S * q.k;
      ctx.fillStyle = rgba(P.sun, a); ctx.fillRect(x - w / 2, y, w, (1 + 2.4 * p) * S);
    }
    for (const q of sparks) {
      const a = Math.pow(Math.max(0, Math.sin(t * q.sp + q.ph)), 8) * 0.55; if (a < 0.03) continue;
      const p = Math.pow(q.u, 1.6);
      ctx.fillStyle = rgba(P.foam, a); ctx.fillRect(q.x * W, hy + (sy - hy) * p, q.w * S * (0.4 + p), (1 + p * 1.6) * S);
    }
    ctx.restore();

    // shoreline foam
    const line = new Path2D();
    for (let x = -12; x <= W + 12; x += 10) { const y = edgeY(x, t); if (x < 0) line.moveTo(x, y); else line.lineTo(x, y); }
    ctx.lineJoin = "round";
    ctx.lineWidth = 4.5 * S; ctx.strokeStyle = rgba(P.wet, 0.3); ctx.save(); ctx.translate(0, 5 * S); ctx.stroke(line); ctx.restore();
    ctx.lineWidth = 15 * S; ctx.strokeStyle = rgba(P.foam, 0.08); ctx.stroke(line);
    ctx.lineWidth = 7 * S; ctx.strokeStyle = rgba(P.foam, 0.2); ctx.stroke(line);
    ctx.lineWidth = 3 * S; ctx.strokeStyle = rgba(P.foam, 0.75); ctx.stroke(line);
    ctx.setLineDash([40 * S, 14 * S, 10 * S, 22 * S]); ctx.lineDashOffset = -t * 6 * S; ctx.lineWidth = 2 * S; ctx.strokeStyle = rgba(P.foam, 0.35);
    ctx.save(); ctx.translate(0, -11 * S - 4 * S * Math.sin(t * 0.55)); ctx.stroke(line); ctx.restore(); ctx.setLineDash([]);
  }

  /* ---------------- birds ---------------- */
  const birds = [];
  const flap = (b, t) => {
    const env = smooth(b.kind === "pelican" ? -0.2 : -0.5, b.kind === "pelican" ? 0.3 : 0.2, Math.sin((t * TAU) / b.bout + b.bph));
    const beat = Math.sin(t * TAU * b.f + b.ph) + 0.25 * Math.sin(t * TAU * 2 * b.f + b.ph * 2);
    return env * beat * 0.9 + (1 - env) * (0.1 + 0.04 * Math.sin(t * 1.3 + b.ph));
  };
  function wing(L, thE, thT, bend, chord) {
    const E = { x: 0.46 * L, y: (-bend - 0.3 * thE) * L }, T = { x: L * (1 - 0.14 * Math.abs(thT)), y: (0.1 - 0.72 * thT) * L };
    const C = { x: 2 * E.x - T.x / 2, y: 2 * E.y - T.y / 2 }, N = 10, lead = [], trail = [];
    for (let i = 0; i <= N; i++) {
      const s = i / N, a = (1 - s) * (1 - s), b = 2 * s * (1 - s), c = s * s;
      const px = b * C.x + c * T.x, py = b * C.y + c * T.y;
      let tx = 2 * (1 - s) * C.x + 2 * s * (T.x - C.x), ty = 2 * (1 - s) * C.y + 2 * s * (T.y - C.y);
      const len = Math.hypot(tx, ty) || 1; tx /= len; ty /= len;
      const ch = chord * L * (Math.pow(1 - s, 0.85) * 0.9 + 0.04);
      lead.push([px, py]); trail.push([px - ty * ch, py + tx * ch]);
    }
    ctx.beginPath(); lead.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    for (let i = trail.length - 1; i >= 0; i--) ctx.lineTo(trail[i][0], trail[i][1]);
    ctx.closePath(); ctx.fill();
  }
  function drawBird(b, t, P) {
    const L = b.span / 2, th = flap(b, t), thT = flap(b, t - 0.07), pel = b.kind === "pelican";
    const bob = Math.sin(t * 0.9 + b.bobPh) * 5 * S;
    ctx.save(); ctx.translate(b.x, b.y + bob);
    ctx.fillStyle = rgba(P.bird, clamp(0.55 + b.span / (90 * S), 0.55, 0.92));
    wing(L, th, thT, pel ? 0.04 : 0.14, pel ? 0.2 : 0.27);
    ctx.save(); ctx.scale(-1, 1); wing(L, th, thT, pel ? 0.04 : 0.14, pel ? 0.2 : 0.27); ctx.restore();
    ctx.beginPath(); ctx.ellipse(0, 0.05 * L, (pel ? 0.2 : 0.16) * L, 0.09 * L, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(b.dir * 0.17 * L, 0.0, (pel ? 0.07 : 0.05) * L, 0, TAU); ctx.fill();
    if (pel) { // long bill with a pouch
      ctx.beginPath(); ctx.moveTo(b.dir * 0.2 * L, -0.03 * L); ctx.lineTo(b.dir * 0.66 * L, 0.05 * L); ctx.lineTo(b.dir * 0.2 * L, 0.1 * L); ctx.closePath(); ctx.fill();
    }
    ctx.beginPath(); ctx.moveTo(-b.dir * 0.14 * L, 0.06 * L); ctx.lineTo(-b.dir * 0.34 * L, 0.12 * L); ctx.lineTo(-b.dir * 0.14 * L, 0.12 * L); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function spawnGulls(initial) {
    const n = 1 + Math.floor(Math.random() * 3.4), dir = Math.random() < 0.5 ? 1 : -1, low = Math.random() < 0.25;
    const baseY = H * (low ? rnd(0.57, 0.7) : rnd(0.06, 0.46)), sp = rnd(30, 66) * S, x0 = initial ? rnd(0.1, 0.9) * W : dir > 0 ? -80 * S : W + 80 * S;
    for (let i = 0; i < n; i++) birds.push({ kind: "gull", x: x0 - dir * i * rnd(30, 70) * S, y: baseY + rnd(-26, 26) * S * (i ? 1 : 0), dir, vx: rnd(50, 85) * S * Math.sqrt(sp / (30 * S)), span: sp * rnd(0.8, 1.15), ph: rnd(0, TAU), f: rnd(1.6, 2.6), bout: rnd(5, 9), bph: rnd(0, TAU), bobPh: rnd(0, TAU) });
  }
  function spawnPelicans() {
    const n = 3 + Math.floor(Math.random() * 3), dir = Math.random() < 0.5 ? 1 : -1, baseY = H * rnd(0.6, 0.7), sp = rnd(52, 74) * S, ph0 = rnd(0, TAU), vx = rnd(34, 46) * S;
    for (let k = 0; k < n; k++) {
      const row = Math.ceil(k / 2), up = k % 2 ? -1 : 1;
      birds.push({ kind: "pelican", x: (dir > 0 ? -120 * S : W + 120 * S) - dir * row * 62 * S, y: baseY + (k ? up * row * 20 * S : 0), dir, vx, span: sp * rnd(0.92, 1.05), ph: ph0 + k * 0.4, f: 1.15, bout: 11, bph: 1 + k * 0.25, bobPh: rnd(0, TAU) });
    }
  }

  /* ---------------- banner plane ---------------- */
  let plane = null, bannerImg = null;
  function makeBanner(P) {
    const text = String(cfg.BannerText || "WELCOME TO FLORIDA BAY"), h = 60, c = document.createElement("canvas"), g = c.getContext("2d");
    g.font = "700 34px Poppins, Arial, sans-serif"; if ("letterSpacing" in g) g.letterSpacing = "3px";
    const w = Math.ceil(g.measureText(text).width + 70); c.width = w; c.height = h;
    g.font = "700 34px Poppins, Arial, sans-serif"; if ("letterSpacing" in g) g.letterSpacing = "3px";
    g.fillStyle = "#fff6ea"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#d8452f"; g.fillRect(0, 0, w, 5); g.fillRect(0, h - 5, w, 5);
    g.textBaseline = "middle"; g.fillText(text, 35, h / 2 + 2);
    g.globalCompositeOperation = "source-atop"; g.fillStyle = rgba(P.haze, 0.22); g.fillRect(0, 0, w, h);
    return c;
  }
  function spawnPlane(P, forceDir) {
    bannerImg = makeBanner(P);
    const dir = forceDir || (Math.random() < 0.5 ? 1 : -1), bh = 28 * S;
    plane = { dir, x: dir > 0 ? -60 * S : W + 60 * S, y: H * rnd(0.075, 0.115), v: 62 * S, len: 66 * S, bh, bw: bh * (bannerImg.width / bannerImg.height), rope: 40 * S };
  }
  function drawPlane(t, P) {
    const p = plane, d = p.dir, y = p.y + Math.sin(t * 0.8) * 2 * S, col = rgba(P.bird, 0.92);
    // banner, drawn in slices so it ripples
    const lead = p.x - d * (p.len * 0.5 + p.rope), n = 64, sw = p.bw / n;
    for (let i = 0; i < n; i++) {
      const f = i / n, sxp = d > 0 ? (1 - f - 1 / n) * bannerImg.width : f * bannerImg.width;
      const yo = Math.sin(f * 9 - t * 5.5) * (1 + 5 * f) * S + f * 4 * S;
      ctx.drawImage(bannerImg, sxp, 0, bannerImg.width / n + 0.5, bannerImg.height, (d > 0 ? lead - (f + 1 / n) * p.bw : lead + f * p.bw), y + 6 * S + yo, sw + 0.8, p.bh);
    }
    ctx.strokeStyle = rgba(P.bird, 0.6); ctx.lineWidth = Math.max(1, S);
    ctx.beginPath(); ctx.moveTo(p.x - d * p.len * 0.5, y - 0.015 * p.len); ctx.quadraticCurveTo(p.x - d * (p.len * 0.5 + p.rope * 0.5), y + 12 * S, lead, y + 6 * S + p.bh / 2); ctx.stroke();
    // plane (nose to the right, flipped for dir < 0)
    ctx.save(); ctx.translate(p.x, y); ctx.scale(d * p.len, p.len); ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 0.014;
    ctx.beginPath(); ctx.moveTo(0.5, 0.01); ctx.bezierCurveTo(0.46, -0.07, 0.2, -0.09, -0.05, -0.07); ctx.lineTo(-0.46, -0.025); ctx.lineTo(-0.47, 0.015); ctx.bezierCurveTo(-0.2, 0.06, 0.25, 0.08, 0.5, 0.01); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-0.4, -0.03); ctx.lineTo(-0.5, -0.17); ctx.lineTo(-0.455, -0.17); ctx.lineTo(-0.33, -0.05); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-0.42, -0.02, 0.07, 0.012, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0.06, -0.15, 0.25, 0.014, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0.15, -0.14); ctx.lineTo(0.1, -0.07); ctx.moveTo(-0.03, -0.14); ctx.lineTo(0, -0.07); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.14, 0.05); ctx.lineTo(0.16, 0.12); ctx.stroke(); ctx.beginPath(); ctx.arc(0.16, 0.125, 0.03, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.22 + 0.1 * Math.sin(t * 40); ctx.beginPath(); ctx.ellipse(0.51, 0, 0.012, 0.09, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  /* ---------------- main loop ---------------- */
  let T = 0, last = performance.now(), acc = 0, nextGull = 6, nextPel = 26, nextPlane = 12, needDraw = true;
  const sunCols = (d) => ({
    "--halo-a": rgba(mix([255, 214, 140], [255, 150, 92], d), 0.5), "--halo-b": rgba(mix([255, 190, 110], [255, 120, 80], d), 0.16),
    "--core": rgba(mix([255, 243, 200], [255, 214, 160], d)), "--edge": rgba(mix([255, 217, 138], [255, 160, 96], d)), "--glow": rgba(mix([255, 226, 160], [255, 140, 80], d), 0.7),
  });
  function applyDusk(d) {
    skyB.style.opacity = d; cloudsB.style.opacity = d; if (isleB) isleB.style.opacity = d;
    sunEl.style.transform = `translate(${vw * 0.462}px, ${lerp(vh * 0.55 - vh * 0.27, vh * 0.55 - vh * 0.03, d)}px)`;
    const v = sunCols(d); for (const k in v) sunEl.style.setProperty(k, v[k]);
  }
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) { last = now; return; }
    const dt = Math.min((now - last) / 1000, 0.25); last = now; acc += dt;
    if (acc < 1 / 30) return;
    const step = Math.min(acc, 0.1); acc = 0;
    const live = fx.waves || fx.birds || fx.plane;
    const moving = Math.abs(duskTarget - dusk) > 0.0005;
    if (!live && !moving && !needDraw) return;
    T += step; needDraw = false;
    if (moving) dusk += (duskTarget - dusk) * (1 - Math.exp(-step / 1.6));
    if (Math.abs(dusk - lastDrawDusk) > 0.0008) { applyDusk(dusk); lastDrawDusk = dusk; }
    const P = pal(dusk);
    ctx.clearRect(0, 0, W, H);
    drawSea(fx.waves ? T : 3.1, P);
    if (fx.birds) {
      if (T > nextGull) { spawnGulls(false); nextGull = T + rnd(6, 12); }
      if (T > nextPel) { spawnPelicans(); nextPel = T + rnd(45, 80); }
      for (let i = birds.length - 1; i >= 0; i--) {
        const b = birds[i]; b.x += b.dir * b.vx * step;
        if ((b.dir > 0 && b.x > W + 160 * S) || (b.dir < 0 && b.x < -160 * S)) { birds.splice(i, 1); continue; }
        drawBird(b, T, P);
      }
    }
    if (fx.plane) {
      if (!plane && T > nextPlane) spawnPlane(P);
      if (plane) {
        plane.x += plane.dir * plane.v * step; drawPlane(T, P);
        if ((plane.dir > 0 && plane.x - plane.len / 2 - plane.rope - plane.bw > W) || (plane.dir < 0 && plane.x + plane.len / 2 + plane.rope + plane.bw < 0)) { plane = null; nextPlane = T + rnd(55, 85); }
      }
    }
  }

  function build() { layout(); buildClouds(); buildFar(); buildPalms(); lastDrawDusk = -1; needDraw = true; birds.length = 0; if (fx.birds) { spawnGulls(true); spawnGulls(true); spawnGulls(true); } }
  let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(build, 250); });

  window.FBScene = {
    spawn(kind, dir) { if (kind === "plane") spawnPlane(pal(dusk), dir); else if (kind === "pelicans") spawnPelicans(); else spawnGulls(false); },
    setProgress(p) { progress = clamp(p, 0, 1); duskTarget = fx.sunset ? 0.18 + 0.82 * progress : 0.5; },
  };
  duskTarget = dusk = fx.sunset ? 0.18 : 0.5;
  build();
  requestAnimationFrame(frame);
})();