-- Justice: Bolingbroke prison (sentences, prison jobs, good behaviour,
-- breakouts), community service at Legion Square, the police CAD/MDT (dispatch
-- board, units, records, warrants, BOLOs, reports, flags, licenses), the
-- vehicle registry, impounds, spike strips, GSR tests, ID cards and body cams.

local S = FBRP.Server
local J = FBRP.Justice
local CS = FBRP.CommunityService
local MDT = FBRP.MDT
local sessions = S.sessions
local now, clean, notify, chat, hasPermission = S.now, S.clean, S.notify, S.chat, S.hasPermission

local jailed = {}       -- source -> live sentence
local jobs = {}         -- source -> { job, step, spot, at }
local jobCooldown = {}  -- source -> ms when the next job may start
local escapes = {}      -- source -> started (ms)
local serving = {}      -- source -> live community service
local spikes = {}       -- officer source -> { entity, expires }
local units = {}        -- officer source -> { status, callsign }
local lastMdt = {}
local alprReads = {}     -- officer source -> recent Wraith plate reader reads, newest first

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
    return MySQL.single.await('SELECT id,owner_license,discord_id,first_name,last_name,date_of_birth,gender,last_played_at FROM characters WHERE id=? AND archived=FALSE', { tonumber(id) })
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

-- Releasing someone early is narrower than jailing them: police with jail powers,
-- or Admin+ staff holding the force-release ACE. Jail-only staff cannot undo a sentence.
local function canRelease(source)
    return hasPermission(source, FBRP.Ace.policeJail) or hasPermission(source, FBRP.Ace.staffRelease)
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

local function dist2d(a, b)
    local dx, dy = a.x - b.x, a.y - b.y
    return math.sqrt(dx * dx + dy * dy)
end

local function near(coords, spot, radius)
    return coords and dist2d(coords, spot) <= radius and math.abs(coords.z - spot.z) < 12.0
end

local function onDutyPolice()
    local count = 0
    for src in pairs(sessions) do
        if isPolice(src) then count = count + 1 end
    end
    return count
end

local function policeNotify(message, tone, except)
    for target in pairs(sessions) do
        if target ~= except and isPolice(target) then notify(target, message, tone or 'info') end
    end
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

local function dayStart()
    local t = os.time()
    return (t - t % 86400) * 1000
end

-- ─────────────────────────── prison ───────────────────────────

local function jobById(id)
    for _, job in ipairs(J.jobs) do
        if job.id == id then return job end
    end
end

local function tierOf(value)
    for _, tier in ipairs(J.behaviour.tiers) do
        if value >= tier.min then return tier end
    end
    return J.behaviour.tiers[#J.behaviour.tiers]
end

local function adjustBehaviour(j, delta)
    j.behaviour = math.max(0, math.min(100, math.floor((j.behaviour or J.behaviour.start) + delta)))
end

-- Takes time off a sentence, respecting the floor and the maximum share any
-- sentence can be shortened by. Returns the seconds actually removed.
local function cutSentence(j, seconds)
    seconds = math.max(0, seconds or 0)
    local maxCut = j.total * (J.maxReductionPercent / 100)
    local cut = math.min(seconds, maxCut - (j.reduced or 0), j.remaining - J.workMinimumRemaining)
    if cut <= 0 then return 0 end
    j.remaining = j.remaining - cut
    j.reduced = (j.reduced or 0) + cut
    return cut
end

local function persist(source)
    local j = jailed[source]
    if not j then return end
    MySQL.update('UPDATE jail_sentences SET seconds_remaining=?,behaviour=?,jobs_done=?,reduced_seconds=?,updated_at=? WHERE id=? AND status=\'serving\'', {
        math.max(0, math.ceil(j.remaining)), j.behaviour, j.jobsDone or 0, math.floor(j.reduced or 0), now(), j.id
    })
    j.lastPersist = now()
end

local function jobView(source)
    local task = jobs[source]
    if not task then return nil end
    local job = task.job
    return {
        id=job.id, label=job.label, step=task.step, steps=job.steps, holdMs=job.holdMs, scenario=job.scenario, prompt=job.prompt,
        stepLabel=job.stepLabels and job.stepLabels[task.step] or job.label,
        spot={ x=task.spot.x, y=task.spot.y, z=task.spot.z },
    }
end

local function jailInfo(source)
    local j = jailed[source]
    local tier = tierOf(j.behaviour)
    return {
        remaining=math.ceil(j.remaining), total=j.total, months=j.months, charges=chargeTitles(j.charges), prison=J.prison.name,
        behaviour=j.behaviour, tier=tier.label, mult=tier.mult, reduced=math.floor(j.reduced or 0), jobsDone=j.jobsDone or 0,
        maxReduction=math.floor(j.total * J.maxReductionPercent / 100),
        goodTime=j.behaviour >= J.behaviour.goodTimeThreshold, job=jobView(source),
    }
end

local function pushJail(source)
    if jailed[source] then TriggerClientEvent('fbrp:jail:update', source, jailInfo(source)) end
end

local function putInJail(source, sentence)
    jailed[source] = {
        id=sentence.id, remaining=sentence.remaining, total=sentence.total, months=sentence.months,
        charges=sentence.charges or {}, behaviour=sentence.behaviour or J.behaviour.start, jobsDone=sentence.jobsDone or 0,
        reduced=sentence.reduced or 0, enteredAt=now(), lastTick=now(), lastPersist=now(), lastUpdate=0, calmSince=now(),
    }
    jobs[source] = nil
    escapes[source] = nil
    local player = Player(source)
    if player then
        player.state:set('fbrp:restrained', nil, true)
        player.state:set('fbrp:jailed', true, true)
    end
    TriggerClientEvent('fbrp:restraints:clear', source)
    local spawn = J.prison.spawns[math.random(#J.prison.spawns)]
    TriggerClientEvent('fbrp:jail:enter', source, spawn, jailInfo(source))
end

local function releaseInmate(source, reason, actor)
    local j = jailed[source]
    if not j then return false end
    jailed[source] = nil
    jobs[source] = nil
    escapes[source] = nil
    local stamp = now()
    MySQL.update.await("UPDATE jail_sentences SET status='released',seconds_remaining=0,behaviour=?,jobs_done=?,reduced_seconds=?,release_reason=?,released_at=?,updated_at=? WHERE id=?", {
        j.behaviour, j.jobsDone or 0, math.floor(j.reduced or 0), reason, stamp, stamp, j.id
    })
    local player = Player(source)
    if player then player.state:set('fbrp:jailed', nil, true) end
    TriggerClientEvent('fbrp:jail:release', source, J.prison.release, reason)
    local s = sessions[source]
    FBRP.DB.audit(actor or 'system', 'justice.release', s and s.discord or source, { sentence=j.id, reason=reason, behaviour=j.behaviour, jobs=j.jobsDone, reduced=math.floor(j.reduced or 0) })
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
    if not row then return false end
    putInJail(source, {
        id=tonumber(row.id), remaining=tonumber(row.seconds_remaining) or 0, total=tonumber(row.seconds_total) or 0,
        months=tonumber(row.months) or 0, charges=decode(row.charges), behaviour=tonumber(row.behaviour), jobsDone=tonumber(row.jobs_done),
        reduced=tonumber(row.reduced_seconds),
    })
    notify(source, ('You still have %s left on your sentence at %s.'):format(formatDuration(row.seconds_remaining), J.prison.name), 'warning')
    return true
end

local endService -- forward declaration (community service section)

-- fbrp_jail replaces this prison when it's running: hand the sentence over (months -> minutes)
local function jailResource()
    return GetResourceState('fbrp_jail') == 'started'
end

local function startSentence(target, actor, months, charges, notes, actorOverride)
    local s = sessions[target]
    if not s then return false, 'That player is not loaded.' end
    if jailResource() then
        local reason = chargeTitles(charges or {})
        if reason == '' then reason = (notes and notes ~= '') and notes or 'No reason given' end
        local minutes = math.max(1, math.ceil((tonumber(months) or 1) * J.secondsPerMonth / 60))
        local characterId, name = characterOf(target)
        local actorId, actorName = officer(actor)
        if actorOverride then actorId, actorName = 'system', actorOverride end
        MySQL.insert.await([[
            INSERT INTO criminal_records(character_id,license,name,kind,charges,months,fine,notes,officer_id,officer_name,created_at)
            VALUES(?,?,?,'arrest',?,?,0,?,?,?,?)
        ]], { characterId, s.license, name or GetPlayerName(target), json.encode(charges or {}), months, notes ~= '' and notes or nil, actorId, actorName, now() })
        return exports.fbrp_jail:JailPlayer(target, minutes, reason, actorOverride or actor)
    end
    if jailed[target] then return false, 'That player is already serving a sentence.' end
    if serving[target] then endService(target, 'converted') end
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
    if actorOverride then actorId, actorName = 'system', actorOverride end
    local stamp = now()
    local id = MySQL.insert.await([[
        INSERT INTO jail_sentences(character_id,license,discord_id,name,officer_id,officer_name,months,charges,seconds_total,seconds_remaining,status,behaviour,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,'serving',?,?,?)
    ]], { characterId, s.license, s.discord, name, actorId, actorName, months, json.encode(charges), seconds, seconds, J.behaviour.start, stamp, stamp })
    MySQL.insert.await([[
        INSERT INTO criminal_records(character_id,license,name,kind,charges,months,fine,notes,officer_id,officer_name,created_at)
        VALUES(?,?,?,'arrest',?,?,0,?,?,?,?)
    ]], { characterId, s.license, name, json.encode(charges), months, notes ~= '' and notes or nil, actorId, actorName, stamp })
    if characterId then
        MySQL.update.await("UPDATE warrants SET status='served',closed_by=?,closed_at=? WHERE character_id=? AND status='active'", { actorName, stamp, characterId })
    end
    if FBRP.Economy and FBRP.Economy.confiscate then FBRP.Economy.confiscate(target, actorName) end
    putInJail(target, { id=tonumber(id), remaining=seconds, total=seconds, months=months, charges=charges })
    chat(target, 'SENTENCED', ('%s sentenced you to %d months (%s) at %s for: %s'):format(actorName, months, formatDuration(seconds), J.prison.name, chargeTitles(charges) ~= '' and chargeTitles(charges) or 'unspecified charges'), RED)
    chat(target, 'BOLINGBROKE', 'Good behaviour and /prisonwork jobs shorten your time. Stay out of trouble.', AMBER)
    FBRP.DB.audit(actorId, 'justice.jail', s.discord or target, { sentence=id, name=name, months=months, charges=chargeTitles(charges), notes=notes })
    return true, ('%s sentenced to %d months.'):format(name, months)
end

-- ─────────────────────────── community service ───────────────────────────

local function serviceInfo(source)
    local c = serving[source]
    if not c then return { active=false } end
    local graceLeft = c.outsideSince and math.max(0, CS.graceSeconds - math.floor((now() - c.outsideSince) / 1000)) or nil
    return {
        active=true, remaining=math.ceil(c.remaining), total=c.total, minutes=c.minutes, collected=c.collected,
        state=c.state, graceLeft=graceLeft, charges=chargeTitles(c.charges), idleSeconds=CS.idleSeconds,
        idleLeft=math.max(0, CS.idleSeconds - math.floor((now() - c.lastActive) / 1000)),
    }
end

local function pushService(source)
    TriggerClientEvent('fbrp:service:update', source, serviceInfo(source))
end

local function persistService(source)
    local c = serving[source]
    if not c then return end
    MySQL.update("UPDATE community_service SET seconds_remaining=?,collected=?,updated_at=? WHERE id=? AND status='serving'", { math.max(0, math.ceil(c.remaining)), c.collected, now(), c.id })
    c.lastPersist = now()
end

local function putInService(source, row)
    serving[source] = {
        id=row.id, remaining=row.remaining, total=row.total, minutes=row.minutes, charges=row.charges or {}, collected=row.collected or 0,
        lastTick=now(), lastActive=now(), lastPickup=0, lastPersist=now(), lastUpdate=0, state='working', enteredAt=now(),
    }
    local player = Player(source)
    if player then
        player.state:set('fbrp:restrained', nil, true)
        player.state:set('fbrp:communityService', true, true)
    end
    TriggerClientEvent('fbrp:restraints:clear', source)
    TriggerClientEvent('fbrp:service:enter', source, CS.spawn, serviceInfo(source))
end

endService = function(source, status, actor)
    local c = serving[source]
    if not c then return false end
    serving[source] = nil
    local stamp = now()
    MySQL.update.await('UPDATE community_service SET status=?,seconds_remaining=?,collected=?,finished_at=?,updated_at=? WHERE id=?', {
        status, status == 'completed' and 0 or math.max(0, math.ceil(c.remaining)), c.collected, stamp, stamp, c.id
    })
    local player = Player(source)
    if player then player.state:set('fbrp:communityService', nil, true) end
    TriggerClientEvent('fbrp:service:release', source, status)
    local s = sessions[source]
    FBRP.DB.audit(actor or 'system', 'justice.service_' .. status, s and s.discord or source, { service=c.id, collected=c.collected, remaining=math.ceil(c.remaining) })
    return true, c
end

local function startService(target, actor, minutes, charges, notes)
    local s = sessions[target]
    if not s then return false, 'That player is not loaded.' end
    if jailed[target] then return false, 'That player is already serving a prison sentence.' end
    if serving[target] then return false, 'That player is already doing community service.' end
    local characterId, name = characterOf(target)
    name = name or GetPlayerName(target) or ('Player ' .. target)
    minutes = math.max(1, math.min(CS.maxMinutes, math.floor(tonumber(minutes) or 1)))
    local seconds = minutes * 60
    local actorId, actorName = officer(actor)
    local stamp = now()
    local id = MySQL.insert.await([[
        INSERT INTO community_service(character_id,license,discord_id,name,officer_id,officer_name,minutes,charges,seconds_total,seconds_remaining,status,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,'serving',?,?)
    ]], { characterId, s.license, s.discord, name, actorId, actorName, minutes, json.encode(charges), seconds, seconds, stamp, stamp })
    local recordNotes = ('Community service: %d minutes at Legion Square.%s'):format(minutes, notes ~= '' and (' ' .. notes) or '')
    MySQL.insert.await([[
        INSERT INTO criminal_records(character_id,license,name,kind,charges,months,fine,notes,officer_id,officer_name,created_at)
        VALUES(?,?,?,'service',?,0,0,?,?,?,?)
    ]], { characterId, s.license, name, json.encode(charges), recordNotes:sub(1, 500), actorId, actorName, stamp })
    if characterId then
        MySQL.update.await("UPDATE warrants SET status='served',closed_by=?,closed_at=? WHERE character_id=? AND status='active'", { actorName, stamp, characterId })
    end
    if FBRP.Economy and FBRP.Economy.confiscate then FBRP.Economy.confiscate(target, actorName) end
    putInService(target, { id=tonumber(id), remaining=seconds, total=seconds, minutes=minutes, charges=charges })
    chat(target, 'COMMUNITY SERVICE', ('%s sentenced you to %d minutes of community service at Legion Square for: %s'):format(actorName, minutes, chargeTitles(charges) ~= '' and chargeTitles(charges) or 'unspecified charges'), AMBER)
    chat(target, 'COMMUNITY SERVICE', ('Pick up rubbish to keep your clock running. Leaving the square for more than %d seconds sends you to %s.'):format(CS.graceSeconds, J.prison.name), AMBER)
    FBRP.DB.audit(actorId, 'justice.service', s.discord or target, { service=id, name=name, minutes=minutes, charges=chargeTitles(charges), notes=notes })
    return true, ('%s sentenced to %d minutes of community service.'):format(name, minutes)
end

local function escapeService(source)
    local ok, c = endService(source, 'escaped')
    if not ok then return end
    local _, name = characterOf(source)
    name = name or GetPlayerName(source)
    local months = CS.escapeMonths + math.ceil(c.remaining / 60)
    local charges = {}
    for _, charge in ipairs(c.charges or {}) do charges[#charges + 1] = charge end
    charges[#charges + 1] = { id='service_fail', title='Failure to complete community service', kind='misdemeanor' }
    startSentence(source, 0, months, charges, 'Walked out of community service at Legion Square.', 'Florida Bay Courts')
    notify(source, 'You walked away from community service. You are being taken to Bolingbroke.', 'error')
    policeNotify(('%s walked out of community service and was transferred to %s (%d months).'):format(name, J.prison.name, months), 'warning')
end

local function activeService(source)
    local s = sessions[source]
    if not s then return nil end
    local characterId = characterOf(source)
    local clause, value = subjectClause(characterId, s.license)
    return MySQL.single.await(("SELECT * FROM community_service WHERE status='serving' AND %s ORDER BY id DESC LIMIT 1"):format(clause), { value })
end

local function resumeService(source)
    if serving[source] or jailed[source] then return end
    local row = activeService(source)
    if not row then return end
    putInService(source, {
        id=tonumber(row.id), remaining=tonumber(row.seconds_remaining) or 0, total=tonumber(row.seconds_total) or 0,
        minutes=tonumber(row.minutes) or 0, charges=decode(row.charges), collected=tonumber(row.collected) or 0,
    })
    notify(source, ('You still owe %s of community service at Legion Square.'):format(formatDuration(row.seconds_remaining)), 'warning')
end

RegisterNetEvent('fbrp:service:pickup', function()
    local src = source
    local c = serving[src]
    if not c then return end
    local stamp = now()
    if stamp - c.lastPickup < CS.pickupMs - 700 then return end
    if not near(pedCoords(src), CS.center, CS.radius + 2.0) then return end
    c.lastPickup = stamp
    c.lastActive = stamp
    c.collected = c.collected + 1
    pushService(src)
end)

-- ─────────────────────────── clocks ───────────────────────────

-- One-second clock for prison sentences and community service. Both only
-- count while the player is in the game.
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
                -- A calm minute improves behaviour; at Good or better it also earns good-time credit.
                if stamp - j.calmSince >= 60000 then
                    j.calmSince = stamp
                    adjustBehaviour(j, J.behaviour.calmMinuteGain)
                    if j.behaviour >= J.behaviour.goodTimeThreshold then cutSentence(j, J.behaviour.goodTimeSecondsPerMinute) end
                end
                if j.remaining <= 0 then
                    releaseInmate(src, 'served')
                    notify(src, 'Sentence served. You are free to go.', 'success')
                else
                    if stamp - j.lastUpdate >= 5000 then
                        j.lastUpdate = stamp
                        pushJail(src)
                        -- Server-side leash: walking, driving or teleporting out puts them back in the yard.
                        local coords = pedCoords(src)
                        if coords and not escapes[src] and stamp - j.enteredAt > 15000
                            and #(coords - J.prison.center) > J.prison.leashRadius + 20.0 then
                            adjustBehaviour(j, -J.behaviour.leashPenalty)
                            j.calmSince = stamp
                            TriggerClientEvent('fbrp:jail:return', src, J.prison.spawns[math.random(#J.prison.spawns)])
                        end
                    end
                    if stamp - j.lastPersist >= 30000 then persist(src) end
                end
            end
        end
        for src, c in pairs(serving) do
            if not sessions[src] then
                serving[src] = nil
            else
                local dt = (stamp - c.lastTick) / 1000
                c.lastTick = stamp
                local coords = pedCoords(src)
                local previous = c.state
                if coords and stamp - c.enteredAt > 8000 and not near(coords, CS.center, CS.radius) then
                    if not c.outsideSince then
                        c.outsideSince = stamp
                        notify(src, ('Get back to Legion Square! You have %d seconds before you are sent to prison.'):format(CS.graceSeconds), 'error')
                    elseif stamp - c.outsideSince >= CS.graceSeconds * 1000 then
                        escapeService(src)
                        goto continue
                    end
                    c.state = 'outside'
                else
                    c.outsideSince = nil
                    if stamp - c.lastActive <= CS.idleSeconds * 1000 then
                        c.remaining = c.remaining - dt
                        c.state = 'working'
                    else
                        c.state = 'paused'
                    end
                end
                if c.remaining <= 0 then
                    endService(src, 'completed')
                    notify(src, 'Community service complete. You are free to go.', 'success')
                    chat(src, 'COMMUNITY SERVICE', ('Service complete - %d pieces of rubbish collected. Thanks for keeping Legion Square clean.'):format(c.collected), GREEN)
                else
                    if previous ~= c.state or stamp - c.lastUpdate >= 2000 then
                        c.lastUpdate = stamp
                        pushService(src)
                    end
                    if stamp - c.lastPersist >= 30000 then persistService(src) end
                end
            end
            ::continue::
        end
    end
end)

AddEventHandler('playerDropped', function()
    local src = source
    persist(src)
    persistService(src)
    jailed[src] = nil
    jobs[src] = nil
    jobCooldown[src] = nil
    escapes[src] = nil
    serving[src] = nil
    units[src] = nil
    lastMdt[src] = nil
    local strip = spikes[src]
    if strip and DoesEntityExist(strip.entity) then DeleteEntity(strip.entity) end
    spikes[src] = nil
end)

AddEventHandler('onResourceStop', function(name)
    if name ~= GetCurrentResourceName() then return end
    for src in pairs(jailed) do persist(src) end
    for src in pairs(serving) do persistService(src) end
    for _, strip in pairs(spikes) do
        if DoesEntityExist(strip.entity) then DeleteEntity(strip.entity) end
    end
end)

-- The client reports when its character has spawned; that is when a pending
-- sentence or community service resumes.
RegisterNetEvent('fbrp:justice:spawned', function()
    local src = source
    if not S.isReady() then return end
    SetTimeout(1500, function()
        if not sessions[src] then return end
        if not resumeSentence(src) then resumeService(src) end
    end)
end)

RegisterNetEvent('fbrp:jail:leash', function()
    local src = source
    local j = jailed[src]
    if j and not escapes[src] then
        adjustBehaviour(j, -J.behaviour.leashPenalty)
        j.calmSince = now()
        TriggerClientEvent('fbrp:jail:return', src, J.prison.spawns[math.random(#J.prison.spawns)])
        pushJail(src)
    end
end)

-- ─────────────────────────── prison jobs ───────────────────────────

local function jobBoard(source)
    local j = jailed[source]
    local tier = tierOf(j.behaviour)
    local list = {}
    for _, job in ipairs(J.jobs) do
        list[#list + 1] = {
            id=job.id, label=job.label, description=job.description, icon=job.icon, steps=job.steps,
            reduction=math.floor(job.reduction * tier.mult), baseReduction=job.reduction, behaviour=job.behaviour or 0,
            holdSeconds=math.floor(job.holdMs / 1000),
        }
    end
    return { jobs=list, current=jobView(source), info=jailInfo(source), cooldown=math.max(0, math.ceil(((jobCooldown[source] or 0) - now()) / 1000)) }
end

local function assignStep(source, job, step, previous)
    local index
    repeat index = math.random(#job.spots) until job.spots[index] ~= previous or #job.spots == 1
    jobs[source] = { job=job, step=step, spot=job.spots[index], at=now() }
    TriggerClientEvent('fbrp:jail:job', source, jobView(source))
end

RegisterNetEvent('fbrp:jail:workRequest', function()
    local src = source
    if not jailed[src] then return end
    TriggerClientEvent('fbrp:jail:board', src, jobBoard(src))
end)

RegisterNetEvent('fbrp:jail:jobStart', function(jobId)
    local src = source
    if not jailed[src] or escapes[src] then return end
    local job = jobById(clean(jobId, 24))
    if not job then return end
    if jobs[src] then return notify(src, 'Finish or quit your current job first.', 'error') end
    if (jobCooldown[src] or 0) > now() then return notify(src, 'The guard tells you to take a breather first.', 'info') end
    assignStep(src, job, 1)
    notify(src, ('%s assigned. Follow the marker.'):format(job.label), 'info')
    pushJail(src)
end)

RegisterNetEvent('fbrp:jail:jobCancel', function()
    local src = source
    if not jobs[src] then return end
    jobs[src] = nil
    jobCooldown[src] = now() + 10000
    TriggerClientEvent('fbrp:jail:job', src, nil)
    notify(src, 'You walked off the job.', 'info')
    pushJail(src)
end)

RegisterNetEvent('fbrp:jail:jobStep', function()
    local src = source
    local j, task = jailed[src], jobs[src]
    if not j or not task then return end
    local job = task.job
    if not near(pedCoords(src), task.spot, 4.5) then return notify(src, 'You walked away from the job.', 'error') end
    if now() - task.at < job.holdMs - 600 then return end
    local tier = tierOf(j.behaviour)
    local saved = cutSentence(j, job.reduction * tier.mult)
    if job.behaviour then adjustBehaviour(j, job.behaviour) end
    if task.step >= job.steps then
        jobs[src] = nil
        j.jobsDone = (j.jobsDone or 0) + 1
        adjustBehaviour(j, J.behaviour.jobGain)
        jobCooldown[src] = now() + J.workCooldownSeconds * 1000
        TriggerClientEvent('fbrp:jail:job', src, nil)
        notify(src, saved > 0 and ('%s complete. %s taken off your sentence. Behaviour: %s.'):format(job.label, formatDuration(saved), tierOf(j.behaviour).label)
            or ('%s complete. Behaviour: %s.'):format(job.label, tierOf(j.behaviour).label), 'success')
    else
        assignStep(src, job, task.step + 1, task.spot)
        notify(src, saved > 0 and ('Step done (-%s). Next: %s.'):format(formatDuration(saved), jobView(src).stepLabel) or ('Step done. Next: %s.'):format(jobView(src).stepLabel), 'success')
    end
    persist(src)
    pushJail(src)
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
    jobs[src] = nil
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
        adjustBehaviour(j, -J.behaviour.escapePenalty)
        j.calmSince = now()
        pushJail(src)
        return notify(src, 'You were spotted and dragged back from the fence. Your behaviour record took a hit.', 'error')
    end
    jailed[src] = nil
    escapes[src] = nil
    jobs[src] = nil
    local stamp = now()
    MySQL.update.await("UPDATE jail_sentences SET status='escaped',seconds_remaining=?,behaviour=0,updated_at=? WHERE id=?", { math.ceil(j.remaining), stamp, j.id })
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
    if j then
        return chat(source, 'BOLINGBROKE', ('%s remaining of %d months · behaviour %d (%s) · %s cut so far. Charges: %s'):format(
            formatDuration(j.remaining), j.months, j.behaviour, tierOf(j.behaviour).label, formatDuration(j.reduced or 0),
            chargeTitles(j.charges) ~= '' and chargeTitles(j.charges) or 'none listed'), AMBER)
    end
    local c = serving[source]
    if c then return chat(source, 'COMMUNITY SERVICE', ('%s of service left · %d pieces collected.'):format(formatDuration(c.remaining), c.collected), AMBER) end
    notify(source, 'You are not serving a sentence.', 'info')
end, false)

RegisterNetEvent('fbrp:justice:status', function()
    local src = source
    local j = jailed[src]
    if j then
        return chat(src, 'BOLINGBROKE', ('%s remaining of %d months · behaviour %d (%s) · %s cut so far. Charges: %s'):format(
            formatDuration(j.remaining),j.months,j.behaviour,tierOf(j.behaviour).label,formatDuration(j.reduced or 0),chargeTitles(j.charges) ~= '' and chargeTitles(j.charges) or 'none listed'), AMBER)
    end
    local c = serving[src]
    if c then return chat(src, 'COMMUNITY SERVICE', ('%s of service left · %d pieces collected.'):format(formatDuration(c.remaining),c.collected), AMBER) end
    notify(src, 'You have no active sentence or community service.', 'info')
end)

-- /jail <id> <months> [reason] - quick sentence without the MDT.
local function quickBookingCheck(source, target)
    if source <= 0 or hasPermission(source, FBRP.Ace.staffJail) then return true end
    if target == source then return false, 'You cannot sentence yourself.' end
    if not S.playersNear(source, target, 10.0) then return false, 'The suspect must be with you to be booked.' end
    local player = Player(target)
    if not (player and player.state['fbrp:restrained']) then return false, 'Restrain the suspect before booking them.' end
    return true
end

if GetResourceState('fbrp_jail') == 'missing' then
RegisterCommand('jail', function(source, args)
    if jailResource() then return end -- fbrp_jail registers its own /jail while it is running
    if source > 0 and not canJail(source) then return S.deny(source, FBRP.Ace.policeJail) end
    local target, months = tonumber(args[1]), tonumber(args[2])
    if not target or not months or not sessions[target] then return notify(source, 'Usage: /jail <server id> <months> [charges/notes]', 'error') end
    local allowed, why = quickBookingCheck(source, target)
    if not allowed then return notify(source, why, 'error') end
    local reason = clean(table.concat(args, ' ', 3), 200)
    local charges = reason ~= '' and { { id='custom', title=reason, kind='custom' } } or {}
    local ok, message = startSentence(target, source, months, charges, '')
    notify(source, message, ok and 'success' or 'error')
end, false)
end -- fbrp_jail missing

-- /communityservice <id> <minutes> [reason]
local function serviceCommand(source, args)
    if source > 0 and not canJail(source) then return S.deny(source, FBRP.Ace.policeJail) end
    local target, minutes = tonumber(args[1]), tonumber(args[2])
    if not target or not minutes or not sessions[target] then return notify(source, ('Usage: /communityservice <server id> <minutes 1-%d> [charges/notes]'):format(CS.maxMinutes), 'error') end
    local allowed, why = quickBookingCheck(source, target)
    if not allowed then return notify(source, why, 'error') end
    local reason = clean(table.concat(args, ' ', 3), 200)
    local charges = reason ~= '' and { { id='custom', title=reason, kind='custom' } } or {}
    local ok, message = startService(target, source, minutes, charges, '')
    notify(source, message, ok and 'success' or 'error')
end
RegisterCommand('communityservice', serviceCommand, false)
RegisterCommand('cs', serviceCommand, false)

RegisterCommand('endservice', function(source, args)
    if source > 0 and not canRelease(source) then return S.deny(source, FBRP.Ace.policeJail) end
    local target = tonumber(args[1])
    if not target or not serving[target] then return notify(source, 'Usage: /endservice <server id of someone doing community service>', 'error') end
    endService(target, 'released', select(1, officer(source)))
    notify(target, ('%s released you from community service.'):format(select(2, officer(source))), 'success')
    notify(source, 'Community service ended.', 'success')
end, false)

if GetResourceState('fbrp_jail') == 'missing' then
RegisterCommand('unjail', function(source, args)
    if jailResource() then return end -- fbrp_jail registers its own /unjail while it is running
    if source > 0 and not canRelease(source) then return S.deny(source, FBRP.Ace.policeJail) end
    local target = tonumber(args[1])
    if not target or not jailed[target] then return notify(source, 'Usage: /unjail <server id of an inmate>', 'error') end
    local actor = officer(source)
    releaseInmate(target, 'released', actor)
    notify(target, ('You were released early by %s.'):format(select(2, officer(source))), 'success')
    notify(source, 'Inmate released.', 'success')
end, false)
end -- fbrp_jail missing

-- Admin+ force release, called by EasyAdmin's player menu. Works on someone online
-- whatever put them there: a sentence, community service, cuffs, a zip tie or a head bag.
local RELEASE_KINDS = {
    jail = 'jail',
    communityservice = 'community service',
    headbag = 'head bag',
    ziptie = 'zip ties',
    cuff = 'handcuffs',
}

local function forceRelease(actorSource, target, kind)
    actorSource, target = tonumber(actorSource), tonumber(target)
    if not actorSource or actorSource <= 0 or not hasPermission(actorSource, FBRP.Ace.staffRelease) then
        return false, 'You do not have permission to force-release players.'
    end
    if not RELEASE_KINDS[kind] then return false, 'Unknown release type.' end
    if not target or not sessions[target] then return false, 'That player is not online.' end
    local player = Player(target)
    local actorId, actorName = officer(actorSource)
    local restrained = player and player.state['fbrp:restrained'] or nil
    if kind == 'jail' then
        if not jailed[target] then return false, 'That player is not in jail.' end
        releaseInmate(target, 'released', actorId)
    elseif kind == 'communityservice' then
        if not serving[target] then return false, 'That player is not doing community service.' end
        endService(target, 'released', actorId)
    elseif kind == 'headbag' then
        if not (player and player.state['fbrp:blindfolded'] == true) then return false, 'That player is not wearing a head bag.' end
        TriggerClientEvent('fbrp:interaction:apply', target, 'unblindfold', actorSource)
    elseif kind == 'ziptie' then
        if restrained ~= 'ziptie' then return false, 'That player is not zip-tied.' end
        player.state:set('fbrp:restrained', nil, true)
        TriggerClientEvent('fbrp:restraints:clear', target)
    else
        if restrained ~= 'cuffs' then return false, 'That player is not handcuffed.' end
        player.state:set('fbrp:restrained', nil, true)
        TriggerClientEvent('fbrp:restraints:clear', target)
    end
    local _, targetName = characterOf(target)
    targetName = targetName or GetPlayerName(target)
    notify(target, ('%s removed your %s.'):format(actorName, RELEASE_KINDS[kind]), 'success')
    FBRP.DB.audit(actorId, 'staff.force_release', sessions[target].discord or tostring(target), { kind=kind, target=target })
    return true, ('Removed %s from %s.'):format(RELEASE_KINDS[kind], targetName)
end
exports('ForceRelease', forceRelease)

RegisterCommand('prison', function(source)
    if source > 0 and not canMdt(source) then return S.deny(source, FBRP.Ace.policeMdt) end
    local lines = {}
    for src, j in pairs(jailed) do
        local _, name = characterOf(src)
        lines[#lines + 1] = ('[%d] %s · %s left · %s'):format(src, name or GetPlayerName(src), formatDuration(j.remaining), tierOf(j.behaviour).label)
    end
    for src, c in pairs(serving) do
        local _, name = characterOf(src)
        lines[#lines + 1] = ('[%d] %s · community service %s left'):format(src, name or GetPlayerName(src), formatDuration(c.remaining))
    end
    chat(source, 'CORRECTIONS', #lines > 0 and table.concat(lines, ' | ') or 'Nobody is in custody right now.', AMBER)
end, false)

-- ─────────────────────────── CAD / MDT ───────────────────────────

local STATUS = {}
for _, status in ipairs(MDT.unitStatuses) do STATUS[status.id] = status end
local FLAG = {}
for _, flag in ipairs(MDT.flags) do FLAG[flag.id] = flag end
local LICENSE = {}
for _, license in ipairs(MDT.licenses) do LICENSE[license.id] = license end

local function unitOf(source)
    local unit = units[source]
    if unit then return unit end
    local s = sessions[source]
    local row = s and s.discord and MySQL.single.await('SELECT callsign FROM mdt_units WHERE discord_id=?', { s.discord })
    unit = { status='available', callsign=row and row.callsign or nil }
    units[source] = unit
    return unit
end

local function activeWarrantCount(characterId)
    if not characterId then return 0 end
    return tonumber(MySQL.scalar.await("SELECT COUNT(*) FROM warrants WHERE character_id=? AND status='active'", { characterId })) or 0
end

local function unitList()
    local out = {}
    for src, s in pairs(sessions) do
        local police, ems = isPolice(src), hasPermission(src, FBRP.Ace.ems)
        if police or ems then
            local unit = unitOf(src)
            local coords = pedCoords(src)
            out[#out + 1] = {
                id=src, name=S.displayName(src), org=s.org and s.org.name or nil, kind=police and 'police' or 'ems',
                downed=Player(src).state['fbrp:downed'] and true or false, callsign=unit.callsign, status=unit.status,
                x=coords and coords.x or nil, y=coords and coords.y or nil,
            }
        end
    end
    table.sort(out, function(a, b) return a.id < b.id end)
    return out
end

local function callPriority(call)
    local value = tonumber(call.priority) or MDT.callPriority[call.kind] or 3
    return math.max(1, math.min(3, math.floor(value)))
end

local function callList()
    local calls = {}
    for _, call in pairs(S.recentCalls) do
        if not call.closedAt then
            local responders = {}
            for src in pairs(call.responders) do
                if sessions[src] then
                    local unit = units[src]
                    responders[#responders + 1] = { id=src, name=S.displayName(src), callsign=unit and unit.callsign or nil }
                end
            end
            calls[#calls + 1] = {
                id=call.id, kind=call.kind, caller=call.callerName, message=call.message, at=call.at, priority=callPriority(call),
                x=call.coords and call.coords.x, y=call.coords and call.coords.y, responders=responders, notes=call.notes or {},
            }
        end
    end
    table.sort(calls, function(a, b)
        if a.priority ~= b.priority then return a.priority < b.priority end
        return a.id > b.id
    end)
    return calls
end

-- Calls closed in the last half hour, newest first, so a unit can look back at
-- what just happened without searching the reports.
local function callHistory()
    local out = {}
    for _, call in pairs(S.recentCalls) do
        if call.closedAt then
            out[#out + 1] = {
                id=call.id, kind=call.kind, caller=call.callerName, message=call.message, at=call.at, closedAt=call.closedAt,
                closedBy=call.closedBy, priority=callPriority(call), notes=#(call.notes or {}),
            }
        end
    end
    table.sort(out, function(a, b) return a.closedAt > b.closedAt end)
    while #out > 15 do table.remove(out) end
    return out
end

local function stats(source)
    local since = dayStart()
    local actorId = officer(source)
    local row = MySQL.single.await([[
        SELECT SUM(kind='arrest') arrests,SUM(kind='citation') citations,SUM(kind='service') services,
               SUM(kind='arrest' AND officer_id=?) myArrests,SUM(kind='citation' AND officer_id=?) myCitations
          FROM criminal_records WHERE created_at>=?
    ]], { actorId, actorId, since }) or {}
    local reports = MySQL.single.await('SELECT COUNT(*) total,SUM(author_id=?) mine FROM mdt_reports WHERE created_at>=?', { actorId, since }) or {}
    return {
        arrests=tonumber(row.arrests) or 0, citations=tonumber(row.citations) or 0, services=tonumber(row.services) or 0,
        reports=tonumber(reports.total) or 0,
        mine={ arrests=tonumber(row.myArrests) or 0, citations=tonumber(row.myCitations) or 0, reports=tonumber(reports.mine) or 0 },
    }
end

local function dashboard(source)
    local inmates = MySQL.query.await("SELECT id,character_id,name,months,seconds_remaining,status,officer_name,behaviour,jobs_done,created_at FROM jail_sentences WHERE status IN ('serving','escaped') ORDER BY id DESC LIMIT 30")
    for _, row in ipairs(inmates) do
        local src = onlineByCharacter(row.character_id)
        if src and jailed[src] and jailed[src].id == tonumber(row.id) then
            row.online = src
            row.seconds_remaining = math.ceil(jailed[src].remaining)
            row.behaviour = jailed[src].behaviour
            row.jobs_done = jailed[src].jobsDone
        end
        row.tier = tierOf(tonumber(row.behaviour) or J.behaviour.start).label
    end
    local services = MySQL.query.await("SELECT id,character_id,name,minutes,seconds_remaining,collected,officer_name,created_at FROM community_service WHERE status='serving' ORDER BY id DESC LIMIT 20")
    for _, row in ipairs(services) do
        local src = onlineByCharacter(row.character_id)
        if src and serving[src] and serving[src].id == tonumber(row.id) then
            row.online = src
            row.seconds_remaining = math.ceil(serving[src].remaining)
            row.collected = serving[src].collected
            row.state = serving[src].state
        end
    end
    local records = MySQL.query.await('SELECT id,character_id,name,kind,charges,months,fine,officer_name,created_at FROM criminal_records ORDER BY id DESC LIMIT 15')
    for _, row in ipairs(records) do row.charges = decode(row.charges) end
    local seizures = MySQL.query.await("SELECT id,name,drug,units,status,seized_by,location,created_at FROM org_drug_runs WHERE status IN ('seized','confiscated') ORDER BY id DESC LIMIT 10")
    return {
        warrants = MySQL.query.await("SELECT id,character_id,subject_name,reason,created_by,created_at FROM warrants WHERE status='active' ORDER BY id DESC LIMIT 40"),
        bolos = MySQL.query.await('SELECT id,kind,plate,description,created_by,created_at FROM bolos WHERE active=TRUE ORDER BY id DESC LIMIT 30'),
        records = records,
        inmates = inmates,
        services = services,
        seizures = seizures,
        units = unitList(),
        calls = callList(),
        history = callHistory(),
        applications = MySQL.query.await([[
            SELECT l.character_id,l.kind,l.updated_at,CONCAT(c.first_name,' ',c.last_name) name FROM mdt_licenses l
              JOIN characters c ON c.id=l.character_id WHERE l.status='pending' ORDER BY l.updated_at LIMIT 20
        ]]),
        stats = source and stats(source) or nil,
        me = source and { id=source, unit=unitOf(source) } or nil,
        alpr = source and alprReads[source] or {},
    }
end

local function likeEscape(value)
    return (value:gsub('[%%_\\]', '\\%0'))
end

local function search(query)
    query = clean(query, 60)
    local rows = {}
    local id = tonumber(query)
    local citizenNo = query:upper():match('^FB%-?(%d+)$')
    if citizenNo then
        local row = characterRow(tonumber(citizenNo))
        if row then rows[1] = row end
    elseif id then
        local characterId = sessions[id] and characterOf(id)
        if characterId then
            local row = characterRow(characterId)
            if row then rows[1] = row end
        end
    end
    if #rows == 0 and #query >= 2 then
        local like = '%' .. likeEscape(query) .. '%'
        local digits = query:gsub('%D', '')
        local phoneLike = #digits >= 4 and ('%' .. digits .. '%') or ''
        rows = MySQL.query.await([[
            SELECT DISTINCT c.id,c.first_name,c.last_name,c.date_of_birth,c.gender,c.last_played_at FROM characters c
              LEFT JOIN character_profiles p ON p.character_id=c.id
              LEFT JOIN character_changes ch ON ch.character_id=c.id AND ch.field='name'
             WHERE c.archived=FALSE AND (CONCAT(c.first_name,' ',c.last_name) LIKE ? OR p.nickname LIKE ? OR ch.old_value LIKE ?
                OR c.date_of_birth=? OR (?<>'' AND REPLACE(REPLACE(REPLACE(REPLACE(p.phone,'-',''),' ',''),'(',''),')','') LIKE ?))
             ORDER BY c.last_played_at DESC LIMIT 20
        ]], { like, like, like, query, phoneLike, phoneLike })
    end
    local out = {}
    for _, row in ipairs(rows) do
        local flags = MySQL.query.await('SELECT flag FROM mdt_citizen_flags WHERE character_id=?', { tonumber(row.id) })
        local list = {}
        for _, flag in ipairs(flags) do list[#list + 1] = flag.flag end
        out[#out + 1] = {
            id=tonumber(row.id), name=fullName(row), dob=row.date_of_birth, gender=row.gender,
            citizen=citizenNumber(row.id), online=onlineByCharacter(row.id), warrants=activeWarrantCount(tonumber(row.id)), flags=list,
        }
    end
    return out
end

local function licenseList(characterId)
    local rows = MySQL.query.await('SELECT kind,status,points,restriction,issued_at,updated_by,updated_at FROM mdt_licenses WHERE character_id=?', { characterId })
    local byKind = {}
    for _, row in ipairs(rows) do byKind[row.kind] = row end
    local out = {}
    for _, license in ipairs(MDT.licenses) do
        local row = byKind[license.id]
        out[#out + 1] = {
            id=license.id, label=license.label, status=row and row.status or 'none', points=row and tonumber(row.points) or 0,
            restriction=row and row.restriction or nil, issuedAt=row and tonumber(row.issued_at) or nil,
            updatedBy=row and row.updated_by, updatedAt=row and tonumber(row.updated_at),
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
    local sentence = MySQL.single.await("SELECT id,months,seconds_remaining,status,officer_name,behaviour,created_at FROM jail_sentences WHERE character_id=? AND status IN ('serving','escaped') ORDER BY id DESC LIMIT 1", { id })
    if sentence and online and jailed[online] then
        sentence.seconds_remaining = math.ceil(jailed[online].remaining)
        sentence.behaviour = jailed[online].behaviour
    end
    if sentence then sentence.tier = tierOf(tonumber(sentence.behaviour) or J.behaviour.start).label end
    local service = MySQL.single.await("SELECT id,minutes,seconds_remaining,collected,officer_name,created_at FROM community_service WHERE character_id=? AND status='serving' ORDER BY id DESC LIMIT 1", { id })
    if service and online and serving[online] then service.seconds_remaining = math.ceil(serving[online].remaining) end
    local restrained = online and Player(online).state['fbrp:restrained'] or nil
    local flags = MySQL.query.await('SELECT flag,added_by,added_at FROM mdt_citizen_flags WHERE character_id=? ORDER BY added_at', { id })
    return {
        id=id, name=fullName(row), dob=row.date_of_birth, gender=row.gender, citizen=citizenNumber(id),
        online=online, restrained=restrained and true or false, lastSeen=tonumber(row.last_played_at),
        details=FBRP.CitizenApi.details(id), aliases=FBRP.CitizenApi.aliases(id),
        records=records,
        warrants=MySQL.query.await('SELECT id,reason,status,created_by,created_at,closed_by,closed_at FROM warrants WHERE character_id=? ORDER BY status=\'active\' DESC,id DESC LIMIT 30', { id }),
        vehicles=MySQL.query.await('SELECT plate,model,label,stolen,impounded_at,registered_at FROM vehicle_registrations WHERE character_id=? ORDER BY registered_at DESC LIMIT 20', { id }),
        sentence=sentence,
        service=service,
        flags=flags,
        notes=MySQL.query.await('SELECT id,body,author_name,created_at FROM mdt_citizen_notes WHERE character_id=? ORDER BY id DESC LIMIT 25', { id }),
        licenses=licenseList(id),
        reports=MySQL.query.await([[
            SELECT r.id,r.kind,r.title,r.author_name,r.created_at,rc.role FROM mdt_report_citizens rc
              JOIN mdt_reports r ON r.id=rc.report_id WHERE rc.character_id=? ORDER BY r.id DESC LIMIT 20
        ]], { id }),
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
        if report.ownerId then
            local driver = MySQL.single.await("SELECT status FROM mdt_licenses WHERE character_id=? AND kind='driver'", { report.ownerId })
            report.license = driver and driver.status or 'none'
            local flags = MySQL.query.await('SELECT flag FROM mdt_citizen_flags WHERE character_id=?', { report.ownerId })
            report.flags = {}
            for _, flag in ipairs(flags) do report.flags[#report.flags + 1] = FLAG[flag.flag] and FLAG[flag.flag].label or flag.flag end
        end
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
    if report.license == 'suspended' or report.license == 'revoked' then flags[#flags + 1] = ('OWNER LICENSE %s'):format(report.license:upper()) end
    for _, flag in ipairs(report.flags or {}) do flags[#flags + 1] = flag:upper() end
    for _, bolo in ipairs(report.bolos) do flags[#flags + 1] = ('BOLO #%d: %s'):format(bolo.id, bolo.description) end
    local text = ('%s · %s · Registered to %s'):format(report.plate, report.model or 'Unknown', report.owner or 'Unknown')
    if #flags > 0 then text = text .. ' · ' .. table.concat(flags, ' · ') end
    return text, #flags > 0 and RED or GREEN
end

local function reportList(query, kind)
    query = clean(query, 60)
    kind = clean(kind, 24)
    local validKind = false
    for _, k in ipairs(MDT.reportKinds) do if k == kind then validKind = true end end
    local kindClause, kindArgs = '', {}
    if validKind then kindClause, kindArgs = ' AND r.kind=?', { kind } end
    if query ~= '' then
        local like = '%' .. likeEscape(query) .. '%'
        local args = { like, like, like, tonumber(query) or 0 }
        for _, value in ipairs(kindArgs) do args[#args + 1] = value end
        return MySQL.query.await(([[
            SELECT DISTINCT r.id,r.kind,r.title,r.location,r.author_name,r.created_at FROM mdt_reports r
              LEFT JOIN mdt_report_citizens rc ON rc.report_id=r.id
              LEFT JOIN characters c ON c.id=rc.character_id
             WHERE (r.title LIKE ? OR r.narrative LIKE ? OR CONCAT(c.first_name,' ',c.last_name) LIKE ? OR r.id=?)%s
             ORDER BY r.id DESC LIMIT 40
        ]]):format(kindClause), args)
    end
    return MySQL.query.await(('SELECT r.id,r.kind,r.title,r.location,r.author_name,r.created_at FROM mdt_reports r WHERE 1=1%s ORDER BY r.id DESC LIMIT 40'):format(kindClause), kindArgs)
end

local function reportView(id)
    local row = MySQL.single.await('SELECT * FROM mdt_reports WHERE id=?', { tonumber(id) })
    if not row then return nil end
    row.citizens = decode(row.citizens)
    row.officers = decode(row.officers)
    row.addenda = MySQL.query.await('SELECT id,body,author_name,created_at FROM mdt_report_addenda WHERE report_id=? ORDER BY id', { row.id })
    return row
end

local function sendMdt(source, kind, data)
    TriggerClientEvent('fbrp:mdt:data', source, kind, data)
end

local function mdtPayload(source)
    return {
        dashboard=dashboard(source), canJail=canJail(source), officer=S.displayName(source), maxMonths=J.maxMonths, secondsPerMonth=J.secondsPerMonth,
        serviceMax=CS.maxMinutes, statuses=MDT.unitStatuses, flags=MDT.flags, licenses=MDT.licenses, reportKinds=MDT.reportKinds,
        department=(sessions[source] and sessions[source].org and sessions[source].org.name) or 'Florida Bay Police',
    }
end

local function openMdt(source, focus)
    local payload = mdtPayload(source)
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
RegisterNetEvent('fbrp:mdt:request', function()
    local src = source
    if not canMdt(src) then return S.deny(src, FBRP.Ace.policeMdt) end
    openMdt(src)
end)
RegisterCommand('cad', function(source) ExecuteCommand('mdt') end, false)

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

local function bookingTarget(source, characterId)
    if not canJail(source) then return nil, 'You do not have permission to book suspects.' end
    local target = onlineByCharacter(characterId)
    if not target then return nil, 'The suspect must be in the city to be booked.' end
    if target == source then return nil, 'You cannot sentence yourself.' end
    if not hasPermission(source, FBRP.Ace.staffJail) then
        if not S.playersNear(source, target, 10.0) then return nil, 'The suspect must be with you to be booked.' end
        if not Player(target).state['fbrp:restrained'] then return nil, 'Restrain the suspect before booking them.' end
    end
    return target
end

local function sentenceFromMdt(source, characterId, chargeIds, monthsOverride, notes)
    local target, why = bookingTarget(source, characterId)
    if not target then return false, why end
    local charges, months = resolveCharges(chargeIds)
    if #charges == 0 then return false, 'Pick at least one charge.' end
    months = tonumber(monthsOverride) or months
    if months < 1 then months = 1 end
    return startSentence(target, source, months, charges, notes)
end

local function serviceFromMdt(source, characterId, chargeIds, minutes, notes)
    local target, why = bookingTarget(source, characterId)
    if not target then return false, why end
    local charges = resolveCharges(chargeIds)
    if #charges == 0 then return false, 'Pick at least one charge.' end
    return startService(target, source, minutes, charges, notes)
end

local MDT_ACTIONS = {}

MDT_ACTIONS.dashboard = function(src) sendMdt(src, 'dashboard', dashboard(src)) end
MDT_ACTIONS.search = function(src, data)
    local plate = plateReport(data.query)
    sendMdt(src, 'results', {
        query=clean(data.query, 60), rows=search(data.query),
        plate=plate and plate.registered and { plate=plate.plate, model=plate.model, owner=plate.owner, stolen=plate.stolen } or nil,
    })
end
MDT_ACTIONS.profile = function(src, data)
    local p = profile(data.id)
    if p then sendMdt(src, 'profile', p) else notify(src, 'Citizen not found.', 'error') end
end
MDT_ACTIONS.plate = function(src, data)
    local report = plateReport(data.plate)
    if report then sendMdt(src, 'plate', report) end
end

MDT_ACTIONS.warrant = function(src, data, actorId, actorName)
    local row = characterRow(data.id)
    local reason = clean(data.reason, 500)
    if not row or reason == '' then return notify(src, 'A warrant needs a citizen and a reason.', 'error') end
    local id = MySQL.insert.await('INSERT INTO warrants(character_id,subject_name,reason,status,created_by_id,created_by,created_at) VALUES(?,?,?,?,?,?,?)', {
        tonumber(row.id), fullName(row), reason, 'active', actorId, actorName, now()
    })
    FBRP.DB.audit(actorId, 'justice.warrant', tostring(row.id), { warrant=id, name=fullName(row), reason=reason })
    policeNotify(('Warrant #%d issued for %s.'):format(id, fullName(row)), 'warning', src)
    notify(src, ('Warrant #%d issued.'):format(id), 'success')
    sendMdt(src, 'profile', profile(row.id))
end

MDT_ACTIONS.closeWarrant = function(src, data, actorId, actorName)
    local status = data.status == 'served' and 'served' or 'cleared'
    local row = MySQL.single.await('SELECT id,character_id FROM warrants WHERE id=? AND status=\'active\'', { tonumber(data.id) })
    if not row then return end
    MySQL.update.await('UPDATE warrants SET status=?,closed_by=?,closed_at=? WHERE id=?', { status, actorName, now(), row.id })
    FBRP.DB.audit(actorId, 'justice.warrant_' .. status, tostring(row.character_id or ''), { warrant=row.id })
    notify(src, ('Warrant #%d marked %s.'):format(row.id, status), 'success')
    if data.refresh == 'profile' and row.character_id then sendMdt(src, 'profile', profile(row.character_id)) else sendMdt(src, 'dashboard', dashboard(src)) end
end

MDT_ACTIONS.bolo = function(src, data, actorId, actorName)
    local description = clean(data.description, 500)
    local boloKind = data.kind == 'vehicle' and 'vehicle' or 'person'
    local plate = boloKind == 'vehicle' and normalizePlate(data.plate) or ''
    if description == '' then return notify(src, 'Describe who or what to look out for.', 'error') end
    local id = MySQL.insert.await('INSERT INTO bolos(kind,plate,description,active,created_by_id,created_by,created_at) VALUES(?,?,?,TRUE,?,?,?)', {
        boloKind, plate ~= '' and plate or nil, description, actorId, actorName, now()
    })
    S.sendDispatch('BOLO', src, ('BOLO #%d%s: %s'):format(id, plate ~= '' and (' · ' .. plate) or '', description), pedCoords(src), { FBRP.Ace.police }, false)
    FBRP.DB.audit(actorId, 'justice.bolo', plate ~= '' and plate or nil, { bolo=id, kind=boloKind, description=description })
    sendMdt(src, 'dashboard', dashboard(src))
end

MDT_ACTIONS.closeBolo = function(src, data)
    MySQL.update.await('UPDATE bolos SET active=FALSE,closed_at=? WHERE id=?', { now(), tonumber(data.id) })
    notify(src, 'BOLO cancelled.', 'success')
    sendMdt(src, 'dashboard', dashboard(src))
end

MDT_ACTIONS.cite = function(src, data)
    local ok, message = issueCitation(src, data.id, data.charges, clean(data.notes, 300))
    notify(src, message, ok and 'success' or 'error')
    if ok then sendMdt(src, 'profile', profile(data.id)) end
end

MDT_ACTIONS.sentence = function(src, data)
    local ok, message = sentenceFromMdt(src, data.id, data.charges, data.months, clean(data.notes, 300))
    notify(src, message, ok and 'success' or 'error')
    if ok then sendMdt(src, 'profile', profile(data.id)) end
end

MDT_ACTIONS.service = function(src, data)
    local ok, message = serviceFromMdt(src, data.id, data.charges, data.minutes, clean(data.notes, 300))
    notify(src, message, ok and 'success' or 'error')
    if ok then sendMdt(src, 'profile', profile(data.id)) end
end

MDT_ACTIONS.release = function(src, data, actorId, actorName)
    if not canRelease(src) then return notify(src, 'You do not have permission to release inmates.', 'error') end
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
    sendMdt(src, 'dashboard', dashboard(src))
end

MDT_ACTIONS.serviceRelease = function(src, data, actorId, actorName)
    if not canRelease(src) then return notify(src, 'You do not have permission to end community service.', 'error') end
    local row = MySQL.single.await("SELECT id,character_id FROM community_service WHERE id=? AND status='serving'", { tonumber(data.id) })
    if not row then return end
    local online = onlineByCharacter(row.character_id)
    if online and serving[online] and serving[online].id == tonumber(row.id) then
        endService(online, 'released', actorId)
        notify(online, ('%s released you from community service.'):format(actorName), 'success')
    else
        MySQL.update.await("UPDATE community_service SET status='released',finished_at=?,updated_at=? WHERE id=?", { now(), now(), row.id })
    end
    notify(src, ('Community service #%d ended.'):format(row.id), 'success')
    sendMdt(src, 'dashboard', dashboard(src))
end

-- Units & dispatch
MDT_ACTIONS.unitStatus = function(src, data)
    local status = STATUS[clean(data.status, 16)]
    if not status then return end
    unitOf(src).status = status.id
    sendMdt(src, 'dashboard', dashboard(src))
end

MDT_ACTIONS.callsign = function(src, data)
    local callsign = clean(data.callsign, 12):upper():gsub('[^%w%-]', '')
    if callsign == '' then return notify(src, 'Callsigns use letters, numbers and dashes.', 'error') end
    local s = sessions[src]
    unitOf(src).callsign = callsign
    if s and s.discord then
        MySQL.prepare.await('INSERT INTO mdt_units(discord_id,callsign,updated_at) VALUES(?,?,?) ON DUPLICATE KEY UPDATE callsign=VALUES(callsign),updated_at=VALUES(updated_at)', { s.discord, callsign, now() })
    end
    notify(src, ('Callsign set to %s.'):format(callsign), 'success')
    TriggerEvent('fbrp:callsignUpdated', src, callsign) -- refresh the overhead tag line (main.lua)
    sendMdt(src, 'dashboard', dashboard(src))
end

local function findCall(id)
    local call = S.recentCalls[tonumber(id) or -1]
    if call and not call.closedAt then return call end
end

MDT_ACTIONS.callAttach = function(src, data)
    local call = findCall(data.id)
    if not call then return notify(src, 'That call is no longer active.', 'error') end
    TriggerClientEvent('fbrp:dispatch:waypoint', src, call.coords, call.id)
    if not call.responders[src] then
        call.responders[src] = true
        unitOf(src).status = 'enroute'
        if call.caller and sessions[call.caller] then notify(call.caller, ('%s is responding to your call #%d.'):format(S.displayName(src), call.id), 'success') end
        for target in pairs(sessions) do
            if target ~= src and (isPolice(target) or hasPermission(target, FBRP.Ace.ems)) then
                notify(target, ('%s attached to call #%d.'):format(S.displayName(src), call.id), 'info')
            end
        end
    end
    sendMdt(src, 'dashboard', dashboard(src))
end

MDT_ACTIONS.callDetach = function(src, data)
    local call = findCall(data.id)
    if call then call.responders[src] = nil end
    unitOf(src).status = 'available'
    sendMdt(src, 'dashboard', dashboard(src))
end

MDT_ACTIONS.callWaypoint = function(src, data)
    local call = findCall(data.id)
    if call then TriggerClientEvent('fbrp:dispatch:waypoint', src, call.coords, call.id) notify(src, ('GPS set to call #%d.'):format(call.id), 'success') end
end

MDT_ACTIONS.callNote = function(src, data)
    local call = findCall(data.id)
    local text = clean(data.text, 240)
    if not call or text == '' then return end
    call.notes = call.notes or {}
    table.insert(call.notes, 1, { by=S.displayName(src), callsign=unitOf(src).callsign, text=text, at=now() })
    while #call.notes > 20 do table.remove(call.notes) end
    sendMdt(src, 'dashboard', dashboard(src))
end

MDT_ACTIONS.callPriority = function(src, data)
    local call = findCall(data.id)
    local priority = tonumber(data.priority)
    if not call or not priority then return end
    call.priority = math.max(1, math.min(3, math.floor(priority)))
    sendMdt(src, 'dashboard', dashboard(src))
end

MDT_ACTIONS.callClose = function(src, data, actorId, actorName)
    local call = findCall(data.id)
    if not call then return end
    call.closedAt = now()
    call.closedBy = actorName
    for responder in pairs(call.responders) do
        if units[responder] and units[responder].status ~= 'break' then units[responder].status = 'available' end
    end
    FBRP.DB.audit(actorId, 'dispatch.close', tostring(call.id), { kind=call.kind, notes=#(call.notes or {}) })
    notify(src, ('Call #%d closed.'):format(call.id), 'success')
    sendMdt(src, 'dashboard', dashboard(src))
end

MDT_ACTIONS.selfDispatch = function(src, data, actorId)
    local kind = clean(data.kind, 12)
    local coords = pedCoords(src)
    local street = clean(data.street, 80)
    local unit = unitOf(src)
    local who = unit.callsign and (unit.callsign .. ' ' .. S.displayName(src)) or S.displayName(src)
    if kind == 'backup' then
        S.sendDispatch('BACKUP', src, ('%s requesting backup%s.'):format(who, street ~= '' and (' at ' .. street) or ''), coords, { FBRP.Ace.police }, true)
        notify(src, 'Backup requested.', 'success')
    elseif kind == 'traffic' then
        local detail = clean(data.detail, 120)
        local id = S.sendDispatch('TRAFFIC', src, ('Traffic stop by %s%s%s.'):format(who, street ~= '' and (' on ' .. street) or '', detail ~= '' and (' · ' .. detail) or ''), coords, { FBRP.Ace.police }, true)
        local call = S.recentCalls[id]
        if call then call.responders[src] = true end
        unit.status = 'onscene'
        notify(src, 'Traffic stop logged.', 'success')
    elseif kind == 'panic' then
        S.sendDispatch('PANIC', src, ('Officer panic activation · %s'):format(who), coords, { FBRP.Ace.police }, false)
        FBRP.DB.audit(actorId, 'dispatch.panic', nil, { x=coords and coords.x, y=coords and coords.y })
    else
        return
    end
    sendMdt(src, 'dashboard', dashboard(src))
end

-- Citizen intelligence
MDT_ACTIONS.flag = function(src, data, actorId, actorName)
    local id, flag = tonumber(data.id), clean(data.flag, 24)
    if not id or not FLAG[flag] then return end
    if data.on then
        MySQL.prepare.await('INSERT IGNORE INTO mdt_citizen_flags(character_id,flag,added_by,added_at) VALUES(?,?,?,?)', { id, flag, actorName, now() })
    else
        MySQL.update.await('DELETE FROM mdt_citizen_flags WHERE character_id=? AND flag=?', { id, flag })
    end
    FBRP.DB.audit(actorId, 'justice.flag', tostring(id), { flag=flag, on=data.on == true })
    sendMdt(src, 'profile', profile(id))
end

MDT_ACTIONS.note = function(src, data, actorId, actorName)
    local id, body = tonumber(data.id), clean(data.body, 600)
    if not id or body == '' then return end
    MySQL.insert.await('INSERT INTO mdt_citizen_notes(character_id,body,author_id,author_name,created_at) VALUES(?,?,?,?,?)', { id, body, actorId, actorName, now() })
    sendMdt(src, 'profile', profile(id))
end

MDT_ACTIONS.license = function(src, data, actorId, actorName)
    local id, kind, status = tonumber(data.id), clean(data.license, 16), clean(data.status, 12)
    if not id or not LICENSE[kind] then return end
    if status == 'none' then
        MySQL.update.await('DELETE FROM mdt_licenses WHERE character_id=? AND kind=?', { id, kind })
    elseif status == 'valid' or status == 'suspended' or status == 'revoked' then
        MySQL.prepare.await([[
            INSERT INTO mdt_licenses(character_id,kind,status,points,updated_by,updated_at,issued_at) VALUES(?,?,?,0,?,?,?)
            ON DUPLICATE KEY UPDATE status=VALUES(status),updated_by=VALUES(updated_by),updated_at=VALUES(updated_at),
              issued_at=IF(VALUES(status)='valid',COALESCE(issued_at,VALUES(issued_at)),issued_at)
        ]], { id, kind, status, actorName, now(), status == 'valid' and now() or nil })
    else
        return
    end
    FBRP.DB.audit(actorId, 'justice.license', tostring(id), { license=kind, status=status })
    notify(src, ('%s set to %s.'):format(LICENSE[kind].label, status), 'success')
    local target = onlineByCharacter(id)
    if target and status ~= 'valid' and status ~= 'none' then notify(target, ('Your %s was %s by %s.'):format(LICENSE[kind].label:lower(), status, actorName), 'warning') end
    sendMdt(src, 'profile', profile(id))
end

-- Approve or turn down a citizen's license application.
MDT_ACTIONS.licenseReview = function(src, data, actorId, actorName)
    local id, kind = tonumber(data.id), clean(data.license, 16)
    if not id or not LICENSE[kind] then return end
    local row = MySQL.single.await("SELECT status FROM mdt_licenses WHERE character_id=? AND kind=?", { id, kind })
    if not row or row.status ~= 'pending' then return notify(src, 'That application was already handled.', 'error') end
    local approve = data.approve == true
    if approve then
        MySQL.update.await("UPDATE mdt_licenses SET status='valid',issued_at=?,updated_by=?,updated_at=? WHERE character_id=? AND kind=?", { now(), actorName, now(), id, kind })
    else
        MySQL.update.await('DELETE FROM mdt_licenses WHERE character_id=? AND kind=?', { id, kind })
    end
    FBRP.DB.audit(actorId, approve and 'justice.license_approve' or 'justice.license_deny', tostring(id), { license=kind })
    notify(src, ('%s application %s.'):format(LICENSE[kind].label, approve and 'approved' or 'denied'), 'success')
    local target = onlineByCharacter(id)
    if target then
        notify(target, approve and ('Your %s application was approved by %s.'):format(LICENSE[kind].label:lower(), actorName)
            or ('Your %s application was denied by %s.'):format(LICENSE[kind].label:lower(), actorName), approve and 'success' or 'warning')
    end
    sendMdt(src, 'dashboard', dashboard(src))
    if data.refresh == 'profile' then sendMdt(src, 'profile', profile(id)) end
end

-- Vehicles
MDT_ACTIONS.vehicleFlag = function(src, data, actorId)
    local plate = normalizePlate(data.plate)
    if plate == '' then return end
    MySQL.update.await('UPDATE vehicle_registrations SET stolen=? WHERE plate=?', { data.stolen == true, plate })
    FBRP.DB.audit(actorId, 'justice.vehicle_flag', plate, { stolen=data.stolen == true })
    sendMdt(src, 'plate', plateReport(plate))
end

MDT_ACTIONS.clearImpound = function(src, data, actorId)
    local plate = normalizePlate(data.plate)
    if plate == '' then return end
    MySQL.update.await('UPDATE vehicle_registrations SET impounded_at=NULL,impounded_by=NULL WHERE plate=?', { plate })
    FBRP.DB.audit(actorId, 'justice.impound_release', plate, {})
    notify(src, ('%s released from impound.'):format(plate), 'success')
    sendMdt(src, 'plate', plateReport(plate))
end

-- Reports
MDT_ACTIONS.reports = function(src, data)
    sendMdt(src, 'reports', { query=clean(data.query, 60), kind=clean(data.kind, 24), rows=reportList(data.query, data.kind) })
end

MDT_ACTIONS.reportView = function(src, data)
    local report = reportView(data.id)
    if report then sendMdt(src, 'report', report) else notify(src, 'Report not found.', 'error') end
end

MDT_ACTIONS.report = function(src, data, actorId, actorName)
    local title = clean(data.title, 120)
    local narrative = tostring(data.narrative or ''):gsub('[%z\1-\9\11-\31]', ' '):sub(1, 6000)
    local kind = clean(data.kind, 24)
    if title == '' or #narrative < 20 then return notify(src, 'Reports need a title and at least 20 characters of narrative.', 'error') end
    local validKind = false
    for _, k in ipairs(MDT.reportKinds) do if k == kind then validKind = true end end
    if not validKind then kind = 'Incident' end
    local citizens = {}
    for _, entry in ipairs(type(data.citizens) == 'table' and data.citizens or {}) do
        local row = characterRow(type(entry) == 'table' and entry.id or entry)
        if row then
            local role = type(entry) == 'table' and clean(entry.role, 16) or 'involved'
            citizens[#citizens + 1] = { id=tonumber(row.id), name=fullName(row), role=role ~= '' and role or 'involved' }
        end
        if #citizens >= 12 then break end
    end
    local officers = { actorName }
    for _, name in ipairs(type(data.officers) == 'table' and data.officers or {}) do
        local value = clean(name, 60)
        if value ~= '' and value ~= actorName then officers[#officers + 1] = value end
        if #officers >= 8 then break end
    end
    local stamp = now()
    local location = clean(data.location ~= nil and data.location ~= '' and data.location or data.street, 120)
    local id = MySQL.insert.await('INSERT INTO mdt_reports(kind,title,location,narrative,citizens,officers,author_id,author_name,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)', {
        kind, title, location ~= '' and location or nil, narrative, json.encode(citizens), json.encode(officers), actorId, actorName, stamp, stamp
    })
    for _, citizen in ipairs(citizens) do
        MySQL.prepare.await('INSERT IGNORE INTO mdt_report_citizens(report_id,character_id,role) VALUES(?,?,?)', { id, citizen.id, citizen.role })
    end
    FBRP.DB.audit(actorId, 'justice.report', tostring(id), { kind=kind, title=title, citizens=#citizens })
    notify(src, ('Report #%d filed.'):format(id), 'success')
    sendMdt(src, 'report', reportView(id))
end

-- Reports are never rewritten after filing: corrections go in as addenda that
-- keep their author and time.
MDT_ACTIONS.addendum = function(src, data, actorId, actorName)
    local id, body = tonumber(data.id), clean(data.body, 2000)
    if not id or #body < 5 then return notify(src, 'An addendum needs at least a sentence.', 'error') end
    local exists = MySQL.scalar.await('SELECT id FROM mdt_reports WHERE id=?', { id })
    if not exists then return notify(src, 'Report not found.', 'error') end
    local count = tonumber(MySQL.scalar.await('SELECT COUNT(*) FROM mdt_report_addenda WHERE report_id=?', { id })) or 0
    if count >= (MDT.addendumMax or 40) then return notify(src, 'This report has reached its addendum limit.', 'error') end
    MySQL.insert.await('INSERT INTO mdt_report_addenda(report_id,body,author_id,author_name,created_at) VALUES(?,?,?,?,?)', { id, body, actorId, actorName, now() })
    MySQL.update.await('UPDATE mdt_reports SET updated_at=? WHERE id=?', { now(), id })
    FBRP.DB.audit(actorId, 'justice.report_addendum', tostring(id), {})
    notify(src, ('Addendum added to report #%d.'):format(id), 'success')
    sendMdt(src, 'report', reportView(id))
end

MDT_ACTIONS.citizenPick = function(src, data)
    sendMdt(src, 'citizenPick', { rows=search(data.query) })
end

RegisterNetEvent('fbrp:mdt:action', function(kind, data)
    local src = source
    if not canMdt(src) then return end
    local stamp = GetGameTimer()
    if lastMdt[src] and stamp - lastMdt[src] < 200 then return end
    lastMdt[src] = stamp
    if type(data) ~= 'table' then data = {} end
    local handler = MDT_ACTIONS[clean(kind, 24)]
    if not handler then return end
    local actorId, actorName = officer(src)
    handler(src, data, actorId, actorName)
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

-- Owner-only stolen/recovered report, shared by the commands and the My Citizen menu.
function FBRP.Justice.SetStolen(source, rawPlate, stolen)
    local plate = ownedPlate(source, rawPlate)
    if not plate then return false, 'Only a vehicle registered to you can be reported.' end
    MySQL.update.await('UPDATE vehicle_registrations SET stolen=? WHERE plate=?', { stolen == true, plate })
    if stolen then
        S.sendDispatch('311', source, ('Stolen vehicle report: %s'):format(plate), pedCoords(source), { FBRP.Ace.police }, true)
        return true, ('%s reported stolen. Police have been notified.'):format(plate)
    end
    return true, ('%s marked as recovered.'):format(plate)
end

RegisterCommand('reportstolen', function(source, args)
    if source <= 0 then return end
    local plate = ownedPlate(source, table.concat(args, ' '))
    if not plate then return notify(source, 'Usage: /reportstolen <plate of a vehicle registered to you>', 'error') end
    local _, message = FBRP.Justice.SetStolen(source, plate, true)
    notify(source, message, 'success')
end, false)

RegisterCommand('recovered', function(source, args)
    if source <= 0 then return end
    local plate = ownedPlate(source, table.concat(args, ' '))
    if not plate then return notify(source, 'Usage: /recovered <plate of a vehicle registered to you>', 'error') end
    local _, message = FBRP.Justice.SetStolen(source, plate, false)
    notify(source, message, 'success')
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

-- Script-created vehicles retain their first network owner even when OneSync
-- later migrates control to another player. Track the stable license as well so
-- a briefly out-of-scope entity can still be matched to the player who spawned
-- it. Population type 7 is mission/script-created; ambient traffic is excluded.
local SCRIPTED_VEHICLE_POPULATION_TYPE = 7
local spawnedVehicles = {} -- network id -> { license, model }
local spawnedVehicleIds = {} -- entity handle -> network id

local function rememberSpawnedVehicle(entity)
    if not entity or entity == 0 or not DoesEntityExist(entity) or GetEntityType(entity) ~= 2 then return false end
    local netId = NetworkGetNetworkIdFromEntity(entity)
    if not netId or netId <= 0 then return false end
    spawnedVehicleIds[entity] = netId
    spawnedVehicles[netId] = nil -- network ids can be reused after deletion
    if GetEntityPopulationType(entity) ~= SCRIPTED_VEHICLE_POPULATION_TYPE then return true end
    local firstOwner = NetworkGetFirstEntityOwner(entity)
    local ownerSession = firstOwner and firstOwner > 0 and sessions[firstOwner] or nil
    if ownerSession and ownerSession.license then
        spawnedVehicles[netId] = { license=ownerSession.license, model=GetEntityModel(entity) }
    end
    return true
end

AddEventHandler('entityCreated', function(entity)
    CreateThread(function()
        for _ = 1, 20 do
            if DoesEntityExist(entity) and GetEntityType(entity) ~= 0 then
                rememberSpawnedVehicle(entity)
                return
            end
            Wait(50)
        end
    end)
end)

AddEventHandler('entityRemoved', function(entity)
    -- entityRemoved fires after the network object is gone; asking the native
    -- for its id at that point emits NETWORK_GET_NETWORK_ID_FROM_ENTITY. Keep
    -- the id captured by entityCreated instead.
    local netId = spawnedVehicleIds[entity]
    spawnedVehicleIds[entity] = nil
    if netId then spawnedVehicles[netId] = nil end
end)

-- Ask the player who ran /dv for nearby network IDs because client-created
-- vehicles are not always present in the server's entity pool. The server still
-- verifies distance and ownership/creator identity before approving deletion.
local pendingDv = {}

RegisterCommand('dv', function(source)
    if source <= 0 or not sessions[source] then return end
    pendingDv[source] = GetGameTimer() + 5000
    TriggerClientEvent('fbrp:justice:findDvCandidates', source, FBRP.Config.ownedVehicleDeleteDistance or 15.0)
end, false)

RegisterNetEvent('fbrp:justice:dvCandidates', function(candidates)
    local source = source
    local expires = pendingDv[source]
    pendingDv[source] = nil
    if not expires or GetGameTimer() > expires or not sessions[source] then return end

    local characterId = characterOf(source)
    local session = sessions[source]
    local ped = GetPlayerPed(source)
    if not ped or ped == 0 then return end
    local origin = GetEntityCoords(ped)
    local maxDistance = FBRP.Config.ownedVehicleDeleteDistance or 15.0
    local registered = {}
    if characterId then
        for _, row in ipairs(MySQL.query.await('SELECT plate FROM vehicle_registrations WHERE character_id=?', { characterId }) or {}) do
            registered[normalizePlate(row.plate)] = true
        end
    end

    local closest, closestDistance, closestPlate, closestNetId, closestOwnership
    if type(candidates) ~= 'table' then candidates = {} end
    for index = 1, math.min(#candidates, 32) do
        local candidate = candidates[index]
        -- Older clients sent only a network id. New clients also send the plate
        -- and their measured distance so /dv still works when OneSync has not
        -- materialized a client-created vehicle in the server entity pool.
        local netId = tonumber(type(candidate) == 'table' and candidate.netId or candidate) or 0
        local clientDistance = type(candidate) == 'table' and tonumber(candidate.distance) or nil
        local clientPlate = type(candidate) == 'table' and normalizePlate(candidate.plate) or ''
        local clientPersonalId = type(candidate) == 'table' and tonumber(candidate.personalId) or nil
        local clientModel = type(candidate) == 'table' and tonumber(candidate.model) or nil
        local trackedSpawn = spawnedVehicles[netId]
        local spawnedOwnership = trackedSpawn and session and trackedSpawn.license == session.license
            and (not clientModel or trackedSpawn.model == clientModel)
        local registeredOwnership = registered[clientPlate] == true
        local personalIdOwnership = clientPersonalId and FBRP.Personals and FBRP.Personals.ownsId
            and FBRP.Personals.ownsId(source, clientPersonalId)
        local clientOwnership = registeredOwnership or personalIdOwnership or spawnedOwnership
        local vehicle = NetworkGetEntityFromNetworkId(netId)
        if netId > 0 and vehicle and vehicle ~= 0 and DoesEntityExist(vehicle) and GetEntityType(vehicle) == 2 then
            local distance = #(GetEntityCoords(vehicle) - origin)
            if distance <= maxDistance and (not closestDistance or distance < closestDistance) then
                local plate = normalizePlate(GetVehicleNumberPlateText(vehicle))
                local personalOwner = FBRP.Personals and FBRP.Personals.owns and FBRP.Personals.owns(source, vehicle)
                local spawnedOwner = GetEntityPopulationType(vehicle) == SCRIPTED_VEHICLE_POPULATION_TYPE
                    and NetworkGetFirstEntityOwner(vehicle) == source
                if spawnedOwner and session and session.license then
                    spawnedVehicles[netId] = { license=session.license, model=GetEntityModel(vehicle) }
                end
                if personalOwner or registered[plate] or spawnedOwner then
                    closest, closestDistance, closestPlate, closestNetId = vehicle, distance, plate, netId
                    closestOwnership = personalOwner and 'personal' or registered[plate] and 'registered' or 'spawned'
                elseif clientOwnership then
                    -- Plate/state-bag replication can lag behind the entity.
                    -- Client metadata is independently matched to this owner.
                    closest, closestDistance, closestPlate, closestNetId = vehicle, distance, clientPlate, netId
                    closestOwnership = spawnedOwnership and 'spawned' or personalIdOwnership and 'personal' or 'registered'
                end
            end
        elseif netId > 0 and clientDistance and clientDistance >= 0 and clientDistance <= maxDistance
            and clientOwnership
            and (not closestDistance or clientDistance < closestDistance) then
            -- The caller cannot use this fallback to delete somebody else's
            -- vehicle: the claimed plate or personal id is independently matched
            -- to them, or the net id/model matches a vehicle they spawned.
            closest, closestDistance, closestPlate, closestNetId = false, clientDistance, clientPlate, netId
            closestOwnership = spawnedOwnership and 'spawned' or personalIdOwnership and 'personal' or 'registered'
        end
    end

    if closest == nil then
        return notify(source, ('No vehicle you own or spawned is within %d metres.'):format(math.floor(maxDistance)), 'error')
    end
    if closest then
        if FBRP.Personals and FBRP.Personals.removed then FBRP.Personals.removed(closest) end
        DeleteEntity(closest)
    elseif FBRP.Personals and FBRP.Personals.removedNetId then
        FBRP.Personals.removedNetId(closestNetId)
    end
    -- The requesting client normally owns client-created vehicles, so let it
    -- finish the deletion if server-side entity removal has not propagated.
    TriggerClientEvent('fbrp:justice:deleteDvVehicle', source, closestNetId)
    notify(source, ('Your vehicle%s was deleted.'):format(closestPlate ~= '' and (' (' .. closestPlate .. ')') or ''), 'success')
    local s = sessions[source]
    FBRP.DB.audit(s and s.discord or source, 'vehicle.delete', closestPlate ~= '' and closestPlate or nil, {
        distance = math.floor(closestDistance * 10 + 0.5) / 10,
        ownership = closestOwnership,
    })
end)

AddEventHandler('playerDropped', function()
    pendingDv[source] = nil
end)

RegisterNetEvent('fbrp:justice:runplate', function(rawPlate)
    local src = source
    if not isPolice(src) then return S.deny(src, FBRP.Ace.police) end
    local report = plateReport(rawPlate)
    if not report then return notify(src, 'No plate to run.', 'error') end
    local text, color = plateLine(report)
    chat(src, 'PLATE', text, color)
    TriggerClientEvent('fbrp:justice:plateResult', src, report)
end)

-- ─────────────────────────── Wraith ARS 2X plate reader ───────────────────────────
-- The radar's front and rear plate cameras run every plate they read against the
-- MDT (registration, stolen flag, vehicle BOLOs, owner warrants, license status
-- and citizen flags). A hit locks the camera with the BOLO tone and alerts the
-- officer; a manual lock runs the full plate check. Each officer's recent reads
-- are listed on the MDT dashboard and Vehicles tab.

local ALPR_KEEP = 12
local ALPR_CACHE_MS = 15000
local ALPR_REALERT_MS = 90000
local alprCache = {}    -- plate -> { report, at }
local alprAlerted = {}  -- officer source -> { [plate] = ms }
local alprLast = {}     -- officer source .. cam -> ms of the last event handled

local function alprCam(cam)
    return cam == 'rear' and 'rear' or 'front'
end

local function alprReport(rawPlate, fresh)
    local plate = normalizePlate(rawPlate)
    if plate == '' then return nil end
    local stamp = GetGameTimer()
    local cached = alprCache[plate]
    if not fresh and cached and stamp - cached.at < ALPR_CACHE_MS then return cached.report end
    local report = plateReport(plate)
    alprCache[plate] = { report=report, at=stamp }
    return report
end

-- What makes a read a hit worth locking on. An old impound record alone is not.
local function alprHits(report)
    local hits = {}
    if report.stolen then hits[#hits + 1] = 'STOLEN' end
    for _, bolo in ipairs(report.bolos or {}) do hits[#hits + 1] = ('BOLO #%d'):format(bolo.id) end
    if (report.warrants or 0) > 0 then hits[#hits + 1] = 'OWNER WANTED' end
    if report.license == 'suspended' or report.license == 'revoked' then hits[#hits + 1] = ('OWNER LICENSE %s'):format(report.license:upper()) end
    for _, flag in ipairs(report.flags or {}) do hits[#hits + 1] = flag:upper() end
    return hits
end

local function alprRecord(src, cam, report, hits, locked)
    local list = alprReads[src] or {}
    for i = #list, 1, -1 do
        if list[i].plate == report.plate then table.remove(list, i) end
    end
    table.insert(list, 1, {
        plate=report.plate, cam=cam, at=now(), registered=report.registered, model=report.model,
        owner=report.owner, ownerId=report.ownerId, hits=hits, locked=locked and true or false,
    })
    while #list > ALPR_KEEP do table.remove(list) end
    alprReads[src] = list
end

local function alprThrottled(src, cam, gap)
    local key = src .. cam
    local stamp = GetGameTimer()
    if alprLast[key] and stamp - alprLast[key] < gap then return true end
    alprLast[key] = stamp
    return false
end

local function camLabel(cam)
    return cam == 'rear' and 'Rear' or 'Front'
end

RegisterNetEvent('wk:onPlateScanned', function(cam, rawPlate)
    local src = source
    if type(rawPlate) ~= 'string' or not isPolice(src) then return end
    cam = alprCam(cam)
    if alprThrottled(src, cam, 300) then return end
    local report = alprReport(rawPlate, false)
    if not report then return end
    local hits = alprHits(report)
    if #hits == 0 then
        if report.registered then alprRecord(src, cam, report, hits, false) end
        return
    end
    local alerted = alprAlerted[src] or {}
    alprAlerted[src] = alerted
    local stamp = GetGameTimer()
    if alerted[report.plate] and stamp - alerted[report.plate] < ALPR_REALERT_MS then return end
    alerted[report.plate] = stamp
    alprRecord(src, cam, report, hits, true)
    TriggerClientEvent('wk:mdtPlateHit', src, cam, rawPlate:sub(1, 16))
    chat(src, 'ALPR', ('%s camera · %s'):format(camLabel(cam), (plateLine(report))), RED)
    notify(src, ('Plate reader hit: %s · %s'):format(report.plate, table.concat(hits, ' · ')), 'warning')
    TriggerClientEvent('fbrp:justice:plateResult', src, report)
end)

RegisterNetEvent('wk:onPlateLocked', function(cam, rawPlate)
    local src = source
    if type(rawPlate) ~= 'string' or not isPolice(src) then return end
    cam = alprCam(cam)
    if alprThrottled(src, cam .. ':lock', 750) then return end
    local alerted = alprAlerted[src]
    local plate = normalizePlate(rawPlate)
    -- A lock caused by our own hit alert was already reported a moment ago.
    if alerted and alerted[plate] and GetGameTimer() - alerted[plate] < 5000 then return end
    local report = alprReport(rawPlate, true)
    if not report then return end
    alprRecord(src, cam, report, alprHits(report), true)
    local text, color = plateLine(report)
    chat(src, 'ALPR', ('%s camera locked · %s'):format(camLabel(cam), text), color)
    TriggerClientEvent('fbrp:justice:plateResult', src, report)
end)

AddEventHandler('playerDropped', function()
    local src = source
    alprReads[src], alprAlerted[src] = nil, nil
    alprLast[src .. 'front'], alprLast[src .. 'rear'] = nil, nil
    alprLast[src .. 'front:lock'], alprLast[src .. 'rear:lock'] = nil, nil
end)

CreateThread(function()
    while true do
        Wait(60000)
        local stamp = GetGameTimer()
        for plate, entry in pairs(alprCache) do
            if stamp - entry.at > ALPR_CACHE_MS then alprCache[plate] = nil end
        end
    end
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

-- BOLOs close themselves so the board does not fill up with stale lookouts.
CreateThread(function()
    while true do
        Wait(10 * 60000)
        local cutoff = now() - (MDT.boloExpireHours or 72) * 3600000
        MySQL.update('UPDATE bolos SET active=FALSE,closed_at=? WHERE active=TRUE AND created_at<?', { now(), cutoff })
    end
end)

RegisterCommand('bodycam', function(source)
    if source <= 0 then return end
    if not isPolice(source) and not hasPermission(source, FBRP.Ace.ems) then return S.deny(source, FBRP.Ace.police) end
    local s = sessions[source]
    local unit = units[source]
    TriggerClientEvent('fbrp:bodycam:toggle', source, { unit=(unit and unit.callsign and (unit.callsign .. ' · ') or '') .. S.displayName(source), dept=s and s.org and s.org.name or (isPolice(source) and 'Florida Bay Police' or 'Florida Bay Fire Rescue') })
end, false)

-- ─────────────────────────── third eye ───────────────────────────

local function idCard(source, forPolice)
    local characterId = characterOf(source)
    local card = characterId and FBRP.CitizenApi.idCard(characterId, forPolice)
    if not card then return { name=GetPlayerName(source), citizen='Unregistered', dob='Unknown', gender='Unknown' } end
    return card
end

FBRP.InteractionHandlers.checkid = function(src, target)
    local police = isPolice(src)
    local card = idCard(target, police)
    if police and card.id then
        card.warrants = activeWarrantCount(card.id)
        card.inPrison = jailed[target] ~= nil
        local driver = MySQL.single.await("SELECT status FROM mdt_licenses WHERE character_id=? AND kind='driver'", { card.id })
        card.license = driver and driver.status or nil
    end
    TriggerClientEvent('fbrp:idcard:show', src, card)
    local text = ('%s · %s · DOB %s · %s'):format(card.name, card.citizen, card.dob, card.gender)
    if card.warrants and card.warrants > 0 then text = text .. (' · %d ACTIVE WARRANT(S)'):format(card.warrants) end
    if card.license == 'suspended' or card.license == 'revoked' then text = text .. (' · LICENSE %s'):format(card.license:upper()) end
    chat(src, 'IDENTIFICATION', text, (card.warrants or 0) > 0 and RED or AQUA)
end

RegisterNetEvent('fbrp:idcard:own', function()
    local src = source
    if not sessions[src] then return end
    TriggerClientEvent('fbrp:idcard:show', src, idCard(src, false))
end)

FBRP.InteractionHandlers.showid = function(src, target)
    local card = idCard(src, false)
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
    if jailed[target] or serving[target] or characterOf(target) == nil then return false end
    if Player(target).state['fbrp:jailed'] then return false end
    return hasPermission(src, FBRP.Ace.staffJail) or Player(target).state['fbrp:restrained'] ~= nil
end
FBRP.InteractionHandlers.jail = function(src, target)
    if jailResource() then
        exports.fbrp_jail:OpenDialog(src, target)
        return
    end
    local characterId = characterOf(target)
    if not characterId then notify(src, 'This person has not picked a character yet.', 'error') return false end
    openMdt(src, { characterId=characterId, form='sentence' })
end

FBRP.InteractionVisible.commserv = FBRP.InteractionVisible.jail
FBRP.InteractionHandlers.commserv = function(src, target)
    local characterId = characterOf(target)
    if not characterId then notify(src, 'This person has not picked a character yet.', 'error') return false end
    openMdt(src, { characterId=characterId, form='service' })
end

FBRP.Justice.IsJailed = function(source)
    source = tonumber(source)
    return jailed[source] ~= nil or (source and Player(source).state['fbrp:jailed'] == true) or false
end
FBRP.Justice.IsServing = function(source) return serving[tonumber(source)] ~= nil end
FBRP.Justice.PrisonSpawn = function() return J.prison.spawns[math.random(#J.prison.spawns)] end
FBRP.Justice.StartSentence = startSentence

-- Resource restart: players re-pick their character, which triggers
-- fbrp:justice:spawned again, so nothing needs resuming here.
