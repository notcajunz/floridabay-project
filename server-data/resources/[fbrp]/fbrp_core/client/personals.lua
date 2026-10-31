-- Personal vehicles: keeps people without access out of the driver seat. The server is
-- authoritative (it ejects after a second); this stops them before they get in.

local denied = {}       -- personal id -> true
local deniedModels = {} -- model hash -> true
local bypass = false
local lastNotice = 0
local shuffleBlocked = false
local bulletproof = {}       -- personal id -> true
local bulletproofModels = {} -- model hash -> true (models that only exist as a bulletproof personal)
local locked = {}            -- personal id -> true (locked by the DevOps team)
local lockedModels = {}      -- model hash -> true
local lastLockedTouch = 0
local handlingByModel = {} -- model hash -> { signature, fields } from the vehicle's handling.meta on the server

RegisterNetEvent('fbrp:personals:sync', function(data)
    data = type(data) == 'table' and data or {}
    denied, deniedModels = {}, {}
    for _, id in ipairs(data.denied or {}) do denied[tonumber(id)] = true end
    for _, model in ipairs(data.models or {}) do deniedModels[joaat(model)] = true end
    bypass = data.bypass == true
    bulletproof, bulletproofModels = {}, {}
    for _, id in ipairs(data.bulletproof or {}) do bulletproof[tonumber(id)] = true end
    for _, model in ipairs(data.bulletproofModels or {}) do bulletproofModels[joaat(model)] = true end
    locked, lockedModels = {}, {}
    for _, id in ipairs(data.locked or {}) do locked[tonumber(id)] = true end
    for _, model in ipairs(data.lockedModels or {}) do lockedModels[joaat(model)] = true end
    handlingByModel = {}
    for model, fields in pairs(type(data.handling) == 'table' and data.handling or {}) do
        if type(fields) == 'table' then
            local names = {}
            for field in pairs(fields) do names[#names + 1] = field end
            table.sort(names)
            local parts = {}
            for _, field in ipairs(names) do parts[#parts + 1] = field .. '=' .. tostring(fields[field]) end
            handlingByModel[joaat(model)] = { signature = table.concat(parts, ';'), fields = fields }
        end
    end
end)

-- FiveM keeps the handling it loaded first for a model, so an edited handling.meta does not reach a vehicle
-- on its own. Apply the server's current values to the vehicle the player is in. Fields stored in other
-- units than the file (degrees as radians, km/h as m/s) are matched against what the game already holds,
-- and a value that fits no known unit is skipped rather than risking a broken car.
local UNITS = {
    fSteeringLock = { 1.0, math.pi / 180.0 },
    fTractionCurveLateral = { 1.0, math.pi / 180.0 },
    fInitialDriveMaxFlatVel = { 1.0, 1.0 / 3.6 },
    fInitialDragCoeff = { 1.0, 0.0001, 0.001 },
}
local tuned = {} -- vehicle -> signature last applied

local function tuneVehicle(vehicle, entry)
    for field, value in pairs(entry.fields) do
        if field == 'nInitialDriveGears' then
            SetVehicleHandlingInt(vehicle, 'CHandlingData', field, math.floor(value))
            pcall(SetVehicleHighGear, vehicle, math.floor(value))
        else
            local target = value + 0.0
            local units = UNITS[field]
            if units and value ~= 0 then
                local current = GetVehicleHandlingFloat(vehicle, 'CHandlingData', field)
                target = nil
                if current and current > 0 and value > 0 then
                    local best
                    for _, scale in ipairs(units) do
                        local distance = math.abs(math.log(current / (value * scale)))
                        if distance < 1.4 and (not best or distance < best.distance) then best = { distance = distance, scale = scale } end
                    end
                    if best then target = value * best.scale end
                end
            end
            if target then SetVehicleHandlingFloat(vehicle, 'CHandlingData', field, target) end
        end
    end
end

CreateThread(function()
    while true do
        Wait(1000)
        local vehicle = GetVehiclePedIsIn(PlayerPedId(), false)
        if vehicle ~= 0 and DoesEntityExist(vehicle) then
            local entry = handlingByModel[GetEntityModel(vehicle)]
            if entry and tuned[vehicle] ~= entry.signature then
                tuned[vehicle] = entry.signature
                tuneVehicle(vehicle, entry)
            end
        end
        for known in pairs(tuned) do
            if not DoesEntityExist(known) then tuned[known] = nil end
        end
    end
end)

local function isLocked(vehicle)
    if vehicle == 0 or not DoesEntityExist(vehicle) then return false end
    local id
    if NetworkGetEntityIsNetworked(vehicle) then
        local ok, value = pcall(function() return Entity(vehicle).state.fbrpPersonal end)
        if ok then id = tonumber(value) end
    end
    if id then return locked[id] == true end
    return lockedModels[GetEntityModel(vehicle)] == true
end

local function blocked(vehicle)
    if bypass or vehicle == 0 or not DoesEntityExist(vehicle) then return false end
    local id
    if NetworkGetEntityIsNetworked(vehicle) then
        local ok, value = pcall(function() return Entity(vehicle).state.fbrpPersonal end)
        if ok then id = tonumber(value) end
    end
    if id then return denied[id] == true end
    return deniedModels[GetEntityModel(vehicle)] == true
end

local function warn()
    local stamp = GetGameTimer()
    if stamp - lastNotice < 4000 then return end
    lastNotice = stamp
    lib.notify({ description = 'This is a personal vehicle. You are not trusted to drive it.', type = 'error' })
end

local function leave(vehicle)
    local ped = PlayerPedId()
    TaskLeaveVehicle(ped, vehicle, 16)
    warn()
end

RegisterNetEvent('fbrp:personals:eject', function()
    local ped = PlayerPedId()
    local vehicle = GetVehiclePedIsIn(ped, false)
    if vehicle ~= 0 and GetPedInVehicleSeat(vehicle, -1) == ped then leave(vehicle) end
end)

CreateThread(function()
    while true do
        local ped = PlayerPedId()
        local entering = GetVehiclePedIsTryingToEnter(ped)
        if entering ~= 0 and isLocked(entering) then
            -- Locked by the DevOps team: stop getting in and let the server despawn it.
            ClearPedTasks(ped)
            local stamp = GetGameTimer()
            if stamp - lastLockedTouch > 2000 and NetworkGetEntityIsNetworked(entering) then
                lastLockedTouch = stamp
                TriggerServerEvent('fbrp:personals:lockedTouch', NetworkGetNetworkIdFromEntity(entering))
            end
        elseif entering ~= 0 and GetSeatPedIsTryingToEnter(ped) == -1 and blocked(entering) then
            ClearPedTasks(ped)
            warn()
        end
        local vehicle = GetVehiclePedIsIn(ped, false)
        if vehicle ~= 0 then
            -- Passengers may ride along but never slide across into the driver seat.
            local noAccess = blocked(vehicle)
            if noAccess ~= shuffleBlocked then
                shuffleBlocked = noAccess
                SetPedConfigFlag(ped, 184, noAccess) -- PED_FLAG_PREVENT_AUTO_SHUFFLE_TO_DRIVER_SEAT
            end
            if noAccess and GetPedInVehicleSeat(vehicle, -1) == ped then leave(vehicle) end
            Wait(150)
        else
            if shuffleBlocked then
                shuffleBlocked = false
                SetPedConfigFlag(ped, 184, false)
            end
            Wait(entering ~= 0 and 100 or 300)
        end
    end
end)

-- Bulletproof personals. Every client protects the bulletproof vehicles near it: the glass does
-- not shatter and the body takes no bullet damage. The people inside cannot be shot (their own
-- client makes their ped bullet proof once the server confirms the seat) and cannot shoot out.

local function personalOf(vehicle)
    if not NetworkGetEntityIsNetworked(vehicle) then return nil end
    local ok, value = pcall(function() return Entity(vehicle).state.fbrpPersonal end)
    return ok and tonumber(value) or nil
end

local function isBulletproof(vehicle)
    if vehicle == 0 or not DoesEntityExist(vehicle) then return false end
    local id = personalOf(vehicle)
    if id then return bulletproof[id] == true end
    return bulletproofModels[GetEntityModel(vehicle)] == true
end

-- Turns only the bullet proof on or off, keeping whatever other proofs another script set.
local function setBulletProof(entity, on)
    local _, _, fire, explosion, collision, melee, steam, p7, drown = GetEntityProofs(entity)
    SetEntityProofs(entity, on, fire == 1 or fire == true, explosion == 1 or explosion == true, collision == 1 or collision == true,
        melee == 1 or melee == true, steam == 1 or steam == true, p7 == 1 or p7 == true, drown == 1 or drown == true)
end

local hardened = {} -- vehicle handle -> true

-- Every pane GTA tracks (front/rear doors, windscreens, extra and quarter glass).
local WINDOWS = { 0, 1, 2, 3, 4, 5, 6, 7 }

local function sealWindows(vehicle)
    for _, window in ipairs(WINDOWS) do
        if not IsVehicleWindowIntact(vehicle, window) then FixVehicleWindow(vehicle, window) end
    end
end

-- Glass that is processed and unbreakable stops a bullet at the pane. Do NOT call
-- SetDontProcessVehicleGlass: it removes the glass collision, so shots go straight through.
local function harden(vehicle, on)
    setBulletProof(vehicle, on)
    if SetDontProcessVehicleGlass then SetDontProcessVehicleGlass(vehicle, false) end
    if SetVehicleWindowsCanBreak then SetVehicleWindowsCanBreak(vehicle, not on) end
    SetVehicleCanBreak(vehicle, not on)
    if on then sealWindows(vehicle) end
    hardened[vehicle] = on or nil
end

-- Backstop for any pane that still shatters (some window state does not replicate to every
-- client): put the glass back every frame so no gap survives long enough to take a shot.
CreateThread(function()
    while true do
        local any = false
        for vehicle in pairs(hardened) do
            if DoesEntityExist(vehicle) then
                any = true
                sealWindows(vehicle)
            else
                hardened[vehicle] = nil
            end
        end
        Wait(any and 0 or 500)
    end
end)

CreateThread(function()
    while true do
        local seen = {}
        local me = GetEntityCoords(PlayerPedId())
        for _, vehicle in ipairs(GetGamePool('CVehicle')) do
            if #(GetEntityCoords(vehicle) - me) < 400.0 and isBulletproof(vehicle) then
                seen[vehicle] = true
                if not hardened[vehicle] then harden(vehicle, true) end
            end
        end
        for vehicle in pairs(hardened) do
            if not seen[vehicle] then
                if DoesEntityExist(vehicle) then harden(vehicle, false) else hardened[vehicle] = nil end
            end
        end
        Wait(1000)
    end
end)

local armorGranted = false  -- the server confirmed we sit in a bulletproof personal
local armored = nil         -- vehicle our ped is protected in
local pedProofed = false

RegisterNetEvent('fbrp:personals:armor', function(on)
    armorGranted = on == true
end)

local ATTACK_CONTROLS = { 24, 25, 47, 58, 68, 69, 70, 91, 92, 114, 140, 141, 142, 257, 263, 264, 331 }

CreateThread(function()
    while true do
        local ped = PlayerPedId()
        local vehicle = GetVehiclePedIsIn(ped, false)
        local inside = vehicle ~= 0 and isBulletproof(vehicle)
        if inside then
            -- Nobody inside a bulletproof personal can shoot out of it.
            SetPlayerCanDoDriveBy(PlayerId(), false)
            for _, control in ipairs(ATTACK_CONTROLS) do DisableControlAction(0, control, true) end
            if armored ~= vehicle then
                armored = vehicle
                SetPedCanBeShotInVehicle(ped, false)
                lib.notify({ description = 'Bulletproof vehicle: bullets cannot reach you in here, and you cannot shoot out of it.', type = 'info' })
            end
            -- Full bullet proofing waits for the server, which also clears it with the anticheat.
            if armorGranted and not pedProofed then
                pedProofed = true
                setBulletProof(ped, true)
            end
            Wait(0)
        else
            if armored then
                armored = nil
                SetPedCanBeShotInVehicle(ped, true)
                if pedProofed then setBulletProof(ped, false) end
                pedProofed = false
                SetPlayerCanDoDriveBy(PlayerId(), true)
            end
            Wait(250)
        end
    end
end)
