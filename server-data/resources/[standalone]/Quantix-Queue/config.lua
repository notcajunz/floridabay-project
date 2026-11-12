Config = {}

Config.ServerName = "Florida Bay Roleplay"
Config.DiscordGuildId = "1557594282976747550"
Config.DiscordBotToken = GetConvar("quantix_discord_token", "DISCORD_BOT_TOKEN_HERE")

Config.MaxServerSlots = 48
Config.ReservedSlots = 2
Config.ReservedSlotsMinRank = 2

Config.RequireDiscord = true
Config.RequireSteam = false
Config.RequireLicense = true

Config.WhitelistOnly = false
Config.WhitelistRoles = {
    "111111111111111111",
    "222222222222222222",
    "333333333333333333"
}

Config.GracePeriodEnabled = true
Config.GracePeriodSeconds = 180

Config.QueueTickInterval = 1000

-- Every player sees the queue screen for at least this many seconds, even when the server has free slots.
Config.MinQueueScreenSeconds = 5
Config.ConnectingTimeout = 60
Config.DiscordCacheSeconds = 35

Config.DefaultRank = {
    name = "Standard Citizen",
    rank = 999,
    bypassQueue = false,
    badgeColor = "Default"
}

Config.PriorityRoles = {
    {
        roleId = "1570227893056049194",
        name = "Owner",
        rank = 1,
        bypassQueue = true,
        badgeColor = "Attention"
    },
    {
        roleId = "1570227894330855565",
        name = "Co-Owner",
        rank = 2,
        bypassQueue = true,
        badgeColor = "Attention"
    },
    {
        roleId = "1570227907593248910",
        name = "Executive Management",
        rank = 3,
        bypassQueue = true,
        badgeColor = "Warning"
    },
    {
        roleId = "1570227908277047298",
        name = "Community Director",
        rank = 4,
        bypassQueue = true,
        badgeColor = "Accent"
    },
    {
        roleId = "1570227911309402112",
        name = "Community Manager",
        rank = 5,
        bypassQueue = true,
        badgeColor = "Good"
    },
    {
        roleId = "1570227912039465050",
        name = "Assistant Community Manager",
        rank = 6,
        bypassQueue = true,
        badgeColor = "Light"
    },
    {
        roleId = "1570227912664293438",
        name = "Trial Management",
        rank = 7,
        bypassQueue = true,
        badgeColor = "Good"
    },
    {
        roleId = "1570227913096167549",
        name = "Head Administrator",
        rank = 8,
        bypassQueue = true,
        badgeColor = "Good"
    },
    {
        roleId = "1570227917504385096",
        name = "Development Manager",
        rank = 9,
        bypassQueue = true,
        badgeColor = "Good"
    },
    {
        roleId = "1570227921061150810",
        name = "Owners Pass",
        rank = 10,
        bypassQueue = true,
        badgeColor = "Attention"
    },
    {
        roleId = "1570227972646903853",
        name = "Queue Bypass",
        rank = 11,
        bypassQueue = true,
        badgeColor = "Attention"
    },
    {
        roleId = "1570227967572054146",
        name = "VIP Package",
        rank = 12,
        bypassQueue = true,
        badgeColor = "Attention"
    },
    {
        roleId = "1570227973292822558",
        name = "Whitelist Package",
        rank = 13,
        bypassQueue = true,
        badgeColor = "Attention"
    },
    {
        roleId = "1570228067501211648",
        name = "Community Member",
        rank = 14,
        bypassQueue = false,
        badgeColor = "Attention"
    },
}

Config.Screen = {
    UseAdaptiveCard = true,
    CardStyle = "default",

    ShowServerBanner = true,
    BannerUrl = "https://i.imgur.com/8NStK1s.png",

    ShowServerName = true,
    CustomServerTitle = "Florida Bay Roleplay",

    ShowDiscordAvatar = true,
    DefaultAvatarUrl = "https://cdn.discordapp.com/embed/avatars/0.png",

    ShowUsername = true,
    UsernamePrefix = "Welcome back, ",

    ShowPriorityBadge = true,
    ShowPriorityRankOrder = true,
    PriorityLabel = "Queue Priority Status",

    ShowQueuePosition = true,
    QueuePositionLabel = "Queue Position",

    ShowTotalInQueue = true,
    TotalInQueueLabel = "Players Waiting",

    ShowQueueList = true,
    MaxListedPlayers = 20,
    QueueListHeading = "Queue (%d waiting)",

    ShowEstimatedWaitTime = true,
    EstimatedWaitTimeLabel = "Est. Wait Time",
    SecondsPerSlotEstimate = 40,

    ShowServerSlots = true,
    ServerSlotsLabel = "Server Population",

    ShowAnnouncement = true,
    AnnouncementHeading = "Server Rules & Updates",
    AnnouncementMessage = "Please keep Discord open and familiarize yourself with the community rules while in queue. Disconnecting will maintain your spot for 35 seconds.",

    ShowDiscordButton = true,
    DiscordInviteUrl = "https://discord.gg/floridabay",
    DiscordButtonLabel = "Discord Community",

    ShowWebsiteButton = true,
    WebsiteUrl = "https://floridabay.net",
    WebsiteButtonLabel = "Official Website",

    ShowStoreButton = true,
    StoreUrl = "https://store.floridabay.net",
    StoreButtonLabel = "VIP Store"
}

Config.Messages = {
    MissingDiscord = "Discord identifier could not be verified. Please launch the Discord desktop app and restart FiveM.",
    MissingLicense = "Rockstar Games License identifier was not detected. Please relaunch FiveM.",
    MissingSteam = "Steam is required to join this server. Please launch Steam and try again.",
    NotWhitelisted = "You are not whitelisted to join this server. Please apply in our Discord server.",
    Connecting = "Slot granted! Finalizing your connection to the server...",
    QueuePositionText = "Queue Position: %s of %s | Priority: %s (Rank %s) | Estimated: %s",
    ErrorFetchingDiscord = "Could not synchronize your Discord roles. Please reconnect in a moment."
}
