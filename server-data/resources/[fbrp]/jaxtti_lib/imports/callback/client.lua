local REQ = '__jaxtti_cb_req:%s'
local RES = '__jaxtti_cb_res:%s'
local TIMEOUT = GetConvarInt('jaxtti:callbackTimeout', 30000)

local pending = {}
local throttle = {}

RegisterNetEvent(RES:format(cache.resource), function(key, ...)
    local entry = pending[key]
    if not entry then return end
    pending[key] = nil
    entry(...)
end)

local function allowed(event, delay)
    if type(delay) ~= 'number' or delay <= 0 then return true end
    local now = GetGameTimer()
    if (throttle[event] or 0) > now then return false end
    throttle[event] = now + delay
    return true
end

local function newKey(event)
    local key
    repeat
        key = ('%s:%d:%d'):format(event, GetGameTimer(), math.random(0, 999999))
    until not pending[key]
    return key
end

local function trigger(event, delay, cb, ...)
    if not allowed(event, delay) then return end

    local key = newKey(event)
    local p = not cb and promise.new()

    pending[key] = function(...)
        local response = table.pack(...)
        if p then return p:resolve(response) end
        if cb then cb(table.unpack(response, 1, response.n)) end
    end

    TriggerServerEvent(REQ:format(event), cache.resource, key, ...)

    if p then
        SetTimeout(TIMEOUT, function()
            if pending[key] then
                pending[key] = nil
                p:reject(("callback '%s' timed out after %dms"):format(event, TIMEOUT))
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
    __call = function(_, event, delay, cb, ...)
        if type(cb) ~= 'function' and not (type(cb) == 'table' and getmetatable(cb) and getmetatable(cb).__call) then
            error('lib.callback: third argument must be a function (use lib.callback.await to yield)', 2)
        end
        return trigger(event, delay, cb, ...)
    end,
})

function callback.await(event, delay, ...)
    return trigger(event, delay, false, ...)
end

function callback.register(name, fn)
    RegisterNetEvent(REQ:format(name), function(resource, key, ...)
        TriggerServerEvent(RES:format(resource), key, respond(name, pcall(fn, ...)))
    end)
end

return callback
