(() => {
  // runs inside fbrp_core's NUI page as an iframe; callbacks go to fbrp_core as hud_<name>
  const parentName = (() => { try { return window.parent.GetParentResourceName(); } catch (e) { return null; } })();
  const RES = parentName || (typeof GetParentResourceName === 'function' ? GetParentResourceName() : 'fbrp_core');
  const post = (name, data = {}) =>
    fetch(`https://${RES}/hud_${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(data),
    }).catch(() => {});

  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const NS = 'http://www.w3.org/2000/svg';

  let settings = {
    speedUnit: 'mph', showCompass: true, showStatus: true, minimapOnFoot: true, theme: 'modern',
    scale: 1, statusStyle: 'outline', vehicleStyle: 'ring', fuelStyle: 'gauge', moneyMode: 'off', positions: {},
    showPrio: true, prioColor: '', prioSize: 0,
    colors: {},
    panelStyle: 'auto', panelBars: 'smooth', panelColor: '', panelOpacity: -1,
    panelShow: { engine: true, fuel: true, lamps: true, odo: true },
    addonHidden: {},
    sfxVolume: 0.5,
  };
  const PANEL_DEFAULTS = {
    panelStyle: 'auto', panelBars: 'smooth', panelColor: '', panelOpacity: -1,
    panelShow: { engine: true, fuel: true, lamps: true, odo: true },
  };
  let draft = {};
  let editing = false;
  let lastStatus = {};
  let lastVehicle = false;

  // ---------------------------------------------------------------- AOP & priority panel
  const prioEl = $('prio');
  const root = document.documentElement;
  let prioCfg = { size: 16, colour: '#D6DA1E', text: {}, colours: {} };
  let prioState = null;
  const PRIO_TEXT = {
    AOPLabel: 'AOP:', HeadtagLabel: 'Headtag', GangtagLabel: 'Gangtag', JobLabel: 'Job',
    Available: 'Available', InProgress: 'In Progress', OnHold: 'On Hold', Peacetime: '(PT)',
    MinutesSuffix: 'm', NotAvailable: 'N/A', OffDuty: 'Off Duty',
  };
  const PRIO_COLOURS = {
    ServerName: '--p-server', Time: '--p-time', AOPValue: '--p-aop', TagValue: '--p-tag', Available: '--p-available',
    Cooldown: '--p-cooldown', InProgress: '--p-progress', OnHold: '--p-hold', Peacetime: '--p-pt', NotAvailable: '--p-na',
  };
  const T = (k) => (prioCfg.text && prioCfg.text[k]) || PRIO_TEXT[k];
  const okColour = (c) => (typeof c === 'string' && CSS.supports('color', c) ? c : null);

  function applyPrioConfig(cfg) {
    prioCfg = { ...prioCfg, ...cfg };
    Object.entries(PRIO_COLOURS).forEach(([k, v]) => {
      const c = okColour((cfg.colours || {})[k]);
      if (c) root.style.setProperty(v, c);
    });
    if (cfg.font) root.style.setProperty('--p-font', `"${cfg.font}"`);
    $('prioAopLabel').textContent = T('AOPLabel');
    $('prioHeadLabel').textContent = T('HeadtagLabel');
    $('prioGangLabel').textContent = T('GangtagLabel');
    $('prioJobLabel').textContent = T('JobLabel');
    const name = (cfg.server || '') + (cfg.lobby ? ` (${cfg.lobby})` : '');
    $('prioServer').textContent = name;
    $('prioServer').classList.toggle('is-off', !name);
    applyPrioLook(settingsOpen() || editing ? draft : settings);
    if (prioState) renderPrio(prioState);
  }

  function applyPrioLook(s) {
    if (!prioEl) return;
    const colour = okColour(s.prioColor) || prioCfg.colour || '#D6DA1E';
    const size = Number(s.prioSize) > 0 ? Number(s.prioSize) : (prioCfg.size || 16);
    root.style.setProperty('--p-primary', colour);
    root.style.setProperty('--p-size', `${clamp(size, 10, 30)}px`);
    prioEl.classList.toggle('is-off', s.showPrio === false && !editing);
    stackUnderPrio();
  }

  function fillPrioForm() {
    const colour = okColour(draft.prioColor) || prioCfg.colour || '#D6DA1E';
    const size = Number(draft.prioSize) > 0 ? Number(draft.prioSize) : (prioCfg.size || 16);
    $('optPrio').checked = draft.showPrio !== false;
    $('prioColorDot').style.background = colour;
    $('prioColor').value = /^#[0-9a-f]{6}$/i.test(colour) ? colour : '#d6da1e';
    $('prioSize').value = size;
    $('prioSizeOut').textContent = `${size}px`;
  }

  function prioStatus(z, peacetime) {
    let text; let cls;
    if (z.status === 'active') { text = T('InProgress'); cls = 'in-progress'; }
    else if (z.status === 'hold') { text = T('OnHold'); cls = 'on-hold'; }
    else if (z.status === 'cooldown' && Number(z.remaining) > 0) { text = `${Math.ceil(Number(z.remaining))}${T('MinutesSuffix')}`; cls = 'cooldown'; }
    else { text = T('Available'); cls = 'available'; }
    const span = document.createElement('span');
    span.className = `prio-status ${cls}`;
    span.textContent = text;
    if (peacetime && z.status === 'hold') {
      const pt = document.createElement('span');
      pt.className = 'prio-pt';
      pt.textContent = ` ${T('Peacetime')}`;
      span.append(pt);
    }
    return span;
  }

  function setTag(node, value, plain) {
    node.className = 'prio-tag';
    node.style.color = '';
    if (!value || (typeof value === 'object' && !value.label)) {
      node.textContent = plain ? T('OffDuty') : T('NotAvailable');
      if (!plain) node.classList.add('is-na');
      return;
    }
    node.textContent = typeof value === 'object' ? value.label : value;
    const c = typeof value === 'object' && okColour(value.color);
    if (c) node.style.color = c;
  }

  function renderPrio(d) {
    prioState = d;
    $('prioAop').textContent = d.aop || '';
    $('prioList').replaceChildren(...(d.zones || []).map((z) => {
      const row = document.createElement('h5');
      const label = document.createElement('span');
      label.className = 'prio-label';
      label.textContent = `${z.label}:`;
      row.append(label, ' ', prioStatus(z, d.peacetime));
      return row;
    }));
    setTag($('prioHead'), d.headtag);
    setTag($('prioGang'), d.gangtag);
    setTag($('prioJob'), d.job, true);
    stackUnderPrio();
  }

  function prioClock() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    $('prioTime').textContent = `${pad(now.getMonth() + 1)}/${pad(now.getDate())}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }
  prioClock();
  setInterval(prioClock, 5000);

  // the ID / time chips and the job card stack under the panel when it sits on the right
  function stackUnderPrio() {
    if (!prioEl) return;
    requestAnimationFrame(() => {
      const r = prioEl.getBoundingClientRect();
      const shown = !prioEl.classList.contains('is-off') && r.height > 0;
      const top = shown && r.left > window.innerWidth * 0.45 ? (r.bottom / window.innerHeight) * 100 + 1 : 2;
      root.style.setProperty('--stack-top', `${top.toFixed(2)}vh`);
    });
  }
  if (window.ResizeObserver && prioEl) new ResizeObserver(stackUnderPrio).observe(prioEl);
  window.addEventListener('resize', stackUnderPrio);

  const ICONS = {
    health:  { solid: true, d: 'M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 5.3 3.1 1.7-1.9 3.2-3.1 5.3-3.1 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z' },
    armor:   { solid: true, d: 'M12 2.5 4 5.5v6c0 5 3.4 8.8 8 10 4.6-1.2 8-5 8-10v-6z' },
    hunger:  { d: 'M7 3v18M4.5 3v5a2.5 2.5 0 0 0 5 0V3M17.5 21V3c-2.2 1.4-3.5 4.2-3.5 7.5V13h3.5' },
    thirst:  { solid: true, d: 'M12 3s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11z' },
    stress:  { solid: true, d: 'M13 2 4 14h7l-1 8 9-12h-7z' },
    stamina: { d: 'M4 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M5 16h6' },
    oxygen:  { d: 'M9 15a4 4 0 1 0 0.01 0M16 7a2.5 2.5 0 1 0 0.01 0M17 15.5a1.5 1.5 0 1 0 0.01 0' },
    voice:   { d: 'M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM6 10.5a6 6 0 0 0 12 0' },
  };

  const STATS = [
    { key: 'voice',   label: 'Voice',   color: '#38BDF8' },
    { key: 'health',  label: 'Health',  color: '#F2557A', critical: 20 },
    { key: 'armor',   label: 'Armor',   color: '#7CC6FF', hideWhen: (v) => !v },
    { key: 'hunger',  label: 'Hunger',  color: '#F5B14C', critical: 15, hideWhen: (v) => v == null },
    { key: 'thirst',  label: 'Thirst',  color: '#4FD1E8', critical: 15, hideWhen: (v) => v == null },
    { key: 'stress',  label: 'Stress',  color: '#A78BFA', hideWhen: (v) => v == null || v < 1 },
    { key: 'stamina', label: 'Stamina', color: '#9EE3C4', hideWhen: (v) => v == null || v >= 99 },
    { key: 'oxygen',  label: 'Oxygen',  color: '#B9E6FF', critical: 25, hideWhen: (v) => v == null },
  ];

  const PALETTES = {
    modern: {
      voice: '#38BDF8', health: '#EF4444', armor: '#3B82F6', hunger: '#F59E0B',
      thirst: '#06B6D4', stress: '#A855F7', stamina: '#EAB308', oxygen: '#22C55E',
    },
    violet: {
      voice: '#B44DFF', health: '#E84393', armor: '#00CEC9', hunger: '#FDCB6E',
      thirst: '#74B9FF', stress: '#FF7675', stamina: '#A29BFE', oxygen: '#4568DC',
    },
  };
  const HEX = /^#[0-9a-f]{6}$/i;
  function statColor(key, look) {
    const custom = look && look.colors && look.colors[key];
    if (custom && HEX.test(custom)) return custom;
    const pal = PALETTES[(look && look.theme) || 'modern'];
    return (pal && pal[key]) || STATS.find((s) => s.key === key).color;
  }
  function applyColors(look) {
    STATS.forEach(({ key }) => tiles[key] && tiles[key].el.style.setProperty('--c', statColor(key, look)));
  }

  const SAMPLE_STATUS = { health: 80, armor: 50, hunger: 70, thirst: 60, stress: 20, stamina: 60, oxygen: 90, talking: false, voice: 2 };
  const SAMPLE_VEHICLE = {
    speed: 48, unit: 'mph', rpm: 0.55, gear: '3', maxGear: 6, fuel: 75, engine: 100, lights: 'low', indicators: 0,
    hasBelt: true, belted: true, beltWarn: false, cruise: false, mileage: 1234.5, mileageUnit: 'miles',
  };

  const tiles = {};
  const statusEl = $('status');

  STATS.forEach((s) => {
    const tile = document.createElement('div');
    tile.className = `tile ${s.key}`;
    tile.style.setProperty('--c', s.color);
    const icon = ICONS[s.key];
    tile.title = s.label;
    tile.innerHTML = `
      <div class="fill"></div>
      <svg viewBox="0 0 24 24" class="${icon.solid ? 'solid' : ''}"><path d="${icon.d}"/></svg>
      ${s.key === 'voice' ? '<div class="range"><i></i><i></i><i></i></div><span class="vkey" title="Change voice range"></span>' : '<span class="pct">0%</span>'}
    `;
    statusEl.appendChild(tile);
    tiles[s.key] = { el: tile, fill: tile.querySelector('.fill'), pct: tile.querySelector('.pct') };
  });

  function updateStatus(status) {
    STATS.forEach(({ key, hideWhen, critical }) => {
      const t = tiles[key];
      const v = status[key];

      if (key === 'voice') {
        t.el.classList.toggle('talking', !!status.talking);
        const range = status.voice != null ? clamp(status.voice, 0, 3) / 3 * 100 : 34;
        t.el.style.setProperty('--p', status.talking ? 100 : 0);
        t.el.style.setProperty('--range', range);
        t.el.querySelectorAll('.range i').forEach((dot, i) => dot.classList.toggle('on', status.voice != null && i < status.voice));
        const vkey = t.el.querySelector('.vkey');
        if (vkey && vkey.textContent !== (status.voiceKey || '')) vkey.textContent = status.voiceKey || '';
        if (vkey) vkey.classList.toggle('is-off', !status.voiceKey);
        return;
      }

      const hidden = hideWhen ? hideWhen(v) : false;
      t.el.classList.toggle('is-off', hidden);
      if (hidden) return;

      const pct = clamp(Number(v) || 0, 0, 100);
      t.fill.style.height = `${pct}%`;
      t.el.style.setProperty('--p', pct);
      if (t.pct) t.pct.textContent = `${Math.round(pct)}%`;
      t.el.classList.toggle('is-critical', critical != null && pct <= critical);
    });
  }

  const vehicleEl = $('vehicle');
  const bind = (name) => vehicleEl.querySelectorAll(`[data-bind="${name}"]`);
  const B = {
    speed: bind('speed'), unit: bind('unit'), gear: bind('gear'),
    blinkL: bind('blinkL'), blinkR: bind('blinkR'),
    gearPrev: bind('gearPrev'), gearNext: bind('gearNext'),
  };
  const setText = (list, txt) => list.forEach((n) => {
    if (n.classList.contains('padded')) {
      const lead = '0'.repeat(Math.max(0, 3 - txt.length));
      if (n.dataset.v !== txt) { n.dataset.v = txt; n.innerHTML = `<i class="lead">${lead}</i>${txt}`; }
    } else if (n.textContent !== txt) n.textContent = txt;
  });
  const setClass = (list, cls, on) => list.forEach((n) => n.classList.toggle(cls, on));

  const RING = { cx: 120, cy: 120, r: 98, a0: 135, sweep: 270 };
  const ringPoint = (r, deg) => {
    const t = (deg * Math.PI) / 180;
    return [RING.cx + r * Math.cos(t), RING.cy + r * Math.sin(t)];
  };
  const RPM_STOPS = [[0, [0, 255, 135]], [0.6, [245, 166, 35]], [1, [255, 68, 68]]];
  function rpmColor(f) {
    for (let i = 1; i < RPM_STOPS.length; i++) {
      const [p1, c1] = RPM_STOPS[i];
      const [p0, c0] = RPM_STOPS[i - 1];
      if (f <= p1) {
        const k = (f - p0) / (p1 - p0);
        return `rgb(${c0.map((c, j) => Math.round(c + (c1[j] - c) * k)).join(',')})`;
      }
    }
    return 'rgb(255,68,68)';
  }
  (function buildRing() {
    const segs = $('rpmSegs');
    const N = 72;
    for (let i = 0; i < N; i++) {
      const a = RING.a0 + (RING.sweep * i) / N;
      const b = RING.a0 + (RING.sweep * (i + 1)) / N + 0.4;
      const [x0, y0] = ringPoint(RING.r, a);
      const [x1, y1] = ringPoint(RING.r, b);
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', `M${x0.toFixed(2)} ${y0.toFixed(2)}A${RING.r} ${RING.r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`);
      p.setAttribute('stroke', rpmColor(i / (N - 1)));
      if (i >= N * 0.82) p.setAttribute('class', 'red');
      segs.appendChild(p);
    }
    const ticks = $('ringTicks');
    for (let i = 0; i <= 10; i++) {
      const a = RING.a0 + (RING.sweep * i) / 10;
      const major = i % 5 === 0;
      const [x0, y0] = ringPoint(major ? 84 : 87, a);
      const [x1, y1] = ringPoint(91, a);
      const l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', x0.toFixed(2)); l.setAttribute('y1', y0.toFixed(2));
      l.setAttribute('x2', x1.toFixed(2)); l.setAttribute('y2', y1.toFixed(2));
      if (i >= 9) l.setAttribute('class', 'red');
      else if (major) l.setAttribute('class', 'major');
      ticks.appendChild(l);
    }
  })();

  const MINI_COLS = 8;
  const miniCols = [];
  (function buildMini() {
    const wrap = $('miniRpm');
    for (let i = 0; i < MINI_COLS; i++) {
      const c = document.createElement('i');
      c.style.height = `${14 + i * 7}px`;
      c.style.setProperty('--on', rpmColor(i / (MINI_COLS - 1)));
      wrap.appendChild(c);
      miniCols.push(c);
    }
  })();

  function gearNeighbors(gear, maxGear) {
    if (gear == null) return ['', ''];
    if (gear === 'R') return ['', '1'];
    const g = Number(gear);
    const prev = g <= 1 ? 'R' : String(g - 1);
    const next = maxGear && g >= maxGear ? '' : String(g + 1);
    return [prev, next];
  }

  (function buildTicks() {
    const g = $('ticks');
    for (let i = 0; i <= 20; i++) {
      const major = i % 2 === 0;
      const a = ((150 + i * 12) * Math.PI) / 180;
      const r1 = major ? 84 : 88;
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', 120 + r1 * Math.cos(a));
      line.setAttribute('y1', 120 + r1 * Math.sin(a));
      line.setAttribute('x2', 120 + 92 * Math.cos(a));
      line.setAttribute('y2', 120 + 92 * Math.sin(a));
      if (major) line.setAttribute('class', 'major');
      g.appendChild(line);
    }
  })();

  const DIAL_MAX = { mph: 200, kmh: 300 };
  let dialUnit = null;
  function buildDialLabels(unit) {
    if (dialUnit === unit) return;
    dialUnit = unit;
    const g = $('dialLabels');
    g.innerHTML = '';
    const max = DIAL_MAX[unit] || 200;
    for (let i = 0; i <= 10; i++) {
      const a = ((150 + i * 24) * Math.PI) / 180;
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', 120 + 70 * Math.cos(a));
      t.setAttribute('y', 120 + 70 * Math.sin(a));
      t.textContent = (max / 10) * i;
      g.appendChild(t);
    }
  }

  const SEGMENTS = 24;
  const segs = [];
  (function buildSegments() {
    const wrap = $('rpmSegments');
    for (let i = 0; i < SEGMENTS; i++) {
      const s = document.createElement('i');
      if (i >= SEGMENTS - 4) s.className = 'red';
      wrap.appendChild(s);
      segs.push(s);
    }
  })();

  (function buildFuelTicks() {
    const g = $('fuelTicks');
    for (let i = 0; i <= 4; i++) {
      const a = ((150 + i * 60) * Math.PI) / 180;
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', 50 + 41 * Math.cos(a));
      line.setAttribute('y1', 50 + 41 * Math.sin(a));
      line.setAttribute('x2', 50 + 45 * Math.cos(a));
      line.setAttribute('y2', 50 + 45 * Math.sin(a));
      g.appendChild(line);
    }
  })();

  const fuelEl = {
    root: $('fuelGauge'), arc: $('fuelArc'), needle: $('fuelNeedle'), pct: $('fuelPct'),
  };

  function updateFuelGauge(v) {
    const show = !!v && v.fuel != null;
    fuelEl.root.classList.toggle('is-off', !show);
    if (!show) return;
    const pct = clamp(v.fuel, 0, 100);
    fuelEl.arc.style.strokeDasharray = `${pct} 100`;
    fuelEl.needle.style.transform = `rotate(${150 + (pct / 100) * 240}deg)`;
    fuelEl.pct.textContent = `${Math.round(pct)}%`;
    fuelEl.root.classList.toggle('critical', pct <= 10);
    fuelEl.root.classList.toggle('low', pct > 10 && pct <= 25);
  }

  const el = {
    rpm: $('rpmArc'), needle: $('needle'),
    ringMask: $('rpmMaskArc'), ringMarker: $('rpmMarker'), ringFuel: $('ringFuel'), ringEngine: $('ringEngine'),
    ringFuelIco: $('ringFuelIco'), ringEngineIco: $('ringEngineIco'),
    miniFuel: $('miniFuel'), miniFuelPct: $('miniFuelPct'),
    mgFuel: $('mgFuel'), mgEngine: $('mgEngine'), ringOdo: $('ringOdo'), hazard: $('lampHazard'),
    fuelRow: $('fuelRow'), fuelBar: $('fuelBar'), fuelVal: $('fuelValue'),
    engRow: $('engineRow'), engBar: $('engineBar'), engVal: $('engineValue'),
    belt: $('lampBelt'), cruise: $('lampCruise'), cruiseVal: $('cruiseValue'),
    lights: $('lampLights'), glow: $('lampGlow'), odo: $('odometer'),
  };

  const fmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  let odoKey = '';
  function setOdo(label, value, unit) {
    const key = `${label}|${value}|${unit}`;
    if (key === odoKey) return;
    odoKey = key;
    el.odo.innerHTML = label ? `<span class="odo-label">${label}</span><span class="odo-val"><b>${value}</b><small>${unit}</small></span>` : '';
  }

  function setBar(row, bar, val, value, lowAt, critAt) {
    if (value == null) { row.classList.add('is-off'); return; }
    row.classList.remove('is-off');
    const pct = clamp(value, 0, 100);
    bar.style.width = `${pct}%`;
    val.textContent = Math.round(pct);
    row.classList.toggle('critical', pct <= critAt);
    row.classList.toggle('low', pct > critAt && pct <= lowAt);
  }

  function updateVehicle(v) {
    updateFuelGauge(v);
    vehicleEl.classList.toggle('is-off', !v);
    if (!v) return;

    const unit = v.unit === 'kmh' ? 'kmh' : 'mph';
    setText(B.speed, String(Math.round(v.speed)));
    setText(B.unit, unit === 'kmh' ? 'km/h' : 'mph');

    const rpm = v.rpm == null ? 0 : clamp(v.rpm, 0, 1);
    el.rpm.style.strokeDasharray = `${rpm * 100} 100`;
    el.rpm.classList.toggle('redline', rpm >= 0.85);

    const lit = Math.round(rpm * SEGMENTS);
    segs.forEach((s, i) => s.classList.toggle('on', i < lit));

    const rev = v.rpm == null ? 0 : clamp((v.rpm - 0.2) / 0.8, 0, 1);
    el.ringMask.setAttribute('stroke-dasharray', `${(rev * 100).toFixed(2)} 100`);
    const [mx, my] = ringPoint(RING.r, RING.a0 + rev * RING.sweep);
    el.ringMarker.setAttribute('cx', mx.toFixed(2));
    el.ringMarker.setAttribute('cy', my.toFixed(2));
    el.ringMarker.classList.toggle('is-off', v.rpm == null || rev < 0.02);
    const miniLit = Math.round(rev * MINI_COLS);
    miniCols.forEach((c, i) => c.classList.toggle('on', i < miniLit));

    const fuelPct = v.fuel == null ? null : clamp(v.fuel, 0, 100);
    const engPct = v.engine == null ? null : clamp(v.engine, 0, 100);
    el.ringFuel.style.strokeDasharray = `${fuelPct || 0} 100`;
    el.ringEngine.style.strokeDasharray = `${engPct || 0} 100`;
    el.ringFuel.classList.toggle('low', fuelPct != null && fuelPct <= 25);
    el.ringFuel.classList.toggle('critical', fuelPct != null && fuelPct <= 10);
    el.ringEngine.classList.toggle('low', engPct != null && engPct <= 40);
    el.ringEngine.classList.toggle('critical', engPct != null && engPct <= 20);
    el.ringFuelIco.classList.toggle('critical', fuelPct != null && fuelPct <= 10);
    el.ringEngineIco.classList.toggle('critical', engPct != null && engPct <= 20);
    vehicleEl.classList.toggle('no-fuel', fuelPct == null);
    el.miniFuel.style.height = `${fuelPct || 0}%`;
    [[el.mgFuel, fuelPct, 25, 10], [el.mgEngine, engPct, 40, 20]].forEach(([g, pct, low, crit]) => {
      g.classList.toggle('is-off', pct == null);
      g.querySelector('.mg-fill').style.strokeDasharray = `${pct || 0} 100`;
      g.classList.toggle('critical', pct != null && pct <= crit);
      g.classList.toggle('low', pct != null && pct > crit && pct <= low);
    });
    if (v.altitude != null) el.ringOdo.textContent = `${Math.round(v.altitude)} ${unit === 'kmh' ? 'M' : 'FT'}`;
    else if (v.mileage != null) el.ringOdo.textContent = String(Math.floor(Math.max(0, Number(v.mileage) || 0))).padStart(6, '0');
    else el.ringOdo.textContent = '';
    el.miniFuelPct.textContent = fuelPct == null ? '' : `${Math.round(fuelPct)}%`;

    const [gPrev, gNext] = gearNeighbors(v.gear, v.maxGear);
    setText(B.gearPrev, gPrev);
    setText(B.gearNext, gNext);

    if (vehicleEl.dataset.style === 'dial') {
      buildDialLabels(unit);
      const ratio = clamp(v.speed / DIAL_MAX[unit], 0, 1);
      el.needle.style.transform = `rotate(${150 + ratio * 240}deg)`;
    }

    setClass(B.gear, 'is-off', v.gear == null);
    if (v.gear != null) {
      setText(B.gear, v.gear);
      setClass(B.gear, 'reverse', v.gear === 'R');
    }

    const ind = v.indicators || 0;
    setClass(B.blinkL, 'on', (ind & 1) === 1);
    setClass(B.blinkR, 'on', (ind & 2) === 2);
    el.hazard.classList.toggle('on', ind === 3);

    setBar(el.fuelRow, el.fuelBar, el.fuelVal, v.fuel, 25, 10);
    setBar(el.engRow, el.engBar, el.engVal, v.engine, 40, 20);

    el.belt.classList.toggle('is-off', !v.hasBelt);
    el.belt.classList.toggle('on', !!v.belted);
    el.belt.classList.toggle('warn', !!v.beltWarn);

    el.cruise.classList.toggle('on', v.cruise !== false);
    el.cruiseVal.textContent = v.cruise !== false ? Math.round(v.cruise) : '';

    el.lights.classList.toggle('on', v.lights !== 'off');
    el.lights.classList.toggle('high', v.lights === 'high');

    el.glow.classList.toggle('glow', v.coldstart === 'glow');
    el.glow.classList.toggle('cold', v.coldstart === 'warming');
    el.glow.title = v.coldstart === 'glow' ? 'Glow plugs heating. Wait to start.' : (v.coldstart === 'warming' ? 'Engine is cold' : 'Glow plugs');

    if (v.altitude != null) {
      setOdo('Altitude', Math.round(v.altitude).toLocaleString('en-US'), unit === 'kmh' ? 'm' : 'ft');
    } else if (v.mileage != null) {
      setOdo('Odometer', fmt.format(Math.max(0, Number(v.mileage) || 0)), v.mileageUnit === 'km' ? 'km' : 'mi');
    } else {
      setOdo('', '', '');
    }
  }

  const PX = 3;
  const WINDOW = 360;
  const strip = $('compassStrip');
  const CARDINALS = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };

  (function buildStrip() {
    strip.style.width = `${1080 * PX}px`;
    for (let d = -360; d <= 720; d += 5) {
      const x = (d + 360) * PX;
      const norm = ((d % 360) + 360) % 360;
      const tick = document.createElement('div');
      tick.className = `tick${norm % 15 === 0 ? ' major' : ''}`;
      tick.style.left = `${x}px`;
      strip.appendChild(tick);
      if (norm % 15 === 0) {
        const mark = document.createElement('span');
        const label = CARDINALS[norm];
        mark.className = `mark${label ? ' cardinal' : ''}${norm === 0 ? ' north' : ''}`;
        mark.textContent = label || norm;
        mark.style.left = `${x}px`;
        strip.appendChild(mark);
      }
    }
  })();

  let lastStreet = '';
  // Smooth compass: the game sends the heading ~30x a second and the strip eases toward it every
  // frame, always turning the short way around (359° -> 1° goes through north, not all the way back).
  let targetBearing = null;
  let shownBearing = null;
  let lastFrame = 0;
  function setBearing(b) {
    if (typeof b !== 'number' || !isFinite(b)) return;
    targetBearing = ((b % 360) + 360) % 360;
    if (shownBearing === null) shownBearing = targetBearing;
  }
  function compassFrame(now) {
    const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 0.016;
    lastFrame = now;
    if (targetBearing !== null) {
      const diff = ((targetBearing - shownBearing + 540) % 360) - 180;
      shownBearing += Math.abs(diff) < 0.02 ? diff : diff * Math.min(1, dt * 14);
      // keep counting past north so the strip never jumps; re-center only far outside the view
      // (the strip is drawn from -360° to 720°, so -180..540 always has marks on both sides)
      if (shownBearing < -180) shownBearing += 360;
      else if (shownBearing >= 540) shownBearing -= 360;
      strip.style.transform = `translateX(${(WINDOW / 2 - (shownBearing + 360) * PX).toFixed(2)}px)`;
    }
    requestAnimationFrame(compassFrame);
  }
  requestAnimationFrame(compassFrame);

  function updateCompass(c) {
    setBearing(c.bearing);
    const street = c.cross ? `${c.street} and ${c.cross}` : c.street;
    if (street !== lastStreet) {
      lastStreet = street;
      $('street').textContent = street;
    }
    $('zone').textContent = c.zone || '';

    const wp = $('waypoint');
    if (c.waypoint == null) {
      wp.textContent = '';
    } else if (settings.speedUnit === 'kmh') {
      wp.textContent = c.waypoint >= 1000 ? `${(c.waypoint / 1000).toFixed(1)} km` : `${Math.round(c.waypoint)} m`;
    } else {
      const miles = c.waypoint / 1609.344;
      wp.textContent = miles >= 0.1 ? `${miles.toFixed(1)} mi` : `${Math.round(c.waypoint * 3.28084)} ft`;
    }
  }

  const moneyEl = $('money');
  const cashAmt = $('cashAmt');
  const bankAmt = $('bankAmt');
  const deltas = { cash: $('cashDelta'), bank: $('bankDelta') };
  const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  let moneyHideTimer = null;
  let moneyKnown = false;

  function currentMoneyMode() {
    return (!$('settings').classList.contains('is-hidden') ? draft.moneyMode : settings.moneyMode) || 'change';
  }

  function applyMoneyVisibility(mode) {
    clearTimeout(moneyHideTimer);
    moneyEl.classList.toggle('is-off', mode === 'off' || !moneyKnown);
    moneyEl.classList.toggle('is-hidden-money', mode === 'change');
  }

  function flashMoney() {
    if (currentMoneyMode() !== 'change') return;
    moneyEl.classList.remove('is-hidden-money');
    clearTimeout(moneyHideTimer);
    moneyHideTimer = setTimeout(() => moneyEl.classList.add('is-hidden-money'), 6000);
  }

  function updateMoney(d) {
    moneyKnown = true;
    cashAmt.textContent = usd.format(d.cash || 0);
    bankAmt.textContent = usd.format(d.bank || 0);
    bankAmt.closest('.money-row').style.display = d.bank == null ? 'none' : '';
    if (currentMoneyMode() !== 'off') moneyEl.classList.remove('is-off');

    if (d.account && d.change && deltas[d.account]) {
      const el = deltas[d.account];
      el.textContent = `${d.change > 0 ? '+' : '-'}${usd.format(Math.abs(d.change))}`;
      el.className = `delta ${d.change > 0 ? 'up' : 'down'}`;
      void el.offsetWidth;
      el.classList.add('show');
    }
    if (!d.silent) flashMoney();
  }

  const FRAME_LIST = [
    ['off', 'Off'], ['minimal', 'Minimal'], ['outline', 'Outline'], ['corner', 'Corner'], ['bw', 'Black/White'], ['cut', 'Cut corners'],
    ['bracket', 'Bracket'], ['side', 'Side accents'], ['glow', 'Glow'], ['angled', 'Angled'], ['filled', 'Filled'], ['slim', 'Slim bar'], ['square', 'Square'],
  ];

  function rr(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
  }
  function cham(x, y, w, h, tl, tr, br, bl) {
    return `M${x + tl} ${y}H${x + w - tr}L${x + w} ${y + tr}V${y + h - br}L${x + w - br} ${y + h}H${x + bl}L${x} ${y + h - bl}V${y + tl}Z`;
  }
  function roundMask(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    return `M${x} ${y}H${x + r}A${r} ${r} 0 0 0 ${x} ${y + r}Z`
      + `M${x + w} ${y}V${y + r}A${r} ${r} 0 0 0 ${x + w - r} ${y}Z`
      + `M${x + w} ${y + h}H${x + w - r}A${r} ${r} 0 0 0 ${x + w} ${y + h - r}Z`
      + `M${x} ${y + h}V${y + h - r}A${r} ${r} 0 0 0 ${x + r} ${y + h}Z`;
  }
  function chamMask(x, y, w, h, tl, tr, br, bl) {
    return `M${x} ${y}H${x + tl}L${x} ${y + tl}Z`
      + `M${x + w} ${y}V${y + tr}L${x + w - tr} ${y}Z`
      + `M${x + w} ${y + h}H${x + w - br}L${x + w} ${y + h - br}Z`
      + `M${x} ${y + h}V${y + h - bl}L${x + bl} ${y + h}Z`;
  }
  function corners(x, y, w, h, len) {
    return `M${x} ${y + len}V${y}H${x + len}M${x + w - len} ${y}H${x + w}V${y + len}M${x + w} ${y + h - len}V${y + h}H${x + w - len}M${x + len} ${y + h}H${x}V${y + h - len}`;
  }

  function frameSvg(style, W, H, animated, small) {
    const k = small ? 0.45 : 1;
    const p = 2 * k;
    const x = p, y = p, w = W - p * 2, h = H - p * 2;
    const parts = [];
    let outline = rr(x, y, w, h, 10 * k);
    const MASK = 'rgba(10, 12, 16, 0.92)';
    const mask = (d) => { if (!small) parts.push(`<path d="${d}" fill="${MASK}"/>`); };
    const line = (d, sw, extra) => parts.push(`<path d="${d}" fill="none" stroke="currentColor" stroke-width="${sw * k}" stroke-linejoin="round" stroke-linecap="square" ${extra || ''}/>`);
    switch (style) {
      case 'minimal': mask(roundMask(x, y, w, h, 10 * k)); line(outline, 1.5, 'opacity="0.85"'); break;
      case 'outline': mask(roundMask(x, y, w, h, 10 * k)); line(outline, 3); break;
      case 'corner':
        outline = rr(x, y, w, h, 8 * k);
        mask(roundMask(x, y, w, h, 8 * k));
        line(outline, 1.2, 'opacity="0.7"');
        line(corners(x, y, w, h, Math.min(w, h) * 0.16), 4);
        break;
      case 'bw':
        outline = rr(x, y, w, h, 12 * k);
        mask(roundMask(x, y, w, h, 12 * k));
        line(outline, 2.5);
        parts.push(`<path d="${rr(x + 3 * k, y + 3 * k, w - 6 * k, h - 6 * k, 9 * k)}" fill="none" stroke="#000" stroke-width="${2 * k}" opacity="0.85"/>`);
        break;
      case 'cut': outline = cham(x, y, w, h, 14 * k, 14 * k, 14 * k, 14 * k); mask(chamMask(x, y, w, h, 14 * k, 14 * k, 14 * k, 14 * k)); line(outline, 2); break;
      case 'bracket': {
        line(rr(x, y, w, h, 6 * k), 1, 'opacity="0.35"');
        line(corners(x, y, w, h, Math.min(w, h) * 0.2), 3.5);
        const m = h / 2, s = h * 0.12;
        line(`M${x} ${m - s}V${m + s}M${x + w} ${m - s}V${m + s}`, 3.5);
        break;
      }
      case 'side': {
        outline = rr(x, y, w, h, 8 * k);
        mask(roundMask(x, y, w, h, 8 * k));
        line(outline, 1.8);
        const cx = x + w / 2, cy = y + h / 2, hw = w * 0.18, hh = h * 0.16;
        line(`M${cx - hw} ${y}H${cx + hw}M${cx - hw} ${y + h}H${cx + hw}M${x} ${cy - hh}V${cy + hh}M${x + w} ${cy - hh}V${cy + hh}`, 4.5);
        break;
      }
      case 'glow':
        outline = rr(x, y, w, h, 14 * k);
        mask(roundMask(x, y, w, h, 14 * k));
        parts.push(`<path d="${outline}" fill="none" stroke="currentColor" stroke-width="${6 * k}" opacity="0.25" style="filter:blur(${4 * k}px)"/>`);
        line(outline, 2);
        break;
      case 'angled': outline = cham(x, y, w, h, 20 * k, 20 * k, 10 * k, 10 * k); mask(chamMask(x, y, w, h, 20 * k, 20 * k, 10 * k, 10 * k)); line(outline, 2); break;
      case 'filled':
        outline = rr(x, y, w, h, 12 * k);
        parts.push(`<path d="${outline}" fill="rgba(0,0,0,0.22)" stroke="rgba(10,10,12,0.85)" stroke-width="${9 * k}"/>`);
        line(rr(x + 4 * k, y + 4 * k, w - 8 * k, h - 8 * k, 9 * k), 1.5);
        line(outline, 1.2, 'opacity="0.6"');
        break;
      case 'slim': {
        outline = rr(x, y, w, h, 10 * k);
        mask(roundMask(x, y, w, h, 10 * k));
        line(outline, 1.4);
        const cx = x + w / 2, hw = w * 0.32;
        line(`M${cx - hw} ${y}H${cx + hw}M${cx - hw} ${y + h}H${cx + hw}`, 4);
        break;
      }
      case 'square': {
        outline = `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
        line(outline, 2.4);
        const n = 7 * k;
        parts.push(`<path d="M${x - 1} ${y - 1}h${n}v${n}h-${n}zM${x + w - n + 1} ${y - 1}h${n}v${n}h-${n}zM${x - 1} ${y + h - n + 1}h${n}v${n}h-${n}zM${x + w - n + 1} ${y + h - n + 1}h${n}v${n}h-${n}z" fill="currentColor"/>`);
        break;
      }
      default: break;
    }
    if (animated && style !== 'off') {
      parts.push(`<path class="sweep" d="${outline}" fill="none" stroke-width="${2.6 * k}" stroke-linecap="round"/>`);
    }
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`;
  }

  function startSweep(root) {
    const path = root.querySelector('.sweep');
    if (!path) return;
    const len = path.getTotalLength();
    const seg = len * 0.14;
    path.style.strokeDasharray = `${seg} ${len - seg}`;
    path.animate([{ strokeDashoffset: 0 }, { strokeDashoffset: -len }], { duration: 4200, iterations: Infinity });
  }

  let defaultAdjust = { x: -5, y: -3, w: 6, h: -14 };
  let bezelSize = 0;
  let bezelColor = 'rgba(10, 12, 16, 0.94)';
  let bezelKey = '';
  const bezelEl = $('mmBezel');
  const mmEl = $('mmFrame');
  let mmRect = null;
  let mmKey = '';
  function renderFrame() {
    const settingsOpenNow = !$('settings').classList.contains('is-hidden');
    const look = settingsOpenNow ? draft : settings;
    const style = look.minimapFrame || 'minimal';
    const animated = look.minimapAnimated !== false && !reducedMotion();
    const adj = Object.assign({ x: 0, y: 0, w: 0, h: 0 }, look.mmAdjust || defaultAdjust);
    const visible = mmRect && (mmRect.show || settingsOpenNow) && style !== 'off' && !editing;
    if (!visible) { mmEl.classList.add('mm-hidden'); bezelEl.classList.add('mm-hidden'); mmKey = ''; return; }
    const W = Math.max(40, Math.round(mmRect.w * window.innerWidth) + adj.w);
    const H = Math.max(30, Math.round(mmRect.h * window.innerHeight) + adj.h);
    const L = Math.round(mmRect.x * window.innerWidth) + adj.x;
    const T = Math.round(mmRect.y * window.innerHeight) + adj.y;
    renderBezel(L, T, W, H);
    mmEl.style.left = `${L}px`;
    mmEl.style.top = `${T}px`;
    mmEl.style.width = `${W}px`;
    mmEl.style.height = `${H}px`;
    mmEl.classList.remove('mm-hidden');
    const key = `${style}|${animated}|${W}|${H}`;
    if (key === mmKey) return;
    mmKey = key;
    mmEl.innerHTML = frameSvg(style, W, H, animated, false);
    if (animated) startSweep(mmEl);
  }

  // dark ring around the minimap border: covers any map that fades out past the border
  function renderBezel(L, T, W, H) {
    const B = bezelSize;
    if (!B) { bezelEl.classList.add('mm-hidden'); return; }
    const OW = W + B * 2, OH = H + B * 2;
    bezelEl.style.left = `${L - B}px`;
    bezelEl.style.top = `${T - B}px`;
    bezelEl.style.width = `${OW}px`;
    bezelEl.style.height = `${OH}px`;
    bezelEl.classList.remove('mm-hidden');
    const key = `${OW}|${OH}|${B}|${bezelColor}`;
    if (key === bezelKey) return;
    bezelKey = key;
    const ring = `${rr(0, 0, OW, OH, Math.min(18, B + 8))}${rr(B, B, W, H, 10)}`;
    bezelEl.innerHTML = `<svg viewBox="0 0 ${OW} ${OH}" xmlns="http://www.w3.org/2000/svg"><path d="${ring}" fill="${bezelColor}" fill-rule="evenodd"/></svg>`;
  }

  function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function buildFramePicker() {
    const box = $('framePicker');
    box.innerHTML = FRAME_LIST.map(([id, label]) =>
      `<button type="button" data-value="${id}"><span class="fp">${id === 'off' ? '<svg viewBox="0 0 52 36"><path d="M8 28 44 8" stroke="currentColor" stroke-width="2" opacity="0.5"/></svg>' : frameSvg(id, 52, 36, false, true)}</span><span>${label}</span></button>`).join('');
  }
  buildFramePicker();
  window.addEventListener('resize', () => { mmKey = ''; renderFrame(); });

  function polar(cx, cy, r, a) {
    const t = (a * Math.PI) / 180;
    return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
  }
  function arcD(cx, cy, r, a0, a1) {
    const [x0, y0] = polar(cx, cy, r, a0);
    const [x1, y1] = polar(cx, cy, r, a1);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }
  function octagon(cx, cy, r, cutTop, cutBottom) {
    const a = cutTop * r, b = cutBottom * r;
    return `M${cx - r + a} ${cy - r}H${cx + r - a}L${cx + r} ${cy - r + a}V${cy + r - b}L${cx + r - b} ${cy + r}H${cx - r + b}L${cx - r} ${cy + r - b}V${cy - r + a}Z`;
  }

  function roundFrame(style, S, cx, cy, ro, k) {
    const A0 = 150, A1 = 390;
    const parts = [];
    const stroke = (d, sw, extra) => parts.push(`<path d="${d}" fill="none" stroke="currentColor" stroke-width="${sw * k}" stroke-linecap="round" ${extra || ''}/>`);
    const full = (r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`;
    switch (style) {
      case 'minimal': stroke(arcD(cx, cy, ro, A0, A1), 1.5, 'opacity="0.6"'); break;
      case 'outline': stroke(arcD(cx, cy, ro, A0, A1), 3); break;
      case 'corner':
        stroke(arcD(cx, cy, ro, A0, A1), 1, 'opacity="0.45"');
        [[150, 172], [258, 282], [368, 390]].forEach(([a, b]) => stroke(arcD(cx, cy, ro, a, b), 4.5));
        break;
      case 'bw':
        stroke(arcD(cx, cy, ro, A0, A1), 2.5);
        parts.push(`<path d="${arcD(cx, cy, ro - 3.5 * k, A0, A1)}" fill="none" stroke="#000" stroke-width="${2 * k}" opacity="0.85"/>`);
        break;
      case 'cut': stroke(octagon(cx, cy, ro, 0.42, 0.42), 2, 'stroke-linejoin="round"'); break;
      case 'bracket':
        [[150, 166], [196, 226], [314, 344], [374, 390]].forEach(([a, b]) => stroke(arcD(cx, cy, ro, a, b), 4));
        stroke(arcD(cx, cy, ro, A0, A1), 1, 'opacity="0.3"');
        break;
      case 'side':
        stroke(arcD(cx, cy, ro, A0, A1), 1.5, 'opacity="0.55"');
        [[158, 205], [335, 382]].forEach(([a, b]) => stroke(arcD(cx, cy, ro, a, b), 5));
        break;
      case 'glow':
        parts.push(`<path d="${full(ro)}" fill="none" stroke="currentColor" stroke-width="${7 * k}" opacity="0.28" style="filter:blur(${5 * k}px)"/>`);
        stroke(full(ro), 2);
        break;
      case 'angled': stroke(octagon(cx, cy, ro, 0.5, 0.2), 2, 'stroke-linejoin="round"'); break;
      case 'filled':
        parts.push(`<circle cx="${cx}" cy="${cy}" r="${ro + 1 * k}" fill="rgba(6, 9, 14, 0.78)"/>`);
        stroke(full(ro + 1 * k), 1.5, 'opacity="0.5"');
        break;
      case 'slim':
        stroke(arcD(cx, cy, ro, A0, A1), 1.2, 'opacity="0.6"');
        stroke(arcD(cx, cy, ro, 248, 292), 5);
        break;
      case 'square': {
        const ticks = [];
        for (let a = A0; a <= A1; a += 4) {
          const [x0, y0] = polar(cx, cy, ro - 6 * k, a);
          const [x1, y1] = polar(cx, cy, ro + 1 * k, a);
          ticks.push(`M${x0.toFixed(2)} ${y0.toFixed(2)}L${x1.toFixed(2)} ${y1.toFixed(2)}`);
        }
        stroke(ticks.join(''), 1.6, 'opacity="0.85" stroke-linecap="butt"');
        break;
      }
      default: break;
    }
    return `<svg viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`;
  }

  const gaugeLayers = {};
  function layer(key, parent) {
    if (!parent) return null;
    if (!gaugeLayers[key]) {
      const d = document.createElement('div');
      d.className = 'gframe';
      parent.prepend(d);
      gaugeLayers[key] = d;
    }
    return gaugeLayers[key];
  }

  let gaugeKey = '';
  function renderGaugeFrames() {
    const look = (editing || !$('settings').classList.contains('is-hidden')) ? draft : settings;
    const style = look.gaugeFrame || 'off';
    const readEl = document.querySelector('#vehicle .readouts');
    const rw = readEl ? readEl.offsetWidth + 6 : 0;
    const rh = readEl ? readEl.offsetHeight + 6 : 0;
    const key = `${style}|${rw}|${rh}`;
    if (key === gaugeKey) return;
    gaugeKey = key;
    const g = layer('gauge', document.querySelector('#vehicle .gauge'));
    const f = layer('fuel', $('fuelGauge'));
    const r = layer('read', readEl);
    const rg = layer('ring', document.querySelector('#vehicle .ring'));
    if (style === 'off') {
      [g, f, r, rg].forEach((n) => { if (n) n.innerHTML = ''; });
      return;
    }
    if (g) g.innerHTML = roundFrame(style, 240, 120, 120, 116, 1);
    if (rg) rg.innerHTML = roundFrame(style, 272, 136, 136, 130, 1);
    if (f) f.innerHTML = roundFrame(style, 100, 50, 50, 49, 0.55);
    if (r && rw > 6 && rh > 6) r.innerHTML = frameSvg(style, rw, rh, false, false);
  }

  function buildGaugePicker() {
    const box = $('gaugePicker');
    box.innerHTML = FRAME_LIST.map(([id, label]) =>
      `<button type="button" data-value="${id}"><span class="fp round">${id === 'off'
        ? '<svg viewBox="0 0 40 36"><path d="M6 30 34 6" stroke="currentColor" stroke-width="2" opacity="0.5"/></svg>'
        : roundFrame(id, 40, 20, 20, 16, 0.6)}</span><span>${label}</span></button>`).join('');
  }
  buildGaugePicker();
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => renderGaugeFrames());
    const readEl = document.querySelector('#vehicle .readouts');
    if (readEl) ro.observe(readEl);
  }

  const movable = {};
  $$('[data-move]').forEach((n) => (movable[n.dataset.move] = n));

  function applyLook(s) {
    document.documentElement.style.setProperty('--scale', s.scale);
    document.documentElement.dataset.theme = s.theme || 'modern';
    document.documentElement.dataset.vehicleStyle = s.vehicleStyle || 'ring';
    applyColors(s);
    if (typeof renderFrame === 'function') { mmKey = ''; renderFrame(); }
    if (typeof renderGaugeFrames === 'function') { gaugeKey = ''; renderGaugeFrames(); }
    statusEl.dataset.style = s.statusStyle || 'outline';
    vehicleEl.dataset.style = s.vehicleStyle || 'ring';
    document.documentElement.dataset.fuelStyle = s.fuelStyle || 'gauge';
    applyMoneyVisibility(s.moneyMode);
    $('compass').classList.toggle('is-off', !s.showCompass && !editing);
    statusEl.classList.toggle('is-off', !s.showStatus && !editing);
    applyPrioLook(s);
    applyPanel(s);
  }

  function hexRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
  }
  function applyPanel(s) {
    const ro = document.querySelector('#vehicle .readouts');
    const show = { ...PANEL_DEFAULTS.panelShow, ...(s.panelShow || {}) };
    ro.dataset.panel = s.panelStyle || 'auto';
    ro.dataset.bars = s.panelBars || 'smooth';
    ro.classList.toggle('hide-engine', !show.engine);
    ro.classList.toggle('hide-fuel', !show.fuel);
    ro.classList.toggle('hide-lamps', !show.lamps);
    ro.classList.toggle('hide-odo', !show.odo);
    const custom = !!(s.panelColor && HEX.test(s.panelColor));
    ro.classList.toggle('custom-accent', custom);
    if (custom) ro.style.setProperty('--pa', hexRgb(s.panelColor));
    else ro.style.removeProperty('--pa');
    const vs = s.vehicleStyle || 'ring';
    const anything = show.lamps || (show.odo && !(vs === 'ring' && (s.theme || 'modern') === 'modern'))
      || (show.engine && vs !== 'ring')
      || (show.fuel && s.fuelStyle === 'bar' && vs !== 'ring' && vs !== 'minimal');
    ro.classList.toggle('is-empty', !anything);
    const op = Number(s.panelOpacity);
    ro.classList.toggle('custom-bg', op >= 0);
    if (op >= 0) ro.style.setProperty('--pbg', op / 100); else ro.style.removeProperty('--pbg');
  }

  function applyPositions(positions) {
    Object.entries(movable).forEach(([key, node]) => {
      const p = positions && positions[key];
      if (p) {
        node.classList.add('custom-pos');
        node.dataset.nearMap = p.x > 0.12 && p.x < 0.24 && p.y > 0.7 ? '1' : '';
        node.style.left = `${p.x * 100}vw`;
        node.style.top = `${p.y * 100}vh`;
      } else {
        node.classList.remove('custom-pos');
        node.dataset.nearMap = '';
        node.style.left = '';
        node.style.top = '';
      }
    });
    if (typeof renderFrame === 'function') { mmKey = ''; renderFrame(); }
    stackUnderPrio();
  }

  function applySettings(s) {
    settings = { ...settings, ...s };
    if (!settings.positions || Array.isArray(settings.positions)) settings.positions = { ...(settings.positions || {}) };
    applyLook(settings);
    applyPositions(settings.positions);
  }

  $$('#settings .tab').forEach((t) => t.addEventListener('click', () => {
    $$('#settings .tab').forEach((x) => x.classList.toggle('active', x === t));
    $$('#settings .tab-body').forEach((b) => b.classList.toggle('active', b.dataset.tab === t.dataset.tab));
  }));

  (function buildColorList() {
    $('colorList').innerHTML = STATS.map(({ key, label }) => `
      <label class="color-row" data-stat="${key}">
        <i class="dot"></i><span>${label}</span>
        <span class="color-btn">Change color<input type="color" data-stat="${key}"></span>
      </label>`).join('');
    $$('#colorList input[type=color]').forEach((inp) => inp.addEventListener('input', () => {
      draft.colors = { ...(draft.colors || {}), [inp.dataset.stat]: inp.value };
      fillColors();
      applyColors(draft);
    }));
  })();
  function fillColors() {
    STATS.forEach(({ key }) => {
      const c = statColor(key, draft);
      const row = document.querySelector(`#colorList .color-row[data-stat="${key}"]`);
      row.style.setProperty('--c', c);
      row.querySelector('input').value = c.toLowerCase();
    });
  }
  $('btnColorReset').addEventListener('click', () => {
    draft.colors = {};
    fillColors();
    applyColors(draft);
  });

  function fillPanelForm() {
    const show = { ...PANEL_DEFAULTS.panelShow, ...(draft.panelShow || {}) };
    $$('#panelPicker button').forEach((b) => b.classList.toggle('active', b.dataset.value === (draft.panelStyle || 'auto')));
    $$('#panelBarsPicker button').forEach((b) => b.classList.toggle('active', b.dataset.value === (draft.panelBars || 'smooth')));
    $('panelShowEngine').checked = show.engine;
    $('panelShowFuel').checked = show.fuel;
    $('panelShowLamps').checked = show.lamps;
    $('panelShowOdo').checked = show.odo;
    const accent = (draft.panelColor && HEX.test(draft.panelColor)) ? draft.panelColor : null;
    $('panelColorDot').style.background = accent || 'rgb(var(--accent-rgb))';
    $('panelColor').value = accent || '#ffffff';
    const op = Number(draft.panelOpacity);
    $('panelOpacity').value = op >= 0 ? op : 50;
    $('panelOpacityOut').textContent = op >= 0 ? `${op}%` : 'Theme';
  }

  function fillForm() {
    fillPanelForm();
    fillColors();
    $$('#themePicker button').forEach((b) => b.classList.toggle('active', b.dataset.value === (draft.theme || 'modern')));
    $$('#framePicker button').forEach((b) => b.classList.toggle('active', b.dataset.value === (draft.minimapFrame || 'minimal')));
    $$('#gaugePicker button').forEach((b) => b.classList.toggle('active', b.dataset.value === (draft.gaugeFrame || 'off')));
    const adj = Object.assign({ x: 0, y: 0, w: 0, h: 0 }, draft.mmAdjust || defaultAdjust);
    [['X', 'x'], ['Y', 'y'], ['W', 'w'], ['H', 'h']].forEach(([id, key]) => {
      $(`mmAdj${id}`).value = adj[key];
      $(`mmAdj${id}Out`).textContent = adj[key] > 0 ? `+${adj[key]}` : `${adj[key]}`;
    });
    $('optMmAnim').checked = draft.minimapAnimated !== false;
    $$('#unitPicker button').forEach((b) => b.classList.toggle('active', b.dataset.value === draft.speedUnit));
    $$('#vehiclePicker button').forEach((b) => b.classList.toggle('active', b.dataset.value === draft.vehicleStyle));
    $$('#fuelPicker button').forEach((b) => b.classList.toggle('active', b.dataset.value === draft.fuelStyle));
    $$('#moneyPicker button').forEach((b) => b.classList.toggle('active', b.dataset.value === draft.moneyMode));
    $$('#stylePicker button').forEach((b) => b.classList.toggle('active', b.dataset.value === draft.statusStyle));
    $('optCompass').checked = draft.showCompass;
    fillPrioForm();
    $('optStatus').checked = draft.showStatus;
    $('optMinimap').checked = draft.minimapOnFoot;
    $('optSfx').value = Math.round((draft.sfxVolume ?? 0.5) * 100);
    $('sfxOut').textContent = `${Math.round((draft.sfxVolume ?? 0.5) * 100)}%`;
    $('optScale').value = Math.round(draft.scale * 100);
    $('scaleOut').textContent = `${Math.round(draft.scale * 100)}%`;
  }

  function preview() {
    applyLook(draft);
    updateVehicle(lastVehicle || { ...SAMPLE_VEHICLE, unit: draft.speedUnit });
  }

  const picker = (id, key) =>
    $$(`#${id} button`).forEach((b) =>
      b.addEventListener('click', () => {
        draft[key] = b.dataset.value;
        fillForm();
        preview();
      })
    );
  picker('themePicker', 'theme');
  picker('framePicker', 'minimapFrame');
  picker('gaugePicker', 'gaugeFrame');
  [['X', 'x'], ['Y', 'y'], ['W', 'w'], ['H', 'h']].forEach(([id, key]) => {
    $(`mmAdj${id}`).addEventListener('input', (e) => {
      draft.mmAdjust = Object.assign({ x: 0, y: 0, w: 0, h: 0 }, draft.mmAdjust || defaultAdjust, { [key]: Number(e.target.value) });
      $(`mmAdj${id}Out`).textContent = draft.mmAdjust[key] > 0 ? `+${draft.mmAdjust[key]}` : `${draft.mmAdjust[key]}`;
      mmKey = '';
      renderFrame();
    });
  });
  $('btnMmReset').addEventListener('click', () => {
    draft.mmAdjust = { ...defaultAdjust };
    fillForm();
    mmKey = '';
    renderFrame();
  });
  $('optMmAnim').addEventListener('change', (e) => { draft.minimapAnimated = e.target.checked; preview(); });
  picker('unitPicker', 'speedUnit');
  picker('vehiclePicker', 'vehicleStyle');
  picker('fuelPicker', 'fuelStyle');
  picker('moneyPicker', 'moneyMode');
  picker('stylePicker', 'statusStyle');
  picker('panelPicker', 'panelStyle');
  picker('panelBarsPicker', 'panelBars');
  [['panelShowEngine', 'engine'], ['panelShowFuel', 'fuel'], ['panelShowLamps', 'lamps'], ['panelShowOdo', 'odo']].forEach(([id, key]) => {
    $(id).addEventListener('change', (e) => {
      draft.panelShow = { ...PANEL_DEFAULTS.panelShow, ...(draft.panelShow || {}), [key]: e.target.checked };
      preview();
    });
  });
  $('panelColor').addEventListener('input', (e) => { draft.panelColor = e.target.value; fillPanelForm(); preview(); });
  $('panelOpacity').addEventListener('input', (e) => { draft.panelOpacity = Number(e.target.value); fillPanelForm(); preview(); });
  $('btnPanelReset').addEventListener('click', () => {
    Object.assign(draft, JSON.parse(JSON.stringify(PANEL_DEFAULTS)));
    fillPanelForm();
    preview();
  });

  $('optCompass').addEventListener('change', (e) => (draft.showCompass = e.target.checked));
  $('optPrio').addEventListener('change', (e) => { draft.showPrio = e.target.checked; applyLook(draft); });
  $('prioColor').addEventListener('input', (e) => { draft.prioColor = e.target.value; fillPrioForm(); applyLook(draft); });
  $('prioSize').addEventListener('input', (e) => { draft.prioSize = Number(e.target.value); fillPrioForm(); applyLook(draft); });
  $('btnPrioReset').addEventListener('click', () => { draft.showPrio = true; draft.prioColor = ''; draft.prioSize = 0; fillPrioForm(); applyLook(draft); });
  $('optStatus').addEventListener('change', (e) => (draft.showStatus = e.target.checked));
  $('optMinimap').addEventListener('change', (e) => (draft.minimapOnFoot = e.target.checked));
  $('optSfx').addEventListener('input', (e) => {
    draft.sfxVolume = Number(e.target.value) / 100;
    $('sfxOut').textContent = `${e.target.value}%`;
  });
  $('optSfx').addEventListener('change', () => playSfx('indicator'));
  $('optScale').addEventListener('input', (e) => {
    draft.scale = Number(e.target.value) / 100;
    $('scaleOut').textContent = `${e.target.value}%`;
    applyLook(draft);
  });

  let addonGroups = [];
  const addonProxies = {};

  function addonPreview(positions, hidden, editingNow) {
    post('addonPreview', { positions: positions || {}, hidden: hidden || {}, editing: !!editingNow });
  }

  function renderAddonList() {
    const box = $('addonList');
    if (!box) return;
    const hidden = (draft && draft.addonHidden) || settings.addonHidden || {};
    const groups = addonGroups.filter((g) => g.elements.length);
    if (!groups.length) {
      box.innerHTML = '';
      const p = document.createElement('p');
      p.className = 'addon-empty';
      p.textContent = 'Job cards, the radio and other FBRP scripts show up here when they are running.';
      box.append(p);
      return;
    }
    box.replaceChildren(...groups.flatMap((g) => {
      const head = document.createElement('div');
      head.className = 'subtitle';
      head.textContent = g.label;
      const rows = g.elements.map((e) => {
        const row = document.createElement('label');
        row.className = `row${e.toggle ? ' toggle' : ''}`;
        const info = document.createElement('span');
        info.className = 'row-info';
        const strong = document.createElement('strong');
        strong.textContent = e.label;
        const small = document.createElement('small');
        small.textContent = e.description || (e.toggle ? 'Show it on screen.' : 'Always shown when open. Move it with Move HUD elements.');
        info.append(strong, small);
        row.append(info);
        if (e.toggle) {
          const input = document.createElement('input');
          input.type = 'checkbox';
          input.checked = !hidden[e.key];
          input.addEventListener('change', () => {
            const next = { ...(draft.addonHidden || {}) };
            if (input.checked) delete next[e.key]; else next[e.key] = true;
            draft.addonHidden = next;
            addonPreview(draft.positions, draft.addonHidden, false);
          });
          const sw = document.createElement('span');
          sw.className = 'switch';
          row.append(input, sw);
        }
        return row;
      });
      return [head, ...rows];
    }));
  }

  function labelOf(key) {
    for (const g of addonGroups) {
      const e = g.elements.find((x) => x.key === key);
      if (e) return e.label;
    }
    return key;
  }

  function clearProxies() {
    Object.keys(addonProxies).forEach((k) => { addonProxies[k].remove(); delete addonProxies[k]; });
  }

  let addonDrag = null;
  let moveTimer = 0;
  function proxyFor(key) {
    if (addonProxies[key]) return addonProxies[key];
    const n = document.createElement('div');
    n.className = 'addon-proxy';
    n.dataset.key = key;
    n.dataset.label = labelOf(key);
    n.addEventListener('pointerdown', (e) => {
      if (!editing) return;
      e.preventDefault();
      const r = n.getBoundingClientRect();
      addonDrag = { key, node: n, dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height };
      n.classList.add('dragging');
      n.setPointerCapture(e.pointerId);
    });
    n.addEventListener('pointermove', (e) => {
      if (!addonDrag || addonDrag.node !== n) return;
      const x = clamp(e.clientX - addonDrag.dx, 0, window.innerWidth - addonDrag.w);
      const y = clamp(e.clientY - addonDrag.dy, 0, window.innerHeight - addonDrag.h);
      n.style.left = `${x}px`;
      n.style.top = `${y}px`;
      const now = performance.now();
      if (now - moveTimer > 30) {
        moveTimer = now;
        post('addonMove', { key, x: x / window.innerWidth, y: y / window.innerHeight });
      }
    });
    const end = () => {
      if (!addonDrag || addonDrag.node !== n) return;
      const r = n.getBoundingClientRect();
      const pos = { x: r.left / window.innerWidth, y: r.top / window.innerHeight };
      draft.positions[key] = pos;
      post('addonMove', { key, x: pos.x, y: pos.y });
      n.classList.remove('dragging');
      addonDrag = null;
    };
    n.addEventListener('pointerup', end);
    n.addEventListener('pointercancel', end);
    $('addonLayer').append(n);
    addonProxies[key] = n;
    return n;
  }

  function addonRects(res, rects) {
    if (!editing) return;
    Object.entries(rects || {}).forEach(([id, r]) => {
      const key = `${res}:${id}`;
      const n = proxyFor(key);
      if (addonDrag && addonDrag.node === n) return;
      const ok = r && r.w > 0 && r.h > 0;
      n.classList.toggle('is-off', !ok);
      if (!ok) return;
      n.style.left = `${r.x * 100}vw`;
      n.style.top = `${r.y * 100}vh`;
      n.style.width = `${r.w * 100}vw`;
      n.style.height = `${r.h * 100}vh`;
      n.classList.toggle('label-below', r.y < 0.05);
    });
  }

  function openSettings(s) {
    applySettings(s);
    draft = { ...settings, positions: { ...settings.positions }, addonHidden: { ...(settings.addonHidden || {}) } };
    fillForm();
    renderAddonList();
    $('settings').classList.remove('is-hidden');
    $('btnSave').focus();
  }

  function closeSettings() {
    $('settings').classList.add('is-hidden');
    addonPreview(settings.positions, settings.addonHidden, false);
    applySettings(settings);
    updateVehicle(lastVehicle);
    post('closeSettings');
  }

  function save() {
    settings = { ...settings, ...draft, positions: { ...draft.positions }, addonHidden: { ...(draft.addonHidden || {}) } };
    post('saveSettings', settings);
  }

  $('btnClose').addEventListener('click', closeSettings);
  $('btnSave').addEventListener('click', () => { save(); closeSettings(); });

  function enterEdit() {
    editing = true;
    $('settings').classList.add('is-hidden');
    $('editBar').classList.remove('is-hidden');
    $('hud').classList.add('editing');
    $('hud').classList.remove('is-hidden');
    applyLook(draft);
    applyPositions(draft.positions);
    updateStatus(SAMPLE_STATUS);
    updateVehicle(lastVehicle || { ...SAMPLE_VEHICLE, unit: draft.speedUnit });
    $('info').classList.remove('is-off');
    clearProxies();
    $('addonLayer').classList.remove('is-hidden');
    addonPreview(draft.positions, draft.addonHidden, true);
  }

  let infoShow = false;
  function exitEdit(keep) {
    $('info').classList.toggle('is-off', !infoShow);
    editing = false;
    if (!keep) draft.positions = { ...settings.positions };
    addonDrag = null;
    clearProxies();
    $('addonLayer').classList.add('is-hidden');
    addonPreview(draft.positions, draft.addonHidden, false);
    $('editBar').classList.add('is-hidden');
    $('hud').classList.remove('editing');
    $$('[data-move]').forEach((n) => n.classList.remove('dragging'));
    applyLook(draft);
    applyPositions(draft.positions);
    updateStatus(lastStatus);
    $('settings').classList.remove('is-hidden');
  }

  $('btnEdit').addEventListener('click', enterEdit);

  $('btnHideHud').addEventListener('click', () => {
    $('settings').classList.add('is-hidden');
    applySettings(settings);
    $('hud').classList.add('is-hidden');
    post('hideHud');
  });

  let toastTimer = null;
  function hudToast(d) {
    if (!d) return;
    if (!d.visible) $('hud').classList.add('is-hidden');
    if (!d.notify) return;
    const el = $('hudToast');
    const how = d.key ? `Press ${d.key} or /togglehud` : 'Type /togglehud';
    el.textContent = d.visible ? 'HUD shown' : `HUD hidden \u00B7 ${how} to show it`;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
  }
  $('btnEditCancel').addEventListener('click', () => exitEdit(false));
  $('btnEditReset').addEventListener('click', () => {
    draft.positions = {};
    applyPositions(draft.positions);
    addonPreview(draft.positions, draft.addonHidden, true);
  });
  $('btnEditDone').addEventListener('click', () => {
    save();
    exitEdit(true);
  });

  let drag = null;
  Object.entries(movable).forEach(([key, node]) => {
    node.addEventListener('pointerdown', (e) => {
      if (!editing) return;
      e.preventDefault();
      const r = node.getBoundingClientRect();
      node.classList.add('custom-pos', 'dragging');
      node.style.left = `${r.left}px`;
      node.style.top = `${r.top}px`;
      drag = { key, node, dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height };
      node.setPointerCapture(e.pointerId);
    });

    node.addEventListener('pointermove', (e) => {
      if (!drag || drag.node !== node) return;
      const x = clamp(e.clientX - drag.dx, 0, window.innerWidth - drag.w);
      const y = clamp(e.clientY - drag.dy, 0, window.innerHeight - drag.h);
      node.style.left = `${x}px`;
      node.style.top = `${y}px`;
    });

    const end = () => {
      if (!drag || drag.node !== node) return;
      const r = node.getBoundingClientRect();
      draft.positions[key] = { x: r.left / window.innerWidth, y: r.top / window.innerHeight };
      node.classList.remove('dragging');
      drag = null;
    };
    node.addEventListener('pointerup', end);
    node.addEventListener('pointercancel', end);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (editing) exitEdit(false);
    else if (!$('settings').classList.contains('is-hidden')) closeSettings();
  });

  const sounds = {};
  function sfxVolume() {
    const open = !$('settings').classList.contains('is-hidden');
    const v = open ? draft.sfxVolume : settings.sfxVolume;
    return clamp(v == null ? 0.5 : Number(v), 0, 1);
  }
  function playSfx(name, loop) {
    if (!name) return;
    let a = sounds[name];
    if (!a) { a = new Audio(`sfx/${name}.mp3`); sounds[name] = a; }
    a.volume = sfxVolume();
    a.loop = !!loop;
    if (loop && !a.paused) return;
    if (!loop) a.currentTime = 0;
    if (a.volume > 0) a.play().catch(() => {});
  }
  function stopSfx(name) {
    const a = sounds[name];
    if (a) { a.pause(); a.currentTime = 0; }
  }
  function chime(kind) {
    playSfx(kind === 'beltOn' ? 'seatbelt-on' : kind === 'beltOff' ? 'seatbelt-off' : kind);
  }


  const settingsOpen = () => !$('settings').classList.contains('is-hidden');



  window.addEventListener('message', ({ data: msg }) => {
    if (!msg || !msg.action) return;

    switch (msg.action) {
      case 'update': {
        const d = msg.data;
        lastStatus = d.status;
        lastVehicle = d.vehicle;
        $('hud').classList.toggle('is-hidden', !d.visible && !editing);
        const mapShown = d.minimap && !(d.onFoot && d.mapOnFoot === false && !settingsOpen());
        statusEl.classList.toggle('no-minimap', !mapShown);
        if (editing) return;
        updateStatus(d.status);
        if (settingsOpen() && !d.vehicle) return;
        updateVehicle(d.vehicle);
        break;
      }
      case 'compass':
        updateCompass(msg.data);
        break;
      case 'heading':
        setBearing(msg.data);
        break;
      case 'settings':
        applySettings(msg.data);
        break;
      case 'openSettings':
        openSettings(msg.data);
        break;
      case 'job': {
        const j = msg.data || {};
        const el = $('job');
        el.classList.toggle('is-off', !j.show);
        $('jobName').textContent = j.name || 'Unemployed';
        $('jobGrade').textContent = j.grade || '';
        const duty = $('jobDuty');
        duty.className = `job-duty${j.hasDuty ? (j.onDuty ? ' on' : '') : ' none'}`;
        duty.innerHTML = `<i class="dot"></i>${j.onDuty ? 'ON DUTY' : 'OFF DUTY'}`;
        break;
      }
      case 'defaults':
        if (msg.data && msg.data.mmAdjust) defaultAdjust = { x: 0, y: 0, w: 0, h: 0, ...msg.data.mmAdjust };
        if (msg.data && msg.data.bezel != null) bezelSize = Math.max(0, Math.min(120, Number(msg.data.bezel) || 0));
        if (msg.data && typeof msg.data.bezelColor === 'string' && CSS.supports('color', msg.data.bezelColor)) bezelColor = msg.data.bezelColor;
        mmKey = '';
        renderFrame();
        break;
      case 'minimapFrame':
        mmRect = msg.data;
        renderFrame();
        break;
      case 'info': {
        const i = msg.data || {};
        infoShow = !!i.show;
        $('info').classList.toggle('is-off', !infoShow && !editing);
        $('infoId').textContent = i.id != null ? i.id : '';
        $('infoTime').textContent = i.time || '';
        $('chipId').classList.toggle('is-off', i.id == null);
        $('chipTime').classList.toggle('is-off', !i.time);
        break;
      }
      case 'money':
        updateMoney(msg.data);
        break;
      case 'voiceConfig':
        if (msg.data && /^#[0-9a-f]{6}$/i.test(msg.data.color || '')) {
          PALETTES.modern.voice = msg.data.color;
          STATS.find((x) => x.key === 'voice').color = msg.data.color;
          applyColors(settingsOpen() ? draft : settings);
        }
        break;
      case 'prioConfig':
        applyPrioConfig(msg.data || {});
        break;
      case 'prio':
        renderPrio(msg.data || {});
        break;
      case 'prioLayout': {
        // jaxtti_priorityhud's box (0-1 of the screen). Only stack under it when it's on the right side.
        const p = msg.data || {};
        // While the prio HUD is hidden (spawn selector, character menu...) keep the last spot,
        // so the chips never jump back up over it when it comes back.
        if (p.visible && p.left > 0.45 && p.bottom > 0.05) {
          document.documentElement.style.setProperty('--stack-top', `${(p.bottom * 100 + 1).toFixed(2)}vh`);
        } else if (p.visible && p.left <= 0.45) {
          // prio HUD dragged to the left side: chips go back to the top-right corner
          document.documentElement.style.setProperty('--stack-top', '6.4vh');
        }
        break;
      }
      case 'moneyPeek':
        flashMoney();
        break;
      case 'sound':
        chime(msg.data);
        break;
      case 'sfx': {
        const d = msg.data || {};
        if (d.stop) stopSfx(d.name); else playSfx(d.name, d.loop);
        break;
      }
      case 'stopAllSfx':
        Object.keys(sounds).forEach(stopSfx);
        break;
      case 'hudToggled':
        hudToast(msg.data);
        break;
      case 'addons':
        addonGroups = Array.isArray(msg.data) ? msg.data : [];
        if (settingsOpen()) renderAddonList();
        if (editing) addonPreview(draft.positions, draft.addonHidden, true);
        break;
      case 'addonRects':
        addonRects(msg.res, msg.data);
        break;
    }
  });

  post('ready');
})();
