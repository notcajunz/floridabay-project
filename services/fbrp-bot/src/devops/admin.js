import { EPHEMERAL, UserError, C, card, channelMention, respond, roleMention } from "./util.js";
import { PERMISSIONS, config, demand, ranks, requiredLevel, setConfig, updateSettings } from "./store.js";
import { ensureServer } from "./setup.js";
import { renderAll, PANELS } from "./panels.js";
import { ensurePanel } from "./tickets.js";
import { sync } from "./ranksync.js";

export async function command(i, actor, sub) {
  if (sub === "setup") {
    // Setup is the one command that must work before any rank exists.
    if (!actor.admin) throw new UserError("Only Administrators and the server owner can run setup.");
    await i.deferReply(EPHEMERAL);
    const summary = await ensureServer(i.guild, { actorId: i.user.id });
    await renderAll(i.guild).catch(() => null);
    await ensurePanel(i.guild).catch((e) => console.warn(`[DevOps] ticket panel: ${e.message}`));
    return respond(i, {
      embeds: [
        card("🛠️ Server ready", {
          color: C.green,
          fields: [
            ["Roles", `${summary.rolesCreated} created · ${summary.rolesFound} found`],
            ["Categories", `${summary.categoriesCreated} created`],
            ["Channels", `${summary.channelsCreated} created · ${summary.channelsFound} found · ${summary.renamed} renamed`],
            summary.removed.length ? ["Removed defaults", summary.removed.join(", ")] : null,
          ],
        }),
      ],
    });
  }

  await demand(actor, "admin");

  if (sub === "panels") {
    await i.deferReply(EPHEMERAL);
    const fresh = i.options.getBoolean("fresh") ?? false;
    const done = await renderAll(i.guild, { fresh });
    await ensurePanel(i.guild).then(() => done.push("tickets"), () => null);
    return respond(i, `Refreshed: ${done.map((n) => `\`${n}\``).join(", ") || "nothing"}.`);
  }

  if (sub === "config") {
    const cfg = await config();
    const ladder = await ranks();
    const perms = [];
    for (const [key, rule] of Object.entries(PERMISSIONS)) {
      const level = await requiredLevel(key);
      const rank = ladder.filter((r) => r.level >= level).pop();
      perms.push(`\`${key}\` · ${rank?.name || `level ${level}`} · ${rule.label}`);
    }
    return respond(i, {
      embeds: [
        card("⚙️ DevOps configuration", {
          color: C.blue,
          fields: [
            ["Ranks", ladder.map((r) => `${r.level} · ${roleMention(r.role_id)}`).join("\n") || "Not set up", false],
            ["Group roles", [`Team ${roleMention(cfg.roles.base)}`, `Leadership ${roleMention(cfg.roles.leadership)}`, `Suspended ${roleMention(cfg.roles.suspended)}`].join("\n")],
            ["Settings", `Trial **${cfg.settings.trialDays}d** · strikes last **${cfg.settings.strikeDays}d** · review at **${cfg.settings.strikesBeforeReview}**\nTickets: max **${cfg.settings.maxOpen}**, cooldown **${cfg.settings.cooldownSeconds}s**`],
            ["Panels", PANELS.map((n) => `${n} ${cfg.panels[n] ? channelMention(cfg.panels[n].channelId) : "—"}`).join("\n")],
            ["Permissions", perms.join("\n").slice(0, 1000), false],
          ],
        }),
      ],
    });
  }

  if (sub === "perms") {
    const permission = i.options.getString("permission", true);
    const rank = (await ranks()).find((r) => r.role_id === i.options.getString("rank", true));
    if (!rank) throw new UserError("Pick a rank from the list.");
    if (!PERMISSIONS[permission]) throw new UserError("Unknown permission.");
    if (!actor.admin && rank.level > actor.level) throw new UserError("You cannot set a permission above your own rank.");
    const cfg = await config();
    await setConfig("settings", { ...cfg.settings, perms: { ...(cfg.settings.perms || {}), [permission]: rank.level } }, i.user.id);
    return respond(i, `\`${permission}\` now requires **${rank.name}** or higher.`);
  }

  if (sub === "settings") {
    const patch = {};
    const trial = i.options.getInteger("trial_days");
    const strike = i.options.getInteger("strike_days");
    const review = i.options.getInteger("strikes_before_review");
    if (trial) patch.trialDays = trial;
    if (strike) patch.strikeDays = strike;
    if (review) patch.strikesBeforeReview = review;
    if (!Object.keys(patch).length) throw new UserError("Give at least one value to change.");
    await updateSettings(patch, i.user.id);
    return respond(i, `Updated: ${Object.entries(patch).map(([k, v]) => `\`${k}\` = **${v}**`).join(", ")}.`);
  }

  if (sub === "sync") {
    await i.deferReply(EPHEMERAL);
    const { changed } = await sync(i.guild);
    return respond(i, changed ? `Sync made **${changed}** change(s).` : "Everything was already in sync.");
  }

  if (sub === "adminrole") {
    const role = i.options.getRole("role", true);
    const add = i.options.getString("mode", true) === "add";
    const cfg = await config();
    const list = new Set(cfg.settings.adminRoles || []);
    if (add) list.add(role.id);
    else list.delete(role.id);
    await updateSettings({ adminRoles: [...list] }, i.user.id);
    return respond(i, `${role} ${add ? "can now" : "can no longer"} administer the bot.`);
  }

  throw new UserError("Unknown action.");
}

