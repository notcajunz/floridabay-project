-- Florida Bay RP - LVC siren override (used by fbrp_sirenmenu)
-- Adds exports: overrideSiren(package, label) and overrideSirenManual(package, label)
-- Loaded from lvc/fxmanifest.lua AFTER the cl_*.lua files (needs cl_utils.lua first).

if UTIL == nil or UTIL.GetProfileFromTable == nil then
	print('^1[FBRP] cl_override.lua loaded BEFORE cl_utils.lua - it must be listed after the cl_*.lua files in lvc/fxmanifest.lua^0')
	return
end
print('^2[FBRP] cl_override.lua loaded - overrideSiren export registered^0')

local override_profile = nil

-- Wrap LVC's profile lookup so a chosen package is used for SIREN_ASSIGNMENTS
-- (on vehicle entry as well as when the menu changes it).
local original_GetProfileFromTable = UTIL.GetProfileFromTable
function UTIL:GetProfileFromTable(print_name, tbl, veh, ignore_missing_default)
	if override_profile ~= nil and tbl ~= nil and tbl == SIREN_ASSIGNMENTS and tbl[override_profile] ~= nil then
		UTIL:Print(('[FBRP] Using siren package %s'):format(override_profile), false)
		return tbl[override_profile], override_profile
	end
	return original_GetProfileFromTable(self, print_name, tbl, veh, ignore_missing_default)
end

local function applyToCurrentVehicle()
	local veh = GetVehiclePedIsIn(PlayerPedId(), false)
	if veh == 0 then return false end
	UTIL:UpdateApprovedTones(veh)
	UTIL:BuildToneOptions()
	return true
end

local function setPackage(package)
	if package == nil or package == 'DEFAULT' then
		override_profile = nil          -- back to the vehicle's normal profile
		return true
	end
	if SIREN_ASSIGNMENTS[package] == nil then
		print(('[FBRP] overrideSiren: "%s" not found in SIREN_ASSIGNMENTS (SIRENS.lua)'):format(tostring(package)))
		return false
	end
	override_profile = package
	return true
end

-- Menu: change siren now (must be in a vehicle)
exports('overrideSiren', function(package, label)
	if not setPackage(package) then return false end
	return applyToCurrentVehicle()
end)

-- On join: remember the saved package; applied automatically when a vehicle is entered
exports('overrideSirenManual', function(package, label)
	if not setPackage(package) then return false end
	applyToCurrentVehicle()
	return true
end)

-- The FBRP siren sound banks come from the FBRP-Sirens resource. SIRENS.lua requests them once when LVC loads;
-- if that happened before FBRP-Sirens registered its audio data the request failed and every tone stays silent.
-- Keep requesting until each bank loads, and again when a vehicle is entered (banks can be unloaded by the game).
local SIREN_BANKS = {
	'DLC_CODE3PACK\\CODE3RLS',
	'DLC_WHELENPACK\\WHELENGAMMA2',
	'DLC_FIREEMSPACK\\FIREEMS',
	'DLC_FEDSIGPACK\\FEDSIGPA4000',
	'DLC_DX5PACK\\DX5',
	'DLC_CENSAPPHIRE\\CENCOMSAPPHIRE',
	'DLC_SMARTSIREN\\SMARTSIREN',
}

local function requestSirenBanks()
	local missing = 0
	for _, bank in ipairs(SIREN_BANKS) do
		if not RequestScriptAudioBank(bank, true) then missing = missing + 1 end
	end
	return missing
end

CreateThread(function()
	for _ = 1, 60 do
		if requestSirenBanks() == 0 then
			print('^2[FBRP] siren audio banks loaded^0')
			return
		end
		Wait(1000)
	end
	print('^1[FBRP] siren audio banks failed to load - is FBRP-Sirens started?^0')
end)

AddEventHandler('lvc:onVehicleChange', function()
	requestSirenBanks()
end)
