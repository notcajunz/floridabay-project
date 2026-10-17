-- Overhead identity: a large headtag with the server ID on the top line and the
-- gang/organization tag underneath. Player names are never drawn.

-- Match the reference tag treatment: GTA's clean proportional Chalet face
-- with equal-size rank/ID and gang lines. Font 4 is the condensed Chalet face
-- and reads much narrower/heavier than the reference.
local TAG_FONT, TAG_SCALE = 0, 0.54
local HEAD_FONT, SUB_FONT = TAG_FONT, TAG_FONT
local HEAD_SCALE, ID_SCALE, SUB_SCALE = TAG_SCALE, 0.52, TAG_SCALE
local HEAD_BONE = 31086
-- GTA has no HUD-text bold switch. A centered five-pass weight works for old
-- and new database tags alike, including tags whose outline setting is off.
local BOLD_OFFSET_X, BOLD_OFFSET_Y = 0.00046, 0.00062
local BOLD_PASSES = {
    { 0.0, 0.0 },
    { -BOLD_OFFSET_X, 0.0 }, { BOLD_OFFSET_X, 0.0 },
    { 0.0, -BOLD_OFFSET_Y }, { 0.0, BOLD_OFFSET_Y },
}

local function hexColor(hex)
    hex = tostring(hex or '#FFFFFF'):gsub('#','')
    if #hex ~= 6 then return 255,255,255 end
    return tonumber(hex:sub(1,2),16) or 255,tonumber(hex:sub(3,4),16) or 255,tonumber(hex:sub(5,6),16) or 255
end

local function clean(label)
    if type(label) ~= 'string' then return nil end
    label = label:gsub('~',''):gsub('^%s+',''):gsub('%s+$','')
    return label ~= '' and label or nil
end

local function isDark(r,g,b)
    return (0.2126*r + 0.7152*g + 0.0722*b) / 255 < 0.24
end

local function textWidth(text, font, scale)
    SetTextFont(font)
    SetTextScale(0.0, scale)
    BeginTextCommandGetWidth('STRING')
    AddTextComponentSubstringPlayerName(text)
    return EndTextCommandGetWidth(true)
end

local function rawText(text, x, y, font, scale, r, g, b, a, outline)
    -- Always apply the synthetic bold weight. The tag's outline preference
    -- controls only contrast and can never disable bold rendering.
    for _, offset in ipairs(BOLD_PASSES) do
        SetTextFont(font)
        SetTextScale(0.0, scale)
        SetTextProportional(true)
        SetTextColour(r, g, b, a)
        if outline then SetTextOutline() end
        BeginTextCommandDisplayText('STRING')
        AddTextComponentSubstringPlayerName(text)
        EndTextCommandDisplayText(x + offset[1], y + offset[2])
    end
end

-- Dark colors disappear behind GTA's black outline, so they get a light halo
-- instead (the same treatment the bigger RP communities use). A tag with its
-- outline switched off is drawn as plain colored text with neither.
local halo = { {-1,0},{1,0},{0,-1},{0,1},{-1,-1},{1,1},{-1,1},{1,-1} }
local function drawText(text, x, y, font, scale, r, g, b, a, px, py, outline)
    if outline == false then
        rawText(text, x, y, font, scale, r, g, b, a, false)
    elseif isDark(r,g,b) then
        local ha = math.floor(a*0.9)
        for _,o in ipairs(halo) do
            rawText(text, x + o[1]*px*1.4, y + o[2]*py*1.4, font, scale, 236, 240, 242, ha, false)
        end
        rawText(text, x, y, font, scale, r, g, b, a, false)
    else
        rawText(text, x, y, font, scale, r, g, b, a, true)
    end
end

local visible = {}
local tagsHidden = GetResourceKvpString('fbrp_hide_tags') == '1'
local noclipActive = false
local lastNoclipSignal = 0

RegisterCommand('hidetags', function()
    tagsHidden = not tagsHidden
    SetResourceKvp('fbrp_hide_tags', tagsHidden and '1' or '0')
    if tagsHidden then visible = {} end
    TriggerEvent('fbrp:notify', tagsHidden and 'Overhead tags hidden.' or 'Overhead tags shown.', 'info')
end, false)

-- vMenu keeps its noclip flag internal, but its NoClipHandler runs every frame on the
-- controlled entity (the ped, or the vehicle it is in): FreezeEntityPosition(true),
-- SetEntityCollision(false), SetEntityVisible(false) and SetEntityAlpha(51), with
-- SetLocalPlayerVisibleLocally(true) so the staff member still sees themself.
-- Detect that combination and publish a small privacy state for every other client.
-- The short grace period bridges vMenu's per-frame property reset.
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
-- (or riding in), not a slung gun, not the weapon in hand. vMenu only alpha-fades the
-- entity for its owner, so every other client hides those entities locally each frame,
-- and the noclipping client also switches its own vehicle's visibility off.
local ownVehicleHidden = 0

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

        -- Own vehicle: invisible to the network while noclip is on, restored after.
        local vehicle = GetVehiclePedIsIn(PlayerPedId(), false)
        if noclipActive and vehicle ~= 0 then
            if ownVehicleHidden ~= vehicle then ownVehicleHidden = vehicle end
            SetEntityVisible(vehicle, false, false)
        elseif ownVehicleHidden ~= 0 then
            if DoesEntityExist(ownVehicleHidden) then SetEntityVisible(ownVehicleHidden, true, false) end
            ownVehicleHidden = 0
        end
        Wait(#active > 0 and 0 or (ownVehicleHidden ~= 0 and 0 or 100))
    end
end)

-- vMenu's overhead names are native gamer tags ("Name [id]") that stay drawn over invisible
-- noclipping staff and cannot be hidden per player from outside vMenu. fbrp's own tags are
-- the only overhead identity, so vMenu's gamer tags are cleared. Nothing else in this
-- server creates gamer tags; the engine pool is 32 entries.
if FBRP.Config.hideVmenuGamerTags then
    CreateThread(function()
        while true do
            for id = 0, 31 do
                if IsMpGamerTagActive(id) then RemoveMpGamerTag(id) end
            end
            Wait(250)
        end
    end)
end

-- Gather who should have a tag a few times a second; draw every frame.
CreateThread(function()
    while true do
        local mine = PlayerPedId()
        local origin = GetEntityCoords(mine)
        local maxDistance = FBRP.Config.tagDistance
        local rows = {}
        if not tagsHidden then
            for _,player in ipairs(GetActivePlayers()) do
                local ped = GetPlayerPed(player)
                if DoesEntityExist(ped) and not IsEntityDead(ped) and IsEntityVisible(ped) then
                    local distance = #(origin - GetEntityCoords(ped))
                    if distance <= maxDistance and (ped == mine or HasEntityClearLosToEntity(mine, ped, 17)) then
                        local serverId = GetPlayerServerId(player)
                        local bag = Player(serverId).state
                        local head, gang = bag['fbrp:headtag'], bag['fbrp:gangtag']
                        if bag['fbrp:noclip'] ~= true then
                            rows[#rows+1] = {
                                player = player,
                                serverId = serverId,
                                ped = ped,
                                id = ('[%d]'):format(serverId),
                                head = head and clean(head.label) and { label=clean(head.label), color={hexColor(head.color)}, outline=head.outline ~= false } or nil,
                                gang = gang and clean(gang.label) and { label=clean(gang.label), color={hexColor(gang.color)}, outline=gang.outline ~= false } or nil,
                                distance = distance
                            }
                        end
                    end
                end
            end
        end
        visible = rows
        Wait(#rows > 0 and 150 or 400)
    end
end)

CreateThread(function()
    while true do
        if tagsHidden or #visible == 0 then
            Wait(200)
        else
            local camCoords = GetFinalRenderedCamCoord()
            local fov = 50.0 / math.max(GetFinalRenderedCamFov(), 1.0)
            local resX, resY = GetActiveScreenResolution()
            local px, py = 1.0 / resX, 1.0 / resY
            local maxDistance = FBRP.Config.tagDistance
            for _,row in ipairs(visible) do
                if DoesEntityExist(row.ped) and Player(row.serverId).state['fbrp:noclip'] ~= true then
                    local anchor = GetPedBoneCoords(row.ped, HEAD_BONE, 0.0, 0.0, 0.0) + vector3(0.0, 0.0, 0.36)
                    local onScreen, x, y = GetScreenCoordFromWorldCoord(anchor.x, anchor.y, anchor.z)
                    if onScreen then
                        local k = math.max(0.5, math.min(1.1, (5.0 / math.max(#(camCoords - anchor), 0.1)) * fov))
                        local fade = row.distance < maxDistance * 0.6 and 1.0 or (1.0 - (row.distance - maxDistance*0.6) / (maxDistance*0.4))
                        local a = math.floor(255 * math.max(0.0, math.min(1.0, fade)))

                        -- Bottom line: gang / organization tag.
                        if row.gang then
                            local s = SUB_SCALE * k
                            local h = GetRenderedCharacterHeight(s, SUB_FONT)
                            y = y - h * 1.05
                            local r,g,b = table.unpack(row.gang.color)
                            drawText(row.gang.label, x - textWidth(row.gang.label, SUB_FONT, s)/2, y, SUB_FONT, s, r, g, b, a, px, py, row.gang.outline)
                        end

                        -- Top line: big headtag followed by the server ID.
                        local talking = NetworkIsPlayerTalking(row.player)
                        local ir, ig, ib = 245, 248, 250
                        if talking then ir, ig, ib = 120, 225, 255 end
                        if row.head then
                            local s = HEAD_SCALE * k
                            local h = GetRenderedCharacterHeight(s, HEAD_FONT)
                            y = y - h * 1.08
                            local idText = ' ' .. row.id
                            local wLabel = textWidth(row.head.label, HEAD_FONT, s)
                            local wId = textWidth(idText, HEAD_FONT, s)
                            local left = x - (wLabel + wId) / 2
                            local r,g,b = table.unpack(row.head.color)
                            drawText(row.head.label, left, y, HEAD_FONT, s, r, g, b, a, px, py, row.head.outline)
                            rawText(idText, left + wLabel, y, HEAD_FONT, s, ir, ig, ib, a, row.head.outline)
                        else
                            local s = ID_SCALE * k
                            local h = GetRenderedCharacterHeight(s, HEAD_FONT)
                            y = y - h * 1.08
                            rawText(row.id, x - textWidth(row.id, HEAD_FONT, s)/2, y, HEAD_FONT, s, ir, ig, ib, a, true)
                        end
                    end
                end
            end
            Wait(0)
        end
    end
end)

RegisterNetEvent('fbrp:tags:data', function(data)
    data = data or {}
    data.serverId = GetPlayerServerId(PlayerId())
    if FBRP.MenuView() == 'tags' then
        SendNUIMessage({type='tagsData',data=data})
    else
        FBRP.OpenMenu('tags',data)
    end
end)

RegisterNetEvent('fbrp:tags:selected', function(selected)
    SendNUIMessage({type='tagSelected',data=selected})
end)

RegisterNUICallback('equipTag', function(data,cb)
    TriggerServerEvent('fbrp:tags:equip',tostring(data.kind),tonumber(data.id))
    cb({ok=true})
end)

AddStateBagChangeHandler('fbrp:organization', nil, function(bagName)
    if bagName ~= ('player:%s'):format(GetPlayerServerId(PlayerId())) or FBRP.MenuView() ~= 'tags' then return end
    SetTimeout(100, function()
        if FBRP.MenuView() == 'tags' then TriggerServerEvent('fbrp:tags:request') end
    end)
end)
