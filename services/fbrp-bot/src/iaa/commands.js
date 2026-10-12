import { ChannelType, SlashCommandBuilder } from "discord.js";
import { PERMISSIONS } from "./store.js";
import { TYPES } from "./intel.js";
import { AWARDS } from "./awards.js";

const TIERS = [
  { name: "Agents", value: "agent" },
  { name: "Supervisors", value: "supervisor" },
  { name: "Low Command", value: "low_command" },
  { name: "Trial High Command", value: "trial_high_command" },
  { name: "High Command", value: "high_command" },
];
const PRIORITY = [
  { name: "🔴 Critical", value: "critical" },
  { name: "🟠 High", value: "high" },
  { name: "🔵 Normal", value: "normal" },
  { name: "⚪ Low", value: "low" },
];

const user = (o, d = "Agent") => o.setName("user").setDescription(d).setRequired(true);
const reason = (o, required = true) => o.setName("reason").setDescription("Reason (logged)").setRequired(required).setMaxLength(500);
const rank = (o, required = true, d = "Rank") => o.setName("rank").setDescription(d).setRequired(required).setAutocomplete(true);
const caseOpt = (o) => o.setName("case").setDescription("Case reference, e.g. IA-2026-0001").setRequired(true).setAutocomplete(true);

const iaa = new SlashCommandBuilder()
  .setName("iaa")
  .setDescription("Internal Affairs Agency roster")
  .setDMPermission(false)
  .addSubcommand((s) =>
    s
      .setName("add")
      .setDescription("Appoint someone to an IAA rank")
      .addUserOption((o) => user(o, "New agent"))
      .addStringOption((o) => rank(o, true, "Starting rank (only ranks below yours)"))
      .addBooleanOption((o) => o.setName("orientation").setDescription("Give Needs Orientation (default yes)"))
      .addStringOption((o) => reason(o, false)),
  )
  .addSubcommand((s) =>
    s
      .setName("promote")
      .setDescription("Promote an agent (next rank up by default)")
      .addUserOption((o) => user(o))
      .addStringOption((o) => reason(o))
      .addStringOption((o) => rank(o, false, "Skip to a specific rank")),
  )
  .addSubcommand((s) =>
    s
      .setName("demote")
      .setDescription("Demote an agent (next rank down by default)")
      .addUserOption((o) => user(o))
      .addStringOption((o) => reason(o))
      .addStringOption((o) => rank(o, false, "Drop to a specific rank")),
  )
  .addSubcommand((s) =>
    s
      .setName("remove")
      .setDescription("Remove an agent from the IAA (strips every agency role)")
      .addUserOption((o) => user(o))
      .addStringOption((o) => reason(o))
      .addBooleanOption((o) => o.setName("retire").setDescription("Honourable retirement: grants the matching Retired role")),
  )
  .addSubcommand((s) => s.setName("callsigns").setDescription("Recalculate every callsign from the roster (renumbers anyone out of order)"))
  .addSubcommand((s) =>
    s
      .setName("assign")
      .setDescription("Toggle a division or coordinator position")
      .addUserOption((o) => user(o))
      .addStringOption((o) => o.setName("assignment").setDescription("Division or position").setRequired(true).setAutocomplete(true))
      .addStringOption((o) => reason(o, false)),
  )
  .addSubcommand((s) =>
    s
      .setName("orientation")
      .setDescription("Record an orientation result")
      .addUserOption((o) => user(o))
      .addStringOption((o) => o.setName("result").setDescription("Result").setRequired(true).addChoices({ name: "Passed", value: "pass" }, { name: "Not passed", value: "fail" }))
      .addStringOption((o) => o.setName("notes").setDescription("Notes").setMaxLength(500)),
  )
  .addSubcommand((s) => s.setName("profile").setDescription("Personnel file").addUserOption((o) => o.setName("user").setDescription("Agent (default: you)")))
  .addSubcommand((s) => s.setName("history").setDescription("Full service history").addUserOption((o) => user(o)))
  .addSubcommand((s) => s.setName("roster").setDescription("Show the roster"))
  .addSubcommandGroup((g) =>
    g
      .setName("blacklist")
      .setDescription("IAA blacklist")
      .addSubcommand((s) =>
        s
          .setName("add")
          .setDescription("Blacklist someone from the IAA (removes and bans them)")
          .addUserOption((o) => user(o, "User"))
          .addStringOption((o) => reason(o))
          .addBooleanOption((o) => o.setName("ban").setDescription("Ban from this server (default yes)")),
      )
      .addSubcommand((s) =>
        s
          .setName("remove")
          .setDescription("Lift an IAA blacklist")
          .addUserOption((o) => user(o, "User"))
          .addStringOption((o) => reason(o)),
      )
      .addSubcommand((s) => s.setName("list").setDescription("Show the IAA blacklist")),
  );

const investigation = new SlashCommandBuilder()
  .setName("investigation")
  .setDescription("Internal Affairs investigations")
  .setDMPermission(false)
  .addSubcommand((s) =>
    s
      .setName("open")
      .setDescription("Start an investigation on a user")
      .addUserOption((o) => user(o, "Subject"))
      .addStringOption((o) =>
        o
          .setName("type")
          .setDescription("Investigation type")
          .setRequired(true)
          .addChoices(...Object.entries(TYPES).map(([value, t]) => ({ name: `${t.icon} ${t.label}`, value }))),
      )
      .addStringOption((o) => o.setName("summary").setDescription("Allegation / what happened").setRequired(true).setMaxLength(1500))
      .addStringOption((o) => o.setName("priority").setDescription("Priority (default normal)").addChoices(...PRIORITY))
      .addAttachmentOption((o) => o.setName("evidence_file").setDescription("Initial evidence (screenshot, video)"))
      .addStringOption((o) => o.setName("evidence_link").setDescription("Initial evidence link").setMaxLength(500))
      .addBooleanOption((o) => o.setName("flag").setDescription("Give the subject Under Investigation (default yes)"))
      .addBooleanOption((o) => o.setName("notify_subject").setDescription("DM the subject a notice of investigation (default no)")),
  )
  .addSubcommand((s) => s.setName("view").setDescription("View a case file").addStringOption(caseOpt))
  .addSubcommand((s) =>
    s
      .setName("list")
      .setDescription("List cases")
      .addStringOption((o) => o.setName("status").setDescription("Which cases").addChoices({ name: "Open", value: "open" }, { name: "Closed", value: "closed" }, { name: "All", value: "all" }))
      .addUserOption((o) => o.setName("user").setDescription("Only cases where this user is subject or lead")),
  )
  .addSubcommand((s) =>
    s
      .setName("assign")
      .setDescription("Assign the lead investigator")
      .addStringOption(caseOpt)
      .addUserOption((o) => o.setName("agent").setDescription("Lead investigator").setRequired(true)),
  )
  .addSubcommand((s) =>
    s
      .setName("add-agent")
      .setDescription("Read another agent into a case thread")
      .addStringOption(caseOpt)
      .addUserOption((o) => o.setName("agent").setDescription("Agent").setRequired(true)),
  )
  .addSubcommand((s) =>
    s
      .setName("evidence")
      .setDescription("Log evidence")
      .addStringOption(caseOpt)
      .addStringOption((o) => o.setName("description").setDescription("What it shows").setRequired(true).setMaxLength(1500))
      .addAttachmentOption((o) => o.setName("file").setDescription("Screenshot or file"))
      .addStringOption((o) => o.setName("link").setDescription("Link").setMaxLength(500)),
  )
  .addSubcommand((s) =>
    s
      .setName("note")
      .setDescription("Add an investigator note")
      .addStringOption(caseOpt)
      .addStringOption((o) => o.setName("text").setDescription("Note").setRequired(true).setMaxLength(1800)),
  )
  .addSubcommand((s) =>
    s
      .setName("update")
      .setDescription("Change status or priority")
      .addStringOption(caseOpt)
      .addStringOption((o) =>
        o
          .setName("status")
          .setDescription("Status")
          .addChoices({ name: "Open", value: "open" }, { name: "Active", value: "active" }, { name: "Pending command review", value: "review" }, { name: "On hold", value: "hold" }),
      )
      .addStringOption((o) => o.setName("priority").setDescription("Priority").addChoices(...PRIORITY)),
  )
  .addSubcommand((s) =>
    s
      .setName("close")
      .setDescription("Close a case with a verdict (applies the outcome automatically)")
      .addStringOption(caseOpt)
      .addStringOption((o) =>
        o
          .setName("verdict")
          .setDescription("Verdict")
          .setRequired(true)
          .addChoices(
            { name: "✅ Substantiated", value: "substantiated" },
            { name: "⚠️ Policy violation (other)", value: "policy_violation" },
            { name: "❎ Unsubstantiated", value: "unsubstantiated" },
            { name: "❔ Insufficient evidence", value: "insufficient_evidence" },
            { name: "🕊️ Exonerated", value: "exonerated" },
          ),
      )
      .addStringOption((o) => o.setName("findings").setDescription("Findings for the sealed report").setRequired(true).setMaxLength(1800))
      .addStringOption((o) =>
        o
          .setName("outcome")
          .setDescription("Disciplinary outcome (default none)")
          .addChoices(
            { name: "No action", value: "none" },
            { name: "Warning", value: "warning" },
            { name: "Strike", value: "strike" },
            { name: "Suspension", value: "suspension" },
            { name: "Removal from IAA", value: "removal" },
            { name: "Removal + IAA blacklist", value: "blacklist" },
          ),
      )
      .addStringOption((o) => o.setName("suspension_length").setDescription("For suspensions: 7d, 48h, 2w").setMaxLength(10)),
  )
  .addSubcommand((s) =>
    s
      .setName("reopen")
      .setDescription("Reopen a closed case")
      .addStringOption(caseOpt)
      .addStringOption((o) => reason(o)),
  );

const discipline = new SlashCommandBuilder()
  .setName("discipline")
  .setDescription("IAA disciplinary actions")
  .setDMPermission(false)
  .addSubcommand((s) => s.setName("warn").setDescription("Issue a written warning").addUserOption((o) => user(o)).addStringOption((o) => reason(o)))
  .addSubcommand((s) => s.setName("strike").setDescription("Issue a strike (gives First Strike, expires automatically)").addUserOption((o) => user(o)).addStringOption((o) => reason(o)))
  .addSubcommand((s) =>
    s
      .setName("suspend")
      .setDescription("Suspend an agent (roles are restored automatically when it ends)")
      .addUserOption((o) => user(o))
      .addStringOption((o) => o.setName("duration").setDescription("Length: 3d, 48h, 2w").setRequired(true).setMaxLength(10))
      .addStringOption((o) => reason(o)),
  )
  .addSubcommand((s) =>
    s
      .setName("revoke")
      .setDescription("Revoke an active strike, suspension or inactivity warning")
      .addIntegerOption((o) => o.setName("id").setDescription("Record number (#)").setRequired(true).setMinValue(1))
      .addStringOption((o) => reason(o)),
  )
  .addSubcommand((s) => s.setName("record").setDescription("Disciplinary record").addUserOption((o) => user(o)));

const activity = new SlashCommandBuilder()
  .setName("activity")
  .setDescription("Quota enforcement from in-game hours")
  .setDMPermission(false)
  .addSubcommand((s) =>
    s
      .setName("report")
      .setDescription("Agents below their weekly quota")
      .addStringOption((o) => o.setName("week").setDescription("Which week (default last)").addChoices({ name: "Last week (enforceable)", value: "last" }, { name: "This week so far", value: "current" })),
  );

const loa = new SlashCommandBuilder()
  .setName("loa")
  .setDescription("Leave of absence")
  .setDMPermission(false)
  .addSubcommand((s) =>
    s
      .setName("request")
      .setDescription("Request leave")
      .addIntegerOption((o) => o.setName("days").setDescription("How many days").setRequired(true).setMinValue(1).setMaxValue(90))
      .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(true).setMaxLength(1000))
      .addIntegerOption((o) => o.setName("starts_in").setDescription("Starts in N days (default today)").setMinValue(0).setMaxValue(60)),
  )
  .addSubcommand((s) => s.setName("end").setDescription("End or withdraw your leave"))
  .addSubcommand((s) => s.setName("list").setDescription("Pending and active leave"));

const commend = new SlashCommandBuilder()
  .setName("commend")
  .setDescription("Decorate an agent")
  .setDMPermission(false)
  .addUserOption((o) => user(o))
  .addStringOption((o) =>
    o
      .setName("award")
      .setDescription("Award")
      .setRequired(true)
      .addChoices(...Object.entries(AWARDS).map(([value, a]) => ({ name: `${a.icon} ${a.label}`, value }))),
  )
  .addStringOption((o) => o.setName("citation").setDescription("Citation").setRequired(true).setMaxLength(1000));

const serverGroup = (g, name, description) =>
  g
    .setName(name)
    .setDescription(description)
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Add or update a server")
        .addStringOption((o) => o.setName("server_id").setDescription("Discord server ID").setRequired(true).setMaxLength(24))
        .addStringOption((o) => o.setName("name").setDescription("Server name").setRequired(true).setMaxLength(100))
        .addStringOption((o) => o.setName("reason").setDescription("Why").setRequired(true).setMaxLength(300)),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Remove a server")
        .addStringOption((o) => o.setName("server_id").setDescription("Discord server ID").setRequired(true).setMaxLength(24)),
    )
    .addSubcommand((s) => s.setName("list").setDescription("Show both lists"));

const intel = new SlashCommandBuilder()
  .setName("intel")
  .setDescription("Intelligence lookups and server lists")
  .setDMPermission(false)
  .addSubcommand((s) => s.setName("lookup").setDescription("Full intel dossier on a user").addUserOption((o) => user(o, "User")))
  .addSubcommand((s) => s.setName("sweep").setDescription("Re-screen every agent against the server lists now"))
  .addSubcommandGroup((g) => serverGroup(g, "watchlist", "Rival agencies (membership = dual clanning lead)"))
  .addSubcommandGroup((g) => serverGroup(g, "blacklisted-server", "Network-wide blacklisted servers"));

const admin = new SlashCommandBuilder()
  .setName("iaa-admin")
  .setDescription("IAA bot setup (High Command)")
  .setDMPermission(false)
  .addSubcommand((s) => s.setName("setup").setDescription("Auto-detect ranks, tiers, roles and channels from this server"))
  .addSubcommand((s) =>
    s
      .setName("panels")
      .setDescription("Refresh or repost the live panels")
      .addStringOption((o) => o.setName("mode").setDescription("Mode").addChoices({ name: "Refresh in place", value: "refresh" }, { name: "Post new copies", value: "repost" })),
  )
  .addSubcommand((s) => s.setName("import").setDescription("Add members who already hold rank roles to the roster"))
  .addSubcommand((s) => s.setName("view").setDescription("Show the current configuration"))
  .addSubcommand((s) =>
    s
      .setName("rank-tier")
      .setDescription("Move a rank into a different command tier")
      .addStringOption((o) => o.setName("rank").setDescription("Rank").setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName("tier").setDescription("Tier").setRequired(true).addChoices(...TIERS)),
  )
  .addSubcommand((s) =>
    s
      .setName("quota")
      .setDescription("Weekly in-game duty quota for a tier")
      .addStringOption((o) => o.setName("tier").setDescription("Tier").setRequired(true).addChoices(...TIERS))
      .addIntegerOption((o) => o.setName("minutes").setDescription("Minutes per week (0 = none)").setRequired(true).setMinValue(0).setMaxValue(10080)),
  )
  .addSubcommand((s) =>
    s
      .setName("permission")
      .setDescription("Lowest tier allowed to do something")
      .addStringOption((o) =>
        o
          .setName("permission")
          .setDescription("Permission")
          .setRequired(true)
          .addChoices(...Object.entries(PERMISSIONS).map(([value, p]) => ({ name: `${value} · ${p.label}`.slice(0, 100), value }))),
      )
      .addStringOption((o) => o.setName("tier").setDescription("Tier").setRequired(true).addChoices(...TIERS)),
  )
  .addSubcommand((s) =>
    s
      .setName("channel")
      .setDescription("Point a bot channel slot somewhere else")
      .addStringOption((o) => o.setName("key").setDescription("Slot").setRequired(true).setAutocomplete(true))
      .addChannelOption((o) => o.setName("channel").setDescription("Channel (empty = unset)").addChannelTypes(ChannelType.GuildText)),
  )
  .addSubcommand((s) =>
    s
      .setName("role")
      .setDescription("Point a status role slot somewhere else")
      .addStringOption((o) =>
        o
          .setName("key")
          .setDescription("Slot")
          .setRequired(true)
          .addChoices(
            ...[
              "base",
              "botPermissions",
              "underInvestigation",
              "suspended",
              "firstStrike",
              "inactivity",
              "loa",
              "orientation",
              "investigationDivision",
              "reducedHours",
              "aotm",
              "gold",
              "silver",
              "bronze",
            ].map((value) => ({ name: value, value })),
          ),
      )
      .addRoleOption((o) => o.setName("role").setDescription("Role (empty = unset)")),
  )
  .addSubcommand((s) =>
    s
      .setName("settings")
      .setDescription("Tune behaviour")
      .addBooleanOption((o) => o.setName("nickname_sync").setDescription("Prefix nicknames with callsigns"))
      .addIntegerOption((o) => o.setName("strike_days").setDescription("Days a strike stays active").setMinValue(1).setMaxValue(365))
      .addIntegerOption((o) => o.setName("inactivity_days").setDescription("Days an inactivity warning stays").setMinValue(1).setMaxValue(90))
      .addIntegerOption((o) => o.setName("stale_hours").setDescription("Remind case leads after this many idle hours").setMinValue(12).setMaxValue(720)),
  );

export const definitions = [iaa, investigation, discipline, activity, loa, commend, intel, admin].map((c) => c.toJSON());
