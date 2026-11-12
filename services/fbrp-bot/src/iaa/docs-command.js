import { SlashCommandBuilder } from "discord.js";
import { demand, post, rankOf, tierIndex } from "./store.js";
import { C, EPHEMERAL, UserError, card, clip, mention, respond, ts } from "./util.js";
import { DOCS, DOC_KEYS, DocsError, LEVELS } from "./documents.js";
import { documents } from "./documents-runtime.js";

const docChoices = DOC_KEYS.map((value) => ({ name: DOCS[value].label, value }));
const levelChoices = Object.entries(LEVELS).map(([value, name]) => ({ name, value }));

export const docsDefinition = new SlashCommandBuilder()
  .setName("iaa-docs")
  .setDescription("IAA roster, SOP and locked alt database")
  .setDMPermission(false)
  .addSubcommand((s) =>
    s
      .setName("setup")
      .setDescription("Create the private IAA documents (High Command)")
      .addStringOption((o) => o.setName("email").setDescription("Your Google account, to open them yourself").setMaxLength(190)),
  )
  .addSubcommand((s) =>
    s
      .setName("link")
      .setDescription("Attach a Google Doc/Sheet you shared with the bot as Editor (High Command)")
      .addStringOption((o) => o.setName("document").setDescription("Which document this is").setRequired(true).addChoices(...docChoices))
      .addStringOption((o) => o.setName("url").setDescription("Link to the Google file").setRequired(true).setMaxLength(300)),
  )
  .addSubcommand((s) => s.setName("sync").setDescription("Rewrite every document from live data and remove unrecorded sharing"))
  .addSubcommand((s) => s.setName("open").setDescription("Get the link to a document you have access to").addStringOption((o) => o.setName("document").setDescription("Document").setRequired(true).addChoices(...docChoices)))
  .addSubcommandGroup((g) =>
    g
      .setName("access")
      .setDescription("Who can open the documents")
      .addSubcommand((s) =>
        s
          .setName("grant")
          .setDescription("Give an active agent access with their Google account")
          .addUserOption((o) => o.setName("user").setDescription("Agent").setRequired(true))
          .addStringOption((o) => o.setName("document").setDescription("Document").setRequired(true).addChoices(...docChoices))
          .addStringOption((o) => o.setName("email").setDescription("Their Google account email").setRequired(true).setMaxLength(190))
          .addStringOption((o) => o.setName("level").setDescription("Access level (default view only)").addChoices(...levelChoices)),
      )
      .addSubcommand((s) =>
        s
          .setName("revoke")
          .setDescription("Remove someone's access")
          .addUserOption((o) => o.setName("user").setDescription("Agent").setRequired(true))
          .addStringOption((o) => o.setName("document").setDescription("Only this document (default: all)").addChoices(...docChoices)),
      )
      .addSubcommand((s) => s.setName("list").setDescription("Who has access").addStringOption((o) => o.setName("document").setDescription("Document").addChoices(...docChoices))),
  )
  .addSubcommandGroup((g) =>
    g
      .setName("alt")
      .setDescription("Locked alt-account records")
      .addSubcommand((s) =>
        s
          .setName("add")
          .setDescription("Record that an account is an alt of another")
          .addUserOption((o) => o.setName("main").setDescription("Main account").setRequired(true))
          .addUserOption((o) => o.setName("alt").setDescription("Alt account").setRequired(true))
          .addStringOption((o) => o.setName("evidence").setDescription("Why you believe it (kept in the record)").setMaxLength(500)),
      )
      .addSubcommand((s) =>
        s
          .setName("remove")
          .setDescription("Clear a record")
          .addUserOption((o) => o.setName("main").setDescription("Main account").setRequired(true))
          .addUserOption((o) => o.setName("alt").setDescription("Alt account").setRequired(true)),
      )
      .addSubcommand((s) => s.setName("list").setDescription("Active records").addUserOption((o) => o.setName("user").setDescription("Only records involving this account"))),
  );

/** Library errors that are the user's fault read as normal bot errors. */
async function guarded(work) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof DocsError) throw new UserError(error.message);
    throw error;
  }
}

const docLabel = (key) => DOCS[key]?.label || key;

async function audit(i, title, description) {
  await post(i.guild, "audit", { embeds: [card(title, { color: C.purple, description, fields: [["By", `${i.user}`]] })], allowedMentions: { parse: [] } }, "botLogs");
}

export async function command(i, actor, group, sub) {
  const svc = documents();
  if (!group) {
    if (sub === "setup") {
      await demand(actor, "admin");
      await i.deferReply(EPHEMERAL);
      const created = await guarded(() => svc.setup(i.user.id));
      const email = i.options.getString("email");
      const notes = [];
      if (email) {
        for (const key of DOC_KEYS) {
          const level = DOCS[key].locked ? "reader" : "writer";
          await guarded(() => svc.grant({ docKey: key, target: { discordId: i.user.id }, email, level, actorId: i.user.id, override: true }));
        }
        notes.push("You were given access with that account.");
      }
      await audit(i, "📂 IAA documents set up", created.length ? `Created: ${created.map(docLabel).join(", ")}` : "All documents already existed and were refreshed.");
      return respond(i, `${created.length ? `Created **${created.map(docLabel).join("**, **")}**.` : "Every document already existed and was refreshed."} They are private until someone is granted access. ${notes.join(" ")}`.trim());
    }
    if (sub === "link") {
      await demand(actor, "admin");
      await i.deferReply(EPHEMERAL);
      const key = i.options.getString("document", true);
      const { title } = await guarded(() => svc.register({ docKey: key, source: i.options.getString("url", true), actorId: i.user.id }));
      await audit(i, "📂 IAA document linked", `**${docLabel(key)}** is now backed by a Google file titled "${clip(title, 80)}".`);
      return respond(i, `Linked **${docLabel(key)}** and rewrote it from live data.`);
    }
    if (sub === "sync") {
      await demand(actor, "admin");
      await i.deferReply(EPHEMERAL);
      const changed = await guarded(() => svc.syncAll(true));
      const removed = await guarded(() => svc.audit({ by: i.user.id }));
      return respond(i, `Documents rewritten (${Object.keys(changed).join(", ")}). ${removed.length ? `Removed **${removed.length}** sharing permission(s) that were not on the access list.` : "No unrecorded sharing found."}`);
    }
    if (sub === "open") {
      const key = i.options.getString("document", true);
      const link = await guarded(() => svc.linkFor(key, i.user.id));
      return respond(i, { embeds: [card(`📄 ${docLabel(key)}`, { description: `[Open the document](${link})\nSign in with the Google account you were granted access with.` })] });
    }
  }

  if (group === "access") {
    if (sub === "grant") {
      const key = i.options.getString("document", true);
      await demand(actor, DOCS[key].locked ? "docs.locked" : "docs.grant");
      const target = await i.guild.members.fetch(i.options.getUser("user", true).id).catch(() => null);
      if (!target) throw new UserError("That person is not in this server.");
      if (target.user.bot) throw new UserError("Bots cannot be given document access.");
      if (DOCS[key].locked) {
        const rank = await rankOf(target);
        if (!rank || (await tierIndex(rank.tier)) < (await tierIndex("supervisor"))) throw new UserError("The locked alt database is limited to Supervisors and above.");
      }
      await i.deferReply(EPHEMERAL);
      const level = i.options.getString("level") || "reader";
      const { changed } = await guarded(() => svc.grant({ docKey: key, target: { discordId: target.id }, email: i.options.getString("email", true), level, actorId: i.user.id }));
      if (changed) await audit(i, "🔑 Document access granted", `${target} · **${docLabel(key)}** · ${LEVELS[level]}`);
      return respond(i, changed ? `${target} can now open **${docLabel(key)}** (${LEVELS[level].toLowerCase()}) with that Google account.` : `${target} already has that access.`);
    }
    if (sub === "revoke") {
      await demand(actor, "docs.grant");
      const user = i.options.getUser("user", true);
      const key = i.options.getString("document") || null;
      await i.deferReply(EPHEMERAL);
      const { found, revoked } = await guarded(() => svc.revoke({ discordId: user.id, docKey: key, by: i.user.id, reason: `revoked by ${i.user.tag}` }));
      if (found) await audit(i, "🔒 Document access revoked", `${mention(user.id)} · ${key ? docLabel(key) : "all documents"}`);
      return respond(i, found ? `Removed access to **${revoked}** of ${found} grant(s) for ${mention(user.id)}.${revoked < found ? " Google did not confirm every removal; it will be retried automatically." : ""}` : `${mention(user.id)} has no document access.`);
    }
    if (sub === "list") {
      await demand(actor, "docs.grant");
      const key = i.options.getString("document") || null;
      const grants = await svc.listGrants({ docKey: key });
      const lines = grants.map((g) => `${mention(g.discord_id)} · **${docLabel(g.doc_key)}** · ${LEVELS[g.level]} · by ${mention(g.granted_by)} ${ts(g.granted_at, "d")}`);
      return respond(i, { embeds: [card("🔑 Document access", { description: clip(lines.join("\n") || "Nobody has access yet.", 3900) })] });
    }
  }

  if (group === "alt") {
    await demand(actor, "docs.alts");
    const main = i.options.getUser("main")?.id;
    const alt = i.options.getUser("alt")?.id;
    if (sub === "add") {
      await i.deferReply(EPHEMERAL);
      await guarded(() => svc.addAlt({ main, alt, username: i.options.getUser("alt")?.username, evidence: i.options.getString("evidence"), actorId: i.user.id }));
      await audit(i, "🕵️ Alt record added", `${mention(alt)} recorded as an alt of ${mention(main)}`);
      return respond(i, `Recorded ${mention(alt)} as an alt of ${mention(main)}. This is intelligence, not a verdict.`);
    }
    if (sub === "remove") {
      await i.deferReply(EPHEMERAL);
      await guarded(() => svc.removeAlt({ main, alt, actorId: i.user.id }));
      await audit(i, "🕵️ Alt record cleared", `${mention(alt)} / ${mention(main)}`);
      return respond(i, "Record cleared.");
    }
    if (sub === "list") {
      const who = i.options.getUser("user")?.id;
      const all = await svc.listAlts({});
      const rows = who ? all.filter((r) => r.main_discord_id === who || r.alt_discord_id === who) : all;
      const lines = rows.slice(0, 40).map((r) => `${mention(r.alt_discord_id)} → alt of ${mention(r.main_discord_id)} · ${r.source}${r.evidence ? `\n  ↳ ${clip(r.evidence, 140)}` : ""}`);
      return respond(i, { embeds: [card("🕵️ Alt records", { description: clip(lines.join("\n") || "No active records.", 3900) })] });
    }
  }
  throw new UserError("Unknown documents command.");
}
