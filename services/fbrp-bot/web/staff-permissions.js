// Live staff permission matrix. The page asks the server for the matrix every few seconds with the version it
// already has, so an unchanged matrix costs a tiny reply. All text comes from the game and is inserted with
// textContent, never as HTML.

const $ = (id) => document.getElementById(id);
const POLL_MS = 4000;
const TEAM_COLORS = { "All players": "#5b6770", "Discord role": "#6b4fa0", Staff: "#2b7a78", "Senior Staff": "#3a6ea5", "High Staff": "#5b5ea6", "Pre Management": "#8a4f9e", "Trial Management": "#a64b6b", Management: "#b5651d", Ownership: "#8c1c13" };
const state = { data: null, hash: "", tab: "", flash: new Set(), log: [], failures: 0, lastOk: 0 };

function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) if (child != null && child !== false) node.append(child.nodeType ? child : document.createTextNode(String(child)));
  return node;
}

async function load() {
  const response = await fetch(`/api/staff-permissions${state.hash ? `?since=${encodeURIComponent(state.hash)}` : ""}`, { credentials: "same-origin", cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function grantKey(rank, ace) { return `${rank}|${ace}`; }

function grants(data) {
  const out = new Map();
  for (const section of data.sections) for (const row of section.rows) {
    [...row.has].forEach((flag, index) => out.set(grantKey(data.ranks[index].label, `${section.source}|${row.ace}`), { on: flag === "1", label: row.label, rank: data.ranks[index].label, source: section.source }));
  }
  return out;
}

function applyUpdate(next) {
  const before = state.data ? grants(state.data) : null;
  state.data = next;
  state.hash = next.hash;
  if (before) {
    const after = grants(next);
    const stamp = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
    for (const [key, now] of after) {
      const was = before.get(key);
      if (was && was.on !== now.on) {
        state.flash.add(key);
        state.log.unshift({ stamp, grant: now.on, label: now.label, rank: now.rank, source: now.source });
      }
    }
    state.log = state.log.slice(0, 60);
    setTimeout(() => { state.flash.clear(); render(); }, 6500);
  }
  if (!state.tab || !sources().includes(state.tab)) state.tab = sources()[0];
  render();
}

function sources() { return [...new Set(state.data.sections.map((section) => section.source))]; }

function teamBands(ranks) {
  const out = [];
  for (const rank of ranks) {
    const last = out[out.length - 1];
    if (last && last.team === rank.team) last.span++;
    else out.push({ team: rank.team, span: 1 });
  }
  return out;
}

function render() {
  const data = state.data;
  if (!data) return;
  $("sp-state").hidden = true;
  $("sp-app").hidden = false;
  const tabs = $("sp-tabs");
  tabs.replaceChildren(...sources().map((source) => {
    const count = data.sections.filter((section) => section.source === source).reduce((sum, section) => sum + section.rows.length, 0);
    return h("button", { type: "button", role: "tab", "aria-selected": String(source === state.tab), onclick: () => { state.tab = source; render(); } }, `${source} (${count})`);
  }));
  const query = $("sp-search").value.trim().toLowerCase();
  const onlyDiff = $("sp-diff").checked;
  const table = $("sp-table");
  const head = h("thead", {},
    h("tr", { class: "team" }, h("th", { class: "sp-name" }), teamBands(data.ranks).map((band) => h("th", { class: "sp-team", colspan: band.span, style: `background:${TEAM_COLORS[band.team] || "#5b6770"}` }, band.team))),
    h("tr", { class: "ranks" }, h("th", { class: "sp-name" }, "Permission"), data.ranks.map((rank) => h("th", { class: "sp-rank", title: rank.team }, rank.label))));
  const body = h("tbody");
  let shown = 0;
  for (const section of data.sections.filter((entry) => entry.source === state.tab)) {
    const rows = section.rows.filter((row) => {
      if (query && !`${row.label} ${row.ace} ${section.title}`.toLowerCase().includes(query)) return false;
      if (onlyDiff && !row.has.includes("0")) return false;
      return true;
    });
    if (!rows.length) continue;
    const counts = data.ranks.map((_, index) => rows.filter((row) => row.has[index] === "1").length);
    body.append(h("tr", { class: "sp-section" }, h("th", { class: "sp-name" }, `${section.title} (${rows.length})`), counts.map((count) => h("td", {}, `${count}/${rows.length}`))));
    for (const row of rows) {
      shown++;
      body.append(h("tr", {}, h("th", { class: "sp-name", scope: "row" }, h("b", {}, row.label), h("code", {}, row.ace)),
        [...row.has].map((flag, index) => {
          const everyone = row.has[0] === "1";
          const flashing = state.flash.has(grantKey(data.ranks[index].label, `${section.source}|${row.ace}`));
          return h("td", { class: `sp-cell${flag === "1" ? (everyone ? " all" : " on") : ""}${flashing ? " flash" : ""}`, title: `${data.ranks[index].label}: ${row.label}` }, flag === "1" ? "✓" : "");
        })));
    }
  }
  table.replaceChildren(head, body);
  if (!shown) $("sp-wrap").append(h("p", { class: "sp-empty", id: "sp-none" }, "No permissions match."));
  else $("sp-none")?.remove();
  $("sp-log").hidden = !state.log.length;
  $("sp-log-list").replaceChildren(...state.log.map((entry) => h("li", {}, h("time", {}, entry.stamp), h("b", { class: entry.grant ? "grant" : "revoke" }, entry.grant ? "Granted" : "Revoked"), ` ${entry.source} · ${entry.label} for ${entry.rank}`)));
  paintLive();
}

function paintLive() {
  const live = $("sp-live");
  const seconds = Math.round((Date.now() - state.lastOk) / 1000);
  live.classList.toggle("error", state.failures >= 3);
  live.classList.toggle("stale", state.failures > 0 && state.failures < 3);
  $("sp-live-text").textContent = state.failures >= 3 ? "Game not answering. Showing the last copy" : state.failures ? "Reconnecting…" : seconds < 6 ? "Live · up to date" : `Live · checked ${seconds}s ago`;
}

let timer = 0;
async function tick() {
  clearTimeout(timer);
  try {
    const next = await load();
    state.failures = 0;
    state.lastOk = Date.now();
    if (next.changed) applyUpdate(next);
    else if (!state.data) throw new Error("No data");
    else paintLive();
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      $("sp-app").hidden = true;
      $("sp-state").hidden = false;
      $("sp-state").replaceChildren(h("h2", {}, "Staff permissions"), h("p", {}, error.status === 401 ? "Sign in through the member portal to see this page." : error.message), h("a", { class: "btn btn-glass", href: "portal.html" }, "Open the portal"));
      return;
    }
    state.failures++;
    if (!state.data) $("sp-state").replaceChildren(h("h2", {}, "Staff permissions"), h("p", {}, error.message));
    else paintLive();
  }
  timer = setTimeout(tick, POLL_MS);
}

$("sp-search").addEventListener("input", render);
$("sp-diff").addEventListener("change", render);
document.addEventListener("visibilitychange", () => { if (!document.hidden) void tick(); });
setInterval(() => { if (state.data) paintLive(); }, 1000);
void tick();
