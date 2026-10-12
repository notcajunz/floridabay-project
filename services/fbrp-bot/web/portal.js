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
  exam: '<path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1Z"/><path d="M8 6H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-2"/><path d="m9 13 2 2 4-4"/>',
  review: '<path d="M4 5h16M4 12h10M4 19h7"/><circle cx="17.5" cy="16.5" r="3"/><path d="m20 19 2 2"/>',
  wallet: '<path d="M19 7V5a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-4a2 2 0 0 0 0 4h4v2a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V6"/><circle cx="17" cy="15" r=".6"/>',
  building: '<path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M3 21h18M8 8h3M8 12h3M8 16h3"/>',
  code: '<path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14"/>',
  car: '<path d="M3 17v-4l2-5.5A2 2 0 0 1 6.9 6h10.2a2 2 0 0 1 1.9 1.5L21 13v4h-3v2h-2v-2H8v2H6v-2z"/><path d="M3 13h18"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  shirt: '<path d="M8 3 4 6l2 4 2-1v12h8V9l2 1 2-4-4-3c0 2-2 3-4 3s-4-1-4-3Z"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
  leaf: '<path d="M5 21c0-9 6-15 16-16-1 10-7 16-16 16Z"/><path d="M5 21 14 12"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${PATHS[name] || ""}</svg>`;

/* ---------- state ---------- */
const state = { data: null, view: location.hash.slice(1) || "dashboard", dialog: null, profile: null, filters: {}, commandReference: null };
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
  const tones = { active: "bad", open: "sea", claimed: "dusk", submitted: "warn", under_review: "sea", approved: "good", denied: "bad", closed: "", lifted: "good", recorded: "", on_staff: "good", inactive: "", expired: "", loa: "warn", removed: "bad", withdrawn: "", passed: "good", failed: "bad" };
  const label = { under_review: "In review", loa: "On leave", on_staff: "Active", submitted: "Awaiting review" }[status] || titleCase(status);
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
  const pendingAppeals = (data.appealQueue || []).filter((a) => ["submitted", "under_review"].includes(a.status)).length;
  const openTickets = (data.ticketQueue || []).filter((t) => t.status !== "closed").length;
  const exams = data.exams || {};
  const showExams = (exams.exams || []).length > 0 || (exams.applications || []).length > 0;
  const pendingExams = (exams.reviewQueue || []).filter((row) => ["submitted", "under_review"].includes(row.status)).length;
  const orgs = data.economy?.organizations || [];
  const groups = [
    ["Account", [
      ["dashboard", "Dashboard", "home"],
      ["punishments", "Punishments", "shield"],
      ["support", "Support", "life"],
    ]],
    ["Community", [
      ["roster", "Staff roster", "users"],
      ...(data.profile ? [["profile", "My staff profile", "user"]] : []),
      ...(orgs.length ? [["organizations", "Organizations", "wallet"]] : []),
    ]],
    ...(showExams ? [["Career", [["exams", "Staff exams", "exam", (exams.exams || []).filter((e) => e.eligible).length]]]] : []),
    ...(access.staff || exams.reviewer || access.commandReference ? [["Staff workspace", [
      ...(access.staff ? [
        ["liveops", "Live operations", "activity", (data.liveOps?.scenes?.length || 0) + (data.liveOps?.calls?.length || 0)],
        ["banlog", "Ban registry", "ban"],
        ["appeals", "Appeal queue", "scale", pendingAppeals],
        ["ticketops", "Tickets", "ticket", openTickets],
      ] : []),
      ...(exams.reviewer ? [["examreviews", "Exam reviews", "review", pendingExams]] : []),
      ...(access.commandReference ? [["commands", "Bot commands", "code"]] : []),
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
      <button class="stat-tile tone-warn" type="button" data-view="appeals"><div class="ico">${icon("scale")}</div><span>Appeals waiting</span><strong>${fmt((d.appealQueue || []).filter((a) => ["submitted", "under_review"].includes(a.status)).length)}</strong><small>Verified ban appeals</small></button>
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
    ${(d.exams?.exams || []).filter((e) => e.eligible).map((e) => `<button class="exam-callout" type="button" data-view="exams"><span class="feed-ico">${icon("exam")}</span><div><small>Promotion exam open</small><b>${esc(e.title)}</b><span>You're eligible to apply for ${esc(e.target_rank)}. ${fmt(e.questionCount)} questions · pass mark ${fmt(e.pass_mark)}%</span></div>${icon("chev").replace("<svg", '<svg class="chev"')}</button>`).join("")}
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

function support() {
  setTitle("Account", "Support");
  const rows = state.data.tickets;
  $("#portal-content").innerHTML = `
    <div class="toolbar"><p class="page-intro" style="flex:1;min-width:260px">Open a private support channel without leaving the website. Your ticket shows up in the same live queue staff use in Discord.</p><button class="btn btn-sun" type="button" data-open-ticket>${icon("plus")} New ticket</button></div>
    <section class="card">
      <div class="card-head"><div><h2>Your tickets</h2><p>Website and Discord tickets share one history.</p></div></div>
      ${rows.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Ticket</th><th>Subject</th><th>Type</th><th>Status</th><th>Opened</th><th></th></tr></thead><tbody>${rows.map((t) => `<tr>
        <td class="strong mono">#${t.id}</td><td class="strong"><span class="clip" title="${esc(t.subject)}">${esc(t.subject)}</span></td><td>${esc(titleCase(t.type))}</td><td>${pill(t.status)}</td><td title="${esc(date(t.created_at))}">${esc(ago(t.created_at))}</td>
        <td><div class="actions"><a class="btn btn-ghost btn-sm" href="transcript.html?id=${t.id}${t.status !== "closed" ? "&refresh=1" : ""}">Transcript ${icon("external")}</a>${t.status !== "closed" ? `<a class="btn btn-ghost btn-sm" href="https://discord.com/channels/${esc(t.guild_id)}/${esc(t.channel_id)}" target="_blank" rel="noopener">Discord ${icon("external")}</a><button class="btn btn-glass btn-sm" type="button" data-request-close="${t.id}">Request close</button>` : ""}</div></td>
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
          <td><div class="actions"><a class="icon-btn" href="transcript.html?id=${t.id}${t.status !== "closed" ? "&refresh=1" : ""}" title="View hosted transcript">${icon("history")}</a>${t.status !== "closed"
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


/* ---------- appeals ---------- */
const APPEAL_STATUS_TEXT = { submitted: "Submitted", under_review: "In review", info_requested: "Staff need more info", approved: "Approved", reduced: "Reduced", denied: "Denied", withdrawn: "Withdrawn" };
const EVENT_TEXT = {
  submitted: "Appeal submitted", claimed: "Claimed by a reviewer", status: "Moved into review", info_request: "Staff asked for more information",
  member_reply: "Member replied", staff_note: "Internal note", vote: "Vote", decision: "Decision", withdrawn: "Appeal withdrawn",
};
const appealDraftKey = (banId) => `fbrp-appeal-draft:${state.data.user.id}:${banId}`;
const loadAppealDraft = (banId) => { try { return JSON.parse(localStorage.getItem(appealDraftKey(banId)) || "{}") || {}; } catch { return {}; } };
const saveAppealDraft = (banId, draft) => { try { localStorage.setItem(appealDraftKey(banId), JSON.stringify(draft)); } catch {} };
const clearAppealDraft = (banId) => { try { localStorage.removeItem(appealDraftKey(banId)); } catch {} };

function appealTimeline(events, staffView) {
  return `<ol class="appeal-timeline">${(events || []).map((e) => {
    const vote = e.kind === "vote" ? e.data?.vote : null;
    const decision = e.kind === "decision" ? e.data?.decision : null;
    const title = decision ? `Appeal ${decision}${e.data?.reducedUntil ? ` · ban now ends ${date(e.data.reducedUntil)}` : ""}` : vote ? `Voted to ${vote}` : EVENT_TEXT[e.kind] || titleCase(e.kind);
    const actor = staffView && e.actor_id ? state.data.people?.[e.actor_id]?.name || "Staff" : "";
    return `<li class="ev-${esc(e.kind)}${e.visibility === "staff" ? " internal" : ""}${decision ? ` d-${esc(decision)}` : ""}"><i></i><div><b>${esc(title)}</b>${actor ? `<small>${esc(actor)}${e.visibility === "staff" ? " · staff only" : ""}</small>` : ""}${e.body ? `<p>${esc(e.body)}</p>` : ""}</div><time title="${esc(date(e.created_at))}">${esc(ago(e.created_at))}</time></li>`;
  }).join("")}</ol>`;
}

function appealAnswers(a) {
  const q = state.data.appealQuestions || [];
  if (!a.answers) return `<div class="quote">${esc(a.statement)}</div>`;
  return `<div class="appeal-answers">${q.map((question) => {
    const value = a.answers[question.id];
    if (!value) return "";
    const shown = question.type === "choice" ? (question.options.find(([key]) => key === value) || [value, value])[1] : value;
    return `<div class="appeal-answer${question.type === "choice" ? ` resp-${esc(value)}` : ""}"><small>${esc(question.label)}</small><p>${esc(shown)}</p></div>`;
  }).join("")}${(a.evidence || []).length ? `<div class="appeal-answer"><small>Evidence</small><div class="evidence-links">${a.evidence.map((link) => `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">${icon("external")}${esc(link.replace(/^https?:\/\//, "").slice(0, 60))}</a>`).join("")}</div></div>` : ""}</div>`;
}

function punishments() {
  setTitle("Account", "Punishments");
  if (state.appealing) return appealWizard();
  const rows = state.data.punishments;
  const appeals = state.data.appeals;
  const rules = state.data.appealRules || {};
  const limits = state.data.appealLimits || {};
  $("#portal-content").innerHTML = `
    <p class="page-intro">Every ban and blacklist - from Discord, the network, or in-game - has one Florida Bay case ID. Appeals open ${fmt(limits.waitHours || 24)} hours after a punishment, each punishment can be appealed up to ${fmt(limits.maxPerCase || 3)} times, and after a denial you wait ${fmt(limits.deniedCooldownDays || 14)} days. Staff may ask you follow-up questions here before deciding.</p>
    ${rows.length ? `<div class="cases">${rows.map((row) => {
      const live = isActive(row);
      const st = caseState(row);
      const rule = rules[row.ban_id];
      const side = rule?.can
        ? `<button class="btn btn-glass btn-sm" type="button" data-appeal="${esc(row.ban_id)}">${icon("scale")} Appeal</button><small>${fmt(rule.remaining)} appeal${rule.remaining === 1 ? "" : "s"} left</small>`
        : rule && live && rule.opensAt ? `<small title="${esc(rule.reason)}">Appeal opens ${esc(date(rule.opensAt))}</small>`
        : rule && live && !["submitted", "under_review", "info_requested"].includes(row.appeal_status) ? `<small>${esc(rule.reason)}</small>` : "";
      return `<article class="case ${live ? "is-active" : st === "lifted" ? "is-lifted" : ""}">
        <div class="case-ico">${icon(["ban", "blacklist"].includes(row.action) ? "ban" : row.action === "warn" ? "alert" : "gavel")}</div>
        <div class="case-main">
          <div class="case-top"><h3>${esc(titleCase(row.action))}</h3>${idChip(row.ban_id)}${pill(st)}${row.appeal_status ? `<span class="pill pill-dusk">Appeal: ${esc((APPEAL_STATUS_TEXT[row.appeal_status] || row.appeal_status).toLowerCase())}</span>` : ""}</div>
          <p>${esc(row.reason)}</p>
          <div class="case-meta"><span>${esc(scope(row))}</span><span>Issued ${esc(date(row.created_at))}</span>${row.expires_at ? `<span>${Number(row.expires_at) > Date.now() ? "Ends" : "Ended"} ${esc(date(row.expires_at))}</span>` : row.action === "ban" || row.action === "blacklist" ? "<span>Permanent</span>" : ""}</div>
        </div>
        <div class="case-side appeal-side">${side}</div>
      </article>`;
    }).join("")}</div>` : `<section class="card">${empty("Clean record", "There are no moderation records attached to your verified Discord account.", "check", "61 220 151")}</section>`}
    ${appeals.length ? `<section class="card">
      <div class="card-head"><div><h2>Your appeals</h2><p>Follow each appeal from submission to decision.</p></div></div>
      <div class="my-appeals">${appeals.map((a) => `<article class="my-appeal st-${esc(a.status)}">
        <header><div><b>${esc(a.ban_id)} · ${esc(titleCase(a.action))}</b><small>Appeal #${a.id} · submitted ${esc(date(a.created_at))}</small></div><span class="pill ${a.status === "approved" ? "pill-good" : a.status === "denied" ? "pill-bad" : a.status === "info_requested" ? "pill-warn" : a.status === "reduced" ? "pill-sun" : "pill-sea"}">${esc(APPEAL_STATUS_TEXT[a.status] || a.status)}</span></header>
        ${a.status === "info_requested" ? `<form class="appeal-reply" data-appeal-reply="${a.id}"><div class="callout warn">${icon("alert")}<div>Staff asked: <b>${esc([...a.events].reverse().find((e) => e.kind === "info_request")?.body || "")}</b></div></div><textarea name="body" minlength="20" maxlength="3000" required placeholder="Answer staff here…"></textarea><button class="btn btn-sun btn-sm" type="submit">Send reply</button></form>` : ""}
        ${a.response && ["approved", "reduced", "denied"].includes(a.status) ? `<div class="kv"><div class="wide"><small>Staff decision</small><b>${esc(a.response)}</b></div></div>` : ""}
        <details><summary>Timeline & your answers</summary>${appealTimeline(a.events, false)}${appealAnswers(a)}</details>
        ${["submitted", "under_review", "info_requested"].includes(a.status) ? `<div class="foot"><button class="btn btn-ghost btn-sm" type="button" data-appeal-withdraw="${a.id}">Withdraw appeal</button></div>` : ""}
      </article>`).join("")}</div>
    </section>` : ""}`;
}

function appealWizard() {
  const banId = state.appealing;
  const row = state.data.punishments.find((p) => p.ban_id === banId);
  const questions = state.data.appealQuestions || [];
  const draft = loadAppealDraft(banId);
  const step = state.appealStep || 1;
  const steps = [["Your account", ["account", "rules"]], ["Reflection", ["responsibility", "reason", "learned"]], ["Evidence & submit", ["additional"]]];
  const field = (id) => {
    const q = questions.find((item) => item.id === id);
    if (!q) return "";
    if (q.type === "choice")
      return `<fieldset class="appeal-q"><legend>${esc(q.label)}</legend><div class="exam-options">${q.options.map(([key, label], i) => `<label><input type="radio" name="${esc(q.id)}" value="${esc(key)}" ${draft[q.id] === key ? "checked" : ""}><span><i>${String.fromCharCode(65 + i)}</i>${esc(label)}</span></label>`).join("")}</div></fieldset>`;
    const length = String(draft[q.id] || "").trim().length;
    return `<label class="appeal-q"><span class="q-label">${esc(q.label)}${q.optional ? " <small>(optional)</small>" : ""}</span>${q.help ? `<small class="q-help">${esc(q.help)}</small>` : ""}<textarea name="${esc(q.id)}" rows="6" maxlength="${Number(q.max)}">${esc(draft[q.id] || "")}</textarea><small class="exam-count${q.min && length < q.min ? "" : " ok"}" data-count="${esc(q.id)}" data-min="${Number(q.min) || 0}">${length} / ${fmt(q.min || 0)} characters minimum</small></label>`;
  };
  const evidence = Array.isArray(draft.evidence) ? draft.evidence : [];
  const body = step === 3
    ? `${field("additional")}
       <div class="appeal-q"><span class="q-label">Evidence links <small>(optional, up to ${fmt(state.data.appealLimits?.maxEvidence || 5)})</small></span><small class="q-help">Clips (YouTube, Medal, Streamable), screenshots or documents that support your appeal.</small>
         ${[0, 1, 2, 3, 4].slice(0, state.data.appealLimits?.maxEvidence || 5).map((i) => `<input class="evidence-input" name="evidence${i}" data-evidence="${i}" placeholder="https://" value="${esc(evidence[i] || "")}">`).join("")}</div>
       <label class="check-row"><input type="checkbox" name="acknowledge" ${draft.acknowledge ? "checked" : ""}><span><b>Everything in this appeal is true</b><small>I have read the Florida Bay rules and understand that false or misleading information means the appeal is denied.</small></span></label>`
    : steps[step - 1][1].map(field).join("");
  $("#portal-content").innerHTML = `
    <div class="exam-sheet-head"><button class="btn btn-ghost btn-sm" type="button" data-appeal-cancel>← Punishments</button><div class="appeal-steps">${steps.map(([label], i) => `<span class="${i + 1 === step ? "on" : i + 1 < step ? "done" : ""}"><i>${i + 1 < step ? icon("check") : i + 1}</i>${esc(label)}</span>`).join("")}</div></div>
    <form id="appeal-form" class="exam-sheet" data-ban="${esc(banId)}">
      <header><span class="kicker">Appeal · step ${step} of 3</span><h2>Appeal ${esc(banId)}</h2>${row ? `<div class="kv"><div><small>Punishment</small><b>${esc(titleCase(row.action))} · ${esc(scope(row))}</b></div><div><small>Issued</small><b>${esc(date(row.created_at))}</b></div><div class="wide"><small>Reason given</small><b>${esc(row.reason)}</b></div></div>` : ""}<p>Take your time - drafts save automatically in this browser. Honest, specific appeals are decided fastest.</p></header>
      ${body}
      <footer class="appeal-nav">${step > 1 ? `<button class="btn btn-ghost" type="button" data-appeal-step="${step - 1}">Back</button>` : "<span></span>"}${step < 3 ? `<button class="btn btn-glass" type="button" data-appeal-step="${step + 1}">Continue</button>` : `<button class="btn btn-sun btn-lg" type="submit">${icon("scale")} Submit appeal</button>`}</footer>
    </form>`;
}

function captureAppealDraft() {
  const form = $("#appeal-form");
  if (!form) return;
  const draft = loadAppealDraft(form.dataset.ban);
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === "radio") { if (el.checked) draft[el.name] = el.value; }
    else if (el.type === "checkbox") draft[el.name] = el.checked;
    else if (el.dataset.evidence !== undefined) { draft.evidence = Array.isArray(draft.evidence) ? draft.evidence : []; draft.evidence[Number(el.dataset.evidence)] = el.value.trim(); }
    else if (el.tagName === "TEXTAREA") draft[el.name] = el.value;
  }
  saveAppealDraft(form.dataset.ban, draft);
  return draft;
}

function appealsQueue() {
  if (!state.data.access.staff) return go("dashboard");
  setTitle("Staff workspace", "Appeal queue");
  const all = state.data.appealQueue || [];
  const me = state.data.user.id;
  const kind = filter("ap-kind", "open");
  const tests = {
    open: (a) => ["submitted", "under_review"].includes(a.status),
    mine: (a) => a.assigned_to === me && ["submitted", "under_review", "info_requested"].includes(a.status),
    waiting: (a) => a.status === "info_requested",
    decided: (a) => ["approved", "reduced", "denied", "withdrawn"].includes(a.status),
  };
  const rows = all.filter(tests[kind]);
  const count = (k) => all.filter(tests[k]).length;
  const people = state.data.people || {};
  const open = Number(state.appealOpen);
  $("#portal-content").innerHTML = `
    <div class="callout good">${icon("info")}<div>Claim an appeal, ask the member follow-up questions, discuss it with internal notes and votes, then decide. <b>Approve</b> lifts the punishment everywhere, <b>Reduce</b> shortens a network ban, <b>Deny</b> starts a ${fmt(state.data.appealLimits?.deniedCooldownDays || 14)}-day cooldown. Whoever issued the punishment cannot decide its appeal.</div></div>
    <div class="toolbar">${seg("ap-kind", [["open", "Needs review", count("open")], ["mine", "Assigned to me", count("mine")], ["waiting", "Waiting on member", count("waiting")], ["decided", "Decided (14d)", count("decided")]], kind)}</div>
    ${rows.length ? `<div class="cases">${rows.map((a) => {
      const expanded = open === Number(a.id);
      const closed = !["submitted", "under_review", "info_requested"].includes(a.status);
      const votes = a.votes || {};
      return `<article class="review-card appeal-review${expanded ? " expanded" : ""}">
        <div class="head">${person(a.author_id)}<div class="chips" style="margin:0">${idChip(a.ban_id)}<span class="pill plain">${esc(titleCase(a.action))}</span><span class="pill ${a.status === "info_requested" ? "pill-warn" : a.status === "approved" ? "pill-good" : a.status === "denied" ? "pill-bad" : "pill-sea"}">${esc(APPEAL_STATUS_TEXT[a.status] || a.status)}</span>${a.assigned_to ? `<span class="pill pill-dusk">${esc(people[a.assigned_to]?.name || "Assigned")}</span>` : `<span class="pill plain">Unclaimed</span>`}</div></div>
        <div class="kv"><div class="wide"><small>Original reason</small><b>${esc(a.case_reason)}</b></div><div><small>Issued by</small><b>${esc(people[a.case_actor]?.name || a.case_actor || "-")} · ${esc(day(a.case_created))}</b></div><div><small>Ends</small><b>${a.case_expires ? esc(date(a.case_expires)) : "Permanent"}</b></div></div>
        <div class="meta"><span>Appeal #${a.id}</span><span>Submitted ${esc(ago(a.created_at))}</span><span>${fmt(a.priorAppeals)} earlier appeal${a.priorAppeals === 1 ? "" : "s"} on this case</span><span>${fmt(a.record?.cases)} cases on record (${fmt(a.record?.bans)} bans)</span>${a.ticket_id ? `<span>Ticket #${a.ticket_id}</span>` : ""}<span class="votes">${icon("check")} ${fmt(votes.approve)} approve · ${fmt(votes.reduce)} reduce · ${fmt(votes.deny)} deny</span></div>
        ${expanded ? `${appealAnswers(a)}<div class="appeal-trail"><div class="eyebrow-s">Timeline</div>${appealTimeline(a.events, true)}</div>` : ""}
        <div class="foot"><button class="btn btn-ghost btn-sm" type="button" data-appeal-open="${a.id}">${expanded ? "Collapse" : "Read appeal"}</button>${closed || a.author_id === me ? "" : `
          ${a.assigned_to !== me ? `<button class="btn btn-ghost btn-sm" type="button" data-appeal-act="claim" data-id="${a.id}">Claim</button>` : ""}
          <button class="btn btn-ghost btn-sm" type="button" data-appeal-dialog="info" data-id="${a.id}">Ask member</button>
          <button class="btn btn-ghost btn-sm" type="button" data-appeal-dialog="note" data-id="${a.id}">Note</button>
          <button class="btn btn-ghost btn-sm" type="button" data-appeal-dialog="vote" data-id="${a.id}">Vote</button>
          <button class="btn btn-glass btn-sm" type="button" data-appeal-dialog="decide" data-id="${a.id}">Decide</button>`}</div>
      </article>`;
    }).join("")}</div>` : `<section class="card">${empty(kind === "decided" ? "Nothing decided recently" : "Queue clear", kind === "decided" ? "Decisions from the last 14 days appear here." : "No appeals match this filter.", "check", "61 220 151")}</section>`}`;
}

function appealStaffDialog(kind, id) {
  const a = (state.data.appealQueue || []).find((item) => Number(item.id) === Number(id));
  if (!a) return;
  const base = { kicker: `${a.ban_id} · Appeal #${a.id}`, data: { appealId: a.id, kind, banId: a.ban_id } };
  if (kind === "info") return openDialog({ ...base, title: "Ask the member", submit: "Send question", action: "appeal-staff", body: `<div class="callout">${icon("info")}<div>The member gets a DM and answers on the portal. The appeal waits on them until they reply.</div></div><label class="field">What do you need from them?<textarea name="message" minlength="15" maxlength="2000" required placeholder="e.g. Please send the full clip from your point of view, including the 30 seconds before the shooting."></textarea></label>` });
  if (kind === "note") return openDialog({ ...base, title: "Internal note", submit: "Add note", action: "appeal-staff", body: `<label class="field">Visible to staff only<textarea name="body" minlength="3" maxlength="2000" required></textarea></label>` });
  if (kind === "vote") return openDialog({ ...base, title: "Cast your vote", submit: "Vote", action: "appeal-staff", body: `<div class="field">Your recommendation<div class="choice"><label class="approve"><input type="radio" name="vote" value="approve"><span>Approve<small>Lift it</small></span></label><label><input type="radio" name="vote" value="reduce"><span>Reduce<small>Shorten it</small></span></label><label class="deny"><input type="radio" name="vote" value="deny"><span>Deny<small>Keep it</small></span></label></div></div><label class="field">Reasoning (staff only)<textarea name="body" maxlength="1000"></textarea></label>` });
  const votes = a.votes || {};
  openDialog({
    ...base, title: "Decide this appeal", submit: "Save decision", action: "appeal-staff",
    body: `<div class="kv"><div><small>Staff votes</small><b>${fmt(votes.approve)} approve · ${fmt(votes.reduce)} reduce · ${fmt(votes.deny)} deny</b></div><div><small>Current end</small><b>${a.case_expires ? esc(date(a.case_expires)) : "Permanent"}</b></div></div>
      <div class="field">Decision<div class="choice">
        <label class="approve"><input type="radio" name="decision" value="approved"><span>Approve<small>Lifts it everywhere</small></span></label>
        <label${a.canReduce ? "" : ' class="disabled" title="Only network bans can be reduced"'}><input type="radio" name="decision" value="reduced" ${a.canReduce ? "" : "disabled"}><span>Reduce<small>${a.canReduce ? "New end date" : "Network bans only"}</small></span></label>
        <label class="deny"><input type="radio" name="decision" value="denied"><span>Deny<small>${fmt(state.data.appealLimits?.deniedCooldownDays || 14)}-day cooldown</small></span></label>
      </div></div>
      <label class="field" id="reduce-days" hidden>Ban ends in (days from now)<input name="days" type="number" min="1" max="${fmt(state.data.appealLimits?.maxReduceDays || 365)}" value="7"></label>
      <div class="callout warn" id="approve-warning" hidden>${icon("alert")}<div>Approving <b>immediately lifts ${esc(a.ban_id)}</b> wherever it applies, DMs the member and closes the appeal ticket.</div></div>
      <label class="field">Response to the member<textarea name="response" maxlength="4000" placeholder="Required for reduce and deny. The member sees this on the portal and in their DM."></textarea></label>`,
  });
}

/* ---------- staff exams ---------- */
const examDraftKey = (key) => `fbrp-exam-draft:${state.data.user.id}:${key}`;
function loadDraft(key) {
  try { return JSON.parse(localStorage.getItem(examDraftKey(key)) || "{}") || {}; } catch { return {}; }
}
function saveDraft(key, answers) {
  try { localStorage.setItem(examDraftKey(key), JSON.stringify(answers)); } catch {}
}
function clearDraft(key) {
  try { localStorage.removeItem(examDraftKey(key)); } catch {}
}

const countdown = (until) => {
  const left = Math.max(0, Math.floor((Number(until) - Date.now()) / 1000));
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
};
// Live exam access timers; an expired exam form locks its submit button.
setInterval(() => {
  for (const node of $$("[data-expires]")) {
    const until = Number(node.dataset.expires);
    const b = node.querySelector("b");
    if (b) b.textContent = countdown(until);
    node.classList.toggle("low", until - Date.now() < 10 * 60000);
    if (until <= Date.now() && !node.dataset.done) {
      node.dataset.done = "1";
      node.classList.add("expired");
      const submit = $("#exam-form button[type=submit]");
      if (submit && node.closest(".exam-sheet-head")) { submit.disabled = true; submit.textContent = "Access expired"; toast("Your exam access expired. Ask Head of Management to give you the exam again.", true); }
    }
  }
}, 1000);

function examsView() {
  const ex = state.data.exams;
  if (!ex || (!(ex.exams || []).length && !(ex.applications || []).length)) return go("dashboard");
  setTitle("Career", "Staff exams");
  if (state.examTaking) return examForm();
  const cards = (ex.exams || []).map((e) => {
    const status = e.eligible
      ? `<button class="btn btn-sun" type="button" data-exam-start="${esc(e.exam_key)}">${icon("exam")} Start exam</button><span class="exam-timer" data-expires="${Number(e.expiresAt)}">${icon("clock")}<b>${countdown(e.expiresAt)}</b> left to submit</span>`
      : e.pending ? `<span class="pill pill-warn">Awaiting review</span>`
      : e.needsGrant ? `<span class="pill pill-dusk">Locked · needs /exam give</span>`
      : e.passed ? `<span class="pill pill-good">Passed</span>`
      : e.cooldownUntil ? `<span class="pill plain" title="${esc(date(e.cooldownUntil))}">Retake ${esc(day(e.cooldownUntil))}</span>`
      : `<span class="pill plain">${esc(e.reason || "Closed")}</span>`;
    return `<article class="exam-card${e.eligible ? " open" : ""}">
      <div class="exam-glow"></div>
      <div class="exam-top"><span class="exam-badge">${icon("exam")}</span><div><small>Promotion to</small><h3>${esc(e.target_rank)}</h3></div></div>
      <h2>${esc(e.title)}</h2>
      <p>${esc(e.description)}</p>
      <div class="exam-facts"><span><b>${fmt(e.questionCount)}</b> questions</span><span><b>${fmt(e.pass_mark)}%</b> pass mark</span><span><b>${fmt(e.cooldown_days)}d</b> retake cooldown</span></div>
      <div class="exam-foot">${status}${!e.eligible && e.reason && !e.pending && !e.passed ? `<small>${esc(e.reason)}</small>` : ""}</div>
    </article>`;
  }).join("");
  const apps = ex.applications || [];
  $("#portal-content").innerHTML = `
    <section class="exam-hero">
      <div><span class="kicker">Staff development</span><h2>Earn your next rank.</h2><p>Exams are only visible to the rank they are written for, and Head of Management or above has to open yours with <b>/exam give</b>. You then have 60 minutes to submit. Your answers go privately to Head of Management and above, and the result is posted to the staff Discord together with your new role.</p></div>
      <div class="exam-rank"><small>Your current rank</small><b>${esc(ex.rank?.label || "Staff")}</b></div>
    </section>
    <div class="exam-grid">${cards || `<section class="card">${empty("No exams for your rank", "There is no promotion exam open to your current rank right now.", "exam")}</section>`}</div>
    <section class="card">
      <div class="card-head"><div><h2>Your applications</h2><p>Status, scores and feedback from management.</p></div></div>
      ${apps.length ? `<div class="feed">${apps.map((a) => `<div class="feed-row"><div class="feed-ico">${icon("exam")}</div><div class="txt"><b>${esc(a.title)} · #${a.id}</b><small>${a.review_notes ? `Feedback: ${esc(a.review_notes)}` : a.auto_score !== null ? `Multiple choice ${fmt(a.auto_score)}%` : "Written answers only"}${a.score !== null && a.score !== undefined && !["submitted", "under_review"].includes(a.status) ? ` · Final ${fmt(a.score)}%` : ""}</small></div><div class="row-end">${pill(a.status)}<time>${esc(ago(a.created_at))}</time>${["submitted", "under_review"].includes(a.status) ? `<button class="btn btn-ghost btn-sm" type="button" data-exam-withdraw="${a.id}">Withdraw</button>` : ""}</div></div>`).join("")}</div>` : empty("No applications yet", "When you submit an exam it will appear here.", "inbox")}
    </section>`;
}

function examForm() {
  const exam = (state.data.exams?.exams || []).find((e) => e.exam_key === state.examTaking && e.eligible);
  if (!exam) { state.examTaking = null; return examsView(); }
  const draft = loadDraft(exam.exam_key);
  const total = exam.questions.length;
  const answered = exam.questions.filter((q) => q.type === "choice" ? draft[q.id] !== undefined && draft[q.id] !== null : String(draft[q.id] || "").trim().length >= (q.min || 0)).length;
  $("#portal-content").innerHTML = `
    <div class="exam-sheet-head">
      <button class="btn btn-ghost btn-sm" type="button" data-exam-cancel>← All exams</button>
      <span class="exam-timer" data-expires="${Number(exam.expiresAt)}">${icon("clock")}<b>${countdown(exam.expiresAt)}</b> left</span>
      <div class="exam-progress"><span>${answered} of ${total} complete</span><i><b style="width:${((answered / Math.max(1, total)) * 100).toFixed(1)}%"></b></i></div>
    </div>
    <form id="exam-form" class="exam-sheet" data-exam="${esc(exam.exam_key)}">
      <header><span class="kicker">${esc(exam.target_rank)} promotion</span><h2>${esc(exam.title)}</h2><p>${esc(exam.description)} Drafts save automatically in this browser.</p></header>
      ${exam.questions.map((q, index) => `<fieldset class="exam-q" data-q="${esc(q.id)}">
        <legend><span>${String(index + 1).padStart(2, "0")}</span>${esc(q.prompt)}</legend>
        ${q.type === "choice"
          ? `<div class="exam-options">${(q.options || []).map((option, i) => `<label><input type="radio" name="${esc(q.id)}" value="${i}" ${Number(draft[q.id]) === i && draft[q.id] !== undefined && draft[q.id] !== null && draft[q.id] !== "" ? "checked" : ""}><span><i>${String.fromCharCode(65 + i)}</i>${esc(option)}</span></label>`).join("")}</div>`
          : `<textarea name="${esc(q.id)}" rows="6" maxlength="${Number(q.max) || 3000}" placeholder="Write a thorough answer…">${esc(draft[q.id] || "")}</textarea><small class="exam-count" data-count="${esc(q.id)}">${String(draft[q.id] || "").trim().length} / ${fmt(q.min || 0)} characters minimum</small>`}
      </fieldset>`).join("")}
      <footer><div class="callout">${icon("info")}<div>Submit before your 60-minute access runs out. Once submitted your answers are locked. Head of Management and above will review them and you will be notified in Discord.</div></div><button class="btn btn-sun btn-lg" type="submit">${icon("check")} Submit exam</button></footer>
    </form>`;
}

function examReviews() {
  const ex = state.data.exams;
  if (!ex?.reviewer) return go("dashboard");
  setTitle("Staff workspace", "Exam reviews");
  const all = ex.reviewQueue || [];
  const kind = filter("exr-kind", "pending");
  const tests = { pending: (r) => ["submitted", "under_review"].includes(r.status), passed: (r) => r.status === "passed", failed: (r) => r.status === "failed", all: () => true };
  const rows = all.filter(tests[kind]);
  const count = (k) => all.filter(tests[k]).length;
  const open = state.examOpen;
  $("#portal-content").innerHTML = `
    <div class="callout good">${icon("info")}<div>Only <b>Head of Management and above</b> can see this queue. Passing an application grants its role in the staff Discord automatically and posts the result to the staff log.</div></div>
    <div class="toolbar">${seg("exr-kind", [["pending", "Waiting", count("pending")], ["passed", "Passed", count("passed")], ["failed", "Failed", count("failed")], ["all", "All", count("all")]], kind)}</div>
    ${rows.length ? `<div class="cases">${rows.map((a) => {
      const expanded = Number(open) === Number(a.id);
      const choices = a.answers.filter((q) => q.type === "choice");
      return `<article class="review-card${expanded ? " expanded" : ""}">
        <div class="head">${person(a.discord_id, a.display_name)}<div class="chips" style="margin:0"><span class="pill plain">${esc(a.title)}</span>${pill(a.status)}${a.auto_score !== null ? `<span class="pill ${Number(a.auto_score) >= Number(a.pass_mark) ? "pill-good" : "pill-warn"}">MC ${fmt(a.auto_score)}%</span>` : ""}</div></div>
        <div class="meta"><span>Application #${a.id}</span><span>${esc(a.rank_at_submit || "Staff")}</span><span>Submitted ${esc(ago(a.created_at))}</span>${a.reviewer_id ? `<span>Reviewed by ${esc(state.data.people?.[a.reviewer_id]?.name || a.reviewer_id)}</span>` : ""}${a.score !== null && a.score !== undefined && !["submitted", "under_review"].includes(a.status) ? `<span>Final ${fmt(a.score)}%</span>` : ""}</div>
        ${expanded ? `<div class="review-answers">${a.answers.map((q, index) => `<div class="review-q ${q.type === "choice" ? (q.correct ? "right" : "wrong") : "text"}">
            <small>${String(index + 1).padStart(2, "0")} · ${q.type === "choice" ? (q.correct ? "Correct" : "Incorrect") : "Written"}</small>
            <b>${esc(q.prompt)}</b>
            ${q.type === "choice" ? `<p><span class="mark">${q.correct ? icon("check") : icon("alert")}</span>${esc(q.givenText || "No answer")}</p>${q.correct ? "" : `<p class="expected">Expected: ${esc(q.options?.[q.answer] || "")}</p>`}` : `<div class="quote">${esc(q.given || "(blank)")}</div>`}
          </div>`).join("")}</div>
          ${a.review_notes ? `<div class="kv"><div class="wide"><small>Reviewer notes</small><b>${esc(a.review_notes)}</b></div></div>` : ""}` : ""}
        <div class="foot"><button class="btn btn-ghost btn-sm" type="button" data-exam-open="${a.id}">${expanded ? "Hide answers" : `Read answers (${choices.length} MC · ${a.answers.length - choices.length} written)`}</button>${["submitted", "under_review"].includes(a.status) && a.discord_id !== state.data.user.id ? `<button class="btn btn-glass btn-sm" type="button" data-exam-review="${a.id}">Decide</button>` : ""}</div>
      </article>`;
    }).join("")}</div>` : `<section class="card">${empty(kind === "pending" ? "Queue clear" : "Nothing here", kind === "pending" ? "No exam applications are waiting." : "No applications match this filter.", "check", "61 220 151")}</section>`}`;
}

function examReviewDialog(id) {
  const a = (state.data.exams?.reviewQueue || []).find((row) => Number(row.id) === Number(id));
  if (!a) return;
  openDialog({
    kicker: "Exam decision",
    title: `${a.title} · #${a.id}`,
    submit: "Save decision",
    action: "exam-review",
    data: { applicationId: a.id },
    body: `<div class="kv"><div><small>Applicant</small><b>${esc(state.data.people?.[a.discord_id]?.name || a.display_name || a.discord_id)}</b></div><div><small>Multiple choice</small><b>${a.auto_score === null ? "-" : `${fmt(a.auto_score)}%`}</b></div><div><small>Pass mark</small><b>${fmt(a.pass_mark)}%</b></div><div><small>Rank when submitted</small><b>${esc(a.rank_at_submit || "-")}</b></div></div>
      <div class="field">Decision
        <div class="choice">
          <label><input type="radio" name="decision" value="under_review" ${a.status === "submitted" ? "checked" : ""}><span>In review<small>Mark it as being read</small></span></label>
          <label class="approve"><input type="radio" name="decision" value="passed"><span>Pass<small>Grants the passed role</small></span></label>
          <label class="deny"><input type="radio" name="decision" value="failed"><span>Fail<small>Starts the retake cooldown</small></span></label>
        </div>
      </div>
      <label class="field">Final score (%)<input name="score" type="number" min="0" max="100" value="${a.auto_score ?? ""}" placeholder="0-100"></label>
      <label class="field">Notes to the applicant<textarea name="notes" maxlength="2000" placeholder="Strengths, gaps, and what to work on. Required when failing."></textarea></label>`,
  });
}

/* ---------- organizations ---------- */
const BUSINESS_LABEL = { mechanic: "Mechanic", bar: "Bar", club: "Nightclub", restaurant: "Restaurant", warehouse: "Warehouse", lab: "Drug lab" };
const KIND_ICON = { property: "building", vehicle: "car", weapon: "target", outfit: "shirt", perk: "bolt" };
const TX_TONE = { drug_sale: "143 124 255", business: "53 226 205", purchase: "255 122 69", adjust: "255 194 77", refund: "61 220 151", service: "85 196 255" };
const money = (value) => `$${fmt(Math.round(Number(value || 0)))}`;

function organizationsView() {
  const eco = state.data.economy;
  const orgs = eco?.organizations || [];
  if (!orgs.length) return go("dashboard");
  setTitle("Community", "Organizations");
  const selected = orgs.find((o) => String(o.id) === String(filter("org-id", orgs[0].id))) || orgs[0];
  const kind = filter("shop-kind", "property");
  const shopRows = (eco.shop || []).filter((row) => row.kind === kind && row.org_types.includes(selected.type));
  const owned = new Set(selected.purchases.map((row) => row.item_key));
  const week = selected.earningsWeek.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const drugs = selected.drugWeek || [];
  const delivered = drugs.filter((r) => r.status === "delivered");
  const seized = drugs.filter((r) => r.status !== "delivered").reduce((sum, row) => sum + Number(row.units || 0), 0);
  const byKind = (k) => Number(selected.earningsWeek.find((row) => row.kind === k)?.total || 0);
  const ledger = selected.transactions;
  const shopCard = (row) => {
    const mine = owned.has(row.item_key);
    const taken = row.kind === "property" && eco.owners?.[row.item_key] && !mine;
    const short = Number(selected.wallet.balance) < Number(row.price);
    const data = row.data || {};
    const facts = row.kind === "property" ? [BUSINESS_LABEL[data.business] || titleCase(data.business), data.area, data.drug ? `${titleCase(data.drug)} lab` : null]
      : row.kind === "vehicle" ? [data.model] : row.kind === "weapon" ? (data.weapons || []).map((w) => titleCase(String(w.name).replace(/^WEAPON_/, "").toLowerCase()))
      : row.kind === "perk" ? [`+${data.value}${["capacity"].includes(data.perk) ? " units" : "%"}`] : [];
    const button = mine ? (row.kind === "property" && selected.leader ? `<button class="btn btn-ghost btn-sm" type="button" data-org-sell="${esc(row.item_key)}">Sell (50%)</button>` : `<span class="pill pill-good">Owned</span>`)
      : taken ? `<span class="pill plain" title="Owned by ${esc(eco.owners[row.item_key])}">Owned by ${esc(eco.owners[row.item_key])}</span>`
      : selected.leader ? `<button class="btn ${short ? "btn-ghost" : "btn-sun"} btn-sm" type="button" data-org-buy="${esc(row.item_key)}" ${short ? "disabled title=\"Not enough money\"" : ""}>Buy · ${money(row.price)}</button>`
      : `<span class="pill plain">${money(row.price)}</span>`;
    return `<article class="shop-card${mine ? " owned" : ""}${taken ? " taken" : ""}">
      <div class="shop-ico" style="--tone:${row.kind === "property" ? "255 122 69" : row.kind === "vehicle" ? "85 196 255" : row.kind === "weapon" ? "255 95 109" : row.kind === "outfit" ? "143 124 255" : "255 194 77"}">${icon(KIND_ICON[row.kind] || "sparkle")}</div>
      <div class="shop-main"><b>${esc(row.label)}</b><p>${esc(row.description)}</p><div class="chips">${facts.filter(Boolean).map((f) => `<span class="pill plain">${esc(f)}</span>`).join("")}</div></div>
      <div class="shop-buy"><strong>${money(row.price)}</strong>${button}</div>
    </article>`;
  };
  $("#portal-content").innerHTML = `
    ${orgs.length > 1 ? `<div class="toolbar">${seg("org-id", orgs.map((o) => [String(o.id), o.name]), String(selected.id))}</div>` : ""}
    <section class="org-hero" style="--org:${esc(selected.color || "#35e2cd")}">
      <div class="org-hero-bg"></div>
      <div class="org-id"><span class="org-mark">${esc(initials(selected.name))}</span><div><small>${esc(titleCase(selected.type))}${selected.leader ? " · Leader access" : " · Member"}</small><h2>${esc(selected.name)}</h2></div></div>
      <div class="org-balance"><small>Organization wallet</small><strong>${money(selected.wallet.balance)}</strong><span>${icon("trend")} ${money(week)} earned this week</span></div>
      ${selected.manage ? `<div class="org-manage"><button class="btn btn-glass btn-sm" type="button" data-org-adjust="${selected.id}">${icon("wallet")} Adjust</button><button class="btn btn-glass btn-sm" type="button" data-org-leader="${selected.id}">${icon("users")} Leaders</button></div>` : ""}
    </section>
    <div class="stats">
      <div class="stat-tile tone-dusk"><div class="ico">${icon("leaf")}</div><span>Product sales · 7d</span><strong>${money(byKind("drug_sale"))}</strong><small>${fmt(delivered.reduce((n, r) => n + Number(r.units || 0), 0))} units delivered · ${fmt(seized)} seized</small></div>
      <div class="stat-tile tone-sea"><div class="ico">${icon("building")}</div><span>Business income · 7d</span><strong>${money(byKind("business") + byKind("service"))}</strong><small>${fmt(selected.properties.length)} propert${selected.properties.length === 1 ? "y" : "ies"} owned</small></div>
      <div class="stat-tile tone-good"><div class="ico">${icon("trend")}</div><span>Lifetime earned</span><strong>${money(selected.wallet.lifetime_earned)}</strong><small>All sources</small></div>
      <div class="stat-tile tone-sun"><div class="ico">${icon("wallet")}</div><span>Lifetime spent</span><strong>${money(selected.wallet.lifetime_spent)}</strong><small>${fmt(selected.purchases.length)} items owned</small></div>
    </div>
    <div class="grid-2">
      <section class="card">
        <div class="card-head"><div><h2>Properties</h2><p>Run them in game: on duty, go to the terminal and press <kbd>E</kbd>, or open <kbd>F2</kbd>.</p></div></div>
        ${selected.properties.length ? `<div class="prop-list">${selected.properties.map((p) => `<div class="prop-row"><span class="feed-ico">${icon(p.data?.business === "lab" ? "leaf" : "building")}</span><div><b>${esc(p.label || p.item_key)}</b><small>${esc(BUSINESS_LABEL[p.data?.business] || "Property")}${p.data?.area ? ` · ${esc(p.data.area)}` : ""} · since ${esc(day(p.purchased_at))}</small></div></div>`).join("")}</div>` : empty("No property yet", "Buy an MLO below to start a legitimate business or a private lab.", "building")}
        ${selected.purchases.filter((p) => p.kind !== "property").length ? `<div class="asset-chips">${selected.purchases.filter((p) => p.kind !== "property").map((p) => `<span class="pill plain">${icon(KIND_ICON[p.kind] || "sparkle")}${esc(p.label)}</span>`).join("")}</div>` : ""}
      </section>
      <section class="card">
        <div class="card-head"><div><h2>Ledger</h2><p>Every dollar in and out.</p></div></div>
        ${ledger.length ? `<div class="feed ledger">${ledger.slice(0, 14).map((t) => `<div class="feed-row"><div class="feed-ico" style="color:rgb(${TX_TONE[t.kind] || "166 179 195"});background:rgba(${(TX_TONE[t.kind] || "166 179 195").replaceAll(" ", ",")},.1)">${icon(Number(t.amount) >= 0 ? "trend" : "wallet")}</div><div class="txt"><b>${esc(t.description)}</b><small>${esc(titleCase(t.kind))}${t.actor_id && /^\d{15,24}$/.test(String(t.actor_id)) ? ` · ${esc(state.data.people?.[t.actor_id]?.name || "member")}` : ""}</small></div><div class="row-end"><span class="amount ${Number(t.amount) >= 0 ? "up" : "down"}">${Number(t.amount) >= 0 ? "+" : "−"}${money(Math.abs(Number(t.amount)))}</span><time>${esc(ago(t.created_at))}</time></div></div>`).join("")}</div>` : empty("No transactions", "Deliver product or work your business in game to earn money.", "wallet")}
      </section>
    </div>
    <section class="card">
      <div class="card-head"><div><h2>Organization shop</h2><p>${selected.leader ? "Purchases apply in game instantly." : "Only leaders can buy. Ask yours to pick something up."}</p></div>${seg("shop-kind", Object.entries(eco.kinds || {}).map(([k, label]) => [k, label, (eco.shop || []).filter((row) => row.kind === k && row.org_types.includes(selected.type)).length]), kind)}</div>
      <div class="shop-grid">${shopRows.map(shopCard).join("") || empty("Nothing in this aisle", "No items of this kind are available to this organization type.", "sparkle")}</div>
    </section>
    <section class="card how-card">
      <div class="card-head"><div><h2>How the money works</h2><p>Organization money lives only on the website and Discord - never in your pockets in game.</p></div></div>
      <div class="how-grid">
        <div><span class="feed-ico">${icon("leaf")}</span><b>Produce</b><small>Gangs on <kbd>/duty</kbd> cook or harvest at a lab (public or owned).</small></div>
        <div><span class="feed-ico">${icon("pin")}</span><b>Deliver</b><small>Start a run from <kbd>F2</kbd>, drive the product to the drop-off and hand it over. Police may get a tip.</small></div>
        <div><span class="feed-ico">${icon("building")}</span><b>Run a business</b><small>Work shifts at your property terminal, <kbd>/repair</kbd> or <kbd>/serve</kbd> customers.</small></div>
        <div><span class="feed-ico">${icon("wallet")}</span><b>Spend</b><small>Leaders buy MLOs, cars, armory permits, outfits and perks here. Check <kbd>/orgbank</kbd> in Discord.</small></div>
      </div>
    </section>`;
}

function orgAdjustDialog(id) {
  const org = (state.data.economy?.organizations || []).find((o) => Number(o.id) === Number(id));
  if (!org) return;
  openDialog({ kicker: "Wallet management", title: `Adjust ${org.name}`, submit: "Apply adjustment", action: "org-adjust", data: { orgId: org.id },
    body: `<div class="kv"><div><small>Current balance</small><b>${money(org.wallet.balance)}</b></div></div><label class="field">Amount (negative removes money)<input name="amount" type="number" step="1" required placeholder="5000"></label><label class="field">Reason<input name="reason" maxlength="160" minlength="3" required placeholder="Event prize, refund, correction…"></label>` });
}

function orgLeaderDialog(id) {
  const org = (state.data.economy?.organizations || []).find((o) => Number(o.id) === Number(id));
  if (!org) return;
  openDialog({ kicker: "Organization leaders", title: `${org.name} leaders`, submit: "Save", action: "org-leader", data: { orgId: org.id },
    body: `${org.leaders.length ? `<div class="feed">${org.leaders.map((l) => `<div class="feed-row">${person(l)}<div class="row-end"><span class="pill pill-sun">Leader</span></div></div>`).join("")}</div>` : `<div class="callout">${icon("info")}<div>No leaders yet - nobody can spend this wallet.</div></div>`}
      <label class="field">Discord user ID<input name="discordId" inputmode="numeric" pattern="[0-9]{15,24}" required placeholder="123456789012345678"></label>
      <div class="field">Access<div class="choice"><label class="approve"><input type="radio" name="leader" value="1" checked><span>Make leader<small>Can buy from the shop</small></span></label><label class="deny"><input type="radio" name="leader" value="0"><span>Remove<small>Back to member</small></span></label></div></div>` });
}

const inlineMarkdown = (value) => {
  let html = esc(value);
  html = html.replace(/&lt;br&gt;/gi, "<br>").replace(/&lt;small&gt;/gi, "<small>").replace(/&lt;\/small&gt;/gi, "</small>");
  html = html.replace(/\[([^\]]+)]\((#[^)]+)\)/g, '<a href="$2">$1</a>');
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|\s)\*([^*]+)\*(?=\s|[.,;:]|$)/g, "$1<em>$2</em>");
  return html;
};

function markdownCells(line) {
  const cells = [];
  let cell = "";
  for (let index = 1; index < line.length - 1; index++) {
    const char = line[index];
    if (char === "|" && line[index - 1] !== "\\") {
      cells.push(cell.trim().replaceAll("\\|", "|"));
      cell = "";
    } else cell += char;
  }
  cells.push(cell.trim().replaceAll("\\|", "|"));
  return cells;
}

function markdownBlock(source) {
  const lines = String(source || "").trim().split("\n");
  const html = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim();
    if (!line) { index++; continue; }
    if (/^\|.+\|$/.test(line) && /^\|[-: |]+\|$/.test((lines[index + 1] || "").trim())) {
      const header = markdownCells(line);
      const rows = [];
      index += 2;
      while (index < lines.length && /^\|.+\|$/.test(lines[index].trim())) rows.push(markdownCells(lines[index++].trim()));
      html.push(`<div class="command-table-wrap"><table class="command-table"><thead><tr>${header.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    if (line.startsWith("- ")) {
      const items = [];
      while (index < lines.length && lines[index].trim().startsWith("- ")) items.push(`<li>${inlineMarkdown(lines[index++].trim().slice(2))}</li>`);
      html.push(`<ul>${items.join("")}</ul>`);
      continue;
    }
    if (line.startsWith("### ")) html.push(`<h3>${inlineMarkdown(line.slice(4))}</h3>`);
    else if (line.startsWith("## ")) html.push(`<h2>${inlineMarkdown(line.slice(3))}</h2>`);
    else if (line.startsWith("# ")) html.push(`<h1>${inlineMarkdown(line.slice(2))}</h1>`);
    else if (line === "Important behavior:") html.push("<h3>Important behavior</h3>");
    else html.push(`<p>${inlineMarkdown(line)}</p>`);
    index++;
  }
  return html.join("");
}

function commandReferenceView() {
  if (!state.data.access.commandReference) return go("dashboard");
  setTitle("Management library", "Bot commands");
  const reference = state.commandReference;
  if (!reference || reference.loading) {
    $("#portal-content").innerHTML = `<div class="loading"><div class="spinner"></div>Loading command reference</div>`;
    if (!reference) {
      state.commandReference = { loading: true };
      api("portal/command-reference")
        .then((result) => { state.commandReference = result; if (state.view === "commands") render(); })
        .catch((error) => { state.commandReference = { error: error.message }; if (state.view === "commands") render(); });
    }
    return;
  }
  if (reference.error) {
    $("#portal-content").innerHTML = `<section class="card"><div class="card-body">${empty("Reference unavailable", reference.error, "alert", "255 95 109")}</div></section>`;
    return;
  }
  const markdown = String(reference.markdown || "");
  const guide = markdown.match(/## How permissions work\n([\s\S]*?)(?=\n## Command index)/)?.[1] || "";
  const sections = [...markdown.matchAll(/(?:^|\n)## (\/[^\n]+|Message command)\n([\s\S]*?)(?=\n## |$)/g)]
    .map((match) => ({ title: match[1], source: `## ${match[1]}\n${match[2]}` }));
  const query = filter("command-q").trim().toLowerCase();
  const shown = sections.filter((section) => !query || `${section.title} ${section.source}`.toLowerCase().includes(query));
  $("#portal-content").innerHTML = `
    <section class="command-doc-hero">
      <div><span class="kicker">Community Manager+</span><h2>Every bot command, in one place.</h2><p>Live from the repository reference. Search by command, action, argument, or ACE permission.</p></div>
      <div class="command-doc-meta"><strong>${fmt(sections.length - 1)}</strong><span>slash commands</span><small>Updated ${esc(date(reference.updatedAt))}</small></div>
    </section>
    <div class="toolbar command-doc-tools">${searchBox("command-q", "Search commands or permissions…")}<span class="pill pill-sea">${fmt(shown.length)} sections</span></div>
    ${!query ? `<section class="card command-doc-guide"><div class="card-head"><div><h2>How access works</h2><p>ACE inheritance, owner locks, and Discord-side requirements.</p></div></div><div class="card-body">${markdownBlock(guide)}</div></section>` : ""}
    <div class="command-doc-list">${shown.length ? shown.map((section) => `<section class="card command-doc-section" id="command-${esc(section.title.replace(/^\//, "").replace(/\s+/g, "-"))}">${markdownBlock(section.source)}</section>`).join("") : `<section class="card"><div class="card-body">${empty("No commands found", "Try a command name, action, or ACE permission.", "search")}</div></section>`}</div>`;
}

const renders = { dashboard, punishments, support, roster, profile: profileView, banlog: banLog, appeals: appealsQueue, ticketops: ticketOps, liveops: liveOps, settings, exams: examsView, examreviews: examReviews, organizations: organizationsView, commands: commandReferenceView };
function render() {
  nav();
  (renders[state.view] || dashboard)();
}
function go(view) {
  state.view = view;
  state.profile = null;
  state.examTaking = null;
  state.appealing = null;
  state.appealStep = 1;
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
  if (appeal) { state.appealing = appeal.dataset.appeal; state.appealStep = 1; render(); window.scrollTo({ top: 0 }); return; }
  if (target.closest("[data-appeal-cancel]")) { captureAppealDraft(); state.appealing = null; render(); return; }
  const appealStep = target.closest("[data-appeal-step]");
  if (appealStep) {
    captureAppealDraft();
    const next = Number(appealStep.dataset.appealStep);
    if (next > (state.appealStep || 1)) {
      const draft = loadAppealDraft(state.appealing);
      const needed = (state.data.appealQuestions || []).filter((q) => (next === 2 ? ["account", "rules"] : ["responsibility", "reason", "learned"]).includes(q.id));
      const missing = needed.find((q) => q.type === "choice" ? !draft[q.id] : String(draft[q.id] || "").trim().length < (q.min || 0));
      if (missing) return toast(missing.type === "choice" ? `Answer: ${missing.label}` : `"${missing.label}" needs at least ${missing.min} characters.`, true);
    }
    state.appealStep = next; render(); window.scrollTo({ top: 0 }); return;
  }
  const appealOpen = target.closest("[data-appeal-open]");
  if (appealOpen) { state.appealOpen = Number(state.appealOpen) === Number(appealOpen.dataset.appealOpen) ? null : Number(appealOpen.dataset.appealOpen); render(); return; }
  const appealDialogBtn = target.closest("[data-appeal-dialog]");
  if (appealDialogBtn) return appealStaffDialog(appealDialogBtn.dataset.appealDialog, appealDialogBtn.dataset.id);
  const appealAct = target.closest("[data-appeal-act]");
  if (appealAct) {
    appealAct.disabled = true;
    try { const result = await api("portal/appeal/review", { method: "POST", body: JSON.stringify({ appealId: Number(appealAct.dataset.id), action: appealAct.dataset.appealAct }) }); state.data = result.data; render(); toast("Appeal claimed."); }
    catch (error) { toast(error.message, true); appealAct.disabled = false; }
    return;
  }
  const appealWithdraw = target.closest("[data-appeal-withdraw]");
  if (appealWithdraw) {
    if (!confirm("Withdraw this appeal? Withdrawn appeals do not count towards your limit.")) return;
    try { const result = await api("portal/appeal/withdraw", { method: "POST", body: JSON.stringify({ appealId: Number(appealWithdraw.dataset.appealWithdraw) }) }); state.data = result.data; render(); toast("Appeal withdrawn."); }
    catch (error) { toast(error.message, true); }
    return;
  }
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
  const examStart = target.closest("[data-exam-start]");
  if (examStart) { state.examTaking = examStart.dataset.examStart; render(); window.scrollTo({ top: 0 }); return; }
  if (target.closest("[data-exam-cancel]")) { state.examTaking = null; render(); return; }
  const examOpen = target.closest("[data-exam-open]");
  if (examOpen) { state.examOpen = Number(state.examOpen) === Number(examOpen.dataset.examOpen) ? null : Number(examOpen.dataset.examOpen); render(); return; }
  const examReview = target.closest("[data-exam-review]");
  if (examReview) return examReviewDialog(Number(examReview.dataset.examReview));
  const examWithdraw = target.closest("[data-exam-withdraw]");
  if (examWithdraw) {
    if (!confirm("Withdraw this application? You can submit a new one afterwards.")) return;
    try {
      const result = await api("portal/exam/withdraw", { method: "POST", body: JSON.stringify({ applicationId: Number(examWithdraw.dataset.examWithdraw) }) });
      state.data = result.data; render(); toast("Application withdrawn.");
    } catch (error) { toast(error.message, true); }
    return;
  }
  const orgBuy = target.closest("[data-org-buy]");
  if (orgBuy) {
    const eco = state.data.economy;
    const row = (eco.shop || []).find((item) => item.item_key === orgBuy.dataset.orgBuy);
    const orgs = eco.organizations || [];
    const org = orgs.find((o) => String(o.id) === String(filter("org-id", orgs[0]?.id))) || orgs[0];
    if (!row || !org) return;
    openDialog({ kicker: org.name, title: `Buy ${row.label}?`, submit: `Buy for ${money(row.price)}`, action: "org-buy", data: { orgId: org.id, itemKey: row.item_key },
      body: `<div class="kv"><div><small>Price</small><b>${money(row.price)}</b></div><div><small>Wallet after</small><b>${money(Number(org.wallet.balance) - Number(row.price))}</b></div><div class="wide"><small>What you get</small><b>${esc(row.description)}</b></div></div><div class="callout">${icon("info")}<div>${row.kind === "property" ? "The property is yours until you sell it (50% refund). It appears in game for members on duty within a minute." : "Applies in game for every member on duty."}</div></div>` });
    return;
  }
  const orgSell = target.closest("[data-org-sell]");
  if (orgSell) {
    const orgs = state.data.economy?.organizations || [];
    const org = orgs.find((o) => String(o.id) === String(filter("org-id", orgs[0]?.id))) || orgs[0];
    const row = (state.data.economy.shop || []).find((item) => item.item_key === orgSell.dataset.orgSell);
    openDialog({ kicker: org.name, title: `Sell ${row?.label || "property"}?`, submit: "Sell property", tone: "btn-danger", action: "org-sell", data: { orgId: org.id, itemKey: orgSell.dataset.orgSell },
      body: `<div class="callout warn">${icon("alert")}<div>You get <b>${money(Math.floor(Number(row?.price || 0) / 2))}</b> back and the property is released for any organization to buy.</div></div>` });
    return;
  }
  const orgAdjust = target.closest("[data-org-adjust]");
  if (orgAdjust) return orgAdjustDialog(orgAdjust.dataset.orgAdjust);
  const orgLeader = target.closest("[data-org-leader]");
  if (orgLeader) return orgLeaderDialog(orgLeader.dataset.orgLeader);
});

$("#portal-content").addEventListener("change", (event) => {
  if (event.target.closest("#appeal-form")) { captureAppealDraft(); return; }
  const form = event.target.closest("#exam-form");
  if (!form) return;
  const answers = loadDraft(form.dataset.exam);
  if (event.target.type === "radio") answers[event.target.name] = Number(event.target.value);
  saveDraft(form.dataset.exam, answers);
  const scroll = window.scrollY;
  examForm();
  window.scrollTo({ top: scroll });
});

$("#portal-content").addEventListener("submit", async (event) => {
  const replyForm = event.target.closest("[data-appeal-reply]");
  if (replyForm) {
    event.preventDefault();
    const button = replyForm.querySelector("button");
    button.disabled = true;
    try { const result = await api("portal/appeal/reply", { method: "POST", body: JSON.stringify({ appealId: Number(replyForm.dataset.appealReply), body: new FormData(replyForm).get("body") }) }); state.data = result.data; render(); toast("Reply sent - your appeal is back with staff."); }
    catch (error) { toast(error.message, true); button.disabled = false; }
    return;
  }
  if (event.target.id === "appeal-form") {
    event.preventDefault();
    const draft = captureAppealDraft();
    const banId = event.target.dataset.ban;
    const button = event.target.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const evidence = (draft.evidence || []).filter(Boolean);
      const answers = Object.fromEntries((state.data.appealQuestions || []).map((q) => [q.id, draft[q.id] || ""]));
      const result = await api("portal/appeal", { method: "POST", body: JSON.stringify({ banId, answers, evidence, acknowledge: draft.acknowledge === true }) });
      clearAppealDraft(banId);
      state.appealing = null;
      state.data = result.data;
      render();
      window.scrollTo({ top: 0 });
      toast(`Appeal submitted. Staff will review it - you can follow it below and in ticket #${result.result.ticket.id}.`);
    } catch (error) { toast(error.message, true); button.disabled = false; }
    return;
  }
  if (event.target.id !== "exam-form") return;
  event.preventDefault();
  const key = event.target.dataset.exam;
  const answers = loadDraft(key);
  for (const area of event.target.querySelectorAll("textarea")) answers[area.name] = area.value;
  if (!confirm("Submit your exam now? Answers cannot be changed afterwards.")) return;
  const button = event.target.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const result = await api("portal/exam/submit", { method: "POST", body: JSON.stringify({ examKey: key, answers }) });
    clearDraft(key);
    state.examTaking = null;
    state.data = result.data;
    render();
    window.scrollTo({ top: 0 });
    toast(`Exam submitted${result.result?.autoScore !== null && result.result?.autoScore !== undefined ? ` · multiple choice ${result.result.autoScore}%` : ""}. Management has been notified.`);
  } catch (error) { toast(error.message, true); button.disabled = false; }
});

$("#portal-content").addEventListener("input", (event) => {
  if (event.target.closest("#appeal-form")) {
    captureAppealDraft();
    const counter = event.target.name && $(`#appeal-form [data-count="${event.target.name}"]`);
    if (counter) {
      const length = event.target.value.trim().length;
      counter.textContent = `${length} / ${counter.dataset.min} characters minimum`;
      counter.classList.toggle("ok", length >= Number(counter.dataset.min));
    }
    return;
  }
  const area = event.target.closest("#exam-form textarea");
  if (area) {
    const form = area.closest("#exam-form");
    const answers = loadDraft(form.dataset.exam);
    answers[area.name] = area.value;
    saveDraft(form.dataset.exam, answers);
    const counter = form.querySelector(`[data-count="${area.name}"]`);
    if (counter) counter.textContent = `${area.value.trim().length} / ${counter.textContent.split("/")[1].trim()}`;
    return;
  }
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
  if (event.target.name === "decision" && state.dialog?.action === "appeal-staff") {
    $("#approve-warning").hidden = event.target.value !== "approved";
    $("#reduce-days").hidden = event.target.value !== "reduced";
    const button = $("#dialog-submit");
    button.className = `btn ${event.target.value === "approved" ? "btn-good" : event.target.value === "denied" ? "btn-danger" : "btn-sun"}`;
    button.textContent = event.target.value === "approved" ? "Approve & lift" : event.target.value === "denied" ? "Deny appeal" : "Reduce ban";
    return;
  }
  if (event.target.name === "decision") {
    const button = $("#dialog-submit");
    button.className = `btn ${event.target.value === "passed" ? "btn-good" : event.target.value === "failed" ? "btn-danger" : "btn-sun"}`;
    button.textContent = event.target.value === "passed" ? "Pass & grant role" : event.target.value === "failed" ? "Fail application" : "Save decision";
  }
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
    } else if (action === "ticket-manage") {
      const kind = form.get("ticketAction");
      const input = { ticketId: data.ticketId, action: kind, level: Number(form.get("level")) };
      if (kind === "note") input.note = form.get("reason"); else input.reason = form.get("reason");
      result = await api("portal/ticket/action", { method: "POST", body: JSON.stringify(input) });
      toast("Ticket updated here and in Discord.");
    } else if (action === "appeal-staff") {
      const body = { appealId: data.appealId, action: data.kind === "decide" ? "decide" : data.kind };
      if (data.kind === "info") body.message = form.get("message");
      if (data.kind === "note") body.body = form.get("body");
      if (data.kind === "vote") { body.vote = form.get("vote"); body.body = form.get("body"); if (!body.vote) throw new Error("Choose a vote."); }
      if (data.kind === "decide") { body.decision = form.get("decision"); body.response = form.get("response"); body.days = Number(form.get("days")); if (!body.decision) throw new Error("Choose a decision."); }
      result = await api("portal/appeal/review", { method: "POST", body: JSON.stringify(body) });
      const r = result.result || {};
      toast(data.kind === "info" ? `Question sent${r.dmSent === false ? " (DM failed - they will see it on the portal)" : ""}.` : data.kind === "note" ? "Note added." : data.kind === "vote" ? "Vote recorded." : r.decision === "approved" ? `Appeal approved - ${data.banId} has been lifted.` : r.decision === "reduced" ? `Ban reduced - now ends ${date(r.reducedUntil)}.` : "Appeal denied.");
    } else if (action === "ops-announce") {
      result = await api("portal/liveops/action", { method: "POST", body: JSON.stringify({ action: "announce", message: form.get("message") }) });
      toast("Broadcast delivered to the game server.");
    } else if (action === "ops-event") {
      result = await api("portal/liveops/action", { method: "POST", body: JSON.stringify({ action: "event_start", title: form.get("title"), description: form.get("description"), location: form.get("location"), duration: Number(form.get("duration")), x: form.get("x"), y: form.get("y"), z: form.get("z") }) });
      toast("Community event is live and players were notified.");
    } else if (action === "exam-review") {
      const decision = form.get("decision");
      if (!decision) throw new Error("Choose a decision.");
      result = await api("portal/exam/review", { method: "POST", body: JSON.stringify({ applicationId: data.applicationId, decision, score: form.get("score"), notes: form.get("notes") }) });
      const r = result.result || {};
      toast(decision === "passed" ? (r.roleGranted ? "Passed - role granted in the staff Discord and logged." : `Passed and logged. Role not granted: ${r.roleNote || "unknown"}`) : decision === "failed" ? "Marked as failed and logged." : "Marked as in review.", decision === "passed" && !r.roleGranted);
    } else if (action === "org-buy") {
      result = await api("portal/org/purchase", { method: "POST", body: JSON.stringify(data) });
      toast(`Purchased. Wallet balance: ${money(result.result.balance)}.`);
    } else if (action === "org-sell") {
      result = await api("portal/org/sell", { method: "POST", body: JSON.stringify(data) });
      toast(`Sold ${result.result.label} for ${money(result.result.refund)}.`);
    } else if (action === "org-adjust") {
      result = await api("portal/org/adjust", { method: "POST", body: JSON.stringify({ orgId: data.orgId, amount: Number(form.get("amount")), reason: form.get("reason") }) });
      toast(`Wallet adjusted. New balance ${money(result.result.balance)}.`);
    } else if (action === "org-leader") {
      result = await api("portal/org/leader", { method: "POST", body: JSON.stringify({ orgId: data.orgId, discordId: form.get("discordId"), leader: form.get("leader") === "1" }) });
      toast(result.result.leader ? "Leader added." : "Leader removed.");
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
  await load();
  if (new URLSearchParams(location.search).get("next") === "control" && state.data.access.owner) location.replace("control.html");
}

start().catch((error) => {
  $("#auth-view").hidden = false;
  $("#portal-app").hidden = true;
  $("#auth-message").textContent = error.message;
});
