-- Overhead tag drawing now lives in fbrp_tags (ported from the Jaxtti tag system). This file keeps
-- the NoClip privacy signal, the vMenu gamer tag cleanup and the /tags selection menu; fbrp_core
-- still publishes the fbrp:headtag / fbrp:gangtag state bags that fbrp_tags renders.

local noclipActive = false
local lastNoclipSignal = 0

-- Legacy vMenu's NoClip handler leaves the controlled entity faded, invisible or
-- frozen. Publish that footprint as a small privacy state for every other client;
-- the short grace period bridges a per-frame property reset.
local function looksNoclipped(entity)
    if not DoesEntityExist(entity) or GetEntityAlpha(entity) >= 200 then return false end
    -- The frozen check is the fallback should visibility read back as true because of
    -- SetLocalPlayerVisibleLocally.
    return not IsEntityVisible(entity) or IsEntityPositionFrozen(entity)
end

CreateThread(function()
    LocalPlayer.state:set('fbrp:noclip', false, true)
    while true do
        local ped = PlayerPedId()
        local vehicle = GetVehiclePedIsIn(ped, false)
        if looksNoclipped(ped) or (vehicle ~= 0 and looksNoclipped(vehicle)) then
            lastNoclipSignal = GetGameTimer()
        end
        local active = lastNoclipSignal > 0 and GetGameTimer() - lastNoclipSignal < 650
        if active ~= noclipActive then
            noclipActive = active
            LocalPlayer.state:set('fbrp:noclip', active, true)
        end
        Wait(0)
    end
end)

-- A noclipping staff member must leave nothing behind: not the vehicle they are driving
-- (or riding in), not a slung gun, not the weapon in hand. Every other client hides those
-- entities locally each frame.
local wasNoclipActive = false

local function hideEntity(entity)
    if entity and entity ~= 0 and DoesEntityExist(entity) then SetEntityLocallyInvisible(entity) end
end

local function hideNoclipper(ped, bag)
    hideEntity(ped)
    local weapon = GetCurrentPedWeaponEntityIndex(ped)
    hideEntity(weapon)
    local vehicle = GetVehiclePedIsIn(ped, false)
    if vehicle ~= 0 then
        hideEntity(vehicle)
        for seat = -1, GetVehicleModelNumberOfSeats(GetEntityModel(vehicle)) - 2 do
            hideEntity(GetPedInVehicleSeat(vehicle, seat))
        end
    end
    local props = bag['fbrp:slungProps']
    if type(props) == 'table' then
        for _, netId in ipairs(props) do
            if NetworkDoesNetworkIdExist(netId) then hideEntity(NetworkGetEntityFromNetworkId(netId)) end
        end
    end
end

CreateThread(function()
    local mine = PlayerId()
    local active = {}
    local nextScan = 0
    while true do
        local now = GetGameTimer()
        if now >= nextScan then
            nextScan = now + 250
            active = {}
            for _, player in ipairs(GetActivePlayers()) do
                if player ~= mine then
                    local bag = Player(GetPlayerServerId(player)).state
                    if bag['fbrp:noclip'] == true then active[#active + 1] = { player = player, bag = bag } end
                end
            end
        end
        for _, row in ipairs(active) do
            local ped = GetPlayerPed(row.player)
            if DoesEntityExist(ped) then hideNoclipper(ped, row.bag) end
        end

        -- When noclip ends, make sure nothing stays hidden. vMenu resets its own entity, but the
        -- ped and the vehicle are restored here too so a missed reset can never leave anyone
        -- invisible. Nothing is forced invisible on this client, which would keep the noclip
        -- detection above latched on.
        if wasNoclipActive and not noclipActive then
            local ped = PlayerPedId()
            SetEntityVisible(ped, true, false)
            ResetEntityAlpha(ped)
            local vehicle = GetVehiclePedIsIn(ped, true)
            if vehicle ~= 0 and DoesEntityExist(vehicle) then
                SetEntityVisible(vehicle, true, false)
                ResetEntityAlpha(vehicle)
            end
        end
        wasNoclipActive = noclipActive
        Wait(#active > 0 and 0 or 100)
    end
end)

-- vMenu's overhead names are native gamer tags ("Name [id]") that stay drawn over invisible
-- noclipping staff and cannot be hidden per player from outside vMenu. fbrp's own tags are
-- the only overhead identity, so any gamer tags are cleared. Nothing else in this
-- server creates gamer tags; the engine pool is 32 entries.
if FBRP.Config.hideVmenuGamerTags then
    CreateThread(function()
        while true do
            -- Senior Moderator and above keep vMenu's names while clocked in.
            if not (LocalPlayer.state['fbrp:staffDuty'] == true and LocalPlayer.state['fbrp:staffSenior'] == true) then
                for id = 0, 31 do
                    if IsMpGamerTagActive(id) then RemoveMpGamerTag(id) end
                end
            end
            Wait(250)
        end
    end)
end

local TAG_GROUPS = {
    { kind = 'head', title = 'Headtag', description = 'The tag above your server ID' },
    { kind = 'gang', title = 'Gang tag', description = 'The secondary overhead tag' },
    { kind = 'chat', title = 'Chat tag', description = 'The tag beside your name in chat' },
}

local tagData = {}

-- RageUI offsets are in 1920x1080 units from the top-left safe zone; the menu is 431 wide.
-- Anchor it to the centre of the right edge. Submenus inherit the position.
local MENU_X, MENU_Y = 1920 - 431 - 50, 250

RMenu.Add('fbrp_tags', 'main', RageUI.CreateMenu('Florida Bay', 'SELECT A TAG SLOT', MENU_X, MENU_Y))
for _, group in ipairs(TAG_GROUPS) do
    RMenu.Add('fbrp_tags', group.kind, RageUI.CreateSubMenu(
        RMenu:Get('fbrp_tags', 'main'),
        'Florida Bay',
        group.title:upper()
    ))
end

local function tagMenuOpen()
    if RageUI.Visible(RMenu:Get('fbrp_tags', 'main')) then return true end
    for _, group in ipairs(TAG_GROUPS) do
        if RageUI.Visible(RMenu:Get('fbrp_tags', group.kind)) then return true end
    end
    return false
end

local function selectedLabel(rows, selected)
    for _, row in ipairs(rows or {}) do
        if tonumber(row.id) == tonumber(selected) then return row.label end
    end
    return 'None'
end

-- Tags are stored with a #RRGGBB colour; RageUI buttons take it as a label colour so each tag
-- reads in the same colour players see overhead.
local function tagLabelColor(hex)
    hex = tostring(hex or ''):gsub('^#', '')
    if #hex ~= 6 then return nil end
    local r, g, b = tonumber(hex:sub(1, 2), 16), tonumber(hex:sub(3, 4), 16), tonumber(hex:sub(5, 6), 16)
    if not (r and g and b) then return nil end
    return { R = r, G = g, B = b }
end

local function selectTag(kind, tagId)
    TriggerServerEvent('fbrp:tags:equip', kind, tagId)
end

-- fbrp_tags draws the tag menu (Jaxtti style) when it's running; this one is the fallback
local function tagsResource() return GetResourceState('fbrp_tags') == 'started' end

RegisterNetEvent('fbrp:tags:data', function(data)
    if tagsResource() then return end
    local wasOpen = tagMenuOpen()
    tagData = data or {}
    if not wasOpen then RageUI.Visible(RMenu:Get('fbrp_tags', 'main'), true) end
end)

RegisterNetEvent('fbrp:tags:selected', function()
    if tagsResource() then return end
    SetTimeout(100, function()
        TriggerServerEvent('fbrp:tags:request')
    end)
end)

-- RageUI owns the keyboard/controller navigation and submenu history. Server data
-- remains authoritative, so every selection is refreshed in place after it is saved.
CreateThread(function()
    while true do
        local open = tagMenuOpen()
        if open then
            local selected = tagData.selected or {}

            RageUI.IsVisible(RMenu:Get('fbrp_tags', 'main'), function()
                for _, group in ipairs(TAG_GROUPS) do
                    RageUI.Button(
                        group.title,
                        group.description,
                        { RightLabel = selectedLabel(tagData[group.kind], selected[group.kind]) .. '  →' },
                        true,
                        {},
                        RMenu:Get('fbrp_tags', group.kind)
                    )
                end
            end)

            for _, group in ipairs(TAG_GROUPS) do
                RageUI.IsVisible(RMenu:Get('fbrp_tags', group.kind), function()
                    local selectedId = tonumber(selected[group.kind]) or 0
                    RageUI.Button(
                        'None',
                        selectedId == 0 and 'Currently selected' or 'Clear this slot',
                        { RightLabel = selectedId == 0 and '~g~Selected' or '' },
                        true,
                        { onSelected = function() selectTag(group.kind, 0) end }
                    )

                    for _, row in ipairs(tagData[group.kind] or {}) do
                        local tagId = tonumber(row.id) or 0
                        local isSelected = tagId == selectedId
                        local description = isSelected and 'Currently selected'
                            or (row.org_name and ('Available while on duty with ' .. row.org_name) or 'Select this tag')
                        RageUI.Button(
                            tostring(row.label or 'Tag'),
                            description,
                            { RightLabel = isSelected and '~g~Selected' or '', LabelColor = tagLabelColor(row.color) },
                            true,
                            { onSelected = function() selectTag(group.kind, tagId) end }
                        )
                    end
                end)
            end
        end
        Wait(open and 0 or 200)
    end
end)

AddStateBagChangeHandler('fbrp:organization', nil, function(bagName)
    if bagName ~= ('player:%s'):format(GetPlayerServerId(PlayerId())) then return end
    if not tagMenuOpen() then return end
    SetTimeout(100, function()
        if tagMenuOpen() then TriggerServerEvent('fbrp:tags:request') end
    end)
end)
