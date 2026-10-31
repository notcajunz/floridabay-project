local LEVELS = { error = 1, warn = 2, info = 3, verbose = 4, debug = 5 }
local COLORS = { error = '^1', warn = '^3', info = '^7', verbose = '^4', debug = '^6' }

local function currentLevel()
    local value = GetConvar(('jaxtti:printlevel:%s'):format(cache.resource), GetConvar('jaxtti:printlevel', 'info'))
    return LEVELS[value] or LEVELS.info
end

local function stringify(...)
    local args = table.pack(...)
    for i = 1, args.n do
        local v = args[i]
        if type(v) == 'table' then
            local ok, encoded = pcall(json.encode, v, { indent = true })
            args[i] = ok and encoded or tostring(v)
        else
            args[i] = tostring(v)
        end
    end
    return table.concat(args, ' ', 1, args.n)
end

local printer = {}

for level, rank in pairs(LEVELS) do
    printer[level] = function(...)
        if rank > currentLevel() then return end
        print(('%s[%s] [%s]^7 %s'):format(COLORS[level], cache.resource, level:upper(), stringify(...)))
    end
end

return printer
