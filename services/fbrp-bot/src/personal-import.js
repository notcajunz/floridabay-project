import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFile, cp, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { callGame } from "./sync.js";

/**
 * Personal vehicle importer (website "Convert with AI").
 *
 * Turns a vehicle pack (a .zip uploaded from the website, or a folder or .zip already on the VPS) into a FiveM resource at
 * server-data/resources/[vehicles]/fbrp_pv_<model>/ that a personal can use. Packaging is done
 * here; the OpenAI model reads the pack's meta files and turns the handling the manager asked for
 * into exact field edits, which are validated and applied below.
 */

const run = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const VEHICLES_DIR = process.env.FBRP_VEHICLES_DIR || path.join(repoRoot, "server-data/resources/[vehicles]");
const ALLOWED_ROOTS = ["/home/ubuntu", "/tmp"];
const MARKER = ".fbrp-import.json";
const UPLOAD_DIR = path.join(tmpdir(), "fbrp-pv-uploads");
const UPLOAD_ID = /^[a-f0-9]{24}$/;
const MAX_UPLOAD = 600 * 1024 * 1024;
const UPLOAD_TTL = 6 * 60 * 60 * 1000;
/** Each chunk stays under Caddy's 2 MB body limit for floridabay.net. */
export const UPLOAD_CHUNK = 1536 * 1024;
const MAX_FILES = 3000;
const MAX_BYTES = 1.5 * 1024 ** 3;
const STREAM_EXT = new Set([".yft", ".ytd", ".ydr", ".ydd"]);
const AUDIO_EXT = new Set([".awc", ".rel", ".nametable"]);
const UNSUPPORTED = { ".rar": "RAR", ".7z": "7-Zip", ".oiv": "OIV installer", ".rpf": "RPF archive" };

/** Root element of each meta file the manifest needs, and its data_file type. */
const META_TYPES = [
  { key: "vehicles", root: "CVehicleModelInfo__InitDataList", dataFile: "VEHICLE_METADATA_FILE" },
  { key: "handling", root: "CHandlingDataMgr", dataFile: "HANDLING_FILE" },
  { key: "carcols", root: "CVehicleModelInfoVarGlobal", dataFile: "CARCOLS_FILE" },
  { key: "carvariations", root: "CVehicleModelInfoVariation", dataFile: "VEHICLE_VARIATION_FILE" },
  { key: "vehiclelayouts", root: "CVehicleMetadataMgr", dataFile: "VEHICLE_LAYOUTS_FILE" },
];

const DRIVETRAIN = { rwd: 0, awd: 0.5, fwd: 1 };
const LEVELS = { "": 1, lower: 0.85, higher: 1.15, much_higher: 1.3 };
/** In-game top speed in mph is about fInitialDriveMaxFlatVel x 0.82. */
const MPH_PER_FLATVEL = 0.82;
/** CHandlingData scalars that may be added when a pack leaves them out. */
const HANDLING_SCALARS = new Set(`fMass fInitialDragCoeff fDownforceModifier fPercentSubmerged fDriveBiasFront nInitialDriveGears
  fInitialDriveForce fDriveInertia fClutchChangeRateScaleUpShift fClutchChangeRateScaleDownShift fInitialDriveMaxFlatVel fBrakeForce
  fBrakeBiasFront fHandBrakeForce fSteeringLock fTractionCurveMax fTractionCurveMin fTractionCurveLateral fTractionSpringDeltaMax
  fLowSpeedTractionLossMult fCamberStiffnesss fTractionBiasFront fTractionLossMult fSuspensionForce fSuspensionCompDamp
  fSuspensionReboundDamp fSuspensionUpperLimit fSuspensionLowerLimit fSuspensionRaise fSuspensionBiasFront fAntiRollBarForce
  fAntiRollBarBiasFront fRollCentreHeightFront fRollCentreHeightRear fCollisionDamageMult fWeaponDamageMult fDeformationDamageMult
  fEngineDamageMult fPetrolTankVolume fOilVolume nMonetaryValue`.split(/\s+/));
const text = (value, max) => String(value ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

const AI_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["label", "summary", "notes", "edits"],
  properties: {
    label: { type: "string", description: "Display name for the F7 garage, e.g. 'Annis Elegy RH8'. Under 60 characters." },
    summary: { type: "string", description: "One or two sentences on what was done." },
    notes: { type: "array", items: { type: "string" }, description: "Problems found or things the manager should know. Empty if none." },
    edits: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["file", "field", "value", "reason"],
        properties: {
          file: { type: "string", enum: ["handling", "vehicles"] },
          field: { type: "string", description: "Exact XML element name inside this vehicle's Item, e.g. fInitialDriveMaxFlatVel." },
          value: { type: "string", description: "New value. Numbers as plain decimals. Vectors as 'x,y,z'. Flags as space separated names." },
          reason: { type: "string" },
        },
      },
    },
  },
};

const AI_INSTRUCTIONS = `You prepare GTA V add-on vehicles for a FiveM roleplay server.
You receive one vehicle's <Item> from vehicles.meta and from handling.meta, the pack's file list, and the handling the server manager asked for.

Return field edits that:
1. Carry out the manager's free text handling instructions using real handling.meta fields. Change only what is needed, keep values realistic for GTA V, and keep the car drivable.
   The menu settings in appliedBySystem are applied exactly by the system after you: never edit the fields listed there.
   You may make small supporting changes to other fields, for example raising fInitialDriveForce if a higher top speed would be unreachable, or raising fBrakeForce to match a much higher top speed.
   In-game top speed in mph is about fInitialDriveMaxFlatVel x 0.82.
2. Fix things that would break the vehicle in game:
   - vehicles.meta handlingId must equal handling.meta handlingName (edit handlingId).
   - vehicles.meta txdName should match a .ytd in the stream file list.
   - Only when hasCustomAudio is true (the pack shipped its own engine sounds, which are not installed): set audioNameHash to a fitting base game vehicle such as ELEGY, ZENTORNO, BUFFALO, SCHAFTER2, DOMINATOR, KURUMA or BATI. Otherwise never touch audioNameHash.
3. Never edit modelName or handlingName. Never invent fields that do not exist in GTA V.
If no handling changes were asked for and nothing is broken, return an empty edits array.
The summary must describe only the edits you actually returned.
Field values must be the final absolute values, not percentages. Use the current values you were given.`;

/** One vehicle's <Item>...</Item> block that contains <tag>name</tag>, with offsets. */
function itemBlock(xml, tag, name) {
  const marker = new RegExp(`<${tag}>\\s*${name.replace(/[^a-z0-9_]/gi, "")}\\s*</${tag}>`, "i").exec(xml);
  if (!marker) return null;
  const start = xml.lastIndexOf("<Item", marker.index);
  if (start < 0) return null;
  const tags = /<Item\b[^>]*?\/>|<Item\b[^>]*>|<\/Item>/g;
  tags.lastIndex = start;
  let depth = 0;
  for (let match; (match = tags.exec(xml));) {
    if (match[0].endsWith("/>")) continue;
    depth += match[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return { start, end: match.index + match[0].length, text: xml.slice(start, match.index + match[0].length) };
  }
  return null;
}

const tagValue = (xml, tag) => new RegExp(`<${tag}>\\s*([^<]*?)\\s*</${tag}>`, "i").exec(xml)?.[1] ?? null;

/** Applies one validated edit to an Item block. Returns { block, from } or throws. */
function applyEdit(block, file, field, rawValue) {
  if (!/^[A-Za-z][A-Za-z0-9_]{1,60}$/.test(field)) throw new Error(`bad field name ${field}`);
  if (/^(modelName|handlingName)$/i.test(field)) throw new Error(`${field} cannot be changed`);
  const value = text(rawValue, 300);
  if (!/^[A-Za-z0-9_.\- ,]+$/.test(value)) throw new Error(`bad value for ${field}`);

  const attr = new RegExp(`(<${field}\\s+value=")([^"]*)("\\s*/>)`);
  const vector = new RegExp(`<${field}\\s+x="([^"]*)"\\s+y="([^"]*)"\\s+z="([^"]*)"\\s*/>`);
  const inner = new RegExp(`(<${field}>)([^<]*)(</${field}>)`);
  const number = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n) || Math.abs(n) > 1e6) throw new Error(`${field} must be a number`);
    return n;
  };
  const format = (v) => (/^n/.test(field) ? String(Math.round(number(v))) : number(v).toFixed(6));

  let match;
  if ((match = attr.exec(block))) {
    const next = /^[fn]/.test(field) ? format(value) : value;
    return { block: block.replace(attr, `$1${next}$3`), from: match[2], to: next };
  }
  if ((match = vector.exec(block))) {
    const parts = value.split(/[\s,]+/).filter(Boolean).map(number);
    if (parts.length !== 3) throw new Error(`${field} needs x,y,z`);
    const next = parts.map((n) => n.toFixed(6));
    return { block: block.replace(vector, `<${field} x="${next[0]}" y="${next[1]}" z="${next[2]}" />`), from: `${match[1]},${match[2]},${match[3]}`, to: next.join(",") };
  }
  if ((match = inner.exec(block))) return { block: block.replace(inner, `$1${value}$3`), from: match[2].trim(), to: value };
  // Missing handling scalars are added; anything else must already exist.
  if (file === "handling" && HANDLING_SCALARS.has(field)) {
    const next = format(value);
    const close = block.indexOf("<SubHandlingData");
    const at = close > 0 ? close : block.lastIndexOf("</Item>");
    return { block: `${block.slice(0, at)}<${field} value="${next}" />\n      ${block.slice(at)}`, from: "(not set)", to: next };
  }
  throw new Error(`${field} does not exist in ${file}.meta`);
}

async function walk(dir, out = [], depth = 0) {
  if (depth > 10) return out;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (out.length > MAX_FILES) throw new Error(`The pack has more than ${MAX_FILES} files. Point at the vehicle's own folder.`);
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out, depth + 1);
    else if (entry.isFile()) out.push({ full, rel: path.relative(dir, full), name: entry.name, ext: path.extname(entry.name).toLowerCase(), size: (await stat(full)).size });
  }
  return out;
}

/** Resolves and checks the path a manager typed. Only folders and zips under the allowed roots. */
async function resolveSource(input) {
  const raw = text(input, 500);
  if (!raw || !raw.startsWith("/")) throw new Error("Enter the full path on the VPS, starting with /.");
  let real;
  try { real = await realpath(raw); } catch { throw new Error(`Nothing found at ${raw}.`); }
  if (!ALLOWED_ROOTS.some((root) => real === root || real.startsWith(`${root}/`)))
    throw new Error(`The path must be inside ${ALLOWED_ROOTS.join(" or ")}.`);
  if (real.startsWith(`${VEHICLES_DIR}/fbrp_pv_`)) throw new Error("That is already an installed personal resource. Point at the original pack.");
  const info = await stat(real);
  const ext = path.extname(real).toLowerCase();
  if (info.isDirectory()) return { real, kind: "folder" };
  if (ext === ".zip") return { real, kind: "zip", size: info.size };
  if (UNSUPPORTED[ext]) throw new Error(`${UNSUPPORTED[ext]} files cannot be read here. Extract it on the VPS first and enter the folder path.`);
  throw new Error("Enter a folder or a .zip file.");
}

async function unzip(file, size) {
  if (size > MAX_BYTES) throw new Error("That zip is too large.");
  const dir = await mkdtemp(path.join(tmpdir(), "fbrp-pv-"));
  // zipfile.extractall drops absolute paths and ".." parts, so entries cannot escape the folder.
  const script = "import sys,zipfile\nz=zipfile.ZipFile(sys.argv[1])\nif sum(i.file_size for i in z.infolist())>int(sys.argv[3]): sys.exit('too large')\nz.extractall(sys.argv[2])";
  try {
    await run("python3", ["-I", "-c", script, file, dir, String(MAX_BYTES)], { timeout: 180000 });
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw new Error(`Could not extract the zip: ${String(error.stderr || error.message).trim().split("\n").pop()}`);
  }
  return dir;
}

async function askOpenAI(input) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set for the bot.");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
      instructions: AI_INSTRUCTIONS,
      input: JSON.stringify(input),
      text: { format: { type: "json_schema", name: "personal_vehicle_import", strict: true, schema: AI_SCHEMA } },
    }),
    signal: AbortSignal.timeout(150000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`OpenAI: ${body.error?.message || response.status}`);
  const output = (body.output || []).flatMap((item) => item.content || []).find((part) => part.type === "output_text")?.text;
  if (!output) throw new Error("OpenAI returned no answer. Try again.");
  return JSON.parse(output);
}

/** What the menu sent, cleaned up. */
function handlingRequest(input = {}) {
  const level = (v) => (Object.hasOwn(LEVELS, String(v || "")) ? String(v || "") : "");
  const num = (v, min, max) => {
    if (v === undefined || v === null || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) throw new Error(`Handling values must be between ${min} and ${max}.`);
    return n;
  };
  const request = {
    topSpeedMph: num(input.topSpeed, 20, 400),
    acceleration: level(input.acceleration),
    braking: level(input.braking),
    grip: level(input.grip),
    weightKg: num(input.weight, 100, 30000),
    drivetrain: Object.hasOwn(DRIVETRAIN, input.drivetrain) ? input.drivetrain : "",
    gears: num(input.gears, 1, 10),
    instructions: text(input.instructions, 1500),
  };
  for (const [k, v] of Object.entries(request)) if (v === null || v === "") delete request[k];
  return request;
}

/** The exact field values the menu settings mean, computed from the pack's original handling. */
function menuEdits(request, original) {
  const current = (field) => Number(new RegExp(`<${field}\\s+value="([^"]*)"`).exec(original || "")?.[1]);
  const scaled = (field, key, reason) => {
    const base = current(field);
    if (request[key] && Number.isFinite(base)) return [{ field, value: String(base * LEVELS[request[key]]), reason }];
    return [];
  };
  const pct = (key) => `${request[key].replace("_", " ")} (${Math.round((LEVELS[request[key]] - 1) * 100)}%)`;
  return [
    ...(request.topSpeedMph ? [{ field: "fInitialDriveMaxFlatVel", value: String(request.topSpeedMph / MPH_PER_FLATVEL), reason: `Top speed about ${request.topSpeedMph} mph` }] : []),
    ...(request.acceleration ? scaled("fInitialDriveForce", "acceleration", `Acceleration ${pct("acceleration")}`) : []),
    ...(request.braking ? scaled("fBrakeForce", "braking", `Braking ${pct("braking")}`) : []),
    ...(request.grip ? [...scaled("fTractionCurveMax", "grip", `Grip ${pct("grip")}`), ...scaled("fTractionCurveMin", "grip", `Grip ${pct("grip")}`)] : []),
    ...(request.weightKg ? [{ field: "fMass", value: String(request.weightKg), reason: `Weight ${request.weightKg} kg` }] : []),
    ...(request.drivetrain ? [{ field: "fDriveBiasFront", value: String(DRIVETRAIN[request.drivetrain]), reason: `${request.drivetrain.toUpperCase()} drivetrain` }] : []),
    ...(request.gears ? [{ field: "nInitialDriveGears", value: String(request.gears), reason: `${request.gears} gears` }] : []),
  ].map((edit) => ({ ...edit, file: "handling" }));
}

async function readChunk(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > UPLOAD_CHUNK) throw new Error("Upload chunk is too large.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function sweepUploads() {
  const now = Date.now();
  for (const name of await readdir(UPLOAD_DIR).catch(() => [])) {
    const file = path.join(UPLOAD_DIR, name);
    const info = await stat(file).catch(() => null);
    if (info && now - info.mtimeMs > UPLOAD_TTL) await rm(file, { force: true });
  }
}

export function createPersonalImporter({ personals, audit }) {
  /**
   * Receives one chunk of a zip upload. The browser sends the file in order; offset must equal the
   * bytes received so far, so a retried chunk cannot be written twice.
   */
  async function uploadChunk(actorId, params, request) {
    await personals.assertManager(actorId);
    const offset = Number(params.get("offset"));
    const total = Number(params.get("total"));
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(total) || total < 1)
      throw new Error("Bad upload request.");
    if (total > MAX_UPLOAD) throw new Error(`Zip files can be up to ${MAX_UPLOAD / 1048576} MB.`);
    const body = await readChunk(request);
    if (!body.length) throw new Error("Empty upload chunk.");
    let id = String(params.get("id") || "");
    if (offset === 0) {
      if (!String(params.get("name") || "").toLowerCase().endsWith(".zip")) throw new Error("Upload a .zip file.");
      if (body.subarray(0, 4).toString("binary") !== "PK\x03\x04") throw new Error("That file is not a zip archive.");
      await mkdir(UPLOAD_DIR, { recursive: true, mode: 0o700 });
      await sweepUploads();
      id = randomBytes(12).toString("hex");
      await writeFile(path.join(UPLOAD_DIR, `${id}.zip`), body, { mode: 0o600 });
    } else {
      if (!UPLOAD_ID.test(id)) throw new Error("Bad upload id.");
      const file = path.join(UPLOAD_DIR, `${id}.zip`);
      const info = await stat(file).catch(() => null);
      if (!info) throw new Error("That upload expired. Upload the zip again.");
      if (info.size !== offset) throw new Error("Upload out of order. Upload the zip again.");
      if (offset + body.length > total) throw new Error("Upload is larger than announced.");
      await appendFile(file, body);
    }
    return { id, received: offset + body.length, done: offset + body.length >= total };
  }

  async function convert(actorId, input) {
    await personals.assertManager(actorId);
    let source;
    if (input.uploadId) {
      if (!UPLOAD_ID.test(String(input.uploadId))) throw new Error("Bad upload id.");
      const file = path.join(UPLOAD_DIR, `${input.uploadId}.zip`);
      const info = await stat(file).catch(() => null);
      if (!info) throw new Error("That upload expired. Upload the zip again.");
      source = { real: file, kind: "zip", size: info.size, label: text(input.uploadName, 120) || "uploaded zip" };
    } else source = await resolveSource(input.path);
    const scratch = source.kind === "zip" ? await unzip(source.real, source.size) : null;
    try {
      const files = await walk(scratch || source.real);
      const total = files.reduce((sum, file) => sum + file.size, 0);
      if (total > MAX_BYTES) throw new Error("The pack is larger than 1.5 GB. Point at the vehicle's own folder.");

      // Sort meta files by what they contain, not by name: packs name them all sorts of things.
      const metas = { vehicles: [], handling: [], carcols: [], carvariations: [], vehiclelayouts: [] };
      const skipped = [];
      for (const file of files.filter((f) => f.ext === ".meta" || f.ext === ".xml")) {
        if (file.size > 8 * 1024 * 1024) { skipped.push(file.rel); continue; }
        const xml = await readFile(file.full, "utf8");
        const type = META_TYPES.find((t) => new RegExp(`<\\s*${t.root}\\b`).test(xml));
        if (type) metas[type.key].push({ ...file, xml });
        else skipped.push(file.rel);
      }
      if (!metas.vehicles.length) throw new Error("No vehicles.meta found in that pack, so it is not a FiveM add-on vehicle.");

      const models = [...new Set(metas.vehicles.flatMap((m) => [...m.xml.matchAll(/<modelName>\s*([^<\s]+)\s*<\/modelName>/gi)].map((x) => x[1].toLowerCase())))];
      const wanted = text(input.model, 40).toLowerCase();
      if (!models.length) throw new Error("vehicles.meta does not name a model.");
      if (wanted && !models.includes(wanted)) throw new Error(`That pack does not contain ${wanted}. It has: ${models.join(", ")}.`);
      if (!wanted && models.length > 1) throw new Error(`That pack has ${models.length} vehicles (${models.join(", ")}). Type the one you want in Vehicle model and convert again.`);
      const model = personals.modelOf(wanted || models[0]);

      // Stream files go flat into stream/. Two files with the same name would overwrite each other in game.
      const stream = new Map();
      const notes = [];
      for (const file of files.filter((f) => STREAM_EXT.has(f.ext))) {
        const key = file.name.toLowerCase();
        if (stream.has(key)) { notes.push(`Two files are named ${file.name}; kept ${stream.get(key).rel}.`); continue; }
        stream.set(key, file);
      }
      if (![...stream.keys()].some((name) => name.startsWith(`${model}.`) || name.startsWith(`${model}_hi.`)))
        throw new Error(`No ${model}.yft model file found in the pack.`);
      for (const file of stream.values())
        if (file.ext === ".ytd" && file.size > 16 * 1024 * 1024) notes.push(`${file.name} is ${(file.size / 1048576).toFixed(1)} MB. Over 16 MB causes texture loss for players.`);
      if (files.some((f) => AUDIO_EXT.has(f.ext))) notes.push("The pack has custom engine sounds. They are not installed, so the AI picks a base game sound.");

      const vehicleFile = metas.vehicles.find((m) => itemBlock(m.xml, "modelName", model));
      const vehicleItem = itemBlock(vehicleFile.xml, "modelName", model);
      const handlingId = tagValue(vehicleItem.text, "handlingId") || model;
      const handlingFile = metas.handling.find((m) => itemBlock(m.xml, "handlingName", handlingId))
        || (metas.handling.length === 1 ? metas.handling[0] : null);
      let handlingItem = handlingFile ? itemBlock(handlingFile.xml, "handlingName", handlingId) : null;
      if (!handlingItem && handlingFile) {
        // handlingId does not match: offer the model the only (or model-named) handling entry so it can fix the id.
        const name = [...handlingFile.xml.matchAll(/<handlingName>\s*([^<\s]+)\s*<\/handlingName>/gi)].map((x) => x[1]);
        const pick = name.find((n) => n.toLowerCase() === model) || (name.length === 1 ? name[0] : null);
        if (pick) handlingItem = itemBlock(handlingFile.xml, "handlingName", pick);
      }

      const request = handlingRequest(input.handling);
      if (Object.keys(request).length && !handlingItem) throw new Error("The pack has no handling.meta entry for this vehicle, so its handling cannot be changed.");

      const fixed = menuEdits(request, handlingItem?.text);
      const ai = await askOpenAI({
        model,
        handlingInstructions: request.instructions || null,
        appliedBySystem: fixed.map((edit) => `${edit.field} = ${Number(edit.value).toFixed(3)} (${edit.reason})`),
        vehiclesMetaItem: vehicleItem.text.slice(0, 40000),
        handlingMetaItem: handlingItem ? handlingItem.text.slice(0, 40000) : null,
        streamFiles: [...stream.values()].map((f) => `${f.name} (${(f.size / 1048576).toFixed(1)} MB)`),
        otherMetaFiles: Object.entries(metas).flatMap(([key, list]) => list.map((m) => `${m.rel} -> ${key}`)),
        hasCustomAudio: files.some((f) => f.ext === ".awc"),
        sourceNote: "Files outside stream/ and data/ are not installed.",
      });

      // Apply the model's edits one by one; a bad edit is reported, never written.
      const blocks = { vehicles: vehicleItem.text, handling: handlingItem?.text ?? null };
      const changes = [];
      const locked = new Set(fixed.map((edit) => edit.field));
      const customAudio = files.some((f) => f.ext === ".awc");
      const edits = [
        ...(ai.edits || []).slice(0, 60)
          .filter((edit) => !(edit.file === "handling" && locked.has(edit.field)))
          .filter((edit) => customAudio || edit.field !== "audioNameHash"),
        ...fixed,
      ];
      for (const edit of edits) {
        if (!blocks[edit.file]) { notes.push(`Skipped ${edit.field}: no ${edit.file}.meta entry.`); continue; }
        try {
          const result = applyEdit(blocks[edit.file], edit.file, edit.field, edit.value);
          blocks[edit.file] = result.block;
          const prior = changes.findIndex((c) => c.file === `${edit.file}.meta` && c.field === edit.field);
          if (prior >= 0) changes.splice(prior, 1);
          if (result.from !== result.to) changes.push({ file: `${edit.file}.meta`, field: edit.field, from: result.from, to: result.to, reason: text(edit.reason, 200) });
        } catch (error) {
          notes.push(`Skipped ${edit.field}: ${error.message}.`);
        }
      }

      // Build the resource in a temporary folder, then swap it in.
      const resource = `fbrp_pv_${model}`;
      const target = path.join(VEHICLES_DIR, resource);
      const existing = await stat(target).catch(() => null);
      if (existing) {
        const marker = await readFile(path.join(target, MARKER), "utf8").catch(() => null);
        if (!marker) throw new Error(`${resource} is already installed and was not made by this importer. Remove that folder on the VPS first.`);
      }
      await mkdir(VEHICLES_DIR, { recursive: true });
      const build = await mkdtemp(path.join(VEHICLES_DIR, `.build-${model}-`));
      try {
        await mkdir(path.join(build, "stream"));
        await mkdir(path.join(build, "data"));
        for (const file of stream.values()) await cp(file.full, path.join(build, "stream", file.name));
        const dataFiles = [];
        for (const type of META_TYPES) {
          for (const [index, meta] of metas[type.key].entries()) {
            let xml = meta.xml;
            if (meta === vehicleFile) xml = xml.slice(0, vehicleItem.start) + blocks.vehicles + xml.slice(vehicleItem.end);
            if (meta === handlingFile && handlingItem) xml = xml.slice(0, handlingItem.start) + blocks.handling + xml.slice(handlingItem.end);
            const name = `data/${type.key}${index ? `_${index + 1}` : ""}.meta`;
            await writeFile(path.join(build, name), xml);
            dataFiles.push([type.dataFile, name]);
          }
        }
        const manifest = [
          "fx_version 'cerulean'",
          "game 'gta5'",
          "",
          `description 'Florida Bay personal vehicle: ${model} (converted by the website importer)'`,
          "",
          "files {",
          ...dataFiles.map(([, name]) => `  '${name}',`),
          "}",
          "",
          ...dataFiles.map(([type, name]) => `data_file '${type}'${" ".repeat(Math.max(1, 24 - type.length))}'${name}'`),
          "",
        ].join("\n");
        await writeFile(path.join(build, "fxmanifest.lua"), manifest);
        await writeFile(path.join(build, MARKER), JSON.stringify({ source: source.label || source.real, model, by: String(actorId), at: Date.now(), request, changes }, null, 2));
        if (existing) await rm(target, { recursive: true, force: true });
        await rename(build, target);
      } catch (error) {
        await rm(build, { recursive: true, force: true });
        throw error;
      }

      // Make it live: start a new vehicle, or restart one that was converted again.
      const started = await callGame("/personals/install", { resource, model }).catch(() => null);
      const live = started?.ok && (started.state === "started" || started.state === "restarted");
      if (started?.state === "in_use") notes.push("Someone has this vehicle spawned right now, so the new files load after the next server restart.");
      else if (!live) notes.push("Could not start it live. It loads on the next server restart.");

      if (skipped.length) notes.push(`Not needed and left out: ${skipped.slice(0, 8).join(", ")}${skipped.length > 8 ? ` and ${skipped.length - 8} more` : ""}.`);
      await audit(actorId, "personal.import", resource, { source: source.label || source.real, model, request, changes: changes.length });
      return {
        model,
        label: text(ai.label, 60) || model,
        resource,
        summary: text(ai.summary, 600),
        changes,
        notes: [...notes, ...(ai.notes || []).map((n) => text(n, 300)).filter(Boolean)].slice(0, 20),
        streamed: [...stream.values()].map((f) => f.name),
        started: live,
        restarted: started?.state === "restarted",
        models,
      };
    } finally {
      if (scratch) await rm(scratch, { recursive: true, force: true });
    }
  }

  return { convert, uploadChunk };
}
