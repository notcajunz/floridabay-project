const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const fmt = (value) => new Intl.NumberFormat().format(Number(value || 0));
const date = (value) => value ? new Date(Number(value)).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "-";
const day = (value) => value ? new Date(Number(value)).toLocaleDateString([], { dateStyle: "medium" }) : "-";
const ago = (value) => {
  if (!value) return "-";
  const diff = Date.now() - Number(value);
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 2592000000) return `${Math.floor(diff / 86400000)}d ago`;
  return day(value);
};
const hours = (seconds) => {
  const h = Number(seconds || 0) / 3600;
  return h >= 100 ? `${Math.round(h)}h` : `${h.toFixed(1)}h`;
};
const titleCase = (value) => String(value || "").replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const isActive = (row) => Boolean(Number(row.active)) && (!row.expires_at || Number(row.expires_at) > Date.now());
const plural = (n, word) => `${fmt(n)} ${word}${Number(n) === 1 ? "" : "s"}`;
const hue = (seed) => [...String(seed || "fb")].reduce((total, char) => (total * 31 + char.charCodeAt(0)) % 360, 7);
const initials = (name) => String(name || "FB").replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(Boolean).map((word) => word[0]).join("").slice(0, 2).toUpperCase() || "FB";

/* ---------- icons ---------- */
const PATHS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  shield: '<path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
  life: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="m4.9 4.9 4.3 4.3M14.8 14.8l4.3 4.3M14.8 9.2l4.3-4.3M4.9 19.1l4.3-4.3"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  scale: '<path d="M12 3v18M7 21h10M5 7h14M5 7l-3 7a4 4 0 0 0 6 0L5 7Zm14 0-3 7a4 4 0 0 0 6 0l-3-7Z"/>',
  ticket: '<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4Z"/><path d="M13 6v2M13 11v2M13 16v2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<path d="M12 3 2 21h20L12 3Z"/><path d="M12 10v4M12 17.5v.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  badge: '<path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z"/><path d="m9 12 2 2 4-4"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  gavel: '<path d="m14 13-7.5 7.5a2.1 2.1 0 0 1-3-3L11 10"/><path d="m16 16 6-6M8 8l6-6M9 7l8 8M15 3l6 6"/>',
  dots: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1Z"/>',
  activity: '<path d="M3 12h4l2-7 4 14 2-7h6"/>',
  radio: '<path d="M5 13a7 7 0 0 1 14 0M8 13a4 4 0 0 1 8 0"/><circle cx="12" cy="16" r="2"/><path d="M12 18v3"/>',
  pin: '<path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${PATHS[name] || ""}</svg>`;

/* ---------- state ---------- */
const state = { data: null, view: location.hash.slice(1) || "dashboard", dialog: null, profile: null, filters: {} };
const filter = (key, fallback = "") => state.filters[key] ?? fallback;

async function api(path, options = {}) {
  const response = await fetch(`api/${path}`, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
  return result;
}

function toast(message, bad = false) {
  const node = $("#portal-toast");
  node.textContent = message;
  node.className = `toast show${bad ? " bad" : ""}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (node.className = "toast"), 4200);
}

function setTitle(kicker, title) {
  $("#page-kicker").textContent = kicker;
  $("#page-title").textContent = title;
  document.title = `${title} · Florida Bay`;
}

/* ---------- small renderers ---------- */
function avatar(url, name, size = "", seed = name) {
  const img = url ? `<img src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : "";
  return `<span class="av ${size}" style="--h:${hue(seed)}">${esc(initials(name))}${img}</span>`;
}
function person(id, fallbackName = "", { size = "av-sm", sub = null } = {}) {
  const p = state.data.people?.[id];
  const name = p?.name || fallbackName || (id ? `User ${String(id).slice(-4)}` : "Unknown");
  const subline = sub ?? (p?.username ? `@${p.username}` : id || "");
  return `<span class="person">${avatar(p?.avatar, name, size, id)}<div><b>${esc(name)}</b><small>${esc(subline)}</small></div></span>`;
}
function pill(status) {
  const tones = { active: "bad", open: "sea", claimed: "dusk", submitted: "warn", under_review: "sea", approved: "good", denied: "bad", closed: "", lifted: "good", recorded: "", on_staff: "good", inactive: "", expired: "", loa: "warn", removed: "bad", withdrawn: "" };
  const label = { under_review: "In review", loa: "On leave", on_staff: "Active" }[status] || titleCase(status);
  const tone = tones[status] ?? "";
  return `<span class="pill${tone ? ` pill-${tone}` : ""}">${esc(label)}</span>`;
}
const scope = (row) => row.guild_id === "global" ? "Network" : row.guild_id === "game" ? "In-game" : "Discord server";
const sourceLabel = (row) => row.guild_id === "global" ? "Network" : row.guild_id === "game" ? "EasyAdmin" : "Discord";
const caseState = (row) => !["ban", "blacklist", "timeout"].includes(row.action) ? "recorded" : isActive(row) ? "active" : row.expires_at && Number(row.expires_at) <= Date.now() ? "expired" : "lifted";
function empty(title, text, iconName = "check", tone = "53 226 205") {
  return `<div class="empty"><div class="feed-ico" style="--tone:${tone}">${icon(iconName)}</div><b>${esc(title)}</b><span>${esc(text)}</span></div>`;
}
const idChip = (value) => `<button class="id-chip" type="button" data-copy="${esc(value)}" title="Copy ID">${esc(value)}</button>`;
const seg = (key, options, current) => `<div class="seg" role="tablist">${options.map(([value, label, count]) => `<button type="button" data-filter="${esc(key)}" data-value="${esc(value)}" class="${current === value ? "on" : ""}">${esc(label)}${count !== undefined ? `<em>${fmt(count)}</em>` : ""}</button>`).join("")}</div>`;
const searchBox = (key, placeholder) => `<label class="search">${icon("search")}<input type="search" data-search="${esc(key)}" value="${esc(filter(key))}" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}"></label>`;
const matches = (query, ...fields) => !query || fields.some((field) => String(field ?? "").toLowerCase().includes(query.toLowerCase()));

/* ---------- navigation ---------- */
function nav() {
  const { access, data } = { access: state.data.access, data: state.data };
  const pendingAppeals = (data.appealQueue || []).length;
  const openTickets = (data.ticketQueue || []).filter((t) => t.status !== "closed").length;
  const groups = [
    ["Account", [
      ["dashboard", "Dashboard", "home"],
      ["punishments", "Punishments", "shield"],
      ["support", "Support", "life"],
    ]],
    ["Community", [
      ["roster", "Staff roster", "users"],
      ...(data.profile ? [["profile", "My staff profile", "user"]] : []),
    ]],
    ...(access.staff ? [["Staff workspace", [
      ["liveops", "Live operations", "activity", (data.liveOps?.scenes?.length || 0) + (data.liveOps?.calls?.length || 0)],
      ["banlog", "Ban registry", "ban"],
      ["appeals", "Appeal queue", "scale", pendingAppeals],
      ["ticketops", "Tickets", "ticket", openTickets],
    ]]] : []),
    ...(access.owner ? [["Owner", [["settings", "Live configuration", "gear"]]]] : []),
  ];
  $("#portal-nav").innerHTML = groups.map(([label, items]) => `<div class="nav-label">${esc(label)}</div>${items.map(([view, title, ico, badge]) => `<button type="button" data-view="${view}" class="${state.view === view && !(view === "profile" && state.profile && state.profile.discord_id !== data.user.id) ? "active" : ""}">${icon(ico)}<span>${esc(title)}</span>${badge ? `<span class="badge">${fmt(badge)}</span>` : ""}</button>`).join("")}`).join("");
  const u = data.user;
  const role = access.owner ? "Owner" : data.profile ? data.profile.rank_name : access.staff ? "Staff" : "Community member";
  $("#sidebar-user").innerHTML = `<div class="user-card">${avatar(u.avatar, u.displayName, "av-sm", u.id)}<div><b>${esc(u.displayName)}</b><small>${esc(role)}</small></div><button class="icon-btn" type="button" data-logout title="Sign out" aria-label="Sign out">${icon("logout")}</button></div>`;
}

/* ---------- views ---------- */
function dashboard() {
  setTitle("Member portal", "Dashboard");
  const d = state.data;
  const active = d.punishments.filter(isActive);
  const openTickets = d.tickets.filter((t) => t.status !== "closed");
  const openAppeals = d.appeals.filter((a) => ["submitted", "under_review"].includes(a.status));
  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Late night in the bay" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const activity = [
    ...d.punishments.slice(0, 4).map((p) => ({ ico: "shield", tone: isActive(p) ? "255 95 109" : "109 124 143", title: `${titleCase(p.action)} · ${p.ban_id}`, text: p.reason, at: p.created_at })),
    ...d.tickets.slice(0, 4).map((t) => ({ ico: "ticket", tone: "85 196 255", title: `Ticket #${t.id} · ${t.subject}`, text: `${titleCase(t.type)} - ${titleCase(t.status)}`, at: t.created_at })),
    ...d.appeals.slice(0, 3).map((a) => ({ ico: "scale", tone: "143 124 255", title: `Appeal for ${a.ban_id}`, text: a.response || titleCase(a.status), at: a.updated_at })),
  ].sort((a, b) => Number(b.at) - Number(a.at)).slice(0, 6);

  const staffRow = d.access.staff ? `
    <div class="stats">
      <button class="stat-tile tone-warn" type="button" data-view="appeals"><div class="ico">${icon("scale")}</div><span>Appeals waiting</span><strong>${fmt((d.appealQueue || []).length)}</strong><small>Verified ban appeals</small></button>
      <button class="stat-tile tone-sky" type="button" data-view="ticketops"><div class="ico">${icon("ticket")}</div><span>Open tickets</span><strong>${fmt((d.ticketQueue || []).filter((t) => t.status !== "closed").length)}</strong><small>${fmt((d.ticketQueue || []).filter((t) => t.status === "open" && !t.claimed_by).length)} unclaimed</small></button>
      <button class="stat-tile tone-bad" type="button" data-view="banlog"><div class="ico">${icon("ban")}</div><span>Active bans</span><strong>${fmt((d.banLog || []).filter(isActive).length)}</strong><small>${fmt((d.banLog || []).length)} in the registry</small></button>
      ${d.profile ? `<button class="stat-tile tone-good" type="button" data-view="profile"><div class="ico">${icon("clock")}</div><span>Your duty this week</span><strong>${hours(d.profile.week_seconds)}</strong><small>${d.profile.weekly_seconds ? `${hours(d.profile.weekly_seconds)} required` : `${hours(d.profile.total_seconds)} all time`}</small></button>` : `<button class="stat-tile tone-dusk" type="button" data-view="roster"><div class="ico">${icon("users")}</div><span>Staff roster</span><strong>${fmt(d.roster.length)}</strong><small>Active members</small></button>`}
    </div>` : "";

  $("#portal-content").innerHTML = `
    <section class="welcome">
      ${avatar(d.user.avatar, d.user.displayName, "av-lg", d.user.id)}
      <div class="who">
        <small>${esc(greeting)}</small>
        <h2>${esc(d.user.displayName)}</h2>
        <div class="chips">
          <span class="pill pill-good">Discord verified</span>
          ${d.verified.game ? `<span class="pill pill-sea">In-game · ${esc(d.verified.gameName)}</span>` : `<span class="pill pill-warn" title="Join the server with Discord open to link your game identity">Game not linked yet</span>`}
          ${d.access.owner ? `<span class="pill pill-sun">Owner</span>` : d.access.staff ? `<span class="pill pill-dusk">Staff</span>` : ""}
        </div>
      </div>
      <button class="btn btn-sun" type="button" data-open-ticket>${icon("plus")} New ticket</button>
    </section>
    <div class="stats">
      <button class="stat-tile ${active.length ? "tone-bad" : "tone-good"}" type="button" data-view="punishments"><div class="ico">${icon(active.length ? "alert" : "check")}</div><span>Active punishments</span><strong>${fmt(active.length)}</strong><small>${active.length ? "Appeal from the Punishments page" : "Your record is clear"}</small></button>
      <button class="stat-tile tone-sky" type="button" data-view="support"><div class="ico">${icon("ticket")}</div><span>Open tickets</span><strong>${fmt(openTickets.length)}</strong><small>${plural(d.tickets.length, "ticket")} all time</small></button>
      <button class="stat-tile tone-dusk" type="button" data-view="punishments"><div class="ico">${icon("scale")}</div><span>Appeals in review</span><strong>${fmt(openAppeals.length)}</strong><small>${plural(d.appeals.length, "appeal")} submitted</small></button>
      <button class="stat-tile tone-sea" type="button" data-view="roster"><div class="ico">${icon("users")}</div><span>Staff on roster</span><strong>${fmt(d.roster.length)}</strong><small>Browse the team</small></button>
    </div>
    ${staffRow}
    <div class="grid-2">
      <section class="card">
        <div class="card-head"><div><h2>Recent activity</h2><p>Your latest records, tickets, and appeals.</p></div></div>
        ${activity.length ? `<div class="feed">${activity.map((row) => `<div class="feed-row"><div class="feed-ico" style="color:rgb(${row.tone});background:rgba(${row.tone.replaceAll(" ", ",")},.1)">${icon(row.ico)}</div><div class="txt"><b>${esc(row.title)}</b><small>${esc(row.text)}</small></div><time title="${esc(date(row.at))}">${esc(ago(row.at))}</time></div>`).join("")}</div>` : empty("All quiet", "Your activity will show up here.", "sparkle")}
      </section>
      <section class="card">
        <div class="card-head"><div><h2>Quick actions</h2><p>Jump straight to what you need.</p></div></div>
        <div class="quick">
          <button type="button" data-open-ticket style="--tone:255 122 69"><span class="feed-ico">${icon("life")}</span><div><b>Get support</b><small>Open a private ticket with staff</small></div>${icon("chev").replace("<svg", '<svg class="chev"')}</button>
          <button type="button" data-view="punishments" style="--tone:143 124 255"><span class="feed-ico">${icon("scale")}</span><div><b>Appeal a punishment</b><small>Use the case ID from your DM</small></div>${icon("chev").replace("<svg", '<svg class="chev"')}</button>
          <button type="button" data-view="roster" style="--tone:53 226 205"><span class="feed-ico">${icon("users")}</span><div><b>Meet the staff</b><small>Live roster with activity</small></div>${icon("chev").replace("<svg", '<svg class="chev"')}</button>
          ${d.access.owner ? `<a href="control.html" style="--tone:255 194 77"><span class="feed-ico">${icon("gear")}</span><div><b>Live configuration</b><small>Owner control plane</small></div>${icon("external").replace("<svg", '<svg class="chev"')}</a>` : ""}
        </div>
      </section>
    </div>`;
}

function punishments() {
  setTitle("Account", "Punishments");
  const rows = state.data.punishments;
  const appeals = state.data.appeals;
  $("#portal-content").innerHTML = `
    <p class="page-intro">Every ban and blacklist - from Discord, the network, or in-game - has one Florida Bay case ID. You can appeal any active ban attached to your verified account. If staff approve your appeal, the ban is lifted automatically.</p>
    ${rows.length ? `<div class="cases">${rows.map((row) => {
      const live = isActive(row);
      const st = caseState(row);
      const appealable = ["ban", "blacklist"].includes(row.action) && live && !["submitted", "under_review"].includes(row.appeal_status);
      return `<article class="case ${live ? "is-active" : st === "lifted" ? "is-lifted" : ""}">
        <div class="case-ico">${icon(["ban", "blacklist"].includes(row.action) ? "ban" : row.action === "warn" ? "alert" : "gavel")}</div>
        <div class="case-main">
          <div class="case-top"><h3>${esc(titleCase(row.action))}</h3>${idChip(row.ban_id)}${pill(st)}${row.appeal_status ? `<span class="pill pill-dusk">Appeal ${esc(titleCase(row.appeal_status).toLowerCase())}</span>` : ""}</div>
          <p>${esc(row.reason)}</p>
          <div class="case-meta"><span>${esc(scope(row))}</span><span>Issued ${esc(date(row.created_at))}</span>${row.expires_at ? `<span>${Number(row.expires_at) > Date.now() ? "Ends" : "Ended"} ${esc(date(row.expires_at))}</span>` : row.action === "ban" || row.action === "blacklist" ? "<span>Permanent</span>" : ""}</div>
        </div>
        <div class="case-side">${appealable ? `<button class="btn btn-glass btn-sm" type="button" data-appeal="${esc(row.ban_id)}">${icon("scale")} Appeal</button>` : ""}</div>
      </article>`;
    }).join("")}</div>` : `<section class="card">${empty("Clean record", "There are no moderation records attached to your verified Discord account.", "check", "61 220 151")}</section>`}
    ${appeals.length ? `<section class="card">
      <div class="card-head"><div><h2>Your appeals</h2><p>Status and responses from staff.</p></div></div>
      <div class="feed">${appeals.map((a) => `<div class="feed-row"><div class="feed-ico">${icon("scale")}</div><div class="txt"><b>${esc(a.ban_id)} · ${esc(titleCase(a.action))}</b><small>${esc(a.response ? `Staff: ${a.response}` : a.statement)}</small></div><div style="display:grid;justify-items:end;gap:6px">${pill(a.status)}<time>${esc(ago(a.updated_at))}</time></div></div>`).join("")}</div>
    </section>` : ""}`;
}

function support() {
  setTitle("Account", "Support");
  const rows = state.data.tickets;
  $("#portal-content").innerHTML = `
    <div class="toolbar"><p class="page-intro" style="flex:1;min-width:260px">Open a private support channel without leaving the website. Your ticket shows up in the same live queue staff use in Discord.</p><button class="btn btn-sun" type="button" data-open-ticket>${icon("plus")} New ticket</button></div>
    <section class="card">
      <div class="card-head"><div><h2>Your tickets</h2><p>Website and Discord tickets share one history.</p></div></div>
      ${rows.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Ticket</th><th>Subject</th><th>Type</th><th>Status</th><th>Opened</th><th></th></tr></thead><tbody>${rows.map((t) => `<tr>
        <td class="strong mono">#${t.id}</td><td class="strong"><span class="clip" title="${esc(t.subject)}">${esc(t.subject)}</span></td><td>${esc(titleCase(t.type))}</td><td>${pill(t.status)}</td><td title="${esc(date(t.created_at))}">${esc(ago(t.created_at))}</td>
        <td><div class="actions">${t.status !== "closed" ? `<a class="btn btn-ghost btn-sm" href="https://discord.com/channels/${esc(t.guild_id)}/${esc(t.channel_id)}" target="_blank" rel="noopener">Open in Discord ${icon("external")}</a><button class="btn btn-glass btn-sm" type="button" data-request-close="${t.id}">Request close</button>` : ""}</div></td>
      </tr>`).join("")}</tbody></table></div>` : empty("No tickets yet", "When you need a hand, open a ticket and staff will reply in a private channel.", "inbox", "85 196 255")}
    </section>`;
}

function roster() {
  setTitle("Community", "Staff roster");
  const all = state.data.roster;
  const query = filter("roster-q");
  const cat = filter("roster-cat", "all");
  const categories = [...new Set(all.map((p) => p.category_name || "Staff"))];
  const shown = all.filter((p) => (cat === "all" || (p.category_name || "Staff") === cat) && matches(query, p.display_name, p.username, p.discord_name, p.rank_name, p.callsign));
  const groups = new Map();
  for (const p of shown) {
    const key = p.category_name || "Staff";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const maxWeek = Math.max(3600, ...all.map((p) => Number(p.week_seconds || 0)));
  $("#portal-content").innerHTML = `
    <div class="toolbar">${searchBox("roster-q", "Search name, rank, or callsign")}${categories.length > 1 ? seg("roster-cat", [["all", "Everyone", all.length], ...categories.map((c) => [c, c, all.filter((p) => (p.category_name || "Staff") === c).length])], cat) : ""}</div>
    ${groups.size ? [...groups].map(([name, people]) => `<section class="roster-group">
      <div class="group-head"><h2>${esc(name)}</h2><span>${plural(people.length, "member")}</span></div>
      <div class="roster">${people.map((p) => {
        const display = p.display_name || p.discord_name || p.username;
        return `<button class="member" type="button" data-profile="${esc(p.discord_id)}">
          ${p.callsign ? `<span class="callsign">${esc(p.callsign)}</span>` : ""}
          <div class="top">${avatar(p.avatar, display, "", p.discord_id)}<div><b>${esc(display)}</b><small>${esc(p.rank_name)}${p.discord_name ? ` · @${esc(p.discord_name)}` : ""}</small></div></div>
          <div><div class="meter"><i style="width:${Math.min(100, (Number(p.week_seconds || 0) / maxWeek) * 100).toFixed(1)}%"></i></div></div>
          <div class="foot"><span class="hrs"><b>${hours(p.week_seconds)}</b> this week</span>${p.status && p.status !== "active" ? pill(p.status) : `<span class="hrs">${hours(p.total_seconds)} total</span>`}</div>
        </button>`;
      }).join("")}</div>
    </section>`).join("") : `<section class="card">${empty(query ? "No matches" : "Roster unavailable", query ? "Try a different name, rank, or callsign." : "No active staff members are listed right now.", "users")}</section>`}`;
}

function profileView() {
  const p = state.profile || state.data.profile;
  const mine = !state.profile || state.profile.discord_id === state.data.user.id;
  setTitle("Staff", mine ? "My staff profile" : "Staff profile");
  if (!p) {
    $("#portal-content").innerHTML = `<section class="card">${empty("No staff profile", "Your verified Discord account is not on the active staff roster.", "user")}</section>`;
    return;
  }
  const display = p.display_name || p.discord_name || p.username;
  const shifts = [...(p.recentShifts || [])].reverse();
  const maxShift = Math.max(1, ...shifts.map((s) => Number(s.seconds || 0)));
  const weekPct = p.weekly_seconds ? Math.min(100, (Number(p.week_seconds || 0) / Number(p.weekly_seconds)) * 100) : null;
  $("#portal-content").innerHTML = `
    ${!mine ? `<div><button class="btn btn-ghost btn-sm" type="button" data-view="roster">← Back to roster</button></div>` : ""}
    <section class="profile-hero">
      <div class="profile-cover"></div>
      <div class="profile-id">
        ${avatar(p.avatar, display, "av-xl", p.discord_id)}
        <div class="who">
          <h2>${esc(display)}</h2>
          <p>${esc(p.rank_name)} · ${esc(p.category_name || "Staff")}${p.discord_name ? ` · @${esc(p.discord_name)}` : ""}</p>
          <div class="chips">${pill(!p.status || p.status === "active" ? "on_staff" : p.status)}${(p.jobs || []).map((j) => `<span class="pill plain" title="${esc(j.description || "")}">${esc(j.name)}</span>`).join("")}</div>
        </div>
        <div class="callsign-badge"><small>Callsign</small><b>${esc(p.callsign || "-")}</b></div>
      </div>
    </section>
    <div class="stats">
      <div class="stat-tile tone-sun"><div class="ico">${icon("clock")}</div><span>This week</span><strong>${hours(p.week_seconds)}</strong>${weekPct !== null ? `<div class="meter" style="margin-top:10px"><i style="width:${weekPct.toFixed(1)}%"></i></div><small>${hours(p.weekly_seconds)} weekly requirement</small>` : `<small>No weekly requirement</small>`}</div>
      <div class="stat-tile tone-sea"><div class="ico">${icon("chart")}</div><span>Total duty</span><strong>${hours(p.total_seconds)}</strong><small>${plural(p.shift_count, "shift")}</small></div>
      <div class="stat-tile tone-sky"><div class="ico">${icon("ticket")}</div><span>Tickets handled</span><strong>${fmt(p.tickets_handled)}</strong><small>Support workload</small></div>
      <div class="stat-tile tone-dusk"><div class="ico">${icon("badge")}</div><span>On staff since</span><strong style="font-size:1.35rem;margin-top:10px">${esc(day(p.joined_at))}</strong><small>${p.rank_changed_at ? `Rank since ${esc(day(p.rank_changed_at))}` : "&nbsp;"}</small></div>
    </div>
    <div class="grid-2">
      <section class="card">
        <div class="card-head"><div><h2>Recent shifts</h2><p>Last ${plural(shifts.length, "clocked session")}.</p></div></div>
        <div class="card-body">
          ${shifts.length ? `<div class="bars">${shifts.map((s) => `<div title="${esc(date(s.started_at))} · ${hours(s.seconds)}${s.end_reason ? ` · ${titleCase(s.end_reason)}` : " · active"}"><i style="height:${Math.max(2, (Number(s.seconds || 0) / maxShift) * 100).toFixed(1)}%"></i></div>`).join("")}</div>` : `<div class="bars-empty">No clocked shifts yet.</div>`}
        </div>
        ${shifts.length ? `<div class="feed">${[...shifts].reverse().slice(0, 5).map((s) => `<div class="feed-row"><div class="feed-ico">${icon("clock")}</div><div class="txt"><b>${hours(s.seconds)} on duty</b><small>${esc(s.end_reason ? `Ended · ${titleCase(s.end_reason)}` : "Shift in progress")}</small></div><time>${esc(date(s.started_at))}</time></div>`).join("")}</div>` : ""}
      </section>
      <section class="card">
        <div class="card-head"><div><h2>Staff history</h2><p>Rank and roster changes.</p></div></div>
        ${p.history?.length ? `<div class="timeline">${p.history.map((h) => `<div class="tl">${avatar(h.actor?.avatar, h.actor?.name || "System", "av-sm", h.actor_id)}<div><b>${esc(titleCase(h.action))}${h.details?.rank ? ` · ${esc(h.details.rank)}` : ""}</b><small>${esc(h.actor?.name ? `by ${h.actor.name}` : "System")} · ${esc(date(h.created_at))}</small></div></div>`).join("")}</div>` : empty("No visible history", "Roster changes will appear here.", "history")}
      </section>
    </div>
    ${p.discipline?.length ? `<section class="card">
      <div class="card-head"><div><h2>Discipline</h2><p>Visible only to this member and staff.</p></div></div>
      <div class="feed">${p.discipline.map((x) => `<div class="feed-row"><div class="feed-ico" style="color:#ff9aa3;background:rgba(255,95,109,.1)">${icon("alert")}</div><div class="txt"><b>${esc(titleCase(x.kind))}${x.revoked_at ? " · revoked" : ""}</b><small>${esc(x.reason)}${x.actor?.name ? ` - ${esc(x.actor.name)}` : ""}</small></div><time>${esc(date(x.created_at))}</time></div>`).join("")}</div>
    </section>` : ""}`;
}

function banLog() {
  if (!state.data.access.staff) return go("dashboard");
  setTitle("Staff workspace", "Ban registry");
  const all = state.data.banLog || [];
  const query = filter("ban-q");
  const kind = filter("ban-kind", "active");
  const tests = {
    all: () => true,
    active: (r) => isActive(r),
    network: (r) => r.guild_id === "global" && r.action === "ban",
    blacklist: (r) => r.action === "blacklist",
    discord: (r) => !["global", "game"].includes(r.guild_id),
    game: (r) => r.guild_id === "game",
  };
  const people = state.data.people || {};
  const rows = all.filter((r) => tests[kind](r) && matches(query, r.ban_id, r.target_id, r.target_name, people[r.target_id]?.name, people[r.target_id]?.username, r.reason));
  const count = (k) => all.filter(tests[k]).length;
  $("#portal-content").innerHTML = `
    <div class="toolbar">${searchBox("ban-q", "Search case ID, user, or reason")}${seg("ban-kind", [["active", "Active", count("active")], ["all", "All", count("all")], ["network", "Network", count("network")], ["blacklist", "Blacklists", count("blacklist")], ["discord", "Discord", count("discord")], ["game", "In-game", count("game")]], kind)}</div>
    <section class="card">
      ${rows.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Case</th><th>Member</th><th>Type</th><th>Reason</th><th>Issued by</th><th>Status</th></tr></thead><tbody>${rows.map((r) => `<tr>
        <td>${idChip(r.ban_id)}<br><small style="color:var(--ink-3)" title="${esc(date(r.created_at))}">${esc(day(r.created_at))}</small></td>
        <td>${person(r.target_id, r.target_name)}</td>
        <td><span class="strong" style="color:var(--ink)">${esc(titleCase(r.action))}</span><br><small style="color:var(--ink-3)">${esc(sourceLabel(r))}</small></td>
        <td class="reason" title="${esc(r.reason)}">${esc(r.reason)}</td>
        <td>${/^\d{15,24}$/.test(String(r.actor_id)) ? person(r.actor_id, "", { size: "av-xs", sub: "" }) : `<span style="color:var(--ink-3)">${esc(titleCase(r.actor_id))}</span>`}</td>
        <td>${pill(caseState(r))}${Number(r.appeal_count) ? `<br><small style="color:var(--ink-3)">${plural(r.appeal_count, "appeal")}</small>` : ""}</td>
      </tr>`).join("")}</tbody></table></div>` : empty(query ? "No matches" : "Nothing here", query ? "Try another case ID, user, or reason." : "No bans match this filter.", "ban")}
    </section>`;
}

function appealsQueue() {
  if (!state.data.access.staff) return go("dashboard");
  setTitle("Staff workspace", "Appeal queue");
  const rows = state.data.appealQueue || [];
  $("#portal-content").innerHTML = `
    <div class="callout good">${icon("info")}<div>Approving an appeal <b>lifts the punishment immediately</b> - network bans in every server, blacklists, single-server Discord bans, and linked EasyAdmin bans. You need the same permission as the matching manual unban.</div></div>
    ${rows.length ? `<div class="cases">${rows.map((a) => `<article class="appeal-card">
      <div class="head">${person(a.author_id)}<div class="chips" style="margin:0">${idChip(a.ban_id)}<span class="pill plain">${esc(titleCase(a.action))}</span>${pill(a.status)}</div></div>
      <div class="kv"><div class="wide"><small>Original reason</small><b>${esc(a.case_reason)}</b></div></div>
      <div class="quote">${esc(a.statement)}</div>
      <div class="head"><div class="meta"><span>Appeal #${a.id}</span><span>Submitted ${esc(ago(a.created_at))}</span>${a.ticket_id ? `<span>Ticket #${a.ticket_id}</span>` : ""}</div><div class="foot"><button class="btn btn-glass btn-sm" type="button" data-review-appeal="${a.id}">Review appeal</button></div></div>
    </article>`).join("")}</div>` : `<section class="card">${empty("Queue clear", "No appeals are waiting for review.", "check", "61 220 151")}</section>`}`;
}

function ticketOps() {
  if (!state.data.access.staff) return go("dashboard");
  setTitle("Staff workspace", "Tickets");
  const all = state.data.ticketQueue || [];
  const me = state.data.user.id;
  const kind = filter("tk-kind", "open");
  const query = filter("tk-q");
  const tests = { open: (t) => t.status !== "closed", unclaimed: (t) => t.status !== "closed" && !t.claimed_by, mine: (t) => t.status !== "closed" && t.claimed_by === me, closed: (t) => t.status === "closed", all: () => true };
  const people = state.data.people || {};
  const rows = all.filter((t) => tests[kind](t) && matches(query, t.id, t.subject, t.type, t.author_id, people[t.author_id]?.name, people[t.author_id]?.username));
  const count = (k) => all.filter(tests[k]).length;
  const priorities = state.data.priorities || [];
  $("#portal-content").innerHTML = `
    <div class="toolbar">${searchBox("tk-q", "Search ticket, subject, or member")}${seg("tk-kind", [["open", "Open", count("open")], ["unclaimed", "Unclaimed", count("unclaimed")], ["mine", "Mine", count("mine")], ["closed", "Closed", count("closed")], ["all", "All", count("all")]], kind)}</div>
    <section class="card">
      ${rows.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Ticket</th><th>Member</th><th>Subject</th><th>Status</th><th>Priority</th><th>Claimed by</th><th></th></tr></thead><tbody>${rows.map((t) => {
        const overdue = t.status !== "closed" && t.due_at && Number(t.due_at) < Date.now();
        return `<tr>
          <td><span class="strong mono" style="color:var(--ink)">#${t.id}</span><br><small style="color:var(--ink-3)" title="${esc(date(t.created_at))}">${esc(ago(t.created_at))}</small></td>
          <td>${person(t.author_id)}</td>
          <td><span class="strong clip" style="color:var(--ink)" title="${esc(t.subject)}">${esc(t.subject)}</span><small style="color:var(--ink-3)">${esc(titleCase(t.type))}</small></td>
          <td>${pill(t.status)}${t.close_requested_by ? `<br><span class="pill pill-warn" style="margin-top:5px">Close requested</span>` : ""}</td>
          <td><span class="prio p${Number(t.priority)}"><i></i>${esc(priorities[Number(t.priority)]?.label || `P${t.priority}`)}</span>${overdue ? `<br><small style="color:#ff9aa3">Overdue</small>` : ""}</td>
          <td>${t.claimed_by ? person(t.claimed_by, "", { size: "av-xs", sub: "" }) : `<span style="color:var(--ink-3)">-</span>`}</td>
          <td><div class="actions">${t.status !== "closed"
            ? `<a class="icon-btn" href="https://discord.com/channels/${esc(t.guild_id)}/${esc(t.channel_id)}" target="_blank" rel="noopener" title="Open in Discord">${icon("external")}</a><button class="btn btn-glass btn-sm" type="button" data-ticket-action="${t.id}:${t.claimed_by === me ? "release" : "claim"}">${t.claimed_by === me ? "Release" : "Claim"}</button><button class="icon-btn" type="button" data-ticket-manage="${t.id}" title="Priority, note, or close" aria-label="Manage ticket #${t.id}">${icon("dots")}</button>`
            : `<button class="btn btn-ghost btn-sm" type="button" data-ticket-action="${t.id}:reopen">Reopen</button>`}</div></td>
        </tr>`;
      }).join("")}</tbody></table></div>` : empty(kind === "open" ? "Inbox zero" : "Nothing here", kind === "open" ? "Every ticket has been handled. Nice work." : "No tickets match this filter.", "inbox", "85 196 255")}
    </section>`;
}

function liveOps() {
  if (!state.data.access.staff) return go("dashboard");
  setTitle("Staff workspace", "Live operations");
  const ops = state.data.liveOps || { online: false, players: [], scenes: [], calls: [] };
  const notes = state.data.handoffNotes || [];
  const openNotes = notes.filter((n) => !n.resolved_at);
  const activeEvent = ops.event;
  const controls = state.data.access.opsControl ? `<button class="btn btn-glass" type="button" data-ops-dialog="announce">${icon("radio")} Broadcast</button><button class="btn btn-sun" type="button" data-ops-dialog="event">${icon("plus")} Launch event</button>` : "";
  const playerRows = (ops.players || []).map((p) => `<tr><td><span class="strong mono" style="color:var(--ink)">#${Number(p.id)}</span></td><td><span class="strong" style="color:var(--ink)">${esc(p.name)}</span><br><small style="color:var(--ink-3)">${p.joined ? "Discord linked" : "Discord unlinked"}</small></td><td>${p.organization ? `<span class="pill pill-sea">${esc(p.organization)}</span>` : '<span style="color:var(--ink-3)">Civilian</span>'}</td><td>${p.staffDuty ? '<span class="pill pill-good">Staff on duty</span>' : '<span style="color:var(--ink-3)">—</span>'}</td></tr>`).join("");
  const calls = (ops.calls || []).map((c) => `<div class="feed-row"><div class="feed-ico" style="color:#ff9aa3;background:rgba(255,95,109,.1)">${icon("radio")}</div><div class="txt"><b>${esc(c.kind)} #${Number(c.id)} · ${esc(c.callerName)}</b><small>${esc(c.message)}</small></div><div style="display:grid;justify-items:end;gap:5px"><span class="pill plain">${Number(c.responders)} responding</span><time>${esc(ago(c.at))}</time></div></div>`).join("");
  const scenes = (ops.scenes || []).map((s) => `<article class="ops-scene"><div class="feed-ico">${icon("pin")}</div><div><small>#${Number(s.id)} · ${esc(s.hostName)} · ${esc(ago(s.createdAt))}</small><b>${esc(s.title)}</b><span>${esc(s.description)} · ${plural(s.attendees, "interested player")}</span></div>${state.data.access.sceneModerate ? `<button class="btn btn-ghost btn-sm" type="button" data-live-action="scene_end" data-id="${Number(s.id)}">End</button>` : ""}</article>`).join("");
  const handoffs = notes.map((n) => `<article class="handoff${n.pinned ? " pinned" : ""}${n.resolved_at ? " resolved" : ""}"><div>${person(n.author_id, "Staff", { size: "av-xs", sub: ago(n.created_at) })}<p>${esc(n.body)}</p>${n.resolved_at ? `<small>Resolved ${esc(ago(n.resolved_at))}${n.resolved_by ? ` by ${esc(state.data.people?.[n.resolved_by]?.name || "staff")}` : ""}</small>` : ""}</div>${!n.resolved_at ? `<div class="actions"><button class="icon-btn" type="button" data-live-action="handoff_pin" data-id="${n.id}" data-pinned="${n.pinned ? 0 : 1}" title="${n.pinned ? "Unpin" : "Pin"}">${icon("pin")}</button><button class="btn btn-glass btn-sm" type="button" data-live-action="handoff_resolve" data-id="${n.id}">Resolve</button></div>` : ""}</article>`).join("");
  $("#portal-content").innerHTML = `
    <div class="toolbar"><div class="ops-status ${ops.online ? "online" : ""}"><i></i><div><b>${ops.online ? "Game server connected" : "Game API unavailable"}</b><small>${ops.generatedAt ? `Snapshot ${esc(ago(ops.generatedAt))}` : "Live controls are paused"}</small></div></div><div class="actions">${controls}<button class="icon-btn" type="button" data-live-refresh title="Refresh">${icon("history")}</button></div></div>
    <div class="stats">
      <div class="stat-tile tone-sky"><div class="ico">${icon("users")}</div><span>Players online</span><strong>${fmt(ops.players?.length)}</strong><small>${fmt((ops.players || []).filter((p) => p.staffDuty).length)} staff on duty</small></div>
      <div class="stat-tile tone-sea"><div class="ico">${icon("pin")}</div><span>Live scenes</span><strong>${fmt(ops.scenes?.length)}</strong><small>Player-hosted roleplay</small></div>
      <div class="stat-tile tone-bad"><div class="ico">${icon("radio")}</div><span>Dispatch calls</span><strong>${fmt(ops.calls?.length)}</strong><small>Last 30 minutes</small></div>
      <div class="stat-tile tone-warn"><div class="ico">${icon("history")}</div><span>Open handoffs</span><strong>${fmt(openNotes.length)}</strong><small>${fmt(openNotes.filter((n) => n.pinned).length)} pinned</small></div>
    </div>
    ${activeEvent ? `<section class="ops-event"><div><span class="pill pill-sun">Live community event</span><h2>${esc(activeEvent.title)}</h2><p>${esc(activeEvent.description || "Community event in progress")}</p><small>${icon("pin")} ${esc(activeEvent.location || "Florida Bay")} · ends ${esc(date(activeEvent.expiresAt))}</small></div>${state.data.access.opsControl ? `<button class="btn btn-danger" type="button" data-live-action="event_end">End event</button>` : ""}</section>` : ""}
    <div class="grid-2 even">
      <section class="card"><div class="card-head"><div><h2>Community scenes</h2><p>Live player-led roleplay across the map.</p></div></div><div class="ops-scenes">${scenes || empty("No hosted scenes", "Players can start one in-game with /scenehost.", "pin")}</div></section>
      <section class="card"><div class="card-head"><div><h2>Dispatch pulse</h2><p>Active 911, 311, and panic calls.</p></div></div>${calls ? `<div class="feed">${calls}</div>` : empty("No active calls", "The dispatch queue is quiet.", "check", "61 220 151")}</section>
    </div>
    <section class="card"><div class="card-head"><div><h2>Connected players</h2><p>Character, organization, and duty visibility.</p></div></div>${playerRows ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>ID</th><th>Player</th><th>Role</th><th>Duty</th></tr></thead><tbody>${playerRows}</tbody></table></div>` : empty("Server is empty", "Connected players will appear here.", "users")}</section>
    <section class="card"><div class="card-head"><div><h2>Shift handoff board</h2><p>Persistent context for the next staff team.</p></div><button class="btn btn-glass btn-sm" type="button" data-ops-dialog="handoff">${icon("plus")} Add handoff</button></div><div class="handoffs">${handoffs || empty("No handoffs", "Leave context, watch items, or follow-ups for the next shift.", "check", "61 220 151")}</div></section>`;
}

function settings() {
  if (!state.data.access.owner) return go("dashboard");
  setTitle("Owner", "Live configuration");
  $("#portal-content").innerHTML = `
    <section class="welcome">
      <div class="who">
        <small>Owner-only control plane</small>
        <h2>Configure everything, live.</h2>
        <p>Global role sync, ACE permissions, ticket forms, staff ranks, security, channels, and FiveM settings. Every change applies immediately.</p>
        <div class="chips"><span class="pill pill-good">Owner verified</span><span class="pill plain mono">${esc(state.data.user.id)}</span></div>
      </div>
      <a class="btn btn-sun btn-lg" href="control.html">Open live configuration ${icon("external")}</a>
    </section>`;
}

const renders = { dashboard, punishments, support, roster, profile: profileView, banlog: banLog, appeals: appealsQueue, ticketops: ticketOps, liveops: liveOps, settings };
function render() {
  nav();
  (renders[state.view] || dashboard)();
}
function go(view) {
  state.view = view;
  state.profile = null;
  if (location.hash.slice(1) !== view) history.pushState(null, "", `#${view}`);
  closeDrawer();
  render();
  window.scrollTo({ top: 0 });
}

async function load({ quiet = false } = {}) {
  if (!quiet) $("#portal-content").innerHTML = `<div class="loading"><div class="spinner"></div>Loading live data</div>`;
  state.data = await api("portal/bootstrap");
  if (state.profile) state.profile = await api(`portal/staff-profile?id=${encodeURIComponent(state.profile.discord_id)}`).catch(() => null);
  render();
}

/* ---------- dialogs ---------- */
function openDialog({ kicker = "Florida Bay", title, body, submit = "Submit", tone = "btn-sun", action, data = {} }) {
  state.dialog = { action, data };
  $("#dialog-kicker").textContent = kicker;
  $("#dialog-title").textContent = title;
  $("#dialog-body").innerHTML = body;
  const button = $("#dialog-submit");
  button.textContent = submit;
  button.className = `btn ${tone}`;
  $("#portal-dialog").showModal();
  ($("#dialog-body").querySelector("textarea, input:not([type=radio]):not([disabled]), select") || button).focus({ preventScroll: true });
}

function ticketDialog() {
  const types = state.data.ticketTypes.filter((item) => item.enabled !== false && item.key !== "appeal");
  if (!types.length) return toast("Ticket types are not configured yet.", true);
  openDialog({
    kicker: "Private support",
    title: "Open a ticket",
    submit: "Create ticket",
    action: "ticket-open",
    body: `<label class="field">What do you need help with?<select name="type" id="ticket-type">${types.map((t) => `<option value="${esc(t.key)}">${esc(t.label)}${t.description ? ` - ${esc(t.description)}` : ""}</option>`).join("")}</select></label><div id="ticket-fields" style="display:grid;gap:16px"></div><div class="callout">${icon("info")}<div>A private channel is created in the Florida Bay Discord. You'll get a link as soon as it's ready.</div></div>`,
  });
  renderTicketFields(types[0]);
}

function renderTicketFields(type) {
  const spec = typeof type === "string" ? state.data.ticketTypes.find((t) => t.key === type) : type;
  $("#ticket-fields").innerHTML = (spec?.fields || []).map(([id, label, style, required, max]) => `<label class="field">${esc(label)}${required ? "" : ` <small>(optional)</small>`}${style === "paragraph" ? `<textarea name="field:${esc(id)}" maxlength="${Number(max) || 1000}" ${required ? "required" : ""}></textarea>` : `<input name="field:${esc(id)}" maxlength="${Number(max) || 200}" ${required ? "required" : ""}>`}</label>`).join("");
}

function appealDialog(banId) {
  const row = state.data.punishments.find((p) => p.ban_id === banId);
  openDialog({
    kicker: "Verified appeal",
    title: `Appeal ${banId}`,
    submit: "Submit appeal",
    action: "appeal",
    data: { banId },
    body: `${row ? `<div class="kv"><div><small>Punishment</small><b>${esc(titleCase(row.action))} · ${esc(scope(row))}</b></div><div><small>Issued</small><b>${esc(date(row.created_at))}</b></div><div class="wide"><small>Reason given</small><b>${esc(row.reason)}</b></div></div>` : ""}
      <label class="field">Why should this be reconsidered?<textarea name="statement" minlength="40" maxlength="4000" required placeholder="Explain what happened, what you'd like staff to reconsider, and anything you've learned or changed."></textarea><small>At least 40 characters. Be specific and honest - this opens a private Ban Appeal ticket with staff.</small></label>`,
  });
}

function ticketManageDialog(id) {
  const priorities = state.data.priorities || [];
  openDialog({
    kicker: "Support operations",
    title: `Manage ticket #${id}`,
    submit: "Apply",
    action: "ticket-manage",
    data: { ticketId: id },
    body: `<label class="field">Action<select name="ticketAction" id="manage-action"><option value="priority">Change priority</option><option value="note">Add a private staff note</option><option value="close">Close the ticket</option></select></label>
      <label class="field" id="manage-level">Priority<select name="level">${priorities.map((p, i) => p ? `<option value="${i}">${esc(p.label)} · ${esc(p.sla)} min target</option>` : "").join("")}</select></label>
      <label class="field">Reason or note<textarea name="reason" maxlength="1000" required></textarea></label>`,
  });
}

function reviewAppealDialog(id) {
  const a = (state.data.appealQueue || []).find((item) => Number(item.id) === Number(id));
  if (!a) return;
  const what = a.action === "blacklist" ? "the network blacklist" : "this ban";
  openDialog({
    kicker: "Appeal review",
    title: `${a.ban_id} · Appeal #${a.id}`,
    submit: "Save decision",
    action: "appeal-review",
    data: { appealId: a.id, banId: a.ban_id },
    body: `<div class="kv"><div><small>Member</small><b>${esc(state.data.people?.[a.author_id]?.name || a.author_id)}</b></div><div><small>Punishment</small><b>${esc(titleCase(a.action))}</b></div><div class="wide"><small>Original reason</small><b>${esc(a.case_reason)}</b></div></div>
      <div class="quote">${esc(a.statement)}</div>
      <div class="field">Decision
        <div class="choice">
          <label><input type="radio" name="status" value="under_review" ${a.status === "submitted" ? "checked" : ""}><span>In review<small>Let them know you're on it</small></span></label>
          <label class="approve"><input type="radio" name="status" value="approved"><span>Approve<small>Lifts ${esc(what)} now</small></span></label>
          <label class="deny"><input type="radio" name="status" value="denied"><span>Deny<small>Punishment stays</small></span></label>
        </div>
      </div>
      <div class="callout warn" id="approve-warning" hidden>${icon("alert")}<div>Approving will <b>immediately lift ${esc(a.ban_id)}</b> wherever it applies, DM the member, and close the appeal ticket.</div></div>
      <label class="field">Response to the member<textarea name="response" maxlength="4000" placeholder="Visible to the member in the portal and their DM."></textarea></label>`,
  });
}

function announcementDialog() {
  openDialog({ kicker: "Live operations", title: "Server-wide broadcast", submit: "Broadcast now", action: "ops-announce", body: `<div class="callout warn">${icon("radio")}<div>This is delivered immediately to every connected player as a Florida Bay announcement.</div></div><label class="field">Message<textarea name="message" minlength="3" maxlength="300" required placeholder="Clear, useful information for everyone online."></textarea></label>` });
}

function eventDialog() {
  openDialog({ kicker: "Community programming", title: "Launch a live event", submit: "Launch event", action: "ops-event", body: `<label class="field">Event title<input name="title" minlength="4" maxlength="80" required placeholder="Sunset cruise & car meet"></label><label class="field">Description<textarea name="description" maxlength="300" placeholder="What is happening and how should players participate?"></textarea></label><div class="form-split"><label class="field">Location label<input name="location" maxlength="80" placeholder="Del Perro Pier"></label><label class="field">Duration (minutes)<input name="duration" type="number" min="10" max="180" value="60" required></label></div><details class="ops-coords"><summary>Optional exact GPS waypoint</summary><div class="form-split"><label class="field">X<input name="x" type="number" step="0.1" placeholder="-1600"></label><label class="field">Y<input name="y" type="number" step="0.1" placeholder="-1000"></label></div><label class="field">Z<input name="z" type="number" step="0.1" placeholder="13"></label></details>` });
}

function handoffDialog() {
  openDialog({ kicker: "Shift continuity", title: "Add a handoff note", submit: "Post handoff", action: "ops-handoff", body: `<label class="field">What should the next staff shift know?<textarea name="body" minlength="4" maxlength="1000" required placeholder="Player situation, event follow-up, watch item, or unresolved operational context."></textarea></label><label class="check-row"><input type="checkbox" name="pinned"><span><b>Pin this note</b><small>Keep it above routine handoffs until resolved.</small></span></label>` });
}

/* ---------- events ---------- */
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast(`Copied ${text}`); } catch { toast(text); }
}

$("#portal-nav").addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (button) go(button.dataset.view);
});
$("#sidebar-user").addEventListener("click", async (event) => {
  if (!event.target.closest("[data-logout]")) return;
  await api("auth/logout", { method: "POST", body: "{}" }).catch(() => {});
  location.reload();
});

$("#portal-content").addEventListener("click", async (event) => {
  const target = event.target;
  const chip = target.closest("[data-copy]");
  if (chip) return copy(chip.dataset.copy);
  const filterBtn = target.closest("[data-filter]");
  if (filterBtn) { state.filters[filterBtn.dataset.filter] = filterBtn.dataset.value; return render(); }
  const view = target.closest("[data-view]");
  if (view) return go(view.dataset.view);
  if (target.closest("[data-open-ticket]")) return ticketDialog();
  const opsDialog = target.closest("[data-ops-dialog]");
  if (opsDialog) {
    if (opsDialog.dataset.opsDialog === "announce") return announcementDialog();
    if (opsDialog.dataset.opsDialog === "event") return eventDialog();
    if (opsDialog.dataset.opsDialog === "handoff") return handoffDialog();
  }
  if (target.closest("[data-live-refresh]")) {
    try { await load({ quiet: true }); toast("Live operations refreshed."); } catch (error) { toast(error.message, true); }
    return;
  }
  const liveAction = target.closest("[data-live-action]");
  if (liveAction) {
    const action = liveAction.dataset.liveAction;
    liveAction.disabled = true;
    try {
      const input = { action };
      if (action === "scene_end") input.sceneId = Number(liveAction.dataset.id);
      if (action === "handoff_resolve" || action === "handoff_pin") input.noteId = Number(liveAction.dataset.id);
      if (action === "handoff_pin") input.pinned = liveAction.dataset.pinned === "1";
      const result = await api("portal/liveops/action", { method: "POST", body: JSON.stringify(input) });
      state.data = result.data;
      render();
      toast(action === "event_end" ? "Community event ended." : action === "scene_end" ? "Scene ended and players notified." : "Handoff updated.");
    } catch (error) { toast(error.message, true); liveAction.disabled = false; }
    return;
  }
  const appeal = target.closest("[data-appeal]");
  if (appeal) return appealDialog(appeal.dataset.appeal);
  const requestClose = target.closest("[data-request-close]");
  if (requestClose) {
    try {
      await api("portal/ticket/request-close", { method: "POST", body: JSON.stringify({ ticketId: requestClose.dataset.requestClose }) });
      toast("Close request sent to staff.");
      await load({ quiet: true });
    } catch (error) { toast(error.message, true); }
    return;
  }
  const card = target.closest("[data-profile]");
  if (card) {
    try {
      state.profile = await api(`portal/staff-profile?id=${encodeURIComponent(card.dataset.profile)}`);
      state.view = "profile";
      history.pushState(null, "", "#profile");
      render();
      window.scrollTo({ top: 0 });
    } catch (error) { toast(error.message, true); }
    return;
  }
  const action = target.closest("[data-ticket-action]");
  if (action) {
    const [ticketId, type] = action.dataset.ticketAction.split(":");
    action.disabled = true;
    try {
      const result = await api("portal/ticket/action", { method: "POST", body: JSON.stringify({ ticketId, action: type }) });
      state.data = result.data;
      render();
      toast(`Ticket #${ticketId} ${type === "claim" ? "claimed" : type === "release" ? "released" : "reopened"}.`);
    } catch (error) { toast(error.message, true); action.disabled = false; }
    return;
  }
  const manage = target.closest("[data-ticket-manage]");
  if (manage) return ticketManageDialog(manage.dataset.ticketManage);
  const review = target.closest("[data-review-appeal]");
  if (review) return reviewAppealDialog(Number(review.dataset.reviewAppeal));
});

$("#portal-content").addEventListener("input", (event) => {
  const box = event.target.closest("[data-search]");
  if (!box) return;
  state.filters[box.dataset.search] = box.value;
  const caret = box.selectionStart;
  render();
  const again = $(`[data-search="${box.dataset.search}"]`);
  again?.focus();
  again?.setSelectionRange(caret, caret);
});

// Discord avatars occasionally 404 (changed avatar); fall back to initials.
document.addEventListener("error", (event) => {
  if (event.target instanceof HTMLImageElement && event.target.parentElement?.classList.contains("av")) event.target.remove();
}, true);

$("#portal-dialog").addEventListener("change", (event) => {
  if (event.target.id === "ticket-type") renderTicketFields(event.target.value);
  if (event.target.id === "manage-action") $("#manage-level").hidden = event.target.value !== "priority";
  if (event.target.name === "status") {
    $("#approve-warning").hidden = event.target.value !== "approved";
    const button = $("#dialog-submit");
    button.className = `btn ${event.target.value === "approved" ? "btn-good" : event.target.value === "denied" ? "btn-danger" : "btn-sun"}`;
    button.textContent = event.target.value === "approved" ? "Approve & lift" : event.target.value === "denied" ? "Deny appeal" : "Save decision";
  }
});
$$("[data-dialog-close]").forEach((button) => button.addEventListener("click", () => $("#portal-dialog").close()));
$("#portal-dialog").addEventListener("click", (event) => { if (event.target === $("#portal-dialog")) $("#portal-dialog").close(); });

$("#dialog-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const button = $("#dialog-submit");
  const label = button.textContent;
  button.disabled = true;
  button.textContent = "Working…";
  try {
    let result;
    const { action, data } = state.dialog;
    if (action === "ticket-open") {
      const values = {};
      for (const [key, value] of form) if (key.startsWith("field:")) values[key.slice(6)] = value;
      result = await api("portal/ticket/open", { method: "POST", body: JSON.stringify({ type: form.get("type"), form: values }) });
      toast(`Ticket #${result.result.id} is open - find it under Support or in Discord.`);
      state.view = "support";
      history.pushState(null, "", "#support");
    } else if (action === "appeal") {
      result = await api("portal/appeal", { method: "POST", body: JSON.stringify({ banId: data.banId, statement: form.get("statement") }) });
      toast(`Appeal submitted. Staff will review it in ticket #${result.result.ticket.id}.`);
    } else if (action === "ticket-manage") {
      const kind = form.get("ticketAction");
      const input = { ticketId: data.ticketId, action: kind, level: Number(form.get("level")) };
      if (kind === "note") input.note = form.get("reason"); else input.reason = form.get("reason");
      result = await api("portal/ticket/action", { method: "POST", body: JSON.stringify(input) });
      toast("Ticket updated here and in Discord.");
    } else if (action === "appeal-review") {
      const status = form.get("status");
      if (!status) throw new Error("Choose a decision.");
      result = await api("portal/appeal/review", { method: "POST", body: JSON.stringify({ appealId: data.appealId, status, response: form.get("response") }) });
      toast(status === "approved" ? `Appeal approved - ${data.banId} has been lifted.` : status === "denied" ? "Appeal denied." : "Marked as in review.");
    } else if (action === "ops-announce") {
      result = await api("portal/liveops/action", { method: "POST", body: JSON.stringify({ action: "announce", message: form.get("message") }) });
      toast("Broadcast delivered to the game server.");
    } else if (action === "ops-event") {
      result = await api("portal/liveops/action", { method: "POST", body: JSON.stringify({ action: "event_start", title: form.get("title"), description: form.get("description"), location: form.get("location"), duration: Number(form.get("duration")), x: form.get("x"), y: form.get("y"), z: form.get("z") }) });
      toast("Community event is live and players were notified.");
    } else if (action === "ops-handoff") {
      result = await api("portal/liveops/action", { method: "POST", body: JSON.stringify({ action: "handoff_add", body: form.get("body"), pinned: form.get("pinned") === "on" }) });
      toast("Handoff posted for the staff team.");
    }
    if (result?.data) state.data = result.data;
    $("#portal-dialog").close();
    render();
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
});

/* ---------- drawer ---------- */
const shell = $("#portal-app");
function closeDrawer() { shell.classList.remove("nav-open"); }
$("#drawer-btn").addEventListener("click", () => shell.classList.add("nav-open"));
$("#scrim").addEventListener("click", closeDrawer);
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeDrawer(); });

/* ---------- auth ---------- */
$("#discord-login").addEventListener("click", async () => {
  const button = $("#discord-login");
  button.disabled = true;
  try { location.href = (await api("auth/start")).url; }
  catch (error) { $("#auth-message").textContent = error.message; button.disabled = false; }
});

$("#dm-start-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const discordId = new FormData(event.currentTarget).get("discordId");
  const message = $("#auth-message");
  message.className = "form-message good";
  message.textContent = "Sending a private code…";
  try {
    await api("auth/dm/start", { method: "POST", body: JSON.stringify({ discordId }) });
    $("#dm-verify-form").elements.discordId.value = discordId;
    $("#dm-start-form").hidden = true;
    $("#dm-verify-form").hidden = false;
    $("#dm-verify-form").elements.code.focus();
    message.textContent = "Code sent - check your Discord DMs from Florida Bay Network.";
  } catch (error) { message.className = "form-message"; message.textContent = error.message; }
});

$("#dm-verify-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const message = $("#auth-message");
  message.className = "form-message good";
  message.textContent = "Verifying…";
  try {
    await api("auth/dm/verify", { method: "POST", body: JSON.stringify({ discordId: form.get("discordId"), code: form.get("code") }) });
    await start();
  } catch (error) { message.className = "form-message"; message.textContent = error.message; }
});

$("#refresh-portal").addEventListener("click", () => load().then(() => toast("Refreshed.")).catch((error) => toast(error.message, true)));
window.addEventListener("popstate", () => {
  if (!state.data) return;
  const requested = location.hash.slice(1) || "dashboard";
  if (requested !== "profile") state.profile = null;
  state.view = requested;
  render();
});

async function start() {
  const session = await api("auth/session");
  if (!session.authenticated) {
    $("#auth-view").hidden = false;
    $("#portal-app").hidden = true;
    return;
  }
  $("#auth-view").hidden = true;
  $("#portal-app").hidden = false;
  if (state.view === "organizations") state.view = "dashboard";
  await load();
  if (new URLSearchParams(location.search).get("next") === "control" && state.data.access.owner) location.replace("control.html");
}

start().catch((error) => {
  $("#auth-view").hidden = false;
  $("#portal-app").hidden = true;
  $("#auth-message").textContent = error.message;
});
