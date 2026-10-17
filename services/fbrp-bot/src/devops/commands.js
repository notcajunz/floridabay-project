import { SlashCommandBuilder } from "discord.js";
import { PERMISSIONS } from "./store.js";
import { AREAS, PRIORITIES, STATUSES } from "./tasks.js";
import { COMPONENTS } from "./incidents.js";
import { RESTART_CHOICES } from "./restart.js";

const reason = (o) => o.setName("reason").setDescription("Reason").setRequired(true).setMaxLength(500);
const optReason = (o) => o.setName("reason").setDescription("Reason (optional)").setMaxLength(500);
const user = (o) => o.setName("user").setDescription("Team member").setRequired(true);
const rankOpt = (required) => (o) => o.setName("rank").setDescription("Rank").setRequired(required).setAutocomplete(true);
const choices = (obj, label = (v) => v.label ?? v) => Object.entries(obj).map(([value, v]) => ({ name: label(v), value }));

const dev = new SlashCommandBuilder()
  .setName("dev")
  .setDescription("Manage the development roster")
  .addSubcommand((s) => s.setName("add").setDescription("Add someone to the development team").addUserOption(user).addStringOption(rankOpt(false)).addStringOption(optReason))
  .addSubcommand((s) => s.setName("promote").setDescription("Promote a developer").addUserOption(user).addStringOption(reason).addStringOption(rankOpt(false)))
  .addSubcommand((s) => s.setName("demote").setDescription("Demote a developer").addUserOption(user).addStringOption(reason).addStringOption(rankOpt(false)))
  .addSubcommand((s) => s.setName("remove").setDescription("Remove someone from the development team").addUserOption(user).addStringOption(reason))
  .addSubcommand((s) =>
    s
      .setName("team")
      .setDescription("Add or remove someone from a specialty team")
      .addUserOption(user)
      .addStringOption((o) => o.setName("team").setDescription("Specialty team").setRequired(true).setAutocomplete(true))
      .addStringOption(optReason),
  )
  .addSubcommand((s) => s.setName("profile").setDescription("Show a developer file").addUserOption((o) => o.setName("user").setDescription("Defaults to you")))
  .addSubcommand((s) => s.setName("history").setDescription("Show service history").addUserOption(user))
  .addSubcommand((s) => s.setName("roster").setDescription("Show the whole development team"));

const discipline = new SlashCommandBuilder()
  .setName("discipline")
  .setDescription("Warnings, strikes and suspensions")
  .addSubcommand((s) => s.setName("warn").setDescription("Issue a warning").addUserOption(user).addStringOption(reason))
  .addSubcommand((s) => s.setName("strike").setDescription("Issue a strike").addUserOption(user).addStringOption(reason))
  .addSubcommand((s) =>
    s
      .setName("suspend")
      .setDescription("Suspend a developer")
      .addUserOption(user)
      .addStringOption((o) => o.setName("duration").setDescription("e.g. 3d, 48h, 2w").setRequired(true))
      .addStringOption(reason),
  )
  .addSubcommand((s) =>
    s
      .setName("revoke")
      .setDescription("Revoke an active strike or suspension")
      .addIntegerOption((o) => o.setName("id").setDescription("Record number").setRequired(true).setMinValue(1))
      .addStringOption(reason),
  )
  .addSubcommand((s) => s.setName("record").setDescription("Show a disciplinary record").addUserOption(user));

const loa = new SlashCommandBuilder()
  .setName("loa")
  .setDescription("Leave of absence")
  .addSubcommand((s) =>
    s
      .setName("request")
      .setDescription("Request time off")
      .addIntegerOption((o) => o.setName("days").setDescription("How many days").setRequired(true).setMinValue(1).setMaxValue(60))
      .addStringOption(reason)
      .addIntegerOption((o) => o.setName("starts_in").setDescription("Days until it starts (default now)").setMinValue(0).setMaxValue(30)),
  )
  .addSubcommand((s) => s.setName("end").setDescription("End or withdraw your leave"))
  .addSubcommand((s) => s.setName("list").setDescription("Show everyone on or awaiting leave"));

const commend = new SlashCommandBuilder()
  .setName("commend")
  .setDescription("Commendations and Developer of the Month")
  .addSubcommand((s) => s.setName("give").setDescription("Commend a developer").addUserOption(user).addStringOption(reason))
  .addSubcommand((s) => s.setName("dotm").setDescription("Name the Developer of the Month").addUserOption(user).addStringOption(reason))
  .addSubcommand((s) => s.setName("list").setDescription("Show someone's awards").addUserOption((o) => o.setName("user").setDescription("Defaults to you")));

const task = new SlashCommandBuilder()
  .setName("task")
  .setDescription("The team task board")
  .addSubcommand((s) =>
    s
      .setName("add")
      .setDescription("Create a task")
      .addStringOption((o) => o.setName("title").setDescription("What needs doing").setRequired(true).setMaxLength(120))
      .addStringOption((o) => o.setName("details").setDescription("More detail").setMaxLength(1000))
      .addUserOption((o) => o.setName("assignee").setDescription("Who should do it"))
      .addStringOption((o) => o.setName("priority").setDescription("Priority").addChoices(...choices(PRIORITIES)))
      .addStringOption((o) => o.setName("area").setDescription("Area").addChoices(...choices(AREAS, (v) => v)))
      .addIntegerOption((o) => o.setName("due_in_days").setDescription("Due in this many days").setMinValue(1).setMaxValue(365)),
  )
  .addSubcommand((s) =>
    s
      .setName("list")
      .setDescription("List tasks")
      .addStringOption((o) =>
        o.setName("filter").setDescription("Which tasks").addChoices(
          { name: "Mine", value: "mine" },
          { name: "All open", value: "open" },
          { name: "Unassigned", value: "unassigned" },
          { name: "In review", value: "review" },
          { name: "Recently done", value: "done" },
        ),
      )
      .addUserOption((o) => o.setName("user").setDescription("Show one person's open tasks")),
  )
  .addSubcommand((s) => s.setName("view").setDescription("Show a task").addIntegerOption((o) => o.setName("id").setDescription("Task").setRequired(true).setAutocomplete(true)))
  .addSubcommand((s) => s.setName("claim").setDescription("Take an unassigned task").addIntegerOption((o) => o.setName("id").setDescription("Task").setRequired(true).setAutocomplete(true)))
  .addSubcommand((s) =>
    s
      .setName("assign")
      .setDescription("Assign a task to someone")
      .addIntegerOption((o) => o.setName("id").setDescription("Task").setRequired(true).setAutocomplete(true))
      .addUserOption(user),
  )
  .addSubcommand((s) =>
    s
      .setName("status")
      .setDescription("Move a task")
      .addIntegerOption((o) => o.setName("id").setDescription("Task").setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName("status").setDescription("New status").setRequired(true).addChoices(...choices(STATUSES))),
  )
  .addSubcommand((s) => s.setName("done").setDescription("Mark a task done").addIntegerOption((o) => o.setName("id").setDescription("Task").setRequired(true).setAutocomplete(true)))
  .addSubcommand((s) => s.setName("delete").setDescription("Delete a task").addIntegerOption((o) => o.setName("id").setDescription("Task").setRequired(true).setAutocomplete(true)));

const incident = new SlashCommandBuilder()
  .setName("incident")
  .setDescription("Incident management and the public status page")
  .addSubcommand((s) =>
    s
      .setName("open")
      .setDescription("Open an incident and post it to the status channel")
      .addStringOption((o) => o.setName("title").setDescription("Short title").setRequired(true).setMaxLength(120))
      .addStringOption((o) =>
        o.setName("severity").setDescription("How bad is it").setRequired(true).addChoices(
          { name: "SEV1 · Critical outage", value: "1" },
          { name: "SEV2 · Major impact", value: "2" },
          { name: "SEV3 · Minor impact", value: "3" },
          { name: "SEV4 · Notice", value: "4" },
        ),
      )
      .addStringOption((o) => o.setName("component").setDescription("What is affected").addChoices(...COMPONENTS.map((c) => ({ name: c, value: c }))))
      .addStringOption((o) => o.setName("summary").setDescription("What we know so far").setMaxLength(1000)),
  )
  .addSubcommand((s) =>
    s
      .setName("update")
      .setDescription("Post an update")
      .addIntegerOption((o) => o.setName("id").setDescription("Incident").setRequired(true).setAutocomplete(true))
      .addStringOption((o) =>
        o.setName("status").setDescription("New status").setRequired(true).addChoices(
          { name: "Investigating", value: "investigating" },
          { name: "Identified", value: "identified" },
          { name: "Monitoring", value: "monitoring" },
        ),
      )
      .addStringOption((o) => o.setName("message").setDescription("The update").setRequired(true).setMaxLength(1000)),
  )
  .addSubcommand((s) =>
    s
      .setName("resolve")
      .setDescription("Resolve an incident")
      .addIntegerOption((o) => o.setName("id").setDescription("Incident").setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName("message").setDescription("How it was fixed").setRequired(true).setMaxLength(1000)),
  )
  .addSubcommand((s) =>
    s
      .setName("commander")
      .setDescription("Set the incident commander")
      .addIntegerOption((o) => o.setName("id").setDescription("Incident").setRequired(true).setAutocomplete(true))
      .addUserOption(user),
  )
  .addSubcommand((s) => s.setName("list").setDescription("Recent incidents"))
  .addSubcommand((s) => s.setName("view").setDescription("Show an incident timeline").addIntegerOption((o) => o.setName("id").setDescription("Incident").setRequired(true).setAutocomplete(true)));

const release = new SlashCommandBuilder()
  .setName("release")
  .setDescription("Release notes")
  .addSubcommand((s) => s.setName("post").setDescription("Post release notes").addBooleanOption((o) => o.setName("ping").setDescription("Ping the release role (default yes)")))
  .addSubcommand((s) => s.setName("list").setDescription("Recent releases"));

const announce = new SlashCommandBuilder()
  .setName("announce")
  .setDescription("Post an announcement")
  .addStringOption((o) =>
    o.setName("audience").setDescription("Where it goes").addChoices(
      { name: "Public announcements", value: "public" },
      { name: "Development team", value: "team" },
      { name: "Leadership", value: "leadership" },
    ),
  )
  .addBooleanOption((o) => o.setName("ping").setDescription("Ping the audience role"));

const standup = new SlashCommandBuilder().setName("standup").setDescription("Post your daily standup");

const vehicle = new SlashCommandBuilder()
  .setName("vehicle")
  .setDescription("Look up an installed or personal vehicle")
  .addSubcommand((s) =>
    s
      .setName("lookup")
      .setDescription("Search by spawn code, hash, name, plate, personal ID or resource")
      .addStringOption((o) => o.setName("query").setDescription("Vehicle spawn code, hash, name, plate, ID or resource").setRequired(true).setAutocomplete(true)),
  );

const personals = new SlashCommandBuilder()
  .setName("personals")
  .setDescription("Look up personal vehicles")
  .addSubcommand((s) => s.setName("owned").setDescription("List a user's owned personal vehicles and their details").addUserOption((o) => o.setName("user").setDescription("Personal vehicle owner").setRequired(true)));

const headtag = new SlashCommandBuilder()
  .setName("headtag")
  .setDescription("Look up headtags and their owners")
  .addSubcommand((s) => s.setName("info").setDescription("Show a tag and its owners/holders").addStringOption((o) => o.setName("tag").setDescription("Headtag ID or name").setRequired(true).setAutocomplete(true)))
  .addSubcommand((s) => s.setName("owned").setDescription("List all tags owned by a user").addUserOption((o) => o.setName("user").setDescription("Tag owner").setRequired(true)));

const ticket = new SlashCommandBuilder()
  .setName("ticket")
  .setDescription("Open and manage support tickets")
  .addSubcommand((s) => s.setName("open").setDescription("Open a private support channel").addStringOption((o) => o.setName("type").setDescription("Ticket category").setRequired(true).setAutocomplete(true)))
  .addSubcommand((s) => s.setName("mine").setDescription("List your tickets"))
  .addSubcommand((s) => s.setName("claim").setDescription("Claim or release the ticket in this channel").addBooleanOption((o) => o.setName("claimed").setDescription("True claims, false releases")))
  .addSubcommand((s) => s.setName("close").setDescription("Close the ticket in this channel").addStringOption(reason))
  .addSubcommand((s) => s.setName("request-close").setDescription("Ask staff to close this ticket").addStringOption(reason))
  .addSubcommand((s) => s.setName("transfer").setDescription("Transfer the ticket to another staff member").addUserOption((o) => o.setName("member").setDescription("Member").setRequired(true)))
  .addSubcommand((s) => s.setName("add").setDescription("Add a participant to this ticket").addUserOption((o) => o.setName("member").setDescription("Member").setRequired(true)))
  .addSubcommand((s) => s.setName("remove").setDescription("Remove a participant from this ticket").addUserOption((o) => o.setName("member").setDescription("Member").setRequired(true)))
  .addSubcommand((s) =>
    s
      .setName("priority")
      .setDescription("Change ticket priority")
      .addStringOption((o) => o.setName("level").setDescription("Priority").setRequired(true).setAutocomplete(true))
      .addStringOption(reason),
  )
  .addSubcommand((s) => s.setName("move").setDescription("Move the ticket to another category").addStringOption((o) => o.setName("type").setDescription("Ticket category").setRequired(true).setAutocomplete(true)))
  .addSubcommand((s) => s.setName("rename").setDescription("Rename this ticket channel").addStringOption((o) => o.setName("name").setDescription("New channel name").setRequired(true).setMaxLength(80)))
  .addSubcommand((s) => s.setName("note").setDescription("Add a private staff note").addStringOption((o) => o.setName("text").setDescription("Note text").setRequired(true).setMaxLength(1000)))
  .addSubcommand((s) => s.setName("notes").setDescription("View private staff notes"))
  .addSubcommand((s) => s.setName("reopen").setDescription("Reopen a closed ticket").addIntegerOption((o) => o.setName("id").setDescription("Ticket number").setRequired(true).setMinValue(1)))
  .addSubcommand((s) => s.setName("transcript").setDescription("Get the ticket transcript").addIntegerOption((o) => o.setName("id").setDescription("Ticket number; current channel if blank").setMinValue(1)))
  .addSubcommand((s) => s.setName("list").setDescription("List open support tickets"));

const support = new SlashCommandBuilder()
  .setName("support")
  .setDescription("Configure the ticket system")
  .addSubcommand((s) => s.setName("panel").setDescription("Post or move the ticket panel").addChannelOption((o) => o.setName("channel").setDescription("Panel channel").setRequired(true)))
  .addSubcommand((s) => s.setName("config").setDescription("Show ticket configuration"))
  .addSubcommand((s) =>
    s
      .setName("category")
      .setDescription("Set a Discord category for a ticket type")
      .addStringOption((o) => o.setName("type").setDescription("Ticket type or all").setRequired(true).setAutocomplete(true))
      .addChannelOption((o) => o.setName("category").setDescription("Discord category").setRequired(true)),
  )
  .addSubcommand((s) =>
    s
      .setName("role")
      .setDescription("Add or remove a support role")
      .addStringOption((o) => o.setName("type").setDescription("Ticket type or all").setRequired(true).setAutocomplete(true))
      .addRoleOption((o) => o.setName("role").setDescription("Support role").setRequired(true))
      .addStringOption((o) => o.setName("level").setDescription("Access level").setRequired(true).addChoices({ name: "Support", value: "support" }, { name: "Manager", value: "manager" }))
      .addStringOption((o) => o.setName("mode").setDescription("Add or remove").setRequired(true).addChoices({ name: "Add", value: "add" }, { name: "Remove", value: "remove" })),
  )
  .addSubcommand((s) =>
    s
      .setName("limit")
      .setDescription("Set ticket limits")
      .addIntegerOption((o) => o.setName("max_open").setDescription("Maximum open tickets per user").setRequired(true).setMinValue(1).setMaxValue(10))
      .addIntegerOption((o) => o.setName("cooldown_seconds").setDescription("Seconds between new tickets").setRequired(true).setMinValue(0).setMaxValue(86400)),
  );

const devops = new SlashCommandBuilder()
  .setName("devops")
  .setDescription("DevOps server tools")
  .addSubcommand((s) => s.setName("status").setDescription("Live status of the game server, website and bots"))
  .addSubcommand((s) => s.setName("help").setDescription("What this bot can do and who can do it"));

const restart = new SlashCommandBuilder()
  .setName("restart")
  .setDescription("Restart an FBRP production service (service owner only)")
  .addStringOption((o) => o.setName("service").setDescription("Service to restart").setRequired(true).addChoices(...RESTART_CHOICES));

const admin = new SlashCommandBuilder()
  .setName("devops-admin")
  .setDescription("Configure the DevOps bot (Development Manager+)")
  .addSubcommand((s) => s.setName("setup").setDescription("Build or repair roles, channels and panels"))
  .addSubcommand((s) => s.setName("panels").setDescription("Re-post or refresh the panels").addBooleanOption((o) => o.setName("fresh").setDescription("Delete and re-post instead of editing")))
  .addSubcommand((s) => s.setName("config").setDescription("Show what the bot is configured with"))
  .addSubcommand((s) =>
    s
      .setName("perms")
      .setDescription("Change the lowest rank allowed to do something")
      .addStringOption((o) =>
        o.setName("permission").setDescription("What to change").setRequired(true).addChoices(...Object.entries(PERMISSIONS).map(([value, v]) => ({ name: `${value} · ${v.label}`.slice(0, 100), value }))),
      )
      .addStringOption((o) => o.setName("rank").setDescription("Lowest rank allowed").setRequired(true).setAutocomplete(true)),
  )
  .addSubcommand((s) =>
    s
      .setName("settings")
      .setDescription("Tune numbers")
      .addIntegerOption((o) => o.setName("trial_days").setDescription("Trial Developer period").setMinValue(1).setMaxValue(90))
      .addIntegerOption((o) => o.setName("strike_days").setDescription("Days a strike stays active").setMinValue(7).setMaxValue(365))
      .addIntegerOption((o) => o.setName("strikes_before_review").setDescription("Active strikes before leadership is alerted").setMinValue(1).setMaxValue(10)),
  )
  .addSubcommand((s) => s.setName("sync").setDescription("Re-sync group roles and records from current ranks"))
  .addSubcommand((s) =>
    s
      .setName("adminrole")
      .setDescription("Let a role administer the bot")
      .addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true))
      .addStringOption((o) => o.setName("mode").setDescription("Add or remove").setRequired(true).addChoices({ name: "Add", value: "add" }, { name: "Remove", value: "remove" })),
  );

export const definitions = [dev, discipline, loa, commend, task, incident, release, announce, standup, vehicle, personals, headtag, ticket, support, devops, restart, admin].map((c) => c.toJSON());
