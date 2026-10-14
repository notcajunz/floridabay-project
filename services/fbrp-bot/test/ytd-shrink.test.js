import assert from "node:assert/strict";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import test from "node:test";
import { describeYtd, planLayout, shrinkYtd } from "../src/ytd-shrink.js";

const DXT5 = Buffer.from("DXT5", "latin1").readUInt32LE(0);

function mips(width, height, levels, blockBytes, seed) {
  const parts = [];
  for (let level = 0; level < levels; level++) {
    const w = Math.max(1, width >> level);
    const h = Math.max(1, height >> level);
    const size = blockBytes ? Math.max(1, Math.ceil(w / 4)) * Math.max(1, Math.ceil(h / 4)) * blockBytes : w * h * 4;
    parts.push(Buffer.alloc(size, seed + level));
  }
  return parts;
}

/** A small valid-looking RSC7 texture dictionary: system page of 8 KiB, 4 graphics pages of 2 MiB. */
function buildYtd(textures) {
  const system = Buffer.alloc(0x2000);
  const graphics = Buffer.alloc(8 * 1024 * 1024);
  system.writeUInt32LE(0x50000100, 8);
  system[0x108] = 1;
  system[0x109] = 4;
  system.writeUInt32LE(0x50000200, 0x30);
  system.writeUInt16LE(textures.length, 0x38);
  system.writeUInt16LE(textures.length, 0x3a);
  let cursor = 0;
  textures.forEach((texture, index) => {
    const at = 0x300 + index * 0x90;
    system.writeUInt32LE(0x50000000 + at, 0x200 + index * 8);
    const name = Buffer.from(`${texture.name}\0`);
    name.copy(system, 0x1000 + index * 64);
    system.writeUInt32LE(0x50001000 + index * 64, at + 0x28);
    system.writeUInt16LE(texture.width, at + 0x50);
    system.writeUInt16LE(texture.height, at + 0x52);
    system.writeUInt16LE(1, at + 0x54);
    system.writeUInt16LE(texture.stride, at + 0x56);
    system.writeUInt32LE(texture.format, at + 0x58);
    system[at + 0x5d] = texture.levels.length;
    const total = texture.levels.reduce((sum, level) => sum + level.length, 0);
    system.writeUInt32LE((0x20000001 | (Math.ceil(total / 4096) << 12)) >>> 0, at + 0x40);
    system.writeUInt32LE(0x60000000 + cursor, at + 0x70);
    let position = cursor;
    for (const level of texture.levels) { level.copy(graphics, position); position += level.length; }
    cursor = Math.ceil(position / 4096) * 4096;
  });
  // system: one 8 KiB page (shift 4, one 1x page); graphics: shift 7 (64 KiB base), 4 x 16x pages (1 MiB each... 4 MiB)
  const systemFlags = ((1 << 27) | 4) >>> 0;
  const graphicsFlags = ((0xd << 28) | (4 << 17) | 7) >>> 0;
  const graphicsSize = 4 * 16 * 0x200 * 2 ** 7;
  const header = Buffer.alloc(16);
  header.write("RSC7", 0, "latin1");
  header.writeUInt32LE(13, 4);
  header.writeUInt32LE(systemFlags, 8);
  header.writeUInt32LE(graphicsFlags, 12);
  return Buffer.concat([header, deflateRawSync(Buffer.concat([system, graphics.subarray(0, graphicsSize)]))]);
}

test("layout keeps every block inside one page and respects page counts", () => {
  const sizes = [5592400, 2796192, 2796192, 1398128, 1398128, 262144, 9216, 5000, 4096];
  const layout = planLayout(sizes);
  assert.ok(layout.total >= sizes.reduce((a, b) => a + Math.ceil(b / 4096) * 4096, 0));
  assert.ok(layout.pages <= 255);
  const seen = [...layout.offsets.entries()].sort((a, b) => a[1] - b[1]);
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i][1] >= seen[i - 1][1] + Math.ceil(sizes[seen[i - 1][0]] / 4096) * 4096);
  assert.ok(seen.every(([, offset]) => offset % 4096 === 0));
});

test("big mip-mapped and uncompressed textures are lowered, small ones are untouched", () => {
  const big = mips(512, 512, 10, 16, 10);
  const argb = mips(512, 512, 1, 0, 200);
  const small = mips(64, 64, 7, 16, 50);
  const file = buildYtd([
    { name: "big_d", width: 512, height: 512, stride: 512, format: DXT5, levels: big },
    { name: "argb_rt", width: 512, height: 512, stride: 2048, format: 21, levels: argb },
    { name: "small", width: 64, height: 64, stride: 64, format: DXT5, levels: small },
  ]);
  assert.equal(describeYtd(file).graphicsBytes, 4 * 1024 * 1024);

  const result = shrinkYtd(file, { targetBytes: 512 * 1024, minDimension: 32 });
  assert.equal(result.changed, true);
  assert.ok(result.after <= 512 * 1024 + 1, `after ${result.after}`);
  assert.ok(result.after < result.before);

  const described = describeYtd(result.buffer);
  const byName = Object.fromEntries(described.textures.map((t) => [t.name, t]));
  assert.ok(byName.big_d.width < 512);
  assert.equal(byName.big_d.levels, 10 - Math.log2(512 / byName.big_d.width));
  assert.ok(byName.argb_rt.width < 512);
  assert.equal(byName.small.width, 64);

  // The kept mip levels are byte for byte the originals.
  const raw = inflateRawSync(result.buffer.subarray(16));
  assert.equal(raw.length, 0x2000 + described.graphicsBytes);
  const system = raw.subarray(0, 0x2000);
  const graphics = raw.subarray(0x2000);
  const at = 0x300;
  const dropped = Math.log2(512 / byName.big_d.width);
  const start = system.readUInt32LE(at + 0x70) - 0x60000000;
  assert.ok(graphics.subarray(start, start + big[dropped].length).equals(big[dropped]));
  assert.equal(system.readUInt16LE(at + 0x56), byName.big_d.width);
  assert.equal(system[0x108], 1);
  assert.ok(system[0x109] >= 1);
});

test("a dictionary already within the target is returned as is", () => {
  const file = buildYtd([{ name: "tiny", width: 64, height: 64, stride: 64, format: DXT5, levels: mips(64, 64, 7, 16, 1) }]);
  const result = shrinkYtd(file, { targetBytes: 8 * 1024 * 1024 });
  assert.equal(result.changed, false);
  assert.equal(result.buffer, file);
});

test("files that are not a texture dictionary are rejected", () => {
  assert.throws(() => shrinkYtd(Buffer.alloc(64)), /RSC7/);
});
