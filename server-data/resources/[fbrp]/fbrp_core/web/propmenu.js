/* Property setup menu (opened with /propmenu) and the door lock prompt (E at a door). */
(() => {
  const resource = typeof GetParentResourceName === "function" ? GetParentResourceName() : "fbrp_core";
  const send = (action, body = {}) =>
    fetch(`https://${resource}/propmenuAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...body }),
    }).catch(() => null);

  const SPOT_TEXT = {
    door: "Centre of a door scan. Doors within 12 m of it are locked for the property.",
    door2: "A second door scan centre, for a rear or side entrance.",
    door3: "A third door scan centre.",
    terminal: "The business terminal where members work a shift.",
    bar: "Where drinks are served to customers.",
    stash: "The hideout stash. It replaces the terminal at a hideout.",
    armory: "Opens the organization armory.",
    wardrobe: "Opens the organization wardrobe.",
  };
  const STATUS_TEXT = { ready: "Set up", pending: "Pending DevOps", unowned: "Not owned" };

  /* ------------------------------------------------------------ door prompt */
  const prompt = document.createElement("div");
  prompt.id = "door-prompt";
  prompt.innerHTML = `
    <span class="dp-icon">
      <svg class="dp-shut" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
      <svg class="dp-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/></svg>
    </span>
    <span class="dp-state"></span>
    <span class="dp-key"><kbd>E</kbd><span class="dp-verb"></span></span>`;
  document.body.appendChild(prompt);
  const promptState = prompt.querySelector(".dp-state");
  const promptVerb = prompt.querySelector(".dp-verb");

  function showPrompt(data) {
    prompt.classList.toggle("on", Boolean(data.show));
    if (!data.show) return;
    prompt.classList.toggle("unlocked", !data.locked);
    prompt.classList.toggle("usable", Boolean(data.usable));
    promptState.textContent = data.locked ? "Locked" : "Unlocked";
    promptVerb.textContent = data.locked ? "Unlock" : "Lock";
  }

  /* ------------------------------------------------------------ setup menu */
  const root = document.createElement("div");
  root.id = "propmenu";
  document.body.appendChild(root);

  let data = null;
  let tab = "props";
  let selected = null;     // property key
  let station = null;      // station label, or "__other"
  let search = "";
  let otherName = "";

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (label, className, onClick) => {
    const node = el("button", `pm-btn ${className || ""}`, label);
    node.type = "button";
    node.addEventListener("click", onClick);
    return node;
  };

  function close() {
    send("close");
  }

  function render() {
    root.replaceChildren();
    if (!data) return;
    const shell = el("div", "pm-shell");
    const head = el("header");
    head.append(el("h2", "", "Property setup"));
    const tabs = el("div", "pm-tabs");
    if (data.canProps) tabs.append(tabButton("props", "Properties"));
    if (data.canStations) tabs.append(tabButton("stations", "Police stations"));
    head.append(tabs, button("Close", "pm-close", close));
    shell.append(head);
    if (tab === "stations" && data.canStations) shell.append(stationsView());
    else if (data.canProps) shell.append(propertiesView());
    else shell.append(stationsView());
    root.append(shell);
  }

  function tabButton(id, label) {
    const node = el("button", `pm-tab${tab === id ? " on" : ""}`, label);
    node.type = "button";
    node.addEventListener("click", () => { tab = id; render(); });
    return node;
  }

  /* ---- properties */
  function propertiesView() {
    const body = el("div", "pm-body");
    const side = el("div", "pm-side");
    const input = el("input");
    input.type = "search";
    input.placeholder = "Search properties or owners";
    input.value = search;
    input.addEventListener("input", () => { search = input.value; renderList(list); });
    const list = el("div", "pm-list");
    side.append(input, list);
    renderList(list);
    const main = el("div", "pm-main");
    main.id = "pm-prop-main";
    body.append(side, main);
    renderProperty(main);
    return body;
  }

  function renderList(list) {
    list.replaceChildren();
    const query = search.trim().toLowerCase();
    const rows = data.props.filter((p) => !query || p.label.toLowerCase().includes(query) || (p.owner || "").toLowerCase().includes(query));
    if (!rows.length) list.append(el("div", "pm-empty", "No properties match."));
    for (const prop of rows) {
      const item = el("button", `pm-item${prop.key === selected ? " on" : ""}`);
      item.type = "button";
      const label = el("b", "", prop.label);
      const meta = el("small", "", `${STATUS_TEXT[prop.status]}${prop.owner ? ` · ${prop.owner}` : ""} · ${prop.distance} m`);
      item.append(label, meta);
      item.addEventListener("click", () => {
        selected = prop.key;
        renderList(list);
        const main = document.getElementById("pm-prop-main");
        if (main) renderProperty(main);
      });
      list.append(item);
    }
  }

  function renderProperty(main) {
    main.replaceChildren();
    const prop = data.props.find((p) => p.key === selected);
    if (!prop) {
      main.append(el("div", "pm-empty", "Pick a property on the left. The nearest are listed first."));
      return;
    }
    main.append(el("h3", "", prop.label));
    const line = el("div", "pm-sub");
    const pill = el("span", `pm-pill ${prop.status}`, STATUS_TEXT[prop.status]);
    line.append(pill, document.createTextNode(`  ${prop.owner ? `Owned by ${prop.owner}` : "Nobody owns it"} · ${prop.distance} m away`));
    main.append(line);
    const actions = el("div", "pm-actions");
    actions.append(
      button("Set waypoint", "small", () => send("waypoint", { x: prop.x, y: prop.y })),
      button("Show doors for 20 s", "small", () => send("showdoors")),
    );
    main.append(actions);

    main.append(el("h4", "", "Spots"));
    for (const name of data.pointOrder) {
      const placed = Boolean(prop.spots[name]);
      const row = el("div", "pm-row");
      const text = el("div", "grow");
      text.append(el("b", "", name), el("small", "", `${placed ? "Placed. " : "Not placed. "}${SPOT_TEXT[name] || ""}`));
      row.append(text, button(placed ? "Move here" : "Place here", "small primary", () => send("setpoint", { key: prop.key, point: name })));
      if (placed) row.append(button("Clear", "small danger", () => send("clearpoint", { key: prop.key, point: name })));
      main.append(row);
    }

    main.append(el("h4", "", "Doors"));
    main.append(el("div", "pm-sub", "Doors are found automatically around the door spots. Stand next to a door to fix a mistake."));
    const doorActions = el("div", "pm-actions");
    doorActions.append(
      button("Lock the nearest door object", "small primary", () => send("adddoor", { key: prop.key })),
      button("Free the nearest scanned door", "small", () => send("excludedoor", { key: prop.key })),
    );
    main.append(doorActions);
    for (const fix of prop.corrections) {
      const row = el("div", "pm-row");
      const text = el("div", "grow");
      text.append(el("b", "", fix.kind === "include" ? "Added door" : "Freed door"), el("small", "", `model ${fix.model} · ${fix.x.toFixed(1)}, ${fix.y.toFixed(1)}, ${fix.z.toFixed(1)}`));
      row.append(text, button("Remove", "small danger", () => send("removecorrection", { id: fix.id })));
      main.append(row);
    }

    main.append(el("div", "pm-note", prop.status === "pending"
      ? "Finish placing the spots, then mark this property as set up with the button on its message in the DevOps property channel. The organization cannot use it until then."
      : "Set up is marked from the DevOps property channel in Discord."));
  }

  /* ---- police stations */
  function stationsView() {
    const body = el("div", "pm-body");
    const side = el("div", "pm-side");
    const list = el("div", "pm-list");
    if (!station && data.stations.length) station = data.stations[0].label;
    for (const entry of data.stations) {
      const count = data.stationDoors.filter((d) => d.station === entry.label).length;
      const item = el("button", `pm-item${station === entry.label ? " on" : ""}`);
      item.type = "button";
      item.append(el("b", "", entry.label), el("small", "", `${count} door${count === 1 ? "" : "s"} · ${entry.distance} m`));
      item.addEventListener("click", () => { station = entry.label; render(); });
      list.append(item);
    }
    const other = el("button", `pm-item${station === "__other" ? " on" : ""}`);
    other.type = "button";
    other.append(el("b", "", "Other police building"), el("small", "", "Name it yourself"));
    other.addEventListener("click", () => { station = "__other"; render(); });
    list.append(other);
    side.append(el("div", "pm-sub", "Police stations"), list);
    side.firstChild.style.padding = "14px 14px 4px";

    const main = el("div", "pm-main");
    const name = station === "__other" ? otherName.trim() : station;
    main.append(el("h3", "", station === "__other" ? "Other police building" : station || "Police stations"));
    main.append(el("div", "pm-sub", "Doors added here start locked and only answer to law enforcement who are clocked in."));
    if (station === "__other") {
      const input = el("input", "pm-text");
      input.placeholder = "Building name";
      input.maxLength = 60;
      input.value = otherName;
      input.addEventListener("input", () => { otherName = input.value; });
      main.append(input);
    }
    const actions = el("div", "pm-actions");
    actions.append(button("Add the door next to me", "primary", () => {
      const label = station === "__other" ? otherName.trim() : station;
      if (!label) return;
      send("stationadd", { station: label });
    }));
    actions.append(button("Show doors for 20 s", "", () => send("showdoors")));
    main.append(actions);
    main.append(el("h4", "", "Doors on this building"));
    const rows = data.stationDoors.filter((d) => d.station === name);
    if (!rows.length) main.append(el("div", "pm-empty", "No doors yet. Stand next to a door and add it."));
    for (const door of rows) {
      const row = el("div", "pm-row");
      const text = el("div", "grow");
      text.append(el("b", "", `Door #${door.id}`), el("small", "", `${door.x.toFixed(1)}, ${door.y.toFixed(1)}, ${door.z.toFixed(1)} · ${door.distance} m away`));
      row.append(text, button("Remove", "small danger", () => send("stationremove", { id: door.id })));
      main.append(row);
    }
    const everywhere = data.stationDoors.filter((d) => d.station !== name);
    if (everywhere.length) {
      main.append(el("h4", "", "Doors on other buildings"));
      for (const door of everywhere) {
        const row = el("div", "pm-row");
        const text = el("div", "grow");
        text.append(el("b", "", door.station), el("small", "", `Door #${door.id} · ${door.distance} m away`));
        row.append(text, button("Remove", "small danger", () => send("stationremove", { id: door.id })));
        main.append(row);
      }
    }
    body.append(side, main);
    return body;
  }

  function apply(message) {
    if (!message.open) {
      root.classList.remove("open");
      data = null;
      return;
    }
    const wasOpen = root.classList.contains("open");
    data = message.data;
    if (!wasOpen) {
      tab = data.canProps ? "props" : "stations";
      selected = message.select && data.props.some((p) => p.key === message.select) ? message.select : (data.props[0] && data.props[0].key) || null;
      if (message.select) tab = "props";
      search = "";
    } else if (selected && !data.props.some((p) => p.key === selected)) {
      selected = null;
    }
    root.classList.add("open");
    render();
  }

  window.addEventListener("message", ({ data: message }) => {
    if (!message || typeof message !== "object") return;
    if (message.type === "doorPrompt") showPrompt(message);
    else if (message.type === "propmenu") apply(message);
    else if (message.type === "reset") {
      showPrompt({ show: false });
      root.classList.remove("open");
      data = null;
    }
  });

  document.addEventListener("keyup", (event) => {
    if (event.key === "Escape" && root.classList.contains("open")) close();
  });
})();
