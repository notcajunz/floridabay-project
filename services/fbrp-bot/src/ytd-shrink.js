import { deflateRawSync, inflateRawSync } from "node:zlib";

/**
 * Makes a GTA V texture dictionary (.ytd, RSC7) smaller by lowering texture resolution.
 *
 * Mip-mapped textures lose their largest mip levels (no re-encoding, the kept levels are copied byte
 * for byte). Single-level uncompressed textures are box filtered down. Block compressed textures with
 * a single level are left alone. The graphics segment is then laid out again with new page flags.
 *
 * FiveM reports a dictionary's physical memory from those flags, so the dictionary only streams
 * reliably once the allocation (not just the pixel data) is small.
 */

const MAGIC = 0x37435352; // "RSC7"
const SYSTEM_BASE = 0x50000000;
const GRAPHICS_BASE = 0x60000000;
const ALIGN = 4096;
const TIER_UNITS = [1, 2, 4, 8, 16, 32, 64, 128, 256];
const TIER_CAP = [1, 1, 1, 1, 127, 63, 15, 3, 1];
const MIN_SHIFT = 3; // 4 KiB base pages, so every block stays 4 KiB aligned
const MAX_SHIFT = 12;

/** FiveM recommends at most 16 MiB per dictionary, warns above 32 MiB and fails to stream around 64 MiB. */
export const TARGET_BYTES = 16 * 1024 * 1024;

const fourCC = (text) => Buffer.from(text, "latin1").readUInt32LE(0);
/** Block compressed formats (bytes per 4x4 block) and uncompressed ones (bytes per pixel). */
const FORMATS = new Map([
  [fourCC("DXT1"), { block: 8 }],
  [fourCC("DXT3"), { block: 16 }],
  [fourCC("DXT5"), { block: 16 }],
  [fourCC("ATI1"), { block: 8 }],
  [fourCC("ATI2"), { block: 16 }],
  [fourCC("BC7 "), { block: 16 }],
  [21, { bpp: 4 }], // A8R8G8B8
  [22, { bpp: 4 }], // X8R8G8B8
  [32, { bpp: 4 }], // A8B8G8R8
  [28, { bpp: 1 }], // A8
  [50, { bpp: 1 }], // L8
  [23, { bpp: 2 }], // R5G6B5
  [25, { bpp: 2 }], // A1R5G5B5
]);

const alignUp = (value, step = ALIGN) => Math.ceil(value / step) * step;

function pageCounts(flags) {
  return [
    (flags >>> 27) & 1, (flags >>> 26) & 1, (flags >>> 25) & 1, (flags >>> 24) & 1,
    (flags >>> 17) & 0x7f, (flags >>> 11) & 0x3f, (flags >>> 7) & 0xf, (flags >>> 5) & 3, (flags >>> 4) & 1,
  ];
}

function segmentBytes(flags) {
  const base = 0x200 * 2 ** (flags & 0xf);
  return pageCounts(flags).reduce((sum, count, tier) => sum + count * TIER_UNITS[tier], 0) * base;
}

function encodeFlags(top, shift, counts) {
  return (
    ((top & 0xf0000000) |
      (counts[0] << 27) | (counts[1] << 26) | (counts[2] << 25) | (counts[3] << 24) |
      (counts[4] << 17) | (counts[5] << 11) | (counts[6] << 7) | (counts[7] << 5) | (counts[8] << 4) |
      shift) >>> 0
  );
}

function levelBytes(format, width, height) {
  return format.block
    ? Math.max(1, Math.ceil(width / 4)) * Math.max(1, Math.ceil(height / 4)) * format.block
    : width * height * format.bpp;
}

/** Reads the dictionary. Throws when it is not a layout this module understands. */
function parse(file) {
  if (file.length < 32 || file.readUInt32LE(0) !== MAGIC) throw new Error("not an RSC7 resource");
  const systemFlags = file.readUInt32LE(8);
  const graphicsFlags = file.readUInt32LE(12);
  const systemSize = segmentBytes(systemFlags);
  const graphicsSize = segmentBytes(graphicsFlags);
  if (!systemSize || systemSize > 64 * 1024 * 1024 || graphicsSize > 1024 * 1024 * 1024) throw new Error("unexpected segment sizes");
  const raw = inflateRawSync(file.subarray(16), { maxOutputLength: systemSize + graphicsSize + 1 });
  if (raw.length !== systemSize + graphicsSize) throw new Error("segment sizes do not match the data");
  const system = raw.subarray(0, systemSize);
  const graphics = raw.subarray(systemSize);

  const sysPointer = (value, high) => {
    if (high !== 0 || (value & 0xf0000000) >>> 0 !== SYSTEM_BASE || value - SYSTEM_BASE >= systemSize) throw new Error("bad system pointer");
    return value - SYSTEM_BASE;
  };
  const listAt = sysPointer(system.readUInt32LE(0x30), system.readUInt32LE(0x34));
  const count = system.readUInt16LE(0x38);
  if (!count || count > 2048 || system.readUInt16LE(0x3a) < count) throw new Error("unexpected texture count");
  const pagesInfo = sysPointer(system.readUInt32LE(8), system.readUInt32LE(12));
  const systemPages = pageCounts(systemFlags).reduce((a, b) => a + b, 0);
  const graphicsPages = pageCounts(graphicsFlags).reduce((a, b) => a + b, 0);
  if (system[pagesInfo + 8] !== systemPages || system[pagesInfo + 9] !== graphicsPages) throw new Error("page info does not match the flags");

  const textures = [];
  for (let i = 0; i < count; i++) {
    const at = sysPointer(system.readUInt32LE(listAt + i * 8), system.readUInt32LE(listAt + i * 8 + 4));
    if (at + 0x90 > systemSize) throw new Error("texture outside the system segment");
    const width = system.readUInt16LE(at + 0x50);
    const height = system.readUInt16LE(at + 0x52);
    const stride = system.readUInt16LE(at + 0x56);
    const formatId = system.readUInt32LE(at + 0x58);
    const levels = system[at + 0x5d];
    const format = FORMATS.get(formatId);
    if (!format) throw new Error(`unsupported texture format 0x${formatId.toString(16)}`);
    if (!width || !height || width > 8192 || height > 8192 || !levels || levels > 16) throw new Error("unexpected texture dimensions");
    const dataLow = system.readUInt32LE(at + 0x70);
    if (system.readUInt32LE(at + 0x74) !== 0 || (dataLow & 0xf0000000) >>> 0 !== GRAPHICS_BASE) throw new Error("bad texture data pointer");
    const start = dataLow - GRAPHICS_BASE;
    const chain = [];
    let w = width;
    let h = height;
    let position = start;
    for (let level = 0; level < levels; level++) {
      const size = levelBytes(format, w, h);
      if (position + size > graphicsSize) throw new Error("texture data outside the graphics segment");
      chain.push({ width: w, height: h, data: Buffer.from(graphics.subarray(position, position + size)) });
      position += size;
      w = Math.max(1, w >> 1);
      h = Math.max(1, h >> 1);
    }
    const nameAt = system.readUInt32LE(at + 0x28) - SYSTEM_BASE;
    const name = nameAt > 0 && nameAt < systemSize ? system.toString("latin1", nameAt, Math.min(systemSize, nameAt + 64)).split("\0")[0] : "";
    // Bits 12..23 of this word hold the data size in 4 KiB units; it must agree with the data.
    const pages = (system.readUInt32LE(at + 0x40) >>> 12) & 0xfff;
    const total = chain.reduce((sum, level) => sum + level.data.length, 0);
    if (pages !== Math.ceil(total / ALIGN)) throw new Error("texture size field does not match its data");
    textures.push({ at, name, format, formatId, width, height, stride, chain });
  }
  return { version: file.readUInt32LE(4), systemFlags, graphicsFlags, system, graphicsSize, pagesInfo, textures };
}

function halveBox(level, format) {
  const bpp = format.bpp;
  const width = Math.max(1, level.width >> 1);
  const height = Math.max(1, level.height >> 1);
  const out = Buffer.alloc(width * height * bpp);
  for (let y = 0; y < height; y++) {
    const y0 = Math.min(level.height - 1, y * 2);
    const y1 = Math.min(level.height - 1, y * 2 + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.min(level.width - 1, x * 2);
      const x1 = Math.min(level.width - 1, x * 2 + 1);
      for (let c = 0; c < bpp; c++) {
        const sum = level.data[(y0 * level.width + x0) * bpp + c] + level.data[(y0 * level.width + x1) * bpp + c]
          + level.data[(y1 * level.width + x0) * bpp + c] + level.data[(y1 * level.width + x1) * bpp + c];
        out[(y * width + x) * bpp + c] = (sum + 2) >> 2;
      }
    }
  }
  return { width, height, data: out };
}

const sizeOf = (texture) => texture.chain.reduce((sum, level) => sum + level.data.length, 0);

/** Whether halving the texture's resolution is possible. */
function canHalve(texture, minDimension) {
  const top = texture.chain[0];
  if (Math.max(top.width, top.height) <= minDimension) return false;
  if (texture.chain.length > 1) return true;
  return Boolean(texture.format.bpp === 4 || texture.format.bpp === 1) && top.width > 1 && top.height > 1;
}

function halve(texture) {
  if (texture.chain.length > 1) texture.chain.shift();
  else texture.chain = [halveBox(texture.chain[0], texture.format)];
}

/**
 * Smallest legal allocation for these block sizes: base page size, per-size page counts and where
 * each block lands. Blocks never cross a page, pages are laid out largest first.
 */
export function planLayout(sizes) {
  const blocks = sizes.map((size, index) => ({ index, size: alignUp(size) })).sort((a, b) => b.size - a.size);
  let best = null;
  for (let shift = MIN_SHIFT; shift <= MAX_SHIFT; shift++) {
    const base = 0x200 * 2 ** shift;
    const tierSize = TIER_UNITS.map((units) => units * base);
    const smallestTier = (bytes) => tierSize.findIndex((size) => size >= bytes);
    for (let uniform = 0; uniform < TIER_UNITS.length; uniform++) {
      const pageSize = tierSize[uniform];
      const pages = [];
      let feasible = true;
      for (const block of blocks) {
        if (block.size > pageSize) {
          const tier = smallestTier(block.size);
          if (tier < 0) { feasible = false; break; }
          pages.push({ items: [{ index: block.index, at: 0, size: block.size }], used: block.size, capacity: tierSize[tier] });
          continue;
        }
        const page = pages.find((candidate) => candidate.capacity === pageSize && candidate.capacity - candidate.used >= block.size);
        if (page) {
          page.items.push({ index: block.index, at: page.used, size: block.size });
          page.used += block.size;
        } else pages.push({ items: [{ index: block.index, at: 0, size: block.size }], used: block.size, capacity: pageSize });
      }
      if (!feasible) continue;
      // Shrink each page to the smallest size that holds it, within the allowed page counts.
      const taken = new Array(TIER_UNITS.length).fill(0);
      for (const page of [...pages].sort((a, b) => b.used - a.used)) {
        let tier = smallestTier(page.used);
        while (tier < TIER_UNITS.length && taken[tier] >= TIER_CAP[tier]) tier++;
        if (tier >= TIER_UNITS.length) { feasible = false; break; }
        taken[tier]++;
        page.tier = tier;
        page.capacity = tierSize[tier];
      }
      if (!feasible || taken.reduce((a, b) => a + b, 0) > 255) continue;
      const total = pages.reduce((sum, page) => sum + page.capacity, 0);
      if (!best || total < best.total) best = { shift, counts: taken, total, pages };
    }
  }
  if (!best) throw new Error("no valid page layout");
  const ordered = [...best.pages].sort((a, b) => b.capacity - a.capacity);
  const offsets = new Map();
  let cursor = 0;
  for (const page of ordered) {
    for (const item of page.items) offsets.set(item.index, cursor + item.at);
    cursor += page.capacity;
  }
  return { shift: best.shift, counts: best.counts, total: best.total, pages: ordered.length, offsets };
}

/**
 * @param {Buffer} file  contents of a .ytd
 * @param {{targetBytes?: number, minDimension?: number}} [options]
 * @returns {{buffer: Buffer, changed: boolean, before: number, after: number, textures: object[]}}
 */
export function shrinkYtd(file, { targetBytes = TARGET_BYTES, minDimension = 32 } = {}) {
  const dictionary = parse(file);
  const before = dictionary.graphicsSize;
  const original = dictionary.textures.map((texture) => ({
    width: texture.chain[0].width, height: texture.chain[0].height, levels: texture.chain.length, stride: texture.stride, width0: texture.width,
  }));
  if (before <= targetBytes) return { buffer: file, changed: false, before, after: before, textures: [] };

  let layout = planLayout(dictionary.textures.map(sizeOf));
  while (layout.total > targetBytes) {
    let pick = null;
    for (const texture of dictionary.textures) {
      if (canHalve(texture, minDimension) && (!pick || sizeOf(texture) > sizeOf(pick))) pick = texture;
    }
    if (!pick) break;
    halve(pick);
    layout = planLayout(dictionary.textures.map(sizeOf));
  }
  if (layout.total >= before) return { buffer: file, changed: false, before, after: before, textures: [] };

  const system = Buffer.from(dictionary.system);
  const graphics = Buffer.alloc(layout.total);
  const textures = [];
  dictionary.textures.forEach((texture, index) => {
    const top = texture.chain[0];
    const start = layout.offsets.get(index);
    let position = start;
    for (const level of texture.chain) {
      level.data.copy(graphics, position);
      position += level.data.length;
    }
    const was = original[index];
    system.writeUInt16LE(top.width, texture.at + 0x50);
    system.writeUInt16LE(top.height, texture.at + 0x52);
    system.writeUInt16LE(Math.max(1, Math.round((was.stride * top.width) / was.width)), texture.at + 0x56);
    system[texture.at + 0x5d] = texture.chain.length;
    system.writeUInt32LE((GRAPHICS_BASE + start) >>> 0, texture.at + 0x70);
    const pages = Math.ceil(sizeOf(texture) / ALIGN);
    const word = system.readUInt32LE(texture.at + 0x40);
    system.writeUInt32LE(((word & ~(0xfff << 12)) | (pages << 12)) >>> 0, texture.at + 0x40);
    if (top.width !== was.width || top.height !== was.height) {
      textures.push({ name: texture.name, from: `${was.width}x${was.height}`, to: `${top.width}x${top.height}` });
    }
  });
  system[dictionary.pagesInfo + 9] = layout.pages;

  const header = Buffer.alloc(16);
  header.writeUInt32LE(MAGIC, 0);
  header.writeUInt32LE(dictionary.version, 4);
  header.writeUInt32LE(dictionary.systemFlags, 8);
  header.writeUInt32LE(encodeFlags(dictionary.graphicsFlags, layout.shift, layout.counts), 12);
  const buffer = Buffer.concat([header, deflateRawSync(Buffer.concat([system, graphics]), { level: 9 })]);
  return { buffer, changed: true, before, after: layout.total, textures };
}

/** Reads back what a (shrunk) dictionary allocates, for checks and reports. */
export function describeYtd(file) {
  const dictionary = parse(file);
  return {
    graphicsBytes: dictionary.graphicsSize,
    textures: dictionary.textures.map((texture) => ({ name: texture.name, width: texture.chain[0].width, height: texture.chain[0].height, levels: texture.chain.length })),
  };
}
