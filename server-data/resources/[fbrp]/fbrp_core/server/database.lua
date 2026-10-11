FBRP.DB = {}

local migrationFiles = {
    'migrations/001_fbrp.sql',
    'migrations/002_control_plane.sql',
    'migrations/003_existing_log_bindings.sql',
    'migrations/004_tickets_characters.sql',
    'migrations/005_ascent_global_sync.sql',
    'migrations/006_ticket_config.sql',
    'migrations/007_staff_ranks_global.sql',
    'migrations/008_network_server_types.sql',
    'migrations/009_role_authoritative_ace.sql',
    'migrations/010_radio_channels.sql',
    'migrations/018_justice_medical_life.sql'
}

local function splitSql(contents)
    local statements = {}
    local current = {}
    local quote = nil
    local escaped = false

    for index = 1, #contents do
        local char = contents:sub(index, index)
        if escaped then
            current[#current + 1] = char
            escaped = false
        elseif char == '\\' and quote then
            current[#current + 1] = char
            escaped = true
        elseif quote then
            current[#current + 1] = char
            if char == quote then quote = nil end
        elseif char == "'" or char == '"' or char == '`' then
            current[#current + 1] = char
            quote = char
        elseif char == ';' then
            local statement = table.concat(current):gsub('^%s+', ''):gsub('%s+$', '')
            if statement ~= '' then statements[#statements + 1] = statement end
            current = {}
        else
            current[#current + 1] = char
        end
    end

    local tail = table.concat(current):gsub('^%s+', ''):gsub('%s+$', '')
    if tail ~= '' then statements[#statements + 1] = tail end
    return statements
end

function FBRP.DB.migrate()
    MySQL.query.await([[CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(100) PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB]])

    for _, name in ipairs(migrationFiles) do
        local installed = MySQL.scalar.await('SELECT 1 FROM schema_migrations WHERE name = ? LIMIT 1', { name })
        if not installed then
            local contents = LoadResourceFile(GetCurrentResourceName(), name)
            assert(contents, ('Missing migration %s'):format(name))
            for _, statement in ipairs(splitSql(contents)) do
                MySQL.query.await(statement)
            end
            MySQL.insert.await('INSERT INTO schema_migrations(name) VALUES(?)', { name })
            print(('[FBRP] Applied MariaDB migration %s'):format(name))
        end
    end
end

function FBRP.DB.audit(actor, action, target, payload)
    MySQL.insert('INSERT INTO audit_log(actor_id,action,target_id,payload,created_at) VALUES(?,?,?,?,?)', {
        tostring(actor or 'system'),
        tostring(action),
        target and tostring(target) or nil,
        json.encode(payload or {}),
        os.time() * 1000
    })
end

function FBRP.DB.state(key, fallback)
    local raw = MySQL.scalar.await('SELECT value FROM server_state WHERE `key` = ?', { key })
    if not raw then return fallback end
    if type(raw) ~= 'string' then return raw end
    local ok, value = pcall(json.decode, raw)
    return ok and value or fallback
end

function FBRP.DB.setState(key, value, actor)
    MySQL.prepare.await([[
        INSERT INTO server_state(`key`,value,updated_by,updated_at) VALUES(?,?,?,?)
        ON DUPLICATE KEY UPDATE value=VALUES(value),updated_by=VALUES(updated_by),updated_at=VALUES(updated_at)
    ]], { key, json.encode(value), tostring(actor or 'system'), os.time() * 1000 })
end
