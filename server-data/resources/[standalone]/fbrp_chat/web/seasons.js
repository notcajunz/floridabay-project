(() => {
  'use strict';

  const ART = {
    leaf: (c) => `<svg viewBox="0 0 64 64"><path fill="${c}" d="M32 4l5 12 9-6-2 12 12-2-6 9 10 5-12 4 5 9-12-2 1 10-10-7-10 7 1-10-12 2 5-9-12-4 10-5-6-9 12 2-2-12 9 6z"/><path d="M32 22v38" stroke="#5a2e0c" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>`,
    oak: (c) => `<svg viewBox="0 0 64 64"><path fill="${c}" d="M32 6c4 4 2 8 6 9s7-3 9 1-3 6 0 9 8 1 8 5-6 4-6 8 5 6 2 9-7-1-10 2-3 9-9 9-6-6-9-9-8 1-10-2 2-5 2-9-6-4-6-8 5-2 8-5-2-5 0-9 5 0 9-1 2-5 6-9z"/><path d="M32 20v40" stroke="#4a2a10" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>`,
    pumpkin: () => `<svg viewBox="0 0 64 64"><path d="M32 14c0-5 3-8 7-9" stroke="#4d7c0f" stroke-width="4" fill="none" stroke-linecap="round"/><ellipse cx="20" cy="38" rx="14" ry="19" fill="#ea580c"/><ellipse cx="44" cy="38" rx="14" ry="19" fill="#ea580c"/><ellipse cx="32" cy="38" rx="13" ry="21" fill="#f97316"/><path fill="#1a0b02" d="M20 32l6-6 2 7zM44 32l-6-6-2 7zM20 44c6 6 18 6 24 0l-4 1-2 3-3-3-3 3-3-3-3 3-2-3z"/></svg>`,
    ghost: () => `<svg viewBox="0 0 64 64"><path fill="#f5f3ff" d="M14 58V28a18 18 0 0 1 36 0v30l-6-5-6 5-6-5-6 5-6-5z"/><circle cx="25" cy="28" r="3.5" fill="#1a1028"/><circle cx="39" cy="28" r="3.5" fill="#1a1028"/></svg>`,
    turkey: () => `<svg viewBox="0 0 64 64"><g stroke-linecap="round" stroke-width="7" fill="none"><path d="M32 40L14 18" stroke="#dc2626"/><path d="M32 40L24 10" stroke="#f59e0b"/><path d="M32 40V8" stroke="#ea580c"/><path d="M32 40l8-30" stroke="#f59e0b"/><path d="M32 40l18-22" stroke="#dc2626"/></g><circle cx="32" cy="42" r="12" fill="#7c4a1e"/><circle cx="32" cy="32" r="6" fill="#8b5a2b"/><path d="M32 33l3 2-3 1z" fill="#facc15"/><circle cx="30" cy="31" r="1.2" fill="#111"/></svg>`,
    flake: (c) => {
      const arm = '<path d="M32 4v56"/><path d="M32 14l-6-6M32 14l6-6M32 50l-6 6M32 50l6 6"/>';
      return `<svg viewBox="0 0 64 64" stroke="${c}" stroke-width="3.5" stroke-linecap="round" fill="none"><g>${arm}</g><g transform="rotate(60 32 32)">${arm}</g><g transform="rotate(120 32 32)">${arm}</g></svg>`;
    },
    tree: () => `<svg viewBox="0 0 64 64"><path fill="#16a34a" d="M32 6l14 18h-7l12 15h-8l12 15H9l12-15h-8l12-15h-7z"/><rect x="28" y="54" width="8" height="8" fill="#7c4a1e"/><circle cx="32" cy="6" r="4" fill="#facc15"/><circle cx="26" cy="30" r="2.5" fill="#ef4444"/><circle cx="38" cy="40" r="2.5" fill="#ef4444"/><circle cx="24" cy="47" r="2.5" fill="#facc15"/><circle cx="40" cy="25" r="2" fill="#facc15"/></svg>`,
    heart: (c) => `<svg viewBox="0 0 64 64"><path fill="${c}" d="M32 56S6 40 6 22a13 13 0 0 1 26-4 13 13 0 0 1 26 4c0 18-26 34-26 34z"/></svg>`,
    blossom: (c) => `<svg viewBox="0 0 64 64">${[0, 72, 144, 216, 288].map((r) => `<ellipse cx="32" cy="16" rx="9" ry="13" fill="${c}" transform="rotate(${r} 32 32)"/>`).join('')}<circle cx="32" cy="32" r="6" fill="#facc15"/></svg>`,
    sun: (c) => `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="12" fill="${c}"/><g stroke="${c}" stroke-width="4" stroke-linecap="round">${[0, 45, 90, 135, 180, 225, 270, 315].map((r) => `<path d="M32 6v8" transform="rotate(${r} 32 32)"/>`).join('')}</g></svg>`,
    star: (c) => `<svg viewBox="0 0 64 64"><path fill="${c}" d="M32 4l8 18 20 2-15 13 4 20-17-10-17 10 4-20L4 24l20-2z"/><path fill="#ef4444" d="M32 18l4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1z"/></svg>`,
    dot: (c) => `<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="${c}"/></svg>`,
  };

  const SEASONS = {
    autumn: { icon: ART.leaf('#f59e0b'), fx: [['leaf', '#f59e0b', 13], ['oak', '#dc2626', 11], ['leaf', '#b45309', 10]] },
    halloween: { icon: ART.pumpkin(), up: true, fx: [['ghost', '', 14], ['dot', '#a855f7', 4]] },
    thanksgiving: { icon: ART.turkey(), fx: [['oak', '#b45309', 11], ['leaf', '#d97706', 10]] },
    christmas: { icon: ART.tree(), fx: [['flake', '#ffffff', 10], ['dot', '#ffffff', 4]] },
    winter: { icon: ART.flake('#7dd3fc'), fx: [['flake', '#e0f2fe', 9], ['dot', '#ffffff', 3]] },
    valentine: { icon: ART.heart('#f472b6'), up: true, fx: [['heart', '#f472b6', 10], ['heart', '#fda4af', 8]] },
    spring: { icon: ART.blossom('#f9a8d4'), fx: [['blossom', '#fbcfe8', 10], ['dot', '#ffffff', 3]] },
    july4: { icon: ART.star('#60a5fa'), fx: [['star', '#ffffff', 9], ['dot', '#ef4444', 4], ['dot', '#60a5fa', 4]] },
    summer: { icon: ART.sun('#facc15'), up: true, fx: [['dot', '#fff7c2', 4], ['dot', '#fde68a', 3]] },
  };

  const mmdd = (d) => (d.getMonth() + 1) * 100 + d.getDate();
  const parse = (s) => { const [m, d] = String(s || '').split('-').map(Number); return (m || 0) * 100 + (d || 0); };
  const inRange = (t, f, to) => (f <= to ? t >= f && t <= to : t >= f || t <= to);

  function resolve(cfg) {
    const want = (cfg && cfg.season) || 'off';
    if (want !== 'auto') return SEASONS[want] ? want : null;
    const today = mmdd(new Date());
    for (const s of (cfg.seasons || [])) if (SEASONS[s.theme] && inRange(today, parse(s.from), parse(s.to))) return s.theme;
    return null;
  }

  function particles(t) {
    let out = '';
    let n = 0;
    t.fx.forEach(([art, col, size]) => {
      for (let i = 0; i < 4; i++) {
        n++;
        const left = (n * 37) % 100;
        const dur = 7 + ((n * 13) % 6);
        const delay = -((n * 7) % 10);
        const dx = ((n * 29) % 60) - 30;
        const r = ((n * 53) % 540) - 270;
        out += `<span class="${t.up ? 'up' : ''}" style="left:${left}%;width:${size}px;height:${size}px;animation-duration:${dur}s;animation-delay:${delay}s;--dx:${dx}px;--r:${r}deg">${ART[art](col)}</span>`;
      }
    });
    return out;
  }

  window.ChatSeason = {
    apply(cfg, fx, iconSlots) {
      const id = resolve(cfg);
      if (id) document.body.dataset.season = id; else delete document.body.dataset.season;
      const t = id && SEASONS[id];
      fx.innerHTML = t && cfg.seasonParticles !== false ? particles(t) : '';
      iconSlots.forEach((el) => { el.innerHTML = t ? t.icon : ''; });
      return id;
    },
  };
})();
