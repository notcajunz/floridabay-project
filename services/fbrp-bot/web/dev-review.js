// Owner-only dev server transfers. All text from the dev server, the agent and the owner is
// inserted with textContent, never as HTML.

const $ = (id) => document.getElementById(id);
const state = { items: [], config: null, selected: null, timer: 0 };

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

async function api(path, body) {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return data;
}

const ago = (ms) => {
  const seconds = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (seconds < 90) return `${seconds}s ago`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 172800) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
};
const statusLabel = (status) => String(status || "").replace(/_/g, " ");

function showState(message, error = false) {
  $("dr-state").hidden = false;
  $("dr-state").replaceChildren(error ? h("h2", {}, "Dev review") : h("div", { class: "spinner" }), h("p", {}, message));
  $("dr-layout").hidden = true;
  $("dr-config").hidden = true;
}

function renderConfig() {
  const c = state.config;
  const box = $("dr-config");
  const notes = [];
  if (!c.runner) notes.push(h("div", { class: "callout warn" }, "The implementation runner script is not installed on this server, so transfers wait here."));
  box.replaceChildren(...notes, transferCard(c));
  box.hidden = false;
}

function transferCard(c) {
  if (!c.sftp) return h("div", { class: "callout warn" }, "Dev server transfer is not set up: the FBRP_DEV_SFTP_* login is missing on the control server.");
  if (!c.canTransfer) return h("div", { class: "callout warn" }, "Only the designated account can start a dev server transfer.");
  const picker = agentPicker("claude");
  const model = h("select", { "aria-label": "Model" });
  const fillModels = () => model.replaceChildren(h("option", { value: "" }, "Default model"), ...(c.models?.[picker.value] || []).map((name) => h("option", { value: name }, name)));
  const effort = h("select", { "aria-label": "Effort" });
  const fillChoices = () => {
    fillModels();
    effort.replaceChildren(h("option", { value: "" }, "Default effort"), ...(c.efforts?.[picker.value] || []).map((name) => h("option", { value: name }, name)));
  };
  picker.addEventListener("change", fillChoices);
  fillChoices();
  const notes = h("textarea", { placeholder: "Optional: extra features, specs or changes you want the AI to make as part of this transfer", maxlength: String(c.instructionLimit || 8000), rows: "4", "aria-label": "Extra instructions" });
  const button = h("button", { class: "btn btn-sun btn-sm", type: "button" }, "Pull from dev server");
  button.addEventListener("click", async () => {
    const chosen = `${picker.value}${model.value ? ` (${model.value}` : ""}${effort.value ? `${model.value ? ", " : " ("}${effort.value} effort` : ""}${model.value || effort.value ? ")" : ""}`;
    if (!window.confirm(`Pull every changed file from the dev server and have ${chosen} integrate and release it?`)) return;
    button.disabled = true;
    try {
      const { id } = await api("/api/dev-review/transfer", { agent: picker.value, model: model.value, effort: effort.value, instructions: notes.value });
      notes.value = "";
      await refresh(id);
    } catch (error) {
      window.alert(error.message);
    } finally {
      button.disabled = false;
    }
  });
  return h("div", { class: "dr-decision" },
    h("h3", {}, "Pull from dev server"),
    h("label", {}, "AI ", picker),
    h("label", {}, "Model ", model),
    h("label", {}, "Effort ", effort),
    notes,
    h("div", { class: "dr-actions" }, button));
}

function renderList() {
  const root = $("dr-items");
  if (!state.items.length) {
    root.replaceChildren(h("p", { class: "dr-empty" }, "No transfers yet."));
    return;
  }
  root.replaceChildren(
    ...state.items.map((item) =>
      h("button", { class: `dr-item${state.selected === item.id ? " active" : ""}`, type: "button", onclick: () => select(item.id) },
        h("b", {}, `#${item.id} ${item.title}`),
        h("div", { class: "dr-row" }, h("span", { class: "dr-status" }, statusLabel(item.status))),
        h("small", {}, `${item.agent || "—"}${item.aiModel ? ` · ${item.aiModel}` : ""} · ${ago(item.createdAt)}`)),
    ),
  );
}

function agentPicker(defaultAgent) {
  return h("select", { "aria-label": "Implementation agent" },
    h("option", { value: "claude", selected: defaultAgent !== "codex" }, "Claude CLI"),
    h("option", { value: "codex", selected: defaultAgent === "codex" }, "Codex CLI"));
}

function renderDetail(item, log) {
  const root = $("dr-detail");
  const nodes = [
    h("div", {},
      h("div", { class: "dr-row" }, h("span", { class: "dr-status" }, statusLabel(item.status))),
      h("h1", {}, `#${item.id} ${item.title}`),
      h("p", { class: "dr-links" }, `${item.agent || "—"} CLI${item.aiModel ? ` · ${item.aiModel}` : ""} · ${ago(item.createdAt)}`)),
  ];
  if (item.decisionNote) nodes.push(h("div", { class: "dr-box" }, h("h3", {}, "Your instructions"), h("p", {}, item.decisionNote)));
  nodes.push(h("div", { class: "dr-box" }, h("h3", {}, `Files (${item.files.length})`),
    item.files.length
      ? h("div", { class: "dr-files" }, item.files.map((f) => h("div", {}, `${f.status} `, h("code", {}, f.name))))
      : h("small", {}, "No files.")));
  if (["transferring", "accepted", "implementing", "implemented", "failed"].includes(item.status)) {
    const retry = item.status === "failed" && item.files.length ? agentPicker(item.agent) : null;
    nodes.push(h("div", { class: "dr-box" }, h("h3", {}, "Integration"),
      h("p", {}, item.status === "transferring" ? "Pulling the changed files from the dev server…" : item.status === "accepted" ? "Waiting for the runner to pick this up…" : item.status === "implementing" ? "The agent is working. This page refreshes by itself." : item.status === "implemented" ? "Finished." : "Failed."),
      item.resultSummary ? h("pre", { class: "dr-log" }, item.resultSummary) : null,
      log ? h("details", {}, h("summary", {}, "Run log"), h("pre", { class: "dr-log" }, log)) : null,
      retry ? h("div", { class: "dr-actions" }, retry, h("button", { class: "btn btn-glass btn-sm", type: "button", onclick: async () => { try { await api("/api/dev-review/retry", { id: item.id, agent: retry.value }); await refresh(item.id); } catch (error) { window.alert(error.message); } } }, "Retry integration")) : null));
  }
  root.replaceChildren(...nodes);
}

async function select(id) {
  state.selected = id;
  history.replaceState(null, "", `?id=${id}`);
  renderList();
  try {
    const { submission, log } = await api(`/api/dev-review/item?id=${id}`);
    renderDetail(submission, log);
    clearTimeout(state.timer);
    if (["transferring", "accepted", "implementing", "queued", "analyzing"].includes(submission.status)) state.timer = setTimeout(() => refresh(id), 10_000);
  } catch (error) {
    $("dr-detail").replaceChildren(h("p", { class: "dr-empty" }, error.message));
  }
}

async function refresh(selectId = state.selected) {
  const data = await api("/api/dev-review/list");
  state.items = data.submissions;
  state.config = data.config;
  renderConfig();
  renderList();
  if (selectId) await select(selectId);
}

async function start() {
  try {
    const session = await api("/api/auth/session");
    if (!session.authenticated) {
      window.location.href = "portal.html?next=dev-review";
      return;
    }
    const id = Number(new URLSearchParams(window.location.search).get("id")) || null;
    await refresh(id);
    $("dr-state").hidden = true;
    $("dr-layout").hidden = false;
    $("dr-refresh").addEventListener("click", () => refresh().catch((error) => window.alert(error.message)));
  } catch (error) {
    showState(error.status === 403 ? "Dev review is only available to the server owner." : error.message, true);
  }
}

start();
