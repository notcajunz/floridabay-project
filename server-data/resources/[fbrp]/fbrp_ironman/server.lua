-- FBRP Iron Man - server: the suit and every power are authorized here, the client script only acts on what the server allowed.
local cfg = IronManConfig
local threshold
local suited = {}
local lastLog = {}

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

local function log(src, text)
    if cfg.LogActions then
        print(('[fbrp_ironman] %s (%d) %s'):format(GetPlayerName(src) or '?', src, text))
    end
end

-- true = suit up, false = suit down
lib.callback.register('fbrp_ironman:toggle', function(src)
    if suited[src] then
        suited[src] = nil
        log(src, 'took the suit off')
        return { ok = true, suited = false }
    end
    if not authorized(src) then
        print(('[fbrp_ironman] DENIED %s (%d) tried to suit up'):format(GetPlayerName(src) or '?', src))
        return { ok = false }
    end
    suited[src] = true
    log(src, 'suited up')
    return { ok = true, suited = true }
end)

-- Audit trail for the powers; the client only reports while the server has it marked as suited.
RegisterNetEvent('fbrp_ironman:used', function(power)
    local src = source
    if not suited[src] or type(power) ~= 'string' or #power > 24 then return end
    local now = GetGameTimer()
    if lastLog[src] and now - lastLog[src] < 5000 then return end
    lastLog[src] = now
    log(src, ('used %s'):format(power))
end)

-- A client that cannot load the suit model says why, so the server console shows it.
RegisterNetEvent('fbrp_ironman:diag', function(why)
    local src = source
    if type(why) ~= 'string' or #why > 120 then return end
    local now = GetGameTimer()
    if lastLog[src] and now - lastLog[src] < 5000 then return end
    lastLog[src] = now
    log(src, ('could not load the suit model: %s'):format(why))
end)

CreateThread(function()
    while true do
        Wait(math.max(2, cfg.RecheckSeconds) * 1000)
        for src in pairs(suited) do
            if not GetPlayerName(src) then
                suited[src] = nil
            elseif not authorized(src) then
                suited[src] = nil
                log(src, 'lost access, suit revoked')
                TriggerClientEvent('fbrp_ironman:revoke', src)
            end
        end
    end
end)

AddEventHandler('playerDropped', function()
    suited[source] = nil
    lastLog[source] = nil
end)
