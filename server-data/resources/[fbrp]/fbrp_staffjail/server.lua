-- FBRP Staff Jail - server
local cfg = StaffJailConfig
local jailed = {} -- [src] = { key, name, remaining, total, reason, staff, returnTo }

---------------------------------------------------------------- helpers

local function notify(src, description, kind)
    if src <= 0 then return print('[fbrp_staffjail] ' .. description) end
    TriggerClientEvent('ox_lib:notify', src, {
        title = 'Staff Jail', description = description, type = kind or 'inform',
        position = cfg.NotifyPosition, duration = 7000, icon = 'fa-solid fa-user-lock',
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

local function core(name, ...)
    local args = { ... }
    local ok, result = pcall(function() return exports.fbrp_core[name](exports.fbrp_core, table.unpack(args)) end)
    if ok then return result end
    return nil
end

local function onDuty(src)
    return core('IsStaffOnDuty', src) == true
end

local function hasAny(src, list)
    if src <= 0 then return true end
    for _, ace in ipairs(list) do
        if core('HasPermission', src, ace) == true then return true end
    end
    return false
end

-- clocked in AND has the permission
local function allowed(src, list)
    if src <= 0 then return true end
    if not onDuty(src) then
        notify(src, 'You need to be clocked in as staff (/clockin) to use the staff jail.', 'error')
        return false
    end
    if not hasAny(src, list) then
        notify(src, 'You do not have permission to use the staff jail.', 'error')
        return false
    end
    return true
end

local function rankOf(src)
    local rank = core('GetStaffRank', src)
    return type(rank) == 'table' and tonumber(rank.rank) or nil, type(rank) == 'table' and rank.label or nil
end

local function identifier(src, kind)
    for _, id in ipairs(GetPlayerIdentifiers(src)) do
        if id:sub(1, #kind + 1) == kind .. ':' then return id end
    end
end

-- staff jail follows the player (all characters), so it's keyed on the license
local function keyOf(src)
    return identifier(src, 'license') or identifier(src, 'discord') or ('src:' .. src)
end

local function nameOf(src)
    local state = Player(src).state
    local character = state['fbrp:characterName'] or state['fbrp:name']
    local player = GetPlayerName(src) or ('ID ' .. src)
    return character and ('%s (%s)'):format(character, player) or player
end

local function staffName(src)
    if src <= 0 then return 'Console' end
    local _, label = rankOf(src)
    local name = GetPlayerName(src) or ('ID ' .. src)
    return label and ('%s [%s]'):format(name, label) or name
end

local function info(j)
    return { remaining = j.remaining, total = j.total, reason = j.reason, staff = j.staff }
end

local function webhook(title, fields, color)
    local url = GetConvar(cfg.WebhookConvar, '')
    if url == '' then return end
    local list = {}
    for _, f in ipairs(fields) do list[#list + 1] = { name = f[1], value = tostring(f[2] ~= '' and f[2] or '-'), inline = f[3] == true } end
    PerformHttpRequest(url, function() end, 'POST', json.encode({
        username = 'FBRP Staff Jail',
        embeds = { { title = title, color = color or 16753920, fields = list, timestamp = os.date('!%Y-%m-%dT%H:%M:%SZ') } },
    }), { ['Content-Type'] = 'application/json' })
end

---------------------------------------------------------------- database

CreateThread(function()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS fbrp_staffjail (
            player_key VARCHAR(80) NOT NULL PRIMARY KEY,
            name VARCHAR(120) NULL,
            seconds_total INT NOT NULL,
            seconds_remaining INT NOT NULL,
            reason VARCHAR(255) NULL,
            staff VARCHAR(120) NULL,
            return_x FLOAT NULL, return_y FLOAT NULL, return_z FLOAT NULL, return_h FLOAT NULL,
            created_at BIGINT NOT NULL
        )
    ]])
end)

local function save(src)
    local j = jailed[src]
    if j then MySQL.update('UPDATE fbrp_staffjail SET seconds_remaining = ? WHERE player_key = ?', { math.max(0, math.floor(j.remaining)), j.key }) end
end

---------------------------------------------------------------- jail / release

local function putInJail(src, j, fresh)
    jailed[src] = j
    Player(src).state:set('fbrp:staffJailed', true, true)
    Player(src).state:set('fbrp:restrained', nil, true)
    TriggerClientEvent('fbrp:restraints:clear', src)
    TriggerClientEvent('fbrp_staffjail:enter', src, info(j), fresh == true)
end

local function staffJail(target, minutes, reason, actor)
    target = tonumber(target)
    if not target or not GetPlayerName(target) then return false, 'That player is not online.' end
    if jailed[target] then return false, ('%s is already in staff jail (%s left).'):format(nameOf(target), formatTime(jailed[target].remaining)) end
    minutes = math.floor(tonumber(minutes) or 0)
    if minutes < 1 or minutes > cfg.MaxMinutes then return false, ('Time must be 1 - %d minutes.'):format(cfg.MaxMinutes) end
    reason = clean(reason, 250)
    if reason == '' then return false, 'Enter a reason.' end

    if actor > 0 and cfg.ProtectHigherRanks then
        if target == actor then return false, 'You cannot staff-jail yourself.' end
        local mine, theirs = rankOf(actor), rankOf(target)
        if theirs and (not mine or theirs >= mine) then return false, 'You cannot staff-jail someone with the same or a higher staff rank.' end
    end

    local ped = GetPlayerPed(target)
    local pos = ped > 0 and GetEntityCoords(ped) or nil
    local heading = ped > 0 and GetEntityHeading(ped) or 0.0
    local seconds = minutes * 60
    local j = {
        key = keyOf(target), name = nameOf(target), remaining = seconds, total = seconds, reason = reason,
        staff = staffName(actor), returnTo = pos and vector4(pos.x, pos.y, pos.z, heading) or nil,
    }
    MySQL.query.await([[
        INSERT INTO fbrp_staffjail (player_key, name, seconds_total, seconds_remaining, reason, staff, return_x, return_y, return_z, return_h, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE name = VALUES(name), seconds_total = VALUES(seconds_total), seconds_remaining = VALUES(seconds_remaining),
            reason = VALUES(reason), staff = VALUES(staff), return_x = VALUES(return_x), return_y = VALUES(return_y),
            return_z = VALUES(return_z), return_h = VALUES(return_h), created_at = VALUES(created_at)
    ]], { j.key, j.name, seconds, seconds, reason, j.staff, pos and pos.x, pos and pos.y, pos and pos.z, heading, os.time() })

    putInJail(target, j, true)
    notify(target, ('You were put in staff jail for %s by %s.\nReason: %s'):format(formatTime(seconds), j.staff, reason), 'error')
    print(('[fbrp_staffjail] %s [%d] staff-jailed for %d min by %s - %s'):format(j.name, target, minutes, j.staff, reason))
    webhook('Player staff-jailed', { { 'Player', ('%s [%d]'):format(j.name, target), true }, { 'Time', formatTime(seconds), true },
        { 'Staff', j.staff, true }, { 'Reason', reason } }, 16729156)
    return true, ('%s staff-jailed for %s.'):format(j.name, formatTime(seconds))
end

local function release(src, why, by)
    local j = jailed[src]
    if not j then return false end
    jailed[src] = nil
    MySQL.update('DELETE FROM fbrp_staffjail WHERE player_key = ?', { j.key })
    Player(src).state:set('fbrp:staffJailed', nil, true)
    TriggerClientEvent('fbrp_staffjail:release', src, j.returnTo or cfg.FallbackRelease, j.returnTo == nil)
    notify(src, why or 'Your staff jail time is up.', 'success')
    webhook('Staff jail released', { { 'Player', ('%s [%d]'):format(j.name, src), true }, { 'By', by or 'Time served', true } }, 5763719)
    return true
end

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
                    release(src)
                elseif tick % 10 == 0 then
                    TriggerClientEvent('fbrp_staffjail:sync', src, info(j))
                end
            end
        end
        if tick % 30 == 0 then for src in pairs(jailed) do save(src) end end
    end
end)

-- client is loaded: put them back if they still have time (relogging doesn't get you out)
RegisterNetEvent('fbrp_staffjail:ready', function()
    local src = source
    if jailed[src] then return TriggerClientEvent('fbrp_staffjail:enter', src, info(jailed[src]), false) end
    local row = MySQL.single.await('SELECT * FROM fbrp_staffjail WHERE player_key = ?', { keyOf(src) })
    if not row or (tonumber(row.seconds_remaining) or 0) <= 0 then return end
    putInJail(src, {
        key = row.player_key, name = nameOf(src), remaining = tonumber(row.seconds_remaining), total = tonumber(row.seconds_total),
        reason = row.reason or '', staff = row.staff or '',
        returnTo = row.return_x and vector4(row.return_x, row.return_y, row.return_z, row.return_h or 0.0) or nil,
    }, false)
    notify(src, ('You still have %s left in staff jail.\nReason: %s'):format(formatTime(row.seconds_remaining), row.reason or ''), 'warning')
end)

AddEventHandler('playerDropped', function()
    local src = source
    save(src)
    jailed[src] = nil
end)

AddEventHandler('onResourceStop', function(resource)
    if resource == GetCurrentResourceName() then for src in pairs(jailed) do save(src) end end
end)

-- staff going off duty doesn't matter; but if the jailed player is somehow staff-flagged as noclip etc we don't care here

---------------------------------------------------------------- dialog

local function openDialog(src, target)
    if not allowed(src, cfg.JailAces) then return end
    TriggerClientEvent('fbrp_staffjail:dialog', src, {
        target = tonumber(target), staff = staffName(src),
        presets = cfg.TimePresets, default = cfg.DefaultMinutes, max = cfg.MaxMinutes,
    })
end

local lastSubmit = {}
RegisterNetEvent('fbrp_staffjail:submit', function(data)
    local src = source
    if type(data) ~= 'table' then return end
    if lastSubmit[src] and GetGameTimer() - lastSubmit[src] < 1500 then return end
    lastSubmit[src] = GetGameTimer()
    if not allowed(src, cfg.JailAces) then return end
    local ok, message = staffJail(data.target, data.minutes, data.reason, src)
    notify(src, message, ok and 'success' or 'error')
end)
AddEventHandler('playerDropped', function() lastSubmit[source] = nil end)

---------------------------------------------------------------- commands

local function jailCommand(src, args)
    if src <= 0 then
        -- console: staffjail <id> <minutes> <reason>
        local ok, message = staffJail(args[1], args[2], table.concat(args, ' ', 3), 0)
        return print('[fbrp_staffjail] ' .. message)
    end
    openDialog(src, args[1])
end
RegisterCommand('staffjail', jailCommand, false)
RegisterCommand('sjail', jailCommand, false)

local function releaseCommand(src, args)
    if not allowed(src, cfg.ReleaseAces) then return end
    local target = tonumber(args[1])
    if not target or not jailed[target] then return notify(src, 'Usage: /unstaffjail <id of someone in staff jail>', 'error') end
    local by = staffName(src)
    release(target, ('You were released from staff jail by %s.'):format(by), by)
    notify(src, ('%s was released from staff jail.'):format(nameOf(target)), 'success')
end
RegisterCommand('unstaffjail', releaseCommand, false)
RegisterCommand('unsjail', releaseCommand, false)

-- /staffjailtime [id]
RegisterCommand('staffjailtime', function(src, args)
    local target = tonumber(args[1])
    if target and target ~= src then
        if src > 0 and not (onDuty(src) and hasAny(src, cfg.JailAces)) then return notify(src, 'You can only check your own staff jail time.', 'error') end
        local j = jailed[target]
        if not j then return notify(src, ('ID %d is not in staff jail.'):format(target), 'inform') end
        return notify(src, ('%s: %s left of %s.\nReason: %s\nBy: %s'):format(j.name, formatTime(j.remaining), formatTime(j.total), j.reason, j.staff), 'inform')
    end
    if src <= 0 then return end
    local j = jailed[src]
    if not j then return notify(src, 'You are not in staff jail.', 'inform') end
    notify(src, ('%s left of %s.\nReason: %s\nBy: %s'):format(formatTime(j.remaining), formatTime(j.total), j.reason, j.staff), 'warning')
end, false)

-- /staffjailed - list everyone currently in staff jail (staff)
RegisterCommand('staffjailed', function(src)
    if not allowed(src, cfg.JailAces) then return end
    local lines = {}
    for id, j in pairs(jailed) do lines[#lines + 1] = ('[%d] %s - %s left (%s)'):format(id, j.name, formatTime(j.remaining), j.reason) end
    notify(src, #lines > 0 and table.concat(lines, '\n') or 'Nobody is in staff jail.', 'inform')
end, false)

---------------------------------------------------------------- exports

exports('StaffJail', function(target, minutes, reason, actor) return staffJail(target, minutes, reason, tonumber(actor) or 0) end)
exports('Release', function(target, why) return release(tonumber(target), why) end)
exports('IsStaffJailed', function(target) return jailed[tonumber(target)] ~= nil end)
exports('OpenDialog', openDialog)
