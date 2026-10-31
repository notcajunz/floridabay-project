-- Piggyback: /piggyback next to someone, again to stop
local cfg = MiscConfig

local piggyback = {
    InProgress = false,
    targetSrc = -1,
    type = "",
    personPiggybacking = { animDict = "anim@arena@celeb@flat@paired@no_props@", anim = "piggyback_c_player_a", flag = 49 },
    personBeingPiggybacked = {
        animDict = "anim@arena@celeb@flat@paired@no_props@", anim = "piggyback_c_player_b",
        attachX = 0.0, attachY = -0.07, attachZ = 0.45, flag = 33,
    },
}

local function notify(description, kind)
    lib.notify({ title = "Piggyback", description = description, type = kind or "inform", position = cfg.NotifyPosition })
end

local function ensureAnimDict(animDict)
    if not HasAnimDictLoaded(animDict) then
        RequestAnimDict(animDict)
        local untilAt = GetGameTimer() + 3000
        while not HasAnimDictLoaded(animDict) and GetGameTimer() < untilAt do Wait(0) end
    end
    return animDict
end

local function closestPlayer(maxDistance)
    local here = GetEntityCoords(PlayerPedId())
    local best, bestDistance
    for _, player in ipairs(GetActivePlayers()) do
        if player ~= PlayerId() then
            local distance = #(here - GetEntityCoords(GetPlayerPed(player)))
            if distance <= maxDistance and (not bestDistance or distance < bestDistance) then best, bestDistance = player, distance end
        end
    end
    return best
end

-- keep the animation playing while it's going on
local function animLoop()
    CreateThread(function()
        while piggyback.InProgress do
            local ped = PlayerPedId()
            local anim = piggyback.type == "beingPiggybacked" and piggyback.personBeingPiggybacked or piggyback.personPiggybacking
            if not IsEntityPlayingAnim(ped, anim.animDict, anim.anim, 3) then
                TaskPlayAnim(ped, anim.animDict, anim.anim, 8.0, -8.0, 100000, anim.flag, 0, false, false, false)
            end
            Wait(0)
        end
    end)
end

local function stopLocal()
    piggyback.InProgress = false
    piggyback.type = ""
    local ped = PlayerPedId()
    ClearPedSecondaryTask(ped)
    ClearPedTasks(ped)
    DetachEntity(ped, true, false)
end

RegisterCommand("piggyback", function()
    if piggyback.InProgress then
        local partner = piggyback.targetSrc
        stopLocal()
        TriggerServerEvent("FBRP:PB:Stop", partner)
        piggyback.targetSrc = -1
        return
    end
    local ped = PlayerPedId()
    if IsPedInAnyVehicle(ped, false) or LocalPlayer.state.dead or LocalPlayer.state["fbrp:restrained"] then return end
    local player = closestPlayer(cfg.PiggybackReach)
    if not player then return notify("No player nearby to piggyback.", "error") end
    -- the server checks permission + distance, then starts it for both of us
    TriggerServerEvent("FBRP:PB:Request", GetPlayerServerId(player))
end, false)

-- server said yes: we carry
RegisterNetEvent("FBRP:PB:Start", function(targetSrc)
    piggyback.InProgress = true
    piggyback.targetSrc = targetSrc
    piggyback.type = "piggybacking"
    ensureAnimDict(piggyback.personPiggybacking.animDict)
    animLoop()
end)

-- someone is carrying us
RegisterNetEvent("FBRP:PB:SyncT", function(carrierSrc)
    local carrier = GetPlayerFromServerId(carrierSrc)
    if carrier == -1 then return end
    local d = piggyback.personBeingPiggybacked
    piggyback.InProgress = true
    piggyback.targetSrc = carrierSrc
    piggyback.type = "beingPiggybacked"
    ensureAnimDict(d.animDict)
    AttachEntityToEntity(PlayerPedId(), GetPlayerPed(carrier), 0, d.attachX, d.attachY, d.attachZ, 0.5, 0.5, 180.0, false, false, false, false, 2, false)
    animLoop()
end)

RegisterNetEvent("FBRP:PB:cl_stop", function()
    stopLocal()
    piggyback.targetSrc = -1
end)

TriggerEvent("chat:addSuggestion", "/piggyback", "Piggyback the closest player (use again to stop)")
