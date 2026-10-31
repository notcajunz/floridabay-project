local RES = GetCurrentResourceName()

local function moduleList()
    local out = {}
    for _, m in ipairs(JaxttiConfig.Modules or {}) do
        local state = GetResourceState(m.name)
        out[#out + 1] = {
            name = m.name,
            enabled = m.enabled ~= false,
            state = state,
            version = state ~= 'missing' and GetResourceMetadata(m.name, 'version', 0) or nil,
        }
    end
    return out
end

local function startModules()
    for _, m in ipairs(JaxttiConfig.Modules or {}) do
        if m.enabled ~= false then
            local state = GetResourceState(m.name)
            if state == 'missing' then
                print(('^3[jaxtti_core] %s is enabled in config.lua but not installed - skipped.^0'):format(m.name))
            elseif state == 'stopped' or state == 'uninitialized' then
                if not StartResource(m.name) then
                    print(('^1[jaxtti_core] could not start %s. Add `ensure %s` to server.cfg instead.^0'):format(m.name, m.name))
                end
            end
        end
    end
end

CreateThread(function()
    Wait(0)
    if JaxttiConfig.AutoStart then startModules() end

    Wait(2000)
    local running = 0
    for _, m in ipairs(moduleList()) do
        if m.state == 'started' then running = running + 1 end
    end
    print(('^5[jaxtti_core]^0 v%s · framework: ^2%s^0 · %d module(s) running. Type ^3jaxtti^0 in the console for details.')
        :format(Jaxtti.version, Jaxtti.framework(), running))
end)

RegisterCommand('jaxtti', function(src)
    if src ~= 0 and not IsPlayerAceAllowed(src, 'command.jaxtti') then return end
    local lines = { ('jaxtti_core v%s · %s · framework: %s'):format(Jaxtti.version, JaxttiConfig.ServerName, Jaxtti.framework()) }
    for _, m in ipairs(moduleList()) do
        local color = m.state == 'started' and '^2' or (m.enabled and '^1' or '^8')
        lines[#lines + 1] = ('  %s%-18s^0 %-10s %s%s'):format(color, m.name, m.state, m.version and ('v' .. m.version) or '',
            m.enabled and '' or ' (disabled)')
    end
    for key, name in pairs(JaxttiConfig.Integrations) do
        if name then
            lines[#lines + 1] = ('  integration %-14s %s (%s)'):format(key, name, GetResourceState(name))
        end
    end
    if src == 0 then
        print(table.concat(lines, '\n'))
    else
        TriggerClientEvent('chat:addMessage', src, { args = { 'jaxtti', table.concat(lines, '\n'):gsub('%^%d', '') } })
    end
end, true)

exports('GetModules', moduleList)
exports('IsModuleRunning', function(name) return GetResourceState(name) == 'started' end)

AddEventHandler('onResourceStop', function(res)
    if res == RES then
        print('^3[jaxtti_core] stopped - jaxtti_ modules that depend on it are stopping too.^0')
    end
end)
