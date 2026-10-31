TagsConfig = {

    distance = 10.0,

    losInterval = 750,

    headScale = 0.55,
    gangScale = 0.55,
    nameScale = 0.30,
    -- World-space heights above the ped for each line (matches calirp-discord_tags)
    headHeight = 1.50, -- headtag + [ID]
    nameHeight = 1.35, -- callsign | name
    gangHeight = 1.25, -- gangtag

    menuTop = 110,
    menuX = 1150,
    notifyPosition = 'center-right',
    showOwnTag = false,
    ownMinDistance = 6.0,

    badgeOrgTypes = { leo = true, fire = true },
    badgeDistance = 5.0,
    badgeSeconds = 6500,

    logoBase = GetConvar('fbrp_discordLogoBase', 'https://floridabay.net/api/orgs/logo/')
}
