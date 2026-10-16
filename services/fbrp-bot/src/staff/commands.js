import { SlashCommandBuilder } from "discord.js";
import { COORD_RANKS } from "./config.js";

const reason = (option) =>
  option
    .setName("reason")
    .setDescription("Reason recorded in the audit log")
    .setRequired(true)
    .setMaxLength(300);
const user = (option) =>
  option.setName("member").setDescription("Discord member").setRequired(true);
// Adding and removing accepts a Discord ID too, because the person may not be in the staff server.
// Required options must come first, so these two always close the subcommand.
const pickedMember = (option) =>
  option.setName("member").setDescription("Discord member (or enter their Discord ID below)").setRequired(false);
const discordId = (option) =>
  option.setName("discord_id").setDescription("Discord ID, for someone who is not in this server").setMinLength(15).setMaxLength(25).setRequired(false);

const staff = new SlashCommandBuilder()
  .setName("staff")
  .setDescription("Staff ranks and duty tracking")
  .addSubcommand((s) =>
    s
      .setName("add")
      .setDescription("Put a member in a staff rank's ACE group")
      .addStringOption((o) =>
        o
          .setName("rank")
          .setDescription("Staff rank (only ranks below your own are allowed)")
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addUserOption(pickedMember)
      .addStringOption(discordId),
  )
  .addSubcommand((s) =>
    s
      .setName("move")
      .setDescription("Move an existing staff member to another rank (promote or demote)")
      .addStringOption((o) =>
        o
          .setName("rank")
          .setDescription("New staff rank (only ranks below your own are allowed)")
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addStringOption((o) => o.setName("reason").setDescription("Reason for the move").setMaxLength(300))
      .addUserOption(pickedMember)
      .addStringOption(discordId),
  )
  .addSubcommand((s) =>
    s
      .setName("remove")
      .setDescription("Remove a member's staff rank, ACE group, and callsign")
      .addStringOption(reason)
      .addUserOption(pickedMember)
      .addStringOption(discordId),
  )
  .addSubcommand((s) =>
    s
      .setName("hours")
      .setDescription("Show a member’s staff hours")
      .addUserOption(user),
  )
  .addSubcommand((s) =>
    s
      .setName("leaderboard")
      .setDescription("Show staff hours leaderboard")
      .addIntegerOption((o) =>
        o
          .setName("days")
          .setDescription("Window in days")
          .setMinValue(1)
          .setMaxValue(365),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("forceout")
      .setDescription("Close a member’s active staff shift")
      .addUserOption(user)
      .addStringOption(reason),
  );

const callsign = new SlashCommandBuilder()
  .setName("callsign")
  .setDescription("Rank-order and publish leadership callsigns")
  .addSubcommand((s) =>
    s
      .setName("sync")
      .setDescription("Rebalance and republish Trial Head Administrator+ callsigns"),
  );

const coordall = new SlashCommandBuilder()
  .setName("coordall")
  .setDescription("Owner only: every coordinator job and ACE group at once")
  .addSubcommand((s) =>
    s
      .setName("add")
      .setDescription("Add a member to every coordinator job, role and ACE group")
      .addUserOption((o) => o.setName("member").setDescription("Member to make a full coordinator").setRequired(true)),
  )
  .addSubcommand((s) =>
    s
      .setName("remove")
      .setDescription("Remove a member from every coordination roster: staff, gang, department and business")
      .addUserOption(pickedMember)
      .addStringOption(discordId),
  );

const roster = new SlashCommandBuilder()
  .setName("roster")
  .setDescription("Manage the staff roster and discipline")
  .addSubcommand((s) =>
    s
      .setName("add")
      .setDescription("Add or update a roster member")
      .addIntegerOption((o) =>
        o
          .setName("rank")
          .setDescription("Rank ID from /roster list")
          .setRequired(true)
          .setMinValue(1),
      )
      .addUserOption(pickedMember)
      .addStringOption(discordId),
  )
  .addSubcommand((s) =>
    s
      .setName("remove")
      .setDescription("Remove a roster member")
      .addStringOption(reason)
      .addUserOption(pickedMember)
      .addStringOption(discordId),
  )
  .addSubcommand((s) =>
    s
      .setName("status")
      .setDescription("Change roster status")
      .addUserOption(user)
      .addStringOption((o) =>
        o
          .setName("status")
          .setDescription("Roster status")
          .setRequired(true)
          .addChoices(
            { name: "Active", value: "active" },
            { name: "Inactive", value: "inactive" },
            { name: "LOA", value: "loa" },
          ),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("discipline")
      .setDescription("Issue a warning or strike")
      .addUserOption(user)
      .addStringOption((o) =>
        o
          .setName("kind")
          .setDescription("Discipline type")
          .setRequired(true)
          .addChoices(
            { name: "Warning", value: "warning" },
            { name: "Strike", value: "strike" },
          ),
      )
      .addStringOption(reason),
  )
  .addSubcommand((s) =>
    s
      .setName("profile")
      .setDescription("Show one member's complete roster record")
      .addUserOption(user),
  )
  .addSubcommand((s) =>
    s
      .setName("note")
      .setDescription("Set a private roster activity note")
      .addUserOption(user)
      .addStringOption((o) => o.setName("note").setDescription("Activity note").setRequired(true).setMaxLength(500)),
  )
  .addSubcommand((s) =>
    s
      .setName("discipline-revoke")
      .setDescription("Revoke a warning or strike")
      .addIntegerOption((o) => o.setName("id").setDescription("Discipline record ID").setRequired(true).setMinValue(1))
      .addStringOption(reason),
  )
  .addSubcommand((s) =>
    s
      .setName("category-upsert")
      .setDescription("Create or update a callsign category")
      .addStringOption((o) => o.setName("name").setDescription("Category name").setRequired(true).setMaxLength(80))
      .addIntegerOption((o) => o.setName("start").setDescription("First callsign").setRequired(true).setMinValue(1).setMaxValue(9999))
      .addIntegerOption((o) => o.setName("end").setDescription("Last callsign").setRequired(true).setMinValue(1).setMaxValue(9999))
      .addIntegerOption((o) => o.setName("id").setDescription("Existing category ID; blank creates"))
      .addIntegerOption((o) => o.setName("order").setDescription("Display order")),
  )
  .addSubcommand((s) =>
    s
      .setName("category-delete")
      .setDescription("Delete an unused roster category")
      .addIntegerOption((o) => o.setName("id").setDescription("Category ID").setRequired(true).setMinValue(1)),
  )
  .addSubcommand((s) =>
    s
      .setName("rank-upsert")
      .setDescription("Create or update a staff rank and role mapping")
      .addIntegerOption((o) => o.setName("category").setDescription("Category ID").setRequired(true).setMinValue(1))
      .addStringOption((o) => o.setName("name").setDescription("Rank name").setRequired(true).setMaxLength(80))
      .addIntegerOption((o) => o.setName("id").setDescription("Existing rank ID; blank creates"))
      .addRoleOption((o) => o.setName("role").setDescription("Rank role in this server"))
      .addStringOption((o) => o.setName("ace_group").setDescription("ACE group /staff add puts this rank in").setAutocomplete(true))
      .addIntegerOption((o) => o.setName("weekly_hours").setDescription("Weekly activity requirement").setMinValue(0).setMaxValue(168))
      .addIntegerOption((o) => o.setName("minimum_days").setDescription("Minimum days before promotion").setMinValue(0).setMaxValue(3650))
      .addIntegerOption((o) => o.setName("order").setDescription("Display order")),
  )
  .addSubcommand((s) =>
    s
      .setName("rank-delete")
      .setDescription("Delete an unused staff rank")
      .addIntegerOption((o) => o.setName("id").setDescription("Rank ID").setRequired(true).setMinValue(1)),
  )
  .addSubcommand((s) =>
    s
      .setName("job-upsert")
      .setDescription("Create or update a staff secondary job")
      .addStringOption((o) => o.setName("name").setDescription("Job name").setRequired(true).setMaxLength(80))
      .addIntegerOption((o) => o.setName("id").setDescription("Existing job ID; blank creates"))
      .addStringOption((o) => o.setName("description").setDescription("Job description").setMaxLength(300))
      .addRoleOption((o) => o.setName("role").setDescription("Job role in this server"))
      .addIntegerOption((o) => o.setName("order").setDescription("Display order")),
  )
  .addSubcommand((s) =>
    s
      .setName("job-delete")
      .setDescription("Delete a staff secondary job")
      .addIntegerOption((o) => o.setName("id").setDescription("Job ID").setRequired(true).setMinValue(1)),
  )
  .addSubcommand((s) =>
    s
      .setName("job-assign")
      .setDescription("Assign a secondary job to a roster member")
      .addUserOption(user)
      .addIntegerOption((o) => o.setName("job").setDescription("Job ID").setRequired(true).setMinValue(1)),
  )
  .addSubcommand((s) =>
    s
      .setName("job-remove")
      .setDescription("Remove a secondary job from a roster member")
      .addUserOption(user)
      .addIntegerOption((o) => o.setName("job").setDescription("Job ID").setRequired(true).setMinValue(1)),
  )
  .addSubcommand((s) =>
    s.setName("sync").setDescription("Sync roster ranks from Discord roles"),
  )
  .addSubcommand((s) =>
    s.setName("list").setDescription("List the staff roster"),
  );

const examChoice = (o) =>
  o.setName("exam").setDescription("Which exam").setRequired(true)
    .addChoices({ name: "Head Administrator exam", value: "head_admin" }, { name: "Management exam", value: "management" });
const exam = new SlashCommandBuilder()
  .setName("exam")
  .setDescription("Give out staff promotion exams (Assistant Community Director and above)")
  .addSubcommand((s) =>
    s.setName("give").setDescription("Open an exam for a member for 60 minutes")
      .addUserOption((o) => o.setName("member").setDescription("Staff member sitting the exam").setRequired(true))
      .addStringOption(examChoice),
  )
  .addSubcommand((s) =>
    s.setName("revoke").setDescription("Close a member's exam access early")
      .addUserOption((o) => o.setName("member").setDescription("Staff member").setRequired(true))
      .addStringOption(examChoice),
  )
  .addSubcommand((s) => s.setName("active").setDescription("List exam access that is open right now"));

const coordDays = (option) => option.setName("days").setDescription("Window in days (default 7)").setMinValue(1).setMaxValue(365);

/** Only the staff coordination team lives here. Gang, department and business /coord are their own bots. */
const coord = new SlashCommandBuilder()
  .setName("coord")
  .setDescription("Manage the staff coordination team")
  .addSubcommand((s) =>
    s
      .setName("add")
      .setDescription("Hire, promote or demote a staff coordinator (also puts them on the team ACE group)")
      .addStringOption((o) =>
        o
          .setName("rank")
          .setDescription("Coordination rank (only ranks below your own)")
          .setRequired(true)
          .addChoices(...COORD_RANKS.map((rank) => ({ name: rank.name, value: rank.name }))),
      )
      .addUserOption(pickedMember)
      .addStringOption(discordId),
  )
  .addSubcommand((s) =>
    s
      .setName("remove")
      .setDescription("Remove a member from the staff coordination team (ranks, team role and ACE group)")
      .addStringOption((o) =>
        o
          .setName("reason")
          .setDescription("Why they are leaving the team")
          .setRequired(true)
          .addChoices({ name: "Resigned", value: "Resigned" }, { name: "Removed", value: "Removed" }),
      )
      .addUserOption(pickedMember)
      .addStringOption(discordId),
  )
  .addSubcommand((s) =>
    s
      .setName("hours")
      .setDescription("Show staff hours for a coordination team member (yourself if blank)")
      .addUserOption((o) => o.setName("member").setDescription("Team member (managers only; blank is you)"))
      .addIntegerOption(coordDays),
  )
  .addSubcommand((s) =>
    s.setName("leaderboard").setDescription("Staff hours for the whole coordination team").addIntegerOption(coordDays),
  )
  .addSubcommand((s) => s.setName("list").setDescription("Show the staff coordination team by rank"))
  .addSubcommand((s) =>
    s.setName("sync").setDescription("Re-check the team ACE group, roster job and chain-of-command board"),
  );

export const definitions = [staff, roster, callsign, exam, coordall, coord].map((command) => command.toJSON());
export const commandNames = new Set(definitions.map((command) => command.name));
