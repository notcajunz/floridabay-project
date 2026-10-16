-- Launch essentials (client): tells the server the player is still at the
-- keyboard. Moving, turning the camera or talking all count as activity.

local REPORT_MS = 30000

CreateThread(function()
    local lastCoords, lastCam = nil, nil
    local activeSince = false
    local lastReport = 0
    while true do
        Wait(2000)
        local ped = PlayerPedId()
        local coords = GetEntityCoords(ped)
        local cam = GetGameplayCamRot(2)
        if lastCoords and (#(coords - lastCoords) > 1.0
            or math.abs(cam.z - lastCam.z) > 2.0 or math.abs(cam.x - lastCam.x) > 2.0
            or NetworkIsPlayerTalking(PlayerId())) then
            activeSince = true
        end
        lastCoords, lastCam = coords, cam
        local stamp = GetGameTimer()
        if activeSince and stamp - lastReport >= REPORT_MS then
            lastReport = stamp
            activeSince = false
            TriggerServerEvent('fbrp:essentials:active')
        end
    end
end)
