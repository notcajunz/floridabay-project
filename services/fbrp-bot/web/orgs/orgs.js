/* Florida Bay Roleplay - organization website (orgs.floridabay.net) */

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
const safeColor = (value, fallback = "#35e2cd") => (/^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : fallback);

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
  ["door, door2, door3", "Entrances. Every door within about 12 m is locked; members press E at it to lock or unlock."],
  ["terminal", "The work spot. On duty, press E here to run a shift and earn for the organization."],
  ["bar", "The counter at a bar, club or restaurant. Aim at it with the third eye to serve customers."],
  ["stash", "A hideout's stash. Members guard it for a small income. It replaces the terminal."],
  ["armory", "Where members draw their permitted loadout, if their rank allows it."],
  ["wardrobe", "Where members change into the organization's outfits."],
];
const TABS = [
  ["overview", "Overview", "home"],
  ["roster", "Roster", "users"],
  ["ranks", "Ranks & roles", "ladder"],
  ["shop", "Shop", "sparkle"],
  ["ledger", "Ledger", "wallet"],
  ["settings", "Settings", "gear"],
];

const state = { pub: null, data: null, signedIn: false, filters: {}, rankOrder: null, rolesCache: new Map(), dialog: null, loading: false };

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
  return { view: "home" };
}
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
const mark = (org, cls = "") => `<span class="mark ${cls}" style="--org:${esc(safeColor(org.color))}">${esc(initials(org.name))}</span>`;
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
  $("#top-nav").innerHTML = `<a href="#/" class="${current.view === "home" ? "active" : ""}">Directory</a>${orgs.slice(0, 4).map((org) => `<a href="${orgHref(org)}" class="${current.view === "org" && (String(current.ref) === String(org.slug) || String(current.ref) === String(org.id)) ? "active" : ""}">${esc(org.name)}</a>`).join("")}`;
  const user = state.data?.user;
  $("#top-user").innerHTML = user
    ? `<span class="chip-user">${user.avatar ? `<img class="av av-xs" src="${esc(user.avatar)}" alt="">` : `<span class="av av-xs" style="--h:${hue(user.id)}">${esc(initials(user.name))}</span>`}<b>${esc(user.name)}</b></span><button class="icon-btn" type="button" data-logout title="Sign out" aria-label="Sign out">${icon("logout")}</button>`
    : `<a class="btn btn-discord btn-sm" href="${esc(signInUrl())}">${icon("discord")}Sign in with Discord</a>`;
}

function render() {
  renderTop();
  const current = route();
  const main = $("#main");
  if (current.view === "org") {
    const org = findMine(current.ref);
    if (org) {
      document.title = `${org.name} · Florida Bay Organizations`;
      main.innerHTML = workspace(org, current.tab);
    } else {
      document.title = "Organizations · Florida Bay";
      main.innerHTML = lockedOrg(findPublic(current.ref));
    }
  } else {
    document.title = "Organizations · Florida Bay";
    main.innerHTML = home();
  }
  document.documentElement.style.setProperty("--org", current.view === "org" ? safeColor(findMine(current.ref)?.color) : "#35e2cd");
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
  return `<a class="org-card" href="${orgHref(org)}" style="--org:${esc(safeColor(org.color))}">
    ${mine ? `<span class="pill pill-good mine-tag">${icon("check")}Yours</span>` : ""}
    <div class="top-row">${mark(org)}<div><h3>${esc(org.name)}</h3><div class="type">${esc(TYPE_LABEL[org.type] || titleCase(org.type))}</div></div></div>
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
  const body = { overview: overviewTab, roster: rosterTab, ranks: ranksTab, shop: shopTab, ledger: ledgerTab, settings: settingsTab }[tab] || overviewTab;
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
        </div>
      </section>
      <nav class="tabs" aria-label="${esc(org.name)} sections">${TABS.map(([key, label, ico]) => `<a href="${orgHref(org, key)}" class="${key === tab ? "on" : ""}">${icon(ico)}${esc(label)}${key === "roster" ? `<span class="count">${fmt((org.roster || []).length)}</span>` : key === "ranks" ? `<span class="count">${fmt((org.ranks || []).length)}</span>` : ""}</a>`).join("")}</nav>
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
    <div class="grid-3">
      <section class="card"><div class="card-head"><div><h2>Leadership</h2><p>Who runs ${esc(org.name)}.</p></div></div>${leadershipBody(org)}</section>
      <section class="card"><div class="card-head"><div><h2>Recent activity</h2><p>Roster and rank changes.</p></div></div>${activityFeed(org, 6)}</section>
    </div>
    <div class="grid-2">
      <section class="card"><div class="card-head"><div><h2>Properties</h2><p>Run them in game: on duty, press <kbd>E</kbd> at the terminal or open <kbd>F2</kbd>.</p></div><a class="btn btn-ghost btn-sm" href="${orgHref(org, "shop")}">Shop</a></div>
        ${(org.properties || []).length ? `<div class="feed">${org.properties.map((p) => `<div class="feed-row"><span class="feed-ico" style="--t:${p.data?.business === "lab" ? "#8f7cff" : "#ff7a45"}">${icon(p.data?.business === "lab" ? "leaf" : "building")}</span><div class="txt"><b>${esc(p.label || p.item_key)}</b><small>${esc(BUSINESS_LABEL[p.data?.business] || "Property")}${p.data?.area ? ` · ${esc(p.data.area)}` : ""} · since ${esc(day(p.purchased_at))}</small></div><div class="end">${(p.spots || []).length ? `<span class="pill pill-good">${fmt(p.spots.length)} spots</span>` : `<span class="pill pill-warn">Not set up</span>`}</div></div>`).join("")}</div>` : empty("No property yet", org.department ? "Departments draw from station armories; properties are optional." : "Buy an MLO in the shop to start a business or a private lab.", "building")}
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
function rosterTab(org) {
  const perms = org.perms || {};
  const ranks = org.ranks || [];
  const viewer = state.data?.user?.id;
  const rankFilter = filter(`roster-rank-${org.id}`, "all");
  const query = String(filter(`roster-q-${org.id}`, "")).trim().toLowerCase();
  const nameOf = (id) => String(state.data?.people?.[id]?.name || "").toLowerCase();
  const rows = (org.roster || [])
    .filter((r) => rankFilter === "all" || (rankFilter === "duty" ? r.on_duty : rankFilter === "none" ? !r.rank_id && !r.leader : rankFilter === "leaders" ? r.leader || r.owner || r.command : String(r.rank_id) === rankFilter))
    .filter((r) => !query || nameOf(r.discord_id).includes(query) || r.discord_id.includes(query));
  const editable = (r) => perms.roster && (perms.full || (!r.leader && !r.owner && !r.command && r.level < perms.level && r.discord_id !== viewer));
  return `<div class="stack">
    <section class="card">
      <div class="card-head"><div><h2>Roster</h2><p>Everyone holding the access role. Hours are this week's duty time.${org.rosterSettings?.roleSync && ranks.some((r) => (r.roles || []).length) ? " Rank changes also update the bound Discord roles." : ""}</p></div>
        <label class="search">${icon("search")}<input data-search="roster-q-${org.id}" placeholder="Search members" value="${esc(filter(`roster-q-${org.id}`, ""))}" aria-label="Search members"></label></div>
      <div style="padding:14px 22px 4px">${seg(`roster-rank-${org.id}`, [["all", "All", (org.roster || []).length], ["duty", "On duty", (org.roster || []).filter((r) => r.on_duty).length], ["leaders", "Leadership"], ...ranks.map((r) => [String(r.id), r.name, r.members]), ["none", "Unranked"]], rankFilter)}</div>
      ${rows.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Member</th><th>Rank</th><th>Hours · 7d</th><th>Last shift</th>${perms.roster ? '<th class="right"></th>' : ""}</tr></thead><tbody>${rows.map((r) => `<tr>
        <td><span class="person" style="gap:12px"><span class="duty ${r.on_duty ? "on" : ""}" title="${r.on_duty ? "On duty now" : "Off duty"}"></span>${person(r.discord_id)}</span></td>
        <td><div class="chips">${rankPill(r, org)}${(r.owner || r.command) && r.rank_id ? rankPill({ rank_id: r.rank_id }, org) : ""}</div></td>
        <td class="mono">${hours(r.week_seconds)}</td>
        <td>${r.on_duty ? '<span class="pill pill-good">On duty</span>' : esc(ago(r.last_shift))}</td>
        ${perms.roster ? `<td class="right">${editable(r) && !r.leader ? `<button class="btn btn-ghost btn-sm" type="button" data-dialog="member" data-id="${esc(r.discord_id)}">${icon("edit")}Set rank</button>` : ""}</td>` : ""}
      </tr>`).join("")}</tbody></table></div>` : empty("Nobody here", (org.roster || []).length ? "No member matches this filter." : "Members appear once they hold the organization's Discord role.", "users")}
    </section>
    <div class="grid-2"><section class="card"><div class="card-head"><div><h2>Leadership</h2><p>Owner, command and leaders have every permission.</p></div></div>${leadershipBody(org)}</section>
      <section class="card"><div class="card-head"><div><h2>Activity</h2><p>Recent roster changes.</p></div></div>${activityFeed(org, 8)}</section></div>
  </div>`;
}

/* ---------- ranks ---------- */
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
    return granted.length ? granted.map((p) => `<span class="perm">${icon("check")}${esc(p.label)}${p.key === "spend" && rank.spend_limit != null ? ` · ${money(rank.spend_limit)}/day` : ""}</span>`).join("") : `<span class="perm" style="color:var(--ink-3)">No permissions</span>`;
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
  return `<section class="card"><div class="card-head"><div><h2>Set up a property</h2><p>A new property does nothing, and its doors stay unlocked, until its spots are placed by hand.</p></div></div>
    <div class="card-body stack" style="gap:12px">
      <div class="callout">${icon("info")}<div><b>Leaders and ranks that manage the roster</b> place spots for ${esc(org.name)} in game. Stand on the exact spot, run <kbd>/propset terminal</kbd> (or another spot below), check the marker, then press <kbd>E</kbd> to confirm. <kbd>/propset list</kbd> shows what is placed, <kbd>/propset clear terminal</kbd> removes one and <kbd>/propdoors</kbd> fixes doors.</div></div>
      <div class="callout warn">${icon("alert")}<div><b>Cannot do it yourself?</b> Open a ticket in the <b>FBRP | DevOps</b> server for the Development Director, with the property, where each spot goes and a screenshot of the entrance.</div></div>
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
function settingsTab(org) {
  const perms = org.perms || {};
  const links = state.data?.links || {};
  return `<div class="stack">
    <div class="grid-2">
      <section class="card"><div class="card-head"><div><h2>Message of the day</h2><p>Shown to members when they clock in and in the F2 hub.</p></div></div>
        <div class="card-body">${org.motd ? `<div class="callout org">${icon("megaphone")}<div>${esc(org.motd)}</div></div>` : `<p class="muted">No message set.</p>`}
        ${perms.motd ? `<div style="margin-top:14px"><button class="btn btn-glass btn-sm" type="button" data-dialog="motd">${icon("edit")}Edit message</button></div>` : ""}</div></section>
      <section class="card"><div class="card-head"><div><h2>Your access</h2><p>What your position in ${esc(org.name)} lets you do.</p></div></div>
        <div class="card-body"><div class="chips" style="margin-bottom:12px">${viewerBadges(perms)}</div><div class="chips">${[["spend", "Spend"], ["sell", "Sell"], ["roster", "Roster"], ["ranks", "Edit ranks"], ["motd", "MOTD"], ["ledger", "Ledger"]].map(([key, label]) => `<span class="perm" style="${perms[key] ? "" : "opacity:.45"}">${icon(perms[key] ? "check" : "x")}${label}</span>`).join("")}</div></div></section>
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
        const locked = !perms.full && ["spend", "sell", "roster", "ranks", "motd"].includes(p.key) && !perms[p.key];
        return `<label class="perm-toggle"><input type="checkbox" name="perm:${p.key}" ${on && !locked ? "checked" : ""} ${locked ? "disabled" : ""}><span><b>${esc(p.label)}</b><small>${esc(locked ? "Your rank does not have this, so you cannot grant it." : p.hint)}</small></span></label>`;
      }).join("")}</div></div>
      <label class="field">Daily spend limit <small>(blank = unlimited; applies with "Spend the wallet")</small><input name="spendLimit" type="number" min="0" step="1" value="${rank?.spend_limit ?? ""}" placeholder="25000"></label>
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
      color: data.get("color"), spendLimit: data.get("spendLimit"),
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
    body: `<div class="kv"><div><small>Price</small><b>${money(row.price)}</b></div><div><small>Wallet after</small><b>${money(Number(org.wallet?.balance || 0) - Number(row.price))}</b></div></div><p class="muted">${esc(row.description)}</p><div class="callout">${icon("info")}<div>${row.kind === "property" ? "The property is yours until you sell it (50% refund). It works in game within a minute once its spots are placed." : "Applies in game for every member on duty."}</div></div>`,
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
  }
  if (!org) return;
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
    if (!confirm(`Delete ${rank?.name || "this rank"}? Its ${plural(rank?.members || 0, "member")} go back to Member and its role bindings are removed.`)) return;
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

document.addEventListener("change", (event) => {
  const target = event.target;
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
    const focused = document.activeElement instanceof HTMLInputElement && document.activeElement.dataset.search;
    if (!focused) render();
  } catch { /* retried on the next tick */ } finally { state.loading = false; }
}, 20000);

boot().catch((error) => {
  $("#main").innerHTML = `<div class="card" style="margin-top:40px">${empty("The organization site is unavailable", error.message, "alert")}</div>`;
});
