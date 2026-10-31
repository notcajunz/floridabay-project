local serverName = GetConvar('jaxtti:serverName', '')
CreateThread(function()
    if serverName ~= '' then return end
    local ok, name = pcall(function() return exports.jaxtti_core:GetServerName() end)
    serverName = (ok and name) or GetConvar('sv_hostname', 'FiveM')
end)
local ACCENT = 0x3B82F6
local queue = {}
local warned = false

local function webhookFor(event)
    local specific = GetConvar(('jaxtti:webhook:%s'):format(event), '')
    if specific ~= '' then return specific end
    return GetConvar('jaxtti:webhook', '')
end

local function identifiers(src)
    local ids = {}
    for _, id in ipairs(GetPlayerIdentifiers(src)) do
        local kind = id:match('^(%w+):')
        if kind == 'license' or kind == 'discord' or kind == 'fivem' or kind == 'steam' then
            ids[#ids + 1] = kind == 'discord' and ('discord: <@%s>'):format(id:sub(9)) or id
        end
    end
    return table.concat(ids, '\n')
end

local function logger(source, event, message, fields)
    local url = webhookFor(event)
    if url == '' then
        if not warned then
            warned = true
            print('^3[jaxtti_lib] logger: no webhook set (set jaxtti:webhook "..." in server.cfg). Logs go to console only.^0')
        end
        print(('[jaxtti log] [%s] %s'):format(event, message))
        return
    end

    local embedFields = {}
    local src = tonumber(source)
    if src and src > 0 and GetPlayerName(src) then
        embedFields[#embedFields + 1] = { name = 'Player', value = ('%s (ID %d)'):format(GetPlayerName(src), src), inline = true }
        local ids = identifiers(src)
        if ids ~= '' then embedFields[#embedFields + 1] = { name = 'Identifiers', value = ids, inline = false } end
    end

    if type(fields) == 'table' then
        for k, v in pairs(fields) do
            embedFields[#embedFields + 1] = { name = tostring(k), value = tostring(v), inline = true }
        end
    end

    queue[#queue + 1] = {
        url = url,
        body = json.encode({
            username = serverName,
            embeds = { {
                title = event,
                description = message,
                color = ACCENT,
                fields = embedFields,
                footer = { text = ('%s · %s'):format(serverName, GetCurrentResourceName()) },
                timestamp = os.date('!%Y-%m-%dT%H:%M:%SZ'),
            } },
        }),
    }
end

CreateThread(function()
    while true do
        local item = table.remove(queue, 1)
        if item then
            PerformHttpRequest(item.url, function(status)
                if status == 429 then
                    table.insert(queue, 1, item)
                elseif status < 200 or status >= 300 then
                    print(('^1[jaxtti_lib] logger: Discord returned %s^0'):format(status))
                end
            end, 'POST', item.body, { ['Content-Type'] = 'application/json' })
            Wait(600)
        else
            Wait(250)
        end
    end
end)

exports('logger', logger)
