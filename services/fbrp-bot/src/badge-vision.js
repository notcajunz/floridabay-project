/**
 * AI badge reading, used once when a badge picture is uploaded. Only the callsign is ever replaced on a
 * badge (names and ranks are printed on the template and never change). The lightest ChatGPT vision model
 * (BADGE_AI_MODEL, default gpt-5.4-nano) is shown close-ups of the pieces of text found on the picture and
 * says which one is the callsign. Small models place boxes only roughly, so the finding is done in the
 * pixels: the sample callsign (for example "5XX" or "2A-14") is measured, fitted for curvature and erased
 * so the member's own callsign can be printed in its place. Everything works on RGBA pixel arrays from png.js.
 */

import { decodePng, downscale, encodePng } from "./png.js";

export const DEFAULT_BADGE_MODEL = "gpt-5.4-nano";
const MODEL_SIDE = 1100;

const DIGITS = {
  0: "111101101101111", 1: "010110010010111", 2: "111001111100111", 3: "111001111001111", 4: "101101111001001",
  5: "111100111001111", 6: "111100111101111", 7: "111001001001001", 8: "111101111101111", 9: "111101111001111",
};

function blend(image, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const o = (y * image.width + x) * 4;
  image.data[o] = image.data[o] * (1 - a) + r * a;
  image.data[o + 1] = image.data[o + 1] * (1 - a) + g * a;
  image.data[o + 2] = image.data[o + 2] * (1 - a) + b * a;
  image.data[o + 3] = 255;
}

function label(image, text, cx, cy, scale, color) {
  const width = (text.length * 4 - 1) * scale;
  const left = Math.round(cx - width / 2);
  const top = Math.round(cy - (5 * scale) / 2);
  for (let y = top - scale; y < top + 5 * scale + scale; y += 1)
    for (let x = left - scale; x < left + width + scale; x += 1) blend(image, x, y, 0, 0, 0, 0.72);
  [...text].forEach((digit, index) => {
    const pattern = DIGITS[digit];
    for (let row = 0; row < 5; row += 1) for (let col = 0; col < 3; col += 1) {
      if (pattern[row * 3 + col] !== "1") continue;
      for (let dy = 0; dy < scale; dy += 1) for (let dx = 0; dx < scale; dx += 1)
        blend(image, left + (index * 4 + col) * scale + dx, top + row * scale + dy, color[0], color[1], color[2], 1);
    }
  });
}

/** A copy with a percentage ruler grid: magenta verticals and cyan horizontals every 5 percent, labelled every 10. */
export function withRuler(source) {
  const image = { width: source.width, height: source.height, data: Uint8Array.from(source.data) };
  const scale = Math.max(2, Math.round(Math.min(image.width, image.height) / 220));
  for (let i = 1; i < 20; i += 1) {
    const major = i % 2 === 0;
    const alpha = major ? 0.55 : 0.22;
    const x = Math.round((image.width * i) / 20);
    const y = Math.round((image.height * i) / 20);
    for (let k = 0; k < image.height; k += 1) blend(image, x, k, 255, 0, 255, alpha);
    for (let k = 0; k < image.width; k += 1) blend(image, k, y, 0, 255, 255, alpha);
  }
  for (let i = 1; i < 10; i += 1) {
    const text = String(i * 10);
    const x = (image.width * i) / 10;
    const y = (image.height * i) / 10;
    const h = 5 * scale + 2 * scale;
    label(image, text, x, h, scale, [255, 140, 255]);
    label(image, text, x, image.height - h, scale, [255, 140, 255]);
    const w = (text.length * 4 - 1) * scale + 2 * scale;
    label(image, text, w, y, scale, [110, 255, 255]);
    label(image, text, image.width - w, y, scale, [110, 255, 255]);
  }
  return image;
}

const FIELD_SCHEMA = {
  type: "object", additionalProperties: false, required: ["fields"],
  properties: {
    fields: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["key", "found", "x", "y", "w", "h", "current_text", "text_color", "align", "bold", "serif", "uppercase", "shape"],
        properties: {
          key: { type: "string", enum: ["name", "rank", "callsign", "department", "avatar"] },
          found: { type: "boolean" },
          x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" },
          current_text: { type: "string" },
          text_color: { type: "string" },
          align: { type: "string", enum: ["left", "center", "right"] },
          bold: { type: "boolean" }, serif: { type: "boolean" }, uppercase: { type: "boolean" },
          shape: { type: "string", enum: ["circle", "square"] },
        },
      },
    },
  },
};

const INSTRUCTIONS = `You read ID badge template pictures (police, fire, EMS, security or other departments) and say where the badge holder's details go.
The picture has a percentage ruler: magenta vertical and cyan horizontal lines every 5 percent, numbered every 10 percent on all four edges. Read positions from it carefully and answer in percent of the picture (0-100, decimals allowed): x,y is the top-left corner of a box and w,h its size.
Return one entry for each key:
- name: the holder's personal name.
- rank: the holder's rank or job title.
- callsign: callsign, badge number, unit number or ID number.
- department: the agency or department name, only when it is on a single line of text. If it is split over several lines or banners, use found=false.
- avatar: the frame for the holder's photo.
Rules:
- When the template already shows sample text for a field (for example JOHN SMITH, PROBATIONARY AGENT or 5XX), the box must tightly surround only that sample and current_text must be exactly that text. Never include small printed labels such as NAME: or RANK:. Fixed text that belongs to the design (EST. 2026, motto, logo words) is not a field.
- When a field only has a label, a line or empty space, the box is the empty space where the value belongs (above a line, right of a label) and current_text is "".
- text_color is the hex colour of the sample text, or a readable colour for the empty space. bold and serif describe the sample lettering (serif=true for serif or blackletter style lettering). uppercase is true when the sample is all capitals. align is how the sample is aligned in its space.
- shape is the photo frame shape for avatar (circle or square), otherwise square.
- found=false (with zeros) when the badge has no place for that key.`;

async function callModel(input, { instructions, prompt, schema, name, fetchImpl = fetch, model = process.env.BADGE_AI_MODEL || DEFAULT_BADGE_MODEL }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set for the bot.");
  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      instructions,
      input: [{ role: "user", content: Array.isArray(input) ? input : [
        { type: "input_text", text: prompt },
        { type: "input_image", image_url: `data:image/png;base64,${input.toString("base64")}`, detail: "high" },
      ] }],
      text: { format: { type: "json_schema", name, strict: true, schema } },
    }),
    signal: AbortSignal.timeout(90000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`The AI could not read the badge: ${body.error?.message || response.status}`);
  const output = (body.output || []).flatMap((item) => item.content || []).find((part) => part.type === "output_text")?.text;
  if (!output) throw new Error("The AI returned no answer. Try again.");
  return JSON.parse(output);
}

const CHOICE_SCHEMA = {
  type: "object", additionalProperties: false, required: ["candidates"],
  properties: { candidates: { type: "array", items: {
    type: "object", additionalProperties: false,
    required: ["id", "text", "role", "bold", "serif", "align"],
    properties: {
      id: { type: "integer" },
      text: { type: "string" },
      role: { type: "string", enum: ["callsign_sample", "callsign_label", "other"] },
      bold: { type: "boolean" }, serif: { type: "boolean" },
      align: { type: "string", enum: ["left", "center", "right"] },
    },
  } } },
};

/** What a callsign looks like, so the model can tell it from a rank, a name or design wording. */
export const CALLSIGN_STYLES = Object.freeze({
  standard: {
    describe: "digit, letter, dash, two digits (like 2A-14), or two or three letters, dash, three digits (like AB-123 or ABC-123)",
    sample: "2A-14",
    widest: "ABC-123",
  },
  dhs: {
    describe: "three digits (like 201 or 5XX when the digits are masked)",
    sample: "201",
    widest: "000",
  },
});

/** Which callsign style an organization uses: Homefront Security has plain three-digit numbers. Exported for tests. */
export function callsignStyleFor(org) {
  return /homefront|homeland|\bd?hs\b|\bdohs\b/i.test(`${org?.name || ""} ${org?.slug || ""}`) ? "dhs" : "standard";
}

const instructionsFor = (style) => `You help fill in ID badge templates (police, fire, EMS, security or other departments).
You get the whole badge, then a list of candidates, each a close-up of one piece of text or a write-in line found on it, with its position. Only one thing matters: where the holder's CALLSIGN goes.
Callsigns on this badge look like: ${CALLSIGN_STYLES[style].describe}. On a template the sample may be masked (5XX, 0000, XXX) or be a real example.
Classify every candidate:
- callsign_sample: the sample or placeholder callsign printed on the template. text is exactly what the close-up reads. Pick at most one candidate, the best match.
- callsign_label: a printed label such as CALLSIGN, UNIT or BADGE # beside an empty space where the callsign is written (only when there is no sample callsign).
- other: everything else: ranks and titles (SERGEANT, PROBATIONARY AGENT), names, department wording, dates (EST. 2026), mottos, plain lines, ornaments.
Judge by meaning and shape: a short number or code on its own small plate is usually the callsign; a title on a banner is a rank and is "other". bold and serif describe the lettering (serif=true for serif or blackletter lettering). align is how the text sits in its space.
Answer for every candidate id.`;

function crop(image, box, pad) {
  const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
  const x0 = Math.max(0, Math.floor(box.x0 - bw * pad - 6)), x1 = Math.min(image.width, Math.ceil(box.x1 + bw * pad + 6));
  const y0 = Math.max(0, Math.floor(box.y0 - bh * pad - 6)), y1 = Math.min(image.height, Math.ceil(box.y1 + bh * pad + 6));
  const width = x1 - x0, height = y1 - y0;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1)
    for (let k = 0; k < 4; k += 1) data[(y * width + x) * 4 + k] = image.data[((y0 + y) * image.width + x0 + x) * 4 + k];
  // Small close-ups are enlarged so the model can read them.
  const grow = Math.max(1, Math.min(4, Math.floor(200 / Math.max(width, 1))));
  if (grow === 1) return { width, height, data };
  const big = new Uint8Array(width * grow * height * grow * 4);
  for (let y = 0; y < height * grow; y += 1) for (let x = 0; x < width * grow; x += 1)
    for (let k = 0; k < 4; k += 1) big[(y * width * grow + x) * 4 + k] = data[(Math.floor(y / grow) * width + Math.floor(x / grow)) * 4 + k];
  return { width: width * grow, height: height * grow, data: big };
}

const pct = (value, total) => Math.round((value / total) * 100);

/** One model call: what is each candidate? Returns [{ id, text, role, bold, serif, align }]. */
export async function chooseFields(image, lines, { style = "standard", ...options } = {}) {
  const whole = encodePng(downscale(image, 640));
  const content = [{ type: "input_text", text: "The whole badge template:" }, { type: "input_image", image_url: `data:image/png;base64,${whole.toString("base64")}`, detail: "low" }];
  for (const line of lines) {
    const png = encodePng(crop(image, line, line.kind === "rule" ? 0.05 : 0.25));
    content.push({
      type: "input_text",
      text: `Candidate ${line.id} (${line.kind === "rule" ? "a plain line" : "text"}) centred ${pct((line.x0 + line.x1) / 2, image.width)}% from the left and ${pct((line.y0 + line.y1) / 2, image.height)}% from the top, ${pct(line.x1 - line.x0, image.width)}% wide:`,
    });
    content.push({ type: "input_image", image_url: `data:image/png;base64,${png.toString("base64")}`, detail: "low" });
  }
  const answer = await callModel(content, { ...options, instructions: instructionsFor(style), schema: CHOICE_SCHEMA, name: "badge_callsign" });
  return answer.candidates || [];
}

/* ---------- finding pieces of text in the pixels ---------- */

const luma = (data, o) => 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];

/** Greyscale plus a box-blurred copy (the local surroundings), both as Float32Array. */
function surroundings(image, radius) {
  const { width, height, data } = image;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i += 1) gray[i] = luma(data, i * 4);
  const sums = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let row = 0;
    for (let x = 0; x < width; x += 1) {
      row += gray[y * width + x];
      sums[(y + 1) * (width + 1) + x + 1] = sums[y * (width + 1) + x + 1] + row;
    }
  }
  const mean = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - radius), y1 = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - radius), x1 = Math.min(width, x + radius + 1);
      const total = sums[y1 * (width + 1) + x1] - sums[y0 * (width + 1) + x1] - sums[y1 * (width + 1) + x0] + sums[y0 * (width + 1) + x0];
      mean[y * width + x] = total / ((y1 - y0) * (x1 - x0));
    }
  }
  return { gray, mean };
}

/** Connected components (8-neighbour) of a mask. Returns bbox, area, centroid and pixel list for each. */
function components(mask, width, height, minArea = 4) {
  const seen = new Uint8Array(mask.length);
  const found = [];
  const stack = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    const pixels = [];
    let x0 = width, y0 = height, x1 = 0, y1 = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const index = stack.pop();
      pixels.push(index);
      const x = index % width;
      const y = (index - x) / width;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (mask[next] && !seen[next]) { seen[next] = 1; stack.push(next); }
      }
    }
    if (pixels.length >= minArea) found.push({ x0, y0, x1: x1 + 1, y1: y1 + 1, area: pixels.length, pixels });
  }
  return found;
}

const spanOf = (items) => ({
  x0: Math.min(...items.map((c) => c.x0)), y0: Math.min(...items.map((c) => c.y0)),
  x1: Math.max(...items.map((c) => c.x1)), y1: Math.max(...items.map((c) => c.y1)),
});

/**
 * Candidate text lines: letter-sized dark-on-light or light-on-dark blobs that sit side by side along a
 * (possibly curved) baseline. Also thin horizontal rules, which mark write-in lines. Coordinates are in the
 * pixels of `image`. Exported for tests.
 */
export function findTextLines(image, { maxLines = 24 } = {}) {
  const { width, height } = image;
  const side = Math.max(width, height);
  const work = side > 800 ? downscale(image, 800) : image;
  const factor = image.width / work.width;
  const radius = Math.max(5, Math.round(work.width * 0.028));
  const { gray, mean } = surroundings(work, radius);
  const letters = [];
  const rules = [];
  for (const polarity of [-1, 1]) {
    const mask = new Uint8Array(gray.length);
    for (let i = 0; i < gray.length; i += 1) mask[i] = polarity * (gray[i] - mean[i]) > 26 ? 1 : 0;
    for (const c of components(mask, work.width, work.height, 5)) {
      const w = c.x1 - c.x0, h = c.y1 - c.y0;
      if (c.x0 <= 0 || c.y0 <= 0 || c.x1 >= work.width || c.y1 >= work.height) continue;
      c.polarity = polarity;
      if (h <= work.height * 0.014 && w >= work.width * 0.14) { rules.push(c); continue; }
      if (h < work.height * 0.014 || h > work.height * 0.16 || w > work.width * 0.2) continue;
      if (w / h > 5 || h / w > 7) continue;
      if (c.area < w * h * 0.1) continue;
      letters.push(c);
    }
  }
  const parent = letters.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < letters.length; i += 1) for (let j = i + 1; j < letters.length; j += 1) {
    const a = letters[i], b = letters[j];
    if (a.polarity !== b.polarity) continue;
    const ha = a.y1 - a.y0, hb = b.y1 - b.y0, big = Math.max(ha, hb);
    if (Math.min(ha, hb) / big < 0.55) continue;
    const gap = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1);
    if (gap > big * 1.15) continue;
    if (Math.abs((a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2) > big * 0.7) continue;
    parent[find(i)] = find(j);
  }
  const groups = new Map();
  letters.forEach((c, i) => { const k = find(i); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); });
  let lines = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const box = spanOf(members);
    if ((box.x1 - box.x0) < (box.y1 - box.y0) * 1.1) continue;
    lines.push({ kind: "text", ...box, letters: members, polarity: members[0].polarity });
  }
  // The same words can be found in both polarities (a dark outline round gold letters): keep the larger group.
  lines.sort((a, b) => b.letters.length - a.letters.length);
  const kept = [];
  for (const line of lines) {
    const overlaps = kept.some((k) => {
      const ix = Math.min(k.x1, line.x1) - Math.max(k.x0, line.x0);
      const iy = Math.min(k.y1, line.y1) - Math.max(k.y0, line.y0);
      return ix > 0 && iy > 0 && (ix * iy) / Math.min((k.x1 - k.x0) * (k.y1 - k.y0), (line.x1 - line.x0) * (line.y1 - line.y0)) > 0.5;
    });
    if (!overlaps) kept.push(line);
  }
  const result = kept.slice(0, maxLines);
  for (const rule of rules.slice(0, 8)) result.push({ kind: "rule", x0: rule.x0, y0: rule.y0, x1: rule.x1, y1: rule.y1, letters: [], polarity: rule.polarity });
  result.sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2 || a.x0 - b.x0);
  return result.map((line, index) => ({
    id: index + 1, kind: line.kind, polarity: line.polarity,
    x0: line.x0 * factor, y0: line.y0 * factor, x1: line.x1 * factor, y1: line.y1 * factor,
    letters: line.letters.map((c) => ({ x0: c.x0 * factor, y0: c.y0 * factor, x1: c.x1 * factor, y1: c.y1 * factor })),
  }));
}

/** A copy with each candidate boxed and numbered (the "set of marks" the model chooses from). */
export function withMarks(source, lines) {
  const image = { width: source.width, height: source.height, data: Uint8Array.from(source.data) };
  const scale = Math.max(2, Math.round(Math.min(image.width, image.height) / 160));
  const colors = [[255, 40, 40], [40, 120, 255], [255, 0, 255], [0, 200, 0], [255, 140, 0]];
  for (const line of lines) {
    const [r, g, b] = colors[line.id % colors.length];
    const x0 = Math.round(line.x0) - 2, x1 = Math.round(line.x1) + 2, y0 = Math.round(line.y0) - 2, y1 = Math.round(line.y1) + 2;
    for (let x = x0; x <= x1; x += 1) for (const y of [y0, y0 + 1, y1, y1 - 1]) blend(image, x, y, r, g, b, 1);
    for (let y = y0; y <= y1; y += 1) for (const x of [x0, x0 + 1, x1, x1 - 1]) blend(image, x, y, r, g, b, 1);
    const text = String(line.id);
    const w = (text.length * 4 - 1) * scale;
    const cx = Math.min(image.width - w / 2 - 2 * scale, Math.max(w / 2 + 2 * scale, x0 + w / 2 + scale));
    const cy = y0 - 4 * scale > 0 ? y0 - 3.5 * scale : y1 + 3.5 * scale;
    label(image, text, cx, cy, scale, [r, g, b]);
  }
  return image;
}

/* ---------- measuring, erasing and laying out the chosen text ---------- */

const hex = (r, g, b) => `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Solve the 3x3 normal equations for y = c + b*u + a*u^2. Returns null when the points are degenerate. */
function fitCurve(points) {
  const n = points.length;
  let s1 = 0, s2 = 0, s3 = 0, s4 = 0, t0 = 0, t1 = 0, t2 = 0;
  for (const [u, y] of points) {
    s1 += u; s2 += u * u; s3 += u ** 3; s4 += u ** 4; t0 += y; t1 += u * y; t2 += u * u * y;
  }
  const m = [[n, s1, s2, t0], [s1, s2, s3, t1], [s2, s3, s4, t2]];
  for (let col = 0; col < 3; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < 3; row += 1) if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let row = 0; row < 3; row += 1) {
      if (row === col) continue;
      const factor = m[row][col] / m[col][col];
      for (let k = col; k < 4; k += 1) m[row][k] -= factor * m[col][k];
    }
  }
  return { c: m[0][3] / m[0][0], b: m[1][3] / m[1][1], a: m[2][3] / m[2][2] };
}

const percentile = (values, p) => {
  const sorted = [...values].sort((x, y) => x - y);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
};

/**
 * Measure one sample text line: the letter height (so the font size matches), the colour, the curve of its
 * baseline (a, b are the quadratic and slope terms of the vertical offset as a fraction of the picture
 * height, against horizontal distance from the middle as a fraction of the picture width) and the width of
 * the plate or banner it sits on. Exported for tests.
 */
export function measureLine(image, line) {
  const { width, height, data } = image;
  const letters = line.letters.length ? line.letters : [line];
  const capHeight = percentile(letters.map((l) => l.y1 - l.y0), 0.7);
  const midX = (line.x0 + line.x1) / 2;
  const points = letters.map((l) => [((l.x0 + l.x1) / 2 - midX) / width, ((l.y0 + l.y1) / 2) / height]);
  let a = 0, b = 0, centre = ((line.y0 + line.y1) / 2) / height;
  const fit = points.length >= 3 ? fitCurve(points) : null;
  if (fit) {
    const span = Math.max(...points.map(([u]) => Math.abs(u)));
    const drift = Math.abs(fit.b) * span + Math.abs(fit.a) * span * span;
    // Ignore wobble smaller than a third of the letter height.
    if (drift * height > capHeight * 0.33) { a = clamp(fit.a, -4, 4); b = clamp(fit.b, -1.5, 1.5); centre = fit.c; }
  }
  // Colours: the extreme quarter of pixels inside the letter boxes is ink, the median of the rest is the plate.
  const samples = [];
  for (const l of letters) for (let y = Math.floor(l.y0); y < Math.ceil(l.y1); y += 1) for (let x = Math.floor(l.x0); x < Math.ceil(l.x1); x += 1) {
    const o = (y * width + x) * 4;
    samples.push([luma(data, o), data[o], data[o + 1], data[o + 2]]);
  }
  samples.sort((p, q) => p[0] - q[0]);
  const quarter = Math.max(1, Math.floor(samples.length / 4));
  const inkSet = line.polarity < 0 ? samples.slice(0, quarter) : samples.slice(-quarter);
  const mean = (set, k) => set.reduce((sum, row) => sum + row[k], 0) / Math.max(1, set.length);
  const ink = [mean(inkSet, 1), mean(inkSet, 2), mean(inkSet, 3)];
  // The plate is what surrounds the letters: a thin ring just outside each letter box.
  const ring = [];
  for (const l of letters) {
    const x0 = Math.max(0, Math.floor(l.x0) - 3), x1 = Math.min(width, Math.ceil(l.x1) + 3);
    const y0 = Math.max(0, Math.floor(l.y0) - 3), y1 = Math.min(height, Math.ceil(l.y1) + 3);
    for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) {
      if (x >= l.x0 && x < l.x1 && y >= l.y0 && y < l.y1) continue;
      ring.push(luma(data, (y * width + x) * 4));
    }
  }
  ring.sort((p, q) => p - q);
  const plateLuma = ring.length ? ring[Math.floor(ring.length / 2)] : 128;
  const inkLuma = luma([...ink, 255], 0);
  const midpoint = (inkLuma + plateLuma) / 2;
  // How much of the letter boxes is ink tells heavy lettering from light lettering.
  const inked = samples.filter((row) => (line.polarity < 0 ? row[0] < midpoint : row[0] > midpoint)).length;
  const inkFraction = inked / Math.max(1, samples.length);
  // Slot width: walk outwards along the text row until the plate ends.
  const row = clamp(Math.round(centre * height), 0, height - 1);
  const deviates = (x) => {
    let hits = 0;
    for (let dy = -2; dy <= 2; dy += 1) {
      const y = clamp(row + dy, 0, height - 1);
      if (Math.abs(luma(data, (y * width + x) * 4) - plateLuma) > 55) hits += 1;
    }
    return hits >= 3;
  };
  let left = Math.floor(line.x0);
  while (left > 0 && !deviates(left - 1) && line.x0 - left < width * 0.3) left -= 1;
  let right = Math.ceil(line.x1);
  while (right < width - 1 && !deviates(right + 1) && right - line.x1 < width * 0.3) right += 1;
  return {
    capHeight, a, b, centre, midX, color: hex(...ink), inkLuma, plateLuma, inkFraction,
    slot: { x0: Math.min(left, line.x0 - 2), x1: Math.max(right, line.x1 + 2) },
  };
}

/**
 * Remove a sample text from the picture: pixels of the letters (ink side of the midpoint between ink and
 * plate brightness, widened by a pixel or two) are filled in from their surroundings by repeated
 * averaging, which follows the gradients of a banner or plate. Edits `image` in place.
 */
export function eraseLine(image, line, measured) {
  const { width, height, data } = image;
  const threshold = (measured.inkLuma + measured.plateLuma) / 2;
  const darkInk = line.polarity < 0;
  const mask = new Uint8Array(width * height);
  const letters = line.letters.length ? line.letters : [line];
  // Every ink pixel in a band that follows the baseline curve, so letters the detector skipped go too.
  const half = measured.capHeight * 0.62 + 1;
  for (let x = Math.max(0, Math.floor(line.x0) - 1); x < Math.min(width, Math.ceil(line.x1) + 1); x += 1) {
    const u = (x - measured.midX) / width;
    const centreY = (measured.centre + measured.a * u * u + measured.b * u) * height;
    for (let y = Math.max(0, Math.floor(centreY - half)); y < Math.min(height, Math.ceil(centreY + half)); y += 1) {
      const value = luma(data, (y * width + x) * 4);
      if (darkInk ? value < threshold : value > threshold) mask[y * width + x] = 1;
    }
  }
  const grown = new Uint8Array(mask.length);
  const reach = Math.max(1, Math.round(measured.capHeight / 10));
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (!mask[y * width + x]) continue;
    for (let dy = -reach; dy <= reach; dy += 1) for (let dx = -reach; dx <= reach; dx += 1) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < width && ny < height) grown[ny * width + nx] = 1;
    }
  }
  const box = spanOf(letters);
  const slack = Math.ceil(measured.capHeight * 0.7);
  const x0 = Math.max(0, Math.floor(box.x0) - reach - 2), x1 = Math.min(width, Math.ceil(box.x1) + reach + 2);
  const y0 = Math.max(0, Math.floor(box.y0) - slack - reach - 2), y1 = Math.min(height, Math.ceil(box.y1) + slack + reach + 2);
  const known = new Uint8Array(width * height);
  const work = new Float32Array(width * height * 3);
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) {
    const i = y * width + x;
    if (!grown[i]) { known[i] = 1; for (let k = 0; k < 3; k += 1) work[i * 3 + k] = data[i * 4 + k]; }
  }
  // Seed unknown pixels from the nearest known neighbour on each sweep, then smooth.
  for (let pass = 0; pass < 60; pass += 1) {
    let remaining = 0;
    for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) {
      const i = y * width + x;
      if (known[i] && pass > 0) continue;
      if (known[i]) continue;
      let sum0 = 0, sum1 = 0, sum2 = 0, count = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < x0 || ny < y0 || nx >= x1 || ny >= y1) continue;
        const j = ny * width + nx;
        if (!known[j]) continue;
        sum0 += work[j * 3]; sum1 += work[j * 3 + 1]; sum2 += work[j * 3 + 2]; count += 1;
      }
      if (count) { work[i * 3] = sum0 / count; work[i * 3 + 1] = sum1 / count; work[i * 3 + 2] = sum2 / count; known[i] = 2; }
      else remaining += 1;
    }
    for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) if (known[y * width + x] === 2) known[y * width + x] = 1;
    if (!remaining) break;
  }
  // Light smoothing inside the filled area removes the streaks the sweeps leave.
  for (let round = 0; round < 3; round += 1) {
    const copy = Float32Array.from(work);
    for (let y = y0 + 1; y < y1 - 1; y += 1) for (let x = x0 + 1; x < x1 - 1; x += 1) {
      const i = y * width + x;
      if (!grown[i]) continue;
      for (let k = 0; k < 3; k += 1)
        work[i * 3 + k] = (copy[(i - 1) * 3 + k] + copy[(i + 1) * 3 + k] + copy[(i - width) * 3 + k] + copy[(i + width) * 3 + k] + copy[i * 3 + k] * 2) / 6;
    }
  }
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) {
    const i = y * width + x;
    if (grown[i]) for (let k = 0; k < 3; k += 1) data[i * 4 + k] = Math.round(work[i * 3 + k]);
  }
}

const GLYPH_CAP = 0.73; // cap height of the DejaVu fonts as a fraction of the font size
const round4 = (value) => Math.round(value * 10000) / 10000;
// Rough advance widths (in ems) of DejaVu Sans Bold, enough to size text for the longest normal callsign.
const EM_WIDTH = { digit: 0.696, upper: 0.78, dash: 0.415, other: 0.7 };
export const emWidth = (text) => [...text].reduce((sum, c) => sum + (/\d/.test(c) ? EM_WIDTH.digit : /[A-Za-z]/.test(c) ? EM_WIDTH.upper : c === "-" ? EM_WIDTH.dash : EM_WIDTH.other), 0);

/** Placement for a write-in value: above a rule when there is one, otherwise beside the label. */
function slotForLabel(image, label, lines) {
  const { width, height } = image;
  const h = label.y1 - label.y0;
  const rule = lines
    .filter((l) => l.kind === "rule" && l.x0 >= label.x0 && l.y1 > label.y0 - h * 0.5 && l.y0 < label.y1 + h * 2.2)
    .sort((p, q) => Math.abs(p.x0 - label.x1) - Math.abs(q.x0 - label.x1))[0];
  const capHeight = clamp(h * 1.05, height * 0.018, height * 0.09);
  if (rule) return { x0: rule.x0 + 4, x1: rule.x1 - 2, centre: (rule.y0 - 3 - capHeight / 2), capHeight };
  return { x0: label.x1 + width * 0.02, x1: width * 0.94, centre: (label.y0 + label.y1) / 2, capHeight };
}

/**
 * Turn the model's answer into the callsign placement and a cleaned copy of the picture (the sample callsign
 * erased). The text is sized so the longest normal callsign for `style` fits the space on one line.
 * Returns { fields: { callsign? }, cleaned (RGBA image or null), found, notes }. Exported for tests.
 */
export function layoutFromChoices(image, lines, choices, { style = "standard" } = {}) {
  const byId = new Map(lines.map((l) => [l.id, l]));
  const samples = choices.filter((c) => c.role === "callsign_sample" && byId.has(c.id) && byId.get(c.id).kind === "text");
  const labels = choices.filter((c) => c.role === "callsign_label" && byId.has(c.id));
  const widest = emWidth(CALLSIGN_STYLES[style].widest);
  const fit = (slotWidth, capHeight) => {
    const bySample = capHeight / GLYPH_CAP;
    const byWidth = (slotWidth * 0.96) / widest;
    return clamp(Math.min(bySample, byWidth) / image.height, 0.01, 0.4);
  };
  if (samples.length) {
    const choice = samples.sort((p, q) => byId.get(q.id).letters.length - byId.get(p.id).letters.length)[0];
    const line = byId.get(choice.id);
    const cleaned = { width: image.width, height: image.height, data: Uint8Array.from(image.data) };
    const m = measureLine(image, line);
    const align = choice.align;
    const x = align === "left" ? line.x0 : align === "right" ? line.x1 : (line.x0 + line.x1) / 2;
    const slotWidth = Math.max(m.slot.x1 - m.slot.x0, line.x1 - line.x0);
    eraseLine(cleaned, line, m);
    return {
      cleaned, found: ["callsign"], notes: [],
      fields: { callsign: {
        enabled: true, x: round4(clamp(x / image.width, 0, 1)), y: round4(clamp(m.centre, 0, 1)),
        size: round4(fit(slotWidth, m.capHeight)), color: m.color, align,
        weight: choice.bold || m.inkFraction > 0.3 ? "bold" : "regular", font: choice.serif ? "serif" : "sans",
        maxWidth: round4(clamp(slotWidth * 0.98 / image.width, 0.05, 1)),
        uppercase: true, bendA: align === "center" ? round4(m.a) : 0, bendB: align === "center" ? round4(m.b) : 0,
      } },
    };
  }
  if (labels.length) {
    const line = byId.get(labels[0].id);
    const slot = slotForLabel(image, line, lines);
    const m = measureLine(image, line);
    return {
      cleaned: null, found: ["callsign"], notes: ["no sample callsign was printed, so the space next to its label was used"],
      fields: { callsign: {
        enabled: true, x: round4(clamp(slot.x0 / image.width, 0, 1)), y: round4(clamp(slot.centre / image.height, 0, 1)),
        size: round4(fit(slot.x1 - slot.x0, slot.capHeight)), color: m.color, align: "left",
        weight: labels[0].bold ? "bold" : "regular", font: labels[0].serif ? "serif" : "sans",
        maxWidth: round4(clamp((slot.x1 - slot.x0) / image.width, 0.05, 1)), uppercase: true, bendA: 0, bendB: 0,
      } },
    };
  }
  return { cleaned: null, found: [], fields: {}, notes: ["the AI did not find a callsign space on this picture, so the default position was kept"] };
}

/** The whole job, one model call: find the callsign space on a template and erase its sample. */
export async function analyzeBadge(buffer, options = {}) {
  const image = decodePng(buffer);
  const lines = findTextLines(image);
  if (!lines.length) return { fields: {}, cleaned: null, found: [], notes: ["no text was found on the picture, so the default position was kept"] };
  const choices = await chooseFields(image, lines, options);
  return layoutFromChoices(image, lines, choices, { style: options.style || "standard" });
}
