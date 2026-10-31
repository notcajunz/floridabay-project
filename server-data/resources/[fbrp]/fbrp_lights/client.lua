-- FBRP Lights | Made by Saif for Florida Bay Roleplay (FBRP)

local SETTINGS_FILE = 'visualsettings.dat'
local KVP_KEY       = 'fbrp_lights_levels'
local SKIP          = { ['weather.CycleDuration'] = true }
local SET_VISUAL    = GetHashKey('SET_VISUAL_SETTING_FLOAT') & 0xFFFFFFFF

-- Menu rows: label, and which visualsettings entries each row controls.
-- Only the "on" values are scaled, the "off" values stay untouched.
local ROWS = {
    { id = 'emergency', label = 'EMERGENCY LIGHTS', match = { '^car%.defaultlight%..-%.emissive%.on$' } },
    { id = 'head',      label = 'HEADLIGHTS',       match = { '^car%.headlight%..-%.emissive%.on$' } },
    { id = 'brake',     label = 'BRAKE LIGHTS',     match = { '^car%.brakelight%..-%.emissive%.on$', '^car%.middlebrakelight%..-%.emissive%.on$' } },
    { id = 'tail',      label = 'TAIL LIGHTS',      match = { '^car%.taillight%..-%.emissive%.on$' } },
    { id = 'indicator', label = 'INDICATORS',       match = { '^car%.indicator%..-%.emissive%.on$' } },
    { id = 'reverse',   label = 'REVERSE LIGHTS',   match = { '^car%.reversinglight%..-%.emissive%.on$' } },
    { id = 'extra',     label = 'EXTRA LIGHTS',     match = { '^car%.extralight%..-%.emissive%.on$' } },
    { id = 'overall',   label = 'OVERALL GLOW',     match = { '^car%.emissiveMultiplier$' } },
}

local STEP, MIN, MAX = 10, 0, 200 -- percent, 100 = the server default

local base     = {} -- [name] = default value from visualsettings.dat
local applied  = {} -- [rowId] = percent currently active
local pending  = {} -- [rowId] = percent being edited in the menu
local menuOpen = false
local selected = 1

local function loadBase()
    local contents = LoadResourceFile(GetCurrentResourceName(), SETTINGS_FILE)
    if not contents then
        print(('[FBRP Lights] Could not load %s'):format(SETTINGS_FILE))
        return
    end
    for line in contents:gmatch('[^\r\n]+') do
        line = line:match('^%s*(.-)%s*$')
        if line ~= '' and not line:find('^#') and not line:find('^//') then
            local name, value = line:match('^(%S+)%s+(%S+)')
            value = tonumber(value)
            if name and value and not SKIP[name] then
                base[name] = value
            end
        end
    end
end

local function applyLevels(levels)
    for _, row in ipairs(ROWS) do
        local pct = levels[row.id] or 100
        for name, value in pairs(base) do
            for _, pattern in ipairs(row.match) do
                if name:find(pattern) then
                    Citizen.InvokeNative(SET_VISUAL, name, (value * pct / 100) + 0.0)
                end
            end
        end
    end
    -- "off" values and anything not controlled by a row stay at default
    for name, value in pairs(base) do
        local controlled = false
        for _, row in ipairs(ROWS) do
            for _, pattern in ipairs(row.match) do
                if name:find(pattern) then controlled = true end
            end
        end
        if not controlled then
            Citizen.InvokeNative(SET_VISUAL, name, value + 0.0)
        end
    end
end

local function loadSaved()
    for _, row in ipairs(ROWS) do applied[row.id] = 100 end
    local raw = GetResourceKvpString(KVP_KEY)
    if raw then
        local ok, data = pcall(json.decode, raw)
        if ok and type(data) == 'table' then
            for _, row in ipairs(ROWS) do
                local v = tonumber(data[row.id])
                if v then applied[row.id] = math.max(MIN, math.min(MAX, v)) end
            end
        end
    end
end

local function saveLevels()
    SetResourceKvp(KVP_KEY, json.encode(applied))
end

local function copy(t)
    local c = {}
    for k, v in pairs(t) do c[k] = v end
    return c
end

local function pushMenu()
    local rows = {}
    for i, row in ipairs(ROWS) do
        rows[i] = { label = row.label, value = pending[row.id], dirty = pending[row.id] ~= applied[row.id] }
    end
    SendNUIMessage({ action = 'update', rows = rows, selected = selected })
end

local function openMenu()
    pending  = copy(applied)
    selected = 1
    menuOpen = true
    SendNUIMessage({ action = 'open' })
    pushMenu()

    CreateThread(function()
        while menuOpen do
            Wait(0)
            for _, c in ipairs({ 172, 173, 174, 175, 191, 177, 45 }) do
                DisableControlAction(0, c, true)
            end

            if IsDisabledControlJustPressed(0, 172) then
                selected = selected - 1
                if selected < 1 then selected = #ROWS end
                pushMenu()
            elseif IsDisabledControlJustPressed(0, 173) then
                selected = selected + 1
                if selected > #ROWS then selected = 1 end
                pushMenu()
            elseif IsDisabledControlJustPressed(0, 174) then
                local id = ROWS[selected].id
                pending[id] = math.max(MIN, pending[id] - STEP)
                pushMenu()
            elseif IsDisabledControlJustPressed(0, 175) then
                local id = ROWS[selected].id
                pending[id] = math.min(MAX, pending[id] + STEP)
                pushMenu()
            elseif IsDisabledControlJustPressed(0, 45) then -- R: reset to default
                for _, row in ipairs(ROWS) do pending[row.id] = 100 end
                pushMenu()
            elseif IsDisabledControlJustPressed(0, 191) then -- ENTER: apply
                applied = copy(pending)
                applyLevels(applied)
                saveLevels()
                SendNUIMessage({ action = 'applied' })
            elseif IsDisabledControlJustPressed(0, 177) then -- BACKSPACE: close
                menuOpen = false
                SendNUIMessage({ action = 'close' })
            end
        end
    end)
end

RegisterCommand('lightsmenu', function()
    if menuOpen then
        menuOpen = false
        SendNUIMessage({ action = 'close' })
    else
        openMenu()
    end
end, false)

CreateThread(function()
    loadBase()
    loadSaved()
    applyLevels(applied)
end)

-- Re-apply after spawning in case the game reset visual settings
AddEventHandler('playerSpawned', function()
    applyLevels(applied)
end)
