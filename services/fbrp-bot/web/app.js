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
  sync: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[name] || ICON.layers}</svg>`;
const GROUP_ICON = { Access: "key", Network: "globe", Discord: "chat", Tickets: "ticket", Community: "users", "Staff roster": "badge", Security: "lock", FiveM: "server", Advanced: "cog" };

const state = {
  data: null,
  view: "overview",
  editor: null,
  selectedSync: null,
  lastResult: null,
  aceEditor: { mode: "edit", group: "" },
  navFilter: "",
};

const toLocalInput = (ms) => {
  if (!ms) return "";
  const d = new Date(Number(ms));
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const guildName = (id) => state.data.guilds.find((guild) => guild.id === String(id))?.name || id;
const allRoles = () => state.data.guilds.flatMap((guild) => guild.roles.map((role) => ({ ...role, guild: guild.id, guildName: guild.name })));

function toast(message, bad = false) {
  const node = $("#toast");
  node.textContent = message;
  node.className = `toast show${bad ? " bad" : ""}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.className = "toast", 3500);
}

function saved(message = "Saved and applied live", mode = "done") {
  const node = $("#saved-state");
  node.textContent = message;
  node.className = `saved-state ${mode}`;
  clearTimeout(saved.timer);
  saved.timer = setTimeout(() => {
    node.textContent = "All changes apply live";
    node.className = "saved-state";
  }, 3200);
}

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
  if (!silent) saved("Loading live configuration…", "working");
  state.data = await api("bootstrap");
  // "New sync" leaves nothing selected on purpose; only default to the first sync when not creating one.
  if (!state.selectedSync && !state.creatingSync && state.data.globalSyncs.length)
    state.selectedSync = state.data.globalSyncs[0].group_name;
  if (state.selectedSync && !state.data.globalSyncs.some((sync) => sync.group_name === state.selectedSync))
    state.selectedSync = state.data.globalSyncs[0]?.group_name || null;
  renderNav();
  // A background refresh never redraws a page with unsaved form edits.
  if (!(silent && state.dirty)) render();
  $("#connection-dot").classList.toggle("live", state.data.online);
  $("#connection-label").textContent = state.data.online ? `${state.data.bot?.tag || "Bot"} online` : "Bot offline";
  if (!silent) saved("Live configuration loaded");
}

/** Shows a save is in progress on its button; returns a function that restores the button. */
function busy(button) {
  if (!button) return () => {};
  const label = button.innerHTML;
  button.disabled = true;
  button.textContent = "Saving…";
  return () => {
    if (!button.isConnected) return;
    button.disabled = false;
    button.innerHTML = label;
  };
}

async function post(path, body) {
  saved("Applying changes…", "working");
  try {
    const result = await api(path, { method: "POST", body: JSON.stringify(body) });
    state.data = result.data;
    state.lastResult = result.result || null;
    renderNav();
    render();
    saved();
    return result;
  } catch (error) {
    saved("Change failed", "working");
    throw error;
  }
}

const resource = (id) => state.data.resources.find((item) => item.id === id);
const records = (id) => state.data.records[id] || [];

function go(view) {
  state.view = view;
  renderNav();
  render();
  window.scrollTo({ top: 0 });
}

/* --------------------------------- navigation --------------------------------- */
function navButton(view, label, count, iconName = null) {
  return `<button data-view="${esc(view)}" class="${state.view === view ? "active" : ""}"><span class="label">${iconName ? icon(iconName) : ""}${esc(label)}</span>${count === null ? "" : `<span class="count">${fmt(count)}</span>`}</button>`;
}

function renderNav() {
  const needle = state.navFilter.toLowerCase();
  const match = (label) => !needle || label.toLowerCase().includes(needle);
  const grouped = new Map();
  for (const item of state.data.resources) {
    if (!match(`${item.label} ${item.group}`)) continue;
    if (!grouped.has(item.group)) grouped.set(item.group, []);
    grouped.get(item.group).push(item);
  }
  let html = "";
  const top = [
    ["overview", "Overview", null, "home"],
    ["acegroups", "Permission groups", records("ace-groups").length, "key"],
    ["globalsync", "Global roles", state.data.globalSyncs.length, "globe"],
  ].filter(([, label]) => match(label));
  html += top.map(([view, label, count, iconName]) => navButton(view, label, count, iconName)).join("");
  for (const [group, items] of grouped) {
    html += `<div class="nav-group">${icon(GROUP_ICON[group] || "layers")}${esc(group)}</div>`;
    html += items.map((item) => navButton(`resource:${item.id}`, item.label, records(item.id).length)).join("");
  }
  if (match("Audit trail")) html += `<div class="nav-group">${icon("clock")}System</div>${navButton("audit", "Audit trail", state.data.audit.length)}`;
  $("#nav").innerHTML = html || `<p class="faint" style="padding:8px 10px;font-size:.82rem">No section matches.</p>`;
}

function setTitle(kicker, title) {
  $("#section-kicker").textContent = kicker;
  $("#section-title").textContent = title;
  document.title = `${title} · Florida Bay`;
}

/* --------------------------------- overview --------------------------------- */
function renderOverview() {
  setTitle("Florida Bay Roleplay", "Overview");
  const d = state.data;
  const metrics = [
    ["Discord servers", d.guilds.length, "resource:network-guilds"],
    ["Global roles", d.globalSyncs.length, "globalsync"],
    ["ACE groups", records("ace-groups").length, "acegroups"],
    ["ACE permissions", records("ace-entries").length, "resource:ace-entries"],
    ["Staff on roster", records("roster-members").filter((row) => row.status !== "removed").length, "resource:roster-members"],
    ["Ticket types", records("ticket-types").length, "resource:ticket-types"],
  ];
  const network = new Map(records("network-guilds").map((row) => [String(row.guild_id), row.kind]));
  const quick = [
    ["acegroups", "key", "Build permission groups", "Tick exactly what each rank can do"],
    ["resource:roster-ranks", "badge", "Staff ranks", "Map ranks to roles and ACE groups"],
    ["resource:roster-members", "users", "Staff roster", "Members, callsigns and statuses"],
    ["resource:channel-bindings", "chat", "Log channels", "Where audit entries are posted"],
  ];
  $("#content").innerHTML = `
    <section class="welcome">
      <div><h2>Everything here applies live</h2><p>Saves write to MariaDB and reconcile Discord roles and the FiveM server before the panel reports success.</p></div>
      <span class="chip ${d.online ? "on" : "warn"}"><span class="swatch" style="background:currentColor"></span>${d.online ? `${esc(d.bot?.tag || "Bot")} online` : "Bot offline"}</span>
    </section>
    <section class="metrics">${metrics.map(([label, value, view]) => `<button class="metric" data-go="${view}"><span>${esc(label)}</span><strong>${fmt(value)}</strong></button>`).join("")}</section>
    <section class="grid-2">
      <div class="card">
        <div class="card-head"><div><h2>Quick actions</h2><p>The pages you will use most.</p></div></div>
        <div class="quick">${quick.map(([view, ic, title, sub]) => `<button data-go="${view}">${icon(ic)}<span><strong>${esc(title)}</strong><small>${esc(sub)}</small></span></button>`).join("")}</div>
      </div>
      <div class="card">
        <div class="card-head"><div><h2>Discord servers</h2><p>Servers the bot is in. Only network servers receive global roles and bans.</p></div></div>
        <div class="list">${d.guilds.map((guild) => `<div class="list-row"><div><div class="primary-text">${esc(guild.name)}</div><div class="secondary-text mono">${esc(guild.id)}</div></div><div style="display:flex;gap:6px">${network.has(guild.id) ? `<span class="chip accent">${esc(network.get(guild.id))}</span>` : `<span class="chip" title="Run /network add in this server">not in network</span>`}<span class="chip">${fmt(guild.memberCount)} members</span></div></div>`).join("") || `<div class="empty">No connected Discord servers.</div>`}</div>
      </div>
    </section>
    <section class="card" style="margin-top:16px">
      <div class="card-head"><div><h2>Recent activity</h2><p>Latest changes from Discord commands, the game and this panel.</p></div><button class="btn sm" data-go="audit">View all</button></div>
      <div class="list">${auditRows(d.audit.slice(0, 8)) || `<div class="empty">No activity yet.</div>`}</div>
    </section>`;
}

/* --------------------------------- resources --------------------------------- */
function displayValue(meta, value) {
  if (value === null || value === undefined || value === "") return `<span class="faint">-</span>`;
  if (meta.type === "boolean") return `<span class="chip ${value ? "on" : ""}">${value ? "Yes" : "No"}</span>`;
  if (meta.type === "color") return `<span class="chip"><span class="swatch" style="background:${esc(value)}"></span>${esc(value)}</span>`;
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

function renderResource(id) {
  const spec = resource(id);
  if (!spec) return go("overview");
  const rows = records(id);
  setTitle(spec.group, spec.label);
  const fields = spec.fields.filter((item) => !item.advanced && item.type !== "textarea").slice(0, 6);
  $("#content").innerHTML = `
    <section class="page-head">
      <p class="lede">${esc(spec.description)}</p>
      <div class="page-actions">
        <label class="search">${icon("search")}<input id="resource-search" type="search" placeholder="Search ${esc(spec.label.toLowerCase())}…"></label>
        <button class="btn primary" data-create="${esc(id)}">${icon("plus")}Add</button>
      </div>
    </section>
    ${id === "ace-entries" ? bundleCard() : ""}
    <div class="table-card">
      <div class="table-scroll"><table><thead><tr>${fields.map((item) => `<th>${esc(item.label)}</th>`).join("")}<th></th></tr></thead><tbody id="resource-rows">${resourceRows(id, rows, fields)}</tbody></table></div>
      <div class="table-foot"><span id="resource-count">${fmt(rows.length)} record${rows.length === 1 ? "" : "s"}</span><span>Click a row to edit</span></div>
    </div>`;
  $("#resource-search").addEventListener("input", (event) => {
    const needle = event.target.value.toLowerCase().trim();
    const filtered = rows.filter((row) => !needle || searchText(spec, row).includes(needle));
    $("#resource-rows").innerHTML = resourceRows(id, filtered, fields);
    $("#resource-count").textContent = `${fmt(filtered.length)} of ${fmt(rows.length)} records`;
  });
}

function bundleCard() {
  return `<form id="bundle-form" class="card" style="margin-bottom:16px">
    <div class="card-head"><div><h2>Permission bundles</h2><p>Grant or revoke a curated set in one step (same as <code>/ace bundle</code> and <code>/vmenu bundle</code>). For full control use Permission groups.</p></div></div>
    <div class="inline-form">
      <label class="field">ACE group<select name="group" required>${records("ace-groups").map((g) => `<option value="${esc(g.name)}">${esc(g.label)} · ${esc(g.name)}</option>`).join("")}</select></label>
      <label class="field">Bundle<select name="bundle" required>${state.data.bundles.map((b) => `<option value="${esc(b.name)}" title="${esc(b.objects.join(", "))}">${esc(b.name)} (${b.objects.length})</option>`).join("")}</select></label>
      <label class="field">Action<select name="mode"><option value="grant">Grant</option><option value="revoke">Revoke</option></select></label>
      <button type="submit" class="btn">Apply</button>
    </div>
  </form>`;
}

function resourceRows(id, rows, fields) {
  if (!rows.length) return `<tr><td colspan="${fields.length + 1}"><div class="empty"><strong>Nothing here yet</strong>Use Add to create the first record.</div></td></tr>`;
  const all = records(id);
  return rows.map((row) => {
    const index = all.indexOf(row);
    return `<tr data-edit="${esc(id)}" data-index="${index}" tabindex="0">${fields.map((meta) => `<td>${displayValue(meta, row[meta.name])}</td>`).join("")}<td class="actions"><span class="row-actions"><button type="button" class="btn ghost sm icon" data-edit="${esc(id)}" data-index="${index}" title="Edit">${icon("edit")}</button><button type="button" class="btn ghost sm icon" data-delete="${esc(id)}" data-index="${index}" title="Delete" style="color:var(--danger)">${icon("trash")}</button></span></td></tr>`;
  }).join("");
}

function inputFor(meta, value) {
  const required = meta.required ? "required" : "";
  const disabled = meta.readonly ? "disabled" : "";
  const current = value ?? (meta.default === "now" ? Date.now() : meta.default ?? "");
  const help = meta.help ? `<small>${esc(meta.help)}</small>` : "";
  const label = `<span>${esc(meta.label)}${meta.required ? "" : ` <span class="opt">(optional)</span>`}</span>`;
  if (meta.type === "boolean") return `<label class="toggle"><input name="${esc(meta.name)}" type="checkbox" ${current ? "checked" : ""} ${disabled}> ${esc(meta.label)}</label>`;
  if (meta.type === "textarea" || meta.type === "json")
    return `<label class="field">${label}<textarea name="${esc(meta.name)}" ${required} ${disabled} ${meta.type === "json" ? 'spellcheck="false" class="code"' : ""}>${esc(meta.type === "json" && typeof current !== "string" ? JSON.stringify(current, null, 2) : meta.type === "json" ? JSON.stringify(current) : current)}</textarea>${help}</label>`;
  if (meta.type === "timestamp")
    return `<label class="field">${label}<input name="${esc(meta.name)}" type="datetime-local" value="${esc(toLocalInput(value ?? (meta.default === "now" ? Date.now() : null)))}" ${required} ${disabled}></label>`;
  let options = null;
  if (meta.type === "select") options = (meta.options || []).map((item) => ({ value: item, label: item }));
  if (meta.type === "relation") options = records(meta.source).map((item) => ({ value: item[meta.value], label: item[meta.display] ?? item[meta.value] }));
  if (meta.type === "guild") options = state.data.guilds.map((guild) => ({ value: guild.id, label: guild.name }));
  if (meta.type === "role") options = allRoles().map((role) => ({ value: role.id, label: role.name, guild: role.guild }));
  if (meta.type === "channel") options = state.data.guilds.flatMap((guild) => guild.channels.map((channel) => ({ value: channel.id, label: `${channel.type === 4 ? "▸ " : "#"}${channel.name}`, guild: guild.id })));
  if (options) {
    const known = options.some((item) => String(item.value) === String(current));
    const stale = current !== "" && current !== null && !known ? `<option value="${esc(current)}" selected>${esc(current)} (not found)</option>` : "";
    return `<label class="field">${label}<select name="${esc(meta.name)}" ${meta.guildField ? `data-guild-field="${esc(meta.guildField)}"` : ""} ${required} ${disabled}><option value="">${meta.required ? "Choose…" : "Not set"}</option>${stale}${options.map((item) => `<option value="${esc(item.value)}" ${item.guild ? `data-guild="${esc(item.guild)}"` : ""} ${String(item.value) === String(current) ? "selected" : ""}>${esc(item.label)}</option>`).join("")}</select>${help}</label>`;
  }
  const type = meta.type === "number" ? "number" : meta.type === "color" ? "color" : "text";
  const list = meta.suggestions?.length ? `list="dl-${esc(meta.name)}"` : "";
  const datalist = meta.suggestions?.length ? `<datalist id="dl-${esc(meta.name)}">${meta.suggestions.map((item) => `<option value="${esc(item.value)}">${esc(item.label || "")}</option>`).join("")}</datalist>` : "";
  return `<label class="field">${label}<input name="${esc(meta.name)}" type="${type}" value="${esc(current)}" ${list} ${required} ${disabled}>${datalist}${help}</label>`;
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
  state.editor = { resource: id, original: row ? structuredClone(row) : null };
  $("#editor-kicker").textContent = `${spec.group} · ${spec.label}`;
  const auto = spec.fields.find((meta) => meta.auto && row?.[meta.name]);
  $("#editor-title").textContent = row ? `Edit record${auto ? ` #${row[auto.name]}` : ""}` : "New record";
  // Auto-numbered IDs are shown in the title, never edited.
  const visible = spec.fields.filter((meta) => !meta.advanced && !meta.auto);
  const advanced = spec.fields.filter((meta) => meta.advanced);
  $("#editor-fields").innerHTML = `<p class="muted" style="font-size:.86rem">${esc(spec.description)}</p>` +
    visible.map((meta) => inputFor(meta, row?.[meta.name])).join("") +
    (advanced.length ? `<details class="advanced"><summary>Advanced fields</summary><div>${advanced.map((meta) => inputFor(meta, row?.[meta.name])).join("")}</div></details>` : "");
  filterByGuild($("#editor-form"));
  $("#editor").showModal();
}

/* -------------------------------- global roles -------------------------------- */
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
  const serverRows = network.map((row) => {
    const id = String(row.guild_id);
    const guild = state.data.guilds.find((item) => item.id === id);
    const roles = (guild?.roles || []).filter((role) => !role.managed);
    return `<div class="list-row server-row" data-server-row data-kind="${esc(row.kind)}" data-guild="${esc(id)}">
      <label class="toggle" data-pick-only><input type="checkbox" name="guild_ids" value="${esc(id)}" ${chosen.has(id) || linked.has(id) ? "checked" : ""}></label>
      <div class="server-name"><div class="primary-text">${esc(guildName(id))}</div><div class="secondary-text">${esc(KIND_LABELS[row.kind] || row.kind)}<span data-excluded-note> · not included</span></div></div>
      <select data-role-for="${esc(id)}" aria-label="Role in ${esc(guildName(id))}"><option value="">Create a new role</option>${roles.map((role) => `<option value="${esc(role.id)}" ${linked.get(id) === role.id ? "selected" : ""}>Use existing: ${esc(role.name)}${role.editable ? "" : " (above bot)"}</option>`).join("")}</select>
    </div>`;
  }).join("");
  return `<form id="sync-form" class="form-grid">
    <label class="field">ACE group<select name="group" required ${sync ? "disabled" : ""}><option value="">Choose a group</option>${groups.map((item) => `<option value="${esc(item.name)}" ${sync?.group_name === item.name ? "selected" : ""}>${esc(item.label)} · ${esc(item.name)}</option>`).join("")}</select></label>
    <label class="field">Discord role name<input name="role_name" maxlength="100" placeholder="Defaults to the group name" value="${esc(sync?.role_name || "")}"><small>Used for roles the bot creates. Existing roles keep their own name.</small></label>
    <label class="field">Permissions integer<input name="permissions" inputmode="numeric" pattern="[0-9]{1,20}" value="${esc(sync?.permissions || "0")}" required><small>0 = no base permissions. Dangerous bits need a bot owner.</small></label>
    <label class="field">Role color<input name="color" type="color" value="${colorHex(sync?.color)}"></label>
    <div class="stack" style="gap:8px">
      <label class="toggle"><input name="hoist" type="checkbox" ${sync?.hoist ? "checked" : ""}> Show separately in member list</label>
      <label class="toggle"><input name="mentionable" type="checkbox" ${sync?.mentionable ? "checked" : ""}> Mentionable</label>
    </div>
    <label class="toggle"><input name="all_channels" type="checkbox" ${sync?.all_channels ? "checked" : ""}> Can see and chat in every text channel and join every voice channel</label>
    <div class="wide">
      <p class="section-label">Which servers</p>
      <div class="mode-switch">
        <label class="toggle"><input type="radio" name="server_mode" value="type" ${pick ? "" : "checked"}> By server type</label>
        <label class="toggle"><input type="radio" name="server_mode" value="pick" ${pick ? "checked" : ""}> Pick individual servers</label>
      </div>
      <label class="field" data-type-only>Server type<select name="scope">${Object.entries(SCOPES).filter(([value]) => value !== "custom").map(([value, label]) => `<option value="${value}" ${(pick ? "all" : sync?.scope || "all") === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
    </div>
    <div class="wide">
      <p class="section-label">Servers &amp; roles</p>
      <p class="muted" style="font-size:.86rem;margin:0 0 10px">For each included server, let the bot create the role or pick a role that already exists there. Existing roles are used as-is (never renamed or recolored).</p>
      <div class="list server-list">${serverRows || `<div class="empty">No network servers yet. Add one under Network servers.</div>`}</div>
    </div>
    <div class="wide" style="display:flex;gap:8px;justify-content:flex-end">${sync ? `<button type="button" class="btn danger" data-sync-delete="${esc(sync.group_name)}">Remove sync</button>` : ""}<button type="submit" class="btn primary">${sync ? "Save & apply everywhere" : "Create global sync"}</button></div>
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
    row.querySelector("[data-role-for]").disabled = !included;
  }
}

function linkedRoles(sync) {
  if (!sync?.roles.length) return `<p class="muted">Not created in any server yet.</p>`;
  return `<div class="list" style="border:1px solid var(--border);border-radius:var(--radius)">${sync.roles.map((link) => {
    const guild = state.data.guilds.find((item) => item.id === String(link.guild_id));
    const role = guild?.roles.find((item) => item.id === String(link.role_id));
    return `<div class="list-row"><div><div class="primary-text">${esc(guild?.name || link.guild_id)}</div><div class="secondary-text">${esc(role?.name || link.role_id)}${role && !role.editable ? " · above the bot's role" : ""}</div></div><span class="chip ${link.managed ? "accent" : ""}">${link.managed ? "bot-managed" : "linked existing"}</span></div>`;
  }).join("")}</div>`;
}

function resultBox() {
  const r = state.lastResult;
  if (!r || (!r.lines?.length && !r.swept)) return "";
  return `<div class="result-box"><strong>Last change applied</strong>${r.swept ? `<p class="muted" style="margin-top:4px">Members: +${r.swept.added} granted · −${r.swept.removed} removed</p>` : ""}${r.lines?.length ? `<ul>${r.lines.map((line) => `<li>${esc(line.replace(/\*\*|`/g, ""))}</li>`).join("")}</ul>` : ""}</div>`;
}

function renderGlobalSync() {
  setTitle("Discord network", "Global roles");
  const syncs = state.data.globalSyncs;
  const selected = syncs.find((item) => item.group_name === state.selectedSync) || null;
  $("#content").innerHTML = `
    ${resultBox()}
    <section class="page-head"><p class="lede">Direct members of an ACE group wear its role in every matching network server. Anyone else who gets the role is stripped and reported.</p><div class="page-actions"><button class="btn" data-sync-push>${icon("sync")}Push all</button><button class="btn primary" data-sync-new>${icon("plus")}New sync</button></div></section>
    <section class="sync-layout">
      <div class="card">
        <div class="card-head"><div><h2>Synced roles</h2><p>Top of the list sits highest in every server.</p></div></div>
        <div class="sync-list">${syncs.map((item, index) => `<button class="sync-item ${selected?.group_name === item.group_name ? "active" : ""}" data-sync-select="${esc(item.group_name)}"><span><strong>${esc(item.role_name)}</strong><small>${esc(item.group_name)} · ${esc(SCOPES[item.scope] || item.scope)}${item.all_channels ? " · all channels" : ""}</small></span><span style="display:flex;gap:2px">
          <span class="btn ghost sm icon" role="button" data-sync-up="${esc(item.group_name)}" ${index === 0 ? 'aria-disabled="true" style="visibility:hidden"' : ""} title="Move up">${icon("up")}</span>
          <span class="btn ghost sm icon" role="button" data-sync-down="${esc(item.group_name)}" ${index === syncs.length - 1 ? 'aria-disabled="true" style="visibility:hidden"' : ""} title="Move down">${icon("down")}</span></span></button>`).join("") || `<div class="empty"><strong>No global roles yet</strong>Create one with New sync.</div>`}</div>
      </div>
      <div class="card">
        <div class="card-head"><div><h2>${selected ? esc(selected.role_name) : "New global sync"}</h2><p>${selected ? `ACE group <code>${esc(selected.group_name)}</code> · changes are pushed to Discord before saving finishes.` : "Pick the ACE group whose members should wear the role."}</p></div></div>
        <div class="card-body">
          ${syncForm(selected)}
          ${selected ? `<div class="divider"></div><p class="section-label">Where it lives</p>${linkedRoles(selected)}` : ""}
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
  return `<p class="section-label">Use an existing role</p><p class="muted" style="font-size:.86rem;margin-bottom:12px">Same as <code>/globalsync bind</code>: the role becomes this group's role in that server and is left visually unchanged.</p>
    <form id="bind-form" class="form-grid">
    <label class="field">ACE group<select name="group" required ${sync ? "disabled" : ""}>${sync ? `<option value="${esc(sync.group_name)}">${esc(sync.group_name)}</option>` : `<option value="">Choose a group</option>${groups.map((g) => `<option value="${esc(g.name)}">${esc(g.label)} · ${esc(g.name)}</option>`).join("")}`}</select></label>
    <label class="field">Discord server<select name="guild_id" required>${network.map((row) => `<option value="${esc(row.guild_id)}">${esc(guildName(row.guild_id))}</option>`).join("")}</select></label>
    <label class="field wide">Existing role<select name="role_id" data-guild-field="guild_id" required><option value="">Choose a role</option>${allRoles().map((role) => `<option value="${role.id}" data-guild="${role.guild}">${esc(role.name)}${role.editable ? "" : " (above bot)"}</option>`).join("")}</select></label>
    <div class="wide" style="display:flex;justify-content:flex-end"><button type="submit" class="btn">Bind role</button></div></form>`;
}

/* ---------------------- permission group editor (checkboxes) ---------------------- */
function aceSections(selected) {
  const catalog = state.data.catalog || [];
  const known = new Set(catalog.map((entry) => entry.object));
  const custom = [...selected].filter((object) => !known.has(object)).map((object) => ({ category: "Custom / not in catalog", object, label: object, description: "Already granted to this group but not part of the built-in catalog. Untick to remove it." }));
  const rows = [...catalog, ...custom];
  const categories = [...new Set(rows.map((entry) => entry.category))];
  return categories.map((category) => {
    const items = rows.filter((entry) => entry.category === category);
    const picked = items.filter((entry) => selected.has(entry.object)).length;
    return `<details class="ace-section" data-ace-section ${picked ? "open" : ""}><summary><span>${esc(category)}</span><small data-section-count>${picked}/${items.length}</small></summary><div class="ace-grid">${items.map((entry) => `<label class="ace-option" data-ace-option data-ace-search="${esc(`${entry.label} ${entry.object} ${entry.description} ${entry.category}`.toLowerCase())}"><input type="checkbox" name="objects" value="${esc(entry.object)}" ${selected.has(entry.object) ? "checked" : ""}><span><strong>${esc(entry.label)}</strong><code>${esc(entry.object)}</code><small>${esc(entry.description)}</small></span></label>`).join("")}</div></details>`;
  }).join("");
}

function renderAceGroups() {
  setTitle("Access", "Permission groups");
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
    ? `<label class="field">Group name<input name="name" required pattern="[a-z0-9_-]{1,40}" placeholder="senior_moderator"><small>Lowercase letters, numbers, underscores or hyphens.</small></label>
       <label class="field">Display label<input name="label" required maxlength="80" placeholder="Senior Moderator"></label>
       <label class="field">Rank order<input name="rank_order" type="number" min="0" max="10000" value="500" required><small>Higher outranks lower. /staff add and /global only act on members below the caller's highest rank.</small></label>
       <label class="toggle" style="align-self:start;margin-top:22px"><input name="staff_only" type="checkbox" checked> Only active in game while clocked in</label>`
    : group ? `<label class="field">Display label<input name="label" required maxlength="80" value="${esc(group.label)}"></label>
       <label class="field">Rank order<input name="rank_order" type="number" min="0" max="10000" value="${esc(group.rank_order)}" required><small>Higher outranks lower.</small></label>
       <label class="toggle wide"><input name="staff_only" type="checkbox" ${group.staff_only ? "checked" : ""}> Only active in game while clocked in</label>
       <div class="wide" style="display:flex;flex-wrap:wrap;gap:6px"><span class="chip accent">${fmt(selected.size)} allowed</span>${denies.length ? `<span class="chip bad" title="${esc(denies.map((d) => d.object).join(", "))}">${fmt(denies.length)} denied (kept)</span>` : ""}<span class="chip">${fmt(members)} direct member${members === 1 ? "" : "s"}</span>${ranks.length ? `<span class="chip">Staff rank: ${esc(ranks.join(", "))}</span>` : ""}</div>`
      : `<div class="wide empty"><strong>No ACE groups yet</strong>Switch to New group to create one.</div>`;
  $("#content").innerHTML = `
    ${resultBox()}
    <section class="page-head"><p class="lede">Every vMenu, EasyAdmin and Florida Bay ACE is listed with what it does. Saving writes exactly the ticked set, records it in the audit trail and syncs Discord and the game immediately.</p></section>
    <section class="card">
      <div class="card-head" style="align-items:center">
        <div class="mode-tabs" role="tablist"><button type="button" data-ace-mode="edit" class="${editor.mode === "edit" ? "on" : ""}">Edit existing</button><button type="button" data-ace-mode="create" class="${editor.mode === "create" ? "on" : ""}">New group</button></div>
        ${editor.mode === "edit" && groups.length ? `<select id="ace-group-select" style="max-width:360px">${[...groups].sort((a, b) => b.rank_order - a.rank_order).map((g) => `<option value="${esc(g.name)}" ${g.name === editor.group ? "selected" : ""}>${esc(g.label)} · ${esc(g.name)} · rank ${esc(g.rank_order)}</option>`).join("")}</select>` : ""}
      </div>
      <form id="ace-group-form" data-mode="${editor.mode}">
        <div class="card-body form-grid">${fields}</div>
        ${editor.mode === "create" || group ? `<div class="ace-toolbar"><label class="search">${icon("search")}<input id="ace-filter" type="search" placeholder="Search noclip, bans, tickets, weapons…"></label><div class="actions"><button type="button" class="btn sm" id="ace-select-shown">Select shown</button><button type="button" class="btn sm" id="ace-clear-shown">Clear shown</button><button type="button" class="btn sm ghost" id="ace-collapse">Expand all</button><span class="ace-count" id="ace-count"></span></div></div>
        <div id="ace-sections">${aceSections(selected)}</div>
        <div class="ace-save"><p>${editor.mode === "create" ? "Creates the group with exactly the ticked permissions." : "Unticked permissions are removed from this group; ticked ones are allowed."} Bind a Discord role with <code>/ace bind-role</code>, or map a staff rank to it under Staff roster → Roster ranks.</p><button type="submit" class="btn primary">${icon("check")}${editor.mode === "create" ? "Create group" : "Save group"}</button></div>` : ""}
      </form>
    </section>`;
  refreshAceCount();
}

function refreshAceCount() {
  const host = $("#ace-sections");
  if (!host) return;
  const checked = $$("[data-ace-option] input:checked", host).length;
  $("#ace-count").textContent = `${checked} selected`;
  for (const section of $$("[data-ace-section]", host)) {
    const inputs = $$("input", section);
    section.querySelector("[data-section-count]").textContent = `${inputs.filter((input) => input.checked).length}/${inputs.length}`;
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

/* ------------------------------------ audit ------------------------------------ */
function auditRows(rows) {
  return rows.map((row) => {
    const payload = JSON.stringify(row.payload || {}, null, 2);
    const actor = row.actor_id === "web-panel" ? "Web panel" : row.actor_id;
    return `<div class="audit-row"><time title="${esc(time(row.created_at))}">${esc(ago(row.created_at))}</time><div><div style="font-weight:600">${esc(row.action)}</div><div class="mono faint" style="font-size:.78rem">${esc(actor)}${row.target_id ? ` → ${esc(row.target_id)}` : ""}</div></div><details><summary class="mono">${esc((payload === "{}" ? "No details" : JSON.stringify(row.payload)).slice(0, 160))}</summary>${payload === "{}" ? "" : `<pre>${esc(payload)}</pre>`}</details></div>`;
  }).join("");
}

function renderAudit() {
  setTitle("System", "Audit trail");
  $("#content").innerHTML = `<section class="page-head"><p class="lede">The latest 80 events from Discord commands, the game server and this panel. Click details to expand them.</p><div class="page-actions"><label class="search">${icon("search")}<input id="audit-search" type="search" placeholder="Filter by action or ID…"></label></div></section>
    <section class="card"><div class="list" id="audit-list">${auditRows(state.data.audit) || `<div class="empty">No audit events.</div>`}</div></section>`;
  $("#audit-search").addEventListener("input", (event) => {
    const needle = event.target.value.toLowerCase().trim();
    $("#audit-list").innerHTML = auditRows(state.data.audit.filter((row) => !needle || JSON.stringify(row).toLowerCase().includes(needle))) || `<div class="empty">No matching events.</div>`;
  });
}

function render() {
  if (!state.data) return;
  state.dirty = false;
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
  if (button) go(button.dataset.view);
});
$("#nav-search").addEventListener("input", (event) => {
  state.navFilter = event.target.value.trim();
  renderNav();
});

async function deleteRow(id, index) {
  const spec = resource(id);
  const row = records(id)[Number(index)];
  if (!confirm(`Delete this ${spec.label.toLowerCase()} record? The change applies immediately.`)) return;
  try {
    await post("record/delete", { resource: id, key: Object.fromEntries(spec.pk.map((key) => [key, row[key]])) });
    toast("Record deleted and live systems reconciled.");
  } catch (error) { toast(error.message, true); }
}

async function moveSync(key, up) {
  const order = state.data.globalSyncs.map((item) => item.group_name);
  const index = order.indexOf(key);
  const target = up ? index - 1 : index + 1;
  if (target < 0 || target >= order.length) return;
  [order[index], order[target]] = [order[target], order[index]];
  try { await post("globalsync/order", { groups: order }); toast("Global role order applied."); }
  catch (error) { toast(error.message, true); }
}

$("#content").addEventListener("click", async (event) => {
  const nav = event.target.closest("[data-go]");
  if (nav) return go(nav.dataset.go);
  const create = event.target.closest("[data-create]");
  if (create) return openEditor(create.dataset.create);
  const remove = event.target.closest("[data-delete]");
  if (remove) return deleteRow(remove.dataset.delete, remove.dataset.index);
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
    try { await post("globalsync/push", {}); toast("Global roles pushed to every server."); }
    catch (error) { toast(error.message, true); }
    return;
  }
  const del = event.target.closest("[data-sync-delete]");
  if (del) {
    if (!confirm(`Stop syncing ${del.dataset.syncDelete}? Members will no longer be gated by it.`)) return;
    const deleteRoles = confirm("Also delete the roles the bot created? (OK = delete them, Cancel = keep them in Discord). Linked existing roles are always kept.");
    try {
      await post("globalsync/delete", { group: del.dataset.syncDelete, delete_roles: deleteRoles });
      state.selectedSync = state.data.globalSyncs[0]?.group_name || null;
      renderGlobalSync();
      toast("Global sync removed.");
    } catch (error) { toast(error.message, true); }
  }
});

$("#content").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.target.matches("tr[data-edit]")) openEditor(event.target.dataset.edit, records(event.target.dataset.edit)[Number(event.target.dataset.index)]);
});

$("#content").addEventListener("input", (event) => {
  if (event.target.id === "ace-filter") filterAceOptions();
});

$("#content").addEventListener("change", (event) => {
  if (event.target.id === "ace-group-select") { state.aceEditor.group = event.target.value; state.lastResult = null; return renderAceGroups(); }
  if (event.target.name === "objects") return refreshAceCount();
  const form = event.target.form;
  if (!form) return;
  if (form.id === "sync-form") return updateServerRows(form);
  filterByGuild(form);
});
$("#editor-form").addEventListener("change", (event) => filterByGuild(event.currentTarget));

$("#content").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const submit = form.querySelector("button[type=submit]");
  const values = new FormData(form);
  const restore = busy(submit);
  try {
    if (form.id === "sync-form") {
      const pick = values.get("server_mode") === "pick";
      const included = $$("[data-server-row]", form).filter((row) => !row.classList.contains("excluded"));
      if (pick && !included.length && !confirm("No servers are picked, so this role will be removed from every server. Continue?")) return;
      const body = {
        group: values.get("group") || state.selectedSync,
        role_name: values.get("role_name") || undefined,
        scope: pick ? "custom" : values.get("scope"),
        permissions: values.get("permissions"),
        color: values.get("color"),
        hoist: values.has("hoist"),
        mentionable: values.has("mentionable"),
        all_channels: values.has("all_channels"),
        guild_ids: pick ? values.getAll("guild_ids") : undefined,
        existing_roles: included.map((row) => ({ guild_id: row.dataset.guild, role_id: row.querySelector("[data-role-for]").value })),
      };
      await post("globalsync/save", body);
      state.selectedSync = body.group;
      state.creatingSync = false;
      renderGlobalSync();
      toast("Global sync saved and reconciled.");
    } else if (form.id === "bundle-form") {
      await post("ace/bundle", { group: values.get("group"), bundle: values.get("bundle"), mode: values.get("mode") });
      toast(`Bundle ${values.get("mode") === "revoke" ? "revoked" : "granted"} and applied live.`);
    } else if (form.id === "bind-form") {
      const group = values.get("group") || state.selectedSync;
      const result = await post("globalsync/bind", { group, guild_id: values.get("guild_id"), role_id: values.get("role_id") });
      state.selectedSync = group;
      state.creatingSync = false;
      renderGlobalSync();
      toast(result.result?.created ? "Global sync created from the existing role." : "Existing role bound to the ACE sync.");
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
      toast(`${body.name} saved and applied live.`);
    }
  } catch (error) {
    toast(error.message, true);
  } finally {
    restore();
  }
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
    toast("Saved and applied live.");
  } catch (error) { toast(error.message, true); }
  finally { restore(); }
});

$$("[data-close]").forEach((button) => button.addEventListener("click", () => $("#editor").close()));
$("#editor").addEventListener("click", (event) => { if (event.target === $("#editor")) $("#editor").close(); });
$("#refresh").addEventListener("click", () => load().catch((error) => toast(error.message, true)));
$("#reconcile").addEventListener("click", async () => {
  try { await post("reconcile", {}); toast("Discord roles and FiveM permissions reconciled."); }
  catch (error) { toast(error.message, true); }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "/" && !event.target.closest("input, textarea, select") && !$("#app").hidden) {
    event.preventDefault();
    $("#nav-search").focus();
  }
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
  if (state.data && !$("#editor").open && !document.hidden && state.view !== "acegroups")
    load({ silent: true }).catch(() => {});
}, 30000);
