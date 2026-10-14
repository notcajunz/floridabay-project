AddTextEntry("WEAPON_MP9A", "MP9")
AddTextEntry("WEAPON_FBIARB", "FBI AR-15")
AddTextEntry("WEAPON_HK416B", "HK416")
AddTextEntry("WEAPON_MM4", "Military M4")
AddTextEntry("WEAPON_M700", "M700")
AddTextEntry("WEAPON_GHOSTARP", "Ghost ARP")
AddTextEntry("WEAPON_GHOSTGLOCK", "Ghost Glock")

local restrictedWeapons = {
    joaat('WEAPON_MP9A'),
    joaat('WEAPON_FBIARB'),
    joaat('WEAPON_HK416B'),
    joaat('WEAPON_MM4'),
    joaat('WEAPON_M700'),
    joaat('WEAPON_GHOSTARP'),
    joaat('WEAPON_GHOSTGLOCK'),
    joaat('WEAPON_TACTICALCARBINE'),
}

local customWeaponAccess

RegisterNetEvent('fbrp_guns2:setAccess', function(allowed)
    customWeaponAccess = allowed == true
end)

-- vMenu hides the addon entries with ACE permissions. This guard also closes
-- its generic "spawn by name" and saved-loadout paths for players without the role.
CreateThread(function()
    while true do
        TriggerServerEvent('fbrp_guns2:requestAccess')
        Wait(10000)
    end
end)

CreateThread(function()
    while true do
        if customWeaponAccess == false then
            local ped = PlayerPedId()
            for _, weapon in ipairs(restrictedWeapons) do
                if HasPedGotWeapon(ped, weapon, false) then RemoveWeaponFromPed(ped, weapon) end
            end
        end
        Wait(500)
    end
end)
