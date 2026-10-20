/**
 * Organization logos. A logo is a PNG, JPEG, WebP or GIF of at most 512 KB, stored in MariaDB and
 * served publicly at /api/orgs/logo/<id>?v=<version>. Set it when creating an organization
 * (/organization create logo:), later with /organization logo, or from the organization's profile
 * settings on the orgs website, which scales the picture to 256 pixels before uploading.
 */

export const MAX_LOGO_BYTES = 512 * 1024;
const DISCORD_CDN = /^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\//;

/** Identify an image by its magic bytes (the declared type is never trusted). Exported for tests. */
export function sniffImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.subarray(0, 4).toString("latin1") === "RIFF" && buffer.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("latin1"))) return "image/gif";
  return null;
}

/** Decode a data: URL from the website into a validated image. Exported for tests. */
export function decodeDataUrl(value) {
  const match = /^data:image\/(?:png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(String(value || ""));
  if (!match) throw new Error("Choose a PNG, JPEG, WebP or GIF image.");
  return checked(Buffer.from(match[1], "base64"));
}

function checked(buffer) {
  if (buffer.length > MAX_LOGO_BYTES) throw new Error(`That logo is ${(buffer.length / 1024).toFixed(0)} KB. Logos can be at most ${MAX_LOGO_BYTES / 1024} KB.`);
  const mime = sniffImage(buffer);
  if (!mime) throw new Error("That file is not a PNG, JPEG, WebP or GIF image.");
  return { buffer, mime };
}

export function createOrgLogos({ db, audit }) {
  /** orgId -> version for every organization that has a logo. */
  async function versions() {
    const rows = await db.query("SELECT org_id,updated_at FROM org_logos").catch(() => []);
    return new Map(rows.map((row) => [Number(row.org_id), Number(row.updated_at)]));
  }

  async function version(orgId) {
    const row = await db.one("SELECT updated_at FROM org_logos WHERE org_id=?", [Number(orgId)]).catch(() => null);
    return row ? Number(row.updated_at) : null;
  }

  async function get(orgId) {
    const row = await db.one("SELECT mime,data,updated_at FROM org_logos WHERE org_id=?", [Number(orgId)]);
    return row ? { mime: row.mime, data: Buffer.from(row.data), version: Number(row.updated_at) } : null;
  }

  async function save(orgId, image, actorId) {
    const stamp = Date.now();
    await db.query(
      `INSERT INTO org_logos(org_id,mime,data,bytes,updated_by,updated_at) VALUES(?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE mime=VALUES(mime),data=VALUES(data),bytes=VALUES(bytes),updated_by=VALUES(updated_by),updated_at=VALUES(updated_at)`,
      [Number(orgId), image.mime, image.buffer, image.buffer.length, String(actorId), stamp],
    );
    await audit(actorId, "organization.logo", orgId, { mime: image.mime, bytes: image.buffer.length });
    return stamp;
  }

  async function remove(orgId, actorId) {
    await db.query("DELETE FROM org_logos WHERE org_id=?", [Number(orgId)]);
    await audit(actorId, "organization.logo_remove", orgId, {});
  }

  /** Download a Discord attachment (only Discord's own CDN is ever fetched). */
  async function fromAttachment(attachment) {
    if (!attachment?.url || !DISCORD_CDN.test(attachment.url)) throw new Error("Attach the logo as an image file.");
    if (Number(attachment.size) > MAX_LOGO_BYTES) throw new Error(`That logo is ${(Number(attachment.size) / 1024).toFixed(0)} KB. Logos can be at most ${MAX_LOGO_BYTES / 1024} KB. Shrink it (256x256 is plenty) or upload it on the orgs website, which resizes it for you.`);
    const response = await fetch(attachment.url, { signal: AbortSignal.timeout(15000), redirect: "error" });
    if (!response.ok) throw new Error("Discord would not give me that attachment. Try uploading it again.");
    return checked(Buffer.from(await response.arrayBuffer()));
  }

  return { versions, version, get, save, remove, fromAttachment };
}

/** Relative or absolute logo URL for an organization (null without a logo). */
export const logoPath = (orgId, version, base = "") => (version ? `${base}/api/orgs/logo/${Number(orgId)}?v=${Number(version)}` : null);
