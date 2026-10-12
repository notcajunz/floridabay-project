import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { PERMISSIONS, config, db, demand, invalidateRanks, ranks, setConfig, tierLabel, updateSettings } from "./store.js";
import { C, EPHEMERAL, UserError, card, channelMention, hours, respond, roleMention } from "./util.js";
import { CHANNEL_KEYS, ROLE_KEYS, apply, detect, importMembers, summary } from "./setup.js";
import { renderAll } from "./panels.js";
import { format } from "./callsigns.js";

export async function command(i, actor, sub) {
  await demand(actor, "admin");
  if (sub === "setup") {
    await i.deferReply(EPHEMERAL);
    const plan = await detect(i.guild);
    if (!plan.ranks.length) throw new UserError("No `IAA | …` rank roles were found.");
    return respond(i, {
      content: `Detected **${plan.ranks.length} ranks**, **${plan.tiers.length - 1} command tiers** and **${Object.keys(plan.channels).length} channels**. Review, then apply. Nothing changes until you press **Apply**.`,
      embeds: await summary(plan),
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("iaa:setup:apply").setLabel("Apply & post panels").setEmoji("✅").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId("iaa:setup:applyquiet").setLabel("Apply without panels").setStyle(ButtonStyle.Secondary),
        ),
      ],
    });
  }
  if (sub === "panels") {
    await i.deferReply(EPHEMERAL);
    const done = await renderAll(i.guild, { force: i.options.getString("mode") === "repost" });
    return respond(i, `Panels ${i.options.getString("mode") === "repost" ? "reposted" : "refreshed"}: ${done.join(", ") || "none (check channel config)"}.`);
  }
  if (sub === "import") {
    await i.deferReply(EPHEMERAL);
    const { added, callsigns } = await importMembers(i.guild, i.user.id);
    return respond(i, `Imported **${added}** ranked member(s) onto the roster. ${callsigns} callsign(s) assigned or changed.`);
  }
  if (sub === "view") return respond(i, { embeds: await configEmbeds() });
  if (sub === "rank-tier") {
    const roleId = i.options.getString("rank", true);
    const tier = i.options.getString("tier", true);
    const cfg = await config();
    const t = cfg.tiers.find((x) => x.key === tier);
    if (!t) throw new UserError("That tier does not exist in this server.");
    const result = await db.query("UPDATE iaa_ranks SET tier=?,tier_role_id=? WHERE role_id=?", [tier, t.roleId || null, roleId]);
    if (!result.affectedRows) throw new UserError("Pick a rank from the list.");
    invalidateRanks();
    return respond(i, `${roleMention(roleId)} is now in **${t.label}**. Existing members keep their current tier role until their next move.`);
  }
  if (sub === "quota") {
    const tier = i.options.getString("tier", true);
    const minutes = i.options.getInteger("minutes", true);
    const cfg = await config();
    await updateSettings({ quotas: { ...cfg.settings.quotas, [tier]: minutes } }, i.user.id);
    return respond(i, `Weekly quota for **${await tierLabel(tier)}** is now **${hours(minutes * 60)}** of in-game duty time.`);
  }
  if (sub === "permission") {
    const perm = i.options.getString("permission", true);
    const tier = i.options.getString("tier", true);
    const cfg = await config();
    await updateSettings({ perms: { ...cfg.settings.perms, [perm]: tier } }, i.user.id);
    return respond(i, `**${PERMISSIONS[perm].label}** now requires **${await tierLabel(tier)}** or higher.`);
  }
  if (sub === "channel") {
    const key = i.options.getString("key", true);
    if (!CHANNEL_KEYS[key]) throw new UserError("Pick a channel slot from the list.");
    const channel = i.options.getChannel("channel");
    const cfg = await config();
    const next = { ...cfg.channels };
    if (channel) next[key] = channel.id;
    else delete next[key];
    await setConfig("channels", next, i.user.id);
    return respond(i, `**${CHANNEL_KEYS[key]}** → ${channel ? channelMention(channel.id) : "*unset*"}.`);
  }
  if (sub === "role") {
    const key = i.options.getString("key", true);
    if (!ROLE_KEYS.includes(key)) throw new UserError("Pick a role slot from the list.");
    const role = i.options.getRole("role");
    const cfg = await config();
    const next = { ...cfg.roles };
    if (role) next[key] = role.id;
    else delete next[key];
    await setConfig("roles", next, i.user.id);
    return respond(i, `**${key}** → ${role ? roleMention(role.id) : "*unset*"}.`);
  }
  if (sub === "settings") {
    const patch = {};
    const map = { nickname_sync: ["nicknameSync", "getBoolean"], strike_days: ["strikeDays", "getInteger"], inactivity_days: ["inactivityDays", "getInteger"], stale_hours: ["staleHours", "getInteger"] };
    for (const [option, [key, getter]] of Object.entries(map)) {
      const value = i.options[getter](option);
      if (value !== null && value !== undefined) patch[key] = value;
    }
    if (!Object.keys(patch).length) return respond(i, { embeds: await configEmbeds() });
    await updateSettings(patch, i.user.id);
    return respond(i, `Updated: ${Object.entries(patch).map(([k, v]) => `\`${k}\` = **${v}**`).join(", ")}.`);
  }
}

export async function button(i, actor, action) {
  await demand(actor, "admin");
  await i.deferUpdate();
  const plan = await detect(i.guild);
  await apply(plan, i.user.id);
  const { added } = await importMembers(i.guild, i.user.id);
  const panels = action === "apply" ? await renderAll(i.guild) : [];
  return i.editReply({
    content: null,
    embeds: [
      card("🦅 IAA Systems online", {
        color: C.gold,
        description: [
          `Rank ladder saved: **${plan.ranks.length} ranks**.`,
          `Roster import: **${added}** member(s) already holding ranks.`,
          panels.length ? `Panels posted: ${panels.map((p) => `\`${p}\``).join(", ")}.` : "Panels not posted. Use `/iaa-admin panels` when ready.",
          "",
          "Next: `/iaa add` to appoint agents, `/investigation open` to start a case, `/iaa-admin view` to check config.",
        ].join("\n"),
      }),
    ],
    components: [],
  });
}

export async function channelKeyAutocomplete(i) {
  const q = String(i.options.getFocused() || "").toLowerCase();
  return i.respond(
    Object.entries(CHANNEL_KEYS)
      .filter(([k, label]) => !q || k.toLowerCase().includes(q) || label.toLowerCase().includes(q))
      .slice(0, 25)
      .map(([k, label]) => ({ name: label, value: k })),
  );
}

export async function rankAutocompleteAll(i) {
  const q = String(i.options.getFocused() || "").toLowerCase();
  return i.respond(
    (await ranks())
      .filter((r) => !q || r.name.toLowerCase().includes(q))
      .slice(0, 25)
      .map((r) => ({ name: `${String(r.level).padStart(2, "0")} · ${r.name} (${r.tier})`, value: r.role_id })),
  );
}

async function configEmbeds() {
  const cfg = await config();
  const s = cfg.settings;
  const perms = await Promise.all(Object.entries(PERMISSIONS).map(async ([k, p]) => `\`${k}\` · ${await tierLabel(s.perms?.[k] || p.tier)}+ · ${p.label}`));
  return [
    card("⚙️ IAA configuration", {
      color: C.navy,
      fields: [
        ["Tiers", cfg.tiers.map((t) => `${t.index}. ${t.roleId ? roleMention(t.roleId) : t.label} · quota ${hours((s.quotas[t.key] ?? 0) * 60)}/wk`).join("\n") || "Run setup", false],
        ["Permissions", perms.join("\n"), false],
        [
          "Settings",
          [
            `Nickname callsigns: **${s.nicknameSync ? "on" : "off"}**`,
            `Fixed callsigns: ${Object.entries(s.callsignPlan || {}).map(([r, [a, b]]) => `${r} ${a === b ? format(a) : `${format(a)}–${format(b)}`}`).join(", ")}`,
            `Everyone else: ${format(s.callsignStart)} onward, in rank order`,
            `Strikes last **${s.strikeDays}d** · inactivity warnings **${s.inactivityDays}d**`,
            `Stale case reminder after **${s.staleHours}h**`,
          ].join("\n"),
          false,
        ],
        ...[0, 1].map((half) => {
          const keys = Object.entries(CHANNEL_KEYS);
          const part = half ? keys.slice(Math.ceil(keys.length / 2)) : keys.slice(0, Math.ceil(keys.length / 2));
          return [half ? "Channels (cont.)" : "Channels", part.map(([k, label]) => `${label}: ${cfg.channels[k] ? channelMention(cfg.channels[k]) : "—"}`).join("\n"), true];
        }),
      ],
    }),
  ];
}
