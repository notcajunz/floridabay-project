-- Citizen: civilians edit their own character here. Identity (name, birth date,
-- gender), descriptors, contact details, ID card customisation, license
-- applications and registered vehicles. Everything is scoped to the character
-- the player is currently playing; officers see the result in the CAD/MDT.

local S = FBRP.Server
local MDT = FBRP.MDT
local CZ = FBRP.Citizen
local sessions = S.sessions
local now, clean, notify, hasPermission = S.now, S.clean, S.notify, S.hasPermission

local C = {}
FBRP.CitizenApi = C

local lastAction = {}

local DAY_MS = 86400000

-- ─────────────────────────── helpers ───────────────────────────

local function characterOf(source)
    local player = Player(source)
    if not player then return nil end
    return tonumber(player.state['fbrp:characterId'])
end

local function truthy(value)
    return value == true or value == 1 or value == '1'
end

local function citizenNumber(id)
    return ('FB-%06d'):format(tonumber(id) or 0)
end

local function actorOf(source)
    local s = sessions[source]
    return (s and (s.discord or s.license)) or tostring(source)
end

local function charRow(id)
    return MySQL.single.await('SELECT id,owner_license,first_name,last_name,date_of_birth,gender,backstory,created_at,last_played_at FROM characters WHERE id=? AND archived=FALSE', { tonumber(id) })
end

-- Case-insensitive pick from a configured list. Returns the canonical value.
local function pick(list, value)
    value = tostring(value or ''):lower()
    for _, entry in ipairs(list) do
        if entry:lower() == value then return entry end
    end
end

local function optional(value, max)
    value = clean(value, max)
    return value ~= '' and value or nil
end

local function licenseConfig(id)
    for _, license in ipairs(MDT.licenses) do
        if license.id == id then return license end
    end
end

local function validDate(y, m, d)
    if m < 1 or m > 12 or d < 1 then return false end
    local days = { 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 }
    local leap = (y % 4 == 0 and y % 100 ~= 0) or y % 400 == 0
    local max = days[m]
    if m == 2 and leap then max = 29 end
    return d <= max
end

local function ageOn(y, m, d)
    local t = os.date('*t')
    return t.year - y - ((t.month < m or (t.month == m and t.day < d)) and 1 or 0)
end

local function formatPhone(raw)
    local digits = raw:gsub('%D', '')
    if #digits == 7 then return ('%s-%s'):format(digits:sub(1, 3), digits:sub(4)) end
    if #digits == 10 then return ('(%s) %s-%s'):format(digits:sub(1, 3), digits:sub(4, 6), digits:sub(7)) end
    return raw
end

-- ─────────────────────────── read models ───────────────────────────

-- Descriptors and contact details with defaults filled in.
function C.details(characterId)
    local row = MySQL.single.await('SELECT * FROM character_profiles WHERE character_id=?', { tonumber(characterId) }) or {}
    return {
        nickname=row.nickname, nationality=row.nationality,
        heightCm=tonumber(row.height_cm), weightKg=tonumber(row.weight_kg),
        eyeColor=row.eye_color, hairColor=row.hair_color, bloodType=row.blood_type,
        organDonor=truthy(row.organ_donor), occupation=row.occupation, address=row.address,
        phone=row.phone, phoneFromDevice=truthy(row.phone_from_device), emergencyContact=row.emergency_contact, marks=row.marks,
        theme=row.id_theme or 'classic',
        showAddress=truthy(row.show_address), showPhone=truthy(row.show_phone),
        showLicenses=row.show_licenses == nil or truthy(row.show_licenses),
    }
end

-- Former names, most recent first.
function C.aliases(characterId)
    local rows = MySQL.query.await("SELECT old_value,created_at FROM character_changes WHERE character_id=? AND field='name' ORDER BY id DESC LIMIT 10", { tonumber(characterId) })
    local out = {}
    for _, row in ipairs(rows) do out[#out + 1] = { name=row.old_value, changedAt=tonumber(row.created_at) } end
    return out
end

-- Licenses the citizen holds or has applied for, one entry per configured kind.
function C.licenses(characterId)
    local rows = MySQL.query.await('SELECT kind,status,restriction,issued_at,show_on_id,updated_by,updated_at FROM mdt_licenses WHERE character_id=?', { tonumber(characterId) })
    local byKind = {}
    for _, row in ipairs(rows) do byKind[row.kind] = row end
    local out = {}
    for _, license in ipairs(MDT.licenses) do
        local row = byKind[license.id]
        out[#out + 1] = {
            id=license.id, label=license.label, selfIssue=license.selfIssue == true,
            status=row and row.status or 'none', restriction=row and row.restriction or nil,
            issuedAt=row and tonumber(row.issued_at) or nil, showOnId=row == nil or truthy(row.show_on_id),
            updatedBy=row and row.updated_by or nil, updatedAt=row and tonumber(row.updated_at) or nil,
        }
    end
    return out
end

-- The ID card other people see. Police checks (`forPolice`) ignore the privacy
-- toggles and include licenses that are not in good standing.
function C.idCard(characterId, forPolice)
    local row = charRow(characterId)
    if not row then return nil end
    local id = tonumber(row.id)
    local details = C.details(id)
    local card = {
        id=id, name=row.first_name .. ' ' .. row.last_name, citizen=citizenNumber(id),
        dob=row.date_of_birth, gender=row.gender, nickname=details.nickname, nationality=details.nationality,
        heightCm=details.heightCm, eyeColor=details.eyeColor, hairColor=details.hairColor,
        organDonor=details.organDonor, theme=details.theme,
    }
    if forPolice or details.showAddress then card.address = details.address end
    if forPolice or details.showPhone then card.phone = details.phone end
    if forPolice then card.occupation = details.occupation end
    if forPolice or details.showLicenses then
        local list = {}
        for _, license in ipairs(C.licenses(id)) do
            local shown = license.status == 'valid' and license.showOnId
            if forPolice and license.status ~= 'none' then shown = true end
            if shown then list[#list + 1] = { label=license.label, status=license.status, restriction=license.restriction } end
        end
        card.licenses = list
    end
    return card
end

local function identityState(source, row)
    local J = FBRP.Justice
    if J.IsJailed and J.IsJailed(source) then return false, 'You cannot change your identity while serving a sentence.' end
    if J.IsServing and J.IsServing(source) then return false, 'You cannot change your identity during community service.' end
    local last = tonumber(MySQL.scalar.await("SELECT MAX(created_at) FROM character_changes WHERE character_id=? AND field IN ('name','dob','gender')", { row.id }))
    if last then
        local nextAt = last + (CZ.identityCooldownDays or 7) * DAY_MS
        if nextAt > now() then return false, nil, nextAt end
    end
    return true
end

local function vehicleList(characterId)
    local rows = MySQL.query.await('SELECT plate,model,label,stolen,impounded_at,registered_at FROM vehicle_registrations WHERE character_id=? ORDER BY registered_at DESC LIMIT 25', { characterId })
    for _, row in ipairs(rows) do
        row.stolen = truthy(row.stolen)
        row.impounded = row.impounded_at ~= nil
        row.impounded_at = nil
    end
    return rows
end

local function history(characterId)
    local rows = MySQL.query.await('SELECT id,kind,charges,months,fine,notes,officer_name,created_at FROM criminal_records WHERE character_id=? ORDER BY id DESC LIMIT 15', { characterId })
    for _, row in ipairs(rows) do
        local ok, charges = pcall(json.decode, row.charges or '[]')
        row.charges = ok and charges or {}
    end
    return rows
end

local function payload(source, characterId)
    local row = charRow(characterId)
    if not row then return nil end
    local id = tonumber(row.id)
    local canChange, reason, nextAt = identityState(source, row)
    return {
        id=id, citizen=citizenNumber(id), firstName=row.first_name, lastName=row.last_name,
        dob=row.date_of_birth, gender=row.gender, backstory=row.backstory or '',
        createdAt=tonumber(row.created_at), lastPlayedAt=tonumber(row.last_played_at),
        identity={ canChange=canChange, reason=reason, nextAt=nextAt, cooldownDays=CZ.identityCooldownDays, minAge=CZ.minAge },
        details=C.details(id), card=C.idCard(id, false), aliases=C.aliases(id),
        licenses=C.licenses(id), vehicles=vehicleList(id), history=history(id),
        options={
            themes=CZ.idThemes, eyeColors=CZ.eyeColors, hairColors=CZ.hairColors, bloodTypes=CZ.bloodTypes,
            restrictions=CZ.restrictions, maxHeightCm=CZ.maxHeightCm, maxWeightKg=CZ.maxWeightKg,
        },
    }
end

local function push(source, characterId, kind)
    local data = payload(source, characterId)
    if data then TriggerClientEvent('fbrp:citizen:data', source, kind or 'profile', data) end
end

-- ─────────────────────────── actions ───────────────────────────

local ACTIONS = {}

local function fail(source, message)
    notify(source, message, 'error')
    return false
end

ACTIONS.refresh = function() return true end

ACTIONS.saveIdentity = function(src, characterId, data, row)
    local ok, reason, nextAt = identityState(src, row)
    if not ok then
        if reason then return fail(src, reason) end
        local days = math.max(1, math.ceil((nextAt - now()) / DAY_MS))
        return fail(src, ('Your identity was changed recently. You can change it again in %d day%s.'):format(days, days == 1 and '' or 's'))
    end
    local first, last = clean(data.firstName, 40), clean(data.lastName, 40)
    local dob, gender = clean(data.dateOfBirth, 10), clean(data.gender, 24)
    if not first:match("^[%a][%a%s%-']+$") or not last:match("^[%a][%a%s%-']+$") then
        return fail(src, 'Enter a valid first and last name.')
    end
    if gender == '' then return fail(src, 'Enter a gender or identity.') end
    if dob ~= row.date_of_birth then
        local y, m, d = dob:match('^(%d%d%d%d)%-(%d%d)%-(%d%d)$')
        y, m, d = tonumber(y), tonumber(m), tonumber(d)
        if not y or y < 1900 or not validDate(y, m, d) then return fail(src, 'Date of birth must be a real date in YYYY-MM-DD form.') end
        if ageOn(y, m, d) < (CZ.minAge or 18) then return fail(src, ('Characters must be at least %d years old.'):format(CZ.minAge or 18)) end
    end

    local changes = {}
    local oldName, newName = row.first_name .. ' ' .. row.last_name, first .. ' ' .. last
    if oldName ~= newName then changes[#changes + 1] = { 'name', oldName, newName } end
    if dob ~= row.date_of_birth then changes[#changes + 1] = { 'dob', row.date_of_birth, dob } end
    if gender ~= row.gender then changes[#changes + 1] = { 'gender', row.gender, gender } end
    if #changes == 0 then return fail(src, 'Nothing to change.') end

    local stamp = now()
    MySQL.update.await('UPDATE characters SET first_name=?,last_name=?,date_of_birth=?,gender=?,updated_at=? WHERE id=?', { first, last, dob, gender, stamp, row.id })
    local actor = actorOf(src)
    for _, change in ipairs(changes) do
        MySQL.insert.await('INSERT INTO character_changes(character_id,field,old_value,new_value,changed_by,created_at) VALUES(?,?,?,?,?,?)', { row.id, change[1], change[2], change[3], actor, stamp })
    end
    if oldName ~= newName then
        local player = Player(src)
        if player then
            player.state:set('fbrp:characterName', newName, true)
            player.state:set('fbrp:name', newName, true)
        end
    end
    FBRP.DB.audit(actor, 'character.identity', tostring(row.id), { from=oldName, to=newName, dob=dob, gender=gender })
    notify(src, 'Your identity was updated. Officers can still see your former names.', 'success')
    return true
end

ACTIONS.saveDetails = function(src, characterId, data, row)
    local height, weight = tonumber(data.heightCm), tonumber(data.weightKg)
    if data.heightCm ~= nil and data.heightCm ~= '' and (not height or height < 120 or height > CZ.maxHeightCm) then
        return fail(src, ('Height must be between 120 and %d cm.'):format(CZ.maxHeightCm))
    end
    if data.weightKg ~= nil and data.weightKg ~= '' and (not weight or weight < 30 or weight > CZ.maxWeightKg) then
        return fail(src, ('Weight must be between 30 and %d kg.'):format(CZ.maxWeightKg))
    end
    local eyes, hair, blood = nil, nil, nil
    if clean(data.eyeColor, 16) ~= '' then
        eyes = pick(CZ.eyeColors, data.eyeColor)
        if not eyes then return fail(src, 'Pick an eye colour from the list.') end
    end
    if clean(data.hairColor, 16) ~= '' then
        hair = pick(CZ.hairColors, data.hairColor)
        if not hair then return fail(src, 'Pick a hair colour from the list.') end
    end
    if clean(data.bloodType, 4) ~= '' then
        blood = pick(CZ.bloodTypes, data.bloodType)
        if not blood then return fail(src, 'Pick a blood type from the list.') end
    end
    local phone = optional(data.phone, 16)
    -- The character's phone (sky_phone) owns its number once one is issued.
    local issued = MySQL.single.await('SELECT phone FROM character_profiles WHERE character_id=? AND phone_from_device=TRUE', { row.id })
    if issued then
        phone = issued.phone
    elseif phone then
        if not phone:match('^[%d%s%-%(%)%+]+$') then return fail(src, 'Phone numbers use digits, spaces, dashes and brackets.') end
        local digits = #phone:gsub('%D', '')
        if digits < 7 or digits > 11 then return fail(src, 'Phone numbers need 7 to 11 digits.') end
        phone = formatPhone(phone)
    end
    local stamp = now()
    MySQL.prepare.await([[
        INSERT INTO character_profiles(character_id,nickname,nationality,height_cm,weight_kg,eye_color,hair_color,blood_type,organ_donor,occupation,address,phone,emergency_contact,marks,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE nickname=VALUES(nickname),nationality=VALUES(nationality),height_cm=VALUES(height_cm),weight_kg=VALUES(weight_kg),
          eye_color=VALUES(eye_color),hair_color=VALUES(hair_color),blood_type=VALUES(blood_type),organ_donor=VALUES(organ_donor),
          occupation=VALUES(occupation),address=VALUES(address),phone=VALUES(phone),emergency_contact=VALUES(emergency_contact),
          marks=VALUES(marks),updated_at=VALUES(updated_at)
    ]], {
        row.id, optional(data.nickname, 40), optional(data.nationality, 40), height and math.floor(height) or nil, weight and math.floor(weight) or nil,
        eyes, hair, blood, data.organDonor == true, optional(data.occupation, 60), optional(data.address, 120), phone,
        optional(data.emergencyContact, 80), optional(data.marks, 200), stamp,
    })
    if data.backstory ~= nil then
        MySQL.update.await('UPDATE characters SET backstory=?,updated_at=? WHERE id=?', { clean(data.backstory, 500), stamp, row.id })
    end
    FBRP.DB.audit(actorOf(src), 'character.details', tostring(row.id), {})
    notify(src, 'Citizen details saved.', 'success')
    return true
end

ACTIONS.saveId = function(src, characterId, data, row)
    local theme = nil
    for _, entry in ipairs(CZ.idThemes) do
        if entry.id == data.theme then theme = entry.id end
    end
    if not theme then return fail(src, 'Pick one of the ID card designs.') end
    local stamp = now()
    MySQL.prepare.await([[
        INSERT INTO character_profiles(character_id,id_theme,show_address,show_phone,show_licenses,updated_at) VALUES(?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE id_theme=VALUES(id_theme),show_address=VALUES(show_address),show_phone=VALUES(show_phone),
          show_licenses=VALUES(show_licenses),updated_at=VALUES(updated_at)
    ]], { row.id, theme, data.showAddress == true, data.showPhone == true, data.showLicenses ~= false, stamp })
    notify(src, 'ID card updated.', 'success')
    return true
end

ACTIONS.licenseApply = function(src, characterId, data, row)
    local license = licenseConfig(clean(data.license, 16))
    if not license then return false end
    local existing = MySQL.single.await('SELECT status FROM mdt_licenses WHERE character_id=? AND kind=?', { row.id, license.id })
    if existing then
        if existing.status == 'valid' then return fail(src, ('You already hold a %s.'):format(license.label:lower())) end
        return fail(src, ('Your %s is %s. Speak to a licensing officer.'):format(license.label:lower(), existing.status))
    end
    local stamp = now()
    MySQL.insert.await('INSERT INTO mdt_licenses(character_id,kind,status,points,updated_by,updated_at,issued_at,show_on_id) VALUES(?,?,?,0,?,?,?,TRUE)', {
        row.id, license.id, 'valid', 'Licensing office', stamp, stamp,
    })
    FBRP.DB.audit(actorOf(src), 'character.license_issue', tostring(row.id), { license=license.id, status='valid' })
    notify(src, ('Your %s was issued.'):format(license.label:lower()), 'success')
    return true
end

-- Only licenses in good standing can be handed back: a suspension or
-- revocation is not something a citizen can wipe themselves.
ACTIONS.licenseSurrender = function(src, characterId, data, row)
    local license = licenseConfig(clean(data.license, 16))
    if not license then return false end
    local existing = MySQL.single.await('SELECT status FROM mdt_licenses WHERE character_id=? AND kind=?', { row.id, license.id })
    if not existing then return false end
    if existing.status ~= 'valid' and existing.status ~= 'pending' then
        return fail(src, ('Your %s is %s and cannot be surrendered.'):format(license.label:lower(), existing.status))
    end
    MySQL.update.await('DELETE FROM mdt_licenses WHERE character_id=? AND kind=?', { row.id, license.id })
    FBRP.DB.audit(actorOf(src), 'character.license_surrender', tostring(row.id), { license=license.id })
    notify(src, existing.status == 'pending' and 'Application withdrawn.' or ('%s surrendered.'):format(license.label), 'success')
    return true
end

ACTIONS.licenseRestriction = function(src, characterId, data, row)
    local license = licenseConfig(clean(data.license, 16))
    if not license then return false end
    local restriction = nil
    if clean(data.restriction, 40) ~= '' then
        restriction = pick(CZ.restrictions, data.restriction)
        if not restriction then return fail(src, 'Pick a restriction from the list.') end
    end
    local existing = MySQL.single.await('SELECT status FROM mdt_licenses WHERE character_id=? AND kind=?', { row.id, license.id })
    if not existing or existing.status ~= 'valid' then return fail(src, 'Only a valid license can carry a restriction.') end
    MySQL.update.await('UPDATE mdt_licenses SET restriction=?,updated_at=? WHERE character_id=? AND kind=?', { restriction, now(), row.id, license.id })
    notify(src, restriction and ('Restriction set: %s.'):format(restriction) or 'Restriction removed.', 'success')
    return true
end

ACTIONS.licenseVisible = function(src, characterId, data, row)
    local license = licenseConfig(clean(data.license, 16))
    if not license then return false end
    MySQL.update.await('UPDATE mdt_licenses SET show_on_id=? WHERE character_id=? AND kind=?', { data.visible == true, row.id, license.id })
    return true
end

ACTIONS.vehicleStolen = function(src, characterId, data)
    local J = FBRP.Justice
    if not J.SetStolen then return false end
    local ok, message = J.SetStolen(src, data.plate, data.stolen == true)
    notify(src, message, ok and 'success' or 'error')
    return ok
end

RegisterNetEvent('fbrp:citizen:request', function()
    local src = source
    local characterId = characterOf(src)
    if not characterId then return notify(src, 'Pick a character first.', 'error') end
    local data = payload(src, characterId)
    if data then TriggerClientEvent('fbrp:citizen:open', src, data) end
end)

RegisterNetEvent('fbrp:citizen:action', function(kind, data)
    local src = source
    local characterId = characterOf(src)
    if not characterId or not sessions[src] then return end
    local stamp = GetGameTimer()
    if lastAction[src] and stamp - lastAction[src] < 300 then return end
    lastAction[src] = stamp
    if type(data) ~= 'table' then data = {} end
    local handler = ACTIONS[clean(kind, 24)]
    if not handler then return end
    local row = charRow(characterId)
    if not row then return end
    -- A player can only ever edit the character they are logged in as.
    local license
    for _, value in ipairs(GetPlayerIdentifiers(src)) do
        if value:sub(1, 8) == 'license:' then license = value break end
    end
    if row.owner_license ~= license then return end
    handler(src, characterId, data, row)
    push(src, characterId)
end)

AddEventHandler('playerDropped', function() lastAction[source] = nil end)

-- sky_phone issues every character a persistent number when it is selected.
-- Mirror it onto the citizen record so the ID card and MDT phone lookup match.
AddEventHandler('fbrp:phone:number', function(source, characterId, number)
    if GetInvokingResource() ~= 'sky_phone' then return end
    source, characterId = tonumber(source), tonumber(characterId)
    local digits = tostring(number or ''):gsub('%D', '')
    if not source or not characterId or characterOf(source) ~= characterId or #digits < 7 or #digits > 11 then return end
    local phone = formatPhone(digits)
    MySQL.prepare.await([[
        INSERT INTO character_profiles(character_id,phone,phone_from_device,updated_at) VALUES(?,?,TRUE,?)
        ON DUPLICATE KEY UPDATE phone=VALUES(phone),phone_from_device=TRUE,updated_at=VALUES(updated_at)
    ]], { characterId, phone, now() })
end)
