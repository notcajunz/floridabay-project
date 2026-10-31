-- DeathScript (Florida Bay) - server
-- (the original zip had no server files - this replaces config_server/server/functions_server)
local cfg = ServerConfig

local function notify(src, msg, kind, title)
	TriggerClientEvent("ox_lib:notify", src, { title = title or "FBRP", description = msg, type = kind or "inform", position = "center-right" })
end

-- permissions go through fbrp_core (duty-gated for police / EMS), falling back to plain aces
local function allowed(src, aces)
	if src <= 0 then return true end
	for _, ace in ipairs(aces) do
		local ok, has = pcall(function() return exports.fbrp_core:HasPermission(src, ace) end)
		if (ok and has) or IsPlayerAceAllowed(src, ace) then return true end
	end
	return false
end

local function isAdmin(src) return allowed(src, cfg.AdminAces) end

local function contains(list, value)
	for _, v in ipairs(list or {}) do if v == value then return true end end
	return false
end

-- same rules as isMedic() on the client, checked here so it can't be faked
local function isMedic(src)
	if allowed(src, cfg.MedicAces) then return true end
	local ok, org = pcall(function() return exports.fbrp_core:GetActiveOrganization(src) end)
	if ok and type(org) == "table" and SharedConfig.medic.orgTypes[org.type] then return true end
	local state = Player(src).state
	local head, gang = state["fbrp:headtag"], state["fbrp:gangtag"]
	if type(head) == "table" and contains(SharedConfig.medic.tags, head.label) then return true end
	if type(gang) == "table" and contains(SharedConfig.medic.tags, gang.label) then return true end
	return false
end

local function nameOf(src)
	local state = Player(src).state
	return state["fbrp:characterName"] or state["fbrp:name"] or GetPlayerName(src) or ("ID " .. src)
end

local function near(a, b, distance)
	local pa, pb = GetPlayerPed(a), GetPlayerPed(b)
	if pa <= 0 or pb <= 0 then return false end
	return #(GetEntityCoords(pa) - GetEntityCoords(pb)) <= distance
end

local function playersNear(src, radius)
	local list = {}
	local ped = src > 0 and GetPlayerPed(src) or 0
	if ped <= 0 then return list end
	local here = GetEntityCoords(ped)
	for _, id in ipairs(GetPlayers()) do
		id = tonumber(id)
		local other = GetPlayerPed(id)
		if other > 0 and #(here - GetEntityCoords(other)) <= radius then list[#list + 1] = id end
	end
	return list
end

---------------------------------------------------------------- respawn timer perms

RegisterNetEvent("DeathScript:RequestPerms", function()
	local src = source
	local fast = cfg.FastRespawnAce and IsPlayerAceAllowed(src, cfg.FastRespawnAce) or false
	TriggerClientEvent("DeathScript:Perms", src, fast, cfg.FastRespawnSeconds)
end)

---------------------------------------------------------------- staff commands

RegisterCommand("adrev", function(src, args)
	if not isAdmin(src) then return notify(src, "You do not have permission to do that.", "error") end
	local target = tonumber(args[1]) or (src > 0 and src or nil)
	if not target or not GetPlayerName(target) then return notify(src, "Usage: /adrev [id]", "error") end
	TriggerClientEvent("DeathScript:Revive", target, { admin = true })
	if src > 0 and target ~= src then notify(src, ("Revived %s."):format(nameOf(target)), "success") end
end, false)

RegisterCommand("adrevnearby", function(src, args)
	if src <= 0 then return end
	if not isAdmin(src) then return notify(src, "You do not have permission to do that.", "error") end
	local list = playersNear(src, tonumber(args[1]) or cfg.NearbyRadius)
	for _, id in ipairs(list) do TriggerClientEvent("DeathScript:Revive", id, { admin = true }) end
	notify(src, ("Revived everyone within %.0fm (%d players)."):format(tonumber(args[1]) or cfg.NearbyRadius, #list), "success")
end, false)

RegisterCommand("adresnearby", function(src, args)
	if src <= 0 then return end
	if not isAdmin(src) then return notify(src, "You do not have permission to do that.", "error") end
	local list = playersNear(src, tonumber(args[1]) or cfg.NearbyRadius)
	for _, id in ipairs(list) do TriggerClientEvent("DeathScript:Respawn", id, { admin = true }) end
	notify(src, ("Respawned everyone within %.0fm (%d players)."):format(tonumber(args[1]) or cfg.NearbyRadius, #list), "success")
end, false)

-- /purge on|off - everyone can /revive instantly
local purge = false
RegisterCommand("purge", function(src, args)
	if not isAdmin(src) then return notify(src, "You do not have permission to do that.", "error") end
	purge = args[1] == "on" or (args[1] == nil and not purge)
	TriggerClientEvent("DeathScript:TogglePurge", -1, purge)
	TriggerClientEvent("ox_lib:notify", -1, { title = "FBRP", description = purge and "Purge is ON - /revive works instantly." or "Purge is over.", type = purge and "warning" or "inform", position = "center-right" })
end, false)

AddEventHandler("playerJoining", function()
	local src = source
	if purge then TriggerClientEvent("DeathScript:TogglePurge", src, true) end
end)

---------------------------------------------------------------- medics / helping up (from fbrp_core's third eye)

local lastHelp = {}
local function cooldown(src)
	if lastHelp[src] and GetGameTimer() - lastHelp[src] < 2000 then return true end
	lastHelp[src] = GetGameTimer()
	return false
end

RegisterNetEvent("DeathScript:MedRevive", function(target)
	local src = source
	target = tonumber(target)
	if not target or target == src or cooldown(src) then return end
	if not isMedic(src) and not isAdmin(src) then return notify(src, "Only medics can revive.", "error") end
	if not GetPlayerName(target) or Player(target).state.dead ~= true then return notify(src, "They do not need reviving.", "error") end
	if not near(src, target, cfg.InteractDistance) then return notify(src, "You moved away from the patient.", "error") end
	TriggerClientEvent("DeathScript:MedRevived", target, nameOf(src))
	notify(src, ("You revived %s."):format(nameOf(target)), "success")
end)

RegisterNetEvent("DeathScript:HelpUpPlayer", function(target)
	local src = source
	target = tonumber(target)
	if not target or target == src or cooldown(src) then return end
	if not GetPlayerName(target) or Player(target).state.knockedout ~= true then return notify(src, "They are not knocked out.", "error") end
	if not near(src, target, cfg.InteractDistance) then return notify(src, "You moved away from them.", "error") end
	TriggerClientEvent("DeathScript:MedRevived", target, nameOf(src))
	notify(src, ("You helped %s up."):format(nameOf(target)), "success")
end)

RegisterNetEvent("DeathScript:Respawning", function(info)
	local src = source
	print(("[DeathScript] %s [%d] respawned%s"):format(nameOf(src), src, type(info) == "table" and info.dragged and " (was being escorted)" or ""))
end)

---------------------------------------------------------------- hospital beds

local occupiedBeds = {} -- [location][bedIndex] = src

RegisterNetEvent("DeathScript:Hospital:StartTreatment", function(location)
	local src = source
	local beds = SharedConfig.hospitalBeds[location]
	if not beds then return TriggerClientEvent("DeathScript:Hospital:BedAssigned", src, false) end
	occupiedBeds[location] = occupiedBeds[location] or {}
	local free = {}
	for index in ipairs(beds) do
		local who = occupiedBeds[location][index]
		if not who or not GetPlayerName(who) then free[#free + 1] = index end
	end
	if #free == 0 then return TriggerClientEvent("DeathScript:Hospital:BedAssigned", src, false) end
	local bed = free[math.random(#free)]
	occupiedBeds[location][bed] = src
	TriggerClientEvent("DeathScript:Hospital:BedAssigned", src, bed)
end)

RegisterNetEvent("DeathScript:Hospital:FinishTreatment", function(location, bedIndex)
	local src = source
	local beds = occupiedBeds[location]
	if beds and beds[tonumber(bedIndex)] == src then beds[tonumber(bedIndex)] = nil end
end)

AddEventHandler("playerDropped", function()
	local src = source
	lastHelp[src] = nil
	for _, beds in pairs(occupiedBeds) do
		for index, who in pairs(beds) do
			if who == src then beds[index] = nil end
		end
	end
end)

---------------------------------------------------------------- exports

exports("RevivePlayer", function(target) TriggerClientEvent("DeathScript:Revive", tonumber(target), {}) end)
exports("RespawnPlayer", function(target) TriggerClientEvent("DeathScript:Respawn", tonumber(target), {}) end)
exports("IsDead", function(target) return Player(tonumber(target)).state.dead == true end)
exports("IsKnockedOut", function(target) return Player(tonumber(target)).state.knockedout == true end)
