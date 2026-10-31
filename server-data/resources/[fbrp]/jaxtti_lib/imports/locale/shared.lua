local strings = {}

local function load(lang)
    local raw = LoadResourceFile(cache.resource, ('locales/%s.json'):format(lang))
    if not raw then return nil end
    local ok, data = pcall(json.decode, raw)
    return ok and data or nil
end

function locale(key, ...)
    local str = strings[key]
    if not str then return key end
    if select('#', ...) > 0 then
        local ok, out = pcall(string.format, str, ...)
        return ok and out or str
    end
    return str
end

return function(lang)
    lang = lang or GetConvar('jaxtti:locale', 'en')
    local data = load(lang) or (lang ~= 'en' and load('en')) or {}

    for k, v in pairs(data) do
        if type(v) == 'string' then
            data[k] = v:gsub('%${([%w_%.]+)}', function(ref) return data[ref] or ref end)
        end
    end

    strings = data
    return strings
end
