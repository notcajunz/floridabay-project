-- DeathScript (Florida Bay) - client
-- fbrp_core has no spawnmanager respawn, so make sure spawnmanager (if running) never auto-respawns over us
AddEventHandler("onClientMapStart", function()
	if GetResourceState("spawnmanager") == "started" then
		pcall(function() exports.spawnmanager:setAutoSpawn(false) end)
	end
end)

Data = {
	ReviveTimer = ClientConfig.ReviveTimer,
	RespawnTimer = ClientConfig.RespawnTimer,
	CanRevive = false,
	CanRespawn = false,
	Dead = false,
	KnockedOut = false,
	Purge = false,
}

RespawnTimer = ClientConfig.RespawnTimer
exports("RespawnTimer", function() return RespawnTimer end)
exports("getDefaultRespawnTimer", function() return ClientConfig.RespawnTimer end)

local RanOneTimeFunctions = false
local KnockedOutPlayers = {}

LocalPlayer.state:set("knockedout", false, true)
LocalPlayer.state:set("dead", false, true)

AddStateBagChangeHandler("knockedout", nil, function(bagName, key, value)
	local player = GetPlayerFromStateBagName(bagName)
	if player == 0 then return end
	KnockedOutPlayers[GetPlayerServerId(player)] = value and true or nil
end)

-- tell fbrp_core you're down (its menus, third eye, side jobs and HUD all read 'fbrp:downed')
local function setCoreDowned(deathType)
	if deathType then
		LocalPlayer.state:set("fbrp:downed", { since = GetCloudTimeAsInt(), cause = deathType }, true)
	else
		LocalPlayer.state:set("fbrp:downed", nil, true)
	end
end

local KilledByMelee = false
AddEventHandler("gameEventTriggered", function(eventName, data)
	if eventName ~= "CEventNetworkEntityDamage" then return end
	local victim = data[1]
	if not IsPedAPlayer(victim) or NetworkGetPlayerIndexFromPed(victim) ~= PlayerId() then return end
	if data[6] == 1 and data[12] == 1 then KilledByMelee = true end -- fatal + melee
end)

--#region Vehicle speed stuff (kept from the original, the chance roll below is switched off)
local allowedVehicleDeathCauses = {
	[133987706] = "Rammed By Car",
	[-1553120962] = "Run Over By Car",
}
local killedByVehicle, killerVehicleSpeed = false, 0
AddEventHandler("entityDamaged", function(victim, attacker, weapon)
	if victim == 0 or victim ~= PlayerPedId() then return end
	if not IsPedAPlayer(attacker) then return end
	local vehicle = GetVehiclePedIsIn(attacker, false)
	if not DoesEntityExist(vehicle) or not allowedVehicleDeathCauses[weapon] then
		killedByVehicle = false
		return
	end
	killedByVehicle = true
	killerVehicleSpeed = GetEntitySpeed(vehicle) * 2.237
end)
--#endregion

-- shorter respawn timer for players with the fast-respawn ace (asked from the server)
RegisterNetEvent("DeathScript:Perms", function(fast, seconds)
	if not fast then return end
	Debug("Fast respawn permission loaded.")
	ClientConfig.RespawnTimer = seconds or 30
	if not Data.Dead then RespawnTimer = ClientConfig.RespawnTimer end
end)

RegisterNetEvent("vanity:marketplace:client:itemPurchased", function()
	TriggerServerEvent("DeathScript:RequestPerms")
end)

CreateThread(function()
	Wait(2000)
	TriggerServerEvent("DeathScript:RequestPerms")

	while true do
		Wait(1000)
		local ped = PlayerPedId()

		if IsEntityDead(ped) then
			SetPlayerInvincible(PlayerId(), true)
			SetEntityHealth(ped, 1)
			Data.Dead = true

			if not RanOneTimeFunctions then
				RanOneTimeFunctions = true

				local DeathSource = GetPedCauseOfDeath(ped)
				Debug("Death source: " .. tostring(DeathSource))

				local DeathType = "dead"
				if IsMelee(DeathSource) or (KilledByMelee and not ClientConfig.DeadlyMelee[DeathSource]) or ClientConfig.isNonLethal(DeathSource) then
					DeathType = "knocked out"
					Data.KnockedOut = true
					LocalPlayer.state:set("knockedout", true, true)
				elseif killedByVehicle and false then -- vehicle survival chance (disabled, as in the original)
					local chance
					if killerVehicleSpeed <= 15 then chance = math.random(1, 10) <= 9
					elseif killerVehicleSpeed <= 35 then chance = math.random(1, 10) <= 7
					elseif killerVehicleSpeed <= 50 then chance = math.random(1, 10) <= 5
					else chance = math.random(1, 10) <= 1 end
					if chance then
						DeathType = "knocked out"
						Data.KnockedOut = true
						LocalPlayer.state:set("knockedout", true, true)
					end
				end

				LocalPlayer.state:set("dead", true, true)
				setCoreDowned(DeathType)
				TriggerEvent("fbrp:cancelActivities")

				if ClientConfig.ShowWastedScreen then
					TriggerEvent("DeathScript:WastedScreen", DeathType)
				end
				MutePlayer(true)
				TriggerServerEvent("AnimMenu:CancelSound")
				DisablePhone(true)
			end

			local message
			if Data.KnockedOut then
				if Data.ReviveTimer > 0 then
					Data.ReviveTimer = Data.ReviveTimer - 1
					message = Format("Knocked out - get back up in %s seconds", Data.ReviveTimer)
				else
					Data.CanRevive = true
					message = "Knocked out - /revive to get up"
				end
			else
				if RespawnTimer > 0 then
					RespawnTimer = RespawnTimer - 1
					message = Format("You are dead - respawn in %s seconds", RespawnTimer)
				else
					Data.CanRespawn = true
					message = "You are dead - /respawn available"
				end
			end
			ShowNotification(message)
		end
	end
end)

AddEventHandler("DeathScript:ReviveorRespawn", function()
	if not Data.Dead then return Notify("You are not dead!", "error") end
	if Data.CanRevive then
		if Revive() then Notify("You have revived!", "success") end
	elseif Data.CanRespawn then
		if Respawn() then Notify("You have respawned!", "success") end
	else
		Notify("You can not revive or respawn at this time!", "error")
	end
end)

-- /revive: get up yourself once the knockout timer is done (or during a purge / flood)
RegisterCommand("revive", function()
	if not Data.Dead then return Notify("You are not dead!", "error") end
	if Data.CanRevive or Data.Purge or FloodCheck() then
		if Revive() then Notify("You have revived!", "success") end
		return
	end
	if Data.KnockedOut then
		return Notify(Format("You can get up in %s seconds.", Data.ReviveTimer), "error")
	end
	Notify("You can not revive at this time! Wait for a medic or /respawn.", "error")
end, false)

-- /respawn: go to the nearest hospital once the respawn timer is done
RegisterCommand("respawn", function()
	if not Data.Dead then return Notify("You are not dead!", "error") end
	if not Data.CanRespawn then
		return Notify(Format("You can respawn in %s seconds.", RespawnTimer), "error")
	end
	if Respawn() then Notify("You have respawned!", "success") end
end, false)

RegisterNetEvent("DeathScript:Revive", function(data)
	if Revive() and data and data.admin then
		Notify("You have been revived by a staff member!", "inform")
	end
end)

RegisterNetEvent("DeathScript:MedRevived", function(medicName)
	if Revive({ playAnim = true }) then
		Notify(Format("You were revived by %s.", medicName or "a medic"), "success")
	end
end)

RegisterNetEvent("DeathScript:Respawn", function(data)
	if Respawn() and data and data.admin then
		Notify("You have been respawned by a staff member!", "inform")
	end
end)

RegisterNetEvent("DeathScript:TogglePurge", function(bool)
	Data.Purge = bool == true
end)

function ResetTimers()
	Data.Dead = false
	Data.KnockedOut = false
	Data.ReviveTimer = ClientConfig.ReviveTimer
	RespawnTimer = ClientConfig.RespawnTimer
	Data.CanRevive = false
	Data.CanRespawn = false
	LocalPlayer.state:set("knockedout", false, true)
	KilledByMelee = false
	killedByVehicle = false
	killerVehicleSpeed = 0
end

local function backToNormal()
	ResetTimers()
	ReapplyTattoos()
	HidePrompt()
	MutePlayer(false)
	RanOneTimeFunctions = false
	LocalPlayer.state:set("dead", false, true)
	setCoreDowned(nil)
	DisablePhone(false)
end

function Revive(requestData)
	if not Data.Dead then return false end
	requestData = requestData or {}

	local playAnimation = Data.KnockedOut
	if requestData.playAnim then playAnimation = true end
	if requestData.noAnim then playAnimation = false end

	local ped = PlayerPedId()
	local coords = GetEntityCoords(ped)
	NetworkResurrectLocalPlayer(coords.x, coords.y, coords.z, GetEntityHeading(ped), true, false)
	SetPlayerInvincible(PlayerId(), false)
	ped = PlayerPedId()
	ClearPedBloodDamage(ped)
	backToNormal()

	if playAnimation and LoadAnim("missheist_agency3astumble_getup") then
		TaskPlayAnim(ped, "missheist_agency3astumble_getup", "stumble_getup", 8.0, -8.0, -1, 0, 0, false, false, false)
		RemoveAnimDict("missheist_agency3astumble_getup")
	end

	TriggerEvent("DeathScript:Revived")
	return true
end

function Respawn()
	if not Data.Dead then return false end

	local dragged = IsDragged()
	TriggerServerEvent("DeathScript:Respawning", { dragged = dragged })
	if dragged then
		StopDrag()
		Wait(500)
	end

	local spot = GenerateRespawnLocation()
	DoScreenFadeOut(500)
	local untilAt = GetGameTimer() + 1500
	while not IsScreenFadedOut() and GetGameTimer() < untilAt do Wait(10) end

	local ped = PlayerPedId()
	RequestCollisionAtCoord(spot.x, spot.y, spot.z)
	SetEntityCoordsNoOffset(ped, spot.x, spot.y, spot.z, false, false, false)
	NetworkResurrectLocalPlayer(spot.x, spot.y, spot.z, spot.heading, true, false)
	SetPlayerInvincible(PlayerId(), false)
	ped = PlayerPedId()
	untilAt = GetGameTimer() + 4000
	while not HasCollisionLoadedAroundEntity(ped) and GetGameTimer() < untilAt do Wait(25) end
	ClearPedBloodDamage(ped)
	backToNormal()

	TriggerEvent("playerSpawned", spot.x, spot.y, spot.z, spot.heading)
	Wait(300)
	DoScreenFadeIn(800)
	Notify(Format("You woke up at %s.", spot.name or "the hospital"), "inform")
	return true
end

function ForceRespawn()
	local spot = GenerateRespawnLocation()
	SetEntityCoordsNoOffset(PlayerPedId(), spot.x, spot.y, spot.z, false, false, false)
	TriggerEvent("playerSpawned", spot.x, spot.y, spot.z, spot.heading)
	ClearPedBloodDamage(PlayerPedId())
	ResetTimers()
	return true
end

exports("Respawn", Respawn)
exports("Revive", Revive)
exports("ForceRespawn", ForceRespawn)
exports("IsDead", function() return Data.Dead end)
exports("IsKnockedOut", function() return Data.KnockedOut end)

---------------------------------------------------------------- fbrp_core third eye: "Revive patient" and "Help up"
-- fbrp_core's third eye asks us to run these on the helper's screen, then the server checks and revives

local helping = false
local function helpTarget(targetServerId, label, check, serverEvent)
	if helping then return end
	local player = GetPlayerFromServerId(targetServerId)
	if player == -1 then return end
	local targetPed = GetPlayerPed(player)
	if not check() then return Notify("They don't need that any more.", "error") end
	helping = true
	TaskTurnPedToFaceEntity(PlayerPedId(), targetPed, 500)
	Wait(500)
	local done = Progress({
		duration = math.random(4000, 7500),
		label = label,
		useWhileDead = false,
		allowRagdoll = false,
		allowCuffed = false,
		allowFalling = false,
		canCancel = true,
		disable = { car = true, move = true, combat = true },
		anim = { dict = "amb@medic@standing@tendtodead@base", clip = "base" },
	})
	ClearPedTasks(PlayerPedId())
	helping = false
	if done and check() then TriggerServerEvent(serverEvent, targetServerId, isMedic()) end
end

RegisterNetEvent("DeathScript:StartMedRevive", function(targetServerId)
	targetServerId = tonumber(targetServerId)
	if not targetServerId then return end
	helpTarget(targetServerId, "Reviving...", function()
		return Player(targetServerId).state.dead == true
	end, "DeathScript:MedRevive")
end)

RegisterNetEvent("DeathScript:StartHelpUp", function(targetServerId)
	if not ClientConfig.EnableHelpUpFromKnockout then return end
	targetServerId = tonumber(targetServerId)
	if not targetServerId then return end
	helpTarget(targetServerId, "Helping Up...", function()
		return Player(targetServerId).state.knockedout == true
	end, "DeathScript:HelpUpPlayer")
end)

AddEventHandler("onResourceStop", function(resource)
	if resource ~= GetCurrentResourceName() then return end
	MutePlayer(false)
	setCoreDowned(nil)
	if Data.Dead then SetPlayerInvincible(PlayerId(), false) end
end)
