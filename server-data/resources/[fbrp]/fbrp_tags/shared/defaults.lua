-- Runs AFTER config.lua. If config.lua failed to load (syntax error, stray ``` from a paste, etc.)
-- or is missing a key, fall back to these values instead of crashing with "index a nil value (cfg)".
local defaults = {
    distance = 10.0,
    losInterval = 750,
    headScale = 0.55,
    gangScale = 0.55,
    headHeight = 1.5,    -- metres above the ped's centre (CaliRP: 1.5)
    gangHeight = 1.25,   -- gang tag under the headtag (CaliRP: 1.25)
    menuTop = 110,
    notifyPosition = 'center-right',
    showOwnTag = false,
    ownMinDistance = 6.0,
    badgeOrgTypes = { leo = true, fire = true },
    badgeDistance = 5.0,
    badgeSeconds = 6500,
    logoBase = GetConvar('fbrp_discordLogoBase', 'https://floridabay.net/api/orgs/logo/')
}

if type(TagsConfig) ~= 'table' then
    print('^1[fbrp_tags] config.lua did not load (check it for a syntax error) - using default settings.^7')
    TagsConfig = {}
end

for k, v in pairs(defaults) do
    if TagsConfig[k] == nil then TagsConfig[k] = v end
end
