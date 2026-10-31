-- FBRP Mk2 guard - client: removes every Mk2 weapon from a player who does not hold the Mk2 Weapons role.
local cfg = Mk2Config
local restricted = {}
for _, name in ipairs(cfg.Weapons) do restricted[#restricted + 1] = joaat(name) end

local access = nil -- nil until the server has answered, so nothing is taken from anyone before we know

RegisterNetEvent('fbrp_mk2guard:setAccess', function(allowed)
    access = allowed == true
end)

CreateThread(function()
    while true do
        TriggerServerEvent('fbrp_mk2guard:requestAccess')
        Wait(10000)
    end
end)

CreateThread(function()
    local warned = 0
    while true do
        if access == false then
            local ped = PlayerPedId()
            for _, weapon in ipairs(restricted) do
                if HasPedGotWeapon(ped, weapon, false) then
                    RemoveWeaponFromPed(ped, weapon)
                    if GetGameTimer() - warned > 10000 then
                        warned = GetGameTimer()
                        lib.notify({ title = 'Mk2 Weapons', description = cfg.Message, type = 'error' })
                    end
                end
            end
        end
        Wait(500)
    end
end)
