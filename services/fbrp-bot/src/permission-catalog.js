/**
 * Every ACE object Florida Bay understands: the bot's own control-plane permissions, the in-game
 * fbrp_core permissions, every vMenu permission (vMenu config/permissions.cfg) and every EasyAdmin
 * 7.x permission (EasyAdmin docs/permissions.md plus its Discord bot commands).
 */
const ace = (category, object, label, description) => ({ category, object, label, description });

const FLORIDA_BAY = [
  ace("Florida Bay · Control", "fbrp", "Everything in Florida Bay", "Grants every fbrp.* permission below, in Discord and in game."),
  ace("Florida Bay · Control", "fbrp.perms.manage", "Permission management", "Create ACE groups, change their permissions and members, bind roles (/ace, /vmenu, /acelist)."),
  ace("Florida Bay · Control", "fbrp.network.manage", "Network management", "Register network servers and manage global role syncs (/network, /globalsync)."),
  ace("Florida Bay · Control", "fbrp.network.join", "Join network servers", "Get a single-use invite to any registered network server with /join."),
  ace("Florida Bay · Control", "fbrp.network.join.others", "Send network invites", "Use /join user:<member> to DM someone an invite to any network server."),
  ace("Florida Bay · Control", "fbrp.ops", "Server operations", "Change AOP and peacetime and send in-game announcements from Discord (/server)."),
  ace("Florida Bay · Discord", "fbrp.discord.mod", "Discord moderation", "Ban, unban, kick, time out, warn and purge in one server (/mod)."),
  ace("Florida Bay · Discord", "fbrp.discord.mod.ban", "Discord ban", "Ban a member in one server with /mod ban."),
  ace("Florida Bay · Discord", "fbrp.discord.mod.kick", "Discord kick", "Kick a member from one server with /mod kick."),
  ace("Florida Bay · Discord", "fbrp.roles.protect", "Protected roles", "Protect roles and choose who may manage them (/protectrole)."),
  ace("Florida Bay · Discord", "fbrp.security.manage", "Bot Guard & anti-nuke", "Approve bots, trusted adders and exemptions (/botguard); anti-nuke, anti-raid, anti-spam and lockdowns (/security)."),
  ace("Florida Bay · Discord", "fbrp.office.manage", "Office management", "Assign and clear voice-office owners (/office)."),
  ace("Florida Bay · Global moderation", "fbrp.global", "All global moderation", "Use every /global command across every Florida Bay server."),
  ace("Florida Bay · Global moderation", "fbrp.global.warn", "Global warn", "Warn a member on their network-wide record with /global warn."),
  ace("Florida Bay · Global moderation", "fbrp.global.timeout", "Global timeout", "Time out, and lift timeouts, in every network server."),
  ace("Florida Bay · Global moderation", "fbrp.global.kick", "Global kick", "Kick a member from every network server."),
  ace("Florida Bay · Global moderation", "fbrp.global.ban", "Global ban", "Ban a member from every network server, optionally with their game account."),
  ace("Florida Bay · Global moderation", "fbrp.global.blacklist", "Global blacklist", "Ban from every other server and restrict the member to support in the main server; lift it again."),
  ace("Florida Bay · Global moderation", "fbrp.global.unban", "Global unban", "Lift a network-wide ban, optionally with the linked game ban."),
  ace("Florida Bay · Global moderation", "fbrp.global.invite", "Global invite", "Invite a member to every registered network Discord with /global invite."),
  ace("Florida Bay · Global moderation", "fbrp.global.restore", "Global restore", "Invite a former member back to their previous network Discords and restore their saved roles."),
  ace("Florida Bay · Global moderation", "fbrp.global.lookup", "Global lookup", "See which network servers a member is in and their global case history."),
  ace("Florida Bay · Roleplay", "fbrp.headtags.manage", "Headtag management", "Create, delete, grant and revoke headtags and gang tags (/headtag)."),
  ace("Florida Bay · Roleplay", "fbrp.organizations.manage", "Organization management", "Create organizations, manage their rosters and view duty hours (/organization)."),
  ace("Florida Bay · Roleplay", "fbrp.radio.manage", "Radio management", "Create public or organization-duty radio channels with /radio or the web panel."),
  ace("Florida Bay · Staff", "fbrp.staff.assign", "Assign staff ranks", "Use /staff add and /staff remove to place members into staff rank ACE groups below your own."),
  ace("Florida Bay · Staff", "fbrp.staff.manage", "Staff duty management", "View staff hours and the leaderboard, and force members off duty."),
  ace("Florida Bay · Staff", "fbrp.roster.view", "View staff roster", "View the roster and member profiles (/roster list, /roster profile)."),
  ace("Florida Bay · Staff", "fbrp.roster.manage", "Manage roster members", "Add, remove and update roster members, callsigns, statuses, notes and jobs."),
  ace("Florida Bay · Staff", "fbrp.roster.discipline", "Roster discipline", "Issue and revoke staff warnings and strikes."),
  ace("Florida Bay · Staff", "fbrp.roster.config", "Configure staff roster", "Create and edit roster categories, ranks, rank ACE groups, jobs and role sync."),
  ace("Florida Bay · Staff", "fbrp.tickets", "All ticket access", "View every support ticket, including the open-ticket queue."),
  ace("Florida Bay · Staff", "fbrp.tickets.support", "Ticket support", "Claim, answer, transfer and close support tickets."),
  ace("Florida Bay · Staff", "fbrp.tickets.manage", "Ticket management", "Configure ticket categories, support roles, limits and the panel (/support)."),
  ace("Florida Bay · Staff", "fbrp.investigate", "Investigations", "Cross-system member lookup with /userinfo."),
  ace("Florida Bay · In game", "fbrp.staff", "In-game staff tools", "Use in-game staff tools while clocked in."),
  ace("Florida Bay · In game", "fbrp.aop", "Set AOP in game", "Change the area of play with /aop."),
  ace("Florida Bay · In game", "fbrp.announce", "In-game announcements", "Send server-wide announcements with /announce."),
  ace("Florida Bay · In game", "fbrp.priority", "Priority status", "Change the priority status shown on the HUD with /priority."),
  ace("Florida Bay · In game", "fbrp.police", "Police tools", "Every fbrp.police.* tool: third-eye interactions, /panic, /runplate, GSR tests, the MDT, prison, citations, impounds and spikes."),
  ace("Florida Bay · In game", "fbrp.police.cuff", "Cuff players", "Soft- and hard-cuff, and uncuff, nearby players."),
  ace("Florida Bay · In game", "fbrp.police.arrest", "Arrest players", "Place nearby players under arrest."),
  ace("Florida Bay · In game", "fbrp.police.search", "Search players", "Search visible weapons and check ID."),
  ace("Florida Bay · In game", "fbrp.police.escort", "Escort players", "Escort, seat and unseat restrained players."),
  ace("Florida Bay · In game", "fbrp.civ.restrain", "Civilian restraints", "Zip-tie, blindfold and remove restraints."),
  ace("Florida Bay · Justice", "fbrp.police.mdt", "Police MDT", "Open the /mdt: citizen lookup, records, warrants, BOLOs, plates and the prison roster."),
  ace("Florida Bay · Justice", "fbrp.police.jail", "Book into prison", "Sentence restrained suspects to Bolingbroke from the MDT, third eye or /jail, and release inmates."),
  ace("Florida Bay · Justice", "fbrp.police.cite", "Write citations", "Issue citations from the MDT or third eye."),
  ace("Florida Bay · Justice", "fbrp.police.impound", "Impound vehicles", "Tow away empty vehicles with /impound."),
  ace("Florida Bay · Justice", "fbrp.police.spikes", "Spike strips", "Deploy and pick up spike strips with /spikes."),
  ace("Florida Bay · Justice", "fbrp.staff.jail", "Staff jail", "While clocked in: jail or release anyone from anywhere with /jail and /unjail."),
  ace("Florida Bay · Medical", "fbrp.ems", "EMS tools", "Treat wounds, check injuries, receive medical calls, /respond and /bodycam."),
  ace("Florida Bay · Medical", "fbrp.ems.revive", "Revive patients", "Revive downed players through the third eye."),
  ace("Florida Bay · Medical", "fbrp.staff.revive", "Staff revive", "While clocked in: /revive any player, and revive through the third eye."),
  ace("Florida Bay · Vehicles", "fbrp.vehicles", "Civilian garage", "Spawn civilian vehicles from the F7 garage."),
  ace("Florida Bay · Vehicles", "fbrp.vehicles.leo", "Police vehicles", "Spawn law-enforcement vehicles from the F7 garage."),
  ace("Florida Bay · Vehicles", "fbrp.vehicles.fire", "Fire & EMS vehicles", "Spawn fire and rescue vehicles from the F7 garage."),
  ace("Florida Bay · Vehicles", "fbrp.vehicles.staff", "Staff vehicles", "Spawn staff-only vehicles from the F7 garage."),
];

const EASYADMIN = [
  ace("EasyAdmin · Bundles", "easyadmin", "All of EasyAdmin", "Grants every EasyAdmin permission, including immunity and bot commands."),
  ace("EasyAdmin · Bundles", "easyadmin.player", "All player tools", "Every easyadmin.player.* permission below."),
  ace("EasyAdmin · Bundles", "easyadmin.server", "All server tools", "Every easyadmin.server.* permission below."),
  ace("EasyAdmin · Bundles", "easyadmin.bot", "All bot commands", "Every EasyAdmin Discord bot command."),
  ace("EasyAdmin · Player actions", "easyadmin.player.kick", "Kick players", "Remove a player from the server."),
  ace("EasyAdmin · Player actions", "easyadmin.player.warn", "Warn players", "Issue a warning to a player."),
  ace("EasyAdmin · Player actions", "easyadmin.player.mute", "Mute players", "Mute and unmute a player's chat."),
  ace("EasyAdmin · Player actions", "easyadmin.player.freeze", "Freeze players", "Freeze and unfreeze a player in place."),
  ace("EasyAdmin · Player actions", "easyadmin.player.spectate", "Spectate players", "Follow a player in spectator mode."),
  ace("EasyAdmin · Player actions", "easyadmin.player.slap", "Slap players", "Remove health from a player."),
  ace("EasyAdmin · Player actions", "easyadmin.player.screenshot", "Player screenshots", "Capture a player's screen (uploaded to the configured service)."),
  ace("EasyAdmin · Player actions", "easyadmin.player.teleport.single", "Teleport one player", "Teleport to a player or bring one player to you."),
  ace("EasyAdmin · Player actions", "easyadmin.player.teleport.everyone", "Teleport everyone", "Teleport every player at once."),
  ace("EasyAdmin · Player actions", "easyadmin.player.bucket", "All routing buckets", "Both routing-bucket permissions below."),
  ace("EasyAdmin · Player actions", "easyadmin.player.bucket.join", "Join routing bucket", "Join another player's routing bucket."),
  ace("EasyAdmin · Player actions", "easyadmin.player.bucket.force", "Force routing bucket", "Move a player into a different routing bucket."),
  ace("EasyAdmin · Player actions", "easyadmin.player.allowlist", "Allowlist access", "Join the server while the EasyAdmin allowlist is enabled."),
  ace("EasyAdmin · Bans & reports", "easyadmin.player.ban", "All ban tools", "Every easyadmin.player.ban.* permission below."),
  ace("EasyAdmin · Bans & reports", "easyadmin.player.ban.temporary", "Temporary bans", "Ban a player for a limited time."),
  ace("EasyAdmin · Bans & reports", "easyadmin.player.ban.permanent", "Permanent bans", "Ban a player permanently."),
  ace("EasyAdmin · Bans & reports", "easyadmin.player.ban.view", "View bans", "Open and search the ban list."),
  ace("EasyAdmin · Bans & reports", "easyadmin.player.ban.edit", "Edit bans", "Change a stored ban's reason or length."),
  ace("EasyAdmin · Bans & reports", "easyadmin.player.ban.remove", "Remove bans", "Unban players."),
  ace("EasyAdmin · Bans & reports", "easyadmin.player.reports", "All report tools", "Every easyadmin.player.reports.* permission below."),
  ace("EasyAdmin · Bans & reports", "easyadmin.player.reports.view", "View reports", "Open the player reports list."),
  ace("EasyAdmin · Bans & reports", "easyadmin.player.reports.claim", "Claim reports", "Take ownership of an unclaimed report."),
  ace("EasyAdmin · Bans & reports", "easyadmin.player.reports.process", "Process reports", "Close and delete reports."),
  ace("EasyAdmin · Server", "easyadmin.server.announce", "Server announcements", "Send an announcement to every player."),
  ace("EasyAdmin · Server", "easyadmin.server.chat", "Admin chat", "Use the staff-only admin chat channel."),
  ace("EasyAdmin · Server", "easyadmin.server.cleanup", "All cleanup tools", "Every easyadmin.server.cleanup.* permission below."),
  ace("EasyAdmin · Server", "easyadmin.server.cleanup.cars", "Clean up vehicles", "Delete every vehicle that is not in use."),
  ace("EasyAdmin · Server", "easyadmin.server.cleanup.peds", "Clean up NPCs", "Delete spawned NPCs."),
  ace("EasyAdmin · Server", "easyadmin.server.cleanup.props", "Clean up props", "Delete spawned props (map props are kept)."),
  ace("EasyAdmin · Server", "easyadmin.server.convars", "Edit convars", "Change server convars from EasyAdmin. Use with caution."),
  ace("EasyAdmin · Server", "easyadmin.server.resources.start", "Start resources", "Start server resources."),
  ace("EasyAdmin · Server", "easyadmin.server.resources.stop", "Stop resources", "Stop server resources."),
  ace("EasyAdmin · Server", "easyadmin.server.permissions.read", "View ACE configuration", "View every ACE and principal on the server."),
  ace("EasyAdmin · Server", "easyadmin.server.permissions.write", "Edit ACE configuration", "Add, edit and delete ACEs and principals live."),
  ace("EasyAdmin · Server", "easyadmin.server.shortcut.add", "Add shortcuts", "Use ea_addShortcut (until restart)."),
  ace("EasyAdmin · Server", "easyadmin.server.reminder.add", "Add reminders", "Use ea_addReminder (until restart)."),
  ace("EasyAdmin · Special", "easyadmin.immune", "Moderation immunity", "Cannot be kicked or banned by other staff."),
  ace("EasyAdmin · Special", "easyadmin.anon", "Anonymous actions", "Hide your name in EasyAdmin logs and player messages."),
  ...[
    ["announce", "Announce", "Send an in-game announcement from Discord."],
    ["ban", "Ban", "Ban an in-game player from Discord."],
    ["baninfo", "Ban info", "Look up a ban by its ID from Discord."],
    ["cleanup", "Cleanup", "Run vehicle, ped or prop cleanup from Discord."],
    ["freeze", "Freeze", "Freeze a player from Discord."],
    ["unfreeze", "Unfreeze", "Unfreeze a player from Discord."],
    ["kick", "Kick", "Kick a player from Discord."],
    ["mute", "Mute", "Mute a player from Discord."],
    ["unmute", "Unmute", "Unmute a player from Discord."],
    ["playerinfo", "Player info", "Show a player's details from Discord."],
    ["playerlist", "Player list", "List online players from Discord."],
    ["refreshperms", "Refresh permissions", "Reload Discord-role permissions."],
    ["screenshot", "Screenshot", "Capture a player's screen from Discord."],
    ["slap", "Slap", "Slap a player from Discord."],
    ["unban", "Unban", "Lift a ban from Discord."],
    ["warn", "Warn", "Warn a player from Discord."],
  ].map(([command, label, description]) => ace("EasyAdmin · Discord bot", `easyadmin.bot.${command}`, `Bot: ${label}`, description)),
];

/** One vMenu menu: its .Menu/.All objects plus each individual option. */
const vmenuSection = (category, prefix, menuLabel, options, { menu = true, all = true } = {}) => [
  ...(menu ? [ace(category, `vMenu.${prefix}.Menu`, `Open ${menuLabel}`, `Open the ${menuLabel} submenu. Needed before any option below is visible.`)] : []),
  ...(all ? [ace(category, `vMenu.${prefix}.All`, `All ${menuLabel} options`, `Every ${menuLabel} permission below.`)] : []),
  ...options.map(([key, label, description]) => ace(category, `vMenu.${prefix}.${key}`, label, description)),
];

const WEAPON_NAMES = {
  APPistol: "AP Pistol", BZGas: "BZ Gas", MG: "MG", RPG: "RPG", SMG: "SMG", SMGMk2: "SMG Mk II",
  SNSPistol: "SNS Pistol", SNSPistolMk2: "SNS Pistol Mk II", CombatPDW: "Combat PDW", Pistol50: "Pistol .50",
  StunGunMP: "Stun Gun (MP)", PistolXM3: "WM 29 Pistol", RailgunXM3: "Railgun XM3", EMPLauncher: "Compact EMP Launcher",
  TecPistol: "Tactical SMG (Tec)", GrenadeLauncherSmoke: "Smoke Grenade Launcher",
};
const WEAPONS = "APPistol AdvancedRifle AssaultRifle AssaultRifleMk2 AssaultSMG AssaultShotgun BZGas Ball Bat BattleAxe Bottle BullpupRifle BullpupRifleMk2 BullpupShotgun CarbineRifle CarbineRifleMk2 CombatMG CombatMGMk2 CombatPDW CombatPistol CompactGrenadeLauncher CompactRifle Crowbar Dagger DoubleAction DoubleBarrelShotgun FireExtinguisher Firework Flare FlareGun Flashlight GolfClub Grenade GrenadeLauncher GrenadeLauncherSmoke Gusenberg Hammer Hatchet HeavyPistol HeavyShotgun HeavySniper HeavySniperMk2 HomingLauncher Knife KnuckleDuster MG Machete MachinePistol MarksmanPistol MarksmanRifle MarksmanRifleMk2 MicroSMG MiniSMG Minigun Molotov Musket NightVision Nightstick Parachute PetrolCan PipeBomb Pistol Pistol50 PistolMk2 PoolCue ProximityMine PumpShotgun PumpShotgunMk2 RPG Railgun Revolver RevolverMk2 SMG SMGMk2 SNSPistol SNSPistolMk2 SawnOffShotgun SmokeGrenade SniperRifle Snowball SpecialCarbine SpecialCarbineMk2 StickyBomb StunGun SweeperShotgun SwitchBlade Unarmed VintagePistol Wrench PlasmaPistol PlasmaCarbine PlasmaMinigun StoneHatchet CeramicPistol NavyRevolver HazardCan PericoPistol MilitaryRifle CombatShotgun EMPLauncher HeavyRifle FertilizerCan StunGunMP PrecisionRifle TacticalRifle PistolXM3 CandyCane RailgunXM3 AcidPackage TecPistol BattleRifle SnowLauncher HackingDevice StunRod Newspaper".split(" ");
const weaponName = (key) =>
  WEAPON_NAMES[key] || key.replace(/Mk2$/, " Mk II").replace(/([a-z0-9])([A-Z])/g, "$1 $2");

const VEHICLE_CLASSES = "Compacts Sedans SUVs Coupes Muscle SportsClassic Sports Super Motorcycles OffRoad Industrial Utility Vans Cycles Boats Helicopters Planes Service Emergency Military Commercial Trains OpenWheel".split(" ");
const vehicleClassName = (key) => ({ SUVs: "SUVs", OffRoad: "Off-road", SportsClassic: "Sports classics", OpenWheel: "Open wheel" })[key] || key;

const VMENU = [
  ace("vMenu · Global", "vMenu.Everything", "Every vMenu feature", "Grants every vMenu permission. Overrides everything else in this list."),
  ace("vMenu · Global", "vMenu.Staff", "Staff menu access", "Use vMenu when it is set to staff-only, and count as staff for vMenu features."),
  ace("vMenu · Global", "vMenu.NoClip", "NoClip", "Fly freely through the map with the NoClip key."),
  ace("vMenu · Global", "vMenu.DontKickMe", "Kick immunity", "Cannot be kicked through vMenu."),
  ace("vMenu · Global", "vMenu.DontBanMe", "Ban immunity", "Cannot be banned through vMenu."),
  ...vmenuSection("vMenu · Online players", "OnlinePlayers", "Online Players", [
    ["Teleport", "Teleport to player", "Teleport to another online player."],
    ["Waypoint", "Waypoint to player", "Set a GPS waypoint on another player."],
    ["Spectate", "Spectate player", "Spectate another player."],
    ["SendMessage", "Private message", "Send a private message to a player."],
    ["Summon", "Summon player", "Bring a player to your location."],
    ["Kill", "Kill player", "Kill another player."],
    ["Kick", "Kick player", "Kick a player from the server."],
    ["TempBan", "Temporary ban", "Ban a player for up to 30 days."],
    ["PermBan", "Permanent ban", "Ban a player permanently."],
    ["Unban", "Unban players", "Lift vMenu bans."],
    ["ViewBannedPlayers", "View banned players", "Open the vMenu banned-players list."],
    ["Identifiers", "View identifiers", "See a player's license, Discord and other identifiers."],
    ["SeePrivateMessages", "See private messages", "Read private messages sent between other players."],
  ]),
  ...vmenuSection("vMenu · Player options", "PlayerOptions", "Player Options", [
    ["God", "God mode", "Become invincible."],
    ["Invisible", "Invisible", "Make your character invisible."],
    ["UnlimitedStamina", "Unlimited stamina", "Never run out of stamina."],
    ["FastRun", "Fast run", "Run faster than normal."],
    ["FastSwim", "Fast swim", "Swim faster than normal."],
    ["Superjump", "Super jump", "Jump much higher than normal."],
    ["NoRagdoll", "No ragdoll", "Never ragdoll when hit or falling."],
    ["NeverWanted", "Never wanted", "Police never chase you."],
    ["SetWanted", "Set wanted level", "Choose your own wanted level."],
    ["ClearBlood", "Clear blood", "Remove blood from your character."],
    ["SetBlood", "Set blood", "Apply blood effects to your character."],
    ["Ignored", "Everyone ignores you", "NPCs ignore you."],
    ["StayInVehicle", "Stay in vehicle", "Cannot be dragged out of your vehicle."],
    ["MaxHealth", "Max health", "Refill your health."],
    ["MaxArmor", "Max armor", "Refill your body armor."],
    ["CleanPlayer", "Clean player", "Remove dirt and damage from your character."],
    ["DryPlayer", "Dry player", "Make your character dry."],
    ["WetPlayer", "Wet player", "Make your character wet."],
    ["VehicleAutoPilotMenu", "Vehicle autopilot", "Let the AI drive your vehicle."],
    ["Freeze", "Freeze yourself", "Freeze your own character in place."],
    ["Scenarios", "Scenarios", "Play idle scenarios and animations."],
  ]),
  ...vmenuSection("vMenu · Vehicle options", "VehicleOptions", "Vehicle Options", [
    ["God", "Vehicle god mode", "Your vehicle cannot be damaged."],
    ["KeepClean", "Keep clean", "Your vehicle never gets dirty."],
    ["Repair", "Repair vehicle", "Fully repair your vehicle."],
    ["Wash", "Wash vehicle", "Clean your vehicle."],
    ["Engine", "Toggle engine", "Turn the engine on and off."],
    ["DestroyEngine", "Destroy engine", "Destroy your vehicle's engine."],
    ["BikeSeatbelt", "Bike seatbelt", "Never fall off bikes."],
    ["SpeedLimiter", "Speed limiter", "Set a maximum speed."],
    ["ChangePlate", "Change plate", "Change the license plate text and style."],
    ["Mod", "Vehicle mods", "Install performance and cosmetic mods."],
    ["Colors", "Colors", "Change paint colors."],
    ["Liveries", "Liveries", "Change the vehicle livery."],
    ["Components", "Extras", "Toggle vehicle extras."],
    ["Doors", "Doors", "Open, close and remove doors."],
    ["Windows", "Windows", "Roll windows up and down."],
    ["Freeze", "Freeze vehicle", "Freeze your vehicle in place."],
    ["Invisible", "Invisible vehicle", "Make your vehicle invisible."],
    ["TorqueMultiplier", "Torque multiplier", "Increase engine torque."],
    ["PowerMultiplier", "Power multiplier", "Increase engine power."],
    ["Flip", "Flip vehicle", "Put an upside-down vehicle back on its wheels."],
    ["Alarm", "Alarm", "Toggle the vehicle alarm."],
    ["CycleSeats", "Cycle seats", "Move between seats."],
    ["EngineAlwaysOn", "Engine always on", "Keep the engine running after you get out."],
    ["NoSiren", "Disable siren", "Silence emergency sirens."],
    ["NoHelmet", "No bike helmet", "Never automatically wear a bike helmet."],
    ["Lights", "Lights", "Control vehicle lights."],
    ["FixOrDestroyTires", "Fix or destroy tires", "Repair or pop the tires."],
    ["Delete", "Delete vehicle", "Delete your current vehicle."],
    ["Underglow", "Underglow", "Neon underglow controls."],
    ["FlashHighbeamsOnHonk", "Flash high beams on honk", "Flash high beams when you honk."],
    ["DisableTurbulence", "Disable plane turbulence", "Remove turbulence when flying."],
    ["AnchorBoat", "Anchor boat", "Drop or raise a boat anchor."],
    ["InfiniteFuel", "Infinite fuel", "Never run out of fuel."],
    ["Flares", "Aircraft flares", "Deploy countermeasure flares."],
    ["PlaneBombs", "Plane bombs", "Drop bombs from supported aircraft."],
    ["BypassExtraDamage", "Bypass extra damage", "Change extras on damaged vehicles."],
  ]),
  ...vmenuSection("vMenu · Vehicle spawner", "VehicleSpawner", "Vehicle Spawner", [
    ["BypassRateLimit", "Bypass rate limit", "Spawn vehicles without the spawn cooldown."],
    ["DisableReplacePrevious", "Keep previous vehicle", "Spawn without deleting your previous vehicle."],
    ["SpawnByName", "Spawn by name", "Spawn any vehicle by typing its model name."],
    ["Addon", "Add-on vehicles", "Spawn vehicles from the Addon Vehicles list."],
    ...VEHICLE_CLASSES.map((key) => [key, `Spawn ${vehicleClassName(key).toLowerCase()}`, `Spawn vehicles from the ${vehicleClassName(key)} class.`]),
    ["WhitelistedModels.All", "All whitelisted models", "Spawn every model listed in the whitelisted-models config."],
    ["WhitelistedModels.<model>", "One whitelisted model", "Template: replace <model> with a model from the whitelisted-models config."],
  ]),
  ...vmenuSection("vMenu · Saved vehicles", "SavedVehicles", "Saved Vehicles", [
    ["Spawn", "Spawn saved vehicles", "Spawn vehicles you saved earlier."],
  ]),
  ...vmenuSection("vMenu · Personal vehicle", "PersonalVehicle", "Personal Vehicle", [
    ["ToggleEngine", "Toggle engine", "Start or stop your personal vehicle's engine remotely."],
    ["ToggleLights", "Toggle lights", "Turn your personal vehicle's lights on or off remotely."],
    ["ToggleStance", "Toggle stance", "Raise or lower your personal vehicle's stance."],
    ["KickPassengers", "Kick passengers", "Remove passengers from your personal vehicle."],
    ["LockDoors", "Lock doors", "Lock and unlock your personal vehicle."],
    ["Doors", "Doors", "Open and close your personal vehicle's doors remotely."],
    ["SoundHorn", "Sound horn", "Sound the horn remotely."],
    ["ToggleAlarm", "Toggle alarm", "Trigger or stop the alarm remotely."],
    ["AddBlip", "Map blip", "Show a blip for your personal vehicle."],
    ["ExclusiveDriver", "Exclusive driver", "Only you can drive your personal vehicle."],
  ]),
  ...vmenuSection("vMenu · Player appearance", "PlayerAppearance", "Player Appearance", [
    ["Customize", "Customize ped", "Change clothing and props on your current ped."],
    ["SpawnSaved", "Spawn saved peds", "Load characters you saved earlier."],
    ["SpawnNew", "Spawn new ped", "Spawn a different ped model."],
    ["AddonPeds", "Add-on peds", "Spawn peds from the Addon Peds list."],
    ["WhitelistedModels.All", "All whitelisted peds", "Use every ped listed in the whitelisted-models config."],
    ["WhitelistedModels.<model>", "One whitelisted ped", "Template: replace <model> with a ped from the whitelisted-models config."],
  ]),
  ...vmenuSection("vMenu · Time options", "TimeOptions", "Time Options", [
    ["FreezeTime", "Freeze time", "Stop the in-game clock for everyone."],
    ["SetTime", "Set time", "Change the in-game time for everyone."],
  ]),
  ...vmenuSection("vMenu · Weather options", "WeatherOptions", "Weather Options", [
    ["Dynamic", "Dynamic weather", "Turn automatic weather changes on or off."],
    ["Blackout", "Blackout", "Turn off every light in the city."],
    ["VehBlackout", "Vehicle blackout", "Turn off vehicle lights during a blackout."],
    ["SetWeather", "Set weather", "Change the weather for everyone."],
    ["RemoveClouds", "Remove clouds", "Clear the clouds."],
    ["RandomizeClouds", "Randomize clouds", "Pick a random cloud style."],
  ]),
  ...vmenuSection("vMenu · Weapon options", "WeaponOptions", "Weapon Options", [
    ["GetAll", "Get all weapons", "Give yourself every allowed weapon."],
    ["RemoveAll", "Remove all weapons", "Remove every weapon you carry."],
    ["UnlimitedAmmo", "Unlimited ammo", "Never run out of ammunition."],
    ["NoReload", "No reload", "Never reload."],
    ["Spawn", "Spawn weapons", "Spawn individual weapons from the menu."],
    ["SpawnByName", "Spawn weapon by name", "Spawn any weapon by typing its name."],
    ["SetAllAmmo", "Set all ammo", "Set the ammo count for every weapon."],
    ["WhitelistedModels.All", "All whitelisted weapons", "Use every weapon listed in the whitelisted-models config."],
    ["WhitelistedModels.<weapon>", "One whitelisted weapon", "Template: replace <weapon> with a weapon from the whitelisted-models config."],
  ]),
  ...WEAPONS.map((key) => ace("vMenu · Individual weapons", `vMenu.WeaponOptions.${key}`, weaponName(key), `Spawn the ${weaponName(key)} from Weapon Options (only matters without vMenu.WeaponOptions.All).`)),
  ...vmenuSection("vMenu · Weapon loadouts", "WeaponLoadouts", "Weapon Loadouts", [
    ["Equip", "Equip loadouts", "Equip a saved weapon loadout."],
    ["EquipOnRespawn", "Equip on respawn", "Automatically equip a loadout after respawning."],
  ]),
  ...vmenuSection("vMenu · Misc settings", "MiscSettings", "Misc Settings", [
    ["ClearArea", "Clear area", "Clear nearby vehicles, peds and debris."],
    ["TeleportToWp", "Teleport to waypoint", "Teleport to your map waypoint."],
    ["TeleportToCoord", "Teleport to coordinates", "Teleport to typed coordinates."],
    ["ShowCoordinates", "Show coordinates", "Display your coordinates on screen."],
    ["ShowLocation", "Show location", "Display your street and zone on screen."],
    ["JoinQuitNotifs", "Join/quit notifications", "Show when players join or leave."],
    ["DeathNotifs", "Death notifications", "Show when players die."],
    ["NightVision", "Night vision", "Toggle night vision."],
    ["ThermalVision", "Thermal vision", "Toggle thermal vision."],
    ["LocationBlips", "Location blips", "Show location blips on the map."],
    ["OverheadNames", "Overhead names", "Show player names above heads."],
    ["PlayerBlips", "Player blips", "Show other players on the map."],
    ["TeleportLocations", "Teleport locations", "Use the saved teleport-locations list."],
    ["TeleportSaveLocation", "Save teleport locations", "Add new entries to the teleport-locations list."],
    ["ConnectionMenu", "Connection options", "Quit the session or the game, or reconnect."],
    ["RestoreAppearance", "Restore appearance", "Restore your appearance after dying."],
    ["RestoreWeapons", "Restore weapons", "Restore your weapons after dying."],
    ["DriftMode", "Drift mode", "Toggle drift handling."],
    ["EntitySpawner", "Entity spawner", "Spawn and place props and entities."],
    ["DevTools", "Developer tools", "Entity and model debugging tools."],
  ], { menu: false }),
  ...vmenuSection("vMenu · Voice chat", "VoiceChat", "Voice Chat", [
    ["Enable", "Enable voice chat", "Turn vMenu voice chat on or off for yourself."],
    ["ShowSpeaker", "Show speaker", "Show who is speaking."],
    ["StaffChannel", "Staff voice channel", "Join the staff-only voice channel."],
  ]),
];

export const PERMISSION_CATALOG = [...FLORIDA_BAY, ...EASYADMIN, ...VMENU];
export const CATALOG_SOURCES = {
  fbrp: { label: "Florida Bay", match: (entry) => entry.object.startsWith("fbrp") },
  easyadmin: { label: "EasyAdmin", match: (entry) => entry.object.startsWith("easyadmin") },
  vmenu: { label: "vMenu", match: (entry) => entry.object.startsWith("vMenu") },
};

export const VMENU_BUNDLES = {
  player: ["vMenu.PlayerOptions.Menu", "vMenu.PlayerOptions.All", "vMenu.VehicleOptions.Menu", "vMenu.VehicleOptions.All", "vMenu.VehicleSpawner.Menu", "vMenu.VehicleSpawner.All", "vMenu.PersonalVehicle.Menu", "vMenu.PersonalVehicle.All", "vMenu.SavedVehicles.Menu", "vMenu.SavedVehicles.All", "vMenu.PlayerAppearance.Menu", "vMenu.PlayerAppearance.All", "vMenu.WeaponOptions.Menu", "vMenu.WeaponOptions.All", "vMenu.WeaponLoadouts.Menu", "vMenu.WeaponLoadouts.All", "vMenu.MiscSettings.All"],
  staff: ["vMenu.Staff", "vMenu.NoClip", "vMenu.OnlinePlayers.Menu", "vMenu.OnlinePlayers.All"],
  full: ["vMenu.Everything"],
};

export const PERMISSION_BUNDLES = {
  "bot.moderator": [
    "fbrp.discord.mod",
    "fbrp.tickets.support",
    "fbrp.roster.view",
    "fbrp.investigate",
  ],
  "bot.manager": [
    "fbrp.discord.mod",
    "fbrp.tickets",
    "fbrp.tickets.support",
    "fbrp.staff.manage",
    "fbrp.roster.view",
    "fbrp.roster.manage",
    "fbrp.roster.discipline",
    "fbrp.investigate",
  ],
  "easyadmin.trial": [
    "easyadmin.player.warn",
    "easyadmin.player.spectate",
    "easyadmin.player.reports.view",
    "easyadmin.player.reports.claim",
  ],
  "easyadmin.moderator": [
    "easyadmin.player.kick",
    "easyadmin.player.warn",
    "easyadmin.player.mute",
    "easyadmin.player.freeze",
    "easyadmin.player.spectate",
    "easyadmin.player.teleport.single",
    "easyadmin.player.ban.temporary",
    "easyadmin.player.ban.view",
    "easyadmin.player.reports.view",
    "easyadmin.player.reports.claim",
    "easyadmin.player.reports.process",
    "vMenu.Staff",
  ],
  "easyadmin.admin": [
    "easyadmin.player",
    "easyadmin.bot",
    "easyadmin.server",
    "easyadmin.immune",
    "vMenu.Staff",
    "vMenu.NoClip",
    "vMenu.OnlinePlayers.Menu",
    "vMenu.OnlinePlayers.All",
  ],
  "fbrp.police": [
    "fbrp.police",
    "fbrp.police.cuff",
    "fbrp.police.arrest",
    "fbrp.police.search",
    "fbrp.police.escort",
    "fbrp.police.mdt",
    "fbrp.police.jail",
    "fbrp.police.cite",
    "fbrp.police.impound",
    "fbrp.police.spikes",
    "fbrp.vehicles.leo",
  ],
  "fbrp.ems": [
    "fbrp.ems",
    "fbrp.ems.revive",
    "fbrp.vehicles.fire",
  ],
};

/** Catalog rows filtered by source key (fbrp/easyadmin/vmenu or all) and a free-text search. */
export function catalogEntries(source = "all", search = "") {
  const needle = String(search || "").trim().toLowerCase();
  const match = CATALOG_SOURCES[source]?.match || (() => true);
  return PERMISSION_CATALOG.filter(
    (entry) =>
      match(entry) &&
      (!needle || `${entry.object} ${entry.label} ${entry.description} ${entry.category}`.toLowerCase().includes(needle)),
  );
}

/** Splits catalog rows into pages of embed descriptions, keeping category headers with their rows. */
export function catalogPages(entries, max = 3800) {
  const pages = [];
  let page = "";
  let current = null;
  for (const entry of entries) {
    const header = entry.category !== current ? `${page ? "\n" : ""}**${entry.category}**\n` : "";
    const line = `\`${entry.object}\` · ${entry.label}: ${entry.description}\n`;
    if (page && page.length + header.length + line.length > max) {
      pages.push(page.trimEnd());
      page = `**${entry.category}**${header ? "" : " (continued)"}\n`;
    } else page += header;
    current = entry.category;
    page += line;
  }
  if (page.trim()) pages.push(page.trimEnd());
  return pages;
}
