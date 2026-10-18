import { randomBytes } from "node:crypto";

/**
 * orgs.floridabay.net: the organization website. Gangs, businesses and departments run their
 * wallet, shop, properties, roster, ranks, rank roles and permissions here. It is served by the
 * same web process as the main site. On its own host it gets a host-only session through a
 * one-time handoff ticket issued by the main site (where Discord sign-in happens). Until that host
 * is reachable, the same app is served at /orgs on the main site.
 */

export const ORGS_ACTIONS = Object.freeze({
  purchase: "purchase",
  sell: "sellItem",
  transfer: "transfer",
  adjust: "adjust",
  leader: "setLeader",
  motd: "setMotd",
  rank: "saveRank",
  "rank/delete": "deleteRank",
  "rank/reorder": "reorderRanks",
  member: "setMemberRank",
  settings: "saveRosterSettings",
  import: "importRanksFromDiscord",
});

/** Actions whose economy function takes the whole session instead of the actor id. */
const SESSION_ACTIONS = new Set(["purchase", "sellItem"]);

/** Static files the orgs host may serve; everything else on that host is the main site's business. */
export function orgsStaticPath(pathname) {
  if (pathname === "/" || pathname === "/index.html") return "orgs/index.html";
  if (/^\/orgs\/[a-z0-9._-]+$/i.test(pathname)) return pathname.slice(1);
  if (/^\/fonts\/[a-z0-9._-]+\.woff2$/i.test(pathname)) return pathname.slice(1);
  if (["/logo-128.webp", "/logo-720.webp"].includes(pathname)) return pathname.slice(1);
  return null;
}

/** API routes the orgs host answers. Staff tools and live configuration stay on the main site. */
export function orgsApiAllowed(pathname) {
  return pathname.startsWith("/api/orgs/") || pathname.startsWith("/api/public/") || ["/api/auth/session", "/api/auth/logout"].includes(pathname);
}

/** A safe in-app path to return to after sign-in (never another origin). */
export function safeNext(value) {
  const next = String(value || "/");
  return /^\/[a-z0-9/_-]{0,80}$/i.test(next) && !next.startsWith("//") ? next : "/";
}

export function orgsHostFor(publicLocation) {
  const configured = String(process.env.FBRP_ORGS_HOST || "").trim().toLowerCase();
  if (configured) return configured;
  const host = publicLocation.hostname.toLowerCase();
  return /^[\d.]+$/.test(host) || host === "localhost" ? `orgs.${host}.invalid` : `orgs.${host.replace(/^www\./, "")}`;
}

export function createOrgsSite({ db, economy, client, resolvePeople, publicLocation }) {
  const host = orgsHostFor(publicLocation);
  const tickets = new Map();
  const forced = String(process.env.FBRP_ORGS_URL || "").trim().replace(/\/$/, "");
  let live = false;

  /** The orgs host is used once it actually answers over HTTPS (DNS and certificate in place). */
  async function probe() {
    if (forced) return;
    try {
      const result = await fetch(`https://${host}/api/public/health`, { signal: AbortSignal.timeout(6000), redirect: "manual" });
      live = result.ok;
    } catch {
      live = false;
    }
  }

  const url = () => forced || (live ? `https://${host}` : `${publicLocation.origin}${publicLocation.pathname.replace(/\/$/, "")}/orgs`);
  const isOrgsHost = (requestHost) => String(requestHost || "").toLowerCase().split(":")[0] === host;

  function issueTicket(session) {
    for (const [key, value] of tickets) if (value.expires < Date.now()) tickets.delete(key);
    if (tickets.size > 2000) throw new Error("Too many pending sign-ins. Try again shortly.");
    const ticket = randomBytes(32).toString("base64url");
    tickets.set(ticket, { id: String(session.id), expires: Date.now() + 60000 });
    return ticket;
  }

  function redeemTicket(ticket) {
    const entry = tickets.get(String(ticket || ""));
    tickets.delete(String(ticket || ""));
    return entry && entry.expires >= Date.now() ? entry.id : null;
  }

  /** Public directory: what anyone can see without signing in. */
  async function directory() {
    const recent = Date.now() - 180000;
    const rows = await db.query(
      `SELECT o.id,o.slug,o.name,o.type,o.color,
              (SELECT COUNT(*) FROM organization_members m WHERE m.org_id=o.id) members,
              (SELECT COUNT(*) FROM org_ranks r WHERE r.org_id=o.id) ranks,
              (SELECT COUNT(DISTINCT s.discord_id) FROM organization_shifts s WHERE s.org_id=o.id AND s.ended_at IS NULL AND s.heartbeat_at>=?) on_duty
         FROM organizations o WHERE o.active=TRUE ORDER BY o.name`,
      [recent],
    );
    const properties = await db.query(
      "SELECT p.org_id,i.label FROM org_properties p JOIN org_shop_items i ON i.item_key=p.item_key",
    ).catch(() => []);
    const organizations = rows.map((row) => ({
      id: Number(row.id), slug: row.slug, name: row.name, type: row.type, color: row.color,
      members: Number(row.members || 0), ranks: Number(row.ranks || 0), onDuty: Number(row.on_duty || 0),
      properties: properties.filter((p) => Number(p.org_id) === Number(row.id)).map((p) => p.label),
    }));
    return {
      organizations,
      totals: {
        organizations: organizations.length,
        members: organizations.reduce((sum, org) => sum + org.members, 0),
        onDuty: organizations.reduce((sum, org) => sum + org.onDuty, 0),
        properties: properties.length,
      },
    };
  }

  /** Everything the signed-in member can see and do, with display names for every person shown. */
  async function data(session) {
    const economyData = await economy.portalData(session.id);
    const ids = [session.id];
    for (const org of economyData.organizations || []) {
      ids.push(...org.leaders, ...(org.roster || []).map((row) => row.discord_id));
      ids.push(...org.transactions.map((row) => row.actor_id), ...org.purchases.map((row) => row.purchased_by));
      ids.push(...(org.activity || []).flatMap((row) => [row.actor_id, row.target_id]));
      if (org.leadership?.ownerId) ids.push(org.leadership.ownerId);
      ids.push(...(org.leadership?.commandMembers || []));
    }
    const user = await client.users.fetch(session.id).catch(() => null);
    return {
      user: {
        id: session.id,
        name: user?.globalName || user?.username || session.username,
        avatar: user?.displayAvatarURL({ size: 128, extension: "webp" }) || session.avatar,
      },
      economy: economyData,
      people: await resolvePeople(ids, { fetchLimit: 60 }),
      links: { portal: `${publicLocation.origin}/portal.html`, control: `${publicLocation.origin}/control.html`, orgs: url() },
      generatedAt: Date.now(),
    };
  }

  async function action(session, name, input) {
    const method = ORGS_ACTIONS[name];
    if (!method || typeof economy[method] !== "function") throw new Error("Unknown organization action.");
    return economy[method](SESSION_ACTIONS.has(method) ? session : session.id, input);
  }

  async function roles(session, orgId) {
    return economy.bindableRoles(session.id, orgId);
  }

  return { host, url, isOrgsHost, probe, issueTicket, redeemTicket, directory, data, action, roles };
}
