import { createHmac } from "node:crypto";
import { isIPv4, isIPv6 } from "node:net";

/** The role the bot gives once someone has verified on the website. */
export const VERIFIED_ROLE_ID = String(process.env.FBRP_VERIFIED_ROLE_ID || "1557690864526954616");
/** Members waiting to verify can only see this channel. */
export const VERIFICATION_CHANNEL_ID = String(process.env.FBRP_VERIFICATION_CHANNEL_ID || "1558919447014547546");
export const UNVERIFIED_ROLE_NAME = String(process.env.FBRP_UNVERIFIED_ROLE_NAME || "FBRP | Unverified");
export const verificationRequired = () => String(process.env.FBRP_REQUIRE_VERIFICATION || "true").toLowerCase() !== "false";

const PRIVATE_V4 = /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;

/**
 * Canonical form of an address for matching. IPv4 stays as is; IPv6 collapses to its /64 so a
 * device rotating privacy addresses still matches. Private and loopback addresses give null.
 */
export function normalizeIp(value) {
  let ip = String(value || "").trim().toLowerCase().replace(/^ip:/, "");
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (isIPv4(ip)) return PRIVATE_V4.test(ip) ? null : ip;
  if (!isIPv6(ip) || ip === "::1" || ip === "::" || /^(fe80|f[cd][0-9a-f]{2}):/.test(ip)) return null;
  const [head, tail = ""] = ip.split("::");
  const front = head ? head.split(":") : [];
  const back = tail ? tail.split(":") : [];
  const fill = ip.includes("::") ? Array(Math.max(0, 8 - front.length - back.length)).fill("0") : [];
  return `${[...front, ...fill, ...back].slice(0, 4).map((group) => group.padStart(4, "0")).join(":")}::/64`;
}

/** Salted HMAC of an identity value (null when no salt is configured or the value is unusable). */
export function identityHash(kind, value) {
  const salt = String(process.env.FBRP_IDENTITY_SALT || "");
  if (salt.length < 16) return null;
  const clean = kind === "ip" ? normalizeIp(value) : String(value || "").trim().toLowerCase();
  if (!clean) return null;
  return createHmac("sha256", salt).update(`${kind}:${clean}`).digest("hex");
}

export async function isVerified(db, discordId) {
  return Boolean(await db.one("SELECT 1 FROM member_verifications WHERE discord_id=? LIMIT 1", [String(discordId)]));
}

const MAX_GUILDS = 200;

/**
 * Replaces a member's stored server list with the one Discord returned at sign-in. Servers they
 * have left are dropped, so the list always matches their last sign-in.
 */
async function storeGuilds(db, id, guilds, stamp) {
  const rows = [];
  for (const guild of guilds.slice(0, MAX_GUILDS)) {
    const guildId = String(guild?.id || "");
    if (!/^\d{15,24}$/.test(guildId)) continue;
    rows.push([guildId, String(guild.name || "Unknown server").slice(0, 100), guild.owner ? 1 : 0]);
  }
  for (const [guildId, name, owner] of rows)
    await db.query(
      `INSERT INTO member_guilds(discord_id,guild_id,guild_name,is_owner,first_seen,last_seen) VALUES(?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE guild_name=VALUES(guild_name),is_owner=VALUES(is_owner),last_seen=VALUES(last_seen)`,
      [id, guildId, name, owner, stamp, stamp],
    );
  if (rows.length)
    await db.query("DELETE FROM member_guilds WHERE discord_id=? AND guild_id NOT IN (?)", [id, rows.map((row) => row[0])]);
  else await db.query("DELETE FROM member_guilds WHERE discord_id=?", [id]);
  return rows.length;
}

/**
 * Marks a member verified and stores hashed identity links seen during this sign-in. `guilds` is
 * Discord's server list for the member, or null when it could not be read (the old list is kept).
 */
export async function recordVerification(db, { discordId, address, connections = [], guilds = null, method }) {
  const id = String(discordId);
  const stamp = Date.now();
  await db.query(
    "INSERT INTO member_verifications(discord_id,verified_at,last_verified_at,method) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE last_verified_at=VALUES(last_verified_at),method=VALUES(method)",
    [id, stamp, stamp, String(method).slice(0, 24)],
  );
  const links = [];
  const ip = identityHash("ip", address);
  if (ip) links.push(["ip", ip]);
  for (const connection of connections) {
    const kind = String(connection?.type || "").toLowerCase();
    if (!/^[a-z0-9_]{2,24}$/.test(kind) || !connection?.id || connection.verified === false) continue;
    const hash = identityHash(kind, connection.id);
    if (hash) links.push([kind, hash]);
  }
  for (const [kind, hash] of links)
    await db.query(
      "INSERT INTO identity_links(discord_id,kind,value_hash,first_seen,last_seen) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE last_seen=VALUES(last_seen)",
      [id, kind, hash, stamp, stamp],
    );
  const servers = Array.isArray(guilds) ? await storeGuilds(db, id, guilds, stamp) : null;
  return { links: links.length, servers };
}

/** Gives the verified role in every server that has it. Returns "granted", "pending" or "failed". */
export async function grantVerifiedRole(client, userId, reason = "Verified on the Florida Bay website") {
  let outcome = "pending";
  for (const guild of client.guilds.cache.values()) {
    const role = guild.roles.cache.get(VERIFIED_ROLE_ID);
    if (!role) continue;
    const member = await guild.members.fetch(String(userId)).catch(() => null);
    if (!member) continue;
    const unverified = guild.roles.cache.find((item) => item.name === UNVERIFIED_ROLE_NAME);
    if (member.roles.cache.has(role.id) && !member.roles.cache.has(unverified?.id)) {
      if (outcome === "pending") outcome = "granted";
      continue;
    }
    // Replace the quarantine role atomically so role-update enforcement cannot remove the
    // verified role in the gap between two separate Discord API calls.
    const added = await (member.roles.cache.has(unverified?.id)
      ? member.roles.set([
          role.id,
          ...member.roles.cache.filter((item) => item.managed).map((item) => item.id),
        ], reason)
      : member.roles.add(role, reason)
    ).then(() => true, (error) => {
      console.error(`[FBRP verify] could not give ${role.id} to ${userId} in ${guild.id}:`, error.message);
      return false;
    });
    outcome = added ? "granted" : "failed";
  }
  return outcome;
}
