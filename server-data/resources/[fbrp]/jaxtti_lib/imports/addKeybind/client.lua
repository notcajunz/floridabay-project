local function getCurrentKey(self)
    return GetControlInstructionalButton(0, joaat('+' .. self.name) | 0x80000000, true):sub(3)
end

local function disable(self, toggle)
    self.disabled = toggle
end

return function(data)
    if not data.name then error('lib.addKeybind: name is required', 2) end
    data.isPressed = false
    data.disable = disable
    data.getCurrentKey = getCurrentKey

    RegisterCommand('+' .. data.name, function()
        if data.disabled or IsPauseMenuActive() then return end
        data.isPressed = true
        if data.onPressed then data:onPressed() end
    end, false)

    RegisterCommand('-' .. data.name, function()
        if not data.isPressed then return end
        data.isPressed = false
        if data.disabled or IsPauseMenuActive() then return end
        if data.onReleased then data:onReleased() end
    end, false)

    RegisterKeyMapping('+' .. data.name, data.description or data.name, data.defaultMapper or 'keyboard', data.defaultKey or '')

    SetTimeout(500, function()
        TriggerEvent('chat:removeSuggestion', '/+' .. data.name)
        TriggerEvent('chat:removeSuggestion', '/-' .. data.name)
    end)

    return data
end
