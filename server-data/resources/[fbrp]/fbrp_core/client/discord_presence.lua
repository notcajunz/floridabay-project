-- Discord rich presence: shows the server logo, the character being played, the organization
-- they are clocked into (with its website logo), their activity and where they are. Everything
-- is read from the same player state bags the HUD uses, so there is no extra server traffic.

local cfg = FBRP.Config.discordPresence or {}

local TYPE_LABELS = {
    leo = 'Law Enforcement', fire = 'Fire & EMS', government = 'Government',
    gang = 'Gang', business = 'Business', other = 'Organization',
}

local MAX_TEXT = 120 -- Discord truncates text lines at 128 characters

-- Cut a string to at most `limit` bytes without splitting a multi-byte UTF-8 character.
local function clip(text, limit)
    text = tostring(text or '')
    if #text <= limit then return text end
    local cut = limit
    while cut > 0 do
        local byte = text:byte(cut + 1)
        if not byte or byte < 0x80 or byte >= 0xC0 then break end
        cut = cut - 1
    end
    return text:sub(1, cut)
end

local function label(key)
    local text = GetLabelText(key)
    if not text or text == '' or text == 'NULL' then return nil end
    return text
end

local function vehicleName(vehicle)
    local model = GetDisplayNameFromVehicleModel(GetEntityModel(vehicle))
    local text = label(model)
    if text then return text end
    -- Add-on vehicles have no game label; "scar_ram" reads better as "Scar Ram".
    return (tostring(model):lower():gsub('^fbrp_pv_', ''):gsub('[_%-]+', ' '):gsub('(%a)([%w]*)', function(a, b)
        return a:upper() .. b
    end))
end

local function districtName(coords)
    return label(GetNameOfZone(coords.x, coords.y, coords.z))
end

local function activity(ped)
    local coords = GetEntityCoords(ped)
    local where = districtName(coords)
    local suffix = where and (' in ' .. where) or ''
    local vehicle = GetVehiclePedIsIn(ped, false)

    if vehicle ~= 0 then
        local name = vehicleName(vehicle)
        local class = GetVehicleClass(vehicle)
        local driving = GetPedInVehicleSeat(vehicle, -1) == ped
        if not driving then return ('Riding in a %s%s'):format(name, suffix) end
        local ok, lights = pcall(function() return Entity(vehicle).state.fbrpEmergencyLights end)
        if ok and lights == true then return ('Responding in a %s%s'):format(name, suffix) end
        if class == 15 or class == 16 then return ('Flying a %s%s'):format(name, suffix) end
        if class == 14 then return ('Sailing a %s%s'):format(name, suffix) end
        if class == 13 or class == 8 then return ('Riding a %s%s'):format(name, suffix) end
        return ('Driving a %s%s'):format(name, suffix)
    end

    if IsPedSwimming(ped) then return 'Swimming' .. suffix end
    if IsPedRunning(ped) or IsPedSprinting(ped) then return 'Running' .. suffix end
    return 'On foot' .. suffix
end

local function buildPresence()
    local bag = LocalPlayer.state
    local character = bag['fbrp:characterName']
    local large = ('%s'):format(FBRP.Config.serverName or 'Florida Bay Roleplay')
    local online = GlobalState['fbrp:onlinePlayers']
    if online then
        large = ('%s • %d/%d online'):format(large, online, tonumber(GlobalState['fbrp:maxPlayers']) or 0)
    end

    local presence = { text = '', large = large, small = '', smallText = '' }
    if type(character) ~= 'string' or character == '' then
        presence.text = 'Choosing a character'
        return presence
    end

    local parts = { character }
    local org = bag['fbrp:organization']
    if type(org) == 'table' and org.name then
        parts[#parts + 1] = 'On duty: ' .. org.name
        presence.smallText = ('%s • %s'):format(org.name, TYPE_LABELS[org.type] or TYPE_LABELS.other)
        local base = tostring(cfg.logoBase or '')
        if base ~= '' and tonumber(org.logo) then
            presence.small = ('%s%d?v=%d'):format(base, org.id, org.logo)
        end
    end
    if bag['fbrp:staffDuty'] == true then parts[#parts + 1] = 'Staff on duty' end

    if bag['fbrp:downed'] then
        parts[#parts + 1] = 'Down, waiting for medical'
    else
        parts[#parts + 1] = activity(PlayerPedId())
    end

    presence.text = table.concat(parts, ' • ')
    return presence
end

local function buttons()
    local index = 0
    if tostring(cfg.joinUrl or '') ~= '' then
        SetDiscordRichPresenceAction(index, 'Join Florida Bay RP', cfg.joinUrl)
        index = index + 1
    end
    if tostring(cfg.inviteUrl or '') ~= '' then
        SetDiscordRichPresenceAction(index, 'Discord Community', cfg.inviteUrl)
    end
end

CreateThread(function()
    local appId = tostring(cfg.appId or '')
    -- The natives only exist in a game client; stay quiet on anything else.
    if appId == '' or type(SetDiscordAppId) ~= 'function' then return end

    SetDiscordAppId(appId)
    SetDiscordRichPresenceAsset(tostring(cfg.largeImage or ''))
    buttons()

    local applied = {}
    local lastApplied = 0
    local refresh = tonumber(cfg.refreshMs) or 15000

    while true do
        local now = GetGameTimer()
        if lastApplied == 0 or now - lastApplied >= refresh then
            local presence = buildPresence()
            if applied.text ~= presence.text then
                SetRichPresence(clip(presence.text, MAX_TEXT))
                applied.text = presence.text
            end
            if applied.large ~= presence.large then
                SetDiscordRichPresenceAssetText(clip(presence.large, MAX_TEXT))
                applied.large = presence.large
            end
            if applied.small ~= presence.small then
                SetDiscordRichPresenceAssetSmall(presence.small)
                applied.small = presence.small
            end
            if applied.smallText ~= presence.smallText then
                SetDiscordRichPresenceAssetSmallText(clip(presence.smallText, MAX_TEXT))
                applied.smallText = presence.smallText
            end
            lastApplied = now
        end
        Wait(1000)
    end
end)
