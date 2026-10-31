local cfg = PersonalPilotConfig
local sessions = {}
local threshold

local function notify(src, text, kind)
    TriggerClientEvent('fbrp_personalpilot:notify', src, text, kind or 'inform')
end

local function core(name, ...)
    local args = { ... }
    local ok, result = pcall(function()
        return exports.fbrp_core[name](exports.fbrp_core, table.unpack(args))
    end)
    return ok and result or nil
end

local function minimumRank()
    local now = os.time()
    if threshold and now - threshold.at < 300 then return threshold.rank end

    local rank = MySQL.scalar.await([[
        SELECT rank_order
          FROM ace_groups
         WHERE staff_only=TRUE AND (name=? OR label=?)
         ORDER BY rank_order
         LIMIT 1
    ]], { cfg.RankName, cfg.RankLabel })

    threshold = { at = now, rank = tonumber(rank) }
    return threshold.rank
end

local function authorize(src)
    if cfg.RequireOnDuty and core('IsStaffOnDuty', src) ~= true then
        return false, cfg.Messages.notOnDuty
    end

    local rank, need = core('GetStaffRank', src), minimumRank()
    if type(rank) ~= 'table' or not need or (tonumber(rank.rank) or -1) < need then
        return false, cfg.Messages.denied
    end
    return true
end

local function validCoordinate(value, limit)
    value = tonumber(value)
    return value and value == value and math.abs(value) <= limit and value or nil
end

RegisterNetEvent('fbrp_personalpilot:request', function(model, x, y, z)
    local src = source
    if sessions[src] then return notify(src, cfg.Messages.busy, 'error') end

    local ok, reason = authorize(src)
    if not ok then
        print(('[fbrp_personalpilot] DENIED %s (%d)'):format(GetPlayerName(src) or '?', src))
        return notify(src, reason, 'error')
    end

    x = validCoordinate(x, 10000)
    y = validCoordinate(y, 10000)
    z = validCoordinate(z, 3000)
    if not (x and y and z) then return notify(src, cfg.Messages.noWaypoint, 'error') end

    if model ~= nil then
        model = tostring(model):lower():gsub('[^%w_]', '')
        if #model < 1 or #model > 40 then return notify(src, cfg.Messages.badAircraft, 'error') end
    end

    sessions[src] = true
    print(('[fbrp_personalpilot] %s (%d) requested a flight%s to %.1f, %.1f'):format(
        GetPlayerName(src) or '?', src, model and (' in ' .. model) or '', x, y
    ))
    TriggerClientEvent('fbrp_personalpilot:start', src, model, x, y, z)

    SetTimeout((cfg.FlightTimeoutMinutes * 60 + cfg.BoardingTimeoutSeconds + cfg.TaxiTimeoutSeconds * 3
        + cfg.PostFlightStandbySeconds + cfg.CleanupWaitSeconds + 60) * 1000, function()
        sessions[src] = nil
    end)
end)

RegisterNetEvent('fbrp_personalpilot:finished', function(status)
    local src = source
    if not sessions[src] then return end
    sessions[src] = nil
    print(('[fbrp_personalpilot] %s (%d) flight ended: %s'):format(
        GetPlayerName(src) or '?', src, tostring(status):sub(1, 32)
    ))
end)

RegisterNetEvent('fbrp_personalpilot:cancel', function()
    local src = source
    if not sessions[src] then return end
    sessions[src] = nil
    TriggerClientEvent('fbrp_personalpilot:cancelled', src)
end)

AddEventHandler('playerDropped', function()
    sessions[source] = nil
end)
