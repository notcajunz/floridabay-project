import { callGame } from "./sync.js";
import { deletePersonalResource } from "./personal-resources.js";
import { registerDetectedLiveries } from "./livery-detect.js";
import { OWNER_DISCORD_ID } from "./access-control.js";

/**
 * Personal vehicles (website + Discord side).
 *
 * A personal is a vehicle model reserved for one owner. Only the owner, up to MAX_TRUSTED people
 * they trust and the holders of any tag it is locked to may spawn it from the F7 garage and drive
 * it. The game server reads these tables directly; every change here tells it to reload.
 */

export const MAX_TRUSTED = 3;
export const MAX_TRUSTED_WITH_TAG = 2;
export const PERSONALS_MANAGER_ID = OWNER_DISCORD_ID;
export const EMERGENCY_CLASSES = new Set(["civilian", "leo", "fire", "ems"]);

const MODEL = /^[a-z0-9_]{2,40}$/;
const PLATE = /^[A-Z0-9 ]{1,8}$/;
const SNOWFLAKE = /^\d{15,24}$/;
const text = (value, max) => String(value ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
const flag = (value) => value === true || value === 1 || value === "1" || value === "on" || value === "true";

export function emergencyClassOf(value) {
  const emergencyClass = text(value, 16).toLowerCase() || "civilian";
  if (!EMERGENCY_CLASSES.has(emergencyClass)) throw new Error("Vehicle type must be civilian, law enforcement, fire, or EMS.");
  return emergencyClass;
}

/** Accepts a raw ID or a Discord mention (<@123>). */
export function discordIdOf(value) {
  const id = String(value ?? "").replace(/[<@!>\s]/g, "");
  if (!SNOWFLAKE.test(id)) throw new Error("Enter a valid Discord user ID.");
  return id;
}

export function createPersonals({ db, audit, hasPermission = async () => false }) {
  /** Fleet-wide personal administration follows the advertised ACE, with owner access as a fallback. */
  const canManage = async (discordId) =>
    String(discordId) === PERSONALS_MANAGER_ID || Boolean(await hasPermission(String(discordId), "fbrp.personals.manage"));
  async function assertManager(discordId) {
    if (!(await canManage(discordId))) throw new Error("You need the `fbrp.personals.manage` ACE permission.");
  }

  const notifyGame = () => callGame("/personals/refresh", {}).catch(() => null);

  const defaultPlate = (id) => `PV${String(id).padStart(5, "0")}`;

  /** Rows with trusted people and locked tags attached. */
  async function hydrate(rows) {
    if (!rows.length) return [];
    const ids = rows.map((row) => Number(row.id));
    const marks = ids.map(() => "?").join(",");
    const [trust, tags] = await Promise.all([
      db.query(`SELECT personal_id,discord_id,added_by,added_at FROM personal_vehicle_trust WHERE personal_id IN (${marks}) ORDER BY added_at`, ids),
      db.query(
        `SELECT v.personal_id,t.id,t.label,t.color,t.kind,t.enabled FROM personal_vehicle_tags v
           JOIN headtags t ON t.id=v.tag_id WHERE v.personal_id IN (${marks}) ORDER BY t.label`,
        ids,
      ),
    ]);
    return rows.map((row) => ({
      id: Number(row.id),
      model: row.model,
      label: row.label,
      plate: row.plate || defaultPlate(row.id),
      customPlate: Boolean(row.plate),
      owner_id: String(row.owner_id),
      enabled: Boolean(Number(row.enabled)),
      bulletproof: Boolean(Number(row.bulletproof)),
      emergencyClass: emergencyClassOf(row.emergency_class),
      locked: Boolean(Number(row.locked)),
      locked_by: row.locked_by ? String(row.locked_by) : null,
      locked_at: row.locked_at ? Number(row.locked_at) : null,
      created_at: Number(row.created_at),
      trusted: trust.filter((item) => Number(item.personal_id) === Number(row.id)).map((item) => ({ discord_id: String(item.discord_id), added_by: item.added_by, added_at: Number(item.added_at) })),
      tags: tags.filter((item) => Number(item.personal_id) === Number(row.id)).map((item) => ({ id: Number(item.id), label: item.label, color: item.color, kind: item.kind, enabled: Boolean(Number(item.enabled)) })),
    }));
  }

  async function find(id) {
    const row = await db.one("SELECT * FROM personal_vehicles WHERE id=?", [Number(id) || 0]);
    if (!row) throw new Error("Personal vehicle not found.");
    return (await hydrate([row]))[0];
  }

  /** The viewer's relationship to one personal: owner, trusted, tag, or null. */
  async function relation(discordId, personal) {
    const id = String(discordId);
    if (personal.owner_id === id) return "owner";
    if (personal.trusted.some((item) => item.discord_id === id)) return "trusted";
    if (personal.tags.length) {
      const held = await heldTagIds(id);
      if (personal.tags.some((tag) => held.has(tag.id))) return "tag";
    }
    return null;
  }

  async function heldTagIds(discordId) {
    const rows = await db.query(
      "SELECT DISTINCT g.tag_id FROM headtag_grants g JOIN headtags t ON t.id=g.tag_id AND t.enabled=TRUE WHERE g.discord_id=?",
      [String(discordId)],
    );
    return new Set(rows.map((row) => Number(row.tag_id)));
  }

  /** Tags a member may lock a vehicle to: tags they hold, or every enabled tag for managers. */
  async function lockableTags(discordId, manage) {
    if (manage) return db.query("SELECT id,label,color,kind FROM headtags WHERE enabled=TRUE ORDER BY label");
    return db.query(
      `SELECT DISTINCT t.id,t.label,t.color,t.kind FROM headtag_grants g
         JOIN headtags t ON t.id=g.tag_id AND t.enabled=TRUE WHERE g.discord_id=? ORDER BY t.label`,
      [String(discordId)],
    );
  }

  /** Everything the website needs for one member. */
  async function portalData(discordId) {
    const id = String(discordId);
    const manage = await canManage(id);
    // Owners receive only rows they own. Trusted drivers and tag holders keep their
    // in-game access, but other people's personals are never sent to their browser.
    const [visible, tags] = await Promise.all([
      manage
        ? db.query("SELECT * FROM personal_vehicles ORDER BY label,id")
        : db.query("SELECT * FROM personal_vehicles WHERE owner_id=? ORDER BY label,id", [id]),
      lockableTags(id, manage),
    ]);
    const hydrated = await hydrate(visible);
    const mine = hydrated.filter((personal) => personal.owner_id === id).map((personal) => ({ ...personal, viewer: "owner" }));
    return {
      manage,
      owner: manage,
      limit: MAX_TRUSTED,
      taggedLimit: MAX_TRUSTED_WITH_TAG,
      mine,
      all: manage ? hydrated.map((personal) => ({ ...personal, viewer: personal.owner_id === id ? "owner" : "manage" })) : undefined,
      tags,
    };
  }

  async function assertOwnerOrManager(discordId, personal) {
    const manage = await canManage(discordId);
    if (personal.owner_id !== String(discordId) && !manage) throw new Error("Only the owner of this vehicle can change that.");
    return manage;
  }

  function modelOf(value) {
    const model = text(value, 40).toLowerCase();
    if (!MODEL.test(model)) throw new Error("Model must be the vehicle's spawn name (letters, numbers and underscores).");
    return model;
  }

  async function plateOf(value, ignoreId = 0) {
    const plate = text(value, 8).toUpperCase();
    if (!plate) return null;
    if (!PLATE.test(plate)) throw new Error("Plates are up to 8 letters, numbers or spaces.");
    const clash = await db.one("SELECT id FROM personal_vehicles WHERE plate=? AND id<>?", [plate, Number(ignoreId)]);
    if (clash) throw new Error(`Plate ${plate} already belongs to personal #${clash.id}.`);
    const registered = await db.one("SELECT 1 ok FROM vehicle_registrations WHERE plate=?", [plate]);
    if (registered) throw new Error(`Plate ${plate} is already registered to another vehicle.`);
    return plate;
  }

  async function create(actorId, input) {
    await assertManager(actorId);
    const model = modelOf(input.model);
    const label = text(input.label, 60) || model;
    const ownerId = discordIdOf(input.ownerId);
    const plate = await plateOf(input.plate);
    const bulletproof = flag(input.bulletproof);
    const emergencyClass = emergencyClassOf(input.emergencyClass);
    const result = await db.query(
      "INSERT INTO personal_vehicles(model,label,plate,owner_id,enabled,bulletproof,emergency_class,created_by,created_at) VALUES(?,?,?,?,TRUE,?,?,?,?)",
      [model, label, plate, ownerId, bulletproof, emergencyClass, String(actorId), Date.now()],
    );
    // Liveries the imported vehicle pack already contains are listed for the new personal.
    const liveries = await registerDetectedLiveries(db, result.insertId, model).catch((error) => { console.error("[FBRP personals] livery detection:", error.message); return 0; });
    await audit(actorId, "personal.create", result.insertId, { model, label, plate, ownerId, bulletproof, emergencyClass, liveries });
    await notifyGame();
    return find(result.insertId);
  }

  async function update(actorId, input) {
    await assertManager(actorId);
    const current = await find(input.id);
    const model = input.model !== undefined ? modelOf(input.model) : current.model;
    const label = input.label !== undefined ? text(input.label, 60) || current.label : current.label;
    const plate = input.plate !== undefined ? await plateOf(input.plate, current.id) : current.customPlate ? current.plate : null;
    const enabled = input.enabled !== undefined ? flag(input.enabled) : current.enabled;
    const bulletproof = input.bulletproof !== undefined ? flag(input.bulletproof) : current.bulletproof;
    const emergencyClass = input.emergencyClass !== undefined ? emergencyClassOf(input.emergencyClass) : current.emergencyClass;
    await db.query("UPDATE personal_vehicles SET model=?,label=?,plate=?,enabled=?,bulletproof=?,emergency_class=? WHERE id=?", [model, label, plate, enabled, bulletproof, emergencyClass, current.id]);
    await audit(actorId, "personal.update", current.id, {
      before: { model: current.model, label: current.label, plate: current.customPlate ? current.plate : null, enabled: current.enabled, bulletproof: current.bulletproof, emergencyClass: current.emergencyClass },
      after: { model, label, plate, enabled, bulletproof, emergencyClass },
    });
    await notifyGame();
    return find(current.id);
  }

  async function remove(actorId, input) {
    await assertManager(actorId);
    const current = await find(input.id);
    const other = await db.one("SELECT id FROM personal_vehicles WHERE model=? AND id<>? LIMIT 1", [current.model, current.id]);
    const files = other ? { resource: null, deleted: false, shared: true } : await deletePersonalResource(current.model);
    await db.query("DELETE FROM personal_vehicles WHERE id=?", [current.id]);
    await audit(actorId, "personal.delete", current.id, { model: current.model, label: current.label, ownerId: current.owner_id, files });
    await notifyGame();
    return current;
  }

  /** DevOps lock: a locked personal cannot be spawned and despawns when anyone tries to use it. */
  async function setLocked(actorId, input) {
    await assertManager(actorId);
    const current = await find(input.id);
    const locked = flag(input.locked);
    await db.query("UPDATE personal_vehicles SET locked=?,locked_by=?,locked_at=? WHERE id=?", [locked, locked ? String(actorId) : null, locked ? Date.now() : null, current.id]);
    await audit(actorId, locked ? "personal.lock" : "personal.unlock", current.id, { model: current.model, label: current.label, ownerId: current.owner_id });
    await notifyGame();
    return find(current.id);
  }

  async function setOwner(actorId, input) {
    await assertManager(actorId);
    const current = await find(input.id);
    const ownerId = discordIdOf(input.ownerId);
    // The new owner should not also sit on the trust list.
    await db.transaction(async (query) => {
      await query("UPDATE personal_vehicles SET owner_id=? WHERE id=?", [ownerId, current.id]);
      await query("DELETE FROM personal_vehicle_trust WHERE personal_id=? AND discord_id=?", [current.id, ownerId]);
    });
    await audit(actorId, "personal.owner", current.id, { from: current.owner_id, to: ownerId });
    await notifyGame();
    return find(current.id);
  }

  async function trust(actorId, input) {
    const current = await find(input.id);
    await assertOwnerOrManager(actorId, current);
    const discordId = discordIdOf(input.discordId);
    if (discordId === current.owner_id) throw new Error("The owner already has access.");
    if (current.trusted.some((item) => item.discord_id === discordId)) throw new Error("That person is already trusted.");
    const limit = current.tags.length ? MAX_TRUSTED_WITH_TAG : MAX_TRUSTED;
    if (current.trusted.length >= limit)
      throw new Error(`This personal vehicle can trust up to ${limit} people${current.tags.length ? " while locked to a tag" : ""}. Remove someone first.`);
    await db.transaction(async (query) => {
      await query("SELECT id FROM personal_vehicles WHERE id=? FOR UPDATE", [current.id]);
      const [count, tag] = await Promise.all([
        query("SELECT COUNT(*) n FROM personal_vehicle_trust WHERE personal_id=?", [current.id]),
        query("SELECT 1 ok FROM personal_vehicle_tags WHERE personal_id=? LIMIT 1", [current.id]),
      ]);
      const lockedLimit = tag.length ? MAX_TRUSTED_WITH_TAG : MAX_TRUSTED;
      if (Number(count[0]?.n || 0) >= lockedLimit)
        throw new Error(`This personal vehicle can trust up to ${lockedLimit} people${tag.length ? " while locked to a tag" : ""}. Remove someone first.`);
      await query("INSERT INTO personal_vehicle_trust(personal_id,discord_id,added_by,added_at) VALUES(?,?,?,?)", [current.id, discordId, String(actorId), Date.now()]);
    });
    await audit(actorId, "personal.trust", current.id, { discordId });
    await notifyGame();
    return find(current.id);
  }

  async function untrust(actorId, input) {
    const current = await find(input.id);
    await assertOwnerOrManager(actorId, current);
    const discordId = discordIdOf(input.discordId);
    if (!current.trusted.some((item) => item.discord_id === discordId)) throw new Error("That person is not on the trust list.");
    await db.query("DELETE FROM personal_vehicle_trust WHERE personal_id=? AND discord_id=?", [current.id, discordId]);
    await audit(actorId, "personal.untrust", current.id, { discordId });
    await notifyGame();
    return find(current.id);
  }

  async function lockTag(actorId, input) {
    const current = await find(input.id);
    const manage = await assertOwnerOrManager(actorId, current);
    const tagId = Number(input.tagId);
    const tag = await db.one("SELECT id,label FROM headtags WHERE id=? AND enabled=TRUE", [tagId]);
    if (!tag) throw new Error("Tag not found.");
    if (!manage && !(await heldTagIds(actorId)).has(tagId)) throw new Error("You can only lock a vehicle to a tag you hold.");
    if (current.tags.length) throw new Error("A personal vehicle can only be locked to one tag. Remove its current tag first.");
    if (current.trusted.length > MAX_TRUSTED_WITH_TAG)
      throw new Error(`A tag-locked personal can only trust ${MAX_TRUSTED_WITH_TAG} people. Remove someone first.`);
    await db.transaction(async (query) => {
      await query("SELECT id FROM personal_vehicles WHERE id=? FOR UPDATE", [current.id]);
      const [tags, trust] = await Promise.all([
        query("SELECT COUNT(*) n FROM personal_vehicle_tags WHERE personal_id=?", [current.id]),
        query("SELECT COUNT(*) n FROM personal_vehicle_trust WHERE personal_id=?", [current.id]),
      ]);
      if (Number(tags[0]?.n || 0) > 0) throw new Error("A personal vehicle can only be locked to one tag. Remove its current tag first.");
      if (Number(trust[0]?.n || 0) > MAX_TRUSTED_WITH_TAG)
        throw new Error(`A tag-locked personal can only trust ${MAX_TRUSTED_WITH_TAG} people. Remove someone first.`);
      await query("INSERT INTO personal_vehicle_tags(personal_id,tag_id,added_by,added_at) VALUES(?,?,?,?)", [current.id, tagId, String(actorId), Date.now()]);
    });
    await audit(actorId, "personal.tag", current.id, { tagId, label: tag.label });
    await notifyGame();
    return find(current.id);
  }

  async function unlockTag(actorId, input) {
    const current = await find(input.id);
    await assertOwnerOrManager(actorId, current);
    const tagId = Number(input.tagId);
    if (!current.tags.some((item) => item.id === tagId)) throw new Error("This vehicle is not locked to that tag.");
    await db.query("DELETE FROM personal_vehicle_tags WHERE personal_id=? AND tag_id=?", [current.id, tagId]);
    await audit(actorId, "personal.untag", current.id, { tagId });
    await notifyGame();
    return find(current.id);
  }

  /** Personals for /personal list: one member's, or everyone's for managers. */
  async function listFor(actorId, { memberId = null, all = false } = {}) {
    const manage = await canManage(actorId);
    if ((memberId && memberId !== String(actorId) || all) && !manage) throw new Error("Only management can view other people's personal vehicles.");
    const rows = await db.query("SELECT * FROM personal_vehicles ORDER BY label,id");
    const hydrated = await hydrate(rows);
    if (all) return { manage, rows: hydrated };
    const target = String(memberId || actorId);
    const held = await heldTagIds(target);
    return {
      manage,
      rows: hydrated.filter((personal) => personal.owner_id === target || personal.trusted.some((item) => item.discord_id === target) || personal.tags.some((tag) => held.has(tag.id))),
    };
  }

  /** Autocomplete choices for the vehicle option: managers see every vehicle, owners their own. */
  async function choices(actorId, needle) {
    const manage = await canManage(actorId);
    const rows = await db.query("SELECT id,model,label,plate,owner_id FROM personal_vehicles ORDER BY label,id LIMIT 500");
    const query = String(needle || "").toLowerCase();
    return rows
      .filter((row) => manage || String(row.owner_id) === String(actorId))
      .filter((row) => `${row.id} ${row.label} ${row.model} ${row.plate || ""}`.toLowerCase().includes(query))
      .slice(0, 25)
      .map((row) => ({ name: `#${row.id} · ${row.label} (${row.model})${row.plate ? ` · ${row.plate}` : ""}`.slice(0, 100), value: String(row.id) }));
  }

  return {
    MAX_TRUSTED,
    MAX_TRUSTED_WITH_TAG,
    assertManager, modelOf,
    canManage, portalData, find, relation, create, update, remove, setLocked, setOwner, trust, untrust, lockTag, unlockTag, listFor, choices, lockableTags,
  };
}
