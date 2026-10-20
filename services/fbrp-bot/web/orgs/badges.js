/* Badge templates editor for the orgs website: one picture per rank (plus a default for ranks without their own) and where the name, rank,
   callsign, department and profile picture go on it. The Department Manager bot fills the same
   templates with `/badge`. Placement is saved as fractions of the picture, so it matches the bot's
   rendering at any size. */

// Only the callsign changes from member to member; names and ranks are printed on the template.
const FIELD_ORDER = ["callsign"];
const FIELD_TITLE = { name: "Name", rank: "Rank", callsign: "Callsign", department: "Department", avatar: "Profile picture" };
const MAX_SIDE = 1600;
const MAX_BYTES = 2.8 * 1024 * 1024;

const S = { orgId: null, data: null, tier: "member", drafts: {}, images: {}, selected: "callsign", loading: false, busy: false, error: "" };
let ctx = null;
let observer = null;

const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const clone = (value) => JSON.parse(JSON.stringify(value));
const tiers = () => S.data?.slots || [];
const current = () => tiers().find((tier) => tier.key === S.tier) || tiers()[0];
const fields = () => S.drafts[S.tier] || (S.drafts[S.tier] = clone(current().fields));
const canEdit = () => Boolean(S.data?.canEdit);
const imageUrl = () => S.images[S.tier]?.url || (current()?.has ? `/api/orgs/badge-image?org=${S.orgId}&tier=${S.tier}&v=${current().version}` : null);
const dirty = () => Boolean(S.images[S.tier]) || JSON.stringify(fields()) !== JSON.stringify(current().fields);

export function badgesShell() {
  return `<div class="stack" data-badge-root><div class="boot"><div class="spinner"></div><span>Loading badges</span></div></div>`;
}

export async function mountBadges(context) {
  ctx = context;
  const root = document.querySelector("[data-badge-root]");
  if (!root) return;
  const org = ctx.org();
  if (!org) return;
  if (S.orgId !== org.id) Object.assign(S, { orgId: org.id, data: null, tier: "member", drafts: {}, images: {}, selected: "callsign", error: "" });
  if (!S.data && !S.loading) await load();
  paint();
}

async function load() {
  S.loading = true;
  try {
    S.data = await ctx.api(`orgs/badges?org=${encodeURIComponent(S.orgId)}`);
    if (!tiers().some((tier) => tier.key === S.tier)) S.tier = tiers()[0].key;
    // Open on a tier that already has a picture, if there is one.
    const first = tiers().find((tier) => tier.has);
    if (first && !current().has) S.tier = first.key;
    S.error = "";
  } catch (error) {
    S.error = error.message;
  } finally {
    S.loading = false;
  }
}

function sample() {
  return S.data.callsignExample || "2A-14";
}

function labelStyle(key, field) {
  if (key === "avatar") {
    return `left:${field.x * 100}%;top:${field.y * 100}%;width:${field.size * 100}%;aspect-ratio:1;transform:translate(-50%,-50%);border-radius:${field.shape === "circle" ? "50%" : "6px"}`;
  }
  const shift = field.align === "left" ? "0" : field.align === "right" ? "-100%" : "-50%";
  return `left:${field.x * 100}%;top:${field.y * 100}%;transform:translate(${shift},-50%);font-size:calc(var(--badge-h,300px) * ${field.size});color:${esc(field.color)};font-weight:${field.weight === "bold" ? 700 : 400};text-align:${field.align}${field.uppercase ? ";text-transform:uppercase" : ""}`;
}

function stage() {
  const url = imageUrl();
  if (!url) {
    return `<div class="badge-empty">${ctx.icon("badge")}<b>No ${esc(current().label)} badge yet</b><span>${canEdit() ? "Upload a PNG, JPEG or WebP picture of the badge with its name and rank printed on it and a sample callsign where the callsign goes. The AI finds that space once, when you save." : "Leadership has not uploaded this badge yet."}</span></div>`;
  }
  const f = fields();
  const labels = FIELD_ORDER.filter((key) => f[key]?.enabled).map((key) => {
    const field = f[key];
    const bent = key !== "avatar" && field.align === "center";
    const text = key === "avatar" ? "" : sample();
    const body = key === "avatar" ? `<span class="badge-avatar-sample">${ctx.icon("users")}</span>` : bent ? [...text].map((c) => `<span class="bc">${esc(c)}</span>`).join("") : esc(text);
    return `<div class="badge-label ${key === "avatar" ? "is-avatar" : ""} ${S.selected === key ? "on" : ""}" data-badge-field="${key}" data-font="${esc(field.font || "sans")}" style="${labelStyle(key, field)}" title="${esc(FIELD_TITLE[key])}">${body}</div>`;
  }).join("");
  return `<div class="badge-canvas" data-badge-canvas><img src="${esc(url)}" alt="${esc(current().label)} badge template" draggable="false">${labels}</div>`;
}

function inspector() {
  const f = fields();
  const key = S.selected;
  const field = f[key];
  const chips = FIELD_ORDER.map((name) => `<button type="button" class="chip ${name === key ? "on" : ""} ${f[name]?.enabled ? "" : "off"}" data-badge-pick="${name}">${esc(FIELD_TITLE[name])}</button>`).join("");
  const disabled = canEdit() ? "" : "disabled";
  const range = (name, label, min, max, step, value) => `<label class="field">${label}<input type="range" data-badge-set="${name}" min="${min}" max="${max}" step="${step}" value="${value}" ${disabled}></label>`;
  const isAvatar = key === "avatar";
  return `<div class="badge-fields">${chips}</div>
    <div class="badge-controls">
      <div class="toggle-row"><div><b>Show ${esc(FIELD_TITLE[key].toLowerCase())}</b><small>${isAvatar ? "The member's Discord picture." : "Drag it on the badge to move it."}</small></div><label class="switch"><input type="checkbox" data-badge-set="enabled" ${field.enabled ? "checked" : ""} ${disabled}><span></span></label></div>
      ${field.enabled ? (isAvatar
        ? `${range("size", "Size", 0.05, 0.8, 0.005, field.size)}<label class="field">Shape<select data-badge-set="shape" ${disabled}><option value="circle" ${field.shape === "circle" ? "selected" : ""}>Circle</option><option value="square" ${field.shape === "square" ? "selected" : ""}>Square</option></select></label>`
        : `${range("size", "Text size", 0.015, 0.2, 0.001, field.size)}
           ${range("maxWidth", "Longest width", 0.1, 1, 0.01, field.maxWidth)}
           <div class="badge-row"><label class="field">Colour<input type="color" data-badge-set="color" value="${esc(field.color)}" ${disabled}></label>
           <label class="field">Align<select data-badge-set="align" ${disabled}>${["left", "center", "right"].map((a) => `<option value="${a}" ${field.align === a ? "selected" : ""}>${a[0].toUpperCase()}${a.slice(1)}</option>`).join("")}</select></label></div>
           <div class="badge-row"><label class="field">Font<select data-badge-set="font" ${disabled}><option value="sans" ${field.font !== "serif" ? "selected" : ""}>Sans</option><option value="serif" ${field.font === "serif" ? "selected" : ""}>Serif</option></select></label>
           <div class="badge-checks"><label class="check"><input type="checkbox" data-badge-set="weight" ${field.weight === "bold" ? "checked" : ""} ${disabled}> Bold</label>
           <label class="check"><input type="checkbox" data-badge-set="uppercase" ${field.uppercase ? "checked" : ""} ${disabled}> UPPERCASE</label></div></div>
           ${field.align === "center" ? `${range("bendA", "Curve (for banners)", -2, 2, 0.01, field.bendA || 0)}${range("bendB", "Tilt", -0.8, 0.8, 0.005, field.bendB || 0)}` : ""}`) : ""}
    </div>`;
}

function paint() {
  const root = document.querySelector("[data-badge-root]");
  if (!root) return;
  if (S.error && !S.data) {
    root.innerHTML = `<section class="card"><div class="card-body"><p class="muted">${esc(S.error)}</p></div></section>`;
    return;
  }
  const org = ctx.org();
  const tier = current();
  const edit = canEdit();
  root.innerHTML = `
    <section class="card">
      <div class="card-head"><div><h2>Badges</h2><p>${edit ? "Pick a rank and upload its badge picture. The picture's name and rank stay as printed; only the callsign is replaced. A rank without its own picture uses the default badge. " : ""}Members run <b>/badge</b> in Discord to get theirs with their callsign.</p></div></div>
      <div class="badge-slots">${tiers().map((row) => `<button type="button" class="badge-slot ${row.key === S.tier ? "on" : ""} ${row.has ? "has" : ""}" data-badge-tier="${esc(row.key)}"><b>${esc(row.label)}</b><small>${row.has ? "Picture uploaded" : row.kind === "default" ? "Used by ranks without their own" : "Uses the default badge"}</small></button>`).join("")}</div>
    </section>
    <section class="card">
      <div class="card-head"><div><h2>${esc(tier.label)}${tier.kind === "rank" ? " badge" : ""}</h2><p>${tier.has || S.images[S.tier] ? "Drag the callsign to move it. Changes are saved with the button." : "No picture uploaded for this one yet. Members get the default badge until you add it."}</p></div>
        <div class="chips">
          ${edit ? `<label class="btn btn-glass btn-sm" style="cursor:pointer">${ctx.icon("plus")}${tier.has || S.images[S.tier] ? "Replace picture" : "Upload picture"}<input type="file" accept="image/png,image/jpeg,image/webp" data-badge-file hidden></label>` : ""}
          ${edit && (tier.has || S.images[S.tier]) ? `<button class="btn btn-org btn-sm" type="button" data-badge-save ${dirty() && !S.busy ? "" : "disabled"}>${ctx.icon("check")}Save badge</button>` : ""}
          ${edit && dirty() ? `<button class="btn btn-ghost btn-sm" type="button" data-badge-reset>Discard changes</button>` : ""}
          ${edit && tier.has ? `<button class="btn btn-ghost btn-sm" type="button" data-badge-remove style="color:var(--bad)">${ctx.icon("trash")}Remove</button>` : ""}
        </div></div>
      <div class="card-body badge-editor">
        <div class="badge-stage">${stage()}</div>
        <div class="badge-side">${imageUrl() ? inspector() : `<p class="muted">The text controls appear once there is a picture.</p>`}</div>
      </div>
    </section>`;
  measure();
}

/** Keep label sizes tied to the picture height and shrink long text to its width, like the bot does. */
function measure() {
  const canvas = document.querySelector("[data-badge-canvas]");
  observer?.disconnect();
  if (!canvas) return;
  const fit = () => {
    const box = canvas.getBoundingClientRect();
    canvas.style.setProperty("--badge-h", `${box.height}px`);
    const f = fields();
    canvas.querySelectorAll("[data-badge-field]").forEach((node) => {
      const key = node.dataset.badgeField;
      if (key === "avatar") return;
      node.style.fontSize = `calc(var(--badge-h, 300px) * ${f[key].size})`;
      const limit = f[key].maxWidth * box.width;
      const width = node.scrollWidth;
      if (width > limit && width > 0) node.style.fontSize = `calc(var(--badge-h, 300px) * ${f[key].size * (limit / width)})`;
      bend(node, f[key], box);
    });
  };
  fit();
  observer = new ResizeObserver(fit);
  observer.observe(canvas);
}

/** Shift each character down the banner curve, like the bot's renderer shifts each column. */
function bend(node, field, box) {
  const chars = [...node.querySelectorAll(".bc")];
  if (!chars.length) return;
  const middle = node.getBoundingClientRect();
  const cx = middle.left + middle.width / 2;
  for (const char of chars) {
    const r = char.getBoundingClientRect();
    const u = (r.left + r.width / 2 - cx) / box.width;
    char.style.transform = `translateY(${((field.bendA || 0) * u * u + (field.bendB || 0) * u) * box.height}px)`;
  }
}

async function scaleTemplate(file) {
  if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Choose a PNG, JPEG or WebP picture.");
  if (file.size > 20 * 1024 * 1024) throw new Error("That picture is too large. Pick one under 20 MB.");
  const bitmap = await createImageBitmap(file);
  const draw = (side) => {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas;
  };
  // PNG first (the AI reads PNG only), a little smaller each time, and a JPEG only as a last resort.
  for (const side of [MAX_SIDE, 1200, 900]) {
    const data = draw(side).toDataURL("image/png");
    if (data.length * 0.75 <= MAX_BYTES) return data;
  }
  for (const quality of [0.9, 0.75]) {
    const data = draw(1200).toDataURL("image/jpeg", quality);
    if (data.length * 0.75 <= MAX_BYTES) return data;
  }
  throw new Error("That picture is still too large after shrinking it. Try a simpler picture.");
}

async function save() {
  S.busy = true;
  paint();
  try {
    const pending = S.images[S.tier];
    // A new picture is read by the AI once on the server, which decides where the callsign goes.
    const body = { orgId: S.orgId, tier: S.tier, ...(pending ? { image: pending.data } : { fields: fields() }) };
    const saved = (await ctx.api("orgs/badge", { method: "POST", body: JSON.stringify(body) })).result || {};
    delete S.images[S.tier];
    delete S.drafts[S.tier];
    S.data = null;
    await load();
    if (pending) ctx.toast(saved.found?.length ? `${current().label} badge saved. The AI found the callsign space${saved.erased ? " and removed the sample" : ""}; drag it to fine-tune.` : `${current().label} badge saved, but ${(saved.notes || []).join("; ") || "the AI found no callsign space"}. Drag the callsign into place.`, !saved.found?.length);
    else ctx.toast(`${current().label} badge saved.`);
  } catch (error) {
    ctx.toast(error.message, true);
  } finally {
    S.busy = false;
    paint();
  }
}

function startDrag(event, node) {
  if (!canEdit()) return;
  const canvas = node.closest("[data-badge-canvas]");
  const key = node.dataset.badgeField;
  S.selected = key;
  const box = canvas.getBoundingClientRect();
  node.setPointerCapture(event.pointerId);
  const move = (e) => {
    const f = fields()[key];
    f.x = Math.min(1, Math.max(0, +((e.clientX - box.left) / box.width).toFixed(4)));
    f.y = Math.min(1, Math.max(0, +((e.clientY - box.top) / box.height).toFixed(4)));
    node.style.left = `${f.x * 100}%`;
    node.style.top = `${f.y * 100}%`;
  };
  const stop = () => {
    node.removeEventListener("pointermove", move);
    node.removeEventListener("pointerup", stop);
    node.removeEventListener("pointercancel", stop);
    paint();
  };
  node.addEventListener("pointermove", move);
  node.addEventListener("pointerup", stop);
  node.addEventListener("pointercancel", stop);
  event.preventDefault();
}

document.addEventListener("pointerdown", (event) => {
  const node = event.target instanceof Element ? event.target.closest("[data-badge-field]") : null;
  if (node && ctx) startDrag(event, node);
});

document.addEventListener("click", async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target || !target.closest("[data-badge-root]") || !S.data) return;
  const tier = target.closest("[data-badge-tier]");
  if (tier) { S.tier = tier.dataset.badgeTier; return paint(); }
  const pick = target.closest("[data-badge-pick]");
  if (pick) { S.selected = pick.dataset.badgePick; return paint(); }
  if (target.closest("[data-badge-save]")) return save();
  if (target.closest("[data-badge-reset]")) { delete S.drafts[S.tier]; delete S.images[S.tier]; return paint(); }
  if (target.closest("[data-badge-remove]")) {
    if (!(await window.fbrpConfirm(`Remove the ${current().label} badge picture?`, { confirmLabel: "Remove", tone: "danger" }))) return;
    try {
      await ctx.api("orgs/badge/remove", { method: "POST", body: JSON.stringify({ orgId: S.orgId, tier: S.tier }) });
      delete S.drafts[S.tier]; delete S.images[S.tier];
      S.data = null;
      await load();
      ctx.toast("Badge removed.");
    } catch (error) { ctx.toast(error.message, true); }
    paint();
  }
});

document.addEventListener("change", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement) || !target.closest("[data-badge-root]") || !S.data) return;
  if (target instanceof HTMLInputElement && target.dataset.badgeFile !== undefined) {
    const file = target.files?.[0];
    target.value = "";
    if (!file) return;
    try {
      const data = await scaleTemplate(file);
      S.images[S.tier] = { data, url: data };
      paint();
    } catch (error) { ctx.toast(error.message, true); }
    return;
  }
  applySetting(target);
});

document.addEventListener("input", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.type === "range" && target.closest("[data-badge-root]") && S.data) applySetting(target, true);
});

function applySetting(target, live = false) {
  const name = target.dataset?.badgeSet;
  if (!name || !canEdit()) return;
  const field = fields()[S.selected];
  if (target instanceof HTMLInputElement && target.type === "checkbox") field[name === "weight" ? "weight" : name] = name === "weight" ? (target.checked ? "bold" : "regular") : target.checked;
  else field[name] = target.type === "range" ? Number(target.value) : target.value;
  if (live) {
    // Update the preview in place so the slider keeps focus while it moves.
    const node = document.querySelector(`[data-badge-field="${S.selected}"]`);
    if (node) { node.setAttribute("style", labelStyle(S.selected, field)); measure(); }
    return;
  }
  paint();
}
