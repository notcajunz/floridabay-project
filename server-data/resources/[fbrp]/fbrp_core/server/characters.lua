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

-- The CAD/MDT looks citizens up by this number (FB-000123) as well as by name.
local function citizenNumber(id)
    return ('FB-%06d'):format(tonumber(id) or 0)
end

local function validDate(y, m, d)
    if m < 1 or m > 12 or d < 1 then return false end
    local days = { 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 }
    local leap = (y % 4 == 0 and y % 100 ~= 0) or y % 400 == 0
    return d <= ((m == 2 and leap) and 29 or days[m])
end

local function ageOn(y, m, d)
    local t = os.date('*t')
    return t.year - y - ((t.month < m or (t.month == m and t.day < d)) and 1 or 0)
end

-- Cards on the selector: the character plus what the MDT/ID already holds for it.
local function characterRows(source)
    local license = ownerLicense(source)
    if not license then return {} end
    local rows = MySQL.query.await([[
        SELECT c.id,c.first_name,c.last_name,c.date_of_birth,c.gender,c.backstory,c.last_x,c.last_y,c.last_z,c.last_heading,
               c.last_spawn_key,c.last_played_at,p.nationality,p.height_cm,p.phone
        FROM characters c LEFT JOIN character_profiles p ON p.character_id=c.id
        WHERE c.owner_license=? AND c.archived=FALSE ORDER BY c.created_at,c.id
    ]], { license })
    for _, row in ipairs(rows) do
        row.citizen = citizenNumber(row.id)
    end
    return rows
end

local function playtimeSeconds(license)
    if not license then return 0 end
    return tonumber(MySQL.scalar.await('SELECT seconds FROM player_playtime WHERE license=?', { license })) or 0
end

-- Refusals go to the form on the character screen as well as a notification.
local function fail(src, message)
    TriggerClientEvent('ox_lib:notify', src, { description = message, type = 'error' })
    TriggerClientEvent('fbrp:characters:error', src, message)
end

local function sendCharacters(source)
    TriggerClientEvent('fbrp:characters:data', source, {
        characters=characterRows(source),
        maxSlots=FBRP.Config.characterSlots or 3,
        playtime=playtimeSeconds(ownerLicense(source)),
        nationalities=FBRP.Config.nationalities or {},
        defaultNationality=FBRP.Config.defaultNationality
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
        return fail(src, 'All character slots are in use.')
    end
    local first=clean(data.firstName,40)
    local last=clean(data.lastName,40)
    local dob=clean(data.dateOfBirth,10)
    local gender=clean(data.gender,24)
    local backstory=clean(data.backstory,500)
    local nationality=clean(data.nationality,40)
    local height=tonumber(data.heightCm)
    if not first:match('^[%a][%a%s%-\']+$') or not last:match('^[%a][%a%s%-\']+$') then
        return fail(src, 'Enter a valid first and last name.')
    end
    local y,m,d=dob:match('^(%d%d%d%d)%-(%d%d)%-(%d%d)$')
    if not y then
        return fail(src, 'Date of birth must use YYYY-MM-DD.')
    end
    y,m,d=tonumber(y),tonumber(m),tonumber(d)
    local age=validDate(y,m,d) and ageOn(y,m,d) or nil
    if not age or age < ((FBRP.Citizen and FBRP.Citizen.minAge) or 18) or age > 100 then
        return fail(src, 'Characters must be between 18 and 100 years old.')
    end
    if gender=='' then return fail(src, 'Enter a gender or identity.') end
    if nationality:find('[^%a%s%-\'%.]') then
        return fail(src, 'Enter a valid nationality.')
    end
    if data.heightCm ~= nil and data.heightCm ~= '' and (not height or height < 120 or height > ((FBRP.Citizen and FBRP.Citizen.maxHeightCm) or 230)) then
        return fail(src, 'Height must be between 120 and 230 cm.')
    end
    local stamp=os.time()*1000
    local characterId=MySQL.insert.await('INSERT INTO characters(owner_license,discord_id,first_name,last_name,date_of_birth,gender,backstory,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',{
        license,discord(src),first,last,dob,gender,backstory,stamp,stamp
    })
    -- The MDT/ID read nationality and height from the citizen profile, so a new
    -- character is searchable with the same details an existing one has.
    if characterId and (nationality ~= '' or height) then
        MySQL.prepare.await('INSERT INTO character_profiles(character_id,nationality,height_cm,updated_at) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE nationality=VALUES(nationality),height_cm=VALUES(height_cm),updated_at=VALUES(updated_at)',{
            characterId,nationality ~= '' and nationality or nil,height and math.floor(height) or nil,stamp
        })
    end
    if characterId then
        TriggerEvent('fbrp:characterCreated',src,characterId,{firstName=first,lastName=last,dateOfBirth=dob,citizen=citizenNumber(characterId)})
    end
    FBRP.DB.audit(discord(src) or license,'character.create',characterId and tostring(characterId) or nil,{name=first..' '..last,citizen=characterId and citizenNumber(characterId) or nil})
    sendCharacters(src)
    TriggerClientEvent('ox_lib:notify', src, { description = ('Character %s %s created. State ID %s.'):format(first, last, characterId and citizenNumber(characterId) or '-'), type = 'success' })
end)

-- Editing is limited to the details a player types at creation; the State ID,
-- slot and history stay as they are.
RegisterNetEvent('fbrp:characters:update', function(rawId, data)
    local src=source
    local id=tonumber(rawId)
    local license=ownerLicense(src)
    if not id or not license or type(data)~='table' then return end
    local row=MySQL.single.await('SELECT * FROM characters WHERE id=? AND owner_license=? AND archived=FALSE',{id,license})
    if not row then return fail(src, 'Character not found.') end
    local first=clean(data.firstName,40)
    local last=clean(data.lastName,40)
    local dob=clean(data.dateOfBirth,10)
    local gender=clean(data.gender,24)
    local nationality=clean(data.nationality,40)
    local height=tonumber(data.heightCm)
    if not first:match('^[%a][%a%s%-\']+$') or not last:match('^[%a][%a%s%-\']+$') then
        return fail(src, 'Enter a valid first and last name.')
    end
    local y,m,d=dob:match('^(%d%d%d%d)%-(%d%d)%-(%d%d)$')
    if not y then
        return fail(src, 'Date of birth must use YYYY-MM-DD.')
    end
    y,m,d=tonumber(y),tonumber(m),tonumber(d)
    local age=validDate(y,m,d) and ageOn(y,m,d) or nil
    if not age or age < ((FBRP.Citizen and FBRP.Citizen.minAge) or 18) or age > 100 then
        return fail(src, 'Characters must be between 18 and 100 years old.')
    end
    if gender=='' then return fail(src, 'Enter a gender or identity.') end
    if nationality:find('[^%a%s%-\'%.]') then
        return fail(src, 'Enter a valid nationality.')
    end
    if data.heightCm ~= nil and data.heightCm ~= '' and (not height or height < 120 or height > ((FBRP.Citizen and FBRP.Citizen.maxHeightCm) or 230)) then
        return fail(src, 'Height must be between 120 and 230 cm.')
    end
    local stamp=os.time()*1000
    MySQL.update.await('UPDATE characters SET first_name=?,last_name=?,date_of_birth=?,gender=?,updated_at=? WHERE id=? AND owner_license=?',{first,last,dob,gender,stamp,id,license})
    MySQL.prepare.await('INSERT INTO character_profiles(character_id,nationality,height_cm,updated_at) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE nationality=VALUES(nationality),height_cm=VALUES(height_cm),updated_at=VALUES(updated_at)',{
        id,nationality ~= '' and nationality or nil,height and math.floor(height) or nil,stamp
    })
    TriggerEvent('fbrp:characterUpdated',src,id,{firstName=first,lastName=last,dateOfBirth=dob,citizen=citizenNumber(id)})
    FBRP.DB.audit(discord(src) or license,'character.update',tostring(id),{
        before=row.first_name..' '..row.last_name,after=first..' '..last,citizen=citizenNumber(id)
    })
    sendCharacters(src)
    TriggerClientEvent('ox_lib:notify', src, { description = ('Character %s %s updated.'):format(first, last), type = 'success' })
end)

RegisterNetEvent('fbrp:characters:select', function(rawId)
    local src=source
    local id=tonumber(rawId)
    local license=ownerLicense(src)
    if not id or not license then return end
    local row=MySQL.single.await('SELECT * FROM characters WHERE id=? AND owner_license=? AND archived=FALSE',{id,license})
    if not row then return fail(src, 'Character not found.') end
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
    TriggerClientEvent('ox_lib:notify', src, { description = ('Playing as %s.'):format(name), type = 'info' })
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
