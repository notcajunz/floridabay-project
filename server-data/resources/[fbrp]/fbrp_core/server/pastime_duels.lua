-- Street duels: two drivers race to the challenger's waypoint. The server
-- watches both cars, so the result never depends on what a client reports.

local S = FBRP.Server
local P = FBRP.Pastimes
local PS = FBRP.PastimeServer
local D = P.duels
local sessions, now, notify = S.sessions, S.now, S.notify

local pending = {}   -- challenged source -> invite
local duels = {}     -- id -> duel
local inDuel = {}    -- source -> id
local cooldown = {}  -- source -> ms
local nextId = 1

local function flat(a, b)
    local dx, dy = a.x - b.x, a.y - b.y
    return math.sqrt(dx * dx + dy * dy)
end

local function driving(src)
    local ped = GetPlayerPed(src)
    if ped <= 0 then return false end
    local vehicle = GetVehiclePedIsIn(ped, false)
    if vehicle == 0 or GetPedInVehicleSeat(vehicle, -1) ~= ped then return false end
    local ok, kind = pcall(GetVehicleType, vehicle)
    if ok and kind and kind ~= '' and kind ~= 'automobile' and kind ~= 'bike' then return false end
    return true
end

local function scalar(sql, args)
    return tonumber(MySQL.scalar.await(sql, args or {})) or 0
end

local function other(duel, src)
    return duel.a == src and duel.b or duel.a
end

local function resolve(duel, winner, loser, why)
    if duel.done then return end
    duel.done = true
    duels[duel.id] = nil
    inDuel[duel.a] = nil
    inDuel[duel.b] = nil
    cooldown[duel.a] = now()
    cooldown[duel.b] = now()

    if not winner then
        for _, who in ipairs({ duel.a, duel.b }) do
            TriggerClientEvent('fbrp:pastimes:duel:result', who, { draw = true, reason = why })
        end
        return
    end

    local wl, ll = duel.license[winner], duel.license[loser]
    local wn, ln = duel.name[winner], duel.name[loser]
    local wr = scalar('SELECT duel_rating FROM pastime_profiles WHERE license=?', { wl })
    local lr = scalar('SELECT duel_rating FROM pastime_profiles WHERE license=?', { ll })
    if wr == 0 then wr = D.startRating end
    if lr == 0 then lr = D.startRating end
    local expected = 1.0 / (1.0 + 10.0 ^ ((lr - wr) / 400.0))
    local delta = math.max(1, math.floor(D.kFactor * (1.0 - expected) + 0.5))
    local newWinner, newLoser = wr + delta, math.max(100, lr - delta)
    local meters = math.floor(duel.meters)
    local elapsed = now() - (duel.startedAt or now())

    -- MariaDB evaluates SET assignments left to right, so the best streak sees the new streak.
    MySQL.update.await([[
        UPDATE pastime_profiles SET duels_won=duels_won+1,duel_streak=duel_streak+1,
          best_duel_streak=GREATEST(best_duel_streak,duel_streak),duel_rating=?,updated_at=? WHERE license=?
    ]], { newWinner, now(), wl })
    MySQL.update.await('UPDATE pastime_profiles SET duels_lost=duels_lost+1,duel_streak=0,duel_rating=?,updated_at=? WHERE license=?', { newLoser, now(), ll })
    MySQL.insert('INSERT INTO pastime_duels(winner_license,loser_license,winner_name,loser_name,meters,duration_ms,rating_delta,created_at) VALUES(?,?,?,?,?,?,?,?)', {
        wl, ll, wn, ln, meters, math.max(0, elapsed), delta, now()
    })
    PS.log(wl, 'duel', why, 1)

    local winRep = D.winRep + math.floor(meters / 1000.0 * D.perKmRep)
    local streak = scalar('SELECT duel_streak FROM pastime_profiles WHERE license=?', { wl })
    if sessions[winner] then
        PS.award(winner, winRep, 'duel')
        TriggerClientEvent('fbrp:pastimes:duel:result', winner, {
            won = true, opponent = ln, rep = winRep, rating = newWinner, delta = delta, meters = meters,
            seconds = math.floor(elapsed / 1000), reason = why, streak = streak,
        })
        PS.checkAchievements(winner, true)
    end
    if sessions[loser] then
        PS.award(loser, D.loseRep, 'duel')
        TriggerClientEvent('fbrp:pastimes:duel:result', loser, {
            won = false, opponent = wn, rep = D.loseRep, rating = newLoser, delta = -delta, meters = meters,
            seconds = math.floor(elapsed / 1000), reason = why,
        })
    end
    FBRP.DB.audit(wl, 'pastime.duel', ll, { meters = meters, delta = delta, reason = why })
    if streak >= 3 then
        S.broadcast('STREET DUELS', ('%s is on a %d duel win streak!'):format(wn, streak), { 255, 107, 87 })
    end
end

local function forfeit(duel, loser, why)
    resolve(duel, other(duel, loser), loser, why)
end

local function refuse(src, text)
    notify(src, text, 'error')
end

RegisterNetEvent('fbrp:pastimes:duel:challenge', function(rawTarget, rawX, rawY)
    local src = source
    local target = tonumber(rawTarget)
    local x, y = tonumber(rawX), tonumber(rawY)
    if not target or not x or not y or target == src then return end
    if not sessions[src] or not sessions[target] then return refuse(src, 'That player is not available.') end
    for _, who in ipairs({ src, target }) do
        local blocked = PS.blocked(who)
        if blocked then return refuse(src, who == src and blocked or 'That player cannot race right now.') end
        if inDuel[who] then return refuse(src, who == src and 'You are already in a duel.' or 'That player is already racing.') end
    end
    if cooldown[src] and now() - cooldown[src] < D.cooldownSeconds * 1000 then return refuse(src, 'Catch your breath before the next duel.') end
    if not driving(src) then return refuse(src, 'Sit in the driver seat of a car or bike first.') end
    if not driving(target) then return refuse(src, 'That player is not in the driver seat of a car or bike.') end
    local mine, theirs = GetEntityCoords(GetPlayerPed(src)), GetEntityCoords(GetPlayerPed(target))
    if flat(mine, theirs) > D.challengeRadius then return refuse(src, 'Pull up next to them first.') end
    local route = flat(mine, { x = x, y = y })
    if route < D.minRoute then return refuse(src, 'That finish is too close. Set a waypoint at least 400 metres away.') end
    if route > D.maxRoute then return refuse(src, 'That finish is too far. Keep it under 6.5 km.') end

    pending[target] = { from = src, x = x, y = y, meters = route, expires = now() + D.acceptSeconds * 1000 }
    notify(src, ('Challenge sent to %s.'):format(S.displayName(target)), 'success')
    TriggerClientEvent('fbrp:pastimes:duel:invite', target, {
        from = S.displayName(src), id = src, meters = math.floor(route), seconds = D.acceptSeconds,
    })
end)

local function accept(src)
    local invite = pending[src]
    pending[src] = nil
    if not invite or now() > invite.expires then return refuse(src, 'You have no duel challenge to accept.') end
    local from = invite.from
    if not sessions[from] or not sessions[src] then return refuse(src, 'The challenger left.') end
    if inDuel[from] or inDuel[src] then return refuse(src, 'Someone is already in a duel.') end
    if PS.blocked(from) or PS.blocked(src) then return refuse(src, 'The duel is off.') end
    if not driving(from) or not driving(src) then return refuse(src, 'Both drivers need to be in their vehicles.') end
    if flat(GetEntityCoords(GetPlayerPed(from)), GetEntityCoords(GetPlayerPed(src))) > D.challengeRadius + 25.0 then
        return refuse(src, 'You are too far from the challenger.')
    end

    local id = nextId
    nextId = nextId + 1
    PS.ensure(from)
    PS.ensure(src)
    local duel = {
        id = id, a = from, b = src, x = invite.x, y = invite.y, meters = invite.meters,
        state = 'countdown', last = {}, outSince = {}, license = {}, name = {},
    }
    for _, who in ipairs({ from, src }) do
        duel.license[who] = sessions[who].license
        duel.name[who] = S.displayName(who)
        inDuel[who] = id
    end
    duels[id] = duel
    for _, who in ipairs({ from, src }) do
        TriggerClientEvent('fbrp:pastimes:duel:countdown', who, {
            x = duel.x, y = duel.y, seconds = D.countdownSeconds, opponent = duel.name[other(duel, who)],
            meters = math.floor(duel.meters), radius = D.finishRadius,
        })
    end
    SetTimeout(D.countdownSeconds * 1000, function()
        local live = duels[id]
        if not live or live.done then return end
        live.state = 'running'
        live.startedAt = now()
        for _, who in ipairs({ live.a, live.b }) do TriggerClientEvent('fbrp:pastimes:duel:go', who) end
    end)
end

local function decline(src)
    local invite = pending[src]
    pending[src] = nil
    if invite and sessions[invite.from] then notify(invite.from, ('%s declined your duel.'):format(S.displayName(src)), 'info') end
end

RegisterNetEvent('fbrp:pastimes:duel:accept', function() accept(source) end)
RegisterNetEvent('fbrp:pastimes:duel:decline', function() decline(source) end)

RegisterNetEvent('fbrp:pastimes:duel:forfeit', function()
    local src = source
    local duel = duels[inDuel[src] or 0]
    if duel then forfeit(duel, src, 'forfeit') end
end)

CreateThread(function()
    while true do
        Wait(400)
        local list = {}
        for _, duel in pairs(duels) do list[#list + 1] = duel end
        for _, duel in ipairs(list) do
            if not duel.done and duel.state == 'running' then
                local t = now()
                if t - duel.startedAt > D.maxSeconds * 1000 then
                    resolve(duel, nil, nil, 'timeout')
                else
                    for _, who in ipairs({ duel.a, duel.b }) do
                        if duel.done then break end
                        local ped = GetPlayerPed(who)
                        if GetPlayerPing(who) <= 0 or ped <= 0 then
                            forfeit(duel, who, 'left')
                        elseif (Player(who) and Player(who).state['fbrp:downed']) then
                            forfeit(duel, who, 'downed')
                        else
                            local coords = GetEntityCoords(ped)
                            local last = duel.last[who]
                            duel.last[who] = coords
                            if last and #(coords - last) > D.teleportMeters then
                                forfeit(duel, who, 'teleport')
                            elseif flat(coords, duel) <= D.finishRadius then
                                resolve(duel, who, other(duel, who), 'finish')
                            else
                                if GetVehiclePedIsIn(ped, false) == 0 then
                                    duel.outSince[who] = duel.outSince[who] or t
                                    if t - duel.outSince[who] > D.onFootGraceSeconds * 1000 then forfeit(duel, who, 'abandoned') end
                                else
                                    duel.outSince[who] = nil
                                end
                            end
                        end
                    end
                end
            end
        end
        for target, invite in pairs(pending) do
            if now() > invite.expires then pending[target] = nil end
        end
    end
end)

AddEventHandler('playerDropped', function()
    local src = source
    pending[src] = nil
    cooldown[src] = nil
    for target, invite in pairs(pending) do
        if invite.from == src then pending[target] = nil end
    end
    local duel = duels[inDuel[src] or 0]
    if duel then forfeit(duel, src, 'left') end
end)

RegisterCommand('duelaccept', function(source) if source > 0 then accept(source) end end, false)
RegisterCommand('dueldecline', function(source) if source > 0 then decline(source) end end, false)
RegisterCommand('forfeit', function(source)
    local duel = source > 0 and duels[inDuel[source] or 0] or nil
    if duel then forfeit(duel, source, 'forfeit') end
end, false)

PS.sections.duels = function(src)
    local s = sessions[src]
    local row = MySQL.single.await('SELECT duels_won,duels_lost,duel_streak,best_duel_streak,duel_rating FROM pastime_profiles WHERE license=?', { s.license }) or {}
    local leaders = {}
    for _, r in ipairs(MySQL.query.await([[
        SELECT name,duel_rating,duels_won,duels_lost,title FROM pastime_profiles
        WHERE duels_won+duels_lost>0 ORDER BY duel_rating DESC,duels_won DESC LIMIT 5
    ]])) do
        leaders[#leaders + 1] = {
            name = r.name, rating = tonumber(r.duel_rating) or 0, won = tonumber(r.duels_won) or 0,
            lost = tonumber(r.duels_lost) or 0, title = r.title,
        }
    end
    local nearby = {}
    local ped = GetPlayerPed(src)
    if ped > 0 and driving(src) then
        local here = GetEntityCoords(ped)
        for other, _ in pairs(sessions) do
            if other ~= src and not inDuel[other] and driving(other) then
                local op = GetPlayerPed(other)
                if op > 0 and flat(here, GetEntityCoords(op)) <= D.challengeRadius then
                    nearby[#nearby + 1] = { id = other, name = S.displayName(other) }
                end
            end
        end
    end
    local invite = pending[src]
    return {
        rating = tonumber(row.duel_rating) or D.startRating,
        won = tonumber(row.duels_won) or 0, lost = tonumber(row.duels_lost) or 0,
        streak = tonumber(row.duel_streak) or 0, best = tonumber(row.best_duel_streak) or 0,
        leaders = leaders, nearby = nearby, driving = driving(src), inDuel = inDuel[src] ~= nil,
        invite = invite and now() <= invite.expires and { from = S.displayName(invite.from), meters = math.floor(invite.meters) } or nil,
        minRoute = D.minRoute, maxRoute = D.maxRoute,
    }
end
