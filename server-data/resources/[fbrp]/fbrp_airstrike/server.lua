-- FBRP Airstrike - server: rank gate, cooldowns, audit log. The strike itself runs on the caller's client.
local cfg = AirstrikeConfig
local lastGlobal, lastPlayer, inProgress = 0, {}, false
local threshold

local function now() return os.time() end

local function notify(src, text, kind)
    if src <= 0 then return print('[fbrp_airstrike] ' .. text) end
    TriggerClientEvent('chat:addMessage', src, { color = kind == 'error' and { 255, 80, 80 } or { 255, 170, 0 }, args = { 'Airstrike', text } })
end

local function core(name, ...)
    local args = { ... }
    local ok, result = pcall(function() return exports.fbrp_core[name](exports.fbrp_core, table.unpack(args)) end)
    if ok then return result end
    return nil
end

-- rank_order of the lowest Executive Management group; cached for five minutes
local function executiveRank()
    if threshold and now() - threshold.at < 300 then return threshold.rank end
    local rank = MySQL.scalar.await([[
        SELECT rank_order FROM ace_groups
         WHERE staff_only=TRUE AND (name=? OR label=?)
         ORDER BY rank_order LIMIT 1
    ]], { cfg.RankName, cfg.RankLabel })
    threshold = { at = now(), rank = tonumber(rank) }
    return threshold.rank
end

-- true, or false plus the reason message
local function authorize(src)
    if src <= 0 then return true end
    if cfg.RequireOnDuty and core('IsStaffOnDuty', src) ~= true then return false, cfg.Messages.notOnDuty end
    local rank = core('GetStaffRank', src)
    local need = executiveRank()
    if type(rank) ~= 'table' or not need or (tonumber(rank.rank) or -1) < need then return false, cfg.Messages.denied end
    return true
end

RegisterNetEvent('fbrp_airstrike:request', function(kind, x, y, z)
    local src = source
    local strike = type(kind) == 'string' and cfg.Types[kind:lower()] or nil
    if not strike then return notify(src, cfg.Messages.usage, 'error') end
    x, y, z = tonumber(x), tonumber(y), tonumber(z)
    if not (x and y and z) or x ~= x or y ~= y or z ~= z or math.abs(x) > 10000 or math.abs(y) > 10000 or math.abs(z) > 3000 then
        return notify(src, cfg.Messages.noWaypoint, 'error')
    end

    local ok, reason = authorize(src)
    if not ok then
        print(('[fbrp_airstrike] DENIED %s (%d) tried /airstrike %s'):format(GetPlayerName(src) or '?', src, kind))
        return notify(src, reason, 'error')
    end
    if inProgress then return notify(src, cfg.Messages.inProgress, 'error') end
    local wait = math.max(lastGlobal + cfg.GlobalCooldown, (lastPlayer[src] or 0) + cfg.PlayerCooldown) - now()
    if wait > 0 then return notify(src, cfg.Messages.cooldown:format(wait), 'error') end
    if cfg.MaxCallerDistance > 0 then
        local ped = GetPlayerPed(src)
        if ped == 0 or #(GetEntityCoords(ped) - vector3(x, y, z)) > cfg.MaxCallerDistance then
            return notify(src, cfg.Messages.tooFar, 'error')
        end
    end

    kind = kind:lower()
    inProgress, lastGlobal, lastPlayer[src] = true, now(), now()
    SetTimeout((cfg.StrikeBlipSeconds * 1000) + cfg.CrashDelayMs + cfg.CleanupDelayMs, function() inProgress = false end)
    print(('[fbrp_airstrike] %s (%d) called a %s airstrike at %.1f, %.1f, %.1f'):format(GetPlayerName(src) or '?', src, kind, x, y, z))
    notify(src, cfg.Messages.confirmed:format(kind), 'inform')
    TriggerClientEvent('fbrp_airstrike:execute', src, kind, x, y, z)

    -- warn only the people standing near the target
    local target = vector3(x, y, z)
    for _, id in ipairs(GetPlayers()) do
        local ped = GetPlayerPed(id)
        if ped ~= 0 and #(GetEntityCoords(ped) - target) <= cfg.WarningRadius then
            TriggerClientEvent('fbrp_airstrike:warn', tonumber(id), kind)
        end
    end
end)

AddEventHandler('playerDropped', function() lastPlayer[source] = nil end)
