local REQ = '__jaxtti_cb_req:%s'
local RES = '__jaxtti_cb_res:%s'
local TIMEOUT = GetConvarInt('jaxtti:callbackTimeout', 30000)

local pending = {}

RegisterNetEvent(RES:format(cache.resource), function(key, ...)
    local entry = pending[key]
    if not entry or entry.player ~= source then return end
    pending[key] = nil
    entry.cb(...)
end)

local function newKey(event)
    local key
    repeat
        key = ('%s:%d:%d'):format(event, os.time(), math.random(0, 999999))
    until not pending[key]
    return key
end

local function trigger(event, playerId, cb, ...)
    playerId = tonumber(playerId)
    if not playerId or not GetPlayerName(playerId) then
        error(("lib.callback: player '%s' does not exist"):format(tostring(playerId)), 3)
    end

    local key = newKey(event)
    local p = not cb and promise.new()

    pending[key] = {
        player = playerId,
        cb = function(...)
            local response = table.pack(...)
            if p then return p:resolve(response) end
            if cb then cb(table.unpack(response, 1, response.n)) end
        end,
    }

    TriggerClientEvent(REQ:format(event), playerId, cache.resource, key, ...)

    if p then
        SetTimeout(TIMEOUT, function()
            if pending[key] then
                pending[key] = nil
                p:reject(("callback '%s' to player %d timed out"):format(event, playerId))
            end
        end)
        local response = Citizen.Await(p)
        return table.unpack(response, 1, response.n)
    end
end

local function respond(event, ok, ...)
    if not ok then
        print(('^1[jaxtti_lib] callback "%s" errored: %s^0'):format(event, tostring((...))))
        return
    end
    return ...
end

local callback = setmetatable({}, {
    __call = function(_, event, playerId, cb, ...)
        return trigger(event, playerId, cb, ...)
    end,
})

function callback.await(event, playerId, ...)
    return trigger(event, playerId, false, ...)
end

function callback.register(name, fn)
    RegisterNetEvent(REQ:format(name), function(resource, key, ...)
        local src = source
        if type(resource) ~= 'string' or type(key) ~= 'string' then return end
        TriggerClientEvent(RES:format(resource), src, key, respond(name, pcall(fn, src, ...)))
    end)
end

return callback
