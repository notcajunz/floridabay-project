-- jaxtti-carwipe | server

local wipeActive = false

-- Discord ACE check: aces are granted to identifier.discord:... principals by
-- fbrp_core's role bridge, so IsPlayerAceAllowed picks them up directly.
local function hasAce(src)
    for _, ace in ipairs(Config.AllowedAces) do
        if IsPlayerAceAllowed(src, ace) then
            return true
        end
    end
    return false
end

local function isClockedIn(src)
    local player = Player(src)
    return player and player.state[Config.DutyStateBag] == true
end

-- Returns: allowed, reason ('ace' | 'duty')
local function hasPermission(src)
    if not hasAce(src) then
        return false, 'ace'
    end
    if Config.RequireClockedIn and not isClockedIn(src) then
        return false, 'duty'
    end
    return true
end

local function notify(target, data)
    TriggerClientEvent('jaxtti-carwipe:client:notify', target, data)
end

local function announceChat(message)
    TriggerClientEvent('chat:addMessage', -1, {
        color = Config.AnnounceColor,
        multiline = true,
        args = { 'CAR WIPE', message }
    })
end

-- Build exempt model hash lookup once
local exemptHashes = {}
for _, model in ipairs(Config.ExemptModels) do
    exemptHashes[joaat(model)] = true
end

local function getPlayerOccupiedVehicles()
    local occupied = {}
    for _, playerId in ipairs(GetPlayers()) do
        local ped = GetPlayerPed(playerId)
        if ped and ped ~= 0 then
            local veh = GetVehiclePedIsIn(ped, false)
            if veh and veh ~= 0 then
                occupied[veh] = true
            end
        end
    end
    return occupied
end

local function performWipe(data)
    local occupied = data.protectOccupied and getPlayerOccupiedVehicles() or {}
    local center = data.scope == 'radius' and vector3(data.coords.x, data.coords.y, data.coords.z) or nil
    local radius = data.radius

    local deleted, skipped = 0, 0

    for _, veh in ipairs(GetAllVehicles()) do
        if DoesEntityExist(veh) then
            local keep = false

            if occupied[veh] then
                keep = true
            elseif exemptHashes[GetEntityModel(veh)] then
                keep = true
            elseif center then
                local vCoords = GetEntityCoords(veh)
                if #(vCoords - center) > radius then
                    keep = true
                end
            end

            if keep then
                skipped = skipped + 1
            else
                DeleteEntity(veh)
                deleted = deleted + 1
            end
        end
    end

    return deleted, skipped
end

local function runCountdown(countdown, reason)
    local reasonText = (reason and reason ~= '') and (' Reason: ' .. reason) or ''

    -- Initial announcement
    announceChat(('All vehicles will be wiped in %d seconds!%s'):format(countdown, reasonText))
    notify(-1, {
        title = 'Car Wipe Incoming',
        description = ('All vehicles will be deleted in %d seconds. Park up and hop out!'):format(countdown),
        type = 'warning',
        icon = 'triangle-exclamation',
        duration = 8000
    })

    local remaining = countdown
    local warned = { [countdown] = true }

    while remaining > 0 do
        Wait(1000)
        remaining = remaining - 1

        for _, step in ipairs(Config.WarningSteps) do
            if remaining == step and not warned[step] then
                warned[step] = true
                notify(-1, {
                    title = 'Car Wipe',
                    description = ('Vehicles will be deleted in %d seconds!'):format(remaining),
                    type = 'warning',
                    icon = 'triangle-exclamation'
                })
            end
        end
    end
end

RegisterNetEvent('jaxtti-carwipe:server:startWipe', function(data)
    local src = source

    local allowed, denyReason = hasPermission(src)
    if not allowed then
        notify(src, {
            title = 'Car Wipe',
            description = denyReason == 'duty'
                and 'You must be clocked in as staff (/clockin) to do that.'
                or 'You do not have permission to do that.',
            type = 'error',
            icon = 'ban'
        })
        return
    end

    if wipeActive then
        notify(src, {
            title = 'Car Wipe',
            description = 'A car wipe is already in progress.',
            type = 'error'
        })
        return
    end

    -- Validate / sanitise input
    if type(data) ~= 'table' or type(data.coords) ~= 'table' then return end
    local scope = data.scope == 'radius' and 'radius' or 'all'
    local radius = math.max(Config.MinRadius, math.min(Config.MaxRadius, tonumber(data.radius) or Config.DefaultRadius))
    local countdown = math.max(0, math.min(600, math.floor(tonumber(data.countdown) or Config.DefaultCountdown)))
    local reason = type(data.reason) == 'string' and data.reason:sub(1, 120) or nil

    wipeActive = true

    local adminName = GetPlayerName(src) or ('ID ' .. src)
    print(('^3[jaxtti-carwipe]^7 %s (id %d) started a %s wipe (countdown %ds)%s'):format(
        adminName, src, scope == 'all' and 'server-wide' or ('%dm radius'):format(radius),
        countdown, reason and (' - ' .. reason) or ''
    ))

    CreateThread(function()
        if countdown > 0 then
            runCountdown(countdown, reason)
        end

        local deleted, skipped = performWipe({
            scope = scope,
            radius = radius,
            protectOccupied = data.protectOccupied == true,
            coords = data.coords
        })

        wipeActive = false

        announceChat(('Car wipe complete. %d vehicle(s) removed.'):format(deleted))
        notify(-1, {
            title = 'Car Wipe Complete',
            description = ('%d vehicle(s) were removed.'):format(deleted),
            type = 'success',
            icon = 'broom'
        })
        notify(src, {
            title = 'Car Wipe',
            description = ('Done - removed %d vehicle(s), skipped %d.'):format(deleted, skipped),
            type = 'success',
            icon = 'broom',
            duration = 8000
        })

        print(('^2[jaxtti-carwipe]^7 Wipe finished: %d deleted, %d skipped.'):format(deleted, skipped))
    end)
end)

-- /carwipe command (manual ace check so Discord-bridged aces work)
RegisterCommand(Config.Command, function(source)
    if source == 0 then
        print('[jaxtti-carwipe] This command must be used in-game.')
        return
    end

    local allowed, denyReason = hasPermission(source)
    if not allowed then
        notify(source, {
            title = 'Car Wipe',
            description = denyReason == 'duty'
                and 'You must be clocked in as staff (/clockin) to use this command.'
                or 'You do not have permission to use this command.',
            type = 'error',
            icon = 'ban'
        })
        return
    end

    TriggerClientEvent('jaxtti-carwipe:client:openDialog', source)
end, false)

-- Chat suggestion
CreateThread(function()
    TriggerClientEvent('chat:addSuggestion', -1, '/' .. Config.Command, 'Open the staff car wipe menu (staff only)')
end)
