function math.round(value, decimals)
    local mult = 10 ^ (decimals or 0)
    local n = math.floor(value * mult + 0.5) / mult
    return (decimals or 0) == 0 and math.tointeger(n) or n
end

function math.clamp(value, min, max)
    if value < min then return min end
    if value > max then return max end
    return value
end

function math.lerp(a, b, t) return a + (b - a) * t end

function math.groupdigits(value, separator)
    separator = separator or ','
    local s = tostring(value)
    local sign, int, frac = s:match('^([-]?)(%d+)(%.?%d*)$')
    if not int then return s end
    int = int:reverse():gsub('(%d%d%d)', '%1' .. separator):reverse()
    if int:sub(1, #separator) == separator then int = int:sub(#separator + 1) end
    return sign .. int .. frac
end

function math.money(value, symbol)
    return (symbol or '$') .. math.groupdigits(math.round(value))
end

function math.tovector(input)
    if type(input) == 'string' then
        local nums = {}
        for n in input:gmatch('[-%d%.]+') do nums[#nums + 1] = tonumber(n) end
        input = nums
    end
    if type(input) ~= 'table' then return input end
    local x, y, z, w = input.x or input[1], input.y or input[2], input.z or input[3], input.w or input[4]
    if w then return vector4(x, y, z, w) end
    if z then return vector3(x, y, z) end
    return vector2(x, y)
end

function math.dist(a, b)
    local dx, dy, dz = a.x - b.x, a.y - b.y, (a.z or 0) - (b.z or 0)
    return math.sqrt(dx * dx + dy * dy + dz * dz)
end

return math
