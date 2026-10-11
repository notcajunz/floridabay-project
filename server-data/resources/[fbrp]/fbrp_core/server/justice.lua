-- Justice: Bolingbroke prison sentences, the police MDT (records, warrants,
-- BOLOs, citations), the vehicle registry, impounds, spike strips, GSR tests,
-- ID cards and body cameras.

local S = FBRP.Server
local J = FBRP.Justice
local sessions = S.sessions
local now, clean, notify, chat, hasPermission = S.now, S.clean, S.notify, S.chat, S.hasPermission

local jailed = {}       -- source -> live sentence
local workAssigned = {} -- source -> { index, at }
local escapes = {}      -- source -> started (ms)
local spikes = {}       -- officer source -> { entity, expires }
local lastMdt = {}

local RED, AMBER, AQUA, GREEN = { 255, 107, 87 }, { 255, 181, 71 }, { 67, 232, 216 }, { 79, 224, 140 }

-- ─────────────────────────── helpers ───────────────────────────

local function characterOf(source)
    local player = Player(source)
    if not player then return nil, nil end
    return tonumber(player.state['fbrp:characterId']), player.state['fbrp:characterName']
end

local function onlineByCharacter(characterId)
    characterId = tonumber(characterId)
    if not characterId then return nil end
    for src in pairs(sessions) do
        if characterOf(src) == characterId then return src end
    end
end

local function characterRow(id)
    return MySQL.single.await('SELECT id,owner_license,discord_id,first_name,last_name,date_of_birth,gender FROM characters WHERE id=? AND archived=FALSE', { tonumber(id) })
end

local function fullName(row)
    return row and (row.first_name .. ' ' .. row.last_name) or 'Unknown'
end

local function citizenNumber(id)
    return ('FB-%06d'):format(tonumber(id) or 0)
end

local function isPolice(source)
    return hasPermission(source, FBRP.Ace.police)
end

local function canJail(source)
    return hasPermission(source, FBRP.Ace.policeJail) or hasPermission(source, FBRP.Ace.staffJail)
end

local function canMdt(source)
    return hasPermission(source, FBRP.Ace.policeMdt) or hasPermission(source, FBRP.Ace.staffJail)
end

local function officer(source)
    if not source or source <= 0 then return 'console', 'Console' end
    local s = sessions[source]
    return s and s.discord or tostring(source), S.displayName(source)
end

local function decode(value)
    if type(value) ~= 'string' then return value or {} end
    local ok, out = pcall(json.decode, value)
    return ok and out or {}
end

local function normalizePlate(value)
    return clean(value, 12):upper():gsub('[^%w ]', ''):gsub('^%s+', ''):gsub('%s+$', ''):sub(1, 8)
end

local function pedCoords(source)
    local ped = GetPlayerPed(source)
    return ped > 0 and GetEntityCoords(ped) or nil
end

local function onDutyPolice()
    local count = 0
    for src in pairs(sessions) do
        if isPolice(src) then count = count + 1 end
    end
    return count
end

-- Charges from the penal code, de-duplicated, optionally limited to some kinds.
local function resolveCharges(list, kinds)
    local out, months, fine, seen = {}, 0, 0, {}
    if type(list) ~= 'table' then return out, 0, 0 end
    for _, id in ipairs(list) do
        local charge = FBRP.FindCharge(tostring(id))
        if charge and not seen[charge.id] and (not kinds or kinds[charge.kind]) then
            seen[charge.id] = true
            out[#out + 1] = { id=charge.id, title=charge.title, kind=charge.kind }
            months = months + charge.months
            fine = fine + charge.fine
        end
        if #out >= 15 then break end
    end
    return out, months, fine
end

local function chargeTitles(charges)
    local titles = {}
    for _, charge in ipairs(charges or {}) do titles[#titles + 1] = charge.title or tostring(charge) end
    return table.concat(titles, ', ')
end

local function formatDuration(seconds)
    seconds = math.max(0, math.floor(seconds or 0))
    return ('%d:%02d'):format(math.floor(seconds / 60), seconds % 60)
end

-- Sentences follow the character; players jailed before picking one are
-- matched on their license instead.
local function subjectClause(characterId, license)
    if characterId then return 'character_id=?', characterId end
    return 'character_id IS NULL AND license=?', license
end

-- ─────────────────────────── prison ───────────────────────────

local function persist(source)
    local j = jailed[source]
    if not j then return end
    MySQL.update('UPDATE jail_sentences SET seconds_remaining=?,updated_at=? WHERE id=? AND status=\'serving\'', {
        math.max(0, math.ceil(j.remaining)), now(), j.id
    })
    j.lastPersist = now()
end

local function jailInfo(j)
    return { remaining=math.ceil(j.remaining), total=j.total, months=j.months, charges=chargeTitles(j.charges), prison=J.prison.name }
end

local function putInJail(source, sentence)
    jailed[source] = {
        id=sentence.id, remaining=sentence.remaining, total=sentence.total, months=sentence.months,
        charges=sentence.charges or {}, enteredAt=now(), lastTick=now(), lastPersist=now(), lastUpdate=0, lastWork=0
    }
    workAssigned[source] = nil
    escapes[source] = nil
    local player = Player(source)
    if player then player.state:set('fbrp:jailed', true, true) end
    local spawn = J.prison.spawns[math.random(#J.prison.spawns)]
    TriggerClientEvent('fbrp:jail:enter', source, spawn, jailInfo(jailed[source]))
end

local function releaseInmate(source, reason, actor)
    local j = jailed[source]
    if not j then return false end
    jailed[source] = nil
    workAssigned[source] = nil
    escapes[source] = nil
    local stamp = now()
    MySQL.update.await("UPDATE jail_sentences SET status='released',seconds_remaining=0,release_reason=?,released_at=?,updated_at=? WHERE id=?", {
        reason, stamp, stamp, j.id
    })
    local player = Player(source)
    if player then player.state:set('fbrp:jailed', nil, true) end
    TriggerClientEvent('fbrp:jail:release', source, J.prison.release, reason)
    local s = sessions[source]
    FBRP.DB.audit(actor or 'system', 'justice.release', s and s.discord or source, { sentence=j.id, reason=reason })
    return true
end

local function activeSentence(source)
    local s = sessions[source]
    if not s then return nil end
    local characterId = characterOf(source)
    local clause, value = subjectClause(characterId, s.license)
    return MySQL.single.await(("SELECT * FROM jail_sentences WHERE status='serving' AND %s ORDER BY id DESC LIMIT 1"):format(clause), { value })
end

local function resumeSentence(source)
    if jailed[source] then return end
    local row = activeSentence(source)
    if not row then return end
    putInJail(source, {
        id=tonumber(row.id), remaining=tonumber(row.seconds_remaining) or 0, total=tonumber(row.seconds_total) or 0,
        months=tonumber(row.months) or 0, charges=decode(row.charges)
    })
    notify(source, ('You still have %s left on your sentence at %s.'):format(formatDuration(row.seconds_remaining), J.prison.name), 'warning')
end

-- Starts a sentence for an online player. `charges` are resolved penal-code
-- rows; `months` is the final length before any escape penalty.
local function startSentence(target, actor, months, charges, notes)
    local s = sessions[target]
    if not s then return false, 'That player is not loaded.' end
    if jailed[target] then return false, 'That player is already serving a sentence.' end
    local characterId, name = characterOf(target)
    name = name or GetPlayerName(target) or ('Player ' .. target)
    months = math.max(1, math.min(J.maxMonths, math.floor(tonumber(months) or 1)))
    local seconds = months * J.secondsPerMonth
    local clause, value = subjectClause(characterId, s.license)

    -- An escaped inmate brings the rest of their old sentence plus a penalty.
    local escaped = MySQL.single.await(("SELECT id,seconds_remaining FROM jail_sentences WHERE status='escaped' AND %s ORDER BY id DESC LIMIT 1"):format(clause), { value })
    if escaped then
        seconds = seconds + (tonumber(escaped.seconds_remaining) or 0) + J.escapePenaltyMonths * J.secondsPerMonth
        months = months + J.escapePenaltyMonths
        local hasEscape = false
        for _, charge in ipairs(charges) do if charge.id == 'escape' then hasEscape = true end end
        if not hasEscape then charges[#charges + 1] = { id='escape', title='Prison escape', kind='felony' } end
        MySQL.update.await("UPDATE jail_sentences SET status='released',release_reason='recaptured',released_at=?,updated_at=? WHERE id=?", { now(), now(), escaped.id })
    end

    local actorId, actorName = officer(actor)
    local stamp = now()
    local id = MySQL.insert.await([[
        INSERT INTO jail_sentences(character_id,license,discord_id,name,officer_id,officer_name,months,charges,seconds_total,seconds_remaining,status,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,'serving',?,?)
    ]], { characterId, s.license, s.discord, name, actorId, actorName, months, json.encode(charges), seconds, seconds, stamp, stamp })
    MySQL.insert.await([[
        INSERT INTO criminal_records(character_id,license,name,kind,charges,months,fine,notes,officer_id,officer_name,created_at)
        VALUES(?,?,?,'arrest',?,?,0,?,?,?,?)
    ]], { characterId, s.license, name, json.encode(charges), months, notes ~= '' and notes or nil, actorId, actorName, stamp })
    if characterId then
        MySQL.update.await("UPDATE warrants SET status='served',closed_by=?,closed_at=? WHERE character_id=? AND status='active'", { actorName, stamp, characterId })
    end
    putInJail(target, { id=tonumber(id), remaining=seconds, total=seconds, months=months, charges=charges })
    chat(target, 'SENTENCED', ('%s sentenced you to %d months (%s) at %s for: %s'):format(actorName, months, formatDuration(seconds), J.prison.name, chargeTitles(charges) ~= '' and chargeTitles(charges) or 'unspecified charges'), RED)
    FBRP.DB.audit(actorId, 'justice.jail', s.discord or target, { sentence=id, name=name, months=months, charges=chargeTitles(charges), notes=notes })
    return true, ('%s sentenced to %d months.'):format(name, months)
end

-- One-second sentence clock; only counts while the inmate is in the game.
CreateThread(function()
    while true do
        Wait(1000)
        local stamp = now()
        for src, j in pairs(jailed) do
            if not sessions[src] then
                jailed[src] = nil
            else
                j.remaining = j.remaining - (stamp - j.lastTick) / 1000
                j.lastTick = stamp
                if j.remaining <= 0 then
                    releaseInmate(src, 'served')
                    notify(src, 'Sentence served. You are free to go.', 'success')
                else
                    if stamp - j.lastUpdate >= 5000 then
                        j.lastUpdate = stamp
                        TriggerClientEvent('fbrp:jail:update', src, math.ceil(j.remaining))
                        -- Server-side leash: walking, driving or teleporting out puts them back in the yard.
                        local coords = pedCoords(src)
                        if coords and not escapes[src] and stamp - j.enteredAt > 15000
                            and #(coords - J.prison.center) > J.prison.leashRadius + 20.0 then
                            TriggerClientEvent('fbrp:jail:return', src, J.prison.spawns[math.random(#J.prison.spawns)])
                        end
                    end
                    if stamp - j.lastPersist >= 30000 then persist(src) end
                end
            end
        end
    end
end)

AddEventHandler('playerDropped', function()
    local src = source
    persist(src)
    jailed[src] = nil
    workAssigned[src] = nil
    escapes[src] = nil
    lastMdt[src] = nil
    local strip = spikes[src]
    if strip and DoesEntityExist(strip.entity) then DeleteEntity(strip.entity) end
    spikes[src] = nil
end)

AddEventHandler('onResourceStop', function(name)
    if name ~= GetCurrentResourceName() then return end
    for src in pairs(jailed) do persist(src) end
    for _, strip in pairs(spikes) do
        if DoesEntityExist(strip.entity) then DeleteEntity(strip.entity) end
    end
end)

-- The client reports when its character has spawned; that is when a pending
-- sentence resumes.
RegisterNetEvent('fbrp:justice:spawned', function()
    local src = source
    if not S.isReady() then return end
    SetTimeout(1500, function() if sessions[src] then resumeSentence(src) end end)
end)

RegisterNetEvent('fbrp:jail:leash', function()
    local src = source
    if jailed[src] and not escapes[src] then
        TriggerClientEvent('fbrp:jail:return', src, J.prison.spawns[math.random(#J.prison.spawns)])
    end
end)

-- Prison work: the server hands out a spot, then checks the inmate stood at it
-- long enough before taking time off.
RegisterNetEvent('fbrp:jail:workRequest', function()
    local src = source
    local j = jailed[src]
    if not j then return end
    local previous = workAssigned[src] and workAssigned[src].index
    local index
    repeat index = math.random(#J.prison.work) until index ~= previous or #J.prison.work == 1
    workAssigned[src] = { index=index, at=now() }
    TriggerClientEvent('fbrp:jail:work', src, index)
end)

RegisterNetEvent('fbrp:jail:workDone', function()
    local src = source
    local j, task = jailed[src], workAssigned[src]
    if not j or not task then return end
    local spot = J.prison.work[task.index]
    local coords = pedCoords(src)
    if not coords or #(coords - vector3(spot.x, spot.y, spot.z)) > 4.0 then return notify(src, 'You walked away from the job.', 'error') end
    if now() - task.at < J.workHoldMs - 500 then return end
    if now() - j.lastWork < J.workCooldownSeconds * 1000 then return notify(src, 'The guard tells you to take a breather first.', 'info') end
    j.lastWork = now()
    workAssigned[src] = nil
    local before = j.remaining
    j.remaining = math.max(math.min(j.remaining, J.workMinimumRemaining), j.remaining - J.workReductionSeconds)
    local saved = math.floor(before - j.remaining)
    TriggerClientEvent('fbrp:jail:update', src, math.ceil(j.remaining))
    notify(src, saved > 0 and ('Good work. %s taken off your sentence.'):format(formatDuration(saved)) or 'Good work, but the parole board will not shorten it any further.', saved > 0 and 'success' or 'info')
    persist(src)
end)

RegisterNetEvent('fbrp:jail:escapeStart', function()
    local src = source
    if not jailed[src] then return end
    local coords = pedCoords(src)
    if not J.escapeEnabled then return notify(src, 'The fence has been reinforced. No way through.', 'error') end
    if GlobalState['fbrp:peacetime'] == true then return notify(src, 'Not during peacetime.', 'error') end
    if onDutyPolice() < J.escapeMinPolice then return notify(src, 'The yard is crawling with guards. Wait for a quieter moment (police must be on duty).', 'error') end
    if not coords or #(coords - J.prison.escapeSpot) > 3.0 then return end
    escapes[src] = now()
    TriggerClientEvent('fbrp:jail:escapeApproved', src, J.escapeHoldMs)
end)

RegisterNetEvent('fbrp:jail:escapeCancel', function()
    local src = source
    escapes[src] = nil
end)

RegisterNetEvent('fbrp:jail:escapeDone', function()
    local src = source
    local j, started = jailed[src], escapes[src]
    if not j or not started then return end
    local coords = pedCoords(src)
    if now() - started < J.escapeHoldMs - 1500 or not coords or #(coords - J.prison.escapeSpot) > 4.0 then
        escapes[src] = nil
        return notify(src, 'You were spotted and dragged back from the fence.', 'error')
    end
    jailed[src] = nil
    escapes[src] = nil
    workAssigned[src] = nil
    local stamp = now()
    MySQL.update.await("UPDATE jail_sentences SET status='escaped',seconds_remaining=?,updated_at=? WHERE id=?", { math.ceil(j.remaining), stamp, j.id })
    local characterId, name = characterOf(src)
    name = name or GetPlayerName(src)
    MySQL.insert.await('INSERT INTO warrants(character_id,subject_name,reason,status,created_by_id,created_by,created_at) VALUES(?,?,?,?,?,?,?)', {
        characterId, name, ('Escaped from %s while serving %d months.'):format(J.prison.name, j.months), 'active', 'system', 'Department of Corrections', stamp
    })
    local player = Player(src)
    if player then player.state:set('fbrp:jailed', nil, true) end
    TriggerClientEvent('fbrp:jail:escape', src, J.prison.escapeExit)
    local exit = J.prison.escapeExit
    S.sendDispatch('PRISON', nil, ('Prison break: %s escaped from %s. A warrant has been issued.'):format(name, J.prison.name), vector3(exit.x, exit.y, exit.z), { FBRP.Ace.police }, false)
    S.broadcast('BOLINGBROKE', 'Sirens are sounding at Bolingbroke Penitentiary. An inmate is on the run.', RED)
    local s = sessions[src]
    FBRP.DB.audit(s and s.discord or src, 'justice.escape', s and s.discord or src, { sentence=j.id, name=name })
end)

RegisterCommand('jailtime', function(source)
    if source <= 0 then return end
    local j = jailed[source]
    if not j then return notify(source, 'You are not serving a sentence.', 'info') end
    chat(source, 'BOLINGBROKE', ('%s remaining of %d months. Charges: %s'):format(formatDuration(j.remaining), j.months, chargeTitles(j.charges) ~= '' and chargeTitles(j.charges) or 'none listed'), AMBER)
end, false)

-- /jail <id> <months> [reason] — quick sentence without the MDT.
RegisterCommand('jail', function(source, args)
    if source > 0 and not canJail(source) then return S.deny(source, FBRP.Ace.policeJail) end
    local target, months = tonumber(args[1]), tonumber(args[2])
    if not target or not months or not sessions[target] then return notify(source, 'Usage: /jail <server id> <months> [charges/notes]', 'error') end
    local staff = source <= 0 or hasPermission(source, FBRP.Ace.staffJail)
    if not staff then
        if target == source then return notify(source, 'You cannot jail yourself.', 'error') end
        if not S.playersNear(source, target, 10.0) then return notify(source, 'The suspect must be with you to be booked.', 'error') end
        local player = Player(target)
        if not (player and player.state['fbrp:restrained']) then return notify(source, 'Restrain the suspect before booking them.', 'error') end
    end
    local reason = clean(table.concat(args, ' ', 3), 200)
    local charges = reason ~= '' and { { id='custom', title=reason, kind='custom' } } or {}
    local ok, message = startSentence(target, source, months, charges, '')
    notify(source, message, ok and 'success' or 'error')
end, false)

RegisterCommand('unjail', function(source, args)
    if source > 0 and not canJail(source) then return S.deny(source, FBRP.Ace.policeJail) end
    local target = tonumber(args[1])
    if not target or not jailed[target] then return notify(source, 'Usage: /unjail <server id of an inmate>', 'error') end
    local actor = officer(source)
    releaseInmate(target, 'released', actor)
    notify(target, ('You were released early by %s.'):format(select(2, officer(source))), 'success')
    notify(source, 'Inmate released.', 'success')
end, false)

RegisterCommand('prison', function(source)
    if source > 0 and not canMdt(source) then return S.deny(source, FBRP.Ace.policeMdt) end
    local lines = {}
    for src, j in pairs(jailed) do
        local _, name = characterOf(src)
        lines[#lines + 1] = ('[%d] %s · %s left'):format(src, name or GetPlayerName(src), formatDuration(j.remaining))
    end
    chat(source, 'BOLINGBROKE', #lines > 0 and table.concat(lines, ' | ') or 'No inmates are in the yard right now.', AMBER)
end, false)

-- ─────────────────────────── MDT ───────────────────────────

local function activeWarrantCount(characterId)
    if not characterId then return 0 end
    return tonumber(MySQL.scalar.await("SELECT COUNT(*) FROM warrants WHERE character_id=? AND status='active'", { characterId })) or 0
end

local function units()
    local out = {}
    for src, s in pairs(sessions) do
        local police, ems = isPolice(src), hasPermission(src, FBRP.Ace.ems)
        if police or ems then
            out[#out + 1] = { id=src, name=S.displayName(src), org=s.org and s.org.name or nil, kind=police and 'police' or 'ems', downed=Player(src).state['fbrp:downed'] and true or false }
        end
    end
    table.sort(out, function(a, b) return a.id < b.id end)
    return out
end

local function dashboard()
    local inmates = MySQL.query.await("SELECT id,character_id,name,months,seconds_remaining,status,officer_name,created_at FROM jail_sentences WHERE status IN ('serving','escaped') ORDER BY id DESC LIMIT 30")
    for _, row in ipairs(inmates) do
        local src = onlineByCharacter(row.character_id)
        if src and jailed[src] and jailed[src].id == tonumber(row.id) then
            row.online = src
            row.seconds_remaining = math.ceil(jailed[src].remaining)
        end
    end
    local calls = {}
    for _, call in pairs(S.recentCalls) do
        local responders = 0
        for _ in pairs(call.responders) do responders = responders + 1 end
        calls[#calls + 1] = { id=call.id, kind=call.kind, caller=call.callerName, message=call.message, at=call.at, responders=responders }
    end
    table.sort(calls, function(a, b) return a.id > b.id end)
    local records = MySQL.query.await('SELECT id,character_id,name,kind,charges,months,fine,officer_name,created_at FROM criminal_records ORDER BY id DESC LIMIT 15')
    for _, row in ipairs(records) do row.charges = decode(row.charges) end
    return {
        warrants = MySQL.query.await("SELECT id,character_id,subject_name,reason,created_by,created_at FROM warrants WHERE status='active' ORDER BY id DESC LIMIT 30"),
        bolos = MySQL.query.await('SELECT id,kind,plate,description,created_by,created_at FROM bolos WHERE active=TRUE ORDER BY id DESC LIMIT 30'),
        records = records,
        inmates = inmates,
        units = units(),
        calls = calls,
    }
end

local function likeEscape(value)
    return (value:gsub('[%%_\\]', '\\%0'))
end

local function search(query)
    query = clean(query, 60)
    local rows = {}
    local id = tonumber(query)
    if id then
        local characterId = sessions[id] and characterOf(id)
        if characterId then
            local row = characterRow(characterId)
            if row then rows[1] = row end
        end
    end
    if #rows == 0 and #query >= 2 then
        rows = MySQL.query.await([[
            SELECT id,first_name,last_name,date_of_birth,gender FROM characters
            WHERE archived=FALSE AND CONCAT(first_name,' ',last_name) LIKE ?
            ORDER BY last_played_at DESC LIMIT 20
        ]], { '%' .. likeEscape(query) .. '%' })
    end
    local out = {}
    for _, row in ipairs(rows) do
        out[#out + 1] = {
            id=tonumber(row.id), name=fullName(row), dob=row.date_of_birth, gender=row.gender,
            citizen=citizenNumber(row.id), online=onlineByCharacter(row.id), warrants=activeWarrantCount(tonumber(row.id))
        }
    end
    return out
end

local function profile(characterId)
    local row = characterRow(characterId)
    if not row then return nil end
    local id = tonumber(row.id)
    local online = onlineByCharacter(id)
    local records = MySQL.query.await('SELECT id,kind,charges,months,fine,notes,officer_name,created_at FROM criminal_records WHERE character_id=? ORDER BY id DESC LIMIT 50', { id })
    for _, record in ipairs(records) do record.charges = decode(record.charges) end
    local sentence = MySQL.single.await("SELECT id,months,seconds_remaining,status,officer_name,created_at FROM jail_sentences WHERE character_id=? AND status IN ('serving','escaped') ORDER BY id DESC LIMIT 1", { id })
    if sentence and online and jailed[online] then sentence.seconds_remaining = math.ceil(jailed[online].remaining) end
    local restrained = online and Player(online).state['fbrp:restrained'] or nil
    return {
        id=id, name=fullName(row), dob=row.date_of_birth, gender=row.gender, citizen=citizenNumber(id),
        online=online, restrained=restrained and true or false,
        records=records,
        warrants=MySQL.query.await('SELECT id,reason,status,created_by,created_at,closed_by,closed_at FROM warrants WHERE character_id=? ORDER BY status=\'active\' DESC,id DESC LIMIT 30', { id }),
        vehicles=MySQL.query.await('SELECT plate,model,label,stolen,impounded_at,registered_at FROM vehicle_registrations WHERE character_id=? ORDER BY registered_at DESC LIMIT 20', { id }),
        sentence=sentence,
    }
end

local function plateReport(plate)
    plate = normalizePlate(plate)
    if plate == '' then return nil end
    local reg = MySQL.single.await('SELECT * FROM vehicle_registrations WHERE plate=?', { plate })
    local bolos = MySQL.query.await('SELECT id,description,created_by,created_at FROM bolos WHERE active=TRUE AND kind=\'vehicle\' AND plate=? ORDER BY id DESC', { plate })
    local report = { plate=plate, registered=reg ~= nil, bolos=bolos }
    if reg then
        report.model = reg.label or reg.model
        report.owner = reg.owner_name
        report.ownerId = tonumber(reg.character_id)
        report.stolen = reg.stolen == true or reg.stolen == 1
        report.impounded = reg.impounded_at ~= nil
        report.warrants = activeWarrantCount(tonumber(reg.character_id))
    end
    return report
end

local function plateLine(report)
    if not report.registered then
        local text = ('%s · No registration on file.'):format(report.plate)
        if #report.bolos > 0 then text = text .. (' BOLO #%d: %s'):format(report.bolos[1].id, report.bolos[1].description) end
        return text, #report.bolos > 0 and RED or AMBER
    end
    local flags = {}
    if report.stolen then flags[#flags + 1] = 'REPORTED STOLEN' end
    if report.impounded then flags[#flags + 1] = 'IMPOUND RECORD' end
    if (report.warrants or 0) > 0 then flags[#flags + 1] = ('OWNER HAS %d ACTIVE WARRANT(S)'):format(report.warrants) end
    for _, bolo in ipairs(report.bolos) do flags[#flags + 1] = ('BOLO #%d: %s'):format(bolo.id, bolo.description) end
    local text = ('%s · %s · Registered to %s'):format(report.plate, report.model or 'Unknown', report.owner or 'Unknown')
    if #flags > 0 then text = text .. ' · ' .. table.concat(flags, ' · ') end
    return text, #flags > 0 and RED or GREEN
end

local function sendMdt(source, kind, data)
    TriggerClientEvent('fbrp:mdt:data', source, kind, data)
end

local function openMdt(source, focus)
    local payload = { dashboard=dashboard(), canJail=canJail(source), officer=S.displayName(source), maxMonths=J.maxMonths, secondsPerMonth=J.secondsPerMonth }
    if focus then
        payload.profile = profile(focus.characterId)
        payload.form = focus.form
    end
    TriggerClientEvent('fbrp:mdt:open', source, payload)
end

RegisterCommand('mdt', function(source)
    if source <= 0 then return end
    if not canMdt(source) then return S.deny(source, FBRP.Ace.policeMdt) end
    openMdt(source)
end, false)

-- A citation or sentence submitted from the MDT. Returns ok, message.
local function issueCitation(source, characterId, chargeIds, notes)
    local row = characterRow(characterId)
    if not row then return false, 'Citizen not found.' end
    local charges, _, fine = resolveCharges(chargeIds, { infraction=true, misdemeanor=true })
    if #charges == 0 then return false, 'Pick at least one infraction or misdemeanor.' end
    fine = math.min(J.citationMaxFine, fine)
    local actorId, actorName = officer(source)
    local name = fullName(row)
    MySQL.insert.await([[
        INSERT INTO criminal_records(character_id,license,name,kind,charges,months,fine,notes,officer_id,officer_name,created_at)
        VALUES(?,?,?,'citation',?,0,?,?,?,?,?)
    ]], { tonumber(row.id), row.owner_license, name, json.encode(charges), fine, notes ~= '' and notes or nil, actorId, actorName, now() })
    local target = onlineByCharacter(row.id)
    if target then
        TriggerClientEvent('fbrp:citation:received', target, { officer=actorName, charges=chargeTitles(charges), fine=fine, notes=notes })
        chat(target, 'CITATION', ('%s cited you for %s. Fine: $%d.'):format(actorName, chargeTitles(charges), fine), AMBER)
    end
    FBRP.DB.audit(actorId, 'justice.citation', tostring(row.id), { name=name, charges=chargeTitles(charges), fine=fine })
    return true, ('Citation issued to %s ($%d).'):format(name, fine)
end

local function sentenceFromMdt(source, characterId, chargeIds, monthsOverride, notes)
    if not canJail(source) then return false, 'You do not have permission to book inmates.' end
    local target = onlineByCharacter(characterId)
    if not target then return false, 'The suspect must be in the city to be booked.' end
    if target == source then return false, 'You cannot jail yourself.' end
    if not hasPermission(source, FBRP.Ace.staffJail) then
        if not S.playersNear(source, target, 10.0) then return false, 'The suspect must be with you to be booked.' end
        if not Player(target).state['fbrp:restrained'] then return false, 'Restrain the suspect before booking them.' end
    end
    local charges, months = resolveCharges(chargeIds)
    if #charges == 0 then return false, 'Pick at least one charge.' end
    months = tonumber(monthsOverride) or months
    if months < 1 then months = 1 end
    return startSentence(target, source, months, charges, notes)
end

RegisterNetEvent('fbrp:mdt:action', function(kind, data)
    local src = source
    if not canMdt(src) then return end
    local stamp = GetGameTimer()
    if lastMdt[src] and stamp - lastMdt[src] < 250 then return end
    lastMdt[src] = stamp
    if type(data) ~= 'table' then data = {} end
    kind = clean(kind, 24)
    local actorId, actorName = officer(src)

    if kind == 'dashboard' then
        sendMdt(src, 'dashboard', dashboard())
    elseif kind == 'search' then
        sendMdt(src, 'results', { query=clean(data.query, 60), rows=search(data.query) })
    elseif kind == 'profile' then
        local p = profile(data.id)
        if p then sendMdt(src, 'profile', p) else notify(src, 'Citizen not found.', 'error') end
    elseif kind == 'plate' then
        local report = plateReport(data.plate)
        if report then sendMdt(src, 'plate', report) end
    elseif kind == 'warrant' then
        local row = characterRow(data.id)
        local reason = clean(data.reason, 500)
        if not row or reason == '' then return notify(src, 'A warrant needs a citizen and a reason.', 'error') end
        local id = MySQL.insert.await('INSERT INTO warrants(character_id,subject_name,reason,status,created_by_id,created_by,created_at) VALUES(?,?,?,?,?,?,?)', {
            tonumber(row.id), fullName(row), reason, 'active', actorId, actorName, now()
        })
        FBRP.DB.audit(actorId, 'justice.warrant', tostring(row.id), { warrant=id, name=fullName(row), reason=reason })
        for target in pairs(sessions) do
            if target ~= src and isPolice(target) then notify(target, ('Warrant #%d issued for %s.'):format(id, fullName(row)), 'warning') end
        end
        notify(src, ('Warrant #%d issued.'):format(id), 'success')
        sendMdt(src, 'profile', profile(row.id))
    elseif kind == 'closeWarrant' then
        local status = data.status == 'served' and 'served' or 'cleared'
        local row = MySQL.single.await('SELECT id,character_id FROM warrants WHERE id=? AND status=\'active\'', { tonumber(data.id) })
        if not row then return end
        MySQL.update.await('UPDATE warrants SET status=?,closed_by=?,closed_at=? WHERE id=?', { status, actorName, now(), row.id })
        FBRP.DB.audit(actorId, 'justice.warrant_' .. status, tostring(row.character_id or ''), { warrant=row.id })
        notify(src, ('Warrant #%d marked %s.'):format(row.id, status), 'success')
        if data.refresh == 'profile' and row.character_id then sendMdt(src, 'profile', profile(row.character_id)) else sendMdt(src, 'dashboard', dashboard()) end
    elseif kind == 'bolo' then
        local description = clean(data.description, 500)
        local boloKind = data.kind == 'vehicle' and 'vehicle' or 'person'
        local plate = boloKind == 'vehicle' and normalizePlate(data.plate) or ''
        if description == '' then return notify(src, 'Describe who or what to look out for.', 'error') end
        local id = MySQL.insert.await('INSERT INTO bolos(kind,plate,description,active,created_by_id,created_by,created_at) VALUES(?,?,?,TRUE,?,?,?)', {
            boloKind, plate ~= '' and plate or nil, description, actorId, actorName, now()
        })
        local coords = pedCoords(src)
        S.sendDispatch('BOLO', src, ('BOLO #%d%s: %s'):format(id, plate ~= '' and (' · ' .. plate) or '', description), coords, { FBRP.Ace.police }, false)
        FBRP.DB.audit(actorId, 'justice.bolo', plate ~= '' and plate or nil, { bolo=id, kind=boloKind, description=description })
        sendMdt(src, 'dashboard', dashboard())
    elseif kind == 'closeBolo' then
        MySQL.update.await('UPDATE bolos SET active=FALSE,closed_at=? WHERE id=?', { now(), tonumber(data.id) })
        notify(src, 'BOLO cancelled.', 'success')
        sendMdt(src, 'dashboard', dashboard())
    elseif kind == 'cite' then
        local ok, message = issueCitation(src, data.id, data.charges, clean(data.notes, 300))
        notify(src, message, ok and 'success' or 'error')
        if ok then sendMdt(src, 'profile', profile(data.id)) end
    elseif kind == 'sentence' then
        local ok, message = sentenceFromMdt(src, data.id, data.charges, data.months, clean(data.notes, 300))
        notify(src, message, ok and 'success' or 'error')
        if ok then sendMdt(src, 'profile', profile(data.id)) end
    elseif kind == 'release' then
        if not canJail(src) then return notify(src, 'You do not have permission to release inmates.', 'error') end
        local row = MySQL.single.await("SELECT id,character_id,status FROM jail_sentences WHERE id=? AND status IN ('serving','escaped')", { tonumber(data.id) })
        if not row then return end
        local online = onlineByCharacter(row.character_id)
        if online and jailed[online] and jailed[online].id == tonumber(row.id) then
            releaseInmate(online, 'released', actorId)
            notify(online, ('You were released early by %s.'):format(actorName), 'success')
        else
            MySQL.update.await("UPDATE jail_sentences SET status='released',seconds_remaining=0,release_reason='released',released_at=?,updated_at=? WHERE id=?", { now(), now(), row.id })
            FBRP.DB.audit(actorId, 'justice.release', tostring(row.character_id or ''), { sentence=row.id, reason='released' })
        end
        notify(src, ('Sentence #%d closed.'):format(row.id), 'success')
        sendMdt(src, 'dashboard', dashboard())
    end
end)

-- ─────────────────────────── vehicles ───────────────────────────

RegisterNetEvent('fbrp:justice:register', function(rawPlate, rawModel, rawLabel, fromGarage)
    local src = source
    local s = sessions[src]
    local characterId, name = characterOf(src)
    local plate = normalizePlate(rawPlate)
    if not s or plate == '' then return end
    if not characterId then return notify(src, 'Pick a character before registering vehicles.', 'error') end
    local model, label = clean(rawModel, 40):lower(), clean(rawLabel, 60)
    local existing = MySQL.single.await('SELECT character_id FROM vehicle_registrations WHERE plate=?', { plate })
    if existing and tonumber(existing.character_id) ~= characterId and not fromGarage then
        return notify(src, ('%s is already registered to someone else.'):format(plate), 'error')
    end
    if not existing then
        local count = tonumber(MySQL.scalar.await('SELECT COUNT(*) FROM vehicle_registrations WHERE character_id=?', { characterId })) or 0
        if count >= 25 and not fromGarage then return notify(src, 'You already have 25 registered vehicles.', 'error') end
    end
    MySQL.prepare.await([[
        INSERT INTO vehicle_registrations(plate,model,label,character_id,owner_name,license,discord_id,stolen,registered_at)
        VALUES(?,?,?,?,?,?,?,FALSE,?)
        ON DUPLICATE KEY UPDATE model=VALUES(model),label=VALUES(label),character_id=VALUES(character_id),owner_name=VALUES(owner_name),
          license=VALUES(license),discord_id=VALUES(discord_id),stolen=FALSE,impounded_at=NULL,impounded_by=NULL,registered_at=VALUES(registered_at)
    ]], { plate, model ~= '' and model or 'unknown', label ~= '' and label or nil, characterId, name or GetPlayerName(src), s.license, s.discord, now() })
    if not fromGarage then notify(src, ('%s registered to %s.'):format(plate, name or 'you'), 'success') end
end)

local function ownedPlate(source, rawPlate)
    local characterId = characterOf(source)
    local plate = normalizePlate(rawPlate)
    if plate == '' or not characterId then return nil end
    local row = MySQL.single.await('SELECT plate FROM vehicle_registrations WHERE plate=? AND character_id=?', { plate, characterId })
    return row and plate or nil
end

RegisterCommand('reportstolen', function(source, args)
    if source <= 0 then return end
    local plate = ownedPlate(source, table.concat(args, ' '))
    if not plate then return notify(source, 'Usage: /reportstolen <plate of a vehicle registered to you>', 'error') end
    MySQL.update.await('UPDATE vehicle_registrations SET stolen=TRUE WHERE plate=?', { plate })
    S.sendDispatch('311', source, ('Stolen vehicle report: %s'):format(plate), pedCoords(source), { FBRP.Ace.police }, true)
    notify(source, ('%s reported stolen. Police have been notified.'):format(plate), 'success')
end, false)

RegisterCommand('recovered', function(source, args)
    if source <= 0 then return end
    local plate = ownedPlate(source, table.concat(args, ' '))
    if not plate then return notify(source, 'Usage: /recovered <plate of a vehicle registered to you>', 'error') end
    MySQL.update.await('UPDATE vehicle_registrations SET stolen=FALSE WHERE plate=?', { plate })
    notify(source, ('%s marked as recovered.'):format(plate), 'success')
end, false)

RegisterCommand('myvehicles', function(source)
    if source <= 0 then return end
    local characterId = characterOf(source)
    if not characterId then return end
    local rows = MySQL.query.await('SELECT plate,label,model,stolen FROM vehicle_registrations WHERE character_id=? ORDER BY registered_at DESC LIMIT 15', { characterId })
    local parts = {}
    for _, row in ipairs(rows) do parts[#parts + 1] = ('%s (%s)%s'):format(row.plate, row.label or row.model, (row.stolen == true or row.stolen == 1) and ' STOLEN' or '') end
    chat(source, 'REGISTRATION', #parts > 0 and table.concat(parts, ' · ') or 'No vehicles registered. Use /registervehicle while driving.', AQUA)
end, false)

RegisterNetEvent('fbrp:justice:runplate', function(rawPlate)
    local src = source
    if not isPolice(src) then return S.deny(src, FBRP.Ace.police) end
    local report = plateReport(rawPlate)
    if not report then return notify(src, 'No plate to run.', 'error') end
    local text, color = plateLine(report)
    chat(src, 'PLATE', text, color)
    TriggerClientEvent('fbrp:justice:plateResult', src, report)
end)

RegisterNetEvent('fbrp:justice:impound', function(netId)
    local src = source
    if not hasPermission(src, FBRP.Ace.policeImpound) then return S.deny(src, FBRP.Ace.policeImpound) end
    local entity = NetworkGetEntityFromNetworkId(tonumber(netId) or 0)
    if not entity or entity == 0 or not DoesEntityExist(entity) or GetEntityType(entity) ~= 2 then return notify(src, 'No vehicle found.', 'error') end
    local coords = pedCoords(src)
    if not coords or #(coords - GetEntityCoords(entity)) > 8.0 then return notify(src, 'Stand next to the vehicle to impound it.', 'error') end
    for seat = -1, 6 do
        local ped = GetPedInVehicleSeat(entity, seat)
        if ped and ped ~= 0 then return notify(src, 'The vehicle must be empty.', 'error') end
    end
    local plate = normalizePlate(GetVehicleNumberPlateText(entity))
    local actorId, name = officer(src)
    DeleteEntity(entity)
    if plate ~= '' then MySQL.update('UPDATE vehicle_registrations SET impounded_at=?,impounded_by=? WHERE plate=?', { now(), name, plate }) end
    notify(src, ('Vehicle %s impounded.'):format(plate ~= '' and plate or ''), 'success')
    FBRP.DB.audit(actorId, 'justice.impound', plate ~= '' and plate or nil, {})
end)

-- Spike strips are server-owned props, so they outlive a dropped connection
-- only until the cleanup below. Drivers detect them locally.
RegisterNetEvent('fbrp:justice:spikes', function(position, heading)
    local src = source
    if not hasPermission(src, FBRP.Ace.policeSpikes) then return S.deny(src, FBRP.Ace.policeSpikes) end
    local existing = spikes[src]
    if existing then
        if DoesEntityExist(existing.entity) then DeleteEntity(existing.entity) end
        spikes[src] = nil
        return notify(src, 'Spike strip picked up.', 'info')
    end
    if type(position) ~= 'table' and type(position) ~= 'vector3' then return end
    local x, y, z = tonumber(position.x), tonumber(position.y), tonumber(position.z)
    local coords = pedCoords(src)
    if not x or not coords or #(coords - vector3(x, y, z)) > 10.0 then return end
    local entity = CreateObjectNoOffset(joaat('p_ld_stinger_s'), x, y, z, true, true, false)
    local timeout = GetGameTimer() + 3000
    while not DoesEntityExist(entity) and GetGameTimer() < timeout do Wait(0) end
    if not DoesEntityExist(entity) then return notify(src, 'The spike strip could not be deployed here.', 'error') end
    SetEntityHeading(entity, (tonumber(heading) or 0.0) + 0.0)
    FreezeEntityPosition(entity, true)
    spikes[src] = { entity=entity, expires=now() + J.spikeLifetimeSeconds * 1000 }
    notify(src, ('Spike strip deployed. Use /spikes again to pick it up (auto-removes in %ds).'):format(J.spikeLifetimeSeconds), 'success')
end)

CreateThread(function()
    while true do
        Wait(5000)
        local stamp = now()
        for src, strip in pairs(spikes) do
            if stamp > strip.expires then
                if DoesEntityExist(strip.entity) then DeleteEntity(strip.entity) end
                spikes[src] = nil
                if sessions[src] then notify(src, 'Your spike strip was collected.', 'info') end
            end
        end
    end
end)

RegisterCommand('bodycam', function(source)
    if source <= 0 then return end
    if not isPolice(source) and not hasPermission(source, FBRP.Ace.ems) then return S.deny(source, FBRP.Ace.police) end
    local s = sessions[source]
    TriggerClientEvent('fbrp:bodycam:toggle', source, { unit=S.displayName(source), dept=s and s.org and s.org.name or (isPolice(source) and 'Florida Bay Police' or 'Florida Bay Fire Rescue') })
end, false)

-- ─────────────────────────── third eye ───────────────────────────

local function idCard(source)
    local characterId = characterOf(source)
    local row = characterId and characterRow(characterId)
    if not row then return { name=GetPlayerName(source), citizen='Unregistered', dob='Unknown', gender='Unknown' } end
    return { name=fullName(row), citizen=citizenNumber(row.id), dob=row.date_of_birth, gender=row.gender, id=tonumber(row.id) }
end

FBRP.InteractionHandlers.checkid = function(src, target)
    local card = idCard(target)
    if isPolice(src) and card.id then
        card.warrants = activeWarrantCount(card.id)
        card.inPrison = jailed[target] ~= nil
    end
    TriggerClientEvent('fbrp:idcard:show', src, card)
    local text = ('%s · %s · DOB %s · %s'):format(card.name, card.citizen, card.dob, card.gender)
    if card.warrants and card.warrants > 0 then text = text .. (' · %d ACTIVE WARRANT(S)'):format(card.warrants) end
    chat(src, 'IDENTIFICATION', text, (card.warrants or 0) > 0 and RED or AQUA)
end

FBRP.InteractionHandlers.showid = function(src, target)
    local card = idCard(src)
    TriggerClientEvent('fbrp:idcard:show', target, card)
    notify(target, ('%s showed you their ID.'):format(card.name), 'info')
    notify(src, 'You showed your ID.', 'success')
end

FBRP.InteractionHandlers.gsr = function(src, target)
    local stamp = tonumber(Player(target).state['fbrp:gsr'])
    local positive = stamp and os.time() - stamp <= J.gsrMinutes * 60
    chat(src, 'GSR TEST', ('%s: %s'):format(S.displayName(target), positive and 'POSITIVE for gunshot residue.' or 'Negative.'), positive and RED or GREEN)
    notify(target, 'Your hands were swabbed for gunshot residue.', 'info')
end

FBRP.InteractionVisible.cite = function(_, target) return characterOf(target) ~= nil end
FBRP.InteractionHandlers.cite = function(src, target)
    local characterId = characterOf(target)
    if not characterId then notify(src, 'This person has not picked a character yet.', 'error') return false end
    openMdt(src, { characterId=characterId, form='cite' })
end

FBRP.InteractionVisible.jail = function(src, target)
    if jailed[target] or characterOf(target) == nil then return false end
    return hasPermission(src, FBRP.Ace.staffJail) or Player(target).state['fbrp:restrained'] ~= nil
end
FBRP.InteractionHandlers.jail = function(src, target)
    local characterId = characterOf(target)
    if not characterId then notify(src, 'This person has not picked a character yet.', 'error') return false end
    openMdt(src, { characterId=characterId, form='sentence' })
end

FBRP.Justice.IsJailed = function(source) return jailed[tonumber(source)] ~= nil end
FBRP.Justice.PrisonSpawn = function() return J.prison.spawns[math.random(#J.prison.spawns)] end

-- Resource restart: players re-pick their character, which triggers
-- fbrp:justice:spawned again, so nothing needs resuming here.
