/* Shared interface pieces for every Florida Bay website: custom dropdowns in place of the browser's
   <select> menus, and dialogs in place of alert(), confirm() and prompt().

   Dropdowns: every single-choice <select> is enhanced automatically (also ones added later). The real
   <select> stays in the page, hidden, so forms, `.value` and change events keep working unchanged. Add
   data-native to a select to leave it alone.
   Dialogs: FBRP_UI.confirm(message, options) and FBRP_UI.prompt(message, options) return promises (so
   `await` them); window.alert() is replaced with the same look. options: { title, confirmLabel,
   cancelLabel, tone: "danger", value, placeholder }. */
(() => {
  "use strict";
  if (window.FBRP_UI) return;

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  /* A <dialog> opened with showModal() sits in the browser's top layer and makes the rest of the page inert, so
     menus and dialogs have to live inside it or they open invisibly behind it. */
  const host = (near) => {
    const modal = near?.closest?.("dialog:modal") || [...document.querySelectorAll("dialog[open]")].reverse().find((d) => d.matches(":modal"));
    return modal || document.body;
  };

  /* ---------- dialogs ---------- */
  const DANGER = /\b(remove|delete|withdraw|lock|cancel|wipe|discard|replace|revoke|reset|clear)\b/i;
  let chain = Promise.resolve();

  function dialog({ title = "", message = "", kind = "confirm", confirmLabel, cancelLabel, tone, value = "", placeholder = "" }) {
    const run = () => new Promise((resolve) => {
      const danger = (tone || (kind === "confirm" && DANGER.test(message) ? "danger" : "")) === "danger";
      const opener = document.activeElement;
      const backdrop = el("div", "ui-backdrop");
      const modal = el("div", "ui-modal");
      modal.setAttribute("role", kind === "alert" ? "alertdialog" : "dialog");
      modal.setAttribute("aria-modal", "true");
      if (title) { const h = el("h2", "", title); h.id = `ui-title-${Date.now()}`; modal.append(h); modal.setAttribute("aria-labelledby", h.id); }
      const body = el("p", "", String(message));
      body.id = `ui-body-${Date.now()}`;
      modal.append(body);
      modal.setAttribute("aria-describedby", body.id);
      let input = null;
      if (kind === "prompt") { input = el("input"); input.type = "text"; input.value = value; input.placeholder = placeholder; modal.append(input); }
      const actions = el("div", "ui-actions");
      const cancel = kind === "alert" ? null : el("button", "ui-btn", cancelLabel || "Cancel");
      const word = (String(message).match(DANGER) || [])[1];
      const ok = el("button", `ui-btn ${danger ? "danger" : "primary"}`, confirmLabel || (danger && word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : kind === "alert" ? "OK" : "Confirm"));
      for (const button of [cancel, ok]) if (button) { button.type = "button"; actions.append(button); }
      modal.append(actions);
      backdrop.append(modal);
      host(opener).append(backdrop);
      const finish = (result) => {
        document.removeEventListener("keydown", onKey, true);
        backdrop.remove();
        if (opener instanceof HTMLElement && document.contains(opener)) opener.focus({ preventScroll: true });
        resolve(result);
      };
      const accept = () => finish(kind === "prompt" ? input.value : true);
      const dismiss = () => finish(kind === "prompt" ? null : kind === "alert");
      function onKey(event) {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); dismiss(); }
        else if (event.key === "Enter" && (event.target === input || event.target === document.body || modal.contains(event.target) && event.target.tagName !== "BUTTON")) { event.preventDefault(); accept(); }
        else if (event.key === "Tab") {
          const items = [...modal.querySelectorAll("input,button")];
          const first = items[0], last = items.at(-1);
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      }
      document.addEventListener("keydown", onKey, true);
      ok.addEventListener("click", accept);
      cancel?.addEventListener("click", dismiss);
      backdrop.addEventListener("mousedown", (event) => { if (event.target === backdrop && kind !== "alert") dismiss(); });
      (input || (danger && cancel) || ok).focus();
      input?.select();
    });
    // One dialog at a time, in the order they were asked.
    const next = chain.then(run, run);
    chain = next.catch(() => {});
    return next;
  }

  const options = (second) => (typeof second === "string" ? { title: second } : second || {});
  window.FBRP_UI = {
    confirm: (message, opts) => dialog({ ...options(opts), message, kind: "confirm" }),
    alert: (message, opts) => dialog({ ...options(opts), message, kind: "alert" }),
    prompt: (message, opts) => dialog({ ...options(opts), message, kind: "prompt" }),
  };
  window.fbrpConfirm = window.FBRP_UI.confirm;
  window.fbrpPrompt = window.FBRP_UI.prompt;
  window.alert = (message) => { window.FBRP_UI.alert(message ?? ""); };

  /* ---------- dropdowns ---------- */
  const state = new WeakMap();
  let openState = null;

  const labelOf = (option) => option.label || option.textContent.trim();
  const searchTextOf = (option) => `${labelOf(option)} ${option.value || ""}`.toLocaleLowerCase();

  function refresh(select) {
    const s = state.get(select);
    if (!s) return;
    const chosen = select.options[select.selectedIndex];
    const text = chosen ? labelOf(chosen) : "";
    s.text.textContent = text || " ";
    s.button.classList.toggle("placeholder", !chosen || chosen.value === "");
    s.button.disabled = select.disabled;
  }

  function enhance(select) {
    if (state.has(select) || select.multiple || select.size > 1 || select.hasAttribute("data-native") || !select.parentNode) return;
    const cs = getComputedStyle(select);
    if (cs.display === "none") return;
    const wrap = el("div", "ui-select");
    const parentWidth = select.parentElement?.clientWidth || 0;
    const width = parseFloat(cs.width);
    if (/inline/.test(cs.display) || (width && parentWidth && width < parentWidth * 0.9)) { wrap.style.display = "inline-block"; wrap.style.width = "auto"; wrap.style.minWidth = `${Math.max(120, width || 0)}px`; }
    if (cs.flex && cs.flex !== "0 1 auto") wrap.style.flex = cs.flex;
    if (cs.marginLeft === "auto") wrap.style.marginLeft = "auto";
    const button = el("button", "ui-select-btn");
    button.type = "button";
    button.setAttribute("aria-haspopup", "listbox");
    button.setAttribute("aria-expanded", "false");
    const height = parseFloat(cs.height);
    if (height >= 28) button.style.height = `${height}px`;
    button.style.fontSize = cs.fontSize;
    button.style.borderRadius = cs.borderRadius === "0px" ? "" : cs.borderRadius;
    const text = el("span");
    button.append(text);
    select.before(wrap);
    wrap.append(select, button);
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");
    const s = { wrap, button, text, observer: null };
    state.set(select, s);
    const label = select.closest("label");
    if (select.id) { const named = document.querySelector(`label[for="${CSS.escape(select.id)}"]`); if (named && !button.id) { button.id = `${select.id}-ui`; named.setAttribute("for", button.id); } }
    if (label && !select.id) button.setAttribute("aria-label", label.textContent.trim().slice(0, 80));
    s.observer = new MutationObserver(() => refresh(select));
    s.observer.observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "selected", "label", "value"] });
    select.addEventListener("change", () => refresh(select));
    select.addEventListener("focus", () => button.focus());
    button.addEventListener("click", () => (openState?.select === select ? closePop() : openPop(select)));
    button.addEventListener("keydown", (event) => {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) { event.preventDefault(); openPop(select); }
      else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) { openPop(select); typeAhead(event.key); }
    });
    refresh(select);
  }

  function entries(select) {
    const list = [];
    for (const child of select.children) {
      if (child.tagName === "OPTGROUP") {
        list.push({ group: child.label });
        for (const option of child.children) if (option.tagName === "OPTION") list.push({ option, disabled: option.disabled || child.disabled });
      } else if (child.tagName === "OPTION") list.push({ option: child, disabled: child.disabled });
    }
    return list;
  }

  function openPop(select) {
    closePop();
    const s = state.get(select);
    if (!s || select.disabled) return;
    const pop = el("div", "ui-pop");
    pop.tabIndex = -1;
    const list = el("div", "ui-options");
    list.setAttribute("role", "listbox");
    const items = entries(select);
    const optionCount = items.filter((item) => item.option).length;
    const rows = [];
    const groups = [];
    let currentGroup = null;
    let search = null;
    if (optionCount > 20) {
      const searchWrap = el("div", "ui-search");
      search = el("input");
      search.type = "search";
      search.placeholder = `Search ${optionCount} options…`;
      search.setAttribute("aria-label", "Search dropdown options");
      searchWrap.append(search);
      pop.append(searchWrap);
    }
    for (const item of items) {
      if (item.group !== undefined) {
        const heading = el("div", "ui-group", item.group);
        currentGroup = { heading, rows: [] };
        groups.push(currentGroup);
        list.append(heading);
        continue;
      }
      const row = el("div", "ui-opt");
      row.setAttribute("role", "option");
      row.append(el("span", "", labelOf(item.option) || " "));
      if (item.disabled) row.classList.add("disabled");
      if (item.option.selected) row.classList.add("selected");
      row.setAttribute("aria-selected", item.option.selected ? "true" : "false");
      row._option = item.option;
      row._disabled = item.disabled;
      row.addEventListener("pointermove", () => activate(rows.indexOf(row)));
      row.addEventListener("click", () => choose(rows.indexOf(row)));
      rows.push(row);
      currentGroup?.rows.push(row);
      list.append(row);
    }
    const empty = el("div", "ui-empty", "No matching options");
    empty.hidden = true;
    list.append(empty);
    pop.append(list);
    host(s.wrap).append(pop);
    s.wrap.classList.add("open");
    s.button.setAttribute("aria-expanded", "true");
    openState = { select, pop, rows, groups, empty, search, active: -1, buffer: "", timer: 0 };
    place(pop, s.button);
    const start = rows.findIndex((row) => row._option.selected);
    activate(start >= 0 ? start : rows.findIndex((row) => !row._disabled));
    (search || pop).focus({ preventScroll: true });
    search?.addEventListener("input", () => filterRows(search.value));
    pop.addEventListener("keydown", onPopKey);
    pop.addEventListener("focusout", () => setTimeout(() => { if (openState?.pop === pop && !pop.contains(document.activeElement)) closePop(); }, 0));
  }

  function filterRows(query) {
    if (!openState) return;
    const needle = query.trim().toLocaleLowerCase();
    let visible = 0;
    for (const row of openState.rows) {
      row.hidden = needle !== "" && !searchTextOf(row._option).includes(needle);
      if (!row.hidden) visible += 1;
    }
    for (const group of openState.groups) group.heading.hidden = !group.rows.some((row) => !row.hidden);
    openState.empty.hidden = visible !== 0;
    if (openState.rows[openState.active]?.hidden) {
      openState.rows[openState.active]?.classList.remove("active");
      openState.active = -1;
    }
    if (openState.active < 0) activate(openState.rows.findIndex((row) => !row.hidden && !row._disabled));
  }

  /** Put the menu under (or above) the button. Works whatever page zoom the site uses, by measuring how far a move really goes. */
  function place(pop, button) {
    pop.style.left = "0px"; pop.style.top = "0px"; pop.style.minWidth = "0px";
    const r0 = pop.getBoundingClientRect();
    pop.style.left = "100px"; pop.style.top = "100px";
    const r1 = pop.getBoundingClientRect();
    const scale = (r1.left - r0.left) / 100 || 1;
    const b = button.getBoundingClientRect();
    pop.style.minWidth = `${b.width / scale}px`;
    pop.style.maxHeight = `${Math.max(160, Math.min(320 * scale, window.innerHeight * 0.5)) / scale}px`;
    const h = pop.getBoundingClientRect().height;
    const roomBelow = window.innerHeight - b.bottom - 8;
    const below = roomBelow >= h || roomBelow >= b.top - 8;
    const top = below ? b.bottom + 6 : b.top - h - 6;
    const width = pop.getBoundingClientRect().width;
    const left = Math.min(Math.max(8, b.left), Math.max(8, window.innerWidth - width - 8));
    pop.style.left = `${(left - r0.left) / scale}px`;
    pop.style.top = `${(Math.max(8, top) - r0.top) / scale}px`;
  }

  function activate(index) {
    if (!openState || index < 0) return;
    openState.rows[openState.active]?.classList.remove("active");
    openState.active = index;
    const row = openState.rows[index];
    row?.classList.add("active");
    row?.scrollIntoView({ block: "nearest" });
  }

  function step(direction) {
    const { rows } = openState;
    let i = openState.active;
    for (let n = 0; n < rows.length; n += 1) {
      i = (i + direction + rows.length) % rows.length;
      if (!rows[i].hidden && !rows[i]._disabled) return activate(i);
    }
  }

  function typeAhead(key) {
    if (!openState) return;
    clearTimeout(openState.timer);
    openState.buffer += key.toLowerCase();
    openState.timer = setTimeout(() => { if (openState) openState.buffer = ""; }, 700);
    const rows = openState.rows;
    const from = openState.buffer.length > 1 ? openState.active : openState.active + 1;
    for (let n = 0; n < rows.length; n += 1) {
      const i = (from + n + rows.length) % rows.length;
      if (!rows[i].hidden && !rows[i]._disabled && labelOf(rows[i]._option).toLowerCase().startsWith(openState.buffer)) return activate(i);
    }
  }

  function onPopKey(event) {
    if (!openState) return;
    if (event.target === openState.search && !["ArrowDown", "ArrowUp", "Home", "End", "Enter", "Escape", "Tab"].includes(event.key)) return;
    const visible = (row) => !row.hidden && !row._disabled;
    const lastVisible = () => {
      for (let i = openState.rows.length - 1; i >= 0; i -= 1) if (visible(openState.rows[i])) return i;
      return -1;
    };
    const keys = { ArrowDown: () => step(1), ArrowUp: () => step(-1), Home: () => activate(openState.rows.findIndex(visible)), End: () => activate(lastVisible()) };
    if (keys[event.key]) { event.preventDefault(); keys[event.key](); }
    else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(openState.active); }
    else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); const { select } = openState; closePop(); state.get(select)?.button.focus(); }
    else if (event.key === "Tab") closePop();
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) typeAhead(event.key);
  }

  function choose(index) {
    if (!openState || index < 0) return;
    const row = openState.rows[index];
    if (!row || row._disabled) return;
    const { select } = openState;
    const changed = select.value !== row._option.value || select.selectedIndex !== row._option.index;
    closePop();
    state.get(select)?.button.focus();
    if (!changed) return;
    select.selectedIndex = row._option.index;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function closePop() {
    if (!openState) return;
    clearTimeout(openState.timer);
    openState.pop.remove();
    state.get(openState.select)?.wrap.classList.remove("open");
    state.get(openState.select)?.button.setAttribute("aria-expanded", "false");
    openState = null;
  }

  document.addEventListener("pointerdown", (event) => { if (openState && !openState.pop.contains(event.target) && !state.get(openState.select)?.wrap.contains(event.target)) closePop(); }, true);
  window.addEventListener("resize", closePop);
  window.addEventListener("scroll", (event) => { if (openState && !openState.pop.contains(event.target)) closePop(); }, true);

  // `select.value = x` and `select.selectedIndex = n` in a site's own code must update the custom button too.
  for (const property of ["value", "selectedIndex"]) {
    const original = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, property);
    if (!original?.set) continue;
    Object.defineProperty(HTMLSelectElement.prototype, property, { ...original, set(next) { original.set.call(this, next); refresh(this); } });
  }

  const scan = (root) => {
    if (root instanceof HTMLSelectElement) enhance(root);
    else if (root instanceof Element) root.querySelectorAll("select").forEach(enhance);
  };
  new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach(scan);
      record.removedNodes.forEach((node) => {
        if (openState && node instanceof Element && (node === openState.select || node.contains(openState.select))) closePop();
      });
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
  const start = () => scan(document.body);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
