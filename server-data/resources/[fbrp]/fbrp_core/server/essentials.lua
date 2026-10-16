-- Launch essentials: AFK slot recovery, playtime and first-join welcome,
-- connection and combat-log audits, staff chat and help commands.

local S = FBRP.Server
local E = FBRP.Essentials
local sessions = S.sessions
local now, clean, notify, chat = S.now, S.clean, S.notify, S.chat

local tracked = {}   -- source -> { joinedAt, flushedAt, lastActive, warned, license, discord, name }
local combat = {}    -- source -> ms of the last player-vs-player damage it dealt or took
local kicking = {}   -- source -> true while we drop them ourselves
local bootedAt = now()

local STAFF_COLOR = { 255, 194, 97 }
local INFO_COLOR = { 105, 201, 255 }

local function discordInvite()
    local invite = FBRP.Config.discordInvite
    if not invite or invite == '' then invite = E.discordFallback end
    return invite
end

local function hours(seconds)
    seconds = tonumber(seconds) or 0
    if seconds < 3600 then return ('%dm'):format(math.floor(seconds / 60)) end
    return ('%.1fh'):format(seconds / 3600)
end

-- Adds the unsaved part of a session to the player's total.
local function flush(src, final)
    local t = tracked[src]
    if not t then return end
    local stamp = now()
    local seconds = math.max(0, math.floor((stamp - t.flushedAt) / 1000))
    t.flushedAt = stamp
    if seconds == 0 and not final then return end
    MySQL.prepare('UPDATE player_playtime SET seconds=seconds+?,last_seen=?,name=? WHERE license=?', {
        seconds, stamp, t.name, t.license
    })
end

local function onlineStaff()
    local list = {}
    for src in pairs(sessions) do
        if S.isStaffMember(src) then list[#list + 1] = src end
    end
    return list
end

local function tellStaff(title, message, onDutyOnly)
    for _, src in ipairs(onlineStaff()) do
        if not onDutyOnly or sessions[src].staffDuty then chat(src, title, message, STAFF_COLOR) end
    end
end

local function welcome(src, firstTime, total)
    if firstTime then
        chat(src, 'WELCOME', ('Welcome to %s! Press M for the interaction hub, /help for commands and /rules before you start a scene. Join the Discord: %s'):format(
            FBRP.Config.serverName, discordInvite()), INFO_COLOR)
    else
        chat(src, 'WELCOME BACK', ('Good to see you again. You have spent %s in Florida Bay. /help lists the essentials.'):format(hours(total)), INFO_COLOR)
    end
end

AddEventHandler('fbrp:playerReady', function(src)
    src = tonumber(src)
    local s = src and sessions[src]
    if not s then return end
    local stamp = now()
    local resumed = stamp - bootedAt < 60000   -- resource restart re-initialises everyone already online
    local prior = MySQL.single.await('SELECT seconds FROM player_playtime WHERE license=?', { s.license })
    MySQL.prepare.await([[
        INSERT INTO player_playtime(license,discord_id,name,seconds,sessions,first_seen,last_seen) VALUES(?,?,?,0,1,?,?)
        ON DUPLICATE KEY UPDATE discord_id=COALESCE(VALUES(discord_id),discord_id),name=VALUES(name),
            sessions=sessions+?,last_seen=VALUES(last_seen)
    ]], { s.license, s.discord, s.name, stamp, stamp, resumed and 0 or 1 })
    tracked[src] = {
        joinedAt = stamp, flushedAt = stamp, lastActive = stamp, warned = false,
        license = s.license, discord = s.discord, name = s.name,
    }
    if resumed then return end

    -- Only a brand new Cfx license counts as a first visit; existing players
    -- with no playtime row yet (recorded before this system) do not.
    local firstTime = false
    if not prior then
        local age = MySQL.scalar.await('SELECT TIMESTAMPDIFF(SECOND,created_at,CURRENT_TIMESTAMP) FROM players WHERE license=?', { s.license })
        firstTime = tonumber(age) ~= nil and tonumber(age) <= 600
    end
    SetTimeout(8000, function()
        if tracked[src] then welcome(src, firstTime, prior and prior.seconds or 0) end
    end)
    if firstTime then
        tellStaff('NEW PLAYER', ('%s [%d] joined Florida Bay for the first time. Say hello!'):format(s.name, src))
    end
    FBRP.DB.audit(s.discord or s.license, 'player.join', s.discord, {
        name = s.name, server_id = src, first_visit = firstTime, online = #GetPlayers(),
    })
end)

-- Any client report of movement, camera or voice resets the AFK clock.
RegisterNetEvent('fbrp:essentials:active', function()
    local t = tracked[source]
    if not t then return end
    t.lastActive = now()
    if t.warned then
        t.warned = false
        notify(source, 'Welcome back. AFK timer cleared.', 'success')
    end
end)

-- Remember who was recently in a fight, for combat-log detection.
AddEventHandler('weaponDamageEvent', function(sender, data)
    sender = tonumber(sender)
    if not sender or type(data) ~= 'table' then return end
    local netId = data.hitGlobalId or (type(data.hitGlobalIds) == 'table' and data.hitGlobalIds[1])
    if not netId then return end
    local entity = NetworkGetEntityFromNetworkId(netId)
    if not entity or entity == 0 or not DoesEntityExist(entity) or GetEntityType(entity) ~= 1 or not IsPedAPlayer(entity) then return end
    local victim = NetworkGetEntityOwner(entity)
    if not victim or victim == sender or victim <= 0 then return end
    local stamp = now()
    combat[sender] = stamp
    combat[victim] = stamp
end)

local function afkExempt(src)
    local s = sessions[src]
    if not s or s.staffDuty then return true end
    return IsPlayerAceAllowed(src, E.afk.bypassAce)
end

CreateThread(function()
    local A = E.afk
    while true do
        Wait(15000)
        if A.enabled then
            local maxPlayers = tonumber(GetConvar('sv_maxclients', '48')) or 48
            local busy = #GetPlayers() >= math.floor(maxPlayers * A.busyFraction)
            local limit = (busy and A.busyMinutes or A.minutes) * 60000
            local warnAt = limit - A.warnMinutes * 60000
            local stamp = now()
            for src, t in pairs(tracked) do
                if not afkExempt(src) then
                    local idle = stamp - t.lastActive
                    if idle >= limit then
                        kicking[src] = true
                        MySQL.prepare('UPDATE player_playtime SET afk_kicks=afk_kicks+1 WHERE license=?', { t.license })
                        FBRP.DB.audit('system', 'player.afk_kick', t.discord, { name = t.name, server_id = src, idle_minutes = math.floor(idle / 60000), busy = busy })
                        DropPlayer(src, ('Disconnected for being AFK for %d minutes. You are welcome to reconnect any time.'):format(math.floor(idle / 60000)))
                    elseif idle >= warnAt and not t.warned then
                        t.warned = true
                        notify(src, ('You look AFK. Move or look around within %d minutes to keep your slot.'):format(A.warnMinutes), 'error')
                        chat(src, 'AFK', ('You will be disconnected in %d minutes unless you move, look around or talk.'):format(A.warnMinutes), STAFF_COLOR)
                    end
                end
            end
        end
    end
end)

CreateThread(function()
    while true do
        Wait(E.playtimeFlushSeconds * 1000)
        for src in pairs(tracked) do flush(src, false) end
    end
end)

local function combatLogged(src, reason)
    if kicking[src] then return nil end
    local lowered = reason:lower()
    if lowered:find('restart', 1, true) or lowered:find('shutting down', 1, true) or lowered:find('banned', 1, true) or lowered:find('kicked', 1, true) then return nil end
    local player = Player(src)
    local state = player and player.state or {}
    local flags = {}
    if state['fbrp:restrained'] then flags[#flags + 1] = 'restrained (' .. clean(state['fbrp:restrained'], 24) .. ')' end
    if state['fbrp:downed'] then flags[#flags + 1] = 'downed' end
    local last = combat[src]
    if last and now() - last <= E.combatLogSeconds * 1000 then
        flags[#flags + 1] = ('in a gunfight %ds ago'):format(math.floor((now() - last) / 1000))
    end
    if #flags == 0 then return nil end
    return table.concat(flags, ', ')
end

AddEventHandler('playerDropped', function(reason)
    local src = source
    local t = tracked[src]
    reason = clean(reason or 'Disconnected', 160)
    if t then
        flush(src, true)
        local why = combatLogged(src, reason)
        if why then
            tellStaff('COMBAT LOG', ('%s [%d] left while %s. Reason: %s'):format(t.name, src, why, reason), true)
            FBRP.DB.audit(t.discord or t.license, 'player.combat_log', t.discord, { name = t.name, server_id = src, state = why, reason = reason })
        end
        FBRP.DB.audit(t.discord or t.license, 'player.leave', t.discord, {
            name = t.name, server_id = src, reason = reason, session_minutes = math.floor((now() - t.joinedAt) / 60000),
        })
    end
    tracked[src] = nil
    combat[src] = nil
    kicking[src] = nil
end)

AddEventHandler('onResourceStop', function(name)
    if name ~= GetCurrentResourceName() then return end
    for src in pairs(tracked) do flush(src, true) end
end)

-- Commands -----------------------------------------------------------------

RegisterCommand('playtime', function(source)
    if source <= 0 then return end
    local t = tracked[source]
    if not t then return notify(source, 'Your Florida Bay session is still loading.', 'error') end
    flush(source, false)
    local row = t.discord and MySQL.single.await(
        'SELECT COALESCE(SUM(seconds),0) seconds,COALESCE(SUM(sessions),0) sessions,MIN(first_seen) first_seen FROM player_playtime WHERE discord_id=?', { t.discord })
        or MySQL.single.await('SELECT seconds,sessions,first_seen FROM player_playtime WHERE license=?', { t.license })
    if not row then return notify(source, 'No playtime recorded yet.', 'info') end
    local session = math.floor((now() - t.joinedAt) / 1000)
    chat(source, 'PLAYTIME', ('Total %s over %d sessions · this session %s · first visit %s'):format(
        hours(row.seconds), tonumber(row.sessions) or 0, hours(session),
        os.date('!%Y-%m-%d', math.floor((tonumber(row.first_seen) or now()) / 1000))), INFO_COLOR)
end, false)

RegisterCommand('id', function(source)
    if source <= 0 then return end
    chat(source, 'SERVER ID', ('Your server ID is %d.'):format(source), INFO_COLOR)
end, false)

RegisterCommand('discord', function(source)
    if source <= 0 then return end
    chat(source, 'DISCORD', ('Join the community: %s · Website: %s'):format(discordInvite(), E.website), INFO_COLOR)
end, false)

RegisterCommand('rules', function(source)
    if source <= 0 then return end
    for index, rule in ipairs(E.rules) do chat(source, 'RULE ' .. index, rule, INFO_COLOR) end
end, false)

RegisterCommand('help', function(source)
    if source <= 0 then return end
    for _, entry in ipairs(E.help) do chat(source, 'HELP', entry[1] .. ' · ' .. entry[2], INFO_COLOR) end
end, false)

-- Staff chat reaches every staff member online, on duty or not.
local staffChatAt = {}
RegisterCommand('sc', function(source, args)
    if source <= 0 then return end
    if not S.isStaffMember(source) then return notify(source, 'Staff chat is for staff members.', 'error') end
    local message = clean(table.concat(args, ' '), 300)
    if message == '' then return notify(source, 'Usage: /sc [message]', 'error') end
    local stamp = GetGameTimer()
    if staffChatAt[source] and stamp - staffChatAt[source] < 1500 then return end
    staffChatAt[source] = stamp
    tellStaff('STAFF · ' .. clean(sessions[source].name, 16), message)
end, false)
AddEventHandler('playerDropped', function() staffChatAt[source] = nil end)

AddEventHandler('fbrp:playerReady', function(src)
    TriggerClientEvent('chat:addSuggestions', src, {
        { name = '/help', help = 'List the essential Florida Bay commands' },
        { name = '/rules', help = 'Show the community rules' },
        { name = '/discord', help = 'Show the Discord invite and website' },
        { name = '/playtime', help = 'Your total time in Florida Bay' },
        { name = '/id', help = 'Show your server ID' },
        { name = '/sc', help = 'Staff chat (staff only)', params = { { name = 'message', help = 'Message to every staff member online' } } },
    })
end)
