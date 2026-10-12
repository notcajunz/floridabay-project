-- Overhead identity: a large headtag with the server ID on the top line and the
-- gang/organization tag underneath. Player names are never drawn.

local HEAD_FONT, SUB_FONT = 4, 4
local HEAD_SCALE, ID_SCALE, SUB_SCALE = 0.82, 0.66, 0.82
local HEAD_BONE = 31086

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
    SetTextFont(font)
    SetTextScale(0.0, scale)
    SetTextProportional(true)
    SetTextColour(r, g, b, a)
    if outline then SetTextOutline() end
    BeginTextCommandDisplayText('STRING')
    AddTextComponentSubstringPlayerName(text)
    EndTextCommandDisplayText(x, y)
end

-- Dark colors disappear behind GTA's black outline, so they get a light halo
-- instead (the same treatment the bigger RP communities use).
local halo = { {-1,0},{1,0},{0,-1},{0,1},{-1,-1},{1,1},{-1,1},{1,-1} }
local function drawText(text, x, y, font, scale, r, g, b, a, px, py)
    if isDark(r,g,b) then
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
local noclipActive = false
local lastNoclipSignal = 0

-- vMenu keeps its noclip flag internal, but while noclip is active it makes
-- the controlled ped/vehicle hidden with 20% alpha every frame. Detect that
-- exact combination and publish a small privacy state for every other client.
-- The short grace period bridges vMenu's per-frame property reset.
CreateThread(function()
    LocalPlayer.state:set('fbrp:noclip', false, true)
    while true do
        local ped = PlayerPedId()
        local entity = GetVehiclePedIsIn(ped, false)
        if entity == 0 then entity = ped end
        if DoesEntityExist(entity) and not IsEntityVisible(entity) and GetEntityAlpha(entity) < 200 then
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

-- Gather who should have a tag a few times a second; draw every frame.
CreateThread(function()
    while true do
        local mine = PlayerPedId()
        local origin = GetEntityCoords(mine)
        local maxDistance = FBRP.Config.tagDistance
        local rows = {}
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
                            head = head and clean(head.label) and { label=clean(head.label), color={hexColor(head.color)} } or nil,
                            gang = gang and clean(gang.label) and { label=clean(gang.label), color={hexColor(gang.color)} } or nil,
                            distance = distance
                        }
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
        if #visible == 0 then
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
                            drawText(row.gang.label, x - textWidth(row.gang.label, SUB_FONT, s)/2, y, SUB_FONT, s, r, g, b, a, px, py)
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
                            drawText(row.head.label, left, y, HEAD_FONT, s, r, g, b, a, px, py)
                            rawText(idText, left + wLabel, y, HEAD_FONT, s, ir, ig, ib, a, true)
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
    FBRP.OpenMenu('tags',data)
end)

RegisterNetEvent('fbrp:tags:selected', function(selected)
    SendNUIMessage({type='tagSelected',data=selected})
end)

RegisterNUICallback('equipTag', function(data,cb)
    TriggerServerEvent('fbrp:tags:equip',tostring(data.kind),tonumber(data.id))
    cb({ok=true})
end)
