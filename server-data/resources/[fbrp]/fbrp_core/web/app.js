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
  back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
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
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  radio: '<path d="M5 13a7 7 0 0 1 14 0M8 13a4 4 0 0 1 8 0"/><circle cx="12" cy="16" r="2"/><path d="M12 18v3"/>',
  leaf: '<path d="M5 21c0-9 6-15 16-16-1 10-7 16-16 16Z"/><path d="M5 21 14 12"/>',
  flame: '<path d="M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3-1-3 0-6 1-8z"/>',
  shirt: '<path d="M8 3 4 6l2 4 2-1v12h8V9l2 1 2-4-4-3c0 2-2 3-4 3s-4-1-4-3Z"/>',
  building: '<path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M3 21h18M8 8h3M8 12h3M8 16h3"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  wallet: '<path d="M19 7V5a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-4a2 2 0 0 0 0 4h4v2a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V6"/>',
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

/* ───────── M interaction wheel ───────── */
let radialPayload = {};
let radialCategory = null;

const RADIAL_CATEGORIES = [
  {
    id: "explore", label: "Explore", hint: "Play & discover", icon: "target", color: "#3fe3d2",
    actions: [
      { action: "pastimes", label: "Pastimes", hint: "Jobs, drops & duels", icon: "sparkles" },
      { action: "activities", label: "Challenges", hint: "Records & caches", icon: "target" },
      { action: "fish", label: "Fishing", hint: "Cast or reel", icon: "fish" },
      { action: "passport", label: "Passport", hint: "Explore landmarks", icon: "pin" },
      { action: "scenes", label: "Scene Hub", hint: "Find live RP", icon: "users" },
    ],
  },
  {
    id: "roleplay", label: "Roleplay", hint: "Character actions", icon: "sparkles", color: "#ff529a",
    actions: [
      { action: "interactions", label: "Interact", hint: "Nearby players", icon: "eye" },
      { action: "emotes", label: "Emotes", hint: "Gestures & props", icon: "sparkles" },
      { action: "showid", label: "Show ID", hint: "Present identity", icon: "id" },
      { action: "handsup", label: "Hands Up", hint: "Toggle stance", icon: "user" },
      { action: "point", label: "Point", hint: "Toggle pointing", icon: "back" },
    ],
  },
  {
    id: "vehicle", label: "Vehicle", hint: "Garage & controls", icon: "car", color: "#6fb6ff",
    actions: [
      { action: "vehicles", label: "Garage", hint: "Browse vehicles", icon: "car" },
      { action: "carcontrols", label: "Controls", hint: "Engine, doors & belt", icon: "gauge" },
    ],
  },
  {
    id: "services", label: "Services", hint: "Comms & groups", icon: "grid", color: "#c48bff",
    actions: [
      { action: "radio", label: "Radio", hint: "Tune a channel", icon: "radio" },
      { action: "org", label: "Organization", hint: "Duty & properties", icon: "building" },
      { action: "tags", label: "Tag Wardrobe", hint: "Choose headtags", icon: "shirt" },
    ],
  },
  {
    id: "duty", label: "Duty", hint: "Police tools", icon: "shield", color: "#ffb547",
    actions: [
      { action: "mdt", label: "Police MDT", hint: "Dispatch & reports", icon: "file" },
      { action: "bodycam", label: "Bodycam", hint: "Toggle recording", icon: "eye" },
      { action: "spikes", label: "Spike Strips", hint: "Deploy or collect", icon: "alert" },
    ],
  },
  {
    id: "emergency", label: "Emergency", hint: "911 & 311 calls", icon: "siren", color: "#ff6b57",
    actions: [
      { compose: "911", label: "Call 911", hint: "Police or EMS", icon: "siren" },
      { compose: "311", label: "Call 311", hint: "Non-emergency", icon: "phone" },
    ],
  },
];

function radialCategories() {
  const rows = [...RADIAL_CATEGORIES];
  if (radialPayload.jailed || radialPayload.communityService) {
    rows.push({
      id: "custody", label: "Custody", hint: radialPayload.jailed ? "Prison sentence" : "Community service", icon: "gavel", color: "#ff8c54",
      actions: radialPayload.jailed
        ? [
            { action: "prisonwork", label: "Prison Jobs", hint: "Work down time", icon: "gavel" },
            { action: "custody", label: "Sentence", hint: "Check remaining", icon: "clock" },
          ]
        : [{ action: "custody", label: "Service Status", hint: "Check remaining", icon: "trash" }],
    });
  }
  return rows;
}

function radialPoint(cx, cy, radius, degrees) {
  const angle = (degrees * Math.PI) / 180;
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
}

function radialSegmentPath(start, end) {
  const cx = 360, cy = 350, inner = 108, outer = 325;
  const a = radialPoint(cx, cy, outer, start);
  const b = radialPoint(cx, cy, outer, end);
  const c = radialPoint(cx, cy, inner, end);
  const d = radialPoint(cx, cy, inner, start);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${outer} ${outer} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)} L ${c.x.toFixed(2)} ${c.y.toFixed(2)} A ${inner} ${inner} 0 0 0 ${d.x.toFixed(2)} ${d.y.toFixed(2)} Z`;
}

function renderRadial() {
  const categories = radialCategories();
  const category = categories.find((row) => row.id === radialCategory);
  const rows = category ? category.actions : categories;
  const width = 180 / Math.max(1, rows.length);
  const gap = Math.min(1.3, width * .07);
  const accent = category?.color || "#3fe3d2";
  const segments = rows.map((row, index) => {
    const start = 180 + index * width + gap;
    const end = 180 + (index + 1) * width - gap;
    const attrs = category
      ? row.compose ? `data-radial-compose="${esc(row.compose)}"` : `data-radial-action="${esc(row.action)}"`
      : `data-radial-category="${esc(row.id)}"`;
    const color = category ? accent : row.color;
    return `<g class="radial-segment" style="--accent:${color}" ${attrs} role="button" tabindex="0"><path d="${radialSegmentPath(start, end)}"></path></g>`;
  }).join("");
  const labels = rows.map((row, index) => {
    const angle = 180 + (index + .5) * width;
    const point = radialPoint(360, 350, 224, angle);
    const attrs = category
      ? row.compose ? `data-radial-compose="${esc(row.compose)}"` : `data-radial-action="${esc(row.action)}"`
      : `data-radial-category="${esc(row.id)}"`;
    const color = category ? accent : row.color;
    return `<button type="button" class="radial-label" style="--x:${point.x.toFixed(1)}px;--y:${point.y.toFixed(1)}px;--accent:${color}" ${attrs}>${icon(row.icon)}<span>${esc(row.label)}</span><small>${esc(row.hint || "")}</small></button>`;
  }).join("");
  $("#radial-segments").innerHTML = segments;
  $("#radial-labels").innerHTML = labels;
  $("#radial-caption").innerHTML = category
    ? `<small>${esc(category.label)} SECTION</small><strong>Choose an action</strong>`
    : `<small>INTERACTION WHEEL</small><strong>Choose a section</strong>`;
  $("#radial-center").innerHTML = category
    ? `${icon("back")}<strong>Sections</strong><small>Back</small>`
    : `${icon("x")}<strong>Close</strong><small>M key</small>`;
  $("#radial-center").setAttribute("aria-label", category ? "Back to sections" : "Close interaction wheel");
}

function openRadialDispatch(kind) {
  const emergency = kind === "911";
  $("#radial-dispatch-kind").value = kind;
  setText("#radial-dispatch-kicker", emergency ? "EMERGENCY SERVICES" : "NON-EMERGENCY SERVICES");
  setText("#radial-dispatch-title", emergency ? "Call 911" : "Call 311");
  $("#radial-dispatch").classList.remove("hidden");
  $("#radial-menu").classList.add("composing");
  const box = $("#radial-dispatch textarea");
  box.value = "";
  box.focus();
}

function closeRadialDispatch() {
  $("#radial-dispatch").classList.add("hidden");
  $("#radial-menu").classList.remove("composing");
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
  setText("#radio", onRadio ? `Radio ${Number(data.radio).toFixed(2)}` : "Proximity");
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
  BACKUP: ["Officer needs backup", "siren", "panic"],
  TRAFFIC: ["Traffic stop", "car", "calm"],
  DRUGS: ["Narcotics tip", "leaf", ""],
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
  const c = find("chat");
  const id = data.serverId ?? lastHud.id ?? 0;
  const darkCls = (tag) => (tag && hexLuma(tag.color) < 0.24 ? "dark" : "");
  const preview = `
    <div class="tag-stage">
      <span class="stage-label">Preview</span>
      <div class="gta-head">${h ? `<span class="${darkCls(h)}" style="color:${safeColor(h.color)}">${esc(h.label)}</span> ` : ""}<span class="gid">[${Number(id) || 0}]</span></div>
      ${g ? `<div class="gta-sub ${darkCls(g)}" style="color:${safeColor(g.color)}">${esc(g.label)}</div>` : ""}
      <div class="chat-tag-preview"><span>CHAT</span> ${c ? `<b style="color:${safeColor(c.color)}">${esc(c.label)}</b>` : "<em>No additional tag</em>"} <strong>${esc(lastHud.name || "Your Name")}</strong></div>
    </div>`;
  const list = (kind, title, rows) => {
    const sel = Number(selected[kind]) || 0;
    const row = (tid, label, color, orgName) => `
      <button class="tag-row${sel === tid ? " selected" : ""}" data-tag-kind="${kind}" data-tag-id="${tid}">
        <span class="swatch${tid ? "" : " none"}" style="--c:${safeColor(color)}"></span>
        <span class="name${tid ? (hexLuma(color) < 0.24 ? " dark" : "") : " muted"}" ${tid ? `style="color:${safeColor(color)}"` : ""}>${esc(label)}</span>
        ${orgName ? `<span class="duty-lock">${esc(orgName)} duty</span>` : ""}
        <span class="tick">${icon("check")}</span>
      </button>`;
    return `<div><div class="eyebrow">${title}</div><div class="tag-list">${row(0, "None")}${(rows || []).map((t) => row(Number(t.id), t.label, t.color, t.org_name)).join("")}</div></div>`;
  };
  const total = (data.head || []).length + (data.gang || []).length + (data.chat || []).length;
  return `${head("Tag wardrobe", "Choose overhead tags and an optional extra tag beside your name in chat.", `<b>${total}</b> choices`)}${preview}
    <div class="tag-columns">${list("head", "Headtag", data.head)}${list("gang", "Gang tag", data.gang)}${list("chat", "Additional chat tag", data.chat)}</div>`;
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
      (v) => `<button class="vehicle-card" data-category="${esc(active.id)}" data-model="${esc(v.key || v.model)}">
        <div class="shot"><img src="https://docs.fivem.net/vehicles/${encodeURIComponent(String(v.model).toLowerCase())}.webp" alt="" data-fallback="${esc(active.icon || "car")}"></div>
        <div class="meta"><div><strong>${esc(v.label)}</strong><small>${esc(v.note || v.model)}</small></div><span class="go">Spawn</span></div>
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
  commserv: ["Justice", "trash"],
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
  const volume = Number(ui.radioVolume ?? 30);
  const frequency = current ? current.toFixed(2) : "--.--";
  return `<div class="radio-handset${current ? " connected" : ""}" id="radio-console">
    <div class="radio-antenna"></div><div class="radio-knob"></div>
    <header class="radio-brand"><span><b>FBRP</b><small>FIELD RADIO</small></span><button type="button" data-radio-close aria-label="Close radio">×</button></header>
    <div class="radio-display">
      <div class="radio-status"><i></i><span>${current ? "CONNECTED" : "STANDBY"}</span><em>${members.length} RX</em></div>
      <strong>${frequency}</strong><small>MHz</small>
      <p>${esc(data.currentName || "Disconnected")}</p>
    </div>
    <form id="radio-tune" class="radio-tune">
      <label>Frequency<input name="channel" inputmode="decimal" type="number" min="1" max="${Number(data.maxChannel) || 999.99}" step="0.01" placeholder="00.00" required></label>
      <button type="submit">Tune</button>
    </form>
    <div class="radio-speaker" aria-hidden="true"></div>
    <label class="radio-volume"><span>Volume <b id="radio-volume-value">${volume}%</b></span><input id="radio-volume" type="range" min="0" max="100" value="${volume}"></label>
    <div class="radio-footer"><span><kbd>Left Alt</kbd> Push to talk</span><button type="button" data-radio-leave ${current ? "" : "disabled"}>Off</button></div>
    <p class="radio-access">All two-decimal frequencies are public unless organization locked.</p>
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

function hubCard(action, iconName, title, copy, badge = "") {
  return `<button class="hub-card" data-hub-action="${esc(action)}">
    <span class="hub-icon">${icon(iconName)}</span><span><strong>${esc(title)}</strong><small>${esc(copy)}</small></span>${badge ? `<em>${esc(badge)}</em>` : ""}
  </button>`;
}

function renderHub(data) {
  const custody = data.jailed
    ? `<section class="hub-alert prison"><div>${icon("gavel")}<span><b>You are in Bolingbroke</b><small>Choose a work detail or check your remaining sentence.</small></span></div><button data-hub-action="prisonwork">Prison jobs</button><button data-hub-action="custody">Sentence status</button></section>`
    : data.communityService
      ? `<section class="hub-alert service"><div>${icon("trash")}<span><b>Community service active</b><small>Collect marked rubbish around Legion Square. Your timer pauses when idle.</small></span></div><button data-hub-action="custody">Service status</button></section>`
      : "";
  const explore = [
    hubCard("pastimes", "sparkles", "Pastimes", "Side jobs, supply drops, street duels, skydiving, achievements and weekly goals.", "NEW"),
    hubCard("activities", "target", "Challenges & caches", "Time trials, trail runs, bike circuits, records, and today's hidden cache."),
    hubCard("fish", "fish", "Go fishing", "Cast or reel in your line when facing open water."),
    hubCard("passport", "pin", "Coastal Passport", "Explore landmarks, collect stamps, and finish daily field notes."),
    hubCard("scenes", "users", "Scene Hub", "Find live player scenes and community events."),
  ].join("");
  const roleplay = [
    hubCard("interactions", "eye", "Player interactions", "Look at someone nearby to cuff, search, escort, identify, or help."),
    hubCard("emotes", "sparkles", "Emotes", "Gestures, props, work animations, fitness, and dances."),
    hubCard("showid", "id", "Show my ID", "Present your character ID to nearby players."),
    hubCard("handsup", "user", "Hands up", "Raise or lower your hands."),
  ].join("");
  const tools = [
    hubCard("vehicles", "car", "Vehicle garage", "Browse and spawn approved vehicles."),
    hubCard("carcontrols", "gauge", "Vehicle controls", "Engine, locks, doors, cruise, and seatbelt."),
    hubCard("radio", "radio", "Radio network", "Join public or organization frequencies."),
    hubCard("org", "building", "Organization hub", "Duty work, properties, deliveries, armory, and wardrobe."),
    hubCard("tags", "shirt", "Tag wardrobe", "Choose your granted headtag and organization tag."),
    hubCard("mdt", "file", "Police MDT", "Dispatch, reports, warrants, citations, and corrections.", "DUTY"),
  ].join("");
  return `${head("Interaction Menu", "Everything you need for life around Florida Bay—without memorizing commands.", `<kbd>F1</kbd> vMenu`)}
    ${custody}
    <div class="hub-layout">
      <section><div class="eyebrow">Explore & play</div><div class="hub-grid">${explore}</div></section>
      <section><div class="eyebrow">Roleplay</div><div class="hub-grid">${roleplay}</div></section>
      <section class="hub-tools"><div class="eyebrow">Tools & services</div><div class="hub-grid compact">${tools}</div></section>
      <section class="hub-emergency"><div class="eyebrow">Call for help</div>
        <form id="hub-dispatch-form"><div class="dispatch-kind"><label><input type="radio" name="kind" value="911" checked><span><b>911</b><small>Police & EMS</small></span></label><label><input type="radio" name="kind" value="311"><span><b>311</b><small>Non-emergency</small></span></label></div><textarea name="message" maxlength="300" required placeholder="Describe what is happening and where…"></textarea><button type="submit" class="primary-action">Send call</button></form>
      </section>
    </div>`;
}

function formatRun(ms) {
  if (!ms) return "—";
  const seconds = Number(ms) / 1000;
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
}

function renderActivities(data) {
  const p = data.profile || {};
  const active = data.active;
  const cards = (data.challenges || []).map((c) => {
    const leader = c.leaders?.[0];
    return `<article class="activity-card${c.featured ? " featured" : ""}">
      <div class="activity-card-top"><span>${icon(c.icon || "target")}</span><div><small>${esc(c.mode)}${c.featured ? " · FEATURED TODAY" : ""}</small><h3>${esc(c.label)}</h3></div></div>
      <p>${esc(c.description)}</p>
      <div class="activity-stats"><span><small>Your best</small><b>${formatRun(c.personal)}</b></span><span><small>Server record</small><b>${leader ? formatRun(leader.ms) : "Open"}</b><em>${leader ? esc(leader.name) : "Be first"}</em></span><span><small>Finished</small><b>${Number(c.completions) || 0}</b></span></div>
      <button class="primary-action" data-activity-start="${esc(c.id)}" ${active ? "disabled" : ""}>${active?.id === c.id ? "Run in progress" : "Start challenge"}</button>
    </article>`;
  }).join("");
  const cache = data.cache || {};
  return `${head("Florida Bay Activities", "Repeatable challenges, persistent records, and a new hidden cache every day.", `<b>${Number(p.points) || 0}</b> points`)}
    <section class="activity-profile"><div><small>Total completions</small><b>${Number(p.completions) || 0}</b></div><div><small>Caches found</small><b>${Number(p.caches) || 0}</b></div><div><small>Cache streak</small><b>${Number(p.streak) || 0} days</b></div><aside>${icon("sparkles")} Personal bests earn 100 points. Repeat runs earn 35.</aside></section>
    ${active ? `<section class="activity-active">${icon("target")}<div><b>Challenge in progress</b><small>Checkpoint ${Number(active.checkpoint) || 1}. Return to the route, or cancel this run to start another.</small></div><button data-activity-cancel>Cancel run</button></section>` : ""}
    <section class="cache-card${cache.found ? " found" : ""}"><span class="cache-mark">${cache.found ? icon("check") : icon("search")}</span><div><small>DAILY GEOCACHE · ${esc(cache.region || "Florida Bay")}</small><h3>${esc(cache.found ? "Cache found" : cache.label || "Hidden cache")}</h3><p>${esc(cache.clue || "Follow the clue and search the area.")}</p></div><button data-activity-cache ${cache.found ? "disabled" : ""}>${cache.found ? "Come back tomorrow" : `${icon("pin")} Mark search area`}</button></section>
    <div class="activity-grid">${cards}</div>`;
}

/* ───────── Pastimes: side jobs, supply drops, street duels, skydiving, achievements ───────── */
const PT_TABS = [
  ["overview", "Overview", "sparkles"],
  ["jobs", "Side jobs", "car"],
  ["duels", "Street duels", "gauge"],
  ["skydive", "Skydiving", "target"],
  ["achievements", "Achievements", "check"],
  ["goals", "Community", "users"],
];
const PT_TIER = { common: "#93a3ab", rare: "#6fa8ff", epic: "#c48bff", legendary: "#ffb547" };

const ptList = (value) => (Array.isArray(value) ? value : []);

function ptBar(value, max, color) {
  const pct = max > 0 ? clamp((Number(value) / Number(max)) * 100, 0, 100) : 0;
  return `<div class="pt-bar"><i style="width:${pct.toFixed(1)}%${color ? `;background:${esc(color)}` : ""}"></i></div>`;
}

function ptButton(action, id, label, extra = "") {
  return `<button class="primary-action" data-pt-action="${esc(action)}"${id !== undefined ? ` data-pt-id="${esc(id)}"` : ""} ${extra}>${label}</button>`;
}

function ptPace(ms) {
  if (!ms) return "—";
  const seconds = Number(ms) / 1000;
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")} /km`;
}

function ptOverview(data) {
  const p = data.profile || {};
  const s = p.stats || {};
  const d = p.daily || {};
  const drops = data.drops || {};
  const levelSpan = p.next ? p.next.rep - p.floor : 1;
  const levelDone = p.next ? p.rep - p.floor : 1;
  const leaders = ptList(p.leaders).map((row, index) =>
    `<li><span>${index + 1}</span><b>${esc(row.name)}</b>${row.title ? `<em>${esc(row.title)}</em>` : ""}<strong>${Number(row.rep) || 0}</strong></li>`).join("");
  return `<section class="pt-hero">
      <div><small>BAY REP</small><h3>${esc(p.level || "Newcomer")}</h3><p>${Number(p.rep) || 0} rep${p.next ? ` · ${p.next.rep - p.rep} to ${esc(p.next.label)}` : " · top rank reached"}</p>${p.title ? `<span class="pt-title">${esc(p.title)}</span>` : ""}</div>
      <div class="pt-hero-bar">${ptBar(levelDone, levelSpan)}</div>
    </section>
    <div class="pt-row">
      <section class="pt-card"><div class="eyebrow">Daily check-in</div>
        <p class="pt-copy">${d.streak ? `<b>${Number(d.streak)}</b> day streak.` : "Start a streak."} Every seventh day pays a bonus.</p>
        ${ptButton("daily", undefined, d.claimed ? "Claimed today" : `Check in · +${Number(d.nextRep) || 0} rep`, d.claimed ? "disabled" : "")}
      </section>
      <section class="pt-card${drops.active ? " live" : ""}"><div class="eyebrow">Supply drop</div>
        <p class="pt-copy">${drops.active
          ? `A crate is down near <b>${esc(drops.active.region)}</b>. ${Math.ceil((Number(drops.active.seconds) || 0) / 60)} min left. Check your map for the search circle.`
          : `Next crate in about <b>${Number(drops.nextMinutes) || "a few"}</b> minutes. First player to hold E on it wins ${Number(drops.rep) || 0}+ rep.`}</p>
        <small class="pt-note">${Number(drops.won) || 0} secured</small>
      </section>
    </div>
    <section class="activity-profile pt-stats"><div><small>Side jobs</small><b>${Number(s.jobs) || 0}</b></div><div><small>Supply drops</small><b>${Number(s.drops) || 0}</b></div><div><small>Skydives</small><b>${Number(s.skydives) || 0}</b></div><div><small>Street duels</small><b>${Number(s.duels) || 0}</b></div></section>
    <section class="pt-card"><div class="eyebrow">Top Bay Rep</div><ol class="pt-leaders">${leaders || '<li class="empty">Nobody on the board yet. Finish a job to claim the top spot.</li>'}</ol></section>`;
}

function ptJobs(data) {
  const jobs = data.jobs || {};
  const active = jobs.active;
  const cards = ptList(jobs.types).map((j) => `<article class="activity-card">
      <div class="activity-card-top"><span>${icon(j.icon || "car")}</span><div><small>${esc(j.requirement || "")}</small><h3>${esc(j.label)}</h3></div></div>
      <p>${esc(j.description)}</p>
      <div class="activity-stats"><span><small>Finished</small><b>${Number(j.completions) || 0}</b></span><span><small>Distance</small><b>${Number(j.km) || 0} km</b></span><span><small>Best pace</small><b>${ptPace(j.bestPace)}</b></span></div>
      ${ptButton("job", j.id, active ? "Job in progress" : "Take this job", active ? "disabled" : "")}
    </article>`).join("");
  return `${active ? `<section class="activity-active">${icon("car")}<div><b>Job in progress</b><small>Stage ${Number(active.stage) || 1} of 2. Follow the route on your map, or cancel to take a different job.</small></div><button data-pt-action="jobcancel">Cancel job</button></section>` : ""}
    <section class="pt-card"><div class="eyebrow">How it works</div><p class="pt-copy">Pick a job, drive to the pickup, stop inside the marker, then deliver. Faster legs pay up to <b>+40%</b>. Chain jobs within ten minutes to build a shift streak${jobs.streak > 1 ? ` (<b>x${Number(jobs.streak)}</b> now)` : ""}.</p></section>
    <div class="activity-grid">${cards}</div>`;
}

function ptDuels(data) {
  const d = data.duels || {};
  const invite = d.invite;
  const nearby = ptList(d.nearby).map((n) => `<li><b>${esc(n.name)}</b><small>#${Number(n.id)}</small>${ptButton("duel", n.id, "Challenge")}</li>`).join("");
  const leaders = ptList(d.leaders).map((row, index) =>
    `<li><span>${index + 1}</span><b>${esc(row.name)}</b>${row.title ? `<em>${esc(row.title)}</em>` : ""}<small>${Number(row.won)}W ${Number(row.lost)}L</small><strong>${Number(row.rating)}</strong></li>`).join("");
  return `<section class="activity-profile pt-stats"><div><small>Duel rating</small><b>${Number(d.rating) || 1000}</b></div><div><small>Record</small><b>${Number(d.won) || 0}W · ${Number(d.lost) || 0}L</b></div><div><small>Win streak</small><b>${Number(d.streak) || 0}</b></div><div><small>Best streak</small><b>${Number(d.best) || 0}</b></div></section>
    ${invite ? `<section class="activity-active">${icon("alert")}<div><b>${esc(invite.from)} challenged you</b><small>${Math.round((Number(invite.meters) || 0) / 10) / 100} km street race. First to the finish marker wins.</small></div><button data-pt-action="duelaccept">Accept</button><button data-pt-action="dueldecline">Decline</button></section>` : ""}
    <section class="pt-card"><div class="eyebrow">Challenge a driver</div>
      <p class="pt-copy">Set a map waypoint 0.4 to 6.5 km away. That is the finish line. Pull up beside another driver, then challenge them. Both of you freeze for a 5 second countdown. You can also type <b>/duel</b> to challenge the nearest driver.</p>
      ${d.driving ? (nearby ? `<ul class="pt-list">${nearby}</ul>` : '<p class="pt-note">No other drivers are close enough yet.</p>') : '<p class="pt-note">Sit in the driver seat of a car or bike to see nearby drivers.</p>'}
    </section>
    <section class="pt-card"><div class="eyebrow">Top duelists</div><ol class="pt-leaders">${leaders || '<li class="empty">No duels have been run yet.</li>'}</ol></section>`;
}

function ptSkydive(data) {
  const sky = data.skydive || {};
  const cards = ptList(sky.jumps).map((j) => `<article class="activity-card">
      <div class="activity-card-top"><span>${icon("target")}</span><div><small>${esc(j.difficulty)}</small><h3>${esc(j.label)}</h3></div></div>
      <p>${esc(j.description)}</p>
      <div class="activity-stats"><span><small>Your best</small><b>${j.best != null ? Number(j.best).toFixed(1) + " m" : "—"}</b></span><span><small>Server record</small><b>${j.record ? Number(j.record.meters).toFixed(1) + " m" : "Open"}</b><em>${j.record ? esc(j.record.name) : "Be first"}</em></span><span><small>Jumps</small><b>${Number(j.attempts) || 0}</b></span></div>
      ${ptButton("skydive", j.id, sky.active ? "Jump in progress" : "Start jump", sky.active ? "disabled" : "")}
    </article>`).join("");
  return `${sky.active ? `<section class="activity-active">${icon("target")}<div><b>Jump in progress</b><small>Land on the orange marker. Score is the distance from its centre.</small></div><button data-pt-action="skydivecancel">Abort jump</button></section>` : ""}
    <section class="pt-card"><div class="eyebrow">How it works</div><p class="pt-copy">You are taken to the platform with a parachute. Step off, hold <b>SPACE</b> to open your chute, steer onto the marker. Landing within <b>5 m</b> is a bullseye.</p></section>
    <div class="activity-grid">${cards}</div>`;
}

function ptAchievements(data) {
  const a = data.achievements || {};
  const title = (data.profile || {}).title;
  const tiles = ptList(a.list).map((row) => {
    const color = PT_TIER[row.tier] || PT_TIER.common;
    const wear = row.unlocked && row.title
      ? `<button class="pt-wear" data-pt-action="title" data-pt-id="${esc(row.id)}">${title === row.title ? "Wearing" : `Wear “${esc(row.title)}”`}</button>`
      : (row.title ? `<small class="pt-note">Title: ${esc(row.title)}</small>` : "");
    return `<article class="pt-ach${row.unlocked ? " done" : ""}" style="--tier:${color}">
      <header><b>${esc(row.label)}</b><em>${esc(row.tier)}</em></header>
      <p>${esc(row.desc)}</p>
      ${ptBar(row.progress, row.target, color)}
      <footer><small>${row.unlocked ? "Unlocked" : `${Number(row.progress)} / ${Number(row.target)}`}</small><small>+${Number(row.rep)} rep</small></footer>
      ${wear}
    </article>`;
  }).join("");
  return `<section class="pt-card"><div class="eyebrow">${Number(a.unlocked) || 0} of ${Number(a.total) || 0} unlocked</div>
      <p class="pt-copy">Achievements unlock automatically from fishing, the passport, challenges and every pastime. Titles show beside your name on leaderboards and announcements.${title ? ` <button class="pt-wear" data-pt-action="title" data-pt-id="">Clear title</button>` : ""}</p></section>
    <div class="pt-ach-grid">${tiles}</div>`;
}

function ptGoals(data) {
  const c = data.community || {};
  const cards = ptList(c.goals).map((g) => `<article class="activity-card${g.complete ? " featured" : ""}">
      <div class="activity-card-top"><span>${icon(g.icon || "users")}</span><div><small>${g.complete ? "COMPLETE" : "THIS WEEK"}</small><h3>${esc(g.label)}</h3></div></div>
      <p>${esc(g.description)}</p>
      ${ptBar(g.total, g.target, g.complete ? "#4fe08c" : "")}
      <div class="activity-stats"><span><small>Community</small><b>${Number(g.total)} / ${Number(g.target)}</b></span><span><small>Your share</small><b>${Number(g.mine)}</b></span><span><small>Reward</small><b>+${Number(g.reward)}</b></span></div>
      ${ptButton("claim", g.id, g.claimed ? "Reward claimed" : (g.complete ? "Claim reward" : "In progress"), g.claimed || !g.complete || !g.mine ? "disabled" : "")}
    </article>`).join("");
  const ends = c.endsAt ? new Date(Number(c.endsAt)).toLocaleDateString(undefined, { weekday: "long" }) : "Sunday";
  return `<section class="pt-card"><div class="eyebrow">Weekly community goals</div><p class="pt-copy">Everyone on the server fills the same bar. When a goal is met, anyone who contributed can claim the reward. New goals arrive each Monday (UTC), and this week's end ${esc(ends)} night.</p></section>
    <div class="activity-grid">${cards}</div>`;
}

function renderPastimes(data) {
  const tab = ui.pastimeTab || "overview";
  const p = data.profile || {};
  const tabs = `<nav class="pt-tabs">${PT_TABS.map(([id, label, ic]) =>
    `<button class="${tab === id ? "on" : ""}" data-pt-tab="${id}">${icon(ic)}<span>${label}</span></button>`).join("")}</nav>`;
  const views = { overview: ptOverview, jobs: ptJobs, duels: ptDuels, skydive: ptSkydive, achievements: ptAchievements, goals: ptGoals };
  return `${head("Florida Bay Pastimes", "Side jobs, supply drops, street duels, skydiving, achievements and weekly goals.", `<b>${Number(p.rep) || 0}</b> Bay Rep`)}
    ${tabs}${(views[tab] || ptOverview)(data)}`;
}

function renderMenu() {
  const titles = {
    hub: "Interaction Menu",
    activities: "Activities",
    pastimes: "Pastimes",
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
    prisonjobs: "Prison work",
    orghub: "Organization",
  };
  setText("#menu-title", titles[currentView] || "Menu");
  const renderers = {
    hub: renderHub,
    activities: renderActivities,
    pastimes: renderPastimes,
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
    prisonjobs: renderPrisonJobs,
    orghub: renderOrgHub,
  };
  const shell = $(".menu-shell");
  shell.classList.toggle("wide", ["mdt", "orghub"].includes(currentView));
  shell.classList.toggle("cad-mode", currentView === "mdt");
  shell.classList.toggle("radio-mode", currentView === "radio");
  $("#menu").classList.toggle("radio-mode", currentView === "radio");
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
  const behaviour = clamp(Number(d.behaviour ?? 60), 0, 100);
  setText("#jail-behaviour", behaviour);
  $("#jail-behaviour-bar").style.width = `${behaviour}%`;
  $("#jail-behaviour-bar").className = behaviour >= 75 ? "good" : behaviour >= 45 ? "fair" : "poor";
  setText("#jail-tier", d.tier || "Fair");
  $("#jail-tier").className = `tier-pill t-${String(d.tier || "fair").toLowerCase()}`;
  setText("#jail-reduced", fmtClock(d.reduced || 0));
  setText("#jail-jobs", Number(d.jobsDone) || 0);
  $("#jail-goodtime").classList.toggle("hidden", !d.goodTime);
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
    : d.inPrison ? `<div class="idcard-flag">${icon("gavel")} Serving a sentence</div>`
    : d.license === "suspended" || d.license === "revoked" ? `<div class="idcard-flag">${icon("car")} Driver license ${esc(d.license)}</div>` : "";
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

let activityRunTimer = null;
function updateActivityRun(d) {
  const box = $("#activity-run");
  clearInterval(activityRunTimer);
  box.classList.toggle("hidden", !d.active);
  if (!d.active) return;
  const total = Math.max(1, Number(d.total) || 1);
  const index = clamp(Number(d.index) || 1, 1, total);
  const startedAt = Number(d.startedAt) || Date.now();
  setText("#activity-run-label", d.label || "Activity");
  setText("#activity-run-step", `Checkpoint ${index}/${total}`);
  $("#activity-run-bar").style.width = `${clamp((index / total) * 100, 0, 100)}%`;
  const tick = () => {
    const seconds = Math.max(0, (Date.now() - startedAt) / 1000);
    setText("#activity-run-time", `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, "0")}`);
  };
  tick();
  activityRunTimer = setInterval(tick, 50);
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

/* ───────── CAD / MDT ───────── */
const MDT_TABS = [
  ["dashboard", "Overview", "grid"],
  ["dispatch", "Dispatch", "radio"],
  ["search", "Citizens", "users"],
  ["plates", "Vehicles", "car"],
  ["warrants", "Warrants", "gavel"],
  ["bolos", "BOLOs", "alert"],
  ["reports", "Reports", "file"],
  ["corrections", "Corrections", "lock"],
  ["penal", "Penal code", "book"],
];
const KIND_TONE = { infraction: "dim", misdemeanor: "warn", felony: "bad", custom: "dim" };
const CALL_TONE = { "911": "panic", PANIC: "panic", EMS: "ems", PRISON: "panic", BACKUP: "panic", DRUGS: "bolo", TRAFFIC: "unit", "311": "unit", BOLO: "bolo" };
const mdtSend = (kind, body = {}) => post("mdtAction", { kind, ...body });
const initials2 = (name) => esc(String(name || "?").split(/\s+/).map((p) => p[0] || "").join("").slice(0, 2).toUpperCase());

// San Andreas silhouette in world coordinates, projected onto the CAD map.
const SA_OUTLINE = [[1250, -3400], [300, -3520], [-900, -3600], [-1900, -3350], [-2350, -2500], [-1950, -1350], [-2150, -700], [-2750, 50], [-3300, 1000], [-3250, 2100], [-2950, 3200], [-2500, 4100], [-1600, 5100], [-850, 6050], [-300, 6750], [500, 7150], [1550, 6750], [2600, 6350], [3400, 5550], [3750, 4500], [3650, 3500], [3250, 2450], [2950, 1500], [2650, 450], [2450, -550], [1900, -1800], [1550, -2650]];
const SA_LABELS = [["Los Santos", -150, -1000], ["Sandy Shores", 1850, 3650], ["Paleto Bay", -250, 6350], ["Grapeseed", 1900, 4900], ["Fort Zancudo", -2250, 3100], ["Mt Chiliad", 500, 5550], ["Alamo Sea", 1100, 4150], ["Bolingbroke", 1690, 2400], ["Vinewood Hills", 300, 900]];
const MAP_BOUNDS = { minX: -3800, maxX: 4400, minY: -4000, maxY: 8000 };
const project = (x, y) => [((Number(x) - MAP_BOUNDS.minX) / (MAP_BOUNDS.maxX - MAP_BOUNDS.minX)) * 100, (1 - (Number(y) - MAP_BOUNDS.minY) / (MAP_BOUNDS.maxY - MAP_BOUNDS.minY)) * 100];

function cadMap(d, big) {
  const path = SA_OUTLINE.map(([x, y], i) => { const [px, py] = project(x, y); return `${i ? "L" : "M"}${(px * 8.2).toFixed(1)} ${(py * 12).toFixed(1)}`; }).join(" ") + "Z";
  const [ax, ay] = project(1300, 4050);
  const units = (d.units || []).filter((u) => Number.isFinite(Number(u.x)) && u.x !== null).map((u) => {
    const [x, y] = project(u.x, u.y);
    const me = Number(u.id) === Number(d.me?.id);
    return `<i class="map-unit ${u.kind}${u.downed ? " down" : ""}${me ? " me" : ""} st-${esc(u.status)}" style="left:${clamp(x, 1, 99)}%;top:${clamp(y, 1, 99)}%"><span>${esc(u.callsign || u.name)}</span></i>`;
  }).join("");
  const calls = (d.calls || []).filter((c) => Number.isFinite(Number(c.x)) && c.x !== null).map((c) => {
    const [x, y] = project(c.x, c.y);
    return `<i class="map-call k-${esc(String(c.kind).toLowerCase())}" style="left:${clamp(x, 1, 99)}%;top:${clamp(y, 1, 99)}%" data-mdt-call-gps="${Number(c.id)}" title="#${Number(c.id)} ${esc(c.message)}"><span>#${Number(c.id)}</span></i>`;
  }).join("");
  const labels = SA_LABELS.map(([label, x, y]) => { const [px, py] = project(x, y); return `<em style="left:${px}%;top:${py}%">${label}</em>`; }).join("");
  return `<div class="cad-map${big ? " big" : ""}">
    <svg viewBox="0 0 820 1200" preserveAspectRatio="none" aria-hidden="true"><defs><pattern id="cadgrid" width="41" height="60" patternUnits="userSpaceOnUse"><path d="M41 0H0V60" fill="none" stroke="rgba(124,243,230,.07)" stroke-width="1"/></pattern></defs>
      <rect width="820" height="1200" fill="url(#cadgrid)"/><path class="land" d="${path}"/><ellipse class="lake" cx="${(ax * 8.2).toFixed(1)}" cy="${(ay * 12).toFixed(1)}" rx="62" ry="30"/></svg>
    ${labels}${calls}${units}
    <div class="map-legend"><span><i class="map-unit police"></i>LEO</span><span><i class="map-unit ems"></i>EMS</span><span><i class="map-call"></i>Call</span></div>
    <div class="map-scan"></div>
  </div>`;
}

function mdtInit(payload) {
  const form = payload.profile ? payload.form || null : null;
  ui.mdt = {
    tab: payload.profile ? "profile" : "dashboard",
    dashboard: payload.dashboard || {},
    profile: payload.profile || null,
    form,
    charges: new Set(),
    months: null,
    minutes: null,
    notes: "",
    results: null,
    query: "",
    plate: null,
    reports: null,
    reportQuery: "",
    report: null,
    reportDraft: null,
    picks: [],
    openCall: null,
    callsignEdit: false,
  };
  clearInterval(ui.mdtClock);
  ui.mdtClock = setInterval(() => setText("#cad-clock", new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })), 1000);
  clearInterval(ui.mdtPoll);
  ui.mdtPoll = setInterval(() => { if (currentView === "mdt" && ["dashboard", "dispatch"].includes(ui.mdt?.tab)) mdtSend("dashboard"); }, 8000);
}

const statusMeta = (id) => (currentPayload.statuses || []).find((s) => s.id === id) || { id, label: id || "Unknown", short: id || "?", tone: "dim" };
const flagMeta = (id) => (currentPayload.flags || []).find((f) => f.id === id) || { id, label: id, tone: "warn" };

function mdtStat(label, value, tone, ic) {
  return `<div class="cad-stat${tone ? ` tone-${tone}` : ""}"><span class="cad-stat-ic">${icon(ic || "info")}</span><b>${value}</b><small>${label}</small></div>`;
}

function mdtRecordRow(r, withName) {
  const tone = r.kind === "arrest" ? "panic" : r.kind === "citation" ? "bolo" : r.kind === "service" ? "ems" : "unit";
  const detail = [chargeList(r.charges) || "No charges listed", r.months ? `${r.months} months` : "", r.fine ? `$${r.fine}` : ""].filter(Boolean).join(" · ");
  return `<div class="mdt-row"><span class="mdt-kind k-${tone}">${esc(r.kind)}</span><div><b>${withName ? (r.character_id ? `<a data-mdt-profile="${Number(r.character_id)}">${esc(r.name)}</a>` : esc(r.name)) : esc(detail)}</b><small>${withName ? esc(detail) : ""}${r.notes ? `${withName ? " · " : ""}${esc(r.notes)}` : ""}</small></div><em>${esc(r.officer_name)} · ${when(r.created_at)}</em></div>`;
}

function callCard(c, compact) {
  const m = ui.mdt;
  const me = Number(m.dashboard.me?.id);
  const attached = (c.responders || []).some((r) => Number(r.id) === me);
  const open = Number(m.openCall) === Number(c.id);
  const tone = CALL_TONE[c.kind] || "unit";
  return `<article class="call-card t-${tone}${attached ? " attached" : ""}">
    <header><span class="mdt-kind k-${tone}">${esc(c.kind)}</span><b>#${Number(c.id)}</b><span class="call-age">${ago(c.at)}</span></header>
    <p>${esc(c.message)}</p>
    <div class="call-meta"><span>${icon("user")}${esc(c.caller || "Dispatch")}</span>${(c.responders || []).length ? `<span>${icon("users")}${c.responders.map((r) => esc(r.callsign || r.name)).join(", ")}</span>` : `<span class="tone-warn">${icon("alert")}Unassigned</span>`}</div>
    ${compact ? "" : `<div class="call-actions">
      ${attached ? `<button class="ctl-btn small" data-mdt-call="callDetach" data-id="${Number(c.id)}">Detach</button>` : `<button class="ctl-btn small on" data-mdt-call="callAttach" data-id="${Number(c.id)}">${icon("check")} Attach</button>`}
      <button class="ctl-btn small" data-mdt-call="callWaypoint" data-id="${Number(c.id)}">${icon("pin")} GPS</button>
      <button class="ctl-btn small" data-mdt-call-notes="${Number(c.id)}">${icon("file")} Notes${(c.notes || []).length ? ` · ${c.notes.length}` : ""}</button>
      <button class="ctl-btn small danger" data-mdt-call="callClose" data-id="${Number(c.id)}">Close</button>
    </div>
    ${open ? `<div class="call-notes">${(c.notes || []).map((n) => `<div><b>${esc(n.callsign || n.by)}</b><span>${esc(n.text)}</span><em>${ago(n.at)}</em></div>`).join("") || '<small class="tone-dim">No notes yet.</small>'}
      <form class="call-note-form" data-call="${Number(c.id)}"><input class="mdt-input" name="text" maxlength="240" placeholder="Add a call note…" autocomplete="off"><button class="primary-action" type="submit">Add</button></form></div>` : ""}`}
  </article>`;
}

function unitRow(u) {
  const s = statusMeta(u.status);
  return `<div class="unit-row${Number(u.id) === Number(ui.mdt.dashboard.me?.id) ? " me" : ""}"><span class="unit-sign ${u.kind}">${esc(u.callsign || (u.kind === "police" ? "LEO" : "EMS"))}</span><div><b>${esc(u.name)} <em>[${Number(u.id)}]</em></b><small>${esc(u.org || "On duty")}</small></div>${u.downed ? '<span class="status-pill tone-bad">DOWN</span>' : `<span class="status-pill tone-${esc(s.tone)}">${esc(s.short)}</span>`}</div>`;
}

function mdtDashboard(m) {
  const d = m.dashboard || {};
  const warrants = d.warrants || [], bolos = d.bolos || [], inmates = d.inmates || [], units = d.units || [], calls = d.calls || [], records = d.records || [], services = d.services || [], seizures = d.seizures || [];
  const st = d.stats || { mine: {} };
  const unassigned = calls.filter((c) => !(c.responders || []).length).length;
  return `<div class="cad-grid-stats">
      ${mdtStat("Units on duty", units.length, "", "users")}
      ${mdtStat("Active calls", calls.length, calls.length ? "warn" : "", "radio")}
      ${mdtStat("Unassigned", unassigned, unassigned ? "bad" : "", "alert")}
      ${mdtStat("Active warrants", warrants.length, warrants.length ? "bad" : "", "gavel")}
      ${mdtStat("Active BOLOs", bolos.length, bolos.length ? "warn" : "", "search")}
      ${mdtStat("In custody", inmates.filter((i) => i.status === "serving").length + services.length, "", "lock")}
    </div>
    <div class="cad-two">
      <section class="mdt-panel"><div class="eyebrow">Live map</div>${cadMap(d, false)}</section>
      <div class="cad-stack">
        <section class="mdt-panel shift"><div class="eyebrow">Your shift today</div>
          <div class="shift-grid"><div><b>${Number(st.mine?.arrests) || 0}</b><small>Arrests</small></div><div><b>${Number(st.mine?.citations) || 0}</b><small>Citations</small></div><div><b>${Number(st.mine?.reports) || 0}</b><small>Reports</small></div></div>
          <small class="tone-dim">Department today: ${Number(st.arrests) || 0} arrests · ${Number(st.citations) || 0} citations · ${Number(st.services) || 0} community service · ${Number(st.reports) || 0} reports</small>
        </section>
        <section class="mdt-panel"><div class="eyebrow">Active calls <a data-mdt-tab="dispatch">Open dispatch →</a></div>${calls.length ? calls.slice(0, 4).map((c) => callCard(c, true)).join("") : '<div class="empty compact">No active calls.</div>'}</section>
      </div>
    </div>
    <div class="mdt-columns">
      <section class="mdt-panel"><div class="eyebrow">Latest records</div>${records.length ? records.slice(0, 8).map((r) => mdtRecordRow(r, true)).join("") : '<div class="empty compact">No records yet.</div>'}</section>
      <section class="mdt-panel"><div class="eyebrow">Narcotics seizures</div>${seizures.length ? seizures.map((s) => `<div class="mdt-row"><span class="mdt-kind k-bolo">${esc(s.drug)}</span><div><b>${Number(s.units)} units · ${esc(s.name)}</b><small>${esc(s.status === "seized" ? `Seized by ${s.seized_by || "police"}` : `Confiscated at booking by ${s.seized_by || "police"}`)}${s.location ? ` · ${esc(s.location)}` : ""}</small></div><em>${ago(s.created_at)}</em></div>`).join("") : '<div class="empty compact">No seizures logged.</div>'}</section>
    </div>`;
}

function mdtDispatch(m) {
  const d = m.dashboard || {};
  const calls = d.calls || [];
  const units = d.units || [];
  return `<div class="cad-dispatch">
    <section class="cad-calls"><div class="eyebrow">Call queue · ${calls.length}</div>${calls.length ? calls.map((c) => callCard(c, false)).join("") : '<div class="empty">The call queue is clear. Calls from /911, /311, panic buttons and drop-off tips land here.</div>'}</section>
    <section class="cad-side">
      <div class="mdt-panel"><div class="eyebrow">Units · ${units.length}</div>${units.length ? units.map(unitRow).join("") : '<div class="empty compact">Nobody on duty.</div>'}</div>
      <div class="mdt-panel"><div class="eyebrow">Map</div>${cadMap(d, true)}</div>
    </section>
  </div>`;
}

function mdtSearchView(m) {
  const rows = m.results || [];
  return `${head("Citizen lookup", "Search by name, or type a server ID to look up someone in the city.")}
    <form id="mdt-search-form" class="mdt-bar"><input name="query" class="mdt-input" placeholder="Name or server ID…" value="${esc(m.query)}" autocomplete="off" autofocus><button class="primary-action" type="submit">${icon("search")}Search</button></form>
    ${m.results === null ? `<div class="cad-hint">${icon("info")}<span>Tip: flags such as <b>Armed &amp; dangerous</b> show on results so you know before you approach.</span></div>` : rows.length ? `<div class="mdt-results">${rows.map((r) => `<button class="mdt-person" data-mdt-profile="${Number(r.id)}"><span class="monogram">${initials2(r.name)}</span><div><b>${esc(r.name)}</b><small>${esc(r.citizen)} · DOB ${esc(r.dob)} · ${esc(r.gender)}</small>${(r.flags || []).length ? `<div class="flag-chips">${r.flags.map((f) => `<span class="fchip t-${esc(flagMeta(f).tone)}">${esc(flagMeta(f).label)}</span>`).join("")}</div>` : ""}</div>${r.warrants ? `<span class="chip warn-chip">${r.warrants} warrant${r.warrants > 1 ? "s" : ""}</span>` : ""}${r.online ? `<span class="chip">ID <b>${Number(r.online)}</b></span>` : ""}</button>`).join("")}</div>` : '<div class="empty">No citizens match that search.</div>'}`;
}

function mdtPlatesView(m) {
  const r = m.plate;
  return `${head("Vehicle lookup", "Run any plate. In a vehicle, /runplate checks the car in front of you.")}
    <form id="mdt-plate-form" class="mdt-bar"><input name="plate" class="mdt-input plate-input" maxlength="8" placeholder="PLATE" value="${esc(r?.plate || "")}" autocomplete="off"><button class="primary-action" type="submit">${icon("car")}Run plate</button></form>
    ${r ? `<section class="mdt-panel plate-report"><div class="plate-hero"><div class="plate-big">${esc(r.plate)}</div><div>${r.registered ? `<b>${esc(r.model)}</b><small>Registered owner: ${r.ownerId ? `<a data-mdt-profile="${Number(r.ownerId)}">${esc(r.owner)}</a>` : esc(r.owner)}</small>${r.license && r.license !== "none" ? `<small>Owner driver license: <b class="tone-${r.license === "valid" ? "ok" : "bad"}">${esc(r.license)}</b></small>` : ""}` : "<b>No registration on file</b>"}</div></div>
      ${plateFlags(r).map(([t, f]) => `<div class="flag ${t}">${esc(f)}</div>`).join("") || '<div class="flag ok">No flags on this plate</div>'}
      ${r.registered ? `<div class="form-foot left">${r.stolen ? `<button class="ctl-btn" data-mdt-vehicle="recovered" data-plate="${esc(r.plate)}">${icon("check")} Mark recovered</button>` : `<button class="ctl-btn" data-mdt-vehicle="stolen" data-plate="${esc(r.plate)}">${icon("alert")} Flag stolen</button>`}${r.impounded ? `<button class="ctl-btn" data-mdt-vehicle="release" data-plate="${esc(r.plate)}">${icon("unlock")} Release impound</button>` : ""}<button class="ctl-btn" data-mdt-plate-bolo="${esc(r.plate)}">${icon("search")} Issue BOLO</button></div>` : ""}
    </section>` : ""}`;
}

function mdtWarrantsView(m) {
  const rows = m.dashboard?.warrants || [];
  return `${head("Active warrants", "Warrants are served automatically when the subject is booked or sentenced to community service.", `<b>${rows.length}</b> active`)}
    ${rows.length ? rows.map((w) => `<div class="mdt-row big"><span class="mdt-kind k-panic">#${Number(w.id)}</span><div><b>${w.character_id ? `<a data-mdt-profile="${Number(w.character_id)}">${esc(w.subject_name)}</a>` : esc(w.subject_name)}</b><small>${esc(w.reason)}</small><small>${esc(w.created_by)} · ${when(w.created_at)}</small></div><button class="ctl-btn small" data-mdt-close-warrant="${Number(w.id)}" data-status="served">Served</button><button class="ctl-btn small" data-mdt-close-warrant="${Number(w.id)}" data-status="cleared">Clear</button></div>`).join("") : '<div class="empty">No active warrants.</div>'}`;
}

function mdtBolosView(m) {
  const rows = m.dashboard?.bolos || [];
  return `${head("Be on the lookout", "New BOLOs are pushed to every officer on duty.", `<b>${rows.length}</b> active`)}
    <form id="mdt-bolo-form" class="mdt-form">
      <div class="mdt-form-row"><label>Type<select name="kind" class="mdt-input"><option value="vehicle">Vehicle</option><option value="person">Person</option></select></label><label>Plate (vehicles)<input name="plate" class="mdt-input plate-input" maxlength="8" placeholder="Optional" value="${esc(m.boloPlate || "")}"></label></div>
      <label>Description<textarea name="description" class="mdt-input" maxlength="500" rows="2" placeholder="Black Buffalo, tinted windows, last seen northbound on Route 68…" required></textarea></label>
      <div class="form-foot"><button class="primary-action" type="submit">${icon("alert")}Issue BOLO</button></div>
    </form>
    ${rows.map((b) => `<div class="mdt-row big"><span class="mdt-kind k-bolo">${esc(b.kind)}</span><div><b>BOLO #${Number(b.id)}${b.plate ? ` · <span class="plate-tag">${esc(b.plate)}</span>` : ""}</b><small>${esc(b.description)}</small><small>${esc(b.created_by)} · ${when(b.created_at)}</small></div><button class="ctl-btn small" data-mdt-close-bolo="${Number(b.id)}">Cancel</button></div>`).join("")}`;
}

function mdtPenalView() {
  const penal = currentPayload.penal || [];
  const q = String(ui.mdt.penalQuery || "").toLowerCase();
  const groups = ["infraction", "misdemeanor", "felony"];
  return `${head("Penal code", `Fines are roleplay amounts. One month of sentence is ${Number(currentPayload.secondsPerMonth) || 30} seconds of time served. Community service is capped at ${Number(currentPayload.serviceMax) || 15} minutes.`)}
    <input id="mdt-penal-search" class="mdt-input" placeholder="Filter charges…" value="${esc(ui.mdt.penalQuery || "")}" autocomplete="off">
    <div id="mdt-penal-list">${groups.map((g) => `<section class="mdt-panel"><div class="eyebrow">${g}s</div><div class="penal-grid">${penal.filter((c) => c.kind === g && (!q || c.title.toLowerCase().includes(q))).map((c) => `<div class="penal-row"><span>${esc(c.title)}</span><b class="tone-${KIND_TONE[g]}">${c.months ? `${c.months} mo` : ""}${c.months && c.fine ? " · " : ""}${c.fine ? `$${c.fine}` : ""}</b></div>`).join("")}</div></section>`).join("")}</div>`;
}

function mdtChargeForm(p, mode) {
  const kinds = mode === "cite" ? ["infraction", "misdemeanor"] : mode === "service" ? ["infraction", "misdemeanor", "felony"] : ["misdemeanor", "felony"];
  const penal = (currentPayload.penal || []).filter((c) => kinds.includes(c.kind));
  const warn = mode !== "cite" && (!p.online ? "This citizen is not in the city. They must be present." : !p.restrained ? "The suspect is not restrained. Cuff them first." : "");
  const title = mode === "cite" ? "Issue citation" : mode === "service" ? "Community service at Legion Square" : "Book into Bolingbroke";
  return `<form id="mdt-charge-form" class="mdt-form mode-${mode}" data-mode="${mode}">
    <div class="eyebrow">${title}</div>
    ${mode === "service" ? `<div class="cad-hint">${icon("trash")}<span>Instead of prison, the offender cleans up Legion Square for up to ${Number(currentPayload.serviceMax) || 15} minutes. The clock only runs while they work, and walking off sends them straight to prison.</span></div>` : ""}
    ${warn ? `<div class="flag warn">${esc(warn)}</div>` : ""}
    <div class="charge-grid">${penal.map((c) => `<label class="charge${ui.mdt.charges.has(c.id) ? " on" : ""}"><input type="checkbox" data-charge="${esc(c.id)}" ${ui.mdt.charges.has(c.id) ? "checked" : ""}><span>${esc(c.title)}</span><b class="tone-${KIND_TONE[c.kind]}">${mode === "cite" ? `$${c.fine}` : `${c.months} mo`}</b></label>`).join("")}</div>
    <div class="charge-total" id="charge-total">${mdtTotals(mode)}</div>
    <label>Notes<textarea name="notes" id="mdt-notes" class="mdt-input" maxlength="300" rows="2" placeholder="Narrative, evidence, plea…">${esc(ui.mdt.notes)}</textarea></label>
    <div class="form-foot"><button type="button" class="ghost-action" data-mdt-form="">Cancel</button><button class="primary-action" type="submit">${icon(mode === "cite" ? "check" : mode === "service" ? "trash" : "gavel")}${mode === "cite" ? "Issue citation" : mode === "service" ? "Assign service" : "Sentence"}</button></div>
  </form>`;
}

function mdtTotals(mode) {
  const penal = currentPayload.penal || [];
  const picked = penal.filter((c) => ui.mdt.charges.has(c.id));
  if (mode === "cite") return `<span>Total fine</span><b>$${picked.reduce((n, c) => n + c.fine, 0)}</b>`;
  if (mode === "service") {
    const max = Number(currentPayload.serviceMax) || 15;
    const suggested = clamp(Math.ceil(picked.reduce((n, c) => n + c.months, 0) / 2), picked.length ? 1 : 0, max);
    const minutes = ui.mdt.minutes ?? suggested;
    return `<span>Service</span><label class="months-input"><input type="number" id="mdt-minutes" min="1" max="${max}" value="${minutes || ""}" placeholder="${suggested}"> minutes</label><small>max ${max} · suggested ${suggested}</small>`;
  }
  const max = Number(currentPayload.maxMonths) || 90;
  const sum = Math.min(max, picked.reduce((n, c) => n + c.months, 0));
  const months = ui.mdt.months ?? sum;
  return `<span>Sentence</span><label class="months-input"><input type="number" id="mdt-months" min="1" max="${max}" value="${months || ""}" placeholder="${sum}"> months</label><small>≈ ${fmtClock((months || 0) * (Number(currentPayload.secondsPerMonth) || 30))} served before good behaviour · recommended ${sum}</small>`;
}

const LICENSE_TONE = { valid: "ok", suspended: "warn", revoked: "bad", none: "dim" };

function mdtProfileView(m) {
  const p = m.profile;
  if (!p) return '<div class="empty">Pick a citizen first.</div>';
  const active = (p.warrants || []).filter((w) => w.status === "active");
  const s = p.sentence;
  const flags = new Set((p.flags || []).map((f) => f.flag));
  const chips = [
    p.online ? `<span class="chip">In city · ID <b>${Number(p.online)}</b></span>` : '<span class="chip">Not in city</span>',
    active.length ? `<span class="chip bad-chip">Wanted · ${active.length}</span>` : "",
    s ? `<span class="chip ${s.status === "escaped" ? "bad-chip" : "warn-chip"}">${s.status === "escaped" ? "Escaped inmate" : `In prison · ${fmtClock(s.seconds_remaining)} · ${esc(s.tier || "")}`}</span>` : "",
    p.service ? `<span class="chip warn-chip">Community service · ${fmtClock(p.service.seconds_remaining)}</span>` : "",
    p.restrained ? '<span class="chip warn-chip">Restrained</span>' : "",
  ].join("");
  const form = ["cite", "sentence", "service"].includes(m.form) ? mdtChargeForm(p, m.form) : m.form === "warrant"
    ? `<form id="mdt-warrant-form" class="mdt-form"><div class="eyebrow">Issue warrant</div><label>Probable cause<textarea name="reason" class="mdt-input" maxlength="500" rows="3" required placeholder="What they are wanted for, and why."></textarea></label><div class="form-foot"><button type="button" class="ghost-action" data-mdt-form="">Cancel</button><button class="primary-action" type="submit">${icon("gavel")}Issue warrant</button></div></form>` : "";
  return `<div class="mdt-profile-head">
      <span class="monogram big">${initials2(p.name)}</span>
      <div><h2>${esc(p.name)}</h2><p>${esc(p.citizen)} · DOB ${esc(p.dob)} · ${esc(p.gender)}</p><div class="chip-row">${chips}</div>
        ${flags.size ? `<div class="flag-chips big">${[...flags].map((f) => `<span class="fchip t-${esc(flagMeta(f).tone)}">${icon("alert")}${esc(flagMeta(f).label)}</span>`).join("")}</div>` : ""}</div>
      <div class="mdt-actions">
        <button class="ctl-btn${m.form === "cite" ? " on" : ""}" data-mdt-form="cite">${icon("check")} Cite</button>
        ${currentPayload.canJail ? `<button class="ctl-btn${m.form === "sentence" ? " on" : ""}" data-mdt-form="sentence">${icon("gavel")} Prison</button><button class="ctl-btn${m.form === "service" ? " on" : ""}" data-mdt-form="service">${icon("trash")} Service</button>` : ""}
        <button class="ctl-btn${m.form === "warrant" ? " on" : ""}" data-mdt-form="warrant">${icon("alert")} Warrant</button>
        <button class="ctl-btn" data-mdt-new-report="${Number(p.id)}">${icon("file")} Report</button>
      </div>
    </div>
    ${form}
    <div class="profile-grid">
      <section class="mdt-panel"><div class="eyebrow">Officer safety flags</div><div class="flag-toggles">${(currentPayload.flags || []).map((f) => `<button class="ftoggle t-${esc(f.tone)}${flags.has(f.id) ? " on" : ""}" data-mdt-flag="${esc(f.id)}" data-on="${flags.has(f.id) ? 0 : 1}">${esc(f.label)}</button>`).join("")}</div></section>
      <section class="mdt-panel"><div class="eyebrow">Licenses</div><div class="license-grid">${(p.licenses || []).map((l) => `<div class="license t-${LICENSE_TONE[l.status] || "dim"}"><div><b>${esc(l.label)}</b><small>${l.status === "none" ? "Not on file" : `${esc(l.status)}${l.updatedBy ? ` · ${esc(l.updatedBy)}` : ""}`}</small></div><select data-mdt-license="${esc(l.id)}" class="mdt-input small">${["none", "valid", "suspended", "revoked"].map((v) => `<option value="${v}"${l.status === v ? " selected" : ""}>${v === "none" ? "Not on file" : v[0].toUpperCase() + v.slice(1)}</option>`).join("")}</select></div>`).join("")}</div></section>
    </div>
    <section class="mdt-panel"><div class="eyebrow">Notes</div>
      <form id="mdt-note-form" class="mdt-bar"><input name="body" class="mdt-input" maxlength="600" placeholder="Add an intelligence note visible to every officer…" autocomplete="off"><button class="primary-action" type="submit">${icon("plus")}Add</button></form>
      ${(p.notes || []).map((n) => `<div class="mdt-row"><span class="mdt-kind k-unit">note</span><div><b>${esc(n.body)}</b></div><em>${esc(n.author_name)} · ${when(n.created_at)}</em></div>`).join("") || '<div class="empty compact">No notes.</div>'}</section>
    <section class="mdt-panel"><div class="eyebrow">Warrants</div>${(p.warrants || []).length ? p.warrants.map((w) => `<div class="mdt-row"><span class="mdt-kind ${w.status === "active" ? "k-panic" : "k-unit"}">${esc(w.status)}</span><div><b>${esc(w.reason)}</b><small>#${Number(w.id)} · ${esc(w.created_by)} · ${when(w.created_at)}${w.closed_by ? ` · closed by ${esc(w.closed_by)}` : ""}</small></div>${w.status === "active" ? `<button class="ctl-btn small" data-mdt-close-warrant="${Number(w.id)}" data-status="cleared" data-refresh="profile">Clear</button>` : ""}</div>`).join("") : '<div class="empty compact">No warrants.</div>'}</section>
    <section class="mdt-panel"><div class="eyebrow">Criminal history</div>${(p.records || []).length ? p.records.map((r) => mdtRecordRow(r, false)).join("") : '<div class="empty compact">Clean record.</div>'}</section>
    <div class="mdt-columns">
      <section class="mdt-panel"><div class="eyebrow">Reports</div>${(p.reports || []).length ? p.reports.map((r) => `<div class="mdt-row"><span class="mdt-kind k-unit">${esc(r.role)}</span><div><b><a data-mdt-report="${Number(r.id)}">#${Number(r.id)} · ${esc(r.title)}</a></b><small>${esc(r.kind)} · ${esc(r.author_name)}</small></div><em>${when(r.created_at)}</em></div>`).join("") : '<div class="empty compact">Not named in any report.</div>'}</section>
      <section class="mdt-panel"><div class="eyebrow">Registered vehicles</div>${(p.vehicles || []).length ? p.vehicles.map((v) => `<div class="mdt-row"><span class="plate-tag">${esc(v.plate)}</span><div><b>${esc(v.label || v.model)}</b><small>${v.stolen ? "Reported stolen · " : ""}${v.impounded_at ? "Impounded · " : ""}registered ${when(v.registered_at)}</small></div></div>`).join("") : '<div class="empty compact">No registered vehicles.</div>'}</section>
    </div>`;
}

function mdtReportsView(m) {
  if (m.reportDraft) return mdtReportForm(m);
  const rows = m.reports || [];
  return `<div class="view-head"><div><h2>Incident reports</h2><p>Every report is searchable by title, narrative, number or anyone named in it.</p></div><button class="primary-action" data-mdt-new-report="">${icon("plus")}New report</button></div>
    <form id="mdt-report-search" class="mdt-bar"><input name="query" class="mdt-input" placeholder="Search reports…" value="${esc(m.reportQuery)}" autocomplete="off"><button class="primary-action" type="submit">${icon("search")}Search</button></form>
    ${m.reports === null ? '<div class="empty compact">Loading reports…</div>' : rows.length ? rows.map((r) => `<button class="report-row" data-mdt-report="${Number(r.id)}"><span class="report-no">#${Number(r.id)}</span><div><b>${esc(r.title)}</b><small>${esc(r.kind)} · ${esc(r.author_name)}${r.location ? ` · ${esc(r.location)}` : ""}</small></div><em>${when(r.created_at)}</em></button>`).join("") : '<div class="empty">No reports found.</div>'}`;
}

function mdtReportForm(m) {
  const draft = m.reportDraft;
  const kinds = currentPayload.reportKinds || ["Incident"];
  return `<form id="mdt-report-form" class="mdt-form report-form">
    <div class="eyebrow">New incident report</div>
    <div class="mdt-form-row"><label>Type<select name="kind" class="mdt-input">${kinds.map((k) => `<option${draft.kind === k ? " selected" : ""}>${esc(k)}</option>`).join("")}</select></label><label>Location<input name="location" class="mdt-input" maxlength="120" value="${esc(draft.location ?? currentPayload.street ?? "")}" placeholder="Street / area"></label></div>
    <label>Title<input name="title" class="mdt-input" maxlength="120" required value="${esc(draft.title || "")}" placeholder="Armed robbery at Fleeca, Route 68"></label>
    <label>Narrative<textarea name="narrative" class="mdt-input" rows="7" maxlength="6000" required placeholder="What happened, in order. Who did what, evidence collected, statements, outcome.">${esc(draft.narrative || "")}</textarea></label>
    <div class="eyebrow">People involved</div>
    <div class="picked">${(draft.citizens || []).map((c, i) => `<span class="picked-chip">${esc(c.name)}<select data-mdt-pick-role="${i}" class="mdt-input small">${["suspect", "victim", "witness", "involved"].map((r) => `<option${c.role === r ? " selected" : ""}>${r}</option>`).join("")}</select><button type="button" data-mdt-unpick="${i}">${icon("x")}</button></span>`).join("") || '<small class="tone-dim">Nobody added yet.</small>'}</div>
    <div class="mdt-bar"><input id="mdt-pick-query" class="mdt-input" placeholder="Search a citizen to add…" autocomplete="off"><button type="button" class="ctl-btn" data-mdt-pick-search>${icon("search")}Find</button></div>
    ${(m.picks || []).length ? `<div class="pick-results">${m.picks.map((r) => `<button type="button" data-mdt-pick="${Number(r.id)}" data-name="${esc(r.name)}">${icon("plus")}${esc(r.name)} <small>${esc(r.citizen)}</small></button>`).join("")}</div>` : ""}
    <label>Other officers (comma separated)<input name="officers" class="mdt-input" maxlength="300" value="${esc(draft.officers || "")}" placeholder="Callsigns or names"></label>
    <div class="form-foot"><button type="button" class="ghost-action" data-mdt-cancel-report>Cancel</button><button class="primary-action" type="submit">${icon("file")}File report</button></div>
  </form>`;
}

function mdtReportView(m) {
  const r = m.report;
  if (!r) return '<div class="empty">Report not found.</div>';
  return `<article class="report-doc">
    <header><div><small>${esc(r.kind)} report</small><h2>#${Number(r.id)} · ${esc(r.title)}</h2><p>${esc(r.author_name)} · ${when(r.created_at)}${r.location ? ` · ${esc(r.location)}` : ""}</p></div><button class="ctl-btn" data-mdt-tab="reports">${icon("file")} All reports</button></header>
    <div class="report-people">${(r.citizens || []).map((c) => `<a class="person-tag r-${esc(c.role)}" data-mdt-profile="${Number(c.id)}"><b>${esc(c.name)}</b><small>${esc(c.role)}</small></a>`).join("") || '<small class="tone-dim">No citizens named.</small>'}</div>
    <div class="report-officers">${icon("shield")}${(r.officers || []).map((o) => esc(o)).join(" · ")}</div>
    <div class="report-body">${esc(r.narrative)}</div>
  </article>`;
}

function mdtCorrections(m) {
  const d = m.dashboard || {};
  const inmates = d.inmates || [];
  const services = d.services || [];
  const tierTone = { Exemplary: "ok", Good: "ok", Fair: "warn", Poor: "bad" };
  return `${head("Corrections", "Bolingbroke inmates, fugitives and community service at Legion Square.", `<b>${inmates.length + services.length}</b> in custody`)}
    <section class="mdt-panel"><div class="eyebrow">Bolingbroke Penitentiary</div>${inmates.length ? inmates.map((i) => `<div class="mdt-row big"><span class="mdt-kind ${i.status === "escaped" ? "k-panic" : "k-unit"}">${i.status === "escaped" ? "ESCAPED" : "INMATE"}</span><div><b>${i.character_id ? `<a data-mdt-profile="${Number(i.character_id)}">${esc(i.name)}</a>` : esc(i.name)}</b><small>${Number(i.months)} months · ${fmtClock(i.seconds_remaining)} left · by ${esc(i.officer_name)}${i.online ? " · in the yard" : ""}</small>
        ${i.status === "serving" ? `<div class="behaviour-mini"><span>Behaviour</span><i><b style="width:${clamp(Number(i.behaviour) || 0, 0, 100)}%"></b></i><em class="tone-${tierTone[i.tier] || "dim"}">${esc(i.tier)} · ${Number(i.behaviour) || 0}</em><span>${Number(i.jobs_done) || 0} jobs</span></div>` : ""}</div>
        ${currentPayload.canJail ? `<button class="ctl-btn small" data-mdt-release="${Number(i.id)}">Release</button>` : ""}</div>`).join("") : '<div class="empty compact">Bolingbroke is empty.</div>'}</section>
    <section class="mdt-panel"><div class="eyebrow">Community service · Legion Square</div>${services.length ? services.map((c) => `<div class="mdt-row big"><span class="mdt-kind k-ems">${esc(c.state || "service")}</span><div><b>${c.character_id ? `<a data-mdt-profile="${Number(c.character_id)}">${esc(c.name)}</a>` : esc(c.name)}</b><small>${Number(c.minutes)} min · ${fmtClock(c.seconds_remaining)} left · ${Number(c.collected) || 0} rubbish collected · by ${esc(c.officer_name)}${c.online ? "" : " · not in city"}</small></div>${currentPayload.canJail ? `<button class="ctl-btn small" data-mdt-service-end="${Number(c.id)}">End</button>` : ""}</div>`).join("") : '<div class="empty compact">Nobody is doing community service.</div>'}</section>`;
}

function cadHeader(m) {
  const me = m.dashboard.me || {};
  const unit = me.unit || {};
  const statuses = currentPayload.statuses || [];
  return `<header class="cad-top">
    <div class="cad-brand"><span class="cad-crest">${icon("shield")}</span><div><small>${esc(currentPayload.department || "Florida Bay Police")}</small><b>Computer aided dispatch</b></div></div>
    <div class="cad-unit">${m.callsignEdit ? `<form id="mdt-callsign-form"><input name="callsign" class="mdt-input small" maxlength="12" value="${esc(unit.callsign || "")}" placeholder="1-ADAM-12" autofocus></form>` : `<button class="cad-sign" data-mdt-callsign>${esc(unit.callsign || "SET CALLSIGN")}</button>`}<span>${esc(currentPayload.officer || "Officer")}</span></div>
    <div class="cad-status">${statuses.map((s) => `<button class="tone-${esc(s.tone)}${unit.status === s.id ? " on" : ""}" data-mdt-status="${esc(s.id)}" title="${esc(s.label)}">${esc(s.short)}</button>`).join("")}</div>
    <div class="cad-quick"><button data-mdt-quick="traffic" title="Log a traffic stop at your position">${icon("car")}Stop</button><button data-mdt-quick="backup" title="Request backup">${icon("radio")}Backup</button><button class="panic" data-mdt-quick="panic" title="Panic button">${icon("siren")}Panic</button></div>
    <time id="cad-clock">${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
    <button class="icon-button" data-mdt-close aria-label="Close">${icon("x")}</button>
  </header>`;
}

function cadTicker(m) {
  const d = m.dashboard || {};
  const items = [
    ...(d.bolos || []).slice(0, 6).map((b) => `<span class="tk-bolo">BOLO #${Number(b.id)}${b.plate ? ` · ${esc(b.plate)}` : ""} · ${esc(b.description)}</span>`),
    ...(d.warrants || []).slice(0, 6).map((w) => `<span class="tk-warrant">WARRANT #${Number(w.id)} · ${esc(w.subject_name)} · ${esc(w.reason)}</span>`),
  ];
  if (!items.length) items.push('<span>All quiet · no active BOLOs or warrants</span>');
  return `<footer class="cad-ticker"><b>${icon("siren")} LIVE</b><div class="ticker-track"><div>${items.join("")}${items.join("")}</div></div></footer>`;
}

function renderMdt() {
  const m = ui.mdt;
  const tabs = [...MDT_TABS];
  if (m.profile) tabs.push(["profile", m.profile.name, "user"]);
  if (m.report) tabs.push(["report", `Report #${m.report.id}`, "file"]);
  const d = m.dashboard || {};
  const counts = { dispatch: (d.calls || []).length, warrants: (d.warrants || []).length, bolos: (d.bolos || []).length, corrections: (d.inmates || []).filter((i) => i.status === "serving").length + (d.services || []).length };
  const rail = tabs.map(([id, label, ic]) => `<button class="${m.tab === id ? "active" : ""}" data-mdt-tab="${id}"><span data-icon="${ic}"></span><span class="lbl">${esc(label)}</span>${counts[id] ? `<small>${counts[id]}</small>` : ""}</button>`).join("");
  const views = { dashboard: mdtDashboard, dispatch: mdtDispatch, search: mdtSearchView, plates: mdtPlatesView, warrants: mdtWarrantsView, bolos: mdtBolosView, penal: mdtPenalView, profile: mdtProfileView, reports: mdtReportsView, report: mdtReportView, corrections: mdtCorrections };
  return `<div class="cad">${cadHeader(m)}<div class="cad-body"><nav class="cad-rail">${rail}</nav><div class="cad-main">${(views[m.tab] || mdtDashboard)(m)}</div></div>${cadTicker(m)}</div>`;
}

function mdtData(kind, data) {
  const m = ui.mdt;
  if (!m) return;
  if (kind === "dashboard") m.dashboard = data || {};
  if (kind === "results") { m.results = data?.rows || []; m.query = data?.query || m.query; }
  if (kind === "plate") { m.plate = data; if (m.tab !== "plates") m.tab = "plates"; }
  if (kind === "reports") { m.reports = data?.rows || []; m.reportQuery = data?.query || ""; }
  if (kind === "report") { m.report = data; m.reportDraft = null; m.picks = []; m.tab = "report"; }
  if (kind === "citizenPick") m.picks = data?.rows || [];
  if (kind === "profile") {
    m.profile = data;
    m.tab = "profile";
    m.form = null; m.charges = new Set(); m.months = null; m.minutes = null; m.notes = "";
  }
  if (kind === "dashboard") {
    // Background refreshes never clobber what an officer is typing.
    const typing = document.activeElement && document.activeElement.closest?.(".cad") && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (typing) return;
    if (!["dashboard", "dispatch", "corrections", "warrants", "bolos"].includes(m.tab)) {
      const header = $(".cad-top");
      if (header) { header.outerHTML = cadHeader(m); hydrate($(".cad")); }
      const ticker = $(".cad-ticker");
      if (ticker) { ticker.outerHTML = cadTicker(m); hydrate($(".cad")); }
      return;
    }
  }
  renderMenu();
}

function mdtClick(event) {
  const t = event.target;
  const hit = (selector) => t.closest(selector);
  let el;
  if ((el = hit("[data-mdt-close]"))) { post("close"); return true; }
  if ((el = hit("[data-mdt-tab]"))) {
    ui.mdt.tab = el.dataset.mdtTab;
    if (["dashboard", "dispatch", "warrants", "bolos", "corrections"].includes(ui.mdt.tab)) mdtSend("dashboard");
    if (ui.mdt.tab === "reports") { ui.mdt.reportDraft = null; mdtSend("reports", { query: ui.mdt.reportQuery }); }
    renderMenu();
    return true;
  }
  if ((el = hit("[data-mdt-profile]"))) { mdtSend("profile", { id: Number(el.dataset.mdtProfile) }); return true; }
  if ((el = hit("[data-mdt-report]"))) { mdtSend("reportView", { id: Number(el.dataset.mdtReport) }); return true; }
  if ((el = hit("[data-mdt-form]"))) {
    const next = el.dataset.mdtForm || null;
    ui.mdt.form = ui.mdt.form === next ? null : next;
    ui.mdt.charges = new Set(); ui.mdt.months = null; ui.mdt.minutes = null; ui.mdt.notes = "";
    renderMenu();
    return true;
  }
  if ((el = hit("[data-mdt-close-warrant]"))) { mdtSend("closeWarrant", { id: Number(el.dataset.mdtCloseWarrant), status: el.dataset.status, refresh: el.dataset.refresh }); return true; }
  if ((el = hit("[data-mdt-close-bolo]"))) { mdtSend("closeBolo", { id: Number(el.dataset.mdtCloseBolo) }); return true; }
  if ((el = hit("[data-mdt-release]"))) { mdtSend("release", { id: Number(el.dataset.mdtRelease) }); return true; }
  if ((el = hit("[data-mdt-service-end]"))) { mdtSend("serviceRelease", { id: Number(el.dataset.mdtServiceEnd) }); return true; }
  if ((el = hit("[data-mdt-status]"))) { mdtSend("unitStatus", { status: el.dataset.mdtStatus }); return true; }
  if ((el = hit("[data-mdt-callsign]"))) { ui.mdt.callsignEdit = true; renderMenu(); $("#mdt-callsign-form input")?.focus(); return true; }
  if ((el = hit("[data-mdt-quick]"))) {
    const kind = el.dataset.mdtQuick;
    if (kind === "panic" && !el.classList.contains("armed")) { el.classList.add("armed"); el.textContent = "Confirm?"; setTimeout(() => el.isConnected && renderMenu(), 2500); return true; }
    mdtSend("selfDispatch", { kind });
    return true;
  }
  if ((el = hit("[data-mdt-call]"))) { mdtSend(el.dataset.mdtCall, { id: Number(el.dataset.id) }); return true; }
  if ((el = hit("[data-mdt-call-gps]"))) { mdtSend("callWaypoint", { id: Number(el.dataset.mdtCallGps) }); return true; }
  if ((el = hit("[data-mdt-call-notes]"))) { ui.mdt.openCall = Number(ui.mdt.openCall) === Number(el.dataset.mdtCallNotes) ? null : Number(el.dataset.mdtCallNotes); renderMenu(); return true; }
  if ((el = hit("[data-mdt-flag]"))) { mdtSend("flag", { id: ui.mdt.profile?.id, flag: el.dataset.mdtFlag, on: el.dataset.on === "1" }); return true; }
  if ((el = hit("[data-mdt-vehicle]"))) {
    const action = el.dataset.mdtVehicle;
    if (action === "release") mdtSend("clearImpound", { plate: el.dataset.plate });
    else mdtSend("vehicleFlag", { plate: el.dataset.plate, stolen: action === "stolen" });
    return true;
  }
  if ((el = hit("[data-mdt-plate-bolo]"))) { ui.mdt.boloPlate = el.dataset.mdtPlateBolo; ui.mdt.tab = "bolos"; renderMenu(); return true; }
  if ((el = hit("[data-mdt-new-report]"))) {
    const id = Number(el.dataset.mdtNewReport);
    const p = ui.mdt.profile;
    ui.mdt.reportDraft = { kind: "Incident", citizens: id && p && Number(p.id) === id ? [{ id, name: p.name, role: "suspect" }] : [] };
    ui.mdt.picks = [];
    ui.mdt.tab = "reports";
    renderMenu();
    return true;
  }
  if ((el = hit("[data-mdt-cancel-report]"))) { ui.mdt.reportDraft = null; mdtSend("reports", { query: ui.mdt.reportQuery }); renderMenu(); return true; }
  if ((el = hit("[data-mdt-pick-search]"))) { captureDraft(); mdtSend("citizenPick", { query: $("#mdt-pick-query")?.value || "" }); return true; }
  if ((el = hit("[data-mdt-pick]"))) {
    captureDraft();
    const id = Number(el.dataset.mdtPick);
    const draft = ui.mdt.reportDraft;
    if (!draft.citizens.some((c) => Number(c.id) === id)) draft.citizens.push({ id, name: el.dataset.name, role: "involved" });
    renderMenu();
    return true;
  }
  if ((el = hit("[data-mdt-unpick]"))) { captureDraft(); ui.mdt.reportDraft.citizens.splice(Number(el.dataset.mdtUnpick), 1); renderMenu(); return true; }
  return false;
}

function captureDraft() {
  const form = $("#mdt-report-form");
  if (!form || !ui.mdt.reportDraft) return;
  const values = Object.fromEntries(new FormData(form).entries());
  Object.assign(ui.mdt.reportDraft, { kind: values.kind, location: values.location, title: values.title, narrative: values.narrative, officers: values.officers });
}

function mdtSubmit(event) {
  const form = event.target;
  const values = Object.fromEntries(new FormData(form).entries());
  if (form.id === "mdt-search-form") { ui.mdt.query = values.query || ""; mdtSend("search", { query: values.query }); return true; }
  if (form.id === "mdt-plate-form") { mdtSend("plate", { plate: values.plate }); return true; }
  if (form.id === "mdt-bolo-form") { mdtSend("bolo", values); ui.mdt.boloPlate = ""; form.reset(); return true; }
  if (form.id === "mdt-warrant-form") { mdtSend("warrant", { id: ui.mdt.profile?.id, reason: values.reason }); return true; }
  if (form.id === "mdt-note-form") { if (values.body) mdtSend("note", { id: ui.mdt.profile?.id, body: values.body }); return true; }
  if (form.id === "mdt-callsign-form") { ui.mdt.callsignEdit = false; mdtSend("callsign", { callsign: values.callsign }); renderMenu(); return true; }
  if (form.id === "mdt-report-search") { mdtSend("reports", { query: values.query }); return true; }
  if (form.classList.contains("call-note-form")) { if (values.text) mdtSend("callNote", { id: Number(form.dataset.call), text: values.text }); form.reset(); return true; }
  if (form.id === "mdt-report-form") {
    captureDraft();
    const d = ui.mdt.reportDraft;
    mdtSend("report", { kind: d.kind, title: d.title, location: d.location, narrative: d.narrative, citizens: d.citizens.map((c) => ({ id: c.id, role: c.role })), officers: String(d.officers || "").split(",").map((s) => s.trim()).filter(Boolean) });
    return true;
  }
  if (form.id === "mdt-charge-form") {
    const mode = form.dataset.mode;
    const body = { id: ui.mdt.profile?.id, charges: [...ui.mdt.charges], notes: ui.mdt.notes };
    if (mode === "sentence" && ui.mdt.months) body.months = ui.mdt.months;
    if (mode === "service") {
      const picked = (currentPayload.penal || []).filter((c) => ui.mdt.charges.has(c.id));
      body.minutes = ui.mdt.minutes || clamp(Math.ceil(picked.reduce((n, c) => n + c.months, 0) / 2), 1, Number(currentPayload.serviceMax) || 15);
    }
    mdtSend(mode === "cite" ? "cite" : mode === "service" ? "service" : "sentence", body);
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
    ui.mdt.minutes = null;
    const total = $("#charge-total");
    if (total) total.innerHTML = mdtTotals($("#mdt-charge-form").dataset.mode);
    return true;
  }
  if (t.id === "mdt-months") { ui.mdt.months = clamp(Number(t.value) || 0, 0, Number(currentPayload.maxMonths) || 90) || null; return true; }
  if (t.id === "mdt-minutes") { ui.mdt.minutes = clamp(Number(t.value) || 0, 0, Number(currentPayload.serviceMax) || 15) || null; return true; }
  if (t.id === "mdt-notes") { ui.mdt.notes = t.value; return true; }
  if (t.id === "mdt-penal-search") {
    ui.mdt.penalQuery = t.value;
    const holder = document.createElement("div");
    holder.innerHTML = mdtPenalView();
    $("#mdt-penal-list").innerHTML = holder.querySelector("#mdt-penal-list").innerHTML;
    return true;
  }
  if (t.dataset.mdtLicense) { mdtSend("license", { id: ui.mdt.profile?.id, license: t.dataset.mdtLicense, status: t.value }); return true; }
  if (t.dataset.mdtPickRole !== undefined) { captureDraft(); ui.mdt.reportDraft.citizens[Number(t.dataset.mdtPickRole)].role = t.value; return true; }
  return false;
}

/* ───────── Prison job board ───────── */
function renderPrisonJobs(data) {
  const info = data.info || {};
  const current = data.current;
  const behaviour = clamp(Number(info.behaviour) || 0, 0, 100);
  const cards = (data.jobs || []).map((j) => {
    const active = current && current.id === j.id;
    return `<article class="pjob${active ? " active" : ""}">
      <span class="pjob-ic" data-icon="${esc(j.icon || "grid")}"></span>
      <div class="pjob-main"><b>${esc(j.label)}</b><p>${esc(j.description)}</p>
        <div class="pjob-facts"><span>${Number(j.steps)} step${Number(j.steps) > 1 ? "s" : ""}</span><span>${Number(j.holdSeconds)}s each</span>${j.reduction ? `<span class="good">−${fmtClock(j.reduction)} per step</span>` : `<span class="good">+${Number(j.behaviour) || 0} behaviour per step</span>`}</div></div>
      ${active ? `<button class="ghost-action" data-prison-cancel>Quit job</button>` : `<button class="primary-action" data-prison-job="${esc(j.id)}" ${current || data.cooldown ? "disabled" : ""}>${data.cooldown && !current ? `Rest ${data.cooldown}s` : "Start"}</button>`}
    </article>`;
  }).join("");
  return `${head("Prison work detail", "Every finished step shortens your sentence. Better behaviour means bigger reductions.", `<b>${Number(info.jobsDone) || 0}</b> jobs done`)}
    <section class="pjob-hero">
      <div class="pjob-meter"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" class="trk"/><circle cx="60" cy="60" r="50" class="val" style="stroke-dasharray:${(behaviour / 100) * 314} 314"/></svg><div><b>${behaviour}</b><small>${esc(info.tier || "Fair")}</small></div></div>
      <div class="pjob-facts-big">
        <div><small>Time remaining</small><b>${fmtClock(info.remaining)}</b></div>
        <div><small>Cut so far</small><b>${fmtClock(info.reduced)} <em>/ ${fmtClock(info.maxReduction)} max</em></b></div>
        <div><small>Job multiplier</small><b>×${Number(info.mult || 1).toFixed(2)}</b></div>
        <div><small>Good-time credit</small><b class="${info.goodTime ? "tone-ok" : "tone-dim"}">${info.goodTime ? "Active" : "Reach 75 behaviour"}</b></div>
      </div>
    </section>
    ${current ? `<div class="pjob-current">${icon("pin")}<div><b>${esc(current.label)} · step ${Number(current.step)}/${Number(current.steps)}</b><small>${esc(current.stepLabel || "")} - follow the yellow marker and press E.</small></div></div>` : ""}
    <div class="pjob-grid">${cards}</div>
    <p class="pjob-foot">Calm minutes raise behaviour. Leaving the yard, or getting caught at the fence, drops it.</p>`;
}

/* ───────── Organization hub ───────── */
const PERK_LABEL = { capacity: "Stash network", yield: "Master chemist", price: "Street connections", heat: "Lookouts", cap: "Extended hours", pay: "Loyal customers", stipend: "Budget increase", bounty: "Asset forfeiture" };
const BUSINESS_ICON = { mechanic: "car", bar: "music", club: "music", restaurant: "flame", warehouse: "grid", lab: "leaf", hideout: "shield" };
function renderOrgHub(data) {
  if (!data.onDuty) return `${head("Organization hub")}<div class="empty">Clock into your organization with <b>/duty</b> to work labs, run deliveries, use your properties or draw from your department armory. Leaders spend the wallet on the website portal.</div>`;
  let tab = ui.orgTab || "overview";
  const carry = data.carry;
  const drug = carry && data.drugs?.[carry.drug];
  const dept = data.isDepartment ? data.department || {} : null;
  const showProps = !dept || (data.properties || []).length;
  const tabs = [["overview", "Overview", "grid"], ["crew", `Crew · ${(data.crew || []).length}`, "users"], ...(data.isGang ? [["labs", "Labs", "leaf"]] : []), ...(showProps ? [["business", "Properties", "building"]] : []), ["armory", "Armory", "target"], ["wardrobe", "Wardrobe", "shirt"]];
  if (!tabs.some(([id]) => id === tab)) tab = "overview";
  const money = (n) => `$${Number(n || 0).toLocaleString("en-US")}`;
  const motd = data.motd ? `<div class="cad-hint">${icon("info")}<span><b>Message of the day:</b> ${esc(data.motd)}</span></div>` : "";
  let body = "";
  if (tab === "overview" && dept) {
    body = `${motd}<section class="org-wallet"><div><small>${esc(data.org?.name)} budget · ${esc(data.rank || "Member")}</small><b>${money(data.wallet)}</b><span>${money(data.today)} earned today</span></div><div class="org-wallet-note">${icon("info")}Departments are funded by time on duty (${money(dept.stipendPerHour)} per member per hour) and by seizures (${Number(dept.bounty) || 0}% of street value). Leaders spend the budget on the member portal.</div></section>
      <div class="mdt-columns">
        <section class="mdt-panel"><div class="eyebrow">Armories</div>${(dept.stations || []).map((st) => `<div class="hub-row"><span class="hub-ic">${icon("target")}</span><div><b>${esc(st.label)}</b><small>${data.station === st.label ? "You are here" : "Department armory"}</small></div><button class="ctl-btn small" data-org-waypoint data-x="${Number(st.x)}" data-y="${Number(st.y)}">${icon("pin")} Route</button></div>`).join("") || '<div class="empty compact">No stations configured.</div>'}</section>
        <section class="mdt-panel"><div class="eyebrow">Perks & assets</div>${(data.perks || []).length ? data.perks.map((p) => `<div class="mdt-row"><span class="mdt-kind k-bolo">perk</span><div><b>${esc(PERK_LABEL[p.perk] || p.perk)}</b><small>+${Number(p.value)}${p.perk === "capacity" ? " units" : "%"}</small></div></div>`).join("") : '<div class="empty compact">No perks yet.</div>'}
          ${(data.vehicles || []).length ? `<div class="mdt-row"><span class="mdt-kind k-unit">garage</span><div><b>${data.vehicles.length} vehicle${data.vehicles.length > 1 ? "s" : ""} in your F7 garage</b><small>${data.vehicles.map((v) => esc(v.label)).join(", ")}${data.can?.garage === false ? " · your rank cannot use the garage" : ""}</small></div></div>` : ""}</section>
      </div>`;
  } else if (tab === "overview") {
    body = `${motd}<section class="org-wallet"><div><small>${esc(data.org?.name)} wallet · ${esc(data.rank || "Member")}</small><b>${money(data.wallet)}</b><span>${money(data.today)} earned today</span></div><div class="org-wallet-note">${icon("info")}Organization money lives on the website and Discord only. Leaders spend it on the member portal; check it any time with /orgbank.</div></section>
      <div class="mdt-columns">
        <section class="mdt-panel"><div class="eyebrow">Product</div>${carry && carry.units > 0 ? `<div class="carry-big" style="--c:${safeColor(drug?.color)}"><b>${Number(carry.units)}</b><div><strong>${esc(drug?.label || carry.drug)}</strong><small>of ${Number(data.capacity)} capacity · worth ≈ ${money(Number(carry.units) * Number(drug?.price || 0))}</small></div></div>
          ${data.run ? `<div class="flag warn">Drop-off at ${esc(data.run.label)} · ${fmtClock(data.run.secondsLeft)} left</div><div class="form-foot left"><button class="ctl-btn" data-org-waypoint data-x="${Number(data.run.x)}" data-y="${Number(data.run.y)}">${icon("pin")} GPS</button><button class="ghost-action" data-org-action="cancelDelivery">Call it off</button></div>`
            : `<div class="form-foot left"><button class="primary-action" data-org-action="delivery" ${data.isGang ? "" : "disabled"}>${icon("pin")} Arrange a drop-off</button></div>`}` : `<div class="empty compact">${data.isGang ? "Not carrying anything. Work a lab to produce product." : "Businesses earn from their properties."}</div>`}</section>
        <section class="mdt-panel"><div class="eyebrow">Perks & assets</div>${(data.perks || []).length ? data.perks.map((p) => `<div class="mdt-row"><span class="mdt-kind k-bolo">perk</span><div><b>${esc(PERK_LABEL[p.perk] || p.perk)}</b><small>+${Number(p.value)}${p.perk === "capacity" ? " units" : "%"}</small></div></div>`).join("") : '<div class="empty compact">No perks yet.</div>'}
          ${(data.vehicles || []).length ? `<div class="mdt-row"><span class="mdt-kind k-unit">garage</span><div><b>${data.vehicles.length} vehicle${data.vehicles.length > 1 ? "s" : ""} in your F7 garage</b><small>${data.vehicles.map((v) => esc(v.label)).join(", ")}</small></div></div>` : ""}</section>
      </div>`;
  } else if (tab === "crew") {
    body = `${motd}${(data.crew || []).map((c) => `<div class="hub-row"><span class="hub-ic">${icon("users")}</span><div><b>${esc(c.name)}${c.me ? ' <span class="chip">You</span>' : ""}</b><small>#${Number(c.id)} · ${esc(c.rank)}</small></div></div>`).join("") || '<div class="empty">Nobody else is on duty.</div>'}<p class="pjob-foot">Type <b>/crew</b> any time to list who is on duty in chat. Ranks are managed by leaders on the member portal.</p>`;
  } else if (tab === "labs") {
    body = (data.labs || []).map((l) => { const dd = data.drugs?.[l.drug] || {}; return `<div class="hub-row"><span class="hub-ic" style="--c:${safeColor(dd.color)}">${icon("leaf")}</span><div><b>${esc(l.label)}${l.owned ? ' <span class="chip">Owned · +50%</span>' : ""}</b><small>${esc(dd.label || l.drug)} · ${Number(dd.yield) || 0} units per batch · ${money(dd.price)} per unit at drop-off</small></div><button class="ctl-btn small" data-org-waypoint data-x="${Number(l.x)}" data-y="${Number(l.y)}">${icon("pin")} Route</button></div>`; }).join("") || '<div class="empty">No labs available.</div>';
    body = `<div class="cad-hint">${icon("info")}<span>Go to a lab on duty and press <kbd>E</kbd> to produce. Then arrange a drop-off from Overview and hand it over. Police can seize what you carry if they search you.</span></div>${body}`;
  } else if (tab === "business") {
    const hour = data.businessHour || { earned: 0, cap: 1 };
    body = `<div class="hub-cap"><span>This hour</span><i><b style="width:${clamp((Number(hour.earned) / Math.max(1, Number(hour.cap))) * 100, 0, 100)}%"></b></i><em>${money(hour.earned)} / ${money(hour.cap)}</em></div>
      ${(data.properties || []).map((p) => `<div class="hub-row"><span class="hub-ic">${icon(BUSINESS_ICON[p.business] || "building")}</span><div><b>${esc(p.label)}</b><small>${esc(p.businessLabel)} · <kbd>E</kbd> ${esc(p.task || "work a shift")}${p.service ? ` · /${esc(p.service)} customers` : ""}</small></div><button class="ctl-btn small" data-org-waypoint data-x="${Number(p.x)}" data-y="${Number(p.y)}">${icon("pin")} Route</button></div>`).join("") || '<div class="empty">Your organization does not own a property yet. Leaders can buy MLOs on the website portal.</div>'}`;
  } else if (tab === "armory") {
    const canArmory = data.can?.armory !== false;
    body = `${!canArmory ? `<div class="flag warn">Your rank (${esc(data.rank || "Member")}) does not have armory access.</div>` : data.atArmory ? "" : `<div class="flag warn">Go to ${dept ? "a department station or property" : "one of your properties"} to open the armory.</div>`}${(data.armory || []).map((a) => `<div class="hub-row"><span class="hub-ic">${icon("target")}</span><div><b>${esc(a.label)}</b><small>${a.weapons.map((w) => esc(w)).join(", ")}</small></div><button class="primary-action" data-org-armory="${esc(a.key)}" ${!canArmory || !data.atArmory || a.cooldown ? "disabled" : ""}>${a.cooldown ? `${Math.ceil(a.cooldown / 60)}m` : "Take"}</button></div>`).join("") || '<div class="empty">No armory permits yet. Leaders can buy them on the website portal.</div>'}`;
  } else if (tab === "wardrobe") {
    body = (data.outfits || []).map((o) => `<div class="hub-row"><span class="hub-ic">${icon("shirt")}</span><div><b>${esc(o.label)}</b><small>Organization outfit</small></div><button class="primary-action" data-org-outfit="${esc(o.key)}">Wear</button></div>`).join("") || '<div class="empty">No outfits yet. Leaders can buy EUP outfits on the website portal.</div>';
  }
  return `<div class="hub"><nav class="hub-tabs">${tabs.map(([id, label, ic]) => `<button class="${tab === id ? "active" : ""}" data-org-tab="${id}"><span data-icon="${ic}"></span>${label}</button>`).join("")}<button class="hub-refresh" data-org-action="refresh">${icon("clock")}</button></nav><div class="hub-body">${body}</div></div>`;
}

function orgClick(event) {
  const t = event.target;
  let el;
  if ((el = t.closest("[data-org-tab]"))) { ui.orgTab = el.dataset.orgTab; renderMenu(); return true; }
  if ((el = t.closest("[data-org-waypoint]"))) { post("orgAction", { action: "waypoint", x: Number(el.dataset.x), y: Number(el.dataset.y) }); return true; }
  if ((el = t.closest("[data-org-action]"))) { post("orgAction", { action: el.dataset.orgAction }); return true; }
  if ((el = t.closest("[data-org-armory]"))) { el.disabled = true; post("orgAction", { action: "armory", key: el.dataset.orgArmory }); return true; }
  if ((el = t.closest("[data-org-outfit]"))) { post("orgAction", { action: "outfit", key: el.dataset.orgOutfit }); return true; }
  return false;
}

/* ───────── Community service & product HUD ───────── */
const serviceState = { active: false, endsAt: 0, total: 1, running: false };
function updateService(d) {
  serviceState.active = !!d.active;
  $("#service-hud").classList.toggle("hidden", !d.active);
  if (!d.active) return;
  serviceState.total = Math.max(1, Number(d.total) || 1);
  serviceState.remaining = Number(d.remaining) || 0;
  serviceState.running = d.state === "working";
  serviceState.syncedAt = Date.now();
  setText("#service-minutes", d.minutes ?? 0);
  setText("#service-collected", d.collected ?? 0);
  const label = { working: "Working", paused: "Paused", outside: "Out of bounds" }[d.state] || "Working";
  setText("#service-state", label);
  $("#service-state").className = `tier-pill st-${esc(d.state || "working")}`;
  $("#service-hud").classList.toggle("alarm", d.state === "outside");
  const warn = $("#service-warning");
  if (d.state === "outside") { warn.textContent = `Get back to Legion Square! Prison in ${Number(d.graceLeft) || 0}s.`; warn.classList.remove("hidden"); }
  else if (d.state === "paused") { warn.textContent = "Clock paused - pick up rubbish to keep it running."; warn.classList.remove("hidden"); }
  else warn.classList.add("hidden");
  setText("#service-idle", d.state === "working" ? `${Number(d.idleLeft) || 0}s until the clock pauses` : "");
  tickService();
}
function tickService() {
  if (!serviceState.active) return;
  const left = serviceState.running ? Math.max(0, serviceState.remaining - (Date.now() - serviceState.syncedAt) / 1000) : serviceState.remaining;
  setText("#service-remaining", fmtClock(left));
  $("#service-bar").style.width = `${clamp(100 - (left / serviceState.total) * 100, 0, 100)}%`;
}
setInterval(tickService, 500);

function updateContraband(d) {
  $("#contraband").classList.toggle("hidden", !d.active && !d.run);
  setText("#contraband-units", d.units || 0);
  setText("#contraband-drug", d.drug || "Product");
  $("#contraband").style.setProperty("--c", safeColor(d.color || "#c48bff"));
  $("#contraband-fill").style.width = `${clamp(((Number(d.units) || 0) / Math.max(1, Number(d.capacity) || 1)) * 100, 0, 100)}%`;
  $("#contraband-run").classList.toggle("hidden", !d.run);
  if (d.run) {
    setText("#contraband-drop", d.run.label);
    setText("#contraband-time", fmtClock(d.run.endsIn));
  }
}

/* ───────── Messages ───────── */
function resetCoreUi() {
  ["#radial-menu", "#menu", "#third-eye", "#blindfold", "#downed", "#car-controls"].forEach((selector) => $(selector)?.classList.add("hidden"));
  document.body.classList.remove("menu-locked");
  currentView = null;
  currentPayload = {};
  thirdEyePayload = null;
  radialCategory = null;
  closeRadialDispatch();
}

window.addEventListener("message", ({ data }) => {
  if (!data || typeof data !== "object") return;
  if (data.type === "reset") {
    resetCoreUi();
    return;
  }
  if (data.type === "hud") updateHud(data.data || {});
  if (data.type === "notify") notice(data.message, data.tone);
  if (data.type === "dispatch") dispatch(data.data || {});
  if (data.type === "radial") {
    const root = $("#radial-menu");
    if (data.open) {
      radialPayload = data.payload || {};
      radialCategory = null;
      closeRadialDispatch();
      renderRadial();
      root.classList.remove("hidden");
      root.setAttribute("aria-hidden", "false");
    } else {
      root.classList.add("hidden");
      root.setAttribute("aria-hidden", "true");
      closeRadialDispatch();
      radialCategory = null;
    }
  }
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
      clearInterval(ui.mdtClock);
      clearInterval(ui.mdtPoll);
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
  if (data.type === "tagsData" && currentView === "tags") {
    currentPayload = data.data || {};
    renderMenu();
  }
  if (data.type === "blindfold") $("#blindfold").classList.toggle("hidden", !data.active);
  if (data.type === "restraint") showRestraint(data.active, data.kind);
  if (data.type === "carControls") $("#car-controls").classList.toggle("hidden", !data.open);
  if (data.type === "jail") updateJail(data);
  if (data.type === "downed") updateDowned(data);
  if (data.type === "bodycam") updateBodycam(data);
  if (data.type === "progress") updateProgress(data);
  if (data.type === "fishing") updateFishing(data);
  if (data.type === "activityRun") updateActivityRun(data);
  if (data.type === "idcard") idCard(data.data || {});
  if (data.type === "citation") citationCard(data.data || {});
  if (data.type === "plate") plateCard(data.data || {});
  if (data.type === "passportDiscovery") passportDiscovery(data.data || {});
  if (data.type === "mdtData" && currentView === "mdt") mdtData(data.kind, data.data);
  if (data.type === "service") updateService(data);
  if (data.type === "contraband") updateContraband(data);
  if (data.type === "orghubData" && currentView === "orghub") { currentPayload = data.data || {}; renderMenu(); }
});

$("#close").addEventListener("click", () => post("close"));
$("#car-close").addEventListener("click", () => post("closeCarControls"));
$("#third-eye-close").addEventListener("click", () => post("closeThirdEye"));
$("#radial-center").addEventListener("click", () => {
  if (!$("#radial-dispatch").classList.contains("hidden")) {
    closeRadialDispatch();
  } else if (radialCategory) {
    radialCategory = null;
    renderRadial();
  } else {
    post("closeRadial");
  }
});
$("#radial-labels").addEventListener("click", radialClick);
$("#radial-segments").addEventListener("click", radialClick);
$("#radial-segments").addEventListener("keyup", (event) => {
  if (event.key === "Enter" || event.key === " ") radialClick(event);
});
$("#radial-dispatch-cancel").addEventListener("click", closeRadialDispatch);
$("#radial-dispatch").addEventListener("submit", (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.target).entries());
  post("hubDispatch", values);
});

function radialClick(event) {
  const target = event.target.closest("[data-radial-category],[data-radial-action],[data-radial-compose]");
  if (!target) return;
  if (target.dataset.radialCategory) {
    radialCategory = target.dataset.radialCategory;
    renderRadial();
    return;
  }
  if (target.dataset.radialCompose) {
    openRadialDispatch(target.dataset.radialCompose);
    return;
  }
  if (target.dataset.radialAction) post("hubAction", { action: target.dataset.radialAction });
}
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
  if (currentView === "orghub" && orgClick(event)) return;
  if (currentView === "pastimes") {
    const tabButton = event.target.closest("[data-pt-tab]");
    if (tabButton) { ui.pastimeTab = tabButton.dataset.ptTab; renderMenu(); return; }
    const pastime = event.target.closest("[data-pt-action]");
    if (pastime && !pastime.disabled) {
      post("pastimeAction", { action: pastime.dataset.ptAction, id: pastime.dataset.ptId });
      return;
    }
  }
  if (currentView === "prisonjobs") {
    const job = event.target.closest("[data-prison-job]");
    if (job) { job.disabled = true; post("prisonJob", { action: "start", id: job.dataset.prisonJob }); return; }
    if (event.target.closest("[data-prison-cancel]")) { post("prisonJob", { action: "cancel" }); post("close"); return; }
  }
  const hubAction = event.target.closest("[data-hub-action]");
  if (hubAction) { post("hubAction", { action: hubAction.dataset.hubAction }); return; }
  const activity = event.target.closest("[data-activity-start]");
  if (activity) { post("activityAction", { action: "start", id: activity.dataset.activityStart }); return; }
  if (event.target.closest("[data-activity-cancel]")) { post("activityAction", { action: "cancel" }); post("close"); return; }
  if (event.target.closest("[data-activity-cache]")) { post("activityAction", { action: "cache" }); return; }
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
  if (event.target.closest("[data-radio-close]")) { post("close"); return; }
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
  if (event.target.id === "hub-dispatch-form") {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target).entries());
    post("hubDispatch", values);
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
  if (event.key.toLowerCase() === "m" && !$("#radial-menu").classList.contains("hidden") && !event.target.closest("input,textarea")) {
    post("closeRadial");
    return;
  }
  if (event.key === "Escape") {
    if (!$("#radial-menu").classList.contains("hidden")) post("closeRadial");
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

resetCoreUi();
hydrate();
