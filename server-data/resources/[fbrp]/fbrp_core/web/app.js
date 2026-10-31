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
let thirdEyeTargeting = false;
let thirdEyeFocused = false;
const ui = {
  garageCategory: null,
  showCharacterForm: false,
  selectedCharacterId: null,
  selectedSpawnId: null,
};

const HUD_DEFAULTS = Object.freeze({
  enabled: true,
  theme: "bay",
  font: "poppins",
  scale: 100,
  speedUnit: "mph",
  compassPosition: "top-center",
  statusPosition: "top-right",
  vitalsPosition: "radar",
  vehiclePosition: "bottom-right",
  showCompass: true,
  showStatus: true,
  showVitals: true,
  showPlayer: true,
  showVehicle: true,
  showMinimap: true,
});
let hudSettings = { ...HUD_DEFAULTS };

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
  knife: '<path d="M4 20l5-5M7 22l-3-3 3-3 3 3zM9 15 20 4c1-1 2 0 1 1L12 18z"/>',
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
  chevron: '<path d="M6 9l6 6 6-6"/>',
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
  ticket: '<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/><path d="M14 6v12" stroke-dasharray="2 2"/>',
  train: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M9 17l-2 4M15 17l2 4M8.5 14h.01M15.5 14h.01"/>',
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
      { action: "citizen", label: "My Citizen", hint: "Identity & licenses", icon: "user" },
      { action: "handsup", label: "Hands Up", hint: "Toggle stance", icon: "user" },
      { action: "point", label: "Point", hint: "Toggle pointing", icon: "back" },
    ],
  },
  {
    id: "vehicle", label: "Vehicle", hint: "Garage & controls", icon: "car", color: "#6fb6ff",
    actions: [
      { action: "vehicles", label: "Garage", hint: "Browse vehicles", icon: "car" },
      { action: "vehcontrol", label: "Controls", hint: "Doors, seats & lights", icon: "gauge" },
      { action: "carradio", label: "Car Audio", hint: "Play YouTube nearby", icon: "music" },
    ],
  },
  {
    id: "services", label: "Services", hint: "Comms & groups", icon: "grid", color: "#c48bff",
    actions: [
      { action: "radio", label: "Radio", hint: "Tune a channel", icon: "radio" },
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
  const rows = RADIAL_CATEGORIES.map((row) => ({
    ...row,
    actions: row.id === "vehicle" && radialPayload.carRadioAccess !== true
      ? row.actions.filter((action) => action.action !== "carradio")
      : row.actions,
  }));
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
    "--viewport-scale",
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
const safeColor = (c) => (/^#[0-9a-f]{6}$/i.test(String(c || "")) ? c : "#ffffff");

/* ───────── HUD ───────── */
const PRIORITY = {
  available: ["Available", "ok"],
  active: ["In Progress", "warn"],
  cooldown: ["Cooldown", "warn"],
  hold: ["On Hold", "bad"],
};
function priorityDisplay(status, remaining) {
  const [label, tone] = PRIORITY[status] || PRIORITY.available;
  return [status === "cooldown" ? `${Number(remaining) || 0}m` : label, tone];
}

let lastPrioritySignature = "";
function renderPriorityRows(rows, fallback, peacetime) {
  const source = (Array.isArray(rows) && rows.length ? [...rows] : [{
    id: "current",
    label: fallback?.zone || "Current area",
    status: fallback?.status || "available",
    remaining: fallback?.remaining || 0,
    current: true,
  }]).sort((a, b) => ({ zancudo: 0, ls: 1, blaine: 2, paleto: 3, roxwood: 4 }[a.id] ?? 9) - ({ zancudo: 0, ls: 1, blaine: 2, paleto: 3, roxwood: 4 }[b.id] ?? 9));
  const signature = JSON.stringify([peacetime, source.map((row) => [row.id, row.label, row.status, row.remaining])]);
  if (signature === lastPrioritySignature) return;
  lastPrioritySignature = signature;
  const list = $("#priority-list");
  list.replaceChildren(...source.map((row) => {
    const [label, tone] = priorityDisplay(row.status, row.remaining);
    const item = document.createElement("div");
    item.className = "srow priority-row";
    const zone = document.createElement("span");
    zone.textContent = `${({ zancudo: "Fort Zancudo", ls: "Los Angeles", blaine: "Sandy/Grapeseed", paleto: "Paleto Bay", roxwood: "Roxwood" }[row.id] || row.label || row.id || "Priority")}:`;
    const value = document.createElement("b");
    value.className = `tone-${tone}`;
    value.textContent = label;
    item.append(zone, value);
    if (row.status === "hold" && peacetime) {
      const pt = document.createElement("em");
      pt.textContent = " (PT)";
      value.append(pt);
    }
    return item;
  }));
}
function hudDateTime() {
  const now = new Date();
  const date = `${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}/${now.getFullYear()}`;
  return `${date} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}
function voiceInfo(data) {
  const dist = Number(data.voice) || 0;
  const level = dist && dist <= 2 ? 1 : dist && dist <= 4 ? 2 : dist ? 3 : 2;
  const fallback = ["", "Whisper", "Normal", "Shout"][level];
  return { level, label: data.voiceMode || fallback };
}

function normalizeHudSettings(input = {}) {
  const next = { ...HUD_DEFAULTS, ...(input || {}) };
  next.scale = Math.round(clamp(Number(next.scale) || 100, 75, 130));
  return next;
}

function applyHudSettings(input = hudSettings) {
  hudSettings = normalizeHudSettings(input);
  const hud = $("#hud");
  hud.dataset.theme = hudSettings.theme;
  hud.dataset.font = hudSettings.font;
  hud.dataset.compassPosition = hudSettings.compassPosition;
  hud.dataset.statusPosition = hudSettings.statusPosition;
  hud.dataset.vitalsPosition = hudSettings.vitalsPosition;
  hud.dataset.vehiclePosition = hudSettings.vehiclePosition;
  hud.style.setProperty("--hud-scale", (hudSettings.scale / 100).toFixed(2));
  hud.classList.toggle("settings-disabled", !hudSettings.enabled);
  $("#hud-compass").classList.toggle("hud-part-disabled", !hudSettings.showCompass);
  $("#hud-status").classList.toggle("hud-part-disabled", !hudSettings.showStatus);
  $("#hud-vitals").classList.toggle("hud-part-disabled", !hudSettings.showVitals);
  $("#hud-player").classList.toggle("hud-part-disabled", !hudSettings.showPlayer);
  $("#vehicle-hud").classList.toggle("hud-part-disabled", !hudSettings.showVehicle);
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
  setText("#game-time", hudDateTime());
  setText("#aop", data.aop);
  const priority = data.priority || {};
  renderPriorityRows(data.priorities, priority, !!data.peacetime);
  for (const [sel, row, tag] of [["#hud-headtag", "#hud-headtag-row", data.headtag], ["#hud-gangtag", "#hud-gangtag-row", data.gangtag]]) {
    setText(sel, tag?.label || "None");
    const node = $(sel);
    node.className = tag?.label ? "" : "tone-dim";
    node.style.color = tag?.label ? safeColor(tag.color) : "";
  }
  const duty = data.organization ? String(data.organization.slug || data.organization.name || "").toUpperCase() : data.staffDuty ? "Staff" : "";
  setText("#hud-org", duty || "Off Duty");
  setTone("#hud-org", duty ? "" : "dim");

  // Dock - flush against the radar
  const L = data.layout;
  if (L) {
    const dock = $("#dock");
    if (hudSettings.vitalsPosition === "radar") {
      const left = (L.radar ? L.right : L.left) * window.innerWidth + 10;
      const bottom = (1 - L.bottom) * window.innerHeight;
      dock.style.left = `${Math.round(left)}px`;
      dock.style.bottom = `${Math.round(bottom)}px`;
    } else {
      dock.style.removeProperty("left");
      dock.style.removeProperty("bottom");
    }
  }
  const health = clamp(Number(data.health) || 0, 0, 100);
  const armour = clamp(Number(data.armour) || 0, 0, 100);
  $("#health-ring").style.strokeDasharray = `${health} 100`;
  $("#armour-ring").style.strokeDasharray = `${armour} 100`;
  setText("#health-value", health);
  setText("#armour-value", armour);
  $(".health-vital").classList.toggle("critical", health <= 25);
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
    const speed = Number(car.speed) || 0;
    setText("#speed", hudSettings.speedUnit === "kmh" ? Math.round(speed * 1.609344) : Math.round(speed));
    setText("#speed-unit", hudSettings.speedUnit === "kmh" ? "KM/H" : "MPH");
    const rpm = clamp(Number(car.rpm) || 0, 0, 100);
    const arc = $("#rpm-arc");
    arc.style.strokeDasharray = `${rpm} 100`;
    arc.classList.toggle("redline", rpm >= 88);
    setText("#gear", car.gear === 0 ? "R" : car.speed === 0 && rpm <= 22 ? "N" : car.gear);
    const fuel = clamp(Number(car.fuel) || 0, 0, 100);
    setText("#fuel", fuel);
    $("#fuel-bar").style.width = `${fuel}%`;
    $(".fuel").classList.toggle("low", fuel <= 15);
    const engineHealth = clamp(Number(car.engineHealth) || 0, 0, 100);
    setText("#engine-health", engineHealth);
    $("#engine-health-bar").style.width = `${engineHealth}%`;
    $(".engine-health").classList.toggle("warn", engineHealth > 20 && engineHealth <= 45);
    $(".engine-health").classList.toggle("critical", engineHealth <= 20);
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
function dismiss(node, delay) {
  setTimeout(() => {
    node.classList.add("leaving");
    setTimeout(() => node.remove(), 280);
  }, delay);
}
// Centre-screen announcements (/announcement). One shows at a time; the rest queue behind it.
const announcementQueue = [];
let announcementActive = false;
function announce(message, tone) {
  announcementQueue.push({ message: String(message || ""), tone: ["warning", "urgent"].includes(tone) ? tone : "info" });
  if (!announcementActive) nextAnnouncement();
}
function nextAnnouncement() {
  const item = announcementQueue.shift();
  const root = $("#announcement");
  if (!item) {
    announcementActive = false;
    root.classList.add("hidden");
    return;
  }
  announcementActive = true;
  const ms = clamp(6000 + item.message.length * 55, 8000, 20000);
  root.className = `announcement ${item.tone}`;
  root.innerHTML = `<div class="announcement-card"><small>${item.tone === "urgent" ? "Urgent announcement" : item.tone === "warning" ? "Important announcement" : "Server announcement"}</small><p>${esc(item.message)}</p><i class="timer" style="animation-duration:${ms}ms"></i></div>`;
  setTimeout(() => {
    root.classList.add("leaving");
    setTimeout(nextAnnouncement, 450);
  }, ms);
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

function renderVehicles(data) {
  const cats = data.categories || [];
  if (!cats.length) return `${head("Garage")}<div class="empty">You have no personal vehicles. Base-game vehicles are spawned from the vMenu Vehicle Spawner.</div>`;
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
  cutziptie: ["Restraints", "knife"],
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
  w_repair: ["Vehicle", "hood"],
  w_lock: ["Vehicle", "lock"],
  w_plate: ["Vehicle", "search"],
  w_impound: ["Vehicle", "car", "red"],
  w_work: ["Business", "clock"],
  w_facilities: ["Facilities", "building"],
  w_serve: ["Business", "users"],
  w_door: ["Property", "door"],
  w_breach: ["Property", "alert", "red"],
};
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
    <div class="radio-footer"><span><kbd>Caps Lock</kbd> Push to talk</span><button type="button" data-radio-leave ${current ? "" : "disabled"}>Off</button></div>
    <p class="radio-access">All two-decimal frequencies are public unless organization locked.</p>
  </div>`;
}

function onboardingSidebar(body) {
  return `<aside class="ob-side">
    <div class="ob-brand"><img src="fbrp-logo.png" alt=""><strong>FBRP</strong></div>
    <div class="ob-server">FLORIDA BAY ROLEPLAY</div>
    ${body}
  </aside>`;
}

function characterForm(rows, slots, nationalities = [], defaultNationality = "") {
  const genders = [["Male", "mars"], ["Female", "venus"], ["Unspecified", "circle"]];
  return `<div class="ob-modal-backdrop"><form id="character-form" class="character-form ob-modal">
    <header><h3>Character Register</h3><button type="button" class="ob-close" data-cancel-character aria-label="Close">×</button></header>
    <div class="ob-modal-body">
      <h4>Character information</h4>
      <label class="ob-field"><small>First Name *</small><input name="firstName" maxlength="40" required autocomplete="off"></label>
      <p class="ob-hint">Enter a realistic first name. No celebrity or meme names.</p>
      <label class="ob-field"><small>Last Name *</small><input name="lastName" maxlength="40" required autocomplete="off"></label>
      <p class="ob-hint">Enter a realistic last name. No celebrity or meme names.</p>
      <h4>Identity</h4>
      <div class="ob-gender" role="radiogroup" aria-label="Gender">
        ${genders.map(([value], i) => `<label><input type="radio" name="gender" value="${value}"${i === 0 ? " checked" : ""}><span>${value}</span></label>`).join("")}
      </div>
      <p class="ob-hint">Choose how your character identifies.</p>
      <label class="ob-field"><small>Date of Birth *</small><input name="dateOfBirth" type="date" required></label>
      <p class="ob-hint">Age must be 18-100 years.</p>
      <div class="ob-row">
        <label class="ob-field"><small>Nationality</small><input name="nationality" list="nationality-list" maxlength="40" value="${esc(defaultNationality || "")}" autocomplete="off"></label>
        <label class="ob-field"><small>Height (cm)</small><input name="heightCm" type="number" min="120" max="230" inputmode="numeric" placeholder="175"></label>
      </div>
      <datalist id="nationality-list">${nationalities.map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
      <p class="ob-hint">Nationality and height appear on your State ID and in the police MDT.</p>
      <label class="ob-field"><small>Background (optional)</small><textarea name="backstory" maxlength="500" rows="3" placeholder="A short note about their history, work, or reason for being in Florida Bay"></textarea></label>
    </div>
    <footer class="ob-modal-foot"><button type="submit" class="ob-primary">✓ Create Character</button><button type="button" class="ob-secondary" data-cancel-character>✕ Cancel</button></footer>
  </form></div>`;
}

function formatPlaytime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function ageFromDob(dob) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dob || ""));
  if (!match) return null;
  const now = new Date();
  let age = now.getFullYear() - Number(match[1]);
  if (now.getMonth() + 1 < Number(match[2]) || (now.getMonth() + 1 === Number(match[2]) && now.getDate() < Number(match[3]))) age -= 1;
  return age;
}

// Character select: one fixed row per slot (filled, or a "create new" tile), then
// a statistics panel for the picked character with the State ID the MDT searches by.
function renderCharacters(data) {
  const rows = data.characters || [];
  const slots = Number(data.maxSlots) || 3;
  if (!rows.length) ui.showCharacterForm = true;
  if (!ui.showCharacterForm && !rows.some((c) => Number(c.id) === Number(ui.selectedCharacterId))) {
    ui.selectedCharacterId = rows[0]?.id ?? null;
  }
  const selected = rows.find((c) => Number(c.id) === Number(ui.selectedCharacterId)) || rows[0];
  const showForm = ui.showCharacterForm && rows.length < slots;
  const cards = Array.from({ length: slots }, (_, i) => {
    const c = rows[i];
    if (!c) {
      return `<button type="button" class="slot slot-new" data-new-character><span class="monogram">+</span>
        <span class="slot-copy"><strong>Create new character</strong><small>Slot ${i + 1}</small></span></button>`;
    }
    const initials = `${esc(c.first_name?.[0] || "")}${esc(c.last_name?.[0] || "")}`;
    const active = !showForm && Number(c.id) === Number(selected?.id);
    return `<button type="button" class="slot${active ? " active" : ""}" data-character-preview="${Number(c.id)}">
      <span class="monogram">${initials}</span>
      <span class="slot-copy"><strong>${esc(c.first_name)} ${esc(c.last_name)}</strong><span>${esc(c.citizen || "")} · ${esc(c.gender)}</span><small>Slot ${i + 1}</small></span>
    </button>`;
  }).join("");
  const age = ageFromDob(selected?.date_of_birth);
  const detail = selected
    ? `<section class="character-detail">
        <small>Hello, ${esc(selected.first_name)} — select a character</small>
        <div class="character-monogram">${esc(selected.first_name?.[0] || "")}${esc(selected.last_name?.[0] || "")}</div>
        <h3>${esc(selected.first_name)} ${esc(selected.last_name)}</h3>
        <h4 class="character-stats-title">Character Statistics</h4>
        <dl>
          <div><dt>State ID (MDT)</dt><dd>${esc(selected.citizen || "—")}</dd></div>
          <div><dt>Age</dt><dd>${age === null ? "—" : `${age} · ${esc(selected.date_of_birth)}`}</dd></div>
          <div><dt>Nationality</dt><dd>${esc(selected.nationality || "—")}</dd></div>
          <div><dt>Gender</dt><dd>${esc(selected.gender)}</dd></div>
          <div><dt>Height</dt><dd>${selected.height_cm ? `${Number(selected.height_cm)} cm` : "—"}</dd></div>
          <div><dt>Phone</dt><dd>${esc(selected.phone || "—")}</dd></div>
          <div><dt>Time played</dt><dd>${formatPlaytime(data.playtime)}</dd></div>
        </dl>
        <p>${esc(selected.backstory || "No background has been written for this character.")}</p>
        <button type="button" class="character-continue" data-character-id="${Number(selected.id)}">Play <span>→</span></button>
        <em>City awaits you! You will choose where to spawn next.</em>
      </section>`
    : `<section class="character-detail"><h3>Create your first character</h3></section>`;
  return `<div class="onboarding character-select">
    ${onboardingSidebar(`<div class="ob-card"><h3>Character Selection</h3><p>Please select a character</p><span class="ob-chip">Characters (${rows.length}/${slots})</span><nav class="slots" aria-label="Characters">${cards}</nav></div>`)}
    <main class="ob-main">${showForm ? "" : detail}</main>
    ${showForm ? characterForm(rows, slots, data.nationalities || [], data.defaultNationality || "") : ""}
  </div>`;
}

function renderSpawns(data) {
  const rows = data.spawns || [];
  if (!rows.some((s) => String(s.id) === String(ui.selectedSpawnId))) ui.selectedSpawnId = rows[0]?.id ?? null;
  const selected = rows.find((s) => String(s.id) === String(ui.selectedSpawnId)) || rows[0];
  const cards = rows
    .map(
      (s, index) => `<button type="button" class="spawn-card${String(s.id) === String(selected?.id) ? " active" : ""}${s.allowed === false ? " aop-blocked" : ""}" data-spawn-preview="${esc(s.id)}" style="--hue:${(index * 47 + 205) % 360}">
        <span class="spawn-number">${String(index + 1).padStart(2, "0")}</span><span class="txt"><strong>${esc(s.label)}</strong><small>${esc(s.description || "Choose this location")}</small></span>
        ${s.allowed === false ? '<span class="spawn-aop-tag off">Outside AOP</span>' : data.aop ? '<span class="spawn-aop-tag">In AOP</span>' : ""}
      </button>`,
    )
    .join("");
  const blocked = selected && selected.allowed === false;
  const spawnAction = blocked
    ? `<div class="spawn-confirm aop-blocked"><span>Area of Play: ${esc(data.aop || "")}</span><strong>The place you selected you can not spawn to due to AOP location.</strong></div>`
    : selected ? `<button type="button" class="spawn-confirm" data-spawn-id="${esc(selected.id)}" data-x="${Number(selected.x)}" data-y="${Number(selected.y)}" data-z="${Number(selected.z)}" data-h="${Number(selected.h || 0)}"><span>Spawn at</span><strong>${esc(selected.label)}</strong><em>→</em></button>` : "";
  const name = esc(data.character?.name || "Your character");
  return `<div class="onboarding spawn-select">
    ${onboardingSidebar(`<div class="ob-card"><h3>${name}</h3><p>Spawning as this character</p><span class="ob-chip">${rows.length} locations</span></div>`)}
    <main class="ob-main">
      <ol class="ob-steps"><li class="done"><i>✓</i>Choose character</li><li class="now"><i>2</i>Choose spawn</li><li><i>3</i>Spawn</li></ol>
      <div class="ob-spawning">SPAWNING AS: <b>${name}</b></div>
      ${data.aop ? `<div class="spawn-aop-banner"><small>Current Area of Play</small><strong>${esc(data.aop)}</strong><span>${rows.filter((r) => r.allowed !== false).length} of ${rows.length} spawns are inside the AOP</span></div>` : ""}
      <nav class="spawn-list" aria-label="Spawn locations">${cards}</nav>
      <section class="spawn-detail"><div class="spawn-selected"><small>Selected location</small><strong>${esc(selected?.label || "None")}</strong><span>${esc(selected?.description || "")}</span></div>${spawnAction}</section>
      <div class="ob-banner">Now choose where to spawn.</div>
    </main>
  </div>`;
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
  const peacetime = data.canPeacetime
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
    hubCard("citizen", "id", "My citizen", "Edit your identity, details, ID card and licenses.", "NEW"),
    hubCard("showid", "id", "Show my ID", "Present your character ID to nearby players."),
    hubCard("handsup", "user", "Hands up", "Raise or lower your hands."),
  ].join("");
  const tools = [
    hubCard("vehicles", "car", "Personal vehicles", "Spawn your personal vehicles."),
    hubCard("vehcontrol", "gauge", "Vehicle controls", "Engine, doors, windows, seats, headlights, high beams, and dome light."),
    ...(data.carRadioAccess ? [hubCard("carradio", "music", "Vehicle sound system", "Play synchronized YouTube audio inside and around your vehicle.")] : []),
    hubCard("radio", "radio", "Radio network", "Join public or organization frequencies."),
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

function hudSelect(setting, label, options) {
  return `<label class="hud-setting-field"><span>${esc(label)}</span><select data-hud-setting="${esc(setting)}">${options.map(([value, text]) =>
    `<option value="${esc(value)}"${hudSettings[setting] === value ? " selected" : ""}>${esc(text)}</option>`).join("")}</select></label>`;
}

function hudToggle(setting, label, detail) {
  return `<label class="hud-toggle"><span><b>${esc(label)}</b><small>${esc(detail)}</small></span><input type="checkbox" data-hud-setting="${esc(setting)}"${hudSettings[setting] ? " checked" : ""}><i></i></label>`;
}

function renderHudSettings() {
  const themes = [
    ["bay", "Bay Night", "#22d3ee", "#38bdf8"],
    ["coastal", "Coastal", "#3fe3d2", "#4fe08c"],
    ["blue", "Atlantic", "#6fb6ff", "#67e2ff"],
    ["redline", "Redline", "#ff6b57", "#ffb547"],
    ["violet", "Nightfall", "#c48bff", "#ff77b7"],
    ["mono", "Monochrome", "#eef3f5", "#9ba8af"],
  ];
  return `${head("HUD customizer", "Every change previews immediately and is saved on this device.", `<kbd>/hud</kbd> quick toggle`)}
    <section class="hud-settings-grid">
      <div class="hud-settings-section hud-theme-section">
        <div class="eyebrow">Color theme</div>
        <div class="hud-theme-grid">${themes.map(([value, label, first, second]) => `<label class="hud-theme${hudSettings.theme === value ? " selected" : ""}">
          <input type="radio" name="hud-theme" value="${value}" data-hud-setting="theme"${hudSettings.theme === value ? " checked" : ""}>
          <i style="--theme-a:${first};--theme-b:${second}"></i><span>${label}</span>
        </label>`).join("")}</div>
      </div>
      <div class="hud-settings-section">
        <div class="eyebrow">Style & speed</div>
        <div class="hud-setting-row">
          ${hudSelect("font", "HUD font", [["poppins", "Poppins"], ["barlow", "Barlow"], ["condensed", "Condensed"], ["system", "System"]])}
          ${hudSelect("speedUnit", "Vehicle speed", [["mph", "MPH"], ["kmh", "KM/H"]])}
        </div>
        <label class="hud-scale"><span>HUD size <b id="hud-scale-value">${hudSettings.scale}%</b></span><input type="range" min="75" max="130" step="5" value="${hudSettings.scale}" data-hud-setting="scale"></label>
      </div>
      <div class="hud-settings-section hud-placement-section">
        <div class="eyebrow">Placement</div>
        <div class="hud-setting-row">
          ${hudSelect("compassPosition", "Compass", [["top-center", "Top center"], ["top-left", "Top left"], ["top-right", "Top right"]])}
          ${hudSelect("statusPosition", "Server information", [["top-right", "Top right"], ["top-left", "Top left"], ["bottom-right", "Bottom right"]])}
          ${hudSelect("vitalsPosition", "Vitals & voice", [["radar", "Beside radar"], ["bottom-left", "Bottom left"], ["bottom-center", "Bottom center"]])}
          ${hudSelect("vehiclePosition", "Vehicle cluster", [["bottom-right", "Bottom right"], ["bottom-left", "Bottom left"], ["bottom-center", "Bottom center"]])}
        </div>
      </div>
      <div class="hud-settings-section hud-visibility-section">
        <div class="eyebrow">Visibility</div>
        <div class="hud-toggle-grid">
          ${hudToggle("enabled", "Entire HUD", "Master switch for HUD and minimap")}
          ${hudToggle("showCompass", "Compass & streets", "Direction and current location")}
          ${hudToggle("showStatus", "Server information", "AOP, priority, time and duty")}
          ${hudToggle("showVitals", "Health & armour", "Custom circular player vitals")}
          ${hudToggle("showPlayer", "ID & voice", "Player ID, proximity and radio")}
          ${hudToggle("showVehicle", "Vehicle cluster", "Speed, fuel, engine and seatbelt")}
          ${hudToggle("showMinimap", "Minimap", "GTA map without native health bars")}
        </div>
      </div>
    </section>
    <footer class="hud-settings-footer"><span>Settings save automatically.</span><button type="button" data-hud-reset>Restore defaults</button></footer>`;
}

function renderMenu() {
  const titles = {
    hub: "Interaction Menu",
    activities: "Activities",
    pastimes: "Pastimes",
    vehicles: "Garage",
    interactions: "Interact",
    radio: "Radio",
    characters: "Characters",
    spawns: "Spawn",
    control: "Server control",
    mdt: "Mobile data terminal",
    citizen: "My citizen",
    emotes: "Emotes",
    passport: "Coastal Passport",
    scenes: "Scene Hub",
    prisonjobs: "Prison work",
    hudsettings: "HUD customizer",
  };
  setText("#menu-title", titles[currentView] || "Menu");
  const renderers = {
    hub: renderHub,
    activities: renderActivities,
    pastimes: renderPastimes,
    vehicles: renderVehicles,
    interactions: renderInteractions,
    radio: renderRadio,
    characters: renderCharacters,
    spawns: renderSpawns,
    control: renderControl,
    mdt: renderMdt,
    citizen: renderCitizen,
    emotes: renderEmotes,
    passport: renderPassport,
    scenes: renderScenes,
    prisonjobs: renderPrisonJobs,
    hudsettings: renderHudSettings,
  };
  const shell = $(".menu-shell");
  shell.classList.toggle("wide", ["mdt", "citizen"].includes(currentView));
  shell.classList.toggle("cad-mode", currentView === "mdt");
  shell.classList.toggle("onboarding-mode", ["characters", "spawns"].includes(currentView));
  shell.classList.toggle("radio-mode", currentView === "radio");
  shell.classList.toggle("hud-settings-shell", currentView === "hudsettings");
  $("#menu").classList.toggle("radio-mode", currentView === "radio");
  $("#menu").classList.toggle("hud-settings-mode", currentView === "hudsettings");
  const content = $("#menu-content");
  const scroll = content.scrollTop;
  // The radio refreshes itself every couple of seconds. Rebuilding its HTML replays the
  // entrance animation (a quick off/on flash) and wipes typing and transmit state, so a
  // refresh of an already-open handset is rendered without the animation and restored.
  const oldRadio = currentView === "radio" && !$("#menu").classList.contains("hidden") ? $("#radio-console") : null;
  const radioKeep = oldRadio ? {
    channel: oldRadio.querySelector('#radio-tune [name="channel"]')?.value || "",
    focused: document.activeElement?.closest?.("#radio-tune") ? document.activeElement.name : "",
    transmitting: oldRadio.classList.contains("transmitting"),
  } : null;
  content.innerHTML = renderers[currentView] ? renderers[currentView](currentPayload) : "";
  content.scrollTop = scroll;
  if (radioKeep) {
    const handset = $("#radio-console");
    handset?.classList.add("no-anim");
    handset?.classList.toggle("transmitting", radioKeep.transmitting);
    const field = handset?.querySelector('#radio-tune [name="channel"]');
    if (field && radioKeep.channel) field.value = radioKeep.channel;
    if (field && radioKeep.focused === "channel") field.focus();
  }
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
  showCard(idCardMarkup(d), `idcard theme-${esc(d.theme || "classic")}`, 10000);
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
  if (r.license === "suspended" || r.license === "revoked") flags.push(["bad", `Owner driver license ${r.license}`]);
  (r.flags || []).forEach((f) => flags.push(["bad", `Owner flag: ${f}`]));
  (r.bolos || []).forEach((b) => flags.push(["bad", `BOLO #${b.id}: ${b.description}`]));
  return flags;
}
/* Wraith ARS 2X plate reader reads the server matched against the MDT. */
function alprRows(reads, limit) {
  if (!reads.length) return '<div class="empty compact">No plate reader reads yet. Turn on the radar (F5 in an LEO vehicle); flagged plates lock automatically.</div>';
  return reads.slice(0, limit).map((a) => `<button class="mdt-person plate-hit" data-mdt-plate-open="${esc(a.plate)}"><span class="plate-tag">${esc(a.plate)}</span><div><b>${esc(a.registered ? a.model || "Vehicle" : "No registration on file")}</b><small>${esc(a.cam === "rear" ? "Rear" : "Front")} camera${a.locked ? " · locked" : ""} · ${ago(a.at)}${a.registered ? ` · ${esc(a.owner || "unknown owner")}` : ""}</small>${(a.hits || []).length ? `<div class="flag-chips">${a.hits.map((h) => `<span class="fchip t-bad">${esc(h)}</span>`).join("")}</div>` : ""}</div></button>`).join("");
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
    plateHit: null,
    reportKind: "",
  };
  clearInterval(ui.mdtClock);
  ui.mdtClock = setInterval(() => setText("#cad-clock", new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })), 1000);
  clearInterval(ui.mdtPoll);
  ui.mdtPoll = setInterval(() => { if (currentView === "mdt" && ["dashboard", "dispatch"].includes(ui.mdt?.tab)) mdtSend("dashboard"); }, 8000);
}

const statusMeta = (id) => (currentPayload.statuses || []).find((s) => s.id === id) || { id, label: id || "Unknown", short: id || "?", tone: "dim" };
const flagMeta = (id) => (currentPayload.flags || []).find((f) => f.id === id) || { id, label: id, tone: "warn" };

function mdtStat(label, value, tone, ic) {
  return `<div class="cad-stat${tone ? ` tone-${tone}` : ""}"><small>${label}</small><b>${value}</b></div>`;
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
    <header><span class="mdt-kind k-${tone}">${esc(c.kind)}</span><b>#${Number(c.id)}</b><span class="prio p${Number(c.priority) || 3}" title="Priority ${Number(c.priority) || 3}">P${Number(c.priority) || 3}</span><span class="call-age">${ago(c.at)}</span></header>
    <p>${esc(c.message)}</p>
    <div class="call-meta"><span>${icon("user")}${esc(c.caller || "Dispatch")}</span>${(c.responders || []).length ? `<span>${icon("users")}${c.responders.map((r) => esc(r.callsign || r.name)).join(", ")}</span>` : `<span class="tone-warn">${icon("alert")}Unassigned</span>`}</div>
    ${compact ? "" : `<div class="call-actions">
      ${attached ? `<button class="ctl-btn small" data-mdt-call="callDetach" data-id="${Number(c.id)}">Detach</button>` : `<button class="ctl-btn small on" data-mdt-call="callAttach" data-id="${Number(c.id)}">${icon("check")} Attach</button>`}
      <button class="ctl-btn small" data-mdt-call="callWaypoint" data-id="${Number(c.id)}">${icon("pin")} GPS</button>
      <button class="ctl-btn small" data-mdt-call-notes="${Number(c.id)}">${icon("file")} Notes${(c.notes || []).length ? ` · ${c.notes.length}` : ""}</button>
      <button class="ctl-btn small" data-mdt-call-prio="${Number(c.id)}" data-priority="${(Number(c.priority) || 3) % 3 + 1}" title="Cycle priority">${icon("alert")} Priority</button>
      <button class="ctl-btn small" data-mdt-call-report="${Number(c.id)}">${icon("plus")} Report</button>
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
  return `<section class="cad-grid-stats"><header><b>Current operations</b><span>Live department summary</span></header>
      ${mdtStat("Units on duty", units.length, "", "users")}
      ${mdtStat("Active calls", calls.length, calls.length ? "warn" : "", "radio")}
      ${mdtStat("Unassigned", unassigned, unassigned ? "bad" : "", "alert")}
      ${mdtStat("Active warrants", warrants.length, warrants.length ? "bad" : "", "gavel")}
      ${mdtStat("Active BOLOs", bolos.length, bolos.length ? "warn" : "", "search")}
      ${mdtStat("In custody", inmates.filter((i) => i.status === "serving").length + services.length, "", "lock")}
    </section>
    <div class="cad-two">
      <div class="cad-stack">
        <section class="mdt-panel shift"><div class="eyebrow">Your shift today</div>
          <div class="shift-grid"><div><b>${Number(st.mine?.arrests) || 0}</b><small>Arrests</small></div><div><b>${Number(st.mine?.citations) || 0}</b><small>Citations</small></div><div><b>${Number(st.mine?.reports) || 0}</b><small>Reports</small></div></div>
          <small class="tone-dim">Department today: ${Number(st.arrests) || 0} arrests · ${Number(st.citations) || 0} citations · ${Number(st.services) || 0} community service · ${Number(st.reports) || 0} reports</small>
        </section>
        <section class="mdt-panel"><div class="eyebrow">Active calls <a data-mdt-tab="dispatch">Open dispatch →</a></div>${calls.length ? calls.slice(0, 4).map((c) => callCard(c, true)).join("") : '<div class="empty compact">No active calls.</div>'}</section>
        <section class="mdt-panel"><div class="eyebrow">Plate reader <a data-mdt-tab="plates">All reads →</a></div>${alprRows(d.alpr || [], 4)}</section>
      </div>
    </div>
    <div class="mdt-columns">
      <section class="mdt-panel"><div class="eyebrow">Latest records</div>${records.length ? records.slice(0, 8).map((r) => mdtRecordRow(r, true)).join("") : '<div class="empty compact">No records yet.</div>'}</section>
      <section class="mdt-panel"><div class="eyebrow">Narcotics seizures</div>${seizures.length ? seizures.map((s) => `<div class="mdt-row"><span class="mdt-kind k-bolo">${esc(s.drug)}</span><div><b>${Number(s.units)} units · ${esc(s.name)}</b><small>${esc(s.status === "seized" ? `Seized by ${s.seized_by || "police"}` : `Confiscated at booking by ${s.seized_by || "police"}`)}${s.location ? ` · ${esc(s.location)}` : ""}</small></div><em>${ago(s.created_at)}</em></div>`).join("") : '<div class="empty compact">No seizures logged.</div>'}</section>
    </div>
    ${(d.applications || []).length ? `<section class="mdt-panel"><div class="eyebrow">License applications · ${d.applications.length}</div>${d.applications.map((a) => `<div class="mdt-row"><span class="mdt-kind k-bolo">${esc(licenseLabel(a.kind))}</span><div><b><a data-mdt-profile="${Number(a.character_id)}">${esc(a.name)}</a></b><small>Applied ${when(a.updated_at)}</small></div><button class="ctl-btn small" data-mdt-license-review="1" data-id="${Number(a.character_id)}" data-license="${esc(a.kind)}" data-approve="1">Approve</button><button class="ctl-btn small danger" data-mdt-license-review="1" data-id="${Number(a.character_id)}" data-license="${esc(a.kind)}" data-approve="0">Deny</button></div>`).join("")}</section>` : ""}`;
}

const licenseLabel = (id) => (currentPayload.licenses || []).find((l) => l.id === id)?.label || id;

function mdtDispatch(m) {
  const d = m.dashboard || {};
  const calls = d.calls || [];
  const units = d.units || [];
  return `<div class="cad-dispatch">
    <section class="cad-calls"><div class="eyebrow">Call queue · ${calls.length}</div>${calls.length ? calls.map((c) => callCard(c, false)).join("") : '<div class="empty">The call queue is clear. Calls from /911, /311, panic buttons and drop-off tips land here.</div>'}
      ${(d.history || []).length ? `<div class="eyebrow spaced">Recently closed</div>${d.history.map((c) => `<div class="mdt-row"><span class="mdt-kind k-${CALL_TONE[c.kind] || "unit"}">${esc(c.kind)}</span><div><b>#${Number(c.id)} · ${esc(c.message)}</b><small>Closed by ${esc(c.closedBy || "dispatch")} ${ago(c.closedAt)}${c.notes ? ` · ${Number(c.notes)} note${c.notes > 1 ? "s" : ""}` : ""}</small></div><button class="ctl-btn small" data-mdt-call-report="${Number(c.id)}">${icon("plus")} Report</button></div>`).join("")}` : ""}</section>
    <section class="cad-side"><div class="mdt-panel"><div class="eyebrow">Units · ${units.length}</div>${units.length ? units.map(unitRow).join("") : '<div class="empty compact">Nobody on duty.</div>'}</div></section>
  </div>`;
}

function mdtSearchView(m) {
  const rows = m.results || [];
  return `${head("Citizen lookup", "Search by name, former name, nickname, citizen number (FB-000123), phone, date of birth, a plate, or a server ID.")}
    <form id="mdt-search-form" class="mdt-bar"><input name="query" class="mdt-input" placeholder="Name, FB number, phone, plate or server ID…" value="${esc(m.query)}" autocomplete="off" autofocus><button class="primary-action" type="submit">${icon("search")}Search</button></form>
    ${m.plateHit ? `<button class="mdt-person plate-hit" data-mdt-plate-open="${esc(m.plateHit.plate)}"><span class="plate-tag">${esc(m.plateHit.plate)}</span><div><b>${esc(m.plateHit.model || "Vehicle")}</b><small>Registered to ${esc(m.plateHit.owner || "unknown")}${m.plateHit.stolen ? " · REPORTED STOLEN" : ""} · open vehicle record</small></div></button>` : ""}
    ${m.results === null ? `<div class="cad-hint">${icon("info")}<span>Tip: flags such as <b>Armed &amp; dangerous</b> show on results so you know before you approach.</span></div>` : rows.length ? `<div class="mdt-results">${rows.map((r) => `<button class="mdt-person" data-mdt-profile="${Number(r.id)}"><span class="monogram">${initials2(r.name)}</span><div><b>${esc(r.name)}</b><small>${esc(r.citizen)} · DOB ${esc(r.dob)} · ${esc(r.gender)}</small>${(r.flags || []).length ? `<div class="flag-chips">${r.flags.map((f) => `<span class="fchip t-${esc(flagMeta(f).tone)}">${esc(flagMeta(f).label)}</span>`).join("")}</div>` : ""}</div>${r.warrants ? `<span class="chip warn-chip">${r.warrants} warrant${r.warrants > 1 ? "s" : ""}</span>` : ""}${r.online ? `<span class="chip">ID <b>${Number(r.online)}</b></span>` : ""}</button>`).join("")}</div>` : '<div class="empty">No citizens match that search.</div>'}`;
}

function mdtPlatesView(m) {
  const r = m.plate;
  return `${head("Vehicle lookup", "Run any plate. In a vehicle, /runplate checks the car in front of you, and the radar's plate reader checks every plate it reads.")}
    <form id="mdt-plate-form" class="mdt-bar"><input name="plate" class="mdt-input plate-input" maxlength="8" placeholder="PLATE" value="${esc(r?.plate || "")}" autocomplete="off"><button class="primary-action" type="submit">${icon("car")}Run plate</button></form>
    ${r ? `<section class="mdt-panel plate-report"><div class="plate-hero"><div class="plate-big">${esc(r.plate)}</div><div>${r.registered ? `<b>${esc(r.model)}</b><small>Registered owner: ${r.ownerId ? `<a data-mdt-profile="${Number(r.ownerId)}">${esc(r.owner)}</a>` : esc(r.owner)}</small>${r.license && r.license !== "none" ? `<small>Owner driver license: <b class="tone-${r.license === "valid" ? "ok" : "bad"}">${esc(r.license)}</b></small>` : ""}` : "<b>No registration on file</b>"}</div></div>
      ${plateFlags(r).map(([t, f]) => `<div class="flag ${t}">${esc(f)}</div>`).join("") || '<div class="flag ok">No flags on this plate</div>'}
      ${r.registered ? `<div class="form-foot left">${r.stolen ? `<button class="ctl-btn" data-mdt-vehicle="recovered" data-plate="${esc(r.plate)}">${icon("check")} Mark recovered</button>` : `<button class="ctl-btn" data-mdt-vehicle="stolen" data-plate="${esc(r.plate)}">${icon("alert")} Flag stolen</button>`}${r.impounded ? `<button class="ctl-btn" data-mdt-vehicle="release" data-plate="${esc(r.plate)}">${icon("unlock")} Release impound</button>` : ""}<button class="ctl-btn" data-mdt-plate-bolo="${esc(r.plate)}">${icon("search")} Issue BOLO</button></div>` : ""}
    </section>` : ""}
    <section class="mdt-panel"><div class="eyebrow">Your plate reader reads</div>${alprRows(m.dashboard?.alpr || [], 12)}</section>`;
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

const LICENSE_TONE = { valid: "ok", pending: "warn", suspended: "warn", revoked: "bad", none: "dim" };

function mdtDetailsPanel(p) {
  const d = p.details || {};
  const facts = [
    ["Nickname", d.nickname], ["Height", d.heightCm ? `${d.heightCm} cm` : ""], ["Weight", d.weightKg ? `${d.weightKg} kg` : ""],
    ["Eyes", d.eyeColor], ["Hair", d.hairColor], ["Nationality", d.nationality], ["Occupation", d.occupation],
    ["Address", d.address], ["Phone", d.phone], ["Blood type", d.bloodType], ["Emergency contact", d.emergencyContact],
    ["Marks", d.marks], ["Last seen", p.lastSeen ? when(p.lastSeen) : ""],
  ].filter(([, v]) => v);
  const aliases = p.aliases || [];
  return `<section class="mdt-panel"><div class="eyebrow">Citizen details</div>${facts.length ? `<div class="detail-grid">${facts.map(([k, v]) => `<div><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join("")}</div>` : '<div class="empty compact">This citizen has not filled in their details.</div>'}${aliases.length ? `<div class="alias-row"><small>Known aliases</small>${aliases.map((a) => `<span class="fchip t-warn">${esc(a.name)}</span>`).join("")}</div>` : ""}</section>`;
}

function mdtLicenseRow(l) {
  const sub = l.status === "none" ? "Not on file" : [l.status, l.restriction, l.updatedBy].filter(Boolean).map(esc).join(" · ");
  const control = l.status === "pending"
    ? `<button class="ctl-btn small" data-mdt-license-review="1" data-id="${Number(ui.mdt.profile?.id)}" data-license="${esc(l.id)}" data-approve="1" data-refresh="profile">Approve</button><button class="ctl-btn small danger" data-mdt-license-review="1" data-id="${Number(ui.mdt.profile?.id)}" data-license="${esc(l.id)}" data-approve="0" data-refresh="profile">Deny</button>`
    : `<select data-mdt-license="${esc(l.id)}" class="mdt-input small">${["none", "valid", "suspended", "revoked"].map((v) => `<option value="${v}"${l.status === v ? " selected" : ""}>${v === "none" ? "Not on file" : v[0].toUpperCase() + v.slice(1)}</option>`).join("")}</select>`;
  return `<div class="license t-${LICENSE_TONE[l.status] || "dim"}"><div><b>${esc(l.label)}</b><small>${sub}</small></div>${control}</div>`;
}

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
    ${mdtDetailsPanel(p)}
    <div class="profile-grid">
      <section class="mdt-panel"><div class="eyebrow">Officer safety flags</div><div class="flag-toggles">${(currentPayload.flags || []).map((f) => `<button class="ftoggle t-${esc(f.tone)}${flags.has(f.id) ? " on" : ""}" data-mdt-flag="${esc(f.id)}" data-on="${flags.has(f.id) ? 0 : 1}">${esc(f.label)}</button>`).join("")}</div></section>
      <section class="mdt-panel"><div class="eyebrow">Licenses</div><div class="license-grid">${(p.licenses || []).map(mdtLicenseRow).join("")}</div></section>
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
    <form id="mdt-report-search" class="mdt-bar"><input name="query" class="mdt-input" placeholder="Search reports…" value="${esc(m.reportQuery)}" autocomplete="off"><select name="kind" class="mdt-input kind-filter"><option value="">All types</option>${(currentPayload.reportKinds || []).map((k) => `<option${m.reportKind === k ? " selected" : ""}>${esc(k)}</option>`).join("")}</select><button class="primary-action" type="submit">${icon("search")}Search</button></form>
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
    <section class="report-addenda"><div class="eyebrow">Addenda · ${(r.addenda || []).length}</div>
      ${(r.addenda || []).map((a) => `<div class="addendum"><div class="report-body">${esc(a.body)}</div><small>${esc(a.author_name)} · ${when(a.created_at)}</small></div>`).join("") || '<small class="tone-dim">Nothing has been added since this report was filed.</small>'}
      <form id="mdt-addendum-form" class="mdt-form" data-report="${Number(r.id)}"><label>Add an addendum<textarea name="body" class="mdt-input" rows="3" maxlength="2000" required placeholder="New evidence, a correction or a follow-up. The original report is never edited."></textarea></label><div class="form-foot"><button class="primary-action" type="submit">${icon("plus")}Add addendum</button></div></form>
    </section>
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
    <div class="cad-brand"><span class="cad-crest">${icon("shield")}</span><div><small>${esc(currentPayload.department || "Florida Bay Police")}</small><b>Mobile Data Terminal</b></div></div>
    <div class="cad-unit"><span>Signed in as ${esc(currentPayload.officer || "Officer")}</span>${m.callsignEdit ? `<form id="mdt-callsign-form"><input name="callsign" class="mdt-input small" maxlength="12" value="${esc(unit.callsign || "")}" placeholder="1-ADAM-12" autofocus></form>` : `<button class="cad-sign" data-mdt-callsign title="Change callsign">${esc(unit.callsign || "SET CALLSIGN")}</button>`}</div>
    <div class="cad-status"><span>Status</span>${statuses.map((s) => `<button class="tone-${esc(s.tone)}${unit.status === s.id ? " on" : ""}" data-mdt-status="${esc(s.id)}" title="${esc(s.label)}">${esc(s.short)}</button>`).join("")}</div>
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
  return `<footer class="cad-ticker"><b>${icon("alert")} Alerts</b><div class="ticker-track"><div>${items.join("")}</div></div></footer>`;
}

function renderMdt() {
  const m = ui.mdt;
  const tabs = [...MDT_TABS];
  if (m.profile) tabs.push(["profile", m.profile.name, "user"]);
  if (m.report) tabs.push(["report", `Report #${m.report.id}`, "file"]);
  const d = m.dashboard || {};
  const counts = { dispatch: (d.calls || []).length, warrants: (d.warrants || []).length, bolos: (d.bolos || []).length, corrections: (d.inmates || []).filter((i) => i.status === "serving").length + (d.services || []).length };
  const tabButton = ([id, label, ic]) => `<button class="${m.tab === id ? "active" : ""}" data-mdt-tab="${id}"><span data-icon="${ic}"></span><span class="lbl">${esc(label)}</span>${counts[id] ? `<small>${counts[id]}</small>` : ""}</button>`;
  const primary = tabs.filter(([id]) => ["dashboard", "dispatch"].includes(id)).map(tabButton).join("");
  const records = tabs.filter(([id]) => ["search", "plates", "warrants", "bolos"].includes(id)).map(tabButton).join("");
  const admin = tabs.filter(([id]) => ["reports", "corrections", "penal"].includes(id)).map(tabButton).join("");
  const open = tabs.filter(([id]) => ["profile", "report"].includes(id)).map(tabButton).join("");
  const rail = `<div class="cad-nav-section"><span>Operations</span>${primary}</div><div class="cad-nav-section"><span>Records</span>${records}</div><div class="cad-nav-section"><span>Casework</span>${admin}</div>${open ? `<div class="cad-nav-section cad-nav-open"><span>Open record</span>${open}</div>` : ""}`;
  const views = { dashboard: mdtDashboard, dispatch: mdtDispatch, search: mdtSearchView, plates: mdtPlatesView, warrants: mdtWarrantsView, bolos: mdtBolosView, penal: mdtPenalView, profile: mdtProfileView, reports: mdtReportsView, report: mdtReportView, corrections: mdtCorrections };
  return `<div class="cad">${cadHeader(m)}<div class="cad-body"><nav class="cad-rail" aria-label="MDT sections">${rail}<footer><span>${icon("lock")}</span>Authorized law enforcement use only</footer></nav><main class="cad-main">${(views[m.tab] || mdtDashboard)(m)}</main></div>${cadTicker(m)}</div>`;
}

function mdtData(kind, data) {
  const m = ui.mdt;
  if (!m) return;
  if (kind === "dashboard") m.dashboard = data || {};
  if (kind === "results") { m.results = data?.rows || []; m.query = data?.query || m.query; m.plateHit = data?.plate || null; }
  if (kind === "plate") { m.plate = data; if (m.tab !== "plates") m.tab = "plates"; }
  if (kind === "reports") { m.reports = data?.rows || []; m.reportQuery = data?.query || ""; m.reportKind = data?.kind || ""; }
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
    if (ui.mdt.tab === "reports") { ui.mdt.reportDraft = null; mdtSend("reports", { query: ui.mdt.reportQuery, kind: ui.mdt.reportKind }); }
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
  if ((el = hit("[data-mdt-call-prio]"))) { mdtSend("callPriority", { id: Number(el.dataset.mdtCallPrio), priority: Number(el.dataset.priority) }); return true; }
  if ((el = hit("[data-mdt-call-report]"))) {
    const id = Number(el.dataset.mdtCallReport);
    const d = ui.mdt.dashboard || {};
    const call = [...(d.calls || []), ...(d.history || [])].find((c) => Number(c.id) === id);
    ui.mdt.reportDraft = { kind: call && call.kind === "TRAFFIC" ? "Traffic stop" : "Incident", title: call ? `Call #${id} · ${String(call.message).slice(0, 80)}` : "", narrative: call ? `Responding to call #${id} (${call.kind}): ${call.message}\n\n` : "", citizens: [] };
    ui.mdt.picks = [];
    ui.mdt.tab = "reports";
    renderMenu();
    return true;
  }
  if ((el = hit("[data-mdt-license-review]"))) { mdtSend("licenseReview", { id: Number(el.dataset.id), license: el.dataset.license, approve: el.dataset.approve === "1", refresh: el.dataset.refresh }); return true; }
  if ((el = hit("[data-mdt-plate-open]"))) { mdtSend("plate", { plate: el.dataset.mdtPlateOpen }); return true; }
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
  if (form.id === "mdt-report-search") { ui.mdt.reportKind = values.kind || ""; mdtSend("reports", { query: values.query, kind: values.kind }); return true; }
  if (form.id === "mdt-addendum-form") { if (values.body) mdtSend("addendum", { id: Number(form.dataset.report), body: values.body }); return true; }
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

/* ───────── My Citizen ───────── */
const CITIZEN_TABS = [
  ["identity", "Identity", "id"],
  ["details", "Details", "user"],
  ["card", "ID card", "shield"],
  ["licenses", "Licenses", "file"],
  ["vehicles", "Vehicles", "car"],
  ["record", "My record", "gavel"],
];
const LICENSE_STATUS_TEXT = { valid: "Valid", pending: "Awaiting review", suspended: "Suspended", revoked: "Revoked", none: "Not held" };
const citizenSend = (kind, body = {}) => post("citizenAction", { kind, ...body });
const longDate = (ms) => (ms ? new Date(Number(ms)).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" }) : "");

function citizenInit() {
  ui.citizen = { tab: "identity" };
}

function citizenSelect(name, list, current) {
  return `<select class="mdt-input" name="${name}"><option value="">Not stated</option>${(list || []).map((v) => `<option${v === current ? " selected" : ""}>${esc(v)}</option>`).join("")}</select>`;
}

// One ID card, used for the pop-up other players see and the live preview.
function idCardMarkup(d) {
  const initials = String(d.name || "?").split(/\s+/).map((p) => p[0] || "").join("").slice(0, 2).toUpperCase();
  const flag = d.warrants > 0
    ? `<div class="idcard-flag">${icon("alert")} ${Number(d.warrants)} active warrant${d.warrants > 1 ? "s" : ""}</div>`
    : d.inPrison ? `<div class="idcard-flag">${icon("gavel")} Serving a sentence</div>`
    : d.license === "suspended" || d.license === "revoked" ? `<div class="idcard-flag">${icon("car")} Driver license ${esc(d.license)}</div>` : "";
  const rows = [
    ["Name", d.name],
    d.nickname ? ["Alias", `"${d.nickname}"`] : null,
    ["DOB", d.dob],
    ["Sex", d.gender],
    ["No.", d.citizen],
    d.heightCm ? ["Ht", `${d.heightCm} cm`] : null,
    d.eyeColor || d.hairColor ? ["Eyes/Hair", [d.eyeColor, d.hairColor].filter(Boolean).join(" / ")] : null,
    d.nationality ? ["Nat.", d.nationality] : null,
    d.occupation ? ["Job", d.occupation] : null,
    d.address ? ["Addr.", d.address] : null,
    d.phone ? ["Phone", d.phone] : null,
  ].filter(Boolean);
  const licenses = (d.licenses || []).length
    ? `<div class="idcard-licenses">${d.licenses.map((l) => `<span class="lic-chip s-${esc(l.status || "valid")}">${esc(l.label)}${l.restriction ? ` · ${esc(l.restriction)}` : ""}${l.status && l.status !== "valid" ? ` · ${esc(l.status)}` : ""}</span>`).join("")}</div>` : "";
  return `<header class="idcard-head"><img src="fbrp-logo.png" alt=""><div><small>State of San Andreas</small><b>Florida Bay ID</b></div>${d.organDonor ? `<em class="idcard-donor">${icon("heart-pulse")} Donor</em>` : ""}</header>
    <div class="idcard-body"><div class="idcard-photo">${esc(initials)}</div>
      <dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
    </div>${licenses}${flag}`;
}

function citizenLine(label, value) {
  return value ? `<div class="mdt-row"><div><b>${esc(label)}</b><small>${esc(value)}</small></div></div>` : "";
}

function citizenIdentity(p) {
  const id = p.identity || {};
  const locked = !id.canChange;
  const dis = locked ? "disabled" : "";
  const note = locked
    ? `<div class="flag warn">${esc(id.reason || `You can change your identity again on ${longDate(id.nextAt)}.`)}</div>`
    : `<div class="cad-hint">${icon("info")}<span>Name, birth date and gender can be changed once every <b>${Number(id.cooldownDays) || 7} days</b>. Officers keep a record of your former names, and any records or warrants stay with you.</span></div>`;
  const aliases = (p.aliases || []).length
    ? p.aliases.map((a) => `<div class="mdt-row"><span class="mdt-kind k-unit">alias</span><div><b>${esc(a.name)}</b><small>Changed ${when(a.changedAt)}</small></div></div>`).join("")
    : '<div class="empty compact">You have never changed your name.</div>';
  return `${note}
    <form id="citizen-identity-form" class="mdt-form">
      <div class="eyebrow">Legal identity</div>
      <div class="mdt-form-row"><label>First name<input class="mdt-input" name="firstName" maxlength="40" required value="${esc(p.firstName)}" ${dis}></label><label>Last name<input class="mdt-input" name="lastName" maxlength="40" required value="${esc(p.lastName)}" ${dis}></label></div>
      <div class="mdt-form-row"><label>Date of birth<input class="mdt-input" type="date" name="dateOfBirth" required value="${esc(p.dob)}" ${dis}></label><label>Gender<input class="mdt-input" name="gender" list="citizen-genders" maxlength="24" required value="${esc(p.gender)}" ${dis}></label></div>
      <datalist id="citizen-genders"><option>Male</option><option>Female</option><option>Non-binary</option></datalist>
      <small class="tone-dim">Characters must be at least ${Number(id.minAge) || 18} years old.</small>
      <div class="form-foot"><button class="primary-action" type="submit" ${dis}>${icon("check")}Save identity</button></div>
    </form>
    <section class="mdt-panel"><div class="eyebrow">Former names</div>${aliases}</section>`;
}

function citizenDetails(p) {
  const d = p.details || {};
  const o = p.options || {};
  return `<form id="citizen-details-form" class="mdt-form">
      <div class="eyebrow">About you</div>
      <div class="mdt-form-row"><label>Nickname<input class="mdt-input" name="nickname" maxlength="40" value="${esc(d.nickname || "")}" placeholder="Optional"></label><label>Nationality<input class="mdt-input" name="nationality" maxlength="40" value="${esc(d.nationality || "")}" placeholder="American"></label></div>
      <div class="mdt-form-row"><label>Occupation<input class="mdt-input" name="occupation" maxlength="60" value="${esc(d.occupation || "")}" placeholder="Charter captain"></label><label>Phone${d.phoneFromDevice ? " (your phone)" : ""}<input class="mdt-input" name="phone" maxlength="16" value="${esc(d.phone || "")}" placeholder="555-0123"${d.phoneFromDevice ? " readonly title=\"This is your phone's number. Open the phone with the Up arrow or /phone.\"" : ""}></label></div>
      <label>Home address<input class="mdt-input" name="address" maxlength="120" value="${esc(d.address || "")}" placeholder="12 Seagrape Way, Florida Bay"></label>
      <label>Emergency contact<input class="mdt-input" name="emergencyContact" maxlength="80" value="${esc(d.emergencyContact || "")}" placeholder="Name and number"></label>
      <div class="eyebrow spaced">Description</div>
      <div class="mdt-form-row"><label>Height (cm)<input class="mdt-input" type="number" name="heightCm" min="120" max="${Number(o.maxHeightCm) || 230}" value="${esc(d.heightCm || "")}"></label><label>Weight (kg)<input class="mdt-input" type="number" name="weightKg" min="30" max="${Number(o.maxWeightKg) || 250}" value="${esc(d.weightKg || "")}"></label></div>
      <div class="mdt-form-row"><label>Eye colour${citizenSelect("eyeColor", o.eyeColors, d.eyeColor)}</label><label>Hair colour${citizenSelect("hairColor", o.hairColors, d.hairColor)}</label></div>
      <div class="mdt-form-row"><label>Blood type${citizenSelect("bloodType", o.bloodTypes, d.bloodType)}</label><label class="charge${d.organDonor ? " on" : ""}"><input type="checkbox" name="organDonor" ${d.organDonor ? "checked" : ""}><span>Organ donor</span></label></div>
      <label>Distinguishing marks<textarea class="mdt-input" name="marks" rows="2" maxlength="200" placeholder="Scars, tattoos, birthmarks…">${esc(d.marks || "")}</textarea></label>
      <label>Biography<textarea class="mdt-input" name="backstory" rows="4" maxlength="500" placeholder="Who is your character?">${esc(p.backstory || "")}</textarea></label>
      <div class="form-foot"><button class="primary-action" type="submit">${icon("check")}Save details</button></div>
    </form>`;
}

function citizenPreviewCard(p, values) {
  const d = p.details || {};
  const card = { ...(p.card || {}), theme: values.theme };
  card.address = values.showAddress ? d.address : undefined;
  card.phone = values.showPhone ? d.phone : undefined;
  card.licenses = values.showLicenses ? (p.licenses || []).filter((l) => l.status === "valid" && l.showOnId).map((l) => ({ label: l.label, status: "valid", restriction: l.restriction })) : [];
  return card;
}

function citizenCardTab(p) {
  const d = p.details || {};
  const themes = (p.options?.themes || []).map((t) => `<label class="theme-pick id-${esc(t.id)}${d.theme === t.id ? " on" : ""}"><input type="radio" name="theme" value="${esc(t.id)}" ${d.theme === t.id ? "checked" : ""}><i></i><span>${esc(t.label)}</span></label>`).join("");
  const toggle = (name, text, on) => `<label class="charge${on ? " on" : ""}"><input type="checkbox" name="${name}" ${on ? "checked" : ""}><span>${text}</span></label>`;
  const values = { theme: d.theme || "classic", showAddress: d.showAddress, showPhone: d.showPhone, showLicenses: d.showLicenses };
  return `<div class="citizen-card-layout">
    <form id="citizen-id-form" class="mdt-form">
      <div class="eyebrow">Design</div>
      <div class="theme-grid">${themes}</div>
      <div class="eyebrow spaced">Shown to people you hand your ID to</div>
      <div class="charge-grid one">
        ${toggle("showLicenses", "Valid licenses", d.showLicenses)}
        ${toggle("showAddress", "Home address", d.showAddress)}
        ${toggle("showPhone", "Phone number", d.showPhone)}
      </div>
      <small class="tone-dim">Officers who check your ID always see your full details. Set them on the Details tab.</small>
      <div class="form-foot"><button type="button" class="ghost-action" data-citizen-showid>${icon("id")}Show to people nearby</button><button class="primary-action" type="submit">${icon("check")}Save design</button></div>
    </form>
    <div><div class="eyebrow">Preview</div><div id="citizen-card-preview" class="idcard id-preview theme-${esc(values.theme)}">${idCardMarkup(citizenPreviewCard(p, values))}</div></div>
  </div>`;
}

function citizenLicenses(p) {
  const restrictions = p.options?.restrictions || [];
  const rows = (p.licenses || []).map((l) => {
    const tone = { valid: "ok", pending: "warn", suspended: "warn", revoked: "bad", none: "dim" }[l.status] || "dim";
    let actions = "";
    if (l.status === "none") actions = `<button class="primary-action" data-citizen-license="licenseApply" data-license="${esc(l.id)}">${icon("plus")}Get license</button>`;
    else if (l.status === "pending") actions = `<button class="ctl-btn" data-citizen-license="licenseSurrender" data-license="${esc(l.id)}" data-confirm="Withdraw?">Withdraw</button>`;
    else if (l.status === "valid") {
      actions = `<select class="mdt-input small" data-citizen-restriction="${esc(l.id)}" title="Restriction"><option value="">No restriction</option>${restrictions.map((r) => `<option${l.restriction === r ? " selected" : ""}>${esc(r)}</option>`).join("")}</select>
        <label class="inline-check"><input type="checkbox" data-citizen-visible="${esc(l.id)}" ${l.showOnId ? "checked" : ""}> On ID</label>
        <button class="ctl-btn danger" data-citizen-license="licenseSurrender" data-license="${esc(l.id)}" data-confirm="Surrender?">Surrender</button>`;
    } else actions = '<small class="tone-warn">Speak to a licensing officer.</small>';
    const meta = [LICENSE_STATUS_TEXT[l.status], l.issuedAt && l.status === "valid" ? `issued ${longDate(l.issuedAt)}` : "", l.restriction && l.status === "valid" ? l.restriction : "", l.status === "none" ? "issued instantly" : ""].filter(Boolean).join(" · ");
    return `<div class="license-card t-${tone}"><div class="lic-main"><b>${esc(l.label)}</b><small>${esc(meta)}</small></div><div class="lic-actions">${actions}</div></div>`;
  }).join("");
  return `<div class="cad-hint">${icon("info")}<span>Citizen licenses and permits are issued instantly. A suspended or revoked license can only be restored by an officer.</span></div>${rows}`;
}

function citizenVehicles(p) {
  const rows = p.vehicles || [];
  return `<div class="cad-hint">${icon("info")}<span>Register a vehicle with <b>/registervehicle</b> while driving it. If one is stolen, report it here so police can look out for it.</span></div>
    ${rows.length ? rows.map((v) => `<div class="mdt-row big"><span class="plate-tag">${esc(v.plate)}</span><div><b>${esc(v.label || v.model)}</b><small>${v.stolen ? "Reported stolen · " : ""}${v.impounded ? "Impounded · " : ""}registered ${when(v.registered_at)}</small></div>
      ${v.stolen ? `<button class="ctl-btn small" data-citizen-vehicle="recovered" data-plate="${esc(v.plate)}">${icon("check")} Recovered</button>` : `<button class="ctl-btn small danger" data-citizen-vehicle="stolen" data-plate="${esc(v.plate)}" data-confirm="Confirm?">${icon("alert")} Report stolen</button>`}</div>`).join("") : '<div class="empty">No vehicles are registered to this character.</div>'}`;
}

function citizenRecord(p) {
  const rows = p.history || [];
  return `<div class="cad-hint">${icon("info")}<span>Citations, arrests and community service issued to this character.</span></div>
    ${rows.length ? rows.map((r) => `<div class="mdt-row big"><span class="mdt-kind k-${r.kind === "arrest" ? "panic" : r.kind === "citation" ? "bolo" : "unit"}">${esc(r.kind)}</span><div><b>${esc(chargeList(r.charges) || "No charges listed")}</b><small>${r.fine ? `$${Number(r.fine)} fine · ` : ""}${r.months ? `${Number(r.months)} months · ` : ""}${esc(r.officer_name)}${r.notes ? ` · ${esc(r.notes)}` : ""}</small></div><em>${when(r.created_at)}</em></div>`).join("") : '<div class="empty">Clean record. Keep it that way.</div>'}`;
}

function renderCitizen(p) {
  const tab = ui.citizen?.tab || "identity";
  const views = { identity: citizenIdentity, details: citizenDetails, card: citizenCardTab, licenses: citizenLicenses, vehicles: citizenVehicles, record: citizenRecord };
  const nav = CITIZEN_TABS.map(([id, label, ic]) => `<button class="${tab === id ? "active" : ""}" data-citizen-tab="${id}"><span data-icon="${ic}"></span>${label}</button>`).join("");
  return `${head(esc(`${p.firstName || ""} ${p.lastName || ""}`), "Edit your character's identity, ID card and licenses.", `<b>${esc(p.citizen)}</b>`)}
    <div class="hub citizen"><nav class="hub-tabs">${nav}</nav><div class="hub-body">${(views[tab] || citizenIdentity)(p)}</div></div>`;
}

function citizenData(kind, data) {
  if (!data) return;
  currentPayload = data;
  renderMenu();
}

function citizenClick(event) {
  const t = event.target;
  let el;
  if ((el = t.closest("[data-citizen-tab]"))) { ui.citizen.tab = el.dataset.citizenTab; renderMenu(); return true; }
  if ((el = t.closest("[data-citizen-showid]"))) { post("hubAction", { action: "showid" }); return true; }
  // Destructive buttons ask twice: the first click arms them for a few seconds.
  const confirmed = (button) => {
    if (!button.dataset.confirm || button.classList.contains("armed")) return true;
    button.classList.add("armed");
    button.textContent = button.dataset.confirm;
    setTimeout(() => button.isConnected && renderMenu(), 2500);
    return false;
  };
  if ((el = t.closest("[data-citizen-license]"))) { if (confirmed(el)) citizenSend(el.dataset.citizenLicense, { license: el.dataset.license }); return true; }
  if ((el = t.closest("[data-citizen-vehicle]"))) { if (confirmed(el)) citizenSend("vehicleStolen", { plate: el.dataset.plate, stolen: el.dataset.citizenVehicle === "stolen" }); return true; }
  return false;
}

function citizenSubmit(event) {
  const form = event.target;
  const v = Object.fromEntries(new FormData(form).entries());
  if (form.id === "citizen-identity-form") { citizenSend("saveIdentity", { firstName: v.firstName, lastName: v.lastName, dateOfBirth: v.dateOfBirth, gender: v.gender }); return true; }
  if (form.id === "citizen-details-form") { citizenSend("saveDetails", { ...v, organDonor: v.organDonor === "on" }); return true; }
  if (form.id === "citizen-id-form") { citizenSend("saveId", { theme: v.theme, showAddress: v.showAddress === "on", showPhone: v.showPhone === "on", showLicenses: v.showLicenses === "on" }); return true; }
  return false;
}

function citizenInput(event) {
  const t = event.target;
  if (t.dataset.citizenRestriction) { citizenSend("licenseRestriction", { license: t.dataset.citizenRestriction, restriction: t.value }); return true; }
  if (t.dataset.citizenVisible) { citizenSend("licenseVisible", { license: t.dataset.citizenVisible, visible: t.checked }); return true; }
  const form = t.closest("#citizen-id-form");
  if (form) {
    const v = Object.fromEntries(new FormData(form).entries());
    const values = { theme: v.theme || "classic", showAddress: v.showAddress === "on", showPhone: v.showPhone === "on", showLicenses: v.showLicenses === "on" };
    const preview = $("#citizen-card-preview");
    if (preview) { preview.className = `idcard id-preview theme-${values.theme}`; preview.innerHTML = idCardMarkup(citizenPreviewCard(currentPayload, values)); }
    t.closest(".charge")?.classList.toggle("on", t.checked);
    if (t.name === "theme") $$(".theme-pick", form).forEach((n) => n.classList.toggle("on", n.querySelector("input").checked));
    return true;
  }
  if (t.closest("#citizen-details-form") && t.type === "checkbox") { t.closest(".charge")?.classList.toggle("on", t.checked); return true; }
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

/* ───────── Spatial vehicle YouTube audio ───────── */
const carRadio = {
  apiReady: false,
  netId: 0,
  station: null,
  players: new Map(),
  levels: {},
  volumeTimer: null,
};

function youtubeVideoId(value) {
  const raw = String(value || "").trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let id = null;
    if (host === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0];
    if (["youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com"].includes(host)) {
      id = url.searchParams.get("v") || url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?]+)/)?.[1];
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id || "") ? id : null;
  } catch (_) {
    return null;
  }
}

function carRadioLevel(netId) {
  return clamp(Number(carRadio.levels[String(netId)]) || 0, 0, 100);
}

function carRadioTitle(netId) {
  const entry = carRadio.players.get(Number(netId));
  if (!entry?.ready) return "YouTube audio";
  try { return entry.player.getVideoData()?.title || "YouTube audio"; }
  catch (_) { return "YouTube audio"; }
}

function updateCarRadioPanel() {
  const station = carRadio.station;
  const hasStation = Boolean(station?.videoId);
  setText("#car-radio-state", hasStation ? (station.paused ? "Paused" : "Playing nearby") : "Nothing playing");
  setText("#car-radio-track", hasStation ? carRadioTitle(carRadio.netId) : "Paste a YouTube link to start");
  const volume = hasStation ? clamp(Number(station.volume) || 0, 0, 100) : clamp(Number($("#car-radio-volume")?.value) || 35, 0, 100);
  if ($("#car-radio-volume")) $("#car-radio-volume").value = String(volume);
  setText("#car-radio-volume-value", `${volume}%`);
  $$('[data-car-radio-action]').forEach((button) => { button.disabled = !hasStation; });
  const pause = $('[data-car-radio-action="pause"]');
  if (pause) {
    pause.dataset.icon = station?.paused ? "music" : "power";
    pause.setAttribute("aria-label", station?.paused ? "Resume" : "Pause");
    hydrate(pause);
  }
}

function destroyCarRadioPlayer(netId) {
  const id = Number(netId);
  const entry = carRadio.players.get(id);
  if (!entry) return;
  try { entry.player.destroy(); } catch (_) {}
  entry.node?.remove();
  carRadio.players.delete(id);
}

function applyCarRadioStation(station) {
  if (!station?.videoId || !Number(station.netId)) return;
  const netId = Number(station.netId);
  let entry = carRadio.players.get(netId);
  if (entry && entry.videoId !== station.videoId) {
    destroyCarRadioPlayer(netId);
    entry = null;
  }
  if (!entry) {
    const node = document.createElement("div");
    node.id = `car-radio-player-${netId}`;
    $("#car-radio-players").appendChild(node);
    entry = { node, videoId: station.videoId, station, ready: false, paused: null, revision: -1 };
    carRadio.players.set(netId, entry);
    if (carRadio.apiReady) createCarRadioPlayer(netId);
  } else {
    entry.station = station;
    syncCarRadioPlayer(netId);
  }
  if (carRadio.netId === netId) {
    carRadio.station = station;
    updateCarRadioPanel();
  }
}

function createCarRadioPlayer(netId) {
  const entry = carRadio.players.get(Number(netId));
  if (!entry || entry.player || !carRadio.apiReady) return;
  entry.player = new YT.Player(entry.node.id, {
    width: "200",
    height: "200",
    videoId: entry.videoId,
    playerVars: { autoplay: 1, controls: 0, disablekb: 1, playsinline: 1, rel: 0, origin: window.location.origin },
    events: {
      onReady: () => {
        entry.ready = true;
        try { entry.player.unMute(); } catch (_) {}
        syncCarRadioPlayer(netId, true);
        if (carRadio.netId === Number(netId)) updateCarRadioPanel();
      },
      onStateChange: () => {
        if (carRadio.netId === Number(netId)) updateCarRadioPanel();
      },
      onAutoplayBlocked: () => {
        if (carRadio.netId === Number(netId)) {
          setText("#car-radio-error", "Playback was blocked. Press resume to try again.");
          $("#car-radio-error")?.classList.add("show");
        }
      },
      onError: () => {
        if (carRadio.netId === Number(netId)) {
          setText("#car-radio-error", "That video cannot be played in the in-game player.");
          $("#car-radio-error")?.classList.add("show");
        }
      },
    },
  });
}

function syncCarRadioPlayer(netId, force = false) {
  const entry = carRadio.players.get(Number(netId));
  const station = entry?.station;
  if (!entry?.ready || !station) return;
  const desired = Math.max(0, Number(station.position) || 0);
  try {
    const current = Number(entry.player.getCurrentTime()) || 0;
    if (force || Math.abs(current - desired) > 3) entry.player.seekTo(desired, true);
    if (station.paused && (force || entry.paused !== true)) entry.player.pauseVideo();
    if (!station.paused && (force || entry.paused !== false)) entry.player.playVideo();
    entry.player.setVolume(carRadioLevel(netId));
    entry.paused = station.paused === true;
    entry.revision = Number(station.revision) || 0;
  } catch (_) {}
}

window.onYouTubeIframeAPIReady = () => {
  carRadio.apiReady = true;
  for (const netId of carRadio.players.keys()) createCarRadioPlayer(netId);
};

const youtubeApi = document.createElement("script");
youtubeApi.src = "https://www.youtube.com/iframe_api";
youtubeApi.async = true;
document.head?.appendChild(youtubeApi);

function carRadioPosition() {
  const entry = carRadio.players.get(Number(carRadio.netId));
  try { return Math.max(0, Number(entry?.player?.getCurrentTime()) || Number(carRadio.station?.position) || 0); }
  catch (_) { return Math.max(0, Number(carRadio.station?.position) || 0); }
}

function sendCarRadioAction(action, value = carRadioPosition()) {
  if (!carRadio.station) return;
  post("carRadioControl", { action, value });
}

/* ───────── Messages ───────── */
function resetCoreUi() {
  ["#radial-menu", "#menu", "#third-eye", "#blindfold", "#downed", "#car-radio-panel"].forEach((selector) => $(selector)?.classList.add("hidden"));
  $("#third-eye")?.classList.remove("target-active");
  document.body.classList.remove("menu-locked");
  currentView = null;
  currentPayload = {};
  thirdEyeTargeting = false;
  thirdEyeFocused = false;
  radialCategory = null;
  closeRadialDispatch();
}

// third eye (ox_target style): options next to the eye, click one once the cursor is active
function renderThirdEye(data) {
  thirdEyeTargeting = !!data.open;
  thirdEyeFocused = thirdEyeTargeting && !!data.focused;
  const root = $("#third-eye");
  root.classList.toggle("hidden", !thirdEyeTargeting);
  root.classList.toggle("target-active", !!data.active);
  root.classList.toggle("focused", thirdEyeFocused);
  const options = Array.isArray(data.options) ? data.options : [];
  const show = thirdEyeTargeting && options.length > 0;
  $("#third-eye-panel").classList.toggle("hidden", !show);
  if (!show) {
    $("#third-eye-options").innerHTML = "";
    return;
  }
  $("#third-eye-name").textContent = data.name || "";
  $("#third-eye-name").classList.toggle("hidden", !data.name);
  $("#third-eye-hint").classList.toggle("hidden", thirdEyeFocused);
  $("#third-eye-options").innerHTML = options
    .map((o) => `<button class="third-eye-option" data-eye-option="${esc(o.id)}"><span class="ic" data-icon="${esc(o.icon || "chevron")}"></span><span>${esc(o.label)}</span></button>`)
    .join("");
  hydrate($("#third-eye-options"));
}

document.addEventListener("click", (event) => {
  if (!thirdEyeFocused) return;
  const option = event.target.closest("[data-eye-option]");
  thirdEyeFocused = false;
  if (option) post("thirdEyeSelect", { id: option.dataset.eyeOption });
  else post("thirdEyeClose"); // clicked off the list
});

document.addEventListener("contextmenu", (event) => {
  if (!thirdEyeFocused) return;
  event.preventDefault();
  thirdEyeFocused = false;
  post("thirdEyeClose");
});

window.addEventListener("message", ({ data }) => {
  if (!data || typeof data !== "object") return;
  if (data.type === "reset") {
    resetCoreUi();
    return;
  }
  if (data.type === "hud") updateHud(data.data || {});
  if (data.type === "hudVisible") $("#hud").classList.toggle("is-hidden", data.visible === false);
  if (data.type === "fbrpHud") {
    const frame = document.getElementById("hud-frame");
    if (frame && frame.contentWindow) frame.contentWindow.postMessage({ action: data.action, data: data.data }, "*");
    return;
  }
  if (data.type === "hudFrame") {
    const frame = document.getElementById("hud-frame");
    if (frame) {
      frame.classList.toggle("interactive", !!data.interactive);
      if (data.interactive) { frame.focus(); try { frame.contentWindow.focus(); } catch (e) {} }
    }
    return;
  }
  if (data.type === "hudSettings") {
    applyHudSettings(data.settings || {});
    if (currentView === "hudsettings") currentPayload.settings = { ...hudSettings };
  }
  if (data.type === "announcement") announce(data.message, data.tone);
  if (data.type === "watermark") {
    const wm = document.getElementById("watermark");
    if (wm) {
      wm.classList.toggle("hidden", data.enabled === false);
      if (typeof data.opacity === "number") wm.style.opacity = data.opacity;
      if (typeof data.width === "number") wm.style.width = `${data.width}px`;
    }
  }
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
      const characterCountChanged = data.view === "characters"
        && currentView === "characters"
        && (data.payload?.characters || []).length !== (currentPayload.characters || []).length;
      if (data.view !== currentView) {
        ui.showCharacterForm = false;
        if (data.view === "characters") ui.selectedCharacterId = null;
        if (data.view === "spawns") ui.selectedSpawnId = null;
      }
      if (characterCountChanged) {
        const characters = data.payload?.characters || [];
        ui.showCharacterForm = false;
        ui.selectedCharacterId = characters[characters.length - 1]?.id ?? null;
      }
      currentView = data.view;
      currentPayload = data.payload || {};
      if (currentView === "hudsettings") applyHudSettings(currentPayload.settings || {});
      if (currentView === "mdt") mdtInit(currentPayload);
      if (currentView === "citizen") citizenInit();
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
  if (data.type === "thirdEyeTarget") renderThirdEye(data);
  if (data.type === "controlUpdate" && currentView === "control") {
    currentPayload = { ...currentPayload, ...(data.data || {}), focus: currentPayload.focus };
    renderMenu();
  }
  if (data.type === "radioTalking") $("#radio-console")?.classList.toggle("transmitting", !!data.active);
  if (data.type === "blindfold") $("#blindfold").classList.toggle("hidden", !data.active);
  if (data.type === "restraint") showRestraint(data.active, data.kind);
  if (data.type === "carRadioSync") {
    const wanted = new Set((data.stations || []).map((station) => Number(station.netId)));
    for (const netId of carRadio.players.keys()) if (!wanted.has(netId)) destroyCarRadioPlayer(netId);
    (data.stations || []).forEach(applyCarRadioStation);
  }
  if (data.type === "carRadioStation") applyCarRadioStation(data.station);
  if (data.type === "carRadioRemove") {
    destroyCarRadioPlayer(data.netId);
    if (carRadio.netId === Number(data.netId)) { carRadio.station = null; updateCarRadioPanel(); }
  }
  if (data.type === "carRadioLevels") {
    carRadio.levels = data.levels || {};
    for (const [netId, entry] of carRadio.players) {
      if (entry.ready) try { entry.player.setVolume(carRadioLevel(netId)); } catch (_) {}
    }
  }
  if (data.type === "carRadioPanel") {
    const root = $("#car-radio-panel");
    if (data.open) {
      carRadio.netId = Number(data.netId) || 0;
      carRadio.station = data.station || null;
      root.classList.remove("hidden");
      root.setAttribute("aria-hidden", "false");
      setText("#car-radio-error", "");
      $("#car-radio-error")?.classList.remove("show");
      updateCarRadioPanel();
      setTimeout(() => $("#car-radio-url")?.focus(), 50);
    } else {
      root.classList.add("hidden");
      root.setAttribute("aria-hidden", "true");
      carRadio.netId = 0;
      carRadio.station = null;
    }
  }
  if (data.type === "carRadioPanelState") {
    carRadio.station = data.station || null;
    updateCarRadioPanel();
  }
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
  if (data.type === "citizenData" && currentView === "citizen") citizenData(data.kind, data.data);
  if (data.type === "service") updateService(data);
  if (data.type === "contraband") updateContraband(data);
});

$("#close").addEventListener("click", () => post("close"));
$("#car-radio-close").addEventListener("click", () => post("carRadioClose"));
$("#car-radio-panel").addEventListener("mousedown", (event) => {
  if (event.target === $("#car-radio-panel")) post("carRadioClose");
});
$("#car-radio-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const videoId = youtubeVideoId($("#car-radio-url").value);
  if (!videoId) {
    setText("#car-radio-error", "Paste a valid YouTube video link.");
    $("#car-radio-error").classList.add("show");
    return;
  }
  setText("#car-radio-error", "");
  $("#car-radio-error").classList.remove("show");
  post("carRadioPlay", { videoId, volume: Number($("#car-radio-volume").value) || 35 });
});
$("#car-radio-volume").addEventListener("input", (event) => {
  const volume = clamp(Number(event.target.value) || 0, 0, 100);
  setText("#car-radio-volume-value", `${volume}%`);
  clearTimeout(carRadio.volumeTimer);
  carRadio.volumeTimer = setTimeout(() => sendCarRadioAction("volume", volume), 120);
});
$("#car-radio-panel").addEventListener("click", (event) => {
  const button = event.target.closest("[data-car-radio-action]");
  if (!button || button.disabled) return;
  const action = button.dataset.carRadioAction;
  const position = carRadioPosition();
  if (action === "pause") sendCarRadioAction(carRadio.station?.paused ? "resume" : "pause", position);
  if (action === "back") sendCarRadioAction("seek", Math.max(0, position - 10));
  if (action === "forward") sendCarRadioAction("seek", position + 10);
  if (action === "stop") sendCarRadioAction("stop", 0);
});
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
$("#menu-content").addEventListener("click", (event) => {
  if (currentView === "mdt" && mdtClick(event)) return;
  if (currentView === "citizen" && citizenClick(event)) return;
  if (currentView === "pastimes") {
    const tabButton = event.target.closest("[data-pt-tab]");
    if (tabButton) { ui.pastimeTab = tabButton.dataset.ptTab; renderMenu(); return; }
    const pastime = event.target.closest("[data-pt-action]");
    if (pastime && !pastime.disabled) {
      post("pastimeAction", { action: pastime.dataset.ptAction, id: pastime.dataset.ptId });
      return;
    }
  }
  if (currentView === "hudsettings" && event.target.closest("[data-hud-reset]")) {
    hudSettings = { ...HUD_DEFAULTS };
    currentPayload.settings = { ...hudSettings };
    applyHudSettings();
    post("hudSettings", { reset: true });
    renderMenu();
    return;
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
  const characterPreview = event.target.closest("[data-character-preview]");
  if (characterPreview) {
    ui.selectedCharacterId = Number(characterPreview.dataset.characterPreview);
    ui.showCharacterForm = false;
    renderMenu();
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
  if (event.target.closest("[data-cancel-character]")) {
    ui.showCharacterForm = false;
    ui.selectedCharacterId = currentPayload.characters?.[0]?.id ?? null;
    renderMenu();
    return;
  }
  const spawnPreview = event.target.closest("[data-spawn-preview]");
  if (spawnPreview) {
    ui.selectedSpawnId = spawnPreview.dataset.spawnPreview;
    renderMenu();
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
  if (currentView === "citizen" && citizenInput(event)) return;
  if (currentView === "hudsettings" && event.target.matches("[data-hud-setting]")) {
    const field = event.target;
    const setting = field.dataset.hudSetting;
    hudSettings[setting] = field.type === "checkbox" ? field.checked : field.type === "range" ? Number(field.value) : field.value;
    currentPayload.settings = { ...hudSettings };
    applyHudSettings();
    if (setting === "scale") setText("#hud-scale-value", `${hudSettings.scale}%`);
    if (setting === "theme") $$(".hud-theme").forEach((option) => option.classList.toggle("selected", option.contains(field)));
    post("hudSettings", hudSettings);
    return;
  }
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
  const card = event.target.closest("[data-spawn-preview]");
});

$("#menu-content").addEventListener("submit", (event) => {
  if (currentView === "mdt" && mdtSubmit(event)) {
    event.preventDefault();
    return;
  }
  if (currentView === "citizen" && citizenSubmit(event)) {
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

document.addEventListener("keyup", (event) => {
  if (event.key.toLowerCase() === "m" && !$("#radial-menu").classList.contains("hidden") && !event.target.closest("input,textarea")) {
    post("closeRadial");
    return;
  }
  if (event.key === "Escape" && thirdEyeFocused) {
    thirdEyeFocused = false;
    post("thirdEyeClose");
    return;
  }
  if (event.key === "Escape") {
    if (!$("#radial-menu").classList.contains("hidden")) post("closeRadial");
    if (!menuLocked) post("close");
    return;
  }
  if (currentView === "interactions" && /^[1-9]$/.test(event.key) && !event.target.closest("input,textarea")) {
    const action = $(`[data-hotkey="${event.key}"]`);
    if (action) fireAction(action);
  }
});

resetCoreUi();
hydrate();
applyHudSettings();
