/* Made by Saif | © 2026 Saif. All rights reserved. */
(() => {
'use strict';

/* ═════════════════ helpers ═════════════════ */
const RES = (typeof GetParentResourceName === 'function') ? GetParentResourceName() : 'carplay';
const post = (name, data = {}) =>
  fetch(`https://${RES}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(data),
  }).catch(() => {});
const act = (action, a, b) => post('action', { action, a, b });

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const NS = 'http://www.w3.org/2000/svg';

function icon(name) {
  const s = document.createElementNS(NS, 'svg');
  const u = document.createElementNS(NS, 'use');
  u.setAttribute('href', '#i-' + name);
  s.appendChild(u);
  return s;
}
function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  kids.flat().forEach(c => c != null && e.append(c));
  return e;
}
const fmtTime = s => {
  s = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const asArray = v => Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : []);

/* ═════════════════ state ═════════════════ */
const ACCENTS = ['#fa2d48', '#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#64d2ff'];

function loadSettings() {
  try { return Object.assign({ accent: ACCENTS[0], units: null }, JSON.parse(localStorage.getItem('carplay_settings') || '{}')); }
  catch (e) { return { accent: ACCENTS[0], units: null }; }
}
function saveSettings() {
  try { localStorage.setItem('carplay_settings', JSON.stringify(S.settings)); } catch (e) {}
}

const S = {
  open: false, interactive: false, tab: 'music', cfg: { places: [] },
  car: null, pos: 0, dur: 0, playing: false, dash: null, nav: null,
  pins: [], shared: [], placeTab: 'places', zoom: 2, trail: [],
  settings: loadSettings(), preMute: 0.5, artSrc: '',
};

const E = {};
['root', 'stage', 'mini', 'art', 'artImg', 'npTitle', 'npAuthor', 'seekBar', 'seekFill', 'seekKnob', 'tCur', 'tDur',
 'bShuffle', 'bPrev', 'bPlay', 'bNext', 'bLoop', 'bMute', 'volBar', 'volFill', 'volKnob', 'linkInput', 'bAdd', 'bNow', 'bClear',
 'queueList', 'mapCv', 'navCard', 'navArrow', 'navName', 'navDist', 'navEta', 'bStopNav', 'zIn', 'zOut', 'mapScale',
 'placeTabs', 'placeList', 'pinName', 'bMarkHere', 'bMarkWp', 'spdNum', 'spdUnit', 'spdSub', 'roseArrow', 'cmpDir', 'cmpDeg',
 'carStreet', 'carZone', 'gFuel', 'gEng', 'gBody', 'vFuel', 'vEng', 'vBody', 'seatNum', 'swatches', 'unitSeg', 'outsideGroup',
 'swOutside', 'clock', 'where', 'mArt', 'mTitle', 'mSub', 'mNav', 'mNavArrow', 'mNavDist', 'mProg', 'btnHide', 'btnClose', 'toasts',
 'bLocate', 'pinCard', 'pcTitle', 'pcCoords', 'pcName', 'pcGo', 'pcSave', 'pcShare', 'pcClose',
 'homeNpT', 'homeNpA', 'homeNavT', 'homeNavD', 'splash',
].forEach(id => { E[id] = document.getElementById(id); });

/* ═════════════════ derived info ═════════════════ */
const queueOf = car => car ? asArray(car.queue) : [];
const curTrack = () => {
  const car = S.car;
  return (car && car.index > 0) ? (queueOf(car)[car.index - 1] || null) : null;
};
const units = () => S.settings.units || S.cfg.units || 'kmh';

function fmtDist(m) {
  if (units() === 'mph') {
    const ft = m * 3.28084;
    return ft < 800 ? `${Math.round(ft / 50) * 50} ft` : `${(m / 1609.34).toFixed(1)} mi`;
  }
  return m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1)} km`;
}
function fmtEta(sec) {
  const min = Math.max(1, Math.round(sec / 60));
  return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
}

/* ═════════════════ toasts ═════════════════ */
function toast(msg, kind = 'info') {
  const t = h('div', { class: 'toast ' + kind, text: msg });
  E.toasts.append(t);
  setTimeout(() => t.classList.add('out'), 3600);
  setTimeout(() => t.remove(), 4000);
}

/* ═════════════════ layout ═════════════════ */
function fit() {
  const s = Math.min(innerWidth * 0.72 / 1040, innerHeight * 0.80 / 600, 1.9);
  S.scale = s;
  E.stage.style.transform = `translate(-50%, -50%) scale(${s})`;
  E.mini.style.zoom = clamp(innerHeight / 1000, 0.8, 2);
}
addEventListener('resize', fit);

function applyAccent() {
  const c = S.settings.accent;
  const n = parseInt(c.slice(1), 16);
  document.documentElement.style.setProperty('--accent', c);
  document.documentElement.style.setProperty('--accent-rgb', `${n >> 16}, ${(n >> 8) & 255}, ${n & 255}`);
  $$('.sw').forEach(b => b.classList.toggle('active', b.dataset.c === c));
}

function setTab(tab) {
  S.tab = tab;
  $$('.ra, .home').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + tab));
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  if (tab === 'maps') { renderPlaces(); drawMap(); }
}

/* ═════════════════ sliders ═════════════════ */
function slider(bar, { onInput, onCommit }) {
  let drag = false;
  const frac = e => {
    const r = bar.getBoundingClientRect();
    return clamp((e.clientX - r.left) / r.width, 0, 1);
  };
  bar.addEventListener('mousedown', e => { drag = true; bar._drag = true; bar.classList.add('dragging'); onInput(frac(e)); e.preventDefault(); });
  addEventListener('mousemove', e => { if (drag) onInput(frac(e)); });
  addEventListener('mouseup', e => {
    if (!drag) return;
    drag = false; bar._drag = false; bar.classList.remove('dragging');
    onCommit(frac(e));
  });
}

function setBar(fill, knob, f) {
  fill.style.width = (f * 100) + '%';
  knob.style.left = (f * 100) + '%';
}

/* ═════════════════ music ═════════════════ */
function renderState() {
  const car = S.car;
  const cur = curTrack();

  E.npTitle.textContent  = cur ? cur.title  : 'Not Playing';
  E.npAuthor.textContent = cur ? cur.author : 'Paste a YouTube link to start';
  E.mTitle.textContent   = cur ? cur.title : 'CarPlay';
  E.homeNpT.textContent  = cur ? cur.title : 'Not Playing';
  E.homeNpA.textContent  = cur ? cur.author : 'Open Music to start';
  if (cur) E.mSub.textContent = cur.author;
  else E.mSub.innerHTML = 'Press <kbd class="kn">' + (S.cfg.cursorKey || 'F9') + '</kbd> to interact';

  const thumb = cur && cur.thumb ? cur.thumb : '';
  if (thumb !== S.artSrc) {
    S.artSrc = thumb;
    [E.artImg, E.mArt].forEach(img => {
      img.classList.remove('show');
      if (thumb) { img.onload = () => img.classList.add('show'); img.src = thumb; } else { img.removeAttribute('src'); }
    });
  }

  const paused = !cur || car.paused;
  E.art.classList.toggle('paused', paused);
  E.bPlay.firstChild.firstChild.setAttribute('href', paused ? '#i-play' : '#i-pause');

  E.bShuffle.classList.toggle('on', !!(car && car.shuffle));
  const loop = car ? car.loop || 0 : 0;
  E.bLoop.classList.toggle('on', loop > 0);
  E.bLoop.firstChild.firstChild.setAttribute('href', loop === 2 ? '#i-repeat1' : '#i-repeat');

  const vol = car && typeof car.volume === 'number' ? car.volume : 0.5;
  if (!E.volBar._drag) setBar(E.volFill, E.volKnob, vol);
  E.bMute.firstChild.firstChild.setAttribute('href', vol <= 0.001 ? '#i-mute' : '#i-vol');
  if (vol > 0.001) S.preMute = vol;

  E.swOutside.classList.toggle('on', !!(car && car.outside));

  renderQueue();
  if (!cur) { setBar(E.seekFill, E.seekKnob, 0); E.tCur.textContent = '0:00'; E.tDur.textContent = '0:00'; E.mProg.style.width = '0%'; }
}

function renderQueue() {
  const car = S.car, list = queueOf(car);
  E.queueList.replaceChildren();
  if (!list.length) {
    E.queueList.append(h('div', { class: 'empty', text: 'The queue is empty.\nAdd a YouTube link above and it will play for everyone in the car.' }));
    E.queueList.firstChild.style.whiteSpace = 'pre-line';
    return;
  }
  list.forEach((t, i) => {
    const isCur = car.index === i + 1;
    const th = h('div', { class: 'th' });
    if (t.thumb) th.append(h('img', { src: t.thumb, alt: '' }));
    if (isCur) th.append(h('div', { class: 'eq' + (car.paused ? ' off' : '') }, h('i'), h('i'), h('i')));
    E.queueList.append(
      h('li', { class: 'qi' + (isCur ? ' cur' : ''), onclick: () => act('play', i + 1) },
        th,
        h('div', { class: 'txt' }, h('div', { class: 't', text: t.title }), h('div', { class: 'a', text: `${t.author}${t.by ? ' · added by ' + t.by : ''}` })),
        h('button', { class: 'x', title: 'Remove', onclick: e => { e.stopPropagation(); act('remove', i + 1); } }, icon('close')),
      ));
  });
  const curEl = $('.qi.cur', E.queueList);
  if (curEl) curEl.scrollIntoView({ block: 'nearest' });
}

function addLink(mode) {
  const v = E.linkInput.value.trim();
  if (!v) { toast('Paste a YouTube link first.', 'error'); return; }
  act('add', v, mode);
  E.linkInput.value = '';
}

E.bPlay.onclick    = () => { if (curTrack()) act('toggle'); else E.linkInput.focus(); };
E.bNext.onclick    = () => act('next');
E.bPrev.onclick    = () => act('prev');
E.bShuffle.onclick = () => act('shuffle', !(S.car && S.car.shuffle));
E.bLoop.onclick    = () => act('loop', ((S.car && S.car.loop) || 0) + 1 > 2 ? 0 : ((S.car && S.car.loop) || 0) + 1);
E.bClear.onclick   = () => act('clear');
E.bAdd.onclick     = () => addLink('queue');
E.bNow.onclick     = () => addLink('now');
E.linkInput.addEventListener('keydown', e => { if (e.key === 'Enter') addLink('queue'); });
E.bMute.onclick    = () => {
  const vol = S.car && typeof S.car.volume === 'number' ? S.car.volume : 0.5;
  act('volume', vol <= 0.001 ? (S.preMute || 0.5) : 0);
};

let volThrottle = 0;
slider(E.volBar, {
  onInput: f => {
    setBar(E.volFill, E.volKnob, f);
    const t = performance.now();
    if (t - volThrottle > 150) { volThrottle = t; act('volume', f); }
  },
  onCommit: f => act('volume', f),
});
slider(E.seekBar, {
  onInput: f => {
    setBar(E.seekFill, E.seekKnob, f);
    E.tCur.textContent = fmtTime(f * S.dur);
  },
  onCommit: f => { if (S.dur > 0 && curTrack()) act('seek', Math.floor(f * S.dur)); },
});

/* ═════════════════ maps ═════════════════ */
function allPlaces() {
  const d = S.dash;
  const dist = p => d ? Math.hypot(p.x - d.x, p.y - d.y) : 0;
  let list;
  if (S.placeTab === 'saved')       list = asArray(S.pins).map(p => ({ ...p, kind: 'saved' }));
  else if (S.placeTab === 'shared') list = asArray(S.shared).map(p => ({ ...p, kind: 'shared' }));
  else                              list = asArray(S.cfg.places).map(p => ({ ...p, kind: 'places' }));
  return d ? list.sort((a, b) => dist(a) - dist(b)) : list;
}

function renderPlaces() {
  $$('#placeTabs button').forEach(b => b.classList.toggle('active', b.dataset.pt === S.placeTab));
  E.placeList.replaceChildren();
  const list = allPlaces();
  if (!list.length) {
    const msg = S.placeTab === 'saved' ? 'No saved pins yet.\nUse "Mark here" to save where you are.'
              : S.placeTab === 'shared' ? 'Nothing shared yet.\nPassengers can send you destinations.' : 'No places configured.';
    const e = h('div', { class: 'empty', text: msg }); e.style.whiteSpace = 'pre-line'; e.style.height = '120px';
    E.placeList.append(e);
    return;
  }
  list.forEach(p => {
    const row = h('li', { class: 'pl', 'data-x': p.x, 'data-y': p.y, onclick: () => post('gpsSet', { x: p.x, y: p.y, z: p.z, name: p.name }) },
      h('div', { class: 'pic ' + p.kind }, icon(p.kind === 'shared' ? 'send' : 'pin')),
      h('div', { class: 'txt' }, h('div', { class: 'n', text: p.name }), h('div', { class: 'd', 'data-from': p.from ? `from ${p.from}` : '' })),
      h('button', { class: 'ib', title: 'Share with passengers', onclick: e => { e.stopPropagation(); post('pinShare', { x: p.x, y: p.y, z: p.z, name: p.name }); } }, icon('send')),
      p.kind === 'saved' ? h('button', { class: 'ib del', title: 'Delete pin', onclick: e => { e.stopPropagation(); post('pinDelete', { id: p.id }); } }, icon('trash')) : null,
    );
    E.placeList.append(row);
  });
  updatePlaceInfo();
}

function updatePlaceInfo() {
  const d = S.dash;
  $$('#placeList .pl').forEach(row => {
    const x = +row.dataset.x, y = +row.dataset.y;
    const label = $('.d', row);
    if (d) {
      const dist = fmtDist(Math.hypot(x - d.x, y - d.y));
      const from = label.dataset.from || '';
      label.textContent = from ? `${dist} · ${from}` : dist;
    }
    row.classList.toggle('active', !!(S.nav && Math.abs(S.nav.x - x) < 1 && Math.abs(S.nav.y - y) < 1));
  });
}

$$('#placeTabs button').forEach(b => b.onclick = () => { S.placeTab = b.dataset.pt; renderPlaces(); });
E.bStopNav.onclick = () => post('gpsClear');
E.bMarkHere.onclick = () => { post('pinHere', { name: E.pinName.value }); E.pinName.value = ''; S.placeTab = 'saved'; };
E.bMarkWp.onclick   = () => { post('pinWaypoint', { name: E.pinName.value }); E.pinName.value = ''; S.placeTab = 'saved'; };

function bearingTo(d, tx, ty) {
  const dest = Math.atan2(tx - d.x, ty - d.y) * 180 / Math.PI;     // clockwise from north
  const veh  = (360 - d.heading) % 360;
  return dest - veh;
}

function renderNav() {
  const n = S.nav, d = S.dash;
  E.navCard.classList.toggle('hidden', !n);
  E.mNav.classList.toggle('hidden', !n);
  E.homeNavT.textContent = n ? n.name : 'No destination';
  E.homeNavD.textContent = n ? `${fmtDist(n.dist)} · ${fmtEta(n.eta)}` : 'Tap to open Maps';
  if (!n || !d) return;
  const rel = bearingTo(d, n.x, n.y);
  E.navName.textContent = n.name;
  E.navDist.textContent = fmtDist(n.dist);
  E.navEta.textContent  = fmtEta(n.eta);
  E.navArrow.style.transform  = `rotate(${rel}deg)`;
  E.mNavArrow.style.transform = `rotate(${rel}deg)`;
  E.mNavDist.textContent = fmtDist(n.dist);
}

/* ───── GTA map: pan (drag), zoom (wheel / buttons), click anywhere to drop a pin ───── */
const M = { cx: 0, cy: 0, scale: 0.12, follow: true, img: null, src: '', ok: false, drop: null, hover: null };
const MIN_SCALE = 0.02, MAX_SCALE = 1.2;
const mapCfg = () => {
  const c = S.cfg.map || {};
  return { image: c.image || 'img/map.jpg', b: Object.assign({ minX: -5661, maxX: 6694, minY: -4058, maxY: 8429 }, c.bounds || {}) };
};

function loadMapImg() {
  const c = mapCfg();
  if (M.img && M.src === c.image) return;
  M.src = c.image; M.ok = false;
  const im = new Image();
  im.onload  = () => { M.ok = true; drawMap(); };
  im.onerror = () => { M.ok = false; drawMap(); };
  im.src = c.image;
  M.img = im;
}

function mapMarkers() {
  return [
    ...asArray(S.cfg.places).map(p => ({ ...p, c: '#0a84ff' })),
    ...asArray(S.pins).map(p => ({ ...p, c: '#ff9f0a' })),
    ...asArray(S.shared).map(p => ({ ...p, c: '#bf5af2' })),
  ];
}

function mapDims() { return [E.mapCv.clientWidth, E.mapCv.clientHeight]; }
function toWorld(px, py) {
  const [W, H] = mapDims();
  return [M.cx + (px - W / 2) / M.scale, M.cy - (py - H / 2) / M.scale];
}
function cvPoint(e) {
  const r = E.mapCv.getBoundingClientRect();
  const k = r.width ? E.mapCv.clientWidth / r.width : 1;
  return [(e.clientX - r.left) * k, (e.clientY - r.top) * k];
}

function drawPin(ctx, x, y, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff'; ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-9.6, -19); ctx.lineTo(9.6, -19); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(0, -25, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -25, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawMap() {
  const cv = E.mapCv;
  const [W, H] = mapDims();
  if (!W || !H) return;
  if (cv.width !== W * 2 || cv.height !== H * 2) { cv.width = W * 2; cv.height = H * 2; }
  const ctx = cv.getContext('2d');
  ctx.setTransform(2, 0, 0, 2, 0, 0);

  const { b } = mapCfg();
  const d = S.dash;
  if (M.follow && d) { M.cx = d.x; M.cy = d.y; }
  M.cx = clamp(M.cx, b.minX, b.maxX); M.cy = clamp(M.cy, b.minY, b.maxY);
  const sx = x => W / 2 + (x - M.cx) * M.scale;
  const sy = y => H / 2 - (y - M.cy) * M.scale;

  ctx.fillStyle = '#0e1319'; ctx.fillRect(0, 0, W, H);

  if (M.ok) {
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(M.img, sx(b.minX), sy(b.maxY), (b.maxX - b.minX) * M.scale, (b.maxY - b.minY) * M.scale);
  } else {
    // no map picture installed yet: coordinate grid so pins / navigation still work
    ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 1;
    const step = M.scale > 0.25 ? 250 : M.scale > 0.06 ? 1000 : 2000;
    for (let x = Math.ceil(b.minX / step) * step; x <= b.maxX; x += step) { ctx.beginPath(); ctx.moveTo(sx(x), 0); ctx.lineTo(sx(x), H); ctx.stroke(); }
    for (let y = Math.ceil(b.minY / step) * step; y <= b.maxY; y += step) { ctx.beginPath(); ctx.moveTo(0, sy(y)); ctx.lineTo(W, sy(y)); ctx.stroke(); }
    ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.font = '600 13px sans-serif';
    ctx.fillText('Map picture missing – add html/img/map.jpg', W / 2, 78);
  }

  // trail
  if (S.trail.length > 1) {
    ctx.lineJoin = ctx.lineCap = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(10,132,255,.55)';
    ctx.beginPath();
    S.trail.forEach(([x, y], i) => { i ? ctx.lineTo(sx(x), sy(y)) : ctx.moveTo(sx(x), sy(y)); });
    ctx.stroke();
  }

  // places / saved / shared
  ctx.textAlign = 'center'; ctx.font = '700 11px sans-serif'; ctx.lineJoin = 'round';
  mapMarkers().forEach(p => {
    const px = sx(p.x), py = sy(p.y);
    if (px < -20 || py < -20 || px > W + 20 || py > H + 20) return;
    ctx.fillStyle = p.c; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px, py, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (M.scale > 0.08) {
      const t = p.name.length > 22 ? p.name.slice(0, 21) + '…' : p.name;
      ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.strokeText(t, px, py - 11);
      ctx.fillStyle = '#fff'; ctx.fillText(t, px, py - 11);
    }
  });

  // route line + destination
  if (S.nav) {
    if (d) {
      ctx.setLineDash([8, 7]); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,132,255,.95)';
      ctx.beginPath(); ctx.moveTo(sx(d.x), sy(d.y)); ctx.lineTo(sx(S.nav.x), sy(S.nav.y)); ctx.stroke(); ctx.setLineDash([]);
    }
    drawPin(ctx, sx(S.nav.x), sy(S.nav.y), '#0a84ff');
  }

  // dropped pin
  if (M.drop) drawPin(ctx, sx(M.drop.x), sy(M.drop.y), '#ff453a');

  // my car (north-up map -> the arrow turns with the car)
  if (d) {
    const ang = ((360 - d.heading) % 360) * Math.PI / 180;
    const px = sx(d.x), py = sy(d.y);
    ctx.fillStyle = 'rgba(10,132,255,.22)'; ctx.beginPath(); ctx.arc(px, py, 20, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(px, py); ctx.rotate(ang);
    ctx.fillStyle = '#0a84ff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(10, 11); ctx.lineTo(0, 6); ctx.lineTo(-10, 11); ctx.closePath();
    ctx.stroke(); ctx.fill();
    ctx.restore();
  }

  E.bLocate.classList.toggle('on', M.follow);
  const hv = M.hover ? `X ${Math.round(M.hover[0])} · Y ${Math.round(M.hover[1])}   ` : '';
  E.mapScale.textContent = hv + (M.follow ? 'following your car' : 'free view');
}

function setZoom(f, px, py) {
  const [W, H] = mapDims();
  const old = M.scale;
  M.scale = clamp(M.scale * f, MIN_SCALE, MAX_SCALE);
  if (!M.follow && px != null && M.scale !== old) {          // zoom around the cursor
    const wx = M.cx + (px - W / 2) / old, wy = M.cy - (py - H / 2) / old;
    M.cx = wx - (px - W / 2) / M.scale; M.cy = wy + (py - H / 2) / M.scale;
  }
  drawMap();
}

let mDrag = null;
E.mapCv.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  const [px, py] = cvPoint(e);
  mDrag = { px, py, cx: M.cx, cy: M.cy, moved: false };
});
addEventListener('mousemove', e => {
  if (!S.interactive || S.tab !== 'maps') return;
  const [px, py] = cvPoint(e);
  if (mDrag) {
    const dx = px - mDrag.px, dy = py - mDrag.py;
    if (Math.hypot(dx, dy) > 4) mDrag.moved = true;
    if (mDrag.moved) { M.follow = false; M.cx = mDrag.cx - dx / M.scale; M.cy = mDrag.cy + dy / M.scale; }
  }
  M.hover = (e.target === E.mapCv || mDrag) ? toWorld(px, py) : null;
  if (mDrag || e.target === E.mapCv) drawMap();
});
addEventListener('mouseup', e => {
  if (!mDrag) return;
  const dr = mDrag; mDrag = null;
  if (dr.moved || e.target !== E.mapCv) return;
  const [px, py] = cvPoint(e);
  // clicking an existing marker selects it, otherwise drop a brand new pin
  const [W, H] = mapDims();
  let hit = null;
  mapMarkers().forEach(p => {
    const dd = Math.hypot(W / 2 + (p.x - M.cx) * M.scale - px, H / 2 - (p.y - M.cy) * M.scale - py);
    if (dd < 12 && (!hit || dd < hit.dd)) hit = { p, dd };
  });
  if (hit) showPinCard(hit.p.x, hit.p.y, hit.p.name);
  else { const [x, y] = toWorld(px, py); showPinCard(x, y, ''); }
});
E.mapCv.addEventListener('wheel', e => {
  e.preventDefault();
  const [px, py] = cvPoint(e);
  setZoom(e.deltaY < 0 ? 1.25 : 1 / 1.25, px, py);
}, { passive: false });

function showPinCard(x, y, name) {
  M.drop = { x, y, name };
  E.pcTitle.textContent = name || 'Dropped pin';
  E.pcCoords.textContent = `X ${Math.round(x)} · Y ${Math.round(y)}`;
  E.pcName.value = name || '';
  E.pinCard.classList.remove('hidden');
  drawMap();
}
function hidePinCard() { M.drop = null; E.pinCard.classList.add('hidden'); drawMap(); }

const dropName = () => (E.pcName.value.trim() || (M.drop && M.drop.name) || 'Dropped pin');
E.pcGo.onclick    = () => { if (!M.drop) return; post('gpsSet', { x: M.drop.x, y: M.drop.y, name: dropName() }); hidePinCard(); };
E.pcSave.onclick  = () => { if (!M.drop) return; post('pinAt', { x: M.drop.x, y: M.drop.y, name: dropName() }); S.placeTab = 'saved'; hidePinCard(); renderPlaces(); };
E.pcShare.onclick = () => { if (!M.drop) return; post('pinShare', { x: M.drop.x, y: M.drop.y, name: dropName() }); };
E.pcClose.onclick = hidePinCard;
E.zIn.onclick     = () => setZoom(1.5);
E.zOut.onclick    = () => setZoom(1 / 1.5);
E.bLocate.onclick = () => { M.follow = true; drawMap(); };

/* ═════════════════ vehicle ═════════════════ */
const CARD = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
function meter(el, label, v) {
  v = clamp(v, 0, 100);
  el.style.width = v + '%';
  el.style.background = v < 25 ? '#ff453a' : v < 50 ? '#ff9f0a' : '#30d158';
  label.textContent = Math.round(v) + '%';
}
function renderCar() {
  const d = S.dash;
  if (!d) return;
  const spd = d.speed * (units() === 'mph' ? 2.23694 : 3.6);
  E.spdNum.textContent = Math.round(spd);
  E.spdUnit.textContent = units() === 'mph' ? 'mph' : 'km/h';
  E.spdSub.textContent = spd < 1 ? 'Stationary' : spd < 60 ? 'Cruising' : 'Moving fast';

  const b = (360 - d.heading + 360) % 360;
  E.cmpDir.textContent = CARD[Math.round(b / 45) % 8];
  E.cmpDeg.textContent = Math.round(b) + '°';
  E.roseArrow.style.transform = `rotate(${-b}deg)`;
  E.carStreet.textContent = d.street || '—';
  E.carZone.textContent = d.zone && d.zone !== 'NULL' ? d.zone : '';

  meter(E.gFuel, E.vFuel, d.fuel);
  meter(E.gEng, E.vEng, d.engine);
  meter(E.gBody, E.vBody, d.body);
  E.seatNum.textContent = d.seats;
}

/* ═════════════════ settings ═════════════════ */
ACCENTS.forEach(c => E.swatches.append(h('button', { class: 'sw', 'data-c': c, style: `background:${c}`, onclick: () => { S.settings.accent = c; saveSettings(); applyAccent(); drawMap(); } })));
$$('#unitSeg button').forEach(b => b.onclick = () => { S.settings.units = b.dataset.u; saveSettings(); syncUnits(); renderCar(); });
function syncUnits() { $$('#unitSeg button').forEach(b => b.classList.toggle('active', b.dataset.u === units())); }
E.swOutside.onclick = () => post('windows', { on: !(S.car && S.car.outside) });

/* ═════════════════ tick ═════════════════ */
function onTick() {
  const d = S.dash;
  if (d) {
    const hr = d.hour, mn = String(d.minute).padStart(2, '0');
    E.clock.textContent = `${hr % 12 || 12}:${mn} ${hr < 12 ? 'AM' : 'PM'}`;
    E.where.textContent = [d.street, d.zone && d.zone !== 'NULL' ? d.zone : ''].filter(Boolean).join(' · ');
    const last = S.trail[S.trail.length - 1];
    if (!last || Math.hypot(last[0] - d.x, last[1] - d.y) > 12) {
      S.trail.push([d.x, d.y]);
      if (S.trail.length > 600) S.trail.shift();
    }
  }

  const f = S.dur > 0 ? clamp(S.pos / S.dur, 0, 1) : 0;
  if (!E.seekBar._drag) {
    setBar(E.seekFill, E.seekKnob, f);
    E.tCur.textContent = fmtTime(S.pos);
  }
  E.tDur.textContent = fmtTime(S.dur);
  E.mProg.style.width = (f * 100) + '%';

  renderNav();
  if (S.interactive) {
    if (S.tab === 'maps') { if (!mDrag) drawMap(); updatePlaceInfo(); }
    else if (S.tab === 'car') renderCar();
  }
}

/* ═════════════════ NUI messages ═════════════════ */
function setInteractive(on) {
  S.interactive = on;
  E.root.classList.toggle('interactive', on);
  if (!on && document.activeElement && document.activeElement.blur) document.activeElement.blur();
  if (on) { fit(); if (S.tab === 'maps') drawMap(); }
}

window.addEventListener('message', ev => {
  const d = ev.data || {};
  switch (d.action) {
    case 'open':
      S.cfg = d.cfg || S.cfg;
      S.open = true;
      E.root.classList.toggle('no-radio', d.radio !== true);
      S.trail = []; S.car = null; S.dash = null; S.nav = null;
      $$('.kn').forEach(k => k.textContent = S.cfg.cursorKey || 'F9');
      E.outsideGroup.classList.toggle('hidden', !S.cfg.allowOutside);
      E.root.classList.remove('hidden');
      M.follow = true; M.drop = null; M.hover = null; E.pinCard.classList.add('hidden');
      loadMapImg();
      setTab('home');
      E.splash.classList.remove('go'); void E.splash.offsetWidth; E.splash.classList.add('go');
      applyAccent(); syncUnits(); fit(); renderState(); renderPlaces();
      post('uiReady');
      break;
    case 'close':
      S.open = false;
      E.root.classList.add('hidden');
      E.root.classList.remove('interactive');
      break;
    case 'mode':
      setInteractive(!!d.interactive);
      break;
    case 'state':
      S.car = d.car || null;
      renderState();
      break;
    case 'tick':
      S.pos = d.pos || 0; S.dur = d.dur || 0; S.playing = !!d.playing;
      S.dash = d.dash || S.dash; S.nav = d.nav || null;
      onTick();
      break;
    case 'pins':
      S.pins = asArray(d.pins); S.shared = asArray(d.shared);
      if (S.tab === 'maps') renderPlaces();
      break;
    case 'toast':
      toast(d.msg || '', d.kind || 'info');
      break;
  }
});

/* ═════════════════ misc wiring ═════════════════ */
$$('[data-tab]').forEach(b => b.onclick = () => setTab(b.dataset.tab));
E.btnHide.onclick  = () => post('cursor', { on: false });
E.btnClose.onclick = () => post('close');

// typing in a text field pauses the game's keyboard controls (so letters don't drive the car)
['linkInput', 'pinName', 'pcName'].forEach(id => {
  E[id].addEventListener('focus', () => post('typing', { on: true }));
  E[id].addEventListener('blur',  () => post('typing', { on: false }));
  E[id].addEventListener('keydown', e => { if (e.key === 'Enter' && id !== 'linkInput') E[id].blur(); });
});

addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !S.interactive) return;
  const ae = document.activeElement;
  if (ae && ae.tagName === 'INPUT') ae.blur();
  else post('cursor', { on: false });
});

applyAccent();
fit();
})();
