-- Florida Bay RP - LVC siren override
-- Used by fbrp_sirenmenu

if UTIL == nil or UTIL.GetProfileFromTable == nil then
    print('^1[FBRP] ERROR: Override loaded before cl_utils.lua. Check fxmanifest.lua order.^0')
    return
end

print('^2[FBRP] Siren override loaded successfully.^0')

local override_profile = nil

local original_GetProfileFromTable = UTIL.GetProfileFromTable

function UTIL:GetProfileFromTable(print_name, tbl, veh, ignore_missing_default)
    if override_profile ~= nil
        and tbl ~= nil
        and tbl == SIREN_ASSIGNMENTS
        and tbl[override_profile] ~= nil then

        UTIL:Print(
            ('[FBRP] Using siren package %s'):format(override_profile),
            false
        )

        return tbl[override_profile], override_profile
    end

    return original_GetProfileFromTable(
        self,
        print_name,
        tbl,
        veh,
        ignore_missing_default
    )
end

local function applyToCurrentVehicle()
    local veh = GetVehiclePedIsIn(PlayerPedId(), false)

    if veh == 0 then
        return false
    end

    UTIL:UpdateApprovedTones(veh)
    UTIL:BuildToneOptions()

    return true
end

local function setPackage(package)
    if package == nil or package == 'DEFAULT' then
        override_profile = nil
        applyToCurrentVehicle()
        return true
    end

    if SIREN_ASSIGNMENTS[package] == nil then
        print((
            '[FBRP] ERROR: Siren package "%s" was not found in SIREN_ASSIGNMENTS.'
        ):format(tostring(package)))

        return false
    end

    override_profile = package
    return true
end

-- Apply a siren package from the menu.
exports('overrideSiren', function(package, label)
    if not setPackage(package) then
        return false
    end

    return applyToCurrentVehicle()
end)

-- Save the selected package when called by the menu.
exports('overrideSirenManual', function(package, label)
    if not setPackage(package) then
        return false
    end

    applyToCurrentVehicle()
    return true
end)

-- Audio banks can be unloaded by the game. Retry them at startup and whenever LVC changes vehicle.
local SIREN_BANKS = {
    'DLC_CODE3PACK\\CODE3RLS',
    'DLC_WHELENPACK\\WHELENGAMMA2',
    'DLC_FIREEMSPACK\\FIREEMS',
    'DLC_FEDSIGPACK\\FEDSIGPA4000',
    'DLC_DX5PACK\\DX5',
    'DLC_CENSAPPHIRE\\CENCOMSAPPHIRE',
    'DLC_SMARTSIREN\\SMARTSIREN',
}

local loadedBanks = {}

-- Requests only the banks that are not loaded yet, a few per frame, so the game's audio engine is not
-- handed every request at once. Returns the names that still have not loaded.
local function requestSirenBanks()
    local missing = {}
    local requested = 0
    for _, bank in ipairs(SIREN_BANKS) do
        if not loadedBanks[bank] then
            if RequestScriptAudioBank(bank, true) then
                loadedBanks[bank] = true
            else
                missing[#missing + 1] = bank
            end
            requested = requested + 1
            if requested % 4 == 0 then Wait(0) end
        end
    end
    return missing
end

CreateThread(function()
    local missing = {}
    for _ = 1, 60 do
        missing = requestSirenBanks()
        if #missing == 0 then
            print(('^2[FBRP] All %d siren audio banks loaded.^0'):format(#SIREN_BANKS))
            return
        end
        Wait(1000)
    end
    print(('^1[FBRP] %d of %d siren audio banks failed to load:^0'):format(#missing, #SIREN_BANKS))
    for _, bank in ipairs(missing) do print('^1[FBRP]   ' .. bank .. '^0') end
end)

AddEventHandler('lvc:onVehicleChange', function()
    CreateThread(requestSirenBanks)
end)
