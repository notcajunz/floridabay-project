-- Civilian life: fishing around Florida Bay with species, personal bests and
-- server records. Emotes, hands-up and pointing are purely client side.

local S = FBRP.Server
local F = FBRP.Fishing
local P = FBRP.Passport
local sessions = S.sessions
local now, notify, chat = S.now, S.notify, S.chat

local casts = {}   -- source -> cast started (ms)
local RARITY_RANK = { junk=0, common=1, uncommon=2, rare=3, epic=4, legendary=5 }

local function dayKey()
    return os.date('!%Y-%m-%d')
end

local function featuredLandmark()
    local day = math.floor(os.time() / 86400)
    return P.landmarks[(day % #P.landmarks) + 1]
end

local function passportRank(points)
    local current, nextRank = P.ranks[1], nil
    for _, rank in ipairs(P.ranks) do
        if points >= rank.points then current = rank else nextRank = rank; break end
    end
    return current, nextRank
end

local function awardPassportPoints(license, amount)
    MySQL.prepare.await([[
        INSERT INTO passport_profiles(license,points,discoveries,daily_completed,updated_at) VALUES(?,?,0,0,?)
        ON DUPLICATE KEY UPDATE points=points+VALUES(points),updated_at=VALUES(updated_at)
    ]], { license, amount, now() })
end

local function progressDaily(src, goalId, amount)
    local s = sessions[src]
    if not s then return end
    local spec
    for _, goal in ipairs(P.dailyGoals) do if goal.id == goalId then spec = goal; break end end
    if not spec then return end
    local key = dayKey()
    local row = MySQL.single.await('SELECT progress,completed_at FROM passport_daily_progress WHERE license=? AND day_key=? AND goal_id=?', { s.license, key, goalId })
    local progress = math.min(spec.target, (tonumber(row and row.progress) or 0) + (tonumber(amount) or 1))
    local completedNow = progress >= spec.target and not (row and row.completed_at)
    MySQL.prepare.await([[
        INSERT INTO passport_daily_progress(license,day_key,goal_id,progress,completed_at) VALUES(?,?,?,?,?)
        ON DUPLICATE KEY UPDATE progress=VALUES(progress),completed_at=COALESCE(completed_at,VALUES(completed_at))
    ]], { s.license, key, goalId, progress, completedNow and now() or nil })
    if completedNow then
        awardPassportPoints(s.license, spec.reward)
        MySQL.update.await('UPDATE passport_profiles SET daily_completed=daily_completed+1,updated_at=? WHERE license=?', { now(), s.license })
        notify(src, ('Daily complete: %s · +%d passport points'):format(spec.label, spec.reward), 'success')
    end
end

local function passportPayload(src)
    local s = sessions[src]
    if not s then return nil end
    local profile = MySQL.single.await('SELECT points,discoveries,daily_completed FROM passport_profiles WHERE license=?', { s.license }) or {}
    local points = tonumber(profile.points) or 0
    local rank, nextRank = passportRank(points)
    local stampRows = MySQL.query.await('SELECT landmark_id,discovered_at FROM passport_discoveries WHERE license=?', { s.license })
    local stamps = {}
    for _, row in ipairs(stampRows) do stamps[row.landmark_id] = tonumber(row.discovered_at) end
    local dailyRows = MySQL.query.await('SELECT goal_id,progress,completed_at FROM passport_daily_progress WHERE license=? AND day_key=?', { s.license, dayKey() })
    local daily = {}
    for _, row in ipairs(dailyRows) do daily[row.goal_id] = { progress=tonumber(row.progress) or 0, completed=row.completed_at ~= nil } end
    local landmarks = {}
    local featured = featuredLandmark()
    for _, landmark in ipairs(P.landmarks) do
        landmarks[#landmarks + 1] = {
            id=landmark.id,label=landmark.label,region=landmark.region,lore=landmark.lore,
            x=landmark.x,y=landmark.y,z=landmark.z,discoveredAt=stamps[landmark.id],featured=landmark.id == featured.id,
        }
    end
    local goals = {}
    for _, goal in ipairs(P.dailyGoals) do
        local state = daily[goal.id] or { progress=0, completed=false }
        goals[#goals + 1] = { id=goal.id,label=goal.label,description=goal.description,target=goal.target,reward=goal.reward,icon=goal.icon,progress=state.progress,completed=state.completed }
    end
    return {
        points=points,discoveries=tonumber(profile.discoveries) or #stampRows,total=#P.landmarks,
        dailyCompleted=tonumber(profile.daily_completed) or 0,rank=rank.label,nextRank=nextRank,
        featured={ id=featured.id,label=featured.label,bonus=P.featuredBonus },landmarks=landmarks,goals=goals,
    }
end

FBRP.PassportProgress = progressDaily

RegisterNetEvent('fbrp:passport:discover', function(rawId)
    local src = source
    local s = sessions[src]
    local landmark = FBRP.FindLandmark(tostring(rawId or ''))
    if not s or not landmark then return end
    local ped = GetPlayerPed(src)
    if ped <= 0 then return end
    local coords = GetEntityCoords(ped)
    local distance = #(coords - vector3(landmark.x, landmark.y, landmark.z))
    if distance > P.discoveryRadius + 12.0 then return end
    local inserted = MySQL.update.await('INSERT IGNORE INTO passport_discoveries(license,landmark_id,character_id,discovered_at) VALUES(?,?,?,?)', {
        s.license, landmark.id, tonumber(Player(src).state['fbrp:characterId']), now()
    })
    if tonumber(inserted) ~= 1 then return end
    local featured = featuredLandmark().id == landmark.id
    local points = P.discoveryPoints + (featured and P.featuredBonus or 0)
    awardPassportPoints(s.license, points)
    MySQL.update.await('UPDATE passport_profiles SET discoveries=discoveries+1,updated_at=? WHERE license=?', { now(), s.license })
    progressDaily(src, 'tour', 1)
    FBRP.DB.audit(s.discord or s.license, 'passport.discover', landmark.id, { points=points,featured=featured })
    TriggerClientEvent('fbrp:passport:discovered', src, { label=landmark.label,region=landmark.region,lore=landmark.lore,points=points,featured=featured })
end)

local function openPassport(src)
    local payload = passportPayload(src)
    if payload then TriggerClientEvent('fbrp:passport:open', src, payload) end
end

RegisterNetEvent('fbrp:passport:request', function() openPassport(source) end)

RegisterCommand('passport', function(source)
    if source > 0 then openPassport(source) end
end, false)

local function rollSpecies(water)
    local pool, total = {}, 0
    for _, species in ipairs(F.species) do
        if species.water == 'any' or species.water == water then
            local tier = F.rarity[species.rarity]
            -- Split each tier's weight across the species that share it.
            local siblings = 0
            for _, other in ipairs(F.species) do
                if other.rarity == species.rarity and (other.water == 'any' or other.water == water) then siblings = siblings + 1 end
            end
            local weight = tier.weight / math.max(1, siblings)
            pool[#pool + 1] = { species=species, weight=weight }
            total = total + weight
        end
    end
    local roll = math.random() * total
    for _, entry in ipairs(pool) do
        roll = roll - entry.weight
        if roll <= 0 then return entry.species end
    end
    return pool[#pool].species
end

RegisterNetEvent('fbrp:fishing:cast', function()
    local src = source
    if not sessions[src] then return end
    casts[src] = now()
end)

RegisterNetEvent('fbrp:fishing:cancel', function()
    local src = source
    casts[src] = nil
end)

RegisterNetEvent('fbrp:fishing:hooked', function(success)
    local src = source
    local started = casts[src]
    casts[src] = nil
    local s = sessions[src]
    if not s or not started or now() - started < F.castMinimumMs then return end
    if success ~= true then return TriggerClientEvent('fbrp:fishing:result', src, { escaped=true }) end
    local ped = GetPlayerPed(src)
    local coords = ped > 0 and GetEntityCoords(ped) or vector3(0.0, 0.0, 0.0)
    local water = FBRP.IsFreshwater(coords.x, coords.y) and 'fresh' or 'salt'
    local species = rollSpecies(water)
    -- Most fish sit near the small end of their range; trophies are rare.
    local weight = species.min + (species.max - species.min) * (math.random() ^ 2.2)
    weight = math.floor(weight * 100 + 0.5) / 100
    local player = Player(src)
    local characterId = player and tonumber(player.state['fbrp:characterId']) or nil
    local name = S.displayName(src)
    local best = tonumber(MySQL.scalar.await('SELECT MAX(weight) FROM fishing_catches WHERE license=? AND species=?', { s.license, species.name })) or 0
    local record = tonumber(MySQL.scalar.await('SELECT MAX(weight) FROM fishing_catches WHERE species=?', { species.name })) or 0
    MySQL.insert.await('INSERT INTO fishing_catches(character_id,license,name,species,weight,water,rarity,x,y,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)', {
        characterId, s.license, name, species.name, weight, water, species.rarity, coords.x, coords.y, now()
    })
    progressDaily(src, 'angler', 1)
    if RARITY_RANK[species.rarity] >= RARITY_RANK.uncommon then progressDaily(src, 'rare', 1) end
    local isRecord = species.rarity ~= 'junk' and weight > record
    local result = {
        species=species.name, weight=weight, rarity=species.rarity, color=F.rarity[species.rarity].color, water=water,
        personalBest=species.rarity ~= 'junk' and weight > best, serverRecord=isRecord, previousRecord=record,
    }
    TriggerClientEvent('fbrp:fishing:result', src, result)
    if isRecord and RARITY_RANK[species.rarity] >= RARITY_RANK.uncommon then
        S.broadcast('FISHING', ('%s just landed a record %.1f lb %s!'):format(name, weight, species.name), { 79, 224, 140 })
    elseif RARITY_RANK[species.rarity] >= RARITY_RANK.epic then
        S.broadcast('FISHING', ('%s hooked a %s %s (%.1f lb)!'):format(name, species.rarity, species.name, weight), { 196, 139, 255 })
    end
end)

AddEventHandler('playerDropped', function() casts[source] = nil end)

RegisterCommand('fishlog', function(source)
    if source <= 0 then return end
    local s = sessions[source]
    if not s then return end
    local total = tonumber(MySQL.scalar.await('SELECT COUNT(*) FROM fishing_catches WHERE license=? AND rarity<>\'junk\'', { s.license })) or 0
    local bests = MySQL.query.await([[
        SELECT species,MAX(weight) weight FROM fishing_catches WHERE license=? AND rarity<>'junk'
        GROUP BY species ORDER BY MAX(weight) DESC LIMIT 6
    ]], { s.license })
    local parts = {}
    for _, row in ipairs(bests) do parts[#parts + 1] = ('%s %.1f lb'):format(row.species, tonumber(row.weight) or 0) end
    chat(source, 'FISHING', total > 0 and ('%d fish caught. Best: %s'):format(total, table.concat(parts, ' · ')) or 'No catches yet. Face open water and use /fish.', { 79, 224, 140 })
end, false)

RegisterCommand('fishtop', function(source)
    local rows = MySQL.query.await([[
        SELECT c.species,MAX(c.weight) weight,MIN(c.name) name FROM fishing_catches c
        JOIN (SELECT species,MAX(weight) weight FROM fishing_catches WHERE rarity<>'junk' GROUP BY species) best
          ON best.species=c.species AND best.weight=c.weight
        GROUP BY c.species ORDER BY MAX(c.weight) DESC LIMIT 8
    ]])
    local parts = {}
    for _, row in ipairs(rows) do parts[#parts + 1] = ('%s %.1f lb (%s)'):format(row.species, tonumber(row.weight) or 0, row.name) end
    if source <= 0 then return print('Fishing records: ' .. table.concat(parts, ' | ')) end
    chat(source, 'RECORDS', #parts > 0 and table.concat(parts, ' · ') or 'No records yet. Be the first!', { 255, 181, 71 })
end, false)
