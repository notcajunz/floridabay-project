-- FBRP Jail - server
local cfg = JailConfig
local jailed = {}   -- [src] = { subject, name, remaining, total, reason, officer, callsign }

---------------------------------------------------------------- helpers

local function notify(src, description, kind, title)
    TriggerClientEvent('ox_lib:notify', src, {
        title = title or 'Jail', description = description, type = kind or 'inform',
        position = cfg.NotifyPosition, duration = 7000, icon = 'fa-solid fa-handcuffs',
    })
end

local function clean(value, max)
    value = tostring(value or ''):gsub('[%c]', ' '):gsub('%^%d', ''):gsub('~', ''):gsub('^%s+', ''):gsub('%s+$', '')
    return value:sub(1, max or 200)
end

local function formatTime(seconds)
    seconds = math.max(0, math.floor(seconds or 0))
    local h, m, s = seconds // 3600, (seconds % 3600) // 60, seconds % 60
    if h > 0 then return ('%dh %dm'):format(h, m) end
    if m > 0 then return ('%dm %02ds'):format(m, s) end
    return ('%ds'):format(s)
end

-- fbrp_core permission check (police permissions only pass while on /duty with a LEO department)
local function corePermission(src, ace)
    local ok, allowed = pcall(function() return exports.fbrp_core:HasPermission(src, ace) end)
    if ok then return allowed == true end
    return IsPlayerAceAllowed(src, ace)
end

local function hasAny(src, list)
    if src <= 0 then return true end
    for _, ace in ipairs(list) do
        if corePermission(src, ace) then return true end
    end
    return false
end

local function deny(src, list)
    -- has the ace but isn't clocked in -> tell them to /duty
    for _, ace in ipairs(list) do
        if IsPlayerAceAllowed(src, ace) then
            return notify(src, 'You need to be on duty with a law enforcement department (/duty) to do that.', 'error')
        end
    end
    notify(src, 'You do not have permission to do that.', 'error')
end

local function identifier(src, kind)
    for _, id in ipairs(GetPlayerIdentifiers(src)) do
        if id:sub(1, #kind + 1) == kind .. ':' then return id end
    end
end

-- jail time is saved per character (fbrp_core), falling back to the license
local function subjectOf(src)
    local characterId = tonumber(Player(src).state['fbrp:characterId'])
    if characterId then return 'char:' .. characterId end
    return identifier(src, 'license') or ('src:' .. src)
end

local function nameOf(src)
    local state = Player(src).state
    return state['fbrp:characterName'] or state['fbrp:name'] or GetPlayerName(src) or ('Player ' .. src)
end

local function callsignOf(src)
    if src <= 0 then return '' end
    local ok, discord = pcall(function() return exports.fbrp_core:GetPlayerDiscord(src) end)
    if not ok or not discord then return '' end
    local found, row = pcall(MySQL.single.await, 'SELECT callsign FROM mdt_units WHERE discord_id = ?', { discord })
    return found and row and row.callsign and tostring(row.callsign) or ''
end

-- release spot for the current AOP
local function releaseSpot()
    local aop = (' ' .. tostring(GlobalState['fbrp:aop'] or 'Statewide'):lower() .. ' '):gsub('[^%w ]', ' ')
    for _, spot in ipairs(cfg.ReleaseSpots) do
        for _, word in ipairs(spot.match) do
            word = word:lower()
            -- short words (ls) must be a whole word, longer ones can be anywhere
            local hit = #word <= 3 and aop:find(' ' .. word .. ' ', 1, true) or (#word > 3 and aop:find(word, 1, true))
            if hit then return spot end
        end
    end
    return cfg.DefaultRelease
end

local function info(j)
    return { remaining = j.remaining, total = j.total, reason = j.reason, officer = j.officer, callsign = j.callsign }
end

---------------------------------------------------------------- database

CreateThread(function()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS fbrp_jail (
            subject VARCHAR(80) NOT NULL PRIMARY KEY,
            name VARCHAR(100) NULL,
            seconds_total INT NOT NULL,
            seconds_remaining INT NOT NULL,
            reason VARCHAR(255) NULL,
            officer VARCHAR(100) NULL,
            callsign VARCHAR(32) NULL,
            created_at BIGINT NOT NULL
        )
    ]])
end)

local function save(src)
    local j = jailed[src]
    if not j then return end
    MySQL.update('UPDATE fbrp_jail SET seconds_remaining = ? WHERE subject = ?', { math.max(0, math.floor(j.remaining)), j.subject })
end

---------------------------------------------------------------- jail / release

local function putInJail(src, j, fresh)
    jailed[src] = j
    Player(src).state:set('fbrp:jailed', true, true)
    -- take off cuffs / zip ties from fbrp_core so they can walk around the yard
    Player(src).state:set('fbrp:restrained', nil, true)
    TriggerClientEvent('fbrp:restraints:clear', src)
    TriggerClientEvent('fbrp_jail:enter', src, info(j), fresh == true)
end

local function jailPlayer(target, minutes, reason, officerName, callsign)
    target = tonumber(target)
    if not target or not GetPlayerName(target) then return false, 'That player is not online.' end
    if jailed[target] then return false, ('%s is already in jail (%s left).'):format(nameOf(target), formatTime(jailed[target].remaining)) end
    minutes = math.floor(tonumber(minutes) or 0)
    if minutes < 1 or minutes > cfg.MaxMinutes then return false, ('Jail time must be 1 - %d minutes.'):format(cfg.MaxMinutes) end

    local seconds = minutes * 60
    local j = {
        subject = subjectOf(target), name = nameOf(target), remaining = seconds, total = seconds,
        reason = clean(reason, 250) ~= '' and clean(reason, 250) or 'No reason given',
        officer = clean(officerName, 100), callsign = clean(callsign, 32),
    }
    MySQL.query.await([[
        INSERT INTO fbrp_jail (subject, name, seconds_total, seconds_remaining, reason, officer, callsign, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE name = VALUES(name), seconds_total = VALUES(seconds_total), seconds_remaining = VALUES(seconds_remaining),
            reason = VALUES(reason), officer = VALUES(officer), callsign = VALUES(callsign), created_at = VALUES(created_at)
    ]], { j.subject, j.name, seconds, seconds, j.reason, j.officer, j.callsign, os.time() })

    putInJail(target, j, true)
    local by = j.callsign ~= '' and ('%s (%s)'):format(j.officer, j.callsign) or j.officer
    notify(target, ('You were jailed for %s by %s.\nReason: %s'):format(formatTime(seconds), by, j.reason), 'error')
    print(('[fbrp_jail] %s [%d] jailed for %d min by %s - %s'):format(j.name, target, minutes, by, j.reason))
    return true, ('%s jailed for %s.'):format(j.name, formatTime(seconds))
end

local function releasePlayer(src, why)
    local j = jailed[src]
    if not j then return false end
    jailed[src] = nil
    MySQL.update('DELETE FROM fbrp_jail WHERE subject = ?', { j.subject })
    Player(src).state:set('fbrp:jailed', nil, true)
    local spot = releaseSpot()
    TriggerClientEvent('fbrp_jail:release', src, spot.coords, spot.label)
    notify(src, why or ('Your time is up. You were released at %s.'):format(spot.label), 'success')
    return true
end

-- countdown (only while the player is online)
CreateThread(function()
    local tick = 0
    while true do
        Wait(1000)
        tick = tick + 1
        for src, j in pairs(jailed) do
            if not GetPlayerName(src) then
                jailed[src] = nil
            else
                j.remaining = j.remaining - 1
                if j.remaining <= 0 then
                    releasePlayer(src)
                elseif tick % 10 == 0 then
                    TriggerClientEvent('fbrp_jail:sync', src, info(j))
                end
            end
        end
        if tick % 30 == 0 then
            for src in pairs(jailed) do save(src) end
        end
    end
end)

-- client says it's loaded (spawned / picked a character): put them back if they still have time
RegisterNetEvent('fbrp_jail:ready', function()
    local src = source
    if jailed[src] then return TriggerClientEvent('fbrp_jail:enter', src, info(jailed[src]), false) end
    local row = MySQL.single.await('SELECT * FROM fbrp_jail WHERE subject = ?', { subjectOf(src) })
    if not row or (tonumber(row.seconds_remaining) or 0) <= 0 then return end
    putInJail(src, {
        subject = row.subject, name = nameOf(src), remaining = tonumber(row.seconds_remaining), total = tonumber(row.seconds_total),
        reason = row.reason or 'No reason given', officer = row.officer or '', callsign = row.callsign or '',
    }, false)
    notify(src, ('You still have %s left in jail.'):format(formatTime(row.seconds_remaining)), 'warning')
end)

AddEventHandler('playerDropped', function()
    local src = source
    save(src)
    jailed[src] = nil
end)

AddEventHandler('onResourceStop', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    for src in pairs(jailed) do save(src) end
end)

---------------------------------------------------------------- the /jail dialog

local function openDialog(src, target)
    if not hasAny(src, cfg.JailAces) then return deny(src, cfg.JailAces) end
    local callsign = callsignOf(src)
    TriggerClientEvent('fbrp_jail:dialog', src, {
        target = tonumber(target),
        callsign = callsign ~= '' and ('#' .. callsign:gsub('^#', '')) or '',
        presets = cfg.TimePresets, default = cfg.DefaultMinutes, max = cfg.MaxMinutes,
    })
end

local lastSubmit = {}
RegisterNetEvent('fbrp_jail:submit', function(data)
    local src = source
    if type(data) ~= 'table' then return end
    if lastSubmit[src] and GetGameTimer() - lastSubmit[src] < 1500 then return end
    lastSubmit[src] = GetGameTimer()
    if not hasAny(src, cfg.JailAces) then return deny(src, cfg.JailAces) end

    local target = tonumber(data.target)
    if not target or not GetPlayerName(target) then return notify(src, 'No player with that ID is online.', 'error') end
    local staff = hasAny(src, cfg.StaffAces)
    if target == src and not staff then return notify(src, 'You cannot jail yourself.', 'error') end
    if (cfg.MaxDistance or 0) > 0 and not staff then
        local a, b = GetEntityCoords(GetPlayerPed(src)), GetEntityCoords(GetPlayerPed(target))
        if #(a - b) > cfg.MaxDistance then return notify(src, 'You need to be with the suspect to jail them.', 'error') end
    end

    local callsign = clean(data.callsign, 32)
    if callsign == '' then return notify(src, 'Enter your callsign.', 'error') end
    local reason = clean(data.reason, 250)
    if reason == '' then return notify(src, 'Enter a reason.', 'error') end

    local ok, message = jailPlayer(target, data.minutes, reason, nameOf(src), callsign)
    notify(src, message, ok and 'success' or 'error')
end)

AddEventHandler('playerDropped', function() lastSubmit[source] = nil end)

---------------------------------------------------------------- commands

-- /jail [id]  -> ox_lib dialog
RegisterCommand('jail', function(src, args)
    if src <= 0 then
        -- console: jail <id> <minutes> <reason>
        local ok, message = jailPlayer(args[1], args[2], table.concat(args, ' ', 3), 'Console', 'CONSOLE')
        return print('[fbrp_jail] ' .. message)
    end
    openDialog(src, args[1])
end, false)

-- /unjail <id>
RegisterCommand('unjail', function(src, args)
    if src > 0 and not hasAny(src, cfg.ReleaseAces) then return deny(src, cfg.ReleaseAces) end
    local target = tonumber(args[1])
    if not target or not jailed[target] then
        if src <= 0 then return print('[fbrp_jail] Usage: unjail <id of someone in jail>') end
        return notify(src, 'Usage: /unjail <id of someone in jail>', 'error')
    end
    local by = src > 0 and nameOf(src) or 'Console'
    releasePlayer(target, ('You were released early by %s.'):format(by))
    if src > 0 then notify(src, ('%s was released.'):format(nameOf(target)), 'success') end
end, false)

-- /checkjailtime [id]
RegisterCommand('checkjailtime', function(src, args)
    local target = tonumber(args[1])
    if target and target ~= src then
        if src > 0 and not hasAny(src, cfg.CheckOthersAces) then return deny(src, cfg.CheckOthersAces) end
        local j = jailed[target]
        if not j then return notify(src, ('%s is not in jail.'):format(GetPlayerName(target) and nameOf(target) or ('ID ' .. target)), 'inform') end
        return notify(src, ('%s: %s left of %s.\nReason: %s\nJailed by: %s %s'):format(nameOf(target), formatTime(j.remaining), formatTime(j.total), j.reason, j.officer, j.callsign), 'inform')
    end
    if src <= 0 then return end
    local j = jailed[src]
    if not j then return notify(src, 'You are not in jail.', 'inform') end
    notify(src, ('%s left of %s.\nReason: %s\nJailed by: %s %s'):format(formatTime(j.remaining), formatTime(j.total), j.reason, j.officer, j.callsign), 'warning')
end, false)

---------------------------------------------------------------- exports (used by fbrp_core)

exports('JailPlayer', function(target, minutes, reason, officer, callsign)
    local officerName = officer
    if tonumber(officer) then
        local id = tonumber(officer)
        officerName = id > 0 and nameOf(id) or 'Console'
        callsign = callsign or (id > 0 and callsignOf(id) or '')
    end
    return jailPlayer(target, minutes, reason, officerName or 'Florida Bay Courts', callsign or '')
end)
exports('OpenDialog', openDialog)
exports('IsJailed', function(src) return jailed[tonumber(src)] ~= nil end)
exports('GetJailTime', function(src) local j = jailed[tonumber(src)]; return j and j.remaining or 0 end)
exports('ReleasePlayer', function(src, why) return releasePlayer(tonumber(src), why) end)
