-- Share codes for saved vMenu multiplayer characters (outfits). The patched vMenu client
-- (patches/vmenu-3.8.68-fbrp) sends the saved character here to get a code and asks for one back to
-- save its own copy. Only the saved JSON is stored, never an identifier of the player who imports it.

local MAX_PAYLOAD = 60000
local MAX_CODES_PER_PLAYER = 20
local CREATE_COOLDOWN_MS = 15000
local REDEEM_WINDOW_MS = 60000
local REDEEM_PER_WINDOW = 8
local BAD_CODES_BEFORE_LOCK = 5
local LOCK_MS = 10 * 60000
local MALE_MODEL, FEMALE_MODEL = 1885233650, 2627665880
local ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

local lastCreate, redeemLog, badCodes = {}, {}, {}

local function clean(value, max)
    return tostring(value or ''):gsub('[%c]', ' '):gsub('^%s+', ''):gsub('%s+$', ''):sub(1, max or 80)
end

local function identifier(source, prefix)
    for _, value in ipairs(GetPlayerIdentifiers(source)) do
        if value:sub(1, #prefix) == prefix then return value:sub(#prefix + 1) end
    end
end

local function notify(source, description, kind)
    TriggerClientEvent('ox_lib:notify', source, { title = 'Outfit share', description = description, type = kind or 'info' })
end

local function newCode()
    local out = {}
    for index = 1, 8 do
        local pick = math.random(1, #ALPHABET)
        out[index] = ALPHABET:sub(pick, pick)
    end
    local raw = table.concat(out)
    return raw:sub(1, 4) .. '-' .. raw:sub(5, 8)
end

-- Players may type the code with the prefix, lower case, spaces or no dash.
local function normalizeCode(value)
    local raw = tostring(value or ''):upper():gsub('[^A-Z0-9]', '')
    if raw:sub(1, 4) == 'FBRP' and #raw == 12 then raw = raw:sub(5) end
    if #raw ~= 8 then return nil end
    for index = 1, #raw do
        if not ALPHABET:find(raw:sub(index, index), 1, true) then return nil end
    end
    return raw:sub(1, 4) .. '-' .. raw:sub(5, 8)
end

-- A saved vMenu character is a Newtonsoft dump of MultiplayerPedData. The vMenu client parses it again
-- before saving, so this only keeps junk and oversized rows out of the table: it must be a JSON object
-- for one of the two freemode models. Nested sections are not required by name because vMenu builds
-- differ in which ones they write. Returns the decoded character, or nil and the reason.
local function validCharacter(payload)
    if type(payload) ~= 'string' then return nil, 'payload is not text' end
    if #payload < 20 or #payload > MAX_PAYLOAD then return nil, ('payload is %d bytes'):format(#payload) end
    local ok, decoded = pcall(json.decode, payload)
    if not ok or type(decoded) ~= 'table' then return nil, 'payload is not JSON' end
    local model = tonumber(decoded.ModelHash)
    if model ~= MALE_MODEL and model ~= FEMALE_MODEL then return nil, ('unexpected ModelHash %s'):format(tostring(decoded.ModelHash)) end
    if decoded.IsMale ~= nil and decoded.IsMale ~= (model == MALE_MODEL) then return nil, 'IsMale does not match ModelHash' end
    return decoded
end

MySQL.ready(function()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS outfit_shares (
            code VARCHAR(9) NOT NULL PRIMARY KEY,
            owner_license VARCHAR(100) NOT NULL,
            owner_discord VARCHAR(32) NULL,
            owner_name VARCHAR(80) NOT NULL,
            character_name VARCHAR(40) NOT NULL,
            payload MEDIUMTEXT NOT NULL,
            copies INT UNSIGNED NOT NULL DEFAULT 0,
            created_at BIGINT NOT NULL,
            KEY idx_outfit_shares_owner (owner_license, created_at)
        ) ENGINE=InnoDB
    ]])
end)

local function mayUseVmenuAppearance(source)
    return IsPlayerAceAllowed(source, 'vMenu.PlayerAppearance.Menu') or IsPlayerAceAllowed(source, 'vMenu.PlayerAppearance.All')
end

RegisterNetEvent('fbrp:outfitshare:create', function(name, payload)
    local src = source
    local license = identifier(src, 'license:')
    if not license then return end
    if not mayUseVmenuAppearance(src) then return notify(src, 'You are not allowed to share characters.', 'error') end
    local now = GetGameTimer()
    if (lastCreate[src] or -CREATE_COOLDOWN_MS) + CREATE_COOLDOWN_MS > now then
        return notify(src, 'Wait a few seconds before creating another share code.', 'error')
    end
    local decoded, reason = validCharacter(payload)
    if not decoded then
        print(('[fbrp_core] outfit share from %s (%s) rejected: %s'):format(src, license, tostring(reason)))
        return notify(src, 'That character could not be shared because its data is not valid.', 'error')
    end
    lastCreate[src] = now
    local owned = tonumber(MySQL.scalar.await('SELECT COUNT(*) FROM outfit_shares WHERE owner_license=?', { license })) or 0
    if owned >= MAX_CODES_PER_PLAYER then
        return notify(src, ('You already have %d share codes. Delete some with /outfitcodes first.'):format(MAX_CODES_PER_PLAYER), 'error')
    end
    local label = clean(name, 40)
    if label == '' then label = 'Shared Character' end
    for _ = 1, 8 do
        local code = newCode()
        local inserted = MySQL.update.await(
            'INSERT IGNORE INTO outfit_shares(code,owner_license,owner_discord,owner_name,character_name,payload,created_at) VALUES(?,?,?,?,?,?,?)',
            { code, license, identifier(src, 'discord:'), clean(GetPlayerName(src), 80), label, payload, os.time() * 1000 }
        )
        if (tonumber(inserted) or 0) > 0 then
            FBRP.DB.audit(identifier(src, 'discord:') or license, 'outfit.share', code, { character = label })
            return TriggerClientEvent('fbrp:outfitshare:created', src, code, label)
        end
    end
    notify(src, 'Could not create a share code. Try again in a moment.', 'error')
end)

RegisterNetEvent('fbrp:outfitshare:redeem', function(rawCode)
    local src = source
    if not mayUseVmenuAppearance(src) then return notify(src, 'You are not allowed to import characters.', 'error') end
    local now = GetGameTimer()
    local state = badCodes[src]
    if state and state.lockedUntil and state.lockedUntil > now then
        return notify(src, 'Too many wrong share codes. Try again in a few minutes.', 'error')
    end
    local log = redeemLog[src] or {}
    local kept = {}
    for _, stamp in ipairs(log) do if stamp + REDEEM_WINDOW_MS > now then kept[#kept + 1] = stamp end end
    if #kept >= REDEEM_PER_WINDOW then
        redeemLog[src] = kept
        return notify(src, 'Slow down and try again in a minute.', 'error')
    end
    kept[#kept + 1] = now
    redeemLog[src] = kept

    local code = normalizeCode(rawCode)
    local row = code and MySQL.single.await('SELECT code,character_name,payload FROM outfit_shares WHERE code=? LIMIT 1', { code }) or nil
    if not row then
        local bad = badCodes[src] or { count = 0 }
        bad.count = bad.count + 1
        if bad.count >= BAD_CODES_BEFORE_LOCK then bad.lockedUntil = now + LOCK_MS bad.count = 0 end
        badCodes[src] = bad
        return notify(src, 'That share code was not found. Check it and try again.', 'error')
    end
    badCodes[src] = nil
    MySQL.update('UPDATE outfit_shares SET copies=copies+1 WHERE code=?', { row.code })
    FBRP.DB.audit(identifier(src, 'discord:') or identifier(src, 'license:') or tostring(src), 'outfit.redeem', row.code, {})
    TriggerClientEvent('fbrp:outfitshare:import', src, row.character_name, row.payload)
end)

RegisterNetEvent('fbrp:outfitshare:list', function()
    local src = source
    local license = identifier(src, 'license:')
    if not license then return end
    local rows = MySQL.query.await(
        'SELECT code,character_name,copies,created_at FROM outfit_shares WHERE owner_license=? ORDER BY created_at DESC LIMIT ?',
        { license, MAX_CODES_PER_PLAYER }
    ) or {}
    TriggerClientEvent('fbrp:outfitshare:codes', src, rows)
end)

RegisterNetEvent('fbrp:outfitshare:delete', function(rawCode)
    local src = source
    local license = identifier(src, 'license:')
    local code = normalizeCode(rawCode)
    if not license or not code then return end
    local removed = MySQL.update.await('DELETE FROM outfit_shares WHERE code=? AND owner_license=?', { code, license })
    if (tonumber(removed) or 0) > 0 then
        FBRP.DB.audit(identifier(src, 'discord:') or license, 'outfit.unshare', code, {})
        notify(src, ('Share code %s deleted.'):format(code), 'success')
    else
        notify(src, 'That share code is not yours or no longer exists.', 'error')
    end
end)

AddEventHandler('playerDropped', function()
    local src = source
    lastCreate[src], redeemLog[src], badCodes[src] = nil, nil, nil
end)
