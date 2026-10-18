local selected = {}

local function clean(value, max)
    return tostring(value or ''):gsub('[%c]', ' '):gsub('^%s+', ''):gsub('%s+$', ''):sub(1, max or 80)
end

local function ownerLicense(source)
    for _, value in ipairs(GetPlayerIdentifiers(source)) do
        if value:sub(1, 8) == 'license:' then return value end
    end
end

local function discord(source)
    for _, value in ipairs(GetPlayerIdentifiers(source)) do
        if value:sub(1, 8) == 'discord:' then return value:sub(9) end
    end
end

local function characterRows(source)
    local license = ownerLicense(source)
    if not license then return {} end
    return MySQL.query.await([[
        SELECT id,first_name,last_name,date_of_birth,gender,backstory,last_x,last_y,last_z,last_heading,last_spawn_key,last_played_at
        FROM characters WHERE owner_license=? AND archived=FALSE ORDER BY last_played_at DESC,created_at
    ]], { license })
end

local function sendCharacters(source)
    TriggerClientEvent('fbrp:characters:data', source, {
        characters=characterRows(source),
        maxSlots=FBRP.Config.characterSlots or 3
    })
end

RegisterNetEvent('fbrp:characters:request', function()
    sendCharacters(source)
end)

RegisterNetEvent('fbrp:characters:create', function(data)
    local src=source
    if type(data)~='table' then return end
    local license=ownerLicense(src)
    if not license then return end
    local count=tonumber(MySQL.scalar.await('SELECT COUNT(*) FROM characters WHERE owner_license=? AND archived=FALSE',{license})) or 0
    if count >= (FBRP.Config.characterSlots or 3) then
        return TriggerClientEvent('fbrp:notify',src,'All character slots are in use.','error')
    end
    local first=clean(data.firstName,40)
    local last=clean(data.lastName,40)
    local dob=clean(data.dateOfBirth,10)
    local gender=clean(data.gender,24)
    local backstory=clean(data.backstory,500)
    if not first:match('^[%a][%a%s%-\']+$') or not last:match('^[%a][%a%s%-\']+$') then
        return TriggerClientEvent('fbrp:notify',src,'Enter a valid first and last name.','error')
    end
    if not dob:match('^%d%d%d%d%-%d%d%-%d%d$') then
        return TriggerClientEvent('fbrp:notify',src,'Date of birth must use YYYY-MM-DD.','error')
    end
    if gender=='' then return TriggerClientEvent('fbrp:notify',src,'Enter a gender or identity.','error') end
    local stamp=os.time()*1000
    MySQL.insert.await('INSERT INTO characters(owner_license,discord_id,first_name,last_name,date_of_birth,gender,backstory,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',{
        license,discord(src),first,last,dob,gender,backstory,stamp,stamp
    })
    FBRP.DB.audit(discord(src) or license,'character.create',nil,{name=first..' '..last})
    sendCharacters(src)
end)

RegisterNetEvent('fbrp:characters:select', function(rawId)
    local src=source
    local id=tonumber(rawId)
    local license=ownerLicense(src)
    if not id or not license then return end
    local row=MySQL.single.await('SELECT * FROM characters WHERE id=? AND owner_license=? AND archived=FALSE',{id,license})
    if not row then return TriggerClientEvent('fbrp:notify',src,'Character not found.','error') end
    selected[src]={id=id,license=license}
    local stamp=os.time()*1000
    MySQL.prepare.await('INSERT INTO player_character_selection(owner_license,character_id,updated_at) VALUES(?,?,?) ON DUPLICATE KEY UPDATE character_id=VALUES(character_id),updated_at=VALUES(updated_at)',{license,id,stamp})
    MySQL.update.await('UPDATE characters SET last_played_at=?,updated_at=? WHERE id=?',{stamp,stamp,id})
    local name=row.first_name..' '..row.last_name
    local player=Player(src)
    if player then
        player.state:set('fbrp:characterId',id,true)
        player.state:set('fbrp:characterName',name,true)
        player.state:set('fbrp:name',name,true)
    end
    local spawns={}
    if row.last_x and row.last_y and row.last_z then
        spawns[#spawns+1]={id='last',label='Last Location',description='Continue where this character left off',x=row.last_x,y=row.last_y,z=row.last_z,h=row.last_heading or 0.0}
    end
    for _, spawn in ipairs(FBRP.SpawnLocations or {}) do spawns[#spawns+1]=spawn end
    TriggerClientEvent('fbrp:characters:spawns',src,{character={id=id,name=name},spawns=spawns})
    -- Per-character systems (the phone) switch to this character.
    TriggerEvent('fbrp:characterSelected',src,id,{firstName=row.first_name,lastName=row.last_name,dateOfBirth=row.date_of_birth})
    FBRP.DB.audit(discord(src) or license,'character.select',id,{name=name})
end)

RegisterNetEvent('fbrp:characters:save', function(position, spawnKey)
    local src=source
    local active=selected[src]
    if not active or type(position)~='table' then return end
    local x,y,z,h=tonumber(position.x),tonumber(position.y),tonumber(position.z),tonumber(position.h)
    if not x or not y or not z or math.abs(x)>10000 or math.abs(y)>10000 or math.abs(z)>5000 then return end
    MySQL.update('UPDATE characters SET last_x=?,last_y=?,last_z=?,last_heading=?,last_spawn_key=?,updated_at=? WHERE id=? AND owner_license=?',{
        x,y,z,h or 0.0,clean(spawnKey,40),os.time()*1000,active.id,active.license
    })
end)

AddEventHandler('playerDropped',function() selected[source]=nil end)
