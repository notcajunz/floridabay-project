-- Organization economy: gangs produce and deliver product, businesses work the
-- properties (MLOs) they own. Every payout goes to the organization wallet in
-- MariaDB, which only exists on the website and the Discord bot - there is no
-- in-game cash. Purchases made on the website (properties, vehicles, armory
-- permits, outfits, perks) are loaded here and applied to members on duty.

local S = FBRP.Server
local E = FBRP.Economy
local sessions = S.sessions
local now, clean, notify, chat, hasPermission = S.now, S.clean, S.notify, S.chat, S.hasPermission

local catalog = {}       -- item_key -> shop row (data decoded)
local owned = {}         -- org id -> { items, properties, vehicles, weapons, outfits, perks }
local carry = {}         -- source -> { drug, units, org }
local producing = {}     -- source -> { lab, started, ms }
local runs = {}          -- source -> { drop, started, deadline, from, org }
local tasks = {}         -- source -> { key, started, ms }
local lastProduce, lastTask, lastService, armoryUsed = {}, {}, {}, {}
local hourly = {}        -- org id -> { hour, earned }
local orgInfo = {}       -- org id -> { slug, color, motd }
local access = {}        -- source -> { orgId, leader, rank, level, armory, garage }
local stipend = {}       -- org id -> { amount, minutes }
local D = E.departments or { stipendPerHour={}, stations={}, seizureBounty=0, stipendFlushMinutes=10, armoryRadius=35.0 }

local GREEN, AMBER, PURPLE = { 79, 224, 140 }, { 255, 181, 71 }, { 196, 139, 255 }

local function decode(value)
    if type(value) ~= 'string' then return value or {} end
    local ok, out = pcall(json.decode, value)
    return ok and out or {}
end

local function pedCoords(source)
    local ped = GetPlayerPed(source)
    return ped > 0 and GetEntityCoords(ped) or nil
end

local function near(coords, point, radius)
    if not coords or not point then return false end
    local dx, dy = coords.x - point.x, coords.y - point.y
    return math.sqrt(dx * dx + dy * dy) <= radius and math.abs(coords.z - point.z) < 15.0
end

local function money(value)
    local text = tostring(math.floor(value or 0))
    local out = text:reverse():gsub('(%d%d%d)', '%1,'):reverse()
    return '$' .. out:gsub('^,', '')
end

local function characterOf(source)
    local player = Player(source)
    if not player then return nil, nil end
    return tonumber(player.state['fbrp:characterId']), player.state['fbrp:characterName']
end

local function ownerKey(source)
    local characterId = characterOf(source)
    if characterId then return 'c:' .. characterId end
    local s = sessions[source]
    return s and ('l:' .. s.license) or nil
end

local function orgOf(source)
    local s = sessions[source]
    return s and s.org or nil
end

local function isGang(org)
    return org and org.type == 'gang'
end

local function isDepartment(org)
    return org and D.stipendPerHour[org.type] ~= nil
end

local function flag(value, default)
    if value == nil then return default end
    return value == 1 or value == true
end

-- What the on-duty member may do inside their organization: leaders can do everything,
-- ranked members follow their rank, everyone else keeps the default member access.
local function accessOf(source)
    local org = orgOf(source)
    if not org then return nil end
    local cached = access[source]
    if cached and cached.orgId == org.id then return cached end
    local s = sessions[source]
    local row = s and s.discord and MySQL.single.await([[
        SELECT m.manager,r.name rank_label,r.level,r.can_armory,r.can_garage
          FROM organization_members m LEFT JOIN org_ranks r ON r.id=m.rank_id AND r.org_id=m.org_id
         WHERE m.org_id=? AND m.discord_id=?
    ]], { org.id, s.discord }) or nil
    local leader = row ~= nil and flag(row.manager, false)
    cached = {
        orgId=org.id, leader=leader,
        rank=leader and 'Leader' or (row and row.rank_label) or 'Member',
        level=leader and 100 or tonumber(row and row.level) or 0,
        armory=leader or flag(row and row.can_armory, true),
        garage=leader or flag(row and row.can_garage, true),
    }
    access[source] = cached
    return cached
end

-- ─────────────────────────── catalog & ownership ───────────────────────────

local function perksOf(orgId)
    return owned[orgId] and owned[orgId].perks or {}
end

local function loadCatalog()
    local rows = MySQL.query.await('SELECT item_key,kind,label,description,price,org_types,data,enabled FROM org_shop_items')
    local nextCatalog = {}
    for _, row in ipairs(rows) do
        row.data = decode(row.data)
        nextCatalog[row.item_key] = row
    end
    local nextOwned = {}
    local function bucket(orgId)
        orgId = tonumber(orgId)
        nextOwned[orgId] = nextOwned[orgId] or { items={}, properties={}, vehicles={}, weapons={}, outfits={}, perks={} }
        return nextOwned[orgId]
    end
    for _, row in ipairs(MySQL.query.await('SELECT org_id,item_key FROM org_purchases')) do
        local item = nextCatalog[row.item_key]
        local b = bucket(row.org_id)
        b.items[row.item_key] = true
        if item then
            if item.kind == 'vehicle' and item.data.model then
                b.vehicles[#b.vehicles + 1] = { model=tostring(item.data.model), label=item.label }
            elseif item.kind == 'weapon' then
                b.weapons[#b.weapons + 1] = { key=item.item_key, label=item.label, weapons=item.data.weapons or {} }
            elseif item.kind == 'outfit' then
                b.outfits[#b.outfits + 1] = { key=item.item_key, label=item.label, data=item.data }
            elseif item.kind == 'perk' and item.data.perk then
                b.perks[item.data.perk] = (b.perks[item.data.perk] or 0) + (tonumber(item.data.value) or 0)
            end
        end
    end
    local pointRows = {}
    for _, row in ipairs(MySQL.query.await('SELECT property_key,point,x,y,z FROM property_points') or {}) do
        pointRows[row.property_key] = pointRows[row.property_key] or {}
        pointRows[row.property_key][row.point] = { x=tonumber(row.x), y=tonumber(row.y), z=tonumber(row.z) }
    end
    for _, row in ipairs(MySQL.query.await('SELECT item_key,org_id FROM org_properties')) do
        local item = nextCatalog[row.item_key]
        if item and item.data and tonumber(item.data.x) then
            local d = item.data
            local b = bucket(row.org_id)
            b.properties[#b.properties + 1] = {
                key=item.item_key, label=item.label, business=d.business or 'warehouse', drug=d.drug, area=d.area,
                x=tonumber(d.x), y=tonumber(d.y), z=tonumber(d.z) or 30.0, radius=tonumber(d.radius) or 35.0,
                points=pointRows[item.item_key] or {},
            }
        end
    end
    local nextInfo = {}
    for _, row in ipairs(MySQL.query.await('SELECT id,slug,color,motd FROM organizations WHERE active=TRUE')) do
        nextInfo[tonumber(row.id)] = { slug=row.slug, color=row.color, motd=row.motd }
    end
    catalog = nextCatalog
    owned = nextOwned
    orgInfo = nextInfo
    access = {}
end

local function propertyByKey(orgId, key)
    for _, property in ipairs(owned[orgId] and owned[orgId].properties or {}) do
        if property.key == key then return property end
    end
end

-- Spots staff placed at a property (terminal, stash, armory, wardrobe). With none placed the
-- whole property radius counts, as before; once any exist only those spots count.
local function atPropertySpot(coords, property, radius)
    local any = false
    for _, kind in ipairs({ 'terminal', 'stash', 'armory', 'wardrobe' }) do
        local point = property.points and property.points[kind]
        if point then
            any = true
            if near(coords, point, radius or 10.0) then return true end
        end
    end
    if any then return false end
    return near(coords, property, property.radius)
end

-- Where the work shift happens: the stash at a hideout, else the terminal, else the property itself.
local function workPoint(property)
    local points = property.points or {}
    return (property.business == 'hideout' and points.stash) or points.terminal or points.stash or property
end

local function nearOwnedProperty(source, orgId, radius)
    local coords = pedCoords(source)
    for _, property in ipairs(owned[orgId] and owned[orgId].properties or {}) do
        if atPropertySpot(coords, property, radius) then return property end
    end
end

local function nearStation(source, org)
    if not org then return nil end
    local coords = pedCoords(source)
    for _, station in ipairs(D.stations or {}) do
        if station.types[org.type] and near(coords, station, D.armoryRadius or 35.0) then return station end
    end
end

local function atArmory(source, org)
    return nearOwnedProperty(source, org.id) ~= nil or nearStation(source, org) ~= nil
end

-- ─────────────────────────── wallets ───────────────────────────

local function credit(orgId, amount, kind, description, actor, ref)
    amount = math.floor(amount or 0)
    if amount <= 0 or not orgId then return 0 end
    local stamp = now()
    MySQL.prepare.await([[
        INSERT INTO org_wallets(org_id,balance,lifetime_earned,lifetime_spent,updated_at) VALUES(?,?,?,0,?)
        ON DUPLICATE KEY UPDATE balance=balance+VALUES(balance),lifetime_earned=lifetime_earned+VALUES(lifetime_earned),updated_at=VALUES(updated_at)
    ]], { orgId, amount, amount, stamp })
    local balance = tonumber(MySQL.scalar.await('SELECT balance FROM org_wallets WHERE org_id=?', { orgId })) or amount
    MySQL.insert('INSERT INTO org_transactions(org_id,amount,balance_after,kind,description,actor_id,ref,created_at) VALUES(?,?,?,?,?,?,?,?)', {
        orgId, amount, balance, kind, clean(description, 200), actor and tostring(actor) or nil, ref, stamp
    })
    return amount, balance
end

local function walletOf(orgId)
    return tonumber(MySQL.scalar.await('SELECT balance FROM org_wallets WHERE org_id=?', { orgId })) or 0
end

local function businessCapacity(orgId)
    local hour = math.floor(os.time() / 3600)
    local entry = hourly[orgId]
    if not entry or entry.hour ~= hour then
        entry = { hour=hour, earned=0 }
        hourly[orgId] = entry
    end
    local cap = math.floor(E.business.hourlyCap * (1 + (perksOf(orgId).cap or 0) / 100))
    return entry, cap
end

-- Business income respects the hourly cap; returns what was actually paid.
local function payBusiness(orgId, amount, kind, description, actor, ref)
    local entry, cap = businessCapacity(orgId)
    local pay = math.min(math.floor(amount), cap - entry.earned)
    if pay <= 0 then return 0 end
    entry.earned = entry.earned + pay
    credit(orgId, pay, kind, description, actor, ref)
    return pay
end

-- ─────────────────────────── contraband ───────────────────────────

local function capacityOf(source)
    local org = orgOf(source)
    return E.baseCapacity + (org and (perksOf(org.id).capacity or 0) or 0)
end

local function saveCarry(source)
    local key = ownerKey(source)
    if not key then return end
    local c = carry[source]
    if c and c.units > 0 then
        MySQL.prepare('INSERT INTO player_contraband(owner_key,org_id,drug,units,updated_at) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE org_id=VALUES(org_id),drug=VALUES(drug),units=VALUES(units),updated_at=VALUES(updated_at)', {
            key, c.org, c.drug, c.units, now()
        })
    else
        MySQL.update('DELETE FROM player_contraband WHERE owner_key=?', { key })
    end
end

local function loadCarry(source)
    local key = ownerKey(source)
    if not key then return end
    local row = MySQL.single.await('SELECT org_id,drug,units FROM player_contraband WHERE owner_key=?', { key })
    carry[source] = row and E.drugs[row.drug] and { drug=row.drug, units=tonumber(row.units) or 0, org=tonumber(row.org_id) } or nil
end

local function logRun(source, status, extra)
    local c = carry[source]
    if not c then return end
    local s = sessions[source]
    local characterId, name = characterOf(source)
    MySQL.insert('INSERT INTO org_drug_runs(org_id,discord_id,character_id,name,drug,units,payout,status,seized_by,seized_org_id,location,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', {
        c.org, s and s.discord or nil, characterId, name or GetPlayerName(source) or 'Unknown', c.drug, c.units,
        extra.payout or 0, status, extra.by, extra.seizedOrg, extra.location, now()
    })
end

-- ─────────────────────────── client state ───────────────────────────

local function labsFor(org)
    local list = {}
    if not isGang(org) then return list end
    for _, lab in ipairs(E.labs) do
        list[#list + 1] = { id=lab.id, label=lab.label, drug=lab.drug, x=lab.x, y=lab.y, z=lab.z, radius=lab.radius, owned=false }
    end
    for _, property in ipairs(owned[org.id] and owned[org.id].properties or {}) do
        if property.business == 'lab' and property.drug and E.drugs[property.drug] then
            list[#list + 1] = { id='prop:' .. property.key, label=property.label, drug=property.drug, x=property.x, y=property.y, z=property.z, radius=12.0, owned=true }
        end
    end
    return list
end

local function findLab(org, id)
    for _, lab in ipairs(labsFor(org)) do
        if lab.id == id then return lab end
    end
end

local function runInfo(source)
    local run = runs[source]
    if not run then return nil end
    return { label=run.drop.label, x=run.drop.x, y=run.drop.y, z=run.drop.z, deadline=run.deadline, secondsLeft=math.max(0, math.floor((run.deadline - now()) / 1000)) }
end

local function stateFor(source)
    local org = orgOf(source)
    local state = { carry=carry[source], run=runInfo(source), capacity=capacityOf(source), drugs=E.drugs }
    if org then
        state.org = { id=org.id, name=org.name, type=org.type }
        state.labs = labsFor(org)
        state.properties = {}
        for _, property in ipairs(owned[org.id] and owned[org.id].properties or {}) do
            local spec = E.business.types[property.business] or {}
            state.properties[#state.properties + 1] = {
                key=property.key, label=property.label, business=property.business, businessLabel=spec.label or property.business,
                task=spec.task, service=spec.service, x=property.x, y=property.y, z=property.z, points=property.points,
            }
        end
    end
    return state
end

local function pushState(source)
    if sessions[source] then TriggerClientEvent('fbrp:economy:state', source, stateFor(source)) end
end

local function hubPayload(source)
    local org = orgOf(source)
    local payload = stateFor(source)
    payload.onDuty = org ~= nil
    if not org then return payload end
    local b = owned[org.id] or { vehicles={}, weapons={}, outfits={}, perks={}, properties={} }
    payload.wallet = walletOf(org.id)
    payload.today = tonumber(MySQL.scalar.await('SELECT COALESCE(SUM(amount),0) FROM org_transactions WHERE org_id=? AND amount>0 AND created_at>=?', { org.id, (os.time() - os.time() % 86400) * 1000 })) or 0
    payload.vehicles = b.vehicles
    payload.outfits = {}
    for _, outfit in ipairs(b.outfits) do payload.outfits[#payload.outfits + 1] = { key=outfit.key, label=outfit.label } end
    payload.armory = {}
    for _, package in ipairs(b.weapons) do
        local key = (sessions[source].discord or source) .. ':' .. package.key
        local ready = math.max(0, math.ceil(((armoryUsed[key] or 0) + E.armoryCooldownSeconds * 1000 - now()) / 1000))
        local names = {}
        for _, weapon in ipairs(package.weapons) do names[#names + 1] = tostring(weapon.name):gsub('^WEAPON_', ''):lower() end
        payload.armory[#payload.armory + 1] = { key=package.key, label=package.label, weapons=names, cooldown=ready }
    end
    local me = accessOf(source)
    payload.atProperty = nearOwnedProperty(source, org.id) ~= nil
    payload.atArmory = atArmory(source, org)
    payload.station = nearStation(source, org) and nearStation(source, org).label or nil
    payload.rank = me and me.rank or 'Member'
    payload.leader = me and me.leader or false
    payload.can = { armory=me and me.armory or false, garage=me and me.garage or false }
    payload.motd = orgInfo[org.id] and orgInfo[org.id].motd or nil
    payload.isDepartment = isDepartment(org)
    if payload.isDepartment then
        local rate = math.floor((D.stipendPerHour[org.type] or 0) * (1 + (perksOf(org.id).stipend or 0) / 100))
        payload.department = { stipendPerHour=rate, bounty=math.floor((D.seizureBounty or 0) * (1 + (perksOf(org.id).bounty or 0) / 100)), stations={} }
        for _, station in ipairs(D.stations or {}) do
            if station.types[org.type] then payload.department.stations[#payload.department.stations + 1] = { label=station.label, x=station.x, y=station.y, z=station.z } end
        end
    end
    payload.crew = {}
    for src, other in pairs(sessions) do
        if other.org and other.org.id == org.id then
            local them = accessOf(src)
            payload.crew[#payload.crew + 1] = { id=src, name=S.displayName(src), rank=them and them.rank or 'Member', level=them and them.level or 0, me=src == source }
        end
    end
    table.sort(payload.crew, function(a, b) if a.level ~= b.level then return a.level > b.level end return a.name < b.name end)
    payload.perks = {}
    for perk, value in pairs(b.perks) do payload.perks[#payload.perks + 1] = { perk=perk, value=value } end
    local entry, cap = businessCapacity(org.id)
    payload.businessHour = { earned=entry.earned, cap=cap }
    payload.isGang = isGang(org)
    payload.website = GetConvar('fbrp_publicUrl', '')
    return payload
end

AddEventHandler('fbrp:organizationDutyChanged', function(source, orgId)
    source = tonumber(source)
    access[source] = nil
    local info = orgId and orgInfo[tonumber(orgId)]
    if info and info.motd and info.motd ~= '' then
        local org = orgOf(source)
        chat(source, (org and org.name or 'ORGANIZATION'):upper() .. ' · MOTD', info.motd, PURPLE)
    end
    if not orgId and runs[source] then
        runs[source] = nil
        notify(source, 'You went off duty - the delivery was called off. You still have the product.', 'warning')
    end
    producing[source] = nil
    tasks[source] = nil
    pushState(source)
end)

RegisterNetEvent('fbrp:economy:spawned', function()
    local src = source
    SetTimeout(2500, function()
        if not sessions[src] then return end
        loadCarry(src)
        pushState(src)
    end)
end)

RegisterNetEvent('fbrp:economy:hub', function()
    local src = source
    if not sessions[src] then return end
    TriggerClientEvent('fbrp:economy:hub', src, hubPayload(src))
end)

local function reload()
    loadCatalog()
    for src in pairs(sessions) do
        if orgOf(src) then pushState(src) end
    end
end

AddEventHandler('fbrp:economy:reload', reload)

CreateThread(function()
    while not S.isReady() do Wait(500) end
    Wait(2000)
    reload()
    while true do
        Wait(120000)
        reload()
    end
end)

AddEventHandler('playerDropped', function()
    local src = source
    carry[src], producing[src], runs[src], tasks[src], access[src] = nil, nil, nil, nil, nil
    lastProduce[src], lastTask[src], lastService[src] = nil, nil, nil
end)

-- ─────────────────────────── production ───────────────────────────

RegisterNetEvent('fbrp:economy:produceStart', function(labId)
    local src = source
    local org = orgOf(src)
    if not isGang(org) then return notify(src, 'Clock into your gang with /duty to work a lab.', 'error') end
    local lab = findLab(org, clean(labId, 60))
    if not lab then return end
    if not near(pedCoords(src), lab, lab.radius + 4.0) then return notify(src, 'You are too far from the lab.', 'error') end
    if FBRP.Justice.IsJailed(src) or (FBRP.Justice.IsServing and FBRP.Justice.IsServing(src)) then return end
    if (lastProduce[src] or 0) + E.produceCooldownSeconds * 1000 > now() then return notify(src, 'Give the equipment a moment.', 'info') end
    local c = carry[src]
    if c and c.units > 0 and c.drug ~= lab.drug then return notify(src, ('You are already carrying %s. Deliver it first.'):format(E.drugs[c.drug].label:lower()), 'error') end
    if c and c.units >= capacityOf(src) then return notify(src, ('You cannot carry any more (%d units). Start a delivery from F2.'):format(capacityOf(src)), 'error') end
    local ms = E.produceMs[lab.drug] or 12000
    producing[src] = { lab=lab, started=now(), ms=ms }
    TriggerClientEvent('fbrp:economy:produceApproved', src, lab.id, ms, lab.drug)
end)

RegisterNetEvent('fbrp:economy:produceCancel', function()
    producing[source] = nil
end)

RegisterNetEvent('fbrp:economy:produceDone', function()
    local src = source
    local job = producing[src]
    producing[src] = nil
    local org = orgOf(src)
    if not job or not isGang(org) then return end
    if now() - job.started < job.ms - 700 then return end
    if not near(pedCoords(src), job.lab, job.lab.radius + 4.0) then return notify(src, 'You walked away from the lab.', 'error') end
    lastProduce[src] = now()
    local drug = E.drugs[job.lab.drug]
    local bonus = (job.lab.owned and E.ownedLabBonus or 0) + (perksOf(org.id).yield or 0)
    local made = math.max(1, math.floor(drug.yield * (1 + bonus / 100) + 0.5))
    local c = carry[src] or { drug=job.lab.drug, units=0, org=org.id }
    local room = capacityOf(src) - c.units
    made = math.min(made, room)
    if made <= 0 then return end
    c.units = c.units + made
    c.org = org.id
    c.drug = job.lab.drug
    carry[src] = c
    saveCarry(src)
    pushState(src)
    notify(src, ('+%d %s (%d/%d carried).'):format(made, drug.label:lower(), c.units, capacityOf(src)), 'success')
end)

-- ─────────────────────────── deliveries ───────────────────────────

local function startDelivery(src)
    local org = orgOf(src)
    if not isGang(org) then return notify(src, 'Clock into your gang with /duty first.', 'error') end
    local c = carry[src]
    if not c or c.units <= 0 then return notify(src, 'You are not carrying any product. Work a lab first.', 'error') end
    if runs[src] then return notify(src, ('You already have a drop-off at %s.'):format(runs[src].drop.label), 'info') end
    if GlobalState['fbrp:peacetime'] == true then return notify(src, 'Deliveries are off during peacetime.', 'error') end
    local coords = pedCoords(src)
    if not coords then return end
    local options = {}
    for _, drop in ipairs(E.dropoffs) do
        if #(vector2(coords.x, coords.y) - vector2(drop.x, drop.y)) >= E.dropoffMinDistance then options[#options + 1] = drop end
    end
    if #options == 0 then options = E.dropoffs end
    local drop = options[math.random(#options)]
    runs[src] = { drop=drop, started=now(), deadline=now() + E.deliveryMinutes * 60000, from=coords, org=org.id }
    TriggerClientEvent('fbrp:economy:run', src, runInfo(src))
    pushState(src)
    notify(src, ('Drop-off arranged: %s. You have %d minutes.'):format(drop.label, E.deliveryMinutes), 'success')
end

RegisterNetEvent('fbrp:economy:deliveryStart', function() startDelivery(source) end)

local function cancelDelivery(src, reason)
    if not runs[src] then return end
    runs[src] = nil
    TriggerClientEvent('fbrp:economy:run', src, nil)
    pushState(src)
    if reason then notify(src, reason, 'warning') end
end

RegisterNetEvent('fbrp:economy:deliveryCancel', function() cancelDelivery(source, 'Delivery called off. You still have the product.') end)

RegisterNetEvent('fbrp:economy:deliveryDone', function()
    local src = source
    local run, c, org = runs[src], carry[src], orgOf(src)
    if not run or not c or c.units <= 0 then return end
    if not isGang(org) or org.id ~= run.org then return cancelDelivery(src, 'You are no longer on duty for that crew.') end
    if now() > run.deadline then return cancelDelivery(src, 'The buyer gave up waiting. Arrange a new drop-off.') end
    local coords = pedCoords(src)
    if not near(coords, run.drop, E.dropoffRadius + 3.0) then return notify(src, 'You are not at the drop-off.', 'error') end
    local km = #(vector2(run.from.x, run.from.y) - vector2(run.drop.x, run.drop.y)) / 1000.0
    if now() - run.started < math.max(20, km * E.minSecondsPerKm) * 1000 then
        cancelDelivery(src)
        local s = sessions[src]
        FBRP.DB.audit(s and s.discord or src, 'economy.suspicious_delivery', tostring(org.id), { km=km, seconds=math.floor((now() - run.started) / 1000) })
        return notify(src, 'The buyer did not trust that hand-off. Try again.', 'error')
    end
    local drug = E.drugs[c.drug]
    local perks = perksOf(org.id)
    local payout = math.floor(c.units * drug.price * (1 + (perks.price or 0) / 100))
    local units = c.units
    local paid = credit(org.id, payout, 'drug_sale', ('%d %s delivered to %s'):format(units, drug.label:lower(), run.drop.label), sessions[src].discord, run.drop.label)
    logRun(src, 'delivered', { payout=paid, location=run.drop.label })
    carry[src] = nil
    runs[src] = nil
    saveCarry(src)
    TriggerClientEvent('fbrp:economy:run', src, nil)
    pushState(src)
    chat(src, org.name:upper(), ('Hand-off complete: %d %s for %s - paid into the %s wallet.'):format(units, drug.label:lower(), money(paid), org.name), PURPLE)
    local s = sessions[src]
    FBRP.DB.audit(s and s.discord or src, 'economy.delivery', tostring(org.id), { organization=org.name, drug=drug.label, units=units, payout=paid, dropoff=run.drop.label })
    -- Someone may have seen it.
    local chance = E.policeTipChance * (1 - math.min(90, perks.heat or 0) / 100)
    if math.random(100) <= chance then
        S.sendDispatch('DRUGS', nil, ('Suspicious hand-off reported near %s.'):format(run.drop.label), vector3(run.drop.x, run.drop.y, run.drop.z), { FBRP.Ace.police }, true)
    end
end)

CreateThread(function()
    while true do
        Wait(15000)
        local stamp = now()
        for src, run in pairs(runs) do
            if stamp > run.deadline then cancelDelivery(src, 'The buyer gave up waiting. Arrange a new drop-off.') end
        end
    end
end)

-- ─────────────────────────── police & corrections ───────────────────────────

local function contrabandText(source)
    local c = carry[source]
    if not c or c.units <= 0 then return nil end
    return ('%dx %s (packaged for sale)'):format(c.units, E.drugs[c.drug].label)
end

local function removeCarry(source, status, byName, seizedOrg)
    local c = carry[source]
    if not c or c.units <= 0 then return nil end
    local coords = pedCoords(source)
    logRun(source, status, { by=byName, seizedOrg=seizedOrg, location=coords and ('%.0f, %.0f'):format(coords.x, coords.y) or nil })
    local text = contrabandText(source)
    carry[source] = nil
    if runs[source] then runs[source] = nil TriggerClientEvent('fbrp:economy:run', source, nil) end
    saveCarry(source)
    pushState(source)
    return text, c
end

FBRP.Economy.contrabandText = contrabandText

-- Police search: the product is listed and seized.
FBRP.Economy.seize = function(source, actor)
    local name = actor and S.displayName(actor) or 'Police'
    local department = actor and orgOf(actor)
    if not isDepartment(department) then department = nil end
    local text, c = removeCarry(source, 'seized', name, department and department.id or nil)
    if not text then return nil end
    local drug = E.drugs[c.drug]
    notify(source, ('%s seized your %s.'):format(name, drug.label:lower()), 'error')
    local s, a = sessions[source], actor and sessions[actor]
    local bounty = 0
    if department then
        local percent = (D.seizureBounty or 0) * (1 + (perksOf(department.id).bounty or 0) / 100)
        bounty = credit(department.id, c.units * drug.price * percent / 100, 'seizure',
            ('Seized %d %s (%s)'):format(c.units, drug.label:lower(), name), a and a.discord or nil, tostring(source)) or 0
        if bounty > 0 then notify(actor, ('Seizure logged. +%s to the %s budget.'):format(money(bounty), department.name), 'success') end
    end
    FBRP.DB.audit(a and a.discord or 'police', 'economy.seizure', s and s.discord or source, { drug=drug.label, units=c.units, officer=name, department=department and department.name or nil, bounty=bounty })
    return text
end

-- Booking into prison or community service confiscates anything carried.
FBRP.Economy.confiscate = function(source, byName)
    local text = removeCarry(source, 'confiscated', byName)
    if text then notify(source, 'Your product was confiscated at booking.', 'error') end
end

-- ─────────────────────────── businesses ───────────────────────────

RegisterNetEvent('fbrp:economy:taskStart', function(key)
    local src = source
    local org = orgOf(src)
    if not org then return notify(src, 'Clock in with /duty to work your business.', 'error') end
    local property = propertyByKey(org.id, clean(key, 40))
    if not property then return end
    if not near(pedCoords(src), workPoint(property), 6.0) then return notify(src, 'Stand at the business terminal.', 'error') end
    if (lastTask[src] or 0) + E.business.taskCooldownSeconds * 1000 > now() then
        return notify(src, ('Take a breather - next shift task in %ds.'):format(math.ceil(((lastTask[src] or 0) + E.business.taskCooldownSeconds * 1000 - now()) / 1000)), 'info')
    end
    local entry, cap = businessCapacity(org.id)
    if entry.earned >= cap then return notify(src, ('%s has hit this hour\'s business earnings cap (%s).'):format(org.name, money(cap)), 'warning') end
    local spec = E.business.types[property.business] or E.business.types.warehouse
    tasks[src] = { key=property.key, started=now(), ms=E.business.taskMs }
    TriggerClientEvent('fbrp:economy:taskApproved', src, property.key, E.business.taskMs, spec.scenario, spec.task)
end)

RegisterNetEvent('fbrp:economy:taskCancel', function() tasks[source] = nil end)

RegisterNetEvent('fbrp:economy:taskDone', function()
    local src = source
    local task = tasks[src]
    tasks[src] = nil
    local org = orgOf(src)
    if not task or not org then return end
    if now() - task.started < task.ms - 700 then return end
    local property = propertyByKey(org.id, task.key)
    if not property or not near(pedCoords(src), workPoint(property), 7.0) then return notify(src, 'You left the job.', 'error') end
    lastTask[src] = now()
    local spec = E.business.types[property.business] or E.business.types.warehouse
    local pay = math.floor(spec.pay * (1 + (perksOf(org.id).pay or 0) / 100))
    local paid = payBusiness(org.id, pay, 'business', ('%s: %s'):format(property.label, spec.task), sessions[src].discord, property.key)
    if paid > 0 then
        notify(src, ('+%s to the %s wallet.'):format(money(paid), org.name), 'success')
    else
        notify(src, 'This hour\'s earnings cap is reached. Keep the place running for the roleplay!', 'info')
    end
end)

-- /mechanic repair is available to everyone. Eligible on-duty mechanics still
-- earn the shop payout; /serve remains an organization business service.
local function serviceProperty(src, kind)
    local org = orgOf(src)
    if not org then return nil, 'Clock in with /duty first.' end
    local coords = pedCoords(src)
    for _, property in ipairs(owned[org.id] and owned[org.id].properties or {}) do
        local spec = E.business.types[property.business]
        if spec and spec.service == kind and near(coords, property, property.radius) then return property, spec, org end
    end
    return nil, kind == 'repair' and 'You must be at a mechanic shop your organization owns.' or 'You must be at a bar, club or restaurant your organization owns.'
end

local function serviceCooldown(src)
    local wait = (lastService[src] or 0) + E.business.serviceCooldownSeconds * 1000 - now()
    if wait > 0 then
        notify(src, ('Next customer in %ds.'):format(math.ceil(wait / 1000)), 'info')
        return true
    end
end

RegisterNetEvent('fbrp:economy:repair', function(netId)
    local src = source
    local property, spec, org = serviceProperty(src, 'repair')
    if serviceCooldown(src) then return end
    local entity = NetworkGetEntityFromNetworkId(tonumber(netId) or 0)
    if not entity or entity == 0 or not DoesEntityExist(entity) or GetEntityType(entity) ~= 2 then return notify(src, 'No vehicle found.', 'error') end
    if #(pedCoords(src) - GetEntityCoords(entity)) > 7.0 then return notify(src, 'Get closer to the vehicle.', 'error') end
    lastService[src] = now()
    local owner = NetworkGetEntityOwner(entity)
    TriggerClientEvent('fbrp:economy:fixVehicle', owner > 0 and owner or src, NetworkGetNetworkIdFromEntity(entity))
    local paid = 0
    if property and spec and org then
        local fee = math.floor(spec.serviceFee * (1 + (perksOf(org.id).pay or 0) / 100))
        paid = payBusiness(org.id, fee, 'service', ('%s: vehicle repair'):format(property.label), sessions[src].discord, property.key)
    end
    local message = 'Vehicle fully repaired.'
    if property and org then
        message = paid > 0 and ('Vehicle repaired. +%s to the %s wallet.'):format(money(paid), org.name) or 'Vehicle repaired (hourly earnings cap reached).'
    end
    notify(src, message, 'success')
    local s = sessions[src]
    FBRP.DB.audit(s and s.discord or src, 'economy.vehicle_repair', org and tostring(org.id) or nil, { service='repair', property=property and property.label or nil, paid=paid })
end)

RegisterNetEvent('fbrp:economy:serve', function(target)
    local src = source
    target = tonumber(target)
    local property, spec, org = serviceProperty(src, 'serve')
    if not property then return notify(src, spec, 'error') end
    if not target or target == src or not sessions[target] or not S.playersNear(src, target, 3.5) then return notify(src, 'Serve someone standing next to you.', 'error') end
    if serviceCooldown(src) then return end
    lastService[src] = now()
    TriggerClientEvent('fbrp:economy:served', target, { from=S.displayName(src), place=property.label, business=property.business })
    local fee = math.floor(spec.serviceFee * (1 + (perksOf(org.id).pay or 0) / 100))
    local paid = payBusiness(org.id, fee, 'service', ('%s: served a customer'):format(property.label), sessions[src].discord, property.key)
    notify(src, paid > 0 and ('Customer served. +%s to the %s wallet.'):format(money(paid), org.name) or 'Customer served (hourly earnings cap reached).', 'success')
end)

-- Armory: purchased weapon permits, handed out at an owned property.
RegisterNetEvent('fbrp:economy:armory', function(key)
    local src = source
    local org = orgOf(src)
    if not org then return notify(src, 'Clock in with /duty first.', 'error') end
    if FBRP.Justice.IsJailed(src) or (FBRP.Justice.IsServing and FBRP.Justice.IsServing(src)) then return end
    local me = accessOf(src)
    if not (me and me.armory) then return notify(src, 'Your rank does not have armory access.', 'error') end
    if not atArmory(src, org) then return notify(src, isDepartment(org) and 'The armory is at your department\'s stations or properties.' or 'The armory is at your organization\'s property.', 'error') end
    local package
    for _, entry in ipairs(owned[org.id] and owned[org.id].weapons or {}) do
        if entry.key == clean(key, 40) then package = entry end
    end
    if not package then return end
    local stamp = now()
    local cooldownKey = (sessions[src].discord or src) .. ':' .. package.key
    if (armoryUsed[cooldownKey] or 0) + E.armoryCooldownSeconds * 1000 > stamp then return notify(src, 'You already drew that loadout. Come back later.', 'error') end
    armoryUsed[cooldownKey] = stamp
    local ped = GetPlayerPed(src)
    -- Armory loadouts are a legitimate long gun source (see fbrp_longguns).
    local issued = {}
    for _, weapon in ipairs(package.weapons) do issued[#issued + 1] = tostring(weapon.name):upper() end
    TriggerClientEvent('fbrp_longguns:issued', src, issued)
    for _, weapon in ipairs(package.weapons) do
        GiveWeaponToPed(ped, joaat(tostring(weapon.name)), math.max(1, math.min(500, tonumber(weapon.ammo) or 60)), false, false)
    end
    notify(src, ('%s drawn from the armory.'):format(package.label), 'success')
    local s = sessions[src]
    FBRP.DB.audit(s and s.discord or src, 'economy.armory', tostring(org.id), { package=package.label })
    TriggerClientEvent('fbrp:economy:hub', src, hubPayload(src))
end)

RegisterNetEvent('fbrp:economy:outfit', function(key)
    local src = source
    local org = orgOf(src)
    if not org then return notify(src, 'Clock in with /duty first.', 'error') end
    for _, outfit in ipairs(owned[org.id] and owned[org.id].outfits or {}) do
        if outfit.key == clean(key, 40) then
            return TriggerClientEvent('fbrp:economy:wear', src, outfit.data, outfit.label)
        end
    end
end)

-- ─────────────────────────── garage ───────────────────────────

-- Purchased vehicles appear as an extra F7 garage section while on duty.
FBRP.Economy.garageCategory = function(source)
    local org = orgOf(source)
    local list = org and owned[org.id] and owned[org.id].vehicles or nil
    if not list or #list == 0 then return nil end
    local me = accessOf(source)
    if not (me and me.garage) then return nil end
    local style = nil
    if E.orgPlates ~= false then
        local info = orgInfo[org.id] or {}
        local prefix = tostring(info.slug or org.slug or 'ORG'):upper():gsub('[^%w]', ''):sub(1, 4)
        style = { plate=prefix .. tostring(math.random(math.floor(10 ^ (7 - #prefix)), math.floor(10 ^ (8 - #prefix)) - 1)), color=not isDepartment(org) and info.color or nil }
    end
    return { id='org', label=org.name, icon='car', vehicles=list, style=style }
end

FBRP.Economy.Reload = reload

-- ─────────────────────────── departments ───────────────────────────

-- Members on duty for a department earn its budget by the minute, batched into one ledger line.
CreateThread(function()
    local minutes = 0
    while true do
        Wait(60000)
        if S.isReady() then
            for _, s in pairs(sessions) do
                local org = s.org
                local rate = org and D.stipendPerHour[org.type]
                if rate and rate > 0 then
                    local entry = stipend[org.id] or { amount=0, minutes=0 }
                    entry.amount = entry.amount + rate / 60 * (1 + (perksOf(org.id).stipend or 0) / 100)
                    entry.minutes = entry.minutes + 1
                    stipend[org.id] = entry
                end
            end
            minutes = minutes + 1
            if minutes >= (D.stipendFlushMinutes or 10) then
                minutes = 0
                local batch = stipend
                stipend = {}
                for orgId, entry in pairs(batch) do
                    credit(orgId, entry.amount, 'stipend', ('Duty pay: %d member-minute%s on duty'):format(entry.minutes, entry.minutes == 1 and '' or 's'))
                end
            end
        end
    end
end)

-- /crew: who in your organization is on duty right now.
RegisterCommand('crew', function(source)
    if source <= 0 then return end
    local org = orgOf(source)
    if not org then return notify(source, 'Clock in with /duty to see your crew.', 'info') end
    local lines = {}
    for src, other in pairs(sessions) do
        if other.org and other.org.id == org.id then
            local them = accessOf(src)
            lines[#lines + 1] = ('%s [%d] - %s'):format(S.displayName(src), src, them and them.rank or 'Member')
        end
    end
    table.sort(lines)
    chat(source, org.name:upper() .. ' · ON DUTY', table.concat(lines, ', '), PURPLE)
end, false)
