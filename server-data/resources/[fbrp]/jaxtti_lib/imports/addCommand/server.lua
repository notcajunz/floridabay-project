local registered = {}

local function notifyError(source, msg)
    if source == 0 then
        print(('^1%s^0'):format(msg))
    else
        lib.notify(source, { title = 'Command', description = msg, type = 'error' })
    end
end

local function parseArgs(source, args, raw, params)
    if not params then return args end
    local out = {}

    for i, param in ipairs(params) do
        local value = args[i]

        if param.type == 'longString' then
            local parts = {}
            for j = i, #args do parts[#parts + 1] = args[j] end
            value = #parts > 0 and table.concat(parts, ' ') or nil
        elseif value ~= nil then
            if param.type == 'number' then
                value = tonumber(value)
                if not value then return nil, ('"%s" must be a number'):format(param.name) end
            elseif param.type == 'playerId' then
                if value == 'me' then value = source end
                value = tonumber(value)
                if not value or not GetPlayerName(value) then
                    return nil, ('Player "%s" is not online'):format(tostring(args[i]))
                end
            end
        end

        if value == nil and not param.optional then
            return nil, ('Missing "%s" (%s)'):format(param.name, param.help or param.type or 'value')
        end

        out[param.name] = value
        if param.type == 'longString' then break end
    end

    return out
end

return function(names, properties, cb)
    if type(properties) == 'function' then cb, properties = properties, {} end
    properties = properties or {}
    if type(names) ~= 'table' then names = { names } end

    local restricted = properties.restricted
    local params = properties.params

    for _, name in ipairs(names) do
        RegisterCommand(name, function(source, args, raw)
            source = tonumber(source) or 0
            local parsed, err = parseArgs(source, args, raw, params)
            if not parsed then return notifyError(source, err) end

            local ok, runErr = pcall(cb, source, parsed, raw)
            if not ok then
                print(('^1[%s] /%s errored: %s^0'):format(cache.resource, name, tostring(runErr)))
                notifyError(source, 'Command failed, check the server console')
            end
        end, restricted and true or false)

        if restricted then
            local groups = type(restricted) == 'table' and restricted or { restricted == true and 'group.admin' or restricted }
            for _, group in ipairs(groups) do
                exports.jaxtti_lib:addAce(group, ('command.%s'):format(name), true)
            end
        end

        local suggestionParams = {}
        if params then
            for i, p in ipairs(params) do
                suggestionParams[i] = { name = p.name, help = (p.help or p.type or '') .. (p.optional and ' (optional)' or '') }
            end
        end
        registered[#registered + 1] = { name = name, help = properties.help, params = suggestionParams, restricted = restricted and true or false }
    end

    if not registered.pending then
        registered.pending = true
        SetTimeout(0, function()
            registered.pending = nil
            local list = {}
            for _, s in ipairs(registered) do list[#list + 1] = s end
            exports.jaxtti_lib:registerSuggestions(cache.resource, list)
        end)
    end
end
