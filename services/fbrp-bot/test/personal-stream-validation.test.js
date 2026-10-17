import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { deflateRawSync } from "node:zlib";

const { validateStreamAsset } = await import("../src/personal-import.js");
const dir = await mkdtemp(path.join(tmpdir(), "fbrp-stream-validation-"));

const fileAt = async (name, contents) => {
  const full = path.join(dir, name);
  await writeFile(full, contents);
  return { full, rel: `stream/${name}` };
};

const resource = (contents, declaredBytes = contents.length) => {
  const header = Buffer.alloc(16);
  header.write("RSC7");
  header.writeUInt32LE(162, 4);
  // Tests use a single 512-byte page. A zero declaration exercises header rejection.
  header.writeUInt32LE(declaredBytes ? 0xa8000000 : 0xa0000000, 8);
  header.writeUInt32LE(0x20000000, 12);
  return Buffer.concat([header, deflateRawSync(contents)]);
};

test("accepts a complete compiled RSC7 stream resource", async () => {
  await validateStreamAsset(await fileAt("car.yft", resource(Buffer.alloc(512, 7))));
});

test("rejects a CodeWalker XML export saved with a YFT extension", async () => {
  const file = await fileAt("car.yft", "<?xml version='1.0'?><Fragment><Name>pack:/car</Name></Fragment>");
  await assert.rejects(validateStreamAsset(file), /CodeWalker XML export.*binary YFT/);
});

test("rejects corrupt and truncated RSC7 payloads", async () => {
  const corrupt = Buffer.concat([resource(Buffer.alloc(512)).subarray(0, 16), Buffer.from("not deflate data")]);
  await assert.rejects(validateStreamAsset(await fileAt("bad.yft", corrupt)), /corrupt/);
  await assert.rejects(validateStreamAsset(await fileAt("short.yft", resource(Buffer.alloc(256, 1)))), /declares 512 expanded bytes but contains 256/);
});
