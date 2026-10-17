import { readFile } from "node:fs/promises";
import path from "node:path";
import { PERSONAL_VEHICLES_DIR, personalResourceName } from "./personal-resources.js";

/**
 * Liveries already inside an imported vehicle pack.
 *
 * GTA vehicles declare liveries in the mod kit of carcols.meta (<liveryNames>) and enable their slots in
 * carvariations.meta (<liveries>). Some packs also ship extra livery textures as separate files. The importer collects
 * that evidence, the AI decides which of it are real liveries and gives each a readable name, and only entries that
 * match the evidence are kept. They are stored in the resource marker and registered for the personal vehicle.
 */

const MARKER = ".fbrp-import.json";
const FILE_HINT = /(livery|liv[_\d]|skin|wrap|decal|stripe|paintjob)/i;
const text = (value, max) => String(value ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

/** Raw livery names of the mod kits a vehicle uses (all kits when the vehicle's own cannot be told). */
export function metaLiveryNames(carcolsXml, vehicleItemText = "") {
  const wanted = new Set([...String(vehicleItemText).matchAll(/<modKits>([\s\S]*?)<\/modKits>/gi)]
    .flatMap((block) => [...block[1].matchAll(/<Item>\s*([^<\s]+)\s*<\/Item>/g)].map((m) => m[1].toLowerCase())));
  const all = [];
  const mine = [];
  for (const xml of carcolsXml) {
    for (const block of xml.matchAll(/<liveryNames>([\s\S]*?)<\/liveryNames>/gi)) {
      const kit = [...xml.slice(0, block.index).matchAll(/<kitName>\s*([^<\s]+)\s*<\/kitName>/gi)].pop()?.[1]?.toLowerCase();
      for (const item of block[1].matchAll(/<Item>\s*([^<]+?)\s*<\/Item>/g)) {
        const name = text(item[1], 80);
        if (!name) continue;
        all.push(name);
        if (kit && wanted.has(kit)) mine.push(name);
      }
    }
  }
  return [...new Set(mine.length ? mine : all)];
}

/** How many livery slots carvariations.meta switches on (a hint for the AI, not a livery by itself). */
export function enabledLiverySlots(carvariationsXml) {
  let most = 0;
  for (const xml of carvariationsXml)
    for (const block of xml.matchAll(/<liveries>([\s\S]*?)<\/liveries>/gi))
      most = Math.max(most, [...block[1].matchAll(/<Item\s+value="true"/gi)].length);
  return most;
}

/** Everything in a pack that could be a livery. */
export function liveryEvidence({ carcols = [], carvariations = [], vehicleItemText = "", streamNames = [], model = "" }) {
  const names = metaLiveryNames(carcols, vehicleItemText);
  const lowerModel = String(model).toLowerCase();
  const files = streamNames.filter((n) => FILE_HINT.test(n) && !new RegExp(`^${lowerModel}(?:\\+hi|_hi)?\\.(?:ytd|yft)$`, "i").test(n)).slice(0, 80);
  return { names, files, enabledSlots: enabledLiverySlots(carvariations) };
}

/** "MODEL_LIVERY_BLUE_STRIPE" -> "Blue Stripe" for a name the AI did not label. */
export function prettyLivery(raw, model = "") {
  const cleaned = String(raw).replace(/\.[a-z0-9]+$/i, "").replace(new RegExp(`^${String(model).replace(/[^a-z0-9]/gi, "")}[_-]?`, "i"), "").replace(/(^|[_\s-])liv(?:ery)?(?=[_\s-]|\d|$)/gi, "$1").replace(/[_-]+/g, " ").trim();
  const words = (cleaned || String(raw)).split(/\s+/).filter(Boolean).map((w) => (w.length > 1 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toUpperCase()));
  return text(`Livery ${words.join(" ")}`.replace(/^Livery (?=Livery)/, ""), 60) || "Livery";
}

/**
 * Keeps the AI's liveries that point at real evidence. Every name found in a mod kit is a livery slot, so those are
 * always kept (with the AI's label when it gave one). Files are kept only when the AI vouched for them.
 */
export function validateLiveries(proposed, evidence, model = "") {
  const byName = new Map(evidence.names.map((n) => [n.toLowerCase(), n]));
  const byFile = new Map(evidence.files.map((n) => [n.toLowerCase(), n]));
  const out = [];
  const used = new Set();
  const take = (label, source, kind) => {
    let name = text(label, 60) || prettyLivery(source, model);
    let key = name.toLowerCase();
    for (let n = 2; used.has(key); n++) { name = `${text(label, 52) || prettyLivery(source, model)} ${n}`; key = name.toLowerCase(); }
    used.add(key);
    out.push({ label: name, source, kind });
  };
  const claimed = new Set();
  for (const item of (Array.isArray(proposed) ? proposed : []).slice(0, 60)) {
    const source = String(item?.source ?? "").trim().toLowerCase();
    if (byName.has(source) && !claimed.has(source)) { claimed.add(source); take(item.label, byName.get(source), "meta"); }
    else if (byFile.has(source) && !claimed.has(source)) { claimed.add(source); take(item.label, byFile.get(source), "file"); }
  }
  for (const [key, name] of byName) if (!claimed.has(key)) take("", name, "meta");
  return out.slice(0, 40);
}

/** Replaces a personal's detected (built-in) liveries with the ones the vehicle's marker lists. */
export async function registerDetectedLiveries(db, personalId, model) {
  const marker = JSON.parse((await readFile(path.join(PERSONAL_VEHICLES_DIR, personalResourceName(model), MARKER), "utf8").catch(() => "null")) || "null");
  const found = Array.isArray(marker?.liveries) ? marker.liveries : [];
  await db.query("DELETE FROM personal_liveries WHERE personal_id=? AND builtin=TRUE", [personalId]);
  let added = 0;
  for (const livery of found.slice(0, 40)) {
    const label = text(livery.label, 60);
    if (!label) continue;
    const detail = livery.kind === "file" ? `Texture file ${text(livery.source, 120)}` : `Livery slot ${text(livery.source, 120)} in the vehicle's carcols.meta`;
    const result = await db.query(
      "INSERT IGNORE INTO personal_liveries(personal_id,label,token,files,builtin,detail,added_by,added_at) VALUES(?,?,?,?,TRUE,?,?,?)",
      [personalId, label, "", "[]", detail, "auto", Date.now()],
    );
    added += Number(result?.affectedRows || 0);
  }
  return added;
}
