/**
 * Organization badges. Each organization (usually a department) can upload a template picture per
 * badge tier and mark where the name, rank, callsign, department and profile picture go on it. The
 * Department Manager bot fills the template for a member (`/badge`), and the orgs website edits the
 * same templates in the organization's Badges tab.
 *
 * Placement is stored as fractions of the picture, so the website preview and the bot's renderer
 * agree at any size: x and y are 0..1 of the width and height, `size` is the font height as a
 * fraction of the picture height, and an avatar's `size` is its side as a fraction of the width.
 * `bendA` and `bendB` curve text along a banner: the vertical offset, as a fraction of the picture
 * height, is bendA*u*u + bendB*u where u is the horizontal distance from the text anchor as a
 * fraction of the picture width.
 *
 * Only the callsign is ever replaced on a badge: the name and rank are printed on the template and
 * never change (the other fields stay switched off). Each time a picture is uploaded the lightest
 * ChatGPT vision model is used once (badge-vision.js) to find the callsign space; the sample callsign
 * printed there is erased from the stored picture and the member's callsign is printed in its place.
 * The untouched upload is kept in `original`. Nothing re-runs the AI afterwards.
 */

import { sniffImage } from "./org-logos.js";
import { analyzeBadge, callsignStyleFor, CALLSIGN_STYLES } from "./badge-vision.js";
import { encodePng, isPng } from "./png.js";

export const BADGE_TIERS = Object.freeze({
  member: "Member",
  supervisor: "Supervisor",
  low_command: "Low Command",
  high_command: "High Command",
});
export const TIER_ORDER = Object.freeze(Object.keys(BADGE_TIERS));
export const BADGE_TEXT_FIELDS = Object.freeze({ name: "Name", callsign: "Callsign", rank: "Rank", department: "Department" });
export const MAX_BADGE_BYTES = 3 * 1024 * 1024;
export const MAX_BADGE_REQUEST_BYTES = 6 * 1024 * 1024;
const MAX_STORED_BYTES = 8 * 1024 * 1024;

const HEX = /^#[0-9a-f]{6}$/i;
const SNOWFLAKE = /^\d{15,24}$/;
const flag = (value) => value === true || value === 1 || value === "1" || value === "on" || value === "true";
const num = (value, min, max, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};
const round = (value) => Math.round(value * 10000) / 10000;

function textDefaults(y, size, enabled = true) {
  return { enabled, x: 0.5, y, size, color: "#ffffff", align: "center", weight: "bold", font: "sans", maxWidth: 0.84, uppercase: false, bendA: 0, bendB: 0 };
}

/** Where everything goes until the organization moves it. */
export function defaultFields() {
  return {
    name: textDefaults(0.62, 0.05, false),
    rank: textDefaults(0.7, 0.042, false),
    callsign: textDefaults(0.8, 0.085),
    department: textDefaults(0.1, 0.04, false),
    avatar: { enabled: false, x: 0.5, y: 0.32, size: 0.3, shape: "circle" },
  };
}

/** Validate field placement from the website or bot, filling anything missing from the defaults. Exported for tests. */
export function cleanFields(input, base = defaultFields()) {
  const source = input && typeof input === "object" ? input : {};
  const out = {};
  for (const key of Object.keys(BADGE_TEXT_FIELDS)) {
    const given = source[key] && typeof source[key] === "object" ? source[key] : {};
    const was = base[key];
    out[key] = {
      enabled: given.enabled === undefined ? was.enabled : flag(given.enabled),
      x: round(num(given.x, 0, 1, was.x)),
      y: round(num(given.y, 0, 1, was.y)),
      size: round(num(given.size, 0.01, 0.4, was.size)),
      color: HEX.test(String(given.color || "")) ? String(given.color).toLowerCase() : was.color,
      align: ["left", "center", "right"].includes(given.align) ? given.align : was.align,
      weight: ["bold", "regular"].includes(given.weight) ? given.weight : was.weight,
      font: ["sans", "serif"].includes(given.font) ? given.font : was.font || "sans",
      bendA: round(num(given.bendA, -4, 4, was.bendA || 0)),
      bendB: round(num(given.bendB, -1.5, 1.5, was.bendB || 0)),
      maxWidth: round(num(given.maxWidth, 0.05, 1, was.maxWidth)),
      uppercase: given.uppercase === undefined ? was.uppercase : flag(given.uppercase),
    };
  }
  const avatar = source.avatar && typeof source.avatar === "object" ? source.avatar : {};
  out.avatar = {
    enabled: avatar.enabled === undefined ? base.avatar.enabled : flag(avatar.enabled),
    x: round(num(avatar.x, 0, 1, base.avatar.x)),
    y: round(num(avatar.y, 0, 1, base.avatar.y)),
    size: round(num(avatar.size, 0.03, 0.9, base.avatar.size)),
    shape: ["circle", "square"].includes(avatar.shape) ? avatar.shape : base.avatar.shape,
  };
  return out;
}

/** The tier a rank wears unless the organization picked one: command ranks up, discipline ranks to supervisor. Exported for tests. */
export function defaultTier(rank, leader = false) {
  if (leader || flag(rank?.can_ranks)) return "high_command";
  if (flag(rank?.can_roster)) return "low_command";
  if (flag(rank?.can_discipline) || flag(rank?.can_announce)) return "supervisor";
  return "member";
}

/** Templates to try for a wanted tier: that tier, then lower ones, then higher ones. Exported for tests. */
export function tierFallbacks(tier) {
  const index = TIER_ORDER.indexOf(tier);
  if (index < 0) return [...TIER_ORDER];
  return [tier, ...TIER_ORDER.slice(0, index).reverse(), ...TIER_ORDER.slice(index + 1)];
}

/**
 * A badge slot is either a rank ("r12": that rank's own badge) or one of the older tier names. The default
 * badge, used by every rank without its own, is stored as "member". Exported for tests.
 */
export function cleanTier(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (/^r[1-9]\d{0,9}$/.test(raw)) return raw;
  if (raw === "default") return "member";
  if (!BADGE_TIERS[raw]) throw new Error("Pick the default badge or one of the department's ranks.");
  return raw;
}

export const rankSlot = (rankId) => `r${Number(rankId)}`;

/** Decode a data: URL into a validated template picture. Exported for tests. */
export function decodeBadgeImage(value) {
  const match = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(value || ""));
  if (!match) throw new Error("Choose a PNG, JPEG or WebP picture for the badge.");
  const buffer = Buffer.from(match[1], "base64");
  if (buffer.length > MAX_BADGE_BYTES)
    throw new Error(`That badge picture is ${(buffer.length / 1048576).toFixed(1)} MB. Templates can be at most ${MAX_BADGE_BYTES / 1048576} MB.`);
  const mime = sniffImage(buffer);
  if (!mime || mime === "image/gif") throw new Error("That file is not a PNG, JPEG or WebP picture.");
  return { buffer, mime };
}

const parse = (value, fallback) => {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(String(value ?? "")); } catch { return fallback; }
};

export function createOrgBadges({ db, economy, audit = async () => {}, analyze: analyzeBadgeFn = analyzeBadge }) {
  async function findOrg(ref) {
    const org = await db.one(
      "SELECT id,slug,name,type,color FROM organizations WHERE (id=? OR slug=?) AND active=TRUE",
      [Number(ref) || 0, String(ref || "").toLowerCase()],
    );
    if (!org) throw new Error("Organization not found.");
    return org;
  }

  async function ranksOf(orgId) {
    return db.query(
      "SELECT id,name,level,can_roster,can_ranks,can_discipline,can_announce FROM org_ranks WHERE org_id=? ORDER BY level DESC,name",
      [Number(orgId)],
    );
  }

  /** Everything the website editor needs for one organization (never the picture bytes). */
  async function overview(orgId) {
    const [templates, ranks] = await Promise.all([
      db.query("SELECT tier,mime,bytes,fields,updated_by,updated_at,detected_at,(original IS NOT NULL) has_original FROM org_badge_templates WHERE org_id=?", [Number(orgId)]),
      ranksOf(orgId),
    ]);
    const org = await db.one("SELECT name,slug FROM organizations WHERE id=?", [Number(orgId)]);
    const style = callsignStyleFor(org);
    const byKey = new Map(templates.map((row) => [row.tier, row]));
    const slot = (key, label, kind, extra = {}) => {
      const row = byKey.get(key);
      return {
        key, label, kind, has: Boolean(row), version: row ? Number(row.updated_at) : null, bytes: row ? Number(row.bytes) : 0,
        detected: Boolean(row?.detected_at), fields: row ? cleanFields(parse(row.fields, {})) : defaultFields(), ...extra,
      };
    };
    return {
      callsignStyle: style, callsignExample: CALLSIGN_STYLES[style].sample,
      // One badge per rank, plus a default for any rank without its own. Older tier badges stay listed while they exist.
      slots: [
        slot("member", "Default badge", "default"),
        ...ranks.map((rank) => slot(rankSlot(rank.id), rank.name, "rank", { rankId: Number(rank.id), level: Number(rank.level) })),
        ...["supervisor", "low_command", "high_command"].filter((key) => byKey.has(key)).map((key) => slot(key, `${BADGE_TIERS[key]} (older style)`, "legacy")),
      ],
      ranks: ranks.map((rank) => ({ id: Number(rank.id), name: rank.name, level: Number(rank.level) })),
    };
  }

  /**
   * The badge for a member: their rank's own picture, else the default badge, else the nearest older tier
   * picture for what their rank is allowed to do. Returns the slot that was used.
   */
  async function template(orgId, tier, rankId = null) {
    const key = cleanTier(tier);
    const own = /^r\d+$/.test(key) ? [key] : [];
    const wanted = [...(rankId ? [rankSlot(rankId)] : []), ...own, ...tierFallbacks(own.length ? "member" : key)];
    for (const candidate of wanted) {
      const row = await db.one("SELECT tier,mime,data,fields,updated_at FROM org_badge_templates WHERE org_id=? AND tier=?", [Number(orgId), candidate]);
      if (row) return { tier: row.tier, requested: rankId ? rankSlot(rankId) : tier, mime: row.mime, data: Buffer.from(row.data), fields: cleanFields(parse(row.fields, {})), version: Number(row.updated_at) };
    }
    return null;
  }

  async function exact(orgId, tier) {
    const row = await db.one("SELECT mime,data,updated_at FROM org_badge_templates WHERE org_id=? AND tier=?", [Number(orgId), cleanTier(tier)]);
    return row ? { mime: row.mime, data: Buffer.from(row.data), version: Number(row.updated_at) } : null;
  }

  async function ownSlot(orgId, tierInput) {
    const tier = cleanTier(tierInput);
    if (/^r\d+$/.test(tier) && !(await db.one("SELECT id FROM org_ranks WHERE id=? AND org_id=?", [Number(tier.slice(1)), Number(orgId)])))
      throw new Error("That rank does not belong to this organization.");
    return tier;
  }

  async function save(orgId, input, actorId) {
    const tier = await ownSlot(orgId, input.tier);
    const stamp = Date.now();
    const current = await db.one("SELECT fields FROM org_badge_templates WHERE org_id=? AND tier=?", [Number(orgId), tier]);
    const base = current ? cleanFields(parse(current.fields, {})) : defaultFields();
    const result = { tier, version: stamp, found: [], notes: [], erased: false };
    if (input.image) {
      const image = decodeBadgeImage(input.image);
      let stored = image.buffer;
      let original = null;
      let fields = null;
      // The one AI use for this picture: find the callsign space and erase the sample callsign.
      if (image.mime !== "image/png") result.notes.push("the AI only reads PNG pictures, so the default callsign position was kept");
      else {
        try {
          const org = await db.one("SELECT name,slug FROM organizations WHERE id=?", [Number(orgId)]);
          const read = await analyzeBadgeFn(image.buffer, { style: callsignStyleFor(org) });
          result.found = read.found;
          result.notes.push(...read.notes);
          if (read.found.length) fields = cleanFields({ callsign: read.fields.callsign }, defaultFields());
          if (read.cleaned) {
            const png = encodePng(read.cleaned);
            if (png.length <= MAX_STORED_BYTES) { stored = png; original = image.buffer; result.erased = true; }
          }
        } catch (error) {
          result.notes.push(`the AI could not place the callsign (${error.message}), so the default position was kept`);
        }
      }
      // A found callsign space wins over positions dragged before the upload; otherwise the sent ones apply.
      fields ||= cleanFields(input.fields, current ? base : defaultFields());
      await db.query(
        `INSERT INTO org_badge_templates(org_id,tier,mime,data,bytes,fields,updated_by,updated_at,original,detected_at) VALUES(?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE mime=VALUES(mime),data=VALUES(data),bytes=VALUES(bytes),fields=VALUES(fields),updated_by=VALUES(updated_by),updated_at=VALUES(updated_at),original=VALUES(original),detected_at=VALUES(detected_at)`,
        [Number(orgId), tier, stored === image.buffer ? image.mime : "image/png", stored, stored.length, JSON.stringify(fields), String(actorId), stamp, original, result.found.length ? stamp : null],
      );
      result.fields = fields;
    } else {
      if (!current) throw new Error(`Upload a picture for the ${BADGE_TIERS[tier]} badge first.`);
      const fields = cleanFields(input.fields, base);
      await db.query("UPDATE org_badge_templates SET fields=?,updated_by=?,updated_at=? WHERE org_id=? AND tier=?", [JSON.stringify(fields), String(actorId), stamp, Number(orgId), tier]);
      result.fields = fields;
    }
    await audit(actorId, "organization.badge", orgId, { tier, picture: Boolean(input.image), found: result.found });
    return result;
  }

  async function remove(orgId, tierInput, actorId) {
    const tier = await ownSlot(orgId, tierInput);
    await db.query("DELETE FROM org_badge_templates WHERE org_id=? AND tier=?", [Number(orgId), tier]);
    await audit(actorId, "organization.badge_remove", orgId, { tier });
    return { tier };
  }

  /** What the bot needs to badge a member: their rank, callsign, leader flag and the tier it maps to. */
  async function memberInfo(orgRef, discordId) {
    if (!SNOWFLAKE.test(String(discordId || ""))) throw new Error("Invalid discord_id.");
    const org = await findOrg(orgRef);
    const row = await db.one(
      `SELECT m.manager,m.rank_id,r.name rank_name,r.level,r.can_roster,r.can_ranks,r.can_discipline,r.can_announce,p.callsign
         FROM organization_members m
         LEFT JOIN org_ranks r ON r.id=m.rank_id AND r.org_id=m.org_id
         LEFT JOIN org_member_profiles p ON p.org_id=m.org_id AND p.discord_id=m.discord_id
        WHERE m.org_id=? AND m.discord_id=?`,
      [org.id, String(discordId)],
    );
    const info = { org: { id: Number(org.id), slug: org.slug, name: org.name }, onRoster: Boolean(row) };
    if (!row) return info;
    const leader = flag(row.manager);
    return {
      ...info, leader, callsign: row.callsign || null,
      rank: row.rank_id == null ? null : { id: Number(row.rank_id), name: row.rank_name, level: Number(row.level) },
      tier: defaultTier(row, leader),
    };
  }

  /** Website: any member sees the templates; editing needs the profile permission (leaders have it). */
  async function portalOverview(actorId, orgRef) {
    const { org, perms } = await economy.accessTo(actorId, orgRef);
    return { orgId: Number(org.id), canEdit: Boolean(perms.profile || perms.full), ...(await overview(org.id)) };
  }

  async function portalImage(actorId, orgRef, tier) {
    const { org } = await economy.accessTo(actorId, orgRef);
    return exact(org.id, tier);
  }

  async function editable(actorId, orgRef) {
    const { org, perms } = await economy.accessTo(actorId, orgRef);
    if (!(perms.profile || perms.full)) throw new Error("Your rank cannot edit the organization's badges.");
    return org;
  }

  async function saveBadge(actorId, input) {
    const org = await editable(actorId, input.orgId);
    return save(org.id, input, actorId);
  }

  async function removeBadge(actorId, input) {
    const org = await editable(actorId, input.orgId);
    return remove(org.id, input.tier, actorId);
  }

  return {
    findOrg, overview, template, exact, save, remove, memberInfo,
    portalOverview, portalImage, saveBadge, removeBadge,
  };
}
