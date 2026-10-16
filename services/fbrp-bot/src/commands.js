import { ChannelType, SlashCommandBuilder } from "discord.js";

const reason = (option) =>
  option
    .setName("reason")
    .setDescription("Reason recorded in the audit log")
    .setRequired(true)
    .setMaxLength(300);
const user = (option) =>
  option.setName("member").setDescription("Discord member").setRequired(true);

const ace = new SlashCommandBuilder()
  .setName("ace")
  .setDescription("Manage MariaDB-backed ACE groups")
  .addSubcommand((s) =>
    s
      .setName("group-create")
      .setDescription("Create an ACE group")
      .addStringOption((o) =>
        o.setName("name").setDescription("Machine name").setRequired(true),
      )
      .addStringOption((o) =>
        o.setName("label").setDescription("Display label").setRequired(true),
      )
      .addIntegerOption((o) =>
        o
          .setName("rank")
          .setDescription("Higher groups sort first")
          .setMinValue(0)
          .setMaxValue(10000),
      )
      .addBooleanOption((o) =>
        o
          .setName("staff_only")
          .setDescription("Only apply in game while /clockin is active"),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("group-delete")
      .setDescription("Delete an ACE group and its mappings")
      .addStringOption((o) =>
        o.setName("name").setDescription("Group name").setRequired(true).setAutocomplete(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("permission")
      .setDescription("Allow or deny an ACE object for a group")
      .addStringOption((o) =>
        o.setName("group").setDescription("Group name").setRequired(true).setAutocomplete(true),
      )
      .addStringOption((o) =>
        o
          .setName("object")
          .setDescription("ACE object or prefix.*")
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName("mode")
          .setDescription("Permission mode")
          .setRequired(true)
          .addChoices(
            { name: "Allow", value: "allow" },
            { name: "Deny", value: "deny" },
            { name: "Remove", value: "remove" },
          ),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("bundle")
      .setDescription("Grant or remove a curated permission bundle")
      .addStringOption((o) =>
        o.setName("group").setDescription("Group name").setRequired(true).setAutocomplete(true),
      )
      .addStringOption((o) =>
        o
          .setName("bundle")
          .setDescription("Bundle name from /ace catalog")
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName("mode")
          .setDescription("Grant or remove the bundle")
          .setRequired(true)
          .addChoices(
            { name: "Grant", value: "grant" },
            { name: "Remove", value: "remove" },
          ),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("member-add")
      .setDescription("Add a direct group member")
      .addStringOption((o) =>
        o.setName("group").setDescription("Group name").setRequired(true).setAutocomplete(true),
      )
      .addUserOption(user),
  )
  .addSubcommand((s) =>
    s
      .setName("member-remove")
      .setDescription("Remove direct group membership")
      .addStringOption((o) =>
        o.setName("group").setDescription("Group name").setRequired(true).setAutocomplete(true),
      )
      .addUserOption(user),
  )
  .addSubcommand((s) =>
    s
      .setName("bind-role")
      .setDescription("Gate a Discord role behind direct ACE membership")
      .addStringOption((o) =>
        o.setName("group").setDescription("Group name").setRequired(true).setAutocomplete(true),
      )
      .addRoleOption((o) =>
        o.setName("role").setDescription("Role to bind").setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("unbind-role")
      .setDescription("Stop gating a Discord role behind an ACE group")
      .addRoleOption((o) =>
        o.setName("role").setDescription("Bound role").setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName("group")
          .setDescription("Only remove this group's binding (default: every binding of the role)")
          .setAutocomplete(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("list")
      .setDescription("List groups, ACE entries, and role bindings"),
  )
  .addSubcommand((s) =>
    s.setName("catalog").setDescription("Show permission objects and bundles"),
  );

const headtag = new SlashCommandBuilder()
  .setName("headtag")
  .setDescription("Create and manage overhead tags")
  .addSubcommand((s) =>
    s
      .setName("create")
      .setDescription("Create a Discord-gated headtag, gang tag, or dual-slot tag")
      .addStringOption((o) =>
        o
          .setName("kind")
          .setDescription("Tag slot")
          .setRequired(true)
          .addChoices(
            { name: "Headtag (top)", value: "head" },
            { name: "Gang tag (bottom)", value: "gang" },
            { name: "Headtag + gang tag (both)", value: "both" },
          ),
      )
      .addStringOption((o) =>
        o
          .setName("label")
          .setDescription("Text shown in game")
          .setRequired(true)
          .setMaxLength(40),
      )
      .addStringOption((o) =>
        o
          .setName("color")
          .setDescription("Hex color, e.g. #43E8D8")
          .setRequired(true),
      )
      .addUserOption((o) =>
        o
          .setName("owner")
          .setDescription("Give this member ownership of the tag immediately"),
      )
      .addRoleOption((o) =>
        o
          .setName("role")
          .setDescription("Existing role; leave blank to create one"),
      )
      .addIntegerOption((o) =>
        o
          .setName("priority")
          .setDescription("Wardrobe order")
          .setMinValue(-1000)
          .setMaxValue(1000),
      )
      .addStringOption((o) =>
        o
          .setName("organization")
          .setDescription("Only wearable while on duty as this organization")
          .setAutocomplete(true),
      )
      .addBooleanOption((o) =>
        o
          .setName("chat_tag")
          .setDescription("Also let players equip this beside their name in chat"),
      )
      .addBooleanOption((o) =>
        o
          .setName("outline")
          .setDescription("Draw an outline around the tag text in game (default: yes)"),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("delete")
      .setDescription("Delete a tag definition")
      .addIntegerOption((o) =>
        o
          .setName("id")
          .setDescription("Tag ID")
          .setRequired(true)
          .setMinValue(1),
      )
      .addBooleanOption((o) =>
        o
          .setName("delete_role")
          .setDescription("Also delete the bot-created role"),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("grant")
      .setDescription("Grant a tag directly")
      .addIntegerOption((o) =>
        o.setName("id").setDescription("Tag ID").setRequired(true),
      )
      .addUserOption(user),
  )
  .addSubcommand((s) =>
    s
      .setName("revoke")
      .setDescription("Revoke direct tag access")
      .addIntegerOption((o) =>
        o.setName("id").setDescription("Tag ID").setRequired(true),
      )
      .addUserOption(user),
  )
  .addSubcommand((s) =>
    s.setName("list").setDescription("List all headtags and gang tags"),
  );

const organization = new SlashCommandBuilder()
  .setName("organization")
  .setDescription("Manage gangs, businesses, and departments")
  .addSubcommand((s) =>
    s
      .setName("create")
      .setDescription(
        "Create an organization, its in-game tag, and ACE group",
      )
      .addStringOption((o) =>
        o
          .setName("slug")
          .setDescription("Short command name")
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName("name")
          .setDescription("Display name")
          .setRequired(true)
          .setMaxLength(80),
      )
      .addStringOption((o) =>
        o
          .setName("type")
          .setDescription("Organization type")
          .setRequired(true)
          .addChoices(
            { name: "Gang", value: "gang" },
            { name: "Business", value: "business" },
            { name: "Law enforcement", value: "leo" },
            { name: "Fire & rescue", value: "fire" },
            { name: "Government", value: "government" },
            { name: "Other", value: "other" },
          ),
      )
      .addStringOption((o) =>
        o.setName("color").setDescription("Hex color").setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName("tag")
          .setDescription("Text of the in-game tag (defaults to the display name)")
          .setMaxLength(40),
      )
      .addRoleOption((o) =>
        o
          .setName("access_role")
          .setDescription("Role in this server required to clock in"),
      )
      .addStringOption((o) =>
        o
          .setName("network_role_id")
          .setDescription("Required role ID from another network server"),
      )
      .addStringOption((o) =>
        o
          .setName("network_guild_id")
          .setDescription("Server ID that owns network_role_id"),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("delete")
      .setDescription("Deactivate an organization")
      .addStringOption((o) =>
        o.setName("slug").setDescription("Organization slug").setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("hours")
      .setDescription("Show organization duty hours")
      .addStringOption((o) =>
        o.setName("slug").setDescription("Organization slug").setRequired(true),
      )
      .addUserOption((o) =>
        o.setName("member").setDescription("Optional member filter"),
      ),
  )
  .addSubcommand((s) => s.setName("list").setDescription("List organizations"));

const radio = new SlashCommandBuilder()
  .setName("radio")
  .setDescription("Configure in-game radio channels")
  .addSubcommand((s) =>
    s.setName("create").setDescription("Create or update a managed frequency")
      .addNumberOption((o) => o.setName("channel").setDescription("Frequency, with up to two decimals").setRequired(true).setMinValue(1).setMaxValue(999.99))
      .addStringOption((o) => o.setName("name").setDescription("Channel display name").setRequired(true).setMaxLength(80))
      .addStringOption((o) => o.setName("organization").setDescription("Organization slug; omit for a public channel").setMaxLength(40))
      .addStringOption((o) => o.setName("description").setDescription("Short channel description").setMaxLength(180))
      .addStringOption((o) => o.setName("color").setDescription("Six-digit hex color").setMaxLength(7)),
  )
  .addSubcommand((s) =>
    s.setName("delete").setDescription("Delete a managed frequency")
      .addNumberOption((o) => o.setName("channel").setDescription("Frequency, with up to two decimals").setRequired(true).setMinValue(1).setMaxValue(999.99)),
  )
  .addSubcommand((s) => s.setName("list").setDescription("List managed radio frequencies"));

const network = new SlashCommandBuilder()
  .setName("network")
  .setDescription("Manage the Florida Bay Discord network (global roles live in /globalsync)")
  .addSubcommand((s) =>
    s
      .setName("add")
      .setDescription("Add this Discord server to the network")
      .addStringOption((o) =>
        o
          .setName("kind")
          .setDescription("Server type")
          .setRequired(true)
          .addChoices(
            { name: "Main", value: "main" },
            { name: "Staff", value: "staff" },
            { name: "Gang", value: "gang" },
            { name: "Department", value: "department" },
            { name: "Community", value: "community" },
            { name: "Business", value: "business" },
            { name: "Partner", value: "partner" },
            { name: "Other", value: "other" },
          ),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("remove")
      .setDescription("Remove this Discord server from the network"),
  )
  .addSubcommand((s) =>
    s.setName("list").setDescription("List network servers and synced roles"),
  );

const syncScope = (option) =>
  option
    .setName("scope")
    .setDescription("Which servers get the role: a server type, or pick individual servers")
    .addChoices(
      { name: "All servers", value: "all" },
      { name: "Every server except main", value: "satellites" },
      { name: "Main server", value: "main" },
      { name: "Staff servers", value: "staff" },
      { name: "Gang servers", value: "gang" },
      { name: "Department servers", value: "department" },
      { name: "Community servers", value: "community" },
      { name: "Business servers", value: "business" },
      { name: "Partner servers", value: "partner" },
      { name: "Other servers", value: "other" },
      { name: "Pick individual servers", value: "custom" },
    );

const syncOptions = (subcommand, editing = false) =>
  subcommand
    .addStringOption((o) =>
      o
        .setName("group")
        .setDescription(editing ? "Synced group to edit" : "ACE group whose members wear the role")
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addStringOption((o) =>
      o
        .setName("name")
        .setDescription(editing ? "New role name" : "Role name (defaults to the group name)")
        .setMaxLength(100),
    )
    .addStringOption(syncScope)
    .addStringOption((o) =>
      o
        .setName("permissions")
        .setDescription("Discord permissions integer; 0 grants no base permissions")
        .setMaxLength(20),
    )
    .addBooleanOption((o) =>
      o
        .setName("all_channels")
        .setDescription("See/chat in every text channel and see/join every voice channel"),
    )
    .addStringOption((o) =>
      o.setName("color").setDescription("Hex color, e.g. #43E8D8, or \"default\" for the Discord default (no color)").setMaxLength(7),
    )
    .addBooleanOption((o) =>
      o.setName("hoist").setDescription("Show separately in the member list"),
    )
    .addBooleanOption((o) =>
      o.setName("mentionable").setDescription("Allow members to mention the role"),
    )
    .addRoleOption((o) =>
      o.setName("existing_role").setDescription("Optional: use this existing role in this server instead of creating one"),
    )
    .addStringOption((o) =>
      o
        .setName("existing_roles")
        .setDescription("Optional: existing role IDs to use in other servers (comma separated)")
        .setMaxLength(1000),
    );

const globalsync = new SlashCommandBuilder()
  .setName("globalsync")
  .setDescription("Sync an ACE group's Discord role across every Florida Bay server")
  .addSubcommand((s) =>
    syncOptions(
      s.setName("add").setDescription("Create a synced role: group members get it in every matching server"),
    ),
  )
  .addSubcommand((s) =>
    syncOptions(
      s.setName("edit").setDescription("Edit an existing global role sync and apply the changes everywhere"),
      true,
    ),
  )
  .addSubcommand((s) =>
    s
      .setName("remove")
      .setDescription("Stop syncing a group's role")
      .addStringOption((o) =>
        o.setName("group").setDescription("Synced group").setRequired(true).setAutocomplete(true),
      )
      .addBooleanOption((o) =>
        o.setName("delete_roles").setDescription("Delete roles created by the bot (default: yes)"),
      ),
  )
  .addSubcommand((s) =>
    s.setName("list").setDescription("List every synced role and where it lives"),
  )
  .addSubcommand((s) =>
    s.setName("push").setDescription("Re-create missing synced roles everywhere and re-sync every member"),
  )
  .addSubcommand((s) =>
    s
      .setName("servers")
      .setDescription("Pick exactly which network servers a synced role lives in")
      .addStringOption((o) =>
        o.setName("group").setDescription("Synced group").setRequired(true).setAutocomplete(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("order")
      .setDescription("Show or set which synced roles sit above others in every server")
      .addStringOption((o) =>
        o
          .setName("groups")
          .setDescription("Comma-separated ACE groups from top to bottom")
          .setMaxLength(1000)
          .setAutocomplete(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("move")
      .setDescription("Move one synced role to a spot in the network order (1 = top)")
      .addStringOption((o) =>
        o.setName("group").setDescription("Synced group").setRequired(true).setAutocomplete(true),
      )
      .addIntegerOption((o) =>
        o.setName("position").setDescription("1 is highest").setRequired(true).setMinValue(1).setMaxValue(250),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("bind")
      .setDescription("Bind an ACE group to an existing role here (creates the global sync if needed)")
      .addStringOption((o) =>
        o.setName("group").setDescription("ACE group whose members wear the role").setRequired(true).setAutocomplete(true),
      )
      .addRoleOption((o) =>
        o.setName("role").setDescription("Existing role in this server").setRequired(true),
      ),
  );

const mod = new SlashCommandBuilder()
  .setName("mod")
  .setDescription("Discord moderation with MariaDB case logging")
  .addSubcommand((s) =>
    s
      .setName("ban")
      .setDescription("Ban a member")
      .addUserOption(user)
      .addStringOption(reason)
      .addIntegerOption((o) =>
        o
          .setName("delete_days")
          .setDescription("Delete recent messages")
          .setMinValue(0)
          .setMaxValue(7),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("unban")
      .setDescription("Unban a Discord user ID")
      .addStringOption((o) =>
        o
          .setName("user_id")
          .setDescription("Discord user ID")
          .setRequired(true),
      )
      .addStringOption(reason),
  )
  .addSubcommand((s) =>
    s
      .setName("kick")
      .setDescription("Kick a member")
      .addUserOption(user)
      .addStringOption(reason),
  )
  .addSubcommand((s) =>
    s
      .setName("timeout")
      .setDescription("Timeout a member")
      .addUserOption(user)
      .addIntegerOption((o) =>
        o
          .setName("minutes")
          .setDescription("0 removes timeout")
          .setRequired(true)
          .setMinValue(0)
          .setMaxValue(40320),
      )
      .addStringOption(reason),
  )
  .addSubcommand((s) =>
    s
      .setName("warn")
      .setDescription("Warn a member and record a case")
      .addUserOption(user)
      .addStringOption(reason),
  )
  .addSubcommand((s) =>
    s
      .setName("purge")
      .setDescription("Delete recent messages")
      .addIntegerOption((o) =>
        o
          .setName("count")
          .setDescription("Messages to delete")
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(100),
      )
      .addStringOption(reason),
  );

const server = new SlashCommandBuilder()
  .setName("server")
  .setDescription("Control live Florida Bay state")
  .addSubcommand((s) =>
    s.setName("status").setDescription("Show bot, database, and FiveM health"),
  )
  .addSubcommand((s) =>
    s
      .setName("aop")
      .setDescription("Set the area of play")
      .addStringOption((o) =>
        o
          .setName("value")
          .setDescription("AOP label")
          .setRequired(true)
          .setMaxLength(60),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("peacetime")
      .setDescription("Set peacetime")
      .addBooleanOption((o) =>
        o
          .setName("enabled")
          .setDescription("Peacetime state")
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("announce")
      .setDescription("Send an in-game announcement")
      .addStringOption((o) =>
        o
          .setName("message")
          .setDescription("Announcement")
          .setRequired(true)
          .setMaxLength(300),
      ),
  );

const protectrole = new SlashCommandBuilder()
  .setName("protectrole")
  .setDescription("Guard sensitive Discord roles")
  .addSubcommand((s) =>
    s
      .setName("add")
      .setDescription("Protect a role")
      .addRoleOption((o) =>
        o.setName("role").setDescription("Protected role").setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("remove")
      .setDescription("Stop protecting a role")
      .addRoleOption((o) =>
        o.setName("role").setDescription("Protected role").setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s.setName("list").setDescription("List protected roles"),
  );

const role = new SlashCommandBuilder()
  .setName("role")
  .setDescription("Assign or unassign Discord roles in the main server")
  .addSubcommand((s) =>
    s
      .setName("assign")
      .setDescription("Assign a role to a main-server member")
      .addUserOption((o) =>
        o.setName("member").setDescription("Member receiving the role").setRequired(true),
      )
      .addRoleOption((o) =>
        o.setName("role").setDescription("Role to assign").setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("unassign")
      .setDescription("Remove a role from a main-server member")
      .addUserOption((o) =>
        o.setName("member").setDescription("Member losing the role").setRequired(true),
      )
      .addRoleOption((o) =>
        o.setName("role").setDescription("Role to remove").setRequired(true),
      ),
  );

const botguard = new SlashCommandBuilder()
  .setName("botguard")
  .setDescription("Network bot admission and anti-nuke controls")
  .addSubcommand((s) =>
    s
      .setName("allow-bot")
      .setDescription("Allow a bot application network-wide")
      .addStringOption((o) =>
        o.setName("bot_id").setDescription("Bot user ID").setRequired(true),
      )
      .addStringOption((o) =>
        o.setName("label").setDescription("Friendly name"),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("deny-bot")
      .setDescription("Remove an allowed bot")
      .addStringOption((o) =>
        o.setName("bot_id").setDescription("Bot user ID").setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("trust-user")
      .setDescription("Allow a user to add approved bots")
      .addUserOption(user),
  )
  .addSubcommand((s) =>
    s
      .setName("trust-role")
      .setDescription("Allow a role to add approved bots")
      .addRoleOption((o) =>
        o.setName("role").setDescription("Trusted role").setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("untrust-user")
      .setDescription("Remove a trusted bot adder")
      .addUserOption(user),
  )
  .addSubcommand((s) =>
    s
      .setName("untrust-role")
      .setDescription("Remove a trusted bot-adder role")
      .addRoleOption((o) =>
        o.setName("role").setDescription("Trusted role").setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("exempt-add")
      .setDescription("Exempt an account from automated security")
      .addUserOption(user)
      .addStringOption(reason),
  )
  .addSubcommand((s) =>
    s
      .setName("exempt-remove")
      .setDescription("Remove a security exemption")
      .addUserOption(user),
  )
  .addSubcommand((s) =>
    s
      .setName("sweep")
      .setDescription("Remove unapproved bots from this server"),
  )
  .addSubcommand((s) =>
    s.setName("list").setDescription("Show Bot Guard policy"),
  );

const ticket = new SlashCommandBuilder()
  .setName("ticket")
  .setDescription("Open and manage support tickets")
  .addSubcommand((s) =>
    s
      .setName("open")
      .setDescription("Open a private support channel")
      .addStringOption((o) =>
        o
          .setName("type")
          .setDescription("Ticket category")
          .setRequired(true)
          .setAutocomplete(true),
      ),
  )
  .addSubcommand((s) => s.setName("mine").setDescription("List your tickets"))
  .addSubcommand((s) =>
    s.setName("claim").setDescription("Claim or release the ticket in this channel")
      .addBooleanOption((o) => o.setName("claimed").setDescription("True claims; false releases")),
  )
  .addSubcommand((s) =>
    s
      .setName("close")
      .setDescription("Close the ticket in this channel")
      .addStringOption(reason),
  )
  .addSubcommand((s) => s.setName("request-close").setDescription("Ask staff to close this ticket").addStringOption(reason))
  .addSubcommand((s) => s.setName("transfer").setDescription("Transfer the ticket to another staff member").addUserOption(user))
  .addSubcommand((s) => s.setName("add").setDescription("Add a participant to this ticket").addUserOption(user))
  .addSubcommand((s) => s.setName("remove").setDescription("Remove a participant from this ticket").addUserOption(user))
  .addSubcommand((s) => s.setName("priority").setDescription("Change ticket priority")
    .addStringOption((o) => o.setName("level").setDescription("Priority").setRequired(true).setAutocomplete(true)).addStringOption(reason))
  .addSubcommand((s) => s.setName("move").setDescription("Move the ticket to another category")
    .addStringOption((o) => o.setName("type").setDescription("Ticket category").setRequired(true).setAutocomplete(true)))
  .addSubcommand((s) => s.setName("rename").setDescription("Rename this ticket channel")
    .addStringOption((o) => o.setName("name").setDescription("New channel name").setRequired(true).setMaxLength(80)))
  .addSubcommand((s) => s.setName("note").setDescription("Add a private staff note")
    .addStringOption((o) => o.setName("text").setDescription("Note text").setRequired(true).setMaxLength(1000)))
  .addSubcommand((s) => s.setName("notes").setDescription("View private staff notes"))
  .addSubcommand((s) => s.setName("reopen").setDescription("Reopen a closed ticket")
    .addIntegerOption((o) => o.setName("id").setDescription("Ticket number").setRequired(true).setMinValue(1)))
  .addSubcommand((s) => s.setName("transcript").setDescription("Open the hosted ticket transcript")
    .addIntegerOption((o) => o.setName("id").setDescription("Ticket number; current channel if blank").setMinValue(1)))
  .addSubcommand((s) =>
    s.setName("list").setDescription("List open support tickets"),
  );

const support = new SlashCommandBuilder()
  .setName("support")
  .setDescription("Configure the ticket system")
  .addSubcommand((s) => s.setName("panel").setDescription("Post or move the ticket panel")
    .addChannelOption((o) => o.setName("channel").setDescription("Panel channel").setRequired(true)))
  .addSubcommand((s) => s.setName("config").setDescription("Show ticket configuration"))
  .addSubcommand((s) => s.setName("category").setDescription("Set a Discord category for a ticket type")
    .addStringOption((o) => o.setName("type").setDescription("Ticket type or all").setRequired(true).setAutocomplete(true))
    .addChannelOption((o) => o.setName("category").setDescription("Discord category").setRequired(true)))
  .addSubcommand((s) => s.setName("role").setDescription("Add or remove a support role")
    .addStringOption((o) => o.setName("type").setDescription("Ticket type or all").setRequired(true).setAutocomplete(true))
    .addRoleOption((o) => o.setName("role").setDescription("Support role").setRequired(true))
    .addStringOption((o) => o.setName("level").setDescription("Access level").setRequired(true).addChoices({ name: "Support", value: "support" }, { name: "Manager", value: "manager" }))
    .addStringOption((o) => o.setName("mode").setDescription("Add or remove").setRequired(true).addChoices({ name: "Add", value: "add" }, { name: "Remove", value: "remove" })))
  .addSubcommand((s) => s.setName("limit").setDescription("Set ticket limits")
    .addIntegerOption((o) => o.setName("max_open").setDescription("Maximum open tickets per user").setRequired(true).setMinValue(1).setMaxValue(10))
    .addIntegerOption((o) => o.setName("cooldown_seconds").setDescription("Seconds between new tickets").setRequired(true).setMinValue(0).setMaxValue(86400)));

const vmenu = new SlashCommandBuilder()
  .setName("vmenu")
  .setDescription("Manage vMenu permissions for ACE groups")
  .addSubcommand((s) => s.setName("permission").setDescription("Grant, deny, or remove a vMenu permission")
    .addStringOption((o) => o.setName("group").setDescription("ACE group").setRequired(true).setAutocomplete(true))
    .addStringOption((o) => o.setName("permission").setDescription("vMenu permission object").setRequired(true))
    .addStringOption((o) => o.setName("mode").setDescription("Permission mode").setRequired(true).addChoices({ name: "Allow", value: "allow" }, { name: "Deny", value: "deny" }, { name: "Remove", value: "remove" })))
  .addSubcommand((s) => s.setName("bundle").setDescription("Apply or remove a vMenu bundle")
    .addStringOption((o) => o.setName("group").setDescription("ACE group").setRequired(true).setAutocomplete(true))
    .addStringOption((o) => o.setName("bundle").setDescription("player, staff, or full").setRequired(true).addChoices({ name: "Player", value: "player" }, { name: "Staff", value: "staff" }, { name: "Full", value: "full" }))
    .addStringOption((o) => o.setName("mode").setDescription("Grant or remove").setRequired(true).addChoices({ name: "Grant", value: "grant" }, { name: "Remove", value: "remove" })))
  .addSubcommand((s) => s.setName("show").setDescription("Show a group's vMenu permissions")
    .addStringOption((o) => o.setName("group").setDescription("ACE group").setRequired(true).setAutocomplete(true)))
  .addSubcommand((s) => s.setName("catalog").setDescription("List vMenu permissions and bundles"));

const invite = new SlashCommandBuilder()
  .setName("invite")
  .setDescription("Get the link to add this bot to a server with Administrator");

const join = new SlashCommandBuilder()
  .setName("join")
  .setDescription("Join any Florida Bay network server")
  .addStringOption((o) =>
    o.setName("server").setDescription("Network server to join").setRequired(true).setAutocomplete(true),
  )
  .addUserOption((o) =>
    o.setName("user").setDescription("Add this authorized member instead (needs fbrp.network.join.others)"),
  );

const help = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Show all commands, descriptions, and required permissions")
  .addStringOption((o) => o.setName("command").setDescription("Optional command name to filter"));

const globalUser = (option) =>
  option.setName("user").setDescription("Member").setRequired(true);
const globalReason = (required = true) => (option) =>
  option.setName("reason").setDescription("Reason").setMaxLength(300).setRequired(required);

const global = new SlashCommandBuilder()
  .setName("global")
  .setDescription("Manage a member across every Florida Bay Discord server")
  .addSubcommand((s) =>
    s.setName("warn").setDescription("Warn a member on a network-wide record")
      .addUserOption(globalUser).addStringOption(globalReason()),
  )
  .addSubcommand((s) =>
    s.setName("timeout").setDescription("Time a member out in every Florida Bay server")
      .addUserOption(globalUser)
      .addStringOption((o) => o.setName("duration").setDescription("e.g. 10m, 2h, 7d (max 28d)").setRequired(true))
      .addStringOption(globalReason()),
  )
  .addSubcommand((s) =>
    s.setName("untimeout").setDescription("Lift a member's timeout in every Florida Bay server")
      .addUserOption(globalUser).addStringOption(globalReason(false)),
  )
  .addSubcommand((s) =>
    s.setName("kick").setDescription("Kick a member from every Florida Bay server")
      .addUserOption(globalUser).addStringOption(globalReason()),
  )
  .addSubcommand((s) =>
    s.setName("ban").setDescription("Ban a member from every Florida Bay server (and servers added later)")
      .addUserOption(globalUser)
      .addStringOption(globalReason())
      .addStringOption((o) => o.setName("duration").setDescription("e.g. 7d; empty = permanent"))
      .addIntegerOption((o) => o.setName("delete_days").setDescription("Delete message history (days)").setMinValue(0).setMaxValue(7))
      .addBooleanOption((o) => o.setName("game").setDescription("Also ban the linked game account through EasyAdmin"))
      .addBooleanOption((o) => o.setName("alts").setDescription("Also ban alt accounts linked by game identifiers/IP (default: yes)")),
  )
  .addSubcommand((s) =>
    s.setName("blacklist").setDescription("Ban from every other server and restrict to support in the main server")
      .addUserOption(globalUser).addStringOption(globalReason()),
  )
  .addSubcommand((s) =>
    s.setName("unblacklist").setDescription("Lift a global blacklist (other servers are unbanned, main roles are not restored)")
      .addStringOption((o) => o.setName("user_id").setDescription("User ID").setRequired(true))
      .addStringOption(globalReason(false)),
  )
  .addSubcommand((s) =>
    s.setName("unban").setDescription("Lift a network-wide ban")
      .addStringOption((o) => o.setName("user_id").setDescription("User ID").setRequired(true))
      .addStringOption(globalReason(false))
      .addBooleanOption((o) => o.setName("game").setDescription("Also lift the linked game ban")),
  )
  .addSubcommand((s) =>
    s.setName("game-unban").setDescription("Lift an EasyAdmin game ban by its Florida Bay case ID")
      .addStringOption((o) => o.setName("case_id").setDescription("Florida Bay case ID, such as FB-660754").setRequired(true))
      .addStringOption(globalReason(false)),
  )
  .addSubcommand((s) =>
    s.setName("invite").setDescription("Invite a member to every Florida Bay network server")
      .addUserOption(globalUser),
  )
  .addSubcommand((s) =>
    s.setName("restore").setDescription("Invite a former member back and restore their roles in each server")
      .addStringOption((o) => o.setName("user_id").setDescription("Former member's Discord user ID").setRequired(true)),
  )
  .addSubcommand((s) =>
    s.setName("lookup").setDescription("See which Florida Bay servers a member is in and their network record")
      .addUserOption(globalUser),
  )
  .addSubcommand((s) =>
    s.setName("rolestrip").setDescription("Community Director+: remove every network role and ACE group, with a saved snapshot")
      .addUserOption(globalUser).addStringOption(globalReason()),
  )
  .addSubcommand((s) =>
    s.setName("unrolestrip").setDescription("Community Director+: restore a role-strip snapshot across the network")
      .addUserOption(globalUser).addStringOption(globalReason(false)),
  )
  .addSubcommand((s) =>
    s.setName("nick").setDescription("Set your nickname in every Florida Bay network server")
      .addStringOption((o) => o.setName("nickname").setDescription("Your new network nickname").setRequired(true).setMinLength(1).setMaxLength(32)),
  );

const blacklist = new SlashCommandBuilder()
  .setName("blacklist")
  .setDescription("Globally blacklist a member across the Florida Bay network")
  .addUserOption(globalUser)
  .addStringOption(globalReason());

const acelist = new SlashCommandBuilder()
  .setName("acelist")
  .setDescription("List every possible ACE permission: vMenu, EasyAdmin, and Florida Bay")
  .addStringOption((o) =>
    o
      .setName("source")
      .setDescription("Which permissions to list (default: all)")
      .addChoices(
        { name: "Everything", value: "all" },
        { name: "vMenu", value: "vmenu" },
        { name: "EasyAdmin", value: "easyadmin" },
        { name: "Florida Bay", value: "fbrp" },
      ),
  )
  .addStringOption((o) =>
    o.setName("search").setDescription("Filter by name, object, or description").setMaxLength(60),
  );

const userinfo = new SlashCommandBuilder()
  .setName("userinfo")
  .setDescription("Investigate a member: game and Discord records, servers and roles, and linked alt accounts")
  .addUserOption(user);

const caseLookup = new SlashCommandBuilder()
  .setName("case")
  .setDescription("Look up any Florida Bay case ID")
  .addSubcommand((s) =>
    s.setName("lookup").setDescription("Display the complete record for a moderation or Internal Affairs case")
      .addStringOption((o) => o.setName("case_id").setDescription("Case ID, e.g. FB-123456 or IA-2026-0001").setRequired(true).setMaxLength(32)),
  );

const blacklistedserver = new SlashCommandBuilder()
  .setName("blacklistedserver")
  .setDescription("Manage Discord servers that should be flagged during member investigations")
  .addSubcommand((s) =>
    s.setName("add").setDescription("Add a Discord server to the investigation blacklist")
      .addStringOption((o) => o.setName("server_id").setDescription("Discord server ID").setRequired(true).setMinLength(15).setMaxLength(24))
      .addStringOption((o) => o.setName("name").setDescription("Server name shown in warnings").setRequired(true).setMaxLength(100))
      .addStringOption((o) => o.setName("reason").setDescription("Why membership in this server is concerning").setRequired(true).setMaxLength(300)),
  )
  .addSubcommand((s) =>
    s.setName("edit").setDescription("Edit a blacklisted Discord server")
      .addStringOption((o) => o.setName("server_id").setDescription("Discord server ID").setRequired(true).setMinLength(15).setMaxLength(24))
      .addStringOption((o) => o.setName("name").setDescription("New server name").setMaxLength(100))
      .addStringOption((o) => o.setName("reason").setDescription("New blacklist reason").setMaxLength(300)),
  )
  .addSubcommand((s) =>
    s.setName("remove").setDescription("Remove a Discord server from the investigation blacklist")
      .addStringOption((o) => o.setName("server_id").setDescription("Discord server ID").setRequired(true).setMinLength(15).setMaxLength(24)),
  )
  .addSubcommand((s) => s.setName("list").setDescription("List blacklisted Discord servers"));

const office = new SlashCommandBuilder()
  .setName("office")
  .setDescription("Assign organization or staff office voice channels")
  .addSubcommand((s) =>
    s
      .setName("set")
      .setDescription("Assign an office owner")
      .addChannelOption((o) =>
        o
          .setName("channel")
          .setDescription("Office voice channel")
          .setRequired(true),
      )
      .addUserOption((o) =>
        o.setName("member").setDescription("Office owner").setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("clear")
      .setDescription("Remove an office assignment")
      .addChannelOption((o) =>
        o
          .setName("channel")
          .setDescription("Office voice channel")
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s.setName("list").setDescription("List office assignments"),
  );

const security = new SlashCommandBuilder()
  .setName("security")
  .setDescription("Anti-nuke, anti-raid, anti-spam and lockdown controls")
  .addSubcommand((s) => s.setName("status").setDescription("Show protections, lockdowns and the last 24 hours of events"))
  .addSubcommand((s) =>
    s
      .setName("exempt-add")
      .setDescription("Owner-only: bypass automated security globally or in this server")
      .addUserOption((o) => o.setName("member").setDescription("Trusted account").setRequired(true))
      .addStringOption((o) =>
        o
          .setName("scope")
          .setDescription("Where the bypass applies")
          .setRequired(true)
          .addChoices(
            { name: "Every network server", value: "global" },
            { name: "This server only", value: "server" },
          ),
      )
      .addStringOption((o) => o.setName("reason").setDescription("Why this account is trusted").setRequired(true).setMaxLength(200)),
  )
  .addSubcommand((s) =>
    s
      .setName("exempt-remove")
      .setDescription("Owner-only: remove an automated-security bypass")
      .addUserOption((o) => o.setName("member").setDescription("Account to remove").setRequired(true))
      .addStringOption((o) =>
        o
          .setName("scope")
          .setDescription("Bypass to remove")
          .setRequired(true)
          .addChoices(
            { name: "Every network server", value: "global" },
            { name: "This server only", value: "server" },
          ),
      ),
  )
  .addSubcommand((s) => s.setName("exempt-list").setDescription("Owner-only: list global and server-specific bypasses"))
  .addSubcommand((s) =>
    s
      .setName("config")
      .setDescription("Change a network-wide security setting")
      .addStringOption((o) =>
        o
          .setName("setting")
          .setDescription("Setting to change")
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addStringOption((o) => o.setName("value").setDescription("on/off, a number, or an option; leave blank to see the current value").setMaxLength(20)),
  )
  .addSubcommand((s) =>
    s
      .setName("lockdown")
      .setDescription("Lock this server (or the whole network) down")
      .addStringOption(reason)
      .addIntegerOption((o) => o.setName("minutes").setDescription("Auto-unlock after this many minutes (0 = manual)").setMinValue(0).setMaxValue(1440))
      .addBooleanOption((o) => o.setName("network").setDescription("Lock every network server down")),
  )
  .addSubcommand((s) =>
    s
      .setName("unlock")
      .setDescription("Lift a lockdown")
      .addStringOption((o) => o.setName("reason").setDescription("Reason recorded in the audit log").setMaxLength(300))
      .addBooleanOption((o) => o.setName("network").setDescription("Unlock every network server")),
  )
  .addSubcommand((s) =>
    s
      .setName("events")
      .setDescription("Recent security events")
      .addBooleanOption((o) => o.setName("all_servers").setDescription("Include every network server")),
  )
  .addSubcommand((s) => s.setName("health").setDescription("Check whether the bot can stop a nuke in every network server"))
  .addSubcommand((s) => s.setName("offenders").setDescription("Accounts on the network-wide anti-nuke offender list"))
  .addSubcommand((s) =>
    s
      .setName("pardon")
      .setDescription("Owner-only: lift an anti-nuke offender (unban, end quarantine, restore roles)")
      .addUserOption((o) => o.setName("member").setDescription("Offender to pardon").setRequired(true)),
  );

const backup = new SlashCommandBuilder()
  .setName("backup")
  .setDescription("Owner-only: back up and restore every Florida Bay Discord server")
  .addSubcommand((s) =>
    s
      .setName("save")
      .setDescription("Save a backup of EVERY network server (roles, channels, permissions, member roles)")
      .addStringOption((o) => o.setName("label").setDescription("Optional note for this backup").setMaxLength(100)),
  )
  .addSubcommand((s) => s.setName("list").setDescription("List saved backups"))
  .addSubcommand((s) =>
    s
      .setName("restore")
      .setDescription("Restore EVERY network server from a backup (additive; preview unless confirm is true)")
      .addIntegerOption((o) => o.setName("backup_id").setDescription("Backup ID (default: newest)").setMinValue(1))
      .addBooleanOption((o) => o.setName("confirm").setDescription("true = apply the restore; otherwise only preview"))
      .addBooleanOption((o) => o.setName("members").setDescription("Also re-give lost roles to members (default: yes)")),
  );

const welcome = new SlashCommandBuilder()
  .setName("welcome")
  .setDescription("Owner-only: create or refresh the welcome channel with the verification guide")
  .addChannelOption((o) =>
    o.setName("category").setDescription("Category to put the welcome channel in (default: the configured one)").addChannelTypes(ChannelType.GuildCategory),
  );

const github = new SlashCommandBuilder()
  .setName("github")
  .setDescription("Owner-only: save the whole project to the private GitHub repository")
  .addSubcommand((s) => s.setName("sync").setDescription("Save the code, website, game server and database to GitHub now"))
  .addSubcommand((s) => s.setName("status").setDescription("Show the last GitHub sync"));

const verification = new SlashCommandBuilder()
  .setName("verification")
  .setDescription("Owner-only: website verification status and overrides")
  .addSubcommand((s) =>
    s.setName("status").setDescription("Show verification totals, or one member's status")
      .addUserOption((o) => o.setName("user").setDescription("Member to inspect")),
  )
  .addSubcommand((s) =>
    s.setName("grant").setDescription("Verify a member by hand and give the verified role")
      .addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true)),
  )
  .addSubcommand((s) =>
    s.setName("revoke").setDescription("Remove a member's verification and role")
      .addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true)),
  );

const orgbank = new SlashCommandBuilder()
  .setName("orgbank")
  .setDescription("Organization wallets: balances, ledger and management")
  .addSubcommand((s) =>
    s
      .setName("balance")
      .setDescription("Show an organization's wallet")
      .addStringOption((o) => o.setName("organization").setDescription("Organization slug (defaults to yours)").setMaxLength(40)),
  )
  .addSubcommand((s) =>
    s
      .setName("ledger")
      .setDescription("Recent wallet transactions")
      .addStringOption((o) => o.setName("organization").setDescription("Organization slug (defaults to yours)").setMaxLength(40)),
  )
  .addSubcommand((s) =>
    s
      .setName("adjust")
      .setDescription("Add or remove money from a wallet")
      .addStringOption((o) => o.setName("organization").setDescription("Organization slug").setRequired(true).setMaxLength(40))
      .addIntegerOption((o) => o.setName("amount").setDescription("Positive to add, negative to remove").setRequired(true).setMinValue(-100000000).setMaxValue(100000000))
      .addStringOption((o) => o.setName("reason").setDescription("Reason recorded in the ledger").setRequired(true).setMaxLength(160)),
  )
  .addSubcommand((s) =>
    s
      .setName("leader")
      .setDescription("Grant or remove spending (leader) access")
      .addStringOption((o) => o.setName("organization").setDescription("Organization slug").setRequired(true).setMaxLength(40))
      .addUserOption((o) => o.setName("member").setDescription("Discord member").setRequired(true))
      .addBooleanOption((o) => o.setName("leader").setDescription("true to grant, false to remove").setRequired(true)),
  )
  .addSubcommand((s) =>
    s
      .setName("transfer")
      .setDescription("Send money from your organization's wallet to another organization")
      .addStringOption((o) => o.setName("to").setDescription("Receiving organization slug").setRequired(true).setMaxLength(40))
      .addIntegerOption((o) => o.setName("amount").setDescription("Amount in dollars").setRequired(true).setMinValue(1).setMaxValue(100000000))
      .addStringOption((o) => o.setName("memo").setDescription("What the money is for (shown in both ledgers)").setRequired(true).setMaxLength(120))
      .addStringOption((o) => o.setName("organization").setDescription("Sending organization slug (defaults to yours)").setMaxLength(40)),
  )
  .addSubcommand((s) =>
    s
      .setName("roster")
      .setDescription("Members, ranks and duty hours this week")
      .addStringOption((o) => o.setName("organization").setDescription("Organization slug (defaults to yours)").setMaxLength(40)),
  );

const cocMember = (option) => option.setName("member").setDescription("Chain member").setRequired(true);
const cocProfileOptions = (subcommand, { member = true, title = true, color = true } = {}) => {
  if (member) subcommand.addUserOption(cocMember);
  if (title) subcommand.addStringOption((o) => o.setName("title").setDescription("Rank/title; use - to reset to the roster rank").setMaxLength(100));
  subcommand
    .addStringOption((o) => o.setName("positions").setDescription("Positions separated by |; use - to clear").setMaxLength(900))
    .addStringOption((o) => o.setName("assistants").setDescription("Assistant mentions or Discord IDs; use - to clear").setMaxLength(500));
  if (color) subcommand.addStringOption((o) => o.setName("color").setDescription("Card hex color, e.g. #43E8D8; use - to reset"));
  return subcommand;
};

const coc = new SlashCommandBuilder()
  .setName("coc")
  .setDescription("Create and manage the live chain of command")
  .addSubcommand((s) => s.setName("newchain").setDescription("Publish a new live chain from the staff roster")
    .addChannelOption((o) => o.setName("channel").setDescription("Destination; defaults to the configured chain channel").addChannelTypes(ChannelType.GuildText))
    .addStringOption((o) => o.setName("title").setDescription("Board title").setMaxLength(100)))
  .addSubcommand((s) => s.setName("relocatecoc").setDescription("Move the live chain to another channel")
    .addChannelOption((o) => o.setName("channel").setDescription("New chain-of-command channel").setRequired(true).addChannelTypes(ChannelType.GuildText)))
  .addSubcommand((s) => cocProfileOptions(s.setName("adduser").setDescription("Add a member card to the chain")))
  .addSubcommand((s) => cocProfileOptions(s.setName("updateuser").setDescription("Update a member's chain card")))
  .addSubcommand((s) => cocProfileOptions(s.setName("updateself").setDescription("Update your own positions and assistants"), { member: false, title: false, color: false }))
  .addSubcommand((s) => s.setName("removeuser").setDescription("Remove a member from the chain").addUserOption(cocMember))
  .addSubcommand((s) => s.setName("reorder").setDescription("Move a member to a new chain position")
    .addUserOption(cocMember)
    .addIntegerOption((o) => o.setName("position").setDescription("New position (1 is highest)").setRequired(true).setMinValue(1).setMaxValue(250)))
  .addSubcommand((s) => s.setName("getorder").setDescription("Show the current chain order"))
  .addSubcommand((s) => s.setName("updatecoc").setDescription("Import new roster members and refresh the live board"));

const giveawayId = (o) => o.setName("id").setDescription("Giveaway ID").setRequired(true).setMinValue(1);

const giveaway = new SlashCommandBuilder()
  .setName("giveaway")
  .setDescription("Co-Owner and above: run giveaways with an Enter button")
  .addSubcommand((s) =>
    s
      .setName("start")
      .setDescription("Start a giveaway")
      .addStringOption((o) => o.setName("prize").setDescription("What is being given away").setRequired(true).setMaxLength(200))
      .addStringOption((o) => o.setName("duration").setDescription("How long it runs, e.g. 30m, 2h, 1d, 1d12h").setRequired(true).setMaxLength(20))
      .addIntegerOption((o) => o.setName("winners").setDescription("Number of winners (default 1)").setMinValue(1).setMaxValue(20))
      .addStringOption((o) => o.setName("description").setDescription("Extra details shown on the giveaway").setMaxLength(500))
      .addChannelOption((o) => o.setName("channel").setDescription("Where to post it (default: this channel)").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
  )
  .addSubcommand((s) => s.setName("end").setDescription("End a giveaway now and draw the winners").addIntegerOption(giveawayId))
  .addSubcommand((s) =>
    s
      .setName("reroll")
      .setDescription("Draw new winners for an ended giveaway")
      .addIntegerOption(giveawayId)
      .addIntegerOption((o) => o.setName("count").setDescription("How many new winners (default: original count)").setMinValue(1).setMaxValue(20)),
  )
  .addSubcommand((s) => s.setName("cancel").setDescription("Cancel a running giveaway without drawing").addIntegerOption(giveawayId))
  .addSubcommand((s) => s.setName("list").setDescription("List running giveaways"));

export const commands = [
  orgbank,
  welcome,
  github,
  verification,
  backup,
  ace,
  headtag,
  giveaway,
  coc,
  organization,
  radio,
  network,
  globalsync,
  mod,
  server,
  role,
  protectrole,
  botguard,
  security,
  ticket,
  support,
  vmenu,
  help,
  global,
  blacklist,
  blacklistedserver,
  acelist,
  userinfo,
  caseLookup,
  office,
  join,
  invite,
].map((command) => command.toJSON());
