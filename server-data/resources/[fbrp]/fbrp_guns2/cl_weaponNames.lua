AddTextEntry("WEAPON_MP9A", "MP9")
AddTextEntry("WEAPON_FBIARB", "FBI AR-15")
AddTextEntry("WEAPON_HK416B", "HK416")
AddTextEntry("WEAPON_MM4", "Military M4")
AddTextEntry("WEAPON_M700", "M700")
AddTextEntry("WEAPON_GHOSTARP", "Ghost ARP")
AddTextEntry("WEAPON_GHOSTGLOCK", "Ghost Glock")
AddTextEntry("WEAPON_TACTICALCARBINE", "Tactical Carbine")
AddTextEntry("WEAPON_M249ACOG", "M249 Acog")
AddTextEntry("WEAPON_M249IRON", "M249 Ironsights")
AddTextEntry("WEAPON_M249RED", "M249 Reddot")
AddTextEntry("WEAPON_SAW", "SAW")
AddTextEntry("WEAPON_SAWACOG", "SAW Acog")
AddTextEntry("WEAPON_SAWRED", "SAW Reddot")
AddTextEntry("WEAPON_M4M203A", "M4A1-M203 Acog")
AddTextEntry("WEAPON_M4M203R", "M4A1-M203 Reddot")
AddTextEntry("WEAPON_M4M203", "M4A1-M203 Ironsights")
AddTextEntry("WEAPON_M4ACOG", "M4A1 Acog")
AddTextEntry("WEAPON_M4IRON", "M4A1 Ironsights")
AddTextEntry("WEAPON_M4REDDOT", "M4A1 Reddot")
AddTextEntry("WEAPON_URGI", "M4A1-URGI")
AddTextEntry("WEAPON_MCXSPEAR", "SIG Sauer MCX-Spear")
AddTextEntry("WEAPON_XM7", "SIG Sauer XM7")

local restrictedWeapons = {
    joaat('WEAPON_MP9A'),
    joaat('WEAPON_FBIARB'),
    joaat('WEAPON_HK416B'),
    joaat('WEAPON_MM4'),
    joaat('WEAPON_M700'),
    joaat('WEAPON_GHOSTARP'),
    joaat('WEAPON_GHOSTGLOCK'),
    joaat('WEAPON_TACTICALCARBINE'),
    joaat('WEAPON_M249ACOG'),
    joaat('WEAPON_M249IRON'),
    joaat('WEAPON_M249RED'),
    joaat('WEAPON_SAW'),
    joaat('WEAPON_SAWACOG'),
    joaat('WEAPON_SAWRED'),
    joaat('WEAPON_M4M203A'),
    joaat('WEAPON_M4M203R'),
    joaat('WEAPON_M4M203'),
    joaat('WEAPON_M4ACOG'),
    joaat('WEAPON_M4IRON'),
    joaat('WEAPON_M4REDDOT'),
    joaat('WEAPON_URGI'),
    joaat('WEAPON_MCXSPEAR'),
    joaat('WEAPON_XM7'),
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
