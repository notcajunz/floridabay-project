--[[
    FBRP addition: the Roxwood passenger line (resource amb-roxwood-trains, track 14) runs on its own tracks and is not
    a dps-transit line. Its Los Santos end is about 80 m from the Downtown station, so riders are pointed there:
    a map blip at the end of the line and a notice when they walk up to the Downtown kiosk.
]]

local ROXWOOD_END = vec3(560.4, -440.6, 23.8)

CreateThread(function()
    Wait(6000)

    local blip = AddBlipForCoord(ROXWOOD_END.x, ROXWOOD_END.y, ROXWOOD_END.z)
    SetBlipSprite(blip, Config.Blips.stations.sprite)
    SetBlipColour(blip, 3)
    SetBlipScale(blip, 0.8)
    SetBlipAsShortRange(blip, true)
    BeginTextCommandSetBlipName('STRING')
    AddTextComponentSubstringPlayerName('Roxwood Train (end of line)')
    EndTextCommandSetBlipName(blip)

    local station = Config.Stations.downtown
    if not station or not station.kiosk then return end

    local lastNotice = 0
    lib.zones.sphere({
        coords = station.kiosk.xyz,
        radius = 8.0,
        onEnter = function()
            if GetGameTimer() - lastNotice < 120000 then return end
            lastNotice = GetGameTimer()
            lib.notify({
                title = 'Roxwood trains',
                description = 'Trains to Roxwood leave from the Roxwood line platform north of Union Depot (marked on your map).',
                type = 'inform',
                duration = 8000,
            })
        end,
    })
end)
