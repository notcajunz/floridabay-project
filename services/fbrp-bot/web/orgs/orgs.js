/* Florida Bay Roleplay - organization website (orgs.floridabay.net) */

import { badgesShell, mountBadges } from "./badges.js?v=2";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const fmt = (value) => new Intl.NumberFormat("en-US").format(Number(value || 0));
const money = (value) => `$${fmt(Math.round(Number(value || 0)))}`;
const hours = (seconds) => `${(Number(seconds || 0) / 3600).toFixed(1)}h`;
const day = (value) => (value ? new Date(Number(value)).toLocaleDateString([], { dateStyle: "medium" }) : "-");
const ago = (value) => {
  if (!value) return "never";
  const diff = Date.now() - Number(value);
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 2592000000) return `${Math.floor(diff / 86400000)}d ago`;
  return day(value);
};
const titleCase = (value) => String(value || "").replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const plural = (n, word) => `${fmt(n)} ${word}${Number(n) === 1 ? "" : "s"}`;
const hue = (seed) => [...String(seed || "fb")].reduce((total, char) => (total * 31 + char.charCodeAt(0)) % 360, 7);
const initials = (name) => String(name || "FB").replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(Boolean).map((word) => word[0]).join("").slice(0, 2).toUpperCase() || "FB";
/** A valid #rrggbb colour, lifted so it stays readable on the dark theme (black and navy roles become visible). */
function safeColor(value, fallback = "#35e2cd") {
  const hex = /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value).toLowerCase() : fallback;
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (l >= 0.5) return hex;
  if (d < 0.08) return l < 0.3 ? "#8b98ab" : "#a9b6c6";
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const lift = 0.58, c = (1 - Math.abs(2 * lift - 1)) * Math.min(1, Math.max(s, 0.55)), x = c * (1 - Math.abs(((h) % 2) - 1)), m = lift - c / 2;
  const [rr, gg, bb] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  return `#${[rr, gg, bb].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("")}`;
}

const PATHS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  alert: '<path d="M12 3 2 21h20L12 3Z"/><path d="M12 10v4M12 17.5v.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  badge: '<path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z"/><path d="m9 12 2 2 4-4"/>',
  crown: '<path d="m3 8 4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8Z"/>',
  ladder: '<path d="M7 3v18M17 3v18M7 7h10M7 12h10M7 17h10"/>',
  activity: '<path d="M3 12h4l2-7 4 14 2-7h6"/>',
  pin: '<path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/>',
  wallet: '<path d="M19 7V5a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-4a2 2 0 0 0 0 4h4v2a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V6"/><circle cx="17" cy="15" r=".6"/>',
  building: '<path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M3 21h18M8 8h3M8 12h3M8 16h3"/>',
  car: '<path d="M3 17v-4l2-5.5A2 2 0 0 1 6.9 6h10.2a2 2 0 0 1 1.9 1.5L21 13v4h-3v2h-2v-2H8v2H6v-2z"/><path d="M3 13h18"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  shirt: '<path d="M8 3 4 6l2 4 2-1v12h8V9l2 1 2-4-4-3c0 2-2 3-4 3s-4-1-4-3Z"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
  leaf: '<path d="M5 21c0-9 6-15 16-16-1 10-7 16-16 16Z"/><path d="M5 21 14 12"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  sync: '<path d="M21 12a9 9 0 0 1-15.5 6.3L3 16M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
  discord: '<path d="M8.5 15.5c3 1.4 4 1.4 7 0M9 12h.01M15 12h.01"/><path d="M7.2 5.5C9 4.8 10.5 4.6 12 4.6s3 .2 4.8.9c1.8 2.7 2.7 5.6 2.6 9.2-1.4 1.1-3 1.9-4.6 2.3l-1-1.7M7.2 5.5C5.4 8.2 4.5 11.1 4.6 14.7c1.4 1.1 3 1.9 4.6 2.3l1-1.7"/>',
  megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Z"/><path d="M15 8a5 5 0 0 1 0 8M18 5a9 9 0 0 1 0 14"/>',
  shield: '<path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1Z"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9Z"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  board: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="10" rx="1.5"/><rect x="17" y="4" width="4" height="13" rx="1.5"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  pin2: '<path d="M9 3h6l-1 6 4 4H6l4-4-1-6ZM12 13v8"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${PATHS[name] || ""}</svg>`;

const TYPE_LABEL = { gang: "Gang", business: "Business", leo: "Law enforcement", fire: "Fire & rescue", government: "Government", other: "Organization" };
const TYPE_ICON = { gang: "target", business: "building", leo: "shield", fire: "alert", government: "badge", other: "users" };
const BUSINESS_LABEL = { mechanic: "Mechanic", bar: "Bar", club: "Nightclub", restaurant: "Restaurant", warehouse: "Warehouse", lab: "Drug lab", hideout: "Hideout" };
const KIND_ICON = { property: "building", vehicle: "car", weapon: "target", outfit: "shirt", perk: "bolt" };
const KIND_TONE = { property: "#ff7a45", vehicle: "#55c4ff", weapon: "#ff5f6d", outfit: "#8f7cff", perk: "#ffbe5c" };
const TX_TONE = { drug_sale: "#8f7cff", business: "#35e2cd", purchase: "#ff7a45", adjust: "#ffbe5c", refund: "#3ddc97", service: "#55c4ff", transfer_in: "#3ddc97", transfer_out: "#ff7a45", seizure: "#55c4ff", stipend: "#35e2cd", manager_adjust: "#ffbe5c" };
const TX_LABEL = { drug_sale: "Product sale", transfer_in: "Transfer in", transfer_out: "Transfer out", seizure: "Seizure bounty", stipend: "Duty pay", manager_adjust: "Manager bot" };
const RANK_SWATCHES = ["#ff7a45", "#ffbe5c", "#3ddc97", "#35e2cd", "#55c4ff", "#8f7cff", "#ff5a85", "#e5e7eb", "#94a3b8", "#b45309"];
const PROPERTY_SPOTS = [
  ["door, door2, door3", "Entrances. Every door within about 12 m is locked. Members walk up to a door, see whether it is locked, and press E to lock or unlock that one door."],
  ["terminal", "The work spot. On duty, press E here to run a shift and earn for the organization."],
  ["bar", "The counter at a bar, club or restaurant. Aim at it with the third eye to serve customers."],
  ["stash", "A hideout's stash. Members guard it for a small income. It replaces the terminal."],
  ["armory", "Where members draw their permitted loadout, if their rank allows it."],
  ["wardrobe", "Where members change into the organization's outfits."],
];
const STATUS = { active: ["Active", "#3ddc97"], loa: ["Leave of absence", "#55c4ff"], probation: ["Probation", "#ffbe5c"], inactive: ["Inactive", "#6f7e92"], suspended: ["Suspended", "#ff5f6d"] };
const RECORD_STYLE = { promotion: ["trend", "#3ddc97", "Promotion"], demotion: ["down", "#ff7a45", "Demotion"], commendation: ["star", "#ffbe5c", "Commendation"], strike: ["flag", "#ff5f6d", "Strike"], note: ["file", "#8f7cff", "Leadership note"] };
const TABS = [
  ["overview", "Overview", "home"],
  ["roster", "Roster", "users"],
  ["hours", "Hours", "clock"],
  ["events", "Events", "calendar"],
  ["ranks", "Ranks & roles", "ladder"],
  ["badges", "Badges", "badge"],
  ["applications", "Applications", "inbox"],
  ["shop", "Shop", "sparkle"],
  ["ledger", "Ledger", "wallet"],
  ["settings", "Settings", "gear"],
];

const state = { pub: null, data: null, signedIn: false, filters: {}, rankOrder: null, rolesCache: new Map(), dialog: null, loading: false, publicOrgs: new Map() };

/* ---------- api ---------- */
async function api(path, options = {}) {
  const response = await fetch(`/api/${path}`, { credentials: "same-origin", cache: "no-store", ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function act(name, input, message) {
  const result = await api(`orgs/${name}`, { method: "POST", body: JSON.stringify(input) });
  state.data = result.data;
  state.rankOrder = null;
  if (route().view === "public") { const ref = route().ref; await loadPublic(ref, true); }
  render();
  if (message) toast(typeof message === "function" ? message(result.result || {}) : message);
  return result.result;
}

function toast(message, bad = false) {
  const node = document.createElement("div");
  node.className = `toast${bad ? " bad" : ""}`;
  node.innerHTML = `${icon(bad ? "alert" : "check")}<div>${esc(message)}</div>`;
  $("#toasts").append(node);
  setTimeout(() => node.remove(), bad ? 7000 : 4200);
}

/* ---------- routing ---------- */
function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "o" && parts[1]) return { view: "org", ref: decodeURIComponent(parts[1]), tab: TABS.some(([key]) => key === parts[2]) ? parts[2] : "overview" };
  if (parts[0] === "p" && parts[1]) return { view: "public", ref: decodeURIComponent(parts[1]) };
  return { view: "home" };
}
const publicHref = (org) => `#/p/${encodeURIComponent(org.slug || org.id)}`;
const orgHref = (org, tab = "overview") => `#/o/${encodeURIComponent(org.slug || org.id)}${tab === "overview" ? "" : `/${tab}`}`;
const myOrgs = () => state.data?.economy?.organizations || [];
const findMine = (ref) => myOrgs().find((org) => String(org.slug) === String(ref) || String(org.id) === String(ref));
const findPublic = (ref) => (state.pub?.organizations || []).find((org) => String(org.slug) === String(ref) || String(org.id) === String(ref));
const filter = (key, fallback) => state.filters[key] ?? fallback;
const signInUrl = () => {
  const base = state.pub?.links?.signin || "/api/orgs/handoff";
  return `${base}?next=${encodeURIComponent("/")}`;
};

/* ---------- small renderers ---------- */
function person(id, { size = "", sub = null } = {}) {
  const info = state.data?.people?.[id];
  const name = info?.name || (id && /^\d+$/.test(String(id)) ? "Member" : titleCase(id || "System"));
  const av = info?.avatar
    ? `<img class="av ${size}" src="${esc(info.avatar)}" alt="" loading="lazy">`
    : `<span class="av ${size}" style="--h:${hue(id)}">${esc(initials(name))}</span>`;
  return `<span class="person">${av}<span class="nm"><b>${esc(name)}</b>${sub === false ? "" : `<small>${esc(sub ?? (info?.username ? `@${info.username}` : String(id || "").slice(-6)))}</small>`}</span></span>`;
}
const avatarOnly = (id, size = "av-xs") => {
  const info = state.data?.people?.[id];
  return info?.avatar ? `<img class="av ${size}" src="${esc(info.avatar)}" alt="${esc(info.name || "")}" title="${esc(info.name || "")}" loading="lazy">` : `<span class="av ${size}" style="--h:${hue(id)}" title="${esc(info?.name || "Member")}">${esc(initials(info?.name || "M"))}</span>`;
};
const empty = (title, text, ico = "sparkle") => `<div class="empty"><span class="em-ico">${icon(ico)}</span><b>${esc(title)}</b><span>${esc(text)}</span></div>`;
const seg = (key, options, current) => `<div class="seg" role="tablist">${options.map(([value, label, count]) => `<button type="button" data-filter="${esc(key)}" data-value="${esc(value)}" class="${String(value) === String(current) ? "on" : ""}">${esc(label)}${count != null ? `<small>${fmt(count)}</small>` : ""}</button>`).join("")}</div>`;
const logoUrl = (orgId, version) => (version ? `/api/orgs/logo/${Number(orgId)}?v=${Number(version)}` : null);
/** The organization's logo, or its coloured initials until it has one. */
const mark = (org, cls = "") => org.logo
  ? `<span class="mark mark-img ${cls}" style="--org:${esc(safeColor(org.color))}"><img src="${esc(logoUrl(org.id, org.logo))}" alt="${esc(org.name)} logo" loading="lazy""></span>`
  : `<span class="mark ${cls}" style="--org:${esc(safeColor(org.color))}">${esc(initials(org.name))}</span>`;
const rankPill = (row, org) => {
  if (row.owner) return `<span class="pill pill-owner">${icon("crown")}Owner</span>`;
  if (row.command) return `<span class="pill pill-command">${icon("shield")}Command</span>`;
  if (row.leader) return `<span class="pill pill-leader">${icon("badge")}Leader</span>`;
  const rank = (org.ranks || []).find((r) => Number(r.id) === Number(row.rank_id));
  return rank ? `<span class="pill pill-rank" style="--c:${esc(safeColor(rank.color, "#6f7e92"))}">${esc(rank.name)}</span>` : `<span class="pill">Member</span>`;
};
const viewerBadges = (perms) => [
  perms.owner ? `<span class="pill pill-owner">${icon("crown")}Owner</span>` : "",
  perms.command ? `<span class="pill pill-command">${icon("shield")}Command</span>` : "",
  perms.leader ? `<span class="pill pill-leader">${icon("badge")}Leader</span>` : "",
  !perms.owner && !perms.command && !perms.leader && perms.member ? `<span class="pill">${esc(perms.rank)}</span>` : "",
  perms.manage ? `<span class="pill pill-warn">${icon("gear")}Staff management</span>` : "",
].join("");

/* ---------- shell ---------- */
function renderTop() {
  const current = route();
  const orgs = myOrgs();
  const user = state.data?.user;
  $("#top-user").innerHTML = (user
    ? `<span class="chip-user">${user.avatar ? `<img class="av av-xs" src="${esc(user.avatar)}" alt="">` : `<span class="av av-xs" style="--h:${hue(user.id)}">${esc(initials(user.name))}</span>`}<b>${esc(user.name)}</b></span><button class="icon-btn" type="button" data-logout title="Sign out" aria-label="Sign out">${icon("logout")}</button>`
    : `<a class="btn btn-discord btn-sm" href="${esc(signInUrl())}">${icon("discord")}Sign in with Discord</a>`);
}

function render() {
  renderTop();
  const current = route();
  const main = $("#main");
  let accent = "#35e2cd";
  if (current.view === "org" && findMine(current.ref)) {
    const org = findMine(current.ref);
    document.title = `${org.name} · Florida Bay Organizations`;
    main.innerHTML = workspace(org, current.tab);
    accent = safeColor(org.color);
    if (current.tab === "badges") mountBadges({ api, toast, icon, org: currentOrg });
  } else if (current.view === "org" || current.view === "public") {
    const page = state.publicOrgs.get(String(current.ref));
    if (!page) loadPublic(current.ref);
    document.title = `${page?.org?.name || findPublic(current.ref)?.name || "Organization"} · Florida Bay Organizations`;
    main.innerHTML = page?.error ? lockedOrg(findPublic(current.ref)) : page ? publicPage(page) : `<div class="boot"><div class="spinner"></div><span>Loading organization</span></div>`;
    accent = safeColor(page?.org?.color || findPublic(current.ref)?.color);
  } else {
    document.title = "Organizations · Florida Bay";
    main.innerHTML = home();
  }
  document.documentElement.style.setProperty("--org", accent);
}

async function loadPublic(ref, force = false) {
  const key = String(ref);
  if (!force && state.publicOrgs.has(key)) return;
  if (!force) state.publicOrgs.set(key, null);
  try { state.publicOrgs.set(key, await api(`orgs/public/org?ref=${encodeURIComponent(ref)}`)); }
  catch (error) { state.publicOrgs.set(key, { error: error.message }); }
  const current = route();
  if ((current.view === "public" || current.view === "org") && String(current.ref) === key) render();
}

/* ---------- home / directory ---------- */
function home() {
  const pub = state.pub || { organizations: [], totals: {} };
  const totals = pub.totals || {};
  const mine = myOrgs();
  const mineIds = new Set(mine.map((org) => Number(org.id)));
  const type = filter("type", "all");
  const query = String(filter("q", "")).trim().toLowerCase();
  const counts = Object.fromEntries(Object.keys(TYPE_LABEL).map((key) => [key, pub.organizations.filter((org) => org.type === key).length]));
  const list = pub.organizations
    .filter((org) => type === "all" || org.type === type)
    .filter((org) => !query || org.name.toLowerCase().includes(query) || (org.properties || []).some((p) => p.toLowerCase().includes(query)));
  return `<div class="reveal">
    <section class="hero">
      <div>
        <span class="kicker">Florida Bay Roleplay</span>
        <h1>Every crew, company <em>and</em> department.</h1>
        <p>Run your organization from one place: the wallet and shop, properties, the roster and a fully customizable rank ladder with Discord roles and permissions bound to every rank.</p>
        <div class="cta">${state.signedIn
          ? (mine.length ? `<a class="btn btn-sun btn-lg" href="${orgHref(mine[0])}">Open ${esc(mine[0].name)} ${icon("external")}</a>` : `<a class="btn btn-glass btn-lg" href="#directory">Browse the directory</a>`)
          : `<a class="btn btn-discord btn-lg" href="${esc(signInUrl())}">${icon("discord")}Sign in with Discord</a><a class="btn btn-glass btn-lg" href="#directory">Browse the directory</a>`}</div>
      </div>
      <div class="hero-stats">
        <div class="hero-stat"><strong>${fmt(totals.organizations)}</strong><span>Organizations</span></div>
        <div class="hero-stat"><strong>${fmt(totals.members)}</strong><span>Members</span></div>
        <div class="hero-stat live"><strong>${fmt(totals.onDuty)}</strong><span><span class="live-dot" style="display:inline-block;margin-right:7px;vertical-align:1px"></span>On duty now</span></div>
        <div class="hero-stat"><strong>${fmt(totals.properties)}</strong><span>Properties owned</span></div>
      </div>
    </section>
    ${mine.length ? `<div class="section-head"><div><h2>Your organizations</h2><p>Where you are a member, owner, command or manager.</p></div></div>
      <div class="org-grid">${mine.map((org) => orgCard({ ...org, members: (org.roster || []).length, onDuty: (org.roster || []).filter((r) => r.on_duty).length, properties: (org.properties || []).map((p) => p.label) }, true)).join("")}</div>` : ""}
    ${(state.data?.applications || []).length ? `<div class="section-head"><div><h2>Your applications</h2><p>Organizations you applied to.</p></div></div>
      <section class="card"><div class="feed">${state.data.applications.map((a) => `<div class="feed-row">${mark({ id: a.org_id, name: a.org_name, color: a.color, logo: a.logo }, "mark-sm")}<div class="txt"><b><a href="#/p/${encodeURIComponent(a.slug || a.org_id)}">${esc(a.org_name)}</a></b><small>${esc(a.review_note || `Applied ${ago(a.created_at)}`)}</small></div><div class="end"><span class="pill ${a.status === "accepted" ? "pill-good" : a.status === "pending" ? "pill-warn" : ""}">${esc(titleCase(a.status))}</span>${a.status === "pending" ? `<button class="btn btn-ghost btn-sm" type="button" data-app-withdraw="${a.id}">Withdraw</button>` : ""}</div></div>`).join("")}</div></section>` : ""}
    ${!state.signedIn ? `<div class="signin-band"><div><h3>Run your organization</h3><p>Owners and command set ranks, bind Discord roles to them and decide what every rank can do. Members see the wallet, roster and shop.</p></div><a class="btn btn-discord btn-lg" href="${esc(signInUrl())}">${icon("discord")}Sign in with Discord</a></div>` : ""}
    <div class="section-head" id="directory"><div><h2>Directory</h2><p>Every active gang, business and department in the city.</p></div>
      <div class="filters">${seg("type", [["all", "All", pub.organizations.length], ...Object.entries(TYPE_LABEL).filter(([key]) => counts[key]).map(([key, label]) => [key, label, counts[key]])], type)}
        <label class="search">${icon("search")}<input data-search="q" placeholder="Search organizations or properties" value="${esc(filter("q", ""))}" aria-label="Search organizations"></label></div>
    </div>
    <div class="org-grid">${list.map((org) => orgCard(org, mineIds.has(Number(org.id)))).join("") || `<div class="card" style="grid-column:1/-1">${empty("No organizations match", "Try another type or search.", "search")}</div>`}</div>
    ${footer()}
  </div>`;
}

function orgCard(org, mine) {
  const props = org.properties || [];
  return `<a class="org-card" href="${mine ? orgHref(org) : publicHref(org)}" style="--org:${esc(safeColor(org.color))}">
    <div class="top-row">${mark(org)}<div class="name"><h3>${esc(org.name)}</h3><div class="type">${esc(TYPE_LABEL[org.type] || titleCase(org.type))}</div></div>${mine ? `<span class="pill pill-good mine-tag">${icon("check")}Yours</span>` : org.recruiting ? `<span class="pill pill-warn mine-tag">${icon("send")}Recruiting</span>` : ""}</div>
    ${org.tagline ? `<p class="card-tagline">${esc(org.tagline)}</p>` : ""}
    <div class="facts"><span>${icon("users")}${fmt(org.members)}</span><span>${org.onDuty ? `<span class="live-dot"></span>${fmt(org.onDuty)} on duty` : `${icon("clock")}Off duty`}</span>${props.length ? `<span>${icon("building")}${fmt(props.length)}</span>` : ""}</div>
    ${props.length ? `<div class="chips">${props.slice(0, 3).map((p) => `<span class="pill">${esc(p)}</span>`).join("")}${props.length > 3 ? `<span class="pill">+${props.length - 3}</span>` : ""}</div>` : ""}
  </a>`;
}

function lockedOrg(pub) {
  if (!pub) return `<div class="card reveal" style="margin-top:30px">${empty("Organization not found", "It may have been renamed or deactivated.", "search")}<div style="display:flex;justify-content:center;padding-bottom:26px"><a class="btn btn-glass" href="#/">Back to the directory</a></div></div>`;
  return `<div class="reveal stack" style="margin-top:10px">
    <section class="org-hero" style="--org:${esc(safeColor(pub.color))}"><div class="row">${mark(pub, "mark-lg")}<div class="who"><small>${esc(TYPE_LABEL[pub.type] || titleCase(pub.type))}</small><h1>${esc(pub.name)}</h1>
      <div class="badges"><span class="pill">${icon("users")}${plural(pub.members, "member")}</span><span class="pill">${icon("ladder")}${plural(pub.ranks, "rank")}</span>${pub.onDuty ? `<span class="pill pill-good"><span class="live-dot"></span>${fmt(pub.onDuty)} on duty</span>` : ""}</div></div></div></section>
    <div class="card"><div class="card-body" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">
      <div><h2 style="font-size:20px">${state.signedIn ? "Members only" : "Sign in to open this organization"}</h2><p class="muted" style="margin-top:6px">${state.signedIn ? "The roster, wallet and ranks are visible to members, its owner and command. You need the organization's Discord role." : "Sign in with the Discord account that holds the organization's role."}</p></div>
      ${state.signedIn ? `<a class="btn btn-glass" href="#/">Back to the directory</a>` : `<a class="btn btn-discord btn-lg" href="${esc(signInUrl())}">${icon("discord")}Sign in with Discord</a>`}
    </div></div>
  </div>`;
}

const footer = () => `<footer class="footer"><span>Florida Bay Roleplay · Organizations</span><span>${state.data?.links?.portal ? `<a href="${esc(state.data.links.portal)}">Member portal</a> · ` : ""}<a href="${esc(state.pub?.links?.home || "/")}">floridabay.net</a></span></footer>`;

/* ---------- workspace ---------- */
function workspace(org, tab) {
  const perms = org.perms || {};
  const orgs = myOrgs();
  const week = (org.earningsWeek || []).reduce((sum, row) => sum + Number(row.total || 0), 0);
  const body = { overview: overviewTab, roster: rosterTab, hours: hoursTab, events: eventsTab, ranks: ranksTab, badges: badgesShell, applications: applicationsTab, shop: shopTab, ledger: ledgerTab, settings: settingsTab }[tab] || overviewTab;
  const tabs = TABS.filter(([key]) => key !== "applications" || perms.applications);
  const badge = (key) => key === "roster" ? fmt((org.roster || []).length) : key === "ranks" ? fmt((org.ranks || []).length) : key === "events" && upcomingEvents(org).length ? fmt(upcomingEvents(org).length) : key === "applications" && org.pendingApplications ? fmt(org.pendingApplications) : "";
  return `<div class="workspace reveal">
    <aside class="rail" aria-label="Your organizations"><div class="rail-label">Your organizations</div>${orgs.map((row) => `<a href="${orgHref(row, tab)}" class="${Number(row.id) === Number(org.id) ? "on" : ""}" style="--org:${esc(safeColor(row.color))}">${mark(row)}<span class="nm"><b>${esc(row.name)}</b><small>${esc(row.perms?.rank || TYPE_LABEL[row.type])}</small></span></a>`).join("")}
      <div class="rail-label" style="margin-top:8px">Explore</div><a href="#/">${icon("search")}<span class="nm"><b>Directory</b><small>Every organization</small></span></a></aside>
    <div style="min-width:0">
      <section class="org-hero" style="--org:${esc(safeColor(org.color))}">
        <div class="row">${mark(org, "mark-lg")}
          <div class="who"><small>${esc(TYPE_LABEL[org.type] || titleCase(org.type))}${org.leadership?.command ? ` · ${esc(org.leadership.command)}` : ""}</small><h1>${esc(org.name)}</h1><div class="badges">${viewerBadges(perms)}</div></div>
          <div class="balance"><small class="muted">${org.department ? "Department budget" : "Organization wallet"}</small><strong>${money(org.wallet?.balance)}</strong><span>${icon("trend")}${money(week)} this week</span></div>
        </div>
        <div class="org-actions">
          ${perms.spend ? `<button class="btn btn-org btn-sm" type="button" data-dialog="transfer">${icon("send")}Transfer</button>` : ""}
          ${perms.ranks ? `<button class="btn btn-glass btn-sm" type="button" data-dialog="rank" data-id="new">${icon("plus")}New rank</button>` : ""}
          ${perms.motd ? `<button class="btn btn-glass btn-sm" type="button" data-dialog="motd">${icon("megaphone")}Message of the day</button>` : ""}
          ${perms.owner || perms.command || perms.manage ? `<button class="btn btn-glass btn-sm" type="button" data-dialog="leaders">${icon("badge")}Leaders</button>` : ""}
          ${perms.manage ? `<button class="btn btn-glass btn-sm" type="button" data-dialog="adjust">${icon("wallet")}Adjust wallet</button>` : ""}
          ${perms.announce ? `<button class="btn btn-glass btn-sm" type="button" data-dialog="announce">${icon("megaphone")}Announce</button>` : ""}
          <a class="btn btn-ghost btn-sm" href="${publicHref(org)}">${icon("eye")}Public page</a>
        </div>
      </section>
      <nav class="tabs" aria-label="${esc(org.name)} sections">${tabs.map(([key, label, ico]) => `<a href="${orgHref(org, key)}" class="${key === tab ? "on" : ""}">${icon(ico)}${esc(label)}${badge(key) ? `<span class="count">${badge(key)}</span>` : ""}</a>`).join("")}</nav>
      ${body(org)}
      ${footer()}
    </div>
  </div>`;
}

function overviewTab(org) {
  const perms = org.perms || {};
  const roster = org.roster || [];
  const byKind = (kind) => Number((org.earningsWeek || []).find((row) => row.kind === kind)?.total || 0);
  const drugs = org.drugWeek || [];
  const delivered = drugs.filter((r) => r.status === "delivered").reduce((n, r) => n + Number(r.units || 0), 0);
  const seizedUnits = (org.seizuresWeek || []).reduce((n, r) => n + Number(r.units || 0), 0);
  const stats = org.department
    ? [["clock", "#35e2cd", "Duty pay · 7d", money(byKind("stipend")), `${hours(roster.reduce((n, r) => n + r.week_seconds, 0))} on duty across the roster`],
      ["badge", "#8f7cff", "Seizure bounties · 7d", money(byKind("seizure")), `${fmt(seizedUnits)} units seized`],
      ["users", "#3ddc97", "Roster", fmt(roster.length), `${fmt(roster.filter((r) => r.on_duty).length)} on duty now`],
      ["wallet", "#ffbe5c", "Lifetime spent", money(org.wallet?.lifetime_spent), `${fmt((org.purchases || []).length)} items owned`]]
    : [["leaf", "#8f7cff", "Product sales · 7d", money(byKind("drug_sale")), `${fmt(delivered)} units delivered`],
      ["building", "#35e2cd", "Business income · 7d", money(byKind("business") + byKind("service")), `${plural((org.properties || []).length, "property")} owned`],
      ["users", "#3ddc97", "Roster", fmt(roster.length), `${fmt(roster.filter((r) => r.on_duty).length)} on duty now`],
      ["trend", "#ffbe5c", "Lifetime earned", money(org.wallet?.lifetime_earned), `${money(org.wallet?.lifetime_spent)} spent`]];
  const nonProperty = (org.purchases || []).filter((p) => p.kind !== "property");
  return `<div class="stack">
    ${org.motd ? `<div class="callout org">${icon("megaphone")}<div><b>Message of the day.</b> ${esc(org.motd)}</div></div>` : ""}
    <div class="stats">${stats.map(([ico, tone, label, value, sub]) => `<div class="stat" style="--t:${tone}"><div class="ico">${icon(ico)}</div><span>${esc(label)}</span><strong>${value}</strong><small>${esc(sub)}</small></div>`).join("")}</div>
    <div class="grid-3">${announcementsCard(org)}${leaderboard(org)}</div>
    <div class="grid-3">
      <section class="card"><div class="card-head"><div><h2>Leadership</h2><p>Who runs ${esc(org.name)}.</p></div></div>${leadershipBody(org)}</section>
      <section class="card"><div class="card-head"><div><h2>Recent activity</h2><p>Roster and rank changes.</p></div></div>${activityFeed(org, 6)}</section>
    </div>
    <div class="grid-2">
      <section class="card"><div class="card-head"><div><h2>Properties</h2><p>Run them in game: on duty, press <kbd>E</kbd> at the terminal or open <kbd>F2</kbd>.</p></div><a class="btn btn-ghost btn-sm" href="${orgHref(org, "shop")}">Shop</a></div>
        ${(org.properties || []).length ? `<div class="feed">${org.properties.map((p) => `<div class="feed-row"><span class="feed-ico" style="--t:${p.data?.business === "lab" ? "#8f7cff" : "#ff7a45"}">${icon(p.data?.business === "lab" ? "leaf" : "building")}</span><div class="txt"><b>${esc(p.label || p.item_key)}</b><small>${esc(BUSINESS_LABEL[p.data?.business] || "Property")}${p.data?.area ? ` · ${esc(p.data.area)}` : ""} · since ${esc(day(p.purchased_at))}</small></div><div class="end">${p.setup_status === "pending" ? `<span class="pill pill-warn">Pending from DevOps</span>` : (p.spots || []).length ? `<span class="pill pill-good">${fmt(p.spots.length)} spots</span>` : `<span class="pill pill-good">Set up</span>`}</div></div>`).join("")}</div>` : empty("No property yet", org.department ? "Departments draw from station armories; properties are optional." : "Buy an MLO in the shop to start a business or a private lab.", "building")}
        ${nonProperty.length ? `<div class="chips" style="padding:0 22px 20px">${nonProperty.map((p) => `<span class="pill">${icon(KIND_ICON[p.kind] || "sparkle")}${esc(p.label)}</span>`).join("")}</div>` : ""}
      </section>
      <section class="card"><div class="card-head"><div><h2>Ledger</h2><p>Latest money in and out.</p></div><a class="btn btn-ghost btn-sm" href="${orgHref(org, "ledger")}">All</a></div>${ledgerFeed(org, 6)}</section>
    </div>
    ${!perms.member && !perms.full ? "" : howMoney(org)}
  </div>`;
}

function leadershipBody(org) {
  const lead = org.leadership;
  const leaders = org.leaders || [];
  const rows = [];
  if (lead?.ownerId) rows.push(`<div class="feed-row">${person(lead.ownerId, { sub: lead.kind === "department" ? "Department head" : "Owner" })}<div class="end"><span class="pill pill-owner">${icon("crown")}Owner</span></div></div>`);
  if (lead?.commandRole) {
    const members = lead.commandMembers || [];
    rows.push(`<div class="feed-row"><span class="feed-ico" style="--t:${esc(safeColor(lead.commandRole.color, "#8f7cff"))}">${icon("shield")}</span><div class="txt"><b>${esc(lead.commandRole.name)}</b><small>Command role${lead.guildName ? ` · ${esc(lead.guildName)}` : ""} · ${plural(members.length, "member")}</small></div><div class="end"><span class="stack-av">${members.slice(0, 6).map((id) => avatarOnly(id)).join("")}</span></div></div>`);
  }
  for (const id of leaders) rows.push(`<div class="feed-row">${person(id, { sub: "Leader" })}<div class="end"><span class="pill pill-leader">${icon("badge")}Leader</span></div></div>`);
  if (!rows.length) return empty("No leadership linked", "Link the organization in its manager bot with /gang add, /business add or /dept add to set an owner and command role.", "crown");
  return `<div class="feed">${rows.join("")}</div>`;
}

const ACTIVITY_TEXT = {
  rank_create: (d) => `created the rank ${d.name}`,
  rank_update: (d) => `edited the rank ${d.name}`,
  rank_delete: (d) => `deleted the rank ${d.name}`,
  rank_reorder: () => "reordered the rank ladder",
  member_rank: (d, target) => `${d.auto ? "auto-ranked" : "set"} ${target} to ${d.rank}`,
  motd: () => "updated the message of the day",
  settings: (d) => `turned role sync ${d.roleSync ? "on" : "off"} and auto-rank ${d.autoRank ? "on" : "off"}`,
  rank_import: (d) => `imported ranks from Discord (${plural(d.changed, "change")})`,
  leader_add: (d, target) => `made ${target} a leader`,
  leader_remove: (d, target) => `removed ${target} as a leader`,
  division_create: (d) => `created the division ${d.name}`,
  division_update: (d) => `edited the division ${d.name}`,
  division_delete: (d) => `deleted the division ${d.name}`,
  member_profile: (d, target) => `updated ${target}'s file${d.status && d.status !== "active" ? ` (${STATUS[d.status]?.[0] || d.status})` : ""}`,
  member_commendation: (d, target) => `commended ${target}`,
  member_strike: (d, target) => `gave ${target} a strike`,
  member_note: (d, target) => `added a note to ${target}'s file`,
  record_revoke: (d, target) => `revoked a ${d.kind} on ${target}'s file`,
  announcement: (d) => `posted "${d.title}"`,
  announcement_edit: (d) => `edited "${d.title}"`,
  event: (d) => `scheduled "${d.title}"`,
  event_edit: (d) => `edited the event "${d.title}"`,
  event_cancel: (d) => `cancelled the event "${d.title}"`,
  profile: (d) => `updated the public profile${d.recruiting ? " (recruiting)" : ""}`,
  logo: () => "changed the organization logo",
  logo_remove: () => "removed the organization logo",
  application: () => "applied to join",
  application_accepted: (d, target) => `accepted ${target}'s application`,
  application_denied: (d, target) => `denied ${target}'s application`,
};
function activityFeed(org, limit = 30) {
  const rows = (org.activity || []).slice(0, limit);
  if (!rows.length) return empty("Nothing yet", "Rank edits and promotions show up here.", "activity");
  return `<div class="feed">${rows.map((row) => {
    const actor = row.actor_id === "auto-rank" ? "Auto-rank" : state.data?.people?.[row.actor_id]?.name || "Someone";
    const target = row.target_id ? state.data?.people?.[row.target_id]?.name || "a member" : "";
    const text = (ACTIVITY_TEXT[row.action] || (() => titleCase(row.action)))(row.detail || {}, target);
    return `<div class="feed-row">${row.actor_id === "auto-rank" ? `<span class="feed-ico" style="--t:#35e2cd">${icon("sync")}</span>` : avatarOnly(row.actor_id, "")}<div class="txt"><b>${esc(actor)}</b><small>${esc(text)}</small></div><time>${esc(ago(row.created_at))}</time></div>`;
  }).join("")}</div>`;
}

function ledgerFeed(org, limit = 40) {
  if (!org.perms?.ledger) return empty("Ledger hidden", "Your rank cannot view the ledger.", "wallet");
  const rows = (org.transactions || []).slice(0, limit);
  if (!rows.length) return empty("No transactions", org.department ? "Go on duty and make seizures to fund the department." : "Deliver product or work your business in game to earn money.", "wallet");
  return `<div class="feed">${rows.map((t) => {
    const up = Number(t.amount) >= 0;
    const actor = t.actor_id && /^\d{15,24}$/.test(String(t.actor_id)) ? state.data?.people?.[t.actor_id]?.name || "member" : null;
    return `<div class="feed-row"><span class="feed-ico" style="--t:${TX_TONE[t.kind] || "#a9b6c6"}">${icon(up ? "trend" : "wallet")}</span><div class="txt"><b>${esc(t.description)}</b><small>${esc(TX_LABEL[t.kind] || titleCase(t.kind))}${actor ? ` · ${esc(actor)}` : ""}</small></div><div class="end"><span class="amount ${up ? "up" : "down"}">${up ? "+" : "−"}${money(Math.abs(Number(t.amount)))}</span><time>${esc(ago(t.created_at))}</time></div></div>`;
  }).join("")}</div>`;
}

function howMoney(org) {
  const items = org.department
    ? [["clock", "Duty pay", "Every member on /duty earns the department budget by the minute."], ["badge", "Seizures", "Seizing product pays a bounty on its street value."], ["target", "Station armories", "Bought loadouts are drawn at any station from F2."], ["wallet", "Spend", "Ranks with spending buy vehicles, loadouts and perks here."]]
    : [["leaf", "Produce", "Gangs on /duty cook or harvest at a lab (public or owned)."], ["pin", "Deliver", "Start a run from F2 and hand the product over at the drop-off."], ["building", "Run a business", "Work shifts at your property terminal, /repair or /serve customers."], ["wallet", "Spend", "Ranks with spending buy MLOs, cars, permits, outfits and perks here."]];
  return `<section class="card"><div class="card-head"><div><h2>${org.department ? "How department funding works" : "How the money works"}</h2><p>Organization money lives on the website and Discord, never in anyone's pockets in game.</p></div></div>
    <div class="stats" style="padding:18px 22px 22px">${items.map(([ico, title, text], index) => `<div class="stat" style="--t:${["#35e2cd", "#8f7cff", "#ff7a45", "#ffbe5c"][index]}"><div class="ico">${icon(ico)}</div><span>${esc(title)}</span><small style="color:var(--ink-2);font-size:13px">${esc(text)}</small></div>`).join("")}</div></section>`;
}

/* ---------- roster ---------- */
const rankOf = (org, row) => (org.ranks || []).find((r) => Number(r.id) === Number(row.rank_id)) || null;
const isLeadership = (row) => row.owner || row.command || row.leader;
function requirement(org, row) {
  if (isLeadership(row)) return null;
  const rank = rankOf(org, row);
  return rank?.min_weekly_minutes ? rank.min_weekly_minutes : null;
}
const isShort = (org, row) => { const need = requirement(org, row); return need != null && row.status === "active" && Number(row.week_seconds || 0) / 60 < need; };
const statusPill = (status, note = "") => { const [label, color] = STATUS[status] || STATUS.active; return `<span class="pill" style="--c:${color}" title="${esc(note)}"><span class="dot"></span>${esc(label)}</span>`; };
function hoursBar(org, row) {
  const need = requirement(org, row);
  const minutes = Number(row.week_seconds || 0) / 60;
  if (!need) return `<span class="hours-text">${hours(row.week_seconds)} this week</span>`;
  const pct = Math.min(100, Math.round((minutes / need) * 100));
  return `<span class="hours-bar ${pct >= 100 ? "met" : ""}" title="${hours(row.week_seconds)} of ${(need / 60).toFixed(1)}h required"><i style="width:${pct}%"></i></span><span class="hours-text">${hours(row.week_seconds)} / ${(need / 60).toFixed(1)}h</span>`;
}
const nameOf = (id) => state.data?.people?.[id]?.name || "Member";

function memberTile(org, row, { interactive = true } = {}) {
  const rank = rankOf(org, row);
  const color = row.owner ? "#ff7a45" : row.command ? safeColor(org.leadership?.commandRole?.color, "#8f7cff") : row.leader ? "#ffbe5c" : safeColor(rank?.color, "#6f7e92");
  const sub = [row.callsign, row.owner ? "Owner" : row.command ? "Command" : row.leader ? "Leader" : rank?.name || "Member"].filter(Boolean).join(" · ");
  const tag = interactive ? "button" : "div";
  return `<${tag} class="tile${row.status !== "active" ? " dim" : ""}" ${interactive ? `type="button" data-member="${esc(row.discord_id)}"` : ""} style="--c:${esc(color)}">
    <span class="tile-av">${avatarOnly(row.discord_id, "")}<span class="duty ${row.on_duty ? "on" : ""}"></span></span>
    <span class="tile-main"><b>${esc(nameOf(row.discord_id))}</b><small>${esc(sub)}</small><span class="tile-hours">${hoursBar(org, row)}</span></span>
    <span class="tile-side">${row.status !== "active" ? statusPill(row.status, row.status_note) : ""}${row.commendations ? `<span class="mini" title="Commendations">${icon("star")}${fmt(row.commendations)}</span>` : ""}${row.strikes ? `<span class="mini bad" title="Strikes">${icon("flag")}${fmt(row.strikes)}</span>` : ""}</span>
  </${tag}>`;
}

/** Leadership first, then every rank from the top, then unranked members. */
function rankGroups(org, rows) {
  const groups = [];
  const lead = rows.filter(isLeadership).sort((a, b) => Number(b.owner) - Number(a.owner) || Number(b.command) - Number(a.command));
  if (lead.length) groups.push({ label: "Leadership", color: "#ffbe5c", rows: lead });
  for (const rank of [...(org.ranks || [])].sort((a, b) => b.level - a.level)) {
    const list = rows.filter((row) => !isLeadership(row) && Number(row.rank_id) === Number(rank.id));
    if (list.length) groups.push({ label: rank.name, color: safeColor(rank.color, "#6f7e92"), rows: list, rank });
  }
  const rest = rows.filter((row) => !isLeadership(row) && !rankOf(org, row));
  if (rest.length) groups.push({ label: "Members", color: "#6f7e92", rows: rest });
  return groups;
}

function rosterBoard(org, rows, { interactive = true } = {}) {
  const divisions = org.divisions || [];
  const sections = [...divisions.map((division) => ({ ...division, rows: rows.filter((row) => row.division_id === division.id) })), { id: null, name: divisions.length ? "Unassigned" : "Roster", color: null, description: "", rows: rows.filter((row) => row.division_id == null || !divisions.some((d) => d.id === row.division_id)) }]
    .filter((section) => section.rows.length);
  if (!sections.length) return empty("Nobody here", "No member matches this filter.", "users");
  return `<div class="board">${sections.map((section) => `<section class="division" style="--c:${esc(safeColor(section.color, "#55c4ff"))}">
    <header><span class="division-dot"></span><div><h3>${esc(section.name)}</h3>${section.description ? `<p>${esc(section.description)}</p>` : ""}</div><span class="pill">${plural(section.rows.length, "member")}</span></header>
    ${rankGroups(org, section.rows).map((group) => `<div class="rank-group"><div class="rank-label" style="--c:${esc(group.color)}"><span></span>${esc(group.label)}<small>${fmt(group.rows.length)}</small></div><div class="tiles">${group.rows.map((row) => memberTile(org, row, { interactive })).join("")}</div></div>`).join("")}
  </section>`).join("")}</div>`;
}

function rosterTab(org) {
  const perms = org.perms || {};
  const all = org.roster || [];
  const divisions = org.divisions || [];
  const view = filter(`roster-view-${org.id}`, "board");
  const div = filter(`roster-div-${org.id}`, "all");
  const status = filter(`roster-status-${org.id}`, "all");
  const query = String(filter(`roster-q-${org.id}`, "")).trim().toLowerCase();
  const rows = all
    .filter((r) => div === "all" || (div === "none" ? r.division_id == null : String(r.division_id) === div))
    .filter((r) => status === "all" || (status === "duty" ? r.on_duty : status === "short" ? isShort(org, r) : r.status === status))
    .filter((r) => !query || nameOf(r.discord_id).toLowerCase().includes(query) || String(r.callsign || "").toLowerCase().includes(query) || r.discord_id.includes(query));
  const away = all.filter((r) => ["loa", "inactive", "suspended"].includes(r.status)).length;
  const short = all.filter((r) => isShort(org, r)).length;
  const table = `<div class="table-wrap"><table class="tbl"><thead><tr><th>Member</th><th>Callsign</th><th>Rank</th><th>Division</th><th>Status</th><th>Hours · 7d</th><th>Last shift</th><th class="right"></th></tr></thead><tbody>${rows.map((r) => `<tr>
      <td><span class="person" style="gap:12px"><span class="duty ${r.on_duty ? "on" : ""}"></span>${person(r.discord_id)}</span></td>
      <td class="mono">${esc(r.callsign || "—")}</td>
      <td>${rankPill(r, org)}</td>
      <td>${esc(divisions.find((d) => d.id === r.division_id)?.name || "—")}</td>
      <td>${statusPill(r.status, r.status_note)}</td>
      <td style="min-width:150px">${hoursBar(org, r)}</td>
      <td>${r.on_duty ? '<span class="pill pill-good">On duty</span>' : esc(ago(r.last_shift))}</td>
      <td class="right"><button class="btn btn-ghost btn-sm" type="button" data-member="${esc(r.discord_id)}">${icon("file")}File</button></td>
    </tr>`).join("")}</tbody></table></div>`;
  return `<div class="stack">
    <div class="stats">
      <div class="stat" style="--t:#35e2cd"><div class="ico">${icon("users")}</div><span>Members</span><strong>${fmt(all.length)}</strong><small>${plural(divisions.length, "division")} · ${plural((org.ranks || []).length, "rank")}</small></div>
      <div class="stat" style="--t:#3ddc97"><div class="ico">${icon("activity")}</div><span>On duty now</span><strong>${fmt(all.filter((r) => r.on_duty).length)}</strong><small>${hours(all.reduce((n, r) => n + r.week_seconds, 0))} this week</small></div>
      <div class="stat" style="--t:#55c4ff"><div class="ico">${icon("clock")}</div><span>Away</span><strong>${fmt(away)}</strong><small>Leave, inactive or suspended</small></div>
      <div class="stat" style="--t:#ff7a45"><div class="ico">${icon("alert")}</div><span>Below requirement</span><strong>${fmt(short)}</strong><small>Active members under their rank's weekly hours</small></div>
    </div>
    <section class="card">
      <div class="card-head"><div><h2>Roster</h2><p>Grouped by division and rank. Open anyone's file for their history, hours, callsign and status.</p></div>
        <div class="chips">${seg(`roster-view-${org.id}`, [["board", "Board"], ["table", "Table"]], view)}
          ${perms.ranks || perms.discipline ? `<button class="btn btn-glass btn-sm" type="button" data-dialog="divisions">${icon("board")}Divisions</button>` : ""}
          <a class="btn btn-glass btn-sm" href="/api/orgs/roster.csv?org=${encodeURIComponent(org.id)}" download>${icon("download")}Export CSV</a></div></div>
      <div class="roster-filters">
        ${divisions.length ? seg(`roster-div-${org.id}`, [["all", "All divisions"], ...divisions.map((d) => [String(d.id), d.name, d.members]), ["none", "Unassigned"]], div) : ""}
        ${seg(`roster-status-${org.id}`, [["all", "Everyone"], ["duty", "On duty"], ["active", "Active"], ["loa", "LOA"], ["probation", "Probation"], ["inactive", "Inactive"], ["suspended", "Suspended"], ["short", "Below hours", short]], status)}
        <label class="search">${icon("search")}<input data-search="roster-q-${org.id}" placeholder="Search name or callsign" value="${esc(filter(`roster-q-${org.id}`, ""))}" aria-label="Search members"></label>
      </div>
      ${!all.length ? empty("Nobody on the roster", "Members appear once they hold the organization's Discord role.", "users") : view === "table" ? (rows.length ? table : empty("Nobody here", "No member matches this filter.", "users")) : `<div style="padding:4px 22px 22px">${rosterBoard(org, rows)}</div>`}
    </section>
    <div class="grid-2"><section class="card"><div class="card-head"><div><h2>Leadership</h2><p>Owner, command and leaders have every permission.</p></div></div>${leadershipBody(org)}</section>
      <section class="card"><div class="card-head"><div><h2>Activity</h2><p>Recent roster changes.</p></div></div>${activityFeed(org, 8)}</section></div>
  </div>`;
}

/* ---------- member files ---------- */
async function memberFileDialog(org, discordId) {
  openDialog({ kicker: org.name, title: nameOf(discordId), wide: true, body: `<div class="boot" style="min-height:200px"><div class="spinner"></div><span>Loading member file</span></div>` });
  state.dialog.file = { orgId: org.id, discordId };
  let file;
  try { file = await api(`orgs/member?org=${encodeURIComponent(org.id)}&id=${encodeURIComponent(discordId)}`); }
  catch (error) { if (state.dialog?.file) $("#dialog-root .dialog-body").innerHTML = `<div class="callout warn">${icon("alert")}<div>${esc(error.message)}</div></div>`; return; }
  if (!state.dialog?.file || state.dialog.file.discordId !== discordId) return;
  state.data.people = { ...(state.data.people || {}), ...(file.people || {}) };
  const current = currentOrg() || org;
  const row = (current.roster || []).find((r) => r.discord_id === discordId) || {};
  const perms = current.perms || {};
  const divisions = current.divisions || [];
  const max = Math.max(1, ...file.weeks.map((w) => w.seconds), (file.member?.minWeeklyMinutes || 0) * 60);
  const need = file.member?.minWeeklyMinutes ? file.member.minWeeklyMinutes * 60 : null;
  const canRank = perms.roster && (perms.full || (!row.leader && !row.owner && !row.command && Number(row.level || 0) < perms.level && discordId !== state.data.user?.id));
  const p = file.profile;
  $("#dialog-title").textContent = nameOf(discordId);
  $("#dialog-root .dialog-body").innerHTML = `
    <div class="file-head">${avatarOnly(discordId, "av-lg")}<div><div class="chips">${rankPill(row.discord_id ? row : { rank_id: file.member?.rankId, leader: file.member?.leader }, current)}${p.callsign ? `<span class="pill mono">${esc(p.callsign)}</span>` : ""}${p.divisionId ? `<span class="pill">${esc(divisions.find((d) => d.id === p.divisionId)?.name || "Division")}</span>` : ""}${statusPill(p.status, p.statusNote)}</div>
      <small class="muted">${file.member ? `Joined ${esc(day(file.member.joinedAt))}` : "No longer holds the access role"}${p.statusNote ? ` · ${esc(p.statusNote)}` : ""}${p.statusUntil ? ` · until ${esc(day(p.statusUntil))}` : ""}</small></div>
      ${canRank ? `<button class="btn btn-glass btn-sm" type="button" data-dialog="member" data-id="${esc(discordId)}" style="margin-left:auto">${icon("edit")}Set rank</button>` : ""}</div>
    <div class="field">Duty hours · last 6 weeks${need ? ` <small>(rank requires ${(need / 3600).toFixed(1)}h a week)</small>` : ""}
      <div class="chart">${need ? `<span class="chart-need" style="bottom:${(need / max) * 100}%"></span>` : ""}${file.weeks.map((w, i) => `<div class="chart-col"><i style="height:${Math.max(2, (w.seconds / max) * 100)}%" class="${need && w.seconds >= need ? "met" : ""}"></i><small>${hours(w.seconds)}</small><em>${i === file.weeks.length - 1 ? "This wk" : `${file.weeks.length - 1 - i}w ago`}</em></div>`).join("")}</div></div>
    ${file.canEdit ? `<div class="file-edit">
      <div class="row-2"><label class="field">Callsign<input name="callsign" maxlength="16" value="${esc(p.callsign || "")}" placeholder="1A-21"></label>
        <label class="field">Division<select name="divisionId"><option value="">Unassigned</option>${divisions.map((d) => `<option value="${d.id}" ${d.id === p.divisionId ? "selected" : ""}>${esc(d.name)}</option>`).join("")}</select></label></div>
      <div class="row-2"><label class="field">Status<select name="status">${Object.entries(STATUS).map(([key, [label]]) => `<option value="${key}" ${key === p.status ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></label>
        <label class="field">Until <small>(optional)</small><input name="statusUntil" type="date" value="${p.statusUntil ? new Date(p.statusUntil).toISOString().slice(0, 10) : ""}"></label></div>
      <label class="field">Status note <small>(optional)</small><input name="statusNote" maxlength="160" value="${esc(p.statusNote || "")}" placeholder="Out of town until the 24th"></label>
      <div style="display:flex;justify-content:flex-end"><button class="btn btn-org btn-sm" type="button" data-file-save>${icon("check")}Save details</button></div>
    </div>
    <div class="file-edit">
      <div class="row-2"><label class="field">Add to file<select name="recordKind"><option value="commendation">Commendation</option><option value="strike">Strike</option><option value="note">Leadership note (private)</option></select></label><span></span></div>
      <label class="field">Reason<textarea name="recordBody" maxlength="500" placeholder="Handled the Paleto pursuit by the book."></textarea></label>
      <div style="display:flex;justify-content:flex-end"><button class="btn btn-glass btn-sm" type="button" data-file-record>${icon("plus")}Add to file</button></div>
    </div>` : ""}
    <div class="field">History<div class="timeline">${file.records.length ? file.records.map((r) => { const [ico, color, label] = RECORD_STYLE[r.kind] || RECORD_STYLE.note; return `<div class="tl-row${r.revoked ? " revoked" : ""}"><span class="feed-ico" style="--t:${color}">${icon(ico)}</span><div class="txt"><b>${esc(label)}${r.revoked ? " · revoked" : ""}</b><span>${esc(r.body)}</span><small>${esc(nameOf(r.actor_id))} · ${esc(ago(r.created_at))}</small></div>${file.canEdit && !r.revoked && !["promotion", "demotion"].includes(r.kind) ? `<button class="btn btn-ghost btn-sm" type="button" data-record-revoke="${r.id}">Revoke</button>` : ""}</div>`; }).join("") : `<p class="muted" style="font-size:13px">Nothing on file yet.</p>`}</div></div>`;
}

async function fileAction(name, input, message) {
  const file = state.dialog?.file;
  if (!file) return;
  const org = myOrgs().find((o) => Number(o.id) === Number(file.orgId));
  try {
    await act(name, { orgId: file.orgId, discordId: file.discordId, ...input }, message);
    memberFileDialog(currentOrg() || org, file.discordId);
  } catch (error) { toast(error.message, true); }
}

function divisionsDialog(org) {
  const divisions = org.divisions || [];
  openDialog({ kicker: org.name, title: "Divisions", submit: "Add division",
    body: `${divisions.length ? `<div class="card" style="box-shadow:none"><div class="feed">${divisions.map((d) => `<div class="feed-row"><span class="feed-ico" style="--t:${esc(safeColor(d.color, "#55c4ff"))}">${icon("board")}</span><div class="txt"><b>${esc(d.name)}</b><small>${esc(d.description || plural(d.members, "member"))}</small></div><div class="end"><button class="btn btn-ghost btn-sm" type="button" data-division-edit="${d.id}">Edit</button><button class="btn btn-ghost btn-sm" type="button" data-division-delete="${d.id}" style="color:var(--bad)">Delete</button></div></div>`).join("")}</div></div>` : `<div class="callout">${icon("info")}<div>Divisions are units, sections or crews (Patrol, SWAT, Traffic, Kitchen staff…). Assign members to them from their file.</div></div>`}
      <input type="hidden" name="divisionId" value="">
      <div class="row-2"><label class="field">Name<input name="name" minlength="2" maxlength="40" required placeholder="Patrol Division"></label><label class="field">Colour<input type="color" name="color" value="#55c4ff" style="height:42px;padding:4px"></label></div>
      <label class="field">Description <small>(optional)</small><input name="description" maxlength="160" placeholder="Uniformed patrol and calls for service"></label>`,
    onSubmit: (form) => act("division", { orgId: org.id, divisionId: form.get("divisionId") || null, name: form.get("name"), color: form.get("color"), description: form.get("description") }, (r) => `Saved ${r.name}.`) });
}

/* ---------- announcements ---------- */
function announcementsCard(org, limit = 4) {
  const perms = org.perms || {};
  const rows = (org.announcements || []).slice(0, limit);
  return `<section class="card"><div class="card-head"><div><h2>Announcements</h2><p>News and orders from leadership.</p></div>${perms.announce ? `<button class="btn btn-glass btn-sm" type="button" data-dialog="announce">${icon("plus")}Post</button>` : ""}</div>
    ${rows.length ? `<div class="announcements">${rows.map((a) => `<article class="announce${a.pinned ? " pinned" : ""}"><header>${a.pinned ? `<span class="pill pill-leader">${icon("pin2")}Pinned</span>` : ""}<h3>${esc(a.title)}</h3>${perms.announce ? `<span class="end"><button class="icon-btn" type="button" data-dialog="announce" data-id="${a.id}" aria-label="Edit">${icon("edit")}</button><button class="icon-btn" type="button" data-announce-delete="${a.id}" aria-label="Delete">${icon("trash")}</button></span>` : ""}</header><p>${esc(a.body)}</p><footer>${avatarOnly(a.author_id)}<span>${esc(nameOf(a.author_id))} · ${esc(ago(a.created_at))}</span></footer></article>`).join("")}</div>` : empty("No announcements", perms.announce ? "Post the first one for your members." : "Leadership has not posted anything yet.", "megaphone")}</section>`;
}

function announceDialog(org, id) {
  const row = (org.announcements || []).find((a) => String(a.id) === String(id));
  openDialog({ kicker: org.name, title: row ? "Edit announcement" : "New announcement", submit: row ? "Save" : "Post",
    body: `<label class="field">Title<input name="title" minlength="3" maxlength="120" required value="${esc(row?.title || "")}" placeholder="Saturday training at the academy"></label>
      <label class="field">Message<textarea name="body" minlength="3" maxlength="2000" required style="min-height:150px">${esc(row?.body || "")}</textarea></label>
      <label class="perm-toggle"><input type="checkbox" name="pinned" ${row?.pinned ? "checked" : ""}><span><b>Pin to the top</b><small>Pinned announcements stay first.</small></span></label>`,
    onSubmit: (form) => act("announce", { orgId: org.id, announcementId: row?.id || null, title: form.get("title"), body: form.get("body"), pinned: form.get("pinned") === "on" }, row ? "Announcement saved." : "Announcement posted.") });
}

function leaderboard(org) {
  const top = [...(org.roster || [])].filter((r) => r.week_seconds > 0).sort((a, b) => b.week_seconds - a.week_seconds).slice(0, 6);
  return `<section class="card"><div class="card-head"><div><h2>Top hours this week</h2><p>Duty time across the roster.</p></div></div>${top.length ? `<div class="feed">${top.map((r, i) => `<div class="feed-row"><span class="place p${i + 1}">${i + 1}</span>${person(r.discord_id, { sub: r.callsign || rankOf(org, r)?.name || (isLeadership(r) ? "Leadership" : "Member") })}<div class="end"><span class="amount up">${hours(r.week_seconds)}</span></div></div>`).join("")}</div>` : empty("No duty time yet", "Clock in with /duty to climb the board.", "clock")}</section>`;
}

/* ---------- hours ---------- */
function hoursTab(org) {
  const rows = (org.hours?.rows || []);
  const week = rows.reduce((n, r) => n + r.week, 0);
  const month = rows.reduce((n, r) => n + r.month, 0);
  const goalOf = (row) => { const rank = rankOf(org, (org.roster || []).find((m) => m.discord_id === row.discord_id) || {}); return rank?.min_weekly_minutes ? Number(rank.min_weekly_minutes) * 60 : 0; };
  const active = rows.filter((r) => r.week > 0).length;
  const top = Math.max(1, ...rows.map((r) => r.month));
  const stats = [["clock", "#35e2cd", "Duty hours · 7d", hours(week), `${plural(active, "member")} on the clock`],
    ["activity", "#8f7cff", "Duty hours · 30d", hours(month), `${plural(rows.reduce((n, r) => n + r.shifts, 0), "shift")}`],
    ["users", "#3ddc97", "Average per active member", hours(active ? week / active : 0), "Over the last 7 days"]];
  return `<div class="stack">
    <div class="stats">${stats.map(([ico, tone, label, value, sub]) => `<div class="stat" style="--t:${tone}"><div class="ico">${icon(ico)}</div><span>${esc(label)}</span><strong>${value}</strong><small>${esc(sub)}</small></div>`).join("")}</div>
    <section class="card"><div class="card-head"><div><h2>Duty hours leaderboard</h2><p>Every member who clocked in over the last 30 days. Ranks with a weekly goal show whether it was met.</p></div></div>
      ${rows.length ? `<div class="feed">${rows.map((r, i) => { const goal = goalOf(r); const met = goal ? r.week >= goal : null;
        return `<div class="feed-row"><span class="place p${i + 1 <= 3 ? i + 1 : 0}">${i + 1}</span>${person(r.discord_id, { sub: `${plural(r.shifts, "shift")} · ${hours(r.week)} this week${goal ? ` · goal ${hours(goal)}` : ""}` })}
          <div class="end">${met === null ? "" : `<span class="pill ${met ? "pill-good" : "pill-warn"}">${met ? "Goal met" : "Under goal"}</span>`}<span class="amount up">${hours(r.month)}</span></div>
          <div class="bar" style="grid-column:1/-1;height:4px;border-radius:99px;background:var(--line,#ffffff14);overflow:hidden"><i style="display:block;height:100%;width:${Math.round(r.month / top * 100)}%;background:var(--org)"></i></div></div>`; }).join("")}</div>` : empty("No duty time yet", "Members clock in with /duty. Their hours show up here.", "clock")}</section>
  </div>`;
}

/* ---------- events ---------- */
const upcomingEvents = (org) => (org.events || []).filter((e) => !e.cancelled && e.starts_at >= Date.now() - 12 * 3600000);
const eventWhen = (value) => new Date(Number(value)).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const toLocalInput = (value) => { const d = new Date(Number(value)); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

function eventsTab(org) {
  const perms = org.perms || {};
  const upcoming = upcomingEvents(org);
  const canJoin = perms.member || perms.full;
  const card = (e) => `<article class="card event" style="--org:${esc(safeColor(org.color))}"><div class="card-body">
      <header style="display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap"><div><span class="pill">${icon("calendar")}${esc(eventWhen(e.starts_at))}</span><h3 style="margin-top:8px">${esc(e.title)}</h3>${e.location ? `<p class="muted">${icon("pin")} ${esc(e.location)}</p>` : ""}</div>
        ${perms.announce ? `<span class="end"><button class="icon-btn" type="button" data-dialog="event" data-id="${e.id}" aria-label="Edit">${icon("edit")}</button><button class="icon-btn" type="button" data-event-cancel="${e.id}" aria-label="Cancel event">${icon("trash")}</button></span>` : ""}</header>
      ${e.description ? `<p style="margin-top:10px;white-space:pre-wrap">${esc(e.description)}</p>` : ""}
      <footer style="display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-top:14px">
        <span class="chips"><span class="pill pill-good">${fmt(e.counts.going)} going</span><span class="pill">${fmt(e.counts.maybe)} maybe</span><span class="pill pill-warn">${fmt(e.counts.no)} can't</span><span class="stack-av">${e.going.slice(0, 8).map((id) => avatarOnly(id)).join("")}</span></span>
        ${canJoin ? `<span class="chips">${[["going", "Going"], ["maybe", "Maybe"], ["no", "Can't"]].map(([key, label]) => `<button class="btn ${e.mine === key ? "btn-org" : "btn-glass"} btn-sm" type="button" data-event-rsvp="${e.id}" data-response="${key}">${label}</button>`).join("")}</span>` : ""}
      </footer></div></article>`;
  return `<div class="stack">
    <section class="card"><div class="card-head"><div><h2>Events</h2><p>Trainings, meetings and operations. Members answer so leadership can plan.</p></div>${perms.announce ? `<button class="btn btn-org btn-sm" type="button" data-dialog="event">${icon("plus")}New event</button>` : ""}</div></section>
    ${upcoming.length ? upcoming.map(card).join("") : `<section class="card">${empty("Nothing planned", perms.announce ? "Plan the first event for your members." : "Leadership has not scheduled anything yet.", "calendar")}</section>`}
  </div>`;
}

function eventDialog(org, id) {
  const row = (org.events || []).find((e) => String(e.id) === String(id));
  const soon = row?.starts_at || Date.now() + 86400000;
  openDialog({ kicker: org.name, title: row ? "Edit event" : "New event", submit: row ? "Save" : "Schedule",
    body: `<label class="field">Title<input name="title" minlength="3" maxlength="80" required value="${esc(row?.title || "")}" placeholder="Academy training"></label>
      <div class="row-2"><label class="field">Date and time<input type="datetime-local" name="when" required value="${esc(toLocalInput(soon))}"></label><label class="field">Location <small>(optional)</small><input name="location" maxlength="80" value="${esc(row?.location || "")}" placeholder="Mission Row, briefing room"></label></div>
      <label class="field">Details <small>(optional)</small><textarea name="description" maxlength="1000" style="min-height:120px">${esc(row?.description || "")}</textarea></label>`,
    onSubmit: (form) => act("event", { orgId: org.id, eventId: row?.id || null, title: form.get("title"), startsAt: new Date(form.get("when")).getTime(), location: form.get("location"), description: form.get("description") }, row ? "Event saved." : "Event scheduled.") });
}

/* ---------- applications ---------- */
function applicationsTab(org) {
  const perms = org.perms || {};
  if (!perms.applications) return `<section class="card">${empty("Applications are private", "Your rank cannot review applications.", "inbox")}</section>`;
  const pending = (org.applications || []).filter((a) => a.status === "pending");
  const reviewed = (org.applications || []).filter((a) => a.status !== "pending");
  const profile = org.profile || {};
  return `<div class="stack">
    <div class="callout ${profile.recruiting ? "org" : "warn"}">${icon(profile.recruiting ? "check" : "alert")}<div>${profile.recruiting ? `<b>Recruitment is open.</b> Anyone can apply from your <a href="${publicHref(org)}" style="text-decoration:underline">public page</a> with ${plural((profile.questions || []).length, "question")}.` : "<b>Recruitment is closed.</b> Open it and write your questions in Settings."}${perms.profile ? ` <a href="${orgHref(org, "settings")}" style="text-decoration:underline">Edit recruitment</a>` : ""}</div></div>
    <section class="card"><div class="card-head"><div><h2>Pending</h2><p>Accept or deny. The applicant gets a Discord DM with your note.</p></div><span class="pill">${fmt(pending.length)}</span></div>
      ${pending.length ? `<div class="apps">${pending.map((a) => `<article class="app" data-app="${a.id}">
        <header>${person(a.discord_id, { sub: `Applied ${ago(a.created_at)}` })}</header>
        <dl>${(a.answers || []).map((qa) => `<dt>${esc(qa.question)}</dt><dd>${esc(qa.answer)}</dd>`).join("")}</dl>
        <label class="field">Note to the applicant <small>(optional)</small><input name="note-${a.id}" maxlength="500" placeholder="Welcome aboard, see you at orientation"></label>
        <div class="chips" style="justify-content:flex-end"><button class="btn btn-ghost btn-sm" type="button" data-app-review="${a.id}" data-decision="denied" style="color:var(--bad)">Deny</button><button class="btn btn-org btn-sm" type="button" data-app-review="${a.id}" data-decision="accepted">${icon("check")}Accept</button></div>
      </article>`).join("")}</div>` : empty("No pending applications", profile.recruiting ? "New applications show up here." : "Open recruitment to start receiving applications.", "inbox")}</section>
    ${reviewed.length ? `<section class="card"><div class="card-head"><div><h2>Reviewed · 30 days</h2></div></div><div class="feed">${reviewed.map((a) => `<div class="feed-row">${person(a.discord_id, { sub: a.review_note || "No note" })}<div class="end"><span class="pill ${a.status === "accepted" ? "pill-good" : a.status === "denied" ? "pill-warn" : ""}">${esc(titleCase(a.status))}</span><time>${esc(a.reviewer_id ? `${nameOf(a.reviewer_id)} · ` : "")}${esc(ago(a.reviewed_at))}</time></div></div>`).join("")}</div></section>` : ""}
  </div>`;
}

/* ---------- public organization page ---------- */
function publicPage(page) {
  const { org, profile } = page;
  const mine = findMine(org.slug) || findMine(org.id);
  const pub = findPublic(org.slug) || {};
  const application = (state.data?.applications || []).find((a) => Number(a.org_id) === Number(org.id) && a.status === "pending");
  const fake = { ...org, ranks: page.ranks, divisions: page.divisions, leadership: null };
  const rows = page.roster.map((r, i) => ({ ...r, discord_id: `p${i}`, rank_id: r.rankId, division_id: r.divisionId, on_duty: r.onDuty, week_seconds: 0 }));
  const people = Object.fromEntries(rows.map((r) => [r.discord_id, { name: r.name, avatar: r.avatar }]));
  const board = profile.publicRoster && rows.length ? withPeople(people, () => rosterBoard(fake, rows, { interactive: false })) : "";
  return `<div class="reveal stack" style="margin-top:10px">
    <section class="org-hero" style="--org:${esc(safeColor(org.color))}"><div class="row">${mark(org, "mark-lg")}<div class="who"><small>${esc(TYPE_LABEL[org.type] || titleCase(org.type))}</small><h1>${esc(org.name)}</h1>${profile.tagline ? `<p class="tagline">${esc(profile.tagline)}</p>` : ""}
      <div class="badges"><span class="pill">${icon("users")}${plural(pub.members ?? rows.length, "member")}</span>${pub.onDuty ? `<span class="pill pill-good"><span class="live-dot"></span>${fmt(pub.onDuty)} on duty</span>` : ""}${profile.recruiting ? `<span class="pill pill-good">${icon("check")}Recruiting</span>` : `<span class="pill">Not recruiting</span>`}</div></div></div>
      <div class="org-actions">${mine ? `<a class="btn btn-org btn-sm" href="${orgHref(mine)}">${icon("home")}Open workspace</a>` : ""}
        ${profile.recruiting && !mine ? (state.signedIn ? (application ? `<span class="pill pill-warn">${icon("clock")}Application pending</span>` : `<button class="btn btn-sun btn-sm" type="button" data-apply="${org.id}">${icon("send")}Apply to join</button>`) : `<a class="btn btn-discord btn-sm" href="${esc(signInUrl())}">${icon("discord")}Sign in to apply</a>`) : ""}
        ${profile.discordInvite ? `<a class="btn btn-glass btn-sm" href="${esc(profile.discordInvite)}" target="_blank" rel="noopener">${icon("discord")}Discord</a>` : ""}</div></section>
    ${profile.about ? `<section class="card"><div class="card-head"><div><h2>About</h2></div></div><div class="card-body about">${esc(profile.about)}</div></section>` : ""}
    ${profile.publicRoster ? `<section class="card"><div class="card-head"><div><h2>Roster</h2><p>${plural(rows.length, "member")}${page.divisions.length ? ` across ${plural(page.divisions.length, "division")}` : ""}.</p></div></div><div style="padding:4px 22px 22px">${board || empty("No members yet", "This organization's roster is empty.", "users")}</div></section>` : `<section class="card">${empty("Roster is private", "This organization keeps its roster to members.", "users")}</section>`}
    ${footer()}
  </div>`;
}
/** Render with a temporary people map (the public roster has no Discord IDs). */
function withPeople(people, fn) {
  const holder = state.data || (state.data = { people: {}, __temp: true });
  const before = holder.people;
  holder.people = { ...(before || {}), ...people };
  try { return fn(); } finally { holder.people = before; if (holder.__temp) state.data = null; }
}

function applyDialog(page) {
  const { org, profile } = page;
  openDialog({ kicker: "Apply to join", title: org.name, submit: "Send application", tone: "btn-sun",
    body: `${(profile.questions || []).map((q, i) => `<label class="field">${esc(q)}<textarea name="answer-${i}" required minlength="2" maxlength="1000"></textarea></label>`).join("")}
      <div class="callout">${icon("info")}<div>Leadership reviews your answers and you get a Discord DM with the decision.</div></div>`,
    onSubmit: async (form) => {
      await act("apply", { orgId: org.id, answers: (profile.questions || []).map((_, i) => form.get(`answer-${i}`)) }, `Application sent to ${org.name}.`);
    } });
}

/* ---------- ranks ---------- *//* ---------- ranks ---------- */
function rankOrder(org) {
  const base = (org.ranks || []).map((r) => r.id);
  if (!state.rankOrder || state.rankOrder.org !== org.id || state.rankOrder.ids.length !== base.length || state.rankOrder.ids.some((id) => !base.includes(id))) return base;
  return state.rankOrder.ids;
}

function ranksTab(org) {
  const perms = org.perms || {};
  const permissions = state.data?.economy?.permissions || [];
  const order = rankOrder(org);
  const byId = new Map((org.ranks || []).map((r) => [r.id, r]));
  const changed = state.rankOrder?.org === org.id && order.join() !== (org.ranks || []).map((r) => r.id).join();
  const permChips = (rank) => {
    const granted = permissions.filter((p) => rank[p.column]);
    const req = rank.min_weekly_minutes ? `<span class="perm">${icon("clock")}${(rank.min_weekly_minutes / 60).toFixed(1)}h a week</span>` : "";
    return (granted.length ? granted.map((p) => `<span class="perm">${icon("check")}${esc(p.label)}${p.key === "spend" && rank.spend_limit != null ? ` · ${money(rank.spend_limit)}/day` : ""}</span>`).join("") : `<span class="perm" style="color:var(--ink-3)">No permissions</span>`) + req;
  };
  const fixed = [
    org.leadership?.ownerId ? `<div class="rung fixed" style="--c:#ff7a45"><div class="lvl">${icon("crown")}</div><div><h3>Owner</h3><p>Set by ${esc(org.leadership.command || "the manager bot")}. Every permission.</p></div><div class="side">${avatarOnly(org.leadership.ownerId, "")}</div></div>` : "",
    org.leadership?.commandRole ? `<div class="rung fixed" style="--c:${esc(safeColor(org.leadership.commandRole.color, "#8f7cff"))}"><div class="lvl">${icon("shield")}</div><div><h3>Command <span class="role-chip" style="--c:${esc(safeColor(org.leadership.commandRole.color, "#8f7cff"))}">${esc(org.leadership.commandRole.name)}</span></h3><p>Holders of the command role run the roster and ranks.</p></div><div class="side"><span class="stack-av">${(org.leadership.commandMembers || []).slice(0, 5).map((id) => avatarOnly(id)).join("")}</span></div></div>` : "",
    `<div class="rung fixed"><div class="lvl">100<small>LVL</small></div><div><h3>Leader</h3><p>Every permission. Appointed by the owner, command or staff.</p></div><div class="side"><div class="count"><strong>${fmt((org.leaders || []).length)}</strong><small>members</small></div></div></div>`,
  ].join("");
  return `<div class="stack">
    <section class="card">
      <div class="card-head"><div><h2>Rank ladder</h2><p>Higher levels outrank lower ones. Members can only manage ranks below their own. Bound Discord roles follow each member's rank.</p></div>
        <div class="chips">${changed ? `<button class="btn btn-ghost btn-sm" type="button" data-rank-reset>Reset</button><button class="btn btn-org btn-sm" type="button" data-rank-save>${icon("check")}Save order</button>` : ""}${perms.ranks ? `<button class="btn btn-sun btn-sm" type="button" data-dialog="rank" data-id="new">${icon("plus")}New rank</button>` : ""}</div></div>
      <div class="ladder">${fixed}
        ${order.map((id, index) => {
          const rank = byId.get(id);
          if (!rank) return "";
          const canEdit = perms.ranks && (perms.full || rank.level < perms.level);
          return `<div class="rung" style="--c:${esc(safeColor(rank.color, "#6f7e92"))}">
            <div class="lvl">${changed ? index + 1 : rank.level}<small>${changed ? "POS" : "LVL"}</small></div>
            <div style="min-width:0"><h3>${esc(rank.name)}${(rank.roles || []).map((role) => `<span class="role-chip" style="--c:${esc(safeColor(role.color, "#99aab5"))}" title="${esc(role.guildName || "")}">${esc(role.name)}</span>`).join("")}</h3>${rank.description ? `<p>${esc(rank.description)}</p>` : ""}<div class="perms">${permChips(rank)}</div></div>
            <div class="side"><div class="count"><strong>${fmt(rank.members)}</strong><small>member${rank.members === 1 ? "" : "s"}</small></div>
              ${perms.full ? `<button class="icon-btn" type="button" data-rank-move="${rank.id}" data-dir="-1" title="Move up" aria-label="Move ${esc(rank.name)} up" ${index === 0 ? "disabled" : ""}>${icon("up")}</button><button class="icon-btn" type="button" data-rank-move="${rank.id}" data-dir="1" title="Move down" aria-label="Move ${esc(rank.name)} down" ${index === order.length - 1 ? "disabled" : ""}>${icon("down")}</button>` : ""}
              ${canEdit ? `<button class="btn btn-glass btn-sm" type="button" data-dialog="rank" data-id="${rank.id}">${icon("edit")}Edit</button>` : ""}</div>
          </div>`;
        }).join("")}
        <div class="rung fixed" style="--c:#6f7e92"><div class="lvl">0<small>LVL</small></div><div><h3>Member</h3><p>Holds the access role without a rank: ledger, armory and garage.</p></div><div class="side"><div class="count"><strong>${fmt((org.roster || []).filter((r) => !r.rank_id && !r.leader).length)}</strong><small>members</small></div></div></div>
      </div>
      ${!(org.ranks || []).length ? `<div style="padding:0 22px 22px">${empty("No custom ranks yet", perms.ranks ? "Create ranks to give members spending, roster, rank editing or equipment access, and bind Discord roles to them." : "The owner, command and leaders can add ranks here.", "ladder")}</div>` : ""}
    </section>
    ${perms.full ? rosterSync(org) : ""}
  </div>`;
}

function rosterSync(org) {
  const settings = org.rosterSettings || { roleSync: true, autoRank: false };
  const bound = (org.ranks || []).some((r) => (r.roles || []).length);
  return `<section class="card"><div class="card-head"><div><h2>Discord role sync</h2><p>How ranks and their bound Discord roles stay in step.</p></div></div>
    <form class="card-body" data-form="settings">
      <div class="toggle-row"><div><b>Give and remove rank roles</b><small>When a rank changes here, the member gets that rank's Discord roles and loses every other rank's roles.</small></div><label class="switch"><input type="checkbox" name="roleSync" ${settings.roleSync ? "checked" : ""}><span></span></label></div>
      <div class="toggle-row"><div><b>Auto-rank from Discord</b><small>Every 5 minutes, rank members by the highest bound role they hold. Giving someone a rank role in Discord ranks them here.</small></div><label class="switch"><input type="checkbox" name="autoRank" ${settings.autoRank ? "checked" : ""}><span></span></label></div>
      <div class="toggle-row"><div><b>Import ranks now</b><small>${bound ? "Rank every member by the bound roles they currently hold. Members without a bound role keep their rank." : "Bind a Discord role to at least one rank first."}</small></div><button class="btn btn-glass btn-sm" type="button" data-import ${bound ? "" : "disabled"}>${icon("sync")}Import from Discord</button></div>
      <div style="display:flex;justify-content:flex-end;margin-top:6px"><button class="btn btn-org btn-sm" type="submit">${icon("check")}Save sync settings</button></div>
    </form></section>`;
}

/* ---------- shop ---------- */
function shopTab(org) {
  const eco = state.data.economy;
  const perms = org.perms || {};
  const kind = filter("shop-kind", "property");
  const rows = (eco.shop || []).filter((row) => row.kind === kind && row.org_types.includes(org.type));
  const owned = new Set((org.purchases || []).map((row) => row.item_key));
  const itemLabel = (key) => (eco.shop || []).find((row) => row.item_key === key)?.label || key;
  const card = (row) => {
    const mine = owned.has(row.item_key);
    const ownerName = eco.owners?.[row.item_key];
    const taken = row.kind === "property" && ownerName && !mine;
    const left = row.stock == null ? null : Math.max(0, Number(row.stock) - Number(eco.ownedCount?.[row.item_key] || 0));
    const soldOut = !mine && left === 0;
    const locked = !mine && row.requires && !owned.has(row.requires);
    const short = Number(org.wallet?.balance || 0) < Number(row.price);
    const data = row.data || {};
    const facts = row.kind === "property" ? [BUSINESS_LABEL[data.business] || titleCase(data.business), data.area, data.drug ? `${titleCase(data.drug)} lab` : null]
      : row.kind === "vehicle" ? [data.model] : row.kind === "weapon" ? (data.weapons || []).map((w) => titleCase(String(w.name).replace(/^WEAPON_/, "").toLowerCase()))
      : row.kind === "perk" ? [`+${data.value}${data.perk === "capacity" ? " units" : "%"}`] : [];
    if (left != null) facts.push(soldOut ? "Sold out" : `${left} of ${row.stock} left`);
    if (row.requires) facts.push(`Requires ${itemLabel(row.requires)}`);
    const action = mine ? (perms.sell ? `<button class="btn btn-ghost btn-sm" type="button" data-sell="${esc(row.item_key)}">Sell · 50%</button>` : `<span class="pill pill-good">${icon("check")}Owned</span>`)
      : taken ? `<span class="pill" title="Owned by ${esc(ownerName)}">Owned by ${esc(ownerName)}</span>`
      : soldOut ? `<span class="pill">Sold out</span>`
      : locked ? `<span class="pill" title="Buy ${esc(itemLabel(row.requires))} first">Locked</span>`
      : perms.spend ? `<button class="btn ${short ? "btn-ghost" : "btn-sun"} btn-sm" type="button" data-buy="${esc(row.item_key)}" ${short ? 'disabled title="Not enough money"' : ""}>Buy</button>` : "";
    return `<article class="shop-card${mine ? " owned" : ""}${taken || soldOut || locked ? " taken" : ""}">
      <div class="head"><span class="feed-ico" style="--t:${KIND_TONE[row.kind] || "#ff7a45"}">${icon(KIND_ICON[row.kind] || "sparkle")}</span><div><b>${esc(row.label)}</b><p>${esc(row.description)}</p></div></div>
      <div class="chips">${facts.filter(Boolean).map((f) => `<span class="pill">${esc(f)}</span>`).join("")}</div>
      <div class="foot"><span class="price">${money(row.price)}</span>${action}</div>
    </article>`;
  };
  return `<div class="stack">
    <section class="card">
      <div class="card-head"><div><h2>Organization shop</h2><p>${perms.spend ? `Purchases apply in game instantly.${perms.spendLimit != null ? ` Your rank may spend ${money(perms.spendLimit)} a day.` : ""}` : "Your rank cannot buy. Ask a rank with spending to pick something up."}</p></div>
        ${seg("shop-kind", Object.entries(eco.kinds || {}).map(([key, label]) => [key, label, (eco.shop || []).filter((row) => row.kind === key && row.org_types.includes(org.type)).length]), kind)}</div>
      <div class="shop-grid">${rows.map(card).join("") || empty("Nothing in this aisle", "No items of this kind are available to this organization type.", "sparkle")}</div>
    </section>
    ${(org.properties || []).length ? propertyGuide(org) : ""}
  </div>`;
}

function propertyGuide(org) {
  const pending = (org.properties || []).filter((p) => p.setup_status === "pending");
  return `<section class="card"><div class="card-head"><div><h2>How property setup works</h2><p>DevOps sets every property up for you. You never place anything yourself.</p></div></div>
    <div class="card-body stack" style="gap:12px">
      ${pending.length ? `<div class="callout warn">${icon("clock")}<div><b>${esc(pending.map((p) => p.label || p.item_key).join(", "))} ${pending.length === 1 ? "is" : "are"} pending from DevOps.</b> The team was notified when you bought ${pending.length === 1 ? "it" : "them"}. ${pending.length === 1 ? "It" : "They"} cannot be used, and the doors stay locked, until DevOps marks the property as set up. The organization owner gets a DM the moment that happens.</div></div>` : `<div class="callout">${icon("info")}<div>When you buy a property, DevOps is notified and places its spots. The property stays locked and unusable until they mark it as set up, and the organization owner gets a DM when it is ready.</div></div>`}
      <div class="callout">${icon("info")}<div>Once it is set up, members of ${esc(org.name)} lock and unlock a door by walking up to it: a small lock icon shows whether it is locked, and <kbd>E</kbd> flips that one door.</div></div>
    </div>
    <div class="feed">${PROPERTY_SPOTS.map(([name, text]) => `<div class="feed-row"><span class="feed-ico">${icon("pin")}</span><div class="txt"><b class="mono">${esc(name)}</b><small style="white-space:normal">${esc(text)}</small></div></div>`).join("")}</div></section>`;
}

/* ---------- ledger ---------- */
function ledgerTab(org) {
  const perms = org.perms || {};
  return `<div class="stack">
    <div class="stats">
      <div class="stat" style="--t:#35e2cd"><div class="ico">${icon("wallet")}</div><span>Balance</span><strong>${money(org.wallet?.balance)}</strong><small>Updated ${esc(ago(org.wallet?.updated_at))}</small></div>
      <div class="stat" style="--t:#3ddc97"><div class="ico">${icon("trend")}</div><span>Lifetime earned</span><strong>${money(org.wallet?.lifetime_earned)}</strong><small>All sources</small></div>
      <div class="stat" style="--t:#ff7a45"><div class="ico">${icon("send")}</div><span>Lifetime spent</span><strong>${money(org.wallet?.lifetime_spent)}</strong><small>${plural((org.purchases || []).length, "item")} owned</small></div>
      <div class="stat" style="--t:#ffbe5c"><div class="ico">${icon("badge")}</div><span>Your spending</span><strong>${perms.spend ? (perms.spendLimit != null ? money(perms.spendLimit) : "Unlimited") : "None"}</strong><small>${perms.spend ? "Per day" : "Your rank cannot spend"}</small></div>
    </div>
    <section class="card"><div class="card-head"><div><h2>Ledger</h2><p>The last 40 transactions in and out of the wallet.</p></div><div class="chips">${perms.spend ? `<button class="btn btn-org btn-sm" type="button" data-dialog="transfer">${icon("send")}Transfer</button>` : ""}${perms.manage ? `<button class="btn btn-glass btn-sm" type="button" data-dialog="adjust">${icon("wallet")}Adjust</button>` : ""}</div></div>${ledgerFeed(org, 40)}</section>
  </div>`;
}

/* ---------- settings ---------- */
function profileEditor(org) {
  const perms = org.perms || {};
  const p = org.profile || {};
  if (!perms.profile) return `<section class="card"><div class="card-head"><div><h2>Public profile</h2><p>${p.recruiting ? "Recruiting" : "Not recruiting"} · roster ${p.publicRoster ? "public" : "private"}.</p></div><a class="btn btn-ghost btn-sm" href="${publicHref(org)}">${icon("eye")}View</a></div><div class="card-body about">${esc(p.about || "No about text yet.")}</div></section>`;
  return `<section class="card"><div class="card-head"><div><h2>Public profile & recruitment</h2><p>What everyone sees on ${esc(org.name)}'s public page.</p></div><a class="btn btn-ghost btn-sm" href="${publicHref(org)}">${icon("eye")}Preview</a></div>
    <div class="card-body logo-edit" style="padding-bottom:0">
      ${mark(org, "mark-lg")}
      <div><b>Organization logo</b><p class="muted" style="font-size:13px;margin-top:3px">Shown on this site, the directory, your public page and in Discord. It is scaled to 256 pixels automatically.</p>
        <div class="chips" style="margin-top:10px"><label class="btn btn-glass btn-sm" style="cursor:pointer">${icon("plus")}${org.logo ? "Replace logo" : "Upload logo"}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-logo-file hidden></label>${org.logo ? `<button class="btn btn-ghost btn-sm" type="button" data-logo-remove style="color:var(--bad)">${icon("trash")}Remove</button>` : ""}</div></div>
    </div>
    <form class="card-body stack" style="gap:14px" data-form="profile">
      <label class="field">Tagline<input name="tagline" maxlength="120" value="${esc(p.tagline || "")}" placeholder="Serving Blaine County since 2026"></label>
      <label class="field">About<textarea name="about" maxlength="2000" style="min-height:130px" placeholder="Who you are, what you do and what members can expect.">${esc(p.about || "")}</textarea></label>
      <label class="field">Discord invite <small>(optional)</small><input name="discordInvite" maxlength="120" value="${esc(p.discordInvite || "")}" placeholder="https://discord.gg/yourorg"></label>
      <div class="toggle-row"><div><b>Recruiting</b><small>Shows an Apply button on the public page and the directory.</small></div><label class="switch"><input type="checkbox" name="recruiting" ${p.recruiting ? "checked" : ""}><span></span></label></div>
      <div class="toggle-row"><div><b>Public roster</b><small>Anyone can see member names, ranks, divisions and callsigns. Hours, files and strikes stay private.</small></div><label class="switch"><input type="checkbox" name="publicRoster" ${p.publicRoster !== false ? "checked" : ""}><span></span></label></div>
      <label class="field">Application questions <small>(one per line, up to 8)</small><textarea name="questions" style="min-height:110px" placeholder="How old are you?
What roleplay experience do you have?
Why do you want to join?">${esc((p.questions || []).join("\n"))}</textarea></label>
      <div style="display:flex;justify-content:flex-end"><button class="btn btn-org btn-sm" type="submit">${icon("check")}Save profile</button></div>
    </form></section>`;
}

function settingsTab(org) {
  const perms = org.perms || {};
  const links = state.data?.links || {};
  return `<div class="stack">
    ${profileEditor(org)}
    <div class="grid-2">
      <section class="card"><div class="card-head"><div><h2>Message of the day</h2><p>Shown to members when they clock in and in the F2 hub.</p></div></div>
        <div class="card-body">${org.motd ? `<div class="callout org">${icon("megaphone")}<div>${esc(org.motd)}</div></div>` : `<p class="muted">No message set.</p>`}
        ${perms.motd ? `<div style="margin-top:14px"><button class="btn btn-glass btn-sm" type="button" data-dialog="motd">${icon("edit")}Edit message</button></div>` : ""}</div></section>
      <section class="card"><div class="card-head"><div><h2>Your access</h2><p>What your position in ${esc(org.name)} lets you do.</p></div></div>
        <div class="card-body"><div class="chips" style="margin-bottom:12px">${viewerBadges(perms)}</div><div class="chips">${[["spend", "Spend"], ["sell", "Sell"], ["roster", "Roster"], ["ranks", "Edit ranks"], ["motd", "MOTD"], ["announce", "Announce"], ["discipline", "Member files"], ["applications", "Applications"], ["profile", "Profile"], ["ledger", "Ledger"]].map(([key, label]) => `<span class="perm" style="${perms[key] ? "" : "opacity:.45"}">${icon(perms[key] ? "check" : "x")}${label}</span>`).join("")}</div></div></section>
    </div>
    ${perms.full ? rosterSync(org) : ""}
    <section class="card"><div class="card-head"><div><h2>Leadership</h2><p>${perms.owner || perms.command || perms.manage ? "Appoint or remove leaders. Owner and command come from the manager bot." : "Owner and command come from the manager bot; the owner, command or staff appoint leaders."}</p></div>${perms.owner || perms.command || perms.manage ? `<button class="btn btn-glass btn-sm" type="button" data-dialog="leaders">${icon("badge")}Manage leaders</button>` : ""}</div>${leadershipBody(org)}</section>
    ${perms.manage ? `<section class="card"><div class="card-body" style="display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap"><div><h2 style="font-size:18px">Organization admin</h2><p class="muted" style="margin-top:5px">Create, rename and deactivate organizations, their access roles, tags and the shop catalog.</p></div><a class="btn btn-glass" href="${esc(links.control || "/control.html")}" target="_blank" rel="noopener">${icon("gear")}Open organization admin</a></div></section>` : ""}
    ${(org.properties || []).length ? propertyGuide(org) : ""}
  </div>`;
}

/* ---------- dialogs ---------- */
function openDialog({ kicker, title, body, submit, tone = "btn-org", wide = false, onSubmit, extra = "" }) {
  state.dialog = { onSubmit };
  $("#dialog-root").innerHTML = `<div class="dialog-backdrop" data-close-backdrop><form class="dialog${wide ? " wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="dialog-title" novalidate>
    <div class="dialog-head"><div><span class="kicker">${esc(kicker)}</span><h2 id="dialog-title">${esc(title)}</h2></div><button class="icon-btn" type="button" data-close aria-label="Close">${icon("x")}</button></div>
    <div class="dialog-body">${body}</div>
    <div class="dialog-foot">${extra}<span class="spacer"></span><button class="btn btn-ghost" type="button" data-close>Cancel</button>${submit ? `<button class="btn ${tone}" type="submit">${esc(submit)}</button>` : ""}</div>
  </form></div>`;
  const form = $("#dialog-root form");
  setTimeout(() => form.querySelector("input:not([type=hidden]):not([type=checkbox]),select,textarea")?.focus(), 30);
  return form;
}
function closeDialog() { state.dialog = null; $("#dialog-root").innerHTML = ""; }

const currentOrg = () => { const r = route(); return r.view === "org" ? findMine(r.ref) : null; };

function transferDialog(org) {
  const others = (state.data.economy.directory || []).filter((o) => Number(o.id) !== Number(org.id));
  openDialog({ kicker: org.name, title: "Send money", submit: "Send transfer",
    body: `<div class="kv"><div><small>Available</small><b>${money(org.wallet?.balance)}</b></div>${org.perms?.spendLimit != null ? `<div><small>Your daily limit</small><b>${money(org.perms.spendLimit)}</b></div>` : ""}</div>
      <label class="field">Send to<select name="toOrgId" required>${others.map((o) => `<option value="${o.id}">${esc(o.name)} · ${esc(TYPE_LABEL[o.type] || o.type)}</option>`).join("")}</select></label>
      <label class="field">Amount<input name="amount" type="number" min="1" step="1" required placeholder="2500"></label>
      <label class="field">Memo<input name="memo" minlength="3" maxlength="120" required placeholder="Payment for repairs, event prize split…"></label>
      <div class="callout">${icon("info")}<div>The memo appears in both organizations' ledgers and in the staff log.</div></div>`,
    onSubmit: (form) => act("transfer", { orgId: org.id, toOrgId: form.get("toOrgId"), amount: Number(form.get("amount")), memo: form.get("memo") }, (r) => `Sent ${money(r.amount)} to ${r.target?.name || "the organization"}.`) });
}

function adjustDialog(org) {
  openDialog({ kicker: "Wallet management", title: `Adjust ${org.name}`, submit: "Apply adjustment",
    body: `<div class="kv"><div><small>Current balance</small><b>${money(org.wallet?.balance)}</b></div></div><label class="field">Amount <small>(negative removes money)</small><input name="amount" type="number" step="1" required placeholder="5000"></label><label class="field">Reason<input name="reason" maxlength="160" minlength="3" required placeholder="Event prize, refund, correction…"></label>`,
    onSubmit: (form) => act("adjust", { orgId: org.id, amount: Number(form.get("amount")), reason: form.get("reason") }, (r) => `Wallet adjusted. New balance ${money(r.balance)}.`) });
}

function motdDialog(org) {
  openDialog({ kicker: org.name, title: "Message of the day", submit: "Save",
    body: `<label class="field">Shown to members when they clock in and in the F2 hub. Leave blank to clear.<textarea name="motd" maxlength="300" placeholder="Briefing at Mission Row 8pm. Bodycams on.">${esc(org.motd || "")}</textarea></label>`,
    onSubmit: (form) => act("motd", { orgId: org.id, motd: form.get("motd") }, (r) => (r.motd ? "Message of the day saved." : "Message of the day cleared.")) });
}

function memberDialog(org, discordId) {
  const row = (org.roster || []).find((r) => r.discord_id === discordId);
  const perms = org.perms || {};
  const ranks = (org.ranks || []).filter((r) => perms.full || r.level < perms.level);
  openDialog({ kicker: org.name, title: "Set rank", submit: "Save rank",
    body: `<div class="kv"><div style="grid-column:1/-1">${person(discordId)}</div></div>
      <label class="field">New rank<select name="rankId"><option value="">Member (no rank)</option>${ranks.map((r) => `<option value="${r.id}" ${row?.rank_id === r.id ? "selected" : ""}>${esc(r.name)} · level ${Number(r.level)}${(r.roles || []).length ? ` · ${plural(r.roles.length, "role")}` : ""}</option>`).join("")}</select></label>
      ${org.rosterSettings?.roleSync && (org.ranks || []).some((r) => (r.roles || []).length) ? `<div class="callout">${icon("discord")}<div>Their Discord roles update to match the new rank.</div></div>` : ""}`,
    onSubmit: (form) => act("member", { orgId: org.id, discordId, rankId: form.get("rankId") }, (r) => `Rank set to ${r.rank}.${r.roles?.errors?.length ? ` Some roles could not change: ${r.roles.errors[0]}` : r.roles && (r.roles.added || r.roles.removed) ? ` Discord roles updated (+${r.roles.added} / −${r.roles.removed}).` : ""}`) });
}

function leadersDialog(org) {
  const candidates = (org.roster || []).filter((r) => !r.leader);
  openDialog({ kicker: org.name, title: "Leaders", submit: "Save",
    body: `${(org.leaders || []).length ? `<div class="card" style="box-shadow:none"><div class="feed">${org.leaders.map((id) => `<div class="feed-row">${person(id)}<div class="end"><button class="btn btn-ghost btn-sm" type="button" data-leader-remove="${esc(id)}">Remove</button></div></div>`).join("")}</div></div>` : `<div class="callout warn">${icon("alert")}<div>No leaders yet.</div></div>`}
      <label class="field">Make a member leader<select name="pick"><option value="">Choose from the roster…</option>${candidates.map((r) => `<option value="${esc(r.discord_id)}">${esc(state.data.people?.[r.discord_id]?.name || r.discord_id)}</option>`).join("")}</select></label>
      <label class="field">Or a Discord user ID<input name="discordId" inputmode="numeric" pattern="[0-9]{15,24}" placeholder="123456789012345678"></label>
      <div class="callout">${icon("info")}<div>Leaders must hold the organization's access role and get every permission.</div></div>`,
    onSubmit: (form) => {
      const id = String(form.get("discordId") || form.get("pick") || "").trim();
      if (!id) throw new Error("Choose a member or enter a Discord user ID.");
      return act("leader", { orgId: org.id, discordId: id, leader: true }, "Leader added.");
    } });
}

async function rankDialog(org, rankId) {
  const rank = (org.ranks || []).find((r) => String(r.id) === String(rankId));
  const perms = org.perms || {};
  const permissions = state.data.economy.permissions || [];
  const color = safeColor(rank?.color, RANK_SWATCHES[(org.ranks || []).length % RANK_SWATCHES.length]);
  const maxLevel = perms.full ? 99 : Math.max(1, perms.level - 1);
  const selected = new Map((rank?.roles || []).map((role) => [`${role.guildId}:${role.roleId}`, role]));
  const form = openDialog({ kicker: org.name, title: rank ? `Edit ${rank.name}` : "New rank", submit: rank ? "Save rank" : "Create rank", wide: true,
    extra: rank ? `<button class="btn btn-ghost" type="button" data-rank-delete="${rank.id}" style="color:var(--bad)">Delete rank</button>` : "",
    body: `<div class="row-2"><label class="field">Rank name<input name="name" minlength="2" maxlength="40" required value="${esc(rank?.name || "")}" placeholder="Sergeant, Lieutenant, Shot caller…"></label>
        <label class="field">Level <small>(1-${maxLevel}; higher outranks lower, leaders are 100)</small><input name="level" type="number" min="1" max="${maxLevel}" step="1" required value="${Math.min(maxLevel, Number(rank?.level || 10))}"></label></div>
      <label class="field">Description <small>(optional)</small><input name="description" maxlength="160" value="${esc(rank?.description || "")}" placeholder="Runs patrol shifts and trains recruits"></label>
      <div class="field">Colour<div class="swatches">${RANK_SWATCHES.map((c) => `<button type="button" data-swatch="${c}" style="--c:${c}" class="${c.toLowerCase() === color.toLowerCase() ? "on" : ""}" aria-label="Colour ${c}"></button>`).join("")}<input type="color" name="color" value="${esc(color)}" aria-label="Custom colour"></div></div>
      <div class="field">Permissions<div class="perm-grid">${permissions.map((p) => {
        const on = rank ? rank[p.column] : p.default;
        const locked = !perms.full && ["spend", "sell", "roster", "ranks", "motd", "announce", "discipline", "applications", "profile"].includes(p.key) && !perms[p.key];
        return `<label class="perm-toggle"><input type="checkbox" name="perm:${p.key}" ${on && !locked ? "checked" : ""} ${locked ? "disabled" : ""}><span><b>${esc(p.label)}</b><small>${esc(locked ? "Your rank does not have this, so you cannot grant it." : p.hint)}</small></span></label>`;
      }).join("")}</div></div>
      <div class="row-2"><label class="field">Daily spend limit <small>(blank = unlimited)</small><input name="spendLimit" type="number" min="0" step="1" value="${rank?.spend_limit ?? ""}" placeholder="25000"></label>
        <label class="field">Weekly duty hours required <small>(blank = none)</small><input name="minWeeklyHours" type="number" min="0" max="168" step="0.5" value="${rank?.min_weekly_minutes != null ? rank.min_weekly_minutes / 60 : ""}" placeholder="4"></label></div>
      <div class="field">Discord roles bound to this rank <small>Members of this rank get these roles${org.rosterSettings?.roleSync === false ? " (role sync is off)" : ""}.</small>
        <div class="role-picker" id="role-picker"><div class="rp-list"><div class="empty" style="padding:22px"><div class="spinner"></div><span>Loading Discord roles</span></div></div></div></div>` });
  form.dataset.kind = "rank";
  const sync = () => {
    const chips = $("#role-selected");
    if (chips) chips.innerHTML = [...selected.values()].map((role) => `<span class="role-chip" style="--c:${esc(safeColor(role.color, "#99aab5"))}">${esc(role.name)}<button type="button" data-unbind="${esc(`${role.guildId}:${role.roleId}`)}" aria-label="Remove ${esc(role.name)}">×</button></span>`).join("") || `<span class="muted" style="font-size:13px">No roles bound.</span>`;
  };
  state.dialog.onSubmit = (data) => {
    const input = {
      orgId: org.id, rankId: rank?.id || null, name: data.get("name"), level: Number(data.get("level")), description: data.get("description"),
      color: data.get("color"), spendLimit: data.get("spendLimit"), minWeeklyHours: data.get("minWeeklyHours"),
      perms: Object.fromEntries(permissions.map((p) => [p.key, data.get(`perm:${p.key}`) === "on"])),
    };
    if (state.dialog.rolesLoaded) input.roles = [...selected.values()].map((role) => ({ guildId: role.guildId, roleId: role.roleId }));
    return act("rank", input, (r) => `Saved ${r.name}.${r.roles ? ` ${plural(r.roles.length, "role")} bound.` : ""}`);
  };
  state.dialog.unbind = (key) => { selected.delete(key); sync(); paintRoles(); };
  let servers = state.rolesCache.get(org.id);
  try {
    if (!servers) { servers = (await api(`orgs/roles?org=${encodeURIComponent(org.id)}`)).servers || []; state.rolesCache.set(org.id, servers); }
  } catch (error) {
    if ($("#role-picker")) $("#role-picker").innerHTML = `<div class="rp-list"><div class="callout warn" style="margin:6px">${icon("alert")}<div>${esc(error.message)}</div></div></div>`;
    return;
  }
  if (!$("#role-picker") || state.dialog?.unbind == null) return;
  state.dialog.rolesLoaded = true;
  const picker = $("#role-picker");
  if (!servers.length) {
    picker.innerHTML = `<div class="rp-list"><div class="callout" style="margin:6px">${icon("info")}<div>The bot is not in any Discord server linked to ${esc(org.name)}.</div></div></div>`;
    return;
  }
  picker.innerHTML = `<div class="rp-head"><select id="rp-guild" aria-label="Discord server">${servers.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join("")}</select><input id="rp-search" placeholder="Search roles" aria-label="Search roles"></div><div class="rp-list" id="rp-list"></div><div class="role-selected" id="role-selected"></div>`;
  function paintRoles() {
    const guild = servers.find((g) => g.id === $("#rp-guild")?.value) || servers[0];
    const query = String($("#rp-search")?.value || "").toLowerCase();
    const list = $("#rp-list");
    if (!list) return;
    list.innerHTML = guild.roles.filter((role) => !query || role.name.toLowerCase().includes(query)).map((role) => {
      const key = `${guild.id}:${role.id}`;
      return `<label class="${role.assignable ? "" : "off"}" title="${role.assignable ? "" : "Above the bot's role. Move the bot higher to bind it."}"><input type="checkbox" data-bind="${esc(key)}" data-name="${esc(role.name)}" data-color="${esc(role.color || "")}" ${selected.has(key) ? "checked" : ""} ${role.assignable ? "" : "disabled"}><i style="--c:${esc(safeColor(role.color, "#99aab5"))}"></i>${esc(role.name)}${role.assignable ? "" : "<small>above bot</small>"}</label>`;
    }).join("") || `<div class="muted" style="padding:12px;font-size:13px">No roles match.</div>`;
  }
  state.dialog.paintRoles = paintRoles;
  state.dialog.bind = (input) => {
    const [guildId, roleId] = input.dataset.bind.split(":");
    if (input.checked) {
      if (selected.size >= 6) { input.checked = false; return toast("A rank can have up to 6 bound roles.", true); }
      selected.set(input.dataset.bind, { guildId, roleId, name: input.dataset.name, color: input.dataset.color || null });
    } else selected.delete(input.dataset.bind);
    sync();
  };
  $("#rp-guild").addEventListener("change", paintRoles);
  $("#rp-search").addEventListener("input", paintRoles);
  paintRoles();
  sync();
}

function buyDialog(org, key) {
  const row = (state.data.economy.shop || []).find((item) => item.item_key === key);
  if (!row) return;
  openDialog({ kicker: org.name, title: `Buy ${row.label}?`, submit: `Buy for ${money(row.price)}`, tone: "btn-sun",
    body: `<div class="kv"><div><small>Price</small><b>${money(row.price)}</b></div><div><small>Wallet after</small><b>${money(Number(org.wallet?.balance || 0) - Number(row.price))}</b></div></div><p class="muted">${esc(row.description)}</p><div class="callout">${icon("info")}<div>${row.kind === "property" ? "The property is yours until you sell it (50% refund). It shows as pending from DevOps until the team sets it up, and the owner gets a DM when it is ready." : "Applies in game for every member on duty."}</div></div>`,
    onSubmit: () => act("purchase", { orgId: org.id, itemKey: row.item_key }, (r) => `Purchased. Wallet balance ${money(r.balance)}.`) });
}

function sellDialog(org, key) {
  const row = (state.data.economy.shop || []).find((item) => item.item_key === key);
  openDialog({ kicker: org.name, title: `Sell ${row?.label || "item"}?`, submit: "Sell", tone: "btn-danger",
    body: `<div class="callout warn">${icon("alert")}<div>You get <b>${money(Math.floor(Number(row?.price || 0) / 2))}</b> back${row?.kind === "property" || row?.stock != null ? " and it is released for any organization to buy" : ""}. It stops working in game within a minute.</div></div>`,
    onSubmit: () => act("sell", { orgId: org.id, itemKey: key }, (r) => `Sold ${r.label} for ${money(r.refund)}.`) });
}

/* ---------- events ---------- */
document.addEventListener("click", async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  if (target.matches("[data-close-backdrop]") || target.closest("[data-close]")) return closeDialog();
  const org = currentOrg();
  const filterButton = target.closest("[data-filter]");
  if (filterButton) { state.filters[filterButton.dataset.filter] = filterButton.dataset.value; return render(); }
  if (target.closest("[data-logout]")) {
    await api("auth/logout", { method: "POST" }).catch(() => {});
    location.hash = "#/";
    return location.reload();
  }
  const dialogButton = target.closest("[data-dialog]");
  if (dialogButton && org) {
    const kind = dialogButton.dataset.dialog;
    if (kind === "transfer") return transferDialog(org);
    if (kind === "adjust") return adjustDialog(org);
    if (kind === "motd") return motdDialog(org);
    if (kind === "leaders") return leadersDialog(org);
    if (kind === "member") return memberDialog(org, dialogButton.dataset.id);
    if (kind === "rank") return rankDialog(org, dialogButton.dataset.id);
    if (kind === "divisions") return divisionsDialog(org);
    if (kind === "announce") return announceDialog(org, dialogButton.dataset.id);
    if (kind === "event") return eventDialog(org, dialogButton.dataset.id);
  }
  const applyButton = target.closest("[data-apply]");
  if (applyButton) {
    const page = state.publicOrgs.get(String(route().ref));
    if (page?.org) applyDialog(page);
    return;
  }
  const withdraw = target.closest("[data-app-withdraw]");
  if (withdraw) {
    try { await act("application/withdraw", { applicationId: Number(withdraw.dataset.appWithdraw) }, "Application withdrawn."); }
    catch (error) { toast(error.message, true); }
    return;
  }
  if (!org) return;
  if (target.closest("[data-logo-remove]")) {
    try { await act("logo/remove", { orgId: org.id }, "Logo removed."); state.publicOrgs.clear(); }
    catch (error) { toast(error.message, true); }
    return;
  }
  const memberButton = target.closest("[data-member]");
  if (memberButton) return memberFileDialog(org, memberButton.dataset.member);
  if (target.closest("[data-file-save]")) {
    const root = $("#dialog-root");
    const value = (name) => root.querySelector(`[name="${name}"]`)?.value ?? "";
    return fileAction("member/profile", { callsign: value("callsign"), divisionId: value("divisionId"), status: value("status"), statusUntil: value("statusUntil"), statusNote: value("statusNote") }, "Member details saved.");
  }
  if (target.closest("[data-file-record]")) {
    const root = $("#dialog-root");
    const kind = root.querySelector('[name="recordKind"]')?.value;
    return fileAction("record", { kind, body: root.querySelector('[name="recordBody"]')?.value || "" }, kind === "strike" ? "Strike added and the member was notified." : kind === "note" ? "Note added." : "Commendation added and the member was notified.");
  }
  const revoke = target.closest("[data-record-revoke]");
  if (revoke) return fileAction("record/revoke", { recordId: Number(revoke.dataset.recordRevoke) }, "Record revoked.");
  const divisionEdit = target.closest("[data-division-edit]");
  if (divisionEdit) {
    const division = (org.divisions || []).find((d) => String(d.id) === divisionEdit.dataset.divisionEdit);
    const form = $("#dialog-root form");
    if (division && form) {
      const field = (name) => form.elements.namedItem(name);
      field("divisionId").value = division.id; field("name").value = division.name; field("color").value = safeColor(division.color, "#55c4ff"); field("description").value = division.description || "";
      const submit = form.querySelector("button[type=submit]"); if (submit) submit.textContent = "Save division";
      field("name").focus();
    }
    return;
  }
  const divisionDelete = target.closest("[data-division-delete]");
  if (divisionDelete) {
    const division = (org.divisions || []).find((d) => String(d.id) === divisionDelete.dataset.divisionDelete);
    if (!await window.fbrpConfirm(`Delete ${division?.name || "this division"}? Its members become unassigned.`)) return;
    try { await act("division/delete", { orgId: org.id, divisionId: Number(divisionDelete.dataset.divisionDelete) }, (r) => `Deleted ${r.name}.`); divisionsDialog(currentOrg()); }
    catch (error) { toast(error.message, true); }
    return;
  }
  const eventCancel = target.closest("[data-event-cancel]");
  if (eventCancel) {
    if (!await window.fbrpConfirm("Cancel this event? Members who answered will no longer see it.")) return;
    try { await act("event/cancel", { orgId: org.id, eventId: Number(eventCancel.dataset.eventCancel) }, "Event cancelled."); }
    catch (error) { toast(error.message, true); }
    return;
  }
  const eventRsvp = target.closest("[data-event-rsvp]");
  if (eventRsvp) {
    const event = (org.events || []).find((e) => String(e.id) === eventRsvp.dataset.eventRsvp);
    const response = event?.mine === eventRsvp.dataset.response ? "clear" : eventRsvp.dataset.response;
    try { await act("event/rsvp", { orgId: org.id, eventId: Number(eventRsvp.dataset.eventRsvp), response }, response === "clear" ? "Answer cleared." : "Answer saved."); }
    catch (error) { toast(error.message, true); }
    return;
  }
  const announceDelete = target.closest("[data-announce-delete]");
  if (announceDelete) {
    if (!await window.fbrpConfirm("Delete this announcement?")) return;
    try { await act("announce/delete", { orgId: org.id, announcementId: Number(announceDelete.dataset.announceDelete) }, "Announcement deleted."); }
    catch (error) { toast(error.message, true); }
    return;
  }
  const review = target.closest("[data-app-review]");
  if (review) {
    const id = review.dataset.appReview;
    const note = $(`[name="note-${CSS.escape(id)}"]`)?.value || "";
    review.disabled = true;
    try { await act("application/review", { orgId: org.id, applicationId: Number(id), decision: review.dataset.decision, note }, (r) => `Application ${r.decision}.${r.dm ? " The applicant was notified." : " Their DMs are closed, so tell them yourself."}`); }
    catch (error) { toast(error.message, true); review.disabled = false; }
    return;
  }
  const buy = target.closest("[data-buy]");
  if (buy) return buyDialog(org, buy.dataset.buy);
  const sell = target.closest("[data-sell]");
  if (sell) return sellDialog(org, sell.dataset.sell);
  const swatch = target.closest("[data-swatch]");
  if (swatch) {
    $$("[data-swatch]").forEach((node) => node.classList.toggle("on", node === swatch));
    const input = $("#dialog-root input[name=color]");
    if (input) input.value = swatch.dataset.swatch;
    return;
  }
  const unbind = target.closest("[data-unbind]");
  if (unbind) return state.dialog?.unbind?.(unbind.dataset.unbind);
  const remove = target.closest("[data-leader-remove]");
  if (remove) {
    try { await act("leader", { orgId: org.id, discordId: remove.dataset.leaderRemove, leader: false }, "Leader removed."); leadersDialog(currentOrg()); }
    catch (error) { toast(error.message, true); }
    return;
  }
  const del = target.closest("[data-rank-delete]");
  if (del) {
    const rank = (org.ranks || []).find((r) => String(r.id) === del.dataset.rankDelete);
    if (!await window.fbrpConfirm(`Delete ${rank?.name || "this rank"}? Its ${plural(rank?.members || 0, "member")} go back to Member and its role bindings are removed.`)) return;
    try { await act("rank/delete", { orgId: org.id, rankId: Number(del.dataset.rankDelete) }, (r) => `Deleted ${r.name}.`); closeDialog(); }
    catch (error) { toast(error.message, true); }
    return;
  }
  const move = target.closest("[data-rank-move]");
  if (move) {
    const ids = [...rankOrder(org)];
    const index = ids.indexOf(Number(move.dataset.rankMove));
    const next = index + Number(move.dataset.dir);
    if (index < 0 || next < 0 || next >= ids.length) return;
    [ids[index], ids[next]] = [ids[next], ids[index]];
    state.rankOrder = { org: org.id, ids };
    return render();
  }
  if (target.closest("[data-rank-reset]")) { state.rankOrder = null; return render(); }
  if (target.closest("[data-rank-save]")) {
    try { await act("rank/reorder", { orgId: org.id, order: rankOrder(org) }, "Rank order saved. Levels were renumbered."); }
    catch (error) { toast(error.message, true); }
    return;
  }
  const importButton = target.closest("[data-import]");
  if (importButton) {
    importButton.disabled = true;
    try { await act("import", { orgId: org.id }, (r) => (r.changed ? `${plural(r.changed, "member")} re-ranked from Discord.` : "Everyone already matches their Discord roles.")); }
    catch (error) { toast(error.message, true); importButton.disabled = false; }
  }
});

/** Scale a picked image to fit 256x256 and return it as a PNG data URL (a logo never needs more). */
async function scaleLogo(file) {
  if (!file || !/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error("Choose a PNG, JPEG, WebP or GIF image.");
  if (file.size > 12 * 1024 * 1024) throw new Error("That image is too large. Pick one under 12 MB.");
  const bitmap = await createImageBitmap(file);
  const side = Math.min(256, Math.max(bitmap.width, bitmap.height));
  const scale = side / Math.max(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

document.addEventListener("change", async (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.dataset.logoFile !== undefined) {
    const org = currentOrg();
    const file = target.files?.[0];
    target.value = "";
    if (!org || !file) return;
    try { await act("logo", { orgId: org.id, image: await scaleLogo(file) }, "Logo updated."); state.publicOrgs.clear(); }
    catch (error) { toast(error.message, true); }
    return;
  }
  if (target instanceof HTMLInputElement && target.dataset.bind) state.dialog?.bind?.(target);
  if (target instanceof HTMLInputElement && target.name === "color") $$("[data-swatch]").forEach((node) => node.classList.toggle("on", node.dataset.swatch.toLowerCase() === target.value.toLowerCase()));
});

let searchTimer = null;
document.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !target.dataset.search) return;
  state.filters[target.dataset.search] = target.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const key = target.dataset.search;
    const caret = target.selectionStart;
    render();
    const again = $(`[data-search="${CSS.escape(key)}"]`);
    if (again) { again.focus(); again.setSelectionRange(caret, caret); }
  }, 160);
});

document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  if (form.dataset.form === "profile") {
    const org = currentOrg();
    const data = new FormData(form);
    try {
      await act("profile", { orgId: org.id, tagline: data.get("tagline"), about: data.get("about"), discordInvite: data.get("discordInvite"), recruiting: data.get("recruiting") === "on", publicRoster: data.get("publicRoster") === "on", questions: String(data.get("questions") || "").split("\n") }, "Profile saved.");
      state.publicOrgs.clear();
    } catch (error) { toast(error.message, true); }
    return;
  }
  if (form.dataset.form === "settings") {
    const org = currentOrg();
    const data = new FormData(form);
    try { await act("settings", { orgId: org.id, roleSync: data.get("roleSync") === "on", autoRank: data.get("autoRank") === "on" }, "Sync settings saved."); }
    catch (error) { toast(error.message, true); }
    return;
  }
  if (!state.dialog?.onSubmit) return;
  if (!form.reportValidity()) return;
  const button = form.querySelector("button[type=submit]");
  if (button) button.disabled = true;
  try {
    await state.dialog.onSubmit(new FormData(form));
    if (state.dialog && form.dataset.kind !== "keep") closeDialog();
  } catch (error) {
    toast(error.message, true);
    if (button) button.disabled = false;
  }
});

// A logo that fails to load falls back to the organization's initials (inline handlers are blocked by the CSP).
document.addEventListener("error", (event) => {
  const img = event.target;
  if (!(img instanceof HTMLImageElement) || !img.parentNode?.classList?.contains("mark-img")) return;
  const holder = img.parentNode;
  holder.classList.remove("mark-img");
  holder.textContent = initials(img.alt.replace(/ logo$/, ""));
}, true);

document.addEventListener("keydown", (event) => { if (event.key === "Escape" && state.dialog) closeDialog(); });
window.addEventListener("hashchange", () => { state.rankOrder = null; render(); window.scrollTo({ top: 0 }); });

/* ---------- boot and live refresh ---------- */
async function loadData() {
  try {
    state.data = await api("orgs/data");
    state.signedIn = true;
  } catch (error) {
    if (error.status !== 401) throw error;
    state.data = null;
    state.signedIn = false;
  }
}

async function boot() {
  const [pub] = await Promise.all([api("orgs/public"), loadData()]);
  state.pub = pub;
  if (new URLSearchParams(location.search).get("signin") === "expired") {
    history.replaceState(null, "", location.pathname + location.hash);
    toast("That sign-in link expired. Please sign in again.", true);
  }
  render();
}

// Wallets change in FiveM and in the manager bots; keep the open page current.
setInterval(async () => {
  if (document.hidden || state.dialog || state.loading) return;
  state.loading = true;
  try {
    const [pub] = await Promise.all([api("orgs/public"), state.signedIn ? loadData() : null]);
    state.pub = pub;
    if (route().view === "public") await loadPublic(route().ref, true);
    const focused = document.activeElement instanceof HTMLInputElement && document.activeElement.dataset.search;
    if (!focused) render();
  } catch { /* retried on the next tick */ } finally { state.loading = false; }
}, 20000);

boot().catch((error) => {
  $("#main").innerHTML = `<div class="card" style="margin-top:40px">${empty("The organization site is unavailable", error.message, "alert")}</div>`;
});
