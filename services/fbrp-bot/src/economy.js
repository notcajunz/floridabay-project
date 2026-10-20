import { staffLevel, superuserIds } from "./database.js";
import { callGame } from "./sync.js";
import { COLORS, who } from "./ui.js";
import { MAX_RANKS, RANK_PERMISSIONS } from "./org-authority.js";

/**
 * Organization economy (website + Discord side).
 *
 * Money is stored only in MariaDB (org_wallets / org_transactions). The game server credits it
 * when gangs deliver product or businesses work their properties; leaders spend it here on
 * properties (MLOs), vehicles, armory permits, outfits (EUP) and perks. Every purchase is applied
 * to the game immediately through the fbrp_core HTTP API.
 */

const item = (item_key, kind, label, price, org_types, data, description = "", { stock = null, requires = null, sort_order = 0 } = {}) =>
  ({ item_key, kind, label, price, org_types, data, description, stock, requires, sort_order });
const prop = (key, label, price, types, business, x, y, z, h, area, description, extra = {}) =>
  item(key, "property", label, price, types, { business, x, y, z, h, radius: 35, area, ...extra }, description);

export const DEFAULT_SHOP = [
  // Properties - one owner at a time. Coordinates are the business terminal; point them at your MLOs in live configuration.
  prop("bennys", "Benny's Original Motor Works", 95000, "gang,business", "mechanic", -205.7, -1310.6, 31.3, 0, "Strawberry", "Custom shop. Members service cars for income and can /repair customers' vehicles."),
  prop("lsc_burton", "Los Santos Customs - Burton", 85000, "gang,business", "mechanic", -337.4, -136.9, 39.0, 70, "Burton", "Uptown body shop with steady walk-in work."),
  prop("hayes_autos", "Hayes Autos", 60000, "gang,business", "mechanic", 484.6, -1316.6, 29.2, 300, "Strawberry", "Small garage on the south side - cheap way into the repair trade."),
  prop("yellow_jack", "Yellow Jack Inn", 55000, "gang,business", "bar", 1985.9, 3053.9, 47.2, 240, "Sandy Shores", "Biker bar. Members tend bar and /serve drinks to patrons."),
  prop("bahama_mamas", "Bahama Mamas West", 120000, "gang,business", "club", -1387.5, -588.4, 30.3, 30, "Del Perro", "Nightclub with the best take in the city."),
  prop("vanilla_unicorn", "Vanilla Unicorn", 110000, "gang,business", "club", 128.6, -1298.6, 29.2, 210, "Strawberry", "The city's most notorious club."),
  prop("tequilala", "Tequi-la-la", 80000, "gang,business", "bar", -565.2, 276.6, 83.1, 175, "West Vinewood", "Rock bar on the Vinewood strip."),
  prop("hen_house", "Hen House", 45000, "gang,business", "bar", -302.4, 6266.0, 31.5, 45, "Paleto Bay", "Paleto locals' bar."),
  prop("upnatom", "Up-n-Atom Burger - Vinewood", 70000, "gang,business", "restaurant", 81.2, 284.3, 110.2, 160, "Vinewood", "Burgers and fries. Members cook orders and /serve meals that heal."),
  prop("elysian_warehouse", "Elysian Island Warehouse", 65000, "gang,business", "warehouse", 1015.0, -3110.0, 5.9, 0, "Elysian Island", "Dockside logistics: pack and ship crates for income."),
  prop("lab_sandy", "Sandy Shores Trailer Lab", 75000, "gang", "lab", 1391.9, 3605.9, 38.9, 200, "Sandy Shores", "Private meth lab. Only the owning gang can cook here, with a 50% yield bonus.", { drug: "meth" }),
  prop("lab_oneil", "O'Neil Ranch Grow House", 60000, "gang", "lab", 2435.8, 4966.3, 42.3, 45, "Grapeseed", "Private weed grow. Owners harvest here with a 50% yield bonus.", { drug: "weed" }),
  prop("lab_sawmill", "Paleto Sawmill Cut House", 100000, "gang", "lab", -570.5, 5253.0, 70.5, 70, "Paleto Forest", "Private cocaine cut house with a 50% yield bonus.", { drug: "coke" }),
  prop("lab_raton_bunker", "Raton Canyon Bunker Grow", 70000, "gang", "lab", -391.0, 4354.0, 57.0, 0, "Raton Canyon", "Hidden grow room at the canyon bunker. Private weed lab with a 50% yield bonus.", { drug: "weed" }),
  prop("lab_zancudo_bunker", "Lago Zancudo Bunker Grow", 65000, "gang", "lab", -3046.0, 3331.0, 11.0, 0, "Lago Zancudo", "Swamp-side grow next to the river mouth. Private weed lab with a 50% yield bonus.", { drug: "weed" }),
  prop("lab_route68_bunker", "Route 68 Bunker Cookhouse", 85000, "gang", "lab", 31.0, 2945.0, 58.0, 0, "Grand Senora Desert", "Desert bunker off Route 68. Private meth lab with a 50% yield bonus.", { drug: "meth" }),
  prop("lab_thomson_bunker", "Thomson Scrapyard Bunker", 80000, "gang", "lab", 2491.0, 3150.0, 50.0, 0, "Grand Senora Desert", "Cook under the scrapyard. Private meth lab with a 50% yield bonus.", { drug: "meth" }),
  prop("lab_farmhouse_bunker", "Farmhouse Bunker Cut House", 110000, "gang", "lab", 1571.0, 2241.0, 79.0, 0, "Grand Senora Desert", "Isolated farmhouse bunker. Private cocaine lab with a 50% yield bonus.", { drug: "coke" }),
  prop("lab_chumash_bunker", "Chumash Bunker Cut House", 105000, "gang", "lab", -3171.0, 1375.0, 18.0, 0, "Chumash", "Coastal bunker north of Chumash. Private cocaine lab with a 50% yield bonus.", { drug: "coke" }),

  // Hideouts - gang headquarters with an armory and wardrobe. Members guard the stash for a small income.
  prop("hq_trailer_sandy", "Sandy Shores Trailer", 30000, "gang", "hideout", 1985.5, 3828.8, 32.5, 0, "Sandy Shores", "A run-down trailer on the lake. The cheapest way to give a crew an armory and wardrobe."),
  prop("hq_forum_drive", "Forum Drive House", 40000, "gang", "hideout", -14.7, -1439.3, 31.1, 0, "Strawberry", "South side family home in the heart of the neighborhood."),
  prop("hq_grove_street", "Grove Street Cul-de-sac", 50000, "gang", "hideout", 104.0, -1938.0, 21.0, 0, "Davis", "The most famous block in Los Santos. Claim it."),
  prop("hq_el_burro", "El Burro Heights House", 45000, "gang", "hideout", 1273.9, -1719.7, 54.8, 0, "El Burro Heights", "Quiet house above the refinery, off the police radar."),
  prop("hq_lost_vinewood", "East Vinewood Clubhouse", 70000, "gang", "hideout", 984.2, -95.4, 74.8, 0, "East Vinewood", "Biker clubhouse with a bar and a garage out back."),
  prop("hq_chumash_beach", "Chumash Beach House", 120000, "gang,business", "hideout", -3086.4, 339.3, 6.4, 0, "Chumash", "Beachfront house far from the city - good for a low profile."),
  prop("hq_richman", "Richman Hillside House", 140000, "gang,business", "hideout", -1117.2, 303.1, 66.5, 0, "Richman", "Hillside home among the city's old money."),
  prop("hq_whispymound", "Whispymound Drive Mansion", 160000, "gang,business", "hideout", 5.1, 532.6, 175.3, 0, "Vinewood Hills", "Modern mansion overlooking the city."),
  prop("hq_rockford", "Rockford Hills Estate", 190000, "gang,business", "hideout", -818.1, 177.8, 72.2, 0, "Rockford Hills", "Gated estate with a pool and tennis court. Leadership lives here."),
  prop("hq_fuente_blanca", "La Fuente Blanca Ranch", 220000, "gang", "hideout", 1395.2, 1141.8, 114.6, 0, "Tataviam Mountains", "Walled cartel ranch in the hills. The top address for a criminal empire."),

  // More businesses.
  prop("lsc_lamesa", "Los Santos Customs - La Mesa", 80000, "gang,business", "mechanic", 729.2, -1088.2, 22.2, 0, "La Mesa", "East side body shop next to the freeway."),
  prop("lsc_airport", "Los Santos Customs - LSIA", 75000, "gang,business", "mechanic", -1148.5, -1994.1, 13.2, 0, "LSIA", "Airport body shop with constant traffic."),
  prop("lsc_harmony", "Los Santos Customs - Harmony", 55000, "gang,business", "mechanic", 1179.1, 2644.0, 37.8, 0, "Harmony", "Route 68 garage serving the desert."),
  prop("beekers", "Beeker's Garage", 50000, "gang,business", "mechanic", 110.7, 6625.6, 31.8, 0, "Paleto Bay", "The only garage in Paleto."),
  prop("pdm", "Premium Deluxe Motorsport", 130000, "business", "mechanic", -47.2, -1115.3, 26.5, 0, "Pillbox Hill", "Showroom with a service bay. Prep and repair customer cars."),
  prop("golf_club", "Los Santos Golf Club", 140000, "gang,business", "bar", -1369.9, 57.4, 53.7, 0, "Richman", "Clubhouse bar for the city's elite."),
  prop("pier_stands", "Del Perro Pier Food Stands", 65000, "gang,business", "restaurant", -1843.6, -1219.5, 13.0, 0, "Del Perro", "Food stands on the busiest pier on the coast."),
  prop("cluckin_bell", "Cluckin' Bell Farms", 95000, "gang,business", "warehouse", -146.4, 6161.5, 31.2, 0, "Paleto Bay", "Poultry plant. Pack and ship orders - or hide something in the crates."),
  prop("lamesa_factory", "La Mesa Garment Factory", 70000, "gang,business", "warehouse", 716.8, -962.1, 31.6, 0, "La Mesa", "Sweatshop floor with loading docks."),
  prop("puerta_marina", "Puerta Marina Boathouse", 70000, "gang,business", "warehouse", -854.8, -1425.0, 5.0, 0, "La Puerta", "Marina boathouse. Ship crates by sea."),
  prop("lsia_hangar", "LSIA Cargo Hangar", 115000, "gang,business", "warehouse", -1152.2, -3410.8, 14.0, 0, "LSIA", "Air cargo hangar at the airport."),

  item("veh_baller3", "vehicle", "Baller LE", 18000, "gang,business", { model: "baller3" }, "Executive SUV for the crew."),
  item("veh_sultanrs", "vehicle", "Sultan RS", 28000, "gang", { model: "sultanrs" }, "Rally-bred street car."),
  item("veh_daemon2", "vehicle", "Daemon Custom", 9000, "gang", { model: "daemon2" }, "Club chopper."),
  item("veh_schafter6", "vehicle", "Schafter V12 (Armored)", 55000, "gang", { model: "schafter6" }, "Armored sedan for leadership."),
  item("veh_kuruma2", "vehicle", "Kuruma (Armored)", 65000, "gang", { model: "kuruma2" }, "Bullet-resistant getaway car."),
  item("veh_burrito3", "vehicle", "Burrito Van", 8000, "gang,business", { model: "burrito3" }, "Unmarked van for moving product or stock."),
  item("veh_mule", "vehicle", "Mule Box Truck", 12000, "gang,business", { model: "mule" }, "Box truck for deliveries."),
  item("veh_towtruck", "vehicle", "Tow Truck", 15000, "business,gang", { model: "towtruck" }, "Essential for any mechanic business."),
  item("veh_flatbed", "vehicle", "Flatbed", 18000, "business,gang", { model: "flatbed" }, "Haul broken-down cars back to the shop."),
  item("veh_stretch", "vehicle", "Stretch Limo", 30000, "business,gang", { model: "stretch" }, "VIP transport for clubs and events."),
  item("veh_speedo", "vehicle", "Speedo Delivery", 9000, "business", { model: "speedo" }, "Delivery van for restaurants and warehouses."),

  item("wpn_melee", "weapon", "Street melee kit", 6000, "gang", { weapons: [{ name: "WEAPON_BAT", ammo: 1 }, { name: "WEAPON_KNUCKLE", ammo: 1 }, { name: "WEAPON_SWITCHBLADE", ammo: 1 }] }, "Bats, knuckles and blades from the armory."),
  item("wpn_sidearms", "weapon", "Sidearm permit", 18000, "gang,business", { weapons: [{ name: "WEAPON_PISTOL", ammo: 120 }, { name: "WEAPON_SNSPISTOL", ammo: 90 }] }, "Handguns from your property armory."),
  item("wpn_security", "weapon", "Security kit", 8000, "business", { weapons: [{ name: "WEAPON_STUNGUN", ammo: 1 }, { name: "WEAPON_NIGHTSTICK", ammo: 1 }, { name: "WEAPON_FLASHLIGHT", ammo: 1 }] }, "Door staff equipment for clubs and bars."),
  item("wpn_shotgun", "weapon", "Shotgun permit", 38000, "gang", { weapons: [{ name: "WEAPON_SAWNOFFSHOTGUN", ammo: 48 }, { name: "WEAPON_PUMPSHOTGUN", ammo: 48 }] }, "Close-quarters firepower."),
  item("wpn_smg", "weapon", "SMG permit", 45000, "gang", { weapons: [{ name: "WEAPON_MICROSMG", ammo: 240 }, { name: "WEAPON_MACHINEPISTOL", ammo: 240 }] }, "Compact automatic weapons."),
  item("wpn_rifle", "weapon", "Rifle permit", 90000, "gang", { weapons: [{ name: "WEAPON_COMPACTRIFLE", ammo: 180 }, { name: "WEAPON_ASSAULTRIFLE", ammo: 180 }] }, "The heaviest permit available to organizations."),

  // Outfits apply freemode component variations. Swap drawables for your EUP pack in live configuration.
  item("fit_street", "outfit", "Crew colors", 5000, "gang", {
    male: { components: { 11: [7, 0], 8: [15, 0], 3: [1, 0], 4: [5, 0], 6: [1, 0] } },
    female: { components: { 11: [3, 0], 8: [14, 0], 3: [3, 0], 4: [4, 0], 6: [1, 0] } },
  }, "Matching hoodies and joggers for the whole crew."),
  item("fit_suits", "outfit", "Made men suits", 12000, "gang,business", {
    male: { components: { 11: [4, 0], 8: [31, 0], 3: [4, 0], 4: [10, 0], 6: [10, 0], 7: [25, 0] } },
    female: { components: { 11: [6, 0], 8: [38, 0], 3: [5, 0], 4: [6, 0], 6: [6, 0] } },
  }, "Tailored suits for leadership and club owners."),
  item("fit_mechanic", "outfit", "Shop coveralls", 4000, "business,gang", {
    male: { components: { 11: [65, 0], 8: [15, 0], 3: [0, 0], 4: [38, 0], 6: [25, 0] } },
    female: { components: { 11: [59, 0], 8: [14, 0], 3: [0, 0], 4: [38, 0], 6: [25, 0] } },
  }, "Work coveralls and boots for mechanic crews."),
  item("fit_security", "outfit", "Door security", 6000, "business", {
    male: { components: { 11: [111, 3], 8: [15, 0], 3: [4, 0], 4: [10, 0], 6: [10, 0] } },
    female: { components: { 11: [103, 3], 8: [14, 0], 3: [3, 0], 4: [6, 0], 6: [6, 0] } },
  }, "Black security jackets for club staff."),

  item("perk_stash", "perk", "Stash network", 25000, "gang", { perk: "capacity", value: 12 }, "Every member can carry 12 more units of product."),
  item("perk_chemist", "perk", "Master chemist", 40000, "gang", { perk: "yield", value: 25 }, "+25% product from every cook or harvest."),
  item("perk_connections", "perk", "Street connections", 50000, "gang", { perk: "price", value: 15 }, "+15% on every delivery payout."),
  item("perk_lookouts", "perk", "Lookouts", 30000, "gang", { perk: "heat", value: 40 }, "40% less chance that a drop-off is reported to police."),
  item("perk_hours", "perk", "Extended hours license", 35000, "business,gang", { perk: "cap", value: 50 }, "+50% to the hourly business earnings cap."),
  item("perk_loyalty", "perk", "Loyal customers", 30000, "business,gang", { perk: "pay", value: 20 }, "+20% on business tasks and services."),

  // Departments (leo / fire / government) are funded by duty time and seizures and draw at their stations.
  item("veh_fbi", "vehicle", "Unmarked Buffalo", 22000, "leo", { model: "fbi" }, "Unmarked interceptor for detectives and traffic enforcement."),
  item("veh_fbi2", "vehicle", "Unmarked Granger", 26000, "leo", { model: "fbi2" }, "Unmarked SUV for supervisors and investigations."),
  item("veh_policeb", "vehicle", "Police Motorcycle", 9000, "leo", { model: "policeb" }, "Traffic unit motorcycle."),
  item("veh_riot", "vehicle", "Armored Response Vehicle", 60000, "leo", { model: "riot" }, "SWAT armored truck for high-risk calls."),
  item("veh_pbus", "vehicle", "Prison Transport Bus", 15000, "leo,government", { model: "pbus" }, "Moves groups of prisoners to Bolingbroke."),
  item("veh_lguard", "vehicle", "Lifeguard SUV", 12000, "fire", { model: "lguard" }, "Beach patrol and water rescue response."),
  item("veh_blazer2", "vehicle", "Lifeguard ATV", 7000, "fire", { model: "blazer2" }, "Reaches patients across sand and trails."),
  item("veh_cog552", "vehicle", "Armored Cognoscenti 55", 45000, "government", { model: "cog552" }, "Armored car for officials and protection details."),
  item("wpn_leo_patrol", "weapon", "Patrol loadout", 12000, "leo", { weapons: [{ name: "WEAPON_COMBATPISTOL", ammo: 120 }, { name: "WEAPON_STUNGUN", ammo: 1 }, { name: "WEAPON_NIGHTSTICK", ammo: 1 }, { name: "WEAPON_FLASHLIGHT", ammo: 1 }] }, "Duty sidearm, taser, baton and light from any station armory."),
  item("wpn_leo_shotgun", "weapon", "Patrol shotgun", 20000, "leo", { weapons: [{ name: "WEAPON_PUMPSHOTGUN", ammo: 48 }] }, "Shotgun rack issue.", { requires: "wpn_leo_patrol" }),
  item("wpn_leo_carbine", "weapon", "Patrol carbine", 45000, "leo", { weapons: [{ name: "WEAPON_CARBINERIFLE", ammo: 210 }] }, "Rifle for active threats.", { requires: "wpn_leo_patrol" }),
  item("wpn_leo_swat", "weapon", "SWAT kit", 90000, "leo", { weapons: [{ name: "WEAPON_SPECIALCARBINE", ammo: 240 }, { name: "WEAPON_SMG", ammo: 240 }, { name: "WEAPON_SMOKEGRENADE", ammo: 4 }] }, "Tactical team equipment.", { requires: "wpn_leo_carbine" }),
  item("wpn_fire_rescue", "weapon", "Rescue tools", 6000, "fire", { weapons: [{ name: "WEAPON_HATCHET", ammo: 1 }, { name: "WEAPON_FIREEXTINGUISHER", ammo: 500 }, { name: "WEAPON_FLASHLIGHT", ammo: 1 }, { name: "WEAPON_FLARE", ammo: 5 }] }, "Axe, extinguisher, light and flares from any fire station."),
  item("wpn_gov_detail", "weapon", "Protection detail", 12000, "government", { weapons: [{ name: "WEAPON_COMBATPISTOL", ammo: 120 }, { name: "WEAPON_STUNGUN", ammo: 1 }] }, "Sidearm and taser for official security."),
  item("perk_budget", "perk", "Budget increase", 40000, "leo,fire,government", { perk: "stipend", value: 25 }, "+25% duty pay into the department budget."),
  item("perk_forfeiture", "perk", "Asset forfeiture", 35000, "leo", { perk: "bounty", value: 50 }, "+50% on every seizure bounty."),
].map((row, index) => ({ ...row, sort_order: row.sort_order || index * 10 }));

const KIND_LABEL = { property: "Properties", vehicle: "Vehicles", weapon: "Armory permits", outfit: "Outfits", perk: "Perks" };
const parse = (value, fallback) => {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(String(value ?? "")); } catch { return fallback; }
};
const text = (value, max) => String(value ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
const money = (value) => `$${Number(value || 0).toLocaleString("en-US")}`;

const DEPARTMENT_TYPES = new Set(["leo", "fire", "government"]);
const RANK_COLUMNS = RANK_PERMISSIONS.map((perm) => perm.column);
const HEX = /^#[0-9a-f]{6}$/i;
/** Permissions a non-full rank editor may only grant when their own rank holds them. */
export const GRANT_GUARDED = ["spend", "sell", "roster", "ranks", "motd", "announce", "discipline", "applications", "profile"];
const dayStart = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d.getTime(); };
const flag = (value) => value === true || value === 1 || value === "1" || value === "on" || value === "true";

/**
 * Discord roles that may fully manage every portal organization of a kind. Gang, business and
 * department "Manager+" are the manager rank and everything above it (the assistant manager rank is
 * not included), mirroring `gang_manager_plus_role_ids` / `business_manager_plus_role_ids`. The
 * department list covers the Department Hub (Overseer through Department Manager) and the Armed
 * Forces hub's managing positions; `leo` is the older law-enforcement-only grant.
 */
export const ORG_TYPE_MANAGER_ROLE_IDS = Object.freeze({
  gang: Object.freeze(["1559682499251146772", "1559682496549879808", "1559682494364647524"]),
  leo: Object.freeze(["1558483162944901210", "1558483161447538760"]),
  business: Object.freeze(["1559701149475536947", "1559701141053513798", "1559701134686556190", "1559701131905728532"]),
  department: Object.freeze([
    "1560393378485637140", "1560393380939300884", "1560393383527059477", "1560393388933513226",
    "1561065664016285696", "1561065669187862568", "1561065674678472744", "1561065680202375218", "1561065684849655808",
  ]),
});
const ORG_TYPE_MANAGER_ROLE_ID_SET = new Set(Object.values(ORG_TYPE_MANAGER_ROLE_IDS).flat());

/** The portal organization types each manager grant covers. */
export const ORG_MANAGER_GRANT_TYPES = Object.freeze({
  gang: Object.freeze(["gang"]),
  leo: Object.freeze(["leo"]),
  business: Object.freeze(["business"]),
  department: Object.freeze(["leo", "fire", "government"]),
});

export function managedOrgTypesForRoleIds(roleIds) {
  const held = new Set(Array.from(roleIds || [], String));
  const types = new Set();
  for (const [grant, allowed] of Object.entries(ORG_TYPE_MANAGER_ROLE_IDS))
    if (allowed.some((roleId) => held.has(roleId))) for (const type of ORG_MANAGER_GRANT_TYPES[grant]) types.add(type);
  return types;
}

/**
 * What a viewer may do in one organization. `full` is everyone who runs the organization: its
 * leaders, its owner and command (from the gang/business/department manager registries) and the
 * staff who manage its type. Ranked members follow their rank's permissions; unranked members have
 * the default member access (ledger, armory and garage). Exported for tests.
 */
export function permissionsFor(row, manage, standing = {}) {
  const leader = Boolean(Number(row?.leader || 0));
  const owner = Boolean(standing.owner);
  const command = Boolean(standing.command);
  const full = leader || manage || owner || command;
  const ranked = row?.rank_id != null && row?.rank_name != null;
  const has = (column, fallback) => full || (ranked ? flag(row[column]) : fallback);
  return {
    leader, manage, owner, command, full, member: Boolean(row?.member),
    rank: owner ? "Owner" : command ? "Command" : leader ? "Leader" : ranked ? row.rank_name : "Member",
    rankId: ranked ? Number(row.rank_id) : null,
    level: full ? 100 : ranked ? Number(row.level) : 0,
    spend: has("can_spend", false),
    sell: has("can_sell", false),
    roster: has("can_roster", false),
    ranks: has("can_ranks", false),
    motd: has("can_motd", false),
    announce: has("can_announce", false),
    discipline: has("can_discipline", false),
    applications: has("can_applications", false),
    profile: has("can_profile", false),
    ledger: full || (ranked ? row.can_ledger == null || flag(row.can_ledger) : true),
    spendLimit: full || !ranked || row.spend_limit == null ? null : Number(row.spend_limit),
  };
}

export function createEconomy({ client, db, audit, log, authority = null, propertySetup = null }) {
  async function seed() {
    for (const row of DEFAULT_SHOP)
      await db.query(
        "INSERT IGNORE INTO org_shop_items(item_key,kind,label,description,price,org_types,data,enabled,sort_order,stock,requires) VALUES(?,?,?,?,?,?,?,TRUE,?,?,?)",
        [row.item_key, row.kind, row.label, row.description, row.price, row.org_types, JSON.stringify(row.data), row.sort_order, row.stock, row.requires],
      );
  }

  /** Co-Owner and above manage every organization, with or without the ACE permission. */
  async function coOwnerOrAbove(discordId) {
    const [level, coOwner] = await Promise.all([staffLevel(discordId), db.one("SELECT rank_order FROM ace_groups WHERE name='co_owner'")]);
    return level >= Number(coOwner?.rank_order ?? 950);
  }

  /** Global managers see every org; configured Discord roles manage only their assigned org type. */
  async function managementAccess(discordId) {
    if (superuserIds().has(String(discordId)) || (await coOwnerOrAbove(discordId)))
      return { all: true, types: new Set(Object.values(ORG_MANAGER_GRANT_TYPES).flat()) };
    const roleIds = new Set();
    // Read the relevant management servers live so a newly granted role works immediately. The
    // database cache remains a fallback for a temporarily unavailable Discord server.
    for (const guild of client.guilds.cache.values()) {
      if (![...ORG_TYPE_MANAGER_ROLE_ID_SET].some((roleId) => guild.roles.cache.has(roleId))) continue;
      const member = guild.members.cache.get(String(discordId)) || await guild.members.fetch(String(discordId)).catch(() => null);
      if (member)
        for (const roleId of member.roles.cache.keys())
          if (ORG_TYPE_MANAGER_ROLE_ID_SET.has(String(roleId))) roleIds.add(String(roleId));
    }
    const rows = await db.query("SELECT roles FROM discord_member_cache WHERE discord_id=?", [String(discordId)]);
    for (const row of rows) {
      let roles = row.roles || [];
      if (typeof roles === "string") try { roles = JSON.parse(roles); } catch { roles = []; }
      if (Array.isArray(roles))
        for (const roleId of roles)
          if (ORG_TYPE_MANAGER_ROLE_ID_SET.has(String(roleId))) roleIds.add(String(roleId));
    }
    return { all: false, types: managedOrgTypesForRoleIds(roleIds) };
  }

  const managesType = (access, orgType) => access.all || access.types.has(String(orgType));
  const canManage = async (discordId, orgType = null) => {
    const access = await managementAccess(discordId);
    return orgType == null ? access.all : managesType(access, orgType);
  };

  const permsFrom = permissionsFor;
  const standingOf = async (discordId, org) => (authority ? authority.standing(discordId, org).catch(() => ({})) : {});

  /**
   * Organizations the member belongs to with their rank. As with /duty, membership is holding the
   * access role; the roster row carries the leader flag and rank (and is removed by the role sync on leaving).
   */
  async function memberships(discordId) {
    const rows = await db.query(
      `SELECT o.id,o.slug,o.name,o.type,o.color,o.motd,1 member,
              m.manager leader,m.rank_id,r.name rank_name,r.level,r.can_spend,r.can_roster,r.can_ranks,r.can_motd,r.can_sell,r.can_ledger,r.can_announce,r.can_discipline,r.can_applications,r.can_profile,r.spend_limit
         FROM organizations o
         LEFT JOIN organization_members m ON m.org_id=o.id AND m.discord_id=?
         LEFT JOIN org_ranks r ON r.id=m.rank_id AND r.org_id=o.id
        WHERE o.active=TRUE AND EXISTS(SELECT 1 FROM organization_role_requirements q
                   JOIN discord_member_cache c ON c.guild_id=q.guild_id AND c.discord_id=? AND JSON_CONTAINS(c.roles, JSON_QUOTE(q.role_id))
                  WHERE q.org_id=o.id)
        ORDER BY o.name`,
      [String(discordId), String(discordId)],
    );
    return rows.map((row) => ({ ...row, leader: Boolean(Number(row.leader || 0)), perms: permsFrom(row, false) }));
  }

  async function holdsAccessRole(discordId, orgId) {
    return Boolean(await db.one(
      `SELECT 1 ok FROM organization_role_requirements r
         JOIN discord_member_cache c ON c.guild_id=r.guild_id AND c.discord_id=? AND JSON_CONTAINS(c.roles, JSON_QUOTE(r.role_id))
        WHERE r.org_id=? LIMIT 1`,
      [String(discordId), Number(orgId)],
    ));
  }

  async function findOrg(ref) {
    const org = await db.one("SELECT id,slug,name,type,color,motd,active,guild_id FROM organizations WHERE id=? OR slug=?", [Number(ref) || 0, String(ref || "").toLowerCase()]);
    if (!org || !Number(org.active)) throw new Error("Organization not found.");
    return org;
  }

  async function accessTo(discordId, orgRef) {
    const org = await findOrg(orgRef);
    const [access, memberOrgs, standing] = await Promise.all([managementAccess(discordId), memberships(discordId), standingOf(discordId, org)]);
    const manage = managesType(access, org.type);
    const mine = memberOrgs.find((row) => Number(row.id) === Number(org.id));
    if (!mine && !manage && !standing.owner && !standing.command) throw new Error("You are not a member of that organization.");
    const perms = permsFrom(mine || {}, manage, standing);
    return { org, member: Boolean(mine), leader: perms.full, manage, perms };
  }

  async function wallet(orgId) {
    return (await db.one("SELECT balance,lifetime_earned,lifetime_spent,updated_at FROM org_wallets WHERE org_id=?", [orgId])) ||
      { balance: 0, lifetime_earned: 0, lifetime_spent: 0, updated_at: 0 };
  }

  /**
   * Trusted service bridge used by the gang/business manager bots.  Linked managers never own a
   * second cash balance: every adjustment lands in the same wallet and ledger used by FiveM and
   * the member portal. Wallet rows are locked in a stable order so multi-organization payouts are
   * atomic, and requestId makes a retry after a lost HTTP response safe.
   */
  async function serviceBatch(input) {
    const raw = Array.isArray(input?.entries) ? input.entries : [];
    if (!raw.length || raw.length > 100) throw new Error("Supply between 1 and 100 wallet entries.");
    const actorId = text(input.actorId || "manager-service", 32) || "manager-service";
    const source = text(input.source || "organization manager", 40) || "organization manager";
    const requestId = text(input.requestId, 48);
    if (!requestId) throw new Error("requestId is required.");

    const entries = [];
    for (let index = 0; index < raw.length; index += 1) {
      const row = raw[index] || {};
      const org = await findOrg(row.orgId);
      const amount = Math.round(Number(row.amount));
      if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 100000000)
        throw new Error("Every wallet amount must be non-zero and at most $100,000,000.");
      const reason = text(row.reason, 140);
      if (reason.length < 3) throw new Error("Every wallet entry needs a reason.");
      entries.push({ org, amount, reason, ref: `${requestId}:${index}` });
    }

    const stamp = Date.now();
    const result = await db.transaction(async (query) => {
      const ids = [...new Set(entries.map((entry) => Number(entry.org.id)))].sort((a, b) => a - b);
      for (const id of ids)
        await query("INSERT IGNORE INTO org_wallets(org_id,balance,updated_at) VALUES(?,0,?)", [id, stamp]);
      const placeholders = ids.map(() => "?").join(",");
      const locked = await query(`SELECT org_id,balance FROM org_wallets WHERE org_id IN (${placeholders}) ORDER BY org_id FOR UPDATE`, ids);

      // The wallet locks serialize retries. Seeing the first reference means the whole original
      // transaction committed, because all entries are inserted in this MariaDB transaction.
      const [duplicate] = await query(
        "SELECT 1 ok FROM org_transactions WHERE org_id=? AND kind='manager_adjust' AND ref=? LIMIT 1",
        [entries[0].org.id, entries[0].ref],
      );
      if (duplicate) {
        return {
          duplicate: true,
          balances: Object.fromEntries(locked.map((row) => [String(row.org_id), Number(row.balance)])),
        };
      }

      const balances = new Map(locked.map((row) => [Number(row.org_id), Number(row.balance)]));
      for (const entry of entries) {
        const id = Number(entry.org.id);
        const next = Number(balances.get(id) || 0) + entry.amount;
        if (next < 0) throw new Error(`${entry.org.name} only has ${money(balances.get(id) || 0)}.`);
        balances.set(id, next);
      }
      for (const [id, balance] of balances) {
        const earned = entries.filter((entry) => Number(entry.org.id) === id && entry.amount > 0).reduce((sum, entry) => sum + entry.amount, 0);
        const spent = entries.filter((entry) => Number(entry.org.id) === id && entry.amount < 0).reduce((sum, entry) => sum - entry.amount, 0);
        await query(
          "UPDATE org_wallets SET balance=?,lifetime_earned=lifetime_earned+?,lifetime_spent=lifetime_spent+?,updated_at=? WHERE org_id=?",
          [balance, earned, spent, stamp, id],
        );
      }
      const running = new Map(locked.map((row) => [Number(row.org_id), Number(row.balance)]));
      for (const entry of entries) {
        const id = Number(entry.org.id);
        const after = Number(running.get(id) || 0) + entry.amount;
        running.set(id, after);
        await query(
          "INSERT INTO org_transactions(org_id,amount,balance_after,kind,description,actor_id,ref,created_at) VALUES(?,?,?,'manager_adjust',?,?,?,?)",
          [id, entry.amount, after, `${source}: ${entry.reason}`, actorId, entry.ref, stamp],
        );
      }
      return { duplicate: false, balances: Object.fromEntries([...balances].map(([id, balance]) => [String(id), balance])) };
    });

    if (!result.duplicate) {
      await audit(actorId, "economy.manager_batch", requestId, {
        source,
        entries: entries.map((entry) => ({ org: entry.org.id, amount: entry.amount, reason: entry.reason })),
      });
      await notifyGame();
    }
    return {
      ...result,
      results: entries.map((entry) => ({
        orgId: Number(entry.org.id),
        balance: Number(result.balances[String(entry.org.id)] || 0),
      })),
    };
  }

  async function shop() {
    return (await db.query("SELECT * FROM org_shop_items WHERE enabled=TRUE ORDER BY FIELD(kind,'property','vehicle','weapon','outfit','perk'),sort_order,label")).map((row) => ({
      ...row,
      data: parse(row.data, {}),
      stock: row.stock == null ? null : Number(row.stock),
      requires: row.requires || null,
      org_types: String(row.org_types || "").split(",").map((type) => type.trim()).filter(Boolean),
    }));
  }

  /** Spending today by one member (purchases and outgoing transfers), for rank spend limits. */
  async function spentToday(query, orgId, actorId) {
    const [row] = await query(
      "SELECT COALESCE(SUM(-amount),0) spent FROM org_transactions WHERE org_id=? AND actor_id=? AND amount<0 AND kind IN ('purchase','transfer_out') AND created_at>=?",
      [orgId, String(actorId), dayStart()],
    );
    return Number(row?.spent || 0);
  }

  async function enforceLimit(query, perms, orgId, actorId, amount) {
    if (perms.spendLimit == null) return;
    const spent = await spentToday(query, orgId, actorId);
    if (spent + Number(amount) > perms.spendLimit)
      throw new Error(`Your rank (${perms.rank}) may spend ${money(perms.spendLimit)} a day. You have ${money(Math.max(0, perms.spendLimit - spent))} left today.`);
  }

  async function orgDetail(org, perms) {
    const week = Date.now() - 7 * 86400000;
    const department = DEPARTMENT_TYPES.has(org.type);
    const [purse, transactions, purchases, properties, runs, earnings, leaders, ranks, roster, seizures] = await Promise.all([
      wallet(org.id),
      db.query("SELECT id,amount,balance_after,kind,description,actor_id,created_at FROM org_transactions WHERE org_id=? ORDER BY id DESC LIMIT 40", [org.id]),
      db.query("SELECT item_key,kind,label,price,purchased_by,created_at FROM org_purchases WHERE org_id=? ORDER BY created_at DESC", [org.id]),
      db.query("SELECT p.item_key,p.purchased_at,p.setup_status,p.setup_at,i.label,i.data FROM org_properties p LEFT JOIN org_shop_items i ON i.item_key=p.item_key WHERE p.org_id=?", [org.id]),
      db.query("SELECT drug,status,SUM(units) units,SUM(payout) payout,COUNT(*) runs FROM org_drug_runs WHERE org_id=? AND created_at>=? GROUP BY drug,status", [org.id, week]),
      db.query("SELECT kind,SUM(amount) total FROM org_transactions WHERE org_id=? AND created_at>=? AND amount>0 GROUP BY kind", [org.id, week]),
      db.query("SELECT discord_id FROM organization_members WHERE org_id=? AND manager=TRUE", [org.id]),
      db.query(`SELECT r.id,r.name,r.level,r.color,r.description,${RANK_COLUMNS.map((column) => `r.${column}`).join(",")},r.spend_limit,r.min_weekly_minutes,COUNT(m.discord_id) members FROM org_ranks r LEFT JOIN organization_members m ON m.org_id=r.org_id AND m.rank_id=r.id WHERE r.org_id=? GROUP BY r.id ORDER BY r.level DESC,r.name`, [org.id]),
      db.query(
        `SELECT m.discord_id,m.manager,m.rank_id,r.name rank_name,r.level,m.added_at,
                COALESCE(SUM(CASE WHEN s.started_at>=? THEN COALESCE(NULLIF(s.seconds,0),GREATEST(0,FLOOR((s.heartbeat_at-s.started_at)/1000))) ELSE 0 END),0) week_seconds,
                MAX(s.started_at) last_shift,
                COALESCE(MAX(s.ended_at IS NULL AND s.heartbeat_at>=?),0) on_duty
           FROM organization_members m
           LEFT JOIN org_ranks r ON r.id=m.rank_id AND r.org_id=m.org_id
           LEFT JOIN organization_shifts s ON s.org_id=m.org_id AND s.discord_id=m.discord_id
          WHERE m.org_id=?
          GROUP BY m.discord_id,m.manager,m.rank_id,r.name,r.level,m.added_at
          ORDER BY m.manager DESC,COALESCE(r.level,0) DESC,week_seconds DESC LIMIT 250`,
        [week, Date.now() - 180000, org.id],
      ),
      department
        ? db.query("SELECT drug,SUM(units) units,COUNT(*) runs FROM org_drug_runs WHERE seized_org_id=? AND created_at>=? GROUP BY drug", [org.id, week])
        : Promise.resolve([]),
    ]);
    const placed = properties.length
      ? await db.query(
          `SELECT property_key,point FROM property_points WHERE property_key IN (${properties.map(() => "?").join(",")}) ORDER BY point`,
          properties.map((row) => row.item_key),
        ).catch(() => [])
      : [];
    const spotsOf = (key) => placed.filter((row) => row.property_key === key).map((row) => row.point);
    const [leadership, rosterSettings, rankRoles, activity] = await Promise.all([
      authority ? authority.leadership(org).catch(() => null) : null,
      authority ? authority.settings(org.id).catch(() => null) : null,
      authority ? authority.bindings(org.id).catch(() => []) : [],
      db.query("SELECT id,actor_id,action,target_id,detail,created_at FROM org_roster_log WHERE org_id=? ORDER BY id DESC LIMIT 30", [org.id]).catch(() => []),
    ]);
    const roleName = (guildId, roleId) => client.guilds.cache.get(String(guildId))?.roles.cache.get(String(roleId));
    const commandSet = new Set(leadership?.commandMembers || []);
    return {
      id: org.id, slug: org.slug, name: org.name, type: org.type, color: org.color, motd: org.motd || "",
      department,
      leader: perms.spend, manage: perms.manage, perms,
      wallet: purse,
      transactions: perms.ledger ? transactions : [],
      leadership,
      rosterSettings,
      activity: activity.map((row) => ({ ...row, detail: parse(row.detail, {}), created_at: Number(row.created_at) })),
      purchases,
      properties: properties.map((row) => ({ ...row, data: parse(row.data, {}), spots: spotsOf(row.item_key) })),
      drugWeek: runs,
      seizuresWeek: seizures,
      earningsWeek: earnings,
      leaders: leaders.map((row) => String(row.discord_id)),
      ranks: ranks.map((row) => ({
        id: Number(row.id), name: row.name, level: Number(row.level), members: Number(row.members),
        color: row.color || null, description: row.description || "",
        ...Object.fromEntries(RANK_PERMISSIONS.map((perm) => [perm.column, row[perm.column] == null ? perm.default : flag(row[perm.column])])),
        spend_limit: row.spend_limit == null ? null : Number(row.spend_limit),
        min_weekly_minutes: row.min_weekly_minutes == null ? null : Number(row.min_weekly_minutes),
        roles: rankRoles.filter((binding) => Number(binding.rank_id) === Number(row.id)).map((binding) => {
          const role = roleName(binding.guild_id, binding.role_id);
          return { guildId: String(binding.guild_id), roleId: String(binding.role_id), name: role?.name || "Deleted role", color: role && role.hexColor !== "#000000" ? role.hexColor : null, guildName: client.guilds.cache.get(String(binding.guild_id))?.name || null };
        }),
      })),
      roster: roster.map((row) => ({
        discord_id: String(row.discord_id), leader: flag(row.manager), rank_id: row.rank_id == null ? null : Number(row.rank_id),
        owner: Boolean(leadership?.ownerId && leadership.ownerId === String(row.discord_id)), command: commandSet.has(String(row.discord_id)),
        rank: flag(row.manager) ? "Leader" : row.rank_name || "Member", level: flag(row.manager) ? 100 : Number(row.level || 0),
        week_seconds: Number(row.week_seconds || 0), last_shift: row.last_shift ? Number(row.last_shift) : null, on_duty: flag(row.on_duty), added_at: Number(row.added_at || 0),
      })),
    };
  }

  async function portalData(discordId) {
    const [access, mine] = await Promise.all([managementAccess(discordId), memberships(discordId)]);
    let managed = [];
    if (access.all) managed = await db.query("SELECT id,slug,name,type,color,motd FROM organizations WHERE active=TRUE ORDER BY name");
    else if (access.types.size) {
      const types = [...access.types];
      managed = await db.query(
        `SELECT id,slug,name,type,color,motd FROM organizations WHERE active=TRUE AND type IN (${types.map(() => "?").join(",")}) ORDER BY name`,
        types,
      );
    }
    // Owners and command (manager registries) run their organization even without its access role.
    const active = authority ? await db.query("SELECT id,slug,name,type,color,motd,guild_id FROM organizations WHERE active=TRUE") : [];
    const standing = authority ? await authority.standings(discordId, active).catch(() => new Map()) : new Map();
    const led = active.filter((org) => standing.has(Number(org.id)));
    const byId = new Map([...mine, ...managed, ...led].map((org) => [Number(org.id), org]));
    const orgRows = [...byId.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const manage = access.all || access.types.size > 0;
    if (!orgRows.length) return { organizations: [], shop: [], owners: {}, ownedCount: {}, manage, permissions: RANK_PERMISSIONS };
    const organizations = [];
    for (const org of orgRows) {
      const membership = mine.find((row) => Number(row.id) === Number(org.id));
      organizations.push(await orgDetail(org, permsFrom(membership || {}, managesType(access, org.type), standing.get(Number(org.id)) || {})));
    }
    const owners = Object.fromEntries(
      (await db.query("SELECT p.item_key,o.name FROM org_properties p JOIN organizations o ON o.id=p.org_id")).map((row) => [row.item_key, row.name]),
    );
    const ownedCount = Object.fromEntries((await db.query("SELECT item_key,COUNT(*) n FROM org_purchases GROUP BY item_key")).map((row) => [row.item_key, Number(row.n)]));
    const directory = (await db.query("SELECT id,name,type FROM organizations WHERE active=TRUE ORDER BY name")).map((row) => ({ id: Number(row.id), name: row.name, type: row.type }));
    return { organizations, shop: await shop(), owners, ownedCount, directory, manage, kinds: KIND_LABEL, permissions: RANK_PERMISSIONS };
  }

  async function notifyGame() {
    await callGame("/economy/refresh", {}).catch(() => null);
  }

  async function postLog(entry) {
    await log(null, { ...entry, server: false, footer: "Florida Bay Roleplay · Organization economy" }, "organizations").catch(() => {});
  }

  async function purchase(session, input) {
    const { org, perms } = await accessTo(session.id, input.orgId);
    if (!perms.spend) throw new Error("Your rank cannot spend from the wallet. Ask a leader.");
    const catalog = await shop();
    const row = catalog.find((entry) => entry.item_key === String(input.itemKey || ""));
    if (!row) throw new Error("That item is not for sale.");
    if (!row.org_types.includes(org.type)) throw new Error(`${row.label} is not available to ${org.type} organizations.`);
    const stamp = Date.now();
    const balance = await db.transaction(async (query) => {
      await query("INSERT IGNORE INTO org_wallets(org_id,balance,updated_at) VALUES(?,0,?)", [org.id, stamp]);
      const [purse] = await query("SELECT balance FROM org_wallets WHERE org_id=? FOR UPDATE", [org.id]);
      if ((await query("SELECT 1 ok FROM org_purchases WHERE org_id=? AND item_key=?", [org.id, row.item_key])).length)
        throw new Error(`${org.name} already owns ${row.label}.`);
      if (row.requires && !(await query("SELECT 1 ok FROM org_purchases WHERE org_id=? AND item_key=?", [org.id, row.requires])).length) {
        const needed = catalog.find((entry) => entry.item_key === row.requires);
        throw new Error(`${row.label} requires ${needed?.label || row.requires} first.`);
      }
      if (row.kind === "property") {
        const [owner] = await query("SELECT o.name FROM org_properties p JOIN organizations o ON o.id=p.org_id WHERE p.item_key=? FOR UPDATE", [row.item_key]);
        if (owner) throw new Error(`${row.label} is already owned by ${owner.name}.`);
      }
      if (row.stock != null) {
        const [count] = await query("SELECT COUNT(*) n FROM org_purchases WHERE item_key=? FOR UPDATE", [row.item_key]);
        if (Number(count?.n || 0) >= row.stock) throw new Error(`${row.label} is sold out (${row.stock} organization${row.stock === 1 ? "" : "s"} max). One must sell it back first.`);
      }
      const current = Number(purse?.balance || 0);
      if (current < Number(row.price)) throw new Error(`Not enough money. ${org.name} has ${money(current)}; ${row.label} costs ${money(row.price)}.`);
      await enforceLimit(query, perms, org.id, session.id, row.price);
      const after = current - Number(row.price);
      await query("UPDATE org_wallets SET balance=?,lifetime_spent=lifetime_spent+?,updated_at=? WHERE org_id=?", [after, row.price, stamp, org.id]);
      await query(
        "INSERT INTO org_transactions(org_id,amount,balance_after,kind,description,actor_id,ref,created_at) VALUES(?,?,?,'purchase',?,?,?,?)",
        [org.id, -Number(row.price), after, `Bought ${row.label}`, session.id, row.item_key, stamp],
      );
      await query(
        "INSERT INTO org_purchases(org_id,item_key,kind,label,price,purchased_by,created_at) VALUES(?,?,?,?,?,?,?)",
        [org.id, row.item_key, row.kind, row.label, row.price, session.id, stamp],
      );
      if (row.kind === "property")
        await query("INSERT INTO org_properties(item_key,org_id,purchased_by,purchased_at,setup_status) VALUES(?,?,?,?,'pending')", [row.item_key, org.id, session.id, stamp]);
      return after;
    });
    await audit(session.id, "economy.purchase", org.id, { item: row.item_key, label: row.label, price: row.price, balance });
    await postLog({
      title: `${org.name} bought ${row.label}`,
      color: COLORS.primary,
      fields: [["Buyer", who(session.id)], ["Category", KIND_LABEL[row.kind] || row.kind], ["Price", money(row.price)], ["Wallet after", money(balance)]],
    });
    await notifyGame();
    // The property stays unusable until DevOps marks it as set up; tell them where it is.
    if (row.kind === "property") await propertySetup?.announce(row.item_key);
    return { balance };
  }

  /** Anything owned can be sold back for half its price; properties and limited stock are freed for others. */
  async function sellItem(session, input) {
    const { org, perms } = await accessTo(session.id, input.orgId);
    if (!perms.sell) throw new Error("Your rank cannot sell what the organization owns.");
    const key = String(input.itemKey || "");
    const stamp = Date.now();
    const result = await db.transaction(async (query) => {
      const [owned] = await query("SELECT item_key,kind,price,label FROM org_purchases WHERE org_id=? AND item_key=? FOR UPDATE", [org.id, key]);
      if (!owned) throw new Error("Your organization does not own that.");
      const [dependent] = await query(
        "SELECT p.label FROM org_purchases p JOIN org_shop_items i ON i.item_key=p.item_key WHERE p.org_id=? AND i.requires=? LIMIT 1",
        [org.id, key],
      );
      if (dependent) throw new Error(`Sell ${dependent.label} first - it requires ${owned.label}.`);
      const refund = Math.floor(Number(owned.price) / 2);
      await query("INSERT IGNORE INTO org_wallets(org_id,balance,updated_at) VALUES(?,0,?)", [org.id, stamp]);
      const [purse] = await query("SELECT balance FROM org_wallets WHERE org_id=? FOR UPDATE", [org.id]);
      const after = Number(purse?.balance || 0) + refund;
      await query("UPDATE org_wallets SET balance=?,updated_at=? WHERE org_id=?", [after, stamp, org.id]);
      await query("INSERT INTO org_transactions(org_id,amount,balance_after,kind,description,actor_id,ref,created_at) VALUES(?,?,?,'refund',?,?,?,?)", [org.id, refund, after, `Sold ${owned.label}`, session.id, key, stamp]);
      const [posted] = await query("SELECT setup_channel_id,setup_message_id FROM org_properties WHERE item_key=? AND org_id=?", [key, org.id]);
      await query("DELETE FROM org_properties WHERE item_key=? AND org_id=?", [key, org.id]);
      await query("DELETE FROM org_purchases WHERE item_key=? AND org_id=?", [key, org.id]);
      return { refund, after, label: owned.label, kind: owned.kind, posted };
    });
    await audit(session.id, "economy.sell_item", org.id, { item: key, refund: result.refund });
    await postLog({ title: `${org.name} sold ${result.label}`, color: COLORS.warning, fields: [["Seller", who(session.id)], ["Refund", money(result.refund)], ["Wallet after", money(result.after)]] });
    await notifyGame();
    if (result.kind === "property" && result.posted?.setup_message_id)
      await propertySetup?.retire({ channelId: result.posted.setup_channel_id, messageId: result.posted.setup_message_id, itemKey: key, label: result.label });
    return result;
  }

  /** Wallet to wallet: deals between gangs, businesses paying for services, grants to departments. */
  async function transfer(actorId, input) {
    const { org, perms } = await accessTo(actorId, input.orgId);
    if (!perms.spend) throw new Error("Your rank cannot spend from the wallet. Ask a leader.");
    const target = await findOrg(input.toOrgId);
    if (Number(target.id) === Number(org.id)) throw new Error("Pick a different organization to send money to.");
    const amount = Math.round(Number(input.amount));
    if (!Number.isFinite(amount) || amount < 1 || amount > 100000000) throw new Error("Enter an amount between $1 and $100,000,000.");
    const memo = text(input.memo, 120);
    if (memo.length < 3) throw new Error("Add a short memo so both ledgers say what the money was for.");
    const stamp = Date.now();
    const result = await db.transaction(async (query) => {
      for (const id of [org.id, target.id].map(Number).sort((a, b) => a - b))
        await query("INSERT IGNORE INTO org_wallets(org_id,balance,updated_at) VALUES(?,0,?)", [id, stamp]);
      const locked = await query("SELECT org_id,balance FROM org_wallets WHERE org_id IN (?,?) ORDER BY org_id FOR UPDATE", [org.id, target.id]);
      const from = Number(locked.find((row) => Number(row.org_id) === Number(org.id))?.balance || 0);
      const to = Number(locked.find((row) => Number(row.org_id) === Number(target.id))?.balance || 0);
      if (from < amount) throw new Error(`Not enough money. ${org.name} has ${money(from)}.`);
      await enforceLimit(query, perms, org.id, actorId, amount);
      await query("UPDATE org_wallets SET balance=?,lifetime_spent=lifetime_spent+?,updated_at=? WHERE org_id=?", [from - amount, amount, stamp, org.id]);
      await query("UPDATE org_wallets SET balance=?,lifetime_earned=lifetime_earned+?,updated_at=? WHERE org_id=?", [to + amount, amount, stamp, target.id]);
      await query("INSERT INTO org_transactions(org_id,amount,balance_after,kind,description,actor_id,ref,created_at) VALUES(?,?,?,'transfer_out',?,?,?,?)",
        [org.id, -amount, from - amount, `To ${target.name}: ${memo}`, String(actorId), String(target.id), stamp]);
      await query("INSERT INTO org_transactions(org_id,amount,balance_after,kind,description,actor_id,ref,created_at) VALUES(?,?,?,'transfer_in',?,?,?,?)",
        [target.id, amount, to + amount, `From ${org.name}: ${memo}`, String(actorId), String(org.id), stamp]);
      return { balance: from - amount };
    });
    await audit(actorId, "economy.transfer", org.id, { to: target.id, amount, memo });
    await postLog({ title: `Transfer · ${org.name} → ${target.name}`, color: COLORS.primary, fields: [["By", who(actorId)], ["Amount", money(amount)], ["Memo", memo, false]] });
    return { org, target, amount, balance: result.balance };
  }

  async function adjust(actorId, input) {
    const org = await findOrg(input.orgId);
    if (!(await canManage(actorId, org.type))) throw new Error(`You do not manage ${org.type} organization wallets.`);
    const amount = Math.round(Number(input.amount));
    if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 100000000) throw new Error("Enter a non-zero amount up to 100,000,000.");
    const reason = text(input.reason, 160);
    if (reason.length < 3) throw new Error("Give a reason for the adjustment.");
    const stamp = Date.now();
    const after = await db.transaction(async (query) => {
      await query("INSERT IGNORE INTO org_wallets(org_id,balance,updated_at) VALUES(?,0,?)", [org.id, stamp]);
      const [purse] = await query("SELECT balance FROM org_wallets WHERE org_id=? FOR UPDATE", [org.id]);
      const next = Number(purse?.balance || 0) + amount;
      if (next < 0) throw new Error(`That would take ${org.name} below $0.`);
      await query(
        `UPDATE org_wallets SET balance=?,lifetime_earned=lifetime_earned+?,lifetime_spent=lifetime_spent+?,updated_at=? WHERE org_id=?`,
        [next, Math.max(0, amount), Math.max(0, -amount), stamp, org.id],
      );
      await query("INSERT INTO org_transactions(org_id,amount,balance_after,kind,description,actor_id,created_at) VALUES(?,?,?,'adjust',?,?,?)", [org.id, amount, next, `Adjustment: ${reason}`, String(actorId), stamp]);
      return next;
    });
    await audit(actorId, "economy.adjust", org.id, { amount, reason, balance: after });
    await postLog({ title: `Wallet adjusted · ${org.name}`, color: amount > 0 ? COLORS.success : COLORS.warning, fields: [["By", who(actorId)], ["Amount", `${amount > 0 ? "+" : "-"}${money(Math.abs(amount))}`], ["Balance", money(after)], ["Reason", reason, false]] });
    return { org, amount, balance: after };
  }

  /** Staff who manage the type, the owner and command appoint leaders. */
  async function setLeader(actorId, input) {
    const org = await findOrg(input.orgId);
    const standing = await standingOf(actorId, org);
    if (!standing.owner && !standing.command && !(await canManage(actorId, org.type))) throw new Error(`Only ${org.name}'s owner, command or ${org.type} management can change leaders.`);
    const target = String(input.discordId || "").trim();
    if (!/^\d{15,24}$/.test(target)) throw new Error("Enter a Discord user ID.");
    // The role sync deletes roster rows of anyone without the access role, so a leader must hold it.
    if (input.leader && !(await holdsAccessRole(target, org.id)))
      throw new Error(`<@${target}> does not hold ${org.name}'s access role. Give them the role first, then make them a leader.`);
    if (input.leader) {
      await db.query(
        `INSERT INTO organization_members(org_id,discord_id,rank_name,manager,added_by,added_at) VALUES(?,?,'Leader',TRUE,?,?)
         ON DUPLICATE KEY UPDATE manager=TRUE,rank_name='Leader'`,
        [org.id, target, String(actorId), Date.now()],
      );
    } else await db.query("UPDATE organization_members SET manager=FALSE,rank_name=COALESCE((SELECT name FROM org_ranks WHERE id=organization_members.rank_id),'Member') WHERE org_id=? AND discord_id=?", [org.id, target]);
    await audit(actorId, input.leader ? "economy.leader_add" : "economy.leader_remove", org.id, { member: target });
    await rosterLog(org.id, actorId, input.leader ? "leader_add" : "leader_remove", target, {});
    await postLog({ title: `${input.leader ? "Leader added" : "Leader removed"} · ${org.name}`, color: COLORS.primary, fields: [["Member", who(target)], ["By", who(actorId)]] });
    await notifyGame();
    return { org, discordId: target, leader: Boolean(input.leader) };
  }

  async function rosterLog(orgId, actorId, action, targetId = null, detail = {}) {
    await db.query("INSERT INTO org_roster_log(org_id,actor_id,action,target_id,detail,created_at) VALUES(?,?,?,?,?,?)",
      [Number(orgId), String(actorId), action, targetId == null ? null : String(targetId), JSON.stringify(detail), Date.now()]).catch(() => {});
  }

  /** Ranks below the editor's own level, unless they run the organization. */
  function assertRankReach(perms, level, verb = "edit") {
    if (!perms.full && Number(level) >= perms.level) throw new Error(`You can only ${verb} ranks below your own (${perms.rank}).`);
  }

  /**
   * Rank editor: name, level (1-99), colour, description, permissions, daily spend limit and the
   * Discord roles bound to the rank. Owners, command and leaders edit every rank; ranks with "Edit
   * ranks" edit ranks below their own and can only grant permissions they hold themselves.
   */
  async function saveRank(actorId, input) {
    const { org, perms } = await accessTo(actorId, input.orgId);
    if (!perms.ranks) throw new Error("Your rank cannot edit ranks.");
    const name = text(input.name, 40);
    if (name.length < 2) throw new Error("Give the rank a name (2-40 characters).");
    if (/^(leader|member|owner|command)$/i.test(name)) throw new Error(`"${name}" is reserved. Pick another rank name.`);
    const level = Math.round(Number(input.level));
    if (!Number.isFinite(level) || level < 1 || level > 99) throw new Error("Rank level must be between 1 and 99 (leaders are 100).");
    assertRankReach(perms, level, "create or move");
    const limitRaw = String(input.spendLimit ?? "").trim();
    const spendLimit = limitRaw === "" ? null : Math.round(Number(limitRaw));
    if (spendLimit != null && (!Number.isFinite(spendLimit) || spendLimit < 0 || spendLimit > 100000000)) throw new Error("Daily spend limit must be blank (unlimited) or between $0 and $100,000,000.");
    const color = text(input.color, 7);
    if (color && !HEX.test(color)) throw new Error("Rank colour must be a hex colour like #35e2cd.");
    const description = text(input.description, 160);
    const granted = Object.fromEntries(RANK_PERMISSIONS.map((perm) => {
      const raw = input.perms && Object.hasOwn(input.perms, perm.key) ? input.perms[perm.key] : input[`can${perm.key[0].toUpperCase()}${perm.key.slice(1)}`];
      return [perm.key, raw == null ? perm.default : flag(raw)];
    }));
    if (!perms.full)
      for (const perm of RANK_PERMISSIONS)
        if (granted[perm.key] && GRANT_GUARDED.includes(perm.key) && !perms[perm.key])
          throw new Error(`You cannot grant "${perm.label}" because your own rank does not have it.`);
    const hoursRaw = String(input.minWeeklyHours ?? "").trim();
    const minWeeklyMinutes = hoursRaw === "" ? null : Math.round(Number(hoursRaw) * 60);
    if (minWeeklyMinutes != null && (!Number.isFinite(minWeeklyMinutes) || minWeeklyMinutes < 0 || minWeeklyMinutes > 168 * 60)) throw new Error("Weekly hours must be blank (no requirement) or between 0 and 168.");
    const values = [name, level, color || null, description || null, ...RANK_PERMISSIONS.map((perm) => granted[perm.key]), spendLimit, minWeeklyMinutes];
    const setters = ["name=?", "level=?", "color=?", "description=?", ...RANK_COLUMNS.map((column) => `${column}=?`), "spend_limit=?", "min_weekly_minutes=?"].join(",");
    let rankId = Number(input.rankId) || 0;
    try {
      if (rankId) {
        const existing = await db.one("SELECT id,level FROM org_ranks WHERE id=? AND org_id=?", [rankId, org.id]);
        if (!existing) throw new Error("That rank no longer exists.");
        assertRankReach(perms, existing.level);
        await db.query(`UPDATE org_ranks SET ${setters} WHERE id=? AND org_id=?`, [...values, rankId, org.id]);
        await db.query("UPDATE organization_members SET rank_name=? WHERE org_id=? AND rank_id=? AND manager=FALSE", [name, org.id, rankId]);
      } else {
        const [count] = await db.query("SELECT COUNT(*) n FROM org_ranks WHERE org_id=?", [org.id]);
        if (Number(count?.n || 0) >= MAX_RANKS) throw new Error(`An organization can have up to ${MAX_RANKS} ranks.`);
        const result = await db.query(
          `INSERT INTO org_ranks(org_id,name,level,color,description,${RANK_COLUMNS.join(",")},spend_limit,min_weekly_minutes,created_by,created_at) VALUES(?,?,?,?,?,${RANK_COLUMNS.map(() => "?").join(",")},?,?,?,?)`,
          [org.id, ...values, String(actorId), Date.now()],
        );
        rankId = Number(result.insertId);
      }
    } catch (error) {
      if (error?.code === "ER_DUP_ENTRY") throw new Error(`${org.name} already has a rank called ${name}.`);
      throw error;
    }
    let roles = null;
    if (authority && Array.isArray(input.roles)) roles = await authority.setRankBindings(org, rankId, input.roles, actorId);
    await audit(actorId, input.rankId ? "organization.rank_update" : "organization.rank_create", org.id, { name, level, spendLimit, perms: granted, roles: roles?.map((role) => role.roleId) });
    await rosterLog(org.id, actorId, input.rankId ? "rank_update" : "rank_create", rankId, { name, level, roles: roles?.map((role) => role.name) });
    await notifyGame();
    return { org, name, rankId, roles };
  }

  async function deleteRank(actorId, input) {
    const { org, perms } = await accessTo(actorId, input.orgId);
    if (!perms.ranks) throw new Error("Your rank cannot edit ranks.");
    const rank = await db.one("SELECT id,name,level FROM org_ranks WHERE id=? AND org_id=?", [Number(input.rankId), org.id]);
    if (!rank) throw new Error("That rank no longer exists.");
    assertRankReach(perms, rank.level, "delete");
    await db.transaction(async (query) => {
      await query("UPDATE organization_members SET rank_id=NULL,rank_name=IF(manager,'Leader','Member') WHERE org_id=? AND rank_id=?", [org.id, rank.id]);
      await query("DELETE FROM org_rank_roles WHERE org_id=? AND rank_id=?", [org.id, rank.id]);
      await query("DELETE FROM org_ranks WHERE id=? AND org_id=?", [rank.id, org.id]);
    });
    await audit(actorId, "organization.rank_delete", org.id, { name: rank.name });
    await rosterLog(org.id, actorId, "rank_delete", rank.id, { name: rank.name });
    await notifyGame();
    return { org, name: rank.name };
  }

  /** Re-number the ladder in one go: `order` lists rank ids from highest to lowest. */
  async function reorderRanks(actorId, input) {
    const { org, perms } = await accessTo(actorId, input.orgId);
    if (!perms.full) throw new Error("Only the owner, command and leaders can reorder the whole ladder.");
    const ranks = await db.query("SELECT id FROM org_ranks WHERE org_id=?", [org.id]);
    const order = (Array.isArray(input.order) ? input.order : []).map(Number);
    const known = new Set(ranks.map((row) => Number(row.id)));
    if (order.length !== known.size || order.some((id) => !known.has(id)) || new Set(order).size !== order.length)
      throw new Error("The new order must list every rank exactly once.");
    const step = Math.max(1, Math.floor(98 / Math.max(1, order.length)));
    await db.transaction(async (query) => {
      for (let index = 0; index < order.length; index += 1)
        await query("UPDATE org_ranks SET level=? WHERE id=? AND org_id=?", [Math.max(1, 99 - index * step), order[index], org.id]);
    });
    await audit(actorId, "organization.rank_reorder", org.id, { order });
    await rosterLog(org.id, actorId, "rank_reorder", null, { count: order.length });
    await notifyGame();
    return { org };
  }

  async function applyRank(org, target, rank, actorId) {
    await db.query(
      `INSERT INTO organization_members(org_id,discord_id,rank_name,rank_id,manager,added_by,added_at) VALUES(?,?,?,?,FALSE,?,?)
       ON DUPLICATE KEY UPDATE rank_id=VALUES(rank_id),rank_name=IF(manager,'Leader',VALUES(rank_name))`,
      [org.id, target, rank?.name || "Member", rank?.id || null, String(actorId), Date.now()],
    );
  }

  /** Owners, command, leaders and ranks with roster access promote and demote members below them. */
  async function setMemberRank(actorId, input) {
    const { org, perms } = await accessTo(actorId, input.orgId);
    if (!perms.roster) throw new Error("Your rank cannot manage the roster.");
    const target = String(input.discordId || "").trim();
    if (!/^\d{15,24}$/.test(target)) throw new Error("Choose a member.");
    if (!(await holdsAccessRole(target, org.id))) throw new Error(`<@${target}> does not hold ${org.name}'s access role.`);
    const current = await db.one("SELECT m.manager,r.level FROM organization_members m LEFT JOIN org_ranks r ON r.id=m.rank_id AND r.org_id=m.org_id WHERE m.org_id=? AND m.discord_id=?", [org.id, target]);
    const rankId = input.rankId === "" || input.rankId == null ? null : Number(input.rankId);
    const rank = rankId ? await db.one("SELECT id,name,level FROM org_ranks WHERE id=? AND org_id=?", [rankId, org.id]) : null;
    if (rankId && !rank) throw new Error("That rank no longer exists.");
    if (!perms.full) {
      if (target === String(actorId)) throw new Error("You cannot change your own rank.");
      if (flag(current?.manager)) throw new Error("Only the owner, command or staff can change a leader.");
      if (Number(current?.level || 0) >= perms.level) throw new Error("You can only manage members ranked below you.");
      if (rank && rank.level >= perms.level) throw new Error(`You can only assign ranks below your own (${perms.rank}).`);
    }
    await applyRank(org, target, rank, actorId);
    const before = Number(current?.level || 0);
    const after = Number(rank?.level || 0);
    if (before !== after || !current)
      await db.query("INSERT INTO org_member_records(org_id,discord_id,kind,body,actor_id,created_at) VALUES(?,?,?,?,?,?)",
        [org.id, target, after >= before ? "promotion" : "demotion", `${after >= before ? "Promoted" : "Demoted"} to ${rank?.name || "Member"}`, String(actorId), Date.now()]).catch(() => {});
    const roles = authority
      ? await authority.syncMemberRoles(org, target, rank?.id ?? null, `Rank set to ${rank?.name || "Member"} on the orgs website`).catch((error) => ({ added: 0, removed: 0, errors: [error.message] }))
      : null;
    await audit(actorId, "organization.member_rank", org.id, { member: target, rank: rank?.name || "Member", roles });
    await rosterLog(org.id, actorId, "member_rank", target, { rank: rank?.name || "Member", added: roles?.added || 0, removed: roles?.removed || 0 });
    await postLog({ title: `Rank change · ${org.name}`, color: COLORS.primary, fields: [["Member", who(target)], ["Rank", rank?.name || "Member"], ["By", who(actorId)]] });
    await notifyGame();
    return { org, discordId: target, rank: rank?.name || "Member", roles };
  }

  async function setMotd(actorId, input) {
    const { org, perms } = await accessTo(actorId, input.orgId);
    if (!perms.motd) throw new Error("Your rank cannot set the message of the day.");
    const motd = text(input.motd, 300);
    await db.query("UPDATE organizations SET motd=? WHERE id=?", [motd || null, org.id]);
    await audit(actorId, "organization.motd", org.id, { motd });
    await rosterLog(org.id, actorId, "motd", null, {});
    await notifyGame();
    return { org, motd };
  }

  /** Roster settings: push rank roles to Discord, and/or rank members from the roles they hold. */
  async function saveRosterSettings(actorId, input) {
    const { org, perms } = await accessTo(actorId, input.orgId);
    if (!perms.full) throw new Error("Only the owner, command and leaders can change roster settings.");
    const roleSync = flag(input.roleSync);
    const autoRank = flag(input.autoRank);
    await db.query(
      `INSERT INTO org_roster_settings(org_id,role_sync,auto_rank,updated_by,updated_at) VALUES(?,?,?,?,?)
       ON DUPLICATE KEY UPDATE role_sync=VALUES(role_sync),auto_rank=VALUES(auto_rank),updated_by=VALUES(updated_by),updated_at=VALUES(updated_at)`,
      [org.id, roleSync, autoRank, String(actorId), Date.now()],
    );
    await audit(actorId, "organization.roster_settings", org.id, { roleSync, autoRank });
    await rosterLog(org.id, actorId, "settings", null, { roleSync, autoRank });
    return { org, roleSync, autoRank };
  }

  /** Rank every roster member by the highest bound role they hold in Discord. */
  async function importRanksFromDiscord(actorId, input) {
    const { org, perms } = await accessTo(actorId, input.orgId);
    if (!perms.full) throw new Error("Only the owner, command and leaders can import ranks from Discord.");
    if (!authority) throw new Error("Rank roles are unavailable.");
    const changes = await authority.rankChangesFromDiscord(org, { demote: flag(input.demote) });
    for (const change of changes) await applyRank(org, change.discordId, change.rank, actorId);
    await audit(actorId, "organization.rank_import", org.id, { changed: changes.length });
    await rosterLog(org.id, actorId, "rank_import", null, { changed: changes.length });
    if (changes.length) await notifyGame();
    return { org, changed: changes.length };
  }

  /** Auto-rank organizations follow their bound Discord roles. Runs on a timer from index.js. */
  async function reconcileAutoRanks() {
    if (!authority) return 0;
    const rows = await db.query("SELECT o.id,o.slug,o.name,o.type,o.guild_id FROM org_roster_settings s JOIN organizations o ON o.id=s.org_id WHERE s.auto_rank=TRUE AND o.active=TRUE").catch(() => []);
    let changed = 0;
    for (const org of rows) {
      const changes = await authority.rankChangesFromDiscord(org, { demote: true }).catch(() => []);
      for (const change of changes) {
        await applyRank(org, change.discordId, change.rank, "auto-rank");
        await rosterLog(org.id, "auto-rank", "member_rank", change.discordId, { rank: change.rank?.name || "Member", auto: true });
      }
      changed += changes.length;
    }
    if (changed) await notifyGame();
    return changed;
  }

  /** Discord roles this organization can bind to ranks, for the rank editor. */
  async function bindableRoles(actorId, orgRef) {
    const { org, perms } = await accessTo(actorId, orgRef);
    if (!perms.ranks) throw new Error("Your rank cannot edit ranks.");
    return authority ? authority.bindableRoles(org) : [];
  }

  /** Discord: one organization's wallet summary. */
  async function summary(actorId, orgRef) {
    const access = await managementAccess(actorId);
    const mine = await memberships(actorId);
    let org = null;
    if (orgRef) {
      org = await db.one("SELECT id,slug,name,type,color,motd FROM organizations WHERE active=TRUE AND (slug=? OR name=?)", [String(orgRef).toLowerCase(), String(orgRef)]);
      if (!org) throw new Error("Organization not found.");
      if (!managesType(access, org.type) && !mine.some((row) => Number(row.id) === Number(org.id))) throw new Error("You are not a member of that organization.");
    } else {
      if (!mine.length) throw new Error("You are not a member of any organization. Pass `organization:` if you manage them.");
      org = mine[0];
    }
    const membership = mine.find((row) => Number(row.id) === Number(org.id));
    return { org, ...(await orgDetail(org, permsFrom(membership || {}, managesType(access, org.type)))) };
  }

  return {
    seed, portalData, purchase, sellItem, sellProperty: sellItem, transfer, adjust, setLeader,
    saveRank, deleteRank, reorderRanks, setMemberRank, setMotd, saveRosterSettings, importRanksFromDiscord, reconcileAutoRanks, bindableRoles,
    summary, memberships, canManage, wallet, serviceBatch, money, KIND_LABEL, accessTo,
  };
}
