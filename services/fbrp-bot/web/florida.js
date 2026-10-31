/* Florida Bay Roleplay - 3D layer: perspective Gulf ocean, card tilt, hero parallax. */
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const hero = document.querySelector(".hero");
  let heroFrame = null;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

  /* ---------- 3D ocean: sine-sum height field, perspective projected ---------- */
  function makeOcean(canvas, { sun = false, alpha = 1 } = {}) {
    const ctx = canvas.getContext("2d");
    const ROWS = 44;
    const COLS = 84;
    let w = 0;
    let h = 0;
    let visible = true;

    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const wave = (x, z, t) =>
      Math.sin(x * 0.9 + t * 0.9 + z * 0.35) * 0.1 +
      Math.sin(x * 0.45 - t * 0.6 + z * 0.8) * 0.09 +
      Math.sin(z * 1.7 + t * 1.3) * 0.045;

    const draw = (time) => {
      const t = time / 1000;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2 + pointer.x * 26;
      const focal = Math.max(w, 900) * 0.62;
      const camH = 1.35 + pointer.y * 0.1;
      if (sun) {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, "#0f6b73");
        g.addColorStop(0.28, "#06404a");
        g.addColorStop(1, "#021318");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        const glow = ctx.createRadialGradient(cx, 0, 0, cx, 0, h * 0.9);
        glow.addColorStop(0, "rgba(255,150,70,.55)");
        glow.addColorStop(1, "rgba(255,120,70,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.lineWidth = 1;
      for (let r = 0; r < ROWS; r++) {
        const depth = r / (ROWS - 1);
        const z = 1.15 + Math.pow(depth, 2.1) * 34; // near rows are dense in screen space
        const k = focal / z;
        const y0 = (camH * k) * 0.42 - 0; // horizon at the canvas top
        const span = (w / k) * 0.62 + 2.4;
        const fade = 1 - depth;
        ctx.beginPath();
        for (let c = 0; c <= COLS; c++) {
          const x = (c / COLS - 0.5) * 2 * span;
          const sx = cx + x * k;
          const sy = y0 - wave(x, z, t) * k;
          if (c === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        }
        const a = (0.1 + 0.55 * Math.pow(1 - depth, 1.4)) * alpha;
        ctx.strokeStyle = depth > 0.82 ? `rgba(255,170,100,${a * 0.9})` : `rgba(70,235,215,${a})`;
        ctx.stroke();
        if (sun && depth < 0.96) {
          // glitter column under the sun
          const reach = (0.9 + depth * 7) * 0.22;
          ctx.fillStyle = `rgba(255,205,110,${0.7 * (0.25 + depth)})`;
          for (let c = 0; c < 9; c++) {
            const x = ((c / 8) - 0.5) * 2 * reach + (pointer.x * 0.0);
            const flick = Math.sin(t * 2.4 + r * 3.7 + c * 5.1);
            if (flick < 0.15) continue;
            const sx = cx + x * k;
            const sy = y0 - wave(x, z, t) * k;
            ctx.fillRect(sx - (3 + 18 * (1 - depth)) * flick, sy, (6 + 36 * (1 - depth)) * flick, 1.5);
          }
        }
        void fade;
      }
    };

    resize();
    addEventListener("resize", resize);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; }).observe(canvas);
    }
    if (reduce) { draw(4000); return; }
    const loop = (time) => {
      if (visible && !document.hidden) draw(time);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /* ---------- hero: place the horizon, mount the ocean, parallax ---------- */
  function setupHero() {
    const scene = hero.querySelector(".hero-scene");
    const sunNode = hero.querySelector(".sun");
    if (!scene || !sunNode) return;
    const canvas = document.createElement("canvas");
    canvas.className = "ocean-3d";
    canvas.setAttribute("aria-hidden", "true");
    hero.insertBefore(canvas, scene);

    const HORIZON = 0.78;
    let shift = 0;
    const place = () => {
      scene.style.transform = "";
      const heroBox = hero.getBoundingClientRect();
      const sunBox = sunNode.getBoundingClientRect();
      const horizon = sunBox.top + sunBox.height / 2 - heroBox.top; // sun centre sits on the horizon
      shift = heroBox.height * HORIZON - horizon;
      canvas.style.top = `${heroBox.height * HORIZON}px`;
      canvas.style.height = `${heroBox.height * (1 - HORIZON)}px`;
      apply();
    };
    const apply = () => {
      const y = scrollY;
      scene.style.transform = `translate3d(${pointer.x * -14}px, ${shift + y * 0.12 + pointer.y * -8}px, 0) scale(1.03)`;
      const content = hero.querySelector(".hero-content");
      if (content && !reduce) {
        content.style.transform = `perspective(1100px) rotateY(${pointer.x * 3.2}deg) rotateX(${pointer.y * -2.2}deg) translate3d(0, ${y * -0.06}px, 0)`;
      }
    };
    place();
    addEventListener("resize", place);
    addEventListener("load", place);
    heroFrame = apply;
    makeOcean(canvas, { sun: true });
    if (!reduce) addEventListener("scroll", apply, { passive: true });
  }

  /* ---------- everything else: faint fixed ocean behind the page ---------- */
  function setupBackdrop() {
    const canvas = document.createElement("canvas");
    canvas.className = "ocean-3d fixed";
    canvas.setAttribute("aria-hidden", "true");
    document.body.prepend(canvas);
    makeOcean(canvas, { alpha: 0.8 });
  }

  /* ---------- card tilt ---------- */
  const TILT = ".tile, .dept, .stat-tile, .step, .org-card, .product, .shop-card, .auth-card, .login-card, .region-card, .review-card";
  function setupTilt() {
    if (reduce || !fine) return;
    let current = null;
    document.addEventListener("pointermove", (event) => {
      pointer.tx = event.clientX / innerWidth - 0.5;
      pointer.ty = event.clientY / innerHeight - 0.5;
      const node = event.target.closest && event.target.closest(TILT);
      if (current && current !== node) release(current);
      if (!node) { current = null; return; }
      current = node;
      node.classList.add("tilt-ready", "tilting");
      node.classList.remove("tilt-reset");
      const box = node.getBoundingClientRect();
      const px = (event.clientX - box.left) / box.width - 0.5;
      const py = (event.clientY - box.top) / box.height - 0.5;
      const strength = Math.min(1, 260 / Math.max(box.width, box.height)) * 9;
      node.style.setProperty("--ry", `${(px * strength).toFixed(2)}deg`);
      node.style.setProperty("--rx", `${(-py * strength).toFixed(2)}deg`);
      node.style.setProperty("--lift", "-4px");
      node.style.setProperty("--sx", `${(-px * 22).toFixed(1)}px`);
      node.style.setProperty("--sy", `${(-py * 12).toFixed(1)}px`);
    }, { passive: true });
    document.documentElement.addEventListener("mouseleave", () => { if (current) release(current); current = null; });
    function release(node) {
      node.classList.add("tilt-reset");
      node.classList.remove("tilting");
      setTimeout(() => node.classList.remove("tilt-reset"), 650);
    }
  }

  /* ---------- smooth pointer for parallax ---------- */
  function setupPointer() {
    if (reduce || !fine) return;
    const step = () => {
      pointer.x += (pointer.tx - pointer.x) * 0.06;
      pointer.y += (pointer.ty - pointer.y) * 0.06;
      if (heroFrame) heroFrame();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  if (hero) setupHero(); else setupBackdrop();
  setupTilt();
  setupPointer();
})();
