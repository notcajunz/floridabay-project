--
-- FBRP patch: vMenuClient.net.dll triggers 'vmenu:oxnotif' (renamed from
-- 'ox_lib:notify' via binary string patch) so we can control the notification
-- position here before forwarding to ox_lib.
--
local NOTIFY_POSITION = 'center-right'

AddEventHandler('vmenu:oxnotif', function(data)
    if type(data) ~= 'table' then
        data = { description = tostring(data) }
    end
    data.position = NOTIFY_POSITION
    exports.ox_lib:notify(data)
end)
