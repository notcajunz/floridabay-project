Locale = {}
Keys = { -- Who doesnt love a big old table of keys.
    [","] = 82, ["-"] = 84, ["."] = 81, ["1"] = 157, ["2"] = 158, ["3"] = 160, ["4"] = 164, ["5"] = 165, ["6"] = 159, ["7"] = 161,
    ["8"] = 162, ["9"] = 163, ["="] = 83, ["["] = 39, ["]"] = 40, ["A"] = 34, ["B"] = 29, ["BACKSPACE"] = 177, ["C"] = 26, ["CAPS"] = 137,
    ["D"] = 9, ["DELETE"] = 178, ["UP"] = 172, ["DOWN"] = 173, ["E"] = 38, ["ENTER"] = 18, ["ESC"] = 322, ["F"] = 23, ["F1"] = 288, ["F10"] = 57, ["F2"] = 289,
    ["F3"] = 170, ["F5"] = 166, ["F6"] = 167, ["F7"] = 168, ["F8"] = 169, ["F9"] = 56, ["G"] = 47, ["H"] = 74, ["HOME"] = 213, ["K"] = 311,
    ["L"] = 182, ["LEFT"] = 174, ["LEFTALT"] = 19, ["LEFTCTRL"] = 36, ["LEFTSHIFT"] = 21, ["M"] = 244, ["N"] = 249, ["N+"] = 96, ["N-"] = 97,
    ["N4"] = 108, ["N5"] = 60, ["N6"] = 107, ["N7"] = 117, ["N8"] = 61, ["N9"] = 118, ["NENTER"] = 201, ["P"] = 199, ["PAGEDOWN"] = 11,
    ["PAGEUP"] = 10, ["Q"] = 44, ["R"] = 45, ["RIGHT"] = 175, ["RIGHTCTRL"] = 70, ["S"] = 8, ["SPACE"] = 22, ["T"] = 245, ["TAB"] = 37,
    ["TOP"] = 27, ["U"] = 303, ["V"] = 0, ["W"] = 32, ["X"] = 73, ["Y"] = 246, ["Z"] = 20, ["~"] = 243,
}

function log(l) -- Just a simple logging thing, to easily log all kinds of stuff.
	if l == nil then print("nil") return end
	if not Config.Debug then return end
	if type(l) == "table" then print(json.encode(l)) elseif type(l) == "boolean" then print(l) else print(l.." | "..type(l)) end
end

function GetKey(str)
	local Key = Keys[string.upper(str)]
	if Key then return Key else return false end
end

function IncurCooldown(ms)
	Citizen.CreateThread(function()
		Cooldown = true Wait(ms) Cooldown = false
	end)
end

-- This is my old implementation, unsure if its any better than above though, not sure if creating a thread as often as we do above is good? Time will tell i suppose.

--function IncurCooldown(ms)
--	Cooldown = ms
--end
--Citizen.CreateThread(function()
--	while true do Wait(500)
--		if Cooldown then
--			Wait(Cooldown)
--			Cooldown = false
--		end
--	end
--end)

function PairsKeys(t, f)
	local a = {}
	for n in pairs(t) do table.insert(a, n) end
	table.sort(a, f)
	local i = 0
	local iter = function ()
		i = i + 1
		if a[i] == nil then return nil
		else return a[i], t[a[i]] end
	end
	return iter
end

function Text(x, y, scale, text, colour, align, force, w)
	local align = align or 0
	local colour = colour or Config.GUI.TextColor
	SetTextFont(Config.GUI.TextFont)
	SetTextJustification(align)
	SetTextScale(scale, scale)
	SetTextColour(colour[1], colour[2], colour[3], 255)
	if Config.GUI.TextOutline then SetTextOutline() end
	if w then SetTextWrap(w.x, w.y) end
	SetTextEntry("STRING")
	AddTextComponentString(text)
	DrawText(x,y)
end

function FirstUpper(str)
	return (str:gsub("^%l", string.upper))
end

function Lang(what)
	local Dict = Locale[Config.Language]
	if not Dict[what] then return Locale["en"][what] end -- If we cant find a translation, use the english one.
	return Dict[what]
end

function Notify(message, tone)
	-- Use the server-wide notification UI so clothing messages look and behave
	-- like every other Florida Bay interaction.
	TriggerEvent('fbrp:notify', message, tone or 'info')
end

function IsMpPed(ped)
	local Male = GetHashKey("mp_m_freemode_01") local Female = GetHashKey("mp_f_freemode_01")
	local CurrentModel = GetEntityModel(ped)
	if CurrentModel == Male then return "Male" elseif CurrentModel == Female then return "Female" else return false end
end

function ComponentTexture(ped, component, drawable, texture)
	local count = GetNumberOfPedTextureVariations(ped, component, drawable)
	if not count or count < 1 then return 0 end
	return math.max(0, math.min(tonumber(texture) or 0, count - 1))
end

function PropTexture(ped, prop, drawable, texture)
	local count = GetNumberOfPedPropTextureVariations(ped, prop, drawable)
	if not count or count < 1 then return 0 end
	return math.max(0, math.min(tonumber(texture) or 0, count - 1))
end

function CanUseClothing(ped)
	ped = ped or PlayerPedId()
	return ped ~= 0 and not IsEntityDead(ped)
		and not LocalPlayer.state['fbrp:downed']
		and not LocalPlayer.state['fbrp:restrained']
		and not LocalPlayer.state['fbrp:jailed']
		and not LocalPlayer.state['fbrp:communityService']
end

--[[
		Some events that might be useful for external use.
		You can trigger em with TriggerEvent("EventName").
		I was thinking about making them exports, but this is easier, if thats wrong and exports are better for some reason let me know.
]]--

--[[
		[dpc:EquipLast]
		This event will remove all saved clothes from the client.
		And put them back on the players model.
		You should use this in your own / other external scripts whenever the player :
		Eenter a clothing store, enter a barber shop, and many other uses i maybe havent though of.
		Of course you dont have to do that, but it makes the player experience better.
		Otherwise they might for example "save" a hat, then go to a clothing store and change the hat, then when using /hat it puts on the hat they had before they paid for their new hat.
]]--

RegisterNetEvent('dpc:EquipLast')
AddEventHandler('dpc:EquipLast', function()
	local Ped = PlayerPedId()
	for k,v in pairs(LastEquipped) do
		if v then
			if v.Drawable then SetPedComponentVariation(Ped, v.Id, v.Drawable, v.Texture, 0)
			elseif v.Prop then ClearPedProp(Ped, v.Id) SetPedPropIndex(Ped, v.Id, v.Prop, v.Texture, true) end
		end
	end
	LastEquipped = {}
end)

--[[
		[dpc:ResetClothing]
		Same deal as above but instead of equipping the stuff, it just clears the lastequipped.
		Useful for when you change a players model.
]]--

RegisterNetEvent('dpc:ResetClothing')
AddEventHandler('dpc:ResetClothing', function()
	LastEquipped = {}
	MenuOpened = false
end)

-- Character/model and server-owned outfit changes invalidate saved drawable
-- indexes. Clearing them prevents a later toggle from restoring a piece from
-- the previous character, prison outfit, organization uniform, or vMenu ped.
AddEventHandler('playerSpawned', function() TriggerEvent('dpc:ResetClothing') end)
AddEventHandler('fbrp:characterSpawned', function() TriggerEvent('dpc:ResetClothing') end)
AddEventHandler('fbrp:appearanceChanged', function() TriggerEvent('dpc:ResetClothing') end)

Citizen.CreateThread(function()
	local ped = PlayerPedId()
	local model = GetEntityModel(ped)
	while true do
		Wait(750)
		local nextPed = PlayerPedId()
		local nextModel = GetEntityModel(nextPed)
		if nextPed ~= ped or nextModel ~= model then
			ped, model = nextPed, nextModel
			TriggerEvent('dpc:ResetClothing')
		else
			-- vMenu and other appearance resources do not publish an outfit-change
			-- event. If one replaces a piece while dpClothing has it toggled,
			-- forget only that saved piece instead of later restoring stale clothes.
			for name, saved in pairs(LastEquipped) do
				if saved and saved.ExpectedDrawable ~= nil then
					local drawable = GetPedDrawableVariation(ped, saved.Id)
					local texture = GetPedTextureVariation(ped, saved.Id)
					if drawable ~= saved.ExpectedDrawable or texture ~= saved.ExpectedTexture then LastEquipped[name] = nil end
				elseif saved and saved.ExpectedProp ~= nil and GetPedPropIndex(ped, saved.Id) ~= saved.ExpectedProp then
					LastEquipped[name] = nil
				end
			end
		end
	end
end)

--[[
		[dpc:ToggleMenu]
		Toggle the clothing menu off/on
]]--

RegisterNetEvent('dpc:ToggleMenu')
AddEventHandler('dpc:ToggleMenu', function()
	if not CanUseClothing() then MenuOpened = false return end
	MenuOpened = not MenuOpened
	if MenuOpened then SoundPlay("Open") SetCursorLocation(Config.GUI.Position.x, Config.GUI.Position.y) else SoundPlay("Close") end
end)

--[[
		[dpc:Menu]
		Changes status of the clothing menu.
]]--

RegisterNetEvent('dpc:Menu')
AddEventHandler('dpc:Menu', function(status)
	MenuOpened = status == true and CanUseClothing()
	if MenuOpened then SoundPlay("Open") else SoundPlay("Close") end
end)
