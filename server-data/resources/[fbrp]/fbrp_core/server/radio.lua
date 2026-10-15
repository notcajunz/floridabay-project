local channels = {}
local registeredChecks = {}
local ready = false

local function normalizeChannel(value)
    local channel = tonumber(value)
    if not channel then return 0 end
    return math.floor(channel * 100 + 0.5) / 100
end

local function formatChannel(value)
    return ('%.2f'):format(normalizeChannel(value))
end

local function playerOrg(source)
    local player = Player(tonumber(source))
    return player and player.state['fbrp:organization'] or nil
end

local function canJoin(source, channel)
    local spec = channels[normalizeChannel(channel)]
    if not spec then return true end
    if not spec.enabled then return false end
    if not spec.org_id then return true end
    local org = playerOrg(source)
    return org and tonumber(org.id) == tonumber(spec.org_id) or false
end

local function registerCheck(channel)
    channel = normalizeChannel(channel)
    if registeredChecks[channel] then return end
    exports['pma-voice']:addChannelCheck(channel, function(source)
        return canJoin(source, channel)
    end)
    registeredChecks[channel] = true
end

local function loadChannels()
    local nextChannels = {}
    for _, row in ipairs(MySQL.query.await([[
        SELECT r.*,o.name org_name,o.slug org_slug
        FROM radio_channels r LEFT JOIN organizations o ON o.id=r.org_id
        ORDER BY r.sort_order,r.channel
    ]])) do
        row.channel = normalizeChannel(row.channel)
        row.org_id = row.org_id and tonumber(row.org_id) or nil
        row.enabled = row.enabled == true or row.enabled == 1
        nextChannels[row.channel] = row
        registerCheck(row.channel)
    end
    channels = nextChannels
    ready = true
end

local function memberRows(channel)
    channel = normalizeChannel(channel)
    local members = {}
    if channel <= 0 then return members end
    local ok, players = pcall(function() return exports['pma-voice']:getPlayersInRadioChannel(channel) end)
    if not ok or type(players) ~= 'table' then return members end
    for source, talking in pairs(players) do
        source = tonumber(source)
        local player = source and Player(source)
        members[#members + 1] = {
            id=source,
            name=player and player.state['fbrp:name'] or GetPlayerName(source) or ('Player ' .. tostring(source)),
            talking=talking == true
        }
    end
    table.sort(members, function(a,b) return a.name:lower() < b.name:lower() end)
    return members
end

local function menuPayload(source)
    local current = normalizeChannel(Player(source).state.radioChannel)
    local available = {}
    local org = playerOrg(source)
    for _, spec in pairs(channels) do
        if spec.enabled and (not spec.org_id or (org and tonumber(org.id) == spec.org_id)) then
            available[#available + 1] = {
                id=tonumber(spec.id),channel=spec.channel,name=spec.name,description=spec.description,
                color=spec.color,restricted=spec.org_id ~= nil,organization=spec.org_name
            }
        end
    end
    table.sort(available, function(a,b) return a.channel < b.channel end)
    local currentSpec = channels[current]
    return {
        current=current,
        currentName=currentSpec and currentSpec.name or (current > 0 and ('Frequency ' .. formatChannel(current)) or 'Disconnected'),
        channels=available,
        members=memberRows(current),
        maxChannel=999.99
    }
end

local function push(source)
    TriggerClientEvent('fbrp:radio:data', source, menuPayload(source))
end

local function disconnect(source, message)
    exports['pma-voice']:setPlayerRadio(source, 0)
    if message then TriggerClientEvent('fbrp:notify', source, message, 'error') end
    push(source)
end

local function validateCurrent(source, explain)
    local player = Player(tonumber(source))
    if not player then return end
    local channel = normalizeChannel(player.state.radioChannel)
    if channel > 0 and not canJoin(source, channel) then
        disconnect(source, explain and 'You were disconnected because this frequency requires active organization duty.' or nil)
    end
end

MySQL.ready(function()
    while GetResourceState('pma-voice') ~= 'started' do Wait(250) end
    while true do
        local ok, err = pcall(loadChannels)
        if ok then break end
        print('[FBRP radio] Waiting for radio schema: ' .. tostring(err))
        Wait(500)
    end
    pcall(function()
        exports['pma-voice']:overrideRadioNameGetter(0, function(source)
            local player = Player(tonumber(source))
            return player and player.state['fbrp:name'] or GetPlayerName(source)
        end)
    end)
end)

RegisterNetEvent('fbrp:radio:request', function() if ready then push(source) end end)

RegisterNetEvent('fbrp:radio:join', function(raw)
    local source = source
    local channel = normalizeChannel(raw)
    if channel < 1 or channel > 999.99 then
        return TriggerClientEvent('fbrp:notify', source, 'Radio frequencies run from 1.00 to 999.99.', 'error')
    end
    if not canJoin(source, channel) then
        return TriggerClientEvent('fbrp:notify', source, 'That frequency is locked to an on-duty organization.', 'error')
    end
    exports['pma-voice']:setPlayerRadio(source, channel)
    TriggerClientEvent('fbrp:notify', source, ('Connected to radio %s.'):format(formatChannel(channel)), 'success')
    SetTimeout(200, function() if GetPlayerPing(source) > 0 then push(source) end end)
end)

RegisterNetEvent('fbrp:radio:leave', function() disconnect(source) end)

AddEventHandler('fbrp:organizationDutyChanged', function(source)
    SetTimeout(100, function() if GetPlayerPing(source) > 0 then validateCurrent(source, true) end end)
end)

AddEventHandler('fbrp:radio:reload', function()
    if not ready then return end
    local ok, err = pcall(loadChannels)
    if not ok then return print('[FBRP radio] Reload failed: ' .. tostring(err)) end
    for _, id in ipairs(GetPlayers()) do validateCurrent(tonumber(id), true) end
end)

CreateThread(function()
    while true do
        Wait(15000)
        if ready then
            local ok, err = pcall(loadChannels)
            if not ok then print('[FBRP radio] Refresh failed: ' .. tostring(err)) end
        end
    end
end)

RegisterCommand('frequency', function(source, args)
    if source <= 0 then return end
    if not args[1] or args[1] == 'off' or args[1] == '0' then return disconnect(source) end
    local channel = normalizeChannel(args[1])
    if channel < 1 or channel > 999.99 then return TriggerClientEvent('fbrp:notify', source, 'Usage: /frequency <1.00-999.99|off>', 'error') end
    if not canJoin(source, channel) then return TriggerClientEvent('fbrp:notify', source, 'That frequency is locked to an on-duty organization.', 'error') end
    exports['pma-voice']:setPlayerRadio(source, channel)
    TriggerClientEvent('fbrp:notify', source, ('Connected to radio %s.'):format(formatChannel(channel)), 'success')
end, false)
