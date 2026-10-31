-- FBRP Grief Menu - server: every action is authorized here, the client menu is only a convenience.
local cfg = GriefConfig
local threshold

local validActions = {
    fire = true, extinguish = true, launch = true, ragdoll = true, slap = true,
    freeze = true, explode_player = true, explode_vehicle = true, pop_tires = true,
    kill_engine = true, flip_vehicle = true, eject = true, launch_vehicle = true,
    bring = true, ['goto'] = true,
}

local function core(name, ...)
    local args = { ... }
    local ok, result = pcall(function() return exports.fbrp_core[name](exports.fbrp_core, table.unpack(args)) end)
    if ok then return result end
    return nil
end

-- rank_order of the lowest Co-Owner group; cached for five minutes
local function requiredRank()
    if threshold and os.time() - threshold.at < 300 then return threshold.rank end
    local rank = MySQL.scalar.await([[
        SELECT rank_order FROM ace_groups
         WHERE staff_only=TRUE AND (name=? OR label=?)
         ORDER BY rank_order LIMIT 1
    ]], { cfg.RankName, cfg.RankLabel })
    threshold = { at = os.time(), rank = tonumber(rank) }
    return threshold.rank
end

local function authorized(src)
    if src <= 0 then return false end
    if cfg.RequireOnDuty and core('IsStaffOnDuty', src) ~= true then return false end
    local rank = core('GetStaffRank', src)
    local need = requiredRank()
    return type(rank) == 'table' and need ~= nil and (tonumber(rank.rank) or -1) >= need
end

-- The client asks before building the menu so everyone else gets a plain refusal.
lib.callback.register('fbrp_grief:canOpen', function(src)
    return authorized(src)
end)

RegisterNetEvent('fbrp_grief:action', function(target, action)
    local src = source
    target = tonumber(target)
    if not target or not validActions[action] then return end
    if not authorized(src) then
        print(('[fbrp_grief] DENIED %s (%d) tried "%s"'):format(GetPlayerName(src) or '?', src, tostring(action)))
        return
    end
    if not GetPlayerName(target) then
        return TriggerClientEvent('ox_lib:notify', src, { title = 'Grief Menu', description = 'Player not found.', type = 'error' })
    end

    if cfg.LogActions then
        print(('[fbrp_grief] %s (%d) used "%s" on %s (%d)'):format(GetPlayerName(src), src, action, GetPlayerName(target), target))
    end

    if action == 'goto' then
        local c = GetEntityCoords(GetPlayerPed(target))
        TriggerClientEvent('fbrp_grief:teleport', src, c.x, c.y, c.z)
    elseif action == 'bring' then
        local c = GetEntityCoords(GetPlayerPed(src))
        TriggerClientEvent('fbrp_grief:teleport', target, c.x, c.y, c.z)
    else
        TriggerClientEvent('fbrp_grief:apply', target, action)
    end
end)
