const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const fmt = (value) => new Intl.NumberFormat().format(Number(value || 0));
const time = (value) => value ? new Date(Number(value)).toLocaleString() : "-";
const colorHex = (value) => `#${Number(value || 0).toString(16).padStart(6, "0")}`;

/** "3m ago", "2d ago"; falls back to a date for anything older than a month. */
function ago(value) {
  if (!value) return "-";
  const ms = Number(value), diff = Date.now() - ms;
  if (!Number.isFinite(ms)) return "-";
  if (diff < 0) return new Date(ms).toLocaleDateString();
  const units = [[60000, "s", 1000], [3600000, "m", 60000], [86400000, "h", 3600000], [2592000000, "d", 86400000]];
  for (const [limit, unit, size] of units) if (diff < limit) return `${Math.max(1, Math.floor(diff / size))}${unit} ago`;
  return new Date(ms).toLocaleDateString();
}

const ICON = {
  home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  chat: '<path d="M4 5h16v11H8l-4 4z"/>',
  ticket: '<path d="M3 8a2 2 0 0 0 0 4v4h18v-4a2 2 0 0 1 0-4V4H3z"/><path d="M14 4v12"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
  badge: '<path d="M12 3 4 6v6c0 4.5 3.4 8.4 8 9 4.6-.6 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  sync: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  car: '<path d="M5 16h14M3 16v-4l2-5h14l2 5v4h-2M3 16h2"/><circle cx="7.5" cy="16.5" r="1.8"/><circle cx="16.5" cy="16.5" r="1.8"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
  building: '<path d="M4 21V5l8-3v19M12 9h8v12M8 8h.01M8 12h.01M8 16h.01M16 13h.01M16 17h.01M2 21h20"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v12"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  radio: '<path d="M4 9h16v11H4zM8 9l9-5"/><circle cx="9" cy="14.5" r="2"/><path d="M14 13h3M14 16h3"/>',
  gamepad: '<path d="M6 8h12a4 4 0 0 1 3.7 5.5l-1.3 3.3a2 2 0 0 1-3.4.5L15 15H9l-2 2.3a2 2 0 0 1-3.4-.5l-1.3-3.3A4 4 0 0 1 6 8z"/><path d="M8 10.5v3M6.5 12h3M15.5 11h.01M17.5 13h.01"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[name] || ICON.layers}</svg>`;

/* Plain-language areas the sidebar and home page are organised into; each collects one or more resource groups. */
const AREAS = [
  { id: "staff", title: "Staff team", icon: "badge", blurb: "Staff ranks, members, callsigns, warnings and promotion exams.", groups: ["Staff roster", "Staff"] },
  { id: "access", title: "Permissions", icon: "key", blurb: "Decide who can do what, in Discord and in game.", groups: ["Access"] },
  { id: "tickets", title: "Tickets & support", icon: "ticket", blurb: "What members can open tickets about, and who answers them.", groups: ["Tickets"] },
  { id: "community", title: "Community & roleplay", icon: "users", blurb: "Headtags, personal vehicles, organizations and radio channels.", groups: ["Community"] },
  { id: "economy", title: "Organization money", icon: "coin", blurb: "The organization shop and organization balances.", groups: ["Economy"] },
  { id: "discord", title: "Discord servers", icon: "chat", blurb: "Connected servers, shared roles, log channels and voice offices.", groups: ["Network", "Discord"] },
  { id: "game", title: "Game server", icon: "gamepad", blurb: "Live in-game state like AOP, peacetime and priority.", groups: ["FiveM"] },
  { id: "security", title: "Security", icon: "lock", blurb: "Protected roles, approved bots and security exemptions.", groups: ["Security"] },
  { id: "advanced", title: "Advanced", icon: "cog", blurb: "Low-level bot settings. Only change these if you know exactly what they do.", groups: ["Advanced"], advanced: true },
];

/* Friendly names and one-line explanations for every section (the server's own description is shown as "Good to know"). */
const FRIENDLY = {
  "ace-groups": ["All permission groups", "The full list of permission groups. To tick what a group can do, use “Edit a permission group” instead."],
  "ace-entries": ["Individual permissions", "Every single permission given to (or taken from) a group, one per row. Bundles at the top add common sets in one go."],
  "ace-memberships": ["Who is in each group", "People placed directly into a permission group. Shared Discord roles follow this list."],
  "role-bindings": ["Roles linked to groups", "A Discord role that should only be worn by members of a permission group. Anyone else is removed from it automatically."],
  "network-guilds": ["Connected servers", "The Discord servers that are part of the Florida Bay network and what kind of server each one is."],
  "channel-bindings": ["Log & panel channels", "Which Discord channel each log, panel and board is posted in."],
  offices: ["Voice offices", "Private voice channels and who owns them."],
  "ticket-settings": ["Ticket settings", "Limits, categories and the text on the ticket panel for each server."],
  "ticket-types": ["Ticket categories", "The options members pick from when opening a ticket, and the questions they’re asked."],
  "ticket-priorities": ["Priority levels", "How urgent a ticket can be and how quickly staff should respond."],
  "ticket-support-roles": ["Who handles tickets", "Which roles can see and manage each kind of ticket."],
  headtags: ["Headtags", "The tags that can show above players’ heads in game."],
  "headtag-grants": ["Who has which headtag", "Headtags given directly to someone. Tags that come from Discord roles update on their own."],
  personals: ["Personal vehicles", "Cars reserved for one owner. Only they, people they trust and tag holders can spawn them."],
  "personal-trust": ["Trusted drivers", "People a vehicle’s owner lets spawn and drive their personal vehicle."],
  "personal-tags": ["Vehicle tag locks", "Lock a personal vehicle to a headtag so everyone with that tag can use it."],
  organizations: ["Organizations", "Gangs, businesses and departments, and their in-game duty access."],
  "organization-requirements": ["Joining requirements", "The Discord roles someone needs before they can join an organization."],
  "radio-channels": ["Radio channels", "Reserved radio frequencies and who is allowed on them."],
  "roster-categories": ["Callsign ranges", "The callsign number range given to each group of staff ranks."],
  "roster-ranks": ["Staff ranks", "Every staff rank, its Discord role, its permission group and its activity requirement."],
  "roster-jobs": ["Secondary jobs", "Extra staff roles someone can hold alongside their rank."],
  "roster-members": ["Staff members", "Everyone on the staff team. Trial Head Administrator and higher receive automatic callsigns."],
  "roster-member-jobs": ["Who has which secondary job", "Which staff members hold each secondary job."],
  "roster-discipline": ["Warnings & strikes", "Staff warnings and strikes. Add a revoke time to lift one."],
  "staff-exams": ["Promotion exams", "The exams staff take on the member portal to be promoted."],
  "protected-roles": ["Protected roles", "Important roles the bot guards. Unapproved changes to them are undone."],
  "allowed-bots": ["Approved bots", "Bots that are allowed to join. A bot needs to be approved here and added by a trusted person."],
  "trusted-bot-adders": ["Who can add bots", "People allowed to add an approved bot to a server."],
  "security-exemptions": ["Security exemptions", "People the automatic security checks should leave alone."],
  "server-state": ["Live game state", "AOP, peacetime, priority and similar settings. Saving updates the game straight away."],
  "org-shop": ["Organization shop", "What organizations can buy with their organization money."],
  "org-wallets": ["Organization balances", "Raw organization balances. It’s safer to use /orgbank adjust so the change is recorded."],
  "bot-config": ["Bot internals", "Low-level bot settings stored in the database."],
};

/* Shortcuts on the home page for the things people change most. */
const TASKS = [
  ["resource:roster-members", "users", "Add or update staff", "Ranks, callsigns and status"],
  ["acegroups", "key", "Change what a rank can do", "Tick permissions for a group"],
  ["resource:roster-discipline", "alert", "Warn or strike staff", "Record or lift a warning"],
  ["resource:ticket-types", "ticket", "Edit ticket categories", "What members can open tickets about"],
  ["resource:headtags", "tag", "Manage headtags", "Tags shown above players"],
  ["resource:personals", "car", "Personal vehicles", "Reserve a car for one owner"],
  ["resource:organizations", "building", "Organizations", "Gangs, businesses and departments"],
  ["resource:server-state", "gamepad", "Live game state", "AOP, peacetime and priority"],
];

const state = {
  data: null,
  view: "overview",
  editor: null,
  selectedSync: null,
  lastResult: null,
  aceEditor: { mode: "edit", group: "" },
  navFilter: "",
  homeFilter: "",
  openAreas: new Set(),
};

const toLocalInput = (ms) => {
  if (!ms) return "";
  const d = new Date(Number(ms));
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const guildName = (id) => state.data.guilds.find((guild) => guild.id === String(id))?.name || id;
const allRoles = () => state.data.guilds.flatMap((guild) => guild.roles.map((role) => ({ ...role, guild: guild.id, guildName: guild.name })));
const isScoped = () => Boolean(state.data?.scope && state.data.scope !== "full");

function toast(message, bad = false) {
  const node = $("#toast");
  node.innerHTML = `${icon(bad ? "alert" : "check")}<span>${esc(message)}</span>`;
  node.className = `toast show${bad ? " bad" : ""}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.className = `toast${bad ? " bad" : ""}`, bad ? 6000 : 3500);
}

function saved(message = "Saved, and it’s live", mode = "done") {
  const node = $("#saved-state");
  node.textContent = message;
  node.className = `saved-state ${mode}`;
  clearTimeout(saved.timer);
  saved.timer = setTimeout(() => {
    node.textContent = "Changes go live when you save";
    node.className = "saved-state";
  }, 3200);
}

/**
 * In-page confirmation. `actions` are buttons ({ label, value, kind }); resolves to the clicked
 * button's value, or null when the dialog is cancelled or dismissed.
 */
function ask({ title, body = "", tone = "danger", actions }) {
  const dialog = $("#ask");
  $("#ask-icon").className = `ask-icon${tone === "danger" ? "" : " info"}`;
  $("#ask-icon").innerHTML = icon(tone === "danger" ? "alert" : "info");
  $("#ask-title").textContent = title;
  $("#ask-body").textContent = body;
  $("#ask-actions").innerHTML = actions.map((action) => `<button value="${esc(action.value)}" class="btn ${esc(action.kind || "")}">${esc(action.label)}</button>`).join("");
  dialog.returnValue = "";
  dialog.showModal();
  $("#ask-actions .btn:not(.danger)")?.focus();
  return new Promise((resolve) => dialog.addEventListener("close", () => resolve(dialog.returnValue || null), { once: true }));
}
const confirmDanger = async (title, body, label = "Delete") =>
  (await ask({ title, body, actions: [{ label: "Cancel", value: "", kind: "ghost" }, { label, value: "yes", kind: "danger" }] })) === "yes";

async function api(path, options = {}) {
  const response = await fetch(`api/${path}`, {
    ...options,
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
  return result;
}

async function load({ silent = false } = {}) {
  if (!silent) saved("Loading the latest settings…", "working");
  state.data = await api("bootstrap");
  // Scoped users open on the first resource they can actually access.
  const scoped = isScoped();
  document.body.classList.toggle("scoped", scoped);
  $("#reconcile").hidden = scoped;
  const firstScopedView = state.data.resources[0] ? `resource:${state.data.resources[0].id}` : "audit";
  if (scoped && (!(state.view.startsWith("resource:") && resource(state.view.slice(9))) && state.view !== "audit")) state.view = firstScopedView;
  // "New sync" leaves nothing selected on purpose; only default to the first sync when not creating one.
  if (!state.selectedSync && !state.creatingSync && state.data.globalSyncs.length)
    state.selectedSync = state.data.globalSyncs[0].group_name;
  if (state.selectedSync && !state.data.globalSyncs.some((sync) => sync.group_name === state.selectedSync))
    state.selectedSync = state.data.globalSyncs[0]?.group_name || null;
  renderNav();
  // A background refresh never redraws a page with unsaved form edits or while someone is typing.
  const typing = $("#content").contains(document.activeElement) && document.activeElement.matches("input, textarea, select");
  if (!(silent && (state.dirty || typing))) render();
  $("#connection-dot").classList.toggle("live", state.data.online);
  $("#connection-label").textContent = state.data.online ? `${state.data.bot?.tag || "Bot"} is online` : "Bot is offline";
  if (!silent) saved("Up to date");
}

/** Shows a save is in progress on its button; returns a function that restores the button. */
function busy(button) {
  if (!button) return () => {};
  const label = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `<span class="spinner"></span>Saving…`;
  return () => {
    if (!button.isConnected) return;
    button.disabled = false;
    button.innerHTML = label;
  };
}

async function post(path, body) {
  saved("Saving and applying…", "working");
  try {
    const result = await api(path, { method: "POST", body: JSON.stringify(body) });
    state.data = result.data;
    state.lastResult = result.result || null;
    renderNav();
    render();
    saved();
    return result;
  } catch (error) {
    saved("Couldn’t save that change", "failed");
    throw error;
  }
}

const resource = (id) => state.data.resources.find((item) => item.id === id);
const records = (id) => state.data.records[id] || [];
const friendly = (id) => FRIENDLY[id] || [resource(id)?.label || id, resource(id)?.description || ""];

function go(view) {
  state.view = view;
  document.body.classList.remove("menu");
  renderNav();
  render();
  window.scrollTo({ top: 0 });
}

/* --------------------------------- sections --------------------------------- */
/** Every page the signed-in user can open, grouped into areas, with friendly names. */
function sections() {
  const areas = AREAS.map((area) => ({ ...area, items: [] }));
  const byGroup = new Map();
  for (const area of areas) for (const group of area.groups) byGroup.set(group, area);
  if (!isScoped()) {
    areas.find((area) => area.id === "access").items.push({ view: "acegroups", label: "Edit a permission group", blurb: "Tick exactly what each group can do, with a plain description of every permission.", count: null, special: true });
    areas.find((area) => area.id === "discord").items.push({ view: "globalsync", label: "Shared roles", blurb: "Roles that follow a permission group into every network server.", count: state.data.globalSyncs.length, special: true });
  }
  for (const item of state.data.resources) {
    let area = byGroup.get(item.group);
    if (!area) {
      area = { id: `group:${item.group}`, title: item.group, icon: "layers", blurb: "", groups: [item.group], items: [] };
      areas.splice(areas.length - 1, 0, area);
      byGroup.set(item.group, area);
    }
    const [label, blurb] = friendly(item.id);
    area.items.push({ view: `resource:${item.id}`, label, blurb, count: records(item.id).length });
  }
  return areas.filter((area) => area.items.length);
}

const areaOf = (view) => sections().find((area) => area.items.some((item) => item.view === view));

function matches(item, area, needle) {
  if (!needle) return true;
  const spec = item.view.startsWith("resource:") ? resource(item.view.slice(9)) : null;
  return `${item.label} ${item.blurb} ${area.title} ${spec?.label || ""}`.toLowerCase().includes(needle);
}

/* --------------------------------- navigation --------------------------------- */
function navLink(view, label, count, iconName = null) {
  return `<button class="nav-link ${state.view === view ? "active" : ""}" data-view="${esc(view)}">${iconName ? icon(iconName) : ""}<span class="label">${esc(label)}</span>${count === null || count === undefined ? "" : `<span class="count">${fmt(count)}</span>`}</button>`;
}

function renderNav() {
  const needle = state.navFilter.toLowerCase();
  const active = areaOf(state.view);
  if (active) state.openAreas.add(active.id);
  let html = "";
  const top = isScoped() ? [["audit", "Activity log", "clock"]] : [["overview", "Home", "home"], ["audit", "Activity log", "clock"]];
  html += top.filter(([, label]) => !needle || label.toLowerCase().includes(needle)).map(([view, label, ic]) => navLink(view, label, null, ic)).join("");
  let any = Boolean(html);
  for (const area of sections()) {
    const items = area.items.filter((item) => matches(item, area, needle));
    if (!items.length) continue;
    any = true;
    const open = needle || state.openAreas.has(area.id);
    html += `<details class="nav-area${area.advanced ? " advanced" : ""}${active?.id === area.id ? " has-active" : ""}" data-area="${esc(area.id)}" ${open ? "open" : ""}><summary>${icon(area.icon)}<span class="label">${esc(area.title)}</span><svg class="chev" viewBox="0 0 24 24" aria-hidden="true">${ICON.right}</svg></summary><div>${items.map((item) => navLink(item.view, item.label, item.count)).join("")}</div></details>`;
  }
  $("#nav").innerHTML = any ? html : `<p class="faint" style="padding:8px 10px;font-size:.86rem">Nothing matches “${esc(state.navFilter)}”.</p>`;
}

function setTitle(kicker, title) {
  $("#section-kicker").textContent = kicker;
  $("#section-title").textContent = title;
  document.title = `${title} · Florida Bay settings`;
}

/* --------------------------------- home --------------------------------- */
function renderOverview() {
  setTitle("Florida Bay Roleplay", "Home");
  const d = state.data;
  $("#content").innerHTML = `
    <section class="hero">
      <div>
        <h2>What would you like to change?</h2>
        <p>Pick a shortcut, browse by area, or search. Nothing changes until you press <strong>Save</strong>, and every change is recorded in the Activity log.</p>
        <label class="search">${icon("search")}<input id="home-search" type="search" placeholder="Search settings, e.g. “callsign”, “ticket”, “headtag”" value="${esc(state.homeFilter)}" autocomplete="off"></label>
      </div>
      <div class="hero-status">
        <span class="chip ${d.online ? "on" : "warn"}"><span class="swatch" style="background:currentColor"></span>${d.online ? `${esc(d.bot?.tag || "Bot")} is online` : "Bot is offline"}</span>
        <span class="faint" style="font-size:.82rem">${fmt(d.guilds.length)} Discord server${d.guilds.length === 1 ? "" : "s"} connected</span>
      </div>
    </section>
    <div id="home-body">${homeBody()}</div>`;
}

function homeBody() {
  const needle = state.homeFilter.trim().toLowerCase();
  const areas = sections();
  if (needle) {
    const hits = areas.flatMap((area) => area.items.filter((item) => matches(item, area, needle)).map((item) => ({ ...item, area })));
    if (!hits.length) return `<div class="card"><div class="empty"><strong>No settings match “${esc(state.homeFilter)}”</strong>Try a shorter word, or browse the areas in the menu.</div></div>`;
    return `<h3 class="section-title">${fmt(hits.length)} result${hits.length === 1 ? "" : "s"}</h3><div class="tasks">${hits.map((hit) => `<button class="task" data-go="${esc(hit.view)}"><span class="task-icon">${icon(hit.area.icon)}</span><span><strong>${esc(hit.label)}</strong><small>${esc(hit.area.title)} · ${esc(hit.blurb)}</small></span></button>`).join("")}</div>`;
  }
  const d = state.data;
  const network = new Map(records("network-guilds").map((row) => [String(row.guild_id), row.kind]));
  const tasks = TASKS.filter(([view]) => view === "acegroups" || resource(view.slice(9)));
  return `
    <h3 class="section-title">Common tasks</h3>
    <div class="tasks">${tasks.map(([view, ic, title, sub]) => `<button class="task" data-go="${esc(view)}"><span class="task-icon">${icon(ic)}</span><span><strong>${esc(title)}</strong><small>${esc(sub)}</small></span></button>`).join("")}</div>
    <h3 class="section-title">Browse by area</h3>
    <div class="areas">${areas.map((area) => `<section class="area${area.advanced ? " advanced" : ""}"><div class="area-head"><span class="task-icon">${icon(area.icon)}</span><h3>${esc(area.title)}</h3></div>${area.blurb ? `<p>${esc(area.blurb)}</p>` : ""}<div class="area-links">${area.items.map((item) => `<button data-go="${esc(item.view)}"><span>${esc(item.label)}</span>${item.count === null || item.count === undefined ? icon("right") : `<span class="count">${fmt(item.count)}</span>`}</button>`).join("")}</div></section>`).join("")}</div>
    <div class="home-cols">
      <section class="card">
        <div class="card-head"><div><h2>Discord servers</h2><p>Servers the bot is in. Only servers in the network get shared roles and network bans.</p></div></div>
        <div class="list">${d.guilds.map((guild) => `<div class="list-row"><div><div class="primary-text">${esc(guild.name)}</div><div class="secondary-text">${fmt(guild.memberCount)} members</div></div>${network.has(guild.id) ? `<span class="chip accent">${esc(KIND_LABELS[network.get(guild.id)] || network.get(guild.id))} server</span>` : `<span class="chip" title="Run /network add in this server to add it">Not in the network</span>`}</div>`).join("") || `<div class="empty">No connected Discord servers.</div>`}</div>
      </section>
      <section class="card">
        <div class="card-head"><div><h2>Recent changes</h2><p>The latest changes from Discord commands, the game and this page.</p></div><button class="btn sm" data-go="audit">See all</button></div>
        <div class="list">${auditRows(d.audit.slice(0, 6), true) || `<div class="empty">No activity yet.</div>`}</div>
      </section>
    </div>`;
}

/* --------------------------------- resources --------------------------------- */
function displayValue(meta, value) {
  if (value === null || value === undefined || value === "") return `<span class="faint">-</span>`;
  if (meta.type === "number" && meta.multiplier) {
    const shown = Number(value) / Number(meta.multiplier);
    return `<span>${esc(Number.isInteger(shown) ? shown : shown.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""))}${meta.suffix ? ` ${esc(meta.suffix)}` : ""}</span>`;
  }
  if (meta.type === "boolean") return `<span class="chip ${value ? "on" : ""}">${value ? "Yes" : "No"}</span>`;
  if (meta.type === "color") return `<span class="chip"><span class="swatch" style="background:${esc(value)}"></span>${esc(value)}</span>`;
  if (meta.type === "logo") return value ? `<span class="chip">Has logo</span>` : `<span class="faint">-</span>`;
  if (meta.type === "timestamp") return `<span title="${esc(time(value))}">${esc(ago(value))}</span>`;
  if (meta.type === "json") return `<span class="cell-json mono">${esc(JSON.stringify(value)).slice(0, 80)}</span>`;
  if (meta.type === "snowflake") return `<span class="mono faint">${esc(value)}</span>`;
  if (meta.type === "select") return `<span class="chip">${esc(value)}</span>`;
  if (meta.type === "relation") {
    const row = records(meta.source).find((item) => String(item[meta.value]) === String(value));
    return esc(row?.[meta.display] ?? value);
  }
  if (meta.type === "guild") return esc(guildName(value));
  if (meta.type === "role") {
    const role = allRoles().find((item) => item.id === String(value));
    return role ? `<span class="chip"><span class="swatch" style="background:${esc(role.color === "#000000" ? "#6e7b89" : role.color)}"></span>${esc(role.name)}</span>` : `<span class="mono faint">${esc(value)}</span>`;
  }
  if (meta.type === "channel") {
    const channel = state.data.guilds.flatMap((guild) => guild.channels).find((item) => item.id === String(value));
    return channel ? `#${esc(channel.name)}` : `<span class="mono faint">${esc(value)}</span>`;
  }
  return esc(value);
}

/** Values shown as plain text for searching (relations, roles and channels by name). */
function searchText(spec, row) {
  return spec.fields.map((meta) => {
    const value = row[meta.name];
    if (meta.type === "relation") return records(meta.source).find((item) => String(item[meta.value]) === String(value))?.[meta.display] ?? value;
    if (meta.type === "role") return allRoles().find((item) => item.id === String(value))?.name ?? value;
    if (meta.type === "guild") return guildName(value);
    return typeof value === "object" ? JSON.stringify(value) : value;
  }).join(" ").toLowerCase();
}

function goodToKnow(text, warn = false) {
  return text ? `<div class="tip${warn ? " warn" : ""}">${icon(warn ? "alert" : "info")}<div><strong>Good to know:</strong> ${esc(text)}</div></div>` : "";
}

function renderResource(id) {
  const spec = resource(id);
  if (!spec) return go(isScoped() ? "audit" : "overview");
  const rows = records(id);
  const [label, blurb] = friendly(id);
  const area = areaOf(`resource:${id}`);
  setTitle(area?.title || spec.group, label);
  const fields = spec.fields.filter((item) => !item.advanced && item.type !== "textarea").slice(0, 5);
  const editExisting = spec.editExisting !== false;
  $("#content").innerHTML = `
    <section class="page-intro"><span class="page-icon">${icon(area?.icon || "layers")}</span><div><h2>${esc(label)}</h2><p>${esc(blurb)}</p></div></section>
    ${goodToKnow(spec.description !== blurb ? spec.description : "", Boolean(area?.advanced) || id === "org-wallets")}
    ${id === "ace-entries" ? bundleCard() : ""}
    <section class="page-head">
      <label class="search">${icon("search")}<input id="resource-search" type="search" placeholder="Search ${esc(label.toLowerCase())}…"></label>
      <div class="page-actions"><button class="btn primary" data-create="${esc(id)}">${icon("plus")}Add new</button></div>
    </section>
    <div class="table-card">
      <div class="table-scroll"><table><thead><tr>${fields.map((item) => `<th>${esc(item.label)}</th>`).join("")}<th></th></tr></thead><tbody id="resource-rows">${resourceRows(id, rows, fields)}</tbody></table></div>
      <div class="table-foot"><span id="resource-count">${fmt(rows.length)} ${rows.length === 1 ? "entry" : "entries"}</span><span>${editExisting ? "Click any row to view or change it" : "Existing entries can only be changed by the Owner group"}</span></div>
    </div>`;
  $("#resource-search").addEventListener("input", (event) => {
    const needle = event.target.value.toLowerCase().trim();
    const filtered = rows.filter((row) => !needle || searchText(spec, row).includes(needle));
    $("#resource-rows").innerHTML = resourceRows(id, filtered, fields, Boolean(needle));
    $("#resource-count").textContent = `${fmt(filtered.length)} of ${fmt(rows.length)} entries`;
  });
}

function bundleCard() {
  return `<form id="bundle-form" class="card" style="margin-bottom:18px">
    <div class="card-head"><div><h2>Add a set of permissions at once</h2><p>Bundles are ready-made sets (the same as <code>/ace bundle</code> and <code>/vmenu bundle</code>). For full control, use Edit a permission group.</p></div></div>
    <div class="inline-form">
      <label class="field">Permission group<select name="group" required>${records("ace-groups").map((g) => `<option value="${esc(g.name)}">${esc(g.label)} (${esc(g.name)})</option>`).join("")}</select></label>
      <label class="field">Bundle<select name="bundle" required>${state.data.bundles.map((b) => `<option value="${esc(b.name)}" title="${esc(b.objects.join(", "))}">${esc(b.name)} (${b.objects.length} permissions)</option>`).join("")}</select></label>
      <label class="field">Action<select name="mode"><option value="grant">Give</option><option value="revoke">Take away</option></select></label>
      <button type="submit" class="btn">Apply</button>
    </div>
  </form>`;
}

function resourceRows(id, rows, fields, filtered = false) {
  if (!rows.length) return `<tr><td colspan="${fields.length + 1}"><div class="empty">${filtered ? "<strong>No matches</strong>Try a different search." : `<strong>Nothing here yet</strong>Add the first entry to get started.<br><button type="button" class="btn primary sm" data-create="${esc(id)}">${icon("plus")}Add new</button>`}</div></td></tr>`;
  const all = records(id);
  const editExisting = resource(id)?.editExisting !== false;
  return rows.map((row) => {
    const index = all.indexOf(row);
    const actions = editExisting ? `<button type="button" class="btn ghost sm" data-edit="${esc(id)}" data-index="${index}">${icon("edit")}Edit</button>` : "";
    return `<tr${editExisting ? ` data-edit="${esc(id)}" data-index="${index}" tabindex="0"` : ""}>${fields.map((meta) => `<td>${displayValue(meta, row[meta.name])}</td>`).join("")}<td class="actions">${actions}</td></tr>`;
  }).join("");
}

const SNOWFLAKE_HELP = "A Discord ID. In Discord, turn on Developer Mode, then right-click the person, role or channel and choose Copy ID.";

function inputFor(meta, value) {
  const required = meta.required ? "required" : "";
  const disabled = meta.readonly ? "disabled" : "";
  const raw = value ?? (meta.default === "now" ? Date.now() : meta.default ?? "");
  const current = meta.type === "number" && meta.multiplier && raw !== "" ? Number(raw) / Number(meta.multiplier) : raw;
  const helpText = meta.help || (meta.type === "snowflake" ? SNOWFLAKE_HELP : meta.type === "json" ? "Written as JSON. Keep the brackets and quotes as they are." : "");
  const help = helpText ? `<small>${esc(helpText)}</small>` : "";
  const label = `<span>${esc(meta.label)}${meta.required ? "" : ` <span class="opt">optional</span>`}</span>`;
  if (meta.type === "boolean") return `<label class="toggle"><input name="${esc(meta.name)}" type="checkbox" ${current ? "checked" : ""} ${disabled}> ${esc(meta.label)}</label>`;
  if (meta.type === "logo") {
    const orgId = state.editor?.original?.id;
    const src = value && orgId ? `/api/orgs/logo/${Number(orgId)}?v=${Number(value)}` : "";
    return `<div class="field logo-field" data-logo-field><span>${esc(meta.label)} <span class="opt">optional</span></span>
      <div class="logo-row"><div class="logo-preview" data-logo-preview>${src ? `<img src="${esc(src)}" alt="Current logo">` : `<span class="faint">No logo</span>`}</div>
        <div class="logo-actions"><label class="btn sm">${icon("plus")}<span data-logo-label>${src ? "Replace logo" : "Choose logo"}</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-logo-file hidden></label>
          ${src ? `<button type="button" class="btn ghost sm" data-logo-remove>${icon("trash")}Remove</button>` : ""}</div></div>
      <input type="hidden" name="${esc(meta.name)}" value="" data-logo-value>${help}</div>`;
  }
  if (meta.type === "textarea" || meta.type === "json")
    return `<label class="field">${label}<textarea name="${esc(meta.name)}" ${required} ${disabled} ${meta.type === "json" ? 'spellcheck="false" class="code"' : ""}>${esc(meta.type === "json" && typeof current !== "string" ? JSON.stringify(current, null, 2) : meta.type === "json" ? JSON.stringify(current) : current)}</textarea>${help}</label>`;
  if (meta.type === "timestamp")
    return `<label class="field">${label}<input name="${esc(meta.name)}" type="datetime-local" value="${esc(toLocalInput(value ?? (meta.default === "now" ? Date.now() : null)))}" ${required} ${disabled}>${help}</label>`;
  let options = null;
  if (meta.type === "select") options = (meta.options || []).map((item) => ({ value: item, label: item }));
  if (meta.type === "relation") options = records(meta.source).map((item) => ({ value: item[meta.value], label: item[meta.display] ?? item[meta.value] }));
  if (meta.type === "guild") options = state.data.guilds.map((guild) => ({ value: guild.id, label: guild.name }));
  if (meta.type === "role") options = allRoles().map((role) => ({ value: role.id, label: role.name, guild: role.guild }));
  if (meta.type === "channel") options = state.data.guilds.flatMap((guild) => guild.channels.map((channel) => ({ value: channel.id, label: `${channel.type === 4 ? "▸ " : "#"}${channel.name}`, guild: guild.id })));
  if (options) {
    const known = options.some((item) => String(item.value) === String(current));
    const stale = current !== "" && current !== null && !known ? `<option value="${esc(current)}" selected>${esc(current)} (no longer exists)</option>` : "";
    return `<label class="field">${label}<select name="${esc(meta.name)}" ${meta.guildField ? `data-guild-field="${esc(meta.guildField)}"` : ""} ${required} ${disabled}><option value="">${meta.required ? "Choose one…" : "None"}</option>${stale}${options.map((item) => `<option value="${esc(item.value)}" ${item.guild ? `data-guild="${esc(item.guild)}"` : ""} ${String(item.value) === String(current) ? "selected" : ""}>${esc(item.label)}</option>`).join("")}</select>${help}</label>`;
  }
  const type = meta.type === "number" ? "number" : meta.type === "color" ? "color" : "text";
  const list = meta.suggestions?.length ? `list="dl-${esc(meta.name)}"` : "";
  const datalist = meta.suggestions?.length ? `<datalist id="dl-${esc(meta.name)}">${meta.suggestions.map((item) => `<option value="${esc(item.value)}">${esc(item.label || "")}</option>`).join("")}</datalist>` : "";
  const limits = meta.type === "number" ? `${meta.min !== undefined ? `min="${esc(meta.min)}"` : ""} ${meta.max !== undefined ? `max="${esc(meta.max)}"` : ""} ${meta.step !== undefined ? `step="${esc(meta.step)}"` : ""}` : "";
  const extra = meta.type === "snowflake" ? 'inputmode="numeric" placeholder="e.g. 123456789012345678" autocomplete="off"' : "";
  return `<label class="field">${label}<input name="${esc(meta.name)}" type="${type}" value="${esc(current)}" ${list} ${limits} ${extra} ${required} ${disabled}>${datalist}${help}</label>`;
}

/** Role and channel pickers only list entries from the server picked in the same form. */
function filterByGuild(form) {
  for (const select of $$("select[data-guild-field]", form)) {
    const guild = form.elements[select.dataset.guildField]?.value;
    for (const option of select.options) {
      if (!option.dataset.guild) continue;
      option.hidden = Boolean(guild) && option.dataset.guild !== guild;
    }
    if (select.selectedOptions[0]?.hidden) select.value = "";
  }
}

function openEditor(id, row = null) {
  const spec = resource(id);
  const [label, blurb] = friendly(id);
  state.editor = { resource: id, original: row ? structuredClone(row) : null };
  $("#editor-kicker").textContent = label;
  const auto = spec.fields.find((meta) => meta.auto && row?.[meta.name]);
  $("#editor-title").textContent = row ? `Edit entry${auto ? ` #${row[auto.name]}` : ""}` : "Add new entry";
  // Auto-numbered IDs are shown in the title, never edited.
  const visible = spec.fields.filter((meta) => !meta.advanced && !meta.auto);
  const advanced = spec.fields.filter((meta) => meta.advanced);
  $("#editor-fields").innerHTML = `<p class="muted">${esc(blurb)}</p>` +
    visible.map((meta) => inputFor(meta, row?.[meta.name])).join("") +
    (advanced.length ? `<details class="more"><summary>${icon("right")}More options</summary><div>${advanced.map((meta) => inputFor(meta, row?.[meta.name])).join("")}</div></details>` : "");
  $("#editor-delete").hidden = !row || spec.editExisting === false;
  filterByGuild($("#editor-form"));
  $("#editor").showModal();
}

/* -------------------------------- shared roles -------------------------------- */
const KIND_LABELS = { main: "Main", staff: "Staff", gang: "Gang", department: "Department", community: "Community", business: "Business", partner: "Partner", other: "Other" };
const SCOPES = {
  all: "Every network server",
  satellites: "Every server except main",
  main: "Main server",
  staff: "Staff servers",
  gang: "Gang servers",
  department: "Department servers",
  community: "Community servers",
  business: "Business servers",
  partner: "Partner servers",
  other: "Other servers",
  custom: "Individually picked servers",
};
const scopeIncludes = (scope, kind) => scope === "all" || (scope === "satellites" ? kind !== "main" : scope === kind);

function syncForm(sync = null) {
  const groups = records("ace-groups");
  const chosen = new Set((sync?.guild_ids || []).map(String));
  const network = records("network-guilds");
  const pick = sync?.scope === "custom";
  const linked = new Map((sync?.roles || []).filter((link) => !link.managed).map((link) => [String(link.guild_id), String(link.role_id)]));
  const settings = new Map((sync?.server_settings || []).map((item) => [String(item.guild_id), item]));
  const anchors = new Map((sync?.anchors || []).map((item) => [String(item.guild_id), String(item.below_role_id)]));
  const serverRows = network.map((row) => {
    const id = String(row.guild_id);
    const guild = state.data.guilds.find((item) => item.id === id);
    const roles = (guild?.roles || []).filter((role) => !role.managed);
    const server = settings.get(id);
    const linkedRole = roles.find((role) => String(role.id) === linked.get(id));
    const permissions = String(server?.permissions ?? linkedRole?.permissions ?? sync?.permissions ?? "0");
    const allChannels = Boolean(server?.all_channels ?? sync?.all_channels);
    return `<div class="list-row server-row" data-server-row data-kind="${esc(row.kind)}" data-guild="${esc(id)}">
      <label class="toggle" data-pick-only><input type="checkbox" name="guild_ids" value="${esc(id)}" ${chosen.has(id) || linked.has(id) ? "checked" : ""}></label>
      <div class="server-name"><div class="primary-text">${esc(guildName(id))}</div><div class="secondary-text">${esc(KIND_LABELS[row.kind] || row.kind)} server<span data-excluded-note> · not included</span></div></div>
      <div class="server-role-settings">
        <select data-role-for="${esc(id)}" aria-label="Role in ${esc(guildName(id))}"><option value="" data-permissions="${esc(sync?.permissions || "0")}">Let the bot create the role</option>${roles.map((role) => `<option value="${esc(role.id)}" data-permissions="${esc(role.permissions || "0")}" ${linked.get(id) === role.id ? "selected" : ""}>Use existing role: ${esc(role.name)}${role.editable ? "" : " (above the bot)"}</option>`).join("")}</select>
        <label class="field compact"><span>Discord permissions</span><input data-permissions-for="${esc(id)}" inputmode="numeric" pattern="[0-9]{1,20}" value="${esc(permissions)}" required></label>
        <label class="field compact"><span>Position in this server</span><select data-below-for="${esc(id)}" aria-label="Position in ${esc(guildName(id))}"><option value="">${sync?.placement === "below" ? "Default: under Management Team" : "Network order (top of the server)"}</option>${roles.filter((role) => String(role.id) !== linked.get(id)).map((role) => `<option value="${esc(role.id)}" ${anchors.get(id) === role.id ? "selected" : ""}>Directly under: ${esc(role.name)}${role.editable ? "" : " (above the bot)"}</option>`).join("")}</select></label>
        <label class="toggle channel-toggle"><input data-channels-for="${esc(id)}" type="checkbox" ${allChannels ? "checked" : ""}> See and chat in every channel</label>
      </div>
    </div>`;
  }).join("");
  return `<form id="sync-form" class="form-grid">
    <label class="field">Permission group<select name="group" required ${sync ? "disabled" : ""}><option value="">Choose a group…</option>${groups.map((item) => `<option value="${esc(item.name)}" ${sync?.group_name === item.name ? "selected" : ""}>${esc(item.label)} (${esc(item.name)})</option>`).join("")}</select><small>Everyone directly in this group gets the role.</small></label>
    <label class="field"><span>Role name <span class="opt">optional</span></span><input name="role_name" maxlength="100" placeholder="Same as the group name" value="${esc(sync?.role_name || "")}"><small>Only used for roles the bot creates. Existing roles keep their name.</small></label>
    <div class="field">Role color<input name="color" type="color" value="${colorHex(sync?.color)}" ${sync && !Number(sync.color) ? "disabled" : ""}><label class="toggle"><input name="color_default" type="checkbox" data-color-default ${!sync || !Number(sync.color) ? "checked" : ""}> Use the default Discord role color (no color)</label></div>
    <div class="stack" style="gap:8px">
      <label class="toggle"><input name="hoist" type="checkbox" ${sync?.hoist ? "checked" : ""}> Show members separately in the member list</label>
      <label class="toggle"><input name="mentionable" type="checkbox" ${sync?.mentionable ? "checked" : ""}> Anyone can @mention this role</label>
    </div>
    <details class="more wide"><summary>${icon("right")}More options</summary><div>
      <label class="field">Default Discord permissions for newly connected servers<input name="permissions" inputmode="numeric" pattern="[0-9]{1,20}" value="${esc(sync?.permissions || "0")}" required><small>Each current server is configured below. Leave this at 0 for no extra permissions on future servers.</small></label>
      <label class="toggle"><input name="all_channels" type="checkbox" ${sync?.all_channels ? "checked" : ""}> Let the role see every channel by default in newly connected servers</label>
    </div></details>
    <div class="wide">
      <p class="section-label">Which servers?</p>
      <div class="mode-switch">
        <label class="toggle"><input type="radio" name="server_mode" value="type" ${pick ? "" : "checked"}> By server type</label>
        <label class="toggle"><input type="radio" name="server_mode" value="pick" ${pick ? "checked" : ""}> Let me pick servers</label>
      </div>
      <label class="field" data-type-only>Server type<select name="scope">${Object.entries(SCOPES).filter(([value]) => value !== "custom").map(([value, label]) => `<option value="${value}" ${(pick ? "all" : sync?.scope || "all") === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
    </div>
    <div class="wide">
      <p class="section-label">Role settings in each server</p>
      <p class="muted">Choose the role, its Discord permission number, and whether it can see and chat in every channel. Existing linked roles keep their name and appearance; their permissions follow the value here.</p>
      <div class="list server-list">${serverRows || `<div class="empty">No network servers yet. Add one under Connected servers.</div>`}</div>
    </div>
    <div class="wide" style="display:flex;gap:8px;justify-content:flex-end">${sync ? `<button type="button" class="btn danger-text" data-sync-delete="${esc(sync.group_name)}">${icon("trash")}Stop sharing this role</button>` : ""}<button type="submit" class="btn primary">${sync ? "Save and apply everywhere" : "Create shared role"}</button></div>
  </form>`;
}

/** Shows which servers a sync form currently includes and enables only their role pickers. */
function updateServerRows(form) {
  if (!form || form.id !== "sync-form") return;
  const pick = form.elements.server_mode.value === "pick";
  const scope = form.elements.scope.value;
  form.querySelector("[data-type-only]").hidden = pick;
  for (const row of $$("[data-server-row]", form)) {
    const box = row.querySelector('input[name="guild_ids"]');
    row.querySelector("[data-pick-only]").hidden = !pick;
    const included = pick ? box.checked : scopeIncludes(scope, row.dataset.kind);
    row.classList.toggle("excluded", !included);
    row.querySelector("[data-excluded-note]").hidden = included;
    for (const control of $$('[data-role-for], [data-permissions-for], [data-channels-for], [data-below-for]', row))
      control.disabled = !included;
  }
}

function linkedRoles(sync) {
  if (!sync?.roles.length) return `<p class="muted">Not created in any server yet.</p>`;
  return `<div class="list server-list">${sync.roles.map((link) => {
    const guild = state.data.guilds.find((item) => item.id === String(link.guild_id));
    const role = guild?.roles.find((item) => item.id === String(link.role_id));
    return `<div class="list-row"><div><div class="primary-text">${esc(guild?.name || link.guild_id)}</div><div class="secondary-text">${esc(role?.name || link.role_id)}${role && !role.editable ? " · above the bot’s role" : ""}</div></div><span class="chip ${link.managed ? "accent" : ""}">${link.managed ? "Created by the bot" : "Existing role"}</span></div>`;
  }).join("")}</div>`;
}

function resultBox() {
  const r = state.lastResult;
  if (!r || (!r.lines?.length && !r.swept)) return "";
  return `<div class="result-box"><strong>Saved. Here’s what changed:</strong>${r.swept ? `<p class="muted" style="margin-top:4px">Members: ${r.swept.added} given the role · ${r.swept.removed} removed from it</p>` : ""}${r.lines?.length ? `<ul>${r.lines.map((line) => `<li>${esc(line.replace(/\*\*|`/g, ""))}</li>`).join("")}</ul>` : ""}</div>`;
}

function renderGlobalSync() {
  setTitle("Discord servers", "Shared roles");
  const syncs = state.data.globalSyncs;
  const selected = syncs.find((item) => item.group_name === state.selectedSync) || null;
  $("#content").innerHTML = `
    ${resultBox()}
    <section class="page-intro"><span class="page-icon">${icon("globe")}</span><div><h2>Shared roles</h2><p>A shared role follows a permission group into every matching network server: members of the group get it automatically, and anyone else who is given it has it removed (and it’s reported).</p></div></section>
    <section class="page-head"><span></span><div class="page-actions"><button class="btn" data-sync-push title="Re-apply every shared role in every server">${icon("sync")}Re-apply all</button><button class="btn primary" data-sync-new>${icon("plus")}New shared role</button></div></section>
    <section class="sync-layout">
      <div class="card">
        <div class="card-head"><div><h2>Your shared roles</h2><p>Higher in this list sits higher in every server. Use the arrows to reorder.</p></div></div>
        <div class="sync-list">${syncs.map((item, index) => `<button class="sync-item ${selected?.group_name === item.group_name ? "active" : ""}" data-sync-select="${esc(item.group_name)}"><span><strong>${esc(item.role_name)}</strong><small>${esc(SCOPES[item.scope] || item.scope)}${item.all_channels ? " · all channels" : ""}</small></span><span style="display:flex;gap:2px">
          <span class="btn ghost sm icon" role="button" data-sync-up="${esc(item.group_name)}" ${index === 0 ? 'aria-disabled="true" style="visibility:hidden"' : ""} title="Move up">${icon("up")}</span>
          <span class="btn ghost sm icon" role="button" data-sync-down="${esc(item.group_name)}" ${index === syncs.length - 1 ? 'aria-disabled="true" style="visibility:hidden"' : ""} title="Move down">${icon("down")}</span></span></button>`).join("") || `<div class="empty"><strong>No shared roles yet</strong>Create one with New shared role.</div>`}</div>
      </div>
      <div class="card">
        <div class="card-head"><div><h2>${selected ? esc(selected.role_name) : "New shared role"}</h2><p>${selected ? `For the <strong>${esc(selected.group_name)}</strong> permission group. Saving updates Discord straight away.` : "Pick the permission group whose members should wear the role."}</p></div></div>
        <div class="card-body">
          ${syncForm(selected)}
          ${selected ? `<div class="divider"></div><p class="section-label">Where this role exists now</p>${linkedRoles(selected)}` : ""}
          <div class="divider"></div>
          ${bindForm(selected)}
        </div>
      </div>
    </section>`;
  const bind = $("#bind-form");
  if (bind) filterByGuild(bind);
  updateServerRows($("#sync-form"));
}

function bindForm(sync) {
  const network = records("network-guilds");
  const groups = records("ace-groups");
  return `<details class="more"><summary>${icon("right")}Link a role that already exists in one server</summary><div>
    <p class="muted" style="font-size:.86rem">Same as <code>/globalsync bind</code>: the role becomes this group’s role in that server and is left looking exactly as it is.</p>
    <form id="bind-form" class="form-grid">
    <label class="field">Permission group<select name="group" required ${sync ? "disabled" : ""}>${sync ? `<option value="${esc(sync.group_name)}">${esc(sync.group_name)}</option>` : `<option value="">Choose a group…</option>${groups.map((g) => `<option value="${esc(g.name)}">${esc(g.label)} (${esc(g.name)})</option>`).join("")}`}</select></label>
    <label class="field">Discord server<select name="guild_id" required>${network.map((row) => `<option value="${esc(row.guild_id)}">${esc(guildName(row.guild_id))}</option>`).join("")}</select></label>
    <label class="field wide">Existing role<select name="role_id" data-guild-field="guild_id" required><option value="">Choose a role…</option>${allRoles().map((role) => `<option value="${role.id}" data-guild="${role.guild}">${esc(role.name)}${role.editable ? "" : " (above the bot)"}</option>`).join("")}</select></label>
    <div class="wide" style="display:flex;justify-content:flex-end"><button type="submit" class="btn">Link role</button></div></form>
  </div></details>`;
}

/* ---------------------- permission group editor (checkboxes) ---------------------- */
function aceSections(selected) {
  const catalog = state.data.catalog || [];
  const known = new Set(catalog.map((entry) => entry.object));
  const custom = [...selected].filter((object) => !known.has(object)).map((object) => ({ category: "Other permissions this group has", object, label: object, description: "Given to this group but not in the built-in list. Untick to remove it." }));
  const rows = [...catalog, ...custom];
  const categories = [...new Set(rows.map((entry) => entry.category))];
  return categories.map((category) => {
    const items = rows.filter((entry) => entry.category === category);
    const picked = items.filter((entry) => selected.has(entry.object)).length;
    return `<details class="ace-section" data-ace-section ${picked ? "open" : ""}><summary><span>${esc(category)}</span><small data-section-count>${picked}/${items.length}</small></summary><div class="ace-grid">${items.map((entry) => `<label class="ace-option" data-ace-option data-ace-search="${esc(`${entry.label} ${entry.object} ${entry.description} ${entry.category}`.toLowerCase())}"><input type="checkbox" name="objects" value="${esc(entry.object)}" ${selected.has(entry.object) ? "checked" : ""}><span><strong>${esc(entry.label)}</strong><small>${esc(entry.description)}</small><code>${esc(entry.object)}</code></span></label>`).join("")}</div></details>`;
  }).join("");
}

function renderAceGroups() {
  setTitle("Permissions", "Edit a permission group");
  const editor = state.aceEditor;
  const groups = records("ace-groups");
  if (editor.mode === "edit" && !groups.some((g) => g.name === editor.group)) editor.group = [...groups].sort((a, b) => b.rank_order - a.rank_order)[0]?.name || "";
  const group = editor.mode === "edit" ? groups.find((g) => g.name === editor.group) : null;
  const entries = group ? records("ace-entries").filter((row) => row.group_name === group.name) : [];
  const selected = new Set(entries.filter((row) => row.mode === "allow").map((row) => row.object));
  const denies = entries.filter((row) => row.mode === "deny");
  const members = group ? records("ace-memberships").filter((row) => row.group_name === group.name).length : 0;
  const ranks = group ? records("roster-ranks").filter((row) => row.ace_group === group.name).map((row) => row.name) : [];
  const fields = editor.mode === "create"
    ? `<label class="field">Short name<input name="name" required pattern="[a-z0-9_-]{1,40}" placeholder="senior_moderator"><small>Lowercase letters, numbers, _ or -. Used in commands; can’t be changed later.</small></label>
       <label class="field">Display name<input name="label" required maxlength="80" placeholder="Senior Moderator"></label>
       <label class="field">Rank level<input name="rank_order" type="number" min="0" max="10000" value="500" required><small>Higher numbers outrank lower ones. Staff can only manage people below their own highest rank.</small></label>
       <label class="toggle" style="align-self:start;margin-top:26px"><input name="staff_only" type="checkbox" checked> Only active in game while clocked in</label>`
    : group ? `<label class="field">Display name<input name="label" required maxlength="80" value="${esc(group.label)}"></label>
       <label class="field">Rank level<input name="rank_order" type="number" min="0" max="10000" value="${esc(group.rank_order)}" required><small>Higher numbers outrank lower ones.</small></label>
       <label class="toggle wide"><input name="staff_only" type="checkbox" ${group.staff_only ? "checked" : ""}> Only active in game while clocked in</label>
       <div class="wide" style="display:flex;flex-wrap:wrap;gap:6px"><span class="chip accent">${fmt(selected.size)} allowed</span>${denies.length ? `<span class="chip bad" title="${esc(denies.map((d) => d.object).join(", "))}">${fmt(denies.length)} blocked (kept as is)</span>` : ""}<span class="chip">${fmt(members)} member${members === 1 ? "" : "s"}</span>${ranks.length ? `<span class="chip">Staff rank: ${esc(ranks.join(", "))}</span>` : ""}</div>`
      : `<div class="wide empty"><strong>No permission groups yet</strong>Switch to Create a new group to make one.</div>`;
  $("#content").innerHTML = `
    ${resultBox()}
    <section class="page-intro"><span class="page-icon">${icon("key")}</span><div><h2>Edit a permission group</h2><p>Pick a group, tick what it should be able to do, then save. Every permission is explained in plain words, and saving updates Discord and the game right away.</p></div></section>
    <section class="card">
      <div class="card-head" style="align-items:center">
        <div class="mode-tabs" role="tablist"><button type="button" data-ace-mode="edit" class="${editor.mode === "edit" ? "on" : ""}">Edit a group</button><button type="button" data-ace-mode="create" class="${editor.mode === "create" ? "on" : ""}">Create a new group</button></div>
        ${editor.mode === "edit" && groups.length ? `<select id="ace-group-select" style="max-width:360px" aria-label="Group to edit">${[...groups].sort((a, b) => b.rank_order - a.rank_order).map((g) => `<option value="${esc(g.name)}" ${g.name === editor.group ? "selected" : ""}>${esc(g.label)} (${esc(g.name)}) · level ${esc(g.rank_order)}</option>`).join("")}</select>` : ""}
      </div>
      <form id="ace-group-form" data-mode="${editor.mode}">
        <div class="card-body form-grid">${fields}</div>
        ${editor.mode === "create" || group ? `<div class="ace-toolbar"><label class="search">${icon("search")}<input id="ace-filter" type="search" placeholder="Search, e.g. noclip, bans, tickets, weapons…"></label><div class="actions"><button type="button" class="btn sm" id="ace-select-shown">Tick all shown</button><button type="button" class="btn sm" id="ace-clear-shown">Untick all shown</button><button type="button" class="btn sm ghost" id="ace-collapse">Expand all</button><span class="ace-count" id="ace-count"></span></div></div>
        <div id="ace-sections">${aceSections(selected)}</div>
        <div class="ace-save"><p>${editor.mode === "create" ? "Creates the group with exactly what’s ticked." : "Ticked permissions are allowed; anything you untick is removed from this group."} To give the group a Discord role, use <code>/ace bind-role</code> or link it to a staff rank under Staff team → Staff ranks.</p><button type="submit" class="btn primary">${icon("check")}${editor.mode === "create" ? "Create group" : "Save group"}</button></div>` : ""}
      </form>
    </section>`;
  refreshAceCount();
}

function refreshAceCount() {
  const host = $("#ace-sections");
  if (!host) return;
  const checked = $$("[data-ace-option] input:checked", host).length;
  $("#ace-count").textContent = `${checked} ticked`;
  for (const section of $$("[data-ace-section]", host)) {
    const inputs = $$("input", section);
    section.querySelector("[data-section-count]").textContent = `${inputs.filter((input) => input.checked).length} of ${inputs.length}`;
  }
}

function filterAceOptions() {
  const query = String($("#ace-filter")?.value || "").trim().toLowerCase();
  for (const option of $$("[data-ace-option]")) option.hidden = Boolean(query) && !option.dataset.aceSearch.includes(query);
  for (const section of $$("[data-ace-section]")) {
    section.hidden = !section.querySelector("[data-ace-option]:not([hidden])");
    if (query && !section.hidden) section.open = true;
  }
}

/* ------------------------------------ activity log ------------------------------------ */
const ACTION_WORDS = { ace: "permission", coc: "chain of command", botguard: "Bot Guard", orgbank: "organization bank", globalsync: "shared role", aop: "AOP" };
function actionLabel(action) {
  const text = String(action || "").split(/[._:]+/).map((word) => ACTION_WORDS[word] || word.replace(/[-_]/g, " ")).join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function auditRows(rows, compact = false) {
  return rows.map((row) => {
    const payload = JSON.stringify(row.payload || {}, null, 2);
    const actor = row.actor_id === "web-panel" ? "This settings page" : row.actor_id;
    const who = `<div class="who">by <span class="${row.actor_id === "web-panel" ? "" : "mono"}">${esc(actor)}</span>${row.target_id ? ` · <span class="mono">${esc(row.target_id)}</span>` : ""}</div>`;
    if (compact) return `<div class="list-row"><div style="min-width:0"><div class="primary-text" title="${esc(row.action)}">${esc(actionLabel(row.action))}</div><div class="secondary-text">${esc(actor)}</div></div><time class="faint" style="font-size:.8rem;white-space:nowrap" title="${esc(time(row.created_at))}">${esc(ago(row.created_at))}</time></div>`;
    return `<div class="audit-row"><time title="${esc(time(row.created_at))}">${esc(ago(row.created_at))}</time><div><div class="what" title="${esc(row.action)}">${esc(actionLabel(row.action))}</div>${who}</div><details><summary>${payload === "{}" ? "No extra details" : "Show details"}</summary>${payload === "{}" ? "" : `<pre>${esc(payload)}</pre>`}</details></div>`;
  }).join("");
}

function renderAudit() {
  setTitle("Settings", "Activity log");
  $("#content").innerHTML = `
    <section class="page-intro"><span class="page-icon">${icon("clock")}</span><div><h2>Activity log</h2><p>The latest 80 changes made through Discord commands, the game server and this page.</p></div></section>
    <section class="page-head"><label class="search">${icon("search")}<input id="audit-search" type="search" placeholder="Filter by action or ID…"></label></section>
    <section class="card"><div class="list" id="audit-list">${auditRows(state.data.audit) || `<div class="empty">No activity yet.</div>`}</div></section>`;
  $("#audit-search").addEventListener("input", (event) => {
    const needle = event.target.value.toLowerCase().trim();
    $("#audit-list").innerHTML = auditRows(state.data.audit.filter((row) => !needle || `${JSON.stringify(row)} ${actionLabel(row.action)}`.toLowerCase().includes(needle))) || `<div class="empty">No matching activity.</div>`;
  });
}

function render() {
  if (!state.data) return;
  state.dirty = false;
  if (isScoped() && !(state.view.startsWith("resource:") && resource(state.view.slice(9))) && state.view !== "audit")
    state.view = state.data.resources[0] ? `resource:${state.data.resources[0].id}` : "audit";
  if (state.view === "overview") renderOverview();
  else if (state.view === "globalsync") renderGlobalSync();
  else if (state.view === "acegroups") renderAceGroups();
  else if (state.view === "audit") renderAudit();
  else if (state.view.startsWith("resource:")) renderResource(state.view.slice(9));
}

/* ----------------------------------- events ----------------------------------- */
$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  location.href = "portal.html?next=control";
});

$("#nav").addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (button) return go(button.dataset.view);
  const summary = event.target.closest(".nav-area > summary");
  if (summary) {
    const area = summary.parentElement;
    // The <details> toggles after this click handler, so record the state it is about to have.
    if (area.open) state.openAreas.delete(area.dataset.area);
    else state.openAreas.add(area.dataset.area);
  }
});
$("#nav-search").addEventListener("input", (event) => {
  state.navFilter = event.target.value.trim();
  renderNav();
});
$("#nav-search").addEventListener("keydown", (event) => {
  if (event.key === "Enter") $("#nav [data-view]")?.click();
});
$("#menu-open").addEventListener("click", () => document.body.classList.add("menu"));
$$("[data-menu-close]").forEach((node) => node.addEventListener("click", () => document.body.classList.remove("menu")));

async function deleteRow(id, index) {
  const spec = resource(id);
  const row = records(id)[Number(index)];
  const [label] = friendly(id);
  if (!await confirmDanger("Delete this entry?", `It will be removed from ${label} and the change goes live straight away.`)) return false;
  try {
    await post("record/delete", { resource: id, key: Object.fromEntries(spec.pk.map((key) => [key, row[key]])) });
    toast("Deleted. Discord and the game are up to date.");
    return true;
  } catch (error) { toast(error.message, true); return false; }
}

async function moveSync(key, up) {
  const order = state.data.globalSyncs.map((item) => item.group_name);
  const index = order.indexOf(key);
  const target = up ? index - 1 : index + 1;
  if (target < 0 || target >= order.length) return;
  [order[index], order[target]] = [order[target], order[index]];
  try { await post("globalsync/order", { groups: order }); toast("New role order applied."); }
  catch (error) { toast(error.message, true); }
}

$("#content").addEventListener("click", async (event) => {
  const nav = event.target.closest("[data-go]");
  if (nav) { state.homeFilter = ""; return go(nav.dataset.go); }
  const create = event.target.closest("[data-create]");
  if (create) return openEditor(create.dataset.create);
  const edit = event.target.closest("[data-edit]");
  if (edit) return openEditor(edit.dataset.edit, records(edit.dataset.edit)[Number(edit.dataset.index)]);
  const aceMode = event.target.closest("[data-ace-mode]");
  if (aceMode) { state.aceEditor.mode = aceMode.dataset.aceMode; state.lastResult = null; return renderAceGroups(); }
  if (event.target.closest("#ace-select-shown, #ace-clear-shown")) {
    const value = Boolean(event.target.closest("#ace-select-shown"));
    for (const input of $$("[data-ace-option]:not([hidden]) input")) if (!input.closest("[data-ace-section]").hidden) input.checked = value;
    return refreshAceCount();
  }
  if (event.target.closest("#ace-collapse")) {
    const sections = $$("[data-ace-section]");
    const open = sections.every((section) => section.open);
    sections.forEach((section) => section.open = !open);
    $("#ace-collapse").textContent = open ? "Expand all" : "Collapse all";
    return;
  }
  const up = event.target.closest("[data-sync-up]");
  if (up) { event.stopPropagation(); return moveSync(up.dataset.syncUp, true); }
  const down = event.target.closest("[data-sync-down]");
  if (down) { event.stopPropagation(); return moveSync(down.dataset.syncDown, false); }
  const select = event.target.closest("[data-sync-select]");
  if (select) { state.selectedSync = select.dataset.syncSelect; state.creatingSync = false; state.dirty = false; return renderGlobalSync(); }
  if (event.target.closest("[data-sync-new]")) { state.selectedSync = null; state.creatingSync = true; state.lastResult = null; state.dirty = false; return renderGlobalSync(); }
  if (event.target.closest("[data-sync-push]")) {
    try { await post("globalsync/push", {}); toast("Shared roles re-applied in every server."); }
    catch (error) { toast(error.message, true); }
    return;
  }
  const del = event.target.closest("[data-sync-delete]");
  if (del) {
    const choice = await ask({
      title: `Stop sharing the ${del.dataset.syncDelete} role?`,
      body: "Members will no longer be given or checked for this role. You can also delete the roles the bot created; roles you linked that already existed are always kept.",
      actions: [
        { label: "Cancel", value: "", kind: "ghost" },
        { label: "Stop, keep the roles", value: "keep" },
        { label: "Stop and delete bot roles", value: "delete", kind: "danger" },
      ],
    });
    if (!choice) return;
    try {
      await post("globalsync/delete", { group: del.dataset.syncDelete, delete_roles: choice === "delete" });
      state.selectedSync = state.data.globalSyncs[0]?.group_name || null;
      renderGlobalSync();
      toast("Shared role removed.");
    } catch (error) { toast(error.message, true); }
  }
});

$("#content").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.target.matches("tr[data-edit]")) openEditor(event.target.dataset.edit, records(event.target.dataset.edit)[Number(event.target.dataset.index)]);
  if (event.key === "Enter" && event.target.id === "home-search") $("#home-body [data-go]")?.click();
});

$("#content").addEventListener("input", (event) => {
  if (event.target.id === "ace-filter") filterAceOptions();
  if (event.target.id === "home-search") { state.homeFilter = event.target.value; $("#home-body").innerHTML = homeBody(); }
});

$("#content").addEventListener("change", (event) => {
  if (event.target.id === "ace-group-select") { state.aceEditor.group = event.target.value; state.lastResult = null; return renderAceGroups(); }
  if (event.target.name === "objects") return refreshAceCount();
  const form = event.target.form;
  if (!form) return;
  if (event.target.matches("[data-role-for]")) {
    const row = event.target.closest("[data-server-row]");
    const permissions = event.target.selectedOptions[0]?.dataset.permissions;
    if (row && permissions !== undefined) row.querySelector("[data-permissions-for]").value = permissions;
  }
  if (event.target.name === "color_default") form.elements.color.disabled = event.target.checked;
  if (form.id === "sync-form") return updateServerRows(form);
  filterByGuild(form);
});
$("#editor-form").addEventListener("change", (event) => filterByGuild(event.currentTarget));

$("#content").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const submit = form.querySelector("button[type=submit]");
  const values = new FormData(form);
  if (form.id === "sync-form") {
    const pick = values.get("server_mode") === "pick";
    const included = $$("[data-server-row]", form).filter((row) => !row.classList.contains("excluded"));
    if (pick && !included.length && !await confirmDanger("No servers picked", "With no servers picked, this role will be removed from every server. Continue?", "Remove everywhere")) return;
  }
  const restore = busy(submit);
  try {
    if (form.id === "sync-form") {
      const pick = values.get("server_mode") === "pick";
      const included = $$("[data-server-row]", form).filter((row) => !row.classList.contains("excluded"));
      const body = {
        group: values.get("group") || state.selectedSync,
        role_name: values.get("role_name") || undefined,
        scope: pick ? "custom" : values.get("scope"),
        permissions: values.get("permissions"),
        color: values.has("color_default") ? "default" : values.get("color"),
        hoist: values.has("hoist"),
        mentionable: values.has("mentionable"),
        all_channels: values.has("all_channels"),
        guild_ids: pick ? values.getAll("guild_ids") : undefined,
        existing_roles: included.map((row) => ({ guild_id: row.dataset.guild, role_id: row.querySelector("[data-role-for]").value })),
        server_settings: $$('[data-server-row]', form).map((row) => ({
          guild_id: row.dataset.guild,
          permissions: row.querySelector("[data-permissions-for]").value,
          all_channels: row.querySelector("[data-channels-for]").checked,
          below_role_id: row.querySelector("[data-below-for]").value,
        })),
      };
      await post("globalsync/save", body);
      state.selectedSync = body.group;
      state.creatingSync = false;
      renderGlobalSync();
      toast("Shared role saved and applied in every server.");
    } else if (form.id === "bundle-form") {
      await post("ace/bundle", { group: values.get("group"), bundle: values.get("bundle"), mode: values.get("mode") });
      toast(`Bundle ${values.get("mode") === "revoke" ? "taken away" : "given"}. It’s live now.`);
    } else if (form.id === "bind-form") {
      const group = values.get("group") || state.selectedSync;
      const result = await post("globalsync/bind", { group, guild_id: values.get("guild_id"), role_id: values.get("role_id") });
      state.selectedSync = group;
      state.creatingSync = false;
      renderGlobalSync();
      toast(result.result?.created ? "Shared role created from the existing role." : "Existing role linked.");
    } else if (form.id === "ace-group-form") {
      const creating = form.dataset.mode === "create";
      const body = {
        mode: creating ? "create" : "edit",
        name: creating ? values.get("name") : state.aceEditor.group,
        label: values.get("label"),
        rank_order: Number(values.get("rank_order")),
        staff_only: values.has("staff_only"),
        objects: values.getAll("objects"),
      };
      const result = await post("ace/group/save", body);
      state.aceEditor = { mode: "edit", group: result.result?.group || body.name };
      renderNav();
      renderAceGroups();
      toast(`${body.label || body.name} saved. It’s live now.`);
    }
  } catch (error) {
    toast(error.message, true);
  } finally {
    restore();
  }
});

/** Scale a picked image to fit 256x256 and return it as a PNG data URL (a logo never needs more). */
async function scaleLogo(file) {
  if (!file || !/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error("Choose a PNG, JPEG, WebP or GIF image.");
  if (file.size > 12 * 1024 * 1024) throw new Error("That image is too large. Pick one under 12 MB.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

$("#editor-fields").addEventListener("change", async (event) => {
  const input = event.target.closest?.("[data-logo-file]");
  if (!input) return;
  const field = input.closest("[data-logo-field]");
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  try {
    const url = await scaleLogo(file);
    field.querySelector("[data-logo-value]").value = url;
    field.querySelector("[data-logo-preview]").innerHTML = `<img src="${url}" alt="New logo">`;
    field.querySelector("[data-logo-label]").textContent = "Choose another";
  } catch (error) { toast(error.message, true); }
});

$("#editor-fields").addEventListener("click", (event) => {
  const button = event.target.closest?.("[data-logo-remove]");
  if (!button) return;
  const field = button.closest("[data-logo-field]");
  field.querySelector("[data-logo-value]").value = "remove";
  field.querySelector("[data-logo-preview]").innerHTML = `<span class="faint">Logo will be removed</span>`;
  button.remove();
});

$("#editor-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.editor) return;
  const spec = resource(state.editor.resource);
  const form = new FormData(event.target);
  const record = {};
  for (const meta of spec.fields) {
    if (meta.readonly && meta.auto && !state.editor.original?.[meta.name]) continue;
    if (meta.type === "boolean") record[meta.name] = form.has(meta.name);
    else if (meta.readonly) record[meta.name] = state.editor.original?.[meta.name];
    else if (meta.type === "timestamp") record[meta.name] = form.get(meta.name) ? new Date(form.get(meta.name)).getTime() : "";
    else record[meta.name] = form.get(meta.name);
  }
  const restore = busy(event.target.querySelector("button[type=submit]"));
  try {
    await post("record/save", { resource: state.editor.resource, record, original: state.editor.original });
    $("#editor").close();
    toast("Saved. It’s live now.");
  } catch (error) { toast(error.message, true); }
  finally { restore(); }
});

$("#editor-delete").addEventListener("click", async () => {
  if (!state.editor?.original) return;
  const index = records(state.editor.resource).findIndex((row) => JSON.stringify(row) === JSON.stringify(state.editor.original));
  if (index < 0) return toast("That entry has changed since you opened it. Reload and try again.", true);
  if (await deleteRow(state.editor.resource, index)) $("#editor").close();
});

$$("[data-close]").forEach((button) => button.addEventListener("click", () => $("#editor").close()));
$("#editor").addEventListener("click", (event) => { if (event.target === $("#editor")) $("#editor").close(); });
$("#ask").addEventListener("click", (event) => { if (event.target === $("#ask")) $("#ask").close(); });
$("#refresh").addEventListener("click", () => load().catch((error) => toast(error.message, true)));
$("#reconcile").addEventListener("click", async () => {
  const button = $("#reconcile");
  button.disabled = true;
  try { await post("reconcile", {}); toast("Everything re-synced: Discord roles and in-game permissions match these settings."); }
  catch (error) { toast(error.message, true); }
  finally { button.disabled = false; }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "/" && !event.target.closest("input, textarea, select") && !$("#app").hidden) {
    event.preventDefault();
    const home = $("#home-search");
    (home || $("#nav-search")).focus();
  }
  if (event.key === "Escape") document.body.classList.remove("menu");
});

load().then(() => {
  $("#login").hidden = true;
  $("#app").hidden = false;
}).catch((error) => {
  $("#login").hidden = false;
  $("#app").hidden = true;
  $("#login-error").textContent = error.message;
});

// Typing or changing anything in a page form marks it as having unsaved edits.
for (const type of ["input", "change"])
  $("#content").addEventListener(type, (event) => {
    if (event.target.closest("form")) state.dirty = true;
  });

setInterval(() => {
  // The permission editor holds unsaved ticks, so it is never refreshed underneath the user.
  if (state.data && !$("#editor").open && !$("#ask").open && !document.hidden && state.view !== "acegroups")
    load({ silent: true }).catch(() => {});
}, 30000);
