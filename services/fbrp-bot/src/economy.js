import { superuserIds } from "./database.js";
import { callGame } from "./sync.js";
import { COLORS, who } from "./ui.js";

/**
 * Organization economy (website + Discord side).
 *
 * Money is stored only in MariaDB (org_wallets / org_transactions). The game server credits it
 * when gangs deliver product or businesses work their properties; leaders spend it here on
 * properties (MLOs), vehicles, armory permits, outfits (EUP) and perks. Every purchase is applied
 * to the game immediately through the fbrp_core HTTP API.
 */

const item = (item_key, kind, label, price, org_types, data, description = "", sort_order = 0) => ({ item_key, kind, label, price, org_types, data, description, sort_order });
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
].map((row, index) => ({ ...row, sort_order: row.sort_order || index * 10 }));

const KIND_LABEL = { property: "Properties", vehicle: "Vehicles", weapon: "Armory permits", outfit: "Outfits", perk: "Perks" };
const parse = (value, fallback) => {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(String(value ?? "")); } catch { return fallback; }
};
const text = (value, max) => String(value ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
const money = (value) => `$${Number(value || 0).toLocaleString("en-US")}`;

export function createEconomy({ client, db, audit, log, hasPermission }) {
  async function seed() {
    for (const row of DEFAULT_SHOP)
      await db.query(
        "INSERT IGNORE INTO org_shop_items(item_key,kind,label,description,price,org_types,data,enabled,sort_order) VALUES(?,?,?,?,?,?,?,TRUE,?)",
        [row.item_key, row.kind, row.label, row.description, row.price, row.org_types, JSON.stringify(row.data), row.sort_order],
      );
  }

  const canManage = async (discordId) => superuserIds().has(String(discordId)) || Boolean(await hasPermission(discordId, "fbrp.organizations.manage"));

  /**
   * Organizations the member belongs to with their leader flag. As with /duty, membership is holding the
   * access role; the roster row only carries the leader flag (and is removed by the role sync on leaving).
   */
  async function memberships(discordId) {
    const rows = await db.query(
      `SELECT o.id,o.slug,o.name,o.type,o.color,
              COALESCE((SELECT MAX(m.manager) FROM organization_members m WHERE m.org_id=o.id AND m.discord_id=?),0) leader
         FROM organizations o
        WHERE o.active=TRUE AND EXISTS(SELECT 1 FROM organization_role_requirements r
                   JOIN discord_member_cache c ON c.guild_id=r.guild_id AND c.discord_id=? AND JSON_CONTAINS(c.roles, JSON_QUOTE(r.role_id))
                  WHERE r.org_id=o.id)
        ORDER BY o.name`,
      [String(discordId), String(discordId)],
    );
    return rows.map((row) => ({ ...row, leader: Boolean(Number(row.leader)) }));
  }

  async function holdsAccessRole(discordId, orgId) {
    return Boolean(await db.one(
      `SELECT 1 ok FROM organization_role_requirements r
         JOIN discord_member_cache c ON c.guild_id=r.guild_id AND c.discord_id=? AND JSON_CONTAINS(c.roles, JSON_QUOTE(r.role_id))
        WHERE r.org_id=? LIMIT 1`,
      [String(discordId), Number(orgId)],
    ));
  }

  async function accessTo(discordId, orgId) {
    const manage = await canManage(discordId);
    const org = await db.one("SELECT id,slug,name,type,color,active FROM organizations WHERE id=?", [Number(orgId)]);
    if (!org || !Number(org.active)) throw new Error("Organization not found.");
    const mine = (await memberships(discordId)).find((row) => Number(row.id) === Number(org.id));
    if (!mine && !manage) throw new Error("You are not a member of that organization.");
    return { org, member: Boolean(mine), leader: Boolean(mine?.leader) || manage, manage };
  }

  async function wallet(orgId) {
    return (await db.one("SELECT balance,lifetime_earned,lifetime_spent,updated_at FROM org_wallets WHERE org_id=?", [orgId])) ||
      { balance: 0, lifetime_earned: 0, lifetime_spent: 0, updated_at: 0 };
  }

  async function shop() {
    return (await db.query("SELECT * FROM org_shop_items WHERE enabled=TRUE ORDER BY FIELD(kind,'property','vehicle','weapon','outfit','perk'),sort_order,label")).map((row) => ({
      ...row,
      data: parse(row.data, {}),
      org_types: String(row.org_types || "").split(",").map((type) => type.trim()).filter(Boolean),
    }));
  }

  async function orgDetail(org, viewer) {
    const week = Date.now() - 7 * 86400000;
    const [purse, transactions, purchases, properties, runs, earnings, leaders] = await Promise.all([
      wallet(org.id),
      db.query("SELECT id,amount,balance_after,kind,description,actor_id,created_at FROM org_transactions WHERE org_id=? ORDER BY id DESC LIMIT 40", [org.id]),
      db.query("SELECT item_key,kind,label,price,purchased_by,created_at FROM org_purchases WHERE org_id=? ORDER BY created_at DESC", [org.id]),
      db.query("SELECT p.item_key,p.purchased_at,i.label,i.data FROM org_properties p LEFT JOIN org_shop_items i ON i.item_key=p.item_key WHERE p.org_id=?", [org.id]),
      db.query("SELECT drug,status,SUM(units) units,SUM(payout) payout,COUNT(*) runs FROM org_drug_runs WHERE org_id=? AND created_at>=? GROUP BY drug,status", [org.id, week]),
      db.query("SELECT kind,SUM(amount) total FROM org_transactions WHERE org_id=? AND created_at>=? AND amount>0 GROUP BY kind", [org.id, week]),
      db.query("SELECT discord_id FROM organization_members WHERE org_id=? AND manager=TRUE", [org.id]),
    ]);
    return {
      id: org.id, slug: org.slug, name: org.name, type: org.type, color: org.color,
      leader: viewer.leader, manage: viewer.manage,
      wallet: purse,
      transactions,
      purchases,
      properties: properties.map((row) => ({ ...row, data: parse(row.data, {}) })),
      drugWeek: runs,
      earningsWeek: earnings,
      leaders: leaders.map((row) => String(row.discord_id)),
    };
  }

  async function portalData(discordId) {
    const manage = await canManage(discordId);
    const mine = await memberships(discordId);
    const orgRows = manage
      ? await db.query("SELECT id,slug,name,type,color FROM organizations WHERE active=TRUE AND type IN ('gang','business','other') ORDER BY name")
      : mine;
    if (!orgRows.length) return { organizations: [], shop: [], owners: {}, manage };
    const organizations = [];
    for (const org of orgRows) {
      const membership = mine.find((row) => Number(row.id) === Number(org.id));
      organizations.push(await orgDetail(org, { leader: Boolean(membership?.leader) || manage, manage }));
    }
    const owners = Object.fromEntries(
      (await db.query("SELECT p.item_key,o.name FROM org_properties p JOIN organizations o ON o.id=p.org_id")).map((row) => [row.item_key, row.name]),
    );
    return { organizations, shop: await shop(), owners, manage, kinds: KIND_LABEL };
  }

  async function notifyGame() {
    await callGame("/economy/refresh", {}).catch(() => null);
  }

  async function postLog(entry) {
    await log(null, { ...entry, server: false, footer: "Florida Bay Roleplay · Organization economy" }, "organizations").catch(() => {});
  }

  async function purchase(session, input) {
    const { org, leader } = await accessTo(session.id, input.orgId);
    if (!leader) throw new Error("Only organization leaders can spend from the wallet.");
    const row = (await shop()).find((entry) => entry.item_key === String(input.itemKey || ""));
    if (!row) throw new Error("That item is not for sale.");
    if (!row.org_types.includes(org.type)) throw new Error(`${row.label} is not available to ${org.type} organizations.`);
    const stamp = Date.now();
    const balance = await db.transaction(async (query) => {
      await query("INSERT IGNORE INTO org_wallets(org_id,balance,updated_at) VALUES(?,0,?)", [org.id, stamp]);
      const [purse] = await query("SELECT balance FROM org_wallets WHERE org_id=? FOR UPDATE", [org.id]);
      if ((await query("SELECT 1 ok FROM org_purchases WHERE org_id=? AND item_key=?", [org.id, row.item_key])).length)
        throw new Error(`${org.name} already owns ${row.label}.`);
      if (row.kind === "property") {
        const [owner] = await query("SELECT o.name FROM org_properties p JOIN organizations o ON o.id=p.org_id WHERE p.item_key=? FOR UPDATE", [row.item_key]);
        if (owner) throw new Error(`${row.label} is already owned by ${owner.name}.`);
      }
      const current = Number(purse?.balance || 0);
      if (current < Number(row.price)) throw new Error(`Not enough money. ${org.name} has ${money(current)}; ${row.label} costs ${money(row.price)}.`);
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
        await query("INSERT INTO org_properties(item_key,org_id,purchased_by,purchased_at) VALUES(?,?,?,?)", [row.item_key, org.id, session.id, stamp]);
      return after;
    });
    await audit(session.id, "economy.purchase", org.id, { item: row.item_key, label: row.label, price: row.price, balance });
    await postLog({
      title: `${org.name} bought ${row.label}`,
      color: COLORS.primary,
      fields: [["Buyer", who(session.id)], ["Category", KIND_LABEL[row.kind] || row.kind], ["Price", money(row.price)], ["Wallet after", money(balance)]],
    });
    await notifyGame();
    return { balance };
  }

  /** Properties can be sold back for half their price, freeing them for other organizations. */
  async function sellProperty(session, input) {
    const { org, leader } = await accessTo(session.id, input.orgId);
    if (!leader) throw new Error("Only organization leaders can sell property.");
    const key = String(input.itemKey || "");
    const stamp = Date.now();
    const result = await db.transaction(async (query) => {
      const [owned] = await query("SELECT p.item_key,pu.price,pu.label FROM org_properties p JOIN org_purchases pu ON pu.org_id=p.org_id AND pu.item_key=p.item_key WHERE p.item_key=? AND p.org_id=? FOR UPDATE", [key, org.id]);
      if (!owned) throw new Error("Your organization does not own that property.");
      const refund = Math.floor(Number(owned.price) / 2);
      await query("INSERT IGNORE INTO org_wallets(org_id,balance,updated_at) VALUES(?,0,?)", [org.id, stamp]);
      const [purse] = await query("SELECT balance FROM org_wallets WHERE org_id=? FOR UPDATE", [org.id]);
      const after = Number(purse?.balance || 0) + refund;
      await query("UPDATE org_wallets SET balance=?,updated_at=? WHERE org_id=?", [after, stamp, org.id]);
      await query("INSERT INTO org_transactions(org_id,amount,balance_after,kind,description,actor_id,ref,created_at) VALUES(?,?,?,'refund',?,?,?,?)", [org.id, refund, after, `Sold ${owned.label}`, session.id, key, stamp]);
      await query("DELETE FROM org_properties WHERE item_key=? AND org_id=?", [key, org.id]);
      await query("DELETE FROM org_purchases WHERE item_key=? AND org_id=?", [key, org.id]);
      return { refund, after, label: owned.label };
    });
    await audit(session.id, "economy.sell_property", org.id, { item: key, refund: result.refund });
    await postLog({ title: `${org.name} sold ${result.label}`, color: COLORS.warning, fields: [["Seller", who(session.id)], ["Refund", money(result.refund)], ["Wallet after", money(result.after)]] });
    await notifyGame();
    return result;
  }

  async function adjust(actorId, input) {
    if (!(await canManage(actorId))) throw new Error("You need fbrp.organizations.manage to adjust wallets.");
    const org = await db.one("SELECT id,name FROM organizations WHERE id=? OR slug=?", [Number(input.orgId) || 0, String(input.orgId || "")]);
    if (!org) throw new Error("Organization not found.");
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

  async function setLeader(actorId, input) {
    if (!(await canManage(actorId))) throw new Error("You need fbrp.organizations.manage to change leaders.");
    const org = await db.one("SELECT id,name FROM organizations WHERE id=? OR slug=?", [Number(input.orgId) || 0, String(input.orgId || "")]);
    if (!org) throw new Error("Organization not found.");
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
    } else await db.query("UPDATE organization_members SET manager=FALSE WHERE org_id=? AND discord_id=?", [org.id, target]);
    await audit(actorId, input.leader ? "economy.leader_add" : "economy.leader_remove", org.id, { member: target });
    await postLog({ title: `${input.leader ? "Leader added" : "Leader removed"} · ${org.name}`, color: COLORS.primary, fields: [["Member", who(target)], ["By", who(actorId)]] });
    return { org, discordId: target, leader: Boolean(input.leader) };
  }

  /** Discord: one organization's wallet summary. */
  async function summary(actorId, orgRef) {
    const manage = await canManage(actorId);
    const mine = await memberships(actorId);
    let org = null;
    if (orgRef) {
      org = await db.one("SELECT id,slug,name,type,color FROM organizations WHERE active=TRUE AND (slug=? OR name=?)", [String(orgRef).toLowerCase(), String(orgRef)]);
      if (!org) throw new Error("Organization not found.");
      if (!manage && !mine.some((row) => Number(row.id) === Number(org.id))) throw new Error("You are not a member of that organization.");
    } else {
      if (!mine.length) throw new Error("You are not a member of any organization. Pass `organization:` if you manage them.");
      org = mine[0];
    }
    return { org, ...(await orgDetail(org, { leader: false, manage })) };
  }

  return { seed, portalData, purchase, sellProperty, adjust, setLeader, summary, memberships, canManage, money, KIND_LABEL };
}
