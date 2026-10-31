/**
 * Custom EUP packaging rules (pure functions, no I/O).
 *
 * FiveM clothing is found by file name. A freemode pack names its files
 *   <ped>_<dlc>^<component>_<nnn>_<u|r>.ydd         drawable (a trailing _1 marks its first-person alternate)
 *   <ped>_<dlc>^<component>_diff_<nnn>_<a-z>_<race>.ytd   texture
 *   <ped>_<dlc>^p_<prop>_<nnn>.ydd / p_<prop>_diff_<nnn>_<a-z>.ytd   props
 *   <ped>_<dlc>.ymt                               creature metadata of the pack
 * and ships a ShopPedApparel meta that names the pack. Without a <dlc> the same names replace the base game's
 * drawables. When the files are right, the vMenu character customization lists the clothing by itself because it
 * reads the drawable counts from the game. This module classifies a pack's files, reports what is wrong with them,
 * and applies the fixes that are safe to do by rule.
 */

export const PEDS = ["mp_m_freemode_01", "mp_f_freemode_01"];
export const COMPONENTS = ["head", "berd", "hair", "uppr", "lowr", "hand", "feet", "teef", "accs", "task", "decl", "jbib"];
export const PROPS = ["p_head", "p_eyes", "p_ears", "p_mouth", "p_lhand", "p_rhand", "p_lwrist", "p_rwrist", "p_hip", "p_lfoot", "p_rfoot"];
export const DLC_NAME = /^[a-z0-9_]{2,30}$/;
const PED = "mp_[mf]_freemode_01";
const COMP = COMPONENTS.join("|");
const PROP = PROPS.join("|");

/** Name patterns in lower case. `pre` is the optional `<ped>[_<dlc>]^` prefix, captured as ped and dlc. */
const PREFIX = `(?:(${PED})(?:_([a-z0-9_]+?))?\\^)?`;
const SHAPES = [
  { kind: "drawable", re: new RegExp(`^${PREFIX}(${COMP})_(\\d{3})_([ur])(_hi)?(_1)?\\.ydd$`), pick: (m) => ({ comp: m[3], index: Number(m[4]), variant: m[5], alt: Boolean(m[7]) }) },
  { kind: "texture", re: new RegExp(`^${PREFIX}(${COMP})_diff_(\\d{3})_([a-z])_([a-z]{3})\\.ytd$`), pick: (m) => ({ comp: m[3], index: Number(m[4]), variant: m[5] }) },
  { kind: "prop", re: new RegExp(`^${PREFIX}(${PROP})_(\\d{3})(_hi)?\\.ydd$`), pick: (m) => ({ comp: m[3], index: Number(m[4]), variant: "" }) },
  { kind: "proptexture", re: new RegExp(`^${PREFIX}(${PROP})_diff_(\\d{3})_([a-z])\\.ytd$`), pick: (m) => ({ comp: m[3], index: Number(m[4]), variant: m[5] }) },
];
const YMT = new RegExp(`^(${PED})_([a-z0-9_]+)\\.ymt$`);

/** Gender from folder or file names such as male/, [female], Women/ (null when there is no hint). */
export function genderHint(rel) {
  const parts = String(rel).toLowerCase().split(/[\\/]/).slice(0, -1).join("/");
  if (/(^|[^a-z])(female|woman|women|girl|fem)([^a-z]|$)/.test(parts) || /(^|[\\/\[_ -])f([\]_ -]|$)/.test(parts)) return "mp_f_freemode_01";
  if (/(^|[^a-z])(male|man|men|boy)([^a-z]|$)/.test(parts) || /(^|[\\/\[_ -])m([\]_ -]|$)/.test(parts)) return "mp_m_freemode_01";
  return null;
}

/**
 * What one stream file is. kind is drawable, texture, prop, proptexture, ymt, ped (an addon ped model file)
 * or other. style is dlc (ped_dlc^...), replace (ped^...) or bare (no ped prefix), for clothing only.
 */
export function classify(rel) {
  const path = String(rel).replaceAll("\\", "/");
  const name = path.split("/").pop();
  const lower = name.toLowerCase();
  const ymt = YMT.exec(lower);
  if (ymt) return { kind: "ymt", ped: ymt[1], dlc: ymt[2], name, rel: path };
  for (const shape of SHAPES) {
    const m = shape.re.exec(lower);
    if (!m) continue;
    const picked = shape.pick(m);
    const ped = m[1] || null;
    // Props ship as <ped>_p_<dlc>^p_head_000.ydd: the p_ marks the prop file set, the pack is still <dlc>.
    const propSet = (shape.kind === "prop" || shape.kind === "proptexture") && /^p_[a-z0-9_]+$/.test(m[2] || "");
    const dlc = propSet ? m[2].slice(2) : m[2] || null;
    return { kind: shape.kind, ped, dlc, style: ped ? (dlc ? "dlc" : "replace") : "bare", ...picked, hi: shape.kind !== "texture" && shape.kind !== "proptexture" && /_hi\.ydd$/.test(lower), name, rel: path };
  }
  return { kind: "other", name, rel: path };
}

/**
 * True for a dlc name that belongs to the base game's freemode clothing (mp_m_bikerdlc_01, mp_f_heist, ...).
 * A pack that declares one replaces GTA's own drawables at the numbers it uses (kutte and patch packs do this on
 * purpose), so its numbering and file names must be left exactly as the author made them. Not exhaustive:
 * anything with "dlc" in it, or one of the known base game collection names.
 */
export function isVanillaDlc(dlc) {
  const name = String(dlc || "").toLowerCase();
  return /^mp_[mf]_/.test(name) && (/dlc/.test(name) || /^mp_[mf]_(?:heist|hipster|lowrider|vinewood|xmas|christmas|valentines|executive|stunt|gunrunning|smuggler|beach|business|apartment|battle|arena|casino|chopper|assault|specialraces|truckfighter|summer|luxe|imponte|biker|tuner|fixer|bountyhunter)(?:_?\d+)?$/.test(name));
}

/** Name of a classified file with its ped and dlc (re)assigned, keeping the original case of the rest. */
export function withPrefix(entry, ped, dlc) {
  const bare = entry.name.includes("^") ? entry.name.slice(entry.name.indexOf("^") + 1) : entry.name;
  return `${ped}${dlc ? `_${dlc}` : ""}^${bare}`;
}

/** Image of a drawable's number with `index` replaced, e.g. jbib_003_u.ydd -> jbib_000_u.ydd. */
function renumbered(name, from, to) {
  const pad = (n) => String(n).padStart(3, "0");
  return name.replace(new RegExp(`(_(?:diff_)?)${pad(from)}(?=[_.])`, "i"), (_, lead) => `${lead}${pad(to)}`);
}

/**
 * Looks at every stream file of a pack. Returns the classified entries, the clothing groups (one per ped and dlc)
 * and plain-language findings. nothing here changes a file.
 */
export function analyze(files) {
  const entries = files.map((file) => ({ ...classify(file.rel), size: file.size ?? 0 }));
  const groups = new Map();
  const problems = [];
  const warnings = [];
  for (const entry of entries) {
    if (!["drawable", "texture", "prop", "proptexture", "ymt"].includes(entry.kind) || !entry.ped) continue;
    const key = `${entry.ped}|${entry.dlc || ""}`;
    if (!groups.has(key)) groups.set(key, { ped: entry.ped, dlc: entry.dlc || null, style: entry.dlc ? "dlc" : "replace", drawables: 0, textures: 0, props: 0, ymt: false, entries: [] });
    const group = groups.get(key);
    group.entries.push(entry);
    if (entry.kind === "drawable") { if (!entry.alt) group.drawables++; }
    else if (entry.kind === "texture") group.textures++;
    else if (entry.kind === "prop" || entry.kind === "proptexture") group.props++;
    else if (entry.kind === "ymt") group.ymt = true;
  }
  const bare = entries.filter((e) => ["drawable", "texture", "prop", "proptexture"].includes(e.kind) && e.style === "bare");
  const unknown = entries.filter((e) => e.kind === "other" && /\.(ydd|ytd)$/i.test(e.name));
  if (bare.length) problems.push(`${bare.length} file${bare.length === 1 ? " has" : "s have"} no freemode ped in the name (for example ${bare[0].name}).`);
  if (unknown.length) problems.push(`${unknown.length} drawable or texture file${unknown.length === 1 ? " does not" : "s do not"} follow a clothing name (for example ${unknown[0].name}).`);
  for (const group of groups.values()) {
    const label = group.dlc ? `${group.ped}_${group.dlc}` : `${group.ped} (replaces base game clothing)`;
    const pairs = pairing(group.entries);
    if (pairs.missingTextures.length) warnings.push(`${label}: ${pairs.missingTextures.length} drawable${pairs.missingTextures.length === 1 ? " has" : "s have"} no texture (for example ${pairs.missingTextures[0]}).`);
    if (pairs.orphanTextures.length) warnings.push(`${label}: ${pairs.orphanTextures.length} texture${pairs.orphanTextures.length === 1 ? " has" : "s have"} no drawable (for example ${pairs.orphanTextures[0]}).`);
    if (group.dlc && !group.ymt) warnings.push(`${label}: no ${group.ped}_${group.dlc}.ymt creature metadata file was found.`);
    const gaps = gapsOf(group.entries);
    if (gaps.length) warnings.push(`${label}: numbering skips ${gaps.slice(0, 3).map((g) => `${g.comp} ${String(g.missing).padStart(3, "0")}`).join(", ")}${gaps.length > 3 ? ", ..." : ""}. Missing numbers show as blank clothing.`);
  }
  return { entries, groups: [...groups.values()], bare, unknown, problems, warnings };
}

function pairing(groupEntries) {
  const drawables = groupEntries.filter((e) => e.kind === "drawable" || e.kind === "prop");
  const textures = groupEntries.filter((e) => e.kind === "texture" || e.kind === "proptexture");
  const key = (e) => `${e.comp}:${e.index}`;
  const have = new Set(textures.map(key));
  const wanted = new Set(drawables.map(key));
  return {
    missingTextures: drawables.filter((e) => !have.has(key(e))).map((e) => e.name),
    orphanTextures: textures.filter((e) => !wanted.has(key(e))).map((e) => e.name),
  };
}

/** Numbers missing between 000 and the highest used one, per component. */
function gapsOf(groupEntries) {
  const byComp = new Map();
  for (const e of groupEntries) if (["drawable", "prop"].includes(e.kind)) byComp.set(e.comp, [...(byComp.get(e.comp) || []), e.index]);
  const gaps = [];
  for (const [comp, list] of byComp) {
    const set = new Set(list);
    for (let n = 0; n <= Math.max(...list); n++) if (!set.has(n)) gaps.push({ comp, missing: n });
  }
  return gaps;
}

/**
 * Closes numbering gaps of a dlc group by renaming drawables and their textures to consecutive numbers.
 * Returns { from, to } rename pairs. Only used when the pack's own meta does not name drawable numbers.
 */
export function closeGaps(groupEntries) {
  const renames = [];
  const comps = new Map();
  for (const e of groupEntries) if (["drawable", "texture", "prop", "proptexture"].includes(e.kind)) comps.set(e.comp, [...(comps.get(e.comp) || []), e]);
  for (const list of comps.values()) {
    const used = [...new Set(list.filter((e) => e.kind === "drawable" || e.kind === "prop").map((e) => e.index))].sort((a, b) => a - b);
    used.forEach((old, next) => {
      if (old === next) return;
      for (const e of list.filter((x) => x.index === old)) renames.push({ from: e.rel, to: e.rel.replace(/[^/]+$/, renumbered(e.name, old, next)) });
    });
  }
  return renames;
}

/** A basic ShopPedApparel meta naming the pack. Generated only when a clothing group ships without one. */
export function shopPedMeta(ped, dlc, { creature = false } = {}) {
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<ShopPedApparel>`,
    `  <pedName>${ped}</pedName>`,
    `  <dlcName>${dlc}</dlcName>`,
    `  <fullDlcName>${ped}_${dlc}</fullDlcName>`,
    `  <eCharacter>SCR_CHAR_MULTIPLAYER</eCharacter>`,
    ...(creature ? [`  <creatureMetaData>mp_creaturemetadata_${dlc}</creatureMetaData>`] : []),
    `  <pedOutfits />`,
    `  <pedComponents />`,
    `  <pedProps />`,
    `</ShopPedApparel>`,
    ``,
  ].join("\n");
}

/** The ped/dlc a ShopPedApparel meta names, or null. */
export function shopMetaTarget(xml) {
  const ped = /<pedName>\s*([^<\s]+)\s*<\/pedName>/i.exec(xml)?.[1]?.toLowerCase();
  const dlc = /<dlcName>\s*([^<\s]+)\s*<\/dlcName>/i.exec(xml)?.[1]?.toLowerCase();
  return ped && dlc ? { ped, dlc } : null;
}

/** Addon ped model names listed in a peds.meta (CPedModelInfo__InitDataList). */
export function addonPedNames(xml) {
  const names = [];
  for (const m of String(xml).matchAll(/<Item>[\s\S]*?<Name>\s*([A-Za-z0-9_]{2,40})\s*<\/Name>/g)) names.push(m[1].toLowerCase());
  return [...new Set(names)];
}

/**
 * Checks renames proposed by the AI. A rename is kept only when the source is a file of the pack, the new name is a
 * well formed clothing name of the same type, it is not already taken, and it keeps the same component and number.
 * Returns { accepted, rejected } so the caller can report what was ignored.
 */
export function validateRenames(proposed, entries, { dlc }) {
  const byRel = new Map(entries.map((e) => [e.rel, e]));
  const taken = new Set(entries.map((e) => e.rel.toLowerCase()));
  const accepted = [];
  const rejected = [];
  for (const item of (Array.isArray(proposed) ? proposed : []).slice(0, 600)) {
    const from = byRel.get(String(item?.from ?? ""));
    const toName = String(item?.to ?? "").split(/[\\/]/).pop();
    const reject = (reason) => rejected.push({ from: String(item?.from ?? ""), to: toName, reason });
    if (!from) { reject("not a file of this pack"); continue; }
    const next = classify(toName);
    if (!["drawable", "texture", "prop", "proptexture"].includes(next.kind) || next.style === "bare") { reject("not a valid clothing file name"); continue; }
    if (next.kind !== from.kind && !(from.kind === "other")) { reject("changes the file type"); continue; }
    if (from.name.split(".").pop().toLowerCase() !== toName.split(".").pop().toLowerCase()) { reject("changes the extension"); continue; }
    if (next.style === "replace" && from.style !== "replace") { reject("would replace base game clothing"); continue; }
    if (next.dlc !== (dlc || null) && next.style === "dlc") { reject("uses a different pack name"); continue; }
    const target = from.rel.replace(/[^/]+$/, toName);
    if (taken.has(target.toLowerCase()) && target.toLowerCase() !== from.rel.toLowerCase()) { reject("name already used"); continue; }
    taken.delete(from.rel.toLowerCase());
    taken.add(target.toLowerCase());
    accepted.push({ from: from.rel, to: target, reason: String(item?.reason ?? "").slice(0, 200) });
  }
  return { accepted, rejected };
}

/** Binary game assets start with an RSC resource header. Anything else with such an extension is refused. */
export function assetHeaderProblem(name, head) {
  const ext = String(name).toLowerCase().split(".").pop();
  if (!["ydd", "ytd", "yft", "ydr", "yld"].includes(ext)) return null;
  const magic = Buffer.from(head).subarray(0, 4).toString("latin1");
  return /^RSC[78]$/.test(magic) ? null : `${name} is not a real ${ext} game asset (its header is not a GTA resource header).`;
}

/** GTA component and prop slot numbers with the name of the vMenu Character Customization category that lists them. */
export const SLOTS = {
  head: { slot: 0, label: "Head" }, berd: { slot: 1, label: "Masks" }, hair: { slot: 2, label: "Hair Style" },
  uppr: { slot: 3, label: "Torsos" }, lowr: { slot: 4, label: "Legs" }, hand: { slot: 5, label: "Bags & Parachutes" },
  feet: { slot: 6, label: "Shoes" }, teef: { slot: 7, label: "Scarfs & Chains" }, accs: { slot: 8, label: "Shirt & Accessories" },
  task: { slot: 9, label: "Body Armor & Accessories" }, decl: { slot: 10, label: "Badges & Logos" }, jbib: { slot: 11, label: "Shirt Overlay & Jackets" },
  p_head: { slot: 0, label: "Hats & Helmets", prop: true }, p_eyes: { slot: 1, label: "Glasses", prop: true }, p_ears: { slot: 2, label: "Misc Props", prop: true },
  p_mouth: { slot: 3, label: "Misc Props", prop: true }, p_lhand: { slot: 4, label: "Misc Props", prop: true }, p_rhand: { slot: 5, label: "Misc Props", prop: true },
  p_lwrist: { slot: 6, label: "Watches", prop: true }, p_rwrist: { slot: 7, label: "Bracelets", prop: true }, p_hip: { slot: 8, label: "Misc Props", prop: true },
  p_lfoot: { slot: 9, label: "Misc Props", prop: true }, p_rfoot: { slot: 10, label: "Misc Props", prop: true },
};

/**
 * Which slot and vMenu category each part of a pack lands in. Numbers are the pack's own drawable numbers: for a pack
 * with a name FiveM adds them after the base game's items of that slot, so the in-game number is higher.
 */
export function slotSummary(entries) {
  const map = new Map();
  for (const e of entries) {
    if (!["drawable", "texture", "prop", "proptexture"].includes(e.kind) || !e.ped || !SLOTS[e.comp]) continue;
    const key = `${e.ped}|${e.dlc || ""}|${e.comp}`;
    if (!map.has(key)) map.set(key, { ped: e.ped, dlc: e.dlc || null, comp: e.comp, ...SLOTS[e.comp], indices: new Set(), textures: 0 });
    const row = map.get(key);
    if (e.kind === "drawable" || e.kind === "prop") row.indices.add(e.index);
    else row.textures++;
  }
  return [...map.values()]
    .map(({ indices, ...row }) => ({ ...row, items: indices.size, first: indices.size ? Math.min(...indices) : null, last: indices.size ? Math.max(...indices) : null }))
    .sort((a, b) => a.ped.localeCompare(b.ped) || Number(Boolean(a.prop)) - Number(Boolean(b.prop)) || a.slot - b.slot);
}

/**
 * One row per clothing piece: a drawable (or prop) number in a slot of a ped, with how many textures it has, whether it
 * has a first-person alternate and how big its files are. This is what the portal lists for each pack.
 */
export function eupPieces(entries) {
  const map = new Map();
  for (const e of entries) {
    if (!["drawable", "texture", "prop", "proptexture"].includes(e.kind) || !e.ped || !SLOTS[e.comp]) continue;
    const key = `${e.ped}|${e.dlc || ""}|${e.comp}|${e.index}`;
    if (!map.has(key)) map.set(key, { ped: e.ped, dlc: e.dlc || null, comp: e.comp, slot: SLOTS[e.comp].slot, label: SLOTS[e.comp].label, prop: Boolean(SLOTS[e.comp].prop), index: e.index, textures: 0, alternate: false, bytes: 0 });
    const piece = map.get(key);
    piece.bytes += Number(e.size) || 0;
    if (e.kind === "texture" || e.kind === "proptexture") piece.textures++;
    else if (e.alt) piece.alternate = true;
  }
  return [...map.values()].sort((a, b) => a.ped.localeCompare(b.ped) || Number(a.prop) - Number(b.prop) || a.slot - b.slot || a.index - b.index);
}
