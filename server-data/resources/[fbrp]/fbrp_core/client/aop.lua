-- /aop dropdown (ox_lib input dialog) + chat suggestions for /aop, /cooldown, /onhold

RegisterNetEvent('fbrp:aop:pick', function(presets, current)
    local options = {}
    for _, name in ipairs(type(presets) == 'table' and presets or {}) do
        options[#options + 1] = { value = name, label = name }
    end
    if #options == 0 then return end

    local input = lib.inputDialog('Area of Play', {
        {
            type = 'select',
            label = 'Choose the area of play',
            description = 'Currently: ' .. tostring(current or 'Statewide'),
            options = options,
            default = current,
            required = true,
            searchable = true,
            icon = 'map-location-dot',
        },
    })
    if not input or not input[1] or input[1] == current then return end
    TriggerServerEvent('fbrp:control:action', 'aop', { value = input[1] })
end)

-- /priority dialog: pick a zone, a status and (for cooldown) how many minutes
local PRIORITY_LABEL = { available = 'Available', active = 'In Progress', cooldown = 'Cooldown', hold = 'On Hold' }

RegisterNetEvent('fbrp:priority:pick', function(zones, cooldownDefault)
    if type(zones) ~= 'table' or #zones == 0 then return end
    local zoneOptions = {}
    for _, z in ipairs(zones) do
        local now = z.status == 'cooldown' and ('Cooldown %dm'):format(tonumber(z.remaining) or 0) or (PRIORITY_LABEL[z.status] or 'Available')
        zoneOptions[#zoneOptions + 1] = { value = z.id, label = ('%s  (%s)'):format(z.label, now) }
    end
    zoneOptions[#zoneOptions + 1] = { value = 'all', label = 'All zones' }

    local input = lib.inputDialog('Priority', {
        {
            type = 'select',
            label = 'Zone',
            options = zoneOptions,
            required = true,
            icon = 'map-location-dot',
        },
        {
            type = 'select',
            label = 'Status',
            options = {
                { value = 'available', label = 'Available' },
                { value = 'active',    label = 'In Progress' },
                { value = 'cooldown',  label = 'Cooldown' },
                { value = 'hold',      label = 'On Hold' },
            },
            required = true,
            icon = 'tower-broadcast',
        },
        {
            type = 'number',
            label = 'Cooldown minutes',
            description = 'Only used when the status is Cooldown',
            default = tonumber(cooldownDefault) or 20,
            min = 1,
            max = 120,
            icon = 'clock',
        },
    })
    if not input or not input[1] or not input[2] then return end
    TriggerServerEvent('fbrp:control:action', 'priority', { zone = input[1], status = input[2], minutes = input[3] })
end)

TriggerEvent('chat:addSuggestion', '/priority', 'Open the priority menu (or type: /priority <zone> <status> [minutes])', {
    { name = 'zone', help = 'Optional - leave empty to open the menu' },
    { name = 'status', help = 'available, active, cooldown or hold' },
    { name = 'minutes', help = 'Cooldown length' },
})
TriggerEvent('chat:addSuggestion', '/aop', 'Pick the area of play (or type one: /aop <area>)', {
    { name = 'area', help = 'Optional - leave empty to pick from a list' },
})
TriggerEvent('chat:addSuggestion', '/cooldown', 'Put a zone on priority cooldown', {
    { name = 'zone', help = 'ls, blaine (sandy/grapeseed), paleto, zancudo, roxwood or all' },
    { name = 'minutes', help = 'How long the cooldown lasts' },
})
TriggerEvent('chat:addSuggestion', '/onhold', 'Put a zone\'s priority on hold', {
    { name = 'zone', help = 'ls, blaine (sandy/grapeseed), paleto, zancudo, roxwood or all' },
})

-- AOP changed: play web/hud/sfx/aop-change.mp3 (uses the HUD's sound volume setting)
RegisterNetEvent('fbrp:aop:changed', function()
    SendNUIMessage({ type = 'fbrpHud', action = 'sfx', data = { name = 'aop-change' } })
end)
