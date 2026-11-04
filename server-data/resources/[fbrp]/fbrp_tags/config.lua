-- Overhead tags are published by fbrp_core as the player state bags `fbrp:headtag` and
-- `fbrp:gangtag` ({ label, color = '#RRGGBB', outline }). The website, API and Discord bots edit
-- those tags in the database; this resource only draws them.
TagsConfig = {
    -- Players further away than this (metres) never get a tag.
    distance = 10.0,
    -- How often (ms) line of sight is re-checked for nearby players.
    losInterval = 750,
    -- Jaxtti text sizing: headtag/ID line and the smaller gangtag line.
    headScale = 0.55,
    gangScale = 0.55,
    headHeight = 1.30,    -- metres above the ped's centre
    gangHeight = 1.10,   -- gang tag under the headtag
    menuTop = 110,        -- tag menus sit top-middle: pixels from the top (at 1080p), just under the compass
    notifyPosition = 'center-right', -- ox_lib position: top, top-right, top-left, bottom, bottom-right, bottom-left, center-right, center-left
    showOwnTag = false,  -- jaxtti_tags never shows your own tag; players can turn theirs on with /selftag
    ownMinDistance = 6.0, -- your own tag is sized as if at least this far away, so it never gets huge

    -- /showbadge: organization types that carry an identification card.
    badgeOrgTypes = { leo = true, fire = true },
    badgeDistance = 5.0,
    badgeSeconds = 6500,
    -- Website org logos (same convar fbrp_core uses for Discord presence).
    logoBase = GetConvar('fbrp_discordLogoBase', 'https://floridabay.net/api/orgs/logo/')
}
