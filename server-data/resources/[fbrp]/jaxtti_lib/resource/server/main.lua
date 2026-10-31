local function principal(p)
    if type(p) == 'number' then return ('player.%s'):format(p) end
    return p
end

exports('addAce', function(p, ace, allow)
    ExecuteCommand(('add_ace %s %s %s'):format(principal(p), ace, allow == false and 'deny' or 'allow'))
end)

exports('removeAce', function(p, ace, allow)
    ExecuteCommand(('remove_ace %s %s %s'):format(principal(p), ace, allow == false and 'deny' or 'allow'))
end)

exports('addPrincipal', function(child, parent)
    ExecuteCommand(('add_principal %s %s'):format(principal(child), principal(parent)))
end)

exports('removePrincipal', function(child, parent)
    ExecuteCommand(('remove_principal %s %s'):format(principal(child), principal(parent)))
end)

local suggestions = {}

exports('registerSuggestions', function(resource, list)
    suggestions[resource] = list
    for _, playerId in ipairs(GetPlayers()) do
        TriggerEvent('jaxtti_lib:sendSuggestions', tonumber(playerId))
    end
end)

local function sendSuggestions(playerId)
    local out = {}
    for _, list in pairs(suggestions) do
        for _, s in ipairs(list) do
            if not s.restricted or IsPlayerAceAllowed(playerId, ('command.%s'):format(s.name)) then
                out[#out + 1] = { name = '/' .. s.name, help = s.help, params = s.params }
            end
        end
    end
    if #out > 0 then TriggerClientEvent('chat:addSuggestions', playerId, out) end
end

AddEventHandler('jaxtti_lib:sendSuggestions', sendSuggestions)
AddEventHandler('playerJoining', function() sendSuggestions(source) end)

AddEventHandler('onResourceStop', function(resource)
    suggestions[resource] = nil
end)

CreateThread(function()
    print(('^4[jaxtti_lib]^0 v%s started'):format(GetResourceMetadata(GetCurrentResourceName(), 'version', 0) or '?'))
end)
