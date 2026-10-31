Jaxtti = Jaxtti or {}
Jaxtti.version = GetResourceMetadata(GetCurrentResourceName(), 'version', 0) or '?'
Jaxtti.isServer = IsDuplicityVersion()

local function started(res)
    return type(res) == 'string' and GetResourceState(res) == 'started'
end
Jaxtti.started = started

function Jaxtti.debug(...)
    if JaxttiConfig.Debug then print('^5[jaxtti_core]^0', ...) end
end

local detected = nil
function Jaxtti.framework()
    if detected then return detected end
    local want = JaxttiConfig.Framework or 'auto'
    if want ~= 'auto' then
        detected = want
        return detected
    end
    if started('qbx_core') then
        detected = 'qbx'
    elseif started('qb-core') then
        detected = 'qb'
    elseif started('es_extended') then
        detected = 'esx'
    else
        local starting = GetResourceState('qbx_core') == 'starting' or GetResourceState('qb-core') == 'starting' or GetResourceState('es_extended') == 'starting'
        if starting then return 'standalone' end
        detected = 'standalone'
    end
    return detected
end

AddEventHandler('onResourceStart', function(res)
    if res == 'qbx_core' or res == 'qb-core' or res == 'es_extended' then
        if (JaxttiConfig.Framework or 'auto') == 'auto' then detected = nil end
    end
end)

function Jaxtti.integration(key)
    local name = JaxttiConfig.Integrations[key]
    if not name then return nil end
    return name
end

function Jaxtti.running(key)
    local name = Jaxtti.integration(key)
    return started(name) and name or nil
end

exports('GetFramework', Jaxtti.framework)
exports('GetIntegration', Jaxtti.integration)
exports('IsIntegrationRunning', function(key) return Jaxtti.running(key) ~= nil end)
exports('GetConfig', function() return JaxttiConfig end)
exports('GetServerName', function() return JaxttiConfig.ServerName end)
exports('GetShortName', function() return JaxttiConfig.ShortName end)
exports('LegacyNames', function() return JaxttiConfig.LegacyNames == true end)
