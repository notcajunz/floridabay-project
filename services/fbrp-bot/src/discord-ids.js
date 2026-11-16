export const MAIN_GUILD_ID = "1557594282976747550";

const RESTORED_IDS = new Map([
  ["1557594282976747550", MAIN_GUILD_ID],
  ["1558173819150012436", "1570228185369546803"],
  ["1557690864526954616", "1570228067501211648"],
  ["1558171442250784798", "1570228138347077795"],
]);

/** Keeps a deployment working when its untracked environment still names the deleted guild. */
export function currentDiscordId(value) {
  const id = String(value || "").trim();
  return RESTORED_IDS.get(id) || id;
}
