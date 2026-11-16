/**
 * FBRP | Staff Assistant: fixed IDs and defaults. Every value can be overridden from the environment
 * (services/fbrp-bot/.env) without a code change.
 */
const list = (value, fallback) => {
  const items = String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  return items.length ? items : fallback;
};

export const STAFF_GUILD_ID = process.env.STAFF_GUILD_ID || "1557600357163474946";
export const MAIN_GUILD_ID = process.env.STAFF_MAIN_GUILD_ID || "1557594282976747550";
/** Slash commands are registered here (the staff server); the bot may also sit in the main server for role work. */
export const COMMAND_GUILD_IDS = list(process.env.STAFF_COMMAND_GUILD_IDS, [STAFF_GUILD_ID]);

/** The staff coordination team's live chain-of-command board (staff server, #chain-of-command). */
export const CHAIN_CHANNEL_ID = process.env.STAFF_COORD_CHAIN_CHANNEL_ID || "1558275440450474075";

/** Coordination movements (hired, promoted, removed) are posted here: staff server, #sct-audits. */
export const COORD_LOG_CHANNEL_ID = process.env.STAFF_COORD_LOG_CHANNEL_ID || "1559577670126272633";

/** ACE group every coordination team member is kept in, and the origin the staff bot owns. */
export const COORD_TEAM_GROUP = "staff_coordination_team";
export const COORD_ACE_ORIGIN = "derived:staff_coord";

/** The shared "FBRP | Staff Coordination Team" role every rank below carries. */
export const TEAM_ROLE_ID = process.env.STAFF_COORD_TEAM_ROLE_ID || "1558267361797210142";
/** "FBRP | Staff Leadership" umbrella, worn with Assistant Staff Manager and above. */
export const LEADERSHIP_ROLE_ID = process.env.STAFF_LEADERSHIP_ROLE_ID || "1558266751320465489";

/** Coordination ranks, highest first. `leadership` ranks also wear the leadership umbrella role. */
export const COORD_RANKS = [
  { name: "Staff Director", roleId: "1558266725164781680", leadership: true },
  { name: "Assistant Staff Director", roleId: "1558266750728937643", leadership: true },
  { name: "Staff Manager", roleId: "1558266752914165911", leadership: true },
  { name: "Assistant Staff Manager", roleId: "1558266752138354800", leadership: true },
  { name: "Senior Staff Coordinator", roleId: "1558266753643970591", leadership: false },
  { name: "Staff Coordinator", roleId: "1558266754311131220", leadership: false },
  { name: "Trial Staff Coordinator", roleId: "1558266754965307483", leadership: false },
];
/** Staff Manager and above may hire, promote, demote and remove coordinators. */
export const MANAGER_RANK = "Staff Manager";

/**
 * Network leadership above every sector (staff-server Owner and Co-Owner). Holding one of these
 * qualifies a member for every manager+ role below, because they outrank each sector's directors.
 */
export const NETWORK_TOP_ROLE_IDS = list(process.env.STAFF_NETWORK_TOP_ROLE_IDS, ["1558265913046863892", "1558265973402902539"]);

/**
 * "<sector> manager and above" roles in the main server. Members holding any of `sourceRoles` in
 * `sourceGuild` (read from the main bot's member cache) wear `targetRole` in the main server.
 */
export const MANAGER_ROLE_RULES = [
  {
    key: "dev",
    label: "Dev Manager+",
    targetRole: "1570227917504385096",
    // The DevOps server's own roster decides: active members at Development Manager (level 5) or above,
    // which is Development Manager and Development Director.
    devopsMinLevel: 5,
    sourceGuild: null,
    sourceRoles: [],
    // Only the dev team: network leadership (Owner, Co-Owner) does not get this role by outranking it.
    networkTop: false,
  },
];

/** Private channel for the staff bot to main bot request log: Executive Management and above only. */
export const QUEUE_LOG_CATEGORY_ID = process.env.STAFF_QUEUE_LOG_CATEGORY_ID || "1558274050764054598";
export const QUEUE_LOG_ROLE_IDS = list(process.env.STAFF_QUEUE_LOG_ROLE_IDS, [
  "1558265913046863892", // Owner
  "1558265973402902539", // Co-Owner
  "1558266080361840690", // Executive Management
]);
