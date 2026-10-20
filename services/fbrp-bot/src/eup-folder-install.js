import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";

const run = promisify(execFile);

/**
 * Installs an EUP pack that is already extracted into a folder (a pack someone sent as RAR or 7z, which the website
 * cannot read) through the same scan, packaging and registration as the portal's Add EUP pack.
 *
 *   node --env-file=.env src/eup-folder-install.js --dir <folder> --name <pack> --owner <discord id> --stage <out dir>
 *   node --env-file=.env src/eup-folder-install.js --dir <folder> --name <pack> --public --live
 *
 * Add --max-gb <1.5-4> for a pack larger than the website's 1.5 GB limit.
 * Pass --public instead of --owner for a pack that belongs to nobody in particular; the portal lists it as Public.
 *
 * --stage builds the finished resource and its portal row under <out dir> and touches no database, no game server and no
 * live resource folder, so nothing goes live. --live installs it for real: the live [eup] folder, the custom_eup row
 * (owned by --owner) and a live start of the resource.
 */

const LIVE_ROOT = process.env.FBRP_LIVE_ROOT || "/home/ubuntu/fbrp";
const DISCORD_ID = /^\d{15,25}$/;
const PACK_NAME = /^[a-z0-9_]{2,40}$/;
/** Recorded as the owner of a pack nobody personally owns (free to everyone on the server). */
export const PUBLIC_OWNER = "public";

/** Zips a folder with the folder's own contents at the top level, the way the portal's upload arrives. */
async function zipFolder(dir, zipFile) {
  const script = `import sys,zipfile,os
source, target = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
    for base, dirs, files in os.walk(source):
        dirs.sort()
        for name in sorted(files):
            full = os.path.join(base, name)
            if os.path.islink(full): sys.exit('symbolic links are not allowed: ' + full)
            archive.write(full, os.path.relpath(full, source).replace(os.sep, '/'))
`;
  await run("python3", ["-I", "-c", script, dir, zipFile], { timeout: 300000, maxBuffer: 1 << 20 });
}

/** The two tables the installer writes, kept in memory so a staged build never reaches the database. */
function stagedDb(rows) {
  return {
    async one(sql, params) {
      if (/FROM custom_eup WHERE name=/.test(sql)) return rows.find((row) => row.name === params[0]) || null;
      throw new Error(`staged install does not expect: ${sql}`);
    },
    async query(sql, params) {
      if (/INSERT INTO custom_eup/.test(sql)) {
        const [name, label, notes, file_count, size_bytes, created_by, created_at, updated_at] = params;
        rows.push({ id: 0, name, label, notes, file_count, size_bytes, created_by, created_at, updated_at });
        return { affectedRows: 1 };
      }
      throw new Error(`staged install does not expect: ${sql}`);
    },
  };
}

export async function installEupFolder(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      dir: { type: "string" }, name: { type: "string" }, label: { type: "string" }, notes: { type: "string" },
      owner: { type: "string" }, public: { type: "boolean", default: false }, "max-gb": { type: "string" }, stage: { type: "string" }, live: { type: "boolean", default: false }, replace: { type: "boolean", default: false },
    },
  });
  const fail = (message) => { throw new Error(message); };
  if (Boolean(values.stage) === values.live) fail("Pass exactly one of --stage <out dir> (nothing goes live) or --live.");
  if (!values.dir || !(await stat(values.dir).catch(() => null))?.isDirectory()) fail("--dir must be the extracted pack folder (the one holding fxmanifest.lua and stream/).");
  if (!PACK_NAME.test(values.name || "")) fail("--name must be 2 to 40 lower case letters, numbers or underscores.");
  if (values.public && values.owner) fail("Pass --owner or --public, not both.");
  if (!values.public && !DISCORD_ID.test(values.owner || "")) fail("--owner must be the Discord ID of the pack's owner (or pass --public).");
  const owner = values.public ? PUBLIC_OWNER : values.owner;
  // A very large pack may exceed the website's 1.5 GB cap. This script is run by an admin, so it may raise the cap (to 4 GB at most).
  if (values["max-gb"] !== undefined) {
    const gb = Number(values["max-gb"]);
    if (!(gb >= 1.5 && gb <= 4)) fail("--max-gb must be between 1.5 and 4.");
    process.env.FBRP_IMPORT_MAX_BYTES = String(Math.floor(gb * 1024 ** 3));
  }

  const stageDir = values.stage ? path.resolve(values.stage) : null;
  if (stageDir) {
    // Everything the installer writes or calls is pointed away from production before the modules load.
    await mkdir(stageDir, { recursive: true });
    process.env.FBRP_EUP_DIR = path.join(stageDir, "eup");
    process.env.FBRP_VMENU_ADDONS = path.join(stageDir, "addons.json");
    process.env.FBRP_FIVEM_ORIGIN = "http://127.0.0.1:9/fbrp_core";
    await writeFile(process.env.FBRP_VMENU_ADDONS, `${JSON.stringify({ peds: [] }, null, 2)}\n`);
  } else {
    // The authoritative [eup] and vMenu config folders are the game server's, mounted at the live checkout.
    process.env.FBRP_EUP_DIR ||= path.join(LIVE_ROOT, "server-data/resources/[eup]");
    process.env.FBRP_VMENU_ADDONS ||= path.join(LIVE_ROOT, "server-data/resources/[standalone]/vMenu/config/addons.json");
  }

  const rows = [];
  const { createCustomAssets, EUP_DIR } = await import("./custom-assets.js");
  const { UPLOAD_DIR } = await import("./personal-import.js");
  const { db, audit } = stageDir ? { db: stagedDb(rows), audit: async () => null } : await import("./database.js");
  const customAssets = createCustomAssets({
    personals: { assertManager: async () => {}, canManage: async () => true },
    audit,
    db,
  });

  await mkdir(UPLOAD_DIR, { recursive: true });
  const uploadId = randomBytes(12).toString("hex");
  const zip = path.join(UPLOAD_DIR, `${uploadId}.zip`);
  await zipFolder(path.resolve(values.dir), zip);
  const result = await customAssets.installEup(owner, {
    uploadId, name: values.name, label: values.label || values.name, notes: values.notes || "", replace: values.replace,
  });
  if (stageDir) await writeFile(path.join(stageDir, "custom_eup-row.json"), `${JSON.stringify(rows[0] || null, null, 2)}\n`);
  return { result, eupDir: EUP_DIR, stageDir, row: rows[0] || null };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  installEupFolder().then(({ result, eupDir, stageDir }) => {
    const { eup } = result;
    console.log(JSON.stringify({
      resource: eup.resource, label: eup.label, owner: eup.created_by, files: eup.files, bytes: eup.bytes, pieces: eup.pieces.length,
      groups: result.groups, security: result.security, notes: result.notes, warnings: result.warnings, installedAt: eupDir, staged: Boolean(stageDir),
    }, null, 2));
    process.exit(0);
  }).catch((error) => {
    console.error(`EUP install failed: ${error.message}`);
    process.exit(1);
  });
}
