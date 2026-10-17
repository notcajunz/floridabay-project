import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { C, UserError, card, humanize, mention, pages, respond, roleMention, ts } from "./util.js";
import { db } from "./store.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const resourcesRoot = path.join(repoRoot, "server-data/resources");
const vehicleRoot = path.join(resourcesRoot, "[vehicles]");
const eupRoot = process.env.FBRP_EUP_DIR || path.join(resourcesRoot, "[eup]");

const clean = (value) => String(value ?? "").replace(/[`*~>|]/g, "").trim();
const xmlValue = (body, name) => body.match(new RegExp(`<${name}(?:\\s[^>]*)?>([^<]*)</${name}>`, "i"))?.[1]?.trim() || null;
const numberValue = (body, name) => {
  const match = body.match(new RegExp(`<${name}[^>]*value=["']([^"']+)["']`, "i"));
  return match ? Number(match[1]) : null;
};

/** GTA/FiveM's case-insensitive Jenkins one-at-a-time model hash. */
export function joaat(value) {
  let hash = 0;
  for (const byte of Buffer.from(String(value).toLowerCase(), "utf8")) {
    hash = (hash + byte) >>> 0;
    hash = (hash + ((hash << 10) >>> 0)) >>> 0;
    hash = (hash ^ (hash >>> 6)) >>> 0;
  }
  hash = (hash + ((hash << 3) >>> 0)) >>> 0;
  hash = (hash ^ (hash >>> 11)) >>> 0;
  return (hash + ((hash << 15) >>> 0)) >>> 0;
}

const signedHash = (hash) => (hash > 0x7fffffff ? hash - 0x100000000 : hash);
const hashText = (hash) => `${hash} · ${signedHash(hash)} · 0x${hash.toString(16).toUpperCase().padStart(8, "0")}`;

let catalogCache = null;

async function vehicleCatalog() {
  if (catalogCache) return catalogCache;
  const rows = [];
  let resources = [];
  try {
    resources = await readdir(vehicleRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const entry of resources) {
    if (!entry.isDirectory()) continue;
    const resource = entry.name;
    const metaPath = path.join(vehicleRoot, resource, "data/vehicles.meta");
    let xml;
    try {
      xml = await readFile(metaPath, "utf8");
    } catch {
      continue;
    }
    const itemBodies = [...xml.matchAll(/<Item\b[^>]*>([\s\S]*?)<\/Item>/gi)].map((match) => match[1]);
    for (const body of itemBodies) {
      const model = xmlValue(body, "modelName");
      if (!model) continue;
      rows.push({
        model,
        hash: joaat(model),
        gameName: xmlValue(body, "gameName"),
        handlingId: xmlValue(body, "handlingId"),
        vehicleClass: xmlValue(body, "vehicleClass")?.replace(/^VC_/, ""),
        audio: xmlValue(body, "audioNameHash"),
        layout: xmlValue(body, "layout"),
        resource,
      });
    }

    // Handling values are useful context, and the handling ID joins them to vehicles.meta.
    try {
      const handling = await readFile(path.join(vehicleRoot, resource, "data/handling.meta"), "utf8");
      for (const body of [...handling.matchAll(/<Item\b[^>]*type=["']CHandlingData["'][^>]*>([\s\S]*?)<\/Item>/gi)].map((match) => match[1])) {
        const id = xmlValue(body, "handlingName");
        const vehicle = rows.find((row) => row.resource === resource && row.handlingId?.toLowerCase() === id?.toLowerCase());
        if (!vehicle) continue;
        vehicle.mass = numberValue(body, "fMass");
        vehicle.driveBiasFront = numberValue(body, "fDriveBiasFront");
        vehicle.maxFlatVelocity = numberValue(body, "fInitialDriveMaxFlatVel");
      }
    } catch {
      // A resource may intentionally rely on base-game handling.
    }
  }
  catalogCache = rows;
  return rows;
}

function numericHash(query) {
  const raw = query.trim();
  let value = null;
  if (/^0x[0-9a-f]{1,8}$/i.test(raw)) value = Number.parseInt(raw.slice(2), 16);
  else if (/^-?\d{1,11}$/.test(raw)) value = Number(raw);
  if (!Number.isSafeInteger(value) || value < -2147483648 || value > 4294967295) return null;
  return value >>> 0;
}

const drivetrain = (bias) => bias === null || bias === undefined ? null : bias >= 0.99 ? "FWD" : bias <= 0.01 ? "RWD" : "AWD";

export async function vehicle(i) {
  await i.deferReply();
  const query = clean(i.options.getString("query", true)).slice(0, 80);
  const lowered = query.toLowerCase();
  const wantedHash = numericHash(query);
  const catalog = await vehicleCatalog();
  const personals = await db.query(
    `SELECT p.*,COUNT(DISTINCT tr.discord_id) trusted_count,COUNT(DISTINCT pt.tag_id) tag_count
       FROM personal_vehicles p
       LEFT JOIN personal_vehicle_trust tr ON tr.personal_id=p.id
       LEFT JOIN personal_vehicle_tags pt ON pt.personal_id=p.id
      GROUP BY p.id ORDER BY p.id`,
  );
  const candidates = new Map();
  for (const row of catalog) candidates.set(row.model.toLowerCase(), { ...row, personals: [] });
  for (const personal of personals) {
    const key = String(personal.model).toLowerCase();
    const row = candidates.get(key) || { model: personal.model, hash: joaat(personal.model), resource: null, personals: [] };
    row.personals.push(personal);
    candidates.set(key, row);
  }
  const exact = [...candidates.values()].filter((row) =>
    (wantedHash !== null && row.hash === wantedHash) ||
    [row.model, row.gameName, row.handlingId, row.resource].some((value) => value?.toLowerCase() === lowered) ||
    row.personals.some((p) => String(p.id) === lowered || p.label?.toLowerCase() === lowered || p.plate?.toLowerCase() === lowered),
  );
  const partial = exact.length ? [] : [...candidates.values()].filter((row) =>
    [row.model, row.gameName, row.handlingId, row.resource, ...row.personals.flatMap((p) => [p.label, p.plate])]
      .some((value) => value?.toLowerCase().includes(lowered)),
  );
  const matches = exact.length ? exact : partial;
  if (!matches.length) throw new UserError(`No installed or personal vehicle matched **${query}**. Try its spawn code, model hash, label, plate, personal ID, or resource name.`);
  if (matches.length > 1) {
    const lines = matches.slice(0, 25).map((row) => `• **${clean(row.personals[0]?.label || row.gameName || row.model)}** — \`${row.model}\` · \`0x${row.hash.toString(16).toUpperCase().padStart(8, "0")}\``);
    return respond(i, { embeds: [card(`🚗 ${matches.length} vehicle matches`, { description: `${lines.join("\n")}${matches.length > 25 ? `\n…and ${matches.length - 25} more.` : ""}`, footer: "Use the exact spawn code or hash to narrow this down" })] });
  }
  const row = matches[0];
  const personalLines = row.personals.map((p) => `#${p.id} · **${clean(p.label)}** · owner ${mention(p.owner_id)} · plate \`${p.plate || `PV${String(p.id).padStart(5, "0")}`}\` · ${Number(p.enabled) ? "enabled" : "disabled"} · ${Number(p.bulletproof) ? "bulletproof" : "standard"} · ${Number(p.trusted_count)} trusted · ${Number(p.tag_count)} tag lock(s)`);
  return respond(i, {
    embeds: [card(`🚗 ${clean(row.personals[0]?.label || row.gameName || row.model)}`, {
      fields: [
        ["Spawn code", `\`${row.model}\``],
        ["Model hash", `\`${hashText(row.hash)}\``, false],
        row.vehicleClass ? ["Class", humanize(row.vehicleClass)] : null,
        row.handlingId ? ["Handling ID", `\`${row.handlingId}\``] : null,
        row.audio ? ["Engine audio", `\`${row.audio}\``] : null,
        drivetrain(row.driveBiasFront) ? ["Drivetrain", drivetrain(row.driveBiasFront)] : null,
        Number.isFinite(row.mass) ? ["Mass", `${row.mass.toLocaleString()} kg`] : null,
        Number.isFinite(row.maxFlatVelocity) ? ["Handling max velocity", String(row.maxFlatVelocity)] : null,
        row.resource ? ["Resource", `\`${row.resource}\``, false] : null,
        personalLines.length ? ["Personal vehicle records", personalLines.join("\n"), false] : null,
      ],
    })],
  });
}

async function personalRows(ownerId) {
  return db.query(
    `SELECT p.*,
            GROUP_CONCAT(DISTINCT tr.discord_id ORDER BY tr.discord_id SEPARATOR ',') trusted_ids,
            GROUP_CONCAT(DISTINCT CONCAT(t.id, ':', t.label) ORDER BY t.label SEPARATOR '\\n') tag_names
       FROM personal_vehicles p
       LEFT JOIN personal_vehicle_trust tr ON tr.personal_id=p.id
       LEFT JOIN personal_vehicle_tags pt ON pt.personal_id=p.id
       LEFT JOIN headtags t ON t.id=pt.tag_id
      WHERE p.owner_id=? GROUP BY p.id ORDER BY p.label,p.id`,
    [ownerId],
  );
}

export async function personals(i) {
  await i.deferReply();
  const user = i.options.getUser("user", true);
  const rows = await personalRows(user.id);
  if (!rows.length) throw new UserError(`${user} does not own any personal vehicles.`);
  const lines = rows.map((row) => {
    const trusted = String(row.trusted_ids || "").split(",").filter(Boolean).map(mention);
    const tags = String(row.tag_names || "").split("\n").filter(Boolean).map((tag) => `#${tag.replace(":", " · ")}`);
    const hash = joaat(row.model);
    return [
      `**#${row.id} · ${clean(row.label)}** ${Number(row.enabled) ? "🟢" : "🔴"}${Number(row.bulletproof) ? " · 🛡️ bulletproof" : ""}`,
      `↳ spawn \`${row.model}\` · hash \`${hash}\` · plate \`${row.plate || `PV${String(row.id).padStart(5, "0")}`}\``,
      `↳ trusted: ${trusted.join(", ") || "none"} · tags: ${tags.join(", ") || "none"}`,
    ].join("\n");
  });
  const embeds = pages(lines, 3800).slice(0, 10).map((description, index, all) => card(`🚘 ${user.username}'s personals${all.length > 1 ? ` · ${index + 1}/${all.length}` : ""}`, { color: C.blue, description, footer: `${rows.length} owned personal vehicle${rows.length === 1 ? "" : "s"}` }));
  return respond(i, { embeds });
}

/* ------------------------------------------------------------------ custom EUP */

/** Custom EUP packs with what the installer recorded about each one (clothing groups, addon peds, security verdict). */
async function eupRows() {
  const rows = await db.query("SELECT * FROM custom_eup ORDER BY label,id");
  return Promise.all(rows.map(async (row) => {
    const resource = `fbrp_eup_${row.name}`;
    const marker = JSON.parse((await readFile(path.join(eupRoot, resource, ".fbrp-eup.json"), "utf8").catch(() => "null")) || "null");
    return { ...row, resource, installed: Boolean(marker), groups: marker?.groups || [], addonPeds: marker?.addonPeds || [], verdict: marker?.security?.verdict || null };
  }));
}

const eupSearchFields = (row) => [row.label, row.name, row.resource, ...row.groups.map((g) => g.dlc), ...row.addonPeds];

/** Packs matching a lookup: an ID, or text that equals (preferred) or is part of a name, label, resource, pack name or addon ped. */
export function eupMatches(rows, query) {
  const lowered = String(query).toLowerCase().trim().replace(/^#/, "");
  if (!lowered) return [];
  const exact = rows.filter((row) => String(row.id) === lowered || eupSearchFields(row).some((value) => value && String(value).toLowerCase() === lowered));
  if (exact.length) return exact;
  return rows.filter((row) => eupSearchFields(row).some((value) => value && String(value).toLowerCase().includes(lowered)));
}

const bytesText = (bytes) => `${(Number(bytes) / 1048576).toFixed(Number(bytes) > 10485760 ? 0 : 1)} MB`;
const pedText = (ped) => (ped === "mp_f_freemode_01" ? "female" : "male");

/** One line per pack for lists. */
export function eupLine(row) {
  const items = row.groups.reduce((sum, g) => sum + g.drawables + g.props, 0);
  return `**#${row.id} · ${clean(row.label)}** ${row.installed ? "🟢" : "🔴 files missing"}\n↳ \`${row.resource}\` · ${row.file_count} file${Number(row.file_count) === 1 ? "" : "s"} · ${bytesText(row.size_bytes)}${items ? ` · ${items} clothing item${items === 1 ? "" : "s"}` : ""}${row.addonPeds.length ? ` · ${row.addonPeds.length} addon ped${row.addonPeds.length === 1 ? "" : "s"}` : ""} · added by ${row.created_by ? mention(row.created_by) : "unknown"} ${ts(row.created_at, "d")}`;
}

export async function eupLookup(i) {
  await i.deferReply();
  const query = clean(i.options.getString("query", true)).slice(0, 80);
  const matches = eupMatches(await eupRows(), query);
  if (!matches.length) throw new UserError(`No custom EUP pack matched **${query}**. Try its name, label, resource, pack ID, clothing pack name or addon ped.`);
  if (matches.length > 1)
    return respond(i, { embeds: [card(`👕 ${matches.length} EUP matches`, { description: `${matches.slice(0, 15).map(eupLine).join("\n")}${matches.length > 15 ? `\n…and ${matches.length - 15} more.` : ""}`, footer: "Use the pack ID or the exact name to narrow this down" })] });
  const row = matches[0];
  const groups = row.groups.map((g) => `${pedText(g.ped)} · ${g.dlc ? `\`${g.dlc}\`` : "replaces base game"} · ${g.drawables + g.props} item${g.drawables + g.props === 1 ? "" : "s"}, ${g.textures} texture${g.textures === 1 ? "" : "s"}${g.meta === "generated" ? " · basic shop meta" : ""}${g.dlc && !g.ymt ? " · no creature metadata" : ""}`);
  return respond(i, { embeds: [card(`👕 ${clean(row.label)}`, {
    fields: [
      ["Pack ID", `#${row.id}`],
      ["Resource", `\`${row.resource}\``],
      ["Status", row.installed ? "🟢 Installed" : "🔴 Files missing on the server"],
      ["Files", `${row.file_count} · ${bytesText(row.size_bytes)}`],
      ["Security scan", row.verdict ? humanize(row.verdict) : "Not recorded"],
      ["Added by", row.created_by ? mention(row.created_by) : "Unknown"],
      ["Added", ts(row.created_at)],
      ["Updated", ts(row.updated_at)],
      row.notes ? ["Notes", clean(row.notes), false] : null,
      groups.length ? ["Clothing in the vMenu appearance menu", groups.join("\n"), false] : null,
      row.addonPeds.length ? ["Addon peds", row.addonPeds.map((n) => `\`${n}\``).join(" "), false] : null,
    ],
  })] });
}

export async function eupAdded(i) {
  await i.deferReply();
  const user = i.options.getUser("user", true);
  const rows = (await eupRows()).filter((row) => String(row.created_by) === user.id);
  if (!rows.length) throw new UserError(`${user} has not added any custom EUP packs.`);
  const embeds = pages(rows.map(eupLine), 3800).slice(0, 10).map((description, index, all) => card(`👕 ${user.username}'s EUP packs${all.length > 1 ? ` · ${index + 1}/${all.length}` : ""}`, { color: C.purple, description, footer: `${rows.length} EUP pack${rows.length === 1 ? "" : "s"} added` }));
  return respond(i, { embeds });
}

export async function eupList(i) {
  await i.deferReply();
  const rows = await eupRows();
  if (!rows.length) throw new UserError("No custom EUP packs are installed yet.");
  const embeds = pages(rows.map(eupLine), 3800).slice(0, 10).map((description, index, all) => card(`👕 Custom EUP${all.length > 1 ? ` · ${index + 1}/${all.length}` : ""}`, { color: C.purple, description, footer: `${rows.length} EUP pack${rows.length === 1 ? "" : "s"}` }));
  return respond(i, { embeds });
}

async function resolveTag(query) {
  const raw = clean(query).slice(0, 80);
  const id = /^#?\d+$/.test(raw) ? Number(raw.replace("#", "")) : 0;
  if (id) return db.one("SELECT t.*,o.name org_name FROM headtags t LEFT JOIN organizations o ON o.id=t.org_id WHERE t.id=?", [id]);
  const exact = await db.query("SELECT t.*,o.name org_name FROM headtags t LEFT JOIN organizations o ON o.id=t.org_id WHERE LOWER(t.label)=LOWER(?) ORDER BY t.priority DESC,t.id", [raw]);
  if (exact.length === 1) return exact[0];
  const partial = await db.query("SELECT t.*,o.name org_name FROM headtags t LEFT JOIN organizations o ON o.id=t.org_id WHERE t.label LIKE ? ORDER BY t.priority DESC,t.label LIMIT 11", [`%${raw}%`]);
  if (partial.length === 1) return partial[0];
  if (!partial.length) return null;
  throw new UserError(`More than one tag matched **${raw}**: ${partial.slice(0, 10).map((tag) => `\`#${tag.id}\` ${clean(tag.label)}`).join(", ")}. Use its ID.`);
}

export async function headtagInfo(i) {
  await i.deferReply();
  const tag = await resolveTag(i.options.getString("tag", true));
  if (!tag) throw new UserError("No headtag matched that ID or name.");
  const holders = await db.query("SELECT discord_id,GROUP_CONCAT(origin ORDER BY origin SEPARATOR ', ') origins,MIN(added_at) added_at FROM headtag_grants WHERE tag_id=? GROUP BY discord_id ORDER BY added_at", [tag.id]);
  const holderText = holders.length
    ? holders.map((row) => `${mention(row.discord_id)} · ${clean(row.origins)} · ${ts(row.added_at, "d")}`).join("\n")
    : "No one";
  return respond(i, { embeds: [card(`🏷️ #${tag.id} · ${clean(tag.label)}`, {
    color: Number.parseInt(String(tag.color || "#43E8D8").slice(1), 16) || C.teal,
    fields: [
      ["Type", tag.kind === "both" ? "Head + gang" : humanize(tag.kind)],
      ["Status", Number(tag.enabled) ? "Enabled" : "Disabled"],
      ["Color", `\`${tag.color}\``],
      ["Priority", String(tag.priority)],
      ["Chat tag", Number(tag.chat_tag) ? "Yes" : "No"],
      tag.org_name ? ["Organization", clean(tag.org_name)] : null,
      tag.role_id ? ["Discord role", `${roleMention(tag.role_id)} · \`${tag.role_id}\``, false] : null,
      ["Owners / holders", holderText, false],
      ["Created by", tag.created_by ? mention(tag.created_by) : "Unknown"],
      ["Created", tag.created_at ? ts(new Date(tag.created_at).getTime()) : "Unknown"],
    ],
    footer: `${holders.length} owner${holders.length === 1 ? "" : "s"} / holder${holders.length === 1 ? "" : "s"}`,
  })] });
}

export async function headtagsOwned(i) {
  await i.deferReply();
  const user = i.options.getUser("user", true);
  const rows = await db.query(
    `SELECT t.*,o.name org_name,GROUP_CONCAT(g.origin ORDER BY g.origin SEPARATOR ', ') origins,MIN(g.added_at) added_at,
            (s.headtag_id=t.id) selected_head,(s.gangtag_id=t.id) selected_gang,(s.chat_tag_id=t.id) selected_chat
       FROM headtag_grants g
       JOIN headtags t ON t.id=g.tag_id
       LEFT JOIN organizations o ON o.id=t.org_id
       LEFT JOIN player_tag_selection s ON s.discord_id=g.discord_id
      WHERE g.discord_id=? GROUP BY t.id ORDER BY t.kind,t.priority DESC,t.label`,
    [user.id],
  );
  if (!rows.length) throw new UserError(`${user} does not own any tags.`);
  const lines = rows.map((row) => {
    const selected = [row.selected_head ? "head" : null, row.selected_gang ? "gang" : null, row.selected_chat ? "chat" : null].filter(Boolean);
    return `**#${row.id} · ${clean(row.label)}** · ${row.kind === "both" ? "head + gang" : row.kind} · \`${row.color}\` · ${Number(row.enabled) ? "enabled" : "disabled"}${row.org_name ? `\n↳ ${clean(row.org_name)}` : ""} · via ${clean(row.origins)}${selected.length ? ` · selected: ${selected.join(", ")}` : ""}`;
  });
  const embeds = pages(lines, 3800).slice(0, 10).map((description, index, all) => card(`🏷️ ${user.username}'s tags${all.length > 1 ? ` · ${index + 1}/${all.length}` : ""}`, { color: C.purple, description, footer: `${rows.length} owned tag${rows.length === 1 ? "" : "s"}` }));
  return respond(i, { embeds });
}

export async function autocomplete(i) {
  const value = clean(i.options.getFocused()).toLowerCase();
  if (i.commandName === "eup") {
    const rows = (await eupRows()).filter((row) => !value || eupSearchFields(row).some((field) => field && String(field).toLowerCase().includes(value)) || String(row.id) === value.replace(/^#/, ""));
    return i.respond(rows.slice(0, 25).map((row) => ({ name: `${row.label} · ${row.resource}`.slice(0, 100), value: row.name })));
  }
  if (i.commandName === "vehicle") {
    const [catalog, personals] = await Promise.all([vehicleCatalog(), db.query("SELECT id,model,label,plate FROM personal_vehicles ORDER BY label")]);
    const choices = new Map();
    for (const row of catalog) choices.set(row.model.toLowerCase(), { name: `${row.gameName || row.model} · ${row.model}`, value: row.model });
    for (const row of personals) choices.set(String(row.model).toLowerCase(), { name: `${row.label} · ${row.model}${row.plate ? ` · ${row.plate}` : ""}`, value: row.model });
    return i.respond([...choices.values()].filter((choice) => choice.name.toLowerCase().includes(value) || choice.value.toLowerCase().includes(value)).slice(0, 25));
  }
  const rows = await db.query("SELECT id,label,kind FROM headtags WHERE label LIKE ? OR CAST(id AS CHAR) LIKE ? ORDER BY enabled DESC,priority DESC,label LIMIT 25", [`%${value}%`, `${value.replace(/^#/, "")}%`]);
  return i.respond(rows.map((row) => ({ name: `#${row.id} · ${row.label} · ${row.kind}`.slice(0, 100), value: String(row.id) })));
}
