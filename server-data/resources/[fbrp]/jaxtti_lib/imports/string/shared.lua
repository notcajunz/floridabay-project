local CHARSET = {
    ['1'] = '0123456789',
    A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    a = 'abcdefghijklmnopqrstuvwxyz',
    ['.'] = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
}

function string.random(pattern, length)
    local out = {}
    local i = 1
    while i <= #pattern do
        local c = pattern:sub(i, i)
        if c == '^' then
            i = i + 1
            out[#out + 1] = pattern:sub(i, i)
        elseif CHARSET[c] then
            local set = CHARSET[c]
            local r = math.random(#set)
            out[#out + 1] = set:sub(r, r)
        else
            out[#out + 1] = c
        end
        i = i + 1
    end
    local result = table.concat(out)
    if length and #result < length then
        return result .. string.random(pattern, length - #result)
    end
    return length and result:sub(1, length) or result
end

function string.trim(s)
    return (s:gsub('^%s+', ''):gsub('%s+$', ''))
end

function string.split(s, sep)
    sep = sep or ','
    local out = {}
    for part in (s .. sep):gmatch('(.-)' .. sep:gsub('%p', '%%%0')) do
        out[#out + 1] = part
    end
    return out
end

function string.startswith(s, prefix) return s:sub(1, #prefix) == prefix end
function string.endswith(s, suffix) return suffix == '' or s:sub(-#suffix) == suffix end

function string.titlecase(s)
    return (s:gsub('(%a)([%w_\']*)', function(first, rest) return first:upper() .. rest:lower() end))
end

return string
