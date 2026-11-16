export const BUNDLE_SOURCE_ROLE_ID = "1570227921061150810";

export const BUNDLE_ROLE_IDS = Object.freeze([
  "1570227967022465184",
  "1570227967572054146",
  "1570227968293343327",
  "1570227969924931618",
  "1570227971908833381",
  "1570227972646903853",
  "1570227973292822558",
  "1570227975167942677",
  "1570227975696420935",
  "1570227984428834879",
  "1570227988119949438",
  "1570227986790096907",
  "1570227985548582923",
  "1570227969048453171",
  "1570227974018572288",
  "1570224070354542713",
]);

function held(member, roleId) {
  return Boolean(member?.roles?.cache?.has(String(roleId)));
}

/** Returns add/remove only when the source role itself changed. */
export function roleBundleTransition(oldMember, newMember) {
  const before = held(oldMember, BUNDLE_SOURCE_ROLE_ID);
  const after = held(newMember, BUNDLE_SOURCE_ROLE_ID);
  if (before === after) return null;
  return after ? "add" : "remove";
}

async function applyBundle(member, action, reason, preserve = null) {
  if (!member || member.user?.bot || !member.guild?.roles?.cache?.has(BUNDLE_SOURCE_ROLE_ID))
    return { action: null, changed: 0, unavailable: [] };

  const roleIds = [];
  for (const roleId of BUNDLE_ROLE_IDS) {
    if (action === "add" ? held(member, roleId) : !held(member, roleId)) continue;
    if (action === "remove" && await preserve?.(roleId)) continue;
    roleIds.push(roleId);
  }
  const available = [];
  const unavailable = [];
  for (const roleId of roleIds) {
    const role = member.guild.roles.cache.get(roleId);
    if (role && !role.managed && role.editable) available.push(roleId);
    else unavailable.push(roleId);
  }

  if (available.length) await member.roles[action](available, reason);
  return { action, changed: available.length, unavailable };
}

/** Applies the bundle exactly once when the source role is granted or removed. */
export async function enforceRoleBundle(oldMember, newMember, { preserve } = {}) {
  const action = roleBundleTransition(oldMember, newMember);
  if (!action) return { action: null, changed: 0, unavailable: [] };
  return applyBundle(
    newMember,
    action,
    action === "add"
      ? `Automatic role bundle for ${BUNDLE_SOURCE_ROLE_ID}`
      : `Automatic role bundle removed with ${BUNDLE_SOURCE_ROLE_ID}`,
    preserve,
  );
}

/** Gives current source-role holders any missing bundle roles after a bot restart. */
export async function reconcileRoleBundleHolders(guild) {
  const total = { members: 0, changed: 0, unavailable: new Set() };
  if (!guild?.roles?.cache?.has(BUNDLE_SOURCE_ROLE_ID)) return total;
  await guild.members.fetch();
  for (const member of guild.members.cache.values()) {
    if (member.user.bot || !held(member, BUNDLE_SOURCE_ROLE_ID)) continue;
    const result = await applyBundle(member, "add", `Startup role bundle reconciliation for ${BUNDLE_SOURCE_ROLE_ID}`);
    total.members += 1;
    total.changed += result.changed;
    for (const roleId of result.unavailable) total.unavailable.add(roleId);
  }
  return total;
}
