-- FBRP Misc - server (Developed by Jaxtti): tackle and piggyback checks.
local cfg = MiscConfig

local function near(a, b, distance)
    local pa, pb = GetPlayerPed(a), GetPlayerPed(b)
    if pa <= 0 or pb <= 0 then return false end
    return #(GetEntityCoords(pa) - GetEntityCoords(pb)) <= distance
end

local function staffOnDuty(src)
    local ok, onDuty = pcall(function() return exports.fbrp_core:IsStaffOnDuty(src) end)
    return ok and onDuty == true
end

---------------------------------------------------------------- tackle

local lastTackle = {}
RegisterNetEvent("FBRP:Tackle:TacklePlayer", function(target, forward)
    local src = source
    target = tonumber(target)
    if not target or target == src or not GetPlayerName(target) then return end
    local now = GetGameTimer()
    if lastTackle[src] and now - lastTackle[src] < math.max(1000, cfg.TackleCooldown - 1000) then return end
    if not near(src, target, cfg.TackleReach + 1.5) then return end
    lastTackle[src] = now
    if type(forward) ~= "table" then forward = nil end
    TriggerClientEvent("FBRP:Tackle:Tackled", target, forward)
end)

---------------------------------------------------------------- piggyback

local partners = {} -- [src] = other src

local function stopPair(src)
    local other = partners[src]
    partners[src] = nil
    if other then
        partners[other] = nil
        if GetPlayerName(other) then TriggerClientEvent("FBRP:PB:cl_stop", other) end
    end
end

RegisterNetEvent("FBRP:PB:Request", function(target)
    local src = source
    target = tonumber(target)
    if not target or target == src or not GetPlayerName(target) then return end
    if cfg.PiggybackAce and not IsPlayerAceAllowed(src, cfg.PiggybackAce) and not staffOnDuty(src) then
        return TriggerClientEvent("ox_lib:notify", src, { title = "Piggyback", description = "You can't use piggyback.", type = "error", position = cfg.NotifyPosition })
    end
    if partners[src] or partners[target] then return end
    if not near(src, target, cfg.PiggybackReach + 1.5) then return end
    partners[src], partners[target] = target, src
    TriggerClientEvent("FBRP:PB:Start", src, target)
    TriggerClientEvent("FBRP:PB:SyncT", target, src)
end)

RegisterNetEvent("FBRP:PB:Stop", function()
    stopPair(source)
end)

AddEventHandler("playerDropped", function()
    local src = source
    lastTackle[src] = nil
    stopPair(src)
end)
