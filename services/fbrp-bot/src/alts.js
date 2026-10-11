import { identityHash } from "./verification.js";

/**
 * Alt-account detection for global bans.
 *
 * Discord never shows a bot a user's IP, so accounts are linked through what we record ourselves:
 *
 *  - Website verification (identity_links): salted hashes of the IP seen when the account signed
 *    in, plus the Steam/Xbox/... connections linked to the Discord account.
 *  - The game server (players / player_identifiers): license, license2, fivem, steam, xbl, live,
 *    ip, and every Discord ID that ever connected on a game account.
 *
 * Strength:
 *  - "strong": a shared game/platform identifier, a shared linked connection, or several Discord
 *    IDs seen on one game account. These are unique to one person.
 *  - "network": the only link is a shared IP address. Households, dorms and VPNs share IPs, so
 *    private ranges and IPs shared by more than IP_MAX_SHARERS accounts are ignored.
 *
 * Only one hop is followed (the banned user's own links), never links of links.
 */

const STRONG_KINDS = new Set(["license", "license2", "fivem", "steam", "xbl", "live"]);
export const IP_MAX_SHARERS = 5;

const kindOf = (identifier) => String(identifier).split(":", 1)[0];
const isPrivateIp = (value) =>
  /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fe80:|f[cd][0-9a-f]{2}:)/i.test(String(value).slice(3));
const SAFE_IDENTIFIER = /^[a-z0-9]+:[A-Za-z0-9]+$/;

/**
 * @returns {{
 *   alts: Array<{ discordId: string, strength: "strong"|"network", evidence: string[] }>,
 *   unlinkedAccounts: number,
 *   banIdentifiers: string[],
 * }} `banIdentifiers` are the strong game identifiers of the banned user's account(s) and of
 *   every strong-linked account; they never include IPs.
 */
export async function findLinkedAccounts(db, discordId) {
  const target = String(discordId);
  const found = new Map();
  const note = (id, strength, label) => {
    const value = String(id || "");
    if (!/^\d{15,24}$/.test(value) || value === target) return;
    const entry = found.get(value) || { discordId: value, strength: "network", evidence: new Set() };
    if (strength === "strong") entry.strength = "strong";
    entry.evidence.add(label);
    found.set(value, entry);
  };

  const game = await gameLinks(db, target, note);
  await websiteLinks(db, target, game.publicIps, game.seedIds, note);

  return {
    alts: [...found.values()].map((entry) => ({ ...entry, evidence: [...entry.evidence] })),
    unlinkedAccounts: game.unlinkedAccounts,
    banIdentifiers: game.banIdentifiers,
  };
}

/** Links through the game server's records. */
async function gameLinks(db, target, note) {
  const none = { publicIps: [], seedIds: [], unlinkedAccounts: 0, banIdentifiers: [] };

  // Game accounts the target has used (by linked Discord, or any Discord ID ever seen on them).
  const seed = await db.query(
    `SELECT DISTINCT p.id, p.license
       FROM players p
       LEFT JOIN player_identifiers i ON i.player_id=p.id AND i.identifier=?
      WHERE p.discord_id=? OR i.player_id IS NOT NULL`,
    [`discord:${target}`, target],
  );
  if (!seed.length) return none;
  const seedIds = seed.map((row) => Number(row.id));

  const strong = new Set();
  const ips = new Set();
  const own = await db.query("SELECT identifier FROM player_identifiers WHERE player_id IN (?)", [seedIds]);
  for (const row of seed) if (row.license) strong.add(String(row.license).includes(":") ? String(row.license) : `license:${row.license}`);
  for (const { identifier } of own) {
    const kind = kindOf(identifier);
    if (STRONG_KINDS.has(kind) && SAFE_IDENTIFIER.test(identifier)) strong.add(identifier);
    else if (kind === "ip" && !isPrivateIp(identifier)) ips.add(identifier);
  }

  // account id -> how it is linked
  const links = new Map(seedIds.map((id) => [id, { strong: new Set(["same game account"]), network: false }]));
  const link = (id, label, isNetwork) => {
    const key = Number(id);
    if (!links.has(key)) links.set(key, { strong: new Set(), network: false });
    if (isNetwork) links.get(key).network = true;
    else links.get(key).strong.add(label);
  };

  if (strong.size) {
    const list = [...strong];
    const byIdentifier = await db.query(
      "SELECT player_id, identifier FROM player_identifiers WHERE identifier IN (?) AND player_id NOT IN (?)",
      [list, seedIds],
    );
    for (const row of byIdentifier) link(row.player_id, `shared ${kindOf(row.identifier)}`, false);
    const byLicense = await db.query("SELECT id, license FROM players WHERE license IN (?) AND id NOT IN (?)", [list, seedIds]);
    for (const row of byLicense) link(row.id, `shared ${kindOf(row.license)}`, false);
  }

  if (ips.size) {
    const counts = await db.query(
      "SELECT identifier, COUNT(DISTINCT player_id) n FROM player_identifiers WHERE identifier IN (?) GROUP BY identifier",
      [[...ips]],
    );
    const usable = counts.filter((row) => Number(row.n) <= IP_MAX_SHARERS).map((row) => row.identifier);
    if (usable.length) {
      const byIp = await db.query(
        "SELECT DISTINCT player_id FROM player_identifiers WHERE identifier IN (?) AND player_id NOT IN (?)",
        [usable, seedIds],
      );
      for (const row of byIp) link(row.player_id, "", true);
    }
  }

  const involved = [...links.keys()];
  const [players, discords, identifiers] = await Promise.all([
    db.query("SELECT id, discord_id FROM players WHERE id IN (?)", [involved]),
    db.query("SELECT player_id, identifier FROM player_identifiers WHERE player_id IN (?) AND identifier LIKE 'discord:%'", [involved]),
    db.query("SELECT player_id, identifier FROM player_identifiers WHERE player_id IN (?)", [involved]),
  ]);

  const noteFrom = (id, playerId) => {
    const source = links.get(Number(playerId));
    if (source.strong.size) for (const label of source.strong) note(id, "strong", label);
    if (source.network) note(id, "network", "shared IP address");
  };
  for (const row of players) noteFrom(row.discord_id, row.id);
  for (const row of discords) noteFrom(String(row.identifier).slice(8), row.player_id);

  // Game accounts that never linked a Discord cannot be banned on Discord, only in game.
  const linkedPlayers = new Set(players.filter((row) => row.discord_id).map((row) => Number(row.id)));
  for (const row of discords) linkedPlayers.add(Number(row.player_id));
  const unlinkedAccounts = involved.filter((id) => !linkedPlayers.has(id) && !seedIds.includes(id)).length;

  const banIdentifiers = new Set(strong);
  for (const row of identifiers)
    if (links.get(Number(row.player_id))?.strong.size && STRONG_KINDS.has(kindOf(row.identifier)) && SAFE_IDENTIFIER.test(row.identifier))
      banIdentifiers.add(row.identifier);

  return { publicIps: [...ips], seedIds, unlinkedAccounts, banIdentifiers: [...banIdentifiers] };
}

/** Links through website verification: hashed IPs and shared linked connections. */
async function websiteLinks(db, target, gameIps, seedIds, note) {
  const own = await db.query("SELECT kind, value_hash FROM identity_links WHERE discord_id=?", [target]);
  const ipHashes = new Set(own.filter((row) => row.kind === "ip").map((row) => row.value_hash));
  const connectionHashes = own.filter((row) => row.kind !== "ip").map((row) => row.value_hash);
  const websiteIps = new Set(ipHashes);
  // An IP seen in game counts as one of the account's IPs on the website side too.
  for (const ip of gameIps) {
    const hash = identityHash("ip", ip);
    if (hash) ipHashes.add(hash);
  }
  const wanted = [...ipHashes, ...connectionHashes];
  if (wanted.length) {
    const rows = await db.query("SELECT discord_id, kind, value_hash FROM identity_links WHERE value_hash IN (?) AND discord_id<>?", [wanted, target]);
    const sharers = new Map();
    for (const row of rows) {
      if (row.kind !== "ip") continue;
      if (!sharers.has(row.value_hash)) sharers.set(row.value_hash, new Set());
      sharers.get(row.value_hash).add(String(row.discord_id));
    }
    for (const row of rows) {
      if (row.kind === "ip") {
        if (sharers.get(row.value_hash).size + 1 > IP_MAX_SHARERS) continue;
        note(row.discord_id, "network", "shared IP address");
      } else note(row.discord_id, "strong", `shared ${row.kind} connection`);
    }
  }

  // The banned user's website IP also matches other people's in-game IPs.
  if (websiteIps.size) {
    const rows = await db.query(
      "SELECT player_id, identifier FROM player_identifiers WHERE identifier LIKE 'ip:%' AND player_id NOT IN (?)",
      [seedIds.length ? seedIds : [0]],
    );
    const byHash = new Map();
    for (const row of rows) {
      const hash = identityHash("ip", row.identifier);
      if (!hash || !websiteIps.has(hash)) continue;
      if (!byHash.has(hash)) byHash.set(hash, new Set());
      byHash.get(hash).add(Number(row.player_id));
    }
    const players = [...byHash.values()].filter((set) => set.size <= IP_MAX_SHARERS).flatMap((set) => [...set]);
    if (players.length) {
      const [owners, discords] = await Promise.all([
        db.query("SELECT discord_id FROM players WHERE id IN (?) AND discord_id IS NOT NULL", [players]),
        db.query("SELECT identifier FROM player_identifiers WHERE player_id IN (?) AND identifier LIKE 'discord:%'", [players]),
      ]);
      for (const row of owners) note(row.discord_id, "network", "shared IP address");
      for (const row of discords) note(String(row.identifier).slice(8), "network", "shared IP address");
    }
  }
}
