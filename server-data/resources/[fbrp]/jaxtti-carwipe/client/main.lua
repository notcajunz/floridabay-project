-- jaxtti-carwipe | client

-- Server asked us to open the wipe dialog (perms already verified server-side)
RegisterNetEvent('jaxtti-carwipe:client:openDialog', function()
    local countdownOptions = {}
    for _, secs in ipairs(Config.CountdownOptions) do
        countdownOptions[#countdownOptions + 1] = {
            label = secs == 0 and 'Instant (no countdown)' or (secs .. ' seconds'),
            value = secs
        }
    end

    local input = lib.inputDialog('Car Wipe', {
        {
            type = 'select',
            label = 'Wipe scope',
            description = 'Wipe every vehicle or only vehicles near you',
            icon = 'car',
            required = true,
            default = 'all',
            options = {
                { label = 'Entire server', value = 'all' },
                { label = 'Nearby only (radius)', value = 'radius' },
            }
        },
        {
            type = 'slider',
            label = 'Radius (metres)',
            description = 'Only used for "Nearby only" wipes',
            icon = 'circle-dot',
            default = Config.DefaultRadius,
            min = Config.MinRadius,
            max = Config.MaxRadius,
            step = 10
        },
        {
            type = 'select',
            label = 'Countdown',
            description = 'Warning time before vehicles are deleted',
            icon = 'clock',
            required = true,
            default = Config.DefaultCountdown,
            options = countdownOptions
        },
        {
            type = 'checkbox',
            label = 'Protect occupied vehicles',
            description = 'Skip vehicles that players are sitting in',
            checked = Config.ProtectOccupiedByDefault
        },
        {
            type = 'input',
            label = 'Reason',
            description = 'Shown in the server announcement (optional)',
            icon = 'comment',
            placeholder = 'e.g. Server cleanup before event',
            max = 120
        }
    })

    if not input then
        lib.notify({
            title = 'Car Wipe',
            description = 'Wipe cancelled.',
            type = 'inform',
            position = Config.NotifyPosition
        })
        return
    end

    local scope = input[1]
    local radius = tonumber(input[2]) or Config.DefaultRadius
    local countdown = tonumber(input[3]) or Config.DefaultCountdown
    local protectOccupied = input[4] == true
    local reason = input[5]

    local scopeText = scope == 'all'
        and 'the **entire server**'
        or ('vehicles within **' .. radius .. 'm** of you')

    local confirm = lib.alertDialog({
        header = 'Confirm car wipe',
        content = ('You are about to wipe %s%s.  \nCountdown: **%s**  \nOccupied vehicles: **%s**'):format(
            scopeText,
            reason and reason ~= '' and (' — _' .. reason .. '_') or '',
            countdown == 0 and 'instant' or (countdown .. 's'),
            protectOccupied and 'protected' or 'will be deleted'
        ),
        centered = true,
        cancel = true,
        labels = { confirm = 'Wipe vehicles', cancel = 'Cancel' }
    })

    if confirm ~= 'confirm' then
        lib.notify({
            title = 'Car Wipe',
            description = 'Wipe cancelled.',
            type = 'inform',
            position = Config.NotifyPosition
        })
        return
    end

    local coords = GetEntityCoords(cache.ped or PlayerPedId())

    TriggerServerEvent('jaxtti-carwipe:server:startWipe', {
        scope = scope,
        radius = radius,
        countdown = countdown,
        protectOccupied = protectOccupied,
        reason = reason,
        coords = { x = coords.x, y = coords.y, z = coords.z }
    })
end)

-- Generic notification relay from the server
RegisterNetEvent('jaxtti-carwipe:client:notify', function(data)
    lib.notify({
        title = data.title or 'Car Wipe',
        description = data.description,
        type = data.type or 'inform',
        icon = data.icon or 'car',
        duration = data.duration or 6000,
        position = Config.NotifyPosition
    })
end)
