local directions={'N','NE','E','SE','S','SW','W','NW'}
local hudEnabled=true

local function location()
    local c=GetEntityCoords(PlayerPedId())
    local streetHash,crossHash=GetStreetNameAtCoord(c.x,c.y,c.z)
    local street=GetStreetNameFromHashKey(streetHash)
    local cross=crossHash~=0 and GetStreetNameFromHashKey(crossHash) or ''
    local zone=GetLabelText(GetNameOfZone(c.x,c.y,c.z))
    return {street=street,cross=cross,zone=zone,coords={x=c.x,y=c.y,z=c.z}}
end

-- Screen-space rectangle of the radar, as fractions of the screen, so the NUI
-- can sit flush against it at any resolution, aspect ratio or safezone.
local function minimapAnchor()
    local safezone=GetSafeZoneSize()
    local aspect=GetAspectRatio(false)
    local inset=(1.0/20.0)*(math.abs(safezone-1.0)*10.0)
    local width=1.0/(4.0*aspect)
    local height=1.0/5.674
    local left=inset
    local bottom=1.0-inset
    return {left=left,right=left+width,top=bottom-height,bottom=bottom,radar=not IsRadarHidden()}
end

RegisterCommand('hud',function()
    hudEnabled=not hudEnabled
    TriggerEvent('fbrp:notify',hudEnabled and 'HUD shown.' or 'HUD hidden. Type /hud to bring it back.','info')
end,false)

CreateThread(function()
    while true do
        local heading=(360.0-GetGameplayCamRot(2).z)%360.0
        local index=math.floor((heading+22.5)/45.0)%8+1
        local bag=LocalPlayer.state
        local org=bag['fbrp:organization']
        local voice=bag.proximity
        local radio=bag.radioChannel
        local hour=GetClockHours(); local minute=GetClockMinutes()
        local pos=GetEntityCoords(PlayerPedId())
        local zoneId=FBRP.PriorityZoneAt(pos.x,pos.y,pos.z)
        local zoneLabel=zoneId
        for _,zone in ipairs(FBRP.PriorityZones) do if zone.id==zoneId then zoneLabel=zone.short or zone.label end end
        local allPriority=GlobalState['fbrp:priority']
        local here=type(allPriority)=='table' and type(allPriority[zoneId])=='table' and allPriority[zoneId] or {}
        SendNUIMessage({
            type='hud',
            data={
                visible=hudEnabled and not IsPauseMenuActive() and not IsScreenFadedOut() and not IsPlayerSwitchInProgress(),
                layout=minimapAnchor(),
                id=GetPlayerServerId(PlayerId()),
                aop=GlobalState['fbrp:aop'] or 'Statewide',
                peacetime=GlobalState['fbrp:peacetime']==true,
                priority={status=here.status or 'available',remaining=tonumber(here.remaining) or 0,zone=zoneLabel},
                direction=directions[index],heading=math.floor(heading),
                location=location(),
                headtag=bag['fbrp:headtag'],gangtag=bag['fbrp:gangtag'],organization=org,
                staffDuty=bag['fbrp:staffDuty']==true,
                restrained=bag['fbrp:restrained'],
                voice=type(voice)=='table' and voice.distance or voice,
                voiceMode=type(voice)=='table' and voice.mode or nil,
                radio=radio,
                talking=NetworkIsPlayerTalking(PlayerId()),
                gameTime=('%02d:%02d'):format(hour,minute),
                vehicle=FBRP.VehicleStatus()
            }
        })
        Wait(GetVehiclePedIsIn(PlayerPedId(),false)~=0 and 100 or 250)
    end
end)
