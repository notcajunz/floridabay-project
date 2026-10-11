const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const resource =
  typeof GetParentResourceName === "function"
    ? GetParentResourceName()
    : "fbrp_core";
const post = (name, body = {}) =>
  fetch(`https://${resource}/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
    .then((r) => r.json())
    .catch(() => ({ ok: false }));
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>'"]/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        c
      ],
  );
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

let currentView = null;
let currentPayload = {};
let menuLocked = false;
let lastHud = {};
let thirdEyePayload = null;
const ui = { garageCategory: null, showCharacterForm: false };

/* ───────── Icons ───────── */
const ICONS = {
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4M8 21h8"/>',
  power: '<path d="M12 3v8M6.4 6.4a8 8 0 1 0 11.2 0"/>',
  belt: '<circle cx="12" cy="5" r="2.2"/><path d="M8 21v-7a4 4 0 0 1 8 0v7M7 10.5l10 8"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.6-1.8"/>',
  gauge: '<path d="M12 14l4-4M3.5 18a9 9 0 1 1 17 0"/>',
  fuel: '<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M4 10h10M14 8h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V9l-3-3"/>',
  hood: '<path d="M3 15l3-6h12l3 6M3 15v4h18v-4M8 9l1-4h6l1 4"/>',
  trunk: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M3 12h18M10 16h4"/>',
  door: '<path d="M5 21V8l6-5h8v18zM5 21h14M5 11h14M15 15h2"/>',
  cuffs: '<circle cx="7" cy="15" r="4"/><circle cx="17" cy="15" r="4"/><path d="M7 11V8a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3"/>',
  zip: '<path d="M4 15c0-4.4 3.6-8 8-8s8 3.6 8 8-3.6 4-8 4"/><path d="M12 16v6M9 19h6"/>',
  gavel: '<path d="M14 13l-7.5 7.5a2.1 2.1 0 0 1-3-3L11 10M16 16l6-6M8 8l6-6M9 7l8 8M21 11l-8-8"/>',
  walk: '<circle cx="13" cy="4" r="2"/><path d="M7 21l3-6 3 2v6M13 17l-2-5 3-3 3 3 3 1M10 12l-3 1-1 3"/>',
  seat: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>',
  unseat: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  id: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.5-1.4 1.6-2 3-2s2.5.6 3 2M15 10h3M15 14h3"/>',
  eyeoff: '<path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A9.8 9.8 0 0 1 12 5c5 0 9 4.5 10 7a12 12 0 0 1-3 4M6.6 6.6C4.2 8 2.6 10.2 2 12c1 2.5 5 7 10 7 1.8 0 3.4-.5 4.8-1.3"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  siren: '<path d="M7 18v-6a5 5 0 0 1 10 0v6M5 21h14v-3H5zM12 3v2M4.2 6.2l1.4 1.4M19.8 6.2l-1.4 1.4"/>',
  pin: '<path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  car: '<path d="M3 17v-4l2-5.5A2 2 0 0 1 6.9 6h10.2a2 2 0 0 1 1.9 1.5L21 13v4h-3v2h-2v-2H8v2H6v-2z"/><path d="M3 13h18"/><circle cx="7.5" cy="15" r=".6"/><circle cx="16.5" cy="15" r=".6"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  "heart-pulse": '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 12 5a5.5 5.5 0 0 0-10 3.5c0 2.3 1.5 4 3 5.5l7 7z"/><path d="M3.5 12h5l1-2 2 4 1-2h8"/>',
  sparkles: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
  fish: '<path d="M2 12s4-6 11-6c4 0 7 3 9 6-2 3-5 6-9 6-7 0-11-6-11-6z"/><path d="M2 12l-1-3M2 12l-1 3"/><circle cx="16" cy="11" r=".8"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5zM4 21.5A2.5 2.5 0 0 1 6.5 19H20v3H6.5"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
};
const icon = (name) =>
  `<svg class="i" viewBox="0 0 24 24">${ICONS[name] || ICONS.info}</svg>`;
function hydrate(root = document) {
  $$("[data-icon]", root).forEach((node) => {
    if (node.dataset.drawn === node.dataset.icon) return;
    node.innerHTML = icon(node.dataset.icon);
    node.dataset.drawn = node.dataset.icon;
  });
}

/* ───────── Scaling ───────── */
function rescale() {
  document.documentElement.style.setProperty(
    "--s",
    clamp(window.innerHeight / 1080, 0.7, 2.2).toFixed(3),
  );
}
window.addEventListener("resize", rescale);
rescale();

/* ───────── Compass tape ───────── */
const PX_PER_DEG = 3.2;
const TAPE_WIDTH = 380;
const CARDINALS = { 0: "N", 45: "NE", 90: "E", 135: "SE", 180: "S", 225: "SW", 270: "W", 315: "NW" };
(function buildTape() {
  const track = $("#tape-track");
  let html = "";
  for (let d = -180; d <= 540; d += 5) {
    const x = (d + 180) * PX_PER_DEG;
    const norm = ((d % 360) + 360) % 360;
    html += `<i class="t${norm % 15 === 0 ? " mid" : ""}" style="left:${x}px"></i>`;
    if (norm % 45 === 0)
      html += `<span class="lbl card${norm === 0 ? " north" : ""}" style="left:${x}px">${CARDINALS[norm]}</span>`;
    else if (norm % 15 === 0)
      html += `<span class="lbl" style="left:${x}px">${norm}</span>`;
  }
  track.style.width = `${720 * PX_PER_DEG}px`;
  track.innerHTML = html;
})();
let tapeHeading = null;
function setHeading(h) {
  const track = $("#tape-track");
  if (tapeHeading === null) {
    tapeHeading = h + 360;
  } else {
    let delta = (((h - (tapeHeading % 360)) % 360) + 540) % 360 - 180;
    tapeHeading += delta;
  }
  if (tapeHeading < 0 || tapeHeading >= 360) {
    tapeHeading = ((tapeHeading % 360) + 360) % 360;
    track.style.transition = "none";
    track.style.transform = `translateX(${TAPE_WIDTH / 2 - (tapeHeading + 180) * PX_PER_DEG}px)`;
    void track.offsetWidth;
    track.style.transition = "";
    return;
  }
  track.style.transform = `translateX(${TAPE_WIDTH / 2 - (tapeHeading + 180) * PX_PER_DEG}px)`;
}

/* ───────── Gauge ticks ───────── */
(function buildGauge() {
  const cx = 110, cy = 92;
  let html = "";
  for (let i = 0; i <= 20; i++) {
    const a = ((210 - i * 12) * Math.PI) / 180;
    const major = i % 2 === 0;
    const r1 = major ? 68 : 71, r2 = 76;
    html += `<line class="${major ? "major" : ""}" x1="${(cx + r1 * Math.cos(a)).toFixed(1)}" y1="${(cy - r1 * Math.sin(a)).toFixed(1)}" x2="${(cx + r2 * Math.cos(a)).toFixed(1)}" y2="${(cy - r2 * Math.sin(a)).toFixed(1)}"/>`;
  }
  $("#gauge-ticks").innerHTML = html;
})();

/* ───────── Helpers ───────── */
function setText(selector, value) {
  const node = $(selector);
  if (node && node.textContent !== String(value ?? "")) node.textContent = value ?? "";
}
function setTone(selector, tone) {
  const node = $(selector);
  if (node) node.className = tone ? `tone-${tone}` : "";
}
function hexLuma(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return 1;
  const n = parseInt(m[1], 16);
  return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}
const safeColor = (c) => (/^#[0-9a-f]{6}$/i.test(String(c || "")) ? c : "#ffffff");

/* ───────── HUD ───────── */
const PRIORITY = {
  available: ["Available", "ok"],
  active: ["In Progress", "bad"],
  cooldown: ["Cooldown", "warn"],
  hold: ["On Hold", "bad"],
};
function priorityDisplay(status, remaining) {
  const [label, tone] = PRIORITY[status] || PRIORITY.available;
  return [status === "cooldown" ? `Cooldown · ${Number(remaining) || 0}m` : label, tone];
}
function voiceInfo(data) {
  const dist = Number(data.voice) || 0;
  const level = dist && dist <= 2 ? 1 : dist && dist <= 4 ? 2 : dist ? 3 : 2;
  const fallback = ["", "Whisper", "Normal", "Shout"][level];
  return { level, label: data.voiceMode || fallback };
}

function updateHud(data) {
  lastHud = data;
  $("#hud").classList.toggle("is-hidden", data.visible === false);

  // Compass
  setHeading(Number(data.heading) || 0);
  setText("#direction", data.direction);
  setText("#heading", `${String(data.heading || 0).padStart(3, "0")}°`);
  setText("#street", data.location?.street || "Unknown road");
  setText("#zone", [data.location?.cross, data.location?.zone].filter(Boolean).join(" · "));

  // Status
  setText("#game-time", data.gameTime);
  setText("#aop", data.aop);
  const priority = data.priority || {};
  const [pText, pTone] = priorityDisplay(priority.status, priority.remaining);
  setText("#priority-label", priority.zone ? `Priority · ${priority.zone}` : "Priority");
  setText("#priority", pText);
  setTone("#priority", pTone);
  setText("#peacetime", data.peacetime ? "In effect" : "Off");
  setTone("#peacetime", data.peacetime ? "warn" : "dim");
  for (const [sel, tag] of [["#hud-headtag", data.headtag], ["#hud-gangtag", data.gangtag]]) {
    setText(sel, tag?.label || "None");
    const node = $(sel);
    node.className = tag?.label ? "" : "tone-dim";
    node.style.color = tag?.label ? safeColor(tag.color) : "";
  }
  setText("#hud-org", data.organization ? data.organization.slug || data.organization.name : "Off duty");
  setTone("#hud-org", data.organization ? "" : "dim");
  $("#staff-pill").classList.toggle("hidden", !data.staffDuty);

  // Dock - flush against the radar
  const L = data.layout;
  if (L) {
    const dock = $("#dock");
    const left = (L.radar ? L.right : L.left) * window.innerWidth + 10;
    const bottom = (1 - L.bottom) * window.innerHeight;
    dock.style.left = `${Math.round(left)}px`;
    dock.style.bottom = `${Math.round(bottom)}px`;
  }
  setText("#player-id", data.id);
  const v = voiceInfo(data);
  setText("#voice", v.label);
  $$("#voice-range i").forEach((bar, i) => bar.classList.toggle("on", i < v.level));
  const onRadio = data.radio && data.radio !== 0;
  setText("#radio", onRadio ? `Radio ${data.radio}` : "Proximity");
  $("#voice-box").classList.toggle("talking", !!data.talking);
  $("#voice-box").classList.toggle("on-radio", !!onRadio);

  // Vehicle
  const car = data.vehicle || {};
  $("#vehicle-hud").classList.toggle("hidden", !car.inVehicle);
  if (car.inVehicle) {
    setText("#speed", car.speed ?? 0);
    const rpm = clamp(Number(car.rpm) || 0, 0, 100);
    const arc = $("#rpm-arc");
    arc.style.strokeDasharray = `${rpm} 100`;
    arc.classList.toggle("redline", rpm >= 88);
    setText("#gear", car.gear === 0 ? "R" : car.speed === 0 && rpm <= 22 ? "N" : car.gear);
    const fuel = clamp(Number(car.fuel) || 0, 0, 100);
    setText("#fuel", fuel);
    $("#fuel-bar").style.width = `${fuel}%`;
    $(".fuel").classList.toggle("low", fuel <= 15);
    const flag = (id, cls) => {
      const n = $(id);
      n.classList.remove("on", "bad", "warn");
      if (cls) n.classList.add(cls);
    };
    flag("#engine-flag", car.engine ? "on" : "bad");
    flag("#belt-flag", car.seatbelt ? "on" : car.speed > 10 ? "warn" : null);
    flag("#lock-flag", car.locked ? "on" : null);
    flag("#cruise-flag", car.cruise ? "on" : null);
    const lock = $("#lock-flag");
    lock.dataset.icon = car.locked ? "lock" : "unlock";
    hydrate(lock.parentNode);
  }
}

function showRestraint(active, kind) {
  setText("#restraint-text", kind || "Restrained");
  $("#restraint").classList.toggle("hidden", !active);
}

/* ───────── Toasts & dispatch ───────── */
const TONE_ICON = { info: "info", success: "check", error: "alert", warning: "alert" };
function dismiss(node, delay) {
  setTimeout(() => {
    node.classList.add("leaving");
    setTimeout(() => node.remove(), 280);
  }, delay);
}
function notice(message, tone = "info") {
  const stack = $("#notifications");
  const ms = clamp(2600 + String(message || "").length * 45, 3500, 9000);
  const node = document.createElement("div");
  node.className = `toast ${esc(tone)}`;
  node.innerHTML = `<span class="toast-icon">${icon(TONE_ICON[tone] || "info")}</span><p>${esc(message)}</p><i class="timer" style="animation-duration:${ms}ms"></i>`;
  stack.append(node);
  while (stack.children.length > 4) stack.firstElementChild.remove();
  dismiss(node, ms);
}

const DISPATCH_KIND = {
  "911": ["911 Call", "alert", ""],
  "311": ["Non-emergency", "info", "calm"],
  PANIC: ["Officer panic", "siren", "panic"],
  EMS: ["Medical emergency", "heart-pulse", "panic"],
  PRISON: ["Prison break", "siren", "panic"],
  BOLO: ["Be on the lookout", "search", "calm"],
};
function dispatch(data) {
  const [title, glyph, tone] = DISPATCH_KIND[data.kind] || DISPATCH_KIND["911"];
  const panic = tone === "panic";
  const ms = panic ? 15000 : 12000;
  const node = document.createElement("div");
  node.className = `dispatch-card${tone ? ` ${tone}` : ""}`;
  const meta = [
    data.street ? `<span>${icon("pin")}${esc(data.street)}</span>` : "",
    Number.isFinite(data.distance) ? `<span>${icon("gauge")}${data.distance >= 1000 ? (data.distance / 1609).toFixed(1) + " mi" : Math.round(data.distance) + " m"}</span>` : "",
    `<span>${icon("user")}${esc(data.caller || "Unknown caller")}</span>`,
  ].join("");
  node.innerHTML = `<div class="dispatch-head"><span>${icon(glyph)}</span><b>${title}</b>${data.id ? `<em>#${esc(data.id)}</em>` : ""}</div><div class="dispatch-body"><p>${esc(data.message)}</p><div class="dispatch-meta">${meta}${data.id ? `<span>/respond ${esc(data.id)}</span>` : ""}</div></div><i class="timer" style="animation-duration:${ms}ms"></i>`;
  const stack = $("#dispatch");
  stack.prepend(node);
  while (stack.children.length > 3) stack.lastElementChild.remove();
  dismiss(node, ms);
}

/* ───────── Menu views ───────── */
const head = (title, sub, chip) =>
  `<div class="view-head"><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ""}</div>${chip ? `<span class="chip">${chip}</span>` : ""}</div>`;

function renderTags(data) {
  const selected = data.selected || {};
  const find = (kind) => (data[kind] || []).find((t) => Number(t.id) === Number(selected[kind]));
  const h = find("head");
  const g = find("gang");
  const id = data.serverId ?? lastHud.id ?? 0;
  const darkCls = (tag) => (tag && hexLuma(tag.color) < 0.24 ? "dark" : "");
  const preview = `
    <div class="tag-stage">
      <span class="stage-label">Preview</span>
      <div class="gta-head">${h ? `<span class="${darkCls(h)}" style="color:${safeColor(h.color)}">${esc(h.label)}</span> ` : ""}<span class="gid">[${Number(id) || 0}]</span></div>
      ${g ? `<div class="gta-sub ${darkCls(g)}" style="color:${safeColor(g.color)}">${esc(g.label)}</div>` : ""}
    </div>`;
  const list = (kind, title, rows) => {
    const sel = Number(selected[kind]) || 0;
    const row = (tid, label, color) => `
      <button class="tag-row${sel === tid ? " selected" : ""}" data-tag-kind="${kind}" data-tag-id="${tid}">
        <span class="swatch${tid ? "" : " none"}" style="--c:${safeColor(color)}"></span>
        <span class="name${tid ? (hexLuma(color) < 0.24 ? " dark" : "") : " muted"}" ${tid ? `style="color:${safeColor(color)}"` : ""}>${esc(label)}</span>
        <span class="tick">${icon("check")}</span>
      </button>`;
    return `<div><div class="eyebrow">${title}</div><div class="tag-list">${row(0, "None")}${(rows || []).map((t) => row(Number(t.id), t.label, t.color)).join("")}</div></div>`;
  };
  const total = (data.head || []).length + (data.gang || []).length;
  return `${head("Tag wardrobe", "Your headtag shows above your ID. Your gang tag sits underneath.", `<b>${total}</b> unlocked`)}${preview}
    <div class="tag-columns">${list("head", "Headtag", data.head)}${list("gang", "Gang tag", data.gang)}</div>`;
}

function renderVehicles(data) {
  const cats = data.categories || [];
  if (!cats.length) return `${head("Garage")}<div class="empty">You don't have access to any vehicles right now. Some sections only unlock while you're on duty.</div>`;
  if (!cats.some((c) => c.id === ui.garageCategory)) ui.garageCategory = cats[0].id;
  const active = cats.find((c) => c.id === ui.garageCategory);
  const rail = cats
    .map((c) => `<button class="${c.id === active.id ? "active" : ""}" data-garage-cat="${esc(c.id)}"><span data-icon="${esc(c.icon || "car")}"></span>${esc(c.label)}<small>${(c.vehicles || []).length}</small></button>`)
    .join("");
  const cards = (active.vehicles || [])
    .map(
      (v) => `<button class="vehicle-card" data-category="${esc(active.id)}" data-model="${esc(v.model)}">
        <div class="shot"><img src="https://docs.fivem.net/vehicles/${encodeURIComponent(String(v.model).toLowerCase())}.webp" alt="" data-fallback="${esc(active.icon || "car")}"></div>
        <div class="meta"><div><strong>${esc(v.label)}</strong><small>${esc(v.model)}</small></div><span class="go">Spawn</span></div>
      </button>`,
    )
    .join("");
  return `<div class="garage"><nav class="rail">${rail}</nav><div>${head(esc(active.label), "", `<b>${(active.vehicles || []).length}</b> vehicles`)}<div class="vehicle-grid">${cards}</div></div></div>`;
}

const ACTION_META = {
  softcuff: ["Restraints", "cuffs"],
  hardcuff: ["Restraints", "cuffs", "red"],
  ziptie: ["Restraints", "zip"],
  uncuff: ["Restraints", "unlock"],
  arrest: ["Custody", "gavel", "red"],
  escort: ["Custody", "walk"],
  seat: ["Custody", "seat"],
  unseat: ["Custody", "unseat"],
  search: ["Investigate", "search"],
  checkid: ["Investigate", "id"],
  blindfold: ["Blindfold", "eyeoff"],
  unblindfold: ["Blindfold", "eye"],
  gsr: ["Investigate", "search"],
  cite: ["Justice", "check"],
  jail: ["Justice", "gavel", "red"],
  revive: ["Medical", "heart-pulse", "red"],
  heal: ["Medical", "heart-pulse"],
  diagnose: ["Medical", "info"],
  showid: ["Identity", "id"],
};
function renderThirdEye(data) {
  thirdEyePayload = data || {};
  setText("#third-eye-name", `${data?.name || "Player"} [${Number(data?.target) || 0}]`);
  const rows = data?.actions || [];
  const groups = new Map();
  rows.forEach((action) => {
    const [group = "Other"] = ACTION_META[action.id] || [];
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(action);
  });
  let hotkey = 0;
  $("#third-eye-actions").innerHTML = rows.length
    ? [...groups].map(([group, actions]) => `<div class="third-eye-label">${esc(group)}</div>${actions.map((action) => {
        const [, glyph = "info", tone] = ACTION_META[action.id] || [];
        hotkey += 1;
        return `<button class="third-eye-action${tone ? ` tone-${tone}` : ""}" data-third-eye-action="${esc(action.id)}" data-hotkey="${hotkey <= 9 ? hotkey : ""}"><span class="ic" data-icon="${glyph}"></span><strong>${esc(action.label)}</strong>${hotkey <= 9 ? `<kbd>${hotkey}</kbd>` : ""}</button>`;
      }).join("")}`).join("")
    : '<div class="third-eye-empty">No interactions are available for this player.</div>';
  hydrate($("#third-eye-actions"));
}

function renderInteractions(data) {
  const rows = data.actions || [];
  if (!rows.length)
    return `${head(esc(data.name || "Player"))}<div class="empty">${esc(data.emptyMessage || "No actions are available on this player.")}</div>`;
  const groups = new Map();
  rows.forEach((a) => {
    const [group = "Other"] = ACTION_META[a.id] || [];
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(a);
  });
  let n = 0;
  const body = [...groups]
    .map(
      ([group, actions]) => `<div class="action-group"><div class="eyebrow">${esc(group)}</div><div class="action-grid">${actions
        .map((a) => {
          const [, ic = "info", tone] = ACTION_META[a.id] || [];
          n += 1;
          return `<button class="action-card${tone ? ` tone-${tone}` : ""}" data-action="${esc(a.id)}" data-target="${Number(data.target) || 0}" data-hotkey="${n <= 9 ? n : ""}"><span class="ic" data-icon="${ic}"></span><strong>${esc(a.label)}</strong>${n <= 9 ? `<kbd>${n}</kbd>` : ""}</button>`;
        })
        .join("")}</div></div>`,
    )
    .join("");
  return `${head(`${esc(data.name || "Player")}<em>[${Number(data.target) || 0}]</em>`, "Within arm's reach", `<b>${rows.length}</b> actions`)}${body}`;
}

function renderRadio(data) {
  const current = Number(data.current) || 0;
  const members = data.members || [];
  const channels = data.channels || [];
  const volume = Number(ui.radioVolume ?? 30);
  const channelRows = channels.map((c) => `
    <button class="radio-channel${current === Number(c.channel) ? " active" : ""}" data-radio-channel="${Number(c.channel)}" style="--radio-color:${safeColor(c.color)}">
      <span class="radio-frequency">${String(Number(c.channel)).padStart(3, "0")}</span>
      <span class="radio-channel-copy"><strong>${esc(c.name)}</strong><small>${esc(c.description || (c.restricted ? `${c.organization} duty only` : "Public frequency"))}</small></span>
      ${c.restricted ? '<span class="radio-lock">ORG</span>' : '<span class="radio-lock public">OPEN</span>'}
    </button>`).join("");
  const memberRows = members.map((m) => `
    <div class="radio-member${m.talking ? " talking" : ""}"><i></i><span>${esc(m.name)}</span><small>#${Number(m.id)}</small></div>`).join("");
  return `${head("Radio network", "Server-authorized frequencies powered by pma-voice.", current ? `<b>${String(current).padStart(3, "0")}</b> live` : "Offline")}
    <div class="radio-console${current ? " connected" : ""}" id="radio-console">
      <section class="radio-device">
        <div class="radio-screen">
          <div><small>CURRENT CHANNEL</small><strong>${esc(data.currentName || "Disconnected")}</strong></div>
          <b>${current ? String(current).padStart(3, "0") : "---"}</b>
        </div>
        <form id="radio-tune" class="radio-tune"><label>Direct frequency<input name="channel" type="number" min="1" max="${Number(data.maxChannel) || 999}" placeholder="1–999" required></label><button type="submit" class="primary-action">Connect</button></form>
        <label class="radio-volume"><span>Receive volume <b id="radio-volume-value">${volume}%</b></span><input id="radio-volume" type="range" min="0" max="100" value="${volume}"></label>
        <button class="radio-disconnect" data-radio-leave ${current ? "" : "disabled"}>Disconnect</button>
      </section>
      <section class="radio-directory"><div class="eyebrow">Channel directory</div><div class="radio-channels">${channelRows || '<div class="empty">No managed channels are available. Enter a public frequency directly.</div>'}</div></section>
      <section class="radio-roster"><div class="eyebrow">On frequency · ${members.length}</div><div class="radio-members">${memberRows || '<div class="empty compact">Nobody is connected.</div>'}</div><p>Hold <kbd>Left Alt</kbd> to transmit.</p></section>
    </div>`;
}

function characterForm() {
  return `<form id="character-form" class="character-form">
    <div class="eyebrow">New character</div>
    <div class="form-grid">
      <label>First name<input name="firstName" maxlength="40" required autocomplete="off"></label>
      <label>Last name<input name="lastName" maxlength="40" required autocomplete="off"></label>
      <label>Date of birth<input name="dateOfBirth" type="date" required></label>
      <label>Gender<input name="gender" maxlength="24" required autocomplete="off"></label>
    </div>
    <label>Biography<textarea name="backstory" maxlength="500" rows="3" placeholder="Optional - a few lines about who they are"></textarea></label>
    <div class="form-foot"><button type="submit" class="primary-action">${icon("plus")}Create character</button></div>
  </form>`;
}

function renderCharacters(data) {
  const rows = data.characters || [];
  const slots = Number(data.maxSlots) || 3;
  if (!rows.length) ui.showCharacterForm = true;
  const cards = [];
  for (let i = 0; i < slots; i++) {
    const c = rows[i];
    if (c) {
      const initials = `${esc(c.first_name?.[0] || "")}${esc(c.last_name?.[0] || "")}`;
      cards.push(`<button class="slot" data-character-id="${Number(c.id)}">
        <span class="num">Slot ${i + 1}</span>
        <span class="monogram">${initials}</span>
        <h3>${esc(c.first_name)} ${esc(c.last_name)}</h3>
        <div class="facts"><span>${esc(c.date_of_birth)}</span><span>${esc(c.gender)}</span></div>
        <p>${esc(c.backstory || "No biography yet.")}</p>
        <span class="play">Play ${icon("seat")}</span>
      </button>`);
    } else {
      cards.push(`<button class="slot empty-slot${ui.showCharacterForm ? " active" : ""}" data-new-character>
        <span class="plus" data-icon="plus"></span><b>New character</b><span class="num">Slot ${i + 1}</span>
      </button>`);
    }
  }
  return `${head("Select character", "Pick who you're playing as. Change your look with vMenu after you spawn.", `<b>${rows.length}</b> / ${slots} slots`)}
    <div class="slots">${cards.join("")}</div>
    ${rows.length < slots && ui.showCharacterForm ? characterForm() : ""}`;
}

const MAP = { minX: -3800, maxX: 4400, minY: -4000, maxY: 8000 };
function renderSpawns(data) {
  const rows = data.spawns || [];
  const cards = rows
    .map(
      (s) => `<button class="spawn-card" data-spawn-id="${esc(s.id)}" data-x="${Number(s.x)}" data-y="${Number(s.y)}" data-z="${Number(s.z)}" data-h="${Number(s.h || 0)}">
        <span class="pin" data-icon="pin"></span><span class="txt"><strong>${esc(s.label)}</strong><small>${esc(s.description || "")}</small></span>
      </button>`,
    )
    .join("");
  const dots = rows
    .map((s) => {
      const x = clamp((Number(s.x) - MAP.minX) / (MAP.maxX - MAP.minX), 0.04, 0.96);
      const y = clamp(1 - (Number(s.y) - MAP.minY) / (MAP.maxY - MAP.minY), 0.04, 0.96);
      return `<i class="dot${x > 0.6 ? " right" : ""}" data-dot="${esc(s.id)}" style="left:${(x * 100).toFixed(1)}%;top:${(y * 100).toFixed(1)}%"><span>${esc(s.label)}</span></i>`;
    })
    .join("");
  return `${head(`Welcome, ${esc(data.character?.name || "")}`, "Where do you want to start?", `<b>${rows.length}</b> locations`)}
    <div class="spawn-layout"><div class="spawn-list">${cards}</div><div class="spawn-map"><span class="map-label">San Andreas</span>${dots}</div></div>`;
}

function renderControl(data) {
  const sections = [];
  const aopSection = data.canAop
    ? `<section class="ctl-section${data.focus === "aop" ? " focus" : ""}">
        <div class="eyebrow">Area of play</div>
        <div class="aop-current"><small>Current</small><strong>${esc(data.aop)}</strong></div>
        <div class="aop-presets">${(data.presets || [])
          .map((p) => `<button class="ctl-btn${p === data.aop ? " on" : ""}" data-ctl="aop" data-value="${esc(p)}">${esc(p)}</button>`)
          .join("")}</div>
        <form class="aop-custom" id="aop-form"><input name="aop" maxlength="60" placeholder="Custom area of play…" autocomplete="off"><button type="submit" class="primary-action">Set AOP</button></form>
      </section>`
    : "";
  const peacetime = data.canPriority
    ? `<div class="pt-row"><div><b>Peacetime</b><small>${data.peacetime ? "In effect: no violent crime anywhere." : "Off"}</small></div>
        <button class="toggle${data.peacetime ? " on" : ""}" data-ctl="peacetime" data-value="${data.peacetime ? "off" : "on"}"><i></i></button></div>`
    : "";
  if (aopSection) sections.push(aopSection);
  if (data.canPriority) {
    const minutes = Number(ui.cooldownMinutes || data.cooldownDefault || 20);
    const card = (z) => {
      const [text, tone] = priorityDisplay(z.status, z.remaining);
      const btn = (status, label) =>
        `<button class="ctl-btn small s-${status}${z.status === status ? " on" : ""}" data-ctl="priority" data-zone="${esc(z.id)}" data-status="${status}">${label}</button>`;
      return `<div class="zone-card tone-${tone}">
        <div class="zone-head"><strong>${esc(z.label)}</strong><span class="zone-status tone-${tone}">${esc(text)}</span></div>
        <small class="zone-by">${z.by ? `Set by ${esc(z.by)}` : "No changes yet"}</small>
        <div class="zone-actions">${btn("available", "Available")}${btn("active", "In progress")}${btn("cooldown", "Cooldown")}${btn("hold", "Hold")}</div>
      </div>`;
    };
    sections.push(`<section class="ctl-section${data.focus === "priority" ? " focus" : ""}">
      <div class="eyebrow">Priority</div>
      <div class="ctl-toolbar">
        <label class="cd-input">Cooldown length<input id="cd-minutes" type="number" min="1" max="120" value="${minutes}"><span>min</span></label>
        <div class="all-zones"><span>All zones</span>
          <button class="ctl-btn small s-available" data-ctl="priority" data-zone="all" data-status="available">Available</button>
          <button class="ctl-btn small s-cooldown" data-ctl="priority" data-zone="all" data-status="cooldown">Cooldown</button>
          <button class="ctl-btn small s-hold" data-ctl="priority" data-zone="all" data-status="hold">Hold</button>
        </div>
      </div>
      <div class="zone-grid">${(data.zones || []).map(card).join("")}</div>
      ${peacetime}
    </section>`);
  }
  if (!sections.length) return `${head("Server control")}<div class="empty">You don't have permission to manage the AOP or priority.</div>`;
  return `${head(data.focus === "aop" ? "Area of play" : "Priority", "Changes are announced to the whole server.", `AOP <b>${esc(data.aop)}</b>`)}${sections.join("")}`;
}

function renderPassport(data) {
  const total = Math.max(1, Number(data.total) || 1);
  const found = Number(data.discoveries) || 0;
  const percent = clamp((found / total) * 100, 0, 100);
  const next = data.nextRank;
  const rankProgress = next ? clamp(((Number(data.points) || 0) / Number(next.points || 1)) * 100, 0, 100) : 100;
  const goals = (data.goals || []).map((goal) => {
    const progress = Math.min(Number(goal.target) || 1, Number(goal.progress) || 0);
    const pct = clamp((progress / Math.max(1, Number(goal.target))) * 100, 0, 100);
    return `<article class="passport-goal${goal.completed ? " complete" : ""}">
      <span class="passport-goal-icon">${icon(goal.icon || "sparkles")}</span>
      <div><strong>${esc(goal.label)}</strong><small>${esc(goal.description)}</small><i><b style="width:${pct}%"></b></i></div>
      <em>${goal.completed ? "Done" : `${progress}/${Number(goal.target)}`}<small>+${Number(goal.reward)} pts</small></em>
    </article>`;
  }).join("");
  const landmarks = (data.landmarks || []).map((landmark, index) => {
    const discovered = Boolean(landmark.discoveredAt);
    return `<button class="passport-stop${discovered ? " stamped" : ""}${landmark.featured ? " featured" : ""}" data-passport-waypoint="${esc(landmark.id)}">
      <span class="passport-stamp">${discovered ? icon("check") : String(index + 1).padStart(2, "0")}</span>
      <span><small>${esc(landmark.region)}${landmark.featured ? " · Today's featured stop" : ""}</small><strong>${esc(landmark.label)}</strong><p>${esc(landmark.lore)}</p></span>
      <em>${icon("pin")} Route</em>
    </button>`;
  }).join("");
  return `${head("Coastal Passport", "Explore the map, collect permanent stamps, and finish optional daily goals.", `<b>${found}/${total}</b> stamped`)}
    <section class="passport-hero">
      <div class="passport-seal">${icon("pin")}<span>${Math.round(percent)}%</span></div>
      <div><span class="eyebrow">${esc(data.rank || "New Arrival")}</span><h3>${Number(data.points) || 0} passport points</h3><p>${next ? `${Number(next.points) - Number(data.points || 0)} points to ${esc(next.label)}` : "Top rank reached · you know every road home."}</p><div class="passport-rank"><i style="width:${rankProgress}%"></i></div></div>
      <aside><small>Featured today</small><b>${esc(data.featured?.label || "The coast")}</b><span>+${Number(data.featured?.bonus) || 0} bonus points</span></aside>
    </section>
    <div class="passport-layout"><section><div class="eyebrow">Today's field notes</div><div class="passport-goals">${goals}</div></section><section><div class="eyebrow">Map stamps · tap any stop to route</div><div class="passport-stops">${landmarks}</div></section></div>`;
}

function renderScenes(data) {
  const event = data.event;
  const rows = data.scenes || [];
  const eventCard = event ? `<section class="scene-event">
    <span class="scene-live"><i></i> Live community event</span>
    <h3>${esc(event.title)}</h3>
    <p>${esc(event.description || "A staff-hosted event is happening now.")}</p>
    <div><span>${icon("pin")} ${esc(event.location || "Florida Bay")}</span><span>${icon("clock")} Ends ${when(event.expiresAt)}</span></div>
    <button data-event-waypoint ${event.coords ? "" : "disabled"}>${icon("pin")} Route to event</button>
  </section>` : `<section class="scene-event quiet"><span class="scene-live">Community calendar</span><h3>No staff event right now</h3><p>Player-hosted scenes below are still open for drop-in roleplay.</p></section>`;
  const cards = rows.map((scene) => `<article class="scene-card">
    <div class="scene-number">#${Number(scene.id)}</div>
    <div><small>Hosted by ${esc(scene.hostName)} · ${ago(scene.createdAt)}</small><h3>${esc(scene.title)}</h3><p>${esc(scene.description || "Open roleplay scene")}</p><span>${icon("users")} ${Number(scene.attendees) || 1} interested · closes ${when(scene.expiresAt)}</span></div>
    <button data-scene-waypoint="${Number(scene.id)}">${icon("pin")} Join scene</button>
  </article>`).join("");
  return `${head("Scene Hub", "Find spontaneous roleplay, host your own with /scenehost, or join the current community event.", `<b>${rows.length}</b> live scenes`)}
    ${eventCard}
    <div class="scene-guide"><span><b>/scenehost &lt;title&gt;</b> Host where you stand</span><span><b>/sceneend</b> End your scene</span><span><b>/eventgo</b> Route to staff event</span></div>
    <section class="scene-list">${cards || '<div class="empty">No player scenes yet. Be the first: close this menu and use <b>/scenehost &lt;title&gt;</b>.</div>'}</section>`;
}

function renderMenu() {
  const titles = {
    tags: "Tags",
    vehicles: "Garage",
    interactions: "Interact",
    radio: "Radio",
    characters: "Characters",
    spawns: "Spawn",
    control: "Server control",
    mdt: "Mobile data terminal",
    emotes: "Emotes",
    passport: "Coastal Passport",
    scenes: "Scene Hub",
  };
  setText("#menu-title", titles[currentView] || "Menu");
  const renderers = {
    tags: renderTags,
    vehicles: renderVehicles,
    interactions: renderInteractions,
    radio: renderRadio,
    characters: renderCharacters,
    spawns: renderSpawns,
    control: renderControl,
    mdt: renderMdt,
    emotes: renderEmotes,
    passport: renderPassport,
    scenes: renderScenes,
  };
  const content = $("#menu-content");
  const scroll = content.scrollTop;
  content.innerHTML = renderers[currentView] ? renderers[currentView](currentPayload) : "";
  content.scrollTop = scroll;
  hydrate(content);
}

function setLocked(locked) {
  menuLocked = locked;
  document.body.classList.toggle("menu-locked", locked);
  $("#close").classList.toggle("hidden", locked);
  $("#menu-esc").classList.toggle("hidden", locked);
}

// Vehicle thumbnails come from the FiveM docs CDN; fall back to an icon.
document.addEventListener(
  "error",
  (event) => {
    const img = event.target;
    if (img.tagName !== "IMG" || !img.dataset.fallback) return;
    const box = document.createElement("span");
    box.className = "fallback";
    box.innerHTML = icon(img.dataset.fallback);
    img.replaceWith(box);
  },
  true,
);

/* ───────── Shared formatting ───────── */
const fmtClock = (sec) => {
  sec = Math.max(0, Math.round(Number(sec) || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
};
const ago = (ms) => {
  const s = Math.max(0, Math.round((Date.now() - Number(ms)) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
const when = (ms) => (ms ? new Date(Number(ms)).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const chargeList = (charges) => (Array.isArray(charges) ? charges.map((c) => c.title || c).join(", ") : "");

/* ───────── Prison HUD ───────── */
const jailState = { active: false, total: 1, endsAt: 0 };
function tickJail() {
  if (!jailState.active) return;
  const left = Math.max(0, (jailState.endsAt - Date.now()) / 1000);
  setText("#jail-remaining", fmtClock(left));
  $("#jail-bar").style.width = `${clamp(100 - (left / jailState.total) * 100, 0, 100)}%`;
}
function updateJail(d) {
  jailState.active = !!d.active;
  $("#jail-hud").classList.toggle("hidden", !d.active);
  if (!d.active) return;
  jailState.total = Math.max(1, Number(d.total) || 1);
  jailState.endsAt = Date.now() + (Number(d.remaining) || 0) * 1000;
  setText("#jail-prison", d.prison || "Bolingbroke Penitentiary");
  setText("#jail-months", d.months ?? 0);
  setText("#jail-charges", d.charges ? `Charges: ${d.charges}` : "");
  setText("#jail-task", d.task || "");
  tickJail();
}
setInterval(tickJail, 1000);

/* ───────── Downed overlay ───────── */
function updateDowned(d) {
  $("#downed").classList.toggle("hidden", !d.active);
  if (!d.active) return;
  setText("#downed-cause", d.cause || "Unknown injuries");
  setText("#downed-time", d.canRespawn ? "0:00" : fmtClock(d.remaining));
  setText("#downed-label", d.canRespawn ? "You have bled out. Hold E to go to hospital, or wait for a medic." : "until you bleed out. Medics can still revive you.");
  $("#downed-respawn").classList.toggle("locked", !d.canRespawn);
  $("#downed-hold").style.width = `${clamp((Number(d.hold) || 0) * 100, 0, 100)}%`;
}

/* ───────── Body camera ───────── */
let bodycamTimer = null;
function updateBodycam(d) {
  clearInterval(bodycamTimer);
  $("#bodycam").classList.toggle("hidden", !d.active);
  if (!d.active) return;
  setText("#bodycam-unit", d.unit || "Unit");
  setText("#bodycam-dept", d.dept || "");
  const tick = () => {
    const n = new Date();
    setText("#bodycam-time", `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")} ${n.toTimeString().slice(0, 8)}`);
  };
  tick();
  bodycamTimer = setInterval(tick, 1000);
}

/* ───────── Progress bar ───────── */
let progressTimer = null;
function updateProgress(d) {
  const box = $("#progress");
  const fill = $("#progress-fill");
  clearTimeout(progressTimer);
  if (d.cancel) return box.classList.add("hidden");
  const ms = Number(d.ms) || 1000;
  setText("#progress-label", d.label || "Working");
  fill.style.transition = "none";
  fill.style.width = "0%";
  void fill.offsetWidth;
  fill.style.transition = `width ${ms}ms linear`;
  fill.style.width = "100%";
  box.classList.remove("hidden");
  progressTimer = setTimeout(() => box.classList.add("hidden"), ms + 300);
}

/* ───────── Cards: ID, citation, plate ───────── */
function showCard(html, cls, ms = 9000) {
  const stack = $("#cards");
  const node = document.createElement("div");
  node.className = `card-pop ${cls}`;
  node.innerHTML = `${html}<i class="timer" style="animation-duration:${ms}ms"></i>`;
  stack.prepend(node);
  while (stack.children.length > 3) stack.lastElementChild.remove();
  hydrate(node);
  dismiss(node, ms);
}
function idCard(d) {
  const initials = String(d.name || "?").split(/\s+/).map((p) => p[0] || "").join("").slice(0, 2).toUpperCase();
  const flag = d.warrants > 0
    ? `<div class="idcard-flag">${icon("alert")} ${Number(d.warrants)} active warrant${d.warrants > 1 ? "s" : ""}</div>`
    : d.inPrison ? `<div class="idcard-flag">${icon("gavel")} Serving a sentence</div>` : "";
  showCard(`<header class="idcard-head"><img src="fbrp-logo.png" alt=""><div><small>State of San Andreas</small><b>Florida Bay ID</b></div></header>
    <div class="idcard-body"><div class="idcard-photo">${esc(initials)}</div>
      <dl><dt>Name</dt><dd>${esc(d.name)}</dd><dt>DOB</dt><dd>${esc(d.dob)}</dd><dt>Sex</dt><dd>${esc(d.gender)}</dd><dt>No.</dt><dd>${esc(d.citizen)}</dd></dl>
    </div>${flag}`, "idcard", 10000);
}
function citationCard(d) {
  showCard(`<header class="card-head amber">${icon("gavel")}<b>Uniform citation</b></header>
    <div class="card-body"><p>${esc(d.charges)}</p><div class="card-row"><span>Fine</span><b>$${Number(d.fine) || 0}</b></div>
    <div class="card-row"><span>Officer</span><b>${esc(d.officer)}</b></div>${d.notes ? `<small>${esc(d.notes)}</small>` : ""}</div>`, "citation", 12000);
}
function plateFlags(r) {
  const flags = [];
  if (!r.registered) flags.push(["warn", "No registration on file"]);
  if (r.stolen) flags.push(["bad", "Reported stolen"]);
  if (r.impounded) flags.push(["warn", "Impound record"]);
  if (r.warrants > 0) flags.push(["bad", `Owner: ${r.warrants} active warrant${r.warrants > 1 ? "s" : ""}`]);
  (r.bolos || []).forEach((b) => flags.push(["bad", `BOLO #${b.id}: ${b.description}`]));
  return flags;
}
function plateCard(r) {
  const flags = plateFlags(r);
  const bad = flags.some((f) => f[0] === "bad");
  showCard(`<header class="card-head ${bad ? "red" : "green"}">${icon("car")}<b>Plate check</b><em class="plate-tag">${esc(r.plate)}</em></header>
    <div class="card-body">${r.registered ? `<div class="card-row"><span>Vehicle</span><b>${esc(r.model)}</b></div><div class="card-row"><span>Owner</span><b>${esc(r.owner)}</b></div>` : ""}
    ${flags.length ? flags.map(([t, f]) => `<div class="flag ${t}">${esc(f)}</div>`).join("") : '<div class="flag ok">No flags</div>'}</div>`, "plate", 12000);
}

function passportDiscovery(d) {
  showCard(`<header class="card-head green">${icon("pin")}<b>Passport stamped</b><em>+${Number(d.points) || 0}</em></header>
    <div class="card-body"><small>${esc(d.region || "Florida Bay")}</small><h3>${esc(d.label || "Landmark")}</h3><p>${esc(d.lore || "A new corner of the coast is now in your passport.")}</p>${d.featured ? '<div class="flag ok">Featured-stop bonus earned</div>' : ""}</div>`, "passport-pop", 11000);
}

/* ───────── Fishing ───────── */
let reelFrame = null;
function updateFishing(d) {
  const box = $("#fishing");
  const game = $("#fishing-game");
  const caught = $("#fishing-catch");
  if (d.stage === "off") {
    cancelAnimationFrame(reelFrame);
    return box.classList.add("hidden");
  }
  box.classList.remove("hidden");
  if (d.stage === "waiting") {
    cancelAnimationFrame(reelFrame);
    setText("#fishing-title", "Waiting for a bite…");
    box.classList.remove("biting");
    game.classList.add("hidden");
    caught.classList.add("hidden");
  } else if (d.stage === "bite") {
    setText("#fishing-title", "Fish on! Reel it in");
    box.classList.add("biting");
    game.classList.remove("hidden");
    caught.classList.add("hidden");
    const [start, width] = d.zone || [0.4, 0.16];
    $("#reel-zone").style.left = `${start * 100}%`;
    $("#reel-zone").style.width = `${width * 100}%`;
    $$(".reel-hits i").forEach((n) => n.classList.remove("on", "miss"));
    const period = Number(d.period) || 1300;
    const began = performance.now();
    const needle = $("#reel-needle");
    const frame = (t) => {
      const phase = ((t - began) % (period * 2)) / period;
      needle.style.left = `${(phase <= 1 ? phase : 2 - phase) * 100}%`;
      reelFrame = requestAnimationFrame(frame);
    };
    cancelAnimationFrame(reelFrame);
    reelFrame = requestAnimationFrame(frame);
  } else if (d.stage === "press") {
    const needle = $("#reel-needle");
    needle.classList.remove("hit", "miss");
    void needle.offsetWidth;
    needle.classList.add(d.hit ? "hit" : "miss");
    if (d.hit) $$(".reel-hits i")[Math.max(0, d.hits - 1)]?.classList.add("on");
  } else if (d.stage === "result") {
    cancelAnimationFrame(reelFrame);
    box.classList.remove("biting");
    game.classList.add("hidden");
    const r = d.result || {};
    if (r.escaped) {
      setText("#fishing-title", "It got away…");
      caught.classList.add("hidden");
      return;
    }
    setText("#fishing-title", r.rarity === "junk" ? "Well… it's something" : "Landed!");
    const badges = [r.serverRecord ? '<span class="badge gold">Server record</span>' : "", r.personalBest && !r.serverRecord ? '<span class="badge">Personal best</span>' : ""].join("");
    caught.innerHTML = `<div class="catch-name" style="color:${safeColor(r.color)}">${esc(r.species)}</div>
      <div class="catch-meta"><b>${Number(r.weight).toFixed(2)} lb</b><span style="color:${safeColor(r.color)}">${esc(r.rarity)}</span><span>${r.water === "fresh" ? "Freshwater" : "Saltwater"}</span></div>${badges ? `<div class="catch-badges">${badges}</div>` : ""}`;
    caught.classList.remove("hidden");
  }
}

/* ───────── Emote menu ───────── */
const EMOTE_ICONS = { All: "sparkles", Gestures: "walk", Rest: "seat", Props: "phone", Work: "shield", Fitness: "heart-pulse", Dance: "music" };
function emoteGrid(data) {
  const q = String(ui.emoteSearch || "").trim().toLowerCase();
  const shown = (data.emotes || []).filter((e) => (ui.emoteCat === "All" || e.cat === ui.emoteCat) && (!q || e.label.toLowerCase().includes(q) || e.id.includes(q)));
  if (!shown.length) return '<div class="empty compact">No emotes match.</div>';
  return shown.map((e) => `<button class="emote-card${data.current === e.id ? " on" : ""}" data-emote="${esc(e.id)}"><strong>${esc(e.label)}</strong><small>/e ${esc(e.id)}</small></button>`).join("");
}
function renderEmotes(data) {
  const list = data.emotes || [];
  const cats = ["All", ...new Set(list.map((e) => e.cat))];
  if (!cats.includes(ui.emoteCat)) ui.emoteCat = "All";
  const rail = cats.map((c) => `<button class="${c === ui.emoteCat ? "active" : ""}" data-emote-cat="${esc(c)}"><span data-icon="${EMOTE_ICONS[c] || "sparkles"}"></span>${esc(c)}<small>${c === "All" ? list.length : list.filter((e) => e.cat === c).length}</small></button>`).join("");
  return `<div class="garage"><nav class="rail">${rail}<button class="emote-stop" data-emote="stop"><span data-icon="x"></span>Stop emote</button></nav><div>
    ${head("Emotes", "Click to play. <kbd>X</kbd> cancels, <kbd>B</kbd> points, <kbd>F3</kbd> reopens this menu.", `<b>${list.length}</b> emotes`)}
    <input id="emote-search" class="mdt-input" placeholder="Search emotes…" value="${esc(ui.emoteSearch || "")}" autocomplete="off">
    <div id="emote-grid" class="emote-grid">${emoteGrid(data)}</div></div></div>`;
}

/* ───────── MDT ───────── */
const MDT_TABS = [
  ["dashboard", "Dashboard", "grid"],
  ["search", "Citizens", "search"],
  ["plates", "Plates", "car"],
  ["warrants", "Warrants", "gavel"],
  ["bolos", "BOLOs", "alert"],
  ["penal", "Penal code", "book"],
];
const KIND_TONE = { infraction: "dim", misdemeanor: "warn", felony: "bad", custom: "dim" };
const mdtSend = (kind, body = {}) => post("mdtAction", { kind, ...body });

function mdtInit(payload) {
  ui.mdt = {
    tab: payload.profile ? "profile" : "dashboard",
    dashboard: payload.dashboard || {},
    profile: payload.profile || null,
    form: payload.profile ? payload.form || null : null,
    charges: new Set(),
    months: null,
    notes: "",
    results: null,
    query: "",
    plate: null,
  };
}

function mdtStat(label, value, tone) {
  return `<div class="mdt-stat${tone ? ` tone-${tone}` : ""}"><b>${value}</b><small>${label}</small></div>`;
}

function mdtDashboard(m) {
  const d = m.dashboard || {};
  const warrants = d.warrants || [], bolos = d.bolos || [], inmates = d.inmates || [], units = d.units || [], calls = d.calls || [], records = d.records || [];
  const serving = inmates.filter((i) => i.status === "serving").length;
  const escaped = inmates.filter((i) => i.status === "escaped").length;
  return `${head("Dispatch overview", `Signed in as ${esc(currentPayload.officer || "Officer")}`, `<b>${units.length}</b> units on duty`)}
    <div class="mdt-stats">${mdtStat("Active warrants", warrants.length, warrants.length ? "bad" : "")}${mdtStat("Active BOLOs", bolos.length, bolos.length ? "warn" : "")}${mdtStat("Inmates", serving, "")}${mdtStat("Escaped", escaped, escaped ? "bad" : "")}</div>
    <div class="mdt-columns">
      <section class="mdt-panel"><div class="eyebrow">Recent calls</div>${calls.length ? calls.map((c) => `<div class="mdt-row"><span class="mdt-kind k-${esc(String(c.kind).toLowerCase())}">${esc(c.kind)}</span><div><b>#${Number(c.id)} · ${esc(c.caller)}</b><small>${esc(c.message)}</small></div><em>${ago(c.at)}${c.responders ? ` · ${c.responders} resp.` : ""}</em></div>`).join("") : '<div class="empty compact">No calls in the last 30 minutes.</div>'}</section>
      <section class="mdt-panel"><div class="eyebrow">Units</div>${units.length ? units.map((u) => `<div class="mdt-row"><span class="mdt-kind k-${u.kind === "police" ? "unit" : "ems"}">${u.kind === "police" ? "LEO" : "EMS"}</span><div><b>${esc(u.name)} <em>[${Number(u.id)}]</em></b><small>${esc(u.org || "On duty")}</small></div>${u.downed ? '<em class="tone-bad">DOWN</em>' : ""}</div>`).join("") : '<div class="empty compact">Nobody on duty.</div>'}</section>
    </div>
    <section class="mdt-panel"><div class="eyebrow">Inmates & fugitives</div>${inmates.length ? inmates.map((i) => `<div class="mdt-row"><span class="mdt-kind ${i.status === "escaped" ? "k-panic" : "k-unit"}">${i.status === "escaped" ? "ESCAPED" : "IN"}</span><div><b>${i.character_id ? `<a data-mdt-profile="${Number(i.character_id)}">${esc(i.name)}</a>` : esc(i.name)}</b><small>${Number(i.months)} months · ${fmtClock(i.seconds_remaining)} left · by ${esc(i.officer_name)}${i.online ? " · in yard" : ""}</small></div>${currentPayload.canJail ? `<button class="ctl-btn small" data-mdt-release="${Number(i.id)}">Release</button>` : ""}</div>`).join("") : '<div class="empty compact">Bolingbroke is empty.</div>'}</section>
    <section class="mdt-panel"><div class="eyebrow">Latest records</div>${records.length ? records.map((r) => mdtRecordRow(r, true)).join("") : '<div class="empty compact">No records yet.</div>'}</section>`;
}

function mdtRecordRow(r, withName) {
  const tone = r.kind === "arrest" ? "panic" : r.kind === "citation" ? "bolo" : "unit";
  const detail = [chargeList(r.charges) || "No charges listed", r.months ? `${r.months} months` : "", r.fine ? `$${r.fine}` : ""].filter(Boolean).join(" · ");
  return `<div class="mdt-row"><span class="mdt-kind k-${tone}">${esc(r.kind)}</span><div><b>${withName ? (r.character_id ? `<a data-mdt-profile="${Number(r.character_id)}">${esc(r.name)}</a>` : esc(r.name)) : esc(detail)}</b><small>${withName ? esc(detail) : ""}${r.notes ? `${withName ? " · " : ""}${esc(r.notes)}` : ""}</small></div><em>${esc(r.officer_name)} · ${when(r.created_at)}</em></div>`;
}

function mdtSearchView(m) {
  const rows = m.results || [];
  return `${head("Citizen lookup", "Search by name, or type a server ID to look up someone in the city.")}
    <form id="mdt-search-form" class="mdt-bar"><input name="query" class="mdt-input" placeholder="Name or server ID…" value="${esc(m.query)}" autocomplete="off" autofocus><button class="primary-action" type="submit">${icon("search")}Search</button></form>
    ${m.results === null ? "" : rows.length ? `<div class="mdt-results">${rows.map((r) => `<button class="mdt-person" data-mdt-profile="${Number(r.id)}"><span class="monogram">${esc(r.name.split(" ").map((p) => p[0]).join("").slice(0, 2))}</span><div><b>${esc(r.name)}</b><small>${esc(r.citizen)} · DOB ${esc(r.dob)} · ${esc(r.gender)}</small></div>${r.warrants ? `<span class="chip warn-chip">${r.warrants} warrant${r.warrants > 1 ? "s" : ""}</span>` : ""}${r.online ? `<span class="chip">ID <b>${Number(r.online)}</b></span>` : ""}</button>`).join("")}</div>` : '<div class="empty">No citizens match that search.</div>'}`;
}

function mdtPlatesView(m) {
  const r = m.plate;
  return `${head("Plate lookup", "Run any plate. In a vehicle, /runplate checks the car in front of you.")}
    <form id="mdt-plate-form" class="mdt-bar"><input name="plate" class="mdt-input plate-input" maxlength="8" placeholder="PLATE" value="${esc(r?.plate || "")}" autocomplete="off"><button class="primary-action" type="submit">${icon("car")}Run plate</button></form>
    ${r ? `<section class="mdt-panel plate-report"><div class="plate-big">${esc(r.plate)}</div>${r.registered ? `<div class="card-row"><span>Vehicle</span><b>${esc(r.model)}</b></div><div class="card-row"><span>Registered owner</span><b>${r.ownerId ? `<a data-mdt-profile="${Number(r.ownerId)}">${esc(r.owner)}</a>` : esc(r.owner)}</b></div>` : ""}
      ${plateFlags(r).map(([t, f]) => `<div class="flag ${t}">${esc(f)}</div>`).join("") || '<div class="flag ok">No flags on this plate</div>'}</section>` : ""}`;
}

function mdtWarrantsView(m) {
  const rows = m.dashboard?.warrants || [];
  return `${head("Active warrants", "Warrants are served automatically when the subject is booked.", `<b>${rows.length}</b> active`)}
    ${rows.length ? rows.map((w) => `<div class="mdt-row big"><span class="mdt-kind k-panic">#${Number(w.id)}</span><div><b>${w.character_id ? `<a data-mdt-profile="${Number(w.character_id)}">${esc(w.subject_name)}</a>` : esc(w.subject_name)}</b><small>${esc(w.reason)}</small><small>${esc(w.created_by)} · ${when(w.created_at)}</small></div><button class="ctl-btn small" data-mdt-close-warrant="${Number(w.id)}" data-status="cleared">Clear</button></div>`).join("") : '<div class="empty">No active warrants.</div>'}`;
}

function mdtBolosView(m) {
  const rows = m.dashboard?.bolos || [];
  return `${head("Be on the lookout", "New BOLOs are pushed to every officer on duty.", `<b>${rows.length}</b> active`)}
    <form id="mdt-bolo-form" class="mdt-form">
      <div class="mdt-form-row"><label>Type<select name="kind" class="mdt-input"><option value="vehicle">Vehicle</option><option value="person">Person</option></select></label><label>Plate (vehicles)<input name="plate" class="mdt-input plate-input" maxlength="8" placeholder="Optional"></label></div>
      <label>Description<textarea name="description" class="mdt-input" maxlength="500" rows="2" placeholder="Black Buffalo, tinted windows, last seen northbound on Route 68…" required></textarea></label>
      <div class="form-foot"><button class="primary-action" type="submit">${icon("alert")}Issue BOLO</button></div>
    </form>
    ${rows.map((b) => `<div class="mdt-row big"><span class="mdt-kind k-bolo">${esc(b.kind)}</span><div><b>BOLO #${Number(b.id)}${b.plate ? ` · <span class="plate-tag">${esc(b.plate)}</span>` : ""}</b><small>${esc(b.description)}</small><small>${esc(b.created_by)} · ${when(b.created_at)}</small></div><button class="ctl-btn small" data-mdt-close-bolo="${Number(b.id)}">Cancel</button></div>`).join("")}`;
}

function mdtPenalView() {
  const penal = currentPayload.penal || [];
  const groups = ["infraction", "misdemeanor", "felony"];
  return `${head("Penal code", `Fines are roleplay amounts. One month of sentence is ${Number(currentPayload.secondsPerMonth) || 30} seconds of time served.`)}
    ${groups.map((g) => `<section class="mdt-panel"><div class="eyebrow">${g}s</div><div class="penal-grid">${penal.filter((c) => c.kind === g).map((c) => `<div class="penal-row"><span>${esc(c.title)}</span><b class="tone-${KIND_TONE[g]}">${c.months ? `${c.months} mo` : ""}${c.months && c.fine ? " · " : ""}${c.fine ? `$${c.fine}` : ""}</b></div>`).join("")}</div></section>`).join("")}`;
}

function mdtChargeForm(p, mode) {
  const kinds = mode === "cite" ? ["infraction", "misdemeanor"] : ["misdemeanor", "felony"];
  const penal = (currentPayload.penal || []).filter((c) => kinds.includes(c.kind));
  const warn = mode === "sentence" && (!p.online ? "This citizen is not in the city. They must be present to be booked." : !p.restrained ? "The suspect is not restrained. Cuff them before booking." : "");
  return `<form id="mdt-charge-form" class="mdt-form" data-mode="${mode}">
    <div class="eyebrow">${mode === "cite" ? "Issue citation" : "Book into Bolingbroke"}</div>
    ${warn ? `<div class="flag warn">${esc(warn)}</div>` : ""}
    <div class="charge-grid">${penal.map((c) => `<label class="charge${ui.mdt.charges.has(c.id) ? " on" : ""}"><input type="checkbox" data-charge="${esc(c.id)}" ${ui.mdt.charges.has(c.id) ? "checked" : ""}><span>${esc(c.title)}</span><b class="tone-${KIND_TONE[c.kind]}">${mode === "cite" ? `$${c.fine}` : `${c.months} mo`}</b></label>`).join("")}</div>
    <div class="charge-total" id="charge-total">${mdtTotals(mode)}</div>
    <label>Notes<textarea name="notes" id="mdt-notes" class="mdt-input" maxlength="300" rows="2" placeholder="Narrative, evidence, plea…">${esc(ui.mdt.notes)}</textarea></label>
    <div class="form-foot"><button type="button" class="ghost-action" data-mdt-form="">Cancel</button><button class="primary-action" type="submit">${icon(mode === "cite" ? "check" : "gavel")}${mode === "cite" ? "Issue citation" : "Sentence"}</button></div>
  </form>`;
}

function mdtTotals(mode) {
  const penal = currentPayload.penal || [];
  const picked = penal.filter((c) => ui.mdt.charges.has(c.id));
  if (mode === "cite") return `<span>Total fine</span><b>$${picked.reduce((n, c) => n + c.fine, 0)}</b>`;
  const max = Number(currentPayload.maxMonths) || 90;
  const sum = Math.min(max, picked.reduce((n, c) => n + c.months, 0));
  const months = ui.mdt.months ?? sum;
  return `<span>Sentence</span><label class="months-input"><input type="number" id="mdt-months" min="1" max="${max}" value="${months || ""}" placeholder="${sum}"> months</label><small>≈ ${fmtClock((months || 0) * (Number(currentPayload.secondsPerMonth) || 30))} served · recommended ${sum}</small>`;
}

function mdtProfileView(m) {
  const p = m.profile;
  if (!p) return '<div class="empty">Pick a citizen first.</div>';
  const active = (p.warrants || []).filter((w) => w.status === "active");
  const s = p.sentence;
  const chips = [
    p.online ? `<span class="chip">In city · ID <b>${Number(p.online)}</b></span>` : '<span class="chip">Not in city</span>',
    active.length ? `<span class="chip bad-chip">Wanted · ${active.length}</span>` : "",
    s ? `<span class="chip ${s.status === "escaped" ? "bad-chip" : "warn-chip"}">${s.status === "escaped" ? "Escaped inmate" : `In prison · ${fmtClock(s.seconds_remaining)}`}</span>` : "",
    p.restrained ? '<span class="chip warn-chip">Restrained</span>' : "",
  ].join("");
  const form = m.form === "cite" || m.form === "sentence" ? mdtChargeForm(p, m.form) : m.form === "warrant"
    ? `<form id="mdt-warrant-form" class="mdt-form"><div class="eyebrow">Issue warrant</div><label>Probable cause<textarea name="reason" class="mdt-input" maxlength="500" rows="3" required placeholder="What they are wanted for, and why."></textarea></label><div class="form-foot"><button type="button" class="ghost-action" data-mdt-form="">Cancel</button><button class="primary-action" type="submit">${icon("gavel")}Issue warrant</button></div></form>` : "";
  return `<div class="mdt-profile-head">
      <span class="monogram big">${esc(p.name.split(" ").map((x) => x[0]).join("").slice(0, 2))}</span>
      <div><h2>${esc(p.name)}</h2><p>${esc(p.citizen)} · DOB ${esc(p.dob)} · ${esc(p.gender)}</p><div class="chip-row">${chips}</div></div>
      <div class="mdt-actions">
        <button class="ctl-btn${m.form === "cite" ? " on" : ""}" data-mdt-form="cite">${icon("check")} Cite</button>
        ${currentPayload.canJail ? `<button class="ctl-btn${m.form === "sentence" ? " on" : ""}" data-mdt-form="sentence">${icon("gavel")} Sentence</button>` : ""}
        <button class="ctl-btn${m.form === "warrant" ? " on" : ""}" data-mdt-form="warrant">${icon("alert")} Warrant</button>
      </div>
    </div>
    ${form}
    <section class="mdt-panel"><div class="eyebrow">Warrants</div>${(p.warrants || []).length ? p.warrants.map((w) => `<div class="mdt-row"><span class="mdt-kind ${w.status === "active" ? "k-panic" : "k-unit"}">${esc(w.status)}</span><div><b>${esc(w.reason)}</b><small>#${Number(w.id)} · ${esc(w.created_by)} · ${when(w.created_at)}${w.closed_by ? ` · closed by ${esc(w.closed_by)}` : ""}</small></div>${w.status === "active" ? `<button class="ctl-btn small" data-mdt-close-warrant="${Number(w.id)}" data-status="cleared" data-refresh="profile">Clear</button>` : ""}</div>`).join("") : '<div class="empty compact">No warrants.</div>'}</section>
    <section class="mdt-panel"><div class="eyebrow">Criminal history</div>${(p.records || []).length ? p.records.map((r) => mdtRecordRow(r, false)).join("") : '<div class="empty compact">Clean record.</div>'}</section>
    <section class="mdt-panel"><div class="eyebrow">Registered vehicles</div>${(p.vehicles || []).length ? p.vehicles.map((v) => `<div class="mdt-row"><span class="plate-tag">${esc(v.plate)}</span><div><b>${esc(v.label || v.model)}</b><small>${v.stolen ? "Reported stolen · " : ""}${v.impounded_at ? "Impounded · " : ""}registered ${when(v.registered_at)}</small></div></div>`).join("") : '<div class="empty compact">No registered vehicles.</div>'}</section>`;
}

function renderMdt() {
  const m = ui.mdt;
  const tabs = [...MDT_TABS];
  if (m.profile) tabs.push(["profile", m.profile.name, "user"]);
  const counts = { warrants: m.dashboard?.warrants?.length, bolos: m.dashboard?.bolos?.length };
  const rail = tabs.map(([id, label, ic]) => `<button class="${m.tab === id ? "active" : ""}" data-mdt-tab="${id}"><span data-icon="${ic}"></span>${esc(label)}${counts[id] ? `<small>${counts[id]}</small>` : ""}</button>`).join("");
  const views = { dashboard: mdtDashboard, search: mdtSearchView, plates: mdtPlatesView, warrants: mdtWarrantsView, bolos: mdtBolosView, penal: mdtPenalView, profile: mdtProfileView };
  return `<div class="garage mdt"><nav class="rail">${rail}</nav><div class="mdt-main">${(views[m.tab] || mdtDashboard)(m)}</div></div>`;
}

function mdtData(kind, data) {
  const m = ui.mdt;
  if (!m) return;
  if (kind === "dashboard") m.dashboard = data || {};
  if (kind === "results") { m.results = data?.rows || []; m.query = data?.query || m.query; }
  if (kind === "plate") m.plate = data;
  if (kind === "profile") {
    m.profile = data;
    m.tab = "profile";
    m.form = null;
    m.charges = new Set();
    m.months = null;
    m.notes = "";
  }
  renderMenu();
}

function mdtClick(event) {
  const tab = event.target.closest("[data-mdt-tab]");
  if (tab) {
    ui.mdt.tab = tab.dataset.mdtTab;
    if (["dashboard", "warrants", "bolos"].includes(ui.mdt.tab)) mdtSend("dashboard");
    renderMenu();
    return true;
  }
  const person = event.target.closest("[data-mdt-profile]");
  if (person) { mdtSend("profile", { id: Number(person.dataset.mdtProfile) }); return true; }
  const form = event.target.closest("[data-mdt-form]");
  if (form) {
    const next = form.dataset.mdtForm || null;
    ui.mdt.form = ui.mdt.form === next ? null : next;
    ui.mdt.charges = new Set();
    ui.mdt.months = null;
    ui.mdt.notes = "";
    renderMenu();
    return true;
  }
  const warrant = event.target.closest("[data-mdt-close-warrant]");
  if (warrant) { mdtSend("closeWarrant", { id: Number(warrant.dataset.mdtCloseWarrant), status: warrant.dataset.status, refresh: warrant.dataset.refresh }); return true; }
  const bolo = event.target.closest("[data-mdt-close-bolo]");
  if (bolo) { mdtSend("closeBolo", { id: Number(bolo.dataset.mdtCloseBolo) }); return true; }
  const release = event.target.closest("[data-mdt-release]");
  if (release) { mdtSend("release", { id: Number(release.dataset.mdtRelease) }); return true; }
  return false;
}

function mdtSubmit(event) {
  const form = event.target;
  const values = Object.fromEntries(new FormData(form).entries());
  if (form.id === "mdt-search-form") { ui.mdt.query = values.query || ""; mdtSend("search", { query: values.query }); return true; }
  if (form.id === "mdt-plate-form") { mdtSend("plate", { plate: values.plate }); return true; }
  if (form.id === "mdt-bolo-form") { mdtSend("bolo", values); form.reset(); return true; }
  if (form.id === "mdt-warrant-form") { mdtSend("warrant", { id: ui.mdt.profile?.id, reason: values.reason }); return true; }
  if (form.id === "mdt-charge-form") {
    const mode = form.dataset.mode;
    const body = { id: ui.mdt.profile?.id, charges: [...ui.mdt.charges], notes: ui.mdt.notes };
    if (mode === "sentence" && ui.mdt.months) body.months = ui.mdt.months;
    mdtSend(mode === "cite" ? "cite" : "sentence", body);
    return true;
  }
  return false;
}

function mdtInput(event) {
  const t = event.target;
  if (t.dataset.charge) {
    if (t.checked) ui.mdt.charges.add(t.dataset.charge); else ui.mdt.charges.delete(t.dataset.charge);
    t.closest(".charge")?.classList.toggle("on", t.checked);
    ui.mdt.months = null;
    const total = $("#charge-total");
    if (total) total.innerHTML = mdtTotals($("#mdt-charge-form").dataset.mode);
    return true;
  }
  if (t.id === "mdt-months") { ui.mdt.months = clamp(Number(t.value) || 0, 0, Number(currentPayload.maxMonths) || 90) || null; return true; }
  if (t.id === "mdt-notes") { ui.mdt.notes = t.value; return true; }
  return false;
}

/* ───────── Messages ───────── */
window.addEventListener("message", ({ data }) => {
  if (!data || typeof data !== "object") return;
  if (data.type === "hud") updateHud(data.data || {});
  if (data.type === "notify") notice(data.message, data.tone);
  if (data.type === "dispatch") dispatch(data.data || {});
  if (data.type === "menu") {
    if (data.open) {
      if (data.view !== currentView) ui.showCharacterForm = false;
      currentView = data.view;
      currentPayload = data.payload || {};
      if (currentView === "mdt") mdtInit(currentPayload);
      setLocked(data.locked === true);
      renderMenu();
      $("#menu").classList.remove("hidden");
      $("#menu-content").scrollTop = 0;
    } else {
      $("#menu").classList.add("hidden");
      setLocked(false);
      currentView = null;
    }
  }
  if (data.type === "thirdEye") {
    if (data.open) {
      renderThirdEye(data.data || {});
      $("#third-eye").classList.remove("hidden");
    } else {
      $("#third-eye").classList.add("hidden");
      thirdEyePayload = null;
    }
  }
  if (data.type === "controlUpdate" && currentView === "control") {
    currentPayload = { ...currentPayload, ...(data.data || {}), focus: currentPayload.focus };
    renderMenu();
  }
  if (data.type === "radioTalking") $("#radio-console")?.classList.toggle("transmitting", !!data.active);
  if (data.type === "tagSelected") {
    currentPayload.selected = data.data || {};
    if (currentView === "tags") renderMenu();
  }
  if (data.type === "blindfold") $("#blindfold").classList.toggle("hidden", !data.active);
  if (data.type === "restraint") showRestraint(data.active, data.kind);
  if (data.type === "carControls") $("#car-controls").classList.toggle("hidden", !data.open);
  if (data.type === "jail") updateJail(data);
  if (data.type === "downed") updateDowned(data);
  if (data.type === "bodycam") updateBodycam(data);
  if (data.type === "progress") updateProgress(data);
  if (data.type === "fishing") updateFishing(data);
  if (data.type === "idcard") idCard(data.data || {});
  if (data.type === "citation") citationCard(data.data || {});
  if (data.type === "plate") plateCard(data.data || {});
  if (data.type === "passportDiscovery") passportDiscovery(data.data || {});
  if (data.type === "mdtData" && currentView === "mdt") mdtData(data.kind, data.data);
});

$("#close").addEventListener("click", () => post("close"));
$("#car-close").addEventListener("click", () => post("closeCarControls"));
$("#third-eye-close").addEventListener("click", () => post("closeThirdEye"));
$("#third-eye-actions").addEventListener("click", (event) => {
  const action = event.target.closest("[data-third-eye-action]");
  if (!action || !thirdEyePayload) return;
  post("thirdEyeAction", {
    target: Number(thirdEyePayload.target),
    action: action.dataset.thirdEyeAction,
  });
});

$("#menu-content").addEventListener("click", (event) => {
  if (currentView === "mdt" && mdtClick(event)) return;
  const emoteCat = event.target.closest("[data-emote-cat]");
  if (emoteCat) {
    ui.emoteCat = emoteCat.dataset.emoteCat;
    renderMenu();
    return;
  }
  const emote = event.target.closest("[data-emote]");
  if (emote) {
    post("emote", { id: emote.dataset.emote });
    return;
  }
  const character = event.target.closest("[data-character-id]");
  if (character) {
    post("selectCharacter", { id: Number(character.dataset.characterId) });
    return;
  }
  if (event.target.closest("[data-new-character]")) {
    ui.showCharacterForm = true;
    renderMenu();
    const first = $("#character-form input");
    if (first) first.focus();
    return;
  }
  const spawn = event.target.closest("[data-spawn-id]");
  if (spawn) {
    post("selectSpawn", {
      id: spawn.dataset.spawnId,
      x: Number(spawn.dataset.x),
      y: Number(spawn.dataset.y),
      z: Number(spawn.dataset.z),
      h: Number(spawn.dataset.h),
    });
    return;
  }
  const cat = event.target.closest("[data-garage-cat]");
  if (cat) {
    ui.garageCategory = cat.dataset.garageCat;
    renderMenu();
    return;
  }
  const tag = event.target.closest("[data-tag-id]");
  if (tag) {
    post("equipTag", { kind: tag.dataset.tagKind, id: Number(tag.dataset.tagId) });
    currentPayload.selected = currentPayload.selected || {};
    currentPayload.selected[tag.dataset.tagKind] = Number(tag.dataset.tagId) || null;
    renderMenu();
    return;
  }
  const vehicle = event.target.closest("[data-model]");
  if (vehicle) {
    vehicle.classList.add("spawning");
    setTimeout(() => vehicle.classList.remove("spawning"), 1200);
    post("spawnVehicle", { category: vehicle.dataset.category, model: vehicle.dataset.model });
    return;
  }
  const passport = event.target.closest("[data-passport-waypoint]");
  if (passport) {
    post("passportWaypoint", { id: passport.dataset.passportWaypoint });
    return;
  }
  const scene = event.target.closest("[data-scene-waypoint]");
  if (scene) {
    post("sceneWaypoint", { id: Number(scene.dataset.sceneWaypoint) });
    return;
  }
  if (event.target.closest("[data-event-waypoint]")) {
    post("eventWaypoint");
    return;
  }
  const ctl = event.target.closest("[data-ctl]");
  if (ctl) {
    const kind = ctl.dataset.ctl;
    const body = { kind };
    if (kind === "aop") body.value = ctl.dataset.value;
    if (kind === "peacetime") body.value = ctl.dataset.value === "on";
    if (kind === "priority") {
      body.zone = ctl.dataset.zone;
      body.status = ctl.dataset.status;
      body.minutes = clamp(Number($("#cd-minutes")?.value) || 20, 1, 120);
    }
    ctl.classList.add("pending");
    post("controlAction", body);
    return;
  }
  const action = event.target.closest("[data-action]");
  if (action) fireAction(action);
  const radio = event.target.closest("[data-radio-channel]");
  if (radio) post("radioAction", { action: "join", channel: Number(radio.dataset.radioChannel) });
  if (event.target.closest("[data-radio-leave]")) post("radioAction", { action: "leave" });
});

$("#menu-content").addEventListener("input", (event) => {
  if (currentView === "mdt" && mdtInput(event)) return;
  if (event.target.id === "emote-search") {
    ui.emoteSearch = event.target.value;
    $("#emote-grid").innerHTML = emoteGrid(currentPayload);
    return;
  }
  if (event.target.id === "cd-minutes") ui.cooldownMinutes = clamp(Number(event.target.value) || 20, 1, 120);
  if (event.target.id === "radio-volume") {
    ui.radioVolume = clamp(Number(event.target.value) || 0, 0, 100);
    setText("#radio-volume-value", `${ui.radioVolume}%`);
    post("radioAction", { action: "volume", value: ui.radioVolume });
  }
});

function fireAction(action) {
  action.classList.remove("fired");
  void action.offsetWidth;
  action.classList.add("fired");
  post("interaction", { target: Number(action.dataset.target), action: action.dataset.action });
}

$("#menu-content").addEventListener("mouseover", (event) => {
  const card = event.target.closest("[data-spawn-id]");
  $$(".spawn-map .dot").forEach((d) => d.classList.toggle("hot", !!card && d.dataset.dot === card.dataset.spawnId));
});

$("#menu-content").addEventListener("submit", (event) => {
  if (currentView === "mdt" && mdtSubmit(event)) {
    event.preventDefault();
    return;
  }
  if (event.target.id === "aop-form") {
    event.preventDefault();
    const value = String(new FormData(event.target).get("aop") || "").trim();
    if (value) post("controlAction", { kind: "aop", value });
    return;
  }
  if (event.target.id === "radio-tune") {
    event.preventDefault();
    post("radioAction", { action: "join", channel: Number(new FormData(event.target).get("channel")) });
    return;
  }
  if (event.target.id !== "character-form") return;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.target).entries());
  post("createCharacter", values);
  const button = event.target.querySelector("button[type=submit]");
  button.disabled = true;
  setTimeout(() => {
    if (button.isConnected) button.disabled = false;
  }, 1500);
});

$$("[data-car]").forEach((button) =>
  button.addEventListener("click", () => post("vehicleControl", { action: button.dataset.car })),
);

document.addEventListener("keyup", (event) => {
  if (event.key === "Escape") {
    if (thirdEyePayload) post("closeThirdEye");
    if (!menuLocked) post("close");
    post("closeCarControls");
    return;
  }
  if (thirdEyePayload && /^[1-9]$/.test(event.key) && !event.target.closest("input,textarea")) {
    const action = $(`#third-eye-actions [data-hotkey="${event.key}"]`);
    if (action) action.click();
    return;
  }
  if (currentView === "interactions" && /^[1-9]$/.test(event.key) && !event.target.closest("input,textarea")) {
    const action = $(`[data-hotkey="${event.key}"]`);
    if (action) fireAction(action);
  }
});

hydrate();
