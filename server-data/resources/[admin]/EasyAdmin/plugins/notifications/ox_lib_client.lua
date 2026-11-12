--
-- ox_lib notification plugin for EasyAdmin
-- Routes every EasyAdmin notification through ox_lib and cancels the
-- default GTA feed notification, so ox_lib is the only notification output.
-- Kept as a plugin so it survives EasyAdmin updates (which overwrite core files).
--

-- Tell EasyAdmin to not draw its default notification.
AddEventHandler("EasyAdmin:receivedNotification", function()
	if GetResourceState("ox_lib") == "started" then
		CancelEvent()
	end
end)

AddEventHandler("EasyAdmin:showNotification", function(text, important)
	if GetResourceState("ox_lib") == "started" then
		-- strip GTA color codes (~r~, ~b~, ~h~, etc.) since ox_lib doesn't render them
		local cleanText = tostring(text):gsub("~[%w_]*~", ""):gsub("%^%d", "")
		exports.ox_lib:notify({
			title = "EasyAdmin",
			description = cleanText,
			type = important and "error" or "inform",
			position = "center-right",
			duration = important and 8000 or 5000
		})
	end
end)
