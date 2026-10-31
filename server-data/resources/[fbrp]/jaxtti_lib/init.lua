if not _VERSION:find('5.4') then
    error('^1jaxtti_lib requires Lua 5.4. Add lua54 \'yes\' to your fxmanifest.lua^0', 2)
end

local JAXTTI_LIB = 'jaxtti_lib'
local DESIGN = 'jaxtti_designlibrary'
local currentResource = GetCurrentResourceName()

if lib and lib.name == JAXTTI_LIB then return end

local state = GetResourceState(JAXTTI_LIB)
if currentResource ~= JAXTTI_LIB and state ~= 'started' and state ~= 'starting' then
    error(('^1jaxtti_lib must be started before %s (state: %s). Add `ensure jaxtti_lib` above it in server.cfg^0'):format(currentResource, state), 2)
end

local context = IsDuplicityVersion() and 'server' or 'client'
local LoadResourceFile = LoadResourceFile
local noop = function() end

local function loadModule(self, name)
    local dir = ('imports/%s'):format(name)
    local file = ('%s/%s.lua'):format(dir, context)
    local chunk = LoadResourceFile(JAXTTI_LIB, file)

    if not chunk then
        file = ('%s/shared.lua'):format(dir)
        chunk = LoadResourceFile(JAXTTI_LIB, file)
    end
    if not chunk then return nil end

    local fn, err = load(chunk, ('@@jaxtti_lib/%s'):format(file))
    if not fn or err then
        error(('\n^1jaxtti_lib: failed to load module "%s"\n%s^0'):format(name, err), 3)
    end

    local result = fn()
    rawset(self, name, result or noop)
    return rawget(self, name)
end

local uiExports = context == 'client' and {
    notify = 'notify',
    clearNotifications = 'clearNotifications',
    registerContext = 'registerContext',
    showContext = 'showContext',
    hideContext = 'hideContext',
    getOpenContextMenu = 'getOpenContext',
    inputDialog = 'inputDialog',
    closeInputDialog = 'closeInputDialog',
    alertDialog = 'alertDialog',
    closeAlertDialog = 'closeAlertDialog',
    progressBar = 'progressBar',
    progressCircle = 'progressCircle',
    cancelProgress = 'cancelProgress',
    progressActive = 'progressActive',
    showTextUI = 'showTextUI',
    hideTextUI = 'hideTextUI',
    isTextUIOpen = 'isTextUIOpen',
    skillCheck = 'skillCheck',
    skillCheckActive = 'skillCheckActive',
    cancelSkillCheck = 'cancelSkillCheck',
    setTheme = 'setTheme',
} or {
    notify = 'notify',
}

local OX = 'ox_lib'
local TEXTUI = 'jaxtti_textui'
local oxNames = { getOpenContext = 'getOpenContextMenu' }

local fallback = {}

if context == 'client' then
    local typeColors = { error = 6, success = 184, warning = 190, info = 140, inform = 140 }

    function fallback.notify(data)
        if type(data) ~= 'table' then data = { description = tostring(data) } end
        local text = data.description or ''
        if data.title and data.title ~= '' then
            text = text ~= '' and ('~h~%s~h~~n~%s'):format(data.title, text) or data.title
        end
        text = text:gsub('%*%*', '')
        ThefeedSetNextPostBackgroundColor(typeColors[data.type] or 140)
        BeginTextCommandThefeedPost('STRING')
        AddTextComponentSubstringPlayerName(text)
        EndTextCommandThefeedPostTicker(false, true)
    end

    function fallback.alertDialog(data)
        if type(data) == 'table' then
            fallback.notify({ title = data.header, description = data.content, type = 'warning' })
        end
        return 'confirm'
    end

    local function textui() return GetResourceState(TEXTUI) == 'started' and exports[TEXTUI] or nil end

    function fallback.showTextUI(text, options)
        local ui = textui()
        if not ui then return end
        if type(options) == 'table' and options.key then text = ('[%s] %s'):format(options.key, text) end
        ui:Open(text, 'lightblue', type(options) == 'table' and options.position == 'left-center' and 'left' or 'right')
    end

    function fallback.hideTextUI()
        local ui = textui()
        if ui then ui:Close() end
    end

    function fallback.isTextUIOpen()
        local ui = textui()
        return ui ~= nil and ui:IsOpen() == true
    end

    local progress = false
    function fallback.progressBar(data)
        if progress then return false end
        progress = true
        local untilTime = GetGameTimer() + (type(data) == 'table' and tonumber(data.duration) or 0)
        if type(data) == 'table' and data.label then fallback.notify({ description = data.label }) end
        while progress and GetGameTimer() < untilTime do Wait(0) end
        local done = progress
        progress = false
        return done
    end
    fallback.progressCircle = fallback.progressBar
    function fallback.cancelProgress() progress = false end
    function fallback.progressActive() return progress end
else
    function fallback.notify(target, data)
        return TriggerClientEvent('jaxtti_lib:notify', target, data)
    end
end

local function designExport(name)
    return function(...)
        if GetResourceState(DESIGN) == 'started' then
            local res = exports[DESIGN]
            if name == 'notify' then
                local data = context == 'server' and select(2, ...) or ...
                if type(data) == 'table' and data.type == 'inform' then data.type = 'info' end
            end
            return res[name](res, ...)
        end

        if GetResourceState(OX) == 'started' then
            if context == 'server' and name == 'notify' then
                local target, data = ...
                if type(data) == 'table' and data.type == 'info' then data.type = 'inform' end
                return TriggerClientEvent('ox_lib:notify', target, data)
            end
            local res = exports[OX]
            local fn = oxNames[name] or name
            if name == 'notify' then
                local data = ...
                if type(data) == 'table' and data.type == 'info' then data.type = 'inform' end
            end
            local args = table.pack(...)
            local out = table.pack(pcall(function() return res[fn](res, table.unpack(args, 1, args.n)) end))
            if not out[1] then return nil end
            return table.unpack(out, 2, out.n)
        end

        if fallback[name] then return fallback[name](...) end

        if lib.print then
            lib.print.verbose(('lib.%s needs jaxtti_designlibrary or ox_lib for its full UI.'):format(name))
        end
    end
end

local menuNames = context == 'client' and {
    registerMenu = 'register',
    showMenu = 'show',
    hideMenu = 'hide',
    setMenuOptions = 'setOptions',
    getOpenMenu = 'getOpen',
} or {}

local function resolve(self, name)
    local value = rawget(self, name)
    if value then return value end

    if menuNames[name] then
        local menu = self.menu
        value = menu and menu[menuNames[name]]
        if value then
            rawset(self, name, value)
            return value
        end
    end

    if uiExports[name] then
        value = designExport(uiExports[name])
        rawset(self, name, value)
        return value
    end

    rawset(self, name, noop)
    value = loadModule(self, name)
    if value then return value end
    rawset(self, name, nil)

    local fn = function(...)
        local res = exports[JAXTTI_LIB]
        return res[name](res, ...)
    end
    return fn
end

lib = setmetatable({
    name = JAXTTI_LIB,
    context = context,
}, {
    __index = resolve,
    __call = resolve,
})

local cacheEvents = {}

local function watchCache(self, key)
    if cacheEvents[key] then return end
    cacheEvents[key] = true
    local function store(value) rawset(self, key, value) end
    AddEventHandler(('jaxtti_lib:cache:%s'):format(key), store)
    AddEventHandler(('ox_lib:cache:%s'):format(key), store)
end

cache = setmetatable({
    resource = currentResource,
    game = 'gta5',
}, {
    __index = function(self, key)
        if type(key) ~= 'string' then return nil end
        watchCache(self, key)
        return nil
    end,
})

function cache.set(self, key, value)
    local old = rawget(self, key)
    if old == value then return end
    watchCache(self, key)
    rawset(self, key, value)
    TriggerEvent(('jaxtti_lib:cache:%s'):format(key), value, old)
end

if context == 'client' then
    cache.playerId = PlayerId()
    cache.serverId = GetPlayerServerId(cache.playerId)

    local keys = { 'ped', 'vehicle', 'seat', 'weapon', 'mounted' }
    for _, key in ipairs(keys) do
        watchCache(cache, key)
    end

    if currentResource ~= JAXTTI_LIB then
        local ok, current = pcall(function() return exports[JAXTTI_LIB]:getCache() end)
        if ok and type(current) == 'table' then
            for k, v in pairs(current) do
                if rawget(cache, k) == nil then rawset(cache, k, v) end
            end
        end
    end

    if rawget(cache, 'ped') == nil then rawset(cache, 'ped', PlayerPedId()) end
end

function lib.onCache(key, cb)
    watchCache(cache, key)
    AddEventHandler(('jaxtti_lib:cache:%s'):format(key), cb)
    AddEventHandler(('ox_lib:cache:%s'):format(key), cb)
end

do
    local loaded = {}
    local nativeRequire = require

    function require(name)
        if type(name) ~= 'string' then error('require: module name must be a string', 2) end
        if loaded[name] ~= nil then return loaded[name] end

        local resource, path = name:match('^@([^%.]+)%.(.+)$')
        if not resource then resource, path = currentResource, name end
        local file = path:gsub('%.', '/') .. '.lua'

        local chunk = LoadResourceFile(resource, file)
        if not chunk then
            if nativeRequire and not name:find('^@') then
                local ok, result = pcall(nativeRequire, name)
                if ok then loaded[name] = result return result end
            end
            error(("require: module '%s' not found (%s/%s)"):format(name, resource, file), 2)
        end

        local fn, err = load(chunk, ('@@%s/%s'):format(resource, file))
        if not fn then error(("require: error loading '%s': %s"):format(name, err), 2) end
        local result = fn()
        if result == nil then result = true end
        loaded[name] = result
        return result
    end

    lib.require = require
end
