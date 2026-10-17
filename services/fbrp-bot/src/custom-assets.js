import { randomBytes } from "node:crypto";
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rename as rename_, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { callGame } from "./sync.js";
import { PERSONAL_VEHICLES_DIR, personalResourceName } from "./personal-resources.js";
import { MAX_BYTES, PERSONAL_MARKER, STREAM_EXT, UPLOAD_DIR, UPLOAD_ID, reviewVehicleSecurity, unzip, walk } from "./personal-import.js";

/**
 * Custom EUP and personal vehicle liveries (website side, personal vehicle manager only).
 *
 * - An EUP pack is a clothing or uniform pack. A zip is security scanned, rebuilt as its own data-only resource
 *   fbrp_eup_<name> in [eup] and started live. FiveM streams it to every player, so there is no per-person access.
 * - A livery is a named bundle of stream files added to one personal vehicle's own resource. Files it replaced are
 *   kept, so removing the livery puts the vehicle back exactly as it was.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const EUP_DIR = process.env.FBRP_EUP_DIR || path.join(repoRoot, "server-data/resources/[eup]");
export const EUP_MARKER = ".fbrp-eup.json";
const EUP_NAME = /^[a-z0-9_]{2,40}$/;
const SAFE_PART = /^[A-Za-z0-9_.^+() -]{1,120}$/;
const EUP_STREAM_EXT = new Set([".ydd", ".ytd", ".ymt", ".yld", ".yft", ".ydr"]);
const MAX_ASSET_FILES = 3000;
const BACKUPS_KEPT = 2;
/** Meta files an EUP pack may carry, by root element, and the data_file type each one needs. */
const EUP_META_TYPES = [
  { root: "ShopPedApparel", dataFile: "SHOP_PED_APPAREL_META_FILE" },
  { root: "CPedModelInfo__InitDataList", dataFile: "PED_METADATA_FILE" },
];
const text = (value, max) => String(value ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
const eupResourceName = (name) => `fbrp_eup_${name}`;

/** Slug for a pack name typed by a person: lower case, spaces and dashes become underscores. */
export function eupSlug(value) {
  const name = String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, "");
  if (!EUP_NAME.test(name)) throw new Error("Give the pack a name of 2 to 40 letters, numbers or underscores.");
  return name;
}

/** Path of a pack file below stream/: everything up to and including a stream folder is dropped. */
export function streamPath(rel) {
  const parts = String(rel).replaceAll("\\", "/").split("/").filter(Boolean);
  const at = parts.findIndex((part) => part.toLowerCase() === "stream");
  const kept = at >= 0 && at < parts.length - 1 ? parts.slice(at + 1) : parts;
  for (const part of kept) if (part === ".." || part === "." || !SAFE_PART.test(part)) throw new Error(`The file name ${kept.join("/")} has characters that are not allowed.`);
  return kept.join("/");
}

async function stagedZip(uploadId) {
  if (!UPLOAD_ID.test(String(uploadId || ""))) throw new Error("Bad upload id.");
  const file = path.join(UPLOAD_DIR, `${uploadId}.zip`);
  const info = await stat(file).catch(() => null);
  if (!info) throw new Error("That upload expired. Upload the zip again.");
  return { file, size: info.size };
}

/** Copies an installed resource to a hidden folder beside it before it is replaced, keeping the last two. */
async function backupResource(root, resource, notes) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const prefix = `.replaced-${resource}-`;
  await cp(path.join(root, resource), path.join(root, `${prefix}${stamp}`), { recursive: true });
  const old = (await readdir(root)).filter((entry) => entry.startsWith(prefix)).sort();
  for (const entry of old.slice(0, Math.max(0, old.length - BACKUPS_KEPT))) await rm(path.join(root, entry), { recursive: true, force: true });
  notes.push(`The previous files were kept in ${prefix}${stamp} on the server.`);
}

const reloadNote = (started, notes, what) => {
  if (started?.state === "in_use") notes.push(`Players are online, so the new ${what} loads after the next server restart.`);
  else if (!(started?.ok && (started.state === "started" || started.state === "restarted"))) notes.push("Could not start it live. It loads on the next server restart.");
  else notes.push(`It is live now. Players already online should reconnect to see the ${what}.`);
};

export function createCustomAssets({ personals, audit, db }) {
  const gameInstall = (resource, model = "") => callGame("/personals/install", { resource, model }).catch(() => null);

  /* ------------------------------------------------------------------ EUP */

  const eupView = (row) => ({
    id: Number(row.id), name: row.name, label: row.label, notes: row.notes || "", resource: eupResourceName(row.name),
    files: Number(row.file_count), bytes: Number(row.size_bytes), created_by: row.created_by, created_at: Number(row.created_at), updated_at: Number(row.updated_at),
  });

  async function portalData(discordId) {
    if (!(await personals.canManage(discordId))) return null;
    const [eup, liveries] = await Promise.all([
      db.query("SELECT * FROM custom_eup ORDER BY label,id").catch(() => []),
      db.query("SELECT id,personal_id,label,files,added_by,added_at FROM personal_liveries ORDER BY label,id").catch(() => []),
    ]);
    return {
      eup: eup.map(eupView),
      liveries: liveries.map((row) => ({
        id: Number(row.id), personal_id: Number(row.personal_id), label: row.label, added_by: row.added_by, added_at: Number(row.added_at),
        files: (typeof row.files === "string" ? JSON.parse(row.files) : row.files) || [],
      })),
    };
  }

  async function installEup(actorId, input) {
    await personals.assertManager(actorId);
    const name = eupSlug(input.name);
    const label = text(input.label, 60) || name;
    const notes = [];
    const resource = eupResourceName(name);
    const target = path.join(EUP_DIR, resource);
    const existing = await stat(target).catch(() => null);
    if (existing) {
      const marker = await readFile(path.join(target, EUP_MARKER), "utf8").catch(() => null);
      if (!marker) throw new Error(`${resource} is already installed and was not made by this tool. Remove that folder on the VPS first.`);
      if (!input.replace) throw new Error(`An EUP pack named ${name} already exists. Use Replace pack on it, or pick another name.`);
    } else if (input.replace) throw new Error(`There is no EUP pack named ${name} to replace.`);

    const source = await stagedZip(input.uploadId);
    const scratch = await unzip(source.file, source.size);
    try {
      const files = await walk(scratch);
      if (files.length > MAX_ASSET_FILES) throw new Error(`The pack has more than ${MAX_ASSET_FILES} files.`);
      if (files.reduce((sum, file) => sum + file.size, 0) > MAX_BYTES) throw new Error("The pack is larger than 1.5 GB.");
      const security = await reviewVehicleSecurity(files, {
        subject: "custom clothing (EUP) importer",
        boundary: "Only .ydd/.ytd/.ymt/.yld/.yft/.ydr clothing assets and clothing or ped metadata are copied. The importer creates a new manifest and copies no uploaded scripts.",
      });
      if (!security.passed) {
        await audit(actorId, "eup.import.blocked", name, { verdict: security.verdict, summary: security.summary, findings: security.findings.slice(0, 20) }).catch(() => null);
        const reasons = security.findings.filter((f) => f.severity === "critical" || f.severity === "warning").slice(0, 3).map((f) => `${f.file}: ${f.reason}`);
        throw new Error(`Security check blocked this pack. ${reasons.join(" ") || security.summary || "The AI could not verify that it is safe."}`);
      }

      const stream = new Map();
      for (const file of files.filter((f) => EUP_STREAM_EXT.has(f.ext))) {
        const rel = streamPath(file.rel);
        const key = rel.toLowerCase();
        if (stream.has(key)) { notes.push(`Two files are named ${rel}; kept the first.`); continue; }
        stream.set(key, { ...file, out: rel });
      }
      if (!stream.size) throw new Error("No clothing files (.ydd, .ytd, .ymt, .yld, .yft, .ydr) were found in that pack.");

      const metas = [];
      const skipped = [];
      for (const file of files.filter((f) => f.ext === ".meta" || f.ext === ".xml")) {
        if (file.size > 8 * 1024 * 1024) { skipped.push(file.rel); continue; }
        const xml = await readFile(file.full, "utf8");
        if (/<!(?:ENTITY|DOCTYPE)/i.test(xml)) throw new Error(`${file.rel} declares XML entities, which are not allowed.`);
        const type = EUP_META_TYPES.find((t) => new RegExp(`<\\s*${t.root}\\b`).test(xml));
        if (type) metas.push({ file, xml, type });
        else skipped.push(file.rel);
      }
      if (!metas.some((m) => m.type.root === "ShopPedApparel") && ![...stream.values()].some((f) => /^mp_[mf]_freemode_01.*\.(?:ydd|ytd)$/i.test(path.basename(f.out)) && !/\^/.test(f.out)))
        notes.push("No shop apparel meta file was found, so this installs as a replacement pack: it only works if the files use the game's own drawable names.");
      if (skipped.length) notes.push(`Not needed and left out: ${skipped.slice(0, 6).join(", ")}${skipped.length > 6 ? ` and ${skipped.length - 6} more` : ""}.`);

      await mkdir(EUP_DIR, { recursive: true });
      const build = await mkdtemp(path.join(EUP_DIR, `.build-${name}-`));
      let bytes = 0;
      try {
        for (const file of stream.values()) {
          const copy = path.join(build, "stream", file.out);
          await mkdir(path.dirname(copy), { recursive: true });
          await cp(file.full, copy);
          bytes += file.size;
        }
        await mkdir(path.join(build, "data"));
        const dataFiles = [];
        for (const [index, meta] of metas.entries()) {
          const rel = `data/${meta.type.root.toLowerCase()}_${index + 1}.meta`;
          await writeFile(path.join(build, rel), meta.xml);
          dataFiles.push([meta.type.dataFile, rel]);
        }
        const manifest = [
          "fx_version 'cerulean'",
          "game 'gta5'",
          "",
          `description 'Florida Bay custom EUP: ${name} (installed by the website)'`,
          "",
          ...(dataFiles.length ? ["files {", ...dataFiles.map(([, rel]) => `  '${rel}',`), "}", "", ...dataFiles.map(([type, rel]) => `data_file '${type}'${" ".repeat(Math.max(1, 28 - type.length))}'${rel}'`), ""] : []),
        ].join("\n");
        await writeFile(path.join(build, "fxmanifest.lua"), manifest);
        await writeFile(path.join(build, EUP_MARKER), JSON.stringify({ name, label, by: String(actorId), at: Date.now(), files: stream.size, bytes, security: { verdict: security.verdict, summary: security.summary, repairs: security.repairs } }, null, 2));
        if (existing) await backupResource(EUP_DIR, resource, notes);
        if (existing) await rm(target, { recursive: true, force: true });
        await rename_(build, target);
      } catch (error) {
        await rm(build, { recursive: true, force: true });
        throw error;
      }

      const stamp = Date.now();
      await db.query(
        `INSERT INTO custom_eup(name,label,notes,file_count,size_bytes,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE label=VALUES(label),notes=VALUES(notes),file_count=VALUES(file_count),size_bytes=VALUES(size_bytes),updated_at=VALUES(updated_at)`,
        [name, label, text(input.notes, 300) || null, stream.size, bytes, String(actorId), stamp, stamp],
      );
      reloadNote(await gameInstall(resource), notes, "clothing");
      await rm(source.file, { force: true });
      await audit(actorId, input.replace ? "eup.replace" : "eup.import", resource, { files: stream.size, bytes, metas: metas.length, security: security.verdict });
      const row = await db.one("SELECT * FROM custom_eup WHERE name=?", [name]);
      return { eup: eupView(row), summary: security.summary, notes, security: { verdict: security.verdict, repairs: security.repairs } };
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  }

  async function updateEup(actorId, input) {
    await personals.assertManager(actorId);
    const row = await db.one("SELECT * FROM custom_eup WHERE id=?", [Number(input.id) || 0]);
    if (!row) throw new Error("That EUP pack no longer exists.");
    const label = text(input.label, 60);
    if (!label) throw new Error("Give the pack a label.");
    await db.query("UPDATE custom_eup SET label=?,notes=?,updated_at=? WHERE id=?", [label, text(input.notes, 300) || null, Date.now(), row.id]);
    await audit(actorId, "eup.update", eupResourceName(row.name), { label });
    return eupView(await db.one("SELECT * FROM custom_eup WHERE id=?", [row.id]));
  }

  async function deleteEup(actorId, input) {
    await personals.assertManager(actorId);
    const row = await db.one("SELECT * FROM custom_eup WHERE id=?", [Number(input.id) || 0]);
    if (!row) throw new Error("That EUP pack no longer exists.");
    const resource = eupResourceName(row.name);
    const target = path.join(EUP_DIR, resource);
    const info = await stat(target).catch(() => null);
    if (info) {
      if (!(await stat(path.join(target, EUP_MARKER)).catch(() => null))) throw new Error(`${resource} was not made by this tool, so it is not removed here.`);
      const stopped = await callGame("/personals/uninstall", { resource }).catch(() => null);
      if (stopped && stopped.ok === false) throw new Error(`Could not stop ${resource} before deleting its files.`);
      await rm(target, { recursive: true, force: true });
    }
    await db.query("DELETE FROM custom_eup WHERE id=?", [row.id]);
    await audit(actorId, "eup.delete", resource, { label: row.label });
    return { id: Number(row.id), label: row.label, name: row.name };
  }

  /* -------------------------------------------------------------- liveries */

  async function managedPersonal(personalId) {
    const personal = await personals.find(personalId);
    const model = personals.modelOf(personal.model);
    const resource = personalResourceName(model);
    const dir = path.join(PERSONAL_VEHICLES_DIR, resource);
    const marker = JSON.parse((await readFile(path.join(dir, PERSONAL_MARKER), "utf8").catch(() => "null")) || "null");
    if (!marker) throw new Error(`${resource} was not made by the importer, so its files are not managed here. Import or replace the vehicle files first.`);
    return { personal, model, resource, dir };
  }

  const liveryRow = (row) => ({
    id: Number(row.id), personal_id: Number(row.personal_id), label: row.label, added_by: row.added_by, added_at: Number(row.added_at),
    files: (typeof row.files === "string" ? JSON.parse(row.files) : row.files) || [],
  });

  async function addLivery(actorId, input) {
    await personals.assertManager(actorId);
    const { personal, model, resource, dir } = await managedPersonal(input.personalId);
    const label = text(input.label, 60);
    if (!label) throw new Error("Give the livery a name.");
    if (await db.one("SELECT 1 ok FROM personal_liveries WHERE personal_id=? AND label=?", [personal.id, label]))
      throw new Error(`${personal.label} already has a livery called ${label}.`);
    const replacing = input.replaceExisting === true || input.replaceExisting === "true" || input.replaceExisting === "on";
    const notes = [];

    const source = await stagedZip(input.uploadId);
    const scratch = await unzip(source.file, source.size);
    try {
      const files = await walk(scratch);
      if (files.length > MAX_ASSET_FILES) throw new Error(`The pack has more than ${MAX_ASSET_FILES} files.`);
      const security = await reviewVehicleSecurity(files, {
        subject: "personal vehicle livery importer",
        boundary: "Only .yft/.ytd/.ydr/.ydd livery assets are copied into an existing vehicle resource. Nothing else from the upload is installed.",
      });
      if (!security.passed) {
        await audit(actorId, "livery.import.blocked", resource, { label, verdict: security.verdict, summary: security.summary, findings: security.findings.slice(0, 20) }).catch(() => null);
        const reasons = security.findings.filter((f) => f.severity === "critical" || f.severity === "warning").slice(0, 3).map((f) => `${f.file}: ${f.reason}`);
        throw new Error(`Security check blocked this livery. ${reasons.join(" ") || security.summary || "The AI could not verify that it is safe."}`);
      }

      const incoming = new Map();
      for (const file of files.filter((f) => STREAM_EXT.has(f.ext))) {
        if (!SAFE_PART.test(file.name) || file.name.startsWith(".")) throw new Error(`The file name ${file.name} has characters that are not allowed.`);
        const key = file.name.toLowerCase();
        if (incoming.has(key)) { notes.push(`Two files are named ${file.name}; kept the first.`); continue; }
        incoming.set(key, file);
      }
      if (!incoming.size) throw new Error("No livery files (.yft, .ytd, .ydr, .ydd) were found in that zip.");
      const left = files.length - [...incoming.values()].length;
      if (left > 0) notes.push("Meta files and everything else in the zip are not installed. Liveries only add or replace the vehicle's streamed files.");

      // A file already added by another livery of this vehicle stays with that livery, so each one can be taken out cleanly.
      const owned = new Map();
      for (const other of await db.query("SELECT label,files FROM personal_liveries WHERE personal_id=?", [personal.id]))
        for (const f of liveryRow({ ...other, id: 0, personal_id: personal.id }).files) owned.set(String(f.name).toLowerCase(), other.label);
      const streamDir = path.join(dir, "stream");
      await mkdir(streamDir, { recursive: true });
      const present = new Map((await readdir(streamDir)).map((entry) => [entry.toLowerCase(), entry]));
      const clash = [];
      for (const key of incoming.keys()) if (owned.has(key)) clash.push(`${incoming.get(key).name} (livery ${owned.get(key)})`);
      if (clash.length) throw new Error(`These files belong to another livery of this vehicle. Remove that livery first: ${clash.slice(0, 5).join(", ")}.`);
      const replaced = [...incoming.keys()].filter((key) => present.has(key));
      if (replaced.length && !replacing)
        throw new Error(`The vehicle already has ${replaced.length} file${replaced.length === 1 ? "" : "s"} with these names (${replaced.slice(0, 4).map((key) => incoming.get(key).name).join(", ")}${replaced.length > 4 ? ", ..." : ""}). Tick "Replace files with the same name" to swap them. They are kept so removing the livery restores them.`);

      const token = randomBytes(12).toString("hex");
      const keepDir = path.join(dir, ".liveries", token);
      await mkdir(path.join(keepDir, "orig"), { recursive: true });
      const added = [];
      try {
        for (const [key, file] of incoming) {
          const targetName = present.get(key) || file.name;
          const targetPath = path.join(streamDir, targetName);
          const overwrote = present.has(key);
          if (overwrote) await cp(targetPath, path.join(keepDir, "orig", targetName));
          const temp = path.join(dir, `.livery-${randomBytes(6).toString("hex")}`);
          await cp(file.full, temp);
          await rename_(temp, targetPath);
          added.push({ name: targetName, size: file.size, replaced: overwrote });
        }
      } catch (error) {
        // Put back whatever was already swapped in.
        for (const f of added) {
          const back = path.join(keepDir, "orig", f.name);
          if (f.replaced) await cp(back, path.join(streamDir, f.name)).catch(() => null);
          else await rm(path.join(streamDir, f.name), { force: true });
        }
        await rm(keepDir, { recursive: true, force: true });
        throw error;
      }
      await db.query("INSERT INTO personal_liveries(personal_id,label,token,files,added_by,added_at) VALUES(?,?,?,?,?,?)", [personal.id, label, token, JSON.stringify(added), String(actorId), Date.now()]);
      reloadNote(await gameInstall(resource, model), notes, "livery");
      await rm(source.file, { force: true });
      await audit(actorId, "livery.add", resource, { personal: personal.id, label, files: added.length, replaced: added.filter((f) => f.replaced).length, security: security.verdict });
      const row = await db.one("SELECT * FROM personal_liveries WHERE personal_id=? AND label=?", [personal.id, label]);
      return { livery: liveryRow(row), personal: personal.label, summary: security.summary, notes };
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  }

  async function removeLivery(actorId, input) {
    await personals.assertManager(actorId);
    const row = await db.one("SELECT * FROM personal_liveries WHERE id=?", [Number(input.id) || 0]);
    if (!row) throw new Error("That livery no longer exists.");
    const { model, resource, dir } = await managedPersonal(row.personal_id);
    const livery = liveryRow(row);
    const streamDir = path.join(dir, "stream");
    const keepDir = path.join(dir, ".liveries", String(row.token).replace(/[^a-f0-9]/g, ""));
    const notes = [];
    for (const file of livery.files) {
      const name = path.basename(String(file.name));
      const targetPath = path.join(streamDir, name);
      if (file.replaced) {
        const original = path.join(keepDir, "orig", name);
        if (await lstat(original).catch(() => null)) await cp(original, targetPath);
        else notes.push(`The original ${name} was not found, so the livery's copy stays.`);
      } else await rm(targetPath, { force: true });
    }
    await rm(keepDir, { recursive: true, force: true });
    await db.query("DELETE FROM personal_liveries WHERE id=?", [row.id]);
    reloadNote(await gameInstall(resource, model), notes, "vehicle");
    await audit(actorId, "livery.remove", resource, { personal: livery.personal_id, label: livery.label, files: livery.files.length });
    return { id: livery.id, label: livery.label, notes };
  }

  return { portalData, installEup, updateEup, deleteEup, addLivery, removeLivery };
}
