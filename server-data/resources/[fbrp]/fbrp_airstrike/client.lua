-- FBRP Airstrike - client. Sequence reproduced from mikrolai/FIVEM-Airstrike (GPL-2.0, see NOTICE.md).
local cfg = AirstrikeConfig
local attackActive = false

local function notifyAdv(title, subtitle, text)
    SetNotificationTextEntry('STRING')
    AddTextComponentString(text)
    SetNotificationMessage('CHAR_LESTER_DEATHWISH', 'CHAR_LESTER_DEATHWISH', false, 0, title, subtitle)
    DrawNotification(false, true)
end

local function chat(text)
    TriggerEvent('chat:addMessage', { color = { 255, 80, 80 }, args = { 'Airstrike', text } })
end

local function loadModel(name)
    local hash = GetHashKey(name)
    if not IsModelInCdimage(hash) then return nil end
    RequestModel(hash)
    local deadline = GetGameTimer() + 10000
    while not HasModelLoaded(hash) do
        if GetGameTimer() > deadline then return nil end
        Wait(10)
    end
    return hash
end

local function loadWeapon(hash)
    if HasWeaponAssetLoaded(hash) then return true end
    RequestWeaponAsset(hash, 31, 0)
    local deadline = GetGameTimer() + 10000
    while not HasWeaponAssetLoaded(hash) do
        if GetGameTimer() > deadline then return false end
        Wait(0)
    end
    return true
end

---------------------------------------------------------------- rocket impact offsets (relative to the target)

local lineY = { -1.0, 6.2, -1.0, 3.0, 4.32, 6.1, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, -1.0, 6.2, -1.0, 3.0, 4.32, 6.1, 1.0 }
local lightOffsets = { { -15, -1 }, { 15.3, 6.2 }, { 16.1, -1 }, { 20.5, 3 }, { 15.567, 4.32 }, { 16.123, 6.1 }, { 12.5, 1 } }

local function buildOffsets(craft)
    local out = { { 1.0, 1.0 } }
    if craft.pattern == 'light' then
        for _, o in ipairs(lightOffsets) do out[#out + 1] = o end
    elseif craft.pattern == 'line' then
        for dir = 1, -1, -2 do
            for i = 1, craft.span // 2 do out[#out + 1] = { dir * i * 2.0, lineY[(i - 1) % #lineY + 1] } end
        end
    else -- carpet: rockets scattered over a wide disc
        for _ = 1, craft.count or 20 do
            local a, r = math.random() * 2 * math.pi, math.sqrt(math.random()) * craft.span * 0.4
            out[#out + 1] = { math.cos(a) * r, math.sin(a) * r }
        end
    end
    while #out > cfg.MaxRocketsPerAircraft do out[#out] = nil end
    return out
end

---------------------------------------------------------------- one aircraft: fly in, fire, crash

local function runAircraft(craft, hash, pilotHash, weapon, x, y, z, state)
    local sx, sy, sz = cfg.SpawnOffset.x + craft.dx, cfg.SpawnOffset.y + craft.dy, cfg.SpawnOffset.z + craft.dz
    local aircraft = CreateVehicle(hash, x + sx, y + sy, z + sz, 216.675, true, true)
    if aircraft == 0 then return end
    local pilot = CreatePedInsideVehicle(aircraft, 1, pilotHash, -1, true, true)
    local blip = AddBlipForEntity(aircraft)
    local tz = craft.bomber and z + 100.0 or z
    TaskVehicleDriveToCoord(pilot, aircraft, x, y, tz, (craft.speed or 2500.0) * 3.6, 500, hash, 16777216, 1.0, 1)

    local deadline = GetGameTimer() + cfg.FlightTimeoutMs
    local arrived = false
    while GetGameTimer() < deadline and DoesEntityExist(aircraft) and not IsEntityDead(pilot) do
        local c = GetEntityCoords(aircraft)
        if math.abs(c.x - x) < craft.radius and math.abs(c.y - y) < craft.radius then arrived = true break end
        Wait(0)
    end

    if arrived and loadWeapon(weapon) then
        if not state.exploded then
            state.exploded = true
            AddExplosion(x, y, z, 5, 50.0, true, false, true)
        end
        for _, o in ipairs(buildOffsets(craft)) do
            if not DoesEntityExist(aircraft) then break end
            local c = GetEntityCoords(aircraft)
            ShootSingleBulletBetweenCoords(c.x, c.y, c.z - 20.0, x + o[1], y + o[2], z, 5000, 0, weapon, PlayerPedId(), true, false, 9000.0)
            Wait(craft.interval)
        end
        Wait(cfg.CrashDelayMs)
    end

    if DoesEntityExist(aircraft) then
        SetEntityHealth(aircraft, 0)
        if DoesEntityExist(pilot) then SetEntityHealth(pilot, 0) end
        NetworkExplodeVehicle(aircraft, true, false, false)
    end
    RemoveBlip(blip)
    Wait(cfg.CleanupDelayMs)
    if DoesEntityExist(pilot) then DeleteEntity(pilot) end
    if DoesEntityExist(aircraft) then DeleteEntity(aircraft) end
    state.done = state.done + 1
end

-- sent by the server to players within cfg.WarningRadius of the target only
RegisterNetEvent('fbrp_airstrike:warn', function(kind)
    if type(kind) ~= 'string' then return end
    SetNotificationBackgroundColor(6)
    notifyAdv(cfg.Messages.incoming, '~u~' .. kind:upper(), 'Airstrike inbound - take cover!')
end)

RegisterNetEvent('fbrp_airstrike:execute', function(kind, x, y, z)
    local strike = cfg.Types[kind]
    if not strike or attackActive then return end
    attackActive = true
    CreateThread(function()
        local pilotHash = loadModel(cfg.Pilot)
        local weapon = GetHashKey(cfg.Weapon)
        local models, ok = {}, pilotHash ~= nil
        for _, craft in ipairs(strike.aircraft) do
            models[craft.model] = models[craft.model] or loadModel(craft.model)
            ok = ok and models[craft.model] ~= nil
        end
        if not ok then
            attackActive = false
            return chat('Airstrike aborted: the aircraft failed to load.')
        end

        local area = AddBlipForArea(x, y, z, 50.0, 50.0)
        SetBlipRotation(area, 0)
        SetBlipColour(area, 1)

        local state = { done = 0, exploded = false }
        for _, craft in ipairs(strike.aircraft) do
            CreateThread(function() runAircraft(craft, models[craft.model], pilotHash, weapon, x, y, z, state) end)
        end

        Wait(cfg.StrikeBlipSeconds * 1000)
        RemoveBlip(area)
        local deadline = GetGameTimer() + cfg.FlightTimeoutMs + cfg.CrashDelayMs + cfg.CleanupDelayMs + 30000
        while state.done < #strike.aircraft and GetGameTimer() < deadline do Wait(500) end
        for _, hash in pairs(models) do SetModelAsNoLongerNeeded(hash) end
        SetModelAsNoLongerNeeded(pilotHash)
        attackActive = false
    end)
end)

RegisterCommand(cfg.Command, function(_, args)
    local kind = args[1] and args[1]:lower()
    if not kind or not cfg.Types[kind] then return chat(cfg.Messages.usage) end
    local blip = GetFirstBlipInfoId(8)
    if blip == 0 then return chat(cfg.Messages.noWaypoint) end
    local c = GetBlipCoords(blip)
    local z = c.z
    -- waypoints carry no height: probe the ground so the opening blast lands on the surface
    for height = 900.0, 0.0, -100.0 do
        RequestCollisionAtCoord(c.x, c.y, height)
        local found, ground = GetGroundZFor_3dCoord(c.x, c.y, height, false)
        if found then z = ground break end
        Wait(0)
    end
    TriggerServerEvent('fbrp_airstrike:request', kind, c.x, c.y, z)
end, false)

TriggerEvent('chat:addSuggestion', '/' .. cfg.Command, '[Executive Management+] Call an airstrike on your map waypoint', {
    { name = 'type', help = 'light | medium | heavy' },
})
