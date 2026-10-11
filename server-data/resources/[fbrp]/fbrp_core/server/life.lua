-- Civilian life: fishing around Florida Bay with species, personal bests and
-- server records. Emotes, hands-up and pointing are purely client side.

local S = FBRP.Server
local F = FBRP.Fishing
local sessions = S.sessions
local now, notify, chat = S.now, S.notify, S.chat

local casts = {}   -- source -> cast started (ms)
local RARITY_RANK = { junk=0, common=1, uncommon=2, rare=3, epic=4, legendary=5 }

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
