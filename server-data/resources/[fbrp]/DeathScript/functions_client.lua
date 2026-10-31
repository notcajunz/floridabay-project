Format = string.format

TriggerEvent("chat:addSuggestion", "/adrev", "[Staff] Revive a player", { { name = "id", help = "Player ID (empty = yourself)" } })
TriggerEvent("chat:addSuggestion", "/adrevnearby", "[Staff] Revive nearby players", { { name = "radius", help = "Metres (optional)" } })
TriggerEvent("chat:addSuggestion", "/adresnearby", "[Staff] Respawn nearby players", { { name = "radius", help = "Metres (optional)" } })
TriggerEvent("chat:addSuggestion", "/revive", "Get back up after being knocked out")
TriggerEvent("chat:addSuggestion", "/respawn", "Respawn at the nearest hospital")

---------------------------------------------------------------- small helpers

function Debug(...)
	if ClientConfig.Debug then print("[DeathScript]", ...) end
end

local function started(resource)
	return GetResourceState(resource) == "started"
end

function Notify(msg, type)
	lib.notify({ title = "FBRP", description = msg, type = type, position = "center-right" })
end

function hospitalNotify(msg, type)
	lib.notify({ title = "Hospital", description = msg, type = type, position = "center-right", duration = 6500 })
end

-- ox_lib progress bar, falling back to a plain wait if this ox_lib doesn't have one
function Progress(options)
	local ok, result = pcall(lib.progressBar, options)
	if ok then return result end
	if options.anim and options.anim.dict then
		RequestAnimDict(options.anim.dict)
		local untilAt = GetGameTimer() + 2000
		while not HasAnimDictLoaded(options.anim.dict) and GetGameTimer() < untilAt do Wait(10) end
		TaskPlayAnim(PlayerPedId(), options.anim.dict, options.anim.clip, 8.0, -8.0, -1, 1, 0, false, false, false)
	end
	Wait(options.duration or 3000)
	if options.anim then ClearPedTasks(PlayerPedId()) end
	return true
end

function LoadAnim(dict)
	RequestAnimDict(dict)
	local untilAt = GetGameTimer() + 3000
	while not HasAnimDictLoaded(dict) and GetGameTimer() < untilAt do Wait(10) end
	return HasAnimDictLoaded(dict)
end

-- right-side prompt (ox_lib text UI, or drawn text if that isn't available)
local promptText, promptFallback = nil, false
function ShowNotification(message)
	if promptText == message then return end
	promptText = message
	if not promptFallback then
		local ok = pcall(lib.showTextUI, message, { position = "right-center", icon = "heart-pulse", style = { backgroundColor = "#7a1f1f", color = "#ffffff" } })
		if not ok then promptFallback = true end
	end
end

function HidePrompt()
	if not promptText then return end
	promptText = nil
	if not promptFallback then pcall(lib.hideTextUI) end
end

CreateThread(function()
	while true do
		if promptFallback and promptText then
			SetTextFont(4)
			SetTextScale(0.0, 0.5)
			SetTextColour(255, 120, 120, 230)
			SetTextOutline()
			SetTextRightJustify(true)
			SetTextWrap(0.0, 0.98)
			BeginTextCommandDisplayText("STRING")
			AddTextComponentSubstringPlayerName(promptText)
			EndTextCommandDisplayText(0.98, 0.5)
			Wait(0)
		else
			Wait(250)
		end
	end
end)

---------------------------------------------------------------- fbrp_core roles

-- on-duty police (fbrp_core /duty with a law enforcement department)
function isLeo()
	local org = LocalPlayer.state["fbrp:organization"]
	return type(org) == "table" and org.type == "leo"
end

local function contains(list, value)
	for _, v in ipairs(list or {}) do
		if v == value then return true end
	end
	return false
end

local function tagLabel(bag)
	return type(bag) == "table" and bag.label or nil
end

-- "job" = on duty with Fire & EMS, "htag"/"gtag" = wearing a medic tag, false = not a medic
function isMedic()
	local org = LocalPlayer.state["fbrp:organization"]
	if type(org) == "table" and SharedConfig.medic.orgTypes[org.type] then return "job" end
	local head = tagLabel(LocalPlayer.state["fbrp:headtag"])
	if head and contains(SharedConfig.medic.tags, head) then return "htag" end
	local gang = tagLabel(LocalPlayer.state["fbrp:gangtag"])
	if gang and contains(SharedConfig.medic.tags, gang) then return "gtag" end
	return false
end
exports("isMedic", isMedic)

function IsStaff()
	return LocalPlayer.state["fbrp:staffDuty"] == true
end

-- fbrp_core escort attaches you to the officer's ped
function IsDragged()
	local ped = PlayerPedId()
	if not IsEntityAttached(ped) then return false end
	local to = GetEntityAttachedTo(ped)
	return to ~= 0 and IsEntityAPed(to)
end

function StopDrag()
	DetachEntity(PlayerPedId(), true, false)
end

function IsRestrained()
	return LocalPlayer.state["fbrp:restrained"] ~= nil and LocalPlayer.state["fbrp:restrained"] ~= false
end

---------------------------------------------------------------- respawn location

local function nearestPoint(points)
	local myCoords = GetEntityCoords(PlayerPedId())
	local nearest, nearestDistance
	for _, v in pairs(points) do
		local dist = #(myCoords - vector3(v[1], v[2], v[3]))
		if not nearestDistance or dist < nearestDistance then
			nearest = { x = v[1], y = v[2], z = v[3], heading = v[4], name = v[5] }
			nearestDistance = dist
		end
	end
	return nearest
end

local function pointNamed(points, name)
	for _, v in pairs(points or {}) do
		if v[5] == name then return { x = v[1], y = v[2], z = v[3], heading = v[4], name = v[5] } end
	end
end

-- which AopRespawn entry matches the current AOP (GlobalState 'fbrp:aop' from fbrp_core)
local function aopEntry()
	local aop = (" " .. tostring(GlobalState["fbrp:aop"] or "Statewide"):lower() .. " "):gsub("[^%w ]", " ")
	for _, entry in ipairs(ClientConfig.AopRespawn or {}) do
		for _, word in ipairs(entry.match or {}) do
			word = word:lower()
			-- short words (ls) must be a whole word, longer ones can be anywhere
			local hit = (#word <= 3 and aop:find(" " .. word .. " ", 1, true)) or (#word > 3 and aop:find(word, 1, true))
			if hit then return entry end
		end
	end
end

function GenerateRespawnLocation()
	local leo = isLeo() and ClientConfig.LeoRespawnPoints and #ClientConfig.LeoRespawnPoints > 0
	local entry = aopEntry()
	if entry then
		local spot = leo and pointNamed(ClientConfig.LeoRespawnPoints, entry.station)
			or pointNamed(ClientConfig.RespawnPoints, entry.hospital)
		if spot then return spot end
	end
	-- Statewide / not listed: nearest
	if leo then return nearestPoint(ClientConfig.LeoRespawnPoints) end
	return nearestPoint(ClientConfig.RespawnPoints)
end

---------------------------------------------------------------- optional resources (only used if they're running)

function FloodCheck()
	if started("tsunami") then
		local ok, flooding = pcall(function() return exports["tsunami"]:IsFlooding() end)
		return ok and flooding or false
	end
	return false
end

function MutePlayer(bool)
	if not ClientConfig.MuteWhenDead or not started("pma-voice") then return end
	pcall(function()
		if bool then
			exports["pma-voice"]:overrideProximityCheck(function() return false end)
		else
			exports["pma-voice"]:resetProximityCheck()
		end
	end)
end

function DisablePhone(bool)
	if not started("lb-phone") then return end
	pcall(function()
		if bool and exports["lb-phone"]:IsOpen() then exports["lb-phone"]:ToggleOpen(false) end
		exports["lb-phone"]:ToggleDisabled(bool)
	end)
end

function ReapplyTattoos()
	if not started("vMenu") then return end
	SetTimeout(1000, function()
		pcall(function() exports["vMenu"]:applySavedTattoos() end)
	end)
end

---------------------------------------------------------------- wasted screen

RegisterNetEvent("DeathScript:WastedScreen", function(death_title)
	StartScreenEffect("DeathFailOut", 0, false)
	ShakeGameplayCam("DEATH_FAIL_IN_EFFECT_SHAKE", 1.0)
	local spot = GenerateRespawnLocation()
	local scaleform = RequestScaleformMovie("MP_BIG_MESSAGE_FREEMODE")
	local untilAt = GetGameTimer() + 3000
	while not HasScaleformMovieLoaded(scaleform) and GetGameTimer() < untilAt do Wait(0) end
	if HasScaleformMovieLoaded(scaleform) then
		PushScaleformMovieFunction(scaleform, "SHOW_SHARD_WASTED_MP_MESSAGE")
		PushScaleformMovieFunctionParameterString(Format("~r~%s", death_title))
		PushScaleformMovieFunctionParameterString(Format("Nearest Respawn Point: %s", spot and spot.name or "Hospital"))
		PopScaleformMovieFunctionVoid()
		Wait(500)
		while Data.Dead do
			DrawScaleformMovieFullscreen(scaleform, 255, 255, 255, 255, 0)
			Wait(0)
		end
		SetScaleformMovieAsNoLongerNeeded(scaleform)
	end
	StopScreenEffect("DeathFailOut")
end)

---------------------------------------------------------------- melee check

local UNARMED_HASH = GetHashKey("weapon_unarmed")
local WeaponGroups = {
	[-728555052] = true, -- melee
	[1548507267] = true, -- throwable
}

function IsMelee(hash)
	if hash == UNARMED_HASH then return true end
	local WeaponGroup = GetWeapontypeGroup(hash)
	Debug("Cause of death, weapon group: " .. tostring(WeaponGroup))
	return WeaponGroups[WeaponGroup] == true and not ClientConfig.DeadlyMelee[hash]
end

---------------------------------------------------------------- hospital treatment

local pendingBed = nil
RegisterNetEvent("DeathScript:Hospital:BedAssigned", function(bedIndex)
	if pendingBed then pendingBed:resolve(bedIndex or false) end
end)

local startingMedicalTreatment = false
function startMedicalTreatment(location)
	if startingMedicalTreatment then return false end
	startingMedicalTreatment = true
	Debug("Started medical treatment at " .. tostring(location))

	DoScreenFadeOut(500)
	Wait(math.random(500, 2000))

	-- ask the server for a free bed
	pendingBed = promise.new()
	TriggerServerEvent("DeathScript:Hospital:StartTreatment", location)
	SetTimeout(5000, function() if pendingBed then pendingBed:resolve(false) end end)
	local targetBedIndex = Citizen.Await(pendingBed)
	pendingBed = nil

	if not targetBedIndex then
		hospitalNotify("No available beds, please wait.", "error")
		startingMedicalTreatment = false
		DoScreenFadeIn(500)
		return false
	end

	LocalPlayer.state:set("hospitalised", true, true)

	SetTimeout(math.random(2000, 3500), function()
		if LocalPlayer.state.dead then Revive({ noAnim = true }) end
		local ped = PlayerPedId()
		local targetBed = SharedConfig.hospitalBeds[location][targetBedIndex]
		SetEntityCoords(ped, targetBed[1], targetBed[2], targetBed[3], false, false, false, false)
		SetEntityHeading(ped, targetBed[4])
		if LoadAnim("anim@gangops@morgue@table@") then
			TaskPlayAnim(ped, "anim@gangops@morgue@table@", "body_search", 1.0, -1.0, 80000, 1, 120, false, false, false)
		end
		Wait(2000)
		DoScreenFadeIn(500)
		Progress({ duration = 15000, label = "Getting Treatment..", useWhileDead = true, canCancel = false, disable = { car = true } })
		Progress({ duration = 5000, label = "Waking Up...", useWhileDead = true, canCancel = false,
			disable = { car = true, move = true, mouse = true, combat = true } })
		pcall(lib.alertDialog, {
			header = string.format("**%s**", location),
			content = "Please confirm you wish to be discharged.",
			centered = true,
			labels = { confirm = "Sign Discharge Papers" },
		})
		ped = PlayerPedId()
		SetEntityMaxHealth(ped, 200)
		SetEntityHealth(ped, 200)
		DoScreenFadeOut(600)
		SetTimeout(600, function()
			StopAnimTask(PlayerPedId(), "anim@gangops@morgue@table@", "body_search", 1.0)
			RemoveAnimDict("anim@gangops@morgue@table@")
			DoScreenFadeIn(600)
			LocalPlayer.state:set("hospitalised", nil, true)
			TriggerServerEvent("DeathScript:Hospital:FinishTreatment", location, targetBedIndex)
			startingMedicalTreatment = false
		end)
	end)
	return true
end

local function nearestHospitalName()
	local myCoords = GetEntityCoords(PlayerPedId())
	local nearest, nearestDistance
	for name, data in pairs(ClientConfig.hospitalLocations) do
		local pos = data.peds[1].pos
		local dist = #(myCoords - vector3(pos[1], pos[2], pos[3]))
		if not nearestDistance or dist < nearestDistance then nearest, nearestDistance = name, dist end
	end
	return nearest
end

exports("startMedicalTreatmentAtClosestHospital", function()
	local name = nearestHospitalName()
	if name then startMedicalTreatment(name) end
end)

RegisterNetEvent("DeathScript:startMedicalTreatmentAtClosestHospital", function()
	local name = nearestHospitalName()
	if name then startMedicalTreatment(name) end
end)

---------------------------------------------------------------- hospital workers (walk up + press E)

local spawnedPeds = {} -- ["location:index"] = { ped, blip, location }

local function spawnHospitalWorker(location, index)
	local key = location .. ":" .. index
	if spawnedPeds[key] then return end
	local pedData = ClientConfig.hospitalLocations[location].peds[index]
	local coords = pedData.pos
	local model = type(pedData.model) == "string" and GetHashKey(pedData.model) or pedData.model
	RequestModel(model)
	local untilAt = GetGameTimer() + 5000
	while not HasModelLoaded(model) and GetGameTimer() < untilAt do Wait(10) end
	if not HasModelLoaded(model) then return end
	local ped = CreatePed(28, model, coords[1], coords[2], coords[3] - 1.0, coords[4], false, true)
	SetModelAsNoLongerNeeded(model)
	SetEntityInvincible(ped, true)
	SetBlockingOfNonTemporaryEvents(ped, true)
	SetPedDefaultComponentVariation(ped)
	TaskStartScenarioInPlace(ped, pedData.scenario or "PROP_HUMAN_BUM_SHOPPING_CART", 0, true)
	FreezeEntityPosition(ped, true)

	local blip
	if pedData.blip then
		blip = AddBlipForEntity(ped)
		BeginTextCommandSetBlipName("STRING")
		AddTextComponentString("Hospital Staff")
		EndTextCommandSetBlipName(blip)
		SetBlipColour(blip, 43)
		SetBlipScale(blip, 0.7)
	end
	spawnedPeds[key] = { ped = ped, blip = blip, location = location, canTreat = pedData.blip == true }
end

local function deleteHospitalWorker(key)
	local entry = spawnedPeds[key]
	if not entry then return end
	if entry.blip and DoesBlipExist(entry.blip) then RemoveBlip(entry.blip) end
	if DoesEntityExist(entry.ped) then DeletePed(entry.ped) end
	spawnedPeds[key] = nil
end

-- spawn workers when you're close, remove them when you leave
CreateThread(function()
	while true do
		local coords = GetEntityCoords(PlayerPedId())
		for location, data in pairs(ClientConfig.hospitalLocations) do
			for index, pedData in ipairs(data.peds) do
				local near = #(coords - vector3(pedData.pos[1], pedData.pos[2], pedData.pos[3])) <= 65.0
				local key = location .. ":" .. index
				if near and not spawnedPeds[key] then
					spawnHospitalWorker(location, index)
				elseif not near and spawnedPeds[key] then
					deleteHospitalWorker(key)
				end
			end
		end
		Wait(1000)
	end
end)

local function help(text)
	BeginTextCommandDisplayHelp("STRING")
	AddTextComponentSubstringPlayerName(text)
	EndTextCommandDisplayHelp(0, false, false, -1)
end

-- "Get Medical Attention" and hospital beds: press E when close
local layingInBed = false
CreateThread(function()
	while true do
		local wait = 500
		local ped = PlayerPedId()
		local coords = GetEntityCoords(ped)

		if not startingMedicalTreatment then
			for _, entry in pairs(spawnedPeds) do
				if entry.canTreat and DoesEntityExist(entry.ped) and #(coords - GetEntityCoords(entry.ped)) <= 2.5 then
					wait = 0
					help("Press ~INPUT_CONTEXT~ to get medical attention")
					if IsControlJustReleased(0, 38) then
						if IsDragged() then StopDrag() end
						CreateThread(function() startMedicalTreatment(entry.location) end)
					end
					break
				end
			end
		end

		if wait ~= 0 and not LocalPlayer.state.dead then
			if layingInBed then
				wait = 0
				help("Press ~INPUT_CONTEXT~ to get out of bed")
				if IsControlJustReleased(0, 38) then
					StopAnimTask(ped, "anim@gangops@morgue@table@", "body_search", 1.0)
					RemoveAnimDict("anim@gangops@morgue@table@")
					layingInBed = false
					hospitalNotify("You have gotten out of bed.", "success")
				end
			else
				for _, model in ipairs(ClientConfig.hospitalBedModels) do
					local bed = GetClosestObjectOfType(coords.x, coords.y, coords.z, 2.0, model, false, false, false)
					if bed ~= 0 then
						wait = 0
						help("Press ~INPUT_CONTEXT~ to lay in bed")
						if IsControlJustReleased(0, 38) then
							local bedCoords = GetEntityCoords(bed)
							local bedHeading = GetEntityHeading(bed)
							bedHeading = bedHeading > 180 and bedHeading - 180.0 or bedHeading + 180.0
							SetEntityCoords(ped, bedCoords.x, bedCoords.y, bedCoords.z, false, false, false, false)
							SetEntityHeading(ped, bedHeading)
							if LoadAnim("anim@gangops@morgue@table@") then
								TaskPlayAnim(ped, "anim@gangops@morgue@table@", "body_search", 1.0, -1.0, 80000, 1, 120, false, false, false)
							end
							layingInBed = true
							hospitalNotify("You are laying in bed.", "success")
						end
						break
					end
				end
			end
		end
		Wait(wait)
	end
end)

AddEventHandler("onResourceStop", function(resource)
	if resource ~= GetCurrentResourceName() then return end
	for key in pairs(spawnedPeds) do deleteHospitalWorker(key) end
	HidePrompt()
end)
