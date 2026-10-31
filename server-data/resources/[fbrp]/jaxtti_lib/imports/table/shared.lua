function table.contains(tbl, value)
    if type(value) ~= 'table' then
        for _, v in pairs(tbl) do
            if v == value then return true end
        end
        return false
    end
    local found = 0
    for _, want in pairs(value) do
        for _, v in pairs(tbl) do
            if v == want then found = found + 1; break end
        end
    end
    return found == #value
end

function table.matches(a, b)
    if type(a) ~= 'table' or type(b) ~= 'table' then return a == b end
    for k, v in pairs(a) do
        if not table.matches(v, b[k]) then return false end
    end
    for k in pairs(b) do
        if a[k] == nil then return false end
    end
    return true
end

function table.deepclone(tbl)
    if type(tbl) ~= 'table' then return tbl end
    local copy = {}
    for k, v in pairs(tbl) do copy[k] = table.deepclone(v) end
    return setmetatable(copy, getmetatable(tbl))
end

function table.merge(into, from, addDuplicateNumbers)
    for k, v in pairs(from) do
        local cur = into[k]
        if type(cur) == 'table' and type(v) == 'table' then
            table.merge(cur, v, addDuplicateNumbers)
        elseif addDuplicateNumbers and type(cur) == 'number' and type(v) == 'number' then
            into[k] = cur + v
        else
            into[k] = v
        end
    end
    return into
end

function table.count(tbl)
    local n = 0
    for _ in pairs(tbl) do n = n + 1 end
    return n
end

function table.wipe(tbl)
    for k in pairs(tbl) do tbl[k] = nil end
    return tbl
end

function table.shuffle(tbl)
    for i = #tbl, 2, -1 do
        local j = math.random(i)
        tbl[i], tbl[j] = tbl[j], tbl[i]
    end
    return tbl
end

function table.freeze(tbl)
    return setmetatable({}, {
        __index = tbl,
        __newindex = function() error('attempt to modify a frozen table', 2) end,
        __len = function() return #tbl end,
        __pairs = function() return next, tbl, nil end,
    })
end

return table
