local Config = require 'shared.import'
local Settings = Config.settings
local M = Config.menus

local AllMenus = {}

local bannerTxd = CreateRuntimeTxd('fbrp_menubanner')
CreateRuntimeTextureFromImage(bannerTxd, 'banner', 'banner.png')
local function textHeader(menu)
	AllMenus[#AllMenus + 1] = menu
	menu.Sprite = { Dictionary = 'fbrp_menubanner', Texture = 'banner', Color = { R = 255, G = 255, B = 255, A = 255 } }
	menu.Rectangle = nil
	menu.Title = ''
	return menu
end

local function subMenu(parent, subtitle)
	return textHeader(RageUI.CreateSubMenu(parent, ' ', subtitle or ''))
end

local MainMenu = textHeader(RageUI.CreateMenu(' ', M.title, Settings.menuX, Settings.menuY))
local Menu_Packs = subMenu(MainMenu, M.donatorPacks)
local Menu_FreeCars = subMenu(MainMenu, M.freeVehicles)
local Menu_Menus = subMenu(MainMenu, M.donatorMenus)
local Menu_OwnerKeys = subMenu(MainMenu, M.ownerKeys)
local Menu_OwnerFleet = subMenu(MainMenu, M.ownerFleet)

local MENU_WIDTH = 431
local function menuPosition()
	if Settings.menuCentered == false then return Settings.menuX, Settings.menuY end
	local sz = GetSafeZoneSize()
	local inset = (1.0 - sz) / 2
	local x = (1920 * sz - MENU_WIDTH) / 2
	local y = (Settings.menuTop or 110) - inset * 1080
	return math.floor(x), math.floor(math.max(0, y))
end

local function placeMenus()
	local x, y = menuPosition()
	for _, menu in ipairs(AllMenus) do menu.X, menu.Y = x, y end
end

local STORE = (M.storeLine):format(Settings.storeUrl)
local DEVOPS_STORE = (M.storeLine):format(Settings.devopsStoreUrl)

local Vehicles = {}
local Permissions = {}

local validCategories = {}
local validOwnerKeysCategories = {}

local MenuHandles = {
	['public'] = {},
	['ownerkeys'] = {},
}

function RageUI.PoolMenus:FbrpDonator()
	MainMenu:IsVisible(
		function(Items)
			Items:AddButton(
				M.freeVehicles,
				M.freeVehiclesDesc,
				{ RightLabel = '→', IsDisabled = false },
				function()
				end,
				Menu_FreeCars
			)

			Items:AddButton(
				M.donatorPacks,
				M.donatorPacksDesc,
				{ RightLabel = '→', IsDisabled = false },
				function()
				end,
				Menu_Packs
			)

			Items:AddButton(
				M.donatorMenus,
				M.donatorMenusDesc,
				{ RightLabel = '→', IsDisabled = false },
				function()
				end,
				Menu_Menus
			)

			local ownerKeysData = Config.core[2]
			local hasOwnerKeys = Permissions?[ownerKeysData.id]
			Items:AddButton(
				hasOwnerKeys and M.ownerKeys or ('~r~' .. M.ownerKeys),
				hasOwnerKeys and M.ownerKeysDesc or
				M.noPermissionPack .. STORE,
				{
					RightLabel = hasOwnerKeys and ownerKeysData.emoji or '',
					IsDisabled = not hasOwnerKeys,
				},
				function()
				end,
				Menu_OwnerKeys
			)

			-- Owner fleet: not drawn at all unless the server says this player holds one of its roles.
			if Permissions?['ownerfleet'] then
				Items:AddButton(
					M.ownerFleet,
					M.ownerFleetDesc,
					{ RightLabel = '→', IsDisabled = false },
					function()
					end,
					Menu_OwnerFleet
				)
			end

		end,
		function()
		end
	)

	Menu_OwnerFleet:IsVisible(
		function(Items)
			local thisVehicles = Vehicles['ownerfleet'] or {}
			if not Permissions?['ownerfleet'] or #thisVehicles == 0 then
				Items:AddButton(M.noVehicles, '', { IsDisabled = true })
			else
				table.sort(thisVehicles, function(a, b) return a.name:lower() < b.name:lower() end)
				for _, vehicleData in pairs(thisVehicles) do
					if IsModelValid(vehicleData.spawnCode) then
						Items:AddButton(
							vehicleData.name,
							('Spawn: %s'):format(vehicleData.name),
							{ IsDisabled = false },
							function(onSelected)
								if onSelected then
									CreateThread(function()
										spawnVehicle(vehicleData)
									end)
								end
							end
						)
					end
				end
			end
		end,
		function() end
	)

	Menu_OwnerKeys:IsVisible(
        function(Items)
            local thisVehicles = Vehicles['ownerkeys'] or {}
            if #thisVehicles == 0 then
                Items:AddButton(M.noVehicles, '', { IsDisabled = true })
            else
                for _, vehicleData in pairs(thisVehicles) do
                    if IsModelValid(vehicleData.spawnCode) then
                        local vehicleHash = GetHashKey(vehicleData.spawnCode)
                        local vehicleClass = GetVehicleClassFromName(vehicleHash)
                        local vehicleClassLabel = GetFilenameForAudioConversation(('VEH_CLASS_%s'):format(vehicleClass))
                        if not MenuHandles['ownerkeys'][vehicleClassLabel] then
                            MenuHandles['ownerkeys'][vehicleClassLabel] = subMenu(Menu_OwnerKeys, vehicleClassLabel)
                            validOwnerKeysCategories[vehicleClassLabel] = true
                        end
                    end
                end

                local sortedCategories = {}
                for category in pairs(validOwnerKeysCategories) do
                    table.insert(sortedCategories, category)
                end
                table.sort(sortedCategories, function(a, b) return a < b end)

                for _, category in ipairs(sortedCategories) do
                    Items:AddButton(
                        category,
                        '',
                        { RightLabel = '→', IsDisabled = false },
                        function() end,
                        MenuHandles['ownerkeys'][category]
                    )
                end
            end
        end,
        function() end
    )

    for category, _ in pairs(validOwnerKeysCategories) do
        MenuHandles['ownerkeys'][category]:IsVisible(
            function(Items)
                local thisVehicles = Vehicles['ownerkeys'] or {}
                table.sort(thisVehicles, function(a, b) return a.name:lower() < b.name:lower() end)

                for _, vehicleData in pairs(thisVehicles) do
                    if IsModelValid(vehicleData.spawnCode) then
                        local vehicleHash = GetHashKey(vehicleData.spawnCode)
                        local vehicleClass = GetVehicleClassFromName(vehicleHash)
                        local vehicleClassLabel = GetFilenameForAudioConversation(('VEH_CLASS_%s'):format(vehicleClass))
                        if vehicleClassLabel == category then
                            Items:AddButton(
                                vehicleData.name,
                                '',
                                { IsDisabled = false },
                                function(onSelected)
                                    if onSelected then
                                        CreateThread(function()
                                            spawnVehicle(vehicleData)
                                        end)
                                    end
                                end
                            )
                        end
                    end
                end
            end,
            function() end
        )
    end

	Menu_FreeCars:IsVisible(
		function(Items)
			local thisVehicles = Vehicles['public'] or {}
			if #thisVehicles == 0 then
				Items:AddButton(
					M.noVehicles,
					'',
					{ IsDisabled = true }
				)
			else
				for _, vehicleData in pairs(thisVehicles) do
					if IsModelValid(vehicleData.spawnCode) then
						local vehicleHash = GetHashKey(vehicleData.spawnCode)
						local vehicleClass = GetVehicleClassFromName(vehicleHash)
						local vehicleClassLabel = GetFilenameForAudioConversation(('VEH_CLASS_%s'):format(vehicleClass))
						if not MenuHandles['public'][vehicleClassLabel] then
							MenuHandles['public'][vehicleClassLabel] = subMenu(Menu_FreeCars, vehicleClassLabel)
						end
						validCategories[vehicleClassLabel] = true
					end
				end

				local sortedCategories = {}
				for category in pairs(validCategories) do
					table.insert(sortedCategories, category)
				end

				table.sort(sortedCategories, function(a, b)
					return a < b
				end)

				for _, category in ipairs(sortedCategories) do
					Items:AddButton(
						category,
						'',
						{ RightLabel = '→', IsDisabled = false },
						function()
						end,
						MenuHandles['public'][category]
					)
				end
			end
		end,
		function()
		end
	)

	for category, _ in pairs(validCategories) do
		MenuHandles['public'][category]:IsVisible(
			function(Items)
				local thisVehicles = Vehicles['public'] or {}
				table.sort(thisVehicles, function(a, b)
					return a.name:lower() < b.name:lower()
				end)

				for _, vehicleData in pairs(thisVehicles) do
					if IsModelValid(vehicleData.spawnCode) then
						local vehicleHash = GetHashKey(vehicleData.spawnCode)
						local vehicleClass = GetVehicleClassFromName(vehicleHash)
						local vehicleClassLabel = GetFilenameForAudioConversation(('VEH_CLASS_%s'):format(vehicleClass))
						if vehicleClassLabel == category then
							Items:AddButton(
								vehicleData.name,
								'',
								{ IsDisabled = false },
								function(onSelected)
									if onSelected then
										CreateThread(function()
											spawnVehicle(vehicleData)
										end)
									end
								end
							)
						end
					end
				end
			end,
			function()
			end
		)
	end

	Menu_Packs:IsVisible(
		function(Items)
			do
				local packConfig = Config.packs
				table.sort(packConfig, function(a, b)
					return a.label < b.label
				end)
				for _, packData in pairs(packConfig) do
					if Permissions[packData.id] then
						local packName = ('~y~%s'):format(packData.label)
						Items:AddButton(
							packName,
							packData.description or ('Access %s'):format(packName),
							{ RightLabel = '→', IsDisabled = false },
							function()
							end,
							MenuHandles[packData.id]
						)
					else
						local packName = ('~r~%s'):format(packData.label)
						local packDesc = ('%s%s'):format(
							M.noPermissionPack,
							packData.notStoreItem and '' or STORE
						)
						Items:AddButton(
							packName,
							packDesc,
							{ IsDisabled = true }
						)
					end
				end
			end
		end,
		function()
		end
	)

	Menu_Menus:IsVisible(
		function(Items)
			do
				local shortcutConfig = Config.shortcuts
				table.sort(shortcutConfig, function(a, b)
					return a.label < b.label
				end)
				for _, shortcutData in pairs(shortcutConfig) do
					if Permissions[shortcutData.id] then
						local shortcutName = ('~y~%s'):format(shortcutData.label)
						Items:AddButton(
							shortcutName,
							shortcutData.description or ('Access %s'):format(shortcutName),
							{ IsDisabled = false },
							function(onSelected)
								if onSelected then
									CreateThread(function()
										RageUI.CloseAll()
										if shortcutData.command then
											ExecuteCommand(shortcutData.command)
										elseif shortcutData.event then
											TriggerEvent(shortcutData.event)
										end
									end)
								end
							end
						)
					else
						local shortcutName = ('~r~%s'):format(shortcutData.label)
						local shortCutDesc = ('%s%s'):format(
							M.noPermissionMenu,
							shortcutData.devops and DEVOPS_STORE or STORE
						)
						Items:AddButton(
							shortcutName,
							shortCutDesc,
							{ IsDisabled = true }
						)
					end
				end
			end
		end,
		function()
		end
	)

	for role, handle in pairs(MenuHandles) do
		if handle then
			if role ~= 'public' and role ~= 'ownerkeys' and role ~= 'ownerfleet' then
				handle:IsVisible(
					function(Items)
						local thisVehicles = Vehicles[role] or {}
						if #thisVehicles == 0 then
							Items:AddButton(
								M.noVehicles,
								'',
								{ IsDisabled = true }
							)
						else
							for _, vehicleData in pairs(thisVehicles) do
								if IsModelValid(vehicleData.spawnCode) then
									local vehicleHash = GetHashKey(vehicleData.spawnCode)
									local vehicleClass = GetVehicleClassFromName(vehicleHash)
									local vehicleClassLabel = GetFilenameForAudioConversation(('VEH_CLASS_%s'):format(
										vehicleClass))
									Items:AddButton(
										('(%s) %s'):format(vehicleClassLabel, vehicleData.name),
										('Spawn: %s'):format(vehicleData.name),
										{ IsDisabled = false },
										function(onSelected)
											if onSelected then
												CreateThread(function()
													spawnVehicle(vehicleData)
												end)
											end
										end
									)
								end
							end
						end
					end,
					function()
					end
				)
			end
		end
	end
end

RegisterCommand(
	'f6menu',
	function()
		if isRestrained() then
			Notify('You cannot open the F6 Menu while restrained!', 'error')
			return
		end
		local open = not RageUI.Visible(MainMenu)
		if open then
			placeMenus()
			TriggerServerEvent('F6Menu:Server:UpdateVehicles')
		end
		RageUI.Visible(MainMenu, open)
	end,
	false
)

TriggerEvent('chat:addSuggestion', '/f6menu', 'Opens the donator menu (F5)')
RegisterKeyMapping('f6menu', 'Donator Menu', 'keyboard', 'F5')

RegisterNetEvent('vanity:marketplace:client:itemPurchased', function()
	print('Triggered F6 permission refresh due to item purchase from marketplace.')
	TriggerServerEvent('F6Menu:Server:UpdateVehicles')
end)

RegisterNetEvent('F6Menu:Client:UpdateVehicles', function(vehicleData, permissions)
	Log.info('Received updated vehicles from server.')

	Vehicles = type(vehicleData) == 'table' and vehicleData or {}
	Permissions = type(permissions) == 'table' and permissions or {}

	for role, _ in pairs(Vehicles) do
		if role ~= 'public' and role ~= 'ownerkeys' and role ~= 'ownerfleet' and not MenuHandles[role] then
			local menuName = getMenuNameFromRole(role)
			MenuHandles[role] = subMenu(Menu_Packs, menuName)
			Log.debug(('Created sub-menu for role %s with name %s'):format(role, menuName))
		end

		table.sort(Vehicles[role], function(a, b)
			local spawnCodeA = a.spawnCode or ''
			local spawnCodeB = b.spawnCode or ''
			local vehicleHashA = GetHashKey(spawnCodeA)
			local vehicleHashB = GetHashKey(spawnCodeB)
			local validA = IsModelValid(vehicleHashA)
			local validB = IsModelValid(vehicleHashB)
			if validA and not validB then
				return true
			elseif not validA and validB then
				return false
			elseif not validA and not validB then
				return (a.name or "") < (b.name or "")
			end
			local vehicleClassA = GetVehicleClassFromName(vehicleHashA)
			local vehicleClassB = GetVehicleClassFromName(vehicleHashB)
			local vehicleClassLabelA = GetFilenameForAudioConversation(('VEH_CLASS_%s'):format(vehicleClassA))
			local vehicleClassLabelB = GetFilenameForAudioConversation(('VEH_CLASS_%s'):format(vehicleClassB))
			local newNameA = ('(%s) %s'):format(vehicleClassLabelA, a.name)
			local newNameB = ('(%s) %s'):format(vehicleClassLabelB, b.name)
			return newNameA < newNameB
		end)
	end

	local publicList = Vehicles['public'] or {}
	Vehicles['public'] = publicList
	for i = #publicList, 1, -1 do
		local vehicle = publicList[i]
		local lowerName = tostring(vehicle.name or ''):lower()
		local lowerSpawnCode = tostring(vehicle.spawnCode or ''):lower()
		if lowerName == lowerSpawnCode then
			table.remove(publicList, i)
		end
	end
end)

CreateThread(function()
	Wait(1500)
	TriggerServerEvent('F6Menu:Server:UpdateVehicles')
end)
